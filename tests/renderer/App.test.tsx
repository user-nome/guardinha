import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@zero/renderer/App';
import { autoLockedListeners, LOCKED, UNLOCKED, installApi } from '../mocks/api.ts';
import type { Credential } from '@zero/types';

const ENTRY: Credential = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'GitHub',
  username: 'otaku-delirante',
  password: 's3nh@-forte',
  domain: 'github.com',
  notes: '',
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000,
};

describe('App', () => {
  it('mostra o desbloqueio só com o PIN quando não houve falhas', async () => {
    installApi({ status: LOCKED });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Desbloquear/i })).toBeInTheDocument();
  });

  it('libera a senha mestra depois de três falhas de PIN', async () => {
    installApi({ status: { ...LOCKED, attempts: 3 } });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Senha mestra/i })).toBeInTheDocument();
  });

  it('mostra a lista de credenciais com o cofre aberto', async () => {
    installApi({ status: UNLOCKED, entries: [ENTRY] });

    render(<App />);

    // O heading só aparece depois da lista; sob carga, a espera passa do padrão do Testing Library.
    await screen.findByRole('heading', { name: 'Senhas' }, { timeout: 15_000 });
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
  });

  it('exibe o aviso da tela quando uma credencial é copiada', async () => {
    const user = userEvent.setup();
    installApi({ status: UNLOCKED, entries: [ENTRY] });
    render(<App />);
    await screen.findByText('GitHub');

    await user.click(screen.getByTitle('Copiar usuário'));

    expect(await screen.findByText('Copiado para a área de transferência.')).toBeInTheDocument();
  });

  it('atualiza o status após o evento de auto-lock enviado pelo main', async () => {
    const api = installApi({ status: UNLOCKED, entries: [ENTRY] });
    const status = vi.fn().mockResolvedValueOnce(UNLOCKED).mockResolvedValue(LOCKED);
    api.vault.status = status;
    render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });

    const listener = autoLockedListeners[0];
    if (listener === undefined) throw new Error('listener de auto-lock não registrado');
    act(() => listener(LOCKED));

    expect(await screen.findByRole('button', { name: /Desbloquear/i })).toBeInTheDocument();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('leva à criação do cofre quando ele não existe', async () => {
    installApi({ status: { ...UNLOCKED, exists: false } });

    render(<App />);

    expect(await screen.findByText(/Crie o seu cofre/i)).toBeInTheDocument();
  });
});

describe('polling de segurança do status', () => {
  // `STATUS_POLL_MS` é privado do `App`: o valor fica aqui para uma mudança de lado falhar.
  const POLL_MS = 15_000;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconsulta o cofre quando o auto-lock não chega', async () => {
    // A rede de segurança: se o push do main se perder, o `setInterval` tira a tela do cofre.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installApi({ status: UNLOCKED, entries: [ENTRY] });
    const status = vi.fn().mockResolvedValue(UNLOCKED);
    api.vault.status = status;
    render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });
    const chamadasIniciais = status.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(status.mock.calls.length).toBeGreaterThan(chamadasIniciais);
  });

  it('não consulta o cofre enquanto ele está travado', async () => {
    // Cofre travado não cria o timer: consultar o status a cada 15 s gastaria IPC à toa.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installApi({ status: LOCKED });
    const status = vi.fn().mockResolvedValue(LOCKED);
    api.vault.status = status;
    render(<App />);
    await screen.findByRole('button', { name: /Desbloquear/i });
    const chamadasIniciais = status.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(status).toHaveBeenCalledTimes(chamadasIniciais);
  });

  it('para de consultar quando a tela é desmontada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installApi({ status: UNLOCKED, entries: [ENTRY] });
    const status = vi.fn().mockResolvedValue(UNLOCKED);
    api.vault.status = status;
    const { unmount } = render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });

    unmount();
    const chamadasNoDesmonte = status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(status).toHaveBeenCalledTimes(chamadasNoDesmonte);
  });
});

describe('botão de autodestruição', () => {
  it('exige a palavra de confirmação antes de apagar o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    const destroy = vi.fn(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    api.vault.destroy = destroy;

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Autodestruição/i }));
    const action = await screen.findByRole('button', { name: /Destruir cofre/i });
    // sem a palavra, o botão de ação está desabilitado
    expect(action).toBeDisabled();

    await user.type(screen.getByLabelText(/Digite a palavra/i), 'DESTR');
    expect(action).toBeDisabled();

    await user.clear(screen.getByLabelText(/Digite a palavra/i));
    await user.type(screen.getByLabelText(/Digite a palavra/i), 'DESTRUIR');
    expect(action).toBeEnabled();

    expect(destroy).not.toHaveBeenCalled();
    await user.click(action);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cancela sem apagar quando a palavra está errada', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    const destroy = vi.fn(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    api.vault.destroy = destroy;

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Autodestruição/i }));
    await user.type(screen.getByLabelText(/Digite a palavra/i), 'BANANA');
    expect(await screen.findByText(/O texto não confere/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('a tela de autodestruição só existe quando o usuário pede', () => {
  it('não abre sozinha com o cofre já aberto', async () => {
    // `confirmDestroy` nasce falso: verdadeiro abriria o app pedindo confirmação de destruição.
    installApi({ status: UNLOCKED });
    render(<App />);
    await screen.findByRole('heading', { name: 'Senhas' });

    expect(screen.queryByLabelText(/Digite a palavra/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Destruir cofre/i })).not.toBeInTheDocument();
  });

  it('cancelar fecha a tela, e não deixa a confirmação pendurada', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    api.vault.destroy = vi.fn(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Autodestruição/i }));
    await screen.findByRole('button', { name: /Destruir cofre/i });
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));

    // O `setConfirmDestroy(false)` do cancelamento tira a tela com o botão de ação habilitado.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Destruir cofre/i })).not.toBeInTheDocument();
    });
    expect(api.vault.destroy).not.toHaveBeenCalled();
  });
});

describe('fechamento do aviso flutuante', () => {
  it('limpa o aviso quando o timer do toast termina', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installApi({ status: UNLOCKED, entries: [ENTRY] });
      render(<App />);
      await screen.findByRole('heading', { name: 'Senhas' });
      fireEvent.click(screen.getByTitle('Copiar usuário'));
      expect(await screen.findByText('Copiado para a área de transferência.')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(screen.queryByText('Copiado para a área de transferência.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
