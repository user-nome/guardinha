import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Node } from '@babel/types';
import { parseFile, walk } from './ast.ts';

/**
 * Grafo de módulos do repositório, usado para escolher quais arquivos de teste
 * rodam contra um mutante. Sem isso, cada mutante derrubaria a suíte inteira
 * (84 s) e a varredura levaria horas. Com o grafo, um mutante de
 * `src/shared/base32.ts` roda só quem chama `encodeBase32` de verdade.
 *
 * A chave para o grafo ser útil é resolver **através dos barrels**: quase todo
 * mundo importa de `@zero/shared`, então um grafo que para no barrel diz que
 * `base32.ts` é alcançado pelos 45 arquivos de teste. Aqui o nome importado é
 * seguido até o arquivo que realmente define a função, e o barrel some do
 * caminho. A resolução é estática e casa com o `resolve.alias` do
 * `vitest.config.mts`.
 */

/** Prefixo de alias → diretório base. Ordem importa: o mais específico primeiro. */
const ALIASES: [string, string][] = [
  ['@zero/types/', 'src/types/'],
  ['@zero/messages/', 'src/messages/'],
  ['@zero/shared/', 'src/shared/'],
  ['@zero/main/', 'src/main/'],
  ['@zero/preload/', 'src/preload/'],
  ['@zero/renderer/', 'src/renderer/src/'],
];

const BARRELS = new Set(['@zero/types', '@zero/messages', '@zero/shared', 'electron']);

/** Candidatos de resolução de um especificador sem extensão. */
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const EXTERNAL = new Set(['electron', 'react', 'react-dom', 'lucide-react', 'fs-extra']);

/** Uma importação: o módulo e os nomes pedidos dele. */
interface Dependency {
  specifier: string;
  /** Nomes importados (`{ a, b as c }` → `a`, `b`). Vazio = namespace/default. */
  names: string[];
  /** `import x from` ou `import * as x`: não dá para seguir pelo nome. */
  whole: boolean;
}

/** O que um módulo exporta e de onde cada nome vem. */
interface ModuleInfo {
  file: string;
  ownExports: Set<string>;
  /** Nome exportado → [nome local, módulo de origem]. */
  reExports: Map<string, [string, string]>;
  starFrom: string[];
  dependencies: Dependency[];
}

export interface ModuleGraph {
  root: string;
  /** Arquivos de teste, relativos à raiz. */
  testFiles: string[];
  /** Arquivo de `src/` → testes que o alcançam de verdade. */
  testsBySource: Map<string, string[]>;
  /** Arquivos de `src/` que nenhum teste alcança. */
  orphans: string[];
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out.sort();
}

function read(file: string): ModuleInfo {
  const info: ModuleInfo = {
    file,
    ownExports: new Set(),
    reExports: new Map(),
    starFrom: [],
    dependencies: [],
  };
  const program = parseFile(file, readFileSync(file, 'utf8'));

  walk(program, (node: Node) => {
    if (node.type === 'ImportDeclaration') {
      info.dependencies.push(readImport(node));
      return;
    }
    if (node.type === 'ExportNamedDeclaration') {
      readExport(node, info);
      return;
    }
    if (node.type === 'ExportAllDeclaration') {
      info.starFrom.push(valueOf((node as unknown as { source: Node }).source));
      return;
    }
    if (node.type === 'ExportDefaultDeclaration') {
      info.ownExports.add('default');
      return;
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      readDeclaration(node, info);
      return;
    }
    if (node.type === 'VariableDeclaration') {
      readVariables(node, info);
      return;
    }
    if (node.type === 'ImportExpression') {
      readDynamicImport(node, info);
    }
  });

  return info;
}

/**
 * `import('x')` dinâmico. Desde o Babel 8 isso é um `ImportExpression` com a
 * `source`; antes era um `CallExpression` com `callee` do tipo `Import`, e o
 * silenciar de uma forma para a outra tirava o arquivo inteiro do grafo sem
 * erro nenhum (foi o que aconteceu com `src/preload/index.ts`, que só é
 * alcançado por `import()`). `tests/tools/mutation-runner.test.ts` trava a
 * forma para que um Babel maior não repita isso.
 *
 * Só o especificador literal é seguido: montado em tempo de execução, ele não
 * tem caminho estático, e a mesma regra vale para o resto do grafo.
 */
function readDynamicImport(node: Node, info: ModuleInfo): void {
  const self = node as unknown as { source: Node | null };
  if (self.source?.type !== 'StringLiteral') return;
  info.dependencies.push({ specifier: valueOf(self.source), names: [], whole: true });
}

function readImport(node: Node): Dependency {
  const self = node as unknown as { source: Node; specifiers: Node[] };
  const names: string[] = [];
  let whole = false;
  for (const specifier of self.specifiers) {
    if (specifier.type === 'ImportSpecifier') {
      const local = specifier as unknown as { imported: Node };
      names.push(nameOf(local.imported));
    } else {
      whole = true;
    }
  }
  return { specifier: valueOf(self.source), names, whole };
}

function readExport(node: Node, info: ModuleInfo): void {
  const self = node as unknown as {
    source: Node | null;
    specifiers: Node[];
    declaration: Node | null;
  };
  if (self.source !== null) {
    for (const specifier of self.specifiers) {
      const item = specifier as unknown as { local: Node; exported: Node };
      info.reExports.set(nameOf(item.exported), [nameOf(item.local), valueOf(self.source)]);
    }
    return;
  }
  if (self.declaration !== null) {
    readDeclaration(self.declaration, info);
    return;
  }
  for (const specifier of self.specifiers) {
    const item = specifier as unknown as { local: Node; exported: Node };
    info.ownExports.add(nameOf(item.exported));
    info.ownExports.add(nameOf(item.local));
  }
}

function readDeclaration(node: Node, info: ModuleInfo): void {
  if (node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') return;
  const id = (node as unknown as { id?: Node | null }).id;
  if (id !== undefined && id !== null) info.ownExports.add(nameOf(id));
}

function readVariables(node: Node, info: ModuleInfo): void {
  const self = node as unknown as { declarations: { id: Node }[] };
  for (const declarator of self.declarations) {
    if (declarator.id.type === 'Identifier') info.ownExports.add(declarator.id.name);
  }
}

function nameOf(node: Node): string {
  return (
    (node as unknown as { name?: string; value?: string }).name ??
    (node as unknown as { value: string }).value
  );
}

function valueOf(node: Node): string {
  return (node as unknown as { value: string }).value;
}

function resolveSpecifier(specifier: string, fromFile: string, root: string): string | null {
  if (EXTERNAL.has(specifier)) {
    return specifier === 'electron' ? join(root, 'tests/mocks/electron.ts') : null;
  }
  if (specifier.startsWith('.')) {
    return firstExisting(resolve(dirname(fromFile), specifier));
  }
  for (const [prefix, target] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    return firstExisting(join(root, target, specifier.slice(prefix.length)));
  }
  if (BARRELS.has(specifier)) {
    return firstExisting(join(root, 'src', specifier.slice('@zero/'.length)));
  }
  return null;
}

function firstExisting(base: string): string | null {
  for (const extension of EXTENSIONS) {
    if (isFile(`${base}${extension}`)) return `${base}${extension}`;
  }
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Onde o nome `exported` do módulo `file` é realmente declarado. */
function originOf(
  file: string,
  exported: string,
  modules: Map<string, ModuleInfo>,
  root: string,
  seen: Set<string>,
): string {
  const info = modules.get(file);
  if (info === undefined || seen.has(`${file}#${exported}`)) return file;
  seen.add(`${file}#${exported}`);

  const reExport = info.reExports.get(exported);
  if (reExport !== undefined) {
    const [local, specifier] = reExport;
    const target = resolveSpecifier(specifier, file, root);
    if (target === null) return file;
    return originOf(target, local, modules, root, seen);
  }
  if (info.ownExports.has(exported)) return file;
  for (const specifier of info.starFrom) {
    const target = resolveSpecifier(specifier, file, root);
    if (target === null) continue;
    const origin = originOf(target, exported, modules, root, seen);
    if (origin !== target) return origin;
  }
  return file;
}

/** Constrói o mapa `arquivo de src` → `testes que o alcançam`. */
export function buildModuleGraph(root: string): ModuleGraph {
  const sources = listFiles(join(root, 'src'));
  const support = listFiles(join(root, 'tests')).filter((file) => !/\.test\.tsx?$/.test(file));
  const tests = listFiles(join(root, 'tests')).filter((file) => /\.test\.tsx?$/.test(file));

  const modules = new Map<string, ModuleInfo>();
  for (const file of [...sources, ...support, ...tests]) modules.set(file, read(file));

  const depsOf = (info: ModuleInfo): string[] => {
    const out = new Set<string>();
    for (const dependency of info.dependencies) {
      const target = resolveSpecifier(dependency.specifier, info.file, root);
      if (target === null) continue;
      if (dependency.whole || dependency.names.length === 0) {
        out.add(target);
        continue;
      }
      for (const name of dependency.names) {
        out.add(originOf(target, name, modules, root, new Set()));
      }
    }
    return [...out];
  };

  const deps = new Map<string, string[]>();
  for (const [file, info] of modules) deps.set(file, depsOf(info));

  const reach = new Map<string, Set<string>>();
  for (const testFile of tests) {
    const info = modules.get(testFile);
    if (info === undefined) continue;
    const seen = new Set<string>();
    const queue = depsOf(info);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      for (const next of deps.get(current) ?? []) {
        if (!seen.has(next)) queue.push(next);
      }
    }
    for (const file of seen) {
      if (!file.startsWith(join(root, 'src'))) continue;
      const set = reach.get(file);
      if (set === undefined) reach.set(file, new Set([testFile]));
      else set.add(testFile);
    }
  }

  const testsBySource = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const file of sources) {
    const rel = relative(root, file);
    const testsFor = [...(reach.get(file) ?? [])].map((test) => relative(root, test)).sort();
    if (testsFor.length === 0) orphans.push(rel);
    else testsBySource.set(rel, testsFor);
  }

  return {
    root,
    testFiles: tests.map((file) => relative(root, file)).sort(),
    testsBySource,
    orphans,
  };
}
