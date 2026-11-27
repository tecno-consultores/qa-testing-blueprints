// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import {
  extractNodeEndpointMeta,
  extractOpenApiOpMeta,
  extractPhpEndpointMeta,
  extractPythonEndpointMeta,
} from './endpointMetadataExtractor.js';
import { stripTrailingSlashes } from './envExtractor.js';
import { collectProjectSourceFiles, isSafeRegularFile } from './projectDiscovery.js';
import { extractSchemasAndEnums } from './schemaAndEnumExtractor.js';
import {
  UTF8_ENCODING,
  type DiscoveredProject,
  type DomainEnumSymbol,
  type DomainModelField,
  type DomainModelSymbol,
  type HttpVerb,
  type ProviderEndpoint,
} from './types.js';

const PY_EXTS: ReadonlySet<string> = new Set(['.py']);
const NODE_EXTS: ReadonlySet<string> = new Set(['.ts', '.js', '.mjs', '.cjs']);
const PHP_EXTS: ReadonlySet<string> = new Set(['.php']);
const OPENAPI_NAMES: readonly string[] = [
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml',
];

const HTTP_VERBS_SET: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FW_FASTAPI = 'fastapi';
const FW_NODE = 'node-http';
const FW_NESTJS = 'nestjs';
const FW_PHP = 'php';
const FW_OPENAPI = 'openapi';

const TEMPLATE_PARAM_RE = /\$\{[^}]+\}/g;
const BRACE_PARAM_RE = /\{[\w:]+\}/g;
const ANGLE_PARAM_RE = /<[\w:]+>/g;
const COLON_PARAM_RE = /:([A-Za-z_]\w*)(?=\/|$)/g;
const MULTI_SLASH_RE = /\/{2,}/g;
const FIRST_QUOTED_STR_RE = /['"]([^'"]*)['"]/;

const PY_ROUTER_ASSIGN_RE = /\b([A-Za-z_]\w*)\s*=\s*APIRouter\(/;
const PY_PREFIX_KW_RE = /\bprefix\s*=\s*['"]([^'"]+)['"]/;
const PY_INCLUDE_CALL_RE = /\binclude_router\(\s*([\w.]+)/;
const PY_FROM_IMPORT_RE = /^\s*from\s+([\w.]+)\s+import\s+([A-Za-z_]\w*)/;
const PY_IMPORT_AS_RE = /\bas\s+([A-Za-z_]\w*)/;
const PY_DECORATOR_HEAD_RE = /^@([a-z_]\w*)\.(get|post|put|patch|delete)\(/i;
const PY_METHODS_KW_RE = /\bmethods\s*=\s*[[(]([^)\]]+)[\])]/;
const PY_MODEL_CLASS_RE =
  /^\s*class\s+([A-Z]\w*)\s*\(([^)\r\n]{1,120})\)/;
const PY_MODEL_BASE_RE = /\b(?:BaseModel|SQLModel|Base|TypedDict|DeclarativeBase)\b/;
const PY_DATACLASS_NAME_RE = /^\s*class\s+([A-Z]\w*)\b/;

const NODE_ROUTE_RE =
  /\b(app|router|fastify|server|[a-z_$][\w$]*(?:router|_router))\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\r\n]+)['"`]/i;
const NODE_USE_PREFIX_RE =
  /\b(?:app|router)\.use\(\s*['"`](\/[^'"`\r\n]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/;
const NODE_IMPORT_DEFAULT_RE = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/;
const NODE_IMPORT_NAMED_RE = /^\s*import\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*from\s+['"]([^'"]+)['"]/;
const NEST_GLOBAL_PREFIX_RE = /\bsetGlobalPrefix\(\s*['"`]([^'"`\r\n]+)['"`]/;
const FASTIFY_METHOD_RE = /\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i;
const FASTIFY_URL_RE = /\burl\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const NEST_CONTROLLER_RE = /^@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/;
const NEST_CONTROLLER_EMPTY_RE = /^@Controller\(\s*\)/;
const NEST_METHOD_HEAD_RE = /^@(Get|Post|Put|Patch|Delete)\(/;
const NEST_METHOD_ARG_RE = /\(\s*['"`]([^'"`]*)['"`]\s*\)/;
const NODE_EXPORT_TYPE_RE = /^export\s+(?:interface|type|class)\s+([A-Z]\w*)\b/;
const NODE_ZOD_SCHEMA_RE = /^const\s+([A-Z]\w*)\s*=\s*z\.object\(/;

const PHP_ROUTE_STATIC_RE = /\bRoute::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/i;
const PHP_ROUTE_API_RES_RE = /\bRoute::apiResource\(\s*['"]([^'"]+)['"]/i;
const PHP_ROUTE_PREFIX_RE = /\bRoute::prefix\(\s*['"]([^'"]+)['"]\)/;
const PHP_SLIM_ROUTE_RE = /\$(?:app|router|group)->(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/i;
const PHP_ATTR_ROUTE_PATH_RE = /#\[Route\(\s*['"]([^'"]+)['"]/;
const PHP_ATTR_METHODS_RE = /\bmethods\s*:\s*\[([^\]]+)\]/;
const PHP_MODEL_CLASS_RE = /^class\s+([A-Z]\w*)\s+extends\s+Model\b/;

const YAML_PATH_KEY_RE = /^(\s{2,4})(['"]?)(\/[^'"\s:]+)\2\s*:\s*$/;
const YAML_VERB_KEY_RE = /^(\s{4,8})(get|post|put|patch|delete)\s*:\s*$/i;
const YAML_SCHEMA_KEY_RE = /^\s{4}([A-Z]\w*)\s*:\s*$/;
const QUOTED_VERB_RE = /['"]([A-Za-z]+)['"]/g;

export function toHttpVerb(raw: string): HttpVerb | null {
  const upper = raw.trim().toUpperCase();
  return HTTP_VERBS_SET.has(upper) ? (upper as HttpVerb) : null;
}

function stripLeadingSlashes(input: string): string {
  let start = 0;
  while (start < input.length && input[start] === '/') start += 1;
  return input.slice(start);
}

export function joinRoutePaths(prefix: string, subPath: string): string {
  const cleanPrefix = stripTrailingSlashes(prefix.trim());
  const cleanSub = subPath.trim();
  if (!cleanPrefix) return cleanSub.startsWith('/') ? cleanSub : `/${cleanSub}`;
  const leadingPrefix = cleanPrefix.startsWith('/') ? cleanPrefix : `/${cleanPrefix}`;
  if (!cleanSub || cleanSub === '/') return leadingPrefix;
  const combined = `${leadingPrefix}/${stripLeadingSlashes(cleanSub)}`;
  return combined.replace(MULTI_SLASH_RE, '/');
}

export function normalizeEndpointPath(rawPath: string): string {
  const withoutQuery = rawPath.split(/[?#]/, 1)[0]?.trim() ?? '';
  if (!withoutQuery) return '/';
  const withLead = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const parameterized = withLead
    .replace(TEMPLATE_PARAM_RE, '{param}')
    .replace(BRACE_PARAM_RE, '{param}')
    .replace(ANGLE_PARAM_RE, '{param}')
    .replace(COLON_PARAM_RE, '{param}')
    .replace(MULTI_SLASH_RE, '/');
  return parameterized.length > 1 ? stripTrailingSlashes(parameterized) || '/' : parameterized;
}

function readSourceLines(projectAbs: string, relFile: string): string[] {
  try {
    return fs.readFileSync(path.join(projectAbs, relFile), UTF8_ENCODING).split(/\r?\n/);
  } catch (err: unknown) {
    reportDebugCatchError(`providerExtractor.readSourceLines(${relFile})`, err);
    return [];
  }
}

interface ProviderCollector {
  readonly projectSlug: string;
  readonly endpoints: ProviderEndpoint[];
  readonly models: DomainModelSymbol[];
  readonly seenEndpoints: Set<string>;
  readonly seenModels: Set<string>;
}

function pushEndpoint(collector: ProviderCollector, item: Omit<ProviderEndpoint, 'project_slug' | 'normalized_path'>): void {
  const normalized = normalizeEndpointPath(item.path);
  const key = `${item.method}:${normalized}:${item.source_kind}`;
  if (collector.seenEndpoints.has(key)) return;
  collector.seenEndpoints.add(key);
  collector.endpoints.push({
    project_slug: collector.projectSlug,
    ...item,
    normalized_path: normalized,
  });
}

function pushModel(collector: ProviderCollector, item: Omit<DomainModelSymbol, 'project_slug'>): void {
  const key = `${item.name}:${item.file}`;
  if (collector.seenModels.has(key)) return;
  collector.seenModels.add(key);
  collector.models.push({ project_slug: collector.projectSlug, ...item });
}

function joinCallWindow(lines: readonly string[], startIdx: number): string {
  const end = Math.min(lines.length, startIdx + 5);
  const parts: string[] = [];
  for (let j = startIdx; j < end; j += 1) {
    const seg = (lines[j] ?? '').trim();
    parts.push(seg);
    if (seg.includes(')')) break;
  }
  return parts.join(' ');
}

function propagatePrefixHops(
  directEdges: ReadonlyArray<readonly [string, string, string]>
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (let pass = 0; pass < 3; pass += 1) {
    for (const [parentFile, childTarget, edgePref] of directEdges) {
      const parentPref = resolved.get(parentFile) ?? '';
      resolved.set(childTarget, parentPref ? joinRoutePaths(parentPref, edgePref) : edgePref);
    }
  }
  return resolved;
}

function resolvePythonModuleToRelFile(
  modulePath: string,
  importerRel: string,
  pyFilesSet: ReadonlySet<string>
): string | null {
  let dotCount = 0;
  while (dotCount < modulePath.length && modulePath[dotCount] === '.') dotCount += 1;
  if (dotCount > 0) {
    const upCount = Math.max(0, dotCount - 1);
    let baseDir = path.posix.dirname(importerRel);
    for (let u = 0; u < upCount; u += 1) baseDir = path.posix.dirname(baseDir);
    const tail = modulePath.slice(dotCount).replace(/\./g, '/');
    const relCand = tail ? path.posix.join(baseDir, `${tail}.py`) : path.posix.join(baseDir, '__init__.py');
    if (pyFilesSet.has(relCand)) return relCand;
  }
  const asPath = modulePath.replace(/\./g, '/');
  for (const cand of [`${asPath}.py`, `src/${asPath}.py`, `app/${asPath}.py`, `${asPath}/__init__.py`]) {
    if (pyFilesSet.has(cand)) return cand;
  }
  for (const file of pyFilesSet) {
    if (file.endsWith(`/${asPath}.py`)) return file;
  }
  return null;
}

function collectPythonImportTargets(
  lines: readonly string[],
  importerRel: string,
  pyFilesSet: ReadonlySet<string>
): Map<string, string> {
  const aliasToTarget = new Map<string, string>();
  for (const line of lines) {
    const imp = PY_FROM_IMPORT_RE.exec(line);
    if (!imp?.[1] || !imp[2]) continue;
    const submoduleExpr = imp[1].endsWith('.') ? `${imp[1]}${imp[2]}` : `${imp[1]}.${imp[2]}`;
    const resolvedFile =
      resolvePythonModuleToRelFile(submoduleExpr, importerRel, pyFilesSet) ??
      resolvePythonModuleToRelFile(imp[1], importerRel, pyFilesSet);
    const fallbackStem = imp[2] !== 'router' ? imp[2] : imp[1].split('.').filter(Boolean).pop();
    const targetKey = resolvedFile ?? fallbackStem;
    if (!targetKey) continue;
    const asMatch = PY_IMPORT_AS_RE.exec(line.slice(imp.index + imp[0].length));
    aliasToTarget.set(asMatch?.[1] ?? imp[2], targetKey);
  }
  return aliasToTarget;
}

function collectFilePyIncludeLinks(
  lines: readonly string[],
  relFile: string,
  aliasToTarget: ReadonlyMap<string, string>
): Array<readonly [string, string, string]> {
  const links: Array<readonly [string, string, string]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!(lines[i] ?? '').includes('include_router(')) continue;
    const snippet = joinCallWindow(lines, i);
    const inc = PY_INCLUDE_CALL_RE.exec(snippet);
    const pref = inc ? PY_PREFIX_KW_RE.exec(snippet) : null;
    if (!inc?.[1] || !pref?.[1]) continue;
    const token = inc[1].split('.')[0] ?? inc[1];
    links.push([relFile, aliasToTarget.get(token) ?? token, pref[1]]);
  }
  return links;
}

function collectPythonGlobalPrefixes(
  projectAbs: string,
  pyFiles: readonly string[]
): Map<string, string> {
  const pyFilesSet = new Set<string>(pyFiles);
  const directLinks: Array<readonly [string, string, string]> = [];
  for (const relFile of pyFiles) {
    const lines = readSourceLines(projectAbs, relFile);
    const aliasToTarget = collectPythonImportTargets(lines, relFile, pyFilesSet);
    directLinks.push(...collectFilePyIncludeLinks(lines, relFile, aliasToTarget));
  }
  return propagatePrefixHops(directLinks);
}

function parseQuotedMethods(rawList: string): HttpVerb[] {
  const verbs: HttpVerb[] = [];
  QUOTED_VERB_RE.lastIndex = 0;
  let m = QUOTED_VERB_RE.exec(rawList);
  while (m !== null) {
    const v = toHttpVerb(m[1] ?? '');
    if (v) verbs.push(v);
    m = QUOTED_VERB_RE.exec(rawList);
  }
  return verbs.length > 0 ? verbs : ['GET'];
}

interface PyScanState {
  readonly relFile: string;
  readonly outerPrefix: string;
  readonly localPrefixes: Map<string, string>;
  readonly collector: ProviderCollector;
  sawDataclass: boolean;
}

function resolvePythonCombinedPrefix(outerPrefix: string, localPref: string): string {
  if (outerPrefix && !localPref.startsWith(outerPrefix)) {
    return joinRoutePaths(outerPrefix, localPref);
  }
  return localPref || outerPrefix;
}

function scanPythonAddApiRoute(line: string, lineNo: number, state: PyScanState): void {
  const idx = line.indexOf('add_api_route(');
  if (idx === -1) return;
  const tail = line.slice(idx + 14);
  const pathMatch = FIRST_QUOTED_STR_RE.exec(tail);
  const methodsMatch = PY_METHODS_KW_RE.exec(tail);
  if (!pathMatch?.[1] || !methodsMatch?.[1]) return;
  for (const verb of parseQuotedMethods(methodsMatch[1])) {
    pushEndpoint(state.collector, {
      method: verb,
      path: joinRoutePaths(state.outerPrefix, pathMatch[1]),
      framework: FW_FASTAPI,
      source_kind: 'code',
      file: state.relFile,
      line: lineNo,
    });
  }
}

function scanPythonRouteLine(lines: readonly string[], lineIdx: number, state: PyScanState): void {
  const line = lines[lineIdx] ?? '';
  const lineNo = lineIdx + 1;
  const routerAssign = PY_ROUTER_ASSIGN_RE.exec(line);
  if (routerAssign?.[1]) {
    const routerPref = PY_PREFIX_KW_RE.exec(joinCallWindow(lines, lineIdx));
    if (routerPref?.[1]) state.localPrefixes.set(routerAssign[1], routerPref[1]);
  }
  const trimmed = line.trim();
  const decHead = PY_DECORATOR_HEAD_RE.exec(trimmed);
  if (decHead?.[1] && decHead[2]) {
    const verb = toHttpVerb(decHead[2]);
    const snippet = joinCallWindow(lines, lineIdx);
    const pathMatch = FIRST_QUOTED_STR_RE.exec(snippet.slice(decHead[0].length));
    if (verb && pathMatch) {
      const combinedPref = resolvePythonCombinedPrefix(
        state.outerPrefix,
        state.localPrefixes.get(decHead[1]) ?? ''
      );
      const fullPath = joinRoutePaths(combinedPref, pathMatch[1] ?? '/');
      const meta = extractPythonEndpointMeta(lines, lineIdx, fullPath);
      pushEndpoint(state.collector, {
        method: verb,
        path: fullPath,
        framework: FW_FASTAPI,
        source_kind: 'code',
        file: state.relFile,
        line: lineNo,
        ...meta,
      });
    }
  }
  scanPythonAddApiRoute(line, lineNo, state);
}

function scanPythonModelLine(line: string, trimmed: string, lineNo: number, state: PyScanState): void {
  if (trimmed.startsWith('@dataclass')) {
    state.sawDataclass = true;
    return;
  }
  const modelMatch = PY_MODEL_CLASS_RE.exec(line);
  if (modelMatch?.[1] && modelMatch[2] && PY_MODEL_BASE_RE.test(modelMatch[2])) {
    pushModel(state.collector, { name: modelMatch[1], kind: 'python-model', file: state.relFile, line: lineNo });
  } else if (state.sawDataclass) {
    const dcMatch = PY_DATACLASS_NAME_RE.exec(line);
    if (dcMatch?.[1]) {
      pushModel(state.collector, { name: dcMatch[1], kind: 'dataclass', file: state.relFile, line: lineNo });
    }
  }
  state.sawDataclass = false;
}

function scanPythonFile(
  projectAbs: string,
  relFile: string,
  globalPrefixes: ReadonlyMap<string, string>,
  collector: ProviderCollector
): void {
  const lines = readSourceLines(projectAbs, relFile);
  const fileStem = path.basename(relFile, '.py');
  const state: PyScanState = {
    relFile,
    outerPrefix: globalPrefixes.get(relFile) ?? globalPrefixes.get(fileStem) ?? '',
    localPrefixes: new Map<string, string>(),
    collector,
    sawDataclass: false,
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    scanPythonRouteLine(lines, i, state);
    scanPythonModelLine(line, trimmed, i + 1, state);
  }
}

interface NodeProjectPrefixes {
  readonly globalNestPrefix: string;
  readonly routerFilePrefixes: ReadonlyMap<string, string>;
}

interface NodeScanState {
  controllerPrefix: string;
  readonly outerFilePrefix: string;
  readonly globalNestPrefix: string;
  readonly localMountPrefixes: Map<string, string>;
  readonly collector: ProviderCollector;
}

function resolveNodeRelativeImport(
  importerRel: string,
  specifier: string,
  nodeFilesSet: ReadonlySet<string>
): string | null {
  const baseNoExt = path.posix
    .normalize(path.posix.join(path.posix.dirname(importerRel), specifier))
    .replace(/\.[cm]?[jt]s$/, '');
  for (const ext of ['.ts', '.js', '.mts', '.mjs', '/index.ts', '/index.js']) {
    const cand = `${baseNoExt}${ext}`;
    if (nodeFilesSet.has(cand)) return cand;
  }
  return null;
}

function collectNodeFileImports(
  lines: readonly string[],
  importerRel: string,
  nodeFilesSet: ReadonlySet<string>
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const line of lines) {
    const m = NODE_IMPORT_DEFAULT_RE.exec(line) ?? NODE_IMPORT_NAMED_RE.exec(line);
    if (!m?.[1] || !m[2] || !m[2].startsWith('.')) continue;
    const resolved = resolveNodeRelativeImport(importerRel, m[2], nodeFilesSet);
    const stem = path.posix.basename(m[2]).replace(/\.[cm]?[jt]s$/, '');
    if (resolved ?? stem) imports.set(m[1], resolved ?? stem);
  }
  return imports;
}

function scanFileNodeMounts(
  lines: readonly string[],
  relFile: string,
  imports: ReadonlyMap<string, string>
): { readonly nestPrefix?: string; readonly mounts: Array<readonly [string, string, string]> } {
  let nestPrefix: string | undefined;
  const mounts: Array<readonly [string, string, string]> = [];
  for (const line of lines) {
    const nestPref = NEST_GLOBAL_PREFIX_RE.exec(line);
    if (nestPref?.[1] && !nestPrefix) {
      nestPrefix = joinRoutePaths('/', nestPref[1]);
    }
    const useMatch = NODE_USE_PREFIX_RE.exec(line);
    const targetKey = useMatch?.[2] ? imports.get(useMatch[2]) : undefined;
    if (useMatch?.[1] && targetKey) {
      mounts.push([relFile, targetKey, useMatch[1]]);
    }
  }
  return { ...(nestPrefix ? { nestPrefix } : {}), mounts };
}

function collectNodeProjectPrefixes(
  projectAbs: string,
  nodeFiles: readonly string[]
): NodeProjectPrefixes {
  const nodeFilesSet = new Set<string>(nodeFiles);
  let globalNestPrefix = '';
  const directMounts: Array<readonly [string, string, string]> = [];
  for (const relFile of nodeFiles) {
    const lines = readSourceLines(projectAbs, relFile);
    const imports = collectNodeFileImports(lines, relFile, nodeFilesSet);
    const scanned = scanFileNodeMounts(lines, relFile, imports);
    if (scanned.nestPrefix && !globalNestPrefix) globalNestPrefix = scanned.nestPrefix;
    directMounts.push(...scanned.mounts);
  }
  return { globalNestPrefix, routerFilePrefixes: propagatePrefixHops(directMounts) };
}

function resolveNestControllerPrefix(rawCtrlPath: string, globalNestPrefix: string): string {
  const local = rawCtrlPath ? joinRoutePaths('/', rawCtrlPath) : '/';
  if (!globalNestPrefix || local === globalNestPrefix || local.startsWith(`${globalNestPrefix}/`)) {
    return local;
  }
  return joinRoutePaths(globalNestPrefix, local);
}

function scanNodeNestDecorators(
  lines: readonly string[],
  lineIdx: number,
  relFile: string,
  state: NodeScanState
): boolean {
  const line = lines[lineIdx] ?? '';
  const lineNo = lineIdx + 1;
  const trimmed = line.trim();
  const ctrlMatch = NEST_CONTROLLER_RE.exec(trimmed);
  if (ctrlMatch) {
    state.controllerPrefix = resolveNestControllerPrefix(ctrlMatch[1] ?? '', state.globalNestPrefix);
    return true;
  }
  if (NEST_CONTROLLER_EMPTY_RE.test(trimmed)) {
    state.controllerPrefix = resolveNestControllerPrefix('', state.globalNestPrefix);
    return true;
  }
  const headMatch = NEST_METHOD_HEAD_RE.exec(trimmed);
  if (!headMatch?.[1]) return false;
  const verb = toHttpVerb(headMatch[1]);
  const argMatch = NEST_METHOD_ARG_RE.exec(trimmed);
  if (verb) {
    const fullPath = joinRoutePaths(state.controllerPrefix, argMatch?.[1] ?? '');
    const meta = extractNodeEndpointMeta(lines, lineIdx, fullPath, true);
    pushEndpoint(state.collector, {
      method: verb,
      path: fullPath,
      framework: FW_NESTJS,
      source_kind: 'code',
      file: relFile,
      line: lineNo,
      ...meta,
    });
  }
  return true;
}

function matchNodeRouteVerbAndPath(line: string): readonly [string, HttpVerb, string] | null {
  const direct = NODE_ROUTE_RE.exec(line);
  if (direct?.[1] && direct[2] && direct[3]) {
    const v = toHttpVerb(direct[2]);
    return v ? [direct[1], v, direct[3]] : null;
  }
  const fMethod = FASTIFY_METHOD_RE.exec(line);
  const fUrl = fMethod ? FASTIFY_URL_RE.exec(line) : null;
  if (fMethod?.[1] && fUrl?.[1]) {
    const v = toHttpVerb(fMethod[1]);
    return v ? ['fastify', v, fUrl[1]] : null;
  }
  return null;
}

function resolveNodeRouteFullPath(receiver: string, rawPath: string, state: NodeScanState): string {
  const mountPrefix =
    state.localMountPrefixes.get(receiver) ??
    (receiver !== 'app' && receiver !== 'fastify' && receiver !== 'server'
      ? state.outerFilePrefix
      : '');
  if (!mountPrefix || rawPath === mountPrefix || rawPath.startsWith(`${mountPrefix}/`)) {
    return rawPath;
  }
  return joinRoutePaths(mountPrefix, rawPath);
}

function scanNodeExpressOrFastify(
  lines: readonly string[],
  lineIdx: number,
  relFile: string,
  state: NodeScanState
): void {
  const line = lines[lineIdx] ?? '';
  const useMatch = NODE_USE_PREFIX_RE.exec(line);
  if (useMatch?.[1] && useMatch[2]) {
    state.localMountPrefixes.set(useMatch[2], useMatch[1]);
  }
  const matched = matchNodeRouteVerbAndPath(line);
  if (!matched) return;
  const [receiver, verb, rawPath] = matched;
  const fullPath = resolveNodeRouteFullPath(receiver, rawPath, state);
  const meta = extractNodeEndpointMeta(lines, lineIdx, fullPath, false);
  pushEndpoint(state.collector, {
    method: verb,
    path: fullPath,
    framework: FW_NODE,
    source_kind: 'code',
    file: relFile,
    line: lineIdx + 1,
    ...meta,
  });
}

function scanNodeLine(
  lines: readonly string[],
  lineIdx: number,
  relFile: string,
  state: NodeScanState
): void {
  if (scanNodeNestDecorators(lines, lineIdx, relFile, state)) return;
  scanNodeExpressOrFastify(lines, lineIdx, relFile, state);
  const line = lines[lineIdx] ?? '';
  const trimmed = line.trim();
  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const modelMatch = NODE_EXPORT_TYPE_RE.exec(trimmed) ?? NODE_ZOD_SCHEMA_RE.exec(withoutExport);
  if (modelMatch?.[1]) {
    pushModel(state.collector, { name: modelMatch[1], kind: 'ts-type-or-schema', file: relFile, line: lineIdx + 1 });
  }
}

function scanNodeFile(
  projectAbs: string,
  relFile: string,
  prefixes: NodeProjectPrefixes,
  collector: ProviderCollector
): void {
  const lines = readSourceLines(projectAbs, relFile);
  const fileStem = path.basename(relFile, path.extname(relFile));
  const state: NodeScanState = {
    controllerPrefix: '',
    outerFilePrefix: prefixes.routerFilePrefixes.get(relFile) ?? prefixes.routerFilePrefixes.get(fileStem) ?? '',
    globalNestPrefix: prefixes.globalNestPrefix,
    localMountPrefixes: new Map<string, string>(),
    collector,
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    scanNodeLine(lines, i, relFile, state);
  }
}

function expandLaravelApiResource(
  basePath: string,
  relFile: string,
  lineNo: number,
  collector: ProviderCollector
): void {
  const itemPath = joinRoutePaths(basePath, '{id}');
  const specs: ReadonlyArray<readonly [HttpVerb, string]> = [
    ['GET', basePath],
    ['POST', basePath],
    ['GET', itemPath],
    ['PUT', itemPath],
    ['PATCH', itemPath],
    ['DELETE', itemPath],
  ];
  for (const [method, routePath] of specs) {
    pushEndpoint(collector, {
      method,
      path: routePath,
      framework: FW_PHP,
      source_kind: 'code',
      file: relFile,
      line: lineNo,
    });
  }
}

interface PhpPrefixGroup {
  readonly prefix: string;
  readonly depth: number;
}

interface PhpScanState {
  readonly basePrefix: string;
  readonly groupStack: PhpPrefixGroup[];
  braceDepth: number;
  readonly collector: ProviderCollector;
}

function resolveCurrentPhpPrefix(state: PhpScanState): string {
  let acc = state.basePrefix;
  for (const group of state.groupStack) {
    const clean = joinRoutePaths('/', group.prefix);
    acc =
      acc && (clean === acc || clean.startsWith(`${acc}/`))
        ? clean
        : joinRoutePaths(acc, clean);
  }
  return acc;
}

function countCharOccurrences(input: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === ch) count += 1;
  }
  return count;
}

function updatePhpScopeDepth(line: string, state: PhpScanState): void {
  const opens = countCharOccurrences(line, '{');
  const closes = countCharOccurrences(line, '}');
  state.braceDepth = Math.max(0, state.braceDepth + opens - closes);
  while (
    state.groupStack.length > 0 &&
    (state.groupStack[state.groupStack.length - 1]?.depth ?? 0) >= state.braceDepth
  ) {
    state.groupStack.pop();
  }
}

function scanPhpDirectRoutes(
  lines: readonly string[],
  lineIdx: number,
  relFile: string,
  state: PhpScanState
): void {
  const line = lines[lineIdx] ?? '';
  const lineNo = lineIdx + 1;
  const prefMatch = PHP_ROUTE_PREFIX_RE.exec(line);
  if (prefMatch?.[1]) {
    state.groupStack.push({ prefix: prefMatch[1], depth: state.braceDepth });
  }
  const activePrefix = resolveCurrentPhpPrefix(state);
  const staticMatch = PHP_ROUTE_STATIC_RE.exec(line) ?? PHP_SLIM_ROUTE_RE.exec(line);
  if (staticMatch?.[1] && staticMatch[2]) {
    const verb = toHttpVerb(staticMatch[1]);
    if (verb) {
      const fullPath = joinRoutePaths(activePrefix, staticMatch[2]);
      const meta = extractPhpEndpointMeta(lines, lineIdx, fullPath);
      pushEndpoint(state.collector, {
        method: verb,
        path: fullPath,
        framework: FW_PHP,
        source_kind: 'code',
        file: relFile,
        line: lineNo,
        ...meta,
      });
    }
  }
  const apiResMatch = PHP_ROUTE_API_RES_RE.exec(line);
  if (apiResMatch?.[1]) {
    expandLaravelApiResource(joinRoutePaths(activePrefix, apiResMatch[1]), relFile, lineNo, state.collector);
  }
}

function scanPhpAttributesAndModels(line: string, lineNo: number, relFile: string, state: PhpScanState): void {
  const attrPath = PHP_ATTR_ROUTE_PATH_RE.exec(line);
  if (attrPath?.[1]) {
    const attrMethods = PHP_ATTR_METHODS_RE.exec(line);
    const verbs: HttpVerb[] = attrMethods?.[1] ? parseQuotedMethods(attrMethods[1]) : ['GET'];
    for (const verb of verbs) {
      pushEndpoint(state.collector, {
        method: verb,
        path: attrPath[1],
        framework: FW_PHP,
        source_kind: 'code',
        file: relFile,
        line: lineNo,
      });
    }
  }
  const cleanLine = line.trim().replace(/^final\s+/, '');
  const modelMatch = PHP_MODEL_CLASS_RE.exec(cleanLine);
  if (modelMatch?.[1]) {
    pushModel(state.collector, { name: modelMatch[1], kind: 'php-model', file: relFile, line: lineNo });
  }
}

function scanPhpFile(projectAbs: string, relFile: string, collector: ProviderCollector): void {
  const lines = readSourceLines(projectAbs, relFile);
  const defaultPrefix = relFile.endsWith('routes/api.php') ? '/api' : '';
  const state: PhpScanState = {
    basePrefix: defaultPrefix,
    groupStack: [],
    braceDepth: 0,
    collector,
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('# ')) continue;
    scanPhpDirectRoutes(lines, i, relFile, state);
    scanPhpAttributesAndModels(line, i + 1, relFile, state);
    updatePhpScopeDepth(line, state);
  }
}

function recordOpenApiPathOps(
  routePath: string,
  ops: unknown,
  relFile: string,
  collector: ProviderCollector
): void {
  if (typeof ops !== 'object' || ops === null) return;
  for (const [methodKey, opVal] of Object.entries(ops)) {
    const verb = toHttpVerb(methodKey);
    if (!verb) continue;
    const meta = extractOpenApiOpMeta(routePath, opVal);
    pushEndpoint(collector, {
      method: verb,
      path: routePath,
      framework: FW_OPENAPI,
      source_kind: 'openapi',
      file: relFile,
      line: 1,
      ...meta,
    });
  }
}

function resolveOpenApiPropType(prop: Record<string, unknown> | undefined): string {
  if (typeof prop?.type === 'string') return prop.type;
  if (typeof prop?.$ref === 'string') return prop.$ref.split('/').pop() ?? 'object';
  return 'unknown';
}

function parseOpenApiSchemaFields(schemaVal: unknown): DomainModelField[] {
  if (typeof schemaVal !== 'object' || schemaVal === null) return [];
  const rec = schemaVal as { properties?: Record<string, Record<string, unknown>>; required?: unknown[] };
  if (!rec.properties || typeof rec.properties !== 'object') return [];
  const reqSet = new Set<string>(Array.isArray(rec.required) ? rec.required.map(String) : []);
  return Object.entries(rec.properties).map(([name, prop]) => ({
    name,
    type: resolveOpenApiPropType(prop),
    required: reqSet.has(name),
  }));
}

function parseOpenApiJsonFile(fullPath: string, relFile: string, collector: ProviderCollector): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, UTF8_ENCODING)) as {
      paths?: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };
    const paths = parsed.paths ?? {};
    for (const [routePath, ops] of Object.entries(paths)) {
      recordOpenApiPathOps(routePath, ops, relFile, collector);
    }
    const schemas = parsed.components?.schemas ?? {};
    for (const [schemaName, schemaVal] of Object.entries(schemas)) {
      const fields = parseOpenApiSchemaFields(schemaVal);
      pushModel(collector, {
        name: schemaName,
        kind: 'openapi-schema',
        file: relFile,
        line: 1,
        ...(fields.length > 0 ? { fields } : {}),
      });
    }
  } catch (err: unknown) {
    reportDebugCatchError(`providerExtractor.parseOpenApiJsonFile(${relFile})`, err);
  }
}

interface OpenApiYamlState {
  section: 'none' | 'paths' | 'schemas';
  currentPath: string;
  readonly relFile: string;
  readonly collector: ProviderCollector;
}

function stepOpenApiYamlSection(line: string, state: OpenApiYamlState): boolean {
  if (/^paths\s*:/.test(line)) {
    state.section = 'paths';
    state.currentPath = '';
    return true;
  }
  if (/^\s{2}schemas\s*:/.test(line)) {
    state.section = 'schemas';
    return true;
  }
  if (/^[A-Za-z]/.test(line)) {
    state.section = 'none';
    state.currentPath = '';
    return true;
  }
  return false;
}

function stepOpenApiYamlContent(line: string, lineNo: number, state: OpenApiYamlState): void {
  if (state.section === 'paths') {
    const pathMatch = YAML_PATH_KEY_RE.exec(line);
    if (pathMatch?.[3]) {
      state.currentPath = pathMatch[3];
      return;
    }
    const verbMatch = YAML_VERB_KEY_RE.exec(line);
    const verb = verbMatch?.[2] ? toHttpVerb(verbMatch[2]) : null;
    if (verb && state.currentPath) {
      pushEndpoint(state.collector, {
        method: verb,
        path: state.currentPath,
        framework: FW_OPENAPI,
        source_kind: 'openapi',
        file: state.relFile,
        line: lineNo,
      });
    }
    return;
  }
  if (state.section === 'schemas') {
    const schMatch = YAML_SCHEMA_KEY_RE.exec(line);
    if (schMatch?.[1]) {
      pushModel(state.collector, {
        name: schMatch[1],
        kind: 'openapi-schema',
        file: state.relFile,
        line: lineNo,
      });
    }
  }
}

function parseOpenApiYamlFile(fullPath: string, relFile: string, collector: ProviderCollector): void {
  let lines: string[];
  try {
    lines = fs.readFileSync(fullPath, UTF8_ENCODING).split(/\r?\n/);
  } catch (err: unknown) {
    reportDebugCatchError(`providerExtractor.parseOpenApiYamlFile(${relFile})`, err);
    return;
  }
  const state: OpenApiYamlState = { section: 'none', currentPath: '', relFile, collector };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!stepOpenApiYamlSection(line, state)) {
      stepOpenApiYamlContent(line, i + 1, state);
    }
  }
}

function scanOpenApiSpecs(projectAbs: string, collector: ProviderCollector): void {
  for (const sub of ['', 'docs', 'spec']) {
    for (const fileName of OPENAPI_NAMES) {
      const rel = sub ? `${sub}/${fileName}` : fileName;
      const fullPath = path.join(projectAbs, rel);
      if (!isSafeRegularFile(fullPath)) continue;
      if (fileName.endsWith('.json')) {
        parseOpenApiJsonFile(fullPath, rel, collector);
      } else {
        parseOpenApiYamlFile(fullPath, rel, collector);
      }
    }
  }
}

export function extractProjectProviderArtifacts(project: DiscoveredProject): {
  readonly endpoints: ProviderEndpoint[];
  readonly models: DomainModelSymbol[];
  readonly enums: DomainEnumSymbol[];
} {
  const collector: ProviderCollector = {
    projectSlug: project.slug,
    endpoints: [],
    models: [],
    seenEndpoints: new Set<string>(),
    seenModels: new Set<string>(),
  };

  if (project.stacks.includes('fastapi') || project.stacks.includes('python')) {
    const pyFiles = collectProjectSourceFiles(project.absPath, PY_EXTS, false);
    const globalPrefixes = collectPythonGlobalPrefixes(project.absPath, pyFiles);
    for (const relFile of pyFiles) {
      scanPythonFile(project.absPath, relFile, globalPrefixes, collector);
    }
  }

  if (project.stacks.includes('node-backend') || project.stacks.includes('vue3') || project.stacks.includes('react-frontend')) {
    const nodeFiles = collectProjectSourceFiles(project.absPath, NODE_EXTS, false);
    const nodePrefixes = collectNodeProjectPrefixes(project.absPath, nodeFiles);
    for (const relFile of nodeFiles) {
      scanNodeFile(project.absPath, relFile, nodePrefixes, collector);
    }
  }

  if (project.stacks.includes('php')) {
    for (const relFile of collectProjectSourceFiles(project.absPath, PHP_EXTS, false)) {
      scanPhpFile(project.absPath, relFile, collector);
    }
  }

  scanOpenApiSpecs(project.absPath, collector);
  const { models, enums } = extractSchemasAndEnums(project, collector.models);
  return { endpoints: collector.endpoints, models, enums };
}
