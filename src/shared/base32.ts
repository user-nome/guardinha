/**
 * Base32 (RFC 4648) sem padding, o alfabeto que o Google Authenticator usa
 * para o segredo TOTP: `A-Z` e `2-7`, sem `0`, `1`, `8` e `9`.
 *
 * É regra pura, sem Node e sem DOM, porque o renderer precisa validar o que o
 * usuário digita enquanto o main decodifica para os bytes que entram no HMAC.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Aceita o que as pessoas de fato colam: separador de grupos a cada 4 ou 8
 * caracteres, espaços, hifens e o padding `=` do RFC 4648 (que o formato
 * `otpauth://` omite). Tudo vira o alfabeto canônico em caixa alta.
 */
export function normalizeBase32(value: string): string {
  return value.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

/** true quando o texto normalizado é Base32 válido e não está vazio. */
export function isBase32(value: string): boolean {
  const clean = normalizeBase32(value);
  return clean.length > 0 && /^[A-Z2-7]+$/.test(clean);
}

/**
 * Segredo em Base32 → bytes. Devolve `null` para qualquer caractere fora do
 * alfabeto, em vez de lançar: quem chama decide a mensagem de erro.
 *
 * Os bits sobrados do último grupo são descartados, como manda a RFC 4648
 * (eles não carregam dado e um segredo real pode deixá-los diferentes de
 * zero por acaso).
 */
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
