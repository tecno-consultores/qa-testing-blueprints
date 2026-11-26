// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { CleanWorkspaceResult } from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  isWorkspaceScopedContainer,
  parseRestartingContainers,
} from './ephemeral-runner/dockerGuardrails.js';

export const ALPINE_FALLBACK_IMAGE =
  'alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab';

const CANDIDATE_DIR_NAMES = [
  '.coverage',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.hypothesis',
  '.schemathesis',
  '.tox',
  '.nox',
  '.uv',
  '.eggs',
  '.benchmarks',
  '.phpunit.cache',
  '.psalm',
  'htmlcov',
  'coverage_report',
  '.bats-battery',
  'mutants',
  '.mutmut-cache',
  'target',
  'test/target',
  '.trivycache',
  'allure-results',
  'allure-report',
  '.allure',
  '.deepeval',
  '.promptfoo',
  'dist',
  'dist-ssr',
  '.nuxt',
  '.next',
  '.output',
  '.svelte-kit',
  '.vite',
  '.vite-ssg-temp',
  '.parcel-cache',
  'storybook-static',
  'coverage',
  '.nyc_output',
  '.stryker-tmp',
  '.clinic',
  'test-results',
  'playwright-report',
  'blob-report',
  'playwright/.cache',
  '.lighthouseci',
  'lhci-reports',
  '.lhcache',
  'psi-reports',
  '.eslintcache',
  '.stylelintcache',
  '.pnpm-store',
  '.turbo',
  '.agents/tmp',
  '.agents/.cache/tmp',
  '.agents/artifacts',
];

const DEEP_PRUNE_DIR_NAMES = [
  'reports',
  'prometheus_data',
  '.agents/backups',
  '.agents/proposals',
  '.agents/.qa-evidence.json',
  '.agents/.cache/coverage',
  '.agents/.cache/sarif',
];

const PROTECTED_BREAKER_REL_PATHS = new Set<string>([
  '.agents/.cache/certify_state.json',
  '.agents/.cache/session_checkpoint.json',
]);

const CANDIDATE_FILE_PATTERNS = [
  'karate.jar',
  'zap-report.html',
  'zap-report.json',
  'chaos-report.html',
  'chaos-report.json',
  'psi-report.json',
  'profile.svg',
  'sbom.cyclonedx.json',
  'cbom.cyclonedx.json',
  'coverage.xml',
  'junit.xml',
  'mutmut-stats.json',
  '.phpunit.result.cache',
  '.php-cs-fixer.cache',
  'infection.log',
  'infection-summary.log',
  'infection-report.json',
  'release-readiness.json',
  'release-readiness.md',
  'promptfoo-output.json',
  'promptfoo-output.html',
  'deepeval-results.json',
  'qa-11x-last-failure.json',
  '.DS_Store',
  'Thumbs.db',
  'Desktop.ini',
  'ACTIVE_TASK.md',
  '.task_scratchpad.md',
];

const MCP_SERVER_DIR_NAME = 'mcp-server';

const SCAN_SUBDIRS = [
  'backend',
  'frontend',
  'fastapi',
  'vue3',
  'react-frontend',
  'node-backend',
  'python',
  'php',
  'bash-scripts',
  'ai-evals',
  'mobile-appium',
  'vibe-rescue',
  MCP_SERVER_DIR_NAME,
];

function isContainedRealPath(rootReal: string, candidateReal: string): boolean {
  const rel = path.relative(rootReal, candidateReal);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function hasSymlinkAncestorSegment(baseDir: string, relPath: string): boolean {
  const baseReal = fs.existsSync(baseDir) ? fs.realpathSync(baseDir) : path.resolve(baseDir);
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) {
    return false;
  }
  let cur = baseReal;
  for (const segment of parts.slice(0, -1)) {
    cur = path.join(cur, segment);
    const stat = fs.lstatSync(cur, { throwIfNoEntry: false });
    if (stat === undefined) {
      return false;
    }
    if (stat.isSymbolicLink()) {
      return true;
    }
  }
  const parentReal = fs.existsSync(cur) ? fs.realpathSync(cur) : path.resolve(cur);
  return !isContainedRealPath(baseReal, parentReal);
}

function entryExistsNoFollow(targetPath: string): fs.Stats | undefined {
  return fs.lstatSync(targetPath, { throwIfNoEntry: false });
}

function scanDirectoryForArtifacts(baseDir: string, deepPrune = false, preserveDist = false): string[] {
  const found: string[] = [];
  const candidateDirs = deepPrune
    ? [...CANDIDATE_DIR_NAMES, ...DEEP_PRUNE_DIR_NAMES]
    : CANDIDATE_DIR_NAMES;

  for (const name of candidateDirs) {
    if (preserveDist && name === 'dist') continue;
    if (hasSymlinkAncestorSegment(baseDir, name)) continue;
    const fullPath = path.join(baseDir, name);
    if (entryExistsNoFollow(fullPath) !== undefined) {
      found.push(path.relative(baseDir, fullPath));
    }
  }

  for (const file of CANDIDATE_FILE_PATTERNS) {
    if (hasSymlinkAncestorSegment(baseDir, file)) continue;
    const fullPath = path.join(baseDir, file);
    if (entryExistsNoFollow(fullPath) !== undefined) {
      found.push(path.relative(baseDir, fullPath));
    }
  }

  return found;
}

const LOOSE_BACKUP_FILE_RE = /\.(?:11x-backup|11x-incoming|bak)$/i;

function isValidLooseBackupDir(targetDir: string): boolean {
  const dirStat = entryExistsNoFollow(targetDir);
  return Boolean(dirStat && !dirStat.isSymbolicLink() && dirStat.isDirectory());
}

function isLooseBackupFile(entry: fs.Dirent, baseDir: string, relPath: string): boolean {
  if (entry.isSymbolicLink() || !entry.isFile()) return false;
  return LOOSE_BACKUP_FILE_RE.test(entry.name) && !hasSymlinkAncestorSegment(baseDir, relPath);
}

function scanDirForLooseBackups(baseDir: string, relDir: string): string[] {
  const targetDir = relDir ? path.join(baseDir, relDir) : baseDir;
  if (!isValidLooseBackupDir(targetDir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const relPath = path.join(relDir, entry.name);
    if (isLooseBackupFile(entry, baseDir, relPath)) {
      found.push(relPath);
    }
  }
  return found;
}

function collectLooseBackupArtifacts(baseDir: string): string[] {
  return [
    ...scanDirForLooseBackups(baseDir, ''),
    ...scanDirForLooseBackups(baseDir, '.agents'),
    ...scanDirForLooseBackups(baseDir, 'scripts'),
  ];
}

function scanSubdirectories(baseDir: string, deepPrune = false): string[] {
  const found: string[] = [];

  for (const sub of SCAN_SUBDIRS) {
    const subPath = path.join(baseDir, sub);
    const subStat = entryExistsNoFollow(subPath);
    if (subStat?.isDirectory()) {
      const subFound = scanDirectoryForArtifacts(subPath, deepPrune, sub === MCP_SERVER_DIR_NAME);
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
  const normalizedRel = relPath.replace(/\\/g, '/');
  if (
    !relPath ||
    relPath.includes('\0') ||
    path.isAbsolute(relPath) ||
    relPath.split(/[\\/]/).includes('..') ||
    PROTECTED_BREAKER_REL_PATHS.has(normalizedRel) ||
    normalizedRel.endsWith('/.agents/.cache/certify_state.json') ||
    normalizedRel === '.agents/.cache' ||
    normalizedRel.endsWith('/.agents/.cache') ||
    hasSymlinkAncestorSegment(baseDir, relPath)
  ) {
    return {
      removed: false,
      error: new Error(`Ruta insegura, protegida (BREAKER-42) o symlink ancestral rechazado: ${relPath}`),
    };
  }
  const fullPath = path.join(baseDir, relPath);
  try {
    const stat = fs.lstatSync(fullPath);
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
  if (!baseDir || baseDir.includes('\0') || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(baseDir)) {
    return false;
  }
  const dirExists = fs.existsSync(baseDir);
  const safeTargets = targets.filter(
    (t) =>
      t.length > 0 &&
      !t.includes('..') &&
      !path.isAbsolute(t) &&
      !t.includes('\0') &&
      (!dirExists || !hasSymlinkAncestorSegment(baseDir, t))
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
        '--network',
        'none',
        '-e',
        `TARGET_OWNER=${uid}:${gid}`,
        '-v',
        `${baseDir}:/workspace`,
        ALPINE_FALLBACK_IMAGE,
        'sh',
        '-c',
        script,
        'sh',
        ...workspaceTargets,
      ],
      { stdio: 'ignore', timeout: 30000 }
    );
    return true;
  } catch (err: unknown) {
    // Docker fallback cleanup unavailable or failed: return false so caller surfaces unremoved targets
    reportDebugCatchError('cleanWorkspace.executeAlpineFallback', err);
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

export interface DockerContainerCleanOutcome {
  readonly found: string[];
  readonly removed: string[];
}

export interface CleanWorkspaceDeps {
  readonly fallbackExecutor?: (baseDir: string, targets: string[]) => boolean;
  readonly targetRemover?: (baseDir: string, relPath: string) => { removed: boolean };
  readonly dockerContainerCleaner?: (
    resolvedPath: string,
    dryRun: boolean
  ) => DockerContainerCleanOutcome;
  readonly execFileSyncFn?: typeof execFileSync;
}

function listWorkspaceContainers(
  resolvedPath: string,
  execSyncFn: typeof execFileSync
): Array<{ id: string; label: string; status: string }> {
  try {
    const raw = execSyncFn(
      'docker',
      [
        'ps',
        '-a',
        '--filter',
        'status=restarting',
        '--filter',
        'status=exited',
        '--filter',
        'status=dead',
        '--format',
        '{{.ID}}|{{.Names}}|{{.State}}|{{.Label "com.docker.compose.project.working_dir"}}',
      ],
      { timeout: 2000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return parseRestartingContainers(String(raw))
      .filter((c) => isWorkspaceScopedContainer(c.workingDir, resolvedPath))
      .map((c) => ({ id: c.id, label: `${c.name}(${c.id})`, status: c.image }));
  } catch (err: unknown) {
    reportDebugCatchError('cleanWorkspace.listWorkspaceContainers', err);
    return [];
  }
}

function defaultCleanWorkspaceContainers(
  resolvedPath: string,
  dryRun: boolean,
  execSyncFn: typeof execFileSync = execFileSync
): DockerContainerCleanOutcome {
  const candidates = listWorkspaceContainers(resolvedPath, execSyncFn);
  const found = candidates.map((c) => c.label);
  if (dryRun || candidates.length === 0) {
    return { found, removed: [] };
  }
  const removed: string[] = [];
  for (const item of candidates) {
    try {
      if (item.status === 'restarting') {
        execSyncFn('docker', ['update', '--restart=no', item.id], {
          timeout: 2000,
          stdio: 'ignore',
        });
      }
      execSyncFn('docker', ['rm', '-fv', item.id], { timeout: 3000, stdio: 'ignore' });
      removed.push(item.label);
    } catch (err: unknown) {
      reportDebugCatchError('cleanWorkspace.removeWorkspaceContainer', err);
    }
  }
  return { found, removed };
}

export function cleanWorkspace11x(
  projectPathInput: string,
  dryRun = true,
  deepPrune = false,
  deps: CleanWorkspaceDeps = {}
): Promise<CleanWorkspaceResult> {
  return Promise.resolve().then(() =>
    executeCleanWorkspace11x(projectPathInput, dryRun, deepPrune, deps)
  );
}

function executeCleanWorkspace11x(
  projectPathInput: string,
  dryRun = true,
  deepPrune = false,
  deps: CleanWorkspaceDeps = {}
): CleanWorkspaceResult {
  const { fallbackExecutor, targetRemover, dockerContainerCleaner, execFileSyncFn } = deps;
  const resolvedPath = resolveSafeProjectPath(projectPathInput);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio del proyecto '${projectPathInput}' no existe.`);
  }

  const preserveRootDist = path.basename(resolvedPath) === MCP_SERVER_DIR_NAME;
  const rootArtifacts = scanDirectoryForArtifacts(resolvedPath, deepPrune, preserveRootDist);
  const subArtifacts = scanSubdirectories(resolvedPath, deepPrune);
  const looseBackupArtifacts = deepPrune ? collectLooseBackupArtifacts(resolvedPath) : [];
  const allFoundTargets = Array.from(
    new Set([...rootArtifacts, ...subArtifacts, ...looseBackupArtifacts])
  ).sort((a, b) => a.localeCompare(b));

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

  const containerOutcome = dockerContainerCleaner
    ? dockerContainerCleaner(resolvedPath, dryRun)
    : defaultCleanWorkspaceContainers(resolvedPath, dryRun, execFileSyncFn);

  const recommendedCommand = deepPrune ? './scripts/limpieza.sh --deep' : './scripts/limpieza.sh';

  return {
    project_path: resolvedPath,
    dry_run: dryRun,
    deep_prune: deepPrune,
    found_targets: allFoundTargets,
    removed_targets: removedTargets,
    ...(containerOutcome.found.length > 0
      ? {
          found_containers: containerOutcome.found,
          removed_containers: containerOutcome.removed,
        }
      : {}),
    docker_fallback_used: dockerFallbackUsed,
    recommended_command: recommendedCommand,
  };
}
