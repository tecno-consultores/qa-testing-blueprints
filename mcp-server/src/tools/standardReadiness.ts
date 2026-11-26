// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONNECTOR_START_MARKER } from '../services/agents-connector.js';
import {
  TIER_ENTERPRISE,
  TIER_STANDARD,
  TIER_STARTER,
  findMissingCanonicalGitignoreEntries,
  formatQa11xStatusBanner,
  isTierAtLeast,
  readQa11xConfig,
} from '../services/qa11xConfig.js';
import type {
  Standard11xReadiness,
  StandardPillarStatus,
  StandardReadinessPillar,
  StandardTier,
  TestPyramidMetaGateAudit,
} from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import { CANONICAL_IGNORED_DIRS } from '../utils/ignoredDirs.js';

const UTF8 = 'utf-8';
const GRAPHIFY_OUT_DIR = 'graphify-out';
const GRAPH_JSON_FILE = 'graph.json';
const GRAPHIFY_SCRIPT_REL = 'scripts/actualizar-grafos-graphify.sh';
const BOUNDARIES_REL = '.agents/boundaries.json';
const AGENTS_MD_FILE = 'AGENTS.md';
const QA_11X_JSON_FILE = '.qa-11x.json';
const ACTIVE_TASK_REL = '.agents/ACTIVE_TASK.md';
const CERTIFY_SCRIPT_REL = '.agents/scripts/certify_task_completion.sh';
const TESTING_MD_FILE = 'TESTING.md';
const CHANGELOG_MD_FILE = 'CHANGELOG.md';
const SECURITY_MD_FILE = 'SECURITY.md';
const LEFTHOOK_FILE = 'lefthook.yml';
const DOCKER_COMPOSE_QA_FILE = 'docker-compose.qa.yml';
const MAKEFILE_FILE = 'Makefile';
const GITIGNORE_FILE = '.gitignore';

const STATUS_PRESENT: StandardPillarStatus = 'PRESENT';
const STATUS_PARTIAL: StandardPillarStatus = 'PARTIAL';
const STATUS_MISSING: StandardPillarStatus = 'MISSING';
const STATUS_PENDING: StandardPillarStatus = 'PENDING_VERIFICATION';

const BASE_RULE_ZERO_SCRIPTS = [
  'scripts/verificar-secretos.sh',
  'scripts/auditar-infra.sh',
  'scripts/limpieza.sh',
] as const;

const ANALYZABLE_SOURCE_EXTS = new Set([
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.php',
  '.sh',
]);

const SPECIALIZED_STACK_NAMES = new Set(['ai-evals', 'vibe-rescue', 'mobile-appium']);
const FRONTEND_STACK_NAMES = new Set(['vue3', 'react-frontend']);

const IGNORED_SOURCE_DIRS = new Set([...CANONICAL_IGNORED_DIRS, 'docs', 'assets', 'propuestas']);

function readTextSafe(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? fs.readFileSync(filePath, UTF8)
      : null;
  } catch (err: unknown) {
    reportDebugCatchError(`standardReadiness.readTextSafe(${filePath})`, err);
    return null;
  }
}

function registerGraphCandidate(
  projectPath: string,
  graphDir: string,
  seenReal: Set<string>,
  collected: string[]
): void {
  const candidate = path.join(graphDir, GRAPH_JSON_FILE);
  try {
    const real = fs.realpathSync(candidate);
    if (!seenReal.has(real)) {
      seenReal.add(real);
      collected.push(path.relative(projectPath, candidate).replace(/\\/g, '/'));
    }
  } catch (err: unknown) {
    reportDebugCatchError('standardReadiness.registerGraphCandidate', err);
  }
}

function walkGraphs(
  projectPath: string,
  currentDir: string,
  seenReal: Set<string>,
  collected: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err: unknown) {
    reportDebugCatchError(`standardReadiness.walkGraphs(${currentDir})`, err);
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.name === GRAPHIFY_OUT_DIR) {
      registerGraphCandidate(projectPath, full, seenReal, collected);
      continue;
    }
    if (CANONICAL_IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) {
      continue;
    }
    walkGraphs(projectPath, full, seenReal, collected);
  }
}

/** Recursively discovers graphify-out/graph.json files across root and stack directories. */
export function findAstGraphFilesRecursive(projectPath: string): string[] {
  const collected: string[] = [];
  walkGraphs(projectPath, projectPath, new Set<string>(), collected);
  return collected;
}

function entryContainsSource(currentDir: string, entry: fs.Dirent, depth: number): boolean {
  if (entry.isSymbolicLink()) {
    return false;
  }
  if (entry.isFile()) {
    return ANALYZABLE_SOURCE_EXTS.has(path.extname(entry.name).toLowerCase());
  }
  if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_SOURCE_DIRS.has(entry.name)) {
    return false;
  }
  return dirHasSourceFiles(path.join(currentDir, entry.name), depth + 1);
}

function dirHasSourceFiles(currentDir: string, depth: number): boolean {
  if (depth > 8) {
    return false;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err: unknown) {
    reportDebugCatchError(`standardReadiness.dirHasSourceFiles(${currentDir})`, err);
    return false;
  }
  return entries.some((entry) => entryContainsSource(currentDir, entry, depth));
}

/** Returns true when a workspace contains at least one analyzable source file for AST extraction. */
export function hasAnalyzableSourceCode(projectPath: string): boolean {
  return dirHasSourceFiles(projectPath, 0);
}

function isUpstreamBlueprintsRepo(projectPath: string): boolean {
  return (
    fs.existsSync(path.join(projectPath, 'manifest.json')) &&
    fs.existsSync(path.join(projectPath, '.agents', 'scripts', 'sync_governance.py'))
  );
}

function detectLocalGovernanceDuplication(projectPath: string): boolean {
  if (isUpstreamBlueprintsRepo(projectPath)) {
    return false;
  }
  const hasCanonicalLocalRule = fs.existsSync(
    path.join(projectPath, '.agents', 'rules', 'mandatory_qa_pyramid_and_doc_sync.md')
  );
  const hasCanonicalLocalSkill = fs.existsSync(
    path.join(projectPath, '.agents', 'skills', 'qa-11x-architect', 'SKILL.md')
  );
  return hasCanonicalLocalRule || hasCanonicalLocalSkill;
}

function findMissingGitignoreEntries(projectPath: string): string[] {
  const content = readTextSafe(path.join(projectPath, GITIGNORE_FILE));
  return findMissingCanonicalGitignoreEntries(content);
}

function hasCiWorkflow(files: readonly string[]): boolean {
  return files.some(
    (f) =>
      (f.startsWith('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml'))) ||
      f === '.gitlab-ci.yml'
  );
}

function hasCalmArchitectureFile(projectPath: string, files: readonly string[]): boolean {
  return (
    fs.existsSync(path.join(projectPath, 'architecture', 'qa-11x.calm.json')) ||
    files.some((f) => f.startsWith('architecture/') && f.endsWith('.calm.json'))
  );
}

interface ReadinessSnapshot {
  readonly declaredTier: StandardTier | null;
  readonly effectiveTier: StandardTier;
  readonly tierConfirmedByUser: boolean;
  readonly astGraphFiles: string[];
  readonly hasGraphifyScript: boolean;
  readonly hasBoundariesConfig: boolean;
  readonly hasDockerComposeQa: boolean;
  readonly hasMakefile: boolean;
  readonly missingBaseScripts: string[];
  readonly isUpstreamRepo: boolean;
  readonly hasAgentsMd: boolean;
  readonly hasAgentsConnector: boolean;
  readonly hasQa11xConfig: boolean;
  readonly hasActiveTaskMd: boolean;
  readonly hasLocalDuplication: boolean;
  readonly missingGitignoreEntries: string[];
  readonly hasLefthook: boolean;
  readonly hasCiWorkflow: boolean;
  readonly hasCalmArchitecture: boolean;
  readonly hasTestingMd: boolean;
  readonly hasChangelogMd: boolean;
  readonly changelogHasUnreleased: boolean;
  readonly hasSecurityMd: boolean;
  readonly hasCertifyScript: boolean;
  readonly detectedStacks: readonly string[];
}

function collectReadinessSnapshot(
  projectPath: string,
  detectedStacks: readonly string[],
  files: readonly string[]
): ReadinessSnapshot {
  const loadedCfg = readQa11xConfig(projectPath);
  const agentsMdContent = readTextSafe(path.join(projectPath, AGENTS_MD_FILE));
  const changelogContent = readTextSafe(path.join(projectPath, CHANGELOG_MD_FILE));
  return {
    declaredTier: loadedCfg.declaredTier,
    effectiveTier: loadedCfg.effectiveTier,
    tierConfirmedByUser: loadedCfg.tierConfirmedByUser,
    astGraphFiles: findAstGraphFilesRecursive(projectPath),
    hasGraphifyScript: fs.existsSync(path.join(projectPath, GRAPHIFY_SCRIPT_REL)),
    hasBoundariesConfig: fs.existsSync(path.join(projectPath, BOUNDARIES_REL)),
    hasDockerComposeQa: fs.existsSync(path.join(projectPath, DOCKER_COMPOSE_QA_FILE)),
    hasMakefile: fs.existsSync(path.join(projectPath, MAKEFILE_FILE)),
    missingBaseScripts: BASE_RULE_ZERO_SCRIPTS.filter((s) => !fs.existsSync(path.join(projectPath, s))),
    isUpstreamRepo: isUpstreamBlueprintsRepo(projectPath),
    hasAgentsMd: agentsMdContent !== null,
    hasAgentsConnector: agentsMdContent !== null && agentsMdContent.includes(CONNECTOR_START_MARKER),
    hasQa11xConfig: loadedCfg.exists,
    hasActiveTaskMd: fs.existsSync(path.join(projectPath, ACTIVE_TASK_REL)),
    hasLocalDuplication: detectLocalGovernanceDuplication(projectPath),
    missingGitignoreEntries: findMissingGitignoreEntries(projectPath),
    hasLefthook: fs.existsSync(path.join(projectPath, LEFTHOOK_FILE)),
    hasCiWorkflow: hasCiWorkflow(files),
    hasCalmArchitecture: hasCalmArchitectureFile(projectPath, files),
    hasTestingMd: fs.existsSync(path.join(projectPath, TESTING_MD_FILE)),
    hasChangelogMd: changelogContent !== null,
    changelogHasUnreleased: changelogContent !== null && changelogContent.includes('## [Unreleased]'),
    hasSecurityMd: fs.existsSync(path.join(projectPath, SECURITY_MD_FILE)),
    hasCertifyScript: fs.existsSync(path.join(projectPath, CERTIFY_SCRIPT_REL)),
    detectedStacks,
  };
}

function buildGraphifyPillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  const hasGraph = snap.astGraphFiles.length > 0;
  const missing: string[] = [];
  if (!hasGraph) missing.push('graphify-out/graph.json (grafo AST)');
  if (!snap.hasGraphifyScript) missing.push(GRAPHIFY_SCRIPT_REL);
  let status: StandardPillarStatus = STATUS_PRESENT;
  if (!hasGraph) {
    status = STATUS_MISSING;
  } else if (!snap.hasGraphifyScript) {
    status = STATUS_PARTIAL;
  }
  return {
    id: 'graphify_ast',
    name: 'Grafo AST Graphify y Salud Topológica',
    status,
    required_for_tier: isTierAtLeast(snap.effectiveTier, TIER_STANDARD),
    min_tier: TIER_STANDARD,
    missing_items: missing,
    remediation:
      'Construye el grafo AST con inspect_ast_blast_radius(auto_build_if_missing: true) o ejecuta ./scripts/actualizar-grafos-graphify.sh (opcional: define .agents/boundaries.json).',
  };
}

function buildRuleZeroPillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  const missing: string[] = [];
  if (!snap.hasDockerComposeQa) missing.push(DOCKER_COMPOSE_QA_FILE);
  if (!snap.hasMakefile) missing.push(MAKEFILE_FILE);
  missing.push(...snap.missingBaseScripts);
  const totalChecks = 2 + BASE_RULE_ZERO_SCRIPTS.length;
  let status: StandardPillarStatus = STATUS_PRESENT;
  if (missing.length === totalChecks) {
    status = STATUS_MISSING;
  } else if (missing.length > 0) {
    status = STATUS_PARTIAL;
  }
  return {
    id: 'rule_zero_docker_infra',
    name: 'Rule Zero Docker Efímero y Scripts Base',
    status,
    required_for_tier: true,
    min_tier: TIER_STARTER,
    missing_items: missing,
    remediation:
      'Verifica Docker Engine activo (`qa-11x doctor`) e hidrata docker-compose.qa.yml, Makefile y scripts base con bootstrap_or_merge_11x o install-skill --include-scripts.',
  };
}

function collectMissingGovernanceItems(snap: ReadinessSnapshot): string[] {
  const missing: string[] = [];
  if (snap.isUpstreamRepo) {
    if (!snap.hasAgentsMd) missing.push(AGENTS_MD_FILE);
  } else {
    if (!snap.hasAgentsConnector) missing.push('AGENTS.md con bloque conector QA-11X');
    if (!snap.hasQa11xConfig) missing.push(`${QA_11X_JSON_FILE} (tier de adopción)`);
  }
  if (snap.hasLocalDuplication) missing.push('Eliminar skills/reglas globales duplicadas en .agents/');
  if (snap.missingGitignoreEntries.length > 0) {
    missing.push(`.gitignore entradas 11X: ${snap.missingGitignoreEntries.join(', ')}`);
  }
  return missing;
}

function buildGovernancePillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  const missing = collectMissingGovernanceItems(snap);
  let status: StandardPillarStatus = STATUS_PRESENT;
  if (!snap.hasAgentsMd && !snap.hasQa11xConfig && !snap.isUpstreamRepo) {
    status = STATUS_MISSING;
  } else if (missing.length > 0) {
    status = STATUS_PARTIAL;
  }
  return {
    id: 'thin_repo_governance',
    name: 'Gobernanza Thin-Repo, Conectores IA e Higiene .gitignore',
    status,
    required_for_tier: true,
    min_tier: TIER_STARTER,
    missing_items: missing,
    remediation:
      'Ejecuta init_or_append_agents_md, reconcile_agents_governance (parchea .gitignore y poda duplicados), quickstart (.qa-11x.json) y session_flight_recorder.',
  };
}

function buildCiHooksPillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  const missing: string[] = [];
  if (!snap.hasLefthook) missing.push(LEFTHOOK_FILE);
  if (!snap.hasCiWorkflow) missing.push('.github/workflows/qa-11x-pr.yml (o .gitlab-ci.yml)');
  let status: StandardPillarStatus = STATUS_PRESENT;
  if (missing.length === 2) {
    status = STATUS_MISSING;
  } else if (missing.length === 1) {
    status = STATUS_PARTIAL;
  }
  return {
    id: 'ci_hooks_automation',
    name: 'Git Hooks Locales (Lefthook) y CI Proporcional de PR',
    status,
    required_for_tier: isTierAtLeast(snap.effectiveTier, TIER_STANDARD),
    min_tier: TIER_STANDARD,
    missing_items: missing,
    remediation:
      'Instala lefthook.yml con bootstrap_or_merge_11x y genera .github/workflows/qa-11x-pr.yml mediante `npx @sinfallas/mcp-qa-11x quickstart`.',
  };
}

function buildDocsPillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  const missing: string[] = [];
  if (!snap.hasTestingMd) missing.push(TESTING_MD_FILE);
  if (!snap.hasChangelogMd) {
    missing.push(CHANGELOG_MD_FILE);
  } else if (!snap.changelogHasUnreleased) {
    missing.push('Sección ## [Unreleased] en CHANGELOG.md');
  }
  if (!snap.hasSecurityMd) missing.push(SECURITY_MD_FILE);
  if (!snap.hasCertifyScript) missing.push(CERTIFY_SCRIPT_REL);
  let status: StandardPillarStatus = STATUS_PRESENT;
  if (missing.length >= 4) {
    status = STATUS_MISSING;
  } else if (missing.length > 0) {
    status = STATUS_PARTIAL;
  }
  return {
    id: 'documentation_traceability',
    name: 'Documentación Viva, Seguridad y Compuerta 10/10',
    status,
    required_for_tier: isTierAtLeast(snap.effectiveTier, TIER_STANDARD),
    min_tier: TIER_STANDARD,
    missing_items: missing,
    remediation:
      'Crea/sincroniza TESTING.md, CHANGELOG.md (con ## [Unreleased]), SECURITY.md e instala .agents/scripts/certify_task_completion.sh.',
  };
}

function buildCalmPillar(snap: ReadinessSnapshot): StandardReadinessPillar {
  return {
    id: 'calm_architecture',
    name: 'Arquitectura como Código FINOS CALM (7 controles)',
    status: snap.hasCalmArchitecture ? STATUS_PRESENT : STATUS_MISSING,
    required_for_tier: snap.effectiveTier === TIER_ENTERPRISE,
    min_tier: TIER_ENTERPRISE,
    missing_items: snap.hasCalmArchitecture ? [] : ['architecture/*.calm.json'],
    remediation:
      'Declara la topología en architecture/<proyecto>.calm.json y valídala con validate_calm_architecture.',
  };
}

function buildDynamicVerificationPillars(snap: ReadinessSnapshot): StandardReadinessPillar[] {
  const pillars: StandardReadinessPillar[] = [
    {
      id: 'test_pyramid_13_layers',
      name: 'Pirámide de Pruebas 11X (13 Capas, >=95% cov, Mutación, BDD)',
      status: STATUS_PENDING,
      required_for_tier: isTierAtLeast(snap.effectiveTier, TIER_STANDARD),
      min_tier: TIER_STANDARD,
      missing_items: ['Ejecutar audit_test_pyramid_gaps para evaluar L01..L13 y archivos huérfanos'],
      remediation: 'Invoca audit_test_pyramid_gaps(project_path) para auditar las 13 capas.',
    },
    {
      id: 'security_stig_owasp',
      name: 'Seguridad Estática DISA STIG V6R5 / OWASP v4.2 (22 controles / 37 reglas + SARIF)',
      status: STATUS_PENDING,
      required_for_tier: true,
      min_tier: TIER_STARTER,
      missing_items: ['Ejecutar audit_security_stig_owasp para validar las 37 reglas estáticas y SARIF'],
      remediation: 'Invoca audit_security_stig_owasp(project_path) y certifica con certify_11x_gate.',
    },
  ];
  const activeSpecialized = snap.detectedStacks.filter(
    (s) => SPECIALIZED_STACK_NAMES.has(s) || FRONTEND_STACK_NAMES.has(s)
  );
  if (activeSpecialized.length > 0) {
    pillars.push({
      id: 'specialized_stacks',
      name: `Controles Especializados (${activeSpecialized.join(', ')})`,
      status: STATUS_PENDING,
      required_for_tier: isTierAtLeast(snap.effectiveTier, TIER_STANDARD),
      min_tier: TIER_STANDARD,
      missing_items: [`Validar herramientas especializadas para: ${activeSpecialized.join(', ')}`],
      remediation:
        'Según stack: audit_vibe_prototype (vibe-rescue), evaluate_agent_trajectory + run_llm_red_team (ai-evals), qa-mobile (mobile-appium), Playwright/axe-core + UI-11X-03 (vue3/react-frontend).',
    });
  }
  return pillars;
}

function buildRecommendedAuditSequence(snap: ReadinessSnapshot): string[] {
  const seq: string[] = [];
  if (snap.astGraphFiles.length === 0) {
    seq.push('inspect_ast_blast_radius(auto_build_if_missing: true)');
  }
  seq.push('audit_test_pyramid_gaps', 'audit_security_stig_owasp');
  if (snap.hasLocalDuplication || snap.missingGitignoreEntries.length > 0 || !snap.hasAgentsConnector) {
    seq.push('reconcile_agents_governance(dry_run: true)');
  }
  if (snap.hasCalmArchitecture || snap.effectiveTier === TIER_ENTERPRISE) {
    seq.push('validate_calm_architecture');
  }
  if (snap.detectedStacks.includes('vibe-rescue')) {
    seq.push('audit_vibe_prototype');
  }
  if (snap.detectedStacks.includes('ai-evals')) {
    seq.push('evaluate_agent_trajectory', 'run_llm_red_team');
  }
  seq.push('certify_11x_gate');
  return seq;
}

/** Evaluates full QA-11X standard compliance readiness across all pillars and adoption tiers. */
export function evaluateStandard11xReadiness(
  projectPath: string,
  detectedStacks: readonly string[],
  files: readonly string[]
): Standard11xReadiness {
  const snap = collectReadinessSnapshot(projectPath, detectedStacks, files);
  const pillars: StandardReadinessPillar[] = [
    buildGraphifyPillar(snap),
    buildRuleZeroPillar(snap),
    buildGovernancePillar(snap),
    buildCiHooksPillar(snap),
    buildDocsPillar(snap),
    buildCalmPillar(snap),
    ...buildDynamicVerificationPillars(snap),
  ];

  const missingMandatory = pillars
    .filter((p) => p.required_for_tier && (p.status === STATUS_MISSING || p.status === STATUS_PARTIAL))
    .map((p) => p.id);

  return {
    declared_tier: snap.declaredTier,
    effective_tier: snap.effectiveTier,
    tier_confirmed_by_user: snap.tierConfirmedByUser,
    qa_11x_banner: formatQa11xStatusBanner(snap.effectiveTier, 'AUTO'),
    ast_graph_present: snap.astGraphFiles.length > 0,
    ast_graph_files: snap.astGraphFiles,
    has_graphify_script: snap.hasGraphifyScript,
    has_boundaries_config: snap.hasBoundariesConfig,
    has_agents_md: snap.hasAgentsMd,
    has_agents_connector: snap.hasAgentsConnector,
    has_qa_11x_config: snap.hasQa11xConfig,
    has_active_task_md: snap.hasActiveTaskMd,
    has_local_governance_duplication: snap.hasLocalDuplication,
    missing_gitignore_entries: snap.missingGitignoreEntries,
    has_ci_workflow: snap.hasCiWorkflow,
    has_calm_architecture: snap.hasCalmArchitecture,
    has_security_md: snap.hasSecurityMd,
    changelog_has_unreleased: snap.changelogHasUnreleased,
    missing_base_scripts: snap.missingBaseScripts,
    pillars,
    missing_mandatory_pillars: missingMandatory,
    recommended_audit_sequence: buildRecommendedAuditSequence(snap),
  };
}

/** Projects structural meta-gates from standard readiness for audit_test_pyramid_gaps. */
export function buildPyramidMetaGatesAudit(
  readiness: Standard11xReadiness
): TestPyramidMetaGateAudit[] {
  const targetIds = new Set([
    'graphify_ast',
    'rule_zero_docker_infra',
    'thin_repo_governance',
    'ci_hooks_automation',
    'calm_architecture',
    'documentation_traceability',
  ]);
  return readiness.pillars
    .filter((p) => targetIds.has(p.id))
    .map((p) => ({
      gate_id: p.id,
      gate_name: p.name,
      status: p.status,
      required_for_tier: p.required_for_tier,
      missing_requirements: [...p.missing_items],
      remediation: p.remediation,
    }));
}
