import { useState } from 'react';
import type { JSX } from 'react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import { SensitivitySlider } from '@zero/renderer/components/SensitivitySlider';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { Page } from '@zero/renderer/components/Page';
import { errorMessage, manualCharacterLimit, strengthFor } from '@zero/shared';

interface GeneratorProps {
  onToast: (message: string) => void;
}

/** Um interruptor de categoria do gerador: o que ele marca e o texto dele. */
interface CharacterToggle {
  checked: boolean;
  set: (value: boolean) => void;
  label: string;
  count: number;
  setCount: (value: number) => void;
}

export function Generator({ onToast }: GeneratorProps): JSX.Element {
  const m = useMessages();
  const [length, setLength] = useState<number>(24);
  const [useLower, setUseLower] = useState(true);
  const [countLower, setCountLower] = useState(0);
  const [useUpper, setUseUpper] = useState(true);
  const [countUpper, setCountUpper] = useState(0);
  const [useNumbers, setUseNumbers] = useState(true);
  const [countNumbers, setCountNumbers] = useState(0);
  const [useSymbols, setUseSymbols] = useState(true);
  const [countSymbols, setCountSymbols] = useState(0);

  // As palavras são usadas como personalização; só entram literalmente com
  // consentimento explícito do usuário.
  const [customWords, setCustomWords] = useState<string[]>(['', '', '', '', '']);
  const [customWordCount, setCustomWordCount] = useState(5);
  const [includeCustomWords, setIncludeCustomWords] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const manualLimit = manualCharacterLimit(length);
  const literalWordLength = includeCustomWords
    ? Array.from(customWords.slice(0, customWordCount).join('')).length
    : 0;
  const selectedClassCount = countLower + countUpper + countNumbers + countSymbols;
  const manualCharacterCount = selectedClassCount + literalWordLength;

  const handleWordChange = (index: number, value: string): void => {
    setCustomWords((words) => words.map((word, i) => (i === index ? value : word)));
  };

  const handleGenerate = async (): Promise<void> => {
    if (length <= 0) {
      onToast(m.generator.emptyLength);
      return;
    }
    const selectedWords = customWords.slice(0, customWordCount);
    if (includeCustomWords && selectedWords.some((word) => word.trim() === '')) {
      onToast(m.generator.missingPersonalWords);
      return;
    }
    if (includeCustomWords && Array.from(selectedWords.join('')).length > length) {
      onToast(m.generator.personalWordsTooLong);
      return;
    }
    if (manualCharacterCount > manualLimit) {
      onToast(m.generator.manualLimitExceeded);
      return;
    }
    try {
      const password = await window.api.generator.generate({
        length,
        useLower,
        countLower,
        useUpper,
        countUpper,
        useNumbers,
        countNumbers,
        useSymbols,
        countSymbols,
        customEntropyWords: selectedWords,
        includeCustomEntropyWords: includeCustomWords,
      });
      setGeneratedPassword(password);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.invalidGenerator));
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await copyAndAutoClear(generatedPassword);
      onToast(m.generator.toastCopied);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.internal));
    }
  };

  const toggles: CharacterToggle[] = [
    {
      checked: useUpper,
      set: setUseUpper,
      label: m.generator.upper,
      count: countUpper,
      setCount: setCountUpper,
    },
    {
      checked: useLower,
      set: setUseLower,
      label: m.generator.lower,
      count: countLower,
      setCount: setCountLower,
    },
    {
      checked: useNumbers,
      set: setUseNumbers,
      label: m.generator.numbers,
      count: countNumbers,
      setCount: setCountNumbers,
    },
    {
      checked: useSymbols,
      set: setUseSymbols,
      label: m.generator.symbols,
      count: countSymbols,
      setCount: setCountSymbols,
    },
  ];

  const checkedCount = toggles.filter((toggle) => toggle.checked).length;

  /**
   * O conjunto de caracteres da senha é só o que está marcado, então desligar a
   * última categoria deixaria o gerador sem o que sortear. A última ligada fica
   * ligada: para trocar tudo de vez, o usuário desliga uma e liga outra.
   */
  const handleToggle = (
    set: (value: boolean) => void,
    setCount: (value: number) => void,
    checked: boolean,
  ): void => {
    if (!checked && checkedCount <= 1) return;
    set(checked);
    if (!checked) setCount(0);
  };

  return (
    <Page width="narrow" title={m.generator.title} subtitle={m.generator.subtitle}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-5">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300 font-medium">{m.generator.lengthLabel}</span>
            <span className="text-emerald-400 font-bold">{m.generator.lengthValue(length)}</span>
          </div>
          <SensitivitySlider
            value={length}
            min={0}
            max={72}
            label={m.generator.lengthLabel}
            onChange={setLength}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {toggles.map((toggle) => (
            <div
              key={toggle.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm text-slate-300 bg-slate-800/50 p-3 rounded-lg border border-slate-600"
            >
              <label className="flex min-w-0 items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={toggle.checked}
                  onChange={(e) => {
                    handleToggle(toggle.set, toggle.setCount, e.target.checked);
                  }}
                  className="accent-emerald-500"
                />
                <span className="break-words">{toggle.label}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span>{m.generator.quantityCount}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={toggle.count}
                  disabled={!toggle.checked}
                  aria-valuemax={Math.max(
                    0,
                    manualLimit - (selectedClassCount - toggle.count) - literalWordLength,
                  )}
                  aria-label={`${toggle.label}: ${m.generator.quantityCount}`}
                  onChange={(e) => {
                    const digits = e.currentTarget.value.replace(/\D/g, '');
                    const parsed = digits === '' ? 0 : Number(digits);
                    const available = Math.max(
                      0,
                      manualLimit - (selectedClassCount - toggle.count) - literalWordLength,
                    );
                    toggle.setCount(
                      Number.isFinite(parsed)
                        ? Math.min(available, Math.max(0, Math.trunc(parsed)))
                        : 0,
                    );
                  }}
                  className="w-16 bg-slate-950 border border-transparent rounded px-2 py-1.5 text-center text-slate-200 outline-none focus:border-emerald-400 disabled:opacity-40"
                />
              </label>
            </div>
          ))}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-emerald-400 mb-2">
            <Sparkles className="w-4 h-4" />
            {m.generator.entropyTitle}
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-slate-300 mb-3">
            {m.generator.personalWordCount}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customWordCount}
              aria-label={m.generator.personalWordCount}
              onChange={(e) => {
                const digits = e.currentTarget.value.replace(/\D/g, '');
                const parsed = digits === '' ? 0 : Number(digits);
                const nextCount = Number.isFinite(parsed)
                  ? Math.min(5, Math.max(0, Math.trunc(parsed)))
                  : 0;
                setCustomWordCount(nextCount);
                if (nextCount === 0) setIncludeCustomWords(false);
              }}
              className="w-16 bg-slate-950 border border-transparent rounded px-2 py-1 text-center text-slate-200 outline-none focus:border-emerald-400"
            />
          </label>
          <p
            className={`text-xs mb-3 ${manualCharacterCount > manualLimit ? 'text-red-300' : 'text-slate-400'}`}
            aria-live="polite"
          >
            {m.generator.manualCharacterUsage(manualCharacterCount, manualLimit)}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {customWords.slice(0, customWordCount).map((word, index) => {
              /* v8 ignore next -- o contador para em 5 e o bundle traz os 5
                 marcadores; o `??` existe só para o `noUncheckedIndexedAccess`. */
              const placeholder = m.generator.entropyPlaceholders[index] ?? '';
              return (
                <input
                  key={String(index)}
                  type="text"
                  placeholder={placeholder}
                  value={word}
                  onChange={(e) => handleWordChange(index, e.target.value)}
                  className="bg-slate-950 border border-transparent rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400"
                />
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-3">
            <input
              type="checkbox"
              checked={includeCustomWords}
              disabled={customWordCount === 0}
              onChange={(e) => setIncludeCustomWords(e.currentTarget.checked)}
              className="accent-emerald-500"
            />
            {m.generator.includePersonalWords}
          </label>
          {includeCustomWords && (
            <p className="text-xs text-amber-300 mt-2">{m.generator.personalWordsWarning}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-semibold text-slate-950 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {m.generator.generate}
        </button>

        {generatedPassword !== '' && (
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3 font-mono text-emerald-400 break-all text-sm">
            <span>{generatedPassword}</span>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              title={m.generator.copyTitle}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        )}
        {generatedPassword !== '' && (
          <StrengthMeter result={strengthFor('password').evaluate(generatedPassword)} />
        )}
      </div>
    </Page>
  );
}
