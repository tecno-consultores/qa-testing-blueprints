// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import type {
  FindingConfidence,
  GroupedSecurityFinding,
  SecurityAuditResult,
  SecurityFinding,
  SuppressedSecurityFinding,
} from '../types.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { ingestExternalSarifReports } from '../utils/sarifIngester.js';
import {
  checkSec08Oshp, checkSec09Npmrc, checkSec11AuditSemanticIntegrity,
  checkUi11x01VisualGeometry, checkUi11x02DualRefreshAndSemanticElse, isNonHttpNodeCliEntry,
} from './security-auditor/auditAndNodeRules.js';
import {
  checkQaCiEscape01WorkflowExpansion, checkQaMakeCurdir01SubMakefile,
  checkQaStrykerCfg01, checkSecCiActionRef, checkSecWsPubsub01,
} from './security-auditor/ciStrykerWsRules.js';
import {
  checkSec01MassAssignment, checkSec02AntiCswsh, checkSec03CommandAndDeserialization,
  checkSec04Xxe, checkSec05UnicodeNfkc, checkSec06XssPrototypePollution,
  checkSec07SwaggerInProd, checkSec10Secrets,
} from './security-auditor/coreSecRules.js';
import {
  checkQaDockerLock01LockfileAndSmoke, checkQaMypy01StrictChain,
  checkQaPlaywrightPin01VersionParity, checkQaSsrHydration01DualScheme,
} from './security-auditor/dockerPlaywrightSsrRules.js';
import {
  checkQaContractSdk01RealTransport, checkQaHealth01ContainerHeartbeatContract,
} from './security-auditor/healthAndSdkRules.js';
import { checkUi11x03FaviconPwaAndEdgeHeaders } from './security-auditor/pwaAndEdgeRules.js';
import {
  checkQaCov01AddoptsBypass, checkQaKarateStaticIdempotency, checkQaPg17RlsInvalidCatalog,
  checkQaSmoke01SettingsSingletonSync, checkSec12McpServiceRbac, checkSec13RlsMultiTxPersistence,
  checkSec14WormDeterministicChain, checkSec15EphemeralProdPipelineCreds,
  checkSec16PreAuthMultiStepContinuity,
} from './security-auditor/rbacRlsWormRules.js';
import { collectFiles, normalizeExampleRelPath, type AuditSecurityOptions } from './security-auditor/shared.js';
import {
  checkQaCliTty01InteractiveHangGuard, checkQaDockerTty01NonInteractiveAndReadOnly,
  checkQaHealth01SupervisorTaskExit,
} from './security-auditor/ttyAndDockerRules.js';
import { checkQaDockerLoop01Containment } from './security-auditor/dockerLoopRules.js';

export { isNonHttpNodeCliEntry, type AuditSecurityOptions };

function checkProjectLevelRules(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  return [
    ...checkSec09Npmrc(projectPath),
    ...checkSec08Oshp(projectPath, allRelFiles),
    ...checkQaMypy01StrictChain(projectPath),
    ...checkQaHealth01ContainerHeartbeatContract(projectPath, allRelFiles, options),
    ...checkQaContractSdk01RealTransport(projectPath, allRelFiles),
    ...checkQaDockerLock01LockfileAndSmoke(projectPath, options),
    ...checkQaPlaywrightPin01VersionParity(projectPath, allRelFiles, options),
    ...checkQaSsrHydration01DualScheme(projectPath, allRelFiles),
    ...checkUi11x03FaviconPwaAndEdgeHeaders(projectPath, allRelFiles),
  ];
}

const HEURISTIC_CONFIDENCE_RULES = new Set([
  'SEC-01',
  'SEC-05',
  'SEC-06',
  'SEC-11',
  'UI-11X-01',
  'UI-11X-02',
]);

const HIGH_CONFIDENCE_RULES = new Set([
  'SEC-08',
  'SEC-09',
  'SEC-10',
  'SEC-CI-ACTION-REF',
  'QA-COV-01',
  'QA-MYPY-01',
  'QA-PG17-RLS',
  'QA-DOCKER-LOCK-01',
  'QA-DOCKER-LOOP-01',
  'QA-DOCKER-TTY-01',
  'QA-PLAYWRIGHT-PIN-01',
  'QA-MAKE-CURDIR-01',
  'QA-CI-ESCAPE-01',
  'QA-STRYKER-CFG-01',
  'UI-11X-03',
]);

const QA_11X_IGNORE_MARKER = 'qa-11x-ignore';
const MIN_IGNORE_REASON_CHARS = 12;

function resolveRuleConfidence(ruleId: string, existing?: FindingConfidence): FindingConfidence {
  if (existing) return existing;
  if (HIGH_CONFIDENCE_RULES.has(ruleId) || ruleId.startsWith('SARIF:')) return 'HIGH';
  if (HEURISTIC_CONFIDENCE_RULES.has(ruleId)) return 'HEURISTIC';
  return 'MEDIUM';
}

function enrichFindingMetadata(finding: SecurityFinding): SecurityFinding {
  return {
    ...finding,
    confidence: resolveRuleConfidence(finding.rule_id, finding.confidence),
    source: finding.source ?? 'qa-11x-native',
  };
}

function stripTrailingCommentCloser(raw: string): string {
  let out = raw.trim();
  if (out.endsWith('*/')) {
    out = out.slice(0, -2).trim();
  } else if (out.endsWith('-->')) {
    out = out.slice(0, -3).trim();
  }
  return out;
}

function matchInlineSuppressionReason(lineText: string, ruleId: string): string | null {
  const lower = lineText.toLowerCase();
  const markerIdx = lower.indexOf(QA_11X_IGNORE_MARKER);
  if (markerIdx === -1) return null;
  const afterMarker = lineText.slice(markerIdx + QA_11X_IGNORE_MARKER.length);
  const colonIdx = afterMarker.indexOf(':');
  if (colonIdx === -1) return null;
  const rulesSegment = afterMarker.slice(0, colonIdx).trim();
  const reason = stripTrailingCommentCloser(afterMarker.slice(colonIdx + 1));
  if (rulesSegment.length === 0 || reason.length < MIN_IGNORE_REASON_CHARS) return null;
  const declaredRules = rulesSegment
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return declaredRules.includes(ruleId.toUpperCase()) ? reason : null;
}

function partitionInlineSuppressions(
  findings: readonly SecurityFinding[],
  lines: readonly string[]
): { active: SecurityFinding[]; suppressed: SuppressedSecurityFinding[] } {
  const active: SecurityFinding[] = [];
  const suppressed: SuppressedSecurityFinding[] = [];
  for (const item of findings) {
    const lineText = item.line >= 1 && item.line <= lines.length ? (lines[item.line - 1] ?? '') : '';
    const justification = matchInlineSuppressionReason(lineText, item.rule_id);
    if (justification !== null) {
      suppressed.push({
        rule_id: item.rule_id,
        file: item.file,
        line: item.line,
        justification,
      });
    } else {
      active.push(item);
    }
  }
  return { active, suppressed };
}

function scanSingleFile(
  absPath: string,
  relPath: string,
  options?: AuditSecurityOptions
): { active: SecurityFinding[]; suppressed: SuppressedSecurityFinding[] } {
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err: unknown) {
    // Archivo inaccesible o enlace simbólico roto durante recorrido del proyecto; omitir solo ese archivo
    reportDebugCatchError('security-auditor.scanSingleFile', err);
    return { active: [], suppressed: [] };
  }

  const lines = content.split(/\r?\n/);
  const effectiveRel = normalizeExampleRelPath(relPath, options);
  const rawFindings = [
    ...checkSec01MassAssignment(effectiveRel, lines),
    ...checkSec02AntiCswsh(effectiveRel, lines),
    ...checkSec03CommandAndDeserialization(effectiveRel, lines),
    ...checkSec04Xxe(effectiveRel, lines),
    ...checkSec05UnicodeNfkc(effectiveRel, lines),
    ...checkSec06XssPrototypePollution(effectiveRel, lines),
    ...checkSec07SwaggerInProd(effectiveRel, lines),
    ...checkSec10Secrets(effectiveRel, lines, Boolean(options?.includeExamples)),
    ...checkSec11AuditSemanticIntegrity(effectiveRel, lines),
    ...checkSec12McpServiceRbac(effectiveRel, lines),
    ...checkSec13RlsMultiTxPersistence(effectiveRel, lines),
    ...checkSec14WormDeterministicChain(effectiveRel, lines),
    ...checkSec15EphemeralProdPipelineCreds(effectiveRel, lines),
    ...checkSec16PreAuthMultiStepContinuity(effectiveRel, lines),
    ...checkSecCiActionRef(effectiveRel, lines),
    ...checkQaCiEscape01WorkflowExpansion(effectiveRel, lines),
    ...checkQaMakeCurdir01SubMakefile(effectiveRel, lines),
    ...checkQaCov01AddoptsBypass(effectiveRel, lines),
    ...checkQaPg17RlsInvalidCatalog(effectiveRel, lines),
    ...checkQaSmoke01SettingsSingletonSync(effectiveRel, lines),
    ...checkQaHealth01SupervisorTaskExit(effectiveRel, lines),
    ...checkQaCliTty01InteractiveHangGuard(effectiveRel, lines),
    ...checkQaDockerTty01NonInteractiveAndReadOnly(effectiveRel, lines),
    ...checkQaDockerLoop01Containment(effectiveRel, lines),
    ...checkQaKarateStaticIdempotency(effectiveRel, lines),
    ...checkUi11x01VisualGeometry(effectiveRel, lines),
    ...checkUi11x02DualRefreshAndSemanticElse(effectiveRel, lines),
    ...checkQaStrykerCfg01(effectiveRel, lines),
    ...checkSecWsPubsub01(effectiveRel, lines),
  ];
  const normalized =
    effectiveRel === relPath
      ? rawFindings
      : rawFindings.map((finding) =>
          finding.file === effectiveRel ? { ...finding, file: relPath } : finding
        );
  return partitionInlineSuppressions(normalized, lines);
}

function countSeverities(findings: SecurityFinding[]): {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
} {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) {
    if (f.severity in counts) {
      counts[f.severity]++;
    }
  }
  return counts;
}

export function groupFindingsByRule(
  findings: SecurityFinding[],
  maxLocationsPerRule = 15
): GroupedSecurityFinding[] {
  const groups = new Map<string, GroupedSecurityFinding>();

  for (const f of findings) {
    const existing = groups.get(f.rule_id);
    const loc = `${f.file}:${f.line}`;
    if (!existing) {
      groups.set(f.rule_id, {
        rule_id: f.rule_id,
        severity: f.severity,
        confidence: resolveRuleConfidence(f.rule_id, f.confidence),
        stig_owasp_ref: f.stig_owasp_ref,
        message: f.message,
        remediation: f.remediation,
        occurrences_count: 1,
        locations: [loc],
      });
    } else {
      existing.occurrences_count++;
      if (existing.locations.length < maxLocationsPerRule) {
        existing.locations.push(loc);
      }
    }
  }

  return Array.from(groups.values());
}


const SEVERITY_SORT_RANK: Readonly<Record<SecurityFinding['severity'], number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function sortFindingsBySeverity(findings: SecurityFinding[]): SecurityFinding[] {
  return [...findings].sort((a, b) => SEVERITY_SORT_RANK[a.severity] - SEVERITY_SORT_RANK[b.severity]);
}

function resolveAuditSecurityFlags(
  maxFindingsOrOptions?: number | AuditSecurityOptions,
  extraOptions?: Omit<AuditSecurityOptions, 'maxFindings'>
): { maxFindings?: number; includeExamples: boolean; ingestExternalSarif: boolean } {
  const objOpts = typeof maxFindingsOrOptions === 'object' ? maxFindingsOrOptions : undefined;
  return {
    maxFindings: typeof maxFindingsOrOptions === 'number' ? maxFindingsOrOptions : objOpts?.maxFindings,
    includeExamples: objOpts?.includeExamples ?? extraOptions?.includeExamples ?? false,
    ingestExternalSarif: objOpts?.ingestExternalSarif ?? extraOptions?.ingestExternalSarif ?? true,
  };
}

/**
 * Tool 5: audit_security_stig_owasp
 * Audita estáticamente el código fuente frente a los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
 */
export async function auditSecurityStigOwasp(
  projectPath: string,
  maxFindingsOrOptions?: number | AuditSecurityOptions,
  extraOptions?: Omit<AuditSecurityOptions, 'maxFindings'>
): Promise<SecurityAuditResult> {
  const { maxFindings, includeExamples, ingestExternalSarif } = resolveAuditSecurityFlags(
    maxFindingsOrOptions,
    extraOptions
  );

  return Promise.resolve().then(() => {
    const resolvedPath = resolveSafeProjectPath(projectPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error(`La ruta del proyecto no existe o no es un directorio: ${resolvedPath}`);
    }
    const auditOptions: AuditSecurityOptions = { includeExamples, ingestExternalSarif };
    const allAbsoluteFiles = collectFiles(resolvedPath, auditOptions);
    const allRelFiles = allAbsoluteFiles.map((abs) => path.relative(resolvedPath, abs));
    const rawFindings: SecurityFinding[] = [];
    const suppressedFindings: SuppressedSecurityFinding[] = [];

    for (const [i, absPath] of allAbsoluteFiles.entries()) {
      const scanned = scanSingleFile(absPath, pickAt(allRelFiles, i), auditOptions);
      rawFindings.push(...scanned.active);
      suppressedFindings.push(...scanned.suppressed);
    }

    rawFindings.push(...checkProjectLevelRules(resolvedPath, allRelFiles, auditOptions));
    const sarifSummary = ingestExternalSarif
      ? ingestExternalSarifReports(resolvedPath)
      : { files_ingested: [], skipped_files: [], findings: [] };
    rawFindings.push(...sarifSummary.findings);

    const findings = sortFindingsBySeverity(rawFindings.map((f) => enrichFindingMetadata(f)));

    const counts = countSeverities(findings);
    const passed = counts.CRITICAL === 0 && counts.HIGH === 0;
    const groupedFindings = groupFindingsByRule(findings);

    let returnedFindings = findings;
    let truncatedCount: number | undefined;

    if (typeof maxFindings === 'number' && maxFindings >= 0 && findings.length > maxFindings) {
      returnedFindings = findings.slice(0, maxFindings);
      truncatedCount = findings.length - maxFindings;
    }

    return {
      project_path: resolvedPath,
      passed,
      total_files_scanned: allAbsoluteFiles.length,
      findings_count: counts,
      findings: returnedFindings,
      grouped_findings: groupedFindings,
      ...(truncatedCount !== undefined ? { truncated_findings_count: truncatedCount } : {}),
      ...(suppressedFindings.length > 0
        ? {
            suppressed_findings_count: suppressedFindings.length,
            suppressed_findings: suppressedFindings,
          }
        : {}),
      ...(sarifSummary.files_ingested.length > 0
        ? { external_sarif_files: sarifSummary.files_ingested }
        : {}),
    };
  });
}
