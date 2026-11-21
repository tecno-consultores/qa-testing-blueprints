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
  resolveGlobalSkillCandidateDirs,
  resolveLatestPublishedVersion,
  syncGlobalSkillsInBackground,
  VERSION_STAMP_FILENAME,
  writeVersionStamp,
} from '../src/services/version-manager.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from '../src/services/github-fetcher.js';
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

    it('rejects dangling .qa-11x-version and symlinked targetDir in writeVersionStamp and runInstallSkillCli', async () => {
      const outsideDir = fs.mkdtempSync(path.join(tmpRoot, 'stamp-outside-'));
      try {
        // 1. Direct writeVersionStamp with dangling .qa-11x-version -> outside/pwned_ver
        const ws1 = path.join(tmpRoot, 'ws-dangling-stamp');
        fs.mkdirSync(ws1, { recursive: true });
        const pwnedVer1 = path.join(outsideDir, 'pwned_ver_direct');
        fs.symlinkSync(pwnedVer1, path.join(ws1, VERSION_STAMP_FILENAME));
        expect(() => writeVersionStamp(ws1, '3.2.0')).toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(pwnedVer1)).toBe(false);

        // 2. Direct writeVersionStamp when targetDir itself is a symlink
        const symTarget = path.join(tmpRoot, 'sym-stamp-dir');
        fs.symlinkSync(outsideDir, symTarget);
        expect(() => writeVersionStamp(symTarget, '3.2.0')).toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, VERSION_STAMP_FILENAME))).toBe(false);

        // 2b. Direct writeVersionStamp with confinementRoot rejects intermediate symlink when leaf does not exist
        const wsConf = path.join(tmpRoot, 'ws-confined-stamp');
        fs.mkdirSync(wsConf, { recursive: true });
        fs.symlinkSync(outsideDir, path.join(wsConf, '.agents'));
        expect(() =>
          writeVersionStamp(path.join(wsConf, '.agents', 'skills'), '3.2.0', undefined, wsConf)
        ).toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, 'skills'))).toBe(false);

        // 3. runInstallSkillCli --target workspace with dangling .agents/skills/.qa-11x-version
        const ws2 = path.join(tmpRoot, 'ws-cli-dangling-stamp');
        const ws2Skills = path.join(ws2, '.agents', 'skills');
        fs.mkdirSync(ws2Skills, { recursive: true });
        const pwnedVer2 = path.join(outsideDir, 'pwned_ver_cli');
        fs.symlinkSync(pwnedVer2, path.join(ws2Skills, VERSION_STAMP_FILENAME));

        const localOrigin = path.join(tmpRoot, 'local-origin-stamp');
        const skillRelDir = path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect');
        fs.mkdirSync(skillRelDir, { recursive: true });
        const skillContent = '# Architect 3.2.0\n';
        fs.writeFileSync(path.join(skillRelDir, 'SKILL.md'), skillContent, 'utf-8');
        fs.writeFileSync(
          path.join(localOrigin, 'manifest.json'),
          JSON.stringify(buildTestManifest('3.2.0', skillContent)),
          'utf-8'
        );
        const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localOrigin });

        await expect(
          runInstallSkillCli(['--target', 'workspace', '--project-path', ws2], fetcher, {
            cwd: ws2,
            homeDir: fakeHome,
            log: () => {},
          })
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(pwnedVer2)).toBe(false);

        // 4. writeVersionStamp without confinementRoot rejects symlinked parent even when leaf does not exist
        const noConfHome = path.join(tmpRoot, 'no-conf-home');
        fs.mkdirSync(noConfHome, { recursive: true });
        fs.symlinkSync(outsideDir, path.join(noConfHome, '.claude'));
        expect(() =>
          writeVersionStamp(path.join(noConfHome, '.claude', 'skills'), '3.2.0')
        ).toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(path.join(outsideDir, 'skills'))).toBe(false);

        // 5. writeVersionStamp without confinementRoot allows symlinked $HOME itself when segments below $HOME are real
        const realHomeTarget = path.join(tmpRoot, 'real-home-target');
        fs.mkdirSync(realHomeTarget, { recursive: true });
        const symHome = path.join(tmpRoot, 'sym-home');
        fs.symlinkSync(realHomeTarget, symHome);
        const prevEnvHome = process.env.HOME;
        try {
          process.env.HOME = symHome;
          const validStamp = writeVersionStamp(path.join(symHome, '.claude', 'skills'), '3.2.0');
          expect(fs.existsSync(validStamp)).toBe(true);
          expect(readVersionStamp(path.join(symHome, '.claude', 'skills'))).toBe('3.2.0');
        } finally {
          if (prevEnvHome !== undefined) process.env.HOME = prevEnvHome;
          else delete process.env.HOME;
        }
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
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
        json: () => Promise.resolve({ version: '2.22.0' }),
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

      // Malformed JSON in latest-version-check.json + read-only/file cacheDir fail-open
      fs.writeFileSync(path.join(offlineCache, LATEST_CHECK_CACHE_FILENAME), '{corrupt', 'utf-8');
      const fileAsCache = path.join(tmpRoot, 'file-as-cache');
      fs.writeFileSync(fileAsCache, 'not-a-directory', 'utf-8');
      const corruptCacheFetcher = new GitHubFetcher({ cacheDir: offlineCache });
      expect(
        await resolveLatestPublishedVersion({
          fetcher: corruptCacheFetcher,
          runningMcpVersion: '2.20.0',
          allowNetworkCheck: false,
        })
      ).toBe('2.20.0');

      const roFetcher = new GitHubFetcher({ cacheDir: fileAsCache });
      vi.spyOn(roFetcher, 'fetchManifest').mockResolvedValue(manifest);
      expect(
        await resolveLatestPublishedVersion({
          fetcher: roFetcher,
          runningMcpVersion: '2.20.0',
          allowNetworkCheck: true,
          nowMs: now,
          fetchFn: nonOkFetch as unknown as typeof fetch,
        })
      ).toBe('2.21.0');

      // Covers AbortSignal branches in fetchNpmLatestVersion (pre-aborted and active combined signal)
      const signalCacheDir = path.join(tmpRoot, 'signal-cache');
      fs.mkdirSync(signalCacheDir, { recursive: true });
      const signalFetcher = new GitHubFetcher({ cacheDir: signalCacheDir });
      vi.spyOn(signalFetcher, 'fetchManifest').mockRejectedValue(new Error('offline-manifest'));
      const abortedController = new AbortController();
      abortedController.abort('cancelled');
      const fetchNeverCalled = vi.fn();
      expect(
        await resolveLatestPublishedVersion({
          fetcher: signalFetcher,
          runningMcpVersion: '2.20.0',
          allowNetworkCheck: true,
          nowMs: now,
          signal: abortedController.signal,
          fetchFn: fetchNeverCalled as unknown as typeof fetch,
        })
      ).toBe('2.20.0');
      expect(fetchNeverCalled).not.toHaveBeenCalled();

      const activeController = new AbortController();
      const activeSignalFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '9.9.9' }),
      });
      expect(
        await resolveLatestPublishedVersion({
          fetcher: signalFetcher,
          runningMcpVersion: '2.20.0',
          allowNetworkCheck: true,
          nowMs: now,
          signal: activeController.signal,
          fetchFn: activeSignalFetch as unknown as typeof fetch,
        })
      ).toBe('9.9.9');
      expect(activeSignalFetch).toHaveBeenCalledTimes(1);
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

      // Corrupt/unreadable mcp-server/package.json directory falls back cleanly (isSourceBlueprintsMonorepo catch)
      const brokenMonoDir = path.join(tmpRoot, 'broken-mono');
      fs.mkdirSync(path.join(brokenMonoDir, 'mcp-server', 'package.json'), { recursive: true });
      const brokenMonoStatus = await evaluateUpdateStatus({
        projectPath: brokenMonoDir,
        homeDir: path.join(tmpRoot, 'empty-home'),
        fetcher,
        runningMcpVersion: '2.21.0',
        allowNetworkCheck: false,
      });
      expect(brokenMonoStatus.installed_project_scripts_version).toBeNull();

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

      const isolatedVerCache = path.join(tmpRoot, 'isolated-latest-cache');
      fs.mkdirSync(isolatedVerCache, { recursive: true });
      const isolatedVerFetcher = new GitHubFetcher({ cacheDir: isolatedVerCache });
      vi.spyOn(isolatedVerFetcher, 'fetchManifest').mockRejectedValue(
        new Error('offline-hermetic-unit')
      );
      expect(await resolveLatestPublishedVersion({ fetcher: isolatedVerFetcher })).toBe(
        MCP_SERVER_VERSION
      );
      const netVer = await resolveLatestPublishedVersion({
        fetcher: isolatedVerFetcher,
        allowNetworkCheck: true,
        runningMcpVersion: '3.0.0',
        fetchFn: () =>
          Promise.resolve(new Response(JSON.stringify({ version: '3.2.0' }), { status: 200 })),
      });
      expect(netVer).toBe('3.2.0');
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
        else delete process.env.HOME;
      }

      const geminiSkillsDir = path.join(fakeHome, '.gemini', 'config', 'skills');
      expect(resolveGlobalSkillCandidateDirs(fakeHome)).toContain(geminiSkillsDir);
      expect(resolveGlobalSkillCandidateDirs(fakeHome)).toHaveLength(7);
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

      // Timeout + external AbortSignal fail-open inside resolveLatestPublishedVersion & onLog catch reporting
      const hangFetcher = {
        getCacheDir: () => path.join(tmpRoot, 'hang-cache'),
        fetchManifest: () => new Promise<never>(() => undefined),
      } as unknown as GitHubFetcher;
      expect(
        await resolveLatestPublishedVersion({
          fetcher: hangFetcher,
          allowNetworkCheck: true,
          npmTimeoutMs: 15,
          fetchFn: () => Promise.resolve(new Response('{}', { status: 500 })),
        })
      ).toBe(MCP_SERVER_VERSION);

      const extAc = new AbortController();
      setTimeout(() => extAc.abort(), 10);
      expect(
        await resolveLatestPublishedVersion({
          fetcher: hangFetcher,
          allowNetworkCheck: true,
          npmTimeoutMs: 500,
          signal: extAc.signal,
          fetchFn: () => Promise.resolve(new Response('{}', { status: 500 })),
        })
      ).toBe(MCP_SERVER_VERSION);

      const capturedWarns: string[] = [];
      const warnSync = await syncGlobalSkillsInBackground({
        homeDir: 123 as unknown as string,
        fetcher,
        onLog: (m) => capturedWarns.push(m),
      });
      expect(warnSync.synced).toBe(false);
      expect(capturedWarns.some((w) => w.includes('[QA-11X Auto-Sync]'))).toBe(true);

      // Fail-open when fetcher throws during background startup sync
      vi.spyOn(fetcher, 'fetchManifest').mockRejectedValue(new Error('offline'));
      const failedSync = await syncGlobalSkillsInBackground({ homeDir: fakeHome, fetcher });
      expect(failedSync.synced).toBe(false);

      // F2.6: wraps entire syncGlobalSkillsInBackground body (including setup/detect) and logs to process.stderr
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const preSetupFail = await syncGlobalSkillsInBackground({
        homeDir: 123 as unknown as string,
        fetcher,
      });
      expect(preSetupFail).toEqual({
        synced: false,
        manifest_version: null,
        target_dirs: [],
        updated_files_count: 0,
      });
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[QA-11X Auto-Sync]'));
      stderrSpy.mockRestore();
    });

    it('rejects CWE-22 symlink escapes in syncGlobalSkillsInBackground, GEMINI.md connector, and version check cache without external writes', async () => {
      const outsideRoot = fs.mkdtempSync(path.join(tmpRoot, 'vm-cwe22-out-'));
      try {
        const localOrigin = path.join(tmpRoot, 'origin-cwe22');
        const newSkillBody = '# Architect 3.2.0 NEW\n';
        fs.mkdirSync(path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect'), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(localOrigin, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'),
          newSkillBody,
          'utf-8'
        );
        fs.writeFileSync(
          path.join(localOrigin, 'manifest.json'),
          JSON.stringify(buildTestManifest('3.2.0', newSkillBody)),
          'utf-8'
        );
        const fetcher = new GitHubFetcher({ cacheDir, localOverridePath: localOrigin });

        // 1. home/.claude -> outside_victim containing skills/qa-11x-architect/SKILL.md ("OLD_CONTENT\n") & .qa-11x-version ("3.0.0\n")
        const victimBase = path.join(outsideRoot, 'victim-claude');
        const victimArchDir = path.join(victimBase, 'skills', 'qa-11x-architect');
        fs.mkdirSync(victimArchDir, { recursive: true });
        fs.writeFileSync(path.join(victimArchDir, 'SKILL.md'), 'OLD_CONTENT\n', 'utf-8');
        fs.writeFileSync(path.join(victimBase, 'skills', '.qa-11x-version'), '3.0.0\n', 'utf-8');

        const homeEscape = path.join(tmpRoot, 'home-claude-escape');
        fs.mkdirSync(homeEscape, { recursive: true });
        fs.symlinkSync(victimBase, path.join(homeEscape, '.claude'));

        // Also seed a valid global dir alongside the escaped one to verify zero partial writes before upfront validation
        const validGeminiSkill = path.join(
          homeEscape,
          '.gemini',
          'config',
          'skills',
          'qa-11x-architect',
          'SKILL.md'
        );
        fs.mkdirSync(path.dirname(validGeminiSkill), { recursive: true });
        fs.writeFileSync(validGeminiSkill, 'GEMINI_OLD\n', 'utf-8');

        const logs1: string[] = [];
        const res1 = await syncGlobalSkillsInBackground({
          homeDir: homeEscape,
          fetcher,
          onLog: (m) => logs1.push(m),
        });
        expect(res1.synced).toBe(false);
        expect(res1.updated_files_count).toBe(0);
        expect(logs1.some((l) => /symlink|confinamiento/i.test(l))).toBe(true);
        expect(fs.readFileSync(path.join(victimArchDir, 'SKILL.md'), 'utf-8')).toBe('OLD_CONTENT\n');
        expect(fs.readdirSync(path.join(victimBase, 'skills')).sort((a, b) => a.localeCompare(b))).toEqual([
          '.qa-11x-version',
          'qa-11x-architect',
        ]);
        expect(fs.readFileSync(validGeminiSkill, 'utf-8')).toBe('GEMINI_OLD\n');

        // 2. Valid global skill dir + home/.gemini/GEMINI.md -> outside_gemini_target
        const homeGeminiSym = path.join(tmpRoot, 'home-gemini-sym');
        const validSkillsDir = path.join(homeGeminiSym, '.gemini', 'config', 'skills');
        fs.mkdirSync(path.join(validSkillsDir, 'qa-11x-architect'), { recursive: true });
        fs.writeFileSync(
          path.join(validSkillsDir, 'qa-11x-architect', 'SKILL.md'),
          'STALE_GEMINI\n',
          'utf-8'
        );
        const outsideGemini = path.join(outsideRoot, 'outside-GEMINI.md');
        fs.writeFileSync(
          outsideGemini,
          '<!-- QA_11X_MCP_CONNECTOR_START -->\nOLD\n<!-- QA_11X_MCP_CONNECTOR_END -->\n',
          'utf-8'
        );
        fs.symlinkSync(outsideGemini, path.join(homeGeminiSym, '.gemini', 'GEMINI.md'));

        const logs2: string[] = [];
        const res2 = await syncGlobalSkillsInBackground({
          homeDir: homeGeminiSym,
          fetcher,
          onLog: (m) => logs2.push(m),
        });
        expect(res2.synced).toBe(false);
        expect(logs2.some((l) => /symlink|confinamiento/i.test(l))).toBe(true);
        expect(fs.readFileSync(outsideGemini, 'utf-8')).toContain('\nOLD\n');

        // 3. Leaf skill SKILL.md symlinked inside valid global skill dir
        const homeLeafSym = path.join(tmpRoot, 'home-leaf-sym');
        const leafArchDir = path.join(homeLeafSym, '.cursor', 'skills', 'qa-11x-architect');
        fs.mkdirSync(leafArchDir, { recursive: true });
        const outsideSkill = path.join(outsideRoot, 'outside-skill.md');
        fs.writeFileSync(outsideSkill, 'SECRET_OUTSIDE\n', 'utf-8');
        fs.symlinkSync(outsideSkill, path.join(leafArchDir, 'SKILL.md'));

        const logs3: string[] = [];
        const res3 = await syncGlobalSkillsInBackground({
          homeDir: homeLeafSym,
          fetcher,
          onLog: (m) => logs3.push(m),
        });
        expect(res3.synced).toBe(false);
        expect(logs3.some((l) => /symlink|confinamiento/i.test(l))).toBe(true);
        expect(fs.readFileSync(outsideSkill, 'utf-8')).toBe('SECRET_OUTSIDE\n');

        // 4. resolveLatestPublishedVersion rejects symlinked cacheDir and dangling latest-version-check.json
        const outsideCacheTarget = path.join(outsideRoot, 'outside-ver-cache');
        fs.mkdirSync(outsideCacheTarget, { recursive: true });
        const symlinkedVerCache = path.join(tmpRoot, 'sym-ver-cache');
        fs.symlinkSync(outsideCacheTarget, symlinkedVerCache);

        const symVerFetcher = new GitHubFetcher({ cacheDir: symlinkedVerCache });
        vi.spyOn(symVerFetcher, 'fetchManifest').mockRejectedValue(
          new Error('offline-hermetic-unit')
        );
        await expect(
          resolveLatestPublishedVersion({
            fetcher: symVerFetcher,
            runningMcpVersion: '2.20.0',
            allowNetworkCheck: true,
            fetchFn: vi.fn().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve({ version: '9.9.9' }),
            }) as unknown as typeof fetch,
          })
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.readdirSync(outsideCacheTarget)).toEqual([]);

        const realVerCache = path.join(tmpRoot, 'real-ver-cache');
        fs.mkdirSync(realVerCache, { recursive: true });
        const danglingCheckTarget = path.join(outsideCacheTarget, 'pwned-latest.json');
        fs.symlinkSync(danglingCheckTarget, path.join(realVerCache, LATEST_CHECK_CACHE_FILENAME));

        const realVerFetcher = new GitHubFetcher({ cacheDir: realVerCache });
        vi.spyOn(realVerFetcher, 'fetchManifest').mockRejectedValue(
          new Error('offline-hermetic-unit')
        );
        await expect(
          resolveLatestPublishedVersion({
            fetcher: realVerFetcher,
            runningMcpVersion: '2.20.0',
            allowNetworkCheck: true,
            fetchFn: vi.fn().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve({ version: '9.9.9' }),
            }) as unknown as typeof fetch,
          })
        ).rejects.toThrow(/symlink|confinamiento/i);
        expect(fs.existsSync(danglingCheckTarget)).toBe(false);
      } finally {
        fs.rmSync(outsideRoot, { recursive: true, force: true });
      }
    });
  });
});
