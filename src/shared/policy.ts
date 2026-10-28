/** Política de credencial: formato aceito, regra pura usada pelo renderer e pelo main. */

/** Comprimento fixo da senha mestra (24 caracteres gerados no primeiro uso). */
export const MASTER_PASSWORD_LENGTH = 24;

/** O PIN é numérico e de comprimento fixo. */
export const PIN_LENGTH = 8;

/** Número mínimo de palavras da frase de recuperação (escrita pelo usuário). */
export const RECOVERY_MIN_WORDS = 12;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** Identificador de credencial ou de token de 2FA, que também é nome de arquivo. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** PIN no formato aceito: exatamente `PIN_LENGTH` dígitos, nada mais. */
export function isPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Senha mestra no formato aceito: exatamente `MASTER_PASSWORD_LENGTH`. */
export function isMasterPasswordFormat(password: string): boolean {
  return password.length === MASTER_PASSWORD_LENGTH;
}
