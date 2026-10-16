import type { Locator, Page } from 'playwright-core';

/**
 * Atalhos de seleção sobre a interface composta.
 *
 * Tudo aqui casa por papel acessível (`getByRole`, `getByLabel`) ou por
 * `title`, nunca por classe: a classe é apresentação e muda com o tema. Os
 * textos vêm de `@zero/messages`, a mesma fonte que a tela usa, para o seletor
 * não virar uma segunda cópia da mensagem.
 */

/** Passo que dispara Argon2id (criar, desbloquear, redefinir) pode passar de um minuto. */
const STEP_TIMEOUT_MS = 180_000;
const TOAST_TIMEOUT_MS = 15_000;

export function button(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

export async function clickButton(page: Page, name: string): Promise<void> {
  await button(page, name).click();
}

export async function fillLabel(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(value);
}

export async function waitForHeading(
  page: Page,
  name: string,
  timeout = STEP_TIMEOUT_MS,
): Promise<void> {
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible', timeout });
}

export async function waitForText(
  page: Page,
  text: string,
  timeout = STEP_TIMEOUT_MS,
): Promise<void> {
  await page.getByText(text).first().waitFor({ state: 'visible', timeout });
}

export async function waitForToast(page: Page, message: string): Promise<void> {
  await page
    .getByText(message, { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: TOAST_TIMEOUT_MS });
}
