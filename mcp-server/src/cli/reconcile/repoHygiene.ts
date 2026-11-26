// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AIDER_BRIDGE_END,
  AIDER_BRIDGE_START,
  BRIDGE_END_MARKER,
  BRIDGE_START_MARKER,
  CANONICAL_GLOBAL_SKILL_DIRS,
  CONNECTOR_END_MARKER,
  CONNECTOR_START_MARKER,
  buildCanonicalAiderBridgeBlock,
  buildCanonicalMarkdownBridgeBlock,
  detectConnectorLang,
  detectExistingStacks,
  replaceDelimitedSection,
} from '../../services/agents-connector.js';
import {
  findMissingCanonicalGitignoreEntries,
  readQa11xConfig,
} from '../../services/qa11xConfig.js';
import { SUPPORTED_AI_AGENTS } from '../../tools/initOrAppendAgentsMd.js';
import { CANONICAL_IGNORED_DIRS } from '../../utils/ignoredDirs.js';
import type { ReconciledRuleItem } from '../../types.js';

const UTF8 = 'utf-8';
const BACKUP_DEST_LABEL = 'destino de respaldo';
const GITIGNORE_FILE = '.gitignore';
const LOOSE_BACKUP_RE = /\.(?:bak|11x-backup|11x-incoming)$/i;
const CURSOR_MDC_FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const MULTI_AGENT_SKILL_DIRS = ['.claude', '.cursor', '.codex', '.windsurf'] as const;
const MONOREPO_ONLY_SCRIPTS = [
  'scripts/publicar-mcp.sh',
  'scripts/probar-mcp-example.sh',
  'scripts/install-skill.sh',
  '.agents/scripts/bump_version_11x.py',
  '.agents/scripts/sync_governance.py',
] as const;
const LOOSE_BACKUP_SKIP_DIRS = new Set([...CANONICAL_IGNORED_DIRS, 'graphify-out', 'backups']);

export function assertNoSymlinkSegmentsFromRoot(
  rootDir: string,
  targetPath: string,
  label: string
): fs.Stats | undefined {
  const rel = path.relative(rootDir, targetPath);
  let cur = rootDir;
  let lastStat: fs.Stats | undefined;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    cur = path.join(cur, segment);
    lastStat = fs.lstatSync(cur, { throwIfNoEntry: false });
    if (lastStat?.isSymbolicLink()) {
      throw new Error(`Symlink rechazado por seguridad en ${label}: ${cur}`);
    }
  }
  return lastStat;
}

export function ensureBackupFile(
  projectPath: string,
  relFilePath: string,
  backupDir: string
): void {
  const srcFull = path.join(projectPath, relFilePath);
  const srcStat = assertNoSymlinkSegmentsFromRoot(projectPath, srcFull, 'respaldo');
  if (!srcStat?.isFile()) return;
  const destFull = path.join(backupDir, relFilePath);
  assertNoSymlinkSegmentsFromRoot(projectPath, destFull, BACKUP_DEST_LABEL);
  fs.mkdirSync(path.dirname(destFull), { recursive: true, mode: 0o700 });
  assertNoSymlinkSegmentsFromRoot(projectPath, destFull, BACKUP_DEST_LABEL);
  fs.copyFileSync(srcFull, destFull);
  fs.chmodSync(destFull, 0o600);
}

export function hardenBackupTreePermissions(targetPath: string): void {
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(targetPath, 0o700);
    for (const child of fs.readdirSync(targetPath)) {
      hardenBackupTreePermissions(path.join(targetPath, child));
    }
    return;
  }
  if (stat.isFile()) fs.chmodSync(targetPath, 0o600);
}

function runGitReadOnly(
  projectPath: string,
  gitArgs: readonly string[],
  runExec: typeof execFileSync = execFileSync
): string | null {
  if (!fs.existsSync(path.join(projectPath, '.git'))) return null;
  try {
    return runExec('git', gitArgs, {
      cwd: projectPath,
      encoding: UTF8,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

export function isGitWorktreeDirty(
  projectPath: string,
  runExec: typeof execFileSync = execFileSync
): boolean {
  const out = runGitReadOnly(projectPath, ['status', '--porcelain'], runExec);
  return out !== null && out.trim().length > 0;
}

function pruneCanonicalSkillInAgentDir(opts: {
  readonly projectPath: string;
  readonly agentDir: string;
  readonly skillName: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
}): ReconciledRuleItem | null {
  if (!CANONICAL_GLOBAL_SKILL_DIRS.has(opts.skillName)) return null;
  const relPath = path.join(opts.agentDir, 'skills', opts.skillName);
  const fullPath = path.join(opts.projectPath, relPath);
  const stat = assertNoSymlinkSegmentsFromRoot(opts.projectPath, fullPath, 'skill sombra');
  if (!stat) return null;
  if (!opts.dryRun) {
    const backupDest = path.join(opts.backupDir, relPath);
    assertNoSymlinkSegmentsFromRoot(opts.projectPath, backupDest, BACKUP_DEST_LABEL);
    fs.mkdirSync(path.dirname(backupDest), { recursive: true, mode: 0o700 });
    fs.cpSync(fullPath, backupDest, { recursive: true, dereference: false });
    hardenBackupTreePermissions(backupDest);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
  return {
    file: relPath,
    classification: 'REDUNDANT_PROMOTED_REMOVED',
    details: 'Copia canónica en carpeta local multi-agente respaldada y podada (consumo global $HOME).',
  };
}

function reconcileSingleAgentSkillDir(opts: {
  readonly projectPath: string;
  readonly agentDir: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
}): ReconciledRuleItem[] {
  const skillsDir = path.join(opts.projectPath, opts.agentDir, 'skills');
  const dirStat = assertNoSymlinkSegmentsFromRoot(opts.projectPath, skillsDir, opts.agentDir);
  if (!dirStat?.isDirectory()) return [];
  const items: ReconciledRuleItem[] = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const item = pruneCanonicalSkillInAgentDir({ ...opts, skillName: entry });
    if (item) items.push(item);
  }
  if (!opts.dryRun && fs.readdirSync(skillsDir).length === 0) {
    fs.rmdirSync(skillsDir);
  }
  return items;
}

export function reconcileMultiAgentShadowSkills(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { items: ReconciledRuleItem[]; removedCount: number } {
  const items: ReconciledRuleItem[] = [];
  for (const agentDir of MULTI_AGENT_SKILL_DIRS) {
    items.push(...reconcileSingleAgentSkillDir({ projectPath, agentDir, dryRun, backupDir }));
  }
  return { items, removedCount: items.length };
}

interface BridgeTargetInfo {
  readonly relPath: string;
  readonly format: string;
  readonly labels: string[];
}

function collectProjectBridgeTargets(): BridgeTargetInfo[] {
  const targets: BridgeTargetInfo[] = [];
  for (const desc of Object.values(SUPPORTED_AI_AGENTS)) {
    if (desc.bridgeFile === 'AGENTS.md') continue;
    targets.push({
      relPath: desc.bridgeFile,
      format: desc.format,
      labels: [desc.displayName],
    });
  }
  return targets;
}

function detectBridgeMarkerPair(content: string): { start: string; end: string } | null {
  if (content.includes(BRIDGE_START_MARKER) && content.includes(BRIDGE_END_MARKER)) {
    return { start: BRIDGE_START_MARKER, end: BRIDGE_END_MARKER };
  }
  if (content.includes(AIDER_BRIDGE_START) && content.includes(AIDER_BRIDGE_END)) {
    return { start: AIDER_BRIDGE_START, end: AIDER_BRIDGE_END };
  }
  if (content.includes(CONNECTOR_START_MARKER) && content.includes(CONNECTOR_END_MARKER)) {
    return { start: CONNECTOR_START_MARKER, end: CONNECTOR_END_MARKER };
  }
  return null;
}

function extractCustomOutsideBridge(content: string, format: string): string {
  const pair = detectBridgeMarkerPair(content);
  if (!pair) return content;
  const startIdx = content.indexOf(pair.start);
  const endIdx = content.indexOf(pair.end, startIdx + pair.start.length);
  const rawOutside = `${content.slice(0, startIdx)}\n${content.slice(endIdx + pair.end.length)}`;
  const cleaned = format === 'mdc' ? rawOutside.replace(CURSOR_MDC_FRONTMATTER_RE, '') : rawOutside;
  return cleaned.trim();
}

function resolveProjectFallbackStacks(projectPath: string, existing: string): string {
  const bridgeStacks = detectExistingStacks(existing);
  if (bridgeStacks.length > 0) {
    return bridgeStacks.join(', ');
  }
  const agentsMdPath = path.join(projectPath, 'AGENTS.md');
  if (fs.existsSync(agentsMdPath)) {
    const agentsStacks = detectExistingStacks(fs.readFileSync(agentsMdPath, UTF8));
    if (agentsStacks.length > 0) {
      return agentsStacks.join(', ');
    }
  }
  const cfgStacks = readQa11xConfig(projectPath).stacks;
  return cfgStacks.length > 0 ? cfgStacks.join(', ') : 'general';
}

function buildCompactBridgeBlock(
  projectPath: string,
  target: BridgeTargetInfo,
  existing: string
): {
  startMarker: string;
  endMarker: string;
  block: string;
} {
  const lang = detectConnectorLang(existing) ?? readQa11xConfig(projectPath).lang ?? 'auto';
  if (target.format === 'aider-yaml') {
    const block = buildCanonicalAiderBridgeBlock(existing, lang);
    return { startMarker: AIDER_BRIDGE_START, endMarker: AIDER_BRIDGE_END, block };
  }
  const stacksLabel = resolveProjectFallbackStacks(projectPath, existing);
  const block = buildCanonicalMarkdownBridgeBlock(target.labels, stacksLabel, lang);
  return { startMarker: BRIDGE_START_MARKER, endMarker: BRIDGE_END_MARKER, block };
}

function pruneStandaloneBridgeFile(
  projectPath: string,
  relPath: string,
  fullPath: string,
  options: { readonly dryRun: boolean; readonly backupDir: string }
): ReconciledRuleItem {
  if (!options.dryRun) {
    ensureBackupFile(projectPath, relPath, options.backupDir);
    fs.unlinkSync(fullPath);
  }
  return {
    file: relPath,
    classification: 'BRIDGE_PRUNED',
    details: 'Puente QA-11X redundante respaldado y eliminado (--prune-bridges).',
  };
}

function compactExistingBridgeFile(params: {
  readonly projectPath: string;
  readonly target: BridgeTargetInfo;
  readonly fullPath: string;
  readonly existing: string;
  readonly markers: { readonly start: string; readonly end: string };
  readonly dryRun: boolean;
  readonly backupDir: string;
}): ReconciledRuleItem | null {
  const nextSpec = buildCompactBridgeBlock(params.projectPath, params.target, params.existing);
  const merged = replaceDelimitedSection(params.existing, {
    startMarker: params.markers.start,
    endMarker: params.markers.end,
    block: nextSpec.block,
    emptyDocument: `${nextSpec.block}\n`,
    appendSeparator: '\n\n',
  }).finalContent;
  if (merged === params.existing) return null;
  if (!params.dryRun) {
    ensureBackupFile(params.projectPath, params.target.relPath, params.backupDir);
    fs.writeFileSync(params.fullPath, merged, UTF8);
  }
  return {
    file: params.target.relPath,
    classification: 'BRIDGE_UPDATED',
    details: 'Bloque puente compactado preservando reglas personalizadas externas.',
  };
}

function processSingleBridgeFile(
  projectPath: string,
  target: BridgeTargetInfo,
  options: { readonly dryRun: boolean; readonly backupDir: string; readonly pruneBridges: boolean }
): ReconciledRuleItem | null {
  const fullPath = path.join(projectPath, target.relPath);
  const stat = assertNoSymlinkSegmentsFromRoot(projectPath, fullPath, 'puente IDE');
  if (!stat?.isFile()) return null;
  const existing = fs.readFileSync(fullPath, UTF8);
  const markers = detectBridgeMarkerPair(existing);
  if (!markers) return null;

  const customOutside = extractCustomOutsideBridge(existing, target.format);
  if (options.pruneBridges && customOutside.length === 0) {
    return pruneStandaloneBridgeFile(projectPath, target.relPath, fullPath, options);
  }
  return compactExistingBridgeFile({
    projectPath,
    target,
    fullPath,
    existing,
    markers,
    dryRun: options.dryRun,
    backupDir: options.backupDir,
  });
}

export function reconcileBridgeFiles(
  projectPath: string,
  dryRun: boolean,
  backupDir: string,
  pruneBridges: boolean
): { items: ReconciledRuleItem[]; bridgesProcessed: string[] } {
  const items: ReconciledRuleItem[] = [];
  const bridgesProcessed: string[] = [];
  for (const target of collectProjectBridgeTargets()) {
    const item = processSingleBridgeFile(projectPath, target, {
      dryRun,
      backupDir,
      pruneBridges,
    });
    if (item) {
      items.push(item);
      bridgesProcessed.push(target.relPath);
    }
  }
  return { items, bridgesProcessed };
}

export function reconcileMonorepoAndRetiredScripts(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { items: ReconciledRuleItem[]; removedCount: number } {
  const items: ReconciledRuleItem[] = [];
  for (const relPath of MONOREPO_ONLY_SCRIPTS) {
    const fullPath = path.join(projectPath, relPath);
    const stat = assertNoSymlinkSegmentsFromRoot(projectPath, fullPath, 'script monorepo');
    if (!stat?.isFile()) continue;
    if (!dryRun) {
      ensureBackupFile(projectPath, relPath, backupDir);
      fs.unlinkSync(fullPath);
    }
    items.push({
      file: relPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: 'Script exclusivo del monorepo origen respaldado y eliminado en repositorio consumidor.',
    });
  }
  return { items, removedCount: items.length };
}

function isLooseBackupFile(entry: fs.Dirent): boolean {
  return !entry.isSymbolicLink() && entry.isFile() && LOOSE_BACKUP_RE.test(entry.name);
}

function shouldSkipBackupRecurseDir(relDir: string, entryName: string): boolean {
  if (entryName === 'backups' && relDir === '.agents') {
    return true;
  }
  return LOOSE_BACKUP_SKIP_DIRS.has(entryName) && entryName !== 'backups';
}

function resolveBackupDirStat(projectPath: string, relDir: string): fs.Stats | undefined {
  const fullDir = relDir ? path.join(projectPath, relDir) : projectPath;
  return relDir
    ? assertNoSymlinkSegmentsFromRoot(projectPath, fullDir, 'backups sueltos')
    : fs.lstatSync(fullDir, { throwIfNoEntry: false });
}

function collectLooseBackupsRecursive(
  projectPath: string,
  relDir: string,
  collected: string[],
  depth = 0
): void {
  if (depth > 8) return;
  const dirStat = resolveBackupDirStat(projectPath, relDir);
  if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) return;

  const fullDir = relDir ? path.join(projectPath, relDir) : projectPath;
  const entries = fs
    .readdirSync(fullDir, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relPath = relDir ? path.join(relDir, entry.name) : entry.name;
    if (entry.isDirectory() && !shouldSkipBackupRecurseDir(relDir, entry.name)) {
      collectLooseBackupsRecursive(projectPath, relPath, collected, depth + 1);
    } else if (isLooseBackupFile(entry)) {
      assertNoSymlinkSegmentsFromRoot(projectPath, path.join(projectPath, relPath), 'backup suelto');
      collected.push(relPath);
    }
  }
}

export function consolidateLooseBackups(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { items: ReconciledRuleItem[]; consolidatedBackups: string[] } {
  const candidates: string[] = [];
  collectLooseBackupsRecursive(projectPath, '', candidates);
  const items: ReconciledRuleItem[] = [];
  for (const relPath of candidates) {
    if (!dryRun) {
      ensureBackupFile(projectPath, relPath, backupDir);
      fs.unlinkSync(path.join(projectPath, relPath));
    }
    items.push({
      file: relPath,
      classification: 'LEGACY_ARTIFACT_CONSOLIDATED',
      details: 'Respaldo suelto consolidado en .agents/backups/.',
    });
  }
  return { items, consolidatedBackups: candidates };
}

function computeMissingGitignoreEntries(existingContent: string): string[] {
  return findMissingCanonicalGitignoreEntries(existingContent);
}

export function ensureGitignoreHygiene(
  projectPath: string,
  dryRun: boolean
): { item: ReconciledRuleItem | null; addedEntries: string[] } {
  const gitignorePath = path.join(projectPath, GITIGNORE_FILE);
  const gitignoreStat = assertNoSymlinkSegmentsFromRoot(
    projectPath,
    gitignorePath,
    GITIGNORE_FILE
  );
  const hasGitRepo = fs.existsSync(path.join(projectPath, '.git'));
  if (!gitignoreStat && !hasGitRepo) return { item: null, addedEntries: [] };
  if (gitignoreStat && !gitignoreStat.isFile()) return { item: null, addedEntries: [] };

  const existing = gitignoreStat ? fs.readFileSync(gitignorePath, UTF8) : '';
  const missing = computeMissingGitignoreEntries(existing);
  if (missing.length === 0) return { item: null, addedEntries: [] };

  if (!dryRun) {
    const prefix = existing.length > 0 ? `${existing.trimEnd()}\n\n` : '';
    const block = `# QA-11X Ephemeral & Governance Hygiene\n${missing.join('\n')}\n`;
    fs.writeFileSync(gitignorePath, `${prefix}${block}`, UTF8);
  }
  return {
    item: {
      file: GITIGNORE_FILE,
      classification: 'GITIGNORE_UPDATED',
      details: `Añadidas ${missing.length} entrada(s) de higiene efímera QA-11X.`,
    },
    addedEntries: missing,
  };
}

function listTrackedVolatileGitFiles(
  projectPath: string,
  runExec: typeof execFileSync = execFileSync
): string[] {
  const raw = runGitReadOnly(
    projectPath,
    ['ls-files', '--', '.agents/ACTIVE_TASK.md', '.agents/mcp_config.json', 'graphify-out'],
    runExec
  );
  if (raw === null) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function collectReadOnlyAdvisories(projectPath: string): {
  advisories: string[];
  suggestedGitCommands: string[];
  items: ReconciledRuleItem[];
} {
  const advisories: string[] = [];
  const suggestedGitCommands: string[] = [];
  const items: ReconciledRuleItem[] = [];

  if (fs.existsSync(path.join(projectPath, 'docs', 'examples'))) {
    const msg = 'Directorio legado docs/examples/ detectado (solo informe; revisar si aún aplica).';
    advisories.push(msg);
    items.push({ file: 'docs/examples', classification: 'ADVISORY_REPORT_ONLY', details: msg });
  }
  if (fs.existsSync(path.join(projectPath, '.agents', 'README.md'))) {
    const msg = 'Archivo de referencia .agents/README.md presente en repo consumidor (opcional/solo informe).';
    advisories.push(msg);
  }
  const trackedVolatile = listTrackedVolatileGitFiles(projectPath);
  if (trackedVolatile.length > 0) {
    const cmd = `git rm --cached -r ${trackedVolatile.join(' ')}`;
    const msg = `Archivos volátiles aún rastreados por Git: ${trackedVolatile.join(', ')}`;
    advisories.push(msg);
    suggestedGitCommands.push(cmd);
    items.push({ file: '.git/index', classification: 'ADVISORY_REPORT_ONLY', details: `${msg}. Sugerido: ${cmd}` });
  }
  return { advisories, suggestedGitCommands, items };
}
