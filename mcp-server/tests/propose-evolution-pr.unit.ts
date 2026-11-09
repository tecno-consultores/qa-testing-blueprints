// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  proposeSkillEvolutionPr,
  buildEvolutionSlug,
  buildPrefilledIssueUrl,
  defaultExecRunner,
  ExecRunnerFunction,
  UPSTREAM_REPO,
} from '../src/tools/propose-evolution-pr.js';

const STATUS_PR_CREATED = 'PR_CREATED_VIA_GH';
const STATUS_PROPOSAL_GENERATED = 'PROPOSAL_FILE_AND_URL_GENERATED';
const TARGET_FILE = '.agents/skills/qa-11x-architect/SKILL.md';
const IMPROVEMENT_TITLE = 'Soporte Mejorado para Safe Mode en RouterOS v7';
const RATIONALE = 'En producción con MikroTik v7.18 se detectó que el Safe Mode requiere un rollback explícito tras 60s.';
const SNIPPET = '### Safe Mode Invariant\nassert router.safe_mode == True\n';

describe('propose_skill_evolution_pr Tool Suite (Zero-Trust Skill Evolution)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-evolution-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildEvolutionSlug', () => {
    it('converts titles with accents and special characters into a clean slug', () => {
      const slug = buildEvolutionSlug('¡Mejora Crítica de Safe-Mode & WebFig v7!');
      expect(slug).toBe('mejora-critica-de-safe-mode-webfig-v7');
    });

    it('truncates slugs exceeding 40 characters and strips trailing hyphens', () => {
      const longTitle = 'Esta es una propuesta extremadamente larga con muchisimas palabras para probar el recorte';
      const slug = buildEvolutionSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(40);
      expect(slug.endsWith('-')).toBe(false);
    });

    it('falls back to default slug when title produces empty string after sanitization', () => {
      const slug = buildEvolutionSlug('¿¿¿??? !!! @@@');
      expect(slug).toBe('skill-evolution');
    });
  });

  describe('buildPrefilledIssueUrl', () => {
    it('creates valid prefilled GitHub issue URL targeting upstream repo', () => {
      const { issueBody, prefilledUrl } = buildPrefilledIssueUrl({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title: IMPROVEMENT_TITLE,
        empirical_rationale: RATIONALE,
        proposed_content_or_snippet: SNIPPET,
      });

      expect(issueBody).toContain(UPSTREAM_REPO);
      expect(issueBody).toContain(TARGET_FILE);
      expect(issueBody).toContain(RATIONALE);
      expect(prefilledUrl).toContain(`https://github.com/${UPSTREAM_REPO}/issues/new?title=`);
      expect(prefilledUrl).toContain(encodeURIComponent(`[Evolution] ${IMPROVEMENT_TITLE}`));
    });
  });

  describe('proposeSkillEvolutionPr execution flows', () => {
    it('throws error when project_path does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'missing-dir');
      await expect(
        proposeSkillEvolutionPr({
          project_path: nonExistent,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
        })
      ).rejects.toThrow('El directorio del proyecto especificado no existe');
    });

    it('Option 2 (Universal Fallback): generates local proposal file and prefilled URL when prefer_offline_fallback is true', async () => {
      const result = await proposeSkillEvolutionPr({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title: IMPROVEMENT_TITLE,
        empirical_rationale: RATIONALE,
        proposed_content_or_snippet: SNIPPET,
        prefer_offline_fallback: true,
      });

      expect(result.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(result.gh_cli_authenticated).toBe(false);
      expect(result.pull_request_url).toBeNull();
      expect(result.branch_name).toContain('evolution/');
      expect(fs.existsSync(result.local_proposal_file)).toBe(true);

      const content = fs.readFileSync(result.local_proposal_file, 'utf-8');
      expect(content).toContain(IMPROVEMENT_TITLE);
      expect(content).toContain(TARGET_FILE);
      expect(content).toContain(RATIONALE);
      expect(content).toContain(SNIPPET);
      expect(result.prefilled_github_url).toContain(`https://github.com/${UPSTREAM_REPO}/issues/new`);
    });

    it('Option 2 fallback: when gh CLI is not installed or not authenticated', async () => {
      const mockExecRunner: ExecRunnerFunction = async (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          throw new Error('You are not logged into any GitHub hosts.');
        }
        return { stdout: '', stderr: '' };
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          prefer_offline_fallback: false,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(result.gh_cli_authenticated).toBe(false);
      expect(result.pull_request_url).toBeNull();
      expect(result.message).toContain('gh CLI no disponible o no autenticado');
      expect(fs.existsSync(result.local_proposal_file)).toBe(true);
    });

    it('Option 1 (Automated PR): successfully creates PR when gh CLI is authenticated', async () => {
      const prUrl = `https://github.com/${UPSTREAM_REPO}/pull/101`;
      const mockExecRunner: ExecRunnerFunction = async (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return { stdout: 'Logged in to github.com account dev', stderr: '' };
        }
        if (file === 'gh' && args[0] === 'pr' && args[1] === 'create') {
          return { stdout: `${prUrl}\n`, stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          prefer_offline_fallback: false,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PR_CREATED);
      expect(result.gh_cli_authenticated).toBe(true);
      expect(result.pull_request_url).toBe(prUrl);
      expect(result.message).toContain(prUrl);
      expect(fs.existsSync(result.local_proposal_file)).toBe(true);
    });

    it('handles gh pr create failure gracefully when gh auth succeeds but pr command fails', async () => {
      const mockExecRunner: ExecRunnerFunction = async (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '' };
        }
        if (file === 'gh' && args[0] === 'pr') {
          throw new Error('fatal: not a git repository');
        }
        return { stdout: '', stderr: '' };
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(result.gh_cli_authenticated).toBe(true);
      expect(result.pull_request_url).toBeNull();
      expect(result.message).toContain('gh CLI autenticado pero no se pudo crear el PR directamente');
    });

    it('extracts trimmed stdout as fallback when gh pr create does not match url regex', async () => {
      const mockExecRunner: ExecRunnerFunction = async (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '' };
        }
        if (file === 'gh' && args[0] === 'pr') {
          return { stdout: 'custom-output-identifier', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PR_CREATED);
      expect(result.pull_request_url).toBe('custom-output-identifier');
    });

    it('enforces Zero-Trust: zero tokens or secrets are expected or manipulated in the process', async () => {
      const envCopy = { ...process.env };
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const result = await proposeSkillEvolutionPr({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title: IMPROVEMENT_TITLE,
        empirical_rationale: RATIONALE,
        proposed_content_or_snippet: SNIPPET,
        prefer_offline_fallback: true,
      });

      expect(result.local_proposal_file).toBeDefined();
      expect(result.prefilled_github_url).toBeDefined();
      expect(JSON.stringify(result)).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
      expect(JSON.stringify(result)).not.toMatch(/github_pat_[a-zA-Z0-9_]+/);

      process.env = envCopy;
    });

    it('defaultExecRunner handles commands and rejections cleanly with shell: false', async () => {
      await expect(
        defaultExecRunner('non_existent_command_11x_xyz', [], { cwd: tmpDir })
      ).rejects.toThrow();

      const echoRes = await defaultExecRunner('node', ['-e', 'console.log("hello 11x")'], {
        cwd: tmpDir,
      });
      expect(echoRes.stdout.trim()).toBe('hello 11x');
    });
  });
});
