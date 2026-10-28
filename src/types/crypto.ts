/** Parâmetros do Argon2id usados pela cifra e pelo container. */
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
