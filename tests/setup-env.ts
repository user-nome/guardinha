import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Isola todas as escritas (cofre, configurações, estado de auth) em um
 * diretório temporário exclusivo deste processo de teste. Precisa rodar antes
 * do import dos módulos sob teste, por isso fica em `setupFiles`.
 */
const TEMP_PREFIX = 'guardinha-tests-';
const STALE_MS = 24 * 60 * 60 * 1000;

const root = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));

process.env.HOME = root;
process.env.GUARDINHA_VAULT_DIR = path.join(root, '.guardinha-vault');
delete process.env.ELECTRON_RENDERER_URL;

function cleanup(): void {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // melhor esforço: diretório temporário
  }
}

/** Varre resíduos de execuções anteriores que o cleanup não alcançou. */
function sweepStale(): void {
  let names: string[];
  try {
    names = fs.readdirSync(os.tmpdir());
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const candidate = path.join(os.tmpdir(), name);
    if (candidate === root) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory() && now - stat.mtimeMs > STALE_MS) {
        fs.rmSync(candidate, { recursive: true, force: true });
      }
    } catch {
      // melhor esforço: diretório temporário de outro processo
    }
  }
}

function exitAndCleanup(code: number): void {
  cleanup();
  process.exit(code);
}

sweepStale();

process.once('exit', cleanup);
process.once('SIGINT', () => exitAndCleanup(130));
process.once('SIGTERM', () => exitAndCleanup(143));
process.once('uncaughtException', (error) => {
  console.error(error);
  exitAndCleanup(1);
});
