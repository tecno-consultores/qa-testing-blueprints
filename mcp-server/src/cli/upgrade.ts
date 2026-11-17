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
  readNextFlagValue,
} from './cliArgHelpers.js';
import { runInstallSkillCli } from './install-skill.js';

const PREFIX_ERROR = '❌ [upgrade]';
const UTF8_ENCODING = 'utf-8';
const FLAG_CACHE_ONLY = '--cache-only';
const FLAG_TARGET = '--target';
const FLAG_TARGET_SHORT = '-t';
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

export const UPGRADE_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x upgrade [opciones]',
  '',
  'Opciones:',
  '  --cache-only              Limpia cachés _npx y blueprints sin reinstalar skills',
  '  --target, -t <env>        Destino de skills para install-skill (por defecto: all)',
  '  --offline                 Omite resincronización remota de skills',
  '  --dry-run                 Simula limpieza y sincronización sin borrar ni escribir',
  '  --json                    Emite resultado estructurado en JSON',
  '  --help, -h                Muestra esta ayuda y sale con código 0',
].join('\n');

export interface UpgradeCliDeps {
  readonly homeDir?: string;
  readonly fetcher?: GitHubFetcher;
  readonly installSkillRunner?: (args: string[], fetcher?: GitHubFetcher) => Promise<void>;
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
  readonly cacheOnly: boolean;
  readonly target: string;
  readonly offline: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
}

function parseUpgradeArgs(args: readonly string[]): ParsedUpgradeArgs {
  let cacheOnly = false;
  let target = DEFAULT_TARGET;
  let offline = false;
  let dryRun = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    if (arg === FLAG_CACHE_ONLY) {
      cacheOnly = true;
    } else if (arg === FLAG_OFFLINE) {
      offline = true;
    } else if (arg === FLAG_DRY_RUN) {
      dryRun = true;
    } else if (arg === FLAG_JSON) {
      json = true;
    } else if (arg === FLAG_TARGET || arg === FLAG_TARGET_SHORT) {
      target = readNextFlagValue(args, i, arg);
      i += 1;
    } else {
      throw new Error(`Argumento u opción inválida en upgrade: '${arg}'.`);
    }
  }

  return { cacheOnly, target, offline, dryRun, json };
}

function isExclusiveQa11xNpxHash(hashDirPath: string): boolean {
  const pkgJsonPath = resolveSafeChildPath(hashDirPath, PACKAGE_JSON_FILE);
  if (!fs.existsSync(pkgJsonPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, UTF8_ENCODING)) as {
      dependencies?: unknown;
    };
    if (typeof parsed.dependencies !== 'object' || parsed.dependencies === null) {
      return false;
    }
    const otherDeps = Object.keys(parsed.dependencies).filter((dep) => dep !== FULL_PKG_NAME);
    return otherDeps.length === 0;
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

function collectRemovalTargets(homeDir: string): string[] {
  const targets: string[] = [];
  const npxRoot = resolveSafeChildPath(homeDir, path.join('.npm', '_npx'));
  if (fs.existsSync(npxRoot)) {
    for (const dirent of fs.readdirSync(npxRoot, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        targets.push(...collectHashDirRemovalTargets(npxRoot, dirent.name));
      }
    }
  }
  const blueprintsCacheDir = resolveSafeChildPath(
    homeDir,
    path.join('.cache', 'qa-11x-blueprints')
  );
  if (fs.existsSync(blueprintsCacheDir)) {
    targets.push(blueprintsCacheDir);
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

export async function runUpgradeCli(
  args: readonly string[],
  deps: UpgradeCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: UPGRADE_HELP_TEXT };
  }
  try {
    const parsed = parseUpgradeArgs(args);
    const homeDir = resolveSafeHomeDir(deps.homeDir);
    const targetedPaths = collectRemovalTargets(homeDir);
    const removedPaths: string[] = [];

    if (!parsed.dryRun) {
      for (const targetPath of targetedPaths) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        removedPaths.push(targetPath);
      }
    }

    const shouldSyncSkills = !parsed.cacheOnly && !parsed.offline && !parsed.dryRun;
    if (shouldSyncSkills) {
      const runner = deps.installSkillRunner ?? runInstallSkillCli;
      await runner([FLAG_TARGET, parsed.target, '--reconcile'], deps.fetcher);
    }

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
