import { useState } from 'react';
import type { JSX } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import { errorMessage } from '@zero/shared';
import type { MigrationMethod, VaultMigrationInput, VaultMigrationStatus } from '@zero/types';

interface MigrationModalProps {
  status: VaultMigrationStatus;
  /** Fecha o aviso sem migrar; o cofre continua no formato antigo. */
  onLater: () => void;
  /** Chamado depois de uma migração bem-sucedida. */
  onDone: () => Promise<void>;
}

/** Aviso de atualização depois do login: pede todas as credenciais e migra o cofre de uma vez. */
export function MigrationModal({ status, onLater, onDone }: MigrationModalProps): JSX.Element {
  const m = useMessages();
  const [values, setValues] = useState<VaultMigrationInput>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labels: Record<MigrationMethod, string> = {
    master: m.migration.masterLabel,
    pin: m.migration.pinLabel,
    recovery: m.migration.recoveryLabel,
  };
  const missing = status.methods.some((kind) => (values[kind] ?? '').trim() === '');

  const setField = (kind: MigrationMethod, value: string): void => {
    setValues((current) => ({ ...current, [kind]: value }));
  };

  const handleMigrate = async (): Promise<void> => {
    /* v8 ignore next -- o botão fica desabilitado enquanto falta credencial ou a
       operação corre; a guarda protege quem chamar o manipulador por outro caminho. */
    if (missing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.vault.migrate(values);
      if (!result.ok) {
        setError(result.error ?? m.errors.internal);
        return;
      }
      await onDone();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-50 p-4 sm:p-6">
      <div className="my-auto w-full max-w-md bg-slate-900 border border-emerald-900/60 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">{m.migration.title}</h2>
          </div>
          <button
            type="button"
            onClick={onLater}
            aria-label={m.common.close}
            className="text-slate-500 hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-300">{richText(m.migration.subtitle)}</p>
          <p className="text-xs text-emerald-400">
            {m.migration.version(status.fromVersion, status.toVersion)}
          </p>
          <p className="text-xs text-slate-400">
            {m.migration.summary(status.entries, status.authTokens)}
          </p>

          {status.methods.map((kind) => (
            <label key={kind} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">{labels[kind]}</span>
              {kind === 'recovery' ? (
                <textarea
                  value={values[kind] ?? ''}
                  onChange={(event) => setField(kind, event.target.value)}
                  rows={3}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-500/60 resize-none"
                />
              ) : (
                <input
                  type="password"
                  inputMode={kind === 'pin' ? 'numeric' : undefined}
                  value={values[kind] ?? ''}
                  onChange={(event) => setField(kind, event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              )}
            </label>
          ))}

          <p className="text-xs text-slate-500">{m.migration.methodsHint}</p>
          <p className="text-xs text-amber-400">{m.migration.warning}</p>
          {error !== null && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onLater}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
            >
              {m.migration.later}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleMigrate();
              }}
              disabled={missing || busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? m.migration.working : m.migration.action}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
