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
  // nome aleatório + `wx`: o pendrive é território hostil, e um `.tmp` fixo
  // plantado como symlink levava a escrita para o `vault.zkv`
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
    // o temporário é nosso (o `wx` recusou qualquer coisa pré-existente);
    // limpar evita deixar lixo no pendrive quando o rename falha
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
 * inteiro (magic, versão, digest global, SHA-256 de cada arquivo) e o
 * `vault.zkv` restaurado é conferido antes de qualquer escrita: um pacote
 * autofabricado com SHA-256 coerente não pode mais apagar o cofre atual para
 * gravar um container inválido.
 */
export function restoreBackup(source: string): RestoreResult {
  const opened = unpackBackup(readBackup(source));
  const container = opened.files.find((file) => file.path === 'vault.zkv');
  if (container === undefined) throw new Error(currentMessages().errors.backupInvalid);

  // a validação do container precisa vir antes do erase: o pacote inteiro é
  // autofabricável (SHA-256 não é assinatura), então só a forma do `vault.zkv`
  // separa um cofre restaurável de um monte de bytes que apagaria o atual
  const parsed = unpackVaultContainer(container.data);
  if (!parsed.ok) throw new Error(currentMessages().errors.backupInvalid);
  const methods = parsed.data.methods;
  if (methods.master === undefined && methods.pin === undefined && methods.recovery === undefined) {
    throw new Error(currentMessages().errors.backupInvalid);
  }
  if (parsed.data.manifest === null) {
    throw new Error(currentMessages().errors.backupInvalid);
  }

  // P4: substituir um cofre existente exige a sessão aberta, ou seja, a
  // credencial atual provada. O SHA-256 do pacote não é assinatura, então sem
  // esta guarda um `.gbk` forjado trocaria o cofre de quem só clicou em
  // restaurar. Máquina formatada (sem cofre) continua restaurando de graça.
  if (vaultStorage.exists() && !vaultSession().isUnlocked()) {
    throw new Error(currentMessages().errors.vaultLocked);
  }

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
  writeSecretFile(targetFor(container.path), container.data);

  return { path: source, files: opened.files.length };
}
