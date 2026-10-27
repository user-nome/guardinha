// @vitest-environment node
import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { unpackEntryPayload } from '@zero/main/container';
import { decryptRecord, randomBytes } from '@zero/main/crypto';
import { isVaultDestroyed } from '@zero/main/erasure-state';
import { vaultStorage } from '@zero/main/facade';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { readVaultContainer, writeVaultContainer } from '@zero/main/storage';
import { vaultSession } from '@zero/main/session';
import { panicDestroy } from '@zero/main/vault';
import { resetVaultDir, seedVault } from './helpers.js';

const MASTER = 'senha-mestra-guardinha24';
const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Ataques ao Cryptographic Erase: a ordem (memória antes do disco), o que
 * sobrevive no sistema de arquivos e a guarda que impede o container de voltar.
 */

afterAll(() => {
  resetVaultDir();
});

describe('a chave sai da memória antes do disco', () => {
  it('zera a chave mesmo quando o erase lança no meio do caminho', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });
    vaultSession().adopt(vaultKey);
    vi.spyOn(vaultStorage, 'erase').mockImplementation(() => {
      throw new Error('falha de disco simulada');
    });

    await expect(panicDestroy()).rejects.toThrow('falha de disco simulada');

    // A chave do Buffer adotado e a da sessão têm de estar zeradas: o atacante
    // com o mesmo usuário lê a memória do processo, e o disco pode falhar.
    expect(vaultKey.every((byte) => byte === 0)).toBe(true);
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isUnlocked()).toBe(false);
  });

  it('avisa no log quando o erase deixa arquivos para trás', async () => {
    // uma falha de I/O não pode virar "destruído" na tela com a chave ainda no
    // disco: o aviso é o único sinal de que o cofre pode abrir de novo
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });
    vaultSession().adopt(vaultKey);
    vi.spyOn(vaultStorage, 'erase').mockReturnValue({ shredded: 1, failed: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await panicDestroy();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 arquivo(s)'));
    // a chave sai da RAM mesmo quando o disco não foi limpo por inteiro
    expect(vaultKey.every((byte) => byte === 0)).toBe(true);
    expect(vaultSession().keyOrNull()).toBeNull();
  });

  it('zera a chave e apaga container, credenciais e tokens no caminho feliz', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
      authIds: [AUTH_ID],
    });
    vaultSession().adopt(vaultKey);
    expect(fs.existsSync(containerFile())).toBe(true);

    await panicDestroy();

    expect(vaultKey.every((byte) => byte === 0)).toBe(true);
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
    expect(fs.existsSync(authDir())).toBe(false);
    expect(isVaultDestroyed()).toBe(true);
  });
});

describe('o que sobra no disco não abre nada', () => {
  it('um payload de credencial copiado não abre com a chave zerada', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });
    const copiedFile = Buffer.from(fs.readFileSync(`${entriesDir()}/${ENTRY_ID}.zke`));
    const payload = unpackEntryPayload(copiedFile);
    if (payload === null) throw new Error('o fixture gerou um .zke inválido');
    vaultSession().adopt(vaultKey);

    await panicDestroy();

    // a chave em RAM foi zerada; uma cópia do arquivo, sozinha, é ruído
    expect(vaultKey.every((byte) => byte === 0)).toBe(true);
    expect(() => decryptRecord(payload, vaultKey)).toThrow();
    expect(() => decryptRecord(payload, Buffer.alloc(32))).toThrow();
  });

  it('o container não ressuscita a partir de um estado ainda em memória', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });
    const stale = readVaultContainer();
    if (stale === null) throw new Error('o cofre semeado sumiu');
    vaultSession().adopt(vaultKey);

    await panicDestroy();
    writeVaultContainer(stale);

    expect(fs.existsSync(containerFile())).toBe(false);
    expect(isVaultDestroyed()).toBe(true);
  });

  it('remove também temporários órfãos dentro das pastas do cofre', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });
    fs.writeFileSync(`${entriesDir()}/orfao.zke.tmp`, 'resto-de-uma-escrita');
    fs.writeFileSync(`${authDir()}/orfao.zka.tmp`, 'resto-de-uma-escrita');
    vaultSession().adopt(vaultKey);

    await panicDestroy();

    expect(fs.existsSync(`${entriesDir()}/orfao.zke.tmp`)).toBe(false);
    expect(fs.existsSync(`${authDir()}/orfao.zka.tmp`)).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
    expect(fs.existsSync(authDir())).toBe(false);
  });

  it('o erase é idempotente e não devolve erro na segunda chamada', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({ vaultKey, credentials: { master: MASTER } });

    await panicDestroy();
    const second = await panicDestroy();

    expect(second).toMatchObject({ exists: false });
    expect(isVaultDestroyed()).toBe(true);
    vaultKey.fill(0);
  });
});
