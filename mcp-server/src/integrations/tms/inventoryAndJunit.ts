// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_TAG_RE,
  CODE_INVALID_INPUT,
  CODE_XXE_DETECTED,
  IGNORED_SCAN_DIRS,
  MAX_DETAIL_LEN,
  MODE_INVENTORY,
  PRIMARY_TAG_PREFIX_RE,
  STATUS_GAPS_DETECTED,
  STATUS_TRACEABILITY_OK,
  TmsSecurityError,
  type InventorySummary,
  type JunitBuilderState,
  type MappedTestRecord,
  type ModeExecutionContext,
  type ParsedJunitCase,
  type ParsedJunitSummary,
  type TmsSyncArgs,
  type TmsSyncResult,
  type XmlTagToken,
} from './types.js';
import { sanitizeUntrustedOutput } from '../../security/promptGuard.js';
import {
  getNowMs,
  isContainedPath,
  redactTmsSecrets,
  resolveSafeWorkspacePath,
} from './security.js';

const TRACEABLE_TEST_SUFFIXES = [
  '.feature',
  '.test.ts',
  '.unit.ts',
  '.spec.ts',
  '.e2e.ts',
  '.bats',
  '_test.py',
  'Test.php',
  'Test.pest.php',
] as const;

function isTraceableTestFileName(fileName: string): boolean {
  if (fileName.startsWith('test_') && fileName.endsWith('.py')) {
    return true;
  }
  return TRACEABLE_TEST_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function scanDirectoryForTests(dirReal: string, rootReal: string, out: string[]): void {
  const entries = fs.readdirSync(dirReal, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || IGNORED_SCAN_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirReal, entry.name);
    const resolved = fs.realpathSync(fullPath);
    if (!isContainedPath(rootReal, resolved)) {
      continue;
    }
    if (entry.isDirectory()) {
      scanDirectoryForTests(resolved, rootReal, out);
    } else if (entry.isFile() && isTraceableTestFileName(entry.name)) {
      out.push(resolved);
    }
  }
}

function extractCanonicalTags(content: string): { allTags: string[]; primaryTags: string[] } {
  const matches = Array.from(content.matchAll(ALL_TAG_RE), (m) => m[0]);
  const allSet = new Set<string>();
  const primarySet = new Set<string>();
  for (const raw of matches) {
    const upper = raw.toUpperCase();
    allSet.add(upper);
    if (PRIMARY_TAG_PREFIX_RE.test(upper)) {
      primarySet.add(upper);
    }
  }
  return {
    allTags: [...allSet].sort((a, b) => a.localeCompare(b)),
    primaryTags: [...primarySet].sort((a, b) => a.localeCompare(b)),
  };
}

function matchesRequiredKey(discoveredTags: ReadonlySet<string>, rawReq: string): boolean {
  const norm = rawReq.trim().toUpperCase();
  if (norm.length === 0) {
    return true;
  }
  if (norm.startsWith('@')) {
    return discoveredTags.has(norm);
  }
  if (discoveredTags.has(`@${norm}`)) {
    return true;
  }
  const suffix = `-${norm}`;
  for (const tag of discoveredTags) {
    if (tag.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function computeInventoryCoverage(
  totalFiles: number,
  mappedCount: number,
  requiredCount: number,
  uncoveredCount: number
): number {
  if (totalFiles === 0 && requiredCount === 0) {
    return 0;
  }
  const filePct = totalFiles > 0 ? (mappedCount / totalFiles) * 100 : 0;
  if (requiredCount === 0) {
    return Number(filePct.toFixed(2));
  }
  const reqPct = ((requiredCount - uncoveredCount) / requiredCount) * 100;
  return Number(Math.min(filePct, reqPct).toFixed(2));
}

function buildInventorySummary(
  workspaceRoot: string,
  targetDir: string,
  requiredKeys: readonly string[]
): InventorySummary {
  const rootReal = fs.realpathSync(path.resolve(workspaceRoot));
  const scanReal = resolveSafeWorkspacePath(workspaceRoot, targetDir, 'dir');
  const testFiles: string[] = [];
  scanDirectoryForTests(scanReal, rootReal, testFiles);
  testFiles.sort((a, b) => a.localeCompare(b));

  const mappedTests: MappedTestRecord[] = [];
  const untaggedTests: string[] = [];
  const discoveredSet = new Set<string>();

  for (const absFile of testFiles) {
    const relPosix = path.relative(rootReal, absFile).split(path.sep).join('/');
    const content = fs.readFileSync(absFile, 'utf8');
    const { allTags, primaryTags } = extractCanonicalTags(content);
    for (const tag of allTags) {
      discoveredSet.add(tag);
    }
    if (primaryTags.length > 0) {
      mappedTests.push({ file: relPosix, tags: allTags });
    } else {
      untaggedTests.push(relPosix);
    }
  }

  const normalizedReqs = requiredKeys.map((k) => k.trim()).filter((k) => k.length > 0);
  const uncoveredRequirements = normalizedReqs.filter(
    (req) => !matchesRequiredKey(discoveredSet, req)
  );
  const hasGaps =
    testFiles.length === 0 || untaggedTests.length > 0 || uncoveredRequirements.length > 0;
  const verdict = hasGaps ? STATUS_GAPS_DETECTED : STATUS_TRACEABILITY_OK;
  const coveragePct = computeInventoryCoverage(
    testFiles.length,
    mappedTests.length,
    normalizedReqs.length,
    uncoveredRequirements.length
  );

  return {
    totalTestFiles: testFiles.length,
    mappedTests,
    untaggedTests,
    discoveredTags: [...discoveredSet].sort((a, b) => a.localeCompare(b)),
    uncoveredRequirements,
    coveragePct,
    verdict,
  };
}



export function executeInventoryMode(ctx: ModeExecutionContext): TmsSyncResult {
  const { args, provider, workspaceRoot, startedAt, deps } = ctx;
  const targetDir = args.targetDir ?? '.';
  const requiredKeys = args.requiredKeys ?? [];
  const inventory = buildInventorySummary(workspaceRoot, targetDir, requiredKeys);
  const durationMs = Math.max(0, getNowMs(deps) - startedAt);
  return {
    mode: MODE_INVENTORY,
    provider,
    status: inventory.verdict,
    dryRun: args.dryRun ?? true,
    attempts: 0,
    durationMs,
    inventory,
    message:
      inventory.verdict === STATUS_TRACEABILITY_OK
        ? `Trazabilidad 100% verificada (${inventory.mappedTests.length} archivo(s) mapeados).`
        : `Brechas detectadas: sin_etiqueta=${inventory.untaggedTests.length}, requisitos_sin_cubre=${inventory.uncoveredRequirements.length}, cobertura=${inventory.coveragePct}%.`,
  };
}

function assertSafeXmlPayload(rawXml: string): void {
  const upper = rawXml.toUpperCase();
  if (upper.includes('<!DOCTYPE') || upper.includes('<!ENTITY')) {
    throw new TmsSecurityError(
      CODE_XXE_DETECTED,
      'JUnit XML rechazado por seguridad anti-XXE: contiene <!DOCTYPE o <!ENTITY.'
    );
  }
}

function stripDelimitedSection(xml: string, openMarker: string, closeMarker: string): string {
  let cursor = 0;
  let output = '';
  while (cursor < xml.length) {
    const start = xml.indexOf(openMarker, cursor);
    if (start === -1) {
      return output + xml.slice(cursor);
    }
    output += xml.slice(cursor, start);
    const end = xml.indexOf(closeMarker, start + openMarker.length);
    if (end === -1) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, 'Contenido JUnit XML truncado o mal formado.');
    }
    cursor = end + closeMarker.length;
  }
  return output;
}

function decodeXmlText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return unwrapped
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseXmlAttributes(attrSlice: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < attrSlice.length) {
    const eqIdx = attrSlice.indexOf('=', pos);
    if (eqIdx === -1) {
      break;
    }
    const key = attrSlice.slice(pos, eqIdx).trim();
    const afterEq = attrSlice.slice(eqIdx + 1).trimStart();
    const quote = afterEq[0];
    if (quote !== '"' && quote !== "'") {
      break;
    }
    const valEnd = afterEq.indexOf(quote, 1);
    if (valEnd === -1) {
      break;
    }
    if (key.length > 0) {
      attrs[key] = decodeXmlText(afterEq.slice(1, valEnd));
    }
    pos = attrSlice.length - afterEq.length + valEnd + 1;
  }
  return attrs;
}

function parseXmlTagToken(rawInner: string, openPos: number, endPos: number): XmlTagToken | null {
  const trimmed = rawInner.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const isClosing = trimmed.startsWith('/');
  const isSelfClosing = !isClosing && trimmed.endsWith('/');
  const body = trimmed.slice(isClosing ? 1 : 0, isSelfClosing ? -1 : trimmed.length).trim();
  const spaceIdx = body.search(/\s/);
  const name = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const attrSlice = spaceIdx === -1 || isClosing ? '' : body.slice(spaceIdx + 1);
  return { name, isClosing, isSelfClosing, attrs: parseXmlAttributes(attrSlice), openPos, endPos };
}

function findClosingTagAngleBracket(xml: string, startPos: number): number {
  let quote: '"' | "'" | null = null;
  let firstQuotedAngle = -1;
  for (let i = startPos; i < xml.length; i += 1) {
    const ch = xml[i];
    if (quote === null) {
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') return i;
      continue;
    }
    if (ch === quote) quote = null;
    else if (ch === '>' && firstQuotedAngle === -1) firstQuotedAngle = i;
    else if (ch === '<') return firstQuotedAngle;
  }
  return quote !== null ? firstQuotedAngle : -1;
}

function tokenizeXmlTags(cleanedXml: string): XmlTagToken[] {
  const tokens: XmlTagToken[] = [];
  let cursor = 0;
  while (cursor < cleanedXml.length) {
    const openIdx = cleanedXml.indexOf('<', cursor);
    if (openIdx === -1) {
      break;
    }
    if (cleanedXml.startsWith('<![CDATA[', openIdx)) {
      const cdataEnd = cleanedXml.indexOf(']]>', openIdx + 9);
      if (cdataEnd === -1) {
        throw new TmsSecurityError(CODE_INVALID_INPUT, 'Sección CDATA XML sin cierre detectada.');
      }
      cursor = cdataEnd + 3;
      continue;
    }
    const closeIdx = findClosingTagAngleBracket(cleanedXml, openIdx + 1);
    if (closeIdx === -1) {
      throw new TmsSecurityError(CODE_INVALID_INPUT, 'Etiqueta XML sin cierre detectada.');
    }
    const token = parseXmlTagToken(cleanedXml.slice(openIdx + 1, closeIdx), openIdx, closeIdx);
    if (token) {
      tokens.push(token);
    }
    cursor = closeIdx + 1;
  }
  return tokens;
}

function parseDurationMs(rawTime: string | undefined): number {
  if (!rawTime) {
    return 0;
  }
  const secs = Number(rawTime.trim());
  if (!Number.isFinite(secs) || secs < 0) {
    return 0;
  }
  return Math.round(secs * 1000);
}

function extractCanonicalKeys(text: string): string[] {
  const found = text.match(ALL_TAG_RE);
  if (!found || found.length === 0) {
    return [];
  }
  return [...new Set(found.map((tag) => tag.slice(1).toUpperCase()))];
}

export function findTagByPrefix(tags: readonly string[], prefix: string): string | undefined {
  return tags.find((t) => t.startsWith(prefix));
}

export function findSummaryTagByPrefix(
  summary: ParsedJunitSummary | undefined,
  prefix: string
): string | undefined {
  if (!summary) {
    return undefined;
  }
  for (const tc of summary.cases) {
    const match = findTagByPrefix(tc.tags, prefix);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function formatTruncatedDetail(
  rawMessage: string | undefined,
  innerText: string,
  env: Readonly<Record<string, string | undefined>>
): string {
  const merged = [rawMessage?.trim() ?? '', innerText.trim()].filter((s) => s.length > 0).join(' | ');
  const safe = redactTmsSecrets(sanitizeUntrustedOutput(merged, { strictPii: true }), env)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return safe.length > MAX_DETAIL_LEN ? `${safe.slice(0, MAX_DETAIL_LEN)}...` : safe;
}

function applyTestCaseStart(state: JunitBuilderState, token: XmlTagToken): void {
  const name = token.attrs.name?.trim() || 'unnamed-test';
  const classname = token.attrs.classname?.trim() || '';
  const tags = extractCanonicalKeys(`${classname} ${name}`);
  const testCase: ParsedJunitCase = {
    name,
    classname,
    status: 'passed',
    durationMs: parseDurationMs(token.attrs.time),
    mappedKey: tags[0] ?? '',
    tags,
    detail: 'OK',
  };
  state.cases.push(testCase);
  state.currentCase = token.isSelfClosing ? null : testCase;
}

function applyOutcomeToken(
  state: JunitBuilderState,
  token: XmlTagToken,
  cleanedXml: string,
  env: Readonly<Record<string, string | undefined>>
): void {
  if (!state.currentCase) {
    return;
  }
  if (!token.isClosing && token.name === 'skipped') {
    state.currentCase.status = 'skipped';
    state.currentCase.detail = formatTruncatedDetail(token.attrs.message, '', env) || 'Skipped';
    return;
  }
  if (token.isClosing && (token.name === 'failure' || token.name === 'error')) {
    const inner = decodeXmlText(cleanedXml.slice(state.currentBodyStart, token.openPos));
    state.currentCase.detail =
      formatTruncatedDetail(state.currentFailureMessage, inner, env) || 'Failed';
    return;
  }
  if (!token.isClosing && (token.name === 'failure' || token.name === 'error')) {
    state.currentCase.status = 'failed';
    state.currentBodyStart = token.endPos + 1;
    state.currentFailureMessage = token.attrs.message?.trim() ?? '';
    state.currentCase.detail = formatTruncatedDetail(state.currentFailureMessage, '', env) || 'Failed';
  }
}

function handleJunitToken(
  state: JunitBuilderState,
  token: XmlTagToken,
  cleanedXml: string,
  env: Readonly<Record<string, string | undefined>>
): void {
  if (token.name === 'testsuite' || token.name === 'testsuites') {
    state.sawSuiteOrCase = true;
    return;
  }
  if (!token.isClosing && token.name === 'testcase') {
    state.sawSuiteOrCase = true;
    applyTestCaseStart(state, token);
    return;
  }
  if (token.isClosing && token.name === 'testcase') {
    state.currentCase = null;
    return;
  }
  applyOutcomeToken(state, token, cleanedXml, env);
}

function summarizeParsedCases(cases: readonly ParsedJunitCase[]): ParsedJunitSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  for (const tc of cases) {
    durationMs += tc.durationMs;
    if (tc.status === 'passed') {
      passed += 1;
    } else if (tc.status === 'failed') {
      failed += 1;
    } else {
      skipped += 1;
    }
  }
  return { total: cases.length, passed, failed, skipped, durationMs, cases: [...cases] };
}

export function parseJunitXmlReport(
  rawXml: string,
  env: Readonly<Record<string, string | undefined>>
): ParsedJunitSummary {
  assertSafeXmlPayload(rawXml);
  const noComments = stripDelimitedSection(rawXml, '<!--', '-->');
  const cleaned = stripDelimitedSection(noComments, '<?', '?>');
  const tokens = tokenizeXmlTags(cleaned);
  const state: JunitBuilderState = {
    currentCase: null,
    currentBodyStart: 0,
    currentFailureMessage: '',
    cases: [],
    sawSuiteOrCase: false,
  };
  for (const token of tokens) {
    handleJunitToken(state, token, cleaned, env);
  }
  if (!state.sawSuiteOrCase) {
    throw new TmsSecurityError(CODE_INVALID_INPUT, 'El archivo XML no contiene nodos <testsuite> ni <testcase>.');
  }
  return summarizeParsedCases(state.cases);
}

export function readJunitInputXml(args: TmsSyncArgs, workspaceRoot: string): string {
  if (args.junitXmlContent && args.junitXmlContent.trim().length > 0) {
    return args.junitXmlContent;
  }
  if (args.junitXmlPath && args.junitXmlPath.trim().length > 0) {
    const safeFile = resolveSafeWorkspacePath(workspaceRoot, args.junitXmlPath, 'file');
    return fs.readFileSync(safeFile, 'utf8');
  }
  throw new TmsSecurityError(
    CODE_INVALID_INPUT,
    'El modo push-results requiere --junit-xml (junitXmlPath) o junitXmlContent.'
  );
}
