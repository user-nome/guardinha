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

/** Fachada única de persistência do cofre: `fs-extra`, AES-256-GCM e manifesto. */

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

/** Registro decifrado de 2FA: o segredo fica no main e nunca vai ao renderer. */
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

/** Operações de alto nível do cofre; `vault.ts`, `entries.ts` e `auth.ts` só falam com ela. */
export class VaultStorageFacade {
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

  public createKey(): Buffer {
    return createVaultKey();
  }

  /** UUID novo para uma credencial. */
  public newId(): string {
    return randomUuid();
  }

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

  /** Estado de tentativas e trava; nunca lança, devolve o neutro se o cofre falta. */
  public readAuthState(): PersistedAuthState {
    return readAuthState();
  }

  /** Grava no container via read-modify-write, que recusa escrever depois do erase. */
  public writeAuthState(state: PersistedAuthState): void {
    writeAuthState(state);
  }

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

  public listIds(): string[] {
    return listEntryIds();
  }

  /** Decifra e confere forma e id; `.zke` copiado de outro id vira adulteração. */
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

  public listAuthIds(): string[] {
    return listAuthIds();
  }

  /** Decifra o token e confere forma e id; o segredo só sai para o cálculo no main. */
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

  /** Cryptographic Erase cru: apaga o container e as entradas, quem chama decide. */
  public erase(): EraseResult {
    return eraseVault();
  }

  /** Temporários órfãos de um crash, que o manifesto não cobre; roda na inicialização. */
  public cleanTempFiles(maxAgeMs: number): TempCleanupResult {
    return cleanStaleTempFiles(maxAgeMs);
  }
}

/** Instância única da fachada de persistência do cofre. */
export const vaultStorage = new VaultStorageFacade();
