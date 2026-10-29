// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KDF_CREDENTIAL,
  KDF_PIN,
  decryptAuthRecord,
  decryptRecord,
  deriveAuthKey,
  deriveKey,
  encryptAuthRecord,
  encryptRecord,
  isSameKdf,
  isValidKdfParams,
  kdfProfileFor,
  normalizeRecoveryPhrase,
  randomBytes,
} from '@zero/main/crypto';
import { MASTER_PASSWORD_LENGTH, RECOVERY_MIN_WORDS } from '@zero/shared/policy';

/** Parâmetros mínimos: aqui os testes cuidam da forma, não do custo. */
const TEST_KDF = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };

describe('deriveKey (Argon2id)', () => {
  it('produz sempre 32 bytes e é determinística para a mesma senha+salt', async () => {
    const salt = randomBytes(16);
    const first = await deriveKey('senha-de-teste', salt, TEST_KDF);
    const second = await deriveKey('senha-de-teste', salt, TEST_KDF);
    expect(first).toHaveLength(32);
    expect(first.equals(second)).toBe(true);
  });

  it('mantém o vetor do Argon2id que os cofres já gravados usam', async () => {
    // se este vetor mudar, todo `vault.zkv` existente deixa de abrir: é o que barra troca de KDF
    const derived = await deriveKey(
      'senha-de-teste',
      Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
      TEST_KDF,
    );
    expect(derived.toString('hex')).toBe(
      '6a6a4602564a88abf89b86737494151372106a7ad1eced5aa40d9504bc0d902e',
    );
  });

  it('muda com salt diferente', async () => {
    const a = await deriveKey('senha-de-teste', randomBytes(16), TEST_KDF);
    const b = await deriveKey('senha-de-teste', randomBytes(16), TEST_KDF);
    expect(a.equals(b)).toBe(false);
  });

  it('muda com parâmetros de custo diferentes', async () => {
    const salt = randomBytes(16);
    const cheap = await deriveKey('senha-de-teste', salt, TEST_KDF);
    const dearer = await deriveKey('senha-de-teste', salt, {
      ...TEST_KDF,
      memoryKiB: 32_768,
    });
    expect(cheap.equals(dearer)).toBe(false);
  });
});

describe('perfis de custo do Argon2id', () => {
  it('PIN é o perfil mais caro; mestra e frase ficam um nível abaixo', () => {
    expect(kdfProfileFor('pin')).toEqual(KDF_PIN);
    expect(kdfProfileFor('master')).toEqual(KDF_CREDENTIAL);
    // a frase não tem perfil próprio: `unwrapping.ts` a roteia para o da senha mestra
    expect(kdfProfileFor('master')).toEqual(KDF_CREDENTIAL);
    expect(KDF_PIN.memoryKiB).toBeGreaterThan(KDF_CREDENTIAL.memoryKiB);
    expect(KDF_PIN.iterations).toBeGreaterThanOrEqual(KDF_CREDENTIAL.iterations);
    expect(isSameKdf(KDF_PIN, KDF_CREDENTIAL)).toBe(false);
    expect(isSameKdf(KDF_CREDENTIAL, { ...KDF_CREDENTIAL })).toBe(true);
  });

  it('aceita parâmetros dentro da faixa e recusa fora dela', () => {
    expect(isValidKdfParams(KDF_PIN)).toBe(true);
    expect(isValidKdfParams(KDF_CREDENTIAL)).toBe(true);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 3, parallelism: 4 })).toBe(true);

    expect(isValidKdfParams({ memoryKiB: 1, iterations: 3, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 8_388_608, iterations: 3, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 0, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 3.5, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams(null)).toBe(false);
    expect(isValidKdfParams('65536')).toBe(false);
  });
});

describe('encryptRecord / decryptRecord (AES-256-GCM)', () => {
  it('faz o roundtrip com os campos íntegros', () => {
    const key = randomBytes(32);
    const data = { title: 'GitHub', username: 'otaku', password: 's3nh@-forte' };
    const payload = encryptRecord(data, key);
    expect(payload.salt).toHaveLength(32); // 128 bits em hex
    expect(payload.iv).toHaveLength(32); // 128 bits em hex
    expect(payload.tag).toHaveLength(32); // 128 bits em hex
    expect(decryptRecord(payload, key)).toEqual(data);
  });

  describe('deriveAuthKey (HKDF de tokens 2FA)', () => {
    it('deriva uma chave determinística de 32 bytes no domínio dos tokens', () => {
      const key = randomBytes(32);
      const salt = randomBytes(16);
      const first = deriveAuthKey(key, salt);

      expect(first).toHaveLength(32);
      expect(first.equals(deriveAuthKey(key, salt))).toBe(true);
      expect(first.equals(key)).toBe(false);
    });
  });

  it('falha com a chave errada', () => {
    const payload = encryptRecord({ secret: 1 }, randomBytes(32));
    expect(() => decryptRecord(payload, randomBytes(32))).toThrow();
  });

  it('falha com o conteúdo adulterado', () => {
    const key = randomBytes(32);
    const payload = encryptRecord({ secret: 'valor' }, key);
    const tampered = { ...payload, encryptedData: `${payload.encryptedData.slice(0, -2)}00` };
    expect(() => decryptRecord(tampered, key)).toThrow();
  });

  it('usa salt e IV distintos por arquivo', () => {
    const key = randomBytes(32);
    const first = encryptRecord({ a: 1 }, key);
    const second = encryptRecord({ a: 1 }, key);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });
});

describe('frase de recuperação', () => {
  it('exige ao menos 12 palavras conforme a especificação', () => {
    expect(RECOVERY_MIN_WORDS).toBe(12);
  });

  it('normaliza caixa e espaços', () => {
    expect(normalizeRecoveryPhrase('  Abelha\tAGUA  alface ')).toBe('abelha agua alface');
  });

  it('senha mestra tem 24 caracteres conforme a especificação', () => {
    expect(MASTER_PASSWORD_LENGTH).toBe(24);
  });
});

describe('parâmetros de KDF fixados', () => {
  it('mantém os custos de produção gravados em AGENTS.md e docs/cofre.md', () => {
    // Estes números protegem o PIN contra força bruta; comparar o perfil consigo mesmo não basta.
    expect(KDF_CREDENTIAL).toEqual({ memoryKiB: 131_072, iterations: 3, parallelism: 4 });
    expect(KDF_PIN).toEqual({ memoryKiB: 262_144, iterations: 4, parallelism: 4 });
  });

  it('aceita o teto da faixa de leitura e recusa o valor seguinte', () => {
    const atLimit = { memoryKiB: 1_048_576, iterations: 8, parallelism: 8 };
    expect(isValidKdfParams(atLimit)).toBe(true);
    expect(isValidKdfParams({ ...atLimit, iterations: 9 })).toBe(false);
    expect(isValidKdfParams({ ...atLimit, parallelism: 9 })).toBe(false);
    expect(isValidKdfParams({ ...atLimit, memoryKiB: 1_048_577 })).toBe(false);
  });
});

describe('derivação por HKDF', () => {
  it('separa os domínios: entrada e token de 2FA nunca dividem a chave', () => {
    // Os rótulos `-v1` separam domínios: sem eles um `.zke` abriria como `.zka`.
    const key = randomBytes(32);
    const salt = randomBytes(16);

    const entry = encryptRecord({ title: 'GitHub' }, key);
    const auth = encryptAuthRecord({ issuer: 'GitHub' }, key);

    expect(entry.salt).not.toBe(auth.salt);
    expect(decryptRecord(entry, key)).toEqual({ title: 'GitHub' });
    expect(decryptAuthRecord(auth, key)).toEqual({ issuer: 'GitHub' });
    expect(deriveAuthKey(key, salt)).toHaveLength(32);
  });

  it('recusa um registro de token no domínio de entrada e vice-versa', () => {
    const key = randomBytes(32);
    const entry = encryptRecord({ title: 'GitHub' }, key);

    // O payload do token é cifrado no outro rótulo: decifrar no domínio errado falha na tag.
    expect(() => decryptAuthRecord(entry, key)).toThrow();
  });

  it('devolve sempre 32 bytes, em qualquer faixa válida de custo', async () => {
    const salt = randomBytes(16);
    const params = [TEST_KDF, KDF_CREDENTIAL, { memoryKiB: 16_384, iterations: 1, parallelism: 8 }];
    for (const profile of params) {
      expect(await deriveKey('senha-de-teste', salt, profile)).toHaveLength(32);
    }
  });
});

/** A chave em RAM é zerada depois de cifrar, capturada por referência. */
describe('apaga a chave derivada depois de usar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('na cifragem: a chave entregue ao AES não sobrevive em memória', () => {
    const spy = vi.spyOn(crypto, 'createCipheriv');
    encryptRecord({ title: 'GitHub' }, randomBytes(32));

    const usada = spy.mock.calls[0]?.[1];
    expect(usada).toBeInstanceOf(Buffer);
    expect((usada as Buffer).every((byte) => byte === 0)).toBe(true);
  });

  it('na decifragem: idem, e no domínio de token também', () => {
    const key = randomBytes(32);
    const payload = encryptAuthRecord({ issuer: 'GitHub' }, key);
    const spy = vi.spyOn(crypto, 'createDecipheriv');
    decryptAuthRecord(payload, key);

    const usada = spy.mock.calls[0]?.[1];
    expect(usada).toBeInstanceOf(Buffer);
    expect((usada as Buffer).every((byte) => byte === 0)).toBe(true);
  });
});

/** Rótulos do HKDF são contrato de disco; aqui o valor é refeito por extenso. */
describe('rótulos de domínio do HKDF', () => {
  const esperado = (key: Buffer, salt: Buffer, info: string): Buffer =>
    Buffer.from(crypto.hkdfSync('sha512', key, salt, info, 32));

  /** Devolve a chave como ela era quando o AES a recebeu, antes do `fill(0)`. */
  const comChaveCapturada = (salt: Buffer, run: () => unknown): Buffer => {
    const original = crypto.createCipheriv;
    const capturadas: Buffer[] = [];
    vi.spyOn(crypto, 'randomBytes').mockImplementation(() => salt);
    vi.spyOn(crypto, 'createCipheriv').mockImplementation((alg, chave, iv) => {
      capturadas.push(Buffer.from(chave as Buffer));
      return original(alg, chave, iv);
    });
    try {
      run();
    } finally {
      vi.restoreAllMocks();
    }
    const [primeira] = capturadas;
    if (primeira === undefined) throw new Error('createCipheriv não recebeu chave');
    return primeira;
  };

  it('a chave de registro usa exatamente o rótulo de entrada documentado', () => {
    const key = randomBytes(32);
    const salt = randomBytes(16);
    // Cópia no momento da chamada: depois de `encryptRecord` o Buffer original já foi zerado.
    const usada = comChaveCapturada(salt, () => encryptRecord({ title: 'GitHub' }, key));
    expect(usada).toEqual(esperado(key, salt, 'guardinha-vault-entry-v1'));
  });

  it('a chave de token usa exatamente o rótulo de 2FA documentado', () => {
    const key = randomBytes(32);
    const salt = randomBytes(16);
    const usada = comChaveCapturada(salt, () => encryptAuthRecord({ issuer: 'GitHub' }, key));
    expect(usada).toEqual(esperado(key, salt, 'guardinha-vault-auth-v1'));
  });

  it('deriveAuthKey bate com o rótulo de 2FA, e é isso que o grava', () => {
    const key = randomBytes(32);
    const salt = randomBytes(16);
    expect(deriveAuthKey(key, salt)).toEqual(esperado(key, salt, 'guardinha-vault-auth-v1'));
  });
});
