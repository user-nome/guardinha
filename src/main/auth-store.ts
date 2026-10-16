import fs from 'fs-extra';
import path from 'node:path';
import { packEntryPayload, unpackEntryPayload } from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { authDir } from '@zero/main/layout';
import { ensureVaultStructure, writeSecretFile } from '@zero/main/structure';
import { SHRED_PASSES, shredFile } from '@zero/main/shred';
import type { SaltedPayload } from '@zero/main/crypto';

/**
 * Arquivos individuais dos tokens de 2FA (`.auth/<uuid>.zka`).
 *
 * Mesmo desenho de `entries-store.ts` e pelo mesmo motivo: um token por
 * arquivo, para que apagar um não obrigue a reescrever o segredo de todos os
 * outros, e para que a cifragem por registro (salt e IV novos a cada gravação)
 * valha para cada um. O conteúdo decifrado é `{ issuer, account, algorithm,
 * digits, period, secret, createdAt, updatedAt }`; o segredo só existe dentro
 * do AES-256-GCM.
 */

const AUTH_EXTENSION = 'zka';

/**
 * Segunda camada contra path traversal: o caminho só é montado a partir de id
 * sem separador nem byte nulo, então nenhum chamador escapa de `.auth/` com
 * `../`. Mesma regra de `entries-store.ts`.
 */
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
