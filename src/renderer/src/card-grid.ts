/** Colunas pela largura da janela, nas réguas `md`, `xl` e `2xl` do Tailwind. */
export const CARD_GRID = {
  /** Cartão de credencial (Início): três botões e três linhas de texto. */
  compact: 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3',
  /** Cartão de token de 2FA: código, contagem e cópia na mesma linha. */
  wide: 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3',
} as const;
