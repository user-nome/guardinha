import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import { createVault, waitForAutoLock } from './support/flows.ts';

/**
 * Trava automática após 2 minutos de ociosidade, ponta a ponta: o temporizador
 * do main zera a chave, avisa o renderer por IPC e a tela volta para o
 * desbloqueio. É o fluxo que nenhum teste de unidade prova junto.
 *
 * O teste dorme dois minutos de verdade (não há costura de relógio no app
 * compilado), então roda como parte da suíte E2E completa, não da fumaça do
 * alvo empacotado.
 */
describe('Auto-lock por ociosidade', () => {
  let app: LaunchedApp | undefined;

  beforeAll(async () => {
    app = await launchBundled();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('bloqueia sozinho depois de dois minutos', async () => {
    if (app === undefined) throw new Error('O app compilado não foi iniciado.');
    await createVault(app.page);
    await waitForAutoLock(app.page);
  }, 300_000);
});
