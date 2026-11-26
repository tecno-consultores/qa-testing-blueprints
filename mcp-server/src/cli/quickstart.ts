// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import {
  initOrAppendAgentsMd,
  parseAgentsOption,
  resolveSafeBridgePath,
  validateSupportedLang,
  type AgentsTargetSpec,
  type InitOrAppendAgentsMdResult,
  type SupportedLang,
} from '../tools/initOrAppendAgentsMd.js';
import {
  DEFAULT_QA_11X_TIER,
  QA_11X_CONFIG_FILENAME,
  QA_11X_CONFIG_SCHEMA_VERSION,
  TIER_ENTERPRISE,
  TIER_STANDARD,
  TIER_STARTER,
  TIER_ACTIVE_GATES,
  buildQa11xConfigV3Payload,
  deriveActiveGatesForTier,
  findMissingCanonicalGitignoreEntries,
  formatQa11xStatusBanner,
  readQa11xConfig,
  type LoadedQa11xConfig,
} from '../services/qa11xConfig.js';
import type {
  BilingualMirrorsMode,
  GovernanceDocDecision,
  Qa11xProjectConfigV3,
  StandardTier,
} from '../types.js';
import { applyGovernanceDocuments } from '../services/governanceTemplates.js';
import { reportDebugCatchError, sanitizeDiagnosticText } from '../utils/diagnosticFormatter.js';

const UTF8_ENCODING = 'utf8' as const;
const CONFIG_REL_PATH = QA_11X_CONFIG_FILENAME;
const GITIGNORE_REL_PATH = '.gitignore' as const;
const GITHUB_WORKFLOW_REL_PATH = '.github/workflows/qa-11x-pr.yml' as const;
const AGENTS_MD_REL_PATH = 'AGENTS.md' as const;
const PR_CHECK_ACTION_REF =
  'tecno-consultores/qa-testing-blueprints/.github/actions/qa-11x-pr-check@v3' as const;
const CHECKOUT_PINNED_REF =
  'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0' as const;

export { TIER_STARTER, TIER_STANDARD, TIER_ENTERPRISE };
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

export type QuickstartTier = StandardTier;
export type QuickstartCiProvider = typeof CI_GITHUB | typeof CI_NONE;
export type QuickstartFileAction = 'created' | 'updated' | 'preserved' | 'planned';

export interface QuickstartProjectProfile {
  readonly projectPath: string;
  readonly stacks: readonly QuickstartStackName[];
  readonly vibePrototypeDetected: boolean;
  readonly vibeMarkers: readonly string[];
  readonly recommendedMcpTools: readonly string[];
}

export type QuickstartPromptFn = (question: string) => Promise<string>;

export interface QuickstartOptions {
  readonly dir?: string;
  readonly projectPath?: string;
  readonly baseBoundaryDir?: string;
  readonly tier?: QuickstartTier;
  readonly tierConfirmedByUser?: boolean;
  readonly isStdinTty?: boolean;
  readonly promptTierFn?: QuickstartPromptFn;
  readonly lang?: SupportedLang;
  readonly agents?: readonly string[] | string;
  readonly ci?: QuickstartCiProvider;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly governanceDocs?: Readonly<Record<string, GovernanceDocDecision>>;
  readonly governanceDocsList?: readonly string[];
  readonly declineGovernanceDocs?: readonly string[];
  readonly bilingualMirrors?: BilingualMirrorsMode;
}

export type QuickstartConfig = Qa11xProjectConfigV3;

export interface QuickstartFileRecord {
  readonly relativePath: string;
  readonly action: QuickstartFileAction;
}

export interface QuickstartResult {
  readonly projectPath: string;
  readonly tier: QuickstartTier;
  readonly tierConfirmedByUser: boolean;
  readonly qa11xBanner: string;
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

export const QUICKSTART_TIER_PROFILES: Readonly<Record<QuickstartTier, readonly string[]>> =
  TIER_ACTIVE_GATES;

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
const SPANISH_MARKER_RE = /(?:\bin \*?\*?Spanish\*?\*?\b|Estándar 11X|\ben español\b)/i;
const ENGLISH_MARKER_RE = /\b(?:Respond in English|strictly in \*\*English\*\*)\b/i;

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
  const realBoundary = resolveSafeProjectPath(resolvedBoundary, { allowNonExistentLeaf: false });
  const prefix = realBoundary.endsWith(path.sep) ? realBoundary : `${realBoundary}${path.sep}`;
  if (realTarget !== realBoundary && !realTarget.startsWith(prefix)) {
    throw new Error(`Path traversal outside allowed boundary '${realBoundary}' detected for '${realTarget}'.`);
  }
}

function assertExistingDirectoryPath(resolved: string): void {
  if (isForbiddenSystemPath(resolved)) {
    throw new Error(`Refusing to initialize QA-11X inside critical system path '${resolved}'.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Target path is not a directory: ${resolved}`);
  }
}

export function resolveQuickstartTargetDir(rawDir: string, baseBoundaryDir?: string): string {
  const normalized = assertNoRawTraversal(rawDir);
  const resolved = path.resolve(normalized);
  assertExistingDirectoryPath(resolved);
  const realTarget = resolveSafeProjectPath(resolved, { allowNonExistentLeaf: false });
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
    return DEFAULT_QA_11X_TIER;
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
  } catch (err: unknown) {
    // Optional project inspection probe: unreadable/missing files fall back safely to null
    reportDebugCatchError(`quickstart.readTextSafe(${filePath})`, err);
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
  } catch (err: unknown) {
    // Optional config probe: malformed JSON returns null so starter defaults apply
    reportDebugCatchError(`quickstart.readJsonRecordSafe(${filePath})`, err);
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
  loadedConfig: LoadedQa11xConfig,
  force: boolean
): QuickstartTier {
  if (requestedTier !== undefined) {
    return validateQuickstartTier(requestedTier);
  }
  if (!force && loadedConfig.declaredTier !== null) {
    return loadedConfig.declaredTier;
  }
  return DEFAULT_QA_11X_TIER;
}

function detectAgentsMdLang(agentsMd: string | null): SupportedLang {
  if (agentsMd === null) {
    return 'auto';
  }
  if (SPANISH_MARKER_RE.test(agentsMd)) {
    return 'es';
  }
  return ENGLISH_MARKER_RE.test(agentsMd) ? 'en' : 'auto';
}

function resolveEffectiveLang(
  projectRoot: string,
  requestedLang: SupportedLang | undefined,
  loadedConfig: LoadedQa11xConfig
): SupportedLang {
  if (requestedLang !== undefined) {
    return validateSupportedLang(requestedLang);
  }
  if (loadedConfig.lang !== undefined) {
    return loadedConfig.lang;
  }
  return detectAgentsMdLang(readTextSafe(path.join(projectRoot, AGENTS_MD_REL_PATH)));
}

// eslint-disable-next-line sonarjs/function-return-type -- AgentsTargetSpec intentionally unions 'auto' | 'all' modes with SupportedAiAgentId[]
function resolveAgentsSpec(rawAgents?: readonly string[] | string): AgentsTargetSpec {
  let resolved: AgentsTargetSpec = 'auto';
  if (typeof rawAgents === 'string') {
    resolved = parseAgentsOption(rawAgents);
  } else if (rawAgents !== undefined) {
    resolved = rawAgents;
  }
  return resolved;
}

function syncQuickstartGitignore(
  projectRoot: string,
  dryRun: boolean
): QuickstartFileRecord | null {
  const safePath = resolveContainedFile(projectRoot, GITIGNORE_REL_PATH);
  const existing = readTextSafe(safePath);
  const hasGitDir = fs.existsSync(path.join(projectRoot, '.git'));
  if (existing === null && !hasGitDir) {
    return null;
  }
  const missing = findMissingCanonicalGitignoreEntries(existing);
  if (missing.length === 0) {
    return { relativePath: GITIGNORE_REL_PATH, action: 'preserved' };
  }
  if (dryRun) {
    return { relativePath: GITIGNORE_REL_PATH, action: 'planned' };
  }
  const prefix = existing && existing.length > 0 ? `${existing.trimEnd()}\n\n` : '';
  const block = `# QA-11X Ephemeral & Governance Hygiene\n${missing.join('\n')}\n`;
  fs.writeFileSync(safePath, `${prefix}${block}`, UTF8_ENCODING);
  return { relativePath: GITIGNORE_REL_PATH, action: existing === null ? 'created' : 'updated' };
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

function syncManagedWorkflowFile(
  projectRoot: string,
  tier: QuickstartTier,
  lang: SupportedLang,
  options: { readonly dryRun: boolean; readonly force: boolean; readonly tierChanged: boolean }
): QuickstartFileRecord {
  const safePath = resolveContainedFile(projectRoot, GITHUB_WORKFLOW_REL_PATH);
  const existing = readTextSafe(safePath);
  const generated = buildGithubWorkflowContent(tier, lang);
  if (existing === null) {
    return syncManagedTextFile(projectRoot, GITHUB_WORKFLOW_REL_PATH, generated, {
      dryRun: options.dryRun,
      force: options.force,
      overwriteExisting: true,
    });
  }
  const isManagedWorkflow = existing.includes('qa-11x-pr-check');
  if (options.force) {
    return syncManagedTextFile(projectRoot, GITHUB_WORKFLOW_REL_PATH, generated, {
      dryRun: options.dryRun,
      force: true,
      overwriteExisting: true,
    });
  }
  if (isManagedWorkflow && options.tierChanged) {
    let replacedTier = false;
    const updated = existing
      .split('\n')
      .map((line) => {
        if (!replacedTier && line.trimStart().startsWith('tier:')) {
          replacedTier = true;
          const indentLen = line.length - line.trimStart().length;
          return `${line.slice(0, indentLen)}tier: ${tier}`;
        }
        return line;
      })
      .join('\n');
    if (updated !== existing) {
      return syncManagedTextFile(projectRoot, GITHUB_WORKFLOW_REL_PATH, updated, {
        dryRun: options.dryRun,
        force: false,
        overwriteExisting: true,
      });
    }
  }
  return { relativePath: GITHUB_WORKFLOW_REL_PATH, action: 'preserved' };
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

interface BuildConfigPayloadArgs {
  readonly tier: QuickstartTier;
  readonly tierConfirmedByUser: boolean;
  readonly lang: SupportedLang;
  readonly profile: QuickstartProjectProfile;
  readonly governanceDocs?: Readonly<Record<string, GovernanceDocDecision>>;
  readonly existingConfig: Record<string, unknown> | null;
  readonly force: boolean;
}

function buildConfigPayload(
  args: BuildConfigPayloadArgs
): { readonly canonical: QuickstartConfig; readonly serialized: string } {
  return buildQa11xConfigV3Payload({
    tier: args.tier,
    tierConfirmedByUser: args.tierConfirmedByUser,
    lang: args.lang,
    stacks: args.profile.stacks,
    governanceDocs: args.governanceDocs,
    vibePrototypeDetected: args.profile.vibePrototypeDetected,
    existingRaw: args.existingConfig,
    force: args.force,
  });
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
    return 'npx -y @sinfallas/mcp-qa-11x@latest audit --mode vibe';
  }
  if (tier === TIER_ENTERPRISE) {
    return 'make validate-calm && make certify';
  }
  return 'npx -y @sinfallas/mcp-qa-11x install-skill --include-scripts --reconcile';
}

const TIER_PROMPT_CHOICES: Readonly<Record<string, QuickstartTier>> = Object.freeze({
  '': DEFAULT_QA_11X_TIER,
  '1': TIER_STARTER,
  starter: TIER_STARTER,
  '2': TIER_STANDARD,
  standard: TIER_STANDARD,
  '3': TIER_ENTERPRISE,
  enterprise: TIER_ENTERPRISE,
});

function parseInteractiveTierAnswer(raw: string): QuickstartTier {
  const key = raw.trim().toLowerCase();
  const mapped = Object.hasOwn(TIER_PROMPT_CHOICES, key) ? TIER_PROMPT_CHOICES[key] : undefined;
  if (mapped !== undefined) {
    return mapped;
  }
  throw new Error(
    `Invalid tier selection '${raw.trim()}'. Choose 1 (starter), 2 (standard), or 3 (enterprise).`
  );
}

export async function defaultInteractiveTierPrompt(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stderr
): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function resolveQuickstartTierSelection(
  options: QuickstartOptions,
  loadedConfig: LoadedQa11xConfig,
  flags: { readonly dryRun: boolean; readonly force: boolean }
): Promise<{ readonly tier: QuickstartTier; readonly tierConfirmedByUser: boolean }> {
  if (options.tier !== undefined) {
    return {
      tier: validateQuickstartTier(options.tier),
      tierConfirmedByUser: options.tierConfirmedByUser ?? true,
    };
  }
  const canPromptTty =
    !flags.dryRun &&
    !options.json &&
    (options.isStdinTty ?? Boolean(process.stdin.isTTY)) &&
    (flags.force || !loadedConfig.tierConfirmedByUser);

  if (canPromptTty) {
    const promptFn = options.promptTierFn ?? defaultInteractiveTierPrompt;
    const answer = await promptFn(
      'Select QA-11X adoption tier [1=starter, 2=standard (default), 3=enterprise]: '
    );
    return {
      tier: parseInteractiveTierAnswer(answer),
      tierConfirmedByUser: options.tierConfirmedByUser ?? true,
    };
  }

  return {
    tier: resolveEffectiveTier(undefined, loadedConfig, flags.force),
    tierConfirmedByUser:
      options.tierConfirmedByUser ?? (!flags.force && loadedConfig.tierConfirmedByUser),
  };
}

function mapGovernanceApplyAction(
  action: 'created' | 'updated' | 'preserved' | 'declined' | 'legacy_preserved' | 'dry_run'
): QuickstartFileAction {
  if (action === 'created' || action === 'updated') {
    return action;
  }
  if (action === 'dry_run') {
    return 'planned';
  }
  return 'preserved';
}

function applyQuickstartGovernanceStage(params: {
  projectPath: string;
  tier: StandardTier;
  lang: SupportedLang;
  stacks: readonly string[];
  options: QuickstartOptions;
  dryRun: boolean;
}): {
  govApplied: ReturnType<typeof applyGovernanceDocuments> | undefined;
  mergedGovDecisions: Record<string, GovernanceDocDecision>;
} {
  const { options } = params;
  const hasGovTemplates =
    (options.governanceDocsList !== undefined && options.governanceDocsList.length > 0) ||
    (options.declineGovernanceDocs !== undefined && options.declineGovernanceDocs.length > 0);
  const govApplied = hasGovTemplates
    ? applyGovernanceDocuments({
        projectPath: params.projectPath,
        tier: params.tier,
        lang: params.lang,
        stacks: params.stacks,
        governanceDocs: options.governanceDocsList,
        declineGovernanceDocs: options.declineGovernanceDocs,
        bilingualMirrors: options.bilingualMirrors,
        dryRun: params.dryRun,
      })
    : undefined;
  const mergedGovDecisions: Record<string, GovernanceDocDecision> = {
    ...(options.governanceDocs ?? {}),
    ...(govApplied?.decisionsDelta ?? {}),
  };
  return { govApplied, mergedGovDecisions };
}

function appendGovernanceFileRecords(
  fileRecords: QuickstartFileRecord[],
  govApplied: ReturnType<typeof applyGovernanceDocuments> | undefined
): void {
  if (!govApplied) {
    return;
  }
  for (const govItem of govApplied.items) {
    fileRecords.push({
      relativePath: govItem.relative_path,
      action: mapGovernanceApplyAction(govItem.action),
    });
  }
}

export async function runQuickstart(options: QuickstartOptions = {}): Promise<QuickstartResult> {
  const rawDir = options.dir ?? options.projectPath ?? process.cwd();
  const projectPath = resolveQuickstartTargetDir(rawDir, options.baseBoundaryDir);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const ci = validateQuickstartCi(options.ci);

  const configPath = resolveContainedFile(projectPath, CONFIG_REL_PATH);
  const loadedConfig = readQa11xConfig(projectPath);
  const { tier, tierConfirmedByUser } = await resolveQuickstartTierSelection(options, loadedConfig, {
    dryRun,
    force,
  });
  const tierChanged = loadedConfig.declaredTier !== null && loadedConfig.declaredTier !== tier;
  const lang = resolveEffectiveLang(projectPath, options.lang, loadedConfig);
  const agents = resolveAgentsSpec(options.agents);

  const profile = detectProjectStackProfile(projectPath);
  const { govApplied, mergedGovDecisions } = applyQuickstartGovernanceStage({
    projectPath,
    tier,
    lang,
    stacks: profile.stacks,
    options,
    dryRun,
  });

  const { canonical, serialized } = buildConfigPayload({
    tier,
    tierConfirmedByUser,
    lang,
    profile,
    governanceDocs: Object.keys(mergedGovDecisions).length > 0 ? mergedGovDecisions : undefined,
    existingConfig: loadedConfig.raw,
    force,
  });

  const configRecord = syncManagedTextFile(projectPath, CONFIG_REL_PATH, serialized, {
    dryRun,
    force,
    overwriteExisting: true,
  });

  const agentsResult = await initOrAppendAgentsMd({
    projectPath,
    lang,
    agents,
    dryRun,
  });

  const fileRecords: QuickstartFileRecord[] = [
    configRecord,
    ...collectAgentFileRecords(agentsResult),
  ];
  appendGovernanceFileRecords(fileRecords, govApplied);

  const gitignoreRecord = syncQuickstartGitignore(projectPath, dryRun);
  if (gitignoreRecord) {
    fileRecords.push(gitignoreRecord);
  }

  if (ci === CI_GITHUB) {
    const ciRecord = syncManagedWorkflowFile(projectPath, tier, lang, {
      dryRun,
      force,
      tierChanged: tierChanged || options.tier !== undefined,
    });
    fileRecords.push(ciRecord);
  }

  const plannedFiles = fileRecords
    .filter((entry) => entry.action !== 'preserved')
    .map((entry) => entry.relativePath);
  const activeGates = deriveActiveGatesForTier(tier);
  const qa11xBanner = formatQa11xStatusBanner(tier, 'FULL_11X');

  return {
    projectPath,
    tier,
    tierConfirmedByUser,
    qa11xBanner,
    lang,
    ci,
    dryRun,
    force,
    detectedStacks: profile.stacks,
    vibePrototypeDetected: profile.vibePrototypeDetected,
    vibeMarkers: profile.vibeMarkers,
    activeGates,
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
    return sanitizeDiagnosticText(JSON.stringify(result, null, 2));
  }
  const modeTag = result.dryRun ? 'dry-run' : 'ready';
  const changedCount = result.files.filter((f) => f.action !== 'preserved').length;
  const lines = [
    result.qa11xBanner,
    `✔ [quickstart:${modeTag}] schema=v${QA_11X_CONFIG_SCHEMA_VERSION} tier=${result.tier} lang=${result.lang} stacks=${result.detectedStacks.join(',')} gates=${result.activeGates.length} files=${changedCount}`,
  ];
  if (result.vibePrototypeDetected) {
    lines.push(
      `⚠ [vibe-detected] markers=${result.vibeMarkers.join(',')} -> recommended: audit_vibe_prototype`
    );
  }
  lines.push(`➡ Next: ${result.nextCommand}`);
  return lines.join('\n');
}
