import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { applyMutant, enumerateMutants } from './mutants.ts';

/**
 * Plugin que injeta um mutante no módulo carregado pelo Vitest.
 *
 * O mutante viaja em duas variáveis de ambiente porque o processo filho do
 * Vitest é quem executa o `load`: `GUARDINHA_MUTANT_FILE` diz o arquivo alvo e
 * `GUARDINHA_MUTANT_INDEX` qual mutante dele aplicar. O índice é a identidade
 * (a enumeração é estável), então o runner e o worker chegam ao mesmo mutante
 * mesmo em máquina diferente.
 *
 * A troca sai no `load`, não no `transform`, para que o texto mutado ainda
 * passe pelo pipeline normal (esbuild para TypeScript, plugin React para JSX).
 * Como o splicing é só de texto, o resto do arquivo (comentários, formatação,
 * números de linha) fica igual.
 */
export function mutationPlugin(): Plugin {
  const root = process.cwd();
  const target = process.env.GUARDINHA_MUTANT_FILE;
  if (target === undefined || target === '') return { name: 'guardinha:mutation' };

  const file = resolve(root, target);
  const index = Number(process.env.GUARDINHA_MUTANT_INDEX ?? Number.NaN);
  const code = readFileSync(file, 'utf8');
  const mutants = enumerateMutants(file, target, code);
  const mutant = mutants[index];

  if (mutant === undefined) {
    throw new Error(
      `mutante ${index} não existe em ${target} (o arquivo tem ${mutants.length}); ` +
        'a lista mudou depois do plano?',
    );
  }

  return {
    name: 'guardinha:mutation',
    enforce: 'pre',
    load(id: string) {
      const [withoutQuery] = id.split('?');
      if (withoutQuery === undefined || resolve(withoutQuery) !== file) return null;
      return applyMutant(code, mutant);
    },
  };
}
