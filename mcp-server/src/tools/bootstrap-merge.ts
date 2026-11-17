// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { SurgicalMerger } from '../services/surgical-merger.js';
import { mergeOrAppendAgentsMdContent } from '../cli/init-agents-md.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { BootstrapMergeResult } from '../types.js';

interface AgentsConnectorInjectionInput {
  readonly resolvedPath: string;
  readonly stack: string;
  readonly dryRun: boolean;
  readonly createBackup: boolean;
  readonly result: Awaited<ReturnType<SurgicalMerger['mergeFiles']>>;
}

function injectAgentsConnectorIfMissingFromBundle(input: AgentsConnectorInjectionInput): void {
  const { resolvedPath, stack, dryRun, createBackup, result } = input;
  const agentsPath = path.join(resolvedPath, 'AGENTS.md');
  const hadAgentsFile = fs.existsSync(agentsPath);
  const existingAgents = hadAgentsFile ? fs.readFileSync(agentsPath, 'utf-8') : '';
  const projectName = path.basename(resolvedPath) || 'Project';
  const agentsRes = mergeOrAppendAgentsMdContent(existingAgents, projectName, [stack]);

  if (agentsRes.finalContent === existingAgents) {
    return;
  }

  if (!dryRun) {
    fs.mkdirSync(resolvedPath, { recursive: true });
    if (createBackup && hadAgentsFile) {
      fs.copyFileSync(agentsPath, `${agentsPath}.11x-backup`);
    }
    fs.writeFileSync(agentsPath, agentsRes.finalContent, 'utf-8');
  }

  const existingStatus = hadAgentsFile ? 'merged' : 'created';
  result.summary.total_files += 1;
  result.summary[existingStatus] += 1;
  result.applied_changes.push({
    file: 'AGENTS.md',
    strategy: 'merge_agents_md',
    status: dryRun ? 'dry_run' : existingStatus,
    changes: agentsRes.changes,
  });
}

export interface BootstrapMergeDeps {
  readonly fetcher?: GitHubFetcher;
  readonly merger?: SurgicalMerger;
  readonly createBackup?: boolean;
}

export async function bootstrapOrMerge11x(
  projectPathInput: string,
  stack: string,
  dryRun = true,
  deps: BootstrapMergeDeps = {}
): Promise<BootstrapMergeResult> {
  const { fetcher, merger, createBackup = true } = deps;
  const resolvedPath = resolveSafeProjectPath(projectPathInput);
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const resolvedMerger = merger || new SurgicalMerger();

  // Thin-Repo por defecto: obtiene plantillas del stack + scripts/validadores comunes sin duplicar reglas ni skills locales
  const bundle = await resolvedFetcher.fetchStackBundle(stack, true, true);

  // Ejecutar la fusión quirúrgica no destructiva
  const result = await resolvedMerger.mergeFiles(resolvedPath, bundle, { dryRun, createBackup });

  if (!bundle.some((b) => path.basename(b.target_name) === 'AGENTS.md')) {
    injectAgentsConnectorIfMissingFromBundle({ resolvedPath, stack, dryRun, createBackup, result });
  }

  return {
    project_path: result.project_path,
    stack,
    dry_run: result.dry_run,
    summary: result.summary,
    applied_changes: result.applied_changes,
  };
}
