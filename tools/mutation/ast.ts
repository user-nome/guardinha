import { parse } from '@babel/parser';
import type { Node } from '@babel/types';

/**
 * Acesso mínimo à AST do Babel. O motor de mutação só precisa de três coisas:
 * ler a árvore, saber o pai de cada nó e recortar o texto original. Nada aqui
 * gera código: o mutante entra por splicing de texto, então o formato, os
 * comentários e os números de linha do arquivo original continuam intactos.
 */

/** Chaves do nó que carregam metadados, não código, e não devem ser percorridas. */
const NON_CODE_KEYS = new Set([
  'start',
  'end',
  'loc',
  'range',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'extra',
  'errors',
  'tokens',
]);

/** Lê um arquivo `.ts` ou `.tsx` e devolve o programa como AST. */
export function parseFile(file: string, code: string): Node {
  const jsx = file.endsWith('.tsx');
  return parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    plugins: jsx ? ['typescript', 'jsx'] : ['typescript'],
  });
}

/** Recorte do texto que o nó ocupa no arquivo. */
export function spanOf(node: Node): { start: number; end: number } {
  const start = node.start;
  const end = node.end;
  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error('nó sem posição no arquivo: o parser não informou o recorte');
  }
  return { start, end };
}

/** Texto exato que o nó ocupa no arquivo. */
export function sliceOf(code: string, node: Node): string {
  const { start, end } = spanOf(node);
  return code.slice(start, end);
}

/** Linha e coluna (ambas 1-based, para aparecerem no relatório). */
export function positionOf(node: Node): { line: number; column: number } {
  const start = node.loc?.start;
  return { line: start?.line ?? 0, column: (start?.column ?? 0) + 1 };
}

/**
 * Percorre a árvore em pré-ordem determinística, entregando cada nó e seu pai.
 * O pai importa: sem ele não dá para saber se um literal é valor de verdade,
 * nome de propriedade ou chave de objeto, e aí o mutante vira ruído.
 */
export function walk(node: Node, enter: (node: Node, parent: Node | null) => void): void {
  step(node, null, enter);
}

function step(
  node: Node,
  parent: Node | null,
  enter: (node: Node, parent: Node | null) => void,
): void {
  enter(node, parent);
  for (const key of Object.keys(node)) {
    if (NON_CODE_KEYS.has(key)) continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) step(child, node, enter);
      }
      continue;
    }
    if (isNode(value)) step(value, node, enter);
  }
}

function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  // Nós reais têm `type` em PascalCase. Comentários também, e não interessam.
  // Metadados como `SourceLocation` e `Point` não têm `type` e caem fora aqui.
  return typeof type === 'string' && !type.startsWith('Comment');
}
