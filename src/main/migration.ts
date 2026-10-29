import { openManifest } from '@zero/main/container';
import { MANIFEST_VERSION, VAULT_VERSION } from '@zero/main/container-format';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import { errorMessage } from '@zero/shared';
import type { VaultContainerData } from '@zero/main/container';
import type { CredentialKind } from '@zero/main/unwrapping';

/** Migração do container no desbloqueio: reembrulha só o método cuja credencial está em mãos. */

/** O que a credencial em mãos permite migrar agora. */
export interface MigrationOptions {
  /** Método cuja credencial está disponível neste desbloqueio. */
  readonly kind: CredentialKind;
  /** Credencial em claro, só para reembrulhar o método. */
  readonly credential: string;
  /** O blob lido estava no embrulho legado da v5. */
  readonly legacyMethod: boolean;
  /** O chamador já reembrulhou o método (resetPin): não pague o Argon2id de novo. */
  readonly methodAlreadyWrapped?: boolean;
}

/** Monta o container migrado ou devolve `null` quando não há nada a fazer; adulteração lança. */
export async function prepareMigration(
  container: VaultContainerData,
  vaultKey: Buffer,
  options: MigrationOptions,
): Promise<VaultContainerData | null> {
  const method = container.methods[options.kind];
  if (method === undefined) return null;

  // sem manifesto não há o que re-selar: o campo nulo é adulteração, e criar
  // um selo novo aqui aceitaria exclusões silenciosas como estado legítimo
  if (container.manifest === null) return null;
  const manifest = openManifest(vaultKey, container.manifest);

  const needsVersion = container.version < VAULT_VERSION;
  const needsManifest = manifest.version < MANIFEST_VERSION;
  const needsMethod = options.legacyMethod || !isKdfUpToDate(options.kind, method);
  if (!needsVersion && !needsManifest && !needsMethod) return null;

  let nextManifest = container.manifest;
  if (needsVersion || needsManifest) {
    // antes de re-selar, o manifesto precisa bater com o diretório; custo de KDF sozinho não re-sela
    vaultStorage.verifyManifestData(container, vaultKey);
    nextManifest = vaultStorage.manifestFromDirectory(vaultKey, MANIFEST_VERSION);
  }

  const next: VaultContainerData = {
    ...container,
    version: needsVersion ? VAULT_VERSION : container.version,
    methods: { ...container.methods },
    manifest: nextManifest,
  };
  if (needsMethod && options.methodAlreadyWrapped !== true) {
    next.methods[options.kind] = await keyUnwrapperFor(options.kind).wrap(
      vaultKey,
      options.credential,
    );
  }
  return next;
}

function warn(stage: string, error: unknown): void {
  console.warn(
    `Migração do cofre ${stage}: ${errorMessage(error, currentMessages().errors.internal)}`,
  );
}

/** Prepara a migração sem lançar; devolve o container original quando não dá. */
export async function migrateContainerBestEffort(
  container: VaultContainerData,
  vaultKey: Buffer,
  options: MigrationOptions,
): Promise<VaultContainerData> {
  try {
    return (await prepareMigration(container, vaultKey, options)) ?? container;
  } catch (error) {
    warn('adiada', error);
    return container;
  }
}

/** Grava o container migrado; no desbloqueio, sem snapshot não grava e aborta. */
export function persistMigration(
  previous: VaultContainerData,
  next: VaultContainerData,
  requireBackup: boolean,
): void {
  if (next !== previous) {
    try {
      vaultStorage.backupContainer(previous.version);
    } catch (error) {
      if (requireBackup) throw error;
      warn('sem snapshot', error);
    }
  }
  vaultStorage.writeContainer(next);
}

/** Prepara e grava; nunca lança, porque migração é conveniência de formato. */
export async function migrateAndPersist(
  container: VaultContainerData,
  vaultKey: Buffer,
  options: MigrationOptions,
): Promise<void> {
  const next = await migrateContainerBestEffort(container, vaultKey, options);
  if (next === container) return;
  try {
    persistMigration(container, next, true);
  } catch (error) {
    warn('não gravada', error);
  }
}
