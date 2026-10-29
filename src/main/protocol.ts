import fs from 'node:fs';
import path from 'node:path';
import { protocol } from 'electron';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';

/** Scheme `guardinha://` e guarda de origem do IPC; único ponto do main que serve asset. */

export const APP_SCHEME = 'guardinha';
export const APP_ORIGIN = `${APP_SCHEME}://app`;

/** Declara o scheme antes do app ficar pronto; o Electron exige no topo do módulo. */
export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      // Serve a SPA em produção via protocol.handle (substitui file://).
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

function rendererMime(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

/** Serve a SPA empacotada, com path traversal rejeitado por `path.resolve` e prefixo. */
export function registerAppProtocol(): void {
  const root = path.join(__dirname, '../renderer');
  protocol.handle(APP_SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const full = path.resolve(root, rel === '' ? 'index.html' : rel);
      if (!full.startsWith(`${root}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(new Uint8Array(fs.readFileSync(full)), {
        headers: { 'Content-Type': rendererMime(full) },
      });
    } catch {
      return new Response('Internal Error', { status: 500 });
    }
  });
}

/** URL da página do app, a mesma base para a navegação e para a guarda do IPC. */
export function appPageUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl !== undefined && devUrl !== '' ? devUrl : `${APP_ORIGIN}/index.html`;
}

/** Sonda o preload `.cjs` no bundle; fica aqui para o `index.ts` não precisar de `fs`. */
export function resolvePreloadScript(): string {
  const dir = path.join(__dirname, '../preload');
  const found = ['index.cjs', 'index.mjs', 'index.js']
    .map((name) => path.join(dir, name))
    .find((file) => fs.existsSync(file));
  return found ?? path.join(dir, 'index.cjs');
}

/** Ícone da janela, quando o build o deixou no lugar esperado. */
export function resolveWindowIcon(): string | undefined {
  const iconPath = path.join(__dirname, '../../build/icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

/** Só a URL do app: dev server em dev, `guardinha://` em produção. */
function isAppFrameUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    const frame = new URL(url);
    const expected = new URL(appPageUrl());
    return (
      frame.protocol === expected.protocol &&
      frame.host === expected.host &&
      frame.port === expected.port
    );
  } catch {
    return false;
  }
}

/** O pedaço do evento do IPC que a guarda valida antes de ler a URL. */
interface FrameEmitter {
  senderFrame?: { url?: unknown } | null;
}

function isFrameEmitter(value: unknown): value is FrameEmitter {
  if (!isRecord(value)) return false;
  const frame = value.senderFrame;
  return frame === undefined || frame === null || isRecord(frame);
}

/** Recusa IPC de emissor que não é a página do app; a mensagem sai localizada. */
export function assertAppFrame(event: unknown): void {
  const url = isFrameEmitter(event) ? event.senderFrame?.url : undefined;
  if (!isAppFrameUrl(typeof url === 'string' ? url : undefined)) {
    throw new Error(currentMessages().errors.foreignFrame);
  }
}
