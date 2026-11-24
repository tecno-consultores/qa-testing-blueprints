// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { randomUUID } from 'node:crypto';
import { REDACTED_PROMPT_INJECTION, inspectPromptSafety, sanitizeUntrustedOutput } from '../../security/promptGuard.js';
import {
  CODE_INVALID_INPUT,
  DEFAULT_BASE_URLS,
  DEFAULT_TIMEOUT_MS,
  ENV_KEY_MAP,
  HEADER_ACCEPT,
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  HEADER_IDEMPOTENCY_KEY,
  HEADER_USER_AGENT,
  MAX_TIMEOUT_MS,
  MIME_JSON,
  MODE_PULL,
  MODE_PUSH,
  MissingTmsCredentialsError,
  PROVIDER_GITHUB,
  PROVIDER_JIRA,
  PROVIDER_XRAY,
  PROVIDER_ZEPHYR,
  SAFE_KEY_RE,
  SAFE_REPO_RE,
  STATUS_ALREADY_RUNNING,
  STATUS_DRY_RUN,
  STATUS_ERROR,
  STATUS_PULL_OK,
  STATUS_SKIPPED,
  STATUS_SYNCED,
  TRANSIENT_TRANSPORT_RE,
  TmsSecurityError,
  USER_AGENT_VALUE,
  type FetchPort,
  type ModeExecutionContext,
  type ParsedJunitCase,
  type ParsedJunitSummary,
  type PullStoryOutput,
  type ResolvedCredentials,
  type StoryRawFields,
  type TmsProvider,
  type TmsSyncArgs,
  type TmsSyncDependencies,
  type TmsSyncResult,
  type TmsSyncStatus,
} from './types.js';
import {
  assertResolvedHostPublic,
  defaultFetchPort,
  getEnvMap,
  getNowMs,
  isPlainRecord,
  redactTmsSecrets,
  validateTmsBaseUrl,
} from './security.js';
import {
  findSummaryTagByPrefix,
  findTagByPrefix,
  parseJunitXmlReport,
  readJunitInputXml,
} from './inventoryAndJunit.js';


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

export async function executePushResultsMode(ctx: ModeExecutionContext): Promise<TmsSyncResult> {
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

export async function executePullStoriesMode(
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

