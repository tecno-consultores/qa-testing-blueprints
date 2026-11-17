// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { collectProjectFiles, inspectProjectConfig } from '../src/tools/inspect-project.js';
import { auditTestPyramidGaps } from '../src/tools/test-pyramid-auditor.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';
import { INTERACTIVE_TTY_NOTICE, main } from '../src/index.js';
import {
  buildPrefilledIssueUrl,
  inferDualConsumerTargets,
  proposeSkillEvolutionPr,
} from '../src/tools/propose-evolution-pr.js';

describe('QA-HEALTH-01 & Dual-Consumer Evolution Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-health-dual-'));
    fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('QA-HEALTH-01: Supervisor Task-Exit Semantics', () => {
    it('flags asyncio supervisor checking .done() and .cancelled() without .exception()', async () => {
      const workerDir = path.join(tmpDir, 'src', 'workers');
      fs.mkdirSync(workerDir, { recursive: true });
      fs.writeFileSync(
        path.join(workerDir, 'supervisor.py'),
        [
          'def check_workers_health(tasks):',
          '    for task in tasks.values():',
          '        if task.done() and not task.cancelled():',
          '            return False',
          '    return True',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const healthFindings = res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(healthFindings).toHaveLength(1);
      expect(healthFindings[0]?.severity).toBe('HIGH');
      expect(healthFindings[0]?.file).toBe(path.join('src', 'workers', 'supervisor.py'));
    });

    it('passes when supervisor inspects task.exception() and OPTIONAL_WORKERS or uses # qa-health-ok', async () => {
      const workerDir = path.join(tmpDir, 'src', 'workers');
      fs.mkdirSync(workerDir, { recursive: true });
      fs.writeFileSync(
        path.join(workerDir, 'supervisor_safe.py'),
        [
          'OPTIONAL_WORKERS = frozenset({"siem_exporter"})',
          'def check_workers_health(tasks):',
          '    for name, task in tasks.items():',
          '        if task.done() and not task.cancelled():',
          '            if task.exception() is not None or name not in OPTIONAL_WORKERS:',
          '                return False',
          '    return True',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(workerDir, 'supervisor_exempt.py'),
        [
          'def check_legacy(task):',
          '    if task.done() and not task.cancelled():  # qa-health-ok',
          '        return False',
          '    return True',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(workerDir, 'supervisor_window_exempt.py'),
        [
          '# qa-health-ok: one-shot batch worker',
          'def check_batch(task):',
          '    if task.done() and not task.cancelled():',
          '        return False',
          '    return True',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const healthFindings = res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(healthFindings).toHaveLength(0);
    });
  });

  describe('QA-HEALTH-01: Container Healthcheck Probe Contract', () => {
    it('flags orchestrator probe path in docker-compose/Dockerfile when tests lack unmocked assertion', async () => {
      const srcDir = path.join(tmpDir, 'src', 'workers');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.yml'),
        [
          'services:',
          '  workers:',
          '    volumes:',
          '      - /var/run/docker.sock:/var/run/docker.sock',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "test -f /tmp/worker_heartbeat"]',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'Dockerfile.workers'),
        'FROM python:3.12-slim\nHEALTHCHECK CMD test -f /tmp/worker_heartbeat\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'runner.py'),
        [
          'from pathlib import Path',
          'WORKER_HEARTBEAT_PATH = Path("/tmp/worker_heartbeat")',
          'async def run_all_workers():',
          '    WORKER_HEARTBEAT_PATH.write_text("ok")',
        ].join('\n'),
        'utf8'
      );
      // Siloed test mocking write_text without .exists() assertion
      fs.writeFileSync(
        path.join(testsDir, 'test_runner.unit.py'),
        [
          'from unittest.mock import patch',
          'def test_siloed_runner():',
          '    with patch("src.workers.runner.WORKER_HEARTBEAT_PATH.write_text"):',
          '        assert True',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const healthFindings = res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(healthFindings).toHaveLength(1);
      expect(healthFindings[0]?.file).toBe(path.join('src', 'workers', 'runner.py'));
      expect(healthFindings[0]?.message).toContain('/tmp/worker_heartbeat');
    });

    it('passes when contract test asserts WORKER_HEARTBEAT_PATH.exists() without mocking write_text', async () => {
      const srcDir = path.join(tmpDir, 'src', 'workers');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.yml'),
        [
          'services:',
          '  workers:',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "test -f /tmp/worker_heartbeat"]',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'runner.py'),
        [
          'from pathlib import Path',
          'WORKER_HEARTBEAT_PATH = Path("/tmp/worker_heartbeat")',
          'async def run_all_workers():',
          '    WORKER_HEARTBEAT_PATH.write_text("ok")',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(testsDir, 'test_runner_contract.unit.py'),
        [
          'from src.workers.runner import WORKER_HEARTBEAT_PATH',
          'def test_runner_emits_real_heartbeat():',
          '    assert WORKER_HEARTBEAT_PATH.exists()',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const healthFindings = res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(healthFindings).toHaveLength(0);
    });

    it('ignores compose probes without local orchestrator source, HTTP healthchecks, sockets, or test exemptions', async () => {
      const fastapiDir = path.join(tmpDir, 'fastapi');
      const srcDir = path.join(tmpDir, 'src');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(fastapiDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      // Compose without healthcheck at all
      fs.writeFileSync(
        path.join(tmpDir, 'compose.override.yaml'),
        'services:\n  redis:\n    image: eqalpha/keydb:alpine\n',
        'utf8'
      );
      // Subdir Dockerfile with HTTP healthcheck (no /tmp file match)
      fs.writeFileSync(
        path.join(fastapiDir, 'Dockerfile'),
        'FROM python:3.12-slim\nHEALTHCHECK CMD curl -f http://localhost:8000/health\n',
        'utf8'
      );
      // Compose with socket, external probe, exempt source probe, and basename-matched probe
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.yml'),
        [
          'services:',
          '  external_agent:',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "test -S /tmp/agent.sock && test -f /tmp/third_party_ready && test -f /tmp/exempt_probe && test -f /tmp/scheduler_pulse"]',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'exempt_worker.py'),
        '# qa-health-ok\nPROBE = "/tmp/exempt_probe"\n',
        'utf8'
      );
      // Matches via basename ('scheduler_pulse') twice and lowercase assignment
      fs.writeFileSync(
        path.join(srcDir, 'scheduler.py'),
        [
          'from pathlib import Path',
          'pulse_file = Path("/tmp") / "scheduler_pulse"',
          'backup_ref = "scheduler_pulse"',
        ].join('\n'),
        'utf8'
      );
      // Unrelated test file + test file with # qa-health-ok
      fs.writeFileSync(path.join(testsDir, 'test_unrelated.unit.py'), 'def test_math(): assert 1 == 1\n', 'utf8');
      fs.writeFileSync(
        path.join(testsDir, 'test_scheduler_exempt.unit.py'),
        '# qa-health-ok: scheduler_pulse validated via external E2E\ndef test_scheduler(): pass\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      expect(res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(0);

      // Now replace exempt test with smoke test mentioning token without assertion or monkeypatching write_text
      fs.unlinkSync(path.join(testsDir, 'test_scheduler_exempt.unit.py'));
      fs.writeFileSync(
        path.join(testsDir, 'test_scheduler_smoke.unit.py'),
        'def test_smoke(monkeypatch):\n    ref = "scheduler_pulse"\n    assert ref\n',
        'utf8'
      );
      const resFail = await auditSecurityStigOwasp(tmpDir);
      expect(resFail.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(1);
    });

    it('ignores /tmp/venv outside HEALTHCHECK blocks and catches multiline Dockerfile HEALTHCHECK probes', async () => {
      const srcDir = path.join(tmpDir, 'src');
      const scriptsDir = path.join(tmpDir, 'scripts');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.yml'),
        [
          'services:',
          '  api:',
          '    environment:',
          '      VIRTUAL_ENV: /tmp/venv',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "curl -sf http://localhost:8000/health"]',
          '  qa:',
          '    volumes:',
          '      - /tmp/venv:/tmp/venv',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(scriptsDir, 'qa.sh'),
        '#!/usr/bin/env bash\nVENV=/tmp/venv\n"$VENV/bin/pytest"\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'runtime.py'),
        'DEFAULT_VENV = "/tmp/venv"\n',
        'utf8'
      );

      const cleanRes = await auditSecurityStigOwasp(tmpDir);
      expect(cleanRes.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(0);

      // Multiline Dockerfile HEALTHCHECK pointing to /tmp/worker_heartbeat without test assertion must trigger
      fs.writeFileSync(
        path.join(tmpDir, 'Dockerfile'),
        [
          'FROM python:3.12-slim',
          'ENV VIRTUAL_ENV=/tmp/venv',
          'HEALTHCHECK --interval=10s \\',
          '  CMD test -f /tmp/worker_heartbeat',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'worker.py'),
        'HEARTBEAT = "/tmp/worker_heartbeat"\n',
        'utf8'
      );
      const flaggedRes = await auditSecurityStigOwasp(tmpDir);
      const findings = flaggedRes.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain('/tmp/worker_heartbeat');
    });
  });

  describe('QA-CLI-TTY-01: Dual CLI/MCP stdio Interactive TTY Anti-Hang Guard', () => {
    it('flags Node/TS and Python dual CLI+MCP entrypoints lacking stdin TTY detection and passes guarded ones', async () => {
      fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"dual-mcp"}', 'utf8');
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const vulnerableTs = [
        '#!/usr/bin/env node',
        "import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';",
        'const args = process.argv.slice(2);',
        'if (!args[0]) {',
        '  const transport = new StdioServerTransport();',
        '  console.error(transport);',
        '}',
      ].join('\n');
      fs.writeFileSync(path.join(srcDir, 'index.ts'), vulnerableTs, 'utf8');

      const vulnerablePy = [
        'import sys',
        'from mcp.server.stdio import stdio_server',
        'async def main() -> None:',
        '    if len(sys.argv) == 1:',
        '        async with stdio_server() as streams:',
        '            print(streams)',
      ].join('\n');
      fs.writeFileSync(path.join(srcDir, 'cli_mcp.py'), vulnerablePy, 'utf8');

      // .example and non-dual files must not trigger
      fs.writeFileSync(path.join(srcDir, 'index.ts.example'), vulnerableTs, 'utf8');
      fs.writeFileSync(path.join(srcDir, 'helper.txt'), 'StdioServerTransport process.argv', 'utf8');

      const failingRes = await auditSecurityStigOwasp(tmpDir);
      const ttyFindings = failingRes.findings.filter((f) => f.rule_id === 'QA-CLI-TTY-01');
      expect(ttyFindings).toHaveLength(2);
      expect(ttyFindings.map((f) => f.file).sort((a, b) => a.localeCompare(b))).toEqual([
        'src/cli_mcp.py',
        'src/index.ts',
      ]);

      // Guarded Node/TS (process.stdin.isTTY) and guarded Python (sys.stdin.isatty()) pass cleanly
      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        `${vulnerableTs}\nconst interactive = Boolean(process.stdin.isTTY);\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'cli_mcp.py'),
        `${vulnerablePy}\n    is_tty = sys.stdin.isatty()\n`,
        'utf8'
      );
      // Also verify pragma exemption on another dual file
      fs.writeFileSync(
        path.join(srcDir, 'exempt_mcp.js'),
        `// qa-tty-ok\n${vulnerableTs}\n`,
        'utf8'
      );

      const passingRes = await auditSecurityStigOwasp(tmpDir);
      expect(passingRes.findings.filter((f) => f.rule_id === 'QA-CLI-TTY-01')).toHaveLength(0);
    });
  });

  describe('SEC-CI-ACTION-REF: Immutable 40-char SHA Pinning in GitHub Actions', () => {
    it('flags unpinned tags, mutable branches, missing refs, and unprefixed trivy-action tags while passing SHA-40 and exemptions', async () => {
      const wfDir = path.join(tmpDir, '.github', 'workflows');
      const actDir = path.join(tmpDir, '.github', 'actions', 'custom');
      fs.mkdirSync(wfDir, { recursive: true });
      fs.mkdirSync(actDir, { recursive: true });

      fs.writeFileSync(
        path.join(wfDir, 'ci.yml'),
        [
          'name: CI',
          'jobs:',
          '  scan:',
          '    steps:',
          '      - uses: aquasecurity/trivy-action@0.28.0',
          '      - uses: actions/checkout@v4',
          '      - uses: actions/setup-node@main',
          '      - uses: actions/cache',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(actDir, 'action.yml'),
        [
          'name: Custom',
          'runs:',
          "  using: 'composite'",
          '  steps:',
          '    - uses: actions/checkout@v4',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(wfDir, 'ci-clean.yml'),
        [
          'name: Clean CI',
          'jobs:',
          '  clean:',
          '    steps:',
          '      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0',
          '      - uses: ./.github/actions/local-check',
          '      - uses: ../shared/action',
          '      - uses: docker://alpine:3.20',
          '      - uses: tecno-consultores/qa-testing-blueprints/.github/actions/qa-11x-pr-check@v2 # sec-ci-action-ref-ok',
          '      # sec-ci-action-ref-ok',
          '      - uses: actions/checkout@v4',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(wfDir, 'exempt.yml'),
        '# sec-ci-action-ref-ok\njobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n',
        'utf8'
      );

      fs.writeFileSync(
        path.join(wfDir, 'template.yml.example'),
        'steps:\n  - uses: actions/checkout@v4\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const ciFindings = res.findings.filter((f) => f.rule_id === 'SEC-CI-ACTION-REF');
      expect(ciFindings).toHaveLength(5);
      expect(ciFindings.every((f) => f.severity === 'HIGH')).toBe(true);
      const wfFindings = ciFindings.filter((f) => f.file === path.join('.github', 'workflows', 'ci.yml'));
      expect(wfFindings).toHaveLength(4);
      expect(wfFindings.find((f) => f.line === 5)?.message).toContain("sin prefijo 'v'");
      expect(wfFindings.find((f) => f.line === 6)?.message).toContain('etiqueta semántica mutable');
      expect(wfFindings.find((f) => f.line === 7)?.message).toContain('rama/etiqueta mutable');
      expect(wfFindings.find((f) => f.line === 8)?.message).toContain('omite referencia inmutable');
      expect(
        ciFindings.some((f) => f.file === path.join('.github', 'actions', 'custom', 'action.yml'))
      ).toBe(true);
    });
  });

  describe('QA-DOCKER-TTY-01: Non-Interactive Compose TTY & Read-Only Wrangler Hardening', () => {
    it('flags compose run without -T in CI/deploy files and passes -T, --no-TTY, local scripts, and pragmas', async () => {
      const wfDir = path.join(tmpDir, '.github', 'workflows');
      fs.mkdirSync(wfDir, { recursive: true });
      fs.writeFileSync(
        path.join(wfDir, 'deploy.yml'),
        [
          'name: Deploy',
          'jobs:',
          '  ship:',
          '    steps:',
          '      - run: docker compose -f compose.yml run --rm -u "1000:1000" ui pnpm test',
          '      - run: docker compose -f compose.yml run --rm -T -u "1000:1000" ui pnpm build',
          '      - run: docker compose -f compose.yml run --rm --no-TTY ui pnpm lint',
          '      - run: docker compose -f compose.yml run --rm -dT ui pnpm ping',
          '      - run: docker compose -f compose.yml up -d',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'deploy.sh'),
        [
          '#!/usr/bin/env bash',
          'docker compose -f docker-compose.deploy.yml run --rm \\',
          '  -u "$(id -u):$(id -g)" \\',
          '  --entrypoint "" deploy sh -c "echo ship"',
          'docker compose run --rm deploy -T',
          '# qa-docker-tty-ok',
          'docker compose run --rm deploy echo exempt_line',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'helper.sh'),
        [
          '#!/usr/bin/env bash',
          "CI='true'",
          "docker-compose -p ci run --rm app 'echo quoted arg'",
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'local-dev.sh'),
        '#!/usr/bin/env bash\ndocker compose run --rm app bash\n',
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'ci-exempt.sh'),
        '# qa-docker-tty-ok\ndocker compose run --rm app bash\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const findings = res.findings.filter((f) => f.rule_id === 'QA-DOCKER-TTY-01');
      expect(findings).toHaveLength(4);
      expect(findings.every((f) => f.severity === 'HIGH')).toBe(true);
      expect(findings.some((f) => f.file === path.join('.github', 'workflows', 'deploy.yml') && f.line === 5)).toBe(true);
      expect(findings.some((f) => f.file === 'deploy.sh' && f.line === 2)).toBe(true);
      expect(findings.some((f) => f.file === 'deploy.sh' && f.line === 5)).toBe(true);
      expect(findings.some((f) => f.file === 'helper.sh' && f.line === 3)).toBe(true);
    });

    it('flags read_only wrangler compose missing noexec .wrangler tmpfs or --force and passes hardened compose', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.bad-nomount.yml'),
        [
          'services:',
          '  deploy:',
          '    read_only: true',
          '    environment:',
          "      CI: 'true'",
          '    command:',
          '      - |',
          '        wrangler pages project create my-app --production-branch=main',
          '        wrangler pages deploy /app/dist \\',
          '          --project-name=my-app',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.bad-exec.yml'),
        [
          'services:',
          '  deploy:',
          '    read_only: true',
          '    tmpfs:',
          '      - /app/.wrangler:size=32M,mode=1777,nosuid,nodev',
          '    command: wrangler pages deploy /app/dist --project-name=ok --force',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.good.yml'),
        [
          'services:',
          '  deploy:',
          '    read_only: true',
          '    tmpfs:',
          '      - /tmp:size=64M,mode=1777,noexec,nosuid,nodev',
          '      - /app/.wrangler:size=32M,mode=1777,noexec,nosuid,nodev',
          '    environment:',
          "      CI: 'true'",
          '    command:',
          '      - |',
          '        wrangler pages project create my-app --production-branch=main --force',
          '        wrangler pages deploy /app/dist \\',
          '          --project-name=my-app \\',
          '          --force',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.keydb.yml'),
        'services:\n  redis:\n    image: eqalpha/keydb:alpine\n    read_only: true\n',
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.deploy.yml.example'),
        'services:\n  deploy:\n    read_only: true\n    command: wrangler pages deploy /app/dist\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const findings = res.findings.filter((f) => f.rule_id === 'QA-DOCKER-TTY-01');
      expect(findings).toHaveLength(4);
      const badNomount = findings.filter((f) => f.file === 'docker-compose.bad-nomount.yml');
      expect(badNomount).toHaveLength(3);
      expect(badNomount.some((f) => f.message.includes('saveToConfigCache'))).toBe(true);
      expect(badNomount.filter((f) => f.message.includes('maybeDelegatePagesToWorkers'))).toHaveLength(2);
      const badExec = findings.filter((f) => f.file === 'docker-compose.bad-exec.yml');
      expect(badExec).toHaveLength(1);
      expect(badExec[0]?.message).toContain('noexec');
      expect(findings.some((f) => f.file === 'docker-compose.good.yml')).toBe(false);
    });
  });

  describe('QA-CI-ESCAPE-01 & QA-MAKE-CURDIR-01: Workflow Double-Dollar Escape & Sub-Makefile CURDIR', () => {
    it('flags $$(...) and $${...} in GitHub workflows/actions while exempting docker-compose, root Makefile, comments, and pragmas', async () => {
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'actions', 'qa-check'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, '.github', 'workflows', '00-iac-audit.yml'),
        [
          'name: IaC Audit',
          'jobs:',
          '  trivy:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - name: Run Trivy',
          '        run: |',
          '          # $$(pwd) en comentario no debe disparar',
          '          docker run --rm -u "$$(id -u):$$(id -g)" -v "$$(pwd):/workspace:ro" aquasec/trivy:latest config .',
          '          echo "$${GITHUB_SHA}"',
          '      - name: Exempt inline',
          '        run: echo "$$(pwd)" # qa-ci-escape-ok',
          '      - name: Exempt prev line',
          '        # qa-ci-escape-ok',
          '        run: echo "$${MAKE_VAR}"',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, '.github', 'actions', 'qa-check', 'action.yml'),
        [
          'name: QA Check',
          'runs:',
          '  using: composite',
          '  steps:',
          '    - run: docker run --rm -v "$$(pwd):/app:ro" alpine:3.20 ls',
          '      shell: bash',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, '.github', 'workflows', 'good-and-top-exempt.yml'),
        [
          '# qa-ci-escape-ok',
          'jobs:',
          '  gen:',
          '    steps:',
          '      - run: echo "$$(pwd)"',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, '.github', 'workflows', 'clean.yml'),
        [
          'jobs:',
          '  qa:',
          '    steps:',
          '      - run: docker run --rm -u "$(id -u):$(id -g)" -v "$(pwd):/workspace:ro" aquasec/trivy:latest config .',
          '      - run: echo "${{ github.sha }}"',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.deploy.yml'),
        [
          'services:',
          '  deploy:',
          '    command:',
          '      - |',
          '        : "$${CF_PAGES_PROJECT:?required}"',
          '        PROJECTS_JSON="$$(wrangler pages project list --json)"',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'Makefile'),
        'HOST_PWD ?= $(PWD)\nlint:\n\tdocker run --rm -v "$$(pwd):/app:ro" alpine:3.20 ls\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const escapeFindings = res.findings.filter((f) => f.rule_id === 'QA-CI-ESCAPE-01');
      expect(res.passed).toBe(false);
      expect(escapeFindings).toHaveLength(3);
      expect(escapeFindings.every((f) => f.severity === 'HIGH')).toBe(true);
      expect(
        escapeFindings.map((f) => `${f.file}:${f.line}`).sort((a, b) => a.localeCompare(b))
      ).toEqual([
        '.github/actions/qa-check/action.yml:5',
        '.github/workflows/00-iac-audit.yml:10',
        '.github/workflows/00-iac-audit.yml:9',
      ]);
      expect(escapeFindings[0]?.message).toContain('exit code 125');
      expect(res.findings.some((f) => f.rule_id === 'QA-MAKE-CURDIR-01')).toBe(false);
    });

    it('flags $(PWD) / ${PWD} in subdirectory Makefiles while allowing $(CURDIR), $$(pwd)/$$(PWD), root Makefile, comments, and pragmas', async () => {
      fs.mkdirSync(path.join(tmpDir, 'backend'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'frontend'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'api'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'exempt-top'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'backend', 'Makefile'),
        [
          '# HOST_PWD ?= $(PWD) en comentario ignorado',
          'HOST_PWD ?= $(PWD)',
          'GOOD_PWD ?= $(CURDIR)',
          'qa:',
          '\tdocker run --rm -v "$$(pwd):/app:ro" -v "$$(PWD):/src:ro" alpine:3.20 ls',
          '\techo "$(PWD)" # qa-make-curdir-ok',
          '\t# qa-make-curdir-ok',
          '\techo "${PWD}"',
        ].join('\n'),
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'frontend', 'Makefile'),
        'qa:\n\tdocker run --rm -v "${PWD}:/app:ro" node:22-alpine ls\n',
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'api', 'Makefile.example'),
        'APP_DIR := $(PWD)\nOK_DIR := $(CURDIR)\n',
        'utf8'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'exempt-top', 'Makefile'),
        '# qa-make-curdir-ok\nHOST_PWD ?= $(PWD)\n',
        'utf8'
      );

      fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'HOST_PWD ?= $(PWD)\n', 'utf8');

      const res = await auditSecurityStigOwasp(tmpDir);
      const curdirFindings = res.findings.filter((f) => f.rule_id === 'QA-MAKE-CURDIR-01');
      expect(res.passed).toBe(false);
      expect(curdirFindings).toHaveLength(3);
      expect(curdirFindings.every((f) => f.severity === 'HIGH')).toBe(true);
      expect(
        curdirFindings.map((f) => `${f.file}:${f.line}`).sort((a, b) => a.localeCompare(b))
      ).toEqual([
        'api/Makefile.example:1',
        'backend/Makefile:2',
        'frontend/Makefile:2',
      ]);
      expect(curdirFindings[0]?.remediation).toContain('$(CURDIR)');
    });
  });

  describe('Dual-Consumer Proposal Matrix (propose_skill_evolution_pr)', () => {
    it('infers security, governance, and practices Dual-Consumer targets automatically', () => {
      const secTargets = inferDualConsumerTargets({
        project_path: tmpDir,
        target_blueprint_file: '.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md',
        improvement_title: 'SEC-17 Rotación de Llaves',
        empirical_rationale: 'Detectado en auditoría de seguridad en producción.',
        proposed_content_or_snippet: '### SEC-17\nRotar llaves cada 24h.',
        prefer_offline_fallback: true,
      });
      expect(secTargets.targetHumanDocFile).toBe(
        'docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md'
      );
      expect(secTargets.targetMcpComponent).toBe('mcp-server/src/tools/security-auditor.ts');

      const govTargets = inferDualConsumerTargets({
        project_path: tmpDir,
        target_blueprint_file: '.agents/rules/continuous_agent_evolution.md',
        improvement_title: 'Ajuste de presupuesto documental',
        empirical_rationale: 'Evitar desfase entre capas de documentación.',
        proposed_content_or_snippet: '### Regla de gobernanza documental.',
        prefer_offline_fallback: true,
      });
      expect(govTargets.targetHumanDocFile).toBe('docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md');
      expect(govTargets.targetMcpComponent).toBe('.agents/scripts/verify_docs_invariants.py');
    });

    it('embeds Dual-Consumer 3-layer matrix and human summary in proposal file and GitHub URL', async () => {
      const result = await proposeSkillEvolutionPr({
        project_path: tmpDir,
        target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
        target_human_doc_file: 'docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md',
        target_mcp_component: 'mcp-server/src/tools/security-auditor.ts',
        improvement_title: 'Invariante Healthcheck QA-HEALTH-01',
        empirical_rationale: 'Contenedor cayó en unhealthy con workers opt-in apagados.',
        proposed_content_or_snippet: '9. **Unmocked Orchestrator Boot (`QA-HEALTH-01`)**',
        proposed_human_doc_summary: 'Explicación didáctica en español con ejemplo de OPTIONAL_WORKERS.',
        prefer_offline_fallback: true,
      });

      expect(result.target_human_doc_file).toBe('docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md');
      expect(result.target_mcp_component).toBe('mcp-server/src/tools/security-auditor.ts');

      const written = fs.readFileSync(result.local_proposal_file, 'utf8');
      expect(written).toContain('Matriz de Impacto Dual-Consumer');
      expect(written).toContain('docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md');
      expect(written).toContain('mcp-server/src/tools/security-auditor.ts');
      expect(written).toContain('Explicación didáctica en español con ejemplo de OPTIONAL_WORKERS.');

      const { issueBody } = buildPrefilledIssueUrl({
        project_path: tmpDir,
        target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
        improvement_title: 'Invariante Healthcheck QA-HEALTH-01',
        empirical_rationale: 'Contenedor cayó en unhealthy con workers opt-in apagados.',
        proposed_content_or_snippet: '9. **Unmocked Orchestrator Boot (`QA-HEALTH-01`)**',
        proposed_human_doc_summary: 'Resumen humano para docs/02.',
        prefer_offline_fallback: true,
      });
      expect(issueBody).toContain('Matriz Dual-Consumer');
      expect(issueBody).toContain('Resumen humano para docs/02.');

      // Default reminder branch when proposed_human_doc_summary is omitted
      const fallbackRes = await proposeSkillEvolutionPr(
        {
          project_path: tmpDir,
          target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
          improvement_title: 'Propuesta sin borrador humano explicito',
          empirical_rationale: 'Validar recordatorio Dual-Consumer por defecto.',
          proposed_content_or_snippet: '### Regla de ejemplo\nContenido.',
          prefer_offline_fallback: false,
        },
        () => Promise.reject(new Error('gh not installed'))
      );
      expect(fallbackRes.status).toBe('PROPOSAL_FILE_AND_URL_GENERATED');
      expect(
        fs.readFileSync(fallbackRes.local_proposal_file, 'utf8')
      ).toContain('Recordatorio Dual-Consumer Obligatorio');
    });
  });

  describe('QA-CONTRACT-SDK-01: Real In-Process SDK Transport Contract', () => {
    it('flags Python and TS protocol servers tested only with direct handler mocks and passes with real SDK client tests', async () => {
      const pyRoot = path.join(tmpDir, 'py-mcp');
      fs.mkdirSync(path.join(pyRoot, 'src'), { recursive: true });
      fs.mkdirSync(path.join(pyRoot, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(pyRoot, 'src', 'bridge.py'),
        [
          'from mcp.server.fastmcp import FastMCP',
          'mcp = FastMCP("bridge")',
          '@mcp.tool()',
          'async def ping() -> str:',
          '    return "pong"',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pyRoot, 'tests', 'test_bridge.unit.py'),
        [
          'from unittest.mock import MagicMock',
          'from src.bridge import ping',
          'async def test_ping_siloed():',
          '    req = MagicMock()',
          '    assert await ping() == "pong"',
        ].join('\n'),
        'utf8'
      );

      const pyFail = await auditSecurityStigOwasp(pyRoot);
      const pyFindings = pyFail.findings.filter((f) => f.rule_id === 'QA-CONTRACT-SDK-01');
      expect(pyFindings).toHaveLength(1);
      expect(pyFindings[0]?.severity).toBe('HIGH');
      expect(pyFindings[0]?.file).toBe(path.join('src', 'bridge.py'));

      // Adding a real in-process SDK client session test clears the finding
      fs.writeFileSync(
        path.join(pyRoot, 'tests', 'test_sdk_contract.py'),
        [
          'from mcp.shared.memory import create_connected_server_and_client_session',
          'async def test_real_sdk_session():',
          '    async with create_connected_server_and_client_session(server) as session:',
          '        await session.list_tools()',
        ].join('\n'),
        'utf8'
      );
      const pyPass = await auditSecurityStigOwasp(pyRoot);
      expect(pyPass.findings.filter((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toHaveLength(0);

      // TypeScript server without Client + InMemoryTransport fails, then passes with InMemoryTransport or pragma
      const tsRoot = path.join(tmpDir, 'ts-mcp');
      fs.mkdirSync(path.join(tsRoot, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tsRoot, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(tsRoot, 'src', 'server.ts'),
        [
          "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
          'export function createServer() {',
          '  const server = new McpServer({ name: "demo", version: "1.0.0" });',
          '  server.tool("ping", {}, async () => ({ content: [{ type: "text", text: "pong" }] }));',
          '  return server;',
          '}',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tsRoot, 'tests', 'server.unit.ts'),
        'import { createServer } from "../src/server.js";\nexpect(createServer()).toBeDefined();\n',
        'utf8'
      );

      const tsFail = await auditSecurityStigOwasp(tsRoot);
      expect(tsFail.findings.filter((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toHaveLength(1);

      fs.writeFileSync(
        path.join(tsRoot, 'tests', 'sdk.contract.test.ts'),
        [
          "import { Client } from '@modelcontextprotocol/sdk/client/index.js';",
          "import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';",
          'const [ct, st] = InMemoryTransport.createLinkedPair();',
          'const client = new Client({ name: "c", version: "1.0.0" });',
        ].join('\n'),
        'utf8'
      );
      const tsPass = await auditSecurityStigOwasp(tsRoot);
      expect(tsPass.findings.filter((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toHaveLength(0);
    });

    it('honors qa-contract-sdk-ok pragma exemption', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'server.py'),
        '# qa-contract-sdk-ok\nfrom mcp.server.fastmcp import FastMCP\napp = FastMCP("ok")\n',
        'utf8'
      );
      const res = await auditSecurityStigOwasp(tmpDir);
      expect(res.findings.filter((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toHaveLength(0);
    });
  });

  describe('QA-DOCKER-LOCK-01: Dockerfile Lockfile Parity & Smoke Enforcement', () => {
    it('flags handwritten pip/uv/npm package lists and unfrozen uv sync in Dockerfiles, while passing lockfile installs', async () => {
      const badPyDir = path.join(tmpDir, 'bad-py');
      fs.mkdirSync(badPyDir, { recursive: true });
      fs.writeFileSync(path.join(badPyDir, 'pyproject.toml'), '[project]\nname="app"\n', 'utf8');
      fs.writeFileSync(path.join(badPyDir, 'uv.lock'), 'version = 1\n', 'utf8');
      fs.writeFileSync(
        path.join(badPyDir, 'Dockerfile'),
        [
          'FROM python:3.12-slim',
          'RUN pip install --no-cache-dir uv',
          'RUN pip install --no-cache-dir fastapi uvicorn pydantic',
          'RUN uv sync --no-dev',
        ].join('\n'),
        'utf8'
      );

      const badPyRes = await auditSecurityStigOwasp(badPyDir);
      const pyLockFindings = badPyRes.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOCK-01');
      expect(pyLockFindings).toHaveLength(2);
      expect(pyLockFindings.map((f) => f.line)).toEqual([3, 4]);

      // Good Python Dockerfile: bootstrap uv + uv export --frozen + uv sync --frozen --no-dev
      const goodPyDir = path.join(tmpDir, 'good-py');
      fs.mkdirSync(goodPyDir, { recursive: true });
      fs.writeFileSync(path.join(goodPyDir, 'pyproject.toml'), '[project]\nname="app"\n', 'utf8');
      fs.writeFileSync(path.join(goodPyDir, 'uv.lock'), 'version = 1\n', 'utf8');
      fs.writeFileSync(
        path.join(goodPyDir, 'Dockerfile'),
        [
          'FROM python:3.12-slim',
          'RUN pip install --no-cache-dir uv==0.6.0',
          'RUN uv export --frozen --no-dev | uv pip install --system -r -',
          'RUN uv sync --frozen --no-dev',
        ].join('\n'),
        'utf8'
      );
      const goodPyRes = await auditSecurityStigOwasp(goodPyDir);
      expect(goodPyRes.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOCK-01')).toHaveLength(0);

      // Node Dockerfile: flags handwritten npm install express, allows npm install -g pnpm && pnpm install --frozen-lockfile
      const nodeDir = path.join(tmpDir, 'node-app');
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.writeFileSync(path.join(nodeDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(path.join(nodeDir, 'package.json'), '{"name":"app"}\n', 'utf8');
      fs.writeFileSync(
        path.join(nodeDir, 'Dockerfile'),
        [
          'FROM node:22-alpine',
          'RUN npm install -g pnpm',
          'RUN pnpm install --frozen-lockfile',
          'RUN npm install express cors',
        ].join('\n'),
        'utf8'
      );
      const nodeRes = await auditSecurityStigOwasp(nodeDir);
      const nodeFindings = nodeRes.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOCK-01');
      expect(nodeFindings).toHaveLength(1);
      expect(nodeFindings[0]?.line).toBe(4);

      // Pragma # qa-docker-lock-ok exempts explicit intentional lines
      fs.writeFileSync(
        path.join(nodeDir, 'Dockerfile'),
        'FROM node:22-alpine\n# qa-docker-lock-ok\nRUN npm install express\n',
        'utf8'
      );
      const exemptRes = await auditSecurityStigOwasp(nodeDir);
      expect(exemptRes.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOCK-01')).toHaveLength(0);
    });
  });

  describe('QA-HEALTH-01: Probe Exclusions for /tmp/chaos, /tmp/lhci, /tmp/psi & Logs', () => {
    it('does not treat cleanup or inspection of /tmp report/log probe paths as missing healthcheck targets', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Makefile'),
        [
          'clean-probes:',
          '\trm -rf /tmp/chaos /tmp/lhci /tmp/psi /tmp/report /tmp/chaos-report.html /tmp/probe.log /tmp/metrics.csv /tmp/summary.md /tmp/out.sarif',
        ].join('\n'),
        'utf8'
      );
      const res = await auditSecurityStigOwasp(tmpDir);
      expect(res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(0);
    });
  });

  describe('QA-PLAYWRIGHT-PIN-01: Exact Playwright NPM <-> Docker Tag Parity', () => {
    it('passes when package.json Playwright dependency matches pinned mcr.microsoft.com/playwright tag', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'ui', devDependencies: { '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.qa.yml'),
        'services:\n  ui-e2e:\n    image: mcr.microsoft.com/playwright:v1.52.0-noble\n',
        'utf8'
      );
      const res = await auditSecurityStigOwasp(tmpDir);
      expect(res.findings.filter((f) => f.rule_id === 'QA-PLAYWRIGHT-PIN-01')).toHaveLength(0);
    });

    it('flags semver range and version mismatch against pinned Playwright Docker tag', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'ui',
          devDependencies: { '@playwright/test': '^1.52.0', playwright: '1.50.0' },
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.qa.yml'),
        [
          'services:',
          '  ui-e2e:',
          '    image: mcr.microsoft.com/playwright:v1.52.0-noble',
        ].join('\n'),
        'utf8'
      );
      const res = await auditSecurityStigOwasp(tmpDir);
      const findings = res.findings.filter((f) => f.rule_id === 'QA-PLAYWRIGHT-PIN-01');
      expect(findings).toHaveLength(2);
      expect(findings.some((f) => f.message.includes('@playwright/test') && f.message.includes('1.52.0'))).toBe(true);
      expect(findings.some((f) => f.message.includes('playwright') && f.file === 'package.json')).toBe(true);
    });
  });

  describe('QA-SSR-HYDRATION-01: Dual-ColorScheme SSR Hydration Audit', () => {
    it('omits CSR SPAs without SSR markers and SSR apps without dual-theme markers', async () => {
      // 1) Pure CSR SPA (vue + vite)
      const csrDir = path.join(tmpDir, 'csr-spa');
      fs.mkdirSync(path.join(csrDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(csrDir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '3.5.0' }, devDependencies: { vite: '6.0.0', '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(csrDir, 'src', 'App.vue'),
        '<template><div v-if="localStorage.theme === \'dark\'">Dark</div></template>\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(csrDir, 'playwright.config.ts'),
        'export default { use: { colorScheme: "light" } };\n',
        'utf8'
      );
      const csrRes = await auditSecurityStigOwasp(csrDir);
      expect(csrRes.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toHaveLength(0);

      // 2) SSR app without dual-theme markers
      const monoSsrDir = path.join(tmpDir, 'mono-ssr');
      fs.mkdirSync(path.join(monoSsrDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(monoSsrDir, 'package.json'),
        JSON.stringify({ dependencies: { nuxt: '3.15.0' }, devDependencies: { '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(path.join(monoSsrDir, 'src', 'App.vue'), '<template><main>Solo claro</main></template>\n', 'utf8');
      fs.writeFileSync(path.join(monoSsrDir, 'playwright.config.ts'), 'export default { use: { baseURL: "http://localhost:3000" } };\n', 'utf8');
      const monoRes = await auditSecurityStigOwasp(monoSsrDir);
      expect(monoRes.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toHaveLength(0);
    });

    it('flags pre-hydration v-if and missing dual colorScheme / hydration console listeners on SSR + dual-theme apps', async () => {
      const ssrDir = path.join(tmpDir, 'nuxt-dual');
      fs.mkdirSync(path.join(ssrDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(ssrDir, 'e2e'), { recursive: true });
      fs.writeFileSync(
        path.join(ssrDir, 'package.json'),
        JSON.stringify({ dependencies: { nuxt: '3.15.0' }, devDependencies: { '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(ssrDir, 'src', 'App.vue'),
        [
          '<script setup lang="ts">',
          'const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;',
          '</script>',
          '<template>',
          '  <span v-if="localStorage.theme === \'dark\'">Moon</span>',
          '</template>',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(ssrDir, 'playwright.config.ts'),
        'export default { projects: [{ name: "desktop", use: { colorScheme: "light" } }] };\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(ssrDir, 'e2e', 'home.spec.ts'),
        'import { test, expect } from "@playwright/test";\ntest("renders", async ({ page }) => { await page.goto("/"); });\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(ssrDir);
      const findings = res.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01');
      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.severity === 'MEDIUM')).toBe(true);
      expect(findings.some((f) => f.file === 'src/App.vue' && f.line === 5)).toBe(true);
      expect(findings.some((f) => f.file === 'playwright.config.ts')).toBe(true);
    });

    it('passes compliant dual-colorScheme + hydration console guard SSR projects and respects qa-ssr-hydration-ok pragma', async () => {
      const okDir = path.join(tmpDir, 'vite-ssg-ok');
      fs.mkdirSync(path.join(okDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(okDir, 'e2e'), { recursive: true });
      fs.writeFileSync(
        path.join(okDir, 'package.json'),
        JSON.stringify({ dependencies: { 'vite-ssg': '0.24.0', vue: '3.5.0' }, devDependencies: { '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(okDir, 'src', 'main.ts'),
        'const darkMq = window.matchMedia("(prefers-color-scheme: dark)");\nconsole.log(darkMq.matches);\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(okDir, 'src', 'App.vue'),
        '<template><span class="dark:hidden">Sun</span><span class="hidden dark:inline">Moon</span></template>\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(okDir, 'playwright.config.ts'),
        [
          'export default {',
          '  projects: [',
          "    { name: 'light', use: { colorScheme: 'light' } },",
          "    { name: 'dark', use: { colorScheme: 'dark' } },",
          '  ],',
          '};',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(okDir, 'e2e', 'hydration.e2e.ts'),
        [
          'import { test, expect } from "@playwright/test";',
          'test("no hydration warnings", async ({ page }) => {',
          '  const errors: string[] = [];',
          '  page.on("console", (msg) => { if (/hydration/i.test(msg.text())) errors.push(msg.text()); });',
          '  page.on("pageerror", (err) => { if (/hydration/i.test(err.message)) errors.push(err.message); });',
          '  await page.goto("/");',
          '  expect(errors).toEqual([]);',
          '});',
        ].join('\n'),
        'utf8'
      );

      const okRes = await auditSecurityStigOwasp(okDir);
      expect(okRes.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toHaveLength(0);

      // Pragma exemptions
      const exemptDir = path.join(tmpDir, 'ssr-pragma');
      fs.mkdirSync(path.join(exemptDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(exemptDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '15.1.0' }, devDependencies: { '@playwright/test': '1.52.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(exemptDir, 'src', 'Toggle.tsx'),
        [
          'const themeMode = "prefers-color-scheme";',
          '// qa-ssr-hydration-ok',
          '<div v-if="localStorage.theme === \'dark\'">{themeMode}</div>',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(exemptDir, 'playwright.config.ts'),
        '// qa-ssr-hydration-ok\nexport default { use: { colorScheme: "light" } };\n',
        'utf8'
      );
      const exemptRes = await auditSecurityStigOwasp(exemptDir);
      expect(exemptRes.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01')).toHaveLength(0);
    });
  });

  describe('QA-HEALTH-01 Hardening & vendor Exclusion', () => {
    it('flags multiline .done() + .cancelled() supervisor loops lacking .exception()', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'supervisor.py'),
        [
          'def supervise(tasks):',
          '    for task in tasks:',
          '        if task.done():',
          '            if task.cancelled():',
          '                continue',
          '            return False',
          '    return True',
        ].join('\n'),
        'utf8'
      );
      const res = await auditSecurityStigOwasp(tmpDir);
      const findings = res.findings.filter((f) => f.rule_id === 'QA-HEALTH-01');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toBe('src/supervisor.py');
      expect(findings[0]?.line).toBe(3);
    });

    it('rejects per-function @patch/AsyncMock probe tests while passing once an unmocked test function verifies the probe', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'Dockerfile'),
        'FROM python:3.12-slim\nHEALTHCHECK CMD test -f /tmp/worker.ready\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'runner.py'),
        [
          'from pathlib import Path',
          'WORKER_HEARTBEAT_PATH = Path("/tmp/worker.ready")',
          'def boot():',
          '    WORKER_HEARTBEAT_PATH.write_text("ok")',
        ].join('\n'),
        'utf8'
      );
      const testPath = path.join(tmpDir, 'tests', 'test_runner.unit.py');
      fs.writeFileSync(
        testPath,
        [
          'from unittest.mock import AsyncMock, patch',
          'from src.runner import WORKER_HEARTBEAT_PATH',
          '',
          '@patch("src.runner.spawn_worker", new_callable=AsyncMock)',
          'def test_mocked_worker(_mock_spawn):',
          '    assert WORKER_HEARTBEAT_PATH.exists()',
        ].join('\n'),
        'utf8'
      );

      const mockedOnlyRes = await auditSecurityStigOwasp(tmpDir);
      expect(mockedOnlyRes.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(1);

      fs.appendFileSync(
        testPath,
        [
          '',
          'def test_real_worker_boot_contract():',
          '    assert WORKER_HEARTBEAT_PATH.exists()',
          '',
        ].join('\n'),
        'utf8'
      );

      const withRealRes = await auditSecurityStigOwasp(tmpDir);
      expect(withRealRes.findings.filter((f) => f.rule_id === 'QA-HEALTH-01')).toHaveLength(0);
    });

    it('excludes vendor/ from auditSecurityStigOwasp and collectProjectFiles', async () => {
      fs.mkdirSync(path.join(tmpDir, 'vendor', 'acme', 'legacy'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'vendor', 'acme', 'legacy', 'evil.php'),
        '<?php eval($_GET["cmd"]);\n',
        'utf8'
      );
      fs.writeFileSync(path.join(tmpDir, 'src', 'ok.php'), "<?php echo 'ok';\n", 'utf8');

      const files = collectProjectFiles(tmpDir);
      expect(files).toContain('src/ok.php');
      expect(files).not.toContain('vendor/acme/legacy/evil.php');

      const res = await auditSecurityStigOwasp(tmpDir);
      expect(res.findings.filter((f) => f.file.startsWith('vendor/'))).toHaveLength(0);
    });

    it('F2.5 & F2.7: enforces SEC-PATH-01 across core tools and bounded TTY exit on slow autoSyncFn', async () => {
      await expect(inspectProjectConfig('/etc')).rejects.toThrow(WorkspacePathValidationError);
      await expect(auditSecurityStigOwasp('../outside')).rejects.toThrow(WorkspacePathValidationError);
      await expect(auditTestPyramidGaps(os.tmpdir())).rejects.toThrow(WorkspacePathValidationError);
      await expect(runEphemeralQa(os.homedir(), 'lint')).rejects.toThrow(WorkspacePathValidationError);
      await expect(
        proposeSkillEvolutionPr({
          project_path: '/etc',
          target_blueprint_file: '.agents/skills/qa-11x-architect/SKILL.md',
          improvement_title: 'Invalid path check',
          empirical_rationale: 'SEC-PATH-01 boundary check.',
          proposed_content_or_snippet: '### Check\nok',
          prefer_offline_fallback: true,
        })
      ).rejects.toThrow(WorkspacePathValidationError);

      const prevDisableSync = process.env.QA_DISABLE_AUTO_SYNC;
      process.env.QA_DISABLE_AUTO_SYNC = '0';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const exitCodes: number[] = [];
      const start = Date.now();
      try {
        await main([], undefined, {
          exitFn: (c) => exitCodes.push(c),
          autoSyncFn: () => new Promise(() => undefined),
          isStdinTty: true,
        });
        expect(Date.now() - start).toBeLessThan(2_000);
        expect(exitCodes).toEqual([0]);
        expect(logSpy).toHaveBeenCalledWith(INTERACTIVE_TTY_NOTICE);
      } finally {
        logSpy.mockRestore();
        if (prevDisableSync === undefined) {
          delete process.env.QA_DISABLE_AUTO_SYNC;
        } else {
          process.env.QA_DISABLE_AUTO_SYNC = prevDisableSync;
        }
      }
    });
  });
});
