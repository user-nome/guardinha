import { useState } from 'react';
import type { JSX } from 'react';
import { X } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import { SelectField } from '@zero/renderer/components/SelectField';
import type { SelectOption } from '@zero/renderer/components/SelectField';
import {
  errorMessage,
  OTP_ALGORITHMS,
  OTP_DEFAULT_ALGORITHM,
  OTP_DEFAULT_DIGITS,
  OTP_DEFAULT_PERIOD,
  OTP_DIGIT_CHOICES,
  OTP_PERIOD_RANGE,
  OTP_SECRET_MIN_BYTES,
  OTP_SECRET_OWASP_MIN_BYTES,
  OTP_SECRET_OWASP_RECOMMENDED_BYTES,
  otpSecretBits,
  parseOtpAuthUri,
} from '@zero/shared';
import type { OtpAlgorithm } from '@zero/shared';
import type { AuthToken, AuthTokenDraft } from '@zero/types';

/**
 * Formulário de token de 2FA, com duas entradas para o mesmo segredo:
 *
 * - `otpauth://`, que é o que o serviço entrega quando você escolhe "não posso
 *   escanear agora"; o endereço já traz emissor, conta e parâmetros certos;
 * - a chave em Base32 e os campos à mão, para quem copiou os 32 caracteres de
 *   um serviço que não oferece link.
 *
 * Criar começa na aba do endereço (é o caminho mais comum); editar começa na
 * aba dos campos, que já vêm preenchidos com o que o cofre guardou. A
 * validação do endereço roda com o mesmo `parseOtpAuthUri` do processo main,
 * então a tela não oferece algo que o cofre recusaria depois.
 */

interface AuthTokenModalProps {
  /** `null` cria um token novo. */
  token: AuthToken | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

const ALGORITHM_OPTIONS: readonly SelectOption<OtpAlgorithm>[] = OTP_ALGORITHMS.map((value) => ({
  value,
  label: value,
}));

const DIGIT_OPTIONS: readonly SelectOption<number>[] = OTP_DIGIT_CHOICES.map((value) => ({
  value,
  label: String(value),
}));

export function AuthTokenModal({
  token,
  onClose,
  onSaved,
  onError,
}: AuthTokenModalProps): JSX.Element {
  const m = useMessages();
  const isEdit = token !== null;
  const [tab, setTab] = useState<'uri' | 'manual'>(isEdit ? 'manual' : 'uri');

  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [issuer, setIssuer] = useState(token?.issuer ?? '');
  const [account, setAccount] = useState(token?.account ?? '');
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>(
    token?.algorithm ?? OTP_DEFAULT_ALGORITHM,
  );
  const [digits, setDigits] = useState<number>(token?.digits ?? OTP_DEFAULT_DIGITS);
  const [period, setPeriod] = useState<number>(token?.period ?? OTP_DEFAULT_PERIOD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none';

  const handleSave = (): void => {
    setError(null);
    // A URI carrega todos os campos, então na aba dela o save inteiro passa
    // pelo main sem a tela remontar nada. Na aba dos campos, cada um viaja.
    if (tab === 'uri') {
      setBusy(true);
      void window.api.authenticator
        .saveUri(uri)
        .then(() => {
          onSaved();
        })
        .catch((caught: unknown) => {
          const message = errorMessage(caught, m.authenticator.saveError);
          setError(message);
          onError(message);
        })
        .finally(() => {
          setBusy(false);
        });
      return;
    }

    // `exactOptionalPropertyTypes`: id ausente não é o mesmo que id vazio
    const base = { issuer, account, algorithm, digits, period, secret: secret.trim() };
    const draft: AuthTokenDraft = token === null ? base : { ...base, id: token.id };
    setBusy(true);
    void window.api.authenticator
      .save(draft)
      .then(() => {
        onSaved();
      })
      .catch((caught: unknown) => {
        const message = errorMessage(caught, m.authenticator.saveError);
        setError(message);
        onError(message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  /** Prévia do que o endereço colado resolve, antes de salvar. */
  const preview = tab === 'uri' ? parseOtpAuthUri(uri) : null;

  /**
   * Aviso de chave curta: o piso aceito é 80 bits, que é o tamanho que parte
   * dos serviços ainda emite, mas a OWASP recomenda 128 bits como mínimo e 160
   * como ideal. O aviso não bloqueia o salvamento: o tamanho da chave é
   * escolhido pelo serviço, não pelo usuário.
   */
  const secretForAssessment = tab === 'uri' ? (preview?.secret ?? '') : secret;
  const secretBits = secretForAssessment === '' ? null : otpSecretBits(secretForAssessment);
  let secretWarning: string | null = null;
  if (secretBits !== null && secretBits >= OTP_SECRET_MIN_BYTES * 8) {
    if (secretBits < OTP_SECRET_OWASP_MIN_BYTES * 8) {
      secretWarning = m.authenticator.weakSecretWarning(secretBits);
    } else if (secretBits < OTP_SECRET_OWASP_RECOMMENDED_BYTES * 8) {
      secretWarning = m.authenticator.belowRecommendedSecretWarning(secretBits);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-start justify-center overflow-y-auto z-50 p-4 sm:p-6">
      <div className="my-auto bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-100">
            {isEdit ? m.authenticator.modalEdit : m.authenticator.modalNew}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title={m.common.close}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          {(['uri', 'manual'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 bg-slate-800/50 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {key === 'uri' ? m.authenticator.tabUri : m.authenticator.tabManual}
            </button>
          ))}
        </div>

        {tab === 'uri' ? (
          <div className="space-y-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">{m.authenticator.uriLabel}</span>
              <textarea
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                placeholder={m.authenticator.uriPlaceholder}
                rows={3}
                className={`${fieldClass} resize-none font-mono text-xs`}
              />
            </label>
            {uri.trim() !== '' && preview === null && (
              // sem isto, colar um endereço pela metade e esperar o botão "Salvar"
              // para descobrir que faltava o segredo é a única forma de saber
              <p role="alert" className="text-xs text-rose-400">
                {richText(m.authenticator.uriInvalid)}
              </p>
            )}
            {preview !== null && (
              <p className="text-xs text-emerald-400">
                {preview.issuer !== '' ? preview.issuer : m.authenticator.issuerFallback}
                {preview.account !== '' && ` · ${preview.account}`}
                {` · ${preview.algorithm} · ${preview.digits} · ${preview.period}s`}
              </p>
            )}
            <p className="text-xs text-slate-500">{richText(m.authenticator.uriHint)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">
                {m.authenticator.secretLabel}
              </span>
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={m.authenticator.secretPlaceholder}
                className={`${fieldClass} font-mono`}
              />
              <span className="text-xs text-slate-500">{m.authenticator.secretHint}</span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">
                  {m.authenticator.issuerLabel}
                </span>
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder={m.authenticator.issuerPlaceholder}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">
                  {m.authenticator.accountLabel}
                </span>
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder={m.authenticator.accountPlaceholder}
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SelectField
                label={m.authenticator.algorithmLabel}
                options={ALGORITHM_OPTIONS}
                value={algorithm}
                onChange={setAlgorithm}
              />
              <SelectField
                label={m.authenticator.digitsLabel}
                options={DIGIT_OPTIONS}
                value={digits}
                onChange={setDigits}
              />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">
                  {m.authenticator.periodLabel}
                </span>
                <input
                  type="number"
                  min={OTP_PERIOD_RANGE[0]}
                  max={OTP_PERIOD_RANGE[1]}
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  className={fieldClass}
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">{richText(m.authenticator.algorithmHint)}</p>
          </div>
        )}

        {secretWarning !== null && (
          <p role="status" className="text-xs text-amber-400">
            {secretWarning}
          </p>
        )}

        {error !== null && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            {m.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 disabled:opacity-60"
          >
            {busy ? m.common.saving : m.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
