import { decryptRecord, encryptRecord, isValidKdfParams } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';
import type { Argon2Params, SaltedPayload } from '@zero/types/crypto';

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
const VAULT_MAGIC = Buffer.from('ZKVAULT1', 'ascii');
const ENTRY_MAGIC = Buffer.from('ZENTRY01', 'ascii');

/**
 * Versão 5: o cabeçalho perdeu o tripo global de KDF, que desde a v3 era só
 * informativo (cada método já carrega o custo do próprio Argon2id) e desde a v4
 * não era lido por nada. Uma versão só, sem caminho de leitura anterior: o app
 * ainda não tem usuários, então formato antigo não tem a quem proteger.
 */
const VAULT_VERSION = 5;

/**
 * Cabeçalho de 41 bytes, único e sem versão-dependente:
 *
 * `magic(8) + version(4) + createdAt(8) + attempts(4) + lockUntil(8) + flags(1)
 *  + attemptsMaster(4) + nukeLimit(4)`
 */
const HEADER_BYTES = 41;
const METHOD_KDF_BYTES = 12;
/** `salt(16) + iv(16) + tag(16) + ctLen(4)` antes do texto cifrado. */
const BLOB_HEAD_BYTES = 52;
const ENTRY_HEADER_BYTES = 8 + BLOB_HEAD_BYTES;

const FLAG_MASTER = 0x01;
const FLAG_PIN = 0x02;
const FLAG_RECOVERY = 0x04;
const FLAG_MANIFEST = 0x08;
/** Embrulho de uma chave *decoy*, controlado pelo PIN de coação. */
export const FLAG_PANIC = 0x10;
const FLAGS_ALL = FLAG_MASTER | FLAG_PIN | FLAG_RECOVERY | FLAG_MANIFEST | FLAG_PANIC;

/**
 * Versão do manifesto. O `v` mora dentro do blob AES-256-GCM, então ele não
 * aparece no cabeçalho do container: mudar o manifesto não muda o formato em
 * disco, e o blob continua opaco para quem não tem a chave do cofre.
 */
const MANIFEST_VERSION = 2;

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
  return BLOB_HEAD_BYTES + Buffer.from(payload.encryptedData, 'hex').length;
}

function methodBlobBytes(method: WrappedMethod): number {
  return METHOD_KDF_BYTES + 16 + blobBytes(method.payload);
}

function assertKdf(value: VaultKdfParams): void {
  if (!isValidKdfParams(value)) throw new Error(currentMessages().errors.invalidKdfParams);
}

function writeBlob(buffer: Buffer, offset: number, payload: SaltedPayload): number {
  Buffer.from(payload.salt, 'hex').copy(buffer, offset);
  Buffer.from(payload.iv, 'hex').copy(buffer, offset + 16);
  Buffer.from(payload.tag, 'hex').copy(buffer, offset + 32);
  const text = Buffer.from(payload.encryptedData, 'hex');
  buffer.writeUInt32BE(text.length, offset + 48);
  text.copy(buffer, offset + 52);
  return offset + 52 + text.length;
}

function readBlob(buffer: Buffer, offset: number): BlobRead | null {
  const head = offset + BLOB_HEAD_BYTES;
  if (head > buffer.length) return null;
  const textLength = buffer.readUInt32BE(offset + 48);
  const end = head + textLength;
  if (end > buffer.length) return null;
  return {
    payload: {
      salt: buffer.subarray(offset, offset + 16).toString('hex'),
      iv: buffer.subarray(offset + 16, offset + 32).toString('hex'),
      tag: buffer.subarray(offset + 32, offset + 48).toString('hex'),
      encryptedData: buffer.subarray(head, end).toString('hex'),
    },
    next: end,
  };
}

function writeMethodBlob(buffer: Buffer, offset: number, method: WrappedMethod): number {
  buffer.writeUInt32BE(method.kdf.memoryKiB, offset);
  buffer.writeUInt32BE(method.kdf.iterations, offset + 4);
  buffer.writeUInt32BE(method.kdf.parallelism, offset + 8);
  Buffer.from(method.kdfSalt, 'hex').copy(buffer, offset + METHOD_KDF_BYTES);
  return writeBlob(buffer, offset + METHOD_KDF_BYTES + 16, method.payload);
}

function readKdfAt(buffer: Buffer, offset: number): VaultKdfParams | null {
  if (offset + METHOD_KDF_BYTES > buffer.length) return null;
  const kdf: VaultKdfParams = {
    algo: 'argon2id',
    memoryKiB: buffer.readUInt32BE(offset),
    iterations: buffer.readUInt32BE(offset + 4),
    parallelism: buffer.readUInt32BE(offset + 8),
  };
  return isValidKdfParams(kdf) ? kdf : null;
}

function readMethodBlob(buffer: Buffer, offset: number, kdf: VaultKdfParams): MethodRead | null {
  if (offset + 16 > buffer.length) return null;
  const read = readBlob(buffer, offset + 16);
  if (read === null) return null;
  return {
    method: {
      kdf,
      kdfSalt: buffer.subarray(offset, offset + 16).toString('hex'),
      payload: read.payload,
    },
    next: read.next,
  };
}

export function packVaultContainer(data: VaultContainerData): Buffer {
  const methods: [number, WrappedMethod | undefined][] = [
    [FLAG_MASTER, data.methods.master],
    [FLAG_PIN, data.methods.pin],
    [FLAG_RECOVERY, data.methods.recovery],
    [FLAG_PANIC, data.methods.panic],
  ];
  let flags = 0;
  let size = HEADER_BYTES;
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
  buffer.writeUInt32BE(VAULT_VERSION, 8);
  buffer.writeBigUInt64BE(BigInt(data.createdAt), 12);
  buffer.writeUInt32BE(data.attempts, 20);
  buffer.writeBigInt64BE(BigInt(data.lockUntil ?? 0), 24);
  buffer.writeUInt8(flags, 32);
  buffer.writeUInt32BE(data.attemptsMaster, 33);
  buffer.writeUInt32BE(data.nukeLimit, 37);

  let cursor = HEADER_BYTES;
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
  if (buffer.length < HEADER_BYTES) return { ok: false, reason: 'damaged' };
  if (!buffer.subarray(0, 8).equals(VAULT_MAGIC)) return { ok: false, reason: 'damaged' };
  // versão diferente é arquivo de outra época (ou de futuro): fail-closed, mas
  // com o número à mão para a tela explicar o que aconteceu
  const version = buffer.readUInt32BE(8);
  if (version !== VAULT_VERSION) return { ok: false, reason: 'unsupported-version', version };
  const flags = buffer.readUInt8(32);
  // flag desconhecida = arquivo adulterado (ou de versão futura): fail-closed
  if ((flags & ~FLAGS_ALL) !== 0) return { ok: false, reason: 'damaged' };

  let cursor = HEADER_BYTES;
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

  const lockUntilRaw = buffer.readBigInt64BE(24);
  return {
    ok: true,
    data: {
      createdAt: Number(buffer.readBigUInt64BE(12)),
      attempts: buffer.readUInt32BE(20),
      lockUntil: lockUntilRaw === 0n ? null : Number(lockUntilRaw),
      attemptsMaster: buffer.readUInt32BE(33),
      nukeLimit: buffer.readUInt32BE(37),
      methods,
      manifest,
    },
  };
}

export function packEntryPayload(payload: SaltedPayload): Buffer {
  const text = Buffer.from(payload.encryptedData, 'hex');
  const buffer = Buffer.alloc(ENTRY_HEADER_BYTES + text.length);
  ENTRY_MAGIC.copy(buffer, 0);
  Buffer.from(payload.salt, 'hex').copy(buffer, 8);
  Buffer.from(payload.iv, 'hex').copy(buffer, 24);
  Buffer.from(payload.tag, 'hex').copy(buffer, 40);
  buffer.writeUInt32BE(text.length, 56);
  text.copy(buffer, 60);
  return buffer;
}

export function unpackEntryPayload(buffer: Buffer): SaltedPayload | null {
  if (buffer.length < ENTRY_HEADER_BYTES) return null;
  if (!buffer.subarray(0, 8).equals(ENTRY_MAGIC)) return null;
  const textLength = buffer.readUInt32BE(56);
  if (buffer.length !== ENTRY_HEADER_BYTES + textLength) return null;
  return {
    salt: buffer.subarray(8, 24).toString('hex'),
    iv: buffer.subarray(24, 40).toString('hex'),
    tag: buffer.subarray(40, 56).toString('hex'),
    encryptedData: buffer.subarray(60).toString('hex'),
  };
}

/** Ids que o manifesto afirma existir: credenciais e tokens de 2FA. */
export interface ManifestContent {
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

/** Sela os dois conjuntos de ids com a chave do cofre (AES-256-GCM + HKDF). */
export function sealManifest(vaultKey: Buffer, ids: string[], authIds: string[]): SaltedPayload {
  return encryptRecord({ v: MANIFEST_VERSION, ids, authIds }, vaultKey);
}

/**
 * Abre o manifesto; qualquer forma inesperada lança (fail-closed).
 *
 * A v1 não tem `authIds` e significa lista vazia: ela foi gravada antes de o
 * app saber gerar 2FA, então não há `.auth` que o manifesto precise cobrir.
 */
export function openManifest(vaultKey: Buffer, payload: SaltedPayload): ManifestContent {
  const m = currentMessages();
  const decoded = decryptRecord(payload, vaultKey);
  if (!isRecord(decoded)) throw new Error(m.errors.invalidManifest);
  const value = decoded;
  const ids = stringList(value.ids);
  if (ids === null) throw new Error(m.errors.invalidManifest);
  if (value.v !== MANIFEST_VERSION) throw new Error(m.errors.invalidManifest);
  const authIds = stringList(value.authIds);
  if (authIds === null) throw new Error(m.errors.invalidManifest);
  return { ids, authIds };
}
