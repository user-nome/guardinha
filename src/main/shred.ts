import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sobrescrita de arquivo antes da remoção (File Shredding). É a base física do
 * Cryptographic Erase e da remoção de credencial, então só faz o trabalho
 * braçal e não conhece o cofre: recebe sempre um caminho já validado por quem
 * o compôs (`storage.ts`, via `assertSafeEntryId`), nunca um id cru, e não
 * decide o que é segredo.
 *
 * O roteiro é o mesmo do `shred(1)` e do `srm` do pacote `secure-delete`:
 * sobrescreve o conteúdo em blocos, alternando bytes aleatórios e zeros,
 * termina com a passada de zeros, sincroniza, apaga o nome e sincroniza o
 * diretório pai para a remoção ficar durável.
 *
 * Honestidade sobre o alcance: em disco rotacional (HDD) a sobrescrita em
 * blocos é a defesa; em SSD, com wear leveling e over-provisioning, a escrita
 * pode acabar em outro bloco físico e o original sobrar no controle do
 * controlador. Por isso o Cryptographic Erase (apagar a chave embrulhada) é a
 * estratégia primária, e o shred aqui é higiene. O detalhamento está em
 * `SECURITY.md` e `docs/cofre.md`.
 */

/** Passadas por padrão: 3 é o padrão do `shred(1)` e o suficiente aqui. */
export const SHRED_PASSES = 3;

/** Teto aceito do chamador; acima disso a sobrescrita só gasta I/O. */
const MAX_PASSES = 16;

/** Bloco de escrita: 64 KiB equilibra cache de página e número de syscalls. */
const BLOCK_BYTES = 64 * 1024;

/** Tenta abrir o diretório pai em leitura, para sincronizar a remoção. */
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

/**
 * Escreve uma passada inteira sobre o arquivo. Passadas ímpares recebem bytes
 * aleatórios de hardware e as pares recebem zeros; a última é sempre de zeros,
 * para o arquivo não terminar com conteúdo aparentemente válido.
 */
function writePass(fd: number, size: number, zeros: boolean): void {
  const block = zeros ? Buffer.alloc(BLOCK_BYTES, 0) : crypto.randomBytes(BLOCK_BYTES);
  let written = 0;
  while (written < size) {
    const chunk = Math.min(block.length, size - written);
    fs.writeSync(fd, block, 0, chunk, written);
    written += chunk;
  }
}

/**
 * Sobrescreve e apaga um arquivo. Devolve `true` só quando o arquivo deixou de
 * existir, e `false` em qualquer outra situação: não existia, era symlink ou
 * diretório, não deu para abrir ou apagar. Nunca lança: falha de shred não
 * pode impedir a autodestruição de acontecer logicamente, quem chama decide o
 * que fazer com o `false`.
 */
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
    // sem o fsync a sobrescrita pode ficar só no cache de página e o unlink
    // seguinte publica um arquivo cujo conteúdo antigo continua no platter
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

/**
 * Sobrescreve e apaga todos os arquivos regulares de um diretório, e remove o
 * diretório vazio. Subdiretórios e nomes inesperados fazem a operação devolver
 * `false` sem apagar nada fora do que já foi shreddado: quem chama decide.
 */
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
