/**
 * Limites do gerador de senha.
 *
 * Ficam aqui para que o main e o renderer usem os mesmos tetos sem repetir
 * `72` ou `5` no código.
 */

/** Teto do comprimento da senha gerada. */
export const MAX_GENERATOR_LENGTH = 72;

/** Quantas palavras pessoais o usuário pode digitar. */
export const MAX_CUSTOM_WORDS = 5;

/** Porcentagem máxima de caracteres manuais (categorias + palavras) em relação ao total. */
export const MANUAL_CHARACTER_RATIO = 0.4;
