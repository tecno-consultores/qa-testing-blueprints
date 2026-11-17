// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { readStatNoFollow, resolveRealTargetWithSymlinks } from './pathRealResolver.js';

export class WorkspacePathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathValidationError';
  }
}

export interface ResolveSafeProjectPathOptions {
  allowNonExistentLeaf?: boolean;
}

const SEC_PATH_PREFIX = '[SEC-PATH-01]';
const TRAVERSAL_SEGMENT_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

const CRITICAL_SYSTEM_ROOTS = [
  '/etc',
  '/usr',
  '/var',
  '/bin',
  '/sbin',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root',
  '/lib',
  '/lib64',
  '/System',
  '/Library',
] as const;

function normalizeForMatch(targetPath: string): string {
  return targetPath.replace(/\\/g, '/');
}

function isStrictlyInside(target: string, root: string): boolean {
  const normTarget = normalizeForMatch(target);
  const normRoot = normalizeForMatch(root);
  const prefix = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
  return normTarget.startsWith(prefix);
}

function isEqualOrInside(target: string, root: string): boolean {
  const normTarget = normalizeForMatch(target);
  const normRoot = normalizeForMatch(root);
  return normTarget === normRoot || isStrictlyInside(normTarget, normRoot);
}

function assertBasicSyntax(rawPath: string): string {
  const normalized = rawPath.normalize('NFKC').trim();
  if (normalized.length === 0) {
    throw new WorkspacePathValidationError(`${SEC_PATH_PREFIX} La ruta del proyecto no puede estar vacía.`);
  }
  if (normalized.includes('\0')) {
    throw new WorkspacePathValidationError(`${SEC_PATH_PREFIX} La ruta contiene bytes NUL inválidos.`);
  }
  if (TRAVERSAL_SEGMENT_RE.test(normalized)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} Se rechazó el recorrido transversal de directorios (..).`
    );
  }
  return normalized;
}

export function resolveRealTarget(candidate: string): string {
  const outcome = resolveRealTargetWithSymlinks(candidate);
  if (!outcome.ok) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} Ciclo de enlaces simbólicos (ELOOP) detectado en '${outcome.loopPath}'.`
    );
  }
  return outcome.resolved;
}

function resolvePathIfExists(targetPath: string): string {
  return readStatNoFollow(targetPath) !== undefined
    ? resolveRealTarget(targetPath)
    : path.resolve(targetPath);
}

function getRealHomeDir(): string | null {
  try {
    const home = os.homedir();
    return home ? resolvePathIfExists(home) : null;
  } catch (err: unknown) {
    // Restricted container environments may lack os.homedir(); returning null omits optional home root safely
    reportDebugCatchError('workspacePathValidator.getRealHomeDir', err);
    return null;
  }
}

function collectSystemRoots(): string[] {
  const roots = new Set<string>(CRITICAL_SYSTEM_ROOTS);
  for (const sysRoot of CRITICAL_SYSTEM_ROOTS) {
    if (fs.existsSync(sysRoot)) {
      roots.add(fs.realpathSync(sysRoot));
    }
  }
  return Array.from(roots);
}

function isCriticalSystemPath(realTarget: string, realTmpDir: string): boolean {
  if (normalizeForMatch(realTarget) === '/') {
    return true;
  }
  if (isStrictlyInside(realTarget, realTmpDir)) {
    return false;
  }
  return collectSystemRoots().some((root) => isEqualOrInside(realTarget, root));
}

function getAllowedWorkspaceRoots(): string[] {
  const roots: string[] = [];
  const cwd = process.cwd();
  if (cwd && path.resolve(cwd) !== path.parse(path.resolve(cwd)).root) {
    try {
      const realCwd = fs.realpathSync(cwd);
      if (realCwd !== path.parse(realCwd).root) {
        roots.push(realCwd);
      }
    } catch {
      // Ignore unavailable/deleted process.cwd() and rely on explicit QA11X_WORKSPACE_ROOTS
    }
  }
  const extraRoots = (process.env.QA11X_WORKSPACE_ROOTS ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of extraRoots) {
    const resolved = path.resolve(entry);
    if (fs.existsSync(resolved)) {
      roots.push(fs.realpathSync(resolved));
    }
  }
  return roots;
}

function isWithinAllowedWorkspace(realTarget: string, realTmpDir: string): boolean {
  const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (isTestEnv && isStrictlyInside(realTarget, realTmpDir)) {
    return true;
  }
  return getAllowedWorkspaceRoots().some((root) => isEqualOrInside(realTarget, root));
}

export function resolveSafeProjectPath(
  rawPath: string,
  options?: ResolveSafeProjectPathOptions
): string {
  const normalized = assertBasicSyntax(rawPath);
  const candidate = path.resolve(normalized);

  if (options?.allowNonExistentLeaf === false && !fs.existsSync(candidate)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} La ruta del proyecto no existe: ${candidate}`
    );
  }

  const realTarget = resolveRealTarget(candidate);
  const realTmpDir = resolvePathIfExists(os.tmpdir());

  if (realTarget === realTmpDir) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} No se permite operar directamente sobre el directorio raíz temporal.`
    );
  }

  const realHome = getRealHomeDir();
  if (realHome !== null && realTarget === realHome) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} No se permite operar directamente sobre el directorio raíz $HOME.`
    );
  }

  if (isCriticalSystemPath(realTarget, realTmpDir)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} Ruta crítica del sistema rechazada: ${realTarget}`
    );
  }

  if (!isWithinAllowedWorkspace(realTarget, realTmpDir)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_PREFIX} Ruta fuera de los workspaces permitidos (configure QA11X_WORKSPACE_ROOTS para habilitar raíces adicionales): ${realTarget}`
    );
  }

  return realTarget;
}
