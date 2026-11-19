// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubFetcher, resolveSafeChildPath, resolveSafeHomeDir } from '../services/github-fetcher.js';
import { SurgicalMerger } from '../services/surgical-merger.js';
import { writeVersionStamp } from '../services/version-manager.js';
import { initOrAppendAgentsMd, syncGlobalGeminiMd } from './init-agents-md.js';
import { parseAgentsOption } from '../tools/initOrAppendAgentsMd.js';
import { reconcileAgentsGovernance } from './reconcile-agents.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import {
  hasHelpFlag,
  isSameResolvedDir,
  matchFlagValue,
  resolveCliProjectPath,
  resolveComparablePath,
} from './cliArgHelpers.js';
import type { AgentsTargetSpec, Manifest, ManifestFileEntry, OutputLanguageMode } from '../types.js';

const EXCLUDED_COMMON_SCRIPT_PATHS = new Set([
  'scripts/publicar-mcp.sh',
  'scripts/probar-mcp-example.sh',
  '.env.example',
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
const UTF8 = 'utf-8';

export const INSTALL_SKILL_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x install-skill [opciones]',
  '',
  'Opciones:',
  '  --target, -t <env>       auto (default) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all',
  '  --project-path, --dir, -p <dir>  Directorio del proyecto destino (por defecto: cwd)',
  '  --lang, -l <auto|es|en>  Política de idioma inyectada al usar --init-agents (default: auto)',
  '  --agents, -a <spec>      Puentes opcionales al usar --init-agents (auto | all | CSV de 28 agentes)',
  '  --include-scripts        Instala scripts operacionales (.agents/scripts, .agents/schemas y comunes)',
  '  --init-agents            Ejecuta init-agents en el proyecto tras instalar skills globales',
  '  --reconcile              Reconcilia y poda reglas duplicadas en .agents/ antes de sincronizar',
  '  --dry-run                Muestra el plan de instalación sin escribir archivos en disco',
  '  --help, -h               Muestra esta ayuda y sale con código 0',
].join('\n');

interface InstallSkillCliOptions {
  targetArg: string;
  projectPathArg?: string;
  lang: OutputLanguageMode;
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
  return {
    targetArg: parseTargetArg(args),
    projectPathArg: parseProjectPathArg(args),
    lang: parseLangArg(args),
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

export function parseLangArg(args: string[]): OutputLanguageMode {
  const rawLang = resolveRawLangInput(args);
  const selectedLang = rawLang.trim().toLowerCase();
  if (!VALID_LANG_MODES.has(selectedLang)) {
    throw new Error(`Modo de idioma no válido: '${rawLang}'. Valores permitidos: auto, es, en.`);
  }
  return selectedLang as OutputLanguageMode;
}

function resolveGeminiSkillDirs(homeDir: string): string[] {
  const dirs = [path.join(homeDir, GEMINI_DIR_NAME, 'config', SKILLS_DIR_NAME)];
  const antigravityDir = path.join(homeDir, GEMINI_DIR_NAME, GEMINI_ANTIGRAVITY_DIR);
  if (fs.existsSync(antigravityDir)) {
    dirs.push(path.join(antigravityDir, SKILLS_DIR_NAME));
  }
  return dirs;
}

function detectInstalledGlobalAgentDirs(homeDir: string): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    dirs.push(...resolveGeminiSkillDirs(homeDir));
  }
  if (fs.existsSync(path.join(homeDir, CLAUDE_DIR_NAME))) {
    dirs.push(path.join(homeDir, CLAUDE_DIR_NAME, SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, HERMES_DIR_NAME))) {
    dirs.push(path.join(homeDir, HERMES_DIR_NAME, SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, CURSOR_DIR_NAME))) {
    dirs.push(path.join(homeDir, CURSOR_DIR_NAME, SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, WINDSURF_REL_DIR))) {
    dirs.push(path.join(homeDir, WINDSURF_REL_DIR, SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, CODEX_DIR_NAME))) {
    dirs.push(path.join(homeDir, CODEX_DIR_NAME, SKILLS_DIR_NAME));
  }
  return dirs;
}

function isHomeDirectory(homeDir: string, cwd: string): boolean {
  return isSameResolvedDir(cwd, homeDir);
}

function resolveGlobalOrFallbackTargets(homeDir: string, cwd: string): string[] {
  const globalDirs = detectInstalledGlobalAgentDirs(homeDir);
  if (globalDirs.length > 0) {
    return Array.from(new Set(globalDirs));
  }
  return [path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)];
}

function resolveAllGlobalAgentDirs(homeDir: string): string[] {
  const detected = detectInstalledGlobalAgentDirs(homeDir);
  if (detected.length > 0) {
    return Array.from(new Set(detected));
  }
  return [
    ...resolveGeminiSkillDirs(homeDir),
    path.join(homeDir, CLAUDE_DIR_NAME, SKILLS_DIR_NAME),
    path.join(homeDir, HERMES_DIR_NAME, SKILLS_DIR_NAME),
    path.join(homeDir, CURSOR_DIR_NAME, SKILLS_DIR_NAME),
    path.join(homeDir, WINDSURF_REL_DIR, SKILLS_DIR_NAME),
    path.join(homeDir, CODEX_DIR_NAME, SKILLS_DIR_NAME),
  ];
}

const VALID_SKILL_TARGETS = new Set<string>([
  'workspace',
  'local',
  'cursor',
  'antigravity',
  'claude',
  'hermes',
  'windsurf',
  'codex',
  'all',
  'auto',
]);

export function assertValidSkillTarget(targetArg: string): void {
  if (!VALID_SKILL_TARGETS.has(targetArg)) {
    throw new Error(
      `Destino --target inválido: '${targetArg}'. Valores permitidos: auto, workspace, antigravity, claude, cursor, windsurf, codex, hermes, all.`
    );
  }
}

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  assertValidSkillTarget(targetArg);
  const workspaceSkills = path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  switch (targetArg) {
    case 'cursor':
      return [path.join(homeDir, CURSOR_DIR_NAME, SKILLS_DIR_NAME)];
    case 'antigravity':
      return resolveGeminiSkillDirs(homeDir);
    case 'claude':
      return [path.join(homeDir, CLAUDE_DIR_NAME, SKILLS_DIR_NAME)];
    case 'hermes':
      return [path.join(homeDir, HERMES_DIR_NAME, SKILLS_DIR_NAME)];
    case 'windsurf':
      return [path.join(homeDir, WINDSURF_REL_DIR, SKILLS_DIR_NAME)];
    case 'codex':
      return [path.join(homeDir, CODEX_DIR_NAME, SKILLS_DIR_NAME)];
    case 'all':
      return resolveAllGlobalAgentDirs(homeDir);
    case 'auto':
      return resolveGlobalOrFallbackTargets(homeDir, cwd);
    default:
      return [workspaceSkills];
  }
}

function writeDownloadedSkills(
  destDirs: string[],
  files: Array<{ relSkillPath: string; content: string }>,
  blueprintVersion: string,
  log: (message: string) => void = console.log
): void {
  for (const dest of destDirs) {
    for (const item of files) {
      const fullPath = resolveSafeChildPath(dest, item.relSkillPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, item.content, UTF8);
    }
    writeVersionStamp(dest, blueprintVersion);
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
  if (fs.existsSync(fullPath)) {
    const existingContent = fs.readFileSync(fullPath, UTF8);
    if (existingContent !== content) {
      fs.copyFileSync(fullPath, `${fullPath}.bak`);
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
  const backupFile = `${fullPath}.11x-backup`;
  if (fs.existsSync(backupFile)) {
    try {
      fs.chmodSync(backupFile, 0o600);
    } catch (err: unknown) {
      reportDebugCatchError(`installSkill.chmodBackup(${targetRel})`, err);
    }
  }
}

async function writeScriptEntry(
  cwd: string,
  entry: ManifestFileEntry,
  content: string
): Promise<void> {
  const targetRel = entry.target_name || entry.path;
  const fullPath = resolveSafeChildPath(cwd, targetRel);
  const parentDir = path.dirname(fullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  if (entry.path === ACTIVE_TASK_EXAMPLE_PATH) {
    const exampleFullPath = resolveSafeChildPath(cwd, entry.path);
    fs.writeFileSync(exampleFullPath, content, UTF8);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, UTF8);
    }
    return;
  }
  if (entry.merge_strategy === 'copy_if_missing') {
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, UTF8);
      ensureScriptExecutableMode(fullPath);
    }
    return;
  }
  if (entry.merge_strategy === 'surgical_merge' && fs.existsSync(fullPath)) {
    await mergeExistingScriptEntry(cwd, entry, fullPath, content);
    return;
  }
  writeScriptWithBak(fullPath, content);
}

function selectScriptEntries(manifest: Manifest): ManifestFileEntry[] {
  return [
    ...(manifest.common_files || []).filter((f) => !EXCLUDED_COMMON_SCRIPT_PATHS.has(f.path)),
    ...(manifest.agent_governance_files || []).filter(
      (f) =>
        f.path.startsWith(AGENT_SCRIPTS_PREFIX) ||
        f.path.startsWith(AGENT_SCHEMAS_PREFIX) ||
        f.path === ACTIVE_TASK_EXAMPLE_PATH
    ),
  ];
}

async function installIncludedScripts(
  cwd: string,
  manifest: Manifest,
  fetcher: GitHubFetcher
): Promise<void> {
  const scriptEntries = selectScriptEntries(manifest);
  if (scriptEntries.length === 0) {
    return;
  }

  for (const entry of scriptEntries) {
    const content = await fetcher.fetchFileContent(entry.path, entry.sha256);
    await writeScriptEntry(cwd, entry, content);
  }
  writeVersionStamp(path.join(cwd, AGENTS_DIR_NAME), manifest.blueprint_version);
  console.log(`✔ [Scripts 11X] ${scriptEntries.length} scripts y archivos comunes instalados [0o755].`);
}

interface DryRunPlanContext {
  readonly opts: InstallSkillCliOptions;
  readonly cwd: string;
  readonly homeDir: string;
  readonly inHomeDir: boolean;
  readonly destDirs: string[];
  readonly skillCount: number;
  readonly manifest: Manifest;
}

async function executeDryRunPlan(ctx: DryRunPlanContext): Promise<void> {
  const { opts, cwd, homeDir, inHomeDir, destDirs, skillCount, manifest } = ctx;
  console.log(`🔍 [DRY-RUN] Plan install-skill (v${manifest.blueprint_version}):`);
  console.log(`  - Destinos de skills (${destDirs.length}): ${destDirs.join(', ')}`);
  console.log(`  - Archivos de skills planificados: ${skillCount}`);
  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    syncGlobalGeminiMd(homeDir, true, opts.lang);
    console.log(`  - Actualizaría conector global en ${path.join(homeDir, GEMINI_DIR_NAME, 'GEMINI.md')}`);
  }
  if (!inHomeDir && opts.includeScripts) {
    const plannedScripts = selectScriptEntries(manifest);
    console.log(`  - Scripts/archivos comunes planificados: ${plannedScripts.length}`);
  }
  if (!inHomeDir && opts.initAgents) {
    const initPlan = await initOrAppendAgentsMd({
      projectPath: cwd,
      dryRun: true,
      lang: opts.lang,
      ...(opts.agents !== undefined ? { agents: opts.agents } : {}),
    });
    console.log(`  - AGENTS.md planificado (${initPlan.action}) en ${initPlan.agents_md_path}`);
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
    lang: opts.lang,
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
    await installIncludedScripts(params.cwd, params.manifest, params.resolvedFetcher);
  }
  await runOptionalInitAgentsHook(params.opts, params.cwd, params.log);
}

function maybeSyncGlobalGemini(homeDir: string, lang: OutputLanguageMode): void {
  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    syncGlobalGeminiMd(homeDir, false, lang);
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
  maybeSyncGlobalGemini(homeDir, opts.lang);
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
    log(INSTALL_SKILL_HELP_TEXT);
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
    });
    return;
  }

  const downloadedFiles = await fetchVerifiedSkillFiles(resolvedFetcher, skillEntries);
  log(`✔ [Skills 11X] ${downloadedFiles.length} archivos verificados con SHA-256 (DISA STIG V-222513).`);
  writeDownloadedSkills(destDirs, downloadedFiles, manifest.blueprint_version, log);
  await applyPostSkillInstallSteps({ opts, cwd, homeDir, inHomeDir, manifest, resolvedFetcher, log });
}
