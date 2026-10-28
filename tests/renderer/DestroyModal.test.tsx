import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { DestroyModal } from '@zero/renderer/components/DestroyModal';
import { UNLOCKED, installApi } from '../mocks/api.ts';
import type { VaultStatus } from '@zero/types';

/** Diálogo de autodestruição: os quatro estados, inclusive o erro de cofre já destruído. */

/** O modal chama `window.api.vault.destroy()` direto; o mock controla esse canal. */
function open(destroy: () => Promise<VaultStatus>): {
  destroy: ReturnType<typeof vi.fn>;
  onDestroyed: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const api = installApi();
  const spy = vi.fn(destroy);
  api.vault.destroy = spy;
  const onDestroyed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn<() => void>();
  render(
    <MessagesProvider language="pt-BR">
      <DestroyModal onClose={onClose} onDestroyed={onDestroyed} />
    </MessagesProvider>,
  );
  return { destroy: spy, onDestroyed, onClose };
}

const FIELD = /Digite a palavra abaixo/i;

describe('DestroyModal', () => {
  it('avisa que a ação apaga tudo de vez', () => {
    open(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    expect(screen.getByRole('heading', { name: 'Destruir o cofre agora' })).toBeInTheDocument();
    expect(screen.getByText(/o cofre inteiro/)).toBeInTheDocument();
    expect(screen.getByText(/os arquivos cifrados são sobrescritos/)).toBeInTheDocument();
  });

  it('começa com a ação desabilitada e sem aviso de texto errado', () => {
    open(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    expect(screen.getByLabelText(FIELD)).toHaveValue('');
    expect(screen.queryByText('O texto não confere.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Destruir cofre/i })).toBeDisabled();
  });

  it('desliga o corretor ortográfico no campo de confirmação', () => {
    // A palavra de confirmação é identificador, não texto: corretor aqui só atrapalha.
    open(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    expect(screen.getByLabelText(FIELD)).toHaveAttribute('spellcheck', 'false');
  });

  it('cancela sem destruir, pelo botão e pelo X', async () => {
    const user = userEvent.setup();
    const { destroy, onClose } = open(() => Promise.resolve({ ...UNLOCKED, exists: false }));

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(destroy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('só libera a ação com a palavra exata', async () => {
    const user = userEvent.setup();
    const { destroy } = open(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    const field = screen.getByLabelText(FIELD);

    await user.type(field, 'DESTR');
    expect(screen.getByText('O texto não confere.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Destruir cofre/i })).toBeDisabled();

    await user.clear(field);
    await user.type(field, 'DESTRUIR');
    expect(screen.queryByText('O texto não confere.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Destruir cofre/i })).toBeEnabled();

    expect(destroy).not.toHaveBeenCalled();
  });

  it('destrói o cofre e avisa quando a palavra confere', async () => {
    const user = userEvent.setup();
    const { destroy, onDestroyed, onClose } = open(() =>
      Promise.resolve({ ...UNLOCKED, exists: false }),
    );

    await user.type(screen.getByLabelText(FIELD), 'DESTRUIR');
    await user.click(screen.getByRole('button', { name: /Destruir cofre/i }));

    expect(destroy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onDestroyed).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('trava a ação enquanto o cofre é destruído e a destrava no fim', async () => {
    const user = userEvent.setup();
    let concluir: (status: VaultStatus) => void = () => undefined;
    const { destroy, onClose } = open(
      () =>
        new Promise<VaultStatus>((resolve) => {
          concluir = resolve;
        }),
    );

    await user.type(screen.getByLabelText(FIELD), 'DESTRUIR');
    await user.click(screen.getByRole('button', { name: /Destruir cofre/i }));

    // durante a destruição o botão vira "Destruindo…" e não aceita segundo clique
    expect(screen.getByRole('button', { name: /Destruindo/i })).toBeDisabled();

    concluir({ ...UNLOCKED, exists: false });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    // e o estado de ocupado não sobrevive ao fim: o botão volta ao normal
    expect(screen.getByRole('button', { name: /Destruir cofre/i })).toBeEnabled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('fecha sem erro quando o cofre já foi destruído por outro caminho', async () => {
    // o PIN de coação pode ter apagado tudo antes: o mesmo `destroy` devolve "não existe mais"
    const user = userEvent.setup();
    const { destroy, onDestroyed, onClose } = open(() =>
      Promise.reject(new Error('Cofre não encontrado')),
    );

    await user.type(screen.getByLabelText(FIELD), 'DESTRUIR');
    await user.click(screen.getByRole('button', { name: /Destruir cofre/i }));

    await waitFor(() => {
      expect(onDestroyed).toHaveBeenCalled();
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
