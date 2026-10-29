import crypto from 'node:crypto';
import { currentMessages } from '@zero/main/i18n';
import { manualCharacterLimit, PASSWORD_CHARACTER_SETS } from '@zero/shared';
import { MAX_GENERATOR_LENGTH } from '@zero/shared/generator-constants';
import type { GeneratorOptions } from '@zero/types';

/** Gerador de senha com o `crypto` do Node, nunca o `Math.random` do renderer. */

/** Teto de tamanho, o mesmo que a tela permite marcar. */
export { MAX_GENERATOR_LENGTH };
/** Só as categorias marcadas; vazio quando nenhuma está ligada. */
export function passwordCharSet(options: GeneratorOptions): string {
  let charSet = '';
  if (options.useLower) charSet += PASSWORD_CHARACTER_SETS.lower;
  if (options.useUpper) charSet += PASSWORD_CHARACTER_SETS.upper;
  if (options.useNumbers) charSet += PASSWORD_CHARACTER_SETS.numbers;
  if (options.useSymbols) charSet += PASSWORD_CHARACTER_SETS.symbols;
  return charSet;
}

/** Valida a forma do pedido aqui: o handler IPC só repassa o payload. */
export function assertGeneratorOptions(options: GeneratorOptions): void {
  const m = currentMessages();
  const { length } = options;
  if (!Number.isInteger(length) || length < 0 || length > MAX_GENERATOR_LENGTH) {
    throw new Error(m.errors.invalidGenerator);
  }
  if (
    typeof options.useLower !== 'boolean' ||
    typeof options.useUpper !== 'boolean' ||
    typeof options.useNumbers !== 'boolean' ||
    typeof options.useSymbols !== 'boolean' ||
    typeof options.includeCustomEntropyWords !== 'boolean'
  ) {
    throw new Error(m.errors.invalidGenerator);
  }
  const counts = [
    options.countLower,
    options.countUpper,
    options.countNumbers,
    options.countSymbols,
  ];
  if (
    counts.some((count) => !Number.isInteger(count) || count < 0 || count > MAX_GENERATOR_LENGTH)
  ) {
    throw new Error(m.errors.invalidGenerator);
  }
  if (
    (!options.useLower && options.countLower !== 0) ||
    (!options.useUpper && options.countUpper !== 0) ||
    (!options.useNumbers && options.countNumbers !== 0) ||
    (!options.useSymbols && options.countSymbols !== 0)
  ) {
    throw new Error(m.errors.invalidGenerator);
  }
  if (
    !Array.isArray(options.customEntropyWords) ||
    options.customEntropyWords.length > 5 ||
    options.customEntropyWords.some((word) => typeof word !== 'string')
  ) {
    throw new Error(m.errors.invalidGenerator);
  }
  if (
    options.includeCustomEntropyWords &&
    (options.customEntropyWords.length === 0 ||
      options.customEntropyWords.some((word) => word.trim() === ''))
  ) {
    throw new Error(m.errors.invalidGenerator);
  }
  // Sem categoria marcada, devolver vazio fingiria que gerou uma senha.
  if (passwordCharSet(options) === '') {
    throw new Error(m.errors.invalidGenerator);
  }
  const personalCharacters = options.includeCustomEntropyWords
    ? Array.from(options.customEntropyWords.join(''))
    : [];
  const manualCharacterCount =
    options.countLower + options.countUpper + options.countNumbers + options.countSymbols;
  if (manualCharacterCount + personalCharacters.length > manualCharacterLimit(length)) {
    throw new Error(m.errors.invalidGenerator);
  }
}

/** Gera a senha com as cotas por categoria e as palavras pessoais autorizadas. */
export function generateHighEntropyPassword(options: GeneratorOptions): string {
  const { length } = options;
  if (length <= 0) return '';
  const charSet = passwordCharSet(options);
  if (charSet === '') return '';

  const combinedEntropy = options.customEntropyWords.join('');
  const personalDigest = crypto
    .createHash('sha512')
    .update(combinedEntropy + crypto.randomBytes(32).toString('hex'))
    .digest();

  let digestIndex = 0;
  const pickCharacter = (characters: string): string => {
    // `readUInt8` tipa `number`, ao contrário do índice; o módulo fica no digest.
    const personalByte = personalDigest.readUInt8(digestIndex % personalDigest.length);
    digestIndex += 1;
    const roll = (personalByte + crypto.randomInt(characters.length)) % characters.length;
    // `charAt` devolve `string` para qualquer índice, ao contrário de `[roll]`.
    return characters.charAt(roll);
  };
  const literalCharacters = options.includeCustomEntropyWords
    ? Array.from(options.customEntropyWords.join(''))
    : [];
  const passwordCharacters: string[] = [];
  const randomCharacterLength = length - literalCharacters.length;

  const categoryCounts: readonly [string, number][] = [
    [PASSWORD_CHARACTER_SETS.lower, options.countLower],
    [PASSWORD_CHARACTER_SETS.upper, options.countUpper],
    [PASSWORD_CHARACTER_SETS.numbers, options.countNumbers],
    [PASSWORD_CHARACTER_SETS.symbols, options.countSymbols],
  ];
  for (const [characters, count] of categoryCounts) {
    for (let i = 0; i < count; i++) passwordCharacters.push(pickCharacter(characters));
  }

  while (passwordCharacters.length < randomCharacterLength) {
    passwordCharacters.push(pickCharacter(charSet));
  }

  for (let i = passwordCharacters.length - 1; i > 0; i--) {
    const swapIndex = crypto.randomInt(i + 1);
    /* v8 ignore next 4 -- os dois índices vêm de `randomInt` e nunca saem da
       faixa; o `??` existe só para o `noUncheckedIndexedAccess`. */
    [passwordCharacters[i], passwordCharacters[swapIndex]] = [
      passwordCharacters[swapIndex] ?? '',
      passwordCharacters[i] ?? '',
    ];
  }

  return passwordCharacters.join('') + literalCharacters.join('');
}
