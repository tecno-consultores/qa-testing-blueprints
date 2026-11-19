// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLAST_RADIUS_HELP_TEXT,
  type BlastRoutingPath,
  runBlastRadiusCli,
} from '../src/cli/blast-radius-cli.js';
import { COMPLETION_HELP_TEXT, runCompletionCli } from '../src/cli/completion.js';
import {
  MCP_CONFIG_HELP_TEXT,
  SUPPORTED_MCP_CLIENTS,
  runMcpConfigCli,
} from '../src/cli/mcp-config.js';
import { isSameResolvedDir, resolveComparablePath } from '../src/cli/cliArgHelpers.js';
import { runCli } from '../src/cli.js';
import { MCP_SERVER_VERSION } from '../src/services/github-fetcher.js';

function resolveExecutable(binaryName: string, fallbackPaths: readonly string[]): string {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, binaryName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallbackPaths.find((candidate) => fs.existsSync(candidate)) ?? fallbackPaths[0] ?? binaryName;
}

const GIT_EXECUTABLE = resolveExecutable('git', ['/usr/bin/git', '/bin/git', '/usr/local/bin/git']);
const BASH_EXECUTABLE = resolveExecutable('bash', ['/usr/bin/bash', '/bin/bash', '/usr/local/bin/bash']);

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function runGit(cwd: string, args: string[]): void {
  execFileSync(GIT_EXECUTABLE, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'QA Bot',
      GIT_AUTHOR_EMAIL: 'qa@example.invalid',
      GIT_COMMITTER_NAME: 'QA Bot',
      GIT_COMMITTER_EMAIL: 'qa@example.invalid',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initTempGitRepo(repoDir: string): void {
  runGit(repoDir, ['init']);
  writeFile(path.join(repoDir, 'README.md'), '# Repo\n');
  writeFile(path.join(repoDir, 'src', 'core.ts'), 'export const val = 1;\n');
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '-m', 'init']);
}

describe('DX CLI Subcommands: blast-radius, mcp-config & completion (QA-11X)', () => {
  let tmpRoot: string;
  let homeDir: string;
  let projDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-dx-'));
    homeDir = path.join(tmpRoot, 'home');
    projDir = path.join(tmpRoot, 'project');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('blast-radius subcommand', () => {
    it('returns help and rejects missing targets, unknown flags, invalid ints, and missing dirs', async () => {
      expect((await runBlastRadiusCli(['--help'])).output).toBe(BLAST_RADIUS_HELP_TEXT);
      expect((await runBlastRadiusCli(['-h'])).exitCode).toBe(0);

      const missingTarget = await runBlastRadiusCli([], { cwd: projDir });
      expect(missingTarget.exitCode).toBe(1);
      expect(missingTarget.isError).toBe(true);
      expect(missingTarget.output).toContain('Proporciona un símbolo o --changed-since');

      for (const badArgs of [
        ['--unknown'],
        ['computeTax', '--max-tokens', '0'],
        ['computeTax', '--max-items', '-2'],
        ['computeTax', '--max-items', 'abc'],
        ['--symbol'],
        ['computeTax', '-p', path.join(tmpRoot, 'does-not-exist')],
      ]) {
        const res = await runBlastRadiusCli(badArgs, { cwd: projDir });
        expect(res.exitCode).toBe(1);
        expect(res.isError).toBe(true);
        expect(res.output).toContain('❌ [blast-radius]');
      }
    });

    it('inspects symbol AST blast radius, formats text/JSON, routes MICRO_CHANGE vs FULL_11X, and honors --auto-build & --refresh', async () => {
      writeFile(path.join(projDir, 'src', 'helper.ts'), 'export function roundVal(n: number): number { return Math.round(n); }\n');
      writeFile(path.join(projDir, 'src', 'target.ts'), 'export function computeTax(n: number): number { return n; }\n');
      writeFile(path.join(projDir, 'src', 'caller.ts'), 'import { computeTax } from "./target";\nexport const x = computeTax(1);\n');
      writeFile(path.join(projDir, 'tests', 'caller.unit.ts'), 'import { computeTax } from "../src/target";\ncomputeTax(1);\n');

      // 1. Missing graph + --auto-build returning false
      const failBuild = await runBlastRadiusCli(['computeTax', '--auto-build', '-p', projDir], {
        cwd: tmpRoot,
        graphBuilder: vi.fn().mockResolvedValue(false),
      });
      expect(failBuild.exitCode).toBe(0);
      expect(failBuild.output).toContain('ast_graph=missing');
      expect(failBuild.output).toContain('path=MICRO_CHANGE');

      // 2. --auto-build creating graphify-out/graph.json + MICRO_CHANGE text assertions
      const builderSuccess = vi.fn().mockImplementation((targetDir: string) => {
        writeFile(
          path.join(targetDir, 'graphify-out', 'graph.json'),
          JSON.stringify({
            directed: true,
            nodes: [
              { id: 'src/target.ts::computeTax', label: 'computeTax', source_file: 'src/target.ts', source_location: '1' },
              { id: 'src/caller.ts::run', label: 'run', source_file: 'src/caller.ts', source_location: '2' },
              { id: 'src/helper.ts::roundVal', label: 'roundVal', source_file: 'src/helper.ts', source_location: '1' },
            ],
            links: [
              { source: 'src/caller.ts::run', target: 'src/target.ts::computeTax', relation: 'calls' },
              { source: 'src/target.ts::computeTax', target: 'src/helper.ts::roundVal', relation: 'calls' },
            ],
          })
        );
        return true;
      });
      const rebuiltRes = await runBlastRadiusCli(['-s', 'computeTax', '--auto-build', '-p', projDir], {
        cwd: tmpRoot,
        graphBuilder: builderSuccess,
      });
      expect(rebuiltRes.exitCode).toBe(0);
      expect(builderSuccess).toHaveBeenCalledTimes(1);
      expect(rebuiltRes.output).toContain('ast_graph=detected');
      expect(rebuiltRes.output).toContain('📦 dependents:');
      expect(rebuiltRes.output).toContain('🧪 tests:');

      // 3. --refresh triggers builder even when graph exists, and >=5 dependents routes FULL_11X
      const refreshNodes: Array<{ id: string; label: string; source_file: string; source_location: string }> = [
        { id: 'src/target.ts::computeTax', label: 'computeTax', source_file: 'src/target.ts', source_location: '1' },
        { id: 'src/caller.ts::run', label: 'run', source_file: 'src/caller.ts', source_location: '2' },
        { id: 'src/helper.ts::roundVal', label: 'roundVal', source_file: 'src/helper.ts', source_location: '1' },
      ];
      const refreshLinks: Array<{ source: string; target: string; relation: string }> = [
        { source: 'src/caller.ts::run', target: 'src/target.ts::computeTax', relation: 'calls' },
        { source: 'src/target.ts::computeTax', target: 'src/helper.ts::roundVal', relation: 'calls' },
      ];
      for (let i = 1; i <= 5; i += 1) {
        const consumerRel = `src/consumer-${i}.ts`;
        writeFile(path.join(projDir, consumerRel), 'computeTax(1);\n');
        refreshNodes.push({
          id: `${consumerRel}::useTax`,
          label: 'useTax',
          source_file: consumerRel,
          source_location: '1',
        });
        refreshLinks.push({
          source: `${consumerRel}::useTax`,
          target: 'src/target.ts::computeTax',
          relation: 'calls',
        });
      }
      const refreshBuilder = vi.fn().mockImplementation((targetDir: string) => {
        writeFile(
          path.join(targetDir, 'graphify-out', 'graph.json'),
          JSON.stringify({ directed: true, nodes: refreshNodes, links: refreshLinks })
        );
        return true;
      });
      const fullRes = await runBlastRadiusCli(
        ['--symbol=computeTax', '--refresh', '--max-items=2', '--max-tokens=1500', '--json'],
        { cwd: projDir, graphBuilder: refreshBuilder }
      );
      expect(fullRes.exitCode).toBe(0);
      expect(refreshBuilder).toHaveBeenCalledTimes(1);
      const fullJson = JSON.parse(fullRes.output) as {
        recommended_path: BlastRoutingPath;
        ast_graph_rebuilt?: boolean;
        dependent_files: string[];
      };
      expect(fullJson.ast_graph_rebuilt).toBe(true);
      expect(fullJson.recommended_path).toBe('FULL_11X');
      expect(fullJson.dependent_files).toHaveLength(2);

      const extraPos = await runBlastRadiusCli(['computeTax', 'extra-arg'], { cwd: projDir });
      expect(extraPos.exitCode).toBe(1);
      expect(extraPos.isError).toBe(true);
    });

    it('routes --changed-since DOCS_ONLY, MICRO_CHANGE (no symbol), vs FULL_11X on a real git repo and executes via cli.ts', async () => {
      initTempGitRepo(projDir);
      writeFile(path.join(projDir, 'docs', 'guide.md'), '# Updated guide\n');
      writeFile(path.join(projDir, 'README.md'), '# Updated readme\n');
      runGit(projDir, ['add', '.']);
      runGit(projDir, ['commit', '-m', 'docs only']);

      const docsRes = await runBlastRadiusCli(['--changed-since', 'HEAD~1', '--json'], { cwd: projDir });
      expect(docsRes.exitCode).toBe(0);
      expect((JSON.parse(docsRes.output) as { recommended_path: BlastRoutingPath }).recommended_path).toBe('DOCS_ONLY');

      // Code under docs/ must NOT be classified as DOCS_ONLY
      writeFile(path.join(projDir, 'docs', 'exploit.py'), 'print("not docs")\n');
      runGit(projDir, ['add', '.']);
      runGit(projDir, ['commit', '-m', 'python script inside docs']);
      const docsCodeRes = await runBlastRadiusCli(['--changed-since', 'HEAD~1', '--json'], { cwd: projDir });
      expect(docsCodeRes.exitCode).toBe(0);
      expect(
        (JSON.parse(docsCodeRes.output) as { recommended_path: BlastRoutingPath }).recommended_path
      ).not.toBe('DOCS_ONLY');

      writeFile(path.join(projDir, 'src', 'utils', 'math.ts'), 'export const add = (a: number, b: number): number => a + b;\n');
      runGit(projDir, ['add', '.']);
      runGit(projDir, ['commit', '-m', 'small utility helper']);

      const microRes = await runBlastRadiusCli(['--changed-since', 'HEAD~1', '--json'], { cwd: projDir });
      expect(microRes.exitCode).toBe(0);
      const microJson = JSON.parse(microRes.output) as {
        target_symbol: string;
        recommended_path: BlastRoutingPath;
      };
      expect(microJson.target_symbol).toBe('');
      expect(microJson.recommended_path).toBe('MICRO_CHANGE');

      writeFile(path.join(projDir, 'src', 'routes.ts'), 'export const apiRoute = "/api/v1/items";\n');
      writeFile(path.join(projDir, 'src', 'a.ts'), 'export const a = 1;\n');
      writeFile(path.join(projDir, 'src', 'b.ts'), 'export const b = 2;\n');
      writeFile(path.join(projDir, 'src', 'c.ts'), 'export const c = 3;\n');
      runGit(projDir, ['add', '.']);
      runGit(projDir, ['commit', '-m', 'multi file change over micro limit']);

      const logs: string[] = [];
      const cliRes = await runCli(
        ['blast-radius', '--project-path', projDir, '--changed-since', 'HEAD~1', '--json'],
        { cwd: tmpRoot, log: (m) => logs.push(m) }
      );
      expect(cliRes.exitCode).toBe(0);
      expect(cliRes.command).toBe('blast-radius');
      expect((JSON.parse(logs[0] ?? '{}') as { recommended_path: BlastRoutingPath }).recommended_path).toBe('FULL_11X');

      const dirAliasRes = await runBlastRadiusCli(
        ['--dir', projDir, '--symbol', 'computeTax', '--json'],
        { cwd: tmpRoot }
      );
      expect(dirAliasRes.exitCode).toBe(0);
      expect((JSON.parse(dirAliasRes.output) as { target_symbol: string }).target_symbol).toBe('computeTax');
    });
  });

  describe('mcp-config subcommand', () => {
    it('returns help and rejects unknown flags or unsupported clients', () => {
      expect(runMcpConfigCli(['--help']).output).toBe(MCP_CONFIG_HELP_TEXT);
      expect(runMcpConfigCli(['-h']).exitCode).toBe(0);

      const badFlag = runMcpConfigCli(['--unknown'], { homeDir });
      expect(badFlag.exitCode).toBe(1);
      expect(badFlag.isError).toBe(true);

      const badClient = runMcpConfigCli(['--client', 'emacs'], { homeDir });
      expect(badClient.exitCode).toBe(1);
      expect(badClient.isError).toBe(true);
      expect(badClient.output).toContain('Cliente no soportado');
    });

    it('prints JSON, TOML, CLI command, and all-client snippets with optional --pin-version', () => {
      const pinnedJson = runMcpConfigCli(
        ['--print', '--client', 'antigravity', '--pin-version', '--json'],
        { homeDir }
      );
      expect(pinnedJson.exitCode).toBe(0);
      expect(JSON.parse(pinnedJson.output)).toMatchObject({
        client: 'antigravity',
        kind: 'json',
        packageSpec: `@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`,
      });

      const codexPrint = runMcpConfigCli(['-c', 'codex'], { homeDir });
      expect(codexPrint.exitCode).toBe(0);
      expect(codexPrint.output).toContain('[mcp_servers.qa-11x]');
      expect(codexPrint.output).toContain('@sinfallas/mcp-qa-11x@latest');

      const vscodePrint = runMcpConfigCli(['--client', 'vscode', '--pin-version'], { homeDir });
      expect(vscodePrint.exitCode).toBe(0);
      expect(vscodePrint.output).toContain('code --add-mcp');
      expect(vscodePrint.output).toContain(`@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`);

      const claudeCodePrint = runMcpConfigCli(['--client', 'claude-code'], { homeDir });
      expect(claudeCodePrint.output).toContain('claude mcp add -s user qa-11x');

      const geminiCliPrint = runMcpConfigCli(['--client', 'gemini-cli'], { homeDir });
      expect(geminiCliPrint.output).toContain('gemini mcp add qa-11x');

      const allPrintJson = runMcpConfigCli(['--client', 'all', '--json'], { homeDir });
      expect(allPrintJson.exitCode).toBe(0);
      const parsedAll = JSON.parse(allPrintJson.output) as { clients: Array<{ client: string }> };
      expect(parsedAll.clients).toHaveLength(SUPPORTED_MCP_CLIENTS.length - 1);
    });

    it('installs JSON/TOML safely with .11x-backup, 0600 perms, dry-run, platform paths, atomic all-client pre-validation, and invalid JSON refusal', () => {
      // Fresh JSON install (antigravity canonical .gemini/antigravity/mcp_config.json)
      const antigravityPath = path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json');
      const dryFresh = runMcpConfigCli(['--client', 'antigravity', '--install', '--dry-run', '--json'], { homeDir });
      expect(dryFresh.exitCode).toBe(0);
      expect(JSON.parse(dryFresh.output)).toMatchObject({ status: 'dry-run', targetPath: antigravityPath });
      expect(fs.existsSync(antigravityPath)).toBe(false);

      const freshInstall = runMcpConfigCli(['-c=antigravity', '--install', '--pin-version'], { homeDir });
      expect(freshInstall.exitCode).toBe(0);
      expect(freshInstall.output).toContain('status=installed');
      expect(fs.statSync(antigravityPath).mode & 0o777).toBe(0o600);

      // claude-desktop per-platform target resolution
      const macSnippet = JSON.parse(
        runMcpConfigCli(['--client=claude-desktop', '--json'], { homeDir, platform: 'darwin' }).output
      ) as { targetPath: string };
      expect(macSnippet.targetPath).toBe(
        path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      );
      const winSnippet = JSON.parse(
        runMcpConfigCli(['--client=claude-desktop', '--json'], { homeDir, platform: 'win32' }).output
      ) as { targetPath: string };
      expect(winSnippet.targetPath).toBe(
        path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
      );
      const linuxSnippet = JSON.parse(
        runMcpConfigCli(['--client=claude-desktop', '--json'], { homeDir, platform: 'linux' }).output
      ) as { targetPath: string };
      expect(linuxSnippet.targetPath).toBe(
        path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json')
      );

      // Merge JSON over existing cursor config preserving playwright & theme
      const cursorPath = path.join(homeDir, '.cursor', 'mcp.json');
      const originalCursor = JSON.stringify(
        {
          theme: 'dark',
          mcpServers: {
            playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
          },
        },
        null,
        2
      );
      writeFile(cursorPath, originalCursor);
      const dryExisting = runMcpConfigCli(['--client', 'cursor', '--install', '--dry-run', '--json'], { homeDir });
      expect(JSON.parse(dryExisting.output)).toMatchObject({
        status: 'dry-run',
        backupPath: `${cursorPath}.11x-backup`,
      });

      const mergeCursor = runMcpConfigCli(['--client', 'cursor', '--install', '--json'], { homeDir });
      expect(mergeCursor.exitCode).toBe(0);
      expect(fs.readFileSync(`${cursorPath}.11x-backup`, 'utf8')).toBe(originalCursor);
      expect(fs.statSync(`${cursorPath}.11x-backup`).mode & 0o777).toBe(0o600);
      expect(fs.statSync(cursorPath).mode & 0o777).toBe(0o600);
      const mergedDoc = JSON.parse(fs.readFileSync(cursorPath, 'utf8')) as {
        theme: string;
        mcpServers: Record<string, unknown>;
      };
      expect(mergedDoc.theme).toBe('dark');
      expect(mergedDoc.mcpServers.playwright).toBeDefined();
      expect(mergedDoc.mcpServers['qa-11x']).toBeDefined();

      // Existing JSON without mcpServers key succeeds cleanly
      const hermesPath = path.join(homeDir, '.hermes', 'mcp.json');
      writeFile(hermesPath, JSON.stringify({ theme: 'light' }));
      expect(runMcpConfigCli(['--client', 'hermes', '--install'], { homeDir }).exitCode).toBe(0);

      // Invalid existing JSON refuses without mutating disk (syntax error, array root, non-object mcpServers)
      const windsurfPath = path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json');
      for (const badJson of ['{corrupt', '[]', '{"mcpServers": []}']) {
        writeFile(windsurfPath, badJson);
        const refuse = runMcpConfigCli(['--client', 'windsurf', '--install'], { homeDir });
        expect(refuse.exitCode).toBe(1);
        expect(refuse.isError).toBe(true);
        expect(refuse.output).toContain('JSON inválido existente');
        expect(refuse.output).toContain(windsurfPath);
        expect(fs.readFileSync(windsurfPath, 'utf8')).toBe(badJson);
      }

      // --client all --install pre-validates ALL targets before mutating ANY file on disk
      const beforeAntigravity = fs.readFileSync(antigravityPath, 'utf8');
      const beforeCursor = fs.readFileSync(cursorPath, 'utf8');
      const refuseAll = runMcpConfigCli(['--client', 'all', '--install'], { homeDir });
      expect(refuseAll.exitCode).toBe(1);
      expect(refuseAll.isError).toBe(true);
      expect(refuseAll.output).toContain(windsurfPath);
      expect(fs.readFileSync(antigravityPath, 'utf8')).toBe(beforeAntigravity);
      expect(fs.readFileSync(cursorPath, 'utf8')).toBe(beforeCursor);

      // Codex TOML: fresh, append, replace middle (CRLF + multiline array + trailing section), replace end, dry-run
      const codexPath = path.join(homeDir, '.codex', 'config.toml');
      expect(runMcpConfigCli(['--client', 'codex', '--install', '--dry-run'], { homeDir }).exitCode).toBe(0);
      expect(runMcpConfigCli(['--client', 'codex', '--install'], { homeDir }).exitCode).toBe(0);
      expect(fs.readFileSync(codexPath, 'utf8')).toContain('[mcp_servers.qa-11x]');

      // Append to existing config without qa-11x
      writeFile(codexPath, 'model = "o3"\n\n');
      expect(runMcpConfigCli(['--client', 'codex', '--install', '--dry-run'], { homeDir }).output).toContain('backup=');
      expect(runMcpConfigCli(['--client', 'codex', '--install'], { homeDir }).exitCode).toBe(0);
      expect(fs.readFileSync(codexPath, 'utf8')).toContain('model = "o3"');

      // Replace existing section in middle with CRLF, multiline array '[' token, and trailing section
      writeFile(
        codexPath,
        'model = "o3"\r\n\r\n[mcp_servers.qa-11x]\r\ncommand = "old"\r\nargs = [\r\n  "-y"\r\n]\r\n[\r\n  "ignored-bare-bracket"\r\n]\r\n\r\n[profiles.dev]\r\napproval = "never"\r\n'
      );
      expect(runMcpConfigCli(['--client', 'codex', '--install', '--pin-version'], { homeDir }).exitCode).toBe(0);
      const updatedToml = fs.readFileSync(codexPath, 'utf8');
      expect(updatedToml).toContain(`@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`);
      expect(updatedToml).toContain('[profiles.dev]');
      expect(updatedToml).not.toContain('command = "old"');
      expect(updatedToml).not.toContain('ignored-bare-bracket');

      // Replace existing section at EOF
      writeFile(codexPath, 'model = "o3"\n\n[mcp_servers.qa-11x]\ncommand = "old"\n');
      expect(runMcpConfigCli(['--client', 'codex', '--install'], { homeDir }).exitCode).toBe(0);
      expect(fs.readFileSync(codexPath, 'utf8')).not.toContain('command = "old"');

      // Command client in --install mode & --client all --install
      const cmdInstall = runMcpConfigCli(['--client', 'claude-code', '--install'], { homeDir });
      expect(cmdInstall.exitCode).toBe(0);
      expect(cmdInstall.output).toContain('ejecuta manualmente el comando seguro');

      // Restore valid windsurf JSON before testing --client all --install
      writeFile(windsurfPath, '{}');
      const allInstallJson = runMcpConfigCli(['--client', 'all', '--install', '--dry-run', '--json'], { homeDir });
      expect(allInstallJson.exitCode).toBe(0);
      expect(JSON.parse(allInstallJson.output)).toMatchObject({ dryRun: true });
      const allInstallText = runMcpConfigCli(['--client', 'all', '--install'], { homeDir });
      expect(allInstallText.exitCode).toBe(0);
      expect(allInstallText.output).toContain('✔ [mcp-config]');
    });

    it('uses Antigravity fallback path when only ~/.gemini/config/mcp_config.json exists and emits Hermes YAML notice', () => {
      const legacyHome = path.join(tmpRoot, 'legacy-ide-home');
      const antigravityFallback = path.join(legacyHome, '.gemini', 'config', 'mcp_config.json');
      writeFile(antigravityFallback, '{"mcpServers":{}}');

      const fallbackInstall = runMcpConfigCli(
        ['--client', 'antigravity', '--install', '--json'],
        { homeDir: legacyHome }
      );
      expect(fallbackInstall.exitCode).toBe(0);
      expect(JSON.parse(fallbackInstall.output)).toMatchObject({
        status: 'installed',
        targetPath: antigravityFallback,
      });

      // Hermes YAML notice when ~/.hermes/config.yaml exists without ~/.hermes/mcp.json
      const hermesYamlPath = path.join(legacyHome, '.hermes', 'config.yaml');
      const hermesJsonPath = path.join(legacyHome, '.hermes', 'mcp.json');
      writeFile(hermesYamlPath, 'model: gpt-5\n');

      const hermesDryJson = runMcpConfigCli(
        ['--client', 'hermes', '--install', '--dry-run', '--json'],
        { homeDir: legacyHome }
      );
      expect(hermesDryJson.exitCode).toBe(0);
      const parsedDryHermes = JSON.parse(hermesDryJson.output) as { note?: string };
      expect(parsedDryHermes.note).toContain(hermesYamlPath);
      expect(parsedDryHermes.note).toContain('mcp_servers.qa-11x');

      const hermesTextInstall = runMcpConfigCli(['--client', 'hermes', '--install'], {
        homeDir: legacyHome,
      });
      expect(hermesTextInstall.exitCode).toBe(0);
      expect(hermesTextInstall.output).toContain(hermesYamlPath);
      expect(hermesTextInstall.output).toContain('mcp_servers.qa-11x');
      expect(fs.existsSync(hermesJsonPath)).toBe(true);

      // Once ~/.hermes/mcp.json exists, YAML notice is suppressed
      const hermesSecondInstall = runMcpConfigCli(['--client', 'hermes', '--install', '--json'], {
        homeDir: legacyHome,
      });
      expect(hermesSecondInstall.exitCode).toBe(0);
      expect((JSON.parse(hermesSecondInstall.output) as { note?: string }).note).toBeUndefined();
    });

    it('routes mcp-config through cli.ts lazy loader', async () => {
      const logs: string[] = [];
      const res = await runCli(['mcp-config', '--client', 'antigravity', '--pin-version'], {
        homeDir,
        log: (m) => logs.push(m),
      });
      expect(res.exitCode).toBe(0);
      expect(res.command).toBe('mcp-config');
      expect(logs[0]).toContain(`@sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION}`);
    });
  });

  describe('completion subcommand', () => {
    it('returns help and rejects missing or unsupported shells and invalid flags', () => {
      expect(runCompletionCli(['--help']).output).toBe(COMPLETION_HELP_TEXT);
      expect(runCompletionCli(['-h']).exitCode).toBe(0);

      const missing = runCompletionCli([]);
      expect(missing.exitCode).toBe(1);
      expect(missing.isError).toBe(true);
      expect(missing.output).toContain('Especifica un shell soportado');

      const unsupported = runCompletionCli(['powershell']);
      expect(unsupported.exitCode).toBe(1);
      expect(unsupported.isError).toBe(true);
      expect(unsupported.output).toContain('Shell no soportado');

      const badFlag = runCompletionCli(['--unknown']);
      expect(badFlag.exitCode).toBe(1);
      expect(badFlag.isError).toBe(true);

      const missingShellVal = runCompletionCli(['--shell']);
      expect(missingShellVal.exitCode).toBe(1);
      expect(missingShellVal.isError).toBe(true);

      const extraShell = runCompletionCli(['fish', 'bash']);
      expect(extraShell.exitCode).toBe(1);
      expect(extraShell.isError).toBe(true);

      const extraAfterFlag = runCompletionCli(['--shell=zsh', 'fish']);
      expect(extraAfterFlag.exitCode).toBe(1);
      expect(extraAfterFlag.isError).toBe(true);
    });

    it('generates valid fish, bash, and zsh completions containing subcommands, no duplicate -f on --force, and scoped Zsh completion options', async () => {
      const expectedSubcommands = [
        'quickstart',
        'install-skill',
        'init-agents',
        'reconcile-agents',
        'tms-sync',
        'doctor',
        'upgrade',
        'certify',
        'audit',
        'blast-radius',
        'mcp-config',
        'completion',
        'init-agents-md',
        'version',
        'help',
      ];

      const fish = runCompletionCli(['fish']);
      expect(fish.exitCode).toBe(0);
      expect(fish.output).toContain('complete -c mcp-qa-11x');
      expect(fish.output).toContain('-l target-dir');
      expect(fish.output).toContain('-l test-execution-key');
      expect(fish.output).toContain('-s p');
      expect(fish.output).not.toContain('-s f -l force');
      for (const cmd of expectedSubcommands) {
        expect(fish.output).toContain(cmd);
      }

      const fishViaFlag = runCompletionCli(['--shell=FISH']);
      expect(fishViaFlag.exitCode).toBe(0);
      expect(fishViaFlag.output).toBe(fish.output);

      const bash = runCompletionCli(['bash']);
      expect(bash.exitCode).toBe(0);
      expect(bash.output).toContain('_mcp_qa_11x_completions');
      expect(bash.output).toContain('complete -F _mcp_qa_11x_completions mcp-qa-11x');
      expect(bash.output).toContain('--live');
      expect(bash.output).toContain('--test-execution-key');
      expect(bash.output).toContain('-f)');
      for (const cmd of expectedSubcommands) {
        expect(bash.output).toContain(cmd);
      }
      const bashSyntaxOut = execFileSync(BASH_EXECUTABLE, ['-n'], {
        input: bash.output,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(bashSyntaxOut).toBe('');

      const zsh = runCompletionCli(['zsh']);
      expect(zsh.exitCode).toBe(0);
      expect(zsh.output).toContain('#compdef mcp-qa-11x');
      expect(zsh.output).toContain("_describe 'command' subcommands");
      expect(zsh.output).toContain('shift words');
      expect(zsh.output).toContain('(( CURRENT-- ))');
      expect(zsh.output).toContain('_arguments');
      expect(zsh.output).toContain('--test-execution-key');
      expect(zsh.output).toContain('[[ "${subcmd}" == "completion" ]]');
      expect(zsh.output).toContain('shells=(fish bash zsh)');
      for (const cmd of expectedSubcommands) {
        expect(zsh.output).toContain(cmd);
      }

      const logs: string[] = [];
      const cliRes = await runCli(['completion', 'fish'], { log: (m) => logs.push(m) });
      expect(cliRes.exitCode).toBe(0);
      expect(cliRes.command).toBe('completion');
      expect(logs[0]).toContain('complete -c mcp-qa-11x');

      const missingDirA = path.join(tmpRoot, 'nonexistent-compare-a');
      const missingDirB = path.join(tmpRoot, 'sub', '..', 'nonexistent-compare-a');
      expect(resolveComparablePath(missingDirA)).toBe(path.resolve(missingDirA));
      expect(isSameResolvedDir(missingDirA, missingDirB)).toBe(true);
    });
  });
});
