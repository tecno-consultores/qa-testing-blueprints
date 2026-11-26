// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctorCli } from '../src/cli/doctor.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { runMcpConfigCli } from '../src/cli/mcp-config.js';
import { createMcpServer, QA_11X_MCP_INSTRUCTIONS } from '../src/server.js';
import { CORE_TOOLSET_NAMES } from '../src/server/toolsetFilter.js';
import {
  SessionFlightRecorderInputSchema,
  ValidateCalmInputSchema,
} from '../src/server/v2Schemas.js';
import { GLOBAL_CONNECTOR_TARGETS, syncGlobalAgentConnectors } from '../src/services/agents-connector.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
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
  findGitWorktreeRoot,
  isEnvIgnoredByFallbackRules,
  isEnvTemplatePath,
  isTestFilePath,
  loadGitTrackedSet,
  normalizeGitignoreLine,
  queryGitIgnoredSet,
  resolveTrustedGitExecutable,
  wildcardSegmentMatch,
} from '../src/tools/security-auditor/shared.js';
import {
  evaluateStandard11xReadiness,
  findAstGraphFilesRecursive,
  hasAnalyzableSourceCode,
} from '../src/tools/standardReadiness.js';
import {
  auditTestPyramidGaps,
  findOrphanSourceFiles,
  findUntestedUiViews,
} from '../src/tools/test-pyramid-auditor.js';
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
    expect(readiness?.effective_tier).toBe('standard');
    expect(readiness?.tier_confirmed_by_user).toBe(false);
    expect(readiness?.qa_11x_banner).toBe('[QA-11X | Tier: standard | Path: AUTO]');
    expect(readiness?.ast_graph_present).toBe(false);
    expect(readiness?.missing_mandatory_pillars).toContain('graphify_ast');
    expect(readiness?.missing_mandatory_pillars).toContain('thin_repo_governance');
    expect(readiness?.missing_mandatory_pillars).not.toContain('calm_architecture');
    expect(readiness?.recommended_audit_sequence).toContain('inspect_ast_blast_radius(auto_build_if_missing: true)');
    expect(readiness?.recommended_audit_sequence).toContain('audit_test_pyramid_gaps');
    expect(readiness?.recommended_audit_sequence).toContain('certify_11x_gate');

    // Explicit enterprise tier requires calm_architecture
    fs.writeFileSync(path.join(tmpDir, '.qa-11x.json'), JSON.stringify({ tier: 'enterprise' }), 'utf-8');
    const entReadiness = evaluateStandard11xReadiness(tmpDir, ['vue3'], ['src/app.ts']);
    expect(entReadiness.effective_tier).toBe('enterprise');
    expect(entReadiness.missing_mandatory_pillars).toContain('calm_architecture');

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
    fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# Security\n', 'utf-8');

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

    // mcp-config install for opencode (official https://opencode.ai/config.json: mcp["qa-11x"])
    const cfgRes = runMcpConfigCli(['--client', 'opencode', '--install', '--latest'], {
      homeDir: fakeHome,
      cwd: tmpDir,
    });
    expect(cfgRes.exitCode).toBe(0);
    const openCodeCfgPath = path.join(fakeHome, OPENCODE_CANONICAL_MCP_REL_PATH);
    expect(fs.existsSync(openCodeCfgPath)).toBe(true);
    const parsedCfg = JSON.parse(fs.readFileSync(openCodeCfgPath, 'utf-8')) as {
      $schema?: string;
      mcp: Record<string, { type: string; command: string[]; enabled?: boolean }>;
    };
    expect(parsedCfg.$schema).toBe('https://opencode.ai/config.json');
    expect(parsedCfg.mcp['qa-11x']?.type).toBe('local');
    expect(parsedCfg.mcp['qa-11x']?.enabled).toBe(true);
    expect(parsedCfg.mcp['qa-11x']?.command[0]).toBe('npx');

    // Companion MCP detection & browser candidates include opencode
    expect(getDoctorIdeMcpTargets().some((t) => t.client === 'opencode')).toBe(true);
    expect(getBrowserMcpCandidatePaths(fakeHome).some((p) => p.includes('opencode.json'))).toBe(true);
    parsedCfg.mcp['playwright'] = { type: 'local', command: ['npx', '-y', '@playwright/mcp@latest'], enabled: true };
    fs.writeFileSync(openCodeCfgPath, JSON.stringify(parsedCfg, null, 2), 'utf-8');
    const companions = detectCompanionMcps(fakeHome);
    expect(companions.detected_any).toBe(true);

    // Doctor warns about unpinned @latest inside OpenCode mcp["qa-11x"].command[]
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

    // Doctor also warns if legacy mcp.servers.qa-11x schema is present in opencode.json
    fs.writeFileSync(
      openCodeCfgPath,
      JSON.stringify({ mcp: { servers: { 'qa-11x': { type: 'local', command: ['npx', '-y', '@sinfallas/mcp-qa-11x@3.9.0'] } } } }),
      'utf-8'
    );
    const legacyWarnRes = await runDoctorCli(['--offline', '--json', '--dir', tmpDir], {
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
    expect(legacyWarnRes.output).toContain('mcp.servers.qa-11x');

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

    // 2. OpenCode mcp-config merge (official mcp["qa-11x"], non-object mcp, --toolset core, and invalid JSON abort)
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
      $schema?: string;
      custom?: boolean;
      mcp?: Record<string, { command?: string[]; enabled?: boolean }>;
    };
    expect(parsedMerged.$schema).toBe('https://opencode.ai/config.json');
    expect(parsedMerged.custom).toBe(true);
    expect(parsedMerged.mcp?.['qa-11x']?.command).toContain('--toolset');
    expect(parsedMerged.mcp?.['qa-11x']?.enabled).toBe(true);

    // Merge preserving existing $schema and sibling server inside mcp
    fs.writeFileSync(
      ocCfgPath,
      JSON.stringify({
        $schema: 'https://custom.example/schema.json',
        mcp: { sibling: { type: 'local', command: ['echo'] } },
      }),
      'utf-8'
    );
    const mergedSibling = runMcpConfigCli(['--client', 'opencode', '--install'], {
      homeDir: ocHome,
      platform: 'linux',
    });
    expect(mergedSibling.exitCode).toBe(0);
    const rawMergedSibling = fs.readFileSync(ocCfgPath, 'utf-8');
    expect(rawMergedSibling).toContain('"sibling"');
    expect(rawMergedSibling).toContain('https://custom.example/schema.json');

    // Corrupt existing opencode.json aborts cleanly with exitCode 1
    fs.writeFileSync(ocCfgPath, '{ corrupt-json', 'utf-8');
    const corruptRes = runMcpConfigCli(['--client', 'opencode', '--install'], {
      homeDir: ocHome,
      platform: 'linux',
    });
    expect(corruptRes.exitCode).toBe(1);
    expect(corruptRes.output).toContain('JSON inválido existente');
  });

  it('supports all 21 local MCP clients (Zed, Cline, Roo, Kilo, Continue, Goose, Amazon Q, Junie, Devin, Augment, Trae) and new global skill targets', async () => {
    const multiHome = path.join(tmpDir, 'multi-agent-home');
    fs.mkdirSync(multiHome, { recursive: true });

    // 1. Print all 21 supported clients cleanly
    const allPrint = runMcpConfigCli(['--client', 'all', '--print', '--json'], {
      homeDir: multiHome,
      platform: 'linux',
    });
    expect(allPrint.exitCode).toBe(0);
    const parsedAll = JSON.parse(allPrint.output) as { clients: Array<{ client: string; snippet: string }> };
    expect(parsedAll.clients).toHaveLength(21);
    expect(parsedAll.clients.find((c) => c.client === 'opencode')?.snippet).toContain('https://opencode.ai/config.json');
    expect(parsedAll.clients.find((c) => c.client === 'zed')?.snippet).toContain('"context_servers"');
    expect(parsedAll.clients.find((c) => c.client === 'continue')?.snippet).toContain('schema: v1');
    expect(parsedAll.clients.find((c) => c.client === 'goose')?.snippet).toContain('extensions:');

    // 2. Zed install (empty -> merge with existing context_servers -> non-object context_servers -> invalid JSON abort)
    const zedCfg = path.join(multiHome, '.config', 'zed', 'settings.json');
    expect(runMcpConfigCli(['--client', 'zed', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    const zedParsed = JSON.parse(fs.readFileSync(zedCfg, 'utf-8')) as {
      context_servers?: Record<string, { command: string; args: string[] }>;
    };
    expect(zedParsed.context_servers?.['qa-11x']?.command).toBe('npx');
    fs.writeFileSync(zedCfg, JSON.stringify({ theme: 'One', context_servers: { other: { command: 'echo', args: [] } } }), 'utf-8');
    expect(runMcpConfigCli(['--client', 'zed', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    expect(fs.readFileSync(zedCfg, 'utf-8')).toContain('"other"');
    fs.writeFileSync(zedCfg, JSON.stringify({ context_servers: 'invalid' }), 'utf-8');
    expect(runMcpConfigCli(['--client', 'zed', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    fs.writeFileSync(zedCfg, '{bad', 'utf-8');
    expect(runMcpConfigCli(['--client', 'zed', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(1);

    // 3. Continue.dev YAML install
    const contRes = runMcpConfigCli(['--client', 'continue', '--install'], { homeDir: multiHome, platform: 'linux' });
    expect(contRes.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(multiHome, '.continue', 'mcpServers', 'qa-11x.yaml'), 'utf-8')).toContain('name: qa-11x');

    // 4. Block Goose YAML install across all upsert branches (new -> no extensions -> extensions without qa-11x -> replace qa-11x)
    const gooseCfg = path.join(multiHome, '.config', 'goose', 'config.yaml');
    expect(runMcpConfigCli(['--client', 'goose', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    expect(fs.readFileSync(gooseCfg, 'utf-8')).toContain('type: stdio');
    fs.writeFileSync(gooseCfg, 'GOOSE_PROVIDER: openai\n', 'utf-8');
    expect(runMcpConfigCli(['--client', 'goose', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    expect(fs.readFileSync(gooseCfg, 'utf-8')).toContain('GOOSE_PROVIDER: openai');
    fs.writeFileSync(gooseCfg, 'extensions:\n  other:\n    type: stdio\n', 'utf-8');
    expect(runMcpConfigCli(['--client', 'goose', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    expect(fs.readFileSync(gooseCfg, 'utf-8')).toContain('other:');
    expect(runMcpConfigCli(['--client', 'goose', '--latest', '--install'], { homeDir: multiHome, platform: 'linux' }).exitCode).toBe(0);
    expect(fs.readFileSync(gooseCfg, 'utf-8')).toContain('@latest');

    // 5. Standard JSON clients install (cline, roo-code, kilo-code, amazon-q, jetbrains-ai, devin, augment, trae)
    for (const cliClient of ['cline', 'roo-code', 'kilo-code', 'amazon-q', 'jetbrains-ai', 'devin', 'augment', 'trae']) {
      const res = runMcpConfigCli(['--client', cliClient, '--install'], { homeDir: multiHome, platform: 'linux' });
      expect(res.exitCode).toBe(0);
    }
    expect(fs.existsSync(path.join(multiHome, '.aws', 'amazonq', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(multiHome, '.junie', 'mcp', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(multiHome, '.config', 'devin', 'mcp_config.json'))).toBe(true);

    // 6. Global skills (gemini-cli, copilot, agents) & global connectors (zed, gemini-cli -> .gemini/GEMINI.md)
    fs.mkdirSync(path.join(multiHome, '.gemini'), { recursive: true });
    fs.mkdirSync(path.join(multiHome, '.config', 'zed'), { recursive: true });
    expect(syncGlobalAgentConnectors(multiHome, false, 'en', 'gemini-cli')[0]?.updated).toBe(true);
    expect(syncGlobalAgentConnectors(multiHome, false, 'en', 'zed')[0]?.updated).toBe(true);
    expect(fs.existsSync(path.join(multiHome, '.config', 'zed', 'AGENTS.md'))).toBe(true);

    const mockRepo = path.join(tmpDir, 'mock-multi-repo');
    const skillPath = path.join(mockRepo, '.agents', 'skills', 'qa-11x-architect');
    fs.mkdirSync(skillPath, { recursive: true });
    const skillBody = '# QA-11X Multi-Agent\n';
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
    for (const target of ['gemini-cli', 'copilot', 'agents']) {
      await runInstallSkillCli(['--target', target], fetcher, {
        homeDir: multiHome,
        cwd: tmpDir,
        log: () => undefined,
      });
    }
    const foundSkillDirs = detectExistingQa11xSkillDirs(multiHome);
    expect(foundSkillDirs).toContain(path.join(multiHome, '.gemini', 'skills'));
    expect(foundSkillDirs).toContain(path.join(multiHome, '.copilot', 'skills'));
    expect(foundSkillDirs).toContain(path.join(multiHome, '.agents', 'skills'));
  });

  it('handles git-ignored vs tracked .env, .env.example placeholders, SEC-05 directory boundaries, upstream governance, and grouped orphans', async () => {
    // 1. SEC-10: git-ignored untracked .env is skipped, unignored .env.local & tracked .env are flagged
    const envDir = path.join(tmpDir, 'env-sec10');
    fs.mkdirSync(path.join(envDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(envDir, '.gitignore'), '.env*\n!/.env.local\n', 'utf-8');
    fs.writeFileSync(path.join(envDir, 'sub', '.gitignore'), '*.env\n', 'utf-8');
    const fakeNpmTok = ['npm', '1234567890abcdefghij1234'].join('_'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(envDir, '.env'), `NPM_TOKEN=${fakeNpmTok}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(envDir, '.env.local'), `API_SECRET=${fakeNpmTok}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(envDir, 'sub', '.env.prod'), `API_TOKEN=${fakeNpmTok}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(
      path.join(envDir, '.env.example'),
      'NPM_TOKEN=npm_placeholder_TU_TOKEN_DE_NPMJS_AQUI\nAPI_KEY=your_api_key_here\n', // # qa-secret-fixture-ok
      'utf-8'
    );
    fs.writeFileSync(path.join(envDir, 'env.staging.example'), 'SECRET_TOKEN=dummy-secret-val\n', 'utf-8'); // # qa-secret-fixture-ok

    expect(isEnvTemplatePath('.env.example')).toBe(true);
    expect(isEnvTemplatePath('env.example')).toBe(true);
    expect(isEnvTemplatePath('.env.staging.example')).toBe(true);
    expect(isEnvTemplatePath('env.prod.sample')).toBe(true);
    expect(isEnvTemplatePath('.env.local')).toBe(false);
    expect(isEnvTemplatePath('main.py.example')).toBe(false);

    const untrackAudit = await auditSecurityStigOwasp(envDir);
    expect(untrackAudit.findings.filter((f) => f.rule_id === 'SEC-10').map((f) => f.file)).toEqual([
      '.env.local',
    ]);

    const exAuditClean = await auditSecurityStigOwasp(envDir, { includeExamples: true });
    expect(exAuditClean.findings.some((f) => f.file === '.env.example')).toBe(false);
    expect(exAuditClean.findings.some((f) => f.file === 'env.staging.example')).toBe(false);

    // Real token inside .env.example MUST fail when includeExamples=true
    fs.appendFileSync(path.join(envDir, '.env.example'), `LEAK_TOKEN=${fakeNpmTok}\n`, 'utf-8'); // # qa-secret-fixture-ok
    const exAuditLeak = await auditSecurityStigOwasp(envDir, { includeExamples: true });
    expect(exAuditLeak.findings.some((f) => f.rule_id === 'SEC-10' && f.file === '.env.example')).toBe(true);

    // Tracked .env in Git index MUST still be scanned despite .gitignore
    execFileSync('/usr/bin/git', ['init', '-q', envDir], {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' },
    });
    execFileSync('/usr/bin/git', ['-C', envDir, 'add', '-f', '.env'], {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' },
    });
    const trackedAudit = await auditSecurityStigOwasp(envDir);
    expect(trackedAudit.findings.some((f) => f.rule_id === 'SEC-10' && f.file === '.env')).toBe(true);

    // 2. SEC-05: fastapi/ prefix without /api/ segment & test files do NOT false-positive
    const sec05Dir = path.join(tmpDir, 'sec05-boundary');
    fs.mkdirSync(path.join(sec05Dir, 'fastapi', 'tests'), { recursive: true });
    fs.mkdirSync(path.join(sec05Dir, 'fastapi', 'services'), { recursive: true });
    fs.mkdirSync(path.join(sec05Dir, 'fastapi', 'src', 'api'), { recursive: true });
    const validatorBody = 'from pydantic import field_validator\ndef check(v: str) -> str:\n    return v\n';
    fs.writeFileSync(
      path.join(sec05Dir, 'fastapi', 'tests', 'test_cleanliness.unit.py.example'),
      validatorBody,
      'utf-8'
    );
    fs.writeFileSync(path.join(sec05Dir, 'fastapi', 'services', 'helper.py'), validatorBody, 'utf-8');
    fs.writeFileSync(path.join(sec05Dir, 'fastapi', 'src', 'api', 'users.py'), validatorBody, 'utf-8');

    const sec05Res = await auditSecurityStigOwasp(sec05Dir, { includeExamples: true });
    const sec05Files = sec05Res.findings.filter((f) => f.rule_id === 'SEC-05').map((f) => f.file);
    expect(sec05Files).toEqual(['fastapi/src/api/users.py']);

    // 3. Upstream canonical repo thin_repo_governance PRESENT vs missing AGENTS.md PARTIAL
    const upDir = path.join(tmpDir, 'upstream-canon');
    fs.mkdirSync(path.join(upDir, '.agents', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(upDir, 'manifest.json'), '{"blueprint_version":"3.9.0"}\n', 'utf-8');
    fs.writeFileSync(path.join(upDir, '.agents', 'scripts', 'sync_governance.py'), '# ok\n', 'utf-8');
    fs.writeFileSync(path.join(upDir, '.agents', 'ACTIVE_TASK.md'), '# active\n', 'utf-8');
    fs.writeFileSync(
      path.join(upDir, '.gitignore'),
      [
        '.agents/ACTIVE_TASK.md',
        '.agents/.qa-evidence.json',
        '.agents/.qa-11x-version',
        '.agents/.cache/',
        '.agents/backups/',
        '.agents/proposals/',
        '.agents/artifacts/',
        '.agents/tmp/',
        '.agents/mcp_config.json',
        'graphify-out/',
        '*.11x-backup',
        '*.11x-incoming',
        '.agents/**/*.bak',
      ].join('\n') + '\n',
      'utf-8'
    );
    const missingAgentsSnap = evaluateStandard11xReadiness(upDir, [], []);
    const partialGov = missingAgentsSnap.pillars.find((p) => p.id === 'thin_repo_governance');
    expect(partialGov?.status).toBe('PARTIAL');
    expect(partialGov?.missing_items).toContain('AGENTS.md');

    fs.writeFileSync(path.join(upDir, 'AGENTS.md'), '# Canonical Governance\n', 'utf-8');
    const fullUpstreamSnap = evaluateStandard11xReadiness(upDir, [], []);
    expect(fullUpstreamSnap.missing_mandatory_pillars).not.toContain('thin_repo_governance');
    expect(fullUpstreamSnap.pillars.find((p) => p.id === 'thin_repo_governance')?.status).toBe('PRESENT');

    // 4. Grouped / hyphenated / 1-hop facade orphan resolution + UntestedUiView unit_test status + v2Schemas
    const invDir = path.join(tmpDir, 'inv-grouped');
    fs.mkdirSync(path.join(invDir, 'src', 'services'), { recursive: true });
    fs.mkdirSync(path.join(invDir, 'src', 'tools', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(invDir, 'src', 'views'), { recursive: true });
    fs.mkdirSync(path.join(invDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(invDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(invDir, 'src', 'services', 'device_service.py'), 'x = 1\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'services', 'truly_orphan.py'), 'y = 2\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'scripts', 'generar-manifiesto.py'), 'z = 3\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'tools', 'facade.ts'), "import './sub/part.js';\n", 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'tools', 'sub', 'part.ts'), 'export const k = 1;\n', 'utf-8');
    fs.writeFileSync(
      path.join(invDir, 'tests', 'test_devices.unit.py'),
      'from services.device_service import x\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(invDir, 'tests', 'test_generar_manifiesto.unit.py'), 'assert True\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'tests', 'facade.unit.ts'), 'export {};\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'views', 'DevicesDashboard.vue'), '<template/>\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'views', 'DevicesDashboard.unit.ts'), 'export {};\n', 'utf-8');
    fs.writeFileSync(path.join(invDir, 'src', 'views', 'OrphanPanel.vue'), '<template/>\n', 'utf-8');

    const invFiles = [
      'src/services/device_service.py',
      'src/services/truly_orphan.py',
      'scripts/generar-manifiesto.py',
      'src/tools/facade.ts',
      'src/tools/sub/part.ts',
      'tests/test_devices.unit.py',
      'tests/test_generar_manifiesto.unit.py',
      'tests/facade.unit.ts',
      'src/views/DevicesDashboard.vue',
      'src/views/DevicesDashboard.unit.ts',
      'src/views/OrphanPanel.vue',
    ];
    const orphans = findOrphanSourceFiles(invDir, invFiles, ['fastapi', 'vue3']);
    expect(orphans.map((o) => o.source_file)).toEqual([
      'src/services/truly_orphan.py',
      'src/views/OrphanPanel.vue',
    ]);

    const uiViews = findUntestedUiViews(invDir, invFiles);
    const dashEntry = uiViews.find((v) => v.view_file === 'src/views/DevicesDashboard.vue');
    const orphanEntry = uiViews.find((v) => v.view_file === 'src/views/OrphanPanel.vue');
    expect(dashEntry?.present_in_unit_test).toBe(true);
    expect(dashEntry?.expected_unit_test).toBe('src/views/DevicesDashboard.unit.ts');
    expect(orphanEntry?.present_in_unit_test).toBe(false);
    expect(orphanEntry?.expected_unit_test).toBe('src/views/__tests__/OrphanPanel.unit.ts');

    expect(ValidateCalmInputSchema.safeParse({ profile: 'auto' }).success).toBe(true);
    expect(ValidateCalmInputSchema.safeParse({ extraField: true }).success).toBe(false);
    expect(SessionFlightRecorderInputSchema.safeParse({ action: 'recover' }).success).toBe(true);
    expect(SessionFlightRecorderInputSchema.safeParse({ action: 'invalid' }).success).toBe(false);

    // Error paths in readGitignoreLines (EISDIR) and loadGitTrackedSet (corrupt .git & missing git binary)
    const errGitDir = path.join(tmpDir, 'err-git-edge');
    fs.mkdirSync(path.join(errGitDir, '.gitignore'), { recursive: true });
    fs.writeFileSync(path.join(errGitDir, '.git'), 'gitdir: /nonexistent/corrupt-gitdir\n', 'utf-8');
    fs.writeFileSync(path.join(errGitDir, 'clean.ts'), 'export const ok = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(errGitDir, '.env'), 'CLEAN_VAR=1\n', 'utf-8');
    const corruptGitRes = await auditSecurityStigOwasp(errGitDir);
    expect(corruptGitRes.passed).toBe(true);

    expect(loadGitTrackedSet(errGitDir).size).toBe(0);
    expect(resolveTrustedGitExecutable(['/nonexistent/git-bin'])).toBeNull();
    expect(loadGitTrackedSet(errGitDir, ['/nonexistent/git-bin']).size).toBe(0);
  });

  it('prevents SEC-10 subdir tracked .env escapes, supports **/.env* & .env*.local globs, avoids .status orphan masking, and resolves index.ts barrels', async () => {
    const gitEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' };
    const fakeSk = ['sk-proj', '1234567890abcdefghijklmnop'].join('-'); // # qa-secret-fixture-ok

    // S1: .env*.local, **/.env.secret, config/.env*, gitignore(5) inline '#' non-comment, and subdir audits
    const s1 = path.join(tmpDir, 's1-glob-env');
    fs.mkdirSync(path.join(s1, 'apps', 'web'), { recursive: true });
    fs.mkdirSync(path.join(s1, 'config'), { recursive: true });
    fs.mkdirSync(path.join(s1, 'secrets'), { recursive: true });
    execFileSync('/usr/bin/git', ['init', '-q', s1], { env: gitEnv });
    fs.writeFileSync(
      path.join(s1, '.gitignore'),
      '# comment\n.env*.local\n.env*mid*.custom\n**/.env.secret\nconfig/.env*\nsecrets/\n!.env\n.env.prod # inline hash is NOT a comment in gitignore(5)   \n.env.trailing   \n.env.space\\ \n',
      'utf-8'
    );
    fs.writeFileSync(path.join(s1, '.env.development.local'), `SECRET_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(s1, '.env.dev.mid.v2.custom'), `SECRET_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(s1, 'apps', 'web', '.env.secret'), `API_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(s1, 'config', '.env.stage'), `API_TOKEN=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(s1, 'secrets', '.env'), `API_TOKEN=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(s1, '.env.prod'), `PASSWORD=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    expect(findGitWorktreeRoot(path.join(s1, 'apps', 'web'))).toBe(path.resolve(s1));
    // Verify real git agrees: secrets/.env IS ignored (parent dir excluded), .env.prod IS NOT ignored (inline #)
    expect(() => execFileSync('/usr/bin/git', ['-C', s1, 'check-ignore', '-q', 'secrets/.env'], { env: gitEnv })).not.toThrow();
    expect(() => execFileSync('/usr/bin/git', ['-C', s1, 'check-ignore', '-q', '.env.prod'], { env: gitEnv })).toThrow();
    expect(
      (await auditSecurityStigOwasp(s1)).findings.filter((f) => f.rule_id === 'SEC-10').map((f) => f.file)
    ).toEqual(['.env.prod']);
    expect(
      (await auditSecurityStigOwasp(path.join(s1, 'apps', 'web'))).findings.filter(
        (f) => f.rule_id === 'SEC-10'
      )
    ).toEqual([]);
    // Pure-TS fallback also enforces parent-dir exclusion, no inline comments, and escaped \#
    expect(normalizeGitignoreLine('')).toBe('');
    expect(normalizeGitignoreLine('# comment')).toBe('');
    expect(normalizeGitignoreLine('  # literal')).toBe('  # literal');
    expect(normalizeGitignoreLine('\\#hash.env   ')).toBe('#hash.env');
    expect(isEnvIgnoredByFallbackRules(s1, path.join(s1, 'secrets', '.env'))).toBe(true);
    expect(isEnvIgnoredByFallbackRules(s1, path.join(s1, '.env.prod'))).toBe(false);
    expect(queryGitIgnoredSet(s1, [])?.size).toBe(0);
    expect(queryGitIgnoredSet(path.join(tmpDir, 'no-git-here'), ['.env'])).toBeNull();
    expect(queryGitIgnoredSet(s1, ['.env.prod'])?.size).toBe(0);
    expect(queryGitIgnoredSet(s1, ['secrets/.env'], ['/nonexistent/git-bin'])).toBeNull();

    // Non-Git fallback directory re-inclusion (!unignored-dir/) and anchored dir patterns
    const noGitDir = path.join(tmpDir, 's1b-nogit-fallback');
    fs.mkdirSync(path.join(noGitDir, 'reinc'), { recursive: true });
    fs.mkdirSync(path.join(noGitDir, 'anchored', 'sub'), { recursive: true });
    fs.writeFileSync(
      path.join(noGitDir, '.gitignore'),
      '/\nreinc/\n!reinc/\n/anchored/sub/\n!*.env\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(noGitDir, 'reinc', '.env'), `SECRET_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    fs.writeFileSync(path.join(noGitDir, 'anchored', 'sub', '.env'), `SECRET_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    expect(isEnvIgnoredByFallbackRules(noGitDir, path.join(noGitDir, 'reinc', '.env'))).toBe(false);
    expect(isEnvIgnoredByFallbackRules(noGitDir, path.join(noGitDir, 'anchored', 'sub', '.env'))).toBe(true);
    expect(
      (await auditSecurityStigOwasp(noGitDir)).findings.filter((f) => f.rule_id === 'SEC-10').map((f) => f.file)
    ).toEqual(['reinc/.env']);

    // S2: Tracked .env inside subdirectory MUST still be caught when auditing the subdirectory
    const s2 = path.join(tmpDir, 's2-tracked-sub');
    fs.mkdirSync(path.join(s2, 'apps', 'api'), { recursive: true });
    execFileSync('/usr/bin/git', ['init', '-q', s2], { env: gitEnv });
    fs.writeFileSync(path.join(s2, 'apps', 'api', '.gitignore'), '.env\n', 'utf-8');
    fs.writeFileSync(path.join(s2, 'apps', 'api', '.env'), `OPENAI_API_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
    execFileSync('/usr/bin/git', ['-C', s2, 'add', '-f', 'apps/api/.env'], { env: gitEnv });
    const s2Audit = await auditSecurityStigOwasp(path.join(s2, 'apps', 'api'));
    expect(s2Audit.findings.some((f) => f.rule_id === 'SEC-10' && f.file === '.env')).toBe(true);

    // S3 + S4: .status property access does NOT mask src/services/status.ts; index.ts barrel covers re-exports
    const s34 = path.join(tmpDir, 's34-barrel-orphan');
    fs.mkdirSync(path.join(s34, 'src', 'services'), { recursive: true });
    fs.mkdirSync(path.join(s34, 'src', 'untested'), { recursive: true });
    fs.mkdirSync(path.join(s34, 'packages', 'mod', 'app'), { recursive: true });
    fs.mkdirSync(path.join(s34, 'packages', 'other'), { recursive: true });
    fs.mkdirSync(path.join(s34, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(s34, 'src', 'services', 'status.ts'), 'export const s = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(s34, 'src', 'services', 'index.ts'), "export * from './taxEngine.js';\n", 'utf-8');
    fs.writeFileSync(path.join(s34, 'src', 'services', 'taxEngine.ts'), 'export const vat = 0.19;\n', 'utf-8');
    fs.writeFileSync(path.join(s34, 'src', 'untested', 'index.ts'), "export * from './dead.js';\n", 'utf-8');
    fs.writeFileSync(path.join(s34, 'src', 'untested', 'dead.ts'), 'export const dead = 0;\n', 'utf-8');
    fs.writeFileSync(path.join(s34, 'packages', 'mod', 'app', 'index.ts'), 'export {};\n', 'utf-8');
    fs.writeFileSync(path.join(s34, 'packages', 'other', 'index.ts'), 'export {};\n', 'utf-8');
    fs.writeFileSync(
      path.join(s34, 'tests', 'health.unit.ts'),
      "import { vat } from '../src/services/index.js';\nexpect(res.status).toBe(200 + vat);\n",
      'utf-8'
    );
    const s34Files = [
      'src/services/status.ts',
      'src/services/index.ts',
      'src/services/taxEngine.ts',
      'src/untested/index.ts',
      'src/untested/dead.ts',
      'packages/mod/app/index.ts',
      'packages/other/index.ts',
      'tests/health.unit.ts',
    ];
    const s34Orphans = findOrphanSourceFiles(s34, s34Files, ['node-backend']);
    expect(s34Orphans.map((o) => o.source_file)).toEqual([
      'src/services/status.ts',
      'src/untested/dead.ts',
    ]);
    // Grouped UI view unit suite + consumer vendored QA-11X .sh scripts vs real user .sh
    const gvDir = path.join(tmpDir, 's35-grouped-view-and-vendored-sh');
    fs.mkdirSync(path.join(gvDir, 'src', 'views'), { recursive: true });
    fs.mkdirSync(path.join(gvDir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(gvDir, 'test'), { recursive: true });
    fs.mkdirSync(path.join(gvDir, 'e2e'), { recursive: true });
    fs.mkdirSync(path.join(gvDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(gvDir, 'src', 'views', 'OrdersDashboard.vue'), '<template><main>ok</main></template>\n', 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'tests', 'grouped-views.unit.ts'), "import OrdersDashboard from '../src/views/OrdersDashboard.vue';\nvoid OrdersDashboard;\n", 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'test', 'ui_business_flow.feature'), 'Feature: UI\nScenario: OrdersDashboard\n', 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'e2e', 'orders.e2e.ts'), '// OrdersDashboard\n', 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'scripts', 'verificar-secretos.sh'), '#!/usr/bin/env bash\n', 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'scripts', 'deploy.sh'), '#!/usr/bin/env bash\n', 'utf-8');
    fs.writeFileSync(path.join(gvDir, 'limpieza.sh'), '#!/usr/bin/env bash\n', 'utf-8');
    const gvFiles = [
      'src/views/OrdersDashboard.vue',
      'tests/grouped-views.unit.ts',
      'test/ui_business_flow.feature',
      'e2e/orders.e2e.ts',
      'scripts/verificar-secretos.sh',
      'scripts/deploy.sh',
      'limpieza.sh',
      '.agents/scripts/certify_task_completion.sh',
    ];
    expect(findUntestedUiViews(gvDir, ['tests/grouped-views.unit.ts'])).toEqual([]);
    expect(findUntestedUiViews(gvDir, gvFiles)).toEqual([]);
    expect(findOrphanSourceFiles(gvDir, gvFiles, ['vue3']).map((o) => o.source_file)).toEqual(['scripts/deploy.sh']);
    expect(
      findOrphanSourceFiles(gvDir, [...gvFiles, '.agents/scripts/sync_governance.py'], ['vue3']).map((o) => o.source_file)
    ).toEqual(['scripts/verificar-secretos.sh', 'scripts/deploy.sh']);
    expect(isTestFilePath('pkg/foo.unit.mts')).toBe(true);
    expect(isTestFilePath('fastapi/tests/test_x.unit.py.example')).toBe(true);
  });

  it('supports single-character ? wildcards, escapes, brackets, astral Unicode, and dir/bang .gitignore rules in SEC-10 plus Lefthook parallel:false merge', async () => {
    expect(wildcardSegmentMatch('dir/.env.a', '.env.?')).toBe(false);
    expect(wildcardSegmentMatch('.env.a', '.env.?')).toBe(true);
    expect(wildcardSegmentMatch('.env.', '.env.?')).toBe(false);
    expect(wildcardSegmentMatch('.env.ab', '.env.?')).toBe(false);
    expect(wildcardSegmentMatch('.env.local', '.env.loca?')).toBe(true);
    expect(wildcardSegmentMatch('.bak.local', '.env.loca?')).toBe(false);
    expect(wildcardSegmentMatch('.env', '.env.?*')).toBe(false);
    expect(wildcardSegmentMatch('.cfg.dev.local', '.env.*.loca?')).toBe(false);
    expect(wildcardSegmentMatch('.env.dev.xxxxl', '.env.*.loca?')).toBe(false);
    expect(wildcardSegmentMatch('.env.mid.local', '.env.*?.loca?')).toBe(true);
    expect(wildcardSegmentMatch('.env..local', '.env.*?x*.loca?')).toBe(false);
    expect(wildcardSegmentMatch('.env.dev.mid.v2.custom', '.env*mid*.custom')).toBe(true);
    expect(wildcardSegmentMatch('.env.dev.v2.custom', '.env*zzz*.custom')).toBe(false);
    // Escaped wildcards (\?, \*, \\) and lone trailing backslash
    expect(wildcardSegmentMatch('.env.?', '.env.\\?')).toBe(true);
    expect(wildcardSegmentMatch('.env.a', '.env.\\?')).toBe(false);
    expect(wildcardSegmentMatch('.env.\\a', '.env.\\?')).toBe(false);
    expect(wildcardSegmentMatch('.env.*', '.env.\\*')).toBe(true);
    expect(wildcardSegmentMatch('.env.local', '.env.\\*')).toBe(false);
    expect(wildcardSegmentMatch('.env.\\local', '.env.\\*')).toBe(false);
    expect(wildcardSegmentMatch('.env.\\', '.env.\\')).toBe(true);
    // Astral Unicode code points (surrogate pairs count as 1 char for ?)
    expect(wildcardSegmentMatch('.env.🔒', '.env.?')).toBe(true);
    expect(wildcardSegmentMatch('.env.🔒', '.env.??')).toBe(false);
    // POSIX / gitignore character classes ([12], [0-9], [!p], [^0-9], escaped member, unclosed [)
    expect(wildcardSegmentMatch('.env.1', '.env.[12]')).toBe(true);
    expect(wildcardSegmentMatch('.env.3', '.env.[12]')).toBe(false);
    expect(wildcardSegmentMatch('.env.5', '.env.[0-9]')).toBe(true);
    expect(wildcardSegmentMatch('.env.z', '.env.[0-9]')).toBe(false);
    expect(wildcardSegmentMatch('.env.dev', '.env.[!p]*')).toBe(true);
    expect(wildcardSegmentMatch('.env.prod', '.env.[!p]*')).toBe(false);
    expect(wildcardSegmentMatch('.env.a', '.env.[^0-9]')).toBe(true);
    expect(wildcardSegmentMatch('.env.]', '.env.[\\]a]')).toBe(true);
    expect(wildcardSegmentMatch('.env.[1', '.env.[1')).toBe(true);

    const gitEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' };
    const fakeSk = ['sk-proj', '1234567890abcdefghijklmnop'].join('-'); // # qa-secret-fixture-ok
    const qDir = path.join(tmpDir, 's5-qmark-gitignore');
    fs.mkdirSync(path.join(qDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(qDir, 'secrets-1'), { recursive: true });
    fs.mkdirSync(path.join(qDir, 'anchored-2'), { recursive: true });
    fs.mkdirSync(path.join(qDir, 'nested', 'dir-3'), { recursive: true });
    execFileSync('/usr/bin/git', ['init', '-q', qDir], { env: gitEnv });
    fs.writeFileSync(
      path.join(qDir, '.gitignore'),
      [
        '/',
        '.env.?',
        '.env.loca?',
        '.env.*.loca?',
        'config/.env.?',
        '.env.[89]',
        '.env.\\?',
        '.env.\\*',
        'secrets-?/',
        '/anchored-?/',
        'nested/dir-?/',
        '.env.lock',
        '\\!.env.lock',
        '',
      ].join('\n'),
      'utf-8'
    );
    const candidateFiles: Array<[string, boolean]> = [
      ['.env.a', true],
      ['.env.local', true],
      ['.env.dev.local', true],
      ['config/.env.1', true],
      ['.env.8', true],
      ['secrets-1/.env', true],
      ['anchored-2/.env', true],
      ['nested/dir-3/.env', true],
      ['.env.lock', true],
      ['.env.ab', false],
      ['.env.\\a', false],
      ['.env.\\local', false],
    ];
    for (const [rel, expectedGitIgnored] of candidateFiles) {
      fs.writeFileSync(path.join(qDir, rel), `SECRET_KEY=${fakeSk}\n`, 'utf-8'); // # qa-secret-fixture-ok
      let actualGitIgnored = false;
      try {
        execFileSync('/usr/bin/git', ['-C', qDir, 'check-ignore', '-q', rel], { env: gitEnv });
        actualGitIgnored = true;
      } catch {
        actualGitIgnored = false;
      }
      expect(actualGitIgnored).toBe(expectedGitIgnored);
    }

    const audit = await auditSecurityStigOwasp(qDir);
    expect(
      new Set(audit.findings.filter((f) => f.rule_id === 'SEC-10').map((f) => f.file))
    ).toEqual(new Set(['.env.\\a', '.env.\\local', '.env.ab']));

    // Verify SurgicalMerger preserves parallel: false in both pre-commit and pre-push from canonical lefthook.yml
    const repoLefthook = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'lefthook.yml'), 'utf-8');
    const mergedLefthook = new SurgicalMerger().mergeLefthookYaml('', repoLefthook, qDir);
    expect(mergedLefthook.merged.match(/^\s{2}parallel:\s*false\s*$/gm)).toHaveLength(2);
  });
});
