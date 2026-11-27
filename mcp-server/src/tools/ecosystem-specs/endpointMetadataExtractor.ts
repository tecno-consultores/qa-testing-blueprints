// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { EndpointAccessPolicy, ProviderEndpoint } from './types.js';

type EndpointMetaFields = Pick<
  ProviderEndpoint,
  | 'handler_name'
  | 'summary'
  | 'path_params'
  | 'query_params'
  | 'request_model'
  | 'response_model'
  | 'status_codes'
  | 'access_policy'
>;

const IDENT_RE = /^[A-Za-z_]\w*$/;
const PY_DEF_LINE_RE = /^def\s+([A-Za-z_]\w*)\s*\(/;
const PY_STATUS_CODE_RE = /\bstatus_code\s*=\s*(?:status\.HTTP_)?(\d{3})\b/;
const PY_RESPONSE_MODEL_RE = /\bresponse_model\s*=\s*(?:list\[)?([A-Z]\w*)\]?/;
const PY_RETURN_MODEL_RE = /\)\s*->\s*(?:list\[)?([A-Z]\w*)\]?\s*:/;
const PY_PARAM_MODEL_RE = /\b[a-z_]\w*\s*:\s*(?:Annotated\[)?([A-Z]\w*)(?:[,\s\]=]|$)/;
const PY_QUERY_ANNOTATED_RE = /\b([a-z_]\w*)\s*:\s*Annotated\[[^,\]]{1,80},\s*Query\(/g;
const PY_QUERY_DEFAULT_RE = /\b([a-z_]\w*)\s*:\s*[^=,\r\n]{1,60}=\s*Query\(/g;
const PY_DEPENDS_RE = /\bDepends\(\s*([A-Za-z_][\w.]*)/g;
const PY_DOCSTRING_RE = /^(?:"""|''')([^"'\r\n]{1,160})/;

const NODE_GUARD_RE = /@(?:UseGuards|Roles|RequirePermissions)\(([^)\r\n]{1,160})\)/;
const NODE_STATUS_RE = /@HttpCode\(\s*(?:HttpStatus\.\w+|(\d{3}))\s*\)/;
const NODE_METHOD_HEAD_RE = /^([a-zA-Z_$]\w*)\s*\(/;
const NODE_RETURN_TYPE_RE = /\)\s*:\s*(?:Promise<)?([A-Z]\w*)/;
const NODE_BODY_DTO_RE = /@Body\([^)\r\n]{0,60}\)\s*\w+\s*:\s*([A-Z]\w*)/;
const NODE_QUERY_PARAM_RE = /@Query\(\s*['"]([a-zA-Z_]\w*)['"]\s*\)/g;
const NODE_EXPRESS_MW_RE = /\b(auth\w*|require\w*|verify\w*|guard\w*|jwt\w*|rbac\w*)\b/gi;
const NODE_JSDOC_SUMMARY_RE = /^\*\s+([^@\r\n*][^\r\n]{1,140})/;

const PHP_TUPLE_ACTION_RE = /\[\s*([A-Z]\w*)::class\s*,\s*['"]([a-zA-Z_]\w*)['"]\s*\]/;
const PHP_AT_ACTION_RE = /['"]([A-Z]\w*@[a-zA-Z_]\w*)['"]/;
const PHP_MIDDLEWARE_RE = /->middleware\(\s*(?:\[([^\]]{1,160})\]|['"]([^'"]{1,80})['"])/;
const PHP_IS_GRANTED_RE = /#\[IsGranted\(\s*['"]([^'"]+)['"]/;

const AUTH_KEYWORD_RE = /auth|user|token|jwt|session|role|perm|guard|tenant|claims|sanctum|verified/i;
const BUILTIN_PY_TYPES: ReadonlySet<string> = new Set([
  'Request',
  'Response',
  'BackgroundTasks',
  'UploadFile',
  'Header',
  'Query',
  'Path',
  'Cookie',
  'Depends',
  'Session',
  'AsyncSession',
  'HTTPAuthorizationCredentials',
]);

function extractSegmentParamName(segment: string): string | null {
  if (segment.startsWith('{') && segment.endsWith('}')) {
    const inner = segment.slice(1, -1).split(':')[0]?.trim() ?? '';
    return IDENT_RE.test(inner) ? inner : null;
  }
  if (segment.startsWith('<') && segment.endsWith('>')) {
    const parts = segment.slice(1, -1).split(':');
    const name = (parts[parts.length - 1] ?? '').trim();
    return IDENT_RE.test(name) ? name : null;
  }
  if (segment.startsWith(':')) {
    const name = segment.slice(1).trim();
    return IDENT_RE.test(name) ? name : null;
  }
  return null;
}

export function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  const seen = new Set<string>();
  for (const rawSeg of routePath.split('/')) {
    const name = extractSegmentParamName(rawSeg.trim());
    if (name && !seen.has(name)) {
      seen.add(name);
      params.push(name);
    }
  }
  return params;
}

function buildAccessPolicy(guards: readonly string[]): EndpointAccessPolicy | undefined {
  if (guards.length === 0) return undefined;
  const sorted = Array.from(new Set(guards)).sort((a, b) => a.localeCompare(b));
  return {
    auth_required: sorted.some((g) => AUTH_KEYWORD_RE.test(g)),
    guards_or_roles: sorted,
  };
}

function assembleMetaFields(raw: {
  readonly handlerName?: string;
  readonly summary?: string;
  readonly pathParams?: readonly string[];
  readonly queryParams?: readonly string[];
  readonly requestModel?: string;
  readonly responseModel?: string;
  readonly statusCodes?: readonly number[];
  readonly accessPolicy?: EndpointAccessPolicy;
}): EndpointMetaFields {
  return {
    ...(raw.handlerName ? { handler_name: raw.handlerName } : {}),
    ...(raw.summary ? { summary: raw.summary } : {}),
    ...(raw.pathParams && raw.pathParams.length > 0 ? { path_params: [...raw.pathParams] } : {}),
    ...(raw.queryParams && raw.queryParams.length > 0 ? { query_params: [...raw.queryParams] } : {}),
    ...(raw.requestModel ? { request_model: raw.requestModel } : {}),
    ...(raw.responseModel ? { response_model: raw.responseModel } : {}),
    ...(raw.statusCodes && raw.statusCodes.length > 0 ? { status_codes: [...raw.statusCodes] } : {}),
    ...(raw.accessPolicy ? { access_policy: raw.accessPolicy } : {}),
  };
}

function collectPythonSignatureBlock(
  lines: readonly string[],
  defIdx: number
): { readonly sigText: string; readonly docSummary?: string } {
  const parts: string[] = [];
  let endIdx = defIdx;
  for (let i = defIdx; i < Math.min(lines.length, defIdx + 12); i += 1) {
    const ln = (lines[i] ?? '').trim();
    parts.push(ln);
    endIdx = i;
    if (ln.endsWith(':')) break;
  }
  const nextLine = (lines[endIdx + 1] ?? '').trimStart();
  const docMatch = PY_DOCSTRING_RE.exec(nextLine);
  const docSummary = docMatch?.[1]?.replace(/(?:"""|''')\s*$/, '').trim();
  return { sigText: parts.join(' '), ...(docSummary ? { docSummary } : {}) };
}

function collectRegexGroupOne(text: string, re: RegExp): string[] {
  const items: string[] = [];
  re.lastIndex = 0;
  let m = re.exec(text);
  while (m !== null) {
    if (m[1]) items.push(m[1]);
    m = re.exec(text);
  }
  return items;
}

function extractPythonRequestModel(sigText: string): string | undefined {
  const open = sigText.indexOf('(');
  const close = sigText.lastIndexOf(')');
  if (open < 0 || close <= open) return undefined;
  for (const seg of sigText.slice(open + 1, close).split(',')) {
    if (seg.includes('Depends(') || seg.includes('Header(') || seg.includes('Query(') || seg.includes('Path(')) {
      continue;
    }
    const m = PY_PARAM_MODEL_RE.exec(seg);
    if (m?.[1] && !BUILTIN_PY_TYPES.has(m[1])) return m[1];
  }
  return undefined;
}

function resolvePythonResponseModel(decoratorBlock: string, sigText: string): string | undefined {
  const respDec = PY_RESPONSE_MODEL_RE.exec(decoratorBlock);
  if (respDec?.[1]) return respDec[1];
  const retModel = PY_RETURN_MODEL_RE.exec(sigText);
  return retModel?.[1] && !BUILTIN_PY_TYPES.has(retModel[1]) ? retModel[1] : undefined;
}

function stripPyAsync(line: string): string {
  const trimmed = line.trimStart();
  return trimmed.startsWith('async ') ? trimmed.slice(6).trimStart() : trimmed;
}

function stripTsMethodModifiers(line: string): string {
  let cur = line.trimStart();
  for (const kw of ['public ', 'private ', 'protected ', 'async ']) {
    if (cur.startsWith(kw)) cur = cur.slice(kw.length).trimStart();
  }
  return cur;
}

export function extractPythonEndpointMeta(
  lines: readonly string[],
  decoratorIdx: number,
  routePath: string
): EndpointMetaFields {
  const decParts: string[] = [];
  let defIdx = -1;
  for (let i = decoratorIdx; i < Math.min(lines.length, decoratorIdx + 12); i += 1) {
    const ln = lines[i] ?? '';
    if (PY_DEF_LINE_RE.test(stripPyAsync(ln))) {
      defIdx = i;
      break;
    }
    decParts.push(ln.trim());
  }
  const decoratorBlock = decParts.join(' ');
  const statusMatch = PY_STATUS_CODE_RE.exec(decoratorBlock);
  const handlerMatch = defIdx >= 0 ? PY_DEF_LINE_RE.exec(stripPyAsync(lines[defIdx] ?? '')) : null;
  const sig = defIdx >= 0 ? collectPythonSignatureBlock(lines, defIdx) : { sigText: '' };
  const queryParams = sig.sigText
    ? Array.from(
        new Set([
          ...collectRegexGroupOne(sig.sigText, PY_QUERY_ANNOTATED_RE),
          ...collectRegexGroupOne(sig.sigText, PY_QUERY_DEFAULT_RE),
        ])
      )
    : [];
  const guards = collectRegexGroupOne(`${decoratorBlock} ${sig.sigText}`, PY_DEPENDS_RE);

  return assembleMetaFields({
    handlerName: handlerMatch?.[1],
    summary: sig.docSummary,
    pathParams: extractPathParams(routePath),
    queryParams,
    requestModel: sig.sigText ? extractPythonRequestModel(sig.sigText) : undefined,
    responseModel: resolvePythonResponseModel(decoratorBlock, sig.sigText),
    statusCodes: statusMatch?.[1] ? [Number(statusMatch[1])] : undefined,
    accessPolicy: buildAccessPolicy(guards),
  });
}

function findPrecedingJsDocSummary(lines: readonly string[], lineIdx: number): string | undefined {
  for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 8); i -= 1) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('/**') || trimmed === '') continue;
    const m = NODE_JSDOC_SUMMARY_RE.exec(trimmed);
    if (m?.[1]) return m[1].trim();
    if (!trimmed.startsWith('*') && !trimmed.startsWith('@')) break;
  }
  return undefined;
}

interface ParsedNestMethodInfo {
  readonly handlerName: string;
  readonly requestModel?: string;
  readonly responseModel?: string;
  readonly queryParams: string[];
}

function parseNestMethodLine(line: string): ParsedNestMethodInfo | null {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('@')) return null;
  const cleaned = stripTsMethodModifiers(trimmed);
  const nm = NODE_METHOD_HEAD_RE.exec(cleaned);
  if (!nm?.[1]) return null;
  const openIdx = cleaned.indexOf('(');
  const closeIdx = cleaned.lastIndexOf(')');
  const paramsStr = openIdx >= 0 && closeIdx > openIdx ? cleaned.slice(openIdx + 1, closeIdx) : '';
  const bodyDto = NODE_BODY_DTO_RE.exec(paramsStr)?.[1];
  const queryParams = collectRegexGroupOne(paramsStr, NODE_QUERY_PARAM_RE);
  const tailAfterParams = closeIdx > openIdx ? cleaned.slice(closeIdx) : cleaned;
  const retMatch = NODE_RETURN_TYPE_RE.exec(tailAfterParams)?.[1];
  const responseModel = retMatch && retMatch !== 'Promise' && retMatch !== 'Void' ? retMatch : undefined;
  return {
    handlerName: nm[1],
    ...(bodyDto ? { requestModel: bodyDto } : {}),
    ...(responseModel ? { responseModel } : {}),
    queryParams,
  };
}

function scanNestWindow(
  lines: readonly string[],
  lineIdx: number
): {
  readonly guards: string[];
  readonly statusCode?: number;
  readonly methodInfo?: ParsedNestMethodInfo;
} {
  const guards: string[] = [];
  let statusCode: number | undefined;
  let methodInfo: ParsedNestMethodInfo | undefined;
  const start = Math.max(0, lineIdx - 4);
  const end = Math.min(lines.length, lineIdx + 6);
  for (let i = start; i < end; i += 1) {
    const ln = lines[i] ?? '';
    const g = NODE_GUARD_RE.exec(ln);
    if (g?.[1]) guards.push(g[1].trim());
    const st = NODE_STATUS_RE.exec(ln);
    if (st?.[1]) statusCode = Number(st[1]);
    if (i > lineIdx && !methodInfo) {
      const parsed = parseNestMethodLine(ln);
      if (parsed) methodInfo = parsed;
    }
  }
  return { guards, ...(statusCode ? { statusCode } : {}), ...(methodInfo ? { methodInfo } : {}) };
}

export function extractNodeEndpointMeta(
  lines: readonly string[],
  lineIdx: number,
  routePath: string,
  isNest: boolean
): EndpointMetaFields {
  const summary = findPrecedingJsDocSummary(lines, lineIdx);
  if (!isNest) {
    const guards = collectRegexGroupOne(lines[lineIdx] ?? '', NODE_EXPRESS_MW_RE);
    return assembleMetaFields({
      summary,
      pathParams: extractPathParams(routePath),
      accessPolicy: buildAccessPolicy(guards),
    });
  }
  const nest = scanNestWindow(lines, lineIdx);
  return assembleMetaFields({
    handlerName: nest.methodInfo?.handlerName,
    summary,
    pathParams: extractPathParams(routePath),
    queryParams: nest.methodInfo?.queryParams,
    requestModel: nest.methodInfo?.requestModel,
    responseModel: nest.methodInfo?.responseModel,
    statusCodes: nest.statusCode ? [nest.statusCode] : undefined,
    accessPolicy: buildAccessPolicy(nest.guards),
  });
}

function parsePhpHandlerName(windowText: string): string | undefined {
  const tuple = PHP_TUPLE_ACTION_RE.exec(windowText);
  if (tuple?.[1] && tuple[2]) return `${tuple[1]}::${tuple[2]}`;
  return PHP_AT_ACTION_RE.exec(windowText)?.[1];
}

function collectPhpGuards(windowText: string): string[] {
  const guards: string[] = [];
  const mw = PHP_MIDDLEWARE_RE.exec(windowText);
  const rawMw = mw?.[1] ?? mw?.[2];
  if (rawMw) {
    for (const part of rawMw.split(',')) {
      const cleaned = part.replace(/['"\s]/g, '');
      if (cleaned) guards.push(cleaned);
    }
  }
  const granted = PHP_IS_GRANTED_RE.exec(windowText);
  if (granted?.[1]) guards.push(granted[1]);
  return guards;
}

export function extractPhpEndpointMeta(
  lines: readonly string[],
  lineIdx: number,
  routePath: string
): EndpointMetaFields {
  const windowText = lines.slice(Math.max(0, lineIdx - 2), Math.min(lines.length, lineIdx + 3)).join(' ');
  return assembleMetaFields({
    handlerName: parsePhpHandlerName(windowText),
    pathParams: extractPathParams(routePath),
    accessPolicy: buildAccessPolicy(collectPhpGuards(windowText)),
  });
}

function extractRefSchemaName(obj: unknown): string | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.$ref === 'string') {
    return rec.$ref.split('/').pop();
  }
  if (rec.items && typeof rec.items === 'object') {
    return extractRefSchemaName(rec.items);
  }
  return undefined;
}

function extractOpenApiQueryParams(rawParams: unknown): string[] {
  if (!Array.isArray(rawParams)) return [];
  const out: string[] = [];
  for (const p of rawParams) {
    if (typeof p !== 'object' || p === null) continue;
    const prec = p as Record<string, unknown>;
    if (prec.in === 'query' && typeof prec.name === 'string') out.push(prec.name);
  }
  return out;
}

function extractFirstContentSchema(
  holder: { content?: Record<string, { schema?: unknown }> } | undefined
): string | undefined {
  const first = holder?.content ? Object.values(holder.content)[0]?.schema : undefined;
  return extractRefSchemaName(first);
}

export function extractOpenApiOpMeta(routePath: string, opObj: unknown): EndpointMetaFields {
  const pathParams = extractPathParams(routePath);
  if (typeof opObj !== 'object' || opObj === null) {
    return assembleMetaFields({ pathParams });
  }
  const op = opObj as Record<string, unknown>;
  const reqBody = op.requestBody as { content?: Record<string, { schema?: unknown }> } | undefined;
  const responses = (op.responses ?? {}) as Record<string, { content?: Record<string, { schema?: unknown }> }>;
  const statusCodes = Object.keys(responses)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 100 && n < 600)
    .sort((a, b) => a - b);
  const hasSecurity = Array.isArray(op.security) && op.security.length > 0;

  return assembleMetaFields({
    handlerName: typeof op.operationId === 'string' ? op.operationId : undefined,
    summary: typeof op.summary === 'string' ? op.summary : undefined,
    pathParams,
    queryParams: extractOpenApiQueryParams(op.parameters),
    requestModel: extractFirstContentSchema(reqBody),
    responseModel: extractFirstContentSchema(responses['200'] ?? responses['201']),
    statusCodes,
    accessPolicy: hasSecurity ? { auth_required: true, guards_or_roles: ['openapi-security'] } : undefined,
  });
}
