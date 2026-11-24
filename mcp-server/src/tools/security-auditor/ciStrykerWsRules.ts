// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  DOUBLE_DOLLAR_CI_RE, MAKEFILE_NAMES, MAKE_PWD_VAR_RE, MUTABLE_BRANCH_RE,
  QA_CI_ESCAPE_01_REF, QA_CI_ESCAPE_OK_PRAGMA, QA_CI_ESCAPE_REMEDIATION,
  QA_MAKE_CURDIR_01_REF, QA_MAKE_CURDIR_OK_PRAGMA, QA_MAKE_CURDIR_REMEDIATION,
  QA_STRYKER_CFG_REF, QA_STRYKER_CFG_RULE, QA_STRYKER_CFG_OK_PRAGMA,
  SEC_CI_ACTION_OK_PRAGMA, SEC_CI_ACTION_REF_REF, SEC_CI_ACTION_REMEDIATION,
  SEC_WS_PUBSUB_OK_PRAGMA, SEC_WS_PUBSUB_REF, SEC_WS_PUBSUB_RULE, SHA40_RE,
  UNPREFIXED_SEMVER_RE, WS_PUBSUB_TENANT_MARKERS,
  isAuditorSelfDefinition, isGithubWorkflowOrActionFile, isTestFilePath, parseJsonObjectTextSafe,
} from './shared.js';


function stripWrappingQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function stripInlineYamlComment(rawRest: string): string {
  for (let i = 1; i < rawRest.length; i++) {
    if (rawRest[i] === '#' && /\s/.test(pickAt(rawRest, i - 1))) {
      return rawRest.slice(0, i).trim();
    }
  }
  return rawRest;
}

function extractThirdPartyActionTarget(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const isSeqItem = trimmed.startsWith('-') && /\s/.test(pickAt(trimmed, 1));
  const candidate = isSeqItem ? trimmed.slice(1).trimStart() : trimmed;
  if (!candidate.startsWith('uses')) return null;
  const afterUses = candidate.slice(4).trimStart();
  if (!afterUses.startsWith(':')) return null;
  const rawRest = afterUses.slice(1).trim();
  const withoutComment = stripInlineYamlComment(rawRest);
  const rawTarget = stripWrappingQuotes(withoutComment);
  if (
    !rawTarget ||
    rawTarget.startsWith('./') ||
    rawTarget.startsWith('../') ||
    rawTarget.startsWith('docker://')
  ) {
    return null;
  }
  return rawTarget;
}

function describeUnpinnedActionRef(rawTarget: string): string | null {
  const atIdx = rawTarget.lastIndexOf('@');
  if (atIdx <= 0) {
    return `La directiva uses: '${rawTarget}' omite referencia inmutable por commit SHA de 40 caracteres.`;
  }
  const ref = rawTarget.slice(atIdx + 1);
  if (SHA40_RE.test(ref)) return null;
  if (rawTarget.startsWith('aquasecurity/trivy-action@') && UNPREFIXED_SEMVER_RE.test(ref)) {
    return `La acción '${rawTarget}' usa una etiqueta sin prefijo 'v' (@${ref}) eliminada aguas arriba en aquasecurity/trivy-action; debe fijarse mediante commit SHA de 40 caracteres (# vX.Y.Z).`;
  }
  if (MUTABLE_BRANCH_RE.test(ref)) {
    return `La acción '${rawTarget}' referencia una rama/etiqueta mutable (@${ref}) en lugar de un commit SHA de 40 caracteres.`;
  }
  return `La acción '${rawTarget}' usa una etiqueta semántica mutable (@${ref}) en lugar de un hash SHA de 40 caracteres.`;
}

export function checkSecCiActionRef(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isGithubWorkflowOrActionFile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(SEC_CI_ACTION_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
    if (line.includes(SEC_CI_ACTION_OK_PRAGMA) || prevLine.includes(SEC_CI_ACTION_OK_PRAGMA)) {
      continue;
    }
    const rawTarget = extractThirdPartyActionTarget(line);
    if (!rawTarget) continue;
    const message = describeUnpinnedActionRef(rawTarget);
    if (!message) continue;
    findings.push({
      rule_id: 'SEC-CI-ACTION-REF',
      severity: 'HIGH',
      stig_owasp_ref: SEC_CI_ACTION_REF_REF,
      file: relPath,
      line: i + 1,
      message,
      remediation: SEC_CI_ACTION_REMEDIATION,
    });
  }
  return findings;
}

function isLineCommentOrPragmaExempt(line: string, prevLine: string, pragma: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) return true;
  return line.includes(pragma) || prevLine.includes(pragma);
}

export function checkQaCiEscape01WorkflowExpansion(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (!isGithubWorkflowOrActionFile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(QA_CI_ESCAPE_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
    if (isLineCommentOrPragmaExempt(line, prevLine, QA_CI_ESCAPE_OK_PRAGMA)) continue;
    if (!DOUBLE_DOLLAR_CI_RE.test(line)) continue;
    findings.push({
      rule_id: 'QA-CI-ESCAPE-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_CI_ESCAPE_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Escape de doble dólar $$(...) / $${...} estilo Makefile o Compose detectado en workflow/action de GitHub Actions: bash expande $$ al PID del proceso (<PID>(pwd)), rompiendo montajes Docker con exit code 125.',
      remediation: QA_CI_ESCAPE_REMEDIATION,
    });
  }
  return findings;
}

function isSubdirectoryMakefile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  const clean = norm.startsWith('./') ? norm.slice(2) : norm;
  if (isTestFilePath(clean) || isAuditorSelfDefinition(clean)) return false;
  const parts = clean.split('/');
  if (parts.length < 2) return false;
  const fileName = pickAt(parts, parts.length - 1);
  return MAKEFILE_NAMES.has(fileName);
}

function countPrecedingDollars(text: string, index: number): number {
  let count = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === '$') {
    count++;
    cursor--;
  }
  return count;
}

function hasUnescapedMakePwdVar(line: string): boolean {
  MAKE_PWD_VAR_RE.lastIndex = 0;
  for (const match of line.matchAll(MAKE_PWD_VAR_RE)) {
    const idx = match.index;
    if (countPrecedingDollars(line, idx) % 2 === 0) {
      return true;
    }
  }
  return false;
}

function isStrykerConfigPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return /(?:^|\/)stryker\.conf(?:ig)?\.(?:json|js|mjs|cjs)$/i.test(norm);
}

function hasStrykerIgnoreStaticTrue(
  doc: Record<string, unknown> | null,
  fullText: string
): boolean {
  if (doc) {
    return doc.ignoreStatic === true;
  }
  return /["']?ignoreStatic["']?\s{0,4}:\s{0,4}true\b/.test(fullText);
}

function hasBoundedStrykerConcurrency(
  doc: Record<string, unknown> | null,
  fullText: string
): boolean {
  if (doc) {
    return typeof doc.concurrency === 'number' && doc.concurrency >= 1 && doc.concurrency <= 4;
  }
  if (/CPUS|nproc|STRYKER_CONCURRENCY/i.test(fullText)) {
    return true;
  }
  const match = /\bconcurrency\s{0,4}:\s{0,4}(\d+)/.exec(fullText);
  return match ? Number(match[1]) >= 1 && Number(match[1]) <= 4 : false;
}

function hasStrykerNegatedTestGlob(patterns: readonly unknown[]): boolean {
  return patterns.some(
    (entry) =>
      typeof entry === 'string' &&
      entry.startsWith('!') &&
      (entry.includes('unit') || entry.includes('spec') || entry.includes('test'))
  );
}

function hasStrykerTestExclusions(doc: Record<string, unknown> | null, fullText: string): boolean {
  if (doc) {
    return !Array.isArray(doc.mutate) || hasStrykerNegatedTestGlob(doc.mutate);
  }
  const mutateIdx = fullText.indexOf('mutate');
  if (mutateIdx === -1) {
    return true;
  }
  const slice = fullText.slice(mutateIdx);
  return slice.includes('!') && (slice.includes('unit') || slice.includes('spec') || slice.includes('test'));
}

export function checkQaStrykerCfg01(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isStrykerConfigPath(relPath) || isTestFilePath(relPath)) {
    return [];
  }
  const fullText = lines.join('\n');
  if (fullText.includes(QA_STRYKER_CFG_OK_PRAGMA)) {
    return [];
  }
  const doc = relPath.endsWith('.json') ? parseJsonObjectTextSafe(fullText) : null;
  const gaps: string[] = [];
  if (!hasStrykerIgnoreStaticTrue(doc, fullText)) {
    gaps.push('"ignoreStatic": true');
  }
  if (!hasBoundedStrykerConcurrency(doc, fullText)) {
    gaps.push('"concurrency" acotado (<= 4)');
  }
  if (!hasStrykerTestExclusions(doc, fullText)) {
    gaps.push('exclusión "!src/**/*.{unit,spec,test}.*" en "mutate"');
  }
  if (gaps.length === 0) {
    return [];
  }
  return [
    {
      rule_id: QA_STRYKER_CFG_RULE,
      severity: 'MEDIUM',
      stig_owasp_ref: QA_STRYKER_CFG_REF,
      file: relPath,
      line: 1,
      message: `Configuración Stryker omite estabilidad en contenedores: falta ${gaps.join(' y ')}.`,
      remediation: `Establecer "ignoreStatic": true, "concurrency": 4 (o <= 4) y exclusión "!src/**/*.{unit,spec,test}.*" en mutate (o eximir con ${QA_STRYKER_CFG_OK_PRAGMA}).`,
    },
  ];
}

const PUBSUB_SINK_SUBSTRINGS = [
  'pubsub.subscribe(',
  'pubsub.psubscribe(',
  '.psubscribe(',
  'ws_manager.broadcast(',
  'manager.broadcast(',
  'broadcast_all(',
  '.clients.forEach(',
];

function isPubSubBroadcastLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return false;
  }
  return PUBSUB_SINK_SUBSTRINGS.some((needle) => trimmed.includes(needle));
}

function hasTenantScopeInWindow(lines: readonly string[], centerIdx: number): boolean {
  const start = Math.max(0, centerIdx - 12);
  const end = Math.min(lines.length, centerIdx + 25);
  const windowText = lines.slice(start, end).join('\n');
  return WS_PUBSUB_TENANT_MARKERS.some((marker) => windowText.includes(marker));
}

function findFirstSubstringLine(lines: readonly string[], needle: string): number {
  const idx = lines.findIndex((ln) => ln.includes(needle));
  return idx + 1;
}

function hasFinallyPubsubClose(fullText: string): boolean {
  const finallyIdx = fullText.indexOf('finally:');
  if (finallyIdx === -1) {
    return false;
  }
  const tail = fullText.slice(finallyIdx);
  return tail.includes('.aclose(') || tail.includes('.close(');
}

function checkPythonWsPubsubFinallyLeak(
  relPath: string,
  lines: readonly string[]
): SecurityFinding[] {
  if (!relPath.toLowerCase().endsWith('.py')) {
    return [];
  }
  const fullText = lines.join('\n');
  if (fullText.includes(SEC_WS_PUBSUB_OK_PRAGMA)) {
    return [];
  }
  if (!fullText.includes('WebSocket') || !fullText.includes('.pubsub(') || hasFinallyPubsubClose(fullText)) {
    return [];
  }
  return [
    {
      rule_id: SEC_WS_PUBSUB_RULE,
      severity: 'HIGH',
      stig_owasp_ref: SEC_WS_PUBSUB_REF,
      file: relPath,
      line: findFirstSubstringLine(lines, '.pubsub('),
      message:
        'Endpoint WebSocket + Redis/KeyDB .pubsub() sin cierre garantizado pubsub.aclose()/close() dentro de try/finally (riesgo de fuga del pool en suites E2E secuenciales).',
      remediation: `Ejecutar watcher ws.receive() desacoplado y garantizar await pubsub.aclose() dentro de finally: (o eximir con ${SEC_WS_PUBSUB_OK_PRAGMA}).`,
    },
  ];
}

export function checkSecWsPubsub01(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    isTestFilePath(relPath) ||
    isAuditorSelfDefinition(relPath) ||
    !/\.(?:py|ts|js|php)$/i.test(relPath)
  ) {
    return [];
  }
  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
    if (isLineCommentOrPragmaExempt(line, prevLine, SEC_WS_PUBSUB_OK_PRAGMA)) {
      continue;
    }
    if (!isPubSubBroadcastLine(line) || hasTenantScopeInWindow(lines, i)) {
      continue;
    }
    findings.push({
      rule_id: SEC_WS_PUBSUB_RULE,
      severity: 'HIGH',
      stig_owasp_ref: SEC_WS_PUBSUB_REF,
      file: relPath,
      line: i + 1,
      message:
        'Difusión WebSocket o suscripción Pub/Sub Redis/KeyDB sin validación ni prefijo de aislamiento multi-tenant (tenant_id/org_id), con riesgo de fuga cross-tenant.',
      remediation: `Prefijar canales con identificador de tenant (ej. f"ws:{tenant_id}:events") y verificar tenant_id/org_id por socket antes de reenviar mensajes (o eximir con ${SEC_WS_PUBSUB_OK_PRAGMA}).`,
    });
  }
  findings.push(...checkPythonWsPubsubFinallyLeak(relPath, lines));
  return findings;
}

export function checkQaMakeCurdir01SubMakefile(relPath: string, lines: string[]): SecurityFinding[] {
  if (!isSubdirectoryMakefile(relPath)) return [];
  if (lines.slice(0, 5).some((l) => l.includes(QA_MAKE_CURDIR_OK_PRAGMA))) return [];

  const findings: SecurityFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const prevLine = pickAt(lines, i - 1);
    if (isLineCommentOrPragmaExempt(line, prevLine, QA_MAKE_CURDIR_OK_PRAGMA)) continue;
    if (!hasUnescapedMakePwdVar(line)) continue;
    findings.push({
      rule_id: 'QA-MAKE-CURDIR-01',
      severity: 'HIGH',
      stig_owasp_ref: QA_MAKE_CURDIR_01_REF,
      file: relPath,
      line: i + 1,
      message:
        'Sub-Makefile referencia $(PWD) / ${PWD} en lugar de $(CURDIR): al invocarse con $(MAKE) -C <subdir>, GNU Make conserva el PWD del directorio padre y expone rutas fuera del subproyecto.',
      remediation: QA_MAKE_CURDIR_REMEDIATION,
    });
  }
  return findings;
}

