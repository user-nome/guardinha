import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium, _electron as electron } from 'playwright-core';
import type { Browser, ElectronApplication, Page } from 'playwright-core';
import { makeTempEnv, removeTempEnv, removeTree } from './env.ts';
import type { TempEnv } from './env.ts';

/**
 * Como subir o app e falar com ele.
 *
 * O bundle compilado (`out/main/index.js`) sobe pelo `_electron.launch` do
 * Playwright, que anexa ao inspetor da main. O payload do `.deb` não aceita
 * isso: o fusível `enableNodeCliInspectArguments: false` (a decisão de
 * segurança do pacote) faz o Electron ignorar `--inspect`, e o Playwright
 * espera por ele para sempre. Então o alvo empacotado sobe como um processo
 * comum com `--remote-debugging-port` e o runner conecta por CDP
 * (`chromium.connectOverCDP`). O CDP só alcança o renderer, o que basta para
 * dirigir a interface; em troca, `readClipboard` não existe nesse alvo.
 *
 * Este módulo é o único dono de `child_process` e de porta de rede no E2E.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const APP_URL_PREFIX = 'guardinha://';
const CONNECT_ATTEMPTS = 120;
const CONNECT_DELAY_MS = 500;
/** Folga para o Electron sair sozinho antes do `SIGKILL` do grupo. */
const STOP_GRACE_MS = 5_000;

/** O app em execução, reduzido ao que os fluxos precisam. */
export interface LaunchedApp {
  readonly page: Page;
  /** Resolve arquivos dentro do HOME temporário desta instância. */
  tempPath(name: string): string;
  /**
   * Lê o clipboard nativo do main. Só existe no alvo compilado: o alvo
   * empacotado não expõe a main ao runner.
   */
  readonly readClipboard?: () => Promise<string>;
  /** Define as respostas dos diálogos nativos, somente no alvo compilado. */
  configureFileDialogs?: (savePath: string, openPath: string) => Promise<void>;
  close(): Promise<void>;
}

/** Prepara o diretório temporário antes de o app abrir (fixtures de formato antigo). */
export interface LaunchOptions {
  prepare?: (temp: TempEnv) => void | Promise<void>;
}

export async function launchBundled(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const temp = makeTempEnv('guardinha-e2e-bundle-');
  try {
    await options.prepare?.(temp);
    const app: ElectronApplication = await electron.launch({
      args: [path.join(REPO_ROOT, 'out', 'main', 'index.js'), '--no-sandbox'],
      cwd: REPO_ROOT,
      env: temp.env,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return {
      page,
      tempPath: (name: string): string => path.join(temp.root, name),
      readClipboard: (): Promise<string> => app.evaluate(({ clipboard }) => clipboard.readText()),
      configureFileDialogs: async (savePath, openPath): Promise<void> => {
        await app.evaluate(
          ({ dialog }, paths) => {
            dialog.showSaveDialogSync = () => paths.savePath;
            dialog.showOpenDialogSync = () => [paths.openPath];
          },
          { savePath, openPath },
        );
      },
      close: async (): Promise<void> => {
        await app.close();
        removeTempEnv(temp);
      },
    };
  } catch (error) {
    removeTempEnv(temp);
    throw asError(error);
  }
}

/**
 * O binário empacotado a exercitar, na ordem: o caminho indicado por
 * `GUARDINHA_E2E_APP`, o payload extraído do `.deb` mais recente em `release/`
 * e, por fim, a árvore descompactada (`npm run dist:dir`). `null` quando nada
 * foi empacotado ainda.
 */
export function resolvePackagedBinary(): string | null {
  const override = process.env.GUARDINHA_E2E_APP;
  if (override !== undefined && override !== '') {
    return fs.existsSync(override) ? override : null;
  }
  return extractLatestDeb() ?? unpackedBinary();
}

export async function launchPackaged(binary: string): Promise<LaunchedApp> {
  const temp = makeTempEnv('guardinha-e2e-package-');
  const port = await freePort();
  const child = spawn(binary, [`--remote-debugging-port=${port}`, '--no-sandbox'], {
    env: temp.env,
    stdio: 'ignore',
    detached: true,
  });
  // O app é líder do próprio grupo de processos (ver `detached`), então dá para
  // sinalizar o Chromium inteiro. Se o runner morrer no meio do teste, o grupo
  // não sobrevive a ele: este é o gancho que garante isso.
  const killOnRunnerExit = (): void => {
    if (isRunning(child)) killGroup(child, 'SIGKILL');
  };
  process.once('exit', killOnRunnerExit);
  try {
    const browser = await connectOverCdp(port);
    const page = await firstAppPage(browser);
    await page.waitForLoadState('domcontentloaded');
    return {
      page,
      tempPath: (name: string): string => path.join(temp.root, name),
      close: async (): Promise<void> => {
        await browser.close();
        await stopChild(child);
        process.off('exit', killOnRunnerExit);
        removeTempEnv(temp);
      },
    };
  } catch (error) {
    await stopChild(child);
    process.off('exit', killOnRunnerExit);
    removeTempEnv(temp);
    throw asError(error);
  }
}

function unpackedBinary(): string | null {
  const candidate = path.join(REPO_ROOT, 'release', 'linux-unpacked', 'guardinha');
  return fs.existsSync(candidate) ? candidate : null;
}

let debCache: string | null | undefined;

/** Extrai o payload do `.deb` mais recente uma única vez por processo. */
function extractLatestDeb(): string | null {
  if (debCache !== undefined) return debCache;
  debCache = null;
  const releaseDir = path.join(REPO_ROOT, 'release');
  if (fs.existsSync(releaseDir)) {
    const deb = fs
      .readdirSync(releaseDir)
      .filter((name) => name.endsWith('.deb'))
      .sort()[0];
    if (deb !== undefined) {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-e2e-deb-'));
      process.once('exit', () => {
        removeTree(dest);
      });
      const result = spawnSync('dpkg-deb', ['-x', path.join(releaseDir, deb), dest], {
        stdio: 'ignore',
      });
      if (result.error === undefined && result.status === 0) {
        const binary = path.join(dest, 'opt', 'Guardinha', 'guardinha');
        if (fs.existsSync(binary)) debCache = binary;
      }
    }
  }
  return debCache;
}

function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Não foi possível reservar uma porta de depuração.'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function connectOverCdp(port: number): Promise<Browser> {
  const endpoint = `http://127.0.0.1:${port}`;
  let lastError: unknown = new Error('CDP indisponível.');
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await chromium.connectOverCDP(endpoint, { timeout: 5000 });
    } catch (error) {
      lastError = error;
      await delay(CONNECT_DELAY_MS);
    }
  }
  throw asError(lastError);
}

async function firstAppPage(browser: Browser): Promise<Page> {
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith(APP_URL_PREFIX));
    if (page !== undefined) return page;
    await delay(CONNECT_DELAY_MS);
  }
  throw new Error('A janela do app não apareceu.');
}

/**
 * Derruba o app e **espera ele morrer**.
 *
 * Sinalizar e voltar não basta: enquanto o Electron não saiu, ele e os
 * auxiliares (zygote, GPU, crashpad) continuam escrevendo no `HOME`
 * temporário, e apagar a árvore nesse meio-tempo dá ENOTEMPTY. Aqui o
 * primeiro sinal é o `SIGTERM` do grupo inteiro, o `SIGKILL` é o prazo, e a
 * promessa só resolve no evento `exit` do líder, que é o garantido de que
 * ninguém mais está segurando arquivo.
 */
function stopChild(child: ChildProcess): Promise<void> {
  if (!isRunning(child)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const escalate = setTimeout(() => {
      killGroup(child, 'SIGKILL');
    }, STOP_GRACE_MS);
    escalate.unref();
    child.once('exit', () => {
      clearTimeout(escalate);
      resolve();
    });
    killGroup(child, 'SIGTERM');
  });
}

/**
 * Sinaliza o grupo de processos do app, e não só o líder: com o `detached`, o
 * `pid` do filho é também o `pgid`, então o negativo alcança o Chromium todo.
 * Cai para o sinal no líder quando o grupo já não existe mais.
 */
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const { pid } = child;
  if (pid === undefined) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    if (isRunning(child)) child.kill(signal);
  }
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Falha inesperada no E2E.');
}
