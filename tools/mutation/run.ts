import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import {
  coverageExists,
  lineCovered,
  loadCoverage,
  readJsonFile,
  type Coverage,
} from './coverage.ts';
import { buildModuleGraph, type ModuleGraph } from './graph.ts';
import {
  buildMatrix,
  loadMatrix,
  saveMatrix,
  sourcesHash,
  type LoadedMatrix,
  type TestDurations,
} from './matrix.ts';
import { enumerateMutants, lineTextAt } from './mutants.ts';
import { OPERATORS } from './operators.ts';
import { isInScope } from './scope.ts';
import type { CoverageMatrix } from './matrix.ts';
import type { Mutant, MutantResult, MutantStatus } from './types.ts';

/**
 * Runner da varredura de mutação.
 *
 * O plano sai do cruzamento de três fontes: a AST de cada arquivo de `src/`
 * (quais mutantes existem), a cobertura da linha de base (quais deles são
 * alcançáveis por algum teste) e o grafo de módulos (quais arquivos de teste
 * rodam contra aquele arquivo). Cada mutante vira uma execução da suíte com o
 * trocado no lugar; teste que quebra mata o mutante, suíte verde o deixa
 * sobreviver.
 */

const ROOT = process.cwd();
const VITEST_BIN = join(ROOT, 'node_modules/vitest/vitest.mjs');
const MUTATION_CONFIG = 'vitest.mutation.config.mts';
const RESULT_DIR = join(ROOT, 'mutation');
const RESULT_FILE = join(RESULT_DIR, 'results.json');

const DEFAULT_TIMEOUT_MS = 240_000;

interface Options {
  onlyFiles: string[];
  onlyMutants: string[];
  jobs: number;
  maxWorkers: number;
  suiteWorkers: number;
  timeoutMs: number;
  operators: string[];
  coveredOnly: boolean;
  baseline: boolean;
  fresh: boolean;
  minScore: number | null;
  list: boolean;
  quiet: boolean;
  precise: boolean;
  skipCoverage: boolean;
}

/** Mutante pronto para rodar, com a linha de código que ele mexe. */
interface PlannedMutant {
  mutant: Mutant;
  /** Arquivos de teste que alcançam o arquivo do mutante. */
  tests: string[];
  context: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    onlyFiles: [],
    onlyMutants: [],
    jobs: Math.max(1, cpus().length - 1),
    maxWorkers: 1,
    suiteWorkers: cpus().length,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    operators: [...OPERATORS],
    coveredOnly: true,
    baseline: true,
    fresh: false,
    minScore: null,
    list: false,
    quiet: false,
    precise: true,
    skipCoverage: false,
  };
  options.maxWorkers = Math.max(1, Math.floor(cpus().length / options.jobs));

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} exige um valor`);
      i++;
      return value;
    };
    if (arg === undefined) throw new Error('opção sem nome');
    switch (arg) {
      case '--file':
        options.onlyFiles.push(next());
        break;
      case '--mutant':
        options.onlyMutants.push(next());
        break;
      case '--jobs':
        options.jobs = Math.max(1, Number(next()));
        options.maxWorkers = Math.max(1, Math.floor(cpus().length / options.jobs));
        break;
      case '--max-workers':
        options.maxWorkers = Math.max(1, Number(next()));
        break;
      case '--suite-workers':
        options.suiteWorkers = Math.max(1, Number(next()));
        break;
      case '--timeout':
        options.timeoutMs = Number(next());
        break;
      case '--operators':
        options.operators = next()
          .split(',')
          .map((name) => name.trim());
        break;
      case '--min-score':
        options.minScore = Number(next());
        break;
      case '--all-lines':
        options.coveredOnly = false;
        break;
      case '--skip-baseline':
        options.baseline = false;
        break;
      case '--fresh':
        options.fresh = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--file-level':
        options.precise = false;
        break;
      case '--skip-coverage':
        options.skipCoverage = true;
        break;
      case '--help':
        printUsage();
        return process.exit(0);
      default:
        throw new Error(`opção desconhecida: ${arg}`);
    }
  }
  return options;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Varredura de mutação do Guardinha.',
      '',
      '  node tools/mutation/run.ts [opções]',
      '',
      '  --file <caminho>      mede só esse arquivo de src/ (repete)',
      '  --mutant <id>         roda só esse mutante (repete)',
      '  --operators <a,b>     filtra operadores (padrão: todos)',
      '  --jobs <n>            execuções em paralelo (padrão: núcleos - 1)',
      '  --max-workers <n>     arquivos de teste por mutante, em paralelo',
      '  --suite-workers <n>   arquivos de teste por execução de suíte inteira',
      '  --timeout <ms>        teto por mutante (padrão: 240000)',
      '  --file-level          seleciona teste por arquivo, sem usar a matriz de linhas',
      '  --skip-coverage       reaproveita o coverage/coverage-final.json existente',
      '  --all-lines           inclui mutante em linha sem cobertura',
      '  --skip-baseline       não exige a suíte verde antes de medir',
      '  --fresh               ignora resultados já gravados',
      '  --min-score <n>       sai com código 1 se o score ficar abaixo',
      '  --list                só monta e imprime o plano',
      '  --quiet               só imprime o resumo final',
      '',
    ].join('\n'),
  );
}

/**
 * Escolhe os testes de um mutante e os deixa na ordem em que valem mais a pena
 * rodar, porque a execução para no primeiro teste que falha (`--bail`).
 *
 * Primeiro quem tem o mesmo nome do módulo (é o teste dele). Depois o mais
 * rápido, porque o mutante morre no primeiro teste que o pega e o mais barato
 * é o primeiro a rodar. Sobrar mutante custa a seleção inteira, então o mais
 * rápido na frente é o que paga a varredura.
 */
function testsFor(
  tests: string[],
  relFile: string,
  line: number,
  matrix: CoverageMatrix | null,
  durations: TestDurations,
): string[] {
  const basename = basenameOf(relFile);
  const precise =
    matrix === null
      ? tests
      : tests.filter((test) => (matrix.get(test)?.get(relFile) ?? []).includes(line));
  const chosen = precise.length > 0 ? precise : tests;

  return [...chosen].sort((a, b) => {
    const named = Number(basenameOf(a) !== basename) - Number(basenameOf(b) !== basename);
    if (named !== 0) return named;
    return (durations.get(a) ?? 0) - (durations.get(b) ?? 0);
  });
}

function basenameOf(relFile: string): string {
  const name = relFile.slice(relFile.lastIndexOf('/') + 1).replace(/\.tsx?$/, '');
  return name;
}

/** Monta a lista de mutantes que a varredura vai medir. */
function buildPlan(
  options: Options,
  matrix: CoverageMatrix | null,
  durations: TestDurations,
): { plan: PlannedMutant[]; skippedCoverage: number } {
  const graph = buildModuleGraph(ROOT);
  const coverage = loadCoverage();
  const plan: PlannedMutant[] = [];
  let skippedCoverage = 0;

  const files = [...graph.testsBySource.keys()]
    .filter((relFile) => isInScope(relFile))
    .filter((relFile) => options.onlyFiles.length === 0 || options.onlyFiles.includes(relFile))
    .sort();

  for (const relFile of files) {
    const tests = graph.testsBySource.get(relFile) ?? [];
    const code = readFileSync(join(ROOT, relFile), 'utf8');
    const mutants = enumerateMutants(join(ROOT, relFile), relFile, code);

    for (const mutant of mutants) {
      if (!options.operators.includes(mutant.operator)) continue;
      if (options.onlyMutants.length > 0 && !options.onlyMutants.includes(mutant.id)) continue;
      if (options.coveredOnly && !isCovered(coverage, relFile, mutant)) {
        skippedCoverage++;
        continue;
      }
      plan.push({
        mutant,
        tests: testsFor(tests, relFile, mutant.line, matrix, durations),
        context: lineTextAt(code, mutant.start),
      });
    }
  }

  return { plan, skippedCoverage };
}

function isCovered(coverage: Coverage, relFile: string, mutant: Mutant): boolean {
  return lineCovered(coverage.coveredRanges.get(join(ROOT, relFile)), mutant.line);
}

interface RunOutcome {
  status: MutantStatus;
  killedBy: string | null;
  durationMs: number;
}

let tempCounter = 0;

/** Roda a suíte com um mutante aplicado e classifica o resultado. */
async function runMutant(entry: PlannedMutant, options: Options): Promise<RunOutcome> {
  const output = join(RESULT_DIR, `run-${process.pid}-${tempCounter++}.json`);
  const started = Date.now();

  const args = [
    VITEST_BIN,
    'run',
    '--config',
    MUTATION_CONFIG,
    '--reporter=json',
    `--outputFile=${output}`,
    '--maxWorkers',
    String(options.maxWorkers),
    '--bail=1',
    // Redundante com `fsModuleCache: false` em `vitest.mutation.config.mts`, que
    // é o lugar onde a garantia está de verdade (vale para baseline e matriz
    // também). Fica aqui para o runner não depender do arquivo de config: se
    // alguém apontar `MUTATION_CONFIG` para outra config, o cache continua
    // desligado.
    '--fsModuleCache=false',
    ...entry.tests,
  ];

  const env = {
    ...process.env,
    GUARDINHA_MUTANT_FILE: entry.mutant.relFile,
    GUARDINHA_MUTANT_INDEX: entry.mutant.id.slice(entry.mutant.relFile.length + 1),
  };

  const code = await runVitest(args, env, options.timeoutMs);
  const durationMs = Date.now() - started;
  if (code === null) return { status: 'timeout', killedBy: null, durationMs };

  const report = readJson(output);
  if (report === null) {
    return { status: code === 0 ? 'survived' : 'killed', killedBy: null, durationMs };
  }

  const failedTests = collectFailures(report);
  if (failedTests.length > 0) {
    return { status: 'killed', killedBy: failedTests[0] ?? null, durationMs };
  }
  if (code !== 0) {
    return { status: 'compileError', killedBy: null, durationMs };
  }
  return { status: 'survived', killedBy: null, durationMs };
}

interface JsonReport {
  numTotalTests?: number;
  numFailedTests?: number;
  testResults?: {
    assertionResults?: { fullName?: string; status?: string }[];
    message?: string;
    status?: string;
  }[];
}

function readJson(path: string): JsonReport | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JsonReport;
  } catch {
    return null;
  }
}

function collectFailures(report: JsonReport): string[] {
  const names: string[] = [];
  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      if (test.status === 'failed') names.push(test.fullName ?? 'desconhecido');
    }
  }
  return names;
}

/** Executa o Vitest e devolve o código de saída, ou `null` no timeout. */
function runVitest(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      done(null);
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(timer);
      if (!settled) done(1);
      settled = true;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!settled) done(code ?? 1);
      settled = true;
    });
  });
}

/** Suíte verde sem mutante: sem isso, nenhum veredito da varredura vale. */
async function baselineGreen(options: Options): Promise<boolean> {
  if (!options.baseline) return true;
  process.stdout.write('baseline: rodando a suíte sem mutante... ');
  const output = join(RESULT_DIR, `baseline-${process.pid}.json`);
  const args = [
    VITEST_BIN,
    'run',
    '--config',
    MUTATION_CONFIG,
    '--reporter=json',
    `--outputFile=${output}`,
    '--maxWorkers',
    String(options.suiteWorkers),
  ];
  const code = await runVitest(args, process.env, 10 * DEFAULT_TIMEOUT_MS);
  const ok = code === 0;
  process.stdout.write(ok ? 'verde\n' : 'VERMELHA, a varredura não pode confiar em si\n');
  return ok;
}

/**
 * Cobertura da linha de base: diz quais linhas a suíte alcança, para tirar do
 * denominador o mutante que ninguém alcança. Roda pela config de mutação (a
 * suíte é a mesma; só o Argon2id é o doppelgänger barato) e é o primeiro passo
 * de toda varredura, porque medir contra um relatório velho é medir errado.
 */
async function ensureCoverage(options: Options): Promise<void> {
  if (options.skipCoverage && coverageExists()) return;
  process.stdout.write('cobertura: rodando a suíte com medição de linhas...\n');
  const started = Date.now();
  const code = await runVitest(
    [
      VITEST_BIN,
      'run',
      '--config',
      MUTATION_CONFIG,
      '--coverage',
      '--coverage.reporter=json',
      '--maxWorkers',
      String(options.suiteWorkers),
    ],
    process.env,
    10 * DEFAULT_TIMEOUT_MS,
  );
  if (code !== 0 || !coverageExists()) {
    throw new Error('a cobertura da linha de base falhou; a varredura não tem o que medir');
  }
  process.stdout.write(`cobertura: pronta em ${Math.round((Date.now() - started) / 1000)}s\n`);
}

/** Matriz de cobertura por arquivo de teste, do cache ou de uma execução nova. */
async function resolveMatrix(graph: ModuleGraph, options: Options): Promise<LoadedMatrix | null> {
  const files = [...graph.testsBySource.keys(), ...graph.testFiles];
  const hash = sourcesHash(ROOT, files);
  const cached = loadMatrix(ROOT, hash);
  if (cached !== null) {
    process.stdout.write('matriz de linhas: cache\n');
    return cached;
  }
  process.stdout.write(
    `matriz de linhas: montando (${graph.testFiles.length} execuções da suíte, com cobertura)...\n`,
  );
  const started = Date.now();
  const matrix = await buildMatrix(
    ROOT,
    graph.testFiles,
    options.suiteWorkers,
    (done, total, file) => {
      if (!options.quiet) {
        process.stdout.write(
          `  ${done}/${total} ${file} (${Math.round((Date.now() - started) / 1000)}s)\n`,
        );
      }
    },
  );
  saveMatrix(ROOT, hash, matrix);
  process.stdout.write(
    `matriz de linhas: pronta em ${Math.round((Date.now() - started) / 1000)}s\n`,
  );
  return matrix;
}

function loadResults(): Map<string, MutantResult> {
  const raw = readJsonFile(RESULT_FILE) as { results?: MutantResult[] } | null;
  if (raw?.results === undefined) return new Map();
  return new Map(raw.results.map((result) => [result.id, result]));
}

function saveResults(results: Map<string, MutantResult>): void {
  mkdirSync(RESULT_DIR, { recursive: true });
  const ordered = [...results.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(RESULT_FILE, `${JSON.stringify({ results: ordered }, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(RESULT_DIR, { recursive: true });

  if (!existsSync(VITEST_BIN)) throw new Error(`vitest não encontrado em ${VITEST_BIN}`);

  await ensureCoverage(options);

  const graph = buildModuleGraph(ROOT);
  const loaded = options.precise ? await resolveMatrix(graph, options) : null;
  const matrix = loaded?.coverage ?? null;
  const durations = loaded?.durations ?? new Map<string, number>();
  const { plan, skippedCoverage } = buildPlan(options, matrix, durations);
  const uncoveredFiles = graph.orphans.filter((file) => isInScope(file));

  if (plan.length === 0) {
    process.stdout.write('nenhum mutante no plano\n');
    return;
  }

  if (options.list) {
    printPlan(plan, skippedCoverage, uncoveredFiles);
    return;
  }

  if (!(await baselineGreen(options))) process.exit(1);

  const results = loadResults();
  // `--fresh` descarta só o que está sendo remedido agora: quem fecha buraco de
  // teste reexecuta o arquivo que mudou, sem perder a varredura inteira.
  if (options.fresh) {
    const targets = new Set(plan.map((entry) => entry.mutant.relFile));
    for (const id of [...results.keys()]) {
      const file = id.slice(0, id.lastIndexOf(':'));
      if (targets.has(file)) results.delete(id);
    }
  }
  const queue = plan.filter((entry) => !results.has(entry.mutant.id));
  const resumed = plan.length - queue.length;

  process.stdout.write(
    `plano: ${plan.length} mutantes em ${new Set(plan.map((e) => e.mutant.relFile)).size} arquivos` +
      `${resumed > 0 ? ` (${resumed} já medidos)` : ''}\n` +
      `fora do denominador: ${skippedCoverage} em linha sem cobertura, ` +
      `${uncoveredFiles.length} arquivos sem teste\n` +
      `paralelismo: ${options.jobs} execuções × ${options.maxWorkers} workers\n\n`,
  );

  let done = 0;
  let sinceReport = 0;
  const started = Date.now();
  const next = (): PlannedMutant | undefined => queue.shift();

  await Promise.all(
    Array.from({ length: Math.min(options.jobs, queue.length) }, async () => {
      let entry = next();
      while (entry !== undefined) {
        const outcome = await runMutant(entry, options);
        results.set(entry.mutant.id, toResult(entry, outcome));
        done++;
        sinceReport++;
        if (!options.quiet)
          process.stdout.write(progress(entry, outcome, done, plan.length, started));
        if (sinceReport >= 10) {
          saveResults(results);
          sinceReport = 0;
        }
        entry = next();
      }
    }),
  );

  saveResults(results);
  const measured = plan.map((entry) => results.get(entry.mutant.id)).filter(isResult);
  const score = mutationScore(measured);
  printSummary(measured, score, skippedCoverage, uncoveredFiles);

  if (options.minScore !== null && score < options.minScore) {
    process.stdout.write(`\nscore ${score}% abaixo do mínimo de ${options.minScore}%\n`);
    process.exit(1);
  }
}

function toResult(entry: PlannedMutant, outcome: RunOutcome): MutantResult {
  const { mutant } = entry;
  return {
    id: mutant.id,
    relFile: mutant.relFile,
    operator: mutant.operator,
    line: mutant.line,
    column: mutant.column,
    original: mutant.original,
    replacement: mutant.replacement,
    status: outcome.status,
    killedBy: outcome.killedBy,
    context: entry.context,
    durationMs: outcome.durationMs,
  };
}

function isResult(value: MutantResult | undefined): value is MutantResult {
  return value !== undefined;
}

/** Score: mortos sobre o que dá para medir (o resto não conta). */
export function mutationScore(results: MutantResult[]): number {
  const scorable = results.filter(
    (result) => result.status === 'killed' || result.status === 'survived',
  );
  if (scorable.length === 0) return 100;
  const killed = scorable.filter((result) => result.status === 'killed').length;
  return Math.round((killed / scorable.length) * 1000) / 10;
}

function progress(
  entry: PlannedMutant,
  outcome: RunOutcome,
  done: number,
  total: number,
  started: number,
): string {
  const elapsed = Math.round((Date.now() - started) / 1000);
  const pace = elapsed / done;
  const mark = outcome.status === 'killed' ? 'x' : outcome.status === 'survived' ? 'o' : '!';
  const eta = Math.round((pace * (total - done)) / 60);
  return `${String(done).padStart(5)}/${total} ${mark} ${entry.mutant.relFile}:${entry.mutant.line} ${entry.mutant.operator} ${(outcome.durationMs / 1000).toFixed(1)}s | eta ${eta}min\n`;
}

function printPlan(plan: PlannedMutant[], skippedCoverage: number, uncoveredFiles: string[]): void {
  const byFile = new Map<string, PlannedMutant[]>();
  for (const entry of plan) {
    const list = byFile.get(entry.mutant.relFile);
    if (list === undefined) byFile.set(entry.mutant.relFile, [entry]);
    else list.push(entry);
  }
  const rows = [...byFile].sort((a, b) => b[1].length - a[1].length);
  for (const [file, entries] of rows) {
    const tests = entries[0]?.tests.length ?? 0;
    process.stdout.write(
      `${String(entries.length).padStart(5)} mutantes  ${file}  (${tests} testes)\n`,
    );
  }
  process.stdout.write(`\ntotal: ${plan.length}\n`);
  process.stdout.write(
    `fora: ${skippedCoverage} sem cobertura, ${uncoveredFiles.length} sem teste\n`,
  );
}

function printSummary(
  results: MutantResult[],
  score: number,
  skippedCoverage: number,
  uncoveredFiles: string[],
): void {
  const byOperator = new Map<string, { killed: number; survived: number; other: number }>();
  const byFile = new Map<string, { killed: number; survived: number; other: number }>();

  for (const result of results) {
    const bucket = byOperator.get(result.operator) ?? { killed: 0, survived: 0, other: 0 };
    const fileBucket = byFile.get(result.relFile) ?? { killed: 0, survived: 0, other: 0 };
    if (result.status === 'killed') {
      bucket.killed++;
      fileBucket.killed++;
    } else if (result.status === 'survived') {
      bucket.survived++;
      fileBucket.survived++;
    } else {
      bucket.other++;
      fileBucket.other++;
    }
    byOperator.set(result.operator, bucket);
    byFile.set(result.relFile, fileBucket);
  }

  process.stdout.write(`\nscore de mutação: ${score.toFixed(1)}%\n\n`);

  process.stdout.write('por operador\n');
  for (const [operator, bucket] of [...byOperator].sort(([a], [b]) => a.localeCompare(b))) {
    const total = bucket.killed + bucket.survived;
    const pct = total === 0 ? 0 : Math.round((bucket.killed / total) * 100);
    process.stdout.write(`  ${operator.padEnd(20)} ${pct}%  ${bucket.killed}/${total}\n`);
  }

  const worst = [...byFile]
    .map(([file, bucket]) => ({ file, bucket }))
    .filter((row) => row.bucket.survived > 0)
    .sort((a, b) => rate(b.bucket) - rate(a.bucket));

  if (worst.length > 0) {
    process.stdout.write('\narquivos com sobreviventes\n');
    for (const row of worst) {
      const total = row.bucket.killed + row.bucket.survived;
      process.stdout.write(
        `  ${rate(row.bucket).toFixed(0).padStart(3)}%  ${row.bucket.survived}/${total}  ${row.file}\n`,
      );
    }
  }

  writeMarkdown(results, score, skippedCoverage, uncoveredFiles);
}

function rate(bucket: { killed: number; survived: number }): number {
  const total = bucket.killed + bucket.survived;
  return total === 0 ? 100 : (bucket.killed / total) * 100;
}

function writeMarkdown(
  results: MutantResult[],
  score: number,
  skippedCoverage: number,
  uncoveredFiles: string[],
): void {
  const survivors = results.filter((result) => result.status === 'survived');
  const lines = [
    '# Mutação',
    '',
    `Score: **${score.toFixed(1)}%**`,
    '',
    `- mutantes medidos: ${results.length}`,
    `- sobreviventes: ${survivors.length}`,
    `- fora do denominador (linha sem cobertura): ${skippedCoverage}`,
    `- arquivos sem nenhum teste: ${uncoveredFiles.length}`,
    '',
  ];

  if (survivors.length > 0) {
    lines.push('## Sobreviventes', '', '| Arquivo | Linha | Operador | Troca | Código |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const result of survivors) {
      lines.push(
        `| \`${result.relFile}\` | ${result.line} | ${result.operator} | ` +
          `\`${result.original}\` → \`${result.replacement}\` | \`${result.context}\` |`,
      );
    }
    lines.push('');
  }

  writeFileSync(join(RESULT_DIR, 'report.md'), `${lines.join('\n')}\n`);
}

await main();
