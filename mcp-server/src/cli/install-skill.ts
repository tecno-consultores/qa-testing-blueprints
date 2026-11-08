// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { initOrAppendAgentsMd, syncGlobalGeminiMd } from './init-agents-md.js';
import { reconcileAgentsGovernance } from './reconcile-agents.js';
import type { Manifest, ManifestFileEntry } from '../types.js';

const AGENTS_DIR_NAME = '.agents';
const SKILLS_DIR_NAME = 'skills';
const SKILLS_PREFIX = '.agents/skills/';
const AGENT_SCRIPTS_PREFIX = '.agents/scripts/';
const ACTIVE_TASK_EXAMPLE_PATH = '.agents/ACTIVE_TASK.md.example';
const GEMINI_DIR_NAME = '.gemini';
const CLAUDE_DIR_NAME = '.claude';
const HERMES_DIR_NAME = '.hermes';
const CURSOR_DIR_NAME = '.cursor';
const UTF8 = 'utf-8';

function parseTargetArg(args: string[]): string {
  let targetArg = process.env.QA_SKILL_TARGET || 'auto';
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--target' || args[i] === '-t') && args[i + 1]) {
      targetArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--target=')) {
      targetArg = args[i].split('=')[1];
    }
  }
  return targetArg;
}

function detectInstalledGlobalAgentDirs(homeDir: string): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    dirs.push(path.join(homeDir, GEMINI_DIR_NAME, 'config', SKILLS_DIR_NAME));
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

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  const workspaceSkills = path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  switch (targetArg) {
    case 'workspace':
    case 'local':
      return [workspaceSkills];
    case 'cursor': {
      const cursorGlobal = path.join(homeDir, CURSOR_DIR_NAME, SKILLS_DIR_NAME);
      return fs.existsSync(path.join(homeDir, CURSOR_DIR_NAME)) ? [cursorGlobal] : [workspaceSkills];
    }
    case 'antigravity':
      return [path.join(homeDir, GEMINI_DIR_NAME, 'config', SKILLS_DIR_NAME)];
    case 'claude':
      return [path.join(homeDir, CLAUDE_DIR_NAME, SKILLS_DIR_NAME)];
    case 'hermes':
      return [path.join(homeDir, HERMES_DIR_NAME, SKILLS_DIR_NAME)];
    case 'all':
    default:
      return resolveGlobalOrFallbackTargets(homeDir, cwd);
  }
}

function writeDownloadedSkills(
  destDirs: string[],
  files: Array<{ relSkillPath: string; content: string }>
): void {
  for (const dest of destDirs) {
    for (const item of files) {
      const fullPath = path.join(dest, item.relSkillPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, item.content, UTF8);
    }
    console.log(`✅ Skills instaladas con éxito en: ${dest}`);
  }
}

function writeScriptEntry(cwd: string, entry: ManifestFileEntry, content: string): void {
  const targetRel = entry.target_name || entry.path;
  const fullPath = path.join(cwd, targetRel);
  const parentDir = path.dirname(fullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  if (entry.path === ACTIVE_TASK_EXAMPLE_PATH) {
    const exampleFullPath = path.join(cwd, entry.path);
    fs.writeFileSync(exampleFullPath, content, UTF8);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, UTF8);
    }
    return;
  }
  fs.writeFileSync(fullPath, content, UTF8);
  if (fullPath.endsWith('.sh') || fullPath.endsWith('.py')) {
    fs.chmodSync(fullPath, 0o755);
  }
}

async function installIncludedScripts(
  cwd: string,
  manifest: Manifest,
  fetcher: GitHubFetcher
): Promise<void> {
  const scriptEntries: ManifestFileEntry[] = [
    ...(manifest.common_files || []),
    ...(manifest.agent_governance_files || []).filter(
      (f) =>
        f.path.startsWith(AGENT_SCRIPTS_PREFIX) ||
        f.path === ACTIVE_TASK_EXAMPLE_PATH
    ),
  ];

  if (scriptEntries.length === 0) {
    return;
  }

  for (const entry of scriptEntries) {
    const content = await fetcher.fetchFileContent(entry.path, entry.sha256);
    writeScriptEntry(cwd, entry, content);
  }
  console.log(`✔ [Scripts 11X] ${scriptEntries.length} scripts y archivos comunes instalados [0o755].`);
}

export async function runInstallSkillCli(args: string[], fetcher?: GitHubFetcher): Promise<void> {
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const targetArg = parseTargetArg(args);
  const includeScripts = args.includes('--include-scripts');
  const initAgents = args.includes('--init-agents');
  const reconcile = args.includes('--reconcile');
  const cwd = process.cwd();
  const homeDir = process.env.HOME || os.homedir();
  const inHomeDir = isHomeDirectory(homeDir, cwd);

  if (reconcile && !inHomeDir) {
    const recRes = await reconcileAgentsGovernance({ projectPath: cwd, dryRun: false });
    console.log(
      `✔ [Reconcile 11X] ${recRes.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${recRes.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
    );
  }

  const manifest = await resolvedFetcher.fetchManifest();

  // Filtrar todos los archivos dentro de .agents/skills/ (catálogo completo de skills)
  const skillEntries = manifest.agent_governance_files.filter((f) =>
    f.path.startsWith(SKILLS_PREFIX)
  );

  if (skillEntries.length === 0) {
    throw new Error('No se encontraron archivos de skills en manifest.json.');
  }

  const destDirs = resolveDestinationDirs(targetArg, homeDir, cwd);

  const downloadedFiles: Array<{ relSkillPath: string; content: string }> = [];

  for (const entry of skillEntries) {
    const content = await resolvedFetcher.fetchFileContent(entry.path, entry.sha256);
    const relSkillPath = entry.path.replace(/^\.agents\/skills\//, '');
    downloadedFiles.push({ relSkillPath, content });
  }

  console.log(`✔ [Skills 11X] ${downloadedFiles.length} archivos verificados con SHA-256 (DISA STIG V-222513).`);
  writeDownloadedSkills(destDirs, downloadedFiles);

  if (fs.existsSync(path.join(homeDir, GEMINI_DIR_NAME))) {
    syncGlobalGeminiMd(homeDir);
  }

  if (inHomeDir && (includeScripts || initAgents || reconcile)) {
    console.log(
      `ℹ️ [Modo Global $HOME] Omitiendo escritura de archivos de proyecto (AGENTS.md, scripts/, .agents/, lefthook.yml) en el directorio personal (${homeDir}).`
    );
    return;
  }

  if (includeScripts) {
    await installIncludedScripts(cwd, manifest, resolvedFetcher);
  }

  if (initAgents) {
    const initResult = await initOrAppendAgentsMd({ projectPath: cwd });
    console.log(`✔ [AGENTS.md] Conector procesado (${initResult.action}) en ${initResult.agents_md_path}`);
  }
}
