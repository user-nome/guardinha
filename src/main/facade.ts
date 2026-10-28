import {
  decryptAuthRecord,
  decryptRecord,
  encryptAuthRecord,
  encryptRecord,
  randomUuid,
} from '@zero/main/crypto';
import {
  createVaultKey,
  deleteEntry,
  listEntryIds,
  readEntryPayload,
  writeEntryPayload,
} from '@zero/main/entries-store';
import { deleteAuth, listAuthIds, readAuthPayload, writeAuthPayload } from '@zero/main/auth-store';
import {
  backupContainer,
  manifestFromDirectory,
  readAuthState,
  readVaultContainer,
  updateManifest,
  vaultExists,
  verifyManifest,
  verifyManifestData,
  writeAuthState,
  writeVaultContainer,
} from '@zero/main/storage';
import { ensureVaultStructure, isVaultDirUnavailable, vaultPath } from '@zero/main/structure';
import { cleanStaleTempFiles } from '@zero/main/entries-store';
import { eraseVault } from '@zero/main/erase';
import { currentMessages } from '@zero/main/i18n';
import { isOtpAlgorithm } from '@zero/shared';
import type { OtpAlgorithm } from '@zero/shared';
import { isRecord } from '@zero/shared/record';
import type { ManifestContent, VaultContainerData } from '@zero/main/container';
import type { SaltedPayload } from '@zero/types/crypto';
import type { Credential, EraseResult, PersistedAuthState, TempCleanupResult } from '@zero/types';

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

/** Valida a forma decifrada antes de usar (arquivo corrompido vira adulteração). */
function asCredential(value: unknown): Credential | null {
  if (!isRecord(value)) return null;
  const record = value;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.username !== 'string' ||
    typeof record.password !== 'string' ||
    typeof record.domain !== 'string' ||
    typeof record.notes !== 'string' ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: record.id,
    title: record.title,
    username: record.username,
    password: record.password,
    domain: record.domain,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Registro decifrado de um token de 2FA. Fica no main: o segredo é o que
 * precisa de proteção e o renderer nunca o recebe (só os metadados e o código).
 */
export interface AuthSecret {
  id: string;
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  /** Base32 canônico, sem padding. */
  secret: string;
  createdAt: number;
  updatedAt: number;
}

/** Forma do registro decifrado; fora do contrato vira adulteração. */
function asAuthSecret(value: unknown): AuthSecret | null {
  if (!isRecord(value)) return null;
  const record = value;
  if (
    typeof record.id !== 'string' ||
    typeof record.issuer !== 'string' ||
    typeof record.account !== 'string' ||
    typeof record.secret !== 'string' ||
    typeof record.digits !== 'number' ||
    typeof record.period !== 'number' ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number' ||
    !isOtpAlgorithm(record.algorithm)
  ) {
    return null;
  }
  return {
    id: record.id,
    issuer: record.issuer,
    account: record.account,
    algorithm: record.algorithm,
    digits: record.digits,
    period: record.period,
    secret: record.secret,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Fachada única do cofre sobre `fs-extra`, AES-256-GCM e o manifesto
 * (`.zke`, `.zka` e `.zkv`): `vault.ts`, `entries.ts`, `auth.ts` e
 * `authenticator.ts` pedem operações de alto nível aqui e nunca tocam sistema
 * de arquivos, cifra ou pacote binário direto.
 */
export class VaultStorageFacade {
  // ---------- Estrutura e localização ----------

  public exists(): boolean {
    return vaultExists();
  }

  public ensureStructure(): void {
    ensureVaultStructure();
  }

  /** true se o erro é falta de permissão para criar a raiz em `/var/lib`. */
  public isDirUnavailable(error: unknown): boolean {
    return isVaultDirUnavailable(error);
  }

  /** Caminho efetivo do cofre (mensagens e diagnóstico). */
  public path(): string {
    return vaultPath();
  }

  // ---------- Chaves e identificadores ----------

  public createKey(): Buffer {
    return createVaultKey();
  }

  /** UUID novo para uma credencial. */
  public newId(): string {
    return randomUuid();
  }

  // ---------- Container (`vault.zkv`) ----------

  public readContainer(): VaultContainerData | null {
    return readVaultContainer();
  }

  public writeContainer(data: VaultContainerData): void {
    writeVaultContainer(data);
  }

  /** Snapshot 0600 do container antigo, para o downgrade após uma migração. */
  public backupContainer(version: number): void {
    backupContainer(version);
  }

  // ---------- Trava exponencial (campos do container) ----------

  /**
   * Estado de tentativas e trava. Nunca lança: cofre ausente ou ilegível
   * devolve o estado neutro, para o `getStatus` não virar erro.
   */
  public readAuthState(): PersistedAuthState {
    return readAuthState();
  }

  /**
   * Grava tentativas, trava e limite no container. É read-modify-write, então
   * passa por `writeVaultContainer`, que recusa escrever depois de um erase.
   */
  public writeAuthState(state: PersistedAuthState): void {
    writeAuthState(state);
  }

  // ---------- Manifesto de integridade ----------

  public updateManifest(vaultKey: Buffer): void {
    updateManifest(vaultKey);
  }

  /** Sela o diretório atual na versão de manifesto pedida. */
  public manifestFromDirectory(vaultKey: Buffer, version: number): SaltedPayload {
    return manifestFromDirectory(vaultKey, version);
  }

  /** Confere manifesto × diretório; adulteração derruba a operação inteira. */
  public verifyManifest(vaultKey: Buffer): void {
    verifyManifest(vaultKey);
  }

  /** Mesma conferência, sobre um container já lido (usada pela migração). */
  public verifyManifestData(data: VaultContainerData, vaultKey: Buffer): ManifestContent {
    return verifyManifestData(data, vaultKey);
  }

  // ---------- Credenciais (arquivos `.zke`) ----------

  public listIds(): string[] {
    return listEntryIds();
  }

  /**
   * Decifra o arquivo da credencial e confere a forma: payload inválido ou
   * registro fora do contrato vira o erro único de adulteração (fail-closed).
   *
   * O id decifrado precisa ser o id do arquivo. Sem isso, copiar o `.zke` de A
   * sobre o de B mantém o conjunto de nomes que o manifesto confere e a lista
   * mostraria A duas vezes.
   */
  public readRecord(id: string, vaultKey: Buffer): Credential {
    let record: Credential | null;
    try {
      record = asCredential(decryptRecord(readEntryPayload(id), vaultKey));
    } catch {
      throw tampered();
    }
    if (record?.id !== id) throw tampered();
    return record;
  }

  /** Cifra, grava o arquivo individual e re-sella o manifesto. */
  public writeRecord(record: Credential, vaultKey: Buffer): void {
    writeEntryPayload(record.id, encryptRecord(record, vaultKey));
    updateManifest(vaultKey);
  }

  /** Apaga o arquivo cifrado e re-sella o manifesto. */
  public removeRecord(id: string, vaultKey: Buffer): void {
    deleteEntry(id);
    updateManifest(vaultKey);
  }

  // ---------- Tokens de 2FA (arquivos `.zka`) ----------

  public listAuthIds(): string[] {
    return listAuthIds();
  }

  /**
   * Decifra o token e confere a forma. O segredo sai daqui apenas para o
   * cálculo do código, dentro do main. O id decifrado também precisa ser o do
   * arquivo, pela mesma razão do `readRecord`.
   */
  public readAuthSecret(id: string, vaultKey: Buffer): AuthSecret {
    let record: AuthSecret | null;
    try {
      record = asAuthSecret(decryptAuthRecord(readAuthPayload(id), vaultKey));
    } catch {
      throw tampered();
    }
    if (record?.id !== id) throw tampered();
    return record;
  }

  /** Cifra, grava o arquivo individual e re-sela o manifesto. */
  public writeAuthSecret(record: AuthSecret, vaultKey: Buffer): void {
    writeAuthPayload(record.id, encryptAuthRecord(record, vaultKey));
    updateManifest(vaultKey);
  }

  /** Apaga o arquivo cifrado e re-sela o manifesto. */
  public removeAuthSecret(id: string, vaultKey: Buffer): void {
    deleteAuth(id);
    updateManifest(vaultKey);
  }

  // ---------- Destruição do cofre ----------

  /**
   * Cryptographic Erase: apaga o container (que guarda a chave embrulhada) e
   * todas as entradas, com sobrescrita antes do `unlink`. Só quem chama isto
   * decide se o cofre morre (botão de pânico, PIN de coação, limite de
   * tentativas); aqui é a operação crua.
   */
  public erase(): EraseResult {
    return eraseVault();
  }

  /**
   * Temporários órfãos de um crash, que o manifesto não cobre. Roda uma vez na
   * inicialização, antes do primeiro `getStatus` responder.
   */
  public cleanTempFiles(maxAgeMs: number): TempCleanupResult {
    return cleanStaleTempFiles(maxAgeMs);
  }
}

/** Instância única da fachada de persistência do cofre. */
export const vaultStorage = new VaultStorageFacade();
