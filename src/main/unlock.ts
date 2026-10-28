import {
  getLockRemainingMs,
  loadAuthState,
  registerFailedAttempt,
  statusFrom,
} from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { formatCountdown, isMasterPasswordFormat, isPinFormat } from '@zero/shared';
import type { VaultContainerData } from '@zero/main/container';
import type { UnlockInput, VaultResult } from '@zero/types';

/**
 * Estado que corre pela cadeia: cada manipulador lê o que o anterior deixou e
 * pode encerrar a sequência devolvendo a resposta de falha.
 */
export interface UnlockContext {
  readonly input: UnlockInput;
  readonly container: VaultContainerData;
  /** Chave de trabalho derivada pelo manipulador de KDF. */
  derived?: Buffer | undefined;
  /** Chave do cofre liberada quando a cadeia chega ao fim. */
  vaultKey?: Buffer | undefined;
  /** O método usado estava no embrulho legado da v5 (candidato a migração). */
  legacyMethod?: boolean | undefined;
  /**
   * A falha da senha mestra cruzou o limite de autodestruição. A cadeia para
   * aí, sem passar pelo Argon2id e sem tocar no manifesto, mas quem chamou
   * precisa saber que o corte aconteceu para disparar o erase.
   */
  nuked?: boolean;
}

/**
 * Resposta de um manipulador: `null` segue a cadeia, `undefined` corta a
 * sequência sem resposta (o corte da autodestruição) e o resto encerra o
 * desbloqueio.
 */
export type HandlerOutcome = VaultResult | null | undefined;

/**
 * Manipulador da cadeia (Chain of Responsibility): devolve `null` para passar a
 * requisição adiante, `undefined` para parar sem resposta, ou a resposta que
 * encerra o desbloqueio.
 */
export abstract class UnlockHandler {
  private next: UnlockHandler | null = null;

  /** Encadeia o próximo manipulador e o devolve (leitura de baixo para cima). */
  public setNext(handler: UnlockHandler): UnlockHandler {
    this.next = handler;
    return handler;
  }

  public async handle(context: UnlockContext): Promise<VaultResult | null> {
    const outcome = await this.process(context);
    if (outcome !== null || this.next === null) return outcome ?? null;
    return this.next.handle(context);
  }

  protected abstract process(context: UnlockContext): HandlerOutcome | Promise<HandlerOutcome>;
}

function wrongCredentialError(kind: UnlockInput['kind']): string {
  const m = currentMessages();
  if (kind === 'master') return m.errors.wrongMaster;
  return m.errors.wrongPin;
}

/**
 * Credencial recusada: conta na trava exponencial e responde com o mesmo erro
 * de credencial errada, sem ecoar o valor digitado. Devolve `undefined` quando a
 * falha da senha mestra cruzou o limite de autodestruição: na cadeia, `null`
 * significa "passe adiante" e `undefined` significa "pare", então o corte
 * interrompe a sequência antes do Argon2id em vez de deixá-la seguir e contar a
 * mesma tentativa duas vezes.
 */
function credentialFailure(context: UnlockContext): HandlerOutcome {
  const { state, crossed } = registerFailedAttempt(context.input.kind, context.container.nukeLimit);
  if (crossed) {
    context.nuked = true;
    return undefined;
  }
  return {
    ok: false,
    error: wrongCredentialError(context.input.kind),
    status: statusFrom(state, true, true),
  };
}

/** 1. Trava exponencial: a espera vale antes de qualquer derivação. */
class ExponentialLockoutHandler extends UnlockHandler {
  protected process(): HandlerOutcome {
    const auth = loadAuthState();
    const remaining = getLockRemainingMs(auth);
    if (remaining <= 0) return null;
    const m = currentMessages();
    // quem está esperando não gasta nova tentativa: a trava não é punição nova
    return {
      ok: false,
      error: m.auth.lockout(formatCountdown(remaining)),
      status: statusFrom(auth, vaultStorage.exists(), true),
    };
  }
}

/** 2. Formato: PIN de 3 dígitos não deve custar 256 MB de Argon2id. */
class FormatValidatorHandler extends UnlockHandler {
  protected process(context: UnlockContext): HandlerOutcome {
    const { kind, credential } = context.input;
    const valid = kind === 'pin' ? isPinFormat(credential) : isMasterPasswordFormat(credential);
    if (valid) return null;
    // malformada é credencial errada: mesma resposta de sempre, só mais barata
    return credentialFailure(context);
  }
}

/** 3. Derivação Argon2id: o passo caro do desbloqueio. */
class KdfDerivationHandler extends UnlockHandler {
  protected async process(context: UnlockContext): Promise<HandlerOutcome> {
    const { kind, credential } = context.input;
    const method = context.container.methods[kind];
    if (method === undefined) return credentialFailure(context);
    try {
      context.derived = await keyUnwrapperFor(kind).derive(method, credential);
    } catch {
      return credentialFailure(context);
    }
    return null;
  }
}

/**
 * 4. Integridade: o payload do container precisa abrir em uma chave de 32
 * bytes; qualquer forma estranha é o mesmo erro único de credencial errada.
 */
class VaultIntegrityHandler extends UnlockHandler {
  protected process(context: UnlockContext): HandlerOutcome {
    const { kind } = context.input;
    const method = context.container.methods[kind];
    const derived = context.derived;
    /* v8 ignore next -- o elo anterior (KDF) já recusou a credencial quando o
       método ou a chave derivada faltavam; esta guarda é a rede de integridade,
       e um container sem o método do tipo só chega aqui por defeito interno. */
    if (method === undefined || derived === undefined) return credentialFailure(context);
    try {
      const unwrapped = keyUnwrapperFor(kind).unwrapDetailed(method, derived);
      context.vaultKey = unwrapped.vaultKey;
      context.legacyMethod = unwrapped.legacy;
      return null;
    } catch {
      return credentialFailure(context);
    } finally {
      derived.fill(0);
      context.derived = undefined;
    }
  }
}

/**
 * Cadeia de desbloqueio na ordem em que o custo cresce: trava barata corta
 * antes da validação de formato, que corta antes do Argon2id.
 */
export function unlockPipeline(): UnlockHandler {
  const lockout = new ExponentialLockoutHandler();
  lockout
    .setNext(new FormatValidatorHandler())
    .setNext(new KdfDerivationHandler())
    .setNext(new VaultIntegrityHandler());
  return lockout;
}

/** Roda a cadeia: `null` significa que a chave foi liberada para a sessão. */
export async function runUnlockChain(context: UnlockContext): Promise<VaultResult | null> {
  return unlockPipeline().handle(context);
}
