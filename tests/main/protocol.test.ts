// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { protocol } from '../mocks/electron.ts';
import type { MockInstance } from 'vitest';
import {
  APP_ORIGIN,
  appPageUrl,
  assertAppFrame,
  registerAppProtocol,
  resolvePreloadScript,
  resolveWindowIcon,
} from '@zero/main/protocol';

/** O scheme é a fronteira de segurança em produção: serve assets e filtra frames do IPC. */

type Handler = (request: unknown) => Response;

function assetHandler(): Handler {
  const handler = protocol.handle.mock.calls.find(([scheme]) => scheme === 'guardinha')?.[1];
  if (handler === undefined) throw new Error('scheme guardinha:// não registrado');
  return handler;
}

function pedir(caminho: string): Response {
  return assetHandler()(new Request(`guardinha://app${caminho}`));
}

describe('o scheme e a página do app', () => {
  afterEach(() => {
    delete process.env.ELECTRON_RENDERER_URL;
  });

  // O scheme é conferido em `entrypoint.test.ts`; aqui importa a página, base das duas guardas.

  it('sem dev server, a página do app é a própria origem', () => {
    delete process.env.ELECTRON_RENDERER_URL;
    expect(appPageUrl()).toBe(`${APP_ORIGIN}/index.html`);
  });

  it('dev server vazio não vale como URL: cai na origem do app', () => {
    // Variável presente e vazia: sem o teste de `!== ''`, o app carregaria a URL vazia.
    process.env.ELECTRON_RENDERER_URL = '';
    expect(appPageUrl()).toBe(`${APP_ORIGIN}/index.html`);
  });

  it('com dev server, a página do app é a dele', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
    expect(appPageUrl()).toBe('http://localhost:5173');
  });
});

describe('a guarda de origem do IPC', () => {
  const frame = (url?: string): unknown => ({ senderFrame: url === undefined ? null : { url } });

  afterEach(() => {
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('aceita o frame da página do app', () => {
    delete process.env.ELECTRON_RENDERER_URL;
    expect(() => assertAppFrame(frame(`${APP_ORIGIN}/index.html`))).not.toThrow();
  });

  it('recusa frame de fora, mesmo com o mesmo caminho', () => {
    expect(() => assertAppFrame(frame('https://exemplo.com/index.html'))).toThrow();
  });

  it('recusa quando o protocolo é o do app mas o host não é', () => {
    // A checagem é de esquema **e** host: com `||`, qualquer página sob `guardinha://` passaria.
    expect(() => assertAppFrame(frame('guardinha://atacante/index.html'))).toThrow();
  });

  it('recusa porta diferente, mesmo com esquema e host iguais', () => {
    expect(() => assertAppFrame(frame('https://app.local:8443/index.html'))).toThrow();
  });

  it('recusa evento sem frame e frame sem url', () => {
    expect(() => assertAppFrame(frame())).toThrow();
    expect(() => assertAppFrame(undefined)).toThrow();
    expect(() => assertAppFrame(null)).toThrow();
    expect(() => assertAppFrame({ senderFrame: { url: 42 } })).toThrow();
  });

  it('recusa o evento de fora com o erro do app, não com um TypeError', () => {
    // a guarda de forma roda antes de ler `senderFrame`: sem ela, o erro sai cru
    const m = currentMessages();
    for (const event of [undefined, null, 'evento', 42, []]) {
      expect(() => assertAppFrame(event)).toThrow(m.errors.foreignFrame);
    }
  });

  it('recusa frame que não é registro, mesmo com URL do app', () => {
    // `senderFrame` vem de fora; sem a checagem de registro, um array passaria
    const event = Object.assign([], { senderFrame: { url: `${APP_ORIGIN}/index.html` } });
    expect(() => assertAppFrame(event)).toThrow(currentMessages().errors.foreignFrame);
  });
});

describe('o servidor de assets', () => {
  const raiz = path.resolve(__dirname, '../../out/renderer');
  let existeSync: MockInstance<typeof fs.existsSync>;
  let statSync: MockInstance<typeof fs.statSync>;
  let readFileSync: MockInstance<typeof fs.readFileSync>;

  beforeEach(() => {
    protocol.handle.mockClear();
    existeSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const arquivo = { isDirectory: (): boolean => false };
    statSync = vi.spyOn(fs, 'statSync').mockReturnValue(arquivo as unknown as fs.Stats);
    readFileSync = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation((file) => Buffer.from(`conteudo:${String(file)}`));
    registerAppProtocol();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serve o index quando o pedido é a raiz', () => {
    const resposta = pedir('');
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(String(readFileSync.mock.calls[0]?.[0])).toContain('index.html');
    // o diretório montado é o bundle do renderer, não a raiz do repositório
    expect(raiz).toContain('out/renderer');
  });

  it('escolhe o tipo pelo caminho, e não pelo que der', () => {
    expect(pedir('/assets/app.js').headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(pedir('/assets/app.css').headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(pedir('/assets/f.svg').headers.get('Content-Type')).toBe('image/svg+xml');
    expect(pedir('/assets/f.woff2').headers.get('Content-Type')).toBe('font/woff2');
    expect(pedir('/assets/f.bin').headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('recusa caminho que saia da raiz do renderer', async () => {
    // O vetor é o `..%2f`: sobrevive à normalização da URL e só vira barra no `decodeURIComponent`.
    for (const ataque of [
      '/assets/..%2f..%2f..%2fetc/passwd',
      '/..%2f..%2fetc/shadow',
      '/%2e%2e%2f%2e%2e%2fetc/passwd',
    ]) {
      const resposta = pedir(ataque);
      expect(resposta.status).toBe(403);
      expect(await resposta.text()).toBe('Forbidden');
    }
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('devolve 404 para o que não existe e para diretório', () => {
    existeSync.mockReturnValue(false);
    expect(pedir('/assets/faltando.js').status).toBe(404);

    existeSync.mockReturnValue(true);
    statSync.mockReturnValue({
      isDirectory: (): boolean => true,
    } as unknown as fs.Stats);
    expect(pedir('/assets/').status).toBe(404);
  });

  it('o 404 diz o que aconteceu, e não devolve corpo vazio', async () => {
    // O corpo do 404 aparece no DevTools: frase literal em inglês, fora do bundle.
    existeSync.mockReturnValue(false);
    const resposta = pedir('/assets/faltando.js');

    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toBe('Not Found');
  });

  it('devolve 500 quando a leitura estoura, sem derrubar o protocolo', async () => {
    readFileSync.mockImplementation(() => {
      throw new Error('disco indisponível');
    });
    const resposta = pedir('/assets/app.js');
    expect(resposta.status).toBe(500);
    expect(await resposta.text()).toBe('Internal Error');
  });
});

describe('os assets resolvidos no boot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o preload sai como .cjs, que é o que o Electron sandboxed executa', () => {
    // `format: 'cjs'` está fixado no vite config: o preload roda sandboxed, sem loader ESM.
    expect(resolvePreloadScript()).toMatch(/index\.c[cm]?js$/);
  });

  it('o preload é procurado na pasta preload, irmã do main', () => {
    // `path.join(__dirname, '../preload')` põe o bundle onde o `electron-vite` escreve, senão some.
    expect(path.basename(path.dirname(resolvePreloadScript()))).toBe('preload');
    expect(path.dirname(resolvePreloadScript())).not.toBe(path.dirname(path.dirname(__filename)));
  });

  it('o fallback do preload também é .cjs quando nada existe no bundle', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolvePreloadScript()).toMatch(/index\.cjs$/);
  });

  it('o ícone só vem quando o build o deixou onde a janela procura', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolveWindowIcon()).toBeUndefined();
    vi.restoreAllMocks();
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(resolveWindowIcon()).toMatch(/build[/\\]icon\.png$/);
  });
});
