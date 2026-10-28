import fs from 'fs-extra';
import {
  openManifest,
  packVaultContainer,
  sealManifest,
  unpackVaultContainer,
} from '@zero/main/container';
import {
  LEGACY_MANIFEST_VERSION,
  MANIFEST_VERSION,
  VAULT_VERSION,
} from '@zero/main/container-format';
import { currentMessages } from '@zero/main/i18n';
import { containerBackupFile, containerFile } from '@zero/main/layout';
import { isVaultDestroyed } from '@zero/main/erasure-state';
import { ensureVaultStructure, writeSecretFile } from '@zero/main/structure';
import { listAuthIds, hashAuth } from '@zero/main/auth-store';
import { listEntryIds, hashEntry } from '@zero/main/entries-store';
import type { ManifestContent, ManifestHashes, VaultContainerData } from '@zero/main/container';
import type { SaltedPayload } from '@zero/types/crypto';
import type { PersistedAuthState } from '@zero/types';

/** Container do cofre (`vault.zkv`): chaves, trava exponencial e manifesto cifrado. */

/** Estado neutro: cofre ausente ou ilegível não pode parecer "tentou 0 vezes". */
const EMPTY_AUTH_STATE: PersistedAuthState = {
  attempts: 0,
  lockUntil: null,
  attemptsMaster: 0,
  nukeLimit: 0,
};

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

/** Cofre de outra versão: não é adulteração, e a mensagem oferece os caminhos reais. */
function unsupportedVersion(version?: number): Error {
  return new Error(currentMessages().errors.vaultUnsupportedVersion(version));
}

export function vaultExists(): boolean {
  return fs.existsSync(containerFile());
}

export function readVaultContainer(): VaultContainerData | null {
  if (!fs.existsSync(containerFile())) return null;
  let raw: Buffer;
  try {
    raw = fs.readFileSync(containerFile());
  } catch {
    throw tampered();
  }
  const unpacked = unpackVaultContainer(raw);
  if (!unpacked.ok) {
    if (unpacked.reason === 'unsupported-version') throw unsupportedVersion(unpacked.version);
    throw tampered();
  }
  return unpacked.data;
}

export function writeVaultContainer(data: VaultContainerData): void {
  // Depois do erase nada recria o container: só `createVault` libera de novo.
  if (isVaultDestroyed()) return;
  ensureVaultStructure();
  writeSecretFile(containerFile(), packVaultContainer(data));
}

/** Cópia do container antes da primeira migração daquela versão: é o caminho de downgrade. */
export function backupContainer(version: number): void {
  const target = containerBackupFile(version);
  if (fs.existsSync(target)) return;
  const raw = fs.readFileSync(containerFile());
  const unpacked = unpackVaultContainer(raw);
  // arquivo mudou entre a leitura e a cópia: abortar a migração em vez de guardar outro
  if (!unpacked.ok || unpacked.data.version !== version) throw tampered();
  writeSecretFile(target, raw);
}

export function readAuthState(): PersistedAuthState {
  try {
    const data = readVaultContainer();
    if (data === null) return EMPTY_AUTH_STATE;
    return {
      attempts: data.attempts,
      lockUntil: data.lockUntil,
      attemptsMaster: data.attemptsMaster,
      nukeLimit: data.nukeLimit,
    };
  } catch {
    // getStatus nunca lança; a adulteração aparece nas operações de dados
    return EMPTY_AUTH_STATE;
  }
}

export function writeAuthState(state: PersistedAuthState): void {
  const data = readVaultContainer();
  if (data === null) return;
  data.attempts = state.attempts;
  data.lockUntil = state.lockUntil;
  data.attemptsMaster = state.attemptsMaster;
  data.nukeLimit = state.nukeLimit;
  writeVaultContainer(data);
}

/** Hashes de conteúdo de todos os arquivos cobertos pelo manifesto. */
function contentHashes(ids: string[], authIds: string[]): ManifestHashes {
  const entries: Record<string, string> = {};
  for (const id of ids) entries[id] = hashEntry(id);
  const auth: Record<string, string> = {};
  for (const id of authIds) auth[id] = hashAuth(id);
  return { entries, auth };
}

/** Versão do manifesto que acompanha a versão do container. */
function manifestVersionFor(containerVersion: number): number {
  return containerVersion === VAULT_VERSION ? MANIFEST_VERSION : LEGACY_MANIFEST_VERSION;
}

/** Sela o estado do diretório na versão pedida; a v2 não carrega hashes e nem lê os arquivos. */
export function manifestFromDirectory(
  vaultKey: Buffer,
  version: number = MANIFEST_VERSION,
): SaltedPayload {
  const ids = listEntryIds();
  const authIds = listAuthIds();
  const hashes =
    version === MANIFEST_VERSION ? contentHashes(ids, authIds) : { entries: {}, auth: {} };
  return sealManifest(vaultKey, ids, authIds, hashes, version);
}

/** Reescreve o manifesto a partir do diretório (após salvar/remover). */
export function updateManifest(vaultKey: Buffer): void {
  const data = readVaultContainer();
  if (data === null) return;
  data.manifest = manifestFromDirectory(vaultKey, manifestVersionFor(data.version));
  writeVaultContainer(data);
}

/** Confere manifesto × diretório e falha fechado; manifesto nulo não é cofre novo. */
export function verifyManifestData(data: VaultContainerData, vaultKey: Buffer): ManifestContent {
  if (data.manifest === null) throw tampered();

  let expected: ManifestContent;
  try {
    expected = openManifest(vaultKey, data.manifest);
  } catch {
    throw tampered();
  }

  const entryIds = listEntryIds();
  const authIds = listAuthIds();
  const sameSet = (claimed: string[], actual: string[]): boolean => {
    const set = new Set(actual);
    return claimed.length === set.size && claimed.every((id) => set.has(id));
  };
  if (!sameSet(expected.ids, entryIds) || !sameSet(expected.authIds, authIds)) {
    throw tampered();
  }
  // a v2 não tem hashes: o conjunto de ids é toda a garantia que ela oferece.
  if (expected.version < MANIFEST_VERSION) return expected;
  // conjunto igual não prova conteúdo: só o SHA-256 do manifesto denuncia a troca
  try {
    for (const id of entryIds) {
      if (expected.entries[id] !== hashEntry(id)) throw tampered();
    }
    for (const id of authIds) {
      if (expected.auth[id] !== hashAuth(id)) throw tampered();
    }
  } catch {
    // arquivo sumiu entre a listagem e a leitura, ou hash diferente: adulteração
    throw tampered();
  }
  return expected;
}

export function verifyManifest(vaultKey: Buffer): void {
  const data = readVaultContainer();
  if (data === null) throw new Error(currentMessages().errors.vaultMissing);
  verifyManifestData(data, vaultKey);
}
