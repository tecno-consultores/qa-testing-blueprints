// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { z } from 'zod';

export interface ManifestFileEntry {
  path: string;
  target_name: string;
  merge_strategy: string;
  sha256: string;
  size_bytes: number;
}

export interface StackDefinition {
  description: string;
  readme: string;
  files: ManifestFileEntry[];
}

export interface Manifest {
  schema_version: string;
  blueprint_version: string;
  generated_at_utc: string;
  repository: string;
  default_branch: string;
  raw_base_url: string;
  stacks: Record<string, StackDefinition>;
  common_files: ManifestFileEntry[];
  agent_governance_files: ManifestFileEntry[];
}

export const StackNameSchema = z.enum([
  'python',
  'fastapi',
  'node-backend',
  'vue3',
  'react-frontend',
  'bash-scripts',
]);
export type StackName = z.infer<typeof StackNameSchema>;

export const InspectProjectInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta absoluta o relativa al directorio del proyecto a auditar"),
});
export type InspectProjectInput = z.infer<typeof InspectProjectInputSchema>;

export const FetchBundleInputSchema = z.object({
  stack: StackNameSchema,
  include_common_and_agents: z.boolean().default(true).describe("Incluir archivos comunes y scripts de gobernanza .agents/"),
});
export type FetchBundleInput = z.infer<typeof FetchBundleInputSchema>;

export const BootstrapMergeInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta al proyecto destino"),
  stack: StackNameSchema,
  dry_run: z.boolean().default(false).describe("Si es true, no escribe en disco y solo devuelve el plan de cambios"),
});
export type BootstrapMergeInput = z.infer<typeof BootstrapMergeInputSchema>;

export const BlastRadiusInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta al proyecto"),
  target_symbol: z.string().min(1).describe("Nombre del símbolo, archivo o módulo a analizar"),
});
export type BlastRadiusInput = z.infer<typeof BlastRadiusInputSchema>;

export const CleanWorkspaceInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta absoluta o relativa al directorio del proyecto a limpiar"),
  dry_run: z.boolean().default(true).describe("Si es true (por defecto), solo audita e informa qué artefactos serían eliminados"),
  deep_prune: z.boolean().default(false).describe("Si es true, incluye poda profunda de contenedores y volúmenes Docker huérfanos"),
});
export type CleanWorkspaceInput = z.infer<typeof CleanWorkspaceInputSchema>;

export const AuditSecurityInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta absoluta o relativa al directorio del proyecto a auditar"),
});
export type AuditSecurityInput = z.infer<typeof AuditSecurityInputSchema>;

export const RunEphemeralQaInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta al proyecto que contiene el Makefile"),
  stage: z.enum([
    "lint",
    "unit",
    "parity",
    "orphans",
    "contracts",
    "bdd",
    "mutation",
    "dast",
    "e2e",
    "perf",
    "chaos",
    "all",
  ]).describe("Fase o target de QA a ejecutar (ej. unit, lint, bdd)"),
  timeout_seconds: z.number().int().min(10).max(900).default(300).describe("Tiempo máximo de espera en segundos"),
});
export type RunEphemeralQaInput = z.infer<typeof RunEphemeralQaInputSchema>;

export const CertifyGateInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta al proyecto a certificar frente al estándar 11X"),
});
export type CertifyGateInput = z.infer<typeof CertifyGateInputSchema>;

export interface CleanWorkspaceResult {
  project_path: string;
  dry_run: boolean;
  deep_prune: boolean;
  found_targets: string[];
  removed_targets: string[];
  docker_fallback_used: boolean;
  recommended_command: string;
}

export interface FetchedFileItem {
  path: string;
  target_name: string;
  merge_strategy: string;
  content: string;
  sha256_verified: boolean;
}

export interface ProjectAuditResult {
  project_path: string;
  detected_stacks: string[];
  has_docker_compose_qa: boolean;
  has_makefile: boolean;
  has_lefthook: boolean;
  has_agents_dir: boolean;
  has_testing_md: boolean;
  has_changelog_md: boolean;
  strict_flags: {
    mypy_strict: boolean;
    tsconfig_strict: boolean;
    npmrc_ignore_scripts: boolean;
  };
  missing_11x_files: string[];
  recommended_next_tool: string;
}

export interface MergeResultItem {
  file: string;
  strategy: string;
  status: 'created' | 'merged' | 'skipped' | 'dry_run';
  changes: string[];
}

export interface BootstrapMergeResult {
  project_path: string;
  stack: string;
  dry_run: boolean;
  summary: {
    total_files: number;
    created: number;
    merged: number;
    skipped: number;
  };
  applied_changes: MergeResultItem[];
}

export interface BlastRadiusResult {
  project_path: string;
  target_symbol: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dependent_files_count: number;
  dependent_files: string[];
  suggested_tests_to_run: string[];
}

export interface SecurityFinding {
  rule_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  stig_owasp_ref: string;
  file: string;
  line: number;
  message: string;
  remediation: string;
}

export interface SecurityAuditResult {
  project_path: string;
  passed: boolean;
  total_files_scanned: number;
  findings_count: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW?: number;
  };
  findings: SecurityFinding[];
}

export interface QaCoverageFile {
  file: string;
  coverage_percent: number;
  missing_lines: string;
}

export interface QaCoverageSummary {
  detected: boolean;
  percent: number;
  threshold: number;
  passed: boolean;
  uncovered_files: QaCoverageFile[];
}

export interface QaFailedTest {
  test_name: string;
  error_summary: string;
}

export interface QaLinterIssue {
  file?: string;
  line?: number;
  rule?: string;
  message: string;
}

export interface QaSecurityAlerts {
  critical: number;
  high: number;
}

export interface QaMutationSummary {
  mutants_survived: number;
  mutation_score: number;
}

export interface QaExecutionResult {
  status: 'PASSED' | 'FAILED';
  stage: string;
  exit_code: number;
  duration_ms: number;
  coverage: QaCoverageSummary;
  failed_tests: QaFailedTest[];
  linter_and_complexity_issues: QaLinterIssue[];
  security_alerts: QaSecurityAlerts;
  mutation_summary: QaMutationSummary | null;
  tail_log: string;
}

export interface CertifyGateResult {
  gate_passed: boolean;
  project_path: string;
  checks: {
    zero_unmerged_examples: boolean;
    zero_secrets_exposed: boolean;
    json_integrity: boolean;
    zero_orphan_ui_components: boolean;
    zero_orphan_api_endpoints: boolean;
    orm_alembic_parity: boolean;
    security_stig_owasp_clean: boolean;
    documentation_synced: boolean;
  };
  blockers: string[];
}

export interface GitHubFetcherOptions {
  rawBaseUrl?: string;
  cacheDir?: string;
  localOverridePath?: string;
}

export interface MergeFilesOptions {
  dryRun?: boolean;
}

// ============================================================================
// 📐 Contratos de Auditoría de Brechas de la Pirámide 11X (Hito 7)
// ============================================================================

export type PyramidLayerStatus =
  | 'COVERED'
  | 'PARTIAL'
  | 'MISSING'
  | 'NOT_APPLICABLE';

export type GapPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface PyramidLayerAudit {
  layer_number: number; // 1 a 13
  layer_id: string; // ej. "L03_UNIT_ISOLATED"
  layer_name: string; // Nombre en español de la capa 11X
  status: PyramidLayerStatus;
  applicable_stacks: StackName[];
  detected_evidence: string[]; // Archivos o scripts detectados (ej. ["tests/auth.unit.py", "Makefile:qa-unit"])
  missing_requirements: string[]; // Qué falta para llegar a COVERED
  recommended_blueprint_files: string[]; // Plantillas .example recomendadas del manifiesto
  make_target: string; // ej. "make qa-unit"
}

export interface UntestedApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  source_file: string;
  line: number;
}

export interface PrioritizedTestAction {
  step: number;
  priority: GapPriority;
  layer_number: number;
  title: string;
  action: string;
  target_files_to_create: string[];
  verification_command: string;
}

export interface OrphanSourceFile {
  source_file: string;
  expected_unit_test: string;
  stack: StackName;
}

export interface UntestedUiView {
  view_file: string;
  expected_unit_test: string;
  present_in_bdd_feature: boolean;
  present_in_e2e_spec: boolean;
}

export interface MissingTestInventory {
  orphan_source_files: OrphanSourceFile[];
  untested_api_endpoints: UntestedApiEndpoint[];
  untested_ui_views: UntestedUiView[];
}

export interface TestPyramidGapResult {
  project_path: string;
  detected_stacks: StackName[];
  pyramid_score_pct: number; // Porcentaje ponderado (0 a 100%) sobre las capas aplicables
  summary_counts: {
    covered: number;
    partial: number;
    missing: number;
    not_applicable: number;
  };
  layers_audit: PyramidLayerAudit[]; // Las 13 capas evaluadas
  missing_test_inventory: MissingTestInventory;
  prioritized_action_plan: PrioritizedTestAction[];
}

export const AuditTestPyramidInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta o relativa del proyecto existente a auditar.'),
  stack: StackNameSchema.optional().describe(
    'Stack específico a evaluar. Si se omite, autodetecta todos los stacks presentes en el proyecto.'
  ),
});
export type AuditTestPyramidInput = z.infer<typeof AuditTestPyramidInputSchema>;


