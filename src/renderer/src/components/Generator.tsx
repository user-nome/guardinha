import { useState } from 'react';
import type { JSX } from 'react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import { SensitivitySlider } from '@zero/renderer/components/SensitivitySlider';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { Page } from '@zero/renderer/components/Page';
import { errorMessage, strengthFor } from '@zero/shared';

interface GeneratorProps {
  onToast: (message: string) => void;
}

/** Um interruptor de categoria do gerador: o que ele marca e o texto dele. */
interface CharacterToggle {
  checked: boolean;
  set: (value: boolean) => void;
  label: string;
}

export function Generator({ onToast }: GeneratorProps): JSX.Element {
  const m = useMessages();
  const [length, setLength] = useState<number>(24);
  const [useLower, setUseLower] = useState(true);
  const [useUpper, setUseUpper] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);

  // 5 gostos/palavras pessoais para aumentar a entropia
  const [customWords, setCustomWords] = useState<string[]>(['', '', '', '', '']);
  const [generatedPassword, setGeneratedPassword] = useState('');

  const handleWordChange = (index: number, value: string): void => {
    setCustomWords((words) => words.map((word, i) => (i === index ? value : word)));
  };

  const handleGenerate = async (): Promise<void> => {
    if (length <= 0) {
      onToast(m.generator.emptyLength);
      return;
    }
    try {
      const password = await window.api.generator.generate({
        length,
        useLower,
        useUpper,
        useNumbers,
        useSymbols,
        customEntropyWords: customWords,
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
    { checked: useUpper, set: setUseUpper, label: m.generator.upper },
    { checked: useLower, set: setUseLower, label: m.generator.lower },
    { checked: useNumbers, set: setUseNumbers, label: m.generator.numbers },
    { checked: useSymbols, set: setUseSymbols, label: m.generator.symbols },
  ];

  const checkedCount = toggles.filter((toggle) => toggle.checked).length;

  /**
   * O conjunto de caracteres da senha é só o que está marcado, então desligar a
   * última categoria deixaria o gerador sem o que sortear. A última ligada fica
   * ligada: para trocar tudo de vez, o usuário desliga uma e liga outra.
   */
  const handleToggle = (set: (value: boolean) => void, checked: boolean): void => {
    if (!checked && checkedCount <= 1) return;
    set(checked);
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {toggles.map((toggle) => (
            <label
              key={toggle.label}
              className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 p-2.5 rounded-lg border border-slate-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={toggle.checked}
                onChange={(e) => {
                  handleToggle(toggle.set, e.target.checked);
                }}
                className="accent-emerald-500"
              />
              {toggle.label}
            </label>
          ))}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-emerald-400 mb-2">
            <Sparkles className="w-4 h-4" />
            {m.generator.entropyTitle}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {customWords.map((word, index) => (
              <input
                key={String(index)}
                type="text"
                placeholder={m.generator.entropyPlaceholders[index] ?? ''}
                value={word}
                onChange={(e) => handleWordChange(index, e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none"
              />
            ))}
          </div>
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
