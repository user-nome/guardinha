// @vitest-environment node
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { vi } from 'vitest';
import { hotp, totp, totpRemainingMs, totpStep } from '@zero/main/totp';

/** Vetores oficiais das RFCs: o serviço define o algoritmo, então a conformidade é requisito. */

/** Segredos do Anexo B da RFC 6238: 20, 32 e 64 bytes, todos "1234…". */
const SEED_SHA1 = Buffer.from('12345678901234567890', 'ascii');
const SEED_SHA256 = Buffer.from('12345678901234567890123456789012', 'ascii');
const SEED_SHA512 = Buffer.from(
  '1234567890123456789012345678901234567890123456789012345678901234',
  'ascii',
);

/** Anexo D da RFC 4226: os dez primeiros códigos de 6 dígitos. */
const RFC4226_CODES = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
] as const;

/** Anexo B da RFC 6238: tempo em segundos, algoritmo e código de 8 dígitos. */
const RFC6238_VECTORS: readonly [number, 'SHA1' | 'SHA256' | 'SHA512', string][] = [
  [59, 'SHA1', '94287082'],
  [59, 'SHA256', '46119246'],
  [59, 'SHA512', '90693936'],
  [1111111109, 'SHA1', '07081804'],
  [1111111111, 'SHA1', '14050471'],
  [1111111111, 'SHA256', '67062674'],
  [1111111111, 'SHA512', '99943326'],
  [1234567890, 'SHA1', '89005924'],
  [2000000000, 'SHA1', '69279037'],
  [2000000000, 'SHA256', '90698825'],
  [2000000000, 'SHA512', '38618901'],
  [20000000000, 'SHA1', '65353130'],
];

function seedFor(algorithm: 'SHA1' | 'SHA256' | 'SHA512'): Buffer {
  if (algorithm === 'SHA256') return SEED_SHA256;
  if (algorithm === 'SHA512') return SEED_SHA512;
  return SEED_SHA1;
}

describe('HOTP (RFC 4226)', () => {
  // forma `[contador, código]`: o `each` de array de array espalha os campos
  it.each(RFC4226_CODES.map((code, counter): [number, string] => [counter, code]))(
    'gera %s para o contador %i',
    (_counter, expected) => {
      expect(hotp(SEED_SHA1, _counter, 6, 'SHA1')).toBe(expected);
    },
  );

  it('o passo do TOTP é o contador do HOTP dividido pelo período', () => {
    // 1111111111 s / 30 = 37037037 passos, exatamente o contador da RFC
    expect(totpStep(1111111111 * 1000, 30)).toBe(37037037);
  });

  it('falha explicitamente se a implementação HMAC devolver digest truncado', () => {
    const hmac = crypto.createHmac('sha1', SEED_SHA1);
    // o mock adota a sobrecarga que devolve string; o `totp.ts` usa a sem argumento
    vi.spyOn(hmac, 'digest').mockReturnValue(Buffer.alloc(0) as unknown as string);
    vi.spyOn(crypto, 'createHmac').mockReturnValue(hmac);

    expect(() => hotp(SEED_SHA1, 0, 6, 'SHA1')).toThrow('Digest HMAC truncado.');
  });
});

describe('TOTP (RFC 6238)', () => {
  it.each(RFC6238_VECTORS)('gera %s no passo de %i s com %s', (_seconds, algorithm, expected) => {
    expect(totp(seedFor(algorithm), _seconds * 1000, 30, 8, algorithm)).toBe(expected);
  });

  it('com 6 dígitos, que é o padrão da maioria dos serviços', () => {
    // serviços comuns usam 6 dígitos, SHA-1 e 30 s; os 6 últimos do código da RFC são 081804
    expect(totp(SEED_SHA1, 1111111109 * 1000, 30, 6, 'SHA1')).toBe('081804');
  });

  it('o mesmo segredo com período 60 s dá outro código, como o serviço manda', () => {
    const a = totp(SEED_SHA1, 1111111109 * 1000, 30, 6, 'SHA1');
    const b = totp(SEED_SHA1, 1111111109 * 1000, 60, 6, 'SHA1');
    expect(a).not.toBe(b);
  });
});

describe('tempo restante', () => {
  it('nunca é negativo nem maior que o período', () => {
    for (const now of [0, 1, 29_999, 30_000, 59_999, 1_111_111_109_000]) {
      const left = totpRemainingMs(now, 30);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(30_000);
    }
  });

  it('zera exatamente na virada do período', () => {
    expect(totpRemainingMs(30_000, 30)).toBe(30_000);
    expect(totpRemainingMs(29_999, 30)).toBe(1);
  });
});

describe('passo de tempo do TOTP', () => {
  it('usa um passo mínimo de 1 s quando o período não faz sentido', () => {
    // período zero ou fracionário viraria divisão por zero e o código sairia errado
    expect(totpStep(1_000_000, 0)).toBe(1_000);
    expect(totpStep(1_000_000, 0.4)).toBe(1_000);
  });

  it('mantém a contagem regressiva entre 0 e o período inteiro', () => {
    // a barra do renderer desenha esse número: fora da faixa ela estoura ou mente
    for (const period of [15, 30, 90]) {
      for (const offset of [0, 1, period * 500 - 1, period * 1000 - 1]) {
        const remaining = totpRemainingMs(offset, period);
        expect(remaining).toBeGreaterThanOrEqual(0);
        expect(remaining).toBeLessThanOrEqual(period * 1000);
      }
    }
  });

  it('zera a contagem quando o tempo já passou do período', () => {
    expect(totpRemainingMs(-5_000, 30)).toBeGreaterThanOrEqual(0);
    expect(totpRemainingMs(-5_000, 0)).toBeGreaterThanOrEqual(0);
  });

  it('o período de 1 s tem um segundo de janela, não dois', () => {
    // o piso de 1 s em `Math.max(1, Math.floor(period))` segura período zero ou fracionário
    expect(totpRemainingMs(0, 1)).toBe(1_000);
    expect(totpRemainingMs(1_000, 1)).toBe(1_000);
  });
});
