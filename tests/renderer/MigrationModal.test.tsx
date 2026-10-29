import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MigrationModal } from '@zero/renderer/components/MigrationModal';
import { MessagesProvider } from '@zero/renderer/i18n';
import { UNLOCKED, installApi } from '../mocks/api.ts';
import type { VaultMigrationStatus } from '@zero/types';

const STATUS: VaultMigrationStatus = {
  needed: true,
  fromVersion: 5,
  toVersion: 6,
  methods: ['master', 'pin', 'recovery'],
  entries: 2,
  authTokens: 1,
};

function renderModal(
  onDone = vi.fn<() => Promise<void>>(() => Promise.resolve()),
  onLater = vi.fn<() => void>(),
): { onDone: typeof onDone; onLater: typeof onLater } {
  render(
    <MessagesProvider language="pt-BR">
      <MigrationModal status={STATUS} onDone={onDone} onLater={onLater} />
    </MessagesProvider>,
  );
  return { onDone, onLater };
}

async function fillCredentials(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha mestra'), 'mestra');
  await user.type(screen.getByLabelText('PIN'), '49201733');
  await user.type(screen.getByLabelText('Frase de recuperação'), 'frase de recuperação');
}

describe('MigrationModal', () => {
  it('só libera a ação com todas as credenciais e envia o formulário', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const migrate = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.migrate = migrate;
    const { onDone } = renderModal();

    const action = screen.getByRole('button', { name: /Atualizar cofre/i });
    expect(action).toBeDisabled();
    expect(screen.getByText(/Formato atual: v5/)).toBeInTheDocument();
    expect(screen.getByText(/2 credencial/)).toBeInTheDocument();

    await fillCredentials();
    expect(action).toBeEnabled();
    await user.click(action);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(migrate).toHaveBeenCalledWith({
      master: 'mestra',
      pin: '49201733',
      recovery: 'frase de recuperação',
    });
  });

  it('mostra o erro devolvido pelo main e não fecha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.migrate = vi.fn(() =>
      Promise.resolve({ ok: false, error: 'Senha mestra incorreta.', status: UNLOCKED }),
    );
    const { onDone } = renderModal();

    await fillCredentials();
    await user.click(screen.getByRole('button', { name: /Atualizar cofre/i }));

    expect(await screen.findByText('Senha mestra incorreta.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('cai no erro interno quando a recusa vem sem mensagem', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.migrate = vi.fn(() => Promise.resolve({ ok: false, status: UNLOCKED }));
    renderModal();

    await fillCredentials();
    await user.click(screen.getByRole('button', { name: /Atualizar cofre/i }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra a exceção inesperada sem derrubar a tela', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.migrate = vi.fn(() => Promise.reject(new Error('falha inesperada')));
    renderModal();

    await fillCredentials();
    await user.click(screen.getByRole('button', { name: /Atualizar cofre/i }));

    expect(await screen.findByText('falha inesperada')).toBeInTheDocument();
  });

  it('fecha pelo aviso de "Depois" e pelo botão de fechar', async () => {
    const user = userEvent.setup();
    installApi();
    const { onLater } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Depois' }));
    expect(onLater).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onLater).toHaveBeenCalledTimes(2);
  });
});
