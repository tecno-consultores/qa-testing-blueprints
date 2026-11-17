// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GitHubFetcher,
  MCP_SERVER_VERSION,
  resolveSafeChildPath,
  resolveSafeHomeDir,
} from '../services/github-fetcher.js';
import {
  detectExistingQa11xSkillDirs,
  readVersionStamp,
} from '../services/version-manager.js';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import type { ProjectAuditResult } from '../types.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  readNextFlagValue,
  resolveCliProjectPath,
} from './cliArgHelpers.js';

const PREFIX_ERROR = '❌ [doctor]';
const UTF8_ENCODING = 'utf-8';
const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_OFFLINE = '--offline';
const FLAG_JSON = '--json';
const NODE_MODULES_DIR = 'node_modules';
const QA_11X_TOKEN = 'qa-11x';
const PKG_SCOPE = '@sinfallas';
const PKG_NAME = 'mcp-qa-11x';
const PACKAGE_JSON_FILE = 'package.json';
const UNKNOWN_VALUE = 'unknown';

export const DOCTOR_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x doctor [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, -p <dir>  Directorio del proyecto a diagnosticar (por defecto: cwd)',
  '  --offline                 Omite verificación de versión remota en npm/GitHub',
  '  --json                    Emite diagnóstico estructurado en JSON',
  '  --help, -h                Muestra esta ayuda y sale con código 0',
].join('\n');

export type BinaryOrigin = 'npx-cache' | 'global-bin' | 'local-workspace';

export interface NpxCacheEntry {
  readonly hashDir: string;
  readonly version: string;
}

export interface GlobalSkillStatus {
  readonly dir: string;
  readonly version: string | null;
}

export interface IdeMcpConfigStatus {
  readonly client: string;
  readonly path: string;
  readonly exists: boolean;
  readonly has_qa_11x: boolean;
}

export interface DoctorCliDeps {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly execPath?: string;
  readonly entryScriptPath?: string;
  readonly fetcher?: GitHubFetcher;
  readonly fetchFn?: typeof fetch;
  readonly dockerProbeFn?: () => string | null;
}

export interface DoctorReport {
  readonly mcp_version: string;
  readonly node_version: string;
  readonly exec_path: string;
  readonly entry_script_path: string;
  readonly binary_origin: BinaryOrigin;
  readonly home_dir: string;
  readonly project_path: string;
  readonly npx_cache: {
    readonly entries: readonly NpxCacheEntry[];
    readonly multiple_npx_caches: boolean;
  };
  readonly global_skills: readonly GlobalSkillStatus[];
  readonly ide_mcp_configs: readonly IdeMcpConfigStatus[];
  readonly docker_version: string | null;
  readonly graphify_graph_present: boolean;
  readonly project_inspection: ProjectAuditResult;
}

interface ParsedDoctorArgs {
  readonly rawDir: string | undefined;
  readonly offline: boolean;
  readonly json: boolean;
}

const IDE_MCP_TARGETS: readonly { readonly client: string; readonly relPath: string }[] = [
  { client: 'gemini', relPath: path.join('.gemini', 'config', 'mcp_config.json') },
  { client: 'claude', relPath: '.claude.json' },
  { client: 'cursor', relPath: path.join('.cursor', 'mcp.json') },
  { client: 'windsurf', relPath: path.join('.codeium', 'windsurf', 'mcp_config.json') },
  { client: 'codex', relPath: path.join('.codex', 'config.toml') },
];

function parseDoctorArgs(args: readonly string[]): ParsedDoctorArgs {
  let rawDir: string | undefined;
  let offline = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    if (arg === FLAG_OFFLINE) {
      offline = true;
    } else if (arg === FLAG_JSON) {
      json = true;
    } else if (arg === FLAG_PROJECT_PATH || arg === FLAG_PROJECT_PATH_SHORT) {
      rawDir = readNextFlagValue(args, i, arg);
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Opción desconocida en doctor: '${arg}'.`);
    } else if (rawDir !== undefined) {
      throw new Error(`Argumento posicional inesperado: '${arg}'.`);
    } else {
      rawDir = arg;
    }
  }

  return { rawDir, offline, json };
}

function detectBinaryOrigin(entryScript: string, projectPath: string): BinaryOrigin {
  if (entryScript.includes('/.npm/_npx/') || entryScript.includes('\\.npm\\_npx\\')) {
    return 'npx-cache';
  }
  if (!entryScript) {
    return 'local-workspace';
  }
  const resolvedEntry = path.resolve(entryScript);
  const resolvedProject = path.resolve(projectPath);
  const insideProject =
    resolvedEntry === resolvedProject ||
    resolvedEntry.startsWith(`${resolvedProject}${path.sep}`);
  if (entryScript.includes(`${path.sep}${NODE_MODULES_DIR}${path.sep}`) || !insideProject) {
    return 'global-bin';
  }
  return 'local-workspace';
}

function readPackageVersionSafe(pkgJsonPath: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, UTF8_ENCODING)) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.length > 0
      ? parsed.version
      : UNKNOWN_VALUE;
  } catch (err: unknown) {
    reportDebugCatchError('doctor.readPackageVersionSafe', err);
    return UNKNOWN_VALUE;
  }
}

function scanNpxCacheEntries(homeDir: string): NpxCacheEntry[] {
  const npxRoot = resolveSafeChildPath(homeDir, path.join('.npm', '_npx'));
  if (!fs.existsSync(npxRoot)) {
    return [];
  }
  const entries: NpxCacheEntry[] = [];
  for (const dirent of fs.readdirSync(npxRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const pkgJsonPath = resolveSafeChildPath(
      npxRoot,
      path.join(dirent.name, NODE_MODULES_DIR, PKG_SCOPE, PKG_NAME, PACKAGE_JSON_FILE)
    );
    if (fs.existsSync(pkgJsonPath)) {
      entries.push({ hashDir: dirent.name, version: readPackageVersionSafe(pkgJsonPath) });
    }
  }
  return entries;
}

function inspectIdeMcpConfig(
  homeDir: string,
  target: { readonly client: string; readonly relPath: string }
): IdeMcpConfigStatus {
  const fullPath = resolveSafeChildPath(homeDir, target.relPath);
  if (!fs.existsSync(fullPath)) {
    return { client: target.client, path: fullPath, exists: false, has_qa_11x: false };
  }
  let hasQa11x = false;
  try {
    const content = fs.readFileSync(fullPath, UTF8_ENCODING);
    hasQa11x = content.includes(QA_11X_TOKEN);
  } catch (err: unknown) {
    reportDebugCatchError(`doctor.inspectIdeMcpConfig(${target.client})`, err);
  }
  return { client: target.client, path: fullPath, exists: true, has_qa_11x: hasQa11x };
}

function defaultDockerProbe(execFileFn: typeof execFileSync = execFileSync): string | null {
  try {
    const raw = execFileFn('docker', ['info', '--format', '{{.ServerVersion}}'], {
      timeout: 1500,
      encoding: UTF8_ENCODING,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return raw.length > 0 ? raw : null;
  } catch (err: unknown) {
    reportDebugCatchError('doctor.defaultDockerProbe', err);
    return null;
  }
}

function formatIdeMcpStatus(cfg: IdeMcpConfigStatus): string {
  if (!cfg.exists) {
    return 'no encontrado';
  }
  return cfg.has_qa_11x ? 'qa-11x activo' : 'sin qa-11x';
}

function formatDoctorText(report: DoctorReport): string {
  const lines: string[] = [
    `🩺 [QA-11X Doctor] MCP v${report.mcp_version} | origin=${report.binary_origin} | node=${report.node_version}`,
    `  Proyecto: ${report.project_path} (stacks: ${report.project_inspection.detected_stacks.join(', ') || 'ninguno'})`,
    `  Docker: ${report.docker_version ?? 'no detectado'} | Graphify AST: ${report.graphify_graph_present ? 'presente' : 'ausente'}`,
    `  Cachés _npx: ${report.npx_cache.entries.length}${report.npx_cache.multiple_npx_caches ? ' (⚠️ múltiples cachés detectados; ejecuta upgrade --cache-only)' : ''}`,
  ];
  for (const cache of report.npx_cache.entries) {
    lines.push(`    - ${cache.hashDir}: v${cache.version}`);
  }
  lines.push(`  Skills globales detectados (${report.global_skills.length}):`);
  for (const skill of report.global_skills) {
    lines.push(`    - ${skill.dir}: ${skill.version ?? 'sin estampa'}`);
  }
  lines.push('  Configuración MCP por IDE:');
  for (const cfg of report.ide_mcp_configs) {
    lines.push(`    - ${cfg.client}: ${formatIdeMcpStatus(cfg)} (${cfg.path})`);
  }
  if (report.project_inspection.update_available?.agent_notice) {
    lines.push(`  Actualización: ${report.project_inspection.update_available.agent_notice}`);
  }
  return lines.join('\n');
}

export async function runDoctorCli(
  args: readonly string[],
  deps: DoctorCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return { exitCode: 0, output: DOCTOR_HELP_TEXT };
  }
  try {
    const parsed = parseDoctorArgs(args);
    const homeDir = resolveSafeHomeDir(deps.homeDir);
    const projectPath = resolveCliProjectPath(parsed.rawDir, deps.cwd ?? process.cwd());
    const entryScriptPath = deps.entryScriptPath ?? pickAt(process.argv, 1);
    const execPath = deps.execPath ?? process.execPath;
    const npxEntries = scanNpxCacheEntries(homeDir);
    const skillDirs = detectExistingQa11xSkillDirs(homeDir);
    const dockerProbeFn = deps.dockerProbeFn ?? defaultDockerProbe;

    const projectInspection = await inspectProjectConfig(projectPath, homeDir, {
      allowNetworkCheck: !parsed.offline,
      fetchFn: deps.fetchFn,
      fetcher: deps.fetcher,
    });

    const report: DoctorReport = {
      mcp_version: MCP_SERVER_VERSION,
      node_version: process.version,
      exec_path: execPath,
      entry_script_path: entryScriptPath,
      binary_origin: detectBinaryOrigin(entryScriptPath, projectPath),
      home_dir: homeDir,
      project_path: projectPath,
      npx_cache: {
        entries: npxEntries,
        multiple_npx_caches: npxEntries.length > 1,
      },
      global_skills: skillDirs.map((dir) => ({ dir, version: readVersionStamp(dir) })),
      ide_mcp_configs: IDE_MCP_TARGETS.map((t) => inspectIdeMcpConfig(homeDir, t)),
      docker_version: dockerProbeFn(),
      graphify_graph_present: fs.existsSync(path.join(projectPath, 'graphify-out', 'graph.json')),
      project_inspection: projectInspection,
    };

    return {
      exitCode: 0,
      output: parsed.json ? formatCliJson(report) : formatDoctorText(report),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
