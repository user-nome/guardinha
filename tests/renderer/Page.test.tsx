import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Page } from '@zero/renderer/components/Page';

/** O `Page` é o esqueleto comum das abas: largura por tipo de tela, cabeçalho e subtítulo opcional. */

function mount(ui: ReactElement): HTMLElement {
  const { container } = render(<MessagesProvider language="pt-BR">{ui}</MessagesProvider>);
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('A página não montou.');
  return root;
}

describe('Page: coluna de conteúdo', () => {
  it('limita a largura e centraliza pelo padrão', () => {
    const root = mount(
      <Page title="Senhas">
        <p>conteúdo</p>
      </Page>,
    );

    expect(root.className).toContain('mx-auto');
    expect(root.className).toContain('max-w-4xl');
    // a contagem de colunas dos cartões mora em `card-grid.ts`; aqui só o teto de largura
    expect(root.className).not.toContain('@container');
  });

  it('aceita a largura que a tela precisa', () => {
    const narrow = mount(
      <Page title="Gerador" width="narrow">
        <p>conteúdo</p>
      </Page>,
    );
    const wide = mount(
      <Page title="Senhas" width="wide">
        <p>conteúdo</p>
      </Page>,
    );

    expect(narrow.className).toContain('max-w-2xl');
    expect(wide.className).toContain('max-w-6xl');
  });
});

describe('Page: cabeçalho', () => {
  it('mostra o título e o subtítulo', () => {
    mount(
      <Page title="Verificador 2FA" subtitle="os códigos da conta">
        <p>conteúdo</p>
      </Page>,
    );

    expect(screen.getByRole('heading', { name: 'Verificador 2FA' })).toBeInTheDocument();
    expect(screen.getByText('os códigos da conta')).toBeInTheDocument();
  });

  it('omite o subtítulo quando a tela não tem um', () => {
    mount(
      <Page title="Configurações">
        <p>conteúdo</p>
      </Page>,
    );

    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
  });

  it('põe a ação no cabeçalho e deixa o conteúdo como está', () => {
    mount(
      <Page
        title="Senhas"
        actions={
          <button type="button" onClick={() => undefined}>
            Nova credencial
          </button>
        }
      >
        <p>conteúdo</p>
      </Page>,
    );

    expect(screen.getByRole('button', { name: 'Nova credencial' })).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});
