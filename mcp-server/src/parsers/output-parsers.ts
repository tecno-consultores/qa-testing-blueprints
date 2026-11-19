// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import {
  QaExecutionResult,
  QaCoverageSummary,
  QaCoverageFile,
  QaFailedTest,
  QaLinterIssue,
  QaSecurityAlerts,
  QaMutationSummary,
} from '../types.js';
import { pickAt } from '../utils/diagnosticFormatter.js';

/**
 * Elimina secuencias de escape ANSI de una cadena de texto.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * Extrae las últimas N líneas limpias y legibles del log combinado.
 */
export function parseTailLog(rawLog: string, maxLines = 15): string {
  const clean = stripAnsi(rawLog);
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.slice(-maxLines).join('\n');
}

const VITEST_ALL_FILES_RE =
  /All files\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)/;
const VITEST_FILE_COL_RE = /^[\w./\\-]+\.[a-zA-Z0-9]+$/;
const NUMERIC_COL_RE = /^[0-9.]+$/;
const MISSING_LINES_COL_RE = /^[0-9,\- ]+$/;

function parseVitestCoverageRow(line: string): QaCoverageFile | null {
  const cols = line.split('|').map((c) => c.trim());
  if (cols.length < 6) return null;
  const fileName = pickAt(cols, 0);
  if (!fileName || fileName.toLowerCase() === 'all files' || !VITEST_FILE_COL_RE.test(fileName)) {
    return null;
  }
  const c1 = pickAt(cols, 1);
  const c2 = pickAt(cols, 2);
  const c3 = pickAt(cols, 3);
  const c4 = pickAt(cols, 4);
  const missingLines = pickAt(cols, 5);
  if (
    !NUMERIC_COL_RE.test(c1) ||
    !NUMERIC_COL_RE.test(c2) ||
    !NUMERIC_COL_RE.test(c3) ||
    !NUMERIC_COL_RE.test(c4) ||
    !MISSING_LINES_COL_RE.test(missingLines)
  ) {
    return null;
  }
  const fileCover = parseFloat(c4);
  return {
    file: fileName,
    coverage_percent: isNaN(fileCover) ? 0 : fileCover,
    missing_lines: missingLines,
  };
}

function parseVitestCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const vitestAllFilesMatch = VITEST_ALL_FILES_RE.exec(clean);

  if (!vitestAllFilesMatch) {
    return { detected: false, percent: 0, uncovered: [] };
  }

  const linesCover = parseFloat(pickAt(vitestAllFilesMatch, 4));
  const fallbackCover = parseFloat(pickAt(vitestAllFilesMatch, 1));
  const percent = isNaN(linesCover) ? fallbackCover : linesCover;
  const uncovered: QaCoverageFile[] = [];

  for (const line of clean.split(/\r?\n/)) {
    const row = parseVitestCoverageRow(line);
    if (row) {
      uncovered.push(row);
    }
  }

  return { detected: true, percent: isNaN(percent) ? 0 : percent, uncovered };
}

function isIntegerCell(token: string): boolean {
  return /^\d+$/.test(token);
}

function isPercentCell(token: string): boolean {
  if (!token.endsWith('%')) return false;
  const numPart = token.slice(0, -1);
  if (!numPart) return false;
  const parts = numPart.split('.');
  return parts.length <= 2 && parts.every(isIntegerCell);
}

function parsePytestTotalPercent(cols: readonly string[]): number | null {
  if (cols[0] !== 'TOTAL' || cols.length < 4) return null;
  const pctIdx = cols.findIndex((col, idx) => idx >= 3 && idx <= 5 && isPercentCell(col));
  if (pctIdx === -1 || !cols.slice(1, pctIdx).every(isIntegerCell)) {
    return null;
  }
  return parseFloat(pickAt(cols, pctIdx, '0%').slice(0, -1));
}

function parsePytestRow(line: string): QaCoverageFile | null {
  const cols = line.trim().split(/\s+/);
  const fileName = pickAt(cols, 0);
  if (!fileName.endsWith('.py') || cols.length < 4) return null;
  const pctIdx = cols.findIndex(
    (col, idx) => (idx === 3 || idx === 5) && isPercentCell(col)
  );
  if (pctIdx === -1 || !cols.slice(1, pctIdx).every(isIntegerCell)) {
    return null;
  }
  const missedStmts = parseInt(pickAt(cols, 2, '0'), 10);
  const fileCover = parseFloat(pickAt(cols, pctIdx, '0%').slice(0, -1));
  const missing = cols.slice(pctIdx + 1).join(' ');
  if (missedStmts === 0 && (isNaN(fileCover) || fileCover >= 100) && missing.length === 0) {
    return null;
  }
  return {
    file: fileName,
    coverage_percent: isNaN(fileCover) ? 0 : fileCover,
    missing_lines: missing || 'Uncovered lines',
  };
}

function parsePytestCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const lines = clean.split(/\r?\n/);
  let detectedPercent: number | null = null;
  const uncovered: QaCoverageFile[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('TOTAL')) {
      const parsedTotal = parsePytestTotalPercent(trimmed.split(/\s+/));
      if (parsedTotal !== null) detectedPercent = parsedTotal;
      continue;
    }
    const row = parsePytestRow(trimmed);
    if (row) uncovered.push(row);
  }

  if (detectedPercent === null) {
    return { detected: false, percent: 0, uncovered: [] };
  }
  return { detected: true, percent: detectedPercent, uncovered };
}

function parsePhpCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const match = /(?:Lines|Total):\s+([0-9.]+)%/i.exec(clean);
  if (!match) {
    return { detected: false, percent: 0, uncovered: [] };
  }
  const percent = parseFloat(pickAt(match, 1, '0'));
  return { detected: true, percent, uncovered: [] };
}

/**
 * Parsea métricas de cobertura de código (pytest-cov, vitest/v8, kcov).
 */
export function parseCoverage(rawLog: string): QaCoverageSummary {
  const clean = stripAnsi(rawLog);
  const threshold = 95.0;

  const vitest = parseVitestCoverage(clean);
  if (vitest.detected) {
    return {
      detected: true,
      percent: Math.round(vitest.percent * 100) / 100,
      threshold,
      passed: vitest.percent >= threshold,
      uncovered_files: vitest.uncovered.slice(0, 20),
    };
  }

  const pytest = parsePytestCoverage(clean);
  if (pytest.detected) {
    return {
      detected: true,
      percent: Math.round(pytest.percent * 100) / 100,
      threshold,
      passed: pytest.percent >= threshold,
      uncovered_files: pytest.uncovered.slice(0, 20),
    };
  }

  const php = parsePhpCoverage(clean);
  if (php.detected) {
    return {
      detected: true,
      percent: Math.round(php.percent * 100) / 100,
      threshold,
      passed: php.percent >= threshold,
      uncovered_files: php.uncovered.slice(0, 20),
    };
  }

  const genericCoverageMatch = /(?:Total coverage|Coverage):\s*([0-9.]+)%/i.exec(clean);
  if (genericCoverageMatch) {
    const percent = parseFloat(pickAt(genericCoverageMatch, 1, '0'));
    return {
      detected: true,
      percent: Math.round(percent * 100) / 100,
      threshold,
      passed: percent >= threshold,
      uncovered_files: [],
    };
  }

  return {
    detected: false,
    percent: 0,
    threshold,
    passed: false,
    uncovered_files: [],
  };
}

function parsePytestFailedItem(lines: string[], i: number): { item: QaFailedTest; nextIdx: number } {
  const line = pickAt(lines, i).trim();
  const rest = line.substring(7).trim();
  const sepIdx = rest.indexOf(' - ');
  const testName = (sepIdx !== -1 ? rest.slice(0, sepIdx) : rest).trim() || rest;
  let errorSummary = sepIdx !== -1 ? rest.slice(sepIdx + 3).trim() : '';

  if (!errorSummary && i + 1 < lines.length) {
    const nextLines = lines.slice(i + 1, i + 4).map((l) => l.trim()).filter(Boolean);
    errorSummary = nextLines.join('; ');
  }

  return {
    item: {
      test_name: testName,
      error_summary: (errorSummary || 'Assertion failed').substring(0, 250),
    },
    nextIdx: i,
  };
}

function parseVitestFailedItem(lines: string[], i: number): QaFailedTest {
  const line = pickAt(lines, i).trim();
  const testName = line.replace(/^FAIL\s+/, '').trim();
  const errorLines = lines
    .slice(i + 1, i + 5)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('❯') && !l.startsWith('·'));

  return {
    test_name: testName,
    error_summary: (errorLines.join('; ') || 'Test assertion failed').substring(0, 250),
  };
}

function parseBatsFailedItem(lines: string[], i: number): QaFailedTest {
  const line = pickAt(lines, i).trim();
  const testName = line.replace(/^not ok\s+\d+\s*-?\s*/, '').trim();
  let errorSummary = '';
  const nextRaw = lines[i + 1];
  if (nextRaw !== undefined && nextRaw.trim().startsWith('#')) {
    errorSummary = nextRaw.trim().replace(/^#\s*/, '');
  }

  return {
    test_name: testName,
    error_summary: (errorSummary || 'BATS assertion failed').substring(0, 250),
  };
}

/**
 * Parsea pruebas fallidas de Pytest, Vitest y BATS-core.
 */
export function parseFailedTests(rawLog: string): QaFailedTest[] {
  const clean = stripAnsi(rawLog);
  const failedTests: QaFailedTest[] = [];
  const lines = clean.split(/\r?\n/);

  for (const [i, rawLine] of lines.entries()) {
    if (failedTests.length >= 20) {
      break;
    }
    const line = rawLine.trim();

    if (line.startsWith('FAILED ')) {
      const parsed = parsePytestFailedItem(lines, i);
      failedTests.push(parsed.item);
    } else if (line.startsWith('FAIL ') || line.includes('FAIL  tests/')) {
      failedTests.push(parseVitestFailedItem(lines, i));
    } else if (line.startsWith('not ok ')) {
      failedTests.push(parseBatsFailedItem(lines, i));
    }
  }

  return failedTests;
}

function parseRadonIssue(line: string): QaLinterIssue | null {
  const parts = line.split(':');
  if (parts.length < 3) return null;
  const file = pickAt(parts, 0).trim();
  if (!file.endsWith('.py')) return null;
  const lineNum = parseInt(pickAt(parts, 1).trim(), 10);
  const rest = parts.slice(2).join(':').trim();
  const firstSpace = rest.indexOf(' ');
  if (firstSpace === -1) return null;
  const grade = rest.substring(0, firstSpace).trim();
  if (grade.length !== 1 || !['C', 'D', 'E', 'F'].includes(grade)) return null;
  const message = rest.substring(firstSpace + 1).trim();

  return {
    file,
    line: isNaN(lineNum) ? 1 : lineNum,
    rule: `radon-${grade}`,
    message,
  };
}

function parseMypyIssue(line: string): QaLinterIssue | null {
  if (!line.includes(': error:') || (!line.includes('.py:') && !line.includes('.pyi:'))) return null;
  const parts = line.split(': error:');
  const loc = pickAt(parts, 0).split(':');
  if (loc.length < 2) return null;
  const file = pickAt(loc, 0).trim();
  const lineNum = parseInt(pickAt(loc, 1).trim(), 10);
  const msgPart = parts.slice(1).join(': error:').trim();
  const ruleMatch = /\[([a-z-]+)\]$/.exec(msgPart);
  const rule = ruleMatch && ruleMatch[1] ? `mypy-${ruleMatch[1]}` : 'mypy-error';
  const message = ruleMatch ? msgPart.slice(0, ruleMatch.index).trimEnd() : msgPart;

  return {
    file,
    line: isNaN(lineNum) ? 1 : lineNum,
    rule,
    message,
  };
}

function parseRuffIssue(line: string): QaLinterIssue | null {
  const parts = line.split(':');
  if (parts.length < 4) return null;
  const file = pickAt(parts, 0).trim();
  const lineToken = pickAt(parts, 1).trim();
  const colToken = pickAt(parts, 2).trim();
  if (!/^\d+$/.test(lineToken) || !/^\d+$/.test(colToken)) return null;
  const codeAndMsg = parts.slice(3).join(':').trim();
  const ruffCodeMatch = /^([A-Z]{1,6}\d+)\s+(\S[^\r\n]*)$/.exec(codeAndMsg);
  if (!ruffCodeMatch?.[1]) return null;

  return {
    file,
    line: parseInt(lineToken, 10),
    rule: `ruff-${ruffCodeMatch[1]}`,
    message: pickAt(ruffCodeMatch, 2).trim(),
  };
}

function parseEslintStylishLine(trimmed: string, currentFile: string): QaLinterIssue | null {
  const headMatch = /^(\d+):(\d+)[ \t]+(error|warning)[ \t]+/.exec(trimmed);
  if (!headMatch) return null;
  const rest = trimmed.slice(headMatch[0].length).trim();
  const sepIdx = rest.lastIndexOf('  ');
  if (sepIdx < 0) return null;
  const ruleToken = rest.slice(sepIdx + 2).trim();
  if (!/^[\w/@-]+$/.test(ruleToken)) return null;
  return {
    file: currentFile || 'eslint',
    line: parseInt(pickAt(headMatch, 1, '1'), 10),
    rule: `eslint-${ruleToken}`,
    message: rest.slice(0, sepIdx).trim(),
  };
}

const JS_TS_VUE_FILE_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts|vue)$/i;

function parseEslintIssue(line: string, currentFile = ''): QaLinterIssue | null {
  if (!line.includes('error') && !line.includes('warning')) return null;
  const stylish = parseEslintStylishLine(line.trim(), currentFile);
  if (stylish) return stylish;
  const parts = line.split(':');
  if (parts.length < 4) return null;
  const file = pickAt(parts, 0).trim();
  const lineToken = pickAt(parts, 1).trim();
  const colToken = pickAt(parts, 2).trim();
  if (!JS_TS_VUE_FILE_RE.test(file) || !/^\d+$/.test(lineToken) || !/^\d+$/.test(colToken)) {
    return null;
  }
  const msgPart = parts.slice(3).join(':').trim();
  if (!/^(?:error|warning)\b/i.test(msgPart)) return null;
  const ruleMatch = /\[([\w/@-]+)\]$/.exec(msgPart);

  return {
    file,
    line: parseInt(lineToken, 10),
    rule: ruleMatch?.[1] ? `eslint-${ruleMatch[1]}` : 'eslint-issue',
    message: ruleMatch ? msgPart.slice(0, ruleMatch.index).trimEnd() : msgPart,
  };
}

function parseShellcheckGccIssue(line: string): QaLinterIssue | null {
  const scMatch = /(SC\d+)/.exec(line);
  if (!scMatch || !scMatch[1]) return null;
  const parts = line.split(':');
  if (parts.length < 3) return null;
  const file = pickAt(parts, 0).trim();
  const lineNum = parseInt(pickAt(parts, 1).trim(), 10);
  if (isNaN(lineNum)) return null;

  return {
    file,
    line: lineNum,
    rule: `shellcheck-${scMatch[1]}`,
    message: line,
  };
}

function parseShellcheckHeaderLine(line: string): { file: string; line: number } | null {
  if (!line.startsWith('In ') || !line.includes(' line ')) {
    return null;
  }
  const match = /^In\s+(\S+)\s+line\s+(\d+):/.exec(line);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { file: match[1], line: parseInt(match[2], 10) };
}

function parseShellcheckBlocks(lines: string[]): QaLinterIssue[] {
  const issues: QaLinterIssue[] = [];
  let currentFile = '';
  let currentLine = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      currentFile = '';
      continue;
    }
    const header = parseShellcheckHeaderLine(line);
    if (header) {
      currentFile = header.file;
      currentLine = header.line;
      continue;
    }
    const scMatch = currentFile && line.includes('SC') ? /(SC\d+)/.exec(line) : null;
    if (scMatch?.[1]) {
      issues.push({
        file: currentFile,
        line: currentLine,
        rule: `shellcheck-${scMatch[1]}`,
        message: line,
      });
    }
  }

  return issues;
}

function parsePsalmIssue(line: string): QaLinterIssue | null {
  if (!line.startsWith('ERROR:')) return null;
  const parts = line.slice('ERROR:'.length).split(' - ');
  if (parts.length < 3) return null;
  const ruleCode = pickAt(parts, 0).trim();
  const locMatch = /^([^:\r\n]+):(\d+):\d+$/.exec(pickAt(parts, 1).trim());
  if (!/^[\w-]+$/.test(ruleCode) || !locMatch) return null;
  const message = parts.slice(2).join(' - ').trim();
  return {
    file: pickAt(locMatch, 1).trim(),
    line: parseInt(pickAt(locMatch, 2, '1'), 10),
    rule: `psalm-${ruleCode}`,
    message,
  };
}

function parsePhpstanIssue(line: string): QaLinterIssue | null {
  const match = /^([^:]+\.php):(\d+):(.+)$/.exec(line);
  if (match) {
    return {
      file: pickAt(match, 1).trim(),
      line: parseInt(pickAt(match, 2, '1'), 10),
      rule: 'phpstan-error',
      message: pickAt(match, 3).trim(),
    };
  }
  return null;
}

function parseSingleLineIssue(line: string, currentFile = ''): QaLinterIssue | null {
  return (
    parseRadonIssue(line) ||
    parseMypyIssue(line) ||
    parseRuffIssue(line) ||
    parseShellcheckGccIssue(line) ||
    parseEslintIssue(line, currentFile) ||
    parsePsalmIssue(line) ||
    parsePhpstanIssue(line)
  );
}

const RUFF_FULL_HEADER_RE = /^([A-Z]{1,6}\d+)\s+(\S[^\r\n]*)$/;

function parseRuffFullLocation(line: string): { file: string; line: number } | null {
  if (!line.startsWith('-->')) return null;
  const rest = line.slice(3).trimStart();
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0 || !/^\d+$/.test(rest.slice(lastColon + 1))) {
    return null;
  }
  const beforeCol = rest.slice(0, lastColon);
  const lineColon = beforeCol.lastIndexOf(':');
  if (lineColon <= 0 || !/^\d+$/.test(beforeCol.slice(lineColon + 1))) {
    return null;
  }
  const file = beforeCol.slice(0, lineColon).trim();
  return file ? { file, line: parseInt(beforeCol.slice(lineColon + 1), 10) } : null;
}

function parseRuffFullBlocks(lines: readonly string[]): QaLinterIssue[] {
  const issues: QaLinterIssue[] = [];
  let pendingRule = '';
  let pendingMsg = '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      pendingRule = '';
      pendingMsg = '';
      continue;
    }
    const loc = pendingRule ? parseRuffFullLocation(line) : null;
    if (loc) {
      issues.push({
        file: loc.file,
        line: loc.line,
        rule: `ruff-${pendingRule}`,
        message: pendingMsg,
      });
      pendingRule = '';
      pendingMsg = '';
      continue;
    }
    const headerMatch = RUFF_FULL_HEADER_RE.exec(line);
    if (headerMatch?.[1] && !line.includes('eslint') && !/^\d+:\d+/.test(line)) {
      pendingRule = headerMatch[1];
      pendingMsg = pickAt(headerMatch, 2).trim();
    } else if (!line.startsWith('|') && !line.startsWith('^') && !/^\d+\s*\|/.test(line)) {
      pendingRule = '';
      pendingMsg = '';
    }
  }
  return issues;
}

/**
 * Parsea problemas de linters y complejidad ciclomática / cognitiva.
 */
export function parseLinterAndComplexity(rawLog: string): QaLinterIssue[] {
  const clean = stripAnsi(rawLog);
  const lines = clean.split(/\r?\n/);
  const issues: QaLinterIssue[] = [];
  let currentEslintFile = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:\/|[a-zA-Z]:\\|[a-zA-Z0-9_.-]+\/)[^\s:]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/.test(line)) {
      currentEslintFile = line;
      continue;
    }
    const issue = parseSingleLineIssue(line, currentEslintFile);
    if (issue) issues.push(issue);
  }

  issues.push(...parseRuffFullBlocks(lines), ...parseShellcheckBlocks(lines));

  return issues.slice(0, 25);
}

/**
 * Parsea alertas de seguridad de Trivy y Bandit.
 */
const SEVERITY_PATTERNS: Record<'CRITICAL' | 'HIGH', RegExp> = {
  CRITICAL: /(?:Severity:\s*CRITICAL|\bCRITICAL\s+(?:severity|risk|vulnerability|vulnerabilities)\b|\[CRITICAL\])/i,
  HIGH: /(?:Severity:\s*HIGH|\bHIGH\s+(?:severity|risk|vulnerability|vulnerabilities)\b|\[HIGH\])/i,
};

function countSeverityHits(clean: string, level: 'CRITICAL' | 'HIGH'): number {
  const severityRe = SEVERITY_PATTERNS[level];
  let hits = 0;
  for (const line of clean.split(/\r?\n/)) {
    if (severityRe.test(line) || (line.includes(level) && /\bCVE-\d{4}-\d+\b/.test(line))) {
      hits += 1;
    }
  }
  return Math.min(hits, 10);
}

export function parseSecurityAlerts(rawLog: string): QaSecurityAlerts {
  const clean = stripAnsi(rawLog);
  let critical = 0;
  let high = 0;

  let summaryFound = false;
  for (const line of clean.split(/\r?\n/)) {
    const critSummary = /\bCRITICAL:\s*(\d+)/i.exec(line);
    const highSummary = /\bHIGH:\s*(\d+)/i.exec(line);
    if (critSummary?.[1] && highSummary?.[1]) {
      critical += parseInt(critSummary[1], 10);
      high += parseInt(highSummary[1], 10);
      summaryFound = true;
    }
  }
  if (summaryFound) {
    return { critical, high };
  }

  const critCountMatch = /CRITICAL\s*\|\s*(\d+)/i.exec(clean) || /CRITICAL:\s*(\d+)/i.exec(clean);
  const highCountMatch = /HIGH\s*\|\s*(\d+)/i.exec(clean) || /HIGH:\s*(\d+)/i.exec(clean);

  if (critCountMatch) {
    critical = parseInt(pickAt(critCountMatch, 1, '0'), 10);
  } else if (!clean.includes('no security findings')) {
    critical = countSeverityHits(clean, 'CRITICAL');
  }

  if (highCountMatch) {
    high = parseInt(pickAt(highCountMatch, 1, '0'), 10);
  } else if (!clean.includes('no security findings')) {
    high = countSeverityHits(clean, 'HIGH');
  }

  return { critical, high };
}

/**
 * Parsea resúmenes de pruebas de mutación (Mutmut y Stryker).
 */
export function parseMutation(rawLog: string): QaMutationSummary | null {
  const clean = stripAnsi(rawLog);

  const scoreMatch =
    /Mutation Score Indicator \(MSI\):\s*([0-9.]+)%/i.exec(clean) ||
    /Mutation score:\s*([0-9.]+)%/i.exec(clean);

  const survivedMatch =
    /Mutants survived:\s*(\d+)/i.exec(clean) ||
    /survived:\s*(\d+)/i.exec(clean) ||
    /\b(\d+)[ \t]+escaped/i.exec(clean) ||
    /\b(\d+)[ \t]+mutants were not covered/i.exec(clean);

  if (!scoreMatch && !survivedMatch) {
    return null;
  }

  const mutationScore = scoreMatch ? parseFloat(pickAt(scoreMatch, 1, '0')) : 0;
  const mutantsSurvived = survivedMatch ? parseInt(pickAt(survivedMatch, 1, '0'), 10) : 0;

  return {
    mutation_score: Math.round(mutationScore * 100) / 100,
    mutants_survived: mutantsSurvived,
  };
}

const STATUS_PASSED = 'PASSED' as const;
const STATUS_FAILED = 'FAILED' as const;
const STATUS_SKIPPED = 'SKIPPED' as const;
export type QaStageStatus = typeof STATUS_PASSED | typeof STATUS_FAILED | typeof STATUS_SKIPPED;

const TEST_STAGE_NAMES = new Set([
  'integration',
  'bdd',
  'e2e',
  'contracts',
  'ci',
  'mutation',
  'migration',
]);

const EXPLICIT_TEST_COUNT_RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly sumTwoGroups?: true }> = [
  { pattern: /\bTests:?\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\b/i, sumTwoGroups: true },
  { pattern: /\b(\d+)\s+failed,\s+(\d+)\s+passed\b/i, sumTwoGroups: true },
  { pattern: /\bTests:?\s+(\d+)\s+(?:passed|failed)\b/i },
  { pattern: /\bTests:\s*(\d+)\b/i },
  { pattern: /\bOK\s*\((\d+)\s+tests?\b/i },
  { pattern: /[ℹ#]\s*tests\s+(\d+)\b/i },
  { pattern: /^[ \t]*1\.\.(\d+)[ \t]*$/m },
  { pattern: /\bscenarios:\s*(\d+)\b/i },
  { pattern: /\bRan\s+(\d+)\s+tests?\s+in\b/i },
  { pattern: /\b(\d+)\s+failed\s+in\s+[0-9.]+s\b/i },
  { pattern: /\b(\d+)\s+passed\b/i },
];

const ZERO_TEST_INDICATOR_PATTERNS: readonly RegExp[] = [
  /\bcollected\s+0\s+items?\b/i,
  /\bno tests ran\b/i,
  /\b0\s+selected\b/i,
  /\bno test files found\b/i,
  /\bno tests found\b/i,
  /\bno tests executed\b/i,
];

export interface QaTestsDetected {
  detected: boolean;
  count: number;
}

/**
 * Detecta la cantidad de pruebas ejecutadas a partir de resúmenes de pytest,
 * Vitest, node --test, BATS, Pest/PHPUnit y Karate.
 */
export function parseTestsDetected(rawLog: string): QaTestsDetected {
  const clean = stripAnsi(rawLog);

  for (const rule of EXPLICIT_TEST_COUNT_RULES) {
    const match = rule.pattern.exec(clean);
    if (match) {
      const first = parseInt(pickAt(match, 1, '0'), 10);
      const second = rule.sumTwoGroups ? parseInt(pickAt(match, 2, '0'), 10) : 0;
      return { detected: true, count: first + second };
    }
  }

  for (const zeroPattern of ZERO_TEST_INDICATOR_PATTERNS) {
    if (zeroPattern.test(clean)) {
      return { detected: true, count: 0 };
    }
  }

  const pytestCollectedMatch = /\bcollected\s+(\d+)\s+items?\b/i.exec(clean);
  if (pytestCollectedMatch) {
    return { detected: true, count: parseInt(pickAt(pytestCollectedMatch, 1, '0'), 10) };
  }

  const tapOkMatches = clean.match(/^ok\s+\d+\b/gm);
  if (tapOkMatches && tapOkMatches.length > 0) {
    return { detected: true, count: tapOkMatches.length };
  }

  return { detected: false, count: 0 };
}

/**
 * Determina el estado PASSED, FAILED o SKIPPED a partir de los datos parseados.
 */
export interface EvaluateQaStatusInput {
  readonly exitCode: number;
  readonly stage: string;
  readonly failedTestsCount: number;
  readonly coverage: QaCoverageSummary;
  readonly linterIssuesCount: number;
  readonly testsDetected: QaTestsDetected;
}

function evaluateUnitStageStatus(
  coverage: QaCoverageSummary,
  testsDetected: QaTestsDetected
): QaStageStatus {
  if (testsDetected.detected && testsDetected.count === 0) {
    return STATUS_SKIPPED;
  }
  if (!coverage.detected || !coverage.passed) {
    return STATUS_FAILED;
  }
  if (!testsDetected.detected) {
    return STATUS_SKIPPED;
  }
  return STATUS_PASSED;
}

function evaluateAllStageStatus(
  coverage: QaCoverageSummary,
  linterIssuesCount: number,
  testsDetected: QaTestsDetected
): QaStageStatus {
  if ((coverage.detected && !coverage.passed) || linterIssuesCount > 0) {
    return STATUS_FAILED;
  }
  return !testsDetected.detected || testsDetected.count === 0 ? STATUS_SKIPPED : STATUS_PASSED;
}

function evaluateQaStatus(input: EvaluateQaStatusInput): QaStageStatus {
  const { exitCode, stage, failedTestsCount, coverage, linterIssuesCount, testsDetected } = input;
  if (exitCode !== 0 || failedTestsCount > 0) {
    return STATUS_FAILED;
  }

  if (stage === 'unit') {
    return evaluateUnitStageStatus(coverage, testsDetected);
  }
  if (stage === 'all') {
    return evaluateAllStageStatus(coverage, linterIssuesCount, testsDetected);
  }
  if (stage === 'lint') {
    return linterIssuesCount > 0 ? STATUS_FAILED : STATUS_PASSED;
  }
  if (TEST_STAGE_NAMES.has(stage) && (!testsDetected.detected || testsDetected.count === 0)) {
    return STATUS_SKIPPED;
  }

  return STATUS_PASSED;
}

/**
 * Función unificada que orquesta todos los parsers ahorradores de tokens,
 * transformando miles de líneas de salida de Docker en un JSON compacto de menos de 40 líneas.
 */
export interface ParseQaOutputOptions {
  readonly durationMs?: number;
  readonly exitCode?: number;
}

export function parseQaOutput(
  stdout: string,
  stderr: string,
  stage: string,
  options: ParseQaOutputOptions = {}
): QaExecutionResult {
  const { durationMs = 0, exitCode = 0 } = options;
  const combinedLog = `${stdout}\n${stderr}`;

  const coverage = parseCoverage(combinedLog);
  const failedTests = parseFailedTests(combinedLog);
  const linterIssues = parseLinterAndComplexity(combinedLog);
  const securityAlerts = parseSecurityAlerts(combinedLog);
  const mutationSummary = parseMutation(combinedLog);
  const testsDetected = parseTestsDetected(combinedLog);
  const tailLog = parseTailLog(combinedLog, 15);

  const status = evaluateQaStatus({
    exitCode,
    stage,
    failedTestsCount: failedTests.length,
    coverage,
    linterIssuesCount: linterIssues.length,
    testsDetected,
  });

  return {
    status,
    stage,
    exit_code: exitCode,
    duration_ms: durationMs,
    tests_detected: testsDetected.count,
    coverage,
    failed_tests: failedTests,
    linter_and_complexity_issues: linterIssues,
    security_alerts: securityAlerts,
    mutation_summary: mutationSummary,
    tail_log: tailLog,
  };
}
