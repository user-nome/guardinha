// @vitest-environment node
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as SharedModule from '@zero/shared';
import type { AuthToken } from '@zero/types';
import { authDir, vaultDir } from '@zero/main/layout';
import {
  currentCodes,
  listTokens,
  removeToken,
  saveToken,
  saveTokenFromUri,
} from '@zero/main/authenticator';
import { OTP_PERIOD_RANGE, OTP_SECRET_MIN_BYTES, base32Encode } from '@zero/shared';
import { encryptAuthRecord, randomBytes } from '@zero/main/crypto';
import { writeAuthPayload } from '@zero/main/auth-store';
import { currentMessages } from '@zero/main/i18n';
import { vaultStorage } from '@zero/main/facade';
import { createVault, requireSessionKey } from '@zero/main/vault';
import { vaultSession } from '@zero/main/session';

/**
 * `base32Decode` é um binding ESM e não aceita `vi.spyOn`, então o módulo de
 * `@zero/shared` é substituído por uma casca que delega e registra os Buffers
 * devolvidos. O registro é o que permite ver o segredo depois do `fill(0)`.
 */
const decodificados = vi.hoisted(() => ({ buffers: [] as Uint8Array[] }));

vi.mock('@zero/shared', async (importOriginal) => {
  const original = await importOriginal<typeof SharedModule>();
  return {
    ...original,
    base32Decode: (texto: string): Uint8Array | null => {
      const bytes = original.base32Decode(texto);
      if (bytes !== null) decodificados.buffers.push(bytes);
      return bytes;
    },
  };
});

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

const TAMPERED = currentMessages().errors.vaultTampered;
const STRONG_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const GITHUB_URI = `otpauth://totp/GitHub:alice@github.com?secret=${STRONG_SECRET}&issuer=GitHub`;

function draft(overrides: Record<string, unknown> = {}): {
  issuer: string;
  account: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
  secret: string;
} {
  return {
    issuer: 'GitHub',
    account: 'alice',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: STRONG_SECRET,
    ...overrides,
  };
}

describe('tokens de 2FA', () => {
  beforeAll(async () => {
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it('a pasta dos tokens fica dentro do cofre, com modo 0700', () => {
    expect(authDir().startsWith(vaultDir())).toBe(true);
    expect(authDir().endsWith('.auth')).toBe(true);
    expect(fs.statSync(authDir()).mode & 0o777).toBe(0o700);
  });

  it('não expõe tokens nem códigos na sessão decoy', () => {
    vi.spyOn(vaultSession(), 'isDecoy').mockReturnValue(true);
    expect(listTokens()).toEqual([]);
    expect(currentCodes()).toEqual([]);
  });

  it('salva a partir do endereço otpauth:// e devolve os metadados', () => {
    const tokens = saveTokenFromUri(GITHUB_URI);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      issuer: 'GitHub',
      account: 'alice@github.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  });

  it('NENHUM retorno carrega o segredo: só id, rótulo e parâmetros', () => {
    const [token] = saveTokenFromUri(GITHUB_URI);
    const serialized = JSON.stringify([token, listTokens(), currentCodes()]);
    expect(serialized).not.toContain(STRONG_SECRET);
    expect(token).not.toHaveProperty('secret');
  });

  it('o segredo fica cifrado em arquivo próprio, em 0600, sem o texto em claro', () => {
    const [token] = saveTokenFromUri(GITHUB_URI);
    const file = `${authDir()}/${token?.id}.zka`;
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const raw = fs.readFileSync(file).toString('latin1');
    expect(raw).not.toContain(STRONG_SECRET);
    expect(raw).not.toContain('GitHub');
  });

  it('um token por arquivo, como as credenciais', () => {
    saveTokenFromUri(GITHUB_URI);
    const second = saveToken(draft({ issuer: 'Discord', account: 'morgan#4321' }));
    const files = fs.readdirSync(authDir()).filter((name) => name.endsWith('.zka'));
    expect(files.length).toBe(second.length);
  });

  it('o código gerado bate com o cálculo de referência', () => {
    const [token] = saveTokenFromUri(GITHUB_URI);
    // vetor RFC 6238: a chave "12345678901234567890" em Base32
    const codes = currentCodes(1111111109 * 1000);
    expect(codes.find((item) => item.id === token?.id)?.code).toBe('081804');
  });

  it('devolve o tempo restante do período, para a barra da tela', () => {
    saveTokenFromUri(GITHUB_URI);
    const [code] = currentCodes(1111111109 * 1000);
    expect(code?.remainingMs).toBeGreaterThan(0);
    expect(code?.remainingMs).toBeLessThanOrEqual(30_000);
  });

  it('recusa segredo fora do alfabeto base32 ou menor que 80 bits', () => {
    // `1` não está no alfabeto Base32, então nem entra no cálculo do tamanho.
    expect(() => saveToken(draft({ secret: 'JBSWY3DP1EHPK3PXP' }))).toThrow(
      currentMessages().errors.invalidAuthSecret,
    );
    // 15 caracteres carregam 9 bytes: um a menos que o piso de 10.
    expect(() => saveToken(draft({ secret: 'JBSWY3DPEHPK3PX' }))).toThrow(
      currentMessages().errors.invalidAuthSecret,
    );
    expect(() => saveToken(draft({ secret: 'A'.repeat(15) }))).toThrow(
      currentMessages().errors.invalidAuthSecret,
    );
    expect(() => saveToken(draft({ secret: 'AA' }))).toThrow(
      currentMessages().errors.invalidAuthSecret,
    );
    expect(() => saveToken(draft({ secret: '' }))).toThrow(
      currentMessages().errors.invalidAuthSecret,
    );
  });

  it('aceita o segredo de 16 caracteres que o GitHub emite de fato', () => {
    // Regressão: o app exigia 128 bits, que 16 caracteres não alcançam, e o
    // cadastro do token do GitHub falhava com "precisa ter pelo menos 128 bits".
    const [token] = saveToken(draft({ secret: 'JBSWY3DPEHPK3PXP' }));
    expect(token).toBeDefined();
    if (token !== undefined) removeToken(token.id);
  });

  it('recusa parâmetros fora da faixa', () => {
    expect(() => saveToken(draft({ algorithm: 'MD5' }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
    expect(() => saveToken(draft({ digits: 7 }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
    expect(() => saveToken(draft({ period: 0 }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
    expect(() => saveToken(draft({ period: 301 }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
    expect(() => saveToken(draft({ period: 30.5 }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
  });

  it('recusa token sem emissor e sem conta', () => {
    expect(() => saveToken(draft({ issuer: ' ', account: '  ' }))).toThrow(
      currentMessages().errors.invalidAuthToken,
    );
  });

  it('trata id vazio como criação e recusa id malformado na atualização', () => {
    const [created] = saveToken({ ...draft(), id: '' });
    expect(created?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(() => saveToken({ ...draft(), id: '../../fora' })).toThrow(
      currentMessages().errors.invalidId,
    );
    expect(() => saveToken({ ...draft(), id: '00000000-0000-4000-8000-000000000000' })).toThrow(
      currentMessages().errors.authTokenNotFound,
    );
    if (created !== undefined) removeToken(created.id);
  });

  it('pula a geração quando um segredo legado não pode ser decodificado', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeAuthPayload(
      id,
      encryptAuthRecord(
        {
          id,
          issuer: 'Legado',
          account: 'conta',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: '!',
          createdAt: 1,
          updatedAt: 1,
        },
        key,
      ),
    );
    vaultStorage.updateManifest(key);
    expect(currentCodes().some((code) => code.id === id)).toBe(false);
    removeToken(id);
  });

  it('recusa endereço otpauth:// inválido com a mensagem do formato', () => {
    expect(() => saveTokenFromUri('https://exemplo.com')).toThrow(
      currentMessages().errors.invalidAuthTokenUri,
    );
    expect(() => saveTokenFromUri('otpauth://hotp/Banco:eu?secret=JBSWY3DPEHPK3PXP')).toThrow(
      currentMessages().errors.invalidAuthTokenUri,
    );
  });

  it('responde adulteração quando o registro decifrado não tem a forma', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeAuthPayload(id, encryptAuthRecord({ id, issuer: 'X', digits: 'seis' }, key));
    expect(() => vaultStorage.readAuthSecret(id, key)).toThrow(TAMPERED);
    removeToken(id);
  });

  it('converte falha ao decifrar um token em erro de adulteração', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeAuthPayload(
      id,
      encryptAuthRecord(
        {
          id,
          issuer: 'GitHub',
          account: 'alice',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: STRONG_SECRET,
          createdAt: 1,
          updatedAt: 1,
        },
        Buffer.alloc(32, 1),
      ),
    );
    vaultStorage.updateManifest(key);

    expect(() => vaultStorage.readAuthSecret(id, key)).toThrow(TAMPERED);
    removeToken(id);
  });

  it('recusa id que não é UUID, para não virar rota de path traversal', () => {
    expect(() => removeToken('../../etc/passwd')).toThrow(currentMessages().errors.invalidId);
    // UUID bem formado, porém de um token que não existe
    expect(() => removeToken('00000000-0000-4000-8000-000000000000')).toThrow(
      currentMessages().errors.authTokenNotFound,
    );
  });

  it('responde adulteração quando alguém planta um arquivo fora do app', () => {
    const key = requireSessionKey();
    // o caso que o manifesto existe para fechar: um `.zka` plantado que o cofre
    // nunca gravou passaria como token legítimo se o manifesto não contasse
    const id = vaultStorage.newId();
    writeAuthPayload(id, {
      ...encryptAuthRecord(
        {
          id,
          issuer: 'Planta',
          account: 'atacante',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: STRONG_SECRET,
          createdAt: 1,
          updatedAt: 1,
        },
        key,
      ),
    });
    expect(() => listTokens()).toThrow(TAMPERED);
    // devolvido ao manifesto, o token plantado passa a ser um token normal
    vaultStorage.updateManifest(key);
    expect(listTokens().some((token) => token.id === id)).toBe(true);
    removeToken(id);
    expect(() => listTokens()).not.toThrow();
  });

  it('responde adulteração quando o registro decifrado está incompleto', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    // falta createdAt/updatedAt: `asAuthSecret` recusa (fail-closed)
    writeAuthPayload(id, encryptAuthRecord({ id, issuer: 'X', digits: 6 }, key));
    vaultStorage.updateManifest(key);
    expect(() => listTokens()).toThrow(TAMPERED);
    removeToken(id);
  });

  it('remove o arquivo e re-sela o manifesto', () => {
    const [token] = saveTokenFromUri(GITHUB_URI);
    const id = token?.id ?? '';
    const file = `${authDir()}/${id}.zka`;
    removeToken(id);
    expect(fs.existsSync(file)).toBe(false);
    expect(() => listTokens()).not.toThrow();
  });

  it('atualizar preserva o id e a data de criação', () => {
    const [created] = saveToken(draft({ account: 'antes' }));
    const id = created?.id ?? '';
    const updated = saveToken({ ...draft({ account: 'depois' }), id });
    expect(updated[0]?.id).toBe(id);
    expect(updated[0]?.account).toBe('depois');
    expect(updated[0]?.createdAt).toBe(created?.createdAt);
    removeToken(id);
  });
});

describe('regras do token que a suíte media mal', () => {
  it('exige emissor ou conta, mas aceita qualquer um dos dois sozinho', () => {
    // `&&` aqui vira `||` sem quebrar nenhum teste antigo: os dois campos
    // vinham preenchidos. A regra é: rótulo vazio nos dois é inválido.
    const semNada = (): AuthToken[] => saveToken(draft({ issuer: '   ', account: '' }));
    const soEmissor = saveToken(draft({ issuer: 'GitHub', account: '' }));
    const soConta = saveToken(draft({ issuer: '', account: 'alice' }));

    expect(semNada).toThrow();
    expect(soEmissor[0]?.issuer).toBe('GitHub');
    expect(soConta[0]?.account).toBe('alice');
    for (const token of [soEmissor[0], soConta[0]]) {
      if (token !== undefined) removeToken(token.id);
    }
  });

  it('aceita o período nos dois extremos da faixa e recusa o valor seguinte', () => {
    const [min, max] = OTP_PERIOD_RANGE;
    const ok = saveToken(draft({ period: min }));
    const alsoOk = saveToken(draft({ period: max }));

    expect(ok[0]?.period).toBe(min);
    expect(alsoOk[0]?.period).toBe(max);
    for (const token of [ok[0], alsoOk[0]]) {
      if (token !== undefined) removeToken(token.id);
    }

    expect(() => saveToken(draft({ period: min - 1 }))).toThrow();
    expect(() => saveToken(draft({ period: max + 1 }))).toThrow();
  });

  it('aceita o segredo do tamanho mínimo e recusa um byte a menos', () => {
    // O limite é o ponto exato: `>=` trocado por `>` deixaria passar segredo
    // curto, que é justamente o que o serviço rejeitaria depois.
    const minimo = base32Encode(randomBytes(OTP_SECRET_MIN_BYTES));
    const curto = base32Encode(randomBytes(OTP_SECRET_MIN_BYTES - 1));
    const [aceito] = saveToken(draft({ secret: minimo }));

    expect(aceito).toBeDefined();
    if (aceito !== undefined) removeToken(aceito.id);
    expect(() => saveToken(draft({ secret: curto }))).toThrow();
  });

  it('ordena a lista do token mais recente para o mais antigo', () => {
    const [antigo] = saveToken(draft({ account: 'antigo' }));
    const idAntigo = antigo?.id ?? '';
    vi.setSystemTime(new Date(Date.now() + 60_000));
    const [novo] = saveToken(draft({ account: 'novo' }));
    const idNovo = novo?.id ?? '';
    vi.useRealTimers();

    const order = listTokens().map((token) => token.id);
    expect(order.indexOf(idNovo)).toBeLessThan(order.indexOf(idAntigo));
    removeToken(idAntigo);
    removeToken(idNovo);
  });
});

afterAll(() => {
  vi.useRealTimers();
});

/**
 * Cryptographic Erase do segredo TOTP. O `fill(0)` é o que impede que os bytes
 * do segredo continuem num Buffer depois que o código foi calculado, e nenhum
 * dos dois tinha teste: a suíte conferia o código devolvido, que é o mesmo com
 * o segredo zerado ou com `0x01` no lugar. O segredo é capturado por referência
 * no `base32Decode`, então continua observável depois do `fill`.
 */
describe('apaga o segredo TOTP da memória', () => {
  beforeAll(async () => {
    // o describe anterior já criou o cofre; `createVault` recusa recriar
    if (!vaultSession().isUnlocked()) {
      const result = await createVault({
        masterPassword: MASTER,
        pin: PIN,
        recoveryPhrase: PHRASE,
      });
      expect(result.ok).toBe(true);
    }
  }, 120_000);

  it('apaga os bytes decodificados ao gravar o token', () => {
    decodificados.buffers.length = 0;

    saveToken(draft({ issuer: 'Zeroiz', account: 'memoria' }));

    expect(decodificados.buffers.length).toBeGreaterThan(0);
    for (const bytes of decodificados.buffers) {
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    }
  });

  it('apaga os bytes decodificados ao calcular o código', () => {
    saveToken(draft({ issuer: 'Zeroiz2', account: 'codigo' }));
    requireSessionKey();
    decodificados.buffers.length = 0;

    const codes = currentCodes();

    expect(codes.length).toBeGreaterThan(0);
    expect(decodificados.buffers.length).toBeGreaterThan(0);
    for (const bytes of decodificados.buffers) {
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    }
  });
});
