// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as path from 'path';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  BASH_QA_IMAGE_PINNED,
  MAKE_BINARY,
  MAKE_NOOP_FLAGS,
  MAX_MAKE_DELEGATION_DEPTH,
  SHELL_CHAIN_TOKENS,
  resolveHostUidGid,
  resolvePosixNumericId,
  type ParsedMakefile,
  type ParsedTarget,
  type RecipeResolutionResult,
} from './coverageHarvest.js';

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

const UNQUOTED_POSIX_ESCAPABLE = new Set(["'", '"', '\\', ' ', '\t', '\n']);

function readUnquotedBackslash(src: string, idx: number): { value: string; nextIndex: number } {
  if (idx + 1 >= src.length) {
    return { value: '\\', nextIndex: idx + 1 };
  }
  const next = pickAt(src, idx + 1);
  if (next === '\n') {
    return { value: '', nextIndex: idx + 2 };
  }
  return UNQUOTED_POSIX_ESCAPABLE.has(next)
    ? { value: next, nextIndex: idx + 2 }
    : { value: '\\', nextIndex: idx + 1 };
}

function consumeShellAtom(src: string, idx: number): { value: string; nextIndex: number } {
  const ch = pickAt(src, idx);
  if (ch === "'") {
    const seg = readSingleQuotedToken(src, idx);
    return { value: seg.value, nextIndex: seg.nextIndex + 1 };
  }
  if (ch === '"') {
    const seg = readDoubleQuotedToken(src, idx);
    return { value: seg.value, nextIndex: seg.nextIndex + 1 };
  }
  if (ch === '\\') {
    return readUnquotedBackslash(src, idx);
  }
  return { value: ch, nextIndex: idx + 1 };
}

/**
 * Tokenizador lineal de argumentos CLI respetando comillas simples, dobles y escapes POSIX sin usar regex complejas.
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
    const atom = consumeShellAtom(commandLine, i);
    current += atom.value;
    i = atom.nextIndex;
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
  const hasCompoundOp = prevChar === '?' || prevChar === ':' || prevChar === '+';
  const op = hasCompoundOp ? `${prevChar}=` : '=';
  const name = cleaned.slice(0, hasCompoundOp ? eqIdx - 1 : eqIdx).trim();
  const rawVal = cleaned.slice(eqIdx + 1);
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return false;
  }
  if (op === '?=' && vars.has(name)) {
    return true;
  }
  const expanded = expandMakefileVariables(rawVal.trim(), vars);
  if (op === '+=') {
    const existing = vars.get(name);
    vars.set(name, existing ? `${existing} ${expanded}` : expanded);
    return true;
  }
  vars.set(name, expanded);
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

const ESCAPED_QUOTE_OR_SLASH = new Set(["'", '"', '\\']);

function advanceQuotedOrEscapedIndex(src: string, idx: number): number | null {
  const ch = src[idx];
  if (ch === "'") {
    return readSingleQuotedToken(src, idx).nextIndex + 1;
  }
  if (ch === '"') {
    return readDoubleQuotedToken(src, idx).nextIndex + 1;
  }
  if (ch === '\\' && ESCAPED_QUOTE_OR_SLASH.has(src[idx + 1] ?? '')) {
    return idx + 2;
  }
  return null;
}

/**
 * Detecta operadores de encadenamiento/redirección fuera de comillas o subshells no expandidos.
 * Permite `$(id -u)`, `$(id -g)` y `$(pwd)` dentro de comillas dobles en invocaciones Docker (`shell: false`).
 */
export function hasUnquotedShellSyntax(commandLine: string): boolean {
  let i = 0;
  while (i < commandLine.length) {
    const advanced = advanceQuotedOrEscapedIndex(commandLine, i);
    if (advanced !== null) {
      i = advanced;
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
    '--security-opt=no-new-privileges:true',
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

function splitUnquotedStatements(body: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const advanced = advanceQuotedOrEscapedIndex(body, i);
    if (advanced !== null) {
      i = advanced;
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
    const advanced = advanceQuotedOrEscapedIndex(stmt, i);
    if (advanced !== null) {
      i = advanced;
      continue;
    }
    if (stmt[i] === '|' && stmt[i + 1] === '|') {
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
    const advanced = advanceQuotedOrEscapedIndex(body, i);
    if (advanced !== null) {
      i = advanced;
      continue;
    }
    if (body[i] === ';') {
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

