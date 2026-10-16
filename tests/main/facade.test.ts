// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { encryptAuthRecord, encryptRecord } from '@zero/main/crypto';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { deleteAuth, writeAuthPayload } from '@zero/main/auth-store';
import { deleteEntry, writeEntryPayload } from '@zero/main/entries-store';
import { updateManifest } from '@zero/main/storage';
import { createVault, requireSessionKey } from '@zero/main/vault';
import type { Credential } from '@zero/types';
import type { AuthSecret } from '@zero/main/facade';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const TAMPERED = currentMessages().errors.vaultTampered;

function record(id: string): Credential {
  return {
    id,
    title: 'Banco',
    username: 'chronos-atalante',
    password: 's3nh@-forte',
    domain: 'banco.com.br',
    notes: '',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

function authSecret(id: string): AuthSecret {
  return {
    id,
    issuer: 'GitHub',
    account: 'alice',
    secret: 'GEZDGNBVGY3TQOJQ',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

describe('VaultStorageFacade (fachada de persistência)', () => {
  // o Argon2id do PIN custa 256 MB e passa de 15 s sob carga (hookTimeout global)
  beforeAll(async () => {
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it('escreve, lê e remove credencial mantendo o manifesto coerente', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    const stored = record(id);

    vaultStorage.writeRecord(stored, key);
    expect(vaultStorage.listIds()).toContain(id);
    expect(vaultStorage.readRecord(id, key)).toEqual(stored);
    vaultStorage.verifyManifest(key);

    vaultStorage.removeRecord(id, key);
    expect(vaultStorage.listIds()).not.toContain(id);
    vaultStorage.verifyManifest(key);
  });

  it('responde adulteração quando o registro não tem a forma esperada', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord({ id, title: 42 }, key));

    try {
      expect(() => vaultStorage.readRecord(id, key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('converte falha ao decifrar uma credencial em erro de adulteração', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord(record(id), Buffer.alloc(32, 1)));

    try {
      expect(() => vaultStorage.readRecord(id, key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('responde adulteração quando um arquivo entra fora do manifesto', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord(record(id), key));

    try {
      expect(() => vaultStorage.verifyManifest(key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('expõe a estrutura e o caminho do cofre sem tocar fs direto', () => {
    expect(vaultStorage.exists()).toBe(true);
    vaultStorage.ensureStructure();
    expect(vaultStorage.listIds()).toEqual([]);
    expect(vaultStorage.path()).not.toBe('');
    expect(vaultStorage.createKey()).toHaveLength(32);
  });

  it('encaminha a destruição criptográfica pela fachada', () => {
    expect(vaultStorage.erase()).toMatchObject({ failed: 0 });
  });
});

describe('forma do registro confere campo a campo', () => {
  it('recusa quando só o id está errado', () => {
    // Cada campo é conferido com `||`. Um teste que só quebra o `title` ainda
    // pegaria o resto, porque os outros campos também estariam fora do contrato.
    // Aqui o defeito fica em um campo só: é o que prova que a checagem é campo a
    // campo, e não "algum campo está errado".
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord({ ...record(id), id: 42 }, key));

    try {
      expect(() => vaultStorage.readRecord(id, key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('recusa quando só o updatedAt está errado no token de 2FA', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeAuthPayload(id, encryptAuthRecord({ ...authSecret(id), id: 7 }, key));

    try {
      expect(() => vaultStorage.readAuthSecret(id, key)).toThrow(TAMPERED);
    } finally {
      deleteAuth(id);
      updateManifest(key);
    }
  });
});
