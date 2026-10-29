import { defineConfig } from 'vitest/config';
import { aliases } from './vitest.config.mts';

/**
 * Configuração dos testes ponta a ponta (E2E).
 *
 * Diferente da suíte de `tests/**`, aqui o teste não importa o `src/` para
 * dirigir a interface: ele sobe o app já compilado (`out/`, via Playwright) ou
 * o payload do `.deb` (via CDP) e dirige os fluxos por um navegador. A exceção
 * é a fixture de cofre v5 (`e2e/support/legacy.ts`), que usa os módulos de
 * formato do `src/` só para semear o disco antes de a janela abrir. Por isso o
 * ambiente é `node` (nada de jsdom) e há um worker só: os dois alvos disputam
 * o lock de instância única do Electron e portas de depuração, então não podem
 * rodar em paralelo.
 *
 * O mapa de aliases vem de `vitest.config.mts` (a fonte única do `npm test`)
 * em vez de ser reescrito: `@zero/messages` é o que os fluxos usam para casar
 * com os textos da tela.
 */
const e2eAliases = Object.fromEntries(
  // O E2E precisa do Electron de verdade (o Playwright o lança por conta
  // própria), então o alias de mock do `electron` sai fora do mapa.
  Object.entries(aliases).filter(([name]) => name !== 'electron'),
);

export default defineConfig({
  resolve: {
    alias: e2eAliases,
  },
  test: {
    name: 'guardinha-e2e',
    root: import.meta.dirname,
    environment: 'node',
    pool: 'forks',
    // Um worker só, sem paralelismo entre arquivos: os alvos disputam o lock
    // de instância única do Electron e portas de depuração.
    maxWorkers: 1,
    fileParallelism: false,
    include: ['e2e/**/*.e2e.test.ts'],
    // Criar um cofre deriva três Argon2id (128 e 256 MiB) e um desbloqueio
    // paga o de 256 MiB: sob carga, um passo passa de um minuto.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
