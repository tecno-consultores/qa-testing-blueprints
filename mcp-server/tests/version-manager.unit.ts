// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareSemver,
  DEFAULT_VERSION_TTL_MS,
  detectExistingQa11xSkillDirs,
  evaluateUpdateStatus,
  isStrictlyNewer,
  LATEST_CHECK_CACHE_FILENAME,
  parseSemver,
  pickHigherSemver,
  readVersionStamp,
  RECOMMENDED_UPDATE_CMD,
  resolveLatestPublishedVersion,
  syncGlobalSkillsInBackground,
  VERSION_STAMP_FILENAME,
  writeVersionStamp,
} from '../src/services/version-manager.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import type { Manifest } from '../src/types.js';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

function buildTestManifest(blueprintVersion: string, skillContent: string, scriptContent = '#!/bin/sh\necho ok\n'): Manifest {
  return {
    schema_version: '1.0.0',
    blueprint_version: blueprintVersion,
    generated_at_utc: '2026-11-12T00:00:00Z',
    repository: 'tecno-consultores/qa-testing-blueprints',
    default_branch: 'main',
    raw_base_url: 'https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main',
    stacks: {},
    common_files: [],
    agent_governance_files: [
      {
        path: '.agents/skills/qa-11x-architect/SKILL.md',
        target_name: '.agents/skills/qa-11x-architect/SKILL.md',
        merge_strategy: 'overwrite',
        sha256: sha256(skillContent),
        size_bytes: Buffer.byteLength(skillContent),
      },
      {
        path: '.agents/scripts/certify_task_completion.sh',
        target_name: '.agents/scripts/certify_task_completion.sh',
        merge_strategy: 'overwrite_executable',
        sha256: sha256(scriptContent),
        size_bytes: Buffer.byteLength(scriptContent),
      },
    ],
  };
}

describe('Version Manager, .qa-11x-version Stamp, 24h TTL Fail-Open & Global Auto-Sync (v2.20.0)', () => {
  let tmpRoot: string;
  let fakeHome: string;
  let cacheDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-vermgr-'));
    fakeHome = path.join(tmpRoot, 'home');
    cacheDir = path.join(tmpRoot, 'cache');
    projectDir = path.join(tmpRoot, 'consumer-app');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('SemVer helpers & .qa-11x-version stamp I/O', () => {
    it('parses, compares, and picks highest valid semantic versions', () => {
      expect(parseSemver(null)).toBeNull();
      expect(parseSemver('invalid')).toBeNull();
      expect(parseSemver('v2.20.1')).toEqual([2, 20, 1]);

      expect(compareSemver('2.20.0', '2.19.9')).toBe(1);
      expect(compareSemver('2.19.0', '2.20.0')).toBe(-1);
      expect(compareSemver('3.0.0', '2.99.9')).toBe(1);
      expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemver('2.20.0', '2.20.1')).toBe(-1);
      expect(compareSemver('2.20.2', '2.20.1')).toBe(1);
      expect(compareSemver('2.20.0', 'v2.20.0')).toBe(0);
      expect(compareSemver('bad', '2.20.0')).toBe(0);

      expect(isStrictlyNewer(null, '2.20.0')).toBe(false);
      expect(isStrictlyNewer('2.20.0', null)).toBe(false);
      expect(isStrictlyNewer('2.20.0', '2.19.0')).toBe(true);

      expect(pickHigherSemver(null, 'v2.20.0')).toBe('2.20.0');
      expect(pickHigherSemver('2.19.0', null)).toBe('2.19.0');
      expect(pickHigherSemver('bad', 'bad2')).toBeNull();
      expect(pickHigherSemver('2.19.0', '2.21.0')).toBe('2.21.0');
      expect(pickHigherSemver('2.22.0', '2.21.0')).toBe('2.22.0');
    });

    it('writes and reads JSON, plain-text, empty, and malformed .qa-11x-version stamps safely', () => {
      const target = path.join(tmpRoot, 'nested-skills');
      expect(readVersionStamp(target)).toBeNull();

      const stampFile = writeVersionStamp(target, 'v2.20.0', '2.20.0');
      expect(path.basename(stampFile)).toBe(VERSION_STAMP_FILENAME);
      expect(fs.existsSync(stampFile)).toBe(true);
      expect(readVersionStamp(target)).toBe('2.20.0');

      // Fallback to mcp_version when blueprint_version is omitted
      fs.writeFileSync(stampFile, JSON.stringify({ mcp_version: '2.21.0' }), 'utf-8');
      expect(readVersionStamp(target)).toBe('2.21.0');

      // Invalid JSON version field
      fs.writeFileSync(stampFile, JSON.stringify({ blueprint_version: 'not-semver' }), 'utf-8');
      expect(readVersionStamp(target)).toBeNull();

      // Plain-text semver support
      fs.writeFileSync(stampFile, 'v2.18.3\n', 'utf-8');
      expect(readVersionStamp(target)).toBe('2.18.3');

      // Plain-text invalid and empty
      fs.writeFileSync(stampFile, 'not-a-version', 'utf-8');
      expect(readVersionStamp(target)).toBeNull();
      fs.writeFileSync(stampFile, '   ', 'utf-8');
      expect(readVersionStamp(target)).toBeNull();

      // Corrupted JSON fail-open
      fs.writeFileSync(stampFile, '{broken-json', 'utf-8');
      expect(readVersionStamp(target)).toBeNull();
    });
  });

  describe('24h TTL Cache & Fail-Open Offline Resolution', () => {
    it('reuses cached manifest and 24h check file without hitting network when fresh', async () => {
      const fetcher = new GitHubFetcher({ cacheDir });
      const fetchManifestSpy = vi.spyOn(fetcher, 'fetchManifest');
      const mockFetch = vi.fn();

      const now = 1_700_000_000_000;
      fs.writeFileSync(
        path.join(cacheDir, LATEST_CHECK_CACHE_FILENAME),
        JSON.stringify({ latest_version: '2.24.0', checked_at_ms: now - 1000 }),
        'utf-8'
      );

      const resolved = await resolveLatestPublishedVersion({
        fetcher,
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: true,
        nowMs: now,
        ttlMs: DEFAULT_VERSION_TTL_MS,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(resolved).toBe('2.24.0');
      expect(fetchManifestSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('queries manifest + npmjs when 24h TTL expires and persists fresh cache, failing open offline', async () => {
      const localRepo = path.join(tmpRoot, 'remote-sim');
      fs.mkdirSync(localRepo, { recursive: true });
      const manifest = buildTestManifest('2.21.0', '# Skill 2.21');
      fs.writeFileSync(path.join(localRepo, 'manifest.json'), JSON.stringify(manifest), 'utf-8');

      const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localRepo });
      const now = 1_700_100_000_000;
      // Expired cache (> 24h)
      fs.writeFileSync(
        path.join(cacheDir, LATEST_CHECK_CACHE_FILENAME),
        JSON.stringify({ latest_version: '2.19.0', checked_at_ms: now - DEFAULT_VERSION_TTL_MS - 500 }),
        'utf-8'
      );

      const mockNpmFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '2.22.0' }),
      });

      const resolved = await resolveLatestPublishedVersion({
        fetcher,
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: true,
        nowMs: now,
        fetchFn: mockNpmFetch as unknown as typeof fetch,
      });

      expect(resolved).toBe('2.22.0');
      expect(mockNpmFetch).toHaveBeenCalledTimes(1);
      const savedCache = JSON.parse(
        fs.readFileSync(path.join(cacheDir, LATEST_CHECK_CACHE_FILENAME), 'utf-8')
      ) as { latest_version: string; checked_at_ms: number };
      expect(savedCache.latest_version).toBe('2.22.0');
      expect(savedCache.checked_at_ms).toBe(now);

      // Offline fail-open test (both manifest fetch and npm fetch fail + corrupted cache files)
      const offlineCache = path.join(tmpRoot, 'offline-cache');
      fs.mkdirSync(offlineCache, { recursive: true });
      fs.writeFileSync(path.join(offlineCache, 'manifest.json'), '{corrupt', 'utf-8');
      fs.writeFileSync(path.join(offlineCache, LATEST_CHECK_CACHE_FILENAME), '{"latest_version":"bad"}', 'utf-8');

      const offlineFetcher = new GitHubFetcher({ cacheDir: offlineCache });
      vi.spyOn(offlineFetcher, 'fetchManifest').mockRejectedValue(new Error('ENOTFOUND'));
      const failingFetch = vi.fn().mockRejectedValue(new Error('Network down'));

      const fallbackVer = await resolveLatestPublishedVersion({
        fetcher: offlineFetcher,
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: true,
        nowMs: now,
        fetchFn: failingFetch as unknown as typeof fetch,
      });
      expect(fallbackVer).toBe('2.20.0');

      // Non-200 HTTP from npmjs + invalid blueprint_version in manifest
      vi.spyOn(offlineFetcher, 'fetchManifest').mockResolvedValue({
        ...manifest,
        blueprint_version: 'invalid',
      });
      const nonOkFetch = vi.fn().mockResolvedValue({ ok: false });
      const fallbackNonOk = await resolveLatestPublishedVersion({
        fetcher: offlineFetcher,
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: true,
        nowMs: now,
        fetchFn: nonOkFetch as unknown as typeof fetch,
      });
      expect(fallbackNonOk).toBe('2.20.0');
    });
  });

  describe('evaluateUpdateStatus, inspect_project_config & certify_11x_gate integration', () => {
    it('detects outdated MCP, global skills (stamped & legacy unstamped), and local project scripts', async () => {
      const skillBody = '# Skill v2.21.0\n';
      const manifest221 = buildTestManifest('2.21.0', skillBody);
      fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(manifest221), 'utf-8');
      const fetcher = new GitHubFetcher({ cacheDir });

      // 1. Legacy unstamped global skill + legacy unstamped local script
      const claudeSkillFile = path.join(fakeHome, '.claude', 'skills', 'qa-11x-architect', 'SKILL.md');
      fs.mkdirSync(path.dirname(claudeSkillFile), { recursive: true });
      fs.writeFileSync(claudeSkillFile, '# Old v2.18 skill\n', 'utf-8');

      const localScript = path.join(projectDir, '.agents', 'scripts', 'certify_task_completion.sh');
      fs.mkdirSync(path.dirname(localScript), { recursive: true });
      fs.writeFileSync(localScript, '#!/bin/sh\n', 'utf-8');

      const legacyStatus = await evaluateUpdateStatus({
        projectPath: projectDir,
        homeDir: fakeHome,
        fetcher,
        runningMcpVersion: '2.19.0',
        allowNetworkCheck: false,
      });

      expect(legacyStatus.update_needed).toBe(true);
      expect(legacyStatus.latest_version).toBe('2.21.0');
      expect(legacyStatus.mcp_outdated).toBe(true);
      expect(legacyStatus.global_skills_outdated).toBe(true);
      expect(legacyStatus.installed_global_skills_version).toBe('pre-2.20.0');
      expect(legacyStatus.project_scripts_outdated).toBe(true);
      expect(legacyStatus.installed_project_scripts_version).toBe('pre-2.20.0');
      expect(legacyStatus.recommended_command).toBe(RECOMMENDED_UPDATE_CMD);
      expect(legacyStatus.agent_notice).toContain('2.21.0');
      expect(legacyStatus.agent_notice).toContain('install-skill');

      // 2. Unstamped global skill matching current cached manifest SHA-256 -> inferred up-to-date
      fs.writeFileSync(claudeSkillFile, skillBody, 'utf-8');
      writeVersionStamp(path.join(projectDir, '.agents'), '2.21.0');

      const upToDateStatus = await evaluateUpdateStatus({
        projectPath: projectDir,
        homeDir: fakeHome,
        fetcher,
        runningMcpVersion: '2.21.0',
        allowNetworkCheck: false,
      });

      expect(upToDateStatus.update_needed).toBe(false);
      expect(upToDateStatus.installed_global_skills_version).toBe('2.21.0');
      expect(upToDateStatus.installed_project_scripts_version).toBe('2.21.0');
      expect(upToDateStatus.recommended_command).toBeNull();
      expect(upToDateStatus.agent_notice).toBeNull();

      // 3. Multiple global dirs: picks lowest stamped version & surfaces in inspectProjectConfig + certify11xGate
      const cursorSkills = path.join(fakeHome, '.cursor', 'skills');
      writeVersionStamp(path.join(fakeHome, '.claude', 'skills'), '2.21.0');
      writeVersionStamp(cursorSkills, '2.19.0');
      writeVersionStamp(path.join(projectDir, '.agents'), '2.19.0');

      fs.writeFileSync(path.join(projectDir, 'TESTING.md'), '# Testing\n', 'utf-8');
      fs.writeFileSync(path.join(projectDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Item\n', 'utf-8');
      fs.writeFileSync(path.join(projectDir, '.npmrc'), 'ignore-scripts=true\n', 'utf-8');
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"app"}', 'utf-8');

      const inspectRes = await inspectProjectConfig(projectDir, fakeHome, {
        fetcher,
        runningMcpVersion: '2.21.0',
        allowNetworkCheck: false,
      });
      expect(inspectRes.update_available?.update_needed).toBe(true);
      expect(inspectRes.update_available?.installed_global_skills_version).toBe('2.19.0');
      expect(inspectRes.update_available?.project_scripts_outdated).toBe(true);

      const gateRes = await certify11xGate(projectDir, {
        requireLintEvidence: false,
        updateOptions: {
          homeDir: fakeHome,
          fetcher,
          runningMcpVersion: '2.21.0',
          allowNetworkCheck: false,
        },
      });
      expect(gateRes.gate_passed).toBe(true);
      expect(gateRes.update_available?.update_needed).toBe(true);
      expect(gateRes.update_available?.agent_notice).toContain('2.21.0');

      // 4. Source monorepo immunity (qa-testing-blueprints does not require .agents/.qa-11x-version)
      const monoDir = path.join(tmpRoot, 'blueprints-mono');
      fs.mkdirSync(monoDir, { recursive: true });
      fs.writeFileSync(
        path.join(monoDir, 'manifest.json'),
        JSON.stringify({ repository: 'tecno-consultores/qa-testing-blueprints' }),
        'utf-8'
      );
      // Source monorepo via mcp-server/package.json + default call with no options
      const monoPkgDir = path.join(tmpRoot, 'blueprints-pkg');
      fs.mkdirSync(path.join(monoPkgDir, 'mcp-server'), { recursive: true });
      fs.writeFileSync(
        path.join(monoPkgDir, 'mcp-server', 'package.json'),
        JSON.stringify({ name: '@sinfallas/mcp-qa-11x' }),
        'utf-8'
      );
      const monoPkgStatus = await evaluateUpdateStatus({
        projectPath: monoPkgDir,
        homeDir: path.join(tmpRoot, 'empty-home'),
        fetcher,
        runningMcpVersion: '2.21.0',
        allowNetworkCheck: false,
      });
      expect(monoPkgStatus.update_needed).toBe(false);

      // Unstamped global skill when cached manifest is missing or lacks anchor entry
      const noCacheFetcher = new GitHubFetcher({ cacheDir: path.join(tmpRoot, 'no-manifest-cache') });
      const uncachedHome = path.join(tmpRoot, 'uncached-home');
      const uncachedSkill = path.join(uncachedHome, '.claude', 'skills', 'qa-11x-architect', 'SKILL.md');
      fs.mkdirSync(path.dirname(uncachedSkill), { recursive: true });
      fs.writeFileSync(uncachedSkill, '# skill\n', 'utf-8');
      const uncachedStatus = await evaluateUpdateStatus({
        projectPath: monoPkgDir,
        homeDir: uncachedHome,
        fetcher: noCacheFetcher,
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: false,
      });
      expect(uncachedStatus.global_skills_outdated).toBe(true);

      const emptyEntryCache = path.join(tmpRoot, 'empty-entry-cache');
      fs.mkdirSync(emptyEntryCache, { recursive: true });
      fs.writeFileSync(
        path.join(emptyEntryCache, 'manifest.json'),
        JSON.stringify({ ...manifest221, agent_governance_files: [] }),
        'utf-8'
      );
      const emptyEntryStatus = await evaluateUpdateStatus({
        projectPath: monoPkgDir,
        homeDir: uncachedHome,
        fetcher: new GitHubFetcher({ cacheDir: emptyEntryCache }),
        runningMcpVersion: '2.20.0',
        allowNetworkCheck: false,
      });
      expect(emptyEntryStatus.installed_global_skills_version).toBe('pre-2.20.0');

      expect(typeof (await resolveLatestPublishedVersion())).toBe('string');
    });
  });

  describe('CLI install-skill version stamping & Background Global Skill Auto-Sync', () => {
    it('stamps .qa-11x-version on install-skill and silently auto-syncs global skills by SHA-256', async () => {
      const localOrigin = path.join(tmpRoot, 'origin-repo');
      const v1Content = '# Architect v2.19.0\n';
      const scriptContent = '#!/bin/sh\necho gate\n';
      fs.mkdirSync(path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect'), { recursive: true });
      fs.mkdirSync(path.join(localOrigin, '.agents', 'scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'),
        v1Content,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(localOrigin, '.agents', 'scripts', 'certify_task_completion.sh'),
        scriptContent,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(localOrigin, 'manifest.json'),
        JSON.stringify(buildTestManifest('2.19.0', v1Content, scriptContent)),
        'utf-8'
      );

      const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localOrigin });

      // Empty home -> auto-sync is a clean no-op
      const emptySync = await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher });
      expect(emptySync.synced).toBe(false);
      expect(emptySync.target_dirs).toEqual([]);

      // Prepare global .gemini with Spanish connector + run CLI install-skill with --include-scripts
      const geminiDir = path.join(fakeHome, '.gemini');
      fs.mkdirSync(geminiDir, { recursive: true });
      const prevHome = process.env.HOME;
      const prevCwd = process.cwd();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.env.HOME = fakeHome;
        process.chdir(projectDir);
        await runInstallSkillCli(['--lang', 'es', '--include-scripts'], fetcher);
      } finally {
        process.chdir(prevCwd);
        if (prevHome !== undefined) process.env.HOME = prevHome;
      }

      const geminiSkillsDir = path.join(fakeHome, '.gemini', 'config', 'skills');
      expect(detectExistingQa11xSkillDirs(fakeHome)).toContain(geminiSkillsDir);
      expect(readVersionStamp(geminiSkillsDir)).toBe('2.19.0');
      expect(readVersionStamp(path.join(projectDir, '.agents'))).toBe('2.19.0');
      expect(fs.readFileSync(path.join(geminiDir, 'GEMINI.md'), 'utf-8')).toContain(
        'Conector Global Thin-Client QA 11X'
      );

      // Running auto-sync when SHA-256 already matches -> 0 files downloaded
      const noopSync = await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher });
      expect(noopSync.synced).toBe(false);
      expect(noopSync.updated_files_count).toBe(0);

      // Simulate upstream GitHub release 2.20.0 with updated SKILL.md hash + brand-new reference file
      const v2Content = '# Architect v2.20.0 — Updated Auto-Sync\n';
      const newRefContent = '# Reference 09\n';
      const refDir = path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'references');
      fs.mkdirSync(refDir, { recursive: true });
      fs.writeFileSync(path.join(refDir, '09-new.md'), newRefContent, 'utf-8');
      fs.writeFileSync(
        path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'),
        v2Content,
        'utf-8'
      );
      const v2Manifest = buildTestManifest('2.20.0', v2Content, scriptContent);
      v2Manifest.agent_governance_files.push({
        path: '.agents/skills/qa-11x-architect/references/09-new.md',
        target_name: '.agents/skills/qa-11x-architect/references/09-new.md',
        merge_strategy: 'overwrite',
        sha256: sha256(newRefContent),
        size_bytes: Buffer.byteLength(newRefContent),
      });
      fs.writeFileSync(path.join(localOrigin, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const activeSync = await syncGlobalSkillsInBackground({
        homeDir: fakeHome,
        fetcher,
      });

      expect(activeSync.synced).toBe(true);
      expect(activeSync.manifest_version).toBe('2.20.0');
      expect(activeSync.updated_files_count).toBe(2);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('v2.20.0'));
      expect(
        fs.readFileSync(path.join(geminiSkillsDir, 'qa-11x-architect', 'SKILL.md'), 'utf-8')
      ).toBe(v2Content);
      expect(
        fs.readFileSync(
          path.join(geminiSkillsDir, 'qa-11x-architect', 'references', '09-new.md'),
          'utf-8'
        )
      ).toBe(newRefContent);
      expect(readVersionStamp(geminiSkillsDir)).toBe('2.20.0');
      // Preserves Spanish connector in GEMINI.md
      expect(fs.readFileSync(path.join(geminiDir, 'GEMINI.md'), 'utf-8')).toContain(
        'Conector Global Thin-Client QA 11X'
      );

      // Also test English & Auto GEMINI.md connector preservation + missing connector marker
      fs.writeFileSync(
        path.join(geminiDir, 'GEMINI.md'),
        '<!-- QA_11X_MCP_CONNECTOR_START -->\nAlways interact, reason, and write commits/documentation strictly in **English**.\n<!-- QA_11X_MCP_CONNECTOR_END -->\n',
        'utf-8'
      );
      const v3Content = '# Architect v2.20.1\n';
      fs.writeFileSync(
        path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'),
        v3Content,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(localOrigin, 'manifest.json'),
        JSON.stringify(buildTestManifest('2.20.1', v3Content, scriptContent)),
        'utf-8'
      );
      await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher, onLog: () => {} });
      expect(fs.readFileSync(path.join(geminiDir, 'GEMINI.md'), 'utf-8')).toContain(
        'strictly in **English**'
      );

      fs.writeFileSync(path.join(geminiDir, 'GEMINI.md'), '# Custom without markers\n', 'utf-8');
      const v4Content = '# Architect v2.20.2\n';
      fs.writeFileSync(
        path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'),
        v4Content,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(localOrigin, 'manifest.json'),
        JSON.stringify(buildTestManifest('2.20.2', v4Content, scriptContent)),
        'utf-8'
      );
      await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher, onLog: () => {} });
      expect(fs.readFileSync(path.join(geminiDir, 'GEMINI.md'), 'utf-8')).toBe(
        '# Custom without markers\n'
      );

      // Fail-open when fetcher throws during background startup sync
      vi.spyOn(fetcher, 'fetchManifest').mockRejectedValue(new Error('offline'));
      const failedSync = await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher });
      expect(failedSync.synced).toBe(false);
    });
  });
});
