import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Valor mais recente, legível de dentro de um callback estável.
 *
 * Existe para o caso em que uma string traduzida entra num `useCallback` só como
 * texto de fallback. Botar o texto na lista de dependências refaz o efeito a
 * cada troca de idioma (trocar pt-BR por ja dispara uma busca de dados), e
 * omitir a dependência deixa o callback com o texto velho. O ref dá os dois:
 * o callback não recria, e ainda assim lê o texto do idioma atual.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
