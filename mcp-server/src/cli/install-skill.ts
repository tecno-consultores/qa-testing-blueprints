// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubFetcher, resolveSafeChildPath, resolveSafeHomeDir } from '../services/github-fetcher.js';
import { writeVersionStamp } from '../services/version-manager.js';
import { initOrAppendAgentsMd, syncGlobalGeminiMd } from './init-agents-md.js';
import { parseAgentsOption } from '../tools/initOrAppendAgentsMd.js';
import { reconcileAgentsGovernance } from './reconcile-agents.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import type { AgentsTargetSpec, Manifest, ManifestFileEntry, OutputLanguageMode } from '../types.js';

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
  lang: OutputLanguageMode;
  agents?: AgentsTargetSpec;
  includeScripts: boolean;
  initAgents: boolean;
  reconcile: boolean;
  dryRun: boolean;
  help: boolean;
}

const INSTALL_SKILL_VALUE_FLAGS = new Set(['--target', '-t', '--lang', '-l', '--agents', '-a']);
const INSTALL_SKILL_BOOL_FLAGS = new Set([
  '--include-scripts',
  '--init-agents',
  '--reconcile',
  '--dry-run',
  '--help',
  '-h',
]);

function readFlagValueStrict(
  args: readonly string[],
  index: number,
  arg: string
): { flag: string; value: string; consumed: number } | null {
  const eqIdx = arg.indexOf('=');
  if (eqIdx !== -1) {
    const flag = arg.slice(0, eqIdx);
    if (!INSTALL_SKILL_VALUE_FLAGS.has(flag)) {
      return null;
    }
    const inlineValue = arg.slice(eqIdx + 1);
    if (!inlineValue) {
      throw new Error(`Falta el valor requerido para la opción '${flag}'.`);
    }
    return { flag, value: inlineValue, consumed: 0 };
  }
  if (!INSTALL_SKILL_VALUE_FLAGS.has(arg)) {
    return null;
  }
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('-')) {
    throw new Error(`Falta el valor requerido para la opción '${arg}'.`);
  }
  return { flag: arg, value: nextArg, consumed: 1 };
}

function validateAndParseInstallSkillArgs(args: string[]): InstallSkillCliOptions {
  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    if (INSTALL_SKILL_BOOL_FLAGS.has(arg)) {
      continue;
    }
    const valFlag = readFlagValueStrict(args, i, arg);
    if (valFlag) {
      i += valFlag.consumed;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Opción CLI desconocida en install-skill: '${arg}'. Ejecuta con --help para ver las opciones válidas.`);
    }
    throw new Error(`Argumento posicional inesperado en install-skill: '${arg}'.`);
  }
  return {
    targetArg: parseTargetArg(args),
    lang: parseLangArg(args),
    agents: parseAgentsArg(args),
    includeScripts: args.includes('--include-scripts'),
    initAgents: args.includes('--init-agents'),
    reconcile: args.includes('--reconcile'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function parseTargetArg(args: string[]): string {
  let targetArg = process.env.QA_SKILL_TARGET || 'auto';
  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    const nextArg = args[i + 1];
    if ((arg === '--target' || arg === '-t') && nextArg) {
      targetArg = nextArg;
      i++;
    } else if (arg.startsWith('--target=')) {
      targetArg = arg.slice('--target='.length);
    }
  }
  return targetArg;
}

// eslint-disable-next-line sonarjs/function-return-type -- AgentsTargetSpec intentionally unions 'auto' | 'all' modes with SupportedAiAgentId[]
export function parseAgentsArg(args: string[]): AgentsTargetSpec | undefined {
  let spec: AgentsTargetSpec | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    const nextArg = args[i + 1];
    if ((arg === '--agents' || arg === '-a') && nextArg) {
      spec = parseAgentsOption(nextArg);
      break;
    }
    if (arg.startsWith('--agents=')) {
      spec = parseAgentsOption(arg.slice('--agents='.length));
      break;
    }
  }
  return spec;
}

export function parseLangArg(args: string[]): OutputLanguageMode {
  let rawLang = process.env.QA_OUTPUT_LANG;
  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    const nextArg = args[i + 1];
    if ((arg === '--lang' || arg === '-l') && nextArg) {
      rawLang = nextArg;
      i++;
    } else if (arg.startsWith('--lang=')) {
      rawLang = arg.slice('--lang='.length);
    }
  }
  const normalizedRaw = rawLang && rawLang !== 'undefined' ? rawLang : 'auto';
  const selectedLang = normalizedRaw.trim().toLowerCase();
  if (selectedLang !== 'auto' && selectedLang !== 'es' && selectedLang !== 'en') {
    throw new Error(`Modo de idioma no válido: '${rawLang}'. Valores permitidos: auto, es, en.`);
  }
  return selectedLang;
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
  return path.resolve(cwd) === path.resolve(homeDir);
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

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  const workspaceSkills = path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  switch (targetArg) {
    case 'workspace':
    case 'local':
      return [workspaceSkills];
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
      throw new Error(
        `Destino --target inválido: '${targetArg}'. Valores permitidos: auto, workspace, antigravity, claude, cursor, windsurf, codex, hermes, all.`
      );
  }
}

function writeDownloadedSkills(
  destDirs: string[],
  files: Array<{ relSkillPath: string; content: string }>,
  blueprintVersion: string
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
    console.log(`✅ Skills instaladas con éxito en: ${dest}`);
  }
}

function writeScriptEntry(cwd: string, entry: ManifestFileEntry, content: string): void {
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
  if (fs.existsSync(fullPath)) {
    const existingContent = fs.readFileSync(fullPath, UTF8);
    if (existingContent !== content) {
      fs.copyFileSync(fullPath, `${fullPath}.bak`);
    }
  }
  fs.writeFileSync(fullPath, content, UTF8);
  if (fullPath.endsWith('.sh') || fullPath.endsWith('.py')) {
    // eslint-disable-next-line sonarjs/file-permissions -- Shared repo scripts require 0o755 so non-root Docker UIDs can execute them
    fs.chmodSync(fullPath, 0o755);
  }
}

function selectScriptEntries(manifest: Manifest): ManifestFileEntry[] {
  return [
    ...(manifest.common_files || []).filter((f) => f.path !== 'scripts/publicar-mcp.sh'),
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
    writeScriptEntry(cwd, entry, content);
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

export async function runInstallSkillCli(args: string[], fetcher?: GitHubFetcher): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(INSTALL_SKILL_HELP_TEXT);
    return;
  }

  const opts = validateAndParseInstallSkillArgs(args);
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const cwd = process.cwd();
  const homeDir = resolveSafeHomeDir();
  const inHomeDir = isHomeDirectory(homeDir, cwd);

  if (opts.reconcile && !inHomeDir) {
    const recRes = await reconcileAgentsGovernance({ projectPath: cwd, dryRun: opts.dryRun });
    const recPrefix = opts.dryRun ? '🔍 [DRY-RUN Reconcile 11X]' : '✔ [Reconcile 11X]';
    console.log(
      `${recPrefix} ${recRes.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${recRes.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
    );
  }

  const manifest = await resolvedFetcher.fetchManifest();
  const skillEntries = manifest.agent_governance_files.filter((f) =>
    f.path.startsWith(SKILLS_PREFIX)
  );
  if (skillEntries.length === 0) {
    throw new Error('No se encontraron archivos de skills en manifest.json.');
  }

  const destDirs = resolveDestinationDirs(opts.targetArg, homeDir, cwd);
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

  const downloadedFiles: Array<{ relSkillPath: string; content: string }> = [];
  for (const entry of skillEntries) {
    const content = await resolvedFetcher.fetchFileContent(entry.path, entry.sha256);
    const relSkillPath = entry.path.replace(/^\.agents\/skills\//, '');
    downloadedFiles.push({ relSkillPath, content });
  }

  console.log(`✔ [Skills 11X] ${downloadedFiles.length} archivos verificados con SHA-256 (DISA STIG V-222513).`);
  writeDownloadedSkills(destDirs, downloadedFiles, manifest.blueprint_version);

  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    syncGlobalGeminiMd(homeDir, false, opts.lang);
  }

  if (inHomeDir && (opts.includeScripts || opts.initAgents || opts.reconcile)) {
    console.log(
      `ℹ️ [Modo Global $HOME] Omitiendo escritura de archivos de proyecto (AGENTS.md, scripts/, .agents/, lefthook.yml) en el directorio personal (${homeDir}).`
    );
    return;
  }

  if (opts.includeScripts) {
    await installIncludedScripts(cwd, manifest, resolvedFetcher);
  }

  if (opts.initAgents) {
    const initResult = await initOrAppendAgentsMd({
      projectPath: cwd,
      lang: opts.lang,
      ...(opts.agents !== undefined ? { agents: opts.agents } : {}),
    });
    console.log(`✔ [AGENTS.md] Conector procesado (${initResult.action}) en ${initResult.agents_md_path}`);
  }
}
