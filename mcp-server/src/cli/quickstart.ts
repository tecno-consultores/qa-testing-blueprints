// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  initOrAppendAgentsMd,
  parseAgentsOption,
  resolveSafeBridgePath,
  validateSupportedLang,
  type AgentsTargetSpec,
  type InitOrAppendAgentsMdResult,
  type SupportedLang,
} from '../tools/initOrAppendAgentsMd.js';

const UTF8_ENCODING = 'utf8' as const;
const SCHEMA_VERSION_2 = '2.0.0' as const;
const CONFIG_REL_PATH = '.qa-11x.json' as const;
const ACTIVE_TASK_REL_PATH = '.agents/ACTIVE_TASK.md' as const;
const GITHUB_WORKFLOW_REL_PATH = '.github/workflows/qa-11x-pr.yml' as const;
const AGENTS_MD_REL_PATH = 'AGENTS.md' as const;
const PR_CHECK_ACTION_REF =
  'tecno-consultores/qa-testing-blueprints/.github/actions/qa-11x-pr-check@v2' as const;
const CHECKOUT_PINNED_REF =
  'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2' as const;

export const TIER_STARTER = 'starter' as const;
export const TIER_STANDARD = 'standard' as const;
export const TIER_ENTERPRISE = 'enterprise' as const;
export const CI_GITHUB = 'github' as const;
export const CI_NONE = 'none' as const;

const STACK_MOBILE_APPIUM = 'mobile-appium' as const;
const STACK_AI_EVALS = 'ai-evals' as const;
const STACK_BASH_SCRIPTS = 'bash-scripts' as const;
const STACK_NODE_BACKEND = 'node-backend' as const;
const STACK_VUE3 = 'vue3' as const;
const STACK_REACT_FRONTEND = 'react-frontend' as const;

export type QuickstartStackName =
  | 'python'
  | 'fastapi'
  | typeof STACK_NODE_BACKEND
  | typeof STACK_VUE3
  | typeof STACK_REACT_FRONTEND
  | 'php'
  | typeof STACK_MOBILE_APPIUM
  | typeof STACK_AI_EVALS
  | typeof STACK_BASH_SCRIPTS
  | 'generic';

export type QuickstartTier = typeof TIER_STARTER | typeof TIER_STANDARD | typeof TIER_ENTERPRISE;
export type QuickstartCiProvider = typeof CI_GITHUB | typeof CI_NONE;
export type QuickstartFileAction = 'created' | 'updated' | 'preserved' | 'planned';

export interface QuickstartProjectProfile {
  readonly projectPath: string;
  readonly stacks: readonly QuickstartStackName[];
  readonly vibePrototypeDetected: boolean;
  readonly vibeMarkers: readonly string[];
  readonly recommendedMcpTools: readonly string[];
}

export interface QuickstartOptions {
  readonly dir?: string;
  readonly projectPath?: string;
  readonly baseBoundaryDir?: string;
  readonly tier?: QuickstartTier;
  readonly lang?: SupportedLang;
  readonly agents?: AgentsTargetSpec | string;
  readonly ci?: QuickstartCiProvider;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
}

export interface QuickstartConfig {
  readonly schemaVersion: typeof SCHEMA_VERSION_2;
  readonly tier: QuickstartTier;
  readonly lang: SupportedLang;
  readonly detectedStacks: readonly QuickstartStackName[];
  readonly ruleZeroEphemeralDocker: true;
  readonly activeGates: readonly string[];
  readonly vibePrototypeDetected: boolean;
}

export interface QuickstartFileRecord {
  readonly relativePath: string;
  readonly action: QuickstartFileAction;
}

export interface QuickstartResult {
  readonly projectPath: string;
  readonly tier: QuickstartTier;
  readonly lang: SupportedLang;
  readonly ci: QuickstartCiProvider;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly detectedStacks: readonly QuickstartStackName[];
  readonly vibePrototypeDetected: boolean;
  readonly vibeMarkers: readonly string[];
  readonly activeGates: readonly string[];
  readonly recommendedMcpTools: readonly string[];
  readonly configPath: string;
  readonly config: QuickstartConfig;
  readonly agentsResult: InitOrAppendAgentsMdResult;
  readonly files: readonly QuickstartFileRecord[];
  readonly plannedFiles: readonly string[];
  readonly nextCommand: string;
}

const STARTER_GATES: readonly string[] = Object.freeze([
  'secret-hygiene',
  'rule-zero-ephemeral-docker',
  'ai-agent-connectors',
]);

const STANDARD_EXTRA_GATES: readonly string[] = Object.freeze([
  'unit-coverage-95',
  'ast-blast-radius-ci',
  'ui-antipattern-linter',
  'lightweight-contracts',
]);

const ENTERPRISE_GATES: readonly string[] = Object.freeze([
  ...STARTER_GATES,
  'static-analysis-cc5',
  'unit-coverage-95',
  'ast-blast-radius-ci',
  'postgres17-rls-worm-stig',
  'pact-cdct-karate-bdd',
  'ui-screenplay-wcag-anti-jsdom',
  'mutation-testing',
  'k6-performance-trivy-sbom',
  'calm-architecture-validation',
  'dual-ai-evals-release-gate',
]);

export const QUICKSTART_TIER_PROFILES: Readonly<Record<QuickstartTier, readonly string[]>> =
  Object.freeze({
    [TIER_STARTER]: STARTER_GATES,
    [TIER_STANDARD]: Object.freeze([...STARTER_GATES, ...STANDARD_EXTRA_GATES]),
    [TIER_ENTERPRISE]: ENTERPRISE_GATES,
  });

const FORBIDDEN_SYSTEM_ROOTS: readonly string[] = Object.freeze([
  '/',
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root',
]);

const SCAN_SUBDIRS: readonly string[] = Object.freeze([
  '',
  'backend',
  'frontend',
  'fastapi',
  'python',
  STACK_NODE_BACKEND,
  STACK_VUE3,
  STACK_REACT_FRONTEND,
  'php',
  STACK_MOBILE_APPIUM,
  STACK_AI_EVALS,
  STACK_BASH_SCRIPTS,
  'scripts',
]);

const SQL_SCAN_DIRS: readonly string[] = Object.freeze([
  '',
  'migrations',
  'supabase/migrations',
  'sql',
  'db',
]);

const PYTHON_MANIFESTS: readonly string[] = Object.freeze([
  'pyproject.toml',
  'requirements.txt',
  'requirements-dev.txt',
  'requirements-prod.txt',
]);

const BACKEND_NODE_DEPS: readonly string[] = Object.freeze([
  'express',
  'fastify',
  '@nestjs/core',
  'koa',
  'hono',
]);

const MOBILE_NODE_DEPS: readonly string[] = Object.freeze([
  'appium',
  'webdriverio',
  '@wdio/cli',
]);

const VUE_NODE_DEPS: readonly string[] = Object.freeze(['vue', 'nuxt']);
const REACT_NODE_DEPS: readonly string[] = Object.freeze(['react', 'react-dom', 'next']);

const RAW_TRAVERSAL_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const ENV_KEY_IDENT_RE = /^[A-Z][A-Z0-9_]{2,120}$/;
const PUBLIC_ENV_PREFIXES: readonly string[] = Object.freeze([
  'VITE_',
  'NEXT_PUBLIC_',
  'EXPO_PUBLIC_',
  'REACT_APP_',
]);
const SECRET_ENV_TOKENS: readonly string[] = Object.freeze([
  'SERVICE_ROLE',
  'SECRET',
  'PRIVATE',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'API_KEY',
]);
const SQL_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const SQL_LINE_COMMENT_RE = /--[^\n]*/g;
const SQL_CREATE_TABLE_RE = /\bCREATE\s+TABLE\b/i;
const SQL_ENABLE_RLS_RE = /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i;
const SQL_PERMISSIVE_RE = /\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i;
const SPANISH_MARKER_RE = /(?:\bin Spanish\b|Estándar 11X|\ben español\b)/i;

const NODE_SPECIFIC_RULES: ReadonlyArray<{
  readonly deps: readonly string[];
  readonly stack: QuickstartStackName;
}> = Object.freeze([
  { deps: VUE_NODE_DEPS, stack: STACK_VUE3 },
  { deps: REACT_NODE_DEPS, stack: STACK_REACT_FRONTEND },
  { deps: MOBILE_NODE_DEPS, stack: STACK_MOBILE_APPIUM },
]);

function isForbiddenSystemPath(resolvedPath: string): boolean {
  if (resolvedPath === '/') {
    return true;
  }
  return FORBIDDEN_SYSTEM_ROOTS.slice(1).some(
    (sysDir) => resolvedPath === sysDir || resolvedPath.startsWith(`${sysDir}/`)
  );
}

function assertNoRawTraversal(rawPath: string): string {
  const normalized = rawPath.normalize('NFKC').trim();
  if (!normalized || normalized.includes('\0') || RAW_TRAVERSAL_RE.test(normalized)) {
    throw new Error(`Invalid target directory '${rawPath}': path traversal '..' or null bytes are forbidden.`);
  }
  return normalized;
}

function assertWithinBoundary(realTarget: string, baseBoundaryDir: string): void {
  const cleanBoundary = assertNoRawTraversal(baseBoundaryDir);
  const resolvedBoundary = path.resolve(cleanBoundary);
  if (!fs.existsSync(resolvedBoundary)) {
    throw new Error(`Base boundary directory does not exist: ${resolvedBoundary}`);
  }
  const realBoundary = fs.realpathSync(resolvedBoundary);
  const prefix = realBoundary.endsWith(path.sep) ? realBoundary : `${realBoundary}${path.sep}`;
  if (realTarget !== realBoundary && !realTarget.startsWith(prefix)) {
    throw new Error(`Path traversal outside allowed boundary '${realBoundary}' detected for '${realTarget}'.`);
  }
}

export function resolveQuickstartTargetDir(rawDir: string, baseBoundaryDir?: string): string {
  const normalized = assertNoRawTraversal(rawDir);
  const resolved = path.resolve(normalized);
  if (isForbiddenSystemPath(resolved)) {
    throw new Error(`Refusing to initialize QA-11X inside critical system path '${resolved}'.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Target path is not a directory: ${resolved}`);
  }
  const realTarget = fs.realpathSync(resolved);
  if (isForbiddenSystemPath(realTarget)) {
    throw new Error(`Refusing to initialize QA-11X inside critical system path '${realTarget}'.`);
  }
  if (baseBoundaryDir !== undefined) {
    assertWithinBoundary(realTarget, baseBoundaryDir);
  }
  return realTarget;
}

function resolveContainedFile(projectRoot: string, relPath: string): string {
  const candidate = resolveSafeBridgePath(projectRoot, relPath);
  const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    throw new Error(`Symbolic link target is forbidden for managed file '${relPath}'.`);
  }
  return candidate;
}

export function validateQuickstartTier(rawTier?: string): QuickstartTier {
  if (rawTier === undefined) {
    return TIER_STARTER;
  }
  const normalized = rawTier.normalize('NFKC').trim().toLowerCase();
  if (normalized === TIER_STARTER || normalized === TIER_STANDARD || normalized === TIER_ENTERPRISE) {
    return normalized;
  }
  throw new Error(`Unsupported tier '${rawTier}'. Allowed values: 'starter' | 'standard' | 'enterprise'.`);
}

export function validateQuickstartCi(rawCi?: string): QuickstartCiProvider {
  if (rawCi === undefined) {
    return CI_GITHUB;
  }
  const normalized = rawCi.normalize('NFKC').trim().toLowerCase();
  if (normalized === CI_GITHUB || normalized === CI_NONE) {
    return normalized;
  }
  throw new Error(`Unsupported CI target '${rawCi}'. Allowed values: 'github' | 'none'.`);
}

function addUnique<T>(list: T[], item: T): void {
  if (!list.includes(item)) {
    list.push(item);
  }
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? fs.readFileSync(filePath, UTF8_ENCODING)
      : null;
  } catch {
    return null;
  }
}

function readJsonRecordSafe(filePath: string): Record<string, unknown> | null {
  const raw = readTextSafe(filePath);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function collectPackageDependencyNames(pkg: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const section = pkg[field];
    if (typeof section === 'object' && section !== null && !Array.isArray(section)) {
      for (const depName of Object.keys(section)) {
        names.add(depName.toLowerCase());
      }
    }
  }
  return names;
}

function hasAnyDep(deps: Set<string>, targets: readonly string[]): boolean {
  return targets.some((dep) => deps.has(dep));
}

function inspectNodePackageAtDir(
  dirPath: string,
  stacks: QuickstartStackName[],
  vibeMarkers: string[]
): void {
  const pkg = readJsonRecordSafe(path.join(dirPath, 'package.json'));
  if (pkg === null) {
    return;
  }
  const deps = collectPackageDependencyNames(pkg);
  let matchedSpecific = false;

  for (const rule of NODE_SPECIFIC_RULES) {
    if (hasAnyDep(deps, rule.deps)) {
      addUnique(stacks, rule.stack);
      matchedSpecific = true;
    }
  }
  if (hasAnyDep(deps, BACKEND_NODE_DEPS) || !matchedSpecific) {
    addUnique(stacks, STACK_NODE_BACKEND);
  }
  if (deps.has('promptfoo')) {
    addUnique(stacks, STACK_AI_EVALS);
  }
  if (deps.has('lovable-tagger')) {
    addUnique(vibeMarkers, 'pkg:lovable-tagger');
  }
}

function inspectPythonAtDir(dirPath: string, stacks: QuickstartStackName[]): void {
  for (const fileName of PYTHON_MANIFESTS) {
    const raw = readTextSafe(path.join(dirPath, fileName));
    if (raw === null) {
      continue;
    }
    const lowered = raw.toLowerCase();
    addUnique(stacks, lowered.includes('fastapi') ? 'fastapi' : 'python');
    if (lowered.includes('deepeval') || lowered.includes('promptfoo')) {
      addUnique(stacks, STACK_AI_EVALS);
    }
  }
}

function inspectDirectoryEntries(
  projectRoot: string,
  relDir: string,
  stacks: QuickstartStackName[],
  vibeMarkers: string[]
): void {
  const fullDir = relDir ? path.join(projectRoot, relDir) : projectRoot;
  if (!fs.existsSync(fullDir) || !fs.statSync(fullDir).isDirectory()) {
    return;
  }
  inspectPythonAtDir(fullDir, stacks);
  inspectNodePackageAtDir(fullDir, stacks, vibeMarkers);

  if (fs.existsSync(path.join(fullDir, 'composer.json'))) {
    addUnique(stacks, 'php');
  }
  if (fs.existsSync(path.join(fullDir, 'wdio.conf.ts')) || fs.existsSync(path.join(fullDir, 'wdio.conf.js'))) {
    addUnique(stacks, STACK_MOBILE_APPIUM);
  }
}

function detectAuxiliaryStacks(projectRoot: string, stacks: QuickstartStackName[]): void {
  const aiMarkers = [STACK_AI_EVALS, 'promptfooconfig.yaml', 'promptfooconfig.yml'];
  if (aiMarkers.some((rel) => fs.existsSync(path.join(projectRoot, rel)))) {
    addUnique(stacks, STACK_AI_EVALS);
  }
  if (fs.existsSync(path.join(projectRoot, STACK_BASH_SCRIPTS)) || hasShellArtifacts(projectRoot)) {
    addUnique(stacks, STACK_BASH_SCRIPTS);
  }
}

function hasShellArtifacts(projectRoot: string): boolean {
  for (const relDir of ['', 'scripts']) {
    const dir = relDir ? path.join(projectRoot, relDir) : projectRoot;
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      continue;
    }
    const hasShell = fs
      .readdirSync(dir)
      .some((name) => name.endsWith('.sh') || name.endsWith('.bats'));
    if (hasShell) {
      return true;
    }
  }
  return false;
}

function extractRiskyPublicEnvKey(line: string): string | null {
  const eqIdx = line.indexOf('=');
  if (eqIdx <= 0) {
    return null;
  }
  let rawKey = line.slice(0, eqIdx).trim();
  if (rawKey.startsWith('export ')) {
    rawKey = rawKey.slice(7).trim();
  }
  const upperKey = rawKey.toUpperCase();
  if (!ENV_KEY_IDENT_RE.test(upperKey)) {
    return null;
  }
  const isPublic = PUBLIC_ENV_PREFIXES.some((prefix) => upperKey.startsWith(prefix));
  const isSensitive = SECRET_ENV_TOKENS.some((token) => upperKey.includes(token));
  return isPublic && isSensitive ? rawKey : null;
}

function inspectVibeEnvFiles(projectRoot: string, vibeMarkers: string[]): void {
  for (const envName of ['.env.example', '.env']) {
    const content = readTextSafe(path.join(projectRoot, envName));
    if (content === null) {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const riskyKey = extractRiskyPublicEnvKey(line);
      if (riskyKey !== null) {
        addUnique(vibeMarkers, `env:${riskyKey}`);
      }
    }
  }
}

function inspectSqlFileForVibeRisks(
  filePath: string,
  relPath: string,
  vibeMarkers: string[]
): void {
  const raw = readTextSafe(filePath);
  if (raw === null) {
    return;
  }
  const stripped = raw.replace(SQL_BLOCK_COMMENT_RE, ' ').replace(SQL_LINE_COMMENT_RE, ' ');
  if (SQL_CREATE_TABLE_RE.test(stripped) && !SQL_ENABLE_RLS_RE.test(stripped)) {
    addUnique(vibeMarkers, `sql:missing-rls:${relPath}`);
  }
  if (SQL_PERMISSIVE_RE.test(stripped)) {
    addUnique(vibeMarkers, `sql:permissive-rls:${relPath}`);
  }
}

function inspectVibeSqlFiles(projectRoot: string, vibeMarkers: string[]): void {
  for (const relDir of SQL_SCAN_DIRS) {
    const dir = relDir ? path.join(projectRoot, relDir) : projectRoot;
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      continue;
    }
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.toLowerCase().endsWith('.sql')) {
        continue;
      }
      const relFile = relDir ? `${relDir}/${entry}` : entry;
      inspectSqlFileForVibeRisks(path.join(dir, entry), relFile, vibeMarkers);
    }
  }
}

function inspectVibeRootMarkers(projectRoot: string, vibeMarkers: string[]): void {
  for (const marker of ['.bolt', '.lovable']) {
    if (fs.existsSync(path.join(projectRoot, marker))) {
      addUnique(vibeMarkers, marker);
    }
  }
  inspectVibeEnvFiles(projectRoot, vibeMarkers);
  inspectVibeSqlFiles(projectRoot, vibeMarkers);
}

export function detectProjectStackProfile(projectDir: string): QuickstartProjectProfile {
  const resolvedRoot = resolveQuickstartTargetDir(projectDir);
  const stacks: QuickstartStackName[] = [];
  const vibeMarkers: string[] = [];

  for (const relDir of SCAN_SUBDIRS) {
    inspectDirectoryEntries(resolvedRoot, relDir, stacks, vibeMarkers);
  }
  detectAuxiliaryStacks(resolvedRoot, stacks);
  inspectVibeRootMarkers(resolvedRoot, vibeMarkers);

  const finalStacks: readonly QuickstartStackName[] =
    stacks.length > 0 ? Object.freeze([...stacks]) : Object.freeze(['generic']);
  const vibeDetected = vibeMarkers.length > 0;
  const recommendedTools = [
    ...(vibeDetected ? ['audit_vibe_prototype'] : []),
    'inspect_project_config',
    'run_ephemeral_qa',
    'certify_11x_gate',
  ];

  return {
    projectPath: resolvedRoot,
    stacks: finalStacks,
    vibePrototypeDetected: vibeDetected,
    vibeMarkers: Object.freeze(vibeMarkers),
    recommendedMcpTools: Object.freeze(recommendedTools),
  };
}

function resolveEffectiveTier(
  requestedTier: QuickstartTier | undefined,
  existingConfig: Record<string, unknown> | null,
  force: boolean
): QuickstartTier {
  if (requestedTier !== undefined) {
    return validateQuickstartTier(requestedTier);
  }
  if (!force && existingConfig !== null && typeof existingConfig.tier === 'string') {
    try {
      return validateQuickstartTier(existingConfig.tier);
    } catch {
      return TIER_STARTER;
    }
  }
  return TIER_STARTER;
}

function resolveEffectiveLang(
  projectRoot: string,
  requestedLang: SupportedLang | undefined,
  existingConfig: Record<string, unknown> | null
): SupportedLang {
  if (requestedLang !== undefined) {
    return validateSupportedLang(requestedLang);
  }
  if (existingConfig !== null && (existingConfig.lang === 'es' || existingConfig.lang === 'en')) {
    return existingConfig.lang;
  }
  const agentsMd = readTextSafe(path.join(projectRoot, AGENTS_MD_REL_PATH));
  if (agentsMd !== null && SPANISH_MARKER_RE.test(agentsMd)) {
    return 'es';
  }
  return 'en';
}

function resolveAgentsSpec(rawAgents?: AgentsTargetSpec | string): AgentsTargetSpec {
  if (rawAgents === undefined) {
    return 'auto';
  }
  if (typeof rawAgents === 'string') {
    return parseAgentsOption(rawAgents);
  }
  return rawAgents;
}

function buildCompactActiveTaskContent(
  tier: QuickstartTier,
  stacks: readonly QuickstartStackName[],
  lang: SupportedLang
): string {
  return [
    '# Active Task Diary — QA 11X',
    '',
    `- **Task:** QA-11X Quickstart Adoption (\`tier=${tier}\`, \`lang=${lang}\`, \`stacks=${stacks.join(', ')}\`)`,
    '- **Estado:** `IN_PROGRESS (0%)`',
    '',
    '## Checklist',
    '- [x] Bootstrap `.qa-11x.json`, `AGENTS.md`, and CI PR check.',
    '- [ ] Execute first ephemeral Rule Zero verification (`run_ephemeral_qa` / `certify_11x_gate`).',
    '',
  ].join('\n');
}

function buildGithubWorkflowContent(tier: QuickstartTier, lang: SupportedLang): string {
  return [
    '# SPDX-License-Identifier: MIT',
    'name: QA 11X PR Check',
    '',
    'on:',
    '  pull_request:',
    '    branches:',
    '      - main',
    '      - master',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  qa-11x-gate:',
    '    name: QA-11X Proportional PR Gate',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 15',
    '    steps:',
    '      - name: Checkout repository',
    `        uses: ${CHECKOUT_PINNED_REF}`,
    '        with:',
    '          fetch-depth: 0',
    '',
    '      - name: Run QA-11X PR-Aware Check',
    `        uses: ${PR_CHECK_ACTION_REF} # sec-ci-action-ref-ok`,
    '        with:',
    `          tier: ${tier}`,
    `          lang: ${lang}`,
    '',
  ].join('\n');
}

function syncManagedTextFile(
  projectRoot: string,
  relPath: string,
  content: string,
  options: { readonly dryRun: boolean; readonly force: boolean; readonly overwriteExisting: boolean }
): QuickstartFileRecord {
  const safePath = resolveContainedFile(projectRoot, relPath);
  const existing = readTextSafe(safePath);

  if (existing !== null && !options.overwriteExisting && !options.force) {
    return { relativePath: relPath, action: 'preserved' };
  }
  if (existing === content) {
    return { relativePath: relPath, action: 'preserved' };
  }
  if (options.dryRun) {
    return { relativePath: relPath, action: 'planned' };
  }
  fs.mkdirSync(path.dirname(safePath), { recursive: true });
  fs.writeFileSync(safePath, content, UTF8_ENCODING);
  return { relativePath: relPath, action: existing === null ? 'created' : 'updated' };
}

function buildConfigPayload(
  tier: QuickstartTier,
  lang: SupportedLang,
  profile: QuickstartProjectProfile,
  existingConfig: Record<string, unknown> | null,
  force: boolean
): { readonly canonical: QuickstartConfig; readonly serialized: string } {
  const canonical: QuickstartConfig = {
    schemaVersion: SCHEMA_VERSION_2,
    tier,
    lang,
    detectedStacks: profile.stacks,
    ruleZeroEphemeralDocker: true,
    activeGates: QUICKSTART_TIER_PROFILES[tier],
    vibePrototypeDetected: profile.vibePrototypeDetected,
  };
  const merged = !force && existingConfig !== null ? { ...existingConfig, ...canonical } : canonical;
  return { canonical, serialized: `${JSON.stringify(merged, null, 2)}\n` };
}

function mapAgentsAction(action: InitOrAppendAgentsMdResult['action']): QuickstartFileAction {
  if (action === 'dry_run') {
    return 'planned';
  }
  return action === 'created' ? 'created' : 'updated';
}

function collectAgentFileRecords(
  agentsResult: InitOrAppendAgentsMdResult
): QuickstartFileRecord[] {
  const records: QuickstartFileRecord[] = [
    { relativePath: AGENTS_MD_REL_PATH, action: mapAgentsAction(agentsResult.action) },
  ];
  for (const bridge of agentsResult.bridge_files) {
    records.push({ relativePath: bridge.relative_path, action: mapAgentsAction(bridge.action) });
  }
  return records;
}

function computeNextCommand(
  profile: QuickstartProjectProfile,
  tier: QuickstartTier
): string {
  if (profile.vibePrototypeDetected) {
    return 'npx -y @sinfallas/mcp-qa-11x --help # Run MCP tool audit_vibe_prototype before merge';
  }
  if (tier === TIER_ENTERPRISE) {
    return 'make validate-calm && make certify';
  }
  return 'npx -y @sinfallas/mcp-qa-11x install-skill --include-scripts --reconcile';
}

export async function runQuickstart(options: QuickstartOptions = {}): Promise<QuickstartResult> {
  const rawDir = options.dir ?? options.projectPath ?? process.cwd();
  const projectPath = resolveQuickstartTargetDir(rawDir, options.baseBoundaryDir);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const ci = validateQuickstartCi(options.ci);

  const configPath = resolveContainedFile(projectPath, CONFIG_REL_PATH);
  const existingConfig = readJsonRecordSafe(configPath);
  const tier = resolveEffectiveTier(options.tier, existingConfig, force);
  const lang = resolveEffectiveLang(projectPath, options.lang, existingConfig);
  const agents = resolveAgentsSpec(options.agents);

  const profile = detectProjectStackProfile(projectPath);
  const { canonical, serialized } = buildConfigPayload(tier, lang, profile, existingConfig, force);

  const agentsResult = await initOrAppendAgentsMd({
    projectPath,
    lang,
    agents,
    dryRun,
  });

  const configRecord = syncManagedTextFile(projectPath, CONFIG_REL_PATH, serialized, {
    dryRun,
    force,
    overwriteExisting: true,
  });
  const activeTaskRecord = syncManagedTextFile(
    projectPath,
    ACTIVE_TASK_REL_PATH,
    buildCompactActiveTaskContent(tier, profile.stacks, lang),
    { dryRun, force, overwriteExisting: false }
  );

  const fileRecords: QuickstartFileRecord[] = [
    configRecord,
    ...collectAgentFileRecords(agentsResult),
    activeTaskRecord,
  ];

  if (ci === CI_GITHUB) {
    const ciRecord = syncManagedTextFile(
      projectPath,
      GITHUB_WORKFLOW_REL_PATH,
      buildGithubWorkflowContent(tier, lang),
      { dryRun, force, overwriteExisting: false }
    );
    fileRecords.push(ciRecord);
  }

  const plannedFiles = fileRecords
    .filter((entry) => entry.action !== 'preserved')
    .map((entry) => entry.relativePath);

  return {
    projectPath,
    tier,
    lang,
    ci,
    dryRun,
    force,
    detectedStacks: profile.stacks,
    vibePrototypeDetected: profile.vibePrototypeDetected,
    vibeMarkers: profile.vibeMarkers,
    activeGates: QUICKSTART_TIER_PROFILES[tier],
    recommendedMcpTools: profile.recommendedMcpTools,
    configPath,
    config: canonical,
    agentsResult,
    files: Object.freeze(fileRecords),
    plannedFiles: Object.freeze(plannedFiles),
    nextCommand: computeNextCommand(profile, tier),
  };
}

export function formatQuickstartOutput(
  result: QuickstartResult,
  asJson: boolean = false
): string {
  if (asJson) {
    return JSON.stringify(result, null, 2);
  }
  const modeTag = result.dryRun ? 'dry-run' : 'ready';
  const changedCount = result.files.filter((f) => f.action !== 'preserved').length;
  const lines = [
    `✔ [quickstart:${modeTag}] tier=${result.tier} lang=${result.lang} stacks=${result.detectedStacks.join(',')} gates=${result.activeGates.length} files=${changedCount}`,
  ];
  if (result.vibePrototypeDetected) {
    lines.push(
      `⚠ [vibe-detected] markers=${result.vibeMarkers.join(',')} -> recommended: audit_vibe_prototype`
    );
  }
  lines.push(`➡ Next: ${result.nextCommand}`);
  return lines.join('\n');
}
