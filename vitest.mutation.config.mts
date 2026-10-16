import { mergeConfig, defineConfig } from 'vitest/config';
import base from './vitest.config.mts';
import { mutationPlugin } from './tools/mutation/plugin.ts';
import { MUTATION_TEST_OPTIONS } from './tools/mutation/vitest-options.ts';

/**
 * Configuração da varredura de mutação. Nasce da do `npm test` e só troca três
 * coisas:
 *
 * - o plugin que injeta o mutante no módulo alvo;
 * - o `hash-wasm` apontado para um doppelgänger barato, porque a suíte de cofre
 *   deriva chaves com Argon2id de produção (128 MiB e 256 MiB) e um mutante
 *   que roda a suíte inteira custaria minutos;
 * - `test` inteiro, que vem de `tools/mutation/vitest-options.ts` (o motivo do
 *   `fsModuleCache` desligado está lá, e é o que impede a varredura de medir
 *   o mutante errado).
 *
 * `isolate` continua `true`: `tests/setup-env.ts` cria um diretório temporário
 * por processo de teste e os arquivos de teste do main dependem disso para não
 * enxergar o cofre um do outro.
 */
export default mergeConfig(
  base,
  defineConfig({
    plugins: [mutationPlugin()],
    resolve: {
      alias: {
        'hash-wasm': new URL('./tools/mutation/hash-wasm-stub.ts', import.meta.url).pathname,
      },
    },
    test: MUTATION_TEST_OPTIONS,
  }),
);
