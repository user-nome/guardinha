import type { OtpAlgorithm } from '@zero/shared';

/** Token TOTP (RFC 6238) sem o segredo: ele nunca sai do processo main. */
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

/** Igual a `AuthTokenInput`, mais o segredo em Base32 para quem digita a chave à mão. */
export type AuthTokenDraft = AuthTokenInput & { secret: string };

/** Código do momento e quanto falta para a virada do período. */
export interface AuthCode {
  id: string;
  code: string;
  remainingMs: number;
}
