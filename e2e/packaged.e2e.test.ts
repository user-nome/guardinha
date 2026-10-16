import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchPackaged, resolvePackagedBinary } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import {
  addCredential,
  copyCredentialPassword,
  createVault,
  lockVault,
  unlockVault,
  VAULT,
} from './support/flows.ts';

/**
 * Fumaça contra o payload do `.deb`, para provar que o artefato que o usuário
 * instala abre e faz o essencial. O pacote não expõe a main ao runner (o
 * fusível `enableNodeCliInspectArguments` está desligado), então aqui a conexão
 * é por CDP: `readClipboard` não existe e a verificação do clipboard fica só
 * no aviso da tela.
 *
 * A suíte é pulada com um aviso quando nada foi empacotado ainda; rode
 * `npm run dist:dir` (ou `npm run dist`) antes de `npm run test:e2e`.
 */
const binary = resolvePackagedBinary();

if (binary === null) {
  console.warn('[e2e] Nada empacotado em release/: a suíte do .deb foi pulada.');
}

describe.runIf(binary !== null)('Payload do .deb', () => {
  let app: LaunchedApp | undefined;

  function current(): LaunchedApp {
    if (app === undefined) throw new Error('O app empacotado não foi iniciado.');
    return app;
  }

  beforeAll(async () => {
    if (binary === null) throw new Error('Binário empacotado não encontrado.');
    app = await launchPackaged(binary);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('cria o cofre', async () => {
    await createVault(current().page);
  });

  it('adiciona uma credencial', async () => {
    await addCredential(current().page);
  });

  it('copia a senha da credencial', async () => {
    await copyCredentialPassword(current());
  });

  it('bloqueia e desbloqueia com o PIN', async () => {
    await lockVault(current().page);
    await unlockVault(current().page, VAULT.pin);
  });
});
