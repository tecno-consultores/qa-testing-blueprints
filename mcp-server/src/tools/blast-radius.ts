// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { BlastRadiusResult, BlastRiskLevel, DiffBundleReport } from '../types.js';
import { buildSemanticDiffBundle } from '../utils/diff-bundle.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../utils/ignoredDirs.js';

export const GRAPHIFY_DOCKER_IMAGE =
  'sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0';

export interface GraphifyBuilderOptions {
  execFileFn?: typeof execFile;
  signal?: AbortSignal;
}

export interface BlastRadiusOptions {
  autoBuildIfMissing?: boolean;
  refreshGraph?: boolean;
  graphBuilder?: (projectPath: string, signal?: AbortSignal) => boolean | Promise<boolean>;
  changedSinceRef?: string;
  maxTokensBudget?: number;
  signal?: AbortSignal;
}

function resolveBuilderArgs(
  execFileFnOrOptions?: typeof execFile | GraphifyBuilderOptions,
  signalArg?: AbortSignal
): { executor: typeof execFile; signal?: AbortSignal } {
  if (typeof execFileFnOrOptions === 'function') {
    return { executor: execFileFnOrOptions, signal: signalArg };
  }
  return {
    executor: execFileFnOrOptions?.execFileFn ?? execFile,
    signal: execFileFnOrOptions?.signal ?? signalArg,
  };
}

export async function defaultGraphifyBuilder(
  resolvedPath: string,
  execFileFnOrOptions?: typeof execFile | GraphifyBuilderOptions,
  signalArg?: AbortSignal
): Promise<boolean> {
  const { executor, signal } = resolveBuilderArgs(execFileFnOrOptions, signalArg);
  if (signal?.aborted) {
    return false;
  }
  try {
    const safePath = resolveSafeProjectPath(resolvedPath, { allowNonExistentLeaf: false });
    const graphOutDir = path.join(safePath, 'graphify-out');
    fs.mkdirSync(graphOutDir, { recursive: true });
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
    const execFileAsync = promisify(executor);
    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--security-opt=no-new-privileges:true',
        '--cap-drop=ALL',
        '-u',
        `${uid}:${gid}`,
        '-e',
        'HOME=/tmp',
        '-e',
        'OLLAMA_BASE_URL=',
        '-v',
        `${safePath}:/app:ro`,
        '-v',
        `${graphOutDir}:/app/graphify-out`,
        '-w',
        '/app',
        GRAPHIFY_DOCKER_IMAGE,
        'sh',
        '-c',
        'graphify extract . --code-only && graphify cluster-only . && rm -rf graphify-out/cache graphify-out/20* graphify-out/.graphify_* graphify-out/.cloud-cta-shown',
      ],
      {
        cwd: safePath,
        timeout: 120000,
        ...(signal ? { signal } : {}),
      }
    );
    return true;
  } catch (err: unknown) {
    // Ephemeral Graphify Docker rebuild failed/unavailable; caller records ast_graph_rebuilt=false
    reportDebugCatchError('blastRadius.defaultGraphifyBuilder', err);
    return false;
  }
}

const GRAPHIFY_DIR_NAME = 'graphify-out';
const IGNORED_DIRS = CANONICAL_IGNORED_DIRS;
const MODERATE_BLAST_CALLERS_THRESHOLD = 5;
const HIGH_BLAST_CALLERS_THRESHOLD = 15;
const CRITICAL_BLAST_CALLERS_THRESHOLD = 25;
const SECURITY_BLAST_KEYWORDS = [
  'vault',
  'auth',
  'token',
  'rls',
  'security',
  'csrf',
  'secret',
  'session',
  'rbac',
] as const;
const VALID_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.py',
  '.vue',
  '.tsx',
  '.jsx',
  '.php',
  '.sh',
  '.bats',
  '.feature',
]);

const EXISTING_TEST_FILE_RE = /(\.(unit|spec|test|e2e)\.|(^|\/)test_[^/]+\.py$|\.(feature|bats)$)/;
const QA_TEST_SYNC_REMINDER =
  ' QA-TEST-SYNC-01: audita, actualiza y re-ejecuta todas las pruebas preexistentes afectadas (suggested_tests_to_run / *.feature / *.bats).';

interface GraphNode {
  id?: string;
  label?: string;
  source_file?: string;
  source_location?: string;
}

interface GraphLink {
  source?: string;
  target?: string;
  relation?: string;
  source_file?: string;
  source_location?: string;
}

export interface GraphScanContext {
  cleanSymbol: string;
  dependentFiles: Set<string>;
  suggestedTests: Set<string>;
  graphFiles: string[];
  graphReports: string[];
  declaringFiles: Set<string>;
  declaringLocations: Set<string>;
  outgoingDependencies: Set<string>;
}

interface GraphData {
  nodes?: GraphNode[];
  links?: GraphLink[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRelativePath(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

const RISK_ORDER: Record<BlastRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function hasSecurityBlastKeyword(symbol: string): boolean {
  const lower = symbol.toLowerCase();
  return SECURITY_BLAST_KEYWORDS.some((kw) => lower.includes(kw));
}

function calculateRiskLevel(count: number, targetSymbol = ''): BlastRiskLevel {
  const isSecuritySensitive = targetSymbol.length > 0 && hasSecurityBlastKeyword(targetSymbol);
  if (
    count >= CRITICAL_BLAST_CALLERS_THRESHOLD ||
    (isSecuritySensitive && count >= HIGH_BLAST_CALLERS_THRESHOLD)
  ) {
    return 'CRITICAL';
  }
  if (count >= HIGH_BLAST_CALLERS_THRESHOLD || isSecuritySensitive) {
    return 'HIGH';
  }
  if (count >= MODERATE_BLAST_CALLERS_THRESHOLD) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function elevateRiskWithDiff(
  baseRisk: BlastRiskLevel,
  diffBundle: DiffBundleReport
): BlastRiskLevel {
  let target: BlastRiskLevel = baseRisk;
  if (diffBundle.secret_leak_warning || diffBundle.alerts.some((a) => a.severity === 'HIGH')) {
    target = 'HIGH';
  } else if (diffBundle.tiers_summary.CRITICAL_FULL > 0 || diffBundle.alerts.length > 0) {
    target = 'MEDIUM';
  }
  return RISK_ORDER[baseRisk] >= RISK_ORDER[target] ? baseRisk : target;
}

function mergeDiffBundleDependents(diffBundle: DiffBundleReport, ctx: GraphScanContext): void {
  for (const diffFile of diffBundle.files) {
    for (const dep of diffFile.ast_dependents) {
      ctx.dependentFiles.add(dep);
      registerSuggestedTest(dep, path.extname(dep), ctx.suggestedTests);
    }
  }
}

function registerSuggestedTest(rel: string, ext: string, suggestedTests: Set<string>): void {
  const norm = normalizeRelativePath(rel);
  if (EXISTING_TEST_FILE_RE.test(norm)) {
    suggestedTests.add(norm);
  } else {
    const baseName = path.basename(norm, ext);
    suggestedTests.add(`tests/**/${baseName}.unit.*`);
  }
}

export interface CandidateScanInput {
  readonly fullPath: string;
  readonly rel: string;
  readonly ext: string;
  readonly ctx: GraphScanContext;
}

export function processCandidateFile(input: CandidateScanInput): void {
  const { fullPath, rel, ext, ctx } = input;
  if (!/\w/.test(ctx.cleanSymbol)) return;
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const safePattern = escapeRegex(ctx.cleanSymbol);
    // eslint-disable-next-line security/detect-non-literal-regexp
    const symbolRegex = new RegExp(`\\b${safePattern}\\b`);
    if (symbolRegex.test(content)) {
      const norm = normalizeRelativePath(rel);
      ctx.dependentFiles.add(norm);
      registerSuggestedTest(norm, ext, ctx.suggestedTests);
    }
  } catch (err: unknown) {
    // Unreadable candidate file (e.g. broken symlink or chmod 000) is skipped during grep fallback scan
    reportDebugCatchError(`blastRadius.processCandidateFile(${rel})`, err);
  }
}

function isMatchingGraphNode(node: GraphNode, queryLower: string, wordRegex: RegExp): boolean {
  const label = (node.label ?? '').toLowerCase();
  const id = (node.id ?? '').toLowerCase();
  const srcFile = (node.source_file ?? '').toLowerCase();
  return (
    label === queryLower ||
    id === queryLower ||
    wordRegex.test(label) ||
    wordRegex.test(srcFile)
  );
}

function indexGraphNodes(
  nodes: GraphNode[],
  queryLower: string,
  declaringFiles: Set<string>,
  declaringLocations: Set<string>
): { matchedIds: Set<string>; nodeById: Map<string, GraphNode> } {
  const matchedIds = new Set<string>();
  const nodeById = new Map<string, GraphNode>();
  const wordRegex = /\w/.test(queryLower)
    ? // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(`\\b${escapeRegex(queryLower)}\\b`)
    : null;
  for (const node of nodes) {
    if (!node.id) continue;
    nodeById.set(node.id, node);
    if (wordRegex && isMatchingGraphNode(node, queryLower, wordRegex)) {
      matchedIds.add(node.id);
      if (node.source_file) {
        const norm = normalizeRelativePath(node.source_file);
        declaringFiles.add(norm);
        declaringLocations.add(node.source_location ? `${norm}:${node.source_location}` : norm);
      }
    }
  }
  return { matchedIds, nodeById };
}

function resolveLinkCallerFile(
  link: GraphLink,
  matchedIds: Set<string>,
  nodeById: Map<string, GraphNode>
): string | undefined {
  if (!link.target || !matchedIds.has(link.target)) return undefined;
  const srcNode = link.source ? nodeById.get(link.source) : undefined;
  return link.source_file ?? srcNode?.source_file;
}

function resolveLinkOutgoingTarget(
  link: GraphLink,
  matchedIds: Set<string>,
  nodeById: Map<string, GraphNode>
): string | undefined {
  if (!link.source || !matchedIds.has(link.source) || link.relation === 'contains') {
    return undefined;
  }
  const tgtNode = link.target ? nodeById.get(link.target) : undefined;
  if (!tgtNode) return undefined;
  const tgtFile = tgtNode.source_file ? normalizeRelativePath(tgtNode.source_file) : undefined;
  const tgtLabel = tgtNode.label ?? link.target;
  return tgtFile ? `${tgtFile}:${tgtLabel}` : tgtLabel;
}

function collectGraphCallers(graphFilePath: string, ctx: GraphScanContext): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(graphFilePath, 'utf-8')) as GraphData;
    const { matchedIds, nodeById } = indexGraphNodes(
      parsed.nodes ?? [],
      ctx.cleanSymbol.toLowerCase(),
      ctx.declaringFiles,
      ctx.declaringLocations
    );

    for (const link of parsed.links ?? []) {
      const callerFile = resolveLinkCallerFile(link, matchedIds, nodeById);
      if (callerFile) {
        const norm = normalizeRelativePath(callerFile);
        ctx.dependentFiles.add(norm);
        registerSuggestedTest(norm, path.extname(norm), ctx.suggestedTests);
      }
      const outgoing = resolveLinkOutgoingTarget(link, matchedIds, nodeById);
      if (outgoing) {
        ctx.outgoingDependencies.add(outgoing);
      }
    }
  } catch (err: unknown) {
    // Corrupt or unreadable graph.json falls back cleanly to regex scan + ast_graph_action_required guidance
    reportDebugCatchError(`blastRadius.collectGraphCallers(${graphFilePath})`, err);
  }
}

interface CandidateFileEntry {
  readonly fullPath: string;
  readonly rel: string;
  readonly ext: string;
}

interface DirectoryInventory {
  readonly candidateFiles: CandidateFileEntry[];
  readonly graphJsonFiles: Array<{ readonly fullPath: string; readonly rel: string }>;
  readonly graphReports: string[];
}

function recordGraphifyDirArtifacts(
  graphDir: string,
  rootPath: string,
  inventory: DirectoryInventory
): void {
  const graphPath = path.join(graphDir, 'graph.json');
  if (fs.existsSync(graphPath) && fs.statSync(graphPath).isFile()) {
    inventory.graphJsonFiles.push({
      fullPath: graphPath,
      rel: normalizeRelativePath(path.relative(rootPath, graphPath)),
    });
  }
  const reportPath = path.join(graphDir, 'GRAPH_REPORT.md');
  if (fs.existsSync(reportPath) && fs.statSync(reportPath).isFile()) {
    inventory.graphReports.push(normalizeRelativePath(path.relative(rootPath, reportPath)));
  }
}

function recordFileEntry(
  entryName: string,
  fullPath: string,
  rootPath: string,
  inventory: DirectoryInventory
): void {
  const rel = normalizeRelativePath(path.relative(rootPath, fullPath));
  if (entryName === 'graph.json') {
    inventory.graphJsonFiles.push({ fullPath, rel });
    return;
  }
  if (entryName === 'GRAPH_REPORT.md') {
    inventory.graphReports.push(rel);
    return;
  }
  const ext = path.extname(entryName);
  if (VALID_EXTENSIONS.has(ext)) {
    inventory.candidateFiles.push({ fullPath, rel, ext });
  }
}

function collectDirectoryInventory(
  dir: string,
  rootPath: string,
  inventory: DirectoryInventory
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name === GRAPHIFY_DIR_NAME) {
      recordGraphifyDirArtifacts(fullPath, rootPath, inventory);
      continue;
    }
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      collectDirectoryInventory(fullPath, rootPath, inventory);
    } else if (entry.isFile()) {
      recordFileEntry(entry.name, fullPath, rootPath, inventory);
    }
  }
}

function runGraphAndConditionalRegexScan(resolvedPath: string, ctx: GraphScanContext): void {
  const inventory: DirectoryInventory = {
    candidateFiles: [],
    graphJsonFiles: [],
    graphReports: [],
  };
  collectDirectoryInventory(resolvedPath, resolvedPath, inventory);
  ctx.graphFiles.length = 0;
  ctx.graphReports.length = 0;
  ctx.graphReports.push(...inventory.graphReports);

  for (const graphEntry of inventory.graphJsonFiles) {
    ctx.graphFiles.push(graphEntry.rel);
    collectGraphCallers(graphEntry.fullPath, ctx);
  }

  for (const declFile of ctx.declaringFiles) {
    ctx.dependentFiles.delete(declFile);
  }

  if (!/\w/.test(ctx.cleanSymbol) || ctx.dependentFiles.size > 0) {
    return;
  }

  for (const candidate of inventory.candidateFiles) {
    processCandidateFile({ ...candidate, ctx });
  }
}

interface BuildBlastResultInput {
  readonly resolvedPath: string;
  readonly ctx: GraphScanContext;
  readonly diffBundle: DiffBundleReport | undefined;
  readonly astGraphRebuilt: boolean;
  readonly maxItems?: number;
}

function buildBlastRadiusResult(input: BuildBlastResultInput): BlastRadiusResult {
  const { resolvedPath, ctx, diffBundle, astGraphRebuilt, maxItems } = input;
  for (const declFile of ctx.declaringFiles) {
    ctx.dependentFiles.delete(declFile);
  }

  const sortedDependents = Array.from(ctx.dependentFiles).sort((a, b) => a.localeCompare(b));
  const count = sortedDependents.length;
  const baseRiskLevel = calculateRiskLevel(count, ctx.cleanSymbol);
  const riskLevel = diffBundle ? elevateRiskWithDiff(baseRiskLevel, diffBundle) : baseRiskLevel;
  const astGraphDetected = ctx.graphFiles.length > 0;
  const astGraphActionRequired = astGraphDetected
    ? `✅ Grafo AST detectado. DIRECTRIZ OBLIGATORIA: SIEMPRE debes actualizar el grafo al terminar los cambios ejecutando './scripts/actualizar-grafos-graphify.sh'.${QA_TEST_SYNC_REMINDER}`
    : `⚠️ No se detectó grafo AST (graphify-out/graph.json). DIRECTRIZ OBLIGATORIA: Si el grafo no existe debes crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' (más información en qa-testing-blueprints) y SIEMPRE debes actualizar el grafo al terminar los cambios.${QA_TEST_SYNC_REMINDER}`;

  let returnedDependents = sortedDependents;
  let returnedSuggestedTests = Array.from(ctx.suggestedTests).sort((a, b) => a.localeCompare(b));
  let truncatedDependentsCount: number | undefined;

  if (typeof maxItems === 'number' && maxItems > 0 && count > maxItems) {
    returnedDependents = sortedDependents.slice(0, maxItems);
    returnedSuggestedTests = returnedSuggestedTests.slice(0, maxItems);
    truncatedDependentsCount = count - maxItems;
  }

  return {
    project_path: resolvedPath,
    target_symbol: ctx.cleanSymbol,
    risk_level: riskLevel,
    dependent_files_count: count,
    dependent_files: returnedDependents,
    truncated_dependents_count: truncatedDependentsCount,
    suggested_tests_to_run: returnedSuggestedTests,
    declaring_files: Array.from(ctx.declaringLocations).sort((a, b) => a.localeCompare(b)),
    outgoing_dependencies: Array.from(ctx.outgoingDependencies).sort((a, b) => a.localeCompare(b)),
    graph_reports: [...ctx.graphReports].sort((a, b) => a.localeCompare(b)),
    ast_graph_detected: astGraphDetected,
    ...(astGraphRebuilt ? { ast_graph_rebuilt: true } : {}),
    ast_graph_files: [...ctx.graphFiles].sort((a, b) => a.localeCompare(b)),
    ast_graph_action_required: astGraphActionRequired,
    ...(diffBundle ? { diff_bundle: diffBundle } : {}),
  };
}

export async function inspectAstBlastRadius(
  projectPathInput: string,
  targetSymbol = '',
  maxItems?: number,
  options?: BlastRadiusOptions
): Promise<BlastRadiusResult> {
  const resolvedPath = resolveSafeProjectPath(projectPathInput);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio no existe: ${resolvedPath}`);
  }

  const cleanSymbol = targetSymbol.trim();
  if (!cleanSymbol && options?.changedSinceRef === undefined) {
    throw new Error('Se requiere target_symbol (o changed_since_ref para análisis diferencial).');
  }

  const builder = options?.graphBuilder ?? defaultGraphifyBuilder;
  let astGraphRebuilt = options?.refreshGraph ? await builder(resolvedPath, options.signal) : false;

  const ctx: GraphScanContext = {
    cleanSymbol,
    dependentFiles: new Set<string>(),
    suggestedTests: new Set<string>(),
    graphFiles: [],
    graphReports: [],
    declaringFiles: new Set<string>(),
    declaringLocations: new Set<string>(),
    outgoingDependencies: new Set<string>(),
  };

  runGraphAndConditionalRegexScan(resolvedPath, ctx);

  if (ctx.graphFiles.length === 0 && options?.autoBuildIfMissing && !astGraphRebuilt) {
    astGraphRebuilt = await builder(resolvedPath, options?.signal);
    if (astGraphRebuilt) {
      runGraphAndConditionalRegexScan(resolvedPath, ctx);
    }
  }

  let diffBundle: DiffBundleReport | undefined;
  if (options?.changedSinceRef !== undefined) {
    diffBundle = await buildSemanticDiffBundle(
      resolvedPath,
      options.changedSinceRef,
      options.maxTokensBudget
    );
    mergeDiffBundleDependents(diffBundle, ctx);
  }

  return buildBlastRadiusResult({
    resolvedPath,
    ctx,
    diffBundle,
    astGraphRebuilt,
    maxItems,
  });
}
