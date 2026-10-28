/** Medidas e rótulos da cifra do cofre; os rótulos do HKDF são contrato de disco. */

/** Tamanho da chave do cofre e das derivadas, em bytes. */
export const KEY_BYTES = 32;

/** Mesma chave em hexadecimal. */
export const KEY_HEX_LENGTH = KEY_BYTES * 2;

/** Salt do Argon2id e do HKDF, em bytes. */
export const SALT_BYTES = 16;

/** IV do AES-256-GCM, em bytes. */
export const IV_BYTES = 16;

/** Tag de autenticação do AES-256-GCM, em bytes. */
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

/** Rótulo de domínio de cada método, no `info` do HKDF e na AAD do embrulho. */
export function methodKeyInfo(kind: string): string {
  return `guardinha-method-${kind}-v1`;
}
