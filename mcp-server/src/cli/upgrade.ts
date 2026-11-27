// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GitHubFetcher,
  resolveSafeChildPath,
  resolveSafeHomeDir,
} from '../services/github-fetcher.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  matchFlagValue,
  stripValidatedLangFlags,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';
import {
  assertValidSkillTarget,
  InstallSkillRuntimeOptions,
  runInstallSkillCli,
} from './install-skill.js';

const PREFIX_ERROR = '❌ [upgrade]';
const UTF8_ENCODING = 'utf-8';
const FLAG_CACHE_ONLY = '--cache-only';
const FLAG_TARGET = '--target';
const FLAG_TARGET_SHORT = '-t';
const FLAG_RECONCILE = '--reconcile';
const FLAG_OFFLINE = '--offline';
const FLAG_DRY_RUN = '--dry-run';
const FLAG_JSON = '--json';
const NODE_MODULES_DIR = 'node_modules';
const PKG_SCOPE = '@sinfallas';
const PKG_NAME = 'mcp-qa-11x';
const FULL_PKG_NAME = `${PKG_SCOPE}/${PKG_NAME}`;
const PACKAGE_JSON_FILE = 'package.json';
const DEFAULT_TARGET = 'all';
const RELOAD_NOTICE =
  'Reinicia o recarga el servidor MCP en tu IDE (los procesos stdio activos mantienen en memoria la versión anterior hasta recargar).';

export const UPGRADE_HELP_TEXT = renderSubcommandHelpText('upgrade', 'en');

export interface UpgradeCliDeps {
  readonly homeDir?: string;
  readonly cwd?: string;
  readonly fetcher?: GitHubFetcher;
  readonly installSkillRunner?: (
    args: string[],
    fetcher?: GitHubFetcher,
    runtimeOptions?: InstallSkillRuntimeOptions
  ) => Promise<void>;
}

export interface UpgradeReport {
  readonly home_dir: string;
  readonly target: string;
  readonly cache_only: boolean;
  readonly offline: boolean;
  readonly dry_run: boolean;
  readonly targeted_paths: readonly string[];
  readonly removed_paths: readonly string[];
  readonly skills_synced: boolean;
  readonly reload_notice: string;
}

interface ParsedUpgradeArgs {
  cacheOnly: boolean;
  target: string;
  reconcile: boolean;
  offline: boolean;
  dryRun: boolean;
  json: boolean;
}

const UPGRADE_TARGET_FLAGS = new Set([FLAG_TARGET, FLAG_TARGET_SHORT]);
const UPGRADE_BOOL_FLAGS: Readonly<Record<string, (state: ParsedUpgradeArgs) => void>> = {
  [FLAG_CACHE_ONLY]: (state) => {
    state.cacheOnly = true;
  },
  [FLAG_RECONCILE]: (state) => {
    state.reconcile = true;
  },
  [FLAG_OFFLINE]: (state) => {
    state.offline = true;
  },
  [FLAG_DRY_RUN]: (state) => {
    state.dryRun = true;
  },
  [FLAG_JSON]: (state) => {
    state.json = true;
  },
};

function applyUpgradeToken(
  args: readonly string[],
  index: number,
  state: ParsedUpgradeArgs
): number {
  const arg = pickAt(args, index);
  const boolAction = Object.hasOwn(UPGRADE_BOOL_FLAGS, arg) ? UPGRADE_BOOL_FLAGS[arg] : undefined;
  if (boolAction) {
    boolAction(state);
    return 0;
  }
  const targetMatch = matchFlagValue(args, index, UPGRADE_TARGET_FLAGS);
  if (targetMatch) {
    state.target = targetMatch.value;
    return targetMatch.consumed;
  }
  throw new Error(`Argumento u opción inválida en upgrade: '${arg}'.`);
}

function parseUpgradeArgs(args: readonly string[]): ParsedUpgradeArgs {
  const cleanArgs = stripValidatedLangFlags(args);
  const state: ParsedUpgradeArgs = {
    cacheOnly: false,
    target: DEFAULT_TARGET,
    reconcile: false,
    offline: false,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < cleanArgs.length; i++) {
    i += applyUpgradeToken(cleanArgs, i, state);
  }
  return state;
}

function isExclusiveQa11xNpxHash(hashDirPath: string): boolean {
  const pkgJsonPath = resolveSafeChildPath(hashDirPath, PACKAGE_JSON_FILE);
  if (!fs.existsSync(pkgJsonPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, UTF8_ENCODING)) as {
      dependencies?: unknown;
      devDependencies?: unknown;
      optionalDependencies?: unknown;
    };
    const deps = parsed.dependencies;
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) {
      return false;
    }
    const hasPkg = Object.prototype.hasOwnProperty.call(deps, FULL_PKG_NAME);
    const otherDeps = Object.keys(deps).filter((dep) => dep !== FULL_PKG_NAME);
    const hasExtraSections =
      (typeof parsed.devDependencies === 'object' &&
        parsed.devDependencies !== null &&
        Object.keys(parsed.devDependencies).length > 0) ||
      (typeof parsed.optionalDependencies === 'object' &&
        parsed.optionalDependencies !== null &&
        Object.keys(parsed.optionalDependencies).length > 0);
    return hasPkg && otherDeps.length === 0 && !hasExtraSections;
  } catch (err: unknown) {
    reportDebugCatchError('upgrade.isExclusiveQa11xNpxHash', err);
    return false;
  }
}

function collectHashDirRemovalTargets(npxRoot: string, hashDirName: string): string[] {
  const hashDirPath = resolveSafeChildPath(npxRoot, hashDirName);
  const pkgNodeModulesDir = resolveSafeChildPath(
    hashDirPath,
    path.join(NODE_MODULES_DIR, PKG_SCOPE, PKG_NAME)
  );
  if (!fs.existsSync(pkgNodeModulesDir)) {
    return [];
  }
  if (isExclusiveQa11xNpxHash(hashDirPath)) {
    return [hashDirPath];
  }
  const targets = [pkgNodeModulesDir];
  const binPath = resolveSafeChildPath(hashDirPath, path.join(NODE_MODULES_DIR, '.bin', PKG_NAME));
  if (fs.existsSync(binPath)) {
    targets.push(binPath);
  }
  return targets;
}

function collectRemovalTargets(homeDir: string, preserveBlueprintsCache = false): string[] {
  const targets: string[] = [];
  const npxRoot = resolveSafeChildPath(homeDir, path.join('.npm', '_npx'));
  if (fs.existsSync(npxRoot)) {
    for (const dirent of fs.readdirSync(npxRoot, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        targets.push(...collectHashDirRemovalTargets(npxRoot, dirent.name));
      }
    }
  }
  if (!preserveBlueprintsCache) {
    const blueprintsCacheDir = resolveSafeChildPath(
      homeDir,
      path.join('.cache', 'qa-11x-blueprints')
    );
    if (fs.existsSync(blueprintsCacheDir)) {
      targets.push(blueprintsCacheDir);
    }
  }
  return targets;
}

function formatUpgradeText(report: UpgradeReport): string {
  const modeLabel = report.dry_run ? 'DRY-RUN' : 'APLICADO';
  const lines: string[] = [
    `🔄 [QA-11X Upgrade | ${modeLabel}] objetivos=${report.targeted_paths.length} | eliminados=${report.removed_paths.length} | skills_synced=${report.skills_synced}`,
  ];
  for (const targetPath of report.targeted_paths) {
    lines.push(`  - ${report.dry_run ? 'objetivo' : 'eliminado'}: ${targetPath}`);
  }
  lines.push(`  ⚠️ ${report.reload_notice}`);
  return lines.join('\n');
}

async function runInstallSkillsForUpgrade(
  runner: (
    args: string[],
    fetcher?: GitHubFetcher,
    runtimeOptions?: InstallSkillRuntimeOptions
  ) => Promise<void>,
  parsed: ParsedUpgradeArgs,
  deps: UpgradeCliDeps
): Promise<void> {
  const skillArgs = [FLAG_TARGET, parsed.target, ...(parsed.reconcile ? [FLAG_RECONCILE] : [])];
  const runtimeOptions: InstallSkillRuntimeOptions = {
    homeDir: deps.homeDir,
    cwd: deps.cwd,
    log: parsed.json ? () => undefined : console.log,
  };
  await runner(skillArgs, deps.fetcher, runtimeOptions);
}

function pruneUpgradeTargetPaths(targetedPaths: readonly string[], dryRun: boolean): string[] {
  if (dryRun) {
    return [];
  }
  const removedPaths: string[] = [];
  for (const targetPath of targetedPaths) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    removedPaths.push(targetPath);
  }
  return removedPaths;
}

async function syncUpgradeSkillsIfEnabled(
  shouldSyncSkills: boolean,
  parsed: ParsedUpgradeArgs,
  deps: UpgradeCliDeps
): Promise<void> {
  if (!shouldSyncSkills) {
    return;
  }
  const runner = deps.installSkillRunner ?? runInstallSkillCli;
  await runInstallSkillsForUpgrade(runner, parsed, deps);
}

async function executeUpgradeWorkflow(
  args: readonly string[],
  deps: UpgradeCliDeps
): Promise<CliCommandOutput> {
  const parsed = parseUpgradeArgs(args);
  assertValidSkillTarget(parsed.target);
  const homeDir = resolveSafeHomeDir(deps.homeDir);
  const targetedPaths = collectRemovalTargets(homeDir, parsed.offline);
  const removedPaths = pruneUpgradeTargetPaths(targetedPaths, parsed.dryRun);
  const shouldSyncSkills = !parsed.cacheOnly && !parsed.offline && !parsed.dryRun;
  await syncUpgradeSkillsIfEnabled(shouldSyncSkills, parsed, deps);

  const report: UpgradeReport = {
    home_dir: homeDir,
    target: parsed.target,
    cache_only: parsed.cacheOnly,
    offline: parsed.offline,
    dry_run: parsed.dryRun,
    targeted_paths: targetedPaths,
    removed_paths: removedPaths,
    skills_synced: shouldSyncSkills,
    reload_notice: RELOAD_NOTICE,
  };

  return {
    exitCode: 0,
    output: parsed.json ? formatCliJson(report) : formatUpgradeText(report),
  };
}

export async function runUpgradeCli(
  args: readonly string[],
  deps: UpgradeCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('upgrade', resolveCliHelpLang(args)),
    };
  }
  try {
    return await executeUpgradeWorkflow(args, deps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
