import type { Language } from '@zero/types';
import { en } from '@zero/messages/en';
import { ja } from '@zero/messages/ja';
import { ko } from '@zero/messages/ko';
import { ptBR } from '@zero/messages/pt-BR';
import { zhCN } from '@zero/messages/zh-CN';
import type { Messages } from '@zero/messages/pt-BR';

export type { Messages };

/** Idiomas suportados, na ordem de exibição, com o português canônico primeiro. */
export const LANGUAGES: readonly Language[] = ['pt-BR', 'zh-CN', 'ko', 'ja', 'en'];

/** Nome nativo de cada idioma (não se traduz: aparece assim em qualquer idioma). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  'pt-BR': 'Português (Brasil)',
  'zh-CN': '简体中文',
  ko: '한국어',
  ja: '日本語',
  en: 'English',
};

const BUNDLES: Record<Language, Messages> = {
  'pt-BR': ptBR,
  'zh-CN': zhCN,
  ko,
  ja,
  en,
};

/** Mensagens do idioma. */
export function messages(language: Language): Messages {
  return BUNDLES[language];
}

export { en, ja, ko, ptBR, zhCN };
