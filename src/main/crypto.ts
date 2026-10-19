import crypto from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { isRecord } from '@zero/shared/record';
import type { Argon2Params, SaltedPayload } from '@zero/types/crypto';
import {
  KEY_BYTES,
  SALT_BYTES,
  IV_BYTES,
  AES_ALGORITHM,
  HKDF_ALGORITHM,
  KEY_INFO_ENTRY,
  KEY_INFO_AUTH,
} from '@zero/main/crypto-constants';
export const KDF_LIMITS = {
  memoryKiB: [16_384, 1_048_576] as const,
  iterations: [1, 8] as const,
  parallelism: [1, 8] as const,
};

/** Senha mestra e frase de recuperação (segredos longos): 128 MiB, t=3, p=4. */
export const KDF_CREDENTIAL: Argon2Params = { memoryKiB: 131_072, iterations: 3, parallelism: 4 };

/** PIN de 8 dígitos (segredo fraco, 10^8 candidatas): 256 MiB, t=4, p=4. */
export const KDF_PIN: Argon2Params = { memoryKiB: 262_144, iterations: 4, parallelism: 4 };

/** Perfil alvo por método de desbloqueio (escrita e migração incremental). */
export function kdfProfileFor(kind: 'master' | 'pin'): Argon2Params {
  return kind === 'pin' ? KDF_PIN : KDF_CREDENTIAL;
}

export function isSameKdf(a: Argon2Params, b: Argon2Params): boolean {
  return (
    a.memoryKiB === b.memoryKiB && a.iterations === b.iterations && a.parallelism === b.parallelism
  );
}

function within(value: unknown, [min, max]: readonly [number, number]): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Parâmetros legíveis dentro da faixa (inteiro, sem NaN, sem estouro). */
export function isValidKdfParams(value: unknown): value is Argon2Params {
  if (!isRecord(value)) return false;
  return (
    within(value.memoryKiB, KDF_LIMITS.memoryKiB) &&
    within(value.iterations, KDF_LIMITS.iterations) &&
    within(value.parallelism, KDF_LIMITS.parallelism)
  );
}

/** Derivação de chave primária via Argon2id com os parâmetros do chamador. */
export async function deriveKey(
  password: string,
  salt: Buffer,
  params: Argon2Params,
): Promise<Buffer> {
  const hashHex = await argon2id({
    password,
    salt: new Uint8Array(salt),
    parallelism: params.parallelism,
    iterations: params.iterations,
    hashLength: KEY_BYTES,
    memorySize: params.memoryKiB,
    outputType: 'hex',
  });
  return Buffer.from(hashHex, 'hex');
}

/**
 * Rótulos de domínio do HKDF. Cada tipo de arquivo tem um, então uma credencial
 * e um token de 2FA com o mesmo salt nunca produzem a mesma chave, mesmo
 * acidentalmente. Trocar um rótulo invalida os arquivos já gravados.
 */

function deriveRecordKey(vaultKey: Buffer, salt: Buffer, info: string): Buffer {
  return Buffer.from(crypto.hkdfSync(HKDF_ALGORITHM, vaultKey, salt, info, KEY_BYTES));
}

/** Mesma derivação, com o rótulo dos tokens de 2FA. */
export function deriveAuthKey(vaultKey: Buffer, salt: Buffer): Buffer {
  return deriveRecordKey(vaultKey, salt, KEY_INFO_AUTH);
}

export function randomBytes(size: number): Buffer {
  return crypto.randomBytes(size);
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

/**
 * Criptografia por arquivo individual com AES-256-GCM.
 * Salt (128-bits) e IV (128-bits) gerados por hardware para cada arquivo.
 * O `info` separa os domínios do HKDF (ver `KEY_INFO_*` acima).
 *
 * Por que 128 bits bastam: salt não é segredo, precisa ser único, e a
 * recomendação do NIST (SP 800-132) é 128 bits, colisão só aparece perto de
 * 2^64 arquivos. No IV, o risco do GCM não é o tamanho, é o reuso (repetir IV
 * com a mesma chave quebra a autenticação); sortear um nonce novo a cada
 * gravação já torna o reuso improvável. Aqui cada registro ainda deriva uma
 * chave própria pelo HKDF, então IV repetido entre arquivos nem se encontra.
 * Aperto que realmente conta contra força bruta é o custo do Argon2id, não o
 * tamanho destes dois.
 */
export function encryptRecord(data: object, key: Buffer, info = KEY_INFO_ENTRY): SaltedPayload {
  const salt = crypto.randomBytes(SALT_BYTES);
  const entryKey = deriveRecordKey(key, salt, info);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(AES_ALGORITHM, entryKey, iv);
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  entryKey.fill(0);

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    encryptedData: encrypted,
  };
}

export function decryptRecord(
  payload: SaltedPayload,
  vaultKey: Buffer,
  info = KEY_INFO_ENTRY,
): unknown {
  const salt = Buffer.from(payload.salt, 'hex');
  const entryKey = deriveRecordKey(vaultKey, salt, info);
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, entryKey, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

  let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  entryKey.fill(0);

  const value: unknown = JSON.parse(decrypted);
  return value;
}

/** Cifra um registro no domínio dos tokens de 2FA. */
export function encryptAuthRecord(data: object, key: Buffer): SaltedPayload {
  return encryptRecord(data, key, KEY_INFO_AUTH);
}

/** Decifra um registro no domínio dos tokens de 2FA. */
export function decryptAuthRecord(payload: SaltedPayload, vaultKey: Buffer): unknown {
  return decryptRecord(payload, vaultKey, KEY_INFO_AUTH);
}

/** Minúsculas, sem acento e com espaços simples (frase escrita pelo usuário). */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ');
}
