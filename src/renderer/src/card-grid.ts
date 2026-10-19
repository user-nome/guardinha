/**
 * Quantas colunas de cartão cabem na janela do app.
 *
 * A grade conta a largura da janela, e não o espaço que sobrou na área de
 * conteúdo, porque o cartão largo (o token de 2FA, com código, contagem e cópia
 * na mesma linha) precisa de uma largura mínima real: espremido, o código de seis
 * dígitos sai cortado no meio. A _container query_ media a coluna, que para em
 * `max-w-6xl`, então uma janela de 1600 px nunca chegaria à terceira coluna.
 *
 * As réguas são as do Tailwind, que é quem dá nome aos pontos de virada:
 * `md` em 768 px, `xl` em 1280 px e `2xl` em 1536 px. A janela mínima do app é
 * 400 px (`minWidth` em `src/main/index.ts`), então a coluna única é o estado em
 * que a grade fica numa tela pequena, e nenhuma tela passa de três colunas, nem
 * em monitor grande.
 *
 * São duas regras porque os cartões não têm o mesmo tamanho: a credencial
 * (`compact`) é baixa e cabe cedo; o token (`wide`) só vira três colunas quando
 * a janela é larga de verdade.
 */
export const CARD_GRID = {
  /** Cartão de credencial (Início): três botões e três linhas de texto. */
  compact: 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3',
  /** Cartão de token de 2FA: código, contagem e cópia na mesma linha. */
  wide: 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3',
} as const;
