// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CleanWorkspaceResult } from '../types.js';

const CANDIDATE_DIR_NAMES = [
  '.coverage',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.uv',
  'htmlcov',
  'mutants',
  '.mutmut-cache',
  'target',
  '.trivycache',
  'dist',
  'dist-ssr',
  '.vite',
  '.vite-ssg-temp',
  'coverage',
  '.stryker-tmp',
  'test-results',
  'playwright-report',
  'blob-report',
  '.lighthouseci',
  'lhci-reports',
  '.lhcache',
  '.eslintcache',
  '.stylelintcache',
  '.pnpm-store',
];

const DEEP_PRUNE_DIR_NAMES = ['reports', 'prometheus_data'];

const CANDIDATE_FILE_PATTERNS = [
  'karate.jar',
  'zap-report.html',
  'zap.yaml',
  'chaos-report.html',
  'chaos-report.json',
  'profile.svg',
];

const SCAN_SUBDIRS = [
  'backend',
  'frontend',
  'fastapi',
  'vue3',
  'react-frontend',
  'node-backend',
  'python',
  'mcp-server',
];

function scanDirectoryForArtifacts(baseDir: string, deepPrune = false): string[] {
  const found: string[] = [];
  const candidateDirs = deepPrune
    ? [...CANDIDATE_DIR_NAMES, ...DEEP_PRUNE_DIR_NAMES]
    : CANDIDATE_DIR_NAMES;

  for (const name of candidateDirs) {
    const fullPath = path.join(baseDir, name);
    if (fs.existsSync(fullPath)) {
      found.push(path.relative(baseDir, fullPath));
    }
  }

  for (const file of CANDIDATE_FILE_PATTERNS) {
    const fullPath = path.join(baseDir, file);
    if (fs.existsSync(fullPath)) {
      found.push(path.relative(baseDir, fullPath));
    }
  }

  return found;
}

function scanSubdirectories(baseDir: string, deepPrune = false): string[] {
  const found: string[] = [];

  for (const sub of SCAN_SUBDIRS) {
    const subPath = path.join(baseDir, sub);
    if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
      const subFound = scanDirectoryForArtifacts(subPath, deepPrune);
      for (const item of subFound) {
        found.push(path.join(sub, item));
      }
    }
  }

  return found;
}

export function removeTarget(
  baseDir: string,
  relPath: string
): { removed: boolean; error?: unknown } {
  const fullPath = path.join(baseDir, relPath);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    return { removed: true };
  } catch (err) {
    return { removed: false, error: err };
  }
}

export function executeAlpineFallback(
  baseDir: string,
  targets: string[],
  execFileFn: typeof execFileSync = execFileSync
): boolean {
  const safeTargets = targets.filter(
    (t) => t.length > 0 && !t.includes('..') && !path.isAbsolute(t) && !t.includes('\0')
  );
  if (safeTargets.length === 0) return false;
  try {
    const workspaceTargets = safeTargets.map((t) => `/workspace/${t}`);
    const uid = process.getuid ? process.getuid() : 1000;
    const gid = process.getgid ? process.getgid() : 1000;
    const script =
      'for p in "$@"; do rm -rf -- "$p" 2>/dev/null || true; chown "$TARGET_OWNER" "$(dirname "$p")" 2>/dev/null || true; done';
    execFileFn(
      'docker',
      [
        'run',
        '--rm',
        '-e',
        `TARGET_OWNER=${uid}:${gid}`,
        '-v',
        `${baseDir}:/workspace`,
        'alpine:3.21',
        'sh',
        '-c',
        script,
        'sh',
        ...workspaceTargets,
      ],
      { stdio: 'ignore', timeout: 30000 }
    );
    return true;
  } catch {
    return false;
  }
}

interface DeletionOutcome {
  removed: string[];
  dockerFallbackUsed: boolean;
}

function processFailedWithDocker(
  resolvedPath: string,
  failedTargets: string[],
  removedTargets: string[],
  fallbackExecutor?: (baseDir: string, targets: string[]) => boolean
): boolean {
  if (failedTargets.length === 0) return false;
  const runner = fallbackExecutor || executeAlpineFallback;
  const fallbackSuccess = runner(resolvedPath, failedTargets);
  if (!fallbackSuccess) return false;

  for (const ft of failedTargets) {
    if (!fs.existsSync(path.join(resolvedPath, ft))) {
      removedTargets.push(ft);
    }
  }
  return true;
}

function executeTargetDeletion(
  resolvedPath: string,
  targets: string[],
  fallbackExecutor?: (baseDir: string, targets: string[]) => boolean,
  targetRemover?: (baseDir: string, relPath: string) => { removed: boolean }
): DeletionOutcome {
  const removed: string[] = [];
  const failed: string[] = [];
  const remover = targetRemover || removeTarget;

  for (const target of targets) {
    const res = remover(resolvedPath, target);
    if (res.removed) {
      removed.push(target);
    } else {
      failed.push(target);
    }
  }

  const dockerFallbackUsed = processFailedWithDocker(
    resolvedPath,
    failed,
    removed,
    fallbackExecutor
  );
  return { removed, dockerFallbackUsed };
}

export async function cleanWorkspace11x(
  projectPathInput: string,
  dryRun = true,
  deepPrune = false,
  fallbackExecutor?: (baseDir: string, targets: string[]) => boolean,
  targetRemover?: (baseDir: string, relPath: string) => { removed: boolean }
): Promise<CleanWorkspaceResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio del proyecto '${projectPathInput}' no existe.`);
  }

  const rootArtifacts = scanDirectoryForArtifacts(resolvedPath, deepPrune);
  const subArtifacts = scanSubdirectories(resolvedPath, deepPrune);
  const allFoundTargets = Array.from(new Set([...rootArtifacts, ...subArtifacts])).sort();

  let removedTargets: string[] = [];
  let dockerFallbackUsed = false;

  if (!dryRun && allFoundTargets.length > 0) {
    const outcome = executeTargetDeletion(
      resolvedPath,
      allFoundTargets,
      fallbackExecutor,
      targetRemover
    );
    removedTargets = outcome.removed;
    dockerFallbackUsed = outcome.dockerFallbackUsed;
  }

  const recommendedCommand = deepPrune ? './scripts/limpieza.sh --deep' : './scripts/limpieza.sh';

  return {
    project_path: resolvedPath,
    dry_run: dryRun,
    deep_prune: deepPrune,
    found_targets: allFoundTargets,
    removed_targets: removedTargets,
    docker_fallback_used: dockerFallbackUsed,
    recommended_command: recommendedCommand,
  };
}
