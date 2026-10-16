import { expect } from 'vitest';
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

const TOTP_ACCOUNT = 'teste@exemplo.com';
const TOTP_URI = `otpauth://totp/Guardinha:${TOTP_ACCOUNT}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Guardinha`;

export async function createVault(page: Page): Promise<void> {
  await waitForHeading(page, pt.auth.createTitle);
  await fillLabel(page, pt.auth.masterLabel, VAULT.master);
  await fillLabel(page, pt.auth.masterConfirmLabel, VAULT.master);
  await fillLabel(page, pt.auth.pinLabel, VAULT.pin);
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
  await waitForHeading(page, pt.home.title);
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
