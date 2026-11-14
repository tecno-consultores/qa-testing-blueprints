// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AIDER_BRIDGE_END,
  AIDER_BRIDGE_START,
  BRIDGE_END_MARKER,
  BRIDGE_START_MARKER,
  CONNECTOR_END_MARKER,
  CONNECTOR_START_MARKER,
  SUPPORTED_AGENT_IDS,
  SUPPORTED_AI_AGENTS,
  buildAgentsMdConnectorBlock,
  detectProjectAgents,
  initOrAppendAgentsMd,
  mergeAgentsMdContent,
  parseAgentsOption,
  resolveSafeBridgePath,
  resolveTargetAgentIds,
  syncAgentBridgeFiles,
  validateAgentId,
  validateSupportedLang,
  type SupportedAiAgentId,
} from '../src/tools/initOrAppendAgentsMd.js';
import { CLI_USAGE_TEXT, parseCliArgs, runCli } from '../src/cli.js';
import {
  initOrAppendAgentsMd as legacyInitOrAppendAgentsMd,
  parseInitAgentsArgs,
  runInitAgentsCli,
} from '../src/cli/init-agents-md.js';
import { parseAgentsArg, runInstallSkillCli } from '../src/cli/install-skill.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';

const EXPECTED_28_AGENTS: readonly SupportedAiAgentId[] = [
  'antigravity',
  'claude-code',
  'claude-desktop',
  'cursor',
  'windsurf',
  'copilot',
  'codex',
  'gemini-cli',
  'gemini-code-assist',
  'cline',
  'roo-code',
  'aider',
  'continue',
  'zed',
  'devin',
  'cody',
  'amazon-q',
  'jetbrains-ai',
  'augment',
  'trae',
  'hermes',
  'opencode',
  'goose',
  'kilo-code',
  'bolt',
  'lovable',
  'v0',
  'replit',
];

describe('T2.8: 28 AI Agents Declarative Catalog, --lang es|en & Thin-Repo Bridges', () => {
  let tmpDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-agents27-work-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-agents27-outside-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('SUPPORTED_AI_AGENTS catalog integrity', () => {
    it('registers at least 28 immutable unique agents with valid metadata', () => {
      expect(SUPPORTED_AGENT_IDS.length).toBeGreaterThanOrEqual(28);
      expect(Object.isFrozen(SUPPORTED_AI_AGENTS)).toBe(true);
      expect(Object.isFrozen(SUPPORTED_AGENT_IDS)).toBe(true);
      expect(new Set(SUPPORTED_AGENT_IDS).size).toBe(SUPPORTED_AGENT_IDS.length);

      for (const expectedId of EXPECTED_28_AGENTS) {
        const desc = SUPPORTED_AI_AGENTS[expectedId];
        expect(desc).toBeDefined();
        expect(desc.id).toBe(expectedId);
        expect(desc.displayName.length).toBeGreaterThan(2);
        expect(desc.bridgeFile.length).toBeGreaterThan(1);
        expect(desc.detectPaths.length).toBeGreaterThan(0);
        expect(Object.isFrozen(desc)).toBe(true);
        expect(Object.isFrozen(desc.detectPaths)).toBe(true);
      }
    });

    it('maps specific agent formats accurately (cursor .mdc, aider yaml, copilot, vibe-coding)', () => {
      expect(SUPPORTED_AI_AGENTS.cursor.bridgeFile).toBe('.cursor/rules/qa-11x.mdc');
      expect(SUPPORTED_AI_AGENTS.cursor.format).toBe('mdc');
      expect(SUPPORTED_AI_AGENTS.aider.bridgeFile).toBe('.aider.conf.yml');
      expect(SUPPORTED_AI_AGENTS.aider.format).toBe('aider-yaml');
      expect(SUPPORTED_AI_AGENTS.copilot.bridgeFile).toBe('.github/copilot-instructions.md');
      expect(SUPPORTED_AI_AGENTS['claude-code'].bridgeFile).toBe('CLAUDE.md');
      expect(SUPPORTED_AI_AGENTS.replit.bridgeFile).toBe('replit.md');
      expect(SUPPORTED_AI_AGENTS.bolt.bridgeFile).toBe('.bolt/prompt');
      expect(SUPPORTED_AI_AGENTS.lovable.bridgeFile).toBe('.lovable/rules.md');
      expect(SUPPORTED_AI_AGENTS.v0.bridgeFile).toBe('.v0/rules.md');
    });
  });

  describe('Backward compatibility & idempotent es <-> en switching', () => {
    it('defaults to lang="es" and modifies only AGENTS.md when lang and agents are omitted', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'demo', dependencies: { express: '^4.0.0' } })
      );

      const res = await initOrAppendAgentsMd({ projectPath: tmpDir });
      expect(res.lang).toBe('es');
      expect(res.action).toBe('created');
      expect(res.bridged_agents).toEqual([]);
      expect(res.bridge_files).toEqual([]);
      expect(res.content).toContain('OUTPUT LANGUAGE CONSTRAINT');
      expect(res.content).toContain('Spanish (español)');
      expect(res.content).toContain('QA-GIT-GATE-01');
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
    });

    it('supports snake_case options (project_path, dry_run) and general/Project fallbacks', async () => {
      const emptyBlock = buildAgentsMdConnectorBlock('EmptyApp', [], 'en');
      expect(emptyBlock).toContain('stacks: `general`');
      expect(emptyBlock).toContain('in English');

      const rootDry = await initOrAppendAgentsMd({ project_path: '/', dry_run: true });
      expect(rootDry.action).toBe('dry_run');
      expect(rootDry.content).toContain('This project (`Project`)');

      const appended = mergeAgentsMdContent('# Custom Project Rules\n- Keep SLA', 'App', ['python'], 'es');
      expect(appended.action).toBe('appended');
      expect(appended.finalContent).toContain('# Custom Project Rules\n- Keep SLA');
      expect(appended.finalContent).toContain(CONNECTOR_START_MARKER);
    });

    it('toggles es -> en -> es idempotently while preserving user rules outside markers', async () => {
      const header = '# Proprietary Business Rules\n- Preserve legacy invoice logic.\n\n';
      const footer = '\n\n# Footer Governance\n- Never break billing migrations.';
      const seed = `${header}${CONNECTOR_START_MARKER}\nlegacy block\n${CONNECTOR_END_MARKER}${footer}`;
      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      fs.writeFileSync(agentsMdPath, seed, 'utf-8');

      const toEn = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'en' });
      expect(toEn.action).toBe('updated_block');
      expect(toEn.lang).toBe('en');
      const enContent = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(enContent.startsWith(header)).toBe(true);
      expect(enContent.endsWith(footer)).toBe(true);
      expect(enContent).toContain('write commit messages / user-facing documentation in English');
      expect(enContent).not.toContain('legacy block');

      const toEs = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'es' });
      expect(toEs.action).toBe('updated_block');
      expect(toEs.lang).toBe('es');
      const esContent = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(esContent.startsWith(header)).toBe(true);
      expect(esContent.endsWith(footer)).toBe(true);
      expect(esContent).toContain('Spanish (español)');

      const toEsRepeat = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'es' });
      expect(toEsRepeat.action).toBe('updated_block');
      expect(fs.readFileSync(agentsMdPath, 'utf-8')).toBe(esContent);
    });
  });

  describe('Non-destructive Thin-Repo bridges, auto, all & dry_run', () => {
    it('creates and idempotently updates bridges <= 15 lines for diverse AI agents', async () => {
      const selected: SupportedAiAgentId[] = [
        'copilot',
        'cursor',
        'claude-code',
        'cline',
        'roo-code',
        'aider',
        'gemini-cli',
        'zed',
        'jetbrains-ai',
        'bolt',
        'lovable',
        'v0',
        'replit',
        'antigravity',
        'codex',
      ];

      const first = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'en',
        agents: selected,
      });

      expect(first.bridged_agents).toEqual(selected);
      expect(first.bridge_files.length).toBe(13);

      for (const bridge of first.bridge_files) {
        const lineCount = bridge.content.trimEnd().split('\n').length;
        expect(lineCount).toBeLessThanOrEqual(15);
        expect(bridge.content).toContain('AGENTS.md');
        expect(bridge.content).toContain('QA-GIT-GATE-01');
        expect(fs.existsSync(bridge.file_path)).toBe(true);
      }

      const cursorContent = fs.readFileSync(path.join(tmpDir, '.cursor/rules/qa-11x.mdc'), 'utf-8');
      expect(cursorContent.startsWith('---\n')).toBe(true);
      expect(cursorContent).toContain('alwaysApply: true');
      expect(cursorContent).toContain(BRIDGE_START_MARKER);
      expect(cursorContent).toContain(BRIDGE_END_MARKER);

      const aiderContent = fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8');
      expect(aiderContent).toContain(AIDER_BRIDGE_START);
      expect(aiderContent).toContain('read:\n  - AGENTS.md');
      expect(aiderContent).toContain(AIDER_BRIDGE_END);

      const second = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'en',
        agents: selected,
      });
      expect(second.bridge_files.every((b) => b.action === 'updated_block')).toBe(true);
      expect(fs.readFileSync(path.join(tmpDir, '.cursor/rules/qa-11x.mdc'), 'utf-8')).toBe(cursorContent);
      expect(fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8')).toBe(aiderContent);
    });

    it('preserves existing user content in .cursor/rules/qa-11x.mdc and .aider.conf.yml without duplicating read:', async () => {
      const cursorPath = path.join(tmpDir, '.cursor/rules/qa-11x.mdc');
      fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
      fs.writeFileSync(cursorPath, '# Existing user cursor rule without frontmatter\n', 'utf-8');

      const aiderPath = path.join(tmpDir, '.aider.conf.yml');
      fs.writeFileSync(aiderPath, 'model: claude-3-7-sonnet\nread:\n  - CONVENTIONS.md\n', 'utf-8');

      const copilotPath = path.join(tmpDir, '.github/copilot-instructions.md');
      fs.mkdirSync(path.dirname(copilotPath), { recursive: true });
      fs.writeFileSync(copilotPath, '# Team Copilot Guidelines\n- Use TypeScript strict.\n', 'utf-8');

      const res = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'es',
        agents: ['cursor', 'aider', 'copilot'],
      });
      expect(res.bridge_files.every((b) => b.action === 'appended')).toBe(true);

      const nextCursor = fs.readFileSync(cursorPath, 'utf-8');
      expect(nextCursor.startsWith('---\n')).toBe(true);
      expect(nextCursor).toContain('# Existing user cursor rule without frontmatter');
      expect(nextCursor).toContain(BRIDGE_START_MARKER);

      const nextAider = fs.readFileSync(aiderPath, 'utf-8');
      expect(nextAider).toContain('model: claude-3-7-sonnet');
      expect(nextAider).toContain('- CONVENTIONS.md');
      expect((nextAider.match(/^read:/gm) ?? []).length).toBe(1);
      expect(nextAider).toContain('Existing read: key detected');

      // Re-run with existing frontmatter on cursor without markers edge case
      fs.writeFileSync(
        cursorPath,
        '---\ndescription: Custom\n---\n\n# Custom rule only\n',
        'utf-8'
      );
      const third = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'es',
        agents: ['cursor'],
      });
      expect(third.bridge_files[0].action).toBe('appended');
      const preservedFrontmatter = fs.readFileSync(cursorPath, 'utf-8');
      expect(preservedFrontmatter).toContain('description: Custom');
      expect(preservedFrontmatter).toContain('# Custom rule only');
    });

    it('detects footprints with agents="auto" and handles empty project footprints', async () => {
      expect(detectProjectAgents(tmpDir)).toEqual([]);
      const noneRes = await initOrAppendAgentsMd({ projectPath: tmpDir, agents: 'auto' });
      expect(noneRes.bridged_agents).toEqual([]);
      expect(noneRes.bridge_files).toEqual([]);

      fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.replit'), 'run = "npm test"\n', 'utf-8');

      const autoRes = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'en', agents: 'auto' });
      expect(autoRes.bridged_agents).toContain('copilot');
      expect(autoRes.bridged_agents).toContain('cursor');
      expect(autoRes.bridged_agents).toContain('replit');
      expect(fs.existsSync(path.join(tmpDir, '.github/copilot-instructions.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.cursor/rules/qa-11x.mdc'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'replit.md'))).toBe(true);
    });

    it('supports agents="all" across all 28 agents and writes zero files in dryRun mode', async () => {
      const dryRes = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'en',
        agents: 'all',
        dryRun: true,
      });
      expect(dryRes.action).toBe('dry_run');
      expect(dryRes.bridged_agents.length).toBe(SUPPORTED_AGENT_IDS.length);
      expect(dryRes.bridge_files.length).toBeGreaterThanOrEqual(20);
      expect(dryRes.bridge_files.every((f) => f.action === 'dry_run')).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.cursor'))).toBe(false);

      const realAll = await initOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'en',
        agents: 'all',
      });
      expect(realAll.bridged_agents.length).toBe(28);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.goosehints'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.kilocode/rules/qa-11x.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.amazonq/rules/qa-11x.md'))).toBe(true);

      // Direct syncAgentBridgeFiles check with undefined
      const noSync = syncAgentBridgeFiles(tmpDir, undefined, [], 'es', true);
      expect(noSync.bridgedAgents).toEqual([]);
      expect(noSync.bridgeFiles).toEqual([]);
    });
  });

  describe('Deterministic validation, invalid inputs & Path Traversal defense', () => {
    it('rejects unsupported languages deterministically', () => {
      expect(validateSupportedLang(undefined)).toBe('es');
      expect(validateSupportedLang(' EN ')).toBe('en');
      expect(() => validateSupportedLang('fr')).toThrow("Unsupported language 'fr'");
      expect(() => validateSupportedLang('')).toThrow('Unsupported language');
    });

    it('rejects unknown agents, empty arrays, and path traversal attempts', async () => {
      expect(() => validateAgentId('unknown-agent')).toThrow("Unknown AI agent 'unknown-agent'");
      expect(() => validateAgentId('../etc/passwd')).toThrow('Path traversal');
      expect(() => validateAgentId('a/b')).toThrow('Path traversal');
      expect(() => validateAgentId('a\\b')).toThrow('Path traversal');
      expect(() => validateAgentId('bad\0id')).toThrow('Path traversal');
      expect(() => resolveTargetAgentIds(tmpDir, [])).toThrow('non-empty list');

      expect(() => resolveSafeBridgePath(tmpDir, '')).toThrow('Path traversal');
      expect(() => resolveSafeBridgePath(tmpDir, '../escape.md')).toThrow('Path traversal');
      expect(() => resolveSafeBridgePath(tmpDir, '/etc/passwd')).toThrow('Path traversal');
      expect(() => resolveSafeBridgePath(tmpDir, 'sub/../../outside.md')).toThrow('Path traversal');
      expect(() => resolveSafeBridgePath(tmpDir, 'file\0.md')).toThrow('Path traversal');

      const symlinkPath = path.join(tmpDir, 'escape-link');
      fs.symlinkSync(outsideDir, symlinkPath);
      expect(() => resolveSafeBridgePath(tmpDir, 'escape-link/pwned.md')).toThrow(
        'Symlink path traversal outside project root'
      );

      await expect(initOrAppendAgentsMd({ projectPath: '' })).rejects.toThrow('Missing required projectPath');
      await expect(
        initOrAppendAgentsMd({ projectPath: path.join(tmpDir, 'missing-dir') })
      ).rejects.toThrow('El directorio especificado no existe');

      const fileTarget = path.join(tmpDir, 'regular.txt');
      fs.writeFileSync(fileTarget, 'data', 'utf-8');
      await expect(initOrAppendAgentsMd({ projectPath: fileTarget })).rejects.toThrow(
        'La ruta especificada no es un directorio'
      );
    });
  });

  describe('CLI (mcp-server/src/cli.ts) & existing CLI wiring', () => {
    it('parses and executes init-agents with --lang and --agents flags', async () => {
      const parsed = parseCliArgs(
        ['init-agents', '--project-path', tmpDir, '--lang', 'en', '--agents', 'copilot,cursor'],
        tmpDir
      );
      expect(parsed.command).toBe('init-agents');
      expect(parsed.lang).toBe('en');
      expect(parsed.agents).toEqual(['copilot', 'cursor']);

      const logs: string[] = [];
      const res = await runCli(
        ['init-agents', '-p', tmpDir, '-l', 'en', '-a', 'copilot,cursor'],
        { log: (m) => logs.push(m) }
      );
      expect(res.exitCode).toBe(0);
      expect(res.initResult?.lang).toBe('en');
      expect(res.initResult?.bridged_agents).toEqual(['copilot', 'cursor']);
      expect(logs[0]).toContain('✔ [init-agents]');
      expect(fs.existsSync(path.join(tmpDir, '.github/copilot-instructions.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.cursor/rules/qa-11x.mdc'))).toBe(true);
    });

    it('propagates --lang and --agents through install-skill --init-agents', async () => {
      const forwardedCalls: string[][] = [];
      const res = await runCli(
        [
          'install-skill',
          '--target',
          'workspace',
          '--init-agents',
          '--include-scripts',
          '--reconcile',
          '--lang=en',
          '--agents=claude-code,replit',
          '--project-path=' + tmpDir,
        ],
        {
          cwd: tmpDir,
          log: vi.fn(),
          installSkillRunner: async (fwd) => {
            forwardedCalls.push(fwd);
          },
        }
      );
      expect(res.exitCode).toBe(0);
      expect(forwardedCalls).toEqual([
        ['--target', 'workspace', '--include-scripts', '--reconcile', '--lang', 'en'],
      ]);
      expect(res.initResult?.bridged_agents).toEqual(['claude-code', 'replit']);
      expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'replit.md'))).toBe(true);

      const withoutInit = await runCli(['install-skill', '--dry-run'], {
        cwd: tmpDir,
        log: vi.fn(),
        installSkillRunner: vi.fn(),
      });
      expect(withoutInit.initResult).toBeUndefined();
    });

    it('handles --help, --version, reconcile-agents, TTY notice (QA-CLI-TTY-01), and invalid CLI flags', async () => {
      const logs: string[] = [];
      const helpRes = await runCli(['--help'], { log: (m) => logs.push(m) });
      expect(helpRes.exitCode).toBe(0);
      expect(logs[0]).toBe(CLI_USAGE_TEXT);

      const verRes = await runCli(['--version'], { log: (m) => logs.push(m) });
      expect(verRes.exitCode).toBe(0);

      const ttyRes = await runCli([], { isStdinTty: true, log: (m) => logs.push(m) });
      expect(ttyRes.mode).toBe('tty-notice');
      const stdioRes = await runCli([], { isStdinTty: false, log: vi.fn() });
      expect(stdioRes.mode).toBe('stdio-ready');
      const defaultTtyRes = await runCli([], { log: vi.fn() });
      expect(['tty-notice', 'stdio-ready']).toContain(defaultTtyRes.mode);

      const recSpy = vi.fn().mockResolvedValue(undefined);
      const recRes = await runCli(['reconcile-agents', tmpDir, '--dry-run'], {
        reconcileRunner: recSpy,
        log: vi.fn(),
      });
      expect(recRes.command).toBe('reconcile-agents');
      expect(recSpy).toHaveBeenCalledWith([tmpDir, '--dry-run']);

      const unknownFlagParsed = parseCliArgs(
        ['init-agents', '--unknown-inline=value', '--unknown-flag'],
        tmpDir
      );
      expect(unknownFlagParsed.projectPath).toBe(tmpDir);
      expect(() => parseCliArgs(['init-agents', '--agents='])).toThrow("Missing value for flag '--agents'");
      expect(() => parseCliArgs(['unknown-cmd'])).toThrow('Unknown CLI subcommand');
      expect(() => parseCliArgs(['init-agents', '--lang', 'fr'])).toThrow("Unsupported language 'fr'");
      expect(() => parseCliArgs(['init-agents', '--lang'])).toThrow("Missing value for flag '--lang'");
      expect(() => parseCliArgs(['init-agents', '--lang='])).toThrow("Missing value for flag '--lang'");
      expect(() => parseCliArgs(['init-agents', '--agents', 'foo'])).toThrow("Unknown AI agent 'foo'");
      expect(() => parseAgentsOption('')).toThrow('Invalid --agents value');
      expect(() => parseAgentsOption('cursor,,copilot')).toThrow('empty agent identifier');
      expect(parseAgentsOption('auto')).toBe('auto');
      expect(parseAgentsOption('ALL')).toBe('all');
    });

    it('wires --agents in existing init-agents-md.ts and install-skill.ts CLI handlers', async () => {
      const parsed = parseInitAgentsArgs(['--project-path', tmpDir, '--lang', 'en', '--agents', 'copilot']);
      expect(parsed.agents).toEqual(['copilot']);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await runInitAgentsCli(['--project-path', tmpDir, '--lang', 'en', '--agents', 'copilot']);
      expect(fs.existsSync(path.join(tmpDir, '.github/copilot-instructions.md'))).toBe(true);

      const directLegacy = await legacyInitOrAppendAgentsMd({
        projectPath: tmpDir,
        lang: 'en',
        agents: ['v0'],
      });
      expect(directLegacy.bridged_agents).toEqual(['v0']);
      expect(fs.existsSync(path.join(tmpDir, '.v0/rules.md'))).toBe(true);

      expect(parseAgentsArg(['--agents', 'cursor'])).toEqual(['cursor']);
      expect(parseAgentsArg(['-a', 'copilot'])).toEqual(['copilot']);
      expect(parseAgentsArg(['--agents=cline'])).toEqual(['cline']);
      expect(parseAgentsArg(['--target', 'workspace'])).toBeUndefined();

      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-agents27-home-'));
      const origHome = process.env.HOME;
      const origCwd = process.cwd();
      const fetcher = new GitHubFetcher();
      vi.spyOn(fetcher, 'fetchManifest').mockResolvedValue({
        schema_version: '1.0.0',
        blueprint_version: '2.20.3',
        generated_at_utc: '2026-11-14T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            merge_strategy: 'overwrite',
            sha256: 'mock-sha',
            size_bytes: 12,
          },
        ],
      });
      vi.spyOn(fetcher, 'fetchFileContent').mockResolvedValue('# Mock Skill');

      try {
        process.env.HOME = fakeHome;
        process.chdir(tmpDir);
        await runInstallSkillCli(
          ['--target', 'workspace', '--init-agents', '--lang', 'en', '--agents', 'bolt'],
          fetcher
        );
        expect(fs.existsSync(path.join(tmpDir, '.bolt/prompt'))).toBe(true);
      } finally {
        process.chdir(origCwd);
        process.env.HOME = origHome;
        fs.rmSync(fakeHome, { recursive: true, force: true });
        logSpy.mockRestore();
      }
    });
  });
});
