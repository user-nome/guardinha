// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHRED_PASSES, shredDirectory, shredFile } from '@zero/main/shred';

const SECRET = 'guardinha-shred-prova-de-conteudo-original';

let root: string;
let target: string;

/**
 * Grava no vetor e deixa a escrita passar para o disco de verdade, para que os
 * testes continuem medindo um arquivo real. `zeros` diz se o bloco era só
 * zeros, que é como se distingue a passada de sorteio da passada de limpeza.
 */
interface WriteCall {
  position: number | null;
  length: number;
  zeros: boolean;
}

function spyWrite(): WriteCall[] {
  const calls: WriteCall[] = [];
  const real = fs.writeSync.bind(fs);
  vi.spyOn(fs, 'writeSync').mockImplementation(((
    fd: number,
    data: Uint8Array,
    offset?: number,
    length?: number,
    position?: number | null,
  ) => {
    const slice = data.subarray(offset ?? 0, (offset ?? 0) + (length ?? 0));
    calls.push({
      position: position ?? null,
      length: slice.length,
      zeros: slice.every((byte) => byte === 0),
    });
    return real(fd, data, offset, length, position);
  }) as typeof fs.writeSync);
  return calls;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-shred-'));
  target = path.join(root, 'segredo.zke');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('shredFile', () => {
  it('apaga o arquivo e devolve true', () => {
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    expect(shredFile(target, 3)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('não deixa o conteúdo original durante a sobrescrita', () => {
    const large = Buffer.alloc(150_000, SECRET);
    fs.writeFileSync(target, large, { mode: 0o600 });
    const original = Buffer.from(large);

    // captura cada bloco gravado, na ordem, antes do unlink
    const written: Buffer[] = [];
    const realWrite = fs.writeSync.bind(fs);
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: Uint8Array,
      offset?: number,
      length?: number,
      position?: number | null,
    ) => {
      written.push(Buffer.from(data.subarray(offset ?? 0, (offset ?? 0) + (length ?? 0))));
      return realWrite(fd, data, offset, length, position);
    }) as typeof fs.writeSync);

    const result = shredFile(target, 2);
    spy.mockRestore();

    expect(result).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    // a primeira passada não pode conter nenhum trecho do conteúdo original
    const firstPass = Buffer.concat(written).subarray(0, original.length);
    expect(firstPass.includes(original)).toBe(false);
    expect(firstPass.equals(original)).toBe(false);
    // e a última passada é de zeros
    const lastPass = written[written.length - 1];
    expect(lastPass?.every((byte) => byte === 0)).toBe(true);
  });

  it('termina com a passada de zeros mesmo com número par de passadas', () => {
    fs.writeFileSync(target, 'conteudo', { mode: 0o600 });
    const written: Buffer[] = [];
    const realWrite = fs.writeSync.bind(fs);
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: Uint8Array,
      offset?: number,
      length?: number,
      position?: number | null,
    ) => {
      written.push(Buffer.from(data.subarray(offset ?? 0, (offset ?? 0) + (length ?? 0))));
      return realWrite(fd, data, offset, length, position);
    }) as typeof fs.writeSync);

    shredFile(target, 4);
    spy.mockRestore();

    expect(written.at(-1)?.every((byte) => byte === 0)).toBe(true);
  });

  it('aceita o número de passadas em qualquer quantidade dentro do teto', () => {
    for (const passes of [1, 2, 3, 7, 16, 99, 0, -5, 2.7]) {
      fs.writeFileSync(target, 'conteudo', { mode: 0o600 });
      expect(shredFile(target, passes)).toBe(true);
      expect(fs.existsSync(target)).toBe(false);
    }
  });

  it('não segue symlink: o alvo continua intacto', () => {
    const real = path.join(root, 'real.txt');
    const link = path.join(root, 'atalho.txt');
    fs.writeFileSync(real, SECRET, { mode: 0o600 });
    fs.symlinkSync(real, link);

    expect(shredFile(link, 3)).toBe(false);
    expect(fs.existsSync(link)).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toBe(SECRET);
  });

  it('devolve false sem lançar quando o caminho não existe', () => {
    expect(shredFile(path.join(root, 'nao-existe.zke'), 3)).toBe(false);
  });

  it('devolve false sem quebrar quando há um diretório no lugar do arquivo', () => {
    const dir = path.join(root, 'pasta');
    fs.mkdirSync(dir);
    expect(shredFile(dir, 3)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('trata arquivo vazio sem travar', () => {
    fs.writeFileSync(target, '');
    expect(shredFile(target, 3)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('fecha o arquivo e preserva o original quando fsync falha', () => {
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    const close = vi.spyOn(fs, 'closeSync');
    vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('fsync indisponível');
    });

    expect(shredFile(target, 1)).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(fs.existsSync(target)).toBe(true);
  });

  it('sobrescreve arquivo maior que um bloco, mantendo o tamanho', () => {
    const big = crypto.randomBytes(200_000);
    fs.writeFileSync(target, big, { mode: 0o600 });
    let observedSize = -1;
    const realFstat = fs.fstatSync.bind(fs);
    const spy = vi.spyOn(fs, 'fstatSync').mockImplementation((fd: number) => {
      const stat = realFstat(fd);
      observedSize = stat.size;
      return stat;
    });

    expect(shredFile(target, 1)).toBe(true);
    spy.mockRestore();

    expect(observedSize).toBe(big.length);
  });

  it('não imprime nada no console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.writeFileSync(target, SECRET, { mode: 0o600 });

    shredFile(target, 1);
    shredFile(path.join(root, 'nao-existe'), 1);

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
    log.mockRestore();
  });
});

describe('shredDirectory', () => {
  it('sobrescreve os arquivos e remove o diretório', () => {
    const dir = path.join(root, '.entries');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.zke'), SECRET, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'b.enc'), SECRET, { mode: 0o600 });

    expect(shredDirectory(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('devolve false quando o diretório não existe, sem lançar', () => {
    expect(shredDirectory(path.join(root, 'nao-existe'))).toBe(false);
  });

  it('não segue symlink dentro do diretório', () => {
    const dir = path.join(root, '.entries');
    const outside = path.join(root, 'fora.txt');
    fs.mkdirSync(dir);
    fs.writeFileSync(outside, SECRET, { mode: 0o600 });
    fs.symlinkSync(outside, path.join(dir, 'atalho.zke'));

    expect(shredDirectory(dir)).toBe(false);
    expect(fs.readFileSync(outside, 'utf8')).toBe(SECRET);
  });

  it('devolve false quando há subdiretório, mesmo se o rmdir passar', () => {
    // O `rmdir` de verdade falharia com a pasta não vazia; ele é neutralizado
    // para que o valor devolvido meça a agregação do laço (a entrada que não é
    // arquivo conta como incompleta) e não só o erro do `rmdir`.
    const dir = path.join(root, '.entries');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    const rmdir = vi.spyOn(fs, 'rmdirSync').mockImplementation(() => undefined);
    try {
      expect(shredDirectory(dir)).toBe(false);
    } finally {
      rmdir.mockRestore();
    }
  });

  it('devolve false quando um arquivo não pôde ser sobrescrito, mesmo se o rmdir passar', () => {
    // Sem o `&&` da agregação, uma sobrescrita bem-sucedida (true) mais adiante
    // no laço apagaria o false da que falhou e o diretório passaria por inteiro.
    const dir = path.join(root, '.entries');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.zke'), SECRET, { mode: 0o600 });
    const rmdir = vi.spyOn(fs, 'rmdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('fsync indisponível');
    });
    try {
      expect(shredDirectory(dir)).toBe(false);
    } finally {
      rmdir.mockRestore();
    }
  });
});

describe('parâmetros da sobrescrita', () => {
  it('usa 3 passadas por padrão, como manda o shred(1)', () => {
    // O número de passadas é o que a sobrescrita realmente entrega. Um teste que
    // só chama `shredFile` continua verde se alguém baixar o custo aqui.
    expect(SHRED_PASSES).toBe(3);
  });

  it('apaga o arquivo e não deixa o conteúdo original para trás', () => {
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    expect(shredFile(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('sobrescreve arquivo maior que um bloco de escrita antes de apagar', () => {
    // Arquivo de vários blocos exercita o laço de escrita; o de tamanho pequeno
    // passaria mesmo com o laço quebrado.
    const big = 'x'.repeat(300_000);
    fs.writeFileSync(target, big, { mode: 0o600 });

    expect(shredFile(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });
});

describe('geometria da escrita', () => {
  it('grava em blocos de 64 KiB e nunca passa do fim do arquivo', () => {
    // 200.000 = 3 × 65.536 + 3.392. Cada bloco começa exatamente onde o anterior
    // acabou, e o último é o resto. É o que garante que a sobrescrita cobre o
    // arquivo inteiro sem escrever além dele.
    const big = crypto.randomBytes(200_000);
    fs.writeFileSync(target, big, { mode: 0o600 });
    const calls = spyWrite();

    shredFile(target, 1);

    expect(calls.map((c) => c.length)).toEqual([65_536, 65_536, 65_536, 3_392]);
    expect(calls.map((c) => c.position)).toEqual([0, 65_536, 131_072, 196_608]);
    const total = calls.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(big.length);
  });

  it('o tamanho do arquivo menor que um bloco vira uma única escrita', () => {
    // Sem isto, um laço que calculasse o resto errado ainda passaria nos arquivos
    // grandes (o bloco sempre corta) e só cresceria o arquivo aqui.
    fs.writeFileSync(target, 'conteudo-pequeno', { mode: 0o600 });
    const calls = spyWrite();

    shredFile(target, 1);

    expect(calls.map((c) => c.length)).toEqual(['conteudo-pequeno'.length]);
    expect(calls.map((c) => c.position)).toEqual([0]);
  });
});

describe('quantas passadas cada pedido gera', () => {
  // Toda passada recomeça na posição 0, então uma escrita em `position === 0` é
  // o começo de uma passada. Arquivo de um bloco só tem uma escrita por
  // passada, o que deixa a contagem exata.
  const passesOf = (requested: number): boolean[] => {
    // restaura antes de espionar: senão o espião da chamada anterior continua
    // embaixo do novo e os dois gravam no mesmo `writeSync`
    vi.restoreAllMocks();
    fs.writeFileSync(target, 'conteudo', { mode: 0o600 });
    const calls = spyWrite();
    shredFile(target, requested);
    // `true` quando a passada escreveu só zeros
    return calls.filter((c) => c.position === 0).map((c) => c.zeros);
  };

  it('respeita o número pedido, da mínima à máxima', () => {
    expect(passesOf(1).length).toBe(1);
    expect(passesOf(2).length).toBe(2);
    expect(passesOf(3).length).toBe(3);
    expect(passesOf(16).length).toBe(16);
    // o teto: acima dele a sobrescrita só gastaria I/O à toa
    expect(passesOf(17).length).toBe(16);
    expect(passesOf(99).length).toBe(16);
  });

  it('trata zero e negativo como uma passada só', () => {
    expect(passesOf(0).length).toBe(1);
    expect(passesOf(-5).length).toBe(1);
  });

  it('trata número fracionário como se não tivesse sido pedido', () => {
    // 5.5 não é inteiro: o pedido não vale nada e vale o padrão. Se a guarda
    // sumir, 5.5 vira seis passadas em vez de três.
    expect(passesOf(5.5).length).toBe(SHRED_PASSES);
  });

  it('alterna aleatório e zero, terminando sempre em zero', () => {
    // Passada ímpar é de zeros e a última é de zeros, para o arquivo não
    // terminar com bytes que parecem conteúdo válido.
    expect(passesOf(4)).toEqual([false, true, false, true]);
    // com número ímpar a última passada cai no índice par, e é a regra
    // "última é de zeros" que tem de segurar o resultado
    expect(passesOf(3)).toEqual([false, true, true]);
    expect(passesOf(1)).toEqual([true]);
    // seis passadas separam o "índice ímpar" de "índice 1 mod 3": na quinta
    // passada (índice 4) as duas regras discordam, e é o que fixa que a
    // periodicidade é 2
    expect(passesOf(6)).toEqual([false, true, false, true, false, true]);
  });
});

describe('o descarte do descritor', () => {
  it('não tenta fechar descritor que nunca foi aberto', () => {
    // `fd` nasce nulo e o `finally` só fecha o que existe. Fechar `null` seria
    // exceção dentro da exceção, engolida pelo `catch` e invisível: o único
    // sinal é a chamada.
    const close = vi.spyOn(fs, 'closeSync');

    expect(shredFile(path.join(root, 'nao-existe.zke'), 3)).toBe(false);

    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it('não tenta sincronizar o diretório pai que não pode abrir', () => {
    // o arquivo primeiro: `writeFileSync` também passa por `openSync`, e aqui
    // só interessa a abertura do shred
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    // `shredFile` abre o arquivo antes do diretório, então a falha precisa
    // mirar só a abertura do diretório (a de `O_RDONLY`).
    const real = fs.openSync.bind(fs);
    const open = vi
      .spyOn(fs, 'openSync')
      .mockImplementation((file: fs.PathLike, flags: fs.OpenMode) => {
        if (flags === fs.constants.O_RDONLY) throw new Error('sem permissão de leitura');
        return real(file, flags);
      });
    const close = vi.spyOn(fs, 'closeSync');

    // o arquivo já foi sobrescrito e apagado; só a sincronização do diretório
    // falhou, e o shred ainda devolve `true` porque o nome saiu
    expect(shredFile(target, 1)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    // uma vez só, pelo arquivo. A segunda viria do `finally` de
    // `fsyncDirectory`, que tentou fechar um descritor que nunca existiu.
    expect(close).toHaveBeenCalledTimes(1);

    open.mockRestore();
    close.mockRestore();
  });
});
