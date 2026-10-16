import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Hooks de resolução síncronos (mesma thread) para os aliases `@zero/*` quando
 * um `.ts` roda direto no Node, sem bundler. Espelha `paths` de
 * `tsconfig.base.json` e o mapa de `electron.vite.config.mts`.
 *
 *   node --import ./src/node.loader.ts caminho/para/arquivo.ts
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALIASES: [string, string][] = [
  ['@zero/types/', path.join(ROOT, 'src/types/')],
  ['@zero/messages/', path.join(ROOT, 'src/messages/')],
  ['@zero/shared/', path.join(ROOT, 'src/shared/')],
  ['@zero/main/', path.join(ROOT, 'src/main/')],
  ['@zero/preload/', path.join(ROOT, 'src/preload/')],
  ['@zero/renderer/', path.join(ROOT, 'src/renderer/src/')],
];

function resolveAlias(specifier: string): string | null {
  for (const [prefix, target] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    const base = target + specifier.slice(prefix.length);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
        return pathToFileURL(candidate).href;
      }
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const aliased = resolveAlias(specifier);
    if (aliased !== null) {
      return { url: aliased, shortCircuit: true };
    }
    if (
      specifier === '@zero/types' ||
      specifier === '@zero/messages' ||
      specifier === '@zero/shared'
    ) {
      const index = path.join(ROOT, 'src', specifier.slice('@zero/'.length), 'index.ts');
      if (existsSync(index)) {
        return { url: pathToFileURL(index).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
