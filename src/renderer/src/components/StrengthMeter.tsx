import type { JSX } from 'react';
import { useMessages } from '@zero/renderer/i18n';
import type { StrengthResult } from '@zero/shared';

interface StrengthMeterProps {
  result: StrengthResult;
  /** Texto de apoio opcional (dica da credencial ou aviso informativo). */
  hint?: string;
}

const BAR_CLASSES = [
  'bg-rose-600',
  'bg-amber-500',
  'bg-yellow-400',
  'bg-emerald-400',
  'bg-emerald-500',
];

const TEXT_CLASSES = [
  'text-rose-500',
  'text-amber-400',
  'text-yellow-400',
  'text-emerald-400',
  'text-emerald-500',
];

/** Barra de força com a nota e os motivos; só informativa (quem bloqueia é quem chama). */
export function StrengthMeter({ result, hint }: StrengthMeterProps): JSX.Element {
  const m = useMessages();
  const score = Math.max(0, Math.min(result.score, 4));
  const color = TEXT_CLASSES[score] ?? '';
  const fill = BAR_CLASSES[score] ?? '';
  const lit = Math.max(1, score);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{m.strength.label}</span>
        <span className={`text-xs font-medium ${color}`}>{m.strength.levels[result.level]}</span>
      </div>
      <div className="flex gap-1 h-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`flex-1 rounded-full ${index < lit ? fill : 'bg-slate-800'}`}
          />
        ))}
      </div>
      {result.reasons.length > 0 && (
        <p className="text-xs text-slate-500 leading-relaxed">
          {result.reasons.map((reason) => m.strength.reasons[reason]).join(' · ')}
        </p>
      )}
      {hint !== undefined && <p className="text-xs text-slate-600 leading-relaxed">{hint}</p>}
    </div>
  );
}
