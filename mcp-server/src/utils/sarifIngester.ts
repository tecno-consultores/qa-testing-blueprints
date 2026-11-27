// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSymlinkSegments } from '../security/pathRealResolver.js';
import { redactPiiAndSecrets } from '../security/promptGuard.js';
import { resolveSafeChildPath } from '../services/github-fetcher.js';
import type { SecurityFinding } from '../types.js';

export const DEFAULT_SARIF_CACHE_REL_DIR = '.agents/.cache/sarif';
export const MAX_SARIF_FILE_BYTES = 10 * 1024 * 1024;
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTAINER_PREFIXES = ['/app/', '/workspace/', '/repo/'] as const;
const FILE_URI_PREFIX = 'file://';
const UNKNOWN_FILE = 'unknown';
const UTF8_ENCODING = 'utf-8';

export interface ExternalSarifIngestSummary {
  readonly files_ingested: string[];
  readonly skipped_files: string[];
  readonly findings: SecurityFinding[];
}

interface SarifRuleInfo {
  readonly securitySeverity?: number;
  readonly helpText?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFiniteFloat(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function mapCvssSeverity(score: number): SecurityFinding['severity'] {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  return 'LOW';
}

function mapSarifLevel(level: unknown): SecurityFinding['severity'] {
  const norm = typeof level === 'string' ? level.toLowerCase() : '';
  if (norm === 'error') return 'HIGH';
  if (norm === 'warning') return 'MEDIUM';
  return 'LOW';
}

function normalizeEngineName(rawName: unknown, fileName: string): string {
  const base =
    typeof rawName === 'string' && rawName.trim().length > 0
      ? rawName.trim()
      : path.basename(fileName, path.extname(fileName));
  const lower = base.toLowerCase();
  if (lower.includes('semgrep')) return 'semgrep';
  if (lower.includes('trivy')) return 'trivy';
  if (lower.includes('codeql')) return 'codeql';
  if (lower.includes('bandit')) return 'bandit';
  return lower.replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'external';
}

function safeDecodeUri(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeArtifactFile(projectRoot: string, rawUri: unknown): string {
  if (typeof rawUri !== 'string' || rawUri.trim().length === 0) {
    return UNKNOWN_FILE;
  }
  let candidate = safeDecodeUri(rawUri.trim());
  if (candidate.startsWith(FILE_URI_PREFIX)) {
    candidate = candidate.slice(FILE_URI_PREFIX.length);
  }
  if (candidate.includes('\0')) {
    return UNKNOWN_FILE;
  }
  for (const prefix of CONTAINER_PREFIXES) {
    if (candidate.startsWith(prefix)) {
      candidate = candidate.slice(prefix.length);
      break;
    }
  }
  const resolvedRoot = path.resolve(projectRoot);
  const full = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(resolvedRoot, candidate);
  const rel = path.relative(resolvedRoot, full);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return UNKNOWN_FILE;
  }
  return rel.split(path.sep).join('/');
}

function resolveRuleHelpText(entry: Record<string, unknown>): string | undefined {
  const help = isPlainRecord(entry.help) ? entry.help : null;
  if (typeof help?.text === 'string') {
    return help.text;
  }
  const shortDesc = isPlainRecord(entry.shortDescription) ? entry.shortDescription : null;
  return typeof shortDesc?.text === 'string' ? shortDesc.text : undefined;
}

function extractRuleDriverRules(runObj: Record<string, unknown>): unknown[] {
  const tool = isPlainRecord(runObj.tool) ? runObj.tool : null;
  const driver = tool && isPlainRecord(tool.driver) ? tool.driver : null;
  return driver && Array.isArray(driver.rules) ? (driver.rules as unknown[]) : [];
}

function buildRuleInfoMap(runObj: Record<string, unknown>): Map<string, SarifRuleInfo> {
  const map = new Map<string, SarifRuleInfo>();
  for (const entry of extractRuleDriverRules(runObj)) {
    if (!isPlainRecord(entry) || typeof entry.id !== 'string' || entry.id.trim().length === 0) {
      continue;
    }
    const props = isPlainRecord(entry.properties) ? entry.properties : null;
    map.set(entry.id, {
      securitySeverity: parseFiniteFloat(props?.['security-severity']),
      helpText: resolveRuleHelpText(entry),
    });
  }
  return map;
}

function extractLocation(
  projectRoot: string,
  resultObj: Record<string, unknown>
): { readonly file: string; readonly line: number } {
  const locations = Array.isArray(resultObj.locations) ? (resultObj.locations as unknown[]) : [];
  const firstLoc = locations.length > 0 && isPlainRecord(locations[0]) ? locations[0] : null;
  const phys =
    firstLoc && isPlainRecord(firstLoc.physicalLocation) ? firstLoc.physicalLocation : null;
  const artifact = phys && isPlainRecord(phys.artifactLocation) ? phys.artifactLocation : null;
  const region = phys && isPlainRecord(phys.region) ? phys.region : null;
  const rawLine = typeof region?.startLine === 'number' ? Math.trunc(region.startLine) : 1;
  return {
    file: normalizeArtifactFile(projectRoot, artifact?.uri),
    line: rawLine >= 1 ? rawLine : 1,
  };
}

function resolveResultSeverity(
  rawItem: Record<string, unknown>,
  meta: SarifRuleInfo | undefined
): SecurityFinding['severity'] {
  const props = isPlainRecord(rawItem.properties) ? rawItem.properties : null;
  const cvss = parseFiniteFloat(props?.['security-severity']) ?? meta?.securitySeverity;
  return cvss !== undefined ? mapCvssSeverity(cvss) : mapSarifLevel(rawItem.level);
}

function resolveResultMessage(
  rawItem: Record<string, unknown>,
  sourceEngine: string,
  rawRuleId: string
): string {
  const msgObj = isPlainRecord(rawItem.message) ? rawItem.message : null;
  if (typeof msgObj?.text === 'string' && msgObj.text.trim().length > 0) {
    return msgObj.text.trim();
  }
  return `Hallazgo SARIF reportado por ${sourceEngine} (${rawRuleId}).`;
}

function convertResultItem(
  projectRoot: string,
  sourceEngine: string,
  ruleMap: Map<string, SarifRuleInfo>,
  rawItem: unknown
): SecurityFinding | null {
  if (!isPlainRecord(rawItem) || rawItem.baselineState === 'absent') {
    return null;
  }
  const rawRuleId =
    typeof rawItem.ruleId === 'string' && rawItem.ruleId.trim().length > 0
      ? rawItem.ruleId.trim()
      : 'unknown-rule';
  const ruleId = rawRuleId.startsWith('SARIF:') ? rawRuleId : `SARIF:${sourceEngine}:${rawRuleId}`;
  const meta = ruleMap.get(rawRuleId);
  const location = extractLocation(projectRoot, rawItem);
  const rawMsg = resolveResultMessage(rawItem, sourceEngine, rawRuleId);
  const rawRem =
    meta?.helpText ??
    `Revisar y corregir el hallazgo ${rawRuleId} detectado por ${sourceEngine} en ${location.file}:${location.line}.`;

  return {
    rule_id: ruleId,
    severity: resolveResultSeverity(rawItem, meta),
    confidence: 'HIGH',
    source: sourceEngine,
    stig_owasp_ref: `SARIF 2.1.0 (${sourceEngine})`,
    file: location.file,
    line: location.line,
    message: redactPiiAndSecrets(rawMsg),
    remediation: redactPiiAndSecrets(rawRem),
  };
}

function parseSarifSafe(rawText: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(rawText, (key, value: unknown) =>
      FORBIDDEN_JSON_KEYS.has(key) ? undefined : value
    );
    if (!isPlainRecord(parsed) || !Array.isArray(parsed.runs)) {
      return null;
    }
    return parsed.runs as unknown[];
  } catch {
    return null;
  }
}

function collectRunFindings(
  resolvedRoot: string,
  filePath: string,
  runRaw: unknown
): SecurityFinding[] {
  if (!isPlainRecord(runRaw)) {
    return [];
  }
  const tool = isPlainRecord(runRaw.tool) ? runRaw.tool : null;
  const driver = tool && isPlainRecord(tool.driver) ? tool.driver : null;
  const engine = normalizeEngineName(driver?.name, filePath);
  const ruleMap = buildRuleInfoMap(runRaw);
  const results = Array.isArray(runRaw.results) ? (runRaw.results as unknown[]) : [];
  const findings: SecurityFinding[] = [];
  for (const item of results) {
    const converted = convertResultItem(resolvedRoot, engine, ruleMap, item);
    if (converted) {
      findings.push(converted);
    }
  }
  return findings;
}

function readSingleSarifFile(
  resolvedRoot: string,
  filePath: string
): { readonly ok: true; readonly findings: SecurityFinding[] } | { readonly ok: false } {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SARIF_FILE_BYTES) {
    return { ok: false };
  }
  const runs = parseSarifSafe(fs.readFileSync(filePath, UTF8_ENCODING));
  if (!runs) {
    return { ok: false };
  }
  const findings = runs.flatMap((runRaw) => collectRunFindings(resolvedRoot, filePath, runRaw));
  return { ok: true, findings };
}

/**
 * Ingests a single hardened SARIF 2.1.0 report file scoped to the given workspace.
 */
export function ingestSingleSarifReport(
  projectRoot: string,
  sarifFilePath: string
): readonly SecurityFinding[] {
  const resolvedRoot = path.resolve(projectRoot);
  const candidateAbs = path.resolve(resolvedRoot, sarifFilePath);
  const relCandidate = path.relative(resolvedRoot, candidateAbs);
  if (!relCandidate || relCandidate.startsWith('..') || path.isAbsolute(relCandidate)) {
    return [];
  }
  try {
    const safeFile = resolveSafeChildPath(resolvedRoot, relCandidate);
    assertNoSymlinkSegments(resolvedRoot, relCandidate);
    const parsed = readSingleSarifFile(resolvedRoot, safeFile);
    return parsed.ok ? parsed.findings : [];
  } catch {
    return [];
  }
}

/**
 * Hardened SARIF 2.1.0 ingester for `.agents/.cache/sarif/*.sarif`.
 * Rejects symlinks, files > 10 MB, corrupt JSON, prototype keys, and paths escaping workspace.
 */
export function ingestExternalSarifReports(
  projectRoot: string,
  sarifRelDir: string = DEFAULT_SARIF_CACHE_REL_DIR
): ExternalSarifIngestSummary {
  const resolvedRoot = path.resolve(projectRoot);
  let sarifDir: string;
  try {
    sarifDir = resolveSafeChildPath(resolvedRoot, sarifRelDir);
  } catch {
    return { files_ingested: [], skipped_files: [sarifRelDir], findings: [] };
  }
  if (!fs.existsSync(sarifDir)) {
    return { files_ingested: [], skipped_files: [], findings: [] };
  }
  try {
    assertNoSymlinkSegments(resolvedRoot, sarifRelDir);
  } catch {
    return { files_ingested: [], skipped_files: [sarifRelDir], findings: [] };
  }
  const dirStat = fs.lstatSync(sarifDir);
  if (!dirStat.isDirectory()) {
    return { files_ingested: [], skipped_files: [sarifRelDir], findings: [] };
  }

  const entries = fs
    .readdirSync(sarifDir)
    .filter((name) => name.toLowerCase().endsWith('.sarif'))
    .sort((a, b) => a.localeCompare(b));

  const filesIngested: string[] = [];
  const skippedFiles: string[] = [];
  const findings: SecurityFinding[] = [];

  for (const name of entries) {
    const absPath = path.join(sarifDir, name);
    const relPosix = path.relative(resolvedRoot, absPath).split(path.sep).join('/');
    const parsed = readSingleSarifFile(resolvedRoot, absPath);
    if (!parsed.ok) {
      skippedFiles.push(relPosix);
      continue;
    }
    filesIngested.push(relPosix);
    findings.push(...parsed.findings);
  }

  return { files_ingested: filesIngested, skipped_files: skippedFiles, findings };
}
