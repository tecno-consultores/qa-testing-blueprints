// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_HELP_TEXT, runAuditCli } from '../src/cli/audit-cli.js';
import { CERTIFY_HELP_TEXT, runCertifyCli } from '../src/cli/certify-cli.js';
import { runCli } from '../src/cli.js';
import { MCP_SERVER_VERSION } from '../src/services/github-fetcher.js';
import { buildSarifLog, severityToSarifLevel } from '../src/utils/sarifFormatter.js';

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function buildValidCalmDoc(): Record<string, unknown> {
  const requiredControls = [
    'prompt-injection-guard',
    'rule-zero-ephemeral-docker',
    'postgres-rls-isolation',
    'worm-hmac-audit-chain',
    'vault-aes-256-gcm',
    'git-closure-human-gate',
    'cli-tty-anti-hang-guard',
  ];
  return {
    $schema: 'https://calm.finos.org/release/1.2/meta/calm.json',
    nodes: [
      { 'unique-id': 'qa-11x-ai-ide-host', 'node-type': 'actor', name: 'IDE', description: 'Host' },
      { 'unique-id': 'mcp-qa-11x-server', 'node-type': 'service', name: 'MCP', description: 'Server' },
      { 'unique-id': 'ephemeral-docker-runners', 'node-type': 'system', name: 'Docker', description: 'Rule Zero' },
      { 'unique-id': 'postgres17-rls-store', 'node-type': 'database', name: 'PG17', description: 'RLS' },
      { 'unique-id': 'keydb-state-cache', 'node-type': 'database', name: 'KeyDB', description: 'Cache' },
      { 'unique-id': 'governance-certification-gate', 'node-type': 'service', name: 'Gate', description: '10/10' },
    ],
    relationships: [
      { 'unique-id': 'r1', 'relationship-type': { connects: { source: { node: 'qa-11x-ai-ide-host' }, destination: { node: 'mcp-qa-11x-server' } } } },
      { 'unique-id': 'r2', 'relationship-type': { connects: { source: { node: 'mcp-qa-11x-server' }, destination: { node: 'ephemeral-docker-runners' } } } },
      { 'unique-id': 'r3', 'relationship-type': { connects: { source: { node: 'ephemeral-docker-runners' }, destination: { node: 'postgres17-rls-store' } } } },
      { 'unique-id': 'r4', 'relationship-type': { connects: { source: { node: 'ephemeral-docker-runners' }, destination: { node: 'keydb-state-cache' } } } },
      { 'unique-id': 'r5', 'relationship-type': { connects: { source: { node: 'mcp-qa-11x-server' }, destination: { node: 'governance-certification-gate' } } } },
    ],
    controls: Object.fromEntries(
      requiredControls.map((id, idx) => [
        id,
        {
          description: `Control ${id}`,
          requirements: [
            {
              'requirement-url': 'https://calm.finos.org/release/1.2/meta/control-requirement.json',
              config: { 'control-id': `QA-${idx + 1}`, name: id, description: `Desc ${id}` },
            },
          ],
        },
      ])
    ),
  };
}

function seedCleanCertifyProject(projDir: string, withGraph = true): void {
  writeFile(path.join(projDir, 'TESTING.md'), '# Testing\n');
  writeFile(path.join(projDir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Initial.\n');
  if (withGraph) {
    writeFile(path.join(projDir, 'graphify-out', 'graph.json'), '{"directed":true,"nodes":[],"links":[]}');
  }
}

describe('SARIF Formatter, Certify & Audit CLI Subcommands (QA-11X)', () => {
  let tmpRoot: string;
  let homeDir: string;
  let projDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-cert-aud-'));
    homeDir = path.join(tmpRoot, 'home');
    projDir = path.join(tmpRoot, 'project');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('sarifFormatter', () => {
    it('maps all 5 severities, deduplicates rules, redacts secrets, normalizes URIs, and falls back line to 1', () => {
      expect(severityToSarifLevel('CRITICAL')).toBe('error');
      expect(severityToSarifLevel('HIGH')).toBe('error');
      expect(severityToSarifLevel('MEDIUM')).toBe('warning');
      expect(severityToSarifLevel('LOW')).toBe('note');
      expect(severityToSarifLevel('INFO')).toBe('note');

      const syntheticOpenAi = ['sk', 'proj', 'dummyabcdefghijklmnopqrstuvwxyz1234'].join('-');
      const syntheticGhToken = ['ghp', 'dummy1234567890abcdef1234567890'].join('_');
      const sarif = buildSarifLog([
        {
          ruleId: 'SEC-10',
          severity: 'CRITICAL',
          message: `Leak ${syntheticOpenAi}`,
          file: './src\\auth\\vault.ts',
          line: 42.9,
          remediation: `Remove token ${syntheticGhToken}`,
        },
        {
          ruleId: 'SEC-10',
          severity: 'HIGH',
          message: 'Second occurrence without remediation',
          file: '   ',
          line: 0,
        },
        {
          ruleId: 'INFO-01',
          severity: 'INFO',
          message: 'Informational note',
          file: 'README.md',
        },
      ]);

      expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
      expect(sarif.version).toBe('2.1.0');
      const run = (sarif.runs as Array<Record<string, unknown>>)[0] as {
        tool: { driver: { name: string; version: string; rules: Array<Record<string, unknown>> } };
        results: Array<Record<string, unknown>>;
      };
      expect(run.tool.driver.name).toBe('@sinfallas/mcp-qa-11x');
      expect(run.tool.driver.version).toBe(MCP_SERVER_VERSION);
      expect(run.tool.driver.rules).toHaveLength(2);
      expect(run.results).toHaveLength(3);

      const first = run.results[0] as {
        message: { text: string };
        locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }>;
        properties: { remediation?: string };
      };
      expect(first.message.text).toContain('[REDACTED_SECRET]');
      expect(first.message.text).not.toContain('abcdefghijklmnopqrstuvwxyz1234');
      expect(first.properties.remediation).toContain('[REDACTED_SECRET]');
      expect(first.locations[0]?.physicalLocation.artifactLocation.uri).toBe('src/auth/vault.ts');
      expect(first.locations[0]?.physicalLocation.region.startLine).toBe(42);

      const second = run.results[1] as {
        locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }>;
        properties: { remediation?: string };
      };
      expect(second.locations[0]?.physicalLocation.artifactLocation.uri).toBe('.');
      expect(second.locations[0]?.physicalLocation.region.startLine).toBe(1);
      expect(second.properties.remediation).toBeUndefined();

      const custom = buildSarifLog(
        [{ ruleId: 'R1', severity: 'LOW', message: 'msg', file: 'a.ts', line: -5 }],
        { toolName: 'custom-tool', toolVersion: '1.2.3', informationUri: 'https://example.org' }
      );
      const customDriver = ((custom.runs as Array<{ tool: { driver: Record<string, unknown> } }>)[0])?.tool.driver;
      expect(customDriver?.name).toBe('custom-tool');
      expect(customDriver?.version).toBe('1.2.3');
      expect(customDriver?.informationUri).toBe('https://example.org');
    });
  });

  describe('certify subcommand', () => {
    it('returns help and rejects invalid options/positionals cleanly', async () => {
      expect((await runCertifyCli(['--help'])).output).toBe(CERTIFY_HELP_TEXT);
      expect((await runCertifyCli(['-h'])).exitCode).toBe(0);

      const badFlag = await runCertifyCli(['--bad-flag'], { cwd: projDir, homeDir });
      expect(badFlag.exitCode).toBe(1);
      expect(badFlag.isError).toBe(true);
      expect(badFlag.output).toContain('❌ [certify]');

      const extraPos = await runCertifyCli([projDir, tmpRoot], { cwd: projDir, homeDir });
      expect(extraPos.exitCode).toBe(1);
      expect(extraPos.isError).toBe(true);

      const missingJunit = await runCertifyCli(['--junit-xml'], { cwd: projDir, homeDir });
      expect(missingJunit.exitCode).toBe(1);
      expect(missingJunit.isError).toBe(true);
    });

    it('returns exitCode=1 on hard blockers, exitCode=20 on --strict skipped checks, and exitCode=0 when clean', async () => {
      // Missing TESTING.md & CHANGELOG.md -> hard blocker exitCode=1
      const hardFail = await runCertifyCli(['-p', projDir, '--offline'], { cwd: tmpRoot, homeDir });
      expect(hardFail.exitCode).toBe(1);
      expect(hardFail.output).toContain('❌ [Fail-Verbose]');
      expect(hardFail.output).toContain('- blocker:');

      // Seed docs WITHOUT graphify-out -> ast_topology_clean is SKIPPED -> --strict exits 20
      seedCleanCertifyProject(projDir, false);
      const strictFail = await runCertifyCli(
        [projDir, '--strict', '--allow-unmerged-examples', '--offline'],
        { cwd: projDir, homeDir }
      );
      expect(strictFail.exitCode).toBe(20);
      expect(strictFail.output).toContain('STRICT_SKIPPED_CHECK:');

      // Seed graphify-out -> clean pass exitCode=0 + update notice when online mock returns 99.0.0
      seedCleanCertifyProject(projDir, true);
      const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 })
      );
      const cleanPass = await runCertifyCli(
        [projDir, '--require-lint-evidence', '--allow-unmerged-examples'],
        { cwd: projDir, homeDir, fetchFn: fetchSpy }
      );
      expect(cleanPass.exitCode).toBe(0);
      expect(cleanPass.output).toContain('✔ [Pass-Quiet]');
      expect(cleanPass.output).toContain('Actualización:');

      const jsonPass = await runCertifyCli(
        [projDir, '--allow-unmerged-examples', '--offline', '--json'],
        { cwd: projDir, homeDir }
      );
      expect(jsonPass.exitCode).toBe(0);
      expect(JSON.parse(jsonPass.output)).toMatchObject({
        exit_code: 0,
        certify: { gate_passed: true },
      });
    });

    it('evaluates --release-gate (NO_GO -> exitCode=30 and GO -> exitCode=0) and cli.ts routing', async () => {
      seedCleanCertifyProject(projDir, true);
      writeFile(
        path.join(projDir, 'reports', 'fail.xml'),
        '<testsuite name="s" tests="1" failures="1" errors="0" skipped="0"><testcase name="t1"><failure message="boom"/></testcase></testsuite>'
      );
      writeFile(
        path.join(projDir, 'reports', 'pass.xml'),
        '<testsuite name="s" tests="1" failures="0" errors="0" skipped="0"><testcase name="t1"/></testsuite>'
      );

      const noGoWithoutJunit = await runCertifyCli(
        [projDir, '--allow-unmerged-examples', '--release-gate', '--offline'],
        { homeDir }
      );
      expect(noGoWithoutJunit.exitCode).toBe(30);
      expect(noGoWithoutJunit.output).toContain('ZERO_TESTS_EXECUTED');

      const noGoRes = await runCertifyCli(
        [projDir, '--allow-unmerged-examples', '--release-gate', '--junit-xml', 'reports/fail.xml', '--offline'],
        { cwd: projDir, homeDir }
      );
      expect(noGoRes.exitCode).toBe(30);
      expect(noGoRes.output).toContain('release_gate:');

      const goRes = await runCertifyCli(
        [projDir, '--allow-unmerged-examples', '--release-gate', '--junit-xml', 'reports/pass.xml', '--offline', '--json'],
        { cwd: projDir, homeDir }
      );
      expect(goRes.exitCode).toBe(0);
      const goJson = JSON.parse(goRes.output) as { exit_code: number; release_gate?: { decision: string } };
      expect(goJson.exit_code).toBe(0);
      expect(goJson.release_gate?.decision).toBe('GO');

      const goText = await runCertifyCli(
        [projDir, '--allow-unmerged-examples', '--release-gate', '--junit-xml', 'reports/pass.xml', '--offline'],
        { cwd: projDir, homeDir }
      );
      expect(goText.exitCode).toBe(0);
      expect(goText.output).toContain('release=GO');

      const logs: string[] = [];
      const cliRes = await runCli(
        ['certify', projDir, '--allow-unmerged-examples', '--offline', '--json'],
        { cwd: projDir, homeDir, log: (m) => logs.push(m) }
      );
      expect(cliRes.exitCode).toBe(0);
      expect(cliRes.command).toBe('certify');
      expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ exit_code: 0 });
    });
  });

  describe('audit subcommand', () => {
    it('returns help and rejects invalid modes, formats, fail-on levels, max-findings, and unknown flags', async () => {
      expect((await runAuditCli(['--help'])).output).toBe(AUDIT_HELP_TEXT);
      expect((await runAuditCli(['-h'])).exitCode).toBe(0);

      for (const badArgs of [
        ['--mode', 'unknown'],
        ['--format', 'xml'],
        ['--fail-on', 'low'],
        ['--max-findings', '0'],
        ['--max-findings', 'abc'],
        ['--unknown-flag'],
        [projDir, tmpRoot],
      ]) {
        const res = await runAuditCli(badArgs, { cwd: projDir });
        expect(res.exitCode).toBe(1);
        expect(res.isError).toBe(true);
        expect(res.output).toContain('❌ [audit]');
      }
    });

    it('runs security mode with --include-examples, --max-findings, --sarif, and all --fail-on levels', async () => {
      writeFile(path.join(projDir, 'src', 'app.py'), 'from fastapi import FastAPI\napp = FastAPI()\n');
      const medOnlyCrit = await runAuditCli(
        ['-p', projDir, '--mode', 'security', '--fail-on', 'critical'],
        { cwd: tmpRoot }
      );
      expect(medOnlyCrit.exitCode).toBe(0);
      const medOnlyHigh = await runAuditCli(
        ['-p', projDir, '--mode', 'security', '--fail-on', 'high'],
        { cwd: tmpRoot }
      );
      expect(medOnlyHigh.exitCode).toBe(0);
      const medFail = await runAuditCli(
        ['-p', projDir, '--mode', 'security', '--fail-on', 'medium'],
        { cwd: tmpRoot }
      );
      expect(medFail.exitCode).toBe(1);

      // Add HIGH + CRITICAL + .example finding
      writeFile(path.join(projDir, 'src', 'dom.ts'), 'export function render(el: HTMLElement, h: string) { el.innerHTML = h; }\n');
      writeFile(path.join(projDir, 'src', 'loader.py'), 'import pickle\ndef load(b): return pickle.loads(b)\n');
      writeFile(path.join(projDir, 'src', 'bad.py.example'), 'import os\nos.system("id")\n');

      const highFail = await runAuditCli(
        [projDir, '-m', 'security', '--fail-on', 'high', '-f', 'json'],
        { cwd: tmpRoot }
      );
      expect(highFail.exitCode).toBe(1);
      const withoutEx = JSON.parse(highFail.output) as {
        security: { findings: Array<{ file: string }> };
      };
      expect(withoutEx.security.findings.some((f) => f.file.endsWith('.example'))).toBe(false);

      const withExSarif = await runAuditCli(
        [projDir, '--mode', 'security', '--include-examples', '--max-findings', '2', '--fail-on', 'none', '--sarif'],
        { cwd: tmpRoot }
      );
      expect(withExSarif.exitCode).toBe(0);
      const sarif = JSON.parse(withExSarif.output) as {
        $schema: string;
        version: string;
        runs: Array<{ results: unknown[] }>;
      };
      expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs[0]?.results).toHaveLength(2);

      const critFail = await runAuditCli(
        [projDir, '--mode', 'security', '--fail-on', 'critical'],
        { cwd: tmpRoot }
      );
      expect(critFail.exitCode).toBe(1);
    });

    it('runs pyramid, vibe, calm (valid vs invalid), and all (SKIPPED vs evaluated) modes', async () => {
      // Seed pyramid, vibe, and security gaps without CALM file first
      writeFile(path.join(projDir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.5.0' } }));
      writeFile(path.join(projDir, 'vue3', 'src', 'views', 'DashView.vue'), '<template><div/></template>\n');
      writeFile(path.join(projDir, 'fastapi', 'pyproject.toml'), '[project]\ndependencies = ["fastapi"]\n');
      writeFile(
        path.join(projDir, 'fastapi', 'src', 'routes.py'),
        'from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("/items")\ndef list_items(): return []\n'
      );
      writeFile(path.join(projDir, 'src', 'orphan.ts'), 'export const bad: any = 1;\n');

      const allSkipped = await runAuditCli([projDir, '--mode', 'all', '--fail-on', 'none'], { cwd: tmpRoot });
      expect(allSkipped.exitCode).toBe(0);
      expect(allSkipped.output).toContain('security:');
      expect(allSkipped.output).toContain('pyramid:');
      expect(allSkipped.output).toContain('vibe:');
      expect(allSkipped.output).toContain('calm: status=SKIPPED | violations=0');

      const pyramidSarif = await runAuditCli(
        [projDir, '--mode', 'pyramid', '--fail-on', 'any', '--sarif'],
        { cwd: tmpRoot }
      );
      expect(pyramidSarif.exitCode).toBe(1);
      expect(pyramidSarif.output).toContain('PYRAMID-');

      const vibeJson = await runAuditCli(
        [projDir, '--mode', 'vibe', '--fail-on', 'medium', '--json'],
        { cwd: tmpRoot }
      );
      expect(vibeJson.exitCode).toBe(1);
      expect(vibeJson.output).toContain('VIBE-TYPE-003');

      // CALM failing path
      const calmFail = await runAuditCli(
        [projDir, '--mode', 'calm', '--architecture-path', 'architecture/missing.calm.json', '--sarif', '--fail-on', 'none'],
        { cwd: tmpRoot }
      );
      expect(calmFail.exitCode).toBe(0);
      expect(calmFail.output).toContain('CALM-FILE_NOT_FOUND');

      // Seed valid CALM architecture and re-run --mode all
      writeFile(
        path.join(projDir, 'architecture', 'qa-11x.calm.json'),
        JSON.stringify(buildValidCalmDoc(), null, 2)
      );
      const calmOk = await runAuditCli([projDir, '--mode', 'calm'], { cwd: tmpRoot });
      expect(calmOk.exitCode).toBe(0);
      expect(calmOk.output).toContain('calm: status=PASSED');

      const allWithCalm = await runAuditCli(
        [projDir, '--mode', 'all', '--fail-on', 'none', '--json'],
        { cwd: tmpRoot }
      );
      expect(allWithCalm.exitCode).toBe(0);
      expect((JSON.parse(allWithCalm.output) as { calm_status: string }).calm_status).toBe('PASSED');

      // Clean directory with --fail-on any passes with exitCode=0
      const emptyWs = path.join(tmpRoot, 'empty-ws');
      fs.mkdirSync(emptyWs, { recursive: true });
      const logs: string[] = [];
      const cliAudit = await runCli(
        ['audit', emptyWs, '--mode', 'security', '--fail-on', 'any', '--json'],
        { cwd: emptyWs, log: (m) => logs.push(m) }
      );
      expect(cliAudit.exitCode).toBe(0);
      expect(cliAudit.command).toBe('audit');
      expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ exit_code: 0 });
    });
  });
});
