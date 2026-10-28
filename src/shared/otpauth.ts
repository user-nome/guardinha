import { base32Decode, isBase32, normalizeBase32 } from '@zero/shared/base32';
import {
  OTP_ALGORITHMS,
  OTP_DEFAULT_ALGORITHM,
  OTP_DEFAULT_DIGITS,
  OTP_DEFAULT_PERIOD,
  OTP_DIGIT_CHOICES,
  OTP_PERIOD_RANGE,
  OTP_SECRET_MIN_BYTES,
} from '@zero/shared/otp-constants';
import type { OtpAlgorithm } from '@zero/shared/otp-constants';

/** Provisionamento de token OTP pelo formato `otpauth://`: regra pura, sem Node nem DOM. */

// A reexportação mantém o contrato de quem já importava tudo por `@zero/shared/otpauth`.
export {
  OTP_ALGORITHMS,
  OTP_DEFAULT_ALGORITHM,
  OTP_DEFAULT_DIGITS,
  OTP_DEFAULT_PERIOD,
  OTP_DIGIT_CHOICES,
  OTP_PERIOD_RANGE,
  OTP_SECRET_MIN_BYTES,
};
export type { OtpAlgorithm };

export function isOtpAlgorithm(value: unknown): value is OtpAlgorithm {
  return OTP_ALGORITHMS.some((algorithm) => algorithm === value);
}

/** Bits que o segredo Base32 carrega; `null` quando o texto não é Base32. */
export function otpSecretBits(secret: string): number | null {
  const bytes = base32Decode(secret);
  if (bytes === null) return null;
  const bits = bytes.length * 8;
  bytes.fill(0);
  return bits;
}

export interface OtpUri {
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  /** Segredo canônico em Base32, sem padding. */
  secret: string;
}

function asPositiveInt(value: string | null): number | null {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

/** `decodeURIComponent` sem lançar: escape malformado vira o texto cru. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Lê o `otpauth://` colado; `null` fora do contrato, sem dizer onde falhou. */
export function parseOtpAuthUri(uri: string): OtpUri | null {
  const trimmed = uri.trim();
  if (!/^otpauth:\/\//i.test(trimmed)) return null;

  const afterScheme = trimmed.slice('otpauth://'.length);
  const split = afterScheme.indexOf('?');
  const head = split === -1 ? afterScheme : afterScheme.slice(0, split);
  const query = split === -1 ? '' : afterScheme.slice(split + 1);

  const slash = head.indexOf('/');
  if (slash === -1) return null;
  if (head.slice(0, slash).toLowerCase() !== 'totp') return null;

  const params = new URLSearchParams(query);
  // o draft manda recusar parâmetro repetido: qual dos dois manda? nenhum.
  for (const key of ['secret', 'issuer', 'algorithm', 'digits', 'period']) {
    if (params.getAll(key).length > 1) return null;
  }

  const secretParam = params.get('secret');
  if (secretParam === null || !isBase32(secretParam)) return null;
  const secret = normalizeBase32(secretParam);
  const secretBytes = base32Decode(secret);
  if (secretBytes === null || secretBytes.length < OTP_SECRET_MIN_BYTES) return null;
  secretBytes.fill(0);

  // Rótulo `Emissor:conta` ou só `conta`; o corte é feito no texto cru, antes de decodificar.
  const label = head.slice(slash + 1);
  const separator = /(?::|%3A)/i.exec(label);
  // `separator[0]` é `string`, não `string | undefined`: fatiar pelo `index` dispensa fallback.
  const rawIssuer = separator === null ? '' : label.slice(0, separator.index);
  const rawAccount =
    separator === null ? label : label.slice(separator.index + separator[0].length);
  const labelIssuer = safeDecode(rawIssuer).trim();
  const account = safeDecode(rawAccount).trim();
  const issuerParam = params.get('issuer');

  let issuer: string;
  if (issuerParam !== null && issuerParam !== '') {
    issuer = issuerParam.trim();
    if (labelIssuer !== '' && labelIssuer.toLowerCase() !== issuer.toLowerCase()) return null;
  } else {
    issuer = labelIssuer;
  }
  if (account === '' && issuer === '') return null;

  const rawAlgorithm = params.get('algorithm');
  let algorithm = OTP_DEFAULT_ALGORITHM;
  if (rawAlgorithm !== null && rawAlgorithm !== '') {
    const upper = rawAlgorithm.toUpperCase();
    if (!isOtpAlgorithm(upper)) return null;
    algorithm = upper;
  }

  const rawDigits = params.get('digits');
  let digits = OTP_DEFAULT_DIGITS;
  if (rawDigits !== null && rawDigits !== '') {
    const parsed = asPositiveInt(rawDigits);
    if (parsed === null || !OTP_DIGIT_CHOICES.includes(parsed)) return null;
    digits = parsed;
  }

  const rawPeriod = params.get('period');
  let period = OTP_DEFAULT_PERIOD;
  if (rawPeriod !== null && rawPeriod !== '') {
    const parsed = asPositiveInt(rawPeriod);
    if (parsed === null || parsed < OTP_PERIOD_RANGE[0] || parsed > OTP_PERIOD_RANGE[1]) {
      return null;
    }
    period = parsed;
  }

  return { issuer, account, algorithm, digits, period, secret };
}

/** Monta o `otpauth://` do token; precisa ser o inverso exato de `parseOtpAuthUri`. */
export function buildOtpAuthUri(token: OtpUri): string {
  // `@` volta cru de propósito: é permitido no caminho e deixa o rótulo legível.
  const encode = (value: string): string => encodeURIComponent(value).replace(/%40/g, '@');
  const label =
    token.issuer === ''
      ? encode(token.account)
      : `${encode(token.issuer)}:${encode(token.account)}`;
  const params = new URLSearchParams({ secret: token.secret });
  if (token.issuer !== '') params.set('issuer', token.issuer);
  params.set('algorithm', token.algorithm);
  params.set('digits', String(token.digits));
  params.set('period', String(token.period));
  return `otpauth://totp/${label}?${params.toString()}`;
}
