import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@zero/renderer/App';
import { LOCKED, NO_MIGRATION, UNLOCKED, installApi } from '../mocks/api.ts';
import type { VaultMigrationStatus } from '@zero/types';

const MIGRATION: VaultMigrationStatus = {
  needed: true,
  fromVersion: 5,
  toVersion: 6,
  methods: ['master', 'pin', 'recovery'],
  entries: 1,
  authTokens: 0,
};

describe('App: aviso de migração do cofre', () => {
  it('abre o aviso depois do login e aceita adiar', async () => {
    const user = userEvent.setup();
    installApi({ status: UNLOCKED, migration: MIGRATION });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Atualizar o cofre' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Depois' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Atualizar o cofre' })).not.toBeInTheDocument();
    });
  });

  it('migra com as credenciais, atualiza o status e avisa no toast', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED, migration: MIGRATION });
    const migrate = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.migrate = migrate;
    const migrationStatus = vi
      .fn()
      .mockResolvedValueOnce(MIGRATION)
      .mockResolvedValue(NO_MIGRATION);
    api.vault.migrationStatus = migrationStatus;

    render(<App />);
    await screen.findByRole('heading', { name: 'Atualizar o cofre' });

    await user.type(screen.getByLabelText('Senha mestra'), 'mestra');
    await user.type(screen.getByLabelText('PIN'), '49201733');
    await user.type(screen.getByLabelText('Frase de recuperação'), 'frase');
    await user.click(screen.getByRole('button', { name: /Atualizar cofre/i }));

    expect(await screen.findByText('Cofre atualizado.')).toBeInTheDocument();
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrationStatus).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Atualizar o cofre' })).not.toBeInTheDocument();
    });
  });

  it('não consulta a migração enquanto o cofre está bloqueado', async () => {
    const api = installApi({ status: LOCKED, migration: MIGRATION });
    const migrationStatus = vi.fn().mockResolvedValue(MIGRATION);
    api.vault.migrationStatus = migrationStatus;

    render(<App />);
    await screen.findByRole('button', { name: /Desbloquear/i });

    expect(migrationStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Atualizar o cofre' })).not.toBeInTheDocument();
  });

  it('falha ao consultar a migração fica no log e não esconde o cofre', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const api = installApi({ status: UNLOCKED });
      api.vault.migrationStatus = vi.fn().mockRejectedValue(new Error('falha ao consultar'));

      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Senhas' })).toBeInTheDocument();
      await waitFor(() => expect(error).toHaveBeenCalled());
    } finally {
      error.mockRestore();
    }
  });
});
