import { fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from '@zero/renderer/components/SelectField';

/** Menu próprio no lugar do `<select>`: setas, Home, End, Escape e volta do foco. */

const OPCOES = [
  { value: 'a', label: 'Opção A' },
  { value: 'b', label: 'Opção B' },
  { value: 'c', label: 'Opção C' },
] as const;

function setup(value = 'b'): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn<(next: string) => void>();
  render(<SelectField label="Tamanho" options={OPCOES} value={value} onChange={onChange} />);
  return { onChange };
}

function gatilho(): HTMLElement {
  return screen.getByRole('button', { name: 'Tamanho' });
}

function abrir(): void {
  fireEvent.click(gatilho());
  expect(screen.getByRole('listbox')).toBeInTheDocument();
}

function opcoes(): HTMLElement[] {
  return screen.getAllByRole('option');
}

/** Item por índice, com guarda no lugar do `!`: índice errado vira erro legível. */
function opcao(indice: number): HTMLElement {
  const achada = opcoes()[indice];
  if (achada === undefined) throw new Error(`a opção ${indice} não apareceu no menu`);
  return achada;
}

/** Devolve os erros de janela: React reemite a exceção do manipulador. */
function errosDeJanelaDurante(roteiro: () => void): unknown[] {
  const erros: unknown[] = [];
  const aoErro = (event: ErrorEvent): void => {
    erros.push(event.error ?? event.message);
  };
  window.addEventListener('error', aoErro);
  try {
    roteiro();
  } finally {
    window.removeEventListener('error', aoErro);
  }
  return erros;
}

/** `mousedown` no documento com as refs já soltas, no desmonte do campo. */
function SondaDeDesmontagem(): JSX.Element {
  useLayoutEffect(() => {
    return () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    };
  }, []);
  return <span />;
}

describe('SelectField: abrir e fechar', () => {
  it('mostra a opção corrente no gatilho', () => {
    setup('c');
    expect(gatilho()).toHaveTextContent('Opção C');
  });

  it('fora do modo compacto mostra só o rótulo inteiro, sem o nome curto', () => {
    render(
      <SelectField
        label="Idioma"
        options={[{ value: 'pt-BR', label: 'Português do Brasil', short: 'pt-BR' }]}
        value="pt-BR"
        onChange={() => undefined}
      />,
    );

    const gatilho = screen.getByRole('button', { name: 'Idioma' });
    expect(gatilho).toHaveTextContent(/^Português do Brasil$/);
    expect(gatilho).not.toHaveTextContent('pt-BR');
  });

  it('o gatilho se anuncia como lista para a tecnologia assistiva', () => {
    setup();
    expect(gatilho()).toHaveAttribute('aria-haspopup', 'listbox');
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
  });

  it('o gatilho abre e fecha o menu', () => {
    setup();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    abrir();
    expect(gatilho()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(gatilho());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marca a opção selecionada e põe o check só nela', () => {
    setup('b');
    abrir();

    const marcadas = opcoes().filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]).toHaveTextContent('Opção B');
    // o check é o único filho extra do item selecionado
    expect(marcadas[0]?.querySelectorAll('svg')).toHaveLength(1);
    expect(opcoes()[0]?.querySelectorAll('svg')).toHaveLength(0);
  });

  it('escolher uma opção avisa e devolve o foco ao gatilho', () => {
    const { onChange } = setup('b');
    abrir();

    fireEvent.click(opcoes()[2]?.querySelector('button') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
  });

  it('escolher o valor que já estava não grava nada', () => {
    // campo controlado: realimentar o mesmo valor reescreveria o arquivo à toa
    const { onChange } = setup('b');
    abrir();

    fireEvent.click(opcoes()[1]?.querySelector('button') as HTMLElement);

    expect(onChange).not.toHaveBeenCalled();
    expect(gatilho()).toHaveFocus();
  });

  it('clicar fora fecha o menu, e clicar dentro não', () => {
    setup();
    abrir();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    abrir();
    fireEvent.mouseDown(opcao(0));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('remove o ouvinte de mousedown ao fechar o menu', () => {
    // Sem a limpeza, cada abertura deixa mais um ouvinte de `mousedown` apontando para o passado.
    const remove = vi.spyOn(document, 'removeEventListener');
    setup();
    abrir();

    fireEvent.keyDown(opcoes()[1]?.querySelector('button') as HTMLElement, { key: 'Escape' });

    expect(remove).toHaveBeenCalledWith('mousedown', expect.any(Function));
    remove.mockRestore();
  });
});

describe('SelectField: teclado', () => {
  it('seta para baixo e para cima abrem o menu pelo gatilho', () => {
    setup();
    fireEvent.keyDown(gatilho(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(gatilho(), { key: 'ArrowUp' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('outra tecla no gatilho não abre nada', () => {
    setup();
    fireEvent.keyDown(gatilho(), { key: 'a' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('as setas andam pelo menu e dão a volta nas pontas', () => {
    setup('b');
    abrir();
    const [a, b, c] = opcoes();
    // abrir já põe o foco na opção corrente
    expect(b?.querySelector('button')).toHaveFocus();

    fireEvent.keyDown(b?.querySelector('button') as HTMLElement, { key: 'ArrowDown' });
    expect(c?.querySelector('button')).toHaveFocus();
    fireEvent.keyDown(c?.querySelector('button') as HTMLElement, { key: 'ArrowDown' });
    expect(a?.querySelector('button')).toHaveFocus();
    fireEvent.keyDown(a?.querySelector('button') as HTMLElement, { key: 'ArrowUp' });
    expect(c?.querySelector('button')).toHaveFocus();
  });

  it('Home e End vão às pontas', () => {
    setup('b');
    abrir();
    const [a, , c] = opcoes();

    fireEvent.keyDown(opcoes()[1]?.querySelector('button') as HTMLElement, { key: 'End' });
    expect(c?.querySelector('button')).toHaveFocus();
    fireEvent.keyDown(opcoes()[2]?.querySelector('button') as HTMLElement, { key: 'Home' });
    expect(a?.querySelector('button')).toHaveFocus();
  });

  it('Escape fecha e devolve o foco ao gatilho', () => {
    setup();
    abrir();

    fireEvent.keyDown(opcoes()[1]?.querySelector('button') as HTMLElement, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
  });

  it('Tab fecha o menu sem tratar como movimento', () => {
    setup();
    abrir();

    fireEvent.keyDown(opcoes()[1]?.querySelector('button') as HTMLElement, { key: 'Tab' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('tecla sem efeito no item não mexe o foco nem o menu', () => {
    setup();
    abrir();
    const antes = opcoes()[1]?.querySelector('button');

    fireEvent.keyDown(antes as HTMLElement, { key: 'x' });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(antes).toHaveFocus();

    // Sem a guarda de `next !== null`, a tecla sem efeito gravaria `null` no índice.
    fireEvent.keyDown(antes as HTMLElement, { key: 'ArrowDown' });
    expect(opcoes()[2]?.querySelector('button')).toHaveFocus();
  });
});

describe('SelectField: lista que encolhe com o menu aberto', () => {
  it('não tenta focar um item que saiu da lista', () => {
    // As opções podem encolher com o menu aberto: a navegação não pode focar um item que sumiu.
    const onChange = vi.fn();

    const erros = errosDeJanelaDurante(() => {
      const { rerender } = render(
        <SelectField label="Tamanho" options={OPCOES} value="a" onChange={onChange} />,
      );
      abrir();

      // desce até o último item: o índice interno chega a 2
      fireEvent.keyDown(opcao(0).querySelector('button') as HTMLElement, { key: 'ArrowDown' });
      fireEvent.keyDown(opcao(1).querySelector('button') as HTMLElement, { key: 'ArrowDown' });
      expect(opcao(2).querySelector('button')).toHaveFocus();

      // A lista encolhe para uma opção: o valor corrente continua nela e o índice antigo sobrevive.
      rerender(<SelectField label="Tamanho" options={[OPCOES[0]]} value="a" onChange={onChange} />);

      fireEvent.keyDown(opcao(0).querySelector('button') as HTMLElement, { key: 'ArrowUp' });
    });

    expect(erros).toHaveLength(0);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});

describe('SelectField: clique durante a desmontagem', () => {
  it('não estoura quando o mousedown chega depois de o campo sair da tela', () => {
    const erros = errosDeJanelaDurante(() => {
      const { rerender } = render(
        <div>
          <SelectField label="Tamanho" options={OPCOES} value="a" onChange={vi.fn()} />
          <SondaDeDesmontagem />
        </div>,
      );
      abrir();

      rerender(<div />);
    });

    expect(erros).toHaveLength(0);
  });
});

describe('SelectField: valor fora da lista', () => {
  it('não quebra quando o valor atual não está entre as opções', () => {
    // Valor fora da lista: o rótulo vira texto vazio em vez de estourar o índice.
    expect(() => setup('inexistente')).not.toThrow();
    expect(gatilho().textContent).not.toContain('undefined');
  });

  it('lista vazia não quebra nem deixa "undefined" na tela', () => {
    // `options[activeIndex]` é `undefined` sem nenhuma opção, o único caso sem rótulo.
    const onChange = vi.fn();
    const { container } = render(
      <SelectField label="Tamanho" options={[]} value={'a'} onChange={onChange} />,
    );

    expect(container.textContent).not.toContain('undefined');
    expect(() => fireEvent.click(gatilho())).not.toThrow();
  });
});
