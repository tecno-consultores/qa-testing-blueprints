// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type {
  OrphanSourceFile,
  PyramidLayerAudit,
  PyramidLayerStatus,
  StackName,
} from '../../types.js';
import {
  ALL_STACKS,
  AUDITAR_INFRA_SH,
  BP_FASTAPI_PYPROJECT,
  BP_VUE3_TSCONFIG,
  BP_VUE3_VITEST,
  CODE_STACKS,
  COMPOSER_JSON,
  DOCKER_COMPOSE_QA,
  MAKEFILE_NAME,
  MAKE_QA_CONTRACTS,
  MAKE_QA_LINT,
  MAKE_QA_PARITY,
  MAKE_QA_UNIT,
  PACKAGE_JSON,
  PHPSTAN_NEON,
  PYPROJECT_TOML,
  STACK_FASTAPI,
  STACK_MOBILE_APPIUM,
  STACK_AI_EVALS,
  STACK_NODE_BACKEND,
  STACK_PHP,
  STACK_PYTHON,
  STACK_REACT_FRONTEND,
  STACK_VIBE_RESCUE,
  STACK_VUE3,
  STATUS_COVERED,
  STATUS_MISSING,
  STATUS_NOT_APPLICABLE,
  STATUS_PARTIAL,
  VERIFY_ALEMBIC_ORM_PARITY,
  VERIFY_NO_ORPHAN_API,
  VERIFICAR_SECRETOS_SH,
  readMergedConfigFiles,
} from './shared.js';

// ============================================================================
// 📐 Evaluadores de las 13 Capas de la Pirámide 11X (Complejidad Cognitiva <= 8)
// ============================================================================

interface BashPhpLinterInputs {
  readonly files: string[];
  readonly pyproject: string;
  readonly combinedPkg: string;
  readonly composer: string;
  readonly makefile: string;
}

function hasBashOrPhpLinterConfig(
  cfg: BashPhpLinterInputs
): { readonly hasBash: boolean; readonly hasPhp: boolean } {
  const hasBash =
    cfg.files.some((f) => f.endsWith('.sh')) &&
    (cfg.files.some((f) => f.includes('shellcheck')) ||
      cfg.pyproject.includes('shellcheck') ||
      cfg.combinedPkg.includes('shellcheck') ||
      cfg.makefile.includes('shellcheck'));
  const hasPhp =
    cfg.files.some((f) => f.includes('phpstan') || f.includes('psalm')) ||
    cfg.composer.includes('phpstan') ||
    cfg.composer.includes('psalm');
  return { hasBash, hasPhp };
}

function detectLinterCapabilities(
  projectPath: string,
  files: string[]
): { hasLinter: boolean; detected: string[] } {
  const pyproject = readMergedConfigFiles(projectPath, files, [PYPROJECT_TOML]);
  const combinedPkg = readMergedConfigFiles(projectPath, files, [PACKAGE_JSON]);
  const composer = readMergedConfigFiles(projectPath, files, [COMPOSER_JSON]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);

  const hasPythonLinter = pyproject.includes('ruff') && pyproject.includes('bandit');
  const hasNodeLinter =
    combinedPkg.includes('--max-warnings 0') &&
    (combinedPkg.includes('sonarjs') || combinedPkg.includes('security'));
  const { hasBash: hasBashLinter, hasPhp: hasPhpLinter } = hasBashOrPhpLinterConfig({
    files,
    pyproject,
    combinedPkg,
    composer,
    makefile,
  });

  const detected: string[] = [];
  if (hasPythonLinter) detected.push('ruff+bandit en pyproject.toml');
  if (hasNodeLinter) detected.push('eslint --max-warnings 0 en package.json');
  if (hasBashLinter) detected.push('shellcheck configurado');
  if (hasPhpLinter) detected.push('phpstan/psalm configurado');

  return { hasLinter: detected.length > 0, detected };
}

function appendStackL01Evidence(
  stacks: StackName[],
  files: string[],
  detected: string[]
): void {
  if (stacks.includes(STACK_AI_EVALS) && files.some((f) => f.includes('promptfooconfig'))) {
    detected.push('Configuración Red-Team Promptfoo');
  }
  if (stacks.includes(STACK_MOBILE_APPIUM) && files.some((f) => f.includes('wdio.conf.'))) {
    detected.push('Configuración WebdriverIO/Appium');
  }
  if (
    stacks.includes(STACK_VIBE_RESCUE) &&
    files.some((f) => f.endsWith('audit_vibe_prototype.py'))
  ) {
    detected.push('Auditor estático audit_vibe_prototype.py');
  }
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
  appendStackL01Evidence(stacks, files, detected);

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
  const pyproject = readMergedConfigFiles(projectPath, files, [PYPROJECT_TOML]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);
  const pyStrict = pyproject.includes('strict = true') || pyproject.includes('strict=true');
  const pyRadon =
    pyproject.includes('radon') ||
    pyproject.includes('C901') ||
    pyproject.includes('max-complexity') ||
    makefile.includes('radon') ||
    files.some((f) => f.includes('radon'));
  const evidence: string[] = [];
  if (pyStrict) evidence.push('mypy strict = true');
  if (pyRadon) evidence.push('radon complejidad');
  return { passed: pyStrict && pyRadon, partial: pyStrict || pyRadon, evidence };
}

function checkNodeTyping(
  projectPath: string,
  files: string[]
): { passed: boolean; partial: boolean; evidence: string[] } {
  const pkgJson = readMergedConfigFiles(projectPath, files, [PACKAGE_JSON]);
  const tsconfig = readMergedConfigFiles(projectPath, files, ['tsconfig.json']);
  const tsStrict =
    tsconfig.includes('"strict": true') ||
    tsconfig.includes('"strict":true') ||
    pkgJson.includes('tsc --strict');
  const tsTypecheck =
    pkgJson.includes('typecheck') ||
    pkgJson.includes('type-check') ||
    pkgJson.includes('tsc --noEmit') ||
    pkgJson.includes('tsc --strict');
  const evidence: string[] = [];
  if (tsStrict) evidence.push('tsconfig.json "strict": true');
  if (tsTypecheck) evidence.push('script typecheck (tsc --noEmit)');
  return { passed: tsStrict && tsTypecheck, partial: tsStrict || tsTypecheck, evidence };
}

function checkPhpTyping(
  projectPath: string,
  files: string[]
): { passed: boolean; partial: boolean; evidence: string[] } {
  const composer = readMergedConfigFiles(projectPath, files, [COMPOSER_JSON]);
  const phpstanContent = readMergedConfigFiles(projectPath, files, [
    PHPSTAN_NEON,
    'phpstan.neon.dist',
  ]);
  const hasPhpstan =
    phpstanContent.length > 0 || files.some((f) => f.includes(PHPSTAN_NEON));
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

interface StrictTypingStacksInput {
  readonly py: { passed: boolean; partial: boolean };
  readonly node: { passed: boolean; partial: boolean };
  readonly php: { passed: boolean; partial: boolean };
  readonly hasPython: boolean;
  readonly hasNode: boolean;
  readonly hasPhp: boolean;
}

function collectStrictTypingMissingReqs(input: StrictTypingStacksInput): string[] {
  const { py, node, php, hasPython, hasNode, hasPhp } = input;
  const missingReqs: string[] = [];
  if (hasPython && !py.passed) missingReqs.push('Configurar mypy con strict = true y radon.');
  if (hasNode && !node.passed) missingReqs.push('Configurar tsconfig "strict": true y script typecheck.');
  if (hasPhp && !php.passed) missingReqs.push('Configurar phpstan.neon con level: max y tomasvotruba/cognitive-complexity.');
  return missingReqs;
}

function determineStrictTypingStatus(
  input: StrictTypingStacksInput
): { status: PyramidLayerStatus; missingReqs: string[] } {
  const { py, node, php, hasPython, hasNode, hasPhp } = input;
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
      missingReqs: collectStrictTypingMissingReqs(input),
    };
  }
  return {
    status: STATUS_MISSING,
    missingReqs: ['Sin tipado estricto ni control de complejidad configurado.'],
  };
}

function resolveStrictTypingLanguages(
  files: string[],
  stacks: StackName[]
): { hasPython: boolean; hasNode: boolean; hasPhp: boolean } {
  const hasPyFiles = files.some((f) => f.endsWith('.py') || f.endsWith(PYPROJECT_TOML));
  const hasNodeFiles = files.some(
    (f) => /\.(?:ts|tsx|js|jsx|vue)$/.test(f) || f.endsWith(PACKAGE_JSON)
  );
  const hasHybridStack =
    stacks.includes(STACK_AI_EVALS) || stacks.includes(STACK_VIBE_RESCUE);
  return {
    hasPython:
      stacks.includes(STACK_PYTHON) ||
      stacks.includes(STACK_FASTAPI) ||
      (hasHybridStack && hasPyFiles),
    hasNode:
      stacks.includes(STACK_NODE_BACKEND) ||
      stacks.includes(STACK_VUE3) ||
      stacks.includes(STACK_REACT_FRONTEND) ||
      stacks.includes(STACK_MOBILE_APPIUM) ||
      (hasHybridStack && hasNodeFiles),
    hasPhp: stacks.includes(STACK_PHP),
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

  const { hasPython, hasNode, hasPhp } = resolveStrictTypingLanguages(files, stacks);

  const py = checkPythonTyping(projectPath, files);
  const node = checkNodeTyping(projectPath, files);
  const php = checkPhpTyping(projectPath, files);

  const { status, missingReqs } = determineStrictTypingStatus({
    py,
    node,
    php,
    hasPython,
    hasNode,
    hasPhp,
  });

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

function isUnitTestCandidateFile(file: string, stacks: StackName[]): boolean {
  if (file.includes('.unit.') || file.endsWith('.bats')) return true;
  if (file.includes('tests/') && file.endsWith('.py')) return true;
  if (file.includes('tests/') && (file.endsWith('Test.php') || file.endsWith('.unit.php'))) {
    return true;
  }
  if (
    stacks.includes(STACK_MOBILE_APPIUM) &&
    file.includes('tests/') &&
    (file.endsWith('.spec.ts') || file.endsWith('.test.ts'))
  ) {
    return true;
  }
  return (
    (stacks.includes(STACK_AI_EVALS) || file.startsWith(`${STACK_AI_EVALS}/`)) &&
    path.basename(file).startsWith('test_') &&
    file.endsWith('.py')
  );
}

interface CoverageConfigBundle {
  readonly pyproject: string;
  readonly makefile: string;
  readonly vitestConfig: string;
  readonly pkgJson: string;
  readonly composer: string;
  readonly phpunitXml: string;
}

const COV_FAIL_UNDER_RE = /--cov-fail-under[= ]+([0-9.]+)/gi;
const PY_FAIL_UNDER_RE = /\bfail[-_]under[ \t]*=[ \t]*([0-9.]+)/gi;
const MIN_COVERAGE_CLI_RE = /--min(?:-coverage)?[= ]+([0-9.]+)/gi;
const VITEST_THRESHOLD_RE = /\b(?:lines|branches|statements|functions|thresholds)[ \t]*:[ \t]*([0-9.]+)/gi;
const PKG_THRESHOLD_RE = /"(?:lines|branches|statements|functions)"[ \t]*:[ \t]*([0-9.]+)/gi;
const PHPUNIT_THRESHOLD_RE = /\b(?:minCoverage|highLowerBound)="([0-9.]+)"/gi;

const NODE_TEST_COV_RE = /--test-coverage-(?:lines|branches|functions)[= ]+([0-9.]+)/gi;
const KCOV_THRESHOLD_RE = /(?:pct\s*>=\s*|kcov[^\n]*-l\s*\d+,)([0-9.]+)/gi;

function hasNumericThresholdAtLeast(content: string, patterns: readonly RegExp[], minVal: number): boolean {
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= minVal) {
        return true;
      }
    }
  }
  return false;
}

function hasCoverageThreshold95(cfg: CoverageConfigBundle): boolean {
  const checks: ReadonlyArray<readonly [string, readonly RegExp[]]> = [
    [cfg.pyproject, [COV_FAIL_UNDER_RE, PY_FAIL_UNDER_RE]],
    [cfg.makefile, [COV_FAIL_UNDER_RE, MIN_COVERAGE_CLI_RE, NODE_TEST_COV_RE, KCOV_THRESHOLD_RE]],
    [cfg.vitestConfig, [VITEST_THRESHOLD_RE]],
    [cfg.pkgJson, [PKG_THRESHOLD_RE, VITEST_THRESHOLD_RE, COV_FAIL_UNDER_RE, NODE_TEST_COV_RE]],
    [cfg.composer, [MIN_COVERAGE_CLI_RE]],
    [cfg.phpunitXml, [PHPUNIT_THRESHOLD_RE]],
  ];
  return checks.some(([text, patterns]) => text.length > 0 && hasNumericThresholdAtLeast(text, patterns, 95));
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

  const pyproject = readMergedConfigFiles(projectPath, files, [PYPROJECT_TOML]);
  const vitestConfig = readMergedConfigFiles(projectPath, files, [
    'vitest.config.ts',
    'vitest.config.mts',
  ]);
  const pkgJson = readMergedConfigFiles(projectPath, files, [PACKAGE_JSON]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);
  const composer = readMergedConfigFiles(projectPath, files, [COMPOSER_JSON]);
  const phpunitXml = readMergedConfigFiles(projectPath, files, [
    'phpunit.xml',
    'phpunit.xml.dist',
  ]);

  const unitFiles = files.filter((f) => isUnitTestCandidateFile(f, stacks));

  const threshold95 = hasCoverageThreshold95({
    pyproject,
    makefile,
    vitestConfig,
    pkgJson,
    composer,
    phpunitXml,
  });

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
  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
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
    applicable_stacks: [STACK_FASTAPI, STACK_PYTHON, STACK_NODE_BACKEND, STACK_VIBE_RESCUE].filter((s) => stacks.includes(s)),
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [
      'fastapi/initdb/01-init-rls-role.sql.example',
      `.agents/scripts/${VERIFY_ALEMBIC_ORM_PARITY}`,
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
  const pyproject = readMergedConfigFiles(projectPath, files, [PYPROJECT_TOML]);
  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
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
    recommended_blueprint_files: [`.agents/scripts/${VERIFY_NO_ORPHAN_API}`],
    make_target: MAKE_QA_CONTRACTS,
  };
}

