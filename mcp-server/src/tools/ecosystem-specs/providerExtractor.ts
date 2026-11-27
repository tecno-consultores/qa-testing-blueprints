// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { stripTrailingSlashes } from './envExtractor.js';
import { collectProjectSourceFiles } from './projectDiscovery.js';
import {
  UTF8_ENCODING,
  type DiscoveredProject,
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
const PY_DECORATOR_HEAD_RE = /^@([a-z_]\w*)\.(get|post|put|patch|delete)\(/i;
const PY_METHODS_KW_RE = /\bmethods\s*=\s*[[(]([^)\]]+)[\])]/;
const PY_MODEL_CLASS_RE =
  /^\s*class\s+([A-Z]\w*)\s*\(([^)\r\n]{1,120})\)/;
const PY_MODEL_BASE_RE = /\b(?:BaseModel|SQLModel|Base|TypedDict|DeclarativeBase)\b/;
const PY_DATACLASS_NAME_RE = /^\s*class\s+([A-Z]\w*)\b/;

const NODE_ROUTE_RE =
  /\b(?:app|router|fastify|server|[a-z_$][\w$]*(?:router|_router))\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\r\n]+)['"`]/i;
const NODE_USE_PREFIX_RE = /\b(?:app|router)\.use\(\s*['"`](\/[^'"`\r\n]+)['"`]/;
const FASTIFY_METHOD_RE = /\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i;
const FASTIFY_URL_RE = /\burl\s*:\s*['"`]([^'"`\r\n]+)['"`]/;
const NEST_CONTROLLER_RE = /^@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/;
const NEST_CONTROLLER_EMPTY_RE = /^@Controller\(\s*\)/;
const NEST_METHOD_HEAD_RE = /^@(Get|Post|Put|Patch|Delete)\(/;
const NEST_METHOD_ARG_RE = /\(\s*['"`]([^'"`]*)['"`]\s*\)/;
const NODE_EXPORT_TYPE_RE = /^export\s+(?:interface|type|class)\s+([A-Z]\w*)\b/;
const NODE_ZOD_SCHEMA_RE = /^const\s+([A-Z]\w*Schema)\s*=\s*z\.object\(/;

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

function collectPythonGlobalPrefixes(
  projectAbs: string,
  pyFiles: readonly string[]
): Map<string, string> {
  const includedPrefixes = new Map<string, string>();
  for (const relFile of pyFiles) {
    for (const line of readSourceLines(projectAbs, relFile)) {
      const inc = PY_INCLUDE_CALL_RE.exec(line);
      const pref = inc ? PY_PREFIX_KW_RE.exec(line) : null;
      if (inc?.[1] && pref?.[1]) {
        const token = inc[1].split('.')[0] ?? inc[1];
        includedPrefixes.set(token, pref[1]);
      }
    }
  }
  return includedPrefixes;
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

function scanPythonRouteLine(line: string, lineNo: number, state: PyScanState): void {
  const routerAssign = PY_ROUTER_ASSIGN_RE.exec(line);
  const routerPref = routerAssign ? PY_PREFIX_KW_RE.exec(line) : null;
  if (routerAssign?.[1] && routerPref?.[1]) {
    state.localPrefixes.set(routerAssign[1], routerPref[1]);
  }
  const trimmed = line.trim();
  const decHead = PY_DECORATOR_HEAD_RE.exec(trimmed);
  if (decHead?.[1] && decHead[2]) {
    const verb = toHttpVerb(decHead[2]);
    const pathMatch = FIRST_QUOTED_STR_RE.exec(trimmed.slice(decHead[0].length));
    if (verb && pathMatch) {
      const combinedPref = resolvePythonCombinedPrefix(
        state.outerPrefix,
        state.localPrefixes.get(decHead[1]) ?? ''
      );
      pushEndpoint(state.collector, {
        method: verb,
        path: joinRoutePaths(combinedPref, pathMatch[1] ?? '/'),
        framework: FW_FASTAPI,
        source_kind: 'code',
        file: state.relFile,
        line: lineNo,
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
    outerPrefix: globalPrefixes.get(fileStem) ?? '',
    localPrefixes: new Map<string, string>(),
    collector,
    sawDataclass: false,
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    scanPythonRouteLine(line, i + 1, state);
    scanPythonModelLine(line, trimmed, i + 1, state);
  }
}

interface NodeScanState {
  controllerPrefix: string;
  usePrefix: string;
  readonly collector: ProviderCollector;
}

function scanNodeNestDecorators(line: string, lineNo: number, relFile: string, state: NodeScanState): boolean {
  const trimmed = line.trim();
  const ctrlMatch = NEST_CONTROLLER_RE.exec(trimmed);
  if (ctrlMatch) {
    state.controllerPrefix = ctrlMatch[1] ? joinRoutePaths('/', ctrlMatch[1]) : '/';
    return true;
  }
  if (NEST_CONTROLLER_EMPTY_RE.test(trimmed)) {
    state.controllerPrefix = '/';
    return true;
  }
  const headMatch = NEST_METHOD_HEAD_RE.exec(trimmed);
  if (!headMatch?.[1]) return false;
  const verb = toHttpVerb(headMatch[1]);
  const argMatch = NEST_METHOD_ARG_RE.exec(trimmed);
  if (verb) {
    pushEndpoint(state.collector, {
      method: verb,
      path: joinRoutePaths(state.controllerPrefix, argMatch?.[1] ?? ''),
      framework: FW_NESTJS,
      source_kind: 'code',
      file: relFile,
      line: lineNo,
    });
  }
  return true;
}

function matchNodeRouteVerbAndPath(line: string): readonly [HttpVerb, string] | null {
  const direct = NODE_ROUTE_RE.exec(line);
  if (direct?.[1] && direct[2]) {
    const v = toHttpVerb(direct[1]);
    return v ? [v, direct[2]] : null;
  }
  const fMethod = FASTIFY_METHOD_RE.exec(line);
  const fUrl = fMethod ? FASTIFY_URL_RE.exec(line) : null;
  if (fMethod?.[1] && fUrl?.[1]) {
    const v = toHttpVerb(fMethod[1]);
    return v ? [v, fUrl[1]] : null;
  }
  return null;
}

function scanNodeExpressOrFastify(line: string, lineNo: number, relFile: string, state: NodeScanState): void {
  const useMatch = NODE_USE_PREFIX_RE.exec(line);
  if (useMatch?.[1]?.startsWith('/api')) {
    state.usePrefix = useMatch[1];
  }
  const matched = matchNodeRouteVerbAndPath(line);
  if (!matched) return;
  const [verb, rawPath] = matched;
  const fullPath =
    state.usePrefix && !rawPath.startsWith('/api') ? joinRoutePaths(state.usePrefix, rawPath) : rawPath;
  pushEndpoint(state.collector, {
    method: verb,
    path: fullPath,
    framework: FW_NODE,
    source_kind: 'code',
    file: relFile,
    line: lineNo,
  });
}

function scanNodeLine(line: string, lineNo: number, relFile: string, state: NodeScanState): void {
  if (scanNodeNestDecorators(line, lineNo, relFile, state)) return;
  scanNodeExpressOrFastify(line, lineNo, relFile, state);
  const trimmed = line.trim();
  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const modelMatch = NODE_EXPORT_TYPE_RE.exec(trimmed) ?? NODE_ZOD_SCHEMA_RE.exec(withoutExport);
  if (modelMatch?.[1]) {
    pushModel(state.collector, { name: modelMatch[1], kind: 'ts-type-or-schema', file: relFile, line: lineNo });
  }
}

function scanNodeFile(projectAbs: string, relFile: string, collector: ProviderCollector): void {
  const lines = readSourceLines(projectAbs, relFile);
  const state = { controllerPrefix: '', usePrefix: '', collector };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    scanNodeLine(line, i + 1, relFile, state);
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

interface PhpScanState {
  routePrefix: string;
  readonly collector: ProviderCollector;
}

function scanPhpDirectRoutes(line: string, lineNo: number, relFile: string, state: PhpScanState): void {
  const prefMatch = PHP_ROUTE_PREFIX_RE.exec(line);
  if (prefMatch?.[1]) {
    state.routePrefix = joinRoutePaths('/', prefMatch[1]);
  }
  const staticMatch = PHP_ROUTE_STATIC_RE.exec(line) ?? PHP_SLIM_ROUTE_RE.exec(line);
  if (staticMatch?.[1] && staticMatch[2]) {
    const verb = toHttpVerb(staticMatch[1]);
    if (verb) {
      pushEndpoint(state.collector, {
        method: verb,
        path: joinRoutePaths(state.routePrefix, staticMatch[2]),
        framework: FW_PHP,
        source_kind: 'code',
        file: relFile,
        line: lineNo,
      });
    }
  }
  const apiResMatch = PHP_ROUTE_API_RES_RE.exec(line);
  if (apiResMatch?.[1]) {
    expandLaravelApiResource(joinRoutePaths(state.routePrefix, apiResMatch[1]), relFile, lineNo, state.collector);
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
  const state: PhpScanState = { routePrefix: defaultPrefix, collector };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('# ')) continue;
    scanPhpDirectRoutes(line, i + 1, relFile, state);
    scanPhpAttributesAndModels(line, i + 1, relFile, state);
  }
}

function recordOpenApiPathOps(
  routePath: string,
  ops: unknown,
  relFile: string,
  collector: ProviderCollector
): void {
  if (typeof ops !== 'object' || ops === null) return;
  for (const methodKey of Object.keys(ops)) {
    const verb = toHttpVerb(methodKey);
    if (!verb) continue;
    pushEndpoint(collector, {
      method: verb,
      path: routePath,
      framework: FW_OPENAPI,
      source_kind: 'openapi',
      file: relFile,
      line: 1,
    });
  }
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
    for (const schemaName of Object.keys(schemas)) {
      pushModel(collector, { name: schemaName, kind: 'openapi-schema', file: relFile, line: 1 });
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
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
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

  if (project.stacks.includes('node-backend')) {
    for (const relFile of collectProjectSourceFiles(project.absPath, NODE_EXTS, false)) {
      scanNodeFile(project.absPath, relFile, collector);
    }
  }

  if (project.stacks.includes('php')) {
    for (const relFile of collectProjectSourceFiles(project.absPath, PHP_EXTS, false)) {
      scanPhpFile(project.absPath, relFile, collector);
    }
  }

  scanOpenApiSpecs(project.absPath, collector);
  return { endpoints: collector.endpoints, models: collector.models };
}
