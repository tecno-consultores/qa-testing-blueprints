// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type {
  MissingTestInventory,
  PrioritizedTestAction,
  PyramidLayerAudit,
  PyramidLayerStatus,
  StackName,
  TestPyramidMetaGateAudit,
} from '../../types.js';
import { type LayerAugmentContext } from './bddAndQualityLayers.js';
import {
  ACCESSIBILITY_E2E,
  ALL_STACKS,
  API_TEST_FEATURE,
  AUDITAR_INFRA_SH,
  BP_FASTAPI_TEST_PROD,
  DOCKER_COMPOSE_QA,
  LIGHTHOUSERC_JS,
  LOCUSTFILE_PY,
  PYPROJECT_TOML,
  UI_BUSINESS_FLOW_FEATURE,
  VERIFICAR_SECRETOS_SH,
  VERIFY_ALEMBIC_ORM_PARITY,
  VERIFY_NO_ORPHAN_API,
  MAKE_QA_BDD,
  MAKE_QA_CHAOS,
  MAKE_QA_CONTRACTS,
  MAKE_QA_DAST,
  MAKE_QA_E2E,
  MAKE_QA_LINT,
  MAKE_QA_MUTATION,
  MAKE_QA_PARITY,
  MAKE_QA_PERF,
  MAKE_QA_UNIT,
  PRIORITY_CRITICAL,
  PRIORITY_HIGH,
  PRIORITY_MEDIUM,
  STATUS_COVERED,
  STATUS_MISSING,
  STATUS_NOT_APPLICABLE,
  STATUS_PARTIAL,
  isDocLikeFile,
  readFileContentSafe,
} from './shared.js';

const TRIMODAL_PATH_MARKERS = ['fixture', '.unit.', '.test.', '.spec.', 'tests/'] as const;
const TRIMODAL_EXTS = ['.py', '.ts', '.json', '.bats'] as const;

function isTrimodalCandidateFile(file: string): boolean {
  const isTestOrFixture =
    TRIMODAL_PATH_MARKERS.some((m) => file.includes(m)) ||
    path.basename(file).startsWith('test_') ||
    file.endsWith('.bats');
  return isTestOrFixture && TRIMODAL_EXTS.some((ext) => file.endsWith(ext));
}

function detectTrimodalTriad(projectPath: string, files: string[]): boolean {
  for (const f of files) {
    if (!isTrimodalCandidateFile(f)) continue;
    const content = readFileContentSafe(projectPath, f).toLowerCase();
    const hasVirgin =
      content.includes('virgin') ||
      content.includes('factory_default') ||
      content.includes('virgen');
    const hasDegraded = content.includes('degraded') || content.includes('degradado');
    if (hasVirgin && content.includes('nominal') && hasDegraded) {
      return true;
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

function applyTemporalLifecycleToLayer13(ctx: LayerAugmentContext): PyramidLayerStatus {
  const { projectPath, files, currentStatus, detected, missingReqs } = ctx;
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
      !isDocLikeFile(f) &&
      (f.includes('cleanliness') ||
        f.includes('production_no_dev') ||
        readFileContentSafe(projectPath, f).includes('test_production_no_dev_cleanliness'))
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
  const status = applyTemporalLifecycleToLayer13({
    projectPath,
    files,
    currentStatus: baseStatus,
    detected,
    missingReqs,
  });

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

function isLayerIncomplete(layer: PyramidLayerAudit | undefined): boolean {
  return layer !== undefined && (layer.status === STATUS_MISSING || layer.status === STATUS_PARTIAL);
}

function addCriticalActions(
  plan: PrioritizedTestAction[],
  layers: PyramidLayerAudit[],
  inventory: MissingTestInventory
): void {
  const l03 = layers.find((l) => l.layer_id === 'L03_UNIT_ISOLATED');
  if (inventory.orphan_source_files.length > 0 || isLayerIncomplete(l03)) {
    const targetFiles =
      inventory.orphan_source_files.length > 0
        ? inventory.orphan_source_files.slice(0, 5).map((o) => o.expected_unit_test)
        : ['tests/core.unit.py', 'src/core.unit.ts'];
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_CRITICAL,
      layer_number: 3,
      title: 'Completar pruebas unitarias aisladas (>= 95% cobertura)',
      action:
        'Crear pruebas unitarias para archivos huérfanos y exigir umbral --cov-fail-under=95 / coverage.thresholds>=95 aislando red con mocks.',
      target_files_to_create: targetFiles,
      verification_command: MAKE_QA_UNIT,
    });
  }

  const l06 = layers.find((l) => l.layer_id === 'L06_BDD_API_KARATE');
  if (inventory.untested_api_endpoints.length > 0 || isLayerIncomplete(l06)) {
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
  if (isLayerIncomplete(l04)) {
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
  const l02 = layers.find((l) => l.layer_id === 'L02_STRICT_TYPING_COMPLEXITY');
  if (l02 && (l02.status === STATUS_MISSING || l02.status === STATUS_PARTIAL)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 2,
      title: 'Configurar tipado estricto y complejidad ciclomática Grado A (CC <= 5)',
      action:
        'Activar mypy --strict / tsc --strict / PHPStan Max junto con compuerta de complejidad (radon/C901/sonarjs) sin bypasses.',
      target_files_to_create: [PYPROJECT_TOML, 'tsconfig.json'],
      verification_command: 'make qa-lint',
    });
  }

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

  const l07 = layers.find((l) => l.layer_id === 'L07_BDD_UI_KARATE_REFRESH');
  if (inventory.untested_ui_views.length > 0 || isLayerIncomplete(l07)) {
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_HIGH,
      layer_number: 7,
      title: 'Crear escenarios BDD en Karate UI para vistas sin cobertura',
      action:
        `Escribir escenarios BDD en test/${UI_BUSINESS_FLOW_FEATURE} cubriendo las vistas huérfanas, 404 en /assets/* y refresco dual.`,
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

const MEDIUM_ACTION_SPECS = [
  {
    layerId: 'L05_CONTRACT_FUZZING_OPENAPI',
    layerNumber: 5,
    title: 'Configurar pruebas de contrato y paridad OpenAPI',
    action: `Implementar suite de contratos de integración y validador de paridad front-back ${VERIFY_NO_ORPHAN_API}.`,
    targetFiles: [`.agents/scripts/${VERIFY_NO_ORPHAN_API}`],
    cmd: MAKE_QA_CONTRACTS,
  },
  {
    layerId: 'L10_PERF_LOAD_STRESS',
    layerNumber: 10,
    title: 'Configurar pruebas de rendimiento y carga (Locust / Artillery)',
    action: `Crear escenario de carga en test/${LOCUSTFILE_PY} o test/load-test.yml y añadir servicio a ${DOCKER_COMPOSE_QA}.`,
    targetFiles: [`test/${LOCUSTFILE_PY}`],
    cmd: MAKE_QA_PERF,
  },
  {
    layerId: 'L11_DAST_OWASP_ZAP_OSHP',
    layerNumber: 11,
    title: 'Configurar escaneo DAST dinámico con OWASP ZAP',
    action: `Añadir servicio zaproxy/zap-stable en ${DOCKER_COMPOSE_QA} y verificar cabeceras OSHP.`,
    targetFiles: [DOCKER_COMPOSE_QA],
    cmd: MAKE_QA_DAST,
  },
  {
    layerId: 'L12_CHAOS_RED_OBSERVABILITY',
    layerNumber: 12,
    title: 'Instrumentar telemetría RED y perfiles de caos Pumba',
    action: `Exponer métricas Prometheus /metrics y configurar inyección de fallos de red con Pumba en ${DOCKER_COMPOSE_QA}.`,
    targetFiles: [DOCKER_COMPOSE_QA],
    cmd: MAKE_QA_CHAOS,
  },
  {
    layerId: 'L13_TRIMODAL_FIXTURES_NEGATIVE',
    layerNumber: 13,
    title: 'Incorporar fixtures trimodales e invariantes negativos',
    action:
      'Crear fixtures para estados virgen, nominal y degradado, además de test de blindaje sin dependencias dev.',
    targetFiles: ['tests/fixtures/trimodal_fixtures.py'],
    cmd: MAKE_QA_UNIT,
  },
] as const;

function addMediumActions(
  plan: PrioritizedTestAction[],
  layers: PyramidLayerAudit[]
): void {
  for (const spec of MEDIUM_ACTION_SPECS) {
    const layer = layers.find((l) => l.layer_id === spec.layerId);
    if (layer && (layer.status === STATUS_MISSING || layer.status === STATUS_PARTIAL)) {
      plan.push({
        step: plan.length + 1,
        priority: PRIORITY_MEDIUM,
        layer_number: spec.layerNumber,
        title: spec.title,
        action: spec.action,
        target_files_to_create: [...spec.targetFiles],
        verification_command: spec.cmd,
      });
    }
  }
}

interface MetaGateActionSpec {
  readonly gateId: string;
  readonly priority: typeof PRIORITY_HIGH;
  readonly title: string;
  readonly targets: readonly string[];
  readonly cmd: string;
}

const META_GATE_ACTION_SPECS: readonly MetaGateActionSpec[] = [
  {
    gateId: 'graphify_ast',
    priority: PRIORITY_HIGH,
    title: 'Construir grafo AST Graphify y habilitar verificación topológica',
    targets: ['graphify-out/graph.json', 'scripts/actualizar-grafos-graphify.sh'],
    cmd: './scripts/actualizar-grafos-graphify.sh',
  },
  {
    gateId: 'thin_repo_governance',
    priority: PRIORITY_HIGH,
    title: 'Completar gobernanza Thin-Repo (AGENTS.md, .qa-11x.json, .gitignore)',
    targets: ['AGENTS.md', '.qa-11x.json', '.gitignore'],
    cmd: 'npx -y @sinfallas/mcp-qa-11x@latest init-agents --agents auto',
  },
  {
    gateId: 'ci_hooks_automation',
    priority: PRIORITY_MEDIUM,
    title: 'Configurar hooks locales (lefthook.yml) y CI proporcional de PR',
    targets: ['lefthook.yml', '.github/workflows/qa-11x-pr.yml'],
    cmd: 'npx -y @sinfallas/mcp-qa-11x@latest quickstart',
  },
  {
    gateId: 'calm_architecture',
    priority: PRIORITY_MEDIUM,
    title: 'Declarar y validar arquitectura FINOS CALM (7 controles 11X)',
    targets: ['architecture/qa-11x.calm.json'],
    cmd: 'make validate-calm',
  },
];

const SPECIALIZED_STACK_ACTIONS: Readonly<
  Record<string, { readonly title: string; readonly action: string; readonly targets: readonly string[]; readonly cmd: string }>
> = {
  'ai-evals': {
    title: 'Ejecutar evaluaciones Dual-Mode LLM/RAG y Red-Teaming OWASP LLM Top 10',
    action:
      'Ejecutar evaluate_agent_trajectory (contratos deterministas offline) y run_llm_red_team (Promptfoo OWASP LLM Top 10).',
    targets: ['ai-evals/', 'promptfooconfig.yaml'],
    cmd: 'make test-ai-offline',
  },
  'mobile-appium': {
    title: 'Certificar suite móvil Screenplay Appium 3 / WebdriverIO en Docker efímero',
    action:
      'Ejecutar la matriz móvil con MobileActor en sinfallas/base-mobile-appium:26 (sin depender de emuladores locales en CI).',
    targets: ['mobile-appium/wdio.conf.ts'],
    cmd: 'make qa-mobile',
  },
  'vibe-rescue': {
    title: 'Ejecutar rescate Vibe-to-Enterprise (RLS, WORM, CC <= 5, >= 95% cov)',
    action:
      'Invocar audit_vibe_prototype para detectar VIBE-SEC-001..QA-005 e inyectar plantillas de endurecimiento RLS/Docker.',
    targets: ['vibe-rescue/templates/rls_hardening.sql'],
    cmd: 'npx -y @sinfallas/mcp-qa-11x@latest audit --mode vibe',
  },
};

function addMetaGateAndSpecializedActions(
  plan: PrioritizedTestAction[],
  metaGates: readonly TestPyramidMetaGateAudit[] | undefined,
  detectedStacks: readonly StackName[] | undefined
): void {
  if (metaGates) {
    for (const spec of META_GATE_ACTION_SPECS) {
      const gate = metaGates.find((g) => g.gate_id === spec.gateId);
      if (!gate || gate.status === 'PRESENT') {
        continue;
      }
      if (!gate.required_for_tier && spec.gateId === 'calm_architecture') {
        continue;
      }
      plan.push({
        step: plan.length + 1,
        priority: spec.priority,
        layer_number: 0,
        title: spec.title,
        action: gate.remediation,
        target_files_to_create: [...spec.targets],
        verification_command: spec.cmd,
      });
    }
  }
  for (const stack of detectedStacks ?? []) {
    const spec = Object.hasOwn(SPECIALIZED_STACK_ACTIONS, stack)
      ? SPECIALIZED_STACK_ACTIONS[stack]
      : undefined;
    if (!spec) {
      continue;
    }
    plan.push({
      step: plan.length + 1,
      priority: PRIORITY_MEDIUM,
      layer_number: 0,
      title: spec.title,
      action: spec.action,
      target_files_to_create: [...spec.targets],
      verification_command: spec.cmd,
    });
  }
}

export function buildPrioritizedActionPlan(
  layers: PyramidLayerAudit[],
  inventory: MissingTestInventory,
  metaGates?: readonly TestPyramidMetaGateAudit[],
  detectedStacks?: readonly StackName[]
): PrioritizedTestAction[] {
  const plan: PrioritizedTestAction[] = [];
  addCriticalActions(plan, layers, inventory);
  addHighActions(plan, layers, inventory);
  addMediumActions(plan, layers);
  addMetaGateAndSpecializedActions(plan, metaGates, detectedStacks);
  return plan;
}

