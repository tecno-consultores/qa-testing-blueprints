// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GapPriority, PyramidLayerStatus, StackName } from '../../types.js';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';

// ============================================================================
// 🔒 Constantes para Prevención de sonarjs/no-duplicate-string
// ============================================================================

export const MAKE_QA_UNIT = 'make qa-unit';
export const MAKE_QA_LINT = 'make qa-lint';
export const MAKE_QA_PARITY = 'make qa-parity';
export const MAKE_QA_CONTRACTS = 'make qa-contracts';
export const MAKE_QA_BDD = 'make qa-bdd';
export const MAKE_QA_E2E = 'make qa-e2e';
export const MAKE_QA_MUTATION = 'make qa-mutation';
export const MAKE_QA_PERF = 'make qa-perf';
export const MAKE_QA_DAST = 'make qa-dast';
export const MAKE_QA_CHAOS = 'make qa-chaos';

export const DOCKER_COMPOSE_QA = 'docker-compose.qa.yml';
export const PYPROJECT_TOML = 'pyproject.toml';
export const PACKAGE_JSON = 'package.json';
export const MAKEFILE_NAME = 'Makefile';
export const API_TEST_FEATURE = 'api_test.feature';
export const UI_BUSINESS_FLOW_FEATURE = 'ui_business_flow.feature';
export const ACCESSIBILITY_E2E = 'accessibility.e2e.ts';
export const LIGHTHOUSERC_JS = 'lighthouserc.cjs';
export const LIGHTHOUSERC_LEGACY_JS = 'lighthouserc.js';
export const LOCUSTFILE_PY = 'locustfile.py';
export const AUDITAR_INFRA_SH = 'auditar-infra.sh';
export const VERIFICAR_SECRETOS_SH = 'verificar-secretos.sh';
export const VERIFY_ALEMBIC_ORM_PARITY = 'verify_alembic_orm_parity.py';
export const VERIFY_NO_ORPHAN_API = 'verify_no_orphan_api_endpoints.py';

export const BP_FASTAPI_PYPROJECT = 'fastapi/pyproject.toml.example';
export const BP_VUE3_TSCONFIG = 'vue3/tsconfig.json.example';
export const BP_VUE3_VITEST = 'vue3/vitest.config.ts.example';
export const BP_VUE3_STRYKER = 'vue3/stryker.conf.json.example';
export const BP_FASTAPI_DOCKER_COMPOSE = 'fastapi/docker-compose.qa.yml';
export const BP_FASTAPI_TEST_PROD = 'fastapi/test/api_test.feature';

export const STATUS_COVERED: PyramidLayerStatus = 'COVERED';
export const STATUS_PARTIAL: PyramidLayerStatus = 'PARTIAL';
export const STATUS_MISSING: PyramidLayerStatus = 'MISSING';
export const STATUS_NOT_APPLICABLE: PyramidLayerStatus = 'NOT_APPLICABLE';

export const PRIORITY_CRITICAL: GapPriority = 'CRITICAL';
export const PRIORITY_HIGH: GapPriority = 'HIGH';
export const PRIORITY_MEDIUM: GapPriority = 'MEDIUM';

export const STACK_FASTAPI: StackName = 'fastapi';
export const STACK_PYTHON: StackName = 'python';
export const STACK_NODE_BACKEND: StackName = 'node-backend';
export const STACK_VUE3: StackName = 'vue3';
export const STACK_REACT_FRONTEND: StackName = 'react-frontend';
export const STACK_BASH_SCRIPTS: StackName = 'bash-scripts';
export const STACK_PHP: StackName = 'php';
export const STACK_MOBILE_APPIUM: StackName = 'mobile-appium';
export const STACK_AI_EVALS: StackName = 'ai-evals';
export const STACK_VIBE_RESCUE: StackName = 'vibe-rescue';

export const COMPOSER_JSON = 'composer.json';
export const PHPSTAN_NEON = 'phpstan.neon';

export const ALL_STACKS: StackName[] = [
  STACK_PYTHON,
  STACK_FASTAPI,
  STACK_NODE_BACKEND,
  STACK_VUE3,
  STACK_REACT_FRONTEND,
  STACK_BASH_SCRIPTS,
  STACK_PHP,
  STACK_MOBILE_APPIUM,
  STACK_AI_EVALS,
  STACK_VIBE_RESCUE,
];

export const CODE_STACKS: StackName[] = [
  STACK_PYTHON,
  STACK_FASTAPI,
  STACK_NODE_BACKEND,
  STACK_VUE3,
  STACK_REACT_FRONTEND,
  STACK_PHP,
  STACK_MOBILE_APPIUM,
  STACK_AI_EVALS,
  STACK_VIBE_RESCUE,
];

export const BACKEND_STACKS: StackName[] = [STACK_FASTAPI, STACK_NODE_BACKEND, STACK_PHP];
export const FRONTEND_STACKS: StackName[] = [STACK_VUE3, STACK_REACT_FRONTEND];

export function readFileContentSafe(projectPath: string, relativePath: string): string {
  try {
    const fullPath = path.join(projectPath, relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch (err: unknown) {
    // Missing/unreadable optional audit target file defaults safely to empty source string
    reportDebugCatchError(`testPyramidAuditor.readFileContentSafe(${relativePath})`, err);
  }
  return '';
}

export const DOC_FILE_EXT_RE = /\.(?:md|mdx|rst|txt)$/i;

export function isDocLikeFile(file: string): boolean {
  return DOC_FILE_EXT_RE.test(file);
}

export function readMergedConfigFiles(
  projectPath: string,
  files: readonly string[],
  targetNames: readonly string[]
): string {
  const matched = files.filter((f) => targetNames.includes(path.basename(f)));
  const chunks: string[] = [];
  for (const rel of matched) {
    const content = readFileContentSafe(projectPath, rel);
    if (content) chunks.push(content);
  }
  if (chunks.length === 0) {
    for (const name of targetNames) {
      const direct = readFileContentSafe(projectPath, name);
      if (direct) chunks.push(direct);
    }
  }
  return chunks.join('\n');
}

