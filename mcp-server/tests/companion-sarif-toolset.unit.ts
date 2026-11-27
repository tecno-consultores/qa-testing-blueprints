// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCertifyCli } from '../src/cli/certify-cli.js';
import { runDoctorCli, type DoctorReport } from '../src/cli/doctor.js';
import { runMcpConfigCli } from '../src/cli/mcp-config.js';
import { createConfiguredMcpServer, dispatchCliArgs } from '../src/index.js';
import {
  CORE_TOOLSET_NAMES,
  parseToolsetMode,
  resolveAllowedToolNames,
} from '../src/server.js';
import {
  checkUnitEvidenceForDirtyCode,
  QA_EVIDENCE_REL_PATH,
  recordRedPhaseEvidence,
} from '../src/services/qa-evidence.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import {
  PINNED_SEMGREP_SARIF_IMAGE,
  PINNED_TRIVY_SARIF_IMAGE,
  runEphemeralQa,
  runExternalSarifScannerInDocker,
} from '../src/tools/ephemeral-runner.js';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { detectCompanionMcps } from '../src/utils/companionMcpDetector.js';
import {
  DEFAULT_SARIF_CACHE_REL_DIR,
  ingestExternalSarifReports,
  MAX_SARIF_FILE_BYTES,
} from '../src/utils/sarifIngester.js';

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('Companion MCPs, Federated SARIF, Rule Zero Blocker, expect_red & --toolset', () => {
  let tmpRoot: string;
  let homeDir: string;
  let projDir: string;
  let prevToolsetEnv: string | undefined;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-comp-sarif-'));
    homeDir = path.join(tmpRoot, 'home');
    projDir = path.join(tmpRoot, 'proj');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });
    prevToolsetEnv = process.env.QA_11X_TOOLSET;
    delete process.env.QA_11X_TOOLSET;
  });

  afterEach(() => {
    if (prevToolsetEnv === undefined) {
      delete process.env.QA_11X_TOOLSET;
    } else {
      process.env.QA_11X_TOOLSET = prevToolsetEnv;
    }
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('detects Companion MCPs across JSON, TOML (ignoring # comments), YAML & unreadable entries', async () => {
    const emptyReport = detectCompanionMcps(homeDir, 'linux');
    expect(emptyReport.detected_any).toBe(false);
    expect(emptyReport.delegation_directives).toEqual([]);
    expect(emptyReport.capabilities).toHaveLength(5);

    writeText(
      path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
          semgrep: { command: 'uvx', args: ['semgrep-mcp'] },
        },
      })
    );
    writeText(
      path.join(homeDir, '.codex', 'config.toml'),
      '# serena commented out\n[mcp_servers.trivy]\ncommand = "trivy-mcp"\n'
    );
    writeText(
      path.join(homeDir, '.hermes', 'config.yaml'),
      '# appium commented\nmcp:\n  serena:\n    command: serena\n  appium:\n    command: appium-mcp\n'
    );
    // Directory on .claude.json exercises unreadable/non-file skip safely
    fs.mkdirSync(path.join(homeDir, '.claude.json'), { recursive: true });

    const detected = detectCompanionMcps(homeDir, 'linux');
    expect(detected.detected_any).toBe(true);
    expect(detected.capabilities.every((c) => c.detected)).toBe(true);
    expect(detected.delegation_directives).toHaveLength(5);

    writeText(path.join(projDir, 'pyproject.toml'), '[project]\nname = "demo"\n');
    const projInspection = await inspectProjectConfig(projDir, homeDir, {
      allowNetworkCheck: false,
    });
    expect(projInspection.docker_daemon_required).toBe(true);
    expect(projInspection.companion_mcps?.detected_any).toBe(true);
  });

  it('enforces Docker daemon as hard blocker in runDoctorCli (exitCode=1 when missing, 0 when healthy)', async () => {
    const blockedJson = await runDoctorCli([projDir, '--offline', '--json'], {
      cwd: projDir,
      homeDir,
      dockerProbeFn: () => null,
    });
    expect(blockedJson.exitCode).toBe(1);
    const parsedBlocked = JSON.parse(blockedJson.output) as DoctorReport;
    expect(parsedBlocked.docker_daemon_ok).toBe(false);
    expect(parsedBlocked.blockers[0]).toContain('[RULE-ZERO]');

    const blockedText = await runDoctorCli([projDir, '--offline'], {
      cwd: projDir,
      homeDir,
      dockerProbeFn: () => null,
    });
    expect(blockedText.exitCode).toBe(1);
    expect(blockedText.output).toContain('NO DETECTADO (BLOQUEANTE)');
    expect(blockedText.output).toContain('[RULE-ZERO]');

    const healthy = await runDoctorCli([projDir, '--offline', '--json'], {
      cwd: projDir,
      homeDir,
      dockerProbeFn: () => '27.5.1',
    });
    expect(healthy.exitCode).toBe(0);
    const parsedHealthy = JSON.parse(healthy.output) as DoctorReport;
    expect(parsedHealthy.docker_daemon_ok).toBe(true);
    expect(parsedHealthy.blockers).toEqual([]);
  });

  it('ingests external SARIF 2.1.0 safely, handles symlinks/corrupt/oversized files, and audits qa-11x-ignore + confidence', async () => {
    expect(ingestExternalSarifReports(projDir)).toEqual({
      files_ingested: [],
      skipped_files: [],
      findings: [],
    });

    const sarifDir = path.join(projDir, DEFAULT_SARIF_CACHE_REL_DIR);
    fs.mkdirSync(sarifDir, { recursive: true });

    const validSarif = {
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'semgrep',
              rules: [{ id: 'python.sqli', help: { text: 'Use parameterized SQL queries.' } }],
            },
          },
          results: [
            {
              ruleId: 'python.sqli',
              level: 'error',
              properties: { 'security-severity': '9.4', __proto__: { polluted: true } },
              message: { text: 'Tainted SQL query sink' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'file:///app/src/db%20repo.py' },
                    region: { startLine: 18 },
                  },
                },
              ],
            },
            {
              ruleId: 'SARIF:semgrep:high-cvss',
              level: 'note',
              properties: { 'security-severity': 7.5 },
              message: { text: 'High CVSS finding' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: `file://${projDir}/src/api.py` },
                    region: { startLine: 9 },
                  },
                },
              ],
            },
            {
              ruleId: 'med-cvss',
              level: 'note',
              properties: { 'security-severity': 5.0 },
              message: {},
              locations: [{ physicalLocation: { artifactLocation: { uri: '../escape.py' } } }],
            },
            {
              ruleId: 'warn-level',
              level: 'warning',
              locations: [],
            },
            {
              ruleId: 'low-note',
              level: 'note',
              locations: [{ physicalLocation: { artifactLocation: { uri: '' } } }],
            },
            {
              ruleId: 'absent-ignored',
              baselineState: 'absent',
              level: 'error',
            },
          ],
        },
      ],
    };
    writeText(path.join(sarifDir, 'a-semgrep.sarif'), JSON.stringify(validSarif));
    writeText(path.join(sarifDir, 'b-corrupt.sarif'), '{not-json');
    writeText(path.join(sarifDir, 'c-noruns.sarif'), '{"version":"2.1.0"}');
    const outsideTarget = path.join(tmpRoot, 'outside.sarif');
    writeText(outsideTarget, '{}');
    fs.symlinkSync(outsideTarget, path.join(sarifDir, 'd-symlink.sarif'));

    const hugePath = path.join(sarifDir, 'e-huge.sarif');
    writeText(hugePath, '{}');
    fs.truncateSync(hugePath, MAX_SARIF_FILE_BYTES + 10);

    const summary = ingestExternalSarifReports(projDir);

    expect(summary.files_ingested).toEqual(['.agents/.cache/sarif/a-semgrep.sarif']);
    expect(summary.skipped_files).toHaveLength(4);
    expect(summary.findings).toHaveLength(5);
    expect(summary.findings[0]).toMatchObject({
      rule_id: 'SARIF:semgrep:python.sqli',
      severity: 'CRITICAL',
      confidence: 'HIGH',
      source: 'semgrep',
      file: 'src/db repo.py',
      line: 18,
    });
    expect(summary.findings.find((f) => f.rule_id.includes('med-cvss'))?.file).toBe('unknown');
    fs.unlinkSync(path.join(sarifDir, 'd-symlink.sarif'));

    // Inline suppression qa-11x-ignore (line-scoped, requires >= 12 chars justification, never leaks to next line)
    writeText(
      path.join(projDir, 'src', 'app.py'),
      [
        'import subprocess',
        'subprocess.run(cmd, shell=True) # qa-11x-ignore SEC-03: legacy wrapper isolated in container',
        'subprocess.run(cmd, shell=True) # qa-11x-ignore SEC-03: short',
        'eval(user_input)',
      ].join('\n')
    );

    const secAudit = await auditSecurityStigOwasp(projDir);
    expect(secAudit.passed).toBe(false);
    expect(secAudit.suppressed_findings_count).toBe(1);
    expect(secAudit.suppressed_findings?.[0]).toMatchObject({
      rule_id: 'SEC-03',
      line: 2,
    });
    expect(secAudit.external_sarif_files).toEqual(['.agents/.cache/sarif/a-semgrep.sarif']);
    expect(secAudit.findings.some((f) => f.rule_id === 'SEC-03' && f.line === 3)).toBe(true);
    expect(secAudit.findings.every((f) => f.confidence !== undefined)).toBe(true);

    const noSarifAudit = await auditSecurityStigOwasp(projDir, { ingestExternalSarif: false });
    expect(noSarifAudit.external_sarif_files).toBeUndefined();
  });

  it('runs external SARIF scanners (semgrep & trivy) strictly in serialized non-root Docker containers', async () => {
    const capturedCalls: Array<{ bin: string; args: readonly string[] }> = [];
    const mockExecOk = ((
      bin: string,
      args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      capturedCalls.push({ bin, args });
      writeText(
        path.join(projDir, DEFAULT_SARIF_CACHE_REL_DIR, 'semgrep.sarif'),
        JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'semgrep' } }, results: [] }] })
      );
      writeText(
        path.join(projDir, DEFAULT_SARIF_CACHE_REL_DIR, 'trivy.sarif'),
        JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'trivy' } }, results: [] }] })
      );
      cb(null, '', '');
    }) as unknown as typeof execFile;

    const semgrepRes = await runExternalSarifScannerInDocker(projDir, {
      scanner: 'semgrep',
      execFileFn: mockExecOk,
      guardrails: { lockDir: path.join(tmpRoot, 'locks'), maxConcurrent: 1, platform: 'darwin' },
    });
    expect(semgrepRes.status).toBe('PASSED');
    expect(capturedCalls[0]?.bin).toBe('docker');
    expect(capturedCalls[0]?.args).toEqual(
      expect.arrayContaining(['--rm', '--restart=no', '--network', 'none', PINNED_SEMGREP_SARIF_IMAGE])
    );

    const trivyRes = await runExternalSarifScannerInDocker(projDir, {
      scanner: 'trivy',
      execFileFn: mockExecOk,
      guardrails: { lockDir: path.join(tmpRoot, 'locks'), maxConcurrent: 1, platform: 'darwin' },
    });
    expect(trivyRes.status).toBe('PASSED');
    expect(capturedCalls[1]?.args).toContain(PINNED_TRIVY_SARIF_IMAGE);

    // Pre-flight thermal/memory block -> BLOCKED (exit 75)
    const memLowFile = path.join(tmpRoot, 'meminfo');
    writeText(memLowFile, 'MemTotal: 1000000 kB\nMemAvailable: 50000 kB\n');
    const blockedGuard = await runExternalSarifScannerInDocker(projDir, {
      scanner: 'trivy',
      execFileFn: mockExecOk,
      guardrails: {
        lockDir: path.join(tmpRoot, 'locks'),
        platform: 'linux',
        meminfoPath: memLowFile,
      },
    });
    expect(blockedGuard.status).toBe('BLOCKED');
    expect(blockedGuard.exit_code).toBe(75);

    // Docker ENOENT -> BLOCKED
    const mockEnoent = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }), '', '');
    }) as unknown as typeof execFile;
    const enoentRes = await runExternalSarifScannerInDocker(projDir, {
      scanner: 'semgrep',
      execFileFn: mockEnoent,
      guardrails: { lockDir: path.join(tmpRoot, 'locks'), platform: 'darwin' },
    });
    expect(enoentRes.status).toBe('BLOCKED');
    expect(enoentRes.summary).toContain('[RULE-ZERO]');
  });

  it('verifies TDD expect_red (RED stamp exempt from BREAKER-42 vs tautology block) and certify CLI unit flags', async () => {
    writeText(path.join(projDir, 'Makefile'), 'qa-unit:\n\t@echo test\n');
    fs.mkdirSync(path.join(projDir, '.git'), { recursive: true });
    writeText(path.join(projDir, 'src', 'calc.ts'), 'export const x = 1;\n');
    const mockGitSync = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.includes('status')) return ' M src/calc.ts\n';
      if (cmd === 'git' && args?.[0] === 'rev-parse') return '11223344\n';
      return '';
    }) as unknown as typeof execFileSync;

    // 1. Tautological test (0 failures under expectRed: true) -> FAILED with [TDD-TAUTOLOGY]
    const mockPass = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(null, 'All files | 100 | 100 | 100 | 100 |\n3 passed', '');
    }) as unknown as typeof execFile;

    const tautology = await runEphemeralQa(projDir, 'unit', 30, {
      expectRed: true,
      execFileFn: mockPass,
      execFileSyncFn: mockGitSync,
    });
    expect(tautology.status).toBe('FAILED');
    expect(tautology.red_phase_verified).toBe(false);
    expect(tautology.tail_log).toContain('[TDD-TAUTOLOGY]');

    // 2. Expected RED failure -> red_phase_verified=true, stamps red_verified, 0 BREAKER-42 trigger even after 3 runs
    const mockRedFail = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(Object.assign(new Error('fail'), { code: 1 }), 'FAIL tests/calc.unit.ts > adds numbers', '');
    }) as unknown as typeof execFile;

    for (let i = 0; i < 3; i += 1) {
      const redRun = await runEphemeralQa(projDir, 'unit', 30, {
        expectRed: true,
        execFileFn: mockRedFail,
        execFileSyncFn: mockGitSync,
      });
      expect(redRun.red_phase_verified).toBe(true);
      expect(redRun.exit_code).not.toBe(42);
    }

    const evDoc = JSON.parse(fs.readFileSync(path.join(projDir, QA_EVIDENCE_REL_PATH), 'utf8')) as {
      red_verified?: Record<string, { failed_count: number }>;
    };
    expect(evDoc.red_verified?.unit?.failed_count).toBeGreaterThanOrEqual(1);
    recordRedPhaseEvidence(projDir, 'unit', 0, mockGitSync);
    expect(checkUnitEvidenceForDirtyCode(projDir, mockGitSync).status).toBe('FAILED');

    // 3. CLI certify --no-require-unit-evidence & --require-unit-evidence flags
    writeText(path.join(projDir, 'TESTING.md'), '# Testing\nCoverage >= 95%\n');
    writeText(path.join(projDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Item\n');
    writeText(path.join(projDir, 'SECURITY.md'), '# Security\n');
    writeText(path.join(projDir, '.npmrc'), 'ignore-scripts=true\n');
    writeText(
      path.join(projDir, 'graphify-out', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'src/app.ts', source_file: 'src/app.ts' }], links: [] })
    );
    const cliOptOut = await runCertifyCli(
      [projDir, '--no-require-lint-evidence', '--no-require-unit-evidence', '--offline', '--json'],
      { cwd: projDir, homeDir }
    );
    expect(cliOptOut.exitCode).toBe(0);

    const cliExplicitReq = await runCertifyCli(
      [projDir, '--require-lint-evidence', '--require-unit-evidence', '--offline', '--json'],
      { cwd: projDir, homeDir }
    );
    expect(cliExplicitReq.exitCode).toBe(0);
    const dirtyBlocked = await certify11xGate(projDir, {
      requireLintEvidence: true,
      requireUnitEvidence: true,
      execFileSyncFn: mockGitSync,
    });
    expect(dirtyBlocked.gate_passed).toBe(false);
    expect(dirtyBlocked.checks.unit_evidence_verified).toBe(false);
    expect(await certify11xGate(projDir, { requireLintEvidence: false, requireUnitEvidence: false })).toBeDefined();
  });

  it('supports --toolset core|auto|full across server, index CLI dispatch, and mcp-config', async () => {
    expect(parseToolsetMode()).toBe('full');
    expect(parseToolsetMode('CORE')).toBe('core');
    expect(parseToolsetMode('auto')).toBe('auto');
    expect(() => parseToolsetMode('invalid')).toThrow(/Modo --toolset inválido/);

    expect(resolveAllowedToolNames('full', projDir)).toBeNull();
    expect(resolveAllowedToolNames('core', projDir)?.size).toBe(CORE_TOOLSET_NAMES.size);

    // Populate workspace markers for auto mode
    writeText(path.join(projDir, '.lovable', 'meta'), '1');
    fs.mkdirSync(path.join(projDir, 'architecture'), { recursive: true });
    writeText(path.join(projDir, 'promptfooconfig.yaml'), 'prompts: []\n');
    writeText(path.join(projDir, '.qa-11x.json'), '{"tier":"standard"}\n');

    const autoAllowed = resolveAllowedToolNames('auto', projDir);
    expect(autoAllowed?.has('audit_vibe_prototype')).toBe(true);
    expect(autoAllowed?.has('validate_calm_architecture')).toBe(true);
    expect(autoAllowed?.has('evaluate_agent_trajectory')).toBe(true);
    expect(autoAllowed?.has('run_llm_red_team')).toBe(true);
    expect(autoAllowed?.has('evaluate_release_gate')).toBe(true);
    expect(autoAllowed?.has('sync_enterprise_tms')).toBe(true);
    expect(autoAllowed?.has('init_or_append_agents_md')).toBe(true);
    expect(autoAllowed?.has('reconcile_agents_governance')).toBe(true);
    expect(autoAllowed?.has('propose_skill_evolution_pr')).toBe(true);

    const coreServer = createConfiguredMcpServer({ toolset: 'core', projectPath: projDir });
    expect(coreServer.counts.tools).toBe(13);
    expect(coreServer.counts.resources).toBe(13);

    const autoServer = createConfiguredMcpServer({ toolset: 'auto', projectPath: projDir });
    expect(autoServer.counts.tools).toBe(19);

    const fullServer = createConfiguredMcpServer({ toolset: 'full', projectPath: projDir });
    expect(fullServer.counts.tools).toBe(20);

    expect(await dispatchCliArgs(['--stdio', '--toolset', 'core'])).toBe('stdio-forced');
    expect(process.env.QA_11X_TOOLSET).toBe('core');
    expect(await dispatchCliArgs(['--toolset=auto'])).toBe('stdio');
    expect(process.env.QA_11X_TOOLSET).toBe('auto');
    await expect(dispatchCliArgs(['--stdio', '--toolset'])).rejects.toThrow(/requiere un valor/);

    const cursorCfg = runMcpConfigCli(['--client', 'cursor', '--toolset', 'core', '--json'], {
      homeDir,
      platform: 'linux',
    });
    expect(cursorCfg.exitCode).toBe(0);
    const parsedCursorCfg = JSON.parse(cursorCfg.output) as { snippet: string };
    expect(parsedCursorCfg.snippet).toContain('"--toolset"');
    expect(parsedCursorCfg.snippet).toContain('"core"');

    const codexInstall = runMcpConfigCli(
      ['--client', 'codex', '--toolset', 'auto', '--install'],
      { homeDir, platform: 'linux' }
    );
    expect(codexInstall.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(homeDir, '.codex', 'config.toml'), 'utf8')).toContain(
      '"--toolset", "auto"'
    );
  });

  it('covers 100% edge branches across companionMcpDetector, sarifIngester, externalScannerRunner, toolsetFilter, qa-evidence & suppressions', async () => {
    // 1. companionMcpDetector unreadable file catch
    const unreadableCfg = path.join(homeDir, '.cursor', 'mcp.json');
    writeText(unreadableCfg, '{"mcpServers":{"semgrep":{}}}');
    fs.chmodSync(unreadableCfg, 0o000);
    try {
      const compRes = detectCompanionMcps(homeDir, 'linux');
      expect(compRes.detected_any).toBe(false);
    } finally {
      fs.chmodSync(unreadableCfg, 0o600);
    }

    // 2. toolsetFilter empty whitespace, package.json/pyproject.toml markers & unreadable directories
    expect(parseToolsetMode('   ')).toBe('full');
    const pkgProj = path.join(tmpRoot, 'pkg-markers');
    writeText(path.join(pkgProj, 'package.json'), '{"dependencies":{"lovable-tagger":"1.0","promptfoo":"1.0"}}');
    writeText(path.join(pkgProj, 'pyproject.toml'), 'dependencies = ["deepeval"]\n');
    const markerTools = resolveAllowedToolNames('auto', pkgProj);
    expect(markerTools?.has('audit_vibe_prototype')).toBe(true);
    expect(markerTools?.has('evaluate_agent_trajectory')).toBe(true);
    expect(markerTools?.has('propose_skill_evolution_pr')).toBe(true);
    expect(markerTools?.has('validate_calm_architecture')).toBe(false);

    const pyOnlyProj = path.join(tmpRoot, 'py-deepeval-only');
    writeText(path.join(pyOnlyProj, 'pyproject.toml'), 'dependencies = ["deepeval"]\n');
    writeText(path.join(pyOnlyProj, 'AGENTS.md'), '# Agents\n');
    const pyOnlyTools = resolveAllowedToolNames('auto', pyOnlyProj);
    expect(pyOnlyTools?.has('evaluate_agent_trajectory')).toBe(true);
    expect(pyOnlyTools?.has('propose_skill_evolution_pr')).toBe(true);
    expect(pyOnlyTools?.has('reconcile_agents_governance')).toBe(true);
    expect(pyOnlyTools?.has('init_or_append_agents_md')).toBe(true);

    const agentsDirProj = path.join(tmpRoot, 'agents-dir-only');
    fs.mkdirSync(path.join(agentsDirProj, '.agents'), { recursive: true });
    const agentsDirTools = resolveAllowedToolNames('auto', agentsDirProj);
    expect(agentsDirTools?.has('propose_skill_evolution_pr')).toBe(true);

    const unreadableMarkers = path.join(tmpRoot, 'unreadable-markers');
    fs.mkdirSync(path.join(unreadableMarkers, 'package.json'), { recursive: true });
    fs.mkdirSync(path.join(unreadableMarkers, 'pyproject.toml'), { recursive: true });
    expect(resolveAllowedToolNames('auto', unreadableMarkers)?.size).toBe(CORE_TOOLSET_NAMES.size);

    // 3. sarifIngester engines (trivy, codeql, bandit, custom), shortDescription, CVSS < 4, bad URI, NUL, symlink dir & file-as-dir
    const sarifProj = path.join(tmpRoot, 'sarif-edges');
    const sarifDir = path.join(sarifProj, DEFAULT_SARIF_CACHE_REL_DIR);
    fs.mkdirSync(sarifDir, { recursive: true });
    writeText(
      path.join(sarifDir, 'multi.sarif'),
      JSON.stringify({
        version: '2.1.0',
        runs: [
          null,
          {
            tool: {
              driver: {
                name: 'Trivy',
                rules: [
                  {},
                  { id: 'CVE-1', shortDescription: { text: 'Upgrade base image' }, properties: { 'security-severity': 2.5 } },
                ],
              },
            },
            results: [
              null,
              {
                ruleId: 'CVE-1',
                locations: [{ physicalLocation: { artifactLocation: { uri: '%E0%A4%A' } } }],
              },
              {
                locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a\0b.ts' } } }],
              },
            ],
          },
          { tool: { driver: { name: 'CodeQL' } }, results: [{ ruleId: 'cql-1', level: 'error' }] },
          { tool: { driver: { name: 'Bandit' } }, results: [{ ruleId: 'B101', level: 'warning' }] },
          { tool: { driver: { name: 'Custom Scanner!' } }, results: [{ ruleId: 'cs-1', level: 'note' }] },
          { tool: { driver: {} }, results: [{ ruleId: 'fallback-stem', level: 'note' }] },
        ],
      })
    );
    const multiSummary = ingestExternalSarifReports(sarifProj);
    expect(multiSummary.files_ingested).toHaveLength(1);
    expect(multiSummary.findings.some((f) => f.source === 'trivy' && f.severity === 'LOW')).toBe(true);
    expect(multiSummary.findings.some((f) => f.source === 'codeql')).toBe(true);
    expect(multiSummary.findings.some((f) => f.source === 'bandit')).toBe(true);
    expect(multiSummary.findings.some((f) => f.source === 'custom-scanner')).toBe(true);
    expect(multiSummary.findings.some((f) => f.source === 'multi')).toBe(true);

    // Non-directory file at .agents/.cache/sarif
    const fileDirProj = path.join(tmpRoot, 'sarif-file-dir');
    writeText(path.join(fileDirProj, DEFAULT_SARIF_CACHE_REL_DIR), 'not-a-dir');
    expect(ingestExternalSarifReports(fileDirProj).skipped_files).toEqual([DEFAULT_SARIF_CACHE_REL_DIR]);

    // Symlinked .agents/.cache/sarif directory (both escaping workspace and internal symlink)
    const symDirProj = path.join(tmpRoot, 'sarif-sym-dir');
    const symOutside = path.join(tmpRoot, 'sarif-outside-dir');
    fs.mkdirSync(path.join(symDirProj, '.agents', '.cache'), { recursive: true });
    fs.mkdirSync(symOutside, { recursive: true });
    fs.symlinkSync(symOutside, path.join(symDirProj, DEFAULT_SARIF_CACHE_REL_DIR));
    expect(ingestExternalSarifReports(symDirProj).skipped_files).toEqual([DEFAULT_SARIF_CACHE_REL_DIR]);

    const symInternalProj = path.join(tmpRoot, 'sarif-sym-internal');
    const symInsideTarget = path.join(symInternalProj, '.agents', '.cache', 'real-sarif');
    fs.mkdirSync(symInsideTarget, { recursive: true });
    fs.symlinkSync(symInsideTarget, path.join(symInternalProj, DEFAULT_SARIF_CACHE_REL_DIR));
    expect(ingestExternalSarifReports(symInternalProj).skipped_files).toEqual([DEFAULT_SARIF_CACHE_REL_DIR]);

    // 4. security-auditor /* */ and <!-- --> suppression closers
    const supProj = path.join(tmpRoot, 'sup-closers');
    writeText(
      path.join(supProj, 'src', 'run.js'),
      'eval(userCmd); /* qa-11x-ignore SEC-03: sandboxed legacy expression evaluator */\n'
    );
    writeText(
      path.join(supProj, 'src', 'View.vue'),
      '<template>\n  <div v-html="rawHtml"></div><!-- qa-11x-ignore SEC-06: pre-escaped static trusted markup -->\n</template>\n'
    );
    const supAudit = await auditSecurityStigOwasp(supProj, { ingestExternalSarif: false });
    expect(supAudit.suppressed_findings_count).toBeGreaterThanOrEqual(2);

    // 5. externalScannerRunner: rulesRelDir, trivyCacheDir, codeql, explicit image, non-zero exit FAILED, slot timeout 124
    const scanProj = path.join(tmpRoot, 'ext-scan-edges');
    writeText(path.join(scanProj, 'semgrep-rules', 'local.yaml'), 'rules: []\n');
    fs.mkdirSync(path.join(scanProj, '.trivycache'), { recursive: true });
    fs.mkdirSync(path.join(scanProj, '.agents', '.cache', 'codeql-db'), { recursive: true });
    const mockFailExec = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(Object.assign(new Error('scanner exit 2'), { code: 2 }), '', 'findings detected');
    }) as unknown as typeof execFile;

    const semRulesRes = await runExternalSarifScannerInDocker(scanProj, {
      scanner: 'semgrep',
      image: 'custom/semgrep:1.0',
      rulesRelDir: 'semgrep-rules',
      execFileFn: mockFailExec,
      guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
    });
    expect(semRulesRes.status).toBe('FAILED');
    expect(semRulesRes.command_args).toContain('/rules');
    expect(semRulesRes.command_args).toContain('custom/semgrep:1.0');

    const trivyCacheRes = await runExternalSarifScannerInDocker(scanProj, {
      scanner: 'trivy',
      execFileFn: mockFailExec,
      guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
    });
    expect(trivyCacheRes.command_args).toContain('TRIVY_CACHE_DIR=/tmp/trivy-cache');

    const codeqlRes = await runExternalSarifScannerInDocker(scanProj, {
      scanner: 'codeql',
      execFileFn: mockFailExec,
      guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
    });
    expect(codeqlRes.command_args).toContain('database');
    expect(codeqlRes.command_args).toContain('analyze');

    // Busy lock -> slot timeout BLOCKED (124)
    const busyLockDir = path.join(tmpRoot, 'busy-locks');
    writeText(path.join(busyLockDir, 'qa-11x-docker-slot-1.lock'), JSON.stringify({ pid: process.pid }));
    const slotTimeout = await runExternalSarifScannerInDocker(scanProj, {
      scanner: 'semgrep',
      timeoutSeconds: 0.03,
      execFileFn: mockFailExec,
      guardrails: { lockDir: busyLockDir, maxConcurrent: 1, pollIntervalMs: 10, platform: 'darwin', isPidAliveFn: () => true },
    });
    expect(slotTimeout.status).toBe('BLOCKED');
    expect(slotTimeout.exit_code).toBe(124);

    // 6. qa-evidence recordRedPhaseEvidence non-git dir & unwritable evidence dir catch + expectRed timeout 124
    const noGitDir = path.join(tmpRoot, 'no-git-dir');
    fs.mkdirSync(noGitDir, { recursive: true });
    recordRedPhaseEvidence(noGitDir, 'unit', 2);

    const badEvDir = path.join(tmpRoot, 'bad-ev-dir');
    fs.mkdirSync(path.join(badEvDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(badEvDir, QA_EVIDENCE_REL_PATH), { recursive: true });
    const mockGitBad = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.includes('status')) return ' M a.ts\n';
      if (cmd === 'git' && args?.[0] === 'rev-parse') return 'deadbeef\n';
      return '';
    }) as unknown as typeof execFileSync;
    recordRedPhaseEvidence(badEvDir, 'unit', 1, mockGitBad);

    writeText(path.join(badEvDir, 'Makefile'), 'qa-unit:\n\t@echo slow\n');
    const mockTimeout = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(Object.assign(new Error('timeout'), { code: 124, killed: true }), '', '');
    }) as unknown as typeof execFile;
    const redTimeout = await runEphemeralQa(badEvDir, 'unit', 5, {
      expectRed: true,
      execFileFn: mockTimeout,
      execFileSyncFn: mockGitBad,
    });
    expect(redTimeout.exit_code).toBe(124);

    // 7. Review remediation tests: expectRed forwarded through missing-Makefile Docker fallback, image/bind-mount injection guards, scoped SARIF findings, local .semgrep rules, and doctor text Companion MCPs
    const noMakeProj = path.join(tmpRoot, 'nomake-red');
    writeText(
      path.join(noMakeProj, 'docker-compose.qa.yml'),
      'services:\n  qa-python:\n    image: sinfallas/base-python-uv:3.15\n'
    );
    writeText(path.join(noMakeProj, 'pyproject.toml'), '[project]\nname = "demo"\n');
    const mockFallbackPass = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(null, '3 passed in 0.1s\nTOTAL 100 0 100%', '');
    }) as unknown as typeof execFile;
    const fallbackTautology = await runEphemeralQa(noMakeProj, 'unit', 30, {
      expectRed: true,
      execFileFn: mockFallbackPass,
      execFileSyncFn: mockGitBad,
    });
    expect(fallbackTautology.status).toBe('FAILED');
    expect(fallbackTautology.red_phase_verified).toBe(false);
    expect(fallbackTautology.tail_log).toContain('[TDD-TAUTOLOGY]');

    await expect(
      runExternalSarifScannerInDocker(scanProj, {
        scanner: 'semgrep',
        image: '--privileged alpine',
        execFileFn: mockFailExec,
        guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
      })
    ).rejects.toThrow(/imagen Docker inválida/);

    await expect(
      runExternalSarifScannerInDocker(scanProj, {
        scanner: 'trivy',
        trivyCacheDir: '/tmp/cache:/etc:rw',
        execFileFn: mockFailExec,
        guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
      })
    ).rejects.toThrow(/trivyCacheDir insegura/);

    // Local .semgrep/.semgrep.yml auto-detection + scoped findings_count ignoring unrelated .sarif
    const scopedProj = path.join(tmpRoot, 'scoped-sarif');
    writeText(path.join(scopedProj, '.semgrep.yml'), 'rules: []\n');
    writeText(
      path.join(scopedProj, DEFAULT_SARIF_CACHE_REL_DIR, 'trivy.sarif'),
      JSON.stringify({
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'trivy' } }, results: [{ ruleId: 'CVE-9', level: 'error' }] }],
      })
    );
    const mockEmptySemgrep = ((
      _bin: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      writeText(
        path.join(scopedProj, DEFAULT_SARIF_CACHE_REL_DIR, 'semgrep.sarif'),
        JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'semgrep' } }, results: [] }] })
      );
      cb(null, '', '');
    }) as unknown as typeof execFile;
    const scopedRes = await runExternalSarifScannerInDocker(scopedProj, {
      scanner: 'semgrep',
      execFileFn: mockEmptySemgrep,
      guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
    });
    expect(scopedRes.command_args).toContain('/workspace/.semgrep.yml');
    expect(scopedRes.findings_count).toBe(0);

    const dotSemgrepDirProj = path.join(tmpRoot, 'scoped-semgrep-dir');
    fs.mkdirSync(path.join(dotSemgrepDirProj, '.semgrep'), { recursive: true });
    const dirSemRes = await runExternalSarifScannerInDocker(dotSemgrepDirProj, {
      scanner: 'semgrep',
      execFileFn: mockEmptySemgrep,
      guardrails: { lockDir: path.join(tmpRoot, 'locks2'), platform: 'darwin' },
    });
    expect(dirSemRes.command_args).toContain('/workspace/.semgrep');

    // Doctor text output includes Companion MCPs summary
    const compHome = path.join(tmpRoot, 'comp-home');
    writeText(
      path.join(compHome, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { semgrep: { command: 'uvx', args: ['semgrep-mcp'] } } })
    );
    const docText = await runDoctorCli([projDir, '--offline'], {
      cwd: projDir,
      homeDir: compHome,
      dockerProbeFn: () => '27.5.1',
    });
    expect(docText.exitCode).toBe(0);
    expect(docText.output).toContain('Companion MCPs: semgrep');
  });
});
