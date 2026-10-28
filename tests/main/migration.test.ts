// @vitest-environment node
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openManifest, sealManifest } from '@zero/main/container';
import { VAULT_VERSION } from '@zero/main/container-format';
import { deriveKey, encryptRecord, randomBytes } from '@zero/main/crypto';
import { eraseVault } from '@zero/main/erase';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { writeEntryPayload } from '@zero/main/entries-store';
import { vaultStorage } from '@zero/main/facade';
import { containerBackupFile, containerFile, entriesDir, vaultDir } from '@zero/main/layout';
import { migrateAndPersist, prepareMigration } from '@zero/main/migration';
import { vaultSession } from '@zero/main/session';
import { readVaultContainer, updateManifest, writeVaultContainer } from '@zero/main/storage';
import { ensureVaultStructure } from '@zero/main/structure';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { resetPin, unlock } from '@zero/main/vault';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import type { SaltedPayload } from '@zero/types/crypto';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const NEW_PIN = '90427156';
const PHRASE = 'na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const STRAY_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** Custo barato: a migração não precisa pagar o Argon2id de produção. */
const CHEAP = { algo: 'argon2id', memoryKiB: 16_384, iterations: 1, parallelism: 1 } as const;

const DUMMY: SaltedPayload = {
  salt: 'ff'.repeat(16),
  iv: '00'.repeat(16),
  tag: '99'.repeat(16),
  encryptedData: 'ab',
};

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
  /** Ids que o manifesto v2 afirma existir. */
  entryIds?: string[];
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
  clearDestroyedFlag();
  ensureVaultStructure();

  const vaultKey = randomBytes(32);
  const entryIds = options.entryIds ?? [];
  for (const id of entryIds) writeEntryPayload(id, DUMMY);
  if (options.strayEntry === true) writeEntryPayload(STRAY_ID, DUMMY);

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
    manifest: encryptRecord({ v: 2, ids: entryIds, authIds: [] }, vaultKey),
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

afterEach(() => {
  vaultSession().wipe();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('migração do cofre no desbloqueio', () => {
  it('promove a v5 para a v6, reembrulha o método usado e guarda o snapshot', async () => {
    const { vaultKey, bytes } = await seedLegacyVault();

    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(true);

    const container = readVaultContainer();
    expect(container?.version).toBe(VAULT_VERSION);
    const pin = container?.methods.pin;
    expect(pin).toBeDefined();
    if (pin !== undefined) expect(await isLegacy('pin', pin, PIN)).toBe(false);

    // o método que não foi usado continua no embrulho antigo até o próximo
    // desbloqueio, porque reembrulhá-lo exigiria a credencial dele
    const master = container?.methods.master;
    expect(master).toBeDefined();
    if (master !== undefined) expect(await isLegacy('master', master, MASTER)).toBe(true);

    const manifest = container?.manifest;
    expect(manifest).not.toBeNull();
    if (manifest !== null && manifest !== undefined) {
      expect(openManifest(vaultKey, manifest).version).toBe(3);
    }

    const backup = containerBackupFile(5);
    expect(fs.existsSync(backup)).toBe(true);
    expect(fs.readFileSync(backup).equals(bytes)).toBe(true);
    expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
  });

  it('o segundo método migra no desbloqueio dele e não sobrescreve o snapshot da v5', async () => {
    const { bytes } = await seedLegacyVault();

    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
    expect((await unlock({ credential: MASTER, kind: 'master' })).ok).toBe(true);

    const container = readVaultContainer();
    const master = container?.methods.master;
    expect(master).toBeDefined();
    if (master !== undefined) expect(await isLegacy('master', master, MASTER)).toBe(false);
    // o snapshot da v5 continua sendo o primeiro, o que preserva o downgrade
    expect(fs.readFileSync(containerBackupFile(5)).equals(bytes)).toBe(true);
    // a segunda migração deixou o snapshot da v6, que é o ponto de volta da 2.2.1
    expect(fs.existsSync(containerBackupFile(6))).toBe(true);
  });

  it('manifesto adulterado adia a migração, mas não derruba o desbloqueio', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await seedLegacyVault({ strayEntry: true });

    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(true);
    expect(readVaultContainer()?.version).toBe(5);
    expect(fs.existsSync(containerBackupFile(5))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('falha de escrita deixa o container antigo intacto e o desbloqueio segue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await seedLegacyVault();
    vi.spyOn(vaultStorage, 'writeContainer').mockImplementation(() => {
      throw new Error('disco cheio');
    });

    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(true);
    expect(readVaultContainer()?.version).toBe(5);
    expect(fs.existsSync(containerBackupFile(5))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('falha ao guardar o snapshot aborta antes de tocar no container', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await seedLegacyVault();
    vi.spyOn(vaultStorage, 'backupContainer').mockImplementation(() => {
      throw new Error('sem espaço');
    });

    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(true);
    expect(readVaultContainer()?.version).toBe(5);
    expect(fs.existsSync(containerBackupFile(5))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('redefine o PIN pela frase e aproveita para migrar o cofre v5', async () => {
    await seedLegacyVault();

    const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(result.ok).toBe(true);

    const container = readVaultContainer();
    expect(container?.version).toBe(VAULT_VERSION);
    const recovery = container?.methods.recovery;
    expect(recovery).toBeDefined();
    if (recovery !== undefined) expect(await isLegacy('recovery', recovery, PHRASE)).toBe(false);
    expect(fs.existsSync(containerBackupFile(5))).toBe(true);
  });
});

describe('prepareMigration', () => {
  function currentContainer(vaultKey: Buffer): VaultContainerData {
    return {
      version: VAULT_VERSION,
      createdAt: Date.now(),
      attempts: 0,
      lockUntil: null,
      attemptsMaster: 0,
      nukeLimit: 0,
      methods: {
        master: {
          kdf: keyUnwrapperFor('master').kdf,
          kdfSalt: '00'.repeat(16),
          payload: DUMMY,
        },
      },
      manifest: sealManifest(vaultKey, [], [], { entries: {}, auth: {} }),
    };
  }

  it('não mexe num container que já está no formato atual', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data = currentContainer(vaultKey);

    expect(
      await prepareMigration(data, vaultKey, {
        kind: 'master',
        credential: MASTER,
        legacyMethod: false,
      }),
    ).toBeNull();
  });

  it('não migra um container sem o método pedido', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data: VaultContainerData = { ...currentContainer(vaultKey), methods: {} };

    expect(
      await prepareMigration(data, vaultKey, {
        kind: 'master',
        credential: MASTER,
        legacyMethod: true,
      }),
    ).toBeNull();
  });

  it('não re-sela um cofre sem manifesto', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data: VaultContainerData = { ...currentContainer(vaultKey), manifest: null };

    expect(
      await prepareMigration(data, vaultKey, {
        kind: 'master',
        credential: MASTER,
        legacyMethod: true,
      }),
    ).toBeNull();
  });

  it('re-sela o manifesto v2 de um container já na v6', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data: VaultContainerData = {
      ...currentContainer(vaultKey),
      manifest: encryptRecord({ v: 2, ids: [], authIds: [] }, vaultKey),
    };

    const migrated = await prepareMigration(data, vaultKey, {
      kind: 'master',
      credential: MASTER,
      legacyMethod: false,
    });
    expect(migrated?.version).toBe(VAULT_VERSION);
    expect(migrated?.manifest).not.toBeNull();
    if (migrated?.manifest !== null && migrated?.manifest !== undefined) {
      expect(openManifest(vaultKey, migrated.manifest).version).toBe(3);
    }
  });

  it('respeita methodAlreadyWrapped e não paga o Argon2id de novo', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data = currentContainer(vaultKey);

    const migrated = await prepareMigration(data, vaultKey, {
      kind: 'master',
      credential: MASTER,
      legacyMethod: true,
      methodAlreadyWrapped: true,
    });
    expect(migrated).not.toBeNull();
    expect(migrated?.methods.master).toBe(data.methods.master);
  });

  it('migrateAndPersist não grava quando não há mudança', async () => {
    ensureVaultStructure();
    const vaultKey = randomBytes(32);
    const data = currentContainer(vaultKey);
    writeVaultContainer(data);
    const before = fs.readFileSync(containerFile());

    await migrateAndPersist(data, vaultKey, {
      kind: 'master',
      credential: MASTER,
      legacyMethod: false,
    });

    expect(fs.readFileSync(containerFile()).equals(before)).toBe(true);
    expect(fs.existsSync(containerBackupFile(VAULT_VERSION))).toBe(false);
  });
});

describe('manifesto e snapshot na v5', () => {
  it('updateManifest num cofre v5 continua selando a v2', async () => {
    const { vaultKey } = await seedLegacyVault();
    updateManifest(vaultKey);

    const container = readVaultContainer();
    expect(container?.version).toBe(5);
    expect(container?.manifest).not.toBeNull();
    if (container?.manifest !== null && container?.manifest !== undefined) {
      expect(openManifest(vaultKey, container.manifest).version).toBe(2);
    }
  });

  it('a conferência da v2 olha os ids e não os hashes', async () => {
    const { vaultKey } = await seedLegacyVault({ entryIds: [ENTRY_ID] });
    const container = readVaultContainer();
    if (container === null) throw new Error('container sumiu');

    expect(() => vaultStorage.verifyManifestData(container, vaultKey)).not.toThrow();

    // a v2 não tem hash: trocar o conteúdo do arquivo não é detectado por ela.
    // É justamente por isso que a migração re-sela na v3.
    fs.writeFileSync(`${entriesDir()}/${ENTRY_ID}.zke`, Buffer.alloc(64));
    expect(() => vaultStorage.verifyManifestData(container, vaultKey)).not.toThrow();
  });

  it('backupContainer recusa guardar um snapshot de versão diferente da lida', async () => {
    await seedLegacyVault();
    const current = readVaultContainer();
    if (current === null) throw new Error('container sumiu');
    writeVaultContainer({ ...current, version: VAULT_VERSION });

    expect(() => vaultStorage.backupContainer(5)).toThrow();
  });

  it('backupContainer recusa copiar um container ilegível', async () => {
    await seedLegacyVault();
    fs.writeFileSync(containerFile(), Buffer.from('lixo'));

    expect(() => vaultStorage.backupContainer(5)).toThrow();
  });

  it('backupContainer não sobrescreve o snapshot que já existe', async () => {
    const { bytes } = await seedLegacyVault();
    vaultStorage.backupContainer(5);

    // um container posterior, com o mesmo número de versão, não pode tomar o
    // lugar do primeiro snapshot: é ele que guarda o estado anterior à migração
    const current = readVaultContainer();
    if (current === null) throw new Error('container sumiu');
    writeVaultContainer({ ...current, createdAt: current.createdAt + 1 });
    vaultStorage.backupContainer(5);

    expect(fs.readFileSync(containerBackupFile(5)).equals(bytes)).toBe(true);
  });

  it('a redefinição de PIN grava mesmo sem conseguir o snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await seedLegacyVault();
    vi.spyOn(vaultStorage, 'backupContainer').mockImplementation(() => {
      throw new Error('sem espaço');
    });

    const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(result.ok).toBe(true);
    // o PIN novo não pode ser perdido por causa do snapshot: a migração vai
    // adiante e a falha do snapshot fica no log
    expect(readVaultContainer()?.version).toBe(VAULT_VERSION);
    expect(fs.existsSync(containerBackupFile(5))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('o Cryptographic Erase apaga o snapshot de downgrade', async () => {
    await seedLegacyVault();
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
    const backup = containerBackupFile(5);
    expect(fs.existsSync(backup)).toBe(true);

    eraseVault();
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(false);
  });
});
