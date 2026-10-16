// @vitest-environment node
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '@zero/main/settings';

/**
 * `settings.json` guarda só o idioma, nada sensível, mas ainda assim é escrito
 * com 0600, pasta 0700 e `rename` atômico: um `SIGKILL` no meio da escrita não
 * pode deixar um JSON pela metade, que faria o app cair para o padrão a cada
 * abertura sem o usuário perceber por quê.
 */

const TEMP_PREFIX = 'guardinha-settings-';
let temp: string;

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(process.env.HOME ?? '/tmp', TEMP_PREFIX));
  process.env.XDG_CONFIG_HOME = temp;
});

afterEach(() => {
  fs.rmSync(temp, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
});

function file(): string {
  return path.join(temp, 'guardinha', 'settings.json');
}

describe('saveSettings', () => {
  it('grava o idioma e devolve o que gravou', () => {
    expect(saveSettings({ language: 'en' })).toEqual({ language: 'en' });
    expect(fs.readJsonSync(file())).toEqual({ language: 'en' });
  });

  it('normaliza idioma inválido para pt-BR em vez de gravar lixo', () => {
    // o arquivo é reescrito pela UI a cada troca; um valor corrompido não pode
    // deixar o app sem idioma numa tela ilegível
    const saved = saveSettings({ language: 'fr' as unknown as 'en' });
    expect(saved).toEqual({ language: 'pt-BR' });
    expect(fs.readJsonSync(file())).toEqual({ language: 'pt-BR' });
  });

  it('cria a pasta em 0700 e o arquivo em 0600', () => {
    saveSettings({ language: 'pt-BR' });
    expect(fs.statSync(path.join(temp, 'guardinha')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
  });

  it('não deixa o .tmp para trás', () => {
    saveSettings({ language: 'en' });
    expect(fs.existsSync(`${file()}.tmp`)).toBe(false);
  });

  it('sobrescreve o arquivo anterior sem acumulá-lo', () => {
    saveSettings({ language: 'pt-BR' });
    saveSettings({ language: 'en' });
    expect(fs.readdirSync(path.join(temp, 'guardinha'))).toEqual(['settings.json']);
    expect(loadSettings()).toEqual({ language: 'en' });
  });
});

describe('loadSettings', () => {
  it('devolve pt-BR quando ainda não há arquivo', () => {
    expect(loadSettings()).toEqual({ language: 'pt-BR' });
  });

  it('lê o idioma gravado', () => {
    saveSettings({ language: 'en' });
    expect(loadSettings()).toEqual({ language: 'en' });
  });

  it('normaliza idioma desconhecido que veio de um arquivo editado à mão', () => {
    fs.ensureDirSync(path.join(temp, 'guardinha'));
    fs.writeFileSync(file(), JSON.stringify({ language: 'klingon' }));
    expect(loadSettings()).toEqual({ language: 'pt-BR' });
  });

  it('normaliza campo ausente ou de outro tipo', () => {
    fs.ensureDirSync(path.join(temp, 'guardinha'));
    fs.writeFileSync(file(), JSON.stringify({}));
    expect(loadSettings()).toEqual({ language: 'pt-BR' });

    fs.writeFileSync(file(), JSON.stringify({ language: 42 }));
    expect(loadSettings()).toEqual({ language: 'pt-BR' });
  });

  it('sobrevive a arquivo corrompido em vez de derrubar o app', () => {
    // um corte de escrita deixa JSON pela metade; o app tem de abrir assim mesmo
    fs.ensureDirSync(path.join(temp, 'guardinha'));
    fs.writeFileSync(file(), '{"language": "e');
    expect(loadSettings()).toEqual({ language: 'pt-BR' });
  });

  it('aceita arquivo que não é objeto, como `null` ou lista', () => {
    // JSON válido que não é um registro de preferências: o `asRecord` do
    // leitor precisa devolver objeto vazio em vez de espalhar o valor (`{...42}`
    // e `{...null}` não dão o que ler) e deixar o idioma num estado indefinido.
    fs.ensureDirSync(path.join(temp, 'guardinha'));
    for (const conteudo of ['null', '42', '"en"', '[]', '[{"language":"en"}]']) {
      fs.writeFileSync(file(), conteudo);
      expect(loadSettings(), conteudo).toEqual({ language: 'pt-BR' });
    }
  });

  it('cai no XDG do HOME quando XDG_CONFIG_HOME não está definido', () => {
    // O caminho tem de ser o do HOME de verdade, conferido no disco: montar a
    // mesma string aqui e conferir a string não mede o código, mede o teste.
    delete process.env.XDG_CONFIG_HOME;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      saveSettings({ language: 'en' });

      expect(fs.existsSync(path.join(home, '.config', 'guardinha', 'settings.json'))).toBe(true);
      expect(loadSettings()).toEqual({ language: 'en' });
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('grava o JSON com indentação de dois espaços', () => {
    // O arquivo é do app, mas ele é lido por olho quando alguém vai depurar o
    // idioma; a forma em disco é contrato, não detalhe de formatação.
    saveSettings({ language: 'pt-BR' });

    expect(fs.readFileSync(file(), 'utf8')).toBe('{\n  "language": "pt-BR"\n}');
  });

  it('ignora XDG_CONFIG_HOME vazio, como se não estivesse definido', () => {
    process.env.XDG_CONFIG_HOME = '';
    expect(loadSettings()).toEqual({ language: 'pt-BR' });
  });
});

describe('permissões do arquivo de preferências', () => {
  it('grava a pasta com 0700 e o arquivo com 0600', () => {
    // As preferências não são segredo, mas o arquivo fica dentro do HOME do
    // usuário: 0644 deixaria qualquer outro usuário da máquina ler o idioma e,
    // mais importante, criar o arquivo para o app escribir por cima.
    saveSettings({ language: 'pt-BR' });

    expect(fs.statSync(path.dirname(file())).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
  });
});
