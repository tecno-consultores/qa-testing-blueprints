// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inspectProjectConfig } from '../src/tools/inspect-project.js';

describe('inspectProjectConfig Tool (Zero-Shot Project Assessment)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-inspect-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws error if project path does not exist', async () => {
    const fakePath = path.join(tmpDir, 'does-not-exist');
    await expect(inspectProjectConfig(fakePath)).rejects.toThrow('El directorio especificado no existe');
  });

  it('throws error if path is not a directory', async () => {
    const filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, 'content', 'utf-8');
    await expect(inspectProjectConfig(filePath)).rejects.toThrow('La ruta especificada no es un directorio');
  });

  it('detects FastAPI stack and strict flags from pyproject.toml', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `
[project]
name = "api"
dependencies = ["fastapi>=0.110.0"]

[tool.mypy]
strict = true
`,
      'utf-8'
    );

    const result = await inspectProjectConfig(tmpDir);

    expect(result.detected_stacks).toContain('fastapi');
    expect(result.strict_flags.mypy_strict).toBe(true);
    expect(result.has_docker_compose_qa).toBe(false);
    expect(result.missing_11x_files).toContain('docker-compose.qa.yml');
    expect(result.missing_11x_files).toContain('Makefile');
    expect(result.recommended_next_tool).toBe('fetch_blueprint_bundle');
  });

  it('detects Vue 3, React, and Node backend stacks from package.json and tsconfig.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'frontend',
        dependencies: {
          vue: '^3.5.0',
          express: '^4.19.0',
        },
      }),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
        },
      }),
      'utf-8'
    );

    fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf-8');

    const result = await inspectProjectConfig(tmpDir);

    expect(result.detected_stacks).toContain('vue3');
    expect(result.detected_stacks).toContain('node-backend');
    expect(result.strict_flags.tsconfig_strict).toBe(true);
    expect(result.strict_flags.npmrc_ignore_scripts).toBe(true);
  });

  it('detects bash-scripts when .sh files or bash-scripts directory exist', async () => {
    fs.writeFileSync(path.join(tmpDir, 'deploy.sh'), '#!/bin/sh\n', 'utf-8');

    const result = await inspectProjectConfig(tmpDir);
    expect(result.detected_stacks).toContain('bash-scripts');
  });

  it('identifies when all 11X files are present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services: {}\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-all:\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lefthook.yml'), 'pre-commit: {}\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'TESTING.md'), '# Testing\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog\n', 'utf-8');

    const agentsDir = path.join(tmpDir, '.agents', 'scripts');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'certify_task_completion.sh'), '#!/bin/sh\n', 'utf-8');

    const result = await inspectProjectConfig(tmpDir);

    expect(result.has_docker_compose_qa).toBe(true);
    expect(result.has_makefile).toBe(true);
    expect(result.has_lefthook).toBe(true);
    expect(result.has_testing_md).toBe(true);
    expect(result.has_changelog_md).toBe(true);
    expect(result.missing_11x_files).toHaveLength(0);
    expect(result.recommended_next_tool).toBe('fetch_blueprint_bundle');
  });

  it('detects react-frontend and fastify/nestjs stacks and handles strict=true without spaces', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'react-nest-app',
        dependencies: {
          react: '^18.2.0',
          '@nestjs/core': '^10.0.0',
        },
      }),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `
[project]
name = "py-app"
[tool.mypy]
strict=true
`,
      'utf-8'
    );

    const result = await inspectProjectConfig(tmpDir);
    expect(result.detected_stacks).toContain('react-frontend');
    expect(result.detected_stacks).toContain('node-backend');
    expect(result.detected_stacks).toContain('python');
    expect(result.strict_flags.mypy_strict).toBe(true);
  });
});
