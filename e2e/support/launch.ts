import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium, _electron as electron } from 'playwright-core';
import type { Browser, ElectronApplication, Page } from 'playwright-core';
import { makeTempEnv, removeTempEnv } from './env.ts';

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

/** O app em execução, reduzido ao que os fluxos precisam. */
export interface LaunchedApp {
  readonly page: Page;
  /**
   * Lê o clipboard nativo do main. Só existe no alvo compilado: o alvo
   * empacotado não expõe a main ao runner.
   */
  readonly readClipboard?: () => Promise<string>;
  close(): Promise<void>;
}

export async function launchBundled(): Promise<LaunchedApp> {
  const temp = makeTempEnv('guardinha-e2e-bundle-');
  try {
    const app: ElectronApplication = await electron.launch({
      args: [path.join(REPO_ROOT, 'out', 'main', 'index.js'), '--no-sandbox'],
      cwd: REPO_ROOT,
      env: temp.env,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return {
      page,
      readClipboard: (): Promise<string> => app.evaluate(({ clipboard }) => clipboard.readText()),
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
  });
  try {
    const browser = await connectOverCdp(port);
    const page = await firstAppPage(browser);
    await page.waitForLoadState('domcontentloaded');
    return {
      page,
      close: async (): Promise<void> => {
        await browser.close();
        stopChild(child);
        removeTempEnv(temp);
      },
    };
  } catch (error) {
    stopChild(child);
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
        fs.rmSync(dest, { recursive: true, force: true });
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

function stopChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 2000).unref();
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Falha inesperada no E2E.');
}
