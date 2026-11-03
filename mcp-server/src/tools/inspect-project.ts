// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectAuditResult, BrowserTestingReadiness, StackName } from '../types.js';

const BASH_STACK_NAME = 'bash-scripts';
const UTF8_ENCODING = 'utf-8';
const PACKAGE_JSON = 'package.json';
const REACT_FRONTEND_STACK = 'react-frontend';
const INSTRUCTION_BOOTSTRAP =
  "Ejecute la tool MCP 'bootstrap_or_merge_11x' para inyectar automáticamente @playwright/test, @axe-core/playwright, @lhci/cli y e2e/accessibility.e2e.ts en el proyecto.";
const INSTRUCTION_BROWSER_MCP =
  "Para inspección visual Anti-JSDOM en navegador real desde su agente IA, agregue el servidor MCP de Playwright en su configuración MCP: npx -y @playwright/mcp@latest";

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.venv',
  'venv',
  'coverage',
  '.turbo',
  'test-results',
  '.mypy_cache',
  '.pytest_cache',
  '.pnpm-store',
  '.cache',
  'build',
  '__pycache__',
]);

export function collectProjectFiles(projectPath: string): string[] {
  const result: string[] = [];
  function scan(currentDir: string): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.has(entry.name)) {
            scan(path.join(currentDir, entry.name));
          }
        } else if (entry.isFile()) {
          const rel = path
            .relative(projectPath, path.join(currentDir, entry.name))
            .replace(/\\/g, '/');
          result.push(rel);
        }
      }
    } catch {
      // Ignorar directorios inaccesibles
    }
  }
  scan(projectPath);
  return result;
}

function inspectPythonStack(resolvedPath: string, detectedStacks: string[]): boolean {
  const pyprojectPath = path.join(resolvedPath, 'pyproject.toml');
  let mypyStrict = false;

  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, UTF8_ENCODING);
    if (content.includes('fastapi')) {
      detectedStacks.push('fastapi');
    } else {
      detectedStacks.push('python');
    }
    if (content.includes('strict = true') || content.includes('strict=true')) {
      mypyStrict = true;
    }
  }

  return mypyStrict;
}

function detectNodeFrameworks(packageJsonPath: string, detectedStacks: string[]): void {
  if (!fs.existsSync(packageJsonPath)) return;
  const content = fs.readFileSync(packageJsonPath, UTF8_ENCODING);
  if (content.includes('"vue"') || content.includes("'vue'")) {
    detectedStacks.push('vue3');
  }
  if (content.includes('"react"') || content.includes("'react'")) {
    detectedStacks.push(REACT_FRONTEND_STACK);
  }
  if (
    content.includes('"express"') ||
    content.includes('"fastify"') ||
    content.includes('"@nestjs/core"')
  ) {
    detectedStacks.push('node-backend');
  }
}

function checkTsconfigStrict(tsconfigPath: string): boolean {
  if (!fs.existsSync(tsconfigPath)) return false;
  const content = fs.readFileSync(tsconfigPath, UTF8_ENCODING);
  return content.includes('"strict": true') || content.includes('"strict":true');
}

function checkNpmrcIgnoreScripts(npmrcPath: string): boolean {
  if (!fs.existsSync(npmrcPath)) return false;
  const content = fs.readFileSync(npmrcPath, UTF8_ENCODING);
  return content.includes('ignore-scripts=true') || content.includes('ignore-scripts = true');
}

function inspectNodeStack(
  resolvedPath: string,
  detectedStacks: string[]
): { tsconfigStrict: boolean; npmrcIgnoreScripts: boolean } {
  const packageJsonPath = path.join(resolvedPath, PACKAGE_JSON);
  const tsconfigPath = path.join(resolvedPath, 'tsconfig.json');
  const npmrcPath = path.join(resolvedPath, '.npmrc');

  detectNodeFrameworks(packageJsonPath, detectedStacks);
  const tsconfigStrict = checkTsconfigStrict(tsconfigPath);
  const npmrcIgnoreScripts = checkNpmrcIgnoreScripts(npmrcPath);

  return { tsconfigStrict, npmrcIgnoreScripts };
}

function inspectBashStack(resolvedPath: string, detectedStacks: string[]): void {
  try {
    const entries = fs.readdirSync(resolvedPath);
    const hasBash = entries.some(
      (e) => e.endsWith('.sh') || e.endsWith('.bats') || e === BASH_STACK_NAME
    );
    if (hasBash && !detectedStacks.includes(BASH_STACK_NAME)) {
      detectedStacks.push(BASH_STACK_NAME);
    }
  } catch {
    // Ignorar errores de lectura
  }
}

function collectMissing11xFiles(resolvedPath: string): string[] {
  const checkList: string[] = [
    'docker-compose.qa.yml',
    'Makefile',
    'lefthook.yml',
    path.join('.agents', 'scripts', 'certify_task_completion.sh'),
    'TESTING.md',
    'CHANGELOG.md',
  ];

  const missing: string[] = [];
  for (const item of checkList) {
    if (!fs.existsSync(path.join(resolvedPath, item))) {
      missing.push(item);
    }
  }
  return missing;
}

function checkPackageInstalled(projectPath: string, packageName: string): boolean {
  const candidatePaths = [
    path.join(projectPath, PACKAGE_JSON),
    path.join(projectPath, 'vue3', PACKAGE_JSON),
    path.join(projectPath, REACT_FRONTEND_STACK, PACKAGE_JSON),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, UTF8_ENCODING));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (packageName in deps) return true;
      } catch {
        const content = fs.readFileSync(p, UTF8_ENCODING);
        if (content.includes(`"${packageName}"`)) return true;
      }
    }
  }
  return false;
}

function checkBrowserMcpInIde(homeDir?: string): boolean {
  const baseHome = homeDir || os.homedir();
  const configFiles = [
    path.join(baseHome, '.gemini', 'antigravity', 'mcp_config.json'),
    path.join(baseHome, '.claude.json'),
    path.join(baseHome, '.cursor', 'mcp.json'),
  ];
  for (const configFile of configFiles) {
    if (fs.existsSync(configFile)) {
      try {
        const content = fs.readFileSync(configFile, UTF8_ENCODING);
        if (content.includes('playwright') || content.includes('chrome-devtools')) {
          return true;
        }
      } catch {
        // Ignorar errores de lectura
      }
    }
  }
  return false;
}

export function evaluateBrowserTestingReadiness(
  projectPath: string,
  files: string[],
  stacks: (StackName | string)[],
  homeDir?: string
): BrowserTestingReadiness {
  const isApplicable = stacks.includes('vue3') || stacks.includes('react-frontend');
  if (!isApplicable) {
    return {
      applicable: false,
      playwright_test_installed: false,
      axe_core_playwright_installed: false,
      lhci_cli_installed: false,
      e2e_spec_present: false,
      browser_mcp_configured_in_ide: false,
      install_instructions: [],
    };
  }

  const playwrightInstalled = checkPackageInstalled(projectPath, '@playwright/test');
  const axeInstalled = checkPackageInstalled(projectPath, '@axe-core/playwright');
  const lhciInstalled = checkPackageInstalled(projectPath, '@lhci/cli');
  const e2eSpecPresent = files.some(
    (f) => /e2e\/.*\.e2e\.ts$/.test(f) || /e2e[\\/].*\.e2e\.ts$/.test(f)
  );
  const browserMcpConfigured = checkBrowserMcpInIde(homeDir);

  const instructions: string[] = [];
  if (!playwrightInstalled || !axeInstalled || !lhciInstalled || !e2eSpecPresent) {
    instructions.push(INSTRUCTION_BOOTSTRAP);
  }
  if (!browserMcpConfigured) {
    instructions.push(INSTRUCTION_BROWSER_MCP);
  }

  return {
    applicable: true,
    playwright_test_installed: playwrightInstalled,
    axe_core_playwright_installed: axeInstalled,
    lhci_cli_installed: lhciInstalled,
    e2e_spec_present: e2eSpecPresent,
    browser_mcp_configured_in_ide: browserMcpConfigured,
    install_instructions: instructions,
  };
}

export async function inspectProjectConfig(
  projectPathInput: string,
  homeDir?: string
): Promise<ProjectAuditResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio especificado no existe: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolvedPath}`);
  }

  const detectedStacks: string[] = [];

  const mypyStrict = inspectPythonStack(resolvedPath, detectedStacks);
  const { tsconfigStrict, npmrcIgnoreScripts } = inspectNodeStack(resolvedPath, detectedStacks);
  inspectBashStack(resolvedPath, detectedStacks);

  const missing11xFiles = collectMissing11xFiles(resolvedPath);
  const files = collectProjectFiles(resolvedPath);
  const browserReadiness = evaluateBrowserTestingReadiness(
    resolvedPath,
    files,
    detectedStacks,
    homeDir
  );

  return {
    project_path: resolvedPath,
    detected_stacks: detectedStacks.length > 0 ? detectedStacks : ['python'],
    has_docker_compose_qa: fs.existsSync(path.join(resolvedPath, 'docker-compose.qa.yml')),
    has_makefile: fs.existsSync(path.join(resolvedPath, 'Makefile')),
    has_lefthook: fs.existsSync(path.join(resolvedPath, 'lefthook.yml')),
    has_agents_dir: fs.existsSync(path.join(resolvedPath, '.agents')),
    has_testing_md: fs.existsSync(path.join(resolvedPath, 'TESTING.md')),
    has_changelog_md: fs.existsSync(path.join(resolvedPath, 'CHANGELOG.md')),
    strict_flags: {
      mypy_strict: mypyStrict,
      tsconfig_strict: tsconfigStrict,
      npmrc_ignore_scripts: npmrcIgnoreScripts,
    },
    missing_11x_files: missing11xFiles,
    recommended_next_tool: 'fetch_blueprint_bundle',
    browser_testing_readiness: browserReadiness,
  };
}
