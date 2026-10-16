// @vitest-environment node
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { loadAuthState, registerFailedAttempt, resetAttempts, statusFrom } from '@zero/main/auth';
import { writeAuthState } from '@zero/main/storage';
import { vaultStorage } from '@zero/main/facade';
import { createVault, unlock } from '@zero/main/vault';
import { runUnlockChain } from '@zero/main/unlock';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { currentMessages } from '@zero/main/i18n';
import type { UnlockContext } from '@zero/main/unlock';
import type { VaultContainerData } from '@zero/main/container';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/** Container mínimo para a cadeia rodar sem gravar nada. */
async function makeContainer(): Promise<VaultContainerData> {
  const key = Buffer.alloc(32, 5);
  return {
    createdAt: Date.now(),
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      pin: await keyUnwrapperFor('pin').wrap(key, PIN),
      master: await keyUnwrapperFor('master').wrap(key, MASTER),
    },
    manifest: null,
  };
}

function context(
  credential: string,
  kind: 'pin' | 'master',
  container: VaultContainerData,
): UnlockContext {
  return { input: { credential, kind }, container };
}

describe('runUnlockChain (Chain of Responsibility)', () => {
  // criar o cofre custa três derivações Argon2id: sob carga 60 s não bastam
  beforeAll(async () => {
    if (!vaultStorage.exists()) {
      await createVault({ masterPassword: MASTER, pin: PIN, recoveryPhrase: PHRASE });
    }
  }, 120_000);

  // `registerFailedAttempt` grava o `nukeLimit` do container no cofre de verdade
  // e `resetAttempts` o preserva, então os testes de corte não podem deixar a
  // autodestruição ligada para os arquivos seguintes
  afterEach(() => {
    vi.restoreAllMocks();
    writeAuthState({ attempts: 0, lockUntil: null, attemptsMaster: 0, nukeLimit: 0 });
  });

  it('a cadeia libera a chave com a credencial certa', async () => {
    const container = await makeContainer();
    const unlocked = await runUnlockChain(context(PIN, 'pin', container));
    expect(unlocked).toBeNull();
  });

  it('credencial errada conta tentativa e responde o mesmo erro único', async () => {
    resetAttempts();
    const container = await makeContainer();
    const result = await runUnlockChain(context('00000000', 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('PIN malformado é recusado antes do Argon2id (mesmo erro de credencial errada)', async () => {
    resetAttempts();
    const container = await makeContainer();
    // '123' falha no validador de formato: o payload nunca é tocado
    const result = await runUnlockChain(context('123', 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('PIN malformado não chega a derivar: o validador de formato corta antes', async () => {
    // Medir o tempo não basta: com o doppelgänger do Argon2id a derivação é
    // instantânea, e o PIN errado continuaria sendo recusado no fim da cadeia,
    // só que caro. O que separa as duas coisas é a chamada que não aconteceu.
    resetAttempts();
    const container = await makeContainer();
    const derive = vi.spyOn(keyUnwrapperFor('pin'), 'derive');

    const result = await runUnlockChain(context('123', 'pin', container));

    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(derive).not.toHaveBeenCalled();
  });

  it('senha mestra malformada segue a mesma régua do formato', async () => {
    resetAttempts();
    const container = await makeContainer();
    const result = await runUnlockChain(context('curta', 'master', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongMaster });
  });

  it('trava exponencial corta antes de qualquer derivação e não gasta tentativa', async () => {
    resetAttempts();
    registerFailedAttempt('pin'); // 1 falha já trava 10 s na sequência do app
    const state = loadAuthState();
    expect(state.lockUntil).not.toBeNull();

    // o relógio para: o Argon2id do container custa >10 s sob carga e derrubaria
    // a espera antes de a cadeia rodar
    vi.useFakeTimers();
    try {
      const container = await makeContainer();
      const result = await runUnlockChain(context(PIN, 'pin', container));
      expect(result?.ok).toBe(false);
      expect(result?.error).toContain('Muitas tentativas');
      // quem está esperando não paga tentativa nova
      expect(loadAuthState().attempts).toBe(state.attempts);
    } finally {
      vi.useRealTimers();
    }
  });

  it('durante a espera o Argon2id nem roda (retorno em milissegundos)', async () => {
    // ANÁLISE.md, vetor 9: a recusa durante a trava precisa ser barata
    const container = await makeContainer();
    resetAttempts();
    registerFailedAttempt('pin');

    const started = Date.now();
    const result = await runUnlockChain(context(PIN, 'pin', container));
    const elapsed = Date.now() - started;

    expect(result?.ok).toBe(false);
    // um chute de PIN custa ~2 s de Argon2id; a trava devolve sem derivar nada
    expect(elapsed).toBeLessThan(1000);
  });

  it('a trava vale com 1 ms de espera restante, sem deixar a cadeia seguir', async () => {
    // `remaining <= 0` só libera quando a espera chega a zero. Com `<= 1`, o
    // último milissegundo já passaria adiante como se a trava tivesse acabado,
    // e a credencial seguinte rodaria a cadeia inteira.
    const container = await makeContainer();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    writeAuthState({ attempts: 1, lockUntil: 1_000_001, attemptsMaster: 0, nukeLimit: 0 });
    try {
      const result = await runUnlockChain(context(PIN, 'pin', container));
      expect(result?.ok).toBe(false);
      expect(result?.error).toContain('Muitas tentativas');
    } finally {
      vi.useRealTimers();
    }
  });

  it('método ausente no container é credencial errada, com tentativa', async () => {
    resetAttempts();
    const container = await makeContainer();
    delete container.methods.pin;
    const result = await runUnlockChain(context(PIN, 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('derivação que falha é convertida em credencial errada', async () => {
    resetAttempts();
    const container = await makeContainer();
    vi.spyOn(keyUnwrapperFor('pin'), 'derive').mockRejectedValue(new Error('falha no KDF'));

    const result = await runUnlockChain(context(PIN, 'pin', container));

    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
  });

  it('o corte da autodestruição para a cadeia e conta a tentativa uma vez só', async () => {
    // `nukeLimit` no container liga a autodestruição; o `1` faz a primeira
    // falha da senha mestra cruzar o limite.
    resetAttempts();
    const container = await makeContainer();
    const armed: VaultContainerData = { ...container, nukeLimit: 1 };
    // senha mestra malformada: recusa no validador de formato, que tem
    // manipulador depois dele, é onde a cadeia precisa parar de vez
    const ctx = context('curta', 'master', armed);

    const result = await runUnlockChain(ctx);

    // parou sem resposta e avisou quem chamou para destruir o cofre
    expect(result).toBeNull();
    expect(ctx.nuked).toBe(true);
    expect(ctx.vaultKey).toBeUndefined();
    // uma tentativa do usuário, um incremento: na cadeia `null` significa
    // "passe adiante", então devolver `null` no corte deixaria a sequência
    // seguir até a integridade e contaria a mesma falha outra vez
    expect(loadAuthState().attempts).toBe(1);
    expect(loadAuthState().attemptsMaster).toBe(1);
  });

  it('o corte da autodestruição também segura a senha mestra bem formada', async () => {
    resetAttempts();
    const container = await makeContainer();
    const armed: VaultContainerData = { ...container, nukeLimit: 1 };
    // 24 caracteres, formato válido: a recusa só vem da chave errada, no fim
    const ctx = context('senha-mestra-errada-1234', 'master', armed);

    const result = await runUnlockChain(ctx);

    expect(result).toBeNull();
    expect(ctx.nuked).toBe(true);
    expect(loadAuthState().attempts).toBe(1);
    expect(loadAuthState().attemptsMaster).toBe(1);
  });

  it('statusFrom expõe tentativa, espera e travado', () => {
    resetAttempts();
    registerFailedAttempt('pin');
    const status = statusFrom(loadAuthState(), true, true);
    expect(status).toMatchObject({ exists: true, locked: true, attempts: 1 });
    expect(status.lockRemainingMs).toBeGreaterThan(0);
    expect(status.lockUntil).not.toBeNull();
  });

  it('unlock() usa a cadeia e mantém o mesmo contrato de antes', async () => {
    resetAttempts();
    const result = await unlock({ credential: '00000000', kind: 'pin' });
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(result.status.attempts).toBe(1);
  });

  /**
   * Cryptographic Erase da chave de trabalho. O `fill(0)` do manipulador de
   * integridade é o que impede que a chave derivada do Argon2id fique na pilha
   * depois do desbloqueio dar certo; o Buffer é capturado por referência, então
   * continua observável quando a cadeia termina. Um `fill(1)` passaria a suíte
   * inteira se ela só conferisse o resultado do desbloqueio.
   */
  it('apaga a chave derivada depois de usar, no sucesso e na falha', async () => {
    resetAttempts();
    const container = await makeContainer();
    const alvo = keyUnwrapperFor('pin');
    const original = alvo.derive.bind(alvo);
    const derivadas: Buffer[] = [];
    vi.spyOn(alvo, 'derive').mockImplementation(async (method, credential) => {
      const buffer = await original(method, credential);
      derivadas.push(buffer);
      return buffer;
    });

    await runUnlockChain(context(PIN, 'pin', container));
    await runUnlockChain(context('00000000', 'pin', container));

    expect(derivadas).toHaveLength(2);
    for (const buffer of derivadas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  });

  /**
   * A resposta de falha carrega o estado do cofre, e a tela decide o que
   * mostrar a partir dele. Um `true` trocado por `false` aqui mudaria a resposta
   * que o renderer recebe sem quebrar nenhuma outra asserção.
   */
  it('a resposta de falha diz que o cofre existe e continua travado', async () => {
    resetAttempts();
    const container = await makeContainer();
    const result = await runUnlockChain(context('00000000', 'pin', container));
    expect(result).toMatchObject({ ok: false, status: { exists: true, locked: true } });
  });

  it('a resposta de trava também diz que o cofre existe e continua travado', async () => {
    // o manipulador de trava lê o estado do cofre gravado, não o do contexto
    const ate = Date.now() + 60_000;
    writeAuthState({ attempts: 3, lockUntil: ate, attemptsMaster: 0, nukeLimit: 0 });
    const container = await makeContainer();

    const result = await runUnlockChain(context(PIN, 'pin', container));

    expect(result?.ok).toBe(false);
    expect(result?.status).toMatchObject({ exists: true, locked: true, attempts: 3 });
    expect(result?.status.lockRemainingMs).toBeGreaterThan(0);
  });
});
