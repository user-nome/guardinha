import fs from 'fs-extra';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { markVaultDestroyed } from '@zero/main/erasure-state';
import { SHRED_PASSES, shredDirectory, shredFile } from '@zero/main/shred';
import { vaultFiles } from '@zero/main/structure';
import type { EraseResult } from '@zero/types';

/** Cryptographic Erase: apaga a chave embrulhada e, com ela, entradas e tokens de 2FA. */

/** O erase é idempotente: chamar de novo devolve zero sem erro. */
export function eraseVault(): EraseResult {
  let shredded = 0;
  let failed = 0;

  // o container entra primeiro: `vaultFiles()` pode falhar se o shred derrubou a pasta
  const targets = new Set<string>([containerFile()]);
  for (const file of vaultFiles()) targets.add(file);

  for (const file of targets) {
    if (shredFile(file, SHRED_PASSES)) shredded++;
    else if (fs.existsSync(file)) failed++;
  }

  // a pasta só sai se todos os arquivos dentro caíram (permissão, I/O ocupado)
  for (const dir of [entriesDir(), authDir()]) {
    if (!fs.existsSync(dir)) continue;
    if (shredDirectory(dir)) shredded++;
    else failed++;
  }

  // só marca a destruição quando o `vault.zkv` sumiu: senão a chave ainda abre o cofre
  if (!fs.existsSync(containerFile())) markVaultDestroyed();
  return { shredded, failed };
}
