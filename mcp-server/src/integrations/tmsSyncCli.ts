// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { randomUUID } from 'node:crypto';
import * as dns from 'node:dns';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_VERSION } from '../services/github-fetcher.js';
import {
  REDACTED_PROMPT_INJECTION,
  REDACTED_SECRET,
  guardToolCallInput,
  inspectPromptSafety,
  redactPiiAndSecrets,
  sanitizeUntrustedOutput,
} from '../security/promptGuard.js';
import {
  formatFailVerboseReport,
  formatPassQuietSummary,
  pickAt,
  reportDebugCatchError,
  sanitizeCommandSecrets,
  throwIfSignalAborted,
} from '../utils/diagnosticFormatter.js';

export const TMS_PROVIDERS = ['jira', 'zephyr', 'xray', 'github-issues'] as const;
export const TMS_SYNC_MODES = ['inventory', 'push-results', 'pull-stories'] as const;

const PROVIDER_JIRA = 'jira' as const;
const PROVIDER_ZEPHYR = 'zephyr' as const;
const PROVIDER_XRAY = 'xray' as const;
const PROVIDER_GITHUB = 'github-issues' as const;

const MODE_INVENTORY = 'inventory' as const;
const MODE_PUSH = 'push-results' as const;
const MODE_PULL = 'pull-stories' as const;

const STATUS_TRACEABILITY_OK = 'TRACEABILITY_OK' as const;
const STATUS_GAPS_DETECTED = 'GAPS_DETECTED' as const;
const STATUS_DRY_RUN = 'DRY_RUN' as const;
const STATUS_SKIPPED = 'SKIPPED' as const;
const STATUS_SYNCED = 'SYNCED' as const;
const STATUS_ALREADY_RUNNING = 'SYNC_ALREADY_RUNNING' as const;
const STATUS_PULL_OK = 'PULL_OK' as const;
const STATUS_ERROR = 'ERROR' as const;

const CODE_SSRF_BLOCKED = 'SSRF_BLOCKED' as const;
const CODE_PATH_TRAVERSAL = 'PATH_TRAVERSAL' as const;
const CODE_XXE_DETECTED = 'XXE_DETECTED' as const;
const CODE_INVALID_INPUT = 'INVALID_INPUT' as const;

const HEADER_CONTENT_TYPE = 'Content-Type';
const HEADER_ACCEPT = 'Accept';
const HEADER_AUTHORIZATION = 'Authorization';
const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';
const HEADER_USER_AGENT = 'User-Agent';
const MIME_JSON = 'application/json';
const USER_AGENT_VALUE = `qa-11x-tms-sync/${MCP_SERVER_VERSION}`;

const STAGE_TMS_SYNC = 'sync_enterprise_tms';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 180_000;
const MAX_DETAIL_LEN = 220;

const IGNORED_SCAN_DIRS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.venv',
  '__pycache__',
  '.next',
]);

const ENV_KEY_MAP: Readonly<Record<TmsProvider, readonly string[]>> = {
  jira: ['JIRA_API_TOKEN', 'TMS_API_TOKEN'],
  zephyr: ['ZEPHYR_API_TOKEN', 'TMS_API_TOKEN'],
  xray: ['XRAY_API_TOKEN', 'XRAY_CLIENT_SECRET', 'TMS_API_TOKEN'],
  'github-issues': ['GITHUB_TOKEN', 'TMS_API_TOKEN'],
};

const DEFAULT_BASE_URLS: Readonly<Record<TmsProvider, string>> = {
  jira: '',
  zephyr: 'https://api.zephyrscale.smartbear.com',
  xray: 'https://xray.cloud.getxray.app',
  'github-issues': 'https://api.github.com',
};

const SECRET_ENV_KEYS: readonly string[] = [
  'JIRA_API_TOKEN',
  'ZEPHYR_API_TOKEN',
  'XRAY_API_TOKEN',
  'XRAY_CLIENT_SECRET',
  'GITHUB_TOKEN',
  'TMS_API_TOKEN',
];

const ALL_TAG_RE = /@(?:JIRA|ZEPHYR|XRAY|TC)-[\w-]+|@(?:GH|AC)-\d+/gi;
const PRIMARY_TAG_PREFIX_RE = /^@(?:JIRA|ZEPHYR|XRAY|GH|TC)-/;
const AUTH_HEADER_RE = /\b(Bearer|Basic)\s+[a-z0-9._+/=-]+/gi;
const SAFE_KEY_RE = /^[A-Za-z0-9._-]+$/;
const SAFE_REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const NUMERIC_HOST_RE = /^(?:\d+|0x[0-9a-f]+)$/i;
const TRANSIENT_TRANSPORT_RE = /\b(?:ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|fetch failed)\b/i;

export type TmsProvider = (typeof TMS_PROVIDERS)[number];
export type TmsSyncMode = (typeof TMS_SYNC_MODES)[number];
export type TmsSyncStatus =
  | typeof STATUS_TRACEABILITY_OK
  | typeof STATUS_GAPS_DETECTED
  | typeof STATUS_DRY_RUN
  | typeof STATUS_SKIPPED
  | typeof STATUS_SYNCED
  | typeof STATUS_ALREADY_RUNNING
  | typeof STATUS_PULL_OK
  | typeof STATUS_ERROR;

export type TmsSecurityErrorCode =
  | typeof CODE_SSRF_BLOCKED
  | typeof CODE_PATH_TRAVERSAL
  | typeof CODE_XXE_DETECTED
  | typeof CODE_INVALID_INPUT;

export class MissingTmsCredentialsError extends Error {
  readonly code = 'MISSING_TMS_CREDENTIALS' as const;
  readonly provider: TmsProvider;
  readonly expectedEnvVars: readonly string[];

  constructor(provider: TmsProvider, expectedEnvVars: readonly string[]) {
    super(
      `Credenciales faltantes para proveedor '${provider}' en modo live. Define: ${expectedEnvVars.join(' o ')}.`
    );
    this.name = 'MissingTmsCredentialsError';
    this.provider = provider;
    this.expectedEnvVars = [...expectedEnvVars];
  }
}

export class TmsSecurityError extends Error {
  readonly code: TmsSecurityErrorCode;

  constructor(code: TmsSecurityErrorCode, message: string) {
    super(message);
    this.name = 'TmsSecurityError';
    this.code = code;
  }
}

export interface FetchRequestInit {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type FetchPort = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>;

export type HostLookupPort = (
  hostname: string
) => Promise<ReadonlyArray<{ readonly address: string }>>;

export interface TmsSyncDependencies {
  fetchPort?: FetchPort;
  lookupHost?: HostLookupPort;
  env?: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  nowMs?: () => number;
  randomUuid?: () => string;
  signal?: AbortSignal;
}

export interface TmsSyncArgs {
  mode: TmsSyncMode;
  provider?: TmsProvider;
  targetDir?: string;
  junitXmlPath?: string;
  junitXmlContent?: string;
  baseUrl?: string;
  projectKey?: string;
  issueKey?: string;
  testExecutionKey?: string;
  repo?: string;
  requiredKeys?: readonly string[];
  dryRun?: boolean;
  timeoutMs?: number;
  workspaceRoot?: string;
}

export interface MappedTestRecord {
  file: string;
  tags: string[];
}

export interface InventorySummary {
  totalTestFiles: number;
  mappedTests: MappedTestRecord[];
  untaggedTests: string[];
  discoveredTags: string[];
  uncoveredRequirements: string[];
  coveragePct: number;
  verdict: typeof STATUS_TRACEABILITY_OK | typeof STATUS_GAPS_DETECTED;
}

export interface ParsedJunitCase {
  name: string;
  classname: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  mappedKey: string;
  tags: string[];
  detail: string;
}

export interface ParsedJunitSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  cases: ParsedJunitCase[];
}

export interface PullStoryOutput {
  storyKey: string;
  title: string;
  criteria: string;
  featureContent: string;
  promptInjectionNeutralized: boolean;
  matchedSafetyRules: string[];
}

export interface TmsSyncResult {
  mode: TmsSyncMode;
  provider: TmsProvider;
  status: TmsSyncStatus;
  dryRun: boolean;
  endpoint?: string;
  idempotencyKey?: string;
  httpStatus?: number;
  attempts: number;
  durationMs: number;
  payload?: unknown;
  inventory?: InventorySummary;
  junitSummary?: ParsedJunitSummary;
  pulledStory?: PullStoryOutput;
  message: string;
}

export interface TmsCliResult {
  exitCode: number;
  output: string;
  result?: TmsSyncResult;
}

interface XmlTagToken {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attrs: Record<string, string>;
  endPos: number;
  openPos: number;
}

interface JunitBuilderState {
  currentCase: ParsedJunitCase | null;
  currentBodyStart: number;
  currentFailureMessage: string;
  cases: ParsedJunitCase[];
  sawSuiteOrCase: boolean;
}

interface ResolvedCredentials {
  token: string;
  headerValue: string;
}

interface StoryRawFields {
  storyKey: string;
  rawTitle: string;
  rawCriteria: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getEnvMap(deps?: TmsSyncDependencies): Readonly<Record<string, string | undefined>> {
  return deps?.env ?? process.env;
}

function getNowMs(deps?: TmsSyncDependencies): number {
  return deps?.nowMs ? deps.nowMs() : Date.now();
}

function defaultFetchPort(url: string, init: FetchRequestInit): Promise<FetchResponseLike> {
  return globalThis.fetch(url, { ...init, redirect: 'error' });
}

function collectSecretsFromEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  const secrets: string[] = [];
  for (const key of SECRET_ENV_KEYS) {
    const val = env[key]?.trim();
    if (val && val.length >= 4) {
      secrets.push(val);
    }
  }
  return secrets;
}

export function redactTmsSecrets(
  rawText: string,
  env: Readonly<Record<string, string | undefined>> = {}
): string {
  let cleaned = sanitizeCommandSecrets(rawText);
  cleaned = redactPiiAndSecrets(cleaned, { strictPii: false });
  cleaned = cleaned.replace(AUTH_HEADER_RE, `$1 ${REDACTED_SECRET}`);
  for (const secret of collectSecretsFromEnv(env)) {
    if (cleaned.includes(secret)) {
      cleaned = cleaned.split(secret).join(REDACTED_SECRET);
    }
  }
  return cleaned;
}

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function assertValidCandidatePath(workspaceRoot: string, candidatePath: string): void {
  if (candidatePath.includes('\0') || workspaceRoot.includes('\0')) {
    throw new TmsSecurityError(CODE_PATH_TRAVERSAL, 'Ruta rechazada por contener bytes nulos.');
  }
  if (candidatePath.trim().length === 0) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'La ruta solicitada no puede estar vacía.');
  }
}

function assertExistingSafeTarget(
  rootResolved: string,
  candidateResolved: string,
  candidatePath: string,
  expectedKind: 'dir' | 'file'
): string {
  if (!fs.existsSync(candidateResolved)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Ruta inexistente: '${candidatePath}'.`);
  }
  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(candidateResolved);
  if (!isContainedPath(rootReal, targetReal)) {
    throw new TmsSecurityError(
      CODE_PATH_TRAVERSAL,
      `Enlace simbólico fuera del workspace detectado en '${candidatePath}'.`
    );
  }
  const stat = fs.statSync(targetReal);
  const matchesKind = expectedKind === 'dir' ? stat.isDirectory() : stat.isFile();
  if (!matchesKind) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Tipo inválido en '${candidatePath}' (se esperaba ${expectedKind}).`);
  }
  return targetReal;
}

export function resolveSafeWorkspacePath(
  workspaceRoot: string,
  candidatePath: string,
  expectedKind: 'dir' | 'file'
): string {
  assertValidCandidatePath(workspaceRoot, candidatePath);
  const rootResolved = path.resolve(workspaceRoot);
  const candidateResolved = path.resolve(rootResolved, candidatePath);
  if (!isContainedPath(rootResolved, candidateResolved)) {
    throw new TmsSecurityError(
      CODE_PATH_TRAVERSAL,
      `La ruta '${candidatePath}' escapa los límites del workspace.`
    );
  }
  return assertExistingSafeTarget(rootResolved, candidateResolved, candidatePath, expectedKind);
}

function isLowPrivateOctet(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  return (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

function isHighPrivateOctet(a: number, b: number): boolean {
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv4Address(ipv4: string): boolean {
  const parts = ipv4.split('.').map((seg) => Number(seg));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  return isLowPrivateOctet(a, b) || isHighPrivateOctet(a, b);
}

const EMBEDDED_IPV4_RE = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

function parseIpv6SegmentGroup(part: string): number[] | null {
  if (!part) return [];
  const tokens = part.split(':');
  const nums: number[] = [];
  for (const [idx, tok] of tokens.entries()) {
    if (idx === tokens.length - 1 && tok.includes('.') && net.isIPv4(tok)) {
      const octMatch = EMBEDDED_IPV4_RE.exec(tok);
      if (!octMatch) return null;
      nums.push(
        (Number(octMatch[1]) << 8) | Number(octMatch[2]),
        (Number(octMatch[3]) << 8) | Number(octMatch[4])
      );
      continue;
    }
    const parsed = Number.parseInt(tok, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null;
    nums.push(parsed);
  }
  return nums;
}

function expandIpv6Hextets(rawHost: string): number[] | null {
  const lower = rawHost.toLowerCase();
  const firstSep = lower.indexOf('::');
  if (firstSep === -1) {
    const direct = parseIpv6SegmentGroup(lower);
    return direct && direct.length === 8 ? direct : null;
  }
  if (lower.indexOf('::', firstSep + 2) !== -1) return null;
  const head = parseIpv6SegmentGroup(lower.slice(0, firstSep));
  const tail = parseIpv6SegmentGroup(lower.slice(firstSep + 2));
  if (!head || !tail) return null;
  const missing = 8 - (head.length + tail.length);
  return missing >= 0 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

function hextetsToIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isIpv4MappedPrefix(hextets: readonly number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  );
}

function isPrivateOrReservedIpv6(rawHost: string): boolean {
  if (rawHost.includes('%')) return true;
  const hextets = expandIpv6Hextets(rawHost);
  if (!hextets) return true;
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, , , h6 = 0, h7 = 0] = hextets;
  if (hextets.every((val, idx) => (idx < 7 ? val === 0 : val === 0 || val === 1))) return true;
  if ((h0 & 0xffc0) === 0xfe80 || (h0 & 0xfe00) === 0xfc00 || (h0 & 0xff00) === 0xff00) return true;
  if (h0 === 0x0064 && h1 === 0xff9b) return true;
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true;
  if (isIpv4MappedPrefix(hextets)) {
    return isPrivateIpv4Address(hextetsToIpv4(h6, h7));
  }
  return false;
}

function isResolvedIpBlocked(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4Address(address);
  if (net.isIPv6(address)) return isPrivateOrReservedIpv6(address);
  return true;
}

async function assertResolvedHostPublic(
  endpointUrl: string,
  deps?: TmsSyncDependencies
): Promise<void> {
  if (!deps?.lookupHost && deps?.fetchPort !== undefined) {
    return;
  }
  const hostname = stripHostBrackets(new URL(endpointUrl).hostname);
  if (net.isIP(hostname) !== 0) {
    return;
  }
  const lookupFn = deps?.lookupHost ?? ((host: string) => dns.promises.lookup(host, { all: true }));
  const records = await lookupFn(hostname);
  if (records.length === 0 || records.some((rec) => isResolvedIpBlocked(rec.address))) {
    throw new TmsSecurityError(
      CODE_SSRF_BLOCKED,
      `Resolución DNS bloqueada por política Anti-SSRF para '${hostname}'.`
    );
  }
}

function stripHostBrackets(hostname: string): string {
  const lowered = hostname.toLowerCase().replace(/\.$/, '');
  if (lowered.startsWith('[') && lowered.endsWith(']')) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isBlockedHostname(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    NUMERIC_HOST_RE.test(host)
  ) {
    return true;
  }
  if (net.isIPv4(host)) {
    return isPrivateIpv4Address(host);
  }
  if (net.isIPv6(host)) {
    return isPrivateOrReservedIpv6(host);
  }
  return false;
}

export function validateTmsBaseUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'baseUrl no puede estar vacío.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: unknown) {
    reportDebugCatchError('tmsSyncCli.validateTmsBaseUrl', err);
    throw new TmsSecurityError(CODE_INVALID_INPUT, `baseUrl inválido: '${trimmed}'.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, 'Solo se permite esquema https:// para integraciones TMS.');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, 'URL rechazada por contener credenciales embebidas.');
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new TmsSecurityError(CODE_SSRF_BLOCKED, `Destino bloqueado por política Anti-SSRF: '${parsed.hostname}'.`);
  }
  return parsed;
}

function isTraceableTestFileName(fileName: string): boolean {
  return (
    fileName.endsWith('.feature') ||
    fileName.endsWith('.test.ts') ||
    (fileName.startsWith('test_') && fileName.endsWith('.py'))
  );
}

function scanDirectoryForTests(dirReal: string, rootReal: string, out: string[]): void {
  const entries = fs.readdirSync(dirReal, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || IGNORED_SCAN_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirReal, entry.name);
    const resolved = fs.realpathSync(fullPath);
    if (!isContainedPath(rootReal, resolved)) {
      continue;
    }
    if (entry.isDirectory()) {
      scanDirectoryForTests(resolved, rootReal, out);
    } else if (entry.isFile() && isTraceableTestFileName(entry.name)) {
      out.push(resolved);
    }
  }
}

function extractCanonicalTags(content: string): { allTags: string[]; primaryTags: string[] } {
  const matches = content.match(ALL_TAG_RE) ?? [];
  const allSet = new Set<string>();
  const primarySet = new Set<string>();
  for (const raw of matches) {
    const upper = raw.toUpperCase();
    allSet.add(upper);
    if (PRIMARY_TAG_PREFIX_RE.test(upper)) {
      primarySet.add(upper);
    }
  }
  return {
    allTags: [...allSet].sort((a, b) => a.localeCompare(b)),
    primaryTags: [...primarySet].sort((a, b) => a.localeCompare(b)),
  };
}

function matchesRequiredKey(discoveredTags: ReadonlySet<string>, rawReq: string): boolean {
  const norm = rawReq.trim().toUpperCase();
  if (norm.length === 0) {
    return true;
  }
  if (norm.startsWith('@')) {
    return discoveredTags.has(norm);
  }
  if (discoveredTags.has(`@${norm}`)) {
    return true;
  }
  const suffix = `-${norm}`;
  for (const tag of discoveredTags) {
    if (tag.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function computeInventoryCoverage(
  totalFiles: number,
  mappedCount: number,
  requiredCount: number,
  uncoveredCount: number
): number {
  if (totalFiles === 0 && requiredCount === 0) {
    return 0;
  }
  const filePct = totalFiles > 0 ? (mappedCount / totalFiles) * 100 : 0;
  if (requiredCount === 0) {
    return Number(filePct.toFixed(2));
  }
  const reqPct = ((requiredCount - uncoveredCount) / requiredCount) * 100;
  return Number(Math.min(filePct, reqPct).toFixed(2));
}

function buildInventorySummary(
  workspaceRoot: string,
  targetDir: string,
  requiredKeys: readonly string[]
): InventorySummary {
  const rootReal = fs.realpathSync(path.resolve(workspaceRoot));
  const scanReal = resolveSafeWorkspacePath(workspaceRoot, targetDir, 'dir');
  const testFiles: string[] = [];
  scanDirectoryForTests(scanReal, rootReal, testFiles);
  testFiles.sort((a, b) => a.localeCompare(b));

  const mappedTests: MappedTestRecord[] = [];
  const untaggedTests: string[] = [];
  const discoveredSet = new Set<string>();

  for (const absFile of testFiles) {
    const relPosix = path.relative(rootReal, absFile).split(path.sep).join('/');
    const content = fs.readFileSync(absFile, 'utf8');
    const { allTags, primaryTags } = extractCanonicalTags(content);
    for (const tag of allTags) {
      discoveredSet.add(tag);
    }
    if (primaryTags.length > 0) {
      mappedTests.push({ file: relPosix, tags: allTags });
    } else {
      untaggedTests.push(relPosix);
    }
  }

  const normalizedReqs = requiredKeys.map((k) => k.trim()).filter((k) => k.length > 0);
  const uncoveredRequirements = normalizedReqs.filter(
    (req) => !matchesRequiredKey(discoveredSet, req)
  );
  const hasGaps =
    testFiles.length === 0 || untaggedTests.length > 0 || uncoveredRequirements.length > 0;
  const verdict = hasGaps ? STATUS_GAPS_DETECTED : STATUS_TRACEABILITY_OK;
  const coveragePct = computeInventoryCoverage(
    testFiles.length,
    mappedTests.length,
    normalizedReqs.length,
    uncoveredRequirements.length
  );

  return {
    totalTestFiles: testFiles.length,
    mappedTests,
    untaggedTests,
    discoveredTags: [...discoveredSet].sort((a, b) => a.localeCompare(b)),
    uncoveredRequirements,
    coveragePct,
    verdict,
  };
}

interface ModeExecutionContext {
  readonly args: TmsSyncArgs;
  readonly provider: TmsProvider;
  readonly workspaceRoot: string;
  readonly startedAt: number;
  readonly deps?: TmsSyncDependencies;
}

function executeInventoryMode(ctx: ModeExecutionContext): TmsSyncResult {
  const { args, provider, workspaceRoot, startedAt, deps } = ctx;
  const targetDir = args.targetDir ?? '.';
  const requiredKeys = args.requiredKeys ?? [];
  const inventory = buildInventorySummary(workspaceRoot, targetDir, requiredKeys);
  const durationMs = Math.max(0, getNowMs(deps) - startedAt);
  return {
    mode: MODE_INVENTORY,
    provider,
    status: inventory.verdict,
    dryRun: args.dryRun ?? true,
    attempts: 0,
    durationMs,
    inventory,
    message:
      inventory.verdict === STATUS_TRACEABILITY_OK
        ? `Trazabilidad 100% verificada (${inventory.mappedTests.length} archivo(s) mapeados).`
        : `Brechas detectadas: sin_etiqueta=${inventory.untaggedTests.length}, requisitos_sin_cubre=${inventory.uncoveredRequirements.length}, cobertura=${inventory.coveragePct}%.`,
  };
}

function assertSafeXmlPayload(rawXml: string): void {
  const upper = rawXml.toUpperCase();
  if (upper.includes('<!DOCTYPE') || upper.includes('<!ENTITY')) {
    throw new TmsSecurityError(
      CODE_XXE_DETECTED,
      'JUnit XML rechazado por seguridad anti-XXE: contiene <!DOCTYPE o <!ENTITY.'
    );
  }
}

function stripDelimitedSection(xml: string, openMarker: string, closeMarker: string): string {
  let cursor = 0;
  let output = '';
  while (cursor < xml.length) {
    const start = xml.indexOf(openMarker, cursor);
    if (start === -1) {
      return output + xml.slice(cursor);
    }
    output += xml.slice(cursor, start);
    const end = xml.indexOf(closeMarker, start + openMarker.length);
    if (end === -1) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, 'Contenido JUnit XML truncado o mal formado.');
    }
    cursor = end + closeMarker.length;
  }
  return output;
}

function parseXmlAttributes(attrSlice: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < attrSlice.length) {
    const eqIdx = attrSlice.indexOf('=', pos);
    if (eqIdx === -1) {
      break;
    }
    const key = attrSlice.slice(pos, eqIdx).trim();
    const afterEq = attrSlice.slice(eqIdx + 1).trimStart();
    const quote = afterEq[0];
    if (quote !== '"' && quote !== "'") {
      break;
    }
    const valEnd = afterEq.indexOf(quote, 1);
    if (valEnd === -1) {
      break;
    }
    if (key.length > 0) {
      attrs[key] = afterEq.slice(1, valEnd);
    }
    pos = attrSlice.length - afterEq.length + valEnd + 1;
  }
  return attrs;
}

function parseXmlTagToken(rawInner: string, openPos: number, endPos: number): XmlTagToken | null {
  const trimmed = rawInner.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const isClosing = trimmed.startsWith('/');
  const isSelfClosing = !isClosing && trimmed.endsWith('/');
  const body = trimmed.slice(isClosing ? 1 : 0, isSelfClosing ? -1 : trimmed.length).trim();
  const spaceIdx = body.search(/\s/);
  const name = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const attrSlice = spaceIdx === -1 || isClosing ? '' : body.slice(spaceIdx + 1);
  return { name, isClosing, isSelfClosing, attrs: parseXmlAttributes(attrSlice), openPos, endPos };
}

function findClosingTagAngleBracket(xml: string, startPos: number): number {
  let quote: '"' | "'" | null = null;
  let firstQuotedAngle = -1;
  for (let i = startPos; i < xml.length; i += 1) {
    const ch = xml[i];
    if (quote === null) {
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') return i;
      continue;
    }
    if (ch === quote) quote = null;
    else if (ch === '>' && firstQuotedAngle === -1) firstQuotedAngle = i;
    else if (ch === '<') return firstQuotedAngle;
  }
  return quote !== null ? firstQuotedAngle : -1;
}

function tokenizeXmlTags(cleanedXml: string): XmlTagToken[] {
  const tokens: XmlTagToken[] = [];
  let cursor = 0;
  while (cursor < cleanedXml.length) {
    const openIdx = cleanedXml.indexOf('<', cursor);
    if (openIdx === -1) {
      break;
    }
    if (cleanedXml.startsWith('<![CDATA[', openIdx)) {
      const cdataEnd = cleanedXml.indexOf(']]>', openIdx + 9);
      if (cdataEnd === -1) {
        throw new TmsSecurityError(CODE_INVALID_INPUT, 'Sección CDATA XML sin cierre detectada.');
      }
      cursor = cdataEnd + 3;
      continue;
    }
    const closeIdx = findClosingTagAngleBracket(cleanedXml, openIdx + 1);
    if (closeIdx === -1) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, 'Etiqueta XML sin cierre detectada.');
    }
    const token = parseXmlTagToken(cleanedXml.slice(openIdx + 1, closeIdx), openIdx, closeIdx);
    if (token) {
      tokens.push(token);
    }
    cursor = closeIdx + 1;
  }
  return tokens;
}

function parseDurationMs(rawTime: string | undefined): number {
  if (!rawTime) {
    return 0;
  }
  const secs = Number(rawTime.trim());
  if (!Number.isFinite(secs) || secs < 0) {
    return 0;
  }
  return Math.round(secs * 1000);
}

function extractCanonicalKeys(text: string): string[] {
  const found = text.match(ALL_TAG_RE);
  if (!found || found.length === 0) {
    return [];
  }
  return [...new Set(found.map((tag) => tag.slice(1).toUpperCase()))];
}

function findTagByPrefix(tags: readonly string[], prefix: string): string | undefined {
  return tags.find((t) => t.startsWith(prefix));
}

function findSummaryTagByPrefix(
  summary: ParsedJunitSummary | undefined,
  prefix: string
): string | undefined {
  if (!summary) {
    return undefined;
  }
  for (const tc of summary.cases) {
    const match = findTagByPrefix(tc.tags, prefix);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function formatTruncatedDetail(
  rawMessage: string | undefined,
  innerText: string,
  env: Readonly<Record<string, string | undefined>>
): string {
  const merged = [rawMessage?.trim() ?? '', innerText.trim()].filter((s) => s.length > 0).join(' | ');
  const safe = redactTmsSecrets(sanitizeUntrustedOutput(merged, { strictPii: true }), env)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return safe.length > MAX_DETAIL_LEN ? `${safe.slice(0, MAX_DETAIL_LEN)}...` : safe;
}

function applyTestCaseStart(state: JunitBuilderState, token: XmlTagToken): void {
  const name = token.attrs.name?.trim() || 'unnamed-test';
  const classname = token.attrs.classname?.trim() || '';
  const tags = extractCanonicalKeys(`${classname} ${name}`);
  const testCase: ParsedJunitCase = {
    name,
    classname,
    status: 'passed',
    durationMs: parseDurationMs(token.attrs.time),
    mappedKey: tags[0] ?? '',
    tags,
    detail: 'OK',
  };
  state.cases.push(testCase);
  state.currentCase = token.isSelfClosing ? null : testCase;
}

function applyOutcomeToken(
  state: JunitBuilderState,
  token: XmlTagToken,
  cleanedXml: string,
  env: Readonly<Record<string, string | undefined>>
): void {
  if (!state.currentCase) {
    return;
  }
  if (!token.isClosing && token.name === 'skipped') {
    state.currentCase.status = 'skipped';
    state.currentCase.detail = formatTruncatedDetail(token.attrs.message, '', env) || 'Skipped';
    return;
  }
  if (token.isClosing && (token.name === 'failure' || token.name === 'error')) {
    const inner = cleanedXml.slice(state.currentBodyStart, token.openPos);
    state.currentCase.detail =
      formatTruncatedDetail(state.currentFailureMessage, inner, env) || 'Failed';
    return;
  }
  if (!token.isClosing && (token.name === 'failure' || token.name === 'error')) {
    state.currentCase.status = 'failed';
    state.currentBodyStart = token.endPos + 1;
    state.currentFailureMessage = token.attrs.message?.trim() ?? '';
    state.currentCase.detail = formatTruncatedDetail(state.currentFailureMessage, '', env) || 'Failed';
  }
}

function handleJunitToken(
  state: JunitBuilderState,
  token: XmlTagToken,
  cleanedXml: string,
  env: Readonly<Record<string, string | undefined>>
): void {
  if (token.name === 'testsuite' || token.name === 'testsuites') {
    state.sawSuiteOrCase = true;
    return;
  }
  if (!token.isClosing && token.name === 'testcase') {
    state.sawSuiteOrCase = true;
    applyTestCaseStart(state, token);
    return;
  }
  if (token.isClosing && token.name === 'testcase') {
    state.currentCase = null;
    return;
  }
  applyOutcomeToken(state, token, cleanedXml, env);
}

function summarizeParsedCases(cases: readonly ParsedJunitCase[]): ParsedJunitSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  for (const tc of cases) {
    durationMs += tc.durationMs;
    if (tc.status === 'passed') {
      passed += 1;
    } else if (tc.status === 'failed') {
      failed += 1;
    } else {
      skipped += 1;
    }
  }
  return { total: cases.length, passed, failed, skipped, durationMs, cases: [...cases] };
}

function parseJunitXmlReport(
  rawXml: string,
  env: Readonly<Record<string, string | undefined>>
): ParsedJunitSummary {
  assertSafeXmlPayload(rawXml);
  const noComments = stripDelimitedSection(rawXml, '<!--', '-->');
  const cleaned = stripDelimitedSection(noComments, '<?', '?>');
  const tokens = tokenizeXmlTags(cleaned);
  const state: JunitBuilderState = {
    currentCase: null,
    currentBodyStart: 0,
    currentFailureMessage: '',
    cases: [],
    sawSuiteOrCase: false,
  };
  for (const token of tokens) {
    handleJunitToken(state, token, cleaned, env);
  }
  if (!state.sawSuiteOrCase) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'El archivo XML no contiene nodos <testsuite> ni <testcase>.');
  }
  return summarizeParsedCases(state.cases);
}

function readJunitInputXml(args: TmsSyncArgs, workspaceRoot: string): string {
  if (args.junitXmlContent && args.junitXmlContent.trim().length > 0) {
    return args.junitXmlContent;
  }
  if (args.junitXmlPath && args.junitXmlPath.trim().length > 0) {
    const safeFile = resolveSafeWorkspacePath(workspaceRoot, args.junitXmlPath, 'file');
    return fs.readFileSync(safeFile, 'utf8');
  }
  throw new TmsSecurityError(
    CODE_INVALID_INPUT,
    'El modo push-results requiere --junit-xml (junitXmlPath) o junitXmlContent.'
  );
}

function assertSafeIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_KEY_RE.test(trimmed) || trimmed.includes('..')) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Identificador ${label} inválido: '${trimmed}'.`);
  }
  return trimmed;
}

function resolveJiraIssueKey(args: TmsSyncArgs, summary?: ParsedJunitSummary): string {
  if (args.issueKey && args.issueKey.trim().length > 0) {
    const cleaned = args.issueKey.trim().replace(/^@?(?:JIRA-)?/i, '');
    return assertSafeIdentifier(cleaned, 'issueKey');
  }
  const tagged = findSummaryTagByPrefix(summary, 'JIRA-');
  if (tagged) {
    return assertSafeIdentifier(tagged.slice(5), 'issueKey');
  }
  const proj = assertSafeIdentifier(args.projectKey ?? 'QA', 'projectKey');
  return `${proj}-1`;
}

function resolveGitHubRepoAndIssue(
  args: TmsSyncArgs,
  summary?: ParsedJunitSummary
): { owner: string; repoName: string; issueNumber: string } {
  const rawRepo = (args.repo ?? args.projectKey ?? 'owner/repo').trim();
  if (!SAFE_REPO_RE.test(rawRepo) || rawRepo.includes('..')) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Repositorio GitHub inválido (esperado owner/repo): '${rawRepo}'.`);
  }
  const [owner = '', repoName = ''] = rawRepo.split('/');
  const rawIssue = args.issueKey ?? findSummaryTagByPrefix(summary, 'GH-') ?? '1';
  const issueDigits = rawIssue.trim().replace(/^@?(?:GH-)?/i, '');
  if (!/^\d+$/.test(issueDigits)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Número de issue GitHub inválido: '${rawIssue}'.`);
  }
  return { owner, repoName, issueNumber: issueDigits };
}

function mapZephyrStatus(status: ParsedJunitCase['status']): 'Pass' | 'Fail' | 'Blocked' {
  if (status === 'passed') {
    return 'Pass';
  }
  return status === 'failed' ? 'Fail' : 'Blocked';
}

function mapXrayStatus(status: ParsedJunitCase['status']): 'PASSED' | 'FAILED' | 'TODO' {
  if (status === 'passed') {
    return 'PASSED';
  }
  return status === 'failed' ? 'FAILED' : 'TODO';
}

function buildJiraAdfPayload(summary: ParsedJunitSummary, issueKey: string): Record<string, unknown> {
  const headerText = `[QA-11X] Evidencia ${issueKey}: total=${summary.total}, passed=${summary.passed}, failed=${summary.failed}, skipped=${summary.skipped}, durationMs=${summary.durationMs}`;
  const items = summary.cases.map((tc) => ({
    type: 'listItem',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `[${tc.status.toUpperCase()}] ${tc.name} (${tc.durationMs}ms) — ${tc.detail}`,
          },
        ],
      },
    ],
  }));

  return {
    body: {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: headerText }] },
        { type: 'bulletList', content: items },
      ],
    },
  };
}

function resolveCaseKeyForProvider(
  tc: ParsedJunitCase,
  prefix: string,
  fallback: string
): string {
  const matched = findTagByPrefix(tc.tags, prefix);
  if (matched) {
    return matched.slice(prefix.length);
  }
  return tc.mappedKey || fallback;
}

function resolveZephyrOverallStatus(summary: ParsedJunitSummary): 'Pass' | 'Fail' | 'Blocked' {
  if (summary.failed > 0) {
    return 'Fail';
  }
  return summary.skipped === summary.total && summary.total > 0 ? 'Blocked' : 'Pass';
}

function buildZephyrPayload(
  args: TmsSyncArgs,
  summary: ParsedJunitSummary
): Record<string, unknown> {
  const projectKey = assertSafeIdentifier(args.projectKey ?? 'QA', 'projectKey');
  const overallStatus = resolveZephyrOverallStatus(summary);
  const executions = summary.cases.map((tc, idx) => ({
    projectKey,
    testCaseKey: resolveCaseKeyForProvider(tc, 'ZEPHYR-', `${projectKey}-T${idx + 1}`),
    statusName: mapZephyrStatus(tc.status),
    executionTime: tc.durationMs,
    comment: tc.detail,
  }));
  const primaryCase = executions[0]?.testCaseKey ?? `${projectKey}-T1`;
  return {
    projectKey,
    testCaseKey: args.issueKey ? assertSafeIdentifier(args.issueKey, 'testCaseKey') : primaryCase,
    statusName: overallStatus,
    executionTime: summary.durationMs,
    comment: `QA-11X push-results: ${summary.passed}/${summary.total} passed`,
    executions,
  };
}

function buildXrayPayload(args: TmsSyncArgs, summary: ParsedJunitSummary): Record<string, unknown> {
  const projectKey = assertSafeIdentifier(args.projectKey ?? 'QA', 'projectKey');
  const rawExecKey = args.testExecutionKey ?? args.issueKey ?? `${projectKey}-EXEC-1`;
  const testExecutionKey = assertSafeIdentifier(rawExecKey, 'testExecutionKey');
  const tests = summary.cases.map((tc, idx) => ({
    testKey: resolveCaseKeyForProvider(tc, 'XRAY-', `${projectKey}-T${idx + 1}`),
    status: mapXrayStatus(tc.status),
    comment: tc.detail,
  }));
  return {
    testExecutionKey,
    info: {
      project: projectKey,
      summary: `QA-11X Execution (${summary.passed}/${summary.total} passed)`,
    },
    tests,
  };
}

function buildGitHubMarkdownPayload(summary: ParsedJunitSummary): Record<string, unknown> {
  const rows = summary.cases.map(
    (tc) => `- **${tc.status.toUpperCase()}** \`${tc.name}\` (${tc.durationMs}ms): ${tc.detail}`
  );
  const body = [
    `### 🛡️ QA-11X Traceability Report`,
    `- **Total:** ${summary.total} | **Passed:** ${summary.passed} | **Failed:** ${summary.failed} | **Skipped:** ${summary.skipped} | **Duration:** ${summary.durationMs}ms`,
    ...rows,
  ].join('\n');
  return { body };
}

function resolvePushRequestSpec(
  provider: TmsProvider,
  origin: string,
  args: TmsSyncArgs,
  summary: ParsedJunitSummary
): { endpoint: string; payload: Record<string, unknown> } {
  if (provider === PROVIDER_JIRA) {
    const issueKey = resolveJiraIssueKey(args, summary);
    return {
      endpoint: `${origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      payload: buildJiraAdfPayload(summary, issueKey),
    };
  }
  if (provider === PROVIDER_ZEPHYR) {
    return {
      endpoint: `${origin}/v2/testexecutions`,
      payload: buildZephyrPayload(args, summary),
    };
  }
  if (provider === PROVIDER_XRAY) {
    return {
      endpoint: `${origin}/api/v2/import/execution`,
      payload: buildXrayPayload(args, summary),
    };
  }
  const gh = resolveGitHubRepoAndIssue(args, summary);
  return {
    endpoint: `${origin}/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repoName)}/issues/${encodeURIComponent(gh.issueNumber)}/comments`,
    payload: buildGitHubMarkdownPayload(summary),
  };
}

function trimTrailingSlashes(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '/') {
    end -= 1;
  }
  return raw.slice(0, end);
}

function resolveEffectiveBaseOrigin(provider: TmsProvider, rawBaseUrl: string | undefined): string {
  const candidate = rawBaseUrl?.trim() || DEFAULT_BASE_URLS[provider];
  if (!candidate) {
    throw new TmsSecurityError(
      CODE_INVALID_INPUT,
      `El proveedor '${provider}' requiere --base-url (baseUrl HTTPS explícito).`
    );
  }
  const parsed = validateTmsBaseUrl(candidate);
  const cleanPath = trimTrailingSlashes(parsed.pathname);
  return cleanPath.length > 0 ? `${parsed.origin}${cleanPath}` : parsed.origin;
}

function resolveCredentials(
  provider: TmsProvider,
  env: Readonly<Record<string, string | undefined>>
): ResolvedCredentials | null {
  const keys = ENV_KEY_MAP[provider];
  const foundToken = keys.map((k) => env[k]?.trim()).find((v) => Boolean(v && v.length > 0));
  if (!foundToken) {
    return null;
  }
  const jiraEmail = env.JIRA_USER_EMAIL?.trim();
  if (provider === PROVIDER_JIRA && jiraEmail) {
    const encoded = Buffer.from(`${jiraEmail}:${foundToken}`, 'utf8').toString('base64');
    return { token: foundToken, headerValue: `Basic ${encoded}` };
  }
  return { token: foundToken, headerValue: `Bearer ${foundToken}` };
}

function resolveTimeoutMs(rawTimeoutMs: number | undefined): number {
  if (typeof rawTimeoutMs !== 'number' || !Number.isFinite(rawTimeoutMs) || rawTimeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(rawTimeoutMs), MAX_TIMEOUT_MS);
}

function evaluateOfflineGate(
  args: TmsSyncArgs,
  provider: TmsProvider,
  env: Readonly<Record<string, string | undefined>>
): { live: boolean; offlineStatus: typeof STATUS_DRY_RUN | typeof STATUS_SKIPPED; creds: ResolvedCredentials | null } {
  const creds = resolveCredentials(provider, env);
  const live = args.dryRun === false;
  if (live && !creds) {
    throw new MissingTmsCredentialsError(provider, ENV_KEY_MAP[provider]);
  }
  if (!live) {
    const offlineStatus = !creds && args.dryRun === undefined ? STATUS_SKIPPED : STATUS_DRY_RUN;
    return { live: false, offlineStatus, creds };
  }
  return { live: true, offlineStatus: STATUS_DRY_RUN, creds };
}

function combineAbortSignal(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;
}

interface PostRequestSpec {
  readonly fetchPort: FetchPort;
  readonly endpoint: string;
  readonly payload: Record<string, unknown>;
  readonly authHeader: string;
  readonly idempotencyKey: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}

async function executePostNoRetry(
  spec: PostRequestSpec
): Promise<{ status: TmsSyncStatus; httpStatus?: number; message: string }> {
  const { fetchPort, endpoint, payload, authHeader, idempotencyKey, timeoutMs, env, signal } = spec;
  try {
    const response = await fetchPort(endpoint, {
      method: 'POST',
      headers: {
        [HEADER_CONTENT_TYPE]: MIME_JSON,
        [HEADER_ACCEPT]: MIME_JSON,
        [HEADER_AUTHORIZATION]: authHeader,
        [HEADER_IDEMPOTENCY_KEY]: idempotencyKey,
        [HEADER_USER_AGENT]: USER_AGENT_VALUE,
      },
      body: JSON.stringify(payload),
      signal: combineAbortSignal(timeoutMs, signal),
    });
    if (response.status === 409) {
      return {
        status: STATUS_ALREADY_RUNNING,
        httpStatus: 409,
        message: 'Conflicto 409: sincronización concurrente ya en curso (0 reintentos).',
      };
    }
    if (response.ok) {
      return {
        status: STATUS_SYNCED,
        httpStatus: response.status,
        message: `Evidencia sincronizada con éxito (HTTP ${response.status}).`,
      };
    }
    const errText = redactTmsSecrets(await response.text(), env);
    return {
      status: STATUS_ERROR,
      httpStatus: response.status,
      message: `Error TMS HTTP ${response.status}: ${errText || 'sin detalle'}.`,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      status: STATUS_ERROR,
      message: `Fallo de transporte en POST TMS: ${redactTmsSecrets(rawMsg, env)}`,
    };
  }
}

async function executePushResultsMode(ctx: ModeExecutionContext): Promise<TmsSyncResult> {
  const { args, provider, workspaceRoot, startedAt, deps } = ctx;
  const env = getEnvMap(deps);
  const origin = resolveEffectiveBaseOrigin(provider, args.baseUrl);
  const rawXml = readJunitInputXml(args, workspaceRoot);
  const junitSummary = parseJunitXmlReport(rawXml, env);
  const { endpoint, payload } = resolvePushRequestSpec(provider, origin, args, junitSummary);
  const gate = evaluateOfflineGate(args, provider, env);
  const idempotencyKey = deps?.randomUuid ? deps.randomUuid() : randomUUID();

  if (!gate.live || !gate.creds) {
    return {
      mode: MODE_PUSH,
      provider,
      status: gate.offlineStatus,
      dryRun: true,
      endpoint,
      idempotencyKey,
      attempts: 0,
      durationMs: Math.max(0, getNowMs(deps) - startedAt),
      payload,
      junitSummary,
      message:
        gate.offlineStatus === STATUS_SKIPPED
          ? `Omitido por ausencia de credenciales en modo no-live (${provider}).`
          : `Dry-run completado para ${provider} (0 llamadas HTTP realizadas).`,
    };
  }

  await assertResolvedHostPublic(endpoint, deps);
  const fetchPort = deps?.fetchPort ?? defaultFetchPort;
  const outcome = await executePostNoRetry({
    fetchPort,
    endpoint,
    payload,
    authHeader: gate.creds.headerValue,
    idempotencyKey,
    timeoutMs: resolveTimeoutMs(args.timeoutMs),
    env,
    signal: deps?.signal,
  });
  return {
    mode: MODE_PUSH,
    provider,
    status: outcome.status,
    dryRun: false,
    endpoint,
    idempotencyKey,
    httpStatus: outcome.httpStatus,
    attempts: 1,
    durationMs: Math.max(0, getNowMs(deps) - startedAt),
    payload,
    junitSummary,
    message: outcome.message,
  };
}

function isTransientHttpStatus(status: number): boolean {
  return status === 502 || status === 503;
}

function isTransientTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = isPlainRecord(err) && typeof err.code === 'string' ? err.code : '';
  return TRANSIENT_TRANSPORT_RE.test(`${code} ${msg}`);
}

interface GetRequestSpec {
  readonly fetchPort: FetchPort;
  readonly endpoint: string;
  readonly authHeader: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

async function performSingleGetAttempt(
  spec: GetRequestSpec
): Promise<{ kind: 'ok'; status: number; body: string } | { kind: 'retry'; status?: number; err: string } | { kind: 'fail'; status?: number; err: string }> {
  try {
    const res = await spec.fetchPort(spec.endpoint, {
      method: 'GET',
      headers: {
        [HEADER_ACCEPT]: MIME_JSON,
        [HEADER_AUTHORIZATION]: spec.authHeader,
        [HEADER_USER_AGENT]: USER_AGENT_VALUE,
      },
      signal: combineAbortSignal(spec.timeoutMs, spec.signal),
    });
    const body = await res.text();
    if (res.ok) {
      return { kind: 'ok', status: res.status, body };
    }
    if (isTransientHttpStatus(res.status)) {
      return { kind: 'retry', status: res.status, err: body || `HTTP ${res.status}` };
    }
    return { kind: 'fail', status: res.status, err: body || `HTTP ${res.status}` };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return isTransientTransportError(err)
      ? { kind: 'retry', err: rawMsg }
      : { kind: 'fail', err: rawMsg };
  }
}

async function executeGetWithSingleRetry(
  spec: GetRequestSpec
): Promise<{ ok: true; status: number; body: string; attempts: number } | { ok: false; status?: number; err: string; attempts: number }> {
  const first = await performSingleGetAttempt(spec);
  if (first.kind === 'ok') {
    return { ok: true, status: first.status, body: first.body, attempts: 1 };
  }
  if (first.kind === 'fail') {
    return { ok: false, status: first.status, err: first.err, attempts: 1 };
  }
  const second = await performSingleGetAttempt(spec);
  if (second.kind === 'ok') {
    return { ok: true, status: second.status, body: second.body, attempts: 2 };
  }
  return { ok: false, status: second.status, err: second.err, attempts: 2 };
}

function extractAdfText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(extractAdfText).filter((s) => s.length > 0).join(' ');
  }
  if (!isPlainRecord(node)) {
    return '';
  }
  if (typeof node.text === 'string') {
    return node.text;
  }
  return extractAdfText(node.content);
}

function extractStoryFieldsFromJson(
  provider: typeof PROVIDER_JIRA | typeof PROVIDER_GITHUB,
  rawBody: string,
  fallbackKey: string
): StoryRawFields {
  const parsed: unknown = JSON.parse(rawBody);
  if (!isPlainRecord(parsed)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'Respuesta JSON de historia TMS inválida.');
  }
  if (provider === PROVIDER_JIRA) {
    const fields = isPlainRecord(parsed.fields) ? parsed.fields : {};
    const key = typeof parsed.key === 'string' ? parsed.key : fallbackKey;
    const rawTitle = typeof fields.summary === 'string' ? fields.summary : key;
    const rawCriteria = extractAdfText(fields.description);
    return { storyKey: key, rawTitle, rawCriteria };
  }
  const cleanFallback = fallbackKey.replace(/^@?(?:GH-)?/i, '');
  const num = typeof parsed.number === 'number' ? String(parsed.number) : cleanFallback;
  const rawTitle = typeof parsed.title === 'string' ? parsed.title : `GH-${num}`;
  const rawCriteria = typeof parsed.body === 'string' ? parsed.body : '';
  return { storyKey: `GH-${num}`, rawTitle, rawCriteria };
}

function sanitizeLineWithPromptGuard(
  line: string,
  env: Readonly<Record<string, string | undefined>>,
  matchedRules: Set<string>
): { text: string; neutralized: boolean } {
  const redactedOut = redactTmsSecrets(sanitizeUntrustedOutput(line, { strictPii: true }), env);
  const hadPromptTag = redactedOut.includes(REDACTED_PROMPT_INJECTION);
  const safety = inspectPromptSafety(redactedOut, { strictPii: true });
  if (!safety.safe) {
    for (const rule of safety.matchedRules) {
      matchedRules.add(rule);
    }
    return { text: REDACTED_PROMPT_INJECTION, neutralized: true };
  }
  return { text: redactedOut, neutralized: hadPromptTag };
}

function sanitizeUntrustedStoryText(
  rawText: string,
  env: Readonly<Record<string, string | undefined>>,
  singleLine: boolean,
  matchedRules: Set<string>
): { text: string; neutralized: boolean } {
  const nfkc = rawText.normalize('NFKC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = nfkc.split('\n');
  let neutralized = false;
  const sanitizedLines = lines.map((line) => {
    const res = sanitizeLineWithPromptGuard(line, env, matchedRules);
    if (res.neutralized) {
      neutralized = true;
    }
    return res.text;
  });
  const joined = singleLine ? sanitizedLines.join(' ').replace(/\s+/g, ' ').trim() : sanitizedLines.join('\n').trim();
  return { text: joined, neutralized };
}

function buildGherkinFeatureDraft(
  provider: typeof PROVIDER_JIRA | typeof PROVIDER_GITHUB,
  storyKey: string,
  title: string,
  criteria: string
): string {
  const cleanKey = storyKey.replace(/^@/, '').toUpperCase();
  const ghKey = cleanKey.startsWith('GH-') ? cleanKey : `GH-${cleanKey}`;
  const primaryTag = provider === PROVIDER_JIRA ? `@JIRA-${cleanKey}` : `@${ghKey}`;
  const criteriaLines = (criteria.length > 0 ? criteria : 'Validar flujo principal')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => `    # ${l}`);

  return [
    `${primaryTag} @TC-${cleanKey} @AC-1`,
    `Feature: ${title || cleanKey}`,
    '',
    `  Scenario: Validación trazable 11X para ${cleanKey}`,
    ...criteriaLines,
    '    Given url baseUrl',
    "    And header Idempotency-Key = java.util.UUID.randomUUID() + ''",
    '    When method post',
    '    Then status 200',
  ].join('\n');
}

function resolvePullEndpoint(
  provider: typeof PROVIDER_JIRA | typeof PROVIDER_GITHUB,
  origin: string,
  args: TmsSyncArgs
): { endpoint: string; storyKey: string } {
  if (provider === PROVIDER_JIRA) {
    const issueKey = resolveJiraIssueKey(args);
    return {
      endpoint: `${origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description`,
      storyKey: issueKey,
    };
  }
  const gh = resolveGitHubRepoAndIssue(args);
  return {
    endpoint: `${origin}/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repoName)}/issues/${encodeURIComponent(gh.issueNumber)}`,
    storyKey: `GH-${gh.issueNumber}`,
  };
}

function buildPullStoryResult(
  provider: typeof PROVIDER_JIRA | typeof PROVIDER_GITHUB,
  rawFields: StoryRawFields,
  env: Readonly<Record<string, string | undefined>>
): PullStoryOutput {
  const matchedRules = new Set<string>();
  const titleRes = sanitizeUntrustedStoryText(rawFields.rawTitle, env, true, matchedRules);
  const criteriaRes = sanitizeUntrustedStoryText(rawFields.rawCriteria, env, false, matchedRules);
  const featureContent = buildGherkinFeatureDraft(
    provider,
    rawFields.storyKey,
    titleRes.text,
    criteriaRes.text
  );
  return {
    storyKey: rawFields.storyKey,
    title: titleRes.text,
    criteria: criteriaRes.text,
    featureContent,
    promptInjectionNeutralized: titleRes.neutralized || criteriaRes.neutralized,
    matchedSafetyRules: [...matchedRules],
  };
}

async function executePullStoriesMode(
  args: TmsSyncArgs,
  provider: TmsProvider,
  startedAt: number,
  deps?: TmsSyncDependencies
): Promise<TmsSyncResult> {
  if (provider !== PROVIDER_JIRA && provider !== PROVIDER_GITHUB) {
    throw new TmsSecurityError(
      CODE_INVALID_INPUT,
      `El modo pull-stories solo soporta 'jira' o 'github-issues' (recibido: '${provider}').`
    );
  }
  const env = getEnvMap(deps);
  const origin = resolveEffectiveBaseOrigin(provider, args.baseUrl);
  const { endpoint, storyKey } = resolvePullEndpoint(provider, origin, args);
  const gate = evaluateOfflineGate(args, provider, env);

  if (!gate.live || !gate.creds) {
    return {
      mode: MODE_PULL,
      provider,
      status: gate.offlineStatus,
      dryRun: true,
      endpoint,
      attempts: 0,
      durationMs: Math.max(0, getNowMs(deps) - startedAt),
      pulledStory: buildPullStoryResult(provider, { storyKey, rawTitle: storyKey, rawCriteria: '' }, env),
      message:
        gate.offlineStatus === STATUS_SKIPPED
          ? `Lectura omitida por ausencia de credenciales (${provider}).`
          : `Dry-run pull-stories listo para ${storyKey} (0 llamadas HTTP).`,
    };
  }

  await assertResolvedHostPublic(endpoint, deps);
  const fetchPort = deps?.fetchPort ?? defaultFetchPort;
  const response = await executeGetWithSingleRetry({
    fetchPort,
    endpoint,
    authHeader: gate.creds.headerValue,
    timeoutMs: resolveTimeoutMs(args.timeoutMs),
    signal: deps?.signal,
  });
  if (!response.ok) {
    return {
      mode: MODE_PULL,
      provider,
      status: STATUS_ERROR,
      dryRun: false,
      endpoint,
      httpStatus: response.status,
      attempts: response.attempts,
      durationMs: Math.max(0, getNowMs(deps) - startedAt),
      message: `Error al consultar historia ${storyKey}: ${redactTmsSecrets(response.err, env)}`,
    };
  }

  const rawFields = extractStoryFieldsFromJson(provider, response.body, storyKey);
  const pulledStory = buildPullStoryResult(provider, rawFields, env);
  return {
    mode: MODE_PULL,
    provider,
    status: STATUS_PULL_OK,
    dryRun: false,
    endpoint,
    httpStatus: response.status,
    attempts: response.attempts,
    durationMs: Math.max(0, getNowMs(deps) - startedAt),
    pulledStory,
    message: `Historia ${pulledStory.storyKey} importada y saneada en ${response.attempts} intento(s).`,
  };
}

function validateModeAndProvider(args: TmsSyncArgs): { mode: TmsSyncMode; provider: TmsProvider } {
  if (!TMS_SYNC_MODES.includes(args.mode)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Modo TMS no soportado: '${String(args.mode)}'.`);
  }
  const provider = args.provider ?? PROVIDER_JIRA;
  if (!TMS_PROVIDERS.includes(provider)) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `Proveedor TMS no soportado: '${String(provider)}'.`);
  }
  return { mode: args.mode, provider };
}

export async function executeTmsSync(
  args: TmsSyncArgs,
  deps?: TmsSyncDependencies
): Promise<TmsSyncResult> {
  throwIfSignalAborted(deps?.signal, 'sync_enterprise_tms abortado por timeout o cancelación.');
  const startedAt = getNowMs(deps);
  const { mode, provider } = validateModeAndProvider(args);
  const workspaceRoot = args.workspaceRoot ?? deps?.workspaceRoot ?? process.cwd();

  if (mode === MODE_INVENTORY) {
    return executeInventoryMode({ args, provider, workspaceRoot, startedAt, deps });
  }
  if (mode === MODE_PUSH) {
    return executePushResultsMode({ args, provider, workspaceRoot, startedAt, deps });
  }
  return executePullStoriesMode(args, provider, startedAt, deps);
}

interface ParsedCliOptions {
  help: boolean;
  json: boolean;
  args: TmsSyncArgs;
}

function readNextFlagValue(argv: readonly string[], index: number, flag: string): string {
  const val = argv[index + 1];
  if (val === undefined || val.startsWith('--')) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, `La bandera '${flag}' requiere un valor.`);
  }
  return val;
}

const VALUE_CLI_FLAGS = new Set<string>([
  '--mode',
  '--provider',
  '--target-dir',
  '--junit-xml',
  '--base-url',
  '--project-key',
  '--issue-key',
  '--test-execution-key',
  '--repo',
  '--required-keys',
  '--timeout-ms',
]);

function applyCliValueFlag(
  flag: string,
  val: string,
  args: TmsSyncArgs
): void {
  const handlers: Record<string, () => void> = {
    '--mode': () => { args.mode = val as TmsSyncMode; },
    '--provider': () => { args.provider = val as TmsProvider; },
    '--target-dir': () => { args.targetDir = val; },
    '--junit-xml': () => { args.junitXmlPath = val; },
    '--base-url': () => { args.baseUrl = val; },
    '--project-key': () => { args.projectKey = val; },
    '--issue-key': () => { args.issueKey = val; },
    '--test-execution-key': () => { args.testExecutionKey = val; },
    '--repo': () => { args.repo = val; },
    '--required-keys': () => { args.requiredKeys = val.split(',').map((s) => s.trim()).filter(Boolean); },
    '--timeout-ms': () => { args.timeoutMs = Number(val); },
  };
  handlers[flag]?.();
}

function splitEqualsFlagToken(tok: string): { flag: string; inlineValue?: string } {
  const eqIdx = tok.indexOf('=');
  if (eqIdx === -1) {
    return { flag: tok };
  }
  return { flag: tok.slice(0, eqIdx), inlineValue: tok.slice(eqIdx + 1) };
}

function readTmsFlagValue(
  argv: readonly string[],
  index: number,
  flag: string,
  inlineValue: string | undefined
): { value: string; consumed: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, `La bandera '${flag}' requiere un valor.`);
    }
    return { value: inlineValue, consumed: 0 };
  }
  return { value: readNextFlagValue(argv, index, flag), consumed: 1 };
}

function parseTmsCliArgs(argv: readonly string[]): ParsedCliOptions {
  const args: TmsSyncArgs = { mode: MODE_INVENTORY };
  let help = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const tok = pickAt(argv, i);
    if (tok === '--help' || tok === '-h') {
      help = true;
    } else if (tok === '--json') {
      json = true;
    } else if (tok === '--live') {
      args.dryRun = false;
    } else if (tok === '--dry-run') {
      args.dryRun = true;
    } else {
      const { flag, inlineValue } = splitEqualsFlagToken(tok);
      if (!VALUE_CLI_FLAGS.has(flag)) {
        throw new TmsSecurityError(CODE_INVALID_INPUT, `Argumento CLI desconocido: '${tok}'.`);
      }
      const matched = readTmsFlagValue(argv, i, flag, inlineValue);
      applyCliValueFlag(flag, matched.value, args);
      i += matched.consumed;
    }
  }
  return { help, json, args };
}

function isSuccessStatus(status: TmsSyncStatus): boolean {
  return (
    status === STATUS_TRACEABILITY_OK ||
    status === STATUS_DRY_RUN ||
    status === STATUS_SKIPPED ||
    status === STATUS_SYNCED ||
    status === STATUS_PULL_OK
  );
}

function formatCliHelpText(): string {
  return [
    'Uso: tms-sync --mode <inventory|push-results|pull-stories> [opciones]',
    'Opciones: --provider <jira|zephyr|xray|github-issues> --target-dir <dir> --junit-xml <ruta>',
    '          --base-url <https://...> --project-key <key> --issue-key <key> --test-execution-key <key>',
    '          --repo <owner/repo> --required-keys <k1,k2> --timeout-ms <ms> --dry-run | --live --json --help',
  ].join('\n');
}

function formatResultText(
  result: TmsSyncResult,
  env: Readonly<Record<string, string | undefined>>
): TmsCliResult {
  const safeMsg = redactTmsSecrets(result.message, env);
  const passed = isSuccessStatus(result.status);
  if (passed) {
    return {
      exitCode: 0,
      result,
      output: formatPassQuietSummary({
        stageId: `${STAGE_TMS_SYNC}:${result.mode}:${result.provider}:${result.status}`,
        passed: true,
        checksCount: Math.max(1, result.attempts),
        durationMs: result.durationMs,
      }),
    };
  }
  return {
    exitCode: 1,
    result,
    output: formatFailVerboseReport({
      stageId: `${STAGE_TMS_SYNC}:${result.mode}:${result.provider}`,
      passed: false,
      exitCode: 1,
      durationMs: result.durationMs,
      command: `tms-sync --mode ${result.mode} --provider ${result.provider}`,
      stderr: safeMsg,
      remediationHint: 'Verifica conectividad HTTPS, credenciales TMS y cobertura de etiquetas @JIRA/@TC.',
    }),
  };
}

export async function runTmsSyncCli(
  argv: readonly string[],
  deps?: TmsSyncDependencies
): Promise<TmsCliResult> {
  const env = getEnvMap(deps);
  try {
    const parsed = parseTmsCliArgs(argv);
    if (parsed.help) {
      return { exitCode: 0, output: formatCliHelpText() };
    }
    const result = await executeTmsSync(parsed.args, deps);
    if (parsed.json) {
      return {
        exitCode: isSuccessStatus(result.status) ? 0 : 1,
        result,
        output: redactTmsSecrets(JSON.stringify(result), env),
      };
    }
    return formatResultText(result, env);
  } catch (err) {
    const rawErr = err instanceof Error ? err.message : String(err);
    const safeErr = redactTmsSecrets(rawErr, env);
    return {
      exitCode: 1,
      output: formatFailVerboseReport({
        stageId: STAGE_TMS_SYNC,
        passed: false,
        exitCode: 1,
        durationMs: 0,
        stderr: safeErr,
        remediationHint: 'Corrige los argumentos, URL HTTPS o credenciales TMS requeridas.',
      }),
    };
  }
}

export const SYNC_ENTERPRISE_TMS_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: STAGE_TMS_SYNC,
  description:
    'Synchronizes bidirectional Zero-Infra traceability (inventory, push-results, pull-stories) with Jira, Zephyr Scale, Xray, and GitHub Issues using dry-run mode by default, anti-SSRF validation, and promptGuard sanitization.',
};

export async function handleSyncEnterpriseTms(
  rawArgs: unknown,
  deps?: TmsSyncDependencies
): Promise<CallToolResult> {
  const env = getEnvMap(deps);
  const record = isPlainRecord(rawArgs) ? rawArgs : {};
  const guarded = guardToolCallInput(STAGE_TMS_SYNC, record);
  if (guarded.blocked) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Bloqueado por PromptGuard (${guarded.matchedRules.join(', ')})`,
        },
      ],
    };
  }
  try {
    const result = await executeTmsSync(guarded.sanitizedArgs as unknown as TmsSyncArgs, deps);
    return {
      isError: !isSuccessStatus(result.status),
      content: [{ type: 'text', text: redactTmsSecrets(JSON.stringify(result, null, 2), env) }],
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: redactTmsSecrets(rawMsg, env) }],
    };
  }
}
