// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';

const ALLOW_PLUGINS_KEY = 'allow-plugins';
const REQUIRE_DEV_KEY = 'require-dev';
const SCRIPTS_KEY = 'scripts';

function parseTargetPackageJson(
  targetContent: string
): { readonly ok: true; readonly obj: Record<string, unknown> } | { readonly ok: false; readonly err: string } {
  if (!targetContent.trim()) {
    return { ok: true, obj: {} };
  }
  try {
    const parsed = JSON.parse(targetContent) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        err: 'Error: package.json destino no contiene un objeto JSON válido; preservado sin modificar',
      };
    }
    return { ok: true, obj: parsed as Record<string, unknown> };
  } catch (err: unknown) {
    reportDebugCatchError('surgicalMerger.mergePackageJson', err);
    return {
      ok: false,
      err: 'Error: package.json destino contiene JSON inválido; preservado sin modificar',
    };
  }
}

function injectEslintMaxWarnings(part: string): string {
  if (!/\beslint\b/.test(part) || part.includes('--max-warnings')) {
    return part;
  }
  const trimmedEnd = part.trimEnd();
  const trailing = part.slice(trimmedEnd.length);
  const lastChar = trimmedEnd.slice(-1);
  if ((lastChar === '"' || lastChar === "'") && /\b(?:sh|bash)\s+-c\b/.test(trimmedEnd)) {
    return `${trimmedEnd.slice(0, -1)} --max-warnings 0${lastChar}${trailing}`;
  }
  return `${trimmedEnd} --max-warnings 0${trailing}`;
}

function mergePackageScriptsSection(
  targetObj: Record<string, unknown>,
  exampleObj: Record<string, unknown>,
  changes: string[]
): void {
  const targetScripts = (targetObj.scripts as Record<string, string>) || {};
  const exampleScripts = (exampleObj.scripts as Record<string, string>) || {};
  const mergedScripts = { ...targetScripts };

  for (const [scriptName, scriptCmd] of Object.entries(exampleScripts)) {
    if (!mergedScripts[scriptName]) {
      mergedScripts[scriptName] = scriptCmd;
      changes.push(`Añadido script: "${scriptName}": "${scriptCmd}"`);
    }
  }

  if (
    typeof mergedScripts.lint === 'string' &&
    /\beslint\b/.test(mergedScripts.lint) &&
    !mergedScripts.lint.includes('--max-warnings')
  ) {
    const segments = mergedScripts.lint.split(/(&&|\|\||;|\|(?!\|))/);
    mergedScripts.lint = segments.map((part) => injectEslintMaxWarnings(part)).join('');
    changes.push('Inyectado flag estricto "--max-warnings 0" en script "lint"');
  }

  targetObj.scripts = mergedScripts;
}

function alignExactPlaywrightKey(
  deps: Record<string, string>,
  pkgName: string,
  expected: string,
  changes: string[]
): void {
  const current = deps[pkgName];
  if (typeof current === 'string' && current !== expected) {
    deps[pkgName] = expected;
    changes.push(`Alineada versión exacta "${pkgName}": "${current}" -> "${expected}"`);
  }
}

function alignExactPlaywrightVersion(
  targetObj: Record<string, unknown>,
  mergedDevDeps: Record<string, string>,
  exampleDevDeps: Record<string, string>,
  changes: string[]
): void {
  const rawDeps = targetObj.dependencies;
  const deps =
    rawDeps && typeof rawDeps === 'object' && !Array.isArray(rawDeps)
      ? (rawDeps as Record<string, string>)
      : null;

  for (const pkgName of ['@playwright/test', 'playwright']) {
    const expected = exampleDevDeps[pkgName];
    if (!expected || !/^\d+\.\d+\.\d+$/.test(expected)) continue;
    alignExactPlaywrightKey(mergedDevDeps, pkgName, expected, changes);
    if (deps) {
      alignExactPlaywrightKey(deps, pkgName, expected, changes);
    }
  }
}

function mergePackageDevDepsSection(
  targetObj: Record<string, unknown>,
  exampleObj: Record<string, unknown>,
  changes: string[]
): void {
  const targetDevDeps = (targetObj.devDependencies as Record<string, string>) || {};
  const exampleDevDeps = (exampleObj.devDependencies as Record<string, string>) || {};
  const mergedDevDeps = { ...targetDevDeps };

  for (const [pkg, ver] of Object.entries(exampleDevDeps)) {
    if (!mergedDevDeps[pkg] && !(targetObj.dependencies as Record<string, string>)?.[pkg]) {
      mergedDevDeps[pkg] = ver;
      changes.push(`Añadida devDependency: "${pkg}": "${ver}"`);
    }
  }
  alignExactPlaywrightVersion(targetObj, mergedDevDeps, exampleDevDeps, changes);
  targetObj.devDependencies = mergedDevDeps;
}

function stripLegacyPnpmOnlyBuiltDeps(
  targetObj: Record<string, unknown>,
  changes: string[]
): void {
  const rawPnpm = targetObj.pnpm;
  if (!rawPnpm || typeof rawPnpm !== 'object' || Array.isArray(rawPnpm)) return;
  const pnpmCfg = { ...(rawPnpm as Record<string, unknown>) };
  if (!('onlyBuiltDependencies' in pnpmCfg)) return;
  delete pnpmCfg.onlyBuiltDependencies;
  if (Object.keys(pnpmCfg).length === 0) {
    delete targetObj.pnpm;
  } else {
    targetObj.pnpm = pnpmCfg;
  }
  changes.push(
    'Eliminada clave obsoleta "pnpm.onlyBuiltDependencies" (usar pnpm-workspace.yaml#allowBuilds)'
  );
}

/**
 * Fusión quirúrgica de package.json:
 * Conserva 'name', 'version', 'dependencies', y solo inyecta devDependencies y scripts faltantes.
 */
export function mergePackageJsonContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  const parsedTarget = parseTargetPackageJson(targetContent);
  if (!parsedTarget.ok) {
    return { merged: targetContent, changes: [parsedTarget.err] };
  }
  const targetObj = parsedTarget.obj;
  const exampleObj = JSON.parse(exampleContent) as Record<string, unknown>;
  const changes: string[] = [];

  mergePackageScriptsSection(targetObj, exampleObj, changes);
  mergePackageDevDepsSection(targetObj, exampleObj, changes);
  stripLegacyPnpmOnlyBuiltDeps(targetObj, changes);

  return {
    merged: JSON.stringify(targetObj, null, 2) + '\n',
    changes,
  };
}

function parseAllowBuildsHeaderLine(line: string): { isHeader: boolean; isEmptyMap: boolean } {
  if (!line.startsWith('allowBuilds:')) {
    return { isHeader: false, isEmptyMap: false };
  }
  const rawRest = line.slice('allowBuilds:'.length);
  const hashIdx = rawRest.indexOf('#');
  const codePart = (hashIdx === -1 ? rawRest : rawRest.slice(0, hashIdx)).trim();
  if (codePart === '') {
    return { isHeader: true, isEmptyMap: false };
  }
  if (codePart === '{}') {
    return { isHeader: true, isEmptyMap: true };
  }
  return { isHeader: false, isEmptyMap: false };
}

function extractAllowBuildsEntries(yamlContent: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const lines = yamlContent.split(/\r?\n/);
  let inBlock = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('#')) {
      continue;
    }
    const header = parseAllowBuildsHeaderLine(line);
    if (header.isHeader) {
      inBlock = !header.isEmptyMap;
      continue;
    }
    if (!inBlock) continue;
    if (/^[A-Za-z0-9_.-]+:/.test(line)) break;
    const entryMatch = /^\s+([^\s:#]+|"[^"]+"|'[^']+')\s*:\s*(true|false)\s*$/.exec(line);
    if (entryMatch && entryMatch[1] !== undefined && entryMatch[2] !== undefined) {
      entries.push([entryMatch[1], entryMatch[2]]);
    }
  }
  return entries;
}

function normalizeYamlPkgKey(rawKey: string): string {
  return rawKey.replace(/^['"]|['"]$/g, '');
}

/**
 * Fusión quirúrgica e idempotente para pnpm-workspace.yaml (mapa booleano allowBuilds en pnpm 12+)
 */
export function mergePnpmWorkspaceYamlContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent.trimEnd() + '\n',
      changes: ['Creado pnpm-workspace.yaml con mapa booleano allowBuilds.'],
    };
  }

  const exampleEntries = extractAllowBuildsEntries(exampleContent);
  if (exampleEntries.length === 0) {
    return { merged: targetContent.trimEnd() + '\n', changes: [] };
  }

  const existingEntries = extractAllowBuildsEntries(targetContent);
  const existingKeys = new Set(existingEntries.map(([k]) => normalizeYamlPkgKey(k)));
  const missingLines: string[] = [];
  const changes: string[] = [];

  for (const [rawKey, boolVal] of exampleEntries) {
    const normalized = normalizeYamlPkgKey(rawKey);
    if (!existingKeys.has(normalized)) {
      missingLines.push(`  ${rawKey}: ${boolVal}`);
      changes.push(`Añadido allowBuilds["${normalized}"]: ${boolVal}`);
    }
  }

  if (missingLines.length === 0) {
    return { merged: targetContent.trimEnd() + '\n', changes: [] };
  }

  const targetLines = targetContent.trimEnd().split(/\r?\n/);
  const headerIdx = targetLines.findIndex((line) => parseAllowBuildsHeaderLine(line).isHeader);
  if (headerIdx === -1) {
    return {
      merged: `${targetContent.trimEnd()}\nallowBuilds:\n${missingLines.join('\n')}\n`,
      changes,
    };
  }

  if ((targetLines[headerIdx] ?? '').includes('{}')) {
    targetLines[headerIdx] = 'allowBuilds:';
  }

  let insertAt = headerIdx + 1;
  while (insertAt < targetLines.length) {
    const candidateLine = targetLines[insertAt];
    if (candidateLine === undefined || /^[A-Za-z0-9_.-]+:/.test(candidateLine)) {
      break;
    }
    insertAt++;
  }
  targetLines.splice(insertAt, 0, ...missingLines);
  return { merged: targetLines.join('\n') + '\n', changes };
}

function migrateSecurityRecommendedLegacy(
  targetObj: Record<string, unknown>,
  changes: string[]
): void {
  if (!Array.isArray(targetObj.extends)) return;
  targetObj.extends = targetObj.extends.map((entry: unknown): unknown => {
    if (entry === 'plugin:security/recommended') {
      changes.push(
        'Migrado "plugin:security/recommended" a "plugin:security/recommended-legacy" (ESLint 8)'
      );
      return 'plugin:security/recommended-legacy';
    }
    return entry;
  });
}

function mergeIgnorePatternsArray(
  targetObj: Record<string, unknown>,
  exampleObj: Record<string, unknown>,
  changes: string[]
): void {
  const examplePatterns = Array.isArray(exampleObj.ignorePatterns)
    ? exampleObj.ignorePatterns.filter((p): p is string => typeof p === 'string')
    : [];
  if (examplePatterns.length === 0) return;

  const existingPatterns = Array.isArray(targetObj.ignorePatterns)
    ? targetObj.ignorePatterns.filter((p): p is string => typeof p === 'string')
    : [];
  const seen = new Set(existingPatterns);
  const merged = [...existingPatterns];
  for (const pat of examplePatterns) {
    if (!seen.has(pat)) {
      merged.push(pat);
      seen.add(pat);
      changes.push(`Añadido ignorePatterns: "${pat}"`);
    }
  }
  targetObj.ignorePatterns = merged;
}

/**
 * Fusión quirúrgica para .eslintrc.json: migra plugin:security/recommended a recommended-legacy e ignorePatterns
 */
export function mergeEslintrcJsonContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent.trimEnd() + '\n',
      changes: ['Creado .eslintrc.json con configuración canónica 11X.'],
    };
  }

  let targetObj: Record<string, unknown>;
  let exampleObj: Record<string, unknown>;
  try {
    targetObj = JSON.parse(targetContent) as Record<string, unknown>;
    exampleObj = JSON.parse(exampleContent) as Record<string, unknown>;
  } catch (err: unknown) {
    reportDebugCatchError('surgicalMerger.mergeEslintrcJson', err);
    return { merged: targetContent.trimEnd() + '\n', changes: [] };
  }

  const changes: string[] = [];
  migrateSecurityRecommendedLegacy(targetObj, changes);
  mergeIgnorePatternsArray(targetObj, exampleObj, changes);

  return {
    merged: JSON.stringify(targetObj, null, 2) + '\n',
    changes,
  };
}

/**
 * Fusión quirúrgica no destructiva para eslint.config.mjs (ESLint 9 Flat Config)
 */
export function mergeEslintConfigMjsContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent.trimEnd() + '\n',
      changes: ['Creado eslint.config.mjs con configuración Flat Config 11X.'],
    };
  }
  return {
    merged: targetContent.trimEnd() + '\n',
    changes: [],
  };
}

/**
 * Fusión quirúrgica e idempotente para vitest.setup.ts preservando polyfill localStorage (Node 26+)
 */
export function mergeVitestSetupTsContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent.trimEnd() + '\n',
      changes: ['Creado vitest.setup.ts con polyfill localStorage para Node 26+.'],
    };
  }
  if (targetContent.includes('localStorage')) {
    return { merged: targetContent.trimEnd() + '\n', changes: [] };
  }
  const polyfillOnly = exampleContent
    .split(/\r?\n/)
    .filter((line) => !/['"]@testing-library\/jest-dom(?:\/vitest)?['"]/.test(line))
    .join('\n')
    .trim();
  const merged = `${targetContent.trimEnd()}\n\n${polyfillOnly}\n`;
  return {
    merged,
    changes: ['Inyectado polyfill localStorage en memoria para compatibilidad Vitest + Node 26'],
  };
}

function mergeJsonDictionarySection(
  targetObj: Record<string, unknown>,
  sourceObj: Record<string, unknown>,
  sectionKey: string,
  changes: string[]
): void {
  const targetSection = (targetObj[sectionKey] as Record<string, unknown>) || {};
  const sourceSection = (sourceObj[sectionKey] as Record<string, unknown>) || {};
  const mergedSection = { ...targetSection };

  for (const [key, value] of Object.entries(sourceSection)) {
    if (mergedSection[key] === undefined) {
      mergedSection[key] = value;
      changes.push(`Añadido ${sectionKey}["${key}"]: ${JSON.stringify(value)}`);
    }
  }
  targetObj[sectionKey] = mergedSection;
}

/**
 * Fusión quirúrgica de composer.json
 */
export function mergeComposerJsonContent(
  targetContent: string,
  exampleContent: string
): { merged: string; content: string; changes: string[] } {
  let targetObj: Record<string, unknown> = {};
  if (targetContent.trim()) {
    try {
      const parsed: unknown = JSON.parse(targetContent);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          merged: targetContent,
          content: targetContent,
          changes: ['Error: composer.json destino contiene JSON inválido; preservado sin modificar'],
        };
      }
      targetObj = parsed as Record<string, unknown>;
    } catch (err: unknown) {
      reportDebugCatchError('surgicalMerger.mergeComposerJson(target)', err);
      return {
        merged: targetContent,
        content: targetContent,
        changes: ['Error: composer.json destino contiene JSON inválido; preservado sin modificar'],
      };
    }
  }
  let exampleObj: Record<string, unknown> = {};
  try {
    exampleObj = JSON.parse(exampleContent) as Record<string, unknown>;
  } catch (err: unknown) {
    reportDebugCatchError('surgicalMerger.mergeComposerJson(example)', err);
    exampleObj = {};
  }
  const changes: string[] = [];

  mergeJsonDictionarySection(targetObj, exampleObj, REQUIRE_DEV_KEY, changes);
  mergeJsonDictionarySection(targetObj, exampleObj, SCRIPTS_KEY, changes);

  const tplConfig = (exampleObj.config ?? {}) as Record<string, unknown>;
  if (Object.keys(tplConfig).length > 0) {
    const curConfig = (targetObj.config ?? {}) as Record<string, unknown>;
    targetObj.config = curConfig;
    mergeJsonDictionarySection(curConfig, tplConfig, ALLOW_PLUGINS_KEY, changes);
  }

  const mergedStr = `${JSON.stringify(targetObj, null, 2)}\n`;
  return { merged: mergedStr, content: mergedStr, changes };
}

function extractTomlTableHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[') || trimmed.startsWith('[[')) {
    return null;
  }
  const closeIdx = trimmed.indexOf(']');
  if (closeIdx <= 1) {
    return null;
  }
  const trailing = trimmed.slice(closeIdx + 1).trim();
  if (trailing.length > 0 && !trailing.startsWith('#')) {
    return null;
  }
  return trimmed.slice(1, closeIdx).trim();
}

function collectTomlSections(content: string): {
  sectionOrder: string[];
  sectionMap: Map<string, string>;
} {
  const sectionOrder: string[] = [];
  const sectionMap = new Map<string, string>();
  let currentName: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (currentName !== null) {
      sectionOrder.push(currentName);
      sectionMap.set(currentName, buffer.join('\n').trim());
    }
  };

  for (const line of content.split(/\r?\n/)) {
    const headerName = extractTomlTableHeader(line);
    if (headerName !== null) {
      flush();
      currentName = headerName;
      buffer = [line];
      continue;
    }
    if (currentName !== null) {
      buffer.push(line);
    }
  }
  flush();
  return { sectionOrder, sectionMap };
}

/**
 * Fusión quirúrgica de pyproject.toml:
 * Conserva [project] y dependencies intactos, e inyecta secciones [tool.*] faltantes.
 */
export function mergePyprojectTomlContent(
  targetContent: string,
  exampleContent: string
): { merged: string; changes: string[] } {
  if (!targetContent.trim()) {
    return {
      merged: exampleContent,
      changes: ['Creado pyproject.toml con plantilla base completa.'],
    };
  }

  const changes: string[] = [];
  const { sectionOrder, sectionMap } = collectTomlSections(exampleContent);
  const existingTables = new Set<string>();
  for (const line of targetContent.split(/\r?\n/)) {
    const tbl = extractTomlTableHeader(line);
    if (tbl) existingTables.add(tbl);
  }

  let merged = targetContent.trimEnd() + '\n';
  for (const sec of sectionOrder) {
    if (!sec.startsWith('tool.') || existingTables.has(sec)) continue;
    const body = sectionMap.get(sec);
    if (body) {
      merged += `\n# --- Inyectado por QA 11X Blueprints ---\n${body}\n`;
      changes.push(`Inyectada sección: [${sec}]`);
    }
  }

  return { merged, changes };
}
