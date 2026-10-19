import { useState } from 'react';
import type { JSX } from 'react';
import { Eye, EyeOff, Trash2, X } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { errorMessage, strengthFor } from '@zero/shared';
import type { Credential, CredentialInput } from '@zero/types';

interface EntryModalProps {
  /** `null` cria uma credencial nova. */
  entry: Credential | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
}

export function EntryModal({ entry, onClose, onChanged, onToast }: EntryModalProps): JSX.Element {
  const m = useMessages();
  const isEdit = entry !== null;

  const [title, setTitle] = useState(entry?.title ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState(entry?.password ?? '');
  const [domain, setDomain] = useState(entry?.domain ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [visible, setVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async (): Promise<void> => {
    setError(null);
    if (title.trim() === '') {
      setError(m.home.titleRequired);
      return;
    }
    const input: CredentialInput = {
      title,
      username,
      password,
      domain,
      notes,
      ...(entry !== null ? { id: entry.id } : {}),
    };
    setBusy(true);
    try {
      await window.api.entries.save(input);
      await onChanged();
      onToast(m.home.toastSaved);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, m.home.saveError));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (target: Credential): Promise<void> => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await window.api.entries.remove(target.id);
      await onChanged();
      onToast(m.home.toastRemoved);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, m.home.removeError));
    } finally {
      setBusy(false);
    }
  };

  const fieldClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none';

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="my-auto w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-100">
            {isEdit ? m.home.modalEdit : m.home.modalNew}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title={m.common.close}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.home.titleLabel}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={m.home.titlePlaceholder}
            autoFocus
            className={fieldClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.home.usernameLabel}</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={m.home.usernamePlaceholder}
            className={fieldClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.home.passwordLabel}</span>
          <div className="relative">
            <input
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={m.home.passwordPlaceholder}
              className={`${fieldClass} pr-10 font-mono`}
            />
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              title={visible ? m.home.hidePassword : m.home.showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
            >
              {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password !== '' && (
            <StrengthMeter
              result={strengthFor('password').evaluate(password)}
              hint={m.strength.entryNote}
            />
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.home.domainLabel}</span>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={m.home.domainPlaceholder}
            className={fieldClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.home.notesLabel}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={m.home.notesPlaceholder}
            rows={3}
            className={`${fieldClass} resize-none`}
          />
        </label>

        {error !== null && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {entry !== null ? (
            <button
              type="button"
              onClick={() => {
                void handleDelete(entry);
              }}
              disabled={busy}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                confirmDelete
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/40'
                  : 'bg-slate-800/60 text-slate-400 border-slate-800 hover:text-rose-400'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1.5" />
              {confirmDelete ? m.home.deleteConfirm : m.common.delete}
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 bg-slate-800/60 border border-slate-800 hover:text-slate-200"
            >
              {m.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? m.common.saving : m.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
