import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Home } from '@zero/renderer/components/Home';
import { installApi } from '../mocks/api.ts';
import type { Credential } from '@zero/types';

/** Lista de credenciais: estados de carregamento, busca, cópia e abertura do site. */

describe('Home: coluna da grade', () => {
  it('usa a coluna larga, que comporta a grade de cartões', async () => {
    installApi({ entries: [] });
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={() => undefined} />
      </MessagesProvider>,
    );

    await screen.findByRole('heading', { name: 'Senhas' });
    expect(document.querySelector('.max-w-6xl')).not.toBeNull();
  });
});

const ENTRIES: Credential[] = [
  {
    id: 'id-github',
    title: 'GitHub',
    username: 'morgan',
    password: 's3nh@-do-github',
    domain: 'github.com',
    notes: '',
    createdAt: 2,
    updatedAt: 3,
  },
  {
    id: 'id-banco',
    title: 'Banco do Brasil',
    username: 'morgan.silva',
    password: 'outra-senha',
    domain: 'bb.com.br',
    notes: '',
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'id-sem-dominio',
    title: 'Rede local',
    username: 'admin',
    password: 'admin',
    domain: '',
    notes: '',
    createdAt: 0,
    updatedAt: 1,
  },
];

/** Primeiro item da lista; o `undefined` é impossível aqui, mas o TS não sabe. */
function first(elements: HTMLElement[]): HTMLElement {
  const element = elements[0];
  if (element === undefined) throw new Error('nenhum elemento encontrado');
  return element;
}

async function open(entries: Credential[] = ENTRIES): Promise<void> {
  installApi({ entries });
  render(
    <MessagesProvider language="pt-BR">
      <Home onToast={vi.fn()} />
    </MessagesProvider>,
  );
  await waitFor(() => {
    expect(
      screen.getByText(entries.length === 0 ? 'Nenhuma credencial ainda' : 'GitHub'),
    ).toBeInTheDocument();
  });
}

describe('Home: carregamento', () => {
  it('mostra "abrindo o cofre" enquanto a lista não volta', () => {
    installApi();
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    expect(screen.getByText('Abrindo o cofre…')).toBeInTheDocument();
  });

  it('mostra o erro quando a lista não abre', async () => {
    const api = installApi();
    api.entries.list = vi.fn().mockRejectedValue(new Error('Cofre bloqueado.'));
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    expect(await screen.findByText('Cofre bloqueado.')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando a falha vem sem texto', async () => {
    const api = installApi();
    api.entries.list = vi.fn().mockRejectedValue(new Error(''));
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });
});

describe('Home: lista', () => {
  it('mostra título, usuário, domínio e a contagem', async () => {
    await open();
    expect(screen.getByText('3 credencial(is)')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('morgan')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
  });

  it('omite o domínio quando a credencial não tem um', async () => {
    await open();
    const card = screen.getByText('Rede local').closest('div.bg-slate-900');
    expect(card?.textContent ?? '').not.toContain('admin.com');
  });

  it('oferece adicionar a primeira credencial quando a lista está vazia', async () => {
    await open([]);
    expect(screen.getByText('Nenhuma credencial ainda')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Adicionar primeira credencial' }),
    ).toBeInTheDocument();
  });

  it('abre o modal de criação pelo botão do topo e pelo da lista vazia', async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(screen.getByRole('button', { name: 'Adicionar primeira credencial' }));
    // o título do modal repete o rótulo do botão; o heading desambigua
    expect(screen.getByRole('heading', { name: 'Nova credencial' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Nova credencial' }));
    expect(screen.getByRole('heading', { name: 'Nova credencial' })).toBeInTheDocument();
  });

  it('abre o modal de edição já preenchido com a credencial', async () => {
    const user = userEvent.setup();
    await open();
    // cada card tem o seu lápis; o primeiro é o GitHub
    await user.click(first(screen.getAllByTitle('Editar credencial')));
    expect(screen.getByRole('heading', { name: 'Editar credencial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('GitHub');
  });

  it('fecha o modal de criação ao cancelar', async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(screen.getByRole('button', { name: 'Adicionar primeira credencial' }));
    expect(screen.getByRole('heading', { name: 'Nova credencial' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    // cancelar desmonta o modal: o heading do formulário não pode continuar na tela
    expect(screen.queryByRole('heading', { name: 'Nova credencial' })).not.toBeInTheDocument();
  });
});

describe('Home: busca', () => {
  it('filtra por título', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(screen.getByPlaceholderText('Buscar por título, usuário ou domínio…'), 'banco');
    expect(screen.getByText('Banco do Brasil')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
  });

  it('filtra por usuário', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(screen.getByPlaceholderText('Buscar por título, usuário ou domínio…'), 'silva');
    expect(screen.getByText('Banco do Brasil')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
  });

  it('filtra por domínio', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(
      screen.getByPlaceholderText('Buscar por título, usuário ou domínio…'),
      'bb.com',
    );
    expect(screen.getByText('Banco do Brasil')).toBeInTheDocument();
  });

  it('ignora maiúsculas e espaços em volta', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(
      screen.getByPlaceholderText('Buscar por título, usuário ou domínio…'),
      '  GITHUB ',
    );
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('Banco do Brasil')).not.toBeInTheDocument();
  });

  it('distingue "nada encontrado" de "lista vazia"', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(screen.getByPlaceholderText('Buscar por título, usuário ou domínio…'), 'zzzz');
    expect(screen.getByText('Nenhuma credencial encontrada')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma credencial ainda')).not.toBeInTheDocument();
  });
});

describe('Home: ações', () => {
  it('copia o usuário e avisa', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Copiar usuário')));

    expect(copy).toHaveBeenCalledWith('morgan');
    expect(onToast).toHaveBeenCalledWith('Copiado para a área de transferência.');
  });

  it('copia a senha', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Copiar senha')));

    expect(copy).toHaveBeenCalledWith('s3nh@-do-github');
  });

  it('avisa quando a cópia falha', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    api.clipboard.copy = vi.fn().mockRejectedValue(new Error('sem área de transferência'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Copiar usuário')));

    expect(onToast).toHaveBeenCalledWith('sem área de transferência');
  });

  it('abre o domínio no navegador do sistema', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    const openDomain = vi.fn().mockResolvedValue(undefined);
    api.openDomain = openDomain;
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Abrir o site em um navegador')));

    expect(openDomain).toHaveBeenCalledWith('github.com');
  });

  it('avisa quando o navegador não abre', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    api.openDomain = vi.fn().mockRejectedValue(new Error('Domínio inválido.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Abrir o site em um navegador')));

    expect(onToast).toHaveBeenCalledWith('Domínio inválido.');
  });

  it('desabilita abrir o site quando a credencial não tem domínio', async () => {
    await open();
    const card = screen.getByText('Rede local').closest('div.bg-slate-900');
    const button = card?.querySelector('button[title="Abrir o site em um navegador"]');
    expect(button).toBeDisabled();
  });

  it('avisa quando o erro ao abrir vem sem texto', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    api.openDomain = vi.fn().mockRejectedValue(new Error(''));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Abrir o site em um navegador')));

    expect(onToast).toHaveBeenCalledWith('Domínio inválido.');
  });
});

describe('Home com falha ao carregar', () => {
  it('mostra o erro e não o estado vazio', async () => {
    // Lista vazia e lista que não carregou são telas diferentes: a segunda diz o que houve.
    const api = installApi();
    api.entries.list = vi.fn(() => Promise.reject(new Error('falha de leitura')));

    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );

    await waitFor(() => {
      expect(api.entries.list).toHaveBeenCalled();
    });
    await screen.findByText(/falha de leitura/i);
    expect(screen.queryByText(/nenhuma credencial/i)).not.toBeInTheDocument();
  });
});

describe('Home com falha na recarga', () => {
  /** Erro no topo só no segundo carregamento, nunca no lugar da tela vazia. */
  it('mostra o erro quando a recarga falha com a lista vazia', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: [] });
    api.entries.list = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('falha de leitura'));
    api.entries.save = vi.fn().mockResolvedValue([]);
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    await screen.findByText('Nenhuma credencial ainda');

    // salvar dispara a recarga, que falha e deixa o erro sobre a lista vazia
    await user.click(screen.getByRole('button', { name: 'Adicionar primeira credencial' }));
    await user.type(screen.getByLabelText('Título'), 'Nova');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('falha de leitura')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma credencial ainda')).toBeInTheDocument();
  });

  it('não repete o erro na tela quando a lista já tem itens', async () => {
    const user = userEvent.setup();
    const api = installApi({ entries: ENTRIES });
    api.entries.list = vi
      .fn()
      .mockResolvedValueOnce(ENTRIES)
      .mockRejectedValueOnce(new Error('falha de leitura'));
    api.entries.save = vi.fn().mockResolvedValue(ENTRIES);
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(first(screen.getAllByTitle('Editar credencial')));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.entries.list).toHaveBeenCalledTimes(2);
    });
    // a lista continua na tela e o erro fica só para o caso de tela vazia
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('falha de leitura')).not.toBeInTheDocument();
  });
});
