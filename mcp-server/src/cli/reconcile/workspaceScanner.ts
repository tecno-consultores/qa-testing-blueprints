// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReconcileAgentsResult } from '../../types.js';
import { isGitWorktreeDirty } from './repoHygiene.js';

const SKIP_SCAN_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', 'dist', 'vendor']);
const MAX_SCAN_DEPTH = 3;

export type WorkspaceEntryStatus = 'RECONCILED' | 'DRY_RUN' | 'DIRTY_SKIPPED' | 'UPSTREAM_SKIPPED';

export interface WorkspaceScanEntry {
  readonly repo: string;
  readonly path: string;
  readonly status: WorkspaceEntryStatus;
  readonly removed_count: number;
  readonly preserved_count: number;
  readonly bridges_count: number;
  readonly consolidated_count: number;
  readonly gitignore_added_count: number;
  readonly hybrid_review_count: number;
  readonly advisories_count: number;
}

export interface WorkspaceScanReport {
  readonly root_dir: string;
  readonly dry_run: boolean;
  readonly scanned_count: number;
  readonly entries: readonly WorkspaceScanEntry[];
}

export interface WorkspaceScanDeps {
  readonly isUpstreamRepo: (repoPath: string) => boolean;
  readonly reconcileRepo: (opts: {
    projectPath: string;
    dryRun?: boolean;
    pruneBridges?: boolean;
  }) => Promise<ReconcileAgentsResult>;
}

export interface WorkspaceScanOptions {
  readonly rootDir: string;
  readonly apply: boolean;
  readonly allowDirty: boolean;
  readonly pruneBridges: boolean;
  readonly json: boolean;
  readonly log: (message: string) => void;
  readonly deps: WorkspaceScanDeps;
}

function hasQaGovernanceMarkers(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.agents')) || fs.existsSync(path.join(dirPath, 'AGENTS.md'));
}

function shouldSkipDirent(dirent: fs.Dirent): boolean {
  return dirent.isSymbolicLink() || !dirent.isDirectory() || SKIP_SCAN_DIRS.has(dirent.name);
}

function collectGovernanceRepos(currentDir: string, depth: number, found: string[]): void {
  if (depth > MAX_SCAN_DEPTH) return;
  if (hasQaGovernanceMarkers(currentDir)) found.push(currentDir);
  if (fs.existsSync(path.join(currentDir, '.git')) && depth > 0) return;

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of dirents) {
    if (!shouldSkipDirent(dirent)) {
      collectGovernanceRepos(path.join(currentDir, dirent.name), depth + 1, found);
    }
  }
}

function mapResultToScanEntry(
  rootDir: string,
  repoPath: string,
  dryRun: boolean,
  res: ReconcileAgentsResult
): WorkspaceScanEntry {
  const hybridCount = res.reconciled_items.filter(
    (item) => item.classification === 'HYBRID_SECTION_REVIEW_RECOMMENDED'
  ).length;
  return {
    repo: path.relative(rootDir, repoPath) || path.basename(repoPath),
    path: repoPath,
    status: dryRun ? 'DRY_RUN' : 'RECONCILED',
    removed_count: res.removed_duplicate_sections_count,
    preserved_count: res.preserved_domain_sections_count,
    bridges_count: res.bridges_processed?.length ?? 0,
    consolidated_count: res.consolidated_backups?.length ?? 0,
    gitignore_added_count: res.gitignore_entries_added?.length ?? 0,
    hybrid_review_count: hybridCount,
    advisories_count: res.advisories?.length ?? 0,
  };
}

function createSkippedScanEntry(
  rootDir: string,
  repoPath: string,
  status: 'UPSTREAM_SKIPPED' | 'DIRTY_SKIPPED'
): WorkspaceScanEntry {
  return {
    repo: path.relative(rootDir, repoPath) || path.basename(repoPath),
    path: repoPath,
    status,
    removed_count: 0,
    preserved_count: 0,
    bridges_count: 0,
    consolidated_count: 0,
    gitignore_added_count: 0,
    hybrid_review_count: 0,
    advisories_count: 0,
  };
}

function formatWorkspaceScanTable(report: WorkspaceScanReport): string {
  const mode = report.dry_run ? 'DRY-RUN' : 'APPLIED';
  const lines = [
    `🔍 [QA-11X Scan Workspaces | ${mode}] root=${report.root_dir} repos=${report.scanned_count}`,
    '| Repo | Status | Pruned | Preserved | Bridges | Backups | Gitignore | Hybrid | Advisories |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const e of report.entries) {
    lines.push(
      `| ${e.repo} | ${e.status} | ${e.removed_count} | ${e.preserved_count} | ${e.bridges_count} | ${e.consolidated_count} | ${e.gitignore_added_count} | ${e.hybrid_review_count} | ${e.advisories_count} |`
    );
  }
  return lines.join('\n');
}

export async function scanWorkspacesForReconcile(
  options: WorkspaceScanOptions
): Promise<WorkspaceScanReport> {
  const resolvedRoot = path.resolve(options.rootDir);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Directorio raíz de workspaces inválido: ${resolvedRoot}`);
  }
  const dryRun = !options.apply;
  const repoPaths: string[] = [];
  collectGovernanceRepos(resolvedRoot, 0, repoPaths);
  repoPaths.sort((a, b) => a.localeCompare(b));

  const entries: WorkspaceScanEntry[] = [];
  for (const repoPath of repoPaths) {
    if (options.deps.isUpstreamRepo(repoPath)) {
      entries.push(createSkippedScanEntry(resolvedRoot, repoPath, 'UPSTREAM_SKIPPED'));
      continue;
    }
    if (options.apply && !options.allowDirty && isGitWorktreeDirty(repoPath)) {
      entries.push(createSkippedScanEntry(resolvedRoot, repoPath, 'DIRTY_SKIPPED'));
      continue;
    }
    const res = await options.deps.reconcileRepo({
      projectPath: repoPath,
      dryRun,
      pruneBridges: options.pruneBridges,
    });
    entries.push(mapResultToScanEntry(resolvedRoot, repoPath, dryRun, res));
  }

  const report: WorkspaceScanReport = {
    root_dir: resolvedRoot,
    dry_run: dryRun,
    scanned_count: entries.length,
    entries,
  };
  options.log(options.json ? JSON.stringify(report, null, 2) : formatWorkspaceScanTable(report));
  return report;
}
