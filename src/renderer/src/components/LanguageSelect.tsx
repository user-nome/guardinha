import type { JSX } from 'react';
import { LANGUAGE_LABELS, LANGUAGES } from '@zero/messages';
import { useMessages } from '@zero/renderer/i18n';
import { SelectField } from '@zero/renderer/components/SelectField';
import type { SelectOption } from '@zero/renderer/components/SelectField';
import type { Language } from '@zero/types';

/**
 * Seletor de idioma da barra lateral: o mesmo campo de escolha do formulário,
 * na versão compacta, com o rótulo "Idioma" e os nomes traduzidos.
 */

interface LanguageSelectProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  /**
   * Coluna estreita (a barra lateral recolhida): o gatilho passa a mostrar o
   * código do idioma, porque "Português (Brasil)" não cabe. O menu segue com os
   * nomes completos.
   */
  compact?: boolean;
}

function options(compact: boolean): SelectOption<Language>[] {
  return LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_LABELS[code],
    ...(compact ? { short: code } : {}),
  }));
}

export function LanguageSelect({
  language,
  onLanguageChange,
  compact = false,
}: LanguageSelectProps): JSX.Element {
  const m = useMessages();
  return (
    <SelectField
      label={m.app.languageLabel}
      size="sm"
      options={options(compact)}
      value={language}
      onChange={onLanguageChange}
      compact={compact}
    />
  );
}
