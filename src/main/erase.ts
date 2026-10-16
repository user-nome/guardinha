import fs from 'fs-extra';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { markVaultDestroyed } from '@zero/main/erasure-state';
import { SHRED_PASSES, shredDirectory, shredFile } from '@zero/main/shred';
import { TEMP_SUFFIX, vaultFiles } from '@zero/main/structure';
import type { EraseResult } from '@zero/types';

/**
 * Cryptographic Erase: a autodestruição do cofre.
 *
 * A chave do cofre é gerada uma vez e nunca mais gravada em claro. O que
 * existe em `vault.zkv` são *embrulhos* dela, cada um protegido por uma
 * credencial do usuário com Argon2id. Apagar esse arquivo não apaga os dados,
 * apaga a **chave**: os `.zke` viram ruído matemático e AES-256-GCM sem a
 * chave não tem caminho de volta. Por isso isto é mais rápido e mais
 * confiável do que sobrescrever gigabytes, e é a estratégia primária em SSD,
 * onde o wear leveling decide sozinho para qual bloco físico a escrita vai.
 *
 * A ordem é fixa e sem desvios:
 *
 * 1. `vault.zkv` e o seu `.tmp` (cópia temporária que **contém os mesmos
 *    blobs de chave**; um órfão de crash seria uma cópia completa do
 *    embrulho);
 * 2. todo arquivo de credencial (`.zke`, `.zke.tmp`), por shred;
 * 3. todo arquivo de token de 2FA (`.zka`, `.zka.tmp`), por shred;
 * 4. as pastas `.entries` e `.auth` em si;
 *
 * e nunca `vaultDir()` nem `.guardinha/`: a raiz é do sistema
 * (`root:root 0711`, criada no `postinst`) e o app não é dono dela.
 *
 * Os tokens de 2FA entram na mesma lista pelo motivo mais forte de todos: o
 * segredo TOTP de uma conta vale tanto quanto a senha dela. Deixar `.auth` de
 * pé num Cryptographic Erase seria apagar a fechadura e deixar a chave na
 * parede.
 */

/** O erase é idempotente: chamar de novo devolve zero sem erro. */
export function eraseVault(): EraseResult {
  let shredded = 0;
  let failed = 0;

  // o container e o `.tmp` entram primeiro e à mão: `vaultFiles()` pode não
  // estar liberado para leitura se o shred anterior derrubou a pasta
  const targets = new Set<string>([containerFile(), `${containerFile()}${TEMP_SUFFIX}`]);
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

  markVaultDestroyed();
  return { shredded, failed };
}
