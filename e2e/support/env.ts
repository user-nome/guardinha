import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Ambiente isolado de uma execução E2E.
 *
 * Cada app lançado ganha um `HOME` próprio e um `GUARDINHA_VAULT_DIR` próprio:
 * o cofre, o `settings.json` e o cache do Chromium ficam todos no temporário,
 * longe de `/var/lib` e do perfil do usuário. `ELECTRON_RENDERER_URL` fica de
 * fora de propósito: com ele o entrypoint carregaria o dev server do Vite em
 * vez da SPA compilada servida por `guardinha://`.
 *
 * O tipo é `Record<string, string>` (e não `ProcessEnv`) porque é o que o
 * `env` do Playwright exige: nenhuma variável pode chegar como `undefined`.
 */
export interface TempEnv {
  readonly root: string;
  readonly env: Record<string, string>;
}

export function makeTempEnv(prefix: string): TempEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RENDERER_URL') env[key] = value;
  }
  env.HOME = root;
  env.XDG_CONFIG_HOME = path.join(root, '.config');
  env.XDG_CACHE_HOME = path.join(root, '.cache');
  env.XDG_DATA_HOME = path.join(root, '.local', 'share');
  env.GUARDINHA_VAULT_DIR = path.join(root, 'vault');
  return { root, env };
}

/**
 * Apaga uma árvore sem reprovar a suíte por causa dela.
 *
 * Quem chama costuma estar desligando um app ainda vivo: o Chromium escreve no
 * `HOME` (cache, `settings.json`) e o crashpad solta arquivo no `userData`
 * enquanto a remoção acontece, e a árvore volta a ficar não vazia no meio do
 * caminho. Por isso o `rmSync` vai com repetição (o Node refaz a operação em
 * ENOTEMPTY com espera linear) e, se mesmo assim sobrar algo, o resto é um
 * diretório temporário do sistema: sobra ele avisa e a suíte segue.
 */
export function removeTree(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  } catch (error) {
    console.warn(`[e2e] Não foi possível apagar ${target}: ${(error as Error).message}`);
  }
}

export function removeTempEnv(temp: TempEnv): void {
  removeTree(temp.root);
}
