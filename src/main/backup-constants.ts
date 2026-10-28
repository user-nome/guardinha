/** Constantes do formato de backup (`.gbk`); detalhes em docs/backup.md. */

export const BACKUP_MAGIC = Buffer.from('ZKBACKUP', 'ascii');
export const BACKUP_VERSION = 1;

export const BACKUP_HEADER_BYTES = 16; // magic(8) + version(4) + manifestLen(4)
export const BACKUP_DIGEST_BYTES = 32; // SHA-256

/** Caminhos aceitos dentro do pacote. */
export const BACKUP_FILE_PATH =
  /^(?:vault\.zkv|\.entries\/[A-Za-z0-9-]+\.zke|\.auth\/[A-Za-z0-9-]+\.zka)$/;

/** Nome do app no manifesto do backup. */
export const BACKUP_APP_NAME = 'Guardinha';
