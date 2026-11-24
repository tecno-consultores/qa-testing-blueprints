// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { execFileSync } from 'child_process';
import { checkLintEvidenceForDirtyCode } from '../services/qa-evidence.js';
import {
  evaluateUpdateStatus,
  type EvaluateUpdateOptions,
} from '../services/version-manager.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { resolveSafeChildPath } from '../services/github-fetcher.js';
import { auditSecurityStigOwasp } from './security-auditor.js';
import { CertifyGateResult, GateCheckStatus } from '../types.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../utils/ignoredDirs.js';

const GATE_STATUS_PASSED: GateCheckStatus = 'PASSED';
const GATE_STATUS_FAILED: GateCheckStatus = 'FAILED';
const GATE_STATUS_SKIPPED: GateCheckStatus = 'SKIPPED';

const IGNORED_SCAN_DIRS = CANONICAL_IGNORED_DIRS;

interface GateCheckOutcome {
  passed: boolean;
  status: GateCheckStatus;
  blockers: string[];
}

function buildCheckOutcome(status: GateCheckStatus, blockers: string[] = []): GateCheckOutcome {
  return {
    passed: status === GATE_STATUS_PASSED,
    status,
    blockers,
  };
}

export interface CertifyGateOptions {
  requireLintEvidence?: boolean;
  strict?: boolean;
  allowUnmergedExamples?: boolean;
  execFileSyncFn?: typeof execFileSync;
  updateOptions?: Partial<Omit<EvaluateUpdateOptions, 'projectPath'>>;
  signal?: AbortSignal;
}

function throwIfCertifyAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason: unknown = signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }
  throw new Error(
    typeof reason === 'string' && reason.length > 0
      ? reason
      : 'certify_11x_gate abortado por timeout o cancelación.'
  );
}

const ALLOWED_ENV_EXAMPLES = new Set(['.env.example', 'env.example']);
const ENV_VARIANT_EXAMPLE_RE = /^\.?env\.[a-z0-9_-]+\.example$/i;

function isDeploymentEnvTemplate(fileName: string): boolean {
  return ALLOWED_ENV_EXAMPLES.has(fileName) || ENV_VARIANT_EXAMPLE_RE.test(fileName);
}

function checkUnmergedExamples(
  projectPath: string,
  allowUnmergedExamples?: boolean
): GateCheckOutcome {
  const optIn =
    allowUnmergedExamples === true || process.env.QA11X_BLUEPRINT_SOURCE_REPO === '1';
  if (optIn) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  const blockers: string[] = [];
  try {
    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      if (isDeploymentEnvTemplate(file)) continue;
      if (file.endsWith('.example') && !file.startsWith('.git')) {
        blockers.push(`Archivo .example sin fusionar en la raíz: ${file}`);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // Missing target workspace directory yields SKIPPED rather than crashing pre-creation probes
      return buildCheckOutcome(GATE_STATUS_SKIPPED);
    }
    reportDebugCatchError('certifyGate.checkUnmergedExamples', err);
    return buildCheckOutcome(GATE_STATUS_FAILED, [
      'No se pudo enumerar el directorio raíz para verificar archivos .example sin fusionar.',
    ]);
  }

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

interface JsonStringResult {
  value: string;
  endIdx: number;
}

function readJsonQuotedString(text: string, startQuoteIdx: number): JsonStringResult {
  let i = startQuoteIdx + 1;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value: out, endIdx: i };
    }
    out += ch;
    i++;
  }
  return { value: out, endIdx: text.length - 1 };
}

function skipWhitespace(text: string, idx: number): number {
  let i = idx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined || !/\s/.test(ch)) {
      break;
    }
    i++;
  }
  return i;
}

const REACT_FRONTEND_DIR = 'react-frontend';

interface JsonScopeFrame {
  type: 'object' | 'array';
  keys: Set<string>;
  expectingKey: boolean;
}

function handleJsonStringToken(
  jsonText: string,
  startIdx: number,
  top: JsonScopeFrame | undefined,
  duplicates: string[]
): number {
  const parsed = readJsonQuotedString(jsonText, startIdx);
  const afterQuote = skipWhitespace(jsonText, parsed.endIdx + 1);
  if (top?.type === 'object' && top.expectingKey && jsonText[afterQuote] === ':') {
    if (top.keys.has(parsed.value)) {
      duplicates.push(parsed.value);
    } else {
      top.keys.add(parsed.value);
    }
    top.expectingKey = false;
  }
  return parsed.endIdx + 1;
}

function updateJsonScopeStack(ch: string, scopeStack: JsonScopeFrame[]): void {
  const top = scopeStack[scopeStack.length - 1];
  if (ch === '{') {
    scopeStack.push({ type: 'object', keys: new Set(), expectingKey: true });
  } else if (ch === '[') {
    scopeStack.push({ type: 'array', keys: new Set(), expectingKey: false });
  } else if ((ch === '}' || ch === ']') && scopeStack.length > 0) {
    scopeStack.pop();
  } else if (ch === ',' && top?.type === 'object') {
    top.expectingKey = true;
  }
}

function findDuplicateKeysInText(jsonText: string): string[] {
  const duplicates: string[] = [];
  const scopeStack: JsonScopeFrame[] = [];
  let i = 0;

  while (i < jsonText.length) {
    const ch = pickAt(jsonText, i);
    if (ch === '"') {
      i = handleJsonStringToken(jsonText, i, scopeStack[scopeStack.length - 1], duplicates);
    } else {
      updateJsonScopeStack(ch, scopeStack);
      i++;
    }
  }

  return duplicates;
}

const JSONC_BASENAMES = new Set(['tsconfig.json', 'jsconfig.json', 'settings.json', 'tasks.json', 'launch.json']);

function consumeJsonString(raw: string, start: number): { chunk: string; nextIdx: number } {
  let i = start + 1;
  let escaped = false;
  while (i < raw.length) {
    const ch = raw.charAt(i);
    i += 1;
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '"') {
      break;
    }
  }
  return { chunk: raw.slice(start, i), nextIdx: i };
}

function skipJsoncComment(raw: string, start: number): number {
  const next = raw.charAt(start + 1);
  if (next === '/') {
    const nl = raw.indexOf('\n', start + 2);
    return nl === -1 ? raw.length : nl;
  }
  if (next === '*') {
    const end = raw.indexOf('*/', start + 2);
    return end === -1 ? raw.length : end + 2;
  }
  return -1;
}

function nextNonWhitespaceChar(raw: string, start: number): string {
  let idx = start;
  while (idx < raw.length && /\s/.test(raw.charAt(idx))) {
    idx += 1;
  }
  return raw.charAt(idx);
}

function stripTrailingCommasOutsideStrings(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw.charAt(i);
    if (ch === '"') {
      const token = consumeJsonString(raw, i);
      out += token.chunk;
      i = token.nextIdx;
      continue;
    }
    if (ch === ',' && (nextNonWhitespaceChar(raw, i + 1) === '}' || nextNonWhitespaceChar(raw, i + 1) === ']')) {
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function stripJsoncCommentsAndTrailingCommas(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw.charAt(i);
    if (ch === '"') {
      const token = consumeJsonString(raw, i);
      out += token.chunk;
      i = token.nextIdx;
      continue;
    }
    const commentEnd = ch === '/' ? skipJsoncComment(raw, i) : -1;
    if (commentEnd !== -1) {
      i = commentEnd;
      continue;
    }
    out += ch;
    i += 1;
  }
  return stripTrailingCommasOutsideStrings(out);
}

function isJsoncFile(rel: string): boolean {
  const base = path.basename(rel);
  const norm = rel.replace(/\\/g, '/');
  return (
    JSONC_BASENAMES.has(base) ||
    base.startsWith('tsconfig.') ||
    norm.startsWith('.vscode/') ||
    norm.includes('/.vscode/')
  );
}

function inspectSingleJsonFile(projectPath: string, file: string): string[] {
  const rel = path.relative(projectPath, file);
  const blockers: string[] = [];
  try {
    const rawText = fs.readFileSync(file, 'utf8');
    const text = isJsoncFile(rel) ? stripJsoncCommentsAndTrailingCommas(rawText) : rawText;
    const dups = findDuplicateKeysInText(text);
    if (dups.length > 0) {
      blockers.push(`Claves duplicadas detectadas en ${rel}: ${dups.join(', ')}`);
    }
    JSON.parse(text);
  } catch (err: unknown) {
    reportDebugCatchError(`certifyGate.inspectSingleJsonFile(${rel})`, err);
    blockers.push(`INVALID_JSON: JSON inválido o ilegible en ${rel}`);
  }
  return blockers;
}

function checkJsonIntegrity(projectPath: string): GateCheckOutcome {
  const blockers: string[] = [];
  const jsonFiles: string[] = [];

  function collectJson(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_SCAN_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectJson(full);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.json') || entry.name.endsWith('.json.example'))
        ) {
          jsonFiles.push(full);
        }
      }
    } catch (err: unknown) {
      reportDebugCatchError(`certifyGate.collectJson(${dir})`, err);
      if (dir === projectPath && (err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        blockers.push(`No se pudo enumerar el directorio raíz para validar integridad JSON: ${dir}`);
      }
    }
  }

  collectJson(projectPath);
  if (jsonFiles.length === 0 && blockers.length === 0) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  for (const file of jsonFiles) {
    blockers.push(...inspectSingleJsonFile(projectPath, file));
  }

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

function isUiTestFile(fileName: string): boolean {
  return /\.(unit|spec|test|e2e)\.(ts|tsx|js|jsx)$/i.test(fileName);
}

function isUiComponentFile(fileName: string): boolean {
  if (isUiTestFile(fileName)) return false;
  return fileName.endsWith('.vue') || fileName.endsWith('.tsx') || fileName.endsWith('.jsx');
}

function hasUnitTestForComponent(
  compFilePath: string,
  allTestFiles: string[],
  testContentsCache: Map<string, string>
): boolean {
  const file = path.basename(compFilePath);
  const compDir = path.dirname(compFilePath);
  const baseName = file.replace(/\.(vue|tsx|jsx)$/, '');
  const camelName = pickAt(baseName, 0).toLowerCase() + baseName.slice(1);

  const directCandidates = [
    path.join(compDir, `${baseName}.unit.ts`),
    path.join(compDir, `${baseName}.unit.tsx`),
    path.join(compDir, `${baseName}.spec.ts`),
    path.join(compDir, `${baseName}.test.ts`),
    path.join(compDir, '__tests__', `${baseName}.unit.ts`),
    path.join(compDir, '__tests__', `${baseName}.unit.tsx`),
  ];
  if (directCandidates.some((c) => fs.existsSync(c))) return true;

  const expectedNames = new Set([
    `${baseName}.unit.ts`,
    `${baseName}.unit.tsx`,
    `${camelName}.unit.ts`,
    `${camelName}.unit.tsx`,
    `${baseName}.spec.ts`,
    `${baseName}.spec.tsx`,
    `${baseName}.test.ts`,
    `${baseName}.test.tsx`,
  ]);
  if (allTestFiles.some((tf) => expectedNames.has(path.basename(tf)))) return true;

  for (const tf of allTestFiles) {
    let content = testContentsCache.get(tf);
    if (content === undefined) {
      try {
        content = fs.readFileSync(tf, 'utf8');
      } catch (err: unknown) {
        // Unreadable candidate test file safely yields empty text so remaining test files are inspected
        reportDebugCatchError(`certifyGate.hasUnitTestForComponent(${tf})`, err);
        content = '';
      }
      testContentsCache.set(tf, content);
    }
    if (content.includes(file) || content.includes(`'${baseName}'`) || content.includes(`"${baseName}"`)) {
      return true;
    }
  }
  return false;
}

function collectCandidateUiComponents(candidateRoots: readonly string[]): string[] {
  const visited = new Set<string>();
  const components: string[] = [];
  for (const rootDir of candidateRoots) {
    if (!fs.existsSync(rootDir)) continue;
    for (const fullFile of collectFilesWithExtensions(rootDir, ['.vue', '.tsx', '.jsx'])) {
      if (visited.has(fullFile)) continue;
      visited.add(fullFile);
      if (isUiComponentFile(path.basename(fullFile))) {
        components.push(fullFile);
      }
    }
  }
  return components;
}

function checkOrphanUiComponents(projectPath: string): GateCheckOutcome {
  const candidateRoots = [
    path.join(projectPath, 'src', 'components'),
    path.join(projectPath, 'src', 'views'),
    path.join(projectPath, 'src', 'pages'),
    path.join(projectPath, 'frontend', 'src'),
    path.join(projectPath, 'vue3', 'src'),
    path.join(projectPath, REACT_FRONTEND_DIR, 'src'),
  ];
  const testRoots = [
    ...candidateRoots,
    path.join(projectPath, 'tests'),
    path.join(projectPath, 'test'),
    path.join(projectPath, 'frontend', 'tests'),
    path.join(projectPath, 'frontend', 'test'),
    path.join(projectPath, 'vue3', 'tests'),
    path.join(projectPath, 'vue3', 'test'),
    path.join(projectPath, REACT_FRONTEND_DIR, 'tests'),
    path.join(projectPath, REACT_FRONTEND_DIR, 'test'),
  ];

  const components = collectCandidateUiComponents(candidateRoots);
  if (components.length === 0) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  const allTestFiles = Array.from(
    new Set(
      testRoots
        .flatMap((r) => collectFilesWithExtensions(r, ['.ts', '.tsx', '.js', '.jsx']))
        .filter((f) => isUiTestFile(path.basename(f)))
    )
  );
  const testContentsCache = new Map<string, string>();
  const blockers: string[] = [];
  for (const compFile of components) {
    if (!hasUnitTestForComponent(compFile, allTestFiles, testContentsCache)) {
      blockers.push(`Componente UI huérfano sin prueba unitaria: ${path.relative(projectPath, compFile)}`);
    }
  }

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

const ARCHITECTURAL_API_WHITELIST: Array<{ verb: string; path: string }> = [
  { verb: 'GET', path: '/health' },
  { verb: 'GET', path: '/api/v1/health' },
  { verb: 'GET', path: '/metrics' },
  { verb: 'POST', path: '/api/v1/mcp' },
  { verb: 'GET', path: '/users/me' },
  { verb: 'GET', path: '/api/v1/auth/me' },
  { verb: 'POST', path: '/api/v1/auth/login' },
  { verb: 'POST', path: '/api/v1/auth/refresh' },
  { verb: 'POST', path: '/api/v1/auth/logout' },
  { verb: 'GET', path: '/api/v1/auth/bootstrap-status' },
  { verb: 'POST', path: '/api/v1/auth/bootstrap' },
  { verb: 'POST', path: '/api/v1/auth/2fa/confirm-enrollment' },
  { verb: 'POST', path: '/api/v1/auth/2fa/verify' },
];

const SUBPATH_INTERPOLATION_TOKEN = '__SUBPATH_PARAM__';

function isRouteParamSegment(rSeg: string): boolean {
  return rSeg.startsWith('{') || rSeg.startsWith(':');
}

function trimTrailingSlashes(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '/') {
    end -= 1;
  }
  return raw.slice(0, end);
}

function segmentsPrefixMatch(routeSegs: string[], urlSegs: string[], count: number): boolean {
  for (let i = 0; i < count; i++) {
    const rSeg = pickAt(routeSegs, i);
    if (!isRouteParamSegment(rSeg) && rSeg !== urlSegs[i]) {
      return false;
    }
  }
  return true;
}

function matchesRouteSegments(routePath: string, testUrl: string): boolean {
  const routeSegs = trimTrailingSlashes(routePath).split('/');
  const urlSegs = trimTrailingSlashes(testUrl).split('/');
  const lastRouteSeg = pickAt(routeSegs, routeSegs.length - 1);
  const lastUrlSeg = pickAt(urlSegs, urlSegs.length - 1);

  if (lastRouteSeg.startsWith('{') && lastRouteSeg.endsWith(':path}')) {
    return urlSegs.length >= routeSegs.length && segmentsPrefixMatch(routeSegs, urlSegs, routeSegs.length - 1);
  }
  if (lastUrlSeg === SUBPATH_INTERPOLATION_TOKEN) {
    return routeSegs.length >= urlSegs.length && segmentsPrefixMatch(routeSegs, urlSegs, urlSegs.length - 1);
  }
  if (routeSegs.length !== urlSegs.length) return false;
  return segmentsPrefixMatch(routeSegs, urlSegs, routeSegs.length);
}

function collectFilesWithExtensions(dir: string, exts: string[]): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_SCAN_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFilesWithExtensions(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      found.push(full);
    }
  }
  return found;
}

function normalizeSubRoute(sub: string): string {
  if (!sub) return '';
  return sub.startsWith('/') ? sub : `/${sub}`;
}

function hasRouteParityIgnore(code: string, matchIndex: number): boolean {
  const prefix = code.slice(0, matchIndex);
  const lineEndIdx = code.indexOf('\n', matchIndex);
  const currentLineEnd = lineEndIdx === -1 ? code.length : lineEndIdx;
  const lineStartIdx = prefix.lastIndexOf('\n') + 1;
  const currentLine = code.slice(lineStartIdx, currentLineEnd);
  if (currentLine.includes('api-parity-ignore')) {
    return true;
  }
  const prevLines = prefix.slice(0, Math.max(0, lineStartIdx - 1)).split('\n').slice(-2);
  return prevLines.some((line) => line.includes('api-parity-ignore'));
}

function extractPhpRoutesFromCode(
  code: string,
  relFile: string
): Array<{ verb: string; path: string; relFile: string; ignoredInParity: boolean }> {
  const routes: Array<{ verb: string; path: string; relFile: string; ignoredInParity: boolean }> = [];
  const laravelRegex = /\bRoute::(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = laravelRegex.exec(code)) !== null) {
    routes.push({
      verb: pickAt(m, 1).toUpperCase(),
      path: normalizeSubRoute(pickAt(m, 2)),
      relFile,
      ignoredInParity: hasRouteParityIgnore(code, m.index),
    });
  }
  const symfonyRegex = /#\[Route\(\s*['"]([^'"]+)['"]([^)]*)\)/gi;
  while ((m = symfonyRegex.exec(code)) !== null) {
    const routePath = normalizeSubRoute(pickAt(m, 1));
    const attrTail = pickAt(m, 2);
    const methodsMatch = /methods\s*:\s*\[([^\]]+)\]/i.exec(attrTail);
    const extracted = methodsMatch?.[1]
      ? Array.from(methodsMatch[1].matchAll(/['"]([A-Za-z]+)['"]/g), (entry) =>
          pickAt(entry, 1).toUpperCase()
        )
      : [];
    const verbs = extracted.length > 0 ? extracted : ['GET'];
    const ignoredInParity = hasRouteParityIgnore(code, m.index);
    for (const verb of verbs) {
      routes.push({ verb, path: routePath, relFile, ignoredInParity });
    }
  }
  return routes;
}

function extractBackendRoutesFromFile(
  projectPath: string,
  filePath: string
): Array<{ verb: string; path: string; relFile: string; ignoredInParity: boolean }> {
  const code = fs.readFileSync(filePath, 'utf8');
  const relFile = path.relative(projectPath, filePath);
  if (filePath.endsWith('.php')) {
    return extractPhpRoutesFromCode(code, relFile);
  }
  const routes: Array<{ verb: string; path: string; relFile: string; ignoredInParity: boolean }> = [];
  const prefixMatch = /APIRouter\([^)]*prefix\s*=\s*['"]([^'"]+)['"]/.exec(code);
  const routerPrefix = prefixMatch?.[1] ? trimTrailingSlashes(prefixMatch[1]) : '';
  const hasV1Dir = filePath.split(path.sep).includes('v1');
  const basePrefix = hasV1Dir && !routerPrefix.startsWith('/api/v1') ? '/api/v1' : '';

  const decoRegex = /@(?:\w+)\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = decoRegex.exec(code)) !== null) {
    const verb = pickAt(m, 1).toUpperCase();
    const subNorm = normalizeSubRoute(pickAt(m, 2));
    routes.push({
      verb,
      path: `${basePrefix}${routerPrefix}${subNorm}` || '/',
      relFile,
      ignoredInParity: hasRouteParityIgnore(code, m.index),
    });
  }

  if (!filePath.endsWith('.py')) {
    const expressRegex = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi;
    while ((m = expressRegex.exec(code)) !== null) {
      routes.push({
        verb: pickAt(m, 1).toUpperCase(),
        path: pickAt(m, 2),
        relFile,
        ignoredInParity: hasRouteParityIgnore(code, m.index),
      });
    }
  }
  return routes;
}

function stripDynamicQuerySuffix(url: string): string {
  // Elimina ternarios con '?' o interpolaciones de query pegadas al final de un segmento (ej. `/routers${query}`)
  let cleaned = url.replace(/\$\{[^}?]*\?[^}]*\}/g, '');
  cleaned = pickAt(cleaned.split('?'), 0);
  cleaned = cleaned.replace(/([a-zA-Z0-9_}\]])\$\{[^}]+\}$/g, '$1');
  return trimTrailingSlashes(cleaned);
}

function replaceFrontendInterpolations(url: string): string {
  const withSubpath = url.replace(
    /\/\$\{\s*(?:sub_?path|path|endpoint|route|rest|resource_?path)\b[^}]*\}/gi,
    `/${SUBPATH_INTERPOLATION_TOKEN}`
  );
  return withSubpath.replace(/\$\{[^}]+\}/g, 'test_param');
}

function normalizeFrontendApiUrl(raw: string): string | null {
  let rawUrl = raw.replace(/\s+/g, '');
  if (!rawUrl.startsWith('/api/v1') && !rawUrl.startsWith('api/v1') && !rawUrl.startsWith('/health')) {
    return null;
  }
  if (!rawUrl.startsWith('/')) rawUrl = `/${rawUrl}`;
  return stripDynamicQuerySuffix(rawUrl);
}

function extractFetchCallsFromCode(
  code: string,
  relFile: string
): Array<{ verb: string; url: string; relFile: string }> {
  const calls: Array<{ verb: string; url: string; relFile: string }> = [];
  const fetchRegex = /\bfetch\s*\(\s*(['"`])/g;
  let m: RegExpExecArray | null;
  while ((m = fetchRegex.exec(code)) !== null) {
    const quote = pickAt(m, 1);
    const urlStart = m.index + m[0].length;
    const urlEnd = code.indexOf(quote, urlStart);
    const newlineIdx = code.indexOf('\n', urlStart);
    if (urlEnd < 0 || (newlineIdx >= 0 && urlEnd > newlineIdx)) {
      continue;
    }
    const cleanUrl = normalizeFrontendApiUrl(code.slice(urlStart, urlEnd));
    if (!cleanUrl) continue;

    const tailSlice = code.slice(urlEnd + 1, Math.min(code.length, urlEnd + 320));
    const closeParenIdx = tailSlice.indexOf(')');
    const optionsWindow = closeParenIdx >= 0 ? tailSlice.slice(0, closeParenIdx) : tailSlice;
    const methodMatch = /\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i.exec(optionsWindow);
    const verb = (methodMatch?.[1] ?? 'GET').toUpperCase();
    calls.push({ verb, url: cleanUrl, relFile });
  }
  return calls;
}

function extractFrontendCallsFromFile(
  projectPath: string,
  filePath: string
): Array<{ verb: string; url: string; relFile: string }> {
  const calls: Array<{ verb: string; url: string; relFile: string }> = [];
  if (/\.(unit|spec|test|e2e)\.(ts|tsx|js|jsx)$/.test(filePath)) return calls;
  const code = fs.readFileSync(filePath, 'utf8');
  const relFile = path.relative(projectPath, filePath);
  const callRegex = /\b(?:http|api|axios)\.(get|post|put|patch|delete)\b[^(\n]*\(\s*(['"`])((?:(?!\2)[^\n])+)\2/gi;
  let m: RegExpExecArray | null;
  while ((m = callRegex.exec(code)) !== null) {
    const cleanUrl = normalizeFrontendApiUrl(pickAt(m, 3));
    if (!cleanUrl) continue;
    calls.push({ verb: pickAt(m, 1).toUpperCase(), url: cleanUrl, relFile });
  }
  calls.push(...extractFetchCallsFromCode(code, relFile));
  return calls;
}

function matchesAnyRoute(
  verb: string,
  url: string,
  routes: Array<{ verb: string; path: string }>
): boolean {
  const testUrl = replaceFrontendInterpolations(url);
  for (const r of routes) {
    if (r.verb !== verb) continue;
    if (matchesRouteSegments(r.path, testUrl)) return true;
  }
  return false;
}

function isBackendRouteReferenced(
  route: { verb: string; path: string; ignoredInParity: boolean },
  frontendCalls: Array<{ verb: string; url: string }>,
  whitelist: Array<{ verb: string; path: string }>
): boolean {
  if (route.ignoredInParity) return true;
  const concreteSample = route.path
    .replace(/\{[^{}]+\}/g, 'test_param')
    .replace(/:\w+/g, 'test_param');
  if (matchesAnyRoute(route.verb, concreteSample, whitelist)) return true;

  for (const call of frontendCalls) {
    if (call.verb !== route.verb) continue;
    const testCallUrl = replaceFrontendInterpolations(call.url);
    if (matchesRouteSegments(route.path, testCallUrl)) return true;
  }
  return false;
}

function collectFrontendCallBlockers(
  frontendCalls: Array<{ verb: string; url: string; relFile: string }>,
  allAllowedRoutes: Array<{ verb: string; path: string }>
): string[] {
  const blockers: string[] = [];
  for (const call of frontendCalls) {
    if (!matchesAnyRoute(call.verb, call.url, allAllowedRoutes)) {
      blockers.push(
        `Llamada HTTP huérfana en frontend hacia endpoint inexistente (404/405): [${call.verb}] ${call.url} en ${call.relFile}`
      );
    }
  }
  return blockers;
}

function collectBackendRouteBlockers(
  backendRoutes: Array<{ verb: string; path: string; relFile: string; ignoredInParity: boolean }>,
  frontendCalls: Array<{ verb: string; url: string }>
): string[] {
  const blockers: string[] = [];
  for (const route of backendRoutes) {
    if (!isBackendRouteReferenced(route, frontendCalls, ARCHITECTURAL_API_WHITELIST)) {
      blockers.push(
        `Endpoint backend huérfano sin consumidor en frontend: [${route.verb}] ${route.path} en ${route.relFile}`
      );
    }
  }
  return blockers;
}

function checkZeroOrphanApiEndpoints(projectPath: string): GateCheckOutcome {
  const phpSrcDir = path.join(projectPath, 'php', 'src');
  const backendDirs = [
    path.join(projectPath, 'fastapi', 'src'),
    path.join(projectPath, 'node-backend', 'src'),
    phpSrcDir,
    path.join(projectPath, 'backend', 'src'),
    path.join(projectPath, 'src', 'api'),
  ];
  const frontendDirs = [
    path.join(projectPath, 'vue3', 'src'),
    path.join(projectPath, REACT_FRONTEND_DIR, 'src'),
    path.join(projectPath, 'frontend', 'src'),
  ];

  const existingBackendDirs = backendDirs.filter((d) => fs.existsSync(d));
  const hasBackendDir = existingBackendDirs.length > 0;
  const hasFrontendDir = frontendDirs.some((d) => fs.existsSync(d));
  const backendFiles = backendDirs.flatMap((d) =>
    collectFilesWithExtensions(d, ['.py', '.ts', '.js', '.php'])
  );
  const frontendFiles = frontendDirs.flatMap((d) =>
    collectFilesWithExtensions(d, ['.ts', '.tsx', '.vue', '.js', '.jsx'])
  );

  const backendRoutes = backendFiles.flatMap((f) => extractBackendRoutesFromFile(projectPath, f));
  const frontendCalls = frontendFiles.flatMap((f) => extractFrontendCallsFromFile(projectPath, f));
  const onlyPhpWithoutRoutes =
    existingBackendDirs.length === 1 && existingBackendDirs[0] === phpSrcDir && backendRoutes.length === 0;

  if (onlyPhpWithoutRoutes) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }
  if (backendRoutes.length === 0 && frontendCalls.length === 0) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }
  if (backendRoutes.length > 0 && frontendCalls.length === 0 && !hasFrontendDir) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }
  if (frontendCalls.length > 0 && backendRoutes.length === 0 && !hasBackendDir) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  const allAllowedRoutes = [...backendRoutes, ...ARCHITECTURAL_API_WHITELIST];
  const blockers = [
    ...collectFrontendCallBlockers(frontendCalls, allAllowedRoutes),
    ...collectBackendRouteBlockers(backendRoutes, frontendCalls),
  ];

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

function checkOrmParity(projectPath: string): GateCheckOutcome {
  const blockers: string[] = [];
  const modelPaths = [
    path.join(projectPath, 'src', 'models'),
    path.join(projectPath, 'fastapi', 'src', 'models'),
    path.join(projectPath, 'backend', 'src', 'models'),
    path.join(projectPath, 'src', 'models.py'),
    path.join(projectPath, 'fastapi', 'src', 'models.py'),
    path.join(projectPath, 'backend', 'src', 'models.py'),
  ];

  const hasModels = modelPaths.some((p) => fs.existsSync(p));
  if (!hasModels) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  const alembicPaths = [
    path.join(projectPath, 'alembic', 'versions'),
    path.join(projectPath, 'migrations', 'versions'),
    path.join(projectPath, 'fastapi', 'alembic', 'versions'),
    path.join(projectPath, 'fastapi', 'migrations', 'versions'),
    path.join(projectPath, 'backend', 'alembic', 'versions'),
    path.join(projectPath, 'backend', 'migrations', 'versions'),
  ];
  const hasAlembic = alembicPaths.some((p) => fs.existsSync(p));
  if (!hasAlembic) {
    blockers.push('Modelos SQLAlchemy detectados pero no se encontró directorio alembic/versions o migrations/versions.');
  }

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

function checkDuplicateVersionHeaders(changelogContent: string): string[] {
  const blockers: string[] = [];
  const seenVersions = new Set<string>();
  const lines = changelogContent.split(/\r?\n/);

  for (const line of lines) {
    const match = /^##\s+\[([^\]]+)\]/.exec(line);
    if (!match || match[1] === undefined) continue;
    const versionTag = match[1].trim();
    if (seenVersions.has(versionTag)) {
      blockers.push(`Encabezado de versión duplicado en CHANGELOG.md: [${versionTag}].`);
    } else {
      seenVersions.add(versionTag);
    }
  }

  return blockers;
}

function resolveWithParentFallback(projectPath: string, ...segments: string[]): string {
  const directPath = path.join(projectPath, ...segments);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    return directPath;
  }
  const parentDir = path.dirname(path.resolve(projectPath));
  try {
    const safeParent = resolveSafeProjectPath(parentDir);
    const parentPath = path.join(safeParent, ...segments);
    if (fs.existsSync(parentPath)) {
      return parentPath;
    }
  } catch (err: unknown) {
    reportDebugCatchError('certifyGate.resolveWithParentFallback', err);
    return directPath;
  }
  return directPath;
}

const ACTIVE_TASK_CLOSED_STATE_RE =
  /(?:Estado|Status):\*{0,2}\s*`?(?:COMPLETED|CERTIFIED_CLEAN)`?/i;

const VALID_CHECKPOINT_STATUSES = new Set<string>([
  'IN_PROGRESS',
  'PAUSED',
  'BLOCKED',
  'CERTIFIED_CLEAN',
  'COMPLETED',
  'COMPLETED (100%)',
]);

function isClosedCheckpointStatus(status: unknown): boolean {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.trim().toUpperCase();
  return (
    normalized === 'CERTIFIED_CLEAN' ||
    normalized === 'COMPLETED' ||
    normalized === 'COMPLETED (100%)'
  );
}

function isValidCheckpointStatus(status: unknown): status is string {
  return typeof status === 'string' && VALID_CHECKPOINT_STATUSES.has(status.trim().toUpperCase());
}

function splitContentLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }
  return content.replace(/\r?\n$/, '').split(/\r?\n/);
}

function checkSessionCheckpointGovernance(projectPath: string, activeTaskPath: string): string[] {
  const ckptPath = resolveWithParentFallback(projectPath, '.agents', '.cache', 'session_checkpoint.json');
  if (!fs.existsSync(ckptPath)) {
    return [];
  }
  const blockers: string[] = [];
  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(fs.readFileSync(ckptPath, 'utf8'));
  } catch (err: unknown) {
    reportDebugCatchError('certifyGate.checkSessionCheckpointGovernance', err);
    return ['.agents/.cache/session_checkpoint.json contiene JSON corrupto o ilegible.'];
  }
  if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
    return ['.agents/.cache/session_checkpoint.json debe contener un objeto JSON en la raíz.'];
  }
  const parsed = rawParsed as Record<string, unknown>;
  if (!isValidCheckpointStatus(parsed.status)) {
    blockers.push('.agents/.cache/session_checkpoint.json tiene un status inválido o no textual.');
  }
  const intent = parsed.intent_140chars;
  const intentCodepoints = typeof intent === 'string' ? [...intent].length : 0;
  if (typeof intent !== 'string' || intentCodepoints === 0 || intentCodepoints > 140) {
    blockers.push('.agents/.cache/session_checkpoint.json excede 140 caracteres en intent_140chars.');
  }
  if (!isClosedCheckpointStatus(parsed.status)) {
    return blockers;
  }
  if (Array.isArray(parsed.planned_steps) && parsed.planned_steps.length > 0) {
    blockers.push('session_checkpoint.json en CERTIFIED_CLEAN aún tiene planned_steps.');
  }
  if (
    fs.existsSync(activeTaskPath) &&
    !ACTIVE_TASK_CLOSED_STATE_RE.test(fs.readFileSync(activeTaskPath, 'utf8'))
  ) {
    blockers.push('session_checkpoint.json CERTIFIED_CLEAN no coincide con Estado COMPLETED en ACTIVE_TASK.md.');
  }
  return blockers;
}

function checkActiveTaskGovernance(projectPath: string): string[] {
  const blockers: string[] = [];
  const activeTaskPath = resolveWithParentFallback(projectPath, '.agents', 'ACTIVE_TASK.md');
  blockers.push(...checkSessionCheckpointGovernance(projectPath, activeTaskPath));
  if (!fs.existsSync(activeTaskPath)) return blockers;

  try {
    const content = fs.readFileSync(activeTaskPath, 'utf8');
    const lines = splitContentLines(content);
    const totalLines = lines.length;
    if (totalLines > 40) {
      blockers.push(
        `.agents/ACTIVE_TASK.md excede el presupuesto compacto de 40 líneas (${totalLines} líneas totales).`
      );
    }
    const isCompleted = ACTIVE_TASK_CLOSED_STATE_RE.test(content);
    const hasPendingCheckboxes = lines.some((l) => /^\s*-\s*\[\s\]/.test(l));
    if (isCompleted && hasPendingCheckboxes) {
      blockers.push(
        '.agents/ACTIVE_TASK.md está marcado como COMPLETED pero aún contiene fases pendientes (- [ ]).'
      );
    }
  } catch (err: unknown) {
    // Fail-secure: an existing ACTIVE_TASK.md that cannot be read blocks certification
    reportDebugCatchError('certifyGate.checkActiveTaskGovernance', err);
    blockers.push('No se pudo leer .agents/ACTIVE_TASK.md.');
  }

  return blockers;
}

const GRAPHIFY_OUT_DIR = 'graphify-out';
const GRAPH_JSON_FILE = 'graph.json';
const GRAPH_TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__|e2e)\//i;
const STRUCTURAL_RELATIONS = new Set<string>([
  'contains',
  'rationale_for',
  'documented_in',
  'defines',
  'declares',
  'method',
]);

interface RawGraphNode {
  id?: string;
  source_file?: string;
  file?: string;
}

interface RawGraphLink {
  source?: string;
  target?: string;
  source_file?: string;
  relation?: string;
}

function isUiToDbLink(srcRef: string, tgtRef: string): boolean {
  const src = srcRef.replace(/\\/g, '/').toLowerCase();
  const tgt = tgtRef.replace(/\\/g, '/').toLowerCase();
  if (GRAPH_TEST_PATH_RE.test(src) || GRAPH_TEST_PATH_RE.test(tgt)) {
    return false;
  }
  const isUiSource = src.includes('components/') || src.includes('views/') || src.endsWith('.vue');
  const isDbTarget = tgt.includes('models/') || tgt.includes('models.py') || tgt.includes('alembic/');
  const isDomainToApi =
    /(?:^|\/)(?:src\/)?(?:models|schemas|core|domain|services)\//.test(src) &&
    /(?:^|\/)(?:src\/)?(?:api|controllers|routes|views)\//.test(tgt);
  const isCommonUiToView =
    /(?:^|\/)(?:src\/)?components\/common\//.test(src) && /(?:^|\/)(?:src\/)?(?:views|pages)\//.test(tgt);
  return (isUiSource && isDbTarget) || isDomainToApi || isCommonUiToView;
}

function resolveGraphNodeFiles(nodes: readonly RawGraphNode[]): Map<string, string> {
  const nodeFileMap = new Map<string, string>();
  for (const node of nodes) {
    if (node.id) {
      nodeFileMap.set(node.id, node.source_file ?? node.file ?? node.id);
    }
  }
  return nodeFileMap;
}

function collectDependencyAdjacency(
  links: readonly RawGraphLink[],
  nodeFileMap: ReadonlyMap<string, string>
): Map<string, string[]> {
  const rawAdj = new Map<string, Set<string>>();
  for (const link of links) {
    const src = link.source ?? '';
    const tgt = link.target ?? '';
    const rel = link.relation ?? '';
    if (!src || !tgt || src === tgt || STRUCTURAL_RELATIONS.has(rel)) {
      continue;
    }
    if (rel === 'calls') {
      const srcFile = (link.source_file ?? nodeFileMap.get(src) ?? '').replace(/\\/g, '/');
      const tgtFile = (nodeFileMap.get(tgt) ?? '').replace(/\\/g, '/');
      if (srcFile && srcFile === tgtFile) continue;
    }
    let set = rawAdj.get(src);
    if (!set) {
      set = new Set<string>();
      rawAdj.set(src, set);
    }
    set.add(tgt);
  }
  const adj = new Map<string, string[]>();
  for (const [key, vals] of rawAdj.entries()) {
    adj.set(key, Array.from(vals).sort((a, b) => a.localeCompare(b)));
  }
  return adj;
}

function formatCanonicalCycle(pathNodes: readonly string[], backTarget: string): string {
  const startIdx = pathNodes.indexOf(backTarget);
  const core = pathNodes.slice(startIdx);
  let minIdx = 0;
  for (let i = 1; i < core.length; i += 1) {
    if ((core[i] ?? '') < (core[minIdx] ?? '')) minIdx = i;
  }
  const rotated = [...core.slice(minIdx), ...core.slice(0, minIdx)];
  return [...rotated, rotated[0] ?? backTarget].join(' -> ');
}

interface CycleDfsState {
  readonly adj: ReadonlyMap<string, string[]>;
  readonly color: Map<string, number>;
  readonly pathStack: string[];
  readonly found: Set<string>;
}

function visitCycleNode(node: string, state: CycleDfsState): void {
  state.color.set(node, 1);
  state.pathStack.push(node);
  for (const nxt of state.adj.get(node) ?? []) {
    const nxtColor = state.color.get(nxt) ?? 0;
    if (nxtColor === 1) {
      state.found.add(formatCanonicalCycle(state.pathStack, nxt));
    } else if (nxtColor === 0) {
      visitCycleNode(nxt, state);
    }
  }
  state.pathStack.pop();
  state.color.set(node, 2);
}

function detectAstGraphCycles(
  links: readonly RawGraphLink[],
  nodeFileMap: ReadonlyMap<string, string>,
  relGraph: string
): string[] {
  const adj = collectDependencyAdjacency(links, nodeFileMap);
  const state: CycleDfsState = {
    adj,
    color: new Map<string, number>(),
    pathStack: [],
    found: new Set<string>(),
  };
  for (const start of Array.from(adj.keys()).sort((a, b) => a.localeCompare(b))) {
    if ((state.color.get(start) ?? 0) === 0) {
      visitCycleNode(start, state);
    }
  }
  return Array.from(state.found)
    .sort((a, b) => a.localeCompare(b))
    .map((cycle) => `Ciclo de dependencia AST en ${relGraph}: ${cycle}`);
}

function inspectSingleGraphTopology(projectPath: string, gPath: string): string[] {
  if (!fs.existsSync(gPath)) return [];
  const relGraph = path.relative(projectPath, gPath);
  const blockers: string[] = [];

  try {
    const parsed = JSON.parse(fs.readFileSync(gPath, 'utf8')) as {
      nodes?: RawGraphNode[];
      links?: RawGraphLink[];
    };
    const nodes = parsed.nodes ?? [];
    const links = parsed.links ?? [];
    const nodeFileMap = resolveGraphNodeFiles(nodes);
    for (const link of links) {
      const srcRef = link.source_file ?? nodeFileMap.get(link.source ?? '') ?? link.source ?? '';
      const tgtRef = nodeFileMap.get(link.target ?? '') ?? link.target ?? '';
      if (isUiToDbLink(srcRef, tgtRef)) {
        blockers.push(`Violación topológica AST en ${relGraph}: ${srcRef} -> ${tgtRef}`);
      }
    }
    blockers.push(...detectAstGraphCycles(links, nodeFileMap, relGraph));
  } catch (err: unknown) {
    reportDebugCatchError(`certifyGate.inspectSingleGraphTopology(${relGraph})`, err);
    blockers.push(`Archivo de grafo AST corrupto: ${relGraph}`);
  }

  return blockers;
}

function registerGraphCandidate(graphDir: string, seenReal: Set<string>, collected: string[]): void {
  const candidate = path.join(graphDir, GRAPH_JSON_FILE);
  try {
    const realCandidate = fs.realpathSync(candidate);
    if (!seenReal.has(realCandidate)) {
      seenReal.add(realCandidate);
      collected.push(candidate);
    }
  } catch (err: unknown) {
    reportDebugCatchError('certifyGate.collectGraphFilesRecursive.realpath', err);
  }
}

function collectGraphFilesRecursive(
  dirPath: string,
  seenReal: Set<string>,
  collected: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err: unknown) {
    reportDebugCatchError('certifyGate.collectGraphFilesRecursive', err);
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.name === GRAPHIFY_OUT_DIR) {
      registerGraphCandidate(full, seenReal, collected);
      continue;
    }
    if (IGNORED_SCAN_DIRS.has(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) {
      continue;
    }
    collectGraphFilesRecursive(full, seenReal, collected);
  }
}

function checkAstTopology(projectPath: string): GateCheckOutcome {
  const blockers: string[] = [];
  const existingGraphs: string[] = [];
  collectGraphFilesRecursive(projectPath, new Set<string>(), existingGraphs);
  if (existingGraphs.length === 0) {
    return buildCheckOutcome(GATE_STATUS_SKIPPED);
  }

  for (const gPath of existingGraphs) {
    blockers.push(...inspectSingleGraphTopology(projectPath, gPath));
  }

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

interface ManifestDigestEntry {
  readonly path: string;
  readonly sha256: string;
}

interface ManifestStackDigestSpec {
  readonly files?: ManifestDigestEntry[];
  readonly readme?: string;
  readonly readme_sha256?: string;
  readonly readme_es?: string;
  readonly readme_es_sha256?: string;
}

function collectManifestDigestEntries(manifest: {
  common_files?: ManifestDigestEntry[];
  agent_governance_files?: ManifestDigestEntry[];
  stacks?: Record<string, ManifestStackDigestSpec>;
}): ManifestDigestEntry[] {
  const rawEntries: ManifestDigestEntry[] = [
    ...(manifest.common_files ?? []),
    ...(manifest.agent_governance_files ?? []),
  ];
  for (const stack of Object.values(manifest.stacks ?? {})) {
    rawEntries.push(...(stack.files ?? []));
    if (stack.readme && stack.readme_sha256) {
      rawEntries.push({ path: stack.readme, sha256: stack.readme_sha256 });
    }
    if (stack.readme_es && stack.readme_es_sha256) {
      rawEntries.push({ path: stack.readme_es, sha256: stack.readme_es_sha256 });
    }
  }
  const seen = new Set<string>();
  return rawEntries.filter((entry) => {
    const key = `${entry.path}|${entry.sha256}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verifyManifestEntrySafe(
  projectPath: string,
  entry: ManifestDigestEntry
): string | null {
  let full: string;
  try {
    full = resolveSafeChildPath(projectPath, entry.path);
    if (fs.lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink()) {
      return `Symlink no permitido en entrada del manifiesto: ${entry.path}`;
    }
  } catch (err: unknown) {
    return `Ruta insegura en manifiesto (${entry.path}): ${(err as Error).message}`;
  }
  if (!fs.existsSync(full)) {
    return `Archivo referenciado en manifest.json no existe en disco: ${entry.path}`;
  }
  const actualSha = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  if (actualSha !== entry.sha256) {
    return `Desfase SHA-256 en manifest.json para '${entry.path}' (ejecute scripts/generar-manifiesto.py o .agents/scripts/sync_governance.py).`;
  }
  return null;
}

function checkManifestCryptographicParity(projectPath: string): string[] {
  const manifestPath = path.join(projectPath, 'manifest.json');
  const genScript = path.join(projectPath, 'scripts', 'generar-manifiesto.py');
  const syncGovScript = path.join(projectPath, '.agents', 'scripts', 'sync_governance.py');
  if (!fs.existsSync(manifestPath) || (!fs.existsSync(genScript) && !fs.existsSync(syncGovScript))) {
    return [];
  }

  const blockers: string[] = [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      common_files?: ManifestDigestEntry[];
      agent_governance_files?: ManifestDigestEntry[];
      stacks?: Record<string, ManifestStackDigestSpec>;
    };
    for (const entry of collectManifestDigestEntries(manifest)) {
      const issue = verifyManifestEntrySafe(projectPath, entry);
      if (issue) blockers.push(issue);
    }
  } catch (err: unknown) {
    reportDebugCatchError('certifyGate.checkManifestCryptographicParity', err);
    blockers.push('No se pudo validar la integridad criptográfica de manifest.json.');
  }
  return blockers;
}

const ROADMAP_MILESTONE_PREFIX_RE = /\b(?:hito|milestone)\s+([0-9.]+)/i;

function extractRoadmapMilestoneId(line: string): string | null {
  const match = ROADMAP_MILESTONE_PREFIX_RE.exec(line);
  if (!match?.[1]) return null;
  const raw = match[1].endsWith('.') ? match[1].slice(0, -1) : match[1];
  return raw.split('.').every((seg) => /^\d+$/.test(seg)) ? raw.toLowerCase() : null;
}

function collectCompletedHitosFromSummary(lines: string[]): Set<string> {
  const summaryComplete = new Set<string>();
  for (const line of lines) {
    if (!line.trimStart().startsWith('|') || !line.includes('100%')) continue;
    const hitoId = extractRoadmapMilestoneId(line);
    if (hitoId) summaryComplete.add(hitoId);
  }
  return summaryComplete;
}

function checkRoadmapConsistency(projectPath: string): string[] {
  const roadmapPath = resolveWithParentFallback(projectPath, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return [];
  const blockers: string[] = [];
  try {
    const lines = fs.readFileSync(roadmapPath, 'utf8').split(/\r?\n/);
    const summaryComplete = collectCompletedHitosFromSummary(lines);
    let activeHito: string | null = null;
    for (const line of lines) {
      const secHito = line.startsWith('##') ? extractRoadmapMilestoneId(line) : null;
      if (secHito) {
        activeHito = secHito;
        continue;
      }
      if (activeHito && summaryComplete.has(activeHito) && /^\s*-\s*\[\s\]/.test(line)) {
        blockers.push(`ROADMAP.md declara Milestone/Hito ${activeHito} al 100% pero contiene tareas pendientes (- [ ]).`);
        summaryComplete.delete(activeHito);
      }
    }
  } catch (err: unknown) {
    // Fail-secure: an existing ROADMAP.md that cannot be read blocks certification
    reportDebugCatchError('certifyGate.checkRoadmapConsistency', err);
    blockers.push('No se pudo leer ROADMAP.md.');
  }
  return blockers;
}

function checkDocumentationSync(projectPath: string): GateCheckOutcome {
  const blockers: string[] = [];
  const testingMd = resolveWithParentFallback(projectPath, 'TESTING.md');
  const changelogMd = resolveWithParentFallback(projectPath, 'CHANGELOG.md');

  if (!fs.existsSync(testingMd)) {
    blockers.push('Falta archivo de aseguramiento de calidad TESTING.md en la raíz.');
  }

  if (!fs.existsSync(changelogMd)) {
    blockers.push('Falta archivo de historial CHANGELOG.md en la raíz.');
  } else {
    try {
      const content = fs.readFileSync(changelogMd, 'utf8');
      if (!content.includes('## [Unreleased]')) {
        blockers.push('CHANGELOG.md carece de la sección obligatoria ## [Unreleased].');
      }
      blockers.push(...checkDuplicateVersionHeaders(content));
    } catch (err: unknown) {
      reportDebugCatchError('certifyGate.checkDocumentationSync(CHANGELOG.md)', err);
      blockers.push('No se pudo leer CHANGELOG.md.');
    }
  }

  blockers.push(...checkActiveTaskGovernance(projectPath));
  blockers.push(...checkManifestCryptographicParity(projectPath));
  blockers.push(...checkRoadmapConsistency(projectPath));

  return buildCheckOutcome(blockers.length === 0 ? GATE_STATUS_PASSED : GATE_STATUS_FAILED, blockers);
}

function collectSecurityOutcome(
  securityAudit: Awaited<ReturnType<typeof auditSecurityStigOwasp>>
): { secretsExposed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  let secretsExposed = false;

  for (const finding of securityAudit.findings) {
    if (finding.rule_id === 'SEC-10') {
      secretsExposed = true;
      blockers.push(`Secreto detectado (${finding.file}:${finding.line}): ${finding.message}`);
    } else if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      blockers.push(
        `Vulnerabilidad ${finding.severity} (${finding.rule_id} en ${finding.file}:${finding.line}): ${finding.message}`
      );
    }
  }

  return { secretsExposed, blockers };
}

function mapCheckStatusesToBooleans(
  checkStatuses: Record<string, GateCheckStatus>
): CertifyGateResult['checks'] {
  return {
    zero_unmerged_examples: checkStatuses.zero_unmerged_examples === GATE_STATUS_PASSED,
    zero_secrets_exposed: checkStatuses.zero_secrets_exposed === GATE_STATUS_PASSED,
    json_integrity: checkStatuses.json_integrity === GATE_STATUS_PASSED,
    zero_orphan_ui_components: checkStatuses.zero_orphan_ui_components === GATE_STATUS_PASSED,
    zero_orphan_api_endpoints: checkStatuses.zero_orphan_api_endpoints === GATE_STATUS_PASSED,
    orm_alembic_parity: checkStatuses.orm_alembic_parity === GATE_STATUS_PASSED,
    ast_topology_clean: checkStatuses.ast_topology_clean === GATE_STATUS_PASSED,
    lint_evidence_verified: checkStatuses.lint_evidence_verified === GATE_STATUS_PASSED,
    security_stig_owasp_clean: checkStatuses.security_stig_owasp_clean === GATE_STATUS_PASSED,
    documentation_synced: checkStatuses.documentation_synced === GATE_STATUS_PASSED,
  };
}

/**
 * Tool 7: certify_11x_gate
 * Ejecuta todas las validaciones del estándar 11X sobre el proyecto destino
 * para certificar si cumple con la compuerta de cierre.
 */
const ALL_GATE_CHECK_KEYS = [
  'zero_unmerged_examples',
  'zero_secrets_exposed',
  'json_integrity',
  'zero_orphan_ui_components',
  'zero_orphan_api_endpoints',
  'orm_alembic_parity',
  'ast_topology_clean',
  'lint_evidence_verified',
  'security_stig_owasp_clean',
  'documentation_synced',
] as const;

export async function certify11xGate(
  projectPath: string,
  options?: CertifyGateOptions
): Promise<CertifyGateResult> {
  const signal = options?.signal;
  throwIfCertifyAborted(signal);
  const resolvedPath = resolveSafeProjectPath(projectPath);
  const requireLint = options?.requireLintEvidence ?? true;
  const strict = options?.strict ?? false;

  const isExistingDir = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();
  if (!isExistingDir) {
    const skippedStatuses = Object.fromEntries(
      ALL_GATE_CHECK_KEYS.map((key) => [key, GATE_STATUS_SKIPPED])
    ) as Record<string, GateCheckStatus>;
    const updateAvailable = await evaluateUpdateStatus({
      projectPath: resolvedPath,
      signal,
      ...options?.updateOptions,
    });
    return {
      gate_passed: false,
      project_path: resolvedPath,
      checks: mapCheckStatusesToBooleans(skippedStatuses),
      check_statuses: skippedStatuses,
      skipped_checks: [...ALL_GATE_CHECK_KEYS],
      blockers: [`La ruta del proyecto no existe o no es un directorio: ${resolvedPath}`],
      upstream_evolution_reminder:
        'MANDATORY POST-MORTEM CHECK: If this fixed a UAT/prod bug that bypassed tests, present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" in the user prompt language and invoke propose_skill_evolution_pr.',
      update_available: updateAvailable,
    };
  }

  const unmerged = checkUnmergedExamples(resolvedPath, options?.allowUnmergedExamples);
  const jsonCheck = checkJsonIntegrity(resolvedPath);
  const orphanUi = checkOrphanUiComponents(resolvedPath);
  const orphanApi = checkZeroOrphanApiEndpoints(resolvedPath);
  const ormCheck = checkOrmParity(resolvedPath);
  const astTopology = checkAstTopology(resolvedPath);
  const lintEvidence: GateCheckOutcome = requireLint
    ? checkLintEvidenceForDirtyCode(resolvedPath, options?.execFileSyncFn)
    : buildCheckOutcome(GATE_STATUS_SKIPPED);
  const docCheck = checkDocumentationSync(resolvedPath);

  throwIfCertifyAborted(signal);
  const securityAudit = await auditSecurityStigOwasp(resolvedPath);
  const { secretsExposed, blockers: securityBlockers } = collectSecurityOutcome(securityAudit);

  const checkStatuses: Record<string, GateCheckStatus> = {
    zero_unmerged_examples: unmerged.status,
    zero_secrets_exposed: secretsExposed ? GATE_STATUS_FAILED : GATE_STATUS_PASSED,
    json_integrity: jsonCheck.status,
    zero_orphan_ui_components: orphanUi.status,
    zero_orphan_api_endpoints: orphanApi.status,
    orm_alembic_parity: ormCheck.status,
    ast_topology_clean: astTopology.status,
    lint_evidence_verified: lintEvidence.status,
    security_stig_owasp_clean: securityAudit.passed ? GATE_STATUS_PASSED : GATE_STATUS_FAILED,
    documentation_synced: docCheck.status,
  };

  const skippedChecks = Object.entries(checkStatuses)
    .filter(([, status]) => status === GATE_STATUS_SKIPPED)
    .map(([key]) => key);
  const strictBlockers = strict
    ? skippedChecks.map((key) => `STRICT_SKIPPED_CHECK: ${key}`)
    : [];

  const allBlockers = [
    ...unmerged.blockers,
    ...jsonCheck.blockers,
    ...orphanUi.blockers,
    ...orphanApi.blockers,
    ...ormCheck.blockers,
    ...astTopology.blockers,
    ...lintEvidence.blockers,
    ...securityBlockers,
    ...docCheck.blockers,
    ...strictBlockers,
  ];

  throwIfCertifyAborted(signal);
  const checks = mapCheckStatusesToBooleans(checkStatuses);
  const gatePassed = allBlockers.length === 0;
  const updateAvailable = await evaluateUpdateStatus({
    projectPath: resolvedPath,
    signal,
    ...options?.updateOptions,
  });

  return {
    gate_passed: gatePassed,
    project_path: resolvedPath,
    checks,
    check_statuses: checkStatuses,
    skipped_checks: skippedChecks,
    blockers: allBlockers,
    upstream_evolution_reminder:
      'MANDATORY POST-MORTEM CHECK: If this fixed a UAT/prod bug that bypassed tests, present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" in the user prompt language and invoke propose_skill_evolution_pr.',
    update_available: updateAvailable,
  };
}
