/**
 * Constantes do TOTP (RFC 6238) e do formato `otpauth://`.
 *
 * Os valores vêm do que os serviços reais emitem, não do que o app prefere:
 * SHA1 continua sendo o correto aqui não por herança técnica, mas porque a
 * maioria dos serviços ainda verifica HMAC-SHA1.
 */

export const OTP_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'] as const;

export type OtpAlgorithm = (typeof OTP_ALGORITHMS)[number];

export const OTP_DEFAULT_ALGORITHM: OtpAlgorithm = 'SHA1';
export const OTP_DEFAULT_DIGITS = 6;
export const OTP_DEFAULT_PERIOD = 30;

export const OTP_DIGIT_CHOICES: readonly number[] = [6, 8];

/**
 * Piso aceito: 80 bits = 10 bytes (16 caracteres Base32).
 *
 * A OWASP recomenda 128 bits como mínimo e 160 bits como ideal, mas o tamanho
 * da chave é escolhido pelo serviço, não pelo usuário: recusar 80 bits tornaria
 * o cadastro impossível em serviços que ainda emitem chave curta. A tela avisa
 * quando a chave fica abaixo do mínimo da OWASP (`OTP_SECRET_OWASP_MIN_BYTES`)
 * e do recomendado (`OTP_SECRET_OWASP_RECOMMENDED_BYTES`).
 */
export const OTP_SECRET_MIN_BYTES = 10;

/** Mínimo recomendado pela OWASP: 128 bits = 16 bytes (26 caracteres Base32). */
export const OTP_SECRET_OWASP_MIN_BYTES = 16;

/** Recomendado pela OWASP: 160 bits = 20 bytes (32 caracteres Base32). */
export const OTP_SECRET_OWASP_RECOMMENDED_BYTES = 20;

/** Período aceito: 15 s a 300 s. */
export const OTP_PERIOD_RANGE = [15, 300] as const;
