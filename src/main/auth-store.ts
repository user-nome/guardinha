import fs from 'fs-extra';
import path from 'node:path';
import { packEntryPayload, unpackEntryPayload } from '@zero/main/container';
import { sha256Hex } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { authDir } from '@zero/main/layout';
import { ensureVaultStructure, writeSecretFile } from '@zero/main/structure';
import { SHRED_PASSES, shredFile } from '@zero/main/shred';
import type { SaltedPayload } from '@zero/types/crypto';

/** Arquivos individuais dos tokens de 2FA (`.auth/<uuid>.zka`), um segredo por arquivo. */

const AUTH_EXTENSION = 'zka';

/** Segunda camada contra path traversal: id sem separador nem byte nulo escapa de `.auth/`. */
function assertSafeAuthId(id: string): void {
  if (id === '' || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(currentMessages().errors.invalidId);
  }
}

function authFile(id: string): string {
  return path.join(authDir(), `${id}.${AUTH_EXTENSION}`);
}

export function listAuthIds(): string[] {
  ensureVaultStructure();
  const ids = new Set<string>();
  for (const file of fs.readdirSync(authDir())) {
    if (file.endsWith(`.${AUTH_EXTENSION}`)) ids.add(file.slice(0, -(AUTH_EXTENSION.length + 1)));
  }
  return [...ids];
}

export function readAuthPayload(id: string): SaltedPayload {
  assertSafeAuthId(id);
  ensureVaultStructure();
  const file = authFile(id);
  if (!fs.existsSync(file)) throw new Error(currentMessages().errors.authTokenNotFound);
  const payload = unpackEntryPayload(fs.readFileSync(file));
  if (payload === null) throw new Error(currentMessages().errors.vaultTampered);
  return payload;
}

/** SHA-256 dos bytes gravados, para o manifesto prender o conteúdo (P6). */
export function hashAuth(id: string): string {
  assertSafeAuthId(id);
  return sha256Hex(fs.readFileSync(authFile(id)));
}

/** Grava de forma atômica, em 0600, como as credenciais. */
export function writeAuthPayload(id: string, payload: SaltedPayload): void {
  assertSafeAuthId(id);
  ensureVaultStructure();
  writeSecretFile(authFile(id), packEntryPayload(payload));
}

/**
 * Apaga o arquivo do token com sobrescrita. Como nas credenciais, o shred aqui
 * é higiene: o que realmente destroys o segredo TOTP é o Cryptographic Erase
 * (apagar o `vault.zkv` zera a chave), não a reescrita do arquivo.
 */
export function deleteAuth(id: string): void {
  assertSafeAuthId(id);
  ensureVaultStructure();
  const file = authFile(id);
  if (fs.existsSync(file)) shredFile(file, SHRED_PASSES);
}
