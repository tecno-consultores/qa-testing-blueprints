// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  inspectProjectConfig,
  evaluateBrowserTestingReadiness,
} from '../src/tools/inspect-project.js';

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

  describe('evaluateBrowserTestingReadiness and inspectProjectConfig integration', () => {
    it('returns not applicable when stacks do not include vue3 or react-frontend', () => {
      const readiness = evaluateBrowserTestingReadiness(tmpDir, [], ['python', 'bash-scripts']);
      expect(readiness.applicable).toBe(false);
      expect(readiness.playwright_test_installed).toBe(false);
      expect(readiness.axe_core_playwright_installed).toBe(false);
      expect(readiness.lhci_cli_installed).toBe(false);
      expect(readiness.e2e_spec_present).toBe(false);
      expect(readiness.browser_mcp_configured_in_ide).toBe(false);
      expect(readiness.install_instructions).toEqual([]);
    });

    it('detects missing dependencies, missing e2e and missing ide mcp in vue3 project', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'vue-app',
          dependencies: { vue: '^3.5.0' },
        }),
        'utf-8'
      );

      const fakeHome = path.join(tmpDir, 'fake-home');
      fs.mkdirSync(fakeHome, { recursive: true });

      const result = await inspectProjectConfig(tmpDir, fakeHome);
      expect(result.browser_testing_readiness).toBeDefined();
      const btr = result.browser_testing_readiness!;
      expect(btr.applicable).toBe(true);
      expect(btr.playwright_test_installed).toBe(false);
      expect(btr.axe_core_playwright_installed).toBe(false);
      expect(btr.lhci_cli_installed).toBe(false);
      expect(btr.e2e_spec_present).toBe(false);
      expect(btr.browser_mcp_configured_in_ide).toBe(false);
      expect(btr.install_instructions).toHaveLength(2);
      expect(btr.install_instructions[0]).toContain("bootstrap_or_merge_11x");
      expect(btr.install_instructions[1]).toContain("playwright");
    });

    it('detects fully configured browser testing environment with playwright and axe-core in react project', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'react-app',
          dependencies: { react: '^18.0.0' },
          devDependencies: {
            '@playwright/test': '^1.40.0',
            '@axe-core/playwright': '^4.8.0',
            '@lhci/cli': '^0.13.0',
          },
        }),
        'utf-8'
      );

      const e2eDir = path.join(tmpDir, 'e2e');
      fs.mkdirSync(e2eDir, { recursive: true });
      fs.writeFileSync(path.join(e2eDir, 'accessibility.e2e.ts'), '// e2e test', 'utf-8');

      const fakeHome = path.join(tmpDir, 'fake-home-ide');
      const geminiDir = path.join(fakeHome, '.gemini', 'antigravity');
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, 'mcp_config.json'),
        JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
        'utf-8'
      );

      const result = await inspectProjectConfig(tmpDir, fakeHome);
      const btr = result.browser_testing_readiness!;
      expect(btr.applicable).toBe(true);
      expect(btr.playwright_test_installed).toBe(true);
      expect(btr.axe_core_playwright_installed).toBe(true);
      expect(btr.lhci_cli_installed).toBe(true);
      expect(btr.e2e_spec_present).toBe(true);
      expect(btr.browser_mcp_configured_in_ide).toBe(true);
      expect(btr.install_instructions).toEqual([]);
    });

    it('detects packages in subdirectories and handles malformed package.json and IDE configs', () => {
      const reactSubdir = path.join(tmpDir, 'react-frontend');
      fs.mkdirSync(reactSubdir, { recursive: true });
      // Malformed JSON that contains strings
      fs.writeFileSync(
        path.join(reactSubdir, 'package.json'),
        '{"name": "sub", dependencies: {"@playwright/test": "1.0", "@axe-core/playwright": "1.0", "@lhci/cli": "1.0"}}',
        'utf-8'
      );

      const fakeHome = path.join(tmpDir, 'fake-home-claude');
      fs.mkdirSync(fakeHome, { recursive: true });
      fs.writeFileSync(path.join(fakeHome, '.claude.json'), '{"mcp": "chrome-devtools"}', 'utf-8');

      const files = ['src/App.tsx', 'e2e/flow.e2e.ts'];
      const readiness = evaluateBrowserTestingReadiness(
        tmpDir,
        files,
        ['react-frontend'],
        fakeHome
      );

      expect(readiness.applicable).toBe(true);
      expect(readiness.playwright_test_installed).toBe(true);
      expect(readiness.axe_core_playwright_installed).toBe(true);
      expect(readiness.lhci_cli_installed).toBe(true);
      expect(readiness.e2e_spec_present).toBe(true);
      expect(readiness.browser_mcp_configured_in_ide).toBe(true);
      expect(readiness.install_instructions).toEqual([]);
    });

    it('detects IDE config in .cursor/mcp.json and handles read error gracefully', () => {
      const fakeHome = path.join(tmpDir, 'fake-home-cursor');
      const cursorDir = path.join(fakeHome, '.cursor');
      fs.mkdirSync(cursorDir, { recursive: true });
      fs.writeFileSync(path.join(cursorDir, 'mcp.json'), '{"playwright": true}', 'utf-8');

      const readiness = evaluateBrowserTestingReadiness(
        tmpDir,
        [],
        ['vue3'],
        fakeHome
      );
      expect(readiness.browser_mcp_configured_in_ide).toBe(true);
    });
  });
});
