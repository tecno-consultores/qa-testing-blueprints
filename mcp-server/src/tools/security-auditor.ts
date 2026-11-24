// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import type { GroupedSecurityFinding, SecurityAuditResult, SecurityFinding } from '../types.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
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

function scanSingleFile(
  absPath: string,
  relPath: string,
  options?: AuditSecurityOptions
): SecurityFinding[] {
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err: unknown) {
    // Archivo inaccesible o enlace simbólico roto durante recorrido del proyecto; omitir solo ese archivo
    reportDebugCatchError('security-auditor.scanSingleFile', err);
    return [];
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
    ...checkSec10Secrets(effectiveRel, lines),
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
    ...checkQaKarateStaticIdempotency(effectiveRel, lines),
    ...checkUi11x01VisualGeometry(effectiveRel, lines),
    ...checkUi11x02DualRefreshAndSemanticElse(effectiveRel, lines),
    ...checkQaStrykerCfg01(effectiveRel, lines),
    ...checkSecWsPubsub01(effectiveRel, lines),
  ];
  return effectiveRel === relPath
    ? rawFindings
    : rawFindings.map((finding) =>
        finding.file === effectiveRel ? { ...finding, file: relPath } : finding
      );
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

/**
 * Tool 5: audit_security_stig_owasp
 * Audita estáticamente el código fuente frente a los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
 */
export async function auditSecurityStigOwasp(
  projectPath: string,
  maxFindingsOrOptions?: number | AuditSecurityOptions,
  extraOptions?: Omit<AuditSecurityOptions, 'maxFindings'>
): Promise<SecurityAuditResult> {
  const maxFindings =
    typeof maxFindingsOrOptions === 'number'
      ? maxFindingsOrOptions
      : maxFindingsOrOptions?.maxFindings;
  const includeExamples =
    (typeof maxFindingsOrOptions === 'object' ? maxFindingsOrOptions?.includeExamples : undefined) ??
    extraOptions?.includeExamples ??
    false;

  return Promise.resolve().then(() => {
    const resolvedPath = resolveSafeProjectPath(projectPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error(`La ruta del proyecto no existe o no es un directorio: ${resolvedPath}`);
    }
    const auditOptions: AuditSecurityOptions = { includeExamples };
    const allAbsoluteFiles = collectFiles(resolvedPath, auditOptions);
    const allRelFiles = allAbsoluteFiles.map((abs) => path.relative(resolvedPath, abs));
    const rawFindings: SecurityFinding[] = [];

    for (const [i, absPath] of allAbsoluteFiles.entries()) {
      rawFindings.push(...scanSingleFile(absPath, pickAt(allRelFiles, i), auditOptions));
    }

    rawFindings.push(...checkProjectLevelRules(resolvedPath, allRelFiles, auditOptions));
    const findings = sortFindingsBySeverity(rawFindings);

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
    };
  });
}
