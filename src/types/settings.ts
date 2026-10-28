/** Idiomas da interface; a ordem de exibição mora em `LANGUAGES`. */
export type Language = 'pt-BR' | 'zh-CN' | 'ko' | 'ja' | 'en';

export interface AppSettings {
  language: Language;
}
