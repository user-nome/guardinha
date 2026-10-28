import type { JSX } from 'react';
import { LANGUAGE_LABELS, LANGUAGES } from '@zero/messages';
import { useMessages } from '@zero/renderer/i18n';
import { SelectField } from '@zero/renderer/components/SelectField';
import type { SelectOption } from '@zero/renderer/components/SelectField';
import type { Language } from '@zero/types';

/**
 * Seletor de idioma da barra lateral: o campo de escolha do formulário em
 * versão compacta, com os nomes traduzidos.
 */

interface LanguageSelectProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  /** Barra recolhida: o gatilho mostra o código, o menu segue com o nome completo. */
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
