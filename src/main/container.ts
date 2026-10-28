import { decryptRecord, encryptRecord, isValidKdfParams } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';
import type { Argon2Params, SaltedPayload } from '@zero/types/crypto';
import {
  VAULT_MAGIC,
  ENTRY_MAGIC,
  READABLE_VAULT_VERSIONS,
  MANIFEST_VERSION,
  LEGACY_MANIFEST_VERSION,
  MAGIC_BYTES,
  UINT32_BYTES,
  METHOD_KDF_BYTES,
  BLOB_HEADER_BYTES,
  VAULT_HEADER_BYTES,
  ENTRY_HEADER_BYTES,
  BLOB_SALT_OFFSET,
  BLOB_IV_OFFSET,
  BLOB_TAG_OFFSET,
  BLOB_LENGTH_OFFSET,
  BLOB_TEXT_OFFSET,
  ENTRY_SALT_OFFSET,
  ENTRY_IV_OFFSET,
  ENTRY_TAG_OFFSET,
  ENTRY_LENGTH_OFFSET,
  ENTRY_TEXT_OFFSET,
  FLAG_MASTER,
  FLAG_PIN,
  FLAG_RECOVERY,
  SALT_BYTES,
  FLAG_MANIFEST,
  FLAG_PANIC,
  FLAGS_ALL,
  VERSION_OFFSET,
  CREATED_AT_OFFSET,
  ATTEMPTS_OFFSET,
  LOCK_UNTIL_OFFSET,
  FLAGS_OFFSET,
  ATTEMPTS_MASTER_OFFSET,
  NUKE_LIMIT_OFFSET,
} from '@zero/main/container-format';

/**
 * Formato binário do cofre. Nenhum arquivo legível de fora do app:
 *
 * - `vault.zkv` (magic `ZKVAULT1`): contagem da trava exponencial + blobs de
 *   chave embrulhados (cada um com o custo de Argon2id do seu método) + o
 *   limite de autodestruição + manifesto cifrado.
 * - `.entries/<uuid>.zke` (magic `ZENTRY01`): salt | IV | tag | texto cifrado.
 *
 * Toda leitura é fail-closed: forma inválida, truncamento, parâmetro KDF fora
 * da faixa ou byte adulterado devolvem `null` (ou lançam), nunca conteúdo em
 * claro.
 */

export interface VaultKdfParams extends Argon2Params {
  algo: 'argon2id';
}

/** Chave do cofre embrulhada por uma credencial (Argon2id + AES-256-GCM). */
export interface WrappedMethod {
  /** Custo do Argon2id usado só neste método (PIN é o mais caro). */
  kdf: VaultKdfParams;
  /** Salt do Argon2id (128 bits). */
  kdfSalt: string;
  /** Registro cifrado com a própria chave derivada. */
  payload: SaltedPayload;
}

/**
 * Chave do cofre embrulhada por cada credencial (blobs cifrados). Cada
 * entrada é opcional de propósito: um cofre novo não tem PIN de pânico, e um
 * cofre que perdeu a senha mestra pode ainda ter a frase de recuperação.
 */
export interface VaultMethods {
  master?: WrappedMethod;
  pin?: WrappedMethod;
  recovery?: WrappedMethod;
  /** PIN de coação: embrulha uma chave decoy, sem relação com a chave real. */
  panic?: WrappedMethod;
}

export interface VaultContainerData {
  /**
   * Versão lida do arquivo. `packVaultContainer` grava exatamente esta versão,
   * e não a atual: uma gravação incidental (trava exponencial, troca de PIN)
   * não pode promover o container sem a migração dos métodos e do manifesto,
   * que é o que mantém o caminho de downgrade aberto.
   */
  version: number;
  createdAt: number;
  attempts: number;
  lockUntil: number | null;
  /** Falhas só da senha mestra; o PIN não soma aqui. */
  attemptsMaster: number;
  /**
   * Falhas consecutivas da senha mestra que disparam o Cryptographic Erase.
   * `0` é desligado, e é o padrão: autodestruição por contagem
   * é decisão do usuário, nunca surpresa. Ver `SECURITY.md`.
   */
  nukeLimit: number;
  /** Chave do cofre embrulhada por cada credencial (blobs cifrados). */
  methods: VaultMethods;
  /** Lista de ids cifrada com a chave do cofre; `null` = ainda não sellada. */
  manifest: SaltedPayload | null;
}

/** Nome do método de desbloqueio, na ordem em que os flags aparecem no arquivo. */
export type WrappedMethodName = 'master' | 'pin' | 'recovery' | 'panic';

/** Par do reader de blob: o que leu e onde recomeçar a ler. */
interface BlobRead {
  payload: SaltedPayload;
  next: number;
}

/** Par do reader de método: o que leu e onde recomeçar a ler. */
interface MethodRead {
  method: WrappedMethod;
  next: number;
}

function blobBytes(payload: SaltedPayload): number {
  return BLOB_HEADER_BYTES + Buffer.from(payload.encryptedData, 'hex').length;
}

function methodBlobBytes(method: WrappedMethod): number {
  return METHOD_KDF_BYTES + SALT_BYTES + blobBytes(method.payload);
}

function assertKdf(value: VaultKdfParams): void {
  if (!isValidKdfParams(value)) throw new Error(currentMessages().errors.invalidKdfParams);
}

function writeBlob(buffer: Buffer, offset: number, payload: SaltedPayload): number {
  Buffer.from(payload.salt, 'hex').copy(buffer, offset + BLOB_SALT_OFFSET);
  Buffer.from(payload.iv, 'hex').copy(buffer, offset + BLOB_IV_OFFSET);
  Buffer.from(payload.tag, 'hex').copy(buffer, offset + BLOB_TAG_OFFSET);
  const text = Buffer.from(payload.encryptedData, 'hex');
  buffer.writeUInt32BE(text.length, offset + BLOB_LENGTH_OFFSET);
  text.copy(buffer, offset + BLOB_TEXT_OFFSET);
  return offset + BLOB_HEADER_BYTES + text.length;
}

function readBlob(buffer: Buffer, offset: number): BlobRead | null {
  const head = offset + BLOB_HEADER_BYTES;
  if (head > buffer.length) return null;
  const textLength = buffer.readUInt32BE(offset + BLOB_LENGTH_OFFSET);
  const end = head + textLength;
  if (end > buffer.length) return null;
  return {
    payload: {
      salt: buffer.subarray(offset + BLOB_SALT_OFFSET, offset + BLOB_IV_OFFSET).toString('hex'),
      iv: buffer.subarray(offset + BLOB_IV_OFFSET, offset + BLOB_TAG_OFFSET).toString('hex'),
      tag: buffer.subarray(offset + BLOB_TAG_OFFSET, offset + BLOB_LENGTH_OFFSET).toString('hex'),
      encryptedData: buffer.subarray(head, end).toString('hex'),
    },
    next: end,
  };
}

function writeMethodBlob(buffer: Buffer, offset: number, method: WrappedMethod): number {
  buffer.writeUInt32BE(method.kdf.memoryKiB, offset);
  buffer.writeUInt32BE(method.kdf.iterations, offset + UINT32_BYTES);
  buffer.writeUInt32BE(method.kdf.parallelism, offset + 2 * UINT32_BYTES);
  Buffer.from(method.kdfSalt, 'hex').copy(buffer, offset + METHOD_KDF_BYTES);
  return writeBlob(buffer, offset + METHOD_KDF_BYTES + SALT_BYTES, method.payload);
}

function readKdfAt(buffer: Buffer, offset: number): VaultKdfParams | null {
  if (offset + METHOD_KDF_BYTES > buffer.length) return null;
  const kdf: VaultKdfParams = {
    algo: 'argon2id',
    memoryKiB: buffer.readUInt32BE(offset),
    iterations: buffer.readUInt32BE(offset + UINT32_BYTES),
    parallelism: buffer.readUInt32BE(offset + 2 * UINT32_BYTES),
  };
  return isValidKdfParams(kdf) ? kdf : null;
}

function readMethodBlob(buffer: Buffer, offset: number, kdf: VaultKdfParams): MethodRead | null {
  if (offset + SALT_BYTES > buffer.length) return null;
  const read = readBlob(buffer, offset + SALT_BYTES);
  if (read === null) return null;
  return {
    method: {
      kdf,
      kdfSalt: buffer.subarray(offset, offset + SALT_BYTES).toString('hex'),
      payload: read.payload,
    },
    next: read.next,
  };
}

export function packVaultContainer(data: VaultContainerData): Buffer {
  if (!READABLE_VAULT_VERSIONS.includes(data.version)) {
    throw new Error(currentMessages().errors.vaultUnsupportedVersion(data.version));
  }
  const methods: [number, WrappedMethod | undefined][] = [
    [FLAG_MASTER, data.methods.master],
    [FLAG_PIN, data.methods.pin],
    [FLAG_RECOVERY, data.methods.recovery],
    [FLAG_PANIC, data.methods.panic],
  ];
  let flags = 0;
  let size = VAULT_HEADER_BYTES;
  for (const [flag, method] of methods) {
    if (method !== undefined) {
      assertKdf(method.kdf);
      flags |= flag;
      size += methodBlobBytes(method);
    }
  }
  if (data.manifest !== null) {
    flags |= FLAG_MANIFEST;
    size += blobBytes(data.manifest);
  }

  const buffer = Buffer.alloc(size);
  VAULT_MAGIC.copy(buffer, 0);
  buffer.writeUInt32BE(data.version, VERSION_OFFSET);
  buffer.writeBigUInt64BE(BigInt(data.createdAt), CREATED_AT_OFFSET);
  buffer.writeUInt32BE(data.attempts, ATTEMPTS_OFFSET);
  buffer.writeBigInt64BE(BigInt(data.lockUntil ?? 0), LOCK_UNTIL_OFFSET);
  buffer.writeUInt8(flags, FLAGS_OFFSET);
  buffer.writeUInt32BE(data.attemptsMaster, ATTEMPTS_MASTER_OFFSET);
  buffer.writeUInt32BE(data.nukeLimit, NUKE_LIMIT_OFFSET);

  let cursor = VAULT_HEADER_BYTES;
  for (const [flag, method] of methods) {
    if (method !== undefined && (flags & flag) !== 0) {
      cursor = writeMethodBlob(buffer, cursor, method);
    }
  }
  if (data.manifest !== null) cursor = writeBlob(buffer, cursor, data.manifest);

  return buffer.subarray(0, cursor);
}

/**
 * Por que a leitura recusou. As duas razões pedem respostas diferentes na tela:
 * `unsupported-version` é um cofre inteiro e legível por outra versão do app
 * (nada foi corrompido), e `damaged` é o arquivo que não presta. Colapsar as
 * duas num `null` só fazia o usuário receber "alterado fora do app" para um
 * cofre que está perfeitamente intacto.
 */
export type VaultUnpackFailure = 'unsupported-version' | 'damaged';

export type VaultUnpackResult =
  | { ok: true; data: VaultContainerData }
  | { ok: false; reason: VaultUnpackFailure; version?: number };

export function unpackVaultContainer(buffer: Buffer): VaultUnpackResult {
  if (buffer.length < VAULT_HEADER_BYTES) return { ok: false, reason: 'damaged' };
  if (!buffer.subarray(0, MAGIC_BYTES).equals(VAULT_MAGIC)) return { ok: false, reason: 'damaged' };
  // versão diferente é arquivo de outra época (ou de futuro): fail-closed, mas
  // com o número à mão para a tela explicar o que aconteceu
  const version = buffer.readUInt32BE(VERSION_OFFSET);
  if (!READABLE_VAULT_VERSIONS.includes(version)) {
    return { ok: false, reason: 'unsupported-version', version };
  }
  const flags = buffer.readUInt8(FLAGS_OFFSET);
  // flag desconhecida = arquivo adulterado (ou de versão futura): fail-closed
  if ((flags & ~FLAGS_ALL) !== 0) return { ok: false, reason: 'damaged' };

  let cursor = VAULT_HEADER_BYTES;
  const methods: VaultContainerData['methods'] = {};
  const entries: [number, WrappedMethodName][] = [
    [FLAG_MASTER, 'master'],
    [FLAG_PIN, 'pin'],
    [FLAG_RECOVERY, 'recovery'],
    [FLAG_PANIC, 'panic'],
  ];
  for (const [flag, name] of entries) {
    if ((flags & flag) === 0) continue;
    const kdf = readKdfAt(buffer, cursor);
    if (kdf === null) return { ok: false, reason: 'damaged' };
    cursor += METHOD_KDF_BYTES;
    const read = readMethodBlob(buffer, cursor, kdf);
    if (read === null) return { ok: false, reason: 'damaged' };
    methods[name] = read.method;
    cursor = read.next;
  }

  let manifest: SaltedPayload | null = null;
  if ((flags & FLAG_MANIFEST) !== 0) {
    const read = readBlob(buffer, cursor);
    if (read === null) return { ok: false, reason: 'damaged' };
    manifest = read.payload;
    cursor = read.next;
  }

  if (cursor !== buffer.length) return { ok: false, reason: 'damaged' };
  if (methods.master === undefined && methods.pin === undefined) {
    return { ok: false, reason: 'damaged' };
  }

  const lockUntilRaw = buffer.readBigInt64BE(LOCK_UNTIL_OFFSET);
  return {
    ok: true,
    data: {
      version,
      createdAt: Number(buffer.readBigUInt64BE(CREATED_AT_OFFSET)),
      attempts: buffer.readUInt32BE(ATTEMPTS_OFFSET),
      lockUntil: lockUntilRaw === 0n ? null : Number(lockUntilRaw),
      attemptsMaster: buffer.readUInt32BE(ATTEMPTS_MASTER_OFFSET),
      nukeLimit: buffer.readUInt32BE(NUKE_LIMIT_OFFSET),
      methods,
      manifest,
    },
  };
}

export function packEntryPayload(payload: SaltedPayload): Buffer {
  const text = Buffer.from(payload.encryptedData, 'hex');
  const buffer = Buffer.alloc(ENTRY_HEADER_BYTES + text.length);
  ENTRY_MAGIC.copy(buffer, 0);
  Buffer.from(payload.salt, 'hex').copy(buffer, ENTRY_SALT_OFFSET);
  Buffer.from(payload.iv, 'hex').copy(buffer, ENTRY_IV_OFFSET);
  Buffer.from(payload.tag, 'hex').copy(buffer, ENTRY_TAG_OFFSET);
  buffer.writeUInt32BE(text.length, ENTRY_LENGTH_OFFSET);
  text.copy(buffer, ENTRY_TEXT_OFFSET);
  return buffer;
}

export function unpackEntryPayload(buffer: Buffer): SaltedPayload | null {
  if (buffer.length < ENTRY_HEADER_BYTES) return null;
  if (!buffer.subarray(0, MAGIC_BYTES).equals(ENTRY_MAGIC)) return null;
  const textLength = buffer.readUInt32BE(ENTRY_LENGTH_OFFSET);
  if (buffer.length !== ENTRY_HEADER_BYTES + textLength) return null;
  return {
    salt: buffer.subarray(ENTRY_SALT_OFFSET, ENTRY_IV_OFFSET).toString('hex'),
    iv: buffer.subarray(ENTRY_IV_OFFSET, ENTRY_TAG_OFFSET).toString('hex'),
    tag: buffer.subarray(ENTRY_TAG_OFFSET, ENTRY_LENGTH_OFFSET).toString('hex'),
    encryptedData: buffer.subarray(ENTRY_TEXT_OFFSET).toString('hex'),
  };
}

/** Ids e hashes que o manifesto afirma existir: credenciais e tokens de 2FA. */
export interface ManifestHashes {
  /** SHA-256 dos bytes de cada `.zke`, por id da credencial. */
  entries: Record<string, string>;
  /** SHA-256 dos bytes de cada `.zka`, por id do token. */
  auth: Record<string, string>;
}

export interface ManifestContent extends ManifestHashes {
  /** Versão lida do manifesto: `3` (hashes) ou `2` (só ids, da v5). */
  version: number;
  ids: string[];
  authIds: string[];
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || id === '') return null;
    result.push(id);
  }
  return result;
}

/** Mapa id → SHA-256 hexadecimal; qualquer forma fora disso invalida o manifesto. */
function hashMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, string> = {};
  for (const [id, hash] of Object.entries(value)) {
    if (id === '' || typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) return null;
    result[id] = hash;
  }
  return result;
}

/**
 * Sela ids, hashes de conteúdo e a chave do cofre (AES-256-GCM + HKDF). O hash
 * por arquivo é o que pega a troca de conteúdo entre dois nomes que já existem
 * (P6): o conjunto de ids continua igual, mas o SHA-256 não bate.
 */
export function sealManifest(
  vaultKey: Buffer,
  ids: string[],
  authIds: string[],
  hashes: ManifestHashes,
  version: number = MANIFEST_VERSION,
): SaltedPayload {
  if (version === LEGACY_MANIFEST_VERSION) {
    // a v2 não conhece os hashes: gravá-los aqui só criaria um campo que o
    // leitor antigo ignora e que ninguém confere
    return encryptRecord({ v: version, ids, authIds }, vaultKey);
  }
  if (version !== MANIFEST_VERSION) {
    throw new Error(currentMessages().errors.invalidManifest);
  }
  return encryptRecord(
    { v: version, ids, authIds, entries: hashes.entries, auth: hashes.auth },
    vaultKey,
  );
}

/**
 * Abre o manifesto; qualquer forma inesperada lança (fail-closed). A v2 é a
 * única versão antiga aceita: ela não tem hashes, então a conferência de
 * conteúdo fica para depois da migração, que a re-sela na v3.
 */
export function openManifest(vaultKey: Buffer, payload: SaltedPayload): ManifestContent {
  const m = currentMessages();
  const decoded = decryptRecord(payload, vaultKey);
  if (!isRecord(decoded)) throw new Error(m.errors.invalidManifest);
  const value = decoded;
  const version = value.v;
  if (version !== MANIFEST_VERSION && version !== LEGACY_MANIFEST_VERSION) {
    throw new Error(m.errors.invalidManifest);
  }
  const ids = stringList(value.ids);
  if (ids === null) throw new Error(m.errors.invalidManifest);
  const authIds = stringList(value.authIds);
  if (authIds === null) throw new Error(m.errors.invalidManifest);
  if (version === LEGACY_MANIFEST_VERSION) {
    return { version, ids, authIds, entries: {}, auth: {} };
  }
  const entries = hashMap(value.entries);
  if (entries === null) throw new Error(m.errors.invalidManifest);
  const auth = hashMap(value.auth);
  if (auth === null) throw new Error(m.errors.invalidManifest);
  return { version, ids, authIds, entries, auth };
}
