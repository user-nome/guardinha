/** Contratos do backup integral; atravessam o IPC e nunca levam o conteúdo do pacote. */

/** Resumo do backup do cofre gravado no pendrive. */
export interface BackupResult {
  path: string;
  /** Quantos arquivos do cofre entraram no pacote. */
  files: number;
  /** Tamanho do pacote em bytes. */
  bytes: number;
}

/** O que a restauração devolveu. */
export interface RestoreResult {
  path: string;
  /** Quantos arquivos do cofre foram restaurados. */
  files: number;
}

/** O usuário fechou o diálogo de arquivos sem escolher nada. */
export interface BackupCancelled {
  canceled: true;
}

export type BackupOutcome = BackupResult | BackupCancelled;
export type RestoreOutcome = RestoreResult | BackupCancelled;
