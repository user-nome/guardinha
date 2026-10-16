import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import { createVault, waitForAutoLock } from './support/flows.ts';

/**
 * Trava automática após 5 minutos de ociosidade, ponta a ponta: o temporizador
 * do main zera a chave, avisa o renderer por IPC e a tela volta para o
 * desbloqueio. É o fluxo que nenhum teste de unidade prova junto.
 *
 * Fora do padrão porque o teste dorme cinco minutos de verdade (não há
 * costura de relógio no app empacotado). Rode com `GUARDINHA_E2E_AUTOLOCK=1`
 * quando quiser medir; no CI fica de fora do caminho de pull request.
 */
const enabled = process.env.GUARDINHA_E2E_AUTOLOCK === '1';

if (!enabled) {
  console.warn('[e2e] Auto-lock pulado: defina GUARDINHA_E2E_AUTOLOCK=1 para rodar.');
}

describe.runIf(enabled)('Auto-lock por ociosidade', () => {
  let app: LaunchedApp | undefined;

  beforeAll(async () => {
    app = await launchBundled();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('bloqueia sozinho depois de cinco minutos', async () => {
    if (app === undefined) throw new Error('O app compilado não foi iniciado.');
    await createVault(app.page);
    await waitForAutoLock(app.page);
  }, 420_000);
});
