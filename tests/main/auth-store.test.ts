// @vitest-environment node
import nodeFs from 'node:fs';
import fs from 'fs-extra';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { authDir } from '@zero/main/layout';
import { deleteAuth, listAuthIds, readAuthPayload, writeAuthPayload } from '@zero/main/auth-store';
import { encryptAuthRecord } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { createVault, requireSessionKey } from '@zero/main/vault';
import type { SaltedPayload } from '@zero/types/crypto';

/** O `.auth/` é montado a partir de um id: cada ramo aqui é uma barreira contra caminho e lixo. */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

// um cofre só para os dois blocos: `createVault` recusa a segunda vez
beforeAll(async () => {
  const result = await createVault({
    masterPassword: MASTER,
    pin: PIN,
    recoveryPhrase: PHRASE,
  });
  expect(result.ok).toBe(true);
}, 120_000);

describe('auth-store: id de arquivo seguro', () => {
  it.each([
    ['separador de pasta', 'a/b'],
    ['separador de Windows', 'a\\b'],
    ['byte nulo', 'a\0b'],
    ['string vazia', ''],
    ['travessão com pontos', '../../etc/passwd'],
  ])('recusa id com %s, de leitura, escrita e remoção', (_label, id) => {
    const m = currentMessages();
    expect(() => readAuthPayload(id)).toThrow(m.errors.invalidId);
    expect(() => writeAuthPayload(id, encryptAuthRecord({}, Buffer.alloc(32)))).toThrow(
      m.errors.invalidId,
    );
    expect(() => deleteAuth(id)).toThrow(m.errors.invalidId);
  });

  it('nenhum id malformado vira arquivo fora de .auth/', () => {
    expect(fs.existsSync(path.join(authDir(), '..', '..', 'etc'))).toBe(false);
    expect(fs.readdirSync(path.resolve(authDir(), '..')).filter((n) => !n.startsWith('.'))).toEqual(
      ['vault.zkv'],
    );
  });
});

describe('auth-store: leitura e escrita', () => {
  it('id ausente é erro explícito, não token vazio na lista', () => {
    // lista vazia aqui faria o app mostrar "nenhum token" como se tudo estivesse bem
    expect(() => readAuthPayload('bbbbbbbb-2222-4222-8222-222222222222')).toThrow(
      currentMessages().errors.authTokenNotFound,
    );
  });

  it('arquivo que não é um container de token vira adulteração', () => {
    const id = 'cccccccc-3333-4333-8333-333333333333';
    const file = path.join(authDir(), `${id}.zka`);
    fs.writeFileSync(file, Buffer.from('lixo que não é um container'), { mode: 0o600 });

    expect(() => readAuthPayload(id)).toThrow(currentMessages().errors.vaultTampered);
    expect(listAuthIds()).toContain(id);
    fs.rmSync(file, { force: true });
  });

  it('arquivo truncado também vira adulteração, e não JSON pela metade', () => {
    const id = 'dddddddd-4444-4444-8444-444444444444';
    const file = path.join(authDir(), `${id}.zka`);
    fs.writeFileSync(file, Buffer.from('ZENTRY01 curtado'), { mode: 0o600 });

    expect(() => readAuthPayload(id)).toThrow(currentMessages().errors.vaultTampered);
    fs.rmSync(file, { force: true });
  });

  it('grava em 0600 e remove sem deixar resíduo', () => {
    const key = requireSessionKey();
    const id = 'eeeeeeee-5555-4555-8555-555555555555';
    writeAuthPayload(id, encryptAuthRecord({ id }, key));

    const file = path.join(authDir(), `${id}.zka`);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    deleteAuth(id);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('listar quando a pasta não existe ainda devolve lista vazia', () => {
    fs.rmSync(authDir(), { recursive: true, force: true });
    expect(listAuthIds()).toEqual([]);
  });

  it('remover id que não está em disco não lança', () => {
    expect(() => deleteAuth('ffffffff-6666-4666-8666-666666666666')).not.toThrow();
  });

  it('não toca no arquivo quando o id não está em disco', () => {
    // A guarda `existsSync` separa "apagar o token" de "tentar apagar o token":
    // sem ela, o shred ainda abriria o caminho antes de descobrir que não há
    // arquivo ali. O `lstatSync` do `shredFile` é o que fica observável.
    const id = '99999999-7777-4777-8777-999999999999';
    const lstat = vi.spyOn(nodeFs, 'lstatSync');
    try {
      deleteAuth(id);
      expect(lstat).not.toHaveBeenCalledWith(path.join(authDir(), `${id}.zka`));
    } finally {
      lstat.mockRestore();
    }
  });
});

describe('permissões e filtro de arquivos dos tokens', () => {
  it('grava o .zka com 0600', () => {
    // O token de 2FA é o segredo mais exposto do app: um arquivo 0644 seria
    // lido por qualquer usuário da máquina e daria conta do serviço.
    const payload: SaltedPayload = encryptAuthRecord(
      { issuer: 'GitHub', account: 'alice', secret: 'ab' },
      requireSessionKey(),
    );
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    writeAuthPayload(id, payload);

    expect(fs.statSync(path.join(authDir(), `${id}.zka`)).mode & 0o777).toBe(0o600);
    deleteAuth(id);
  });

  it('só devolve id de arquivo .zka, ignorando o que estiver ao lado', () => {
    // O diretório `.auth` é controlado pelo app, mas um `.tmp` deixado por uma
    // escrita interrompida não pode entrar na lista e virar um token fantasma.
    const id = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    writeAuthPayload(
      id,
      encryptAuthRecord({ issuer: 'GitHub', account: 'bob', secret: 'cd' }, requireSessionKey()),
    );

    fs.writeFileSync(path.join(authDir(), 'lixo.zkt'), 'nao e token');
    fs.writeFileSync(path.join(authDir(), 'anotacoes.txt'), 'nao e token');

    const ids = listAuthIds();
    expect(ids).toContain(id);
    expect(ids).not.toContain('lixo');
    expect(ids).not.toContain('anotacoes');
    deleteAuth(id);
  });
});
