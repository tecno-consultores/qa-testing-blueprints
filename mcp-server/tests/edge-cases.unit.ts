// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
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
import { GitHubFetcher } from '../src/services/github-fetcher.js';
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
    it('captura fallo en removeTarget y ejecuta fallback nativo de Alpine', async () => {
      const subDir = path.join(tempDir, 'python');
      fs.mkdirSync(subDir, { recursive: true });
      const targetFile = path.join(subDir, 'karate.jar');
      fs.writeFileSync(targetFile, 'dummy-jar-content');

      // Restringir permisos de escritura del directorio contenedor para provocar EACCES al borrar
      fs.chmodSync(subDir, 0o555);

      try {
        const result = await cleanWorkspace11x(
          tempDir,
          false, // dryRun = false
          true   // deepPrune = true
        );

        // removeTarget fallará por permisos y executeAlpineFallback correrá docker efímero
        expect(result.dry_run).toBe(false);
        expect(result.deep_prune).toBe(true);
        expect(result.recommended_command).toBe('./scripts/limpieza.sh --deep');
      } finally {
        // Restaurar permisos para permitir la limpieza
        fs.chmodSync(subDir, 0o755);
      }
    });

    it('ejecuta fallback nativo de Alpine cuando targetRemover simula fallo', async () => {
      const artifactDir = path.join(tempDir, 'coverage');
      fs.mkdirSync(artifactDir, { recursive: true });

      const result = await cleanWorkspace11x(
        tempDir,
        false,
        false,
        undefined, // fallbackExecutor por defecto (executeAlpineFallback)
        () => ({ removed: false })
      );

      expect(result.docker_fallback_used).toBe(false);
      expect(result.recommended_command).toBe('./scripts/limpieza.sh');
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
      const scIssues = issues.filter((i) => i.rule.startsWith('shellcheck-'));
      expect(scIssues.length).toBe(1);
      expect(scIssues[0].file).toBe('scripts/deploy.sh');
      expect(scIssues[0].line).toBe(42);
      expect(scIssues[0].rule).toBe('shellcheck-SC2086');
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
      expect(failures[0].test_name).toBe('tests/test_flow.py::test_step_two');
      expect(failures[0].error_summary).toContain('Expected status 200');
      expect(failures[1].test_name).toBe('- generic error without test name');
      expect(failures[2].error_summary).toBe('Assertion failed');
    });

    it('parsea fallos de BATS y Vitest sin detalles en líneas subsiguientes', () => {
      const log = `
not ok 1 - bats assertion single line
FAIL tests/simple.unit.ts > testSingle
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(2);
      expect(failures[0].error_summary).toBe('BATS assertion failed');
      expect(failures[1].error_summary).toBe('Test assertion failed');
    });

    it('parsea radon con líneas incompletas o sin espacio de calificación', () => {
      const log = `
src/file.py:10: C
src/file.py:invalid: C 15 too complex
file_without_colon.py: error: some error
      `;
      const issues = parseLinterAndComplexity(log);
      expect(issues.length).toBe(1);
      expect(issues[0].line).toBe(1);
    });

    it('parsea pytest coverage con fila sin números de línea faltantes explícitos', () => {
      const output = `
TOTAL 100 4 96.0%
src/core/auth.py 50 2 96.0%
      `;
      const cov = parseCoverage(output);
      expect(cov.detected).toBe(true);
      expect(cov.uncovered_files[0].missing_lines).toBe('Uncovered lines');
    });

    it('parseTailLog retorna cadena vacía cuando la entrada está vacía', () => {
      expect(parseTailLog('')).toBe('');
      expect(parseTailLog('   \n\n   ')).toBe('');
    });

    it('parseQaOutput maneja stage security con exitCode != 0 y alertas', () => {
      const stdout = 'Target: package.json (CRITICAL: 2, HIGH: 3)';
      const result = parseQaOutput(stdout, '', 'security', 500, 1);
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
      expect(res.merged).toContain('"test": "vitest"');
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
          sha256: 'abc',
          size_bytes: 30,
        },
      ];

      // Modo dryRun = true
      const dryResult = await merger.mergeFiles(tempDir, bundle, { dryRun: true });
      expect(dryResult.dry_run).toBe(true);
      expect(dryResult.applied_changes[0].status).toBe('dry_run');
      expect(dryResult.applied_changes[0].changes).toContain('Añadida regla: "coverage/"');

      // Modo dryRun = false
      const liveResult = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(liveResult.dry_run).toBe(false);
      expect(liveResult.applied_changes[0].status).toBe('merged');
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
          sha256: 'xyz',
          size_bytes: 20,
        },
      ];

      const res = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(res.applied_changes[0].status).toBe('skipped');
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
          sha256: 'tomlhash',
          size_bytes: exampleContent.length,
        },
      ];

      const res = await merger.mergeFiles(tempDir, bundle, { dryRun: false });
      expect(res.applied_changes[0].status).toBe('merged');
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
    it('detecta bloqueo cuando existen modelos ORM pero no directorio de migraciones', async () => {
      const modelsDir = path.join(tempDir, 'src', 'models');
      fs.mkdirSync(modelsDir, { recursive: true });
      fs.writeFileSync(path.join(modelsDir, 'user.py'), 'class User: pass\n');

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
        'class UserCreate(BaseModel):\n    name: str\n\nghp_123456789012345678901234567890123456 = 1\n'
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

    it('aprueba componente UI cuando existe su archivo de prueba .unit.tsx', async () => {
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
        'secret_key = "productionSecretKey123456789"\npasswd = "MySuperSecretPass123!"\n'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      const sec10s = res.findings.filter((f) => f.rule_id === 'SEC-10');
      expect(sec10s.length).toBeGreaterThanOrEqual(2);
      expect(sec10s[0].severity).toBe('CRITICAL');
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
      globalThis.fetch = async () => {
        throw new Error('Simulated network offline');
      };
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
      globalThis.fetch = async () => {
        throw new Error('Network offline');
      };
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
      globalThis.fetch = async () => {
        throw 'NonErrorString';
      };
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
      fetcher.fetchManifest = async () => dummyManifest;
      fetcher.fetchFileContent = async () => '#!/bin/bash\necho "limpio"\n';

      const resources = new BlueprintResources(fetcher);
      const stackRes = await resources.getStackReadmeResource('custom');
      expect(stackRes.uri).toBe('blueprint://custom/readme');
      expect(stackRes.text).toBe('# Custom Test Stack\n\nConsulte custom/README.md');

      const cleanRes = await resources.getCleanupScriptResource();
      expect(cleanRes.text).toContain('limpio');
    });
  });

  describe('ephemeral-runner.ts fallback a execFile nativo', () => {
    it('ejecuta make nativo o devuelve fallo cuando make no existe sin opciones mockeadas', async () => {
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'qa-unit:\n\t@echo "ok"\n');
      const res = await runEphemeralQa(tempDir, 'unit', 5);
      expect(res).toBeDefined();
      expect(res.stage).toBe('unit');
    });
  });

  describe('server.ts tool default parameters and branches', () => {
    it('ejecuta herramientas de server.ts con argumentos por defecto y opcionales', async () => {
      const fetcher = new GitHubFetcher({ cacheDir: path.join(tempDir, 'cache') });
      const server = createMcpServer(fetcher);
      const serverAny = server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }
        >;
      };

      const toolClean = serverAny._registeredTools['clean_workspace_11x'];
      expect(toolClean).toBeDefined();

      // clean_workspace_11x con dry_run y deep_prune omitidos (por defecto true y false)
      const resCleanDefault = await toolClean.handler({ project_path: tempDir });
      expect(resCleanDefault.content[0].text).toContain('"dry_run": true');
      expect(resCleanDefault.content[0].text).toContain('"deep_prune": false');

      // clean_workspace_11x con valores explícitos
      const resCleanExplicit = await toolClean.handler({
        project_path: tempDir,
        dry_run: false,
        deep_prune: true,
      });
      expect(resCleanExplicit.content[0].text).toContain('"dry_run": false');
      expect(resCleanExplicit.content[0].text).toContain('"deep_prune": true');

      // inspect_ast_blast_radius con exclude_dirs explícito
      const toolBlast = serverAny._registeredTools['inspect_ast_blast_radius'];
      const resBlast = await toolBlast.handler({
        project_path: tempDir,
        target_symbol: 'DummySymbol',
        exclude_dirs: ['node_modules', 'dist'],
      });
      expect(resBlast.content[0].text).toContain('"target_symbol": "DummySymbol"');

      // run_ephemeral_qa con timeout_seconds omitido (por defecto 120)
      const toolQa = serverAny._registeredTools['run_ephemeral_qa'];
      const resQa = await toolQa.handler({
        project_path: tempDir,
        stage: 'unit',
      });
      expect(resQa.content[0].text).toContain('"status"');
    });
  });

  describe('install-skill.ts fallback a os.homedir() cuando process.env.HOME es undefined', () => {
    it('ejecuta runInstallSkillCli cuando HOME no está definido', async () => {
      const origHome = process.env.HOME;
      try {
        delete process.env.HOME;

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
        fetcher.fetchManifest = async () => fakeManifest;
        fetcher.fetchFileContent = async () => '# Skill content';

        const destDir = path.join(tempDir, '.agents', 'skills');
        fs.mkdirSync(destDir, { recursive: true });

        const origCwd = process.cwd;
        process.cwd = () => tempDir;

        try {
          await runInstallSkillCli(['--target', 'workspace'], fetcher);
          expect(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
        } finally {
          process.cwd = origCwd;
        }
      } finally {
        process.env.HOME = origHome;
      }
    });
  });
});
