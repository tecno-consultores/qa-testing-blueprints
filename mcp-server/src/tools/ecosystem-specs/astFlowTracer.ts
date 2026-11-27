// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { isSafeRegularFile } from './projectDiscovery.js';
import {
  UTF8_ENCODING,
  type FunctionalFlowTrace,
  type IntegrationEdge,
  type ProjectAnalysisRecord,
} from './types.js';

const MAX_FLOWS_TRACED = 50;
const MAX_HOPS = 4;

interface FileAdjacency {
  readonly forward: Map<string, Set<string>>;
  readonly reverse: Map<string, Set<string>>;
}

interface RawGraphMini {
  readonly nodes?: ReadonlyArray<{ readonly id?: string; readonly source_file?: string }>;
  readonly links?: ReadonlyArray<{ readonly source?: string; readonly target?: string; readonly source_file?: string }>;
}

interface FlowTraceContext {
  readonly workspaceReal: string;
  readonly bySlug: ReadonlyMap<string, ProjectAnalysisRecord>;
  readonly adjCache: Map<string, FileAdjacency>;
}

function normFile(raw: string): string {
  return raw.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function addAdjacencyPair(adj: FileAdjacency, sf: string, tf: string): void {
  const fwd = adj.forward.get(sf) ?? new Set<string>();
  fwd.add(tf);
  adj.forward.set(sf, fwd);
  const rev = adj.reverse.get(tf) ?? new Set<string>();
  rev.add(sf);
  adj.reverse.set(tf, rev);
}

function populateAdjacencyFromGraph(parsed: RawGraphMini, adj: FileAdjacency): void {
  const nodeFile = new Map<string, string>();
  for (const n of parsed.nodes ?? []) {
    if (n.id && n.source_file) nodeFile.set(n.id, normFile(n.source_file));
  }
  for (const l of parsed.links ?? []) {
    const sf = normFile(l.source_file ?? (l.source ? nodeFile.get(l.source) ?? '' : ''));
    const tf = l.target ? nodeFile.get(l.target) ?? '' : '';
    if (sf && tf && sf !== tf) {
      addAdjacencyPair(adj, sf, tf);
    }
  }
}

function loadProjectFileAdjacency(workspaceReal: string, graphJsonRel: string): FileAdjacency {
  const adj: FileAdjacency = { forward: new Map(), reverse: new Map() };
  const full = path.join(workspaceReal, graphJsonRel);
  if (!isSafeRegularFile(full)) return adj;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, UTF8_ENCODING)) as RawGraphMini;
    populateAdjacencyFromGraph(parsed, adj);
  } catch (err: unknown) {
    reportDebugCatchError(`astFlowTracer.loadProjectFileAdjacency(${graphJsonRel})`, err);
  }
  return adj;
}

function getCachedProjectAdj(ctx: FlowTraceContext, proj: ProjectAnalysisRecord): FileAdjacency {
  let cached = ctx.adjCache.get(proj.slug);
  if (!cached) {
    cached = proj.graph.graph_exists
      ? loadProjectFileAdjacency(ctx.workspaceReal, proj.graph.graph_json_rel)
      : { forward: new Map(), reverse: new Map() };
    ctx.adjCache.set(proj.slug, cached);
  }
  return cached;
}

function bfsReachableFiles(startFile: string, adj: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const visited = new Set<string>([startFile]);
  const queue: Array<readonly [string, number]> = [[startFile, 0]];
  const discovered: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (!current || current[1] >= MAX_HOPS) continue;
    const neighbors = adj.get(current[0]);
    if (!neighbors) continue;
    for (const next of Array.from(neighbors).sort((a, b) => a.localeCompare(b))) {
      if (visited.has(next)) continue;
      visited.add(next);
      discovered.push(next);
      queue.push([next, current[1] + 1]);
    }
  }
  return discovered;
}

function stripSlugAndLine(loc: string, slug: string): string {
  const prefix = `${slug}/`;
  const noSlug = loc.startsWith(prefix) ? loc.slice(prefix.length) : loc;
  return noSlug.replace(/:L\d+$/, '');
}

function collectMatchedModels(
  provider: ProjectAnalysisRecord,
  providerFile: string,
  downstreamFiles: readonly string[],
  endpoint: ProjectAnalysisRecord['endpoints'][number] | undefined
): string[] {
  const names = new Set<string>();
  if (endpoint?.request_model) names.add(endpoint.request_model);
  if (endpoint?.response_model) names.add(endpoint.response_model);
  const relevant = new Set<string>([providerFile, ...downstreamFiles]);
  for (const model of provider.models) {
    if (relevant.has(model.file)) names.add(model.name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function buildFlowTrace(
  ctx: FlowTraceContext,
  edge: IntegrationEdge,
  flowNum: number
): FunctionalFlowTrace | null {
  const consumer = ctx.bySlug.get(edge.consumer_slug);
  const provider = ctx.bySlug.get(edge.provider_slug);
  if (!consumer || !provider) return null;

  const consumerFile = stripSlugAndLine(edge.consumer_location, consumer.slug);
  const providerFile = stripSlugAndLine(edge.provider_location, provider.slug);
  const upstream = bfsReachableFiles(consumerFile, getCachedProjectAdj(ctx, consumer).reverse);
  const downstream = bfsReachableFiles(providerFile, getCachedProjectAdj(ctx, provider).forward);

  const uiFiles = new Set(consumer.ui_views.map((v) => v.file));
  const uiEntry = upstream.find((f) => uiFiles.has(f)) ?? (uiFiles.has(consumerFile) ? consumerFile : undefined);
  const ep = provider.endpoints.find(
    (e) => e.method === edge.method && e.normalized_path === edge.normalized_path
  );
  const domainModels = collectMatchedModels(provider, providerFile, downstream, ep);
  const serviceHop = downstream.find((f) => /service|usecase|handler|controller/i.test(f));

  const handlerSuffix = ep?.handler_name ? `#${ep.handler_name}` : '';
  const hops: string[] = [];
  if (uiEntry) hops.push(`UI:${consumer.slug}/${uiEntry}`);
  hops.push(`CALL:${edge.consumer_location} (${edge.method} ${edge.normalized_path})`);
  hops.push(`API:${edge.provider_location}${handlerSuffix}`);
  if (serviceHop) hops.push(`SERVICE:${provider.slug}/${serviceHop}`);
  if (domainModels.length > 0) hops.push(`MODELS:${domainModels.join(',')}`);

  const handlerOrService = ep?.handler_name ?? serviceHop;
  return {
    id: `FLOW-${String(flowNum).padStart(2, '0')}`,
    consumer_slug: consumer.slug,
    ...(uiEntry ? { ui_entry: `${consumer.slug}/${uiEntry}` } : {}),
    consumer_call: `${edge.method} ${edge.normalized_path} (${edge.consumer_location})`,
    provider_slug: provider.slug,
    provider_endpoint: `${edge.method} ${edge.normalized_path} (${edge.provider_location})`,
    ...(handlerOrService ? { handler_or_service: handlerOrService } : {}),
    domain_models: domainModels,
    hops,
  };
}

export function traceEcosystemFunctionalFlows(
  workspaceReal: string,
  records: readonly ProjectAnalysisRecord[],
  edges: readonly IntegrationEdge[]
): FunctionalFlowTrace[] {
  const ctx: FlowTraceContext = {
    workspaceReal,
    bySlug: new Map<string, ProjectAnalysisRecord>(records.map((r) => [r.slug, r])),
    adjCache: new Map<string, FileAdjacency>(),
  };
  const flows: FunctionalFlowTrace[] = [];
  const seenKeys = new Set<string>();
  for (const edge of edges) {
    if (flows.length >= MAX_FLOWS_TRACED) break;
    const dedupKey = `${edge.consumer_slug}:${edge.method}:${edge.normalized_path}:${edge.provider_slug}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    const traced = buildFlowTrace(ctx, edge, flows.length + 1);
    if (traced) flows.push(traced);
  }
  return flows;
}
