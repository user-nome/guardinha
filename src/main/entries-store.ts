import fs from 'fs-extra';
import path from 'node:path';
import { packEntryPayload, unpackEntryPayload } from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { entriesDir } from '@zero/main/layout';
import {
  ensureVaultStructure,
  TEMP_SUFFIX,
  vaultFiles,
  writeSecretFile,
} from '@zero/main/structure';
import { randomBytes, sha256Hex } from '@zero/main/crypto';
import { SHRED_PASSES, shredFile } from '@zero/main/shred';
import type { SaltedPayload } from '@zero/types/crypto';
import type { TempCleanupResult } from '@zero/types';

/** Arquivos de credencial (`.entries/<uuid>.zke`), um por credencial. */

/** Extensão única de payload de credencial; o binário tem magic próprio. */
const ENTRY_EXTENSION = 'zke';

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

/** Anti path traversal: id sem separador nem byte nulo não escapa de `.entries/`. */
function assertSafeEntryId(id: string): void {
  if (id === '' || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(currentMessages().errors.invalidId);
  }
}

export function createVaultKey(): Buffer {
  return randomBytes(32);
}

export function listEntryIds(): string[] {
  ensureVaultStructure();
  const ids = new Set<string>();
  const suffix = `.${ENTRY_EXTENSION}`;
  for (const file of fs.readdirSync(entriesDir())) {
    if (file.endsWith(suffix)) ids.add(file.slice(0, -suffix.length));
  }
  return [...ids];
}

function entryFile(id: string): string {
  return path.join(entriesDir(), `${id}.${ENTRY_EXTENSION}`);
}

export function readEntryPayload(id: string): SaltedPayload {
  assertSafeEntryId(id);
  const file = entryFile(id);
  if (!fs.existsSync(file)) throw new Error(currentMessages().errors.entryNotFound);
  const raw = fs.readFileSync(file);
  const payload = unpackEntryPayload(raw);
  if (payload === null) throw tampered();
  return payload;
}

/** SHA-256 dos bytes gravados, para o manifesto prender o conteúdo (P6). */
export function hashEntry(id: string): string {
  assertSafeEntryId(id);
  return sha256Hex(fs.readFileSync(entryFile(id)));
}

export function writeEntryPayload(id: string, payload: SaltedPayload): void {
  assertSafeEntryId(id);
  ensureVaultStructure();
  writeSecretFile(entryFile(id), packEntryPayload(payload));
}

/** Shred é higiene: sem a chave, o `.zke` já é irrecuperável; o caminho vem de `entryFile`. */
export function deleteEntry(id: string): void {
  assertSafeEntryId(id);
  const file = entryFile(id);
  if (fs.existsSync(file)) shredFile(file, SHRED_PASSES);
}

/** `.tmp` órfão não está no manifesto: os antigos são sobrescritos, os novos ficam. */
export function cleanStaleTempFiles(maxAgeMs: number): TempCleanupResult {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let kept = 0;
  for (const file of vaultFiles()) {
    if (!file.endsWith(TEMP_SUFFIX)) continue;
    let stale = true;
    try {
      stale = fs.statSync(file).mtimeMs < cutoff;
    } catch {
      // someu no meio da varredura: tenta apagar assim mesmo
    }
    if (!stale) {
      kept++;
      continue;
    }
    if (shredFile(file, SHRED_PASSES)) removed++;
  }
  return { removed, kept };
}
