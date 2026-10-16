/**
 * Escopo padrão da varredura: o que entra no denominador do score.
 *
 * Ficam de fora só arquivos em que mutação não diz nada sobre a suíte, e o
 * motivo de cada um está escrito aqui. Regra geral: código com decisão entra,
 * dado puro e casca de entrada não.
 */

/** Diretórios e arquivos que a varredura nunca mede. */
export const DEFAULT_EXCLUDES = [
  // Não têm runtime: só `interface`, `type` e unions. O Babel nem gera código
  // para eles, então não existe mutante possível.
  /^src\/types\//,
  // Traduções. São dados (pares de chave e texto), e a suíte já garante
  // paridade com `tests/messages/parity.test.ts`. Mutar uma string aqui só
  // mediria que a suíte de paridade existe, não que ela funciona.
  /^src\/messages\/(pt-BR|en|ja|ko|zh-CN)\.ts$/,
  // Barrarel de reexport puro: o `strength.ts` e o `otpauth.ts` são medidos.
  /^src\/shared\/index\.ts$/,
  // Texto de licença e atribuições de dependência. Dado, não decisão.
  /^src\/renderer\/src\/attributions\.ts$/,
  // Carregador de aliases do Node. Só roda em processo filho, e o V8 não mede
  // cobertura entre processos: mutar isso exigiria rodar o Node por mutante
  // sem ganho nenhum no score da suíte.
  /^src\/node\.loader\.ts$/,
];

/** Todo arquivo `.ts`/`.tsx` de `src/` que a varredura mede por padrão. */
export function isInScope(relFile: string, excludes: RegExp[] = DEFAULT_EXCLUDES): boolean {
  if (!/^src\/.*\.tsx?$/.test(relFile)) return false;
  return !excludes.some((pattern) => pattern.test(relFile));
}
