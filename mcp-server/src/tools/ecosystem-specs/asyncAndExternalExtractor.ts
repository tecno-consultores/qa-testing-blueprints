// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { collectProjectSourceFiles, isSafeRegularFile } from './projectDiscovery.js';
import {
  UTF8_ENCODING,
  type AsyncJobEntry,
  type ConsumerHttpCall,
  type DiscoveredProject,
  type ExternalIntegrationEntry,
  type RealtimeChannelEntry,
} from './types.js';

const ALL_CODE_EXTS: ReadonlySet<string> = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.php',
]);

const PY_WS_ROUTE_RE = /@\w+\.websocket\(\s*['"]([^'"]+)['"]/;
const NODE_WS_DIRECT_RE = /(?:new\s+WebSocket(?:Server)?|app\.ws)\(\s*['"`]([^'"`\r\n]+)['"`]/;
const NODE_WS_OPT_PATH_RE = /new\s+WebSocketServer\(\s*\{[^}\r\n]{0,160}path\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const SOCKET_IO_EVENT_RE = /\b(?:io|socket)\.on\(\s*['"]([^'"]+)['"]/;
const SSE_EVENTSOURCE_RE = /new\s+EventSource\(\s*['"`]([^'"`\r\n]+)['"`]/;
const SSE_MIME_RE = /text\/event-stream/i;

const CELERY_TASK_RE = /@(?:celery|app)\.task\b|@shared_task\b/;
const PY_DEF_NAME_RE = /^def\s+([a-zA-Z_]\w*)\s*\(/;
const BULLMQ_QUEUE_RE = /new\s+(?:Queue|Worker)\(\s*['"]([^'"]+)['"]/;
const NEST_CRON_RE = /@Cron\(\s*([^)\r\n]{1,120})\)/;
const NEST_PROCESSOR_RE = /@Processor\(\s*['"]([^'"]+)['"]\)/;
const LARAVEL_JOB_RE = /class\s+([A-Z]\w*)\s+implements\s+[^{\r\n]{0,120}\bShouldQueue\b/;
const LARAVEL_SCHEDULE_RE = /\$schedule->(?:command|job)\(\s*['"]?([^'",)\r\n]{1,120})/;

const KNOWN_3P_SDKS: ReadonlyArray<readonly [string, string]> = [
  ['stripe', 'Stripe'],
  ['@aws-sdk/', 'AWS SDK'],
  ['boto3', 'AWS SDK (boto3)'],
  ['@sendgrid/', 'SendGrid'],
  ['twilio', 'Twilio'],
  ['firebase', 'Firebase'],
  ['@sentry/', 'Sentry'],
  ['sentry_sdk', 'Sentry'],
  ['openai', 'OpenAI'],
  ['@anthropic-ai/', 'Anthropic'],
  ['@google/genai', 'Google GenAI'],
  ['auth0', 'Auth0'],
  ['keycloak', 'Keycloak'],
  ['@supabase/', 'Supabase'],
];

function readLinesSafe(fullPath: string): string[] {
  try {
    return isSafeRegularFile(fullPath) ? fs.readFileSync(fullPath, UTF8_ENCODING).split(/\r?\n/) : [];
  } catch (err: unknown) {
    reportDebugCatchError(`asyncAndExternalExtractor.readLinesSafe(${fullPath})`, err);
    return [];
  }
}

function findNextPyDefName(lines: readonly string[], startIdx: number): string {
  for (let j = startIdx + 1; j < Math.min(lines.length, startIdx + 5); j += 1) {
    const trimmed = (lines[j] ?? '').trimStart();
    const body = trimmed.startsWith('async ') ? trimmed.slice(6).trimStart() : trimmed;
    const m = PY_DEF_NAME_RE.exec(body);
    if (m?.[1]) return m[1];
  }
  return 'anonymous_task';
}

function extractParenSnippet(line: string): string | undefined {
  const open = line.indexOf('(');
  const close = open >= 0 ? line.indexOf(')', open + 1) : -1;
  if (open < 0 || close <= open + 1) return undefined;
  const inner = line.slice(open + 1, close).trim();
  return inner.length > 0 ? inner : undefined;
}

function scanRealtimeLines(
  projectSlug: string,
  relFile: string,
  lines: readonly string[],
  out: RealtimeChannelEntry[]
): void {
  const socketEvents = new Set<string>();
  let firstSocketLine = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;
    const wsMatch = PY_WS_ROUTE_RE.exec(line) ?? NODE_WS_DIRECT_RE.exec(line) ?? NODE_WS_OPT_PATH_RE.exec(line);
    if (wsMatch?.[1]) {
      out.push({ project_slug: projectSlug, protocol: 'websocket', channel_or_path: wsMatch[1], events: [], file: relFile, line: lineNo });
    }
    const ioEv = SOCKET_IO_EVENT_RE.exec(line);
    if (ioEv?.[1]) {
      socketEvents.add(ioEv[1]);
      if (!firstSocketLine) firstSocketLine = lineNo;
    }
    const sse = SSE_EVENTSOURCE_RE.exec(line);
    if (sse?.[1]) {
      out.push({ project_slug: projectSlug, protocol: 'sse', channel_or_path: sse[1], events: [], file: relFile, line: lineNo });
    } else if (SSE_MIME_RE.test(line)) {
      out.push({ project_slug: projectSlug, protocol: 'sse', channel_or_path: relFile, events: ['stream'], file: relFile, line: lineNo });
    }
  }
  if (socketEvents.size > 0) {
    out.push({
      project_slug: projectSlug,
      protocol: 'socket_io',
      channel_or_path: relFile,
      events: Array.from(socketEvents).sort((a, b) => a.localeCompare(b)),
      file: relFile,
      line: firstSocketLine,
    });
  }
}

function matchAsyncJobLine(
  projectSlug: string,
  relFile: string,
  lines: readonly string[],
  idx: number
): AsyncJobEntry | null {
  const line = lines[idx] ?? '';
  const lineNo = idx + 1;
  if (relFile.endsWith('.py') && CELERY_TASK_RE.test(line)) {
    const queue = extractParenSnippet(line);
    return { project_slug: projectSlug, runtime: 'celery', name: findNextPyDefName(lines, idx), ...(queue ? { schedule_or_queue: queue } : {}), file: relFile, line: lineNo };
  }
  const bull = BULLMQ_QUEUE_RE.exec(line) ?? NEST_PROCESSOR_RE.exec(line);
  if (bull?.[1]) {
    return { project_slug: projectSlug, runtime: 'bullmq', name: bull[1], schedule_or_queue: bull[1], file: relFile, line: lineNo };
  }
  const nestCron = NEST_CRON_RE.exec(line);
  if (nestCron?.[1]) {
    return { project_slug: projectSlug, runtime: 'nestjs_cron', name: `cron:${relFile}:L${lineNo}`, schedule_or_queue: nestCron[1].trim(), file: relFile, line: lineNo };
  }
  const laravel = LARAVEL_JOB_RE.exec(line) ?? LARAVEL_SCHEDULE_RE.exec(line);
  if (laravel?.[1]) {
    return { project_slug: projectSlug, runtime: 'laravel_queue', name: laravel[1].trim(), file: relFile, line: lineNo };
  }
  return null;
}

function scanAsyncJobLines(
  projectSlug: string,
  relFile: string,
  lines: readonly string[],
  out: AsyncJobEntry[]
): void {
  for (let i = 0; i < lines.length; i += 1) {
    const job = matchAsyncJobLine(projectSlug, relFile, lines, i);
    if (job) out.push(job);
  }
}

function collectExternalHttpIntegrations(
  projectSlug: string,
  consumerCalls: readonly ConsumerHttpCall[]
): ExternalIntegrationEntry[] {
  const byHost = new Map<string, { paths: Set<string>; file: string; line: number }>();
  for (const call of consumerCalls) {
    if (!call.is_external) continue;
    let host = 'external-http';
    try {
      host = new URL(call.raw_url).hostname.toLowerCase();
    } catch {
      host = 'external-http';
    }
    const existing = byHost.get(host) ?? { paths: new Set<string>(), file: call.file, line: call.line };
    existing.paths.add(`${call.method} ${call.normalized_path}`);
    byHost.set(host, existing);
  }
  return Array.from(byHost.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([host, info]) => ({
      project_slug: projectSlug,
      provider_name: host,
      kind: 'http_external' as const,
      endpoints_or_packages: Array.from(info.paths).sort((a, b) => a.localeCompare(b)),
      file: info.file,
      line: info.line,
    }));
}

function collectManifestSdkIntegrations(project: DiscoveredProject): ExternalIntegrationEntry[] {
  const out: ExternalIntegrationEntry[] = [];
  const seen = new Set<string>();
  for (const manifest of ['package.json', 'pyproject.toml', 'requirements.txt', 'composer.json']) {
    const full = path.join(project.absPath, manifest);
    if (!isSafeRegularFile(full)) continue;
    let raw = '';
    try {
      raw = fs.readFileSync(full, UTF8_ENCODING).toLowerCase();
    } catch (err: unknown) {
      reportDebugCatchError(`asyncAndExternalExtractor.collectManifestSdk(${full})`, err);
      continue;
    }
    for (const [token, label] of KNOWN_3P_SDKS) {
      if (raw.includes(token) && !seen.has(label)) {
        seen.add(label);
        out.push({
          project_slug: project.slug,
          provider_name: label,
          kind: 'sdk_client',
          endpoints_or_packages: [token],
          file: manifest,
          line: 1,
        });
      }
    }
  }
  return out;
}

export function extractAsyncAndExternalArtifacts(
  project: DiscoveredProject,
  consumerCalls: readonly ConsumerHttpCall[]
): {
  readonly realtimeChannels: RealtimeChannelEntry[];
  readonly asyncJobs: AsyncJobEntry[];
  readonly externalIntegrations: ExternalIntegrationEntry[];
} {
  const realtimeChannels: RealtimeChannelEntry[] = [];
  const asyncJobs: AsyncJobEntry[] = [];

  for (const relFile of collectProjectSourceFiles(project.absPath, ALL_CODE_EXTS, false)) {
    const lines = readLinesSafe(path.join(project.absPath, relFile));
    scanRealtimeLines(project.slug, relFile, lines, realtimeChannels);
    scanAsyncJobLines(project.slug, relFile, lines, asyncJobs);
  }

  const externalIntegrations: ExternalIntegrationEntry[] = [
    ...collectExternalHttpIntegrations(project.slug, consumerCalls),
    ...collectManifestSdkIntegrations(project),
  ];
  return { realtimeChannels, asyncJobs, externalIntegrations };
}
