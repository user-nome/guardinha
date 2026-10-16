import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * O padrão do Testing Library para `findBy` é 1 s, calibrado para um teste de
 * componente isolado. Aqui os arquivos do `main` derivam chaves com Argon2id de
 * produção (128 MiB e 256 MiB) e a suíte tem 888 testes rodando em paralelo, o
 * que faz um IPC que responde em milissegundos levar segundos quando a máquina
 * está ocupada. Subir o teto **aqui** resolve de uma vez, em vez de espalhar
 * `timeout:` por teste e esquecer algum.
 *
 * O custo é zero no caminho feliz: `findBy` resolve no primeiro passe em que o
 * elemento aparece, e o teto só entra quando a espera é mesmo longa, que é o
 * caso de falha, onde a mensagem de erro continua igual.
 */
configure({ asyncUtilTimeout: 15_000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
