import { openManifest } from '@zero/main/container';
import { MANIFEST_VERSION, VAULT_VERSION } from '@zero/main/container-format';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import { errorMessage } from '@zero/shared';
import type { VaultContainerData } from '@zero/main/container';
import type { CredentialKind } from '@zero/main/unwrapping';

/**
 * Migração do container para o formato atual, feita no desbloqueio.
 *
 * A v5 e a v6 têm o mesmo layout binário; o que mudou foi o embrulho de cada
 * método (HKDF e AAD com o papel do método) e o manifesto (hashes de conteúdo).
 * Reembrulhar um método exige a credencial que o protege, e o desbloqueio só
 * tem uma: por isso o método usado é migrado na hora e os outros ficam para o
 * desbloqueio de cada um. O container inteiro só é promovido depois que o
 * manifesto e o método em mãos estão no formato novo.
 *
 * A migração é best-effort: qualquer falha deixa o container antigo intacto e
 * o desbloqueio segue. Antes de sobrescrever, `migrateAndPersist` grava o
 * snapshot `vault.zkv.v<versão>.bak`, que é o caminho de downgrade.
 */

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

/**
 * Monta o container migrado ou devolve `null` quando não há nada a fazer.
 *
 * Lança quando o manifesto não abre ou não confere com o diretório: um cofre
 * adulterado não pode ser "consertado" pela migração, e o chamador decide se
 * isso derruba o desbloqueio (não derruba).
 */
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
    // antes de re-selar, o manifesto atual precisa bater com o diretório: a
    // migração não pode transformar uma troca de arquivo em estado legítimo.
    // Quando só o custo do Argon2id mudou, o manifesto fica intocado (e um
    // manifesto adulterado continua sendo acusado na primeira leitura).
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

/**
 * Prepara a migração sem deixar a falha escapar. Devolve o próprio container
 * quando não há nada a fazer ou quando a migração não foi possível.
 */
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

/**
 * Grava o container migrado, criando o snapshot de downgrade antes.
 *
 * `requireBackup` separa os dois casos: no desbloqueio, sem snapshot não há
 * downgrade e a migração é abortada com o arquivo antigo intacto; na
 * redefinição de PIN, o novo PIN já foi embrulhado e precisa ser gravado mesmo
 * assim, então a falta de snapshot é só um aviso.
 */
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

/**
 * Prepara e grava a migração. A função nunca lança: o desbloqueio já provou a
 * credencial e não pode ser derrubado por uma migração que é conveniência de
 * formato.
 */
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
