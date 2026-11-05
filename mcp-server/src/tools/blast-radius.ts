// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BlastRadiusResult } from '../types.js';

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
}

interface GraphLink {
  source?: string;
  target?: string;
  source_file?: string;
}

interface GraphData {
  nodes?: GraphNode[];
  links?: GraphLink[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calculateRiskLevel(count: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (count > 10) return 'CRITICAL';
  if (count >= 6) return 'HIGH';
  if (count >= 3) return 'MEDIUM';
  return 'LOW';
}

function registerSuggestedTest(rel: string, ext: string, suggestedTests: Set<string>): void {
  if (
    rel.includes('.unit.') ||
    rel.includes('.spec.') ||
    rel.includes('.e2e.') ||
    rel.endsWith('.feature') ||
    rel.endsWith('.bats')
  ) {
    suggestedTests.add(rel);
  } else {
    const baseName = path.basename(rel, ext);
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
      dependentFiles.add(rel);
      registerSuggestedTest(rel, ext, suggestedTests);
    }
  } catch {
    // Ignorar archivos ilegibles
  }
}

function isMatchingGraphNode(node: GraphNode, queryLower: string): boolean {
  const label = (node.label ?? '').toLowerCase();
  const id = (node.id ?? '').toLowerCase();
  const srcFile = (node.source_file ?? '').toLowerCase();
  return (
    label === queryLower ||
    id === queryLower ||
    label.includes(queryLower) ||
    srcFile.includes(queryLower)
  );
}

function indexGraphNodes(
  nodes: GraphNode[],
  queryLower: string
): { matchedIds: Set<string>; nodeById: Map<string, GraphNode> } {
  const matchedIds = new Set<string>();
  const nodeById = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!node.id) continue;
    nodeById.set(node.id, node);
    if (isMatchingGraphNode(node, queryLower)) {
      matchedIds.add(node.id);
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

function collectGraphCallers(
  graphFilePath: string,
  cleanSymbol: string,
  dependentFiles: Set<string>,
  suggestedTests: Set<string>
): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(graphFilePath, 'utf-8')) as GraphData;
    const { matchedIds, nodeById } = indexGraphNodes(
      parsed.nodes ?? [],
      cleanSymbol.toLowerCase()
    );

    for (const link of parsed.links ?? []) {
      const callerFile = resolveLinkCallerFile(link, matchedIds, nodeById);
      if (callerFile) {
        dependentFiles.add(callerFile);
        registerSuggestedTest(callerFile, path.extname(callerFile), suggestedTests);
      }
    }
  } catch {
    // Ignorar grafos corruptos o ilegibles
  }
}

function scanDirectory(
  dir: string,
  rootPath: string,
  cleanSymbol: string,
  dependentFiles: Set<string>,
  suggestedTests: Set<string>,
  graphFiles: string[]
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, rootPath, cleanSymbol, dependentFiles, suggestedTests, graphFiles);
    } else if (entry.isFile()) {
      const rel = path.relative(rootPath, fullPath);
      if (entry.name === 'graph.json') {
        graphFiles.push(rel);
        collectGraphCallers(fullPath, cleanSymbol, dependentFiles, suggestedTests);
        continue;
      }
      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.has(ext)) {
        processCandidateFile(fullPath, rel, ext, cleanSymbol, dependentFiles, suggestedTests);
      }
    }
  }
}

export async function inspectAstBlastRadius(
  projectPathInput: string,
  targetSymbol: string
): Promise<BlastRadiusResult> {
  const resolvedPath = path.resolve(projectPathInput.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio no existe: ${resolvedPath}`);
  }

  const cleanSymbol = targetSymbol.trim();
  const dependentFiles = new Set<string>();
  const suggestedTests = new Set<string>();
  const graphFiles: string[] = [];

  scanDirectory(resolvedPath, resolvedPath, cleanSymbol, dependentFiles, suggestedTests, graphFiles);

  const sortedDependents = Array.from(dependentFiles).sort();
  const count = sortedDependents.length;
  const riskLevel = calculateRiskLevel(count);
  const astGraphDetected = graphFiles.length > 0;
  const astGraphActionRequired = astGraphDetected
    ? "✅ Grafo AST detectado. DIRECTRIZ OBLIGATORIA: SIEMPRE debes actualizar el grafo al terminar los cambios ejecutando './scripts/actualizar-grafos-graphify.sh'."
    : "⚠️ No se detectó grafo AST (graphify-out/graph.json). DIRECTRIZ OBLIGATORIA: Si el grafo no existe debes crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' (más información en qa-testing-blueprints) y SIEMPRE debes actualizar el grafo al terminar los cambios.";

  return {
    project_path: resolvedPath,
    target_symbol: cleanSymbol,
    risk_level: riskLevel,
    dependent_files_count: count,
    dependent_files: sortedDependents,
    suggested_tests_to_run: Array.from(suggestedTests).sort(),
    ast_graph_detected: astGraphDetected,
    ast_graph_files: graphFiles.sort(),
    ast_graph_action_required: astGraphActionRequired,
  };
}
