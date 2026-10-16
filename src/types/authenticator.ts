import type { OtpAlgorithm } from '@zero/shared';

/**
 * Token de verificação em duas etapas (TOTP, RFC 6238).
 *
 * O segredo **não faz parte deste tipo**: ele nunca sai do processo main. O
 * renderer recebe os metadados para montar a tela e, quando precisa do número,
 * pede o código já calculado. Assim não existe cópia do segredo TOTP em
 * memória no processo da interface, que é o processo com mais superfície de
 * ataque (DOM, scripts da página).
 */
export interface AuthToken {
  id: string;
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  createdAt: number;
  updatedAt: number;
}

/** Entrada aceita pelo save (id ausente cria um token novo). */
export type AuthTokenInput = Omit<AuthToken, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * Mesmo que `AuthTokenInput`, mais o segredo em Base32.
 *
 * Existe porque nem todo serviço mostra um QR legível: vários exibem a chave
 * como texto, e digitar os 32 caracteres é mais seguro do que ficar caçando a
 * imagem. O segredo entra por este canal e não volta por nenhum outro: quem
 * responde é sempre a lista de metadados.
 */
export type AuthTokenDraft = AuthTokenInput & { secret: string };

/** Código do momento e quanto falta para a virada do período. */
export interface AuthCode {
  id: string;
  code: string;
  remainingMs: number;
}
