import { IV_BYTES, SALT_BYTES, TAG_BYTES } from '@zero/main/crypto-constants';

/**
 * Layout binário do `vault.zkv` e do `.zke`; mudar um valor muda o arquivo em disco.
 * Detalhes em docs/cofre.md.
 */

/** Magic do container: `ZKVAULT1`. */
export const VAULT_MAGIC = Buffer.from('ZKVAULT1', 'ascii');

/** Magic do payload individual de credencial: `ZENTRY01`. */
export const ENTRY_MAGIC = Buffer.from('ZENTRY01', 'ascii');

/** Versão atual do container, a única que este app grava. */
export const VAULT_VERSION = 6;

/** Versões antigas ainda lidas para migrar; a v5 tem o mesmo layout binário da v6. */
export const LEGACY_VAULT_VERSIONS = [5] as const;

/** Toda versão que `unpackVaultContainer` aceita: a atual e as migráveis. */
export const READABLE_VAULT_VERSIONS: readonly number[] = [VAULT_VERSION, ...LEGACY_VAULT_VERSIONS];

/** Versão do manifesto cifrado dentro do container. */
export const MANIFEST_VERSION = 3;

/** Versão do manifesto da v5: só os ids, sem os hashes de conteúdo. */
export const LEGACY_MANIFEST_VERSION = 2;

/** Largura de cada campo primitivo do cabeçalho. */
export const MAGIC_BYTES = 8;
export const UINT32_BYTES = 4;
export const UINT64_BYTES = 8;
export const FLAGS_BYTES = 1;

/** Três `UInt32BE`: memória, iterações e paralelismo do Argon2id. */
export const METHOD_KDF_BYTES = 3 * UINT32_BYTES;

/** `salt(16) + iv(16) + tag(16) + ctLen(4)` antes do texto cifrado. */
export const BLOB_HEADER_BYTES = SALT_BYTES + IV_BYTES + TAG_BYTES + UINT32_BYTES;

/** `magic(8) + version(4) + createdAt(8) + attempts(4) + lockUntil(8) + flags(1) + rest(8)`. */
export const VAULT_HEADER_BYTES =
  MAGIC_BYTES +
  UINT32_BYTES +
  UINT64_BYTES +
  UINT32_BYTES +
  UINT64_BYTES +
  FLAGS_BYTES +
  UINT32_BYTES +
  UINT32_BYTES;

/** `magic(8) + salt(16) + iv(16) + tag(16) + ctLen(4)`. */
export const ENTRY_HEADER_BYTES = MAGIC_BYTES + BLOB_HEADER_BYTES;

/** Offsets do cabeçalho do container. */
export const VERSION_OFFSET = MAGIC_BYTES;
export const CREATED_AT_OFFSET = VERSION_OFFSET + UINT32_BYTES;
export const ATTEMPTS_OFFSET = CREATED_AT_OFFSET + UINT64_BYTES;
export const LOCK_UNTIL_OFFSET = ATTEMPTS_OFFSET + UINT32_BYTES;
export const FLAGS_OFFSET = LOCK_UNTIL_OFFSET + UINT64_BYTES;
export const ATTEMPTS_MASTER_OFFSET = FLAGS_OFFSET + FLAGS_BYTES;
export const NUKE_LIMIT_OFFSET = ATTEMPTS_MASTER_OFFSET + UINT32_BYTES;

/** Offsets dentro de um blob cifrado (`salt | iv | tag | tamanho | texto`). */
export const BLOB_SALT_OFFSET = 0;
export const BLOB_IV_OFFSET = BLOB_SALT_OFFSET + SALT_BYTES;
export const BLOB_TAG_OFFSET = BLOB_IV_OFFSET + IV_BYTES;
export const BLOB_LENGTH_OFFSET = BLOB_TAG_OFFSET + TAG_BYTES;
export const BLOB_TEXT_OFFSET = BLOB_HEADER_BYTES;

/** Offsets dentro do `.zke` (`magic | salt | iv | tag | tamanho | texto`). */
export const ENTRY_SALT_OFFSET = MAGIC_BYTES;
export const ENTRY_IV_OFFSET = ENTRY_SALT_OFFSET + SALT_BYTES;
export const ENTRY_TAG_OFFSET = ENTRY_IV_OFFSET + IV_BYTES;
export const ENTRY_LENGTH_OFFSET = ENTRY_TAG_OFFSET + TAG_BYTES;
export const ENTRY_TEXT_OFFSET = ENTRY_HEADER_BYTES;

export const FLAG_MASTER = 0x01;
export const FLAG_PIN = 0x02;
export const FLAG_RECOVERY = 0x04;
export const FLAG_MANIFEST = 0x08;
/** Embrulho de uma chave decoy, controlado pelo PIN de pânico. */
export const FLAG_PANIC = 0x10;
export const FLAGS_ALL = FLAG_MASTER | FLAG_PIN | FLAG_RECOVERY | FLAG_MANIFEST | FLAG_PANIC;

/** Re-exporta constantes de crypto usadas pelo formato. */
export { IV_BYTES, SALT_BYTES, TAG_BYTES };
