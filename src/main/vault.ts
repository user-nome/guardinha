/** Fachada de operações do cofre: status, criação, desbloqueio, pânico e PIN. */
import { normalizeRecoveryPhrase } from '@zero/main/crypto';
import {
  getLockRemainingMs,
  loadAuthState,
  registerFailedAttempt,
  resetAttempts,
  statusFrom,
} from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { setupVaultDirectory } from '@zero/main/privilege';
import { secureClipboard } from '@zero/main/clipboard';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { decoyKey, isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import { runUnlockChain } from '@zero/main/unlock';
import {
  migrateAndPersist,
  migrateContainerBestEffort,
  persistMigration,
} from '@zero/main/migration';
import type { UnlockContext } from '@zero/main/unlock';
import {
  errorMessage,
  formatCountdown,
  isMasterPasswordFormat,
  isPinFormat,
  RECOVERY_MIN_WORDS,
  strengthFor,
} from '@zero/shared';
import { MIN_NUKE_LIMIT } from '@zero/shared/auth-constants';
import { currentMessages } from '@zero/main/i18n';
import { sealManifest } from '@zero/main/container';
import { VAULT_VERSION } from '@zero/main/container-format';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import type {
  CreateVaultInput,
  PanicPinInput,
  PanicStatus,
  ResetPinInput,
  UnlockInput,
  VaultResult,
  VaultStatus,
} from '@zero/types';

// Fila curta por processo: o read-modify-write tem `await` no meio e perderia gravação.
let vaultQueue: Promise<unknown> = Promise.resolve();

function exclusive<T>(task: () => Promise<T> | T): Promise<T> {
  const run = vaultQueue.then(task, task);
  // uma falha não pode envenenar a fila: a próxima operação roda mesmo assim
  vaultQueue = run.catch(() => undefined);
  return run;
}

export function getStatus(): VaultStatus {
  const auth = loadAuthState();
  // a sessão decoy é o único caso de cofre "existente" sem container: é o que a coação vê
  const exists = vaultStorage.exists() || vaultSession().isDecoy();
  return statusFrom(auth, exists, !vaultSession().isUnlocked());
}

export function isUnlocked(): boolean {
  return vaultSession().isUnlocked();
}

/** Rearma a trava automática (chamado a cada operação bem-sucedida). */
export function touch(): void {
  vaultSession().touch();
}

/** Bloqueia o cofre: a chave sai da memória e o auto-lock é cancelado. */
export function lock(): VaultStatus {
  vaultSession().wipe();
  // deixar a senha copiada no clipboard por 30 s anularia parte do gesto
  void secureClipboard.dispose();
  return getStatus();
}

/** Zera a chave da RAM antes de tocar no disco; falha de erase vira log, não sucesso. */
async function panicDestroyNow(): Promise<VaultStatus> {
  vaultSession().wipe();
  const erased = vaultStorage.erase();
  if (erased.failed > 0) {
    console.warn(
      `Autodestruição incompleta: ${erased.failed} arquivo(s) não foram apagados; ` +
        'o cofre continua no disco e pode abrir de novo.',
    );
  }
  await secureClipboard.dispose();
  return getStatus();
}

/** Entra na fila do cofre: destruir no meio de um desbloqueio deixaria a chave viva. */
export function panicDestroy(): Promise<VaultStatus> {
  return exclusive(panicDestroyNow);
}

/** Chave da sessão corrente; lança o erro localizado se o cofre estiver bloqueado. */
export function requireSessionKey(): Buffer {
  return vaultSession().requireKey();
}

/** Erro de "sessão já zerada", comparado pela mensagem já localizada. */
export function isVaultLockedError(error: unknown): boolean {
  return error instanceof Error && error.message === currentMessages().errors.vaultLocked;
}

function fail(error: string): VaultResult {
  return { ok: false, error, status: getStatus() };
}

/** Cria o cofre com frase de recuperação escrita pelo próprio usuário. */
export function createVault(input: CreateVaultInput): Promise<VaultResult> {
  return exclusive(() => createVaultNow(input));
}

async function createVaultNow(input: CreateVaultInput): Promise<VaultResult> {
  const m = currentMessages();
  if (!isMasterPasswordFormat(input.masterPassword)) {
    return { ok: false, error: m.errors.invalidMasterLength, status: getStatus() };
  }
  // revalida a força aqui: o renderer é conveniência, não é fronteira de segurança
  if (strengthFor('master').evaluate(input.masterPassword).blocked) {
    return { ok: false, error: m.errors.trivialMaster, status: getStatus() };
  }
  if (!isPinFormat(input.pin)) {
    return { ok: false, error: m.errors.invalidPin, status: getStatus() };
  }
  if (strengthFor('pin').evaluate(input.pin).blocked) {
    return { ok: false, error: m.errors.trivialPin, status: getStatus() };
  }
  const recoveryPhrase = normalizeRecoveryPhrase(input.recoveryPhrase);
  if (recoveryPhrase.split(' ').length < RECOVERY_MIN_WORDS) {
    return { ok: false, error: m.errors.invalidRecovery, status: getStatus() };
  }
  if (strengthFor('phrase').evaluate(recoveryPhrase).blocked) {
    return { ok: false, error: m.errors.trivialPhrase, status: getStatus() };
  }
  if (vaultStorage.exists()) return { ok: false, error: m.errors.vaultExists, status: getStatus() };

  try {
    vaultStorage.ensureStructure();
  } catch (error) {
    if (!vaultStorage.isDirUnavailable(error)) {
      const message = error instanceof Error ? error.message : m.errors.internal;
      return { ok: false, error: message, status: getStatus() };
    }
    // sem permissão em /var/lib: abre o diálogo do sistema (pkexec) e tenta de novo
    if (!setupVaultDirectory()) {
      return { ok: false, error: m.errors.vaultAuthCancelled, status: getStatus() };
    }
    try {
      vaultStorage.ensureStructure();
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : m.errors.internal;
      return { ok: false, error: message, status: getStatus() };
    }
    // a raiz agora existe: refaz a checagem (migra cofre antigo, se houver)
    if (vaultStorage.exists()) {
      return { ok: false, error: m.errors.vaultExists, status: getStatus() };
    }
  }
  const vaultKey = vaultStorage.createKey();

  // um cofre novo é o usuário decidindo de propósito: só aqui a guarda de
  // destruição é liberada, para que o `writeContainer` abaixo grave
  clearDestroyedFlag();

  // um embrulho por tipo de credencial (Factory Method), cada um com seu custo
  const methods: VaultContainerData['methods'] = {
    master: await keyUnwrapperFor('master').wrap(vaultKey, input.masterPassword),
    pin: await keyUnwrapperFor('pin').wrap(vaultKey, input.pin),
    recovery: await keyUnwrapperFor('recovery').wrap(vaultKey, recoveryPhrase),
  };

  const container: VaultContainerData = {
    version: VAULT_VERSION,
    createdAt: Date.now(),
    attempts: 0,
    lockUntil: null,
    // autodestruição por contagem só com o usuário ligando
    attemptsMaster: 0,
    nukeLimit: 0,
    methods,
    // o selo inicial acontece antes de o arquivo existir: um container sem
    // manifesto nunca é um cofre novo, é um cofre adulterado
    manifest: sealManifest(vaultKey, [], [], { entries: {}, auth: {} }),
  };
  vaultStorage.writeContainer(container);
  // a chave assume a sessão (Singleton)
  vaultSession().adopt(vaultKey);

  return { ok: true, status: getStatus() };
}

/** Cópia literal de embrulho entre métodos faria o PIN normal destruir o cofre. */
function sameWrappedMethod(a: WrappedMethod, b: WrappedMethod): boolean {
  return (
    a.kdfSalt === b.kdfSalt &&
    a.payload.salt === b.payload.salt &&
    a.payload.iv === b.payload.iv &&
    a.payload.tag === b.payload.tag &&
    a.payload.encryptedData === b.payload.encryptedData
  );
}

/** O PIN de pânico não pode ser o PIN que abre o cofre, nas duas direções. */
async function methodMatchesCredential(
  kind: 'pin' | 'panic',
  method: WrappedMethod | undefined,
  credential: string,
): Promise<boolean> {
  if (method === undefined) return false;
  const unwrapper = keyUnwrapperFor(kind);
  let derived: Buffer | null = null;
  try {
    derived = await unwrapper.derive(method, credential);
    unwrapper.unwrap(method, derived);
    return true;
  } catch {
    return false;
  } finally {
    derived?.fill(0);
  }
}

/** PIN de coação: abre um cofre vazio e apaga o real, sem trava nem contagem. */
async function tryPanicUnlock(input: UnlockInput, container: VaultContainerData): Promise<boolean> {
  const method = container.methods.panic;
  // só faz sentido para algo no formato de PIN: uma senha mestra de 24
  // caracteres nunca é o PIN de pânico, e o custo é o mesmo
  if (method === undefined || input.kind !== 'pin' || !isPinFormat(input.credential)) {
    return false;
  }
  const pinMethod = container.methods.pin;
  if (pinMethod !== undefined && sameWrappedMethod(method, pinMethod)) {
    // não é um PIN de pânico: é o método do PIN copiado para o slot de pânico.
    // Segue o fluxo normal para o PIN abrir o cofre em vez de destruí-lo.
    return false;
  }
  const unwrapper = keyUnwrapperFor('panic');
  let derived: Buffer | null = null;
  try {
    derived = await unwrapper.derive(method, input.credential);
    // o desembrulho só confirma que o PIN é o certo; a chave que sai é decoy
    const decoy = unwrapper.unwrap(method, derived);
    decoy.fill(0);
    return true;
  } catch {
    // PIN errado: segue o fluxo normal, como se nada tivesse sido tentado
    return false;
  } finally {
    derived?.fill(0);
  }
}

/** Desbloqueia pela cadeia de `unlock.ts`: trava, formato, Argon2id e integridade. */
export function unlock(input: UnlockInput): Promise<VaultResult> {
  return exclusive(() => unlockNow(input));
}

async function unlockNow(input: UnlockInput): Promise<VaultResult> {
  const m = currentMessages();
  // Um cofre ilegível (de outra versão, ou danificado) não é erro de
  // credencial: é o arquivo. Sem este catch a exceção sobe pelo handler do IPC e
  // o renderer só mostra um `Error occurred in handler`, sem dizer o que houve.
  let container: VaultContainerData | null;
  try {
    container = vaultStorage.readContainer();
  } catch (error) {
    return fail(errorMessage(error, m.errors.vaultTampered));
  }
  if (container === null) return fail(m.errors.vaultMissing);

  // antes de tudo, e sem respectar a trava: o PIN de pânico destrói o cofre
  if (await tryPanicUnlock(input, container)) {
    await panicDestroyNow();
    // A pessoa sob coação precisa de um cofre aberto e vazio para mostrar, não
    // de um erro que denuncie o mecanismo. A sessão decoy não guarda chave
    // alguma (a real já saiu da RAM), então nada aqui decifra um `.zke`.
    vaultSession().adoptDecoy();
    return { ok: true, status: getStatus() };
  }

  const context: UnlockContext = { input, container };
  const rejected = await runUnlockChain(context);
  if (rejected !== null) return rejected;
  // a senha mestra cruzou o limite estrito: autodestruição, sem abrir nada
  if (context.nuked === true) {
    await panicDestroyNow();
    return { ok: false, error: m.errors.vaultDestroyed, status: getStatus() };
  }
  const vaultKey = context.vaultKey;
  /* v8 ignore next -- a cadeia só devolve `null` depois de deixar a chave no
     contexto; a guarda cobre um encadeamento incompleto e responde como erro
     interno em vez de seguir com `undefined`. */
  if (vaultKey === undefined) return fail(m.errors.internal);

  // o método usado e o manifesto migram agora; os outros métodos esperam o
  // desbloqueio de cada credencial, que é quando ela fica disponível
  await migrateAndPersist(container, vaultKey, {
    kind: input.kind,
    credential: input.credential,
    legacyMethod: context.legacyMethod === true,
  });

  // a chave nova assume a sessão (zerando a anterior) no Singleton. O manifesto
  // já foi selado na criação; re-selar aqui aceitaria exclusões feitas por fora.
  vaultSession().adopt(vaultKey);
  resetAttempts();
  return { ok: true, status: getStatus() };
}

/** Instala o PIN de coação; exige cofre aberto para reembrulhar a chave decoy. */
export function setPanicPin(input: PanicPinInput): Promise<VaultResult> {
  return exclusive(() => setPanicPinNow(input));
}

async function setPanicPinNow(input: PanicPinInput): Promise<VaultResult> {
  const m = currentMessages();
  if (!vaultSession().isUnlocked()) return fail(m.errors.vaultLocked);
  if (!isPinFormat(input.pin)) return fail(m.errors.invalidPin);
  if (strengthFor('pin').evaluate(input.pin).blocked) return fail(m.errors.trivialPin);

  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);

  // o PIN de pânico não pode ser o PIN de verdade: um PIN que abre o cofre
  // E o destrói não serve nem como cofre nem como proteção
  if (await methodMatchesCredential('pin', container.methods.pin, input.pin)) {
    return fail(m.errors.panicPinSame);
  }

  container.methods.panic = await keyUnwrapperFor('panic').wrap(decoyKey(), input.pin);
  vaultStorage.writeContainer(container);
  return { ok: true, status: getStatus() };
}

/** Remove o PIN de coação; o cofre volta a não ter caminho de pânico. */
export function clearPanicPin(): Promise<VaultStatus> {
  return exclusive(() => {
    // sem sessão aberta não há como distinguir o dono do cofre de um chamador
    // qualquer do IPC; a remoção é permanente e exige a mesma prova que instalar
    if (vaultStorage.exists() && !vaultSession().isUnlocked()) {
      throw new Error(currentMessages().errors.vaultLocked);
    }
    const container = vaultStorage.readContainer();
    if (container !== null) {
      delete container.methods.panic;
      vaultStorage.writeContainer(container);
    }
    return getStatus();
  });
}

/** true se o cofre tem PIN de coação instalado (para a interface). */
export function hasPanicPin(): boolean {
  const container = vaultStorage.readContainer();
  return container?.methods.panic !== undefined;
}

/** Estado do pânico; bloqueado, a resposta é neutra para não revelar o caminho. */
export function panicStatus(): PanicStatus {
  if (!vaultSession().isUnlocked()) {
    return { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 };
  }
  const container = vaultStorage.readContainer();
  return {
    hasPanicPin: container?.methods.panic !== undefined,
    nukeLimit: container?.nukeLimit ?? 0,
    attemptsMaster: container?.attemptsMaster ?? 0,
  };
}

/** Limite de tentativas da senha mestra que apaga o cofre; `0` desliga. */
export function setNukeLimit(limit: number): Promise<VaultResult> {
  return exclusive(() => setNukeLimitNow(limit));
}

function setNukeLimitNow(limit: number): VaultResult {
  const m = currentMessages();
  // o campo é UInt32 no container: acima disso o `writeUInt32BE` lançaria
  // `RangeError` no meio da gravação, em vez de devolver erro de domínio
  if (!Number.isInteger(limit) || limit < 0 || limit > 0xffff_ffff) {
    return fail(m.errors.invalidNukeLimit);
  }
  if (limit > 0 && limit < MIN_NUKE_LIMIT) return fail(m.errors.nukeLimitTooLow);

  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);
  // o limite é permanente e decide se o cofre se apaga: exige a mesma sessão
  // aberta que instalar o PIN de pânico, senão o IPC bloqueado vira um caminho
  // para desarmar a proteção sem credencial
  if (!vaultSession().isUnlocked()) return fail(m.errors.vaultLocked);
  container.nukeLimit = limit;
  // um limite novo recomeça a contagem: a anterior foi medida contra outro teto
  container.attemptsMaster = 0;
  vaultStorage.writeContainer(container);
  return { ok: true, status: getStatus() };
}

/** Redefine o PIN pela frase de recuperação; sai desbloqueado com o novo PIN. */
export function resetPin(input: ResetPinInput): Promise<VaultResult> {
  return exclusive(() => resetPinNow(input));
}

async function resetPinNow(input: ResetPinInput): Promise<VaultResult> {
  const m = currentMessages();
  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);

  const locked = getLockRemainingMs(loadAuthState());
  if (locked > 0) {
    return fail(m.auth.lockout(formatCountdown(locked)));
  }
  if (!isPinFormat(input.newPin)) return fail(m.errors.invalidPin);
  if (strengthFor('pin').evaluate(input.newPin).blocked) return fail(m.errors.trivialPin);

  const method = container.methods.recovery;
  if (method === undefined) return fail(m.errors.wrongRecovery);

  const recovery = keyUnwrapperFor('recovery');
  try {
    const phrase = normalizeRecoveryPhrase(input.phrase);
    if (phrase.split(' ').length < RECOVERY_MIN_WORDS) {
      throw new Error(m.errors.shortPhrase);
    }
    const derived = await recovery.derive(method, phrase);
    // a chave de trabalho sai da RAM mesmo se o desembrulho falhar, então o
    // zero fica no `finally` e não no corpo feliz
    try {
      const { vaultKey, legacy } = recovery.unwrapDetailed(method, derived);
      // o novo PIN não pode ser o PIN de coação: `tryPanicUnlock` roda antes da
      // cadeia normal, então o próximo login destruiria o cofre em vez de
      // abri-lo. A checagem fica **depois** da frase, para que uma frase errada
      // continue devolvendo `wrongRecovery` em vez de denunciar o PIN de pânico
      // a quem ainda não provou posse da recuperação.
      if (await methodMatchesCredential('panic', container.methods.panic, input.newPin)) {
        return fail(m.errors.panicPinSame);
      }
      container.methods.pin = await keyUnwrapperFor('pin').wrap(vaultKey, input.newPin);
      // a frase está na mão: sobe o custo do método e o reembrulha se ele ainda
      // estiver no formato antigo
      if (legacy || !isKdfUpToDate('recovery', method)) {
        container.methods.recovery = await recovery.wrap(vaultKey, phrase);
      }
      // a redefinição também é um desbloqueio: aproveita para migrar o resto
      // (versão, manifesto e o método de recuperação já reembrulhado acima)
      const migrated = await migrateContainerBestEffort(container, vaultKey, {
        kind: 'recovery',
        credential: phrase,
        legacyMethod: legacy,
        methodAlreadyWrapped: true,
      });
      // o PIN novo já está embrulhado: grava mesmo se o snapshot de downgrade
      // não puder ser criado (a falha fica no log, não vira "frase errada")
      persistMigration(container, migrated, false);

      // a chave nova assume a sessão (zerando a anterior) no Singleton; o
      // manifesto já estava selado e não é re-selado por um desbloqueio
      vaultSession().adopt(vaultKey);
      resetAttempts();
      return { ok: true, status: getStatus() };
    } finally {
      derived.fill(0);
    }
  } catch {
    // a frase de recuperação não soma em `attemptsMaster`: o limite estrito é
    // só da senha mestra, senão o caminho de recuperação seria um atalho para
    // apagar o cofre
    const { state } = registerFailedAttempt('pin', container.nukeLimit);
    return { ok: false, error: m.errors.wrongRecovery, status: statusFrom(state, true, true) };
  }
}
