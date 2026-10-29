import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CARD_GRID } from '@zero/renderer/card-grid';
import { Authenticator } from '@zero/renderer/components/Authenticator';
import { Home } from '@zero/renderer/components/Home';
import { MessagesProvider } from '@zero/renderer/i18n';
import { installApi } from '../mocks/api.ts';
import type { AuthToken, Credential } from '@zero/types';

/** O jsdom não calcula layout, então o teste trava a classe que decide as colunas. */

const ENTRY: Credential = {
  id: 'id-github',
  title: 'GitHub',
  username: 'morgan',
  password: 'senha',
  domain: 'github.com',
  notes: '',
  createdAt: 1,
  updatedAt: 2,
};

const TOKEN: AuthToken = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  issuer: 'GitHub',
  account: 'alice@github.com',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  createdAt: 1,
  updatedAt: 2,
};

/** Classe da grade que carrega o cartão: a que é o pai mais próximo com `grid`. */
function gridClassOf(card: HTMLElement): string {
  const grid = card.closest('.grid');
  if (!(grid instanceof HTMLElement)) throw new Error('a grade de cartões não montou');
  return grid.className;
}

describe('CARD_GRID', () => {
  it('começa em uma coluna, que é o estado da janela estreita', () => {
    for (const value of Object.values(CARD_GRID)) {
      expect(value).toContain('grid-cols-1');
    }
  });

  it('vai a duas colunas em `md` (768 px), nos dois cartões', () => {
    for (const value of Object.values(CARD_GRID)) {
      expect(value).toContain('md:grid-cols-2');
    }
  });

  it('para em três colunas, e não em quatro, mesmo num monitor grande', () => {
    for (const value of Object.values(CARD_GRID)) {
      expect(value).toContain('grid-cols-3');
      expect(value).not.toContain('grid-cols-4');
    }
  });

  it('puxa a terceira coluna do cartão largo para o fim', () => {
    // o token tem código, contagem e cópia na mesma linha: só aceita 3 colunas no fim
    expect(CARD_GRID.wide).toContain('2xl:grid-cols-3');
    expect(CARD_GRID.compact).toContain('xl:grid-cols-3');
    expect(CARD_GRID.compact).not.toContain('2xl:grid-cols-3');
  });
});

describe('as telas que têm cartão', () => {
  it('a Home usa a régua do cartão compacto', async () => {
    installApi({ entries: [ENTRY] });
    render(
      <MessagesProvider language="pt-BR">
        <Home onToast={vi.fn()} />
      </MessagesProvider>,
    );

    expect(gridClassOf(await screen.findByText('GitHub'))).toBe(CARD_GRID.compact);
  });

  it('o Verificador 2FA usa a régua do cartão largo', async () => {
    installApi({ tokens: [TOKEN] });
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={vi.fn()} />
      </MessagesProvider>,
    );

    expect(gridClassOf(await screen.findByText('GitHub'))).toBe(CARD_GRID.wide);
  });
});
