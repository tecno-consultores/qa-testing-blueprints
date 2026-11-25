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
  type ConnectorInspectionResult,
  GLOBAL_CONNECTOR_MAX_BYTES,
  GLOBAL_CONNECTOR_TARGETS,
  PROJECT_CONNECTOR_MAX_BYTES,
  inspectDelimitedConnector,
} from '../services/agents-connector.js';
import {
  detectExistingQa11xSkillDirs,
  evaluateUpdateStatus,
  readVersionStamp,
  readVersionStampData,
} from '../services/version-manager.js';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import type { CompanionMcpDiscoverySummary, ProjectAuditResult } from '../types.js';
import { detectCompanionMcps } from '../utils/companionMcpDetector.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
  ANTIGRAVITY_FALLBACK_MCP_REL_PATH,
  getDoctorIdeMcpTargets,
  type IdeMcpTargetSpec,
} from '../utils/ideConfigPaths.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  isSameResolvedDir,
  matchFlagValue,
  resolveCliProjectPath,
  resolveComparablePath,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';
import { type DockerHostHealth, probeDockerHostHealth } from './dockerHealthProbe.js';

const PREFIX_ERROR = '❌ [doctor]';
const UTF8_ENCODING = 'utf-8';
const FLAG_PROJECT_PATH = '--project-path';
const FLAG_PROJECT_PATH_SHORT = '-p';
const FLAG_DIR = '--dir';
const FLAG_OFFLINE = '--offline';
const FLAG_JSON = '--json';
const NODE_MODULES_DIR = 'node_modules';
const QA_11X_TOKEN = 'qa-11x';
const PKG_SCOPE = '@sinfallas';
const PKG_NAME = 'mcp-qa-11x';
const PACKAGE_JSON_FILE = 'package.json';
const UNKNOWN_VALUE = 'unknown';

export const DOCTOR_HELP_TEXT = renderSubcommandHelpText('doctor', 'en');

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
  readonly platform?: NodeJS.Platform;
  readonly execPath?: string;
  readonly entryScriptPath?: string;
  readonly fetcher?: GitHubFetcher;
  readonly fetchFn?: typeof fetch;
  readonly dockerProbeFn?: () => string | null;
  readonly dockerHealthProbeFn?: () => DockerHostHealth;
}

export interface GlobalConnectorHealth extends ConnectorInspectionResult {
  readonly agent: string;
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
  readonly global_connectors: readonly GlobalConnectorHealth[];
  readonly project_connector: ConnectorInspectionResult | null;
  readonly ide_mcp_configs: readonly IdeMcpConfigStatus[];
  readonly ide_config_warnings: readonly string[];
  readonly stamp_drift_warnings: readonly string[];
  readonly docker_version: string | null;
  readonly docker_daemon_ok: boolean;
  readonly docker_health?: DockerHostHealth;
  readonly companion_mcps: CompanionMcpDiscoverySummary;
  readonly blockers: readonly string[];
  readonly graphify_graph_present: boolean;
  readonly project_inspection: ProjectAuditResult;
}

interface ParsedDoctorArgs {
  rawDir: string | undefined;
  offline: boolean;
  json: boolean;
}

const DOCTOR_VALUE_FLAGS = new Set([FLAG_PROJECT_PATH, FLAG_PROJECT_PATH_SHORT, FLAG_DIR]);
const DOCTOR_BOOL_FLAGS: Readonly<Record<string, (state: ParsedDoctorArgs) => void>> = {
  [FLAG_OFFLINE]: (state) => {
    state.offline = true;
  },
  [FLAG_JSON]: (state) => {
    state.json = true;
  },
};

function applyDoctorToken(
  args: readonly string[],
  index: number,
  state: ParsedDoctorArgs
): number {
  const arg = pickAt(args, index);
  const boolAction = Object.hasOwn(DOCTOR_BOOL_FLAGS, arg) ? DOCTOR_BOOL_FLAGS[arg] : undefined;
  if (boolAction) {
    boolAction(state);
    return 0;
  }
  const matched = matchFlagValue(args, index, DOCTOR_VALUE_FLAGS);
  if (matched) {
    state.rawDir = matched.value;
    return matched.consumed;
  }
  if (arg.startsWith('-')) {
    throw new Error(`Opción desconocida en doctor: '${arg}'.`);
  }
  if (state.rawDir !== undefined) {
    throw new Error(`Argumento posicional inesperado: '${arg}'.`);
  }
  state.rawDir = arg;
  return 0;
}

function parseDoctorArgs(args: readonly string[]): ParsedDoctorArgs {
  const state: ParsedDoctorArgs = {
    rawDir: undefined,
    offline: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    i += applyDoctorToken(args, i, state);
  }
  return state;
}

function resolveCanonicalComparePath(targetPath: string): string {
  const abs = path.resolve(targetPath);
  try {
    return fs.realpathSync(abs);
  } catch (err: unknown) {
    reportDebugCatchError('doctor.resolveCanonicalComparePath', err);
    return abs;
  }
}

function detectBinaryOrigin(entryScript: string, projectPath: string): BinaryOrigin {
  if (entryScript.includes('/.npm/_npx/') || entryScript.includes('\\.npm\\_npx\\')) {
    return 'npx-cache';
  }
  if (!entryScript) {
    return 'local-workspace';
  }
  const resolvedEntry = resolveCanonicalComparePath(entryScript);
  const resolvedProject = resolveCanonicalComparePath(projectPath);
  const insideProject =
    resolvedEntry === resolvedProject ||
    resolvedEntry.startsWith(`${resolvedProject}${path.sep}`);
  if (resolvedEntry.includes(`${path.sep}${NODE_MODULES_DIR}${path.sep}`) || !insideProject) {
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

const IDE_MCP_TARGETS = getDoctorIdeMcpTargets();

const TEXT_CONFIG_EXTS = ['.toml', '.yaml', '.yml'] as const;
const TOML_HEADER_LINE_RE = /^\s*\[{1,2}[^\]]+\]{1,2}\s*$/;
const YAML_OR_TOML_KEY_PREFIX_RE = /^\s*[A-Za-z0-9_.-]+\s*(?:=|:(?:\s|$))/;
const SCOPED_PKG_NAME = `${PKG_SCOPE}/${PKG_NAME}`;

function isPkgSpecToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    lower === SCOPED_PKG_NAME ||
    lower.startsWith(`${SCOPED_PKG_NAME}@`) ||
    lower === PKG_NAME ||
    lower.startsWith(`${PKG_NAME}@`)
  );
}

function isTextConfigFile(filePath: string): boolean {
  return TEXT_CONFIG_EXTS.some((ext) => filePath.endsWith(ext));
}

function stripHashCommentFromLine(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === '\\' && quote === '"') {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function stripHashComments(rawText: string): string {
  return rawText.split(/\r?\n/).map(stripHashCommentFromLine).join('\n');
}

function readIdeConfigContainsQa(fullPath: string, client: string): boolean {
  try {
    const raw = fs.readFileSync(fullPath, UTF8_ENCODING);
    const active = isTextConfigFile(fullPath) ? stripHashComments(raw) : raw;
    return active.includes(QA_11X_TOKEN);
  } catch (err: unknown) {
    reportDebugCatchError(`doctor.inspectIdeMcpConfig(${client})`, err);
    return false;
  }
}

function detectQaInCandidates(
  candidatePaths: readonly string[],
  client: string
): { readonly firstExistingPath: string | null; readonly matchedPath: string | null } {
  const existingPaths = candidatePaths.filter((p) => fs.existsSync(p));
  const matchedPath = existingPaths.find((p) => readIdeConfigContainsQa(p, client)) ?? null;
  return { firstExistingPath: existingPaths[0] ?? null, matchedPath };
}

function inspectIdeMcpConfig(homeDir: string, target: IdeMcpTargetSpec): IdeMcpConfigStatus {
  const candidatePaths = target.relPaths.map((relPath) => resolveSafeChildPath(homeDir, relPath));
  const canonicalPath = pickAt(candidatePaths, 0);
  const { firstExistingPath, matchedPath } = detectQaInCandidates(candidatePaths, target.client);
  return {
    client: target.client,
    path: matchedPath ?? firstExistingPath ?? canonicalPath,
    exists: firstExistingPath !== null,
    has_qa_11x: matchedPath !== null,
  };
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

function inspectGlobalConnectors(homeDir: string): GlobalConnectorHealth[] {
  return GLOBAL_CONNECTOR_TARGETS.map((target) => {
    const filePath = resolveSafeChildPath(homeDir, target.relFile);
    return {
      agent: target.agent,
      ...inspectDelimitedConnector(filePath, GLOBAL_CONNECTOR_MAX_BYTES),
    };
  });
}

function formatUnpinnedWarning(filePath: string, pkgArg: string): string {
  return `IDE MCP '${filePath}' usa '${pkgArg}' sin versión fija (recomendado @${MCP_SERVER_VERSION}).`;
}

function isUnpinnedPackageArg(pkgArg: string): boolean {
  return pkgArg.includes('@latest') || !pkgArg.includes(`${PKG_NAME}@`);
}

function checkQaServerEntryPinning(
  filePath: string,
  serverKey: string,
  entryRaw: unknown
): string | null {
  if (!/qa[-_]?11x/i.test(serverKey) || typeof entryRaw !== 'object' || entryRaw === null) {
    return null;
  }
  const argsRaw = (entryRaw as { args?: unknown }).args;
  const argsList = Array.isArray(argsRaw) ? argsRaw.map(String) : [];
  const pkgArg = argsList.find((item) => item.includes(PKG_NAME));
  if (!pkgArg) return null;
  return isUnpinnedPackageArg(pkgArg) ? formatUnpinnedWarning(filePath, pkgArg) : null;
}

function inspectJsonPinning(filePath: string, rawText: string): string | null {
  const raw = JSON.parse(rawText) as Record<string, unknown>;
  const serverMaps = [raw.mcpServers, raw.servers].filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
  );
  for (const servers of serverMaps) {
    for (const [serverKey, entryRaw] of Object.entries(servers)) {
      const warn = checkQaServerEntryPinning(filePath, serverKey, entryRaw);
      if (warn) return warn;
    }
  }
  return null;
}

function extractTextConfigValueTokens(rawText: string): string[] {
  const cleanedLines = stripHashComments(rawText)
    .split('\n')
    .filter((line) => !TOML_HEADER_LINE_RE.test(line))
    .map((line) => line.replace(YAML_OR_TOML_KEY_PREFIX_RE, ' '));
  return cleanedLines
    .join('\n')
    .split(/[\s"',[\]{}()]+/)
    .filter((token) => isPkgSpecToken(token));
}

function inspectTextConfigPinning(filePath: string, rawText: string): string | null {
  const tokens = extractTextConfigValueTokens(rawText);
  const unpinned = tokens.find((token) => isUnpinnedPackageArg(token));
  return unpinned ? formatUnpinnedWarning(filePath, unpinned) : null;
}

function inspectQaServerPinningSafe(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const rawText = fs.readFileSync(filePath, UTF8_ENCODING);
    if (filePath.endsWith('.json')) {
      return inspectJsonPinning(filePath, rawText);
    }
    if (isTextConfigFile(filePath)) {
      return inspectTextConfigPinning(filePath, rawText);
    }
    return null;
  } catch (err: unknown) {
    reportDebugCatchError('doctor.inspectQaServerPinningSafe', err);
    return null;
  }
}

function collectIdeConfigWarnings(
  homeDir: string,
  ideConfigs: readonly IdeMcpConfigStatus[]
): string[] {
  const warnings: string[] = [];
  const antigravityMain = resolveSafeChildPath(homeDir, ANTIGRAVITY_CANONICAL_MCP_REL_PATH);
  const antigravityFallback = resolveSafeChildPath(homeDir, ANTIGRAVITY_FALLBACK_MCP_REL_PATH);
  if (fs.existsSync(antigravityMain) && fs.existsSync(antigravityFallback)) {
    warnings.push(
      'Detectados dos archivos mcp_config.json en ~/.gemini/ (antigravity/ y config/); consolida en ~/.gemini/antigravity/mcp_config.json.'
    );
  }
  for (const cfg of ideConfigs) {
    const pinWarn = cfg.exists && cfg.has_qa_11x ? inspectQaServerPinningSafe(cfg.path) : null;
    if (pinWarn) warnings.push(pinWarn);
  }
  return warnings;
}

function collectStampDriftWarnings(
  skillDirs: readonly string[],
  projectPath: string,
  inHomeMode: boolean
): string[] {
  const warnings: string[] = [];
  const checkDirs = inHomeMode ? skillDirs : [...skillDirs, path.join(projectPath, '.agents')];
  for (const dir of checkDirs) {
    const data = readVersionStampData(dir);
    const hasDrift =
      Boolean(data?.blueprint_version && data?.mcp_version) &&
      data?.blueprint_version !== data?.mcp_version;
    if (hasDrift) {
      warnings.push(
        `Deriva en ${dir}/.qa-11x-version: blueprint=${data?.blueprint_version} != mcp=${data?.mcp_version}.`
      );
    }
  }
  return warnings;
}

function formatConnectorHealthLine(gc: GlobalConnectorHealth): string {
  const budgetNote = gc.exceeds_budget ? ' ⚠️>1536B' : '';
  const status = gc.exists ? `${gc.block_bytes}B${budgetNote}` : 'no encontrado';
  return `    - ${gc.agent}: ${status} (${gc.path})`;
}

function appendDoctorConnectorAndIdeLines(lines: string[], report: DoctorReport): void {
  lines.push('  Conectores globales $HOME:');
  for (const gc of report.global_connectors) {
    lines.push(formatConnectorHealthLine(gc));
  }
  if (report.project_connector?.exists) {
    const projWarn = report.project_connector.exceeds_budget ? ' ⚠️>1536B' : '';
    lines.push(`  Conector proyecto AGENTS.md: ${report.project_connector.block_bytes}B${projWarn}`);
  }
  lines.push('  Configuración MCP por IDE:');
  for (const cfg of report.ide_mcp_configs) {
    lines.push(`    - ${cfg.client}: ${formatIdeMcpStatus(cfg)} (${cfg.path})`);
  }
  for (const warn of [
    ...report.ide_config_warnings,
    ...report.stamp_drift_warnings,
    ...(report.docker_health?.warnings ?? []),
  ]) {
    lines.push(`  ⚠️ ${warn}`);
  }
}

function formatDoctorText(report: DoctorReport): string {
  const isHomeScope = isSameResolvedDir(report.project_path, report.home_dir);
  const projectLine = isHomeScope
    ? `  Proyecto: ${report.project_path} (modo global $HOME; stacks: ninguno)`
    : `  Proyecto: ${report.project_path} (stacks: ${report.project_inspection.detected_stacks.join(', ') || 'ninguno'})`;
  const multiCacheNote = report.npx_cache.multiple_npx_caches
    ? ' (⚠️ múltiples cachés detectados; ejecuta upgrade --cache-only)'
    : '';
  const detectedCompanions = report.companion_mcps.capabilities
    .filter((cap) => cap.detected)
    .flatMap((cap) => cap.matched_servers);
  const companionSummary =
    detectedCompanions.length > 0 ? detectedCompanions.join(', ') : 'ninguno';
  const lines: string[] = [
    `🩺 [QA-11X Doctor] MCP v${report.mcp_version} | origin=${report.binary_origin} | node=${report.node_version}`,
    projectLine,
    `  Docker (Rule Zero obligatorio): ${report.docker_version ?? 'NO DETECTADO (BLOQUEANTE)'} | Graphify AST: ${report.graphify_graph_present ? 'presente' : 'ausente'}`,
    `  Companion MCPs: ${companionSummary}`,
    `  Cachés _npx: ${report.npx_cache.entries.length}${multiCacheNote}`,
  ];
  for (const blocker of report.blockers) {
    lines.push(`  ❌ ${blocker}`);
  }
  for (const cache of report.npx_cache.entries) {
    lines.push(`    - ${cache.hashDir}: v${cache.version}`);
  }
  lines.push(`  Skills globales detectados (${report.global_skills.length}):`);
  for (const skill of report.global_skills) {
    lines.push(`    - ${skill.dir}: ${skill.version ?? 'sin estampa'}`);
  }
  appendDoctorConnectorAndIdeLines(lines, report);
  if (report.project_inspection.update_available?.agent_notice) {
    lines.push(`  Actualización: ${report.project_inspection.update_available.agent_notice}`);
  }
  return lines.join('\n');
}

async function buildHomeDoctorProjectInspection(
  homeDir: string,
  offline: boolean,
  deps: DoctorCliDeps
): Promise<ProjectAuditResult> {
  const updateAvailable = await evaluateUpdateStatus({
    projectPath: path.join(homeDir, '.agents', '__global__'),
    homeDir,
    allowNetworkCheck: !offline,
    fetchFn: deps.fetchFn,
    fetcher: deps.fetcher,
  });
  return {
    project_path: homeDir,
    detected_stacks: [],
    has_docker_compose_qa: false,
    has_makefile: false,
    has_lefthook: false,
    has_agents_dir: false,
    has_testing_md: false,
    has_changelog_md: false,
    strict_flags: {
      mypy_strict: false,
      tsconfig_strict: false,
      npmrc_ignore_scripts: false,
    },
    missing_11x_files: [],
    recommended_next_tool: 'fetch_blueprint_bundle',
    update_available: updateAvailable,
  };
}

function resolveDoctorDockerHealth(
  deps: DoctorCliDeps,
  dockerVersion: string | null
): DockerHostHealth | undefined {
  if (deps.dockerHealthProbeFn !== undefined) {
    return deps.dockerHealthProbeFn();
  }
  if (dockerVersion !== null && deps.dockerProbeFn === undefined) {
    return probeDockerHostHealth();
  }
  return undefined;
}

async function buildDoctorReport(
  parsed: ParsedDoctorArgs,
  deps: DoctorCliDeps
): Promise<DoctorReport> {
  const homeDir = resolveSafeHomeDir(deps.homeDir);
  const rawCwd = deps.cwd ?? process.cwd();
  const inHomeMode = parsed.rawDir === undefined && isSameResolvedDir(rawCwd, homeDir);
  const projectPath = inHomeMode
    ? resolveComparablePath(homeDir)
    : resolveCliProjectPath(parsed.rawDir, rawCwd);
  const entryScriptPath = deps.entryScriptPath ?? pickAt(process.argv, 1);
  const execPath = deps.execPath ?? process.execPath;
  const npxEntries = scanNpxCacheEntries(homeDir);
  const skillDirs = detectExistingQa11xSkillDirs(homeDir);
  const dockerProbeFn = deps.dockerProbeFn ?? defaultDockerProbe;

  const projectInspection = inHomeMode
    ? await buildHomeDoctorProjectInspection(projectPath, parsed.offline, deps)
    : await inspectProjectConfig(projectPath, homeDir, {
        allowNetworkCheck: !parsed.offline,
        fetchFn: deps.fetchFn,
        fetcher: deps.fetcher,
      });

  const ideTargets =
    deps.platform !== undefined ? getDoctorIdeMcpTargets(deps.platform) : IDE_MCP_TARGETS;
  const ideConfigs = ideTargets.map((t) => inspectIdeMcpConfig(homeDir, t));
  const projectConnector = inHomeMode
    ? null
    : inspectDelimitedConnector(path.join(projectPath, 'AGENTS.md'), PROJECT_CONNECTOR_MAX_BYTES);

  const dockerVersion = dockerProbeFn();
  const dockerDaemonOk = dockerVersion !== null;
  const dockerHealth = resolveDoctorDockerHealth(deps, dockerVersion);
  const companionMcps =
    projectInspection.companion_mcps ?? detectCompanionMcps(homeDir, deps.platform);
  const blockers: string[] = dockerDaemonOk
    ? []
    : [
        '[RULE-ZERO] Docker Engine operativo es obligatorio e innegociable para QA-11X (`docker info` falló). Instala o inicia el daemon Docker antes de ejecutar QA-11X.',
      ];

  return {
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
    global_connectors: inspectGlobalConnectors(homeDir),
    project_connector: projectConnector,
    ide_mcp_configs: ideConfigs,
    ide_config_warnings: collectIdeConfigWarnings(homeDir, ideConfigs),
    stamp_drift_warnings: collectStampDriftWarnings(skillDirs, projectPath, inHomeMode),
    docker_version: dockerVersion,
    docker_daemon_ok: dockerDaemonOk,
    ...(dockerHealth ? { docker_health: dockerHealth } : {}),
    companion_mcps: companionMcps,
    blockers,
    graphify_graph_present:
      !inHomeMode && fs.existsSync(path.join(projectPath, 'graphify-out', 'graph.json')),
    project_inspection: projectInspection,
  };
}

export async function runDoctorCli(
  args: readonly string[],
  deps: DoctorCliDeps = {}
): Promise<CliCommandOutput> {
  if (hasHelpFlag(args)) {
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('doctor', resolveCliHelpLang(args)),
    };
  }
  try {
    const parsed = parseDoctorArgs(args);
    const report = await buildDoctorReport(parsed, deps);
    return {
      exitCode: report.blockers.length > 0 ? 1 : 0,
      output: parsed.json ? formatCliJson(report) : formatDoctorText(report),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `${PREFIX_ERROR} ${message}`, isError: true };
  }
}
