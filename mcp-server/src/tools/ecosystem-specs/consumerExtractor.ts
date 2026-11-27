// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { extractUrlPathPrefix } from './envExtractor.js';
import { collectProjectSourceFiles } from './projectDiscovery.js';
import { joinRoutePaths, normalizeEndpointPath, toHttpVerb } from './providerExtractor.js';
import {
  UTF8_ENCODING,
  type ConsumerChannel,
  type ConsumerHttpCall,
  type DiscoveredProject,
  type EnvVarEntry,
  type HttpVerb,
  type UiViewEntry,
} from './types.js';

const JS_CLIENT_EXTS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
]);
const PY_EXTS: ReadonlySet<string> = new Set(['.py']);
const PHP_EXTS: ReadonlySet<string> = new Set(['.php']);

const BASE_URL_LITERAL_RE = /\bbaseURL\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const BASE_URL_ENV_RE =
  /\b(?:baseURL|API_BASE|API_URL)\s*[:=]\s*(?:import\.meta\.env\.|process\.env\.)([A-Z][A-Z0-9_]{1,63})/;
const CLIENT_METHOD_CALL_RE =
  /\b(?:axios|api|apiClient|http|httpClient|client|this\.http)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`\r\n]+)\2/i;
const CLIENT_GENERIC_CALL_RE =
  /\b(?:axios|api|apiClient|http|httpClient|client|this\.http)\.(get|post|put|patch|delete)<[^>\r\n]+>\(\s*(['"`])([^'"`\r\n]+)\2/i;
const FETCH_CALL_RE =
  /(?<![.\w$])(?:(?:window|globalThis)\.)?(?:\$fetch|useFetch|fetch)\(\s*(['"`])([^'"`\r\n]+)\1/;
const INLINE_METHOD_OPT_RE = /\bmethod\s*:\s*['"`]([a-z]+)['"`]/i;
const REQUEST_OBJ_HEAD_RE = /\b(?:axios|api|http|client)(?:\.request)?\(\s*\{/;
const REQUEST_OBJ_URL_RE = /\burl\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const PY_HTTP_CALL_RE =
  /\b(?:httpx|requests|client|session)\.(get|post|put|patch|delete)\(\s*f?(['"])([^'"\r\n]+)\2/i;
const PHP_HTTP_CALL_RE =
  /\b(?:Http::|\$(?:http|client)->)(get|post|put|patch|delete)\(\s*['"]([^'"\r\n]+)['"]/i;

const LEADING_ENV_TEMPLATE_RE =
  /^\$\{\s*(?:import\.meta\.env\.|process\.env\.)?([A-Z_]\w*)\s*\}(\/.*)$/i;
const LOCAL_API_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'api',
  'backend',
  'host.docker.internal',
]);
const EXTERNAL_HTTP_URL_RE = /^https?:\/\//i;
const UI_DIR_RE = /(?:^|\/)(views|pages|screens)\/([^/]+)\.(vue|tsx|jsx)$/i;
const ROUTER_PATH_RE = /\bpath\s*:\s*['"](\/[\w/:.-]*)['"]/;

interface ParsedCallUrl {
  readonly normalizedPath: string;
  readonly baseUrlVar?: string;
  readonly isExternal: boolean;
}

function resolveChannelForProject(project: DiscoveredProject): ConsumerChannel {
  if (project.role === 'mobile') return 'mobile';
  if (project.role === 'web' || project.role === 'mixed') return 'web';
  return 'service';
}

function applyPrefixIfNeeded(rawPath: string, prefix: string): string {
  const clean = normalizeEndpointPath(rawPath);
  if (!prefix || prefix === '/' || clean.startsWith(prefix)) {
    return clean;
  }
  return normalizeEndpointPath(joinRoutePaths(prefix, clean));
}

export function parseConsumerCallUrl(rawUrl: string, activePrefix: string): ParsedCallUrl | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('mailto:')) return null;

  const tplMatch = LEADING_ENV_TEMPLATE_RE.exec(trimmed);
  if (tplMatch?.[1] && tplMatch[2]) {
    return {
      normalizedPath: applyPrefixIfNeeded(tplMatch[2], activePrefix),
      baseUrlVar: tplMatch[1],
      isExternal: false,
    };
  }
  if (EXTERNAL_HTTP_URL_RE.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const isLocal = LOCAL_API_HOSTNAMES.has(parsed.hostname.toLowerCase());
      return { normalizedPath: normalizeEndpointPath(parsed.pathname), isExternal: !isLocal };
    } catch {
      return null;
    }
  }
  if (!trimmed.startsWith('/') && !trimmed.startsWith('api/')) {
    return activePrefix ? { normalizedPath: applyPrefixIfNeeded(trimmed, activePrefix), isExternal: false } : null;
  }
  return {
    normalizedPath: applyPrefixIfNeeded(trimmed, activePrefix),
    isExternal: false,
  };
}

interface ConsumerScanState {
  readonly projectSlug: string;
  readonly channel: ConsumerChannel;
  readonly defaultPrefix: string;
  readonly calls: ConsumerHttpCall[];
  readonly views: UiViewEntry[];
  readonly basePrefixes: Set<string>;
  readonly seenCalls: Set<string>;
}

function pushCall(
  state: ConsumerScanState,
  entry: Omit<ConsumerHttpCall, 'project_slug' | 'channel'>
): void {
  const key = `${entry.method}:${entry.normalized_path}:${entry.file}:${entry.line}`;
  if (state.seenCalls.has(key)) return;
  state.seenCalls.add(key);
  state.calls.push({
    project_slug: state.projectSlug,
    channel: state.channel,
    ...entry,
  });
}

function resolveFetchVerb(lines: readonly string[], startIdx: number): HttpVerb {
  const windowText = lines.slice(startIdx, Math.min(lines.length, startIdx + 4)).join(' ');
  const m = INLINE_METHOD_OPT_RE.exec(windowText);
  return (m?.[1] ? toHttpVerb(m[1]) : null) ?? 'GET';
}

function recordJsCall(
  parsed: ParsedCallUrl | null,
  details: { readonly verb: HttpVerb; readonly rawUrl: string; readonly clientKind: string; readonly file: string; readonly line: number },
  state: ConsumerScanState
): void {
  if (!parsed) return;
  pushCall(state, {
    method: details.verb,
    raw_url: details.rawUrl,
    normalized_path: parsed.normalizedPath,
    ...(parsed.baseUrlVar ? { base_url_var: parsed.baseUrlVar } : {}),
    client_kind: details.clientKind,
    is_external: parsed.isExternal,
    file: details.file,
    line: details.line,
  });
}

function detectFileBasePrefix(
  lines: readonly string[],
  envPrefixByKey: ReadonlyMap<string, string>,
  fallbackPrefix: string,
  basePrefixes: Set<string>
): string {
  for (const line of lines) {
    const lit = BASE_URL_LITERAL_RE.exec(line);
    if (lit?.[1]) {
      const pref = extractUrlPathPrefix(lit[1]);
      if (pref) {
        basePrefixes.add(pref);
        return pref;
      }
    }
    const envRef = BASE_URL_ENV_RE.exec(line);
    if (envRef?.[1]) {
      const fromEnv = envPrefixByKey.get(envRef[1]);
      if (fromEnv) return fromEnv;
    }
  }
  return fallbackPrefix;
}

interface JsFileScanContext {
  readonly relFile: string;
  readonly filePrefix: string;
  readonly state: ConsumerScanState;
}

function scanJsHttpCallLine(lines: readonly string[], idx: number, ctx: JsFileScanContext): void {
  const line = lines[idx] ?? '';
  const lineNo = idx + 1;
  const methodCall = CLIENT_METHOD_CALL_RE.exec(line) ?? CLIENT_GENERIC_CALL_RE.exec(line);
  if (methodCall?.[1] && methodCall[3]) {
    const verb = toHttpVerb(methodCall[1]);
    if (verb) {
      recordJsCall(
        parseConsumerCallUrl(methodCall[3], ctx.filePrefix),
        { verb, rawUrl: methodCall[3], clientKind: 'http-client', file: ctx.relFile, line: lineNo },
        ctx.state
      );
    }
  }
  const fetchCall = FETCH_CALL_RE.exec(line);
  if (fetchCall?.[2]) {
    recordJsCall(
      parseConsumerCallUrl(fetchCall[2], ctx.filePrefix),
      {
        verb: resolveFetchVerb(lines, idx),
        rawUrl: fetchCall[2],
        clientKind: 'fetch',
        file: ctx.relFile,
        line: lineNo,
      },
      ctx.state
    );
  }
  if (REQUEST_OBJ_HEAD_RE.test(line)) {
    const verbMatch = INLINE_METHOD_OPT_RE.exec(line);
    const urlMatch = REQUEST_OBJ_URL_RE.exec(line);
    const verb = verbMatch?.[1] ? toHttpVerb(verbMatch[1]) : null;
    if (verb && urlMatch?.[1]) {
      recordJsCall(
        parseConsumerCallUrl(urlMatch[1], ctx.filePrefix),
        { verb, rawUrl: urlMatch[1], clientKind: 'request-config', file: ctx.relFile, line: lineNo },
        ctx.state
      );
    }
  }
}

function scanJsLine(lines: readonly string[], idx: number, ctx: JsFileScanContext): void {
  const line = lines[idx] ?? '';
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
  scanJsHttpCallLine(lines, idx, ctx);
  if (/router|routes/i.test(ctx.relFile)) {
    const routeMatch = ROUTER_PATH_RE.exec(line);
    if (routeMatch?.[1]) {
      ctx.state.views.push({
        project_slug: ctx.state.projectSlug,
        name: routeMatch[1],
        kind: 'route',
        file: ctx.relFile,
        line: idx + 1,
      });
    }
  }
}

function readLinesSafe(fullPath: string): string[] {
  try {
    return fs.readFileSync(fullPath, UTF8_ENCODING).split(/\r?\n/);
  } catch (err: unknown) {
    reportDebugCatchError(`consumerExtractor.readLinesSafe(${fullPath})`, err);
    return [];
  }
}

function mapUiFolderToKind(folder: string): UiViewEntry['kind'] {
  if (folder === 'screens') return 'screen';
  if (folder === 'pages') return 'page';
  return 'view';
}

function recordUiFileIfView(relFile: string, state: ConsumerScanState): void {
  const m = UI_DIR_RE.exec(relFile);
  if (!m?.[1] || !m[2]) return;
  state.views.push({
    project_slug: state.projectSlug,
    name: m[2],
    kind: mapUiFolderToKind(m[1].toLowerCase()),
    file: relFile,
    line: 1,
  });
}

interface ScriptRegexScanSpec {
  readonly projectAbs: string;
  readonly relFile: string;
  readonly regex: RegExp;
  readonly clientKind: string;
}

function scanScriptCallsByRegex(spec: ScriptRegexScanSpec, state: ConsumerScanState): void {
  const lines = readLinesSafe(path.join(spec.projectAbs, spec.relFile));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const match = spec.regex.exec(line);
    const verb = match?.[1] ? toHttpVerb(match[1]) : null;
    const rawUrl = match?.[3] ?? match?.[2];
    if (verb && rawUrl) {
      recordJsCall(
        parseConsumerCallUrl(rawUrl, state.defaultPrefix),
        { verb, rawUrl, clientKind: spec.clientKind, file: spec.relFile, line: i + 1 },
        state
      );
    }
  }
}

function buildEnvPrefixIndex(envVars: readonly EnvVarEntry[]): {
  readonly byKey: Map<string, string>;
  readonly defaultPrefix: string;
} {
  const byKey = new Map<string, string>();
  let defaultPrefix = '';
  for (const item of envVars) {
    if (item.source !== 'env_file' || item.category !== 'url_or_endpoint' || !item.sanitized_sample) {
      continue;
    }
    const prefix = extractUrlPathPrefix(item.sanitized_sample);
    if (prefix) {
      byKey.set(item.key, prefix);
      if (!defaultPrefix) defaultPrefix = prefix;
    }
  }
  return { byKey, defaultPrefix };
}

export function extractProjectConsumerArtifacts(
  project: DiscoveredProject,
  envVars: readonly EnvVarEntry[]
): {
  readonly consumerCalls: ConsumerHttpCall[];
  readonly uiViews: UiViewEntry[];
  readonly apiBasePrefixes: string[];
} {
  const { byKey: envPrefixByKey, defaultPrefix } = buildEnvPrefixIndex(envVars);
  const basePrefixes = new Set<string>(envPrefixByKey.values());
  const state: ConsumerScanState = {
    projectSlug: project.slug,
    channel: resolveChannelForProject(project),
    defaultPrefix,
    calls: [],
    views: [],
    basePrefixes,
    seenCalls: new Set<string>(),
  };

  for (const relFile of collectProjectSourceFiles(project.absPath, JS_CLIENT_EXTS, false)) {
    recordUiFileIfView(relFile, state);
    const lines = readLinesSafe(path.join(project.absPath, relFile));
    const filePrefix = detectFileBasePrefix(lines, envPrefixByKey, defaultPrefix, basePrefixes);
    const fileCtx: JsFileScanContext = { relFile, filePrefix, state };
    for (let i = 0; i < lines.length; i += 1) {
      scanJsLine(lines, i, fileCtx);
    }
  }

  for (const relFile of collectProjectSourceFiles(project.absPath, PY_EXTS, false)) {
    scanScriptCallsByRegex(
      { projectAbs: project.absPath, relFile, regex: PY_HTTP_CALL_RE, clientKind: 'python-http' },
      state
    );
  }
  for (const relFile of collectProjectSourceFiles(project.absPath, PHP_EXTS, false)) {
    scanScriptCallsByRegex(
      { projectAbs: project.absPath, relFile, regex: PHP_HTTP_CALL_RE, clientKind: 'php-http' },
      state
    );
  }

  return {
    consumerCalls: state.calls,
    uiViews: state.views,
    apiBasePrefixes: Array.from(basePrefixes).sort((a, b) => a.localeCompare(b)),
  };
}
