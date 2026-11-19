// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile } from 'node:child_process';
import { pickAt, reportDebugCatchError } from './diagnosticFormatter.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { redactPiiAndSecrets } from '../security/promptGuard.js';
import {
  DiffAlert,
  DiffBundleReport,
  DiffFileSummary,
  DiffTier,
} from '../types.js';

export const DEFAULT_MAX_TOKENS_BUDGET = 4000;
const CHARS_PER_TOKEN = 4;
const CORE_HUNK_COLLAPSE_THRESHOLD = 80;
const HUNK_HEAD_KEEP = 10;
const HUNK_TAIL_KEEP = 10;
const GIT_DIFF_MAX_BUFFER = 16 * 1024 * 1024;
const GIT_DIFF_TIMEOUT_MS = 30000;
const TRUNCATED_BUDGET_MARKER = '\n...[TRUNCATED_BY_BUDGET]';

const SAFE_GIT_REF_RE = /^(?!-)[a-zA-Z0-9._/~^-]{1,128}$/;
const REDACTED_MARKER_RE =
  /\[REDACTED_(?:EMAIL|CARD|SSN|PHONE|SECRET|PROMPT_INJECTION)\]/g;
const LOCKFILE_BASENAMES = new Set([
  'pnpm-lock.yaml',
  'uv.lock',
  'composer.lock',
  'package-lock.json',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
]);
const GENERATED_DIR_SEGMENTS = new Set([
  'dist',
  'graphify-out',
  'coverage',
  '.nyc_output',
  'node_modules',
]);
const IGNORED_AST_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  '__pycache__',
  'dist',
  '.cache',
  'vendor',
  'target',
]);
const GENERATED_EXT_RE = /\.(?:min\.js|min\.css|map|snap)$/i;
const TEST_DIR_SEGMENTS = new Set(['tests', 'test', '__tests__', 'e2e']);
const TEST_FILE_RE =
  /(?:\.(?:unit|test|spec|e2e)\.[^.]+$|(^|\/)test_[^/]+\.py$|\.(?:feature|feature\.example|bats)$)/i;
const CRITICAL_DIR_RE = /(?:^|\/)(?:alembic\/versions|migrations|\.agents)(?:\/|$)/i;
const CRITICAL_FILE_RE = /^(?:Dockerfile.*|docker-compose.*|manifest\.json)$/i;
const CRITICAL_DOMAIN_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)(?:security|auth|vault|rls|rbac|csrf|session|guard|crypto|openapi)[/_.]/i,
  /(?:^|\/)(?:routes?|routers?|controllers?|endpoints?)[/_.]/i,
  /\.(?:route|controller|router)\.(?:ts|js|py|php)$/i,
  /(?:^|\/)(?:server|types)\.(?:ts|py)$/i,
];
const API_ROUTE_FILE_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)(?:routes?|routers?|controllers?|endpoints?)[/_.]/i,
  /\.(?:route|controller|router)\.(?:ts|js|py|php)$/i,
];
const API_DECORATOR_RE =
  /^[+-]\s*(?:@(?:router|app)\.(?:get|post|put|patch|delete)|app\.(?:get|post|put|patch|delete)\s*\()/i;
const FEATURE_FILE_RE = /\.feature(?:\.example)?$/i;
const DIRECT_SIG_KEYWORDS = new Set(['function', 'def', 'class', 'interface', 'type']);
const EXPORT_SIG_KEYWORDS = new Set(['function', 'class', 'interface', 'type']);

const PY_TEST_RE = /^def\s+(test_\w+)/;
const JS_TEST_RE = /^(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/;
const BATS_TEST_RE = /^@test\s+['"]([^'"]+)['"]/;

export interface DiffBundleOptions {
  execFileFn?: typeof execFile;
}

interface ParsedDiffFile {
  file: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
  hunks: string[];
  rawPatch: string;
}

interface RenderedFileEntry {
  summary: DiffFileSummary;
  parsed: ParsedDiffFile;
  renderedText: string;
}

interface RedactionCounter {
  occurrences: number;
}

interface AstNodeRecord {
  id?: string;
  source_file?: string;
}

interface AstLinkRecord {
  source?: string;
  target?: string;
  source_file?: string;
}

interface AstGraphPayload {
  nodes?: AstNodeRecord[];
  links?: AstLinkRecord[];
}

export function estimateTokens(text: string): number {
  return text.length > 0 ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

export function validateGitRef(baseRef: string): string {
  const trimmed = baseRef.normalize('NFKC').trim();
  if (!SAFE_GIT_REF_RE.test(trimmed)) {
    throw new Error(
      `Referencia Git inválida '${baseRef}': solo se permiten caracteres seguros sin prefijo '-'.`
    );
  }
  return trimmed;
}

function normalizePosixPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isRealPathInside(rootReal: string, targetReal: string): boolean {
  return targetReal === rootReal || targetReal.startsWith(`${rootReal}${path.sep}`);
}

export function resolveContainedRealPath(rootReal: string, candidatePath: string): string {
  const resolved = path.resolve(candidatePath);
  const real = fs.realpathSync(resolved);
  if (!isRealPathInside(rootReal, real)) {
    throw new Error(`Ruta fuera del workspace permitido (symlink escape): ${candidatePath}`);
  }
  return real;
}

function runGitDiff(
  safeWorkspacePath: string,
  validatedRef: string,
  execFileFn: typeof execFile
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileFn(
      'git',
      ['diff', '--unified=1', '--no-color', '--no-ext-diff', validatedRef],
      {
        cwd: safeWorkspacePath,
        shell: false,
        maxBuffer: GIT_DIFF_MAX_BUFFER,
        timeout: GIT_DIFF_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message).trim();
          reject(new Error(`Error ejecutando git diff contra '${validatedRef}': ${detail}`));
          return;
        }
        resolve(String(stdout));
      }
    );
  });
}

function stripGitPrefix(rawPath: string, prefix: string): string {
  const clean = rawPath.trim().replace(/^"(.*)"$/, '$1');
  return clean.startsWith(prefix) ? clean.slice(prefix.length) : clean;
}

function parseDiffFilePath(sectionLines: string[]): string {
  let oldPath = '';
  for (const line of sectionLines) {
    if (line.startsWith('@@ ')) {
      break;
    }
    if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
      const targetToken = line.slice(4).split('\t')[0] ?? '';
      return normalizePosixPath(stripGitPrefix(targetToken, 'b/'));
    }
    if (line.startsWith('--- ') && !line.startsWith('--- /dev/null')) {
      const origToken = line.slice(4).split('\t')[0] ?? '';
      oldPath = normalizePosixPath(stripGitPrefix(origToken, 'a/'));
    }
  }
  if (oldPath) {
    return oldPath;
  }
  const header = pickAt(sectionLines, 0);
  const parts = header.slice('diff --git '.length).split(' b/');
  const candidate = pickAt(parts, parts.length - 1);
  return normalizePosixPath(stripGitPrefix(candidate, 'a/'));
}

function extractHunks(sectionLines: string[]): string[] {
  const hunks: string[] = [];
  let current: string[] = [];
  for (const line of sectionLines) {
    if (line.startsWith('@@ ')) {
      if (current.length > 0) {
        hunks.push(current.join('\n'));
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    hunks.push(current.join('\n'));
  }
  return hunks;
}

function parseSingleDiffSection(rawSection: string): ParsedDiffFile | null {
  const lines = rawSection.split(/\r?\n/);
  const file = parseDiffFilePath(lines);
  if (!file) {
    return null;
  }
  let additions = 0;
  let deletions = 0;
  let isBinary = false;
  for (const line of lines) {
    if (line.startsWith('GIT binary patch') || /^Binary files .* differ$/.test(line)) {
      isBinary = true;
    } else if (line.startsWith('+') && !line.startsWith('+++ ')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('--- ')) {
      deletions += 1;
    }
  }
  return {
    file,
    additions,
    deletions,
    isBinary,
    hunks: extractHunks(lines),
    rawPatch: rawSection,
  };
}

export function parseUnifiedDiffSections(diffText: string): ParsedDiffFile[] {
  const trimmed = diffText.trim();
  if (!trimmed) {
    return [];
  }
  const rawSections = trimmed.split(/(?=^diff --git )/m).filter((s) => s.trim().length > 0);
  const parsed: ParsedDiffFile[] = [];
  for (const section of rawSections) {
    const item = parseSingleDiffSection(section);
    if (item) {
      parsed.push(item);
    }
  }
  return parsed;
}

export function classifyDiffTier(filePath: string, isBinary: boolean): DiffTier {
  const norm = normalizePosixPath(filePath);
  const segments = norm.split('/');
  const baseName = pickAt(segments, segments.length - 1);
  const baseLower = baseName.toLowerCase();
  if (
    isBinary ||
    LOCKFILE_BASENAMES.has(baseLower) ||
    GENERATED_EXT_RE.test(norm) ||
    segments.some((seg) => GENERATED_DIR_SEGMENTS.has(seg))
  ) {
    return 'PRUNED_NOISE';
  }
  if (segments.some((seg) => TEST_DIR_SEGMENTS.has(seg)) || TEST_FILE_RE.test(norm)) {
    return 'TESTS_SUMMARY';
  }
  if (
    CRITICAL_DIR_RE.test(norm) ||
    CRITICAL_FILE_RE.test(baseName) ||
    CRITICAL_DOMAIN_PATTERNS.some((re) => re.test(norm))
  ) {
    return 'CRITICAL_FULL';
  }
  return 'CORE_LOGIC';
}

function isSignatureLine(line: string): boolean {
  const stripped = line.startsWith('+') || line.startsWith('-') ? line.slice(1) : line;
  const tokens = stripped.trimStart().split(/\s+/);
  const t0 = pickAt(tokens, 0);
  const t1 = pickAt(tokens, 1);
  if (DIRECT_SIG_KEYWORDS.has(t0)) {
    return true;
  }
  if (t0 === 'async') {
    return t1 === 'def' || t1 === 'function';
  }
  if (t0 === 'export') {
    return (
      EXPORT_SIG_KEYWORDS.has(t1) ||
      (t1 === 'async' && tokens[2] === 'function')
    );
  }
  return false;
}

function matchTestCaseName(line: string): string | null {
  if (!line.startsWith('+') || line.startsWith('+++ ')) {
    return null;
  }
  const clean = line.slice(1).trimStart();
  if (clean.startsWith('Scenario:')) {
    return clean.slice('Scenario:'.length).trim() || null;
  }
  if (clean.startsWith('Scenario Outline:')) {
    return clean.slice('Scenario Outline:'.length).trim() || null;
  }
  const pyClean = clean.startsWith('async ') ? clean.slice('async '.length).trimStart() : clean;
  const pyMatch = PY_TEST_RE.exec(pyClean);
  if (pyMatch?.[1]) {
    return pyMatch[1];
  }
  const jsMatch = JS_TEST_RE.exec(clean);
  if (jsMatch?.[1]) {
    return jsMatch[1].trim();
  }
  const batsMatch = BATS_TEST_RE.exec(clean);
  return batsMatch?.[1] ? batsMatch[1].trim() : null;
}

export function extractTestCaseNames(hunks: string[]): string[] {
  const found = new Set<string>();
  for (const hunk of hunks) {
    for (const line of hunk.split('\n')) {
      const name = matchTestCaseName(line);
      if (name) {
        found.add(name);
      }
    }
  }
  return Array.from(found);
}

function collapseMiddleLines(middle: string[]): string[] {
  const out: string[] = [];
  let skipped = 0;
  for (const line of middle) {
    if (isSignatureLine(line)) {
      if (skipped > 0) {
        out.push(`... [collapsed ${skipped} lines] ...`);
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped += 1;
    }
  }
  if (skipped > 0) {
    out.push(`... [collapsed ${skipped} lines] ...`);
  }
  return out;
}

export function collapseLargeHunk(hunkText: string): { text: string; collapsed: boolean } {
  const lines = hunkText.split('\n');
  if (lines.length <= CORE_HUNK_COLLAPSE_THRESHOLD) {
    return { text: hunkText, collapsed: false };
  }
  const head = lines.slice(0, 1 + HUNK_HEAD_KEEP);
  const tail = lines.slice(lines.length - HUNK_TAIL_KEEP);
  const middle = lines.slice(1 + HUNK_HEAD_KEEP, lines.length - HUNK_TAIL_KEEP);
  return {
    text: [...head, ...collapseMiddleLines(middle), ...tail].join('\n'),
    collapsed: true,
  };
}

function compactCoreFileToSignatures(parsed: ParsedDiffFile, redactedHunks: string[]): string {
  const sigLines: string[] = [];
  for (const hunk of redactedHunks) {
    for (const line of hunk.split('\n')) {
      if (line.startsWith('@@ ') || isSignatureLine(line)) {
        sigLines.push(line);
      }
    }
  }
  const body = sigLines.length > 0 ? `\n${sigLines.join('\n')}` : '';
  return `[CORE_LOGIC_COMPACT] ${parsed.file} (+${parsed.additions}/-${parsed.deletions})${body}`;
}

function countRedactedMarkers(text: string): number {
  return Array.from(text.matchAll(REDACTED_MARKER_RE)).length;
}

function applyPromptRedaction(rawText: string, counter: RedactionCounter): string {
  const beforeMatches = countRedactedMarkers(rawText);
  const sanitized = redactPiiAndSecrets(rawText);
  if (sanitized !== rawText) {
    const afterMatches = countRedactedMarkers(sanitized);
    counter.occurrences += Math.max(afterMatches - beforeMatches, 1);
  }
  return sanitized;
}

function buildFileHeader(tier: DiffTier, parsed: ParsedDiffFile): string {
  return `[${tier}] ${parsed.file} (+${parsed.additions}/-${parsed.deletions})`;
}

function renderEntry(
  parsed: ParsedDiffFile,
  astDependents: string[],
  redaction: RedactionCounter
): RenderedFileEntry {
  const tier = classifyDiffTier(parsed.file, parsed.isBinary);
  const header = buildFileHeader(tier, parsed);
  if (tier === 'PRUNED_NOISE') {
    return {
      parsed,
      renderedText: header,
      summary: {
        file: parsed.file,
        tier,
        additions: parsed.additions,
        deletions: parsed.deletions,
        pruned: true,
        ast_dependents: astDependents,
        rendered_diff: header,
      },
    };
  }

  let pruned = false;
  const redactedHunks = parsed.hunks.map((hunk) => {
    const safeHunk = applyPromptRedaction(hunk, redaction);
    if (tier === 'CORE_LOGIC') {
      const collapsed = collapseLargeHunk(safeHunk);
      if (collapsed.collapsed) {
        pruned = true;
      }
      return collapsed.text;
    }
    return safeHunk;
  });

  const testCases = tier === 'TESTS_SUMMARY' ? extractTestCaseNames(redactedHunks) : undefined;
  const body = redactedHunks.join('\n');
  const renderedText = body ? `${header}\n${body}` : header;
  return {
    parsed,
    renderedText,
    summary: {
      file: parsed.file,
      tier,
      additions: parsed.additions,
      deletions: parsed.deletions,
      pruned,
      ast_dependents: astDependents,
      ...(testCases ? { test_cases: testCases } : {}),
      rendered_diff: renderedText,
    },
  };
}

function summarizeTestEntry(entry: RenderedFileEntry): void {
  const cases = entry.summary.test_cases ?? [];
  const label = cases.length > 0 ? cases.join(', ') : 'none';
  const summaryText = `${buildFileHeader('TESTS_SUMMARY', entry.parsed)} cases=[${label}]`;
  entry.renderedText = summaryText;
  entry.summary.pruned = true;
  entry.summary.rendered_diff = summaryText;
}

function compactEntryIfNeeded(entry: RenderedFileEntry, _redaction: RedactionCounter): void {
  // Initial renderDiffEntry already counted prompt redactions; avoid double-counting on budget compaction
  const sinkCounter: RedactionCounter = { occurrences: 0 };
  const safeHunks = entry.parsed.hunks.map((h) => applyPromptRedaction(h, sinkCounter));
  const compacted = compactCoreFileToSignatures(entry.parsed, safeHunks);
  entry.renderedText = compacted;
  entry.summary.pruned = true;
  entry.summary.rendered_diff = compacted;
}

function joinEntries(entries: RenderedFileEntry[]): string {
  return entries.map((e) => e.renderedText).join('\n\n');
}

function enforceBudget(
  entries: RenderedFileEntry[],
  maxTokensBudget: number,
  redaction: RedactionCounter
): string {
  let bundle = joinEntries(entries);
  if (estimateTokens(bundle) <= maxTokensBudget) {
    return bundle;
  }
  for (const entry of entries) {
    if (entry.summary.tier === 'TESTS_SUMMARY') {
      summarizeTestEntry(entry);
    }
  }
  bundle = joinEntries(entries);
  if (estimateTokens(bundle) <= maxTokensBudget) {
    return bundle;
  }
  const coreBySize = entries
    .filter((e) => e.summary.tier === 'CORE_LOGIC')
    .sort((a, b) => b.renderedText.length - a.renderedText.length);
  for (const entry of coreBySize) {
    compactEntryIfNeeded(entry, redaction);
    bundle = joinEntries(entries);
    if (estimateTokens(bundle) <= maxTokensBudget) {
      return bundle;
    }
  }
  const maxChars = Math.max(0, maxTokensBudget * CHARS_PER_TOKEN - TRUNCATED_BUDGET_MARKER.length);
  return `${bundle.slice(0, maxChars)}${TRUNCATED_BUDGET_MARKER}`;
}

function matchWildcardSegment(pattern: string, value: string): boolean {
  let dp = new Array<boolean>(value.length + 1).fill(false);
  dp[0] = true;
  for (const ch of pattern) {
    const next = new Array<boolean>(value.length + 1).fill(false);
    if (ch === '*') {
      next[0] = Boolean(dp[0]);
      for (let j = 1; j <= value.length; j += 1) {
        next[j] = Boolean(next[j - 1]) || Boolean(dp[j]);
      }
    } else {
      for (let j = 1; j <= value.length; j += 1) {
        next[j] = Boolean(dp[j - 1]) && (ch === '?' || ch === value.charAt(j - 1));
      }
    }
    dp = next;
  }
  return Boolean(dp[value.length]);
}

function matchGlobSegments(
  patSegs: string[],
  pathSegs: string[],
  pi = 0,
  si = 0
): boolean {
  if (pi === patSegs.length) {
    return si === pathSegs.length;
  }
  if (patSegs[pi] === '**') {
    if (matchGlobSegments(patSegs, pathSegs, pi + 1, si)) {
      return true;
    }
    return si < pathSegs.length && matchGlobSegments(patSegs, pathSegs, pi, si + 1);
  }
  const patSeg = pickAt(patSegs, pi);
  const pathSeg = pickAt(pathSegs, si);
  if (si === pathSegs.length || !matchWildcardSegment(patSeg, pathSeg)) {
    return false;
  }
  return matchGlobSegments(patSegs, pathSegs, pi + 1, si + 1);
}

export function matchesGlobPattern(relPath: string, rawPattern: string): boolean {
  const normPath = normalizePosixPath(relPath);
  let normPat = normalizePosixPath(rawPattern.trim());
  if (!normPat) {
    return false;
  }
  if (normPat.endsWith('/')) {
    normPat = `${normPat}**`;
  }
  const collapsedPatSegs = normPat
    .split('/')
    .filter((seg, idx, arr) => seg !== '**' || arr[idx - 1] !== '**');
  return matchGlobSegments(collapsedPatSegs, normPath.split('/'));
}

function parseGlobListValue(rawVal: string): string[] {
  const cleaned = rawVal.trim().replace(/^`|`$/g, '');
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (err: unknown) {
      // Fallback to comma-splitting when Markdown bracket list is not strict JSON
      reportDebugCatchError('diffBundle.parseGlobListValue', err);
    }
  }
  return cleaned
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter(Boolean);
}

function parseBoundaryDirective(line: string): { key: 'allowed_globs' | 'forbidden_globs'; items: string[] } | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx <= 0) {
    return null;
  }
  const key = line
    .slice(0, colonIdx)
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/\*\*/g, '')
    .trim()
    .toLowerCase();
  if (key !== 'allowed_globs' && key !== 'forbidden_globs') {
    return null;
  }
  const rawVal = line.slice(colonIdx + 1).trim().replace(/^\*{2}\s*/, '');
  const items = parseGlobListValue(rawVal);
  return { key, items };
}

function toStringGlobList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function parseCheckpointBoundaryGlobs(
  safeWorkspacePath: string
): { allowed_globs: string[]; forbidden_globs: string[] } | undefined {
  const checkpointPath = path.join(safeWorkspacePath, '.agents', '.cache', 'session_checkpoint.json');
  if (!fs.existsSync(checkpointPath)) {
    return undefined;
  }
  let parsed: Record<string, unknown>;
  try {
    const safeCheckpoint = resolveContainedRealPath(safeWorkspacePath, checkpointPath);
    const raw: unknown = JSON.parse(fs.readFileSync(safeCheckpoint, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }
    parsed = raw as Record<string, unknown>;
  } catch (err: unknown) {
    reportDebugCatchError('diffBundle.parseCheckpointBoundaryGlobs', err);
    return undefined;
  }
  const allowed = toStringGlobList(parsed.allowed_globs);
  const forbidden = toStringGlobList(parsed.forbidden_globs);
  if (allowed.length === 0 && forbidden.length === 0) {
    return undefined;
  }
  return { allowed_globs: allowed, forbidden_globs: forbidden };
}

export function parseBoundaryGlobs(
  safeWorkspacePath: string
): { allowed_globs: string[]; forbidden_globs: string[] } | undefined {
  const fromCheckpoint = parseCheckpointBoundaryGlobs(safeWorkspacePath);
  if (fromCheckpoint) {
    return fromCheckpoint;
  }
  const activeTaskPath = path.join(safeWorkspacePath, '.agents', 'ACTIVE_TASK.md');
  if (!fs.existsSync(activeTaskPath)) {
    return undefined;
  }
  const safeTaskFile = resolveContainedRealPath(safeWorkspacePath, activeTaskPath);
  const content = fs.readFileSync(safeTaskFile, 'utf-8');
  const allowed: string[] = [];
  const forbidden: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseBoundaryDirective(line);
    if (!parsed) {
      continue;
    }
    if (parsed.key === 'allowed_globs') {
      allowed.push(...parsed.items);
    } else {
      forbidden.push(...parsed.items);
    }
  }
  if (allowed.length === 0 && forbidden.length === 0) {
    return undefined;
  }
  return { allowed_globs: allowed, forbidden_globs: forbidden };
}

function resolveGraphPrefix(safeWorkspacePath: string, graphFilePath: string): string {
  const rel = normalizePosixPath(path.relative(safeWorkspacePath, graphFilePath));
  const marker = 'graphify-out/graph.json';
  if (rel === marker) {
    return '';
  }
  return rel.endsWith(`/${marker}`) ? rel.slice(0, -marker.length - 1) : '';
}

function qualifyGraphRelPath(rawFile: string, stackPrefix: string): string {
  const norm = normalizePosixPath(rawFile);
  if (!stackPrefix || norm.startsWith(`${stackPrefix}/`)) {
    return norm;
  }
  return `${stackPrefix}/${norm}`;
}

function findGraphJsonFiles(dir: string, safeWorkspacePath: string, found: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err: unknown) {
    reportDebugCatchError(`diffBundle.findGraphJsonFiles(${dir})`, err);
    return;
  }
  for (const entry of entries) {
    if (IGNORED_AST_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findGraphJsonFiles(fullPath, safeWorkspacePath, found);
    } else if (entry.name === 'graph.json') {
      found.push(resolveContainedRealPath(safeWorkspacePath, fullPath));
    }
  }
}

function buildNodeFileMap(nodes: AstNodeRecord[], prefix: string): Map<string, string> {
  const nodeFileById = new Map<string, string>();
  for (const node of nodes) {
    if (node.id && node.source_file) {
      nodeFileById.set(node.id, qualifyGraphRelPath(node.source_file, prefix));
    }
  }
  return nodeFileById;
}

function registerGraphLinkDependency(
  link: AstLinkRecord,
  nodeFileById: Map<string, string>,
  prefix: string,
  depMap: Map<string, Set<string>>
): void {
  const targetFile = link.target ? nodeFileById.get(link.target) : undefined;
  const rawCaller = link.source_file ?? (link.source ? nodeFileById.get(link.source) : undefined);
  const callerFile = rawCaller ? qualifyGraphRelPath(rawCaller, prefix) : undefined;
  if (targetFile && callerFile && callerFile !== targetFile) {
    const current = depMap.get(targetFile) ?? new Set<string>();
    current.add(callerFile);
    depMap.set(targetFile, current);
  }
}

function indexSingleGraph(graphPath: string, safeWorkspacePath: string, depMap: Map<string, Set<string>>): void {
  try {
    const payload = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as AstGraphPayload;
    const prefix = resolveGraphPrefix(safeWorkspacePath, graphPath);
    const nodeFileById = buildNodeFileMap(payload.nodes ?? [], prefix);
    for (const link of payload.links ?? []) {
      registerGraphLinkDependency(link, nodeFileById, prefix, depMap);
    }
  } catch (err: unknown) {
    // Corrupt or unreadable graph.json is skipped when building supplemental AST dependency map
    reportDebugCatchError(`diffBundle.indexSingleGraph(${graphPath})`, err);
  }
}

function collectGraphDependentMap(safeWorkspacePath: string): Map<string, Set<string>> {
  const graphFiles: string[] = [];
  findGraphJsonFiles(safeWorkspacePath, safeWorkspacePath, graphFiles);
  const depMap = new Map<string, Set<string>>();
  for (const gf of graphFiles) {
    indexSingleGraph(gf, safeWorkspacePath, depMap);
  }
  return depMap;
}

function isApiRouteModification(parsed: ParsedDiffFile, tier: DiffTier): boolean {
  if (tier === 'TESTS_SUMMARY' || tier === 'PRUNED_NOISE') {
    return false;
  }
  if (API_ROUTE_FILE_PATTERNS.some((re) => re.test(parsed.file))) {
    return true;
  }
  return parsed.hunks.some((h) => h.split('\n').some((line) => API_DECORATOR_RE.test(line)));
}

function evaluateDiffAlerts(
  entries: RenderedFileEntry[],
  boundaryGlobs?: { allowed_globs: string[]; forbidden_globs: string[] }
): DiffAlert[] {
  const alerts: DiffAlert[] = [];
  const hasFeatureUpdate = entries.some((e) => FEATURE_FILE_RE.test(e.summary.file));
  const changedApiEntry = entries.find((e) =>
    isApiRouteModification(e.parsed, e.summary.tier)
  );
  if (changedApiEntry && !hasFeatureUpdate) {
    alerts.push({
      code: 'MISSING_KARATE_API_FEATURE',
      severity: 'HIGH',
      file: changedApiEntry.summary.file,
      message: `Se modificó ruta/controlador API '${changedApiEntry.summary.file}' sin actualizar ningún contrato *.feature de Karate BDD.`,
    });
  }
  if (!boundaryGlobs) {
    return alerts;
  }
  for (const { summary: item } of entries) {
    const hitForbidden = boundaryGlobs.forbidden_globs.find((g) => matchesGlobPattern(item.file, g));
    if (hitForbidden) {
      alerts.push({
        code: 'BOUNDARY_VIOLATION_FORBIDDEN_GLOB',
        severity: 'HIGH',
        file: item.file,
        message: `El archivo '${item.file}' viola forbidden_globs ('${hitForbidden}') en .agents/ACTIVE_TASK.md.`,
      });
    }
    if (
      boundaryGlobs.allowed_globs.length > 0 &&
      !boundaryGlobs.allowed_globs.some((g) => matchesGlobPattern(item.file, g))
    ) {
      alerts.push({
        code: 'BOUNDARY_VIOLATION_OUTSIDE_ALLOWED_GLOBS',
        severity: 'HIGH',
        file: item.file,
        message: `El archivo '${item.file}' está fuera de allowed_globs en .agents/ACTIVE_TASK.md.`,
      });
    }
  }
  return alerts;
}

export async function buildSemanticDiffBundle(
  projectPathInput: string,
  baseRef: string,
  maxTokensBudget = DEFAULT_MAX_TOKENS_BUDGET,
  options?: DiffBundleOptions
): Promise<DiffBundleReport> {
  const resolved = path.resolve(projectPathInput.normalize('NFKC'));
  if (!fs.existsSync(resolved)) {
    throw new Error(`El directorio no existe: ${resolved}`);
  }
  const safeWorkspacePath = fs.realpathSync(resolved);
  if (!fs.statSync(safeWorkspacePath).isDirectory()) {
    throw new Error(`La ruta no es un directorio válido: ${safeWorkspacePath}`);
  }
  const validatedRef = validateGitRef(baseRef);
  const diffStdout = await runGitDiff(
    safeWorkspacePath,
    validatedRef,
    options?.execFileFn ?? execFile
  );
  const rawTokens = estimateTokens(diffStdout);
  const parsedFiles = parseUnifiedDiffSections(diffStdout);
  const depMap = collectGraphDependentMap(safeWorkspacePath);
  const boundaryGlobs = parseBoundaryGlobs(safeWorkspacePath);
  const redaction: RedactionCounter = { occurrences: 0 };

  const tiersSummary: Record<DiffTier, number> = {
    PRUNED_NOISE: 0,
    CRITICAL_FULL: 0,
    CORE_LOGIC: 0,
    TESTS_SUMMARY: 0,
  };
  const entries = parsedFiles.map((parsed) => {
    const deps = Array.from(depMap.get(parsed.file) ?? []).sort((a, b) => a.localeCompare(b));
    const entry = renderEntry(parsed, deps, redaction);
    tiersSummary[entry.summary.tier] += 1;
    return entry;
  });

  const renderedBundle =
    entries.length === 0
      ? `[DIFF_EMPTY] Sin diferencias respecto a ${validatedRef}.`
      : enforceBudget(entries, maxTokensBudget, redaction);
  const compactedTokens = entries.length === 0 ? 0 : estimateTokens(renderedBundle);
  const tokenSavingsPct =
    rawTokens > 0
      ? Math.max(0, Number((((rawTokens - compactedTokens) / rawTokens) * 100).toFixed(2)))
      : 0;
  const summaries = entries.map((e) => e.summary);

  return {
    base_ref: validatedRef,
    max_tokens_budget: maxTokensBudget,
    raw_tokens_estimate: rawTokens,
    compacted_tokens_estimate: compactedTokens,
    token_savings_pct: tokenSavingsPct,
    secret_leak_warning: redaction.occurrences > 0,
    redacted_occurrences: redaction.occurrences,
    tiers_summary: tiersSummary,
    alerts: evaluateDiffAlerts(entries, boundaryGlobs),
    ...(boundaryGlobs ? { boundary_globs: boundaryGlobs } : {}),
    files: summaries,
    rendered_bundle: renderedBundle,
  };
}
