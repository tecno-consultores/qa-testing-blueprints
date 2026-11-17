// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';

export const VIBE_RULE_SEC = 'VIBE-SEC-001' as const;
export const VIBE_RULE_RLS = 'VIBE-RLS-002' as const;
export const VIBE_RULE_TYPE = 'VIBE-TYPE-003' as const;
export const VIBE_RULE_ARCH = 'VIBE-ARCH-004' as const;
export const VIBE_RULE_QA = 'VIBE-QA-005' as const;

export const VIBE_SEVERITY_CRITICAL = 'CRITICAL' as const;
export const VIBE_SEVERITY_HIGH = 'HIGH' as const;
export const VIBE_SEVERITY_MEDIUM = 'MEDIUM' as const;

export const VIBE_VERDICT_READY = 'ENTERPRISE_READY' as const;
export const VIBE_VERDICT_RESCUE = 'RESCUE_REQUIRED' as const;

export const RLS_TEMPLATE_REL_PATH = 'vibe-rescue/templates/rls_hardening.sql' as const;
export const REDACTION_MARKER = '[REDACTED_SECRET]' as const;
export const DEFAULT_MAX_LINES = 500;

const STAGE_SEC = 'Stage 1: Secret Quarantine';
const STAGE_RLS = 'Stage 2: PostgreSQL RLS & RBAC';
const STAGE_TYPE = 'Stage 3: Strict Typing & Borders';
const STAGE_ARCH = 'Stage 3: Modularization (CC <= 5)';
const STAGE_QA = 'Stage 4: Rule Zero & Test Net';

const UTF8_ENCODING = 'utf8' as const;

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
  'coverage',
  'qa11x-rescue',
]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.php']);
const TEST_DIR_NAMES = new Set(['tests', 'test', '__tests__']);
const GITIGNORE_ENV_ENTRIES = new Set(['.env', '/.env', '*.env', '.env*']);
const DEFAULT_ENV_KEYS = ['DATABASE_URL', 'APP_ENCRYPTION_KEY', 'AUDIT_HMAC_KEY'] as const;

const CLIENT_SECRET_VAR_RE =
  /\b((?:VITE|NEXT_PUBLIC|EXPO_PUBLIC|REACT_APP)_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE|OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)[A-Z0-9_]*)\b/;
const LITERAL_KEY_PATTERNS: readonly RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/,
  /\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
];
const ENV_KEY_NAME_RE = /^[A-Za-z_]\w*$/;
const SENSITIVE_ENV_KEY_RE =
  /(?:SECRET|SERVICE_ROLE|PRIVATE|KEY|TOKEN|PASSWORD|PASSWD|DATABASE_URL)/i;
const PLACEHOLDER_VAL_RE =
  /(?:example|placeholder|changeme|change_me|your_|redacted)|<[^<>\n]+>/i;
const REDACT_ASSIGN_RE =
  /(\b\w*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL)\w*[ \t]*[=:][ \t]*["']?)([^"'\s]+)/gi;
const REDACT_BEARER_RE = /\b(Bearer|Basic)\s+[a-z0-9._+/=-]+/gi;
const REDACT_LITERAL_PATTERNS: readonly RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

const SQL_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const SQL_LINE_COMMENT_RE = /--[^\n]*/g;
const SQL_PERMISSIVE_RE = /\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i;
const SQL_CREATE_TABLE_RE = /\bCREATE\s+TABLE\b/i;
const SQL_ENABLE_RLS_RE = /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i;
const SQL_FORCE_RLS_RE = /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i;
const SQL_BYPASSRLS_RE = /\bBYPASSRLS\b/i;
const CLIENT_SERVICE_ROLE_RE = /\b(?:service_role|supabaseAdmin)\b/;

const WEAK_TYPE_RE = /(?::\s*any\b|\bas\s+any\b|@ts-ignore|@ts-nocheck|#\s*type:\s*ignore)/;
const TS_STRICT_FALSE_RE = /"strict"\s*:\s*false/;
const MUTATING_ROUTE_PATTERNS: readonly RegExp[] = [
  /@(?:app|router)\.(?:post|put|patch|delete)\s*\(/,
  /\b(?:app|router)\.(?:post|put|patch|delete)\s*\(/,
  /export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/,
];
const IDEMPOTENCY_RE = /Idempotency-Key|idempotency_key/i;

const TEST_FILE_RE = /(?:\.(?:test|spec)\.[a-z0-9]+$|^test_.*\.py$|_test\.py$|\.feature$)/i;
const FIXED_WAIT_RE = /\b(?:waitForTimeout|time\.sleep)\s*\(|\bcy\.wait\s*\(\s*\d+/;
const DOCKER_USER_ROOT_RE = /^[ \t]*USER[ \t]+(?:root|0(?::0)?)[ \t]*$/im;
const DOCKER_ANY_USER_RE = /^[ \t]*USER[ \t]+\S+/im;
const DOCKER_FROM_LATEST_RE = /^[ \t]*FROM[ \t]+[^\s@]+:latest\b/im;

const EMBEDDED_RLS_TEMPLATE = [
  '-- Plantilla minima QA-PG17-RLS (respaldo embebido)',
  'DO $$ BEGIN',
  "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_user') THEN",
  '    CREATE ROLE app_runtime_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;',
  '  END IF;',
  'END $$;',
  'ALTER TABLE tenant_records ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE tenant_records FORCE ROW LEVEL SECURITY;',
  'CREATE POLICY tenant_isolation_policy ON tenant_records FOR ALL TO app_runtime_user',
  "  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)",
  "  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);",
  '',
].join('\n');

const STAGE_BY_RULE: Readonly<Record<VibeRuleId, string>> = {
  [VIBE_RULE_SEC]: STAGE_SEC,
  [VIBE_RULE_RLS]: STAGE_RLS,
  [VIBE_RULE_TYPE]: STAGE_TYPE,
  [VIBE_RULE_ARCH]: STAGE_ARCH,
  [VIBE_RULE_QA]: STAGE_QA,
};

export type VibeSeverity =
  | typeof VIBE_SEVERITY_CRITICAL
  | typeof VIBE_SEVERITY_HIGH
  | typeof VIBE_SEVERITY_MEDIUM;

export type VibeRuleId =
  | typeof VIBE_RULE_SEC
  | typeof VIBE_RULE_RLS
  | typeof VIBE_RULE_TYPE
  | typeof VIBE_RULE_ARCH
  | typeof VIBE_RULE_QA;

export type VibeVerdict = typeof VIBE_VERDICT_READY | typeof VIBE_VERDICT_RESCUE;

export interface VibeFinding {
  readonly ruleId: VibeRuleId;
  readonly stage: string;
  readonly severity: VibeSeverity;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface AuditVibeCounts {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
}

export interface AuditVibePrototypeArgs {
  readonly targetDir?: string;
  readonly workspaceRoot?: string;
  readonly dryRun?: boolean;
  readonly remediationSubdir?: string;
  readonly maxLines?: number;
  readonly enforce?: boolean;
}

export interface AuditVibePrototypeOptions {
  readonly workspaceRoot?: string;
  readonly templatePath?: string;
}

export interface AuditVibePrototypeResult {
  readonly targetDir: string;
  readonly dryRun: boolean;
  readonly score: number;
  readonly verdict: VibeVerdict;
  readonly counts: AuditVibeCounts;
  readonly rlsTemplate: string;
  readonly findings: readonly VibeFinding[];
  readonly writtenFiles: readonly string[];
  readonly skippedExistingFiles: readonly string[];
  readonly hasSecurityOrInputError: boolean;
  readonly summary: string;
}

export const AUDIT_VIBE_PROTOTYPE_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: 'audit_vibe_prototype',
  description:
    'Audits and hardens vibe-coded prototypes (Bolt.new, Lovable, v0, Replit Agent) under the 5-stage QA-11X protocol (VIBE-SEC-001..VIBE-QA-005), with secret redaction, PostgreSQL 15-17+ RLS template, and optional non-destructive dryRun=false emission.',
};

export function redactVibeSecrets(text: string): string {
  let withoutLiterals = text;
  for (const literalPattern of REDACT_LITERAL_PATTERNS) {
    withoutLiterals = withoutLiterals.replace(literalPattern, REDACTION_MARKER);
  }
  const withoutBearer = withoutLiterals.replace(REDACT_BEARER_RE, `$1 ${REDACTION_MARKER}`);
  return withoutBearer.replace(REDACT_ASSIGN_RE, `$1${REDACTION_MARKER}`);
}

function hasUnsafeRawPath(raw: string): boolean {
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  return (
    trimmed.length === 0 ||
    trimmed.includes('\0') ||
    lowered.includes('%2e') ||
    lowered.includes('%2f') ||
    lowered.includes('%5c') ||
    trimmed.split(/[\\/]/).includes('..')
  );
}

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function resolveContainedTargetDir(rawTarget: string, workspaceRoot: string): string {
  if (hasUnsafeRawPath(rawTarget)) {
    throw new Error(`Ruta objetivo insegura o vacía: "${rawTarget}"`);
  }
  const rootResolved = path.resolve(workspaceRoot);
  if (!fs.existsSync(rootResolved) || !fs.statSync(rootResolved).isDirectory()) {
    throw new Error(`workspaceRoot inexistente o inválido: "${rootResolved}"`);
  }
  const rootReal = fs.realpathSync(rootResolved);
  const candidateResolved = path.resolve(rootReal, rawTarget.trim());
  if (!isContainedPath(rootReal, candidateResolved)) {
    throw new Error(`Path traversal rechazado fuera de workspaceRoot: "${rawTarget}"`);
  }
  if (!fs.existsSync(candidateResolved) || !fs.statSync(candidateResolved).isDirectory()) {
    throw new Error(`targetDir no existe o no es directorio: "${candidateResolved}"`);
  }
  const targetReal = fs.realpathSync(candidateResolved);
  if (!isContainedPath(rootReal, targetReal)) {
    throw new Error(`Symlink fuera de workspaceRoot rechazado: "${rawTarget}"`);
  }
  return targetReal;
}

function resolveContainedSubdir(rawSubdir: string, targetReal: string): string {
  if (hasUnsafeRawPath(rawSubdir) || path.isAbsolute(rawSubdir.trim())) {
    throw new Error(`remediationSubdir inseguro o absoluto: "${rawSubdir}"`);
  }
  const candidate = path.resolve(targetReal, rawSubdir.trim());
  if (!isContainedPath(targetReal, candidate) || candidate === targetReal) {
    throw new Error(`remediationSubdir debe estar contenido dentro de targetDir: "${rawSubdir}"`);
  }
  if (fs.existsSync(candidate)) {
    const candidateReal = fs.realpathSync(candidate);
    if (!isContainedPath(targetReal, candidateReal)) {
      throw new Error(`Symlink en remediationSubdir fuera de targetDir: "${rawSubdir}"`);
    }
  }
  return candidate;
}

interface VibeFindingSpec {
  readonly ruleId: VibeRuleId;
  readonly severity: VibeSeverity;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

function addFinding(findings: VibeFinding[], spec: VibeFindingSpec): void {
  findings.push({
    ruleId: spec.ruleId,
    stage: STAGE_BY_RULE[spec.ruleId],
    severity: spec.severity,
    file: spec.file,
    line: spec.line,
    message: redactVibeSecrets(spec.message),
  });
}

function findMatchingLine(lines: readonly string[], pattern: RegExp): number {
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (line !== undefined && pattern.test(line)) {
      return idx + 1;
    }
  }
  return 1;
}

function isTestPath(relPosix: string): boolean {
  const segments = relPosix.split('/');
  const baseName = segments[segments.length - 1] ?? '';
  const hasTestDir = segments.slice(0, -1).some((seg) => TEST_DIR_NAMES.has(seg));
  return hasTestDir || TEST_FILE_RE.test(baseName);
}

function collectFiles(
  rootDir: string,
  excludedResolvedDir: string | undefined,
): string[] {
  const out: string[] = [];
  const walk = (currentDir: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && path.resolve(fullPath) !== excludedResolvedDir) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  };
  walk(rootDir);
  return out;
}

function hasGitignoreEnvRule(targetDir: string): boolean {
  const giPath = path.join(targetDir, '.gitignore');
  if (!fs.existsSync(giPath) || fs.lstatSync(giPath).isSymbolicLink()) {
    return false;
  }
  const lines = fs.readFileSync(giPath, UTF8_ENCODING).split(/\r?\n/);
  return lines.some((line) => GITIGNORE_ENV_ENTRIES.has(line.trim()));
}

function parseEnvAssignment(rawLine: string): { key: string; value: string } | null {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return null;
  }
  const body = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const eqIdx = body.indexOf('=');
  if (eqIdx <= 0) {
    return null;
  }
  const key = body.slice(0, eqIdx).trim();
  if (!ENV_KEY_NAME_RE.test(key)) {
    return null;
  }
  const value = body.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  return { key, value };
}

interface ScanEnvContext {
  readonly rel: string;
  readonly lines: readonly string[];
  readonly envIgnored: boolean;
  readonly findings: VibeFinding[];
  readonly envKeys: Set<string>;
}

function scanEnvLines(ctx: ScanEnvContext): void {
  const { rel, lines, envIgnored, findings, envKeys } = ctx;
  for (const [idx, rawLine] of lines.entries()) {
    const parsed = parseEnvAssignment(rawLine);
    if (!parsed) {
      continue;
    }
    const { key, value } = parsed;
    envKeys.add(key);
    const isPlaceholder = value.length === 0 || PLACEHOLDER_VAL_RE.test(value);
    if (CLIENT_SECRET_VAR_RE.test(key)) {
      addFinding(findings, {
        ruleId: VIBE_RULE_SEC,
        severity: VIBE_SEVERITY_CRITICAL,
        file: rel,
        line: idx + 1,
        message: `Variable cliente privilegiada: ${key}=${REDACTION_MARKER}`,
      });
    } else if (!envIgnored && SENSITIVE_ENV_KEY_RE.test(key) && !isPlaceholder) {
      addFinding(findings, {
        ruleId: VIBE_RULE_SEC,
        severity: VIBE_SEVERITY_CRITICAL,
        file: rel,
        line: idx + 1,
        message: `Secreto en .env sin .gitignore: ${key}=${REDACTION_MARKER}`,
      });
    }
  }
}

function scanSourceSecrets(
  rel: string,
  lines: readonly string[],
  findings: VibeFinding[],
): void {
  for (const [idx, line] of lines.entries()) {
    const clientMatch = CLIENT_SECRET_VAR_RE.exec(line);
    if (clientMatch) {
      addFinding(findings, {
        ruleId: VIBE_RULE_SEC,
        severity: VIBE_SEVERITY_CRITICAL,
        file: rel,
        line: idx + 1,
        message: `Credencial privilegiada en cliente: ${pickAt(clientMatch, 1, 'SECRET')}`,
      });
    }
    if (LITERAL_KEY_PATTERNS.some((re) => re.test(line))) {
      addFinding(findings, {
        ruleId: VIBE_RULE_SEC,
        severity: VIBE_SEVERITY_CRITICAL,
        file: rel,
        line: idx + 1,
        message: `Literal de llave API detectado en código: ${REDACTION_MARKER}`,
      });
    }
  }
}

function scanSqlFile(rel: string, rawText: string, findings: VibeFinding[]): void {
  const cleaned = rawText
    .replace(SQL_BLOCK_COMMENT_RE, '')
    .replace(SQL_LINE_COMMENT_RE, '');
  const lines = cleaned.split(/\r?\n/);
  if (SQL_PERMISSIVE_RE.test(cleaned)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_RLS,
      severity: VIBE_SEVERITY_CRITICAL,
      file: rel,
      line: findMatchingLine(lines, SQL_PERMISSIVE_RE),
      message: `Política SQL permisiva detectada; aplicar ${RLS_TEMPLATE_REL_PATH}`,
    });
  }
  if (SQL_BYPASSRLS_RE.test(cleaned)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_RLS,
      severity: VIBE_SEVERITY_CRITICAL,
      file: rel,
      line: findMatchingLine(lines, SQL_BYPASSRLS_RE),
      message: 'Uso inseguro de BYPASSRLS detectado en definición SQL',
    });
  }
  const hasForceRls = SQL_ENABLE_RLS_RE.test(cleaned) && SQL_FORCE_RLS_RE.test(cleaned);
  if (SQL_CREATE_TABLE_RE.test(cleaned) && !hasForceRls) {
    addFinding(findings, {
      ruleId: VIBE_RULE_RLS,
      severity: VIBE_SEVERITY_CRITICAL,
      file: rel,
      line: findMatchingLine(lines, SQL_CREATE_TABLE_RE),
      message: 'CREATE TABLE sin ENABLE + FORCE ROW LEVEL SECURITY',
    });
  }
}

interface NonTestCodeScanInput {
  readonly rel: string;
  readonly ext: string;
  readonly text: string;
  readonly lines: readonly string[];
  readonly maxLines: number;
  readonly findings: VibeFinding[];
}

function scanNonTestCode(input: NonTestCodeScanInput): void {
  const { rel, ext, text, lines, maxLines, findings } = input;
  const isClient = ext === '.tsx' || ext === '.jsx' || ext === '.vue' || rel.toLowerCase().includes('client');
  if (isClient && CLIENT_SERVICE_ROLE_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_RLS,
      severity: VIBE_SEVERITY_CRITICAL,
      file: rel,
      line: findMatchingLine(lines, CLIENT_SERVICE_ROLE_RE),
      message: 'Uso de service_role/supabaseAdmin en capa cliente',
    });
  }
  if (WEAK_TYPE_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_TYPE,
      severity: VIBE_SEVERITY_HIGH,
      file: rel,
      line: findMatchingLine(lines, WEAK_TYPE_RE),
      message: 'Escape de tipado estricto (: any / @ts-ignore / # type: ignore)',
    });
  }
  const mutatingMatchIdx = lines.findIndex((line) =>
    MUTATING_ROUTE_PATTERNS.some((re) => re.test(line))
  );
  if (mutatingMatchIdx !== -1 && !IDEMPOTENCY_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_TYPE,
      severity: VIBE_SEVERITY_HIGH,
      file: rel,
      line: mutatingMatchIdx + 1,
      message: 'Endpoint mutador sin verificación de cabecera Idempotency-Key',
    });
  }
  if (lines.length > maxLines) {
    addFinding(findings, {
      ruleId: VIBE_RULE_ARCH,
      severity: VIBE_SEVERITY_MEDIUM,
      file: rel,
      line: 1,
      message: `Archivo monolítico (${lines.length} > ${maxLines} líneas); modularizar CC <= 5`,
    });
  }
}

function scanDockerfile(
  rel: string,
  text: string,
  lines: readonly string[],
  findings: VibeFinding[],
): void {
  if (DOCKER_USER_ROOT_RE.test(text) || !DOCKER_ANY_USER_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_QA,
      severity: VIBE_SEVERITY_HIGH,
      file: rel,
      line: findMatchingLine(lines, DOCKER_USER_ROOT_RE),
      message: 'Dockerfile ejecuta como root o carece de directiva USER no-root',
    });
  }
  if (DOCKER_FROM_LATEST_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_QA,
      severity: VIBE_SEVERITY_HIGH,
      file: rel,
      line: findMatchingLine(lines, DOCKER_FROM_LATEST_RE),
      message: 'Dockerfile usa etiqueta mutable :latest sin digest @sha256',
    });
  }
}

function isEnvFile(baseName: string): boolean {
  return baseName === '.env' || (baseName.startsWith('.env.') && !baseName.endsWith('.example'));
}

interface ProcessSingleFileInput {
  readonly filePath: string;
  readonly targetReal: string;
  readonly envIgnored: boolean;
  readonly maxLines: number;
  readonly findings: VibeFinding[];
  readonly envKeys: Set<string>;
}

function processSingleFile(input: ProcessSingleFileInput): boolean {
  const { filePath, targetReal, envIgnored, maxLines, findings, envKeys } = input;
  const relPosix = path.relative(targetReal, filePath).split(path.sep).join('/');
  const baseName = path.basename(filePath);
  const ext = path.extname(filePath);
  const isTest = isTestPath(relPosix);
  const text = fs.readFileSync(filePath, UTF8_ENCODING);
  const lines = text.split(/\r?\n/);

  if (isEnvFile(baseName)) {
    scanEnvLines({ rel: relPosix, lines, envIgnored, findings, envKeys });
  } else if (ext === '.sql') {
    scanSqlFile(relPosix, text, findings);
  } else if (CODE_EXTENSIONS.has(ext)) {
    if (FIXED_WAIT_RE.test(text)) {
      addFinding(findings, {
        ruleId: VIBE_RULE_QA,
        severity: VIBE_SEVERITY_HIGH,
        file: relPosix,
        line: findMatchingLine(lines, FIXED_WAIT_RE),
        message: 'Espera fija bloqueante detectada (waitForTimeout/sleep); usar espera por condición',
      });
    }
    if (!isTest) {
      scanSourceSecrets(relPosix, lines, findings);
      scanNonTestCode({ rel: relPosix, ext, text, lines, maxLines, findings });
    }
  } else if (baseName.startsWith('tsconfig') && baseName.endsWith('.json') && TS_STRICT_FALSE_RE.test(text)) {
    addFinding(findings, {
      ruleId: VIBE_RULE_TYPE,
      severity: VIBE_SEVERITY_HIGH,
      file: relPosix,
      line: findMatchingLine(lines, TS_STRICT_FALSE_RE),
      message: 'tsconfig con strict=false; habilitar strict: true',
    });
  } else if (baseName === 'Dockerfile' || baseName.startsWith('Dockerfile.')) {
    scanDockerfile(relPosix, text, lines, findings);
  }
  return isTest;
}

function loadRlsTemplateContent(workspaceRoot: string, templatePath?: string): string {
  const candidates = [
    ...(templatePath ? [path.resolve(templatePath)] : []),
    path.resolve(workspaceRoot, RLS_TEMPLATE_REL_PATH),
    path.resolve(import.meta.dirname, '..', '..', '..', RLS_TEMPLATE_REL_PATH),
    `/${RLS_TEMPLATE_REL_PATH}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.readFileSync(candidate, UTF8_ENCODING);
    }
  }
  return EMBEDDED_RLS_TEMPLATE;
}

function writeIfAbsent(
  destPath: string,
  content: string,
  written: string[],
  skipped: string[],
): void {
  if (fs.existsSync(destPath)) {
    skipped.push(destPath);
    return;
  }
  fs.writeFileSync(destPath, content, UTF8_ENCODING);
  written.push(destPath);
}

function buildRescuePlanMarkdown(
  targetReal: string,
  score: number,
  verdict: VibeVerdict,
  findings: readonly VibeFinding[],
): string {
  const lines = [
    '# Plan de Rescate Vibe-to-Enterprise (QA-11X)',
    '',
    `- **Objetivo:** \`${path.basename(targetReal)}\``,
    `- **Puntaje:** \`${score}/100\` (\`${verdict}\`)`,
    `- **Plantilla RLS:** \`${RLS_TEMPLATE_REL_PATH}\``,
    '',
    '## Hallazgos Priorizados',
  ];
  if (findings.length === 0) {
    lines.push('- Sin hallazgos críticos ni altos.');
    return `${lines.join('\n')}\n`;
  }
  for (const item of findings) {
    lines.push(
      `- [${item.severity}] \`${item.ruleId}\` (${item.stage}) \`${item.file}:${item.line}\` — ${item.message}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

interface RemediationBundleInput {
  readonly outDir: string;
  readonly targetReal: string;
  readonly workspaceRoot: string;
  readonly envKeys: ReadonlySet<string>;
  readonly score: number;
  readonly verdict: VibeVerdict;
  readonly findings: readonly VibeFinding[];
  readonly templatePath?: string;
}

function emitRemediationBundle(
  input: RemediationBundleInput,
): { readonly writtenFiles: string[]; readonly skippedExistingFiles: string[] } {
  const { outDir, targetReal, workspaceRoot, envKeys, score, verdict, findings, templatePath } = input;
  fs.mkdirSync(outDir, { recursive: true });
  const writtenFiles: string[] = [];
  const skippedExistingFiles: string[] = [];

  writeIfAbsent(
    path.join(outDir, 'rls_hardening.sql'),
    loadRlsTemplateContent(workspaceRoot, templatePath),
    writtenFiles,
    skippedExistingFiles,
  );
  const sortedKeys =
    envKeys.size > 0
      ? Array.from(envKeys).sort((a, b) => a.localeCompare(b))
      : [...DEFAULT_ENV_KEYS];
  const envExample = sortedKeys.map((key) => `${key}=<CHANGE_ME_IN_VAULT>\n`).join('');
  writeIfAbsent(path.join(outDir, '.env.example'), envExample, writtenFiles, skippedExistingFiles);
  writeIfAbsent(
    path.join(outDir, 'RESCUE_PLAN.md'),
    buildRescuePlanMarkdown(targetReal, score, verdict, findings),
    writtenFiles,
    skippedExistingFiles,
  );
  return { writtenFiles, skippedExistingFiles };
}

function computeSummary(findings: readonly VibeFinding[]): {
  readonly counts: AuditVibeCounts;
  readonly score: number;
  readonly verdict: VibeVerdict;
} {
  let critical = 0;
  let high = 0;
  let medium = 0;
  for (const item of findings) {
    if (item.severity === VIBE_SEVERITY_CRITICAL) {
      critical += 1;
    } else if (item.severity === VIBE_SEVERITY_HIGH) {
      high += 1;
    } else {
      medium += 1;
    }
  }
  const penalty = critical * 25 + high * 12 + medium * 5;
  const score = Math.max(0, 100 - penalty);
  const verdict: VibeVerdict =
    critical === 0 && high === 0 && score >= 90 ? VIBE_VERDICT_READY : VIBE_VERDICT_RESCUE;
  return { counts: { critical, high, medium }, score, verdict };
}

interface FormatVibeSummaryInput {
  readonly verdict: VibeVerdict;
  readonly score: number;
  readonly dryRun: boolean;
  readonly counts: AuditVibeCounts;
  readonly findings: readonly VibeFinding[];
  readonly writtenFiles: readonly string[];
  readonly skippedExistingFiles: readonly string[];
}

function formatSummary(input: FormatVibeSummaryInput): string {
  const { verdict, score, dryRun, counts, findings, writtenFiles, skippedExistingFiles } = input;
  if (verdict === VIBE_VERDICT_READY) {
    return `✅ [VIBE-RESCUE] ${VIBE_VERDICT_READY} (score=${score}/100, critical=0, high=0, dryRun=${dryRun})`;
  }
  const lines = [
    `❌ [VIBE-RESCUE] ${VIBE_VERDICT_RESCUE} (score=${score}/100, critical=${counts.critical}, high=${counts.high}, medium=${counts.medium}, dryRun=${dryRun})`,
    `   Plantilla RLS: ${RLS_TEMPLATE_REL_PATH}`,
  ];
  for (const item of findings) {
    lines.push(
      `   - [${item.severity}] ${item.ruleId} (${item.stage}) ${item.file}:${item.line} -> ${item.message}`,
    );
  }
  if (writtenFiles.length > 0) {
    lines.push(`   Artefactos emitidos: ${writtenFiles.join(', ')}`);
  }
  if (skippedExistingFiles.length > 0) {
    lines.push(`   Preservados sin sobrescribir: ${skippedExistingFiles.join(', ')}`);
  }
  return lines.join('\n');
}

function buildSecurityErrorResult(
  rawTarget: string,
  dryRun: boolean,
  err: unknown,
): AuditVibePrototypeResult {
  const detail = redactVibeSecrets(err instanceof Error ? err.message : String(err));
  return {
    targetDir: rawTarget,
    dryRun,
    score: 0,
    verdict: VIBE_VERDICT_RESCUE,
    counts: { critical: 1, high: 0, medium: 0 },
    rlsTemplate: RLS_TEMPLATE_REL_PATH,
    findings: [],
    writtenFiles: [],
    skippedExistingFiles: [],
    hasSecurityOrInputError: true,
    summary: `❌ [VIBE-RESCUE] ERROR_DE_SEGURIDAD: ${detail}`,
  };
}

export function auditVibePrototype(
  args: AuditVibePrototypeArgs = {},
  options: AuditVibePrototypeOptions = {},
): AuditVibePrototypeResult {
  const dryRun = args.dryRun ?? true;
  const maxLines = args.maxLines ?? DEFAULT_MAX_LINES;
  const workspaceRoot = options.workspaceRoot ?? args.workspaceRoot ?? process.cwd();
  const rawTarget = args.targetDir ?? '.';

  if (!Number.isFinite(maxLines) || maxLines <= 0) {
    return buildSecurityErrorResult(
      rawTarget,
      dryRun,
      new Error(`maxLines inválido: ${String(maxLines)}`),
    );
  }

  let targetReal: string;
  let emitDir: string | undefined;
  try {
    targetReal = resolveContainedTargetDir(rawTarget, workspaceRoot);
    if (args.remediationSubdir !== undefined) {
      emitDir = resolveContainedSubdir(args.remediationSubdir, targetReal);
    }
  } catch (err: unknown) {
    return buildSecurityErrorResult(rawTarget, dryRun, err);
  }

  const findings: VibeFinding[] = [];
  const envKeys = new Set<string>();
  const envIgnored = hasGitignoreEnvRule(targetReal);
  const files = collectFiles(targetReal, emitDir);
  let hasAnyTest = false;
  for (const fpath of files) {
    if (
      processSingleFile({ filePath: fpath, targetReal, envIgnored, maxLines, findings, envKeys })
    ) {
      hasAnyTest = true;
    }
  }
  if (!hasAnyTest) {
    addFinding(findings, {
      ruleId: VIBE_RULE_QA,
      severity: VIBE_SEVERITY_HIGH,
      file: '.',
      line: 1,
      message: 'Cero archivos de prueba detectados; exigir >= 95% cobertura en Docker no-root',
    });
  }

  const { counts, score, verdict } = computeSummary(findings);
  const emitted =
    !dryRun && emitDir !== undefined
      ? emitRemediationBundle({
          outDir: emitDir,
          targetReal,
          workspaceRoot,
          envKeys,
          score,
          verdict,
          findings,
          templatePath: options.templatePath,
        })
      : { writtenFiles: [], skippedExistingFiles: [] };

  return {
    targetDir: targetReal,
    dryRun,
    score,
    verdict,
    counts,
    rlsTemplate: RLS_TEMPLATE_REL_PATH,
    findings,
    writtenFiles: emitted.writtenFiles,
    skippedExistingFiles: emitted.skippedExistingFiles,
    hasSecurityOrInputError: false,
    summary: formatSummary({
      verdict,
      score,
      dryRun,
      counts,
      findings,
      writtenFiles: emitted.writtenFiles,
      skippedExistingFiles: emitted.skippedExistingFiles,
    }),
  };
}

export function handleAuditVibePrototype(
  args: AuditVibePrototypeArgs = {},
  options: AuditVibePrototypeOptions = {},
): CallToolResult {
  const result = auditVibePrototype(args, options);
  const isError =
    result.hasSecurityOrInputError ||
    (Boolean(args.enforce) && result.verdict === VIBE_VERDICT_RESCUE);
  return {
    isError,
    content: [{ type: 'text', text: result.summary }],
  };
}
