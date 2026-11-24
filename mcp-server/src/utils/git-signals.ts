// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { redactPiiAndSecrets } from '../security/promptGuard.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import type {
  GitArchSignalsReport,
  GitBusFactorAlert,
  GitHotspotEntry,
  GitTemporalCouplingPair,
} from '../types.js';
import { reportDebugCatchError } from './diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from './ignoredDirs.js';

const GIT_TIMEOUT_MS = 20_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const DEFAULT_MAX_COMMITS = 500;
const DEFAULT_MIN_COCHANGES = 3;
const DEFAULT_MIN_CONFIDENCE = 0.5;
const MAX_COUPLED_COMMIT_FILES = 20;
const MAX_RESULTS_SLICE = 15;
const MIN_BUS_FACTOR_COMMITS = 10;
const MIN_BUS_FACTOR_PCT = 90;

const FIX_PREFIX_PLAIN_RE = /^(?:fix|hotfix)!?:/i;
const FIX_PREFIX_SCOPE_RE = /^(?:fix|hotfix)\([^()\r\n]{1,64}\)!?:/i;
const FIX_EN_WORD_RE = /\b(?:fix|fixes|fixed|bug|bugs|hotfix|hotfixes)\b/i;
const FIX_ES_WORD_RE = /\b(?:corrig|arregl|solucion|repar)[a-záéíóúüñ]{0,24}\b/i;
const GENERATED_EXT_RE = /\.(?:snap|min\.js)$/i;
const NOISE_BASENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'uv.lock',
  'composer.lock',
  'cargo.lock',
  'go.sum',
]);
const SRC_ROOT_NAMES = new Set(['src', 'app', 'lib', 'packages', 'apps', 'services']);

export interface GitSignalsOptions {
  maxCommits?: number;
  minCochanges?: number;
  minConfidence?: number;
  execFileFn?: typeof execFile;
  signal?: AbortSignal;
}

interface ParsedCommitRecord {
  author: string;
  isFix: boolean;
  files: string[];
  churn: Map<string, number>;
}

function emptyReport(detected: boolean): GitArchSignalsReport {
  return {
    detected,
    commits_analyzed: 0,
    hotspots: [],
    temporal_coupling_pairs: [],
    bus_factor_alerts: [],
  };
}

function trimSlashes(rel: string): string {
  let out = rel;
  while (out.startsWith('/')) {
    out = out.slice(1);
  }
  while (out.endsWith('/')) {
    out = out.slice(0, -1);
  }
  return out;
}

function expandBraceRename(cleaned: string): string {
  const openIdx = cleaned.indexOf('{');
  const closeIdx = cleaned.indexOf('}', openIdx + 1);
  if (openIdx === -1 || closeIdx === -1) {
    return cleaned;
  }
  const inner = cleaned.slice(openIdx + 1, closeIdx);
  const arrowIdx = inner.indexOf(' => ');
  if (arrowIdx === -1) {
    return cleaned;
  }
  const newSegment = inner.slice(arrowIdx + 4);
  return `${cleaned.slice(0, openIdx)}${newSegment}${cleaned.slice(closeIdx + 1)}`;
}

export function resolveGitNumstatRenamePath(rawPath: string): string {
  let cleaned = rawPath.trim().replaceAll('\\', '/');
  if (cleaned.includes('{') && cleaned.includes(' => ')) {
    cleaned = expandBraceRename(cleaned);
  } else if (cleaned.includes(' => ')) {
    cleaned = cleaned.split(' => ', 2)[1] ?? '';
  }
  while (cleaned.includes('//')) {
    cleaned = cleaned.replaceAll('//', '/');
  }
  return trimSlashes(cleaned.replace(/^\.\//, ''));
}

export function isFixCommitSubject(subject: string): boolean {
  const safeSubject = redactPiiAndSecrets(subject);
  return (
    FIX_PREFIX_PLAIN_RE.test(safeSubject) ||
    FIX_PREFIX_SCOPE_RE.test(safeSubject) ||
    FIX_EN_WORD_RE.test(safeSubject) ||
    FIX_ES_WORD_RE.test(safeSubject)
  );
}

function isIgnoredGitPath(relPath: string): boolean {
  if (!relPath || GENERATED_EXT_RE.test(relPath)) {
    return true;
  }
  const parts = relPath.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => CANONICAL_IGNORED_DIRS.has(p))) {
    return true;
  }
  const baseName = String(parts[parts.length - 1]);
  return NOISE_BASENAMES.has(baseName.toLowerCase());
}

function moduleKeyFromPath(relPath: string): string {
  const parts = trimSlashes(relPath).split('/').filter(Boolean);
  if (parts.length <= 1) {
    return '(root)';
  }
  const first = String(parts[0]);
  const second = String(parts[1]);
  if (SRC_ROOT_NAMES.has(first) && parts.length > 2) {
    return parts.slice(0, Math.min(3, parts.length - 1)).join('/');
  }
  if (parts.length > 3 && SRC_ROOT_NAMES.has(second)) {
    return parts.slice(0, 3).join('/');
  }
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

function parseNumstatLine(
  line: string,
  files: string[],
  churn: Map<string, number>
): void {
  const parts = line.split('\t');
  if (parts.length !== 3) {
    return;
  }
  const normPath = resolveGitNumstatRenamePath(String(parts[2]));
  if (isIgnoredGitPath(normPath)) {
    return;
  }
  const addRaw = String(parts[0]);
  const delRaw = String(parts[1]);
  const added = /^\d+$/.test(addRaw) ? Number(addRaw) : 0;
  const deleted = /^\d+$/.test(delRaw) ? Number(delRaw) : 0;
  if (!churn.has(normPath)) {
    files.push(normPath);
  }
  churn.set(normPath, (churn.get(normPath) ?? 0) + added + deleted);
}

function parseGitLogRecords(rawLog: string): ParsedCommitRecord[] {
  const commits: ParsedCommitRecord[] = [];
  for (const rawRecord of rawLog.split('\x1e')) {
    const trimmed = rawRecord.trim();
    if (!trimmed) {
      continue;
    }
    const lines = trimmed.split('\n');
    const header = String(lines[0]).split('\x1f');
    if (header.length !== 5) {
      continue;
    }
    const files: string[] = [];
    const churn = new Map<string, number>();
    for (const numLine of lines.slice(1)) {
      parseNumstatLine(numLine, files, churn);
    }
    commits.push({
      author: redactPiiAndSecrets(String(header[3])),
      isFix: isFixCommitSubject(String(header[4])),
      files,
      churn,
    });
  }
  return commits;
}

function collectHotspots(
  commits: readonly ParsedCommitRecord[]
): { hotspots: GitHotspotEntry[]; touches: Map<string, number> } {
  const touches = new Map<string, number>();
  const fixes = new Map<string, number>();
  const churnTotal = new Map<string, number>();

  for (const commit of commits) {
    for (const file of commit.files) {
      touches.set(file, (touches.get(file) ?? 0) + 1);
      churnTotal.set(file, (churnTotal.get(file) ?? 0) + Number(commit.churn.get(file)));
      if (commit.isFix) {
        fixes.set(file, (fixes.get(file) ?? 0) + 1);
      }
    }
  }

  const hotspots: GitHotspotEntry[] = [];
  for (const [file, count] of touches.entries()) {
    const fixCount = fixes.get(file) ?? 0;
    const churnLines = Number(churnTotal.get(file));
    hotspots.push({
      file,
      touches: count,
      fixes: fixCount,
      churn_lines: churnLines,
      score: count * (1 + fixCount) + Math.floor(Math.log10(1 + churnLines)),
    });
  }
  hotspots.sort((a, b) => b.score - a.score || b.fixes - a.fixes || a.file.localeCompare(b.file));
  return { hotspots: hotspots.slice(0, MAX_RESULTS_SLICE), touches };
}

function addCommitPairs(
  eligible: readonly string[],
  pairCounts: Map<string, number>
): void {
  for (const [i, fileA] of eligible.entries()) {
    for (const fileB of eligible.slice(i + 1)) {
      const key = `${fileA}\x00${fileB}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }
}

function buildCouplingPair(
  pairKey: string,
  cochanges: number,
  touches: ReadonlyMap<string, number>,
  thresholds: { minCochanges: number; minConfidence: number }
): GitTemporalCouplingPair | undefined {
  if (cochanges < thresholds.minCochanges) {
    return undefined;
  }
  const sep = pairKey.indexOf('\x00');
  const fileA = pairKey.slice(0, sep);
  const fileB = pairKey.slice(sep + 1);
  const denom = Math.min(Number(touches.get(fileA)), Number(touches.get(fileB)));
  const confidence = cochanges / denom;
  if (confidence < thresholds.minConfidence) {
    return undefined;
  }
  const modA = moduleKeyFromPath(fileA);
  const modB = moduleKeyFromPath(fileB);
  return {
    file_a: fileA,
    file_b: fileB,
    cochanges,
    confidence: Math.round(confidence * 100) / 100,
    cross_module: modA !== modB,
    module_a: modA,
    module_b: modB,
  };
}

function collectTemporalCoupling(
  commits: readonly ParsedCommitRecord[],
  touches: ReadonlyMap<string, number>,
  minCochanges: number,
  minConfidence: number
): GitTemporalCouplingPair[] {
  const pairCounts = new Map<string, number>();
  for (const commit of commits) {
    const eligible = Array.from(new Set(commit.files))
      .filter((f) => (touches.get(f) ?? 0) >= 2)
      .sort((a, b) => a.localeCompare(b));
    if (eligible.length >= 2 && eligible.length <= MAX_COUPLED_COMMIT_FILES) {
      addCommitPairs(eligible, pairCounts);
    }
  }
  const pairs: GitTemporalCouplingPair[] = [];
  const thresholds = { minCochanges, minConfidence };
  for (const [key, count] of pairCounts.entries()) {
    const built = buildCouplingPair(key, count, touches, thresholds);
    if (built) {
      pairs.push(built);
    }
  }
  pairs.sort(
    (a, b) =>
      Number(b.cross_module) - Number(a.cross_module) ||
      b.cochanges - a.cochanges ||
      b.confidence - a.confidence ||
      a.file_a.localeCompare(b.file_a)
  );
  return pairs.slice(0, MAX_RESULTS_SLICE);
}

function computeTopAuthorAlert(
  moduleName: string,
  authors: ReadonlyMap<string, number>
): GitBusFactorAlert | undefined {
  let total = 0;
  let topAuthor = '';
  let topCount = 0;
  for (const [author, count] of authors.entries()) {
    total += count;
    if (count > topCount) {
      topCount = count;
      topAuthor = author;
    }
  }
  if (total < MIN_BUS_FACTOR_COMMITS) {
    return undefined;
  }
  const pct = Math.round((1000 * topCount) / total) / 10;
  if (pct < MIN_BUS_FACTOR_PCT) {
    return undefined;
  }
  return {
    module: moduleName,
    commits: total,
    authors: authors.size,
    top_author: topAuthor,
    top_author_pct: pct,
  };
}

function collectBusFactorAlerts(commits: readonly ParsedCommitRecord[]): GitBusFactorAlert[] {
  const modAuthors = new Map<string, Map<string, number>>();
  for (const commit of commits) {
    const seenMods = new Set(commit.files.map((f) => moduleKeyFromPath(f)));
    for (const mod of seenMods) {
      let counts = modAuthors.get(mod);
      if (!counts) {
        counts = new Map<string, number>();
        modAuthors.set(mod, counts);
      }
      counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1);
    }
  }
  const alerts: GitBusFactorAlert[] = [];
  for (const [mod, authors] of modAuthors.entries()) {
    const alert = computeTopAuthorAlert(mod, authors);
    if (alert) {
      alerts.push(alert);
    }
  }
  alerts.sort(
    (a, b) =>
      b.top_author_pct - a.top_author_pct ||
      b.commits - a.commits ||
      a.module.localeCompare(b.module)
  );
  return alerts;
}

async function runGitCommand(
  args: readonly string[],
  cwd: string,
  executor: typeof execFile,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const execAsync = promisify(executor);
    const { stdout } = await execAsync('git', [...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      ...(signal ? { signal } : {}),
    });
    return stdout;
  } catch (err: unknown) {
    reportDebugCatchError('gitSignals.runGitCommand', err);
    return null;
  }
}

export async function collectGitArchSignals(
  projectPath: string,
  options: GitSignalsOptions = {}
): Promise<GitArchSignalsReport> {
  const safePath = resolveSafeProjectPath(projectPath);
  const executor = options.execFileFn ?? execFile;
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const minCochanges = options.minCochanges ?? DEFAULT_MIN_COCHANGES;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const toplevelRaw = await runGitCommand(
    ['-C', safePath, 'rev-parse', '--show-toplevel'],
    safePath,
    executor,
    options.signal
  );
  const toplevel = toplevelRaw?.trim() ?? '';
  if (!toplevel) {
    return emptyReport(false);
  }

  const rawLog = await runGitCommand(
    [
      '-C',
      toplevel,
      '-c',
      'core.quotePath=false',
      'log',
      '--no-merges',
      '-M',
      '--numstat',
      '--date=short',
      `--max-count=${maxCommits}`,
      '--pretty=format:\x1e%H\x1f%h\x1f%ad\x1f%an\x1f%s',
    ],
    toplevel,
    executor,
    options.signal
  );
  if (!rawLog || !rawLog.trim()) {
    return emptyReport(true);
  }

  const commits = parseGitLogRecords(rawLog);
  const { hotspots, touches } = collectHotspots(commits);
  const temporalCoupling = collectTemporalCoupling(commits, touches, minCochanges, minConfidence);
  return {
    detected: true,
    commits_analyzed: commits.length,
    hotspots,
    temporal_coupling_pairs: temporalCoupling,
    bus_factor_alerts: collectBusFactorAlerts(commits),
  };
}
