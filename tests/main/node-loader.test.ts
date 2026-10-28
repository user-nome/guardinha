// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Testa o loader rodando o Node de verdade; importá-lo no Vitest vazaria os hooks. */

const LOADER = path.resolve(import.meta.dirname, '../../src/node.loader.ts');
const ROOT = path.resolve(import.meta.dirname, '../..');

/** Executa um trecho `.ts` pelo Node com o loader e devolve a saída padrão. */
function runWithLoader(source: string): string {
  const file = path.join(
    ROOT,
    `.cov-loader-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );
  fs.writeFileSync(file, source, 'utf8');
  try {
    return execFileSync(process.execPath, ['--import', LOADER, file], {
      encoding: 'utf8',
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
}

describe('node.loader (aliases @zero/* para .ts direto)', () => {
  it('resolve um alias com arquivo explícito', () => {
    const out = runWithLoader(
      `import { formatCountdown } from '@zero/shared/format';\n` +
        `console.log(formatCountdown(65_000));`,
    );
    expect(out).toBe('1:05');
  });

  it('resolve um alias sem extensão', () => {
    const out = runWithLoader(
      `import { normalizeRecoveryPhrase } from '@zero/main/crypto';\n` +
        `console.log(normalizeRecoveryPhrase('  Abelha\tAGUA  alface '));`,
    );
    expect(out).toBe('abelha agua alface');
  });

  it('resolve o índice do pacote quando o alias aponta para a pasta', () => {
    const out = runWithLoader(
      `import { formatCountdown } from '@zero/shared';\nconsole.log(formatCountdown(30_000));`,
    );
    expect(out).toBe('30s');
  });

  it('resolve índice sem barra final, para os três pacotes de barrel', () => {
    const out = runWithLoader(
      `import { en } from '@zero/messages';\n` +
        `import { isBase32 } from '@zero/shared';\n` +
        `console.log(en.app.name, isBase32('JBSWY3DPEHPK3PXP'));`,
    );
    expect(out).toBe('Guardinha true');
  });

  it('deixa passar o que não é alias, sem cortar a resolução normal', () => {
    // o `nextResolve` do Node precisa continuar respondendo pelo resto
    const out = runWithLoader(`import path from 'node:path';\nconsole.log(path.basename('/a/b'));`);
    expect(out).toBe('b');
  });

  it('não resolve um alias que não existe', () => {
    // `resolveAlias` devolve null e o Node segue para o erro dele mesmo
    expect(() =>
      runWithLoader(`import { x } from '@zero/shared/nao-existe';\nconsole.log(x);`),
    ).toThrow();
  });
});
