/** Textos utilitários das telas do renderer (fora do componente, para não inflá-lo). */

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '').length;
}

/** Mesma normalização do main: minúsculas e espaços simples. */
export function normalizePhrase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ');
}
