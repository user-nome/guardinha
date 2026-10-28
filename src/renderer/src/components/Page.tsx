import type { JSX, ReactNode } from 'react';

/** Largura máxima da coluna de conteúdo: estreita para formulário, larga para grade. */
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
