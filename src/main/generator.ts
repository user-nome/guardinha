import crypto from 'node:crypto';
import { currentMessages } from '@zero/main/i18n';
import type { GeneratorOptions } from '@zero/types';

/**
 * Gerador de senha de alta entropia.
 *
 * Mora no main e não em `crypto.ts` porque não tem nada a ver com o cofre: não
 * cifra nada, não deriva chave e nunca vê a chave do cofre. O segredo sai do
 * `crypto` do Node (hardware), nunca do `Math.random` do renderer, e o
 * resultado é texto simples devolvido pelo IPC.
 */

/** Teto de tamanho, o mesmo que a tela permite marcar. */
const MAX_LENGTH = 72;

/**
 * Conjuntos de caracteres por categoria. Ficam aqui, e não inline na função,
 * para que o teste do gerador possa conferir o mesmo conjunto que ele usa.
 */
const CHARS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHARS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARS_NUMBERS = '0123456789';
const CHARS_SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/**
 * Conjunto de caracteres da senha: só as categorias marcadas na tela. Só
 * "Maiúsculas" sai só maiúsculas, só "Números" sai só números, e assim por
 * diante. Sem nenhuma categoria marcada não há o que sortear, então devolve
 * vazio (a tela não deixa chegar aqui: a última categoria ligada não desliga).
 */
export function passwordCharSet(options: GeneratorOptions): string {
  let charSet = '';
  if (options.useLower) charSet += CHARS_LOWER;
  if (options.useUpper) charSet += CHARS_UPPER;
  if (options.useNumbers) charSet += CHARS_NUMBERS;
  if (options.useSymbols) charSet += CHARS_SYMBOLS;
  return charSet;
}

/**
 * Confere a forma do pedido do gerador e lança o erro localizado se algo não
 * fechar. É regra de domínio: o handler IPC não valida payload, só repassa.
 */
export function assertGeneratorOptions(options: GeneratorOptions): void {
  const m = currentMessages();
  const { length } = options;
  if (!Number.isInteger(length) || length < 0 || length > MAX_LENGTH) {
    throw new Error(m.errors.invalidGenerator);
  }
  if (!Array.isArray(options.customEntropyWords)) {
    throw new Error(m.errors.invalidGenerator);
  }
  // Categorias desmarcadas saem do conjunto; sem nenhuma marcada não há o que
  // sortear, e devolver vazio seria fingir que gerou uma senha.
  if (passwordCharSet(options) === '') {
    throw new Error(m.errors.invalidGenerator);
  }
}

/**
 * Gerador com injeção de palavras de entropia personalizada.
 */
export function generateHighEntropyPassword(options: GeneratorOptions): string {
  const { length } = options;
  if (length <= 0) return '';
  const charSet = passwordCharSet(options);
  if (charSet === '') return '';

  // Mistura palavras pessoais com entropia criptográfica de sistema
  const combinedEntropy = options.customEntropyWords.join('');
  const personalDigest = crypto
    .createHash('sha512')
    .update(combinedEntropy + crypto.randomBytes(32).toString('hex'))
    .digest();

  let password = '';
  for (let i = 0; i < length; i++) {
    // Digest pessoal (entropia dos gostos) desloca o índice; o randomInt de
    // hardware mantém a seleção uniforme sobre o conjunto de caracteres.
    const personalByte = personalDigest[i % personalDigest.length] ?? 0;
    const roll = (personalByte + crypto.randomInt(charSet.length)) % charSet.length;
    password += charSet[roll] ?? '';
  }

  return password;
}
