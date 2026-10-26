import { Menu, app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import {
  createVault,
  getStatus,
  isVaultLockedError,
  lock,
  panicDestroy,
  resetPin,
  setNukeLimit,
  setPanicPin,
  clearPanicPin,
  panicStatus,
  unlock,
} from '@zero/main/vault';
import { activityMonitor } from '@zero/main/activity';
import { openableUrl } from '@zero/main/auth';
import { removeEntry, saveEntry, listEntries } from '@zero/main/entries';
import {
  currentCodes,
  listTokens,
  removeToken,
  saveToken,
  saveTokenFromUri,
} from '@zero/main/authenticator';
import { assertGeneratorOptions, generateHighEntropyPassword } from '@zero/main/generator';
import { exportBackup, restoreBackup } from '@zero/main/backup/backup';
import { secureClipboard } from '@zero/main/clipboard';
import { vaultStorage } from '@zero/main/facade';
import { quietChromiumLog } from '@zero/main/logging';
import {
  appPageUrl,
  assertAppFrame,
  registerAppProtocol,
  registerAppSchemePrivileges,
  resolvePreloadScript,
  resolveWindowIcon,
} from '@zero/main/protocol';
import { loadSettings, saveSettings } from '@zero/main/settings';
import { currentMessages } from '@zero/main/i18n';
import { STALE_TMP_MS } from '@zero/shared/auth-constants';
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_TITLE,
  WINDOW_BACKGROUND_COLOR,
} from '@zero/main/window-constants';
import type {
  AppSettings,
  AuthTokenDraft,
  CreateVaultInput,
  CredentialInput,
  GeneratorOptions,
  PanicPinInput,
  ResetPinInput,
  UnlockInput,
} from '@zero/types';

// o Electron exige a declaração do scheme antes do app ficar pronto, então ela
// roda no topo do módulo, e não dentro do `whenReady`
registerAppSchemePrivileges();

let mainWindow: BrowserWindow | null = null;

/**
 * Chama o diálogo síncrono já normalizado para `string | undefined`: o tipo do
 * Electron declara `string`, mas o retorno é `undefined` quando o usuário
 * cancela, e a função isola essa divergência num lugar só.
 */
function showSaveDialog(options: SaveDialogOptions): string | undefined {
  return mainWindow === null
    ? dialog.showSaveDialogSync(options)
    : dialog.showSaveDialogSync(mainWindow, options);
}

/** Abre o diálogo nativo de salvar; `null` quando o usuário cancela. */
function pickSavePath(options: SaveDialogOptions): string | null {
  const result = showSaveDialog(options);
  if (result === undefined || result === '') return null;
  return result;
}

/** Abre o diálogo nativo de abrir arquivo (um só); `null` quando cancela. */
function pickOpenPath(options: OpenDialogOptions): string | null {
  const result =
    mainWindow === null
      ? dialog.showOpenDialogSync(options)
      : dialog.showOpenDialogSync(mainWindow, options);
  return result?.[0] ?? null;
}

function createWindow(): void {
  const iconPath = resolveWindowIcon();
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    // 400 px é a janela mais estreita em que o app ainda se lê: a grade de
    // cartões já é uma coluna só e a Sidebar já é o trilho de ícones, então
    // estreitar mais só corta texto. Ver `src/renderer/src/card-grid.ts`.
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: WINDOW_TITLE,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    ...(iconPath === undefined ? {} : { icon: iconPath }),
    show: false,
    webPreferences: {
      preload: resolvePreloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Em produção o DevTools fica de fora: atalho não expõe o renderer.
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // O app é uma SPA local: navegação só vale para a própria página (o reload
  // mantém a mesma URL); qualquer salto para outra URL é recusado.
  const targetUrl = appPageUrl();
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== targetUrl) event.preventDefault();
  });

  // `window.target=_blank` nunca cria janela: https vai para o navegador do
  // sistema e o resto (http:, javascript:, file:, data:) é só recusado.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) {
      shell.openExternal(url).catch((error: unknown) => {
        console.error('Falha ao abrir URL externa:', error);
      });
    }
    return { action: 'deny' };
  });

  void mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Nega toda permissão web do renderer (mídia, geolocalização, notificações,
 * clipboard…): a cópia de credenciais passa pelo canal `clipboard:copy` e usa o
 * clipboard nativo no main, sem pedir permissão nenhuma ao sistema.
 */
function registerPermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  // o request handler cobre o diálogo, mas a checagem síncrona
  // (`navigator.permissions.query` e afins) devolve "granted" quando não há
  // um check handler. Sem este, a promessa de "toda permissão negada" não vale.
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setDevicePermissionHandler(() => false);
}

/**
 * Silencia o erro de VA-API que o Chromium imprime ao subir em máquina com o
 * driver de vídeo Intel quebrado (`libva error: iHD_drv_video.so init failed`).
 *
 * A opção é a mais estreita possível: `--disable-accelerated-video-decode`
 * afeta **apenas decodificação de vídeo**, e o app não tem vídeo nenhum (nenhum
 * `<video>`, WebCodecs ou captura de canvas). A composição de tela e o WebGL
 * continuam na GPU. Desligar a GPU inteira resolveria a mensagem também, mas
 * trocaria a aceleração da interface por software em todas as máquinas, o que é
 * um custo real para esconder uma linha cosmética.
 *
 * Não é ligado só no dev de propósito: um switch que só existe em
 * desenvolvimento significa que o app nunca é testado como ele é publicado.
 */
function disableVideoDecode(): void {
  app.commandLine.appendSwitch('disable-accelerated-video-decode');
}

/**
 * Operação que exige a chave do cofre, com aviso de sessão perdida.
 *
 * A chave pode sumir entre o momento em que o renderer recebe o status e o
 * momento em que ele pede os dados: é o que acontece no auto-lock (o timer
 * dispara enquanto a tela está montada) e também quando o processo main
 * reinicia em `npm run dev`, que recria o `VaultSessionManager` vazio e deixa
 * o renderer com a tela que ele já tinha. Sem aviso, o renderer fica chamando
 * um cofre que não existe mais e a tela trava num erro que ninguém explica.
 *
 * A resposta continua sendo **erro**: devolver lista vazia seria fail-open e o
 * app apareceria como um cofre vazio, que é a pior leitura possível num app de
 * credenciais. O que muda é o main avisar pelo mesmo canal do auto-lock, para
 * o renderer reconsultar o status e voltar para a autenticação.
 */
function withSessionNotice<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (isVaultLockedError(error)) {
      mainWindow?.webContents.send('vault:auto-locked', getStatus());
    }
    throw error;
  }
}

function registerIpc(): void {
  vaultStorage.cleanTempFiles(STALE_TMP_MS);
  ipcMain.handle('vault:status', (event) => {
    assertAppFrame(event);
    return getStatus();
  });
  ipcMain.handle('vault:create', (event, input: CreateVaultInput) => {
    assertAppFrame(event);
    return createVault(input);
  });
  ipcMain.handle('vault:unlock', (event, input: UnlockInput) => {
    assertAppFrame(event);
    return unlock(input);
  });
  ipcMain.handle('vault:resetPin', (event, input: ResetPinInput) => {
    assertAppFrame(event);
    return resetPin(input);
  });
  ipcMain.handle('vault:lock', (event) => {
    assertAppFrame(event);
    return lock();
  });

  /**
   * Autodestruição sob comando explícito do usuário. A confirmação em duas
   * etapas mora no renderer (digitar DESTRUIR); aqui a fronteira de segurança é
   * só a origem do frame, como em qualquer outro canal.
   */
  ipcMain.handle('vault:destroy', (event) => {
    assertAppFrame(event);
    return panicDestroy();
  });

  // ---- Proteções de pânico (PIN de coação e autodestruição por tentativas) ----
  // Canal novo exige `assertAppFrame`: sem ele o domínio fica aberto a frame de
  // fora, e um canal de autodestruição aberto é o pior caso possível.
  ipcMain.handle('vault:set-panic-pin', (event, input: PanicPinInput) => {
    assertAppFrame(event);
    return setPanicPin(input);
  });
  ipcMain.handle('vault:clear-panic-pin', (event) => {
    assertAppFrame(event);
    return clearPanicPin();
  });
  ipcMain.handle('vault:set-nuke-limit', (event, limit: number) => {
    assertAppFrame(event);
    return setNukeLimit(limit);
  });
  ipcMain.handle('vault:panic-status', (event) => {
    assertAppFrame(event);
    return panicStatus();
  });

  /** Abre o domínio da credencial no navegador padrão (só http/https). */
  ipcMain.handle('shell:open-domain', (event, domain: string) => {
    assertAppFrame(event);
    void shell.openExternal(openableUrl(domain));
  });

  ipcMain.handle('entries:list', (event) => {
    assertAppFrame(event);
    return withSessionNotice(listEntries);
  });
  ipcMain.handle('entries:save', (event, entry: CredentialInput) => {
    assertAppFrame(event);
    return withSessionNotice(() => saveEntry(entry));
  });
  ipcMain.handle('entries:delete', (event, id: string) => {
    assertAppFrame(event);
    return withSessionNotice(() => removeEntry(id));
  });

  // ---- Gerador de 2FA (TOTP) ----
  // Todos com `assertAppFrame` e `withSessionNotice`: `codes` é o canal mais
  // sensível do grupo, porque devolve um número que autentica a conta.
  ipcMain.handle('authenticator:list', (event) => {
    assertAppFrame(event);
    return withSessionNotice(listTokens);
  });
  ipcMain.handle('authenticator:save-uri', (event, uri: string) => {
    assertAppFrame(event);
    if (typeof uri !== 'string') throw new Error(currentMessages().errors.invalidAuthTokenUri);
    return withSessionNotice(() => saveTokenFromUri(uri));
  });
  ipcMain.handle('authenticator:save', (event, token: AuthTokenDraft) => {
    assertAppFrame(event);
    return withSessionNotice(() => saveToken(token));
  });
  ipcMain.handle('authenticator:delete', (event, id: string) => {
    assertAppFrame(event);
    return withSessionNotice(() => removeToken(id));
  });
  ipcMain.handle('authenticator:codes', (event) => {
    assertAppFrame(event);
    return withSessionNotice(() => currentCodes());
  });

  /** Copia para o clipboard nativo e limpa sozinho 30 s depois (no main). */
  ipcMain.handle('clipboard:copy', (event, value: string) => {
    assertAppFrame(event);
    if (typeof value !== 'string') {
      throw new Error(currentMessages().errors.internal);
    }
    return secureClipboard.copy(value);
  });

  ipcMain.handle('generator:generate', (event, options: GeneratorOptions) => {
    assertAppFrame(event);
    assertGeneratorOptions(options);
    return generateHighEntropyPassword(options);
  });

  // ---- Backup integral do cofre ----
  // O destino sempre vem do diálogo nativo, nunca da página, e o que volta para
  // o renderer é só contagem e caminho: o pacote (`.gbk`) é cópia de bytes já
  // cifrados, montada e lida pelo main. Nada de senha ou segredo cruza este
  // contrato. Backup e restauração não exigem chave: a restauração precisa
  // funcionar na máquina recém-formatada, antes de existir cofre ou sessão.
  ipcMain.handle('backup:export', (event) => {
    assertAppFrame(event);
    const destination = pickSavePath({
      title: currentMessages().backup.exportAction,
      defaultPath: `guardinha-backup-${new Date().toISOString().slice(0, 10)}.gbk`,
      filters: [{ name: 'Backup Guardinha', extensions: ['gbk'] }],
    });
    if (destination === null) return { canceled: true };
    return exportBackup(destination, app.getVersion());
  });

  ipcMain.handle('backup:restore', (event) => {
    assertAppFrame(event);
    const source = pickOpenPath({
      title: currentMessages().backup.restoreAction,
      properties: ['openFile'],
      filters: [{ name: 'Backup Guardinha', extensions: ['gbk'] }],
    });
    if (source === null) return { canceled: true };
    const result = restoreBackup(source);
    // o cofre antigo (e a chave em memória) deixou de valer: a tela volta para
    // a autenticação pelo mesmo canal do auto-lock
    mainWindow?.webContents.send('vault:auto-locked', getStatus());
    return result;
  });

  ipcMain.handle('settings:get', (event) => {
    assertAppFrame(event);
    return loadSettings();
  });
  ipcMain.handle('settings:set', (event, settings: AppSettings) => {
    assertAppFrame(event);
    return saveSettings(settings);
  });
}

/** Sem barra de menus (sem File/Edit/View): o menu da aplicação é removido. */
function removeApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}

/**
 * Ouvinte do `ActivityMonitor` (Observer): o auto-lock zera a chave no main e
 * empurra o novo status para o renderer no mesmo instante (o renderer não
 * precisa esperar o polling de 15 s para voltar à tela de autenticação).
 */
function registerActivityObserver(): void {
  activityMonitor.subscribe(() => {
    const status = lock();
    mainWindow?.webContents.send('vault:auto-locked', status);
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // switch de linha de comando precisa estar antes do `whenReady`
  disableVideoDecode();
  quietChromiumLog();

  app
    .whenReady()
    .then(() => {
      registerAppProtocol();
      registerIpc();
      removeApplicationMenu();
      registerPermissionPolicy();
      registerActivityObserver();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error: unknown) => {
      console.error('Falha ao iniciar o aplicativo:', error);
    });

  // Encerramento de sessão: a chave sai da memória junto com o processo (o wipe
  // roda antes de qualquer I/O) e o clipboard é limpo na hora, porque o
  // temporizador de 30 s morre com o processo e deixaria a senha ali para
  // sempre. Sem `await`: `electron.clipboard` é síncrono, então a gravação
  // acontece dentro do checkpoint de microtarefas logo após este listener, e
  // segurar o encerramento com `preventDefault` custaria um ciclo de `quit`
  // que pode travar.
  app.on('before-quit', () => {
    try {
      lock();
    } catch (error) {
      console.error('Falha ao bloquear o cofre no encerramento:', error);
    }
    void secureClipboard.dispose();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
