import { useState } from 'react';
import type { JSX } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';

interface DestroyModalProps {
  onClose: () => void;
  onDestroyed: () => Promise<void>;
}

/**
 * Confirmação em duas etapas da autodestruição. Destruir o cofre é irreversível
 * e o botão que chama isto fica a um clique do "Bloquear cofre", na mesma barra
 * lateral: exigir uma palavra digitada é o que separa um toque acidental de uma
 * decisão.
 */
export function DestroyModal({ onClose, onDestroyed }: DestroyModalProps): JSX.Element {
  const m = useMessages();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = typed === m.panic.confirmWord;

  const handleDestroy = async (): Promise<void> => {
    if (!matches || busy) return;
    setBusy(true);
    try {
      await window.api.vault.destroy();
      await onDestroyed();
    } catch {
      // o cofre pode já ter sido destruído por outro caminho (PIN de coação):
      // nesse caso não há erro a mostrar, só o estado novo
      await onDestroyed();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-50 p-4 sm:p-6">
      <div className="my-auto w-full max-w-md bg-slate-900 border border-red-900/60 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">{m.panic.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={m.common.close}
            className="text-slate-500 hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-300">{richText(m.panic.subtitle)}</p>
          <p className="text-sm text-slate-400">{m.panic.manualSubtitle}</p>

          <div>
            <label htmlFor="destroy-confirm" className="block text-sm text-slate-300 mb-2">
              {m.panic.confirmNameLabel}
            </label>
            <input
              id="destroy-confirm"
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-red-500/60"
            />
            {typed !== '' && !matches && (
              <p className="mt-1 text-xs text-red-400">{m.panic.confirmMismatch}</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
            >
              {m.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleDestroy();
              }}
              disabled={!matches || busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? m.panic.working : m.panic.action}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
