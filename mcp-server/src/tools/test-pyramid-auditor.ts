// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import type { MissingTestInventory, PyramidLayerAudit, StackName, TestPyramidGapResult } from '../types.js';
import { collectProjectFiles, inspectProjectConfig } from './inspect-project.js';
import {
  checkOperationalViewsDualRefresh, evaluateLayer06BddApiKarate, evaluateLayer07BddUiKarate,
  evaluateLayer08Mutation, evaluateLayer09A11yLighthouse, evaluateLayer10PerfLoad,
  evaluateLayer11DastZap, evaluateLayer12ChaosRed,
} from './test-pyramid/bddAndQualityLayers.js';
import {
  findOrphanSourceFiles, findUntestedApiEndpoints, findUntestedUiViews,
} from './test-pyramid/inventory.js';
import { STATUS_COVERED, STATUS_MISSING, STATUS_NOT_APPLICABLE, STATUS_PARTIAL } from './test-pyramid/shared.js';
import {
  evaluateLayer01StaticSast, evaluateLayer02StrictTyping, evaluateLayer03UnitIsolated,
  evaluateLayer04OrmParity, evaluateLayer05ContractFuzzing,
} from './test-pyramid/staticAndUnitLayers.js';
import {
  buildPrioritizedActionPlan, detectThreePhaseTemporalTests,
  evaluateLayer13TrimodalFixtures, projectHasTemporalEntities,
} from './test-pyramid/temporalAndPlan.js';

export {
  buildPrioritizedActionPlan, checkOperationalViewsDualRefresh, collectProjectFiles,
  detectThreePhaseTemporalTests, evaluateLayer01StaticSast, evaluateLayer02StrictTyping,
  evaluateLayer03UnitIsolated, evaluateLayer04OrmParity, evaluateLayer05ContractFuzzing,
  evaluateLayer06BddApiKarate, evaluateLayer07BddUiKarate, evaluateLayer08Mutation,
  evaluateLayer09A11yLighthouse, evaluateLayer10PerfLoad, evaluateLayer11DastZap,
  evaluateLayer12ChaosRed, evaluateLayer13TrimodalFixtures, findOrphanSourceFiles,
  findUntestedApiEndpoints, findUntestedUiViews, projectHasTemporalEntities,
};

// ============================================================================
// 🚀 Orquestador Principal: auditTestPyramidGaps
// ============================================================================

export async function auditTestPyramidGaps(
  projectPathInput: string,
  stackFilter?: StackName,
  maxItems?: number
): Promise<TestPyramidGapResult> {
  const resolvedPath = resolveSafeProjectPath(projectPathInput);

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
