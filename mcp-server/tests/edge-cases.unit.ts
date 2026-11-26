// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { ChildProcess, execFile, execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ALPINE_FALLBACK_IMAGE,
  cleanWorkspace11x,
  executeAlpineFallback,
  removeTarget,
} from '../src/tools/clean-workspace.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';
import {
  parseLinterAndComplexity,
  parseCoverage,
  parseTailLog,
  parseFailedTests,
  parseQaOutput,
} from '../src/parsers/output-parsers.js';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { certify11xGate } from '../src/tools/certify-gate.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';
import { BlueprintResources } from '../src/resources/blueprint-resources.js';
import { GitHubFetcher, resolveSafeHomeDir } from '../src/services/github-fetcher.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import { createMcpServer } from '../src/server.js';
import { runInstallSkillCli } from '../src/cli/install-skill.js';
import { Manifest } from '../src/types.js';

describe('11X Comprehensive Branch and Edge-Case Coverage Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-edge-tests-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('clean-workspace.ts native permission and docker fallback branches', () => {
    it('captura fallo en removeTarget y ejecuta fallback hermético inyectado', async () => {
      const subDir = path.join(tempDir, 'python');
      fs.mkdirSync(subDir, { recursive: true });
      const targetFile = path.join(subDir, 'karate.jar');
      fs.writeFileSync(targetFile, 'dummy-jar-content');

      const result = await cleanWorkspace11x(tempDir, false, true, {
        fallbackExecutor: (baseDir, targets) =>
          executeAlpineFallback(baseDir, targets, ((() => {
            if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
            return Buffer.from('');
          }) as unknown as typeof execFileSync)),
        targetRemover: (baseDir) => removeTarget(baseDir, 'non-existent-to-trigger-catch'),
      });

      expect(result.dry_run).toBe(false);
      expect(result.deep_prune).toBe(true);
      expect(result.docker_fallback_used).toBe(true);
      expect(result.removed_targets).toContain('python/karate.jar');
      expect(result.recommended_command).toBe('./scripts/limpieza.sh --deep');
    });

    it('verifica que executeAlpineFallback use execFileSync con array seguro, digest fijado, --network none y rechace .. o metacaracteres', async () => {
      const recordedCalls: Array<{ cmd: string; args: readonly string[] }> = [];
      const mockExecFile = ((cmd: string, args: readonly string[]) => {
        recordedCalls.push({ cmd, args });
        return Buffer.from('');
      }) as unknown as typeof execFileSync;

      const maliciousBase = '/tmp/proj"; $(touch /tmp/pwned); #';
      const ok = executeAlpineFallback(
        maliciousBase,
        ['coverage', '../outside', '/etc/passwd', 'bad\0file'],
        mockExecFile
      );

      expect(ok).toBe(true);
      expect(recordedCalls.length).toBe(1);
      const firstCall = recordedCalls[0];
      expect(firstCall).toBeDefined();
      if (!firstCall) {
        throw new Error('Expected at least one recorded docker call');
      }
      expect(firstCall.cmd).toBe('docker');
      expect(firstCall.args).toContain(ALPINE_FALLBACK_IMAGE);
      expect(firstCall.args).toContain(
        'alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab'
      );
      const netIdx = firstCall.args.indexOf('--network');
      expect(netIdx).toBeGreaterThan(-1);
      expect(firstCall.args[netIdx + 1]).toBe('none');
      expect(firstCall.args).toContain(`${maliciousBase}:/workspace`);
      expect(firstCall.args).toContain('/workspace/coverage');
      expect(firstCall.args).not.toContain('/workspace/../outside');
      expect(firstCall.args).not.toContain('/workspace//etc/passwd');

      // Rechaza baseDir vacío, con NUL o traversal ..
      expect(executeAlpineFallback('', ['coverage'], mockExecFile)).toBe(false);
      expect(executeAlpineFallback('/tmp/bad\0dir', ['coverage'], mockExecFile)).toBe(false);
      expect(executeAlpineFallback('/tmp/../etc', ['coverage'], mockExecFile)).toBe(false);

      // Retorna false cuando todos los targets son inseguros o vacíos
      expect(executeAlpineFallback(maliciousBase, ['../escape'], mockExecFile)).toBe(false);

      // Retorna false cuando execFileSync lanza excepción
      const throwingExec = (() => {
        throw new Error('docker daemon unavailable');
      }) as unknown as typeof execFileSync;
      expect(executeAlpineFallback(tempDir, ['coverage'], throwingExec)).toBe(false);

      // Fallback por defecto (executeAlpineFallback) cuando no se inyecta fallbackExecutor
      fs.writeFileSync(path.join(tempDir, '.coverage'), 'locked');
      const origPath = process.env.PATH;
      process.env.PATH = '';
      try {
        const defaultFallbackRes = await cleanWorkspace11x(tempDir, false, false, {
          targetRemover: () => ({ removed: false }),
        });
        expect(defaultFallbackRes.docker_fallback_used).toBe(false);
      } finally {
        process.env.PATH = origPath;
      }

      // cleanWorkspace11x aplica WorkspacePathValidationError sobre rutas inseguras
      await expect(cleanWorkspace11x('/etc')).rejects.toThrow(WorkspacePathValidationError);
      await expect(cleanWorkspace11x(os.tmpdir())).rejects.toThrow(WorkspacePathValidationError);
      await expect(cleanWorkspace11x('../outside')).rejects.toThrow(WorkspacePathValidationError);
    });
  });

  describe('output-parsers.ts edge cases', () => {
    it('parsea ShellCheck en formato GCC con exactamente 3 partes', () => {
      const log = [
        'scripts/deploy.sh:42: SC2086 (info) Double quote to prevent globbing',
        'scripts/build.sh:notanumber: SC1000 syntax error',
        'just a line with SC2086 but no colons',
      ].join('\n');

      const issues = parseLinterAndComplexity(log);
      const scIssues = issues.filter((i) => i.rule?.startsWith('shellcheck-'));
      expect(scIssues.length).toBe(1);
      expect(scIssues[0]?.file).toBe('scripts/deploy.sh');
      expect(scIssues[0]?.line).toBe(42);
      expect(scIssues[0]?.rule).toBe('shellcheck-SC2086');
    });

    it('parsea mypy, ruff y eslint sin reglas entre corchetes o con lineNum no numérico', () => {
      const log = [
        'src/api.py:10: error: Syntax error without bracketed rule',
        'src/api.py:NaN: error: Something with invalid line',
        'src/api.py:NaN:1: F401 sys imported but unused',
        '/app/src/index.ts:5:10: error: Parsing error without rule',
        '/app/src/index.ts:invalid:10: warning: Another issue',
      ].join('\n');

      const issues = parseLinterAndComplexity(log);
      expect(issues.some((i) => i.rule === 'mypy-error')).toBe(true);
      expect(issues.some((i) => i.rule === 'eslint-issue')).toBe(true);
      expect(issues.some((i) => i.line === 1)).toBe(true);
    });

    it('parsea pytest failed item cuando el mensaje de error está en líneas subsiguientes', () => {
      const log = `
FAILED tests/test_flow.py::test_step_two
  Expected status 200
  Got 500 Internal Server Error
FAILED  - generic error without test name
FAILED tests/empty_failure.py
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(3);
      expect(failures[0]?.test_name).toBe('tests/test_flow.py::test_step_two');
      expect(failures[0]?.error_summary).toContain('Expected status 200');
      expect(failures[1]?.test_name).toBe('- generic error without test name');
      expect(failures[2]?.error_summary).toBe('Assertion failed');
    });

    it('parsea fallos de BATS y Vitest sin detalles en líneas subsiguientes', () => {
      const log = `
not ok 1 - bats assertion single line
FAIL tests/simple.unit.ts > testSingle
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(2);
      expect(failures[0]?.error_summary).toBe('BATS assertion failed');
      expect(failures[1]?.error_summary).toBe('Test assertion failed');
    });

    it('parsea radon con líneas incompletas o sin espacio de calificación', () => {
      const log = `
src/file.py:10: C
src/file.py:invalid: C 15 too complex
file_without_colon.py: error: some error
      `;
      const issues = parseLinterAndComplexity(log);
      expect(issues.length).toBe(1);
      expect(issues[0]?.line).toBe(1);
    });

    it('parsea pytest coverage con fila sin números de línea faltantes explícitos', () => {
      const output = `
TOTAL 100 4 96.0%
src/core/auth.py 50 2 96.0%
      `;
      const cov = parseCoverage(output);
      expect(cov.detected).toBe(true);
      expect(cov.uncovered_files[0]?.missing_lines).toBe('Uncovered lines');
    });

    it('parseTailLog retorna cadena vacía cuando la entrada está vacía', () => {
      expect(parseTailLog('')).toBe('');
      expect(parseTailLog('   \n\n   ')).toBe('');
    });

    it('parseQaOutput maneja stage security con exitCode != 0 y alertas', () => {
      const stdout = 'Target: package.json (CRITICAL: 2, HIGH: 3)';
      const result = parseQaOutput(stdout, '', 'security', { durationMs: 500, exitCode: 1 });
      expect(result.status).toBe('FAILED');
      expect(result.security_alerts.critical).toBe(2);
      expect(result.security_alerts.high).toBe(3);
    });
  });

  describe('surgical-merger.ts edge cases', () => {
    it('captura json malformado en targetContent al fusionar package.json', () => {
      const merger = new SurgicalMerger();
      const res = merger.mergePackageJson('not valid json {', '{"scripts": {"test": "vitest"}}');
      expect(res.changes.length).toBeGreaterThan(0);
      expect(res.changes[0]).toContain('Error:');
      expect(res.merged).toBe('not valid json {');
    });

    it('fusiona archivos con append_missing_lines en modo dry-run y modo efectivo', async () => {
      const merger = new SurgicalMerger();
      const gitignorePath = path.join(tempDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\ndist/\n', 'utf-8');

      const bundle = [
        {
          path: '.gitignore',
          target_name: '.gitignore',
          merge_strategy: 'append_missing_lines' as const,
          content: 'dist/\ncoverage/\n.env\n',
          sha256_verified: true,
          size_bytes: 30,
        },
      ];

      // Modo dryRun = true
      const dryResult = await merger.mergeFiles(tempDir, bundle, { dryRun: true });
      expect(dryResult.dry_run).toBe(true);
      expect(dryResult.applied_changes[0]?.status).toBe('dry_run');
      expect(dryResult.applied_changes[0]?.changes).toContain('Añadida regla: "coverage/"');

      // Modo dryRun = false
      const liveResult = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(liveResult.dry_run).toBe(false);
      expect(liveResult.applied_changes[0]?.status).toBe('merged');
      const updatedContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(updatedContent).toContain('coverage/');
      expect(updatedContent).toContain('.env');
    });

    it('omite archivos append_missing_lines si no hay nuevas líneas que añadir', async () => {
      const merger = new SurgicalMerger();
      const npmrcPath = path.join(tempDir, '.npmrc');
      fs.writeFileSync(npmrcPath, 'ignore-scripts=true\n', 'utf-8');

      const bundle = [
        {
          path: '.npmrc',
          target_name: '.npmrc',
          merge_strategy: 'append_missing_lines' as const,
          content: 'ignore-scripts=true\n',
          sha256_verified: true,
          size_bytes: 20,
        },
      ];

      const res = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(res.applied_changes[0]?.status).toBe('skipped');
    });

    it('fusiona pyproject.toml cuando ya existen herramientas configuradas', async () => {
      const merger = new SurgicalMerger();
      const pyprojectPath = path.join(tempDir, 'pyproject.toml');
      fs.writeFileSync(
        pyprojectPath,
        '[tool.pytest.ini_options]\naddopts = "-v"\n[tool.coverage.run]\nbranch = true\n',
        'utf-8'
      );

      const exampleContent = `
[tool.pytest.ini_options]
addopts = "-q"

[tool.mypy]
strict = true
      `;

      const bundle = [
        {
          path: 'pyproject.toml',
          target_name: 'pyproject.toml',
          merge_strategy: 'surgical_merge' as const,
          content: exampleContent,
          sha256_verified: true,
          size_bytes: exampleContent.length,
        },
      ];

      const res = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(res.applied_changes[0]?.status).toBe('merged');
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      expect(content).toContain('[tool.mypy]');
    });

    it('crea pyproject.toml y Makefile desde plantilla base cuando el contenido objetivo está vacío', () => {
      const merger = new SurgicalMerger();
      const pyRes = merger.mergePyprojectToml('', '[tool.mypy]\nstrict = true\n');
      expect(pyRes.changes[0]).toContain('Creado pyproject.toml');

      const makeRes = merger.mergeMakefile('', 'qa-all:\n\t@echo "qa"\n');
      expect(makeRes.changes[0]).toContain('Creado Makefile');
    });
  });

  describe('certify-gate.ts edge cases', () => {
    it('detecta bloqueo cuando existen modelos ORM SQLAlchemy pero no directorio de migraciones', async () => {
      const modelsDir = path.join(tempDir, 'src', 'models');
      fs.mkdirSync(modelsDir, { recursive: true });
      fs.writeFileSync(
        path.join(modelsDir, 'user.py'),
        'from sqlalchemy.orm import DeclarativeBase\nclass User(DeclarativeBase):\n    __tablename__ = "users"\n'
      );

      const res = await certify11xGate(tempDir);
      const ormBlocker = res.blockers.find((b) => b.includes('alembic/versions'));
      expect(ormBlocker).toBeDefined();
    });

    it('aprueba paridad ORM cuando existe directorio alembic/versions', async () => {
      const modelsDir = path.join(tempDir, 'src', 'models');
      const alembicDir = path.join(tempDir, 'alembic', 'versions');
      fs.mkdirSync(modelsDir, { recursive: true });
      fs.mkdirSync(alembicDir, { recursive: true });

      const res = await certify11xGate(tempDir);
      const ormBlocker = res.blockers.find((b) => b.includes('alembic/versions'));
      expect(ormBlocker).toBeUndefined();
    });

    it('detecta claves duplicadas en archivos JSON dentro de certify11xGate', async () => {
      const badJson = path.join(tempDir, 'dup.json');
      fs.writeFileSync(badJson, '{\n  "name": "uno",\n  "name": "dos"\n}\n');

      const res = await certify11xGate(tempDir);
      const jsonBlocker = res.blockers.find((b) => b.includes('Claves duplicadas'));
      expect(jsonBlocker).toBeDefined();
    });

    it('registra vulnerabilidades de severidad CRITICAL y HIGH como bloqueadores', async () => {
      // SEC-01 (HIGH) y SEC-10 (CRITICAL) en archivo productivo (sin 'test' en la ruta)
      fs.writeFileSync(
        path.join(tempDir, 'service.py'),
        'class UserCreate(BaseModel):\n    name: str\n\nghp_123456789012345678901234567890123456 = 1\n' // qa-secret-fixture-ok
      );

      const res = await certify11xGate(tempDir);
      expect(res.checks.zero_secrets_exposed).toBe(false);
      expect(res.checks.security_stig_owasp_clean).toBe(false);
      expect(res.blockers.some((b) => b.includes('Secreto detectado'))).toBe(true);
      expect(res.blockers.some((b) => b.includes('Vulnerabilidad HIGH'))).toBe(true);
    });

    it('detecta cuando CHANGELOG.md carece de la sección ## [Unreleased]', async () => {
      fs.writeFileSync(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-01-01\n');

      const res = await certify11xGate(tempDir);
      const clBlocker = res.blockers.find((b) => b.includes('CHANGELOG.md carece de la sección obligatoria ## [Unreleased]'));
      expect(clBlocker).toBeDefined();
    });

    it('detecta componente UI huérfano en react-frontend', async () => {
      const compDir = path.join(tempDir, 'react-frontend', 'src', 'components');
      fs.mkdirSync(compDir, { recursive: true });
      fs.writeFileSync(path.join(compDir, 'Header.tsx'), 'export const Header = () => <header />;\n');

      const res = await certify11xGate(tempDir);
      const uiBlocker = res.blockers.find((b) => b.includes('Header.tsx'));
      expect(uiBlocker).toBeDefined();
    });

    it('aprueba componente UI cuando existe su archivo de prueba .unit.ts', async () => {
      const compDir = path.join(tempDir, 'vue3', 'src', 'components');
      fs.mkdirSync(compDir, { recursive: true });
      fs.writeFileSync(path.join(compDir, 'Card.vue'), '<template><div /></template>\n');
      fs.writeFileSync(path.join(compDir, 'Card.unit.ts'), 'test("ok", () => {});\n');

      const res = await certify11xGate(tempDir);
      const cardBlocker = res.blockers.find((b) => b.includes('Card.vue'));
      expect(cardBlocker).toBeUndefined();
    });
  });

  describe('security-auditor.ts edge cases', () => {
    it('detecta asignación de secret_key o passwd en texto plano (SEC-10)', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'settings.py'),
        'secret_key = "productionSecretKey123456789"\npasswd = "MySuperSecretPass123!"\n' // qa-secret-fixture-ok
      );

      const res = await auditSecurityStigOwasp(tempDir);
      const sec10s = res.findings.filter((f) => f.rule_id === 'SEC-10');
      expect(sec10s.length).toBeGreaterThanOrEqual(2);
      expect(sec10s[0]?.severity).toBe('CRITICAL');
    });

    it('detecta footer fijo con inline style position: fixed en componente TSX o JSX', async () => {
      const compPath = path.join(tempDir, 'Footer.tsx');
      fs.writeFileSync(
        compPath,
        'export const Footer = () => <footer style="position: fixed">Pie</footer>;\n'
      );

      const jsxPath = path.join(tempDir, 'Footer.jsx');
      fs.writeFileSync(
        jsxPath,
        'export const FooterJsx = () => <footer class="fixed bottom-0">pie</footer>;\n'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      const ui01s = res.findings.filter((f) => f.rule_id === 'UI-11X-01');
      expect(ui01s.length).toBe(2);
    });

    it('aprueba innerHTML sanitizado y FastAPI con docs_url=None en producción', async () => {
      const viewPath = path.join(tempDir, 'SafeView.tsx');
      fs.writeFileSync(
        viewPath,
        'export const SafeView = () => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data) }} />;\n'
      );

      const appPath = path.join(tempDir, 'main.py');
      fs.writeFileSync(
        appPath,
        'from fastapi import FastAPI\napp = FastAPI(docs_url=None, openapi_url=None)\n# Strict-Transport-Security\n'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      expect(res.findings.some((f) => f.rule_id === 'SEC-06')).toBe(false);
      expect(res.findings.some((f) => f.rule_id === 'SEC-07')).toBe(false);
    });
  });

  describe('github-fetcher.ts local missing files fallback', () => {
    it('retorna null en readLocalManifest y readLocalFile cuando localOverridePath no contiene los archivos', async () => {
      const emptyLocalDir = path.join(tempDir, 'empty-local');
      const cacheDir = path.join(tempDir, 'cache');
      fs.mkdirSync(emptyLocalDir, { recursive: true });
      fs.mkdirSync(cacheDir, { recursive: true });

      // Guardar manifest y archivo en cache para que el fetcher no necesite red
      const mockManifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '2.7.0',
        generated_at_utc: new Date().toISOString(),
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [],
      };
      fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(mockManifest));

      const fileContent = 'cached-content-123';
      const fileHash = '4d22c9e649bb7fae1088f95c88eb1e365f133cc3311e0b54587dd329b377e96f'; // sha256 real de cached-content-123
      const fileDir = path.join(cacheDir, 'files', 'subdir');
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(path.join(fileDir, 'test.txt'), fileContent);

      const fetcher = new GitHubFetcher({
        cacheDir,
        localOverridePath: emptyLocalDir, // local existe pero no contiene los archivos
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new Error('Simulated network offline'));
      try {
        // readLocalManifest no encuentra manifest.json y cae al cache (línea 49 cubierta)
        const manifest = await fetcher.fetchManifest();
        expect(manifest.blueprint_version).toBe('2.7.0');

        // readLocalFile no encuentra subdir/test.txt y cae al cache (línea 143 cubierta)
        const content = await fetcher.fetchFileContent('subdir/test.txt', fileHash);
        expect(content).toBe(fileContent);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('retorna manifest en caché cuando fetch de red arroja error en fetchManifest', async () => {
      const cacheDir = path.join(tempDir, 'cache-net-manifest');
      fs.mkdirSync(cacheDir, { recursive: true });
      const mockManifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '2.7.0',
        generated_at_utc: new Date().toISOString(),
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [],
      };
      fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(mockManifest));

      const fetcher = new GitHubFetcher({ cacheDir });
      const origFetch = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new Error('Network offline'));
      try {
        const manifest = await fetcher.fetchManifest();
        expect(manifest.blueprint_version).toBe('2.7.0');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('formatea mensaje de error con String(err) cuando el error no es instancia de Error', async () => {
      const cacheDir = path.join(tempDir, 'cache-net-err-string');
      fs.mkdirSync(cacheDir, { recursive: true });

      const fetcher = new GitHubFetcher({ cacheDir });
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue('NonErrorString');
      try {
        await expect(fetcher.fetchManifest()).rejects.toThrow('NonErrorString');
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('blueprint-resources.ts edge cases', () => {
    it('instancia BlueprintResources sin argumentos usando fetcher por defecto', () => {
      const res = new BlueprintResources();
      expect(res).toBeDefined();
    });

    it('genera markdown de fallback cuando el readme del stack no está indexado en files', async () => {
      const dummyManifest: Manifest = {
        schema_version: '1.0.0',
        blueprint_version: '2.7.0',
        generated_at_utc: new Date().toISOString(),
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {
          custom: {
            description: 'Custom Test Stack',
            readme: 'custom/README.md',
            files: [],
          },
        },
        common_files: [
          {
            path: 'limpieza.sh',
            target_name: 'limpieza.sh',
            merge_strategy: 'overwrite_executable',
            sha256: 'clean-sha',
            size_bytes: 50,
          },
        ],
        agent_governance_files: [],
      };

      const fetcher = new GitHubFetcher({ cacheDir: path.join(tempDir, 'cache') });
      fetcher.fetchManifest = () => Promise.resolve(dummyManifest);
      fetcher.fetchFileContent = () => Promise.resolve('#!/bin/bash\necho "limpio"\n');

      const resources = new BlueprintResources(fetcher);
      const stackRes = await resources.getStackReadmeResource('custom');
      expect(stackRes.uri).toBe('blueprint://custom/readme');
      expect(stackRes.text).toBe('# Custom Test Stack\n\nSee custom/README.md');
      const stackEsRes = await resources.getStackReadmeResource('custom', 'es');
      expect(stackEsRes.text).toBe('# Custom Test Stack\n\nConsulte custom/README.md');

      const cleanRes = await resources.getCleanupScriptResource();
      expect(cleanRes.text).toContain('limpio');
    });
  });

  describe('ephemeral-runner.ts fallback sin ejecución host de make', () => {
    it('devuelve resultado estructurado cuando make no está disponible en PATH o falta Makefile', async () => {
      const mockExecFile = ((
        _cmd: string,
        _args: readonly string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        cb(new Error('make ENOENT'), '', 'make: No targets');
        return {} as ChildProcess;
      }) as unknown as typeof execFile;
      const res = await runEphemeralQa(tempDir, 'unit', 5, { execFileFn: mockExecFile });
      expect(res).toBeDefined();
      expect(res.stage).toBe('unit');
      expect(res.status).toBe('FAILED');
    });
  });

  describe('server.ts tool default parameters and branches', () => {
    it('ejecuta herramientas de server.ts con argumentos por defecto y opcionales', async () => {
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tempDir, 'cache') });
      const server = createMcpServer({ fetcher });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'edge-cases-client', version: '1.0.0' });
      const readFirstText = (res: Awaited<ReturnType<Client['callTool']>>): string => {
        const content = 'content' in res && Array.isArray(res.content) ? res.content : [];
        const first = content[0] as { text?: string } | undefined;
        return first?.text ?? '';
      };

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        // clean_workspace_11x con dry_run y deep_prune omitidos (por defecto true y false)
        const resCleanDefault = await client.callTool({
          name: 'clean_workspace_11x',
          arguments: { project_path: tempDir },
        });
        expect(readFirstText(resCleanDefault)).toContain('"dry_run":true');
        expect(readFirstText(resCleanDefault)).toContain('"deep_prune":false');

        // clean_workspace_11x con valores explícitos
        const resCleanExplicit = await client.callTool({
          name: 'clean_workspace_11x',
          arguments: {
            project_path: tempDir,
            dry_run: false,
            deep_prune: true,
          },
        });
        expect(readFirstText(resCleanExplicit)).toContain('"dry_run":false');
        expect(readFirstText(resCleanExplicit)).toContain('"deep_prune":true');

        // inspect_ast_blast_radius con max_items explícito
        const resBlast = await client.callTool({
          name: 'inspect_ast_blast_radius',
          arguments: {
            project_path: tempDir,
            target_symbol: 'DummySymbol',
            max_items: 10,
          },
        });
        expect(readFirstText(resBlast)).toContain('"target_symbol":"DummySymbol"');

        // run_ephemeral_qa con timeout_seconds usando valor por defecto
        const resQa = await client.callTool({
          name: 'run_ephemeral_qa',
          arguments: {
            project_path: tempDir,
            stage: 'unit',
          },
        });
        expect(readFirstText(resQa)).toContain('"status"');
      } finally {
        await client.close();
        await server.close();
      }
    });
  });

  describe('install-skill.ts y resolveSafeHomeDir fallback cuando process.env.HOME es undefined o UID carece de /etc/passwd', () => {
    it('ejecuta runInstallSkillCli y resolveSafeHomeDir cuando HOME no está definido incluso bajo uv_os_homedir ENOENT', async () => {
      const origHome = process.env.HOME;
      const origUserProfile = process.env.USERPROFILE;
      try {
        delete process.env.HOME;
        delete process.env.USERPROFILE;

        expect(resolveSafeHomeDir('/custom/home')).toBe('/custom/home');
        expect(
          resolveSafeHomeDir(undefined, () => {
            throw new Error('uv_os_homedir returned ENOENT (no such file or directory)');
          })
        ).toBe(os.tmpdir());

        const fakeManifest: Manifest = {
          schema_version: '1.0.0',
          blueprint_version: '2.7.0',
          generated_at_utc: new Date().toISOString(),
          repository: 'tecno-consultores/qa-testing-blueprints',
          default_branch: 'main',
          raw_base_url: 'https://raw.githubusercontent.com',
          stacks: {},
          common_files: [],
          agent_governance_files: [
            {
              path: '.agents/skills/qa-11x-architect/SKILL.md',
              target_name: 'SKILL.md',
              merge_strategy: 'copy_or_overwrite',
              sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              size_bytes: 0,
            },
          ],
        };

        const fetcher = new GitHubFetcher({ cacheDir: path.join(tempDir, 'cache') });
        fetcher.fetchManifest = () => Promise.resolve(fakeManifest);
        fetcher.fetchFileContent = () => Promise.resolve('# Skill content');

        const destDir = path.join(tempDir, '.agents', 'skills');
        fs.mkdirSync(destDir, { recursive: true });

        const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

        try {
          await runInstallSkillCli(['--target', 'workspace'], fetcher);
          expect(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
        } finally {
          cwdSpy.mockRestore();
        }
      } finally {
        if (origHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = origHome;
        }
        if (origUserProfile === undefined) {
          delete process.env.USERPROFILE;
        } else {
          process.env.USERPROFILE = origUserProfile;
        }
      }
    });
  });
});
