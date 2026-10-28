// @vitest-environment node
import nodeCrypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  KDF_CREDENTIAL,
  KDF_PIN,
  decryptAuthRecord,
  decryptRecord,
  deriveKey,
  encryptAuthRecord,
  encryptRecord,
  randomBytes,
} from '@zero/main/crypto';
import { KEY_INFO_AUTH, KEY_INFO_ENTRY } from '@zero/main/crypto-constants';

/** Vetor de referência, oráculo independente, adulteração e zeragem das chaves. */

const ARGON2_VECTOR = {
  password: 'password',
  salt: 'somesalt',
  params: { memoryKiB: 65_536, iterations: 2, parallelism: 1 },
  expected: '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7',
};

const DATA = { titulo: 'Banco do Teste', senha: 'segredo-que-nao-pode-vazar' };

function flipByte(hex: string, index = 0): string {
  const bytes = Buffer.from(hex, 'hex');
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return bytes.toString('hex');
}

describe('Argon2id: vetor de referência', () => {
  it('bate o vetor conhecido e devolve 32 bytes binários', async () => {
    const key = await deriveKey(
      ARGON2_VECTOR.password,
      Buffer.from(ARGON2_VECTOR.salt),
      ARGON2_VECTOR.params,
    );

    expect(key.toString('hex')).toBe(ARGON2_VECTOR.expected);
    expect(key).toHaveLength(32);
    key.fill(0);
  });

  it('o custo de produção é o anunciado e nunca menor que o piso do formato', () => {
    // O PIN precisa custar mais que a senha mestra; esta asserção prende os números.
    expect(KDF_PIN.memoryKiB).toBeGreaterThan(KDF_CREDENTIAL.memoryKiB);
    expect(KDF_PIN.iterations).toBeGreaterThan(KDF_CREDENTIAL.iterations);
    expect(KDF_PIN.memoryKiB).toBeGreaterThanOrEqual(16_384);
  });

  it('o perfil do PIN não é instantâneo (canário de custo)', async () => {
    const started = performance.now();
    const key = await deriveKey('12345678', randomBytes(16), KDF_PIN);
    const elapsed = performance.now() - started;

    // Piso generoso: pega a regressão grosseira, não a diferença entre máquinas.
    expect(elapsed).toBeGreaterThan(250);
    expect(key).toHaveLength(32);
    key.fill(0);
  }, 120_000);
});

describe('oráculo independente do formato', () => {
  it('o registro de credencial abre com HKDF-SHA512 + AES-256-GCM do Node', () => {
    const vaultKey = randomBytes(32);
    const payload = encryptRecord(DATA, vaultKey);

    const entryKey = Buffer.from(
      nodeCrypto.hkdfSync('sha512', vaultKey, Buffer.from(payload.salt, 'hex'), KEY_INFO_ENTRY, 32),
    );
    const decipher = nodeCrypto.createDecipheriv(
      'aes-256-gcm',
      entryKey,
      Buffer.from(payload.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    const plaintext =
      decipher.update(payload.encryptedData, 'hex', 'utf8') + decipher.final('utf8');

    expect(JSON.parse(plaintext)).toEqual(DATA);
    entryKey.fill(0);
    vaultKey.fill(0);
  });

  it('o token de 2FA usa um rótulo de domínio diferente do da credencial', () => {
    const vaultKey = randomBytes(32);
    const token = { issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
    const authPayload = encryptAuthRecord(token, vaultKey);

    // Com o rótulo da credencial o GCM recusa o arquivo: é o que separa os domínios.
    expect(() => decryptRecord(authPayload, vaultKey, KEY_INFO_ENTRY)).toThrow();
    expect(decryptAuthRecord(authPayload, vaultKey)).toEqual(token);

    const entryKey = Buffer.from(
      nodeCrypto.hkdfSync(
        'sha512',
        vaultKey,
        Buffer.from(authPayload.salt, 'hex'),
        KEY_INFO_AUTH,
        32,
      ),
    );
    expect(entryKey).toHaveLength(32);
    entryKey.fill(0);
    vaultKey.fill(0);
  });
});

describe('matriz de adulteração', () => {
  const vaultKey = randomBytes(32);

  for (const field of ['salt', 'iv', 'tag', 'encryptedData'] as const) {
    it(`recusa ${field} alterado em um byte`, () => {
      const payload = encryptRecord(DATA, vaultKey);
      const tampered = { ...payload, [field]: flipByte(payload[field]) };

      expect(() => decryptRecord(tampered, vaultKey)).toThrow();
    });
  }

  it('recusa payload truncado e salt que não é hexadecimal', () => {
    const payload = encryptRecord(DATA, vaultKey);

    expect(() =>
      decryptRecord({ ...payload, encryptedData: payload.encryptedData.slice(2) }, vaultKey),
    ).toThrow();
    expect(() => decryptRecord({ ...payload, salt: 'xyz' }, vaultKey)).toThrow();
  });

  it('recusa a chave errada mesmo com o payload intacto', () => {
    const payload = encryptRecord(DATA, vaultKey);

    expect(() => decryptRecord(payload, randomBytes(32))).toThrow();
  });
});

describe('salt, IV e texto cifrado', () => {
  it('sorteia salt e IV novos em cada gravação (nenhuma colisão em 64)', () => {
    const vaultKey = randomBytes(32);
    const salts = new Set<string>();
    const ivs = new Set<string>();
    const texts = new Set<string>();

    for (let i = 0; i < 64; i++) {
      const payload = encryptRecord(DATA, vaultKey);
      salts.add(payload.salt);
      ivs.add(payload.iv);
      texts.add(payload.encryptedData);
    }

    expect(salts.size).toBe(64);
    expect(ivs.size).toBe(64);
    expect(texts.size).toBe(64);
    vaultKey.fill(0);
  });

  it('não deixa o texto claro nem a chave no payload serializado', () => {
    const vaultKey = randomBytes(32);
    const payload = encryptRecord(DATA, vaultKey);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(DATA.senha);
    expect(serialized).not.toContain(DATA.titulo);
    expect(serialized).not.toContain(vaultKey.toString('hex'));
    expect(serialized).not.toContain(vaultKey.toString('base64'));
    vaultKey.fill(0);
  });
});

describe('zeragem das chaves de trabalho', () => {
  it('zera a chave derivada por registro depois de cifrar', () => {
    const vaultKey = randomBytes(32);
    const cipher = vi.spyOn(nodeCrypto, 'createCipheriv');

    encryptRecord(DATA, vaultKey);

    const entryKey = cipher.mock.calls[0]?.[1];
    expect(Buffer.isBuffer(entryKey)).toBe(true);
    expect((entryKey as Buffer).every((byte) => byte === 0)).toBe(true);
    vaultKey.fill(0);
  });

  it('zera a chave derivada por registro mesmo quando a decifragem falha', () => {
    const payload = encryptRecord(DATA, randomBytes(32));
    const decipher = vi.spyOn(nodeCrypto, 'createDecipheriv');

    expect(() => decryptRecord(payload, randomBytes(32))).toThrow();

    const entryKey = decipher.mock.calls[0]?.[1];
    expect(Buffer.isBuffer(entryKey)).toBe(true);
    expect((entryKey as Buffer).every((byte) => byte === 0)).toBe(true);
  });

  it('zera a chave derivada por registro mesmo quando a cifragem falha', () => {
    const vaultKey = randomBytes(32);
    let captured: Buffer | null = null;
    vi.spyOn(nodeCrypto, 'createCipheriv').mockImplementation((_algorithm, key) => {
      captured = key as Buffer;
      throw new Error('falha simulada na cifragem');
    });

    expect(() => encryptRecord(DATA, vaultKey)).toThrow('falha simulada na cifragem');
    expect(captured).not.toBeNull();
    expect((captured as unknown as Buffer).every((byte) => byte === 0)).toBe(true);
    vaultKey.fill(0);
  });
});
