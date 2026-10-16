/**
 * Idiomas da interface. A ordem de exibição não é a do tipo: quem mostra é
 * `LANGUAGES`, em `src/messages/index.ts`.
 */
export type Language = 'pt-BR' | 'zh-CN' | 'ko' | 'ja' | 'en';

export interface AppSettings {
  language: Language;
}
