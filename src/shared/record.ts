/** Restringe um valor desconhecido a um objeto não-array com chaves string. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
