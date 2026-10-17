// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ElectronMockModule from '../mocks/electron.ts';
import type { ElectronApi } from '@zero/types';

/**
 * O preload é a **única** ponte entre a interface e o processo main. Este teste
 * importa o módulo de verdade (ele se registra sozinho no `contextBridge`) e
 * confere, canal por canal, que cada método da fachada vira o `invoke` certo
 * com o payload certo. Um método trocado de canal aqui só apareceria em uso,
 * como um botão que não faz nada.
 *
 * `resetModules` recria o stub do `electron` junto, então o módulo do teste
 * precisa importar os dois na mesma volta: se o teste segurasse uma instância
 * do mock e o preload pegasse outra, todo assert leria `undefined`.
 */

type ElectronMock = typeof ElectronMockModule;
type VaultMethod = keyof ElectronApi['vault'];

interface Loaded {
  api: ElectronApi;
  electron: ElectronMock;
  /** Último `invoke` registrado, como `[canal, ...payload]`. */
  last: () => [string, ...unknown[]];
}

async function loadPreload(): Promise<Loaded> {
  vi.resetModules();
  const electron: ElectronMock = await import('../mocks/electron.ts');
  await import('@zero/preload/index');
  const exposed = electron.contextBridge.exposeInMainWorld.mock.calls.find(
    ([key]) => key === 'api',
  );
  return {
    api: (exposed?.[1] ?? {}) as ElectronApi,
    electron,
    last: () => (electron.ipcRenderer.invoke.mock.calls.at(-1) ?? []) as [string, ...unknown[]],
  };
}

/** Chamar um método de `vault` sem o TypeScript brigar com a assinatura variavel. */
function callVault(api: ElectronApi, method: VaultMethod, ...args: unknown[]): Promise<unknown> {
  return (api.vault[method] as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
}

describe('preload: montagem da ponte window.api', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('registra a ponte uma única vez, sob a chave "api"', () => {
    expect(loaded.electron.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(loaded.electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'api',
      expect.anything(),
    );
  });

  it('expõe exatamente os grupos do contrato, sem sobrar nem faltar', () => {
    expect(Object.keys(loaded.api).sort()).toEqual([
      'authenticator',
      'backup',
      'clipboard',
      'entries',
      'generator',
      'openDomain',
      'settings',
      'vault',
    ]);
    expect(Object.keys(loaded.api.vault).sort()).toEqual([
      'clearPanicPin',
      'create',
      'destroy',
      'lock',
      'onAutoLocked',
      'panicStatus',
      'resetPin',
      'setNukeLimit',
      'setPanicPin',
      'status',
      'unlock',
    ]);
  });
});

describe('preload: canais do cofre', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it.each([
    ['status', 'vault:status'],
    ['lock', 'vault:lock'],
    ['destroy', 'vault:destroy'],
    ['clearPanicPin', 'vault:clear-panic-pin'],
    ['panicStatus', 'vault:panic-status'],
  ] as const)('%s vai para %s', async (method, channel) => {
    await callVault(loaded.api, method);
    expect(loaded.last()[0]).toBe(channel);
  });

  it.each([
    ['create', 'vault:create'],
    ['unlock', 'vault:unlock'],
    ['resetPin', 'vault:resetPin'],
    ['setPanicPin', 'vault:set-panic-pin'],
    ['setNukeLimit', 'vault:set-nuke-limit'],
  ] as const)('%s leva o payload para %s', async (method, channel) => {
    const payload = { sentinela: method };
    await callVault(loaded.api, method, payload);
    const [sentChannel, sent] = loaded.last();
    expect(sentChannel).toBe(channel);
    // o payload viaja por referência, sem embrulho nem transformação
    expect(sent).toBe(payload);
  });

  it('repassa o valor ao clipboard sem transformar', async () => {
    await loaded.api.clipboard.copy('senha-com-caractere-especial');
    expect(loaded.last()).toEqual(['clipboard:copy', 'senha-com-caractere-especial']);
  });
});

describe('preload: canais de credenciais e gerador', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('mapeia list, save e remove das credenciais', async () => {
    await loaded.api.entries.list();
    expect(loaded.last()[0]).toBe('entries:list');

    const entry = { title: 'Banco', username: 'u', password: 'p', domain: 'b.com', notes: '' };
    await loaded.api.entries.save(entry);
    expect(loaded.last()).toEqual(['entries:save', entry]);

    await loaded.api.entries.remove('id-1');
    expect(loaded.last()).toEqual(['entries:delete', 'id-1']);
  });

  it('repassa as opções do gerador de senha', async () => {
    const options = {
      length: 24,
      useLower: true,
      countLower: 0,
      useUpper: true,
      countUpper: 0,
      useNumbers: true,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: ['a'],
      includeCustomEntropyWords: false,
    };
    await loaded.api.generator.generate(options);
    expect(loaded.last()).toEqual(['generator:generate', options]);
  });

  it('abre o domínio no navegador do sistema', async () => {
    await loaded.api.openDomain('exemplo.com');
    expect(loaded.last()).toEqual(['shell:open-domain', 'exemplo.com']);
  });
});

describe('preload: canais de 2FA', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('mapeia os cinco canais do autenticador', async () => {
    const uri = 'otpauth://totp/GitHub:eu?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub';
    const draft = {
      issuer: 'GitHub',
      account: 'eu',
      algorithm: 'SHA1' as const,
      digits: 6,
      period: 30,
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    };

    await loaded.api.authenticator.list();
    expect(loaded.last()[0]).toBe('authenticator:list');

    await loaded.api.authenticator.saveUri(uri);
    expect(loaded.last()).toEqual(['authenticator:save-uri', uri]);

    await loaded.api.authenticator.save(draft);
    expect(loaded.last()).toEqual(['authenticator:save', draft]);

    await loaded.api.authenticator.remove('id-2fa');
    expect(loaded.last()).toEqual(['authenticator:delete', 'id-2fa']);

    await loaded.api.authenticator.codes();
    expect(loaded.last()[0]).toBe('authenticator:codes');
  });
});

describe('preload: canais de backup', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('mapeia o backup e a restauração do cofre', async () => {
    await loaded.api.backup.export();
    expect(loaded.last()).toEqual(['backup:export']);

    await loaded.api.backup.restore();
    expect(loaded.last()).toEqual(['backup:restore']);
  });
});

describe('preload: ouvinte do auto-lock', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('assina o evento e devolve a função que cancela', () => {
    const unsubscribe = loaded.api.vault.onAutoLocked(() => undefined);

    expect(loaded.electron.ipcRenderer.on).toHaveBeenCalledTimes(1);
    expect(loaded.electron.ipcRenderer.on.mock.calls[0]?.[0]).toBe('vault:auto-locked');

    unsubscribe();
    expect(loaded.electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
    expect(loaded.electron.ipcRenderer.removeListener.mock.calls[0]?.[0]).toBe('vault:auto-locked');
  });

  it('encaminha ao ouvinte do renderer o status que o main empurra', () => {
    const seen: unknown[] = [];
    loaded.api.vault.onAutoLocked((status) => seen.push(status));

    // o handler registrado é o do preload: descarta o evento e entrega só o payload
    const handler = loaded.electron.ipcRenderer.on.mock.calls[0]?.[1];
    const status = {
      exists: true,
      locked: true,
      attempts: 1,
      lockUntil: null,
      lockRemainingMs: 0,
    };
    handler?.({ sender: 'ipc' }, status);

    expect(seen).toEqual([status]);
  });

  it('cancelar duas vezes não deixa listener pendurado nem lança', () => {
    const unsubscribe = loaded.api.vault.onAutoLocked(() => undefined);
    unsubscribe();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
    expect(loaded.electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(2);
  });
});

describe('preload: configurações', () => {
  let loaded: Loaded;
  beforeEach(async () => {
    loaded = await loadPreload();
  });

  it('lê e grava as configurações', async () => {
    await loaded.api.settings.get();
    expect(loaded.last()[0]).toBe('settings:get');

    await loaded.api.settings.set({ language: 'en' });
    expect(loaded.last()).toEqual(['settings:set', { language: 'en' }]);
  });
});
