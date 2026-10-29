// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app, BrowserWindow, dialog, ipcMain, resetElectronMock } from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';

// O `backup` é mockado aqui: o teste cobre a fronteira do canal, o diálogo nativo e o aviso de sessão.
vi.mock('@zero/main/backup/backup', () => ({
  exportBackup: vi.fn(() => ({ path: '/pendrive/cofre.gbk', files: 3, bytes: 2048 })),
  restoreBackup: vi.fn(() => ({ path: '/pendrive/cofre.gbk', files: 3 })),
}));

import { exportBackup, restoreBackup } from '@zero/main/backup/backup';
import { currentMessages } from '@zero/main/i18n';
import '@zero/main/index';

/** Registro de handlers tirado do mock na hora do import (ver `entrypoint.test.ts`). */
const HANDLERS = new Map<string, IpcHandler>(ipcMain.handle.mock.calls);

/** Janela criada no boot, antes do primeiro reset. */
const BOOT_WINDOW = BrowserWindow.instances[0];

/** Evento de IPC com frame apontando para a página oficial do app. */
function appFrame(): unknown {
  return { senderFrame: { url: 'guardinha://app/index.html' } };
}

function call(channel: string, event: unknown, ...args: unknown[]): unknown {
  const handler = HANDLERS.get(channel);
  if (handler === undefined) throw new Error(`canal ${channel} não registrado`);
  return handler(event, ...args);
}

/** Dispara o `closed` da janela do boot: é o que zera a referência no main. */
function closeBootWindow(): void {
  const closed = BOOT_WINDOW?.on.mock.calls.find(([event]) => event === 'closed')?.[1];
  if (typeof closed !== 'function') throw new Error('closed não registrado');
  closed();
}

beforeEach(() => {
  resetElectronMock();
});

describe('canal backup:export', () => {
  it('trata cancelamento do diálogo como "não exportado", sem tocar no cofre', () => {
    dialog.showSaveDialogSync.mockReturnValue(undefined);

    expect(call('backup:export', appFrame())).toEqual({ canceled: true });
    expect(exportBackup).not.toHaveBeenCalled();
  });

  it('trata caminho vazio do diálogo como cancelamento', () => {
    // O Electron tipa o retorno como `string`, mas string vazia não escolheu arquivo nenhum.
    dialog.showSaveDialogSync.mockReturnValue('');

    expect(call('backup:export', appFrame())).toEqual({ canceled: true });
    expect(exportBackup).not.toHaveBeenCalled();
  });

  it('exporta para o caminho escolhido e devolve contagem e tamanho', () => {
    dialog.showSaveDialogSync.mockReturnValue('/pendrive/cofre.gbk');

    expect(call('backup:export', appFrame())).toEqual({
      path: '/pendrive/cofre.gbk',
      files: 3,
      bytes: 2048,
    });
    // a versão do app entra no manifesto do pacote
    expect(exportBackup).toHaveBeenCalledWith('/pendrive/cofre.gbk', app.getVersion());
    // o diálogo é sempre com a janela: sem ela o native pegaria a janela errada
    expect(dialog.showSaveDialogSync).toHaveBeenCalledWith(BOOT_WINDOW, expect.any(Object));
  });

  it('pede o destino com o nome de arquivo e o filtro do pacote', () => {
    dialog.showSaveDialogSync.mockReturnValue('/pendrive/cofre.gbk');
    const m = currentMessages();

    call('backup:export', appFrame());

    // O nome sugerido sai da data em UTC: um `defaultPath` sem `.gbk` salvaria sem extensão.
    const hoje = new Date().toISOString().slice(0, 10);
    expect(dialog.showSaveDialogSync).toHaveBeenCalledWith(BOOT_WINDOW, {
      title: m.backup.exportAction,
      defaultPath: `guardinha-backup-${hoje}.gbk`,
      filters: [{ name: 'Backup Guardinha', extensions: ['gbk'] }],
    });
  });
});

describe('canal backup:restore', () => {
  it('trata cancelamento do diálogo como "não restaurado", sem tocar no cofre', () => {
    dialog.showOpenDialogSync.mockReturnValue(undefined);

    expect(call('backup:restore', appFrame())).toEqual({ canceled: true });
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('trata seleção vazia do diálogo como cancelamento', () => {
    dialog.showOpenDialogSync.mockReturnValue([]);

    expect(call('backup:restore', appFrame())).toEqual({ canceled: true });
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('restaura do arquivo escolhido e devolve o cofre à tela de autenticação', () => {
    // A restauração zera a chave em memória: o main avisa pelo canal do auto-lock.
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    dialog.showOpenDialogSync.mockReturnValue(['/pendrive/cofre.gbk']);
    BOOT_WINDOW.webContents.send.mockClear();

    expect(call('backup:restore', appFrame())).toEqual({
      path: '/pendrive/cofre.gbk',
      files: 3,
    });
    expect(restoreBackup).toHaveBeenCalledWith('/pendrive/cofre.gbk');
    expect(BOOT_WINDOW.webContents.send).toHaveBeenCalledWith(
      'vault:auto-locked',
      expect.objectContaining({ locked: true }),
    );
  });

  it('pede a origem com o filtro do pacote e só um arquivo', () => {
    dialog.showOpenDialogSync.mockReturnValue(['/pendrive/cofre.gbk']);

    call('backup:restore', appFrame());

    expect(dialog.showOpenDialogSync).toHaveBeenCalledWith(BOOT_WINDOW, {
      title: currentMessages().backup.restoreAction,
      properties: ['openFile'],
      filters: [{ name: 'Backup Guardinha', extensions: ['gbk'] }],
    });
  });

  it('propaga o erro do pacote inválido, que é erro de domínio e não de sessão', () => {
    vi.mocked(restoreBackup).mockImplementationOnce(() => {
      throw new Error(currentMessages().errors.backupCorrupted);
    });
    dialog.showOpenDialogSync.mockReturnValue(['/pendrive/adulterado.gbk']);

    expect(() => call('backup:restore', appFrame())).toThrow(
      currentMessages().errors.backupCorrupted,
    );
  });
});

describe('diálogo sem janela', () => {
  // `mainWindow` pode existir no main e não estar mais ali; os dois caminhos precisam existir.
  it('abre o diálogo de salvar sem janela quando ela já fechou', () => {
    dialog.showSaveDialogSync.mockReturnValue('/pendrive/cofre.gbk');
    closeBootWindow();

    expect(call('backup:export', appFrame())).toEqual({
      path: '/pendrive/cofre.gbk',
      files: 3,
      bytes: 2048,
    });
    expect(dialog.showSaveDialogSync).toHaveBeenCalledWith(expect.any(Object));
    expect(dialog.showSaveDialogSync.mock.calls[0]).toHaveLength(1);
  });

  it('abre o diálogo de abrir sem janela quando ela já fechou', () => {
    dialog.showOpenDialogSync.mockReturnValue(['/pendrive/cofre.gbk']);

    expect(call('backup:restore', appFrame())).toEqual({
      path: '/pendrive/cofre.gbk',
      files: 3,
    });
    expect(dialog.showOpenDialogSync.mock.calls[0]).toHaveLength(1);
  });

  it('restaura sem janela não trava ao tentar avisar a tela que não existe mais', () => {
    closeBootWindow();
    dialog.showOpenDialogSync.mockReturnValue(['/pendrive/cofre.gbk']);

    expect(call('backup:restore', appFrame())).toEqual({
      path: '/pendrive/cofre.gbk',
      files: 3,
    });
  });
});
