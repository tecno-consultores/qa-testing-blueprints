// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { stripVTControlCharacters } from 'node:util';

const STATUS_PASSED = 'passed' as const;
const STATUS_FAILED = 'failed' as const;
const STATUS_BROKEN = 'broken' as const;
const LABEL_AGENT = 'agent' as const;
const LABEL_AGENT_VERSION = 'agent_version' as const;
const LABEL_ENVIRONMENT = 'environment' as const;

const DEFAULT_AGENT_NAME = 'qa-11x-agent';
const DEFAULT_AGENT_VERSION = '2.20.3';
const DEFAULT_ENVIRONMENT = 'docker-ephemeral';
const DEFAULT_BUILD_ID = 'local';
const DEFAULT_REMEDIATION =
  'Re-run the failing stage in an isolated QA-11X ephemeral container and inspect the root-cause trace above.';
const DEFAULT_EMPTY_TRACE = 'No diagnostic output captured.';
const DEFAULT_COMMAND = '<unspecified>';
const REDACT_MASK = '[REDACTED]';

const BEARER_SECRET_RE = /\b(Bearer|Basic)\s+[^\s"']+/gi;
const URL_CRED_SECRET_RE = /(:\/\/[^/\s:@]+:)[^/\s@]+(@)/g;
const QUERY_SECRET_RE = /\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s"'&]+/gi;
const FLAG_SECRET_RE = /(--(?:token|api-key|apikey|secret|password|passwd))\s+[^\s"']+/gi;
const PREFIX_TOKEN_RE = /\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}\b/g;
const WHITESPACE_COLLAPSE_RE = /[\r\n\t]+/g;
const ARTIFACT_UNSAFE_RE = /[^a-zA-Z0-9._-]+/g;

export type DiagnosticOutcomeStatus =
  | typeof STATUS_PASSED
  | typeof STATUS_FAILED
  | typeof STATUS_BROKEN;

export interface DiagnosticStepRecord {
  name: string;
  status: DiagnosticOutcomeStatus;
  durationMs: number;
  detail?: string;
}

export interface DiagnosticEvidencePaths {
  screenshotPath?: string;
  htmlDumpPath?: string;
  tracePath?: string;
}

export interface DiagnosticAgentInfo {
  agentName: string;
  agentVersion: string;
  environment: string;
  buildId: string;
}

export interface DiagnosticExecutionInput {
  stageId: string;
  passed: boolean;
  broken?: boolean;
  checksCount?: number;
  durationMs: number;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  steps?: readonly DiagnosticStepRecord[];
  remediationHint?: string;
  evidence?: DiagnosticEvidencePaths;
  agentInfo?: Partial<DiagnosticAgentInfo>;
}

export interface AllureLabel {
  name: typeof LABEL_AGENT | typeof LABEL_AGENT_VERSION | typeof LABEL_ENVIRONMENT;
  value: string;
}

export interface AllureAttachment {
  name: string;
  source: string;
  type: string;
}

export interface AllureStepItem {
  name: string;
  status: DiagnosticOutcomeStatus;
  stage: 'finished';
  durationMs: number;
}

export interface AllureDiagnosticEnvelope {
  name: string;
  status: DiagnosticOutcomeStatus;
  statusDetails: {
    message: string;
    trace: string;
  };
  steps: AllureStepItem[];
  attachments: AllureAttachment[];
  labels: [AllureLabel, AllureLabel, AllureLabel];
  buildId: string;
  durationMs: number;
}

function sanitizeSingleLine(raw: string): string {
  return stripVTControlCharacters(raw).replace(WHITESPACE_COLLAPSE_RE, ' ').trim();
}

export function sanitizeCommandSecrets(rawCommand: string): string {
  const masked = rawCommand
    .replace(BEARER_SECRET_RE, `$1 ${REDACT_MASK}`)
    .replace(URL_CRED_SECRET_RE, `$1${REDACT_MASK}$2`)
    .replace(QUERY_SECRET_RE, `$1=${REDACT_MASK}`)
    .replace(FLAG_SECRET_RE, `$1 ${REDACT_MASK}`)
    .replace(PREFIX_TOKEN_RE, REDACT_MASK);
  return sanitizeSingleLine(masked);
}

function trimEdgeDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') {
    start += 1;
  }
  while (end > start && value[end - 1] === '-') {
    end -= 1;
  }
  return value.slice(start, end);
}

export function buildFailureArtifactPath(stageId: string, ext: 'png' | 'html' | 'zip'): string {
  const replaced = stageId.replace(ARTIFACT_UNSAFE_RE, '-');
  const cleanId = trimEdgeDashes(replaced) || 'stage';
  return `artifacts/failures/${cleanId}.${ext}`;
}

function dedupeConsecutiveLines(lines: readonly string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result.length === 0 || result[result.length - 1] !== line) {
      result.push(line);
    }
  }
  return result;
}

export function cleanDiagnosticExcerpt(rawText: string, maxLines: number = 10): string {
  const stripped = stripVTControlCharacters(rawText);
  const nonEmpty = stripped
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const unique = dedupeConsecutiveLines(nonEmpty);
  return unique.slice(-Math.max(1, maxLines)).join('\n');
}

function extractRootCauseExcerpt(input: DiagnosticExecutionInput): string {
  const combined = [input.stderr ?? '', input.stdout ?? ''].filter(Boolean).join('\n');
  const cleaned = cleanDiagnosticExcerpt(combined, 10);
  return cleaned || DEFAULT_EMPTY_TRACE;
}

function resolveOutcomeStatus(input: DiagnosticExecutionInput): DiagnosticOutcomeStatus {
  if (input.passed) {
    return STATUS_PASSED;
  }
  return input.broken ? STATUS_BROKEN : STATUS_FAILED;
}

function pickNonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function resolveAgentInfo(partial?: Partial<DiagnosticAgentInfo>): DiagnosticAgentInfo {
  return {
    agentName: pickNonEmpty(partial?.agentName, DEFAULT_AGENT_NAME),
    agentVersion: pickNonEmpty(partial?.agentVersion, DEFAULT_AGENT_VERSION),
    environment: pickNonEmpty(partial?.environment, DEFAULT_ENVIRONMENT),
    buildId: pickNonEmpty(partial?.buildId, DEFAULT_BUILD_ID),
  };
}

function resolveRemediationHint(input: DiagnosticExecutionInput): string {
  const custom = input.remediationHint ? sanitizeSingleLine(input.remediationHint) : '';
  return custom || DEFAULT_REMEDIATION;
}

function pushAttachmentIfPresent(
  target: AllureAttachment[],
  name: string,
  source: string | undefined,
  type: string
): void {
  const cleanSource = source?.trim();
  if (cleanSource) {
    target.push({ name, source: cleanSource, type });
  }
}

function buildAttachments(evidence?: DiagnosticEvidencePaths): AllureAttachment[] {
  if (!evidence) {
    return [];
  }
  const attachments: AllureAttachment[] = [];
  pushAttachmentIfPresent(attachments, 'failure-screenshot', evidence.screenshotPath, 'image/png');
  pushAttachmentIfPresent(attachments, 'dom-snapshot', evidence.htmlDumpPath, 'text/html');
  pushAttachmentIfPresent(attachments, 'execution-trace', evidence.tracePath, 'application/zip');
  return attachments;
}

function formatStepLine(step: DiagnosticStepRecord): string {
  const detailSuffix = step.detail ? ` (${sanitizeSingleLine(step.detail)})` : '';
  return `    - [${step.status.toUpperCase()}] ${sanitizeSingleLine(step.name)} (${step.durationMs}ms)${detailSuffix}`;
}

function formatStepsBlock(steps?: readonly DiagnosticStepRecord[]): string[] {
  if (!steps || steps.length === 0) {
    return ['  steps: (none recorded)'];
  }
  return ['  steps:', ...steps.map(formatStepLine)];
}

function formatEvidenceBlock(evidence?: DiagnosticEvidencePaths): string[] {
  const attachments = buildAttachments(evidence);
  if (attachments.length === 0) {
    return [];
  }
  return ['  evidence:', ...attachments.map((item) => `    - ${item.name}: ${item.source}`)];
}

function buildAllureLabels(
  agent: DiagnosticAgentInfo
): [AllureLabel, AllureLabel, AllureLabel] {
  return [
    { name: LABEL_AGENT, value: agent.agentName },
    { name: LABEL_AGENT_VERSION, value: agent.agentVersion },
    { name: LABEL_ENVIRONMENT, value: agent.environment },
  ];
}

function buildAllureSteps(steps?: readonly DiagnosticStepRecord[]): AllureStepItem[] {
  if (!steps) {
    return [];
  }
  return steps.map((step) => ({
    name: sanitizeSingleLine(step.name),
    status: step.status,
    stage: 'finished',
    durationMs: step.durationMs,
  }));
}

export function formatPassQuietSummary(input: DiagnosticExecutionInput): string {
  const stage = sanitizeSingleLine(input.stageId);
  const checks = input.checksCount ?? 1;
  const agent = resolveAgentInfo(input.agentInfo);
  return `✔ [Pass-Quiet] stage=${stage} | checks=${checks} | duration=${input.durationMs}ms | env=${agent.environment}`;
}

export function formatFailVerboseReport(input: DiagnosticExecutionInput): string {
  const stage = sanitizeSingleLine(input.stageId);
  const statusTag = resolveOutcomeStatus(input).toUpperCase();
  const command = input.command ? sanitizeCommandSecrets(input.command) : DEFAULT_COMMAND;
  const exitCode = input.exitCode ?? 1;
  const agent = resolveAgentInfo(input.agentInfo);
  const traceLines = extractRootCauseExcerpt(input)
    .split('\n')
    .map((line) => `    ${line}`);

  return [
    `❌ [Fail-Verbose] stage=${stage} | status=${statusTag} | exitCode=${exitCode} | duration=${input.durationMs}ms`,
    `  command: ${command}`,
    ...formatStepsBlock(input.steps),
    '  rootCauseExcerpt:',
    ...traceLines,
    `  remediationHint: ${resolveRemediationHint(input)}`,
    ...formatEvidenceBlock(input.evidence),
    `  agentInfo: name=${agent.agentName} | version=${agent.agentVersion} | env=${agent.environment} | build=${agent.buildId}`,
  ].join('\n');
}

export function formatDiagnosticOutput(input: DiagnosticExecutionInput): string {
  return input.passed ? formatPassQuietSummary(input) : formatFailVerboseReport(input);
}

export function toAllureDiagnosticEnvelope(
  input: DiagnosticExecutionInput
): AllureDiagnosticEnvelope {
  const status = resolveOutcomeStatus(input);
  const agent = resolveAgentInfo(input.agentInfo);
  const message = input.passed
    ? formatPassQuietSummary(input)
    : `${sanitizeSingleLine(input.stageId)} ${status} (exitCode=${input.exitCode ?? 1}): ${resolveRemediationHint(input)}`;

  return {
    name: sanitizeSingleLine(input.stageId),
    status,
    statusDetails: {
      message,
      trace: extractRootCauseExcerpt(input),
    },
    steps: buildAllureSteps(input.steps),
    attachments: buildAttachments(input.evidence),
    labels: buildAllureLabels(agent),
    buildId: agent.buildId,
    durationMs: input.durationMs,
  };
}
