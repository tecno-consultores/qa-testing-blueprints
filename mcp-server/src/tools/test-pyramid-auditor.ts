// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  StackName,
  PyramidLayerAudit,
  UntestedApiEndpoint,
  PrioritizedTestAction,
  OrphanSourceFile,
  UntestedUiView,
  MissingTestInventory,
  TestPyramidGapResult,
  PyramidLayerStatus,
  GapPriority,
} from '../types.js';
import { inspectProjectConfig, collectProjectFiles } from './inspect-project.js';

export { collectProjectFiles };

// ============================================================================
// 🔒 Constantes para Prevención de sonarjs/no-duplicate-string
// ============================================================================

const MAKE_QA_UNIT = 'make qa-unit';
const MAKE_QA_LINT = 'make qa-lint';
const MAKE_QA_PARITY = 'make qa-parity';
const MAKE_QA_CONTRACTS = 'make qa-contracts';
const MAKE_QA_BDD = 'make qa-bdd';
const MAKE_QA_E2E = 'make qa-e2e';
const MAKE_QA_MUTATION = 'make qa-mutation';
const MAKE_QA_PERF = 'make qa-perf';
const MAKE_QA_DAST = 'make qa-dast';
const MAKE_QA_CHAOS = 'make qa-chaos';

const DOCKER_COMPOSE_QA = 'docker-compose.qa.yml';
const PYPROJECT_TOML = 'pyproject.toml';
const PACKAGE_JSON = 'package.json';
const MAKEFILE_NAME = 'Makefile';
const API_TEST_FEATURE = 'api_test.feature';
const UI_BUSINESS_FLOW_FEATURE = 'ui_business_flow.feature';
const ACCESSIBILITY_E2E = 'accessibility.e2e.ts';
const LIGHTHOUSERC_JS = 'lighthouserc.js';
const LOCUSTFILE_PY = 'locustfile.py';
const AUDITAR_INFRA_SH = 'auditar-infra.sh';
const VERIFICAR_SECRETOS_SH = 'verificar-secretos.sh';
const VERIFY_ALEMBIC_ORM_PARITY = 'verify_alembic_orm_parity.py';
const VERIFY_NO_ORPHAN_API = 'verify_no_orphan_api_endpoints.py';

const BP_FASTAPI_PYPROJECT = 'fastapi/pyproject.toml.example';
const BP_VUE3_TSCONFIG = 'vue3/tsconfig.json.example';
const BP_VUE3_VITEST = 'vue3/vitest.config.ts.example';
const BP_VUE3_STRYKER = 'vue3/stryker.conf.json.example';
const BP_FASTAPI_DOCKER_COMPOSE = 'fastapi/docker-compose.qa.yml';
const BP_FASTAPI_TEST_PROD = 'fastapi/test/api_test.feature';

const STATUS_COVERED: PyramidLayerStatus = 'COVERED';
const STATUS_PARTIAL: PyramidLayerStatus = 'PARTIAL';
const STATUS_MISSING: PyramidLayerStatus = 'MISSING';
const STATUS_NOT_APPLICABLE: PyramidLayerStatus = 'NOT_APPLICABLE';

const PRIORITY_CRITICAL: GapPriority = 'CRITICAL';
const PRIORITY_HIGH: GapPriority = 'HIGH';
const PRIORITY_MEDIUM: GapPriority = 'MEDIUM';

const STACK_FASTAPI: StackName = 'fastapi';
const STACK_PYTHON: StackName = 'python';
const STACK_NODE_BACKEND: StackName = 'node-backend';
const STACK_VUE3: StackName = 'vue3';
const STACK_REACT_FRONTEND: StackName = 'react-frontend';
const STACK_BASH_SCRIPTS: StackName = 'bash-scripts';
const STACK_PHP: StackName = 'php';

const COMPOSER_JSON = 'composer.json';
const PHPSTAN_NEON = 'phpstan.neon';

const ALL_STACKS: StackName[] = [
  STACK_PYTHON,
  STACK_FASTAPI,
  STACK_NODE_BACKEND,
  STACK_VUE3,
  STACK_REACT_FRONTEND,
  STACK_BASH_SCRIPTS,
  STACK_PHP,
];

const CODE_STACKS: StackName[] = [
  STACK_PYTHON,
  STACK_FASTAPI,
  STACK_NODE_BACKEND,
  STACK_VUE3,
  STACK_REACT_FRONTEND,
  STACK_PHP,
];

const BACKEND_STACKS: StackName[] = [STACK_FASTAPI, STACK_NODE_BACKEND, STACK_PHP];
const FRONTEND_STACKS: StackName[] = [STACK_VUE3, STACK_REACT_FRONTEND];

function readFileContentSafe(projectPath: string, relativePath: string): string {
  try {
    const fullPath = path.join(projectPath, relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch {
    // Retorno seguro vacío
  }
  return '';
}

// ============================================================================
// 🔍 Descubrimiento de Archivos Huérfanos sin Pruebas Unitarias
// ============================================================================

function isSourceCandidate(file: string): boolean {
  if (
    file.includes('.unit.') ||
    file.includes('.spec.') ||
    file.includes('.test.') ||
    file.includes('.e2e.') ||
    file.endsWith('.bats') ||
    file.includes('.config.') ||
    file.endsWith('.d.ts') ||
    file.endsWith('vite-env.d.ts')
  ) {
    return false;
  }
  const base = path.basename(file);
  const ignoredEntrypoints = new Set([
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
  if (ignoredEntrypoints.has(base)) return false;

  return (
    file.startsWith('src/') ||
    file.includes('/src/') ||
    file.startsWith('app/') ||
    file.includes('/app/') ||
    file.startsWith('scripts/') ||
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

function checkPythonOrphan(
  file: string,
  baseName: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile | null {
  if (hasPythonUnitTest(files, baseName)) return null;
  const isFastapi = stacks.includes(STACK_FASTAPI) || file.startsWith('fastapi/');
  return {
    source_file: file,
    expected_unit_test: isFastapi
      ? `fastapi/test/test_${baseName}.unit.py`
      : `tests/test_${baseName}.unit.py`,
    stack: isFastapi ? STACK_FASTAPI : STACK_PYTHON,
  };
}

function checkNodeOrphan(
  file: string,
  baseName: string,
  files: string[],
  stacks: StackName[]
): OrphanSourceFile | null {
  if (hasNodeUnitTest(files, baseName)) return null;
  const isVue = file.endsWith('.vue') || stacks.includes(STACK_VUE3);
  const isReact = file.endsWith('.tsx') || stacks.includes(STACK_REACT_FRONTEND);
  const stackChoice = isVue
    ? STACK_VUE3
    : isReact
    ? STACK_REACT_FRONTEND
    : STACK_NODE_BACKEND;
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
  const match = content.match(/prefix\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : '';
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
    if (match[1].toUpperCase() === upperMethod) {
      return true;
    }
    match = methodScanner.exec(featureText);
  }
  return false;
}

function matchesKaratePathCandidate(fullPath: string, candidateRaw: string): boolean {
  const cleanCandidate = candidateRaw.split('?')[0].replace(/\/+$/, '');
  const cleanRoute = fullPath.replace(/\/+$/, '');
  const routeSegs = cleanRoute.split('/').filter(Boolean);
  const candSegs = cleanCandidate.split('/').filter(Boolean);
  if (routeSegs.length === 0) {
    return candSegs.length === 0 || candidateRaw.trim() === '/';
  }
  if (candSegs.length < routeSegs.length) return false;
  const tailSegs = candSegs.slice(candSegs.length - routeSegs.length);
  return routeSegs.every((rSeg, idx) => {
    const isParam = (rSeg.startsWith('{') && rSeg.endsWith('}')) || rSeg.startsWith(':');
    return isParam ? tailSegs[idx].length > 0 : rSeg === tailSegs[idx];
  });
}

function isEndpointCoveredInFeature(methodStr: string, fullPath: string, featureText: string): boolean {
  if (featureText.length === 0 || !hasKarateMethodInFeature(methodStr, featureText)) {
    return false;
  }
  const pathLiteralScanner = /\b(?:path|url)\s+['"]([^'"\n]+)['"]/gi;
  let match = pathLiteralScanner.exec(featureText);
  while (match !== null) {
    if (matchesKaratePathCandidate(fullPath, match[1])) {
      return true;
    }
    match = pathLiteralScanner.exec(featureText);
  }
  const cleanLiteral = fullPath.length > 1 && fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath;
  return cleanLiteral.length > 1 && !cleanLiteral.includes('{') && featureText.includes(cleanLiteral);
}

function parseEndpointsFromLine(
  lineStr: string,
  routerPrefix: string,
  routeFile: string,
  lineIndex: number,
  featureText: string
): UntestedApiEndpoint | null {
  const endpointRegex =
    /@(?:router|app)\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']|(?:router|app|fastify)\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']|@(Get|Post|Put|Patch|Delete)\(\s*["']?([^"'()]*)["']?\)/i;
  const match = endpointRegex.exec(lineStr);
  if (!match) return null;

  const methodStr = (match[1] || match[3] || match[5] || 'GET').toUpperCase();
  const rawPath = match[2] || match[4] || match[6] || '/';
  const fullPath = resolveEndpointPath(rawPath, routerPrefix);

  if (isEndpointCoveredInFeature(methodStr, fullPath, featureText)) return null;

  return {
    method: methodStr as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
  for (let i = 0; i < lines.length; i++) {
    const item = parseEndpointsFromLine(lines[i], routerPrefix, routeFile, i, featureText);
    if (item) {
      untested.push(item);
    }
  }
  return untested;
}

export function findUntestedApiEndpoints(
  projectPath: string,
  files: string[]
): UntestedApiEndpoint[] {
  const routeFiles = files.filter(
    (f) =>
      /(?:routers?|api|routes|controllers)/i.test(f) ||
      f === 'main.py' ||
      f === 'fastapi/src/main.py' ||
      f === 'src/main.py' ||
      f === 'app.ts' ||
      f === 'src/app.ts'
  );

  const bddFeatures = files.filter(
    (f) => f.endsWith('.feature') && (f.includes('api_test') || f.includes('test/'))
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
  const viewFiles = files.filter((f) =>
    /(?:views|pages)\/.*?\.(?:vue|tsx|jsx)$/.test(f)
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

// ============================================================================
// 📐 Evaluadores de las 13 Capas de la Pirámide 11X (Complejidad Cognitiva <= 8)
// ============================================================================

function detectLinterCapabilities(
  projectPath: string,
  files: string[]
): { hasLinter: boolean; detected: string[] } {
  const pyproject = readFileContentSafe(projectPath, PYPROJECT_TOML);
  const pkgJson = readFileContentSafe(projectPath, PACKAGE_JSON);

  const hasPythonLinter = pyproject.includes('ruff') && pyproject.includes('bandit');
  const hasNodeLinter =
    pkgJson.includes('--max-warnings 0') &&
    (pkgJson.includes('sonarjs') || pkgJson.includes('security'));
  const hasBashLinter =
    files.some((f) => f.endsWith('.sh')) &&
    (files.some((f) => f.includes('shellcheck')) ||
      pyproject.includes('shellcheck') ||
      pkgJson.includes('shellcheck'));
  const composer = readFileContentSafe(projectPath, COMPOSER_JSON);
  const hasPhpLinter =
    files.some((f) => f.includes('phpstan') || f.includes('psalm')) ||
    composer.includes('phpstan') ||
    composer.includes('psalm');

  const detected: string[] = [];
  if (hasPythonLinter) detected.push('ruff+bandit en pyproject.toml');
  if (hasNodeLinter) detected.push('eslint --max-warnings 0 en package.json');
  if (hasBashLinter) detected.push('shellcheck configurado');
  if (hasPhpLinter) detected.push('phpstan/psalm configurado');

  return { hasLinter: hasPythonLinter || hasNodeLinter || hasBashLinter || hasPhpLinter, detected };
}

function detectScriptsCapabilities(files: string[]): {
  hasScripts: boolean;
  hasAuditar: boolean;
  hasSecretos: boolean;
  detected: string[];
} {
  const hasAuditar = files.some((f) => f.includes(AUDITAR_INFRA_SH));
  const hasSecretos = files.some((f) => f.includes(VERIFICAR_SECRETOS_SH));
  const detected: string[] = [];
  if (hasAuditar) detected.push(`scripts/${AUDITAR_INFRA_SH}`);
  if (hasSecretos) detected.push(`scripts/${VERIFICAR_SECRETOS_SH}`);
  return {
    hasScripts: hasAuditar && hasSecretos,
    hasAuditar,
    hasSecretos,
    detected,
  };
}

export function evaluateLayer01StaticSast(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = ALL_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 1,
      layer_id: 'L01_STATIC_SAST_IAC',
      layer_name: 'Análisis Estático, Linters Inflexibles y SAST/IaC',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_LINT,
    };
  }

  const linter = detectLinterCapabilities(projectPath, files);
  const scripts = detectScriptsCapabilities(files);
  const detected = [...scripts.detected, ...linter.detected];

  let status: PyramidLayerStatus = STATUS_MISSING;
  const missingReqs: string[] = [];

  if (linter.hasLinter && scripts.hasScripts) {
    status = STATUS_COVERED;
  } else if (linter.hasLinter || scripts.hasAuditar || scripts.hasSecretos) {
    status = STATUS_PARTIAL;
    if (!scripts.hasScripts) missingReqs.push('Faltan scripts/auditar-infra.sh y scripts/verificar-secretos.sh.');
    if (!linter.hasLinter) missingReqs.push('Falta configuración de linter estricto (--max-warnings 0 / ruff+bandit).');
  } else {
    missingReqs.push('Sin configuración de linters estrictos ni scripts SAST/IaC.');
  }

  return {
    layer_number: 1,
    layer_id: 'L01_STATIC_SAST_IAC',
    layer_name: 'Análisis Estático, Linters Inflexibles y SAST/IaC',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [
      'scripts/auditar-infra.sh',
      'scripts/verificar-secretos.sh',
    ],
    make_target: MAKE_QA_LINT,
  };
}

function checkPythonTyping(
  projectPath: string,
  files: string[]
): { passed: boolean; partial: boolean; evidence: string[] } {
  const pyproject = readFileContentSafe(projectPath, PYPROJECT_TOML);
  const makefile = readFileContentSafe(projectPath, MAKEFILE_NAME);
  const pyStrict = pyproject.includes('strict = true') || pyproject.includes('strict=true');
  const pyRadon =
    pyproject.includes('radon') ||
    makefile.includes('radon') ||
    files.some((f) => f.includes('radon'));
  const evidence: string[] = [];
  if (pyStrict) evidence.push('mypy strict = true');
  if (pyRadon) evidence.push('radon complejidad');
  return { passed: pyStrict && pyRadon, partial: pyStrict || pyRadon, evidence };
}

function checkNodeTyping(
  projectPath: string
): { passed: boolean; partial: boolean; evidence: string[] } {
  const pkgJson = readFileContentSafe(projectPath, PACKAGE_JSON);
  const tsconfig = readFileContentSafe(projectPath, 'tsconfig.json');
  const tsStrict = tsconfig.includes('"strict": true') || tsconfig.includes('"strict":true');
  const tsTypecheck = pkgJson.includes('typecheck') || pkgJson.includes('tsc --noEmit');
  const evidence: string[] = [];
  if (tsStrict) evidence.push('tsconfig.json "strict": true');
  if (tsTypecheck) evidence.push('script typecheck (tsc --noEmit)');
  return { passed: tsStrict && tsTypecheck, partial: tsStrict || tsTypecheck, evidence };
}

function checkPhpTyping(
  projectPath: string,
  files: string[]
): { passed: boolean; partial: boolean; evidence: string[] } {
  const composer = readFileContentSafe(projectPath, COMPOSER_JSON);
  const phpstanContent = readFileContentSafe(projectPath, PHPSTAN_NEON);
  const hasPhpstan =
    files.some((f) => f.includes(PHPSTAN_NEON)) ||
    fs.existsSync(path.join(projectPath, PHPSTAN_NEON));
  const hasStrictOrMax =
    hasPhpstan &&
    (phpstanContent.includes('level: max') ||
      phpstanContent.includes('level: 9') ||
      phpstanContent.includes('level: 8'));
  const hasComplexity =
    composer.includes('cognitive-complexity') ||
    phpstanContent.includes('cognitive_complexity');
  const evidence: string[] = [];
  if (hasPhpstan) evidence.push(PHPSTAN_NEON);
  if (hasStrictOrMax) evidence.push('phpstan level max/strict');
  if (hasComplexity) evidence.push('cognitive-complexity <= 9');
  return { passed: hasStrictOrMax && hasComplexity, partial: hasPhpstan || hasStrictOrMax, evidence };
}

function collectStrictTypingMissingReqs(
  py: { passed: boolean },
  node: { passed: boolean },
  php: { passed: boolean },
  hasPython: boolean,
  hasNode: boolean,
  hasPhp: boolean
): string[] {
  const missingReqs: string[] = [];
  if (hasPython && !py.passed) missingReqs.push('Configurar mypy con strict = true y radon.');
  if (hasNode && !node.passed) missingReqs.push('Configurar tsconfig "strict": true y script typecheck.');
  if (hasPhp && !php.passed) missingReqs.push('Configurar phpstan.neon con level: max y tomasvotruba/cognitive-complexity.');
  return missingReqs;
}

function determineStrictTypingStatus(
  py: { passed: boolean; partial: boolean },
  node: { passed: boolean; partial: boolean },
  php: { passed: boolean; partial: boolean },
  hasPython: boolean,
  hasNode: boolean,
  hasPhp: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const pyPassed = !hasPython || py.passed;
  const nodePassed = !hasNode || node.passed;
  const phpPassed = !hasPhp || php.passed;
  const anyPartial = py.partial || node.partial || php.partial;

  if (pyPassed && nodePassed && phpPassed && anyPartial) {
    return { status: STATUS_COVERED, missingReqs: [] };
  }
  if (anyPartial) {
    return {
      status: STATUS_PARTIAL,
      missingReqs: collectStrictTypingMissingReqs(py, node, php, hasPython, hasNode, hasPhp),
    };
  }
  return {
    status: STATUS_MISSING,
    missingReqs: ['Sin tipado estricto ni control de complejidad configurado.'],
  };
}

export function evaluateLayer02StrictTyping(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = CODE_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 2,
      layer_id: 'L02_STRICT_TYPING_COMPLEXITY',
      layer_name: 'Tipado Estricto y Complejidad Ciclomática/Cognitiva',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_LINT,
    };
  }

  const hasPython = stacks.includes(STACK_PYTHON) || stacks.includes(STACK_FASTAPI);
  const hasNode = stacks.includes(STACK_NODE_BACKEND) || stacks.includes(STACK_VUE3) || stacks.includes(STACK_REACT_FRONTEND);
  const hasPhp = stacks.includes(STACK_PHP);

  const py = checkPythonTyping(projectPath, files);
  const node = checkNodeTyping(projectPath);
  const php = checkPhpTyping(projectPath, files);

  const { status, missingReqs } = determineStrictTypingStatus(py, node, php, hasPython, hasNode, hasPhp);

  return {
    layer_number: 2,
    layer_id: 'L02_STRICT_TYPING_COMPLEXITY',
    layer_name: 'Tipado Estricto y Complejidad Ciclomática/Cognitiva',
    status,
    applicable_stacks: applicable,
    detected_evidence: [...py.evidence, ...node.evidence, ...php.evidence],
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_PYPROJECT, BP_VUE3_TSCONFIG],
    make_target: MAKE_QA_LINT,
  };
}

function determineUnitStatus(
  hasUnitFiles: boolean,
  threshold95: boolean,
  orphansCount: number
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasUnitFiles && threshold95 && orphansCount === 0) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasUnitFiles || threshold95) {
    if (orphansCount > 0) {
      missingReqs.push(`${orphansCount} archivos de código fuente carecen de prueba unitaria (.unit.*).`);
    }
    if (!threshold95) {
      missingReqs.push('Falta configurar umbral estricto fail_under = 95 en la suite de cobertura.');
    }
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('0 archivos de pruebas unitarias detectados en el proyecto.');
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer03UnitIsolated(
  projectPath: string,
  files: string[],
  stacks: StackName[],
  orphans: OrphanSourceFile[]
): PyramidLayerAudit {
  const applicable = ALL_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 3,
      layer_id: 'L03_UNIT_ISOLATED',
      layer_name: 'Pruebas Unitarias Aisladas (>= 95% Cobertura)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_UNIT,
    };
  }

  const pyproject = readFileContentSafe(projectPath, PYPROJECT_TOML);
  const vitestConfig = readFileContentSafe(projectPath, 'vitest.config.ts');
  const pkgJson = readFileContentSafe(projectPath, PACKAGE_JSON);
  const composer = readFileContentSafe(projectPath, COMPOSER_JSON);
  const phpunitXml = readFileContentSafe(projectPath, 'phpunit.xml');

  const unitFiles = files.filter(
    (f) =>
      f.includes('.unit.') ||
      f.endsWith('.bats') ||
      (f.includes('tests/') && f.endsWith('.py')) ||
      (f.includes('tests/') && (f.endsWith('Test.php') || f.endsWith('.unit.php')))
  );

  const threshold95 =
    pyproject.includes('fail_under = 95') ||
    pyproject.includes('fail-under = 95') ||
    /(?:lines|branches|functions|statements)\s*:\s*95\b/.test(vitestConfig) ||
    pkgJson.includes('thresholds: 95') ||
    composer.includes('--min=95') ||
    phpunitXml.includes('highLowerBound="95"');

  const detected: string[] = [];
  if (unitFiles.length > 0) detected.push(`${unitFiles.length} archivos de pruebas unitarias`);
  if (threshold95) detected.push('Umbral de cobertura >= 95% configurado');

  const { status, missingReqs } = determineUnitStatus(
    unitFiles.length > 0,
    threshold95,
    orphans.length
  );

  return {
    layer_number: 3,
    layer_id: 'L03_UNIT_ISOLATED',
    layer_name: 'Pruebas Unitarias Aisladas (>= 95% Cobertura)',
    status,
    applicable_stacks: ALL_STACKS.filter((s) => stacks.includes(s)),
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_PYPROJECT, BP_VUE3_VITEST],
    make_target: MAKE_QA_UNIT,
  };
}

function determineOrmParityStatus(
  hasMigrations: boolean,
  hasParityScript: boolean,
  hasPostgres: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasMigrations && hasParityScript && hasPostgres) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasMigrations || hasParityScript || hasPostgres) {
    if (!hasMigrations) missingReqs.push('Faltan migraciones versionadas (alembic/versions).');
    if (!hasParityScript) missingReqs.push(`Falta script .agents/scripts/${VERIFY_ALEMBIC_ORM_PARITY}.`);
    if (!hasPostgres) missingReqs.push('Falta servicio PostgreSQL real en docker-compose.qa.yml.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('Modelos ORM detectados pero no existen migraciones ni verificación contra BD real.');
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer04OrmParity(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const hasModels = files.some(
    (f) => f.includes('models/') || f.endsWith('models.py') || f.endsWith('schema.prisma')
  );

  if (!hasModels) {
    return {
      layer_number: 4,
      layer_id: 'L04_ORM_MIGRATION_PARITY',
      layer_name: 'Paridad Real de Esquemas ORM y Migraciones (Anti-Mock Blindness)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_PARITY,
    };
  }

  const hasMigrations = files.some((f) => f.includes('alembic/versions') || f.includes('migrations/versions'));
  const hasParityScript = files.some((f) => f.includes(VERIFY_ALEMBIC_ORM_PARITY));
  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const hasPostgres = dockerCompose.includes('postgres:') || dockerCompose.includes('postgres-17');

  const detected: string[] = ['Modelos ORM detectados'];
  if (hasMigrations) detected.push('Directorio de migraciones de esquema');
  if (hasParityScript) detected.push(`.agents/scripts/${VERIFY_ALEMBIC_ORM_PARITY}`);
  if (hasPostgres) detected.push('Servicio PostgreSQL en docker-compose.qa.yml');

  const { status, missingReqs } = determineOrmParityStatus(
    hasMigrations,
    hasParityScript,
    hasPostgres
  );

  return {
    layer_number: 4,
    layer_id: 'L04_ORM_MIGRATION_PARITY',
    layer_name: 'Paridad Real de Esquemas ORM y Migraciones (Anti-Mock Blindness)',
    status,
    applicable_stacks: [STACK_FASTAPI, STACK_PYTHON, STACK_NODE_BACKEND].filter((s) => stacks.includes(s)),
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [
      'fastapi/alembic/env.py.example',
      `common_files/.agents/scripts/${VERIFY_ALEMBIC_ORM_PARITY}.example`,
    ],
    make_target: MAKE_QA_PARITY,
  };
}

export function evaluateLayer05ContractFuzzing(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = [STACK_FASTAPI, STACK_NODE_BACKEND, STACK_VUE3, STACK_REACT_FRONTEND].filter((s) =>
    stacks.includes(s)
  );
  if (applicable.length === 0) {
    return {
      layer_number: 5,
      layer_id: 'L05_CONTRACT_FUZZING_OPENAPI',
      layer_name: 'Contratos de Integración y Fuzzing OpenAPI (Schemathesis)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_CONTRACTS,
    };
  }

  const hasContractFiles = files.some((f) => f.includes('.spec.') || f.includes('contracts/'));
  const pyproject = readFileContentSafe(projectPath, PYPROJECT_TOML);
  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const hasSchemathesis = pyproject.includes('schemathesis') || dockerCompose.includes('schemathesis');
  const hasParityScript = files.some((f) => f.includes(VERIFY_NO_ORPHAN_API));

  const detected: string[] = [];
  if (hasContractFiles) detected.push('Archivos de contrato (*.spec.*)');
  if (hasSchemathesis) detected.push('Schemathesis OpenAPI fuzzing configurado');
  if (hasParityScript) detected.push(VERIFY_NO_ORPHAN_API);

  const hasContracts = hasContractFiles || hasSchemathesis;
  let status: PyramidLayerStatus = STATUS_MISSING;
  const missingReqs: string[] = [];

  if (hasContracts && hasParityScript) {
    status = STATUS_COVERED;
  } else if (hasContracts || hasParityScript) {
    status = STATUS_PARTIAL;
    if (!hasParityScript) missingReqs.push(`Falta validador de endpoints huérfanos ${VERIFY_NO_ORPHAN_API}.`);
    if (!hasContracts) missingReqs.push('Faltan contratos de integración o Schemathesis.');
  } else {
    missingReqs.push('Sin pruebas de contrato OpenAPI ni validador de paridad de endpoints.');
  }

  return {
    layer_number: 5,
    layer_id: 'L05_CONTRACT_FUZZING_OPENAPI',
    layer_name: 'Contratos de Integración y Fuzzing OpenAPI (Schemathesis)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [`common_files/.agents/scripts/${VERIFY_NO_ORPHAN_API}.example`],
    make_target: MAKE_QA_CONTRACTS,
  };
}

function determineBddApiStatus(
  hasFeature: boolean,
  hasKarateService: boolean,
  untestedCount: number
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasFeature && hasKarateService && untestedCount === 0) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasFeature || hasKarateService) {
    if (!hasFeature) missingReqs.push(`No existe ${API_TEST_FEATURE}.`);
    if (!hasKarateService) missingReqs.push('Falta servicio Karate Labs en docker-compose.qa.yml.');
    if (untestedCount > 0) {
      missingReqs.push(`${untestedCount} endpoints de API carecen de escenarios BDD en Karate Labs.`);
    }
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push(`No existe ${API_TEST_FEATURE} ni configuración de Karate Labs API.`);
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer06BddApiKarate(
  projectPath: string,
  files: string[],
  stacks: StackName[],
  untestedApis: UntestedApiEndpoint[]
): PyramidLayerAudit {
  const applicable = BACKEND_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 6,
      layer_id: 'L06_BDD_API_KARATE',
      layer_name: 'Pruebas BDD de Caja Negra de API (Karate Labs API)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_BDD,
    };
  }

  const hasFeature = files.some(
    (f) => f.endsWith('.feature') && f.includes(API_TEST_FEATURE)
  );
  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const hasKarateService = dockerCompose.includes('karatelabs') || dockerCompose.includes('karate:');

  const detected: string[] = [];
  if (hasFeature) detected.push(`Escenarios BDD en ${API_TEST_FEATURE}`);
  if (hasKarateService) detected.push('Servicio Karate Labs en docker-compose.qa.yml');

  const { status, missingReqs } = determineBddApiStatus(
    hasFeature,
    hasKarateService,
    untestedApis.length
  );

  return {
    layer_number: 6,
    layer_id: 'L06_BDD_API_KARATE',
    layer_name: 'Pruebas BDD de Caja Negra de API (Karate Labs API)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [
      `fastapi/test/${API_TEST_FEATURE}.example`,
      BP_FASTAPI_DOCKER_COMPOSE,
    ],
    make_target: MAKE_QA_BDD,
  };
}

function isOperationalMonitorView(file: string): boolean {
  if (!/(?:views|pages)\//i.test(file) || !/\.(?:vue|tsx|jsx)$/i.test(file)) {
    return false;
  }
  const baseName = path.basename(file);
  return /(?:Dashboard|Noc|Wallboard|Monitor|Map|Console)/i.test(baseName);
}

export function checkOperationalViewsDualRefresh(
  projectPath: string,
  files: string[]
): { applicable: boolean; passed: boolean } {
  const operationalViews = files.filter((f) => isOperationalMonitorView(f));
  if (operationalViews.length === 0) {
    return { applicable: false, passed: true };
  }

  for (const view of operationalViews) {
    const content = readFileContentSafe(projectPath, view);
    const hasAutoRefresh =
      content.includes('setInterval') ||
      content.includes('WebSocket') ||
      content.includes('useWebSocket');
    const hasManualRefresh =
      content.includes('Refrescar') ||
      content.includes('refresh=true') ||
      content.includes('handleRefresh') ||
      content.includes('onRefresh');
    if (!hasAutoRefresh || !hasManualRefresh) {
      return { applicable: true, passed: false };
    }
  }

  return { applicable: true, passed: true };
}

function applyDualRefreshToLayer07(
  projectPath: string,
  files: string[],
  currentStatus: PyramidLayerStatus,
  detected: string[],
  missingReqs: string[]
): PyramidLayerStatus {
  const dualRefresh = checkOperationalViewsDualRefresh(projectPath, files);
  if (!dualRefresh.applicable) {
    return currentStatus;
  }
  if (dualRefresh.passed) {
    detected.push(
      'Invariante de Refresco Dual (Auto + Manual [ 🔄 Refrescar ]) en vistas operativas'
    );
    return currentStatus;
  }
  missingReqs.push(
    'Vistas de monitoreo/dashboard detectadas sin Invariante de Refresco Dual (setInterval/WebSocket + botón manual [ 🔄 Refrescar ]).'
  );
  return currentStatus === STATUS_COVERED ? STATUS_PARTIAL : currentStatus;
}

export function evaluateLayer07BddUiKarate(
  projectPath: string,
  files: string[],
  stacks: StackName[],
  untestedViews: UntestedUiView[]
): PyramidLayerAudit {
  const applicable = FRONTEND_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 7,
      layer_id: 'L07_BDD_UI_KARATE',
      layer_name: 'Pruebas BDD de Flujos de Negocio en UI (Karate Labs UI)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_BDD,
    };
  }

  const hasUiFeature = files.some(
    (f) => f.endsWith('.feature') && f.includes(UI_BUSINESS_FLOW_FEATURE)
  );

  const detected: string[] = [];
  if (hasUiFeature) detected.push(`Escenarios BDD UI en ${UI_BUSINESS_FLOW_FEATURE}`);

  let status: PyramidLayerStatus = STATUS_MISSING;
  const missingReqs: string[] = [];

  if (hasUiFeature && untestedViews.length === 0) {
    status = STATUS_COVERED;
  } else if (hasUiFeature) {
    status = STATUS_PARTIAL;
    missingReqs.push(`${untestedViews.length} vistas UI carecen de cobertura de flujo BDD/E2E.`);
  } else {
    missingReqs.push(`No existe ${UI_BUSINESS_FLOW_FEATURE} para validar flujos de usuario.`);
  }

  status = applyDualRefreshToLayer07(projectPath, files, status, detected, missingReqs);

  return {
    layer_number: 7,
    layer_id: 'L07_BDD_UI_KARATE',
    layer_name: 'Pruebas BDD de Flujos de Negocio en UI (Karate Labs UI)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [`vue3/test/${UI_BUSINESS_FLOW_FEATURE}.example`],
    make_target: MAKE_QA_BDD,
  };
}

function detectMutationCapabilities(
  projectPath: string,
  files: string[]
): { hasTool: boolean; hasTarget: boolean; detected: string[] } {
  const pyproject = readFileContentSafe(projectPath, PYPROJECT_TOML);
  const pkgJson = readFileContentSafe(projectPath, PACKAGE_JSON);
  const makefile = readFileContentSafe(projectPath, MAKEFILE_NAME);
  const composer = readFileContentSafe(projectPath, COMPOSER_JSON);

  const hasMutmut = pyproject.includes('mutmut');
  const hasStryker = pkgJson.includes('stryker') || files.some((f) => f.includes('stryker.conf.json'));
  const hasInfection =
    composer.includes('infection') ||
    files.some((f) => f.includes('infection.json5') || f.includes('infection.json'));
  const hasTarget = makefile.includes('qa-mutation');
  const hasTool = hasMutmut || hasStryker || hasInfection;

  const detected: string[] = [];
  if (hasMutmut) detected.push('Mutmut configurado en pyproject.toml');
  if (hasStryker) detected.push('Stryker configurado en package.json');
  if (hasInfection) detected.push('Infection configurado en composer.json/infection.json5');
  if (hasTarget) detected.push('Target qa-mutation en Makefile');

  return { hasTool, hasTarget, detected };
}

function determineMutationStatus(
  hasTool: boolean,
  hasTarget: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  if (hasTool && hasTarget) {
    return { status: STATUS_COVERED, missingReqs: [] };
  }
  if (hasTool || hasTarget) {
    const missingReqs: string[] = [];
    if (!hasTarget) missingReqs.push('Falta target qa-mutation en Makefile.');
    if (!hasTool) missingReqs.push('Falta configuración de mutmut o stryker.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  return {
    status: STATUS_MISSING,
    missingReqs: ['Sin configuración ni herramienta de pruebas de mutación.'],
  };
}

export function evaluateLayer08Mutation(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = CODE_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 8,
      layer_id: 'L08_MUTATION_TESTING',
      layer_name: 'Pruebas de Mutación (Mutmut / Stryker)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_MUTATION,
    };
  }

  const { hasTool, hasTarget, detected } = detectMutationCapabilities(projectPath, files);
  const { status, missingReqs } = determineMutationStatus(hasTool, hasTarget);

  return {
    layer_number: 8,
    layer_id: 'L08_MUTATION_TESTING',
    layer_name: 'Pruebas de Mutación (Mutmut / Stryker)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_PYPROJECT, BP_VUE3_STRYKER],
    make_target: MAKE_QA_MUTATION,
  };
}

export function evaluateLayer09A11yLighthouse(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = FRONTEND_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 9,
      layer_id: 'L09_A11Y_WCAG_LIGHTHOUSE_GEOMETRY',
      layer_name: 'Accesibilidad WCAG 2.1 AA, Geometría Anti-JSDOM y Lighthouse CI',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_E2E,
    };
  }

  const hasA11yTest = files.some(
    (f) => f.includes(ACCESSIBILITY_E2E) || (f.includes('e2e/') && f.includes('accessibility'))
  );
  const hasLighthouserc = files.some((f) => f.includes(LIGHTHOUSERC_JS));
  const pkgJson = readFileContentSafe(projectPath, PACKAGE_JSON);
  const hasAxe = pkgJson.includes('@axe-core/playwright');

  const detected: string[] = [];
  if (hasA11yTest) detected.push(`Suite de accesibilidad ${ACCESSIBILITY_E2E}`);
  if (hasLighthouserc) detected.push(`Configuración ${LIGHTHOUSERC_JS}`);
  if (hasAxe) detected.push('Dependencia @axe-core/playwright instalada');

  let status: PyramidLayerStatus = STATUS_MISSING;
  const missingReqs: string[] = [];

  if (hasA11yTest && hasLighthouserc && hasAxe) {
    status = STATUS_COVERED;
  } else if (hasA11yTest || hasLighthouserc || hasAxe) {
    status = STATUS_PARTIAL;
    if (!hasA11yTest) missingReqs.push(`Falta archivo e2e/${ACCESSIBILITY_E2E}.`);
    if (!hasLighthouserc) missingReqs.push(`Falta archivo de configuración ${LIGHTHOUSERC_JS}.`);
    if (!hasAxe) missingReqs.push('Falta instalar @axe-core/playwright.');
  } else {
    missingReqs.push('Sin pruebas de accesibilidad WCAG ni Lighthouse CI.');
  }

  return {
    layer_number: 9,
    layer_id: 'L09_A11Y_WCAG_LIGHTHOUSE_GEOMETRY',
    layer_name: 'Accesibilidad WCAG 2.1 AA, Geometría Anti-JSDOM y Lighthouse CI',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [
      `vue3/e2e/${ACCESSIBILITY_E2E}.example`,
      `vue3/${LIGHTHOUSERC_JS}.example`,
    ],
    make_target: MAKE_QA_E2E,
  };
}

function determinePerfLoadStatus(
  hasFile: boolean,
  hasDockerService: boolean,
  hasMakeTarget: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasFile && hasDockerService && hasMakeTarget) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasFile || hasDockerService || hasMakeTarget) {
    if (!hasFile) missingReqs.push(`Falta ${LOCUSTFILE_PY} o escenario Artillery.`);
    if (!hasDockerService) missingReqs.push('Falta servicio de carga en docker-compose.qa.yml.');
    if (!hasMakeTarget) missingReqs.push('Falta target qa-perf en Makefile.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('Sin pruebas de carga ni concurrencia.');
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer10PerfLoad(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = BACKEND_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 10,
      layer_id: 'L10_PERF_LOAD_STRESS',
      layer_name: 'Pruebas de Rendimiento, Concurrencia y Estrés (Locust / Artillery)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_PERF,
    };
  }

  const hasLocust = files.some((f) => f.includes(LOCUSTFILE_PY));
  const hasArtillery = files.some((f) => f.includes('load-test.yml') || f.includes('artillery'));
  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const makefile = readFileContentSafe(projectPath, MAKEFILE_NAME);

  const hasDockerService = dockerCompose.includes('locust') || dockerCompose.includes('artillery');
  const hasMakeTarget = makefile.includes('qa-perf');
  const hasFile = hasLocust || hasArtillery;

  const detected: string[] = [];
  if (hasLocust) detected.push(`Archivo de carga ${LOCUSTFILE_PY}`);
  if (hasArtillery) detected.push('Escenario Artillery load-test.yml');
  if (hasDockerService) detected.push('Servicio de carga en docker-compose.qa.yml');
  if (hasMakeTarget) detected.push('Target qa-perf en Makefile');

  const { status, missingReqs } = determinePerfLoadStatus(
    hasFile,
    hasDockerService,
    hasMakeTarget
  );

  return {
    layer_number: 10,
    layer_id: 'L10_PERF_LOAD_STRESS',
    layer_name: 'Pruebas de Rendimiento, Concurrencia y Estrés (Locust / Artillery)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [`fastapi/test/${LOCUSTFILE_PY}.example`],
    make_target: MAKE_QA_PERF,
  };
}

function determineDastZapStatus(
  hasZap: boolean,
  hasMakeTarget: boolean,
  hasOshpEvidence: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasZap && hasMakeTarget && hasOshpEvidence) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasZap || hasMakeTarget || hasOshpEvidence) {
    if (!hasZap) missingReqs.push('Falta servicio zap en docker-compose.qa.yml.');
    if (!hasMakeTarget) missingReqs.push('Falta target qa-dast en Makefile.');
    if (!hasOshpEvidence) missingReqs.push('Falta verificación de cabeceras de seguridad OWASP OSHP.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('Sin escaneo DAST OWASP ZAP ni pruebas de cabeceras OSHP.');
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer11DastZap(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = CODE_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 11,
      layer_id: 'L11_DAST_OWASP_ZAP_OSHP',
      layer_name: 'Seguridad Dinámica DAST (OWASP ZAP) y Cabeceras OSHP',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_DAST,
    };
  }

  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const makefile = readFileContentSafe(projectPath, MAKEFILE_NAME);

  const hasZap = dockerCompose.includes('zap') || dockerCompose.includes('zaproxy');
  const hasMakeTarget = makefile.includes('qa-dast');
  const hasOshpEvidence = files.some(
    (f) =>
      f.includes('security') ||
      readFileContentSafe(projectPath, f).includes('Content-Security-Policy')
  );

  const detected: string[] = [];
  if (hasZap) detected.push('Contenedor OWASP ZAP en docker-compose.qa.yml');
  if (hasMakeTarget) detected.push('Target qa-dast en Makefile');
  if (hasOshpEvidence) detected.push('Cabeceras OSHP en código/configuración');

  const { status, missingReqs } = determineDastZapStatus(
    hasZap,
    hasMakeTarget,
    hasOshpEvidence
  );

  return {
    layer_number: 11,
    layer_id: 'L11_DAST_OWASP_ZAP_OSHP',
    layer_name: 'Seguridad Dinámica DAST (OWASP ZAP) y Cabeceras OSHP',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_DOCKER_COMPOSE],
    make_target: MAKE_QA_DAST,
  };
}

function detectMetricsInstrumentation(projectPath: string, files: string[]): boolean {
  return files.some((f) => {
    const text = readFileContentSafe(projectPath, f);
    return text.includes('/metrics') || text.includes('Pushgateway') || text.includes('prometheus');
  });
}

function determineChaosStatus(
  hasMetrics: boolean,
  hasPumba: boolean,
  hasMakeTarget: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasMetrics && hasPumba && hasMakeTarget) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasMetrics || hasPumba || hasMakeTarget) {
    if (!hasMetrics) missingReqs.push('Falta instrumentación de telemetría RED (/metrics o Pushgateway).');
    if (!hasPumba) missingReqs.push('Falta servicio Pumba en docker-compose.qa.yml.');
    if (!hasMakeTarget) missingReqs.push('Falta target qa-chaos en Makefile.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('Sin telemetría RED ni inyección de fallos con Pumba.');
  return { status: STATUS_MISSING, missingReqs };
}

export function evaluateLayer12ChaosRed(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = ALL_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 12,
      layer_id: 'L12_CHAOS_RED_OBSERVABILITY',
      layer_name: 'Ingeniería del Caos y Telemetría RED Pre-Caos (Pumba + Prometheus)',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_CHAOS,
    };
  }

  const dockerCompose = readFileContentSafe(projectPath, DOCKER_COMPOSE_QA);
  const makefile = readFileContentSafe(projectPath, MAKEFILE_NAME);

  const hasPumba = dockerCompose.includes('pumba');
  const hasMakeTarget = makefile.includes('qa-chaos');
  const hasMetrics = detectMetricsInstrumentation(projectPath, files);

  const detected: string[] = [];
  if (hasMetrics) detected.push('Instrumentación de métricas RED (Prometheus/Pushgateway)');
  if (hasPumba) detected.push('Servicio Pumba en docker-compose.qa.yml');
  if (hasMakeTarget) detected.push('Target qa-chaos en Makefile');

  const { status, missingReqs } = determineChaosStatus(hasMetrics, hasPumba, hasMakeTarget);

  return {
    layer_number: 12,
    layer_id: 'L12_CHAOS_RED_OBSERVABILITY',
    layer_name: 'Ingeniería del Caos y Telemetría RED Pre-Caos (Pumba + Prometheus)',
    status,
    applicable_stacks: ALL_STACKS.filter((s) => stacks.includes(s)),
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_DOCKER_COMPOSE],
    make_target: MAKE_QA_CHAOS,
  };
}

function detectTrimodalTriad(projectPath: string, files: string[]): boolean {
  for (const f of files) {
    const isTestOrFixture =
      f.includes('fixture') ||
      f.includes('.unit.') ||
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('tests/') ||
      f.endsWith('.bats');
    if (isTestOrFixture && (f.endsWith('.py') || f.endsWith('.ts') || f.endsWith('.json'))) {
      const content = readFileContentSafe(projectPath, f).toLowerCase();
      const hasVirgin = content.includes('virgin') || content.includes('factory_default') || content.includes('virgen');
      const hasNominal = content.includes('nominal');
      const hasDegraded = content.includes('degraded') || content.includes('degradado');
      if (hasVirgin && hasNominal && hasDegraded) {
        return true;
      }
    }
  }
  return false;
}

function determineTrimodalStatus(
  hasTrimodalTriad: boolean,
  hasNoDevTest: boolean,
  hasFixtures: boolean
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const missingReqs: string[] = [];
  if (hasTrimodalTriad && hasNoDevTest) {
    return { status: STATUS_COVERED, missingReqs };
  }
  if (hasFixtures || hasTrimodalTriad || hasNoDevTest) {
    if (!hasTrimodalTriad) missingReqs.push('Faltan fixtures trimodales completos (virgen, nominal, degradado).');
    if (!hasNoDevTest) missingReqs.push('Falta prueba de aislamiento productivo --no-dev.');
    return { status: STATUS_PARTIAL, missingReqs };
  }
  missingReqs.push('Pruebas basadas únicamente en mocks felices sin fixtures trimodales.');
  return { status: STATUS_MISSING, missingReqs };
}

function isTemporalCandidateSourceFile(file: string): boolean {
  const inSourceDir = file.includes('src/') || file.includes('app/');
  const isSourceExt =
    file.endsWith('.py') || file.endsWith('.ts') || file.endsWith('.vue') || file.endsWith('.php');
  return inSourceDir && isSourceExt;
}

export function projectHasTemporalEntities(
  projectPath: string,
  files: string[]
): boolean {
  for (const f of files) {
    if (!isTemporalCandidateSourceFile(f)) continue;
    const content = readFileContentSafe(projectPath, f);
    if (
      (content.includes('starts_at') && content.includes('ends_at')) ||
      content.includes('safe_mode') ||
      content.includes('maintenance_window')
    ) {
      return true;
    }
  }
  return false;
}

function isTemporalCandidateTestFile(file: string): boolean {
  return (
    file.includes('.unit.') ||
    file.includes('.spec.') ||
    file.includes('test_') ||
    file.endsWith('Test.php')
  );
}

function hasThreeTemporalPhaseAssertions(lowerContent: string): boolean {
  const hasScheduled =
    lowerContent.includes('programada') ||
    lowerContent.includes('scheduled') ||
    lowerContent.includes('pending');
  const hasActive =
    lowerContent.includes('en curso') ||
    lowerContent.includes('in_progress') ||
    lowerContent.includes('activa') ||
    lowerContent.includes('active');
  const hasExpiredOrCancelled =
    lowerContent.includes('cancelada') ||
    lowerContent.includes('cancelled') ||
    lowerContent.includes('expired') ||
    lowerContent.includes('expirada') ||
    lowerContent.includes('reverted');
  return hasScheduled && hasActive && hasExpiredOrCancelled;
}

export function detectThreePhaseTemporalTests(
  projectPath: string,
  files: string[]
): boolean {
  for (const f of files) {
    if (!isTemporalCandidateTestFile(f)) continue;
    const content = readFileContentSafe(projectPath, f).toLowerCase();
    if (hasThreeTemporalPhaseAssertions(content)) {
      return true;
    }
  }
  return false;
}

function applyTemporalLifecycleToLayer13(
  projectPath: string,
  files: string[],
  currentStatus: PyramidLayerStatus,
  detected: string[],
  missingReqs: string[]
): PyramidLayerStatus {
  if (!projectHasTemporalEntities(projectPath, files)) {
    return currentStatus;
  }
  if (detectThreePhaseTemporalTests(projectPath, files)) {
    detected.push(
      'Ciclo temporal de 3 fases verificado (Programada, En Curso, Expirada/Cancelada)'
    );
    return currentStatus;
  }
  missingReqs.push(
    'Entidades con ventana temporal (starts_at/ends_at) detectadas sin pruebas de las 3 fases del reloj (Programada, En Curso, Expirada/Cancelada).'
  );
  return currentStatus === STATUS_COVERED ? STATUS_PARTIAL : currentStatus;
}

export function evaluateLayer13TrimodalFixtures(
  projectPath: string,
  files: string[],
  stacks: StackName[]
): PyramidLayerAudit {
  const applicable = ALL_STACKS.filter((s) => stacks.includes(s));
  if (applicable.length === 0) {
    return {
      layer_number: 13,
      layer_id: 'L13_TRIMODAL_FIXTURES_NEGATIVE',
      layer_name: 'Fixtures Trimodales de Verdad de Campo e Invariantes Negativos',
      status: STATUS_NOT_APPLICABLE,
      applicable_stacks: [],
      detected_evidence: [],
      missing_requirements: [],
      recommended_blueprint_files: [],
      make_target: MAKE_QA_UNIT,
    };
  }

  const hasFixtures = files.some((f) => f.includes('fixture') || f.includes('test_data'));
  const hasNoDevTest = files.some(
    (f) =>
      f.includes('cleanliness') ||
      f.includes('production_no_dev') ||
      readFileContentSafe(projectPath, f).includes('test_production_no_dev_cleanliness')
  );

  const hasTrimodalTriad = detectTrimodalTriad(projectPath, files);

  const detected: string[] = [];
  if (hasFixtures) detected.push('Directorio o archivos de fixtures detectados');
  if (hasTrimodalTriad) detected.push('Tríada trimodal (virgen, nominal, degradado)');
  if (hasNoDevTest) detected.push('Prueba de blindaje productivo --no-dev');

  const { status: baseStatus, missingReqs } = determineTrimodalStatus(
    hasTrimodalTriad,
    hasNoDevTest,
    hasFixtures
  );
  const status = applyTemporalLifecycleToLayer13(
    projectPath,
    files,
    baseStatus,
    detected,
    missingReqs
  );

  return {
    layer_number: 13,
    layer_id: 'L13_TRIMODAL_FIXTURES_NEGATIVE',
    layer_name: 'Fixtures Trimodales de Verdad de Campo e Invariantes Negativos',
    status,
    applicable_stacks: ALL_STACKS.filter((s) => stacks.includes(s)),
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [BP_FASTAPI_TEST_PROD],
    make_target: MAKE_QA_UNIT,
  };
}

// ============================================================================
// 📋 Generador del Plan de Acción Priorizado
// ============================================================================

function addCriticalActions(
  plan: PrioritizedTestAction[],
  layers: PyramidLayerAudit[],
  inventory: MissingTestInventory
): void {
  if (inventory.orphan_source_files.length > 0) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_CRITICAL,
      layer_number: 3,
      title: 'Crear pruebas unitarias faltantes para archivos huérfanos',
      action:
        'Crear los archivos .unit.py y .unit.ts listados en missing_test_inventory.orphan_source_files aislando red con mocks y cubriendo ramas de error.',
      target_files_to_create: inventory.orphan_source_files
        .slice(0, 5)
        .map((o) => o.expected_unit_test),
      verification_command: MAKE_QA_UNIT,
    });
  }

  if (inventory.untested_api_endpoints.length > 0) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_CRITICAL,
      layer_number: 6,
      title: 'Incorporar escenarios BDD en Karate Labs para endpoints sin cobertura',
      action:
        'Hidratar api_test.feature con bootstrap_or_merge_11x y escribir escenarios BDD (2xx nominal, 4xx validación, 401/403 seguridad) para los endpoints en untested_api_endpoints.',
      target_files_to_create: [`fastapi/test/${API_TEST_FEATURE}`],
      verification_command: MAKE_QA_BDD,
    });
  }

  const l04 = layers.find((l) => l.layer_id === 'L04_ORM_MIGRATION_PARITY');
  if (l04 && (l04.status === STATUS_MISSING || l04.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_CRITICAL,
      layer_number: 4,
      title: 'Generar migraciones Alembic y verificar paridad ORM',
      action:
        'Generar migraciones para los modelos SQLAlchemy/Prisma y configurar verify_alembic_orm_parity.py contra PostgreSQL real.',
      target_files_to_create: [
        'alembic/versions/',
        `.agents/scripts/${VERIFY_ALEMBIC_ORM_PARITY}`,
      ],
      verification_command: MAKE_QA_PARITY,
    });
  }
}

function addHighActions(
  plan: PrioritizedTestAction[],
  layers: PyramidLayerAudit[],
  inventory: MissingTestInventory
): void {
  const l01 = layers.find((l) => l.layer_id === 'L01_STATIC_SAST_IAC');
  if (l01 && (l01.status === STATUS_MISSING || l01.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 1,
      title: 'Configurar linters inflexibles con --max-warnings 0 y scripts SAST/IaC',
      action:
        'Configurar linters estrictos y scripts de auditoría IaC (auditar-infra.sh) y secretos (verificar-secretos.sh).',
      target_files_to_create: [
        `scripts/${AUDITAR_INFRA_SH}`,
        `scripts/${VERIFICAR_SECRETOS_SH}`,
      ],
      verification_command: MAKE_QA_LINT,
    });
  }

  if (inventory.untested_ui_views.length > 0) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 7,
      title: 'Crear escenarios BDD en Karate UI para vistas sin cobertura',
      action:
        `Escribir escenarios BDD en test/${UI_BUSINESS_FLOW_FEATURE} cubriendo las vistas huérfanas de la interfaz.`,
      target_files_to_create: [`test/${UI_BUSINESS_FLOW_FEATURE}`],
      verification_command: MAKE_QA_BDD,
    });
  }

  const l08 = layers.find((l) => l.layer_id === 'L08_MUTATION_TESTING');
  if (l08 && (l08.status === STATUS_MISSING || l08.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 8,
      title: 'Configurar pruebas de mutación (Mutmut / Stryker)',
      action:
        'Configurar herramienta de mutación en pyproject.toml o stryker.conf.json e integrar target qa-mutation en Makefile.',
      target_files_to_create: ['stryker.conf.json'],
      verification_command: MAKE_QA_MUTATION,
    });
  }

  const l09 = layers.find((l) => l.layer_id === 'L09_A11Y_WCAG_LIGHTHOUSE_GEOMETRY');
  if (l09 && (l09.status === STATUS_MISSING || l09.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 9,
      title: 'Configurar pruebas de accesibilidad WCAG 2.1 AA y Lighthouse CI',
      action:
        `Crear suite e2e/${ACCESSIBILITY_E2E} con @axe-core/playwright y ${LIGHTHOUSERC_JS}.`,
      target_files_to_create: [`e2e/${ACCESSIBILITY_E2E}`, LIGHTHOUSERC_JS],
      verification_command: MAKE_QA_E2E,
    });
  }
}

function addMediumActions(
  plan: PrioritizedTestAction[],
  layers: PyramidLayerAudit[]
): void {
  const l05 = layers.find((l) => l.layer_id === 'L05_CONTRACT_FUZZING_OPENAPI');
  if (l05 && (l05.status === STATUS_MISSING || l05.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 5,
      title: 'Configurar pruebas de contrato y paridad OpenAPI',
      action:
        `Implementar suite de contratos de integración y validador de paridad front-back ${VERIFY_NO_ORPHAN_API}.`,
      target_files_to_create: [`.agents/scripts/${VERIFY_NO_ORPHAN_API}`],
      verification_command: MAKE_QA_CONTRACTS,
    });
  }

  const l10 = layers.find((l) => l.layer_id === 'L10_PERF_LOAD_STRESS');
  if (l10 && (l10.status === STATUS_MISSING || l10.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 10,
      title: 'Configurar pruebas de rendimiento y carga (Locust / Artillery)',
      action:
        `Crear escenario de carga en test/${LOCUSTFILE_PY} o test/load-test.yml y añadir servicio a ${DOCKER_COMPOSE_QA}.`,
      target_files_to_create: [`test/${LOCUSTFILE_PY}`],
      verification_command: MAKE_QA_PERF,
    });
  }

  const l11 = layers.find((l) => l.layer_id === 'L11_DAST_OWASP_ZAP_OSHP');
  if (l11 && (l11.status === STATUS_MISSING || l11.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 11,
      title: 'Configurar escaneo DAST dinámico con OWASP ZAP',
      action:
        `Añadir servicio zaproxy/zap-stable en ${DOCKER_COMPOSE_QA} y verificar cabeceras OSHP.`,
      target_files_to_create: [DOCKER_COMPOSE_QA],
      verification_command: MAKE_QA_DAST,
    });
  }

  const l12 = layers.find((l) => l.layer_id === 'L12_CHAOS_RED_OBSERVABILITY');
  if (l12 && (l12.status === STATUS_MISSING || l12.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 12,
      title: 'Instrumentar telemetría RED y perfiles de caos Pumba',
      action:
        `Exponer métricas Prometheus /metrics y configurar inyección de fallos de red con Pumba en ${DOCKER_COMPOSE_QA}.`,
      target_files_to_create: [DOCKER_COMPOSE_QA],
      verification_command: MAKE_QA_CHAOS,
    });
  }

  const l13 = layers.find((l) => l.layer_id === 'L13_TRIMODAL_FIXTURES_NEGATIVE');
  if (l13 && (l13.status === STATUS_MISSING || l13.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 13,
      title: 'Incorporar fixtures trimodales e invariantes negativos',
      action:
        'Crear fixtures para estados virgen, nominal y degradado, además de test de blindaje sin dependencias dev.',
      target_files_to_create: ['tests/fixtures/trimodal_fixtures.py'],
      verification_command: MAKE_QA_UNIT,
    });
  }
}

export function buildPrioritizedActionPlan(
  layers: PyramidLayerAudit[],
  inventory: MissingTestInventory
): PrioritizedTestAction[] {
  const plan: PrioritizedTestAction[] = [];
  addCriticalActions(plan, layers, inventory);
  addHighActions(plan, layers, inventory);
  addMediumActions(plan, layers);
  return plan;
}

// ============================================================================
// 🚀 Orquestador Principal: auditTestPyramidGaps
// ============================================================================

export async function auditTestPyramidGaps(
  projectPathInput: string,
  stackFilter?: StackName,
  maxItems?: number
): Promise<TestPyramidGapResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio especificado no existe: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolvedPath}`);
  }

  const files = collectProjectFiles(resolvedPath);

  let detectedStacks: StackName[] = [];
  if (stackFilter) {
    detectedStacks = [stackFilter];
  } else {
    const projectAudit = await inspectProjectConfig(resolvedPath);
    const hasAnyPythonFile = files.some(
      (f) => f.endsWith('.py') || f.endsWith('pyproject.toml')
    );
    detectedStacks = (projectAudit.detected_stacks as StackName[]).filter((s) => {
      if (s === 'python' || s === 'fastapi') return hasAnyPythonFile;
      return true;
    });
  }

  const orphanSourceFiles = findOrphanSourceFiles(resolvedPath, files, detectedStacks);
  const untestedApis = findUntestedApiEndpoints(resolvedPath, files);
  const untestedViews = findUntestedUiViews(resolvedPath, files);

  const fullMissingInventory: MissingTestInventory = {
    orphan_source_files: orphanSourceFiles,
    untested_api_endpoints: untestedApis,
    untested_ui_views: untestedViews,
  };

  const layersAudit: PyramidLayerAudit[] = [
    evaluateLayer01StaticSast(resolvedPath, files, detectedStacks),
    evaluateLayer02StrictTyping(resolvedPath, files, detectedStacks),
    evaluateLayer03UnitIsolated(resolvedPath, files, detectedStacks, orphanSourceFiles),
    evaluateLayer04OrmParity(resolvedPath, files, detectedStacks),
    evaluateLayer05ContractFuzzing(resolvedPath, files, detectedStacks),
    evaluateLayer06BddApiKarate(resolvedPath, files, detectedStacks, untestedApis),
    evaluateLayer07BddUiKarate(resolvedPath, files, detectedStacks, untestedViews),
    evaluateLayer08Mutation(resolvedPath, files, detectedStacks),
    evaluateLayer09A11yLighthouse(resolvedPath, files, detectedStacks),
    evaluateLayer10PerfLoad(resolvedPath, files, detectedStacks),
    evaluateLayer11DastZap(resolvedPath, files, detectedStacks),
    evaluateLayer12ChaosRed(resolvedPath, files, detectedStacks),
    evaluateLayer13TrimodalFixtures(resolvedPath, files, detectedStacks),
  ];

  const applicableLayers = layersAudit.filter((l) => l.status !== STATUS_NOT_APPLICABLE);
  let totalScore = 0;
  for (const layer of applicableLayers) {
    if (layer.status === STATUS_COVERED) {
      totalScore += 100;
    } else if (layer.status === STATUS_PARTIAL) {
      totalScore += 50;
    }
  }

  const pyramidScorePct =
    applicableLayers.length > 0
      ? Math.round(totalScore / applicableLayers.length)
      : 0;

  const summaryCounts = {
    covered: layersAudit.filter((l) => l.status === STATUS_COVERED).length,
    partial: layersAudit.filter((l) => l.status === STATUS_PARTIAL).length,
    missing: layersAudit.filter((l) => l.status === STATUS_MISSING).length,
    not_applicable: layersAudit.filter((l) => l.status === STATUS_NOT_APPLICABLE).length,
  };

  const prioritizedPlan = buildPrioritizedActionPlan(layersAudit, fullMissingInventory);

  const totalOrphans = orphanSourceFiles.length;
  const totalUntestedApis = untestedApis.length;
  const totalUntestedViews = untestedViews.length;

  let truncatedOrphans = orphanSourceFiles;
  let truncatedApis = untestedApis;
  let truncatedViews = untestedViews;

  if (typeof maxItems === 'number' && maxItems > 0) {
    truncatedOrphans = orphanSourceFiles.slice(0, maxItems);
    truncatedApis = untestedApis.slice(0, maxItems);
    truncatedViews = untestedViews.slice(0, maxItems);
  }

  const missingInventory: MissingTestInventory = {
    orphan_source_files: truncatedOrphans,
    untested_api_endpoints: truncatedApis,
    untested_ui_views: truncatedViews,
    total_orphan_files_count: totalOrphans,
    total_untested_apis_count: totalUntestedApis,
    total_untested_views_count: totalUntestedViews,
  };

  return {
    project_path: resolvedPath,
    detected_stacks: detectedStacks,
    pyramid_score_pct: pyramidScorePct,
    summary_counts: summaryCounts,
    layers_audit: layersAudit,
    missing_test_inventory: missingInventory,
    prioritized_action_plan: prioritizedPlan,
  };
}
