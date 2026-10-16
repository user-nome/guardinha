import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import { errorMessage, PIN_LENGTH, strengthFor } from '@zero/shared';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { Page } from '@zero/renderer/components/Page';
import type { PanicStatus } from '@zero/types';

/** Teto aceito no campo: acima de 999 ninguém sobrevive à própria configuração. */
const MAX_LIMIT_INPUT = 999;

/**
 * Proteções de pânico: PIN de coação e autodestruição por tentativas.
 *
 * As duas ficam atrás do cofre desbloqueado (o main exige chave para gravar no
 * container), e por isso esta tela só é alcançável com o cofre aberto. O
 * formulário é conveniência: quem valida PIN, formato e piso do limite é o main.
 */
export function Settings(): JSX.Element {
  const m = useMessages();
  const [panic, setPanic] = useState<PanicStatus | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setPanic(await window.api.vault.panicStatus());
  }, []);

  useEffect(() => {
    void refresh().catch(() => setPanic(null));
  }, [refresh]);

  const handleSetPanic = async (): Promise<void> => {
    setError(null);
    if (pin !== pinConfirm) {
      setError(m.settings.panicMismatch);
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.vault.setPanicPin({ pin });
      if (!result.ok) {
        setError(result.error ?? m.errors.internal);
        return;
      }
      setPin('');
      setPinConfirm('');
      setVisible(false);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const handleClearPanic = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await window.api.vault.clearPanicPin();
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const handleLimit = async (): Promise<void> => {
    setError(null);
    const value = Number.parseInt(limitText, 10);
    setBusy(true);
    try {
      const result = await window.api.vault.setNukeLimit(value);
      if (!result.ok) {
        setError(result.error ?? m.errors.internal);
        return;
      }
      setLimitText('');
      setConfirming(false);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="narrow" title={m.settings.title}>
      {error !== null && (
        <p
          role="alert"
          className="text-sm text-red-400 border border-red-900/60 rounded-lg px-4 py-2"
        >
          {error}
        </p>
      )}

      {/* ---- PIN de coação ---- */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-200">{m.settings.panicTitle}</h3>
            <p className="text-sm text-slate-400">{richText(m.settings.panicSubtitle)}</p>
          </div>
        </div>

        <p className="text-sm text-slate-300">
          {panic?.hasPanicPin === true ? m.settings.panicActive : m.settings.panicInactive}
        </p>

        {panic?.hasPanicPin === true ? (
          <button
            type="button"
            onClick={() => {
              void handleClearPanic();
            }}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
          >
            {m.settings.panicClear}
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="panic-pin" className="block text-sm text-slate-300 mb-1">
                {m.settings.panicLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id="panic-pin"
                  type={visible ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  className="shrink-0 px-3 py-2 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700"
                >
                  {visible ? m.home.hidePassword : m.home.showPassword}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="panic-pin-confirm" className="block text-sm text-slate-300 mb-1">
                {m.settings.panicConfirmLabel}
              </label>
              <input
                id="panic-pin-confirm"
                type={visible ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                value={pinConfirm}
                onChange={(event) => setPinConfirm(event.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            {pin.length === PIN_LENGTH && (
              <StrengthMeter result={strengthFor('pin').evaluate(pin)} hint={m.strength.hintPin} />
            )}
            <button
              type="button"
              onClick={() => {
                void handleSetPanic();
              }}
              disabled={busy || pin.length !== PIN_LENGTH}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {m.settings.panicSet}
            </button>
          </div>
        )}
      </section>

      {/* ---- Autodestruição por tentativas ---- */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5 text-slate-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-200">{m.settings.nukeTitle}</h3>
            <p className="text-sm text-slate-400">{richText(m.settings.nukeSubtitle)}</p>
          </div>
        </div>

        <p className="text-sm text-slate-300">
          {panic === null
            ? m.app.checkingVault
            : panic.nukeLimit === 0
              ? m.settings.nukeOff
              : m.settings.nukeValue(panic.nukeLimit)}
        </p>

        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-300">
              {m.settings.nukeConfirmText(panic?.nukeLimit ?? 0)}
            </p>
            <label htmlFor="nuke-limit-confirm" className="block text-sm text-slate-300 mb-1">
              {m.settings.nukeConfirmLabel}
            </label>
            <input
              id="nuke-limit-confirm"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={limitText}
              onChange={(event) => setLimitText(event.target.value)}
              className="w-full sm:w-40 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-500/60"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setLimitText('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleLimit();
                }}
                disabled={busy || limitText.trim() === ''}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40"
              >
                {m.settings.nukeEnable}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="nuke-limit" className="block text-sm text-slate-300 mb-1">
              {m.settings.nukeLabel}
            </label>
            <input
              id="nuke-limit"
              type="text"
              inputMode="numeric"
              max={MAX_LIMIT_INPUT}
              value={limitText}
              onChange={(event) => setLimitText(event.target.value)}
              placeholder={
                panic?.nukeLimit === 0 ? m.settings.nukeOff : String(panic?.nukeLimit ?? 0)
              }
              className="w-full sm:w-40 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-500/60"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
              >
                {m.settings.nukeEnable}
              </button>
              {panic !== null && panic.nukeLimit > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLimitText('0');
                    setConfirming(false);
                    void window.api.vault
                      .setNukeLimit(0)
                      .then(() => refresh())
                      .catch(() => setError(m.errors.internal));
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 bg-slate-800/60 hover:bg-slate-800"
                >
                  {m.settings.nukeDisable}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}
