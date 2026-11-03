// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import {
  QaExecutionResult,
  QaCoverageSummary,
  QaCoverageFile,
  QaFailedTest,
  QaLinterIssue,
  QaSecurityAlerts,
  QaMutationSummary,
} from '../types.js';

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

function parseVitestCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const vitestAllFilesMatch = clean.match(
    /All files\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)/
  );

  if (!vitestAllFilesMatch) {
    return { detected: false, percent: 0, uncovered: [] };
  }

  const linesCover = parseFloat(vitestAllFilesMatch[4]);
  const percent = isNaN(linesCover) ? parseFloat(vitestAllFilesMatch[1]) : linesCover;
  const uncovered: QaCoverageFile[] = [];

  const rowRegex = /^\s*([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)\s*\|\s*[0-9.]+\s*\|\s*[0-9.]+\s*\|\s*[0-9.]+\s*\|\s*([0-9.]+)\s*\|\s*([0-9,\- ]+)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(clean)) !== null) {
    const fileName = match[1].trim();
    if (fileName.toLowerCase() === 'all files') continue;
    const fileCover = parseFloat(match[2]);
    const missingLines = match[3].trim();
    if (missingLines) {
      uncovered.push({
        file: fileName,
        coverage_percent: isNaN(fileCover) ? 0 : fileCover,
        missing_lines: missingLines,
      });
    }
  }

  return { detected: true, percent, uncovered };
}

function parsePytestCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const pytestTotalMatch = clean.match(/TOTAL\s+\d+\s+\d+\s+([0-9.]+)%/);
  if (!pytestTotalMatch) {
    return { detected: false, percent: 0, uncovered: [] };
  }

  const percent = parseFloat(pytestTotalMatch[1]);
  const uncovered: QaCoverageFile[] = [];
  const pytestRowRegex = /^([a-zA-Z0-9_./\\-]+\.py)\s+\d+\s+([1-9]\d*)\s+([0-9.]+)%\s*(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pytestRowRegex.exec(clean)) !== null) {
    const fileName = match[1].trim();
    const fileCover = parseFloat(match[3]);
    const missing = match[4].trim();
    uncovered.push({
      file: fileName,
      coverage_percent: isNaN(fileCover) ? 0 : fileCover,
      missing_lines: missing || 'Uncovered lines',
    });
  }

  return { detected: true, percent, uncovered };
}

function parsePhpCoverage(clean: string): { detected: boolean; percent: number; uncovered: QaCoverageFile[] } {
  const match = clean.match(/(?:Lines|Total):\s+([0-9.]+)%/i);
  if (!match) {
    return { detected: false, percent: 0, uncovered: [] };
  }
  const percent = parseFloat(match[1]);
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

  const genericCoverageMatch = clean.match(/(?:Total coverage|Coverage):\s*([0-9.]+)%/i);
  if (genericCoverageMatch) {
    const percent = parseFloat(genericCoverageMatch[1]);
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
    passed: true,
    uncovered_files: [],
  };
}

function parsePytestFailedItem(lines: string[], i: number): { item: QaFailedTest; nextIdx: number } {
  const line = lines[i].trim();
  const rest = line.substring(7).trim();
  const parts = rest.split(/\s*-\s*/);
  const testName = parts[0] || rest;
  let errorSummary = parts.slice(1).join(' - ');

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
  const line = lines[i].trim();
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
  const line = lines[i].trim();
  const testName = line.replace(/^not ok\s+\d+\s*-?\s*/, '').trim();
  let errorSummary = '';
  if (i + 1 < lines.length && lines[i + 1].trim().startsWith('#')) {
    errorSummary = lines[i + 1].trim().replace(/^#\s*/, '');
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

  for (let i = 0; i < lines.length && failedTests.length < 20; i++) {
    const line = lines[i].trim();

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
  const file = parts[0].trim();
  if (!file.endsWith('.py')) return null;
  const lineNum = parseInt(parts[1].trim(), 10);
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
  const loc = parts[0].split(':');
  if (loc.length < 2) return null;
  const file = loc[0].trim();
  const lineNum = parseInt(loc[1].trim(), 10);
  const msgPart = parts.slice(1).join(': error:').trim();
  const ruleMatch = msgPart.match(/\[([a-z-]+)\]$/);
  const rule = ruleMatch ? `mypy-${ruleMatch[1]}` : 'mypy-error';
  const message = ruleMatch ? msgPart.replace(/\s*\[[a-z-]+\]$/, '') : msgPart;

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
  const file = parts[0].trim();
  const lineNum = parseInt(parts[1].trim(), 10);
  const codeAndMsg = parts.slice(3).join(':').trim();
  const ruffCodeMatch = codeAndMsg.match(/^([A-Z]\d+)\s+(.*)$/);
  if (!ruffCodeMatch) return null;

  return {
    file,
    line: isNaN(lineNum) ? 1 : lineNum,
    rule: `ruff-${ruffCodeMatch[1]}`,
    message: ruffCodeMatch[2].trim(),
  };
}

function parseEslintIssue(line: string): QaLinterIssue | null {
  if (!line.includes('error') && !line.includes('warning')) return null;
  const parts = line.split(':');
  if (parts.length < 4) return null;
  const file = parts[0].trim();
  const lineNum = parseInt(parts[1].trim(), 10);
  const msgPart = parts.slice(3).join(':').trim();
  const ruleMatch = msgPart.match(/\[([a-zA-Z0-9_/@-]+)\]$/);

  return {
    file,
    line: isNaN(lineNum) ? 1 : lineNum,
    rule: ruleMatch ? `eslint-${ruleMatch[1]}` : 'eslint-issue',
    message: ruleMatch ? msgPart.replace(/\s*\[[a-zA-Z0-9_/@-]+\]$/, '').trim() : msgPart,
  };
}

function parseShellcheckGccIssue(line: string): QaLinterIssue | null {
  const scMatch = line.match(/(SC\d+)/);
  if (!scMatch) return null;
  const parts = line.split(':');
  if (parts.length < 3) return null;
  const file = parts[0].trim();
  const lineNum = parseInt(parts[1].trim(), 10);
  if (isNaN(lineNum)) return null;

  return {
    file,
    line: lineNum,
    rule: `shellcheck-${scMatch[1]}`,
    message: line,
  };
}

function parseShellcheckBlocks(lines: string[]): QaLinterIssue[] {
  const issues: QaLinterIssue[] = [];
  let currentFile = '';
  let currentLine = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('In ') && line.includes(' line ')) {
      const match = line.match(/^In\s+([^\s]+)\s+line\s+(\d+):/);
      if (match) {
        currentFile = match[1];
        currentLine = parseInt(match[2], 10);
      }
    } else if (currentFile && line.includes('SC')) {
      const scMatch = line.match(/(SC\d+)/);
      if (scMatch) {
        issues.push({
          file: currentFile,
          line: currentLine,
          rule: `shellcheck-${scMatch[1]}`,
          message: line,
        });
        currentFile = '';
      }
    }
  }

  return issues;
}

function parsePsalmIssue(line: string): QaLinterIssue | null {
  const match = line.match(/^ERROR:\s*([a-zA-Z0-9_-]+)\s*-\s*([^:]+):(\d+):(?:\d+)\s*-\s*(.+)$/);
  if (!match) return null;
  return {
    file: match[2].trim(),
    line: parseInt(match[3], 10),
    rule: `psalm-${match[1]}`,
    message: match[4].trim(),
  };
}

function parsePhpstanIssue(line: string): QaLinterIssue | null {
  const match = line.match(/^([^:]+\.php):(\d+):(.+)$/);
  if (match) {
    return {
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      rule: 'phpstan-error',
      message: match[3].trim(),
    };
  }
  return null;
}

function parseSingleLineIssue(line: string): QaLinterIssue | null {
  return (
    parseRadonIssue(line) ||
    parseMypyIssue(line) ||
    parseRuffIssue(line) ||
    parseEslintIssue(line) ||
    parseShellcheckGccIssue(line) ||
    parsePsalmIssue(line) ||
    parsePhpstanIssue(line)
  );
}

/**
 * Parsea problemas de linters y complejidad ciclomática / cognitiva.
 */
export function parseLinterAndComplexity(rawLog: string): QaLinterIssue[] {
  const clean = stripAnsi(rawLog);
  const lines = clean.split(/\r?\n/);
  const issues: QaLinterIssue[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const issue = parseSingleLineIssue(line);
    if (issue) issues.push(issue);
  }

  issues.push(...parseShellcheckBlocks(lines));

  return issues.slice(0, 25);
}

/**
 * Parsea alertas de seguridad de Trivy y Bandit.
 */
export function parseSecurityAlerts(rawLog: string): QaSecurityAlerts {
  const clean = stripAnsi(rawLog);
  let critical = 0;
  let high = 0;

  const trivySummaryMatch = clean.match(/CRITICAL:\s*(\d+)[\s,]+HIGH:\s*(\d+)/i);
  if (trivySummaryMatch) {
    return {
      critical: parseInt(trivySummaryMatch[1], 10),
      high: parseInt(trivySummaryMatch[2], 10),
    };
  }

  const critCountMatch = clean.match(/CRITICAL\s*\|\s*(\d+)/i) || clean.match(/CRITICAL:\s*(\d+)/i);
  const highCountMatch = clean.match(/HIGH\s*\|\s*(\d+)/i) || clean.match(/HIGH:\s*(\d+)/i);

  if (critCountMatch) {
    critical = parseInt(critCountMatch[1], 10);
  } else if (!clean.includes('no security findings')) {
    const critMatches = clean.match(/\bCRITICAL\b/gi);
    critical = critMatches ? Math.min(critMatches.length, 10) : 0;
  }

  if (highCountMatch) {
    high = parseInt(highCountMatch[1], 10);
  } else if (!clean.includes('no security findings')) {
    const highMatches = clean.match(/\bHIGH\b/gi);
    high = highMatches ? Math.min(highMatches.length, 10) : 0;
  }

  return { critical, high };
}

/**
 * Parsea resúmenes de pruebas de mutación (Mutmut y Stryker).
 */
export function parseMutation(rawLog: string): QaMutationSummary | null {
  const clean = stripAnsi(rawLog);

  const scoreMatch =
    clean.match(/Mutation Score Indicator \(MSI\):\s*([0-9.]+)%/i) ||
    clean.match(/Mutation score:\s*([0-9.]+)%/i) ||
    clean.match(/Mutation Score:\s*([0-9.]+)%/i);

  const survivedMatch =
    clean.match(/(?:Survived|survived):\s*(\d+)/i) ||
    clean.match(/Mutants survived:\s*(\d+)/i) ||
    clean.match(/(\d+)\s+escaped/i) ||
    clean.match(/(\d+)\s+mutants were not covered/i);

  if (!scoreMatch && !survivedMatch) {
    return null;
  }

  const mutationScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
  const mutantsSurvived = survivedMatch ? parseInt(survivedMatch[1], 10) : 0;

  return {
    mutation_score: Math.round(mutationScore * 100) / 100,
    mutants_survived: mutantsSurvived,
  };
}

/**
 * Determina el estado PASSED o FAILED a partir de los datos parseados.
 */
function evaluateQaStatus(
  exitCode: number,
  stage: string,
  failedTestsCount: number,
  coverage: QaCoverageSummary,
  linterIssuesCount: number
): 'PASSED' | 'FAILED' {
  if (exitCode !== 0 || failedTestsCount > 0) {
    return 'FAILED';
  }

  const isTestStage = stage === 'unit' || stage === 'all';
  if (isTestStage && coverage.detected && !coverage.passed) {
    return 'FAILED';
  }

  const isLintStage = stage === 'lint' || stage === 'all';
  if (isLintStage && linterIssuesCount > 0) {
    return 'FAILED';
  }

  return 'PASSED';
}

/**
 * Función unificada que orquesta todos los parsers ahorradores de tokens,
 * transformando miles de líneas de salida de Docker en un JSON compacto de menos de 40 líneas.
 */
export function parseQaOutput(
  stdout: string,
  stderr: string,
  stage: string,
  durationMs = 0,
  exitCode = 0
): QaExecutionResult {
  const combinedLog = `${stdout}\n${stderr}`;

  const coverage = parseCoverage(combinedLog);
  const failedTests = parseFailedTests(combinedLog);
  const linterIssues = parseLinterAndComplexity(combinedLog);
  const securityAlerts = parseSecurityAlerts(combinedLog);
  const mutationSummary = parseMutation(combinedLog);
  const tailLog = parseTailLog(combinedLog, 15);

  const status = evaluateQaStatus(
    exitCode,
    stage,
    failedTests.length,
    coverage,
    linterIssues.length
  );

  return {
    status,
    stage,
    exit_code: exitCode,
    duration_ms: durationMs,
    coverage,
    failed_tests: failedTests,
    linter_and_complexity_issues: linterIssues,
    security_alerts: securityAlerts,
    mutation_summary: mutationSummary,
    tail_log: tailLog,
  };
}
