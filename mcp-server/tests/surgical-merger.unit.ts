// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SurgicalMerger } from '../src/services/surgical-merger.js';
import { FetchedFileItem } from '../src/types.js';

describe('SurgicalMerger Service (Non-destructive AST/Configuration Merging)', () => {
  let merger: SurgicalMerger;
  let tmpDir: string;

  beforeEach(() => {
    merger = new SurgicalMerger();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-merger-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('mergePackageJson', () => {
    it('preserves existing properties, scripts, and dependencies while injecting missing devDependencies', () => {
      const target = JSON.stringify({
        name: 'my-app',
        version: '1.0.0',
        scripts: {
          start: 'node index.js',
          test: 'my-custom-test',
        },
        dependencies: {
          express: '^4.19.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      });

      const example = JSON.stringify({
        scripts: {
          'qa:lint': 'eslint .',
          'qa:unit': 'vitest run',
          test: 'vitest run', // no debe sobreescribir 'my-custom-test'
        },
        devDependencies: {
          vitest: '^2.1.8',
          typescript: '^5.7.0', // ya existe -> no sobreescribir
          eslint: '^8.57.0',
        },
        pnpm: {
          onlyBuiltDependencies: ['esbuild'],
        },
      });

      const { merged, changes } = merger.mergePackageJson(target, example);
      const parsed = JSON.parse(merged);

      expect(parsed.name).toBe('my-app');
      expect(parsed.scripts.start).toBe('node index.js');
      expect(parsed.scripts.test).toBe('my-custom-test'); // Preservado
      expect(parsed.scripts['qa:lint']).toBe('eslint .'); // Inyectado
      expect(parsed.scripts['qa:unit']).toBe('vitest run'); // Inyectado

      expect(parsed.dependencies.express).toBe('^4.19.0');
      expect(parsed.devDependencies.typescript).toBe('^5.0.0'); // Preservado
      expect(parsed.devDependencies.vitest).toBe('^2.1.8'); // Inyectado
      expect(parsed.devDependencies.eslint).toBe('^8.57.0'); // Inyectado

      expect(changes.length).toBeGreaterThan(0);
    });

    it('handles empty or malformed target JSON gracefully', () => {
      const example = JSON.stringify({
        scripts: { 'qa:all': 'make qa-all' },
        devDependencies: { vitest: '^2.0.0' },
      });
      const { merged, changes } = merger.mergePackageJson('', example);
      const parsed = JSON.parse(merged);

      expect(parsed.scripts['qa:all']).toBe('make qa-all');
      expect(parsed.devDependencies.vitest).toBe('^2.0.0');
      expect(changes).toHaveLength(2);
    });
  });

  describe('mergePyprojectToml', () => {
    it('returns example if target is empty', () => {
      const example = '[project]\nname = "test"\n';
      const { merged, changes } = merger.mergePyprojectToml('', example);
      expect(merged).toBe(example);
      expect(changes).toContain('Creado pyproject.toml con plantilla base completa.');
    });

    it('preserves [project] and injects missing tool sections', () => {
      const target = `
[project]
name = "business-api"
version = "0.1.0"
dependencies = ["fastapi", "sqlalchemy"]
`;

      const example = `
[tool.ruff]
line-length = 100

[tool.mypy]
strict = true

[tool.pytest.ini_options]
addopts = "--cov=src --cov-fail-under=95"
`;

      const { merged, changes } = merger.mergePyprojectToml(target, example);

      expect(merged).toContain('name = "business-api"');
      expect(merged).toContain('[tool.ruff]');
      expect(merged).toContain('[tool.mypy]');
      expect(merged).toContain('[tool.pytest.ini_options]');
      expect(changes).toHaveLength(3);
    });

    it('does not duplicate sections already present in target', () => {
      const target = `
[tool.ruff]
line-length = 120
`;
      const example = `
[tool.ruff]
line-length = 100
`;
      const { merged, changes } = merger.mergePyprojectToml(target, example);
      expect(changes).toHaveLength(0);
      expect(merged).toBe(target.trimEnd() + '\n');
    });
  });

  describe('mergeMakefile', () => {
    it('returns example if target is empty', () => {
      const example = 'qa-all:\n\techo "ok"\n';
      const { merged, changes } = merger.mergeMakefile('', example);
      expect(merged).toBe(example);
      expect(changes).toContain('Creado Makefile con plantilla base completa.');
    });

    it('preserves existing custom targets and appends missing qa-* targets', () => {
      const target = `
build:
\tdocker build -t app .

test:
\tpytest
`;
      const example = `
qa-lint:
\truff check src/

qa-unit:
\tpytest --cov=src

test:
\tpytest -v
`;
      const { merged, changes } = merger.mergeMakefile(target, example);

      expect(merged).toContain('build:');
      expect(merged).toContain('qa-lint:');
      expect(merged).toContain('qa-unit:');
      expect(changes).toContain('Añadido target Makefile: "qa-lint"');
      expect(changes).toContain('Añadido target Makefile: "qa-unit"');
      expect(changes).not.toContain('Añadido target Makefile: "test"'); // ya existía
    });
  });

  describe('mergeGitignoreOrNpmrc', () => {
    it('appends non-duplicate lines', () => {
      const target = 'node_modules\n.env\n';
      const example = 'node_modules\ncoverage\n.cache\n# comentario\n';

      const { merged, changes } = merger.mergeGitignoreOrNpmrc(target, example);

      expect(merged).toContain('coverage');
      expect(merged).toContain('.cache');
      expect(changes).toContain('Añadida regla: "coverage"');
      expect(changes).toContain('Añadida regla: ".cache"');
      expect(changes).not.toContain('Añadida regla: "node_modules"');
    });
  });

  describe('mergeFiles', () => {
    it('handles dry_run correctly without writing to disk', async () => {
      const bundle: FetchedFileItem[] = [
        {
          path: 'fastapi/Makefile.example',
          target_name: 'Makefile',
          merge_strategy: 'surgical_merge',
          content: 'qa-all:\n\techo "ok"\n',
          sha256_verified: true,
        },
      ];

      const res = await merger.mergeFiles(tmpDir, bundle, { dryRun: true });

      expect(res.dry_run).toBe(true);
      expect(res.summary.created).toBe(1);
      expect(fs.existsSync(path.join(tmpDir, 'Makefile'))).toBe(false);
    });

    it('writes files and sets executable mode for scripts', async () => {
      const bundle: FetchedFileItem[] = [
        {
          path: 'scripts/verificar.sh',
          target_name: 'scripts/verificar.sh',
          merge_strategy: 'overwrite_executable',
          content: '#!/bin/sh\necho "ok"\n',
          sha256_verified: true,
        },
        {
          path: 'gitignore.example',
          target_name: '.gitignore',
          merge_strategy: 'append_missing_lines',
          content: 'dist/\n',
          sha256_verified: true,
        },
      ];

      const res = await merger.mergeFiles(tmpDir, bundle, { dryRun: false });

      expect(res.dry_run).toBe(false);
      expect(res.summary.created).toBe(2);

      const scriptPath = path.join(tmpDir, 'scripts/verificar.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);
      const stat = fs.statSync(scriptPath);
      // Debe tener permisos de ejecución (bit 0o111)
      expect(stat.mode & 0o111).toBeTruthy();
    });

    it('skips copy_if_missing if target already exists', async () => {
      const existingFile = path.join(tmpDir, 'test.bats');
      fs.writeFileSync(existingFile, '# original bats', 'utf-8');

      const bundle: FetchedFileItem[] = [
        {
          path: 'test.bats',
          target_name: 'test.bats',
          merge_strategy: 'copy_if_missing',
          content: '# new bats',
          sha256_verified: true,
        },
      ];

      const res = await merger.mergeFiles(tmpDir, bundle, { dryRun: false });

      expect(res.summary.skipped).toBe(1);
      expect(fs.readFileSync(existingFile, 'utf-8')).toBe('# original bats');
    });

    it('merges existing package.json, pyproject.toml, Makefile and generic configs via surgical_merge', async () => {
      // 1. Crear archivos existentes en tmpDir
      const pkgPath = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-app', devDependencies: {} }), 'utf-8');

      const pyprojectPath = path.join(tmpDir, 'pyproject.toml');
      fs.writeFileSync(pyprojectPath, '[project]\nname = "demo"\n', 'utf-8');

      const makefilePath = path.join(tmpDir, 'Makefile');
      fs.writeFileSync(makefilePath, 'test:\n\tpytest\n', 'utf-8');

      const genericPath = path.join(tmpDir, 'custom.conf');
      fs.writeFileSync(genericPath, 'setting1=true\n', 'utf-8');

      const overwrittenPath = path.join(tmpDir, 'overwritten.txt');
      fs.writeFileSync(overwrittenPath, 'initial content\n', 'utf-8');

      const bundle: FetchedFileItem[] = [
        {
          path: 'package.json.example',
          target_name: 'package.json',
          merge_strategy: 'surgical_merge',
          content: JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
          sha256_verified: true,
        },
        {
          path: 'pyproject.toml.example',
          target_name: 'pyproject.toml',
          merge_strategy: 'surgical_merge',
          content: '[tool.ruff]\nline-length = 88\n',
          sha256_verified: true,
        },
        {
          path: 'Makefile.example',
          target_name: 'Makefile',
          merge_strategy: 'surgical_merge',
          content: 'qa-lint:\n\truff check .\n',
          sha256_verified: true,
        },
        {
          path: 'custom.conf.example',
          target_name: 'custom.conf',
          merge_strategy: 'surgical_merge',
          content: 'setting2=false\n',
          sha256_verified: true,
        },
        {
          path: 'overwritten.txt',
          target_name: 'overwritten.txt',
          merge_strategy: 'copy_or_overwrite',
          content: 'overwritten content\n',
          sha256_verified: true,
        },
      ];

      const res = await merger.mergeFiles(tmpDir, bundle, { dryRun: false });

      expect(res.summary.merged).toBe(5);
      expect(fs.readFileSync(pkgPath, 'utf-8')).toContain('vitest');
      expect(fs.readFileSync(pyprojectPath, 'utf-8')).toContain('[tool.ruff]');
      expect(fs.readFileSync(makefilePath, 'utf-8')).toContain('qa-lint:');
      expect(fs.readFileSync(genericPath, 'utf-8')).toContain('setting2=false');
      expect(fs.readFileSync(path.join(tmpDir, 'overwritten.txt'), 'utf-8')).toBe('overwritten content\n');
    });

    it('skips existing files when surgical merge results in zero new changes', async () => {
      const pkgPath = path.join(tmpDir, 'package.json');
      const identical = JSON.stringify({ name: 'same', devDependencies: { vitest: '^2.0.0' } }, null, 2);
      fs.writeFileSync(pkgPath, identical, 'utf-8');

      const bundle: FetchedFileItem[] = [
        {
          path: 'package.json.example',
          target_name: 'package.json',
          merge_strategy: 'surgical_merge',
          content: identical,
          sha256_verified: true,
        },
      ];

      const res = await merger.mergeFiles(tmpDir, bundle, { dryRun: false });
      expect(res.summary.skipped).toBe(1);
      expect(res.applied_changes[0].status).toBe('skipped');
    });
  });
});
