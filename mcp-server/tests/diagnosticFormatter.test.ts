// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { describe, expect, it } from 'vitest';
import {
  buildFailureArtifactPath,
  cleanDiagnosticExcerpt,
  formatDiagnosticOutput,
  formatFailVerboseReport,
  formatPassQuietSummary,
  sanitizeCommandSecrets,
  toAllureDiagnosticEnvelope,
} from '../src/utils/diagnosticFormatter.js';

describe('diagnosticFormatter (T1.5 Pass-Quiet & Fail-Verbose + Allure)', () => {
  describe('1. Modo Pass-Quiet', () => {
    it('emite exactamente 1 línea compacta e ignora logs crudos extensos', () => {
      const noisyStdout = Array.from({ length: 120 }, (_, idx) => `\u001b[32mverbose line ${idx}\u001b[0m`).join('\n');
      const summary = formatPassQuietSummary({
        stageId: 'vitest-unit\nline',
        passed: true,
        checksCount: 350,
        durationMs: 1420,
        stdout: noisyStdout,
        stderr: '\u001b[33mwarning noise\u001b[0m',
        agentInfo: { environment: 'ci-docker-node26' },
      });

      expect(summary.includes('\n')).toBe(false);
      expect(summary).toContain('stage=vitest-unit line');
      expect(summary).toContain('checks=350');
      expect(summary).toContain('duration=1420ms');
      expect(summary).toContain('env=ci-docker-node26');
      expect(summary).not.toContain('verbose line');

      const routed = formatDiagnosticOutput({
        stageId: 'lint-check',
        passed: true,
        durationMs: 210,
      });
      expect(routed.includes('\n')).toBe(false);
      expect(routed).toContain('checks=1');
      expect(routed).toContain('env=docker-ephemeral');
    });
  });

  describe('2. Modo Fail-Verbose y Sanitización de Secretos/ANSI', () => {
    it('emite diagnóstico accionable con pasos previos, ANSI limpio, credenciales redactadas y evidencia', () => {
      const screenshotPath = buildFailureArtifactPath('Checkout / Step #2!', 'png');
      const htmlDumpPath = buildFailureArtifactPath('---checkout-step---', 'html');
      const tracePath = buildFailureArtifactPath('!!!', 'zip');
      expect(screenshotPath).toBe('artifacts/failures/Checkout-Step-2.png');
      expect(htmlDumpPath).toBe('artifacts/failures/checkout-step.html');
      expect(tracePath).toBe('artifacts/failures/stage.zip');

      const fakeToken = 'ghp_' + 'Z'.repeat(24);
      const rawCmd =
        `curl -H "Authorization: Bearer super-jwt-secret" https://admin:s3cr3tPass@reg.local/pkg?token=abc123 --password mypass ${fakeToken}`;

      const report = formatDiagnosticOutput({
        stageId: 'gate-3-json',
        passed: false,
        durationMs: 85,
        command: rawCmd,
        exitCode: 2,
        stderr: [
          '\u001b[31mError: duplicate key "save"\u001b[0m',
          '\u001b[31mError: duplicate key "save"\u001b[0m',
          '  at i18n/es.json:14',
        ].join('\n'),
        stdout: 'trace line',
        steps: [
          { name: 'init-container', status: 'passed', durationMs: 12 },
          { name: 'json-parse', status: 'failed', durationMs: 73, detail: 'duplicate key' },
        ],
        remediationHint: 'Remove duplicated JSON keys in locale file.',
        evidence: { screenshotPath, htmlDumpPath, tracePath },
        agentInfo: {
          agentName: 'antigravity-bot',
          agentVersion: '2.21.0',
          environment: 'github-actions-ubuntu',
          buildId: 'run-991',
        },
      });

      expect(report).toContain('stage=gate-3-json | status=FAILED | exitCode=2 | duration=85ms');
      expect(report).toContain('Bearer [REDACTED]');
      expect(report).toContain('https://admin:[REDACTED]@reg.local');
      expect(report).toContain('token=[REDACTED]');
      expect(report).toContain('--password [REDACTED]');
      expect(report).not.toContain('super-jwt-secret');
      expect(report).not.toContain('s3cr3tPass');
      expect(report).not.toContain('abc123');
      expect(report).not.toContain('mypass');
      expect(report).not.toContain(fakeToken);
      expect(report).not.toContain('\u001b[31m');
      expect(report).toContain('[PASSED] init-container (12ms)');
      expect(report).toContain('[FAILED] json-parse (73ms) (duplicate key)');
      expect(report).toContain('remediationHint: Remove duplicated JSON keys in locale file.');
      expect(report).toContain(`failure-screenshot: ${screenshotPath}`);
      expect(report).toContain(`dom-snapshot: ${htmlDumpPath}`);
      expect(report).toContain(`execution-trace: ${tracePath}`);
      expect(report).toContain('name=antigravity-bot | version=2.21.0 | env=github-actions-ubuntu | build=run-991');
    });

    it('aplica fallbacks limpios cuando faltan command, steps, evidence y salidas', () => {
      const report = formatFailVerboseReport({
        stageId: 'minimal-fail',
        passed: false,
        durationMs: 10,
      });
      expect(report).toContain('command: <unspecified>');
      expect(report).toContain('exitCode=1');
      expect(report).toContain('steps: (none recorded)');
      expect(report).toContain('No diagnostic output captured.');
      expect(report).toContain('Re-run the failing stage in an isolated QA-11X ephemeral container');
      expect(report).not.toContain('evidence:');

      expect(sanitizeCommandSecrets('echo safe')).toBe('echo safe');
      expect(cleanDiagnosticExcerpt('\n\nline-a\nline-a\nline-b\nline-c\n', 2)).toBe('line-b\nline-c');
    });
  });

  describe('3. Adaptador JSON compatible con Allure (toAllureDiagnosticEnvelope)', () => {
    it('genera estados passed, failed y broken con las 3 etiquetas independientes y adjuntos', () => {
      const passedEnv = toAllureDiagnosticEnvelope({
        stageId: 'unit-suite',
        passed: true,
        checksCount: 12,
        durationMs: 400,
      });
      expect(passedEnv.status).toBe('passed');
      expect(passedEnv.steps).toEqual([]);
      expect(passedEnv.attachments).toEqual([]);
      expect(passedEnv.labels).toEqual([
        { name: 'agent', value: 'qa-11x-agent' },
        { name: 'agent_version', value: '2.20.3' },
        { name: 'environment', value: 'docker-ephemeral' },
      ]);

      const brokenEnv = toAllureDiagnosticEnvelope({
        stageId: 'karate-e2e',
        passed: false,
        broken: true,
        exitCode: 124,
        durationMs: 5000,
        stderr: 'TASK_STUCK timeout reached',
        steps: [{ name: 'boot-db', status: 'passed', durationMs: 300 }],
        evidence: { screenshotPath: 'artifacts/failures/karate-e2e.png' },
        agentInfo: {
          agentName: 'claude-code',
          agentVersion: '2.20.4',
          environment: 'staging-runner',
          buildId: 'build-77',
        },
      });
      expect(brokenEnv.status).toBe('broken');
      expect(brokenEnv.buildId).toBe('build-77');
      expect(brokenEnv.statusDetails.message).toContain('karate-e2e broken (exitCode=124)');
      expect(brokenEnv.statusDetails.trace).toBe('TASK_STUCK timeout reached');
      expect(brokenEnv.steps).toEqual([
        { name: 'boot-db', status: 'passed', stage: 'finished', durationMs: 300 },
      ]);
      expect(brokenEnv.attachments).toEqual([
        {
          name: 'failure-screenshot',
          source: 'artifacts/failures/karate-e2e.png',
          type: 'image/png',
        },
      ]);
      expect(brokenEnv.labels).toEqual([
        { name: 'agent', value: 'claude-code' },
        { name: 'agent_version', value: '2.20.4' },
        { name: 'environment', value: 'staging-runner' },
      ]);
    });
  });
});
