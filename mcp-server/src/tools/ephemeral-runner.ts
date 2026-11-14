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
const MAX_MAKE_DELEGATION_DEPTH = 3;
const PREFERRED_QA_SERVICES = [
  'qa-php',
  'qa-backend',
  'qa-fastapi',
  'qa-node',
  'qa-vue3',
  'qa-frontend',
  'qa-python',
  'qa-bash',
];
const COMPOSER_STAGE_SET = new Set(['lint', 'unit', 'mutation', 'sbom']);
const MAKE_NOOP_FLAGS = new Set(['-s', '--silent', '--no-print-directory']);
const SHELL_CHAIN_TOKENS = new Set(['&&', '||', ';', '|']);

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
    vars: new Map<string, string>([
      ['CURDIR', resolvedPath],
      ['MAKE', MAKE_BINARY],
    ]),
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

interface MakeResolutionContext {
  rootDir: string;
  currentDir: string;
  depth: number;
}

function isBannerCommand(expanded: string): boolean {
  return expanded.startsWith('echo ') || expanded === 'echo' || expanded.startsWith('printf ');
}

function isAllowedDockerRecipe(expanded: string): boolean {
  return expanded.startsWith('docker compose ') || expanded.startsWith('docker run ');
}

interface MakeDelegationState {
  subdir: string | null;
  targets: string[];
}

function consumeMakeDelegationToken(
  tokens: readonly string[],
  idx: number,
  state: MakeDelegationState
): number | null {
  const tok = tokens[idx];
  if (SHELL_CHAIN_TOKENS.has(tok)) return null;
  if (MAKE_NOOP_FLAGS.has(tok)) return idx;
  if (tok === '-C' || tok === '--directory') {
    const next = tokens[idx + 1];
    if (!next) return null;
    state.subdir = next;
    return idx + 1;
  }
  if (tok.startsWith('--directory=')) {
    state.subdir = tok.slice('--directory='.length);
    return idx;
  }
  if (tok.startsWith('-') || !/^[A-Za-z0-9_.-]+$/.test(tok)) return null;
  state.targets.push(tok);
  return idx;
}

function parseMakeDelegation(
  expanded: string
): { subdir: string; targets: string[] } | null {
  const tokens = tokenizeCommandArgs(expanded);
  if (tokens.length < 3 || tokens[0] !== MAKE_BINARY) {
    return null;
  }
  const state: MakeDelegationState = { subdir: null, targets: [] };
  for (let i = 1; i < tokens.length; i += 1) {
    const nextIdx = consumeMakeDelegationToken(tokens, i, state);
    if (nextIdx === null) return null;
    i = nextIdx;
  }
  return state.subdir && state.targets.length > 0
    ? { subdir: state.subdir, targets: state.targets }
    : null;
}

function rewriteDelegatedComposeArgs(args: string[], relSubdirPosix: string): string[] {
  if (!relSubdirPosix || relSubdirPosix === '.' || args[0] !== 'compose') {
    return args;
  }
  const rewritten = [...args];
  for (let i = 1; i < rewritten.length - 1; i += 1) {
    if (rewritten[i] === '-f' || rewritten[i] === '--file') {
      const val = rewritten[i + 1];
      if (!path.isAbsolute(val) && !val.startsWith(`${relSubdirPosix}/`)) {
        rewritten[i + 1] = path.posix.join(relSubdirPosix, val.replace(/\\/g, '/'));
      }
      i += 1;
    }
  }
  if (!rewritten.includes('--project-directory')) {
    rewritten.splice(1, 0, '--project-directory', relSubdirPosix);
  }
  return rewritten;
}

function resolveDelegatedMakeRecipe(
  delegation: { subdir: string; targets: string[] },
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  if (ctx.depth >= MAX_MAKE_DELEGATION_DEPTH) {
    return 'Profundidad máxima de delegación $(MAKE) -C excedida.';
  }
  const targetDir = path.resolve(ctx.currentDir, delegation.subdir);
  const insideRoot =
    targetDir === ctx.rootDir || targetDir.startsWith(`${ctx.rootDir}${path.sep}`);
  if (!insideRoot) {
    return `Delegación $(MAKE) -C fuera del directorio raíz bloqueada por seguridad: ${delegation.subdir}`;
  }
  if (targetDir === ctx.currentDir) {
    return `Delegación circular $(MAKE) -C sobre el mismo directorio: ${delegation.subdir}`;
  }
  const subMakefilePath = path.join(targetDir, 'Makefile');
  if (!fs.existsSync(subMakefilePath)) {
    return `No existe Makefile en subdirectorio '${delegation.subdir}'.`;
  }
  const subContent = fs.readFileSync(subMakefilePath, 'utf8');
  const relSubdirPosix = path.relative(ctx.rootDir, targetDir).split(path.sep).join('/');
  for (const subTarget of delegation.targets) {
    const subRes = resolveMakefileDockerRecipes(
      subContent,
      subTarget,
      targetDir,
      ctx.rootDir,
      ctx.depth + 1
    );
    if (!subRes.ok) {
      return subRes.reason;
    }
    for (const cmd of subRes.commands) {
      commands.push(rewriteDelegatedComposeArgs(cmd, relSubdirPosix));
    }
  }
  return null;
}

function appendTargetRecipeCommands(
  rawLines: readonly string[],
  vars: ReadonlyMap<string, string>,
  ctx: MakeResolutionContext,
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
    if (isAllowedDockerRecipe(expanded)) {
      commands.push(tokenizeCommandArgs(expanded).slice(1));
      continue;
    }
    const delegation = parseMakeDelegation(expanded);
    if (delegation) {
      const delErr = resolveDelegatedMakeRecipe(delegation, ctx, commands);
      if (delErr) return delErr;
      continue;
    }
    return `Receta bloqueada por Regla Cero en fallback sin make (solo se permiten comandos 'docker compose', 'docker run' o '$(MAKE) -C'): ${expanded}`;
  }
  return null;
}

function collectTargetCommands(
  targetName: string,
  parsed: ParsedMakefile,
  visited: Set<string>,
  active: Set<string>,
  ctx: MakeResolutionContext,
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
    const depError = collectTargetCommands(dep, parsed, visited, active, ctx, commands);
    if (depError) {
      return depError;
    }
  }

  const recipeError = appendTargetRecipeCommands(
    parsed.recipes.get(targetName) ?? [],
    parsed.vars,
    ctx,
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
  resolvedPath: string,
  rootDir?: string,
  depth = 0
): RecipeResolutionResult {
  const currentDir = path.resolve(resolvedPath);
  const parsed = parseMakefile(makefileContent, currentDir);
  const commands: string[][] = [];
  const ctx: MakeResolutionContext = {
    rootDir: rootDir ? path.resolve(rootDir) : currentDir,
    currentDir,
    depth,
  };
  const errorReason = collectTargetCommands(
    target,
    parsed,
    new Set(),
    new Set(),
    ctx,
    commands
  );
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

function resolveHostUidGid(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
  return `${uid}:${gid}`;
}

function buildComposeRunPrefix(
  service: string,
  uidGid: string,
  extraEnv: readonly string[] = []
): string[] {
  const args = [
    'compose',
    '-f',
    COMPOSE_QA_FILE,
    'run',
    '--rm',
    '-T',
    '-u',
    uidGid,
    '-e',
    'HOME=/tmp',
  ];
  for (const envPair of extraEnv) {
    args.push('-e', envPair);
  }
  args.push(service);
  return args;
}

function readPackageScripts(resolvedPath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(resolvedPath, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    if (!parsed.scripts || typeof parsed.scripts !== 'object' || Array.isArray(parsed.scripts)) {
      return {};
    }
    return parsed.scripts as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveUiE2eDirectCommands(
  stage: string,
  services: readonly string[],
  hasPkgJson: boolean,
  uidGid: string
): string[][] | null {
  if (!hasPkgJson || !services.includes('ui-e2e')) {
    return null;
  }
  if (stage === 'e2e') {
    const cmd =
      'if [ -x ./node_modules/.bin/playwright ]; then ./node_modules/.bin/playwright test; ' +
      'elif command -v pnpm >/dev/null 2>&1; then pnpm exec playwright test; ' +
      'else corepack pnpm exec playwright test; fi';
    return [[...buildComposeRunPrefix('ui-e2e', uidGid), 'bash', '-c', cmd]];
  }
  if (stage === 'perf') {
    const cmd =
      'export CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -n 1) && ' +
      'if [ -x ./node_modules/.bin/lhci ]; then ./node_modules/.bin/lhci autorun --config=lighthouserc.cjs; ' +
      'elif command -v pnpm >/dev/null 2>&1; then pnpm run test:perf; ' +
      'else corepack pnpm run test:perf; fi';
    return [[...buildComposeRunPrefix('ui-e2e', uidGid), 'bash', '-c', cmd]];
  }
  return null;
}

function resolveNodeDirectCommands(
  resolvedPath: string,
  primaryService: string,
  stage: string,
  uidGid: string
): string[][] | null {
  const scripts = readPackageScripts(resolvedPath);
  if (stage === 'lint') {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', 'lint']];
  }
  if (stage === 'unit') {
    const unitScript =
      ['test:coverage', 'test:unit', 'test'].find((name) => Boolean(scripts[name])) ?? 'test:unit';
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', unitScript]];
  }
  if (stage === 'mutation' && scripts.mutate) {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'pnpm', 'run', 'mutate']];
  }
  return null;
}

function resolvePythonDirectCommands(
  resolvedPath: string,
  primaryService: string,
  stage: string,
  uidGid: string
): string[][] | null {
  if (stage === 'lint') {
    return [
      [
        ...buildComposeRunPrefix(primaryService, uidGid, ['RUFF_CACHE_DIR=/tmp/ruff-cache']),
        'sh',
        '-c',
        'ruff check src tests && mypy --strict --cache-dir=/tmp/mypy src',
      ],
    ];
  }
  if (stage === 'unit') {
    return [
      [
        ...buildComposeRunPrefix(primaryService, uidGid, ['COVERAGE_FILE=/tmp/.coverage']),
        'pytest',
        '-o',
        'cache_dir=/tmp/pytest-cache',
        '--import-mode=importlib',
        '--cov=src',
        '--cov-fail-under=95',
      ],
    ];
  }
  if (stage === 'migration' && fs.existsSync(path.join(resolvedPath, 'alembic.ini'))) {
    return [[...buildComposeRunPrefix(primaryService, uidGid), 'alembic', 'upgrade', 'head']];
  }
  return null;
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
  const hasComposer = fs.existsSync(path.join(resolvedPath, 'composer.json'));
  const hasPkgJson = fs.existsSync(path.join(resolvedPath, 'package.json'));
  const hasPyManifest =
    fs.existsSync(path.join(resolvedPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(resolvedPath, 'requirements.txt'));
  const uidGid = resolveHostUidGid();

  const e2eCmds = resolveUiE2eDirectCommands(stage, services, hasPkgJson, uidGid);
  if (e2eCmds) {
    return e2eCmds;
  }

  const primaryService =
    PREFERRED_QA_SERVICES.find((svc) => services.includes(svc)) ??
    services.find((svc) => svc.startsWith('qa-'));
  if (!primaryService) {
    return null;
  }
  if (COMPOSER_STAGE_SET.has(stage) && hasComposer) {
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
  if (hasPkgJson && !hasComposer) {
    return resolveNodeDirectCommands(resolvedPath, primaryService, stage, uidGid);
  }
  if (hasPyManifest) {
    return resolvePythonDirectCommands(resolvedPath, primaryService, stage, uidGid);
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
