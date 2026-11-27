// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { GRAPHIFY_DOCKER_IMAGE } from '../blast-radius.js';
import { assertNoSymlinkBetween, collectProjectSourceFiles, toPosixRel } from './projectDiscovery.js';
import {
  GRAPHS_SUBDIR_NAME,
  UTF8_ENCODING,
  type DiscoveredProject,
  type GodModuleMetric,
  type GraphBuildStatus,
  type GraphBuilderCallbackInput,
  type HubNodeMetric,
  type ProjectGraphSummary,
} from './types.js';

const GRAPH_JSON_NAME = 'graph.json';
const GRAPH_REPORT_NAME = 'GRAPH_REPORT.md';
const UNKNOWN_FILE = 'unknown';
const GRAPH_EXTRACT_CMD =
  'graphify extract /src --out /work --code-only --allow-dedup-shrink && graphify cluster-only /work && rm -rf /work/graphify-out/cache /work/graphify-out/20* /work/graphify-out/.graphify_* /work/graphify-out/.cloud-cta-shown';

const GRAPH_TRACKED_EXTS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.vue',
  '.php',
  '.sh',
]);

const STRUCTURAL_RELATIONS: ReadonlySet<string> = new Set([
  'contains',
  'rationale_for',
  'documented_in',
  'defines',
  'declares',
  'method',
]);

const SRC_ROOT_NAMES: ReadonlySet<string> = new Set([
  'src',
  'app',
  'lib',
  'packages',
  'apps',
  'services',
]);

const TEST_DIR_PATH_RE = /(?:^|\/)(?:tests?|__tests__|e2e)\//;
const TEST_FILE_BASENAME_RE = /(?:\.(?:unit|spec|test|e2e)\.[cm]?[jt]sx?$|_test\.py$|Test\.php$)/;

function isTestSourcePath(relPath: string): boolean {
  if (TEST_DIR_PATH_RE.test(relPath) || TEST_FILE_BASENAME_RE.test(relPath)) {
    return true;
  }
  const base = path.posix.basename(relPath);
  return base.startsWith('test_') && base.endsWith('.py');
}

interface RawGraphNode {
  readonly id?: string;
  readonly label?: string;
  readonly source_file?: string;
  readonly community?: number | string;
}

interface RawGraphLink {
  readonly source?: string;
  readonly target?: string;
  readonly relation?: string;
  readonly source_file?: string;
}

interface RawGraphDocument {
  readonly nodes?: readonly RawGraphNode[];
  readonly links?: readonly RawGraphLink[];
}

export interface BuildProjectGraphInput {
  readonly workspaceReal: string;
  readonly outputRealDir: string;
  readonly project: DiscoveredProject;
  readonly buildGraphs: boolean;
  readonly refreshGraphs: boolean;
  readonly execFileFn?: typeof execFile;
  readonly graphBuilderFn?: (input: GraphBuilderCallbackInput) => Promise<{ ok: boolean; error?: string }>;
  readonly signal?: AbortSignal;
}

export function buildZeroFootprintDockerArgs(
  projectAbsPath: string,
  graphOutAbsDir: string
): string[] {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
  return [
    'run',
    '--rm',
    '--restart=no',
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
    `${projectAbsPath}:/src:ro`,
    '-v',
    `${graphOutAbsDir}:/work/graphify-out`,
    '-w',
    '/work',
    GRAPHIFY_DOCKER_IMAGE,
    'sh',
    '-c',
    GRAPH_EXTRACT_CMD,
  ];
}

export async function runZeroFootprintGraphifyDocker(
  input: GraphBuilderCallbackInput,
  execFileFn: typeof execFile = execFile
): Promise<{ ok: boolean; error?: string }> {
  if (input.signal?.aborted) {
    return { ok: false, error: 'Construcción de grafo AST cancelada por AbortSignal.' };
  }
  fs.mkdirSync(input.graphOutAbsDir, { recursive: true });
  const dockerArgs = buildZeroFootprintDockerArgs(input.projectAbsPath, input.graphOutAbsDir);
  const execFileAsync = promisify(execFileFn);
  try {
    await execFileAsync('docker', dockerArgs, {
      cwd: input.graphOutAbsDir,
      timeout: 180_000,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    return { ok: true };
  } catch (err: unknown) {
    reportDebugCatchError(`ecosystemSpecs.graphBuilder(${input.projectAbsPath})`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 240) };
  }
}

function getLatestSourceMtimeMs(projectAbs: string): number {
  let latest = 0;
  for (const rel of collectProjectSourceFiles(projectAbs, GRAPH_TRACKED_EXTS, true)) {
    const stat = fs.statSync(path.join(projectAbs, rel), { throwIfNoEntry: false });
    if (stat && stat.mtimeMs > latest) {
      latest = stat.mtimeMs;
    }
  }
  return latest;
}

function isCachedGraphFresh(projectAbs: string, graphJsonAbs: string): boolean {
  const graphStat = fs.statSync(graphJsonAbs, { throwIfNoEntry: false });
  if (!graphStat?.isFile()) return false;
  return getLatestSourceMtimeMs(projectAbs) <= graphStat.mtimeMs;
}

function normRelPath(raw: string): string {
  const slashed = raw.trim().replace(/\\/g, '/');
  let start = 0;
  while (slashed.startsWith('./', start)) start += 2;
  while (start < slashed.length && slashed[start] === '/') start += 1;
  let end = slashed.length;
  while (end > start && slashed[end - 1] === '/') end -= 1;
  return slashed.slice(start, end);
}

function moduleKeyFromSource(relPath: string): string {
  const parts = normRelPath(relPath).split('/').filter(Boolean);
  if (parts.length <= 1) return '(root)';
  if (SRC_ROOT_NAMES.has(parts[0] ?? '') && parts.length > 2) {
    return parts.slice(0, Math.min(3, parts.length - 1)).join('/');
  }
  if (parts.length > 3 && SRC_ROOT_NAMES.has(parts[1] ?? '')) {
    return parts.slice(0, 3).join('/');
  }
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

function resolveLinkFiles(
  src: string,
  tgt: string,
  linkSourceFile: string | undefined,
  nodeById: ReadonlyMap<string, RawGraphNode>
): readonly [string, string] | null {
  const srcNode = nodeById.get(src);
  const tgtNode = nodeById.get(tgt);
  const srcFile = normRelPath(linkSourceFile ?? srcNode?.source_file ?? '');
  const tgtFile = normRelPath(tgtNode?.source_file ?? '');
  if (!srcFile || !tgtFile || srcFile === UNKNOWN_FILE || tgtFile === UNKNOWN_FILE) {
    return null;
  }
  return [srcFile, tgtFile];
}

function resolveCrossFileDepEdge(
  link: RawGraphLink,
  nodeById: ReadonlyMap<string, RawGraphNode>
): readonly [string, string, string, string] | null {
  const src = link.source ?? '';
  const tgt = link.target ?? '';
  const rel = link.relation ?? '';
  if (!src || !tgt || src === tgt || STRUCTURAL_RELATIONS.has(rel)) {
    return null;
  }
  const files = resolveLinkFiles(src, tgt, link.source_file, nodeById);
  if (!files || files[0] === files[1]) return null;
  if (isTestSourcePath(files[0]) || isTestSourcePath(files[1])) return null;
  return [src, tgt, files[0], files[1]];
}

function canonicalizeCycle(cycle: readonly string[]): string {
  const core = cycle.slice(0, -1);
  let minIdx = 0;
  for (let i = 1; i < core.length; i += 1) {
    if (String(core[i]) < String(core[minIdx])) {
      minIdx = i;
    }
  }
  const rotated = [...core.slice(minIdx), ...core.slice(0, minIdx)];
  return [...rotated, String(rotated[0])].join(' -> ');
}

interface DfsCycleState {
  readonly adj: ReadonlyMap<string, readonly string[]>;
  readonly color: Map<string, number>;
  readonly trail: string[];
  readonly found: Set<string>;
}

function stepDfsNeighbor(
  nextNode: string,
  stack: Array<[string, number]>,
  state: DfsCycleState
): void {
  const clr = state.color.get(nextNode) ?? 0;
  if (clr === 1) {
    const startIdx = state.trail.indexOf(nextNode);
    if (startIdx !== -1) {
      state.found.add(canonicalizeCycle([...state.trail.slice(startIdx), nextNode]));
    }
    return;
  }
  if (clr === 0) {
    state.color.set(nextNode, 1);
    state.trail.push(nextNode);
    stack.push([nextNode, 0]);
  }
}

function dfsFromNode(start: string, state: DfsCycleState): void {
  state.color.set(start, 1);
  state.trail.push(start);
  const stack: Array<[string, number]> = [[start, 0]];
  let top = stack[stack.length - 1];
  while (top) {
    const [node, idx] = top;
    const neighbors = state.adj.get(node) ?? [];
    if (idx >= neighbors.length) {
      stack.pop();
      state.trail.pop();
      state.color.set(node, 2);
    } else {
      top[1] = idx + 1;
      const nextNode = neighbors[idx];
      if (nextNode) stepDfsNeighbor(nextNode, stack, state);
    }
    top = stack[stack.length - 1];
  }
}

function detectDirectedCycles(adj: ReadonlyMap<string, readonly string[]>): string[] {
  const state: DfsCycleState = {
    adj,
    color: new Map<string, number>(),
    trail: [],
    found: new Set<string>(),
  };
  for (const start of Array.from(adj.keys()).sort((a, b) => a.localeCompare(b))) {
    if ((state.color.get(start) ?? 0) === 0) {
      dfsFromNode(start, state);
    }
  }
  return Array.from(state.found).sort((a, b) => a.localeCompare(b));
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function computePercentileAndMedian(
  nodeCounts: ReadonlyMap<string, number>,
  scores: readonly number[]
): { readonly p90: number; readonly medianNodes: number } {
  const sortedScores = [...scores].sort((a, b) => a - b);
  const p90Idx = Math.floor(0.9 * (sortedScores.length - 1));
  const p90 = Number(sortedScores[p90Idx]);
  const sortedNodes = Array.from(nodeCounts.values()).sort((a, b) => a - b);
  const mid = Math.floor(sortedNodes.length / 2);
  const medianNodes =
    sortedNodes.length % 2 === 1
      ? Number(sortedNodes[mid])
      : (Number(sortedNodes[mid - 1]) + Number(sortedNodes[mid])) / 2;
  return { p90, medianNodes };
}

function buildGodModulesList(
  nodeCounts: ReadonlyMap<string, number>,
  fanIn: ReadonlyMap<string, number>,
  fanOut: ReadonlyMap<string, number>
): GodModuleMetric[] {
  const allMods = Array.from(new Set([...nodeCounts.keys(), ...fanIn.keys(), ...fanOut.keys()])).sort(
    (a, b) => a.localeCompare(b)
  );
  if (allMods.length === 0) return [];
  const scores = allMods.map((mod) => (fanIn.get(mod) ?? 0) * (fanOut.get(mod) ?? 0));
  const { p90, medianNodes } = computePercentileAndMedian(nodeCounts, scores);
  const godThreshold = Math.max(p90, 4);
  const rows: GodModuleMetric[] = allMods.map((mod) => {
    const ca = fanIn.get(mod) ?? 0;
    const ce = fanOut.get(mod) ?? 0;
    const nc = nodeCounts.get(mod) ?? 0;
    const total = ca + ce;
    const cs = ca * ce;
    return {
      module: mod,
      nodes_count: nc,
      fan_in: ca,
      fan_out: ce,
      instability: total > 0 ? Math.round((ce / total) * 100) / 100 : 0,
      coupling_score: cs,
      god_module_candidate: cs >= godThreshold && nc >= medianNodes,
    };
  });
  return rows
    .filter((row) => row.god_module_candidate)
    .sort((a, b) => b.coupling_score - a.coupling_score || a.module.localeCompare(b.module));
}

function buildTopHubNodes(
  nodeById: ReadonlyMap<string, RawGraphNode>,
  degreeMap: ReadonlyMap<string, number>
): HubNodeMetric[] {
  const hubs: HubNodeMetric[] = [];
  for (const [id, degree] of degreeMap.entries()) {
    if (degree < 4) continue;
    const node = nodeById.get(id);
    const srcFile = normRelPath(String(node?.source_file ?? ''));
    if (!srcFile || isTestSourcePath(srcFile)) continue;
    hubs.push({
      id,
      label: String(node?.label ?? id),
      source_file: srcFile,
      degree,
    });
  }
  const sorted = [...hubs].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
  return sorted.slice(0, 5);
}

interface ParsedGraphMetrics {
  readonly nodesCount: number;
  readonly linksCount: number;
  readonly communitiesCount: number;
  readonly cycles: readonly string[];
  readonly godModules: readonly GodModuleMetric[];
  readonly topHubNodes: readonly HubNodeMetric[];
}

function emptyGraphMetrics(): ParsedGraphMetrics {
  return {
    nodesCount: 0,
    linksCount: 0,
    communitiesCount: 0,
    cycles: [],
    godModules: [],
    topHubNodes: [],
  };
}

function indexGraphNodesForMetrics(nodes: readonly RawGraphNode[]): {
  readonly nodeById: Map<string, RawGraphNode>;
  readonly nodeCounts: Map<string, number>;
  readonly communities: Set<string>;
} {
  const nodeById = new Map<string, RawGraphNode>();
  const nodeCounts = new Map<string, number>();
  const communities = new Set<string>();
  for (const node of nodes) {
    if (!node.id) continue;
    nodeById.set(node.id, node);
    if (node.community !== undefined) communities.add(String(node.community));
    const sf = normRelPath(String(node.source_file ?? ''));
    if (sf && sf !== UNKNOWN_FILE && !isTestSourcePath(sf)) {
      incrementMap(nodeCounts, moduleKeyFromSource(sf));
    }
  }
  return { nodeById, nodeCounts, communities };
}

function accumulateLinkMetrics(
  links: readonly RawGraphLink[],
  nodeById: ReadonlyMap<string, RawGraphNode>
): {
  readonly adj: Map<string, string[]>;
  readonly fanIn: Map<string, number>;
  readonly fanOut: Map<string, number>;
  readonly degreeMap: Map<string, number>;
} {
  const rawAdj = new Map<string, Set<string>>();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const degreeMap = new Map<string, number>();
  const seenEdges = new Set<string>();
  for (const link of links) {
    const edge = resolveCrossFileDepEdge(link, nodeById);
    if (!edge) continue;
    const [src, tgt, srcFile, tgtFile] = edge;
    const edgeKey = `${src}->${tgt}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    const set = rawAdj.get(src) ?? new Set<string>();
    set.add(tgt);
    rawAdj.set(src, set);
    incrementMap(degreeMap, src);
    incrementMap(degreeMap, tgt);
    const srcMod = moduleKeyFromSource(srcFile);
    const tgtMod = moduleKeyFromSource(tgtFile);
    if (srcMod !== tgtMod) {
      incrementMap(fanOut, srcMod);
      incrementMap(fanIn, tgtMod);
    }
  }
  const adj = new Map<string, string[]>();
  for (const [k, v] of rawAdj.entries()) {
    adj.set(k, Array.from(v).sort((a, b) => a.localeCompare(b)));
  }
  return { adj, fanIn, fanOut, degreeMap };
}

export function analyzeAstGraphFile(graphJsonAbs: string): ParsedGraphMetrics {
  if (!fs.existsSync(graphJsonAbs)) return emptyGraphMetrics();
  try {
    const parsed = JSON.parse(fs.readFileSync(graphJsonAbs, UTF8_ENCODING)) as RawGraphDocument;
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const links = Array.isArray(parsed.links) ? parsed.links : [];
    const { nodeById, nodeCounts, communities } = indexGraphNodesForMetrics(nodes);
    const { adj, fanIn, fanOut, degreeMap } = accumulateLinkMetrics(links, nodeById);
    return {
      nodesCount: nodeById.size,
      linksCount: links.length,
      communitiesCount: communities.size,
      cycles: detectDirectedCycles(adj),
      godModules: buildGodModulesList(nodeCounts, fanIn, fanOut),
      topHubNodes: buildTopHubNodes(nodeById, degreeMap),
    };
  } catch (err: unknown) {
    reportDebugCatchError(`ecosystemSpecs.analyzeAstGraphFile(${graphJsonAbs})`, err);
    return emptyGraphMetrics();
  }
}

async function resolveGraphBuildExecution(
  input: BuildProjectGraphInput,
  graphOutAbsDir: string,
  graphJsonAbs: string
): Promise<{ readonly status: GraphBuildStatus; readonly error?: string }> {
  if (!input.buildGraphs) {
    return { status: 'SKIPPED_BUILD_DISABLED' };
  }
  if (!input.refreshGraphs && isCachedGraphFresh(input.project.absPath, graphJsonAbs)) {
    return { status: 'REUSED_CACHED' };
  }
  const builder =
    input.graphBuilderFn ??
    ((cbInput: GraphBuilderCallbackInput) =>
      runZeroFootprintGraphifyDocker(cbInput, input.execFileFn));
  const outcome = await builder({
    projectAbsPath: input.project.absPath,
    graphOutAbsDir,
    signal: input.signal,
  });
  return outcome.ok ? { status: 'BUILT' } : { status: 'FAILED', error: outcome.error };
}

export async function buildAndAnalyzeProjectGraph(
  input: BuildProjectGraphInput
): Promise<ProjectGraphSummary> {
  const graphOutAbsDir = path.join(input.outputRealDir, GRAPHS_SUBDIR_NAME, input.project.slug);
  assertNoSymlinkBetween(input.workspaceReal, graphOutAbsDir);
  const graphJsonAbs = path.join(graphOutAbsDir, GRAPH_JSON_NAME);
  const graphReportAbs = path.join(graphOutAbsDir, GRAPH_REPORT_NAME);

  const buildResult = await resolveGraphBuildExecution(input, graphOutAbsDir, graphJsonAbs);
  const graphExists = fs.existsSync(graphJsonAbs);
  const reportExists = fs.existsSync(graphReportAbs);
  const metrics = graphExists ? analyzeAstGraphFile(graphJsonAbs) : emptyGraphMetrics();

  return {
    status: buildResult.status,
    graph_dir_rel: toPosixRel(input.workspaceReal, graphOutAbsDir),
    graph_json_rel: toPosixRel(input.workspaceReal, graphJsonAbs),
    graph_report_rel: toPosixRel(input.workspaceReal, graphReportAbs),
    graph_exists: graphExists,
    report_exists: reportExists,
    nodes_count: metrics.nodesCount,
    links_count: metrics.linksCount,
    communities_count: metrics.communitiesCount,
    cycles: metrics.cycles,
    god_modules: metrics.godModules,
    top_hub_nodes: metrics.topHubNodes,
    ...(buildResult.error ? { error: buildResult.error } : {}),
  };
}
