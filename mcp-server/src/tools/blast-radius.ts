// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BlastRadiusResult } from '../types.js';

export interface BlastRadiusOptions {
  autoBuildIfMissing?: boolean;
  refreshGraph?: boolean;
  graphBuilder?: (projectPath: string) => boolean;
}

export function defaultGraphifyBuilder(resolvedPath: string): boolean {
  const scriptPath = path.join(resolvedPath, 'scripts', 'actualizar-grafos-graphify.sh');
  try {
    if (fs.existsSync(scriptPath)) {
      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
      if (!scriptContent.includes('# SPDX-License-Identifier: MIT')) {
        return false;
      }
      execFileSync('bash', [scriptPath], {
        cwd: resolvedPath,
        stdio: 'pipe',
        timeout: 120000,
      });
      return true;
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-e',
        'OLLAMA_BASE_URL=',
        '-v',
        `${resolvedPath}:/app`,
        '-w',
        '/app',
        'sinfallas/remote-graphify:latest',
        'sh',
        '-c',
        `graphify extract . --code-only && graphify cluster-only . && rm -rf graphify-out/cache graphify-out/20* graphify-out/.graphify_* graphify-out/.cloud-cta-shown && chown -R ${uid}:${gid} graphify-out`,
      ],
      {
        cwd: resolvedPath,
        stdio: 'pipe',
        timeout: 120000,
      }
    );
    return true;
  } catch {
    return false;
  }
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', '.cache']);
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
]);

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

interface GraphScanContext {
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

function calculateRiskLevel(count: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (count > 10) return 'CRITICAL';
  if (count >= 7) return 'HIGH';
  if (count >= 5) return 'MEDIUM';
  return 'LOW';
}

function registerSuggestedTest(rel: string, ext: string, suggestedTests: Set<string>): void {
  const norm = normalizeRelativePath(rel);
  if (
    norm.includes('.unit.') ||
    norm.includes('.spec.') ||
    norm.includes('.e2e.') ||
    norm.endsWith('.feature') ||
    norm.endsWith('.bats')
  ) {
    suggestedTests.add(norm);
  } else {
    const baseName = path.basename(norm, ext);
    suggestedTests.add(`tests/**/${baseName}.unit.*`);
  }
}

function processCandidateFile(
  fullPath: string,
  rel: string,
  ext: string,
  cleanSymbol: string,
  dependentFiles: Set<string>,
  suggestedTests: Set<string>
): void {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const safePattern = escapeRegex(cleanSymbol);
    // eslint-disable-next-line security/detect-non-literal-regexp
    const symbolRegex = new RegExp(`\\b${safePattern}\\b`);
    if (symbolRegex.test(content)) {
      const norm = normalizeRelativePath(rel);
      dependentFiles.add(norm);
      registerSuggestedTest(norm, ext, suggestedTests);
    }
  } catch {
    // Ignorar archivos ilegibles
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
  // eslint-disable-next-line security/detect-non-literal-regexp
  const wordRegex = new RegExp(`\\b${escapeRegex(queryLower)}\\b`);
  for (const node of nodes) {
    if (!node.id) continue;
    nodeById.set(node.id, node);
    if (isMatchingGraphNode(node, queryLower, wordRegex)) {
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
  } catch {
    // Ignorar grafos corruptos o ilegibles
  }
}

function scanDirectory(dir: string, rootPath: string, ctx: GraphScanContext): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, rootPath, ctx);
    } else if (entry.isFile()) {
      const rel = normalizeRelativePath(path.relative(rootPath, fullPath));
      if (entry.name === 'graph.json') {
        ctx.graphFiles.push(rel);
        collectGraphCallers(fullPath, ctx);
        continue;
      }
      if (entry.name === 'GRAPH_REPORT.md') {
        ctx.graphReports.push(rel);
        continue;
      }
      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.has(ext)) {
        processCandidateFile(
          fullPath,
          rel,
          ext,
          ctx.cleanSymbol,
          ctx.dependentFiles,
          ctx.suggestedTests
        );
      }
    }
  }
}

export async function inspectAstBlastRadius(
  projectPathInput: string,
  targetSymbol: string,
  maxItems?: number,
  options?: BlastRadiusOptions
): Promise<BlastRadiusResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio no existe: ${resolvedPath}`);
  }

  const builder = options?.graphBuilder ?? defaultGraphifyBuilder;
  let astGraphRebuilt = false;

  if (options?.refreshGraph) {
    astGraphRebuilt = builder(resolvedPath);
  }

  const ctx: GraphScanContext = {
    cleanSymbol: targetSymbol.trim(),
    dependentFiles: new Set<string>(),
    suggestedTests: new Set<string>(),
    graphFiles: [],
    graphReports: [],
    declaringFiles: new Set<string>(),
    declaringLocations: new Set<string>(),
    outgoingDependencies: new Set<string>(),
  };

  scanDirectory(resolvedPath, resolvedPath, ctx);

  if (ctx.graphFiles.length === 0 && options?.autoBuildIfMissing && !astGraphRebuilt) {
    astGraphRebuilt = builder(resolvedPath);
    if (astGraphRebuilt) {
      scanDirectory(resolvedPath, resolvedPath, ctx);
    }
  }

  for (const declFile of ctx.declaringFiles) {
    ctx.dependentFiles.delete(declFile);
  }

  const sortedDependents = Array.from(ctx.dependentFiles).sort();
  const count = sortedDependents.length;
  const riskLevel = calculateRiskLevel(count);
  const astGraphDetected = ctx.graphFiles.length > 0;
  const astGraphActionRequired = astGraphDetected
    ? "✅ Grafo AST detectado. DIRECTRIZ OBLIGATORIA: SIEMPRE debes actualizar el grafo al terminar los cambios ejecutando './scripts/actualizar-grafos-graphify.sh'."
    : "⚠️ No se detectó grafo AST (graphify-out/graph.json). DIRECTRIZ OBLIGATORIA: Si el grafo no existe debes crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' (más información en qa-testing-blueprints) y SIEMPRE debes actualizar el grafo al terminar los cambios.";

  let returnedDependents = sortedDependents;
  let returnedSuggestedTests = Array.from(ctx.suggestedTests).sort();
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
    declaring_files: Array.from(ctx.declaringLocations).sort(),
    outgoing_dependencies: Array.from(ctx.outgoingDependencies).sort(),
    graph_reports: ctx.graphReports.sort(),
    ast_graph_detected: astGraphDetected,
    ...(astGraphRebuilt ? { ast_graph_rebuilt: true } : {}),
    ast_graph_files: ctx.graphFiles.sort(),
    ast_graph_action_required: astGraphActionRequired,
  };
}
