// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { SurgicalMerger } from '../services/surgical-merger.js';
import { BootstrapMergeResult } from '../types.js';

export async function bootstrapOrMerge11x(
  projectPathInput: string,
  stack: string,
  dryRun = false,
  fetcher?: GitHubFetcher,
  merger?: SurgicalMerger
): Promise<BootstrapMergeResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const resolvedMerger = merger || new SurgicalMerger();

  // Obtener bundle completo del stack seleccionado incluyendo common y agents
  const bundle = await resolvedFetcher.fetchStackBundle(stack, true);

  // Ejecutar la fusión quirúrgica no destructiva
  const result = await resolvedMerger.mergeFiles(resolvedPath, bundle, { dryRun });

  return {
    project_path: result.project_path,
    stack,
    dry_run: result.dry_run,
    summary: result.summary,
    applied_changes: result.applied_changes,
  };
}
