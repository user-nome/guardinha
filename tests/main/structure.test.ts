// @vitest-environment node
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authDir, entriesDir, vaultDir } from '@zero/main/layout';
<<<<<<< HEAD
import { TEMP_SUFFIX, ensureVaultStructure, writeSecretFile } from '@zero/main/structure';
=======
import {
  TEMP_SUFFIX,
  ensureVaultStructure,
  tempPathFor,
  writeSecretFile,
} from '@zero/main/structure';
>>>>>>> 16e8b01 (não vai mais para o github)

/**
 * A escrita atômica do cofre mora em um lugar só. Ela foi copiada quatro vezes
 * (container, credencial, token de 2FA e preferências) e as cópias já tinham
 * divergido. Os testes fixam o que a primitiva promete, que é o que nenhuma das
 * cópias garantia sozinha.
 */

let dir: string;
let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-structure-'));
  dir = path.join(root, 'cofre');
  fs.mkdirSync(dir);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function mode(file: string): number {
  return fs.statSync(file).mode & 0o777;
}

describe('writeSecretFile', () => {
  it('grava o conteúdo no destino', () => {
    const file = path.join(dir, 'conteudo.zkv');
    writeSecretFile(file, Buffer.from('conteudo cifrado', 'utf8'));
    expect(fs.readFileSync(file, 'utf8')).toBe('conteudo cifrado');
  });

  it('aceita texto, como o `settings.json` grava', () => {
    const file = path.join(dir, 'settings.json');
    writeSecretFile(file, JSON.stringify({ language: 'pt-BR' }, null, 2));
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ language: 'pt-BR' });
  });

  it('deixa o arquivo em 0600', () => {
    const file = path.join(dir, 'novo.zke');
    writeSecretFile(file, 'segredo');
    expect(mode(file)).toBe(0o600);
  });

  it('deixa o arquivo em 0600 mesmo com umask permissivo', () => {
    // O `mode` do `writeFileSync` é a primeira linha de defesa; com umask 0 o
    // padrão do sistema seria 0666. Este é o teste que pega a cópia que esqueceu
    // do `{ mode }`: sem ele, e com umask frouxo, o segredo nascia legível.
    const before = process.umask(0o000);
    try {
      const file = path.join(dir, 'umask.zke');
      writeSecretFile(file, 'segredo');
      expect(mode(file)).toBe(0o600);
    } finally {
      process.umask(before);
    }
  });

  it('cria o temporário em 0600, antes do rename', () => {
    // O `chmod` só alcança o destino. A janela em que o `.tmp` existe em disco
    // é coberta só pelo `mode` do `writeFileSync`, então é ela que se inspeciona.
    const file = path.join(dir, 'janela.zka');
    const seen: number[] = [];
    const original = fsExtra.renameSync;
    vi.spyOn(fsExtra, 'renameSync').mockImplementation((from, to) => {
      seen.push(fs.statSync(from).mode & 0o777);
      original(from, to);
    });
    try {
      writeSecretFile(file, 'segredo');
    } finally {
      vi.restoreAllMocks();
    }
    expect(seen).toEqual([0o600]);
    expect(fs.existsSync(`${file}${TEMP_SUFFIX}`)).toBe(false);
  });

  it('sobrescreve sem deixar o temporário para trás', () => {
    // Deixar `.tmp` em disco é o que a varredura de órfãos limpa depois; a
    // escrita normal não pode produzir um.
    const file = path.join(dir, 'sobrescrito.zka');
    writeSecretFile(file, 'primeira');
    writeSecretFile(file, 'segunda');
    expect(fs.readFileSync(file, 'utf8')).toBe('segunda');
    expect(fs.existsSync(`${file}${TEMP_SUFFIX}`)).toBe(false);
  });

  it('não mexe no destino quando o rename falha', () => {
    // A garantia real do `.tmp` + `rename`: um erro depois de gravar o
    // temporário e antes de trocar o inode deixa o destino como estava, em vez
    // de um arquivo pela metade. Sem o `rename`, esta escrita destrói o anterior.
    const file = path.join(dir, 'intacto.zkv');
    writeSecretFile(file, 'bom');
    vi.spyOn(fsExtra, 'renameSync').mockImplementation(() => {
      throw new Error('disco cheio');
    });
    try {
      expect(() => writeSecretFile(file, 'novo')).toThrow('disco cheio');
    } finally {
      vi.restoreAllMocks();
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('bom');
  });

  it('propaga o erro quando o destino não é gravável', () => {
    const file = path.join(dir, 'sem-pasta', 'sub.zkv');
    expect(() => writeSecretFile(file, 'falha')).toThrow();
  });
<<<<<<< HEAD
=======

  it('o temporário tem nome imprevisível e o sufixo que a varredura procura', () => {
    // O nome fixo `${arquivo}.tmp` deixava um pendrive ou um diretório hostil
    // plantar o symlink antes da escrita. O nome aleatório tira o alvo do
    // controle de quem planta; o sufixo continua igual para o `erase` e a
    // varredura de órfãos reconhecerem o temporário.
    const file = path.join(dir, 'aleatorio.zke');
    const first = tempPathFor(file);
    const second = tempPathFor(file);

    expect(first).not.toBe(second);
    expect(first.startsWith(file)).toBe(true);
    expect(first.endsWith(TEMP_SUFFIX)).toBe(true);
    expect(first).not.toBe(`${file}${TEMP_SUFFIX}`);
  });

  it('não segue o symlink plantado no nome previsível do temporário', () => {
    // O ataque de P5b: o `.tmp` de nome fixo aponta para o `vault.zkv`, e a
    // escrita atravessa o link e destrói o container. Com o nome aleatório e o
    // `wx`, o link antigo fica onde está e o alvo não é tocado.
    const victim = path.join(dir, 'vault.zkv');
    const file = path.join(dir, 'credencial.zke');
    fs.writeFileSync(victim, 'container original');
    fs.symlinkSync(victim, `${file}${TEMP_SUFFIX}`);

    writeSecretFile(file, 'novo segredo');

    expect(fs.readFileSync(victim, 'utf8')).toBe('container original');
    expect(fs.readFileSync(file, 'utf8')).toBe('novo segredo');
  });
>>>>>>> 16e8b01 (não vai mais para o github)
});

/**
 * O modo com que as pastas nascem. O `chmodSync` logo depois reafirma 0700, o
 * que faz o modo final não separar as duas versões da constante; é o modo
 * *pedido* ao `ensureDirSync`, que cria a pasta, que precisa ficar fixado.
 */
describe('ensureVaultStructure', () => {
  it('cria cada pasta em 0700, e não em 0701', () => {
    // 0701 deixa a pasta atravessável por qualquer usuário da máquina, e a
    // janela entre o `ensureDirSync` e o `chmodSync` seria o bastante para
    // listar os `.zke`. Como o `chmod` conserta o modo depois, só o argumento
    // da criação registra o valor; o teste tem que olhar a chamada.
    const anterior = process.env.GUARDINHA_VAULT_DIR;
    process.env.GUARDINHA_VAULT_DIR = path.join(root, 'estrutura');
    const spy = vi.spyOn(fsExtra, 'ensureDirSync');
    try {
      ensureVaultStructure();
      // o segundo argumento é `number | EnsureDirOptions`: o `ensuredir` do
      // fs-extra aceita só o modo ou o objeto inteiro, e aqui é o objeto
      const modos = spy.mock.calls.map(([, options]) =>
        typeof options === 'number' ? options : options?.mode,
      );
      const caminhos = spy.mock.calls.map(([destino]) => destino);
      expect(modos).toEqual([0o700, 0o700, 0o700]);
      expect(caminhos).toEqual([vaultDir(), entriesDir(), authDir()]);
    } finally {
      vi.restoreAllMocks();
      if (anterior === undefined) Reflect.deleteProperty(process.env, 'GUARDINHA_VAULT_DIR');
      else process.env.GUARDINHA_VAULT_DIR = anterior;
    }
  });
});
