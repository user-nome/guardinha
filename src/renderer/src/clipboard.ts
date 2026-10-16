/**
 * Copia para o clipboard e limpa o conteúdo depois de 30 s. A limpeza roda no
 * processo main (`SecureClipboardProxy`, canal `clipboard:copy`), então o
 * renderer não precisa de permissão de clipboard e o temporizador sobrevive a
 * uma recarga da página.
 */
export async function copyAndAutoClear(value: string): Promise<void> {
  await window.api.clipboard.copy(value);
}
