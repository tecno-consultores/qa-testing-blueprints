// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMockState: {
  dockerBehavior: 'pass-through' | 'version' | 'empty' | 'throw';
  dockerVersionText: string;
} = vi.hoisted(() => ({
  dockerBehavior: 'pass-through',
  dockerVersionText: '27.4.0\n',
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((file: string, args?: readonly string[], options?: unknown) => {
      if (file === 'docker' && childProcessMockState.dockerBehavior !== 'pass-through') {
        if (childProcessMockState.dockerBehavior === 'throw') {
          throw new Error('docker ENOENT');
        }
        if (childProcessMockState.dockerBehavior === 'empty') {
          return '   \n';
        }
        return childProcessMockState.dockerVersionText;
      }
      return actual.execFileSync(file, args as string[], options as never);
    }) as typeof actual.execFileSync,
  };
});

import {
  formatCliJson,
  hasHelpFlag,
  readNextFlagValue,
  resolveCliProjectPath,
} from '../src/cli/cliArgHelpers.js';
import {
  DOCTOR_HELP_TEXT,
  type DoctorReport,
  runDoctorCli,
} from '../src/cli/doctor.js';
import {
  UPGRADE_HELP_TEXT,
  type UpgradeReport,
  runUpgradeCli,
} from '../src/cli/upgrade.js';
import { parseCliArgs, runCli } from '../src/cli.js';
import { dispatchCliArgs } from '../src/index.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from '../src/services/github-fetcher.js';
import { writeVersionStamp } from '../src/services/version-manager.js';

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

interface SeedNpxPackageOptions {
  homeDir: string;
  hashDir: string;
  pkgJsonContent: string | null;
  extraPkgDeps?: Record<string, string> | null;
  withBin?: boolean;
}

function seedNpxPackage(options: SeedNpxPackageOptions): string {
  const { homeDir, hashDir, pkgJsonContent, extraPkgDeps = null, withBin = false } = options;
  const hashPath = path.join(homeDir, '.npm', '_npx', hashDir);
  writeFile(
    path.join(hashPath, 'node_modules', '@sinfallas', 'mcp-qa-11x', 'package.json'),
    JSON.stringify({ name: '@sinfallas/mcp-qa-11x', version: '3.0.0' })
  );
  if (pkgJsonContent !== null) {
    writeFile(path.join(hashPath, 'package.json'), pkgJsonContent);
  }
  if (extraPkgDeps) {
    for (const depName of Object.keys(extraPkgDeps)) {
      if (depName !== '@sinfallas/mcp-qa-11x') {
        const parts = depName.split('/');
        writeFile(
          path.join(hashPath, 'node_modules', ...parts, 'package.json'),
          JSON.stringify({ name: depName, version: '1.0.0' })
        );
      }
    }
  }
  if (withBin) {
    writeFile(path.join(hashPath, 'node_modules', '.bin', 'mcp-qa-11x'), '#!/usr/bin/env node\n');
  }
  return hashPath;
}

describe('CLI Arg Helpers, Doctor & Upgrade Subcommands (QA-11X)', () => {
  let tmpRoot: string;
  let homeDir: string;
  let projDir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-doc-upg-'));
    homeDir = path.join(tmpRoot, 'home');
    projDir = path.join(tmpRoot, 'project');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });
    prevHome = process.env.HOME;
    childProcessMockState.dockerBehavior = 'pass-through';
  });

  afterEach(() => {
    childProcessMockState.dockerBehavior = 'pass-through';
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('cliArgHelpers', () => {
    it('detects help flags, reads flag values safely, resolves paths, and redacts JSON secrets', () => {
      expect(hasHelpFlag(['--help'])).toBe(true);
      expect(hasHelpFlag(['-h'])).toBe(true);
      expect(hasHelpFlag(['--json'])).toBe(false);

      expect(readNextFlagValue(['-p', projDir], 0, '-p')).toBe(projDir);
      expect(() => readNextFlagValue(['-p'], 0, '-p')).toThrow(/requiere un valor/);
      expect(() => readNextFlagValue(['-p', ''], 0, '-p')).toThrow(/requiere un valor/);
      expect(() => readNextFlagValue(['-p', '--json'], 0, '-p')).toThrow(/requiere un valor/);

      const expectedProj = fs.realpathSync(projDir);
      expect(resolveCliProjectPath(undefined, projDir)).toBe(expectedProj);
      expect(resolveCliProjectPath('   ', projDir)).toBe(expectedProj);
      expect(resolveCliProjectPath('.', projDir)).toBe(expectedProj);
      expect(resolveCliProjectPath(projDir, tmpRoot)).toBe(expectedProj);

      const nested = path.join(projDir, 'sub');
      fs.mkdirSync(nested, { recursive: true });
      expect(resolveCliProjectPath('sub', projDir)).toBe(fs.realpathSync(nested));
      expect(() => resolveCliProjectPath('../escape', projDir)).toThrow();

      const syntheticToken = ['sk', 'proj', 'dummyabcdefghijklmnopqrstuvwxyz1234'].join('-');
      const serialized = formatCliJson({
        ok: true,
        apiKey: syntheticToken,
      });
      expect(serialized).toContain('[REDACTED_SECRET]');
      expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz1234');
    });
  });

  describe('doctor subcommand & status alias', () => {
    it('returns DOCTOR_HELP_TEXT on --help and -h with exitCode 0', async () => {
      const resHelp = await runDoctorCli(['--help']);
      expect(resHelp.exitCode).toBe(0);
      expect(resHelp.output).toBe(DOCTOR_HELP_TEXT);

      const resShort = await runDoctorCli(['-h']);
      expect(resShort.exitCode).toBe(0);
      expect(resShort.output).toBe(DOCTOR_HELP_TEXT);
    });

    it('rejects unknown flags, missing flag values, and unexpected second positionals', async () => {
      const unknown = await runDoctorCli(['--invalid-flag'], { cwd: projDir, homeDir });
      expect(unknown.exitCode).toBe(1);
      expect(unknown.isError).toBe(true);
      expect(unknown.output).toContain('❌ [doctor]');

      const extraPos = await runDoctorCli([projDir, tmpRoot], { cwd: projDir, homeDir });
      expect(extraPos.exitCode).toBe(1);
      expect(extraPos.isError).toBe(true);

      const missingVal = await runDoctorCli(['-p'], { cwd: projDir, homeDir });
      expect(missingVal.exitCode).toBe(1);
      expect(missingVal.isError).toBe(true);
    });

    it('detects all binary_origin variants (npx-cache POSIX/Windows, local-workspace, global-bin)', async () => {
      const npxPosix = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: '/tmp/home/.npm/_npx/h1/node_modules/@sinfallas/mcp-qa-11x/dist/index.js',
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(npxPosix.output) as DoctorReport).binary_origin).toBe('npx-cache');

      const npxWin = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: 'C:\\Users\\dev\\.npm\\_npx\\h1\\index.js',
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(npxWin.output) as DoctorReport).binary_origin).toBe('npx-cache');

      const emptyEntry = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: '',
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(emptyEntry.output) as DoctorReport).binary_origin).toBe('local-workspace');

      const localExact = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: fs.realpathSync(projDir),
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(localExact.output) as DoctorReport).binary_origin).toBe('local-workspace');

      const localNested = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: path.join(fs.realpathSync(projDir), 'dist', 'index.js'),
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(localNested.output) as DoctorReport).binary_origin).toBe('local-workspace');

      const nodeModulesLocal = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: path.join(fs.realpathSync(projDir), 'node_modules', '@sinfallas', 'mcp-qa-11x', 'dist', 'index.js'),
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(nodeModulesLocal.output) as DoctorReport).binary_origin).toBe('global-bin');

      const outsideBin = await runDoctorCli(['--offline', '--json'], {
        cwd: projDir,
        homeDir,
        entryScriptPath: '/opt/npm-global/bin/mcp-qa-11x',
        dockerProbeFn: () => null,
      });
      expect((JSON.parse(outsideBin.output) as DoctorReport).binary_origin).toBe('global-bin');
    });

    it('audits multiple _npx caches, global skills, IDE configs (JSON/TOML/unreadable), Graphify & update notice', async () => {
      // Seed _npx edge cases: stray file, unrelated hash, valid version, empty version, corrupt JSON
      writeFile(path.join(homeDir, '.npm', '_npx', 'stray-file.txt'), 'ignore');
      writeFile(
        path.join(homeDir, '.npm', '_npx', 'other-only', 'node_modules', 'other', 'package.json'),
        '{"version":"1.0.0"}'
      );
      seedNpxPackage({
        homeDir,
        hashDir: 'hash-a',
        pkgJsonContent: JSON.stringify({ dependencies: { '@sinfallas/mcp-qa-11x': '^3.0.0' } }),
      });
      writeFile(
        path.join(homeDir, '.npm', '_npx', 'hash-b', 'node_modules', '@sinfallas', 'mcp-qa-11x', 'package.json'),
        '{"version":""}'
      );
      writeFile(
        path.join(homeDir, '.npm', '_npx', 'hash-c', 'node_modules', '@sinfallas', 'mcp-qa-11x', 'package.json'),
        '{corrupt'
      );

      // Seed global skills (stamped & unstamped)
      const geminiSkills = path.join(homeDir, '.gemini', 'config', 'skills');
      writeFile(path.join(geminiSkills, 'qa-11x-architect', 'SKILL.md'), '# skill');
      writeVersionStamp(geminiSkills, '3.0.0', '3.0.0');
      const claudeSkills = path.join(homeDir, '.claude', 'skills');
      writeFile(path.join(claudeSkills, 'qa-11x-architect', 'SKILL.md'), '# skill');

      // Seed IDE MCP configs
      writeFile(path.join(homeDir, '.gemini', 'config', 'mcp_config.json'), '{"mcpServers":{"qa-11x":{}}}');
      writeFile(path.join(homeDir, '.codex', 'config.toml'), '[mcp_servers.qa-11x]\ncommand="npx"\n');
      writeFile(path.join(homeDir, '.cursor', 'mcp.json'), '{"mcpServers":{"other":{}}}');
      // Directory at .claude.json triggers readFileSync catch path safely across all UIDs
      fs.mkdirSync(path.join(homeDir, '.claude.json'), { recursive: true });

      // Seed project files (pyproject + graphify)
      writeFile(path.join(projDir, 'pyproject.toml'), '[project]\nname = "sample"\n');
      writeFile(path.join(projDir, 'graphify-out', 'graph.json'), '{"nodes":[],"links":[]}');

      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 })
      );

      const jsonRes = await runDoctorCli(['-p', projDir, '--json'], {
        cwd: tmpRoot,
        homeDir,
        fetchFn: mockFetch,
        dockerProbeFn: () => '27.3.1',
        execPath: '/usr/local/bin/node',
        entryScriptPath: path.join(projDir, 'dist', 'index.js'),
      });
      expect(jsonRes.exitCode).toBe(0);
      const parsed = JSON.parse(jsonRes.output) as DoctorReport;
      expect(parsed.mcp_version).toBe(MCP_SERVER_VERSION);
      expect(parsed.npx_cache.multiple_npx_caches).toBe(true);
      expect(parsed.npx_cache.entries).toHaveLength(3);
      expect(parsed.npx_cache.entries.some((e) => e.version === 'unknown')).toBe(true);
      expect(parsed.global_skills).toHaveLength(2);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'gemini')?.has_qa_11x).toBe(true);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'codex')?.has_qa_11x).toBe(true);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'cursor')).toMatchObject({
        exists: true,
        has_qa_11x: false,
      });
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'claude')).toMatchObject({
        exists: true,
        has_qa_11x: false,
      });
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'windsurf')?.exists).toBe(false);
      expect(parsed.docker_version).toBe('27.3.1');
      expect(parsed.graphify_graph_present).toBe(true);

      const textRes = await runDoctorCli([projDir], {
        cwd: tmpRoot,
        homeDir,
        fetchFn: mockFetch,
        dockerProbeFn: () => '27.3.1',
      });
      expect(textRes.exitCode).toBe(0);
      expect(textRes.output).toContain('múltiples cachés detectados');
      expect(textRes.output).toContain('sin estampa');
      expect(textRes.output).toContain('qa-11x activo');
      expect(textRes.output).toContain('sin qa-11x');
      expect(textRes.output).toContain('no encontrado');
      expect(textRes.output).toContain('Graphify AST: presente');
      expect(textRes.output).toContain('Actualización:');
    });

    it('exercises defaultDockerProbe (success, empty output, and thrown ENOENT) and empty stacks text', async () => {
      childProcessMockState.dockerBehavior = 'version';
      childProcessMockState.dockerVersionText = '27.5.1\n';
      const okProbe = await runDoctorCli([projDir, '--offline', '--json'], { cwd: projDir, homeDir });
      expect((JSON.parse(okProbe.output) as DoctorReport).docker_version).toBe('27.5.1');

      childProcessMockState.dockerBehavior = 'empty';
      const emptyProbe = await runDoctorCli([projDir, '--offline', '--json'], { cwd: projDir, homeDir });
      expect((JSON.parse(emptyProbe.output) as DoctorReport).docker_version).toBeNull();

      childProcessMockState.dockerBehavior = 'throw';
      const throwProbe = await runDoctorCli([projDir, '--offline'], { cwd: projDir, homeDir });
      expect(throwProbe.exitCode).toBe(0);
      expect(throwProbe.output).toContain('stacks: ninguno');
      expect(throwProbe.output).toContain('Docker: no detectado');
      expect(throwProbe.output).toContain('Graphify AST: ausente');
    });

    it('dispatches doctor, status alias, --version --verbose, and -v --json via cli.ts & index.ts', async () => {
      expect(parseCliArgs(['doctor', '--json'])).toMatchObject({
        command: 'doctor',
        rawForwardArgs: ['--json'],
      });

      const logs: string[] = [];
      const errs: string[] = [];
      const docRun = await runCli(['doctor', projDir, '--offline', '--json'], {
        cwd: projDir,
        homeDir,
        dockerProbeFn: () => null,
        log: (m) => logs.push(m),
        errorLog: (m) => errs.push(m),
      });
      expect(docRun.exitCode).toBe(0);
      expect(docRun.command).toBe('doctor');
      expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ mcp_version: MCP_SERVER_VERSION });

      const statusRun = await runCli(['status', projDir, '--offline'], {
        cwd: projDir,
        homeDir,
        dockerProbeFn: () => null,
        log: (m) => logs.push(m),
        errorLog: (m) => errs.push(m),
      });
      expect(statusRun.exitCode).toBe(0);
      expect(statusRun.command).toBe('doctor');

      const errRun = await runCli(['doctor', '--unknown-option'], {
        cwd: projDir,
        homeDir,
        log: (m) => logs.push(m),
        errorLog: (m) => errs.push(m),
      });
      expect(errRun.exitCode).toBe(1);
      expect(errRun.errorMessage).toContain('❌ [doctor]');
      expect(errs).toHaveLength(1);

      process.env.HOME = homeDir;
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tmpRoot, 'bp-cache') });
      expect(await dispatchCliArgs(['--version', '--verbose'], fetcher)).toBe(0);
      expect(await dispatchCliArgs(['-v', '--json'], fetcher)).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      const lastLogged = String(consoleLogSpy.mock.calls[1]?.[0] ?? '{}');
      expect((JSON.parse(lastLogged) as DoctorReport).mcp_version).toBe(MCP_SERVER_VERSION);
    });
  });

  describe('upgrade subcommand & cache-clean alias', () => {
    it('returns UPGRADE_HELP_TEXT on --help and -h, and fails cleanly on invalid arguments', async () => {
      expect((await runUpgradeCli(['--help'])).output).toBe(UPGRADE_HELP_TEXT);
      expect((await runUpgradeCli(['-h'])).exitCode).toBe(0);

      const bad = await runUpgradeCli(['--bogus'], { homeDir });
      expect(bad.exitCode).toBe(1);
      expect(bad.isError).toBe(true);
      expect(bad.output).toContain('❌ [upgrade]');
    });

    it('surgically removes exclusive and shared @sinfallas/mcp-qa-11x caches while preserving neighbor packages', async () => {
      writeFile(path.join(homeDir, '.npm', '_npx', 'stray.txt'), 'keep');
      const unrelatedHash = path.join(homeDir, '.npm', '_npx', 'unrelated');
      writeFile(path.join(unrelatedHash, 'node_modules', '@playwright', 'mcp', 'package.json'), '{}');

      const exclusiveHash = seedNpxPackage({
        homeDir,
        hashDir: 'exclusive',
        pkgJsonContent: JSON.stringify({ dependencies: { '@sinfallas/mcp-qa-11x': '^3.0.0' } }),
      });
      const sharedHash = seedNpxPackage({
        homeDir,
        hashDir: 'shared',
        pkgJsonContent: JSON.stringify({
          dependencies: { '@sinfallas/mcp-qa-11x': '^3.0.0', '@playwright/mcp': '^0.0.1' },
        }),
        extraPkgDeps: { '@playwright/mcp': '^0.0.1' },
        withBin: true,
      });
      const corruptPkgHash = seedNpxPackage({
        homeDir,
        hashDir: 'corrupt-pkg',
        pkgJsonContent: '{invalid-json',
      });
      const noPkgHash = seedNpxPackage({
        homeDir,
        hashDir: 'no-pkg',
        pkgJsonContent: null,
      });
      const nullDepsHash = seedNpxPackage({
        homeDir,
        hashDir: 'null-deps',
        pkgJsonContent: JSON.stringify({ dependencies: null }),
      });
      const bpCacheDir = path.join(homeDir, '.cache', 'qa-11x-blueprints');
      writeFile(path.join(bpCacheDir, 'manifest.json'), '{}');

      // Dry-run leaves everything intact
      const dryJson = await runUpgradeCli(['--dry-run', '--json'], { homeDir });
      expect(dryJson.exitCode).toBe(0);
      const dryReport = JSON.parse(dryJson.output) as UpgradeReport;
      expect(dryReport.dry_run).toBe(true);
      expect(dryReport.removed_paths).toEqual([]);
      expect(dryReport.skills_synced).toBe(false);
      expect(dryReport.targeted_paths.length).toBeGreaterThanOrEqual(6);
      expect(fs.existsSync(exclusiveHash)).toBe(true);

      const dryText = await runUpgradeCli(['--dry-run'], { homeDir });
      expect(dryText.output).toContain('DRY-RUN');
      expect(dryText.output).toContain('objetivo:');

      // Apply surgical removal with --cache-only
      const applied = await runUpgradeCli(['--cache-only', '--json'], { homeDir });
      expect(applied.exitCode).toBe(0);
      const appliedReport = JSON.parse(applied.output) as UpgradeReport;
      expect(appliedReport.cache_only).toBe(true);
      expect(appliedReport.skills_synced).toBe(false);
      expect(appliedReport.removed_paths).toEqual(appliedReport.targeted_paths);

      // Exclusive hash & blueprints cache removed completely
      expect(fs.existsSync(exclusiveHash)).toBe(false);
      expect(fs.existsSync(bpCacheDir)).toBe(false);
      // Shared hash preserved with @playwright/mcp, while mcp-qa-11x & .bin removed
      expect(fs.existsSync(sharedHash)).toBe(true);
      expect(fs.existsSync(path.join(sharedHash, 'node_modules', '@playwright', 'mcp', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(sharedHash, 'node_modules', '@sinfallas', 'mcp-qa-11x'))).toBe(false);
      expect(fs.existsSync(path.join(sharedHash, 'node_modules', '.bin', 'mcp-qa-11x'))).toBe(false);
      // Unrelated hash & fallback hashes preserved without mcp-qa-11x
      expect(fs.existsSync(path.join(unrelatedHash, 'node_modules', '@playwright', 'mcp', 'package.json'))).toBe(true);
      expect(fs.existsSync(corruptPkgHash)).toBe(true);
      expect(fs.existsSync(path.join(corruptPkgHash, 'node_modules', '@sinfallas', 'mcp-qa-11x'))).toBe(false);
      expect(fs.existsSync(noPkgHash)).toBe(true);
      expect(fs.existsSync(nullDepsHash)).toBe(true);
    });

    it('executes installSkillRunner when neither --cache-only nor --offline nor --dry-run, and handles errors', async () => {
      const installSpy = vi.fn().mockResolvedValue(undefined);
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tmpRoot, 'bp-cache') });

      const fullRes = await runUpgradeCli(['-t', 'claude'], {
        homeDir,
        fetcher,
        installSkillRunner: installSpy,
      });
      expect(fullRes.exitCode).toBe(0);
      expect(installSpy).toHaveBeenCalledWith(['--target', 'claude', '--reconcile'], fetcher);
      expect(fullRes.output).toContain('APLICADO');
      expect(fullRes.output).toContain('skills_synced=true');

      const offlineRes = await runUpgradeCli(['--target', 'all', '--offline', '--json'], {
        homeDir,
        installSkillRunner: installSpy,
      });
      expect(offlineRes.exitCode).toBe(0);
      expect((JSON.parse(offlineRes.output) as UpgradeReport).skills_synced).toBe(false);

      const failingSpy = vi.fn().mockRejectedValue('string-failure');
      const errRes = await runUpgradeCli([], { homeDir, installSkillRunner: failingSpy });
      expect(errRes.exitCode).toBe(1);
      expect(errRes.isError).toBe(true);
      expect(errRes.output).toContain('string-failure');
    });

    it('routes upgrade and cache-clean alias through cli.ts lazy loader', async () => {
      const logs: string[] = [];
      const upg = await runCli(['upgrade', '--dry-run', '--json'], {
        homeDir,
        log: (m) => logs.push(m),
      });
      expect(upg.exitCode).toBe(0);
      expect(upg.command).toBe('upgrade');
      expect((JSON.parse(logs[0] ?? '{}') as UpgradeReport).cache_only).toBe(false);

      const clean = await runCli(['cache-clean', '--dry-run', '--json'], {
        homeDir,
        log: (m) => logs.push(m),
      });
      expect(clean.exitCode).toBe(0);
      expect(clean.command).toBe('upgrade');
      expect((JSON.parse(logs[1] ?? '{}') as UpgradeReport).cache_only).toBe(true);
    });
  });
});
