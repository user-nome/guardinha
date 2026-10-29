import fs from 'fs-extra';
import path from 'node:path';
import { containerFile, entriesDir, authDir } from '@zero/main/layout';
import { listAuthIds } from '@zero/main/auth-store';
import { listEntryIds } from '@zero/main/entries-store';
import { unpackVaultContainer } from '@zero/main/container';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { setupVaultDirectory } from '@zero/main/privilege';
import { tempPathFor, writeSecretFile } from '@zero/main/structure';
import { packBackup, unpackBackup } from '@zero/main/backup/backup-container';
import { currentMessages } from '@zero/main/i18n';
import type { BackupSegment } from '@zero/main/backup/backup-container';
import type { BackupResult, RestoreResult } from '@zero/types';

/** Backup integral do cofre em `.gbk` e a restauração: só bytes já cifrados, sem sessão aberta. */

function readBackup(source: string): Buffer {
  try {
    return fs.readFileSync(source);
  } catch (error) {
    throw new Error(currentMessages().errors.backupInvalid, { cause: error });
  }
}

function writeBackupFile(destination: string, data: Buffer): void {
  // nome aleatório + `wx`: um `.tmp` fixo plantado como symlink levaria a escrita ao `vault.zkv`
  const tmp = tempPathFor(destination);
  try {
    fs.writeFileSync(tmp, data, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, destination);
    // melhor esforço: mídia removível (FAT/exFAT) recusa chmod
    try {
      fs.chmodSync(destination, 0o600);
    } catch {
      // sem permissão de mode no sistema de arquivos: o conteúdo continua cifrado
    }
  } catch (error) {
    // o temporário é nosso (o `wx` recusou o que existia); limpar evita lixo no pendrive
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // melhor esforço
    }
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

/** Empacota o cofre no destino e devolve a contagem e o tamanho do pacote. */
export function exportBackup(destination: string, appVersion: string): BackupResult {
  const segments = collectSegments();
  const packed = packBackup(segments, appVersion);
  writeBackupFile(destination, packed);
  return { path: destination, files: segments.length, bytes: packed.length };
}

/** Valida o pacote inteiro antes de escrever e confere o `vault.zkv` restaurado. */
export function restoreBackup(source: string): RestoreResult {
  const opened = unpackBackup(readBackup(source));
  const container = opened.files.find((file) => file.path === 'vault.zkv');
  if (container === undefined) throw new Error(currentMessages().errors.backupInvalid);

  // Pacote autofabricável: validar a forma do vault.zkv antes do erase separa cofre de lixo.
  const parsed = unpackVaultContainer(container.data);
  if (!parsed.ok) throw new Error(currentMessages().errors.backupInvalid);
  // O unpack já exige master ou PIN; falta conferir o manifesto, sem o qual não há cofre.
  if (parsed.data.manifest === null) {
    throw new Error(currentMessages().errors.backupInvalid);
  }

  // P4: restaurar sobre cofre existente exige sessão aberta, porque SHA-256 não é assinatura.
  if (vaultStorage.exists() && !vaultSession().isUnlocked()) {
    throw new Error(currentMessages().errors.vaultLocked);
  }

  ensureStructure();
  vaultSession().wipe();
  vaultStorage.erase();
  // Cofre novo e íntegro: a guarda do erase sai da frente para o manifesto poder ser selado.
  clearDestroyedFlag();
  ensureStructure();

  // Credenciais e tokens primeiro, container por último: crash deixa cofre sem chave, não aberto.
  for (const file of opened.files) {
    if (file.path === 'vault.zkv') continue;
    writeSecretFile(targetFor(file.path), file.data);
  }
  writeSecretFile(targetFor(container.path), container.data);

  return { path: source, files: opened.files.length };
}
