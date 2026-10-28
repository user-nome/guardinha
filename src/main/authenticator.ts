import { vaultStorage } from '@zero/main/facade';
import { requireSessionKey, touch } from '@zero/main/vault';
import { vaultSession } from '@zero/main/session';
import { currentMessages } from '@zero/main/i18n';
import { totp, totpRemainingMs } from '@zero/main/totp';
import {
  base32Decode,
  isUuid,
  normalizeBase32,
  OTP_ALGORITHMS,
  OTP_DIGIT_CHOICES,
  OTP_PERIOD_RANGE,
  OTP_SECRET_MIN_BYTES,
  parseOtpAuthUri,
} from '@zero/shared';
import type { AuthCode, AuthToken, AuthTokenDraft } from '@zero/types';

/** Tokens de 2FA (TOTP, RFC 6238): lista, grava, apaga e gera o código, sem expor o segredo. */

/** Registro decifrado → o que o renderer enxerga (sem o segredo). */
function toPublicToken(record: AuthToken): AuthToken {
  return {
    id: record.id,
    issuer: record.issuer,
    account: record.account,
    algorithm: record.algorithm,
    digits: record.digits,
    period: record.period,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Tokens do cofre, do mais recente para o mais antigo; confere o manifesto antes. */
export function listTokens(): AuthToken[] {
  if (vaultSession().isDecoy()) return [];
  const key = requireSessionKey();
  vaultStorage.verifyManifest(key);
  const tokens = vaultStorage
    .listAuthIds()
    .map((id) => toPublicToken(vaultStorage.readAuthSecret(id, key)));
  tokens.sort((a, b) => b.updatedAt - a.updatedAt);
  touch();
  return tokens;
}

/** Confere os parâmetros de um token colado ou digitado, campo a campo. */
function assertTokenShape(input: AuthTokenDraft): void {
  const m = currentMessages();
  if (!OTP_ALGORITHMS.includes(input.algorithm)) throw new Error(m.errors.invalidAuthToken);
  if (!OTP_DIGIT_CHOICES.includes(input.digits)) throw new Error(m.errors.invalidAuthToken);
  if (
    !Number.isInteger(input.period) ||
    input.period < OTP_PERIOD_RANGE[0] ||
    input.period > OTP_PERIOD_RANGE[1]
  ) {
    throw new Error(m.errors.invalidAuthToken);
  }
}

/** Cria (sem `id`) ou atualiza um token a partir do `otpauth://` mostrado pelo serviço. */
export function saveTokenFromUri(uri: string): AuthToken[] {
  const m = currentMessages();
  const parsed = parseOtpAuthUri(uri);
  if (parsed === null) throw new Error(m.errors.invalidAuthTokenUri);
  return saveToken({
    issuer: parsed.issuer,
    account: parsed.account,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    period: parsed.period,
    secret: parsed.secret,
  });
}

/** Cria (sem `id`) ou atualiza um token com o segredo informado à mão. */
export function saveToken(input: AuthTokenDraft): AuthToken[] {
  const key = requireSessionKey();
  const m = currentMessages();
  assertTokenShape(input);

  const issuer = input.issuer.trim();
  const account = input.account.trim();
  if (issuer === '' && account === '') throw new Error(m.errors.invalidAuthToken);

  const secret = normalizeBase32(input.secret);
  const secretBytes = base32Decode(secret);
  if (secretBytes === null) {
    throw new Error(m.errors.invalidAuthSecret);
  }
  const secretIsLongEnough = secretBytes.length >= OTP_SECRET_MIN_BYTES;
  secretBytes.fill(0);
  if (!secretIsLongEnough) throw new Error(m.errors.invalidAuthSecret);

  const now = Date.now();
  let id = vaultStorage.newId();
  let createdAt = now;
  if (input.id !== undefined && input.id !== '') {
    if (!isUuid(input.id)) throw new Error(m.errors.invalidId);
    if (!vaultStorage.listAuthIds().includes(input.id)) throw new Error(m.errors.authTokenNotFound);
    createdAt = vaultStorage.readAuthSecret(input.id, key).createdAt;
    id = input.id;
  }

  vaultStorage.writeAuthSecret(
    {
      id,
      issuer,
      account,
      algorithm: input.algorithm,
      digits: input.digits,
      period: input.period,
      secret,
      createdAt,
      updatedAt: now,
    },
    key,
  );
  touch();
  return listTokens();
}

/** Apaga o arquivo cifrado do token e re-sela o manifesto. */
export function removeToken(id: string): AuthToken[] {
  const key = requireSessionKey();
  if (!isUuid(id)) throw new Error(currentMessages().errors.invalidId);
  if (!vaultStorage.listAuthIds().includes(id)) {
    throw new Error(currentMessages().errors.authTokenNotFound);
  }
  vaultStorage.removeAuthSecret(id, key);
  touch();
  return listTokens();
}

/** Código de todos os tokens no instante `nowMs`; não chama `touch()` para não segurar o auto-lock. */
export function currentCodes(nowMs: number = Date.now()): AuthCode[] {
  if (vaultSession().isDecoy()) return [];
  const key = requireSessionKey();
  vaultStorage.verifyManifest(key);
  const codes: AuthCode[] = [];
  for (const id of vaultStorage.listAuthIds()) {
    const record = vaultStorage.readAuthSecret(id, key);
    const secret = base32Decode(record.secret);
    if (secret === null) continue;
    codes.push({
      id,
      code: totp(secret, nowMs, record.period, record.digits, record.algorithm),
      remainingMs: totpRemainingMs(nowMs, record.period),
    });
    secret.fill(0);
  }
  return codes;
}
