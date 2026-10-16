import fs from 'node:fs';
import path from 'node:path';
import { protocol } from 'electron';
import { currentMessages } from '@zero/main/i18n';
import { isRecord } from '@zero/shared/record';

/**
 * Scheme `guardinha://` e a guarda de origem do IPC.
 *
 * Fica fora do `index.ts` porque é o único lugar do `main` que serve arquivo
 * estático, e essa é uma responsabilidade com superfície de segurança própria:
 * barreira contra *path traversal*, tabela de MIME e a checagem de origem que
 * todo handler IPC precisa. Misturado com o registro dos canais, o arquivo
 * ficaria grande demais e essa parte ficaria escondida entre `ipcMain.handle`.
 */

export const APP_SCHEME = 'guardinha';
export const APP_ORIGIN = `${APP_SCHEME}://app`;

/**
 * Declara o scheme antes do app ficar pronto (o Electron exige isso no topo do
 * módulo, ainda em fase de import).
 */
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

/**
 * Serve a SPA empacotada sob o scheme `guardinha://` (em vez de `file://`,
 * recomendado pela doc atual do Electron): todo `/assets/...` resolve dentro
 * de `out/renderer`, com path traversal rejeitado por `path.resolve` + prefix.
 *
 * Os corpos das respostas são frases de status do protocolo, em inglês e
 * literais de propósito: é transporte, não interface. A tela é servida de
 * `index.html` e quem chega aqui é o carregador de asset, não o usuário, então
 * localizá-los seria um `settings.json` lido por requisição sem ganho nenhum.
 */
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

/**
 * URL da página do app: o dev server do Vite em desenvolvimento, o scheme
 * `guardinha://` em produção. Fica em um lugar só porque a guarda de navegação
 * da janela e a guarda de origem do IPC precisam concordar com essa base: se
 * as duas resolvessem diferente, uma delas passaria a recusar o frame legítimo.
 */
export function appPageUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl !== undefined && devUrl !== '' ? devUrl : `${APP_ORIGIN}/index.html`;
}

/**
 * O preload é emitido como `.cjs` (CommonJS) porque o Electron executa preload
 * **sandboxed** como script simples, sem loader ESM; `format: 'cjs'` está fixado
 * em `electron.vite.config.mts`. Resolve o que existir no bundle gerado.
 *
 * Mora aqui com o resto do I/O de asset do app: sondar o bundle é a mesma
 * pergunta que o servidor do scheme responde, e o `index.ts` não precisa de `fs`.
 */
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

/**
 * Só aceita URL da página oficial do app: dev server do Vite em dev, ou o
 * scheme `guardinha://` em produção. Qualquer frame fora desse host (ex.: um
 * `<webview>` injetado) é bloqueado antes do handler de domínio rodar.
 */
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

/**
 * O pedaço do evento do IPC que a guarda precisa. A forma aninhada e opcional
 * é validada aqui para que a URL nunca seja lida de um frame desconhecido.
 */
interface FrameEmitter {
  senderFrame?: { url?: unknown } | null;
}

function isFrameEmitter(value: unknown): value is FrameEmitter {
  if (!isRecord(value)) return false;
  const frame = value.senderFrame;
  return frame === undefined || frame === null || isRecord(frame);
}

/**
 * Recusa IPC cujo emissor não é a página oficial do app (scheme `guardinha://`
 * em produção ou dev server do Vite em dev). Requer `event.senderFrame`.
 *
 * A mensagem sai do bundle porque este erro **atravessa o IPC**: ele chega ao
 * renderer como `Error` rejeitado, igual aos outros, e o usuário pode estar
 * no idioma escolhido.
 */
export function assertAppFrame(event: unknown): void {
  const url = isFrameEmitter(event) ? event.senderFrame?.url : undefined;
  if (!isAppFrameUrl(typeof url === 'string' ? url : undefined)) {
    throw new Error(currentMessages().errors.foreignFrame);
  }
}
