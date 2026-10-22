/**
 * Constantes do TOTP (RFC 6238) e do formato `otpauth://`.
 *
 * Os valores vêm do que os serviços reais emitem (GitHub, Google, Discord, AWS,
 * Coinbase, etc.), não do que o app prefere: SHA1 continua sendo o correto
 * aqui não por herança técnica, mas porque a maioria dos serviços ainda verifica
 * HMAC-SHA1.
 */

export const OTP_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'] as const;

export type OtpAlgorithm = (typeof OTP_ALGORITHMS)[number];

export const OTP_DEFAULT_ALGORITHM: OtpAlgorithm = 'SHA1';
export const OTP_DEFAULT_DIGITS = 6;
export const OTP_DEFAULT_PERIOD = 30;

export const OTP_DIGIT_CHOICES = [6, 8] as const;

/** Piso do segredo em bytes: 128 bits = 16 bytes (26 caracteres Base32). */
export const OTP_SECRET_MIN_BYTES = 16;

/** Período aceito: 15 s a 300 s. */
export const OTP_PERIOD_RANGE = [15, 300] as const;
