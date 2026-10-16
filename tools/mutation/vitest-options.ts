import type { TestUserConfig } from 'vitest/config';

/**
 * Opções de Vitest que a varredura de mutação troca em relação à suíte normal.
 *
 * Vive num módulo à parte, e não dentro de `vitest.mutation.config.mts`, por
 * dois motivos: o objeto fica tipado (o `mergeConfig` devolve `any`, o que
 * impediria o teste de conferir a garantia sem cast), e a garantia de `test`
 * deixa de depender de alguém lembrar de abrir a config certa.
 */
export const MUTATION_TEST_OPTIONS = {
  /**
   * O `fsModuleCache` do Vitest guarda o módulo já transformado em
   * `node_modules/.vitest-cache`, indexado pelo id do arquivo. Essa chave não
   * enxerga o mutante que o plugin injeta, então o cache deixado pelo mutante
   * anterior era revalidado como válido e o mutante atual **não entrava na
   * execução**: a suíte rodava contra o texto do mutante anterior, passava, e o
   * veredito saía `survived`. Só o primeiro mutante de cada arquivo era medido
   * de verdade, e o score caía sozinho conforme a varredura avançava.
   */
  fsModuleCache: false,
  coverage: {
    // A varredura só liga a cobertura para montar a matriz arquivo de teste →
    // linhas de `src/` que ele toca (ver `matrix.ts`). Um arquivo de teste
    // sozinho nunca bate o limiar de 90%, que é da suíte inteira, então os
    // limiares vão a zero aqui.
    enabled: false,
    thresholds: { lines: 0, statements: 0, functions: 0, branches: 0 },
  },
} satisfies TestUserConfig;
