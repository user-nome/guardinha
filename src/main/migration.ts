/** Migração explícita do cofre: reembrulha todos os métodos e reescreve os registros. */
import { openManifest } from '@zero/main/container';
import { MANIFEST_VERSION, VAULT_VERSION } from '@zero/main/container-format';
import { normalizeRecoveryPhrase } from '@zero/main/crypto';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import { errorMessage } from '@zero/shared';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import type { CredentialKind } from '@zero/main/unwrapping';
import type { MigrationMethod, VaultMigrationInput, VaultMigrationStatus } from '@zero/types';

/** Ordem em que a tela pede as credenciais; o PANIC fica de fora de propósito. */
const MIGRATION_METHODS: readonly MigrationMethod[] = ['master', 'pin', 'recovery'];

/** Métodos presentes no container, na ordem em que a migração os reembrulha. */
export function migrationMethodsFor(container: VaultContainerData): MigrationMethod[] {
  return MIGRATION_METHODS.filter((kind) => container.methods[kind] !== undefined);
}

/** Estado para a tela de atualização; `pending` cobre o cofre v6 que o fluxo antigo deixou pela metade. */
export function migrationStatusFor(
  container: VaultContainerData | null,
  pending: boolean,
): VaultMigrationStatus {
  if (container === null) {
    return {
      needed: false,
      fromVersion: VAULT_VERSION,
      toVersion: VAULT_VERSION,
      methods: [],
      entries: 0,
      authTokens: 0,
    };
  }
  const needed = pending || container.version < VAULT_VERSION;
  return {
    needed,
    fromVersion: container.version,
    toVersion: VAULT_VERSION,
    methods: needed ? migrationMethodsFor(container) : [],
    entries: vaultStorage.listIds().length,
    authTokens: vaultStorage.listAuthIds().length,
  };
}

/** Mensagem da credencial recusada, sem dizer qual das outras está certa. */
function wrongCredential(kind: MigrationMethod): string {
  const m = currentMessages();
  if (kind === 'master') return m.errors.wrongMaster;
  if (kind === 'pin') return m.errors.wrongPin;
  return m.errors.wrongRecovery;
}

/** Credencial do formulário; a frase passa pela mesma normalização da criação. */
function credentialFor(kind: MigrationMethod, input: VaultMigrationInput): string {
  const raw = input[kind];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(currentMessages().errors.migrationIncomplete);
  }
  return kind === 'recovery' ? normalizeRecoveryPhrase(raw) : raw;
}

/** true quando a credencial abre exatamente a chave que já está na sessão. */
async function opensSameKey(
  method: WrappedMethod,
  vaultKey: Buffer,
  kind: MigrationMethod,
  credential: string,
): Promise<boolean> {
  const unwrapper = keyUnwrapperFor(kind);
  try {
    const derived = await unwrapper.derive(method, credential);
    try {
      const unwrapped = unwrapper.unwrapDetailed(method, derived);
      const same = unwrapped.vaultKey.equals(vaultKey);
      unwrapped.vaultKey.fill(0);
      return same;
    } finally {
      derived.fill(0);
    }
  } catch {
    // credencial errada, linha adulterada ou salt inválido: a tela só diz "incorreta"
    return false;
  }
}

/** Confere que a credencial abre a mesma chave do cofre e reembrulha o método no formato atual. */
async function verifyAndRewrap(
  container: VaultContainerData,
  vaultKey: Buffer,
  kind: MigrationMethod,
  credential: string,
): Promise<WrappedMethod> {
  const method = container.methods[kind];
  /* v8 ignore next 4 -- `migrationMethodsFor` só devolve métodos presentes no
     container; esta guarda cobre um chamador que monte a lista por conta própria. */
  if (method === undefined) {
    throw new Error(currentMessages().errors.migrationIncomplete);
  }
  if (!(await opensSameKey(method, vaultKey, kind, credential))) {
    throw new Error(wrongCredential(kind));
  }
  return keyUnwrapperFor(kind).wrap(vaultKey, credential);
}

function warn(stage: string, error: unknown): void {
  console.warn(
    `Migração do cofre ${stage}: ${errorMessage(error, currentMessages().errors.internal)}`,
  );
}

/** true quando a versão do container ou do manifesto ainda é a antiga. */
function needsMigration(container: VaultContainerData, vaultKey: Buffer): boolean {
  if (container.version < VAULT_VERSION) return true;
  if (container.manifest === null) return true;
  return openManifest(vaultKey, container.manifest).version < MANIFEST_VERSION;
}

/** Reembrulha os métodos, reescreve os registros e sela a v3; `null` se nada a migrar. */
export async function buildMigratedContainer(
  container: VaultContainerData,
  vaultKey: Buffer,
  input: VaultMigrationInput,
  pending: boolean,
): Promise<VaultContainerData | null> {
  if (!pending && !needsMigration(container, vaultKey)) return null;

  vaultStorage.verifyManifestData(container, vaultKey);

  const methods: Partial<Record<MigrationMethod, WrappedMethod>> = {};
  for (const kind of migrationMethodsFor(container)) {
    methods[kind] = await verifyAndRewrap(container, vaultKey, kind, credentialFor(kind, input));
  }

  vaultStorage.reencryptRecords(vaultKey);
  return {
    ...container,
    version: VAULT_VERSION,
    methods: { ...container.methods, ...methods },
    manifest: vaultStorage.manifestFromDirectory(vaultKey, MANIFEST_VERSION),
  };
}

/** Grava o container migrado de uma vez; o erase continua barrando a escrita depois da destruição. */
export function persistMigratedContainer(container: VaultContainerData): void {
  vaultStorage.writeContainer(container);
}

/** Cofre meio migrado pelo fluxo antigo: método v5 ou manifesto v2, com a chave em mãos. */
export function hasLegacyFormat(
  container: VaultContainerData,
  vaultKey: Buffer,
  legacyMethod: boolean,
): boolean {
  if (legacyMethod) return true;
  if (container.manifest === null) return false;
  try {
    return openManifest(vaultKey, container.manifest).version < MANIFEST_VERSION;
  } catch {
    // manifesto ilegível não é caso de migração: a primeira operação de dados mostra o erro
    return false;
  }
}

/** Sobe o custo do Argon2id do método recém-usado; migração de formato não passa por aqui. */
export async function refreshMethodKdf(
  container: VaultContainerData,
  vaultKey: Buffer,
  kind: CredentialKind,
  credential: string,
): Promise<void> {
  if (container.version < VAULT_VERSION) return;
  const method = container.methods[kind];
  if (method === undefined || isKdfUpToDate(kind, method)) return;
  try {
    const current = vaultStorage.readContainer();
    if (current === null) return;
    current.methods[kind] = await keyUnwrapperFor(kind).wrap(vaultKey, credential);
    vaultStorage.writeContainer(current);
  } catch (error) {
    // reembrulho é conveniência de custo: falha de escrita não pode derrubar o desbloqueio
    warn('com custo de KDF adiada', error);
  }
}
