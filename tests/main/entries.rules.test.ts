// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteEntry } from '@zero/main/entries-store';
import { listEntries, removeEntry, saveEntry } from '@zero/main/entries';
import { currentMessages } from '@zero/main/i18n';
import { vaultStorage } from '@zero/main/facade';
import { createVault } from '@zero/main/vault';
import type { CredentialInput } from '@zero/types';

/** CRUD de credenciais: id que não é UUID, id desconhecido e remoção de id estranho. */

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
    // o id tem cara de UUID, mas não existe: isso é credencial apagada, não id reutilizado
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

describe('entries: remoção idempotente', () => {
  it('apagar um arquivo que já não existe não lança', () => {
    // A remoção pode repetir numa tela que atualiza depois de erro; sem guarda, o `shred` estoura.
    expect(() => deleteEntry('ffffffff-9999-4999-8999-999999999999')).not.toThrow();
  });
});

describe('entries: ordem da lista', () => {
  it('mostra a credencial editada por último, não por primeiro', () => {
    // A lista começa pelo que o usuário mexeu por último; um `+` no comparador inverteria a ordem.
    const [primeira] = saveEntry(entry({ title: 'Ordem-a' }));
    const [segunda] = saveEntry(entry({ title: 'Ordem-b' }));
    const idPrimeira = primeira?.id ?? '';
    const idSegunda = segunda?.id ?? '';

    const ids = listEntries().map((item) => item.id);
    expect(ids.indexOf(idSegunda)).toBeLessThan(ids.indexOf(idPrimeira));

    removeEntry(idPrimeira);
    removeEntry(idSegunda);
  });

  it('ordena por data mesmo quando a soma das datas daria sempre positivo', () => {
    // `b - a` ordena de verdade; `b + a` é sempre positivo e mantém a ordem do diretório.
    const now = vi.spyOn(Date, 'now');
    const base = Date.now() + 1_000_000;
    const primeira = saveEntry(entry({ title: 'Ordem-soma-a' }))[0];
    const segunda = saveEntry(entry({ title: 'Ordem-soma-b' }))[0];
    const ids = [primeira?.id ?? '', segunda?.id ?? ''];
    const noDiretorio = vaultStorage.listIds().filter((id) => ids.includes(id));

    try {
      noDiretorio.forEach((id, index) => {
        now.mockReturnValue(base + index * 1000);
        saveEntry(entry({ title: `Ordem-soma-${index}`, id }));
      });
    } finally {
      now.mockRestore();
    }

    const resultado = listEntries()
      .filter((item) => ids.includes(item.id))
      .map((item) => item.id);
    // O segundo id recebeu a data mais nova, então a lista começa por ele.
    expect(resultado).toEqual([...noDiretorio].reverse());
    for (const id of ids) removeEntry(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
