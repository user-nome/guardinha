import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Backup } from '@zero/renderer/components/Backup';
import { installApi } from '../mocks/api.ts';
import type { ElectronApi } from '@zero/types';

/**
 * A tela de backup é a única ponte para o pacote `.gbk`. Ela não cifra nem lê
 * nada: só dispara os canais `window.api.backup` (o main monta o arquivo e abre
 * o diálogo) e transforma a resposta em toast. O que os testes provam é esse
 * contrato, incluindo o cancelamento e a confirmação da restauração, que apaga
 * o cofre atual.
 */

function open(onToast = vi.fn<(message: string) => void>()): {
  onToast: ReturnType<typeof vi.fn>;
  api: ElectronApi;
} {
  const api = installApi();
  render(
    <MessagesProvider language="pt-BR">
      <Backup onToast={onToast} />
    </MessagesProvider>,
  );
  return { onToast, api };
}

describe('Backup: estado inicial e ocupado', () => {
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it('não abre a confirmação de restauração antes do clique', () => {
    open();
    expect(screen.queryByText('Restaurar backup')).not.toBeInTheDocument();
  });

  it('usa a coluna média, entre formulário e grade', () => {
    open();
    expect(document.querySelector('.max-w-4xl')).not.toBeNull();
  });

  it('desabilita as duas ações enquanto uma operação corre', async () => {
    const user = userEvent.setup();
    const { api } = open();
    const pending = deferred<{ canceled: true }>();
    api.backup.export = vi.fn(() => pending.promise);

    await user.click(screen.getByRole('button', { name: 'Salvar backup em um pendrive' }));
    expect(screen.getByRole('button', { name: 'Salvar backup em um pendrive' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restaurar de um backup' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ canceled: true });
      await pending.promise;
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar backup em um pendrive' })).toBeEnabled();
    });
  });
});

describe('Backup: salvar backup', () => {
  it('dispara o canal de exportação e confirma com o caminho', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    const exportBackup = vi
      .fn()
      .mockResolvedValue({ path: '/media/pendrive/guardinha.gbk', files: 3, bytes: 1024 });
    api.backup.export = exportBackup;

    await user.click(screen.getByRole('button', { name: 'Salvar backup em um pendrive' }));

    expect(exportBackup).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Backup gravado em /media/pendrive/guardinha.gbk.');
  });

  it('não avisa nada quando o usuário cancela o diálogo', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.export = vi.fn().mockResolvedValue({ canceled: true });

    await user.click(screen.getByRole('button', { name: 'Salvar backup em um pendrive' }));

    expect(onToast).not.toHaveBeenCalled();
  });

  it('mostra o erro do main quando a gravação falha', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.export = vi.fn().mockRejectedValue(new Error('Disco cheio.'));

    await user.click(screen.getByRole('button', { name: 'Salvar backup em um pendrive' }));

    expect(onToast).toHaveBeenCalledWith('Disco cheio.');
  });

  it('usa a mensagem padrão quando o erro chega sem texto', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.export = vi.fn().mockRejectedValue(new Error(''));

    await user.click(screen.getByRole('button', { name: 'Salvar backup em um pendrive' }));

    expect(onToast).toHaveBeenCalledWith('Erro interno do cofre.');
  });
});

describe('Backup: restaurar backup', () => {
  it('exige confirmação antes de restaurar', async () => {
    const user = userEvent.setup();
    const { api } = open();
    const restore = vi.fn();
    api.backup.restore = restore;

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));

    expect(screen.getByText('Restaurar backup')).toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
  });

  it('cancela a confirmação sem chamar o cofre', async () => {
    const user = userEvent.setup();
    const { api } = open();
    const restore = vi.fn();
    api.backup.restore = restore;

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(restore).not.toHaveBeenCalled();
    expect(screen.queryByText('Restaurar backup')).not.toBeInTheDocument();
  });

  it('restaura e confirma com a contagem de arquivos', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.restore = vi.fn().mockResolvedValue({ path: '/media/p/guardinha.gbk', files: 4 });

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar agora' }));

    expect(api.backup.restore).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Cofre restaurado com 4 arquivo(s).');
    await waitFor(() => {
      expect(screen.queryByText('Restaurar backup')).not.toBeInTheDocument();
    });
  });

  it('fecha a confirmação sem avisar quando o usuário cancela o diálogo', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.restore = vi.fn().mockResolvedValue({ canceled: true });

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar agora' }));

    expect(onToast).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Restaurar backup')).not.toBeInTheDocument();
    });
  });

  it('mostra o erro quando a restauração falha', async () => {
    const user = userEvent.setup();
    const { onToast, api } = open();
    api.backup.restore = vi.fn().mockRejectedValue(new Error('O backup está corrompido.'));

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar agora' }));

    expect(onToast).toHaveBeenCalledWith('O backup está corrompido.');
  });
});
