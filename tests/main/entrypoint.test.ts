// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  shell,
  resetElectronMock,
} from '../mocks/electron.ts';
import type { IpcHandler } from '../mocks/electron.ts';
import { currentMessages } from '@zero/main/i18n';
import { vaultSession } from '@zero/main/session';
import '@zero/main/index';

/**
 * Cópias do que o mock registrou no boot. `resetElectronMock` limpa os históricos
 * a cada teste, e os canais são registrados uma vez só, quando o entrypoint é
 * avaliado, então o mapa precisa ser tirado antes do primeiro reset.
 */
const REGISTERED_SCHEMES = protocol.registerSchemesAsPrivileged.mock.calls.map((call) => call[0]);
const REGISTERED_PROTOCOLS = protocol.handle.mock.calls.map((call) => [
  call[0],
  call[1] as unknown,
]) as [string, (request: { url: string }) => Response][];
const SECOND_INSTANCE = app.on.mock.calls.find(([event]) => event === 'second-instance')?.[1];
/** Ouvinte de `window-all-closed`, registrado no boot. */
const WINDOW_ALL_CLOSED = app.on.mock.calls.find(([event]) => event === 'window-all-closed')?.[1];
const MENU_ARGUMENT = Menu.setApplicationMenu.mock.calls[0]?.[0];
/** Janela criada no boot, antes do primeiro reset. */
const BOOT_WINDOW = BrowserWindow.instances[0];

/**
 * Raiz que o protocolo serve: `__dirname` do entrypoint é `src/main`, então o
 * renderer fica em `src/renderer` durante o teste.
 */
const RENDERER_ROOT = path.resolve(import.meta.dirname, '../../src/renderer');

/**
 * O entrypoint do main é a fronteira de segurança do app: registra os canais de
 * IPC (cada um atrás de `assertAppFrame`), serve a SPA pelo scheme
 * `guardinha://` e decide o MIME do que é servido. Aqui os testes atacam
 * exatamente as pontas que podem dar trabalho a alguém de fora: URL de
 * protocolo, path traversal, frame forasteiro e payload fora do contrato.
 */

type Handlers = Map<string, IpcHandler>;

/**
 * Registro de handlers tirado do mock **na hora do import**, antes de qualquer
 * `resetElectronMock`: os canais são registrados uma vez, quando o entrypoint
 * é avaliado, e o reset limpa justamente esse histórico.
 */
const HANDLERS: Handlers = new Map(ipcMain.handle.mock.calls);

/** Evento de IPC com frame apontando para a página oficial do app. */
function appFrame(): unknown {
  return { senderFrame: { url: 'guardinha://app/index.html' } };
}

/** Evento de IPC vindo de um frame que não é a página do app. */
function foreignFrame(): unknown {
  return { senderFrame: { url: 'https://exemplo-malicioso.test/pagina' } };
}

function call(channel: string, event: unknown, ...args: unknown[]): unknown {
  const handler = HANDLERS.get(channel);
  if (handler === undefined) throw new Error(`canal ${channel} não registrado`);
  return handler(event, ...args);
}

beforeEach(() => {
  resetElectronMock();
});

describe('guarda de origem dos canais', () => {
  it.each([
    'vault:status',
    'vault:create',
    'vault:unlock',
    'vault:resetPin',
    'vault:lock',
    'vault:destroy',
    'vault:set-panic-pin',
    'vault:clear-panic-pin',
    'vault:set-nuke-limit',
    'vault:panic-status',
    'shell:open-domain',
    'clipboard:copy',
    'entries:list',
    'entries:save',
    'entries:delete',
    'authenticator:save-uri',
    'authenticator:save',
    'authenticator:delete',
    'generator:generate',
    'backup:export',
    'backup:restore',
    'settings:get',
    'settings:set',
  ])('%s recusa frame fora da página do app', (channel) => {
    expect(() => call(channel, foreignFrame())).toThrow(/IPC bloqueado/);
  });

  it.each(['authenticator:list', 'authenticator:codes'])(
    '%s recusa frame fora da página do app',
    (channel) => {
      expect(() => call(channel, foreignFrame())).toThrow(/IPC bloqueado/);
    },
  );

  it('recusa evento sem senderFrame, que um frame injetado poderia omitir', () => {
    expect(() => call('vault:status', {})).toThrow(/IPC bloqueado/);
    expect(() => call('vault:status', { senderFrame: null })).toThrow(/IPC bloqueado/);
    expect(() => call('vault:status', { senderFrame: { url: 42 } })).toThrow(/IPC bloqueado/);
  });

  it('recusa URL de frame que não parseia', () => {
    expect(() => call('vault:status', { senderFrame: { url: 'não é url' } })).toThrow(
      /IPC bloqueado/,
    );
  });
});

describe('canal shell:open-domain', () => {
  it('abre domínio válido no navegador do sistema', () => {
    call('shell:open-domain', appFrame(), 'exemplo.com');
    expect(shell.openExternal).toHaveBeenCalledWith('https://exemplo.com');
  });

  it('respeita o esquema http que já veio na credencial', () => {
    call('shell:open-domain', appFrame(), 'http://exemplo.com/pagina');
    expect(shell.openExternal).toHaveBeenCalledWith('http://exemplo.com/pagina');
  });

  it('recusa domínio vazio ou malformado sem abrir nada', () => {
    const m = currentMessages();
    expect(() => call('shell:open-domain', appFrame(), '')).toThrow(m.errors.invalidDomain);
    expect(() => call('shell:open-domain', appFrame(), 'não é domínio')).toThrow(
      m.errors.invalidDomain,
    );
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('canal clipboard:copy', () => {
  it('recusa payload que não seja texto', () => {
    // o renderer nunca deve poder injetar objeto no clipboard nativo
    expect(() => call('clipboard:copy', appFrame(), { texto: 'x' })).toThrow(
      currentMessages().errors.internal,
    );
  });
});

describe('canais de gravação do autenticador', () => {
  it('recusa URI que não seja texto antes de acessar o cofre', () => {
    expect(() => call('authenticator:save-uri', appFrame(), null)).toThrow(
      currentMessages().errors.invalidAuthTokenUri,
    );
  });

  it('preserva erros de sessão bloqueada ao salvar URI, token ou excluir token', () => {
    const locked = currentMessages().errors.vaultLocked;
    const uri = 'otpauth://totp/GitHub:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub';
    expect(() => call('authenticator:save-uri', appFrame(), uri)).toThrow(locked);
    expect(() => call('authenticator:save', appFrame(), {})).toThrow(locked);
    expect(() =>
      call('authenticator:delete', appFrame(), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    ).toThrow(locked);
  });

  it('preserva erro de sessão bloqueada ao pedir códigos 2FA', () => {
    expect(() => call('authenticator:codes', appFrame())).toThrow(
      currentMessages().errors.vaultLocked,
    );
  });
});

describe('canal generator:generate', () => {
  const base = {
    length: 24,
    useLower: true,
    countLower: 0,
    useUpper: true,
    countUpper: 0,
    useNumbers: true,
    countNumbers: 0,
    useSymbols: true,
    countSymbols: 0,
    customEntropyWords: ['a'],
    includeCustomEntropyWords: false,
  };

  it('gera senha com parâmetros válidos', () => {
    const senha = call('generator:generate', appFrame(), base);
    expect(typeof senha).toBe('string');
  });

  it('recusa comprimento fora de 0 a 72, inteiro ou não', () => {
    const m = currentMessages();
    for (const length of [-1, 73, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => call('generator:generate', appFrame(), { ...base, length })).toThrow(
        m.errors.invalidGenerator,
      );
    }
  });

  it('aceita os extremos 0 e 72', () => {
    expect(call('generator:generate', appFrame(), { ...base, length: 0 })).toBe('');
    expect(typeof call('generator:generate', appFrame(), { ...base, length: 72 })).toBe('string');
  });

  it('recusa quando a lista de entropia não é lista', () => {
    expect(() =>
      call('generator:generate', appFrame(), { ...base, customEntropyWords: 'palavra' }),
    ).toThrow(currentMessages().errors.invalidGenerator);
  });

  it('recusa quantidades manuais acima do orçamento e de classes desligadas', () => {
    const m = currentMessages();
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        countLower: 5,
        countUpper: 5,
        countNumbers: 5,
        countSymbols: 5,
      }),
    ).toThrow(m.errors.invalidGenerator);
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        useLower: false,
        countLower: 1,
      }),
    ).toThrow(m.errors.invalidGenerator);
  });

  it('recusa inclusão literal sem todas as palavras ou acima do comprimento', () => {
    const m = currentMessages();
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        customEntropyWords: [''],
        includeCustomEntropyWords: true,
      }),
    ).toThrow(m.errors.invalidGenerator);
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        length: 2,
        customEntropyWords: ['palavra'],
        includeCustomEntropyWords: true,
      }),
    ).toThrow(m.errors.invalidGenerator);
  });

  it('contabiliza palavras literais no limite manual de 40%', () => {
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        length: 40,
        countLower: 2,
        countUpper: 3,
        countNumbers: 5,
        countSymbols: 6,
        customEntropyWords: ['a'],
        includeCustomEntropyWords: true,
      }),
    ).toThrow(currentMessages().errors.invalidGenerator);
  });

  it('aceita as quantidades de classe do exemplo no limite de 40%', () => {
    const senha = call('generator:generate', appFrame(), {
      ...base,
      length: 40,
      countLower: 2,
      countUpper: 3,
      countNumbers: 5,
      countSymbols: 6,
    });

    expect(senha).toHaveLength(40);
  });

  it('contabiliza as palavras literais junto com as quantidades no orçamento', () => {
    const senha = call('generator:generate', appFrame(), {
      ...base,
      length: 20,
      countLower: 1,
      countUpper: 1,
      countNumbers: 1,
      countSymbols: 1,
      customEntropyWords: ['aB7!'],
      includeCustomEntropyWords: true,
    });

    expect(senha).toHaveLength(20);
    expect(String(senha).endsWith('aB7!')).toBe(true);
  });

  it('gera só com a categoria que sobrou marcada', () => {
    const m = currentMessages();
    const senha = call('generator:generate', appFrame(), {
      ...base,
      useLower: false,
      useNumbers: false,
      useSymbols: false,
      length: 40,
    });
    expect(senha).toMatch(/^[A-Z]+$/);
    expect(senha).toHaveLength(40);

    // sem nenhuma categoria não há o que sortear, e devolver vazio seria
    // fingir que gerou uma senha
    expect(() =>
      call('generator:generate', appFrame(), {
        ...base,
        useLower: false,
        useUpper: false,
        useNumbers: false,
        useSymbols: false,
      }),
    ).toThrow(m.errors.invalidGenerator);
  });
});

describe('protocolo guardinha://', () => {
  /** Handler registrado para o scheme do app, capturado no import. */
  function protocolHandler(): (request: { url: string }) => Response {
    const found = REGISTERED_PROTOCOLS.find(([scheme]) => scheme === 'guardinha')?.[1];
    if (typeof found !== 'function') throw new Error('protocolo não registrado');
    return found;
  }

  it('registra o scheme como privilegiado e seguro', () => {
    const schemes = REGISTERED_SCHEMES[0] as {
      scheme: string;
      privileges: Record<string, boolean>;
    }[];
    expect(schemes[0]?.scheme).toBe('guardinha');
    expect(schemes[0]?.privileges).toMatchObject({
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    });
  });

  it('serve o index.html quando o caminho é a raiz', () => {
    const response = protocolHandler()({ url: 'guardinha://app/' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('normaliza o travessão escrito de forma direta, sem escapar da raiz', () => {
    // o `new URL` resolve `..` antes de a gente ver, então esta forma nem
    // chega a ameaçar a raiz: o 404 é a resposta correta
    const response = protocolHandler()({ url: 'guardinha://app/../../../etc/passwd' });
    expect(response.status).toBe(404);
  });

  it('rejeita path traversal codificado com 403', () => {
    // aqui é o ataque de verdade: `%2e%2e%2f` sobrevive à normalização da URL
    // e só vira `../` no `decodeURIComponent`, dentro do processo main
    const response = protocolHandler()({
      url: 'guardinha://app/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    });
    expect(response.status).toBe(403);
  });

  it('responde 404 para arquivo ausente e para diretório', () => {
    expect(protocolHandler()({ url: 'guardinha://app/nao-existe.js' }).status).toBe(404);
    expect(protocolHandler()({ url: 'guardinha://app/assets' }).status).toBe(404);
  });

  it('responde 500 para URL de protocolo que não parseia', () => {
    const response = protocolHandler()({ url: 'não é url de protocolo' });
    expect(response.status).toBe(500);
  });

  it('serve scripts e folhas com o MIME que o navegador entende', () => {
    const root = RENDERER_ROOT;
    fs.mkdirSync(root, { recursive: true });
    const sample = path.join(root, 'teste-cobertura-assets');
    fs.mkdirSync(sample, { recursive: true });
    for (const [name, mime] of [
      ['a.js', 'text/javascript'],
      ['a.mjs', 'text/javascript'],
      ['a.css', 'text/css'],
      ['a.json', 'application/json'],
      ['a.map', 'application/json'],
      ['a.svg', 'image/svg+xml'],
      ['a.png', 'image/png'],
      ['a.jpg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg'],
      ['a.gif', 'image/gif'],
      ['a.webp', 'image/webp'],
      ['a.ico', 'image/x-icon'],
      ['a.woff', 'font/woff'],
      ['a.woff2', 'font/woff2'],
      ['a.desconhecido', 'application/octet-stream'],
    ] as const) {
      const file = path.join(sample, name);
      fs.writeFileSync(file, 'x');
      const response = protocolHandler()({
        url: `guardinha://app/${path.basename(sample)}/${name}`,
      });
      expect(response.headers.get('content-type'), name).toContain(mime);
      fs.rmSync(file, { force: true });
    }
    fs.rmSync(sample, { recursive: true, force: true });
  });
});

/** Ouvinte de `second-instance`, registrado pelo entrypoint no boot. */
function secondInstance(): () => void {
  if (typeof SECOND_INSTANCE !== 'function') throw new Error('second-instance não registrado');
  return SECOND_INSTANCE;
}

/** Remove a barra de menus: registrada no boot, então o assert é sobre o histórico. */

describe('instância única do app', () => {
  it('traz a janela para frente quando o app é aberto de novo', () => {
    expect(() => {
      secondInstance()();
    }).not.toThrow();
  });

  it('restaura a janela quando ela está minimizada', () => {
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    BOOT_WINDOW.isMinimized.mockReturnValue(true);

    secondInstance()();

    expect(BOOT_WINDOW.restore).toHaveBeenCalled();
    expect(BOOT_WINDOW.focus).toHaveBeenCalled();
  });

  it('não tenta restaurar uma janela que não está minimizada', () => {
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    BOOT_WINDOW.restore.mockClear();
    BOOT_WINDOW.focus.mockClear();
    BOOT_WINDOW.isMinimized.mockReturnValue(false);

    secondInstance()();

    expect(BOOT_WINDOW.restore).not.toHaveBeenCalled();
    expect(BOOT_WINDOW.focus).toHaveBeenCalled();
  });
});

describe('remoção da barra de menus', () => {
  it('tira o menu padrão da aplicação (sem File/Edit/View)', () => {
    // `null` é o que remove a barra: sem File/Edit/View para o usuário clicar
    expect(MENU_ARGUMENT).toBeNull();
  });
});

/** Ouvinte de `window-all-closed`, registrado pelo entrypoint no boot. */
function windowAllClosed(): () => void {
  if (typeof WINDOW_ALL_CLOSED !== 'function') throw new Error('window-all-closed não registrado');
  return WINDOW_ALL_CLOSED;
}

describe('encerramento ao fechar todas as janelas', () => {
  it('encerra o aplicativo fora do macOS', () => {
    app.quit.mockClear();

    windowAllClosed()();

    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('não encerra no macOS, onde o app continua vivo sem janela', () => {
    // No macOS fechar a última janela não fecha o app: encerrar ali mataria o
    // processo inteiro (e o menu, a bandeja) por causa de uma janela.
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    app.quit.mockClear();
    try {
      windowAllClosed()();
    } finally {
      if (original !== undefined) Object.defineProperty(process, 'platform', original);
    }

    expect(app.quit).not.toHaveBeenCalled();
  });
});

describe('cofre inexistente', () => {
  it('o status responde sem quebrar quando o cofre ainda não foi criado', () => {
    // o primeiro `vault:status` do App vem antes de qualquer criação; a tela
    // de criação depende de ele responder em vez de lançar
    const status = call('vault:status', appFrame()) as { exists: boolean };
    expect(typeof status.exists).toBe('boolean');
  });
});

describe('aviso de sessão perdida', () => {
  it('empurra vault:auto-locked quando o cofre trava no meio de uma operação', () => {
    // Os canais que exigem a chave (`entries:list`) estouram com "cofre
    // travado" se o auto-lock disparar entre a tela pedir os dados e o main
    // responder. O renderer precisa saber pelo mesmo canal do auto-lock, senão
    // fica chamando um cofre que não existe mais e a tela trava sem dizer nada.
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    vaultSession().wipe();

    expect(() => call('entries:list', appFrame())).toThrow();

    expect(BOOT_WINDOW.webContents.send).toHaveBeenCalledWith(
      'vault:auto-locked',
      expect.objectContaining({ locked: true }),
    );
  });

  it('operação sem chave não empurra o aviso de sessão', () => {
    // `settings:get` não passa por `withSessionNotice`: um erro dele não tem
    // nada a ver com o cofre ter travado, e mandar o aviso ali faria a tela
    // pular para a autenticação sem necessidade.
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    vaultSession().wipe();
    BOOT_WINDOW.webContents.send.mockClear();

    call('settings:get', appFrame());

    expect(BOOT_WINDOW.webContents.send).not.toHaveBeenCalled();
  });

  it('erro de domínio também não empurra o aviso de sessão', () => {
    // `entries:save` passa por `withSessionNotice`, mas o erro é de credencial
    // inválida, não de sessão perdida. Sem o filtro do `isVaultLockedError`, a
    // tela saltaria para a autenticação por causa de um título em branco.
    if (BOOT_WINDOW === undefined) throw new Error('nenhuma janela criada no boot');
    vaultSession().adopt(Buffer.alloc(32, 1));
    BOOT_WINDOW.webContents.send.mockClear();

    try {
      expect(() =>
        call('entries:save', appFrame(), {
          title: '   ',
          username: '',
          password: '',
          domain: '',
          notes: '',
        }),
      ).toThrow(currentMessages().errors.invalidTitle);
      expect(BOOT_WINDOW.webContents.send).not.toHaveBeenCalled();
    } finally {
      vaultSession().wipe();
    }
  });
});
