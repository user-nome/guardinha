import { base32Decode, isBase32, normalizeBase32 } from '@zero/shared/base32';

/**
 * Provisionamento de token OTP pelo formato `otpauth://` (o que o Google
 * Authenticator publica na wiki *Key Uri Format* e que hoje está em rascunho
 * no IETF). É regra pura: o renderer valida o que o usuário cola e o main usa
 * a mesma função, então os dois lados concordam sobre o que é um token válido.
 *
 * O formato é `otpauth://totp/<rótulo>?secret=<Base32>&issuer=…&algorithm=…&digits=…&period=…`.
 */

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** Parâmetros que o app sabe gerar. O algoritmo vem do serviço, nunca de nós. */
export const OTP_ALGORITHMS: readonly OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];

/**
 * O padrão de GitHub, Discord, Google, AWS, Coinbase e de quase todo serviço é
 * SHA1 com 6 dígitos a cada 30 s. Os outros dois existem porque alguns serviços
 * (Azure AD, parte do OAuth) pedem SHA256 ou SHA512.
 */
export const OTP_DEFAULT_ALGORITHM: OtpAlgorithm = 'SHA1';
export const OTP_DEFAULT_DIGITS = 6;
export const OTP_DEFAULT_PERIOD = 30;
/**
 * Piso do segredo em bytes: 80 bits, o que 16 caracteres Base32 carregam.
 *
 * A RFC 4226 recomenda 128 bits e o rascunho do `otpauth://` pede 160, mas o
 * que GitHub, Google, Discord, AWS e Coinbase emitem de fato é segredo de 16
 * caracteres, isto é, 10 bytes. Exigir 128 bits aqui não torna o cofre mais
 * seguro: só recusa o formato que todo serviço real entrega, e a pessoa não
 * tem como pedir um segredo maior ao serviço. O custo prático é pequeno: para
 * esbarrar num HMAC-SHA1 de 6 dígitos por força bruta seria preciso adivinhar
 * 10^6 códigos dentro da janela de 30 s, com o segredo trocando a cada
 * período, então 80 bits seguram a conta.
 */
export const OTP_SECRET_MIN_BYTES = 10;

/** O draft do IETF só admite 6 ou 8; nada de serviço real usa fora disso. */
export const OTP_DIGIT_CHOICES: readonly number[] = [6, 8];

/**
 * Teto do período. Não é segurança, é sanidade: o `period` multiplica direto a
 * janela de espera na tela e um valor absurdo vira um token que parece travado.
 */
export const OTP_PERIOD_RANGE = [15, 300] as const;

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

/**
 * Lê o `otpauth://` colado pelo usuário. Devolve `null` em qualquer coisa fora
 * do contrato, sem dizer onde falhou: quem chama mostra uma mensagem só.
 *
 * O recorte é feito na string, e não com `new URL()`, por um motivo concreto:
 * nomes de usuário do Discord carregam `#` e o serviço entrega o `#` sem
 * codificar. Um parser de URL leria `#1234` como fragmento e jogaria fora todo o
 * `?secret=...`, então o token viraria "endereço inválido" num serviço que
 * estava certo.
 *
 * Rejeita `hotp` de propósito. HOTP (RFC 4226) é um contador, não um relógio,
 * e gerar um número para ele exigiria um estado de contagem que o app não tem:
 * melhor dizer que não suporta do que mostrar um código que nunca serve.
 */
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

  // Rótulo `Emissor:conta` ou só `conta`. O separador pode chegar cru (`:`) ou
  // escapado (`%3A`), que é o que a wiki do Google aceita; o corte é feito no
  // texto antes de decodificar, senão um `%3A` viraria `:` e partiria o rótulo
  // no lugar errado.
  const label = head.slice(slash + 1);
  const separator = /^(.*?)(?::|%3A)(.*)$/i.exec(label);
  const rawIssuer = separator === null ? '' : (separator[1] ?? '');
  const rawAccount = separator === null ? label : (separator[2] ?? '');
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
    if (!OTP_ALGORITHMS.includes(upper as OtpAlgorithm)) return null;
    algorithm = upper as OtpAlgorithm;
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

/**
 * Monta o `otpauth://` do token. Usado na exportação e no segredo exibido ao
 * usuário, então precisa ser o inverso exato de `parseOtpAuthUri`.
 *
 * Emissor e conta são escapados separados e unidos por `:` cru, que é como o
 * Google Authenticator mostra e como a wiki do Google escreve. Escapar o
 * rótulo inteiro produziria `%3A` no lugar do separador.
 */
export function buildOtpAuthUri(token: OtpUri): string {
  // `@` volta cru de propósito: é permitido no caminho de uma URI e é como a
  // wiki do Google escreve o rótulo, então o endereço fica legível para quem
  // for conferir o segredo com o serviço.
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
