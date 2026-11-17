// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUICKSTART_TIER_PROFILES,
  detectProjectStackProfile,
  formatQuickstartOutput,
  resolveQuickstartTargetDir,
  runQuickstart,
  validateQuickstartCi,
  validateQuickstartTier,
} from '../src/cli/quickstart.js';
import { CLI_USAGE_TEXT, parseCliArgs, parseQuickstartCliArgs, runCli } from '../src/cli.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';
import { StackNameSchema } from '../src/types.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../..');
const MOUNTED_ACTION_YML = '/.github/actions/qa-11x-pr-check/action.yml';
const CANDIDATE_REPO_ACTION = path.join(REPO_ROOT, '.github/actions/qa-11x-pr-check/action.yml');
const ACTION_YML_PATH = fs.existsSync(CANDIDATE_REPO_ACTION)
  ? CANDIDATE_REPO_ACTION
  : MOUNTED_ACTION_YML;

function writeProjectFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

describe('T5.1: Quickstart CLI & PR-Aware Composite GitHub Action', () => {
  let tmpDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-quickstart-work-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-quickstart-out-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  describe('Stack & Vibe-Prototype Autodetection (detectProjectStackProfile)', () => {
    it('falls back to generic stack on an empty repository', () => {
      const profile = detectProjectStackProfile(tmpDir);
      expect(profile.stacks).toEqual(['generic']);
      expect(profile.vibePrototypeDetected).toBe(false);
      expect(profile.vibeMarkers).toEqual([]);
      expect(profile.recommendedMcpTools).not.toContain('audit_vibe_prototype');
    });

    it('detects full-stack polyglot monorepos across Node, Python, PHP, Mobile, AI, and Bash', () => {
      writeProjectFile(
        tmpDir,
        'package.json',
        JSON.stringify({
          name: 'polyglot',
          dependencies: { vue: '^3.5.0', express: '^5.0.0' },
          devDependencies: { promptfoo: '^0.100.0' },
        })
      );
      writeProjectFile(
        tmpDir,
        'react-frontend/package.json',
        JSON.stringify({ dependencies: { react: '^19.0.0' } })
      );
      writeProjectFile(tmpDir, 'mobile-appium/wdio.conf.ts', 'export const config = {};\n');
      writeProjectFile(tmpDir, 'fastapi/pyproject.toml', '[project]\ndependencies = ["fastapi"]\n');
      writeProjectFile(tmpDir, 'python/requirements.txt', 'pydantic>=2.0\ndeepeval>=1.0\n');
      writeProjectFile(tmpDir, 'php/composer.json', '{"name": "acme/api"}');
      writeProjectFile(tmpDir, 'scripts/check.sh', '#!/usr/bin/env bash\necho ok\n');

      const profile = detectProjectStackProfile(tmpDir);
      expect(profile.stacks).toEqual(
        expect.arrayContaining([
          'vue3',
          'react-frontend',
          'node-backend',
          'mobile-appium',
          'fastapi',
          'python',
          'php',
          'ai-evals',
          'bash-scripts',
        ])
      );
      expect(profile.vibePrototypeDetected).toBe(false);
    });

    it('detects standalone node-backend, webdriverio mobile, and corrupt package.json safely', () => {
      const nodeOnly = path.join(tmpDir, 'node-only');
      fs.mkdirSync(nodeOnly);
      writeProjectFile(nodeOnly, 'package.json', JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }));
      expect(detectProjectStackProfile(nodeOnly).stacks).toEqual(['node-backend']);

      const mobileOnly = path.join(tmpDir, 'mobile-only');
      fs.mkdirSync(mobileOnly);
      writeProjectFile(
        mobileOnly,
        'package.json',
        JSON.stringify({ peerDependencies: { webdriverio: '^9.0.0' } })
      );
      expect(detectProjectStackProfile(mobileOnly).stacks).toContain('mobile-appium');

      const corruptOnly = path.join(tmpDir, 'corrupt-only');
      fs.mkdirSync(corruptOnly);
      writeProjectFile(corruptOnly, 'package.json', '{invalid-json');
      writeProjectFile(corruptOnly, 'package.json.bak', '');
      expect(detectProjectStackProfile(corruptOnly).stacks).toEqual(['generic']);
    });

    it('detects vibe-coded markers and recommends audit_vibe_prototype without false positives on RLS SQL', () => {
      writeProjectFile(tmpDir, '.bolt/config.json', '{"template":"vite"}\n');
      writeProjectFile(
        tmpDir,
        'package.json',
        JSON.stringify({ devDependencies: { 'lovable-tagger': '^1.0.0' } })
      );
      writeProjectFile(
        tmpDir,
        '.env.example',
        '# Header comment\n\n123_INVALID=abc\nexport VITE_SUPABASE_SERVICE_ROLE_KEY=placeholder\nNEXT_PUBLIC_OPENAI_API_KEY=placeholder\n'
      );
      fs.mkdirSync(path.join(tmpDir, 'migrations', 'ignored_dir.sql'), { recursive: true });
      writeProjectFile(
        tmpDir,
        'migrations/001_init.sql',
        '-- comment\nCREATE TABLE accounts (id uuid primary key);\n'
      );
      writeProjectFile(
        tmpDir,
        'sql/002_policy.sql',
        'ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;\nCREATE POLICY open_all ON accounts USING (true);\n'
      );

      const profile = detectProjectStackProfile(tmpDir);
      expect(profile.vibePrototypeDetected).toBe(true);
      expect(profile.vibeMarkers).toEqual(
        expect.arrayContaining([
          '.bolt',
          'pkg:lovable-tagger',
          'env:VITE_SUPABASE_SERVICE_ROLE_KEY',
          'env:NEXT_PUBLIC_OPENAI_API_KEY',
          'sql:missing-rls:migrations/001_init.sql',
          'sql:permissive-rls:sql/002_policy.sql',
        ])
      );
      expect(profile.recommendedMcpTools[0]).toBe('audit_vibe_prototype');

      const safeSqlDir = path.join(tmpDir, 'safe-rls');
      fs.mkdirSync(safeSqlDir);
      writeProjectFile(
        safeSqlDir,
        'migrations/001_safe.sql',
        'CREATE TABLE items (id uuid); ALTER TABLE items ENABLE ROW LEVEL SECURITY;\nCREATE POLICY t_iso ON items USING (tenant_id = current_setting(\'app.tenant\', true));\n'
      );
      const safeProfile = detectProjectStackProfile(safeSqlDir);
      expect(safeProfile.vibePrototypeDetected).toBe(false);
    });

    it('aligns all 10 StackNameSchema stacks across quickstart profile and inspectProjectConfig', async () => {
      writeProjectFile(
        tmpDir,
        'package.json',
        JSON.stringify({ dependencies: { vue: '^3.5.0', express: '^5.0.0' } })
      );
      writeProjectFile(
        tmpDir,
        'react-frontend/package.json',
        JSON.stringify({ dependencies: { react: '^19.0.0' } })
      );
      writeProjectFile(tmpDir, 'mobile-appium/wdio.conf.ts', 'export const config = {};\n');
      writeProjectFile(tmpDir, 'fastapi/pyproject.toml', '[project]\ndependencies = ["fastapi"]\n');
      writeProjectFile(tmpDir, 'python/pyproject.toml', '[project]\ndependencies = ["deepeval"]\n');
      writeProjectFile(tmpDir, 'php/composer.json', '{"name":"acme/php"}');
      writeProjectFile(tmpDir, 'php/index.php', '<?php echo "ok";\n');
      writeProjectFile(tmpDir, 'check.sh', '#!/usr/bin/env bash\necho ok\n');
      writeProjectFile(tmpDir, 'vibe-rescue/audit_vibe_prototype.py', '# audit\n');
      writeProjectFile(tmpDir, '.bolt/config.json', '{"template":"vite"}\n');

      const quickstartProfile = detectProjectStackProfile(tmpDir);
      expect(quickstartProfile.vibePrototypeDetected).toBe(true);
      const inspectResult = await inspectProjectConfig(tmpDir);

      expect(StackNameSchema.options).toHaveLength(10);
      for (const stack of StackNameSchema.options) {
        expect(inspectResult.detected_stacks).toContain(stack);
      }
    });
  });

  describe('Progressive Tiers, Idempotency & Dry-Run (runQuickstart)', () => {
    it('performs zero disk writes on dryRun and lists all planned files', async () => {
      const result = await runQuickstart({
        dir: tmpDir,
        dryRun: true,
        agents: 'cursor',
      });
      expect(result.dryRun).toBe(true);
      expect(result.tier).toBe('starter');
      expect(result.lang).toBe('en');
      expect(result.detectedStacks).toEqual(['generic']);
      expect(result.plannedFiles).toEqual([
        '.qa-11x.json',
        'AGENTS.md',
        '.cursor/rules/qa-11x.mdc',
        '.agents/ACTIVE_TASK.md',
        '.github/workflows/qa-11x-pr.yml',
      ]);
      expect(fs.readdirSync(tmpDir)).toEqual([]);

      const textSummary = formatQuickstartOutput(result, false);
      expect(textSummary).toContain('✔ [quickstart:dry-run]');
      expect(textSummary).toContain('tier=starter');
    });

    it('creates starter, standard (7 gates), and enterprise (13 gates) setups and stays idempotent', async () => {
      writeProjectFile(tmpDir, 'pyproject.toml', '[project]\ndependencies = ["fastapi"]\n');
      const starter = await runQuickstart({ dir: tmpDir, agents: ['copilot'] });
      expect(starter.activeGates).toHaveLength(3);
      expect(starter.activeGates).toEqual(QUICKSTART_TIER_PROFILES.starter);
      expect(fs.existsSync(path.join(tmpDir, '.qa-11x.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.github/copilot-instructions.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.agents/ACTIVE_TASK.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.github/workflows/qa-11x-pr.yml'))).toBe(true);

      const auditAfterQuickstart = await auditSecurityStigOwasp(tmpDir);
      expect(
        auditAfterQuickstart.findings.filter((f) => f.rule_id === 'SEC-CI-ACTION-REF')
      ).toHaveLength(0);

      const activeTaskLines = fs
        .readFileSync(path.join(tmpDir, '.agents/ACTIVE_TASK.md'), 'utf8')
        .split(/\r?\n/);
      expect(activeTaskLines.length).toBeLessThanOrEqual(40);

      // Customize workflow, ACTIVE_TASK, and .qa-11x.json extra metadata
      writeProjectFile(tmpDir, '.agents/ACTIVE_TASK.md', '# Custom Task\n- **Estado:** `IN_PROGRESS`\n');
      writeProjectFile(tmpDir, '.github/workflows/qa-11x-pr.yml', 'name: Custom PR Check\n');
      const existingCfg = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.qa-11x.json'), 'utf8')
      ) as Record<string, unknown>;
      writeProjectFile(
        tmpDir,
        '.qa-11x.json',
        JSON.stringify({ ...existingCfg, customTeamOwner: 'platform-qa' }, null, 2)
      );

      // Upgrade to standard without --force: preserves customized task/workflow/metadata
      const standard = await runQuickstart({ dir: tmpDir, tier: 'standard', lang: 'es' });
      expect(standard.activeGates).toHaveLength(7);
      expect(standard.lang).toBe('es');
      expect(standard.files.find((f) => f.relativePath === '.agents/ACTIVE_TASK.md')?.action).toBe(
        'preserved'
      );
      expect(standard.files.find((f) => f.relativePath === '.github/workflows/qa-11x-pr.yml')?.action).toBe(
        'preserved'
      );
      const updatedCfg = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.qa-11x.json'), 'utf8')
      ) as { customTeamOwner?: string; tier?: string };
      expect(updatedCfg.customTeamOwner).toBe('platform-qa');
      expect(updatedCfg.tier).toBe('standard');

      // Re-run without --tier or --lang: preserves 'standard' and 'es'
      const preservedRun = await runQuickstart({ dir: tmpDir });
      expect(preservedRun.tier).toBe('standard');
      expect(preservedRun.lang).toBe('es');
      expect(preservedRun.files.find((f) => f.relativePath === '.qa-11x.json')?.action).toBe('preserved');

      // Run with --force and enterprise tier: refreshes managed files & removes custom keys
      const enterprise = await runQuickstart({
        dir: tmpDir,
        tier: 'enterprise',
        force: true,
        ci: 'github',
      });
      expect(enterprise.activeGates).toHaveLength(13);
      expect(enterprise.nextCommand).toBe('make validate-calm && make certify');
      expect(enterprise.files.find((f) => f.relativePath === '.agents/ACTIVE_TASK.md')?.action).toBe(
        'updated'
      );
      const forcedCfg = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.qa-11x.json'), 'utf8')
      ) as { customTeamOwner?: string };
      expect(forcedCfg.customTeamOwner).toBeUndefined();
    });

    it('detects pre-existing Spanish AGENTS.md and supports --ci none', async () => {
      writeProjectFile(
        tmpDir,
        'AGENTS.md',
        '# Directives\nAlways interact with the user in Spanish (español).\n'
      );
      const res = await runQuickstart({ dir: tmpDir, ci: 'none' });
      expect(res.lang).toBe('es');
      expect(res.ci).toBe('none');
      expect(fs.existsSync(path.join(tmpDir, '.github/workflows/qa-11x-pr.yml'))).toBe(false);
    });

    it('recovers safely if existing .qa-11x.json has invalid tier, non-object JSON, or corrupt JSON, and supports projectPath option', async () => {
      writeProjectFile(tmpDir, '.qa-11x.json', JSON.stringify({ tier: 'invalid-tier' }));
      const res = await runQuickstart({ projectPath: tmpDir, ci: 'none' });
      expect(res.tier).toBe('starter');

      writeProjectFile(tmpDir, '.qa-11x.json', '[]');
      writeProjectFile(tmpDir, 'AGENTS.md', '# English Directives\nRespond in English.\n');
      const resArr = await runQuickstart({ dir: tmpDir, ci: 'github' });
      expect(resArr.tier).toBe('starter');
      expect(resArr.lang).toBe('en');

      // Re-run with --force when workflow content is already identical -> preserved
      const resSame = await runQuickstart({ dir: tmpDir, force: true, ci: 'github' });
      expect(resSame.files.find((f) => f.relativePath === '.github/workflows/qa-11x-pr.yml')?.action).toBe(
        'preserved'
      );

      writeProjectFile(tmpDir, '.qa-11x.json', '{corrupt');
      const res2 = await runQuickstart({ dir: tmpDir, ci: 'none' });
      expect(res2.tier).toBe('starter');
    });
  });

  describe('Path Traversal, Validation & Fail-Closed CLI Integration', () => {
    it('rejects path traversal, critical system paths, symlinks escaping root, and invalid options', async () => {
      expect(() => resolveQuickstartTargetDir('')).toThrow('forbidden');
      expect(() => resolveQuickstartTargetDir('bad\0dir')).toThrow('forbidden');
      expect(() => resolveQuickstartTargetDir('../outside')).toThrow('forbidden');
      expect(() => resolveQuickstartTargetDir('/')).toThrow('critical system path');
      expect(() => resolveQuickstartTargetDir('/etc')).toThrow('critical system path');
      expect(() => resolveQuickstartTargetDir(path.join(tmpDir, 'missing'))).toThrow('does not exist');

      const regFile = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(regFile, 'x', 'utf8');
      expect(() => resolveQuickstartTargetDir(regFile)).toThrow('not a directory');

      expect(() => resolveQuickstartTargetDir(outsideDir, tmpDir)).toThrow('outside allowed boundary');
      expect(() => resolveQuickstartTargetDir(tmpDir, path.join(tmpDir, 'missing-boundary'))).toThrow(
        'Base boundary directory does not exist'
      );
      const nested = path.join(tmpDir, 'nested');
      fs.mkdirSync(nested);
      expect(resolveQuickstartTargetDir(nested, tmpDir)).toBe(fs.realpathSync(nested));

      const outsideTarget = path.join(outsideDir, 'stolen.json');
      fs.writeFileSync(outsideTarget, '{}', 'utf8');
      fs.symlinkSync(outsideTarget, path.join(tmpDir, '.qa-11x.json'));
      await expect(runQuickstart({ dir: tmpDir })).rejects.toThrow(
        'Symlink path traversal outside project root'
      );

      fs.unlinkSync(path.join(tmpDir, '.qa-11x.json'));
      fs.symlinkSync(path.join(outsideDir, 'dangling-target.json'), path.join(tmpDir, '.qa-11x.json'));
      await expect(runQuickstart({ dir: tmpDir })).rejects.toThrow(
        'Symbolic link target is forbidden for managed file'
      );
      fs.unlinkSync(path.join(tmpDir, '.qa-11x.json'));

      expect(validateQuickstartTier()).toBe('starter');
      expect(validateQuickstartCi()).toBe('github');
      expect(() => validateQuickstartTier('gold')).toThrow('Unsupported tier');
      expect(() => validateQuickstartCi('jenkins')).toThrow('Unsupported CI target');
    });

    it('wires quickstart in cli.ts with --json, Pass-Quiet summary, defaults, and Fail-Closed errors', async () => {
      expect(CLI_USAGE_TEXT).toContain('quickstart');

      const minimalParsed = parseCliArgs(['quickstart'], tmpDir);
      expect(minimalParsed.command).toBe('quickstart');
      expect(minimalParsed.lang).toBe('en');
      expect(minimalParsed.tier).toBeUndefined();

      const parsed = parseCliArgs(
        [
          'quickstart',
          '--dir',
          tmpDir,
          '--tier=standard',
          '--lang=es',
          '--agents=cursor',
          '--ci=none',
          '--dry-run',
          '--force',
          '--json',
        ],
        tmpDir
      );
      expect(parsed.command).toBe('quickstart');
      expect(parsed.tier).toBe('standard');
      expect(parsed.lang).toBe('es');
      expect(parsed.ci).toBe('none');
      expect(parsed.dryRun).toBe(true);
      expect(parsed.force).toBe(true);
      expect(parsed.json).toBe(true);

      writeProjectFile(tmpDir, '.bolt/config.json', '{"template":"vite"}\n');
      const jsonLogs: string[] = [];
      const jsonRun = await runCli(
        ['quickstart', tmpDir, '--tier', 'enterprise', '--json'],
        { cwd: tmpDir, baseBoundaryDir: tmpDir, log: (m) => jsonLogs.push(m), errorLog: () => undefined }
      );
      expect(jsonRun.exitCode).toBe(0);
      expect(jsonRun.quickstartResult?.vibePrototypeDetected).toBe(true);
      const firstJsonLog = jsonLogs[0];
      expect(firstJsonLog).toBeDefined();
      const parsedJson = JSON.parse(firstJsonLog ?? '{}') as { tier?: string; activeGates?: unknown[] };
      expect(parsedJson.tier).toBe('enterprise');
      expect(parsedJson.activeGates).toHaveLength(13);

      if (!jsonRun.quickstartResult) {
        throw new Error('Expected quickstartResult to be defined');
      }
      const quietText = formatQuickstartOutput(jsonRun.quickstartResult, false);
      expect(quietText).toContain('⚠ [vibe-detected]');
      expect(quietText).toContain('audit_vibe_prototype');

      const textLogs: string[] = [];
      const plainRun = await runCli(['quickstart', '-p', tmpDir], {
        cwd: tmpDir,
        log: (m) => textLogs.push(m),
        errorLog: () => undefined,
      });
      expect(plainRun.exitCode).toBe(0);
      expect(textLogs[0]).toContain('✔ [quickstart:ready]');

      const failCases: readonly string[][] = [
        ['quickstart', '--unknown-flag'],
        ['quickstart', '--unknown=val'],
        ['quickstart', tmpDir, 'extra-dir'],
        ['quickstart', '--tier'],
        ['quickstart', '--tier='],
        ['quickstart', '--tier', 'invalid'],
        ['quickstart', '--lang', 'fr'],
        ['quickstart', '--ci', 'gitlab'],
        ['quickstart', '--dir', '../escape'],
      ];
      for (const argv of failCases) {
        const errors: string[] = [];
        const res = await runCli(argv, {
          cwd: tmpDir,
          baseBoundaryDir: tmpDir,
          log: () => undefined,
          errorLog: (m) => errors.push(m),
        });
        expect(res.exitCode).toBe(1);
        expect(errors[0]).toContain('❌ [quickstart]');
      }

      expect(() => parseQuickstartCliArgs(['--tier', 'starter'], tmpDir).tier).not.toThrow();
      expect(parseQuickstartCliArgs([]).command).toBe('quickstart');

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const defaultFail = await runCli(['quickstart', '--tier', 'bad']);
        expect(defaultFail.exitCode).toBe(1);
        expect(errSpy).toHaveBeenCalled();

        const defaultOk = await runCli(['quickstart', '--dir', tmpDir, '--dry-run']);
        expect(defaultOk.exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalled();

        // --help y -h son estrictamente no destructivos en repo vacío
        const helpTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-qs-help-empty-'));
        try {
          const helpLogs: string[] = [];
          const qsHelp = await runCli(['quickstart', '--help', helpTmpDir], {
            cwd: helpTmpDir,
            log: (m) => helpLogs.push(m),
            errorLog: () => undefined,
          });
          expect(qsHelp.exitCode).toBe(0);
          expect(helpLogs.join('\n')).toContain('quickstart');
          expect(fs.readdirSync(helpTmpDir)).toEqual([]);
        } finally {
          fs.rmSync(helpTmpDir, { recursive: true, force: true });
        }

        // Plantilla workflow usa @v3 y actions/checkout@v5.1.0 pineado
        const workflowTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-qs-v3-'));
        try {
          const realQs = await runQuickstart({ dir: workflowTmpDir, ci: 'github' });
          expect(realQs.dryRun).toBe(false);
          const workflowText = fs.readFileSync(
            path.join(workflowTmpDir, '.github/workflows/qa-11x-pr.yml'),
            'utf8'
          );
          expect(workflowText).toContain('qa-11x-pr-check@v3 # sec-ci-action-ref-ok');
          expect(workflowText).toContain(
            'actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v5.1.0'
          );
        } finally {
          fs.rmSync(workflowTmpDir, { recursive: true, force: true });
        }
      } finally {
        errSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('falls back safely when optional manifest files cannot be read (readTextSafe catch)', () => {
      writeProjectFile(tmpDir, 'pyproject.toml', '[project]\nname = "demo"\n');
      const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });
      try {
        const profile = detectProjectStackProfile(tmpDir);
        expect(profile.stacks).toContain('generic');
      } finally {
        readSpy.mockRestore();
      }
    });
  });

function extractYamlRunBlocks(rawYaml: string): string[] {
  const lines = rawYaml.split(/\r?\n/);
  const blocks: string[] = [];
  let inRun = false;
  let baseIndent = 0;
  let current: string[] = [];

  for (const line of lines) {
    const runMatch = /^([ \t]*)run:\s*\|/.exec(line);
    if (runMatch) {
      if (inRun) {
        blocks.push(current.join('\n'));
      }
      inRun = true;
      baseIndent = (runMatch[1] ?? '').length;
      current = [];
      continue;
    }
    if (!inRun) {
      continue;
    }
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (trimmed.length > 0 && indent <= baseIndent) {
      blocks.push(current.join('\n'));
      inRun = false;
      current = [];
    } else {
      current.push(line);
    }
  }
  if (inRun) {
    blocks.push(current.join('\n'));
  }
  return blocks;
}

  describe('Composite Action Security & Schema Audit (.github/actions/qa-11x-pr-check/action.yml)', () => {
    it('declares canonical inputs/outputs, Rule Zero non-root Docker, and zero script injection in run blocks', () => {
      expect(fs.existsSync(ACTION_YML_PATH)).toBe(true);
      const raw = fs.readFileSync(ACTION_YML_PATH, 'utf8');

      expect(raw).toContain("using: 'composite'");
      for (const requiredInput of [
        'tier:',
        'lang:',
        'base-ref:',
        'working-directory:',
        'python-image:',
        'node-image:',
      ]) {
        expect(raw).toContain(requiredInput);
      }
      for (const requiredOutput of [
        'tier:',
        'blast-plan-tier:',
        'estimated-savings-pct:',
        'verdict:',
      ]) {
        expect(raw).toContain(requiredOutput);
      }

      expect(raw).toContain('-u "$(id -u):$(id -g)"');
      expect(raw).toContain('-e HOME=/tmp');

      // Extract every `run: |` block and verify ZERO `${{ inputs.` or `${{ github.` interpolations
      const runBlocks = extractYamlRunBlocks(raw);
      expect(runBlocks.length).toBe(3);
      for (const block of runBlocks) {
        expect(block).not.toContain('${{ inputs.');
        expect(block).not.toContain('${{ github.');
      }
    });
  });
});
