import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { app, BrowserWindow, clipboard, ipcMain, session, shell } from '../mocks/electron.ts';
import { activityMonitor, IDLE_LOCK_MS } from '@zero/main/activity';
import { currentMessages } from '@zero/main/i18n';
import { isVaultLockedError } from '@zero/main/vault';
import { vaultSession } from '@zero/main/session';
import '@zero/main/index';

/** Janela e política da sessão: navegação presa na SPA, sem permissão web sobrando. */
async function waitForWindow(): Promise<BrowserWindow> {
  await vi.waitFor(() => {
    expect(BrowserWindow.instances.length).toBeGreaterThan(0);
  });
  const win = BrowserWindow.instances[0];
  if (win === undefined) throw new Error('Janela não criada.');
  return win;
}

describe('guardas de navegação e sessão', () => {
  it('cria a janela com DevTools habilitado fora de produção', async () => {
    const win = await waitForWindow();
    const webPreferences = win.options.webPreferences as Record<string, unknown>;
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.sandbox).toBe(true);
    // O mock isPackaged é falso (modo dev); no .deb embutido vira false.
    expect(webPreferences.devTools).toBe(true);
  });

  it('as demais bandeiras de webPreferences estão travadas no certo lado', async () => {
    // Cada flag é defesa do renderer: o teste fixa o valor literal, não deriva de outro.
    const win = await waitForWindow();
    const webPreferences = win.options.webPreferences as Record<string, unknown>;
    expect(webPreferences.nodeIntegration).toBe(false);
    expect(webPreferences.webSecurity).toBe(true);
    expect(webPreferences.sandbox).toBe(true);
    expect(webPreferences.contextIsolation).toBe(true);
    expect(typeof webPreferences.preload).toBe('string');
  });

  it('a janela nasce escondida e só aparece quando o Electron diz que está pronta', async () => {
    // `show: false` evita o flash branco; `ready-to-show` é o evento que libera a exibição.
    const win = await waitForWindow();
    expect(win.options.show).toBe(false);

    const ready = win.once.mock.calls.find(([event]) => event === 'ready-to-show')?.[1];
    expect(ready).toBeTypeOf('function');
    win.show.mockClear();
    ready?.();
    expect(win.show).toHaveBeenCalledOnce();
  });

  it('a janela tem o tamanho e o título que o app promete', async () => {
    const win = await waitForWindow();
    expect(win.options.width).toBe(1200);
    expect(win.options.height).toBe(800);
    // 400 px é a grade em uma coluna com a Sidebar em trilho; estreitar mais só corta texto.
    expect(win.options.minWidth).toBe(400);
    expect(win.options.minHeight).toBe(360);
    expect(win.options.title).toBe('Guardinha');
    expect(win.options.backgroundColor).toBe('#000000');
  });

  it('activate com janela aberta não cria uma segunda', async () => {
    // O `activate` chega com a janela viva; criar outra ali deixaria duas telas de autenticação.
    const win = await waitForWindow();
    const activate = app.on.mock.calls.find(([event]) => event === 'activate')?.[1];
    expect(activate).toBeTypeOf('function');
    const antes = BrowserWindow.instances.length;
    BrowserWindow.getAllWindows.mockReturnValue([win]);

    activate?.();

    expect(BrowserWindow.instances).toHaveLength(antes);
  });

  it('will-navigate recusa URL fora da página do app', async () => {
    const win = await waitForWindow();
    const navigation = win.webContents.on.mock.calls.find(([event]) => event === 'will-navigate');
    expect(navigation).toBeDefined();
    const listener = navigation?.[1];
    expect(listener).toBeTypeOf('function');

    const targetUrl = win.loadURL.mock.calls[0]?.[0] ?? '';
    expect(targetUrl).not.toBe('');

    const event = { preventDefault: vi.fn() };
    listener?.(event, 'https://exemplo.com/fora');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    listener?.(event, targetUrl);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('window.open nega janela e só repassa https para o navegador', async () => {
    const win = await waitForWindow();
    expect(win.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    expect(handler).toBeTypeOf('function');

    shell.openExternal.mockClear();
    expect(handler?.({ url: 'https://exemplo.com' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://exemplo.com');

    expect(handler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(handler?.({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('registra erro de falha ao abrir URL externa sem abrir janela', async () => {
    const win = await waitForWindow();
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shell.openExternal.mockRejectedValueOnce(new Error('navegador indisponível'));

    expect(handler?.({ url: 'https://exemplo.com' })).toEqual({ action: 'deny' });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledWith(
        'Falha ao abrir URL externa:',
        expect.objectContaining({ message: 'navegador indisponível' }),
      );
    });
  });

  it('permissões da sessão negam tudo (o clipboard vive no main)', () => {
    expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    const policy = session.defaultSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    expect(policy).toBeTypeOf('function');

    const grant = vi.fn<(granted: boolean) => void>();
    for (const permission of [
      'geolocation',
      'media',
      'clipboard-read',
      'clipboard-sanitized-write',
      'notifications',
    ]) {
      policy?.(null, permission, grant, null);
    }
    expect(grant).toHaveBeenCalledTimes(5);
    expect(grant.mock.calls.every(([value]) => !value)).toBe(true);
  });

  it('a checagem síncrona de permissão também nega, sem diálogo', () => {
    // Sem `setPermissionCheckHandler` o Electron devolve "granted" na consulta síncrona.
    expect(session.defaultSession.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    const check = session.defaultSession.setPermissionCheckHandler.mock.calls[0]?.[0];
    expect(check?.()).toBe(false);
    expect(session.defaultSession.setDevicePermissionHandler).toHaveBeenCalledTimes(1);
    const device = session.defaultSession.setDevicePermissionHandler.mock.calls[0]?.[0];
    expect(device?.()).toBe(false);
  });

  it('canal clipboard:copy copia pelo proxy do main', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'clipboard:copy',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    clipboard.writeText.mockClear();
    await handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, 'senha-copiada');
    expect(clipboard.writeText).toHaveBeenCalledWith('senha-copiada');
  });

  it('canal clipboard:copy recusa valor que não seja texto', () => {
    const handler = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'clipboard:copy',
    )?.[1];
    clipboard.writeText.mockClear();
    expect(() =>
      handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, { senha: 'x' }),
    ).toThrow();
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('encerramento do app bloqueia o cofre e cancela a limpeza do clipboard', () => {
    const handler = app.on.mock.calls.find(([event]) => event === 'before-quit')?.[1];
    expect(handler).toBeTypeOf('function');
    expect(() => handler?.()).not.toThrow();
  });

  it('registra falha ao bloquear o cofre durante o encerramento', () => {
    const handler = app.on.mock.calls.find(([event]) => event === 'before-quit')?.[1];
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(vaultSession(), 'wipe').mockImplementation(() => {
      throw new Error('falha ao zerar chave');
    });

    handler?.();

    expect(report).toHaveBeenCalledWith(
      'Falha ao bloquear o cofre no encerramento:',
      expect.objectContaining({ message: 'falha ao zerar chave' }),
    );
  });

  it('auto-lock empurra vault:auto-locked para o renderer', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();

    vi.useFakeTimers();
    try {
      // o ouvinte do ActivityMonitor foi registrado no whenReady (entrypoint)
      activityMonitor.touch();
      await vi.advanceTimersByTimeAsync(IDLE_LOCK_MS);
      expect(send).toHaveBeenCalledWith(
        'vault:auto-locked',
        expect.objectContaining({ locked: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('registra os canais de IPC do cofre', () => {
    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('vault:unlock');
    expect(channels).toContain('entries:list');
    expect(channels).toContain('shell:open-domain');
    expect(channels).toContain('clipboard:copy');
  });

  it('desliga a decodificação de vídeo, que o app não usa, ao subir', () => {
    // Evita o `libva error` do driver VA-API quebrado ao iniciar.
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-accelerated-video-decode');
  });

  it('cala o log nativo do Chromium ao subir', () => {
    // Evita o aviso `Add application/vnd.portal.filetransfer`, bug do Chromium.
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('log-level', '3');
  });
});

describe('sessão perdida durante uma operação do cofre', () => {
  /** A chave pode sumir entre o status e a chamada de dados; o renderer volta à autenticação. */
  function invoke(channel: string, ...args: unknown[]): unknown {
    const handler = ipcMain.handle.mock.calls.find(([name]) => name === channel)?.[1];
    expect(handler).toBeTypeOf('function');
    return handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, ...args);
  }

  it('recusa a operação e avisa o renderer pelo canal do auto-lock', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();
    vaultSession().wipe(); // a sessão foi zerada depois da tela montar

    expect(() => invoke('entries:list')).toThrow(currentMessages().errors.vaultLocked);

    // o aviso é o que tira o renderer da tela quebrada
    expect(send).toHaveBeenCalledWith(
      'vault:auto-locked',
      expect.objectContaining({ locked: true }),
    );
  });

  it('não devolve lista vazia quando a sessão se foi (fail-open seria pior)', () => {
    vaultSession().wipe();

    // Devolver [] faria o app parecer um cofre vazio; a resposta tem que ser erro.
    expect(() => invoke('entries:list')).toThrow();
  });

  it('avisa também em entries:save e entries:delete', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();
    vaultSession().wipe();

    expect(() =>
      invoke('entries:save', {
        title: 'x',
        username: '',
        password: '',
        domain: '',
        notes: '',
      }),
    ).toThrow();
    expect(() => invoke('entries:delete', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toThrow();

    expect(send.mock.calls.filter(([channel]) => channel === 'vault:auto-locked')).toHaveLength(2);
  });

  it('não avisa quando o erro é outro (adulteração, id inválido)', () => {
    const m = currentMessages();
    // Só a mensagem do Singleton dispara o aviso; falha de domínio comum não tira a tela.
    expect(isVaultLockedError(new Error(m.errors.vaultLocked))).toBe(true);
    expect(isVaultLockedError(new Error(m.errors.invalidId))).toBe(false);
    expect(isVaultLockedError(new Error(m.errors.vaultTampered))).toBe(false);
    expect(isVaultLockedError(new Error(m.errors.entryNotFound))).toBe(false);
    expect(isVaultLockedError('texto solto')).toBe(false);
    expect(isVaultLockedError(null)).toBe(false);
  });

  it('limpa a referência da janela fechada, recria no activate e encerra ao fechar tudo', async () => {
    const win = await waitForWindow();
    const closed = win.on.mock.calls.find(([event]) => event === 'closed')?.[1];
    const secondInstance = app.on.mock.calls.find(([event]) => event === 'second-instance')?.[1];
    const activate = app.on.mock.calls.find(([event]) => event === 'activate')?.[1];
    const allClosed = app.on.mock.calls.find(([event]) => event === 'window-all-closed')?.[1];

    expect(closed).toBeTypeOf('function');
    expect(activate).toBeTypeOf('function');
    expect(allClosed).toBeTypeOf('function');
    closed?.();

    const focus = vi.spyOn(win, 'focus').mockClear();
    secondInstance?.();
    expect(focus).not.toHaveBeenCalled();

    const existingWindows = BrowserWindow.instances.length;
    BrowserWindow.getAllWindows.mockReturnValue([]);
    activate?.();
    expect(BrowserWindow.instances).toHaveLength(existingWindows + 1);

    app.quit.mockClear();
    allClosed?.();
    expect(app.quit).toHaveBeenCalledOnce();
  });
});

/** Depois que a janela fecha, `mainWindow` é `null`: todo acesso precisa de `?.`. */
describe('com a janela já fechada', () => {
  async function fecharJanela(): Promise<BrowserWindow> {
    const win = await waitForWindow();
    const closed = win.on.mock.calls.find(([event]) => event === 'closed')?.[1];
    closed?.();
    return win;
  }

  it('o ready-to-show que chega depois do fechamento não estoura', async () => {
    const win = await fecharJanela();
    const ready = win.once.mock.calls.find(([event]) => event === 'ready-to-show')?.[1];

    expect(() => ready?.()).not.toThrow();
  });

  it('o aviso de sessão perdida sai sem janela, sem trocar o erro do canal', async () => {
    const win = await fecharJanela();
    win.webContents.send.mockClear();
    vaultSession().wipe();
    const handler = ipcMain.handle.mock.calls.find(([name]) => name === 'entries:list')?.[1];

    // o aviso é o melhor esforço: quem interessa é o erro original subir
    expect(() => handler?.({ senderFrame: { url: 'guardinha://app/index.html' } })).toThrow(
      currentMessages().errors.vaultLocked,
    );
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('o auto-lock sem janela não derruba o temporizador', async () => {
    await fecharJanela();

    vi.useFakeTimers();
    try {
      activityMonitor.touch();
      await expect(vi.advanceTimersByTimeAsync(IDLE_LOCK_MS)).resolves.not.toThrow();
    } finally {
      vi.useRealTimers();
    }
    expect(vaultSession().isUnlocked()).toBe(false);
  });

  it('a janela nasce sem a chave icon quando o build não deixou o arquivo', () => {
    // Sem o ternário, a janela receberia `icon: undefined` e o Electron falharia ao abrir.
    const existe = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const activate = app.on.mock.calls.find(([event]) => event === 'activate')?.[1];
    BrowserWindow.getAllWindows.mockReturnValue([]);
    try {
      activate?.();
      const criada = BrowserWindow.instances.at(-1);
      if (criada === undefined) throw new Error('activate não criou janela');
      expect('icon' in criada.options).toBe(false);
    } finally {
      existe.mockRestore();
    }
  });
});
