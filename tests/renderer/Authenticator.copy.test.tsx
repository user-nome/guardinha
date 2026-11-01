import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Authenticator } from '@zero/renderer/components/Authenticator';
import { installApi } from '../mocks/api.ts';
import type { AuthCode, AuthToken } from '@zero/types';

const TOKEN_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const testToken: AuthToken = {
  id: TOKEN_ID,
  issuer: 'GitHub',
  account: 'alice@github.com',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  createdAt: 1,
  updatedAt: 1,
};

function testCode(remainingMs: number): AuthCode {
  return { id: TOKEN_ID, code: '071271', remainingMs };
}

function renderScreen(onToast = vi.fn()): void {
  render(
    <MessagesProvider language="pt-BR">
      <Authenticator onToast={onToast} />
    </MessagesProvider>,
  );
}

describe('confirmação de cópia do token 2FA', () => {
  it('confirma antes de copiar e avisa que o código expira', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [testToken] });
    api.authenticator.codes = () => Promise.resolve([testCode(25_000)]);
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    const onToast = vi.fn();
    renderScreen(onToast);

    await screen.findByText('071271');
    await user.click(screen.getByTitle('Copiar'));

    expect(copy).not.toHaveBeenCalled();
    expect(
      screen.getByRole('alertdialog', { name: 'Confirme antes de copiar o código' }),
    ).toHaveTextContent('O clipboard será limpo em 10 segundos.');
    await user.click(screen.getByRole('button', { name: 'Copiar código mesmo assim' }));

    expect(copy).toHaveBeenCalledWith('071271');
    expect(onToast).toHaveBeenCalledWith('Código copiado. Ele expira em poucos segundos.');
  });

  it('cancela sem usar o clipboard', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [testToken] });
    api.authenticator.codes = () => Promise.resolve([testCode(25_000)]);
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    renderScreen();

    await screen.findByText('071271');
    await user.click(screen.getByTitle('Copiar'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(copy).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('não copia um código que expirou enquanto aguardava confirmação', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [testToken] });
    api.authenticator.codes = () => Promise.resolve([testCode(0)]);
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );

    await screen.findByText('071271');
    await user.click(screen.getByTitle('Copiar'));
    await user.click(screen.getByRole('button', { name: 'Copiar código mesmo assim' }));

    expect(copy).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      'Este código expirou. Aguarde o próximo código e tente novamente.',
    );
  });

  it('avisa quando a cópia confirmada falha', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [testToken] });
    api.authenticator.codes = () => Promise.resolve([testCode(25_000)]);
    api.clipboard.copy = vi.fn().mockRejectedValue(new Error('sem área de transferência'));
    const onToast = vi.fn();
    renderScreen(onToast);

    await screen.findByText('071271');
    await user.click(screen.getByTitle('Copiar'));
    await user.click(screen.getByRole('button', { name: 'Copiar código mesmo assim' }));

    expect(onToast).toHaveBeenCalledWith('sem área de transferência');
  });
});
