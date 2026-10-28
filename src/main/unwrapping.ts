/** Embrulho e desembrulho da chave do cofre: um embrulhador por tipo de credencial. */
import {
  decryptRecord,
  deriveKey,
  encryptRecord,
  isSameKdf,
  kdfProfileFor,
  randomBytes,
} from '@zero/main/crypto';
import type { VaultKdfParams, WrappedMethod } from '@zero/main/container';
import { methodKeyInfo } from '@zero/main/crypto-constants';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';
import type { UnlockKind } from '@zero/types';

/** Todo método que embrulha a chave, inclusive a frase e o PIN de coação. */
export type CredentialKind = UnlockKind | 'recovery' | 'panic';

/** Chave desembrulhada e de que formato de embrulho ela veio. */
export interface UnwrappedKey {
  vaultKey: Buffer;
  /** `true` quando o blob veio no embrulho legado da v5, sem papel do método. */
  legacy: boolean;
}

/** Embrulho da chave por tipo de credencial (Strategy), com o custo de Argon2id de cada segredo. */
export interface KeyUnwrapper {
  readonly kind: CredentialKind;
  /** Custo do Argon2id deste método (lido do container, na prática). */
  readonly kdf: VaultKdfParams;
  /** Embrulha a chave de 32 bytes para o container. */
  wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod>;
  /** Chave de trabalho derivada do salt gravado no container. */
  derive(method: WrappedMethod, credential: string): Promise<Buffer>;
  /** Desembrulha a chave do cofre; credencial errada lança (GCM). */
  unwrap(method: WrappedMethod, derived: Buffer): Buffer;
  /** Igual a `unwrap`, mas informa se o embrulho era o legado da v5. */
  unwrapDetailed(method: WrappedMethod, derived: Buffer): UnwrappedKey;
}

/** PIN e PIN de pânico são segredos fracos e pagam o perfil de Argon2id mais caro. */
function kdfFor(kind: CredentialKind): VaultKdfParams {
  // o pânico paga o custo do PIN; o tempo total do fluxo é assunto de `unlock`
  const base = kind === 'pin' || kind === 'panic' ? kdfProfileFor('pin') : kdfProfileFor('master');
  return { algo: 'argon2id', ...base };
}

/** A chave desembrulhada tem 32 bytes; qualquer outra forma é container corrompido. */
function asVaultKey(unwrapped: unknown): Buffer {
  if (!isRecord(unwrapped) || typeof unwrapped.key !== 'string' || unwrapped.key.length !== 64) {
    throw new Error(currentMessages().errors.containerCorrupted);
  }
  return Buffer.from(unwrapped.key, 'hex');
}

/** Um embrulhador só, parametrizado pelo tipo: o que muda é apenas o custo do Argon2id. */
class Argon2KeyUnwrapper implements KeyUnwrapper {
  public readonly kind: CredentialKind;

  constructor(kind: CredentialKind) {
    this.kind = kind;
  }

  public get kdf(): VaultKdfParams {
    return kdfFor(this.kind);
  }

  public async wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod> {
    const kdfSalt = randomBytes(16);
    const derived = await deriveKey(credential, kdfSalt, this.kdf);
    const info = methodKeyInfo(this.kind);
    try {
      const payload = encryptRecord({ key: vaultKey.toString('hex') }, derived, info, info);
      return { kdf: this.kdf, kdfSalt: kdfSalt.toString('hex'), payload };
    } finally {
      // falha na cifragem não pode deixar a chave derivada legível na memória
      derived.fill(0);
    }
  }

  public async derive(method: WrappedMethod, credential: string): Promise<Buffer> {
    return deriveKey(credential, Buffer.from(method.kdfSalt, 'hex'), method.kdf);
  }

  public unwrap(method: WrappedMethod, derived: Buffer): Buffer {
    return this.unwrapDetailed(method, derived).vaultKey;
  }

  /** Tenta o embrulho atual e, se o GCM recusar, o legado da v5; a ordem importa. */
  public unwrapDetailed(method: WrappedMethod, derived: Buffer): UnwrappedKey {
    const info = methodKeyInfo(this.kind);
    let decoded: unknown;
    try {
      decoded = decryptRecord(method.payload, derived, info, info);
    } catch {
      // GCM recusou o embrulho atual: resta o formato da v5, validado por `asVaultKey`
      decoded = decryptRecord(method.payload, derived);
      return { vaultKey: asVaultKey(decoded), legacy: true };
    }
    return { vaultKey: asVaultKey(decoded), legacy: false };
  }
}

/** Todo método de desbloqueio que sabe embrulhar a chave. */
const KINDS: readonly CredentialKind[] = ['master', 'pin', 'recovery', 'panic'];

/** Uma instância por tipo serve o app inteiro; método novo entra só em `KINDS`. */
const UNWRAPPERS: ReadonlyMap<CredentialKind, KeyUnwrapper> = new Map<CredentialKind, KeyUnwrapper>(
  KINDS.map((kind) => [kind, new Argon2KeyUnwrapper(kind)]),
);

/** Reconferência em runtime: nome desconhecido vindo do container é erro, nunca KDF zero. */
export function keyUnwrapperFor(kind: CredentialKind): KeyUnwrapper {
  const found = UNWRAPPERS.get(kind);
  if (found === undefined) {
    throw new Error(currentMessages().errors.unknownUnlockMethod(kind));
  }
  return found;
}

/** true se o custo gravado já é o atual (candidato a reembrulho caso contrário). */
export function isKdfUpToDate(kind: CredentialKind, method: WrappedMethod): boolean {
  return isSameKdf(method.kdf, keyUnwrapperFor(kind).kdf);
}

/** 32 bytes aleatórios: nenhum `.zke` abre com ela, então a sessão decoy fica vazia. */
export function decoyKey(): Buffer {
  return randomBytes(32);
}
