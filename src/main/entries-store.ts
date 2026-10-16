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
import { randomBytes } from '@zero/main/crypto';
import { SHRED_PASSES, shredFile } from '@zero/main/shred';
import type { SaltedPayload } from '@zero/main/crypto';
import type { TempCleanupResult } from '@zero/types';

/**
 * Arquivos individuais das credenciais (`.entries/<uuid>.zke`). Saiu de
 * `storage.ts` para caber o erasure sem estourar o teto de linhas do
 * repositório: o container (`vault.zkv`), a trava e o manifesto ficam lá, e aqui
 * fica tudo que é um arquivo por credencial.
 */

/** Extensão única de payload de credencial; o binário tem magic próprio. */
const ENTRY_EXTENSION = 'zke';

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

/**
 * Segunda camada contra path traversal (classe do CVE-2026-21589): o caminho
 * do arquivo só é montado a partir de id sem separador nem byte nulo, então
 * nenhum chamador consegue escapar de `.entries/` com `../`.
 */
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

export function writeEntryPayload(id: string, payload: SaltedPayload): void {
  assertSafeEntryId(id);
  ensureVaultStructure();
  writeSecretFile(entryFile(id), packEntryPayload(payload));
}

/**
 * Remove os arquivos da credencial com sobrescrita. Os `.zke` já são texto
 * cifrado e, sem a chave do cofre, são irrecuperáveis mesmo sem sobrescrita:
 * o shred aqui é higiene, não o controle principal (que é o Cryptographic Erase,
 * em `src/main/erase.ts`). O caminho chega sempre de `entryFile()`, nunca de
 * id cru, então o shred não vira rota alternativa para path traversal.
 */
export function deleteEntry(id: string): void {
  assertSafeEntryId(id);
  const file = entryFile(id);
  if (fs.existsSync(file)) shredFile(file, SHRED_PASSES);
}

/**
 * Temporários órfãos: um `.tmp` deixado por um crash não é coberto pelo
 * manifesto (`listEntryIds` só lista `.zke`), então sobrevive sem ninguém notar. Os mais velhos que `maxAgeMs` são sobrescritos e apagados; os
 * mais novos são deixados intactos, porque podem ser de uma escrita em curso.
 */
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
