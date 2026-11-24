// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileAgentsGovernance } from '../src/cli/reconcile-agents.js';
import { detectDirectExecution } from '../src/index.js';
import { parseQaOutput } from '../src/parsers/output-parsers.js';
import { assertNoSymlinkSegments } from '../src/security/pathRealResolver.js';
import { inspectPromptSafety, redactPiiAndSecrets } from '../src/security/promptGuard.js';
import { normalizeForMatch } from '../src/security/workspacePathValidator.js';
import { safeChmodSync } from '../src/services/qa-evidence.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { pruneRetiredFilesInCanonicalSkillDirs } from '../src/services/version-manager.js';
import { auditVibePrototype } from '../src/tools/auditVibePrototype.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { evaluateAgentTrajectory } from '../src/tools/evaluateAgentTrajectory.js';
import { evaluateReleaseReadiness } from '../src/tools/evaluateReleaseGate.js';
import { AIDER_BRIDGE_END, AIDER_BRIDGE_START } from '../src/tools/initOrAppendAgentsMd.js';
import { runLlmRedTeam } from '../src/tools/runLlmRedTeam.js';
import { auditSecurityStigOwasp, isNonHttpNodeCliEntry } from '../src/tools/security-auditor.js';
import { runSessionFlightRecorder } from '../src/tools/sessionFlightRecorder.js';
import { auditTestPyramidGaps, findUntestedApiEndpoints } from '../src/tools/test-pyramid-auditor.js';
import { validateCalmArchitecture } from '../src/tools/validateCalmArchitecture.js';
import { formatFailVerboseReport } from '../src/utils/diagnosticFormatter.js';

describe('Wave 3 Audit Hardening Regression Suite (H1-H14)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-audit-hardening-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('H2/H3: fails closed on nonexistent dir and detects unquoted .env secrets + backslash QA-COV-01 continuations', async () => {
    await expect(auditSecurityStigOwasp(path.join(tmpDir, 'does-not-exist'))).rejects.toThrow(/no existe/i);

    const envKey = ['export DB_', 'PASS', 'WORD='].join('');
    const envVal = ['SuperSecret', 'RealProd99'].join('');
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      `${envKey}${envVal} # inline comment\nSAFE_TOKEN=placeholder_value_here\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'Makefile'),
      'qa-unit:\n\tdocker run --rm app pytest \\\n\t\t-o addopts="" tests/\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'index.ts'),
      '#!/usr/bin/env node\nconsole.log("pure cli");\n',
      'utf8'
    );
    const res = await auditSecurityStigOwasp(tmpDir);
    expect(res.findings.some((f) => f.rule_id === 'SEC-10' && f.file === '.env')).toBe(true);
    expect(res.findings.some((f) => f.rule_id === 'QA-COV-01')).toBe(true);
    expect(res.findings.some((f) => f.rule_id === 'SEC-08')).toBe(false);
  });

  it('H4/H5: redacts Slack xoxb- and GitLab glpat- tokens in promptGuard and diagnosticFormatter', () => {
    const slackTok = ['xoxb', '123456789012', '123456789012', 'abcdef123456'].join('-');
    const glTok = ['glpat', 'AbCdEf123456789012345678'].join('-');
    expect(redactPiiAndSecrets(`slack=${slackTok} gl=${glTok}`)).not.toContain('xoxb-');
    expect(redactPiiAndSecrets(`slack=${slackTok} gl=${glTok}`)).not.toContain('glpat-');

    const report = formatFailVerboseReport({
      stageId: 'unit',
      passed: false,
      command: 'pytest',
      exitCode: 1,
      durationMs: 12,
      stderr: `leaked ${slackTok} and ${glTok}`,
      remediationHint: 'fix',
    });
    expect(report).not.toContain('xoxb-');
    expect(report).not.toContain('glpat-');
    expect(inspectPromptSafety('normal code').safe).toBe(true);
  });

  it('H6: fails evaluateQaStatus on CRITICAL/HIGH alerts and recognizes mutation/migration evidence', () => {
    const withAlert = parseQaOutput('5 passed\nSeverity: CRITICAL CVE-2026-9999\n', '', 'bdd', {
      exitCode: 0,
    });
    expect(withAlert.status).toBe('FAILED');

    const mutOk = parseQaOutput('Mutation score: 87.50%\n0 survived\n', '', 'mutation', { exitCode: 0 });
    expect(mutOk.status).toBe('PASSED');

    const migOk = parseQaOutput('Running upgrade -> head\nalembic check passed\n', '', 'migration', {
      exitCode: 0,
    });
    expect(migOk.status).toBe('PASSED');
  });

  it('H10: auditVibePrototype extracts table name from ALTER TABLE ONLY public.users', () => {
    fs.mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'migrations', '001.sql'),
      [
        'CREATE TABLE public.users (id UUID PRIMARY KEY, tenant_id UUID NOT NULL);',
        'ALTER TABLE ONLY public.users ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;',
        'CREATE POLICY p_users ON public.users USING (tenant_id = current_setting(\'app.current_tenant_id\')::uuid);',
      ].join('\n'),
      'utf8'
    );
    const vibe = auditVibePrototype({ workspaceRoot: tmpDir });
    expect(vibe.findings.some((f) => f.ruleId === 'VIBE-RLS-002')).toBe(false);
  });

  it('H12: validateCalmArchitecture supports generic consumer CALM models and rejects empty ones', () => {
    fs.mkdirSync(path.join(tmpDir, 'architecture'), { recursive: true });
    const consumerModel = {
      nodes: [
        { 'unique-id': 'web-app', 'node-type': 'service', name: 'Web App', description: 'SPA' },
        { 'unique-id': 'orders-api', 'node-type': 'service', name: 'Orders API', description: 'REST API' },
      ],
      relationships: [
        {
          'unique-id': 'web-to-api',
          description: 'HTTPS calls',
          'relationship-type': { connects: { source: { node: 'web-app' }, destination: { node: 'orders-api' } } },
        },
      ],
      controls: {
        'tls-required': {
          description: 'Enforce TLS 1.3',
          requirements: [{ 'requirement-url': 'https://example.org/tls', config: { 'control-id': 'tls-required' } }],
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'architecture', 'consumer.calm.json'), JSON.stringify(consumerModel), 'utf8');
    const ok = validateCalmArchitecture({
      workspaceRoot: tmpDir,
      architecturePath: 'architecture/consumer.calm.json',
      profile: 'generic',
    });
    expect(ok.valid).toBe(true);

    const strictFail = validateCalmArchitecture({
      workspaceRoot: tmpDir,
      architecturePath: 'architecture/consumer.calm.json',
      profile: 'qa-11x-self',
    });
    expect(strictFail.valid).toBe(false);
  });

  it('H13: test-pyramid-auditor rejects coverage thresholds < 95% and emits L02 high action', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.pytest.ini_options]\naddopts = "--cov=src --cov-fail-under=80"\n',
      'utf8'
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'calc.py'), 'def add(a, b): return a + b\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'test_calc.py'), 'def test_add(): assert True\n', 'utf8');
    const gap = await auditTestPyramidGaps(tmpDir);
    const l3 = gap.layers_audit.find((l) => l.layer_id === 'L03_UNIT_ISOLATED');
    expect(l3?.status).toBe('PARTIAL');
    expect(gap.prioritized_action_plan.some((a) => a.layer_number === 2)).toBe(true);
  });

  it('certify-gate JSONC stripping handles line/block comments, trailing commas, and strings in tsconfig.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      '{\n  // comment\n  "compilerOptions": { "strict": true, /* block */ "baseUrl": "https://a//b", },\n}\n',
      'utf8'
    );
    const res = await certify11xGate(tmpDir, { allowUnmergedExamples: true });
    expect(res.checks.json_integrity).toBe(true);
  });

  it('evaluateReleaseGate ignores <!DOCTYPE inside CDATA and avoids nested <testsuite> double counting', () => {
    const xml = [
      '<testsuites tests="2" failures="0">',
      '  <testsuite name="outer" tests="2" failures="0">',
      '    <testsuite name="inner" tests="2" failures="0">',
      '      <testcase classname="a" name="t1"><system-out><![CDATA[<!DOCTYPE html><html>ok</html>]]></system-out></testcase>',
      '      <testcase classname="a" name="t2" />',
      '    </testsuite>',
      '  </testsuite>',
      '</testsuites>',
    ].join('\n');
    const res = evaluateReleaseReadiness({
      workspaceRoot: tmpDir,
      scope: 'full',
      junitXmlContent: xml,
      telemetry: { error_rate_pct: 0, p95_ms: 100, p99_ms: 200, active_incidents: 0 },
      defects: { open_blockers: 0, open_criticals: 0, qa_escapes: 0 },
    });
    expect(res.decision).toBe('GO');
    expect(res.junit.totalTests).toBe(2);
  });

  it('evaluateAgentTrajectory blocks git -C push and rm -r -f /etc while accepting exact 0.94 compilation rate', async () => {
    const blocked = await evaluateAgentTrajectory({
      mode: 'offline',
      workspaceRoot: tmpDir,
      steps: [
        { tool: 'inspect_ast_blast_radius', status: 'passed' },
        { tool: 'run_command', args: { cmd: 'git -C repo push origin main' }, status: 'passed' },
      ],
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.violations.some((v) => v.code === 'FORBIDDEN_COMMAND')).toBe(true);

    const rmBlocked = await evaluateAgentTrajectory({
      mode: 'offline',
      workspaceRoot: tmpDir,
      steps: [
        { tool: 'inspect_ast_blast_radius', status: 'passed' },
        { tool: 'run_command', args: { cmd: 'rm -r -f /etc' }, status: 'passed' },
      ],
    });
    expect(rmBlocked.passed).toBe(false);

    const safeTmpRm = await evaluateAgentTrajectory({
      mode: 'offline',
      workspaceRoot: tmpDir,
      steps: [
        { tool: 'inspect_ast_blast_radius', status: 'passed' },
        { tool: 'run_command', args: { cmd: 'rm -f /tmp/safe.log' }, status: 'passed' },
      ],
    });
    expect(safeTmpRm.passed).toBe(true);
  });

  it('runLlmRedTeam accepts colon-namespaced OWASP plugins and detects broken escaping symlinks', async () => {
    const cfg = [
      'prompts:',
      '  - "Answer {{query}}"',
      'providers:',
      '  - openai:gpt-4o-mini',
      'tests:',
      '  - assert:',
      '      - type: contains',
      '        value: ok',
      'redteam:',
      '  plugins:',
      '    - prompt-injection',
      '    - jailbreak:tree',
      '    - pii:direct',
      '    - rbac',
      '    - excessive-agency',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'promptfooconfig.yaml'), cfg, 'utf8');
    const ok = await runLlmRedTeam({ workspaceRoot: tmpDir, configPath: 'promptfooconfig.yaml', mode: 'offline' });
    expect(ok.passed).toBe(true);

    const brokenLink = path.join(tmpDir, 'broken.yaml');
    fs.symlinkSync('/nonexistent/outside/promptfoo.yaml', brokenLink);
    const escaped = await runLlmRedTeam({ workspaceRoot: tmpDir, configPath: 'broken.yaml', mode: 'offline' });
    expect(escaped.passed).toBe(false);
    expect(escaped.violations.some((v) => v.code === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('pathRealResolver rejects .. segments and SurgicalMerger handles pipes, bash -c, and Makefile := assignments', () => {
    expect(() => assertNoSymlinkSegments(tmpDir, '../escape.txt')).toThrow(/traversal/i);

    const merger = new SurgicalMerger();
    const pkg = merger.mergePackageJson(
      JSON.stringify({ scripts: { lint: 'bash -c "eslint src" | tee lint.log' } }),
      JSON.stringify({ scripts: { lint: 'eslint src --max-warnings 0' } })
    );
    expect(pkg.merged).toContain('eslint src --max-warnings 0');

    const mk = merger.mergeMakefile(
      'APP_DIR := $(CURDIR)\r\nqa-unit:\r\n\techo ok\r\n',
      'APP_DIR := /other\nqa-lint:\n\techo lint\n'
    );
    expect(mk.merged).toContain('qa-lint:');
    expect(mk.changes.some((c) => c.includes('APP_DIR'))).toBe(false);
  });

  it('covers H8/H9/H11/H13/H14 edge branches: detectDirectExecution, symlink prune, aider read:, chmod tolerance, JSONC, SEC-03/10/08 & flight recorder', async () => {
    // 1. detectDirectExecution (empty argv[1] + binary suffix fallback)
    expect(detectDirectExecution('')).toBe(false);
    expect(detectDirectExecution('/nonexistent/bin/mcp-qa-11x')).toBe(true);

    // 2. workspacePathValidator normalizeForMatch case-insensitive & case-sensitive
    expect(normalizeForMatch('C:\\Windows\\System32', true)).toBe('c:/windows/system32');
    expect(normalizeForMatch('C:\\Windows', false)).toBe('C:/Windows');

    // 3. qa-evidence safeChmodSync tolerates EPERM/EROFS/ENOSYS and rethrows EACCES
    for (const code of ['EPERM', 'EROFS', 'ENOSYS']) {
      expect(() =>
        safeChmodSync('/tmp/x', 0o600, () => {
          throw Object.assign(new Error(code), { code });
        })
      ).not.toThrow();
    }
    expect(() =>
      safeChmodSync('/tmp/x', 0o600, () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      })
    ).toThrow(/EACCES/);

    // 4. SurgicalMerger backupExistingFile tolerates chmodSync EPERM
    const mergeDir = path.join(tmpDir, 'merge-chmod');
    fs.mkdirSync(mergeDir, { recursive: true });
    fs.writeFileSync(path.join(mergeDir, '.gitignore'), 'node_modules/\n', 'utf8');
    const chmodSpy = vi.spyOn(fs, 'chmodSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    });
    try {
      const merger = new SurgicalMerger();
      const mergeRes = await merger.mergeFiles(
        mergeDir,
        [
          {
            path: 'common/.gitignore',
            target_name: '.gitignore',
            merge_strategy: 'overwrite',
            content: 'dist/\n',
            sha256_verified: true,
          },
        ],
        { dryRun: false, createBackup: true }
      );
      expect(mergeRes.summary.merged).toBe(1);
    } finally {
      chmodSpy.mockRestore();
    }

    // 5. version-manager pruneRetiredFilesInCanonicalSkillDirs skips symlinks safely
    const skillsRoot = path.join(tmpDir, 'skills-root');
    const archDir = path.join(skillsRoot, 'qa-11x-architect');
    fs.mkdirSync(archDir, { recursive: true });
    fs.writeFileSync(path.join(archDir, 'SKILL.md'), '# ok\n', 'utf8');
    fs.symlinkSync('/nonexistent/target', path.join(archDir, 'external-link.md'));
    expect(
      pruneRetiredFilesInCanonicalSkillDirs(skillsRoot, new Set(['qa-11x-architect/SKILL.md']), tmpDir)
    ).toBe(0);

    // 6. repoHygiene aider-yaml preserves existing read: key without duplicate key
    const aiderDir = path.join(tmpDir, 'aider-ws');
    fs.mkdirSync(aiderDir, { recursive: true });
    fs.writeFileSync(path.join(aiderDir, 'AGENTS.md'), '# Agents\n', 'utf8');
    fs.writeFileSync(
      path.join(aiderDir, '.aider.conf.yml'),
      [
        'read:',
        '  - docs/custom.md',
        AIDER_BRIDGE_START,
        '# old verbose bridge block line 1',
        '# old verbose bridge block line 2',
        '# old verbose bridge block line 3',
        AIDER_BRIDGE_END,
        '',
      ].join('\n'),
      'utf8'
    );
    await reconcileAgentsGovernance({ projectPath: aiderDir, dryRun: false, pruneBridges: true });
    const updatedAider = fs.readFileSync(path.join(aiderDir, '.aider.conf.yml'), 'utf8');
    expect(updatedAider).toContain('Existing read: key detected');
    expect(updatedAider.match(/^read:/gm)?.length).toBe(1);

    // 7. certify-gate JSONC escaped string + bare slash invalid JSONC
    const jsoncDir = path.join(tmpDir, 'jsonc-ws');
    fs.mkdirSync(jsoncDir, { recursive: true });
    fs.writeFileSync(
      path.join(jsoncDir, 'tsconfig.json'),
      '{\n  // escaped quote inside string\n  "compilerOptions": { "baseUrl": "a\\"b" }\n}\n',
      'utf8'
    );
    const jsoncOk = await certify11xGate(jsoncDir, {
      allowUnmergedExamples: true,
      requireLintEvidence: false,
    });
    expect(jsoncOk.checks.json_integrity).toBe(true);

    fs.writeFileSync(path.join(jsoncDir, 'tsconfig.json'), '{ "a": / 1 }\n', 'utf8');
    const jsoncBad = await certify11xGate(jsoncDir, {
      allowUnmergedExamples: true,
      requireLintEvidence: false,
    });
    expect(jsoncBad.checks.json_integrity).toBe(false);

    // 8. runLlmRedTeam nonexistent workspace root hits !fs.existsSync(rootResolved)
    const missingRedTeam = await runLlmRedTeam({
      workspaceRoot: path.join(tmpDir, 'ghost-root'),
      configPath: 'promptfooconfig.yaml',
      mode: 'offline',
    });
    expect(missingRedTeam.passed).toBe(false);

    // 9. security-auditor SEC-03 new Function / child_process.exec, SEC-10 non-secret .env key, isNonHttpNodeCliEntry catch
    const secDir = path.join(tmpDir, 'sec-extra');
    fs.mkdirSync(path.join(secDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(secDir, 'src', 'dyn.ts'),
      'export const f = new Function("return 1");\nexport const r = child_process.exec("ls");\n',
      'utf8'
    );
    fs.writeFileSync(path.join(secDir, '.env'), 'APP_NAME=MySafeApplication\n', 'utf8');
    const secExtra = await auditSecurityStigOwasp(secDir);
    expect(secExtra.findings.filter((f) => f.rule_id === 'SEC-03').length).toBeGreaterThanOrEqual(2);
    expect(secExtra.findings.some((f) => f.rule_id === 'SEC-10')).toBe(false);
    expect(isNonHttpNodeCliEntry(secDir, 'missing/index.ts')).toBe(false);

    // 10. test-pyramid-auditor excludes docs/ and .example from untested API endpoints
    expect(findUntestedApiEndpoints(tmpDir, ['docs/routes.py', 'routes.py.example'])).toEqual([]);

    // 11. sessionFlightRecorder unbracketed allowed_globs + Python clear without reason
    const sfrDir = path.join(tmpDir, 'sfr-extra');
    fs.mkdirSync(path.join(sfrDir, '.agents', 'scripts'), { recursive: true });
    const fakeCtl = path.join(sfrDir, '.agents', 'scripts', 'checkpoint_ctl.py');
    const ctlContent = '# stub\n';
    fs.writeFileSync(fakeCtl, ctlContent, 'utf8');
    const ctlSha = crypto.createHash('sha256').update(ctlContent).digest('hex');
    fs.writeFileSync(
      path.join(sfrDir, '.agents', 'ACTIVE_TASK.md'),
      [
        '**Tarea:** `T-UNBRACKET` | **Estado:** `IN_PROGRESS`',
        '**Objetivo Activo (`S1`):** Check unbracketed globs',
        'allowed_globs: src/**, tests/**',
      ].join('\n'),
      'utf8'
    );
    const rec = await runSessionFlightRecorder({ project_path: sfrDir, action: 'recover' });
    expect(rec.checkpoint?.allowed_globs).toEqual(['src/**', 'tests/**']);

    const seenClearArgs: string[][] = [];
    const mockExec = ((
      _file: string,
      args: readonly string[],
      _opts: unknown,
      cb: (err: null, out: string, stderr: string) => void
    ) => {
      seenClearArgs.push([...args]);
      cb(null, '[PASS] CLEARED', '');
    }) as unknown as typeof execFile;
    const clearNoReason = await runSessionFlightRecorder(
      { project_path: sfrDir, action: 'clear' },
      { execFileFn: mockExec, preferPythonCtl: true, expectedScriptSha256: ctlSha }
    );
    expect(clearNoReason.status).toBe('PASSED');
    expect(seenClearArgs.some((a) => a.some((tok) => tok.startsWith('--reason=')))).toBe(false);
  });
});
