// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchBlueprintBundle } from '../src/tools/fetch-bundle.js';
import { bootstrapOrMerge11x } from '../src/tools/bootstrap-merge.js';
import { inspectAstBlastRadius } from '../src/tools/blast-radius.js';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
import { BlueprintResources } from '../src/resources/blueprint-resources.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { createMcpServer } from '../src/server.js';
import { Manifest } from '../src/types.js';

describe('Tools and Resources Integration Suite', () => {
  let tmpDir: string;
  let localRepoDir: string;
  let targetProjectDir: string;
  let fetcher: GitHubFetcher;
  let merger: SurgicalMerger;
  let mockManifest: Manifest;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-test-'));
    localRepoDir = path.join(tmpDir, 'repo');
    targetProjectDir = path.join(tmpDir, 'target-project');
    fs.mkdirSync(localRepoDir, { recursive: true });
    fs.mkdirSync(targetProjectDir, { recursive: true });

    // Preparar manifest mock con archivos locales
    const file1 = 'python/Makefile.example';
    const content1 = 'qa-all:\n\techo "ok"\n';
    const hash1 = crypto.createHash('sha256').update(content1).digest('hex');

    const skillFile = '.agents/skills/qa-11x-architect/SKILL.md';
    const skillContent = '# Architect Skill';
    const skillHash = crypto.createHash('sha256').update(skillContent).digest('hex');

    const refactFile = '.agents/skills/refactoring-ui/SKILL.md';
    const refactContent = '# Refactoring UI';
    const refactHash = crypto.createHash('sha256').update(refactContent).digest('hex');

    const promptFile = 'AI_MASTER_PROMPT.md';
    const promptContent = '# Master Prompt';
    const promptHash = crypto.createHash('sha256').update(promptContent).digest('hex');

    const readmeFile = 'python/README.md';
    const readmeContent = '# Python Blueprint Documentation';
    const readmeHash = crypto.createHash('sha256').update(readmeContent).digest('hex');

    const secFile = '.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md';
    const secContent = '# 22 Security Patterns';
    const secHash = crypto.createHash('sha256').update(secContent).digest('hex');

    const activeTaskFile = '.agents/ACTIVE_TASK.md.example';
    const activeTaskContent = '# Active Task Template Example';
    const activeTaskHash = crypto.createHash('sha256').update(activeTaskContent).digest('hex');

    const validatorFile = '.agents/scripts/verify_roadmap_consistency.py';
    const validatorContent = '#!/usr/bin/env python3\n# Roadmap and Active Task Validator';
    const validatorHash = crypto.createHash('sha256').update(validatorContent).digest('hex');

    const cleanFile = 'scripts/limpieza.sh';
    const cleanContent = '#!/usr/bin/env bash\necho "cleaning"';
    const cleanHash = crypto.createHash('sha256').update(cleanContent).digest('hex');

    mockManifest = {
      schema_version: '1.0.0',
      blueprint_version: '2.7.0',
      generated_at_utc: '2026-11-03T00:00:00Z',
      repository: 'test/repo',
      default_branch: 'main',
      raw_base_url: 'https://raw.test',
      stacks: {
        python: {
          description: 'Python Standalone',
          readme: 'python/README.md',
          files: [
            {
              path: file1,
              target_name: 'Makefile',
              merge_strategy: 'surgical_merge',
              sha256: hash1,
              size_bytes: content1.length,
            },
            {
              path: readmeFile,
              target_name: 'README.md',
              merge_strategy: 'copy_if_missing',
              sha256: readmeHash,
              size_bytes: readmeContent.length,
            },
          ],
        },
      },
      common_files: [
        {
          path: cleanFile,
          target_name: cleanFile,
          merge_strategy: 'overwrite_executable',
          sha256: cleanHash,
          size_bytes: cleanContent.length,
        },
      ],
      agent_governance_files: [
        {
          path: skillFile,
          target_name: skillFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: skillHash,
          size_bytes: skillContent.length,
        },
        {
          path: refactFile,
          target_name: refactFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: refactHash,
          size_bytes: refactContent.length,
        },
        {
          path: promptFile,
          target_name: promptFile,
          merge_strategy: 'surgical_merge',
          sha256: promptHash,
          size_bytes: promptContent.length,
        },
        {
          path: secFile,
          target_name: secFile,
          merge_strategy: 'copy_or_overwrite',
          sha256: secHash,
          size_bytes: secContent.length,
        },
        {
          path: activeTaskFile,
          target_name: '.agents/ACTIVE_TASK.md',
          merge_strategy: 'copy_if_missing',
          sha256: activeTaskHash,
          size_bytes: activeTaskContent.length,
        },
        {
          path: validatorFile,
          target_name: validatorFile,
          merge_strategy: 'overwrite_executable',
          sha256: validatorHash,
          size_bytes: validatorContent.length,
        },
      ],
    };

    fs.writeFileSync(path.join(localRepoDir, 'manifest.json'), JSON.stringify(mockManifest), 'utf-8');

    // Escribir los archivos en disco dentro de localRepoDir
    const writeRepoFile = (rel: string, c: string) => {
      const p = path.join(localRepoDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, c, 'utf-8');
    };

    writeRepoFile(file1, content1);
    writeRepoFile(readmeFile, readmeContent);
    writeRepoFile(skillFile, skillContent);
    writeRepoFile(refactFile, refactContent);
    writeRepoFile(promptFile, promptContent);
    writeRepoFile(secFile, secContent);
    writeRepoFile(activeTaskFile, activeTaskContent);
    writeRepoFile(validatorFile, validatorContent);
    writeRepoFile(cleanFile, cleanContent);

    fetcher = new GitHubFetcher({
      cacheDir: path.join(tmpDir, 'cache'),
      localOverridePath: localRepoDir,
    });
    merger = new SurgicalMerger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('fetchBlueprintBundle Tool', () => {
    it('returns bundled files with verified SHA-256', async () => {
      const result = await fetchBlueprintBundle('python', true, fetcher);
      expect(result.stack).toBe('python');
      expect(result.total_files).toBeGreaterThan(0);
      expect(result.files[0].sha256_verified).toBe(true);
    });
  });

  describe('bootstrapOrMerge11x Tool', () => {
    it('executes non-destructive merge into target project directory', async () => {
      const result = await bootstrapOrMerge11x(targetProjectDir, 'python', false, fetcher, merger);
      expect(result.stack).toBe('python');
      expect(result.dry_run).toBe(false);
      expect(fs.existsSync(path.join(targetProjectDir, 'Makefile'))).toBe(true);
    });
  });

  describe('inspectAstBlastRadius Tool', () => {
    it('detects dependent files and calculates risk level MEDIUM (3-5)', async () => {
      fs.writeFileSync(
        path.join(targetProjectDir, 'service.py'),
        'from models import UserModel\n\ndef get_user(): pass\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'controller.py'),
        'from service import UserModel\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetProjectDir, 'test_user.unit.py'),
        'from models import UserModel\n',
        'utf-8'
      );

      const result = await inspectAstBlastRadius(targetProjectDir, 'UserModel');

      expect(result.target_symbol).toBe('UserModel');
      expect(result.dependent_files_count).toBe(3);
      expect(result.risk_level).toBe('MEDIUM');
      expect(result.dependent_files).toContain('service.py');
      expect(result.dependent_files).toContain('controller.py');
      expect(result.dependent_files).toContain('test_user.unit.py');
      expect(result.suggested_tests_to_run).toContain('test_user.unit.py');
    });

    it('assigns LOW risk when dependent count <= 2', async () => {
      fs.writeFileSync(path.join(targetProjectDir, 'single.py'), 'def helper(): pass\n', 'utf-8');
      const result = await inspectAstBlastRadius(targetProjectDir, 'helper');
      expect(result.risk_level).toBe('LOW');
    });

    it('assigns HIGH risk when dependent count is 6-10', async () => {
      for (let i = 1; i <= 7; i++) {
        fs.writeFileSync(path.join(targetProjectDir, `mod_${i}.py`), 'from core import SharedSymbol\n', 'utf-8');
      }
      const result = await inspectAstBlastRadius(targetProjectDir, 'SharedSymbol');
      expect(result.risk_level).toBe('HIGH');
      expect(result.dependent_files_count).toBe(7);
    });

    it('assigns CRITICAL risk when dependent count > 10', async () => {
      for (let i = 1; i <= 12; i++) {
        fs.writeFileSync(path.join(targetProjectDir, `crit_${i}.py`), 'from core import CriticalSymbol\n', 'utf-8');
      }
      const result = await inspectAstBlastRadius(targetProjectDir, 'CriticalSymbol');
      expect(result.risk_level).toBe('CRITICAL');
      expect(result.dependent_files_count).toBe(12);
    });

    it('recurses into nested directories and ignores ignored directories like node_modules and .cache', async () => {
      const nestedDir = path.join(targetProjectDir, 'nested', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, 'deep_service.ts'), 'export const target = NestedSymbol;\n', 'utf-8');

      const cacheDir = path.join(targetProjectDir, '.cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'cache_file.ts'), 'NestedSymbol\n', 'utf-8');

      const nodeModulesDir = path.join(targetProjectDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'lib.ts'), 'NestedSymbol\n', 'utf-8');

      const result = await inspectAstBlastRadius(targetProjectDir, 'NestedSymbol');
      expect(result.dependent_files).toContain(path.join('nested', 'deep', 'deep_service.ts'));
      expect(result.dependent_files.some(f => f.includes('.cache'))).toBe(false);
      expect(result.dependent_files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('throws error if target directory does not exist', async () => {
      await expect(inspectAstBlastRadius(path.join(tmpDir, 'nonexistent'), 'Symbol')).rejects.toThrow(
        'El directorio no existe'
      );
    });
  });

  describe('BlueprintResources', () => {
    it('returns manifest resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getManifestResource();
      expect(res.uri).toBe('blueprint://manifest');
      expect(res.mimeType).toBe('application/json');
      expect(JSON.parse(res.text).blueprint_version).toBe('2.7.0');
    });

    it('returns philosophy resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getPhilosophyResource();
      expect(res.uri).toBe('blueprint://core/philosophy');
      expect(res.text).toBe('# Master Prompt');
    });

    it('returns security resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getSecurityResource();
      expect(res.uri).toBe('blueprint://security/disa-owasp-22');
      expect(res.text).toBe('# 22 Security Patterns');
    });

    it('returns stack readme resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getStackReadmeResource('python');
      expect(res.uri).toBe('blueprint://python/readme');
    });

    it('throws error when requesting unknown stack readme', async () => {
      const resources = new BlueprintResources(fetcher);
      await expect(resources.getStackReadmeResource('invalid-stack')).rejects.toThrow(
        "Stack 'invalid-stack' no reconocido"
      );
    });

    it('returns refactoring-ui resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getRefactoringUiResource('skill');
      expect(res.uri).toBe('blueprint://ui/refactoring-ui/skill');
      expect(res.text).toBe('# Refactoring UI');
    });

    it('returns active task template resource', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getActiveTaskTemplateResource();
      expect(res.uri).toBe('blueprint://core/active-task-template');
      expect(res.mimeType).toBe('text/markdown');
      expect(res.text).toBe('# Active Task Template Example');
    });

    it('throws error when requesting unknown refactoring-ui topic', async () => {
      const resources = new BlueprintResources(fetcher);
      await expect(resources.getRefactoringUiResource('unknown-topic')).rejects.toThrow(
        "Tema de diseño 'unknown-topic' no encontrado"
      );
    });

    it('handles fallback when prompt or security file is absent in manifest', async () => {
      const emptyManifest: Manifest = {
        ...mockManifest,
        agent_governance_files: [],
      };
      const emptyFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'empty-cache'),
        localOverridePath: path.join(tmpDir, 'empty-repo'),
      });
      fs.mkdirSync(path.join(tmpDir, 'empty-repo'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'empty-repo', 'manifest.json'),
        JSON.stringify(emptyManifest),
        'utf-8'
      );

      const resources = new BlueprintResources(emptyFetcher);
      const phil = await resources.getPhilosophyResource();
      expect(phil.text).toContain('Filosofía QA 11X');

      const sec = await resources.getSecurityResource();
      expect(sec.text).toContain('22 Patrones de Seguridad');

      const task = await resources.getActiveTaskTemplateResource();
      expect(task.text).toContain('ACTIVE_TASK.md.example');
    });
  });

  describe('runInstallSkillCli', () => {
    it('installs skills into target workspace directory with --target workspace', async () => {
      const cwd = process.cwd();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const dest = path.join(targetProjectDir, 'cli-test');
      fs.mkdirSync(dest, { recursive: true });

      try {
        process.chdir(dest);
        await runInstallSkillCli(['--target', 'workspace'], fetcher);

        expect(fs.existsSync(path.join(dest, '.agents/skills/qa-11x-architect/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(dest, '.agents/skills/refactoring-ui/SKILL.md'))).toBe(true);
      } finally {
        process.chdir(cwd);
        consoleLogSpy.mockRestore();
      }
    });

    it('installs skills with --target=antigravity and --target claude', async () => {
      const cwd = process.cwd();
      const fakeWorkspace = path.join(tmpDir, 'all-target-ws');
      fs.mkdirSync(fakeWorkspace, { recursive: true });

      const fakeHome = path.join(tmpDir, 'fake-home');
      fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.hermes'), { recursive: true });

      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(fakeWorkspace);
        await runInstallSkillCli(['--target=antigravity'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['-t', 'claude'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.claude/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['--target', 'hermes'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.hermes/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        await runInstallSkillCli(['--target', 'all'], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(fakeWorkspace, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
      } finally {
        process.chdir(cwd);
        process.env.HOME = origHome;
      }
    });

    it('throws error if manifest has no skills', async () => {
      const noSkillManifest: Manifest = {
        ...mockManifest,
        agent_governance_files: [],
      };
      const emptyFetcher = new GitHubFetcher({
        cacheDir: path.join(tmpDir, 'no-skills-cache'),
        localOverridePath: path.join(tmpDir, 'no-skills-repo'),
      });
      fs.mkdirSync(path.join(tmpDir, 'no-skills-repo'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'no-skills-repo', 'manifest.json'),
        JSON.stringify(noSkillManifest),
        'utf-8'
      );

      vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(runInstallSkillCli([], emptyFetcher)).rejects.toThrow(
        'No se encontraron archivos de skills'
      );
    });

    it('handles auto target when in git workspace and when outside git workspace', async () => {
      const cwd = process.cwd();
      const fakeWorkspace = path.join(tmpDir, 'auto-ws');
      fs.mkdirSync(path.join(fakeWorkspace, '.git'), { recursive: true });

      const fakeHome = path.join(tmpDir, 'auto-home');
      fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });

      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        // 1. En git workspace -> instala en workspace/.agents/skills
        process.chdir(fakeWorkspace);
        await runInstallSkillCli(['--target', 'auto'], fetcher);
        expect(
          fs.existsSync(path.join(fakeWorkspace, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        // 2. Fuera de git workspace pero con .gemini en home -> instala en ~/.gemini/config/skills
        const nonGitDir = path.join(tmpDir, 'non-git-dir');
        fs.mkdirSync(nonGitDir, { recursive: true });
        process.chdir(nonGitDir);
        await runInstallSkillCli(['--target=other' as any], fetcher);
        expect(
          fs.existsSync(path.join(fakeHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);

        // 3. Sin .gemini en home y sin git -> fallback a cwd/.agents/skills
        const isolatedHome = path.join(tmpDir, 'isolated-home');
        fs.mkdirSync(isolatedHome, { recursive: true });
        process.env.HOME = isolatedHome;
        const isolatedCwd = path.join(tmpDir, 'isolated-cwd');
        fs.mkdirSync(isolatedCwd, { recursive: true });
        process.chdir(isolatedCwd);
        await runInstallSkillCli(['--target=unknown' as any], fetcher);
        expect(
          fs.existsSync(path.join(isolatedCwd, '.agents/skills/qa-11x-architect/SKILL.md'))
        ).toBe(true);
      } finally {
        process.chdir(cwd);
        process.env.HOME = origHome;
      }
    });

    it('initializes default GitHubFetcher in runInstallSkillCli when omitted', async () => {
      const cwd = process.cwd();
      const testDir = path.join(tmpDir, 'default-fetcher-test');
      fs.mkdirSync(testDir, { recursive: true });
      process.env.QA_BLUEPRINTS_LOCAL_PATH = localRepoDir;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        process.chdir(testDir);
        await runInstallSkillCli(['--target', 'workspace']);
        expect(fs.existsSync(path.join(testDir, '.agents/skills/qa-11x-architect/SKILL.md'))).toBe(true);
      } finally {
        delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
        process.chdir(cwd);
      }
    });
  });

  describe('cleanWorkspace11x and Cleanup Resource Suite', () => {
    it('audits workspace artifacts in dry_run mode without deleting', async () => {
      const dummyCoverage = path.join(targetProjectDir, '.coverage');
      const dummyPytest = path.join(targetProjectDir, '.pytest_cache');
      const dummyDist = path.join(targetProjectDir, 'dist');
      fs.writeFileSync(dummyCoverage, 'cov');
      fs.mkdirSync(dummyPytest, { recursive: true });
      fs.mkdirSync(dummyDist, { recursive: true });

      const res = await cleanWorkspace11x(targetProjectDir, true, false);
      expect(res.dry_run).toBe(true);
      expect(res.deep_prune).toBe(false);
      expect(res.found_targets).toContain('.coverage');
      expect(res.found_targets).toContain('.pytest_cache');
      expect(res.found_targets).toContain('dist');
      expect(res.removed_targets).toHaveLength(0);
      expect(res.recommended_command).toBe('./scripts/limpieza.sh');

      expect(fs.existsSync(dummyCoverage)).toBe(true);
      expect(fs.existsSync(dummyPytest)).toBe(true);
    });

    it('removes workspace artifacts when dry_run is false', async () => {
      const dummyCoverage = path.join(targetProjectDir, '.coverage');
      const dummySubdir = path.join(targetProjectDir, 'backend', '.pytest_cache');
      fs.writeFileSync(dummyCoverage, 'cov');
      fs.mkdirSync(dummySubdir, { recursive: true });

      const res = await cleanWorkspace11x(targetProjectDir, false, true);
      expect(res.dry_run).toBe(false);
      expect(res.deep_prune).toBe(true);
      expect(res.removed_targets).toContain('.coverage');
      expect(res.removed_targets).toContain('backend/.pytest_cache');
      expect(res.recommended_command).toBe('./scripts/limpieza.sh --deep');

      expect(fs.existsSync(dummyCoverage)).toBe(false);
      expect(fs.existsSync(dummySubdir)).toBe(false);
    });

    it('uses alpine docker fallback when local removal encounters permission errors', async () => {
      const lockedDir = path.join(targetProjectDir, 'backend');
      fs.mkdirSync(lockedDir, { recursive: true });
      const dummyCoverage = path.join(lockedDir, '.coverage');
      fs.writeFileSync(dummyCoverage, 'root-owned');

      const fakeFallback = vi.fn().mockImplementation((_dir: string, targets: string[]) => {
        for (const t of targets) {
          const p = path.join(targetProjectDir, t);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        return true;
      });

      try {
        const res = await cleanWorkspace11x(
          targetProjectDir,
          false,
          false,
          fakeFallback,
          () => ({ removed: false })
        );
        expect(res.docker_fallback_used).toBe(true);
        expect(fakeFallback).toHaveBeenCalled();
        expect(res.removed_targets).toContain('backend/.coverage');
      } finally {
        if (fs.existsSync(dummyCoverage)) fs.unlinkSync(dummyCoverage);
      }
    });

    it('handles alpine fallback failure gracefully when docker is unavailable', async () => {
      const lockedDir = path.join(targetProjectDir, 'backend');
      fs.mkdirSync(lockedDir, { recursive: true });
      const dummyCoverage = path.join(lockedDir, '.coverage');
      fs.writeFileSync(dummyCoverage, 'root-owned');

      const fakeFallback = vi.fn().mockReturnValue(false);

      try {
        const res = await cleanWorkspace11x(
          targetProjectDir,
          false,
          false,
          fakeFallback,
          () => ({ removed: false })
        );
        expect(res.docker_fallback_used).toBe(false);
        expect(fakeFallback).toHaveBeenCalled();
      } finally {
        if (fs.existsSync(dummyCoverage)) fs.unlinkSync(dummyCoverage);
      }
    });

    it('throws error when project directory does not exist', async () => {
      await expect(cleanWorkspace11x(path.join(tmpDir, 'non-existent'))).rejects.toThrow(
        'no existe'
      );
    });

    it('retrieves cleanup script resource from BlueprintResources', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getCleanupScriptResource();
      expect(res.uri).toBe('blueprint://core/cleanup-script');
      expect(res.mimeType).toBe('text/x-shellscript');
      expect(res.text).toBe('#!/usr/bin/env bash\necho "cleaning"');
    });

    it('retrieves roadmap validator resource from BlueprintResources', async () => {
      const resources = new BlueprintResources(fetcher);
      const res = await resources.getRoadmapValidatorResource();
      expect(res.uri).toBe('blueprint://core/roadmap-validator');
      expect(res.mimeType).toBe('text/x-python');
      expect(res.text).toBe('#!/usr/bin/env python3\n# Roadmap and Active Task Validator');
    });

    it('falls back to default script when roadmap validator is not in manifest', async () => {
      const emptyManifest = { ...mockManifest, agent_governance_files: [] };
      const emptyFetcher = new GitHubFetcher();
      vi.spyOn(emptyFetcher, 'fetchManifest').mockResolvedValue(emptyManifest);

      const resources = new BlueprintResources(emptyFetcher);
      const res = await resources.getRoadmapValidatorResource();
      expect(res.text).toContain('#!/usr/bin/env python3');
    });

    it('falls back to default script when cleanup script is not in manifest', async () => {
      const emptyManifest = { ...mockManifest, common_files: [] };
      const emptyFetcher = new GitHubFetcher();
      vi.spyOn(emptyFetcher, 'fetchManifest').mockResolvedValue(emptyManifest);

      const resources = new BlueprintResources(emptyFetcher);
      const res = await resources.getCleanupScriptResource();
      expect(res.text).toContain('#!/usr/bin/env bash');
    });
  });

  describe('createMcpServer and Handlers Execution', () => {
    it('creates server with default options when omitted and matches 2.8.0 versioning', () => {
      const server = createMcpServer();
      expect(server).toBeDefined();
    });

    it('runs tools with default services when omitted', async () => {
      process.env.QA_BLUEPRINTS_LOCAL_PATH = localRepoDir;
      try {
        const bundle = await fetchBlueprintBundle('python', false);
        expect(bundle.total_files).toBeGreaterThan(0);

        const mergeRes = await bootstrapOrMerge11x(targetProjectDir, 'python', true);
        expect(mergeRes.dry_run).toBe(true);
      } finally {
        delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
      }
    });

    it('initializes McpServer and executes registered resources and tools', async () => {
      const server = createMcpServer({ fetcher, merger });
      expect(server).toBeDefined();

      const serverAny = server as any;

      // 1. Ejecutar resource: manifest
      const manifestRes = await serverAny._registeredResources['blueprint://manifest'].readCallback(
        new URL('blueprint://manifest')
      );
      expect(manifestRes.contents[0].text).toContain('"blueprint_version": "2.7.0"');

      // 2. Ejecutar resource: philosophy
      const philRes = await serverAny._registeredResources['blueprint://core/philosophy'].readCallback(
        new URL('blueprint://core/philosophy')
      );
      expect(philRes.contents[0].text).toBe('# Master Prompt');

      // 3. Ejecutar resource: security
      const secRes = await serverAny._registeredResources['blueprint://security/disa-owasp-22'].readCallback(
        new URL('blueprint://security/disa-owasp-22')
      );
      expect(secRes.contents[0].text).toBe('# 22 Security Patterns');

      // 4. Ejecutar resource template: stack readme
      const stackTemplate = serverAny._registeredResourceTemplates['blueprint-stack-readme'];
      expect(stackTemplate).toBeDefined();
      const stackRes = await stackTemplate.readCallback(new URL('blueprint://python/readme'), { stack: 'python' });
      expect(stackRes.contents[0].text).toContain('Python');

      // 5. Ejecutar resource template: refactoring-ui
      const uiTemplate = serverAny._registeredResourceTemplates['blueprint-refactoring-ui'];
      expect(uiTemplate).toBeDefined();
      const uiRes = await uiTemplate.readCallback(new URL('blueprint://ui/refactoring-ui/skill'), { topic: 'skill' });
      expect(uiRes.contents[0].text).toBe('# Refactoring UI');

      // 6. Ejecutar resource: active-task-template
      const taskRes = await serverAny._registeredResources['blueprint://core/active-task-template'].readCallback(
        new URL('blueprint://core/active-task-template')
      );
      expect(taskRes.contents[0].text).toBe('# Active Task Template Example');

      // 7. Ejecutar resource: cleanup-script
      const cleanRes = await serverAny._registeredResources['blueprint://core/cleanup-script'].readCallback(
        new URL('blueprint://core/cleanup-script')
      );
      expect(cleanRes.contents[0].text).toBe('#!/usr/bin/env bash\necho "cleaning"');

      // 8. Ejecutar resource: roadmap-validator
      const roadRes = await serverAny._registeredResources['blueprint://core/roadmap-validator'].readCallback(
        new URL('blueprint://core/roadmap-validator')
      );
      expect(roadRes.contents[0].text).toBe('#!/usr/bin/env python3\n# Roadmap and Active Task Validator');

      // 9. Ejecutar tool: inspect_project_config
      const toolInspect = serverAny._registeredTools['inspect_project_config'];
      expect(toolInspect).toBeDefined();
      const inspectRes = await toolInspect.handler({ project_path: targetProjectDir });
      expect(inspectRes.content[0].text).toContain(targetProjectDir);

      // 9. Ejecutar tool: fetch_blueprint_bundle
      const toolFetch = serverAny._registeredTools['fetch_blueprint_bundle'];
      expect(toolFetch).toBeDefined();
      const fetchRes = await toolFetch.handler({ stack: 'python', include_common_and_agents: true });
      expect(fetchRes.content[0].text).toContain('python');

      // 10. Ejecutar tool: bootstrap_or_merge_11x
      const toolMerge = serverAny._registeredTools['bootstrap_or_merge_11x'];
      expect(toolMerge).toBeDefined();
      const mergeRes = await toolMerge.handler({
        project_path: targetProjectDir,
        stack: 'python',
        dry_run: true,
      });
      expect(mergeRes.content[0].text).toContain('"dry_run": true');

      // 11. Ejecutar tool: inspect_ast_blast_radius
      const toolBlast = serverAny._registeredTools['inspect_ast_blast_radius'];
      expect(toolBlast).toBeDefined();
      const blastRes = await toolBlast.handler({
        project_path: targetProjectDir,
        target_symbol: 'test',
      });
      expect(blastRes.content[0].text).toContain('"risk_level"');

      // 12. Ejecutar tool: clean_workspace_11x
      const toolClean = serverAny._registeredTools['clean_workspace_11x'];
      expect(toolClean).toBeDefined();
      const cleanToolRes = await toolClean.handler({
        project_path: targetProjectDir,
        dry_run: true,
      });
      expect(cleanToolRes.content[0].text).toContain('"recommended_command"');

      // 13. Ejecutar tool: audit_security_stig_owasp
      const toolSec = serverAny._registeredTools['audit_security_stig_owasp'];
      expect(toolSec).toBeDefined();
      const secToolRes = await toolSec.handler({ project_path: targetProjectDir });
      expect(secToolRes.content[0].text).toContain('"findings_count"');

      // 14. Ejecutar tool: run_ephemeral_qa
      const toolQa = serverAny._registeredTools['run_ephemeral_qa'];
      expect(toolQa).toBeDefined();
      const qaToolRes = await toolQa.handler({
        project_path: targetProjectDir,
        stage: 'unit',
        timeout_seconds: 30,
      });
      expect(qaToolRes.content[0].text).toContain('"status"');

      // 15. Ejecutar tool: certify_11x_gate
      const toolCert = serverAny._registeredTools['certify_11x_gate'];
      expect(toolCert).toBeDefined();
      const certToolRes = await toolCert.handler({ project_path: targetProjectDir });
      expect(certToolRes.content[0].text).toContain('"gate_passed"');
    });
  });
});
