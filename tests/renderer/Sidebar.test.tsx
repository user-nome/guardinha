import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Sidebar } from '@zero/renderer/components/Sidebar';
import type { TabType } from '@zero/renderer/components/Sidebar';
import type { Language } from '@zero/types';

/**
 * A barra lateral é a navegação do app. O teste trava a ordem das abas, o
 * destaque da ativa e o encaminhamento dos dois botões destrutivos: bloquear
 * (reversível) e autodestruir (irreversível), que precisam ficar longe um do
 * outro.
 */

const TABS: { tab: TabType; label: string }[] = [
  { tab: 'home', label: 'Início (Senhas)' },
  { tab: 'generator', label: 'Gerador de Senhas' },
  { tab: 'authenticator', label: 'Verificador 2FA' },
  { tab: 'backup', label: 'Backup' },
  { tab: 'credits', label: 'Atribuições' },
  { tab: 'settings', label: 'Configurações' },
];

function mount(active: TabType = 'home'): {
  onTabChange: ReturnType<typeof vi.fn>;
  onLock: ReturnType<typeof vi.fn>;
  onDestroy: ReturnType<typeof vi.fn>;
  onLanguageChange: ReturnType<typeof vi.fn>;
} {
  const onTabChange = vi.fn<(tab: TabType) => void>();
  const onLock = vi.fn();
  const onDestroy = vi.fn();
  const onLanguageChange = vi.fn<(language: Language) => void>();
  render(
    <MessagesProvider language="pt-BR">
      <Sidebar
        activeTab={active}
        onTabChange={onTabChange}
        language="pt-BR"
        onLanguageChange={onLanguageChange}
        onLock={onLock}
        onDestroy={onDestroy}
      />
    </MessagesProvider>,
  );
  return { onTabChange, onLock, onDestroy, onLanguageChange };
}

describe('Sidebar: navegação', () => {
  it('lista as abas na ordem em que aparecem', () => {
    mount();
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.slice(0, TABS.length)).toEqual(TABS.map((tab) => tab.label));
  });

  it('avisa a troca de aba ao clicar em cada uma menos a ativa', async () => {
    const user = userEvent.setup();
    const { onTabChange } = mount();

    for (const { tab, label } of TABS) {
      if (tab === 'home') continue;
      await user.click(screen.getByRole('button', { name: label }));
      expect(onTabChange).toHaveBeenCalledWith(tab);
    }
  });

  it('marca a aba ativa como selecionada', () => {
    mount('generator');
    expect(screen.getByRole('button', { name: 'Gerador de Senhas' }).className).toContain(
      'text-emerald-400',
    );
    expect(screen.getByRole('button', { name: 'Início (Senhas)' }).className).toContain(
      'text-slate-400',
    );
  });

  it('move o destaque junto com a aba ativa', () => {
    mount('settings');
    expect(screen.getByRole('button', { name: 'Configurações' }).className).toContain(
      'text-emerald-400',
    );
    expect(screen.getByRole('button', { name: 'Gerador de Senhas' }).className).toContain(
      'text-slate-400',
    );
  });

  it('mostra que os dados são locais', () => {
    mount();
    expect(screen.getByText('100% Local / Criptografado')).toBeInTheDocument();
    // o rótulo e o valor ficam na mesma linha: sem o espaço entre eles a tela
    // lê "Status:100%", que parece erro de formatação
    const status = screen.getByText('100% Local / Criptografado').parentElement;
    expect(status?.textContent).toBe('Status: 100% Local / Criptografado');
  });

  it('anuncia a aba ativa como página atual', () => {
    mount('backup');
    expect(screen.getByRole('button', { name: 'Backup' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Gerador de Senhas' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('Sidebar: botões de cofre', () => {
  it('bloqueia o cofre pelo botão de bloqueio', async () => {
    const user = userEvent.setup();
    const { onLock } = mount();
    await user.click(screen.getByRole('button', { name: 'Bloquear cofre' }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('separa bloquear de autodestruir', async () => {
    const user = userEvent.setup();
    const { onDestroy, onLock } = mount();

    // clicar em autodestruir não pode bloquear o cofre junto
    await user.click(screen.getByRole('button', { name: 'Autodestruição' }));
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('estiliza a autodestruição em vermelho, longe da ação normal', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Autodestruição' }).className).toContain(
      'text-red-400',
    );
    expect(screen.getByRole('button', { name: 'Bloquear cofre' }).className).not.toContain(
      'text-red-400',
    );
  });
});
