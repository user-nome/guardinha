// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '@zero/renderer/components/Toast';

/**
 * O aviso flutuante é a única coisa que some sozinha na tela, então o
 * temporizador é o comportamento: 2,5 s com mensagem e nenhum temporizador sem
 * ela. O segundo ponto é o que impede o componente de pedir o fechamento de um
 * aviso que nunca apareceu, o que derrubaria o estado da tela duas vezes sem
 * nada para mostrar.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('some sozinho depois de 2,5 s', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Senha copiada" onClose={onClose} />);

    expect(screen.getByText('Senha copiada')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2499);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sem mensagem não arma temporizador nenhum', () => {
    // Sem o guarda, o efeito chamaria `onClose` 2,5 s depois de um aviso que
    // não existe, e a tela registraria um fechamento que ninguém pediu.
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<Toast message={null} onClose={onClose} />);

    expect(container.firstChild).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('trocar a mensagem rearma o temporizador em vez de empilhar', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(<Toast message="primeiro" onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    rerender(<Toast message="segundo" onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // o primeiro temporizador foi limpo no cleanup do efeito
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
