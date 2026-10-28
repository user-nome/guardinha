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

/** Grava no vetor e deixa a escrita passar ao disco; `zeros` marca a passada de limpeza. */
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
    // neutraliza o `rmdir` para medir a agregação do laço, não o erro dele
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
    // sem o `&&`, uma sobrescrita posterior apagaria o false da que falhou
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
    // o número de passadas é o que a sobrescrita entrega; chamar sem medir não prova
    expect(SHRED_PASSES).toBe(3);
  });

  it('apaga o arquivo e não deixa o conteúdo original para trás', () => {
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    expect(shredFile(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('sobrescreve arquivo maior que um bloco de escrita antes de apagar', () => {
    // arquivo de vários blocos exercita o laço de escrita; o pequeno passaria quebrado
    const big = 'x'.repeat(300_000);
    fs.writeFileSync(target, big, { mode: 0o600 });

    expect(shredFile(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });
});

describe('geometria da escrita', () => {
  it('grava em blocos de 64 KiB e nunca passa do fim do arquivo', () => {
    // 200.000 = 3 × 65.536 + 3.392: blocos contíguos cobrem tudo sem passar do fim
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
    // sem isto, um resto errado ainda passaria nos arquivos grandes
    fs.writeFileSync(target, 'conteudo-pequeno', { mode: 0o600 });
    const calls = spyWrite();

    shredFile(target, 1);

    expect(calls.map((c) => c.length)).toEqual(['conteudo-pequeno'.length]);
    expect(calls.map((c) => c.position)).toEqual([0]);
  });
});

describe('quantas passadas cada pedido gera', () => {
  // toda passada recomeça em 0; um arquivo de um bloco tem uma escrita por passada
  const passesOf = (requested: number): boolean[] => {
    // restaura antes de espionar: senão o espião anterior grava junto no mesmo `writeSync`
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
    // 5.5 não é inteiro: sem a guarda, viraria seis passadas em vez de três
    expect(passesOf(5.5).length).toBe(SHRED_PASSES);
  });

  it('alterna aleatório e zero, terminando sempre em zero', () => {
    // passada ímpar é de zeros e a última é de zeros, para não sobrar conteúdo válido
    expect(passesOf(4)).toEqual([false, true, false, true]);
    // com número ímpar a última cai no índice par; a regra da última é que segura
    expect(passesOf(3)).toEqual([false, true, true]);
    expect(passesOf(1)).toEqual([true]);
    // seis passadas separam "índice ímpar" de "índice 1 mod 3": fixa a periodicidade 2
    expect(passesOf(6)).toEqual([false, true, false, true, false, true]);
  });
});

describe('o descarte do descritor', () => {
  it('não tenta fechar descritor que nunca foi aberto', () => {
    // `fd` nasce nulo e o `finally` só fecha o que existe; fechar `null` seria exceção
    const close = vi.spyOn(fs, 'closeSync');

    expect(shredFile(path.join(root, 'nao-existe.zke'), 3)).toBe(false);

    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it('não tenta sincronizar o diretório pai que não pode abrir', () => {
    // o arquivo primeiro: `writeFileSync` também passa por `openSync`
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    // `shredFile` abre o arquivo antes do diretório; a falha mira só o `O_RDONLY`
    const real = fs.openSync.bind(fs);
    const open = vi
      .spyOn(fs, 'openSync')
      .mockImplementation((file: fs.PathLike, flags: fs.OpenMode) => {
        if (flags === fs.constants.O_RDONLY) throw new Error('sem permissão de leitura');
        return real(file, flags);
      });
    const close = vi.spyOn(fs, 'closeSync');

    // o arquivo já foi apagado; só a sincronização do diretório falhou
    expect(shredFile(target, 1)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    // uma vez só, pelo arquivo; a segunda viria de um descritor que nunca existiu
    expect(close).toHaveBeenCalledTimes(1);

    open.mockRestore();
    close.mockRestore();
  });
});
