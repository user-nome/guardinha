// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as privilege from '@zero/main/privilege';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { createVault } from '@zero/main/vault';

const INPUT = {
  masterPassword: 'senha-mestra-guardinha24',
  pin: '49201733',
  recoveryPhrase: 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes',
};

describe('retentativa de criação após setup privilegiado', () => {
  it('devolve a causa explícita de uma falha não relacionada a permissão', async () => {
    vi.spyOn(vaultStorage, 'exists').mockReturnValue(false);
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw new Error('disco indisponível');
    });

    await expect(createVault(INPUT)).resolves.toMatchObject({
      ok: false,
      error: 'disco indisponível',
    });
  });

  it('usa erro interno se a falha de pasta não vier como Error', async () => {
    // Mesmo caminho do teste acima, agora na primeira tentativa: o valor
    // lançado é `unknown` de propósito, e o `instanceof Error` de `vault.ts`
    // precisa absorver isso sem deixar `undefined` (ou o próprio valor) vazar
    // para a mensagem da interface.
    const falhaSemError: unknown = ['sem', 'Error'];
    vi.spyOn(vaultStorage, 'exists').mockReturnValue(false);
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw falhaSemError;
    });

    await expect(createVault(INPUT)).resolves.toMatchObject({
      ok: false,
      error: currentMessages().errors.internal,
    });
  });

  it('usa erro interno se o setup privilegiado falha com valor não Error', async () => {
    const m = currentMessages();
    // o valor lançado é `unknown` de propósito: é a forma de reproduzir a
    // rejeição de baixo nível que o `instanceof Error` de `vault.ts` precisa
    // absorver sem deixar `undefined` vazar para a mensagem da interface
    const falhaSemError: unknown = 'falha sem Error';
    vi.spyOn(vaultStorage, 'exists').mockReturnValue(false);
    vi.spyOn(vaultStorage, 'ensureStructure')
      .mockImplementationOnce(() => {
        throw new Error(m.errors.vaultDirUnavailable);
      })
      .mockImplementationOnce(() => {
        throw falhaSemError;
      });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(true);

    await expect(createVault(INPUT)).resolves.toMatchObject({
      ok: false,
      error: m.errors.internal,
    });
  });

  it('recusa se o cofre aparecer durante a retentativa privilegiada', async () => {
    const m = currentMessages();
    vi.spyOn(vaultStorage, 'exists').mockReturnValueOnce(false).mockReturnValue(true);
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw new Error(m.errors.vaultDirUnavailable);
    });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(true);

    await expect(createVault(INPUT)).resolves.toMatchObject({
      ok: false,
      error: m.errors.vaultExists,
    });
  });

  it('segue para a criação quando a retentativa não acha cofre nenhum', async () => {
    // O outro lado da mesma checagem: `exists()` falso nos dois pontos tem de
    // deixar a criação seguir. A chave é o que prova isso sem pagar três
    // derivações Argon2id: o `createKey` só é chamado depois da recontagem, e
    // um cofre vazio depois do setup privilegiado é um caminho que a suíte
    // nunca exercitou.
    const m = currentMessages();
    const chegouAqui = new Error('a criação seguiu adiante');
    vi.spyOn(vaultStorage, 'exists').mockReturnValue(false);
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw new Error(m.errors.vaultDirUnavailable);
    });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(true);
    vi.spyOn(vaultStorage, 'createKey').mockImplementation(() => {
      throw chegouAqui;
    });

    await expect(createVault(INPUT)).rejects.toBe(chegouAqui);
  });
});
