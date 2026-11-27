// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  WorkspacePathValidationError,
  resolveSafeProjectPath,
} from '../security/workspacePathValidator.js';
import { throwIfSignalAborted } from '../utils/diagnosticFormatter.js';
import { extractProjectConsumerArtifacts } from './ecosystem-specs/consumerExtractor.js';
import { correlateEcosystemContracts } from './ecosystem-specs/contractCorrelator.js';
import { extractProjectEnvVars } from './ecosystem-specs/envExtractor.js';
import { buildAndAnalyzeProjectGraph } from './ecosystem-specs/graphBuilder.js';
import {
  assertNoSymlinkBetween,
  discoverEcosystemProjects,
  resolveSafeOutputDir,
  toPosixRel,
} from './ecosystem-specs/projectDiscovery.js';
import { extractProjectProviderArtifacts } from './ecosystem-specs/providerExtractor.js';
import {
  DEFAULT_ECOSYSTEM_OUTPUT_DIR,
  DEFAULT_MAX_FINDINGS_PER_CATEGORY,
  ECOSYSTEM_INVENTORY_SCHEMA_VERSION,
  ECOSYSTEM_SCOPE_POLICY,
  INVENTORY_FILENAME,
  UTF8_ENCODING,
  type AnalyzeEcosystemSpecsArgs,
  type AnalyzeEcosystemSpecsDeps,
  type AnalyzeEcosystemSpecsResult,
  type DiscoveredProject,
  type EcosystemInventoryDocument,
  type ProjectAnalysisRecord,
  type ProjectSummaryPreview,
} from './ecosystem-specs/types.js';

export type {
  AnalyzeEcosystemSpecsArgs,
  AnalyzeEcosystemSpecsDeps,
  AnalyzeEcosystemSpecsResult,
  EcosystemInventoryDocument,
} from './ecosystem-specs/types.js';

const PREVIEW_FINDINGS_CAP = 10;

export const ANALYZE_ECOSYSTEM_SPECS_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: 'analyze_ecosystem_specs',
  description:
    'Multi-project reverse-spec & integration analyzer (Zero-Footprint): discovers sibling projects (current QA-11X stacks), sequentially builds read-only (:ro) Graphify AST graphs into <outputDir>/.graphs/<slug>/, correlates HTTP/REST contracts + .env wiring + AST cycles/god-modules, and writes <outputDir>/ecosystem-inventory.json strictly without vulnerability audits or writes inside source repos.',
};

function assertNotSymlinkLeaf(targetPath: string): void {
  const stat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() || stat?.isDirectory()) {
    throw new WorkspacePathValidationError(
      `[SEC-PATH-01] Destino inseguro (symlink o directorio) en '${targetPath}'.`
    );
  }
}

function writeJsonAtomicSafe(workspaceReal: string, targetAbs: string, payload: unknown): void {
  const parentDir = path.dirname(targetAbs);
  assertNoSymlinkBetween(workspaceReal, parentDir);
  fs.mkdirSync(parentDir, { recursive: true });
  assertNoSymlinkBetween(workspaceReal, targetAbs);
  assertNotSymlinkLeaf(targetAbs);

  const nonce = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(parentDir, `.${path.basename(targetAbs)}.${process.pid}.${nonce}.tmp`);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    fs.writeFileSync(tmpPath, serialized, { encoding: UTF8_ENCODING, mode: 0o644 });
    fs.renameSync(tmpPath, targetAbs);
  } catch (err: unknown) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

async function analyzeSingleProject(
  project: DiscoveredProject,
  ctx: {
    readonly workspaceReal: string;
    readonly outputRealDir: string;
    readonly buildGraphs: boolean;
    readonly refreshGraphs: boolean;
    readonly deps: AnalyzeEcosystemSpecsDeps;
  }
): Promise<ProjectAnalysisRecord> {
  throwIfSignalAborted(ctx.deps.signal, 'analyze_ecosystem_specs abortado por timeout o cancelación.');
  const graph = await buildAndAnalyzeProjectGraph({
    workspaceReal: ctx.workspaceReal,
    outputRealDir: ctx.outputRealDir,
    project,
    buildGraphs: ctx.buildGraphs,
    refreshGraphs: ctx.refreshGraphs,
    execFileFn: ctx.deps.execFileFn,
    graphBuilderFn: ctx.deps.graphBuilderFn,
    signal: ctx.deps.signal,
  });
  const envVars = extractProjectEnvVars(project);
  const { endpoints, models } = extractProjectProviderArtifacts(project);
  const { consumerCalls, uiViews, apiBasePrefixes } = extractProjectConsumerArtifacts(
    project,
    envVars
  );
  return {
    slug: project.slug,
    name: project.name,
    relative_path: project.relativePath,
    role: project.role,
    stacks: project.stacks,
    manifest_files: project.manifestFiles,
    graph,
    api_base_prefixes: apiBasePrefixes,
    endpoints,
    models,
    consumer_calls: consumerCalls,
    ui_views: uiViews,
    env_vars: envVars,
  };
}

function toProjectSummaryPreview(record: ProjectAnalysisRecord): ProjectSummaryPreview {
  return {
    slug: record.slug,
    name: record.name,
    relative_path: record.relative_path,
    role: record.role,
    stacks: record.stacks,
    graph_status: record.graph.status,
    graph_json_rel: record.graph.graph_json_rel,
    graph_report_rel: record.graph.graph_report_rel,
    endpoints_count: record.endpoints.length,
    models_count: record.models.length,
    consumer_calls_count: record.consumer_calls.length,
    ui_views_count: record.ui_views.length,
    env_vars_count: record.env_vars.length,
    cycles_count: record.graph.cycles.length,
    god_modules_count: record.graph.god_modules.length,
  };
}

function buildRecommendedDeliverables(
  outputRel: string,
  records: readonly ProjectAnalysisRecord[]
): string[] {
  return [
    `${outputRel}/00-resumen-ecosistema.md`,
    ...records.map((r) => `${outputRel}/01-specs-${r.slug}.md`),
    `${outputRel}/02-integracion-y-contratos.md`,
    `${outputRel}/03-inconsistencias-y-mejoras.md`,
  ];
}

function resolveBoundedMaxFindings(raw?: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_MAX_FINDINGS_PER_CATEGORY;
  }
  return Math.min(500, Math.max(1, Math.floor(raw)));
}

export async function runAnalyzeEcosystemSpecs(
  args: AnalyzeEcosystemSpecsArgs = {},
  deps: AnalyzeEcosystemSpecsDeps = {}
): Promise<AnalyzeEcosystemSpecsResult> {
  throwIfSignalAborted(deps.signal, 'analyze_ecosystem_specs abortado por timeout o cancelación.');
  const workspaceReal = resolveSafeProjectPath(args.workspaceRoot ?? process.cwd(), {
    allowNonExistentLeaf: false,
  });
  if (!fs.statSync(workspaceReal).isDirectory()) {
    throw new WorkspacePathValidationError(
      `[SEC-PATH-01] workspaceRoot no es un directorio válido: ${workspaceReal}`
    );
  }

  const rawOutputDir = args.outputDir ?? DEFAULT_ECOSYSTEM_OUTPUT_DIR;
  const outputRealDir = resolveSafeOutputDir(workspaceReal, rawOutputDir);
  const discovered = discoverEcosystemProjects(workspaceReal, outputRealDir, args.projects);
  const buildGraphs = args.buildGraphs !== false;
  const refreshGraphs = args.refreshGraphs === true;
  const maxFindings = resolveBoundedMaxFindings(args.maxFindingsPerCategory);

  const records: ProjectAnalysisRecord[] = [];
  for (const project of discovered) {
    records.push(
      await analyzeSingleProject(project, {
        workspaceReal,
        outputRealDir,
        buildGraphs,
        refreshGraphs,
        deps,
      })
    );
  }

  const { integrationEdges, findings, improvementOpportunities } = correlateEcosystemContracts(
    records,
    maxFindings
  );

  const outputRel = toPosixRel(workspaceReal, outputRealDir);
  const inventoryAbs = path.join(outputRealDir, INVENTORY_FILENAME);
  const inventoryRel = toPosixRel(workspaceReal, inventoryAbs);
  const nowIso = (deps.nowFn ? deps.nowFn() : new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const inventoryDoc: EcosystemInventoryDocument = {
    schema_version: ECOSYSTEM_INVENTORY_SCHEMA_VERSION,
    generated_at_utc: nowIso,
    scope_policy: ECOSYSTEM_SCOPE_POLICY,
    zero_footprint_verified: true,
    workspace_root_name: path.basename(workspaceReal),
    output_dir_rel: outputRel,
    projects: records,
    integration_edges: integrationEdges,
    findings,
    improvement_opportunities: improvementOpportunities,
  };
  writeJsonAtomicSafe(workspaceReal, inventoryAbs, inventoryDoc);

  const deliverables = buildRecommendedDeliverables(outputRel, records);
  const summaryLine =
    `[PASS] ECOSYSTEM-SPECS | Projects: ${records.length} | Edges: ${integrationEdges.length} | ` +
    `Broken: ${findings.BROKEN_CONSUMER_CALL.length} | Orphans: ${findings.ORPHAN_PROVIDER_ENDPOINT.length} | ` +
    `Asymmetry: ${findings.CHANNEL_ASYMMETRY.length} | EnvDrift: ${findings.ENV_CONFIG_DRIFT.length} | ` +
    `AST: ${findings.AST_STRUCTURAL_FINDINGS.length}`;

  return {
    schema_version: ECOSYSTEM_INVENTORY_SCHEMA_VERSION,
    status: 'PASSED',
    scope_policy: ECOSYSTEM_SCOPE_POLICY,
    zero_footprint_verified: true,
    summary_1line: summaryLine,
    workspace_root: workspaceReal,
    output_dir: outputRel,
    inventory_path: inventoryRel,
    projects_count: records.length,
    projects_summary: records.map(toProjectSummaryPreview),
    integration_summary: {
      matched_edges_count: integrationEdges.length,
      broken_calls_count: findings.BROKEN_CONSUMER_CALL.length,
      orphan_endpoints_count: findings.ORPHAN_PROVIDER_ENDPOINT.length,
      channel_asymmetry_count: findings.CHANNEL_ASYMMETRY.length,
      env_drift_count: findings.ENV_CONFIG_DRIFT.length,
      ast_structural_count: findings.AST_STRUCTURAL_FINDINGS.length,
      improvement_opportunities_count: improvementOpportunities.length,
    },
    findings_preview: {
      broken_consumer_calls: findings.BROKEN_CONSUMER_CALL.slice(0, PREVIEW_FINDINGS_CAP),
      orphan_provider_endpoints: findings.ORPHAN_PROVIDER_ENDPOINT.slice(0, PREVIEW_FINDINGS_CAP),
      channel_asymmetry: findings.CHANNEL_ASYMMETRY.slice(0, PREVIEW_FINDINGS_CAP),
      env_config_drift: findings.ENV_CONFIG_DRIFT.slice(0, PREVIEW_FINDINGS_CAP),
      ast_structural: findings.AST_STRUCTURAL_FINDINGS.slice(0, PREVIEW_FINDINGS_CAP),
    },
    recommended_deliverables: deliverables,
    next_steps: [
      `Read '${inventoryRel}' and each '${outputRel}/.graphs/<slug>/GRAPH_REPORT.md' (follow skill 'qa-11x-reverse-specs').`,
      'Inspect targeted 40-80 line source windows around cited file:line pointers (do NOT write inside source repos; do NOT run vulnerability audits).',
      `Author numbered deliverables in '${outputRel}/' in the user prompt language (single language, <=20% [INFERRED], Mermaid diagrams, file:line citations).`,
    ],
  };
}

export async function handleAnalyzeEcosystemSpecs(
  rawArgs: AnalyzeEcosystemSpecsArgs = {},
  deps: AnalyzeEcosystemSpecsDeps = {}
): Promise<CallToolResult> {
  const result = await runAnalyzeEcosystemSpecs(rawArgs, deps);
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
    structuredContent: JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
  };
}
