import {
  decryptRecord,
  deriveKey,
  encryptRecord,
  isSameKdf,
  kdfProfileFor,
  randomBytes,
} from '@zero/main/crypto';
import type { VaultKdfParams, WrappedMethod } from '@zero/main/container';
import { methodKeyInfo } from '@zero/main/crypto-constants';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';
import type { UnlockKind } from '@zero/types';

/** Todo método que embrulha a chave, inclusive a frase e o PIN de coação. */
export type CredentialKind = UnlockKind | 'recovery' | 'panic';

/**
 * Embrulho/desembrulho da chave do cofre (Strategy por tipo de credencial):
 * cada método tem o custo do Argon2id adequado ao segredo que o protege.
 */
export interface KeyUnwrapper {
  readonly kind: CredentialKind;
  /** Custo do Argon2id deste método (lido do container, na prática). */
  readonly kdf: VaultKdfParams;
  /** Embrulha a chave de 32 bytes para o container. */
  wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod>;
  /** Chave de trabalho derivada do salt gravado no container. */
  derive(method: WrappedMethod, credential: string): Promise<Buffer>;
  /** Desembrulha a chave do cofre; credencial errada lança (GCM). */
  unwrap(method: WrappedMethod, derived: Buffer): Buffer;
}

/**
 * Custo do Argon2id para um método de desbloqueio: o PIN de 8 dígitos é o
 * segredo fraco (10^8 candidatas offline) e por isso recebe o perfil mais caro;
 * senha mestra e frase de recuperação têm entropia própria, um nível abaixo.
 * O PIN de pânico é o mesmo formato do PIN e recebe o mesmo custo de Argon2id
 * por derivação. O tempo total do caminho de pânico, porém, não é igual ao de
 * um PIN comum, porque `unlock` tenta o pânico antes do fluxo normal; o risco
 * conhecido está registrado em `SECURITY.md`.
 */
function kdfFor(kind: CredentialKind): VaultKdfParams {
  // o PIN de pânico é o mesmo segredo fraco do PIN, com o mesmo custo por
  // derivação: o tempo total do fluxo é assunto de `unlock`, não do embrulho
  const base = kind === 'pin' || kind === 'panic' ? kdfProfileFor('pin') : kdfProfileFor('master');
  return { algo: 'argon2id', ...base };
}

/** A chave desembrulhada tem 32 bytes; qualquer outra forma é container corrompido. */
function asVaultKey(unwrapped: unknown): Buffer {
  if (!isRecord(unwrapped) || typeof unwrapped.key !== 'string' || unwrapped.key.length !== 64) {
    throw new Error(currentMessages().errors.containerCorrupted);
  }
  return Buffer.from(unwrapped.key, 'hex');
}

/**
 * Embrulhador único, parametrizado pelo tipo de credencial. Não existe uma
 * subclasse por tipo: o único comportamento que muda entre eles é o custo do
 * Argon2id (`kdfFor`), então uma hierarquia seria quatro classes vazias e
 * idênticas, sem polimorfismo nenhum.
 */
class Argon2KeyUnwrapper implements KeyUnwrapper {
  public readonly kind: CredentialKind;

  constructor(kind: CredentialKind) {
    this.kind = kind;
  }

  public get kdf(): VaultKdfParams {
    return kdfFor(this.kind);
  }

  public async wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod> {
    const kdfSalt = randomBytes(16);
    const derived = await deriveKey(credential, kdfSalt, this.kdf);
    const info = methodKeyInfo(this.kind);
    try {
      const payload = encryptRecord({ key: vaultKey.toString('hex') }, derived, info, info);
      return { kdf: this.kdf, kdfSalt: kdfSalt.toString('hex'), payload };
    } finally {
      // falha na cifragem não pode deixar a chave derivada legível na memória
      derived.fill(0);
    }
  }

  public async derive(method: WrappedMethod, credential: string): Promise<Buffer> {
    return deriveKey(credential, Buffer.from(method.kdfSalt, 'hex'), method.kdf);
  }

  public unwrap(method: WrappedMethod, derived: Buffer): Buffer {
    const info = methodKeyInfo(this.kind);
    return asVaultKey(decryptRecord(method.payload, derived, info, info));
  }
}

/** Todo método de desbloqueio que sabe embrulhar a chave. */
const KINDS: readonly CredentialKind[] = ['master', 'pin', 'recovery', 'panic'];

/**
 * Registro de embrulhadores por tipo de credencial (Strategy: mesma interface,
 * a régua muda por `kind`). Os embrulhadores são puros, então uma instância
 * por tipo serve para todo o app. Acrescentar um método de desbloqueio é uma
 * entrada nova em `KINDS`, sem tocar em quem chama (desbloqueio, criação do
 * cofre e redefinição de PIN).
 */
const UNWRAPPERS: ReadonlyMap<CredentialKind, KeyUnwrapper> = new Map<CredentialKind, KeyUnwrapper>(
  KINDS.map((kind) => [kind, new Argon2KeyUnwrapper(kind)]),
);

/**
 * Resolve o desembrulho pelo tipo de credencial. Tipo fora da união não existe
 * em tempo de compilação, mas o mapa é lido por valor vindo do container, então
 * a forma é reconferida aqui e um nome desconhecido é erro, nunca um caminho
 * silencioso sem custo de KDF.
 */
export function keyUnwrapperFor(kind: CredentialKind): KeyUnwrapper {
  const found = UNWRAPPERS.get(kind);
  if (found === undefined) {
    throw new Error(currentMessages().errors.unknownUnlockMethod(kind));
  }
  return found;
}

/** true se o custo gravado já é o atual (candidato a reembrulho caso contrário). */
export function isKdfUpToDate(kind: CredentialKind, method: WrappedMethod): boolean {
  return isSameKdf(method.kdf, keyUnwrapperFor(kind).kdf);
}

/**
 * Gera a chave decoy do PIN de pânico. São 32 bytes aleatórios, então
 * qualquer tentativa de abrir um `.zke` com ela falha no GCM, e o app nem
 * tenta: quem entra por este caminho recebe um cofre vazio.
 */
export function decoyKey(): Buffer {
  return randomBytes(32);
}
