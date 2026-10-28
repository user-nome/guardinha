// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FLAG_PANIC } from '@zero/main/container-format';
import {
  openManifest,
  packEntryPayload,
  packVaultContainer,
  sealManifest,
  unpackEntryPayload,
  unpackVaultContainer,
} from '@zero/main/container';
import { encryptRecord, randomBytes } from '@zero/main/crypto';
import type { VaultContainerData, VaultUnpackResult, WrappedMethod } from '@zero/main/container';

/**
 * Formato do container. A v6 é a única que o app grava: cabeçalho de 41 bytes,
 * sem tripo global de KDF (cada método carrega o custo do seu Argon2id) e papel
 * autenticado por método. A v5 é lida só para migrar: mesmo layout, mas com o
 * embrulho antigo e o manifesto sem hashes. A leitura ramifica por versão em
 * dois pontos (container e manifesto) e recusa qualquer outra.
 */

const HEADER_BYTES = 41;
const METHOD_FLAGS = [0x01, 0x02, 0x04, FLAG_PANIC] as const;

const KDF_MASTER = { algo: 'argon2id', memoryKiB: 131_072, iterations: 3, parallelism: 4 } as const;
const KDF_PIN = { algo: 'argon2id', memoryKiB: 262_144, iterations: 4, parallelism: 4 } as const;

function sampleContainer(): VaultContainerData {
  return {
    version: 6,
    createdAt: 1_767_268_800_000,
    attempts: 2,
    lockUntil: 1_767_268_810_000,
    attemptsMaster: 1,
    nukeLimit: 0,
    methods: {
      master: {
        kdf: KDF_MASTER,
        kdfSalt: 'aa'.repeat(16),
        payload: {
          salt: 'bb'.repeat(16),
          iv: 'cc'.repeat(16),
          tag: 'dd'.repeat(16),
          encryptedData: 'ee11',
        },
      },
      pin: {
        kdf: KDF_PIN,
        kdfSalt: '11'.repeat(16),
        payload: {
          salt: '22'.repeat(16),
          iv: '33'.repeat(16),
          tag: '44'.repeat(16),
          encryptedData: '556677',
        },
      },
      panic: {
        kdf: KDF_PIN,
        kdfSalt: '5a'.repeat(16),
        payload: {
          salt: '6b'.repeat(16),
          iv: '7c'.repeat(16),
          tag: '8d'.repeat(16),
          encryptedData: '9e0f',
        },
      },
      recovery: {
        kdf: KDF_MASTER,
        kdfSalt: '1a'.repeat(16),
        payload: {
          salt: '2b'.repeat(16),
          iv: '3c'.repeat(16),
          tag: '4d'.repeat(16),
          encryptedData: '5e60',
        },
      },
    },
    manifest: {
      salt: 'ff'.repeat(16),
      iv: '00'.repeat(16),
      tag: '99'.repeat(16),
      encryptedData: 'ab',
    },
  };
}

/** Bytes que um método ocupa no container: KDF(12) + kdfSalt(16) + blob. */
function methodBytes(method: WrappedMethod): number {
  return 12 + 16 + 52 + Buffer.from(method.payload.encryptedData, 'hex').length;
}

/** Deslocamento do manifesto: cabeçalho + os quatro métodos, na ordem do formato. */
function manifestOffset(data: VaultContainerData): number {
  const { master, pin, recovery, panic } = data.methods;
  if (master === undefined || pin === undefined || recovery === undefined || panic === undefined) {
    throw new Error('fixture incompleta');
  }
  return (
    HEADER_BYTES +
    methodBytes(master) +
    methodBytes(pin) +
    methodBytes(recovery) +
    methodBytes(panic)
  );
}

/** Roundtrip: o resultado cru, com o motivo da recusa quando houver. */
function roundtrip(data: VaultContainerData): VaultUnpackResult {
  return unpackVaultContainer(packVaultContainer(data));
}

/** Os dados de um roundtrip que deu certo; falha o teste se não deu. */
function packed(data: VaultContainerData): VaultContainerData {
  const result = roundtrip(data);
  if (!result.ok) throw new Error(`esperava container válido, veio ${result.reason}`);
  return result.data;
}

/** Asserta a recusa e devolve o motivo, para o teste conferir qual foi. */
function refusal(buffer: Buffer): string {
  const result = unpackVaultContainer(buffer);
  if (result.ok) throw new Error('esperava recusa, veio container válido');
  return result.reason;
}

describe('container do cofre (vault.zkv)', () => {
  it('roundtrip preserva todos os campos', () => {
    const data = sampleContainer();
    const restored = roundtrip(data);
    expect(restored).toEqual({ ok: true, data });
  });

  it('roundtrip sem manifesto e com lockUntil nulo', () => {
    const data: VaultContainerData = { ...sampleContainer(), lockUntil: null, manifest: null };
    const restored = roundtrip(data);
    expect(restored).toEqual({ ok: true, data });
  });

  it('grava na versão 6, com cabeçalho de 41 bytes e o custo por método', () => {
    const data = sampleContainer();
    const master = data.methods.master;
    const pin = data.methods.pin;
    if (master === undefined || pin === undefined) throw new Error('fixture incompleta');

    const packed = packVaultContainer(data);
    expect(packed.readUInt32BE(8)).toBe(6);
    // o cabeçalho inteiro cabe em 41 bytes: não sobrou KDF global no meio
    expect(packed.readUInt32BE(20)).toBe(2); // attempts
    expect(packed.readUInt8(32)).toBe(0x1f); // as quatro flags de método + manifesto
    expect(packed.readUInt32BE(33)).toBe(1); // attemptsMaster
    expect(packed.readUInt32BE(37)).toBe(0); // nukeLimit desligado por padrão
    // e o primeiro bloco de método só começa depois dos 41 bytes
    expect(packed.readUInt32BE(HEADER_BYTES)).toBe(131_072); // master: 128 MiB
    expect(packed.readUInt32BE(HEADER_BYTES + 4)).toBe(3);
    const pinOffset =
      HEADER_BYTES + 12 + 16 + 52 + Buffer.from(master.payload.encryptedData, 'hex').length;
    expect(packed.readUInt32BE(pinOffset)).toBe(262_144); // pin: 256 MiB
    expect(packed.readUInt32BE(pinOffset + 4)).toBe(4);
    expect(pin.kdf.memoryKiB).toBe(262_144);
  });

  it('lê a v5 para migrar e grava a versão que o container declara', () => {
    // a v5 tem o mesmo layout; o que muda é o embrulho dos métodos e o
    // manifesto. A gravação incidental precisa preservar a versão lida, senão
    // uma tentativa de PIN promoveria o arquivo sem migrar nada.
    const legacy: VaultContainerData = { ...sampleContainer(), version: 5 };
    const bytes = packVaultContainer(legacy);
    expect(bytes.readUInt32BE(8)).toBe(5);
    expect(unpackVaultContainer(bytes)).toEqual({ ok: true, data: legacy });

    const current = sampleContainer();
    expect(unpackVaultContainer(packVaultContainer(current))).toEqual({ ok: true, data: current });
  });

  it('recusa gravar uma versão que este app não conhece', () => {
    const future: VaultContainerData = { ...sampleContainer(), version: 7 };
    expect(() => packVaultContainer(future)).toThrow();
  });

  it('cada método guarda o seu próprio custo de Argon2id', () => {
    // o motivo de o tripo global ter saído do cabeçalho: o PIN é 256 MiB e a
    // senha mestra 128 MiB, e um único campo não representaria os dois
    const restored = packed(sampleContainer());
    expect(restored.methods.master?.kdf).toEqual(KDF_MASTER);
    expect(restored.methods.pin?.kdf).toEqual(KDF_PIN);
    expect(restored.methods.recovery?.kdf).toEqual(KDF_MASTER);
  });

  it('nukeLimit e attemptsMaster guardam e recuperam o valor gravado', () => {
    const data: VaultContainerData = { ...sampleContainer(), attemptsMaster: 7, nukeLimit: 50 };
    const restored = packed(data);
    expect(restored.attemptsMaster).toBe(7);
    expect(restored.nukeLimit).toBe(50);
  });

  it('preserva os dois campos com o valor zero (autodestrução desligada)', () => {
    const data: VaultContainerData = { ...sampleContainer(), attemptsMaster: 0, nukeLimit: 0 };
    const restored = packed(data);
    expect(restored.attemptsMaster).toBe(0);
    expect(restored.nukeLimit).toBe(0);
  });

  it('grava e lê o método de pânico', () => {
    const data = sampleContainer();
    const panic = data.methods.panic;
    if (panic === undefined) throw new Error('fixture incompleta');
    const restored = packed(data);
    expect(packVaultContainer(data).readUInt8(32) & FLAG_PANIC).toBe(FLAG_PANIC);
    expect(restored.methods.panic?.payload).toEqual(panic.payload);
    expect(restored.methods.panic?.kdfSalt).toBe(panic.kdfSalt);
  });

  it('recusa parâmetro KDF de método fora da faixa', () => {
    const packed = packVaultContainer(sampleContainer());

    const hugeMethod = Buffer.from(packed);
    hugeMethod.writeUInt32BE(4_294_967_295, HEADER_BYTES);
    expect(refusal(hugeMethod)).toBe('damaged');

    const zeroIterations = Buffer.from(packed);
    zeroIterations.writeUInt32BE(0, HEADER_BYTES + 4);
    expect(refusal(zeroIterations)).toBe('damaged');
  });

  it('recusa gravar parâmetro KDF fora da faixa', () => {
    const data = sampleContainer();
    const pin = data.methods.pin;
    if (pin === undefined) throw new Error('fixture incompleta');
    data.methods.pin = {
      ...pin,
      kdf: { algo: 'argon2id', memoryKiB: 1, iterations: 1, parallelism: 1 },
    } satisfies WrappedMethod;
    expect(() => packVaultContainer(data)).toThrow('Parâmetros de KDF inválidos.');
  });

  it('recusa mágica inválida, versão desconhecida e lixo no fim', () => {
    const packed = packVaultContainer(sampleContainer());

    const badMagic = Buffer.from(packed);
    badMagic.write('XXXXXXXX', 0, 'ascii');
    expect(refusal(badMagic)).toBe('damaged');

    // v4 (o layout anterior) não é lido: formato velho é arquivo desconhecido
    const oldVersion = Buffer.from(packed);
    oldVersion.writeUInt32BE(4, 8);
    expect(refusal(oldVersion)).toBe('unsupported-version');

    const futureVersion = Buffer.from(packed);
    futureVersion.writeUInt32BE(99, 8);
    expect(refusal(futureVersion)).toBe('unsupported-version');

    expect(refusal(Buffer.concat([packed, Buffer.from([0])]))).toBe('damaged');
  });

  it('distingue cofre de outra versão de arquivo danificado', () => {
    // o motivo importa na tela: um cofre de outra versão está inteiro e cifrado,
    // e dizer "alterado fora do app" faz o usuário achar que perdeu os dados
    const packedBytes = packVaultContainer(sampleContainer());

    const otherVersion = Buffer.from(packedBytes);
    otherVersion.writeUInt32BE(4, 8);
    expect(unpackVaultContainer(otherVersion)).toEqual({
      ok: false,
      reason: 'unsupported-version',
      version: 4,
    });

    // arquivo que nem é cofre continua sendo "danificado"
    const notAVault = Buffer.from(packedBytes);
    notAVault.write('XXXXXXXX', 0, 'ascii');
    expect(refusal(notAVault)).toBe('damaged');
  });

  it('recusa flag desconhecida, para um arquivo corrompido não entrar', () => {
    const packed = packVaultContainer(sampleContainer());
    const unknownFlag = Buffer.from(packed);
    unknownFlag.writeUInt8(unknownFlag.readUInt8(32) | 0x80, 32);
    expect(refusal(unknownFlag)).toBe('damaged');
  });

  it('recusa truncamento e byte adulterado no cabeçalho', () => {
    const packed = packVaultContainer(sampleContainer());
    expect(refusal(packed.subarray(0, packed.length - 3))).toBe('damaged');

    const flipped = Buffer.from(packed);
    flipped.writeUInt32BE(0, 0); // quebra a mágica
    expect(refusal(flipped)).toBe('damaged');
  });

  it('recusa um cabeçalho cortado no meio dos campos', () => {
    const packed = packVaultContainer(sampleContainer());
    // 41 bytes declarados como v6, mas sem os 8 bytes finais do cabeçalho
    expect(refusal(packed.subarray(0, HEADER_BYTES - 4))).toBe('damaged');
    expect(refusal(packed.subarray(0, 8))).toBe('damaged');
  });

  it('aceita um cofre só com PIN, sem inventar método de master', () => {
    // O byte de flags começa zerado. Se ele já nascesse com o bit do master
    // ligado, o leitor tentaria abrir um método que não existe antes do PIN e
    // recusaria um cofre perfeitamente válido.
    const data = sampleContainer();
    delete data.methods.master;
    const restored = packed(data);
    expect(restored.methods.master).toBeUndefined();
    expect(restored.methods.pin?.kdf).toEqual(KDF_PIN);
  });

  it('recusa container sem nenhum método de desbloqueio', () => {
    const data = sampleContainer();
    data.methods = {};
    expect(roundtrip(data)).toEqual({ ok: false, reason: 'damaged' });
  });

  it('recusa container só com o método de pânico (ninguém abriria)', () => {
    const data = sampleContainer();
    const panic = data.methods.panic;
    if (panic === undefined) throw new Error('fixture incompleta');
    data.methods = { panic };
    expect(roundtrip(data)).toEqual({ ok: false, reason: 'damaged' });
  });

  it('mantém o roundtrip de todas as flags conhecidas ligadas', () => {
    const packed = packVaultContainer(sampleContainer());
    for (const flag of METHOD_FLAGS) {
      expect(packed.readUInt8(32) & flag).toBe(flag);
    }
  });
});

describe('payload de entrada (.zke)', () => {
  it('roundtrip preserva salt, iv, tag e texto cifrado', () => {
    const payload = {
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: 'deadbeef',
    };
    expect(unpackEntryPayload(packEntryPayload(payload))).toEqual(payload);
  });

  it('recusa truncamento, byte extra e mágica errada', () => {
    const packed = packEntryPayload({
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: '00',
    });
    expect(unpackEntryPayload(packed.subarray(0, 20))).toBeNull();
    expect(unpackEntryPayload(Buffer.concat([packed, Buffer.from([0])]))).toBeNull();

    const badMagic = Buffer.from(packed);
    badMagic.write('ZZZZZZZZ', 0, 'ascii');
    expect(unpackEntryPayload(badMagic)).toBeNull();
  });

  it('recusa payload em JSON, que era o layout antigo', () => {
    // o `.enc` em JSON não existe mais: um arquivo assim não é uma credencial
    expect(unpackEntryPayload(Buffer.from('{"salt":"aa"}', 'utf8'))).toBeNull();
  });

  it('roundtrip de um payload sem texto cifrado, que ocupa só o cabeçalho', () => {
    // `ctLen = 0` é um tamanho legal: o `.zke` tem 60 bytes de cabeçalho e nada
    // depois. A guarda de tamanho é `<`, então esse arquivo é aceito, e é assim
    // que o reader sabe a diferença entre "vazio" e "cortado no meio".
    const payload = {
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: '',
    };
    const packed = packEntryPayload(payload);
    expect(packed).toHaveLength(60);
    expect(unpackEntryPayload(packed)).toEqual(payload);
  });
});

describe('manifesto de integridade', () => {
  const IDS = ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'ffffffff-0000-4000-8000-000000000000'];
  const AUTH_IDS = ['11111111-2222-4333-8444-555555555555'];
  const HASHES = {
    entries: {
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee': 'a'.repeat(64),
      'ffffffff-0000-4000-8000-000000000000': 'b'.repeat(64),
    },
    auth: { '11111111-2222-4333-8444-555555555555': 'c'.repeat(64) },
  };

  it('roundtrip devolve os mesmos ids e hashes', () => {
    const key = randomBytes(32);
    expect(openManifest(key, sealManifest(key, IDS, AUTH_IDS, HASHES))).toEqual({
      version: 3,
      ids: IDS,
      authIds: AUTH_IDS,
      entries: HASHES.entries,
      auth: HASHES.auth,
    });
  });

  it('falha com a chave errada', () => {
    const key = randomBytes(32);
    const blob = sealManifest(key, IDS, [], HASHES);
    expect(() => openManifest(randomBytes(32), blob)).toThrow();
  });

  it('lê o manifesto v2 da v5 e devolve hashes vazios', () => {
    // o `v` mora dentro do blob cifrado: a v2 é lida para a migração, mas não
    // promete hash nenhum, então o mapa sai vazio e a conferência de conteúdo
    // fica para depois de a v3 ser selada
    const key = randomBytes(32);
    const old = encryptRecord({ v: 2, ids: IDS, authIds: [] }, key);
    expect(openManifest(key, old)).toEqual({
      version: 2,
      ids: IDS,
      authIds: [],
      entries: {},
      auth: {},
    });
  });

  it('sela a v2 sem hashes e a v3 com eles', () => {
    const key = randomBytes(32);
    const legacy = sealManifest(key, IDS, [], HASHES, 2);
    const current = sealManifest(key, IDS, [], HASHES, 3);

    expect(openManifest(key, legacy)).toMatchObject({ version: 2, entries: {}, auth: {} });
    expect(openManifest(key, current)).toMatchObject({
      version: 3,
      entries: HASHES.entries,
      auth: HASHES.auth,
    });
  });

  it('recusa selar uma versão de manifesto desconhecida', () => {
    const key = randomBytes(32);
    expect(() => sealManifest(key, IDS, [], HASHES, 4)).toThrow(
      'Manifesto de integridade inválido.',
    );
  });

  it('falha com forma inesperada (fail-closed)', () => {
    const key = randomBytes(32);
    const notManifest = encryptRecord({ foo: 1 }, key);
    expect(() => openManifest(key, notManifest)).toThrow();
  });

  it('falha quando a lista de tokens não é uma lista de texto', () => {
    const key = randomBytes(32);
    const broken = encryptRecord({ v: 3, ids: IDS, authIds: [1], ...HASHES }, key);
    expect(() => openManifest(key, broken)).toThrow();
  });

  it('falha quando o mapa de hashes tem valor que não é SHA-256', () => {
    // P6: o hash é o que prende o conteúdo; aceitar formato livre daria ao
    // manifesto uma promessa que a verificação não consegue cumprir
    const key = randomBytes(32);
    const broken = encryptRecord(
      {
        v: 3,
        ids: IDS,
        authIds: [],
        entries: { 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee': 'nao-e-hash' },
        auth: {},
      },
      key,
    );
    expect(() => openManifest(key, broken)).toThrow();
  });

  it('falha quando ids ou authIds não são listas de texto', () => {
    const key = randomBytes(32);
    const idsNotList = encryptRecord({ v: 3, ids: 'nao-e-lista', authIds: [], ...HASHES }, key);
    const authNotList = encryptRecord({ v: 3, ids: [], authIds: 'nao-e-lista', ...HASHES }, key);

    expect(() => openManifest(key, idsNotList)).toThrow();
    expect(() => openManifest(key, authNotList)).toThrow();
  });

  it('falha quando entries ou auth não são mapas de hash', () => {
    const key = randomBytes(32);
    const entriesNotMap = encryptRecord({ v: 3, ids: [], authIds: [], entries: [], auth: {} }, key);
    const authNotMap = encryptRecord(
      { v: 3, ids: [], authIds: [], entries: {}, auth: 'nao-e-mapa' },
      key,
    );

    expect(() => openManifest(key, entriesNotMap)).toThrow();
    expect(() => openManifest(key, authNotMap)).toThrow();
  });
});

describe('leitura fail-closed de buffer truncado', () => {
  // Um container pela metade não pode virar "cofre válido": o caminho de
  // leitura precisa recusar, senão o app abre um cofre sem chave embrulhada.
  const damaged = (buffer: Buffer): VaultUnpackResult => unpackVaultContainer(buffer);

  it('recusa buffer menor que o cabeçalho', () => {
    const packed = packVaultContainer(sampleContainer());
    for (const cut of [0, 1, HEADER_BYTES - 1]) {
      expect(damaged(packed.subarray(0, cut))).toEqual({ ok: false, reason: 'damaged' });
    }
  });

  it('recusa o container cortado dentro do corpo dos métodos', () => {
    const packed = packVaultContainer(sampleContainer());
    for (const fraction of [0.25, 0.5, 0.75, 0.99]) {
      const cut = packed.subarray(0, Math.floor(packed.length * fraction));
      const result = damaged(cut);
      expect(result.ok).toBe(false);
    }
  });

  it('recusa quando sobra um byte a mais que o esperado', () => {
    const packed = packVaultContainer(sampleContainer());
    const result = damaged(Buffer.concat([packed, Buffer.from([0])]));
    expect(result).toEqual({ ok: false, reason: 'damaged' });
  });

  it('recusa payload de entrada truncado', () => {
    const payload = encryptRecord({ title: 'GitHub' }, randomBytes(32));
    const packed = packEntryPayload(payload);
    for (const fraction of [0.2, 0.6, 0.95]) {
      const cut = packed.subarray(0, Math.floor(packed.length * fraction));
      expect(unpackEntryPayload(cut)).toBeNull();
    }
    expect(unpackEntryPayload(Buffer.alloc(3))).toBeNull();
  });

  it('recusa em qualquer corte, e não só nos tamanhos redondos', () => {
    // Cortar em frações bonitas passa por fora da guarda que importa. O que
    // fecha o `readBlob` é o tamanho **declarado** do texto ser maior que o que
    // sobrou, e isso só acontece num corte qualquer, entre o fim do cabeçalho e
    // o fim do texto. Varrer todos os cortes pega essa janela; as frações não.
    //
    // O motivo também é conferido em cada corte: a tela differentiate "cofre de
    // outra versão" de "arquivo danificado", então uma recusa sem nome algum é
    // um mutante que sobrevive.
    const payload = encryptRecord({ title: 'GitHub' }, randomBytes(32));
    const packed = packEntryPayload(payload);
    for (let cut = 1; cut < packed.length; cut++) {
      expect(unpackEntryPayload(packed.subarray(0, cut))).toBeNull();
    }

    const container = packVaultContainer(sampleContainer());
    for (let cut = 1; cut < container.length; cut++) {
      expect(damaged(container.subarray(0, cut))).toEqual({ ok: false, reason: 'damaged' });
    }
  });

  it('aceita um blob de tamanho zero que fecha exatamente o arquivo', () => {
    // Guarda de `readBlob`: o cabeçalho do blob tem 52 bytes e pode ser a última
    // coisa do arquivo, com `ctLen = 0`. O corte é `>`, não `>=`: um arquivo que
    // termina exatamente no fim do cabeçalho é um blob vazio, não truncamento.
    const data = sampleContainer();
    const packed = packVaultContainer(data);
    const manifestAt = manifestOffset(data);
    const exact = packed.subarray(0, manifestAt + 52);
    exact.writeUInt32BE(0, manifestAt + 48);

    const read = unpackVaultContainer(Buffer.from(exact));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.data.manifest?.encryptedData).toBe('');
  });

  it('recusa flag desconhecida no cabeçalho', () => {
    const packed = packVaultContainer(sampleContainer());
    packed[32] = 0xff;
    expect(damaged(packed)).toEqual({ ok: false, reason: 'damaged' });
  });
});

describe('flags do container', () => {
  it('não liga o bit de um método que o cofre não tem', () => {
    // O byte de flags começa zerado e cada método liga o seu bit: um bit ligado
    // a mais diria ao leitor para ler KDF e payload onde não há nada.
    const without = sampleContainer();
    delete without.methods.recovery;
    const packed = packVaultContainer(without);
    const withAll = packVaultContainer(sampleContainer());

    expect((packed[32] ?? 0) & 0x04).toBe(0); // FLAG_RECOVERY
    expect((withAll[32] ?? 0) & 0x04).toBe(0x04);
    expect(unpackVaultContainer(packed).ok).toBe(true);
  });

  it('só marca um método presente, nunca um método ausente', () => {
    const without = sampleContainer();
    delete without.methods.recovery;
    const packed = packVaultContainer(without);
    const read = unpackVaultContainer(packed);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.data.methods.recovery).toBeUndefined();
    expect(Object.keys(read.data.methods).sort()).toEqual(['master', 'panic', 'pin']);
  });
});

describe('tamanho em disco do container', () => {
  it('mede o payload em bytes, não em caracteres hex', () => {
    // `encryptedData` é hex, então o tamanho gravado tem que contar os bytes
    // depois do `Buffer.from`. Contar os caracteres deixa o arquivo maior que o
    // necessário e o leitor perde o alinhamento dos blocos seguintes.
    const data = sampleContainer();
    const packed = packVaultContainer(data);
    const read = unpackVaultContainer(packed);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const method = read.data.methods.master;
    if (method === undefined) throw new Error('container sem método master');
    expect(method.payload.encryptedData.length).toBeGreaterThan(0);
    expect(packed.length).toBeGreaterThan(HEADER_BYTES);
  });
});

const IDS = ['aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'];
const HASHES = {
  entries: { 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa': 'a'.repeat(64) },
  auth: {},
};

describe('recusa do manifesto pela mensagem', () => {
  it('recusa payloads que decifram para um valor que não é objeto', () => {
    const key = randomBytes(32);

    expect(() => openManifest(key, encryptRecord(new Date(0), key))).toThrow(
      'Manifesto de integridade inválido.',
    );
  });

  it('nomeia o motivo quando a lista de ids é inválida, a versão é desconhecida ou a de tokens é inválida', () => {
    // Três `throw` com o mesmo texto: sem conferir a mensagem, trocar a string
    // passaria, e o usuário veria um erro sem dizer o que houve.
    const key = randomBytes(32);

    expect(() =>
      openManifest(key, encryptRecord({ v: 3, ids: [1], authIds: [], ...HASHES }, key)),
    ).toThrow('Manifesto de integridade inválido.');
    expect(() =>
      openManifest(key, encryptRecord({ v: 1, ids: IDS, authIds: [], ...HASHES }, key)),
    ).toThrow('Manifesto de integridade inválido.');
    expect(() =>
      openManifest(key, encryptRecord({ v: 3, ids: IDS, authIds: [1], ...HASHES }, key)),
    ).toThrow('Manifesto de integridade inválido.');
  });

  it('mantém a versão do manifesto em 3, com os hashes de conteúdo', () => {
    const key = randomBytes(32);
    const blob = sealManifest(key, IDS, ['a', 'b'], HASHES);

    expect(openManifest(key, blob)).toEqual({
      version: 3,
      ids: IDS,
      authIds: ['a', 'b'],
      entries: HASHES.entries,
      auth: {},
    });
  });

  it('recusa um manifesto gravado com a versão seguinte', () => {
    // O teste acima só prova que o par escreve e lê a mesma versão. Este é o
    // outro lado do contrato: um manifesto selado com 4 (o número que a próxima
    // versão usaria) tem de ser recusado, senão subir a versão abriria em silêncio
    // os arquivos que a versão de hoje gravou.
    const key = randomBytes(32);
    const future = encryptRecord({ v: 4, ids: IDS, authIds: [], ...HASHES }, key);
    expect(() => openManifest(key, future)).toThrow('Manifesto de integridade inválido.');
  });
});
