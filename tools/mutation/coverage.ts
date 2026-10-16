import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Leitura do relatório de cobertura do V8. Serve para uma coisa: não medir
 * mutante que nenhum teste alcança. Ele morreria ou não por qualquer motivo, e
 * incluí-lo no denominador só faria o número cair sem apontar buraco nenhum.
 * Esses ficam listados à parte, como buraco de cobertura.
 */

interface CoverageFile {
  path: string;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
}

export interface Coverage {
  /** Arquivo absoluto → faixas `início, fim` de statements executados. */
  coveredRanges: Map<string, [number, number][]>;
  /** Arquivo absoluto → linhas sem nenhum statement executado. */
  missedLines: Map<string, number[]>;
  /** Idade do relatório em disco, para avisar quando ele está velho. */
  ageMs: number;
}

/** O V8 reporta a linha inicial do statement, mas um statement ocupa um
 * intervalo: um mutante na terceira linha de uma chamada de quatro linhas está
 * coberto, mesmo que a faixa comece na primeira. */
export function lineCovered(ranges: [number, number][] | undefined, line: number): boolean {
  if (ranges === undefined) return true;
  return ranges.some(([start, end]) => line >= start && line <= end);
}

/** Relatório do V8, já tipado: `JSON.parse` devolve `any` e o alvo aqui é um
 * relatório que o próprio Vitest acabou de escrever, não entrada de usuário. */
export type JsonObject = Record<string, unknown>;

/** Lê um relatório JSON, ou `null` se o arquivo não existir ou não for JSON. */
export function readJsonFile(path: string): JsonObject | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
  } catch {
    return null;
  }
}

export const COVERAGE_PATH = resolve(process.cwd(), 'coverage/coverage-final.json');

export function coverageExists(): boolean {
  return existsSync(COVERAGE_PATH);
}

export function loadCoverage(): Coverage {
  const raw = readJsonFile(COVERAGE_PATH);
  if (raw === null) throw new Error(`cobertura ilegível em ${COVERAGE_PATH}`);
  const coverage = raw as Record<string, CoverageFile>;
  const coveredRanges = new Map<string, [number, number][]>();
  const missedLines = new Map<string, number[]>();

  for (const [path, file] of Object.entries(coverage)) {
    const ranges: [number, number][] = [];
    const missed = new Set<number>();
    for (const [id, count] of Object.entries(file.s)) {
      const statement = file.statementMap[id];
      if (statement === undefined) continue;
      if (count > 0) {
        ranges.push([statement.start.line, statement.end.line]);
        continue;
      }
      for (let line = statement.start.line; line <= statement.end.line; line++) missed.add(line);
    }
    coveredRanges.set(
      path,
      ranges.sort((a, b) => a[0] - b[0]),
    );
    missedLines.set(
      path,
      [...missed].sort((a, b) => a - b),
    );
  }

  return { coveredRanges, missedLines, ageMs: Date.now() - statSync(COVERAGE_PATH).mtimeMs };
}
