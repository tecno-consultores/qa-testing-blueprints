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
  matchFlagValue,
  readNextFlagValue,
  resolveCliProjectPath,
} from '../src/cli/cliArgHelpers.js';
import { AUDIT_HELP_TEXT } from '../src/cli/audit-cli.js';
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

      const shortEq = matchFlagValue(['-t=workspace', '-a=cursor', '-l=en'], 0, new Set(['-t', '-a', '-l']));
      expect(shortEq).toEqual({ flag: '-t', value: 'workspace', consumed: 0 });
      const longEq = matchFlagValue(['--target=claude'], 0, new Set(['--target']));
      expect(longEq).toEqual({ flag: '--target', value: 'claude', consumed: 0 });
      expect(matchFlagValue(['--unknown=x'], 0, new Set(['--target']))).toBeNull();
      expect(matchFlagValue(['--target'], 5, new Set(['--target']))).toBeNull();
      expect(() => matchFlagValue(['-t='], 0, new Set(['-t']))).toThrow(/requiere un valor/);
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

      // Seed IDE MCP configs (including fallback antigravity + hermes config.yaml + claude-desktop)
      writeFile(path.join(homeDir, '.gemini', 'config', 'mcp_config.json'), '{"mcpServers":{"qa-11x":{}}}');
      writeFile(path.join(homeDir, '.codex', 'config.toml'), '[mcp_servers.qa-11x]\ncommand="npx"\n');
      writeFile(path.join(homeDir, '.cursor', 'mcp.json'), '{"mcpServers":{"other":{}}}');
      writeFile(path.join(homeDir, '.hermes', 'config.yaml'), 'mcp:\n  qa-11x:\n    command: npx\n');
      writeFile(path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json'), '{"mcpServers":{"qa-11x":{}}}');
      // Directory at .claude.json triggers readFileSync catch path safely across all UIDs
      fs.mkdirSync(path.join(homeDir, '.claude.json'), { recursive: true });

      // Seed project files (pyproject + graphify)
      writeFile(path.join(projDir, 'pyproject.toml'), '[project]\nname = "sample"\n');
      writeFile(path.join(projDir, 'graphify-out', 'graph.json'), '{"nodes":[],"links":[]}');

      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 })
      );

      const jsonRes = await runDoctorCli([`-p=${projDir}`, '--json'], {
        cwd: tmpRoot,
        homeDir,
        platform: 'linux',
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
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'antigravity')?.has_qa_11x).toBe(true);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'hermes')?.has_qa_11x).toBe(true);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'claude-desktop')?.has_qa_11x).toBe(true);
      expect(parsed.ide_mcp_configs.find((c) => c.client === 'codex')?.has_qa_11x).toBe(true);

      // Canonical antigravity (.gemini/antigravity/mcp_config.json) + darwin claude-desktop + hermes mcp.json
      const darwinHome = path.join(tmpRoot, 'home-darwin');
      writeFile(path.join(darwinHome, '.gemini', 'antigravity', 'mcp_config.json'), '{"mcpServers":{"qa-11x":{}}}');
      writeFile(path.join(darwinHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), '{"mcpServers":{"qa-11x":{}}}');
      writeFile(path.join(darwinHome, '.hermes', 'mcp.json'), '{"mcpServers":{"qa-11x":{}}}');
      const darwinDoc = JSON.parse(
        (await runDoctorCli([projDir, '--offline', '--json'], { cwd: projDir, homeDir: darwinHome, platform: 'darwin', dockerProbeFn: () => null })).output
      ) as DoctorReport;
      expect(darwinDoc.ide_mcp_configs.find((c) => c.client === 'antigravity')?.path).toContain('.gemini/antigravity/mcp_config.json');
      expect(darwinDoc.ide_mcp_configs.find((c) => c.client === 'claude-desktop')?.has_qa_11x).toBe(true);
      expect(darwinDoc.ide_mcp_configs.find((c) => c.client === 'hermes')?.path).toContain('.hermes/mcp.json');
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
      const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tmpRoot, 'bp-cache') });
      expect(await dispatchCliArgs(['--version', '--verbose'], fetcher)).toBe(0);
      expect(await dispatchCliArgs(['-v', '--json'], fetcher)).toBe(0);
      expect(await dispatchCliArgs(['--json', '--version'], fetcher)).toBe(0);
      expect(await dispatchCliArgs(['version'], fetcher)).toBe(0);
      expect(await dispatchCliArgs(['--version', '--bogus'], fetcher)).toBe(1);
      expect(await dispatchCliArgs(['help', 'audit'], fetcher)).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledTimes(5);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(4, MCP_SERVER_VERSION);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(5, AUDIT_HELP_TEXT);
      expect(consoleErrSpy).toHaveBeenCalledTimes(1);
      const jsonLogged = String(consoleLogSpy.mock.calls[2]?.[0] ?? '{}');
      expect((JSON.parse(jsonLogged) as DoctorReport).mcp_version).toBe(MCP_SERVER_VERSION);

      const helpDocLogs: string[] = [];
      const helpDocErrs: string[] = [];
      const helpDocRes = await runCli(['help', 'doctor'], {
        log: (m) => helpDocLogs.push(m),
        errorLog: (m) => helpDocErrs.push(m),
      });
      expect(helpDocRes.exitCode).toBe(0);
      expect(helpDocLogs[0]).toBe(DOCTOR_HELP_TEXT);
      const helpBadRes = await runCli(['help', 'nonexistent-cmd'], {
        log: (m) => helpDocLogs.push(m),
        errorLog: (m) => helpDocErrs.push(m),
      });
      expect(helpBadRes.exitCode).toBe(1);
      expect(helpDocErrs[0]).toContain('Unknown CLI subcommand');

      const helpExtraRes = await runCli(['help', 'doctor', 'extra'], {
        log: (m) => helpDocLogs.push(m),
        errorLog: (m) => helpDocErrs.push(m),
      });
      expect(helpExtraRes.exitCode).toBe(1);
      expect(helpExtraRes.errorMessage).toContain("Unexpected argument 'extra' for 'help'");
    });

    it('supports global $HOME mode for doctor and --version --verbose while blocking explicit -p/--dir ~', async () => {
      const homeTextRes = await runDoctorCli(['--offline'], {
        cwd: homeDir,
        homeDir,
        dockerProbeFn: () => null,
      });
      expect(homeTextRes.exitCode).toBe(0);
      expect(homeTextRes.output).toContain('modo global $HOME; stacks: ninguno');

      const homeJsonRes = await runDoctorCli(['--offline', '--json'], {
        cwd: homeDir,
        homeDir,
        dockerProbeFn: () => null,
      });
      expect(homeJsonRes.exitCode).toBe(0);
      const parsedHome = JSON.parse(homeJsonRes.output) as DoctorReport;
      expect(parsedHome.project_path).toBe(fs.realpathSync(homeDir));
      expect(parsedHome.graphify_graph_present).toBe(false);
      expect(parsedHome.project_inspection.detected_stacks).toEqual([]);
      expect(parsedHome.project_inspection.missing_11x_files).toEqual([]);
      expect(parsedHome.project_inspection.update_available).toBeDefined();

      // --version --verbose invoked from $HOME delegates cleanly into global $HOME mode
      const versionLogs: string[] = [];
      const versionErrs: string[] = [];
      const versionHomeRes = await runCli(['--version', '--verbose'], {
        cwd: homeDir,
        homeDir,
        dockerProbeFn: () => null,
        log: (m) => versionLogs.push(m),
        errorLog: (m) => versionErrs.push(m),
      });
      expect(versionHomeRes.exitCode).toBe(0);
      expect(versionLogs[0]).toContain('modo global $HOME; stacks: ninguno');
      expect(versionErrs).toEqual([]);

      // Explicit -p ~ or --dir ~ remains fail-closed under SEC-PATH-01
      const origHome = process.env.HOME;
      try {
        process.env.HOME = homeDir;

        const explicitShort = await runDoctorCli(['--offline', '-p', homeDir], {
          cwd: projDir,
          homeDir,
        });
        expect(explicitShort.exitCode).toBe(1);
        expect(explicitShort.isError).toBe(true);
        expect(explicitShort.output).toContain('SEC-PATH-01');

        const explicitDir = await runDoctorCli(['--offline', '--dir', homeDir], {
          cwd: projDir,
          homeDir,
        });
        expect(explicitDir.exitCode).toBe(1);
        expect(explicitDir.isError).toBe(true);
        expect(explicitDir.output).toContain('SEC-PATH-01');

        const cliExplicitErrs: string[] = [];
        const cliExplicitRes = await runCli(['doctor', '--dir', homeDir, '--offline'], {
          cwd: projDir,
          homeDir,
          log: () => undefined,
          errorLog: (m) => cliExplicitErrs.push(m),
        });
        expect(cliExplicitRes.exitCode).toBe(1);
        expect(cliExplicitErrs[0]).toContain('SEC-PATH-01');
      } finally {
        if (origHome === undefined) delete process.env.HOME;
        else process.env.HOME = origHome;
      }
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

    it('executes installSkillRunner without --reconcile by default, honors explicit --reconcile, silences logs in --json mode, and handles errors', async () => {
      const installSpy = vi.fn().mockResolvedValue(undefined);
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tmpRoot, 'bp-cache') });

      expect(UPGRADE_HELP_TEXT).toContain('--reconcile');

      const fullRes = await runUpgradeCli(['-t=claude'], {
        homeDir,
        fetcher,
        installSkillRunner: installSpy,
      });
      expect(fullRes.exitCode).toBe(0);
      expect(installSpy).toHaveBeenCalledWith(['--target', 'claude'], fetcher);
      expect(fullRes.output).toContain('APLICADO');
      expect(fullRes.output).toContain('skills_synced=true');

      const reconcileRes = await runUpgradeCli(['-t', 'claude', '--reconcile'], {
        homeDir,
        fetcher,
        installSkillRunner: installSpy,
      });
      expect(reconcileRes.exitCode).toBe(0);
      expect(installSpy).toHaveBeenLastCalledWith(['--target', 'claude', '--reconcile'], fetcher);

      // Real runInstallSkillCli with --json keeps stdout pure JSON (human logs suppressed)
      const localBp = path.join(tmpRoot, 'local-bp');
      const skillText = '# Architect Skill\n';
      const { createHash } = await import('node:crypto');
      const skillSha = createHash('sha256').update(skillText, 'utf8').digest('hex');
      writeFile(path.join(localBp, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'), skillText);
      writeFile(
        path.join(localBp, 'manifest.json'),
        JSON.stringify({
          schema_version: '1.0.0',
          blueprint_version: MCP_SERVER_VERSION,
          generated_at_utc: '2026-11-17T00:00:00Z',
          repository: 'tecno-consultores/qa-testing-blueprints',
          default_branch: 'main',
          raw_base_url: 'https://example.invalid',
          stacks: {},
          common_files: [],
          agent_governance_files: [
            {
              path: '.agents/skills/qa-11x-architect/SKILL.md',
              target_name: '.agents/skills/qa-11x-architect/SKILL.md',
              merge_strategy: 'overwrite',
              sha256: skillSha,
              size_bytes: Buffer.byteLength(skillText, 'utf8'),
            },
          ],
        })
      );
      const localFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpRoot, 'bp-cache-real'),
        localOverridePath: localBp,
      });
      process.env.HOME = homeDir;
      const realStdoutLogs: string[] = [];
      const origConsoleLog = console.log;
      console.log = (msg?: unknown) =>
        realStdoutLogs.push(typeof msg === 'string' ? msg : JSON.stringify(msg ?? ''));
      try {
        const cliJsonUpg = await runCli(['upgrade', '--target=claude', '--json'], {
          homeDir,
          fetcher: localFetcher,
          log: (m) => console.log(m),
        });
        expect(cliJsonUpg.exitCode).toBe(0);
      } finally {
        console.log = origConsoleLog;
      }
      expect(realStdoutLogs).toHaveLength(1);
      const parsedUpgradeStdout = JSON.parse(realStdoutLogs[0] ?? '{}') as UpgradeReport;
      expect(parsedUpgradeStdout.skills_synced).toBe(true);
      expect(fs.existsSync(path.join(homeDir, '.claude', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);

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

      const errLogs: string[] = [];
      const nonErrCatch = await runCli(['install-skill'], {
        homeDir,
        cwd: tmpRoot,
        installSkillRunner: vi.fn().mockRejectedValue('raw-string-error'),
        errorLog: (m) => errLogs.push(m),
      });
      expect(nonErrCatch.exitCode).toBe(1);
      expect(nonErrCatch.errorMessage).toBe('raw-string-error');
      expect(errLogs[0]).toContain('raw-string-error');
    });
  });
});
