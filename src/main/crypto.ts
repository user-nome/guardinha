/** Criptografia do cofre: Argon2id, HKDF e AES-256-GCM por registro. */
import crypto from 'node:crypto';
import v8 from 'node:v8';
import vm from 'node:vm';
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

/** Senha mestra e frase de recuperação: 128 MiB, t=3, p=4. */
export const KDF_CREDENTIAL: Argon2Params = { memoryKiB: 131_072, iterations: 3, parallelism: 4 };

/** PIN de 8 dígitos (10^8 candidatas): 256 MiB, t=4, p=4. */
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

// O WASM do Argon2id usa memória externa ao heap: coletar no fim devolve os 256 MiB ao sistema.
const collectGarbage = createGarbageCollector();

function createGarbageCollector(): (() => void) | null {
  try {
    v8.setFlagsFromString('--expose-gc');
    const collect: unknown = vm.runInNewContext('gc');
    /* v8 ignore next -- Node e Electron devolvem a função com o flag acima;
       sem ela a coleta apenas não acontece. */
    return typeof collect === 'function' ? (collect as () => void) : null;
  } catch {
    /* v8 ignore next -- runtime que recusa o flag: a coleta vira no-op. */
    return null;
  }
}

/** Argon2id binário: a chave só existe em memória apagável, nunca numa string imutável. */
export async function deriveKey(
  password: string,
  salt: Buffer,
  params: Argon2Params,
): Promise<Buffer> {
  const raw = await deriveWithWasm(password, salt, params);
  const key = Buffer.from(raw);
  raw.fill(0);
  return key;
}

/** Argon2id binário; a coleta no `finally` libera o WASM mesmo se falhar. */
async function deriveWithWasm(
  password: string,
  salt: Buffer,
  params: Argon2Params,
): Promise<Uint8Array> {
  try {
    return await argon2id({
      password,
      salt: new Uint8Array(salt),
      parallelism: params.parallelism,
      iterations: params.iterations,
      hashLength: KEY_BYTES,
      memorySize: params.memoryKiB,
      outputType: 'binary',
    });
  } finally {
    collectGarbage?.();
  }
}

// Cada tipo de arquivo tem rótulo HKDF próprio: trocar um rótulo invalida os arquivos gravados.
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

/** SHA-256 em hexadecimal, para o manifesto prender o conteúdo do arquivo (P6). */
export function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

/** AES-256-GCM por arquivo, com salt e IV sorteados e chave própria por registro. */
export function encryptRecord(
  data: object,
  key: Buffer,
  info = KEY_INFO_ENTRY,
  aad?: string,
): SaltedPayload {
  const salt = crypto.randomBytes(SALT_BYTES);
  const entryKey = deriveRecordKey(key, salt, info);
  const iv = crypto.randomBytes(IV_BYTES);

  try {
    const cipher = crypto.createCipheriv(AES_ALGORITHM, entryKey, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
    const jsonStr = JSON.stringify(data);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      encryptedData: encrypted,
    };
  } finally {
    // o `finally` zera a chave do registro mesmo se a cifragem falhar no meio
    entryKey.fill(0);
  }
}

export function decryptRecord(
  payload: SaltedPayload,
  vaultKey: Buffer,
  info = KEY_INFO_ENTRY,
  aad?: string,
): unknown {
  const salt = Buffer.from(payload.salt, 'hex');
  const entryKey = deriveRecordKey(vaultKey, salt, info);

  try {
    const decipher = crypto.createDecipheriv(
      AES_ALGORITHM,
      entryKey,
      Buffer.from(payload.iv, 'hex'),
    );
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

    let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as unknown;
  } finally {
    // a chave de trabalho sai zerada por qualquer caminho, inclusive na exceção
    entryKey.fill(0);
  }
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
