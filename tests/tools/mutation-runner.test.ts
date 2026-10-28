// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFile, walk } from '../../tools/mutation/ast.ts';
import { buildModuleGraph } from '../../tools/mutation/graph.ts';
import { enumerateMutants, applyMutant } from '../../tools/mutation/mutants.ts';
import { MUTATION_TEST_OPTIONS } from '../../tools/mutation/vitest-options.ts';

/** Trava o splicing do mutante e a config que impede o cache do Vitest de mascarar o veredito. */

const ALVO = 'src/main/unlock.ts';

describe('splicing do mutante', () => {
  it('troca o trecho do mutante e só ele', () => {
    const code = readFileSync(ALVO, 'utf8');
    const mutante = enumerateMutants(ALVO, ALVO, code)[0];
    expect(mutante).toBeDefined();
    if (mutante === undefined) return;

    const mutado = applyMutant(code, mutante);

    // O splicing é `antes + troca + depois`: o miolo muda, as pontas se deslocam.
    expect(mutado).not.toBe(code);
    expect(mutado.slice(0, mutante.start)).toBe(code.slice(0, mutante.start));
    expect(mutado.slice(mutante.start + mutante.replacement.length)).toBe(code.slice(mutante.end));
  });

  it('cada mutante aponta para um trecho diferente do arquivo', () => {
    const mutantes = enumerateMutants(ALVO, ALVO, 'const a = 1;\nconst b = 2;\n');
    const inicios = new Set(mutantes.map((m) => m.start));
    expect(inicios.size).toBe(mutantes.length);
  });
});

describe('config da varredura', () => {
  it('desliga o cache de módulo do Vitest', () => {
    // Sem isto, o cache revalida o mutante anterior e o `survived` falso volta.
    expect(MUTATION_TEST_OPTIONS.fsModuleCache).toBe(false);
  });

  it('zera os limiares de cobertura, que são os da suíte inteira', () => {
    // A varredura liga a cobertura só pela matriz de linhas; limiar isolado reprovaria tudo.
    expect(MUTATION_TEST_OPTIONS.coverage.enabled).toBe(false);
    expect(MUTATION_TEST_OPTIONS.coverage.thresholds).toEqual({
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
    });
  });
});

/** Fixa os nomes de nó da AST de que o motor depende: renomear sem aviso some com mutantes. */
describe('os nós que o motor de mutação reconhece', () => {
  const NOVAS = new Set<string>();

  function parseFixture(codigo: string): void {
    walk(parseFile('fixture.ts', codigo), (node) => NOVAS.add(node.type));
  }

  beforeAll(() => {
    parseFixture(
      [
        "import { a, b as c } from 'mod';",
        "export * from './reexporta';",
        'export default 42;',
        'const objeto = { metodo() {}, chave: 1 };',
        'const acessado = objeto?.prop;',
        'export { a as d } from "outro";',
        'async function dinamico() { await import("so-em-tempo-de-execucao"); }',
      ].join('\n'),
    );
    for (const arquivo of [
      'src/main/unlock.ts',
      'src/main/container.ts',
      'src/main/shred.ts',
      'src/main/unlock.ts',
      'src/shared/otpauth.ts',
      'src/renderer/src/components/Home.tsx',
    ]) {
      walk(parseFile(arquivo, readFileSync(arquivo, 'utf8')), (node) => NOVAS.add(node.type));
    }
  });

  it.each([
    'ImportDeclaration',
    'ImportSpecifier',
    'ExportSpecifier',
    'ExportNamedDeclaration',
    'ExportAllDeclaration',
    'ExportDefaultDeclaration',
    'MemberExpression',
    'OptionalMemberExpression',
    'ObjectProperty',
    'ObjectMethod',
    'TSPropertySignature',
    'FunctionDeclaration',
    'ClassDeclaration',
    'ClassMethod',
    'ClassProperty',
    'VariableDeclaration',
    'BinaryExpression',
    'LogicalExpression',
    'ConditionalExpression',
    'UnaryExpression',
    'IfStatement',
    'NumericLiteral',
    'StringLiteral',
    'ImportExpression',
  ])('reconhece %s', (tipo) => {
    expect(NOVAS.has(tipo)).toBe(true);
  });
});

describe('grafo de módulos', () => {
  it('o preload entra no grafo, alcançado pelo import() dinâmico do teste', () => {
    // `preload.test.ts` é o único caminho até o preload, via `import()` literal.
    const graph = buildModuleGraph(process.cwd());
    expect(graph.testsBySource.get('src/preload/index.ts')).toContain('tests/main/preload.test.ts');
  });

  it('os órfãos restantes são só barrel e carregador, que estão fora de escopo', () => {
    const graph = buildModuleGraph(process.cwd());
    // `scope.ts` exclui `node.loader.ts`, `shared/index.ts` e os tipos; outro órfão é sem teste.
    expect(graph.orphans).toEqual([
      'src/node.loader.ts',
      'src/shared/time.ts',
      'src/types/index.ts',
    ]);
  });
});
