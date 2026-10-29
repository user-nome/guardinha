import fs from 'fs-extra';
import path from 'node:path';
import { randomBytes } from '@zero/main/crypto';
import { currentMessages } from '@zero/main/i18n';
import { authDir, entriesDir, vaultDir } from '@zero/main/layout';
import { isRecord } from '@zero/shared/record';

/** Pastas do cofre com o modo certo e a escrita atômica de arquivo, entre `layout` e os stores. */

/** Modo de arquivo com segredo: só o dono lê e escreve. */
const SECRET_FILE_MODE = 0o600;

/** Sufixo do temporário da escrita atômica; o `erase` e a varredura olham ele. */
export const TEMP_SUFFIX = '.tmp';

/** Nome do temporário: o sufixo aleatório e o `wx` impedem symlink plantado no caminho. */
export function tempPathFor(file: string): string {
  return `${file}.${randomBytes(8).toString('hex')}${TEMP_SUFFIX}`;
}

/** Escrita atômica: `.tmp` com `wx`, `rename` e `chmod` explícito no destino. */
export function writeSecretFile(file: string, data: Buffer | string): void {
  const tmp = tempPathFor(file);
  fs.writeFileSync(tmp, data, { mode: SECRET_FILE_MODE, flag: 'wx' });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, SECRET_FILE_MODE);
}

export function isPermissionError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = error.code;
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

/** Todo arquivo regular do cofre, inclusive `.auth`, para o erase não esquecer pasta. */
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
