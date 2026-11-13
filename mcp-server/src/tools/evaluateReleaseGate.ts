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

const SCHEMA_STRING = 'string' as const;
const SCHEMA_NUMBER = 'number' as const;
const SCHEMA_BOOLEAN = 'boolean' as const;
const SCHEMA_OBJECT = 'object' as const;

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

function strProp(description: string): { type: typeof SCHEMA_STRING; description: string } {
  return { type: SCHEMA_STRING, description };
}

function numProp(description: string): { type: typeof SCHEMA_NUMBER; description: string } {
  return { type: SCHEMA_NUMBER, description };
}

function boolProp(description: string): { type: typeof SCHEMA_BOOLEAN; description: string } {
  return { type: SCHEMA_BOOLEAN, description };
}

export const EVALUATE_RELEASE_GATE_TOOL: Tool = {
  name: 'evaluate_release_gate',
  description:
    'Evalúa la compuerta multi-señal GO/NO_GO de liberación combinando pruebas JUnit XML (con defensa anti-XXE), telemetría de observabilidad y defectos QA.',
  inputSchema: {
    type: SCHEMA_OBJECT,
    properties: {
      workspaceRoot: strProp('Raíz del workspace para contención de rutas (opcional).'),
      scope: {
        type: SCHEMA_STRING,
        enum: [SCOPE_FULL, SCOPE_SMOKE],
        description: 'Alcance de evaluación: full (evalúa 3 señales) o smoke (retorna SKIPPED).',
      },
      dryRun: boolProp('Modo informativo por defecto (true). Si es false, NO_GO marca isError=true.'),
      enforce: boolProp('Equivalente a dryRun=false cuando es true.'),
      timestamp: strProp('Marca temporal ISO-8601 opcional para normalizar a UTC (Z).'),
      junitXmlPath: strProp('Ruta relativa al archivo JUnit XML dentro del workspace.'),
      junitXmlContent: strProp('Contenido JUnit XML inline (alternativo a junitXmlPath).'),
      telemetryJsonPath: strProp('Ruta relativa al JSON de telemetría (OTel/Prometheus/Datadog/Grafana).'),
      telemetry: {
        type: SCHEMA_OBJECT,
        description: 'Instantánea JSON inline de telemetría (snake_case o camelCase).',
      },
      defectsJsonPath: strProp('Ruta relativa al JSON de defectos y escapes QA.'),
      defects: {
        type: SCHEMA_OBJECT,
        description: 'Resumen JSON inline de defectos (open_blockers, open_criticals, qa_escapes).',
      },
      thresholds: {
        type: SCHEMA_OBJECT,
        description: 'Sobrescritura parcial de umbrales corporativos.',
        properties: {
          minPassRatePct: numProp('Porcentaje mínimo de éxito JUnit (default 100).'),
          maxErrorRatePct: numProp('Tasa máxima de error % (default 1.0).'),
          maxP95Ms: numProp('Latencia p95 máxima en ms (default 500).'),
          maxP99Ms: numProp('Latencia p99 máxima en ms (default 1000).'),
          maxActiveIncidents: numProp('Incidentes activos máximos (default 0).'),
          maxOpenBlockers: numProp('Defectos bloqueantes máximos (default 0).'),
          maxOpenCriticals: numProp('Defectos críticos máximos (default 0).'),
          maxQaEscapes: numProp('Escapes QA máximos (default 0).'),
        },
        additionalProperties: false,
      },
      minPassRatePct: numProp('Override directo para minPassRatePct.'),
      maxErrorRatePct: numProp('Override directo para maxErrorRatePct.'),
      maxP95Ms: numProp('Override directo para maxP95Ms.'),
      maxP99Ms: numProp('Override directo para maxP99Ms.'),
      maxActiveIncidents: numProp('Override directo para maxActiveIncidents.'),
      maxOpenBlockers: numProp('Override directo para maxOpenBlockers.'),
      maxOpenCriticals: numProp('Override directo para maxOpenCriticals.'),
      maxQaEscapes: numProp('Override directo para maxQaEscapes.'),
    },
    additionalProperties: false,
  },
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

function pushSecurityReason(
  reasons: BlockingReason[],
  code: BlockingReasonCode,
  metric: string,
  actual: string,
  message: string
): void {
  reasons.push({
    code,
    signal: SIGNAL_SECURITY,
    metric,
    actual,
    threshold: 'contained-valid',
    message,
  });
}

function resolveSafeWorkspaceFile(
  workspaceRoot: string,
  candidatePath: string,
  reasons: BlockingReason[]
): string | null {
  if (candidatePath.includes('\0') || workspaceRoot.includes('\0')) {
    pushSecurityReason(
      reasons,
      CODE_PATH_TRAVERSAL,
      'path',
      candidatePath,
      'Ruta rechazada por contener bytes nulos.'
    );
    return null;
  }

  if (candidatePath.trim().length === 0) {
    pushSecurityReason(reasons, CODE_INVALID_INPUT, 'path', candidatePath, 'La ruta no puede estar vacía.');
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
    pushSecurityReason(
      reasons,
      CODE_PATH_TRAVERSAL,
      'path',
      candidatePath,
      `La ruta '${candidatePath}' escapa los límites del workspace.`
    );
    return null;
  }

  if (!fs.existsSync(rootResolved) || !fs.existsSync(candidateResolved) || !fs.statSync(candidateResolved).isFile()) {
    pushSecurityReason(
      reasons,
      CODE_FILE_NOT_FOUND,
      'path',
      candidatePath,
      `Archivo requerido no encontrado: '${candidatePath}'.`
    );
    return null;
  }

  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(candidateResolved);
  if (!isContainedPath(rootReal, targetReal)) {
    pushSecurityReason(
      reasons,
      CODE_PATH_TRAVERSAL,
      'path',
      candidatePath,
      `Enlace simbólico fuera del workspace detectado en '${candidatePath}'.`
    );
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
    pushSecurityReason(
      reasons,
      CODE_INVALID_INPUT,
      'timestamp',
      String(rawTimestamp),
      'Timestamp ISO-8601 inválido o vacío.'
    );
    return new Date().toISOString();
  }
  const parsed = new Date(rawTimestamp.trim());
  if (Number.isNaN(parsed.getTime())) {
    pushSecurityReason(
      reasons,
      CODE_INVALID_INPUT,
      'timestamp',
      rawTimestamp,
      `No se pudo normalizar el timestamp '${rawTimestamp}' a UTC.`
    );
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function resolveScope(rawScope: unknown, reasons: BlockingReason[]): ReleaseGateScope {
  if (rawScope === undefined) {
    return SCOPE_FULL;
  }
  if (rawScope === SCOPE_FULL || rawScope === SCOPE_SMOKE) {
    return rawScope;
  }
  pushSecurityReason(
    reasons,
    CODE_INVALID_INPUT,
    'scope',
    String(rawScope),
    `Alcance inválido '${String(rawScope)}'; valores permitidos: full, smoke.`
  );
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
    pushSecurityReason(reasons, CODE_FILE_NOT_FOUND, 'path', relPath, `Error leyendo '${relPath}': ${detail}`);
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
  const withoutComments = stripDelimitedSection(rawXml, '<!--', '-->');
  if (withoutComments === null) {
    return null;
  }
  const withoutPi = stripDelimitedSection(withoutComments, '<?', '?>');
  if (withoutPi === null) {
    return null;
  }
  return stripDelimitedSection(withoutPi, '<![CDATA[', ']]>');
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
  while (pos < text.length && isWhitespaceChar(text[pos])) {
    pos += 1;
  }
  return pos;
}

function parseAttributes(attrSlice: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < attrSlice.length) {
    pos = skipWhitespace(attrSlice, pos);
    const eqIdx = attrSlice.indexOf('=', pos);
    if (eqIdx === -1) {
      break;
    }
    const key = attrSlice.slice(pos, eqIdx).trim();
    const valStart = skipWhitespace(attrSlice, eqIdx + 1);
    const quote = attrSlice[valStart];
    if (quote !== '"' && quote !== "'") {
      break;
    }
    const valEnd = attrSlice.indexOf(quote, valStart + 1);
    if (valEnd === -1) {
      break;
    }
    if (key.length > 0) {
      attrs[key] = attrSlice.slice(valStart + 1, valEnd);
    }
    pos = valEnd + 1;
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
  while (nameEnd < body.length && !isWhitespaceChar(body[nameEnd])) {
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
    acc.suiteTests += parseNonNegIntAttr(token.attrs, 'tests');
    acc.suiteFailures += parseNonNegIntAttr(token.attrs, 'failures');
    acc.suiteErrors += parseNonNegIntAttr(token.attrs, 'errors');
    acc.suiteSkipped += parseNonNegIntAttr(token.attrs, 'skipped');
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
  const baseTests = acc.suiteTests > 0 ? acc.suiteTests : acc.rootTests;
  const baseFailures = acc.suiteFailures > 0 ? acc.suiteFailures : acc.rootFailures;
  const baseErrors = acc.suiteErrors > 0 ? acc.suiteErrors : acc.rootErrors;
  const baseSkipped = acc.suiteSkipped > 0 ? acc.suiteSkipped : acc.rootSkipped;

  const totalTests = Math.max(baseTests, acc.observedCases);
  const failures = Math.max(baseFailures, acc.observedFailures);
  const errors = Math.max(baseErrors, acc.observedErrors);
  const skipped = Math.max(baseSkipped, acc.observedSkipped);
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
  const upper = rawXml.toUpperCase();
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
    pushSecurityReason(
      reasons,
      CODE_XXE,
      'junit.xml',
      '<!DOCTYPE/<!ENTITY',
      'Payload XML rechazado por seguridad anti-XXE (APSC-DV-002390/002550): contiene <!DOCTYPE o <!ENTITY.'
    );
    return emptyJunitSummary();
  }

  const cleaned = stripXmlNoise(rawXml);
  const tokens = cleaned === null ? null : tokenizeXmlTags(cleaned);
  if (!tokens) {
    pushSecurityReason(reasons, CODE_INVALID_XML, 'junit.xml', 'malformed', 'El contenido JUnit XML está mal formado.');
    return emptyJunitSummary();
  }

  const acc = createJunitAccumulator();
  for (const token of tokens) {
    processJunitToken(acc, token);
  }
  if (!acc.hasSuiteElement) {
    pushSecurityReason(
      reasons,
      CODE_INVALID_XML,
      'junit.xml',
      'missing-testsuite',
      'El XML no contiene un nodo raíz <testsuite> o <testsuites>.'
    );
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
    pushSecurityReason(reasons, CODE_INVALID_JSON, label, 'invalid-json', `JSON inválido en '${label}': ${detail}`);
    return null;
  }
  if (!isPlainRecord(parsed)) {
    pushSecurityReason(reasons, CODE_INVALID_JSON, label, typeof parsed, `La raíz de '${label}' debe ser un objeto JSON.`);
    return null;
  }
  return parsed;
}

function loadJsonObjectSignal(
  inlineObj: Record<string, unknown> | undefined,
  relPath: string | undefined,
  label: string,
  workspaceRoot: string,
  reasons: BlockingReason[]
): JsonRecord | null {
  if (inlineObj !== undefined) {
    if (!isPlainRecord(inlineObj)) {
      pushSecurityReason(reasons, CODE_INVALID_INPUT, label, typeof inlineObj, `'${label}' debe ser un objeto JSON.`);
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
      pushSecurityReason(
        reasons,
        CODE_INVALID_INPUT,
        metricName,
        String(value),
        `Métrica '${metricName}' inválida: debe ser un número finito >= 0.`
      );
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

function resolveThresholdNumber(
  overrideVal: number | undefined,
  nestedVal: number | undefined,
  fallback: number,
  name: string,
  reasons: BlockingReason[]
): number {
  const candidate = overrideVal ?? nestedVal ?? fallback;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
    pushSecurityReason(
      reasons,
      CODE_INVALID_INPUT,
      name,
      String(candidate),
      `Umbral '${name}' inválido: debe ser un número finito >= 0.`
    );
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
    minPassRatePct: resolveThresholdNumber(args.minPassRatePct, t.minPassRatePct, d.minPassRatePct, 'minPassRatePct', reasons),
    maxErrorRatePct: resolveThresholdNumber(args.maxErrorRatePct, t.maxErrorRatePct, d.maxErrorRatePct, 'maxErrorRatePct', reasons),
    maxP95Ms: resolveThresholdNumber(args.maxP95Ms, t.maxP95Ms, d.maxP95Ms, 'maxP95Ms', reasons),
    maxP99Ms: resolveThresholdNumber(args.maxP99Ms, t.maxP99Ms, d.maxP99Ms, 'maxP99Ms', reasons),
    maxActiveIncidents: resolveThresholdNumber(
      args.maxActiveIncidents,
      t.maxActiveIncidents,
      d.maxActiveIncidents,
      'maxActiveIncidents',
      reasons
    ),
    maxOpenBlockers: resolveThresholdNumber(args.maxOpenBlockers, t.maxOpenBlockers, d.maxOpenBlockers, 'maxOpenBlockers', reasons),
    maxOpenCriticals: resolveThresholdNumber(args.maxOpenCriticals, t.maxOpenCriticals, d.maxOpenCriticals, 'maxOpenCriticals', reasons),
    maxQaEscapes: resolveThresholdNumber(args.maxQaEscapes, t.maxQaEscapes, d.maxQaEscapes, 'maxQaEscapes', reasons),
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

function checkMaxMetric(
  reasons: BlockingReason[],
  signal: ReleaseGateSignal,
  code: BlockingReasonCode,
  metric: string,
  actual: number,
  threshold: number,
  unit: string
): void {
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
  checkMaxMetric(reasons, SIGNAL_TELEMETRY, CODE_ERROR_RATE, 'telemetry.errorRatePct', telemetry.errorRatePct, thresholds.maxErrorRatePct, '%');
  checkMaxMetric(reasons, SIGNAL_TELEMETRY, CODE_P95, 'telemetry.p95Ms', telemetry.p95Ms, thresholds.maxP95Ms, 'ms');
  checkMaxMetric(reasons, SIGNAL_TELEMETRY, CODE_P99, 'telemetry.p99Ms', telemetry.p99Ms, thresholds.maxP99Ms, 'ms');
  checkMaxMetric(
    reasons,
    SIGNAL_TELEMETRY,
    CODE_INCIDENTS,
    'telemetry.activeIncidents',
    telemetry.activeIncidents,
    thresholds.maxActiveIncidents,
    ''
  );
}

function evaluateDefectsSignal(
  defects: NormalizedDefects,
  thresholds: ReleaseGateThresholds,
  reasons: BlockingReason[]
): void {
  checkMaxMetric(reasons, SIGNAL_DEFECTS, CODE_BLOCKERS, 'defects.openBlockers', defects.openBlockers, thresholds.maxOpenBlockers, '');
  checkMaxMetric(reasons, SIGNAL_DEFECTS, CODE_CRITICALS, 'defects.openCriticals', defects.openCriticals, thresholds.maxOpenCriticals, '');
  checkMaxMetric(reasons, SIGNAL_DEFECTS, CODE_ESCAPES, 'defects.qaEscapes', defects.qaEscapes, thresholds.maxQaEscapes, '');
}

function formatVerboseFailure(
  decision: ReleaseGateDecision,
  scope: ReleaseGateScope,
  dryRun: boolean,
  evaluatedAtUtc: string,
  junit: JunitSignalSummary,
  reasons: BlockingReason[]
): string {
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
  const telemetryRaw = loadJsonObjectSignal(
    args.telemetry,
    args.telemetryJsonPath,
    'telemetry',
    workspaceRoot,
    securityOrParseReasons
  );
  const defectsRaw = loadJsonObjectSignal(
    args.defects,
    args.defectsJsonPath,
    'defects',
    workspaceRoot,
    securityOrParseReasons
  );
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
      summary: formatVerboseFailure(DECISION_NO_GO, scope, dryRun, evaluatedAtUtc, junit, securityOrParseReasons),
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
    summary: formatVerboseFailure(DECISION_NO_GO, scope, dryRun, evaluatedAtUtc, junit, gateReasons),
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
