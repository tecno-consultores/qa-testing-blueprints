// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { redactPiiAndSecrets } from '../security/promptGuard.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

export function resolveComparablePath(targetPath: string): string {
  const abs = path.resolve(targetPath);
  try {
    return fs.realpathSync(abs);
  } catch (err: unknown) {
    reportDebugCatchError('cliArgHelpers.resolveComparablePath', err);
    return abs;
  }
}

export function isSameResolvedDir(dirA: string, dirB: string): boolean {
  return resolveComparablePath(dirA) === resolveComparablePath(dirB);
}

export interface CliCommandOutput {
  readonly exitCode: number;
  readonly output: string;
  readonly isError?: boolean;
}

export interface FlagValueMatch {
  readonly flag: string;
  readonly value: string;
  readonly consumed: number;
}

export function hasHelpFlag(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

function defaultMissingFlagError(flagName: string): string {
  return `El flag ${flagName} requiere un valor válido.`;
}

export function readNextFlagValue(
  args: readonly string[],
  index: number,
  flagName: string,
  formatError: (flag: string) => string = defaultMissingFlagError
): string {
  const value = args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('-')) {
    throw new Error(formatError(flagName));
  }
  return value;
}

function hasFlagName(
  allowedFlags: ReadonlySet<string> | readonly string[],
  flag: string
): boolean {
  return Array.isArray(allowedFlags)
    ? allowedFlags.includes(flag)
    : (allowedFlags as ReadonlySet<string>).has(flag);
}

function matchEqualsFlag(
  rawArg: string,
  allowedFlags: ReadonlySet<string> | readonly string[],
  formatError: (flag: string) => string
): FlagValueMatch | null {
  const eqIdx = rawArg.indexOf('=');
  if (eqIdx === -1) {
    return null;
  }
  const flag = rawArg.slice(0, eqIdx);
  if (!hasFlagName(allowedFlags, flag)) {
    return null;
  }
  const value = rawArg.slice(eqIdx + 1);
  if (value.length === 0) {
    throw new Error(formatError(flag));
  }
  return { flag, value, consumed: 0 };
}

/** Matches `--flag value`, `-x value`, `--flag=value`, and `-x=value` consistently. */
export function matchFlagValue(
  args: readonly string[],
  index: number,
  allowedFlags: ReadonlySet<string> | readonly string[],
  formatError: (flag: string) => string = defaultMissingFlagError
): FlagValueMatch | null {
  const rawArg = args[index];
  if (rawArg === undefined) {
    return null;
  }
  const eqMatch = matchEqualsFlag(rawArg, allowedFlags, formatError);
  if (eqMatch) {
    return eqMatch;
  }
  if (!hasFlagName(allowedFlags, rawArg)) {
    return null;
  }
  return {
    flag: rawArg,
    value: readNextFlagValue(args, index, rawArg, formatError),
    consumed: 1,
  };
}

const TRAVERSAL_SEGMENT_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

export function resolveCliProjectPath(rawDir: string | undefined, cwd: string): string {
  const candidate = rawDir && rawDir.trim().length > 0 ? rawDir.trim() : cwd;
  if (candidate === '.') {
    return resolveSafeProjectPath(cwd);
  }
  if (path.isAbsolute(candidate) || TRAVERSAL_SEGMENT_RE.test(candidate)) {
    return resolveSafeProjectPath(candidate);
  }
  return resolveSafeProjectPath(path.resolve(cwd, candidate));
}

const LANG_FLAGS = new Set(['--lang', '-l']);
const VALID_CLI_LANGS = new Set(['auto', 'en', 'es']);

/**
 * Strips and validates optional `--lang|-l <auto|en|es>` tokens so any CLI subcommand
 * documented with `[--lang|-l en|es]` accepts it consistently without failing on unknown option.
 */
export function stripValidatedLangFlags(args: readonly string[]): string[] {
  const filtered: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const langMatch = matchFlagValue(args, i, LANG_FLAGS);
    if (langMatch) {
      const norm = langMatch.value.trim().toLowerCase();
      if (!VALID_CLI_LANGS.has(norm)) {
        throw new Error(`Valor inválido para ${langMatch.flag}: '${langMatch.value}'. Usa en, es o auto.`);
      }
      i += langMatch.consumed;
      continue;
    }
    const argVal = args[i];
    if (argVal !== undefined) {
      filtered.push(argVal);
    }
  }
  return filtered;
}

export function formatCliJson(payload: unknown): string {
  return redactPiiAndSecrets(JSON.stringify(payload, null, 2));
}
