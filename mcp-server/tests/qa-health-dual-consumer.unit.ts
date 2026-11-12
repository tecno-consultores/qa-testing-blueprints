// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
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
      expect(healthFindings[0].severity).toBe('HIGH');
      expect(healthFindings[0].file).toBe(path.join('src', 'workers', 'supervisor.py'));
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
      expect(healthFindings[0].file).toBe(path.join('src', 'workers', 'runner.py'));
      expect(healthFindings[0].message).toContain('/tmp/worker_heartbeat');
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
        async () => {
          throw new Error('gh not installed');
        }
      );
      expect(fallbackRes.status).toBe('PROPOSAL_FILE_AND_URL_GENERATED');
      expect(
        fs.readFileSync(fallbackRes.local_proposal_file, 'utf8')
      ).toContain('Recordatorio Dual-Consumer Obligatorio');
    });
  });
});
