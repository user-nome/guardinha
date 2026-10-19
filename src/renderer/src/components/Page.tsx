import type { JSX, ReactNode } from 'react';

/**
 * Coluna de conteúdo de uma tela: o mesmo esqueleto para toda aba.
 *
 * Três coisas acontecem aqui, e as três são o que impede a interface de ficar
 * grudada no canto da tela ou espremida numa janela pequena:
 *
 * - **centraliza**: a coluna tem largura máxima e fica no meio da área útil, em
 *   vez de ficar grudada no canto superior esquerdo da janela;
 * - **limita a largura máxima por tipo de tela**: formulário estreito (Gerador,
 *   Configurações, Backup) lê melhor numa coluna curta do que esticado num
 *   monitor largo; grade de cartões (Início, 2FA) é o contrário;
 * - **põe o teto das colunas**: numa tela muito larga os cartões param de
 *   esticar e continuam em três, porque a contagem de colunas mora em
 *   `card-grid.ts`, que decide pela largura da janela, e não por esta coluna.
 */
export type PageWidth = 'narrow' | 'medium' | 'wide';

const WIDTH_CLASS = {
  narrow: 'max-w-2xl',
  medium: 'max-w-4xl',
  wide: 'max-w-6xl',
} satisfies Record<PageWidth, string>;

export interface PageProps {
  title: string;
  /** Linha abaixo do título. Quem passa um elemento controla o próprio estilo. */
  subtitle?: ReactNode;
  /** Botão ou conjunto de botões à direita do título; some na coluna estreita. */
  actions?: ReactNode;
  width?: PageWidth;
  children: ReactNode;
}

export function Page({
  title,
  subtitle,
  actions,
  width = 'medium',
  children,
}: PageProps): JSX.Element {
  return (
    <div className={`mx-auto w-full space-y-6 ${WIDTH_CLASS[width]}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
          {subtitle !== undefined && <div className="text-sm text-slate-400">{subtitle}</div>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
