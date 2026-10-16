import fs from 'fs-extra';
import path from 'node:path';
import { containerFile, entriesDir, authDir } from '@zero/main/layout';
import { listAuthIds } from '@zero/main/auth-store';
import { listEntryIds } from '@zero/main/entries-store';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { setupVaultDirectory } from '@zero/main/privilege';
import { writeSecretFile } from '@zero/main/structure';
import { packBackup, unpackBackup } from '@zero/main/backup/backup-container';
import { currentMessages } from '@zero/main/i18n';
import type { BackupSegment } from '@zero/main/backup/backup-container';
import type { BackupResult, RestoreResult } from '@zero/types';

/**
 * Backup integral do cofre em arquivo único (`.gbk`) e a restauração dele.
 *
 * O que vai para o pendrive é **o que já está cifrado no cofre**, sem decifrar
 * nada: o `vault.zkv` (com os embrulhos da chave) e cada `.zke`/`.zka`. Quem
 * achar o pendrive não lê nada sem o PIN ou a senha mestra, e o app não precisa
 * da chave para copiar bytes opacos de um lado para o outro.
 *
 * A exportação lê a estrutura direto (contêiner, `.entries`, `.auth`), ignora
 * temporários `.tmp` e empacota com manifesto e SHA-256 por arquivo. A
 * restauração valida o pacote **inteiro antes de tocar no disco**; só depois
 * apaga o cofre atual (pelo mesmo Cryptographic Erase) e grava o cofre novo, com
 * o contêiner por último para que um crash no meio não deixe um cofre "aberto"
 * sem as credenciais.
 *
 * Não exige sessão desbloqueada de propósito: o caso de uso principal é a
 * máquina formatada, onde o app acabou de ser instalado e ainda não tem cofre
 * nenhum. Depois de restaurar, a sessão é zerada e o cofre só abre com as
 * credenciais do backup.
 */

function readBackup(source: string): Buffer {
  try {
    return fs.readFileSync(source);
  } catch (error) {
    throw new Error(currentMessages().errors.backupInvalid, { cause: error });
  }
}

function writeBackupFile(destination: string, data: Buffer): void {
  const tmp = `${destination}.tmp`;
  try {
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, destination);
    // melhor esforço: mídia removível (FAT/exFAT) recusa chmod
    try {
      fs.chmodSync(destination, 0o600);
    } catch {
      // sem permissão de mode no sistema de arquivos: o conteúdo continua cifrado
    }
  } catch (error) {
    throw new Error(currentMessages().errors.backupWriteFailed, { cause: error });
  }
}

/** Arquivos do cofre que entram no pacote, com o caminho relativo de cada um. */
function collectSegments(): BackupSegment[] {
  const segments: BackupSegment[] = [];
  const container = containerFile();
  if (fs.existsSync(container))
    segments.push({ path: 'vault.zkv', data: fs.readFileSync(container) });
  for (const id of listEntryIds()) {
    segments.push({
      path: `.entries/${id}.zke`,
      data: fs.readFileSync(path.join(entriesDir(), `${id}.zke`)),
    });
  }
  for (const id of listAuthIds()) {
    segments.push({
      path: `.auth/${id}.zka`,
      data: fs.readFileSync(path.join(authDir(), `${id}.zka`)),
    });
  }
  return segments;
}

/** Caminho absoluto do arquivo cujo caminho relativo veio do pacote. */
function targetFor(relative: string): string {
  if (relative === 'vault.zkv') return containerFile();
  const name = relative.slice(relative.indexOf('/') + 1);
  return relative.startsWith('.entries/')
    ? path.join(entriesDir(), name)
    : path.join(authDir(), name);
}

/** Garante as pastas do cofre, com o helper do PolicyKit quando falta permissão. */
function ensureStructure(): void {
  try {
    vaultStorage.ensureStructure();
  } catch (error) {
    if (!vaultStorage.isDirUnavailable(error)) throw error;
    if (!setupVaultDirectory()) {
      throw new Error(currentMessages().errors.vaultAuthCancelled, { cause: error });
    }
    vaultStorage.ensureStructure();
  }
}

/**
 * Empacota o cofre e grava no destino escolhido (pendrive). Devolve quantos
 * arquivos entraram e o tamanho do pacote, para a tela confirmar o que saiu.
 */
export function exportBackup(destination: string, appVersion: string): BackupResult {
  const segments = collectSegments();
  const packed = packBackup(segments, appVersion);
  writeBackupFile(destination, packed);
  return { path: destination, files: segments.length, bytes: packed.length };
}

/**
 * Substitui o cofre atual pelos arquivos do backup. O pacote é validado por
 * inteiro (magic, versão, digest global, SHA-256 de cada arquivo) antes de
 * qualquer escrita; um byte trocado derruba aqui, com o cofre atual intacto.
 */
export function restoreBackup(source: string): RestoreResult {
  const opened = unpackBackup(readBackup(source));
  const container = opened.files.find((file) => file.path === 'vault.zkv');
  if (container === undefined) throw new Error(currentMessages().errors.backupInvalid);

  ensureStructure();
  vaultSession().wipe();
  vaultStorage.erase();
  // o pacote é um cofre novo e íntegro: a guarda que barra recriar o contêiner
  // depois de um erase sai da frente, senão o `writeVaultContainer` das próximas
  // operações ficaria mudo e o cofre restaurado não selaria o manifesto
  clearDestroyedFlag();
  ensureStructure();

  // credenciais e tokens primeiro, contêiner por último: um crash no meio deixa
  // um cofre sem chave (a tela pede criar), nunca um cofre aberto e pela metade
  for (const file of opened.files) {
    if (file.path === 'vault.zkv') continue;
    writeSecretFile(targetFor(file.path), file.data);
  }
  writeSecretFile(containerFile(), container.data);

  return { path: source, files: opened.files.length };
}
