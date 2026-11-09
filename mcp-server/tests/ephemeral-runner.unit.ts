// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile, execFileSync } from 'child_process';
import { runEphemeralQa, isDocsOnlyWorkspaceChange } from '../src/tools/ephemeral-runner.js';

describe('ephemeral-runner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('retorna fallo estructurado si el proyecto carece de Makefile', async () => {
    const result = await runEphemeralQa(tempDir, 'unit');

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe(1);
    expect(result.stage).toBe('unit');
    expect(result.failed_tests.length).toBe(1);
    expect(result.failed_tests[0].error_summary).toContain('No se encontró archivo Makefile');
  });

  it('ejecuta make exitosamente y procesa la salida nominal con execFileFn mockeado', async () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-unit:\n\t@echo "Running tests"\n');

    const mockExecFile = ((file: string, args: readonly string[] | null | undefined, options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      expect(file).toBe('make');
      expect(args).toEqual(['qa-unit']);
      const optRecord = options as Record<string, unknown>;
      expect(optRecord.cwd).toBe(path.resolve(tempDir));
      expect(optRecord.shell).toBe(false);

      const fakeStdout = 'All files | 98.00 | 95.00 | 100.0 | 98.00 |\n20 passed';
      callback(null, fakeStdout, '');
    }) as unknown as typeof execFile;

    const result = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockExecFile });

    expect(result.status).toBe('PASSED');
    expect(result.stage).toBe('unit');
    expect(result.exit_code).toBe(0);
    expect(result.coverage.detected).toBe(true);
    expect(result.coverage.percent).toBe(98.0);
    expect(result.coverage.passed).toBe(true);
  });

  it('procesa correctamente la salida cuando make falla (exit code != 0)', async () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-lint:\n\t@exit 1\n');

    const mockExecFile = ((file: string, args: readonly string[] | null | undefined, options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      const err = new Error('Command failed: make qa-lint') as Error & { code?: number };
      err.code = 2;
      const fakeStdout = 'src/app.py:10:1: F401 unused import';
      callback(err, fakeStdout, 'Error detected');
    }) as unknown as typeof execFile;

    const result = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockExecFile });

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe(2);
    expect(result.linter_and_complexity_issues.length).toBeGreaterThanOrEqual(1);
  });

  it('maneja timeouts estableciendo exit_code=124 y agregando advertencia en tail_log', async () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-bdd:\n\t@sleep 100\n');

    const mockExecFile = ((file: string, args: readonly string[] | null | undefined, options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      const err = new Error('Command timed out') as Error & { killed?: boolean; signal?: string };
      err.killed = true;
      err.signal = 'SIGTERM';
      callback(err, 'Running BDD scenarios...', '');
    }) as unknown as typeof execFile;

    const result = await runEphemeralQa(tempDir, 'bdd', 10, { execFileFn: mockExecFile });

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe(124);
    expect(result.tail_log).toContain('[TIMEOUT]');
  });

  it('maneja errores genéricos sin error.code numérico', async () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-all:\n\t@true\n');

    const mockExecFile = ((file: string, args: readonly string[] | null | undefined, options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      const err = new Error('Generic execution error');
      callback(err, '', 'Stderr error');
    }) as unknown as typeof execFile;

    const result = await runEphemeralQa(tempDir, 'all', 60, { execFileFn: mockExecFile });

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe(1);
  });

  it('isDocsOnlyWorkspaceChange detecta cuando git status contiene solo cambios en *.md o archivos documentales en docs/', () => {
    const mockGitDocsOnly = (() => ' M README.md\n?? docs/specs/12_reconcile.md\nR  OLD.md -> CHANGELOG.md\n M docs/diagram.svg\n') as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tempDir, mockGitDocsOnly)).toBe(true);

    const mockGitMixed = (() => ' M README.md\n M src/server.ts\n') as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tempDir, mockGitMixed)).toBe(false);

    const mockGitCodeInDocs = (() => ' M docs/exploit.py\n') as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tempDir, mockGitCodeInDocs)).toBe(false);

    const mockGitEmpty = (() => '\n') as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tempDir, mockGitEmpty)).toBe(false);

    const mockGitError = (() => {
      throw new Error('git not initialized');
    }) as unknown as typeof execFileSync;
    expect(isDocsOnlyWorkspaceChange(tempDir, mockGitError)).toBe(false);
  });

  it('aplica Fast-Path Docs-Only devolviendo SKIPPED y detected=false cuando skipIfDocsOnly=true y solo cambiaron archivos Markdown', async () => {
    const mockGitDocsOnly = (() => ' M README.md\n M CHANGELOG.md\n') as unknown as typeof execFileSync;
    const result = await runEphemeralQa(tempDir, 'unit', 60, {
      skipIfDocsOnly: true,
      execFileSyncFn: mockGitDocsOnly,
    });

    expect(result.status).toBe('SKIPPED');
    expect(result.exit_code).toBe(0);
    expect(result.coverage.detected).toBe(false);
    expect(result.coverage.percent).toBe(0);
    expect(result.coverage.passed).toBe(false);
    expect(result.tail_log).toContain('[Fast-Path Docs-Only]');
  });
});
