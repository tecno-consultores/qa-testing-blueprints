// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_SYMLINK_DEPTH = 40;

export type SymlinkResolutionResult =
  | { readonly ok: true; readonly resolved: string }
  | { readonly ok: false; readonly loopPath: string };

export function readStatNoFollow(targetPath: string): fs.Stats | undefined {
  return fs.lstatSync(targetPath, { throwIfNoEntry: false });
}

export function resolveRealTargetWithSymlinks(
  candidate: string,
  visited: Set<string> = new Set<string>()
): SymlinkResolutionResult {
  const tail: string[] = [];
  let cur = path.resolve(candidate);
  let stat = readStatNoFollow(cur);
  while (stat === undefined) {
    const parent = path.dirname(cur);
    if (parent === cur) {
      return { ok: true, resolved: candidate };
    }
    tail.unshift(path.basename(cur));
    cur = parent;
    stat = readStatNoFollow(cur);
  }
  try {
    return { ok: true, resolved: path.join(fs.realpathSync(cur), ...tail) };
  } catch {
    if (!stat.isSymbolicLink()) {
      return { ok: true, resolved: path.join(path.resolve(cur), ...tail) };
    }
    if (visited.has(cur) || visited.size >= MAX_SYMLINK_DEPTH) {
      return { ok: false, loopPath: cur };
    }
    visited.add(cur);
    const linkTarget = path.resolve(path.dirname(cur), fs.readlinkSync(cur));
    return resolveRealTargetWithSymlinks(path.join(linkTarget, ...tail), visited);
  }
}
