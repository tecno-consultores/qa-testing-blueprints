// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { execFile, execFileSync } from 'child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunEphemeralQaInputSchema, CertifyGateInputSchema } from '../src/types.js';
import {
  computeCodeStateFingerprint,
  recordQaStageEvidence,
  checkLintEvidenceForDirtyCode,
  extractPathsFromPorcelainLine,
  QA_EVIDENCE_REL_PATH,
} from '../src/services/qa-evidence.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';

describe('Paridad Pre-Push 1:1 con CI (QA Evidence, Stages integration/ci, Dynamic Routes & PG17/Python Invariants)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-prepush-parity-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupMinimalCompliantProject(dir: string): void {
    fs.writeFileSync(path.join(dir, 'TESTING.md'), '# Testing QA 11X\nCoverage >= 95%\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Update\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Makefile'), 'qa-lint:\n\t@echo ok\n', 'utf8');
  }

  it('acepta los nuevos stages migration, integration y ci en RunEphemeralQaInputSchema y require_lint_evidence en CertifyGateInputSchema', () => {
    for (const st of ['migration', 'integration', 'ci', 'lint', 'unit', 'all']) {
      const parsed = RunEphemeralQaInputSchema.parse({ project_path: tmpDir, stage: st });
      expect(parsed.stage).toBe(st);
    }

    const gateDefault = CertifyGateInputSchema.parse({ project_path: tmpDir });
    expect(gateDefault.require_lint_evidence).toBe(true);
  });

  it('bloquea certify11xGate cuando hay cambios de código sucios en Git sin evidencia lint y aprueba tras runEphemeralQa(lint)', async () => {
    setupMinimalCompliantProject(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'service.ts'), 'export const v = 1;\n', 'utf8');

    let porcelainOutput = ' M src/service.ts\n M CHANGELOG.md\n';
    const mockExecSync = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.[0] === 'status') return porcelainOutput;
      if (cmd === 'git' && args?.[0] === 'rev-parse') return 'abc1234deadbeef\n';
      return '';
    }) as unknown as typeof execFileSync;

    // 1. Sin evidencia previa -> bloqueado
    const blocked = await certify11xGate(tmpDir, { execFileSyncFn: mockExecSync });
    expect(blocked.gate_passed).toBe(false);
    expect(blocked.checks.lint_evidence_verified).toBe(false);
    expect(blocked.blockers.some((b) => b.includes('stage="lint"'))).toBe(true);

    // 2. Con requireLintEvidence: false -> permite omitir explícitamente
    const skippedLintGate = await certify11xGate(tmpDir, {
      requireLintEvidence: false,
      execFileSyncFn: mockExecSync,
    });
    expect(skippedLintGate.checks.lint_evidence_verified).toBe(true);

    // 3. Si runEphemeralQa falla -> NO graba sello
    const mockExecFail = ((
      _file: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      const err = Object.assign(new Error('lint fail'), { code: 1 });
      cb(err, '', 'error TS2322');
    }) as unknown as typeof execFile;

    const failedLint = await runEphemeralQa(tmpDir, 'lint', 30, {
      execFileFn: mockExecFail,
      execFileSyncFn: mockExecSync,
    });
    expect(failedLint.status).toBe('FAILED');
    expect(fs.existsSync(path.join(tmpDir, QA_EVIDENCE_REL_PATH))).toBe(false);

    // 4. Si runEphemeralQa(stage="lint") pasa -> graba sello y desbloquea certify11xGate
    const mockExecPass = ((
      _file: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(null, 'All checks passed', '');
    }) as unknown as typeof execFile;

    const passedLint = await runEphemeralQa(tmpDir, 'lint', 30, {
      execFileFn: mockExecPass,
      execFileSyncFn: mockExecSync,
    });
    expect(passedLint.status).toBe('PASSED');
    expect(fs.existsSync(path.join(tmpDir, QA_EVIDENCE_REL_PATH))).toBe(true);

    // Editar únicamente documentación (CHANGELOG.md / README.md) NO invalida el sello de código
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Docs updated after lint\n', 'utf8');
    porcelainOutput = ' M src/service.ts\n M CHANGELOG.md\n?? README.md\n';

    const certifiedAfterDocs = await certify11xGate(tmpDir, { execFileSyncFn: mockExecSync });
    expect(certifiedAfterDocs.checks.lint_evidence_verified).toBe(true);
    expect(certifiedAfterDocs.gate_passed).toBe(true);

    // 5. Si se vuelve a modificar el archivo de código -> el fingerprint cambia e invalida el sello
    fs.writeFileSync(path.join(tmpDir, 'src', 'service.ts'), 'export const v = 2;\n', 'utf8');
    const invalidated = await certify11xGate(tmpDir, { execFileSyncFn: mockExecSync });
    expect(invalidated.checks.lint_evidence_verified).toBe(false);
    expect(invalidated.gate_passed).toBe(false);

    // 6. Ejecutar stage="ci" acredita lint, unit e integration simultáneamente
    await runEphemeralQa(tmpDir, 'ci', 30, {
      execFileFn: mockExecPass,
      execFileSyncFn: mockExecSync,
    });
    const certifiedAfterCi = await certify11xGate(tmpDir, { execFileSyncFn: mockExecSync });
    expect(certifiedAfterCi.checks.lint_evidence_verified).toBe(true);
    expect(certifiedAfterCi.gate_passed).toBe(true);
  });

  it('cubre casos borde de qa-evidence (DOCS_ONLY, sub-stacks con .git padre, renames, UNBORN_HEAD y JSON corrupto)', () => {
    // Sin .git -> no exige evidencia y extractPaths soporta formato compacto con tabulador
    expect(extractPathsFromPorcelainLine('M\tsrc/tabbed.py')).toEqual(['src/tabbed.py']);
    expect(computeCodeStateFingerprint(tmpDir).isGitRepo).toBe(false);
    recordQaStageEvidence(tmpDir, 'lint', 'PASSED');
    recordQaStageEvidence(tmpDir, 'dast', 'PASSED');

    // Con .git en raíz y sub-stack hijo
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    const subStack = path.join(tmpDir, 'fastapi');
    fs.mkdirSync(subStack, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'subpkg'), { recursive: true });

    // Caso DOCS_ONLY + artefactos ignorados -> hasDirtyCodeChanges: false + CLEAN_HEAD stamp
    const mockDocsOnly = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.[0] === 'status') {
        return ' M README.md\n?? docs/arch.png\n?? graphify-out/graph.json\n?? .agents/.qa-evidence.json\n';
      }
      return '\n';
    }) as unknown as typeof execFileSync;

    const docsState = computeCodeStateFingerprint(subStack, mockDocsOnly);
    expect(docsState.isGitRepo).toBe(true);
    expect(docsState.hasDirtyCodeChanges).toBe(false);
    recordQaStageEvidence(subStack, 'unit', 'PASSED', mockDocsOnly);
    expect(checkLintEvidenceForDirtyCode(subStack, mockDocsOnly).passed).toBe(true);

    // Caso con rename entre comillas, directorio, archivo eliminado, >3 archivos y UNBORN_HEAD + evidencia corrupta
    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, QA_EVIDENCE_REL_PATH), '{corrupted-json', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'a.py'), 'x = 1\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'b.py'), 'x = 2\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'c.py'), 'x = 3\n', 'utf8');

    const mockComplexStatus = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.[0] === 'status') {
        return 'R  "old.py" -> "a.py"\n D deleted.py\n?? subpkg\n M b.py\n M c.py\n';
      }
      throw new Error('UNBORN_HEAD');
    }) as unknown as typeof execFileSync;

    const checkBefore = checkLintEvidenceForDirtyCode(subStack, mockComplexStatus);
    expect(checkBefore.passed).toBe(false);
    expect(checkBefore.blockers[0]).toContain('(+');

    recordQaStageEvidence(subStack, 'all', 'PASSED', mockComplexStatus);
    expect(checkLintEvidenceForDirtyCode(subStack, mockComplexStatus).passed).toBe(true);

    // Error al ejecutar git status -> fail-safe sin crashear
    const mockGitError = (() => {
      throw new Error('git binary missing');
    }) as unknown as typeof execFileSync;
    expect(computeCodeStateFingerprint(subStack, mockGitError).hasDirtyCodeChanges).toBe(false);
  });

  it('elimina falsos positivos en zero_orphan_api_endpoints ante template strings dinámicos (/routers${query}, /bridge/${subPath} y {path:path})', async () => {
    setupMinimalCompliantProject(tmpDir);
    const apiDir = path.join(tmpDir, 'fastapi', 'src', 'api', 'v1');
    const uiDir = path.join(tmpDir, 'vue3', 'src', 'views');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });

    fs.writeFileSync(
      path.join(apiDir, 'network.py'),
      [
        'from fastapi import APIRouter',
        'router = APIRouter(prefix="/api/v1")',
        '@router.get("/routers")',
        'async def list_routers(): return []',
        '@router.get("/bridge/ports")',
        'async def list_bridge_ports(): return []',
        '@router.post("/bridge/vlans/{vlan_id}")',
        'async def update_bridge_vlan(vlan_id: str): return {}',
        '@router.get("/files/{file_path:path}")',
        'async def download_file(file_path: str): return {}',
      ].join('\n'),
      'utf8'
    );

    fs.writeFileSync(
      path.join(uiDir, 'NetworkConsole.vue'),
      [
        '<template><div>Network</div></template>',
        '<script setup lang="ts">',
        "const query = '?status=online';",
        'const subPath = "ports";',
        'http.get(`/api/v1/routers${query}`);',
        "http.get(`/api/v1/routers${query ? '?refresh=true' : ''}`);",
        'http.get(`/api/v1/bridge/${subPath}`);',
        'http.post(`/api/v1/bridge/${subPath}`);',
        'http.get(`/api/v1/files/backups/2026/core-router.rsc`);',
        '</script>',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(path.join(uiDir, 'NetworkConsole.unit.ts'), '// unit test\n', 'utf8');

    const okRes = await certify11xGate(tmpDir);
    expect(okRes.checks.zero_orphan_api_endpoints).toBe(true);

    // Verificar que una llamada 404 real sigue siendo detectada
    fs.appendFileSync(
      path.join(uiDir, 'NetworkConsole.vue'),
      '\n// llamada rota\nhttp.delete(`/api/v1/nonexistent/endpoint`);\n',
      'utf8'
    );
    const brokenRes = await certify11xGate(tmpDir);
    expect(brokenRes.checks.zero_orphan_api_endpoints).toBe(false);
    expect(brokenRes.blockers.some((b) => b.includes('/api/v1/nonexistent/endpoint'))).toBe(true);
  });

  it('audita QA-COV-01 (importlib en workflows/Makefiles), QA-MYPY-01 y QA-PG17-RLS (pg_tables.forcerowsecurity)', async () => {
    fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.mypy]\nstrict = true\n', 'utf8');
    fs.writeFileSync(
      path.join(tmpDir, 'Makefile'),
      'qa-lint:\n\tuv run ruff check src/\nqa-unit:\n\tpytest -o addopts="" --cov=src --cov-fail-under=95 tests/a.unit.py\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.github', 'workflows', 'ci.yml'),
      'steps:\n  - run: pytest -o addopts="" tests/b.unit.py\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'tests', 'test_rls.int.py'),
      'SQL = "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = \'public\'"\n',
      'utf8'
    );

    const badAudit = await auditSecurityStigOwasp(tmpDir);
    expect(badAudit.passed).toBe(false);
    const ruleIds = new Set(badAudit.findings.map((f) => f.rule_id));
    expect(ruleIds.has('QA-MYPY-01')).toBe(true);
    expect(ruleIds.has('QA-COV-01')).toBe(true);
    expect(ruleIds.has('QA-PG17-RLS')).toBe(true);
    expect(
      badAudit.findings.some(
        (f) => f.rule_id === 'QA-COV-01' && f.message.includes('--import-mode=importlib')
      )
    ).toBe(true);

    // Remediación completa -> 0 hallazgos HIGH/CRITICAL
    fs.writeFileSync(
      path.join(tmpDir, 'Makefile'),
      'qa-lint:\n\tuv run ruff check src/ && uv run mypy --strict --cache-dir=/tmp/mypy src/\nqa-unit:\n\tpytest -o addopts="" --import-mode=importlib --cov=src --cov-fail-under=95 tests/a.unit.py\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.github', 'workflows', 'ci.yml'),
      'steps:\n  - run: pytest -o addopts="" --import-mode=importlib --cov=src --cov-fail-under=95 tests/b.unit.py\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tests', 'test_rls.int.py'),
      'SQL = "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"\n',
      'utf8'
    );

    const cleanAudit = await auditSecurityStigOwasp(tmpDir);
    expect(cleanAudit.passed).toBe(true);
  });

  it('endurece automáticamente Makefile en SurgicalMerger con --import-mode=importlib y --cache-dir=/tmp/mypy', () => {
    const merger = new SurgicalMerger();
    const legacyMakefile = [
      'qa-lint:',
      '\tdocker run --rm app uv run mypy --strict src/',
      'qa-unit:',
      '\tdocker run --rm app pytest -o addopts="" tests/*.unit.py',
    ].join('\n');

    const res = merger.mergeMakefile(legacyMakefile, 'qa-ci: qa-lint qa-unit\n\t@echo ok\n');
    expect(res.merged).toContain('mypy --cache-dir=/tmp/mypy --strict src/');
    expect(res.merged).toContain('--import-mode=importlib');
    expect(res.merged).toContain('--cov=src --cov-fail-under=95');
    expect(res.merged).toContain('-e COVERAGE_FILE=/tmp/.coverage');
    expect(res.merged).toContain('qa-ci:');
  });
});
