import fs from 'fs-extra';
import path from 'node:path';
import { currentMessages } from '@zero/main/i18n';
import { authDir, entriesDir, vaultDir } from '@zero/main/layout';

/**
 * Estrutura de diretórios do cofre: garante as pastas com o modo certo, sabe
 * listar o que existe lá dentro e concentra a escrita atômica de arquivo.
 * Fica entre `layout.ts` (só caminhos) e os módulos que leem e escrevem
 * arquivo, para que nenhum deles precise repetir a árvore de pastas nem criar
 * ciclo de importação com quem escreve o container.
 */

/** Modo de arquivo com segredo: só o dono lê e escreve. */
const SECRET_FILE_MODE = 0o600;

/** Sufixo do temporário da escrita atômica; o `erase` e a varredura olham ele. */
export const TEMP_SUFFIX = '.tmp';

/**
 * Grava arquivo de segredo de forma atômica: temporário no mesmo diretório,
 * `rename` e `chmod` no destino.
 *
 * A sequência estava copiada em `storage.ts`, `entries-store.ts`,
 * `auth-store.ts` e `settings.ts`, e uma das cópias tinha perdido o `chmod`.
 * O `rename` já entrega um inode novo, com o modo do temporário, mas isso é
 * implícito demais para um arquivo que guarda segredo cifrado: o `chmod`
 * explícito é o que fecha a porta quando o destino já existia com permissão
 * frouxa, e é o que mantém as cópias iguais.
 */
export function writeSecretFile(file: string, data: Buffer | string): void {
  const tmp = `${file}${TEMP_SUFFIX}`;
  fs.writeFileSync(tmp, data, { mode: SECRET_FILE_MODE });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, SECRET_FILE_MODE);
}

export function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

/** Garante a pasta do cofre em `/var/lib` com permissões restritas. */
export function ensureVaultStructure(): void {
  try {
    fs.ensureDirSync(vaultDir(), { mode: 0o700 });
    fs.ensureDirSync(entriesDir(), { mode: 0o700 });
    fs.ensureDirSync(authDir(), { mode: 0o700 });
    fs.chmodSync(vaultDir(), 0o700);
    fs.chmodSync(entriesDir(), 0o700);
    fs.chmodSync(authDir(), 0o700);
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(currentMessages().errors.vaultDirUnavailable, { cause: error });
    }
    throw error;
  }
}

/** Caminho efetivo do cofre (para mensagens e diagnóstico). */
export function vaultPath(): string {
  return vaultDir();
}

/** true se o erro é falta de permissão para criar a raiz do cofre em /var/lib. */
export function isVaultDirUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === currentMessages().errors.vaultDirUnavailable;
}

/**
 * Todo arquivo regular do cofre: pasta do container, `.entries` e `.auth`
 * juntas. Serve para o erasure e para a varredura de temporários órfãos, que
 * precisam ver o que existe de fato em vez do que o manifesto afirma.
 *
 * `.auth` entra na mesma lista de propósito: o Cryptographic Erase não pode
 * ter um diretório de arquivos que ele não apaga.
 */
export function vaultFiles(): string[] {
  const files: string[] = [];
  for (const dir of [vaultDir(), entriesDir(), authDir()]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.lstatSync(full).isFile()) files.push(full);
    }
  }
  return files;
}
