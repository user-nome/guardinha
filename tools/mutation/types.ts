/** Um mutante: um recorte do código-fonte que é trocado por outro texto. */
export interface Mutant {
  /** Identidade estável entre execuções (`arquivo:índice`), usada pelo plugin. */
  id: string;
  /** Caminho absoluto do arquivo original. */
  file: string;
  /** Caminho relativo à raiz do repositório, como aparece no relatório. */
  relFile: string;
  operator: string;
  /** Linha (1-based) e coluna (1-based) do início da troca. */
  line: number;
  column: number;
  /** Deslocamento do início e do fim da troca no texto do arquivo. */
  start: number;
  end: number;
  original: string;
  replacement: string;
}

/** Veredito de um mutante depois de rodar a suíte com ele aplicado. */
export type MutantStatus =
  /** Algum teste quebrou: a suíte percebe a mudança. */
  | 'killed'
  /** A suíte continua verde com a mudança: buraco real de teste. */
  | 'survived'
  /** O texto trocado não compila, então não dá para avaliar a mudança. */
  | 'compileError'
  /** A execução estourou o tempo; inconclusivo. */
  | 'timeout'
  /** Nenhum teste alcançava o arquivo (buraco de cobertura, não de teste). */
  | 'noTests';

/** Registro persistido de um mutante já avaliado. */
export interface MutantResult {
  id: string;
  relFile: string;
  operator: string;
  line: number;
  column: number;
  original: string;
  replacement: string;
  status: MutantStatus;
  /** Primeiro teste que matou o mutante, quando houver. */
  killedBy: string | null;
  /** A linha de código que o mutante mexe, para o relatório. */
  context: string;
  /** Duração da execução em milissegundos. */
  durationMs: number;
}
