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
const KNOWN_HTTP_CLIENT_NAMES: ReadonlySet<string> = new Set([
  'axios',
  'api',
  'apiclient',
  'http',
  'httpclient',
  'client',
  'this.http',
]);
const CLIENT_METHOD_CALL_RE =
  /\b((?:this\.)?[a-z_$]\w{0,40})\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`\r\n]+)\3/i;
const CLIENT_GENERIC_CALL_RE =
  /\b((?:this\.)?[a-z_$]\w{0,40})\.(get|post|put|patch|delete)<([^>\r\n]{1,120})>\(\s*(['"`])([^'"`\r\n]+)\4/i;
const API_SEMANTIC_ENV_KEY_RE = /(?:API|BACKEND|GATEWAY|SERVER)/i;
const NON_API_ENV_KEY_RE = /(?:SENTRY|CDN|ANALYTICS|OAUTH|DOCS|REDIRECT|CALLBACK|APP_URL|SITE_URL|PUBLIC_URL|FRONTEND_URL|WEB_URL)/i;
const EXPORTED_CLIENT_CREATE_RE = /\bexport\s+(?:const|let)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:axios|ky|ofetch)\.create\(/;
const IMPORT_DEFAULT_RE = /^import\s+([a-zA-Z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/;
const IMPORT_NAMED_RE = /^import\s+\{([^}\r\n]{1,200})\}\s+from\s+['"]([^'"]+)['"]/;
const FN_DECL_RE = /^function\s+([a-zA-Z_$]\w*)/;
const ARROW_DECL_RE = /^(?:const|let)\s+([a-zA-Z_$]\w*)\s*=\s*\(/;
const ARROW_ASYNC_DECL_RE = /^(?:const|let)\s+([a-zA-Z_$]\w*)\s*=\s*async\s*\(/;
const PY_FN_DECL_RE = /^def\s+([a-zA-Z_]\w*)\s*\(/;
const ERROR_HANDLING_RE = /\b(?:try\s*\{|\.catch\(|if\s*\(\s*![a-zA-Z_$]\w*\.ok\b|response\.ok|except\s)/;
const PAGINATION_READ_RE = /\b(?:\.items\b|\.results\b|\.total\b|\.next_page\b|\.pagination\b|page=|limit=|offset=)/i;
const FETCH_CALL_RE =
  /(?<![.\w$])(?:(?:window|globalThis)\.)?(?:\$fetch|useFetch|fetch)\(\s*(['"`])([^'"`\r\n]+)\1/;
const INLINE_METHOD_OPT_RE = /\bmethod\s*:\s*['"`]([a-z]+)['"`]/i;
const REQUEST_OBJ_HEAD_RE = /\b(?:axios|api|http|client)(?:\.request)?\(\s*\{/;
const REQUEST_OBJ_URL_RE = /\burl\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const PY_HTTP_CALL_RE =
  /\b(?:httpx|requests|client|session)\.(get|post|put|patch|delete)\(\s*f?(['"])([^'"\r\n]+)\2/i;
const PHP_HTTP_CALL_RE =
  /\b(?:Http::|\$(?:http|client)->)(get|post|put|patch|delete)\(\s*['"]([^'"\r\n]+)['"]/i;

const LEADING_JS_TEMPLATE_RE =
  /^\$\{\s*(?:import\.meta\.env\.|process\.env\.)?([A-Za-z_$][\w$.]*)\s*\}(\/.*)$/;
const LEADING_PY_TEMPLATE_RE =
  /^\{\s*([a-z_][\w.]*(?:url|base|host|api|endpoint|server)[\w.]*)\s*\}(\/.*)$/i;
const PCT_OPEN_BRACE_RE = /%7b/gi;
const PCT_CLOSE_BRACE_RE = /%7d/gi;
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

function hasPathSegmentPrefix(cleanPath: string, prefix: string): boolean {
  return cleanPath === prefix || cleanPath.startsWith(`${prefix}/`);
}

function applyPrefixIfNeeded(rawPath: string, prefix: string): string {
  const clean = normalizeEndpointPath(rawPath);
  if (!prefix || prefix === '/' || hasPathSegmentPrefix(clean, prefix)) {
    return clean;
  }
  return normalizeEndpointPath(joinRoutePaths(prefix, clean));
}

function parseLeadingTemplateCallUrl(
  trimmed: string,
  activePrefix: string,
  envPrefixByKey?: ReadonlyMap<string, string>
): ParsedCallUrl | null {
  const tplMatch = LEADING_JS_TEMPLATE_RE.exec(trimmed) ?? LEADING_PY_TEMPLATE_RE.exec(trimmed);
  if (!tplMatch?.[1] || !tplMatch[2]) return null;
  const varName = tplMatch[1];
  const resolvedPrefix = envPrefixByKey?.get(varName) ?? activePrefix;
  return {
    normalizedPath: applyPrefixIfNeeded(tplMatch[2], resolvedPrefix),
    baseUrlVar: varName,
    isExternal: false,
  };
}

function parseAbsoluteCallUrl(trimmed: string): ParsedCallUrl | null {
  try {
    const parsed = new URL(trimmed);
    const isLocal = LOCAL_API_HOSTNAMES.has(parsed.hostname.toLowerCase());
    const decodedPath = parsed.pathname
      .replace(PCT_OPEN_BRACE_RE, '{')
      .replace(PCT_CLOSE_BRACE_RE, '}');
    return { normalizedPath: normalizeEndpointPath(decodedPath), isExternal: !isLocal };
  } catch {
    return null;
  }
}

export function parseConsumerCallUrl(
  rawUrl: string,
  activePrefix: string,
  envPrefixByKey?: ReadonlyMap<string, string>
): ParsedCallUrl | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('mailto:')) return null;

  const tplParsed = parseLeadingTemplateCallUrl(trimmed, activePrefix, envPrefixByKey);
  if (tplParsed) return tplParsed;
  if (EXTERNAL_HTTP_URL_RE.test(trimmed)) return parseAbsoluteCallUrl(trimmed);
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
  readonly envPrefixByKey: ReadonlyMap<string, string>;
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

interface CallRecordDetails {
  readonly verb: HttpVerb;
  readonly rawUrl: string;
  readonly clientKind: string;
  readonly file: string;
  readonly line: number;
  readonly callerFunction?: string;
  readonly requestTypeArg?: string;
  readonly responseTypeArg?: string;
  readonly hasErrorHandling?: boolean;
  readonly readsPaginationEnvelope?: boolean;
}

function stripFnModifiers(line: string): string {
  let cur = line.trimStart();
  if (cur.startsWith('export ')) cur = cur.slice(7).trimStart();
  if (cur.startsWith('async ')) cur = cur.slice(6).trimStart();
  return cur;
}

function findEnclosingFunctionName(lines: readonly string[], idx: number): string | undefined {
  for (let i = idx; i >= Math.max(0, idx - 30); i -= 1) {
    const clean = stripFnModifiers(lines[i] ?? '');
    const m =
      FN_DECL_RE.exec(clean) ??
      ARROW_DECL_RE.exec(clean) ??
      ARROW_ASYNC_DECL_RE.exec(clean) ??
      PY_FN_DECL_RE.exec(clean);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function detectCallContractContext(lines: readonly string[], idx: number): {
  readonly hasErrorHandling: boolean;
  readonly readsPaginationEnvelope: boolean;
} {
  const snippet = lines.slice(Math.max(0, idx - 6), Math.min(lines.length, idx + 8)).join('\n');
  return {
    hasErrorHandling: ERROR_HANDLING_RE.test(snippet),
    readsPaginationEnvelope: PAGINATION_READ_RE.test(snippet),
  };
}

function parseGenericDtoArgs(rawGeneric: string | undefined): {
  readonly responseTypeArg?: string;
  readonly requestTypeArg?: string;
} {
  if (!rawGeneric) return {};
  const parts = rawGeneric
    .split(',')
    .map((p) => p.replace(/\[\]$/, '').trim())
    .filter((p) => /^[A-Z]\w*$/.test(p));
  return {
    ...(parts[0] ? { responseTypeArg: parts[0] } : {}),
    ...(parts[1] ? { requestTypeArg: parts[1] } : {}),
  };
}

function recordJsCall(
  parsed: ParsedCallUrl | null,
  details: CallRecordDetails,
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
    ...(details.callerFunction ? { caller_function: details.callerFunction } : {}),
    ...(details.requestTypeArg ? { request_type_arg: details.requestTypeArg } : {}),
    ...(details.responseTypeArg ? { response_type_arg: details.responseTypeArg } : {}),
    ...(details.hasErrorHandling !== undefined ? { has_error_handling: details.hasErrorHandling } : {}),
    ...(details.readsPaginationEnvelope !== undefined
      ? { reads_pagination_envelope: details.readsPaginationEnvelope }
      : {}),
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
  readonly exportedClients: ReadonlyMap<string, string>;
  readonly state: ConsumerScanState;
}

interface CallLineMeta {
  readonly lineNo: number;
  readonly callerFunction?: string;
  readonly hasErrorHandling: boolean;
  readonly readsPaginationEnvelope: boolean;
}

function isHttpClientIdentifier(
  name: string,
  exportedClients: ReadonlyMap<string, string>
): boolean {
  if (exportedClients.has(name)) return true;
  const lower = name.toLowerCase();
  return (
    KNOWN_HTTP_CLIENT_NAMES.has(lower) ||
    lower.endsWith('api') ||
    lower.endsWith('http') ||
    lower.endsWith('client')
  );
}

function extractMatchedClientCall(line: string): {
  readonly clientName: string;
  readonly verbRaw: string;
  readonly url: string;
  readonly genericRaw?: string;
} | null {
  const genericCall = CLIENT_GENERIC_CALL_RE.exec(line);
  if (genericCall) {
    return {
      clientName: genericCall[1] ?? '',
      verbRaw: genericCall[2] ?? '',
      genericRaw: genericCall[3],
      url: genericCall[5] ?? '',
    };
  }
  const methodCall = CLIENT_METHOD_CALL_RE.exec(line);
  return methodCall
    ? { clientName: methodCall[1] ?? '', verbRaw: methodCall[2] ?? '', url: methodCall[4] ?? '' }
    : null;
}

function scanJsClientMethodCall(line: string, meta: CallLineMeta, ctx: JsFileScanContext): void {
  const matched = extractMatchedClientCall(line);
  if (!matched?.url || !isHttpClientIdentifier(matched.clientName, ctx.exportedClients)) return;
  const verb = toHttpVerb(matched.verbRaw);
  if (!verb) return;
  const dtoArgs = parseGenericDtoArgs(matched.genericRaw);
  recordJsCall(
    parseConsumerCallUrl(matched.url, ctx.filePrefix, ctx.state.envPrefixByKey),
    {
      verb,
      rawUrl: matched.url,
      clientKind: 'http-client',
      file: ctx.relFile,
      line: meta.lineNo,
      callerFunction: meta.callerFunction,
      hasErrorHandling: meta.hasErrorHandling,
      readsPaginationEnvelope: meta.readsPaginationEnvelope,
      ...dtoArgs,
    },
    ctx.state
  );
}

function scanJsRequestConfigCall(
  lines: readonly string[],
  idx: number,
  meta: CallLineMeta,
  ctx: JsFileScanContext
): void {
  if (!REQUEST_OBJ_HEAD_RE.test(lines[idx] ?? '')) return;
  const reqWindow = lines.slice(idx, Math.min(lines.length, idx + 5)).join(' ');
  const verbMatch = INLINE_METHOD_OPT_RE.exec(reqWindow);
  const urlMatch = REQUEST_OBJ_URL_RE.exec(reqWindow);
  const verb = verbMatch?.[1] ? toHttpVerb(verbMatch[1]) : null;
  if (!verb || !urlMatch?.[1]) return;
  recordJsCall(
    parseConsumerCallUrl(urlMatch[1], ctx.filePrefix, ctx.state.envPrefixByKey),
    {
      verb,
      rawUrl: urlMatch[1],
      clientKind: 'request-config',
      file: ctx.relFile,
      line: meta.lineNo,
      callerFunction: meta.callerFunction,
      hasErrorHandling: meta.hasErrorHandling,
      readsPaginationEnvelope: meta.readsPaginationEnvelope,
    },
    ctx.state
  );
}

function scanJsHttpCallLine(lines: readonly string[], idx: number, ctx: JsFileScanContext): void {
  const line = lines[idx] ?? '';
  const contractCtx = detectCallContractContext(lines, idx);
  const meta: CallLineMeta = {
    lineNo: idx + 1,
    callerFunction: findEnclosingFunctionName(lines, idx),
    ...contractCtx,
  };
  scanJsClientMethodCall(line, meta, ctx);
  const fetchCall = FETCH_CALL_RE.exec(line);
  if (fetchCall?.[2]) {
    recordJsCall(
      parseConsumerCallUrl(fetchCall[2], ctx.filePrefix, ctx.state.envPrefixByKey),
      {
        verb: resolveFetchVerb(lines, idx),
        rawUrl: fetchCall[2],
        clientKind: 'fetch',
        file: ctx.relFile,
        line: meta.lineNo,
        callerFunction: meta.callerFunction,
        hasErrorHandling: meta.hasErrorHandling,
        readsPaginationEnvelope: meta.readsPaginationEnvelope,
      },
      ctx.state
    );
  }
  scanJsRequestConfigCall(lines, idx, meta, ctx);
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
        parseConsumerCallUrl(rawUrl, state.defaultPrefix, state.envPrefixByKey),
        { verb, rawUrl, clientKind: spec.clientKind, file: spec.relFile, line: i + 1 },
        state
      );
    }
  }
}

function isApiSemanticEnvKey(key: string): boolean {
  if (NON_API_ENV_KEY_RE.test(key) && !API_SEMANTIC_ENV_KEY_RE.test(key)) {
    return false;
  }
  return API_SEMANTIC_ENV_KEY_RE.test(key);
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
      if (!defaultPrefix && isApiSemanticEnvKey(item.key)) defaultPrefix = prefix;
    }
  }
  return { byKey, defaultPrefix };
}

function collectExportedClientPrefixes(
  projectAbs: string,
  jsFiles: readonly string[],
  envPrefixByKey: ReadonlyMap<string, string>,
  basePrefixes: Set<string>
): Map<string, string> {
  const exported = new Map<string, string>();
  for (const relFile of jsFiles) {
    const lines = readLinesSafe(path.join(projectAbs, relFile));
    for (let i = 0; i < lines.length; i += 1) {
      const m = EXPORTED_CLIENT_CREATE_RE.exec(lines[i] ?? '');
      if (!m?.[1]) continue;
      const slice = lines.slice(i, Math.min(lines.length, i + 8));
      const pref = detectFileBasePrefix(slice, envPrefixByKey, '', basePrefixes);
      if (pref) exported.set(m[1], pref);
    }
  }
  return exported;
}

function resolveImportedClientPrefix(
  lines: readonly string[],
  exportedClients: ReadonlyMap<string, string>
): string {
  if (exportedClients.size === 0) return '';
  for (const line of lines) {
    const trimmed = line.trimStart();
    const defImp = IMPORT_DEFAULT_RE.exec(trimmed);
    const namedImp = defImp ? null : IMPORT_NAMED_RE.exec(trimmed);
    const names = defImp?.[1]
      ? [defImp[1]]
      : (namedImp?.[1] ?? '').split(',').map((s) => s.trim().split(' as ')[0]?.trim() ?? '');
    for (const name of names) {
      const found = exportedClients.get(name);
      if (found) return found;
    }
  }
  return '';
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
    envPrefixByKey,
    calls: [],
    views: [],
    basePrefixes,
    seenCalls: new Set<string>(),
  };

  const jsFiles = collectProjectSourceFiles(project.absPath, JS_CLIENT_EXTS, false);
  const exportedClientPrefixes = collectExportedClientPrefixes(
    project.absPath,
    jsFiles,
    envPrefixByKey,
    basePrefixes
  );

  for (const relFile of jsFiles) {
    recordUiFileIfView(relFile, state);
    const lines = readLinesSafe(path.join(project.absPath, relFile));
    const importedPref = resolveImportedClientPrefix(lines, exportedClientPrefixes);
    const filePrefix = detectFileBasePrefix(
      lines,
      envPrefixByKey,
      importedPref || defaultPrefix,
      basePrefixes
    );
    const fileCtx: JsFileScanContext = {
      relFile,
      filePrefix,
      exportedClients: exportedClientPrefixes,
      state,
    };
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
