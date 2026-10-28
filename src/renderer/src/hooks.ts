import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Valor mais recente, legível de dentro de um callback estável, sem refazer o efeito. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
