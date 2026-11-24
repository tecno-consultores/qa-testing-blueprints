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
]);
const SOURCE_DIR_PREFIXES = ['src/', 'app/', 'scripts/'] as const;

function isSourceCandidate(file: string): boolean {
  if (
    NON_SOURCE_MARKERS.some((m) => file.includes(m)) ||
    NON_SOURCE_SUFFIXES.some((s) => file.endsWith(s)) ||
    IGNORED_ENTRYPOINTS.has(path.basename(file))
  ) {
    return false;
  }
  return (
    SOURCE_DIR_PREFIXES.some((p) => file.startsWith(p)) ||
    file.includes('/src/') ||
    file.includes('/app/') ||
    file.endsWith('.sh')
  );
}

function hasPythonUnitTest(files: string[], baseName: string): boolean {
  const lower = baseName.toLowerCase();
  return files.some((f) => {
    const fl = f.toLowerCase();
    return (
      (fl.endsWith('.unit.py') || fl.endsWith('.py')) &&
      (fl.includes(`test_${lower}`) || fl.includes(`${lower}.unit`) || fl.includes(`${lower}_test`))
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
  const cleanBase = baseName.replace(/\.sh$/, '');
  return files.some((f) => {
    const fl = f.toLowerCase();
    return (
      fl.endsWith('.bats') &&
      (fl.includes(`test_${cleanBase}`) || fl.includes(`/${cleanBase}.bats`))
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

export function findOrphanSourceFiles(
  _projectPath: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile[] {
  const orphans: OrphanSourceFile[] = [];

  for (const file of files) {
    if (!isSourceCandidate(file)) continue;

    const item = resolveCandidateOrphan(file, files, stacks);
    if (item) {
      orphans.push(item);
    }
  }

  return orphans;
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

export function findUntestedUiViews(
  projectPath: string,
  files: string[]
): UntestedUiView[] {
  const viewFiles = files.filter(
    (f) => !isNonProductionCandidate(f) && /(?:views|pages)\/.*?\.(?:vue|tsx|jsx)$/.test(f)
  );

  const bddFeatures = files.filter(
    (f) => f.endsWith('.feature') && (f.includes('ui_business') || f.includes('ui'))
  );
  let uiFeatureText = '';
  for (const f of bddFeatures) {
    uiFeatureText += readFileContentSafe(projectPath, f) + '\n';
  }

  const e2eFiles = files.filter(
    (f) => f.includes('e2e/') || f.includes('.e2e.')
  );
  let e2eText = '';
  for (const f of e2eFiles) {
    e2eText += readFileContentSafe(projectPath, f) + '\n';
  }

  const untestedViews: UntestedUiView[] = [];

  for (const viewFile of viewFiles) {
    const baseName = path.basename(viewFile).replace(/\.[^.]+$/, '');
    const lowerName = baseName.toLowerCase();

    const hasUnit = files.some(
      (f) =>
        (f.includes('.unit.') || f.includes('.spec.')) &&
        f.toLowerCase().includes(lowerName)
    );

    const inBdd =
      uiFeatureText.length > 0 &&
      uiFeatureText.toLowerCase().includes(lowerName);

    const inE2e =
      e2eText.length > 0 &&
      e2eText.toLowerCase().includes(lowerName);

    if (!hasUnit || !inBdd || !inE2e) {
      untestedViews.push({
        view_file: viewFile,
        expected_unit_test: `${path.dirname(viewFile)}/__tests__/${baseName}.unit.ts`,
        present_in_bdd_feature: inBdd,
        present_in_e2e_spec: inE2e,
      });
    }
  }

  return untestedViews;
}

