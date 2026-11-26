// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubFetcher, resolveSafeChildPath, resolveSafeHomeDir } from '../services/github-fetcher.js';
import { SurgicalMerger } from '../services/surgical-merger.js';
import {
  VERSION_STAMP_FILENAME,
  pruneRetiredFilesInCanonicalSkillDirs,
  writeVersionStamp,
} from '../services/version-manager.js';
import { assertNoSymlinkSegments, assertNotSymlinkPath } from '../security/pathRealResolver.js';
import { initOrAppendAgentsMd, syncGlobalAgentConnectors } from './init-agents-md.js';
import { parseAgentsOption } from '../tools/initOrAppendAgentsMd.js';
import { reconcileAgentsGovernance } from './reconcile-agents.js';
import { consolidateLooseBackups } from './reconcile/repoHygiene.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import {
  hasHelpFlag,
  isSameResolvedDir,
  matchFlagValue,
  resolveCliProjectPath,
  resolveComparablePath,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';
import type { AgentsTargetSpec, Manifest, ManifestFileEntry, OutputLanguageMode } from '../types.js';

const EXCLUDED_COMMON_SCRIPT_PATHS = new Set([
  'scripts/publicar-mcp.sh',
  'scripts/probar-mcp-example.sh',
  'scripts/install-skill.sh',
  '.env.example',
]);
const MONOREPO_ONLY_GOV_SCRIPT_PATHS = new Set([
  '.agents/scripts/bump_version_11x.py',
  '.agents/scripts/sync_governance.py',
  'scripts/install-skill.sh',
]);

const AGENTS_DIR_NAME = '.agents';
const SKILLS_DIR_NAME = 'skills';
const SKILLS_PREFIX = '.agents/skills/';
const AGENT_SCRIPTS_PREFIX = '.agents/scripts/';
const AGENT_SCHEMAS_PREFIX = '.agents/schemas/';
const ACTIVE_TASK_EXAMPLE_PATH = '.agents/ACTIVE_TASK.md.example';
const GEMINI_DIR_NAME = '.gemini';
const GEMINI_ANTIGRAVITY_DIR = 'antigravity';
const CLAUDE_DIR_NAME = '.claude';
const HERMES_DIR_NAME = '.hermes';
const CURSOR_DIR_NAME = '.cursor';
const CODEX_DIR_NAME = '.codex';
const WINDSURF_REL_DIR = path.join('.codeium', 'windsurf');
const OPENCODE_REL_DIR = path.join('.config', 'opencode');
const COPILOT_DIR_NAME = '.copilot';
const UTF8 = 'utf-8';

export const INSTALL_SKILL_HELP_TEXT = renderSubcommandHelpText('install-skill', 'en');

interface InstallSkillCliOptions {
  targetArg: string;
  projectPathArg?: string;
  lang: OutputLanguageMode;
  explicitLang?: OutputLanguageMode;
  agents?: AgentsTargetSpec;
  includeScripts: boolean;
  initAgents: boolean;
  reconcile: boolean;
  dryRun: boolean;
  help: boolean;
}

const INSTALL_SKILL_VALUE_FLAGS = new Set([
  '--target',
  '-t',
  '--lang',
  '-l',
  '--agents',
  '-a',
  '--project-path',
  '-p',
  '--dir',
]);
const INSTALL_SKILL_BOOL_FLAGS = new Set([
  '--include-scripts',
  '--init-agents',
  '--reconcile',
  '--dry-run',
  '--help',
  '-h',
]);

function formatMissingInstallOption(flag: string): string {
  return `Falta el valor requerido para la opción '${flag}'.`;
}

function validateSingleInstallToken(args: string[], index: number): number {
  const arg = pickAt(args, index);
  if (INSTALL_SKILL_BOOL_FLAGS.has(arg)) {
    return 0;
  }
  const valFlag = matchFlagValue(args, index, INSTALL_SKILL_VALUE_FLAGS, formatMissingInstallOption);
  if (valFlag) {
    return valFlag.consumed;
  }
  if (arg.startsWith('-')) {
    throw new Error(`Opción CLI desconocida en install-skill: '${arg}'. Ejecuta con --help para ver las opciones válidas.`);
  }
  throw new Error(`Argumento posicional inesperado en install-skill: '${arg}'.`);
}

function validateAndParseInstallSkillArgs(args: string[]): InstallSkillCliOptions {
  for (let i = 0; i < args.length; i++) {
    i += validateSingleInstallToken(args, i);
  }
  const explicitLang = parseExplicitLangArg(args);
  return {
    targetArg: parseTargetArg(args),
    projectPathArg: parseProjectPathArg(args),
    lang: explicitLang ?? parseLangArg(args),
    explicitLang,
    agents: parseAgentsArg(args),
    includeScripts: args.includes('--include-scripts'),
    initAgents: args.includes('--init-agents'),
    reconcile: args.includes('--reconcile'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function findLastFlagValue(args: readonly string[], flags: readonly string[]): string | undefined {
  const allowed = new Set(flags);
  let found: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const matched = matchFlagValue(args, i, allowed, formatMissingInstallOption);
    if (matched) {
      found = matched.value;
      i += matched.consumed;
    }
  }
  return found;
}

function parseTargetArg(args: string[]): string {
  return findLastFlagValue(args, ['--target', '-t']) ?? (process.env.QA_SKILL_TARGET || 'auto');
}

function parseProjectPathArg(args: string[]): string | undefined {
  return findLastFlagValue(args, ['--project-path', '-p', '--dir']);
}

// eslint-disable-next-line sonarjs/function-return-type -- AgentsTargetSpec intentionally unions 'auto' | 'all' modes with SupportedAiAgentId[]
export function parseAgentsArg(args: string[]): AgentsTargetSpec | undefined {
  const allowed = new Set(['--agents', '-a']);
  let latestValue: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const matched = matchFlagValue(args, i, allowed, formatMissingInstallOption);
    if (matched) {
      latestValue = matched.value;
    }
  }
  return latestValue !== undefined ? parseAgentsOption(latestValue) : undefined;
}

const VALID_LANG_MODES = new Set<string>(['auto', 'es', 'en']);

function resolveRawLangInput(args: string[]): string {
  const rawLang = findLastFlagValue(args, ['--lang', '-l']) ?? process.env.QA_OUTPUT_LANG;
  return rawLang && rawLang !== 'undefined' ? rawLang : 'auto';
}

function parseExplicitLangArg(args: string[]): OutputLanguageMode | undefined {
  const rawLang = findLastFlagValue(args, ['--lang', '-l']) ?? process.env.QA_OUTPUT_LANG;
  if (!rawLang || rawLang === 'undefined') {
    return undefined;
  }
  return parseLangArg(args);
}

export function parseLangArg(args: string[]): OutputLanguageMode {
  const rawLang = resolveRawLangInput(args);
  const selectedLang = rawLang.trim().toLowerCase();
  if (!VALID_LANG_MODES.has(selectedLang)) {
    throw new Error(`Modo de idioma no válido: '${rawLang}'. Valores permitidos: auto, es, en.`);
  }
  return selectedLang as OutputLanguageMode;
}

const GLOBAL_AGENT_DETECTION_SPECS: ReadonlyArray<{
  readonly markerRel: string;
  readonly skillsRel: string;
}> = [
  { markerRel: path.join(GEMINI_DIR_NAME, 'settings.json'), skillsRel: path.join(GEMINI_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: path.join(GEMINI_DIR_NAME, SKILLS_DIR_NAME), skillsRel: path.join(GEMINI_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: CLAUDE_DIR_NAME, skillsRel: path.join(CLAUDE_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: HERMES_DIR_NAME, skillsRel: path.join(HERMES_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: CURSOR_DIR_NAME, skillsRel: path.join(CURSOR_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: WINDSURF_REL_DIR, skillsRel: path.join(WINDSURF_REL_DIR, SKILLS_DIR_NAME) },
  { markerRel: CODEX_DIR_NAME, skillsRel: path.join(CODEX_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: OPENCODE_REL_DIR, skillsRel: path.join(OPENCODE_REL_DIR, SKILLS_DIR_NAME) },
  { markerRel: COPILOT_DIR_NAME, skillsRel: path.join(COPILOT_DIR_NAME, SKILLS_DIR_NAME) },
  { markerRel: path.join(AGENTS_DIR_NAME, SKILLS_DIR_NAME), skillsRel: path.join(AGENTS_DIR_NAME, SKILLS_DIR_NAME) },
];

function resolveSafeGlobalSkillDir(homeDir: string, relDir: string): string {
  const resolved = resolveSafeChildPath(homeDir, relDir);
  assertNoSymlinkSegments(homeDir, relDir);
  return resolved;
}

function resolveGeminiSkillDirs(homeDir: string): string[] {
  const dirs = [
    resolveSafeGlobalSkillDir(homeDir, path.join(GEMINI_DIR_NAME, 'config', SKILLS_DIR_NAME)),
  ];
  const antigravityRel = path.join(GEMINI_DIR_NAME, GEMINI_ANTIGRAVITY_DIR);
  if (fs.existsSync(path.join(homeDir, antigravityRel))) {
    assertNoSymlinkSegments(homeDir, antigravityRel);
    dirs.push(resolveSafeGlobalSkillDir(homeDir, path.join(antigravityRel, SKILLS_DIR_NAME)));
  }
  return dirs;
}

function detectInstalledGlobalAgentDirs(homeDir: string): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    dirs.push(...resolveGeminiSkillDirs(homeDir));
  }
  for (const spec of GLOBAL_AGENT_DETECTION_SPECS) {
    if (fs.existsSync(path.join(homeDir, spec.markerRel))) {
      dirs.push(resolveSafeGlobalSkillDir(homeDir, spec.skillsRel));
    }
  }
  return dirs;
}

function isHomeDirectory(homeDir: string, cwd: string): boolean {
  return isSameResolvedDir(cwd, homeDir);
}

function resolveSafeWorkspaceSkillsDir(cwd: string): string {
  resolveSafeChildPath(cwd, AGENTS_DIR_NAME);
  const relSkills = path.join(AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  const safeSkills = resolveSafeChildPath(cwd, relSkills);
  assertNoSymlinkSegments(cwd, relSkills);
  return safeSkills;
}

function resolveGlobalOrFallbackTargets(homeDir: string): string[] {
  const globalDirs = detectInstalledGlobalAgentDirs(homeDir);
  if (globalDirs.length > 0) {
    return Array.from(new Set(globalDirs));
  }
  return [resolveSafeGlobalSkillDir(homeDir, path.join(AGENTS_DIR_NAME, SKILLS_DIR_NAME))];
}

function resolveAllGlobalAgentDirs(homeDir: string): string[] {
  const detected = detectInstalledGlobalAgentDirs(homeDir);
  if (detected.length > 0) {
    return Array.from(new Set(detected));
  }
  return [
    ...resolveGeminiSkillDirs(homeDir),
    ...GLOBAL_AGENT_DETECTION_SPECS.map((spec) =>
      resolveSafeGlobalSkillDir(homeDir, spec.skillsRel)
    ),
  ];
}

const VALID_SKILL_TARGETS = new Set<string>([
  'workspace',
  'local',
  'cursor',
  'antigravity',
  'gemini-cli',
  'claude',
  'hermes',
  'windsurf',
  'codex',
  'opencode',
  'copilot',
  'agents',
  'all',
  'auto',
]);

export function assertValidSkillTarget(targetArg: string): void {
  if (!VALID_SKILL_TARGETS.has(targetArg)) {
    throw new Error(
      `Destino --target inválido: '${targetArg}'. Valores permitidos: auto, workspace, antigravity, gemini-cli, claude, cursor, windsurf, codex, hermes, opencode, copilot, agents, all.`
    );
  }
}

const SINGLE_GLOBAL_SKILL_TARGET_RELS: Readonly<Record<string, string>> = {
  cursor: path.join(CURSOR_DIR_NAME, SKILLS_DIR_NAME),
  'gemini-cli': path.join(GEMINI_DIR_NAME, SKILLS_DIR_NAME),
  claude: path.join(CLAUDE_DIR_NAME, SKILLS_DIR_NAME),
  hermes: path.join(HERMES_DIR_NAME, SKILLS_DIR_NAME),
  windsurf: path.join(WINDSURF_REL_DIR, SKILLS_DIR_NAME),
  codex: path.join(CODEX_DIR_NAME, SKILLS_DIR_NAME),
  opencode: path.join(OPENCODE_REL_DIR, SKILLS_DIR_NAME),
  copilot: path.join(COPILOT_DIR_NAME, SKILLS_DIR_NAME),
  agents: path.join(AGENTS_DIR_NAME, SKILLS_DIR_NAME),
};

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  assertValidSkillTarget(targetArg);
  if (Object.hasOwn(SINGLE_GLOBAL_SKILL_TARGET_RELS, targetArg)) {
    return [resolveSafeGlobalSkillDir(homeDir, SINGLE_GLOBAL_SKILL_TARGET_RELS[targetArg]!)];
  }
  if (targetArg === 'antigravity') {
    return resolveGeminiSkillDirs(homeDir);
  }
  if (targetArg === 'all') {
    return Array.from(new Set(resolveAllGlobalAgentDirs(homeDir)));
  }
  if (targetArg === 'auto') {
    return resolveGlobalOrFallbackTargets(homeDir);
  }
  return [resolveSafeWorkspaceSkillsDir(cwd)];
}

interface WriteDownloadedSkillsInput {
  readonly destDirs: string[];
  readonly files: Array<{ relSkillPath: string; content: string }>;
  readonly manifestRelSkillPaths: ReadonlySet<string>;
  readonly blueprintVersion: string;
  readonly workspaceCwd: string;
  readonly homeDir: string;
  readonly log: (message: string) => void;
}

function validateSkillDestDir(dest: string, workspaceCwd: string, homeDir: string): string {
  assertNotSymlinkPath(dest);
  assertNotSymlinkPath(path.join(dest, VERSION_STAMP_FILENAME));
  const expectedWorkspaceSkills = path.resolve(workspaceCwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  if (path.resolve(dest) === expectedWorkspaceSkills) {
    resolveSafeWorkspaceSkillsDir(workspaceCwd);
    return workspaceCwd;
  }
  const relSkillDir = path.relative(path.resolve(homeDir), path.resolve(dest));
  resolveSafeGlobalSkillDir(homeDir, relSkillDir);
  return homeDir;
}

function writeDownloadedSkills(input: WriteDownloadedSkillsInput): void {
  const {
    destDirs,
    files,
    manifestRelSkillPaths,
    blueprintVersion,
    workspaceCwd,
    homeDir,
    log,
  } = input;
  for (const dest of destDirs) {
    const confinementRoot = validateSkillDestDir(dest, workspaceCwd, homeDir);
    for (const item of files) {
      const fullPath = resolveSafeChildPath(dest, item.relSkillPath);
      assertNoSymlinkSegments(dest, item.relSkillPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, item.content, UTF8);
    }
    pruneRetiredFilesInCanonicalSkillDirs(dest, manifestRelSkillPaths, confinementRoot);
    writeVersionStamp(dest, blueprintVersion, undefined, confinementRoot);
    log(`✅ Skills instaladas con éxito en: ${dest}`);
  }
}

function ensureScriptExecutableMode(fullPath: string): void {
  if (fullPath.endsWith('.sh') || fullPath.endsWith('.py')) {
    // eslint-disable-next-line sonarjs/file-permissions -- Shared repo scripts require 0o755 so non-root Docker UIDs can execute them
    fs.chmodSync(fullPath, 0o755);
  }
}

function writeScriptWithBak(fullPath: string, content: string): void {
  assertNotSymlinkPath(fullPath);
  const bakPath = `${fullPath}.bak`;
  assertNotSymlinkPath(bakPath);
  if (fs.existsSync(fullPath)) {
    const existingContent = fs.readFileSync(fullPath, UTF8);
    if (existingContent !== content) {
      fs.copyFileSync(fullPath, bakPath);
    }
  }
  fs.writeFileSync(fullPath, content, UTF8);
  ensureScriptExecutableMode(fullPath);
}

async function mergeExistingScriptEntry(
  cwd: string,
  entry: ManifestFileEntry,
  fullPath: string,
  content: string
): Promise<void> {
  const targetRel = entry.target_name || entry.path;
  const backupFile = `${fullPath}.11x-backup`;
  assertNotSymlinkPath(fullPath);
  assertNotSymlinkPath(backupFile);
  const merger = new SurgicalMerger();
  await merger.mergeFiles(
    cwd,
    [
      {
        path: entry.path,
        target_name: targetRel,
        merge_strategy: entry.merge_strategy,
        content,
        sha256_verified: true,
      },
    ],
    { dryRun: false, createBackup: true }
  );
  if (fs.existsSync(backupFile)) {
    try {
      assertNotSymlinkPath(backupFile);
      fs.chmodSync(backupFile, 0o600);
    } catch (err: unknown) {
      reportDebugCatchError(`installSkill.chmodBackup(${targetRel})`, err);
    }
  }
}

function protectCustomRepoScript(
  fullPath: string,
  targetRel: string,
  content: string,
  log: (message: string) => void
): boolean {
  if (!targetRel.startsWith('scripts/') || !fs.existsSync(fullPath)) {
    return false;
  }
  assertNotSymlinkPath(fullPath);
  const existing = fs.readFileSync(fullPath, UTF8);
  if (existing === content) {
    return false;
  }
  const incomingPath = `${fullPath}.11x-incoming`;
  assertNotSymlinkPath(incomingPath);
  fs.writeFileSync(incomingPath, content, UTF8);
  fs.chmodSync(incomingPath, 0o600);
  log(
    `⚠️ [Scripts 11X] '${targetRel}' tiene personalizaciones locales y se preservó; revisa '${targetRel}.11x-incoming' (usa .agents/limpieza.local.sh para extensiones persistentes).`
  );
  return true;
}

async function handleSpecialScriptStrategy(
  cwd: string,
  entry: ManifestFileEntry,
  fullPath: string,
  content: string
): Promise<boolean> {
  if (entry.path === ACTIVE_TASK_EXAMPLE_PATH) {
    const exampleFullPath = resolveSafeChildPath(cwd, entry.path);
    assertNoSymlinkSegments(cwd, entry.path);
    fs.writeFileSync(exampleFullPath, content, UTF8);
    return true;
  }
  if (entry.merge_strategy === 'copy_if_missing') {
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, UTF8);
      ensureScriptExecutableMode(fullPath);
    }
    return true;
  }
  if (entry.merge_strategy === 'surgical_merge' && fs.existsSync(fullPath)) {
    await mergeExistingScriptEntry(cwd, entry, fullPath, content);
    return true;
  }
  return false;
}

async function writeScriptEntry(
  cwd: string,
  entry: ManifestFileEntry,
  content: string,
  log: (message: string) => void
): Promise<void> {
  const targetRel = entry.target_name || entry.path;
  const fullPath = resolveSafeChildPath(cwd, targetRel);
  assertNoSymlinkSegments(cwd, targetRel);
  const parentDir = path.dirname(fullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  if (await handleSpecialScriptStrategy(cwd, entry, fullPath, content)) {
    return;
  }
  if (protectCustomRepoScript(fullPath, targetRel, content, log)) {
    return;
  }
  writeScriptWithBak(fullPath, content);
}

function selectScriptEntries(manifest: Manifest): ManifestFileEntry[] {
  return [
    ...(manifest.common_files || []).filter((f) => !EXCLUDED_COMMON_SCRIPT_PATHS.has(f.path)),
    ...(manifest.agent_governance_files || []).filter(
      (f) =>
        !MONOREPO_ONLY_GOV_SCRIPT_PATHS.has(f.path) &&
        (f.path.startsWith(AGENT_SCRIPTS_PREFIX) ||
          f.path.startsWith(AGENT_SCHEMAS_PREFIX) ||
          f.path === ACTIVE_TASK_EXAMPLE_PATH)
    ),
  ];
}

async function installIncludedScripts(
  cwd: string,
  manifest: Manifest,
  fetcher: GitHubFetcher,
  log: (message: string) => void = console.log
): Promise<void> {
  const scriptEntries = selectScriptEntries(manifest);
  if (scriptEntries.length === 0) {
    return;
  }

  assertNoSymlinkSegments(cwd, path.join(AGENTS_DIR_NAME, 'scripts'));
  for (const entry of scriptEntries) {
    const content = await fetcher.fetchFileContent(entry.path, entry.sha256);
    await writeScriptEntry(cwd, entry, content, log);
  }
  assertNoSymlinkSegments(cwd, AGENTS_DIR_NAME);
  writeVersionStamp(path.join(cwd, AGENTS_DIR_NAME), manifest.blueprint_version, undefined, cwd);
  log(`✔ [Scripts 11X] ${scriptEntries.length} scripts y archivos comunes instalados [0o755].`);
}

interface DryRunPlanContext {
  readonly opts: InstallSkillCliOptions;
  readonly cwd: string;
  readonly homeDir: string;
  readonly inHomeDir: boolean;
  readonly destDirs: string[];
  readonly skillCount: number;
  readonly manifest: Manifest;
  readonly log: (message: string) => void;
}

async function executeDryRunPlan(ctx: DryRunPlanContext): Promise<void> {
  const { opts, cwd, homeDir, inHomeDir, destDirs, skillCount, manifest, log } = ctx;
  log(`🔍 [DRY-RUN] Plan install-skill (v${manifest.blueprint_version}):`);
  log(`  - Destinos de skills (${destDirs.length}): ${destDirs.join(', ')}`);
  log(`  - Archivos de skills planificados: ${skillCount}`);
  const connectorPlans = syncGlobalAgentConnectors(homeDir, true, opts.explicitLang, opts.targetArg);
  for (const entry of connectorPlans) {
    if (entry.updated) {
      log(`  - Actualizaría conector global (${entry.agent}) en ${entry.path}`);
    }
  }
  if (!inHomeDir && opts.includeScripts) {
    const plannedScripts = selectScriptEntries(manifest);
    log(`  - Scripts/archivos comunes planificados: ${plannedScripts.length}`);
  }
  if (!inHomeDir && opts.initAgents) {
    const initPlan = await initOrAppendAgentsMd({
      projectPath: cwd,
      dryRun: true,
      ...(opts.explicitLang !== undefined ? { lang: opts.explicitLang } : {}),
      ...(opts.agents !== undefined ? { agents: opts.agents } : {}),
    });
    log(`  - AGENTS.md planificado (${initPlan.action}) en ${initPlan.agents_md_path}`);
  }
}

function resolveInstallWorkspaceDir(
  rawProjectPath: string | undefined,
  homeDir: string,
  baseCwd: string
): string {
  if (rawProjectPath === undefined) {
    return isHomeDirectory(homeDir, baseCwd) ? resolveComparablePath(homeDir) : baseCwd;
  }
  const candidate = path.resolve(baseCwd, rawProjectPath.normalize('NFKC').trim());
  if (isHomeDirectory(homeDir, candidate)) {
    return resolveSafeProjectPath(candidate);
  }
  return resolveCliProjectPath(rawProjectPath, baseCwd);
}

async function runPreReconcileIfEnabled(
  opts: InstallSkillCliOptions,
  cwd: string,
  inHomeDir: boolean,
  log: (message: string) => void = console.log
): Promise<void> {
  if (!opts.reconcile || inHomeDir) {
    return;
  }
  const recRes = await reconcileAgentsGovernance({ projectPath: cwd, dryRun: opts.dryRun });
  const recPrefix = opts.dryRun ? '🔍 [DRY-RUN Reconcile 11X]' : '✔ [Reconcile 11X]';
  log(
    `${recPrefix} ${recRes.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${recRes.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
  );
}

async function fetchVerifiedSkillFiles(
  resolvedFetcher: GitHubFetcher,
  skillEntries: readonly ManifestFileEntry[]
): Promise<Array<{ relSkillPath: string; content: string }>> {
  const downloadedFiles: Array<{ relSkillPath: string; content: string }> = [];
  for (const entry of skillEntries) {
    const content = await resolvedFetcher.fetchFileContent(entry.path, entry.sha256);
    const relSkillPath = entry.path.replace(/^\.agents\/skills\//, '');
    downloadedFiles.push({ relSkillPath, content });
  }
  return downloadedFiles;
}

async function runOptionalInitAgentsHook(
  opts: InstallSkillCliOptions,
  cwd: string,
  log: (message: string) => void = console.log
): Promise<void> {
  if (!opts.initAgents) {
    return;
  }
  const initResult = await initOrAppendAgentsMd({
    projectPath: cwd,
    dryRun: false,
    ...(opts.explicitLang !== undefined ? { lang: opts.explicitLang } : {}),
    ...(opts.agents !== undefined ? { agents: opts.agents } : {}),
  });
  log(`✔ [AGENTS.md] Conector procesado (${initResult.action}) en ${initResult.agents_md_path}`);
}

async function runProjectInstallHooks(params: {
  readonly opts: InstallSkillCliOptions;
  readonly cwd: string;
  readonly manifest: Manifest;
  readonly resolvedFetcher: GitHubFetcher;
  readonly log: (message: string) => void;
}): Promise<void> {
  if (params.opts.includeScripts) {
    await installIncludedScripts(
      params.cwd,
      params.manifest,
      params.resolvedFetcher,
      params.log
    );
  }
  await runOptionalInitAgentsHook(params.opts, params.cwd, params.log);
  if (params.opts.reconcile && params.opts.includeScripts) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(params.cwd, AGENTS_DIR_NAME, 'backups', timestamp);
    const consolidated = consolidateLooseBackups(params.cwd, false, backupDir);
    if (consolidated.consolidatedBackups.length > 0) {
      params.log(
        `✔ [Reconcile 11X] ${consolidated.consolidatedBackups.length} respaldo(s) suelto(s) consolidado(s) en ${backupDir}.`
      );
    }
  }
}

async function applyPostSkillInstallSteps(params: {
  readonly opts: InstallSkillCliOptions;
  readonly cwd: string;
  readonly homeDir: string;
  readonly inHomeDir: boolean;
  readonly manifest: Manifest;
  readonly resolvedFetcher: GitHubFetcher;
  readonly log: (message: string) => void;
}): Promise<void> {
  const { opts, cwd, homeDir, inHomeDir, manifest, resolvedFetcher, log } = params;
  syncGlobalAgentConnectors(homeDir, false, opts.explicitLang, opts.targetArg);
  const wantsProjectFiles = opts.includeScripts || opts.initAgents || opts.reconcile;
  if (inHomeDir && wantsProjectFiles) {
    log(
      `ℹ️ [Modo Global $HOME] Omitiendo escritura de archivos de proyecto (AGENTS.md, scripts/, .agents/, lefthook.yml) en el directorio personal (${homeDir}).`
    );
    return;
  }
  await runProjectInstallHooks({ opts, cwd, manifest, resolvedFetcher, log });
}

async function loadManifestSkillEntries(
  resolvedFetcher: GitHubFetcher
): Promise<{ readonly manifest: Manifest; readonly skillEntries: ManifestFileEntry[] }> {
  const manifest = await resolvedFetcher.fetchManifest();
  const skillEntries = manifest.agent_governance_files.filter((f) =>
    f.path.startsWith(SKILLS_PREFIX)
  );
  if (skillEntries.length === 0) {
    throw new Error('No se encontraron archivos de skills en manifest.json.');
  }
  return { manifest, skillEntries };
}

export interface InstallSkillRuntimeOptions {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly log?: (message: string) => void;
}

export async function runInstallSkillCli(
  args: string[],
  fetcher?: GitHubFetcher,
  runtimeOptions?: InstallSkillRuntimeOptions
): Promise<void> {
  const log = runtimeOptions?.log ?? console.log;
  if (hasHelpFlag(args)) {
    log(renderSubcommandHelpText('install-skill', resolveCliHelpLang(args)));
    return;
  }

  const opts = validateAndParseInstallSkillArgs(args);
  assertValidSkillTarget(opts.targetArg);
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const homeDir = resolveSafeHomeDir(runtimeOptions?.homeDir);
  const baseCwd = runtimeOptions?.cwd ?? process.cwd();
  const cwd = resolveInstallWorkspaceDir(opts.projectPathArg, homeDir, baseCwd);
  const inHomeDir = isHomeDirectory(homeDir, cwd);

  const destDirs = resolveDestinationDirs(opts.targetArg, homeDir, cwd);
  const { manifest, skillEntries } = await loadManifestSkillEntries(resolvedFetcher);
  await runPreReconcileIfEnabled(opts, cwd, inHomeDir, log);

  if (opts.dryRun) {
    await executeDryRunPlan({
      opts,
      cwd,
      homeDir,
      inHomeDir,
      destDirs,
      skillCount: skillEntries.length,
      manifest,
      log,
    });
    return;
  }

  const downloadedFiles = await fetchVerifiedSkillFiles(resolvedFetcher, skillEntries);
  const manifestRelSkillPaths = new Set(downloadedFiles.map((item) => item.relSkillPath));
  log(`✔ [Skills 11X] ${downloadedFiles.length} archivos verificados con SHA-256 (DISA STIG V-222513).`);
  writeDownloadedSkills({
    destDirs,
    files: downloadedFiles,
    manifestRelSkillPaths,
    blueprintVersion: manifest.blueprint_version,
    workspaceCwd: cwd,
    homeDir,
    log,
  });
  await applyPostSkillInstallSteps({ opts, cwd, homeDir, inHomeDir, manifest, resolvedFetcher, log });
}
