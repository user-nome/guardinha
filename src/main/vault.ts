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
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import type {
  CreateVaultInput,
  PanicPinInput,
  PanicStatus,
  ResetPinInput,
  UnlockInput,
  UnlockKind,
  VaultResult,
  VaultStatus,
} from '@zero/types';

/**
 * Fila de operações do cofre, curta e por processo: desbloqueio, redefinição de
 * PIN, criação e mutações do container fazem read-modify-write com `await` no
 * meio (Argon2id custa segundos). Sem a fila, duas chamadas leem o mesmo
 * container e a última gravação descarta a outra, o que pode perder uma
 * tentativa contada ou uma troca de PIN.
 *
 * Só as funções exportadas passam por aqui. Os helpers internos se chamam
 * direto, sem reentrar na fila, que é o que evita deadlock (`unlockNow` chama
 * `panicDestroyNow`, por exemplo).
 */
let vaultQueue: Promise<unknown> = Promise.resolve();

function exclusive<T>(task: () => Promise<T> | T): Promise<T> {
  const run = vaultQueue.then(task, task);
  // uma falha não pode envenenar a fila: a próxima operação roda mesmo assim
  vaultQueue = run.catch(() => undefined);
  return run;
}

export function getStatus(): VaultStatus {
  const auth = loadAuthState();
  // a sessão decoy é o único caso em que o cofre "existe" sem container: é o
  // que a pessoa sob coação precisa ver na tela, um cofre aberto e vazio
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
  // o lock existe para reduzir exposição: deixar a senha copiada no clipboard
  // por até 30 s anularia parte do gesto. `dispose` é seguro sem cópia ativa.
  void secureClipboard.dispose();
  return getStatus();
}

/**
 * Autodestruição do cofre (Cryptographic Erase): a chave sai da RAM **antes**
 * de qualquer I/O, e só depois o disco é apagado. A ordem importa: se o disco
 * falhar, a memória já está limpa, que é o lado que o atacante com o mesmo
 * usuário alcança mais fácil.
 *
 * Usado pelo botão de pânico e pelo PIN de coação. O `EraseResult` é conferido:
 * o `eraseVault` só marca o cofre como destruído quando o `vault.zkv` sumiu,
 * e uma falha de I/O precisa aparecer no log em vez de virar "destruído" na
 * tela com a chave ainda no disco.
 */
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

/**
 * true se o erro é "a sessão já foi zerada" e não outra falha de domínio.
 * Mesmo padrão de `isVaultDirUnavailable`: compara com a mensagem já
 * localizada, porque é ela que o `VaultSessionManager` lança.
 */
export function isVaultLockedError(error: unknown): boolean {
  return error instanceof Error && error.message === currentMessages().errors.vaultLocked;
}

function fail(error: string): VaultResult {
  return { ok: false, error, status: getStatus() };
}

/**
 * Sobe o custo do Argon2id quando o método gravado está mais fraco que o
 * perfil atual. Só quem detém a credencial consegue reembrulhar, então cada
 * método sobe no próprio desbloqueio. Best-effort: sem permissão de escrita
 * agora, a subida espera a próxima desbloqueada sem derrubar o desbloqueio.
 */
async function upgradeMethod(
  container: VaultContainerData,
  kind: UnlockKind,
  credential: string,
  vaultKey: Buffer,
): Promise<void> {
  const unwrapper = keyUnwrapperFor(kind);
  const current = container.methods[kind];
  if (current === undefined || isKdfUpToDate(kind, current)) return;
  try {
    container.methods[kind] = await unwrapper.wrap(vaultKey, credential);
    vaultStorage.writeContainer(container);
  } catch {
    // escrita indisponível (ex.: sem sudo em /var/lib); tenta na próxima vez
  }
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

/**
 * Dois embrulhos são o mesmo blob? O container não autentica o papel de cada
 * método, então copiar o blob do PIN para o slot de pânico faria o PIN normal
 * destruir o cofre. A cópia literal mantém salt, IV, tag e texto cifrado
 * idênticos; um embrulho legítimo de pânico usa salt e IV aleatórios e nunca
 * colide. Um atacante que queira disfarçar a cópia precisaria reembrulhar a
 * chave real, o que exige a chave ou o PIN, já fora do modelo de ameaça.
 */
function sameWrappedMethod(a: WrappedMethod, b: WrappedMethod): boolean {
  return (
    a.kdfSalt === b.kdfSalt &&
    a.payload.salt === b.payload.salt &&
    a.payload.iv === b.payload.iv &&
    a.payload.tag === b.payload.tag &&
    a.payload.encryptedData === b.payload.encryptedData
  );
}

/**
 * A credencial abre este método? É a invariante "o PIN de pânico não pode ser
 * o PIN que abre o cofre", usada nas duas direções: `setPanicPin` recusa o PIN
 * real e `resetPin` recusa instalar o PIN de pânico como novo PIN. O custo é o
 * Argon2id do método, e o buffer derivado é zerado mesmo quando o desembrulho
 * falha.
 */
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

/**
 * PIN de coação: um código alternativo que abre um cofre vazio enquanto
 * aciona o Cryptographic Erase.
 *
 * Deliberadamente **não** passa pela trava exponencial: quem está sob coação não
 * tem como esperar 24 h, e um PIN de pânico que só funciona fora da trava
 * seria inútil justamente na hora em que seria preciso. Isso é uma escolha
 * consciente, com o lado ruim anotado em `SECURITY.md`: o PIN de pânico é um
 * caminho que não conta tentativa, então ele nunca gera lockout por si só.
 *
 * E também **não** conta tentativa quando erra. Um PIN de pânico que somasse em
 * `attempts` denunciaria a existência de um segundo caminho justamente para quem
 * está testando o app sob coação. Ele paga a derivação do método panic, com o
 * mesmo custo do PIN; o tempo total do fluxo, porém, é maior para um PIN comum,
 * porque o pânico é tentado antes da cadeia normal. Esse risco conhecido está
 * registrado em `SECURITY.md`.
 */
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

/**
 * Desbloqueia o cofre com senha mestra ou PIN. A cadeia de manipuladores
 * (`src/main/unlock.ts`) decide: trava exponencial, formato, Argon2id e
 * integridade, nesta ordem de custo.
 */
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

  await upgradeMethod(container, input.kind, input.credential, vaultKey);

  // a chave nova assume a sessão (zerando a anterior) no Singleton. O manifesto
  // já foi selado na criação; re-selar aqui aceitaria exclusões feitas por fora.
  vaultSession().adopt(vaultKey);
  resetAttempts();
  return { ok: true, status: getStatus() };
}

/**
 * Instala (ou troca) o PIN de coação. Exige cofre desbloqueado, porque sem a
 * chave do cofre não há como reembrulhar a decoy com o Argon2id certo.
 */
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

/**
 * Estado das proteções de pânico, para a interface montar o formulário.
 *
 * Bloqueado, a resposta é neutra: revelar que existe um segundo caminho de
 * desbloqueio para quem ainda não provou a credencial entregaria justamente a
 * informação que o PIN de coação esconde.
 */
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

/**
 * Limite estrito de tentativas da senha mestra que dispara o Cryptographic
 * Erase. `0` desliga, e é o padrão: apagar o cofre por contagem é uma lâmina sem
 * ponta para o usuário, porque cinco erros de digitação levariam à perda
 * definitiva (a frase de recuperação não salva, já que o arquivo que a
 * embrulha foi apagado). Quem liga, liga sabendo; ver `SECURITY.md`.
 */
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

/**
 * Redefine o PIN provando posse da frase de recuperação (único uso da frase).
 * Em caso de sucesso o cofre já sai desbloqueado com o novo PIN.
 */
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
      const vaultKey = recovery.unwrap(method, derived);
      // o novo PIN não pode ser o PIN de coação: `tryPanicUnlock` roda antes da
      // cadeia normal, então o próximo login destruiria o cofre em vez de
      // abri-lo. A checagem fica **depois** da frase, para que uma frase errada
      // continue devolvendo `wrongRecovery` em vez de denunciar o PIN de pânico
      // a quem ainda não provou posse da recuperação.
      if (await methodMatchesCredential('panic', container.methods.panic, input.newPin)) {
        return fail(m.errors.panicPinSame);
      }
      container.methods.pin = await keyUnwrapperFor('pin').wrap(vaultKey, input.newPin);
      // a frase está na mão: aproveita para subir o custo do método de recuperação
      if (!isKdfUpToDate('recovery', method)) {
        container.methods.recovery = await recovery.wrap(vaultKey, phrase);
      }
      vaultStorage.writeContainer(container);

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
