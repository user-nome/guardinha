/**
 * Tipos compartilhados pela cifra e pelo formato do container; `SaltedPayload`
 * também é usado pelos stores de entradas e tokens.
 */
export interface Argon2Params {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface SaltedPayload {
  salt: string;
  iv: string;
  tag: string;
  encryptedData: string;
}
