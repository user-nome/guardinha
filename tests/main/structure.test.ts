// @vitest-environment node
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authDir, entriesDir, vaultDir } from '@zero/main/layout';
import {
  TEMP_SUFFIX,
  ensureVaultStructure,
  tempPathFor,
  writeSecretFile,
} from '@zero/main/structure';

/** Fixa o que a escrita atômica promete: modo 0600 no destino e no temporário. */

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
    // com umask 0 o padrão seria 0666: sem o `{ mode }`, o segredo nasceria legível
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
    // o `chmod` só alcança o destino, então a janela do `.tmp` depende do `mode`
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
    // Deixar `.tmp` em disco é o que a varredura de órfãos limpa; a escrita normal não produz um.
    const file = path.join(dir, 'sobrescrito.zka');
    writeSecretFile(file, 'primeira');
    writeSecretFile(file, 'segunda');
    expect(fs.readFileSync(file, 'utf8')).toBe('segunda');
    expect(fs.existsSync(`${file}${TEMP_SUFFIX}`)).toBe(false);
  });

  it('não mexe no destino quando o rename falha', () => {
    // `.tmp` + `rename`: erro depois do temporário deixa o destino como estava, não pela metade.
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

  it('o temporário tem nome imprevisível e o sufixo que a varredura procura', () => {
    // Nome aleatório tira o alvo do controle de quem planta o symlink; o sufixo `.tmp` continua.
    const file = path.join(dir, 'aleatorio.zke');
    const first = tempPathFor(file);
    const second = tempPathFor(file);

    expect(first).not.toBe(second);
    expect(first.startsWith(file)).toBe(true);
    expect(first.endsWith(TEMP_SUFFIX)).toBe(true);
    expect(first).not.toBe(`${file}${TEMP_SUFFIX}`);
  });

  it('não segue o symlink plantado no nome previsível do temporário', () => {
    // P5b: o `.tmp` fixo apontava para o `vault.zkv`; com nome aleatório e `wx`, o link não cola.
    const victim = path.join(dir, 'vault.zkv');
    const file = path.join(dir, 'credencial.zke');
    fs.writeFileSync(victim, 'container original');
    fs.symlinkSync(victim, `${file}${TEMP_SUFFIX}`);

    writeSecretFile(file, 'novo segredo');

    expect(fs.readFileSync(victim, 'utf8')).toBe('container original');
    expect(fs.readFileSync(file, 'utf8')).toBe('novo segredo');
  });
});

/** O modo pedido ao `ensureDirSync`, antes do `chmodSync` reafirmar 0700. */
describe('ensureVaultStructure', () => {
  it('cria cada pasta em 0700, e não em 0701', () => {
    // 0701 deixa a pasta atravessável e o `chmod` conserta depois: o teste olha a criação.
    const anterior = process.env.GUARDINHA_VAULT_DIR;
    process.env.GUARDINHA_VAULT_DIR = path.join(root, 'estrutura');
    const spy = vi.spyOn(fsExtra, 'ensureDirSync');
    try {
      ensureVaultStructure();
      // O segundo argumento é `number | EnsureDirOptions`: aqui é o objeto inteiro.
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
