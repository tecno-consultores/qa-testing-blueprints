// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLI_HELP_TEXT, dispatchCliArgs, main } from '../src/index.js';
import { MCP_SERVER_VERSION, GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { reconcileAgentsGovernance, splitMarkdownSections } from '../src/cli/reconcile-agents.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { isDocsOnlyWorkspaceChange } from '../src/tools/ephemeral-runner.js';
import { buildPrefilledIssueUrl, proposeSkillEvolutionPr } from '../src/tools/propose-evolution-pr.js';
import { parseQaOutput, parseLinterAndComplexity } from '../src/parsers/output-parsers.js';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
import { bootstrapOrMerge11x } from '../src/tools/bootstrap-merge.js';
import { inspectAstBlastRadius } from '../src/tools/blast-radius.js';
import { Manifest } from '../src/types.js';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('v2.16.0 Invariants, SEC-16, Gate Parity & CLI Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-v216-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('CLI index.ts (dispatchCliArgs & main)', () => {
    it('supports --version, --help, subcommands, stdio mode, and rejects unknown flags', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await dispatchCliArgs([])).toBe('stdio');
      expect(await dispatchCliArgs(['--version'])).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(MCP_SERVER_VERSION);
      expect(MCP_SERVER_VERSION).toBe('2.18.0');

      expect(await dispatchCliArgs(['-h'])).toBe(0);
      expect(CLI_HELP_TEXT).toContain('--version');

      expect(await dispatchCliArgs(['init-agents', '--project-path', tmpDir, '--dry-run'])).toBe(0);
      expect(await dispatchCliArgs(['reconcile-agents', '--project-path', tmpDir, '--dry-run'])).toBe(0);

      expect(await dispatchCliArgs(['unknown-subcommand'])).toBe(1);
      expect(errSpy).toHaveBeenCalled();

      const exitCodes: number[] = [];
      await main(['-v'], undefined, (c) => exitCodes.push(c));
      expect(exitCodes).toEqual([0]);

      let stdioStarted = false;
      await main([], async () => {
        stdioStarted = true;
      });
      expect(stdioStarted).toBe(true);
    });
  });

  describe('SEC-16 (Multi-Step Pre-Auth Continuity & Self-Scan Immunity)', () => {
    it('detects frontend 401 interceptor asymmetry and passes symmetric PREAUTH_PUBLIC_ROUTES', async () => {
      const srcDir = path.join(tmpDir, 'src', 'api');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"ui"}', 'utf8');

      const asymmetricClient = [
        'axios.interceptors.response.use((r) => r, async (err) => {',
        '  if (err.response?.status === 401 && !url.includes("/auth/login") && !url.includes("/auth/refresh")) {',
        '    return axios.post("/api/v1/auth/refresh");',
        '  }',
        '});',
      ].join('\n');
      fs.writeFileSync(path.join(srcDir, 'httpClient.ts'), asymmetricClient, 'utf8');

      const badAudit = await auditSecurityStigOwasp(tmpDir);
      expect(badAudit.findings.some((f) => f.rule_id === 'SEC-16')).toBe(true);

      const symmetricClient = [
        'const PREAUTH_PUBLIC_ROUTES = ["/auth/login", "/auth/refresh", "/auth/bootstrap", "/auth/2fa/confirm-enrollment", "/auth/2fa/verify"];',
        'axios.interceptors.response.use((r) => r, async (err) => {',
        '  if (err.response?.status === 401 && !PREAUTH_PUBLIC_ROUTES.some((p) => url.includes(p))) {',
        '    return axios.post("/api/v1/auth/refresh");',
        '  }',
        '});',
      ].join('\n');
      fs.writeFileSync(path.join(srcDir, 'httpClient.ts'), symmetricClient, 'utf8');

      const goodAudit = await auditSecurityStigOwasp(tmpDir);
      expect(goodAudit.findings.some((f) => f.rule_id === 'SEC-16')).toBe(false);
    });

    it('detects non-atomic Redis .get() on pre-auth challenge_id and passes atomic GETDEL', async () => {
      const authDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(authDir, { recursive: true });

      fs.writeFileSync(
        path.join(authDir, 'auth_2fa_service.py'),
        [
          'async def confirm_enrollment(challenge_id: str, totp_code: str):',
          '    payload = await redis_client.get(f"preauth:{challenge_id}")',
          '    return payload',
        ].join('\n'),
        'utf8'
      );

      const badAudit = await auditSecurityStigOwasp(tmpDir);
      expect(badAudit.findings.some((f) => f.rule_id === 'SEC-16')).toBe(true);

      fs.writeFileSync(
        path.join(authDir, 'auth_2fa_service.py'),
        [
          'async def confirm_enrollment(challenge_id: str, totp_code: str):',
          '    payload = await redis_client.getdel(f"preauth:{challenge_id}")',
          '    return payload',
        ].join('\n'),
        'utf8'
      );

      const goodAudit = await auditSecurityStigOwasp(tmpDir);
      expect(goodAudit.findings.some((f) => f.rule_id === 'SEC-16')).toBe(false);
    });

    it('produces zero self-inflicted findings on mcp-server itself while scanning .html files', async () => {
      const mcpRoot = path.resolve(__dirname, '..');
      const selfAudit = await auditSecurityStigOwasp(mcpRoot);
      expect(selfAudit.passed).toBe(true);
      expect(selfAudit.findings.length).toBe(0);

      fs.writeFileSync(path.join(tmpDir, 'unsafe.html'), '<div onclick="innerHTML = userInput"></div>', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<script>el.innerHTML = rawPayload;</script>', 'utf8');
      const htmlAudit = await auditSecurityStigOwasp(tmpDir);
      expect(htmlAudit.findings.some((f) => f.rule_id === 'SEC-06')).toBe(true);
    });
  });

  describe('certify-gate 10/10 parity (JSON scanner, API parity, Manifest SHA-256, Roadmap)', () => {
    it('handles multi-object single-line JSON, braces inside strings, and .json.example collisions', async () => {
      fs.writeFileSync(path.join(tmpDir, 'TESTING.md'), '# Testing\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Ok\n', 'utf8');
      fs.writeFileSync(
        path.join(tmpDir, 'valid.json'),
        '{"items": [{"id": 1, "note": "{not_a_scope}"}, {"id": 2, "note": "ok"}]}',
        'utf8'
      );

      const cleanRes = await certify11xGate(tmpDir);
      expect(cleanRes.checks.json_integrity).toBe(true);

      fs.writeFileSync(
        path.join(tmpDir, 'manifest.json'),
        JSON.stringify({ repository: 'qa-testing-blueprints', common_files: [] }),
        'utf8'
      );
      fs.writeFileSync(path.join(tmpDir, 'i18n.json.example'), '{"save": "Guardar", "save": "Salvar"}', 'utf8');
      const dupRes = await certify11xGate(tmpDir);
      expect(dupRes.checks.json_integrity).toBe(false);
    });

    it('validates bidirectional API parity, manifest SHA-256 drift, and ROADMAP 100% consistency', async () => {
      fs.writeFileSync(path.join(tmpDir, 'TESTING.md'), '# Testing\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Ok\n', 'utf8');

      // 1. Bidirectional API parity: backend route without frontend consumer
      const apiDir = path.join(tmpDir, 'fastapi', 'src', 'api', 'v1');
      const uiDir = path.join(tmpDir, 'vue3', 'src', 'views');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(uiDir, { recursive: true });
      fs.writeFileSync(
        path.join(apiDir, 'devices.py'),
        [
          'router = APIRouter(prefix="/api/v1/devices")',
          '@router.get("/")',
          'async def list_devices(): pass',
          '@router.delete("/{device_id}")',
          'async def delete_device(device_id: str): pass',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(uiDir, 'DevicesView.vue'),
        '<script setup>http.get("/api/v1/devices")</script>',
        'utf8'
      );
      fs.writeFileSync(path.join(uiDir, 'DevicesView.unit.ts'), '// DevicesView test', 'utf8');

      const orphanApiRes = await certify11xGate(tmpDir);
      expect(orphanApiRes.checks.zero_orphan_api_endpoints).toBe(false);

      // Add frontend delete call -> passes API parity
      fs.writeFileSync(
        path.join(uiDir, 'DevicesView.vue'),
        '<script setup>http.get("/api/v1/devices"); http.delete(`/api/v1/devices/${id}`);</script>',
        'utf8'
      );

      // 2. Manifest cryptographic drift + Roadmap inconsistency
      fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'scripts', 'generar-manifiesto.py'), '# gen\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'tracked.txt'), 'real-content', 'utf8');
      fs.writeFileSync(
        path.join(tmpDir, 'manifest.json'),
        JSON.stringify({
          repository: 'qa-testing-blueprints',
          common_files: [
            { path: 'tracked.txt', sha256: 'deadbeef' },
            { path: 'missing.txt', sha256: 'deadbeef' },
          ],
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'ROADMAP.md'),
        [
          '| **Hito 1** | Base | Spec | ✅ Completado | `100%` |',
          '## ✅ Hito 1: Base',
          '- [x] Tarea A',
          '- [ ] Tarea olvidada',
        ].join('\n'),
        'utf8'
      );

      const driftRes = await certify11xGate(tmpDir);
      expect(driftRes.checks.documentation_synced).toBe(false);
      expect(driftRes.blockers.some((b) => b.includes('Desfase SHA-256'))).toBe(true);
      expect(driftRes.blockers.some((b) => b.includes('missing.txt'))).toBe(true);
      expect(driftRes.blockers.some((b) => b.includes('ROADMAP.md declara hito 1 al 100%'))).toBe(true);

      // Fix manifest & roadmap -> documentation_synced becomes true
      fs.writeFileSync(
        path.join(tmpDir, 'manifest.json'),
        JSON.stringify({
          repository: 'qa-testing-blueprints',
          common_files: [{ path: 'tracked.txt', sha256: sha256('real-content') }],
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'ROADMAP.md'),
        ['| **Hito 1** | Base | Spec | ✅ Completado | `100%` |', '## ✅ Hito 1: Base', '- [x] Tarea A'].join('\n'),
        'utf8'
      );

      const fixedRes = await certify11xGate(tmpDir);
      expect(fixedRes.checks.zero_orphan_api_endpoints).toBe(true);
      expect(fixedRes.checks.documentation_synced).toBe(true);
    });
  });

  describe('Thin-Repo, Lefthook YAML Merge, Reconcile Fenced Code & Runner Helpers', () => {
    it('merges lefthook.yml non-destructively and enforces Thin-Repo bundle filtering', async () => {
      const merger = new SurgicalMerger();
      const targetYaml = 'pre-commit:\n  commands:\n    custom:\n      run: echo ok\n';
      const tplYaml = 'pre-commit:\n  commands:\n    lint:\n      run: echo lint\n\ncommit-msg:\n  commands:\n    check:\n      run: echo msg\n';
      const mergedLefthook = merger.mergeLefthookYaml(targetYaml, tplYaml);
      expect(mergedLefthook.merged).toContain('custom:');
      expect(mergedLefthook.merged).toContain('commit-msg:');
      expect(mergedLefthook.changes.length).toBe(1);

      // Test via mergeFiles on existing lefthook.yml
      const projDir = path.join(tmpDir, 'proj');
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'lefthook.yml'), targetYaml, 'utf8');
      const mfRes = await merger.mergeFiles(projDir, [
        {
          target_name: 'lefthook.yml',
          merge_strategy: 'create_if_missing',
          content: tplYaml,
          sha256: sha256(tplYaml),
        },
      ]);
      expect(mfRes.summary.merged).toBe(1);

      // Thin-Repo fetchStackBundle filtering + install-skill --target all & invalid target
      const repoDir = path.join(tmpDir, 'fake-repo');
      fs.mkdirSync(path.join(repoDir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(repoDir, '.agents', 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(repoDir, '.agents', 'rules'), { recursive: true });
      fs.mkdirSync(path.join(repoDir, '.agents', 'skills', 'qa-11x-architect'), { recursive: true });

      const cleanSh = '#!/usr/bin/env bash\necho clean\n';
      const pubSh = '#!/usr/bin/env bash\necho publish\n';
      const gatePy = '#!/usr/bin/env python3\nprint("ok")\n';
      const ruleMd = '# Corporate Rule\n';
      const skillMd = '# Skill\n';
      fs.writeFileSync(path.join(repoDir, 'scripts', 'limpieza.sh'), cleanSh, 'utf8');
      fs.writeFileSync(path.join(repoDir, 'scripts', 'publicar-mcp.sh'), pubSh, 'utf8');
      fs.writeFileSync(path.join(repoDir, '.agents', 'scripts', 'gate.py'), gatePy, 'utf8');
      fs.writeFileSync(path.join(repoDir, '.agents', 'rules', 'rule.md'), ruleMd, 'utf8');
      fs.writeFileSync(path.join(repoDir, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'), skillMd, 'utf8');

      const manifest: Manifest = {
        schema_version: '2.16.0',
        blueprint_version: '2.16.0',
        generated_at_utc: '2026-11-10T00:00:00Z',
        repository: 'sinfallas/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://example.com',
        stacks: {
          python: { description: 'py', readme: 'python/README.md', files: [] },
        },
        common_files: [
          { path: 'scripts/limpieza.sh', target_name: 'scripts/limpieza.sh', merge_strategy: 'create_if_missing', sha256: sha256(cleanSh), size_bytes: cleanSh.length },
          { path: 'scripts/publicar-mcp.sh', target_name: 'scripts/publicar-mcp.sh', merge_strategy: 'create_if_missing', sha256: sha256(pubSh), size_bytes: pubSh.length },
        ],
        agent_governance_files: [
          { path: '.agents/scripts/gate.py', target_name: '.agents/scripts/gate.py', merge_strategy: 'create_if_missing', sha256: sha256(gatePy), size_bytes: gatePy.length },
          { path: '.agents/rules/rule.md', target_name: '.agents/rules/rule.md', merge_strategy: 'create_if_missing', sha256: sha256(ruleMd), size_bytes: ruleMd.length },
          { path: '.agents/skills/qa-11x-architect/SKILL.md', target_name: '.agents/skills/qa-11x-architect/SKILL.md', merge_strategy: 'create_if_missing', sha256: sha256(skillMd), size_bytes: skillMd.length },
        ],
      };
      fs.writeFileSync(path.join(repoDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

      const fetcher = new GitHubFetcher({ cacheDir: path.join(tmpDir, 'cache'), localOverridePath: repoDir });
      const thinBundle = await fetcher.fetchStackBundle('python', true, true);
      expect(thinBundle.some((b) => b.target_name === 'scripts/publicar-mcp.sh')).toBe(false);
      expect(thinBundle.some((b) => b.target_name === '.agents/rules/rule.md')).toBe(false);
      expect(thinBundle.some((b) => b.target_name === '.agents/scripts/gate.py')).toBe(true);

      const emptyHome = path.join(tmpDir, 'empty-home');
      fs.mkdirSync(emptyHome, { recursive: true });
      const origHome = process.env.HOME;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        process.env.HOME = emptyHome;
        await runInstallSkillCli(['--target', 'all'], fetcher);
        expect(fs.existsSync(path.join(emptyHome, '.gemini/config/skills/qa-11x-architect/SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(emptyHome, '.cursor/skills/qa-11x-architect/SKILL.md'))).toBe(true);
        expect(await dispatchCliArgs(['install-skill', '--target', 'hermes'], fetcher)).toBe(0);

        await expect(runInstallSkillCli(['--target', 'invalid-ide'], fetcher)).rejects.toThrow(/--target inválido/);
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('preserves fenced Bash comments in reconcile-agents and covers runner/parser/cleanup/proposal edge cases', async () => {
      const mdWithBash = [
        '# SPDX-License-Identifier: MIT',
        '# Copyright (C) 2026 Demo',
        '',
        '# Domain Rule Title',
        '```bash',
        '# Comment inside bash block must NOT split section',
        'docker run --rm alpine echo ok',
        '```',
      ].join('\n');
      const sections = splitMarkdownSections(mdWithBash);
      expect(sections.length).toBe(1);
      expect(sections[0]).toContain('# Domain Rule Title');
      expect(sections[0]).toContain('# SPDX-License-Identifier: MIT');
      expect(sections[0]).toContain('docker run --rm alpine echo ok');

      const rulesDir = path.join(tmpDir, 'consumer', '.agents', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(path.join(rulesDir, 'custom_ops.md'), mdWithBash, 'utf8');
      const recRes = await reconcileAgentsGovernance({ projectPath: path.join(tmpDir, 'consumer') });
      expect(recRes.preserved_domain_sections_count).toBeGreaterThanOrEqual(1);
      expect(recRes.domain_rules_file).toContain('domain_consumer_rules.md');

      // Ephemeral runner porcelain edge cases
      expect(isDocsOnlyWorkspaceChange(tmpDir, () => ' M README.md\n?? "docs/gu\\303\\255a.md"\n')).toBe(true);
      expect(isDocsOnlyWorkspaceChange(tmpDir, () => 'R  docs/old.md -> src/exploit.ts\n')).toBe(false);
      expect(isDocsOnlyWorkspaceChange(tmpDir, () => 'R  docs/old.md -> docs/new.md\n')).toBe(true);

      // Proposal safe fence, URL cap, and consumer git remote
      const longSnippet = '```markdown\nnested\n```\n' + 'x'.repeat(4000);
      const { issueBody, prefilledUrl } = buildPrefilledIssueUrl({
        project_path: tmpDir,
        target_blueprint_file: 'AGENTS.md',
        improvement_title: 'Nested Fence & Long Body',
        empirical_rationale: 'Test',
        proposed_content_or_snippet: longSnippet,
      });
      expect(issueBody).toContain('````markdown');
      expect(prefilledUrl.length).toBeLessThan(8000);

      const propRes = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: 'AGENTS.md',
          improvement_title: 'Consumer Repo Remote',
          empirical_rationale: 'Test',
          proposed_content_or_snippet: 'ok',
        },
        async (file, args) => {
          if (file === 'gh' && args[0] === 'auth') return { stdout: 'Logged in', stderr: '' };
          if (file === 'git' && args[0] === 'remote') {
            return { stdout: 'origin\thttps://github.com/acme/consumer-app.git (fetch)\n', stderr: '' };
          }
          throw new Error('Should not invoke gh pr create on unrelated remote');
        }
      );
      expect(propRes.gh_cli_authenticated).toBe(true);
      expect(propRes.pull_request_url).toBeNull();

      // ESLint stylish multi-line parser & unit Zero Hardcoded Pass
      const stylishLog = '/app/src/demo.ts\n  14:7  error  Unexpected any  @typescript-eslint/no-explicit-any\n';
      const lintIssues = parseLinterAndComplexity(stylishLog);
      expect(lintIssues.length).toBe(1);
      expect(lintIssues[0].file).toBe('/app/src/demo.ts');

      const noCovRes = parseQaOutput('Tests passed with no coverage table', '', 'unit', 10, 0);
      expect(noCovRes.status).toBe('FAILED');
      expect(noCovRes.coverage.detected).toBe(false);

      // cleanWorkspace11x preserves zap.yaml and mcp-server/dist
      const fakeMcpDir = path.join(tmpDir, 'mcp-server');
      fs.mkdirSync(path.join(fakeMcpDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(fakeMcpDir, 'package.json'), '{"name":"@sinfallas/mcp-qa-11x"}', 'utf8');
      fs.writeFileSync(path.join(fakeMcpDir, 'zap.yaml'), 'env: {}', 'utf8');
      await cleanWorkspace11x(fakeMcpDir);
      expect(fs.existsSync(path.join(fakeMcpDir, 'dist'))).toBe(true);
      expect(fs.existsSync(path.join(fakeMcpDir, 'zap.yaml'))).toBe(true);

      // blast-radius excludes declaring file from dependent_files when callers == 0
      const gDir = path.join(tmpDir, 'graph-proj', 'graphify-out');
      fs.mkdirSync(gDir, { recursive: true });
      fs.writeFileSync(
        path.join(gDir, 'graph.json'),
        JSON.stringify({
          nodes: [{ id: 'src/solo.ts::soloFn', label: 'soloFn', source_file: 'src/solo.ts' }],
          links: [],
        }),
        'utf8'
      );
      const br = await inspectAstBlastRadius(path.join(tmpDir, 'graph-proj'), 'soloFn');
      expect(br.declaring_files).toContain('src/solo.ts');
      expect(br.dependent_files).not.toContain('src/solo.ts');
    });

    it('covers remaining branch paths in certify-gate, SEC-16 variants, CLI aliases, and consumer dist cleanup', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await dispatchCliArgs(['--help'])).toBe(0);
      expect(await dispatchCliArgs(['init-agents-md', '--project-path', tmpDir, '--dry-run'])).toBe(0);

      // Consumer dist removal vs MCP preservation
      const consumerDir = path.join(tmpDir, 'consumer-dist');
      fs.mkdirSync(path.join(consumerDir, 'dist'), { recursive: true });
      fs.mkdirSync(path.join(consumerDir, 'reports'), { recursive: true });
      fs.mkdirSync(path.join(consumerDir, 'mcp-server', 'dist'), { recursive: true });
      fs.writeFileSync(path.join(consumerDir, 'package.json'), '{"name":"my-webapp"}', 'utf8');
      await cleanWorkspace11x(consumerDir, false, true);
      expect(fs.existsSync(path.join(consumerDir, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(consumerDir, 'reports'))).toBe(false);
      expect(fs.existsSync(path.join(consumerDir, 'mcp-server', 'dist'))).toBe(true);

      // SEC-16 variants: onResponseError + /2fa/, evalsha, idemp:preauth, 2fa/verify
      const vDir = path.join(tmpDir, 'sec16-variants');
      fs.mkdirSync(path.join(vDir, 'src', 'api'), { recursive: true });
      fs.writeFileSync(path.join(vDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(path.join(vDir, 'package.json'), '{"name":"v"}', 'utf8');
      fs.writeFileSync(
        path.join(vDir, 'src', 'api', 'ofetchClient.tsx'),
        'onResponseError({ response }) { if (response.status === 401 && !u.includes("/auth/login") && !u.includes("/auth/refresh") && !u.includes("/2fa/")) {} }',
        'utf8'
      );
      fs.writeFileSync(
        path.join(vDir, 'src', 'api', 'mfa_verify.ts'),
        'export async function verify_2fa(challenge_id: string) { await redis.get(challenge_id); await redis.evalsha("sha", 1, "idemp:preauth:1"); }',
        'utf8'
      );
      const vAudit = await auditSecurityStigOwasp(vDir);
      expect(vAudit.findings.some((f) => f.rule_id === 'SEC-16')).toBe(false);

      // certify-gate branches: escaped JSON quotes, Express routes + api-parity-ignore + whitelisted route + orphan frontend call + React .tsx/.spec.tsx + nodeFileMap AST violation + corrupt manifest
      const gateDir = path.join(tmpDir, 'gate-branches');
      fs.mkdirSync(path.join(gateDir, 'node-backend', 'src'), { recursive: true });
      fs.mkdirSync(path.join(gateDir, 'react-frontend', 'src', 'components'), { recursive: true });
      fs.mkdirSync(path.join(gateDir, 'react-frontend', 'tests'), { recursive: true });
      fs.mkdirSync(path.join(gateDir, 'graphify-out'), { recursive: true });
      fs.mkdirSync(path.join(gateDir, 'scripts'), { recursive: true });

      fs.writeFileSync(path.join(gateDir, 'TESTING.md'), '# Testing\n', 'utf8');
      fs.writeFileSync(path.join(gateDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Item\n', 'utf8');
      fs.writeFileSync(path.join(gateDir, 'escaped.json'), '{"quote": "hello \\"world\\""}', 'utf8');
      fs.writeFileSync(
        path.join(gateDir, 'node-backend', 'src', 'routes.ts'),
        [
          '// api-parity-ignore',
          'router.get("/api/v1/health", h);',
          'router.get("/api/v1/items/:id", getItem);',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(gateDir, 'react-frontend', 'src', 'components', 'Widget.tsx'),
        'export function Widget() { axios.get(`/api/v1/items/${id}`); axios.post("api/v1/missing"); return <div/>; }',
        'utf8'
      );
      fs.writeFileSync(
        path.join(gateDir, 'react-frontend', 'src', 'components', 'Widget.spec.tsx'),
        '// inline spec ignored as component',
        'utf8'
      );
      fs.writeFileSync(
        path.join(gateDir, 'react-frontend', 'tests', 'Widget.unit.tsx'),
        'import { Widget } from "../src/components/Widget";',
        'utf8'
      );
      fs.writeFileSync(
        path.join(gateDir, 'graphify-out', 'graph.json'),
        JSON.stringify({
          nodes: [
            { id: 'n_ui', source_file: 'src/views/Dashboard.vue' },
            { id: 'n_db', source_file: 'src/models/device.py' },
          ],
          links: [{ source: 'n_ui', target: 'n_db' }],
        }),
        'utf8'
      );
      fs.writeFileSync(path.join(gateDir, 'scripts', 'generar-manifiesto.py'), '# gen\n', 'utf8');
      fs.writeFileSync(path.join(gateDir, 'manifest.json'), '{not-valid-json', 'utf8');

      const gRes = await certify11xGate(gateDir);
      expect(gRes.checks.zero_orphan_ui_components).toBe(true);
      expect(gRes.checks.zero_orphan_api_endpoints).toBe(false);
      expect(gRes.checks.ast_topology_clean).toBe(false);
      expect(gRes.checks.documentation_synced).toBe(false);

      // Cover Domain->API, CommonUI->View, corrupt graph, ActiveTask COMPLETED with pending checkbox, bootstrap pre-existing AGENTS.md, and blast-radius callers/callees
      const extraDir = path.join(tmpDir, 'extra-branches');
      fs.mkdirSync(path.join(extraDir, 'fastapi', 'graphify-out'), { recursive: true });
      fs.mkdirSync(path.join(extraDir, 'vue3', 'graphify-out'), { recursive: true });
      fs.mkdirSync(path.join(extraDir, '.agents'), { recursive: true });
      fs.writeFileSync(path.join(extraDir, 'TESTING.md'), '# T\n', 'utf8');
      fs.writeFileSync(
        path.join(extraDir, 'CHANGELOG.md'),
        '# C\n\n## [Unreleased]\n- A\n## [1.0.0]\n- B\n## [1.0.0]\n- Dup\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(extraDir, '.agents', 'ACTIVE_TASK.md'),
        '# Task\nStatus: COMPLETED (100%)\n- [ ] Unfinished\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(extraDir, 'fastapi', 'graphify-out', 'graph.json'),
        JSON.stringify({
          nodes: [
            { id: 'm1', source_file: 'src/models/user.py', source_location: '10' },
            { id: 'a1', source_file: 'src/api/routes.py', source_location: '20' },
            { id: 'c1', source_file: 'src/components/common/Btn.vue' },
            { id: 'v1', source_file: 'src/views/Main.vue' },
          ],
          links: [
            { source: 'm1', target: 'a1' },
            { source: 'c1', target: 'v1' },
          ],
        }),
        'utf8'
      );
      fs.writeFileSync(path.join(extraDir, 'vue3', 'graphify-out', 'graph.json'), '{corrupt', 'utf8');
      fs.writeFileSync(path.join(extraDir, 'truncated.json'), '{"arr": [1, 2], "unclosed', 'utf8');

      const exGate = await certify11xGate(extraDir);
      expect(exGate.checks.ast_topology_clean).toBe(false);
      expect(exGate.checks.documentation_synced).toBe(false);

      const brLinks = await inspectAstBlastRadius(path.join(extraDir, 'fastapi'), 'user.py', 20, {
        refreshGraph: true,
        graphBuilder: () => true,
      });
      expect(brLinks.declaring_files[0]).toContain(':10');

      // bootstrapOrMerge11x merging into pre-existing custom AGENTS.md + bundle containing AGENTS.md
      const mergeProj = path.join(tmpDir, 'merge-existing-agents');
      fs.mkdirSync(mergeProj, { recursive: true });
      fs.writeFileSync(path.join(mergeProj, 'AGENTS.md'), '# Custom Domain Rules\nKeep me.\n', 'utf8');
      const fakeFetcher = {
        fetchStackBundle: async () => [],
      } as unknown as GitHubFetcher;
      const bmMerged = await bootstrapOrMerge11x(mergeProj, 'python', false, fakeFetcher);
      expect(bmMerged.summary.merged).toBe(1);

      const fakeFetcherWithAgents = {
        fetchStackBundle: async () => [
          {
            target_name: 'AGENTS.md',
            merge_strategy: 'merge_agents_md' as const,
            content: '# Template\n',
            sha256: sha256('# Template\n'),
          },
        ],
      } as unknown as GitHubFetcher;
      const bmWithBundleAgents = await bootstrapOrMerge11x(mergeProj, 'python', true, fakeFetcherWithAgents);
      expect(bmWithBundleAgents.dry_run).toBe(true);

      // Cover orphan UI view, missing alembic with models, git remote error in proposeSkillEvolutionPr, and PHP preauth .get()
      fs.mkdirSync(path.join(extraDir, 'src', 'views'), { recursive: true });
      fs.mkdirSync(path.join(extraDir, 'src', 'models'), { recursive: true });
      fs.writeFileSync(path.join(extraDir, 'src', 'views', 'OrphanView.vue'), '<template><div/></template>', 'utf8');
      fs.writeFileSync(path.join(extraDir, 'src', 'models', 'item.py'), '# item model', 'utf8');
      const exGate2 = await certify11xGate(extraDir);
      expect(exGate2.checks.zero_orphan_ui_components).toBe(false);
      expect(exGate2.checks.orm_alembic_parity).toBe(false);

      fs.writeFileSync(
        path.join(vDir, 'src', 'api', 'bootstrap_auth.php'),
        '<?php function preauth($challenge_id, $keydb) { return $keydb->get($challenge_id); }',
        'utf8'
      );
      await auditSecurityStigOwasp(vDir);

      const gitErrProp = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: 'AGENTS.md',
          improvement_title: 'Git Remote Error Branch',
          empirical_rationale: 'Test',
          proposed_content_or_snippet: 'ok',
        },
        async (file, args) => {
          if (file === 'gh' && args[0] === 'auth') return { stdout: 'Logged in', stderr: '' };
          throw new Error('git not initialized');
        }
      );
      expect(gitErrProp.gh_cli_authenticated).toBe(true);
      expect(gitErrProp.pull_request_url).toBeNull();
    });
  });
});
