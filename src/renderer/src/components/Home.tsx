import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Copy, Globe, KeyRound, Pencil, Plus, Search, ShieldAlert, User, X } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { CARD_GRID } from '@zero/renderer/card-grid';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import { errorMessage } from '@zero/shared';
import { useLatest } from '@zero/renderer/hooks';
import { EntryModal } from '@zero/renderer/components/EntryModal';
import { Page } from '@zero/renderer/components/Page';
import type { Credential } from '@zero/types';

interface HomeProps {
  onToast: (message: string) => void;
}

export function Home({ onToast }: HomeProps): JSX.Element {
  const m = useMessages();
  const [entries, setEntries] = useState<Credential[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Credential | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmPasswordCopy, setConfirmPasswordCopy] = useState<Credential | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fora das dependências: recarregar a lista a cada troca de idioma seria à toa.
  const internalError = useLatest(m.errors.internal);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setEntries(await window.api.entries.list());
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught, internalError.current));
    }
  }, [internalError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCopy = async (value: string): Promise<void> => {
    try {
      await copyAndAutoClear(value);
      onToast(m.app.toastCopied);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.internal));
    }
  };

  const handleOpenSite = async (domain: string): Promise<void> => {
    try {
      await window.api.openDomain(domain);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.invalidDomain));
    }
  };

  const openNew = (): void => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (credential: Credential): void => {
    setEditing(credential);
    setModalOpen(true);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = (entries ?? []).filter(
    (entry) =>
      normalizedQuery === '' ||
      entry.title.toLowerCase().includes(normalizedQuery) ||
      entry.username.toLowerCase().includes(normalizedQuery) ||
      entry.domain.toLowerCase().includes(normalizedQuery),
  );

  if (entries === null) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400">
        {loadError ?? m.home.loading}
      </div>
    );
  }

  return (
    <Page
      width="wide"
      title={m.home.title}
      subtitle={<p className="text-xs text-slate-500">{m.home.entryCount(entries.length)}</p>}
      actions={
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          {m.home.newEntry}
        </button>
      }
    >
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.home.searchPlaceholder}
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none"
        />
      </div>

      {loadError !== null && entries.length === 0 && (
        <p className="text-xs text-rose-400">{loadError}</p>
      )}

      {entries.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-10 text-center space-y-3">
          <KeyRound className="w-8 h-8 text-emerald-400 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-200">{m.home.emptyTitle}</h3>
          <p className="text-sm text-slate-400">{m.home.emptyText}</p>
          <button
            type="button"
            onClick={openNew}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
          >
            {m.home.addFirst}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-2">
          <h3 className="text-base font-semibold text-slate-200">{m.home.emptyFoundTitle}</h3>
          <p className="text-sm text-slate-400">{m.home.emptyFoundText}</p>
        </div>
      ) : (
        /* Grade pela largura da janela; ver `card-grid.ts`. */
        <div className={CARD_GRID.compact}>
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{entry.title}</p>
                  <p className="text-xs text-slate-400 truncate">{entry.username}</p>
                  {entry.domain !== '' && (
                    <p className="text-xs text-slate-500 truncate">{entry.domain}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(entry)}
                  title={m.home.modalEdit}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy(entry.username);
                  }}
                  title={m.home.copyUser}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                >
                  <User className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPasswordCopy(entry)}
                  title={m.home.copyPass}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenSite(entry.domain);
                  }}
                  title={m.home.openSite}
                  disabled={entry.domain === ''}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 disabled:opacity-40"
                >
                  <Globe className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <EntryModal
          entry={editing}
          onClose={() => setModalOpen(false)}
          onChanged={reload}
          onToast={onToast}
        />
      )}
      {confirmPasswordCopy !== null && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 sm:p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="password-copy-title"
        >
          <div className="my-auto w-full max-w-md rounded-xl border border-amber-700/50 bg-slate-900 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 space-y-2">
                <h2 id="password-copy-title" className="text-sm font-semibold text-slate-100">
                  {m.home.copyPasswordConfirmTitle}
                </h2>
                <p className="text-sm text-slate-300">{m.home.copyPasswordWarning}</p>
                <p className="break-all rounded bg-slate-950 px-3 py-2 font-mono text-xs text-amber-300">
                  {confirmPasswordCopy.domain !== ''
                    ? confirmPasswordCopy.domain
                    : m.home.copyPasswordNoDomain}
                </p>
                <p className="text-xs text-slate-400">{m.home.copyPasswordExposure}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmPasswordCopy(null)}
                title={m.common.close}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPasswordCopy(null)}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  const credential = confirmPasswordCopy;
                  setConfirmPasswordCopy(null);
                  void handleCopy(credential.password);
                }}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                {m.home.copyPasswordAnyway}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
