import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SHRED_PASSES, MAX_SHRED_PASSES, SHRED_BLOCK_BYTES } from '@zero/shared/auth-constants';

/**
 * Sobrescrita de arquivo antes do `unlink`; recebe caminho já validado e não conhece o cofre.
 * Detalhes em docs/cofre.md.
 */

/** Passadas por padrão: 3, o mesmo padrão do `shred(1)`. */
export { SHRED_PASSES };

/** Teto aceito do chamador; acima disso a sobrescrita só gasta I/O. */
const MAX_PASSES = MAX_SHRED_PASSES;

/** Bloco de escrita: 64 KiB equilibra cache de página e número de syscalls. */
const BLOCK_BYTES = SHRED_BLOCK_BYTES;

/** Sincroniza o diretório pai para a remoção ficar durável. */
function fsyncDirectory(dir: string): void {
  let fd: number | null = null;
  try {
    fd = fs.openSync(dir, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } catch {
    // melhor esforço: alguns sistemas de arquivos recusam fsync em diretório
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // melhor esforço
      }
    }
  }
}

/** Normaliza o número de passadas para dentro da faixa aceita. */
function normalizePasses(passes: number): number {
  if (!Number.isInteger(passes)) return SHRED_PASSES;
  return Math.min(Math.max(passes, 1), MAX_PASSES);
}

/** Alterna aleatório e zero, e fecha com zeros para não deixar conteúdo válido. */
function writePass(fd: number, size: number, zeros: boolean): void {
  const block = zeros ? Buffer.alloc(BLOCK_BYTES, 0) : crypto.randomBytes(BLOCK_BYTES);
  let written = 0;
  while (written < size) {
    const chunk = Math.min(block.length, size - written);
    fs.writeSync(fd, block, 0, chunk, written);
    written += chunk;
  }
}

/** Sobrescreve e apaga; devolve `true` só se o arquivo sumiu, e nunca lança. */
export function shredFile(file: string, passes: number = SHRED_PASSES): boolean {
  let fd: number | null = null;
  try {
    // symlink e diretório fora: `isFile()` falso aborta antes de qualquer escrita
    if (!fs.lstatSync(file).isFile()) return false;
    // O_NOFOLLOW fecha a corrida entre o lstat e a abertura
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
    const size = fs.fstatSync(fd).size;
    const total = normalizePasses(passes);
    for (let pass = 0; pass < total; pass++) {
      writePass(fd, size, pass === total - 1 || pass % 2 === 1);
    }
    // sem o fsync, a sobrescrita pode ficar no cache e o unlink publicar o conteúdo antigo
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.unlinkSync(file);
    fsyncDirectory(path.dirname(file));
    return true;
  } catch {
    // melhor esforço: devolve false e deixa quem chama decidir
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // melhor esforço
      }
    }
  }
}

/** Sobrescreve os arquivos regulares do diretório e remove o diretório vazio. */
export function shredDirectory(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let complete = true;
  for (const entry of entries) {
    if (!entry.isFile()) {
      complete = false;
      continue;
    }
    complete = shredFile(path.join(dir, entry.name), SHRED_PASSES) && complete;
  }
  try {
    fs.rmdirSync(dir);
  } catch {
    // sobrou algo dentro (ou o diretório não é do app): o nome sai mesmo assim
    complete = false;
  }
  return complete;
}
