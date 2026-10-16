import { createContext, useContext, useMemo } from 'react';
import type { JSX, ReactNode } from 'react';
import { messages } from '@zero/messages';
import type { Messages } from '@zero/messages';
import type { Language } from '@zero/types';

interface I18nValue {
  language: Language;
  m: Messages;
}

/**
 * Contexto de idioma da UI.
 *
 * O valor padrão é o pt-BR: componentes renderizados fora do provider (testes
 * isolados) continuam mostrando português. O provider vive no `App`, que lê o
 * idioma salvo (`settings.get`) e o troca ao salvar nas Configurações.
 */
const DEFAULT_VALUE: I18nValue = { language: 'pt-BR', m: messages('pt-BR') };

const I18nContext = createContext<I18nValue>(DEFAULT_VALUE);

interface MessagesProviderProps {
  language: Language;
  children: ReactNode;
}

export function MessagesProvider({ language, children }: MessagesProviderProps): JSX.Element {
  const value = useMemo<I18nValue>(() => ({ language, m: messages(language) }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Bundle de mensagens do idioma corrente. */
export function useMessages(): Messages {
  return useContext(I18nContext).m;
}

/** Idioma corrente (para formatadores, ex.: contagem regressiva da trava). */
export function useLanguage(): Language {
  return useContext(I18nContext).language;
}

/**
 * Formata os marcadores ricos de uma mensagem em nós React:
 * `**negrito**` vira `<strong>` e `` `código` `` vira `<code>`.
 *
 * Não usa `dangerouslySetInnerHTML`: os nós são criados pelo React, sem risco
 * de injeção. Devolve um array (usar com `{richText(texto)}`).
 */
export function richText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let cursor = 0;
  let key = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    const index = match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const bold = match[1];
    if (bold !== undefined) {
      nodes.push(<strong key={key}>{bold}</strong>);
    } else {
      nodes.push(<code key={key}>{match[2] ?? ''}</code>);
    }
    key += 1;
    cursor = index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
