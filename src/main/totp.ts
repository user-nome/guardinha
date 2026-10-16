import crypto from 'node:crypto';
import { currentMessages } from '@zero/main/i18n';
import type { OtpAlgorithm } from '@zero/shared';

/**
 * HOTP (RFC 4226) e TOTP (RFC 6238): o cálculo do código de dois fatores.
 *
 * Mora no main porque precisa de HMAC, que é do Node, e porque é o único lugar
 * onde o segredo TOTP existe em memória. O renderer recebe o número pronto.
 *
 * O algoritmo **não é escolha nossa**: quem define é o serviço que emite o
 * segredo. SHA-1 continua sendo o correto aqui não por herança técnica, mas
 * porque GitHub, Discord, Google, AWS, Coinbase e a maioria dos serviços ainda
 * verificam HMAC-SHA1, e um código "mais forte" que o servidor rejeita vale
 * exatamente zero. SHA-256 e SHA-512 existem para os poucos serviços que pedem.
 */

/** Lê um byte do digest sem espalhar `!` pelo código (o corte é sempre válido). */
function byteAt(data: Buffer, index: number): number {
  const value = data[index];
  if (value === undefined) throw new Error(currentMessages().errors.truncatedDigest);
  return value;
}

/**
 * HMAC do segredo sobre o contador, depois do corte dinâmico da RFC 4226: o
 * último nibble do digest escolhe a posição da sequência de 4 bytes, e o bit
 * mais alto deles é zerado antes do módulo.
 */
export function hotp(
  secret: Uint8Array,
  counter: number,
  digits: number,
  algorithm: OtpAlgorithm,
): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(Math.max(0, Math.floor(counter))));

  const digest = crypto
    .createHmac(algorithm.toLowerCase(), Buffer.from(secret))
    .update(counterBytes)
    .digest();

  const offset = byteAt(digest, digest.length - 1) & 0x0f;
  const binary =
    ((byteAt(digest, offset) & 0x7f) << 24) |
    (byteAt(digest, offset + 1) << 16) |
    (byteAt(digest, offset + 2) << 8) |
    byteAt(digest, offset + 3);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Passo de tempo do TOTP: quantos períodos de 30 s cabem desde a época Unix. */
export function totpStep(timeMs: number, period: number): number {
  const step = Math.max(1, Math.floor(period));
  return Math.floor(timeMs / 1000 / step);
}

/** Código TOTP do instante `timeMs` (default: agora). */
export function totp(
  secret: Uint8Array,
  timeMs: number,
  period: number,
  digits: number,
  algorithm: OtpAlgorithm,
): string {
  return hotp(secret, totpStep(timeMs, period), digits, algorithm);
}

/**
 * Milissegundos até o próximo código. É o que a barra regressiva da tela
 * desenha, então nunca negativo e nunca maior que o período inteiro.
 */
export function totpRemainingMs(timeMs: number, period: number): number {
  const stepMs = Math.max(1, Math.floor(period)) * 1000;
  const remainder = stepMs - (timeMs % stepMs);
  return Math.min(stepMs, Math.max(0, remainder));
}
