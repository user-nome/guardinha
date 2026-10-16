import { useState } from 'react';
import type { JSX } from 'react';
import { AlertTriangle, HardDriveDownload, HardDriveUpload, KeyRound } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import { Page } from '@zero/renderer/components/Page';
import { errorMessage } from '@zero/shared';

interface BackupProps {
  onToast: (message: string) => void;
}

/**
 * Tela de backup e restauração do cofre.
 *
 * A tela só dispara os canais `window.api.backup`: quem lê o cofre, monta o
 * pacote `.gbk` e abre o diálogo nativo é o processo main. O pacote é cópia de
 * bytes já cifrados, então nenhuma senha ou segredo passa por aqui; o que volta
 * é a contagem de arquivos e o caminho, que viram confirmação no toast.
 */
export function Backup({ onToast }: BackupProps): JSX.Element {
  const m = useMessages();

  const [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Roda uma operação do IPC com o estado de "ocupado" e o erro no toast. */
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = (): Promise<void> =>
    run(async () => {
      const result = await window.api.backup.export();
      if ('canceled' in result) return;
      onToast(m.backup.toastBackup(result.path));
    });

  const handleRestore = (): Promise<void> =>
    run(async () => {
      const result = await window.api.backup.restore();
      setConfirmRestore(false);
      if ('canceled' in result) return;
      onToast(m.backup.toastRestored(result.files));
    });

  const primaryButton =
    'px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60';
  const secondaryButton =
    'px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60';
  const cardClass = 'bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4';

  return (
    <Page width="medium" title={m.backup.title} subtitle={richText(m.backup.subtitle)}>
      <section className={cardClass}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void handleBackup();
            }}
            className={primaryButton}
          >
            <HardDriveDownload className="w-4 h-4" />
            {m.backup.exportAction}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmRestore(true)}
            className={`${secondaryButton} text-red-300`}
          >
            <HardDriveUpload className="w-4 h-4" />
            {m.backup.restoreAction}
          </button>
        </div>
        <p className="text-xs text-slate-500">{richText(m.backup.restoreHint)}</p>
      </section>

      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 sm:p-6">
          <div className="my-auto w-full max-w-sm rounded-2xl border border-red-900/50 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold">{m.backup.restoreConfirmTitle}</h3>
            </div>
            <p className="text-sm text-slate-300">{richText(m.backup.restoreConfirmText)}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestore(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleRestore();
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {busy ? m.backup.working : m.backup.restoreConfirmAction}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5" />
        {m.app.statusLocal}
      </p>
    </Page>
  );
}
