// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile, execFileSync } from 'child_process';
import {
  runEphemeralQa,
  isDocsOnlyWorkspaceChange,
  tokenizeCommandArgs,
  expandMakefileVariables,
  hasUnquotedShellSyntax,
  resolveMakefileDockerRecipes,
  resolveComposeDirectFallback,
  ensureCoverageCacheDir,
  harvestCoverageReports,
} from '../src/tools/ephemeral-runner.js';
import { isDocFilePath } from '../src/services/qa-evidence.js';

function assertShellCommandsParseCleanly(commands: readonly string[][]): void {
  for (const cmd of commands) {
    const cIdx = cmd.findIndex((tok) => tok === '-c');
    if (cIdx > 0 && (cmd[cIdx - 1] === 'bash' || cmd[cIdx - 1] === 'sh')) {
      execFileSync(cmd[cIdx - 1]!, ['-n', '-c', cmd[cIdx + 1]!]);
    }
  }
}

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
    expect(result.failed_tests[0]?.error_summary).toContain('No se encontró archivo Makefile');
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
    expect(calls[1]?.shell).toBe(false);
    expect(calls[1]?.args).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', 'qa-php', 'composer', 'qa:unit']);

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
    expect(capturedArgs[0]).toEqual([
      'compose',
      '-f',
      'docker-compose.qa.yml',
      'run',
      '--rm',
      '-T',
      '-u',
      expect.stringMatching(/^\d+:\d+$/),
      '-e',
      'HOME=/tmp',
      'qa-php',
      'composer',
      'run-script',
      'qa:unit',
    ]);

    const bddDirect = await runEphemeralQa(tempDir, 'bdd', 60, { execFileFn: mockDockerOk });
    expect(bddDirect.status).toBe('PASSED');
    expect(capturedArgs[1]).toEqual([
      'compose',
      '-f',
      'docker-compose.qa.yml',
      'run',
      '--rm',
      '-T',
      '-u',
      expect.stringMatching(/^\d+:\d+$/),
      '-e',
      'HOME=/tmp',
      'karatelabs',
      'mvn',
      '-B',
      'clean',
      'test',
    ]);

    const unsupportedNoMakefile = await runEphemeralQa(tempDir, 'chaos', 60, { execFileFn: mockDockerOk });
    expect(unsupportedNoMakefile.status).toBe('FAILED');
    expect(unsupportedNoMakefile.failed_tests[0]?.error_summary).toContain('no tiene mapeo directo seguro');

    // Con Makefile sin el target buscado y make ENOENT -> recurre a resolveComposeDirectFallback
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'other-target:\n\t@docker run alpine true\n');
    const fallbackFromEnoent = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockDockerOk });
    expect(fallbackFromEnoent.status).toBe('PASSED');
    expect(capturedArgs[2]).toEqual([
      'compose',
      '-f',
      'docker-compose.qa.yml',
      'run',
      '--rm',
      '-T',
      '-u',
      expect.stringMatching(/^\d+:\d+$/),
      '-e',
      'HOME=/tmp',
      'qa-php',
      'composer',
      'run-script',
      'qa:lint',
    ]);

    // Sin docker-compose.qa.yml ni receta Docker válida -> rechaza por Regla Cero en ENOENT
    fs.rmSync(path.join(tempDir, 'docker-compose.qa.yml'));
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-unit:\n\tpytest -q\n');
    const rejected = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockDockerOk });
    expect(rejected.status).toBe('FAILED');
    expect(rejected.failed_tests[0]?.error_summary).toContain('Regla Cero');
  });

  it('runEphemeralQa resuelve delegación recursiva $(MAKE) -C <subdir> e impide path traversal al fallar make ENOENT', async () => {
    const frontendDir = path.join(tempDir, 'frontend');
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-lint:\n\t@$(MAKE) -C frontend qa-lint\n');
    fs.writeFileSync(
      path.join(frontendDir, 'Makefile'),
      'qa-lint:\n\t@docker compose -f docker-compose.qa.yml run --rm -T ui pnpm run lint\n'
    );

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
      cb(null, 'lint ok', '');
    }) as unknown as typeof execFile;

    const okRes = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockDockerOk });
    expect(okRes.status).toBe('PASSED');
    expect(capturedArgs[0]).toEqual([
      'compose',
      '--project-directory',
      'frontend',
      '-f',
      'frontend/docker-compose.qa.yml',
      'run',
      '--rm',
      '-T',
      'ui',
      'pnpm',
      'run',
      'lint',
    ]);

    // Intento de escape fuera de la raíz mediante $(MAKE) -C ../escape
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-lint:\n\t@$(MAKE) -C ../escape qa-lint\n');
    const escapedRes = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockDockerOk });
    expect(escapedRes.status).toBe('FAILED');

    // Intento de escape fuera de la raíz mediante $(MAKE) -C <symlink-al-exterior>
    const outsideMakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-make-outside-'));
    try {
      fs.writeFileSync(path.join(outsideMakeDir, 'Makefile'), 'qa-lint:\n\t@echo pwn\n');
      fs.symlinkSync(outsideMakeDir, path.join(tempDir, 'ext-link'));
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-lint:\n\t@$(MAKE) -C ext-link qa-lint\n');
      const symlinkEscaped = await runEphemeralQa(tempDir, 'lint', 60, { execFileFn: mockDockerOk });
      expect(symlinkEscaped.status).toBe('FAILED');
    } finally {
      fs.rmSync(outsideMakeDir, { recursive: true, force: true });
    }
  });

  it('resolveComposeDirectFallback soporta stacks Node/Frontend (incluyendo ui-e2e) y Python cuando falta Makefile', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'ui-app',
        scripts: { lint: 'eslint .', 'test:coverage': 'vitest run --coverage', mutate: 'stryker run' },
      })
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.qa.yml'),
      [
        'services:',
        '  qa-vue3:',
        '    image: sinfallas/base-node-ionic:26',
        '  ui-e2e:',
        '    image: mcr.microsoft.com/playwright:v1.52.0-noble',
      ].join('\n')
    );

    const nodeLint = resolveComposeDirectFallback(tempDir, 'lint');
    expect(nodeLint?.[0]?.slice(-4)).toEqual(['qa-vue3', 'pnpm', 'run', 'lint']);

    const nodeUnit = resolveComposeDirectFallback(tempDir, 'unit');
    expect(nodeUnit?.[0]?.slice(-4)).toEqual(['qa-vue3', 'pnpm', 'run', 'test:coverage']);

    const nodeMutation = resolveComposeDirectFallback(tempDir, 'mutation');
    expect(nodeMutation?.[0]?.slice(-4)).toEqual(['qa-vue3', 'pnpm', 'run', 'mutate']);

    const nodeE2e = resolveComposeDirectFallback(tempDir, 'e2e');
    expect(nodeE2e?.[0]).toEqual(expect.arrayContaining(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'ui-e2e', 'bash', '-c']));
    expect(nodeE2e?.[0]?.[nodeE2e[0].length - 1]).toContain('./node_modules/.bin/playwright');

    const nodePerf = resolveComposeDirectFallback(tempDir, 'perf');
    expect(nodePerf?.[0]).toEqual(expect.arrayContaining(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'ui-e2e', 'bash', '-c']));
    expect(nodePerf?.[0]?.[nodePerf[0].length - 1]).toContain('./node_modules/.bin/lhci');

    // Python / FastAPI stack
    const pyDir = path.join(tempDir, 'py-app');
    fs.mkdirSync(pyDir, { recursive: true });
    fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[project]\nname="api"\n');
    fs.writeFileSync(path.join(pyDir, 'alembic.ini'), '[alembic]\n');
    fs.writeFileSync(
      path.join(pyDir, 'docker-compose.qa.yml'),
      'services:\n  qa-backend:\n    image: sinfallas/base-python-uv:3.15\n'
    );
    expect(resolveComposeDirectFallback(pyDir, 'lint')?.[0]).toEqual(
      expect.arrayContaining(['qa-backend', 'sh', '-c', 'ruff check src tests && mypy --strict --cache-dir=/tmp/mypy src'])
    );
    expect(resolveComposeDirectFallback(pyDir, 'unit')?.[0]).toEqual(
      expect.arrayContaining([
        'COVERAGE_FILE=/tmp/.coverage',
        'qa-backend',
        'pytest',
        '--cov=src',
        '--cov-branch',
        '--cov-fail-under=95',
        '--cov-report=xml:.agents/.cache/coverage/python.xml',
      ])
    );
    expect(resolveComposeDirectFallback(pyDir, 'migration')?.[0]).toEqual(
      expect.arrayContaining(['qa-backend', 'alembic', 'upgrade', 'head'])
    );

    // Mobile / Appium stack (Spec 20)
    const mobDir = path.join(tempDir, 'mob-app');
    fs.mkdirSync(mobDir, { recursive: true });
    fs.writeFileSync(
      path.join(mobDir, 'package.json'),
      JSON.stringify({
        name: 'mobile-app',
        qa_11x_base_image: 'sinfallas/base-mobile-appium:26',
        scripts: { lint: 'tsc --noEmit', test: 'node --test tests/*.spec.ts' },
      })
    );
    fs.writeFileSync(
      path.join(mobDir, 'docker-compose.qa.yml'),
      'services:\n  qa-mobile:\n    image: sinfallas/base-mobile-appium:26\n'
    );
    expect(resolveComposeDirectFallback(mobDir, 'lint')?.[0]?.slice(-4)).toEqual([
      'qa-mobile',
      'pnpm',
      'run',
      'lint',
    ]);
    expect(resolveComposeDirectFallback(mobDir, 'unit')?.[0]?.slice(-4)).toEqual([
      'qa-mobile',
      'pnpm',
      'run',
      'test',
    ]);
  });

  it('hasUnquotedShellSyntax distingue operadores/subshells no citados frente a comillas simples o escapes \\$', async () => {
    expect(hasUnquotedShellSyntax('docker compose up -d && docker compose run --rm qa-backend pytest')).toBe(true);
    expect(hasUnquotedShellSyntax('docker run --rm app sh; id')).toBe(true);
    expect(hasUnquotedShellSyntax('docker run --rm app cat | grep ok')).toBe(true);
    expect(hasUnquotedShellSyntax('docker run --rm app echo hi > /tmp/out')).toBe(true);
    expect(hasUnquotedShellSyntax('docker run --rm -u "$(id -u):$(id -g)" app pytest')).toBe(false);
    expect(hasUnquotedShellSyntax('docker run --rm app $(id)')).toBe(true);
    expect(hasUnquotedShellSyntax('docker run --rm app echo `id`')).toBe(true);

    expect(hasUnquotedShellSyntax("docker run --rm app sh -c 'a && b $(id)'")).toBe(false);
    expect(
      hasUnquotedShellSyntax(
        'docker compose -f docker-compose.qa.yml run --rm -T ui-e2e bash -c "export CHROME_PATH=\\$(ls -d /ms-playwright/*) && pnpm test"'
      )
    ).toBe(false);
    expect(
      hasUnquotedShellSyntax('docker compose -f docker-compose.qa.yml run --rm -T qa-php vendor/bin/phpunit')
    ).toBe(false);

    // Expande $$(id -u)/$$(id -g)/$$(pwd) entre comillas dobles en fallback sin make
    const hostSubshellMake = 'qa-unit:\n\tdocker run --rm -u "$$(id -u):$$(id -g)" -v "$$(pwd):/app" app pytest\n';
    const subshellRes = resolveMakefileDockerRecipes(hostSubshellMake, 'qa-unit', tempDir);
    expect(subshellRes.ok).toBe(true);
    if (subshellRes.ok) {
      expect(subshellRes.commands[0]?.join(' ')).not.toContain('$(');
      expect(subshellRes.commands[0]).toContain(`${tempDir}:/app`);
    }

    const chainedMake = 'qa-unit:\n\tdocker compose up -d && docker compose run --rm qa-backend pytest\n';
    expect(resolveMakefileDockerRecipes(chainedMake, 'qa-unit', tempDir).ok).toBe(false);

    const validEscapedMake =
      'qa-perf:\n\tdocker compose -f docker-compose.qa.yml run --rm -T ui-e2e bash -c "export CHROME_PATH=\\$$(ls -d /ms-playwright/*) && ./node_modules/.bin/lhci autorun"\n';
    const validRes = resolveMakefileDockerRecipes(validEscapedMake, 'qa-perf', tempDir);
    expect(validRes.ok).toBe(true);

    // E2E ENOENT fallback: Makefile no-Docker hace fallback limpio a resolveComposeDirectFallback para Python
    const pyFallbackDir = path.join(tempDir, 'py-enoent-fallback');
    fs.mkdirSync(pyFallbackDir, { recursive: true });
    fs.writeFileSync(path.join(pyFallbackDir, 'Makefile'), 'qa-unit:\n\tpytest -q\n');
    fs.writeFileSync(path.join(pyFallbackDir, 'pyproject.toml'), '[project]\nname="api"\n');
    fs.writeFileSync(
      path.join(pyFallbackDir, 'docker-compose.qa.yml'),
      'services:\n  qa-backend:\n    image: sinfallas/base-python-uv:3.15\n'
    );
    const capturedDocker: string[][] = [];
    const mockEnoentFallback = ((
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      capturedDocker.push([...args]);
      cb(null, 'All files | 98.00 | 96.00 | 100.0 | 98.00 |\n8 passed', '');
    }) as unknown as typeof execFile;

    const enoentRes = await runEphemeralQa(pyFallbackDir, 'unit', 60, { execFileFn: mockEnoentFallback });
    expect(enoentRes.status).toBe('PASSED');
    expect(capturedDocker[0]).toEqual(
      expect.arrayContaining(['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'qa-backend', 'pytest'])
    );
  });

  it('executeDockerFallbackSequence descuenta timeout acumulado y ejecuta down -v --remove-orphans tras up -d (incluyendo timeout)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'Makefile'),
      [
        'qa-unit:',
        '\tdocker compose -f docker-compose.qa.yml up -d postgres-qa',
        '\tdocker compose -f docker-compose.qa.yml run --rm -T qa-php vendor/bin/phpunit',
      ].join('\n')
    );

    const invocations: Array<{ args: string[]; timeout?: number }> = [];
    const mockSequenceOk = ((
      file: string,
      args: readonly string[],
      options: { timeout?: number },
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      expect(file).toBe('docker');
      invocations.push({ args: [...args], timeout: options.timeout });
      cb(null, 'All files | 97.00 | 95.00 | 100.0 | 97.00 |\n10 passed', '');
    }) as unknown as typeof execFile;

    const okRes = await runEphemeralQa(tempDir, 'unit', 60, { execFileFn: mockSequenceOk });
    expect(okRes.status).toBe('PASSED');
    expect(invocations.map((c) => c.args)).toEqual([
      ['compose', '-f', 'docker-compose.qa.yml', 'up', '-d', 'postgres-qa'],
      ['compose', '-f', 'docker-compose.qa.yml', 'run', '--rm', '-T', 'qa-php', 'vendor/bin/phpunit'],
      ['compose', '-f', 'docker-compose.qa.yml', 'down', '-v', '--remove-orphans'],
    ]);
    expect(invocations[1]?.timeout).toBeLessThanOrEqual(60000);

    // Presupuesto agotado tras up -d -> aborta segunda receta con 124 ([TIMEOUT]) pero ejecuta teardown down -v --remove-orphans
    const timeoutCalls: string[][] = [];
    const mockBudgetExhausted = ((
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      timeoutCalls.push([...args]);
      if (args.includes('up')) {
        setTimeout(() => cb(null, '', ''), 40);
        return;
      }
      cb(null, '', '');
    }) as unknown as typeof execFile;

    const timedOut = await runEphemeralQa(tempDir, 'unit', 0.02, { execFileFn: mockBudgetExhausted });
    expect(timedOut.status).toBe('FAILED');
    expect(timedOut.exit_code).toBe(124);
    expect(timedOut.tail_log).toContain('[TIMEOUT]');
    expect(timeoutCalls).toEqual([
      ['compose', '-f', 'docker-compose.qa.yml', 'up', '-d', 'postgres-qa'],
      ['compose', '-f', 'docker-compose.qa.yml', 'down', '-v', '--remove-orphans'],
    ]);
  });

  it('ensureCoverageCacheDir y harvestCoverageReports preservan XML/LCOV con permisos 0700/0600 y bloquean symlinks externos', async () => {
    expect(harvestCoverageReports(path.join(tempDir, 'no-existe'))).toEqual([]);

    const covDir = ensureCoverageCacheDir(tempDir);
    expect(covDir).toBe(path.join(tempDir, '.agents', '.cache', 'coverage'));
    expect(fs.statSync(path.join(tempDir, '.agents', '.cache')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(covDir).mode & 0o777).toBe(0o700);

    // Directorio nombrado como reporte no debe copiarse (!isFile)
    fs.mkdirSync(path.join(tempDir, 'coverage.xml'), { recursive: true });

    // Symlink apuntando fuera del workspace debe ignorarse
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cov-outside-'));
    try {
      const outsideXml = path.join(outsideDir, 'secret.xml');
      fs.writeFileSync(outsideXml, '<coverage/>', 'utf8');
      fs.mkdirSync(path.join(tempDir, 'coverage'), { recursive: true });
      fs.symlinkSync(outsideXml, path.join(tempDir, 'coverage', 'lcov.info'));

      // Reportes válidos en raíz (PHP prioridad build/logs sobre coverage/clover) y monorepo (vue3 LCOV + fastapi XML)
      fs.mkdirSync(path.join(tempDir, 'build', 'logs'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'build', 'logs', 'cobertura.xml'), '<coverage id="php-primary"/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'coverage', 'clover.xml'), '<coverage id="php-secondary"/>', 'utf8');

      fs.mkdirSync(path.join(tempDir, 'fastapi'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'fastapi', 'coverage.xml'), '<coverage id="fastapi"/>', 'utf8');

      fs.mkdirSync(path.join(tempDir, 'vue3', 'coverage'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'vue3', 'coverage', 'lcov.info'),
        'TN:\nSF:/app/src/App.vue\nSF:src/main.ts\nDA:1,1\nend_of_record\n',
        'utf8'
      );

      fs.mkdirSync(path.join(tempDir, 'mobile-appium', 'coverage'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'mobile-appium', 'coverage', 'lcov.info'),
        'SF:/app/tests/mobile_screenplay.spec.ts\nDA:1,1\nend_of_record\n',
        'utf8'
      );

      const harvested = harvestCoverageReports(tempDir);
      expect(harvested).toEqual([
        path.join(covDir, 'php.xml'),
        path.join(covDir, 'fastapi.xml'),
        path.join(covDir, 'mobile-appium.info'),
        path.join(covDir, 'vue3.info'),
      ]);
      expect(fs.readFileSync(path.join(covDir, 'mobile-appium.info'), 'utf8')).toContain(
        'SF:mobile-appium/tests/mobile_screenplay.spec.ts'
      );
      expect(fs.existsSync(path.join(covDir, 'cobertura.xml'))).toBe(false);
      expect(fs.existsSync(path.join(covDir, 'lcov.info'))).toBe(false);
      expect(fs.readFileSync(path.join(covDir, 'php.xml'), 'utf8')).toBe('<coverage id="php-primary"/>');
      expect(fs.statSync(path.join(covDir, 'php.xml')).mode & 0o777).toBe(0o600);
      expect(fs.readFileSync(path.join(covDir, 'vue3.info'), 'utf8')).toContain('SF:vue3/src/App.vue');
      expect(fs.readFileSync(path.join(covDir, 'vue3.info'), 'utf8')).toContain('SF:vue3/src/main.ts');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }

    // También recolecta LCOV raíz vía runEphemeralQa('unit') con Makefile real simulado
    const rootProject = path.join(tempDir, 'root-node');
    fs.mkdirSync(path.join(rootProject, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(rootProject, 'Makefile'), 'qa-unit:\n\t@echo ok\n', 'utf8');
    fs.writeFileSync(path.join(rootProject, 'coverage', 'lcov.info'), 'SF:/app/src/index.ts\nDA:1,1\nend_of_record\n', 'utf8');
    const mockMakeOk = ((
      _f: string,
      _a: readonly string[],
      _o: unknown,
      cb: (e: Error | null, out: string, err: string) => void
    ) => cb(null, 'All files | 100 | 100 | 100 | 100 |\n1 passed', '')) as unknown as typeof execFile;
    const unitRes = await runEphemeralQa(rootProject, 'unit', 30, { execFileFn: mockMakeOk });
    expect(unitRes.status).toBe('PASSED');
    expect(fs.readFileSync(path.join(rootProject, '.agents', '.cache', 'coverage', 'lcov.info'), 'utf8')).toBe(
      'SF:/app/src/index.ts\nDA:1,1\nend_of_record\n'
    );
  });

  it('rechaza symlinks en .agents, .agents/.cache/coverage o destinos lcov.info sin escribir ni chmod fuera del workspace', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cov-escape-'));
    try {
      // 1. ws/.agents -> outside (harvestCoverageReports y runEphemeralQa)
      const wsAgentsSym = path.join(tempDir, 'ws-agents-sym');
      fs.mkdirSync(path.join(wsAgentsSym, 'coverage'), { recursive: true });
      fs.writeFileSync(path.join(wsAgentsSym, 'Makefile'), 'qa-unit:\n\t@echo ok\n', 'utf8');
      fs.writeFileSync(path.join(wsAgentsSym, 'coverage', 'lcov.info'), 'SF:src/a.ts\nDA:1,1\nend_of_record\n', 'utf8');
      fs.symlinkSync(outsideDir, path.join(wsAgentsSym, '.agents'));

      expect(() => harvestCoverageReports(wsAgentsSym)).toThrow(/symlink|confinamiento/i);
      expect(fs.existsSync(path.join(outsideDir, '.cache'))).toBe(false);

      const makeSpy = vi.fn();
      await expect(
        runEphemeralQa(wsAgentsSym, 'unit', 30, { execFileFn: makeSpy as unknown as typeof execFile })
      ).rejects.toThrow(/symlink|confinamiento/i);
      expect(makeSpy).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(outsideDir, '.cache'))).toBe(false);

      // 2. Dangling ws/.agents/.cache/coverage/lcov.info -> outside/pwned.info
      const wsDanglingLcov = path.join(tempDir, 'ws-dangling-lcov');
      const covDir = path.join(wsDanglingLcov, '.agents', '.cache', 'coverage');
      fs.mkdirSync(covDir, { recursive: true });
      fs.mkdirSync(path.join(wsDanglingLcov, 'coverage'), { recursive: true });
      fs.writeFileSync(path.join(wsDanglingLcov, 'coverage', 'lcov.info'), 'SF:src/b.ts\nDA:1,1\nend_of_record\n', 'utf8');
      const pwnedInfo = path.join(outsideDir, 'pwned.info');
      fs.symlinkSync(pwnedInfo, path.join(covDir, 'lcov.info'));

      expect(() => harvestCoverageReports(wsDanglingLcov)).toThrow(/symlink|confinamiento/i);
      expect(fs.existsSync(pwnedInfo)).toBe(false);

      // 3. ensureSafePrepDirs soporta mkdir -p . en fallback ENOENT
      const wsPrepDot = path.join(tempDir, 'ws-prep-dot');
      fs.mkdirSync(wsPrepDot, { recursive: true });
      fs.writeFileSync(
        path.join(wsPrepDot, 'Makefile'),
        'qa-unit:\n\tmkdir -p .\n\tdocker run alpine true\n',
        'utf8'
      );
      const mockEnoentDot = ((
        file: string,
        _args: readonly string[] | null | undefined,
        _opts: unknown,
        cb: (e: Error | null, out: string, err: string) => void
      ) => {
        if (file === 'make') {
          cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), '', '');
          return;
        }
        cb(null, 'All files | 100 | 100 | 100 | 100 |\n1 passed', '');
      }) as unknown as typeof execFile;
      const dotRes = await runEphemeralQa(wsPrepDot, 'unit', 30, { execFileFn: mockEnoentDot });
      expect(dotRes.status).toBe('PASSED');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('F1.8: runEphemeralQa devuelve SKIPPED y no graba evidencia cuando 0 pruebas fueron ejecutadas', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'Makefile'),
      'qa-unit:\n\t@echo ok\nqa-integration:\n\t@echo ok\nqa-bdd:\n\t@echo ok\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const mockGit = ((cmd: string, args?: readonly string[]) => {
      if (cmd === 'git' && args?.includes('status')) return ' M Makefile\n';
      if (cmd === 'git' && args?.[0] === 'rev-parse') return 'abc123\n';
      return '';
    }) as unknown as typeof execFileSync;

    const mockPyZero = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) =>
      cb(null, 'collected 0 items\n=== no tests ran in 0.01s ===', '')) as unknown as typeof execFile;
    const resUnit = await runEphemeralQa(tempDir, 'unit', 30, { execFileFn: mockPyZero, execFileSyncFn: mockGit });
    expect(resUnit.status).toBe('SKIPPED');
    expect(resUnit.tests_detected).toBe(0);

    const mockBatsZero = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) =>
      cb(null, '1..0', '')) as unknown as typeof execFile;
    const resInteg = await runEphemeralQa(tempDir, 'integration', 30, { execFileFn: mockBatsZero, execFileSyncFn: mockGit });
    expect(resInteg.status).toBe('SKIPPED');
    expect(resInteg.tests_detected).toBe(0);

    const mockKarateZero = ((_f: string, _a: readonly string[], _o: unknown, cb: (e: null, out: string, err: string) => void) =>
      cb(null, 'scenarios: 0 | passed: 0 | failed: 0', '')) as unknown as typeof execFile;
    const resBdd = await runEphemeralQa(tempDir, 'bdd', 30, { execFileFn: mockKarateZero, execFileSyncFn: mockGit });
    expect(resBdd.status).toBe('SKIPPED');
    expect(resBdd.tests_detected).toBe(0);
    expect(fs.existsSync(path.join(tempDir, '.agents', '.qa-evidence.json'))).toBe(false);
  });

  it('cubre fallback POSIX uid/gid, variables/targets repetidos en Makefile y package.json corrupto en fallback Compose', () => {
    const origGetuid = Object.getOwnPropertyDescriptor(process, 'getuid');
    const origGetgid = Object.getOwnPropertyDescriptor(process, 'getgid');
    Object.defineProperty(process, 'getuid', { value: undefined, configurable: true });
    Object.defineProperty(process, 'getgid', { value: undefined, configurable: true });
    try {
      expect(expandMakefileVariables('$(shell id -u):$(shell id -g)', new Map())).toBe('1000:1000');
    } finally {
      if (origGetuid) Object.defineProperty(process, 'getuid', origGetuid);
      if (origGetgid) Object.defineProperty(process, 'getgid', origGetgid);
    }

    const makefileWithEdgeSyntax = [
      'bad-var-name = ignored',
      'first_dep:',
      '\t@echo first',
      'second_dep:',
      '\t@echo second',
      'qa-unit: first_dep',
      'qa-unit: second_dep',
      '\tdocker compose -f docker-compose.qa.yml run --rm -T qa-php echo ok',
    ].join('\n');
    const parsedRecipes = resolveMakefileDockerRecipes(makefileWithEdgeSyntax, 'qa-unit', tempDir);
    expect(parsedRecipes.ok).toBe(true);
    if (parsedRecipes.ok) {
      expect(parsedRecipes.commands).toHaveLength(1);
    }

    const brokenNodeDir = path.join(tempDir, 'broken-node-pkg');
    fs.mkdirSync(brokenNodeDir, { recursive: true });
    fs.writeFileSync(path.join(brokenNodeDir, 'package.json'), '{broken json', 'utf8');
    fs.writeFileSync(
      path.join(brokenNodeDir, 'docker-compose.qa.yml'),
      'services:\n  qa-frontend:\n    image: sinfallas/base-node-ionic:26\n',
      'utf8'
    );
    const directCmds = resolveComposeDirectFallback(brokenNodeDir, 'unit');
    expect(directCmds).not.toBeNull();
    expect(directCmds?.[0]).toEqual(expect.arrayContaining(['pnpm', 'run', 'test:unit']));
  });

  it('runEphemeralQa propaga AbortSignal al subproceso y aborta inmediatamente si ya fue cancelada', async () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-lint:\n\t@echo ok\n', 'utf8');
    let observedSignal: AbortSignal | undefined;
    const mockExec = ((
      _file: string,
      _args: readonly string[],
      options: { signal?: AbortSignal },
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      observedSignal = options.signal;
      cb(null, '0 warnings', '');
    }) as unknown as typeof execFile;

    const okController = new AbortController();
    const okRes = await runEphemeralQa(tempDir, 'lint', 30, {
      execFileFn: mockExec,
      signal: okController.signal,
    });
    expect(okRes.status).toBe('PASSED');
    expect(observedSignal).toBe(okController.signal);

    const abortedController = new AbortController();
    abortedController.abort(new Error('task cancelled early'));
    const noInvoke = vi.fn<() => void>();
    const abortedRes = await runEphemeralQa(tempDir, 'lint', 30, {
      execFileFn: noInvoke as unknown as typeof execFile,
      signal: abortedController.signal,
    });
    expect(abortedRes.status).toBe('FAILED');
    expect(abortedRes.exit_code).toBe(124);
    expect(abortedRes.tail_log).toContain('[TIMEOUT]');
    expect(noInvoke).not.toHaveBeenCalled();
  });

  it('excludes .agents/skills, .agents/rules, and .agents/schemas from isDocFilePath DOCS_ONLY fast-path', () => {
    expect(isDocFilePath('.agents/skills/qa-11x-architect/SKILL.md')).toBe(false);
    expect(isDocFilePath('.agents/rules/git_closure_gate.md')).toBe(false);
    expect(isDocFilePath('.agents/schemas/session_checkpoint.schema.json')).toBe(false);
    expect(isDocFilePath('docs/guide.md')).toBe(true);
    expect(isDocFilePath('CHANGELOG.es.md')).toBe(true);
  });

  it('supports mkdir -p, secret-scan guards, safe sh -c trap wrappers, and profile teardown under make ENOENT', async () => {
    const profDir = path.join(tempDir, 'profile-proj');
    fs.mkdirSync(path.join(profDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(profDir, 'Makefile'),
      [
        'qa-profile:',
        '\tmkdir -p reports/flamegraphs',
        '\tsh -c \'set -eu; trap "docker compose -f docker-compose.qa.yml --profile profile down -v --remove-orphans" EXIT; docker compose -f docker-compose.qa.yml --profile profile up -d api; docker compose -f docker-compose.qa.yml --profile profile run --rm -T profiler\'',
        'qa-lint:',
        '\t@[ ! -x ./scripts/verificar-secretos.sh ] || ./scripts/verificar-secretos.sh',
        '\tdocker compose -f docker-compose.qa.yml run --rm -T qa-backend ruff check src',
      ].join('\n')
    );

    const profRes = resolveMakefileDockerRecipes(fs.readFileSync(path.join(profDir, 'Makefile'), 'utf8'), 'qa-profile', profDir);
    expect(profRes.ok).toBe(true);
    if (profRes.ok) {
      expect(profRes.prepDirs).toEqual(['reports/flamegraphs']);
      expect(profRes.commands[0]).toEqual(['compose', '-f', 'docker-compose.qa.yml', '--profile', 'profile', 'up', '-d', 'api']);
      expect(profRes.commands[1]).toEqual(['compose', '-f', 'docker-compose.qa.yml', '--profile', 'profile', 'run', '--rm', '-T', 'profiler']);
    }

    // Traversal in mkdir or disallowed cmd inside sh -c / trap MUST remain blocked fail-closed
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tmkdir -p ../escape\n\tdocker run alpine true\n', 'qa-profile', profDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tsh -c "set -eu; curl http://evil.invalid"\n', 'qa-profile', profDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tsh -c \'trap "rm -rf /tmp/x" EXIT; docker run alpine true\'\n', 'qa-profile', profDir).ok).toBe(false);

    // Optional secret-scan guard skipped when missing, executed in Rule Zero Docker when present
    const absentLint = resolveMakefileDockerRecipes(fs.readFileSync(path.join(profDir, 'Makefile'), 'utf8'), 'qa-lint', profDir);
    expect(absentLint.ok).toBe(true);
    if (absentLint.ok) {
      expect(absentLint.commands).toHaveLength(1);
    }
    fs.writeFileSync(path.join(profDir, 'scripts', 'verificar-secretos.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const presentLint = resolveMakefileDockerRecipes(fs.readFileSync(path.join(profDir, 'Makefile'), 'utf8'), 'qa-lint', profDir);
    expect(presentLint.ok).toBe(true);
    if (presentLint.ok) {
      expect(presentLint.commands).toHaveLength(2);
      expect(presentLint.commands[0]).toContain('./scripts/verificar-secretos.sh');
    }

    // stage: profile Compose fallback + --profile down cleanup
    fs.writeFileSync(
      path.join(profDir, 'docker-compose.qa.yml'),
      'services:\n  api:\n    image: app\n  profiler:\n    image: prof\n',
      'utf8'
    );
    const directProf = resolveComposeDirectFallback(profDir, 'profile');
    expect(directProf).toEqual([
      ['compose', '-f', 'docker-compose.qa.yml', '--profile', 'profile', 'up', '-d', 'api'],
      [
        'compose',
        '-f',
        'docker-compose.qa.yml',
        '--profile',
        'profile',
        'run',
        '--rm',
        '-T',
        '-u',
        expect.stringMatching(/^\d+:\d+$/),
        '-e',
        'HOME=/tmp',
        'profiler',
      ],
    ]);

    const ranDocker: string[][] = [];
    const mockProfileRunner = ((
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      ranDocker.push([...args]);
      cb(null, 'profile captured', '');
    }) as unknown as typeof execFile;

    const runProf = await runEphemeralQa(profDir, 'profile', 60, { execFileFn: mockProfileRunner });
    expect(runProf.status).toBe('PASSED');
    expect(fs.existsSync(path.join(profDir, 'reports', 'flamegraphs'))).toBe(true);
    expect(ranDocker.some((cmd) => cmd.includes('down') && cmd.includes('--profile') && cmd.includes('--remove-orphans'))).toBe(true);
  });

  it('covers delegated prepDirs, invalid mkdir targets, bash &&/trap wrappers, and foreground vs detached compose teardown', async () => {
    const rootDir = fs.mkdtempSync(path.join(tempDir, 'deleg-root-'));
    const subDir = path.join(rootDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'Makefile'),
      'qa-profile:\n\tmkdir -p reports/sub\n\tdocker compose -f docker-compose.qa.yml run --rm -T profiler\n',
      'utf8'
    );
    const delegOk = resolveMakefileDockerRecipes('qa-profile:\n\t$(MAKE) -C sub qa-profile\n', 'qa-profile', rootDir);
    expect(delegOk.ok).toBe(true);
    if (delegOk.ok) {
      expect(delegOk.prepDirs).toEqual(['sub/reports/sub']);
    }

    expect(resolveMakefileDockerRecipes('qa-profile:\n\tmkdir -p /etc/escape\n\tdocker run alpine true\n', 'qa-profile', rootDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tmkdir -p\n\tdocker run alpine true\n', 'qa-profile', rootDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tsh -c ""\n', 'qa-profile', rootDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tsh -c " ; "\n', 'qa-profile', rootDir).ok).toBe(false);
    expect(resolveMakefileDockerRecipes('qa-profile:\n\tsh -c "trap \'\' EXIT; docker run alpine true"\n', 'qa-profile', rootDir).ok).toBe(false);

    const chainMake = [
      'qa-profile:',
      '\tbash -c "trap \'docker compose -f docker-compose.qa.yml down -v\' EXIT && echo \'starting\' && docker compose -f docker-compose.qa.yml up --abort-on-container-exit api"',
    ].join('\n');
    expect(resolveMakefileDockerRecipes(chainMake, 'qa-profile', rootDir).ok).toBe(true);

    fs.writeFileSync(
      path.join(rootDir, 'Makefile'),
      [
        'qa-profile:',
        '\tdocker compose -f docker-compose.qa.yml up --detach api',
        'qa-unit:',
        '\tdocker compose -f docker-compose.qa.yml up api',
      ].join('\n'),
      'utf8'
    );
    const calls: string[][] = [];
    const mockExec = ((
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (e: Error | null, out: string, err: string) => void
    ) => {
      if (file === 'make') {
        cb(Object.assign(new Error('spawn make ENOENT'), { code: 'ENOENT' }), '', '');
        return;
      }
      calls.push([...args]);
      cb(null, '1 passed\n', '');
    }) as unknown as typeof execFile;

    await runEphemeralQa(rootDir, 'profile', 30, { execFileFn: mockExec });
    expect(calls.some((c) => c.includes('down'))).toBe(true);

    calls.length = 0;
    await runEphemeralQa(rootDir, 'unit', 30, { execFileFn: mockExec });
    expect(calls.some((c) => c.includes('down'))).toBe(false);
  });

  it('readDoubleQuotedToken preserva escapes POSIX no especiales como \\( y \\) en find mientras resuelve \\", \\\\, \\$, \\` y \\<newline>', () => {
    const findCmd =
      'docker compose -f docker-compose.qa.yml run --rm -T qa-bash bash -c "find . \\( -name node_modules -o -name .venv \\) -prune -o -type f -name \'*.sh\' -print0"';
    const findTokens = tokenizeCommandArgs(findCmd);
    expect(findTokens.at(-1)).toBe(
      "find . \\( -name node_modules -o -name .venv \\) -prune -o -type f -name '*.sh' -print0"
    );

    const posixEscapes = tokenizeCommandArgs(
      'sh -c "a=\\"q\\" b=\\\\ c=\\$HOME d=\\`id\\` e=hi\\\nworld f=\\(ok\\)"'
    );
    expect(posixEscapes).toEqual(['sh', '-c', 'a="q" b=\\ c=$HOME d=`id` e=hiworld f=\\(ok\\)']);
  });

  it('resolveMakefileDockerRecipes soporta $(CURDIR) mkdir, traps || true, if [ -f ] y clean-cache en los 10 stacks manteniendo Regla Cero', () => {
    const stackRoot = path.join(tempDir, 'stack_proj');
    fs.mkdirSync(path.join(stackRoot, '.agents', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(stackRoot, '.agents', 'scripts', 'verify_alembic_orm_parity.py'), '# ok\n', 'utf8');

    const blueprintLikeMakefile = [
      'COMPOSE_FILE ?= docker-compose.qa.yml',
      'SERVICE_NAME ?= qa-backend',
      'PROJECT_DIR ?= $(CURDIR)',
      'QA_UID ?= $(shell id -u)',
      'QA_GID ?= $(shell id -g)',
      'qa-dast:',
      '\t@mkdir -p "$(PROJECT_DIR)/reports"',
      '\t@bash -c \'trap "docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" down -v >/dev/null 2>&1 || true" EXIT; docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" up -d --wait api && docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" run --rm -T zap zap.sh -dir /tmp/.ZAP -cmd -autorun /zap/wrk/zap.yaml\'',
      'qa-migration:',
      '\t@bash -c \'if [ -f .agents/scripts/verify_alembic_orm_parity.py ]; then docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" run --rm -T $(SERVICE_NAME) python3 .agents/scripts/verify_alembic_orm_parity.py; else trap "docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" down -v >/dev/null 2>&1 || true" EXIT; docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" up -d --wait postgres; fi\'',
      'qa-orphans:',
      '\t@if [ -f .agents/scripts/verify_zero_orphan_vue_components.py ]; then docker run --rm --network none python:3.15 python3 .agents/scripts/verify_zero_orphan_vue_components.py; else docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" run --rm -T frontend node -e "console.log(1);"; fi',
      'qa-load:',
      '\t@mkdir -p "$(PROJECT_DIR)/pacts" "$(PROJECT_DIR)/dist" "$(PROJECT_DIR)/coverage"',
      '\t@if [ -z "$${API_BASE_URL:-}" ] && [ -z "$${PYTHON_HTTP_CMD:-}" ]; then echo "stub"; fi',
      '\t@docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" run --rm -T k6-smoke',
      'clean-cache:',
      '\t@docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" --profile "*" down -v --remove-orphans >/dev/null 2>&1 || docker compose --project-directory "$(PROJECT_DIR)" -f "$(COMPOSE_FILE)" down -v --remove-orphans >/dev/null 2>&1 || true',
    ].join('\n');

    const dastRes = resolveMakefileDockerRecipes(blueprintLikeMakefile, 'qa-dast', stackRoot);
    expect(dastRes.ok).toBe(true);
    if (dastRes.ok) {
      expect(dastRes.prepDirs).toEqual(['reports']);
      expect(dastRes.commands.at(-1)).toContain('down');
    }

    const migRes = resolveMakefileDockerRecipes(blueprintLikeMakefile, 'qa-migration', stackRoot);
    expect(migRes.ok).toBe(true);
    const orphRes = resolveMakefileDockerRecipes(blueprintLikeMakefile, 'qa-orphans', stackRoot);
    expect(orphRes.ok).toBe(true);
    const loadRes = resolveMakefileDockerRecipes(blueprintLikeMakefile, 'qa-load', stackRoot);
    expect(loadRes.ok).toBe(true);
    if (loadRes.ok) {
      expect(loadRes.prepDirs).toEqual(['pacts', 'dist', 'coverage']);
    }
    const cleanCacheRes = resolveMakefileDockerRecipes(blueprintLikeMakefile, 'clean-cache', stackRoot);
    expect(cleanCacheRes.ok).toBe(true);

    // Symlink escape en mkdir -p y trap malicioso siguen estrictamente bloqueados por Regla Cero
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-escape-'));
    try {
      fs.symlinkSync(outsideDir, path.join(stackRoot, 'sym_escape'));
      const symRes = resolveMakefileDockerRecipes(
        'qa-dast:\n\tmkdir -p "$(CURDIR)/sym_escape/sub"\n\tdocker run alpine true\n',
        'qa-dast',
        stackRoot
      );
      expect(symRes.ok).toBe(false);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
    const evilTrap = resolveMakefileDockerRecipes(
      'qa-dast:\n\tbash -c \'trap "docker compose down; rm -rf / || true" EXIT; docker run alpine true\'\n',
      'qa-dast',
      stackRoot
    );
    expect(evilTrap.ok).toBe(false);
    const evilIf = resolveMakefileDockerRecipes(
      'qa-orphans:\n\tif [ -f ../outside ]; then docker run alpine true; fi\n',
      'qa-orphans',
      stackRoot
    );
    expect(evilIf.ok).toBe(false);

    // Cubre fallback de ruta cuando rootDir aún no existe, redirección >/dev/null y rechazo en fallback || inseguro
    const futureRoot = path.join(tempDir, 'nonexistent-root-11x');
    const futureRes = resolveMakefileDockerRecipes(
      'qa-unit:\n\tmkdir -p reports\n\tdocker run alpine true\n',
      'qa-unit',
      futureRoot
    );
    expect(futureRes.ok).toBe(true);

    const trapDevNullRes = resolveMakefileDockerRecipes(
      'qa-profile:\n\tsh -c \'trap "docker compose down >/dev/null || true" EXIT; docker run alpine true\'\n',
      'qa-profile',
      stackRoot
    );
    expect(trapDevNullRes.ok).toBe(true);

    const unsafeOrFallback = resolveMakefileDockerRecipes(
      'clean-cache:\n\tdocker compose down || echo pwned\n',
      'clean-cache',
      stackRoot
    );
    expect(unsafeOrFallback.ok).toBe(false);

    // Validar los 10 <stack>/Makefile.example reales sin omitir silenciosamente
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const stackTargets: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['fastapi', ['qa-lint', 'qa-unit', 'qa-migration', 'qa-integration', 'qa-contracts', 'qa-load', 'qa-ci', 'qa-mutation', 'qa-bdd', 'qa-dast', 'qa-profile', 'qa-chaos', 'qa-observability', 'qa-sbom', 'qa-all', 'clean-cache']],
      ['python', ['qa-lint', 'qa-unit', 'qa-ci', 'qa-mutation', 'qa-profile', 'qa-sbom', 'qa-load', 'qa-observability', 'qa-all', 'clean-cache']],
      ['node-backend', ['qa-lint', 'qa-unit', 'qa-contracts', 'qa-e2e', 'qa-dast', 'qa-mutation', 'qa-sbom', 'qa-bdd', 'qa-stress', 'qa-chaos', 'qa-observability', 'qa-all', 'clean-cache']],
      ['vue3', ['build-ui', 'qa-lint', 'qa-unit', 'qa-orphans', 'qa-mutation', 'qa-perf', 'qa-e2e', 'qa-bdd', 'qa-obs', 'qa-all', 'clean-cache', 'down-caches']],
      ['react-frontend', ['build-ui', 'qa-lint', 'qa-unit', 'qa-orphans', 'qa-mutation', 'qa-perf', 'qa-e2e', 'qa-bdd', 'qa-obs', 'qa-all', 'clean-cache', 'down-caches']],
      ['php', ['qa-lint', 'qa-unit', 'qa-contracts', 'qa-bdd', 'qa-mutation', 'qa-dast', 'qa-load', 'qa-chaos', 'qa-observability', 'qa-sbom', 'clean-cache']],
      ['mobile-appium', ['qa-lint', 'qa-unit', 'qa-sbom', 'qa-drivers', 'qa-bridge', 'qa-e2e', 'qa-all', 'clean-cache']],
      ['bash-scripts', ['qa-lint', 'qa-unit', 'qa-observability', 'qa-all']],
      ['ai-evals', ['qa-lint', 'qa-unit', 'qa-offline', 'qa-ci', 'qa-all', 'clean-cache']],
      ['vibe-rescue', ['qa-lint', 'qa-audit', 'qa-audit-enforce', 'qa-unit', 'qa-ci', 'qa-all', 'clean-cache']],
    ];
    for (const [stack, targets] of stackTargets) {
      const stackDir = path.join(repoRoot, stack);
      const mkPath = path.join(stackDir, 'Makefile.example');
      expect(fs.existsSync(mkPath), `Falta montar ${stack}/Makefile.example en ${mkPath}`).toBe(true);
      const mkContent = fs.readFileSync(mkPath, 'utf8');
      for (const tgt of targets) {
        const r = resolveMakefileDockerRecipes(mkContent, tgt, stackDir);
        expect(r.ok, `${stack}/${tgt}: ${r.ok ? '' : r.reason}`).toBe(true);
      }
    }

    // Fail-closed explícito (Rule Zero): targets con host shell / captura subshell requieren GNU make
    const failClosedTargets: ReadonlyArray<readonly [string, string]> = [
      ['php', 'qa-parity'],
      ['php', 'qa-all'],
      ['bash-scripts', 'clean-cache'],
    ];
    for (const [stack, tgt] of failClosedTargets) {
      const stackDir = path.join(repoRoot, stack);
      const mkContent = fs.readFileSync(path.join(stackDir, 'Makefile.example'), 'utf8');
      const r = resolveMakefileDockerRecipes(mkContent, tgt, stackDir);
      expect(r.ok, `${stack}/${tgt} debe fallar cerrado en fallback sin make`).toBe(false);
    }
  });

  it('valida isBenignIfZEcho y parseBoundedIfFile frente a redirecciones seguras, multi-espacio e inyecciones', () => {
    const stackRoot = path.join(tempDir, 'stack-ifz');
    fs.mkdirSync(stackRoot, { recursive: true });

    const safeIfZRedirs = [
      'qa-banner:\n\t@if [ -z "$${API:-}" ]; then echo "aviso" >&2; fi\n\tdocker run alpine true\n',
      'qa-banner:\n\t@if [ -z "$${API:-}" ]; then echo "aviso" 1>&2; fi\n\tdocker run alpine true\n',
      'qa-banner:\n\t@if [ -z "$${API:-}" ]; then printf "aviso" >/dev/null; fi\n\tdocker run alpine true\n',
      'qa-banner:\n\t@if [ -z "$${API:-}" ]; then echo "aviso" 1>/dev/null 2>&1; fi\n\tdocker run alpine true\n',
    ];
    for (const mk of safeIfZRedirs) {
      const res = resolveMakefileDockerRecipes(mk, 'qa-banner', stackRoot);
      expect(res.ok, res.ok ? '' : res.reason).toBe(true);
    }

    const evilIfZVectors = [
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "$$(id)" >&2; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "`id`" >&2; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "x" > /etc/passwd; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "x" >&2 && id; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "x" | sh; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$$(id)" ]; then echo "x" >&2; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ] && [ -f /etc/passwd ]; then echo "x" >&2; fi\'\n',
      'qa-evil:\n\t@sh -c \'if [ -z "$${API:-}" ]; then echo "x" >&2\nfi\'\n',
    ];
    for (const mk of evilIfZVectors) {
      const res = resolveMakefileDockerRecipes(mk, 'qa-evil', stackRoot);
      expect(res.ok, `Vector inseguro debía bloquearse: ${mk}`).toBe(false);
    }

    const multiSpaceIf = resolveMakefileDockerRecipes(
      'qa-ms:\n\t@bash -c \'if [ -f missing.py ]; then  docker run alpine false;  else  docker run alpine true;  fi   \'\n',
      'qa-ms',
      stackRoot
    );
    expect(multiSpaceIf.ok, multiSpaceIf.ok ? '' : multiSpaceIf.reason).toBe(true);

    const quotedElseIf = resolveMakefileDockerRecipes(
      'qa-qe:\n\t@bash -c \'if [ -f missing.py ]; then docker run alpine sh -c "echo ; else "; else docker run alpine true; fi\'\n',
      'qa-qe',
      stackRoot
    );
    expect(quotedElseIf.ok, quotedElseIf.ok ? '' : quotedElseIf.reason).toBe(true);

    const malformedBoundedIfs = [
      'qa-bad:\n\t@bash -c \'if [ -f missing.py; then docker run alpine true; fi\'\n',
      'qa-bad:\n\t@bash -c \'if [ -f  ]; then docker run alpine true; fi\'\n',
      'qa-bad:\n\t@bash -c \'if [ -f missing.py ] docker run alpine true; fi\'\n',
      'qa-bad:\n\t@bash -c \'if [ -f missing.py ]; then docker run alpine true; fi_extra\'\n',
      'qa-bad:\n\t@bash -c \'if [ -f missing.py ]; then docker run alpine true; notfi\'\n',
      'qa-bad:\n\t@bash -c \'if [ -f missing.py ]; then docker run alpine true\n; fi\'\n',
      `qa-bad:\n\t@bash -c 'mkdir -p ${'a'.repeat(260)}; docker run alpine true'\n`,
    ];
    for (const mk of malformedBoundedIfs) {
      const res = resolveMakefileDockerRecipes(mk, 'qa-bad', stackRoot);
      expect(res.ok, `Condicional malformado debía bloquearse: ${mk}`).toBe(false);
    }
  });

  it('harvestCoverageReports purga <!DOCTYPE coverage ...> (1 o varias líneas) preservando <!ENTITY anti-XXE y valida sintaxis bash -n en los 10 stacks', () => {
    expect(tokenizeCommandArgs("bash -c 'PS4='\\''kcov@ok'\\''' a\\ b sub\\docker-compose.qa.yml trailing\\")).toEqual([
      'bash',
      '-c',
      "PS4='kcov@ok'",
      'a b',
      'sub\\docker-compose.qa.yml',
      'trailing\\',
    ]);
    expect(tokenizeCommandArgs('echo hi\\\nworld')).toEqual(['echo', 'hiworld']);
    expect(hasUnquotedShellSyntax("docker run --rm app bash -c 'PS4='\\''kcov@ok'\\'' && echo ok'")).toBe(false);

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const stacks = [
      'bash-scripts',
      'fastapi',
      'python',
      'node-backend',
      'vue3',
      'react-frontend',
      'php',
      'mobile-appium',
      'ai-evals',
      'vibe-rescue',
    ];
    for (const stack of stacks) {
      const mk = fs.readFileSync(path.join(repoRoot, stack, 'Makefile.example'), 'utf8');
      for (const target of ['qa-lint', 'qa-unit']) {
        const res = resolveMakefileDockerRecipes(mk, target, tempDir);
        expect(res.ok, `${stack}:${target} -> ${res.ok ? '' : res.reason}`).toBe(true);
        if (!res.ok) continue;
        assertShellCommandsParseCleanly(res.commands);
      }
    }
    const bashUnitRes = resolveMakefileDockerRecipes(
      fs.readFileSync(path.join(repoRoot, 'bash-scripts', 'Makefile.example'), 'utf8'),
      'qa-unit',
      tempDir
    );
    expect(bashUnitRes.ok && bashUnitRes.prepDirs).toContain(path.join('.agents', '.cache', 'coverage'));

    const wsClean = path.join(tempDir, 'ws-kcov-dtd');
    fs.mkdirSync(path.join(wsClean, 'coverage_report', 'kcov-merged'), { recursive: true });
    fs.writeFileSync(
      path.join(wsClean, 'coverage_report', 'kcov-merged', 'cobertura.xml'),
      "<?xml version=\"1.0\" ?>\n<!DOCTYPE coverage\n  SYSTEM 'http://cobertura.sourceforge.net/xml/coverage-04.dtd'>\n<coverage line-rate=\"1.0\"/>\n",
      'utf8'
    );
    const harvestedClean = harvestCoverageReports(wsClean);
    expect(harvestedClean).toEqual([path.join(wsClean, '.agents', '.cache', 'coverage', 'bash.xml')]);
    const sanitizedXml = fs.readFileSync(harvestedClean[0]!, 'utf8');
    expect(sanitizedXml).not.toContain('<!DOCTYPE');
    expect(sanitizedXml).toContain('<coverage line-rate="1.0"/>');

    const wsEntity = path.join(tempDir, 'ws-xxe-entity');
    fs.mkdirSync(path.join(wsEntity, 'coverage_report'), { recursive: true });
    const maliciousXml = '<?xml version="1.0"?>\n<!DOCTYPE coverage [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<coverage>&xxe;</coverage>\n';
    fs.writeFileSync(path.join(wsEntity, 'coverage_report', 'cobertura.xml'), maliciousXml, 'utf8');
    const harvestedEntity = harvestCoverageReports(wsEntity);
    expect(fs.readFileSync(harvestedEntity[0]!, 'utf8')).toContain('<!ENTITY');

    const wsMonoBash = path.join(tempDir, 'ws-mono-bash');
    fs.mkdirSync(path.join(wsMonoBash, 'bash-scripts', '.agents', '.cache', 'coverage'), { recursive: true });
    fs.writeFileSync(
      path.join(wsMonoBash, 'bash-scripts', '.agents', '.cache', 'coverage', 'bash.xml'),
      '<?xml version="1.0"?>\n<coverage line-rate="0.98"/>\n',
      'utf8'
    );
    const harvestedMonoBash = harvestCoverageReports(wsMonoBash);
    expect(harvestedMonoBash).toEqual([path.join(wsMonoBash, '.agents', '.cache', 'coverage', 'bash-scripts.xml')]);
  });
});
