// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import * as path from 'node:path';
import {
  type AgentsMdMergeOptions,
  mergeOrAppendAgentsMdContent,
} from '../agents-connector.js';

function isMakefileCommandBoundary(prefix: string, beforeChar: string): boolean {
  if (beforeChar !== ' ') {
    return beforeChar === '\t' || beforeChar === ';' || beforeChar === '&' || beforeChar === '|';
  }
  const trimmed = prefix.trimEnd();
  if (!trimmed || trimmed.endsWith(';') || trimmed.endsWith('&') || trimmed.endsWith('|')) {
    return true;
  }
  const lastSep = Math.max(trimmed.lastIndexOf(' '), trimmed.lastIndexOf('\t'));
  const prevToken = trimmed.slice(lastSep + 1);
  if (prevToken === 'run' || prevToken === '-m' || prevToken.includes('=')) {
    return true;
  }
  return /\bdocker\b/.test(trimmed) && !prevToken.startsWith('-');
}

function findMakefileToolCmdIndex(line: string, toolName: 'pytest' | 'mypy'): number {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const idx = line.indexOf(toolName, searchFrom);
    if (idx === -1) return -1;
    const afterChar = line[idx + toolName.length];
    const beforeChar = idx > 0 ? line.charAt(idx - 1) : '\t';
    const validAfter = afterChar === undefined || afterChar === ' ' || afterChar === '\t';
    if (validAfter && isMakefileCommandBoundary(line.slice(0, idx), beforeChar)) {
      return idx;
    }
    searchFrom = idx + toolName.length;
  }
  return -1;
}

function hardenPytestMakefileLine(line: string, changes: string[]): string {
  const pytestIdx = findMakefileToolCmdIndex(line, 'pytest');
  if (pytestIdx === -1) {
    return line;
  }
  let updated = line;
  const hasBareAddopts =
    updated.includes('-o addopts=""') || updated.includes("-o addopts=''");

  if (hasBareAddopts && !updated.includes('--cov')) {
    updated = updated.replace(/(-o\s+addopts=(?:""|''))/, '$1 --cov=src --cov-fail-under=95');
    changes.push(
      'Inyectado "--cov=src --cov-fail-under=95" junto a "-o addopts=\\"\\"" en Makefile'
    );
  }
  if (hasBareAddopts && !updated.includes('--import-mode=importlib')) {
    const insertAt = findMakefileToolCmdIndex(updated, 'pytest');
    updated = `${updated.slice(0, insertAt)}pytest --import-mode=importlib${updated.slice(insertAt + 6)}`;
    changes.push('Inyectado "--import-mode=importlib" junto a "-o addopts=\\"\\"" en Makefile');
  }
  if (
    updated.includes('docker') &&
    updated.includes('run --rm') &&
    !updated.includes('COVERAGE_FILE')
  ) {
    updated = updated.replace('run --rm', 'run --rm -e COVERAGE_FILE=/tmp/.coverage');
    changes.push('Inyectado "-e COVERAGE_FILE=/tmp/.coverage" para contenedor no-root en Makefile');
  }
  return updated;
}

function hardenMakefileLine(line: string, changes: string[]): string {
  if (!line.startsWith('\t')) {
    return line;
  }
  const trimmedCmd = line.trimStart();
  if (trimmedCmd.startsWith('#') || /^@?(?:echo|printf)\b/.test(trimmedCmd)) {
    return line;
  }
  let updated = hardenPytestMakefileLine(line, changes);
  const mypyIdx = findMakefileToolCmdIndex(updated, 'mypy');
  if (mypyIdx !== -1 && !updated.includes('--cache-dir')) {
    updated = `${updated.slice(0, mypyIdx)}mypy --cache-dir=/tmp/mypy${updated.slice(mypyIdx + 4)}`;
    changes.push('Inyectado "--cache-dir=/tmp/mypy" en invocación de mypy en Makefile');
  }
  return updated;
}

const MAKE_VAR_ASSIGN_RE = /^([A-Za-z_]\w*)\s*(?:\?=|:=|\+=|=)/;

function collectExistingMakeVars(lines: readonly string[]): Set<string> {
  const vars = new Set<string>();
  for (const line of lines) {
    const m = MAKE_VAR_ASSIGN_RE.exec(line);
    if (m?.[1]) {
      vars.add(m[1]);
    }
  }
  return vars;
}

function extractMissingHeaderMakeVars(
  exampleText: string,
  existingVars: ReadonlySet<string>,
  changes: string[]
): string[] {
  const missingLines: string[] = [];
  for (const line of exampleText.split('\n')) {
    const targetMatch = /^([a-zA-Z0-9_.-]+):(?!=)/.exec(line);
    if (targetMatch?.[1] && targetMatch[1] !== '.PHONY') {
      break;
    }
    const varMatch = MAKE_VAR_ASSIGN_RE.exec(line);
    if (varMatch?.[1] && !existingVars.has(varMatch[1])) {
      missingLines.push(line);
      changes.push(`Añadida variable Makefile: "${varMatch[1]}"`);
    }
  }
  return missingLines;
}

/**
 * Fusión aditiva de Makefiles:
 * Conserva targets existentes, preserva variables de cabecera e inyecta únicamente targets ausentes.
 */
export function mergeMakefileContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent,
      changes: ['Creado Makefile con plantilla base completa.'],
    };
  }

  const changes: string[] = [];
  const normalizedTarget = targetContent.replace(/\r\n/g, '\n');
  const normalizedExample = exampleContent.replace(/\r\n/g, '\n');
  const targetLines = normalizedTarget.split('\n');
  const existingTargets = new Set<string>();
  const existingVars = collectExistingMakeVars(targetLines);

  for (const line of targetLines) {
    const targetMatch = /^([a-zA-Z0-9_.-]+):(?!=)/.exec(line);
    if (targetMatch && targetMatch[1] !== undefined) {
      existingTargets.add(targetMatch[1]);
    }
  }

  const missingHeaderVars = extractMissingHeaderMakeVars(normalizedExample, existingVars, changes);
  const exampleBlocks = normalizedExample.split(/\n(?=[a-zA-Z0-9_.-]+:(?!=))/);
  let appendedBlocks = '';

  if (missingHeaderVars.length > 0 && existingTargets.has('.PHONY')) {
    appendedBlocks += `\n# --- Variables base QA 11X Blueprints ---\n${missingHeaderVars.join('\n')}\n`;
  }

  for (const block of exampleBlocks) {
    const targetMatch = /^([a-zA-Z0-9_.-]+):(?!=)/.exec(block.trim());
    if (targetMatch && targetMatch[1] !== undefined) {
      const targetName = targetMatch[1];
      if (!existingTargets.has(targetName)) {
        appendedBlocks += `\n# --- Añadido por QA 11X Blueprints ---\n${block.trim()}\n`;
        changes.push(`Añadido target Makefile: "${targetName}"`);
      }
    }
  }

  const mergedText = normalizedTarget.trimEnd() + (appendedBlocks ? '\n' + appendedBlocks : '\n');
  const hardenedLines = mergedText.split('\n').map((line) => hardenMakefileLine(line, changes));

  return { merged: hardenedLines.join('\n'), changes };
}

/**
 * Fusión idempotente para .gitignore y .npmrc
 */
export function mergeGitignoreOrNpmrcContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  const existingLines = new Set(
    targetContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
  );

  const changes: string[] = [];
  const missingLines: string[] = [];

  for (const line of exampleContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('#') && !existingLines.has(trimmed)) {
      missingLines.push(trimmed);
      changes.push(`Añadida regla: "${trimmed}"`);
    }
  }

  let merged = targetContent.trimEnd();
  if (missingLines.length > 0) {
    merged += '\n# --- Añadido por QA 11X Blueprints ---\n' + missingLines.join('\n') + '\n';
  } else {
    merged += '\n';
  }

  return { merged, changes };
}

function extractCommandRoot(cmdLines: string[]): string | null {
  for (const line of cmdLines) {
    const idx = line.indexOf('root:');
    if (idx === -1 || line.slice(0, idx).trim() !== '') {
      continue;
    }
    const value = line.slice(idx + 5).split('#')[0]?.trim() ?? '';
    let unquoted = value.replaceAll('"', '').replaceAll("'", '');
    while (unquoted.endsWith('/')) {
      unquoted = unquoted.slice(0, -1);
    }
    if (unquoted) {
      return unquoted;
    }
  }
  return null;
}

function isCommandAllowedInTarget(cmdLines: string[], targetProjectDir: string): boolean {
  const rootRel = extractCommandRoot(cmdLines);
  return rootRel ? fs.existsSync(path.join(targetProjectDir, rootRel)) : true;
}

function splitLefthookSubBlocks(blockLines: string[]): { prefix: string[]; commands: string[][] } {
  const prefix: string[] = [];
  const commands: string[][] = [];
  let current: string[] | null = null;
  for (const line of blockLines) {
    if (/^ {4}[a-zA-Z0-9_-]{1,64}:/.test(line)) {
      current = [line];
      commands.push(current);
    } else if (current) {
      current.push(line);
    } else {
      prefix.push(line);
    }
  }
  return { prefix, commands };
}

function filterLefthookBlockLines(blockLines: string[], targetProjectDir?: string): string[] {
  if (!targetProjectDir) {
    return blockLines;
  }
  const { prefix, commands } = splitLefthookSubBlocks(blockLines);
  if (commands.length === 0) {
    return blockLines;
  }
  const kept = commands.filter((cmd) => isCommandAllowedInTarget(cmd, targetProjectDir));
  return kept.length === 0 ? [] : [...prefix, ...kept.flat()];
}

/**
 * Fusión quirúrgica e idempotente para lefthook.yml preservando la jerarquía YAML
 */
export function mergeLefthookYamlContent(
  targetContent: string,
  exampleContent: string,
  targetProjectDir?: string
): { merged: string; changes: string[] } {
  const changes: string[] = [];
  const topLevelBlocks: Array<{ header: string; lines: string[] }> = [];
  let currentHeader: string | null = null;
  let currentLines: string[] = [];

  for (const line of exampleContent.split(/\r?\n/)) {
    const topMatch = /^([a-zA-Z0-9_-]+):\s*$/.exec(line);
    if (topMatch && topMatch[1] !== undefined) {
      if (currentHeader) {
        topLevelBlocks.push({ header: currentHeader, lines: currentLines });
      }
      currentHeader = topMatch[1];
      currentLines = [line];
    } else if (currentHeader) {
      currentLines.push(line);
    }
  }
  if (currentHeader) {
    topLevelBlocks.push({ header: currentHeader, lines: currentLines });
  }

  let merged = targetContent.trimEnd();
  for (const block of topLevelBlocks) {
    const expectedHeader = `${block.header}:`;
    const alreadyDefined = merged.split(/\r?\n/).some((l) => l.trimEnd() === expectedHeader);
    const filteredLines = filterLefthookBlockLines(block.lines, targetProjectDir);
    if (!alreadyDefined && filteredLines.length > 0) {
      merged += '\n\n' + filteredLines.join('\n').trimEnd();
      changes.push(`Añadido bloque de hook YAML: "${block.header}:"`);
    }
  }

  return { merged: merged + '\n', changes };
}

/**
 * Fusión quirúrgica y aditiva de AGENTS.md
 */
export function mergeAgentsMdContent(
  targetContent: string,
  projectName = 'Project',
  stacks: string[] = [],
  langOrOptions: AgentsMdMergeOptions | 'auto' | 'es' | 'en' = 'auto'
): { merged: string; changes: string[] } {
  const res = mergeOrAppendAgentsMdContent(targetContent, projectName, stacks, langOrOptions);
  return {
    merged: res.finalContent,
    changes: res.finalContent === targetContent ? [] : res.changes,
  };
}
