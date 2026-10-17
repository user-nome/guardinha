import { expect } from 'vitest';
import fs from 'node:fs';
import type { Page } from 'playwright-core';
import { LANGUAGE_LABELS, messages } from '@zero/messages';
import type { LaunchedApp } from './launch.ts';
import { button, clickButton, fillLabel, waitForHeading, waitForText, waitForToast } from './ui.ts';

/**
 * A jornada do usuário, em passos reutilizáveis pelos dois alvos (compilado e
 * empacotado). Cada função dirige a interface por papel acessível e confere um
 * efeito observável (uma tela, um aviso, um item na lista), para que o teste
 * seja a afirmação de que aquele pedaço funciona de ponta a ponta.
 */

const pt = messages('pt-BR');
const en = messages('en');

/** Trava automática do app (`IDLE_LOCK_MS`) com folga para o aviso do main chegar. */
const AUTOLOCK_TIMEOUT_MS = 6 * 60 * 1000;

/** Credenciais do cofre de teste: PIN não previsível e frase de 12 palavras. */
export const VAULT = {
  master: 'Kx7#mQ2v!Zt9@Lp4&Rw6$Bd8',
  pin: '83041927',
  newPin: '52703619',
  panicPin: '51086742',
  phrase: 'cavalo cenoura feira janela montanha rio pedra livro nuvem farol vinho tamancos',
} as const;

export const CREDENTIAL = {
  title: 'Serviço de teste',
  username: 'usuario-teste',
  password: 'S3nh4-Forte!2026',
  domain: 'exemplo.com.br',
} as const;

const SECOND_CREDENTIAL = {
  title: 'Credencial temporária',
  username: 'outro-usuario',
  password: 'Outra-Senha!2026',
  domain: 'outro.exemplo.com.br',
} as const;

const TOTP_ACCOUNT = 'teste@exemplo.com';
const TOTP_URI = `otpauth://totp/Guardinha:${TOTP_ACCOUNT}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Guardinha`;
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export async function createVault(page: Page): Promise<void> {
  await waitForHeading(page, pt.auth.createTitle);
  await fillLabel(page, pt.auth.masterLabel, VAULT.master);
  await fillLabel(
    page,
    pt.auth.masterConfirmLabel,
    `${VAULT.master.slice(0, -1)}${VAULT.master.endsWith('x') ? 'y' : 'x'}`,
  );
  await fillLabel(page, pt.auth.pinLabel, VAULT.pin);
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.auth.masterMismatch);
  await fillLabel(page, pt.auth.masterConfirmLabel, VAULT.master);
  await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill('123');
  await clickButton(page, pt.common.next);
  await waitForText(page, pt.auth.pinInvalid);
  await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill(VAULT.pin);
  await clickButton(page, pt.common.next);
  await waitForHeading(page, pt.auth.recoveryTitle);
  await fillLabel(page, pt.auth.recoveryLabel, VAULT.phrase);
  await fillLabel(page, pt.auth.recoveryConfirmLabel, VAULT.phrase);
  await clickButton(page, pt.auth.createAction);
  // A criação deriva três Argon2id: a espera pelo Início cobre os três.
  await waitForHeading(page, pt.home.title);
  await waitForText(page, pt.home.emptyTitle);
}

export async function addCredential(page: Page): Promise<void> {
  await clickButton(page, pt.home.newEntry);
  await waitForHeading(page, pt.home.modalNew);
  await fillLabel(page, pt.home.titleLabel, CREDENTIAL.title);
  await fillLabel(page, pt.home.usernameLabel, CREDENTIAL.username);
  await fillLabel(page, pt.home.passwordLabel, CREDENTIAL.password);
  await fillLabel(page, pt.home.domainLabel, CREDENTIAL.domain);
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.home.toastSaved);
  await waitForText(page, pt.home.entryCount(1));
  await waitForText(page, CREDENTIAL.title);
}

export async function searchAndEditCredential(page: Page): Promise<void> {
  const search = page.getByPlaceholder(pt.home.searchPlaceholder, { exact: true });
  await search.fill('nao existe');
  await waitForText(page, pt.home.emptyFoundTitle);
  await search.fill(CREDENTIAL.username);
  await waitForText(page, CREDENTIAL.title);
  await search.fill('');

  await page.getByTitle(pt.home.modalEdit, { exact: true }).first().click();
  await waitForHeading(page, pt.home.modalEdit);
  await fillLabel(page, pt.home.titleLabel, 'Serviço atualizado');
  await fillLabel(page, pt.home.notesLabel, 'Edição verificada ponta a ponta.');
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.home.toastSaved);
  await waitForText(page, 'Serviço atualizado');
}

export async function deleteCredential(page: Page): Promise<void> {
  await clickButton(page, pt.home.newEntry);
  await waitForHeading(page, pt.home.modalNew);
  await fillLabel(page, pt.home.titleLabel, SECOND_CREDENTIAL.title);
  await fillLabel(page, pt.home.usernameLabel, SECOND_CREDENTIAL.username);
  await fillLabel(page, pt.home.passwordLabel, SECOND_CREDENTIAL.password);
  await fillLabel(page, pt.home.domainLabel, SECOND_CREDENTIAL.domain);
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.home.toastSaved);
  await waitForText(page, pt.home.entryCount(2));

  const card = page
    .getByText(SECOND_CREDENTIAL.title, { exact: true })
    .locator('..')
    .locator('..')
    .locator('..');
  await card.getByTitle(pt.home.modalEdit, { exact: true }).click();
  await waitForHeading(page, pt.home.modalEdit);
  await clickButton(page, pt.common.delete);
  await clickButton(page, pt.home.deleteConfirm);
  await waitForToast(page, pt.home.toastRemoved);
  await waitForText(page, pt.home.entryCount(1));
  expect(await page.getByText(SECOND_CREDENTIAL.title, { exact: true }).count()).toBe(0);
}

export async function copyCredentialPassword(app: LaunchedApp): Promise<void> {
  await app.page.getByTitle(pt.home.copyPass).click();
  await waitForToast(app.page, pt.app.toastCopied);
  await expectClipboard(app, CREDENTIAL.password);
}

export async function generatePassword(app: LaunchedApp): Promise<void> {
  const { page } = app;
  await clickButton(page, pt.app.nav.generator);
  await waitForHeading(page, pt.generator.title);
  await clickButton(page, pt.generator.generate);
  const copy = page.getByTitle(pt.generator.copyTitle);
  await copy.waitFor({ state: 'visible' });
  const password = (await copy.locator('xpath=..').locator('span').first().innerText()).trim();
  expect(password.length).toBe(24);
  await copy.click();
  await waitForToast(page, pt.generator.toastCopied);
  await expectClipboard(app, password);
}

export async function generatePasswordWithOptions(page: Page): Promise<void> {
  await clickButton(page, pt.app.nav.generator);
  const lengthSlider = page.getByRole('slider', { name: pt.generator.lengthLabel, exact: true });
  await lengthSlider.press('End');
  expect(await lengthSlider.getAttribute('aria-valuenow')).toBe('72');
  await waitForText(page, pt.generator.lengthValue(72));
  await page.getByLabel(pt.generator.upper, { exact: true }).uncheck();
  await page.getByLabel(pt.generator.lower, { exact: true }).uncheck();
  await page.getByLabel(pt.generator.symbols, { exact: true }).uncheck();
  const numbers = page.getByLabel(pt.generator.numbers, { exact: true });
  await numbers.click();
  expect(await numbers.isChecked()).toBe(true);
  const result = page.getByTitle(pt.generator.copyTitle);
  const previousPassword = (
    await result.locator('xpath=..').locator('span').first().innerText()
  ).trim();
  await clickButton(page, pt.generator.generate);
  await expect
    .poll(
      async () => (await result.locator('xpath=..').locator('span').first().innerText()).trim(),
      { timeout: 15_000 },
    )
    .not.toBe(previousPassword);
  const password = (await result.locator('xpath=..').locator('span').first().innerText()).trim();
  expect(password).toMatch(/^\d{72}$/);
}

export async function generatePasswordWithManualOptions(page: Page): Promise<void> {
  const slider = page.getByRole('slider', { name: pt.generator.lengthLabel, exact: true });
  await slider.press('Home');
  for (let step = 0; step < 4; step += 1) await slider.press('PageUp');
  expect(await slider.getAttribute('aria-valuenow')).toBe('40');
  await waitForText(page, pt.generator.lengthValue(40));

  for (const category of [
    pt.generator.upper,
    pt.generator.lower,
    pt.generator.numbers,
    pt.generator.symbols,
  ]) {
    await page.getByLabel(category, { exact: true }).check();
    await page.getByLabel(`${category}: ${pt.generator.quantityCount}`, { exact: true }).fill('3');
  }

  await page.getByLabel(pt.generator.personalWordCount, { exact: true }).fill('2');
  const words = ['Ab', '7!'];
  for (const [index, word] of words.entries()) {
    const placeholder = pt.generator.entropyPlaceholders[index];
    if (placeholder === undefined) throw new Error('Placeholder de palavra pessoal ausente.');
    await page.getByPlaceholder(placeholder, { exact: true }).fill(word);
  }
  await page.getByLabel(pt.generator.includePersonalWords, { exact: true }).check();
  await waitForText(page, pt.generator.manualCharacterUsage(16, 16));

  const result = page.getByTitle(pt.generator.copyTitle);
  const previousPassword = (
    await result.locator('xpath=..').locator('span').first().innerText()
  ).trim();
  await clickButton(page, pt.generator.generate);
  await expect
    .poll(
      async () => (await result.locator('xpath=..').locator('span').first().innerText()).trim(),
      { timeout: 15_000 },
    )
    .not.toBe(previousPassword);

  const password = (await result.locator('xpath=..').locator('span').first().innerText()).trim();
  expect(password).toHaveLength(40);
  expect(password.endsWith(words.join(''))).toBe(true);
  expect(password.match(/[A-Z]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(password.match(/[a-z]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(password.match(/[0-9]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(password.match(/[^a-zA-Z0-9]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);

  await slider.press('PageDown');
  await slider.press('PageDown');
  expect(await slider.getAttribute('aria-valuenow')).toBe('20');
  await waitForText(page, pt.generator.manualCharacterUsage(16, 8));
  await clickButton(page, pt.generator.generate);
  await waitForToast(page, pt.generator.manualLimitExceeded);
  expect((await result.locator('xpath=..').locator('span').first().innerText()).trim()).toBe(
    password,
  );
}

export async function addTotpToken(app: LaunchedApp): Promise<void> {
  const { page } = app;
  await clickButton(page, pt.app.nav.authenticator);
  await waitForHeading(page, pt.authenticator.title);
  await waitForText(page, pt.authenticator.emptyTitle);
  await clickButton(page, pt.authenticator.addToken);
  await waitForHeading(page, pt.authenticator.modalNew);
  await fillLabel(page, pt.authenticator.uriLabel, TOTP_URI);
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.authenticator.toastSaved);
  await waitForText(page, TOTP_ACCOUNT);
  // O código vem pronto do main: a tela só mostra os seis dígitos.
  const code = page.getByText(/^\d{6}$/).first();
  await code.waitFor({ state: 'visible' });
  expect(await code.innerText()).toMatch(/^\d{6}$/);
  await page.getByTitle(pt.common.copy).first().click();
  await waitForToast(page, pt.authenticator.toastCopied);
}

export async function addEditAndRemoveManualToken(page: Page): Promise<void> {
  await clickButton(page, pt.app.nav.authenticator);
  await clickButton(page, pt.authenticator.addToken);
  await waitForHeading(page, pt.authenticator.modalNew);
  await clickButton(page, pt.authenticator.tabManual);
  await page
    .getByPlaceholder(pt.authenticator.secretPlaceholder, { exact: true })
    .fill(TOTP_SECRET);
  await page.getByPlaceholder(pt.authenticator.issuerPlaceholder, { exact: true }).fill('Manual');
  await page
    .getByPlaceholder(pt.authenticator.accountPlaceholder, { exact: true })
    .fill('manual@exemplo.com');
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.authenticator.toastSaved);
  await waitForText(page, 'manual@exemplo.com');
  expect(await page.getByText(/^\d{6}$/).count()).toBe(2);

  const tokenCard = page.getByRole('listitem').filter({ hasText: 'manual@exemplo.com' });
  await tokenCard.getByTitle(pt.authenticator.modalEdit, { exact: true }).click();
  await waitForHeading(page, pt.authenticator.modalEdit);
  await page
    .getByPlaceholder(pt.authenticator.secretPlaceholder, { exact: true })
    .fill(TOTP_SECRET);
  await page
    .getByPlaceholder(pt.authenticator.accountPlaceholder, { exact: true })
    .fill('manual-editado@exemplo.com');
  await clickButton(page, pt.common.save);
  await waitForToast(page, pt.authenticator.toastSaved);
  await waitForText(page, 'manual-editado@exemplo.com');

  const editedCard = page.getByRole('listitem').filter({ hasText: 'manual-editado@exemplo.com' });
  await editedCard.getByTitle(pt.common.delete, { exact: true }).click();
  const confirmation = page
    .getByText(pt.authenticator.deleteConfirm, { exact: true })
    .locator('..');
  await confirmation.getByRole('button', { name: pt.common.delete, exact: true }).click();
  await waitForToast(page, pt.authenticator.toastRemoved);
  expect(await page.getByText('manual-editado@exemplo.com', { exact: true }).count()).toBe(0);
  expect(await page.getByText(/^\d{6}$/).count()).toBe(1);
}

export async function roundTripBackup(app: LaunchedApp): Promise<void> {
  const configureDialogs = app.configureFileDialogs;
  if (configureDialogs === undefined) {
    throw new Error('Diálogos de arquivo não configuráveis neste alvo.');
  }
  const backupPath = app.tempPath('cofre-e2e.gbk');
  await configureDialogs(backupPath, backupPath);
  await clickButton(app.page, pt.app.nav.backup);
  await waitForHeading(app.page, pt.backup.title);
  await clickButton(app.page, pt.backup.exportAction);
  await waitForToast(app.page, pt.backup.toastBackup(backupPath));
  expect(fs.readFileSync(backupPath).subarray(0, 8).toString('ascii')).toBe('ZKBACKUP');

  await clickButton(app.page, pt.backup.restoreAction);
  await waitForText(app.page, pt.backup.restoreConfirmTitle);
  await clickButton(app.page, pt.backup.restoreConfirmAction);
  await waitForToast(app.page, pt.backup.toastRestored(3));
  await waitForHeading(app.page, pt.auth.unlockTitle);
  await unlockVault(app.page, VAULT.pin);
  await waitForText(app.page, 'Serviço atualizado');
  await clickButton(app.page, pt.app.nav.authenticator);
  await waitForHeading(app.page, pt.authenticator.title);
  await waitForText(app.page, TOTP_ACCOUNT);
}

export async function visitCredits(page: Page): Promise<void> {
  await clickButton(page, pt.app.nav.credits);
  await waitForHeading(page, pt.attributions.title);
  await waitForText(page, pt.attributions.footer);
}

export async function confirmDestroyRequiresExactWord(page: Page): Promise<void> {
  await page.getByTitle(pt.panic.manualTitle, { exact: true }).click();
  await waitForHeading(page, pt.panic.title);
  const confirmInput = page.getByLabel(pt.panic.confirmNameLabel, { exact: true });
  const destroy = button(page, pt.panic.action);
  expect(await destroy.isDisabled()).toBe(true);
  await confirmInput.fill('destruir');
  await waitForText(page, pt.panic.confirmMismatch);
  expect(await destroy.isDisabled()).toBe(true);
  await clickButton(page, pt.common.cancel);
  await waitForHeading(page, pt.attributions.title);
}

export async function unlockWithMaster(page: Page): Promise<void> {
  await lockVault(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill('00000000');
    await clickButton(page, pt.auth.unlockAction);
    await expect
      .poll(() => button(page, pt.auth.unlockAction).isEnabled(), { timeout: 75_000 })
      .toBe(true);
  }
  await waitForText(page, pt.auth.masterAvailable);
  await clickButton(page, pt.auth.tabMaster);
  await page.getByPlaceholder(pt.auth.masterPlaceholder, { exact: true }).fill(VAULT.master);
  await clickButton(page, pt.auth.unlockAction);
  await waitForHeading(page, pt.home.title);
}

export async function triggerPanicPin(page: Page): Promise<void> {
  await openSettings(page);
  await page.locator('#panic-pin').fill(VAULT.panicPin);
  await page.locator('#panic-pin-confirm').fill(VAULT.panicPin);
  await clickButton(page, pt.settings.panicSet);
  await waitForText(page, pt.settings.panicActive);
  await lockVault(page);
  await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill(VAULT.panicPin);
  await clickButton(page, pt.auth.unlockAction);
  await waitForHeading(page, pt.home.title);
  await waitForText(page, pt.home.emptyTitle);
}

export async function configurePanicPin(page: Page): Promise<void> {
  await openSettings(page);
  await page.locator('#panic-pin').fill(VAULT.panicPin);
  await page.locator('#panic-pin-confirm').fill(VAULT.panicPin);
  await clickButton(page, pt.settings.panicSet);
  // O PIN de coação embrulha a chave de novo: paga um Argon2id de 256 MiB.
  await waitForText(page, pt.settings.panicActive);
}

export async function clearPanicPin(page: Page): Promise<void> {
  await clickButton(page, pt.settings.panicClear);
  await waitForText(page, pt.settings.panicInactive);
}

export async function setNukeLimit(page: Page): Promise<void> {
  await openSettings(page);
  await clickButton(page, pt.settings.nukeEnable);
  await page.locator('#nuke-limit-confirm').fill('60');
  await clickButton(page, pt.settings.nukeEnable);
  await waitForText(page, pt.settings.nukeValue(60));
}

export async function disableNukeLimit(page: Page): Promise<void> {
  await clickButton(page, pt.settings.nukeDisable);
  await waitForText(page, pt.settings.nukeOff);
}

export async function toEnglish(page: Page): Promise<void> {
  await changeLanguage(page, pt.app.languageLabel, LANGUAGE_LABELS.en);
  await waitForText(page, en.app.nav.home);
}

export async function toPortuguese(page: Page): Promise<void> {
  await changeLanguage(page, en.app.languageLabel, LANGUAGE_LABELS['pt-BR']);
  await waitForText(page, pt.app.nav.home);
}

export async function lockVault(page: Page): Promise<void> {
  await clickButton(page, pt.app.lock);
  await waitForHeading(page, pt.auth.unlockTitle);
}

export async function unlockVault(page: Page, pin: string): Promise<void> {
  await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill(pin);
  await clickButton(page, pt.auth.unlockAction);
  try {
    await waitForHeading(page, pt.home.title, 45_000);
  } catch (error) {
    const headings = await page.getByRole('heading').allInnerTexts();
    throw new Error(`O desbloqueio não chegou à Home. Títulos atuais: ${headings.join(', ')}`, {
      cause: error,
    });
  }
}

export async function resetVaultPin(page: Page): Promise<void> {
  await clickButton(page, pt.auth.forgotPin);
  await waitForHeading(page, pt.auth.resetTitle);
  await fillLabel(page, pt.auth.recoveryLabel, VAULT.phrase);
  await fillLabel(page, pt.auth.newPinLabel, VAULT.newPin);
  await fillLabel(page, pt.auth.newPinConfirmLabel, VAULT.newPin);
  await clickButton(page, pt.auth.resetAction);
  await waitForHeading(page, pt.home.title);
}

/** Só observável no alvo compilado, que enxerga o clipboard do main. */
export async function waitForAutoLock(page: Page): Promise<void> {
  await waitForHeading(page, pt.auth.unlockTitle, AUTOLOCK_TIMEOUT_MS);
}

async function openSettings(page: Page): Promise<void> {
  await clickButton(page, pt.app.nav.settings);
  await waitForHeading(page, pt.settings.title);
}

async function changeLanguage(page: Page, currentLabel: string, nextLabel: string): Promise<void> {
  await button(page, currentLabel).click();
  await page.getByRole('option', { name: nextLabel, exact: true }).click();
}

async function expectClipboard(app: LaunchedApp, expected: string): Promise<void> {
  const read = app.readClipboard;
  if (read === undefined) return;
  await expect.poll(() => read()).toBe(expected);
}
