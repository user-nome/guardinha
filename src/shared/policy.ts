/**
 * Política de credencial do cofre: o formato que o app aceita do usuário.
 *
 * São regras puras, sem Node e sem DOM, e moram aqui, e não em `main/crypto.ts`,
 * porque o renderer precisa das mesmas para validar o que está sendo digitado
 * enquanto o main valida de novo antes de gravar. Divergir as duas cópias era o
 * risco real: o main aceitaria e a tela não, ou o inverso, sem erro nenhum.
 *
 * Nenhuma delas guarda segredo. São comprimentos e formatos públicos.
 */

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
