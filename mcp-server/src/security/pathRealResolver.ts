// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_SYMLINK_DEPTH = 40;

export type SymlinkResolutionResult =
  | { readonly ok: true; readonly resolved: string }
  | { readonly ok: false; readonly loopPath: string; readonly reason?: 'eloop' | 'unresolvable' };

export function readStatNoFollow(targetPath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(targetPath, { throwIfNoEntry: false });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP') {
      return undefined;
    }
    throw err;
  }
}

function resolveCanonicalParentDir(parentDir: string): string {
  try {
    return fs.realpathSync(parentDir);
  } catch {
    return path.resolve(parentDir);
  }
}

function readStatSafe(targetPath: string): { readonly ok: true; readonly stat: fs.Stats | undefined } | { readonly ok: false } {
  try {
    return { ok: true, stat: readStatNoFollow(targetPath) };
  } catch {
    return { ok: false };
  }
}

export function resolveRealTargetWithSymlinks(
  candidate: string,
  visited: Set<string> = new Set<string>()
): SymlinkResolutionResult {
  const tail: string[] = [];
  let cur = path.resolve(candidate);
  let probe = readStatSafe(cur);
  if (!probe.ok) {
    return { ok: false, loopPath: cur, reason: 'unresolvable' };
  }
  while (probe.stat === undefined) {
    const parent = path.dirname(cur);
    if (parent === cur) {
      return { ok: true, resolved: candidate };
    }
    tail.unshift(path.basename(cur));
    cur = parent;
    probe = readStatSafe(cur);
    if (!probe.ok) {
      return { ok: false, loopPath: cur, reason: 'unresolvable' };
    }
  }
  const stat = probe.stat;
  try {
    return { ok: true, resolved: path.join(fs.realpathSync(cur), ...tail) };
  } catch {
    if (!stat.isSymbolicLink()) {
      return { ok: false, loopPath: cur, reason: 'unresolvable' };
    }
    if (visited.has(cur) || visited.size >= MAX_SYMLINK_DEPTH) {
      return { ok: false, loopPath: cur, reason: 'eloop' };
    }
    visited.add(cur);
    const parentDir = resolveCanonicalParentDir(path.dirname(cur));
    const linkTarget = path.resolve(parentDir, fs.readlinkSync(cur));
    return resolveRealTargetWithSymlinks(path.join(linkTarget, ...tail), visited);
  }
}
