/**
 * Medidas e rótulos da cifra do cofre.
 *
 * Os números ficam aqui para que `crypto.ts`, `unwrapping.ts`, `entries-store.ts`
 * e o formato do container não escrevam `32`, `16` ou `64` cada um do seu jeito.
 * Os rótulos do HKDF são contrato de disco: trocar um deles invalida os arquivos
 * já gravados.
 */

/** Tamanho da chave do cofre e das chaves derivadas, em bytes (256 bits). */
export const KEY_BYTES = 32;

/** Mesma chave em hexadecimal (dois caracteres por byte). */
export const KEY_HEX_LENGTH = KEY_BYTES * 2;

/** Salt do Argon2id e do HKDF, em bytes (128 bits). */
export const SALT_BYTES = 16;

/** IV do AES-256-GCM, em bytes (128 bits). */
export const IV_BYTES = 16;

/** Tag de autenticação do AES-256-GCM, em bytes (128 bits). */
export const TAG_BYTES = 16;

/** Digest do SHA-256, em bytes. */
export const SHA256_BYTES = 32;

/** Mesmo digest em hexadecimal. */
export const SHA256_HEX_LENGTH = SHA256_BYTES * 2;

export const AES_ALGORITHM = 'aes-256-gcm';
export const HKDF_ALGORITHM = 'sha512';

/** Rótulo do HKDF dos arquivos de credencial (`.zke`). */
export const KEY_INFO_ENTRY = 'guardinha-vault-entry-v1';

/** Rótulo do HKDF dos tokens de 2FA (`.zka`). */
export const KEY_INFO_AUTH = 'guardinha-vault-auth-v1';
