// @vitest-environment node
import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { resetAttempts } from '@zero/main/auth';
import { encryptAuthRecord, encryptRecord, randomBytes } from '@zero/main/crypto';
import { VAULT_HEADER_BYTES } from '@zero/main/container-format';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';
import { writeAuthPayload } from '@zero/main/auth-store';
import { writeEntryPayload } from '@zero/main/entries-store';
import { vaultStorage } from '@zero/main/facade';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { readVaultContainer, verifyManifest } from '@zero/main/storage';
import { vaultSession } from '@zero/main/session';
import { unlock } from '@zero/main/vault';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { runUnlockChain, type UnlockContext } from '@zero/main/unlock';
import { containerBytes, pack, resetVaultDir, seedVault, unpack } from './helpers.js';
import type { UnlockInput, VaultResult } from '@zero/types';

const MASTER = 'senha-mestra-guardinha24';
const WRONG_MASTER = 'senha-mestra-errada-0000';
const PIN = '49201733';
const PANIC_PIN = '73910456';
const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';

/** Ataques ao desbloqueio e à integridade do container, com Argon2id de custo mínimo. */

afterAll(() => {
  resetVaultDir();
});

async function attempt(
  container: VaultContainerData,
  credential: string,
  kind: UnlockInput['kind'],
): Promise<{ result: VaultResult | null; context: UnlockContext }> {
  const context: UnlockContext = { input: { credential, kind }, container };
  const result = await runUnlockChain(context);
  return { result, context };
}

/** Adultera um campo em hex com XOR `0xFF`: prefixar `'00'` falharia quando o byte já é zero. */
function tamperHex(hex: string): string {
  const first = (Number.parseInt(hex.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
  return `${first}${hex.slice(2)}`;
}

function masterOf(container: VaultContainerData): WrappedMethod {
  const method = container.methods.master;
  if (method === undefined) throw new Error('o fixture não gravou o método master');
  return method;
}

describe('desbloqueio: quem entra e quem fica de fora', () => {
  it('libera a chave com a credencial certa, em cada método', async () => {
    for (const [kind, credential] of [
      ['master', MASTER],
      ['pin', PIN],
    ] as const) {
      const vaultKey = randomBytes(32);
      const container = await seedVault({ vaultKey, credentials: { [kind]: credential } });

      const { result, context } = await attempt(container, credential, kind);

      expect(result).toBeNull();
      expect(context.vaultKey?.equals(vaultKey)).toBe(true);
      context.vaultKey?.fill(0);
      vaultKey.fill(0);
    }
  });

  it('credencial errada não libera chave, não muda o embrulho e não ecoa o segredo', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({ vaultKey, credentials: { master: MASTER } });
    const before = structuredClone(container.methods);

    const { result, context } = await attempt(container, WRONG_MASTER, 'master');

    expect(result?.ok).toBe(false);
    expect(context.vaultKey).toBeUndefined();
    expect(result?.error).not.toContain(WRONG_MASTER);
    expect(result?.error).not.toContain(MASTER);
    // a falha só mexe em contadores; o embrulho da chave continua idêntico
    expect(readVaultContainer()?.methods).toEqual(before);
    vaultKey.fill(0);
  });

  it('`unlock` não adota chave nenhuma quando a credencial falha', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({ vaultKey, credentials: { master: MASTER } });
    vaultSession().wipe();

    const result = await unlock({ credential: WRONG_MASTER, kind: 'master' });

    expect(result.ok).toBe(false);
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isUnlocked()).toBe(false);
    vaultKey.fill(0);
  }, 120_000);

  it('o PIN de pânico apaga o cofre e abre a sessão decoy, sem guardar chave', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { pin: PIN, panic: PANIC_PIN },
      entryIds: [ENTRY_ID],
    });
    vaultSession().wipe();

    const result = await unlock({ credential: PANIC_PIN, kind: 'pin' });

    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({ exists: true, locked: false });
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isDecoy()).toBe(true);
    expect(fs.existsSync(`${entriesDir()}/${ENTRY_ID}.zke`)).toBe(false);
    vaultKey.fill(0);
  }, 120_000);

  it('copiar o blob do PIN para o slot de pânico não transforma o PIN em gatilho', async () => {
    // P9: blob de PIN no slot de pânico falha ao decifrar e o login segue pelo slot original.
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { pin: PIN },
      entryIds: [ENTRY_ID],
    });
    const pinMethod = container.methods.pin;
    if (pinMethod === undefined) throw new Error('o fixture não gravou o método pin');
    container.methods.panic = pinMethod;
    vaultStorage.writeContainer(container);
    vaultSession().wipe();

    const result = await unlock({ credential: PIN, kind: 'pin' });

    expect(result.ok).toBe(true);
    expect(vaultSession().isUnlocked()).toBe(true);
    expect(vaultSession().isDecoy()).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
    vaultKey.fill(0);
  }, 120_000);

  it('copiar o blob do pânico para o slot do PIN não transforma a coação em login', async () => {
    // P9 pelo outro lado: sem a identidade do método, o blob de pânico abriria o cofre real.
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { pin: PIN, panic: PANIC_PIN },
      entryIds: [ENTRY_ID],
    });
    const panicMethod = container.methods.panic;
    if (panicMethod === undefined) throw new Error('o fixture não gravou o método panic');
    container.methods.pin = panicMethod;
    delete container.methods.panic;
    vaultStorage.writeContainer(container);
    vaultSession().wipe();

    const result = await unlock({ credential: PANIC_PIN, kind: 'pin' });

    expect(result.ok).toBe(false);
    expect(vaultSession().isUnlocked()).toBe(false);
    expect(vaultSession().isDecoy()).toBe(false);
    expect(fs.existsSync(containerFile())).toBe(true);
    vaultKey.fill(0);
  }, 120_000);
});

describe('rebaixamento do KDF e adulteração do container', () => {
  it('recusa um custo de Argon2id fora da faixa na leitura do disco', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({ vaultKey, credentials: { master: MASTER } });
    const raw = containerBytes();
    // primeiro método do arquivo: memória, iterações, paralelismo
    raw.writeUInt32BE(0, VAULT_HEADER_BYTES);

    expect(unpack(raw)).toEqual({ ok: false, reason: 'damaged' });
    vaultKey.fill(0);
  });

  it('recusa gravar um container com KDF abaixo do piso', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({ vaultKey, credentials: { master: MASTER } });
    const method = masterOf(container);
    method.kdf = { algo: 'argon2id', memoryKiB: 1_024, iterations: 1, parallelism: 1 };

    expect(() => pack(container)).toThrow();
    vaultKey.fill(0);
  });

  for (const field of ['kdfSalt', 'kdf', 'iv', 'tag', 'encryptedData'] as const) {
    it(`recusa ${field} alterado mesmo com a credencial certa`, async () => {
      const vaultKey = randomBytes(32);
      await seedVault({ vaultKey, credentials: { master: MASTER } });
      resetAttempts();
      const container = readVaultContainer();
      if (container === null) throw new Error('o cofre semeado sumiu');
      const method = masterOf(container);
      if (field === 'kdfSalt') {
        method.kdfSalt = tamperHex(method.kdfSalt);
      } else if (field === 'kdf') {
        method.kdf = { ...method.kdf, iterations: method.kdf.iterations + 1 };
      } else {
        method.payload[field] = tamperHex(method.payload[field]);
      }

      const { result, context } = await attempt(container, MASTER, 'master');

      expect(result?.ok).toBe(false);
      expect(context.vaultKey).toBeUndefined();
      vaultKey.fill(0);
    });
  }
});

describe('formato e trava antes do custo do Argon2id', () => {
  it('PIN digitado no campo da senha mestra não chega ao KDF', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER, pin: PIN },
    });
    resetAttempts();
    const derive = vi.spyOn(keyUnwrapperFor('master'), 'derive');

    const { result } = await attempt(container, PIN, 'master');

    expect(result?.ok).toBe(false);
    expect(derive).not.toHaveBeenCalled();
    vaultKey.fill(0);
  });

  it('senha mestra digitada no campo do PIN não chega ao KDF', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER, pin: PIN },
    });
    resetAttempts();
    const derive = vi.spyOn(keyUnwrapperFor('pin'), 'derive');

    const { result } = await attempt(container, MASTER, 'pin');

    expect(result?.ok).toBe(false);
    expect(derive).not.toHaveBeenCalled();
    vaultKey.fill(0);
  });

  it('uma trava legítima continua barrando o desbloqueio', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      lockUntil: Date.now() + 10_000,
    });

    const { result, context } = await attempt(container, MASTER, 'master');

    expect(result?.ok).toBe(false);
    expect(context.vaultKey).toBeUndefined();
    expect(result?.status.lockRemainingMs).toBeGreaterThan(0);
    vaultKey.fill(0);
  });

  it('um lockUntil absurdo é tratado como vencido, não como prisão perpétua', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      lockUntil: Number.MAX_SAFE_INTEGER,
    });

    const { result, context } = await attempt(container, MASTER, 'master');

    expect(result).toBeNull();
    expect(context.vaultKey?.equals(vaultKey)).toBe(true);
    context.vaultKey?.fill(0);
    vaultKey.fill(0);
  });
});

describe('manifesto: arquivo injetado ou removido derruba a listagem', () => {
  it('aceita o conjunto que ele mesmo selou', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
      authIds: [AUTH_ID],
    });

    expect(() => verifyManifest(vaultKey)).not.toThrow();
    vaultKey.fill(0);
  });

  it('detecta uma credencial injetada no diretório', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({ vaultKey, credentials: { master: MASTER } });

    writeEntryPayload(
      '33333333-3333-4333-8333-333333333333',
      encryptRecord({ invasor: true }, vaultKey),
    );

    expect(() => verifyManifest(vaultKey)).toThrow();
    vaultKey.fill(0);
  });

  it('detecta a remoção de uma credencial', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });

    fs.rmSync(`${entriesDir()}/${ENTRY_ID}.zke`);

    expect(() => verifyManifest(vaultKey)).toThrow();
    vaultKey.fill(0);
  });

  it('copiar o arquivo de A sobre o de B é detectado pelo hash do manifesto', async () => {
    // P6: copiar `.zke` de A sobre B mantém os ids, então só o hash gravado denuncia a troca.
    const vaultKey = randomBytes(32);
    const idA = '55555555-5555-4555-8555-555555555555';
    const idB = '66666666-6666-4666-8666-666666666666';
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [idA, idB],
    });
    const credential = (id: string, title: string): Record<string, unknown> => ({
      id,
      title,
      username: 'alice',
      password: 'segredo',
      domain: '',
      notes: '',
      createdAt: 1,
      updatedAt: 1,
    });
    writeEntryPayload(idA, encryptRecord(credential(idA, 'A'), vaultKey));
    writeEntryPayload(idB, encryptRecord(credential(idB, 'B'), vaultKey));

    fs.copyFileSync(`${entriesDir()}/${idA}.zke`, `${entriesDir()}/${idB}.zke`);

    expect(() => verifyManifest(vaultKey)).toThrow();
    // e o caminho de leitura continua barrando o conteúdo trocado
    expect(() => vaultStorage.readRecord(idB, vaultKey)).toThrow();
    vaultKey.fill(0);
  });

  it('copiar o arquivo de 2FA de A sobre o de B é detectado pelo hash do manifesto', async () => {
    // P6 nos tokens: a troca mantém os ids e só o SHA-256 do manifesto separa o conteúdo alheio.
    const vaultKey = randomBytes(32);
    const idA = '77777777-7777-4777-8777-777777777777';
    const idB = '88888888-8888-4888-8888-888888888888';
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      authIds: [idA, idB],
    });

    fs.copyFileSync(`${authDir()}/${idA}.zka`, `${authDir()}/${idB}.zka`);

    expect(() => verifyManifest(vaultKey)).toThrow();
    vaultKey.fill(0);
  });

  it('detecta um token de 2FA injetado ou removido', async () => {
    const vaultKey = randomBytes(32);
    await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      authIds: [AUTH_ID],
    });

    writeAuthPayload(
      '44444444-4444-4444-8444-444444444444',
      encryptAuthRecord({ invasor: true }, vaultKey),
    );
    expect(() => verifyManifest(vaultKey)).toThrow();
    fs.rmSync(`${authDir()}/44444444-4444-4444-8444-444444444444.zka`);

    // com o intruso fora, o conjunto volta a fechar; então some o original
    expect(() => verifyManifest(vaultKey)).not.toThrow();
    fs.rmSync(`${authDir()}/${AUTH_ID}.zka`);
    expect(() => verifyManifest(vaultKey)).toThrow();
    vaultKey.fill(0);
  });

  it('recusa o manifesto com a chave errada ou com um byte alterado', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      entryIds: [ENTRY_ID],
    });

    expect(() => verifyManifest(randomBytes(32))).toThrow();
    if (container.manifest === null) throw new Error('o fixture não selou o manifesto');
    container.manifest.tag = tamperHex(container.manifest.tag);
    vaultStorage.writeContainer(container);
    expect(() => verifyManifest(vaultKey)).toThrow();
    vaultKey.fill(0);
  });
});

describe('nenhum segredo em claro no disco', () => {
  it('o container e os arquivos individuais só têm bytes cifrados', async () => {
    const vaultKey = randomBytes(32);
    const recovery = 'frase-de-recuperacao-do-teste-com-doze-palavras';
    await seedVault({
      vaultKey,
      credentials: { master: MASTER, pin: PIN, recovery },
      entryIds: [ENTRY_ID],
      authIds: [AUTH_ID],
    });

    const password = 'senha-super-secreta-do-teste';
    const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const now = Date.now();
    vaultStorage.writeRecord(
      {
        id: ENTRY_ID,
        title: 'Titulo Confidencial',
        username: 'usuario-confidencial',
        password,
        domain: 'banco.teste',
        notes: 'anotacao-confidencial',
        createdAt: now,
        updatedAt: now,
      },
      vaultKey,
    );
    vaultStorage.writeAuthSecret(
      {
        id: AUTH_ID,
        issuer: 'Servico Confidencial',
        account: 'conta-confidencial',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: totpSecret,
        createdAt: now,
        updatedAt: now,
      },
      vaultKey,
    );

    const files = [
      containerBytes(),
      fs.readFileSync(`${entriesDir()}/${ENTRY_ID}.zke`),
      fs.readFileSync(`${authDir()}/${AUTH_ID}.zka`),
    ];
    for (const raw of files) {
      for (const secret of [
        MASTER,
        PIN,
        recovery,
        password,
        totpSecret,
        'Titulo Confidencial',
        'usuario-confidencial',
        'anotacao-confidencial',
        'Servico Confidencial',
        'conta-confidencial',
      ]) {
        expect(raw.includes(Buffer.from(secret, 'utf8'))).toBe(false);
      }
      expect(raw.includes(vaultKey)).toBe(false);
      expect(raw.includes(Buffer.from(vaultKey.toString('hex'), 'utf8'))).toBe(false);
      expect(raw.includes(Buffer.from(vaultKey.toString('base64'), 'utf8'))).toBe(false);
    }
    vaultKey.fill(0);
  });
});

describe('contadores de falha', () => {
  it('uma tentativa errada soma exatamente uma, sem criar chave', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      attempts: 4,
    });

    await attempt(container, WRONG_MASTER, 'master');

    const state = readVaultContainer();
    expect(state?.attempts).toBe(5);
    expect(state?.attemptsMaster).toBe(1);
    vaultKey.fill(0);
  });

  it('não soma tentativa quando a trava já está ativa', async () => {
    const vaultKey = randomBytes(32);
    const container = await seedVault({
      vaultKey,
      credentials: { master: MASTER },
      lockUntil: Date.now() + 10_000,
      attempts: 3,
    });

    const { result } = await attempt(container, WRONG_MASTER, 'master');

    expect(result?.ok).toBe(false);
    // quem espera não paga tentativa nova: o contador fica onde estava
    expect(readVaultContainer()?.attempts).toBe(3);
    vaultKey.fill(0);
  });

  it('duas tentativas concorrentes não rodam a derivação ao mesmo tempo', async () => {
    // H3: sem a fila, as duas chamadas leem o mesmo container e uma gravação descarta a outra.
    const vaultKey = randomBytes(32);
    await seedVault({ vaultKey, credentials: { pin: PIN } });
    vaultSession().wipe();
    resetAttempts();

    const alvo = keyUnwrapperFor('pin');
    const original = alvo.derive.bind(alvo);
    let ativos = 0;
    let pico = 0;
    const spy = vi.spyOn(alvo, 'derive').mockImplementation(async (method, credential) => {
      ativos += 1;
      pico = Math.max(pico, ativos);
      try {
        return await original(method, credential);
      } finally {
        ativos -= 1;
      }
    });

    try {
      const [primeira, segunda] = await Promise.all([
        unlock({ credential: '00000000', kind: 'pin' }),
        unlock({ credential: '00000001', kind: 'pin' }),
      ]);
      expect(primeira.ok).toBe(false);
      expect(segunda.ok).toBe(false);
    } finally {
      spy.mockRestore();
      vaultKey.fill(0);
    }

    expect(pico).toBe(1);
    // A primeira falha arma a trava; a segunda, serializada, entra na espera sem gastar tentativa.
    const state = readVaultContainer();
    expect(state?.attempts).toBe(1);
    expect(state?.lockUntil).not.toBeNull();
  }, 120_000);
});
