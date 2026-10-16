import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import {
  addCredential,
  addTotpToken,
  clearPanicPin,
  configurePanicPin,
  copyCredentialPassword,
  createVault,
  disableNukeLimit,
  generatePassword,
  lockVault,
  resetVaultPin,
  setNukeLimit,
  toEnglish,
  toPortuguese,
  unlockVault,
  VAULT,
} from './support/flows.ts';

/**
 * Jornada completa contra o app compilado (`out/`), subido pelo Playwright.
 *
 * Os passos compartilham um único cofre: criar é o que deriva três Argon2id
 * (uns 45 s), então os passos seguintes só reabrem e usam o mesmo cofre. A
 * ordem importa e é de propósito: é a jornada de quem instala e usa o app.
 */
describe('App compilado (out/)', () => {
  let app: LaunchedApp | undefined;

  function current(): LaunchedApp {
    if (app === undefined) throw new Error('O app compilado não foi iniciado.');
    return app;
  }

  beforeAll(async () => {
    app = await launchBundled();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('cria o cofre com senha mestra, PIN e frase', async () => {
    await createVault(current().page);
  });

  it('adiciona uma credencial e a vê na lista', async () => {
    await addCredential(current().page);
  });

  it('copia a senha da credencial', async () => {
    await copyCredentialPassword(current());
  });

  it('gera e copia uma senha', async () => {
    await generatePassword(current());
  });

  it('adiciona um token de 2FA e lê o código', async () => {
    await addTotpToken(current());
  });

  it('define e remove o PIN de coação', async () => {
    await configurePanicPin(current().page);
    await clearPanicPin(current().page);
  });

  it('liga e desliga a autodestruição por tentativas', async () => {
    await setNukeLimit(current().page);
    await disableNukeLimit(current().page);
  });

  it('troca o idioma e volta para o português', async () => {
    await toEnglish(current().page);
    await toPortuguese(current().page);
  });

  it('bloqueia e desbloqueia com o PIN', async () => {
    await lockVault(current().page);
    await unlockVault(current().page, VAULT.pin);
  });

  it('redefine o PIN pela frase de recuperação', async () => {
    // A frase só aparece na tela de bloqueio: é de lá que se redefine.
    await lockVault(current().page);
    await resetVaultPin(current().page);
    await lockVault(current().page);
    await unlockVault(current().page, VAULT.newPin);
  });
});
