import { act, render, screen, waitFor } from '@testing-library/react';
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

describe('App: estados do cofre e da tela', () => {
  it('sem cofre, mostra a criação e nenhuma aba', async () => {
    installApi({ status: { ...UNLOCKED, exists: false } });

    render(<App />);

    expect(await screen.findByText('Crie o seu cofre')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerador de Senhas' })).not.toBeInTheDocument();
  });

  it('o status recarregado não devolve a tela para o Início', async () => {
    // O efeito só volta ao Início quando o cofre some ou trava. Recarregar o
    // status enquanto o cofre continua aberto não pode arrancar o usuário da
    // aba em que ele está.
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    api.vault.status = () => Promise.resolve({ ...UNLOCKED });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Gerador de Senhas' }));
    expect(await screen.findByRole('heading', { name: 'Gerador de Senhas' })).toBeInTheDocument();

    await act(async () => {
      autoLockedListeners[0]?.({ ...UNLOCKED });
    });

    expect(await screen.findByRole('heading', { name: 'Gerador de Senhas' })).toBeInTheDocument();
  });

  it('registra a falha ao consultar o cofre com o prefixo que identifica a origem', async () => {
    const erro = new Error('canal IPC fechado');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = installApi({ status: UNLOCKED });
    api.vault.status = vi.fn().mockRejectedValue(erro);

    render(<App />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Falha ao consultar o cofre:', erro);
    });
    consoleError.mockRestore();
  });
});

describe('App: aba de backup', () => {
  it('leva à tela de backup pelo menu, que é onde o pendrive entra', async () => {
    // A aba de backup é a única cujas ações não dependem da chave do cofre
    // (exportar e restaurar works em máquina formatada), então ela precisa
    // estar alcançável pelo roteiro do `App`, e não só testada como componente
    // solto: um item de menu fora de ordem ou com o rótulo errado só aparece
    // aqui.
    const user = userEvent.setup();
    installApi({ status: UNLOCKED });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Backup' }));

    expect(await screen.findByRole('heading', { name: 'Backup do cofre' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Salvar backup em um pendrive' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurar de um backup' })).toBeInTheDocument();
  });

  it('avisa o que foi salvo quando a exportação termina', async () => {
    // o `onToast` é o que dá retorno da aba: um clique que não avisa deixa o
    // usuário sem saber se o pendrive recebeu o cofre
    const user = userEvent.setup();
    installApi({
      status: UNLOCKED,
      backup: {
        export: () => Promise.resolve({ path: '/pendrive/cofre.gbk', files: 3, bytes: 2048 }),
        restore: () => Promise.reject(new Error('não usado neste teste')),
      },
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Backup' }));
    await user.click(await screen.findByRole('button', { name: 'Salvar backup em um pendrive' }));

    // o toast é do `App`, não da tela: é o roteador que confirma a operação
    expect(
      await screen.findByText(/Backup gravado em \/pendrive\/cofre\.gbk\./),
    ).toBeInTheDocument();
  });

  it('trata diálogo cancelado como operação encerrada, sem toast de sucesso', async () => {
    // o `{ canceled: true }` que volta do main quando o usuário fecha o diálogo
    // nativo não pode virar "backup salvo": mentir sobre o que foi gravado no
    // pendrive seria o pior erro possível numa tela de backup.
    const user = userEvent.setup();
    installApi({
      status: UNLOCKED,
      backup: {
        export: () => Promise.resolve({ canceled: true }),
        restore: () => Promise.resolve({ canceled: true }),
      },
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Backup' }));
    await user.click(await screen.findByRole('button', { name: 'Salvar backup em um pendrive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar backup em um pendrive' })).toBeEnabled();
    });
    expect(screen.queryByText(/cofre\.gbk/)).not.toBeInTheDocument();
  });

  it('pede confirmação antes de restaurar, porque a restauração apaga o cofre', async () => {
    const user = userEvent.setup();
    const restore = vi.fn(() => Promise.resolve({ path: '/pendrive/cofre.gbk', files: 3 }));
    installApi({
      status: UNLOCKED,
      backup: {
        export: () => Promise.reject(new Error('não usado neste teste')),
        restore,
      },
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Backup' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurar de um backup' }));

    // o primeiro clique só abre a confirmação: o canal do main não é chamado
    // antes da segunda etapa
    expect(await screen.findByRole('button', { name: 'Restaurar agora' })).toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
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
