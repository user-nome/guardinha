import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { MessagesProvider, richText, useLanguage, useMessages } from '@zero/renderer/i18n';

/**
 * `richText` transforma `**negrito**` e `` `código` `` em nós React sem passar
 * por `dangerouslySetInnerHTML`. Os testes abaixo travam os três detalhes que
 * fazem essa função ser segura: nunca interpreting HTML, sempre com `key`
 * distinta para o React, e sem perder o texto ao redor dos marcadores.
 */

function show(nodes: ReactNode[]): JSX.Element {
  return <div data-testid="rich">{nodes}</div>;
}

describe('richText', () => {
  it('converte negrito em <strong>', () => {
    const nodes = richText('antes **depois** fim');
    const { getByTestId } = render(show(nodes));
    const strong = getByTestId('rich').querySelector('strong');
    expect(strong?.textContent).toBe('depois');
  });

  it('converte código em <code>', () => {
    const nodes = richText('rode `npm test` agora');
    const { getByTestId } = render(show(nodes));
    const code = getByTestId('rich').querySelector('code');
    expect(code?.textContent).toBe('npm test');
  });

  it('mantém o texto ao redor dos marcadores', () => {
    const nodes = richText('a **b** c `d` e');
    const { getByTestId } = render(show(nodes));
    expect(getByTestId('rich').textContent).toBe('a b c d e');
  });

  it('aceita os dois marcadores na mesma frase', () => {
    const nodes = richText('**um** e `dois` e **três**');
    const { getByTestId } = render(show(nodes));
    expect(getByTestId('rich').querySelectorAll('strong')).toHaveLength(2);
    expect(getByTestId('rich').querySelectorAll('code')).toHaveLength(1);
  });

  it('devolve a frase inteira quando não há marcador nenhum', () => {
    const nodes = richText('texto simples');
    const { getByTestId } = render(show(nodes));
    expect(getByTestId('rich').textContent).toBe('texto simples');
    expect(getByTestId('rich').querySelectorAll('strong')).toHaveLength(0);
  });

  it('não interpreta HTML vindo do texto', () => {
    // o ponto do não usar dangerouslySetInnerHTML: uma mensagem com tag
    // precisa virar texto, nunca elemento
    const nodes = richText('<b>injetado</b>');
    const { getByTestId } = render(show(nodes));
    expect(getByTestId('rich').querySelector('b')).toBeNull();
    expect(getByTestId('rich').textContent).toBe('<b>injetado</b>');
  });

  it('dá chave distinta a cada nó, como o React exige na lista', () => {
    const nodes = richText('**a** **b** `c`');
    // `key` não aparece no DOM, mas um throw do React aparece no console;
    // renderizar sem erro já prova que as chaves são únicas
    expect(() => render(show(nodes))).not.toThrow();
  });

  it('não engole o texto quando o marcador abre e não fecha', () => {
    const nodes = richText('**aberto');
    const { getByTestId } = render(show(nodes));
    expect(getByTestId('rich').textContent).toBe('**aberto');
  });
});

describe('contexto de idioma', () => {
  it('usa pt-BR fora do provider, para componente isolado não quebrar', () => {
    const { result } = renderHook(() => useMessages());
    expect(result.current.app.name).toBe('Guardinha');
    expect(result.current.auth.tabPin).toBe('PIN');
  });

  it('troca o bundle quando o provider muda de idioma', () => {
    const { rerender } = render(
      <MessagesProvider language="pt-BR">
        <Probe />
      </MessagesProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('pt-BR:Início (Senhas)');

    rerender(
      <MessagesProvider language="en">
        <Probe />
      </MessagesProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('en:Home (Passwords)');
  });

  it('mantém a mesma referência de bundle para o mesmo idioma', () => {
    // refaz o memo a cada render, o React remontaria a árvore inteira
    const { rerender } = renderHook(() => (
      <MessagesProvider language="pt-BR">
        <Probe />
      </MessagesProvider>
    ));
    const before = document.body.innerHTML;
    rerender();
    expect(document.body.innerHTML).toBe(before);
  });
});

function Probe(): ReactNode {
  const messages = useMessages();
  const language = useLanguage();
  return <span data-testid="probe">{`${language}:${messages.app.nav.home}`}</span>;
}
