import fs from 'node:fs';
import path from 'node:path';
import { deriveKey, encryptAuthRecord, encryptRecord, randomBytes } from '@zero/main/crypto';
import { packEntryPayload, packVaultContainer } from '@zero/main/container';
import { decoyKey } from '@zero/main/unwrapping';
import { VAULT } from './flows.ts';
import type { TempEnv } from './env.ts';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';

/**
 * Fixture de um cofre v5, o formato que o app atual só lê para migrar.
 *
 * É a única parte do E2E que importa o `src/`: em vez de reimplementar o
 * container binário (e criar uma segunda cópia do formato), usa o mesmo
 * `packVaultContainer`, o mesmo Argon2id e o mesmo AES do app para semear o
 * diretório antes de a janela abrir. Os parâmetros do KDF são baratos de
 * propósito: o que importa aqui é o embrulho legado, não o custo de produção.
 */

export const LEGACY_ENTRY = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Credencial anterior',
  username: 'usuario-antigo',
  password: 'S3nh4-Antiga!2026',
  domain: 'antigo.exemplo.com.br',
} as const;

export const LEGACY_AUTH = {
  id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
  issuer: 'GitHub',
  account: 'migracao@exemplo.com',
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
} as const;

const CHEAP = { algo: 'argon2id', memoryKiB: 16_384, iterations: 1, parallelism: 1 } as const;

const CREATED_AT = 1_760_000_000_000;

/** Embrulho da v5: HKDF padrão do registro, sem AAD e sem papel do método. */
async function legacyMethod(credential: string, vaultKey: Buffer): Promise<WrappedMethod> {
  const kdfSalt = randomBytes(16);
  const derived = await deriveKey(credential, kdfSalt, CHEAP);
  try {
    return {
      kdf: { ...CHEAP },
      kdfSalt: kdfSalt.toString('hex'),
      payload: encryptRecord({ key: vaultKey.toString('hex') }, derived),
    };
  } finally {
    derived.fill(0);
  }
}

/**
 * Semeia um cofre v5 completo no diretório temporário e devolve a chave, para
 * quem quiser conferir no disco o formato depois da migração.
 */
export async function seedLegacyVault(temp: TempEnv): Promise<Buffer> {
  const root = temp.env.GUARDINHA_VAULT_DIR;
  if (root === undefined) throw new Error('GUARDINHA_VAULT_DIR ausente no ambiente E2E.');
  fs.mkdirSync(path.join(root, '.entries'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, '.auth'), { recursive: true, mode: 0o700 });

  const vaultKey = randomBytes(32);
  const entry = {
    id: LEGACY_ENTRY.id,
    title: LEGACY_ENTRY.title,
    username: LEGACY_ENTRY.username,
    password: LEGACY_ENTRY.password,
    domain: LEGACY_ENTRY.domain,
    notes: 'Criada antes da atualização do app.',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const auth = {
    id: LEGACY_AUTH.id,
    issuer: LEGACY_AUTH.issuer,
    account: LEGACY_AUTH.account,
    secret: LEGACY_AUTH.secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };

  fs.writeFileSync(
    path.join(root, '.entries', `${LEGACY_ENTRY.id}.zke`),
    packEntryPayload(encryptRecord(entry, vaultKey)),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(root, '.auth', `${LEGACY_AUTH.id}.zka`),
    packEntryPayload(encryptAuthRecord(auth, vaultKey)),
    { mode: 0o600 },
  );

  const data: VaultContainerData = {
    version: 5,
    createdAt: CREATED_AT,
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      master: await legacyMethod(VAULT.master, vaultKey),
      pin: await legacyMethod(VAULT.pin, vaultKey),
      recovery: await legacyMethod(VAULT.phrase, vaultKey),
      // o PIN de coação embrulha uma chave decoy, como na criação real
      panic: await legacyMethod(VAULT.panicPin, decoyKey()),
    },
    manifest: encryptRecord({ v: 2, ids: [LEGACY_ENTRY.id], authIds: [LEGACY_AUTH.id] }, vaultKey),
  };
  fs.writeFileSync(path.join(root, 'vault.zkv'), packVaultContainer(data), { mode: 0o600 });
  return vaultKey;
}
