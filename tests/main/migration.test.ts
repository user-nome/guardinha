// @vitest-environment node
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptAuthRecord, deriveKey, encryptRecord, randomBytes } from '@zero/main/crypto';
import { MANIFEST_VERSION, VAULT_VERSION } from '@zero/main/container-format';
import { openManifest } from '@zero/main/container';
import { writeAuthPayload } from '@zero/main/auth-store';
import { writeEntryPayload } from '@zero/main/entries-store';
import { currentMessages } from '@zero/main/i18n';
import { vaultStorage } from '@zero/main/facade';
import { containerFile, entriesDir, vaultDir } from '@zero/main/layout';
import {
  buildMigratedContainer,
  hasLegacyFormat,
  migrationMethodsFor,
  refreshMethodKdf,
} from '@zero/main/migration';
import { vaultSession } from '@zero/main/session';
import { readVaultContainer, writeVaultContainer } from '@zero/main/storage';
import { ensureVaultStructure } from '@zero/main/structure';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { getMigrationStatus, migrateVault, resetPin, unlock } from '@zero/main/vault';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import type { AuthSecret } from '@zero/main/facade';
import type { Credential, VaultMigrationInput } from '@zero/types';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const NEW_PIN = '90427156';
const PHRASE = 'na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const AUTH_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const STRAY_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const ALL: VaultMigrationInput = { master: MASTER, pin: PIN, recovery: PHRASE };

/** Custo barato: os métodos semeados não precisam pagar o Argon2id de produção. */
const CHEAP = { algo: 'argon2id', memoryKiB: 16_384, iterations: 1, parallelism: 1 } as const;

const DUMMY = {
  salt: 'ff'.repeat(16),
  iv: '00'.repeat(16),
  tag: '99'.repeat(16),
  encryptedData: 'ab',
} as const;

function entryRecord(id: string): Credential {
  return {
    id,
    title: 'Banco',
    username: 'otaku-delirante',
    password: 's3nh@-forte',
    domain: 'banco.com.br',
    notes: '',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

function authRecord(id: string): AuthSecret {
  return {
    id,
    issuer: 'GitHub',
    account: 'alice',
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

/** Embrulho da v5: rótulo padrão do HKDF, sem AAD e sem papel do método. */
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

interface SeedOptions {
  /** Arquivo fora do manifesto, para simular adulteração. */
  strayEntry?: boolean;
}

/** Semeia um cofre v5 completo (três métodos e manifesto v2) sem Argon2id caro. */
async function seedLegacyVault(options: SeedOptions = {}): Promise<{
  vaultKey: Buffer;
  bytes: Buffer;
}> {
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  vaultSession().wipe();
  ensureVaultStructure();

  const vaultKey = randomBytes(32);
  const entryIds = [ENTRY_ID];
  const authIds = [AUTH_ID];
  for (const id of entryIds) {
    writeEntryPayload(id, encryptRecord(entryRecord(id), vaultKey));
  }
  for (const id of authIds) {
    writeAuthPayload(id, encryptAuthRecord(authRecord(id), vaultKey));
  }
  if (options.strayEntry === true) {
    writeEntryPayload(STRAY_ID, encryptRecord(entryRecord(STRAY_ID), vaultKey));
  }

  const data: VaultContainerData = {
    version: 5,
    createdAt: Date.now(),
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      master: await legacyMethod(MASTER, vaultKey),
      pin: await legacyMethod(PIN, vaultKey),
      recovery: await legacyMethod(PHRASE, vaultKey),
    },
    manifest: encryptRecord({ v: 2, ids: entryIds, authIds }, vaultKey),
  };
  writeVaultContainer(data);
  return { vaultKey, bytes: fs.readFileSync(containerFile()) };
}

/** Desembrulha um método e diz se ele ainda está no formato antigo. */
async function isLegacy(
  kind: 'master' | 'pin' | 'recovery',
  method: WrappedMethod,
  credential: string,
): Promise<boolean> {
  const unwrapper = keyUnwrapperFor(kind);
  const derived = await unwrapper.derive(method, credential);
  try {
    return unwrapper.unwrapDetailed(method, derived).legacy;
  } finally {
    derived.fill(0);
  }
}

function entryBytes(id: string = ENTRY_ID): Buffer {
  return fs.readFileSync(`${entriesDir()}/${id}.zke`);
}

function currentContainer(): VaultContainerData {
  const container = readVaultContainer();
  if (container === null) throw new Error('container sumiu');
  return container;
}

afterEach(() => {
  vaultSession().wipe();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('estado da migração', () => {
  it('não anuncia migração quando não há cofre', () => {
    fs.rmSync(vaultDir(), { recursive: true, force: true });
    expect(getMigrationStatus()).toEqual({
      needed: false,
      fromVersion: VAULT_VERSION,
      toVersion: VAULT_VERSION,
      methods: [],
      entries: 0,
      authTokens: 0,
    });
  });

  it('anuncia a v5 com os métodos e a contagem do diretório', async () => {
    await seedLegacyVault();

    expect(getMigrationStatus()).toEqual({
      needed: true,
      fromVersion: 5,
      toVersion: VAULT_VERSION,
      methods: ['master', 'pin', 'recovery'],
      entries: 1,
      authTokens: 1,
    });
  });

  it('lista só os métodos que o container realmente tem', async () => {
    await seedLegacyVault();
    const container = currentContainer();
    delete container.methods.master;

    expect(migrationMethodsFor(container)).toEqual(['pin', 'recovery']);
  });
});

describe('migração explícita', () => {
  it('mantém a v5 no login e migra tudo quando a tela pede as credenciais', async () => {
    const { vaultKey } = await seedLegacyVault();
    const before = entryBytes();

    // o login não promove nada: o formato antigo continua no disco
    const opened = await unlock({ credential: PIN, kind: 'pin' });
    expect(opened.ok).toBe(true);
    const untouched = currentContainer();
    expect(untouched.version).toBe(5);
    expect(untouched.methods.pin).toBeDefined();
    if (untouched.methods.pin !== undefined) {
      expect(await isLegacy('pin', untouched.methods.pin, PIN)).toBe(true);
    }
    expect(getMigrationStatus().needed).toBe(true);

    const migrated = await migrateVault(ALL);
    expect(migrated.ok).toBe(true);

    const container = currentContainer();
    expect(container.version).toBe(VAULT_VERSION);
    for (const [kind, credential] of [
      ['master', MASTER],
      ['pin', PIN],
      ['recovery', PHRASE],
    ] as const) {
      const method = container.methods[kind];
      expect(method).toBeDefined();
      if (method !== undefined) expect(await isLegacy(kind, method, credential)).toBe(false);
    }
    const manifest = container.manifest;
    expect(manifest).not.toBeNull();
    if (manifest !== null) expect(openManifest(vaultKey, manifest).version).toBe(MANIFEST_VERSION);
    expect(() => vaultStorage.verifyManifest(vaultKey)).not.toThrow();

    // os registros foram decifrados e regravados com salt e IV novos
    expect(entryBytes().equals(before)).toBe(false);
    expect(vaultStorage.readRecord(ENTRY_ID, vaultKey)).toEqual(entryRecord(ENTRY_ID));
    expect(vaultStorage.readAuthSecret(AUTH_ID, vaultKey)).toEqual(authRecord(AUTH_ID));

    expect(vaultSession().isMigrationPending()).toBe(false);
    expect(getMigrationStatus()).toMatchObject({ needed: false, fromVersion: VAULT_VERSION });

    // repetir com o cofre já atualizado é inofensivo e não regrava o container
    const bytes = fs.readFileSync(containerFile());
    const again = await migrateVault({});
    expect(again.ok).toBe(true);
    expect(fs.readFileSync(containerFile()).equals(bytes)).toBe(true);
  }, 120_000);

  it('credencial errada não toca nos arquivos', async () => {
    await seedLegacyVault();
    const before = entryBytes();

    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);

    const wrongMaster = await migrateVault({ ...ALL, master: 'senha-mestra-errada-123' });
    expect(wrongMaster.ok).toBe(false);
    expect(wrongMaster.error).toBe(currentMessages().errors.wrongMaster);

    const wrongPin = await migrateVault({ ...ALL, pin: '00000000x' });
    expect(wrongPin.ok).toBe(false);
    expect(wrongPin.error).toBe(currentMessages().errors.wrongPin);

    const wrongRecovery = await migrateVault({ ...ALL, recovery: 'outra frase qualquer' });
    expect(wrongRecovery.ok).toBe(false);
    expect(wrongRecovery.error).toBe(currentMessages().errors.wrongRecovery);

    // método embrulhado com outra chave: a credencial certa não basta
    const otherKey = randomBytes(32);
    const container = currentContainer();
    container.methods.master = await legacyMethod(MASTER, otherKey);
    writeVaultContainer(container);
    const mismatch = await migrateVault(ALL);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.error).toBe(currentMessages().errors.wrongMaster);

    expect(currentContainer().version).toBe(5);
    expect(entryBytes().equals(before)).toBe(true);
    expect(vaultSession().isMigrationPending()).toBe(true);
  });

  it('exige todas as credenciais antes de começar', async () => {
    await seedLegacyVault();
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);

    const missing = await migrateVault({ master: MASTER, pin: '   ', recovery: PHRASE });
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe(currentMessages().errors.migrationIncomplete);
    expect(currentContainer().version).toBe(5);
  });

  it('manifesto que não bate com o diretório aborta sem gravar', async () => {
    await seedLegacyVault({ strayEntry: true });
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);

    const result = await migrateVault(ALL);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.vaultTampered);
    expect(currentContainer().version).toBe(5);
  });

  it('erro inesperado vira erro da operação, sem derrubar a sessão', async () => {
    await seedLegacyVault();
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
    vi.spyOn(vaultStorage, 'verifyManifestData').mockImplementation(() => {
      throw new Error('disco cheio');
    });

    const result = await migrateVault(ALL);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('disco cheio');
    expect(vaultSession().isUnlocked()).toBe(true);
  });

  it('recusa sessão bloqueada, sessão decoy e cofre que sumiu', async () => {
    const locked = await migrateVault(ALL);
    expect(locked.ok).toBe(false);
    expect(locked.error).toBe(currentMessages().errors.vaultLocked);

    vaultSession().adoptDecoy();
    const decoy = await migrateVault(ALL);
    expect(decoy.ok).toBe(false);
    expect(decoy.error).toBe(currentMessages().errors.vaultLocked);

    await seedLegacyVault();
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
    fs.rmSync(containerFile());
    const missing = await migrateVault(ALL);
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe(currentMessages().errors.vaultMissing);
  });

  it('reconhece o cofre v6 que o fluxo incremental antigo deixou pela metade', async () => {
    const { vaultKey } = await seedLegacyVault();
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);

    // a versão antiga subia o número e selava a v3 sem reembrulhar os outros métodos
    const partial = currentContainer();
    partial.version = VAULT_VERSION;
    partial.manifest = vaultStorage.manifestFromDirectory(vaultKey, MANIFEST_VERSION);
    writeVaultContainer(partial);
    vaultSession().wipe();

    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
    const status = getMigrationStatus();
    expect(status).toMatchObject({ needed: true, fromVersion: VAULT_VERSION });
    expect(status.methods).toEqual(['master', 'pin', 'recovery']);

    // a tela de atualização pede todas as credenciais; sem elas, nada é gravado
    const result = await migrateVault({});
    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.migrationIncomplete);
    expect(vaultSession().isMigrationPending()).toBe(true);
  });

  it('a redefinição de PIN preserva a v5 e deixa o aviso para o login', async () => {
    await seedLegacyVault();

    const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(result.ok).toBe(true);
    expect(currentContainer().version).toBe(5);
    expect(getMigrationStatus().needed).toBe(true);
  }, 120_000);
});

describe('buildMigratedContainer', () => {
  it('devolve null quando a versão e o manifesto já são os atuais', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = currentContainer();
    container.version = VAULT_VERSION;
    container.manifest = vaultStorage.manifestFromDirectory(vaultKey, MANIFEST_VERSION);

    expect(await buildMigratedContainer(container, vaultKey, {}, false)).toBeNull();
  });

  it('vê a v5 como pendente mesmo sem o marcador da sessão', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = currentContainer();
    expect(container.version).toBe(5);

    await expect(buildMigratedContainer(container, vaultKey, {}, false)).rejects.toThrow(
      currentMessages().errors.migrationIncomplete,
    );
  });

  it('recusa container sem manifesto antes de pedir credencial', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = { ...currentContainer(), version: VAULT_VERSION, manifest: null };

    await expect(buildMigratedContainer(container, vaultKey, {}, false)).rejects.toThrow(
      currentMessages().errors.vaultTampered,
    );
  });

  it('detecta manifesto v2 que não bate com o diretório', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = {
      ...currentContainer(),
      version: VAULT_VERSION,
      manifest: encryptRecord({ v: 2, ids: [STRAY_ID], authIds: [] }, vaultKey),
    };

    await expect(buildMigratedContainer(container, vaultKey, {}, false)).rejects.toThrow(
      currentMessages().errors.vaultTampered,
    );
  });
});

describe('hasLegacyFormat', () => {
  it('reconhece o método no embrulho antigo sem abrir o manifesto', async () => {
    const { vaultKey } = await seedLegacyVault();
    expect(hasLegacyFormat(currentContainer(), vaultKey, true)).toBe(true);
  });

  it('olha a versão do manifesto quando o método já é atual', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = currentContainer();

    expect(hasLegacyFormat(container, vaultKey, false)).toBe(true);
    container.manifest = vaultStorage.manifestFromDirectory(vaultKey, MANIFEST_VERSION);
    expect(hasLegacyFormat(container, vaultKey, false)).toBe(false);
  });

  it('cofre sem manifesto ou com manifesto ilegível não vira migração', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = currentContainer();

    expect(hasLegacyFormat({ ...container, manifest: null }, vaultKey, false)).toBe(false);
    expect(
      hasLegacyFormat(
        { ...container, manifest: { ...DUMMY, encryptedData: '00' } },
        vaultKey,
        false,
      ),
    ).toBe(false);
  });
});

describe('refreshMethodKdf', () => {
  it('não mexe num cofre v5: a migração explícita cuida do formato', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = currentContainer();
    const before = fs.readFileSync(containerFile());

    await refreshMethodKdf(container, vaultKey, 'pin', PIN);
    expect(fs.readFileSync(containerFile()).equals(before)).toBe(true);
  });

  it('ignora método ausente e método que já está no custo atual', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = { ...currentContainer(), version: VAULT_VERSION };

    await expect(
      refreshMethodKdf({ ...container, methods: {} }, vaultKey, 'master', MASTER),
    ).resolves.toBeUndefined();

    const current: WrappedMethod = {
      kdf: keyUnwrapperFor('master').kdf,
      kdfSalt: '00'.repeat(16),
      payload: DUMMY,
    };
    await expect(
      refreshMethodKdf({ ...container, methods: { master: current } }, vaultKey, 'master', MASTER),
    ).resolves.toBeUndefined();
  });

  it('desiste sem gravar quando o container sumiu no meio do caminho', async () => {
    const { vaultKey } = await seedLegacyVault();
    const container = { ...currentContainer(), version: VAULT_VERSION };
    fs.rmSync(containerFile());

    await expect(refreshMethodKdf(container, vaultKey, 'master', MASTER)).resolves.toBeUndefined();
    expect(fs.existsSync(containerFile())).toBe(false);
  });

  it('falha de reembrulho fica no log e não derruba o desbloqueio', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { vaultKey } = await seedLegacyVault();
    const container = { ...currentContainer(), version: VAULT_VERSION };
    vi.spyOn(vaultStorage, 'readContainer').mockReturnValue(container);
    vi.spyOn(keyUnwrapperFor('master'), 'wrap').mockRejectedValue(new Error('falhou'));

    await expect(refreshMethodKdf(container, vaultKey, 'master', MASTER)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
