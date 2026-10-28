import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, isBase32, normalizeBase32 } from '@zero/shared/base32';

/** Vetores do Anexo C da RFC 4648 para o alfabeto base32. */
const VECTORS: readonly [string, string][] = [
  ['', ''],
  ['f', 'MY'],
  ['fo', 'MZXQ'],
  ['foo', 'MZXW6'],
  ['foob', 'MZXW6YQ'],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI'],
];

describe('base32 (RFC 4648)', () => {
  it.each(VECTORS)('codifica %s como %s', (plain, encoded) => {
    expect(base32Encode(new TextEncoder().encode(plain))).toBe(encoded);
  });

  it.each(VECTORS.filter(([plain]) => plain !== ''))(
    'decodifica %s voltando ao texto original',
    (plain, encoded) => {
      const bytes = base32Decode(encoded);
      expect(bytes).not.toBeNull();
      expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe(plain);
    },
  );

  it('o segredo vazio é ausência, não um valor válido', () => {
    expect(base32Decode('')).toBeNull();
  });

  it('nunca emite padding, que o formato otpauth:// omite', () => {
    expect(base32Encode(new Uint8Array([0x66]))).not.toContain('=');
  });

  it('o exemplo canônico do Google Authenticator', () => {
    // "Hello!" + DE AD BE EF, o segredo de exemplo da wiki Key Uri Format
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
    expect(base32Encode(bytes)).toBe('JBSWY3DPEHPK3PXP');
    expect(base32Decode('JBSWY3DPEHPK3PXP')).toEqual(bytes);
  });
});

describe('normalização', () => {
  it('aceita o que a pessoa digita: espaços, hifens, minúsculas e padding', () => {
    expect(normalizeBase32('jbsw y3dp ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP');
    expect(normalizeBase32('JBSW-Y3DP-EHPK-3PXP')).toBe('JBSWY3DPEHPK3PXP');
    expect(normalizeBase32('JBSWY3DPEHPK3PXP====')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('recusa o que está fora do alfabeto A-Z 2-7', () => {
    // 0, 1, 8 e 9 não existem em base32: são os erros de digitação classics
    expect(isBase32('JBSWY3DPEHPK3PX0')).toBe(false);
    expect(isBase32('JBSWY3DP1EHPK3PXP')).toBe(false);
    expect(isBase32('JBSWY3DP8EHPK3PXP')).toBe(false);
    expect(isBase32('JBSWY3DP9EHPK3PXP')).toBe(false);
    expect(base32Decode('JBSWY3DPEHPK3PX!')).toBeNull();
  });

  it('trata string vazia como segredo ausente, não como um válido', () => {
    expect(isBase32('')).toBe(false);
    expect(base32Decode('')).toBeNull();
    expect(base32Decode('====')).toBeNull();
  });
});

describe('vetores do RFC 4648', () => {
  // Vetores fixos da RFC, não round-trip: um round-trip passaria com o acumulador errado dos dois lados
  const casos: [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it('codifica cada vetor exatamente', () => {
    for (const [texto, base32] of casos) {
      expect(base32Encode(new TextEncoder().encode(texto))).toBe(base32);
    }
  });

  it('decodifica cada vetor de volta', () => {
    for (const [texto, base32] of casos) {
      if (base32 === '') continue;
      expect(new TextDecoder().decode(base32Decode(base32) ?? new Uint8Array())).toBe(texto);
    }
  });

  it('descarta os bits sobrados do último grupo', () => {
    // 'foob' tem 28 bits úteis e os 5 restantes vão zerados, sem sobra no grupo de 32 bits
    expect([...(base32Decode('MZXW6YQ') ?? [])]).toEqual([0x66, 0x6f, 0x6f, 0x62]);
    expect([...(base32Decode('MZXW6YTBOI') ?? [])]).toEqual([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
  });
});

describe('isBase32 no limite de tamanho', () => {
  it('aceita um único caractere do alfabeto', () => {
    // o piso é 1: um segredo de um caractere é curto demais, mas ainda é Base32 válido
    expect(isBase32('A')).toBe(true);
    expect(isBase32('7')).toBe(true);
  });

  it('recusa o vazio e o que só tem separador', () => {
    expect(isBase32('')).toBe(false);
    expect(isBase32('  ')).toBe(false);
    expect(isBase32('====')).toBe(false);
  });
});
