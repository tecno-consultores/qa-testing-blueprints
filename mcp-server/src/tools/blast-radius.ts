// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BlastRadiusResult } from '../types.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', '.cache']);
const VALID_EXTENSIONS = new Set(['.ts', '.js', '.py', '.vue', '.tsx', '.jsx', '.sh', '.bats']);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calculateRiskLevel(count: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (count > 10) return 'CRITICAL';
  if (count >= 6) return 'HIGH';
  if (count >= 3) return 'MEDIUM';
  return 'LOW';
}

function registerSuggestedTest(rel: string, ext: string, suggestedTests: Set<string>): void {
  if (
    rel.includes('.unit.') ||
    rel.includes('.spec.') ||
    rel.includes('.e2e.') ||
    rel.endsWith('.feature') ||
    rel.endsWith('.bats')
  ) {
    suggestedTests.add(rel);
  } else {
    const baseName = path.basename(rel, ext);
    suggestedTests.add(`tests/**/${baseName}.unit.*`);
  }
}

function processCandidateFile(
  fullPath: string,
  rel: string,
  ext: string,
  cleanSymbol: string,
  dependentFiles: string[],
  suggestedTests: Set<string>
): void {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const safePattern = escapeRegex(cleanSymbol);
    // eslint-disable-next-line security/detect-non-literal-regexp
    const symbolRegex = new RegExp(`\\b${safePattern}\\b`);
    if (symbolRegex.test(content)) {
      dependentFiles.push(rel);
      registerSuggestedTest(rel, ext, suggestedTests);
    }
  } catch {
    // Ignorar archivos ilegibles
  }
}

function scanDirectory(
  dir: string,
  rootPath: string,
  cleanSymbol: string,
  dependentFiles: string[],
  suggestedTests: Set<string>
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, rootPath, cleanSymbol, dependentFiles, suggestedTests);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.has(ext)) {
        const rel = path.relative(rootPath, fullPath);
        processCandidateFile(fullPath, rel, ext, cleanSymbol, dependentFiles, suggestedTests);
      }
    }
  }
}

export async function inspectAstBlastRadius(
  projectPathInput: string,
  targetSymbol: string
): Promise<BlastRadiusResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio no existe: ${resolvedPath}`);
  }

  const cleanSymbol = targetSymbol.trim();
  const dependentFiles: string[] = [];
  const suggestedTests = new Set<string>();

  scanDirectory(resolvedPath, resolvedPath, cleanSymbol, dependentFiles, suggestedTests);

  const count = dependentFiles.length;
  const riskLevel = calculateRiskLevel(count);

  return {
    project_path: resolvedPath,
    target_symbol: cleanSymbol,
    risk_level: riskLevel,
    dependent_files_count: count,
    dependent_files: dependentFiles.sort(),
    suggested_tests_to_run: Array.from(suggestedTests).sort(),
  };
}
