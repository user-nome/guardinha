import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Credits } from '@zero/renderer/components/Credits';
import { DEPENDENCIES } from '@zero/renderer/attributions';
import { installApi } from '../mocks/api.ts';

/** Os créditos montam a lista duas vezes para a rolagem em loop não mostrar emenda. */

function renderCredits(): void {
  render(
    <MessagesProvider language="pt-BR">
      <Credits />
    </MessagesProvider>,
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Credits', () => {
  it('mostra o título e a dica de loop', () => {
    renderCredits();
    expect(screen.getByText('ATRIBUIÇÕES')).toBeInTheDocument();
    expect(screen.getByText(/voltam ao início em loop/)).toBeInTheDocument();
  });

  it('lista as dependências com o papel de cada uma', () => {
    renderCredits();
    for (const dep of DEPENDENCIES) {
      expect(screen.getAllByText(dep.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(dep.role).length).toBeGreaterThan(0);
    }
  });

  it('duplica a lista para a rolagem em loop não ter emenda', () => {
    renderCredits();
    // duas metades, cada dependência duas vezes
    for (const dep of DEPENDENCIES) {
      expect(screen.getAllByText(dep.name)).toHaveLength(2);
    }
  });

  it('repete o rodapé em cada metade', () => {
    renderCredits();
    expect(screen.getAllByText(/100% Offline & Local/i)).toHaveLength(2);
  });
});

describe('main.tsx (bootstrap do renderer)', () => {
  it('monta o app no #root', async () => {
    // o entrypoint procurava o contêiner e só renderizava se o achasse
    installApi();
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    vi.resetModules();
    await import('@zero/renderer/main');

    // `createRoot().render` é concorrente: a árvore entra no próximo ciclo
    await waitFor(() => {
      expect(container.innerHTML).not.toBe('');
    });
    expect(container.textContent).toContain('Verificando o cofre');
  });

  it('ignora a montagem quando não existe #root', async () => {
    document.body.innerHTML = '';
    vi.resetModules();
    await expect(import('@zero/renderer/main')).resolves.toBeDefined();
    expect(document.body.innerHTML).toBe('');
  });
});
