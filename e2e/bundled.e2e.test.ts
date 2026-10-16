import { afterAll, beforeAll, describe, it } from 'vitest';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import {
  addCredential,
  addEditAndRemoveManualToken,
  addTotpToken,
  clearPanicPin,
  confirmDestroyRequiresExactWord,
  configurePanicPin,
  copyCredentialPassword,
  createVault,
  deleteCredential,
  disableNukeLimit,
  generatePassword,
  generatePasswordWithOptions,
  lockVault,
  roundTripBackup,
  resetVaultPin,
  searchAndEditCredential,
  setNukeLimit,
  toEnglish,
  toPortuguese,
  triggerPanicPin,
  unlockVault,
  unlockWithMaster,
  visitCredits,
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

  it('busca e edita uma credencial', async () => {
    await searchAndEditCredential(current().page);
  });

  it('adiciona e exclui uma credencial com confirmação', async () => {
    await deleteCredential(current().page);
  });

  it('copia a senha da credencial', async () => {
    await copyCredentialPassword(current());
  });

  it('gera e copia uma senha', async () => {
    await generatePassword(current());
  });

  it('respeita comprimento, categorias e a última categoria ativa no gerador', async () => {
    await generatePasswordWithOptions(current().page);
  });

  it('adiciona um token de 2FA e lê o código', async () => {
    await addTotpToken(current());
  });

  it('cria, edita e exclui um token manual de 2FA', async () => {
    await addEditAndRemoveManualToken(current().page);
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

  it('abre a tela de atribuições', async () => {
    await visitCredits(current().page);
  });

  it('não destrói o cofre sem a palavra exata de confirmação', async () => {
    await confirmDestroyRequiresExactWord(current().page);
  });

  it('exporta e restaura o backup completo', async () => {
    await roundTripBackup(current());
  });

  it('bloqueia e desbloqueia com o PIN', async () => {
    await lockVault(current().page);
    await unlockVault(current().page, VAULT.pin);
  });

  it('também desbloqueia com a senha mestra', async () => {
    await unlockWithMaster(current().page);
  });

  it('redefine o PIN pela frase de recuperação', async () => {
    // A frase só aparece na tela de bloqueio: é de lá que se redefine.
    await lockVault(current().page);
    await resetVaultPin(current().page);
    await lockVault(current().page);
    await unlockVault(current().page, VAULT.newPin);
  });

  it('abre o cofre decoy e destrói os dados pelo PIN de coação', async () => {
    await triggerPanicPin(current().page);
  });
});
