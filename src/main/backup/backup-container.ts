import crypto from 'node:crypto';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';

/** Formato do `.gbk`: cabeçalho, manifesto, payload já cifrado e SHA-256 no fim. */

const BACKUP_MAGIC = Buffer.from('ZKBACKUP', 'ascii');
const BACKUP_VERSION = 1;

/** `magic(8) + version(4) + manifestLen(4)`. */
const HEADER_BYTES = 16;
const DIGEST_BYTES = 32;

/** Lista fechada: o nome nunca vem do conteúdo, então `../` não entra. */
const FILE_PATH = /^(?:vault\.zkv|\.entries\/[A-Za-z0-9-]+\.zke|\.auth\/[A-Za-z0-9-]+\.zka)$/;

/** Aplicativo que gerou o backup (nome de marca, não se traduz). */
const APP_NAME = 'Guardinha';

/** Um arquivo do cofre dentro do manifesto. */
export interface BackupFileEntry {
  path: string;
  size: number;
  sha256: string;
}

/** Metadados de validação gravados no pacote. */
export interface BackupManifest {
  app: string;
  version: string;
  createdAt: number;
  files: BackupFileEntry[];
}

/** Arquivo do cofre a empacotar ou já extraído. */
export interface BackupSegment {
  path: string;
  data: Buffer;
}

/** Pacote aberto: o manifesto e os arquivos que ele promete. */
export interface OpenedBackup {
  manifest: BackupManifest;
  files: BackupSegment[];
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function invalid(): Error {
  return new Error(currentMessages().errors.backupInvalid);
}

function corrupted(): Error {
  return new Error(currentMessages().errors.backupCorrupted);
}

function unsupportedVersion(version: number): Error {
  return new Error(currentMessages().errors.backupUnsupportedVersion(version));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** Confere o manifesto lido do disco, campo a campo (fail-closed). */
function readManifest(value: unknown): BackupManifest | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record.app !== 'string' || record.app === '') return null;
  if (typeof record.version !== 'string') return null;
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null;
  if (!Array.isArray(record.files)) return null;

  const files: BackupFileEntry[] = [];
  for (const item of record.files) {
    const entry = asRecord(item);
    if (entry === null) return null;
    if (typeof entry.path !== 'string' || !FILE_PATH.test(entry.path)) return null;
    if (typeof entry.size !== 'number' || !Number.isInteger(entry.size) || entry.size < 0) {
      return null;
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) return null;
    files.push({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  }
  return { app: record.app, version: record.version, createdAt: record.createdAt, files };
}

/** Empacota manifesto e digest; valida os caminhos para não gerar pacote irrecuperável. */
export function packBackup(files: readonly BackupSegment[], appVersion: string): Buffer {
  const entries: BackupFileEntry[] = [];
  for (const file of files) {
    if (!FILE_PATH.test(file.path)) throw invalid();
    entries.push({ path: file.path, size: file.data.length, sha256: sha256(file.data) });
  }
  const manifest: BackupManifest = {
    app: APP_NAME,
    version: appVersion,
    createdAt: Date.now(),
    files: entries,
  };
  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf8');
  const header = Buffer.alloc(HEADER_BYTES);
  BACKUP_MAGIC.copy(header, 0);
  header.writeUInt32BE(BACKUP_VERSION, 8);
  header.writeUInt32BE(manifestJson.length, 12);

  const body = Buffer.concat([header, manifestJson, ...files.map((file) => file.data)]);
  return Buffer.concat([body, crypto.createHash('sha256').update(body).digest()]);
}

/** Confere tudo (magic, versão, digest, cada arquivo) antes de devolver qualquer byte. */
export function unpackBackup(raw: Buffer): OpenedBackup {
  if (raw.length < HEADER_BYTES + DIGEST_BYTES) throw invalid();
  if (!raw.subarray(0, 8).equals(BACKUP_MAGIC)) throw invalid();

  const version = raw.readUInt32BE(8);
  if (version !== BACKUP_VERSION) throw unsupportedVersion(version);

  const body = raw.subarray(0, raw.length - DIGEST_BYTES);
  const digest = raw.subarray(raw.length - DIGEST_BYTES);
  const expected = crypto.createHash('sha256').update(body).digest();
  if (!crypto.timingSafeEqual(digest, expected)) throw corrupted();

  const manifestLength = body.readUInt32BE(12);
  const payloadStart = HEADER_BYTES + manifestLength;
  if (manifestLength === 0 || payloadStart > body.length) throw corrupted();

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.subarray(HEADER_BYTES, payloadStart).toString('utf8'));
  } catch {
    throw corrupted();
  }
  const manifest = readManifest(parsed);
  if (manifest === null) throw corrupted();

  const files: BackupSegment[] = [];
  let offset = payloadStart;
  for (const entry of manifest.files) {
    const end = offset + entry.size;
    if (end > body.length) throw corrupted();
    const data = body.subarray(offset, end);
    if (sha256(data) !== entry.sha256) throw corrupted();
    files.push({ path: entry.path, data: Buffer.from(data) });
    offset = end;
  }
  if (offset !== body.length) throw corrupted();

  return { manifest, files };
}
