// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { parseQaOutput } from '../parsers/output-parsers.js';
import {
  DEFAULT_BREAKER_MAX_STREAK,
  EXIT_BREAKER_42,
  extractPathsFromPorcelainLine,
  isDocFilePath,
  isEphemeralQaArtifactPath,
  RawFindingInput,
  recordQaStageEvidence,
  recordQaStageFindingsState,
} from '../services/qa-evidence.js';
import { QaExecutionResult } from '../types.js';
import {
  formatFailVerboseReport,
  hasComplexityOrSignatureViolation,
  pickAt,
  reportDebugCatchError,
  TACTICAL_PATTERNS_DIRECTIVE_11X,
} from '../utils/diagnosticFormatter.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { recordStageCmdCheckpoint } from './sessionFlightRecorder.js';

const MAX_EXEC_BUFFER_BYTES = 20 * 1024 * 1024;
const COMPOSE_QA_FILE = 'docker-compose.qa.yml';
const DOCKER_BINARY = 'docker';
const MAKE_BINARY = 'make';
const STATUS_FAILED = 'FAILED' as const;
const BREAKER_REMEDIATION =
  'BREAKER-42 ACTIVADO: Detén ediciones a ciegas, consulta inspect_ast_blast_radius(changed_since_ref) y aplica las 4 fases de qa-11x-systematic-debugging (--reset-state requiere intervención humana).';
const MAX_MAKE_DELEGATION_DEPTH = 3;
const PREFERRED_QA_SERVICES = [
  'qa-php',
  'qa-backend',
  'qa-fastapi',
  'qa-node',
  'qa-vue3',
  'qa-frontend',
  'qa-mobile',
  'qa-python',
  'qa-bash',
];
const COMPOSER_STAGE_SET = new Set(['lint', 'unit', 'mutation', 'sbom']);
const COVERAGE_STAGE_SET = new Set(['unit', 'ci', 'all']);
const MAKE_NOOP_FLAGS = new Set(['-s', '--silent', '--no-print-directory']);
const SHELL_CHAIN_TOKENS = new Set(['&&', '||', ';', '|']);
const COBERTURA_XML_NAME = 'coverage.xml';
const DIRECT_COBERTURA_NAME = 'cobertura.xml';
const LCOV_INFO_NAME = 'lcov.info';
const MONOREPO_COVERAGE_SUBDIRS = [
  'fastapi',
  'python',
  'php',
  'bash-scripts',
  'mobile-appium',
  'backend',
  'mcp-server',
  'node-backend',
  'vue3',
  'react-frontend',
  'frontend',
] as const;

interface CoverageHarvestCandidate {
  srcRel: string;
  destName: string;
  rewriteSubDir?: string;
}

const ROOT_COVERAGE_CANDIDATES: readonly CoverageHarvestCandidate[] = [
  { srcRel: COBERTURA_XML_NAME, destName: DIRECT_COBERTURA_NAME },
  { srcRel: path.join('coverage', 'cobertura-coverage.xml'), destName: 'node-cobertura.xml' },
  { srcRel: path.join('build', 'logs', DIRECT_COBERTURA_NAME), destName: 'php.xml' },
  { srcRel: path.join('coverage', 'clover.xml'), destName: 'php.xml' },
  { srcRel: path.join('coverage_report', 'kcov-merged', DIRECT_COBERTURA_NAME), destName: 'bash.xml' },
  { srcRel: path.join('coverage_report', DIRECT_COBERTURA_NAME), destName: 'bash.xml' },
  { srcRel: path.join('coverage', LCOV_INFO_NAME), destName: LCOV_INFO_NAME },
];

export function ensureCoverageCacheDir(resolvedPath: string): string {
  const cacheRoot = path.join(resolvedPath, '.agents', '.cache');
  const coverageDir = path.join(cacheRoot, 'coverage');
  fs.mkdirSync(coverageDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(cacheRoot, 0o700);
  fs.chmodSync(coverageDir, 0o700);
  return coverageDir;
}

function prepareCoverageCacheForStage(resolvedPath: string, stage: string): void {
  if (COVERAGE_STAGE_SET.has(stage)) {
    ensureCoverageCacheDir(resolvedPath);
  }
}

function harvestCoverageForStage(resolvedPath: string, stage: string): void {
  if (COVERAGE_STAGE_SET.has(stage)) {
    harvestCoverageReports(resolvedPath);
  }
}

function buildCoverageCandidates(): CoverageHarvestCandidate[] {
  const subdirCandidates = MONOREPO_COVERAGE_SUBDIRS.flatMap((subDir) => [
    { srcRel: path.join(subDir, COBERTURA_XML_NAME), destName: `${subDir}.xml` },
    {
      srcRel: path.join(subDir, 'coverage', LCOV_INFO_NAME),
      destName: `${subDir}.info`,
      rewriteSubDir: subDir,
    },
  ]);
  return [...ROOT_COVERAGE_CANDIDATES, ...subdirCandidates];
}

function readContainedCoverageFile(rootReal: string, candidatePath: string): string | null {
  if (!fs.existsSync(candidatePath)) {
    return null;
  }
  const realSource = fs.realpathSync(candidatePath);
  if (!realSource.startsWith(`${rootReal}${path.sep}`)) {
    return null;
  }
  if (!fs.statSync(realSource).isFile()) {
    return null;
  }
  return fs.readFileSync(realSource, 'utf8');
}

function rewriteLcovSubdirPrefix(content: string, subDir?: string): string {
  if (!subDir) {
    return content;
  }
  return content
    .replace(/^SF:\/(?:app|workspace)\//gm, `SF:${subDir}/`)
    .replace(/^SF:src\//gm, `SF:${subDir}/src/`);
}

export function harvestCoverageReports(resolvedPath: string): string[] {
  if (!fs.existsSync(resolvedPath)) {
    return [];
  }
  const coverageDir = ensureCoverageCacheDir(resolvedPath);
  const rootReal = fs.realpathSync(resolvedPath);
  const harvested: string[] = [];
  const seenDest = new Set<string>();
  for (const item of buildCoverageCandidates()) {
    if (seenDest.has(item.destName)) {
      continue;
    }
    const raw = readContainedCoverageFile(rootReal, path.join(resolvedPath, item.srcRel));
    if (raw === null) {
      continue;
    }
    const destPath = path.join(coverageDir, item.destName);
    fs.writeFileSync(destPath, rewriteLcovSubdirPrefix(raw, item.rewriteSubDir), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.chmodSync(destPath, 0o600);
    seenDest.add(item.destName);
    harvested.push(destPath);
  }
  return harvested;
}

export interface RunEphemeralQaOptions {
  execFileFn?: typeof execFile;
  execFileSyncFn?: typeof execFileSync;
  skipIfDocsOnly?: boolean;
  signal?: AbortSignal;
}

interface ParsedTarget {
  deps: string[];
  recipes: string[];
}

interface ParsedMakefile {
  vars: Map<string, string>;
  targets: Map<string, ParsedTarget>;
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

interface StructuredFailureInput {
  readonly stage: string;
  readonly testName: string;
  readonly errorSummary: string;
  readonly tailLog: string;
  readonly durationMs?: number;
}

function buildStructuredFailureResult(input: StructuredFailureInput): QaExecutionResult {
  const { stage, testName, errorSummary, tailLog, durationMs = 0 } = input;
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

  let i = 0;
  while (i < commandLine.length) {
    const ch = commandLine[i];
    if (ch === ' ' || ch === '\t') {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const seg =
        ch === "'"
          ? readSingleQuotedToken(commandLine, i)
          : readDoubleQuotedToken(commandLine, i);
      current += seg.value;
      i = seg.nextIndex + 1;
      hasToken = true;
      continue;
    }
    current += ch;
    hasToken = true;
    i += 1;
  }

  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

function resolvePosixNumericId(kind: 'uid' | 'gid'): number {
  const fn = kind === 'uid' ? process.getuid : process.getgid;
  return typeof fn === 'function' ? fn.call(process) : 1000;
}

function resolveVariableValue(expr: string, vars: ReadonlyMap<string, string>): string {
  const key = expr.trim();
  if (key === 'shell id -u') {
    return String(resolvePosixNumericId('uid'));
  }
  if (key === 'shell id -g') {
    return String(resolvePosixNumericId('gid'));
  }
  return vars.get(key) ?? '';
}

/**
 * Expande variables $(VAR), ${VAR} y escapes $$ de GNU Make en O(n).
 */
export function expandMakefileVariables(raw: string, vars: ReadonlyMap<string, string>): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = pickAt(raw, i);
    if (ch !== '$' || i + 1 >= raw.length) {
      out += ch;
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === '$') {
      out += '$';
      i += 2;
      continue;
    }
    if (next === '(' || next === '{') {
      const closeChar = next === '(' ? ')' : '}';
      const closeIdx = raw.indexOf(closeChar, i + 2);
      if (closeIdx !== -1) {
        out += resolveVariableValue(raw.slice(i + 2, closeIdx), vars);
        i = closeIdx + 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

function parseVariableAssignment(trimmed: string, vars: Map<string, string>): boolean {
  const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const eqIdx = cleaned.indexOf('=');
  if (eqIdx <= 0) {
    return false;
  }
  const prevChar = cleaned[eqIdx - 1];
  const hasCompoundOp = prevChar === '?' || prevChar === ':';
  const op = hasCompoundOp ? `${prevChar}=` : '=';
  const name = cleaned.slice(0, hasCompoundOp ? eqIdx - 1 : eqIdx).trim();
  const rawVal = cleaned.slice(eqIdx + 1);
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return false;
  }
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
  const withoutComment = pickAt(trimmed.slice(colonIdx + 1).split('#'), 0);
  const depsPart = pickAt(withoutComment.split(';'), 0).trim();
  const deps = depsPart ? depsPart.split(/\s+/).filter(Boolean) : [];
  const existing = parsed.targets.get(ruleName);
  if (existing) {
    existing.deps = deps;
  } else {
    parsed.targets.set(ruleName, { deps, recipes: [] });
  }
  return ruleName;
}

function parseMakefile(makefileContent: string, resolvedPath: string): ParsedMakefile {
  const parsed: ParsedMakefile = {
    vars: new Map<string, string>([
      ['CURDIR', resolvedPath],
      ['MAKE', MAKE_BINARY],
    ]),
    targets: new Map<string, ParsedTarget>(),
  };
  const joined = makefileContent.replace(/\\\r?\n[ \t]*/g, ' ');
  let currentTarget: string | null = null;

  for (const line of joined.split(/\r?\n/)) {
    if (line.startsWith('\t')) {
      if (currentTarget) {
        parsed.targets.get(currentTarget)?.recipes.push(line.slice(1));
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
  const tok = pickAt(tokens, idx);
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
  let i = 1;
  while (i < tokens.length) {
    const nextIdx = consumeMakeDelegationToken(tokens, i, state);
    if (nextIdx === null) return null;
    i = nextIdx + 1;
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
  let i = 1;
  while (i < rewritten.length - 1) {
    const flag = rewritten[i];
    if (flag === '-f' || flag === '--file') {
      const val = rewritten[i + 1];
      if (val && !path.isAbsolute(val) && !val.startsWith(`${relSubdirPosix}/`)) {
        rewritten[i + 1] = path.posix.join(relSubdirPosix, val.replace(/\\/g, '/'));
      }
      i += 2;
      continue;
    }
    i += 1;
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
  const realRoot = fs.realpathSync(ctx.rootDir);
  let resolvedTarget = targetDir;
  if (fs.existsSync(targetDir)) {
    resolvedTarget = fs.realpathSync(targetDir);
  }
  const insideRoot =
    resolvedTarget === realRoot || resolvedTarget.startsWith(`${realRoot}${path.sep}`);
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
    const subRes = resolveMakefileDockerRecipes(subContent, subTarget, targetDir, {
      rootDir: ctx.rootDir,
      depth: ctx.depth + 1,
    });
    if (!subRes.ok) {
      return subRes.reason;
    }
    for (const cmd of subRes.commands) {
      commands.push(rewriteDelegatedComposeArgs(cmd, relSubdirPosix));
    }
  }
  return null;
}

function scanDoubleQuotedForSubshell(
  src: string,
  start: number
): { found: boolean; nextIndex: number } {
  for (let i = start + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') {
      return { found: false, nextIndex: i };
    }
    if (ch === '`' || (ch === '$' && src[i + 1] === '(')) {
      return { found: true, nextIndex: i };
    }
  }
  return { found: false, nextIndex: src.length - 1 };
}

function isUnquotedShellToken(src: string, idx: number): boolean {
  const ch = src[idx];
  return (
    ch === ';' ||
    ch === '|' ||
    ch === '>' ||
    ch === '<' ||
    ch === '`' ||
    (ch === '&' && src[idx + 1] === '&') ||
    (ch === '$' && src[idx + 1] === '(')
  );
}

/**
 * Detecta operadores de encadenamiento/redirección fuera de comillas o subshells no expandidos.
 */
export function hasUnquotedShellSyntax(commandLine: string): boolean {
  let i = 0;
  while (i < commandLine.length) {
    const ch = commandLine[i];
    if (ch === "'") {
      i = readSingleQuotedToken(commandLine, i).nextIndex + 1;
      continue;
    }
    if (ch === '"') {
      const scan = scanDoubleQuotedForSubshell(commandLine, i);
      if (scan.found) return true;
      i = scan.nextIndex + 1;
      continue;
    }
    if (isUnquotedShellToken(commandLine, i)) {
      return true;
    }
    i += 1;
  }
  return false;
}

function appendSingleRecipeLine(
  rawLine: string,
  vars: ReadonlyMap<string, string>,
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  const stripped = rawLine.trim().replace(/^[@+-]+/, '').trim();
  if (!stripped || stripped.startsWith('#')) {
    return null;
  }
  const expanded = expandMakefileVariables(stripped, vars).trim();
  if (!expanded || isBannerCommand(expanded)) {
    return null;
  }
  if (isAllowedDockerRecipe(expanded)) {
    if (hasUnquotedShellSyntax(expanded)) {
      return `Receta Docker contiene operadores o subshells de shell no ejecutables sin make: ${expanded}`;
    }
    commands.push(tokenizeCommandArgs(expanded).slice(1));
    return null;
  }
  const delegation = parseMakeDelegation(expanded);
  if (delegation) {
    return resolveDelegatedMakeRecipe(delegation, ctx, commands);
  }
  return `Receta bloqueada por Regla Cero en fallback sin make (solo se permiten comandos 'docker compose', 'docker run' o '$(MAKE) -C'): ${expanded}`;
}

function appendTargetRecipeCommands(
  rawLines: readonly string[],
  vars: ReadonlyMap<string, string>,
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  for (const rawLine of rawLines) {
    const err = appendSingleRecipeLine(rawLine, vars, ctx, commands);
    if (err) return err;
  }
  return null;
}

interface CollectCommandsState {
  readonly parsed: ParsedMakefile;
  readonly visited: Set<string>;
  readonly active: Set<string>;
  readonly ctx: MakeResolutionContext;
  readonly commands: string[][];
}

function collectTargetCommands(targetName: string, state: CollectCommandsState): string | null {
  const { parsed, visited, active, ctx, commands } = state;
  if (active.has(targetName)) {
    return `Dependencia circular en Makefile al resolver '${targetName}'.`;
  }
  if (visited.has(targetName)) {
    return null;
  }
  const targetDef = parsed.targets.get(targetName);
  if (!targetDef) {
    return `Target '${targetName}' no definido en Makefile.`;
  }

  active.add(targetName);
  for (const dep of targetDef.deps) {
    const depError = collectTargetCommands(dep, state);
    if (depError) {
      return depError;
    }
  }

  const recipeError = appendTargetRecipeCommands(
    targetDef.recipes,
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

export interface ResolveMakefileRecursionOptions {
  readonly rootDir?: string;
  readonly depth?: number;
}

/**
 * Extrae recetas Docker seguras de un Makefile cuando GNU make no está disponible en el host.
 * Aplica guardia Fail-Closed de Regla Cero: rechaza cualquier receta no basada en Docker.
 */
export function resolveMakefileDockerRecipes(
  makefileContent: string,
  target: string,
  resolvedPath: string,
  recursion: ResolveMakefileRecursionOptions = {}
): RecipeResolutionResult {
  const { rootDir, depth = 0 } = recursion;
  const currentDir = path.resolve(resolvedPath);
  const parsed = parseMakefile(makefileContent, currentDir);
  const commands: string[][] = [];
  const ctx: MakeResolutionContext = {
    rootDir: rootDir ? path.resolve(rootDir) : currentDir,
    currentDir,
    depth,
  };
  const errorReason = collectTargetCommands(target, {
    parsed,
    visited: new Set(),
    active: new Set(),
    ctx,
    commands,
  });
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
  return `${resolvePosixNumericId('uid')}:${resolvePosixNumericId('gid')}`;
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
  } catch (err: unknown) {
    // Optional package.json scripts probe: non-Node or malformed package.json falls back to empty scripts
    reportDebugCatchError('ephemeralRunner.readPackageScripts', err);
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
        '--cov-branch',
        '--cov-fail-under=95',
        '--cov-report=xml:.agents/.cache/coverage/python.xml',
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

interface ExecCommandInput {
  readonly executor: typeof execFile;
  readonly binary: string;
  readonly args: string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

function resolveExecErrorExitCode(errWithCode: NodeJS.ErrnoException & {
  code?: number | string;
  killed?: boolean;
  signal?: string;
}): number {
  if (typeof errWithCode.code === 'number') {
    return errWithCode.code;
  }
  if (
    errWithCode.killed ||
    errWithCode.signal === 'SIGTERM' ||
    errWithCode.code === 'ABORT_ERR' ||
    errWithCode.name === 'AbortError'
  ) {
    return 124;
  }
  return 1;
}

function execCommand(input: ExecCommandInput): Promise<ExecCommandOutcome> {
  const { executor, binary, args, cwd, timeoutMs, signal } = input;
  if (signal?.aborted) {
    return Promise.resolve({
      exitCode: 124,
      errorCode: 'ABORT_ERR',
      stdout: '',
      stderr: '',
      errorMessage: 'Execution aborted before spawn',
    });
  }
  return new Promise((resolve) => {
    executor(
      binary,
      args,
      {
        cwd,
        timeout: timeoutMs,
        shell: false,
        maxBuffer: MAX_EXEC_BUFFER_BYTES,
        ...(signal ? { signal } : {}),
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
        const exitCode = resolveExecErrorExitCode(errWithCode);
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

function extractComposeDownArgs(args: readonly string[]): string[] | null {
  if (args[0] !== 'compose') return null;
  const upIdx = args.indexOf('up');
  if (upIdx <= 0 || !args.slice(upIdx + 1).includes('-d')) {
    return null;
  }
  return [...args.slice(0, upIdx), 'down', '-v', '--remove-orphans'];
}

function registerComposeDownTarget(
  args: readonly string[],
  seenKeys: Set<string>,
  targets: string[][]
): void {
  const downArgs = extractComposeDownArgs(args);
  if (!downArgs) return;
  const key = downArgs.join('\0');
  if (!seenKeys.has(key)) {
    seenKeys.add(key);
    targets.push(downArgs);
  }
}

async function teardownComposeServices(
  executor: typeof execFile,
  composeDownTargets: readonly string[][],
  resolvedPath: string
): Promise<void> {
  for (const downArgs of composeDownTargets) {
    await execCommand({ executor, binary: DOCKER_BINARY, args: downArgs, cwd: resolvedPath, timeoutMs: 30000 });
  }
}

interface DockerFallbackContext {
  readonly executor: typeof execFile;
  readonly commands: string[][];
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutSeconds: number;
  readonly startTime: number;
  readonly execFileSyncFn?: typeof execFileSync;
  readonly signal?: AbortSignal;
}

async function executeDockerFallbackSequence(
  ctx: DockerFallbackContext
): Promise<QaExecutionResult> {
  const {
    executor,
    commands,
    resolvedPath,
    stage,
    timeoutSeconds,
    startTime,
    execFileSyncFn,
    signal,
  } = ctx;
  const timeoutMs = timeoutSeconds * 1000;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const seenDownKeys = new Set<string>();
  const composeDownTargets: string[][] = [];
  let lastExitCode = 0;

  prepareCoverageCacheForStage(resolvedPath, stage);

  for (const args of commands) {
    const rawRemainingMs = timeoutMs - (Date.now() - startTime);
    if (rawRemainingMs <= 0 || signal?.aborted) {
      lastExitCode = 124;
      break;
    }
    registerComposeDownTarget(args, seenDownKeys, composeDownTargets);
    const res = await execCommand({
      executor,
      binary: DOCKER_BINARY,
      args,
      cwd: resolvedPath,
      timeoutMs: Math.max(1000, rawRemainingMs),
      signal,
    });
    if (res.stdout) stdoutChunks.push(res.stdout);
    const errChunk = res.stderr || (res.exitCode !== 0 ? res.errorMessage : '');
    if (errChunk) stderrChunks.push(errChunk);
    if (res.exitCode !== 0) {
      lastExitCode = res.exitCode;
      break;
    }
  }

  harvestCoverageForStage(resolvedPath, stage);

  if (composeDownTargets.length > 0) {
    await teardownComposeServices(executor, composeDownTargets, resolvedPath);
  }

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(stdoutChunks.join('\n'), stderrChunks.join('\n'), stage, {
    durationMs,
    exitCode: lastExitCode,
  });
  if (lastExitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución fallback en Docker de 'qa-${stage}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  } else {
    parsed.tail_log = `[Fallback Rule Zero sin GNU make -> docker] ${parsed.tail_log}`.trim();
  }
  return applyStageTrackingAndEvidence(resolvedPath, stage, parsed, execFileSyncFn);
}

function extractStageFindings(parsed: QaExecutionResult): RawFindingInput[] {
  const issues: RawFindingInput[] = parsed.linter_and_complexity_issues.map((item) => ({
    layer: parsed.stage,
    file: item.file,
    rule: item.rule,
    message: item.message,
  }));
  const failures: RawFindingInput[] = parsed.failed_tests.map((test) => ({
    layer: parsed.stage,
    file: test.test_name,
    rule: test.test_name,
    message: test.error_summary,
  }));
  const combined = [...issues, ...failures];
  if (combined.length === 0 && parsed.status === STATUS_FAILED && parsed.exit_code !== 124) {
    const firstDiag =
      parsed.tail_log
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? `Stage ${parsed.stage} failed`;
    combined.push({
      layer: parsed.stage,
      file: parsed.stage,
      rule: `exit-${parsed.exit_code}`,
      message: firstDiag,
    });
  }
  return combined;
}

function applyStageTrackingAndEvidence(
  resolvedPath: string,
  stage: string,
  parsed: QaExecutionResult,
  execFileSyncFn?: typeof execFileSync
): QaExecutionResult {
  if (fs.existsSync(resolvedPath)) {
    const findings = extractStageFindings(parsed);
    const breaker = recordQaStageFindingsState(resolvedPath, stage, findings, {
      maxStreak: DEFAULT_BREAKER_MAX_STREAK,
      execFileSyncFn,
    });
    if (breaker.triggered) {
      const blockingTrace = breaker.blocking_findings
        .map(
          (f) =>
            `[${f.status} | fp=${f.fingerprint} | streak=${f.consecutive_streak} | osc=${f.oscillations}] ${f.relative_file} [${f.rule_or_test_name}]: ${f.canonical_message}`
        )
        .join('\n');
      const alertBanner = formatFailVerboseReport({
        stageId: `${stage}:BREAKER_42`,
        passed: false,
        broken: true,
        durationMs: parsed.duration_ms,
        command: `make qa-${stage}`,
        exitCode: EXIT_BREAKER_42,
        stderr: blockingTrace,
        remediationHint: BREAKER_REMEDIATION,
      });
      parsed.status = STATUS_FAILED;
      parsed.exit_code = EXIT_BREAKER_42;
      parsed.circuit_breaker = breaker;
      parsed.tail_log = `${alertBanner}\n${parsed.tail_log}`.trim();
    }
  }
  if (
    parsed.status === STATUS_FAILED &&
    !parsed.tail_log.includes('[DIRECTIVE-11X]') &&
    (hasComplexityOrSignatureViolation(parsed.tail_log) ||
      parsed.linter_and_complexity_issues.some((issue) =>
        hasComplexityOrSignatureViolation(`${issue.rule} ${issue.message}`)
      ))
  ) {
    parsed.tail_log = `${parsed.tail_log}\n${TACTICAL_PATTERNS_DIRECTIVE_11X}`.trim();
  }
  recordQaStageEvidence(resolvedPath, stage, parsed.status, execFileSyncFn);
  recordStageCmdCheckpoint(
    resolvedPath,
    {
      cmdName: `qa-${stage}`,
      exitCode: parsed.exit_code,
      summary1Line: `${parsed.status}: stage=${stage} exit=${parsed.exit_code}`,
    },
    execFileSyncFn
  );
  return parsed;
}

interface FallbackRunnerContext {
  readonly executor: typeof execFile;
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutSeconds: number;
  readonly startTime: number;
  readonly execFileSyncFn?: typeof execFileSync;
  readonly makefilePath?: string;
  readonly signal?: AbortSignal;
}

async function runMissingMakefileFallback(ctx: FallbackRunnerContext): Promise<QaExecutionResult> {
  const { executor, resolvedPath, stage, timeoutSeconds, startTime, execFileSyncFn, signal } =
    ctx;
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence({
      executor,
      commands: directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      signal,
    });
  }
  const composeExists = fs.existsSync(path.join(resolvedPath, COMPOSE_QA_FILE));
  const msg = composeExists
    ? `No existe Makefile y el stage '${stage}' no tiene mapeo directo seguro en ${COMPOSE_QA_FILE}.`
    : `No se encontró archivo Makefile en ${resolvedPath}.`;
  const tail = composeExists
    ? msg
    : `Error: Makefile inexistente en el directorio destino: ${resolvedPath}`;
  const failed = buildStructuredFailureResult({
    stage,
    testName: `make qa-${stage}`,
    errorSummary: msg,
    tailLog: tail,
  });
  if (composeExists) {
    recordQaStageEvidence(resolvedPath, stage, failed.status, execFileSyncFn);
  }
  return failed;
}

async function runMakeEnoentFallback(ctx: FallbackRunnerContext): Promise<QaExecutionResult> {
  const {
    executor,
    makefilePath,
    resolvedPath,
    stage,
    timeoutSeconds,
    startTime,
    execFileSyncFn,
    signal,
  } = ctx;
  const makefileContent = fs.readFileSync(makefilePath as string, 'utf8');
  const recipeResolution = resolveMakefileDockerRecipes(makefileContent, `qa-${stage}`, resolvedPath);
  if (recipeResolution.ok) {
    return executeDockerFallbackSequence({
      executor,
      commands: recipeResolution.commands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      signal,
    });
  }
  const directCommands = resolveComposeDirectFallback(resolvedPath, stage);
  if (directCommands) {
    return executeDockerFallbackSequence({
      executor,
      commands: directCommands,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn,
      signal,
    });
  }
  const failReason = `GNU make no disponible en el host (ENOENT) y fallback Rule Zero rechazado: ${recipeResolution.reason}`;
  const failed = buildStructuredFailureResult({
    stage,
    testName: `make qa-${stage}`,
    errorSummary: failReason,
    tailLog: failReason,
    durationMs: Date.now() - startTime,
  });
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
    const raw = execFileSyncFn('git', ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'], {
      cwd: path.resolve(projectPath),
      encoding: 'utf8',
    });
    const lines = String(raw)
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      return false;
    }

    const filePaths = lines
      .flatMap((line) => extractPathsFromPorcelainLine(line))
      .filter((fp) => !isEphemeralQaArtifactPath(fp));

    return filePaths.length > 0 && filePaths.every((fp) => isDocFilePath(fp));
  } catch (err: unknown) {
    // Fail-secure: if git status fails or workspace is not a git repo, never skip QA via DOCS_ONLY fast-path
    reportDebugCatchError('ephemeralRunner.isDocsOnlyWorkspaceChange', err);
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
  const resolvedPath = resolveSafeProjectPath(projectPath);

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
    return runMissingMakefileFallback({
      executor,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn: options?.execFileSyncFn,
      signal: options?.signal,
    });
  }

  prepareCoverageCacheForStage(resolvedPath, stage);

  const makeRes = await execCommand({
    executor,
    binary: MAKE_BINARY,
    args: [target],
    cwd: resolvedPath,
    timeoutMs,
    signal: options?.signal,
  });
  if (makeRes.errorCode === 'ENOENT') {
    return runMakeEnoentFallback({
      executor,
      makefilePath,
      resolvedPath,
      stage,
      timeoutSeconds,
      startTime,
      execFileSyncFn: options?.execFileSyncFn,
      signal: options?.signal,
    });
  }

  harvestCoverageForStage(resolvedPath, stage);

  const durationMs = Date.now() - startTime;
  const parsed = parseQaOutput(makeRes.stdout, makeRes.stderr, stage, {
    durationMs,
    exitCode: makeRes.exitCode,
  });
  if (makeRes.exitCode === 124) {
    parsed.status = STATUS_FAILED;
    parsed.tail_log = `[TIMEOUT] La ejecución de 'make ${target}' excedió el límite configurado de ${timeoutSeconds}s.\n${parsed.tail_log}`;
  }
  return applyStageTrackingAndEvidence(resolvedPath, stage, parsed, options?.execFileSyncFn);
}
