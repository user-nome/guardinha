import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import { CARD_GRID } from '@zero/renderer/card-grid';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import { AuthTokenModal } from '@zero/renderer/components/AuthTokenModal';
import { Page } from '@zero/renderer/components/Page';
import { errorMessage } from '@zero/shared';
import { useLatest } from '@zero/renderer/hooks';
import { TICK_MS } from '@zero/shared/auth-constants';
import type { AuthCode, AuthToken } from '@zero/types';

/**
 * Tela do verificador de dois fatores.
 *
 * O código chega pronto do processo main e é só isso que existe aqui: nem o
 * segredo TOTP, nem a chave do cofre. O papel da tela é mostrar o número,
 * copiar com expiração e avisar quando está prestes a vencer.
 *
 * O relógio é do renderer (um tique por segundo, para a contagem andar), mas
 * quem decide o código é o main: quando o período vira, o renderer pede de novo
 * em vez de recalcular com o segredo que ele não tem.
 */

interface AuthenticatorProps {
  onToast: (message: string) => void;
}

/** Código exibido com o instante em que deixa de valer. */
interface ShownCode {
  code: string;
  expiresAt: number;
}

export function Authenticator({ onToast }: AuthenticatorProps): JSX.Element {
  const m = useMessages();
  const [tokens, setTokens] = useState<AuthToken[]>([]);
  const [codes, setCodes] = useState<Record<string, ShownCode>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<AuthToken | 'new' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AuthToken | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // fora das dependências: recarregar tokens e códigos a cada troca de idioma
  // seria buscar de novo por causa de um texto de toast que talvez nem apareça
  const loadError = useLatest(m.authenticator.loadError);

  const loadCodes = useCallback(async (): Promise<void> => {
    const fetchedAt = Date.now();
    const current: AuthCode[] = await window.api.authenticator.codes();
    const next: Record<string, ShownCode> = {};
    for (const item of current)
      next[item.id] = { code: item.code, expiresAt: fetchedAt + item.remainingMs };
    setCodes(next);
    setNow(fetchedAt);
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    const [list, current] = await Promise.all([
      window.api.authenticator.list(),
      window.api.authenticator.codes(),
    ]);
    const fetchedAt = Date.now();
    const next: Record<string, ShownCode> = {};
    for (const item of current)
      next[item.id] = { code: item.code, expiresAt: fetchedAt + item.remainingMs };
    setTokens(list);
    setCodes(next);
    setNow(fetchedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload().catch((error: unknown) => {
      onToast(errorMessage(error, loadError.current));
      setLoading(false);
    });
  }, [reload, onToast, loadError]);

  // Tique de 1 s para a contagem; quando algum código vence, pede os novos.
  // Um tique por token resolveria o mesmo problema com muito mais temporizador.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const expired = Object.values(codes).some((item) => item.expiresAt <= current);
      if (expired) {
        void loadCodes().catch((error: unknown) => {
          onToast(errorMessage(error, loadError.current));
        });
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [codes, loadCodes, onToast, loadError]);

  const handleCopy = (shown: ShownCode): void => {
    void copyAndAutoClear(shown.code)
      .then(() => {
        onToast(m.authenticator.toastCopied);
      })
      .catch((error: unknown) => {
        onToast(errorMessage(error, m.errors.internal));
      });
  };

  const handleRemove = (token: AuthToken): void => {
    void window.api.authenticator
      .remove(token.id)
      .then((list) => {
        setTokens(list);
        setConfirmRemove(null);
        onToast(m.authenticator.toastRemoved);
        return loadCodes();
      })
      .catch((error: unknown) => {
        setConfirmRemove(null);
        onToast(errorMessage(error, m.authenticator.removeError));
      });
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{m.authenticator.loading}</p>;
  }

  return (
    <Page
      width="wide"
      title={m.authenticator.title}
      subtitle={m.authenticator.subtitle}
      actions={
        <button
          type="button"
          onClick={() => setModal('new')}
          className="shrink-0 py-2 px-4 bg-emerald-500 hover:bg-emerald-600 font-semibold text-slate-950 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {m.authenticator.addToken}
        </button>
      }
    >
      {tokens.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-2">
          <KeyRound className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-300">{m.authenticator.emptyTitle}</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {richText(m.authenticator.emptyText)}
          </p>
        </div>
      ) : (
        /*
         O cartão do token é o mais largo da casa (código, contagem e cópia na
         mesma linha), então ele usa a regra `wide`: uma coluna até 768 px, duas
         dali até 1536 px e três acima disso. Ver `card-grid.ts`. */
        <ul className={CARD_GRID.wide}>
          {tokens.map((token) => {
            const shown = codes[token.id];
            const left = shown === undefined ? 0 : Math.max(0, shown.expiresAt - now);
            const fraction = token.period > 0 ? Math.min(1, left / (token.period * 1000)) : 0;
            const seconds = Math.ceil(left / 1000);
            return (
              <li
                key={token.id}
                className="min-w-0 flex flex-col gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {token.issuer !== '' ? token.issuer : m.authenticator.issuerFallback}
                    </p>
                    {token.account !== '' && (
                      <p className="text-xs text-slate-500 truncate">{token.account}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setModal(token)}
                      title={m.authenticator.modalEdit}
                      className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(token)}
                      title={m.common.delete}
                      className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`font-mono text-3xl tracking-[0.3em] ${
                      seconds <= 5 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {shown === undefined ? '······' : shown.code}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 tabular-nums">
                      {m.authenticator.expiresIn(seconds)}
                    </span>
                    <button
                      type="button"
                      onClick={shown === undefined ? undefined : (): void => handleCopy(shown)}
                      disabled={shown === undefined}
                      title={m.common.copy}
                      className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 disabled:opacity-40"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-auto h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-1000 ease-linear ${
                      seconds <= 5 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal !== null && (
        <AuthTokenModal
          token={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onToast(m.authenticator.toastSaved);
            void reload().catch((error: unknown) => {
              onToast(errorMessage(error, m.authenticator.loadError));
            });
          }}
          onError={(message) => onToast(message)}
        />
      )}

      {confirmRemove !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 sm:p-6">
          <div className="my-auto w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <p className="text-sm text-slate-200">{m.authenticator.deleteConfirm}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRemove(confirmRemove);
                }}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                {m.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
