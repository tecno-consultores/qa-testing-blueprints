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
  'php',
]);
export type StackName = z.infer<typeof StackNameSchema>;

export const InspectProjectInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta absoluta o relativa al directorio del proyecto a auditar"),
});
export type InspectProjectInput = z.infer<typeof InspectProjectInputSchema>;

export const FetchBundleInputSchema = z.object({
  stack: StackNameSchema.describe('Nombre del stack tecnológico a descargar.'),
  include_common_and_agents: z
    .boolean()
    .default(true)
    .describe('Incluir archivos comunes (.trivy, lefthook) y reglas .agents/.'),
  include_content: z
    .boolean()
    .default(false)
    .describe(
      'Si es false (por defecto para ahorro extremo de tokens), verifica SHA-256 en caché local y devuelve metadatos sin volcar el texto crudo de cada archivo al contexto.'
    ),
});
export type FetchBundleInput = z.infer<typeof FetchBundleInputSchema>;

export const BootstrapMergeInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta al proyecto destino"),
  stack: StackNameSchema,
  dry_run: z.boolean().default(false).describe("Si es true, no escribe en disco y solo devuelve el plan de cambios"),
});
export type BootstrapMergeInput = z.infer<typeof BootstrapMergeInputSchema>;

export const BlastRadiusInputSchema = z.object({
  project_path: z.string().min(1).describe('Ruta al directorio raíz del proyecto.'),
  target_symbol: z
    .string()
    .min(1)
    .describe('Nombre del archivo, clase o función que se planea modificar.'),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Máximo de archivos dependientes a listar en el arreglo (ahorro de tokens).'),
  auto_build_if_missing: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Si es true y no existe graphify-out/graph.json, construye automáticamente el grafo AST en Docker efímero antes de analizar.'
    ),
  refresh_graph: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Si es true, actualiza incrementalmente el grafo AST del proyecto antes de calcular el radio de impacto.'
    ),
});
export type BlastRadiusInput = z.infer<typeof BlastRadiusInputSchema>;

export const CleanWorkspaceInputSchema = z.object({
  project_path: z.string().min(1).describe("Ruta absoluta o relativa al directorio del proyecto a limpiar"),
  dry_run: z.boolean().default(true).describe("Si es true (por defecto), solo audita e informa qué artefactos serían eliminados"),
  deep_prune: z
    .boolean()
    .default(false)
    .describe(
      'Si es true, incluye la eliminación de directorios persistentes (reports/, prometheus_data/) y recomienda poda profunda de contenedores/volúmenes'
    ),
});
export type CleanWorkspaceInput = z.infer<typeof CleanWorkspaceInputSchema>;

export const AuditSecurityInputSchema = z.object({
  project_path: z.string().min(1).describe('Ruta absoluta o relativa al directorio del proyecto a auditar'),
  max_findings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(25)
    .describe('Límite máximo de hallazgos individuales devueltos en findings (ahorro de tokens).'),
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
  skip_if_docs_only: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Si es true y git detecta únicamente cambios en documentación (*.md / docs/), omite levantar contenedores Docker y retorna PASSED por Fast-Path."
    ),
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
  size_bytes?: number;
  cached_path?: string;
}

export interface BrowserTestingReadiness {
  applicable: boolean; // true si detected_stacks incluye 'vue3' o 'react-frontend'
  playwright_test_installed: boolean; // '@playwright/test' en package.json
  axe_core_playwright_installed: boolean; // '@axe-core/playwright' en package.json
  lhci_cli_installed: boolean; // '@lhci/cli' en package.json
  e2e_spec_present: boolean; // existe e2e/accessibility.e2e.ts o e2e/*.e2e.ts
  browser_mcp_configured_in_ide: boolean; // detectado @playwright/mcp o chrome-devtools en config del IDE
  install_instructions: string[]; // Comandos claros o invocación de bootstrap_or_merge_11x
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
    phpstan_strict?: boolean;
    infection_mutation?: boolean;
  };
  missing_11x_files: string[];
  recommended_next_tool: string;
  browser_testing_readiness?: BrowserTestingReadiness;
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
  truncated_dependents_count?: number;
  suggested_tests_to_run: string[];
  ast_graph_detected?: boolean;
  ast_graph_rebuilt?: boolean;
  ast_graph_files?: string[];
  ast_graph_action_required?: string;
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

export interface GroupedSecurityFinding {
  rule_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  stig_owasp_ref: string;
  message: string;
  remediation: string;
  occurrences_count: number;
  locations: string[];
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
  grouped_findings?: GroupedSecurityFinding[];
  truncated_findings_count?: number;
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
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
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
    ast_topology_clean?: boolean;
    security_stig_owasp_clean: boolean;
    documentation_synced: boolean;
  };
  blockers: string[];
  upstream_evolution_reminder?: string;
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
  total_orphan_files_count?: number;
  total_untested_apis_count?: number;
  total_untested_views_count?: number;
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
  max_items: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Máximo de ítems por categoría en missing_test_inventory (ahorro de tokens).'),
});
export type AuditTestPyramidInput = z.infer<typeof AuditTestPyramidInputSchema>;

// ============================================================================
// 🔗 Contratos de Conector AGENTS.md (Hito 9)
// ============================================================================

export interface InitAgentsMdOptions {
  projectPath: string;
  dryRun?: boolean;
}

export type InitAgentsAction = 'created' | 'appended' | 'updated_block' | 'dry_run';

export interface InitAgentsMdResult {
  project_path: string;
  agents_md_path: string;
  action: InitAgentsAction;
  detected_stacks: string[];
  content: string;
}

export const InitAgentsMdInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta o relativa al directorio del proyecto destino.'),
  dry_run: z
    .boolean()
    .default(false)
    .describe('Si es true, no escribe en disco y solo devuelve el contenido resultante.'),
});
export type InitAgentsMdInput = z.infer<typeof InitAgentsMdInputSchema>;

// ============================================================================
// 🚀 Contratos de Evolución Continua y Pull Requests Zero-Trust (Hito 10)
// ============================================================================

export const ProposeEvolutionPrInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta del proyecto donde se descubrió la mejora.'),
  target_blueprint_file: z
    .string()
    .min(1)
    .describe(
      'Ruta relativa en qa-testing-blueprints a mejorar (ej. ".agents/skills/qa-11x-architect/SKILL.md").'
    ),
  improvement_title: z
    .string()
    .min(5)
    .describe('Título conciso en español de la mejora propuesta para el PR.'),
  empirical_rationale: z
    .string()
    .min(10)
    .describe('Explicación técnica en español del caso borde o mejora descubierta en producción.'),
  proposed_content_or_snippet: z
    .string()
    .min(10)
    .describe('Contenido o bloque Markdown/código propuesto para incorporar en la skill o plantilla.'),
  prefer_offline_fallback: z
    .boolean()
    .optional()
    .default(false)
    .describe('Si es true, omite gh CLI y genera directamente el archivo de propuesta + URL pre-llenada.'),
});
export type ProposeEvolutionPrInput = z.infer<typeof ProposeEvolutionPrInputSchema>;

export interface ProposeEvolutionPrResult {
  status: 'PR_CREATED_VIA_GH' | 'PROPOSAL_FILE_AND_URL_GENERATED';
  target_repo: string;
  target_blueprint_file: string;
  branch_name: string;
  gh_cli_authenticated: boolean;
  pull_request_url: string | null;
  prefilled_github_url: string;
  local_proposal_file: string;
  message: string;
}

// ============================================================================
// 🧹 Contratos de Reconciliación y Deduplicación de .agents/ (Hito 13)
// ============================================================================

export const ReconcileAgentsInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta o relativa al proyecto consumidor (ej. rosgrid) a reconciliar.'),
  dry_run: z
    .boolean()
    .default(false)
    .describe('Si es true, simula la reconciliación informando duplicados y extracciones de dominio sin modificar el disco.'),
});
export type ReconcileAgentsInput = z.infer<typeof ReconcileAgentsInputSchema>;

export interface ReconciledRuleItem {
  file: string;
  classification:
    | 'CANONICAL_CLEAN'
    | 'REDUNDANT_PROMOTED_REMOVED'
    | 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE'
    | 'DOMAIN_PRESERVED';
  details: string;
}

export interface ReconcileAgentsResult {
  project_path: string;
  dry_run: boolean;
  backup_dir: string | null;
  domain_rules_file: string | null;
  removed_duplicate_sections_count: number;
  preserved_domain_sections_count: number;
  reconciled_items: ReconciledRuleItem[];
}




