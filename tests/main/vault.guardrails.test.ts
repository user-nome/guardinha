// @vitest-environment node
import fs from 'fs-extra';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { vaultSession } from '@zero/main/session';
import * as unwrapping from '@zero/main/unwrapping';
import {
  clearPanicPin,
  createVault,
  getStatus,
  panicStatus,
  resetPin,
  setNukeLimit,
  setPanicPin,
  unlock,
} from '@zero/main/vault';
import { readAuthState, writeAuthState } from '@zero/main/storage';
import { containerFile } from '@zero/main/layout';
import type { PersistedAuthState } from '@zero/types';

/**
 * Caminhos de decisão que os testes de fluxo não alcançam: estados ausentes, limites fora da
 * faixa e autodestruição por tentativas.
 */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const OTHER_PIN = '73918264';
/** PIN novo dos testes de redefinição; distinto do PIN real e do de coação. */
const NEW_PIN = '18520473';
const m = currentMessages();
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

const NEUTRAL: PersistedAuthState = {
  attempts: 0,
  lockUntil: null,
  attemptsMaster: 0,
  nukeLimit: 0,
};

// um cofre só: `createVault` recusa a segunda vez e derivar Argon2id de novo é lento
beforeAll(async () => {
  const result = await createVault({
    masterPassword: MASTER,
    pin: PIN,
    recoveryPhrase: PHRASE,
  });
  expect(result.ok).toBe(true);
}, 120_000);

describe('limite estrito de tentativas', () => {
  it('recusa limite que não é inteiro ou é negativo', async () => {
    const m = currentMessages();
    expect(await setNukeLimit(12.5)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    expect(await setNukeLimit(Number.NaN)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    expect(await setNukeLimit(-1)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    // acima de UInt32 o `writeUInt32BE` estourava `RangeError` no meio da gravação
    expect(await setNukeLimit(2 ** 32)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
  });

  it('recusa limite ligado abaixo do piso, para não confundir com erro de digitação', async () => {
    const m = currentMessages();
    expect(await setNukeLimit(10)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.nukeLimitTooLow }),
    );
  });

  it('aceita desligar com 0 e qualquer valor no piso ou acima', async () => {
    expect((await setNukeLimit(0)).ok).toBe(true);
    expect((await setNukeLimit(50)).ok).toBe(true);
  });

  it('recomeça a contagem quando o limite muda de valor', async () => {
    await setNukeLimit(80);
    // a contagem anterior foi medida contra outro teto e não vale para o novo
    const state = readAuthState();
    expect(state.nukeLimit).toBe(80);
    expect(state.attemptsMaster).toBe(0);
    await setNukeLimit(0);
  });

  it('o limite sobrevive ao reset da trava, por ser configuração do cofre', async () => {
    await setNukeLimit(60);
    writeAuthState({ ...NEUTRAL, nukeLimit: 60 });
    expect(readAuthState().nukeLimit).toBe(60);
    await setNukeLimit(0);
  });

  it('o estado das proteções reflete o limite gravado', async () => {
    await setNukeLimit(70);
    expect(panicStatus().nukeLimit).toBe(70);
    await setNukeLimit(0);
    expect(panicStatus().nukeLimit).toBe(0);
  });
});

describe('PIN de coação', () => {
  it('exige cofre desbloqueado', async () => {
    vaultSession().wipe();
    const result = await setPanicPin({ pin: OTHER_PIN });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: currentMessages().errors.vaultLocked }),
    );
  });

  it('bloqueado, não muda nem revela as proteções de pânico', async () => {
    // P2: sem sessão, o IPC bloqueado virava um jeito de desarmar as proteções de pânico
    const m = currentMessages();
    vaultSession().wipe();

    expect(await setNukeLimit(50)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.vaultLocked }),
    );
    await expect(clearPanicPin()).rejects.toThrow(m.errors.vaultLocked);
    expect(panicStatus()).toEqual({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
  });

  it('exige 8 dígitos e recusa PIN previsível, com o cofre aberto', async () => {
    const m = currentMessages();
    await unlock({ credential: PIN, kind: 'pin' });

    expect((await setPanicPin({ pin: '1234' })).error).toBe(m.errors.invalidPin);
    expect((await setPanicPin({ pin: '12345678' })).error).toBe(m.errors.trivialPin);
  });

  it('recusa o PIN de coação igual ao PIN que abre o cofre', async () => {
    const m = currentMessages();
    await unlock({ credential: PIN, kind: 'pin' });
    const result = await setPanicPin({ pin: PIN });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: m.errors.panicPinSame }));
  });

  it('recusa PIN de coação previsível mesmo depois de um válido', async () => {
    const m = currentMessages();
    await unlock({ credential: PIN, kind: 'pin' });
    await setPanicPin({ pin: OTHER_PIN });
    expect(panicStatus().hasPanicPin).toBe(true);
    expect((await setPanicPin({ pin: '00000000' })).error).toBe(m.errors.trivialPin);
  });
});

describe('redefinição de PIN', () => {
  it('recusa frase curta mesmo com formato válido', async () => {
    const m = currentMessages();
    vaultSession().wipe();
    writeAuthState(NEUTRAL);
    const result = await resetPin({ phrase: 'poucas palavras', newPin: NEW_PIN });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(m.errors.wrongRecovery);
  });

  it('recusa PIN malformado antes de gastar a derivação', async () => {
    const m = currentMessages();
    writeAuthState(NEUTRAL);
    expect((await resetPin({ phrase: PHRASE, newPin: '1234' })).error).toBe(m.errors.invalidPin);
    expect((await resetPin({ phrase: PHRASE, newPin: '12345678' })).error).toBe(
      m.errors.trivialPin,
    );
  });

  it('recusa enquanto a trava exponencial está de pé', async () => {
    writeAuthState({ ...NEUTRAL, attempts: 3, lockUntil: Date.now() + 60_000 });
    const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Muitas tentativas');
    writeAuthState(NEUTRAL);
  });

  it('recusa frase que não é a do usuário', async () => {
    writeAuthState(NEUTRAL);
    const result = await resetPin({
      phrase: 'outra frase completamente diferente escrita aqui agora',
      newPin: NEW_PIN,
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: currentMessages().errors.wrongRecovery }),
    );
  });

  it('recusa instalar o PIN de coação como novo PIN', async () => {
    // P10: o PIN de coação aqui destruiria o cofre no login seguinte; a recusa vem depois da frase
    writeAuthState(NEUTRAL);
    const result = await resetPin({ phrase: PHRASE, newPin: OTHER_PIN });

    expect(result).toEqual(expect.objectContaining({ ok: false, error: m.errors.panicPinSame }));
  });

  it('reembrulha a frase quando o perfil de custo está desatualizado', async () => {
    writeAuthState(NEUTRAL);
    const recovery = unwrapping.keyUnwrapperFor('recovery');
    const checkKdf = vi.spyOn(unwrapping, 'isKdfUpToDate').mockReturnValue(false);
    const wrap = vi.spyOn(recovery, 'wrap');

    const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });

    expect(result.ok).toBe(true);
    expect(checkKdf).toHaveBeenCalledWith('recovery', expect.any(Object));
    expect(wrap).toHaveBeenCalledOnce();
  });
});

describe('cofre ausente', () => {
  // diretório próprio e vazio: nada de `vault.zkv` para as funções acharem
  let previousDir: string | undefined;

  beforeEach(() => {
    previousDir = process.env.GUARDINHA_VAULT_DIR;
    process.env.GUARDINHA_VAULT_DIR = fs.mkdtempSync(
      path.join(process.env.HOME ?? '/tmp', 'sem-cofre-'),
    );
  });

  afterEach(() => {
    clearDestroyedFlag();
    if (previousDir === undefined) delete process.env.GUARDINHA_VAULT_DIR;
    else process.env.GUARDINHA_VAULT_DIR = previousDir;
  });

  it('o estado de trava devolve o neutro, sem estourar', () => {
    // sem `vault.zkv`, ler o estado dá zero em vez de lançar: é o que `vault:status` responde
    expect(readAuthState()).toEqual(NEUTRAL);
  });

  it('as proteções de pânico aparecem desligadas', () => {
    expect(panicStatus()).toEqual({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
  });

  it('unlock diz que o cofre não existe', async () => {
    const result = await unlock({ credential: PIN, kind: 'pin' });

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
  });

  it('setNukeLimit diz que o cofre não existe', async () => {
    const result = await setNukeLimit(50);

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
  });

  it('resetPin diz que o cofre não existe, sem gastar tentativa', async () => {
    const result = await resetPin({ newPin: OTHER_PIN, phrase: PHRASE });

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
    // nenhuma contagem de tentativa: sem cofre não houve tentativa nenhuma
    expect(readAuthState()).toEqual(NEUTRAL);
  });

  it('clearPanicPin não explode e devolve o estado neutro', async () => {
    // sem container não há PIN de coação para remover, e a função devolve o status assim mesmo
    expect(await clearPanicPin()).toMatchObject({ exists: false, attempts: 0, lockUntil: null });
  });

  it('escrever estado de trava não recria o cofre do nada', () => {
    writeAuthState({ ...NEUTRAL, attempts: 2, lockUntil: Date.now() + 1000 });
    expect(getStatus().exists).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(false);
  });
});

describe('piso do limite de autodestruição', () => {
  it('recusa 1 e aceita 0 como desligado', async () => {
    // `limit > 0` separa "desligado" (0) de "abaixo do piso"; com 0 virando 1, o limite 1 passaria
    expect(await setNukeLimit(1)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.nukeLimitTooLow }),
    );
    expect((await setNukeLimit(0)).ok).toBe(true);
    expect(panicStatus().nukeLimit).toBe(0);
  });
});

/** Com o arquivo ausente, cada função diz "cofre inexistente" em vez de estourar ou gravar. */

/** Os três casos abaixo precisam de um cofre aberto que depois perde o container, em pasta própria. */
describe('cofre aberto que some no meio do caminho', () => {
  let previousDir: string | undefined;
  let dir: string;

  beforeAll(async () => {
    previousDir = process.env.GUARDINHA_VAULT_DIR;
    dir = fs.mkdtempSync(path.join(process.env.HOME ?? '/tmp', 'cofre-que-some-'));
    process.env.GUARDINHA_VAULT_DIR = dir;
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  afterEach(() => {
    clearDestroyedFlag();
    writeAuthState(NEUTRAL);
  });

  // sem isto, o `GUARDINHA_VAULT_DIR` vazaria para outros arquivos de teste do mesmo worker
  afterAll(() => {
    if (previousDir === undefined) delete process.env.GUARDINHA_VAULT_DIR;
    else process.env.GUARDINHA_VAULT_DIR = previousDir;
  });

  /** Some com o container e devolve a função que o restaura. */
  function semContainer(): () => void {
    const arquivo = containerFile();
    const backup = fs.readFileSync(arquivo);
    fs.rmSync(arquivo, { force: true });
    return () => fs.writeFileSync(arquivo, backup);
  }

  async function abrir(): Promise<void> {
    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(true);
  }

  it('setPanicPin diz que o cofre não existe em vez de gravar por cima', async () => {
    // a ordem importa: abrir primeiro, senão a função responde "travado" antes de olhar o arquivo
    await abrir();
    const restaurar = semContainer();
    try {
      const result = await setPanicPin({ pin: OTHER_PIN });

      expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
    } finally {
      restaurar();
    }
  });

  it('resetPin diz que a frase está errada quando o método sumiu', async () => {
    // container sem `recovery` é cofre sem frase: a resposta é de frase errada, nunca uma exceção
    await abrir();
    const arquivo = containerFile();
    const { readVaultContainer, writeVaultContainer } = await import('@zero/main/storage');
    const data = readVaultContainer();
    if (data === null) throw new Error('container de teste ausente');
    const backup = fs.readFileSync(arquivo);
    delete data.methods.recovery;
    writeVaultContainer(data);

    try {
      const result = await resetPin({ newPin: OTHER_PIN, phrase: PHRASE });

      expect(result).toMatchObject({ ok: false, error: m.errors.wrongRecovery });
    } finally {
      fs.writeFileSync(arquivo, backup);
    }
  });

  it('erro sem mensagem cai no texto de fallback, e não na tela vazia', async () => {
    // `errorMessage` só confia em mensagem não vazia, senão a tela fica sem texto nenhum
    const { vaultStorage } = await import('@zero/main/facade');
    const leitura = vi.spyOn(vaultStorage, 'readContainer').mockImplementation(() => {
      throw new Error('');
    });

    try {
      const result = await unlock({ credential: PIN, kind: 'pin' });

      expect(result).toMatchObject({ ok: false, error: m.errors.vaultTampered });
      expect(result.error).not.toBe('');
    } finally {
      leitura.mockRestore();
    }
  });
});
