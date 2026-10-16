// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resetAttempts } from '@zero/main/auth';
import { KDF_CREDENTIAL, KDF_PIN, deriveKey, encryptRecord, randomBytes } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { listEntries, removeEntry, saveEntry } from '@zero/main/entries';
import { vaultStorage } from '@zero/main/facade';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { clearPanicPin, hasPanicPin, setPanicPin } from '@zero/main/vault';
import { readVaultContainer, writeAuthState, writeVaultContainer } from '@zero/main/storage';
import {
  createVault,
  getStatus,
  isUnlocked,
  lock,
  panicStatus,
  requireSessionKey,
  resetPin,
  unlock,
} from '@zero/main/vault';
import type { VaultKdfParams } from '@zero/main/container';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const NEW_PIN = '90427156';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const WRONG_PHRASE = 'frase errada com doze palavras no total para nao cair no minimo';

describe('ciclo de vida do cofre (integração)', () => {
  it('1. cria o cofre com senha mestra, PIN e frase escrita pelo usuário', async () => {
    expect(getStatus()).toMatchObject({ exists: false, locked: true });

    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({ exists: true, locked: false, attempts: 0 });
    expect(isUnlocked()).toBe(true);

    // cada método nasce com o custo do Argon2id adequado ao segredo (v3)
    const container = readVaultContainer();
    expect(container?.methods.pin?.kdf).toMatchObject(KDF_PIN);
    expect(container?.methods.master?.kdf).toMatchObject(KDF_CREDENTIAL);
    expect(container?.methods.recovery?.kdf).toMatchObject(KDF_CREDENTIAL);
    expect(container?.methods.pin?.kdf).not.toEqual(container?.methods.master?.kdf);

    // o contador de senha mestra e o limite de autodestruição nascem zerados:
    // um cofre novo que já contasse tentativa destruiria o dado do usuário
    expect(panicStatus()).toMatchObject({ nukeLimit: 0, attemptsMaster: 0, hasPanicPin: false });
  });

  it('2. recusa recriar um cofre existente', async () => {
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.vaultExists);
  });

  it('3. valida formato da senha mestra, do PIN e da frase de recuperação', async () => {
    lock();
    resetAttempts();
    const short = await createVault({
      masterPassword: 'curta',
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(short.ok).toBe(false);
    expect(short.error).toBe(currentMessages().errors.invalidMasterLength);

    const badPin = await createVault({
      masterPassword: MASTER,
      pin: '123',
      recoveryPhrase: PHRASE,
    });
    expect(badPin.ok).toBe(false);
    expect(badPin.error).toBe(currentMessages().errors.invalidPin);

    const shortPhrase = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: 'apenas onze palavras aqui nao satisfaz o minimo',
    });
    expect(shortPhrase.ok).toBe(false);
    expect(shortPhrase.error).toBe(currentMessages().errors.invalidRecovery);
  });

  it('3b. recusa credencial previsível na criação (só o degenerado é bloqueado)', async () => {
    const trivialPin = await createVault({
      masterPassword: MASTER,
      pin: '12345678',
      recoveryPhrase: PHRASE,
    });
    expect(trivialPin.ok).toBe(false);
    expect(trivialPin.error).toBe(currentMessages().errors.trivialPin);

    const trivialMaster = await createVault({
      masterPassword: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(trivialMaster.ok).toBe(false);
    expect(trivialMaster.error).toBe(currentMessages().errors.trivialMaster);

    const trivialPhrase = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: 'casa '.repeat(12),
    });
    expect(trivialPhrase.ok).toBe(false);
    expect(trivialPhrase.error).toBe(currentMessages().errors.trivialPhrase);
  });

  it('4. falha com PIN errado, trava por 10 s e depois aceita o PIN certo', async () => {
    lock();
    resetAttempts();

    const failed = await unlock({ credential: '00000000', kind: 'pin' });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe(currentMessages().errors.wrongPin);
    expect(failed.status.attempts).toBe(1);
    expect(failed.status.locked).toBe(true);

    const blocked = await unlock({ credential: PIN, kind: 'pin' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain('Muitas tentativas');

    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow + 11_000);
    const unlocked = await unlock({ credential: PIN, kind: 'pin' });
    expect(unlocked.ok).toBe(true);
    expect(unlocked.status).toMatchObject({ locked: false, attempts: 0 });
    vi.useRealTimers();
  });

  it('5. gerencia credenciais: cria, atualiza, lista e remove', () => {
    expect(getStatus().locked).toBe(false);

    const created = saveEntry({
      title: 'GitHub',
      username: 'otaku-delirante',
      password: 's3nh@-forte',
      domain: 'GitHub.com',
      notes: 'conta pessoal',
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'GitHub',
      username: 'otaku-delirante',
      domain: 'github.com',
      notes: 'conta pessoal',
    });
    const id = created[0]?.id ?? '';
    const createdAt = created[0]?.createdAt ?? 0;
    expect(id).not.toBe('');

    const updated = saveEntry({
      id,
      title: 'GitHub Pessoal',
      username: 'otaku',
      password: 'outra-senha',
      domain: 'github.com',
      notes: '',
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id, title: 'GitHub Pessoal', createdAt });

    expect(listEntries().some((entry) => entry.id === id)).toBe(true);

    const removed = removeEntry(id);
    expect(removed).toHaveLength(0);
    expect(listEntries()).toHaveLength(0);
  });

  it('6. rejeita entrada inválida e operação com cofre bloqueado', () => {
    expect(() =>
      saveEntry({ title: '  ', username: '', password: '', domain: '', notes: '' }),
    ).toThrow(currentMessages().errors.invalidTitle);
    expect(() =>
      saveEntry({ title: 'X', username: 'com espaço', password: '', domain: '', notes: '' }),
    ).toThrow(currentMessages().errors.invalidUsername);
    expect(() =>
      saveEntry({ title: 'X', username: '', password: '', domain: 'não é domínio', notes: '' }),
    ).toThrow(currentMessages().errors.invalidDomain);
    expect(() => removeEntry('id-falso')).toThrow(currentMessages().errors.invalidId);
    expect(() => removeEntry('../../vault.zkv')).toThrow(currentMessages().errors.invalidId);

    lock();
    expect(isUnlocked()).toBe(false);
    expect(() => listEntries()).toThrow(currentMessages().errors.vaultLocked);
  });

  it('7. desbloqueia com a senha mestra', async () => {
    const withMaster = await unlock({ credential: MASTER, kind: 'master' });
    expect(withMaster.ok).toBe(true);
  });

  it('8. redefine o PIN pela frase de recuperação (único uso da frase)', async () => {
    lock();
    resetAttempts();

    const badPin = await resetPin({ phrase: PHRASE, newPin: '123' });
    expect(badPin.ok).toBe(false);
    expect(badPin.error).toBe(currentMessages().errors.invalidPin);

    // PIN degenerado não conta tentativa: recusa antes de mexer na frase
    const trivialPin = await resetPin({ phrase: PHRASE, newPin: '87654321' });
    expect(trivialPin.ok).toBe(false);
    expect(trivialPin.error).toBe(currentMessages().errors.trivialPin);
    expect(trivialPin.status.attempts).toBe(0);

    const wrongPhrase = await resetPin({ phrase: WRONG_PHRASE, newPin: NEW_PIN });
    expect(wrongPhrase.ok).toBe(false);
    expect(wrongPhrase.error).toBe(currentMessages().errors.wrongRecovery);
    expect(wrongPhrase.status.attempts).toBe(1);

    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow + 11_000);

    const reset = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(reset.ok).toBe(true);
    expect(reset.status).toMatchObject({ locked: false, attempts: 0 });

    lock();
    const oldPin = await unlock({ credential: PIN, kind: 'pin' });
    expect(oldPin.ok).toBe(false);
    expect(oldPin.error).toBe(currentMessages().errors.wrongPin);

    vi.setSystemTime(realNow + 22_000);
    const newPin = await unlock({ credential: NEW_PIN, kind: 'pin' });
    expect(newPin.ok).toBe(true);
    vi.useRealTimers();
    // resetPin faz derive + dois embrulhos Argon2id: sob carga o teto global não basta
  }, 120_000);

  it('9. detecta arquivo injetado ou removido de fora do app (manifesto)', () => {
    expect(getStatus().locked).toBe(false);
    const tampered = currentMessages().errors.vaultTampered;
    const entriesDir = path.join(process.env.GUARDINHA_VAULT_DIR ?? '', '.entries');

    const created = saveEntry({
      title: 'Site',
      username: 'user',
      password: 'pass',
      domain: 'example.com',
      notes: '',
    });
    const id = created[0]?.id ?? '';
    expect(id).not.toBe('');

    // arquivo injetado fora do app → manifesto não conhece
    const stray = path.join(entriesDir, 'ffffffff-ffff-4fff-8fff-ffffffffffff.zke');
    fs.writeFileSync(stray, Buffer.alloc(64));
    expect(() => listEntries()).toThrow(tampered);
    fs.rmSync(stray);

    // de volta ao normal depois de remover o intruso
    expect(listEntries()).toHaveLength(1);

    // remoção externa do arquivo da credencial → manifesto acusa
    fs.rmSync(path.join(entriesDir, `${id}.zke`));
    expect(() => listEntries()).toThrow(tampered);
  });

  it('10. sobe o custo do Argon2id no desbloqueio seguinte (migração do cofre)', async () => {
    resetAttempts();
    const vaultKey = requireSessionKey();

    // simula um cofre gravado com o custo antigo (64 MiB, t=3, p=4)
    const oldKdf: VaultKdfParams = {
      algo: 'argon2id',
      memoryKiB: 65_536,
      iterations: 3,
      parallelism: 4,
    };
    const kdfSalt = randomBytes(16);
    const derived = await deriveKey(PIN, kdfSalt, oldKdf);
    const payload = encryptRecord({ key: vaultKey.toString('hex') }, derived);

    const container = readVaultContainer();
    if (container === null) throw new Error('container sumiu');
    container.methods.pin = { kdf: oldKdf, kdfSalt: kdfSalt.toString('hex'), payload };
    writeVaultContainer(container);
    expect(readVaultContainer()?.methods.pin?.kdf).toMatchObject(oldKdf);

    const unlocked = await unlock({ credential: PIN, kind: 'pin' });
    expect(unlocked.ok).toBe(true);
    expect(readVaultContainer()?.methods.pin?.kdf).toMatchObject(KDF_PIN);
    // os outros métodos só sobem quando a própria credencial for usada
    expect(readVaultContainer()?.methods.master?.kdf).toMatchObject(KDF_CREDENTIAL);
  });

  it('11. cofre de outra versão recusa com mensagem que explica o caso', async () => {
    // O formato do container é de uma versão só. Um cofre gravado por outra
    // versão está inteiro e cifrado, então a tela precisa dizer isso: dizer
    // "alterado fora do app" faz o usuário achar que perdeu os dados.
    const containerFile = path.join(process.env.GUARDINHA_VAULT_DIR ?? '', 'vault.zkv');
    const before = fs.readFileSync(containerFile);

    const older = Buffer.from(before);
    older.writeUInt32BE(4, 8);
    fs.writeFileSync(containerFile, older);

    const result = await unlock({ credential: PIN, kind: 'pin' });
    expect(result.ok).toBe(false);
    const message = result.ok ? '' : (result.error ?? '');
    expect(message).toContain('Guardinha');
    // o dado central: o usuário precisa saber que nada foi perdido
    expect(message).toMatch(/nada foi perdido|Nada foi perdido/);
    // e que a senha digitada não tem nada a ver com a recusa
    expect(message).not.toBe(currentMessages().errors.wrongPin);
    expect(message).not.toBe(currentMessages().errors.vaultTampered);
    // recusa é resposta de negócio: nada de exceção subindo pelo handler do IPC
    expect(message).toContain('v4');

    fs.writeFileSync(containerFile, before);
    expect((await unlock({ credential: PIN, kind: 'pin' })).ok).toBe(true);
  }, 120_000);
});

/**
 * Cryptographic Erase da chave de trabalho. São três `fill(0)` em `vault.ts`
 * (desbloqueio de pânico, definição do PIN de pânico e redefinição por frase) e
 * nenhum deles tinha teste: a suíte conferia o resultado da chamada, que é o
 * mesmo com a chave zerada ou com `0x01` no lugar. O Buffer derivado é capturado
 * por referência, então continua observável depois do `finally`.
 */
describe('apaga a chave derivada de trabalho', () => {
  it('no desbloqueio pelo PIN de pânico', async () => {
    await garanteDesbloqueado();
    await setPanicPin({ pin: '74185236' });
    resetAttempts();

    // PIN que não é o de pânico nem o real: o caminho de pânico deriva, falha
    // ao desembrulhar e devolve o controle. O cofre de teste fica intacto, e o
    // `finally` do `tryPanicUnlock` é o que se quer exercitar aqui.
    const derivadas = capturarDerivadas('panic');
    const result = await unlock({ credential: '15975300', kind: 'pin' });
    clearPanicPin();

    expect(result.ok).toBe(false);
    expect(getStatus().exists).toBe(true);
    expect(derivadas.length).toBeGreaterThan(0);
    for (const buffer of derivadas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  }, 120_000);

  it('ao definir o PIN de pânico, no caminho em que o PIN é recusado', async () => {
    await garanteDesbloqueado();
    const derivadas = capturarDerivadas('pin');
    // o PIN real passa a ser o PIN de pânico, que `setPanicPin` recusa
    await setPanicPin({ pin: PIN });

    expect(derivadas.length).toBeGreaterThan(0);
    for (const buffer of derivadas) expect(buffer.every((byte) => byte === 0)).toBe(true);
    clearPanicPin();
  }, 120_000);

  it('na redefinição do PIN pela frase de recuperação', async () => {
    await garanteDesbloqueado();
    resetAttempts();
    const derivadas = capturarDerivadas('recovery');
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow + 11_000);
    try {
      await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    } finally {
      vi.useRealTimers();
    }

    expect(derivadas.length).toBeGreaterThan(0);
    for (const buffer of derivadas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  }, 120_000);
});

/**
 * O limite estrito é só da senha mestra. A frase de recuperação é o caminho que
 * redesenha o PIN depois de uma coação, então ela não pode virar atalho para
 * apagar o cofre: uma frase errada soma em `attempts`, e não em `attemptsMaster`.
 */
describe('a frase de recuperação não arma a autodestruição', () => {
  it('conta tentativa comum, nunca a estrita', async () => {
    await garanteDesbloqueado();
    lock();
    resetAttempts();
    const antes = panicStatus();

    const result = await resetPin({ phrase: WRONG_PHRASE, newPin: NEW_PIN });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.wrongRecovery);
    // o contador estrito é o que decide a destruição: não pode ter se movido
    expect(panicStatus().attemptsMaster).toBe(antes.attemptsMaster);
    expect(result.status.attempts).toBeGreaterThan(0);
  }, 120_000);

  it('a resposta de recusa diz que o cofre existe e continua travado', async () => {
    await garanteDesbloqueado();
    lock();
    resetAttempts();
    const result = await resetPin({ phrase: WRONG_PHRASE, newPin: NEW_PIN });
    expect(result.ok).toBe(false);
    expect(result.status).toMatchObject({ exists: true, locked: true });
  }, 120_000);
});

/**
 * O PIN de pânico não pode ser o PIN de verdade: um PIN que abre o cofre e o
 * destrói não serve nem como cofre nem como proteção.
 */
describe('o PIN de pânico recusa ser o PIN real', () => {
  it('recusa, não instala e não deixa caminho de pânico', async () => {
    // o teste anterior falhou de propósito e deixou trava exponencial
    await garanteDesbloqueado();
    clearPanicPin();
    expect(hasPanicPin()).toBe(false);

    // descobre qual é o PIN de verdade: o mesmo teste 8 pode ter trocado o PIN
    const candidatos = [NEW_PIN, PIN];
    let real: string | null = null;
    for (const candidato of candidatos) {
      const tentativa = await setPanicPin({ pin: candidato });
      if (!tentativa.ok && tentativa.error === currentMessages().errors.panicPinSame) {
        real = candidato;
        break;
      }
      clearPanicPin();
    }
    expect(real).not.toBeNull();

    if (real === null) throw new Error('nenhum PIN candidato era o do cofre');
    const result = await setPanicPin({ pin: real });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.panicPinSame);
    expect(hasPanicPin()).toBe(false);
    clearPanicPin();
  }, 120_000);
});

/**
 * O arquivo é stateful e o teste 8 redefine o PIN, então `PIN` deixa de abrir o
 * cofre a partir dali. O helper tenta o PIN atual e o anterior, sem pagar
 * Argon2id duas vezes: só cai no segundo quando o primeiro é recusado.
 */
async function garanteDesbloqueado(): Promise<void> {
  if (isUnlocked()) return;
  resetAttempts();
  const porCurrent = await unlock({ credential: NEW_PIN, kind: 'pin' });
  if (!porCurrent.ok) {
    resetAttempts();
    await unlock({ credential: PIN, kind: 'pin' });
  }
}

/** Espiona o desembrulhador e devolve os Buffers que ele devolveu. */
function capturarDerivadas(kind: 'pin' | 'recovery' | 'panic'): Buffer[] {
  const alvo = keyUnwrapperFor(kind);
  const original = alvo.derive.bind(alvo);
  const derivadas: Buffer[] = [];
  vi.spyOn(alvo, 'derive').mockImplementation(async (method, credential) => {
    const buffer = await original(method, credential);
    derivadas.push(buffer);
    return buffer;
  });
  return derivadas;
}

/** Faz a derivação do método recusar, como o Argon2id faria com custo absurdo. */
function derivacaoFalha(kind: 'pin' | 'recovery' | 'panic'): void {
  vi.spyOn(keyUnwrapperFor(kind), 'derive').mockRejectedValue(new Error('derivação falhou'));
}

/**
 * A trava exponencial vale antes de qualquer coisa, inclusive quando falta um
 * milissegundo para ela acabar. Com a comparação frouxa, uma redefinição que
 * espere o último instante passaria direto pela trava.
 */
describe('a trava de redefinição de PIN é estrita', () => {
  it('bloqueia a redefinição com 1 ms de espera restante', async () => {
    await garanteDesbloqueado();
    lock();
    resetAttempts();
    const realNow = Date.now();

    const falhou = await resetPin({ phrase: WRONG_PHRASE, newPin: NEW_PIN });
    expect(falhou.ok).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(realNow + 10_000 - 1);
    try {
      const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Muitas tentativas');
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});

/**
 * O `?.` do `finally` é o que deixa a limpeza da chave de trabalho sobreviver a
 * uma derivação que já falhou: sem ele, um `TypeError` em `null.fill(0)`
 * substitui a resposta de "credencial errada" e derruba a tela de autenticação
 * com uma exceção que ninguém entende.
 */
describe('falha de derivação não vira exceção', () => {
  it('no desbloqueio com PIN de pânico instalado', async () => {
    await garanteDesbloqueado();
    await setPanicPin({ pin: '74185236' });
    resetAttempts();
    derivacaoFalha('panic');

    let recusa: unknown;
    try {
      recusa = await unlock({ credential: '15975300', kind: 'pin' });
    } finally {
      vi.restoreAllMocks();
      clearPanicPin();
    }

    expect(recusa).toMatchObject({ ok: false });
    expect(getStatus().exists).toBe(true);
  }, 120_000);

  it('ao recusar o PIN de pânico porque é o PIN do cofre', async () => {
    await garanteDesbloqueado();
    derivacaoFalha('pin');

    let instalacao: unknown;
    try {
      instalacao = await setPanicPin({ pin: PIN });
    } finally {
      vi.restoreAllMocks();
      clearPanicPin();
    }

    // a derivação recusou, então o PIN não é o do cofre: ele instala
    expect(instalacao).toMatchObject({ ok: true });
    expect(hasPanicPin()).toBe(false);
  }, 120_000);
});

/**
 * Sem cofre no disco, os dois pontos que leem o container devolvem "não há PIN
 * de pânico" em vez de estourar. É o estado logo depois do Cryptographic Erase,
 * que é quando o usuário ainda está na tela de autenticação.
 */
describe('estado sem cofre na tela', () => {
  it('hasPanicPin e panicStatus respondem sem container', () => {
    const leitura = vi.spyOn(vaultStorage, 'readContainer').mockReturnValue(null);
    try {
      expect(hasPanicPin()).toBe(false);
      expect(panicStatus()).toEqual({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    } finally {
      leitura.mockRestore();
    }
  });

  it('clearPanicPin devolve o status sem container, em vez de lançar', () => {
    const leitura = vi.spyOn(vaultStorage, 'readContainer').mockReturnValue(null);
    try {
      // não há container para apagar caminho de pânico, e a resposta é o status
      // de sempre: sem `if (container !== null)`, o `delete` derrubaria a tela
      expect(() => clearPanicPin()).not.toThrow();
      expect(clearPanicPin()).toMatchObject({ exists: true });
    } finally {
      leitura.mockRestore();
    }
  });
});

/**
 * A subida do custo do Argon2id só vale quando o método gravado está mais fraco
 * que o perfil atual. Um método já atual não pode ser reembrulhado: o salt novo
 * invalidaria o embrulho à toa (e gastaria Argon2id sem motivo).
 */
describe('o reembrulho do método é só quando o custo está defasado', () => {
  it('desbloquear não troca o salt de um método já no custo atual', async () => {
    resetAttempts();
    const saltAntes = readVaultContainer()?.methods.master?.kdfSalt;
    expect(saltAntes).toBeDefined();

    const result = await unlock({ credential: MASTER, kind: 'master' });

    expect(result.ok).toBe(true);
    expect(readVaultContainer()?.methods.master?.kdfSalt).toBe(saltAntes);
  }, 120_000);
});

/**
 * A trava de redefinição é estrita no último milissegundo. A espera restante é
 * um inteiro de milissegundos, então `> 0` e `> 1` só divergem em `1`: aqui ela
 * tem que bloquear, e o mutante que afrouxa a comparação deixa passar.
 */
describe('a trava de redefinição de PIN bloqueia no último milissegundo', () => {
  it('recusa com 1 ms de espera restante, em vez de abrir a redefinição', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    writeAuthState({ attempts: 1, lockUntil: 2_000_001, attemptsMaster: 0, nukeLimit: 0 });
    try {
      const result = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Muitas tentativas');
    } finally {
      vi.useRealTimers();
      resetAttempts();
    }
  }, 120_000);
});

/**
 * A frase de recuperação tem um mínimo de palavras conferido **antes** do
 * Argon2id. A checagem usa `split(' ')`; com `split('')`, uma palavra longa
 * passaria como se tivesse palavras suficientes e pagaria a derivação à toa.
 */
describe('frase de recuperação curta não paga Argon2id', () => {
  it('recusa antes de derivar quando a frase não tem o mínimo de palavras', async () => {
    resetAttempts();
    // uma palavra de 14 caracteres: `split(' ')` conta 1 e recusa; `split('')`
    // contaria 14 e passaria pela checagem de mínimo
    const derive = vi.spyOn(keyUnwrapperFor('recovery'), 'derive');
    try {
      const result = await resetPin({ phrase: 'palavracomprida', newPin: NEW_PIN });

      expect(result.ok).toBe(false);
      expect(result.error).toBe(currentMessages().errors.wrongRecovery);
      expect(derive).not.toHaveBeenCalled();
    } finally {
      derive.mockRestore();
      resetAttempts();
    }
  }, 120_000);
});
