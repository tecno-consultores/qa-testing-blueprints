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
import { resolveSafeChildPath } from '../services/github-fetcher.js';
import { assertNoSymlinkSegments } from '../security/pathRealResolver.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { recordStageCmdCheckpoint } from './sessionFlightRecorder.js';

const MAX_EXEC_BUFFER_BYTES = 20 * 1024 * 1024;
const COMPOSE_QA_FILE = 'docker-compose.qa.yml';
const DOCKER_BINARY = 'docker';
const MAKE_BINARY = 'make';
const BASH_QA_IMAGE_PINNED =
  'sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7';
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

function resolveSafeCacheTarget(resolvedPath: string, relPath: string): string {
  const safePath = resolveSafeChildPath(resolvedPath, relPath);
  assertNoSymlinkSegments(resolvedPath, relPath);
  return safePath;
}

export function ensureCoverageCacheDir(resolvedPath: string): string {
  const relCacheRoot = path.join('.agents', '.cache');
  const relCoverageDir = path.join(relCacheRoot, 'coverage');
  const cacheRoot = resolveSafeCacheTarget(resolvedPath, relCacheRoot);
  const coverageDir = resolveSafeCacheTarget(resolvedPath, relCoverageDir);
  fs.mkdirSync(coverageDir, { recursive: true, mode: 0o700 });
  resolveSafeCacheTarget(resolvedPath, relCacheRoot);
  resolveSafeCacheTarget(resolvedPath, relCoverageDir);
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
  ensureCoverageCacheDir(resolvedPath);
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
    const destRel = path.join('.agents', '.cache', 'coverage', item.destName);
    const destPath = resolveSafeCacheTarget(resolvedPath, destRel);
    fs.writeFileSync(destPath, rewriteLcovSubdirPrefix(raw, item.rewriteSubDir), {
      encoding: 'utf8',
      mode: 0o600,
    });
    resolveSafeCacheTarget(resolvedPath, destRel);
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
  | { ok: true; commands: string[][]; prepDirs?: string[] }
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
      const next = src[i + 1];
      if (next === '"' || next === '\\' || next === '$' || next === '`') {
        out += next;
      } else if (next !== '\n') {
        out += `\\${next}`;
      }
      i += 2;
      continue;
    }
    out += ch;
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
  prepDirs: string[];
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
    if (subRes.prepDirs) {
      for (const dir of subRes.prepDirs) {
        pushUniqueString(ctx.prepDirs, dir);
      }
    }
    for (const cmd of subRes.commands) {
      commands.push(rewriteDelegatedComposeArgs(cmd, relSubdirPosix));
    }
  }
  return null;
}

function pushUniqueString(list: string[], value: string): void {
  if (value && !list.includes(value)) {
    list.push(value);
  }
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
 * Permite `$(id -u)`, `$(id -g)` y `$(pwd)` dentro de comillas dobles en invocaciones Docker (`shell: false`).
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
      i = readDoubleQuotedToken(commandLine, i).nextIndex + 1;
      continue;
    }
    if (isUnquotedShellToken(commandLine, i)) {
      return true;
    }
    i += 1;
  }
  return false;
}

function replaceSafeHostToken(tok: string, currentDir: string): string {
  if (!tok.includes('$(')) {
    return tok;
  }
  return tok
    .replaceAll('$(id -u)', String(resolvePosixNumericId('uid')))
    .replaceAll('$(id -g)', String(resolvePosixNumericId('gid')))
    .replaceAll('$(pwd)', currentDir);
}

function expandSafeDockerHostTokens(tokens: readonly string[], currentDir: string): string[] {
  const out: string[] = [];
  let inShellPayload = false;
  for (const tok of tokens) {
    out.push(inShellPayload ? tok : replaceSafeHostToken(tok, currentDir));
    if (tok === '-c') {
      inShellPayload = true;
    }
  }
  return out;
}

function isSafeDirArg(raw: string): boolean {
  if (!raw || raw.length > 256 || raw.includes('\0')) {
    return false;
  }
  if (raw.split(/[\\/]/).includes('..')) {
    return false;
  }
  return /^[A-Za-z0-9_./-]{1,256}$/.test(raw);
}

function resolvePathWithExistingSymlinks(targetPath: string): string {
  const missingParts: string[] = [];
  let cursor = path.resolve(targetPath);
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return path.resolve(targetPath);
    missingParts.unshift(path.basename(cursor));
    cursor = parent;
  }
  const realBase = fs.realpathSync(cursor);
  return missingParts.length > 0 ? path.join(realBase, ...missingParts) : realBase;
}

function resolveContainedPrepDir(rawDir: string, ctx: MakeResolutionContext): string | null {
  if (!isSafeDirArg(rawDir)) {
    return null;
  }
  const realRoot = fs.existsSync(ctx.rootDir)
    ? fs.realpathSync(ctx.rootDir)
    : path.resolve(ctx.rootDir);
  const baseCurrent = fs.existsSync(ctx.currentDir)
    ? fs.realpathSync(ctx.currentDir)
    : path.resolve(ctx.currentDir);
  const candidate = path.resolve(baseCurrent, rawDir);
  const resolvedCandidate = resolvePathWithExistingSymlinks(candidate);
  if (resolvedCandidate === realRoot || resolvedCandidate.startsWith(`${realRoot}${path.sep}`)) {
    return path.relative(realRoot, resolvedCandidate);
  }
  return null;
}

function collectSafeMkdirTargets(tokens: readonly string[], ctx: MakeResolutionContext): string | null {
  const dirArgs = tokens.slice(1).filter((t) => !t.startsWith('-'));
  if (dirArgs.length === 0) {
    return `Receta mkdir sin directorios destino válidos: ${tokens.join(' ')}`;
  }
  for (const rawDir of dirArgs) {
    const rel = resolveContainedPrepDir(rawDir, ctx);
    if (rel === null) {
      return `Receta mkdir bloqueada fuera del directorio raíz: ${rawDir}`;
    }
    pushUniqueString(ctx.prepDirs, rel);
  }
  return null;
}

function isOptionalSecretGuard(expanded: string): boolean {
  const compact = expanded.replace(/\s+/g, ' ').trim();
  return (
    compact === '[ ! -x ./scripts/verificar-secretos.sh ] || ./scripts/verificar-secretos.sh' ||
    compact === '[ ! -x scripts/verificar-secretos.sh ] || scripts/verificar-secretos.sh'
  );
}

function buildSecretGuardDockerArgs(currentDir: string): string[] | null {
  const scriptPath = path.join(currentDir, 'scripts', 'verificar-secretos.sh');
  if (!fs.existsSync(scriptPath)) {
    return null;
  }
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '-u',
    resolveHostUidGid(),
    '-e',
    'HOME=/tmp',
    '-v',
    `${currentDir}:/repo:ro`,
    '-w',
    '/repo',
    BASH_QA_IMAGE_PINNED,
    'bash',
    './scripts/verificar-secretos.sh',
  ];
}

function readShellSeparatorLen(src: string, idx: number): number {
  if (src[idx] === ';') {
    return 1;
  }
  if (src[idx] === '&' && src[idx + 1] === '&') {
    return 2;
  }
  return 0;
}

function skipQuotedSegment(src: string, idx: number): number {
  const ch = src[idx];
  if (ch === "'") {
    return readSingleQuotedToken(src, idx).nextIndex + 1;
  }
  return readDoubleQuotedToken(src, idx).nextIndex + 1;
}

function splitUnquotedStatements(body: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      i = skipQuotedSegment(body, i);
      continue;
    }
    const sepLen = readShellSeparatorLen(body, i);
    if (sepLen > 0) {
      const segment = body.slice(start, i).trim();
      if (segment) out.push(segment);
      i += sepLen;
      start = i;
      continue;
    }
    i += 1;
  }
  const tail = body.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function isBenignSetOption(stmt: string): boolean {
  const compact = stmt.replace(/\s+/g, ' ').trim();
  return /^set -(?:e|u|eu|euo pipefail)$/.test(compact);
}

const DEV_NULL_REDIR_WITH_ERR = '>/dev/null 2>&1';
const DEV_NULL_REDIR = '>/dev/null';
const SAFE_BANNER_REDIRS: readonly string[] = [
  DEV_NULL_REDIR_WITH_ERR,
  '1>/dev/null 2>&1',
  DEV_NULL_REDIR,
  '1>&2',
  '>&2',
];
const ELSE_AFTER_SEMI_RE = /^;[ \t]*else(?:[ \t]+|$)/;
const IF_BOUNDED_HEAD_RE = /^if[ \t]+\[[ \t]+-[fx][ \t]+/;
const THEN_AFTER_CLOSE_RE = /^;[ \t]*then(?:[ \t]+|$)/;

function stripTrailingDevNullRedir(raw: string): string {
  const trimmed = raw.trimEnd();
  if (trimmed.endsWith(DEV_NULL_REDIR_WITH_ERR)) {
    return trimmed.slice(0, -DEV_NULL_REDIR_WITH_ERR.length).trimEnd();
  }
  if (trimmed.endsWith(DEV_NULL_REDIR)) {
    return trimmed.slice(0, -DEV_NULL_REDIR.length).trimEnd();
  }
  return trimmed;
}

function stripSafeCleanupTrapSuffix(trapped: string): string {
  let core = trapped.trim();
  if (core.endsWith('|| true')) {
    core = core.slice(0, -'|| true'.length).trimEnd();
  }
  core = stripTrailingDevNullRedir(core);
  if (core === trapped.trim()) return trapped;
  const tokens = tokenizeCommandArgs(core);
  if (tokens[0] === 'docker' && tokens[1] === 'compose' && tokens.includes('down')) {
    return core;
  }
  return trapped;
}

function extractTrapDockerArgs(stmt: string, currentDir: string): string[] | null {
  const tokens = tokenizeCommandArgs(stmt);
  if (tokens[0] !== 'trap' || tokens.length < 3 || !tokens[1]) {
    return null;
  }
  const coreTrapped = stripSafeCleanupTrapSuffix(tokens[1].trim());
  if (!isAllowedDockerRecipe(coreTrapped) || hasUnquotedShellSyntax(coreTrapped)) {
    return null;
  }
  return expandSafeDockerHostTokens(tokenizeCommandArgs(coreTrapped).slice(1), currentDir);
}

function splitUnquotedOrSegments(stmt: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < stmt.length) {
    const ch = stmt[i];
    if (ch === "'" || ch === '"') {
      i = skipQuotedSegment(stmt, i);
      continue;
    }
    if (ch === '|' && stmt[i + 1] === '|') {
      const seg = stmt.slice(start, i).trim();
      if (seg) out.push(seg);
      i += 2;
      start = i;
      continue;
    }
    i += 1;
  }
  const tail = stmt.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function resolveDockerComposeDownFallback(stmt: string, currentDir: string): string[] | null {
  const alternatives = splitUnquotedOrSegments(stmt);
  if (alternatives.length < 2) return null;
  let firstArgs: string[] | null = null;
  for (const alt of alternatives) {
    const trimmed = alt.trim();
    if (trimmed === 'true') continue;
    const core = stripTrailingDevNullRedir(trimmed);
    const tokens = tokenizeCommandArgs(core);
    const isDown = tokens[0] === 'docker' && tokens[1] === 'compose' && tokens.includes('down');
    if (!isDown || hasUnquotedShellSyntax(core)) {
      return null;
    }
    firstArgs ??= expandSafeDockerHostTokens(tokens.slice(1), currentDir);
  }
  return firstArgs;
}

function stripBenignBannerRedir(raw: string): string {
  const trimmed = raw.trimEnd();
  for (const suffix of SAFE_BANNER_REDIRS) {
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length).trimEnd();
    }
  }
  return trimmed;
}

function findTrailingFiSemiIndex(src: string): number {
  let pos = src.length;
  if (pos < 2 || src.slice(pos - 2, pos) !== 'fi') return -1;
  pos -= 2;
  if (pos === 0 || (src[pos - 1] !== ' ' && src[pos - 1] !== '\t' && src[pos - 1] !== ';')) {
    return -1;
  }
  while (pos > 0 && (src[pos - 1] === ' ' || src[pos - 1] === '\t')) {
    pos -= 1;
  }
  if (pos === 0 || src[pos - 1] !== ';') return -1;
  return pos - 1;
}

function isSafeIfZCondition(cond: string): boolean {
  if (!cond) return false;
  const clauses = cond.split('&&');
  for (const clause of clauses) {
    const part = clause.trim();
    if (!part.startsWith('[ -z ') || !part.endsWith(' ]')) return false;
    if (part.includes('$(') || part.includes('`') || hasUnquotedShellSyntax(part)) {
      return false;
    }
  }
  return true;
}

function isBenignIfZEcho(trimmed: string): boolean {
  if (trimmed.includes('\n') || trimmed.includes('\r')) return false;
  const compact = trimmed.replace(/\s+/g, ' ').trim();
  const fiSemiIdx = findTrailingFiSemiIndex(compact);
  if (!compact.startsWith('if ') || fiSemiIdx === -1) return false;
  const thenIdx = compact.indexOf('; then ');
  if (thenIdx === -1 || thenIdx >= fiSemiIdx) return false;
  const cond = compact.slice(3, thenIdx).trim();
  const rawBody = compact.slice(thenIdx + 7, fiSemiIdx).trim();
  const coreBody = stripBenignBannerRedir(rawBody);
  if (!coreBody || coreBody.includes('$(') || coreBody.includes('`')) return false;
  return isSafeIfZCondition(cond) && isBannerCommand(coreBody) && !hasUnquotedShellSyntax(coreBody);
}

function findUnquotedElseSpan(body: string): { index: number; length: number } | null {
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      i = skipQuotedSegment(body, i);
      continue;
    }
    if (ch === ';') {
      const m = ELSE_AFTER_SEMI_RE.exec(body.slice(i));
      if (m) {
        return { index: i, length: m[0].length };
      }
    }
    i += 1;
  }
  return null;
}

function parseBoundedIfFile(
  trimmed: string
): { relCheck: string; thenBody: string; elseBody: string | null } | null {
  if (trimmed.includes('\n') || trimmed.includes('\r')) return null;
  const headMatch = IF_BOUNDED_HEAD_RE.exec(trimmed);
  if (!headMatch) return null;
  const fiSemiIdx = findTrailingFiSemiIndex(trimmed);
  if (fiSemiIdx === -1) return null;
  const afterHead = trimmed.slice(headMatch[0].length, fiSemiIdx);
  const closeIdx = afterHead.indexOf(']');
  if (closeIdx === -1) return null;
  const relCheck = afterHead.slice(0, closeIdx).trim().replace(/^['"]|['"]$/g, '');
  if (!relCheck) return null;
  const afterCloseTrimmed = afterHead.slice(closeIdx + 1).trimStart();
  const thenMatch = THEN_AFTER_CLOSE_RE.exec(afterCloseTrimmed);
  if (!thenMatch) return null;
  const rest = afterCloseTrimmed.slice(thenMatch[0].length);
  const elseSpan = findUnquotedElseSpan(rest);
  if (!elseSpan) {
    return { relCheck, thenBody: rest.trim(), elseBody: null };
  }
  return {
    relCheck,
    thenBody: rest.slice(0, elseSpan.index).trim(),
    elseBody: rest.slice(elseSpan.index + elseSpan.length).trim(),
  };
}

function appendAtomicStatement(
  stmt: string,
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  if (isBannerCommand(stmt)) {
    return null;
  }
  if (stmt === 'mkdir' || stmt.startsWith('mkdir ')) {
    return collectSafeMkdirTargets(tokenizeCommandArgs(stmt), ctx);
  }
  const downFallback = resolveDockerComposeDownFallback(stmt, ctx.currentDir);
  if (downFallback) {
    commands.push(downFallback);
    return null;
  }
  if (isAllowedDockerRecipe(stmt)) {
    if (hasUnquotedShellSyntax(stmt)) {
      return `Receta Docker contiene operadores o subshells de shell no ejecutables sin make: ${stmt}`;
    }
    commands.push(expandSafeDockerHostTokens(tokenizeCommandArgs(stmt).slice(1), ctx.currentDir));
    return null;
  }
  return `Receta bloqueada por Regla Cero en fallback sin make (solo se permiten comandos 'docker compose', 'docker run' o '$(MAKE) -C'): ${stmt}`;
}

function processStatementList(
  stmts: readonly string[],
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  let deferredTrap: string[] | null = null;
  for (const stmt of stmts) {
    if (isBenignSetOption(stmt)) continue;
    if (stmt.startsWith('trap ')) {
      const trapArgs = extractTrapDockerArgs(stmt, ctx.currentDir);
      if (!trapArgs) return `Cláusula trap no permitida por Regla Cero: ${stmt}`;
      deferredTrap = trapArgs;
      continue;
    }
    const err = appendAtomicStatement(stmt, ctx, commands);
    if (err) return err;
  }
  if (deferredTrap) {
    commands.push(deferredTrap);
  }
  return null;
}

function processShellStatements(
  body: string,
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  const trimmed = body.trim();
  if (isBenignIfZEcho(trimmed)) {
    return null;
  }
  const boundedIf = parseBoundedIfFile(trimmed);
  if (boundedIf) {
    if (resolveContainedPrepDir(boundedIf.relCheck, ctx) === null) {
      return `Condicional if [ -f ] bloqueado fuera del directorio raíz: ${boundedIf.relCheck}`;
    }
    const absCheck = path.resolve(ctx.currentDir, boundedIf.relCheck);
    const condTrue = fs.existsSync(absCheck) && fs.statSync(absCheck).isFile();
    const branch = condTrue ? boundedIf.thenBody : boundedIf.elseBody;
    return branch ? processShellStatements(branch, ctx, commands) : null;
  }
  const stmts = splitUnquotedStatements(trimmed);
  if (stmts.length === 0) {
    return `Wrapper shell vacío rechazado por Regla Cero: ${body}`;
  }
  return processStatementList(stmts, ctx, commands);
}

function unwrapSafeShellWrapper(
  expanded: string,
  ctx: MakeResolutionContext,
  commands: string[][]
): string | null {
  const outer = tokenizeCommandArgs(expanded);
  const isShellC = (outer[0] === 'sh' || outer[0] === 'bash') && outer[1] === '-c';
  if (!isShellC || outer.length !== 3 || !outer[2]) {
    return null;
  }
  return processShellStatements(outer[2], ctx, commands);
}

function isShellCWrapperRecipe(expanded: string): boolean {
  const outer = tokenizeCommandArgs(expanded);
  return (outer[0] === 'sh' || outer[0] === 'bash') && outer[1] === '-c' && outer.length === 3;
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
  if (isOptionalSecretGuard(expanded)) {
    const secretArgs = buildSecretGuardDockerArgs(ctx.currentDir);
    if (secretArgs) commands.push(secretArgs);
    return null;
  }
  if (isShellCWrapperRecipe(expanded)) {
    return unwrapSafeShellWrapper(expanded, ctx, commands);
  }
  if (isBenignIfZEcho(expanded) || parseBoundedIfFile(expanded) !== null) {
    return processShellStatements(expanded, ctx, commands);
  }
  const delegation = parseMakeDelegation(expanded);
  if (delegation) {
    return resolveDelegatedMakeRecipe(delegation, ctx, commands);
  }
  return appendAtomicStatement(expanded, ctx, commands);
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
  const prepDirs: string[] = [];
  const ctx: MakeResolutionContext = {
    rootDir: rootDir ? path.resolve(rootDir) : currentDir,
    currentDir,
    depth,
    prepDirs,
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
  return prepDirs.length > 0 ? { ok: true, commands, prepDirs } : { ok: true, commands };
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

function resolveProfileDirectCommands(
  stage: string,
  services: readonly string[]
): string[][] | null {
  if (stage !== 'profile' || !services.includes('profiler')) {
    return null;
  }
  const cmds: string[][] = [];
  const targetApp = ['api', 'python-api'].find((svc) => services.includes(svc));
  if (targetApp) {
    cmds.push(['compose', '-f', COMPOSE_QA_FILE, '--profile', 'profile', 'up', '-d', targetApp]);
  }
  cmds.push(['compose', '-f', COMPOSE_QA_FILE, '--profile', 'profile', 'run', '--rm', '-T', 'profiler']);
  return cmds;
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
  const profileCmds = resolveProfileDirectCommands(stage, services);
  if (profileCmds) {
    return profileCmds;
  }
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
  if (upIdx <= 0) return null;
  const tail = args.slice(upIdx + 1);
  const needsTeardown =
    tail.includes('-d') ||
    tail.includes('--detach') ||
    tail.includes('--abort-on-container-exit') ||
    args.includes('--profile');
  if (!needsTeardown) {
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
  readonly prepDirs?: readonly string[];
}

function ensureSafePrepDirs(resolvedPath: string, prepDirs?: readonly string[]): void {
  if (!prepDirs || prepDirs.length === 0) return;
  for (const rel of prepDirs) {
    if (!rel) continue;
    const targetDir = resolveSafeCacheTarget(resolvedPath, rel);
    fs.mkdirSync(targetDir, { recursive: true });
  }
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
    prepDirs,
  } = ctx;
  const timeoutMs = timeoutSeconds * 1000;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const seenDownKeys = new Set<string>();
  const composeDownTargets: string[][] = [];
  let lastExitCode = 0;

  ensureSafePrepDirs(resolvedPath, prepDirs);
  prepareCoverageCacheForStage(resolvedPath, stage);

  try {
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
  } finally {
    if (composeDownTargets.length > 0) {
      await teardownComposeServices(executor, composeDownTargets, resolvedPath);
    }
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
      prepDirs: recipeResolution.prepDirs,
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

  assertNoSymlinkSegments(resolvedPath, '.agents');

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
