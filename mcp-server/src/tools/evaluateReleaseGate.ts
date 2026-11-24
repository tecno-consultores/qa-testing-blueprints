// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export const SCOPE_FULL = 'full' as const;
export const SCOPE_SMOKE = 'smoke' as const;
export const DECISION_GO = 'GO' as const;
export const DECISION_NO_GO = 'NO_GO' as const;
export const DECISION_SKIPPED = 'SKIPPED' as const;

const SIGNAL_SECURITY = 'security' as const;
const SIGNAL_JUNIT = 'junit' as const;
const SIGNAL_TELEMETRY = 'telemetry' as const;
const SIGNAL_DEFECTS = 'defects' as const;

const CODE_XXE = 'XXE_DETECTED' as const;
const CODE_PATH_TRAVERSAL = 'PATH_TRAVERSAL' as const;
const CODE_FILE_NOT_FOUND = 'FILE_NOT_FOUND' as const;
const CODE_INVALID_XML = 'INVALID_XML' as const;
const CODE_INVALID_JSON = 'INVALID_JSON' as const;
const CODE_INVALID_INPUT = 'INVALID_INPUT' as const;
const CODE_ZERO_TESTS = 'ZERO_TESTS_EXECUTED' as const;
const CODE_JUNIT_FAILURES = 'JUNIT_FAILURES' as const;
const CODE_JUNIT_ERRORS = 'JUNIT_ERRORS' as const;
const CODE_PASS_RATE = 'PASS_RATE_BELOW_THRESHOLD' as const;
const CODE_ERROR_RATE = 'ERROR_RATE_EXCEEDED' as const;
const CODE_P95 = 'LATENCY_P95_EXCEEDED' as const;
const CODE_P99 = 'LATENCY_P99_EXCEEDED' as const;
const CODE_INCIDENTS = 'ACTIVE_INCIDENTS_EXCEEDED' as const;
const CODE_BLOCKERS = 'OPEN_BLOCKERS_EXCEEDED' as const;
const CODE_CRITICALS = 'OPEN_CRITICALS_EXCEEDED' as const;
const CODE_ESCAPES = 'QA_ESCAPES_EXCEEDED' as const;

const MAX_FAILED_TESTS_REPORTED = 20;
const MCP_SERVER_DIR_SUFFIX = `${path.sep}mcp-server`;

export type ReleaseGateScope = typeof SCOPE_FULL | typeof SCOPE_SMOKE;
export type ReleaseGateDecision =
  | typeof DECISION_GO
  | typeof DECISION_NO_GO
  | typeof DECISION_SKIPPED;
export type ReleaseGateSignal =
  | typeof SIGNAL_SECURITY
  | typeof SIGNAL_JUNIT
  | typeof SIGNAL_TELEMETRY
  | typeof SIGNAL_DEFECTS;

export type BlockingReasonCode =
  | typeof CODE_XXE
  | typeof CODE_PATH_TRAVERSAL
  | typeof CODE_FILE_NOT_FOUND
  | typeof CODE_INVALID_XML
  | typeof CODE_INVALID_JSON
  | typeof CODE_INVALID_INPUT
  | typeof CODE_ZERO_TESTS
  | typeof CODE_JUNIT_FAILURES
  | typeof CODE_JUNIT_ERRORS
  | typeof CODE_PASS_RATE
  | typeof CODE_ERROR_RATE
  | typeof CODE_P95
  | typeof CODE_P99
  | typeof CODE_INCIDENTS
  | typeof CODE_BLOCKERS
  | typeof CODE_CRITICALS
  | typeof CODE_ESCAPES;

export interface ReleaseGateThresholds {
  minPassRatePct: number;
  maxErrorRatePct: number;
  maxP95Ms: number;
  maxP99Ms: number;
  maxActiveIncidents: number;
  maxOpenBlockers: number;
  maxOpenCriticals: number;
  maxQaEscapes: number;
}

export const DEFAULT_RELEASE_GATE_THRESHOLDS: Readonly<ReleaseGateThresholds> = {
  minPassRatePct: 100,
  maxErrorRatePct: 1.0,
  maxP95Ms: 500,
  maxP99Ms: 1000,
  maxActiveIncidents: 0,
  maxOpenBlockers: 0,
  maxOpenCriticals: 0,
  maxQaEscapes: 0,
};

export interface BlockingReason {
  code: BlockingReasonCode;
  signal: ReleaseGateSignal;
  metric: string;
  actual: number | string;
  threshold: number | string;
  message: string;
}

export interface JunitSignalSummary {
  provided: boolean;
  totalTests: number;
  executedTests: number;
  failures: number;
  errors: number;
  skipped: number;
  passRatePct: number;
  failedTests: string[];
}

export interface NormalizedTelemetry {
  provided: boolean;
  errorRatePct: number;
  p95Ms: number;
  p99Ms: number;
  activeIncidents: number;
}

export interface NormalizedDefects {
  provided: boolean;
  openBlockers: number;
  openCriticals: number;
  qaEscapes: number;
}

export interface EvaluateReleaseGateArgs {
  workspaceRoot?: string;
  scope?: ReleaseGateScope;
  dryRun?: boolean;
  enforce?: boolean;
  timestamp?: string;
  junitXmlPath?: string;
  junitXmlContent?: string;
  telemetryJsonPath?: string;
  telemetry?: Record<string, unknown>;
  defectsJsonPath?: string;
  defects?: Record<string, unknown>;
  thresholds?: Partial<ReleaseGateThresholds>;
  minPassRatePct?: number;
  maxErrorRatePct?: number;
  maxP95Ms?: number;
  maxP99Ms?: number;
  maxActiveIncidents?: number;
  maxOpenBlockers?: number;
  maxOpenCriticals?: number;
  maxQaEscapes?: number;
}

export interface ReleaseGateEvaluationResult {
  decision: ReleaseGateDecision;
  scope: ReleaseGateScope;
  dryRun: boolean;
  gateSkipped: boolean;
  hasSecurityOrParseError: boolean;
  evaluatedAtUtc: string;
  junit: JunitSignalSummary;
  telemetry: NormalizedTelemetry;
  defects: NormalizedDefects;
  thresholds: ReleaseGateThresholds;
  blockingReasons: BlockingReason[];
  summary: string;
}

export const EVALUATE_RELEASE_GATE_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: 'evaluate_release_gate',
  description:
    'Evaluates the multi-signal GO/NO_GO release readiness gate combining JUnit XML results (with anti-XXE defense), observability telemetry, and QA defects.',
};

type JsonRecord = Record<string, unknown>;

interface XmlTagToken {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attrs: Record<string, string>;
}

interface JunitAccumulator {
  hasSuiteElement: boolean;
  suiteDepth: number;
  suiteTests: number;
  suiteFailures: number;
  suiteErrors: number;
  suiteSkipped: number;
  rootTests: number;
  rootFailures: number;
  rootErrors: number;
  rootSkipped: number;
  inTestCase: boolean;
  currentCaseLabel: string;
  currentCaseFailed: boolean;
  currentCaseErrored: boolean;
  currentCaseSkipped: boolean;
  observedCases: number;
  observedFailures: number;
  observedErrors: number;
  observedSkipped: number;
  failedTests: string[];
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveDefaultWorkspaceRoot(): string {
  const cwd = path.resolve(process.cwd());
  if (fs.existsSync(path.join(cwd, 'package.json')) && cwd.endsWith(MCP_SERVER_DIR_SUFFIX)) {
    return path.dirname(cwd);
  }
  return cwd;
}

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

interface SecurityReasonSpec {
  readonly code: BlockingReasonCode;
  readonly metric: string;
  readonly actual: string;
  readonly message: string;
}

function pushSecurityReason(reasons: BlockingReason[], spec: SecurityReasonSpec): void {
  reasons.push({
    code: spec.code,
    signal: SIGNAL_SECURITY,
    metric: spec.metric,
    actual: spec.actual,
    threshold: 'contained-valid',
    message: spec.message,
  });
}

function resolveSafeWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  reasons: BlockingReason[]
): string | null {
  if (candidatePath.includes('\0') || workspaceRoot.includes('\0')) {
    pushSecurityReason(reasons, {
      code: CODE_PATH_TRAVERSAL,
      metric: 'path',
      actual: candidatePath,
      message: 'Ruta rechazada por contener bytes nulos.',
    });
    return null;
  }

  if (candidatePath.trim().length === 0) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_INPUT,
      metric: 'path',
      actual: candidatePath,
      message: 'La ruta no puede estar vacía.',
    });
    return null;
  }

  return checkContainedExistingFile(workspaceRoot, candidatePath, reasons);
}

function checkContainedExistingFile(
  workspaceRoot: string,
  candidatePath: string,
  reasons: BlockingReason[]
): string | null {
  const rootResolved = path.resolve(workspaceRoot);
  const candidateResolved = path.resolve(rootResolved, candidatePath);
  if (!isContainedPath(rootResolved, candidateResolved)) {
    pushSecurityReason(reasons, {
      code: CODE_PATH_TRAVERSAL,
      metric: 'path',
      actual: candidatePath,
      message: `La ruta '${candidatePath}' escapa los límites del workspace.`,
    });
    return null;
  }

  if (!fs.existsSync(rootResolved) || !fs.existsSync(candidateResolved) || !fs.statSync(candidateResolved).isFile()) {
    pushSecurityReason(reasons, {
      code: CODE_FILE_NOT_FOUND,
      metric: 'path',
      actual: candidatePath,
      message: `Archivo requerido no encontrado: '${candidatePath}'.`,
    });
    return null;
  }

  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(candidateResolved);
  if (!isContainedPath(rootReal, targetReal)) {
    pushSecurityReason(reasons, {
      code: CODE_PATH_TRAVERSAL,
      metric: 'path',
      actual: candidatePath,
      message: `Enlace simbólico fuera del workspace detectado en '${candidatePath}'.`,
    });
    return null;
  }

  return targetReal;
}

function normalizeUtcTimestamp(
  rawTimestamp: string | undefined,
  reasons: BlockingReason[]
): string {
  if (rawTimestamp === undefined) {
    return new Date().toISOString();
  }
  if (typeof rawTimestamp !== 'string' || rawTimestamp.trim().length === 0) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_INPUT,
      metric: 'timestamp',
      actual: String(rawTimestamp),
      message: 'Timestamp ISO-8601 inválido o vacío.',
    });
    return new Date().toISOString();
  }
  const parsed = new Date(rawTimestamp.trim());
  if (Number.isNaN(parsed.getTime())) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_INPUT,
      metric: 'timestamp',
      actual: rawTimestamp,
      message: `No se pudo normalizar el timestamp '${rawTimestamp}' a UTC.`,
    });
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function formatActualPreview(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value) ?? '[unserializable]';
}

function resolveScope(rawScope: unknown, reasons: BlockingReason[]): ReleaseGateScope {
  if (rawScope === undefined) {
    return SCOPE_FULL;
  }
  if (rawScope === SCOPE_FULL || rawScope === SCOPE_SMOKE) {
    return rawScope;
  }
  const scopePreview = formatActualPreview(rawScope);
  pushSecurityReason(reasons, {
    code: CODE_INVALID_INPUT,
    metric: 'scope',
    actual: scopePreview,
    message: `Alcance inválido '${scopePreview}'; valores permitidos: full, smoke.`,
  });
  return SCOPE_FULL;
}

function resolveDryRun(args: EvaluateReleaseGateArgs): boolean {
  if (args.enforce === true) {
    return false;
  }
  return args.dryRun ?? true;
}

function readSafeTextFile(
  workspaceRoot: string,
  relPath: string,
  reasons: BlockingReason[]
): string | null {
  const safePath = resolveSafeWorkspaceFile(workspaceRoot, relPath, reasons);
  if (!safePath) {
    return null;
  }
  try {
    return fs.readFileSync(safePath, 'utf8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    pushSecurityReason(reasons, {
      code: CODE_FILE_NOT_FOUND,
      metric: 'path',
      actual: relPath,
      message: `Error leyendo '${relPath}': ${detail}`,
    });
    return null;
  }
}

function stripDelimitedSection(xml: string, openMarker: string, closeMarker: string): string | null {
  let cursor = 0;
  let output = '';
  while (cursor < xml.length) {
    const start = xml.indexOf(openMarker, cursor);
    if (start === -1) {
      output += xml.slice(cursor);
      return output;
    }
    output += xml.slice(cursor, start);
    const end = xml.indexOf(closeMarker, start + openMarker.length);
    if (end === -1) {
      return null;
    }
    cursor = end + closeMarker.length;
  }
  return output;
}

function stripXmlNoise(rawXml: string): string | null {
  const withoutCdata = stripDelimitedSection(rawXml, '<![CDATA[', ']]>');
  if (withoutCdata === null) {
    return null;
  }
  const withoutComments = stripDelimitedSection(withoutCdata, '<!--', '-->');
  if (withoutComments === null) {
    return null;
  }
  return stripDelimitedSection(withoutComments, '<?', '?>');
}

function findTagClose(xml: string, openIdx: number): number {
  let quote: string | null = null;
  for (let i = openIdx + 1; i < xml.length; i += 1) {
    const ch = xml[i];
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    } else if (ch === '<') {
      return -1;
    }
  }
  return -1;
}

function isWhitespaceChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function skipWhitespace(text: string, idx: number): number {
  let pos = idx;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === undefined || !isWhitespaceChar(ch)) {
      break;
    }
    pos += 1;
  }
  return pos;
}

function consumeUnquotedAttrValue(attrSlice: string, valStart: number): number {
  let end = valStart;
  while (end < attrSlice.length && !isWhitespaceChar(attrSlice.charAt(end))) {
    end += 1;
  }
  return end;
}

function readNextAttrPair(
  attrSlice: string,
  startPos: number
): { key: string; value: string; nextPos: number } | null {
  const pos = skipWhitespace(attrSlice, startPos);
  const eqIdx = attrSlice.indexOf('=', pos);
  if (eqIdx === -1) {
    return null;
  }
  const key = attrSlice.slice(pos, eqIdx).trim();
  const valStart = skipWhitespace(attrSlice, eqIdx + 1);
  const quote = attrSlice[valStart];
  if (quote !== '"' && quote !== "'") {
    const unquotedEnd = consumeUnquotedAttrValue(attrSlice, valStart);
    return {
      key: unquotedEnd > valStart ? key : '',
      value: attrSlice.slice(valStart, unquotedEnd),
      nextPos: Math.max(unquotedEnd, eqIdx + 1),
    };
  }
  const valEnd = attrSlice.indexOf(quote, valStart + 1);
  if (valEnd === -1) {
    return null;
  }
  return { key, value: attrSlice.slice(valStart + 1, valEnd), nextPos: valEnd + 1 };
}

function parseAttributes(attrSlice: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < attrSlice.length) {
    const pair = readNextAttrPair(attrSlice, pos);
    if (!pair) {
      break;
    }
    if (pair.key.length > 0) {
      attrs[pair.key] = pair.value;
    }
    pos = pair.nextPos;
  }
  return attrs;
}

function parseTagToken(rawInner: string): XmlTagToken | null {
  const trimmed = rawInner.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const isClosing = trimmed.startsWith('/');
  const isSelfClosing = !isClosing && trimmed.endsWith('/');
  const body = trimmed.slice(isClosing ? 1 : 0, isSelfClosing ? -1 : trimmed.length).trim();
  if (body.length === 0) {
    return null;
  }
  let nameEnd = 0;
  while (nameEnd < body.length) {
    const ch = body[nameEnd];
    if (ch === undefined || isWhitespaceChar(ch)) {
      break;
    }
    nameEnd += 1;
  }
  const name = body.slice(0, nameEnd);
  const attrs = isClosing ? {} : parseAttributes(body.slice(nameEnd));
  return { name, isClosing, isSelfClosing, attrs };
}

function tokenizeXmlTags(cleanedXml: string): XmlTagToken[] | null {
  const tokens: XmlTagToken[] = [];
  const openStack: string[] = [];
  let cursor = 0;

  while (cursor < cleanedXml.length) {
    const openIdx = cleanedXml.indexOf('<', cursor);
    if (openIdx === -1) {
      break;
    }
    const closeIdx = findTagClose(cleanedXml, openIdx);
    if (closeIdx === -1) {
      return null;
    }
    const token = parseTagToken(cleanedXml.slice(openIdx + 1, closeIdx));
    if (!token || !updateXmlStack(openStack, token)) {
      return null;
    }
    tokens.push(token);
    cursor = closeIdx + 1;
  }

  return openStack.length === 0 ? tokens : null;
}

function updateXmlStack(stack: string[], token: XmlTagToken): boolean {
  if (token.isSelfClosing) {
    return true;
  }
  if (!token.isClosing) {
    stack.push(token.name);
    return true;
  }
  const expected = stack.pop();
  return expected === token.name;
}

function parseNonNegIntAttr(attrs: Record<string, string>, key: string): number {
  const raw = attrs[key];
  if (raw === undefined) {
    return 0;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function formatTestCaseLabel(attrs: Record<string, string>): string {
  const name = (attrs.name ?? 'unnamed-test').trim();
  const classname = (attrs.classname ?? '').trim();
  return classname.length > 0 ? `${classname}::${name}` : name;
}

function createJunitAccumulator(): JunitAccumulator {
  return {
    hasSuiteElement: false,
    suiteDepth: 0,
    suiteTests: 0,
    suiteFailures: 0,
    suiteErrors: 0,
    suiteSkipped: 0,
    rootTests: 0,
    rootFailures: 0,
    rootErrors: 0,
    rootSkipped: 0,
    inTestCase: false,
    currentCaseLabel: '',
    currentCaseFailed: false,
    currentCaseErrored: false,
    currentCaseSkipped: false,
    observedCases: 0,
    observedFailures: 0,
    observedErrors: 0,
    observedSkipped: 0,
    failedTests: [],
  };
}

function recordFailedTestName(acc: JunitAccumulator, label: string): void {
  if (acc.failedTests.length >= MAX_FAILED_TESTS_REPORTED) {
    return;
  }
  if (!acc.failedTests.includes(label)) {
    acc.failedTests.push(label);
  }
}

function applySuiteToken(acc: JunitAccumulator, token: XmlTagToken): void {
  acc.hasSuiteElement = true;
  if (token.name === 'testsuite') {
    if (acc.suiteDepth === 0) {
      acc.suiteTests += parseNonNegIntAttr(token.attrs, 'tests');
      acc.suiteFailures += parseNonNegIntAttr(token.attrs, 'failures');
      acc.suiteErrors += parseNonNegIntAttr(token.attrs, 'errors');
      acc.suiteSkipped += parseNonNegIntAttr(token.attrs, 'skipped');
    }
    if (!token.isSelfClosing) {
      acc.suiteDepth += 1;
    }
    return;
  }
  acc.rootTests = Math.max(acc.rootTests, parseNonNegIntAttr(token.attrs, 'tests'));
  acc.rootFailures = Math.max(acc.rootFailures, parseNonNegIntAttr(token.attrs, 'failures'));
  acc.rootErrors = Math.max(acc.rootErrors, parseNonNegIntAttr(token.attrs, 'errors'));
  acc.rootSkipped = Math.max(acc.rootSkipped, parseNonNegIntAttr(token.attrs, 'skipped'));
}

function applyTestCaseOutcome(acc: JunitAccumulator, tagName: string): void {
  if (tagName === 'failure') {
    if (!acc.inTestCase || !acc.currentCaseFailed) {
      acc.observedFailures += 1;
      acc.currentCaseFailed = true;
    }
    if (acc.inTestCase) {
      recordFailedTestName(acc, acc.currentCaseLabel);
    }
    return;
  }
  if (tagName === 'error') {
    if (!acc.inTestCase || !acc.currentCaseErrored) {
      acc.observedErrors += 1;
      acc.currentCaseErrored = true;
    }
    if (acc.inTestCase) {
      recordFailedTestName(acc, acc.currentCaseLabel);
    }
    return;
  }
  if (tagName === 'skipped' && (!acc.inTestCase || !acc.currentCaseSkipped)) {
    acc.observedSkipped += 1;
    acc.currentCaseSkipped = true;
  }
}

function processJunitToken(acc: JunitAccumulator, token: XmlTagToken): void {
  if (token.isClosing) {
    if (token.name === 'testcase') {
      acc.inTestCase = false;
    } else if (token.name === 'testsuite') {
      acc.suiteDepth = Math.max(0, acc.suiteDepth - 1);
    }
    return;
  }
  if (token.name === 'testsuite' || token.name === 'testsuites') {
    applySuiteToken(acc, token);
    return;
  }
  if (token.name === 'testcase') {
    acc.observedCases += 1;
    acc.inTestCase = !token.isSelfClosing;
    acc.currentCaseLabel = formatTestCaseLabel(token.attrs);
    acc.currentCaseFailed = false;
    acc.currentCaseErrored = false;
    acc.currentCaseSkipped = false;
    return;
  }
  applyTestCaseOutcome(acc, token.name);
}

function finalizeJunitAccumulator(acc: JunitAccumulator): JunitSignalSummary {
  const totalTests = Math.max(acc.suiteTests, acc.rootTests, acc.observedCases);
  const failures = Math.max(acc.suiteFailures, acc.rootFailures, acc.observedFailures);
  const errors = Math.max(acc.suiteErrors, acc.rootErrors, acc.observedErrors);
  const skipped = Math.max(acc.suiteSkipped, acc.rootSkipped, acc.observedSkipped);
  const executedTests = Math.max(0, totalTests - skipped);
  const passed = Math.max(0, executedTests - failures - errors);
  const passRatePct = executedTests > 0 ? Number(((passed / executedTests) * 100).toFixed(2)) : 0;

  return {
    provided: true,
    totalTests,
    executedTests,
    failures,
    errors,
    skipped,
    passRatePct,
    failedTests: acc.failedTests,
  };
}

function hasXxeDeclaration(rawXml: string): boolean {
  const withoutCdata = stripDelimitedSection(rawXml, '<![CDATA[', ']]>');
  const inspectable = withoutCdata ?? rawXml;
  const upper = inspectable.toUpperCase();
  return upper.includes('<!DOCTYPE') || upper.includes('<!ENTITY');
}

function emptyJunitSummary(): JunitSignalSummary {
  return {
    provided: false,
    totalTests: 0,
    executedTests: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    passRatePct: 0,
    failedTests: [],
  };
}

function parseJunitXml(rawXml: string, reasons: BlockingReason[]): JunitSignalSummary {
  if (hasXxeDeclaration(rawXml)) {
    pushSecurityReason(reasons, {
      code: CODE_XXE,
      metric: 'junit.xml',
      actual: '<!DOCTYPE/<!ENTITY',
      message: 'Payload XML rechazado por seguridad anti-XXE (APSC-DV-002390/002550): contiene <!DOCTYPE o <!ENTITY.',
    });
    return emptyJunitSummary();
  }

  const cleaned = stripXmlNoise(rawXml);
  const tokens = cleaned === null ? null : tokenizeXmlTags(cleaned);
  if (!tokens) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_XML,
      metric: 'junit.xml',
      actual: 'malformed',
      message: 'El contenido JUnit XML está mal formado.',
    });
    return emptyJunitSummary();
  }

  const acc = createJunitAccumulator();
  for (const token of tokens) {
    processJunitToken(acc, token);
  }
  if (!acc.hasSuiteElement) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_XML,
      metric: 'junit.xml',
      actual: 'missing-testsuite',
      message: 'El XML no contiene un nodo raíz <testsuite> o <testsuites>.',
    });
    return emptyJunitSummary();
  }

  return finalizeJunitAccumulator(acc);
}

function loadJunitSignal(
  args: EvaluateReleaseGateArgs,
  workspaceRoot: string,
  reasons: BlockingReason[]
): JunitSignalSummary {
  if (args.junitXmlContent !== undefined) {
    return parseJunitXml(args.junitXmlContent, reasons);
  }
  if (args.junitXmlPath !== undefined) {
    const raw = readSafeTextFile(workspaceRoot, args.junitXmlPath, reasons);
    return raw === null ? emptyJunitSummary() : parseJunitXml(raw, reasons);
  }
  return emptyJunitSummary();
}

function parseJsonObjectInput(
  rawText: string,
  label: string,
  reasons: BlockingReason[]
): JsonRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    pushSecurityReason(reasons, {
      code: CODE_INVALID_JSON,
      metric: label,
      actual: 'invalid-json',
      message: `JSON inválido en '${label}': ${detail}`,
    });
    return null;
  }
  if (!isPlainRecord(parsed)) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_JSON,
      metric: label,
      actual: typeof parsed,
      message: `La raíz de '${label}' debe ser un objeto JSON.`,
    });
    return null;
  }
  return parsed;
}

interface JsonSignalLoadInput {
  readonly inlineObj: Record<string, unknown> | undefined;
  readonly relPath: string | undefined;
  readonly label: string;
  readonly workspaceRoot: string;
  readonly reasons: BlockingReason[];
}

function loadJsonObjectSignal(input: JsonSignalLoadInput): JsonRecord | null {
  const { inlineObj, relPath, label, workspaceRoot, reasons } = input;
  if (inlineObj !== undefined) {
    if (!isPlainRecord(inlineObj)) {
      pushSecurityReason(reasons, {
        code: CODE_INVALID_INPUT,
        metric: label,
        actual: typeof inlineObj,
        message: `'${label}' debe ser un objeto JSON.`,
      });
      return null;
    }
    return inlineObj;
  }
  if (relPath !== undefined) {
    const raw = readSafeTextFile(workspaceRoot, relPath, reasons);
    return raw === null ? null : parseJsonObjectInput(raw, relPath, reasons);
  }
  return null;
}

function extractNumericMetric(
  record: JsonRecord,
  keys: readonly string[],
  metricName: string,
  reasons: BlockingReason[]
): number {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      pushSecurityReason(reasons, {
        code: CODE_INVALID_INPUT,
        metric: metricName,
        actual: formatActualPreview(value),
        message: `Métrica '${metricName}' inválida: debe ser un número finito >= 0.`,
      });
      return 0;
    }
    return value;
  }
  return 0;
}

function normalizeTelemetry(
  rawObj: JsonRecord | null,
  reasons: BlockingReason[]
): NormalizedTelemetry {
  if (!rawObj) {
    return { provided: false, errorRatePct: 0, p95Ms: 0, p99Ms: 0, activeIncidents: 0 };
  }
  const source = isPlainRecord(rawObj.metrics) ? { ...rawObj.metrics, ...rawObj } : rawObj;
  return {
    provided: true,
    errorRatePct: extractNumericMetric(
      source,
      ['errorRatePct', 'error_rate_pct', 'http_error_rate_pct', 'errorRate'],
      'telemetry.errorRatePct',
      reasons
    ),
    p95Ms: extractNumericMetric(
      source,
      ['p95Ms', 'p95_ms', 'latencyP95Ms', 'latency_p95_ms', 'http_p95_ms'],
      'telemetry.p95Ms',
      reasons
    ),
    p99Ms: extractNumericMetric(
      source,
      ['p99Ms', 'p99_ms', 'latencyP99Ms', 'latency_p99_ms', 'http_p99_ms'],
      'telemetry.p99Ms',
      reasons
    ),
    activeIncidents: extractNumericMetric(
      source,
      ['activeIncidents', 'active_incidents', 'incidents_open'],
      'telemetry.activeIncidents',
      reasons
    ),
  };
}

function normalizeDefects(
  rawObj: JsonRecord | null,
  reasons: BlockingReason[]
): NormalizedDefects {
  if (!rawObj) {
    return { provided: false, openBlockers: 0, openCriticals: 0, qaEscapes: 0 };
  }
  return {
    provided: true,
    openBlockers: extractNumericMetric(
      rawObj,
      ['openBlockers', 'open_blockers', 'blockers'],
      'defects.openBlockers',
      reasons
    ),
    openCriticals: extractNumericMetric(
      rawObj,
      ['openCriticals', 'open_criticals', 'criticals'],
      'defects.openCriticals',
      reasons
    ),
    qaEscapes: extractNumericMetric(
      rawObj,
      ['qaEscapes', 'qa_escapes', 'escapedDefects', 'escaped_defects'],
      'defects.qaEscapes',
      reasons
    ),
  };
}

interface ThresholdNumberSpec {
  readonly overrideVal: number | undefined;
  readonly nestedVal: number | undefined;
  readonly fallback: number;
  readonly name: string;
  readonly reasons: BlockingReason[];
}

function resolveThresholdNumber(spec: ThresholdNumberSpec): number {
  const { overrideVal, nestedVal, fallback, name, reasons } = spec;
  const candidate = overrideVal ?? nestedVal ?? fallback;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
    pushSecurityReason(reasons, {
      code: CODE_INVALID_INPUT,
      metric: name,
      actual: String(candidate),
      message: `Umbral '${name}' inválido: debe ser un número finito >= 0.`,
    });
    return fallback;
  }
  return candidate;
}

function resolveThresholds(
  args: EvaluateReleaseGateArgs,
  reasons: BlockingReason[]
): ReleaseGateThresholds {
  const t = args.thresholds ?? {};
  const d = DEFAULT_RELEASE_GATE_THRESHOLDS;
  return {
    minPassRatePct: resolveThresholdNumber({ overrideVal: args.minPassRatePct, nestedVal: t.minPassRatePct, fallback: d.minPassRatePct, name: 'minPassRatePct', reasons }),
    maxErrorRatePct: resolveThresholdNumber({ overrideVal: args.maxErrorRatePct, nestedVal: t.maxErrorRatePct, fallback: d.maxErrorRatePct, name: 'maxErrorRatePct', reasons }),
    maxP95Ms: resolveThresholdNumber({ overrideVal: args.maxP95Ms, nestedVal: t.maxP95Ms, fallback: d.maxP95Ms, name: 'maxP95Ms', reasons }),
    maxP99Ms: resolveThresholdNumber({ overrideVal: args.maxP99Ms, nestedVal: t.maxP99Ms, fallback: d.maxP99Ms, name: 'maxP99Ms', reasons }),
    maxActiveIncidents: resolveThresholdNumber({ overrideVal: args.maxActiveIncidents, nestedVal: t.maxActiveIncidents, fallback: d.maxActiveIncidents, name: 'maxActiveIncidents', reasons }),
    maxOpenBlockers: resolveThresholdNumber({ overrideVal: args.maxOpenBlockers, nestedVal: t.maxOpenBlockers, fallback: d.maxOpenBlockers, name: 'maxOpenBlockers', reasons }),
    maxOpenCriticals: resolveThresholdNumber({ overrideVal: args.maxOpenCriticals, nestedVal: t.maxOpenCriticals, fallback: d.maxOpenCriticals, name: 'maxOpenCriticals', reasons }),
    maxQaEscapes: resolveThresholdNumber({ overrideVal: args.maxQaEscapes, nestedVal: t.maxQaEscapes, fallback: d.maxQaEscapes, name: 'maxQaEscapes', reasons }),
  };
}

function evaluateJunitSignal(
  junit: JunitSignalSummary,
  thresholds: ReleaseGateThresholds,
  reasons: BlockingReason[]
): void {
  if (!junit.provided || junit.totalTests === 0 || junit.executedTests === 0) {
    reasons.push({
      code: CODE_ZERO_TESTS,
      signal: SIGNAL_JUNIT,
      metric: 'junit.executedTests',
      actual: junit.executedTests,
      threshold: '>= 1',
      message: 'No se ejecutaron pruebas funcionales en alcance full (ZERO_TESTS_EXECUTED).',
    });
    return;
  }

  if (junit.failures > 0) {
    reasons.push({
      code: CODE_JUNIT_FAILURES,
      signal: SIGNAL_JUNIT,
      metric: 'junit.failures',
      actual: junit.failures,
      threshold: 0,
      message: `Se detectaron ${junit.failures} prueba(s) JUnit fallida(s).`,
    });
  }
  if (junit.errors > 0) {
    reasons.push({
      code: CODE_JUNIT_ERRORS,
      signal: SIGNAL_JUNIT,
      metric: 'junit.errors',
      actual: junit.errors,
      threshold: 0,
      message: `Se detectaron ${junit.errors} error(es) de ejecución JUnit.`,
    });
  }
  if (junit.passRatePct < thresholds.minPassRatePct) {
    reasons.push({
      code: CODE_PASS_RATE,
      signal: SIGNAL_JUNIT,
      metric: 'junit.passRatePct',
      actual: junit.passRatePct,
      threshold: thresholds.minPassRatePct,
      message: `Tasa de éxito JUnit (${junit.passRatePct}%) inferior al mínimo (${thresholds.minPassRatePct}%).`,
    });
  }
}

interface CheckMaxMetricSpec {
  readonly reasons: BlockingReason[];
  readonly signal: ReleaseGateSignal;
  readonly code: BlockingReasonCode;
  readonly metric: string;
  readonly actual: number;
  readonly threshold: number;
  readonly unit: string;
}

function checkMaxMetric(spec: CheckMaxMetricSpec): void {
  const { reasons, signal, code, metric, actual, threshold, unit } = spec;
  if (actual > threshold) {
    reasons.push({
      code,
      signal,
      metric,
      actual,
      threshold,
      message: `${metric}=${actual}${unit} excede el máximo permitido (${threshold}${unit}).`,
    });
  }
}

function evaluateTelemetrySignal(
  telemetry: NormalizedTelemetry,
  thresholds: ReleaseGateThresholds,
  reasons: BlockingReason[]
): void {
  checkMaxMetric({ reasons, signal: SIGNAL_TELEMETRY, code: CODE_ERROR_RATE, metric: 'telemetry.errorRatePct', actual: telemetry.errorRatePct, threshold: thresholds.maxErrorRatePct, unit: '%' });
  checkMaxMetric({ reasons, signal: SIGNAL_TELEMETRY, code: CODE_P95, metric: 'telemetry.p95Ms', actual: telemetry.p95Ms, threshold: thresholds.maxP95Ms, unit: 'ms' });
  checkMaxMetric({ reasons, signal: SIGNAL_TELEMETRY, code: CODE_P99, metric: 'telemetry.p99Ms', actual: telemetry.p99Ms, threshold: thresholds.maxP99Ms, unit: 'ms' });
  checkMaxMetric({ reasons, signal: SIGNAL_TELEMETRY, code: CODE_INCIDENTS, metric: 'telemetry.activeIncidents', actual: telemetry.activeIncidents, threshold: thresholds.maxActiveIncidents, unit: '' });
}

function evaluateDefectsSignal(
  defects: NormalizedDefects,
  thresholds: ReleaseGateThresholds,
  reasons: BlockingReason[]
): void {
  checkMaxMetric({ reasons, signal: SIGNAL_DEFECTS, code: CODE_BLOCKERS, metric: 'defects.openBlockers', actual: defects.openBlockers, threshold: thresholds.maxOpenBlockers, unit: '' });
  checkMaxMetric({ reasons, signal: SIGNAL_DEFECTS, code: CODE_CRITICALS, metric: 'defects.openCriticals', actual: defects.openCriticals, threshold: thresholds.maxOpenCriticals, unit: '' });
  checkMaxMetric({ reasons, signal: SIGNAL_DEFECTS, code: CODE_ESCAPES, metric: 'defects.qaEscapes', actual: defects.qaEscapes, threshold: thresholds.maxQaEscapes, unit: '' });
}

interface VerboseFailureSummaryInput {
  readonly decision: ReleaseGateDecision;
  readonly scope: ReleaseGateScope;
  readonly dryRun: boolean;
  readonly evaluatedAtUtc: string;
  readonly junit: JunitSignalSummary;
  readonly reasons: BlockingReason[];
}

function formatVerboseFailure(input: VerboseFailureSummaryInput): string {
  const { decision, scope, dryRun, evaluatedAtUtc, junit, reasons } = input;
  const mode = dryRun ? 'DRY-RUN' : 'ENFORCE';
  const header = `❌ [RELEASE-GATE] ${decision} (scope=${scope}, mode=${mode}, utc=${evaluatedAtUtc}, hallazgos=${reasons.length})`;
  const details = reasons.map(
    (r, idx) => `  ${idx + 1}. [${r.code}] ${r.metric}=${r.actual} (umbral: ${r.threshold}) — ${r.message}`
  );
  if (junit.failedTests.length > 0) {
    details.push(`  🧪 Tests fallidos: ${junit.failedTests.join(', ')}`);
  }
  return [header, ...details].join('\n');
}

export function evaluateReleaseReadiness(
  args: EvaluateReleaseGateArgs = {}
): ReleaseGateEvaluationResult {
  const workspaceRoot = args.workspaceRoot ?? resolveDefaultWorkspaceRoot();
  const securityOrParseReasons: BlockingReason[] = [];

  const scope = resolveScope(args.scope, securityOrParseReasons);
  const dryRun = resolveDryRun(args);
  const evaluatedAtUtc = normalizeUtcTimestamp(args.timestamp, securityOrParseReasons);
  const thresholds = resolveThresholds(args, securityOrParseReasons);

  const junit = loadJunitSignal(args, workspaceRoot, securityOrParseReasons);
  const telemetryRaw = loadJsonObjectSignal({
    inlineObj: args.telemetry,
    relPath: args.telemetryJsonPath,
    label: 'telemetry',
    workspaceRoot,
    reasons: securityOrParseReasons,
  });
  const defectsRaw = loadJsonObjectSignal({
    inlineObj: args.defects,
    relPath: args.defectsJsonPath,
    label: 'defects',
    workspaceRoot,
    reasons: securityOrParseReasons,
  });
  const telemetry = normalizeTelemetry(telemetryRaw, securityOrParseReasons);
  const defects = normalizeDefects(defectsRaw, securityOrParseReasons);

  const hasSecurityOrParseError = securityOrParseReasons.length > 0;
  if (hasSecurityOrParseError) {
    return {
      decision: DECISION_NO_GO,
      scope,
      dryRun,
      gateSkipped: false,
      hasSecurityOrParseError: true,
      evaluatedAtUtc,
      junit,
      telemetry,
      defects,
      thresholds,
      blockingReasons: securityOrParseReasons,
      summary: formatVerboseFailure({
        decision: DECISION_NO_GO,
        scope,
        dryRun,
        evaluatedAtUtc,
        junit,
        reasons: securityOrParseReasons,
      }),
    };
  }

  if (scope === SCOPE_SMOKE) {
    return {
      decision: DECISION_SKIPPED,
      scope,
      dryRun,
      gateSkipped: true,
      hasSecurityOrParseError: false,
      evaluatedAtUtc,
      junit,
      telemetry,
      defects,
      thresholds,
      blockingReasons: [],
      summary: `⏭️ [RELEASE-GATE] SKIPPED (scope=smoke, dryRun=${dryRun}, utc=${evaluatedAtUtc}) — compuerta omitida por alcance smoke.`,
    };
  }

  const gateReasons: BlockingReason[] = [];
  evaluateJunitSignal(junit, thresholds, gateReasons);
  evaluateTelemetrySignal(telemetry, thresholds, gateReasons);
  evaluateDefectsSignal(defects, thresholds, gateReasons);

  if (gateReasons.length === 0) {
    return {
      decision: DECISION_GO,
      scope,
      dryRun,
      gateSkipped: false,
      hasSecurityOrParseError: false,
      evaluatedAtUtc,
      junit,
      telemetry,
      defects,
      thresholds,
      blockingReasons: [],
      summary: `✅ [RELEASE-GATE] GO (scope=full, dryRun=${dryRun}, tests=${junit.executedTests}/${junit.totalTests} ${junit.passRatePct}%, p95=${telemetry.p95Ms}ms, err=${telemetry.errorRatePct}%, utc=${evaluatedAtUtc})`,
    };
  }

  return {
    decision: DECISION_NO_GO,
    scope,
    dryRun,
    gateSkipped: false,
    hasSecurityOrParseError: false,
    evaluatedAtUtc,
    junit,
    telemetry,
    defects,
    thresholds,
    blockingReasons: gateReasons,
    summary: formatVerboseFailure({
      decision: DECISION_NO_GO,
      scope,
      dryRun,
      evaluatedAtUtc,
      junit,
      reasons: gateReasons,
    }),
  };
}

export function handleEvaluateReleaseGate(
  args: EvaluateReleaseGateArgs = {}
): CallToolResult {
  const result = evaluateReleaseReadiness(args);
  const isError =
    result.hasSecurityOrParseError || (!result.dryRun && result.decision === DECISION_NO_GO);
  return {
    isError,
    content: [
      {
        type: 'text',
        text: result.summary,
      },
    ],
  };
}
