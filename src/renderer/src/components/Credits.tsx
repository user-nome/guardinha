import type { JSX } from 'react';
import { DEPENDENCIES } from '@zero/renderer/attributions';
import { useMessages } from '@zero/renderer/i18n';

function renderHalf(suffix: string, footer: string): JSX.Element {
  return (
    <div className="space-y-12 text-center">
      {DEPENDENCIES.map((dep) => (
        <div key={`${dep.name}-${suffix}`} className="space-y-1">
          <p className="text-xs tracking-widest text-slate-500 uppercase">{dep.role}</p>
          <p className="text-lg font-bold text-slate-200">{dep.name}</p>
        </div>
      ))}
      <p className="text-xs text-slate-600 pt-8 uppercase tracking-widest">{footer}</p>
    </div>
  );
}

/** Pós-créditos de cinema: rolagem lenta em loop (pausa no hover, respeita reduced-motion). */
export function Credits(): JSX.Element {
  const m = useMessages();

  return (
    <div className="h-full flex flex-col items-center overflow-hidden relative">
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-widest text-emerald-400 uppercase border-b border-emerald-500/20 pb-4 mb-6 shrink-0 text-center">
        {m.attributions.title}
      </h2>

      <div className="credits-viewport flex-1 w-full max-w-lg overflow-hidden">
        <div className="credits-track space-y-12">
          {renderHalf('a', m.attributions.footer)}
          {renderHalf('b', m.attributions.footer)}
        </div>
      </div>

      <p className="text-xs text-slate-600 mt-4 shrink-0">{m.attributions.loopHint}</p>
    </div>
  );
}
