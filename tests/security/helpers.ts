import fs from 'node:fs';
import { deriveKey, encryptAuthRecord, encryptRecord, randomBytes } from '@zero/main/crypto';
import {
  packVaultContainer,
  sealManifest,
  unpackVaultContainer,
  type VaultContainerData,
  type VaultMethods,
  type WrappedMethod,
} from '@zero/main/container';
import { writeAuthPayload, hashAuth } from '@zero/main/auth-store';
import { writeEntryPayload, hashEntry } from '@zero/main/entries-store';
import { methodKeyInfo } from '@zero/main/crypto-constants';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { containerFile, vaultDir } from '@zero/main/layout';
import { vaultSession } from '@zero/main/session';
import { readVaultContainer, writeVaultContainer } from '@zero/main/storage';
import type { Argon2Params } from '@zero/types/crypto';

/** Custo mínimo aceito: os testes de ataque provam a cadeia, não o Argon2id de produção. */
export const CHEAP_KDF: Argon2Params = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };

/** Tipos de credencial que o container sabe embrulhar. */
export const KINDS = ['master', 'pin', 'recovery', 'panic'] as const;

export type WrappedKind = (typeof KINDS)[number];

/** Embrulho barato reimplementado de propósito, para o fixture não depender do código atacado. */
export async function wrapCheap(
  vaultKey: Buffer,
  credential: string,
  kind: WrappedKind,
): Promise<WrappedMethod> {
  const kdfSalt = randomBytes(16);
  const derived = await deriveKey(credential, kdfSalt, CHEAP_KDF);
  const info = methodKeyInfo(kind);
  try {
    return {
      kdf: { algo: 'argon2id', ...CHEAP_KDF },
      kdfSalt: kdfSalt.toString('hex'),
      payload: encryptRecord({ key: vaultKey.toString('hex') }, derived, info, info),
    };
  } finally {
    derived.fill(0);
  }
}

/** Remove o cofre do disco e libera a guarda de destruição do processo. */
export function resetVaultDir(): void {
  vaultSession().wipe();
  clearDestroyedFlag();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
}

export interface SeedOptions {
  vaultKey: Buffer;
  credentials?: Partial<Record<WrappedKind, string>>;
  entryIds?: string[];
  authIds?: string[];
  attempts?: number;
  lockUntil?: number | null;
  attemptsMaster?: number;
  nukeLimit?: number;
  /** `false` deixa o container sem manifesto (cofre recém-criado). */
  manifest?: boolean;
}

/** Semeia um cofre barato no disco e devolve a forma que ficou gravada. */
export async function seedVault(options: SeedOptions): Promise<VaultContainerData> {
  resetVaultDir();
  const methods: VaultMethods = {};
  for (const kind of KINDS) {
    const credential = options.credentials?.[kind];
    if (credential !== undefined)
      methods[kind] = await wrapCheap(options.vaultKey, credential, kind);
  }

  const entryIds = options.entryIds ?? [];
  const authIds = options.authIds ?? [];
  for (const id of entryIds) {
    writeEntryPayload(
      id,
      encryptRecord({ id, marcador: 'conteudo-descartavel' }, options.vaultKey),
    );
  }
  for (const id of authIds) {
    writeAuthPayload(
      id,
      encryptAuthRecord({ id, marcador: 'token-descartavel' }, options.vaultKey),
    );
  }

  const hashes = {
    entries: Object.fromEntries(entryIds.map((id) => [id, hashEntry(id)])),
    auth: Object.fromEntries(authIds.map((id) => [id, hashAuth(id)])),
  };

  const data: VaultContainerData = {
    version: 6,
    createdAt: Date.now(),
    attempts: options.attempts ?? 0,
    lockUntil: options.lockUntil ?? null,
    attemptsMaster: options.attemptsMaster ?? 0,
    nukeLimit: options.nukeLimit ?? 0,
    methods,
    manifest:
      options.manifest === false ? null : sealManifest(options.vaultKey, entryIds, authIds, hashes),
  };
  writeVaultContainer(data);

  const persisted = readVaultContainer();
  if (persisted === null) throw new Error('o cofre semeado não chegou ao disco');
  return persisted;
}

/** Bytes crus do container, como um atacante com leitura do disco os veria. */
export function containerBytes(): Buffer {
  return fs.readFileSync(containerFile());
}

/** Empacota um `VaultContainerData` sem tocá-lo no disco (para adulterar). */
export function pack(data: VaultContainerData): Buffer {
  return packVaultContainer(data);
}

/** Desempacota bytes crus; o teste decide o que esperar do resultado. */
export function unpack(raw: Buffer): ReturnType<typeof unpackVaultContainer> {
  return unpackVaultContainer(raw);
}
