/**
 * Conjunto de caracteres que cada categoria do gerador oferece. Minúsculas é
 * categoria como as outras: quem só marca "Maiúsculas" quer uma senha só de
 * maiúsculas, e o gerador monta o conjunto só com o que está marcado.
 */
export interface GeneratorOptions {
  length: number;
  useLower: boolean;
  useUpper: boolean;
  useNumbers: boolean;
  useSymbols: boolean;
  customEntropyWords: string[];
}
