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
 * Ramas de decisão do cofre que os testes de fluxo não alcançam: estados
 * ausentes, limites fora da faixa e a autodestruição por tentativas. São os
 * caminhos que decidem se o cofre sobrevive, então cada um ganha teste próprio.
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

// um cofre só para os três blocos: `createVault` recusa a segunda vez, e
// derivar Argon2id de novo a cada bloco tornaria a suíte lenta sem ganho
beforeAll(async () => {
  const result = await createVault({
    masterPassword: MASTER,
    pin: PIN,
    recoveryPhrase: PHRASE,
  });
  expect(result.ok).toBe(true);
}, 120_000);

describe('limite estrito de tentativas', () => {
  it('recusa limite que não é inteiro ou é negativo', () => {
    const m = currentMessages();
    expect(setNukeLimit(12.5)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    expect(setNukeLimit(Number.NaN)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    expect(setNukeLimit(-1)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
    // o campo é UInt32 no container: acima disso o `writeUInt32BE` estourava
    // `RangeError` no meio da gravação, em vez de devolver erro de domínio
    expect(setNukeLimit(2 ** 32)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.invalidNukeLimit }),
    );
  });

  it('recusa limite ligado abaixo do piso, para não confundir com erro de digitação', () => {
    const m = currentMessages();
    expect(setNukeLimit(10)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.nukeLimitTooLow }),
    );
  });

  it('aceita desligar com 0 e qualquer valor no piso ou acima', () => {
    expect(setNukeLimit(0).ok).toBe(true);
    expect(setNukeLimit(50).ok).toBe(true);
  });

  it('recomeça a contagem quando o limite muda de valor', () => {
    setNukeLimit(80);
    // a contagem anterior foi medida contra outro teto e não vale para o novo
    const state = readAuthState();
    expect(state.nukeLimit).toBe(80);
    expect(state.attemptsMaster).toBe(0);
    setNukeLimit(0);
  });

  it('o limite sobrevive ao reset da trava, por ser configuração do cofre', () => {
    setNukeLimit(60);
    writeAuthState({ ...NEUTRAL, nukeLimit: 60 });
    expect(readAuthState().nukeLimit).toBe(60);
    setNukeLimit(0);
  });

  it('o estado das proteções reflete o limite gravado', () => {
    setNukeLimit(70);
    expect(panicStatus().nukeLimit).toBe(70);
    setNukeLimit(0);
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

  it('bloqueado, não muda nem revela as proteções de pânico', () => {
    // P2: `clearPanicPin` e `setNukeLimit` não exigiam sessão, e `panicStatus`
    // anunciava a existência do segundo caminho sem credencial. O IPC bloqueado
    // virava um jeito de desarmar a proteção.
    const m = currentMessages();
    vaultSession().wipe();

    expect(setNukeLimit(50)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.vaultLocked }),
    );
    expect(() => clearPanicPin()).toThrow(m.errors.vaultLocked);
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
    // P10: `tryPanicUnlock` roda antes da cadeia normal. Se a redefinição
    // aceitasse o PIN de coação como novo PIN, o login seguinte destruiria o
    // cofre em vez de abri-lo. A recusa só acontece depois da frase, para não
    // virar oráculo de pânico para quem não provou a recuperação.
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
    // sem `vault.zkv`, ler o estado precisa dar zero em vez de lançar: é o
    // que `vault:status` responde no primeiro start
    expect(readAuthState()).toEqual(NEUTRAL);
  });

  it('as proteções de pânico aparecem desligadas', () => {
    expect(panicStatus()).toEqual({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
  });

  it('unlock diz que o cofre não existe', async () => {
    const result = await unlock({ credential: PIN, kind: 'pin' });

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
  });

  it('setNukeLimit diz que o cofre não existe', () => {
    const result = setNukeLimit(50);

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
  });

  it('resetPin diz que o cofre não existe, sem gastar tentativa', async () => {
    const result = await resetPin({ newPin: OTHER_PIN, phrase: PHRASE });

    expect(result).toMatchObject({ ok: false, error: m.errors.vaultMissing });
    // nenhuma contagem de tentativa: sem cofre não houve tentativa nenhuma
    expect(readAuthState()).toEqual(NEUTRAL);
  });

  it('clearPanicPin não explode e devolve o estado neutro', () => {
    // Sem container não há PIN de coação para remover, e a função precisa
    // devolver o status assim mesmo em vez de estourar em cima do chamador.
    expect(clearPanicPin()).toMatchObject({ exists: false, attempts: 0, lockUntil: null });
  });

  it('escrever estado de trava não recria o cofre do nada', () => {
    writeAuthState({ ...NEUTRAL, attempts: 2, lockUntil: Date.now() + 1000 });
    expect(getStatus().exists).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(false);
  });
});

describe('piso do limite de autodestruição', () => {
  it('recusa 1 e aceita 0 como desligado', () => {
    // O `limit > 0` é o que separa "desligado" (0) de "abaixo do piso" (1..49).
    // Com o `0` virando `1`, um limite de 1 passaria a ser aceito e a
    // autodestruição dispararia na primeira senha mestra errada.
    expect(setNukeLimit(1)).toEqual(
      expect.objectContaining({ ok: false, error: m.errors.nukeLimitTooLow }),
    );
    expect(setNukeLimit(0).ok).toBe(true);
    expect(panicStatus().nukeLimit).toBe(0);
  });
});

/**
 * As operações do cofre com o arquivo ausente. Sem o cofre não há nada a
 *Protectir, e cada função tem que dizer "cofre inexistente" em vez de estourar
 * em cima do chamador ou, pior, gravar alguma coisa.
 */

/**
 * Os três casos abaixo precisam de um cofre **aberto** e depois sem container, o
 * que os blocos de cima não deixam: eles trocam o PIN e, no caminho, apagam o
 * arquivo. Aqui a pasta é própria e o cofre nasce com o PIN conhecido, para que
 * a ordem dos testes não mude o que está sendo coberto.
 */
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

  // Sem isto o `GUARDINHA_VAULT_DIR` apontando para a pasta temporária vazia
  // vazaria para os outros arquivos de teste que rodarem no mesmo worker.
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
    // A ordem importa: primeiro o cofre abre (senão a função responde "travado"
    // antes de olhar o arquivo), e só então o container some. É o estado em que
    // um `read-modify-write` apagaria a credencial real e deixaria o cofre de
    // coação apontando para nada.
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
    // Um container sem `recovery` é um cofre cuja frase não existe mais. A
    // resposta tem que ser a de frase errada, e não uma exceção: essa é a única
    // porta que sobrou para quem tem o PIN e não tem a frase.
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
    // `errorMessage` só confia na mensagem do `Error` quando ela diz alguma
    // coisa. Um erro sem texto viraria string vazia na interface, que o usuário
    // lê como "o app não disse nada" em vez de "o cofre foi adulterado".
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
