// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GitHubFetcher,
  MCP_SERVER_VERSION,
  resolveSafeChildPath,
} from './github-fetcher.js';
import { syncGlobalGeminiMd } from '../cli/init-agents-md.js';
import type {
  GlobalSkillAutoSyncResult,
  Manifest,
  ManifestFileEntry,
  OutputLanguageMode,
  UpdateAvailabilityInfo,
  VersionStampData,
} from '../types.js';

export const VERSION_STAMP_FILENAME = '.qa-11x-version';
export const LATEST_CHECK_CACHE_FILENAME = 'latest-version-check.json';
export const DEFAULT_VERSION_TTL_MS = 24 * 60 * 60 * 1000;
export const NPM_LATEST_URL = 'https://registry.npmjs.org/@sinfallas/mcp-qa-11x/latest';
export const DEFAULT_NPM_TIMEOUT_MS = 2500;
export const RECOMMENDED_UPDATE_CMD =
  'npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile';

const UTF8 = 'utf-8';
const SKILLS_PREFIX = '.agents/skills/';
const ANCHOR_SKILL_REL = path.join('qa-11x-architect', 'SKILL.md');
const ANCHOR_SKILL_MANIFEST_PATH = '.agents/skills/qa-11x-architect/SKILL.md';
const LEGACY_UNSTAMPED_VERSION = 'pre-2.20.0';
const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';

interface LatestVersionCheckCache {
  latest_version: string;
  checked_at_ms: number;
}

export interface EvaluateUpdateOptions {
  projectPath: string;
  homeDir?: string;
  fetcher?: GitHubFetcher;
  runningMcpVersion?: string;
  allowNetworkCheck?: boolean;
  ttlMs?: number;
  nowMs?: number;
  fetchFn?: typeof fetch;
  npmTimeoutMs?: number;
}

export interface AutoSyncGlobalSkillsOptions {
  homeDir?: string;
  fetcher?: GitHubFetcher;
  onLog?: (message: string) => void;
}

export function parseSemver(raw: string | null | undefined): [number, number, number] | null {
  if (!raw) return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export function isStrictlyNewer(
  candidate: string | null | undefined,
  current: string | null | undefined
): boolean {
  if (!candidate || !current) return false;
  return compareSemver(candidate, current) > 0;
}

export function pickHigherSemver(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const validA = a && parseSemver(a) ? a.trim().replace(/^v/, '') : null;
  const validB = b && parseSemver(b) ? b.trim().replace(/^v/, '') : null;
  if (!validA) return validB;
  if (!validB) return validA;
  return compareSemver(validB, validA) > 0 ? validB : validA;
}

export function writeVersionStamp(
  targetDir: string,
  blueprintVersion: string,
  mcpVersion: string = MCP_SERVER_VERSION
): string {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const stampPath = path.join(targetDir, VERSION_STAMP_FILENAME);
  const payload: VersionStampData = {
    blueprint_version: blueprintVersion.trim().replace(/^v/, ''),
    mcp_version: mcpVersion.trim().replace(/^v/, ''),
    updated_at_utc: new Date().toISOString(),
  };
  fs.writeFileSync(stampPath, `${JSON.stringify(payload, null, 2)}\n`, UTF8);
  return stampPath;
}

export function readVersionStamp(targetDir: string): string | null {
  const stampPath = path.join(targetDir, VERSION_STAMP_FILENAME);
  if (!fs.existsSync(stampPath)) return null;
  try {
    const raw = fs.readFileSync(stampPath, UTF8).trim();
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<VersionStampData>;
      const candidate = parsed.blueprint_version || parsed.mcp_version || '';
      return parseSemver(candidate) ? candidate.trim().replace(/^v/, '') : null;
    }
    return parseSemver(raw) ? raw.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

export function resolveGlobalSkillCandidateDirs(homeDir: string): string[] {
  return [
    path.join(homeDir, '.gemini', 'config', 'skills'),
    path.join(homeDir, '.gemini', 'antigravity', 'skills'),
    path.join(homeDir, '.claude', 'skills'),
    path.join(homeDir, '.hermes', 'skills'),
    path.join(homeDir, '.cursor', 'skills'),
    path.join(homeDir, '.codeium', 'windsurf', 'skills'),
    path.join(homeDir, '.codex', 'skills'),
  ];
}

export function detectExistingQa11xSkillDirs(homeDir: string): string[] {
  return resolveGlobalSkillCandidateDirs(homeDir).filter(
    (dir) =>
      fs.existsSync(path.join(dir, ANCHOR_SKILL_REL)) ||
      fs.existsSync(path.join(dir, VERSION_STAMP_FILENAME))
  );
}

function isSourceBlueprintsMonorepo(projectPath: string): boolean {
  try {
    const pkgPath = path.join(projectPath, 'mcp-server', 'package.json');
    if (fs.existsSync(pkgPath) && fs.readFileSync(pkgPath, UTF8).includes('@sinfallas/mcp-qa-11x')) {
      return true;
    }
    const manifestPath = path.join(projectPath, 'manifest.json');
    return (
      fs.existsSync(manifestPath) &&
      fs.readFileSync(manifestPath, UTF8).includes('qa-testing-blueprints')
    );
  } catch {
    return false;
  }
}

function readCachedManifestSafe(cacheDir: string): Manifest | null {
  const manifestPath = path.join(cacheDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, UTF8)) as Manifest;
  } catch {
    return null;
  }
}

function readLatestCheckCache(cacheDir: string): LatestVersionCheckCache | null {
  const checkPath = path.join(cacheDir, LATEST_CHECK_CACHE_FILENAME);
  if (!fs.existsSync(checkPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(checkPath, UTF8)) as Partial<LatestVersionCheckCache>;
    if (
      typeof parsed.latest_version === 'string' &&
      parseSemver(parsed.latest_version) &&
      typeof parsed.checked_at_ms === 'number'
    ) {
      return {
        latest_version: parsed.latest_version.trim().replace(/^v/, ''),
        checked_at_ms: parsed.checked_at_ms,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeLatestCheckCache(cacheDir: string, latestVersion: string, nowMs: number): void {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const payload: LatestVersionCheckCache = {
      latest_version: latestVersion,
      checked_at_ms: nowMs,
    };
    fs.writeFileSync(
      path.join(cacheDir, LATEST_CHECK_CACHE_FILENAME),
      `${JSON.stringify(payload, null, 2)}\n`,
      UTF8
    );
  } catch {
    // Fail-open si el directorio de caché es de solo lectura
  }
}

async function fetchNpmLatestVersion(
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  try {
    const response = await fetchFn(NPM_LATEST_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    return data.version && parseSemver(data.version) ? data.version.trim().replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

async function fetchManifestVersionFailOpen(fetcher: GitHubFetcher): Promise<string | null> {
  try {
    const manifest = await fetcher.fetchManifest();
    return parseSemver(manifest.blueprint_version)
      ? manifest.blueprint_version.trim().replace(/^v/, '')
      : null;
  } catch {
    return null;
  }
}

export async function resolveLatestPublishedVersion(
  options: Omit<EvaluateUpdateOptions, 'projectPath' | 'homeDir'> = {}
): Promise<string> {
  const fetcher = options.fetcher ?? new GitHubFetcher();
  const runningVer = (options.runningMcpVersion ?? MCP_SERVER_VERSION).trim().replace(/^v/, '');
  const ttlMs = options.ttlMs ?? DEFAULT_VERSION_TTL_MS;
  const nowMs = options.nowMs ?? Date.now();
  const fetchFn = options.fetchFn ?? fetch;
  const npmTimeoutMs = options.npmTimeoutMs ?? DEFAULT_NPM_TIMEOUT_MS;
  const defaultAllowNetwork =
    process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test';
  const allowNetwork = options.allowNetworkCheck ?? defaultAllowNetwork;

  const cacheDir = fetcher.getCacheDir();
  const cachedManifest = readCachedManifestSafe(cacheDir);
  const checkCache = readLatestCheckCache(cacheDir);
  let best = pickHigherSemver(runningVer, cachedManifest?.blueprint_version) as string;
  best = pickHigherSemver(best, checkCache?.latest_version) as string;

  const isCacheFresh = checkCache !== null && nowMs - checkCache.checked_at_ms < ttlMs;
  if (allowNetwork && !isCacheFresh) {
    const [manifestVer, npmVer] = await Promise.all([
      fetchManifestVersionFailOpen(fetcher),
      fetchNpmLatestVersion(fetchFn, npmTimeoutMs),
    ]);
    const fetchedBest = pickHigherSemver(manifestVer, npmVer);
    if (fetchedBest) {
      best = pickHigherSemver(best, fetchedBest) as string;
      writeLatestCheckCache(cacheDir, best, nowMs);
    }
  }

  return best;
}

function inferUnstampedSkillDirVersion(
  skillDir: string,
  cachedManifest: Manifest | null,
  fetcher: GitHubFetcher
): string {
  const anchorFile = path.join(skillDir, ANCHOR_SKILL_REL);
  if (!cachedManifest || !fs.existsSync(anchorFile)) {
    return LEGACY_UNSTAMPED_VERSION;
  }
  const entry = cachedManifest.agent_governance_files.find(
    (item) => item.path === ANCHOR_SKILL_MANIFEST_PATH
  );
  if (!entry) return LEGACY_UNSTAMPED_VERSION;
  const localHash = fetcher.computeSha256(fs.readFileSync(anchorFile));
  return localHash === entry.sha256
    ? cachedManifest.blueprint_version
    : LEGACY_UNSTAMPED_VERSION;
}

function evaluateGlobalSkillsState(
  homeDir: string,
  latestVersion: string,
  fetcher: GitHubFetcher
): { version: string | null; outdated: boolean } {
  const installedDirs = detectExistingQa11xSkillDirs(homeDir);
  if (installedDirs.length === 0) {
    return { version: null, outdated: false };
  }
  const cachedManifest = readCachedManifestSafe(fetcher.getCacheDir());
  let lowestSemver: string | null = null;
  let hasLegacyUnstamped = false;
  let outdated = false;

  for (const dir of installedDirs) {
    const resolvedVer =
      readVersionStamp(dir) ?? inferUnstampedSkillDirVersion(dir, cachedManifest, fetcher);
    if (resolvedVer === LEGACY_UNSTAMPED_VERSION) {
      hasLegacyUnstamped = true;
      outdated = true;
    } else {
      if (isStrictlyNewer(latestVersion, resolvedVer)) {
        outdated = true;
      }
      if (!lowestSemver || compareSemver(resolvedVer, lowestSemver) < 0) {
        lowestSemver = resolvedVer;
      }
    }
  }

  return {
    version: hasLegacyUnstamped ? LEGACY_UNSTAMPED_VERSION : lowestSemver,
    outdated,
  };
}

function evaluateProjectScriptsState(
  projectPath: string,
  latestVersion: string
): { version: string | null; outdated: boolean } {
  if (isSourceBlueprintsMonorepo(projectPath)) {
    return { version: latestVersion, outdated: false };
  }
  const agentsDir = path.join(projectPath, '.agents');
  const localSkillsDir = path.join(agentsDir, 'skills');
  const stamp = readVersionStamp(agentsDir) ?? readVersionStamp(localSkillsDir);
  if (stamp) {
    return {
      version: stamp,
      outdated: isStrictlyNewer(latestVersion, stamp),
    };
  }
  const hasInstalledArtifacts =
    fs.existsSync(path.join(agentsDir, 'scripts', 'certify_task_completion.sh')) ||
    fs.existsSync(path.join(localSkillsDir, ANCHOR_SKILL_REL));
  if (hasInstalledArtifacts) {
    return { version: LEGACY_UNSTAMPED_VERSION, outdated: true };
  }
  return { version: null, outdated: false };
}

function buildAgentUpdateNotice(
  latestVersion: string,
  runningMcpVersion: string,
  mcpOutdated: boolean,
  globalState: { version: string | null; outdated: boolean },
  projectState: { version: string | null; outdated: boolean }
): string {
  const details: string[] = [];
  if (mcpOutdated) {
    details.push(`servidor MCP activo en ${runningMcpVersion}`);
  }
  if (globalState.outdated && globalState.version) {
    details.push(`skills globales en ${globalState.version}`);
  }
  if (projectState.outdated && projectState.version) {
    details.push(`scripts/skills locales en ${projectState.version}`);
  }
  return `Hay una nueva versión ${latestVersion} publicada (${details.join(', ')}); notifica al usuario en el chat y sugiere ejecutar: ${RECOMMENDED_UPDATE_CMD}`;
}

export async function evaluateUpdateStatus(
  options: EvaluateUpdateOptions
): Promise<UpdateAvailabilityInfo> {
  const fetcher = options.fetcher ?? new GitHubFetcher();
  const homeDir = options.homeDir ?? (process.env.HOME || os.homedir());
  const runningVer = (options.runningMcpVersion ?? MCP_SERVER_VERSION).trim().replace(/^v/, '');
  const latestVersion = await resolveLatestPublishedVersion({
    fetcher,
    runningMcpVersion: runningVer,
    allowNetworkCheck: options.allowNetworkCheck,
    ttlMs: options.ttlMs,
    nowMs: options.nowMs,
    fetchFn: options.fetchFn,
    npmTimeoutMs: options.npmTimeoutMs,
  });

  const mcpOutdated = isStrictlyNewer(latestVersion, runningVer);
  const globalState = evaluateGlobalSkillsState(homeDir, latestVersion, fetcher);
  const projectState = evaluateProjectScriptsState(options.projectPath, latestVersion);
  const updateNeeded = mcpOutdated || globalState.outdated || projectState.outdated;

  return {
    update_needed: updateNeeded,
    latest_version: latestVersion,
    running_mcp_version: runningVer,
    installed_global_skills_version: globalState.version,
    installed_project_scripts_version: projectState.version,
    mcp_outdated: mcpOutdated,
    global_skills_outdated: globalState.outdated,
    project_scripts_outdated: projectState.outdated,
    recommended_command: updateNeeded ? RECOMMENDED_UPDATE_CMD : null,
    agent_notice: updateNeeded
      ? buildAgentUpdateNotice(latestVersion, runningVer, mcpOutdated, globalState, projectState)
      : null,
  };
}

function detectGeminiConnectorLang(content: string): OutputLanguageMode {
  if (content.includes('Conector Global Thin-Client QA 11X')) return 'es';
  if (content.includes('strictly in **English**')) return 'en';
  return 'auto';
}

function syncExistingGeminiConnectorIfPresent(homeDir: string): void {
  const geminiMdPath = path.join(homeDir, '.gemini', 'GEMINI.md');
  if (!fs.existsSync(geminiMdPath)) return;
  const existing = fs.readFileSync(geminiMdPath, UTF8);
  if (!existing.includes(CONNECTOR_START_MARKER)) return;
  syncGlobalGeminiMd(homeDir, false, detectGeminiConnectorLang(existing));
}

function collectOutdatedDestinationsForEntry(
  targetDirs: string[],
  relSkillPath: string,
  expectedSha256: string,
  fetcher: GitHubFetcher
): string[] {
  const outdatedDirs: string[] = [];
  for (const dir of targetDirs) {
    const targetFile = resolveSafeChildPath(dir, relSkillPath);
    if (!fs.existsSync(targetFile)) {
      outdatedDirs.push(dir);
    } else {
      const actualSha = fetcher.computeSha256(fs.readFileSync(targetFile));
      if (actualSha !== expectedSha256) {
        outdatedDirs.push(dir);
      }
    }
  }
  return outdatedDirs;
}

async function syncSkillEntryAcrossDirs(
  entry: ManifestFileEntry,
  targetDirs: string[],
  fetcher: GitHubFetcher
): Promise<number> {
  const relSkillPath = entry.path.slice(SKILLS_PREFIX.length);
  const outdatedDirs = collectOutdatedDestinationsForEntry(
    targetDirs,
    relSkillPath,
    entry.sha256,
    fetcher
  );
  if (outdatedDirs.length === 0) return 0;

  const verifiedContent = await fetcher.fetchFileContent(entry.path, entry.sha256);
  for (const dir of outdatedDirs) {
    const fullPath = resolveSafeChildPath(dir, relSkillPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, verifiedContent, UTF8);
  }
  return outdatedDirs.length;
}

export async function syncGlobalSkillsInBackground(
  options: AutoSyncGlobalSkillsOptions = {}
): Promise<GlobalSkillAutoSyncResult> {
  const homeDir = options.homeDir ?? (process.env.HOME || os.homedir());
  const fetcher = options.fetcher ?? new GitHubFetcher();
  const logFn = options.onLog ?? ((msg: string) => console.error(msg));
  const targetDirs = detectExistingQa11xSkillDirs(homeDir);

  if (targetDirs.length === 0) {
    return {
      synced: false,
      manifest_version: null,
      target_dirs: [],
      updated_files_count: 0,
    };
  }

  try {
    const manifest = await fetcher.fetchManifest();
    const skillEntries = manifest.agent_governance_files.filter((item) =>
      item.path.startsWith(SKILLS_PREFIX)
    );
    let updatedFilesCount = 0;

    for (const entry of skillEntries) {
      updatedFilesCount += await syncSkillEntryAcrossDirs(entry, targetDirs, fetcher);
    }

    for (const dir of targetDirs) {
      if (updatedFilesCount > 0 || readVersionStamp(dir) !== manifest.blueprint_version) {
        writeVersionStamp(dir, manifest.blueprint_version);
      }
    }

    if (updatedFilesCount > 0) {
      syncExistingGeminiConnectorIfPresent(homeDir);
      logFn(
        `✔ [QA-11X Auto-Sync] ${updatedFilesCount} archivo(s) de skills globales actualizado(s) a v${manifest.blueprint_version} (SHA-256 verificado).`
      );
    }

    return {
      synced: updatedFilesCount > 0,
      manifest_version: manifest.blueprint_version,
      target_dirs: targetDirs,
      updated_files_count: updatedFilesCount,
    };
  } catch {
    return {
      synced: false,
      manifest_version: null,
      target_dirs: targetDirs,
      updated_files_count: 0,
    };
  }
}
