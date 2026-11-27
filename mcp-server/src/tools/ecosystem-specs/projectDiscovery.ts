// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WorkspacePathValidationError,
  normalizeForMatch,
  resolveRealTarget,
} from '../../security/workspacePathValidator.js';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../../utils/ignoredDirs.js';
import {
  UTF8_ENCODING,
  type DiscoveredProject,
  type EcosystemStack,
  type ProjectRole,
} from './types.js';

const SEC_PATH_TAG = '[SEC-PATH-01]';
const TRAVERSAL_SEG_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const NON_SLUG_CHARS_RE = /[^a-z0-9._-]+/g;
const TEST_FILE_SUFFIX_RE =
  /(?:\.(?:unit|spec|test|e2e)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.py$|Test\.php$)/i;

const PACKAGE_JSON = 'package.json';
const PYPROJECT_TOML = 'pyproject.toml';
const COMPOSER_JSON = 'composer.json';
const REQUIREMENTS_TXT = 'requirements.txt';
const WDIO_CONF_TS = 'wdio.conf.ts';
const WDIO_CONF_JS = 'wdio.conf.js';

const OPENAPI_FILENAMES: readonly string[] = [
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml',
];

const PROJECT_MANIFEST_FILES: readonly string[] = [
  PACKAGE_JSON,
  PYPROJECT_TOML,
  REQUIREMENTS_TXT,
  COMPOSER_JSON,
  WDIO_CONF_TS,
  WDIO_CONF_JS,
  'capacitor.config.ts',
  'capacitor.config.json',
  'ionic.config.json',
  ...OPENAPI_FILENAMES,
];

const MOBILE_PACKAGE_DEPS: readonly string[] = [
  'appium',
  'webdriverio',
  '@wdio/cli',
  'react-native',
  'expo',
  '@capacitor/core',
  '@ionic/vue',
  '@ionic/react',
  '@ionic/angular',
];

const NODE_BACKEND_DEPS: readonly string[] = [
  'express',
  'fastify',
  '@nestjs/core',
  'koa',
  'hono',
  '@modelcontextprotocol/sdk',
];

const TEST_DIR_NAMES: ReadonlySet<string> = new Set([
  'tests',
  'test',
  '__tests__',
  'e2e',
  'spec',
  'specs',
]);

const CODE_MARKER_EXTS: ReadonlySet<string> = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.php',
  '.sh',
]);

export function toPosixRel(baseDir: string, targetPath: string): string {
  return path.relative(baseDir, targetPath).replace(/\\/g, '/');
}

export function isStrictlyInsidePath(target: string, root: string): boolean {
  const normTarget = normalizeForMatch(target);
  const normRoot = normalizeForMatch(root);
  const prefix = normRoot.endsWith('/') ? normRoot : `${normRoot}/`;
  return normTarget.startsWith(prefix);
}

export function isEqualOrInsidePath(target: string, root: string): boolean {
  const normTarget = normalizeForMatch(target);
  const normRoot = normalizeForMatch(root);
  return normTarget === normRoot || isStrictlyInsidePath(normTarget, normRoot);
}

function isSymlinkEntry(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
  } catch {
    return true;
  }
}

export function assertNoSymlinkBetween(rootReal: string, candidateAbs: string): void {
  const rel = path.relative(rootReal, candidateAbs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return;
  }
  let cursor = rootReal;
  for (const segment of rel.split(path.sep)) {
    if (!segment || segment === '.') continue;
    cursor = path.join(cursor, segment);
    if (isSymlinkEntry(cursor)) {
      throw new WorkspacePathValidationError(
        `${SEC_PATH_TAG} Enlace simbólico rechazado por seguridad: ${cursor}`
      );
    }
  }
}

function assertCleanRelativeSegment(rawPath: string, fieldLabel: string): string {
  const normalized = rawPath.normalize('NFKC').trim();
  if (!normalized || normalized.includes('\0')) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} '${fieldLabel}' no puede estar vacío ni contener bytes NUL.`
    );
  }
  if (path.isAbsolute(normalized) || TRAVERSAL_SEG_RE.test(normalized)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} '${fieldLabel}' debe ser una ruta relativa contenida en workspaceRoot: '${rawPath}'.`
    );
  }
  return normalized;
}

export function resolveSafeOutputDir(workspaceReal: string, rawOutputDir: string): string {
  const cleanRel = assertCleanRelativeSegment(rawOutputDir, 'outputDir');
  const candidate = path.resolve(workspaceReal, cleanRel);
  assertNoSymlinkBetween(workspaceReal, candidate);
  const resolved = resolveRealTarget(candidate);
  if (!isStrictlyInsidePath(resolved, workspaceReal)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} outputDir debe estar estrictamente dentro de workspaceRoot: '${rawOutputDir}'.`
    );
  }
  return resolved;
}

function trimOuterDashes(input: string): string {
  let start = 0;
  let end = input.length;
  while (start < end && input[start] === '-') start += 1;
  while (end > start && input[end - 1] === '-') end -= 1;
  return input.slice(start, end);
}

export function slugifyProjectPath(relPath: string, usedSlugs: Set<string>): string {
  const base = trimOuterDashes(
    relPath.toLowerCase().replace(/\\/g, '/').replace(NON_SLUG_CHARS_RE, '-')
  );
  const rootSlug = base || 'project';
  if (!usedSlugs.has(rootSlug)) {
    usedSlugs.add(rootSlug);
    return rootSlug;
  }
  let suffix = 2;
  while (usedSlugs.has(`${rootSlug}-${suffix}`)) {
    suffix += 1;
  }
  const uniqueSlug = `${rootSlug}-${suffix}`;
  usedSlugs.add(uniqueSlug);
  return uniqueSlug;
}

function safeReadUtf8(filePath: string): string {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? fs.readFileSync(filePath, UTF8_ENCODING)
      : '';
  } catch (err: unknown) {
    reportDebugCatchError(`projectDiscovery.safeReadUtf8(${filePath})`, err);
    return '';
  }
}

function addObjectKeys(section: unknown, names: Set<string>): void {
  if (typeof section !== 'object' || section === null) return;
  for (const key of Object.keys(section)) {
    names.add(key);
  }
}

function parsePackageDeps(pkgPath: string): Set<string> {
  const raw = safeReadUtf8(pkgPath);
  if (!raw) return new Set<string>();
  const names = new Set<string>();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    addObjectKeys(parsed.dependencies, names);
    addObjectKeys(parsed.devDependencies, names);
    addObjectKeys(parsed.peerDependencies, names);
  } catch (err: unknown) {
    reportDebugCatchError(`projectDiscovery.parsePackageDeps(${pkgPath})`, err);
  }
  return names;
}

function addStack(stacks: EcosystemStack[], stack: EcosystemStack): void {
  if (!stacks.includes(stack)) {
    stacks.push(stack);
  }
}

function detectPythonStacks(projectAbs: string, stacks: EcosystemStack[]): void {
  const pyText = `${safeReadUtf8(path.join(projectAbs, PYPROJECT_TOML))}\n${safeReadUtf8(path.join(projectAbs, REQUIREMENTS_TXT))}`;
  if (!pyText.trim()) return;
  const lower = pyText.toLowerCase();
  addStack(stacks, lower.includes('fastapi') ? 'fastapi' : 'python');
  if (lower.includes('deepeval') || lower.includes('promptfoo')) {
    addStack(stacks, 'ai-evals');
  }
}

const MOBILE_CONFIG_FILES: readonly string[] = [
  WDIO_CONF_TS,
  WDIO_CONF_JS,
  'capacitor.config.ts',
  'capacitor.config.json',
  'ionic.config.json',
];

function hasMobileConfigOrDep(projectAbs: string, deps: ReadonlySet<string>): boolean {
  return (
    MOBILE_PACKAGE_DEPS.some((d) => deps.has(d)) ||
    MOBILE_CONFIG_FILES.some((f) => fs.existsSync(path.join(projectAbs, f)))
  );
}

function detectAuxiliaryNodeStacks(deps: ReadonlySet<string>, stacks: EcosystemStack[]): void {
  if (deps.has('promptfoo')) addStack(stacks, 'ai-evals');
  if (deps.has('lovable-tagger')) addStack(stacks, 'vibe-rescue');
}

function detectNodeAndMobileStacks(
  projectAbs: string,
  stacks: EcosystemStack[]
): { readonly hasMobile: boolean; readonly hasWeb: boolean; readonly hasApi: boolean } {
  const deps = parsePackageDeps(path.join(projectAbs, PACKAGE_JSON));
  const hasMobile = hasMobileConfigOrDep(projectAbs, deps);
  const hasVue = deps.has('vue');
  const hasReact = deps.has('react') || deps.has('react-dom');
  const hasApi = NODE_BACKEND_DEPS.some((d) => deps.has(d));

  if (hasVue) addStack(stacks, 'vue3');
  if (hasReact) addStack(stacks, 'react-frontend');
  if (hasMobile) addStack(stacks, 'mobile-appium');
  if (hasApi || (deps.size > 0 && !hasVue && !hasReact && !hasMobile)) {
    addStack(stacks, 'node-backend');
  }
  detectAuxiliaryNodeStacks(deps, stacks);
  return { hasMobile, hasWeb: (hasVue || hasReact) && !hasMobile, hasApi };
}

function detectSecondaryStacks(projectAbs: string, stacks: EcosystemStack[]): void {
  const hasComposer = fs.existsSync(path.join(projectAbs, COMPOSER_JSON));
  if (hasComposer || hasDirectExtension(projectAbs, '.php')) {
    addStack(stacks, 'php');
  }
  if (hasDirectExtension(projectAbs, '.sh')) {
    addStack(stacks, 'bash-scripts');
  }
  if (stacks.length === 0 && hasDirectExtension(projectAbs, '.py')) {
    addStack(stacks, 'python');
  }
}

function hasDirectExtension(dirPath: string, ext: string): boolean {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).some(
      (e) => e.isFile() && e.name.endsWith(ext)
    );
  } catch {
    return false;
  }
}

function hasOpenApiSpec(projectAbs: string): boolean {
  for (const base of [projectAbs, path.join(projectAbs, 'docs'), path.join(projectAbs, 'spec')]) {
    if (OPENAPI_FILENAMES.some((f) => fs.existsSync(path.join(base, f)))) {
      return true;
    }
  }
  return false;
}

function resolveProjectRole(
  stacks: readonly EcosystemStack[],
  flags: { readonly hasMobile: boolean; readonly hasWeb: boolean; readonly hasApi: boolean },
  openApi: boolean
): ProjectRole {
  const isApi =
    flags.hasApi || stacks.includes('fastapi') || stacks.includes('php') || openApi;
  const isConsumer = flags.hasMobile || flags.hasWeb;
  if (isApi && isConsumer) return 'mixed';
  if (flags.hasMobile) return 'mobile';
  if (flags.hasWeb) return 'web';
  if (isApi) return 'api';
  return 'library';
}

function listProjectManifests(projectAbs: string): string[] {
  const found: string[] = [];
  for (const name of PROJECT_MANIFEST_FILES) {
    if (fs.existsSync(path.join(projectAbs, name))) {
      found.push(name);
    }
  }
  return found;
}

function hasRecognizedCodeEntry(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && CODE_MARKER_EXTS.has(path.extname(entry.name))) {
        return true;
      }
      if (entry.isDirectory() && (entry.name === 'src' || entry.name === 'app')) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function isProjectCandidateDir(dirPath: string): boolean {
  if (listProjectManifests(dirPath).length > 0) {
    return true;
  }
  return fs.existsSync(path.join(dirPath, '.git')) && hasRecognizedCodeEntry(dirPath);
}

function buildDiscoveredProject(
  workspaceReal: string,
  projectAbs: string,
  usedSlugs: Set<string>
): DiscoveredProject {
  const relPath = toPosixRel(workspaceReal, projectAbs);
  const stacks: EcosystemStack[] = [];
  detectPythonStacks(projectAbs, stacks);
  const nodeFlags = detectNodeAndMobileStacks(projectAbs, stacks);
  detectSecondaryStacks(projectAbs, stacks);
  const openApi = hasOpenApiSpec(projectAbs);
  const role = resolveProjectRole(stacks, nodeFlags, openApi);
  return {
    slug: slugifyProjectPath(relPath, usedSlugs),
    name: path.basename(projectAbs),
    relativePath: relPath,
    absPath: projectAbs,
    role,
    stacks,
    hasOpenApi: openApi,
    manifestFiles: listProjectManifests(projectAbs),
  };
}

function listEligibleChildDirs(parentDir: string, outputRealDir: string): string[] {
  const out: string[] = [];
  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('.') || CANONICAL_IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(parentDir, entry.name);
      if (isEqualOrInsidePath(full, outputRealDir)) continue;
      out.push(full);
    }
  } catch (err: unknown) {
    reportDebugCatchError(`projectDiscovery.listEligibleChildDirs(${parentDir})`, err);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function resolveSingleRequestedProject(
  workspaceReal: string,
  outputRealDir: string,
  rawEntry: string
): string {
  const cleanRel = assertCleanRelativeSegment(rawEntry, 'projects');
  const candidate = path.resolve(workspaceReal, cleanRel);
  assertNoSymlinkBetween(workspaceReal, candidate);
  const realDir = resolveRealTarget(candidate);
  if (!isStrictlyInsidePath(realDir, workspaceReal)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} Proyecto fuera de workspaceRoot: '${rawEntry}'.`
    );
  }
  if (!fs.existsSync(realDir) || !fs.statSync(realDir).isDirectory()) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} Directorio de proyecto inexistente o inválido: '${rawEntry}'.`
    );
  }
  if (isEqualOrInsidePath(outputRealDir, realDir) || isEqualOrInsidePath(realDir, outputRealDir)) {
    throw new WorkspacePathValidationError(
      `${SEC_PATH_TAG} outputDir no puede solaparse con el proyecto fuente '${rawEntry}' (huella cero).`
    );
  }
  return realDir;
}

function resolveRequestedProjectDirs(
  workspaceReal: string,
  outputRealDir: string,
  requestedProjects: readonly string[]
): string[] {
  const resolvedDirs: string[] = [];
  const seen = new Set<string>();
  for (const rawEntry of requestedProjects) {
    const realDir = resolveSingleRequestedProject(workspaceReal, outputRealDir, rawEntry);
    if (!seen.has(realDir)) {
      seen.add(realDir);
      resolvedDirs.push(realDir);
    }
  }
  return resolvedDirs;
}

function autoDiscoverProjectDirs(workspaceReal: string, outputRealDir: string): string[] {
  const discovered: string[] = [];
  const topDirs = listEligibleChildDirs(workspaceReal, outputRealDir);
  for (const dir of topDirs) {
    if (isProjectCandidateDir(dir)) {
      discovered.push(dir);
      continue;
    }
    for (const nested of listEligibleChildDirs(dir, outputRealDir)) {
      if (isProjectCandidateDir(nested)) {
        discovered.push(nested);
      }
    }
  }
  return discovered;
}

export function discoverEcosystemProjects(
  workspaceReal: string,
  outputRealDir: string,
  requestedProjects?: readonly string[]
): DiscoveredProject[] {
  const hasExplicit = Array.isArray(requestedProjects) && requestedProjects.length > 0;
  const projectDirs = hasExplicit
    ? resolveRequestedProjectDirs(workspaceReal, outputRealDir, requestedProjects)
    : autoDiscoverProjectDirs(workspaceReal, outputRealDir);

  for (const projDir of projectDirs) {
    if (isEqualOrInsidePath(outputRealDir, projDir) || isEqualOrInsidePath(projDir, outputRealDir)) {
      throw new WorkspacePathValidationError(
        `${SEC_PATH_TAG} outputDir no puede ubicarse dentro ni contener el proyecto fuente '${toPosixRel(workspaceReal, projDir)}' (huella cero).`
      );
    }
  }

  const usedSlugs = new Set<string>();
  return projectDirs.map((dir) => buildDiscoveredProject(workspaceReal, dir, usedSlugs));
}

interface SourceWalkState {
  readonly projectAbs: string;
  readonly extensions: ReadonlySet<string>;
  readonly includeTests: boolean;
  readonly maxDepth: number;
  readonly out: string[];
}

function shouldSkipDir(dirName: string, includeTests: boolean): boolean {
  if (dirName.startsWith('.') || CANONICAL_IGNORED_DIRS.has(dirName)) {
    return true;
  }
  return !includeTests && TEST_DIR_NAMES.has(dirName.toLowerCase());
}

function recordCandidateSourceEntry(
  entry: fs.Dirent,
  fullPath: string,
  depth: number,
  state: SourceWalkState
): void {
  if (entry.isSymbolicLink()) return;
  if (entry.isDirectory()) {
    if (!shouldSkipDir(entry.name, state.includeTests)) {
      walkSourceTree(fullPath, depth + 1, state);
    }
    return;
  }
  if (!entry.isFile() || !state.extensions.has(path.extname(entry.name).toLowerCase())) {
    return;
  }
  const rel = toPosixRel(state.projectAbs, fullPath);
  if (!state.includeTests && TEST_FILE_SUFFIX_RE.test(rel)) return;
  state.out.push(rel);
}

function walkSourceTree(currentDir: string, depth: number, state: SourceWalkState): void {
  if (depth > state.maxDepth) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err: unknown) {
    reportDebugCatchError(`projectDiscovery.walkSourceTree(${currentDir})`, err);
    return;
  }
  for (const entry of entries) {
    recordCandidateSourceEntry(entry, path.join(currentDir, entry.name), depth, state);
  }
}

export function collectProjectSourceFiles(
  projectAbs: string,
  extensions: ReadonlySet<string>,
  includeTests = false
): string[] {
  const out: string[] = [];
  walkSourceTree(projectAbs, 0, {
    projectAbs,
    extensions,
    includeTests,
    maxDepth: 8,
    out,
  });
  return out.sort((a, b) => a.localeCompare(b));
}
