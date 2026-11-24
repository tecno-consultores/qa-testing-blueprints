// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt, reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { inspectDockerfileLockFile } from './healthAndSdkRules.js';
import {
  E2E_TEST_FILE_RE,
  EXACT_SEMVER_RE,
  HYDRATION_LISTENER_RE,
  JSX_PREHYDRATE_STATE_MARKERS,
  PKG_DEP_SECTIONS,
  PLAYWRIGHT_CONFIG_RE,
  PLAYWRIGHT_IMAGE_TAG_RE,
  PLAYWRIGHT_PKGS,
  QA_PLAYWRIGHT_PIN_OK_PRAGMA,
  QA_PLAYWRIGHT_PIN_REF,
  QA_PLAYWRIGHT_PIN_RULE,
  QA_SSR_HYDRATION_OK_PRAGMA,
  QA_SSR_HYDRATION_REF,
  QA_SSR_HYDRATION_RULE,
  SSR_CONFIG_NAME_RE,
  SSR_NPM_DEPS,
  SSR_PREHYDRATE_V_IF_PATTERNS,
  SSR_THEME_MARKERS,
  collectMatchingFiles,
  isAuditorSelfDefinition,
  isDockerfileEntry,
  findLineNumberContaining,
  isDockerfileOrExampleEntry,
  isTestFilePath,
  normalizeExampleRelPath,
  parseJsonObjectTextSafe,
  readTextFileSafe,
  type AuditSecurityOptions,
} from './shared.js';

export function checkQaDockerLock01LockfileAndSmoke(
  projectPath: string,
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const predicate = options?.includeExamples ? isDockerfileOrExampleEntry : isDockerfileEntry;
  const dockerfiles = collectMatchingFiles(projectPath, predicate)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => !isTestFilePath(rel));
  const findings: SecurityFinding[] = [];

  for (const rel of dockerfiles) {
    inspectDockerfileLockFile(projectPath, rel, findings);
  }

  return findings;
}

interface PlaywrightDockerTag {
  dir: string;
  version: string;
}

function collectPlaywrightDockerTags(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): PlaywrightDockerTag[] {
  const includeExamples = options?.includeExamples ?? false;
  const composeRels = allRelFiles.filter((rel) => {
    const effective = normalizeExampleRelPath(rel, options);
    return (
      (includeExamples || !rel.endsWith('.example')) &&
      !isTestFilePath(effective) &&
      !isAuditorSelfDefinition(effective) &&
      /(?:^|\/)(?:docker-compose|compose)[^/]*\.ya?ml$/i.test(effective)
    );
  });
  const dockerPredicate = includeExamples ? isDockerfileOrExampleEntry : isDockerfileEntry;
  const dockerRels = collectMatchingFiles(projectPath, dockerPredicate)
    .map((abs) => path.relative(projectPath, abs))
    .filter((rel) => (includeExamples || !rel.endsWith('.example')) && !isTestFilePath(rel));
  const tags: PlaywrightDockerTag[] = [];

  for (const rel of new Set([...composeRels, ...dockerRels])) {
    const content = readTextFileSafe(path.join(projectPath, rel));
    if (!content || content.includes(QA_PLAYWRIGHT_PIN_OK_PRAGMA)) continue;
    const normDir = path.posix.dirname(rel.replace(/\\/g, '/'));
    for (const match of content.matchAll(PLAYWRIGHT_IMAGE_TAG_RE)) {
      if (match[1]) {
        tags.push({ dir: normDir, version: match[1] });
      }
    }
  }

  return tags;
}

function resolveExpectedPlaywrightTag(
  pkgDir: string,
  dockerTags: PlaywrightDockerTag[]
): string | null {
  const sameDir = dockerTags.find((t) => t.dir === pkgDir);
  if (sameDir) return sameDir.version;

  const ancestorOrChild = dockerTags.find(
    (t) =>
      t.dir === '.' ||
      pkgDir === '.' ||
      pkgDir.startsWith(`${t.dir}/`) ||
      t.dir.startsWith(`${pkgDir}/`)
  );
  if (ancestorOrChild) return ancestorOrChild.version;

  const uniqueVersions = new Set(dockerTags.map((t) => t.version));
  return uniqueVersions.size === 1 ? pickAt(Array.from(uniqueVersions), 0) : null;
}

function collectDeclaredPlaywrightSpecs(
  doc: Record<string, unknown>
): Array<{ pkgName: string; spec: string }> {
  const specs: Array<{ pkgName: string; spec: string }> = [];
  for (const section of PKG_DEP_SECTIONS) {
    const rawBlock = doc[section];
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
    const block = rawBlock as Record<string, unknown>;
    for (const pkgName of PLAYWRIGHT_PKGS) {
      const val = block[pkgName];
      if (typeof val === 'string') {
        specs.push({ pkgName, spec: val.trim() });
      }
    }
  }
  return specs;
}

function inspectPackageJsonPlaywrightPin(
  projectPath: string,
  relPath: string,
  dockerTags: PlaywrightDockerTag[]
): SecurityFinding[] {
  const content = readTextFileSafe(path.join(projectPath, relPath));
  if (!content || content.includes(QA_PLAYWRIGHT_PIN_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(content);
  if (!doc) return [];

  const specs = collectDeclaredPlaywrightSpecs(doc);
  if (specs.length === 0) return [];

  const pkgDir = path.posix.dirname(relPath.replace(/\\/g, '/'));
  const expectedVersion = resolveExpectedPlaywrightTag(pkgDir, dockerTags);

  const findings: SecurityFinding[] = [];
  for (const { pkgName, spec } of specs) {
    const isExact = EXACT_SEMVER_RE.test(spec);
    if (expectedVersion ? !isExact || spec !== expectedVersion : !isExact) {
      findings.push({
        rule_id: QA_PLAYWRIGHT_PIN_RULE,
        severity: 'HIGH',
        stig_owasp_ref: QA_PLAYWRIGHT_PIN_REF,
        file: relPath,
        line: findLineNumberContaining(content, `"${pkgName}"`),
        message: expectedVersion
          ? `La dependencia "${pkgName}": "${spec}" en ${relPath} no fija la versión exacta de mcr.microsoft.com/playwright:v${expectedVersion} (riesgo de desajuste en binarios Chromium).`
          : `La dependencia mutable "${pkgName}": "${spec}" en ${relPath} usa rango semver (^/~) sin fijación exacta de versión Playwright.`,
        remediation: expectedVersion
          ? `Fijar "${pkgName}": "${expectedVersion}" sin prefijos de rango (^, ~) alineado con mcr.microsoft.com/playwright:v${expectedVersion} (o eximir con "${QA_PLAYWRIGHT_PIN_OK_PRAGMA}").`
          : `Fijar "${pkgName}" a una versión semver exacta (X.Y.Z) sin prefijos de rango (^, ~) (o eximir con "${QA_PLAYWRIGHT_PIN_OK_PRAGMA}").`,
      });
    }
  }

  return findings;
}

export function checkQaPlaywrightPin01VersionParity(
  projectPath: string,
  allRelFiles: string[],
  options?: AuditSecurityOptions
): SecurityFinding[] {
  const dockerTags = collectPlaywrightDockerTags(projectPath, allRelFiles, options);
  if (dockerTags.length === 0) return [];

  const findings: SecurityFinding[] = [];
  for (const relPath of allRelFiles) {
    const norm = normalizeExampleRelPath(relPath, options).replace(/\\/g, '/');
    if (!/(?:^|\/)package\.json$/.test(norm) || isTestFilePath(norm) || isAuditorSelfDefinition(norm)) {
      continue;
    }
    findings.push(...inspectPackageJsonPlaywrightPin(projectPath, relPath, dockerTags));
  }

  return findings;
}

const VITEPRESS_CONFIG_FILES = ['config.ts', 'config.mts', 'config.js', 'config.mjs'] as const;

function isScopeProductionSource(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return !norm.endsWith('.example') && !isTestFilePath(norm) && !isAuditorSelfDefinition(norm);
}

function isInScopeDir(normRel: string, scopeDir: string): boolean {
  return scopeDir === '.' || normRel.startsWith(`${scopeDir}/`);
}

function isSsrExtraEntry(entry: fs.Dirent): boolean {
  if (!entry.isFile() || entry.name.endsWith('.example')) return false;
  const lower = entry.name.toLowerCase();
  return (
    lower.endsWith('.css') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cjs')
  );
}

function hasSsrNpmDependency(pkgContent: string): boolean {
  const doc = parseJsonObjectTextSafe(pkgContent);
  if (!doc) return false;
  for (const section of PKG_DEP_SECTIONS) {
    const block = doc[section];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (Object.keys(block).some((dep) => SSR_NPM_DEPS.has(dep))) {
      return true;
    }
  }
  return false;
}

function hasSsrEngineInSources(projectPath: string, files: readonly string[]): boolean {
  for (const rel of files) {
    if (!isScopeProductionSource(rel) || !/\.(?:ts|tsx|js|jsx|vue)$/i.test(rel)) continue;
    const text = readTextFileSafe(path.join(projectPath, rel));
    if (text && (text.includes('createSSRApp(') || text.includes('hydrateRoot('))) {
      return true;
    }
  }
  return false;
}

interface SsrEngineScopeInput {
  readonly projectPath: string;
  readonly scopeAbsDir: string;
  readonly pkgContent: string;
  readonly scopeFiles: readonly string[];
  readonly extraFiles: readonly string[];
}

function hasSsrEngineForScope(input: SsrEngineScopeInput): boolean {
  const { projectPath, scopeAbsDir, pkgContent, scopeFiles, extraFiles } = input;
  if (hasSsrNpmDependency(pkgContent)) return true;
  if (VITEPRESS_CONFIG_FILES.some((f) => fs.existsSync(path.join(scopeAbsDir, '.vitepress', f)))) {
    return true;
  }
  const allScopeCandidates = [...scopeFiles, ...extraFiles];
  if (
    allScopeCandidates.some(
      (rel) => isScopeProductionSource(rel) && SSR_CONFIG_NAME_RE.test(rel.replace(/\\/g, '/'))
    )
  ) {
    return true;
  }
  return hasSsrEngineInSources(projectPath, allScopeCandidates);
}

function hasDualThemeMarkerForScope(
  projectPath: string,
  scopeFiles: readonly string[],
  extraFiles: readonly string[]
): boolean {
  for (const rel of [...scopeFiles, ...extraFiles]) {
    if (!isScopeProductionSource(rel)) continue;
    if (!/\.(?:ts|tsx|js|jsx|vue|html|css|mjs|mts)$/i.test(rel)) continue;
    const text = readTextFileSafe(path.join(projectPath, rel));
    if (text && SSR_THEME_MARKERS.some((marker) => text.includes(marker))) {
      return true;
    }
  }
  return false;
}

function isInsideUseEffectBlock(lines: readonly string[], idx: number): boolean {
  const start = Math.max(0, idx - 8);
  for (let j = idx; j >= start; j -= 1) {
    const trimmed = pickAt(lines, j).trim();
    if (trimmed.includes('useEffect(')) {
      return true;
    }
    if (/^return {0,4}\(/.test(trimmed)) {
      return false;
    }
  }
  return false;
}

function hasJsxConditionalMarkup(line: string): boolean {
  if (line.includes('&& <') || line.includes('&&<')) {
    return true;
  }
  if (!line.includes('{') || !line.includes('?')) {
    return false;
  }
  return line.includes('<') || line.includes(':');
}

function hasJsxPrehydrateConditionalLine(
  relPath: string,
  lines: readonly string[],
  idx: number
): boolean {
  if (!/\.(?:tsx|jsx)$/i.test(relPath)) {
    return false;
  }
  const line = pickAt(lines, idx);
  if (!JSX_PREHYDRATE_STATE_MARKERS.some((m) => line.includes(m))) {
    return false;
  }
  if (!hasJsxConditionalMarkup(line)) {
    return false;
  }
  return !isInsideUseEffectBlock(lines, idx);
}

function inspectPrehydrateLinesInFile(relPath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = content.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const prev = pickAt(lines, i - 1);
    if (line.includes(QA_SSR_HYDRATION_OK_PRAGMA) || prev.includes(QA_SSR_HYDRATION_OK_PRAGMA)) {
      continue;
    }
    const isVuePrehydrate = SSR_PREHYDRATE_V_IF_PATTERNS.some((re) => re.test(line));
    const isJsxPrehydrate = hasJsxPrehydrateConditionalLine(relPath, lines, i);
    if (isVuePrehydrate || isJsxPrehydrate) {
      findings.push({
        rule_id: QA_SSR_HYDRATION_RULE,
        severity: 'MEDIUM',
        stig_owasp_ref: QA_SSR_HYDRATION_REF,
        file: relPath,
        line: i + 1,
        message:
          'Componente SSR/SSG ramifica el DOM inicial (v-if o JSX condicional) según estado de cliente pre-hidratación (localStorage/dataset.theme/matchMedia), arriesgando Hydration Mismatch.',
        remediation: `Renderizar ambas ramas con CSS (display: none / hidden dark:block) y sincronizar el estado reactivo en onMounted/useEffect (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
      });
    }
  }
  return findings;
}

function inspectSsrPrehydrateBranching(
  projectPath: string,
  scopeFiles: readonly string[],
  seenFiles: Set<string>
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const rel of scopeFiles) {
    if (seenFiles.has(rel) || !isScopeProductionSource(rel) || !/\.(?:vue|tsx|jsx)$/i.test(rel)) {
      continue;
    }
    seenFiles.add(rel);
    const content = readTextFileSafe(path.join(projectPath, rel));
    if (!content) continue;
    findings.push(...inspectPrehydrateLinesInFile(rel, content));
  }
  return findings;
}

function hasDualColorSchemeCoverage(texts: readonly string[]): boolean {
  const combined = texts.join('\n');
  return (
    combined.includes('colorScheme') &&
    /['"]light['"]/.test(combined) &&
    /['"]dark['"]/.test(combined)
  );
}

function hasHydrationConsoleGuard(e2eTexts: readonly string[]): boolean {
  const combined = e2eTexts.join('\n');
  return HYDRATION_LISTENER_RE.test(combined) && /hydration/i.test(combined);
}

function findPlaywrightScopeConfigs(
  scopeDir: string,
  candidates: readonly string[],
  rootCandidates: readonly string[]
): { configs: string[]; usedRootFallback: boolean } {
  const own = candidates.filter(
    (rel) => isScopeProductionSource(rel) && PLAYWRIGHT_CONFIG_RE.test(rel.replace(/\\/g, '/'))
  );
  if (own.length > 0 || scopeDir === '.') {
    return { configs: own, usedRootFallback: false };
  }
  const rootConfigs = rootCandidates.filter((rel) => {
    const norm = rel.replace(/\\/g, '/');
    return !norm.includes('/') && isScopeProductionSource(norm) && PLAYWRIGHT_CONFIG_RE.test(norm);
  });
  return { configs: rootConfigs, usedRootFallback: rootConfigs.length > 0 };
}

function readExistingTexts(projectPath: string, relFiles: readonly string[]): string[] {
  const texts: string[] = [];
  for (const rel of relFiles) {
    const txt = readTextFileSafe(path.join(projectPath, rel));
    if (txt) texts.push(txt);
  }
  return texts;
}

function buildMissingPlaywrightHydrationMessage(hasDual: boolean, hasGuard: boolean): string {
  const missing: string[] = [];
  if (!hasDual) missing.push("cobertura dual de colorScheme ('light' y 'dark')");
  if (!hasGuard) missing.push('listeners console/pageerror verificando errores /hydration/i');
  return `Proyecto SSR/SSG con tematización dinámica carece de ${missing.join(' y ')} en la suite Playwright E2E.`;
}

interface PlaywrightHydrationInput {
  readonly projectPath: string;
  readonly scopeDir: string;
  readonly scopeFiles: readonly string[];
  readonly extraFiles: readonly string[];
  readonly allRelFiles: readonly string[];
  readonly seenConfigs: Set<string>;
}

function inspectPlaywrightHydrationContract(input: PlaywrightHydrationInput): SecurityFinding[] {
  const { projectPath, scopeDir, scopeFiles, extraFiles, allRelFiles, seenConfigs } = input;
  const scoped = [...scopeFiles, ...extraFiles];
  const { configs, usedRootFallback } = findPlaywrightScopeConfigs(scopeDir, scoped, allRelFiles);
  const primaryConfig = configs[0];
  if (!primaryConfig || seenConfigs.has(primaryConfig)) return [];
  seenConfigs.add(primaryConfig);

  const pwTexts = readExistingTexts(projectPath, configs);
  if (pwTexts.some((txt) => txt.includes(QA_SSR_HYDRATION_OK_PRAGMA))) return [];

  const e2ePool = usedRootFallback ? [...scoped, ...allRelFiles] : scoped;
  const e2eFiles = Array.from(
    new Set(
      e2ePool.filter((rel) => {
        const norm = rel.replace(/\\/g, '/');
        return !norm.endsWith('.example') && !isAuditorSelfDefinition(norm) && E2E_TEST_FILE_RE.test(norm);
      })
    )
  );
  const e2eTexts = readExistingTexts(projectPath, e2eFiles);
  if (e2eTexts.some((txt) => txt.includes(QA_SSR_HYDRATION_OK_PRAGMA))) return [];

  const hasDual = hasDualColorSchemeCoverage([...pwTexts, ...e2eTexts]);
  const hasGuard = hasHydrationConsoleGuard(e2eTexts);
  if (hasDual && hasGuard) return [];

  return [
    {
      rule_id: QA_SSR_HYDRATION_RULE,
      severity: 'MEDIUM',
      stig_owasp_ref: QA_SSR_HYDRATION_REF,
      file: primaryConfig,
      line: 1,
      message: buildMissingPlaywrightHydrationMessage(hasDual, hasGuard),
      remediation: `Añadir prueba Playwright con browser.newContext({ colorScheme: 'light' }) / emulateMedia cubriendo ambos esquemas y aserción sobre eventos console/pageerror para /hydration/i (o eximir con ${QA_SSR_HYDRATION_OK_PRAGMA}).`,
    },
  ];
}

interface ScopeSsrHydrationInput {
  readonly projectPath: string;
  readonly pkgRel: string;
  readonly allRelFiles: readonly string[];
  readonly seenBranchFiles: Set<string>;
  readonly seenPwConfigs: Set<string>;
}

function inspectScopeSsrHydration(input: ScopeSsrHydrationInput): SecurityFinding[] {
  const { projectPath, pkgRel, allRelFiles, seenBranchFiles, seenPwConfigs } = input;
  const pkgContent = readTextFileSafe(path.join(projectPath, pkgRel));
  if (!pkgContent || pkgContent.includes(QA_SSR_HYDRATION_OK_PRAGMA)) return [];

  const scopeDir = path.posix.dirname(pkgRel.replace(/\\/g, '/'));
  const scopeAbsDir = scopeDir === '.' ? projectPath : path.join(projectPath, scopeDir);
  const scopeFiles = allRelFiles.filter((r) => isInScopeDir(r.replace(/\\/g, '/'), scopeDir));
  const extraFiles = collectMatchingFiles(scopeAbsDir, isSsrExtraEntry).map((abs) =>
    path.relative(projectPath, abs)
  );

  if (!hasSsrEngineForScope({ projectPath, scopeAbsDir, pkgContent, scopeFiles, extraFiles })) {
    return [];
  }
  if (!hasDualThemeMarkerForScope(projectPath, scopeFiles, extraFiles)) {
    return [];
  }

  return [
    ...inspectSsrPrehydrateBranching(projectPath, scopeFiles, seenBranchFiles),
    ...inspectPlaywrightHydrationContract({
      projectPath,
      scopeDir,
      scopeFiles,
      extraFiles,
      allRelFiles,
      seenConfigs: seenPwConfigs,
    }),
  ];
}

export function checkQaSsrHydration01DualScheme(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const packageRels = allRelFiles.filter((rel) => {
    const norm = rel.replace(/\\/g, '/');
    return /(?:^|\/)package\.json$/.test(norm) && isScopeProductionSource(norm);
  });
  const seenBranchFiles = new Set<string>();
  const seenPwConfigs = new Set<string>();
  const findings: SecurityFinding[] = [];

  for (const pkgRel of packageRels) {
    findings.push(
      ...inspectScopeSsrHydration({
        projectPath,
        pkgRel,
        allRelFiles,
        seenBranchFiles,
        seenPwConfigs,
      })
    );
  }

  return findings;
}

export function checkQaMypy01StrictChain(projectPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const subDirs = ['', 'fastapi', 'python', 'backend'];

  for (const sub of subDirs) {
    const dirPath = sub ? path.join(projectPath, sub) : projectPath;
    const pyprojectPath = path.join(dirPath, 'pyproject.toml');
    const makefilePath = path.join(dirPath, 'Makefile');
    if (!fs.existsSync(pyprojectPath) || !fs.existsSync(makefilePath)) continue;

    try {
      const pyContent = fs.readFileSync(pyprojectPath, 'utf8');
      if (!pyContent.includes('[tool.mypy]')) continue;

      const makeContent = fs.readFileSync(makefilePath, 'utf8');
      const hasQaLintWithRuff = /qa-lint:[\s\S]*?\bruff\b/.test(makeContent);
      const hasMypy = /\bmypy\b/.test(makeContent);
      if (hasQaLintWithRuff && !hasMypy) {
        const relMake = path.relative(projectPath, makefilePath);
        findings.push({
          rule_id: 'QA-MYPY-01',
          severity: 'HIGH',
          stig_owasp_ref: 'Standard 11X Law 2 / Pre-Push Strict Type Parity',
          file: relMake,
          line: 1,
          message:
            'pyproject.toml define [tool.mypy], pero el Makefile ejecuta ruff en qa-lint sin encadenar mypy.',
          remediation:
            'Encadenar obligatoriamente mypy --strict --cache-dir=/tmp/mypy src/ junto a ruff check y ruff format --check antes de pytest.',
        });
      }
    } catch (err: unknown) {
      // Tolerar errores puntuales de lectura de pyproject/Makefile durante escaneo de proyecto
      reportDebugCatchError('security-auditor.checkQaMypy01StrictChain', err);
    }
  }

  return findings;
}

