import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messages } from '@zero/messages';
import { openManifest, unpackVaultContainer } from '@zero/main/container';
import { MANIFEST_VERSION, VAULT_VERSION } from '@zero/main/container-format';
import { launchBundled } from './support/launch.ts';
import type { LaunchedApp } from './support/launch.ts';
import { LEGACY_AUTH, LEGACY_ENTRY, seedLegacyVault } from './support/legacy.ts';
import { VAULT, lockVault, unlockVault } from './support/flows.ts';
import { clickButton, fillLabel, waitForHeading, waitForText, waitForToast } from './support/ui.ts';

const pt = messages('pt-BR');

/**
 * Jornada de atualização do app sobre um cofre v5.
 *
 * O cofre é semeado antes da janela abrir (`seedLegacyVault`), porque o app
 * atual nunca grava a v5. O teste cobre o que só aparece com o binário real:
 * login sem promoção silenciosa, aviso, adiamento, recusa de credencial e
 * migração completa com credenciais e registros preservados.
 */
describe('Migração explícita de um cofre v5', () => {
  let app: LaunchedApp | undefined;
  let vaultKey: Buffer | undefined;

  function current(): LaunchedApp {
    if (app === undefined) throw new Error('O app compilado não foi iniciado.');
    return app;
  }

  function containerOnDisk(): ReturnType<typeof unpackVaultContainer> {
    return unpackVaultContainer(fs.readFileSync(current().tempPath('vault/vault.zkv')));
  }

  beforeAll(async () => {
    app = await launchBundled({
      prepare: async (temp) => {
        vaultKey = await seedLegacyVault(temp);
      },
    });
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  it('abre a v5 sem migrar, mostra o aviso e aceita adiar', async () => {
    const { page } = current();
    await unlockVault(page, VAULT.pin);
    await waitForHeading(page, pt.migration.title);
    await waitForText(page, pt.migration.version(5, VAULT_VERSION));

    // o login não promove nada: o formato antigo continua no disco
    const untouched = containerOnDisk();
    expect(untouched.ok).toBe(true);
    if (untouched.ok) expect(untouched.data.version).toBe(5);

    await clickButton(page, pt.migration.later);
    await waitForText(page, LEGACY_ENTRY.title);
    expect(await page.getByRole('heading', { name: pt.migration.title }).count()).toBe(0);

    // adiar não é migrar: o aviso volta no próximo desbloqueio
    await lockVault(page);
    await unlockVault(page, VAULT.pin);
    await waitForHeading(page, pt.migration.title);
  });

  it('recusa a credencial errada sem fechar o aviso nem tocar no cofre', async () => {
    const { page } = current();
    await fillLabel(page, pt.migration.masterLabel, `${VAULT.master}x`);
    await fillLabel(page, pt.migration.pinLabel, VAULT.pin);
    await fillLabel(page, pt.migration.recoveryLabel, VAULT.phrase);
    await clickButton(page, pt.migration.action);

    await waitForText(page, pt.errors.wrongMaster);
    await waitForHeading(page, pt.migration.title);
    const untouched = containerOnDisk();
    expect(untouched.ok).toBe(true);
    if (untouched.ok) expect(untouched.data.version).toBe(5);
  });

  it('migra com as credenciais e preserva credencial e token de 2FA', async () => {
    const { page } = current();
    await fillLabel(page, pt.migration.masterLabel, VAULT.master);
    await clickButton(page, pt.migration.action);

    await waitForToast(page, pt.migration.success);
    await waitForText(page, LEGACY_ENTRY.title);

    const migrated = containerOnDisk();
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.data.version).toBe(VAULT_VERSION);
    const manifest = migrated.data.manifest;
    expect(manifest).not.toBeNull();
    if (manifest !== null && vaultKey !== undefined) {
      expect(openManifest(vaultKey, manifest).version).toBe(MANIFEST_VERSION);
    }

    await clickButton(page, pt.app.nav.authenticator);
    await waitForHeading(page, pt.authenticator.title);
    await waitForText(page, LEGACY_AUTH.account);
    const code = page.getByText(/^\d{6}$/).first();
    await code.waitFor({ state: 'visible' });
    expect(await code.innerText()).toMatch(/^\d{6}$/);
  });

  it('não pede migração de novo depois que o cofre está na v6', async () => {
    const { page } = current();
    await lockVault(page);
    await unlockVault(page, VAULT.pin);
    await waitForText(page, LEGACY_ENTRY.title);
    await page.waitForTimeout(1500);
    expect(await page.getByRole('heading', { name: pt.migration.title }).count()).toBe(0);
  });

  it('mantém o PIN de coação legado funcionando depois da migração', async () => {
    const { page } = current();
    await lockVault(page);
    await page.getByPlaceholder(pt.auth.pinPlaceholder, { exact: true }).fill(VAULT.panicPin);
    await clickButton(page, pt.auth.unlockAction);
    await waitForHeading(page, pt.home.title);
    await waitForText(page, pt.home.emptyTitle);
    expect(fs.existsSync(current().tempPath('vault/vault.zkv'))).toBe(false);
  });
});
