import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/** Espelha `paths` de tsconfig.base.json e o mapa de `node.loader.ts`. */
export const aliases = {
  '@zero/types': resolve(import.meta.dirname, 'src/types'),
  '@zero/messages': resolve(import.meta.dirname, 'src/messages'),
  '@zero/shared': resolve(import.meta.dirname, 'src/shared'),
  '@zero/main': resolve(import.meta.dirname, 'src/main'),
  '@zero/preload': resolve(import.meta.dirname, 'src/preload'),
  '@zero/renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  electron: resolve(import.meta.dirname, 'tests/mocks/electron.ts'),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: aliases,
  },
  test: {
    name: 'guardinha',
    root: import.meta.dirname,
    environment: 'jsdom',
    pool: 'forks',
    clearMocks: false,
    // Argon2id real (128 MB, t=3 e 256 MB, t=4) roda nos testes de cofre: sob
    // carga do desktop um chute de PIN passa de 15 s e um cofre inteiro (três
    // derivações) de 45 s, então o teto precisa de folga para não virar falso
    // positivo. Os hooks seguem a mesma régua (makeContainer também deriva).
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/renderer/src/global.d.ts',
        'src/renderer/index.html',
        // Declarações de tipo e barrels de reexport. Com `verbatimModuleSyntax`,
        // `interface`, `type` e `export type {...} from` não emitem nada, então
        // estes arquivos têm 0 statements e 0 funções: o 0% deles é artefato de
        // medição, e nenhum teste os cobriria. Ficam de fora do denominador em
        // vez de virar uma meta impossível.
        'src/types/**',
        'src/shared/index.ts',
        // Hook de resolução do Node para rodar `.ts` sem bundler (`npm run
        // dev`, `node --import`). Ele é verificado por `node-loader.test.ts`,
        // que roda o Node de verdade em processo filho, mas o V8 não mede
        // cobertura entre processos: manter o arquivo no relatório só faria
        // o número deitar um teste que existe e passa.
        'src/node.loader.ts',
      ],
      // Meta de 95% nos quatro. Subiu de 90% depois da varredura de mutação:
      // ela apontou que os ramos que faltavam eram justamente os de decisão
      // (cofre ausente, arquivo fechado, falha de I/O), e fechar esses buracos
      // é o que transforma a cobertura em afirmação. O que sobra são ramos
      // inalcançáveis por construção, como o `?? ''` depois de um `Math.min`
      // que já prendeu o índice numa tabela de 5 entradas, e um piso de 100%
      // só pediria teste impossível.
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
});
