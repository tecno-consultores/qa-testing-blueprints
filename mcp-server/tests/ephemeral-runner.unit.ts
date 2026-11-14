// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile, execFileSync } from 'child_process';
import {
  runEphemeralQa,
  isDocsOnlyWorkspaceChange,
  tokenizeCommandArgs,
  expandMakefileVariables,
  resolveMakefileDockerRecipes,
  resolveComposeDirectFallback,
} from '../src/tools/ephemeral-runner.js';

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

  it('tokenizeCommandArgs y expandMakefileVariables resuelven comillas, escapes y variables Make', () => {
    expect(tokenizeCommandArgs(`docker compose -f 'a b.yml' run --rm qa-php sh -c "echo \\"hi\\" && echo 'ok'"`)).toEqual([
      'docker',
      'compose',
      '-f',
      'a b.yml',
      'run',
      '--rm',
      'qa-php',
      'sh',
      '-c',
      `echo "hi" && echo 'ok'`,
    ]);
    expect(tokenizeCommandArgs(`docker run 'unclosed`)).toEqual(['docker', 'run', 'unclosed']);
    expect(tokenizeCommandArgs(`docker run "unclosed\\`)).toEqual(['docker', 'run', 'unclosed\\']);

    const vars = new Map<string, string>([
      ['COMPOSE_FILE', 'docker-compose.qa.yml'],
      ['SVC', 'qa-php'],
    ]);
    const expanded = expandMakefileVariables(
      '-f $(COMPOSE_FILE) ${SVC} $$(id -u) $(MISSING) $(UNCLOSED $',
      vars
    );
    expect(expanded).toBe('-f docker-compose.qa.yml qa-php $(id -u)  $(UNCLOSED $');

    const uidGid = expandMakefileVariables('$(shell id -u):$(shell id -g)', vars);
    expect(uidGid).toMatch(/^\d+:\d+$/);
  });

  it('resolveMakefileDockerRecipes resuelve dependencias, ?=, export :=, continuaciones \\ y aplica guardia Regla Cero', () => {
    const makefile = [
      '.PHONY: qa-lint qa-unit qa-all',
      'COMPOSE_FILE = docker-compose.qa.yml',
      'COMPOSE_FILE ?= other.yml',
      'export QA_UID := $(shell id -u)',
      'SERVICE_NAME := qa-php',
      '',
      'qa-lint:',
      '\t@echo "Lint"',
      '\t# comment inside recipe',
      '\t@docker compose -f $(COMPOSE_FILE) run --rm $(SERVICE_NAME) \\',
      '\t\tcomposer run-script qa:lint',
      '',
      'qa-unit:',
      '\t@docker run --rm -v $(CURDIR):/var/www sinfallas/basephpcomposer:8.5 composer qa:unit',
      '',
      'qa-all: qa-lint qa-unit qa-lint',
      '\t@printf "done"',
    ].join('\n');

    const resolved = resolveMakefileDockerRecipes(makefile, 'qa-all', '/tmp/proj');
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.commands).toEqual([
        ['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', 'qa-php', 'composer', 'run-script', 'qa:lint'],
        ['run', '--rm', '-v', '/tmp/proj:/var/www', 'sinfallas/basephpcomposer:8.5', 'composer', 'qa:unit'],
      ]);
    }

    const circular = resolveMakefileDockerRecipes('qa-a: qa-b\nqa-b: qa-a\n', 'qa-a', '/tmp/proj');
    expect(circular.ok).toBe(false);

    const missing = resolveMakefileDockerRecipes('qa-lint:\n\t@docker run alpine true\n', 'qa-unit', '/tmp/proj');
    expect(missing.ok).toBe(false);

    const emptyDocker = resolveMakefileDockerRecipes('qa-unit:\n\t@echo "only banner"\n', 'qa-unit', '/tmp/proj');
    expect(emptyDocker.ok).toBe(false);

    const hostExec = resolveMakefileDockerRecipes('qa-unit:\n\tpytest -q\n', 'qa-unit', '/tmp/proj');
    expect(hostExec.ok).toBe(false);
    if (!hostExec.ok) {
      expect(hostExec.reason).toContain('Regla Cero');
    }
  });

  it('runEphemeralQa activa fallback docker cuando make falla con ENOENT (éxito, error y timeout)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'Makefile'),
      [
        'COMPOSE_FILE = docker-compose.qa.yml',
        'qa-unit:',
        '\t@echo "Running unit"',
        '\t@docker compose -f $(COMPOSE_FILE) run --rm qa-php composer qa:unit',
      ].join('\n')
    );

    const calls: Array<{ file: string; args: readonly string[]; shell: unknown }> = [];
    const mockSuccess = ((
      file: string,
      args: readonly string[],
      options: Record<string, unknown>,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      calls.push({ file, args, shell: options.shell });
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      cb(null, 'All files | 97.50 | 95.00 | 100.0 | 97.50 |\n12 passed', '');
    }) as unknown as typeof execFile;

    const okResult = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockSuccess });
    expect(okResult.status).toBe('PASSED');
    expect(okResult.coverage.percent).toBe(97.5);
    expect(okResult.tail_log).toContain('[Fallback Rule Zero sin GNU make -> docker]');
    expect(calls.map((c) => c.file)).toEqual(['make', 'docker']);
    expect(calls[1].shell).toBe(false);
    expect(calls[1].args).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', 'qa-php', 'composer', 'qa:unit']);

    const mockDockerFail = ((
      file: string,
      _args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      cb(Object.assign(new Error('docker failed'), { code: 3 }), '', 'Error detected in container');
    }) as unknown as typeof execFile;

    const failResult = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockDockerFail });
    expect(failResult.status).toBe('FAILED');
    expect(failResult.exit_code).toBe(3);

    const mockDockerTimeout = ((
      file: string,
      _args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      cb(Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' }), '', '');
    }) as unknown as typeof execFile;

    const timeoutResult = await runEphemeralQa(tempDir, 'unit', 15, { execFileFn: mockDockerTimeout });
    expect(timeoutResult.status).toBe('FAILED');
    expect(timeoutResult.exit_code).toBe(124);
    expect(timeoutResult.tail_log).toContain('[TIMEOUT]');
  });

  it('runEphemeralQa usa docker-compose.qa.yml directo cuando falta Makefile o falla resolución de target en ENOENT', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.qa.yml'),
      [
        'services:',
        '  postgres-qa:',
        '    image: postgres:17-alpine',
        '  qa-php:',
        '    image: sinfallas/basephpcomposer:8.5',
        '  karatelabs:',
        '    image: sinfallas/karatelabs:1.5.1',
        'volumes:',
        '  composer-cache:',
      ].join('\n')
    );
    fs.writeFileSync(path.join(tempDir, 'composer.json'), '{"name":"demo/php"}\n');

    expect(resolveComposeDirectFallback(tempDir, 'chaos')).toBeNull();

    const capturedArgs: string[][] = [];
    const mockDockerOk = ((
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      expect(file).toBe('docker');
      capturedArgs.push([...args]);
      cb(null, 'All files | 96.00 | 95.00 | 100.0 | 96.00 |\n5 passed', '');
    }) as unknown as typeof execFile;

    const unitDirect = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockDockerOk });
    expect(unitDirect.status).toBe('PASSED');
    expect(capturedArgs[0]).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'qa-php', 'composer', 'run-script', 'qa:unit']);

    const bddDirect = await runEphemeralQa(tempDir, 'bdd', 60, { execFileFn: mockDockerOk });
    expect(bddDirect.status).toBe('PASSED');
    expect(capturedArgs[1]).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'karatelabs', 'mvn', '-B', 'clean', 'test']);

    const unsupportedNoMakefile = await runEphemeralQa(tempDir, 'chaos', 60, { execFileFn: mockDockerOk });
    expect(unsupportedNoMakefile.status).toBe('FAILED');
    expect(unsupportedNoMakefile.failed_tests[0].error_summary).toContain('no tiene mapeo directo seguro');

    // Con Makefile sin el target buscado y make ENOENT -> recurre a resolveComposeDirectFallback
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'other-target:\n\t@docker run alpine true\n');
    const fallbackFromEnoent = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockDockerOk });
    expect(fallbackFromEnoent.status).toBe('PASSED');
    expect(capturedArgs[2]).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'qa-php', 'composer', 'run-script', 'qa:lint']);

    // Sin docker-compose.qa.yml ni receta Docker válida -> rechaza por Regla Cero en ENOENT
    fs.rmSync(path.join(tempDir, 'docker-compose.qa.yml'));
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-unit:\n\tpytest -q\n');
    const rejected = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockDockerOk });
    expect(rejected.status).toBe('FAILED');
    expect(rejected.failed_tests[0].error_summary).toContain('Regla Cero');
  });
});
