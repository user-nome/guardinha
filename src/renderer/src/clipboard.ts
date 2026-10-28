/** Copia e deixa a limpeza em 30 s com o main, que sobrevive a uma recarga da página. */
export async function copyAndAutoClear(value: string): Promise<void> {
  await window.api.clipboard.copy(value);
}
