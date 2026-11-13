// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DECISION_GO,
  DECISION_NO_GO,
  DECISION_SKIPPED,
  DEFAULT_RELEASE_GATE_THRESHOLDS,
  EVALUATE_RELEASE_GATE_TOOL,
  SCOPE_FULL,
  SCOPE_SMOKE,
  evaluateReleaseReadiness,
  handleEvaluateReleaseGate,
} from '../src/tools/evaluateReleaseGate.js';

const PASSING_JUNIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- suite funcional nominal -->
<testsuites>
  <testsuite name="api" tests="3" failures="0" errors="0" skipped="0">
    <testcase classname="auth.spec.ts" name="rotates session token" />
    <testcase classname="rls.spec.ts" name="isolates tenant rows">
      <system-out><![CDATA[ok > 0]]></system-out>
    </testcase>
    <testcase name="healthcheck returns ok" />
  </testsuite>
</testsuites>`;

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-release-gate-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('evaluateReleaseGate MCP tool (T2.6)', () => {
  it('expone la definición MCP EVALUATE_RELEASE_GATE_TOOL con esquema estricto', () => {
    expect(EVALUATE_RELEASE_GATE_TOOL.name).toBe('evaluate_release_gate');
    expect(EVALUATE_RELEASE_GATE_TOOL.inputSchema.additionalProperties).toBe(false);
    expect(DEFAULT_RELEASE_GATE_THRESHOLDS.minPassRatePct).toBe(100);
    expect(DEFAULT_RELEASE_GATE_THRESHOLDS.maxP95Ms).toBe(500);
  });

  it('retorna GO limpio con salida Pass-Quiet de 1 línea y timestamp normalizado a UTC (Z)', () => {
    const result = evaluateReleaseReadiness({
      scope: SCOPE_FULL,
      timestamp: '2026-11-13T18:30:00-04:00',
      junitXmlContent: PASSING_JUNIT_XML,
      telemetry: {
        error_rate_pct: 0.25,
        latency_p95_ms: 180,
        latency_p99_ms: 420,
        active_incidents: 0,
      },
      defects: {
        open_blockers: 0,
        open_criticals: 0,
        qa_escapes: 0,
      },
    });

    expect(result.decision).toBe(DECISION_GO);
    expect(result.dryRun).toBe(true);
    expect(result.gateSkipped).toBe(false);
    expect(result.evaluatedAtUtc).toBe('2026-11-13T22:30:00.000Z');
    expect(result.junit.totalTests).toBe(3);
    expect(result.junit.executedTests).toBe(3);
    expect(result.junit.passRatePct).toBe(100);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.summary).not.toContain('\n');
    expect(result.summary).toContain('GO');

    const mcpRes = handleEvaluateReleaseGate({
      junitXmlContent: PASSING_JUNIT_XML,
      telemetry: { metrics: { errorRatePct: 0.1, p95Ms: 120, p99Ms: 300 }, activeIncidents: 0 },
      defects: { openBlockers: 0, openCriticals: 0, qaEscapes: 0 },
    });
    expect(mcpRes.isError).toBe(false);
  });

  it('retorna SKIPPED con gateSkipped=true en scope smoke (cero PASS hardcodeado)', () => {
    const result = evaluateReleaseReadiness({
      scope: SCOPE_SMOKE,
      junitXmlContent: '<testsuite tests="0" />',
      telemetry: { error_rate_pct: 25, p95_ms: 2500 },
      defects: { open_blockers: 4 },
    });

    expect(result.decision).toBe(DECISION_SKIPPED);
    expect(result.gateSkipped).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.evaluatedAtUtc.endsWith('Z')).toBe(true);
    expect(result.summary).toContain('SKIPPED');
    expect(result.summary).not.toContain('\n');

    const mcpRes = handleEvaluateReleaseGate({ scope: SCOPE_SMOKE });
    expect(mcpRes.isError).toBe(false);
    expect(mcpRes.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('SKIPPED'),
    });
  });

  it('retorna NO_GO (ZERO_TESTS_EXECUTED) cuando scope=full tiene 0 pruebas o todas omitidas', () => {
    const emptyRes = evaluateReleaseReadiness({ scope: SCOPE_FULL });
    expect(emptyRes.decision).toBe(DECISION_NO_GO);
    expect(emptyRes.blockingReasons.map((r) => r.code)).toContain('ZERO_TESTS_EXECUTED');

    const zeroXmlRes = evaluateReleaseReadiness({
      junitXmlContent: '<testsuites tests="0" failures="0" errors="0" skipped="0" />',
    });
    expect(zeroXmlRes.decision).toBe(DECISION_NO_GO);
    expect(zeroXmlRes.blockingReasons[0]?.code).toBe('ZERO_TESTS_EXECUTED');

    const allSkippedXml = `
      <testsuite tests="2" failures="0" errors="0" skipped="2">
        <testcase name="skip-a"><skipped /></testcase>
        <testcase name="skip-b"><skipped /></testcase>
      </testsuite>`;
    const skippedRes = evaluateReleaseReadiness({ junitXmlContent: allSkippedXml });
    expect(skippedRes.decision).toBe(DECISION_NO_GO);
    expect(skippedRes.junit.executedTests).toBe(0);
    expect(skippedRes.blockingReasons[0]?.code).toBe('ZERO_TESTS_EXECUTED');
  });

  it('detecta fallos y errores JUnit con nombres de testcase y calcula passRatePct', () => {
    const failingCases = Array.from({ length: 22 }, (_, i) =>
      `<testcase classname='suite' name='case-${i}'><failure message="boom">trace</failure><failure /></testcase>`
    ).join('');
    const xml = `
      <testsuite tests="24" failures="22" errors="1" skipped="0">
        ${failingCases}
        <testcase name="err-case"><error message="crash" /><error /></testcase>
        <testcase name="ok-case" />
      </testsuite>`;

    const result = evaluateReleaseReadiness({ junitXmlContent: xml });
    expect(result.decision).toBe(DECISION_NO_GO);
    expect(result.junit.failures).toBe(22);
    expect(result.junit.errors).toBe(1);
    expect(result.junit.failedTests).toHaveLength(20);
    expect(result.junit.failedTests[0]).toBe('suite::case-0');
    expect(result.junit.passRatePct).toBe(4.17);
    const codes = result.blockingReasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(['JUNIT_FAILURES', 'JUNIT_ERRORS', 'PASS_RATE_BELOW_THRESHOLD'])
    );
    expect(result.summary).toContain('Tests fallidos:');
  });

  it('evalúa las 3 señales sin cortocircuitar y respeta dryRun vs enforce', () => {
    const args = {
      junitXmlContent: '<testsuites tests="2" failures="1" errors="0" skipped="0"><testcase name="t1"><failure /></testcase><testcase name="t2" /></testsuites>',
      telemetry: {
        errorRatePct: 2.5,
        p95Ms: 750,
        p99Ms: 1400,
        activeIncidents: 2,
      },
      defects: {
        open_blockers: 1,
        open_criticals: 3,
        qa_escapes: 2,
      },
    };

    const dryRes = handleEvaluateReleaseGate(args);
    expect(dryRes.isError).toBe(false);

    const evalRes = evaluateReleaseReadiness({ ...args, enforce: true });
    expect(evalRes.dryRun).toBe(false);
    expect(evalRes.decision).toBe(DECISION_NO_GO);
    const codes = evalRes.blockingReasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'JUNIT_FAILURES',
        'PASS_RATE_BELOW_THRESHOLD',
        'ERROR_RATE_EXCEEDED',
        'LATENCY_P95_EXCEEDED',
        'LATENCY_P99_EXCEEDED',
        'ACTIVE_INCIDENTS_EXCEEDED',
        'OPEN_BLOCKERS_EXCEEDED',
        'OPEN_CRITICALS_EXCEEDED',
        'QA_ESCAPES_EXCEEDED',
      ])
    );

    const enforcedRes = handleEvaluateReleaseGate({ ...args, dryRun: false });
    expect(enforcedRes.isError).toBe(true);

    const relaxedGo = evaluateReleaseReadiness({
      junitXmlContent: PASSING_JUNIT_XML,
      telemetry: { p95_ms: 600 },
      thresholds: { maxP95Ms: 700 },
      maxErrorRatePct: 2,
      enforce: true,
    });
    expect(relaxedGo.decision).toBe(DECISION_GO);
    expect(handleEvaluateReleaseGate({
      junitXmlContent: PASSING_JUNIT_XML,
      enforce: true,
    }).isError).toBe(false);
  });

  it('bloquea determinísticamente payloads XXE (<!DOCTYPE y <!ENTITY) incluso en dryRun/smoke', () => {
    const doctypeXml =
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><testsuite tests="1" />';
    const doctypeRes = handleEvaluateReleaseGate({
      scope: SCOPE_SMOKE,
      dryRun: true,
      junitXmlContent: doctypeXml,
    });
    expect(doctypeRes.isError).toBe(true);
    expect(doctypeRes.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('XXE_DETECTED'),
    });

    const entityEval = evaluateReleaseReadiness({
      junitXmlContent: '<!entity xxe "boom"><testsuite tests="1" />',
    });
    expect(entityEval.hasSecurityOrParseError).toBe(true);
    expect(entityEval.blockingReasons[0]?.code).toBe('XXE_DETECTED');
  });

  it('bloquea Path Traversal, bytes nulos, symlinks externos y entradas inválidas', () => {
    const ws = createTempWorkspace();
    const outsideDir = createTempWorkspace();
    const outsideFile = path.join(outsideDir, 'secret.xml');
    fs.writeFileSync(outsideFile, PASSING_JUNIT_XML, 'utf8');
    const symlinkPath = path.join(ws, 'escape.xml');
    fs.symlinkSync(outsideFile, symlinkPath);

    const traversal = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlPath: '../../etc/passwd',
    });
    expect(traversal.blockingReasons[0]?.code).toBe('PATH_TRAVERSAL');

    const nullByte = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlPath: 'junit\0.xml',
    });
    expect(nullByte.blockingReasons[0]?.code).toBe('PATH_TRAVERSAL');

    const emptyPath = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlPath: '   ',
    });
    expect(emptyPath.blockingReasons[0]?.code).toBe('INVALID_INPUT');

    const missingFile = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlPath: 'missing.xml',
    });
    expect(missingFile.blockingReasons[0]?.code).toBe('FILE_NOT_FOUND');

    const symlinkEscape = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlPath: 'escape.xml',
    });
    expect(symlinkEscape.blockingReasons[0]?.code).toBe('PATH_TRAVERSAL');

    const invalidInputs = evaluateReleaseReadiness({
      workspaceRoot: ws,
      scope: 'canary' as unknown as typeof SCOPE_FULL,
      timestamp: 'not-a-date',
      junitXmlContent: '<testsuite><unclosed>',
      telemetry: { p95_ms: -5 },
      defects: [] as unknown as Record<string, unknown>,
      maxP99Ms: -10,
    });
    expect(invalidInputs.hasSecurityOrParseError).toBe(true);
    expect(handleEvaluateReleaseGate({ timestamp: '' }).isError).toBe(true);
  });

  it('rechaza XML mal formado, sin nodo testsuite o JSON corrupto desde archivo', () => {
    const ws = createTempWorkspace();
    fs.writeFileSync(path.join(ws, 'bad.json'), '{not-json', 'utf8');
    fs.writeFileSync(path.join(ws, 'array.json'), '[1, 2]', 'utf8');

    const badXmlCases = [
      '<!-- unclosed',
      '<?pi unclosed',
      '<![CDATA[unclosed',
      '<testsuite',
      '<testsuite><testcase></testsuite>',
      '<><testsuite /></>',
      '<other />',
    ];
    for (const xml of badXmlCases) {
      const res = evaluateReleaseReadiness({ junitXmlContent: xml });
      expect(res.hasSecurityOrParseError).toBe(true);
      expect(res.blockingReasons[0]?.code).toBe('INVALID_XML');
    }

    const badJson = evaluateReleaseReadiness({
      workspaceRoot: ws,
      junitXmlContent: PASSING_JUNIT_XML,
      telemetryJsonPath: 'bad.json',
      defectsJsonPath: 'array.json',
    });
    expect(badJson.hasSecurityOrParseError).toBe(true);
    expect(badJson.blockingReasons.map((r) => r.code)).toEqual(['INVALID_JSON', 'INVALID_JSON']);
  });

  it('lee correctamente archivos reales JUnit XML, telemetría JSON y defectos JSON desde disco', () => {
    const ws = createTempWorkspace();
    fs.writeFileSync(path.join(ws, 'junit.xml'), PASSING_JUNIT_XML, 'utf8');
    fs.writeFileSync(
      path.join(ws, 'telemetry.json'),
      JSON.stringify({ error_rate_pct: 0.4, p95_ms: 210, p99_ms: 490, active_incidents: 0 }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(ws, 'defects.json'),
      JSON.stringify({ open_blockers: 0, open_criticals: 0, qa_escapes: 0 }),
      'utf8'
    );

    const res = handleEvaluateReleaseGate({
      workspaceRoot: ws,
      junitXmlPath: 'junit.xml',
      telemetryJsonPath: 'telemetry.json',
      defectsJsonPath: 'defects.json',
      enforce: true,
    });
    expect(res.isError).toBe(false);
    expect(res.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('GO'),
    });
  });

  it('cubre ramas borde de parseo XML, atributos vacíos, bloques terminales y fallback de workspace', () => {
    const edgeXml = `<testsuite tests="" failures="notnum" name="edge > suite">
      <testcase />
      <testcase><skipped /><skipped /></testcase>
      <failure /><error /><skipped />
    </testsuite>\n<!-- end -->`;
    const edgeRes = evaluateReleaseReadiness({
      junitXmlContent: edgeXml,
    });
    expect(edgeRes.decision).toBe(DECISION_NO_GO);
    expect(edgeRes.junit.failures).toBe(1);
    expect(edgeRes.junit.errors).toBe(1);

    const moreBadXml = [
      '<   />',
      '</>',
      '<testsuite name="a" <broken />',
      '<testsuite name="unclosed />',
      '<testsuite>',
    ];
    for (const xml of moreBadXml) {
      const res = evaluateReleaseReadiness({ junitXmlContent: xml });
      expect(res.hasSecurityOrParseError).toBe(true);
    }

    const unquotedAttrRes = evaluateReleaseReadiness({
      junitXmlContent: '<testsuite name=unquoted />',
    });
    expect(unquotedAttrRes.decision).toBe(DECISION_NO_GO);

    const defaultWsRes = evaluateReleaseReadiness({
      junitXmlPath: 'nonexistent-file-for-default-ws.xml',
    });
    expect(defaultWsRes.blockingReasons[0]?.code).toBe('FILE_NOT_FOUND');
  });
});
