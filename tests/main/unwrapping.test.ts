// @vitest-environment node
import nodeCrypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KDF_CREDENTIAL, KDF_PIN, decryptRecord, encryptRecord } from '@zero/main/crypto';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import type { CredentialKind } from '@zero/main/unwrapping';
import type { WrappedMethod } from '@zero/main/container';

const VAULT_KEY = Buffer.alloc(32, 9);
const PIN = '49201733';
const MASTER = 'senha-mestra-guardinha24';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const CREDENTIALS: Record<CredentialKind, string> = {
  master: MASTER,
  pin: PIN,
  recovery: PHRASE,
  panic: '78304412',
};

/** Embrulha com a outra credencial e verifica que o GCM recusa o payload. */
async function wrapWithOther(kind: CredentialKind, credential: string): Promise<WrappedMethod> {
  const other = kind === 'pin' ? MASTER : PIN;
  expect(other).not.toBe(credential);
  return keyUnwrapperFor(kind).wrap(VAULT_KEY, other);
}

describe('KeyUnwrapperFactory (Factory Method)', () => {
  it('resolve um embrulhador por tipo de credencial', () => {
    expect(keyUnwrapperFor('master').kind).toBe('master');
    expect(keyUnwrapperFor('pin').kind).toBe('pin');
    expect(keyUnwrapperFor('recovery').kind).toBe('recovery');
    expect(keyUnwrapperFor('panic').kind).toBe('panic');
    expect(() => keyUnwrapperFor('unknown' as CredentialKind)).toThrow(
      'Método de desbloqueio desconhecido: unknown',
    );
  });

  it('cada tipo recebe o custo do Argon2id adequado ao segredo', () => {
    // o PIN de 8 dígitos é o mais fraco: perfil mais caro
    expect(keyUnwrapperFor('pin').kdf).toMatchObject(KDF_PIN);
    expect(keyUnwrapperFor('master').kdf).toMatchObject(KDF_CREDENTIAL);
    expect(keyUnwrapperFor('recovery').kdf).toMatchObject(KDF_CREDENTIAL);
    expect(keyUnwrapperFor('panic').kdf).toMatchObject(KDF_PIN);
  });

  it('isUpToDate compara o custo gravado com o perfil atual', async () => {
    const kind: CredentialKind = 'master';
    const wrapped = await keyUnwrapperFor(kind).wrap(VAULT_KEY, MASTER);
    expect(isKdfUpToDate(kind, wrapped)).toBe(true);

    const older: WrappedMethod = {
      ...wrapped,
      kdf: { algo: 'argon2id', memoryKiB: 65_536, iterations: 3, parallelism: 4 },
    };
    expect(isKdfUpToDate(kind, older)).toBe(false);
  });

  for (const kind of ['master', 'pin', 'recovery', 'panic'] as const) {
    it(`${kind}: embrulha e desembrulha a mesma chave de 32 bytes`, async () => {
      const unwrapper = keyUnwrapperFor(kind);
      const method = await unwrapper.wrap(VAULT_KEY, CREDENTIALS[kind]);

      const derived = await unwrapper.derive(method, CREDENTIALS[kind]);
      expect(derived).toHaveLength(32);
      const vaultKey = unwrapper.unwrap(method, derived);

      expect(vaultKey).toHaveLength(32);
      expect(vaultKey.equals(VAULT_KEY)).toBe(true);
      derived.fill(0);
    });

    it(`${kind}: credencial errada recusa o payload (AES-256-GCM)`, async () => {
      const unwrapper = keyUnwrapperFor(kind);
      const method = await wrapWithOther(kind, CREDENTIALS[kind]);

      const derived = await unwrapper.derive(method, 'credencial-errada');
      expect(() => unwrapper.unwrap(method, derived)).toThrow();
      derived.fill(0);
    });
  }

  it('recusa chave desembrulhada com tamanho diferente de 32 bytes', () => {
    const derived = Buffer.alloc(32, 7);
    const method: WrappedMethod = {
      kdf: keyUnwrapperFor('master').kdf,
      kdfSalt: '00'.repeat(16),
      payload: encryptRecord({ key: 'curta' }, derived),
    };

    expect(() => keyUnwrapperFor('master').unwrap(method, derived)).toThrow(
      'Registro do cofre corrompido.',
    );
  });

  it('o payload do embrulho só abre com a chave de trabalho certa', async () => {
    const method = await keyUnwrapperFor('pin').wrap(VAULT_KEY, PIN);
    const derived = await keyUnwrapperFor('pin').derive(method, PIN);
    // o payload guarda a chave em hex cifrado; sem o derived certo ele não abre
    expect(() => decryptRecord(method.payload, Buffer.alloc(32, 1))).toThrow();
    derived.fill(0);
  });
});

describe('perfis de KDF por método de desbloqueio', () => {
  it('usa o perfil da senha mestra para master e recovery, e o do PIN para pin e panic', () => {
    // O roteamento é o que dá ao PIN de pânico o mesmo custo do PIN legítimo.
    // Inverter a escolha faria o atalho do coator ficar mais barato (ou mais
    // caro) que o caminho honesto, que é justamente o que não pode acontecer.
    expect(keyUnwrapperFor('master').kdf).toMatchObject(KDF_CREDENTIAL);
    expect(keyUnwrapperFor('recovery').kdf).toMatchObject(KDF_CREDENTIAL);
    expect(keyUnwrapperFor('pin').kdf).toMatchObject(KDF_PIN);
    expect(keyUnwrapperFor('panic').kdf).toMatchObject(KDF_PIN);
    expect(keyUnwrapperFor('master').kdf.algo).toBe('argon2id');
  });
});

/**
 * Cryptographic Erase da chave de embrulho. O `fill(0)` depois de cifrar o
 * registro é o que impede que a chave derivada do Argon2id fique viva na pilha
 * depois de `wrap`, e nada a observava: o resultado do `wrap` é idêntico com a
 * chave zerada ou com `0x01` no lugar.
 *
 * A chave é capturada no `hkdfSync` porque é por ali que ela entra no cofre:
 * `encryptRecord` a recebe como `vaultKey` e deriva o registro a partir dela.
 * O Buffer é capturado **por referência**, como em `tests/main/crypto.test.ts`:
 * só a referência continua apontando para o mesmo objeto depois do `fill`, e é
 * esse objeto que precisa estar zerado quando o `wrap` termina.
 */
describe('apaga a chave de embrulho depois de envolver', () => {
  it('a chave usada para cifrar o registro não sobrevive ao wrap', async () => {
    const vistas: Buffer[] = [];
    const original = nodeCrypto.hkdfSync;
    vi.spyOn(nodeCrypto, 'hkdfSync').mockImplementation(((
      digest: string,
      key: Buffer,
      salt: Buffer,
      info: string,
      length: number,
    ): Buffer => {
      vistas.push(key);
      return original(digest, key, salt, info, length) as unknown as Buffer;
    }) as unknown as typeof nodeCrypto.hkdfSync);

    const envolvido = await keyUnwrapperFor('pin').wrap(VAULT_KEY, PIN);
    vi.restoreAllMocks();

    // o `wrap` chegou ao fim e produziu um método gravável
    expect(envolvido.kdf).toMatchObject(KDF_PIN);
    expect(envolvido.payload.encryptedData).not.toBe('');
    expect(vistas.length).toBeGreaterThan(0);
    for (const buffer of vistas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  }, 60_000);
});
