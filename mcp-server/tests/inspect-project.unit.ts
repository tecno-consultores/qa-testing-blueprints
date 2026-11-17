// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  inspectProjectConfig,
  evaluateBrowserTestingReadiness,
} from '../src/tools/inspect-project.js';
import {
  AuditTestPyramidInputSchema,
  BootstrapMergeInputSchema,
  FetchBundleInputSchema,
  StackNameSchema,
} from '../src/types.js';

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

    it('detects IDE config in .cursor/mcp.json and .gemini/config/mcp_config.json and handles read error gracefully', () => {
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

      const fakeHomeGeminiCfg = path.join(tmpDir, 'fake-home-gemini-cfg');
      const geminiCfgDir = path.join(fakeHomeGeminiCfg, '.gemini', 'config');
      fs.mkdirSync(geminiCfgDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiCfgDir, 'mcp_config.json'),
        '{"chrome-devtools": true}',
        'utf-8'
      );
      const readinessGemini = evaluateBrowserTestingReadiness(
        tmpDir,
        [],
        ['vue3'],
        fakeHomeGeminiCfg
      );
      expect(readinessGemini.browser_mcp_configured_in_ide).toBe(true);
    });

    it('detects PHP stack with composer.json, php files, and strict flags', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'composer.json'),
        JSON.stringify({ name: 'test/php-app', require: { php: '^8.2' } }),
        'utf-8'
      );
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'App.php'), '<?php echo "hello";', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'phpstan.neon'), 'parameters:\n  level: max\n', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'infection.json5'), '{\n  minMsi: 80\n}', 'utf-8');

      const result = await inspectProjectConfig(tmpDir);

      expect(result.detected_stacks).toContain('php');
      expect(result.strict_flags.phpstan_strict).toBe(true);
      expect(result.strict_flags.infection_mutation).toBe(true);
      expect(result.missing_11x_files).not.toContain('phpstan.neon');
    });

    it('detects PHP stack with .dist config files and reports missing phpstan when absent', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'composer.json'),
        JSON.stringify({ name: 'test/php-dist' }),
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'infection.json.dist'), '{}', 'utf-8');

      const result = await inspectProjectConfig(tmpDir);

      expect(result.detected_stacks).toContain('php');
      expect(result.strict_flags.phpstan_strict).toBe(false);
      expect(result.strict_flags.infection_mutation).toBe(true);
      expect(result.missing_11x_files).toContain('phpstan.neon');
    });

    it('detects PHP stack when phpstan.neon.dist is present', async () => {
      fs.writeFileSync(path.join(tmpDir, 'composer.json'), '{}', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'phpstan.neon.dist'), 'parameters:', 'utf-8');

      const result = await inspectProjectConfig(tmpDir);

      expect(result.detected_stacks).toContain('php');
      expect(result.strict_flags.phpstan_strict).toBe(true);
      expect(result.missing_11x_files).not.toContain('phpstan.neon');
    });

    it('ignora config MCP ilegible (directorio) al evaluar disponibilidad de navegador', async () => {
      const fakeHome = path.join(tmpDir, 'fake-home');
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.5.0' } }),
        'utf-8'
      );
      fs.mkdirSync(path.join(fakeHome, '.cursor', 'mcp.json'), { recursive: true });
      const result = await inspectProjectConfig(tmpDir, fakeHome);
      expect(result.browser_testing_readiness?.applicable).toBe(true);
      expect(result.browser_testing_readiness?.browser_mcp_configured_in_ide).toBe(false);
    });
  });

  describe('10-stack detection (mobile-appium, ai-evals, vibe-rescue) and StackNameSchema', () => {
    it('exposes all 10 hydratable stacks in StackNameSchema and MCP input schemas', () => {
      expect(StackNameSchema.options).toHaveLength(10);
      expect(StackNameSchema.options).toEqual([
        'python',
        'fastapi',
        'node-backend',
        'vue3',
        'react-frontend',
        'bash-scripts',
        'php',
        'mobile-appium',
        'ai-evals',
        'vibe-rescue',
      ]);
      for (const stack of StackNameSchema.options) {
        expect(FetchBundleInputSchema.parse({ stack }).stack).toBe(stack);
        expect(BootstrapMergeInputSchema.parse({ project_path: tmpDir, stack }).stack).toBe(stack);
        expect(AuditTestPyramidInputSchema.parse({ project_path: tmpDir, stack }).stack).toBe(stack);
      }
    });

    it('detects mobile-appium without spuriously adding node-backend, and supports express+appium', async () => {
      const mobileSub = path.join(tmpDir, 'mobile-only');
      fs.mkdirSync(path.join(mobileSub, 'mobile-appium'), { recursive: true });
      fs.writeFileSync(
        path.join(mobileSub, 'mobile-appium', 'wdio.conf.ts'),
        'export const config = {};\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(mobileSub, 'mobile-appium', 'package.json'),
        JSON.stringify({
          name: 'mobile-suite',
          dependencies: { webdriverio: '^9.0.0' },
          devDependencies: { '@wdio/cli': '^9.0.0', appium: '^3.0.0', typescript: '^5.8.0' },
        }),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(mobileSub, 'mobile-appium', 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } }),
        'utf-8'
      );
      fs.writeFileSync(path.join(mobileSub, 'mobile-appium', '.npmrc'), 'ignore-scripts=true\n', 'utf-8');

      const mobileRes = await inspectProjectConfig(mobileSub);
      expect(mobileRes.detected_stacks).toContain('mobile-appium');
      expect(mobileRes.detected_stacks).not.toContain('node-backend');
      expect(mobileRes.strict_flags.tsconfig_strict).toBe(true);
      expect(mobileRes.strict_flags.npmrc_ignore_scripts).toBe(true);

      const rootWdioJs = path.join(tmpDir, 'root-wdio-js');
      fs.mkdirSync(rootWdioJs, { recursive: true });
      fs.writeFileSync(path.join(rootWdioJs, 'wdio.conf.js'), 'exports.config = {};\n', 'utf-8');
      expect((await inspectProjectConfig(rootWdioJs)).detected_stacks).toContain('mobile-appium');

      const malformedCombo = path.join(tmpDir, 'malformed-appium-express');
      fs.mkdirSync(malformedCombo, { recursive: true });
      fs.writeFileSync(
        path.join(malformedCombo, 'package.json'),
        '{ invalid json "appium": "3.0.0", "express": "4.19.0", "dependencies": [] }',
        'utf-8'
      );
      const comboRes = await inspectProjectConfig(malformedCombo);
      expect(comboRes.detected_stacks).toContain('mobile-appium');
      expect(comboRes.detected_stacks).toContain('node-backend');
    });

    it('detects ai-evals via promptfooconfig, ai-evals dir, pyproject.toml, requirements, and package.json', async () => {
      const yamlDir = path.join(tmpDir, 'ai-yaml');
      fs.mkdirSync(yamlDir, { recursive: true });
      fs.writeFileSync(path.join(yamlDir, 'promptfooconfig.yaml'), 'providers: []\n', 'utf-8');
      expect((await inspectProjectConfig(yamlDir)).detected_stacks).toEqual(['ai-evals']);

      const dirEval = path.join(tmpDir, 'ai-dir');
      fs.mkdirSync(path.join(dirEval, 'ai-evals', 'rag'), { recursive: true });
      fs.writeFileSync(path.join(dirEval, 'ai-evals', 'golden_from_traces.py'), '# golden\n', 'utf-8');
      expect((await inspectProjectConfig(dirEval)).detected_stacks).toEqual(['ai-evals']);

      const emptyAiDir = path.join(tmpDir, 'ai-empty-dir');
      fs.mkdirSync(path.join(emptyAiDir, 'ai-evals'), { recursive: true });
      expect((await inspectProjectConfig(emptyAiDir)).detected_stacks).not.toContain('ai-evals');

      const pyEvalDir = path.join(tmpDir, 'ai-py');
      fs.mkdirSync(pyEvalDir, { recursive: true });
      fs.writeFileSync(
        path.join(pyEvalDir, 'pyproject.toml'),
        '[project]\ndependencies = ["deepeval>=1.0"]\n',
        'utf-8'
      );
      const pyRes = await inspectProjectConfig(pyEvalDir);
      expect(pyRes.detected_stacks).toContain('python');
      expect(pyRes.detected_stacks).toContain('ai-evals');

      const pkgEvalDir = path.join(tmpDir, 'ai-pkg');
      fs.mkdirSync(pkgEvalDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgEvalDir, 'package.json'),
        JSON.stringify({ devDependencies: { promptfoo: '^0.100.0' } }),
        'utf-8'
      );
      fs.writeFileSync(path.join(pkgEvalDir, 'requirements.txt'), 'deepeval>=1.0\n', 'utf-8');
      expect((await inspectProjectConfig(pkgEvalDir)).detected_stacks).toContain('ai-evals');
    });

    it('detects vibe-rescue only on explicit markers and never false-positives on clean Vite/React apps', async () => {
      const cleanReact = path.join(tmpDir, 'clean-react-vite');
      fs.mkdirSync(path.join(cleanReact, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(cleanReact, 'package.json'),
        JSON.stringify({
          name: 'clean-app',
          dependencies: { react: '^19.0.0' },
          devDependencies: { vite: '^6.0.0', typescript: '^5.8.0' },
        }),
        'utf-8'
      );
      fs.writeFileSync(path.join(cleanReact, 'src', 'App.tsx'), 'export const App = () => null;\n', 'utf-8');
      const cleanRes = await inspectProjectConfig(cleanReact);
      expect(cleanRes.detected_stacks).toContain('react-frontend');
      expect(cleanRes.detected_stacks).not.toContain('vibe-rescue');

      const vibeSubdir = path.join(tmpDir, 'vibe-subdir');
      fs.mkdirSync(path.join(vibeSubdir, 'vibe-rescue'), { recursive: true });
      fs.writeFileSync(
        path.join(vibeSubdir, 'vibe-rescue', 'audit_vibe_prototype.py'),
        '# audit\n',
        'utf-8'
      );
      expect((await inspectProjectConfig(vibeSubdir)).detected_stacks).toEqual(['vibe-rescue']);

      const vibeRoot = path.join(tmpDir, 'vibe-root-markers');
      fs.mkdirSync(path.join(vibeRoot, '.lovable'), { recursive: true });
      fs.writeFileSync(
        path.join(vibeRoot, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: { 'lovable-tagger': '^1.0.0' } }),
        'utf-8'
      );
      const vibeRes = await inspectProjectConfig(vibeRoot);
      expect(vibeRes.detected_stacks).toContain('react-frontend');
      expect(vibeRes.detected_stacks).toContain('vibe-rescue');

      const lovableFileDir = path.join(tmpDir, 'vibe-lovable-file');
      fs.mkdirSync(lovableFileDir, { recursive: true });
      fs.writeFileSync(path.join(lovableFileDir, '.lovable'), 'project=1\n', 'utf-8');
      expect((await inspectProjectConfig(lovableFileDir)).detected_stacks).toEqual(['vibe-rescue']);

      const lovableBridgeOnlyDir = path.join(tmpDir, 'lovable-bridge-only');
      fs.mkdirSync(path.join(lovableBridgeOnlyDir, '.lovable'), { recursive: true });
      fs.writeFileSync(path.join(lovableBridgeOnlyDir, '.lovable', 'rules.md'), '# Bridge\n', 'utf-8');
      expect((await inspectProjectConfig(lovableBridgeOnlyDir)).detected_stacks).not.toContain('vibe-rescue');

      const aiYmlDir = path.join(tmpDir, 'ai-evals-yml-only');
      fs.mkdirSync(path.join(aiYmlDir, 'ai-evals'), { recursive: true });
      fs.writeFileSync(path.join(aiYmlDir, 'ai-evals', 'eval_cfg.yml'), 'providers: []\n', 'utf-8');
      expect((await inspectProjectConfig(aiYmlDir)).detected_stacks).toContain('ai-evals');

      const aiTsDir = path.join(tmpDir, 'ai-evals-ts-only');
      fs.mkdirSync(path.join(aiTsDir, 'ai-evals'), { recursive: true });
      fs.writeFileSync(path.join(aiTsDir, 'ai-evals', 'eval_helper.ts'), 'export const x = 1;\n', 'utf-8');
      expect((await inspectProjectConfig(aiTsDir)).detected_stacks).toContain('ai-evals');

      const aiYamlDir = path.join(tmpDir, 'ai-evals-yaml-only');
      fs.mkdirSync(path.join(aiYamlDir, 'ai-evals'), { recursive: true });
      fs.writeFileSync(path.join(aiYamlDir, 'ai-evals', 'suite.yaml'), 'tests: []\n', 'utf-8');
      expect((await inspectProjectConfig(aiYamlDir)).detected_stacks).toContain('ai-evals');
    });

    it('tolerates unreadable root and unreadable subdirectories via fail-safe catch paths', async () => {
      const subDirProj = path.join(tmpDir, 'locked-sub-proj');
      const lockedSub = path.join(subDirProj, 'restricted');
      fs.mkdirSync(lockedSub, { recursive: true });
      fs.writeFileSync(path.join(subDirProj, 'deploy.sh'), '#!/bin/sh\n', 'utf-8');
      fs.chmodSync(lockedSub, 0o000);
      try {
        const res = await inspectProjectConfig(subDirProj);
        expect(res.detected_stacks).toContain('bash-scripts');
      } finally {
        fs.chmodSync(lockedSub, 0o700);
      }

      const lockedRoot = path.join(tmpDir, 'locked-root-proj');
      fs.mkdirSync(lockedRoot, { recursive: true });
      fs.chmodSync(lockedRoot, 0o000);
      try {
        const res = await inspectProjectConfig(lockedRoot);
        expect(res.detected_stacks).toEqual([]);
      } finally {
        fs.chmodSync(lockedRoot, 0o700);
      }
    });
  });
});
