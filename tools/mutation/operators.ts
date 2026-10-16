import type { Node } from '@babel/types';
import { sliceOf, spanOf } from './ast.ts';

/**
 * Operadores de mutação. Cada operador olha um nó da AST e devolve as trocas
 * de texto que valem a pena tentar. Regra prática: só entra operador que muda
 * uma decisão observável do código (limite, comparação, curto-circuito,
 * guarda, constante). Mutante que só atrapalha leitura, ou que o TypeScript já
 * rejeitaria, é ruído e derruba o score sem dizer nada sobre a suíte.
 */

/** Troca pronta: um recorte do arquivo e o texto que entra no lugar. */
export interface Draft {
  operator: string;
  start: number;
  end: number;
  replacement: string;
}

export interface OperatorContext {
  code: string;
  drafts: Draft[];
  /** Recortes de literais que só valem para aparência (dentro de `className`). */
  presentation: ReadonlySet<number>;
}

type Handler = (node: Node, parent: Node | null, context: OperatorContext) => void;

const ARITHMETIC: Record<string, string> = {
  '+': '-',
  '-': '+',
  '*': '/',
  '/': '*',
};

const BOUNDARY: Record<string, string> = {
  '<': '<=',
  '<=': '<',
  '>': '>=',
  '>=': '>',
};

const EQUALITY: Record<string, string> = {
  '===': '!==',
  '!==': '===',
};

const LOGICAL: Record<string, string> = {
  '&&': '||',
  '||': '&&',
};

/**
 * Procura o operador binário no vão entre os dois operandos. Trocar só o token
 * (em vez do nó inteiro) preserva parênteses, comentários e formatação.
 */
function operatorOffset(code: string, node: Node, symbol: string): number | null {
  const { start, end } = spanOf(node);
  const at = code.indexOf(symbol, start);
  if (at < 0 || at >= end) return null;
  return at;
}

function replaceToken(
  context: OperatorContext,
  node: Node,
  symbol: string,
  replacement: string,
  operator: string,
): void {
  const at = operatorOffset(context.code, node, symbol);
  if (at === null) return;
  context.drafts.push({ operator, start: at, end: at + symbol.length, replacement });
}

/**
 * Verdadeiro quando o nó está na posição de nome (propriedade, chave, item
 * importado). Mutar nome é quase sempre equivalente ou inválido.
 */
function isNamePosition(parent: Node, node: Node): boolean {
  if (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') {
    return parent.property === node && !parent.computed;
  }
  if (
    parent.type === 'ObjectProperty' ||
    parent.type === 'ObjectMethod' ||
    parent.type === 'ClassProperty' ||
    parent.type === 'ClassMethod' ||
    parent.type === 'TSPropertySignature'
  ) {
    return parent.key === node && !parent.computed;
  }
  return parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier';
}

/** `import ... from 'x'`, `export ... from 'x'` e `import('x')`: não são rótulos. */
function isModuleSpecifier(parent: Node, node: Node): boolean {
  if (parent.type === 'ImportDeclaration') return parent.source === node;
  if (parent.type === 'ExportNamedDeclaration') return parent.source === node;
  if (parent.type === 'ExportAllDeclaration') return parent.source === node;
  if (parent.type === 'TSExternalModuleReference') return parent.expression === node;
  return parent.type === 'CallExpression' && parent.callee.type === 'Import';
}

/** Literal dentro de anotação de tipo (`'a' | 'b'`): some na compilação. */
function isTypePosition(parent: Node | null): boolean {
  return parent?.type.startsWith('TS') ?? false;
}

/**
 * Elemento de tabela de dados (`LEVELS`, `COMMON_WORDS`, `OTP_ALGORITHMS`).
 * Mutar uma entrada mede se a suíte confere item por item o conjunto que o
 * código carrega, e não se o código que consome o conjunto funciona. Uma
 * tabela com cinco ou mais entradas é dado, não decisão.
 */
function isDataTableElement(parent: Node | null): boolean {
  if (parent?.type !== 'ArrayExpression') return false;
  return (parent as unknown as { elements: (Node | null)[] }).elements.length >= 5;
}

const binaryExpression: Handler = (node, parent, context) => {
  const self = node as unknown as { operator: string };
  if (parent !== null && isNamePosition(parent, node)) return;
  const equality = EQUALITY[self.operator];
  if (equality !== undefined) {
    replaceToken(context, node, self.operator, equality, 'equality');
    return;
  }
  const boundary = BOUNDARY[self.operator];
  if (boundary !== undefined) {
    replaceToken(context, node, self.operator, boundary, 'boundary');
    return;
  }
  const arithmetic = ARITHMETIC[self.operator];
  if (arithmetic !== undefined) {
    replaceToken(context, node, self.operator, arithmetic, 'arithmetic');
  }
};

const logicalExpression: Handler = (node, _parent, context) => {
  const self = node as unknown as { operator: string };
  const replacement = LOGICAL[self.operator];
  if (replacement === undefined) return;
  replaceToken(context, node, self.operator, replacement, 'logical');
};

const unaryExpression: Handler = (node, parent, context) => {
  const self = node as unknown as { operator: string; argument: Node };
  if (parent !== null && isNamePosition(parent, node)) return;
  if (self.operator !== '!' && self.operator !== '-' && self.operator !== '+') return;
  const { start, end } = spanOf(node);
  context.drafts.push({
    operator: 'negation',
    start,
    end,
    replacement: sliceOf(context.code, self.argument),
  });
};

const booleanLiteral: Handler = (node, _parent, context) => {
  const value = (node as unknown as { value: boolean }).value;
  const { start, end } = spanOf(node);
  context.drafts.push({
    operator: 'boolean',
    start,
    end,
    replacement: value ? 'false' : 'true',
  });
};

const conditionalExpression: Handler = (node, _parent, context) => {
  const self = node as unknown as { consequent: Node; alternate: Node };
  context.drafts.push({
    operator: 'ternary-swap',
    start: spanOf(self.consequent).start,
    end: spanOf(self.alternate).end,
    replacement: sliceOf(context.code, self.alternate) + sliceOf(context.code, self.consequent),
  });
};

/**
 * Guarda de `if`: sem `else` o mutante remove o teste e deixa o corpo sozinho
 * (todo mundo passa pelo corpo); com `else` e dois blocos, troca os braços,
 * que é a única troca que continua compilando.
 */
const ifStatement: Handler = (node, _parent, context) => {
  const self = node as unknown as { consequent: Node; alternate: Node | null };
  if (self.alternate === null) {
    context.drafts.push({
      operator: 'if-remove',
      start: spanOf(node).start,
      end: spanOf(self.consequent).start,
      replacement: '',
    });
    return;
  }
  if (self.consequent.type !== 'BlockStatement') return;
  if (self.alternate.type !== 'BlockStatement') return;
  context.drafts.push({
    operator: 'if-swap',
    start: spanOf(self.consequent).start,
    end: spanOf(self.alternate).end,
    replacement: sliceOf(context.code, self.alternate) + sliceOf(context.code, self.consequent),
  });
};

/**
 * Constante numérica inteira de valor pequeno. Acima disso costuma ser tamanho
 * de buffer, custo de KDF ou máscara de bits, onde somar um não testa nada.
 */
const MAX_MUTABLE_NUMBER = 1024;

const numericLiteral: Handler = (node, parent, context) => {
  if (parent !== null && isNamePosition(parent, node)) return;
  // Número em posição de tipo (`Parameters<typeof f>[0]`) some na compilação,
  // como o literal de tipo que o `string-empty` já pula.
  if (isTypePosition(parent)) return;
  const value = (node as unknown as { value: number }).value;
  if (!Number.isInteger(value) || value < 0 || value > MAX_MUTABLE_NUMBER) return;
  const { start, end } = spanOf(node);
  context.drafts.push({ operator: 'numeric', start, end, replacement: String(value + 1) });
};

/**
 * Atributo de JSX que é casca visual, não decisão. `className` é a lista de
 * classes do Tailwind, e `type`, `autoComplete`, `inputMode` e `size` são
 * metadados de formulário que o app não usa para decidir nada (não há `<form>`
 * no renderer, então `type="button"` é puro boilerplate). Trocar uma dessas
 * strings produz um mutante que a suíte só mata se passar a verificar classe de
 * CSS, que é testar a folha de estilo e não o comportamento.
 */
export const PRESENTATIONAL_JSX_ATTRIBUTES = new Set([
  'className',
  'type',
  'autoComplete',
  'inputMode',
  'size',
  'role',
]);

function isPresentationalJsxAttribute(parent: Node | null): boolean {
  if (parent?.type !== 'JSXAttribute') return false;
  const name = (parent as unknown as { name: { name?: unknown } }).name.name;
  return typeof name === 'string' && PRESENTATIONAL_JSX_ATTRIBUTES.has(name);
}

const stringLiteral: Handler = (node, parent, context) => {
  const self = node as unknown as { value: string; start?: number };
  if (self.value === '') return;
  if (parent === null) return;
  if (isTypePosition(parent) || isModuleSpecifier(parent, node)) return;
  if (isDataTableElement(parent) || isPresentationalJsxAttribute(parent)) return;
  if (typeof self.start === 'number' && context.presentation.has(self.start)) return;
  const { start, end } = spanOf(node);
  context.drafts.push({ operator: 'string-empty', start, end, replacement: "''" });
};

/**
 * `a?.b` → `a.b`. Só o nó que carrega o `?.` de verdade vira mutante: em
 * `a?.b.c` o Babel aninha um segundo `OptionalMemberExpression` para o `.c`, com
 * `optional: false`. Sem esta checagem, esse nó geraria um mutante que troca
 * `.` por `.`, que é o mesmo texto e não muda nada: um sobrevivente que não
 * significa buraco nenhum.
 */
const optionalMemberExpression: Handler = (node, _parent, context) => {
  const self = node as unknown as { object: Node; property: Node; optional: boolean };
  if (!self.optional) return;
  const start = spanOf(self.object).end;
  const end = spanOf(self.property).start;
  if (end <= start) return;
  context.drafts.push({ operator: 'optional-chaining', start, end, replacement: '.' });
};

/** Mapa por tipo de nó. Um tipo sem operador aqui é um tipo sem mutante. */
export const HANDLERS: Record<string, Handler> = {
  BinaryExpression: binaryExpression,
  LogicalExpression: logicalExpression,
  UnaryExpression: unaryExpression,
  BooleanLiteral: booleanLiteral,
  ConditionalExpression: conditionalExpression,
  IfStatement: ifStatement,
  NumericLiteral: numericLiteral,
  StringLiteral: stringLiteral,
  OptionalMemberExpression: optionalMemberExpression,
};

/** Nomes de todos os operadores, na ordem em que o relatório agrupa. */
export const OPERATORS = [
  'arithmetic',
  'boundary',
  'equality',
  'logical',
  'negation',
  'boolean',
  'ternary-swap',
  'if-remove',
  'if-swap',
  'numeric',
  'string-empty',
  'optional-chaining',
] as const;
