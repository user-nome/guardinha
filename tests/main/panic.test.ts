// @vitest-environment node
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthState } from '@zero/main/auth';
import { decryptRecord } from '@zero/main/crypto';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { createVaultKey, readEntryPayload, writeEntryPayload } from '@zero/main/entries-store';
import { listEntries, saveEntry } from '@zero/main/entries';
import { vaultStorage } from '@zero/main/facade';
import { containerFile, entriesDir, vaultDir } from '@zero/main/layout';
import { unpackVaultContainer } from '@zero/main/container';
import { readVaultContainer, writeVaultContainer } from '@zero/main/storage';
import { vaultSession } from '@zero/main/session';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import {
  clearPanicPin,
  createVault,
  getStatus,
  hasPanicPin,
  panicStatus,
  setNukeLimit,
  setPanicPin,
  unlock,
} from '@zero/main/vault';
import { MIN_NUKE_LIMIT } from '@zero/shared/auth-constants';
import { KDF_PIN } from '@zero/main/crypto';

const MASTER = 'senha-mestra-guardinha24';
const WRONG_MASTER = 'senha-mestra-errada-0000';
const PIN = '49201733';
const PANIC_PIN = '73910456';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase nenhuma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/**
 * Um cofre de verdade só pode ser criado por `createVault`, e isso custa três
 * derivações Argon2id (128 + 256 + 128 MB, cerca de 45 s). Em vez de pagar isso
 * em cada cenário, o cofre é criado uma vez e o `vault.zkv` resultante é
 * fotografado; cada teste restaura a foto antes de começar.
 *
 * A restauração também libera a guarda de destruição e devolve a chave à
 * sessão, senão o próprio mecanismo que estes testes exercitam (o erase marcar
 * o cofre como destruído) deixaria o cofre impossível de recriar.
 */
let snapshot: Buffer;
let vaultKey: Buffer;

beforeAll(async () => {
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  clearDestroyedFlag();
  const created = await createVault({
    masterPassword: MASTER,
    pin: PIN,
    recoveryPhrase: PHRASE,
  });
  expect(created.ok).toBe(true);
  expect((await setPanicPin({ pin: PANIC_PIN })).ok).toBe(true);
  snapshot = fs.readFileSync(containerFile());
  // cópia própria: o `wipe` do erase zera o Buffer original no lugar
  vaultKey = Buffer.from(vaultSession().requireKey());
});

beforeEach(() => {
  vaultSession().wipe();
  clearDestroyedFlag();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  const unpacked = unpackVaultContainer(snapshot);
  if (!unpacked.ok) throw new Error(`fotografia do cofre ficou inválida (${unpacked.reason})`);
  writeVaultContainer(unpacked.data);
  vaultSession().adopt(vaultKey);
});

afterAll(() => {
  fs.rmSync(vaultDir(), { recursive: true, force: true });
});

/** Avança a contagem da senha mestra sem pagar o Argon2id de cada tentativa. */
function seedAttemptsMaster(value: number): void {
  const container = readVaultContainer();
  if (container === null) throw new Error('cofre semeado sumiu');
  container.attemptsMaster = value;
  container.attempts = 0;
  container.lockUntil = null;
  writeVaultContainer(container);
}

describe('PIN de coação', () => {
  it('instala o método panic e o reporta na interface', () => {
    expect(hasPanicPin()).toBe(true);
    expect(panicStatus()).toMatchObject({ hasPanicPin: true, nukeLimit: 0 });
  });

  it('recusa o próprio PIN do cofre como PIN de pânico', async () => {
    const same = await setPanicPin({ pin: PIN });

    expect(same.ok).toBe(false);
    // o PIN real continua sendo o único caminho que abre o cofre
    expect(hasPanicPin()).toBe(true);
  });

  it('recusa PIN malformado ou previsível', async () => {
    expect((await setPanicPin({ pin: '123' })).ok).toBe(false);
    expect((await setPanicPin({ pin: '11111111' })).ok).toBe(false);
    expect(hasPanicPin()).toBe(true);
  });

  it('exige cofre desbloqueado para instalar', async () => {
    vaultSession().wipe();

    const result = await setPanicPin({ pin: '50617238' });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('apaga o cofre e devolve um cofre vazio quando é digitado', async () => {
    saveEntry({
      title: 'Banco do Teste',
      username: 'tester',
      password: 'senha-de-teste-guardinha',
      domain: 'banco.teste',
      notes: '',
    });
    expect(fs.existsSync(containerFile())).toBe(true);

    const result = await unlock({ credential: PANIC_PIN, kind: 'pin' });

    // `ok: true` é deliberado: um erro denunciaria o mecanismo a quem está sob
    // coação. O que a pessoa vê é um cofre aberto e sem nada dentro.
    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({ exists: true, locked: false });
    expect(listEntries()).toEqual([]);
    // e o disco realmente não tem mais nada
    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
    // sem chave em memória: a sessão decoy não guarda a chave real
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isDecoy()).toBe(true);
  });

  it('o PIN de pânico errado não apaga nada e segue o fluxo normal', async () => {
    const result = await unlock({ credential: '11111111', kind: 'pin' });

    expect(result.ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(vaultSession().isDecoy()).toBe(false);
  });

  it('o PIN de pânico não conta tentativa além da normal, e não gera lockout', async () => {
    const before = loadAuthState().attempts;

    await unlock({ credential: '11111111', kind: 'pin' });

    // apenas a tentativa normal de PIN é contada; nada além disso
    expect(loadAuthState().attempts).toBe(before + 1);
  });

  it('funciona mesmo com a trava exponencial ativa', async () => {
    const container = readVaultContainer();
    if (container === null) throw new Error('cofre semeado sumiu');
    container.attempts = 5;
    container.lockUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 h
    writeVaultContainer(container);

    // o PIN normal seria recusado pela trava
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(false);

    // o de pânico não: é uma escolha consciente, registrada no SECURITY.md
    const result = await unlock({ credential: PANIC_PIN, kind: 'pin' });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(containerFile())).toBe(false);
  });

  it('só tenta o PIN de pânico para entrada em formato de PIN', async () => {
    // senha mestra com 24 caracteres nunca é o PIN de pânico
    const result = await unlock({ credential: MASTER, kind: 'master' });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(containerFile())).toBe(true);
  });

  it('o PIN de pânico não apaga o cofre quando chega pelo campo da senha mestra', async () => {
    // O `tryPanicUnlock` exige as três coisas: método instalado, entrada em
    // formato de PIN e PIN válido. Se a checagem de formato deixar de ser uma
    // condição, o PIN de pânico (8 dígitos) entra pelo caminho da senha mestra,
    // desembrulha a decoy e **apaga o cofre** de quem nem estava sob coação.
    const result = await unlock({ credential: PANIC_PIN, kind: 'master' });

    expect(result.ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(hasPanicPin()).toBe(true);
    expect(vaultSession().isDecoy()).toBe(false);
  });

  it('remove o caminho de pânico quando o PIN é apagado', async () => {
    clearPanicPin();

    expect(hasPanicPin()).toBe(false);
    expect((await unlock({ credential: PANIC_PIN, kind: 'pin' })).ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
  });

  it('a sessão decoy morre no lock e o cofre volta a parecer destruído', async () => {
    await unlock({ credential: PANIC_PIN, kind: 'pin' });
    expect(getStatus()).toMatchObject({ exists: true, locked: false });

    vaultSession().wipe();

    expect(getStatus()).toMatchObject({ exists: false, locked: true });
  });
});

describe('autodestruição por tentativas da senha mestra', () => {
  it('começa desligada em um cofre novo', () => {
    expect(panicStatus().nukeLimit).toBe(0);
  });

  it('recusa limite abaixo do piso, para não confundir com erro de digitação', () => {
    expect(setNukeLimit(5).ok).toBe(false);
    expect(setNukeLimit(MIN_NUKE_LIMIT - 1).ok).toBe(false);
    expect(setNukeLimit(-1).ok).toBe(false);
    expect(setNukeLimit(1.5).ok).toBe(false);
    expect(panicStatus().nukeLimit).toBe(0);
  });

  it('aceita o limite a partir do piso e o persiste', () => {
    const result = setNukeLimit(MIN_NUKE_LIMIT);

    expect(result.ok).toBe(true);
    expect(panicStatus().nukeLimit).toBe(MIN_NUKE_LIMIT);
  });

  it('não apaga o cofre uma tentativa antes do corte', async () => {
    setNukeLimit(MIN_NUKE_LIMIT);
    seedAttemptsMaster(MIN_NUKE_LIMIT - 2);

    const result = await unlock({ credential: WRONG_MASTER, kind: 'master' });

    expect(result.ok).toBe(false);
    expect(loadAuthState().attemptsMaster).toBe(MIN_NUKE_LIMIT - 1);
    expect(fs.existsSync(containerFile())).toBe(true);
  });

  it('apaga o cofre ao cruzar o limite com senha mestra errada', async () => {
    setNukeLimit(MIN_NUKE_LIMIT);
    seedAttemptsMaster(MIN_NUKE_LIMIT - 1);

    const result = await unlock({ credential: WRONG_MASTER, kind: 'master' });

    expect(result.ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(false);
    expect(vaultSession().keyOrNull()).toBeNull();
  });

  it('PIN errado não apaga o cofre, mesmo com o limite armado', async () => {
    setNukeLimit(MIN_NUKE_LIMIT);
    seedAttemptsMaster(MIN_NUKE_LIMIT - 1);

    const result = await unlock({ credential: '11111111', kind: 'pin' });

    expect(result.ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(loadAuthState().attemptsMaster).toBe(MIN_NUKE_LIMIT - 1);
  });

  it('trocar o limite recomeça a contagem', () => {
    seedAttemptsMaster(40);

    setNukeLimit(80);

    expect(panicStatus().attemptsMaster).toBe(0);
  });

  it('zerar o limite desliga a autodestruição', async () => {
    setNukeLimit(MIN_NUKE_LIMIT);

    expect(setNukeLimit(0).ok).toBe(true);
    expect(panicStatus().nukeLimit).toBe(0);
    seedAttemptsMaster(MIN_NUKE_LIMIT + 10);
    expect((await unlock({ credential: WRONG_MASTER, kind: 'master' })).ok).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
  });
});

describe('o PIN de pânico não pode ser medido pelo atacante', () => {
  it('o custo do método panic é o mesmo do PIN, para não denunciar o atalho', () => {
    expect(keyUnwrapperFor('panic').kdf).toMatchObject(KDF_PIN);
    expect(keyUnwrapperFor('panic').kdf).toEqual(keyUnwrapperFor('pin').kdf);
  });

  it('o método panic embrulha uma chave que não abre nada', async () => {
    const id = 'eeeeeeee-1111-4111-8111-111111111111';
    writeEntryPayload(id, {
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: 'dd',
    });

    const unwrapper = keyUnwrapperFor('panic');
    const method = await unwrapper.wrap(createVaultKey(), PANIC_PIN);
    const derived = await unwrapper.derive(method, PANIC_PIN);
    const decoy = unwrapper.unwrap(method, derived);

    // a chave decoy tem o tamanho de qualquer chave do cofre
    expect(decoy).toHaveLength(32);
    // e não é a chave real: nenhum `.zke` decifra com ela
    expect(() => decryptRecord(readEntryPayload(id), decoy)).toThrow();
  });
});

/**
 * `setPanicPin` compara o PIN de pânico com o PIN real **quando ele existe**. Se
 * o container não tem método de PIN, não há o que comparar, e a instalação
 * segue sem tocar no derivador do PIN.
 */
describe('setPanicPin sem PIN real gravado', () => {
  it('não deriva com o método de PIN quando ele não existe no container', async () => {
    const container = readVaultContainer();
    if (container === null) throw new Error('cofre semeado sumiu');
    const semPin = { ...container, methods: { ...container.methods } };
    delete semPin.methods.pin;

    const leitura = vi.spyOn(vaultStorage, 'readContainer').mockReturnValue(semPin);
    const escrita = vi.spyOn(vaultStorage, 'writeContainer').mockImplementation(() => undefined);
    const derive = vi.spyOn(keyUnwrapperFor('pin'), 'derive');
    try {
      const result = await setPanicPin({ pin: '50617238' });

      expect(result.ok).toBe(true);
      expect(hasPanicPin()).toBe(true);
      // sem método de PIN, nem chegaria a derivar com ele
      expect(derive).not.toHaveBeenCalled();
    } finally {
      leitura.mockRestore();
      escrita.mockRestore();
      derive.mockRestore();
    }
  }, 120_000);
});
