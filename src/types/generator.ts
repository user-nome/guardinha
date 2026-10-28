/** Categorias do gerador; minúsculas é categoria como as outras e o conjunto sai só do marcado. */
export interface GeneratorOptions {
  length: number;
  useLower: boolean;
  countLower: number;
  useUpper: boolean;
  countUpper: number;
  useNumbers: boolean;
  countNumbers: number;
  useSymbols: boolean;
  countSymbols: number;
  customEntropyWords: string[];
  includeCustomEntropyWords: boolean;
}
