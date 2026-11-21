// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  proposeSkillEvolutionPr,
  buildEvolutionSlug,
  buildPrefilledIssueUrl,
  encodeRfc3986URIComponent,
  MAX_PREFILLED_GITHUB_URL_LENGTH,
  defaultExecRunner,
  validateRelativeRepoPath,
  ExecRunnerFunction,
  UPSTREAM_REPO,
} from '../src/tools/propose-evolution-pr.js';

const STATUS_PR_CREATED = 'PR_CREATED_VIA_GH';
const STATUS_ISSUE_CREATED = 'ISSUE_CREATED_VIA_GH';
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
        prefer_offline_fallback: false,
      });

      expect(issueBody).toContain(UPSTREAM_REPO);
      expect(issueBody).toContain(TARGET_FILE);
      expect(issueBody).toContain(RATIONALE);
      expect(prefilledUrl).toContain(`https://github.com/${UPSTREAM_REPO}/issues/new?title=`);
      expect(prefilledUrl).toContain(encodeURIComponent(`[Evolution] ${IMPROVEMENT_TITLE}`));
      expect(prefilledUrl).toContain('&body=');
      expect(prefilledUrl.length).toBeLessThanOrEqual(MAX_PREFILLED_GITHUB_URL_LENGTH);
    });

    it('escapes RFC 3986 parentheses/sub-delims so Markdown links never break and caps post-encoded URL <= 2000 chars', () => {
      expect(encodeRfc3986URIComponent("fix(mcp-auditors): !'*()")).toBe(
        'fix%28mcp-auditors%29%3A%20%21%27%2A%28%29'
      );

      const heavyUnicodeSnippet = 'FastAPI(\n  docs_url="/docs" if _DOCS else None,\n) 🚀🔥áéíóú\n'.repeat(
        120
      );
      const { issueBody, prefilledUrl } = buildPrefilledIssueUrl({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title:
          'fix(mcp-auditors): exclude .tox/.nox virtualenvs in pyramid scanner and support ternary None in SEC-07',
        empirical_rationale:
          '1) .tox contaminaba el conteo de pirámide; 2) SEC-07 fallaba con else None.',
        proposed_content_or_snippet: heavyUnicodeSnippet,
      });

      expect(issueBody).toContain(heavyUnicodeSnippet);
      expect(prefilledUrl.length).toBeLessThanOrEqual(MAX_PREFILLED_GITHUB_URL_LENGTH);
      expect(prefilledUrl).not.toContain('(');
      expect(prefilledUrl).not.toContain(')');
      const parsed = new URL(prefilledUrl);
      expect(parsed.searchParams.get('title')).toContain('fix(mcp-auditors):');
      const decodedBody = parsed.searchParams.get('body') ?? '';
      expect(decodedBody).toContain('Matriz Dual-Consumer');
      expect(decodedBody).toContain('.agents/proposals/');
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
          prefer_offline_fallback: false,
        })
      ).rejects.toThrow('El directorio del proyecto especificado no existe');
    });

    it('Option 2 (Universal Fallback): generates local proposal file and prefilled URL when prefer_offline_fallback is true', async () => {
      const dryResult = await proposeSkillEvolutionPr({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title: IMPROVEMENT_TITLE,
        empirical_rationale: RATIONALE,
        proposed_content_or_snippet: SNIPPET,
        dry_run: true,
        prefer_offline_fallback: true,
      });
      expect(dryResult.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(dryResult.message).toContain('dry_run=true');
      expect(fs.existsSync(dryResult.local_proposal_file)).toBe(false);

      const result = await proposeSkillEvolutionPr({
        project_path: tmpDir,
        target_blueprint_file: TARGET_FILE,
        improvement_title: IMPROVEMENT_TITLE,
        empirical_rationale: RATIONALE,
        proposed_content_or_snippet: SNIPPET,
        dry_run: false,
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
      const mockExecRunner: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return Promise.reject(new Error('You are not logged into any GitHub hosts.'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
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
      const mockExecRunner: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return Promise.resolve({ stdout: 'Logged in to github.com account dev', stderr: '' });
        }
        if (file === 'gh' && args[0] === 'pr' && args[1] === 'create') {
          return Promise.resolve({ stdout: `${prUrl}\n`, stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
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
      const mockExecRunner: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return Promise.resolve({ stdout: 'Logged in', stderr: '' });
        }
        if (file === 'gh' && args[0] === 'pr') {
          return Promise.reject(new Error('fatal: not a git repository'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
          prefer_offline_fallback: false,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(result.gh_cli_authenticated).toBe(true);
      expect(result.pull_request_url).toBeNull();
      expect(result.message).toContain('gh CLI autenticado pero no se pudo crear el PR directamente');
    });

    it('extracts trimmed stdout as fallback when gh pr create does not match url regex', async () => {
      const mockExecRunner: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return Promise.resolve({ stdout: 'Logged in', stderr: '' });
        }
        if (file === 'gh' && args[0] === 'pr') {
          return Promise.resolve({ stdout: 'custom-output-identifier', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      };

      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
          prefer_offline_fallback: false,
        },
        mockExecRunner
      );

      expect(result.status).toBe(STATUS_PR_CREATED);
      expect(result.pull_request_url).toBe('custom-output-identifier');
    });

    it('creates upstream GitHub Issue from external consumer repo when create_upstream_issue is true and falls back cleanly on error or empty stdout', async () => {
      const issueUrl = `https://github.com/${UPSTREAM_REPO}/issues/512`;
      const successExec: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') {
          return Promise.resolve({ stdout: 'Logged in', stderr: '' });
        }
        if (file === 'git' && args[0] === 'remote') {
          return Promise.resolve({
            stdout: 'origin\thttps://github.com/acme/hermes-opencode-bridge.git (fetch)\n',
            stderr: '',
          });
        }
        if (file === 'gh' && args[0] === 'issue' && args[1] === 'create') {
          return Promise.resolve({ stdout: `${issueUrl}\n`, stderr: '' });
        }
        return Promise.reject(new Error(`Unexpected command: ${file} ${args.join(' ')}`));
      };

      const created = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: 'fix(mcp-auditors): consumer repo issue creation',
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
          prefer_offline_fallback: false,
          create_upstream_issue: true,
        },
        successExec
      );
      expect(created.status).toBe(STATUS_ISSUE_CREATED);
      expect(created.pull_request_url).toBe(issueUrl);
      expect(created.message).toContain(issueUrl);

      const emptyIssueExec: ExecRunnerFunction = (file, args) => {
        if (file === 'gh' && args[0] === 'auth') return Promise.resolve({ stdout: 'ok', stderr: '' });
        if (file === 'git' && args[0] === 'remote') {
          return Promise.resolve({ stdout: 'origin\thttps://github.com/acme/app.git\n', stderr: '' });
        }
        if (file === 'gh' && args[0] === 'issue') {
          return Promise.resolve({ stdout: '   \n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      };
      const emptyFallback = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: 'fix(mcp-auditors): empty issue stdout fallback',
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
          prefer_offline_fallback: false,
          create_upstream_issue: true,
        },
        emptyIssueExec
      );
      expect(emptyFallback.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(emptyFallback.pull_request_url).toBeNull();
    });

    it('blocks remote gh CLI calls when dry_run is omitted or true even if prefer_offline_fallback is false', async () => {
      const ghSpy: ExecRunnerFunction = vi.fn(() =>
        Promise.reject(new Error('gh must not execute during dry_run'))
      );
      const result = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          prefer_offline_fallback: false,
        },
        ghSpy
      );

      expect(result.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(result.pull_request_url).toBeNull();
      expect(result.message).toContain('dry_run=true');
      expect(ghSpy).not.toHaveBeenCalled();

      const explicitOffline = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
          prefer_offline_fallback: true,
        },
        ghSpy
      );
      expect(explicitOffline.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(explicitOffline.message).toContain('modo offline seleccionado');

      const defaultedOffline = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
          dry_run: false,
        },
        ghSpy
      );
      expect(defaultedOffline.status).toBe(STATUS_PROPOSAL_GENERATED);
      expect(defaultedOffline.message).toContain('modo offline seleccionado');
      expect(ghSpy).not.toHaveBeenCalled();
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
      expect(JSON.stringify(result)).not.toMatch(/github_pat_\w+/);

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

    it('rejects path traversal, percent-encoding, URI schemes, Markdown/HTML injection, absolute paths, drive letters, NUL bytes, and newlines in target_* fields ([SEC-PATH-01])', async () => {
      const invalidPaths = [
        '../../etc/passwd',
        '../outside.md',
        '%2e%2e/%2e%2e/etc/passwd',
        '..%2f..%2fetc%2fpasswd',
        '%2e%2e%5cetc%5cpasswd',
        'file:///etc/passwd',
        'https://evil.test/payload.md',
        `${'java'}script:alert(1)`,
        'docs/README.md` [phish](https://evil.test) `',
        'docs/<script>alert(1)</script>.md',
        '/etc/passwd',
        '\\\\server\\share\\file.md',
        'C:\\Windows\\win.ini',
        '   ',
        'bad\0path.md',
        'bad\npath.md',
        'bad\rpath.md',
      ];
      for (const badPath of invalidPaths) {
        expect(() => validateRelativeRepoPath(badPath, 'target_blueprint_file')).toThrow('[SEC-PATH-01]');
        expect(() =>
          buildPrefilledIssueUrl({
            project_path: tmpDir,
            target_blueprint_file: badPath,
            improvement_title: IMPROVEMENT_TITLE,
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
          })
        ).toThrow('[SEC-PATH-01]');
        await expect(
          proposeSkillEvolutionPr({
            project_path: tmpDir,
            target_blueprint_file: badPath,
            improvement_title: IMPROVEMENT_TITLE,
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
          })
        ).rejects.toThrow('[SEC-PATH-01]');
      }

      const crossFieldBypassPayloads = [
        '%2e%2e/%2e%2e/etc/passwd',
        '..%2f..%2fetc%2fpasswd',
        '%2e%2e%5cetc%5cpasswd',
        'file:///etc/passwd',
        'docs/README.md` [phish](https://evil.test) `',
      ];
      for (const badTarget of crossFieldBypassPayloads) {
        await expect(
          proposeSkillEvolutionPr({
            project_path: tmpDir,
            target_blueprint_file: TARGET_FILE,
            target_human_doc_file: badTarget,
            improvement_title: IMPROVEMENT_TITLE,
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
          })
        ).rejects.toThrow('[SEC-PATH-01]');

        await expect(
          proposeSkillEvolutionPr({
            project_path: tmpDir,
            target_blueprint_file: TARGET_FILE,
            target_mcp_component: badTarget,
            improvement_title: IMPROVEMENT_TITLE,
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
          })
        ).rejects.toThrow('[SEC-PATH-01]');
      }

      const validRepoPaths = [
        'AGENTS.md',
        '.agents/skills/qa-11x-architect/SKILL.md',
        'docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md',
        'mcp-server/src/server.ts',
        'node-backend/vitest.config.ts.example',
      ];
      for (const okPath of validRepoPaths) {
        expect(validateRelativeRepoPath(okPath, 'target_blueprint_file')).toBe(okPath);
      }

      await expect(
        proposeSkillEvolutionPr({
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          target_human_doc_file: '../../secret.md',
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
        })
      ).rejects.toThrow('[SEC-PATH-01]');

      await expect(
        proposeSkillEvolutionPr({
          project_path: tmpDir,
          target_blueprint_file: TARGET_FILE,
          target_mcp_component: '/usr/local/bin/evil.ts',
          improvement_title: IMPROVEMENT_TITLE,
          empirical_rationale: RATIONALE,
          proposed_content_or_snippet: SNIPPET,
        })
      ).rejects.toThrow('[SEC-PATH-01]');
    });

    it('rechaza escapes por symlink en .agents, .agents/proposals y archivo destino (.md)', async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-prop-outside-'));
      try {
        const wsProposalsSym = path.join(tmpDir, 'ws-proposals-sym');
        fs.mkdirSync(path.join(wsProposalsSym, '.agents'), { recursive: true });
        fs.symlinkSync(outside, path.join(wsProposalsSym, '.agents', 'proposals'));

        await expect(
          proposeSkillEvolutionPr({
            project_path: wsProposalsSym,
            target_blueprint_file: TARGET_FILE,
            improvement_title: 'Probe Symlink Proposals',
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
            dry_run: false,
          })
        ).rejects.toThrow(/Symlink/);
        expect(fs.readdirSync(outside)).toEqual([]);

        const wsAgentsSym = path.join(tmpDir, 'ws-agents-sym');
        fs.mkdirSync(wsAgentsSym, { recursive: true });
        fs.symlinkSync(outside, path.join(wsAgentsSym, '.agents'));

        await expect(
          proposeSkillEvolutionPr({
            project_path: wsAgentsSym,
            target_blueprint_file: TARGET_FILE,
            improvement_title: 'Probe Symlink Agents',
            empirical_rationale: RATIONALE,
            proposed_content_or_snippet: SNIPPET,
            dry_run: false,
          })
        ).rejects.toThrow(/Symlink/);
        expect(fs.readdirSync(outside)).toEqual([]);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
