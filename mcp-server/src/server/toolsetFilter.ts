// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readQa11xConfig, TIER_ENTERPRISE } from '../services/qa11xConfig.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

export type ToolsetMode = 'core' | 'auto' | 'full';

export const CORE_TOOLSET_NAMES: ReadonlySet<string> = new Set([
  'inspect_project_config',
  'fetch_blueprint_bundle',
  'audit_test_pyramid_gaps',
  'inspect_ast_blast_radius',
  'bootstrap_or_merge_11x',
  'audit_security_stig_owasp',
  'run_ephemeral_qa',
  'certify_11x_gate',
  'clean_workspace_11x',
  'init_or_append_agents_md',
  'reconcile_agents_governance',
  'propose_skill_evolution_pr',
  'session_flight_recorder',
]);

const VALID_TOOLSET_MODES = new Set<string>(['core', 'auto', 'full']);

/** Validates and normalizes --toolset / QA_11X_TOOLSET mode (defaults to 'full'). */
export function parseToolsetMode(raw?: string): ToolsetMode {
  const normalized = (raw ?? process.env.QA_11X_TOOLSET ?? 'full').trim().toLowerCase();
  if (!normalized) {
    return 'full';
  }
  if (!VALID_TOOLSET_MODES.has(normalized)) {
    throw new Error(
      `Modo --toolset inválido: '${raw}'. Valores permitidos: core | auto | full.`
    );
  }
  return normalized as ToolsetMode;
}

function safeReadPkgText(projectDir: string): string {
  try {
    const pkgPath = path.join(projectDir, 'package.json');
    return fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf8') : '';
  } catch (err: unknown) {
    reportDebugCatchError('toolsetFilter.safeReadPkgText', err);
    return '';
  }
}

function safeReadPyprojectText(projectDir: string): string {
  try {
    const pyPath = path.join(projectDir, 'pyproject.toml');
    return fs.existsSync(pyPath) ? fs.readFileSync(pyPath, 'utf8') : '';
  } catch (err: unknown) {
    reportDebugCatchError('toolsetFilter.safeReadPyprojectText', err);
    return '';
  }
}

function hasAnyWorkspacePath(projectDir: string, relPaths: readonly string[]): boolean {
  return relPaths.some((relPath) => fs.existsSync(path.join(projectDir, relPath)));
}

function detectAutoExtensionTools(projectDir: string): string[] {
  const extra: string[] = [];
  const pkgText = safeReadPkgText(projectDir);
  const pyText = safeReadPyprojectText(projectDir);
  const loadedCfg = readQa11xConfig(projectDir);

  if (hasAnyWorkspacePath(projectDir, ['.bolt', '.lovable']) || pkgText.includes('lovable-tagger')) {
    extra.push('audit_vibe_prototype');
  }
  if (
    fs.existsSync(path.join(projectDir, 'architecture')) ||
    loadedCfg.effectiveTier === TIER_ENTERPRISE
  ) {
    extra.push('validate_calm_architecture');
  }
  if (
    hasAnyWorkspacePath(projectDir, ['ai-evals', 'promptfooconfig.yaml']) ||
    pkgText.includes('promptfoo') ||
    pyText.includes('deepeval')
  ) {
    extra.push('evaluate_agent_trajectory', 'run_llm_red_team');
  }
  if (loadedCfg.exists) {
    extra.push('evaluate_release_gate', 'sync_enterprise_tms');
  }
  return extra;
}

/**
 * Computes the allowed MCP tool names for the given toolset mode.
 * Returns null when mode === 'full' so all 19 tools are registered unchanged.
 */
export function resolveAllowedToolNames(
  mode: ToolsetMode = 'full',
  projectPath: string = process.cwd()
): ReadonlySet<string> | null {
  if (mode === 'full') {
    return null;
  }
  const allowed = new Set<string>(CORE_TOOLSET_NAMES);
  if (mode === 'auto') {
    for (const toolName of detectAutoExtensionTools(projectPath)) {
      allowed.add(toolName);
    }
  }
  return allowed;
}
