// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { listEntries, removeEntry, saveEntry } from '@zero/main/entries';
import { currentMessages } from '@zero/main/i18n';
import { vaultStorage } from '@zero/main/facade';
import { createVault } from '@zero/main/vault';
import type { CredentialInput } from '@zero/types';

/**
 * Validação do CRUD de credenciais. Os três ramos cobertos aqui são a fronteira
 * entre a tela e o arquivo: um id que não é UUID, um id que o cofre não
 * conhece e uma remoção de id estranho. Cada um precisa falhar com a mensagem
 * certa, e não com um erro de filesystem.
 */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras finais';

const VALID_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function entry(overrides: Record<string, unknown> = {}): CredentialInput {
  return {
    title: 'GitHub',
    username: 'morgan',
    password: 's3nh@-forte',
    domain: 'github.com',
    notes: '',
    ...overrides,
  };
}

beforeAll(async () => {
  const result = await createVault({
    masterPassword: MASTER,
    pin: PIN,
    recoveryPhrase: PHRASE,
  });
  expect(result.ok).toBe(true);
}, 120_000);

describe('entries: validação do que chega da tela', () => {
  it('recusa título vazio ou só com espaços', () => {
    const m = currentMessages();
    expect(() => saveEntry(entry({ title: '' }))).toThrow(m.errors.invalidTitle);
    expect(() => saveEntry(entry({ title: '   ' }))).toThrow(m.errors.invalidTitle);
  });

  it('recusa usuário e domínio fora do formato', () => {
    const m = currentMessages();
    expect(() => saveEntry(entry({ username: 'com espaco' }))).toThrow(m.errors.invalidUsername);
    expect(() => saveEntry(entry({ domain: 'sem ponto' }))).toThrow(m.errors.invalidDomain);
  });

  it('aceita usuário e domínio vazios: nem toda credencial tem os dois', () => {
    expect(saveEntry(entry({ username: '', domain: '' })).length).toBeGreaterThan(0);
  });

  it('normaliza o domínio para minúsculas', () => {
    const [saved] = saveEntry(entry({ title: 'Mixed', domain: 'GitHub.COM' }));
    expect(saved?.domain).toBe('github.com');
  });
});

describe('entries: id e atualização', () => {
  it('recusa atualizar com id que não é UUID', () => {
    expect(() => saveEntry(entry({ id: 'nao-e-uuid' }))).toThrow(
      currentMessages().errors.invalidId,
    );
  });

  it('recusa atualizar um id que o cofre não tem', () => {
    // o id tem cara de UUID, mas não existe: isso é credencial apagada, não
    // credencial nova com id reusing
    expect(() => saveEntry(entry({ id: VALID_ID }))).toThrow(
      currentMessages().errors.entryNotFound,
    );
  });

  it('atualiza mantendo o id e a data de criação', () => {
    const [created] = saveEntry(entry({ title: 'Antes' }));
    const id = created?.id ?? '';
    const updated = saveEntry(entry({ id, title: 'Depois' }));

    expect(updated.find((item) => item.id === id)?.title).toBe('Depois');
    expect(updated.find((item) => item.id === id)?.createdAt).toBe(created?.createdAt);
    removeEntry(id);
  });

  it('id vazio conta como "crie nova", não como atualização', () => {
    const antes = vaultStorage.listIds().length;
    saveEntry(entry({ id: '', title: 'Id vazio' }));
    expect(vaultStorage.listIds().length).toBe(antes + 1);
  });
});

describe('entries: remoção', () => {
  it('recusa id que não é UUID, sem tocar no disco', () => {
    expect(() => removeEntry('../../vault.zkv')).toThrow(currentMessages().errors.invalidId);
  });

  it('recusa remover id que não existe', () => {
    expect(() => removeEntry(VALID_ID)).toThrow(currentMessages().errors.entryNotFound);
  });

  it('remove a credencial e re-sela o manifesto', () => {
    const [created] = saveEntry(entry({ title: 'Temporária' }));
    const id = created?.id ?? '';

    const restantes = removeEntry(id);

    expect(restantes.some((item) => item.id === id)).toBe(false);
    expect(() => listEntries()).not.toThrow();
  });
});

describe('entries: ordem da lista', () => {
  it('mostra a credencial editada por último, não por primeiro', () => {
    // A lista da tela começa pelo que o usuário mexeu por último. Um `+` no
    // comparador inverteria a ordem sem quebrar nenhum teste antigo, que só
    // conferia que as ids estavam na lista.
    const [primeira] = saveEntry(entry({ title: 'Ordem-a' }));
    const [segunda] = saveEntry(entry({ title: 'Ordem-b' }));
    const idPrimeira = primeira?.id ?? '';
    const idSegunda = segunda?.id ?? '';

    const ids = listEntries().map((item) => item.id);
    expect(ids.indexOf(idSegunda)).toBeLessThan(ids.indexOf(idPrimeira));

    removeEntry(idPrimeira);
    removeEntry(idSegunda);
  });
});
