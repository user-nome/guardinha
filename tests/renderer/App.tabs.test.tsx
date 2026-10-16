import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@zero/renderer/App';
import {
  LOCKED,
  UNLOCKED,
  autoLockedListeners,
  installApi,
  unsubscribeAutoLock,
} from '../mocks/api.ts';
import type { AppSettings, AuthToken } from '@zero/types';

/**
 * O `App` é o roteador das telas e o dono de duas decisões que valem teste:
 * cofre bloqueado ou inexistente leva ao `AuthModal`, e o evento de auto-lock
 * do main devolve o renderer para a autenticação sem esperar o polling.
 */

const TOKEN: AuthToken = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  issuer: 'GitHub',
  account: 'alice@github.com',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  createdAt: 1,
  updatedAt: 1,
};

describe('App: navegação entre abas', () => {
  it('abre no Início e troca para o gerador de senha', async () => {
    const user = userEvent.setup();
    installApi({ status: UNLOCKED });

    render(<App />);
    // `Home` começa em "abrendo o cofre" e só mostra o heading depois da
    // lista; sob a suíte inteira rodando em paralelo esse IPC passa do segundo
    // padrão do Testing Library. O limite alto só custa tempo no caminho da
    // falha: enquanto o heading não aparece, a espera continua.
    await screen.findByRole('heading', { name: 'Senhas' }, { timeout: 15_000 });

    await user.click(screen.getByRole('button', { name: 'Gerador de Senhas' }));
    expect(await screen.findByRole('heading', { name: 'Gerador de Senhas' })).toBeInTheDocument();
  });

  it('tem aba própria para o verificador de 2FA', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED, tokens: [TOKEN] });
    api.authenticator.codes = () =>
      Promise.resolve([{ id: TOKEN.id, code: '071271', remainingMs: 25_000 }]);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Verificador 2FA' }));

    expect(await screen.findByRole('heading', { name: 'Verificador 2FA' })).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('abre os créditos e volta ao início', async () => {
    const user = userEvent.setup();
    installApi({ status: UNLOCKED });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Atribuições' }));
    expect(await screen.findByRole('heading', { name: 'ATRIBUIÇÕES' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Início (Senhas)' }));
    expect(await screen.findByRole('heading', { name: 'Senhas' })).toBeInTheDocument();
  });

  it('abre as configurações', async () => {
    const user = userEvent.setup();
    installApi({ status: UNLOCKED });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Configurações' }));

    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
  });
});

describe('App: bloqueio do cofre', () => {
  it('bloqueia pela barra lateral e volta para a autenticação', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    const lock = vi.fn(() => Promise.resolve(LOCKED));
    api.vault.lock = lock;
    api.vault.status = vi.fn().mockResolvedValueOnce(UNLOCKED).mockResolvedValue(LOCKED);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Bloquear cofre' }));

    await waitFor(() => {
      expect(api.vault.status).toHaveBeenCalled();
    });
    expect(await screen.findByText('Cofre bloqueado')).toBeInTheDocument();
  });

  it('volta para a autenticação quando o main avisa o auto-lock', async () => {
    const api = installApi({ status: UNLOCKED });
    // o evento não traz o estado pronto: o App reconsulta o status, como faz
    // com o polling de segurança
    api.vault.status = vi.fn().mockResolvedValueOnce(UNLOCKED).mockResolvedValue(LOCKED);
    render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });

    // o observador do main empurra o status novo; o App reconsulta
    expect(autoLockedListeners).toHaveLength(1);
    for (const listener of autoLockedListeners) listener(LOCKED);
    await waitFor(() => {
      expect(screen.getByText('Cofre bloqueado')).toBeInTheDocument();
    });
  });

  it('cancela a assinatura do auto-lock ao desmontar', async () => {
    installApi({ status: UNLOCKED });
    const { unmount } = render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });

    unmount();

    // sem o cancelamento, o listener continuaria segurando o componente morto
    expect(unsubscribeAutoLock).toHaveBeenCalled();
  });
});

describe('App: idioma', () => {
  it('começa no idioma salvo e troca pelo seletor da barra lateral', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED, language: 'pt-BR' });
    const set = vi.fn((next: AppSettings) => Promise.resolve(next));
    api.settings.set = set;

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Idioma' }));
    await user.click(await screen.findByText('English'));

    expect(set).toHaveBeenCalledWith({ language: 'en' });
    expect(await screen.findByRole('heading', { name: 'Passwords' })).toBeInTheDocument();
  });

  it('abre direto no inglês quando esse é o idioma salvo', async () => {
    installApi({ status: UNLOCKED, language: 'en' });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Passwords' })).toBeInTheDocument();
  });

  it('registra a falha ao consultar o cofre sem quebrar a tela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = installApi();
    api.vault.status = vi.fn().mockRejectedValue(new Error('sem canal'));
    api.settings.get = vi.fn().mockRejectedValue(new Error('sem canal'));

    render(<App />);

    // o App fica em "verificando o cofre": falha de status não vira tela de erro
    expect(await screen.findByText('Verificando o cofre…')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
