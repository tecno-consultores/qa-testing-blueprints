// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { redactPiiAndSecrets } from '../security/promptGuard.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';

export interface CliCommandOutput {
  readonly exitCode: number;
  readonly output: string;
  readonly isError?: boolean;
}

export interface CommonCliFlags {
  readonly projectPath: string;
  readonly json: boolean;
  readonly offline: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly positionals: readonly string[];
}

export function hasHelpFlag(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

export function readNextFlagValue(
  args: readonly string[],
  index: number,
  flagName: string
): string {
  const value = args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('-')) {
    throw new Error(`El flag ${flagName} requiere un valor válido.`);
  }
  return value;
}

export function resolveCliProjectPath(rawDir: string | undefined, cwd: string): string {
  const candidate = rawDir && rawDir.trim().length > 0 ? rawDir.trim() : cwd;
  if (candidate === '.') {
    return resolveSafeProjectPath(cwd);
  }
  if (path.isAbsolute(candidate) || candidate.includes('..')) {
    return resolveSafeProjectPath(candidate);
  }
  return resolveSafeProjectPath(path.resolve(cwd, candidate));
}

export function formatCliJson(payload: unknown): string {
  return redactPiiAndSecrets(JSON.stringify(payload, null, 2));
}
