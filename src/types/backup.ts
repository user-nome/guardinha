/**
 * Contratos do backup integral do cofre.
 *
 * Mora em `src/types/` porque atravessa o IPC: o renderer pede a operação e
 * recebe só contagens e o caminho, nunca o conteúdo (o pacote é cópia de bytes
 * já cifrados, montada e lida pelo processo main).
 */

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
