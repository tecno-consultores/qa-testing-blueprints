// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { parseQaOutput } from '../parsers/output-parsers.js';
import {
  extractPathsFromPorcelainLine,
  isDocFilePath,
  recordQaStageEvidence,
} from '../services/qa-evidence.js';
import { QaExecutionResult } from '../types.js';

const MAX_EXEC_BUFFER_BYTES = 20 * 1024 * 1024;
const COMPOSE_QA_FILE = 'docker-compose.qa.yml';
const DOCKER_BINARY = 'docker';
const MAKE_BINARY = 'make';
const STATUS_FAILED = 'FAILED' as const;
const PREFERRED_QA_SERVICES = [
  'qa-php',
  'qa-backend',
  'qa-node',
  'qa-frontend',
  'qa-python',
  'qa-bash',
];
const COMPOSER_STAGE_SET = new Set(['lint', 'unit', 'mutation', 'sbom']);

export interface RunEphemeralQaOptions {
  execFileFn?: typeof execFile;
  execFileSyncFn?: typeof execFileSync;
  skipIfDocsOnly?: boolean;
}

interface ParsedMakefile {
  vars: Map<string, string>;
  rules: Map<string, string[]>;
  recipes: Map<string, string[]>;
}

export type RecipeResolutionResult =
  | { ok: true; commands: string[][] }
  | { ok: false; reason: string };

interface ExecCommandOutcome {
  exitCode: number;
  errorCode?: string;
  stdout: string;
  stderr: string;
  errorMessage: string;
}

function buildStructuredFailureResult(
  stage: string,
  testName: string,
  errorSummary: string,
  tailLog: string,
  durationMs = 0
): QaExecutionResult {
  return {
    status: STATUS_FAILED,
    stage,
    exit_code: 1,
    duration_ms: durationMs,
    coverage: {
      detected: false,
      percent: 0,
      threshold: 95.0,
      passed: false,
      uncovered_files: [],
    },
    failed_tests: [{ test_name: testName, error_summary: errorSummary }],
    linter_and_complexity_issues: [],
    security_alerts: { critical: 0, high: 0 },
    mutation_summary: null,
    tail_log: tailLog,
  };
}

function readSingleQuotedToken(src: string, start: number): { value: string; nextIndex: number } {
  const end = src.indexOf("'", start + 1);
  if (end === -1) {
    return { value: src.slice(start + 1), nextIndex: src.length - 1 };
  }
  return { value: src.slice(start + 1, end), nextIndex: end };
}

function readDoubleQuotedToken(src: string, start: number): { value: string; nextIndex: number } {
  let out = '';
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      return { value: out, nextIndex: i };
    }
    if (ch === '\\' && i + 1 < src.length) {
      i += 1;
      out += src[i];
    } else {
      out += ch;
    }
    i += 1;
  }
  return { value: out, nextIndex: src.length - 1 };
}

/**
 * Tokenizador lineal de argumentos CLI respetando comillas simples y dobles sin usar regex complejas.
 */
export function tokenizeCommandArgs(commandLine: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasToken = false;

  for (let i = 0; i < commandLine.length; i += 1) {
    const ch = commandLine[i];
    if (ch === ' ' || ch === '\t') {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const seg =
        ch === "'"
          ? readSingleQuotedToken(commandLine, i)
          : readDoubleQuotedToken(commandLine, i);
      current += seg.value;
      i = seg.nextIndex;
      hasToken = true;
      continue;
    }
    current += ch;
    hasToken = true;
  }

  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

function resolveVariableValue(expr: string, vars: ReadonlyMap<string, string>): string {
  const key = expr.trim();
  if (key === 'shell id -u') {
    return String(typeof process.getuid === 'function' ? process.getuid() : 1000);
  }
  if (key === 'shell id -g') {
    return String(typeof process.getgid === 'function' ? process.getgid() : 1000);
  }
  return vars.get(key) ?? '';
}

/**
 * Expande variables $(VAR), ${VAR} y escapes $$ de GNU Make en O(n).
 */
export function expandMakefileVariables(raw: string, vars: ReadonlyMap<string, string>): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '$' || i + 1 >= raw.length) {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === '$') {
      out += '$';
      i += 1;
      continue;
    }
    if (next === '(' || next === '{') {
      const closeChar = next === '(' ? ')' : '}';
      const closeIdx = raw.indexOf(closeChar, i + 2);
      if (closeIdx !== -1) {
        out += resolveVariableValue(raw.slice(i + 2, closeIdx), vars);
        i = closeIdx;
        continue;
      }
    }
    out += raw[i];
  }
  return out;
}

function parseVariableAssignment(trimmed: string, vars: Map<string, string>): boolean {
  const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(\?=|:=|=)\s*(.*)$/.exec(cleaned);
  if (!match) {
    return false;
  }
  const [, name, op, rawVal] = match;
  if (op === '?=' && vars.has(name)) {
    return true;
  }
  vars.set(name, expandMakefileVariables(rawVal.trim(), vars));
  return true;
}

function parseRuleLine(trimmed: string, parsed: ParsedMakefile): string | null {
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx <= 0 || trimmed[colonIdx + 1] === '=') {
    return null;
  }
  const ruleName = trimmed.slice(0, colonIdx).trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(ruleName) || ruleName.startsWith('.')) {
    return null;
  }
  const depsPart = trimmed.slice(colonIdx + 1).split('#')[0].split(';')[0].trim();
  const deps = depsPart ? depsPart.split(/\s+/).filter(Boolean) : [];
  parsed.rules.set(ruleName, deps);
  if (!parsed.recipes.has(ruleName)) {
    parsed.recipes.set(ruleName, []);
  }
  return ruleName;
}

function parseMakefile(makefileContent: string, resolvedPath: string): ParsedMakefile {
  const parsed: ParsedMakefile = {
    vars: new Map<string, string>([['CURDIR', resolvedPath]]),
    rules: new Map<string, string[]>(),
    recipes: new Map<string, string[]>(),
  };
  const joined = makefileContent.replace(/\\\r?\n[ \t]*/g, ' ');
  let currentTarget: string | null = null;

  for (const line of joined.split(/\r?\n/)) {
    if (line.startsWith('\t')) {
      if (currentTarget) {
        parsed.recipes.get(currentTarget)?.push(line.slice(1));
      }
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    currentTarget = parseVariableAssignment(trimmed, parsed.vars)
      ? null
      : parseRuleLine(trimmed, parsed);
  }

  return parsed;
}

function isBannerCommand(expanded: string): boolean {
  return expanded.startsWith('echo ') || expanded === 'echo' || expanded.startsWith('printf ');
}

function isAllowedDockerRecipe(expanded: string): boolean {
  return expanded.startsWith('docker compose ') || expanded.startsWith('docker run ');
}

function appendTargetRecipeCommands(
  rawLines: readonly string[],
  vars: ReadonlyMap<string, string>,
  commands: string[][]
): string | null {
  for (const rawLine of rawLines) {
    const stripped = rawLine.trim().replace(/^[@+-]+/, '').trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    const expanded = expandMakefileVariables(stripped, vars).trim();
    if (!expanded || isBannerCommand(expanded)) {
      continue;
    }
    if (!isAllowedDockerRecipe(expanded)) {
      return `Receta bloqueada por Regla Cero en fallback sin make (solo se permiten comandos 'docker compose' o 'docker run'): ${expanded}`;
    }
    commands.push(tokenizeCommandArgs(expanded).slice(1));
  }
  return null;
}

function collectTargetCommands(
  targetName: string,
  parsed: ParsedMakefile,
  visited: Set<string>,
  active: Set<string>,
  commands: string[][]
): string | null {
  if (active.has(targetName)) {
    return `Dependencia circular en Makefile al resolver '${targetName}'.`;
  }
  if (visited.has(targetName)) {
    return null;
  }
  const deps = parsed.rules.get(targetName);
  if (!deps) {
    return `Target '${targetName}' no definido en Makefile.`;
  }

  active.add(targetName);
  for (const dep of deps) {
    const depError = collectTargetCommands(dep, parsed, visited, active, commands);
    if (depError) {
      return depError;
    }
  }

  const recipeError = appendTargetRecipeCommands(
    parsed.recipes.get(targetName) ?? [],
    parsed.vars,
    commands
  );
  if (recipeError) {
    return recipeError;
  }

  active.delete(targetName);
  visited.add(targetName);
  return null;
}

/**
 * Extrae recetas Docker seguras de un Makefile cuando GNU make no está disponible en el host.
 * Aplica guardia Fail-Closed de Regla Cero: rechaza cualquier receta no basada en Docker.
 */
export function resolveMakefileDockerRecipes(
  makefileContent: string,
  target: string,
  resolvedPath: string
): RecipeResolutionResult {
  const parsed = parseMakefile(makefileContent, resolvedPath);
  const commands: string[][] = [];
  const errorReason = collectTargetCommands(target, parsed, new Set(), new Set(), commands);
  if (errorReason) {
    return { ok: false, reason: errorReason };
  }
  if (commands.length === 0) {
    return { ok: false, reason: `El target '${target}' no contiene comandos Docker ejecutables.` };
  }
  return { ok: true, commands };
}

function parseTwoSpaceServiceName(line: string): string | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx <= 2 || !line.startsWith('  ') || line.startsWith('   ')) {
    return null;
  }
  const candidate = line.slice(2, colonIdx);
  const rest = line.slice(colonIdx + 1).trim();
  if (/^[A-Za-z0-9_-]+$/.test(candidate) && (!rest || rest.startsWith('#'))) {
    return candidate;
  }
  return null;
}

function extractComposeServices(composeContent: string): string[] {
  const services: string[] = [];
  let inServices = false;
  for (const line of composeContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed === 'services:') {
      inServices = true;
      continue;
    }
    if (!inServices) {
      continue;
    }
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }
    const svc = parseTwoSpaceServiceName(line);
    if (svc) {
      services.push(svc);
    }
  }
  return services;
}

/**
 * Fallback directo sobre docker-compose.qa.yml para proyectos sin Makefile o sin el target buscado.
 */
export function resolveComposeDirectFallback(
  resolvedPath: string,
  stage: string
): string[][] | null {
  const composePath = path.join(resolvedPath, COMPOSE_QA_FILE);
  if (!fs.existsSync(composePath)) {
    return null;
  }
  const services = extractComposeServices(fs.readFileSync(composePath, 'utf8'));
  if (stage === 'bdd' && services.includes('karatelabs')) {
    return [
      ['compose', '-f', COMPOSE_QA_FILE, 'run', '--rm', '-T', 'karatelabs', 'mvn', '-B', 'clean', 'test'],
    ];
  }
  const primaryService =
    PREFERRED_QA_SERVICES.find((svc) => services.includes(svc)) ??
    services.find((svc) => svc.startsWith('qa-'));
  if (
    primaryService &&
    COMPOSER_STAGE_SET.has(stage) &&
    fs.existsSync(path.join(resolvedPath, 'composer.json'))
  ) {
    return [
      [
        'compose',
        '-f',
        COMPOSE_QA_FILE,
        'run',
        '--rm',
        '-T',
        primaryService,
        'composer',
        'run-script',
        `qa:${stage}`,
      ],
    ];
  }
  return null;
}

function execCommand(
  executor: typeof execFile,
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<ExecCommandOutcome> {
  return new Promise((resolve) => {
    executor(
      binary,
      args,
      {
        cwd,
        timeout: timeoutMs,
        shell: false,
        maxBuffer: MAX_EXEC_BUFFER_BYTES,
      },
      (error, stdout, stderr) => {
        const stdoutStr = stdout ? stdout.toString() : '';
        const stderrStr = stderr ? stderr.toString() : '';
        if (!error) {
          resolve({ exitCode: 0, stdout: stdoutStr, stderr: stderrStr, errorMessage: '' });
          return;
        }
        const errWithCode = error as NodeJS.ErrnoException & {
          code?: number | string;
          killed?: boolean;
          signal?: string;
        };
        let exitCode = 1;
        if (typeof errWithCode.code === 'number') {
          exitCode = errWithCode.code;
        } else if (errWithCode.killed || errWithCode.signal === 'SIGTERM') {
          exitCode = 124;
        }
        resolve({
          exitCode,
          errorCode: typeof errWithCode.code === 'string' ? errWithCode.code : undefined,
          stdout: stdoutStr,
          stderr: stderrStr,
          errorMessage: error.message,
        });
      }
    );
  });
}

async function executeDockerFallbackSequence(
  executor: typeof execFile,
  commands: string[][],
  resolvedPath: string,
  stage: string,
  timeoutSeconds: number,
  startTime: number,
  execFileSyncFn?: typeof execFileSync
): Promise<QaExecutionResult> {
  const timeoutMs = timeoutSeconds * 1000;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let lastExitCode = 0;

  for (const args of commands) {
    const res = await execCommand(executor, DOCKER_BINARY, args, resolvedPath, timeoutMs);
    if (res.stdout) {
      stdoutChunks.push(res.stdout);
    }
    const errChunk = res.stderr || (res.exitCode !== 0 ? res.errorMessage : '');
    if (errChunk) {
      stderrChunks.push(errChunk);
    }
    if (res.exitCode !== 0) {
      lastExitCode = res.exitCode;
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(
    stdoutChunks.join('\n'),
    stderrChunks.join('\n'),
    stage,
    durationMs,
    lastExitCode
  );
  if (lastExitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución fallback en Docker de 'qa-${stage}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  } else {
    parsed.tail_log = `[Fallback Rule Zero sin GNU make -> docker] ${parsed.tail_log}`.trim();
  }
  recordQaStageEvidence(resolvedPath, stage, parsed.status, execFileSyncFn);
  return parsed;
}

async function runMissingMakefileFallback(
  executor: typeof execFile,
  resolvedPath: string,
  stage: string,
  timeoutSeconds: number,
  startTime: number,
  execFileSyncFn?: typeof execFileSync
): Promise<QaExecutionResult> {
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence(
      executor,
      directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn
    );
  }
  const composeExists = fs.existsSync(path.join(resolvedPath, COMPOSE_QA_FILE));
  const msg = composeExists
    ? `No existe Makefile y el stage '${stage}' no tiene mapeo directo seguro en ${COMPOSE_QA_FILE}.`
    : `No se encontró archivo Makefile en ${resolvedPath}.`;
  const tail = composeExists
    ? msg
    : `Error: Makefile inexistente en el directorio destino: ${resolvedPath}`;
  const failed = buildStructuredFailureResult(stage, `make qa-${stage}`, msg, tail);
  if (composeExists) {
    recordQaStageEvidence(resolvedPath, stage, failed.status, execFileSyncFn);
  }
  return failed;
}

async function runMakeEnoentFallback(
  executor: typeof execFile,
  makefilePath: string,
  resolvedPath: string,
  stage: string,
  timeoutSeconds: number,
  startTime: number,
  execFileSyncFn?: typeof execFileSync
): Promise<QaExecutionResult> {
  const makefileContent = fs.readFileSync(makefilePath, 'utf8');
  const recipeResolution = resolveMakefileDockerRecipes(makefileContent, `qa-${stage}`, resolvedPath);
  if (recipeResolution.ok) {
    return executeDockerFallbackSequence(
      executor,
      recipeResolution.commands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn
    );
  }
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence(
      executor,
      directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn
    );
  }
  const failReason = `GNU make no disponible en el host (ENOENT) y fallback Rule Zero rechazado: ${recipeResolution.reason}`;
  const failed = buildStructuredFailureResult(
    stage,
    `make qa-${stage}`,
    failReason,
    failReason,
    Date.now() - startTime
  );
  recordQaStageEvidence(resolvedPath, stage, failed.status, execFileSyncFn);
  return failed;
}

/**
 * Determina si el árbol de trabajo Git contiene exclusivamente cambios en documentación
 * (*.md o archivos documentales dentro de docs/). Si no hay cambios o hay al menos 1 archivo de código,
 * configuración o prueba modificado, devuelve false.
 */
export function isDocsOnlyWorkspaceChange(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): boolean {
  try {
    const raw = execFileSyncFn('git', ['status', '--porcelain'], {
      cwd: path.resolve(projectPath),
      encoding: 'utf8',
    });
    const lines = String(raw)
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      return false;
    }

    const filePaths = lines.flatMap((line) => extractPathsFromPorcelainLine(line));

    return filePaths.length > 0 && filePaths.every((fp) => isDocFilePath(fp));
  } catch {
    return false;
  }
}

/**
 * Tool 7: run_ephemeral_qa
 * Ejecuta de forma segura e inyectable un target de pruebas del Makefile
 * dentro de contenedores Docker efímeros (Rule Zero) y resume la salida
 * mediante los parsers ahorradores de tokens. Soporta Fast-Path Documental (skipIfDocsOnly)
 * y fallback seguro a Docker Compose cuando GNU make no está disponible (ENOENT).
 */
export async function runEphemeralQa(
  projectPath: string,
  stage: string,
  timeoutSeconds = 300,
  options?: RunEphemeralQaOptions
): Promise<QaExecutionResult> {
  const resolvedPath = path.resolve(projectPath);

  if (options?.skipIfDocsOnly && isDocsOnlyWorkspaceChange(resolvedPath, options.execFileSyncFn)) {
    return {
      status: 'SKIPPED',
      stage,
      exit_code: 0,
      duration_ms: 0,
      coverage: {
        detected: false,
        percent: 0,
        threshold: 95.0,
        passed: false,
        uncovered_files: [],
      },
      failed_tests: [],
      linter_and_complexity_issues: [],
      security_alerts: { critical: 0, high: 0 },
      mutation_summary: null,
      tail_log: `✔ [Fast-Path Docs-Only] Solo se detectaron cambios en documentación (*.md / docs/); se omite 'make qa-${stage}' en Docker.`,
    };
  }

  const makefilePath = path.join(resolvedPath, 'Makefile');
  const executor = options?.execFileFn || execFile;
  const target = `qa-${stage}`;
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  if (!fs.existsSync(makefilePath)) {
    return runMissingMakefileFallback(
      executor,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      options?.execFileSyncFn
    );
  }

  const makeRes = await execCommand(executor, MAKE_BINARY, [target], resolvedPath, timeoutMs);
  if (makeRes.errorCode === 'ENOENT') {
    return runMakeEnoentFallback(
      executor,
      makefilePath,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      options?.execFileSyncFn
    );
  }

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(makeRes.stdout, makeRes.stderr, stage, durationMs, makeRes.exitCode);
  if (makeRes.exitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución de 'make ${target}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  }
  recordQaStageEvidence(resolvedPath, stage, parsed.status, options?.execFileSyncFn);
  return parsed;
}
