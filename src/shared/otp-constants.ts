/** Constantes do TOTP (RFC 6238) e do formato `otpauth://`, sem Node nem DOM. */

export const OTP_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'] as const;

export type OtpAlgorithm = (typeof OTP_ALGORITHMS)[number];

export const OTP_DEFAULT_ALGORITHM: OtpAlgorithm = 'SHA1';
export const OTP_DEFAULT_DIGITS = 6;
export const OTP_DEFAULT_PERIOD = 30;

export const OTP_DIGIT_CHOICES: readonly number[] = [6, 8];

/** Piso aceito, 80 bits: o tamanho é escolhido pelo serviço, não pelo usuário. */
export const OTP_SECRET_MIN_BYTES = 10;

/** Mínimo recomendado pela OWASP, 128 bits. */
export const OTP_SECRET_OWASP_MIN_BYTES = 16;

/** Ideal pela OWASP, 160 bits. */
export const OTP_SECRET_OWASP_RECOMMENDED_BYTES = 20;

/** Período aceito, em segundos: 15 a 300. */
export const OTP_PERIOD_RANGE = [15, 300] as const;
