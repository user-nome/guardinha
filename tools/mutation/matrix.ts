import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { readJsonFile } from './coverage.ts';
import { join } from 'node:path';

/**
 * Matriz arquivo de teste → linhas de `src/` que aquele teste executa.
 *
 * Sem ela, a seleção de testes para um mutante é por arquivo inteiro: mutar
 * `src/main/auth.ts` roda os 16 arquivos de teste que o alcançam (18 s), mesmo
 * que a linha mudada seja lida por um só deles. Com a matriz, a seleção cai
 * para os testes que realmente passam pela linha, e a varredura inteira deixa
 * de ser limitada pelo arquivo de teste mais lento.
 *
 * A matriz é cara de montar (uma execução da suíte por arquivo de teste, com
 * cobertura) e barata de usar, então fica em cache: `mutation/matrix.json`,
 * invalidado quando algum arquivo de `src/` ou de `tests/` muda.
 */

/** Arquivo de teste → arquivo de `src/` → linhas cobertas. */
export type CoverageMatrix = Map<string, Map<string, number[]>>;

/** Arquivo de teste → quanto ele levou, em milissegundos. */
export type TestDurations = Map<string, number>;

const MATRIX_FILE = 'mutation/matrix.json';

/** Uma entrada do relatório do V8: os statements e quantas vezes rodaram. */
interface V8Entry {
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
}

/** O relatório do V8: uma entrada por arquivo de `src/`. */
type V8Coverage = Record<string, V8Entry>;

interface Serialized {
  hash: string;
  durations?: [string, number][];
  coverage: [string, [string, number[]][]][];
}

/** `durations` entrou depois da primeira matriz gravada; o cache antigo só tem o essencial. */
function decodeSerialized(raw: Serialized): Serialized {
  return { ...raw, durations: raw.durations ?? [] };
}

export function matrixPath(root: string): string {
  return join(root, MATRIX_FILE);
}

/** Impressão digital das fontes: muda quando algum arquivo relevante muda. */
export function sourcesHash(root: string, files: string[]): string {
  const hash = createHash('sha1');
  for (const file of [...files].sort()) {
    hash.update(file);
    try {
      const stat = statSync(join(root, file));
      hash.update(`${stat.size}:${Math.round(stat.mtimeMs)}`);
    } catch {
      hash.update('?');
    }
  }
  return hash.digest('hex').slice(0, 16);
}

/** Lê a matriz do cache, ou `null` se não existir ou estiver velha. */
export interface LoadedMatrix {
  coverage: CoverageMatrix;
  durations: TestDurations;
}

export function loadMatrix(root: string, hash: string): LoadedMatrix | null {
  const path = matrixPath(root);
  if (!existsSync(path)) return null;
  const parsed = readJsonFile(path) as Serialized | null;
  if (parsed?.hash !== hash) return null;
  const raw = decodeSerialized(parsed);
  return {
    coverage: new Map(raw.coverage.map(([test, files]) => [test, new Map(files)] as const)),
    durations: new Map(raw.durations),
  };
}

export function saveMatrix(root: string, hash: string, matrix: LoadedMatrix): void {
  mkdirSync(join(root, 'mutation'), { recursive: true });
  const coverage: [string, [string, number[]][]][] = [...matrix.coverage]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([test, files]) => [test, [...files].sort((a, b) => a[0].localeCompare(b[0]))]);
  const durations: [string, number][] = [...matrix.durations].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  writeFileSync(matrixPath(root), `${JSON.stringify({ hash, coverage, durations })}\n`);
}

/**
 * Roda um arquivo de teste por vez, com cobertura, e monta a matriz. Os
 * relatórios individuais ficam em `mutation/cov/`, um por arquivo, para não
 * sobrescrever o `coverage/coverage-final.json` da linha de base.
 */
export async function buildMatrix(
  root: string,
  testFiles: string[],
  workers: number,
  onProgress?: (done: number, total: number, file: string) => void,
): Promise<LoadedMatrix> {
  const queue = [...testFiles];
  const coverage: CoverageMatrix = new Map();
  const durations: TestDurations = new Map();
  let done = 0;

  const runOne = async (testFile: string): Promise<void> => {
    const name = testFile.replace(/[\\/]/g, '__').replace(/\.tsx?$/, '');
    // Cada execução escreve no seu próprio diretório: se duas apontarem para
    // `coverage/`, uma sobrescreve o `coverage-final.json` da linha de base.
    const dir = join(root, 'mutation/cov', name);
    await runVitest(root, dir, workers, [testFile]);
    coverage.set(testFile, readReport(root, join(dir, 'coverage-final.json')));
    durations.set(testFile, readDuration(join(dir, 'tests.json')));
    done++;
    onProgress?.(done, queue.length, testFile);
  };

  await Promise.all(
    Array.from({ length: Math.min(workers, queue.length) }, async () => {
      let next = queue.pop();
      while (next !== undefined) {
        await runOne(next);
        next = queue.pop();
      }
    }),
  );

  return { coverage, durations };
}

function runVitest(
  root: string,
  reportsDir: string,
  workers: number,
  files: string[],
): Promise<void> {
  const args = [
    join(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.mutation.config.mts',
    '--coverage',
    '--coverage.reporter=json',
    `--coverage.reportsDirectory=${reportsDir}`,
    '--reporter=json',
    `--outputFile=${join(reportsDir, 'tests.json')}`,
    '--maxWorkers',
    String(workers),
    ...files,
  ];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'ignore' });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

/** Converte um relatório do V8 no mapa `arquivo de src` → linhas cobertas. */
function readReport(root: string, report: string): Map<string, number[]> {
  const lines = new Map<string, number[]>();
  const raw = readJsonFile(report) as V8Coverage | null;
  if (raw === null) return lines;
  for (const [file, data] of Object.entries(raw)) {
    const covered = new Set<number>();
    for (const [id, count] of Object.entries(data.s)) {
      const statement = data.statementMap[id];
      if (statement !== undefined && count > 0) covered.add(statement.start.line);
    }
    if (covered.size > 0) {
      lines.set(
        file.slice(root.length + 1),
        [...covered].sort((a, b) => a - b),
      );
    }
  }
  return lines;
}

/**
 * Quanto um arquivo de teste levou, pelo carimbo do reporter de teste. Serve
 * para ordenar a seleção: um mutante morre antes no teste barato do que no caro.
 */
function readDuration(report: string): number {
  const raw = readJsonFile(report) as {
    testResults?: { startTime?: number; endTime?: number }[];
  } | null;
  const first = raw?.testResults?.[0];
  const start = first?.startTime;
  const end = first?.endTime;
  if (start === undefined || end === undefined) return 0;
  return Math.max(0, end - start);
}
