// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { execFile } from 'node:child_process';

export const ECOSYSTEM_INVENTORY_SCHEMA_VERSION = '1.0.0' as const;
export const ECOSYSTEM_SCOPE_POLICY =
  'DOCUMENTATION_AND_INTEGRATION_ONLY_NO_VULNERABILITY_AUDIT' as const;
export const DEFAULT_ECOSYSTEM_OUTPUT_DIR = 'analisis' as const;
export const DEFAULT_MAX_FINDINGS_PER_CATEGORY = 100;
export const GRAPHS_SUBDIR_NAME = '.graphs' as const;
export const INVENTORY_FILENAME = 'ecosystem-inventory.json' as const;
export const REDACTED_ENV_VALUE = '[REDACTED]' as const;
export const UTF8_ENCODING = 'utf8' as const;

export const SUPPORTED_ECOSYSTEM_STACKS = [
  'fastapi',
  'python',
  'node-backend',
  'vue3',
  'react-frontend',
  'php',
  'mobile-appium',
  'bash-scripts',
  'ai-evals',
  'vibe-rescue',
] as const;

export type EcosystemStack = (typeof SUPPORTED_ECOSYSTEM_STACKS)[number];
export type ProjectRole = 'api' | 'web' | 'mobile' | 'mixed' | 'library';
export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ConsumerChannel = 'web' | 'mobile' | 'service';
export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type GraphBuildStatus = 'BUILT' | 'REUSED_CACHED' | 'SKIPPED_BUILD_DISABLED' | 'FAILED';

export type EnvCategory =
  | 'url_or_endpoint'
  | 'port_or_host'
  | 'cors_or_origin'
  | 'feature_flag'
  | 'secret_redacted'
  | 'other';

export interface DiscoveredProject {
  readonly slug: string;
  readonly name: string;
  readonly relativePath: string;
  readonly absPath: string;
  readonly role: ProjectRole;
  readonly stacks: readonly EcosystemStack[];
  readonly hasOpenApi: boolean;
  readonly manifestFiles: readonly string[];
}

export interface GodModuleMetric {
  readonly module: string;
  readonly nodes_count: number;
  readonly fan_in: number;
  readonly fan_out: number;
  readonly instability: number;
  readonly coupling_score: number;
  readonly god_module_candidate: boolean;
}

export interface HubNodeMetric {
  readonly id: string;
  readonly label: string;
  readonly source_file: string;
  readonly degree: number;
}

export interface ProjectGraphSummary {
  readonly status: GraphBuildStatus;
  readonly graph_dir_rel: string;
  readonly graph_json_rel: string;
  readonly graph_report_rel: string;
  readonly graph_exists: boolean;
  readonly report_exists: boolean;
  readonly nodes_count: number;
  readonly links_count: number;
  readonly communities_count: number;
  readonly cycles: readonly string[];
  readonly god_modules: readonly GodModuleMetric[];
  readonly top_hub_nodes: readonly HubNodeMetric[];
  readonly error?: string;
}

export interface ProviderEndpoint {
  readonly project_slug: string;
  readonly method: HttpVerb;
  readonly path: string;
  readonly normalized_path: string;
  readonly framework: string;
  readonly source_kind: 'code' | 'openapi';
  readonly file: string;
  readonly line: number;
}

export interface DomainModelSymbol {
  readonly project_slug: string;
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
}

export interface ConsumerHttpCall {
  readonly project_slug: string;
  readonly channel: ConsumerChannel;
  readonly method: HttpVerb;
  readonly raw_url: string;
  readonly normalized_path: string;
  readonly base_url_var?: string;
  readonly client_kind: string;
  readonly is_external: boolean;
  readonly file: string;
  readonly line: number;
}

export interface UiViewEntry {
  readonly project_slug: string;
  readonly name: string;
  readonly kind: 'view' | 'page' | 'screen' | 'route';
  readonly file: string;
  readonly line: number;
}

export interface EnvVarEntry {
  readonly project_slug: string;
  readonly key: string;
  readonly source: 'env_file' | 'code_ref';
  readonly env_file_kind?: 'example' | 'runtime';
  readonly category: EnvCategory;
  readonly sanitized_sample?: string;
  readonly file: string;
  readonly line: number;
}

export interface ProjectAnalysisRecord {
  readonly slug: string;
  readonly name: string;
  readonly relative_path: string;
  readonly role: ProjectRole;
  readonly stacks: readonly EcosystemStack[];
  readonly manifest_files: readonly string[];
  readonly graph: ProjectGraphSummary;
  readonly api_base_prefixes: readonly string[];
  readonly endpoints: readonly ProviderEndpoint[];
  readonly models: readonly DomainModelSymbol[];
  readonly consumer_calls: readonly ConsumerHttpCall[];
  readonly ui_views: readonly UiViewEntry[];
  readonly env_vars: readonly EnvVarEntry[];
}

export interface IntegrationEdge {
  readonly consumer_slug: string;
  readonly consumer_channel: ConsumerChannel;
  readonly provider_slug: string;
  readonly method: HttpVerb;
  readonly normalized_path: string;
  readonly consumer_location: string;
  readonly provider_location: string;
}

export interface BrokenConsumerCallFinding {
  readonly category: 'BROKEN_CONSUMER_CALL';
  readonly reason: 'ENDPOINT_NOT_FOUND_404' | 'METHOD_NOT_ALLOWED_405';
  readonly severity: FindingSeverity;
  readonly consumer_slug: string;
  readonly consumer_channel: ConsumerChannel;
  readonly method: HttpVerb;
  readonly raw_url: string;
  readonly normalized_path: string;
  readonly file: string;
  readonly line: number;
  readonly available_methods?: readonly HttpVerb[];
  readonly suggested_endpoint?: string;
  readonly message: string;
}

export interface OrphanProviderEndpointFinding {
  readonly category: 'ORPHAN_PROVIDER_ENDPOINT';
  readonly severity: FindingSeverity;
  readonly provider_slug: string;
  readonly method: HttpVerb;
  readonly path: string;
  readonly normalized_path: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface ChannelAsymmetryFinding {
  readonly category: 'CHANNEL_ASYMMETRY';
  readonly kind: 'WEB_ONLY_ENDPOINT' | 'MOBILE_ONLY_ENDPOINT' | 'METHOD_OR_VERSION_DIVERGENCE';
  readonly severity: FindingSeverity;
  readonly normalized_path: string;
  readonly web_calls: readonly string[];
  readonly mobile_calls: readonly string[];
  readonly message: string;
}

export interface EnvConfigDriftFinding {
  readonly category: 'ENV_CONFIG_DRIFT';
  readonly kind: 'MISSING_IN_ENV_EXAMPLE' | 'UNUSED_ENV_EXAMPLE_KEY' | 'BASE_URL_DRIFT';
  readonly severity: FindingSeverity;
  readonly project_slug: string;
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly related_projects?: readonly string[];
  readonly message: string;
}

export interface AstStructuralFinding {
  readonly category: 'AST_STRUCTURAL_FINDINGS';
  readonly kind: 'DEPENDENCY_CYCLE' | 'GOD_MODULE';
  readonly severity: FindingSeverity;
  readonly project_slug: string;
  readonly target: string;
  readonly details: string;
  readonly message: string;
}

export interface ImprovementOpportunity {
  readonly id: string;
  readonly priority: 'P1' | 'P2' | 'P3';
  readonly title: string;
  readonly rationale: string;
  readonly impacted_projects: readonly string[];
}

export interface EcosystemFindingsBundle {
  readonly BROKEN_CONSUMER_CALL: readonly BrokenConsumerCallFinding[];
  readonly ORPHAN_PROVIDER_ENDPOINT: readonly OrphanProviderEndpointFinding[];
  readonly CHANNEL_ASYMMETRY: readonly ChannelAsymmetryFinding[];
  readonly ENV_CONFIG_DRIFT: readonly EnvConfigDriftFinding[];
  readonly AST_STRUCTURAL_FINDINGS: readonly AstStructuralFinding[];
}

export interface EcosystemInventoryDocument {
  readonly schema_version: typeof ECOSYSTEM_INVENTORY_SCHEMA_VERSION;
  readonly generated_at_utc: string;
  readonly scope_policy: typeof ECOSYSTEM_SCOPE_POLICY;
  readonly zero_footprint_verified: boolean;
  readonly workspace_root_name: string;
  readonly output_dir_rel: string;
  readonly projects: readonly ProjectAnalysisRecord[];
  readonly integration_edges: readonly IntegrationEdge[];
  readonly findings: EcosystemFindingsBundle;
  readonly improvement_opportunities: readonly ImprovementOpportunity[];
}

export interface ProjectSummaryPreview {
  readonly slug: string;
  readonly name: string;
  readonly relative_path: string;
  readonly role: ProjectRole;
  readonly stacks: readonly EcosystemStack[];
  readonly graph_status: GraphBuildStatus;
  readonly graph_json_rel: string;
  readonly graph_report_rel: string;
  readonly endpoints_count: number;
  readonly models_count: number;
  readonly consumer_calls_count: number;
  readonly ui_views_count: number;
  readonly env_vars_count: number;
  readonly cycles_count: number;
  readonly god_modules_count: number;
}

export interface AnalyzeEcosystemSpecsArgs {
  readonly workspaceRoot?: string;
  readonly outputDir?: string;
  readonly projects?: readonly string[];
  readonly buildGraphs?: boolean;
  readonly refreshGraphs?: boolean;
  readonly maxFindingsPerCategory?: number;
}

export interface GraphBuilderCallbackInput {
  readonly projectAbsPath: string;
  readonly graphOutAbsDir: string;
  readonly signal?: AbortSignal;
}

export interface AnalyzeEcosystemSpecsDeps {
  readonly execFileFn?: typeof execFile;
  readonly graphBuilderFn?: (input: GraphBuilderCallbackInput) => Promise<{ ok: boolean; error?: string }>;
  readonly signal?: AbortSignal;
  readonly nowFn?: () => Date;
}

export interface AnalyzeEcosystemSpecsResult {
  readonly schema_version: typeof ECOSYSTEM_INVENTORY_SCHEMA_VERSION;
  readonly status: 'PASSED' | 'FAILED';
  readonly scope_policy: typeof ECOSYSTEM_SCOPE_POLICY;
  readonly zero_footprint_verified: boolean;
  readonly summary_1line: string;
  readonly workspace_root: string;
  readonly output_dir: string;
  readonly inventory_path: string;
  readonly projects_count: number;
  readonly projects_summary: readonly ProjectSummaryPreview[];
  readonly integration_summary: {
    readonly matched_edges_count: number;
    readonly broken_calls_count: number;
    readonly orphan_endpoints_count: number;
    readonly channel_asymmetry_count: number;
    readonly env_drift_count: number;
    readonly ast_structural_count: number;
    readonly improvement_opportunities_count: number;
  };
  readonly findings_preview: {
    readonly broken_consumer_calls: readonly BrokenConsumerCallFinding[];
    readonly orphan_provider_endpoints: readonly OrphanProviderEndpointFinding[];
    readonly channel_asymmetry: readonly ChannelAsymmetryFinding[];
    readonly env_config_drift: readonly EnvConfigDriftFinding[];
    readonly ast_structural: readonly AstStructuralFinding[];
  };
  readonly recommended_deliverables: readonly string[];
  readonly next_steps: readonly string[];
  readonly error?: string;
}
