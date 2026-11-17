// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TACTICAL_PATTERNS_SKILL_RESOURCE,
  TACTICAL_PATTERNS_SKILL_URI,
  readTacticalPatternsSkillResource,
} from '../src/resources/tacticalPatternsSkill.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import {
  SESSION_FLIGHT_RECORDER_TOOL,
  handleSessionFlightRecorder,
  recordStageCmdCheckpoint,
  runSessionFlightRecorder,
} from '../src/tools/sessionFlightRecorder.js';

describe('Flight Recorder Atómico (Tool #19 session_flight_recorder & Resource #13)', () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix = 'qa11x-fr-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

  it('sirve Resource #13 desde workspace contenido y con fallback offline > 250B en EN y ES', () => {
    expect(TACTICAL_PATTERNS_SKILL_RESOURCE.uri).toBe(TACTICAL_PATTERNS_SKILL_URI);

    const seededRepo = makeTempDir('qa11x-skill-repo-');
    const seededSkillDir = path.join(seededRepo, '.agents', 'skills', 'tactical-patterns-11x');
    fs.mkdirSync(seededSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(seededSkillDir, 'SKILL.md'),
      '# Tactical Patterns (`tactical-patterns-11x`)\n\n## 1. Complexity Gate Rescue\n- Guard Clauses\n',
      'utf8'
    );

    const enWorkspace = readTacticalPatternsSkillResource(seededRepo, 'en');
    expect(enWorkspace.source).toBe('workspace');
    expect(enWorkspace.text).toContain('Complexity Gate Rescue');

    const esWorkspace = readTacticalPatternsSkillResource(seededRepo, 'es');
    expect(esWorkspace.source).toBe('workspace');
    expect(esWorkspace.text).toContain('Patrones Tácticos 11X');
    expect(esWorkspace.text).toContain('Complexity Gate Rescue');

    const emptyDir = makeTempDir('qa11x-skill-empty-');
    const enFallback = readTacticalPatternsSkillResource(emptyDir, 'en');
    const esFallback = readTacticalPatternsSkillResource(emptyDir, 'es');
    expect(enFallback.source).toBe('embedded-fallback');
    expect(esFallback.source).toBe('embedded-fallback');
    expect(Buffer.byteLength(enFallback.text, 'utf8')).toBeGreaterThan(250);
    expect(Buffer.byteLength(esFallback.text, 'utf8')).toBeGreaterThan(250);

    // Bloqueo de symlink externo
    const extSkill = path.join(makeTempDir('qa11x-ext-'), 'SKILL.md');
    fs.writeFileSync(extSkill, '# External secret', 'utf8');
    const symWs = makeTempDir('qa11x-sym-');
    const skillDir = path.join(symWs, '.agents', 'skills', 'tactical-patterns-11x');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.symlinkSync(extSkill, path.join(skillDir, 'SKILL.md'));
    expect(readTacticalPatternsSkillResource(symWs, 'en').source).toBe('embedded-fallback');

    // Auto-resolución sin workspaceRoot usando QA_BLUEPRINTS_LOCAL_PATH y fallback cuando no existe
    const prevEnv = process.env.QA_BLUEPRINTS_LOCAL_PATH;
    process.env.QA_BLUEPRINTS_LOCAL_PATH = seededRepo;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(emptyDir);
    try {
      const fromEnv = readTacticalPatternsSkillResource(undefined, 'en');
      expect(fromEnv.source).toBe('workspace');
      delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
      const fromCwdFallback = readTacticalPatternsSkillResource(undefined, 'en');
      expect(fromCwdFallback.source === 'workspace' || fromCwdFallback.source === 'embedded-fallback').toBe(true);
    } finally {
      cwdSpy.mockRestore();
      if (prevEnv === undefined) {
        delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
      } else {
        process.env.QA_BLUEPRINTS_LOCAL_PATH = prevEnv;
      }
    }
  });

  it('save/recover/clear atómicos en modo native-ts: valida 140 chars, redacción SEC-06, 0600, Git vivo y compactación', async () => {
    expect(SESSION_FLIGHT_RECORDER_TOOL.name).toBe('session_flight_recorder');
    const wsDir = makeTempDir();
    const fakeGitExec = ((_bin: string, args: readonly string[]) => {
      const cmd = args.join(' ');
      if (cmd.includes('rev-parse --abbrev-ref')) return 'feat/hito-26\n';
      if (cmd.includes('rev-parse --short')) return 'abc9876\n';
      if (cmd.includes('status --porcelain')) {
        return ' M src/app.ts\n?? .agents/.cache/session_checkpoint.json\n M .agents/ACTIVE_TASK.md\nR  old.ts -> src/new.ts\n';
      }
      if (cmd.includes('diff --stat')) return ' 1 file changed, 10 insertions(+)\n';
      return '';
    }) as unknown as typeof execFileSync;

    // Acción ausente, inválida y validación fail-closed > 140 caracteres
    expect((await handleSessionFlightRecorder()).isError).toBe(true);
    const badAction = await handleSessionFlightRecorder({ project_path: wsDir, action: 'invalid' });
    expect(badAction.isError).toBe(true);
    const numAction = await runSessionFlightRecorder({
      project_path: wsDir,
      action: 42 as unknown as string,
    });
    expect(numAction.status).toBe('FAILED');
    const boolAction = await runSessionFlightRecorder({
      project_path: wsDir,
      action: false as unknown as string,
    });
    expect(boolAction.status).toBe('FAILED');

    const missingIntent = await runSessionFlightRecorder({
      project_path: wsDir,
      action: 'save',
      task_id: 'T1',
      active_step: 'P1',
    });
    expect(missingIntent.status).toBe('FAILED');

    const over140 = await handleSessionFlightRecorder({
      project_path: wsDir,
      action: 'save',
      task_id: 'T1',
      active_step: 'P1',
      intent_140chars: 'x'.repeat(141),
    });
    expect(over140.isError).toBe(true);
    expect((over140.content[0] as { text: string }).text).toContain('140');

    // Clear sin checkpoint previo funciona limpio
    const earlyClear = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'clear' },
      { execFileSyncFn: fakeGitExec }
    );
    expect(earlyClear.status).toBe('PASSED');
    expect(earlyClear.checkpoint).toBeNull();

    // Recover sin checkpoint falla con claridad
    const noStateRecover = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileSyncFn: fakeGitExec }
    );
    expect(noStateRecover.status).toBe('FAILED');

    // Save con secreto Bearer/token, códigos ANSI y muchos pasos (> 35 líneas compactadas)
    const manySteps = Array.from({ length: 40 }, (_, idx) => `STEP_${idx + 1}`);
    const saved = await handleSessionFlightRecorder(
      {
        project_path: wsDir,
        action: 'save',
        task_id: 'HITO-26',
        active_step: 'STEP_2',
        completed_steps: ['STEP_1'],
        planned_steps: manySteps,
        allowed_globs: ['src/**'],
        forbidden_globs: ['secrets/**'],
        intent_140chars: '\u001b[31mFix Bearer secret-abc\nwith api_key=mysecret\u001b[0m',
      },
      { execFileSyncFn: fakeGitExec, preferPythonCtl: false }
    );
    expect(saved.isError).toBe(false);
    const parsedSave = JSON.parse((saved.content[0] as { text: string }).text) as {
      checkpoint: { intent_140chars: string; branch: string; base_sha: string };
      active_task_markdown: string;
    };
    expect(parsedSave.checkpoint.branch).toBe('feat/hito-26');
    expect(parsedSave.checkpoint.base_sha).toBe('abc9876');
    expect(parsedSave.checkpoint.intent_140chars).not.toContain('secret-abc');
    expect(parsedSave.checkpoint.intent_140chars).not.toContain('mysecret');
    expect(parsedSave.checkpoint.intent_140chars).toContain('[REDACTED]');
    expect(parsedSave.active_task_markdown).toContain('AUTO-GENERATED BY checkpoint_ctl.py');
    expect(parsedSave.active_task_markdown).toContain('pasos compactados');
    expect(parsedSave.active_task_markdown.split(/\r?\n/).length).toBeLessThanOrEqual(41);

    const cpFile = path.join(wsDir, '.agents', '.cache', 'session_checkpoint.json');
    expect(fs.statSync(path.dirname(cpFile)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(cpFile).mode & 0o777).toBe(0o600);

    // Segundo save preserva listas anteriores si se omiten
    await runSessionFlightRecorder(
      {
        project_path: wsDir,
        action: 'save',
        task_id: 'HITO-26',
        active_step: 'STEP_3',
        intent_140chars: 'Continuar paso 3',
      },
      { execFileSyncFn: fakeGitExec, preferPythonCtl: false }
    );

    // Recover filtra .agents/.cache/* y .agents/ACTIVE_TASK.md del estado Git en vivo
    const recovered = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileSyncFn: fakeGitExec, preferPythonCtl: false }
    );
    expect(recovered.status).toBe('PASSED');
    expect(recovered.git_live?.dirty_files_excluding_cache).toEqual(['src/app.ts', 'src/new.ts']);
    expect(recovered.git_live?.diff_stat).toContain('1 file changed');

    // Clear cierra estado a CERTIFIED_CLEAN y proyecta CERTIFIED_CLEAN
    const cleared = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'clear', reason: 'Cerrado 10/10' },
      { execFileSyncFn: fakeGitExec, preferPythonCtl: false }
    );
    expect(cleared.status).toBe('PASSED');
    expect(cleared.checkpoint?.status).toBe('CERTIFIED_CLEAN');
    expect(cleared.active_task_markdown).toContain('**Estado:** CERTIFIED_CLEAN');
    expect(cleared.active_task_markdown).not.toContain('- [ ] ');
  });

  it('auto-hidrata desde ACTIVE_TASK.md previo, soporta modo nogit y rechaza symlinks / traversal', async () => {
    const wsDir = makeTempDir();
    const agentsDir = path.join(wsDir, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'ACTIVE_TASK.md'),
      [
        '# Active Task',
        'allowed_globs: [src/**]',
        'forbidden_globs: [.env]',
        '- [x] P1',
        '- [ ] P2',
      ].join('\n'),
      'utf8'
    );

    const failingGit = (() => {
      throw new Error('git unavailable');
    }) as unknown as typeof execFileSync;

    // Recover cuando no existe JSON pero sí ACTIVE_TASK.md previo
    const hydrated = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileSyncFn: failingGit, preferPythonCtl: false }
    );
    expect(hydrated.status).toBe('PASSED');
    expect(hydrated.checkpoint?.completed_steps).toEqual(['P1']);
    expect(hydrated.checkpoint?.allowed_globs).toEqual(['src/**']);
    expect(hydrated.checkpoint?.forbidden_globs).toEqual(['.env']);
    expect(hydrated.git_live?.branch).toBe('nogit');

    // Si ACTIVE_TASK.md se borró luego pero existe JSON, recover re-proyecta ACTIVE_TASK.md
    fs.mkdirSync(path.join(agentsDir, '.cache'), { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, '.cache', 'session_checkpoint.json'),
      JSON.stringify({
        schema_version: '1.0',
        status: 'IN_PROGRESS',
        updated_at: '2026-11-16T22:00:00Z',
        git_available: false,
        branch: 'nogit',
        base_sha: 'none',
        task_id: 'NO-MD',
        completed_steps: [],
        active_step: 'A1',
        planned_steps: ['A1'],
        allowed_globs: [],
        forbidden_globs: [],
        intent_140chars: 'Reproyectar md',
      }),
      { mode: 0o600 }
    );
    fs.rmSync(path.join(agentsDir, 'ACTIVE_TASK.md'), { force: true });
    const reprojected = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileSyncFn: failingGit, preferPythonCtl: false }
    );
    expect(reprojected.active_task_markdown).toContain('NO-MD');
    expect(fs.existsSync(path.join(agentsDir, 'ACTIVE_TASK.md'))).toBe(true);

    // Validación de rutas inválidas y symlink en .agents/.cache
    expect((await runSessionFlightRecorder({ project_path: '', action: 'recover' })).status).toBe('FAILED');
    expect((await runSessionFlightRecorder({ project_path: path.join(wsDir, 'nope'), action: 'recover' })).status).toBe('FAILED');

    const symDir = makeTempDir('qa11x-sym-cp-');
    const outsideDir = makeTempDir('qa11x-out-');
    fs.mkdirSync(path.join(symDir, '.agents'), { recursive: true });
    fs.symlinkSync(outsideDir, path.join(symDir, '.agents', '.cache'));
    const symRes = await runSessionFlightRecorder({ project_path: symDir, action: 'recover' });
    expect(symRes.status).toBe('FAILED');
    expect(symRes.error).toContain('symlink');

    // Symlink directo en ACTIVE_TASK.md también se rechaza
    const symFileWs = makeTempDir('qa11x-sym-file-');
    fs.mkdirSync(path.join(symFileWs, '.agents', '.cache'), { recursive: true });
    const extTargetFile = path.join(outsideDir, 'ext.md');
    fs.writeFileSync(extTargetFile, '# ext', 'utf8');
    fs.symlinkSync(extTargetFile, path.join(symFileWs, '.agents', 'ACTIVE_TASK.md'));
    const symFileRes = await runSessionFlightRecorder({ project_path: symFileWs, action: 'recover' });
    expect(symFileRes.status).toBe('FAILED');
    expect(symFileRes.error).toMatch(/symlink/i);

    // Unborn Git repo: rev-parse --abbrev-ref y --short fallan, symbolic-ref responde
    const unbornGit = ((_b: string, args: readonly string[]) => {
      const joined = args.join(' ');
      if (joined.includes('symbolic-ref')) return 'main\n';
      if (joined.includes('rev-parse')) throw new Error('ambiguous argument HEAD');
      return '';
    }) as unknown as typeof execFileSync;
    const unbornSave = await runSessionFlightRecorder(
      {
        project_path: wsDir,
        action: 'save',
        task_id: 'UNBORN-1',
        active_step: 'S1',
        intent_140chars: 'Probar rama unborn con symbolic-ref',
      },
      { execFileSyncFn: unbornGit, preferPythonCtl: false }
    );
    expect(unbornSave.checkpoint?.branch).toBe('main');
    expect(unbornSave.checkpoint?.base_sha).toBe('unborn');

    // project_path omitido usa process.cwd()
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(wsDir);
    try {
      const defaultCwdRecover = await runSessionFlightRecorder(
        { action: 'recover' },
        { execFileSyncFn: unbornGit, preferPythonCtl: false }
      );
      expect(defaultCwdRecover.checkpoint?.task_id).toBe('UNBORN-1');
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('delega a checkpoint_ctl.py cuando existe y cae a native-ts ante ENOENT; propaga errores Python', async () => {
    const wsDir = makeTempDir();
    const ctlDir = path.join(wsDir, '.agents', 'scripts');
    fs.mkdirSync(ctlDir, { recursive: true });
    fs.writeFileSync(path.join(ctlDir, 'checkpoint_ctl.py'), '# stub', 'utf8');

    const enoentExecFile = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: NodeJS.ErrnoException, out: string, err: string) => void) => {
      const err = new Error('spawn python3 ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      cb(err, '', '');
    }) as unknown as typeof execFile;

    const enoentFallback = await runSessionFlightRecorder(
      {
        project_path: wsDir,
        action: 'save',
        task_id: 'PY-FALLBACK',
        active_step: 'S1',
        intent_140chars: 'Fallback nativo si falta python3',
      },
      { execFileFn: enoentExecFile }
    );
    expect(enoentFallback.status).toBe('PASSED');
    expect(enoentFallback.backend).toBe('native-ts');

    const failPyExecFile = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: NodeJS.ErrnoException, out: string, err: string) => void) => {
      const err = new Error('exit 2') as NodeJS.ErrnoException;
      (err as { code?: number }).code = 2;
      cb(err, '', '[FAIL] intent supera 140 chars');
    }) as unknown as typeof execFile;

    const pyErrRes = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'clear', reason: 'test' },
      { execFileFn: failPyExecFile }
    );
    expect(pyErrRes.status).toBe('FAILED');
    expect(pyErrRes.backend).toBe('python-ctl');

    // Error con stderr vacío usa stdout/message fallback y sin activeTask previo para cubrir ramas python-ctl
    const noActivePyDir = makeTempDir('qa11x-py-clean-');
    fs.mkdirSync(path.join(noActivePyDir, '.agents', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(noActivePyDir, '.agents', 'scripts', 'checkpoint_ctl.py'), '# stub', 'utf8');
    const emptyStderrFail = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: Error, out: string, err: string) => void) => {
      cb(new Error('python failed'), '[FAIL] stdout error', '');
    }) as unknown as typeof execFile;
    const emptyStderrRes = await runSessionFlightRecorder(
      { project_path: noActivePyDir, action: 'clear' },
      { execFileFn: emptyStderrFail }
    );
    expect(emptyStderrRes.status).toBe('FAILED');
    expect(emptyStderrRes.error).toContain('stdout error');

    const okEmptyOutPy = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) => {
      cb(null, '', '');
    }) as unknown as typeof execFile;
    const pyNoFiles = await runSessionFlightRecorder(
      { project_path: noActivePyDir, action: 'clear' },
      { execFileFn: okEmptyOutPy }
    );
    expect(pyNoFiles.status).toBe('PASSED');
    expect(pyNoFiles.checkpoint).toBeNull();
    expect(pyNoFiles.summary_1line).toBe('[PASS] CLEAR');

    const seenCliCalls: string[][] = [];
    const okPyExecFile = ((_f: string, args: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) => {
      seenCliCalls.push([...args]);
      if (args.includes('recover')) {
        expect(args).toContain('--json');
        expect(args).not.toContain('--format');
        cb(
          null,
          JSON.stringify({
            has_checkpoint: true,
            checkpoint: { task_id: 'PY-OK', status: 'IN_PROGRESS' },
            live_git: { dirty_files: ['a.ts'] },
          }),
          ''
        );
        return;
      }
      if (args.includes('clear')) {
        expect(args).not.toContain('--reason');
        fs.rmSync(path.join(wsDir, '.agents', '.cache', 'session_checkpoint.json'), { force: true });
      }
      cb(null, '[PASS] CHECKPOINT | Task: PY-OK', '');
    }) as unknown as typeof execFile;

    const pySave = await runSessionFlightRecorder(
      {
        project_path: wsDir,
        action: 'save',
        task_id: 'PY-OK',
        active_step: 'S2',
        completed_steps: ['S1'],
        planned_steps: ['S2'],
        allowed_globs: ['src/**'],
        forbidden_globs: ['.env'],
        intent_140chars: 'Via Python CLI',
      },
      { execFileFn: okPyExecFile }
    );
    expect(pySave.status).toBe('PASSED');
    expect(pySave.backend).toBe('python-ctl');

    const pyRecover = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileFn: okPyExecFile }
    );
    expect(pyRecover.status).toBe('PASSED');
    expect(pyRecover.backend).toBe('python-ctl');
    expect(pyRecover.checkpoint?.task_id).toBe('PY-OK');
    expect(pyRecover.summary_1line).toContain('Dirty: 1');

    const pyClear = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'clear', reason: 'Cierre E2E' },
      { execFileFn: okPyExecFile }
    );
    expect(pyClear.status).toBe('PASSED');
    expect(pyClear.backend).toBe('python-ctl');
    expect(pyClear.checkpoint?.status).toBe('CERTIFIED_CLEAN');
    expect(seenCliCalls.some((c) => c.includes('--json'))).toBe(true);

    const virginRecoverPy = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) => {
      cb(null, JSON.stringify({ has_checkpoint: false, dirty_files: [] }), '');
    }) as unknown as typeof execFile;
    const pyVirginRecover = await runSessionFlightRecorder(
      { project_path: wsDir, action: 'recover' },
      { execFileFn: virginRecoverPy }
    );
    expect(pyVirginRecover.status).toBe('FAILED');
    expect(pyVirginRecover.checkpoint).toBeNull();
  });

  it('recordStageCmdCheckpoint es no-op fuera de sesión y runEphemeralQa inyecta [DIRECTIVE-11X] solo al fallar por complejidad', async () => {
    const idleWs = makeTempDir('qa11x-idle-');
    // Sin sesión previa ni rutas inexistentes crea archivos ni falla
    recordStageCmdCheckpoint('', { cmdName: 'qa-lint', exitCode: 0, summary1Line: 'PASSED' });
    recordStageCmdCheckpoint(idleWs, { cmdName: 'qa-lint', exitCode: 0, summary1Line: 'PASSED' });
    expect(fs.existsSync(path.join(idleWs, '.agents', '.cache', 'session_checkpoint.json'))).toBe(false);

    // Symlink inválido en .agents/.cache queda capturado de forma no bloqueante
    const brokenWs = makeTempDir('qa11x-rec-sym-');
    const outsideRec = makeTempDir('qa11x-rec-out-');
    fs.mkdirSync(path.join(brokenWs, '.agents'), { recursive: true });
    fs.symlinkSync(outsideRec, path.join(brokenWs, '.agents', '.cache'));
    expect(() =>
      recordStageCmdCheckpoint(brokenWs, { cmdName: 'qa-lint', exitCode: 1, summary1Line: 'FAIL' })
    ).not.toThrow();

    // Con sesión activa registra last_script_run y ephemeral-runner inyecta JIT [DIRECTIVE-11X] en fallo de complejidad
    const activeWs = makeTempDir('qa11x-active-');
    fs.writeFileSync(path.join(activeWs, 'Makefile'), 'qa-lint:\n\t@docker run --rm alpine true\n', 'utf8');
    await runSessionFlightRecorder(
      {
        project_path: activeWs,
        action: 'save',
        task_id: 'JIT-11X',
        active_step: 'S1',
        intent_140chars: 'Verificar registro automatico en runEphemeralQa',
      },
      { preferPythonCtl: false }
    );

    const mockExecPass = ((_b: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) => {
      cb(null, 'All checks passed', '');
    }) as unknown as typeof execFile;

    const passRes = await runEphemeralQa(activeWs, 'lint', 30, { execFileFn: mockExecPass });
    expect(passRes.status).toBe('PASSED');
    expect(passRes.tail_log).not.toContain('[DIRECTIVE-11X]');

    const afterPassCp = JSON.parse(
      fs.readFileSync(path.join(activeWs, '.agents', '.cache', 'session_checkpoint.json'), 'utf8')
    ) as { last_script_run?: { cmd: string; exit_code: number } };
    expect(afterPassCp.last_script_run?.cmd).toBe('qa-lint');
    expect(afterPassCp.last_script_run?.exit_code).toBe(0);

    const mockExecComplexFail = ((_b: string, _a: readonly string[], _o: unknown, cb: (e: NodeJS.ErrnoException, out: string, err: string) => void) => {
      const err = new Error('eslint failed') as NodeJS.ErrnoException;
      (err as { code?: number }).code = 1;
      cb(err, '', 'src/foo.ts:10:1 error Function has too many parameters (5) max-params');
    }) as unknown as typeof execFile;

    const failRes = await runEphemeralQa(activeWs, 'lint', 30, { execFileFn: mockExecComplexFail });
    expect(failRes.status).toBe('FAILED');
    expect(failRes.tail_log).toContain('[DIRECTIVE-11X]');
    expect(failRes.tail_log).toContain('tactical-patterns-11x');

    // Save posterior preserva prior.last_script_run y clear sin reason funciona limpio
    const nextSave = await runSessionFlightRecorder(
      {
        project_path: activeWs,
        action: 'save',
        task_id: 'JIT-11X',
        active_step: 'S2',
        intent_140chars: 'Preserva last_script_run previo',
      },
      { preferPythonCtl: false }
    );
    expect(nextSave.checkpoint?.last_script_run?.cmd).toBe('qa-lint');
    const clearNoReason = await runSessionFlightRecorder(
      { project_path: activeWs, action: 'clear' },
      { preferPythonCtl: false }
    );
    expect(clearNoReason.checkpoint?.status).toBe('CERTIFIED_CLEAN');
    expect(clearNoReason.checkpoint?.active_step).toBe('');
    expect(clearNoReason.checkpoint?.planned_steps).toEqual([]);
  });

  it('maneja JSON corrupto en checkpoint nativo/python y aborto por AbortSignal sin SyntaxError', async () => {
    const badWs = makeTempDir('qa11x-fr-corrupt-');
    const cacheDir = path.join(badWs, '.agents', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'session_checkpoint.json'), '{corrupt-json', 'utf8');

    const recoverCorrupt = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { preferPythonCtl: false }
    );
    expect(recoverCorrupt.status).toBe('FAILED');

    const scriptsDir = path.join(badWs, '.agents', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'checkpoint_ctl.py'), '# stub\n', 'utf8');
    const badPyExec = ((
      _b: string,
      _a: readonly string[],
      _o: unknown,
      cb: (e: null, out: string, err: string) => void
    ) => {
      cb(null, '{not-json-stdout', '');
    }) as unknown as typeof execFile;
    const pyCorruptRecover = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { execFileFn: badPyExec }
    );
    expect(pyCorruptRecover.status).toBe('FAILED');
    expect(pyCorruptRecover.error).toContain('corrupta');

    const okPySaveExec = ((
      _b: string,
      _a: readonly string[],
      _o: unknown,
      cb: (e: null, out: string, err: string) => void
    ) => {
      cb(null, '[PASS] SAVE', '');
    }) as unknown as typeof execFile;
    const pyCorruptDisk = await runSessionFlightRecorder(
      { project_path: badWs, action: 'save', task_id: 'T1', active_step: 'S1', intent_140chars: 'x' },
      { execFileFn: okPySaveExec }
    );
    expect(pyCorruptDisk.status).toBe('FAILED');

    const abortController = new AbortController();
    abortController.abort('cancelled flight recorder');
    const abortedRes = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { signal: abortController.signal }
    );
    expect(abortedRes.status).toBe('FAILED');
    expect(abortedRes.error).toBe('cancelled flight recorder');

    const errAbortRes = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { signal: AbortSignal.abort(new Error('abort-error-reason')) }
    );
    expect(errAbortRes.status).toBe('FAILED');
    expect(errAbortRes.error).toBe('abort-error-reason');

    const numAbortRes = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { signal: AbortSignal.abort(404) }
    );
    expect(numAbortRes.status).toBe('FAILED');
    expect(numAbortRes.error).toContain('abortado por timeout o cancelación');

    // JSON válido pero no-objeto ([]) en session_checkpoint.json (nativo y parseDiskCheckpointSafe)
    fs.writeFileSync(path.join(cacheDir, 'session_checkpoint.json'), '[]', 'utf8');
    const nativeArrayCp = await runSessionFlightRecorder(
      { project_path: badWs, action: 'recover' },
      { preferPythonCtl: false }
    );
    expect(nativeArrayCp.status).toBe('FAILED');

    const pyArrayDisk = await runSessionFlightRecorder(
      { project_path: badWs, action: 'save', task_id: 'T1', active_step: 'S1', intent_140chars: 'x' },
      { execFileFn: okPySaveExec }
    );
    expect(pyArrayDisk.status).toBe('FAILED');
    expect(pyArrayDisk.error).toContain('JSON de checkpoint inválido');
  });
});
