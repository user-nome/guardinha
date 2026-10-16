/** Contagem regressiva da espera: "1:05" acima de um minuto e "30s" abaixo. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

/**
 * Texto de um erro que atravessa o IPC: o main lança `Error` com a mensagem já
 * localizada, e o renderer a mostra como está. O `fallback` é o texto do bundle
 * do próprio renderer, para o erro não localizado ou a falha de transporte.
 *
 * Vive aqui porque os dois processos precisam dele, e cada um tinha a sua cópia.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}
