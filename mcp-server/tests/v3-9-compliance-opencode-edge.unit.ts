// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctorCli } from '../src/cli/doctor.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { runMcpConfigCli } from '../src/cli/mcp-config.js';
import { createMcpServer, QA_11X_MCP_INSTRUCTIONS } from '../src/server.js';
import { CORE_TOOLSET_NAMES } from '../src/server/toolsetFilter.js';
import { GLOBAL_CONNECTOR_TARGETS, syncGlobalAgentConnectors } from '../src/services/agents-connector.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { detectExistingQa11xSkillDirs } from '../src/services/version-manager.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';
import {
  EVOLUTION_SUPPORT_EMAIL,
  MAX_PREFILLED_MAILTO_URL_LENGTH,
  proposeSkillEvolutionPr,
  sanitizeProposalTextForEmail,
} from '../src/tools/propose-evolution-pr.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import {
  evaluateStandard11xReadiness,
  findAstGraphFilesRecursive,
  hasAnalyzableSourceCode,
} from '../src/tools/standardReadiness.js';
import { auditTestPyramidGaps } from '../src/tools/test-pyramid-auditor.js';
import { detectCompanionMcps } from '../src/utils/companionMcpDetector.js';
import {
  getBrowserMcpCandidatePaths,
  getDoctorIdeMcpTargets,
  OPENCODE_CANONICAL_MCP_REL_PATH,
} from '../src/utils/ideConfigPaths.js';

describe('QA-11X v3.9.0 — Compliance Audit, AST Auto-Build, OpenCode, Email Template & Edge UI-11X-03', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-v39-suite-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('evaluates full standard_11x_readiness across tiers and exposes missing Graphify AST + governance', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.5.0' } }), 'utf-8');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), 'export const x = 1;\n', 'utf-8');

    const audit = await inspectProjectConfig(tmpDir, tmpDir, { allowNetworkCheck: false });
    const readiness = audit.standard_11x_readiness;
    expect(readiness).toBeDefined();
    expect(readiness?.declared_tier).toBeNull();
    expect(readiness?.effective_tier).toBe('enterprise');
    expect(readiness?.ast_graph_present).toBe(false);
    expect(readiness?.missing_mandatory_pillars).toContain('graphify_ast');
    expect(readiness?.missing_mandatory_pillars).toContain('thin_repo_governance');
    expect(readiness?.missing_mandatory_pillars).toContain('calm_architecture');
    expect(readiness?.recommended_audit_sequence).toContain('inspect_ast_blast_radius(auto_build_if_missing: true)');
    expect(readiness?.recommended_audit_sequence).toContain('audit_test_pyramid_gaps');
    expect(readiness?.recommended_audit_sequence).toContain('certify_11x_gate');

    // Declare starter tier + add recursive graphify-out/graph.json + connector + gitignore
    fs.writeFileSync(path.join(tmpDir, '.qa-11x.json'), JSON.stringify({ tier: 'starter' }), 'utf-8');
    fs.mkdirSync(path.join(tmpDir, 'sub', 'graphify-out'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sub', 'graphify-out', 'graph.json'), '{"nodes":[],"links":[]}', 'utf-8');
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '<!-- QA_11X_MCP_CONNECTOR_START -->\nconnector\n<!-- QA_11X_MCP_CONNECTOR_END -->\n',
      'utf-8'
    );
    fs.mkdirSync(path.join(tmpDir, '.agents', 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.agents', 'rules', 'mandatory_qa_pyramid_and_doc_sync.md'),
      '# duplicate\n',
      'utf-8'
    );
    const starterReadiness = evaluateStandard11xReadiness(tmpDir, ['vue3'], ['src/app.ts']);
    expect(starterReadiness.declared_tier).toBe('starter');
    expect(starterReadiness.effective_tier).toBe('starter');
    expect(starterReadiness.ast_graph_present).toBe(true);
    expect(starterReadiness.ast_graph_files).toEqual(['sub/graphify-out/graph.json']);
    expect(starterReadiness.has_local_governance_duplication).toBe(true);
    const calmPillar = starterReadiness.pillars.find((p) => p.id === 'calm_architecture');
    expect(calmPillar?.required_for_tier).toBe(false);
    expect(findAstGraphFilesRecursive(tmpDir)).toEqual(['sub/graphify-out/graph.json']);
    expect(hasAnalyzableSourceCode(tmpDir)).toBe(true);
  });

  it('includes meta_gates_audit (Graphify AST) and specialized stacks in auditTestPyramidGaps + core toolset', async () => {
    expect(CORE_TOOLSET_NAMES.has('audit_test_pyramid_gaps')).toBe(true);
    fs.mkdirSync(path.join(tmpDir, 'ai-evals'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'promptfooconfig.yaml'), 'prompts: []\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname="ai"\ndependencies=["deepeval"]\n', 'utf-8');

    const pyramid = await auditTestPyramidGaps(tmpDir);
    expect(pyramid.meta_gates_audit?.some((g) => g.gate_id === 'graphify_ast' && g.status === 'MISSING')).toBe(true);
    expect(pyramid.prioritized_action_plan.some((a) => a.title.includes('Graphify'))).toBe(true);
    expect(pyramid.prioritized_action_plan.some((a) => a.title.includes('LLM/RAG'))).toBe(true);
  });

  it('certify11xGate auto-builds missing AST graph when source exists, hard-fails if builder fails, and skips on docs-only', async () => {
    fs.writeFileSync(path.join(tmpDir, 'TESTING.md'), '# Testing\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'CHANGELOG.md'), '## [Unreleased]\n', 'utf-8');

    // 1. Docs-only project (0 source files) -> SKIPPED + skipped_remediations
    const docsOnly = await certify11xGate(tmpDir, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(docsOnly.check_statuses?.ast_topology_clean).toBe('SKIPPED');
    expect(docsOnly.skipped_remediations?.ast_topology_clean).toContain('actualizar-grafos-graphify.sh');

    // 2. Source exists + builder fails (Docker unavailable) -> hard FAILED Rule Zero block
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'service.ts'), 'export const ok = true;\n', 'utf-8');
    const failedBuild = await certify11xGate(tmpDir, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      astGraphBuilder: () => false,
      updateOptions: { allowNetworkCheck: false },
    });
    expect(failedBuild.gate_passed).toBe(false);
    expect(failedBuild.check_statuses?.ast_topology_clean).toBe('FAILED');
    expect(failedBuild.blockers.some((b) => b.includes('[RULE-ZERO][AST-GRAPH]'))).toBe(true);

    // 3. Source exists + builder generates graphify-out/graph.json -> PASSED + ast_graph_auto_built
    const builtOk = await certify11xGate(tmpDir, {
      requireLintEvidence: false,
      requireUnitEvidence: false,
      astGraphBuilder: (proj) => {
        fs.mkdirSync(path.join(proj, 'graphify-out'), { recursive: true });
        fs.writeFileSync(
          path.join(proj, 'graphify-out', 'graph.json'),
          JSON.stringify({ nodes: [{ id: 'src/service.ts', file: 'src/service.ts' }], links: [] }),
          'utf-8'
        );
        return true;
      },
      updateOptions: { allowNetworkCheck: false },
    });
    expect(builtOk.check_statuses?.ast_topology_clean).toBe('PASSED');
    expect(builtOk.ast_graph_auto_built).toBe(true);
    expect(builtOk.upstream_evolution_reminder).toContain(EVOLUTION_SUPPORT_EMAIL);
  });

  it('exposes compliance audit protocol and email evolution guidance via native MCP server instructions', () => {
    expect(QA_11X_MCP_INSTRUCTIONS).toContain('inspect_project_config');
    expect(QA_11X_MCP_INSTRUCTIONS).toContain('Graphify AST');
    expect(QA_11X_MCP_INSTRUCTIONS).toContain(EVOLUTION_SUPPORT_EMAIL);
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it('generates sanitized ready-to-send email template for soporte@tecnoconsultores.net without sending email', async () => {
    const syntheticGhToken = ['ghp', '1234567890abcdefghijkl'].join('_'); // qa-secret-fixture-ok
    expect(
      sanitizeProposalTextForEmail(`Leak in /home/alice/repo with token=${syntheticGhToken}`)
    ).toContain('<LOCAL_HOME>');

    const res = await proposeSkillEvolutionPr({
      project_path: tmpDir,
      target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
      improvement_title: 'Detectar grafo AST faltante en auditoría inicial',
      empirical_rationale:
        `En /home/devuser/client-app se omitió reportar graphify-out/graph.json con token=${syntheticGhToken}.`,
      proposed_content_or_snippet: 'Ensure standard_11x_readiness reports graphify_ast.',
      dry_run: false,
      prefer_offline_fallback: true,
    });

    expect(res.primary_channel).toBe('email');
    expect(res.support_email).toBe(EVOLUTION_SUPPORT_EMAIL);
    expect(res.email_template.to).toBe(EVOLUTION_SUPPORT_EMAIL);
    expect(res.email_template.subject).toContain('[QA-11X Evolution]');
    expect(res.email_template.body).not.toContain('/home/devuser');
    expect(res.email_template.body).not.toContain(syntheticGhToken);
    expect(res.prefilled_mailto_url.startsWith(`mailto:${EVOLUTION_SUPPORT_EMAIL}?subject=`)).toBe(true);
    expect(res.prefilled_mailto_url.length).toBeLessThanOrEqual(MAX_PREFILLED_MAILTO_URL_LENGTH);
    expect(res.prefilled_github_url).toContain('https://github.com/');
    const savedMd = fs.readFileSync(res.local_proposal_file, 'utf-8');
    expect(savedMd).toContain(EVOLUTION_SUPPORT_EMAIL);
    expect(savedMd).not.toContain('/home/devuser');
  });

  it('provides first-class OpenCode support in install-skill, agents-connector, mcp-config, doctor and companion detector', async () => {
    const fakeHome = path.join(tmpDir, 'home');
    const opencodeDir = path.join(fakeHome, '.config', 'opencode');
    fs.mkdirSync(opencodeDir, { recursive: true });

    // Global connector sync
    expect(GLOBAL_CONNECTOR_TARGETS.some((t) => t.agent === 'opencode')).toBe(true);
    const syncEntries = syncGlobalAgentConnectors(fakeHome, false, 'es', 'opencode');
    expect(syncEntries).toHaveLength(1);
    expect(syncEntries[0]?.updated).toBe(true);
    expect(fs.existsSync(path.join(opencodeDir, 'AGENTS.md'))).toBe(true);

    // mcp-config install for opencode (mcp.servers["qa-11x"].type="local", command=[...])
    const cfgRes = runMcpConfigCli(['--client', 'opencode', '--install', '--latest'], {
      homeDir: fakeHome,
      cwd: tmpDir,
    });
    expect(cfgRes.exitCode).toBe(0);
    const openCodeCfgPath = path.join(fakeHome, OPENCODE_CANONICAL_MCP_REL_PATH);
    expect(fs.existsSync(openCodeCfgPath)).toBe(true);
    const parsedCfg = JSON.parse(fs.readFileSync(openCodeCfgPath, 'utf-8')) as {
      mcp: { servers: Record<string, { type: string; command: string[] }> };
    };
    expect(parsedCfg.mcp.servers['qa-11x']?.type).toBe('local');
    expect(parsedCfg.mcp.servers['qa-11x']?.command[0]).toBe('npx');

    // Companion MCP detection & browser candidates include opencode
    expect(getDoctorIdeMcpTargets().some((t) => t.client === 'opencode')).toBe(true);
    expect(getBrowserMcpCandidatePaths(fakeHome).some((p) => p.includes('opencode.json'))).toBe(true);
    parsedCfg.mcp.servers['playwright'] = { type: 'local', command: ['npx', '-y', '@playwright/mcp@latest'] };
    fs.writeFileSync(openCodeCfgPath, JSON.stringify(parsedCfg, null, 2), 'utf-8');
    const companions = detectCompanionMcps(fakeHome);
    expect(companions.detected_any).toBe(true);

    // Doctor warns about unpinned @latest inside OpenCode mcp.servers command[]
    const docRes = await runDoctorCli(['--offline', '--json', '--dir', tmpDir], {
      homeDir: fakeHome,
      cwd: tmpDir,
      dockerProbeFn: () => '28.0.0',
      dockerHealthProbeFn: () => ({
        restarting_containers: [],
        orphan_bridge_networks: 0,
        network_manager_unmanaged_ok: true,
        max_temp_c: null,
        available_mem_pct: 60,
        warnings: [],
      }),
    });
    expect(docRes.exitCode).toBe(0);
    expect(docRes.output).toContain('opencode');
    expect(docRes.output).toContain('@latest');

    // install-skill --target opencode + version-manager detection
    const mockRepo = path.join(tmpDir, 'mock-blueprints');
    const skillPath = path.join(mockRepo, '.agents', 'skills', 'qa-11x-architect');
    fs.mkdirSync(skillPath, { recursive: true });
    const skillBody = '# QA-11X Architect\n';
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillBody, 'utf-8');
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update(skillBody).digest('hex');
    fs.writeFileSync(
      path.join(mockRepo, 'manifest.json'),
      JSON.stringify({
        blueprint_version: '3.9.0',
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            merge_strategy: 'copy_or_overwrite',
            sha256: sha,
            size_bytes: Buffer.byteLength(skillBody),
          },
        ],
        stacks: {},
      }),
      'utf-8'
    );
    const fetcher = new GitHubFetcher({ localOverridePath: mockRepo });
    await runInstallSkillCli(['--target', 'opencode'], fetcher, {
      homeDir: fakeHome,
      cwd: tmpDir,
      log: () => undefined,
    });
    const detectedDirs = detectExistingQa11xSkillDirs(fakeHome);
    expect(detectedDirs.some((d) => d.includes(path.join('.config', 'opencode', 'skills')))).toBe(true);
  });

  it('UI-11X-03 detects _redirects SPA catch-all without /assets/* guard and _headers HTML positive max-age', async () => {
    const pubDir = path.join(tmpDir, 'public');
    fs.mkdirSync(pubDir, { recursive: true });
    fs.writeFileSync(path.join(pubDir, '_redirects'), '/* /index.html 200\n', 'utf-8');
    fs.writeFileSync(
      path.join(pubDir, '_headers'),
      '/\n  Cache-Control: public, max-age=16070400\n',
      'utf-8'
    );

    const badAudit = await auditSecurityStigOwasp(tmpDir);
    const ui03 = badAudit.findings.filter((f) => f.rule_id === 'UI-11X-03');
    expect(ui03.some((f) => f.message.includes('_redirects') && f.message.includes('/assets/*'))).toBe(true);
    expect(ui03.some((f) => f.message.includes('Cache-Control') && f.message.includes('max-age positivo'))).toBe(true);

    // Remediated _redirects + _headers -> 0 UI-11X-03 findings
    fs.writeFileSync(
      path.join(pubDir, '_redirects'),
      '/assets/* /404.html 404\n/* /index.html 200\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(pubDir, '_headers'),
      '/\n  Cache-Control: public, max-age=0, must-revalidate\n',
      'utf-8'
    );
    const cleanAudit = await auditSecurityStigOwasp(tmpDir);
    expect(cleanAudit.findings.filter((f) => f.rule_id === 'UI-11X-03')).toHaveLength(0);

    // Additional edge branches: comments, single-token line, forced 200!, public/assets/404.html, pragma
    fs.writeFileSync(
      path.join(pubDir, '_redirects'),
      '# comment line\n\nsingle_token\n/* /index.html 200!\n',
      'utf-8'
    );
    const forcedAudit = await auditSecurityStigOwasp(tmpDir);
    expect(forcedAudit.findings.some((f) => f.rule_id === 'UI-11X-03' && f.message.includes('_redirects'))).toBe(true);

    // Providing public/assets/404.html satisfies assets guard even without explicit /assets/* redirect rule
    fs.mkdirSync(path.join(pubDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(pubDir, 'assets', '404.html'), '<h1>404</h1>\n', 'utf-8');
    const assets404Audit = await auditSecurityStigOwasp(tmpDir);
    expect(assets404Audit.findings.filter((f) => f.rule_id === 'UI-11X-03')).toHaveLength(0);
    fs.rmSync(path.join(pubDir, 'assets'), { recursive: true, force: true });

    // Pragma exemption & empty _redirects
    fs.writeFileSync(path.join(pubDir, '_redirects'), '# qa-ui-11x-03-ok\n/* /index.html 200\n', 'utf-8');
    expect((await auditSecurityStigOwasp(tmpDir)).findings.filter((f) => f.rule_id === 'UI-11X-03')).toHaveLength(0);
    fs.writeFileSync(path.join(pubDir, '_redirects'), '', 'utf-8');
    expect((await auditSecurityStigOwasp(tmpDir)).findings.filter((f) => f.rule_id === 'UI-11X-03')).toHaveLength(0);
  });

  it('covers edge branches in standardReadiness, starter-tier pyramid plan, and OpenCode mcp-config merge/errors', async () => {
    // 1. Starter tier skips CALM meta-gate in prioritized_action_plan + upstream blueprints repo exempts duplication
    fs.writeFileSync(path.join(tmpDir, '.qa-11x.json'), JSON.stringify({ tier: 'starter' }), 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{"blueprint_version":"3.9.0"}\n', 'utf-8');
    fs.mkdirSync(path.join(tmpDir, '.agents', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.agents', 'scripts', 'sync_governance.py'), '# upstream\n', 'utf-8');
    fs.mkdirSync(path.join(tmpDir, '.agents', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.agents', 'rules', 'mandatory_qa_pyramid_and_doc_sync.md'), '# rule\n', 'utf-8');
    fs.mkdirSync(path.join(tmpDir, 'graphify-out'), { recursive: true }); // empty dir without graph.json -> catch branch
    const deepDir = path.join(tmpDir, 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'too-deep.ts'), 'export const z = 1;\n', 'utf-8');
    fs.symlinkSync(path.join(tmpDir, 'manifest.json'), path.join(tmpDir, 'link-entry.ts'));

    expect(hasAnalyzableSourceCode(tmpDir)).toBe(false);
    const starterPyramid = await auditTestPyramidGaps(tmpDir, 'fastapi');
    expect(starterPyramid.prioritized_action_plan.some((a) => a.title.includes('CALM'))).toBe(false);
    const upstreamInspection = await inspectProjectConfig(tmpDir);
    const govPillar = upstreamInspection.standard_11x_readiness?.pillars.find(
      (p) => p.id === 'thin_repo_governance'
    );
    expect(govPillar?.missing_items.some((m) => m.includes('duplicadas'))).toBe(false);

    // Unreadable .qa-11x.json exercises readTextSafe catch branch
    const qaCfg = path.join(tmpDir, '.qa-11x.json');
    fs.chmodSync(qaCfg, 0o000);
    try {
      const unreadableInspection = await inspectProjectConfig(tmpDir);
      expect(unreadableInspection.standard_11x_readiness?.declared_tier).toBeNull();
    } finally {
      fs.chmodSync(qaCfg, 0o600);
    }

    // 2. OpenCode mcp-config merge (non-object mcp/servers, --toolset core, and invalid JSON abort)
    const ocHome = path.join(tmpDir, 'oc-edge-home');
    const ocCfgPath = path.join(ocHome, '.config', 'opencode', 'opencode.json');
    fs.mkdirSync(path.dirname(ocCfgPath), { recursive: true });
    fs.writeFileSync(ocCfgPath, JSON.stringify({ mcp: 'not-an-object', custom: true }), 'utf-8');
    const mergedNonObj = runMcpConfigCli(['--client', 'opencode', '--toolset', 'core', '--install'], {
      homeDir: ocHome,
      platform: 'linux',
    });
    expect(mergedNonObj.exitCode).toBe(0);
    const parsedMerged = JSON.parse(fs.readFileSync(ocCfgPath, 'utf-8')) as {
      custom?: boolean;
      mcp?: { servers?: { 'qa-11x'?: { command?: string[] } } };
    };
    expect(parsedMerged.custom).toBe(true);
    expect(parsedMerged.mcp?.servers?.['qa-11x']?.command).toContain('--toolset');

    // Merge preserving existing sibling server inside mcp.servers
    fs.writeFileSync(
      ocCfgPath,
      JSON.stringify({ mcp: { servers: { sibling: { type: 'local', command: ['echo'] } } } }),
      'utf-8'
    );
    const mergedSibling = runMcpConfigCli(['--client', 'opencode', '--install'], {
      homeDir: ocHome,
      platform: 'linux',
    });
    expect(mergedSibling.exitCode).toBe(0);
    expect(fs.readFileSync(ocCfgPath, 'utf-8')).toContain('"sibling"');

    // Corrupt existing opencode.json aborts cleanly with exitCode 1
    fs.writeFileSync(ocCfgPath, '{ corrupt-json', 'utf-8');
    const corruptRes = runMcpConfigCli(['--client', 'opencode', '--install'], {
      homeDir: ocHome,
      platform: 'linux',
    });
    expect(corruptRes.exitCode).toBe(1);
    expect(corruptRes.output).toContain('JSON inválido existente');
  });
});
