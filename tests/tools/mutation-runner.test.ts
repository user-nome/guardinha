// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFile, walk } from '../../tools/mutation/ast.ts';
import { buildModuleGraph } from '../../tools/mutation/graph.ts';
import { enumerateMutants, applyMutant } from '../../tools/mutation/mutants.ts';
import { MUTATION_TEST_OPTIONS } from '../../tools/mutation/vitest-options.ts';

/**
 * A varredura de mutação mede "se esta linha fizesse outra coisa, a suíte
 * perceberia?". A resposta depende inteiramente de o mutante **entrar** na
 * execução; se ele não entra, a suíte passa e o veredito é `survived`, que é
 * mentira com a forma certa.
 *
 * Já aconteceu: o `fsModuleCache` do Vitest (ligado por padrão) guarda o módulo
 * transformado em `node_modules/.vitest-cache`, indexado pelo id do arquivo. A
 * chave não enxerga o mutante que o plugin injeta, então o cache deixado pelo
 * mutante anterior era revalidado como válido. Na prática só o primeiro mutante
 * de cada arquivo era medido de verdade, e `src/main/unlock.ts` caía de 78% para
 * 18% conforme a varredura avançava, sem nenhuma alteração no código sob teste.
 *
 * Os testes abaixo travam as duas metades: o splicing aplica a troca no texto, e
 * a config desliga o cache que faria a troca ser ignorada.
 */

const ALVO = 'src/main/unlock.ts';

describe('splicing do mutante', () => {
  it('troca o trecho do mutante e só ele', () => {
    const code = readFileSync(ALVO, 'utf8');
    const mutante = enumerateMutants(ALVO, ALVO, code)[0];
    expect(mutante).toBeDefined();
    if (mutante === undefined) return;

    const mutado = applyMutant(code, mutante);

    // O splicing é `antes + troca + depois`: o que vem antes do mutante fica
    // intacto, e o que vem depois continua igual, deslocado pelo tamanho da
    // substituição.
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
    // Sem isto, o cache revalida o texto do mutante anterior e este veredito
    // inteiro (o `survived` falso) volta. Ver o comentário do topo do arquivo.
    expect(MUTATION_TEST_OPTIONS.fsModuleCache).toBe(false);
  });

  it('zera os limiares de cobertura, que são os da suíte inteira', () => {
    // A varredura liga a cobertura só para montar a matriz de linhas. Um arquivo
    // de teste sozinho nunca bate 90%, então manter o limiar reprovaria tudo.
    expect(MUTATION_TEST_OPTIONS.coverage.enabled).toBe(false);
    expect(MUTATION_TEST_OPTIONS.coverage.thresholds).toEqual({
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
    });
  });
});

/**
 * O motor de mutação decide o que é mutável comparando **nomes de nó da AST**.
 * Um Babel maior pode renomear um tipo de nó, e aí a comparação simplesmente
 * nunca casa: nenhum erro, nenhuma exceção, só um mutante ou um import que
 * some. Foi exatamente o que o Babel 8 fez com `import('x')`, que deixou de ser
 * `CallExpression` com `callee` do tipo `Import` e passou a ser
 * `ImportExpression`: `src/preload/index.ts` saiu do grafo de módulos (só é
 * alcançado por `import()`) e deixou de ser medido, sem uma única falha.
 *
 * O teste abaixo fixa os nomes de que o motor depende. Quando um Babel trocar
 * algum, a falha aponta o nome exato em vez de deixar o escore mentir.
 */
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
    // `tests/main/preload.test.ts` carrega o preload com `await import()` para
    // poder rodar `vi.resetModules()`, e é o único caminho até ele. Sem
    //-following do `import()` literal, este arquivo saía do plano de mutação e
    // a ponte entre a interface e o processo main deixava de ser medida.
    const graph = buildModuleGraph(process.cwd());
    expect(graph.testsBySource.get('src/preload/index.ts')).toContain('tests/main/preload.test.ts');
  });

  it('os órfãos restantes são só barrel e carregador, que estão fora de escopo', () => {
    const graph = buildModuleGraph(process.cwd());
    // `scope.ts` já exclui `node.loader.ts`, `shared/index.ts` e os tipos; se
    // aparecer outro órfão, é arquivo de `src/` que nenhum teste alcança.
    //
    // `src/shared/index.ts` saiu da lista quando `tests/main/authenticator.test.ts`
    // passou a importar o barrel com `import type` de topo, no lugar do
    // `typeof import('@zero/shared')` que estava escrito dentro do `vi.mock`.
    // As duas formas são de tipo e não mudam o runtime do teste, mas só a
    // primeira é uma aresta que o grafo acompanha: o barrel deixou de ser
    // órfão. Nenhum score muda, porque ele está em `DEFAULT_EXCLUDES`.
    expect(graph.orphans).toEqual(['src/node.loader.ts', 'src/types/index.ts']);
  });
});
