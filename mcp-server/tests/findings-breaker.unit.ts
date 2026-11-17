// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { execFile, execFileSync } from 'child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CERTIFY_STATE_REL_PATH,
  EXIT_BREAKER_42,
  computeFindingFingerprint,
  isEphemeralQaArtifactPath,
  normalizeFindingForFingerprint,
  recordQaStageEvidence,
  recordQaStageFindingsState,
  resetQaFindingsState,
  resolveQaSessionKey,
} from '../src/services/qa-evidence.js';
import { isDocsOnlyWorkspaceChange, runEphemeralQa } from '../src/tools/ephemeral-runner.js';

function createMockGitExec(branch = 'main', mergeBase = 'abc1234567890000'): typeof execFileSync {
  return ((cmd: string, args?: readonly string[]) => {
    if (cmd !== 'git' || !args) return '';
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return `${branch}\n`;
    if (args[0] === 'merge-base') return `${mergeBase}\n`;
    if (args[0] === 'rev-parse' && args[1] === '--verify') return 'deadbeef12345678\n';
    if (args[0] === 'status') return ' M README.md\n?? .agents/.cache/certify_state.json\n';
    return '';
  }) as unknown as typeof execFileSync;
}

describe('Hito 22: Memoria determinista de hallazgos y cortacircuitos BREAKER-42', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-breaker-'));
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normaliza hallazgos invariantes a líneas, rutas y secretos y clasifica artefactos efímeros', () => {
    expect(isEphemeralQaArtifactPath('')).toBe(true);
    expect(isEphemeralQaArtifactPath('.agents/.cache/certify_state.json')).toBe(true);
    expect(isEphemeralQaArtifactPath('sub/.agents/artifacts/PR_VERDICT.md')).toBe(true);
    expect(isEphemeralQaArtifactPath('graphify-out/graph.json')).toBe(true);
    expect(isEphemeralQaArtifactPath('src/server.ts')).toBe(false);

    const tokenSecret = 'ghp_' + 'Z'.repeat(20);
    const bearerSecret = 'Bearer ' + 'tok_' + 'secret77';

    const normA = normalizeFindingForFingerprint(
      {
        layer: 'lint',
        stack: 'ts',
        file: `${tmpDir}/src\\auth.ts:14:2`,
        rule: 'TS2322',
        message: `line 14 at 0x7f8a1c0020b0 in /tmp/run1/a.ts took 42.5ms at 2026-11-14T19:40:52Z ${tokenSecret} ${bearerSecret}`,
      },
      tmpDir
    );
    const normB = normalizeFindingForFingerprint(
      {
        layer: 'lint',
        stack: 'ts',
        path: '/app/src/auth.ts(128, 9)',
        code: 'TS2322',
        error_summary:
          'line 128 at 0x00001234abcd in /tmp/run9/b.ts took 3s at 2026-12-01T00:00:00+00:00 [REDACTED] Bearer [REDACTED]',
      },
      tmpDir
    );

    expect(normA.fingerprint).toBe(normB.fingerprint);
    expect(normA.relative_file).toBe('src/auth.ts');
    expect(normA.canonical_message).not.toContain(tokenSecret);
    expect(normA.canonical_message).not.toContain('secret77');

    const emptyNorm = normalizeFindingForFingerprint({ file: '/app/' }, tmpDir);
    expect(emptyNorm.relative_file).toBe('<unknown>');
    expect(emptyNorm.rule_or_test_name).toBe('<unspecified>');
    expect(computeFindingFingerprint(emptyNorm)).toBe(emptyNorm.fingerprint);
  });

  it('resuelve claves de sesión por rama/merge-base y soporta detached, HEAD fallback y nogit', () => {
    expect(resolveQaSessionKey(tmpDir, createMockGitExec('feat/hito-22', '1234567890abcdef'))).toBe(
      'feat/hito-22:1234567890ab'
    );

    const mockDetachedNoMerge = ((cmd: string, args?: readonly string[]) => {
      if (cmd !== 'git' || !args) return '';
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'HEAD\n';
      if (args[0] === 'merge-base') throw new Error('no merge-base');
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'cafebabe99887766\n';
      return '';
    }) as unknown as typeof execFileSync;
    expect(resolveQaSessionKey(tmpDir, mockDetachedNoMerge)).toBe('detached:cafebabe9988');

    const mockUnborn = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.[1] === '--abbrev-ref') return 'main\n';
      return '';
    }) as unknown as typeof execFileSync;
    expect(resolveQaSessionKey(tmpDir, mockUnborn)).toBe('main:unborn');

    const mockErrorGit = (() => {
      throw new Error('git unavailable');
    }) as unknown as typeof execFileSync;
    expect(resolveQaSessionKey(tmpDir, mockErrorGit)).toBe('nogit:unborn');
  });

  it('dispara BREAKER-42 en racha=3 y oscilación A->B->A, aísla stages/ramas, aplica tope 10 y permite reset', () => {
    const gitMain = createMockGitExec('main');
    const gitFeat = createMockGitExec('feat/other');

    const ignored = recordQaStageFindingsState(tmpDir, 'dast', [], {
      maxStreak: 3,
      execFileSyncFn: gitMain,
    });
    expect(ignored.triggered).toBe(false);
    expect(ignored.code).toBeNull();

    const findingA = { file: 'src/a.ts:10:1', rule: 'E1', message: 'Error A' };
    const findingB = { file: 'src/b.ts:20:1', rule: 'E2', message: 'Error B' };
    const findingC = { file: 'src/c.ts:30:1', rule: 'E3', message: 'Error C' };

    expect(recordQaStageFindingsState(tmpDir, 'unit', [findingA], { execFileSyncFn: gitMain }).triggered).toBe(false);
    // Stage diferente (lint limpio) no interfiere ni oscila sobre unit
    expect(recordQaStageFindingsState(tmpDir, 'lint', [], { execFileSyncFn: gitMain }).triggered).toBe(false);
    const secondUnit = recordQaStageFindingsState(tmpDir, 'unit', [findingA], { execFileSyncFn: gitMain });
    expect(secondUnit.triggered).toBe(false);
    expect(secondUnit.max_streak_observed).toBe(2);

    // Rama diferente inicia limpia y corta racha previa al haber una corrida limpia intercalada
    expect(recordQaStageFindingsState(tmpDir, 'unit', [findingA], { execFileSyncFn: gitFeat }).max_streak_observed).toBe(1);
    expect(recordQaStageFindingsState(tmpDir, 'ci', [], { execFileSyncFn: gitMain }).triggered).toBe(false);
    expect(recordQaStageFindingsState(tmpDir, 'ci', [findingA], { execFileSyncFn: gitMain }).max_streak_observed).toBe(1);
    const secondCi = recordQaStageFindingsState(tmpDir, 'ci', [findingA], { execFileSyncFn: gitMain });
    expect(secondCi.max_streak_observed).toBe(2);
    expect(secondCi.triggered).toBe(false);

    // Tercer fallo consecutivo en main/unit dispara BREAKER_42
    const thirdUnit = recordQaStageFindingsState(tmpDir, 'unit', [findingA], { execFileSyncFn: gitMain });
    expect(thirdUnit.triggered).toBe(true);
    expect(thirdUnit.code).toBe('BREAKER_42');
    expect(thirdUnit.max_streak_observed).toBe(3);

    // Verificar permisos 0700 / 0600
    const stateFile = path.join(tmpDir, CERTIFY_STATE_REL_PATH);
    expect(fs.statSync(path.dirname(stateFile)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(stateFile).mode & 0o777).toBe(0o600);

    // Reset de sesión actual mantiene la otra rama intacta
    const resetKey = resetQaFindingsState(tmpDir, gitMain);
    expect(resetKey).toBe('main:abc123456789');

    // Oscilación A -> B -> A en lint dispara inmediatamente
    expect(recordQaStageFindingsState(tmpDir, 'lint', [findingA], { execFileSyncFn: gitMain }).triggered).toBe(false);
    expect(recordQaStageFindingsState(tmpDir, 'lint', [findingB], { execFileSyncFn: gitMain }).triggered).toBe(false);
    const osc = recordQaStageFindingsState(tmpDir, 'lint', [findingA, findingC], { execFileSyncFn: gitMain });
    expect(osc.triggered).toBe(true);
    expect(osc.oscillations_observed).toBe(1);
    expect(osc.blocking_findings).toHaveLength(1);
    expect(osc.blocking_findings[0]?.status).toBe('REGRESSION_OSCILLATION');

    // Límite máximo de 10 corridas retenidas por stage
    for (let idx = 0; idx < 12; idx += 1) {
      recordQaStageFindingsState(
        tmpDir,
        'integration',
        [{ file: `src/i_${idx}.ts`, rule: 'R', message: `M ${idx}` }],
        { maxStreak: 3, execFileSyncFn: gitMain }
      );
    }
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as {
      sessions: Record<string, { stage_runs: Record<string, unknown[]> }>;
    };
    expect(persisted.sessions[resetKey]?.stage_runs.integration).toHaveLength(10);
    expect(persisted.sessions['feat/other:abc123456789']?.stage_runs.unit).toHaveLength(1);
  });

  it('recupera ante JSON/esquema corrupto y bloquea symlinks en certify_state.json o su directorio padre', () => {
    const gitMain = createMockGitExec('main');
    const stateFile = path.join(tmpDir, CERTIFY_STATE_REL_PATH);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, '{corrupt', 'utf8');
    expect(recordQaStageFindingsState(tmpDir, 'lint', [], { execFileSyncFn: gitMain }).triggered).toBe(false);

    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, sessions: [] }), 'utf8');
    expect(recordQaStageFindingsState(tmpDir, 'lint', [], { execFileSyncFn: gitMain }).triggered).toBe(false);

    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        version: 1,
        sessions: {
          'main:abc123456789': null,
          weird: { updated_at: 42, runs: 'bad', stage_runs: { unit: [], invalid: 'x' } },
        },
      }),
      'utf8'
    );
    expect(recordQaStageFindingsState(tmpDir, 'lint', [], { execFileSyncFn: gitMain }).triggered).toBe(false);

    const extTarget = path.join(tmpDir, 'outside.json');
    fs.writeFileSync(extTarget, '{}', 'utf8');
    fs.rmSync(stateFile, { force: true });
    fs.symlinkSync(extTarget, stateFile);
    expect(() => recordQaStageFindingsState(tmpDir, 'lint', [], { execFileSyncFn: gitMain })).toThrow(/symlink/);

    fs.rmSync(path.dirname(stateFile), { recursive: true, force: true });
    const extDir = path.join(tmpDir, 'outside-dir');
    fs.mkdirSync(extDir);
    fs.symlinkSync(extDir, path.dirname(stateFile));
    expect(() => resetQaFindingsState(tmpDir, gitMain)).toThrow(/symlink/);
  });

  it('runEphemeralQa activa BREAKER_42 (exit_code=42) tras 3 fallos en make y en fallback docker, e ignora cache en DOCS_ONLY', async () => {
    const gitMock = createMockGitExec('main');
    expect(isDocsOnlyWorkspaceChange(tmpDir, gitMock)).toBe(true);

    const onlyCacheGit = (() => '?? .agents/.cache/certify_state.json\n') as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tmpDir, onlyCacheGit)).toBe(false);

    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-lint:\n\t@exit 1\n', 'utf8');
    const mockMakeFail = ((
      _file: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      const err = Object.assign(new Error('lint error'), { code: 1 });
      cb(err, 'src/service.ts:10:1: F401 unused import', '');
    }) as unknown as typeof execFile;

    const r1 = await runEphemeralQa(tmpDir, 'lint', 30, { execFileFn: mockMakeFail, execFileSyncFn: gitMock });
    const r2 = await runEphemeralQa(tmpDir, 'lint', 30, { execFileFn: mockMakeFail, execFileSyncFn: gitMock });
    const r3 = await runEphemeralQa(tmpDir, 'lint', 30, { execFileFn: mockMakeFail, execFileSyncFn: gitMock });

    expect(r1.exit_code).toBe(1);
    expect(r1.circuit_breaker).toBeUndefined();
    expect(r2.exit_code).toBe(1);
    expect(r3.status).toBe('FAILED');
    expect(r3.exit_code).toBe(EXIT_BREAKER_42);
    expect(r3.circuit_breaker?.triggered).toBe(true);
    expect(r3.circuit_breaker?.code).toBe('BREAKER_42');
    expect(r3.tail_log).toContain('[Fail-Verbose] stage=lint:BREAKER_42');
    expect(r3.tail_log).toContain('inspect_ast_blast_radius');
    expect(r3.tail_log).toContain('qa-11x-systematic-debugging');

    // También en fallback Docker (make ENOENT) con failed_tests y fallback de tail_log genérico
    fs.writeFileSync(
      path.join(tmpDir, 'Makefile'),
      'qa-unit:\n\t@docker compose -f docker-compose.qa.yml run --rm qa-php composer qa:unit\n',
      'utf8'
    );
    const mockDockerFail = ((
      file: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      cb(Object.assign(new Error('unit error'), { code: 2 }), 'FAILED tests/test_api.py::test_auth - AssertionError', '');
    }) as unknown as typeof execFile;

    await runEphemeralQa(tmpDir, 'unit', 30, { execFileFn: mockDockerFail, execFileSyncFn: gitMock });
    await runEphemeralQa(tmpDir, 'unit', 30, { execFileFn: mockDockerFail, execFileSyncFn: gitMock });
    const u3 = await runEphemeralQa(tmpDir, 'unit', 30, { execFileFn: mockDockerFail, execFileSyncFn: gitMock });
    expect(u3.exit_code).toBe(EXIT_BREAKER_42);
    expect(u3.circuit_breaker?.code).toBe('BREAKER_42');

    // Fallo genérico sin linter_and_complexity_issues ni failed_tests (fallback tail_log)
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-integration:\n\t@exit 5\n', 'utf8');
    const mockRawFail = ((
      _file: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(Object.assign(new Error('generic fail'), { code: 5 }), '', '');
    }) as unknown as typeof execFile;

    await runEphemeralQa(tmpDir, 'integration', 30, { execFileFn: mockRawFail, execFileSyncFn: gitMock });
    await runEphemeralQa(tmpDir, 'integration', 30, { execFileFn: mockRawFail, execFileSyncFn: gitMock });
    const i3 = await runEphemeralQa(tmpDir, 'integration', 30, { execFileFn: mockRawFail, execFileSyncFn: gitMock });
    expect(i3.exit_code).toBe(EXIT_BREAKER_42);
  });

  it('recordQaStageEvidence captura fallo de escritura en catch y normaliza workspace root "/"', () => {
    const roRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-ro-ev-'));
    try {
      fs.mkdirSync(path.join(roRoot, '.git'), { recursive: true });
      fs.writeFileSync(path.join(roRoot, '.agents'), 'blocking-file', 'utf8');
      expect(() =>
        recordQaStageEvidence(roRoot, 'lint', 'PASSED', createMockGitExec('main'))
      ).not.toThrow();
    } finally {
      fs.rmSync(roRoot, { recursive: true, force: true });
    }

    const slashNorm = normalizeFindingForFingerprint({ file: '/src/app.ts' }, '/');
    expect(slashNorm.relative_file).toBe('src/app.ts');

    // Persiste streaks[stage] y oscillations[stage] en certify_state.json
    const streakRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa11x-streaks-'));
    try {
      const gitMock = createMockGitExec('feat/streaks');
      const finding = [{ file: 'src/a.ts', line: 10, message: 'err', severity: 'error' as const }];
      recordQaStageFindingsState(streakRoot, 'lint', finding, { execFileSyncFn: gitMock });
      recordQaStageFindingsState(streakRoot, 'lint', finding, { execFileSyncFn: gitMock });

      const afterStreak = JSON.parse(
        fs.readFileSync(path.join(streakRoot, CERTIFY_STATE_REL_PATH), 'utf-8')
      ) as {
        sessions: Record<string, { streaks?: Record<string, number> }>;
      };
      expect(Object.values(afterStreak.sessions)[0]?.streaks?.lint).toBe(2);

      recordQaStageFindingsState(streakRoot, 'lint', [], { execFileSyncFn: gitMock });
      recordQaStageFindingsState(streakRoot, 'lint', finding, { execFileSyncFn: gitMock });

      const persisted = JSON.parse(
        fs.readFileSync(path.join(streakRoot, CERTIFY_STATE_REL_PATH), 'utf-8')
      ) as {
        sessions: Record<
          string,
          { streaks?: Record<string, number>; oscillations?: Record<string, number> }
        >;
      };
      const session = Object.values(persisted.sessions)[0];
      expect(session?.streaks?.lint).toBe(1);
      expect(session?.oscillations?.lint).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(streakRoot, { recursive: true, force: true });
    }
  });
});
