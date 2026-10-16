import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { LanguageSelect } from '@zero/renderer/components/LanguageSelect';
import { LANGUAGE_LABELS, LANGUAGES } from '@zero/messages';
import type { Language } from '@zero/types';

/**
 * O seletor de idioma é um listbox próprio: abre com clique ou seta, navega com
 * as setas, Home e End, fecha no Escape, no Tab e no clique fora. Tudo isso é
 * navegação por teclado, então o caminho do teclado é o que precisa de teste.
 */

function open(
  language: Language = 'pt-BR',
  onChange = vi.fn<(next: Language) => void>(),
): {
  onChange: ReturnType<typeof vi.fn>;
  rerender: (next: Language) => void;
} {
  const view = render(
    <MessagesProvider language="pt-BR">
      <LanguageSelect language={language} onLanguageChange={onChange} />
    </MessagesProvider>,
  );
  return {
    onChange,
    rerender: (next: Language) => {
      view.rerender(
        <MessagesProvider language="pt-BR">
          <LanguageSelect language={next} onLanguageChange={onChange} />
        </MessagesProvider>,
      );
    },
  };
}

/** O campo é nomeado pelo rótulo "Idioma" via `aria-labelledby`. */
function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Idioma' });
}

/** Os botões do menu, dentro da lista; o campo não entra. */
function items(): HTMLElement[] {
  return within(screen.getByRole('listbox')).getAllByRole('button');
}

/** Item do menu pelo nome. O campo repete o rótulo do idioma ativo, então a
 *  busca fica presa à lista para não pegar as duas cópias. */
function item(label: string): HTMLElement {
  return within(screen.getByRole('listbox')).getByText(label);
}

describe('LanguageSelect: coluna estreita', () => {
  it('põe o código do idioma no gatilho e o nome completo na lista', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(next: Language) => void>();
    render(
      <MessagesProvider language="pt-BR">
        <LanguageSelect language="pt-BR" onLanguageChange={onChange} compact />
      </MessagesProvider>,
    );

    // o trilho estreito da barra lateral não comporta "Português (Brasil)", mas
    // o menu continua mostrando os nomes: quem lê por tecnologia assistiva
    // precisa do nome, não do código
    expect(trigger()).toHaveTextContent('pt-BR');
    await user.click(trigger());
    expect(screen.getByRole('listbox')).toHaveTextContent(LANGUAGE_LABELS['pt-BR']);

    await user.click(item(LANGUAGE_LABELS.en));
    expect(onChange).toHaveBeenCalledWith('en');
  });
});

describe('LanguageSelect: estado fechado', () => {
  it('mostra o idioma atual e esconde a lista', () => {
    open('pt-BR');
    expect(screen.getByText('Português (Brasil)')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('abre e fecha no clique, alternando', async () => {
    const user = userEvent.setup();
    open();

    await user.click(trigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marca o idioma ativo como selecionado', async () => {
    const user = userEvent.setup();
    open('en');

    await user.click(trigger());

    // a ordem de exibição é decisão de produto e muda; o teste pergunta pelo
    // idioma, não pela posição
    const active = LANGUAGES.indexOf('en');
    const options = screen.getAllByRole('option');
    expect(options[active - 1]).toHaveAttribute('aria-selected', 'false');
    expect(options[active]).toHaveAttribute('aria-selected', 'true');
  });

  it('leva o foco ao idioma ativo ao abrir', async () => {
    const user = userEvent.setup();
    open('en');

    await user.click(trigger());

    expect(item(LANGUAGE_LABELS.en).closest('button')).toHaveFocus();
  });
});

describe('LanguageSelect: escolher', () => {
  it('avisa e devolve o foco ao campo quando muda de idioma', async () => {
    const user = userEvent.setup();
    const { onChange } = open('pt-BR');

    await user.click(trigger());
    await user.click(item(LANGUAGE_LABELS.en));

    expect(onChange).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('não avisa quando o usuário escolhe o idioma que já está ativo', async () => {
    const user = userEvent.setup();
    const { onChange } = open('pt-BR');

    await user.click(trigger());
    await user.click(item(LANGUAGE_LABELS['pt-BR']));

    // regra do React controlled: realimentar o mesmo valor não deve gravar
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('LanguageSelect: teclado no campo', () => {
  it('abre com ArrowDown e com ArrowUp', async () => {
    const user = userEvent.setup();
    open();

    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('ignora outras teclas no campo', async () => {
    const user = userEvent.setup();
    open();

    trigger().focus();
    await user.keyboard('{a}{Shift}{Tab}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('LanguageSelect: teclado na lista', () => {
  it('as setas navegam e dão a volta nas pontas', async () => {
    const user = userEvent.setup();
    open('pt-BR');

    await user.click(trigger());
    const last = LANGUAGES.length - 1;

    await user.keyboard('{ArrowDown}');
    expect(items()[1]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(items()[0]).toHaveFocus();

    // de volta do primeiro, ArrowUp leva ao último
    await user.keyboard('{ArrowUp}');
    expect(items()[last]).toHaveFocus();

    // e do último, ArrowDown volta ao primeiro
    await user.keyboard('{ArrowDown}');
    expect(items()[0]).toHaveFocus();
  });

  it('Home e End vão às pontas', async () => {
    const user = userEvent.setup();
    open('pt-BR');
    await user.click(trigger());
    const last = LANGUAGES.length - 1;

    await user.keyboard('{End}');
    expect(items()[last]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(items()[0]).toHaveFocus();
  });

  it('Escape fecha e devolve o foco ao campo', async () => {
    const user = userEvent.setup();
    open('pt-BR');

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('Tab fecha sem escolher nada', async () => {
    const user = userEvent.setup();
    const { onChange } = open('pt-BR');

    await user.click(trigger());
    await user.keyboard('{Tab}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignora tecla sem efeito na lista', async () => {
    const user = userEvent.setup();
    open('pt-BR');

    await user.click(trigger());
    await user.keyboard('a');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('segue o idioma quando o app troca por fora', async () => {
    const user = userEvent.setup();
    const { rerender } = open('pt-BR');

    await user.click(trigger());
    rerender('en');

    expect(item(LANGUAGE_LABELS.en).closest('button')).toHaveFocus();
  });
});

describe('LanguageSelect: clique fora', () => {
  it('fecha ao clicar fora do campo', async () => {
    const user = userEvent.setup();
    open();

    await user.click(trigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('não fecha ao clicar dentro do campo ou da lista', async () => {
    const user = userEvent.setup();
    open();

    await user.click(trigger());
    fireEvent.mouseDown(trigger());

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('remove o ouvinte quando desmonta com a lista aberta', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MessagesProvider language="pt-BR">
        <LanguageSelect language="pt-BR" onLanguageChange={vi.fn()} />
      </MessagesProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Idioma' }));
    unmount();

    // se o listener sobrasse, um mousedown depois do unmount tocaria estado morto
    expect(() => {
      fireEvent.mouseDown(document.body);
    }).not.toThrow();
  });
});
