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

/**
 * Container do cofre (`vault.zkv`): chaves embrulhadas, trava exponencial e
 * manifesto cifrado. Os arquivos das credenciais ficam em `entries-store.ts` e a
 * estrutura de pastas em `structure.ts`; aqui é só o arquivo do container.
 *
 * A forma do estado da trava (`PersistedAuthState`) mora em `@zero/types`: quem
 * calcula a trava é `auth.ts`, não este arquivo, então declará-la aqui só
 * obrigaria o resto do main a depender do módulo de disco para nomear um tipo.
 */

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

/**
 * Cofre gravado por outra versão do app. Não é adulteração: o arquivo está
 * inteiro, cifrado e legível por quem o gravou. A mensagem diz isso e oferece
 * os dois caminhos reais, porque só dizer "erro" deixava o usuário sem saber
 * se os dados foram perdidos.
 */
function unsupportedVersion(version?: number): Error {
  return new Error(currentMessages().errors.vaultUnsupportedVersion(version));
}

// ---------- Container do cofre (vault.zkv) ----------

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
  // Depois de um Cryptographic Erase o cofre não volta a existir por conta
  // própria: um `writeAuthState`, um `initManifest` ou qualquer `VaultContainerData`
  // ainda em memória parariam aqui, em vez de recriar um `vault.zkv` sem chave
  // e transformar "cofre destruído" em "cofre adulterado". Só `createVault`
  // libera de novo, e só porque o usuário pediu um cofre novo.
  if (isVaultDestroyed()) return;
  ensureVaultStructure();
  writeSecretFile(containerFile(), packVaultContainer(data));
}

/**
 * Guarda uma cópia do container **antes** da primeira migração daquela versão.
 *
 * O snapshot é o caminho de downgrade: se a versão nova tiver um defeito, o
 * usuário restaura `vault.zkv.v<versão>.bak` por cima do `vault.zkv` e volta a
 * abrir o cofre com o app antigo. O arquivo é 0600 e entra na varredura do
 * Cryptographic Erase como qualquer outro arquivo de `.vault/`.
 *
 * Nunca sobrescreve um snapshot existente: o primeiro (a versão mais antiga)
 * é o que preserva o caminho de volta. Falha de escrita é propagada para que
 * a migração seja abortada antes de o container original ser substituído.
 */
export function backupContainer(version: number): void {
  const target = containerBackupFile(version);
  if (fs.existsSync(target)) return;
  const raw = fs.readFileSync(containerFile());
  const unpacked = unpackVaultContainer(raw);
  // o arquivo mudou entre a leitura do container e a cópia: melhor abortar a
  // migração do que guardar um snapshot que não corresponde à versão lida
  if (!unpacked.ok || unpacked.data.version !== version) throw tampered();
  writeSecretFile(target, raw);
}

// ---------- Estado da trava exponencial (dentro do container) ----------

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

// ---------- Manifesto de integridade (cifrado com a chave do cofre) ----------

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

/**
 * Sela o estado atual do diretório na versão pedida. A v2 (container v5) não
 * carrega hashes, então nem lê os arquivos: uma credencial removida no meio
 * da operação não pode derrubar o selo de um cofre que ainda não migrou.
 */
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

/**
 * Confere manifesto × diretório: arquivo removido/injetado de fora do app
 * derruba a lista com o erro único de adulteração (fail-closed).
 *
 * Um container sem manifesto **não** é um cofre novo: o selo inicial é feito
 * por `createVault`, antes de o arquivo existir. Se o campo chegou aqui nulo, o
 * manifesto foi removido de fora ou a gravação falhou, e re-selar o diretório
 * atual aceitaria exclusões silenciosas como estado legítimo.
 *
 * Os tokens de 2FA entram na mesma conferência. Sem isso, apagar um `.zka` ou
 * plantar o seu próprio passaria despercebido: o segredo TOTP trocado em
 * silêncio é exatamente o ataque que o manifesto existe para fechar.
 */
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
  // A migração re-sela na v3 assim que a chave está na mão.
  if (expected.version < MANIFEST_VERSION) return expected;
  // o conjunto de nomes igual não prova conteúdo: trocar `.zke` de A por B
  // mantém a lista e só o SHA-256 gravado no manifesto denuncia (P6)
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
