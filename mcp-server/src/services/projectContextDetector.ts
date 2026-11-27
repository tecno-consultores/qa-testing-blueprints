// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StandardTier } from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { TIER_ENTERPRISE, type LoadedQa11xConfig } from './qa11xConfig.js';

const ARCH_DIR_NAME = 'architecture';
const CANONICAL_QA11X_CALM = 'qa-11x.calm.json';
const GENERIC_CALM_JSON = 'calm.json';

/**
 * Single source of truth detecting the upstream `qa-testing-blueprints` source repository.
 */
export function isUpstreamBlueprintsRepo(projectPath: string): boolean {
  const hasManifest = fs.existsSync(path.join(projectPath, 'manifest.json'));
  if (!hasManifest) {
    return false;
  }
  return (
    fs.existsSync(path.join(projectPath, 'scripts', 'generar-manifiesto.py')) ||
    fs.existsSync(path.join(projectPath, '.agents', 'scripts', 'sync_governance.py'))
  );
}

/**
 * Uniform tier resolution across readiness, pyramid auditing, doctor, toolsets, and certify_11x_gate:
 * promotes the upstream blueprints repository to `enterprise` when no explicit `.qa-11x.json` exists.
 */
export function resolveEffectiveQa11xTier(
  projectPath: string,
  loadedConfig: LoadedQa11xConfig
): StandardTier {
  if (!loadedConfig.exists && isUpstreamBlueprintsRepo(projectPath)) {
    return TIER_ENTERPRISE;
  }
  return loadedConfig.effectiveTier;
}

/**
 * Finds the first FINOS CALM architecture manifest inside `architecture/`,
 * honoring `qa-11x.calm.json`, `calm.json`, and any `*.calm.json`.
 */
export function findFirstCalmArchitectureRelPath(projectPath: string): string | null {
  const archDir = path.join(projectPath, ARCH_DIR_NAME);
  if (!fs.existsSync(archDir)) {
    return null;
  }
  if (fs.existsSync(path.join(archDir, CANONICAL_QA11X_CALM))) {
    return `${ARCH_DIR_NAME}/${CANONICAL_QA11X_CALM}`;
  }
  if (fs.existsSync(path.join(archDir, GENERIC_CALM_JSON))) {
    return `${ARCH_DIR_NAME}/${GENERIC_CALM_JSON}`;
  }
  try {
    const match = fs
      .readdirSync(archDir)
      .filter((name) => name.endsWith('.calm.json'))
      .sort((a, b) => a.localeCompare(b))[0];
    return match ? `${ARCH_DIR_NAME}/${match}` : null;
  } catch (err: unknown) {
    reportDebugCatchError('projectContextDetector.findFirstCalmArchitectureRelPath', err);
    return null;
  }
}
