// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type {
  OrphanSourceFile,
  StackName,
  UntestedApiEndpoint,
  UntestedUiView,
} from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  STACK_BASH_SCRIPTS,
  STACK_FASTAPI,
  STACK_NODE_BACKEND,
  STACK_AI_EVALS,
  STACK_MOBILE_APPIUM,
  STACK_PHP,
  STACK_PYTHON,
  STACK_REACT_FRONTEND,
  STACK_VIBE_RESCUE,
  STACK_VUE3,
  readFileContentSafe,
} from './shared.js';

// ============================================================================
// 🔍 Descubrimiento de Archivos Huérfanos sin Pruebas Unitarias
// ============================================================================

const NON_SOURCE_MARKERS = [
  '.unit.',
  '.spec.',
  '.test.',
  '.e2e.',
  '.config.',
  'wdio.conf.',
] as const;
const NON_SOURCE_SUFFIXES = ['.bats', '.d.ts', 'vite-env.d.ts'] as const;
const IGNORED_ENTRYPOINTS = new Set([
  '__init__.py',
  'main.py',
  'main.ts',
  'index.ts',
  'index.js',
  'types.ts',
  'app.py',
  'app.ts',
  'setup.py',
  'limpieza.sh',
  'instalar-hooks.sh',
  'verify-v2.sh',
]);
const VENDORED_CONSUMER_QA11X_SCRIPTS = new Set([
  'scripts/actualizar-grafos-graphify.sh',
  'scripts/audit-edge.sh',
  'scripts/auditar-infra.sh',
  'scripts/auditar-pagespeed.sh',
  'scripts/generar-sbom-cyclonedx.sh',
  'scripts/install-skill.sh',
  'scripts/limpieza.sh',
  'scripts/verificar-secretos.sh',
]);
const SOURCE_DIR_PREFIXES = ['src/', 'app/', 'scripts/'] as const;

function isSourceCandidate(file: string, isUpstreamRepo = false): boolean {
  const norm = file.replace(/\\/g, '/');
  if (
    norm.startsWith('.agents/') ||
    NON_SOURCE_MARKERS.some((m) => norm.includes(m)) ||
    NON_SOURCE_SUFFIXES.some((s) => norm.endsWith(s)) ||
    IGNORED_ENTRYPOINTS.has(path.basename(norm)) ||
    (!isUpstreamRepo && VENDORED_CONSUMER_QA11X_SCRIPTS.has(norm))
  ) {
    return false;
  }
  return (
    SOURCE_DIR_PREFIXES.some((p) => norm.startsWith(p)) ||
    norm.includes('/src/') ||
    norm.includes('/app/') ||
    norm.endsWith('.sh')
  );
}

function hasPythonUnitTest(files: string[], baseName: string): boolean {
  const lower = baseName.toLowerCase();
  const snake = lower.replace(/-/g, '_');
  return files.some((f) => {
    const fl = f.toLowerCase();
    if (!fl.endsWith('.py')) return false;
    return (
      fl.includes(`test_${lower}`) ||
      fl.includes(`test_${snake}`) ||
      fl.includes(`${lower}.unit`) ||
      fl.includes(`${snake}.unit`) ||
      fl.includes(`${lower}_test`) ||
      fl.includes(`${snake}_test`)
    );
  });
}

function hasNodeUnitTest(files: string[], baseName: string): boolean {
  const lower = baseName.toLowerCase();
  return files.some((f) => {
    const fl = f.toLowerCase();
    return (
      (fl.includes('.unit.') || fl.includes('.spec.') || fl.includes('.test.')) &&
      (fl.includes(`/${lower}.`) ||
        fl.includes(`__tests__/${lower}.`) ||
        fl.includes(`tests/${lower}.`) ||
        fl.includes(`test_${lower}.`))
    );
  });
}

function hasBashUnitTest(files: string[], baseName: string): boolean {
  const cleanBase = baseName.replace(/\.sh$/, '').toLowerCase();
  const snakeBase = cleanBase.replace(/-/g, '_');
  return files.some((f) => {
    const fl = f.toLowerCase();
    return (
      fl.endsWith('.bats') &&
      (fl.includes(`test_${cleanBase}`) ||
        fl.includes(`test_${snakeBase}`) ||
        fl.includes(`/${cleanBase}.bats`) ||
        fl.includes(`/${snakeBase}.bats`))
    );
  });
}

const STACK_DIR_PREFIXES: ReadonlyArray<readonly [string, StackName]> = [
  [`${STACK_MOBILE_APPIUM}/`, STACK_MOBILE_APPIUM],
  [`${STACK_VIBE_RESCUE}/`, STACK_VIBE_RESCUE],
  [`${STACK_AI_EVALS}/`, STACK_AI_EVALS],
  ['fastapi/', STACK_FASTAPI],
  ['python/', STACK_PYTHON],
  [`${STACK_NODE_BACKEND}/`, STACK_NODE_BACKEND],
  ['vue3/', STACK_VUE3],
  [`${STACK_REACT_FRONTEND}/`, STACK_REACT_FRONTEND],
  ['php/', STACK_PHP],
  [`${STACK_BASH_SCRIPTS}/`, STACK_BASH_SCRIPTS],
];

const PYTHON_STACK_PRIORITY: readonly StackName[] = [
  STACK_FASTAPI,
  STACK_PYTHON,
  STACK_AI_EVALS,
  STACK_VIBE_RESCUE,
];

const NODE_STACK_PRIORITY: readonly StackName[] = [
  STACK_NODE_BACKEND,
  STACK_MOBILE_APPIUM,
  STACK_VIBE_RESCUE,
  STACK_AI_EVALS,
];

function resolvePrefixedStack(file: string): StackName | null {
  for (const [prefix, stackName] of STACK_DIR_PREFIXES) {
    if (file.startsWith(prefix)) return stackName;
  }
  return null;
}

function scopeFilesForCandidate(file: string, files: string[]): string[] {
  const prefixed = resolvePrefixedStack(file);
  if (!prefixed) return files;
  return files.filter((candidate) => {
    const candidateStack = resolvePrefixedStack(candidate);
    return candidateStack === null || candidateStack === prefixed;
  });
}

function checkPythonOrphan(
  file: string,
  baseName: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile | null {
  if (hasPythonUnitTest(scopeFilesForCandidate(file, files), baseName)) return null;
  const prefixed = resolvePrefixedStack(file);
  const stackChoice =
    prefixed ?? PYTHON_STACK_PRIORITY.find((s) => stacks.includes(s)) ?? STACK_PYTHON;
  return {
    source_file: file,
    expected_unit_test:
      stackChoice === STACK_FASTAPI
        ? `fastapi/test/test_${baseName}.unit.py`
        : `tests/test_${baseName}.unit.py`,
    stack: stackChoice,
  };
}

function resolveUnprefixedNodeStack(file: string, stacks: StackName[]): StackName {
  if (file.endsWith('.vue')) {
    return STACK_VUE3;
  }
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    return stacks.includes(STACK_REACT_FRONTEND) ? STACK_REACT_FRONTEND : STACK_VUE3;
  }
  const priorityHit = NODE_STACK_PRIORITY.find((s) => stacks.includes(s));
  if (priorityHit) return priorityHit;
  if (stacks.includes(STACK_VUE3)) return STACK_VUE3;
  if (stacks.includes(STACK_REACT_FRONTEND)) return STACK_REACT_FRONTEND;
  return STACK_NODE_BACKEND;
}

function checkNodeOrphan(
  file: string,
  baseName: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile | null {
  if (hasNodeUnitTest(scopeFilesForCandidate(file, files), baseName)) return null;
  const stackChoice = resolvePrefixedStack(file) ?? resolveUnprefixedNodeStack(file, stacks);
  return {
    source_file: file,
    expected_unit_test: `${path.dirname(file)}/__tests__/${baseName}.unit.ts`,
    stack: stackChoice,
  };
}

function checkBashOrphan(
  file: string,
  baseName: string,
  files: string[]
): OrphanSourceFile | null {
  if (hasBashUnitTest(files, baseName)) return null;
  return {
    source_file: file,
    expected_unit_test: `test/test_${baseName}.bats`,
    stack: STACK_BASH_SCRIPTS,
  };
}

function hasPhpUnitTest(files: string[], baseName: string): boolean {
  const lower = baseName.toLowerCase();
  return files.some((f) => {
    const fl = f.toLowerCase();
    return (
      fl.endsWith('.php') &&
      (fl.includes(`${lower}test.php`) || fl.includes(`test_${lower}.php`) || fl.includes(`${lower}.unit.php`))
    );
  });
}

function checkPhpOrphan(
  file: string,
  baseName: string,
  files: string[]
): OrphanSourceFile | null {
  if (hasPhpUnitTest(files, baseName)) return null;
  return {
    source_file: file,
    expected_unit_test: `tests/${baseName}Test.php`,
    stack: STACK_PHP,
  };
}

function resolveCandidateOrphan(
  file: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile | null {
  const baseName = path.basename(file).replace(/\.[^.]+$/, '');
  if (file.endsWith('.py')) {
    return checkPythonOrphan(file, baseName, files, stacks);
  }
  if (/\.(vue|ts|tsx|js|jsx)$/.test(file)) {
    return checkNodeOrphan(file, baseName, files, stacks);
  }
  if (file.endsWith('.sh')) {
    return checkBashOrphan(file, baseName, files);
  }
  if (file.endsWith('.php')) {
    return checkPhpOrphan(file, baseName, files);
  }
  return null;
}

const UNIT_OR_BATS_TEST_RE =
  /\.(?:unit|spec|test)\.[a-z0-9]+$|test\.php$|\.bats$|_test\.py$|(?:^|\/)test_[^/]+\.py$/i;

function isUnitOrBatsTestFile(relPath: string): boolean {
  if (relPath.includes('.e2e.') || /(?:^|\/)e2e\//.test(relPath)) return false;
  return UNIT_OR_BATS_TEST_RE.test(relPath);
}

function resolveIsolationScope(file: string): string {
  if (file.startsWith('mcp-server/example/')) return 'mcp-server/example/';
  if (file.startsWith('mcp-server/')) return 'mcp-server/';
  const pref = resolvePrefixedStack(file);
  return pref ? `${pref}/` : '';
}

function appendScopeText(buckets: Map<string, string[]>, scope: string, text: string): void {
  const existing = buckets.get(scope);
  if (existing) {
    existing.push(text);
  } else {
    buckets.set(scope, [text]);
  }
}

function buildCorpusMap(
  projectPath: string,
  targetFiles: readonly string[]
): ReadonlyMap<string, string> {
  const buckets = new Map<string, string[]>();
  for (const f of targetFiles) {
    const text = readFileContentSafe(projectPath, f).toLowerCase();
    if (text) {
      appendScopeText(buckets, resolveIsolationScope(f), text);
    }
  }
  const out = new Map<string, string>();
  for (const [scope, chunks] of buckets.entries()) {
    out.set(scope, chunks.join('\n'));
  }
  return out;
}

function getCombinedScopeCorpus(file: string, corpusByScope: ReadonlyMap<string, string>): string {
  const scope = resolveIsolationScope(file);
  const scoped = corpusByScope.get(scope) ?? '';
  const rootCorpus = scope === '' ? '' : (corpusByScope.get('') ?? '');
  return rootCorpus ? `${scoped}\n${rootCorpus}` : scoped;
}

const BARREL_BASENAMES = new Set([
  'index.ts',
  'index.tsx',
  'index.mts',
  'index.js',
  'index.mjs',
  '__init__.py',
]);

function isSourceDirFile(file: string): boolean {
  return (
    SOURCE_DIR_PREFIXES.some((p) => file.startsWith(p)) ||
    file.includes('/src/') ||
    file.includes('/app/')
  );
}

function isPythonImportStatement(trimmed: string): boolean {
  return trimmed.startsWith('from ') || trimmed.startsWith('import ');
}

function lineImportsPythonSymbol(rawLine: string, mod: string): boolean {
  const norm = rawLine.trim().replace(/[,()]/g, ' ');
  if (!isPythonImportStatement(norm)) return false;
  const padded = `${norm} `;
  return padded.includes(`.${mod} `) || padded.includes(` ${mod} `);
}

function hasPythonCorpusImport(corpus: string, snakeBase: string): boolean {
  if (!corpus.includes(snakeBase)) return false;
  return corpus.split('\n').some((ln) => lineImportsPythonSymbol(ln, snakeBase));
}

function isReferencedInCorpus(
  file: string,
  baseName: string,
  corpusByScope: ReadonlyMap<string, string>
): boolean {
  const corpus = getCombinedScopeCorpus(file, corpusByScope);
  if (!corpus) return false;
  const lowerBase = baseName.toLowerCase();
  const snakeBase = lowerBase.replace(/-/g, '_');
  const tokens = [
    `/${lowerBase}.`,
    `/${lowerBase}'`,
    `/${lowerBase}"`,
    `/${lowerBase}\``,
    `/${snakeBase}.`,
    `/${snakeBase}'`,
    `/${snakeBase}"`,
    `${lowerBase}.sh`,
    file.toLowerCase(),
  ];
  if (tokens.some((tok) => corpus.includes(tok))) return true;
  return file.endsWith('.py') && hasPythonCorpusImport(corpus, snakeBase);
}

function hasBarrelImportToken(corpus: string, dirLower: string): boolean {
  const tokens = [
    `/${dirLower}/index.`,
    `/${dirLower}/index'`,
    `/${dirLower}/index"`,
    `/${dirLower}'`,
    `/${dirLower}"`,
  ];
  return tokens.some((tok) => corpus.includes(tok)) || hasPythonCorpusImport(corpus, dirLower);
}

function isCoveredBarrelFile(file: string, testCorpus: ReadonlyMap<string, string>): boolean {
  if (!BARREL_BASENAMES.has(path.basename(file)) || !isSourceDirFile(file)) return false;
  const corpus = getCombinedScopeCorpus(file, testCorpus);
  if (!corpus) return false;
  return hasBarrelImportToken(corpus, path.basename(path.dirname(file)).toLowerCase());
}

function evaluateCandidateCoverage(
  file: string,
  files: string[],
  stacks: StackName[],
  testCorpus: ReadonlyMap<string, string>
): OrphanSourceFile | null {
  const baseName = path.basename(file).replace(/\.[^.]+$/, '');
  const byName = resolveCandidateOrphan(file, files, stacks);
  if (!byName || isReferencedInCorpus(file, baseName, testCorpus)) {
    return null;
  }
  return byName;
}

export function findOrphanSourceFiles(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile[] {
  const isUpstreamRepo = files.includes('.agents/scripts/sync_governance.py');
  const testCorpus = buildCorpusMap(projectPath, files.filter(isUnitOrBatsTestFile));
  const pendingOrphans: OrphanSourceFile[] = [];
  const directlyCovered: string[] = [];

  for (const file of files) {
    if (isCoveredBarrelFile(file, testCorpus)) {
      directlyCovered.push(file);
    } else if (isSourceCandidate(file, isUpstreamRepo)) {
      const orphan = evaluateCandidateCoverage(file, files, stacks, testCorpus);
      if (orphan) pendingOrphans.push(orphan);
      else directlyCovered.push(file);
    }
  }

  if (pendingOrphans.length === 0 || directlyCovered.length === 0) {
    return pendingOrphans;
  }
  const facadeCorpus = buildCorpusMap(projectPath, directlyCovered);
  return pendingOrphans.filter((item) => {
    const baseName = path.basename(item.source_file).replace(/\.[^.]+$/, '');
    return !isReferencedInCorpus(item.source_file, baseName, facadeCorpus);
  });
}

// ============================================================================
// 🔌 Descubrimiento de Endpoints API sin Escenario BDD Karate Labs
// ============================================================================

function extractRouterPrefix(content: string): string {
  const match = /prefix\s*=\s*["']([^"']+)["']/i.exec(content);
  return match?.[1] ?? '';
}

function resolveEndpointPath(rawPath: string, routerPrefix: string): string {
  if (!routerPrefix) return rawPath || '/';
  const cleanPrefix = routerPrefix.endsWith('/') ? routerPrefix.slice(0, -1) : routerPrefix;
  if (!rawPath || rawPath === '/') {
    return cleanPrefix;
  }
  if (rawPath.startsWith(routerPrefix)) return rawPath;
  const cleanSub = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return `${cleanPrefix}${cleanSub}`;
}

function hasKarateMethodInFeature(methodStr: string, featureText: string): boolean {
  const upperMethod = methodStr.toUpperCase();
  const methodScanner = /\bmethod\s+([a-z]+)/gi;
  let match = methodScanner.exec(featureText);
  while (match !== null) {
    if (pickAt(match, 1).toUpperCase() === upperMethod) {
      return true;
    }
    match = methodScanner.exec(featureText);
  }
  return false;
}

function trimTrailingSlashes(raw: string): string {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '/') {
    end -= 1;
  }
  return raw.slice(0, end);
}

function matchesKaratePathCandidate(fullPath: string, candidateRaw: string): boolean {
  const cleanCandidate = trimTrailingSlashes(pickAt(candidateRaw.split('?'), 0));
  const cleanRoute = trimTrailingSlashes(fullPath);
  const routeSegs = cleanRoute.split('/').filter(Boolean);
  const candSegs = cleanCandidate.split('/').filter(Boolean);
  if (routeSegs.length === 0) {
    return candSegs.length === 0 || candidateRaw.trim() === '/';
  }
  if (candSegs.length < routeSegs.length) return false;
  const tailSegs = candSegs.slice(candSegs.length - routeSegs.length);
  return routeSegs.every((rSeg, idx) => {
    const isParam = (rSeg.startsWith('{') && rSeg.endsWith('}')) || rSeg.startsWith(':');
    return isParam || rSeg === pickAt(tailSegs, idx);
  });
}

function isEndpointCoveredInFeature(methodStr: string, fullPath: string, featureText: string): boolean {
  if (featureText.length === 0 || !hasKarateMethodInFeature(methodStr, featureText)) {
    return false;
  }
  const pathLiteralScanner = /\b(?:path|url)\s+['"]([^'"\n]+)['"]/gi;
  let match = pathLiteralScanner.exec(featureText);
  while (match !== null) {
    const capturedPath = match[1];
    if (capturedPath !== undefined && matchesKaratePathCandidate(fullPath, capturedPath)) {
      return true;
    }
    match = pathLiteralScanner.exec(featureText);
  }
  const cleanLiteral = fullPath.length > 1 && fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath;
  return cleanLiteral.length > 1 && !cleanLiteral.includes('{') && featureText.includes(cleanLiteral);
}

interface EndpointLineParseInput {
  readonly lineStr: string;
  readonly routerPrefix: string;
  readonly routeFile: string;
  readonly lineIndex: number;
  readonly featureText: string;
}

const ENDPOINT_DECLARATION_PATTERNS: readonly RegExp[] = [
  /@(?:router|app)\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']/i,
  /(?:router|app|fastify)\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']/i,
  /@(Get|Post|Put|Patch|Delete)\(\s*["']([^"']*)["']\s*\)/i,
  /@(Get|Post|Put|Patch|Delete)\(\s*([^"'()\s]+)\s*\)/i,
  /@(Get|Post|Put|Patch|Delete)\(\s*\)/i,
];

function matchEndpointDeclaration(lineStr: string): { methodStr: string; rawPath: string } | null {
  for (const pattern of ENDPOINT_DECLARATION_PATTERNS) {
    const match = pattern.exec(lineStr);
    if (match) {
      return {
        methodStr: pickAt(match, 1).toUpperCase(),
        rawPath: pickAt(match, 2, '/'),
      };
    }
  }
  return null;
}

function parseEndpointsFromLine(input: EndpointLineParseInput): UntestedApiEndpoint | null {
  const { lineStr, routerPrefix, routeFile, lineIndex, featureText } = input;
  const matched = matchEndpointDeclaration(lineStr);
  if (!matched) return null;

  const fullPath = resolveEndpointPath(matched.rawPath, routerPrefix);

  if (isEndpointCoveredInFeature(matched.methodStr, fullPath, featureText)) return null;

  return {
    method: matched.methodStr as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: fullPath,
    source_file: routeFile,
    line: lineIndex + 1,
  };
}

function parseFileEndpoints(
  content: string,
  routeFile: string,
  featureText: string
): UntestedApiEndpoint[] {
  const untested: UntestedApiEndpoint[] = [];
  const routerPrefix = extractRouterPrefix(content);
  const lines = content.split(/\r?\n/);
  for (const [i, lineStr] of lines.entries()) {
    const item = parseEndpointsFromLine({
      lineStr,
      routerPrefix,
      routeFile,
      lineIndex: i,
      featureText,
    });
    if (item) {
      untested.push(item);
    }
  }
  return untested;
}

function isNonProductionCandidate(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  if (norm.endsWith('.example') || norm.startsWith('docs/') || norm.includes('/docs/')) {
    return true;
  }
  return (
    /(?:^|\/)(?:tests?|__tests__|e2e|fixtures)\//.test(norm) ||
    /\.(?:unit|spec|test|e2e)\.[a-z0-9]+$/i.test(norm) ||
    /(?:^|\/)test_[^/]+\.py$/i.test(norm) ||
    /_test\.py$/i.test(norm)
  );
}

export function findUntestedApiEndpoints(
  projectPath: string,
  files: string[]
): UntestedApiEndpoint[] {
  const routeFiles = files.filter(
    (f) =>
      !isNonProductionCandidate(f) &&
      (/(?:routers?|api|routes|controllers)/i.test(f) ||
        f === 'main.py' ||
        f === 'fastapi/src/main.py' ||
        f === 'src/main.py' ||
        f === 'app.ts' ||
        f === 'src/app.ts')
  );

  const bddFeatures = files.filter(
    (f) =>
      f.endsWith('.feature') &&
      (f.includes('api_test') || f.includes('test/') || f.includes('tests/') || f.includes('features/'))
  );
  let featureText = '';
  for (const bddFile of bddFeatures) {
    featureText += readFileContentSafe(projectPath, bddFile) + '\n';
  }

  const untested: UntestedApiEndpoint[] = [];
  for (const routeFile of routeFiles) {
    const content = readFileContentSafe(projectPath, routeFile);
    if (content) {
      untested.push(...parseFileEndpoints(content, routeFile, featureText));
    }
  }

  return untested;
}

// ============================================================================
// 🖥️ Descubrimiento de Vistas UI sin Escenario BDD / E2E
// ============================================================================

function isFrontendUnitSuiteFile(relPath: string): boolean {
  return (
    isUnitOrBatsTestFile(relPath) &&
    (relPath.includes('.unit.') || relPath.includes('.spec.') || relPath.includes('.test.'))
  );
}

function unitTextReferencesView(text: string, viewFile: string, lowerBase: string): boolean {
  const tokens = [
    `/${lowerBase}.`,
    `/${lowerBase}'`,
    `/${lowerBase}"`,
    `/${lowerBase}\``,
    viewFile.toLowerCase(),
  ];
  return tokens.some((tok) => text.includes(tok));
}

function findViewUnitTestFile(
  viewFile: string,
  lowerBase: string,
  unitTexts: ReadonlyArray<readonly [string, string]>
): string | undefined {
  const direct = unitTexts.find(([rel]) => rel.toLowerCase().includes(lowerBase));
  if (direct) return direct[0];
  const viewScope = resolveIsolationScope(viewFile);
  const grouped = unitTexts.find(([rel, text]) => {
    const unitScope = resolveIsolationScope(rel);
    const sameOrRootScope = unitScope === viewScope || unitScope === '';
    return sameOrRootScope && unitTextReferencesView(text, viewFile, lowerBase);
  });
  return grouped?.[0];
}

export function findUntestedUiViews(
  projectPath: string,
  files: string[]
): UntestedUiView[] {
  const viewFiles = files.filter(
    (f) => !isNonProductionCandidate(f) && /(?:views|pages)\/.*?\.(?:vue|tsx|jsx)$/.test(f)
  );
  if (viewFiles.length === 0) return [];

  const unitTexts: Array<readonly [string, string]> = files
    .filter(isFrontendUnitSuiteFile)
    .map((f) => [f, readFileContentSafe(projectPath, f).toLowerCase()] as const);

  const bddFeatures = files.filter(
    (f) => f.endsWith('.feature') && (f.includes('ui_business') || f.includes('ui'))
  );
  let uiFeatureText = '';
  for (const f of bddFeatures) {
    uiFeatureText += readFileContentSafe(projectPath, f) + '\n';
  }
  const lowerFeature = uiFeatureText.toLowerCase();

  const e2eFiles = files.filter((f) => f.includes('e2e/') || f.includes('.e2e.'));
  let e2eText = '';
  for (const f of e2eFiles) {
    e2eText += readFileContentSafe(projectPath, f) + '\n';
  }
  const lowerE2e = e2eText.toLowerCase();

  const untestedViews: UntestedUiView[] = [];
  for (const viewFile of viewFiles) {
    const baseName = path.basename(viewFile).replace(/\.[^.]+$/, '');
    const lowerName = baseName.toLowerCase();
    const matchedUnit = findViewUnitTestFile(viewFile, lowerName, unitTexts);
    const hasUnit = matchedUnit !== undefined;
    const inBdd = lowerFeature.length > 0 && lowerFeature.includes(lowerName);
    const inE2e = lowerE2e.length > 0 && lowerE2e.includes(lowerName);

    if (!hasUnit || !inBdd || !inE2e) {
      untestedViews.push({
        view_file: viewFile,
        expected_unit_test: matchedUnit ?? `${path.dirname(viewFile)}/__tests__/${baseName}.unit.ts`,
        present_in_unit_test: hasUnit,
        present_in_bdd_feature: inBdd,
        present_in_e2e_spec: inE2e,
      });
    }
  }

  return untestedViews;
}

