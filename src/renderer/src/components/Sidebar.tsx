import type { JSX } from 'react';
import {
  Dices,
  Film,
  HardDrive,
  Key,
  Lock,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { LanguageSelect } from '@zero/renderer/components/LanguageSelect';
import { useMessages } from '@zero/renderer/i18n';
import type { Language, NavLabelKey, TabType } from '@zero/types';

export type { TabType } from '@zero/types';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLock: () => void;
  /** Abre o diálogo de confirmação da autodestruição. */
  onDestroy: () => void;
}

/** Uma tela da barra lateral: onde ela leva e com qual ícone ela aparece. */
interface NavItem {
  tab: NavLabelKey;
  icon: typeof Key;
}

const NAV_ITEMS: readonly NavItem[] = [
  { tab: 'home', icon: Key },
  { tab: 'generator', icon: Dices },
  { tab: 'authenticator', icon: Smartphone },
  { tab: 'backup', icon: HardDrive },
  { tab: 'credits', icon: Film },
  { tab: 'settings', icon: Settings },
];

/**
 * Navegação, idioma, bloqueio e autodestruição.
 *
 * A barra tem duas formas, e o breakpoint é o mesmo da área de conteúdo: acima
 * de `lg` ela é a coluna larga de sempre; abaixo disso ela vira um trilho de
 * ícones, porque 256 px de menu fixos deixariam o conteúdo espremido numa
 * janela estreita. Os rótulos somem do desenho, nunca da árvore de
 * acessibilidade: cada botão mantém `aria-label` e `title`, então o nome
 * acessível é o mesmo nas duas formas.
 */
export function Sidebar({
  activeTab,
  onTabChange,
  language,
  onLanguageChange,
  onLock,
  onDestroy,
}: SidebarProps): JSX.Element {
  const m = useMessages();

  return (
    <aside className="flex w-28 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-900 p-2 lg:w-64 lg:p-4">
      <div className="space-y-4 lg:space-y-6">
        <div className="flex items-center justify-center lg:justify-start lg:gap-3 lg:px-2">
          <Shield className="w-7 h-7 shrink-0 text-emerald-400" />
          <div className="min-w-0">
            {/* o nome do app some do trilho, mas continua como título da página
                para quem navega por leitor de tela */}
            <h1 className="sr-only font-bold text-lg leading-none text-slate-100 lg:not-sr-only">
              {m.app.name}
            </h1>
            <span className="hidden text-xs text-slate-400 lg:block">{m.app.subtitle}</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5 lg:gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const label = m.app.nav[item.tab];
            const active = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onTabChange(item.tab)}
                title={label}
                aria-label={label}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={`flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors lg:justify-start lg:px-3 ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* `compact`: no trilho estreito o campo mostra o código do idioma
            ("pt-BR") em vez do nome completo, que não caberia. */}
        <div className="lg:px-2">
          <LanguageSelect language={language} onLanguageChange={onLanguageChange} compact />
        </div>
      </div>

      <div className="space-y-2 lg:mt-auto">
        <button
          type="button"
          onClick={onLock}
          title={m.app.lockTitle}
          aria-label={m.app.lock}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 bg-slate-800/60 hover:bg-slate-800 hover:text-slate-200 border border-slate-800 transition-colors lg:px-3"
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">{m.app.lock}</span>
        </button>
        {/* A autodestruição é irreversível: fica logo abaixo do "Bloquear
            cofre", a um clique dele, e ainda exige digitar uma palavra no
            diálogo antes de fazer qualquer coisa. */}
        <button
          type="button"
          onClick={onDestroy}
          title={m.panic.manualTitle}
          aria-label={m.panic.manualTitle}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-red-400/80 bg-red-950/20 hover:bg-red-950/40 hover:text-red-300 border border-red-900/50 transition-colors lg:px-3"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">{m.panic.manualTitle}</span>
        </button>
      </div>

      <div className="hidden border-t border-slate-800 px-2 pt-3 text-center text-xs text-slate-500 lg:block">
        {m.app.statusLabel}{' '}
        <span className="text-emerald-400 font-semibold">{m.app.statusLocal}</span>
      </div>
    </aside>
  );
}
