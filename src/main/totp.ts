import crypto from 'node:crypto';
import { currentMessages } from '@zero/main/i18n';
import type { OtpAlgorithm } from '@zero/shared';

/** HOTP (RFC 4226) e TOTP (RFC 6238) no main; o renderer recebe o código pronto. */

/** Lê um byte do digest sem espalhar `!` pelo código (o corte é sempre válido). */
function byteAt(data: Buffer, index: number): number {
  const value = data[index];
  if (value === undefined) throw new Error(currentMessages().errors.truncatedDigest);
  return value;
}

/** HMAC sobre o contador com o corte dinâmico da RFC 4226. */
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

/** Milissegundos até o próximo código, para a barra regressiva. */
export function totpRemainingMs(timeMs: number, period: number): number {
  const stepMs = Math.max(1, Math.floor(period)) * 1000;
  const remainder = stepMs - (timeMs % stepMs);
  return Math.min(stepMs, Math.max(0, remainder));
}
