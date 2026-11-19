// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONNECTOR_START_MARKER, CONNECTOR_END_MARKER } from './init-agents-md.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import type { ReconcileAgentsResult, ReconciledRuleItem } from '../types.js';

export const RECONCILE_AGENTS_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x reconcile-agents [dir] [opciones]',
  '',
  'Opciones:',
  '  --project-path, --dir, -p <dir>  Directorio del proyecto destino (por defecto: cwd)',
  '  --dry-run                        Simula poda sin modificar archivos ni respaldos',
  '  --help, -h                       Muestra esta ayuda y sale con código 0',
].join('\n');

const UTF8 = 'utf-8';
const AGENTS_DIR = '.agents';
const RULES_DIR = 'rules';
const SKILLS_DIR = 'skills';
const BACKUPS_DIR = 'backups';
const DOMAIN_PREFIX = 'domain_';
const AGENTS_MD_FILENAME = 'AGENTS.md';

export const CANONICAL_GLOBAL_RULE_FILES = new Set([
  'mandatory_qa_pyramid_and_doc_sync.md',
  'secure_development_and_testing_guidelines.md',
  'frontend_parity_and_closure.md',
  'continuous_agent_evolution.md',
  'anti_regression_and_side_effects_guardrail.md',
  'ground_truth_fixtures_and_negative_invariants.md',
  'active_task_and_planning_resilience.md',
  'git_closure_gate.md',
]);

export const CANONICAL_GLOBAL_SKILL_DIRS = new Set([
  'qa-11x-architect',
  'qa-11x-devsecops-hardener',
  'qa-11x-systematic-debugging',
  'qa-11x-screenplay-builder',
  'qa-11x-llm-evaluator',
  'qa-11x-vibe-rescue',
  'qa-11x-docker-certifier',
  'docker-trivy-keydb-hardening',
  'graphify-ast-navigator',
  'refactoring-ui',
  'tactical-patterns-11x',
]);

/**
 * Huellas semánticas de las secciones canónicas de los 8 archivos .agents/rules/*.md
 * de qa-testing-blueprints (en inglés y español), utilizadas para podar contenido global
 * y extraer únicamente secciones de dominio personalizadas si un proyecto consumidor
 * modificó localmente uno de los 8 archivos canónicos.
 */
export const CANONICAL_RULE_SECTION_FINGERPRINTS = [
  '# canonical rule',
  'mandatory directive: qa 11x pyramid',
  'supreme directive: mandatory 11x test creation',
  'rule zero, 3-path proportional execution',
  'continuous mandatory documentation, governance & ast graph sync',
  'pre-conclusion verification gate',
  'security-by-design & multi-layer testing guidelines',
  'multi-layer testing & anti-mock blindness',
  'security-by-design directives',
  'pre-commit security checklist',
  'terminal ↔ frontend parity & task closure protocol',
  'terminal ↔ frontend parity invariants',
  'proactive vulnerability audit',
  'mandatory task closure protocol',
  'continuous agent & system prompt evolution directive',
  'the autonomous evolution mandate',
  'guardrails for agent modifications',
  'anti-regression & side-effects guardrail',
  'pre-modification impact & blast-radius analysis',
  'strict pre-build static analysis',
  'frontend anti-degradation',
  'high-iq token economy & context preservation guardrails',
  'cross-functional smoke verification checklist',
  'ground-truth fixtures & negative invariants governance',
  'the mock blindness & silo temporal blindness anti-patterns',
  'universal trimodal ground-truth fixture matrix',
  'negative invariant enforcement',
  'active task tracking & planning tool resilience guardrail',
  'active task tracking & atomic flight recorder',
  'atomic flight recorder invariant',
  'mandatory protocol & token budget',
  'rationale & core invariant',
  'the dual planning & persistence protocol',
  'mandatory requirements & token budget',
  'human-confirmed remote push gate',
  'zero blind remote mutation',
  'directiva obligatoria: pirámide qa 11x',
  'directiva suprema: creación obligatoria de pruebas 11x',
  'regla cero',
  'sincronización documental continua',
  'compuerta de verificación previa a la conclusión',
  'seguridad por diseño y directrices de pruebas',
  'pruebas multicapa y prevención de ceguera por mocks',
  'directrices de seguridad por diseño',
  'lista de verificación de seguridad pre-commit',
  'paridad terminal ↔ frontend y protocolo de cierre',
  'invariantes de paridad terminal ↔ frontend',
  'auditoría proactiva de vulnerabilidades',
  'protocolo obligatorio de cierre de tareas',
  'evolución continua del agente y del system prompt',
  'mandato de evolución autónoma',
  'guardarraíles para modificaciones del agente',
  'guardarraíl anti-regresión y efectos secundarios',
  'análisis de impacto y radio de explosión',
  'análisis estático pre-build estricto',
  'anti-degradación frontend',
  'verificación de humo multifuncional',
  'gobernanza de fixtures ground-truth e invariantes negativos',
  'antipatrón de ceguera por mocks',
  'matriz trimodal universal de fixtures',
  'aplicación de invariantes negativos',
  'seguimiento de tarea activa y resiliencia',
  'protocolo dual de planificación y persistencia',
];

/**
 * Huellas semánticas de directivas que nacieron en proyectos consumidores (ej. rosgrid)
 * y ya fueron promovidas oficialmente a qa-testing-blueprints (SKILL.md + .agents/rules/).
 */
export const PROMOTED_INVARIANT_FINGERPRINTS = [
  'silo mock blindness',
  'cross-module state propagation',
  'propagación transversal de estado',
  '2-state static blindness',
  '3-phase temporal lifecycle',
  '3 fases temporales',
  '3 fases del reloj',
  'audit payload & semantic badge integrity',
  'prohibición de mocks ciegos en auditoría',
  'dual auto + manual refresh invariant',
  'invariante de refresco dual',
  'invariante anti-silo',
  'high-iq token economy',
  '3-path proportional execution',
  'ast/grep-first, windowed-read-second',
  'graphify ast-first',
  'subagent context isolation',
  'zero redundant re-read',
  'after_begin',
  'nobypassrls',
  'pg_advisory_xact_lock',
  'coverage_file=/tmp/.coverage',
  'relforcerowsecurity',
  '--cache-dir=/tmp/mypy',
  '--import-mode=importlib',
  'service-layer rbac defense',
  'multi-step pre-auth',
  'challenge continuity invariant',
  'qa-test-sync-01',
  'existing test co-evolution',
  'co-evolución de pruebas preexistentes',
];

export function isPromotedSection(sectionText: string): boolean {
  const lower = sectionText.toLowerCase();
  for (const fp of PROMOTED_INVARIANT_FINGERPRINTS) {
    if (lower.includes(fp)) {
      return true;
    }
  }
  return false;
}

export function isCanonicalRuleSection(sectionText: string): boolean {
  const lower = sectionText.toLowerCase();
  for (const fp of CANONICAL_RULE_SECTION_FINGERPRINTS) {
    if (lower.includes(fp)) {
      return true;
    }
  }
  return false;
}

export function isUpstreamBlueprintsRepo(projectPath: string): boolean {
  return (
    fs.existsSync(path.join(projectPath, 'scripts', 'generar-manifiesto.py')) &&
    fs.existsSync(path.join(projectPath, 'manifest.json'))
  );
}

function isLicenseCommentLine(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return (
    trimmed.startsWith('# spdx-license-identifier:') ||
    trimmed.startsWith('# copyright (c)')
  );
}

function hasRealMarkdownHeading(lines: string[]): boolean {
  return lines.some((l) => /^#{1,4}\s+/.test(l) && !isLicenseCommentLine(l));
}

export function splitMarkdownSections(content: string): string[] {
  if (!content.trim()) {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      current.push(line);
      continue;
    }

    const isHeading = !inCodeFence && /^#{1,4}\s+/.test(line) && !isLicenseCommentLine(line);
    if (isHeading && hasRealMarkdownHeading(current)) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join('\n'));
  }
  return sections;
}

function ensureBackupFile(
  projectPath: string,
  relFilePath: string,
  backupDir: string
): void {
  const srcFull = path.join(projectPath, relFilePath);
  if (!fs.existsSync(srcFull)) return;
  const destFull = path.join(backupDir, relFilePath);
  fs.mkdirSync(path.dirname(destFull), { recursive: true });
  fs.copyFileSync(srcFull, destFull);
}

interface ReconcileRuleCtx {
  readonly fullPath: string;
  readonly relPath: string;
  readonly fileName: string;
  readonly dryRun: boolean;
  readonly projectPath: string;
  readonly backupDir: string;
  readonly extractedDomainBlocks: string[];
}

function processNonCanonicalRuleFile(ctx: ReconcileRuleCtx): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  if (ctx.fileName.startsWith(DOMAIN_PREFIX)) {
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_PRESERVED',
        details: 'Archivo de dominio con prefijo domain_* preservado intacto.',
      },
      removedCount: 0,
      preservedCount: 1,
    };
  }

  const content = fs.readFileSync(ctx.fullPath, UTF8);
  const sections = splitMarkdownSections(content);
  const domainOnlySections: string[] = [];
  let removedCount = 0;

  for (const sec of sections) {
    if (isPromotedSection(sec)) {
      removedCount++;
    } else if (sec.trim().length > 0) {
      domainOnlySections.push(sec);
    }
  }

  if (!ctx.dryRun) {
    ensureBackupFile(ctx.projectPath, ctx.relPath, ctx.backupDir);
    fs.unlinkSync(ctx.fullPath);
  }

  if (domainOnlySections.length > 0) {
    ctx.extractedDomainBlocks.push(...domainOnlySections);
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
        details: `Eliminadas ${removedCount} sección(es) ya promovidas al estándar global y extraídas ${domainOnlySections.length} sección(es) de dominio.`,
      },
      removedCount,
      preservedCount: domainOnlySections.length,
    };
  }

  return {
    item: {
      file: ctx.relPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Archivo redundante eliminado (${removedCount} sección(es) ya forman parte de qa-testing-blueprints global).`,
    },
    removedCount: Math.max(1, removedCount),
    preservedCount: 0,
  };
}

function filterPromotedSectionsFromText(text: string): { kept: string[]; removedCount: number } {
  const sections = splitMarkdownSections(text);
  const kept: string[] = [];
  let removedCount = 0;
  for (const sec of sections) {
    if (isPromotedSection(sec)) {
      removedCount++;
    } else {
      kept.push(sec);
    }
  }
  return { kept, removedCount };
}

function cleanPromotedDuplicatesInAgentsMd(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { item: ReconciledRuleItem | null; removedCount: number } {
  const agentsMdPath = path.join(projectPath, AGENTS_MD_FILENAME);
  if (!fs.existsSync(agentsMdPath)) {
    return { item: null, removedCount: 0 };
  }

  const content = fs.readFileSync(agentsMdPath, UTF8);
  const startIdx = content.indexOf(CONNECTOR_START_MARKER);
  const endIdx = content.indexOf(CONNECTOR_END_MARKER);

  let preConnector = content;
  let connectorBlock = '';
  let postConnector = '';

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    preConnector = content.slice(0, startIdx);
    connectorBlock = content.slice(startIdx, endIdx + CONNECTOR_END_MARKER.length);
    postConnector = content.slice(endIdx + CONNECTOR_END_MARKER.length);
  }

  const preRes = filterPromotedSectionsFromText(preConnector);
  const postRes = filterPromotedSectionsFromText(postConnector);
  const totalRemoved = preRes.removedCount + postRes.removedCount;

  if (totalRemoved === 0) {
    return { item: null, removedCount: 0 };
  }

  if (!dryRun) {
    ensureBackupFile(projectPath, AGENTS_MD_FILENAME, backupDir);
    const assembledParts: string[] = [];
    if (preRes.kept.length > 0) assembledParts.push(preRes.kept.join('\n\n').trimEnd());
    if (connectorBlock) assembledParts.push(connectorBlock.trim());
    if (postRes.kept.length > 0) assembledParts.push(postRes.kept.join('\n\n').trim());

    fs.writeFileSync(agentsMdPath, assembledParts.join('\n\n').trimEnd() + '\n', UTF8);
  }

  return {
    item: {
      file: AGENTS_MD_FILENAME,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Podadas ${totalRemoved} sección(es) duplicadas en AGENTS.md que ya residen en la skill global qa-11x-architect.`,
    },
    removedCount: totalRemoved,
  };
}

function processCanonicalRuleFileInConsumer(ctx: Omit<ReconcileRuleCtx, 'fileName'>): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  const content = fs.readFileSync(ctx.fullPath, UTF8);
  const sections = splitMarkdownSections(content);
  const domainOnlySections: string[] = [];
  let removedCount = 0;

  for (const sec of sections) {
    if (isPromotedSection(sec) || isCanonicalRuleSection(sec)) {
      removedCount++;
    } else if (sec.trim().length > 0) {
      domainOnlySections.push(sec);
    }
  }

  if (!ctx.dryRun) {
    ensureBackupFile(ctx.projectPath, ctx.relPath, ctx.backupDir);
    fs.unlinkSync(ctx.fullPath);
  }

  if (domainOnlySections.length > 0) {
    ctx.extractedDomainBlocks.push(...domainOnlySections);
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
        details: `Archivo canónico global eliminado tras extraer ${domainOnlySections.length} sección(es) de dominio personalizada(s) y podar ${removedCount} sección(es) canónicas/promovidas.`,
      },
      removedCount: Math.max(1, removedCount),
      preservedCount: domainOnlySections.length,
    };
  }

  return {
    item: {
      file: ctx.relPath,
      classification: 'CANONICAL_CLEAN',
      details:
        'Archivo canónico global respaldado en .agents/backups/ y eliminado de .agents/rules/ local (consumido desde la skill global).',
    },
    removedCount: Math.max(1, removedCount),
    preservedCount: 0,
  };
}

interface ReconcileRulesDirOpts {
  readonly resolvedPath: string;
  readonly rulesDirPath: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
  readonly extractedDomainBlocks: string[];
}

function reconcileRulesDir(opts: ReconcileRulesDirOpts): {
  items: ReconciledRuleItem[];
  removed: number;
  preserved: number;
} {
  const items: ReconciledRuleItem[] = [];
  let removed = 0;
  let preserved = 0;

  if (!fs.existsSync(opts.rulesDirPath)) {
    return { items, removed, preserved };
  }

  const upstreamRepo = isUpstreamBlueprintsRepo(opts.resolvedPath);
  const entries = fs.readdirSync(opts.rulesDirPath).filter((f) => f.endsWith('.md'));
  for (const fileName of entries) {
    const relPath = path.join(AGENTS_DIR, RULES_DIR, fileName);
    const fullPath = path.join(opts.rulesDirPath, fileName);

    if (CANONICAL_GLOBAL_RULE_FILES.has(fileName)) {
      if (upstreamRepo) {
        items.push({
          file: relPath,
          classification: 'CANONICAL_CLEAN',
          details: 'Archivo canónico global preservado en el repositorio fuente qa-testing-blueprints.',
        });
        continue;
      }

      const canonicalRes = processCanonicalRuleFileInConsumer({
        fullPath,
        relPath,
        dryRun: opts.dryRun,
        projectPath: opts.resolvedPath,
        backupDir: opts.backupDir,
        extractedDomainBlocks: opts.extractedDomainBlocks,
      });
      items.push(canonicalRes.item);
      removed += canonicalRes.removedCount;
      preserved += canonicalRes.preservedCount;
      continue;
    }

    const res = processNonCanonicalRuleFile({
      fullPath,
      relPath,
      fileName,
      dryRun: opts.dryRun,
      projectPath: opts.resolvedPath,
      backupDir: opts.backupDir,
      extractedDomainBlocks: opts.extractedDomainBlocks,
    });
    items.push(res.item);
    removed += res.removedCount;
    preserved += res.preservedCount;
  }

  return { items, removed, preserved };
}

function reconcileSkillsDir(
  resolvedPath: string,
  dryRun: boolean,
  backupDir: string
): {
  items: ReconciledRuleItem[];
  removed: number;
} {
  const items: ReconciledRuleItem[] = [];
  let removed = 0;

  if (isUpstreamBlueprintsRepo(resolvedPath)) {
    return { items, removed };
  }

  const skillsDirPath = path.join(resolvedPath, AGENTS_DIR, SKILLS_DIR);
  if (!fs.existsSync(skillsDirPath)) {
    return { items, removed };
  }

  const entries = fs.readdirSync(skillsDirPath);
  for (const entry of entries) {
    if (!CANONICAL_GLOBAL_SKILL_DIRS.has(entry)) {
      continue;
    }

    const relSkillPath = path.join(AGENTS_DIR, SKILLS_DIR, entry);
    const fullSkillPath = path.join(skillsDirPath, entry);

    if (!dryRun) {
      const destBackup = path.join(backupDir, relSkillPath);
      fs.mkdirSync(path.dirname(destBackup), { recursive: true });
      fs.cpSync(fullSkillPath, destBackup, { recursive: true });
      fs.rmSync(fullSkillPath, { recursive: true, force: true });
    }

    items.push({
      file: relSkillPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details:
        'Copia local de skill canónica respaldada en .agents/backups/ y eliminada de .agents/skills/ (consumida desde directorio global del agente).',
    });
    removed++;
  }

  if (!dryRun && fs.existsSync(skillsDirPath) && fs.readdirSync(skillsDirPath).length === 0) {
    fs.rmdirSync(skillsDirPath);
  }

  return { items, removed };
}

interface PersistDomainRulesArgs {
  readonly resolvedPath: string;
  readonly rulesDirPath: string;
  readonly domainRulesFile: string;
  readonly extractedDomainBlocks: string[];
  readonly projectSlug: string;
}

function persistExtractedDomainRules(args: PersistDomainRulesArgs): void {
  fs.mkdirSync(args.rulesDirPath, { recursive: true });
  const domainFullPath = path.join(args.resolvedPath, args.domainRulesFile);
  const header = `# Domain-Specific Governance Rules (${args.projectSlug})\n\n`;
  const existingDomain = fs.existsSync(domainFullPath)
    ? fs.readFileSync(domainFullPath, UTF8) + '\n\n'
    : header;
  fs.writeFileSync(
    domainFullPath,
    existingDomain + args.extractedDomainBlocks.join('\n\n') + '\n',
    UTF8
  );
}

export function reconcileAgentsGovernance(options: {
  projectPath: string;
  dryRun?: boolean;
}): Promise<ReconcileAgentsResult> {
  return Promise.resolve().then(() => executeReconcileAgentsGovernance(options));
}

function executeReconcileAgentsGovernance(options: {
  projectPath: string;
  dryRun?: boolean;
}): ReconcileAgentsResult {
  const resolvedPath = resolveSafeProjectPath(options.projectPath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Directorio de proyecto inválido: ${resolvedPath}`);
  }

  const dryRun = options.dryRun ?? true;
  const projectSlug =
    path
      .basename(resolvedPath)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'project';
  const rulesDirPath = path.join(resolvedPath, AGENTS_DIR, RULES_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(resolvedPath, AGENTS_DIR, BACKUPS_DIR, timestamp);

  const extractedDomainBlocks: string[] = [];
  const rulesSummary = reconcileRulesDir({
    resolvedPath,
    rulesDirPath,
    dryRun,
    backupDir,
    extractedDomainBlocks,
  });

  const reconciledItems: ReconciledRuleItem[] = [...rulesSummary.items];
  let totalRemoved = rulesSummary.removed;
  const totalPreserved = rulesSummary.preserved;

  const skillsSummary = reconcileSkillsDir(resolvedPath, dryRun, backupDir);
  reconciledItems.push(...skillsSummary.items);
  totalRemoved += skillsSummary.removed;

  const agentsRes = cleanPromotedDuplicatesInAgentsMd(resolvedPath, dryRun, backupDir);
  if (agentsRes.item) {
    reconciledItems.push(agentsRes.item);
    totalRemoved += agentsRes.removedCount;
  }

  let domainRulesFile: string | null = null;
  if (extractedDomainBlocks.length > 0) {
    domainRulesFile = path.join(
      AGENTS_DIR,
      RULES_DIR,
      `${DOMAIN_PREFIX}${projectSlug}_rules.md`
    );
    if (!dryRun) {
      persistExtractedDomainRules({
        resolvedPath,
        rulesDirPath,
        domainRulesFile,
        extractedDomainBlocks,
        projectSlug,
      });
    }
  }

  const backupCreated = !dryRun && fs.existsSync(backupDir);

  return {
    project_path: resolvedPath,
    dry_run: dryRun,
    backup_dir: backupCreated ? backupDir : null,
    domain_rules_file: domainRulesFile,
    removed_duplicate_sections_count: totalRemoved,
    preserved_domain_sections_count: totalPreserved,
    reconciled_items: reconciledItems,
  };
}

function readReconcilePathFlagValue(
  args: readonly string[],
  index: number,
  arg: string
): { value: string; step: number } | null {
  for (const longFlag of ['--project-path', '--dir']) {
    if (arg.startsWith(`${longFlag}=`)) {
      const inlineValue = arg.slice(longFlag.length + 1);
      if (!inlineValue) {
        throw new Error(`Falta el valor requerido para la opción '${longFlag}'.`);
      }
      return { value: inlineValue, step: 0 };
    }
  }
  if (arg === '--project-path' || arg === '--dir' || arg === '-p') {
    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith('-')) {
      throw new Error(`Falta el valor requerido para la opción '${arg}'.`);
    }
    return { value: nextValue, step: 1 };
  }
  return null;
}

export interface ReconcileAgentsCliOptions {
  readonly cwd?: string;
  readonly log?: (message: string) => void;
}

export function parseReconcileAgentsArgs(
  args: readonly string[],
  defaultCwd: string = process.cwd()
): {
  projectPath: string;
  dryRun: boolean;
  help: boolean;
} {
  let projectPath = defaultCwd;
  let hasPositionalDir = false;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = pickAt(args, i);
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const pathOpt = readReconcilePathFlagValue(args, i, arg);
    if (pathOpt) {
      projectPath = pathOpt.value;
      i += pathOpt.step;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(
        `Opción CLI desconocida en reconcile-agents: '${arg}'. Ejecuta con --help para ver las opciones válidas.`
      );
    }
    if (hasPositionalDir) {
      throw new Error(`Argumento posicional inesperado en reconcile-agents: '${arg}'.`);
    }
    projectPath = arg;
    hasPositionalDir = true;
  }

  return { projectPath, dryRun, help };
}

export async function runReconcileAgentsCli(
  args: string[],
  options?: ReconcileAgentsCliOptions
): Promise<void> {
  const log = options?.log ?? console.log;
  if (args.includes('--help') || args.includes('-h')) {
    log(RECONCILE_AGENTS_HELP_TEXT);
    return;
  }
  const { projectPath, dryRun } = parseReconcileAgentsArgs(args, options?.cwd ?? process.cwd());
  const result = await reconcileAgentsGovernance({ projectPath, dryRun });
  log(
    `✔ [Reconcile 11X] ${result.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${result.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
  );
  if (result.domain_rules_file) {
    log(`ℹ Reglas de dominio aisladas en: ${result.domain_rules_file}`);
  }
  if (result.backup_dir) {
    log(`ℹ Respaldo creado en: ${result.backup_dir}`);
  }
}
