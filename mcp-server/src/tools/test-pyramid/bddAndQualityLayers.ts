// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type {
  PyramidLayerAudit,
  PyramidLayerStatus,
  StackName,
  UntestedApiEndpoint,
  UntestedUiView,
} from '../../types.js';
import {
  ACCESSIBILITY_E2E,
  ALL_STACKS,
  API_TEST_FEATURE,
  BACKEND_STACKS,
  BP_FASTAPI_DOCKER_COMPOSE,
  BP_FASTAPI_PYPROJECT,
  BP_FASTAPI_TEST_PROD,
  BP_VUE3_STRYKER,
  CODE_STACKS,
  COMPOSER_JSON,
  DOCKER_COMPOSE_QA,
  FRONTEND_STACKS,
  LIGHTHOUSERC_JS,
  LIGHTHOUSERC_LEGACY_JS,
  LOCUSTFILE_PY,
  MAKEFILE_NAME,
  MAKE_QA_BDD,
  MAKE_QA_CHAOS,
  MAKE_QA_DAST,
  MAKE_QA_E2E,
  MAKE_QA_MUTATION,
  MAKE_QA_PERF,
  PACKAGE_JSON,
  PYPROJECT_TOML,
  STATUS_COVERED,
  STATUS_MISSING,
  STATUS_NOT_APPLICABLE,
  STATUS_PARTIAL,
  UI_BUSINESS_FLOW_FEATURE,
  isDocLikeFile,
  readFileContentSafe,
  readMergedConfigFiles,
} from './shared.js';

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
  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
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
      BP_FASTAPI_TEST_PROD,
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

export interface LayerAugmentContext {
  readonly projectPath: string;
  readonly files: string[];
  readonly currentStatus: PyramidLayerStatus;
  readonly detected: string[];
  readonly missingReqs: string[];
}

function applyDualRefreshToLayer07(ctx: LayerAugmentContext): PyramidLayerStatus {
  const { projectPath, files, currentStatus, detected, missingReqs } = ctx;
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

  status = applyDualRefreshToLayer07({
    projectPath,
    files,
    currentStatus: status,
    detected,
    missingReqs,
  });

  return {
    layer_number: 7,
    layer_id: 'L07_BDD_UI_KARATE',
    layer_name: 'Pruebas BDD de Flujos de Negocio en UI (Karate Labs UI)',
    status,
    applicable_stacks: applicable,
    detected_evidence: detected,
    missing_requirements: missingReqs,
    recommended_blueprint_files: [`vue3/test/${UI_BUSINESS_FLOW_FEATURE}`],
    make_target: MAKE_QA_BDD,
  };
}

function detectMutationCapabilities(
  projectPath: string,
  files: string[]
): { hasTool: boolean; hasTarget: boolean; detected: string[] } {
  const pyproject = readMergedConfigFiles(projectPath, files, [PYPROJECT_TOML]);
  const pkgJson = readMergedConfigFiles(projectPath, files, [PACKAGE_JSON]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);
  const composer = readMergedConfigFiles(projectPath, files, [COMPOSER_JSON]);

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
  const hasLighthouserc = files.some(
    (f) => f.includes(LIGHTHOUSERC_JS) || f.includes(LIGHTHOUSERC_LEGACY_JS) || f.includes('lighthouserc.json')
  );
  const pkgJson = readMergedConfigFiles(projectPath, files, [PACKAGE_JSON]);
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
      `vue3/e2e/${ACCESSIBILITY_E2E}`,
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
  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);

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
    recommended_blueprint_files: [`fastapi/${LOCUSTFILE_PY}.example`],
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

  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);

  const hasZap = dockerCompose.includes('zap') || dockerCompose.includes('zaproxy');
  const hasMakeTarget = makefile.includes('qa-dast');
  const hasOshpEvidence = files.some(
    (f) =>
      !isDocLikeFile(f) &&
      (f.includes('security') ||
        readFileContentSafe(projectPath, f).includes('Content-Security-Policy'))
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
    if (isDocLikeFile(f)) return false;
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

  const dockerCompose = readMergedConfigFiles(projectPath, files, [DOCKER_COMPOSE_QA]);
  const makefile = readMergedConfigFiles(projectPath, files, [MAKEFILE_NAME]);

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

