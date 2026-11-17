// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type AuditVibePrototypeResult,
  auditVibePrototype,
} from '../tools/auditVibePrototype.js';
import { auditSecurityStigOwasp } from '../tools/security-auditor.js';
import { auditTestPyramidGaps } from '../tools/test-pyramid-auditor.js';
import {
  type CalmValidationResult,
  DEFAULT_CALM_ARCHITECTURE_PATH,
  validateCalmArchitecture,
} from '../tools/validateCalmArchitecture.js';
import type { SecurityAuditResult, TestPyramidGapResult } from '../types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import {
  type SarifFindingInput,
  type SarifSeverity,
  buildSarifLog,
} from '../utils/sarifFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  readNextFlagValue,
  resolveCliProjectPath,
} from './cliArgHelpers.js';

const PREFIX_ERROR = '❌ [audit]';
const MODE_SECURITY = 'security' as const;
const MODE_PYRAMID = 'pyramid' as const;
const MODE_VIBE = 'vibe' as const;
const MODE_CALM = 'calm' as const;
const MODE_ALL = 'all' as const;
const FORMAT_TEXT = 'text' as const;
const FORMAT_JSON = 'json' as const;
const FORMAT_SARIF = 'sarif' as const;
const FAIL_CRITICAL = 'critical' as const;
const FAIL_HIGH = 'high' as const;
const FAIL_MEDIUM = 'medium' as const;
const FAIL_ANY = 'any' as const;
const FAIL_NONE = 'none' as const;
const SEV_CRITICAL: SarifSeverity = 'CRITICAL';
const SEV_HIGH: SarifSeverity = 'HIGH';
const SEV_MEDIUM: SarifSeverity = 'MEDIUM';

const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_MODE = '--mode';
const FLAG_MODE_SHORT = '-m';
const FLAG_FORMAT = '--format';
const FLAG_FORMAT_SHORT = '-f';
const FLAG_JSON = '--json';
const FLAG_SARIF = '--sarif';
const FLAG_FAIL_ON = '--fail-on';
const FLAG_INCLUDE_EXAMPLES = '--include-examples';
const FLAG_MAX_FINDINGS = '--max-findings';
const FLAG_ARCH_PATH = '--architecture-path';

export type AuditMode =
  | typeof MODE_SECURITY
  | typeof MODE_PYRAMID
  | typeof MODE_VIBE
  | typeof MODE_CALM
  | typeof MODE_ALL;
export type AuditFormat = typeof FORMAT_TEXT | typeof FORMAT_JSON | typeof FORMAT_SARIF;
export type FailOnLevel =
  | typeof FAIL_CRITICAL
  | typeof FAIL_HIGH
  | typeof FAIL_MEDIUM
  | typeof FAIL_ANY
  | typeof FAIL_NONE;

const VALID_MODES = new Set<string>([MODE_SECURITY, MODE_PYRAMID, MODE_VIBE, MODE_CALM, MODE_ALL]);
const VALID_FORMATS = new Set<string>([FORMAT_TEXT, FORMAT_JSON, FORMAT_SARIF]);
const VALID_FAIL_ON = new Set<string>([FAIL_CRITICAL, FAIL_HIGH, FAIL_MEDIUM, FAIL_ANY, FAIL_NONE]);

export const AUDIT_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x audit [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, -p <dir>     Directorio del proyecto a auditar (por defecto: cwd)',
  '  --mode, -m <mode>            security | pyramid | vibe | calm | all (por defecto: security)',
  '  --format, -f <fmt>           text | json | sarif (por defecto: text)',
  '  --json                       Atajo para --format json',
  '  --sarif                      Atajo para --format sarif',
  '  --fail-on <level>            critical | high | medium | any | none (por defecto: high)',
  '  --include-examples           Incluye archivos .example en auditoría de seguridad',
  '  --max-findings <n>           Límite máximo de hallazgos devueltos por motor',
  '  --architecture-path <rel>    Ruta relativa del modelo FINOS CALM',
  '  --help, -h                   Muestra esta ayuda y sale con código 0',
].join('\n');

interface ParsedAuditArgs {
  rawDir: string | undefined;
  mode: AuditMode;
  format: AuditFormat;
  failOn: FailOnLevel;
  includeExamples: boolean;
  maxFindings: number | undefined;
  architecturePath: string | undefined;
}

interface ExecutedAudits {
  readonly security?: SecurityAuditResult;
  readonly pyramid?: TestPyramidGapResult;
  readonly vibe?: AuditVibePrototypeResult;
  readonly calm?: CalmValidationResult;
  readonly calm_status?: 'PASSED' | 'FAILED' | 'SKIPPED';
}

function assertInSet<T extends string>(value: string, allowed: Set<string>, label: string): T {
  if (!allowed.has(value)) {
    throw new Error(`Valor inválido para ${label}: '${value}'.`);
  }
  return value as T;
}

function parsePositiveInt(raw: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`--max-findings debe ser un entero positivo; recibido '${raw}'.`);
  }
  return num;
}

function applyAuditValueFlag(
  args: readonly string[],
  index: number,
  arg: string,
  state: ParsedAuditArgs
): number | null {
  if (arg === FLAG_PROJECT_PATH || arg === FLAG_PROJECT_PATH_SHORT) {
    state.rawDir = readNextFlagValue(args, index, arg);
    return 1;
  }
  if (arg === FLAG_MODE || arg === FLAG_MODE_SHORT) {
    state.mode = assertInSet<AuditMode>(readNextFlagValue(args, index, arg), VALID_MODES, arg);
    return 1;
  }
  if (arg === FLAG_FORMAT || arg === FLAG_FORMAT_SHORT) {
    state.format = assertInSet<AuditFormat>(
      readNextFlagValue(args, index, arg),
      VALID_FORMATS,
      arg
    );
    return 1;
  }
  if (arg === FLAG_FAIL_ON) {
    state.failOn = assertInSet<FailOnLevel>(
      readNextFlagValue(args, index, arg),
      VALID_FAIL_ON,
      arg
    );
    return 1;
  }
  if (arg === FLAG_MAX_FINDINGS) {
    state.maxFindings = parsePositiveInt(readNextFlagValue(args, index, arg));
    return 1;
  }
  if (arg === FLAG_ARCH_PATH) {
    state.architecturePath = readNextFlagValue(args, index, arg);
    return 1;
  }
  return null;
}

function parseAuditArgs(args: readonly string[]): ParsedAuditArgs {
  const state: ParsedAuditArgs = {
    rawDir: undefined,
    mode: MODE_SECURITY,
    format: FORMAT_TEXT,
    failOn: FAIL_HIGH,
    includeExamples: false,
    maxFindings: undefined,
    architecturePath: undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    if (arg === FLAG_JSON) {
      state.format = FORMAT_JSON;
    } else if (arg === FLAG_SARIF) {
      state.format = FORMAT_SARIF;
    } else if (arg === FLAG_INCLUDE_EXAMPLES) {
      state.includeExamples = true;
    } else {
      const consumed = applyAuditValueFlag(args, i, arg, state);
      if (consumed !== null) {
        i += consumed;
      } else if (arg.startsWith('-')) {
        throw new Error(`Opción desconocida en audit: '${arg}'.`);
      } else if (state.rawDir !== undefined) {
        throw new Error(`Argumento posicional inesperado: '${arg}'.`);
      } else {
        state.rawDir = arg;
      }
    }
  }
  return state;
}

function appendSecuritySarif(security: SecurityAuditResult, out: SarifFindingInput[]): void {
  for (const f of security.findings) {
    out.push({
      ruleId: f.rule_id,
      severity: f.severity,
      message: `[${f.stig_owasp_ref}] ${f.message}`,
      file: f.file,
      line: f.line,
      remediation: f.remediation,
    });
  }
}

function appendPyramidSarif(pyramid: TestPyramidGapResult, out: SarifFindingInput[]): void {
  for (const orphan of pyramid.missing_test_inventory.orphan_source_files) {
    out.push({
      ruleId: 'PYRAMID-ORPHAN-FILE',
      severity: SEV_HIGH,
      message: `Archivo huérfano sin test unitario esperado (${orphan.expected_unit_test})`,
      file: orphan.source_file,
      line: 1,
    });
  }
  for (const api of pyramid.missing_test_inventory.untested_api_endpoints) {
    out.push({
      ruleId: 'PYRAMID-UNTESTED-API',
      severity: SEV_HIGH,
      message: `Endpoint API sin prueba BDD/contrato: ${api.method} ${api.path}`,
      file: api.source_file,
      line: api.line,
    });
  }
  for (const view of pyramid.missing_test_inventory.untested_ui_views) {
    out.push({
      ruleId: 'PYRAMID-UNTESTED-UI',
      severity: SEV_MEDIUM,
      message: `Vista UI sin cobertura completa (esperado: ${view.expected_unit_test})`,
      file: view.view_file,
      line: 1,
    });
  }
  for (const action of pyramid.prioritized_action_plan) {
    out.push({
      ruleId: `PYRAMID-L${String(action.layer_number).padStart(2, '0')}`,
      severity: action.priority,
      message: `${action.title}: ${action.action}`,
      file: pickAt(action.target_files_to_create, 0, '.'),
      line: 1,
      remediation: action.verification_command,
    });
  }
}

function appendVibeSarif(vibe: AuditVibePrototypeResult, out: SarifFindingInput[]): void {
  for (const vf of vibe.findings) {
    out.push({
      ruleId: vf.ruleId,
      severity: vf.severity,
      message: vf.message,
      file: vf.file,
      line: vf.line,
    });
  }
}

function appendCalmSarif(calm: CalmValidationResult, out: SarifFindingInput[]): void {
  for (const v of calm.violations) {
    out.push({
      ruleId: `CALM-${v.code}`,
      severity: SEV_HIGH,
      message: `[${v.subject}] ${v.message}`,
      file: calm.architecturePath,
      line: 1,
      remediation: v.remediation,
    });
  }
}

function collectSarifFindings(audits: ExecutedAudits): SarifFindingInput[] {
  const results: SarifFindingInput[] = [];
  if (audits.security) {
    appendSecuritySarif(audits.security, results);
  }
  if (audits.pyramid) {
    appendPyramidSarif(audits.pyramid, results);
  }
  if (audits.vibe) {
    appendVibeSarif(audits.vibe, results);
  }
  if (audits.calm) {
    appendCalmSarif(audits.calm, results);
  }
  return results;
}

function shouldFailAudit(
  failOn: FailOnLevel,
  sarifFindings: readonly SarifFindingInput[],
  audits: ExecutedAudits
): boolean {
  if (failOn === FAIL_NONE) {
    return false;
  }
  const hasCrit =
    sarifFindings.some((f) => f.severity === SEV_CRITICAL) ||
    (audits.security?.findings_count.CRITICAL ?? 0) > 0;
  const hasHigh =
    sarifFindings.some((f) => f.severity === SEV_HIGH) ||
    (audits.security?.findings_count.HIGH ?? 0) > 0;
  const hasMed =
    sarifFindings.some((f) => f.severity === SEV_MEDIUM) ||
    (audits.security?.findings_count.MEDIUM ?? 0) > 0;
  const calmInvalid = audits.calm !== undefined && !audits.calm.valid;

  if (failOn === FAIL_CRITICAL) {
    return hasCrit;
  }
  if (failOn === FAIL_HIGH) {
    return hasCrit || hasHigh || calmInvalid;
  }
  if (failOn === FAIL_MEDIUM) {
    return hasCrit || hasHigh || hasMed || calmInvalid;
  }
  return sarifFindings.length > 0 || calmInvalid || hasCrit || hasHigh || hasMed;
}

interface FormatAuditTextInput {
  readonly projectPath: string;
  readonly parsed: ParsedAuditArgs;
  readonly exitCode: number;
  readonly audits: ExecutedAudits;
  readonly sarifFindings: readonly SarifFindingInput[];
}

function formatAuditText(input: FormatAuditTextInput): string {
  const { projectPath, parsed, exitCode, audits, sarifFindings } = input;
  const icon = exitCode === 0 ? '✔' : '❌';
  const lines: string[] = [
    `${icon} [audit] mode=${parsed.mode} | fail-on=${parsed.failOn} | findings=${sarifFindings.length} | exitCode=${exitCode} | project=${projectPath}`,
  ];
  if (audits.security) {
    const c = audits.security.findings_count;
    lines.push(
      `  security: scanned=${audits.security.total_files_scanned} | CRITICAL=${c.CRITICAL} HIGH=${c.HIGH} MEDIUM=${c.MEDIUM}`
    );
  }
  if (audits.pyramid) {
    lines.push(
      `  pyramid: score=${audits.pyramid.pyramid_score_pct}% | covered=${audits.pyramid.summary_counts.covered} partial=${audits.pyramid.summary_counts.partial} missing=${audits.pyramid.summary_counts.missing}`
    );
  }
  if (audits.vibe) {
    lines.push(
      `  vibe: verdict=${audits.vibe.verdict} | score=${audits.vibe.score} | critical=${audits.vibe.counts.critical} high=${audits.vibe.counts.high} medium=${audits.vibe.counts.medium}`
    );
  }
  if (audits.calm_status) {
    const violationsCount = audits.calm ? audits.calm.violations.length : 0;
    lines.push(`  calm: status=${audits.calm_status} | violations=${violationsCount}`);
  }
  for (const item of sarifFindings.slice(0, 10)) {
    lines.push(`  - [${item.severity}] ${item.ruleId} (${item.file}:${item.line}): ${item.message}`);
  }
  return lines.join('\n');
}

async function executeRequestedAudits(
  projectPath: string,
  parsed: ParsedAuditArgs
): Promise<ExecutedAudits> {
  const runAll = parsed.mode === MODE_ALL;
  const security =
    runAll || parsed.mode === MODE_SECURITY
      ? await auditSecurityStigOwasp(projectPath, {
          maxFindings: parsed.maxFindings,
          includeExamples: parsed.includeExamples,
        })
      : undefined;
  const pyramid =
    runAll || parsed.mode === MODE_PYRAMID
      ? await auditTestPyramidGaps(projectPath, undefined, parsed.maxFindings)
      : undefined;
  const vibe =
    runAll || parsed.mode === MODE_VIBE
      ? auditVibePrototype({ targetDir: projectPath, workspaceRoot: projectPath, dryRun: true })
      : undefined;

  let calm: CalmValidationResult | undefined;
  let calmStatus: 'PASSED' | 'FAILED' | 'SKIPPED' | undefined;
  const defaultCalmExists = fs.existsSync(path.join(projectPath, DEFAULT_CALM_ARCHITECTURE_PATH));
  if (parsed.mode === MODE_CALM || (runAll && (parsed.architecturePath !== undefined || defaultCalmExists))) {
    calm = validateCalmArchitecture({
      workspaceRoot: projectPath,
      ...(parsed.architecturePath !== undefined
        ? { architecturePath: parsed.architecturePath }
        : {}),
    });
    calmStatus = calm.valid ? 'PASSED' : 'FAILED';
  } else if (runAll) {
    calmStatus = 'SKIPPED';
  }

  return {
    ...(security ? { security } : {}),
    ...(pyramid ? { pyramid } : {}),
    ...(vibe ? { vibe } : {}),
    ...(calm ? { calm } : {}),
    ...(calmStatus ? { calm_status: calmStatus } : {}),
  };
}

export async function runAuditCli(
  args: readonly string[],
  deps: { readonly cwd?: string } = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: AUDIT_HELP_TEXT };
  }
  try {
    const parsed = parseAuditArgs(args);
    const projectPath = resolveCliProjectPath(parsed.rawDir, deps.cwd ?? process.cwd());
    const audits = await executeRequestedAudits(projectPath, parsed);
    const sarifFindings = collectSarifFindings(audits);
    const exitCode = shouldFailAudit(parsed.failOn, sarifFindings, audits) ? 1 : 0;

    let output: string;
    if (parsed.format === FORMAT_SARIF) {
      output = formatCliJson(buildSarifLog(sarifFindings));
    } else if (parsed.format === FORMAT_JSON) {
      output = formatCliJson({
        project_path: projectPath,
        mode: parsed.mode,
        fail_on: parsed.failOn,
        exit_code: exitCode,
        ...audits,
      });
    } else {
      output = formatAuditText({ projectPath, parsed, exitCode, audits, sarifFindings });
    }

    return { exitCode, output };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
