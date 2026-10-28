/** Base32 (RFC 4648) sem padding, alfabeto do segredo TOTP; regra pura, sem Node nem DOM. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Aceita separadores, espaços, hifens e padding `=`; devolve o alfabeto em caixa alta. */
export function normalizeBase32(value: string): string {
  return value.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

/** true quando o texto normalizado é Base32 válido e não está vazio. */
export function isBase32(value: string): boolean {
  const clean = normalizeBase32(value);
  return clean.length > 0 && /^[A-Z2-7]+$/.test(clean);
}

/** Base32 → bytes; devolve `null` fora do alfabeto e descarta os bits do último grupo. */
export function base32Decode(value: string): Uint8Array | null {
  const clean = normalizeBase32(value);
  if (clean === '' || !/^[A-Z2-7]+$/.test(clean)) return null;

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Bytes → Base32 sem padding (usado para exibir o segredo ao usuário). */
export function base32Encode(data: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of data) {
    buffer = (buffer << 8) | (byte & 0xff);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET.charAt((buffer >>> bits) & 0x1f);
    }
  }
  if (bits > 0) out += ALPHABET.charAt((buffer << (5 - bits)) & 0x1f);
  return out;
}
