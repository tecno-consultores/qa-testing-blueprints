// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { MCP_SERVER_VERSION } from '../../services/github-fetcher.js';
import { CANONICAL_IGNORED_DIRS } from '../../utils/ignoredDirs.js';

export const TMS_PROVIDERS = ['jira', 'zephyr', 'xray', 'github-issues'] as const;
export const TMS_SYNC_MODES = ['inventory', 'push-results', 'pull-stories'] as const;

export const PROVIDER_JIRA = 'jira' as const;
export const PROVIDER_ZEPHYR = 'zephyr' as const;
export const PROVIDER_XRAY = 'xray' as const;
export const PROVIDER_GITHUB = 'github-issues' as const;

export const MODE_INVENTORY = 'inventory' as const;
export const MODE_PUSH = 'push-results' as const;
export const MODE_PULL = 'pull-stories' as const;

export const STATUS_TRACEABILITY_OK = 'TRACEABILITY_OK' as const;
export const STATUS_GAPS_DETECTED = 'GAPS_DETECTED' as const;
export const STATUS_DRY_RUN = 'DRY_RUN' as const;
export const STATUS_SKIPPED = 'SKIPPED' as const;
export const STATUS_SYNCED = 'SYNCED' as const;
export const STATUS_ALREADY_RUNNING = 'SYNC_ALREADY_RUNNING' as const;
export const STATUS_PULL_OK = 'PULL_OK' as const;
export const STATUS_ERROR = 'ERROR' as const;

export const CODE_SSRF_BLOCKED = 'SSRF_BLOCKED' as const;
export const CODE_PATH_TRAVERSAL = 'PATH_TRAVERSAL' as const;
export const CODE_XXE_DETECTED = 'XXE_DETECTED' as const;
export const CODE_INVALID_INPUT = 'INVALID_INPUT' as const;

export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_ACCEPT = 'Accept';
export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';
export const HEADER_USER_AGENT = 'User-Agent';
export const MIME_JSON = 'application/json';
export const USER_AGENT_VALUE = `qa-11x-tms-sync/${MCP_SERVER_VERSION}`;

export const STAGE_TMS_SYNC = 'sync_enterprise_tms';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 180_000;
export const MAX_DETAIL_LEN = 220;

export const IGNORED_SCAN_DIRS = CANONICAL_IGNORED_DIRS;

export const ENV_KEY_MAP: Readonly<Record<TmsProvider, readonly string[]>> = {
  jira: ['JIRA_API_TOKEN', 'TMS_API_TOKEN'],
  zephyr: ['ZEPHYR_API_TOKEN', 'TMS_API_TOKEN'],
  xray: ['XRAY_API_TOKEN', 'XRAY_CLIENT_SECRET', 'TMS_API_TOKEN'],
  'github-issues': ['GITHUB_TOKEN', 'TMS_API_TOKEN'],
};

export const DEFAULT_BASE_URLS: Readonly<Record<TmsProvider, string>> = {
  jira: '',
  zephyr: 'https://api.zephyrscale.smartbear.com',
  xray: 'https://xray.cloud.getxray.app',
  'github-issues': 'https://api.github.com',
};

export const SECRET_ENV_KEYS: readonly string[] = [
  'JIRA_API_TOKEN',
  'ZEPHYR_API_TOKEN',
  'XRAY_API_TOKEN',
  'XRAY_CLIENT_SECRET',
  'GITHUB_TOKEN',
  'TMS_API_TOKEN',
];

export const ALL_TAG_RE = /@(?:JIRA|ZEPHYR|XRAY|TC)-[\w-]+|@(?:GH|AC)-\d+/gi;
export const PRIMARY_TAG_PREFIX_RE = /^@(?:JIRA|ZEPHYR|XRAY|GH|TC)-/;
export const AUTH_HEADER_RE = /\b(Bearer|Basic)\s+[a-z0-9._+/=-]+/gi;
export const SAFE_KEY_RE = /^[A-Za-z0-9._-]+$/;
export const SAFE_REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
export const NUMERIC_HOST_RE = /^(?:\d+|0x[0-9a-f]+)$/i;
export const TRANSIENT_TRANSPORT_RE = /\b(?:ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|fetch failed)\b/i;

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

export interface XmlTagToken {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attrs: Record<string, string>;
  endPos: number;
  openPos: number;
}

export interface JunitBuilderState {
  currentCase: ParsedJunitCase | null;
  currentBodyStart: number;
  currentFailureMessage: string;
  cases: ParsedJunitCase[];
  sawSuiteOrCase: boolean;
}

export interface ResolvedCredentials {
  token: string;
  headerValue: string;
}

export interface StoryRawFields {
  storyKey: string;
  rawTitle: string;
  rawCriteria: string;
}


export interface ModeExecutionContext {
  readonly args: TmsSyncArgs;
  readonly provider: TmsProvider;
  readonly workspaceRoot: string;
  readonly startedAt: number;
  readonly deps?: TmsSyncDependencies;
}
