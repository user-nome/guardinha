// @vitest-environment node
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { eraseVault } from '@zero/main/erase';
import { clearDestroyedFlag, isVaultDestroyed } from '@zero/main/erasure-state';
import { cleanStaleTempFiles, writeEntryPayload } from '@zero/main/entries-store';
import { writeAuthPayload } from '@zero/main/auth-store';
import { saveEntry } from '@zero/main/entries';
import { authDir, containerFile, entriesDir, vaultDir } from '@zero/main/layout';
import {
  readAuthState,
  readVaultContainer,
  updateManifest,
  writeAuthState,
  writeVaultContainer,
} from '@zero/main/storage';
import { ensureVaultStructure } from '@zero/main/structure';
import { vaultSession } from '@zero/main/session';
import { createVault, panicDestroy } from '@zero/main/vault';
import type { VaultContainerData } from '@zero/main/container';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/** Payload qualquer: o erase apaga bytes, não decifra nada. */
const DUMMY_PAYLOAD = {
  salt: 'aa'.repeat(16),
  iv: 'bb'.repeat(16),
  tag: 'cc'.repeat(16),
  encryptedData: 'dd',
};

/** Cofre semeado sem Argon2id: o erase não depende da credencial, e o cofre real é caro. */
function seedVault(entryIds: string[]): void {
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  // um erase anterior deixou a marca de destruído, e é a guarda de `writeVaultContainer`
  clearDestroyedFlag();
  ensureVaultStructure();
  const cheap = { algo: 'argon2id', memoryKiB: 16_384, iterations: 1, parallelism: 1 } as const;
  const container: VaultContainerData = {
    version: 6,
    createdAt: 1_767_268_800_000,
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      pin: { kdf: cheap, kdfSalt: '11'.repeat(16), payload: DUMMY_PAYLOAD },
      master: { kdf: cheap, kdfSalt: '22'.repeat(16), payload: DUMMY_PAYLOAD },
    },
    manifest: null,
  };
  writeVaultContainer(container);
  for (const id of entryIds) writeEntryPayload(id, DUMMY_PAYLOAD);
}

afterEach(() => {
  vaultSession().wipe();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
});

describe('Cryptographic Erase (eraseVault)', () => {
  it('apaga o container, as entradas e a pasta .entries', () => {
    seedVault(['aaaaaaaa-1111-4111-8111-111111111111']);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(fs.existsSync(entriesDir())).toBe(true);

    const result = eraseVault();

    expect(result.failed).toBe(0);
    expect(result.shredded).toBeGreaterThanOrEqual(3); // container + .zke + a pasta
    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
  });

  it('conta como falha o arquivo que sobrou depois da sobrescrita', () => {
    // sem permissão o shred falha e o arquivo fica: o relatório conta `failed`, não `shredded`
    seedVault([]);
    const preso = path.join(vaultDir(), 'preso.zkv.tmp');
    fs.writeFileSync(preso, 'conteudo', { mode: 0o000 });

    const result = eraseVault();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(preso)).toBe(true);
  });

  it('não marca o cofre como destruído quando o container continua no disco', () => {
    // marcar destruído com o `vault.zkv` no disco deixaria o cofre somente leitura até reiniciar
    seedVault([]);
    const entrada = vaultDir();
    fs.chmodSync(entrada, 0o500);
    try {
      const result = eraseVault();

      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(containerFile())).toBe(true);
      expect(isVaultDestroyed()).toBe(false);
    } finally {
      fs.chmodSync(entrada, 0o700);
    }
  });

  it('apaga os tokens de 2FA e a pasta .auth junto com o resto', () => {
    // segredo TOTP que sobrevive ao erase vale tanto quanto a senha da conta
    seedVault([]);
    writeAuthPayload('bbbbbbbb-1111-4111-8111-111111111111', DUMMY_PAYLOAD);
    expect(fs.existsSync(authDir())).toBe(true);

    const result = eraseVault();

    expect(result.failed).toBe(0);
    expect(fs.existsSync(authDir())).toBe(false);
  });

  it('apaga o .tmp de um token, que é uma cópia do segredo cifrado', () => {
    seedVault([]);
    const token = 'cccccccc-1111-4111-8111-111111111111';
    writeAuthPayload(token, DUMMY_PAYLOAD);
    const orphan = `${authDir()}/${token}.zka.tmp`;
    fs.writeFileSync(orphan, 'copia', { mode: 0o600 });
    expect(fs.existsSync(orphan)).toBe(true);

    eraseVault();

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('não deixa nenhum arquivo legível na raiz do cofre', () => {
    seedVault(['aaaaaaaa-2222-4222-8222-222222222222']);
    writeAuthPayload('dddddddd-1111-4111-8111-111111111111', DUMMY_PAYLOAD);

    eraseVault();

    const remaining = fs.existsSync(vaultDir()) ? fs.readdirSync(vaultDir()) : [];
    expect(remaining).toEqual([]);
  });

  it('apaga também o .tmp do container, que é uma cópia dos blobs de chave', () => {
    seedVault(['aaaaaaaa-3333-4333-8333-333333333333']);
    const orphan = `${containerFile()}.tmp`;
    fs.copyFileSync(containerFile(), orphan);
    expect(fs.existsSync(orphan)).toBe(true);

    eraseVault();

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('é idempotente: chamar de novo devolve zero e não lança', () => {
    seedVault(['aaaaaaaa-4444-4444-8444-444444444444']);
    eraseVault();

    expect(eraseVault()).toEqual({ shredded: 0, failed: 0 });
  });

  it('não segue symlink: um alvo de fora continua intacto', () => {
    seedVault([]);
    const outside = path.join(vaultDir(), '..', 'alvo-de-fora.txt');
    fs.symlinkSync(outside, path.join(entriesDir(), 'plantado.zke'));
    fs.writeFileSync(outside, 'conteudo que nao é do cofre', { mode: 0o600 });

    eraseVault();

    expect(fs.readFileSync(outside, 'utf8')).toBe('conteudo que nao é do cofre');
    fs.rmSync(outside, { force: true });
  });

  it('conta o que resistiu, sem abortar por causa disso', () => {
    seedVault([]);
    // diretório com nome de arquivo: o shred aborta e devolve false
    fs.mkdirSync(path.join(entriesDir(), 'zko'));

    const result = eraseVault();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(containerFile())).toBe(false); // o resto foi apagado
  });
});

describe('o container não ressuscita depois do erase', () => {
  it('writeAuthState posterior não recria o vault.zkv', () => {
    seedVault(['bbbbbbbb-1111-4111-8111-111111111111']);
    eraseVault();
    expect(fs.existsSync(containerFile())).toBe(false);

    // `writeAuthState` é read-modify-write: sem a guarda ele leria `null` e pararia.
    writeAuthState({ attempts: 9, lockUntil: Date.now() + 1000, attemptsMaster: 3, nukeLimit: 50 });

    expect(fs.existsSync(containerFile())).toBe(false);
    expect(readVaultContainer()).toBeNull();
    expect(readAuthState()).toMatchObject({ attempts: 0, attemptsMaster: 0, nukeLimit: 0 });
  });

  it('updateManifest posterior não recria o vault.zkv sem chave', () => {
    seedVault(['bbbbbbbb-2222-4222-8222-222222222222']);

    eraseVault();
    updateManifest(Buffer.alloc(32, 3));

    expect(fs.existsSync(containerFile())).toBe(false);
  });
});

describe('varredura de temporários órfãos', () => {
  it('apaga .tmp velho e preserva .tmp recente', () => {
    seedVault(['dddddddd-1111-4111-8111-111111111111']);
    const old = path.join(entriesDir(), 'velho.zke.tmp');
    const fresh = path.join(entriesDir(), 'novo.zke.tmp');
    fs.writeFileSync(old, 'conteudo', { mode: 0o600 });
    fs.writeFileSync(fresh, 'conteudo', { mode: 0o600 });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(old, twoHoursAgo, twoHoursAgo);

    const result = cleanStaleTempFiles(60_000);

    expect(result).toEqual({ removed: 1, kept: 1 });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('não toca em arquivo que não é temporário', () => {
    seedVault([]);
    const notVault = path.join(vaultDir(), 'settings.json');
    fs.writeFileSync(notVault, '{"language":"pt-BR"}', { mode: 0o600 });

    expect(cleanStaleTempFiles(60_000)).toEqual({ removed: 0, kept: 0 });
    expect(fs.existsSync(notVault)).toBe(true);
  });

  it('apaga o temporário que sumiu no meio da varredura', () => {
    // `stat` que falha deixa a sobra apagável: deixar `stale` falso viraria lixo permanente.
    seedVault([]);
    const somem = path.join(entriesDir(), 'somem.zke.tmp');
    fs.writeFileSync(somem, 'conteudo', { mode: 0o600 });
    const original = fsExtra.statSync;
    const spy = vi.spyOn(fsExtra, 'statSync').mockImplementation((alvo: fs.PathLike) => {
      if (alvo === somem) throw new Error('sumiu no meio da varredura');
      return original(alvo);
    });

    try {
      expect(cleanStaleTempFiles(60_000)).toEqual({ removed: 1, kept: 0 });
      expect(fs.existsSync(somem)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('preserva o temporário que está exatamente no limite de idade', () => {
    // O corte é `mtime < agora - maxAge`, estrito: a idade exata ainda pode ser escrita em curso.
    seedVault([]);
    const noLimite = path.join(entriesDir(), 'limite.zke.tmp');
    fs.writeFileSync(noLimite, 'conteudo', { mode: 0o600 });
    const agora = Date.now();
    const exato = new Date(agora - 60_000);
    fs.utimesSync(noLimite, exato, exato);

    vi.useFakeTimers();
    vi.setSystemTime(agora);
    try {
      expect(cleanStaleTempFiles(60_000)).toEqual({ removed: 0, kept: 1 });
      expect(fs.existsSync(noLimite)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('mensagem de cofre destruído', () => {
  it('existe e não ecoa nada do conteúdo do cofre', () => {
    const m = currentMessages();
    expect(m.errors.vaultDestroyed).toBeTruthy();
    expect(m.errors.vaultDestroyed).not.toContain(PIN);
    expect(m.errors.vaultDestroyed).not.toContain(MASTER);
  });
});

describe('panicDestroy com cofre de verdade (integração)', () => {
  // `createVault` faz três Argon2id (128 + 256 + 128 MB): é o teste mais caro e o mais completo.
  it('zera a chave da RAM, apaga o disco e devolve o status de cofre novo', async () => {
    fs.rmSync(vaultDir(), { recursive: true, force: true });
    const created = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(created.ok).toBe(true);
    saveEntry({
      title: 'Banco do Teste',
      username: 'tester',
      password: 'senha-de-teste-guardinha',
      domain: 'banco.teste',
      notes: '',
    });
    expect(fs.existsSync(containerFile())).toBe(true);

    // a referência é pega antes do wipe para conferir byte a byte depois
    const keyRef = vaultSession().keyOrNull();
    expect(keyRef).not.toBeNull();

    const status = await panicDestroy();

    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isUnlocked()).toBe(false);
    // o Buffer realmente zerado, não só sem referência
    expect(keyRef?.every((byte) => byte === 0)).toBe(true);
    expect(status).toMatchObject({ exists: false, locked: true });
  });

  it('conta como falha o temporário que sobrou depois da sobrescrita', () => {
    // `.tmp` que o shred não apaga não é sucesso: o relatório precisa dizer que sobrou arquivo.
    seedVault([]);
    const preso = path.join(vaultDir(), 'preso.zkv.tmp');
    fs.writeFileSync(preso, 'conteudo', { mode: 0o000 });
    const velho = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(preso, velho, velho);

    const result = cleanStaleTempFiles(60_000);

    // Sem permissão o shred falha e o arquivo continua lá, sem contar como removido.
    expect(result.removed).toBe(0);
    expect(fs.existsSync(preso)).toBe(true);
  });
});
