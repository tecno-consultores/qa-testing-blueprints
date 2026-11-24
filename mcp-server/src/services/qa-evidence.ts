// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  GateCheckStatus,
  QaCircuitBreakerAlert,
  QaTrackedFindingSummary,
  TrackedFindingStatus,
} from '../types.js';
import { reportDebugCatchError, sanitizeCommandSecrets } from '../utils/diagnosticFormatter.js';
import { resolveSafeChildPath } from './github-fetcher.js';

export const QA_EVIDENCE_REL_PATH = '.agents/.qa-evidence.json';
export const CERTIFY_STATE_REL_PATH = '.agents/.cache/certify_state.json';
export const EXIT_BREAKER_42 = 42;
export const DEFAULT_BREAKER_MAX_STREAK = 3;
const MAX_BREAKER_HISTORY_RUNS = 10;
const BREAKER_CODE = 'BREAKER_42' as const;
const UNKNOWN_TOKEN = '<unknown>';
const TMP_MASK = '/tmp/<tmp>';
const TRACKABLE_BREAKER_STAGES = new Set(['lint', 'unit', 'integration', 'ci', 'all']);
const CONTAINER_PREFIXES = ['/app/', '/workspace/', '/repo/', './'] as const;
const COLON_LINE_COL_SUFFIX_RE = /:\d{1,10}:\d{1,10}$/;
const COLON_LINE_SUFFIX_RE = /:\d{1,10}$/;
const PAREN_LINE_COL_SUFFIX_RE = /\(\d{1,10},\s*\d{1,10}\)$/;
const MEM_ADDR_RE = /\b0x[0-9a-fA-F]{6,16}\b/g;
const TMP_PATH_RE = /\/tmp\/[^\s"':)]+/g;
const MESSAGE_NORMALIZATION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [MEM_ADDR_RE, '<addr>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.\d{1,9}[+-]\d{2}:\d{2}\b/g, '<ts>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.\d{1,9}Z\b/g, '<ts>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.\d{1,9}\b/g, '<ts>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\b/g, '<ts>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}Z\b/g, '<ts>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\b/g, '<ts>'],
  [/\b\d+\.\d+\s*(?:ms|s|sec|seconds)\b/gi, '<dur>'],
  [/\b\d+\s*(?:ms|s|sec|seconds)\b/gi, '<dur>'],
  [TMP_PATH_RE, TMP_MASK],
  [/:\d{1,10}:\d{1,10}/g, ''],
  [/:\d{1,10}\b/g, ''],
  [/\(\d{1,10},\s*\d{1,10}\)/g, ''],
  [/\b(?:line|línea|linea|col|column)\s+\d{1,10}\b/gi, ''],
  [/\bL(?!0[1-9]\b|1[0-3]\b)\d{1,10}\b/gi, ''],
  [/\s+/g, ' '],
];

const DOC_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.rst',
  '.adoc',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.webp',
  '.pdf',
]);

export function isDocFilePath(fp: string): boolean {
  const normalized = fp.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  if (
    normalized.startsWith('.agents/skills/') ||
    normalized.startsWith('.agents/rules/') ||
    normalized.startsWith('.agents/schemas/')
  ) {
    return false;
  }
  if (normalized.endsWith('.md')) return true;
  const inDocsDir = normalized.startsWith('docs/') || normalized.includes('/docs/');
  if (!inDocsDir) return false;
  const ext = path.posix.extname(normalized);
  return DOC_EXTENSIONS.has(ext);
}

function unquoteGitPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

export function extractPathsFromPorcelainLine(rawLine: string): string[] {
  const cleaned =
    rawLine.length > 3 && rawLine[2] === ' '
      ? rawLine.slice(3)
      : rawLine.trim().replace(/^\S+\s+/, '');
  const arrowIdx = cleaned.indexOf(' -> ');
  if (arrowIdx !== -1) {
    return [
      unquoteGitPath(cleaned.slice(0, arrowIdx)),
      unquoteGitPath(cleaned.slice(arrowIdx + 4)),
    ];
  }
  return [unquoteGitPath(cleaned)];
}

export function resolveExplicitGitRoot(projectPath: string): string | null {
  let current = path.resolve(projectPath);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function isEphemeralQaArtifactPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!norm) return true;
  if (norm === QA_EVIDENCE_REL_PATH || norm.endsWith('/.qa-evidence.json')) return true;
  if (norm === '.agents/.cache' || norm.startsWith('.agents/.cache/') || norm.includes('/.agents/.cache/')) {
    return true;
  }
  if (norm === '.agents/artifacts' || norm.startsWith('.agents/artifacts/') || norm.includes('/.agents/artifacts/')) {
    return true;
  }
  return norm === 'graphify-out' || norm.startsWith('graphify-out/') || norm.includes('/graphify-out/');
}

function isEphemeralOrDocIgnoredForFingerprint(relPath: string): boolean {
  return isEphemeralQaArtifactPath(relPath) || isDocFilePath(relPath);
}

function hashSingleCodeEntry(gitRoot: string, relFile: string): string {
  const full = path.join(gitRoot, relFile);
  try {
    const st = fs.statSync(full);
    if (st.isFile()) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      return `${relFile}:${digest}`;
    }
    if (st.isDirectory()) {
      return `${relFile}:DIR`;
    }
  } catch (err: unknown) {
    // Deleted or inaccessible working-tree file is fingerprinted deterministically as DELETED
    reportDebugCatchError(`qaEvidence.hashSingleCodeEntry(${relFile})`, err);
  }
  return `${relFile}:DELETED`;
}

function readHeadCommitOrFallback(gitRoot: string, execFileSyncFn: typeof execFileSync): string {
  try {
    const out = execFileSyncFn('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim() || 'UNBORN_HEAD';
  } catch (err: unknown) {
    // Repository with no initial commit yet falls back to UNBORN_HEAD sentinel
    reportDebugCatchError('qaEvidence.readHeadCommitOrFallback', err);
    return 'UNBORN_HEAD';
  }
}

export interface CodeStateFingerprint {
  isGitRepo: boolean;
  gitRoot: string | null;
  hasDirtyCodeChanges: boolean;
  codeFiles: string[];
  fingerprint: string | null;
}

function collectChangedCodeFiles(rawLines: readonly string[]): string[] {
  const codeSet = new Set<string>();
  for (const line of rawLines) {
    for (const p of extractPathsFromPorcelainLine(line)) {
      const normalized = p.replace(/\\/g, '/').replace(/^\.\//, '');
      if (!isEphemeralOrDocIgnoredForFingerprint(normalized)) {
        codeSet.add(normalized);
      }
    }
  }
  return Array.from(codeSet).sort((a, b) => a.localeCompare(b));
}

export function computeCodeStateFingerprint(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): CodeStateFingerprint {
  const gitRoot = resolveExplicitGitRoot(projectPath);
  if (!gitRoot) {
    return {
      isGitRepo: false,
      gitRoot: null,
      hasDirtyCodeChanges: false,
      codeFiles: [],
      fingerprint: null,
    };
  }

  try {
    const raw = execFileSyncFn(
      'git',
      ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'],
      {
        cwd: gitRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    const rawLines = String(raw)
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    const codeFiles = collectChangedCodeFiles(rawLines);
    if (codeFiles.length === 0) {
      return {
        isGitRepo: true,
        gitRoot,
        hasDirtyCodeChanges: false,
        codeFiles: [],
        fingerprint: null,
      };
    }

    const headSha = readHeadCommitOrFallback(gitRoot, execFileSyncFn);
    const hasher = crypto.createHash('sha256');
    hasher.update(`HEAD:${headSha}\n`);
    for (const relFile of codeFiles) {
      hasher.update(`${hashSingleCodeEntry(gitRoot, relFile)}\n`);
    }

    return {
      isGitRepo: true,
      gitRoot,
      hasDirtyCodeChanges: true,
      codeFiles,
      fingerprint: hasher.digest('hex'),
    };
  } catch (err: unknown) {
    // Git CLI unavailable or non-git workspace yields null fingerprint so gate reports SKIPPED
    reportDebugCatchError('qaEvidence.computeCodeStateFingerprint', err);
    return {
      isGitRepo: true,
      gitRoot,
      hasDirtyCodeChanges: false,
      codeFiles: [],
      fingerprint: null,
    };
  }
}

interface QaStageStamp {
  fingerprint: string;
  recorded_at: string;
}

interface QaEvidenceDocument {
  version: 1;
  stages: Record<string, QaStageStamp>;
}

const RECORDABLE_STAGES = new Set(['lint', 'unit', 'migration', 'integration', 'ci', 'all']);

function resolveSafeEvidenceTarget(root: string, relPath: string): string {
  const safePath = resolveSafeChildPath(root, relPath);
  const segments = relPath.split(/[/\\]+/).filter(Boolean);
  let cursor = path.resolve(root);
  for (const seg of segments) {
    cursor = path.join(cursor, seg);
    const stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      throw new Error(`Ruta symlink rechazada por seguridad: ${cursor}`);
    }
  }
  return safePath;
}

function readEvidenceDocument(evidencePath: string): QaEvidenceDocument {
  try {
    if (fs.existsSync(evidencePath)) {
      const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as Partial<QaEvidenceDocument>;
      if (parsed && typeof parsed === 'object' && parsed.stages && typeof parsed.stages === 'object') {
        return { version: 1, stages: { ...parsed.stages } };
      }
    }
  } catch (err: unknown) {
    // Corrupt/unreadable ephemeral evidence file resets cleanly; missing stamp still fails dirty checks
    reportDebugCatchError(`qaEvidence.readEvidenceDocument(${evidencePath})`, err);
  }
  return { version: 1, stages: {} };
}

export function recordQaStageEvidence(
  projectPath: string,
  stage: string,
  status: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): void {
  if (status !== 'PASSED' || !RECORDABLE_STAGES.has(stage)) {
    return;
  }

  const state = computeCodeStateFingerprint(projectPath, execFileSyncFn);
  if (!state.gitRoot) {
    return;
  }

  const stampValue: QaStageStamp = {
    fingerprint: state.fingerprint ?? 'CLEAN_HEAD',
    recorded_at: new Date().toISOString(),
  };

  try {
    const evidencePath = resolveSafeEvidenceTarget(state.gitRoot, QA_EVIDENCE_REL_PATH);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    const doc = readEvidenceDocument(evidencePath);
    doc.stages[stage] = stampValue;
    if (stage === 'all' || stage === 'ci') {
      doc.stages.lint = stampValue;
      doc.stages.unit = stampValue;
      doc.stages.integration = stampValue;
    }
    fs.writeFileSync(evidencePath, JSON.stringify(doc, null, 2), 'utf8');
  } catch (err: unknown) {
    // Read-only mounted workspaces cannot persist ephemeral cache stamps; emit debug trace only
    reportDebugCatchError('qaEvidence.recordQaStageEvidence', err);
  }
}

export interface LintEvidenceCheckResult {
  passed: boolean;
  status: GateCheckStatus;
  blockers: string[];
}

export function checkLintEvidenceForDirtyCode(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): LintEvidenceCheckResult {
  const state = computeCodeStateFingerprint(projectPath, execFileSyncFn);
  if (!state.gitRoot || !state.fingerprint) {
    return { passed: false, status: 'SKIPPED', blockers: [] };
  }

  const evidencePath = resolveSafeEvidenceTarget(state.gitRoot, QA_EVIDENCE_REL_PATH);
  const doc = readEvidenceDocument(evidencePath);
  const lintStamp = doc.stages.lint;

  if (lintStamp && lintStamp.fingerprint === state.fingerprint) {
    return { passed: true, status: 'PASSED', blockers: [] };
  }

  const sampleFiles = state.codeFiles.slice(0, 3).join(', ');
  const suffix = state.codeFiles.length > 3 ? ` (+${state.codeFiles.length - 3} más)` : '';
  return {
    passed: false,
    status: 'FAILED',
    blockers: [
      `Falta evidencia vigente de run_ephemeral_qa(stage="lint") para el árbol de código modificado (${sampleFiles}${suffix}). Ejecuta stage="lint" antes de certificar pre-push.`,
    ],
  };
}

export interface RawFindingInput {
  layer?: string;
  stack?: string;
  relative_file?: string;
  file?: string;
  path?: string;
  rule_or_test_name?: string;
  rule?: string;
  test_name?: string;
  code?: string;
  canonical_message?: string;
  symbol?: string;
  message?: string;
  error_summary?: string;
}

export interface NormalizedFindingRecord {
  fingerprint: string;
  layer: string;
  stack: string;
  relative_file: string;
  rule_or_test_name: string;
  canonical_message: string;
}

interface CertifyRunRecord {
  recorded_at: string;
  fingerprints: string[];
  items: Record<string, NormalizedFindingRecord>;
}

interface CertifySessionRecord {
  updated_at: string;
  runs: CertifyRunRecord[];
  stage_runs: Record<string, CertifyRunRecord[]>;
  streaks?: Record<string, number>;
  oscillations?: Record<string, number>;
}

interface CertifyStateDocument {
  version: 1;
  sessions: Record<string, CertifySessionRecord>;
}

function firstNonEmptyString(values: Array<string | undefined>, fallback: string): string {
  for (const val of values) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return fallback;
}

function stripKnownContainerPrefixes(filePath: string): string {
  let current = filePath;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of CONTAINER_PREFIXES) {
      if (current.startsWith(prefix)) {
        current = current.slice(prefix.length);
        changed = true;
      }
    }
  }
  return current;
}

function trimTrailingSlashes(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '/') {
    end -= 1;
  }
  return raw.slice(0, end);
}

function normalizeRelativeFindingFile(rawPath: string, workspacePath: string): string {
  let cleaned = sanitizeCommandSecrets(rawPath).replace(/\\/g, '/').trim();
  cleaned = cleaned
    .replace(COLON_LINE_COL_SUFFIX_RE, '')
    .replace(COLON_LINE_SUFFIX_RE, '')
    .replace(PAREN_LINE_COL_SUFFIX_RE, '');
  const wsPrefix = `${trimTrailingSlashes(path.resolve(workspacePath).replace(/\\/g, '/'))}/`;
  if (cleaned.startsWith(wsPrefix)) {
    cleaned = cleaned.slice(wsPrefix.length);
  }
  cleaned = stripKnownContainerPrefixes(cleaned).replace(TMP_PATH_RE, TMP_MASK);
  return cleaned || UNKNOWN_TOKEN;
}

function normalizeCanonicalMessage(rawMessage: string): string {
  let cleaned = sanitizeCommandSecrets(rawMessage);
  for (const [pattern, replacement] of MESSAGE_NORMALIZATION_RULES) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.trim();
}

export function computeFindingFingerprint(
  finding: Omit<NormalizedFindingRecord, 'fingerprint'>
): string {
  const canonical = [
    finding.layer,
    finding.stack,
    finding.relative_file,
    finding.rule_or_test_name,
    finding.canonical_message,
  ].join('\x1f');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

export function normalizeFindingForFingerprint(
  raw: RawFindingInput,
  workspacePath: string,
  defaultLayer = 'qa'
): NormalizedFindingRecord {
  const layer = firstNonEmptyString([raw.layer], defaultLayer).toLowerCase();
  const stack = firstNonEmptyString([raw.stack], 'generic').toLowerCase();
  const relative_file = normalizeRelativeFindingFile(
    firstNonEmptyString([raw.relative_file, raw.file, raw.path], UNKNOWN_TOKEN),
    workspacePath
  );
  const rule_or_test_name = normalizeCanonicalMessage(
    firstNonEmptyString([raw.rule_or_test_name, raw.rule, raw.test_name, raw.code], '<unspecified>')
  );
  const canonical_message = normalizeCanonicalMessage(
    firstNonEmptyString(
      [raw.canonical_message, raw.symbol, raw.message, raw.error_summary],
      rule_or_test_name
    )
  );
  const base = { layer, stack, relative_file, rule_or_test_name, canonical_message };
  return { ...base, fingerprint: computeFindingFingerprint(base) };
}

function runGitTrimmed(
  cwd: string,
  args: string[],
  execFileSyncFn: typeof execFileSync
): string | null {
  try {
    const raw = execFileSyncFn('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const out = String(raw).trim();
    return out || null;
  } catch (err: unknown) {
    // Non-git or unborn branch metadata falls back to path-based session key
    reportDebugCatchError(`qaEvidence.readGitCommandOutput(${args.join(' ')})`, err);
    return null;
  }
}

export function resolveQaSessionKey(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): string {
  const root = resolveExplicitGitRoot(projectPath) ?? path.resolve(projectPath);
  const branchRaw = runGitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD'], execFileSyncFn);
  if (!branchRaw) {
    return 'nogit:unborn';
  }
  const branch = branchRaw === 'HEAD' ? 'detached' : branchRaw;
  for (const ref of ['origin/main', 'main']) {
    const base = runGitTrimmed(root, ['merge-base', 'HEAD', ref], execFileSyncFn);
    if (base) {
      return `${branch}:${base.slice(0, 12)}`;
    }
  }
  const head = runGitTrimmed(root, ['rev-parse', '--verify', 'HEAD'], execFileSyncFn);
  return `${branch}:${head ? head.slice(0, 12) : 'unborn'}`;
}

function parseNumericStageRecord(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function normalizeStageRunsMap(raw: unknown): Record<string, CertifyRunRecord[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const stageRuns: Record<string, CertifyRunRecord[]> = {};
  for (const [stageKey, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(arr)) {
      stageRuns[stageKey] = arr as CertifyRunRecord[];
    }
  }
  return stageRuns;
}

function normalizeSessionEntry(entry: unknown): CertifySessionRecord {
  const empty: CertifySessionRecord = { updated_at: '', runs: [], stage_runs: {} };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return empty;
  }
  const rawObj = entry as {
    updated_at?: unknown;
    runs?: unknown;
    stage_runs?: unknown;
    streaks?: unknown;
    oscillations?: unknown;
  };
  const streaks = parseNumericStageRecord(rawObj.streaks);
  const oscillations = parseNumericStageRecord(rawObj.oscillations);
  return {
    updated_at: typeof rawObj.updated_at === 'string' ? rawObj.updated_at : '',
    runs: Array.isArray(rawObj.runs) ? (rawObj.runs as CertifyRunRecord[]) : [],
    stage_runs: normalizeStageRunsMap(rawObj.stage_runs),
    ...(streaks ? { streaks } : {}),
    ...(oscillations ? { oscillations } : {}),
  };
}

function readCertifyStateDocument(root: string, relPath: string): { statePath: string; doc: CertifyStateDocument } {
  const statePath = resolveSafeEvidenceTarget(root, relPath);
  if (!fs.existsSync(statePath)) {
    return { statePath, doc: { version: 1, sessions: {} } };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { sessions?: unknown };
    if (!parsed || typeof parsed !== 'object' || !parsed.sessions || typeof parsed.sessions !== 'object' || Array.isArray(parsed.sessions)) {
      return { statePath, doc: { version: 1, sessions: {} } };
    }
    const sessions: Record<string, CertifySessionRecord> = {};
    for (const [key, entry] of Object.entries(parsed.sessions as Record<string, unknown>)) {
      sessions[key] = normalizeSessionEntry(entry);
    }
    return { statePath, doc: { version: 1, sessions } };
  } catch (err: unknown) {
    // Corrupt circuit-breaker state resets cleanly rather than crashing gate evaluation
    reportDebugCatchError(`qaEvidence.readCertifyStateDocument(${statePath})`, err);
    return { statePath, doc: { version: 1, sessions: {} } };
  }
}

export function safeChmodSync(
  targetPath: string,
  mode: number,
  chmodFn: (p: string, m: number) => void = fs.chmodSync
): void {
  try {
    chmodFn(targetPath, mode);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'EPERM' && code !== 'EROFS' && code !== 'ENOSYS') {
      throw err;
    }
  }
}

function writeCertifyStateDocument(root: string, relPath: string, doc: CertifyStateDocument): void {
  const statePath = resolveSafeEvidenceTarget(root, relPath);
  const parent = path.dirname(statePath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  safeChmodSync(parent, 0o700);
  fs.writeFileSync(statePath, `${JSON.stringify(doc, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  safeChmodSync(statePath, 0o600);
}

function countOscillations(historySets: ReadonlyArray<Set<string>>, fingerprint: string): number {
  let seenBefore = false;
  let wasAbsent = false;
  let oscillations = 0;
  for (const fpSet of historySets) {
    const present = fpSet.has(fingerprint);
    if (present && seenBefore && wasAbsent) {
      oscillations += 1;
    }
    if (present) {
      seenBefore = true;
      wasAbsent = false;
    } else if (seenBefore) {
      wasAbsent = true;
    }
  }
  return oscillations;
}

function countTrailingStreak(historySets: ReadonlyArray<Set<string>>, fingerprint: string): number {
  let streak = 0;
  for (let idx = historySets.length - 1; idx >= 0; idx -= 1) {
    const entrySet = historySets[idx];
    if (!entrySet || !entrySet.has(fingerprint)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function evaluateFindingHistory(
  finding: NormalizedFindingRecord,
  historySets: ReadonlyArray<Set<string>>,
  maxStreak: number
): { summary: QaTrackedFindingSummary; blocking: boolean } {
  const fp = finding.fingerprint;
  const oscillations = countOscillations([...historySets, new Set([fp])], fp);
  const prevSet = historySets.length > 0 ? historySets[historySets.length - 1] : null;
  let status: TrackedFindingStatus = 'NEW';
  let consecutive_streak = 1;
  if (prevSet && prevSet.has(fp)) {
    status = 'PERSISTENT';
    consecutive_streak = 1 + countTrailingStreak(historySets, fp);
  } else if (oscillations > 0) {
    status = 'REGRESSION_OSCILLATION';
  }
  const blocking = consecutive_streak >= maxStreak || oscillations >= 1;
  return {
    summary: {
      ...finding,
      status,
      consecutive_streak,
      oscillations,
    },
    blocking,
  };
}

export interface RecordStageFindingsOptions {
  readonly maxStreak?: number;
  readonly execFileSyncFn?: typeof execFileSync;
}

export function recordQaStageFindingsState(
  projectPath: string,
  stage: string,
  rawFindings: readonly RawFindingInput[],
  options: RecordStageFindingsOptions = {}
): QaCircuitBreakerAlert {
  const maxStreak = options.maxStreak ?? DEFAULT_BREAKER_MAX_STREAK;
  const execFileSyncFn = options.execFileSyncFn ?? execFileSync;
  if (!TRACKABLE_BREAKER_STAGES.has(stage)) {
    return {
      triggered: false,
      code: null,
      session_key: '',
      max_streak_observed: 0,
      oscillations_observed: 0,
      blocking_findings: [],
    };
  }

  const root = resolveExplicitGitRoot(projectPath) ?? path.resolve(projectPath);
  const sessionKey = resolveQaSessionKey(root, execFileSyncFn);
  const { doc } = readCertifyStateDocument(root, CERTIFY_STATE_REL_PATH);
  const session = doc.sessions[sessionKey] ?? { updated_at: '', runs: [], stage_runs: {} };
  const priorRuns = (session.stage_runs[stage] ?? []).slice(-MAX_BREAKER_HISTORY_RUNS);
  const historySets = priorRuns.map((run) => new Set(run.fingerprints));

  const deduped = new Map<string, NormalizedFindingRecord>();
  for (const item of rawFindings) {
    const normalized = normalizeFindingForFingerprint(item, root, stage);
    deduped.set(normalized.fingerprint, normalized);
  }
  const orderedKeys = Array.from(deduped.keys()).sort((a, b) => a.localeCompare(b));

  const blockingFindings: QaTrackedFindingSummary[] = [];
  let maxStreakObserved = 0;
  let oscillationsObserved = 0;
  const itemsRecord: Record<string, NormalizedFindingRecord> = {};

  for (const fp of orderedKeys) {
    const finding = deduped.get(fp) as NormalizedFindingRecord;
    itemsRecord[fp] = finding;
    const evaluated = evaluateFindingHistory(finding, historySets, maxStreak);
    maxStreakObserved = Math.max(maxStreakObserved, evaluated.summary.consecutive_streak);
    oscillationsObserved += evaluated.summary.oscillations;
    if (evaluated.blocking) {
      blockingFindings.push(evaluated.summary);
    }
  }

  const nowIso = new Date().toISOString();
  const nextStageRuns = [
    ...priorRuns,
    { recorded_at: nowIso, fingerprints: orderedKeys, items: itemsRecord },
  ].slice(-MAX_BREAKER_HISTORY_RUNS);
  session.updated_at = nowIso;
  session.stage_runs[stage] = nextStageRuns;
  session.streaks = { ...(session.streaks ?? {}), [stage]: maxStreakObserved };
  session.oscillations = { ...(session.oscillations ?? {}), [stage]: oscillationsObserved };
  doc.sessions[sessionKey] = session;
  try {
    writeCertifyStateDocument(root, CERTIFY_STATE_REL_PATH, doc);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'EROFS' && code !== 'EACCES' && code !== 'EPERM') {
      throw err;
    }
    reportDebugCatchError('qaEvidence.recordQaStageFindingsState', err);
  }

  const triggered = blockingFindings.length > 0;
  return {
    triggered,
    code: triggered ? BREAKER_CODE : null,
    session_key: sessionKey,
    max_streak_observed: maxStreakObserved,
    oscillations_observed: oscillationsObserved,
    blocking_findings: blockingFindings,
  };
}

export function resetQaFindingsState(
  projectPath: string,
  execFileSyncFn: typeof execFileSync = execFileSync
): string {
  const root = resolveExplicitGitRoot(projectPath) ?? path.resolve(projectPath);
  const sessionKey = resolveQaSessionKey(root, execFileSyncFn);
  const { doc } = readCertifyStateDocument(root, CERTIFY_STATE_REL_PATH);
  delete doc.sessions[sessionKey];
  writeCertifyStateDocument(root, CERTIFY_STATE_REL_PATH, doc);
  return sessionKey;
}
