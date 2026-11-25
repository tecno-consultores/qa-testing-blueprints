// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectAuditResult, BrowserTestingReadiness } from '../types.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { resolveSafeHomeDir } from '../services/github-fetcher.js';
import {
  evaluateUpdateStatus,
  type EvaluateUpdateOptions,
} from '../services/version-manager.js';
import { detectCompanionMcps } from '../utils/companionMcpDetector.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { getBrowserMcpCandidatePaths } from '../utils/ideConfigPaths.js';
import { CANONICAL_IGNORED_DIRS } from '../utils/ignoredDirs.js';
import { evaluateStandard11xReadiness } from './standardReadiness.js';

const BASH_STACK_NAME = 'bash-scripts';
const PHP_STACK_NAME = 'php';
const COMPOSER_JSON_FILE = 'composer.json';
const PHPSTAN_NEON_FILE = 'phpstan.neon';
const UTF8_ENCODING = 'utf-8';
const PACKAGE_JSON = 'package.json';
const PYPROJECT_TOML = 'pyproject.toml';
const REACT_FRONTEND_STACK = 'react-frontend';
const NODE_BACKEND_STACK = 'node-backend';
const MOBILE_APPIUM_STACK = 'mobile-appium';
const AI_EVALS_STACK = 'ai-evals';
const VIBE_RESCUE_STACK = 'vibe-rescue';
const WDIO_CONF_TS = 'wdio.conf.ts';
const WDIO_CONF_JS = 'wdio.conf.js';
const PROMPTFOO_YAML = 'promptfooconfig.yaml';
const PROMPTFOO_YML = 'promptfooconfig.yml';
const AUDIT_VIBE_PY = 'audit_vibe_prototype.py';
const MOBILE_DEPS = ['appium', 'webdriverio', '@wdio/cli'];
const AI_PYTHON_TOKENS = ['deepeval', 'promptfoo'];

const INSTRUCTION_BOOTSTRAP =
  "Ejecute la tool MCP 'bootstrap_or_merge_11x' para inyectar automáticamente @playwright/test, @axe-core/playwright, @lhci/cli y e2e/accessibility.e2e.ts en el proyecto.";
const INSTRUCTION_BROWSER_MCP =
  "Para inspección visual Anti-JSDOM en navegador real desde su agente IA, agregue el servidor MCP de Playwright en su configuración MCP: npx -y @playwright/mcp@latest";

const EXCLUDED_DIRS = CANONICAL_IGNORED_DIRS;

export function collectProjectFiles(projectPath: string): string[] {
  const result: string[] = [];
  function scan(currentDir: string): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
          scan(path.join(currentDir, entry.name));
        } else if (entry.isFile()) {
          const rel = path
            .relative(projectPath, path.join(currentDir, entry.name))
            .replace(/\\/g, '/');
          result.push(rel);
        }
      }
    } catch (err: unknown) {
      // Unreadable subdirectory is skipped without halting project stack inspection
      reportDebugCatchError(`inspectProject.collectProjectFiles(${currentDir})`, err);
    }
  }
  scan(projectPath);
  return result;
}

function addDetectedStack(detectedStacks: string[], stack: string): void {
  if (!detectedStacks.includes(stack)) {
    detectedStacks.push(stack);
  }
}

function collectSectionKeys(block: unknown, names: Set<string>): void {
  if (typeof block !== 'object' || block === null) {
    return;
  }
  for (const key of Object.keys(block)) {
    names.add(key);
  }
}

function extractPackageDepNames(content: string): Set<string> | null {
  try {
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const names = new Set<string>();
    collectSectionKeys(pkg.dependencies, names);
    collectSectionKeys(pkg.devDependencies, names);
    collectSectionKeys(pkg.peerDependencies, names);
    return names;
  } catch (err: unknown) {
    // Malformed package.json returns null so string fallback handles partial detection
    reportDebugCatchError('inspectProject.extractPackageDepNames', err);
    return null;
  }
}

function hasAnyPackageDep(
  content: string,
  depNames: Set<string> | null,
  targets: string[]
): boolean {
  if (depNames !== null) {
    return targets.some((t) => depNames.has(t));
  }
  return targets.some((t) => content.includes(`"${t}"`) || content.includes(`'${t}'`));
}

function inspectPythonStack(resolvedPath: string, detectedStacks: string[]): boolean {
  const candidates = [
    path.join(resolvedPath, PYPROJECT_TOML),
    path.join(resolvedPath, 'fastapi', PYPROJECT_TOML),
    path.join(resolvedPath, 'backend', PYPROJECT_TOML),
    path.join(resolvedPath, 'python', PYPROJECT_TOML),
  ];
  let mypyStrict = false;

  for (const pyprojectPath of candidates) {
    if (!fs.existsSync(pyprojectPath)) continue;
    const content = fs.readFileSync(pyprojectPath, UTF8_ENCODING);
    const stackToAdd = content.includes('fastapi') ? 'fastapi' : 'python';
    addDetectedStack(detectedStacks, stackToAdd);
    if (AI_PYTHON_TOKENS.some((tok) => content.includes(tok))) {
      addDetectedStack(detectedStacks, AI_EVALS_STACK);
    }
    if (content.includes('strict = true') || content.includes('strict=true')) {
      mypyStrict = true;
    }
  }

  return mypyStrict;
}

function detectAuxiliaryNodeDeps(
  content: string,
  depNames: Set<string> | null,
  detectedStacks: string[]
): void {
  if (hasAnyPackageDep(content, depNames, ['promptfoo'])) {
    addDetectedStack(detectedStacks, AI_EVALS_STACK);
  }
  if (hasAnyPackageDep(content, depNames, ['lovable-tagger'])) {
    addDetectedStack(detectedStacks, VIBE_RESCUE_STACK);
  }
}

function detectNodeFrameworks(
  packageJsonPath: string,
  detectedStacks: string[],
  isMobileDir = false
): void {
  if (!fs.existsSync(packageJsonPath)) return;
  const content = fs.readFileSync(packageJsonPath, UTF8_ENCODING);
  const depNames = extractPackageDepNames(content);
  let matchedUiOrMobile = isMobileDir;
  if (hasAnyPackageDep(content, depNames, ['vue'])) {
    addDetectedStack(detectedStacks, 'vue3');
    matchedUiOrMobile = true;
  }
  if (hasAnyPackageDep(content, depNames, ['react'])) {
    addDetectedStack(detectedStacks, REACT_FRONTEND_STACK);
    matchedUiOrMobile = true;
  }
  if (isMobileDir || hasAnyPackageDep(content, depNames, MOBILE_DEPS)) {
    addDetectedStack(detectedStacks, MOBILE_APPIUM_STACK);
    matchedUiOrMobile = true;
  }
  detectAuxiliaryNodeDeps(content, depNames, detectedStacks);
  const isBackendOrCli =
    hasAnyPackageDep(content, depNames, [
      'express',
      'fastify',
      '@nestjs/core',
      '@modelcontextprotocol/sdk',
    ]) ||
    (!matchedUiOrMobile && hasAnyPackageDep(content, depNames, ['typescript', 'vitest']));
  if (isBackendOrCli) {
    addDetectedStack(detectedStacks, NODE_BACKEND_STACK);
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
  const mobileBase = path.join(resolvedPath, MOBILE_APPIUM_STACK);
  const nodeBases = [
    resolvedPath,
    path.join(resolvedPath, 'vue3'),
    path.join(resolvedPath, REACT_FRONTEND_STACK),
    path.join(resolvedPath, 'frontend'),
    path.join(resolvedPath, NODE_BACKEND_STACK),
    path.join(resolvedPath, 'mcp-server'),
    mobileBase,
  ];

  let tsconfigStrict = false;
  let npmrcIgnoreScripts = false;

  for (const base of nodeBases) {
    const pkgPath = path.join(base, PACKAGE_JSON);
    if (!fs.existsSync(pkgPath)) continue;
    detectNodeFrameworks(pkgPath, detectedStacks, base === mobileBase);
    if (checkTsconfigStrict(path.join(base, 'tsconfig.json'))) tsconfigStrict = true;
    if (checkNpmrcIgnoreScripts(path.join(base, '.npmrc'))) npmrcIgnoreScripts = true;
  }

  return { tsconfigStrict, npmrcIgnoreScripts };
}

function inspectMobileAppiumStack(
  resolvedPath: string,
  files: string[],
  detectedStacks: string[]
): void {
  const hasWdio =
    fs.existsSync(path.join(resolvedPath, WDIO_CONF_TS)) ||
    fs.existsSync(path.join(resolvedPath, WDIO_CONF_JS)) ||
    fs.existsSync(path.join(resolvedPath, MOBILE_APPIUM_STACK, WDIO_CONF_TS)) ||
    fs.existsSync(path.join(resolvedPath, MOBILE_APPIUM_STACK, WDIO_CONF_JS)) ||
    files.some((f) => f.endsWith(`/${WDIO_CONF_TS}`) || f.endsWith(`/${WDIO_CONF_JS}`));
  if (hasWdio) {
    addDetectedStack(detectedStacks, MOBILE_APPIUM_STACK);
  }
}

function isAiEvalsArtifact(file: string): boolean {
  return (
    file === PROMPTFOO_YAML ||
    file === PROMPTFOO_YML ||
    (file.startsWith(`${AI_EVALS_STACK}/`) &&
      (file.endsWith('.py') ||
        file.endsWith('.ts') ||
        file.endsWith('.yaml') ||
        file.endsWith('.yml')))
  );
}

function hasAiTokenInFile(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const content = fs.readFileSync(filePath, UTF8_ENCODING);
  return AI_PYTHON_TOKENS.some((tok) => content.includes(tok));
}

function inspectAiEvalsStack(
  resolvedPath: string,
  files: string[],
  detectedStacks: string[]
): void {
  const aiManifestPaths = [
    path.join(resolvedPath, AI_EVALS_STACK, PYPROJECT_TOML),
    path.join(resolvedPath, 'requirements.txt'),
    path.join(resolvedPath, 'python', 'requirements.txt'),
  ];
  if (files.some(isAiEvalsArtifact) || aiManifestPaths.some(hasAiTokenInFile)) {
    addDetectedStack(detectedStacks, AI_EVALS_STACK);
  }
}

function hasLovableScaffoldMarker(resolvedPath: string): boolean {
  const lovablePath = path.join(resolvedPath, '.lovable');
  if (!fs.existsSync(lovablePath)) return false;
  if (!fs.statSync(lovablePath).isDirectory()) return true;
  const entries = fs.readdirSync(lovablePath);
  return entries.length === 0 || entries.some((entry) => entry !== 'rules.md');
}

function inspectVibeRescueStack(resolvedPath: string, detectedStacks: string[]): void {
  const markers = [
    path.join(resolvedPath, AUDIT_VIBE_PY),
    path.join(resolvedPath, VIBE_RESCUE_STACK, AUDIT_VIBE_PY),
    path.join(resolvedPath, VIBE_RESCUE_STACK, 'templates', 'rls_hardening.sql'),
    path.join(resolvedPath, '.bolt', 'config.json'),
  ];
  if (hasLovableScaffoldMarker(resolvedPath) || markers.some((m) => fs.existsSync(m))) {
    addDetectedStack(detectedStacks, VIBE_RESCUE_STACK);
  }
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
  } catch (err: unknown) {
    // Unreadable project root omits optional bash stack auto-detection
    reportDebugCatchError('inspectProject.inspectBashStack', err);
  }
}

interface PhpStackContext {
  readonly projectPath: string;
  readonly files: string[];
  readonly detectedStacks: string[];
  readonly strictFlags: ProjectAuditResult['strict_flags'];
  readonly missing11xFiles: string[];
}

function inspectPhpStack(ctx: PhpStackContext): void {
  const { projectPath, files, detectedStacks, strictFlags, missing11xFiles } = ctx;
  const phpBases = [projectPath, path.join(projectPath, PHP_STACK_NAME)];
  const hasComposer = phpBases.some((base) => fs.existsSync(path.join(base, COMPOSER_JSON_FILE)));
  const hasPhpFiles = files.some((f) => f.endsWith('.php'));
  if (!hasComposer && !hasPhpFiles) {
    return;
  }
  detectedStacks.push(PHP_STACK_NAME);
  const hasPhpstan = phpBases.some(
    (base) =>
      fs.existsSync(path.join(base, PHPSTAN_NEON_FILE)) ||
      fs.existsSync(path.join(base, 'phpstan.neon.dist'))
  );
  const hasInfection = phpBases.some(
    (base) =>
      fs.existsSync(path.join(base, 'infection.json5')) ||
      fs.existsSync(path.join(base, 'infection.json.dist'))
  );
  strictFlags.phpstan_strict = hasPhpstan;
  strictFlags.infection_mutation = hasInfection;
  if (!hasPhpstan) {
    missing11xFiles.push(PHPSTAN_NEON_FILE);
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

function hasDependencyInPackageFile(packagePath: string, packageName: string): boolean {
  const raw = fs.readFileSync(packagePath, UTF8_ENCODING);
  try {
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.prototype.hasOwnProperty.call(deps, packageName);
  } catch (err: unknown) {
    // Malformed package.json JSON falls back safely to literal token match
    reportDebugCatchError(`inspectProject.hasDependencyInPackageFile(${packagePath})`, err);
    return raw.includes(`"${packageName}"`);
  }
}

function checkPackageInstalled(projectPath: string, packageName: string): boolean {
  const candidatePaths = [
    path.join(projectPath, PACKAGE_JSON),
    path.join(projectPath, 'vue3', PACKAGE_JSON),
    path.join(projectPath, REACT_FRONTEND_STACK, PACKAGE_JSON),
    path.join(projectPath, 'frontend', PACKAGE_JSON),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p) && hasDependencyInPackageFile(p, packageName)) {
      return true;
    }
  }
  return false;
}

function configMentionsBrowserMcp(configFile: string): boolean {
  try {
    const content = fs.readFileSync(configFile, UTF8_ENCODING);
    return content.includes('playwright') || content.includes('chrome-devtools');
  } catch (err: unknown) {
    // Optional IDE MCP config probe: unreadable config safely reports false
    reportDebugCatchError(`inspectProject.configMentionsBrowserMcp(${configFile})`, err);
    return false;
  }
}

function checkBrowserMcpInIde(homeDir?: string): boolean {
  const baseHome = resolveSafeHomeDir(homeDir);
  const configFiles = getBrowserMcpCandidatePaths(baseHome);
  return configFiles.some(
    (configFile) => fs.existsSync(configFile) && configMentionsBrowserMcp(configFile)
  );
}

export function evaluateBrowserTestingReadiness(
  projectPath: string,
  files: string[],
  stacks: string[],
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

export type InspectProjectUpdateOptions = Partial<
  Omit<EvaluateUpdateOptions, 'projectPath' | 'homeDir'>
>;

export async function inspectProjectConfig(
  projectPathInput: string,
  homeDir?: string,
  updateOptions?: InspectProjectUpdateOptions
): Promise<ProjectAuditResult> {
  const resolvedPath = resolveSafeProjectPath(projectPathInput);

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

  const strictFlags: ProjectAuditResult['strict_flags'] = {
    mypy_strict: mypyStrict,
    tsconfig_strict: tsconfigStrict,
    npmrc_ignore_scripts: npmrcIgnoreScripts,
  };
  inspectPhpStack({
    projectPath: resolvedPath,
    files,
    detectedStacks,
    strictFlags,
    missing11xFiles,
  });
  inspectMobileAppiumStack(resolvedPath, files, detectedStacks);
  inspectAiEvalsStack(resolvedPath, files, detectedStacks);
  inspectVibeRescueStack(resolvedPath, detectedStacks);

  const companionMcps = detectCompanionMcps(homeDir);
  const browserReadiness = evaluateBrowserTestingReadiness(
    resolvedPath,
    files,
    detectedStacks,
    homeDir
  );
  const updateAvailable = await evaluateUpdateStatus({
    projectPath: resolvedPath,
    homeDir,
    ...updateOptions,
  });

  const fallbackStacks = files.some((f) => f.endsWith('.py')) ? ['python'] : [];
  const finalStacks = detectedStacks.length > 0 ? detectedStacks : fallbackStacks;
  const standardReadiness = evaluateStandard11xReadiness(resolvedPath, finalStacks, files);
  return {
    project_path: resolvedPath,
    detected_stacks: finalStacks,
    docker_daemon_required: true,
    has_docker_compose_qa: fs.existsSync(path.join(resolvedPath, 'docker-compose.qa.yml')),
    has_makefile: fs.existsSync(path.join(resolvedPath, 'Makefile')),
    has_lefthook: fs.existsSync(path.join(resolvedPath, 'lefthook.yml')),
    has_agents_dir: fs.existsSync(path.join(resolvedPath, '.agents')),
    has_testing_md: fs.existsSync(path.join(resolvedPath, 'TESTING.md')),
    has_changelog_md: fs.existsSync(path.join(resolvedPath, 'CHANGELOG.md')),
    strict_flags: strictFlags,
    missing_11x_files: missing11xFiles,
    recommended_next_tool: 'fetch_blueprint_bundle',
    browser_testing_readiness: browserReadiness,
    companion_mcps: companionMcps,
    standard_11x_readiness: standardReadiness,
    update_available: updateAvailable,
  };
}
