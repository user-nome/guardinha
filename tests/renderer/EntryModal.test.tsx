import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { EntryModal } from '@zero/renderer/components/EntryModal';
import { installApi } from '../mocks/api.ts';
import type { Credential } from '@zero/types';

/** Salvar e excluir: a confirmação dentro do modal evita apagar por engano. */

const EXISTING: Credential = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  title: 'GitHub',
  username: 'morgan',
  password: 's3nh@-forte',
  domain: 'github.com',
  notes: 'conta pessoal',
  createdAt: 1,
  updatedAt: 2,
};

interface Options {
  entry?: Credential | null;
  onChanged?: () => Promise<void>;
  onToast?: (message: string) => void;
  onClose?: () => void;
}

const CONFIRM_TEXT = 'Excluir esta credencial? Esta ação não pode ser desfeita.';

function open(options: Options = {}): {
  onChanged: ReturnType<typeof vi.fn>;
  onToast: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onChanged = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onToast = vi.fn<(message: string) => void>();
  const onClose = vi.fn<() => void>();
  render(
    <MessagesProvider language="pt-BR">
      <EntryModal
        entry={options.entry ?? null}
        onClose={onClose}
        onChanged={onChanged}
        onToast={onToast}
      />
    </MessagesProvider>,
  );
  return { onChanged, onToast, onClose };
}

describe('EntryModal: criação', () => {
  it('abre vazio, com os rótulos de criação', () => {
    open();
    expect(screen.getByText('Nova credencial')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('recusa salvar sem título, sem chamar o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const save = vi.fn().mockResolvedValue([]);
    api.entries.save = save;
    open();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Informe o título da credencial.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('trava o botão de salvar enquanto o cofre grava', async () => {
    // O save é assíncrono: entre o clique e a resposta, o botão vira "Salvando…"
    // e fica desabilitado, para um segundo clique não gravar em dobro.
    const user = userEvent.setup();
    const api = installApi();
    let concluir: (credential: Credential[]) => void = () => undefined;
    api.entries.save = vi.fn(
      () =>
        new Promise<Credential[]>((resolve) => {
          concluir = resolve;
        }),
    );
    open();

    await user.type(screen.getByLabelText('Título'), 'Banco');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();

    concluir([]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    });
  });

  it('abre o campo de observações com três linhas', () => {
    open();
    expect(screen.getByLabelText('Observações')).toHaveAttribute('rows', '3');
  });

  it('salva a credencial nova e fecha avisando', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.save = vi.fn().mockResolvedValue([]);
    const { onChanged, onToast, onClose } = open();

    await user.type(screen.getByLabelText('Título'), 'Banco');
    await user.type(screen.getByLabelText('Usuário'), 'morgan');
    await user.type(screen.getByLabelText('Senha'), 'abc');
    await user.type(screen.getByLabelText('Domínio'), 'banco.com.br');
    await user.type(screen.getByLabelText('Observações'), 'conta pessoal');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.entries.save).toHaveBeenCalledWith({
      title: 'Banco',
      username: 'morgan',
      password: 'abc',
      domain: 'banco.com.br',
      notes: 'conta pessoal',
    });
    // criação não manda id: quem chama decide se é novo ou atualização
    expect(onChanged).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Credencial salva.');
    expect(onClose).toHaveBeenCalled();
  });

  it('mostra a senha oculta por padrão e a revela no olho', async () => {
    const user = userEvent.setup();
    open();

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    await user.click(screen.getByTitle('Mostrar senha'));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    await user.click(screen.getByTitle('Ocultar senha'));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('mede a força da senha enquanto o usuário digita', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha'), 'aaaa');
    expect(screen.getByText('Muito fraca')).toBeInTheDocument();
  });

  it('mostra o erro do cofre quando o save falha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.save = vi.fn().mockRejectedValue(new Error('Domínio inválido.'));
    const { onToast } = open();

    await user.type(screen.getByLabelText('Título'), 'Banco');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Domínio inválido.')).toBeInTheDocument();
    // a tela não fecha: o usuário precisa corrigir e tentar de novo
    expect(onToast).not.toHaveBeenCalled();
  });

  it('usa a mensagem padrão quando a rejeição não traz texto', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.save = vi.fn().mockRejectedValue(new Error(''));
    open();

    await user.type(screen.getByLabelText('Título'), 'Banco');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Não foi possível salvar a credencial.')).toBeInTheDocument();
  });

  it('não mostra o botão de excluir ao criar', () => {
    open();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });
});

describe('EntryModal: edição', () => {
  it('abre preenchido com os dados da credencial', () => {
    open({ entry: EXISTING });
    expect(screen.getByText('Editar credencial')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('GitHub');
    expect(screen.getByLabelText('Domínio')).toHaveValue('github.com');
    expect(screen.getByLabelText('Observações')).toHaveValue('conta pessoal');
  });

  it('mantém o id ao salvar uma edição', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.save = vi.fn().mockResolvedValue([EXISTING]);
    open({ entry: EXISTING });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.entries.save).toHaveBeenCalledWith(expect.objectContaining({ id: EXISTING.id }));
  });

  it('exige dois toques para excluir: o primeiro só pergunta', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.remove = vi.fn().mockResolvedValue([]);
    const { onChanged, onToast } = open({ entry: EXISTING });

    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    // o próprio botão vira a confirmação: nada é apagado no primeiro toque
    expect(api.entries.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: CONFIRM_TEXT })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: CONFIRM_TEXT }));

    expect(api.entries.remove).toHaveBeenCalledWith(EXISTING.id);
    expect(onChanged).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Credencial removida.');
  });

  it('trava os botões enquanto o cofre apaga a credencial', async () => {
    const user = userEvent.setup();
    const api = installApi();
    let concluir: (credential: Credential[]) => void = () => undefined;
    api.entries.remove = vi.fn(
      () =>
        new Promise<Credential[]>((resolve) => {
          concluir = resolve;
        }),
    );
    open({ entry: EXISTING });

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: CONFIRM_TEXT }));

    // mesmo durante a exclusão o estado é o de ocupado: os dois caminhos
    // perigosos compartilham a mesma trava
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();

    concluir([]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    });
  });

  it('cancela a confirmação de exclusão quando o usuário desiste', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.remove = vi.fn().mockResolvedValue([]);
    open({ entry: EXISTING });

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.entries.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Editar credencial')).toBeInTheDocument();
  });

  it('mostra o erro do cofre quando a exclusão falha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.entries.remove = vi.fn().mockRejectedValue(new Error('Credencial não encontrada.'));
    open({ entry: EXISTING });

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: CONFIRM_TEXT }));

    expect(screen.getByText('Credencial não encontrada.')).toBeInTheDocument();
  });

  it('fecha pelo botão do canto sem salvar nada', () => {
    const api = installApi();
    const save = vi.fn().mockResolvedValue([]);
    api.entries.save = save;
    const { onClose } = open({ entry: EXISTING });

    fireEvent.click(screen.getByTitle('Fechar'));

    expect(onClose).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
