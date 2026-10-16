import { parseFile, walk } from './ast.ts';
import type { Node } from '@babel/types';
import { HANDLERS, PRESENTATIONAL_JSX_ATTRIBUTES, type Draft } from './operators.ts';
import type { Mutant } from './types.ts';

/**
 * Enumeração dos mutantes de um arquivo. A ordem é estável (recorte, operador,
 * texto novo) porque o índice faz parte da identidade do mutante: o plugin do
 * Vitest recompõe a mesma lista e escolhe pelo mesmo índice.
 */
export function enumerateMutants(file: string, relFile: string, code: string): Mutant[] {
  const program = parseFile(file, code);
  const drafts: Draft[] = [];
  const presentation = presentationalLiterals(program);

  walk(program, (node, parent) => {
    const handler = HANDLERS[node.type];
    if (handler === undefined) return;
    handler(node, parent, { code, drafts, presentation });
  });

  const unique = new Map<string, Draft>();
  for (const draft of drafts) {
    const key = `${draft.start}:${draft.end}:${draft.replacement}`;
    if (!unique.has(key)) unique.set(key, draft);
  }

  const ordered = [...unique.values()].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.operator.localeCompare(b.operator);
  });

  return ordered.map((draft, index) => ({
    id: `${relFile}:${index}`,
    file,
    relFile,
    operator: draft.operator,
    line: lineAt(code, draft.start),
    column: columnAt(code, draft.start),
    start: draft.start,
    end: draft.end,
    original: code.slice(draft.start, draft.end),
    replacement: draft.replacement,
  }));
}

/** Aplica um mutante no texto-fonte por splicing, sem reprintar o arquivo. */
export function applyMutant(code: string, mutant: Mutant): string {
  return code.slice(0, mutant.start) + mutant.replacement + code.slice(mutant.end);
}

/**
 * Recortes de literais que só existem para aparência: tudo que está dentro do
 * valor de um atributo de JSX de apresentação (`className`, `type`,
 * `autoComplete`, `inputMode`, `size`, `role`), por mais aninhado que esteja
 * (`cond ? 'a' : 'b'`, template, tabela de constantes). Sem esta conta, o
 * operador `string-empty` geraria um mutante por classe de CSS do componente, e
 * a única forma de matá-lo seria a suíte conferir o texto da classe, que é
 * testar a folha de estilo.
 *
 * A tabela de constantes entra por referência: `className={TRIGGER_CLASS[size]}`
 * não tem o literal dentro do atributo, mas a tabela só existe para alimentar o
 * `className`, então os literais dela são tão de aparência quanto os do caso
 * direto. Sem resolver a referência, cada entrada da tabela virava sobrevivente.
 *
 * O conjunto é de deslocamentos, não de nós, porque é o que o operador precisa:
 * o literal de `'a'` e o de `'b'` no ternário têm nós diferentes e a mesma
 * origem visual.
 */
function presentationalLiterals(program: Node): ReadonlySet<number> {
  const offsets = new Set<number>();

  const collect = (node: Node): void => {
    walk(node, (child) => {
      if (child.type !== 'StringLiteral') return;
      const start = child.start;
      if (typeof start === 'number') offsets.add(start);
    });
  };

  // Declarações de nível de módulo por nome, para resolver a tabela referenciada
  // pelo atributo (o `size` do membro resolve para um parâmetro, não para uma
  // tabela, então fica de fora sozinho).
  const declarations = new Map<string, Node>();
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    const declarator = node as unknown as { id: Node; init: Node | null };
    if (declarator.id.type !== 'Identifier' || declarator.init === null) return;
    declarations.set(declarator.id.name, declarator.init);
  });

  walk(program, (node) => {
    if (node.type !== 'JSXAttribute') return;
    const attribute = node as unknown as { name: { name?: unknown }; value: Node | null };
    const name = attribute.name.name;
    if (typeof name !== 'string' || !PRESENTATIONAL_JSX_ATTRIBUTES.has(name)) return;
    if (attribute.value === null) return;
    collect(attribute.value);
    const resolved = new Set<string>();
    walk(attribute.value, (child) => {
      if (child.type !== 'Identifier' || resolved.has(child.name)) return;
      const declaration = declarations.get(child.name);
      if (declaration === undefined) return;
      resolved.add(child.name);
      collect(declaration);
    });
  });
  return offsets;
}

/** Linha 1-based de um deslocamento. */
export function lineAt(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Coluna 1-based de um deslocamento. */
export function columnAt(code: string, offset: number): number {
  return offset - (code.lastIndexOf('\n', offset - 1) + 1) + 1;
}

/** Trecho da linha do mutante, para o relatório mostrar o contexto. */
export function lineTextAt(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = code.indexOf('\n', offset);
  return code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd).trim();
}
