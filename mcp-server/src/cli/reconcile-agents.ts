// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONNECTOR_START_MARKER, CONNECTOR_END_MARKER } from './init-agents-md.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import { hasHelpFlag, resolveCliProjectPath } from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';
import { pickAt } from '../utils/diagnosticFormatter.js';
import { classifySectionForPruning, dedupeRepeatedHeadings } from './reconcile/sectionPruner.js';
import {
  assertNoSymlinkSegmentsFromRoot,
  collectReadOnlyAdvisories,
  consolidateLooseBackups,
  ensureBackupFile,
  ensureGitignoreHygiene,
  hardenBackupTreePermissions,
  reconcileBridgeFiles,
  reconcileMonorepoAndRetiredScripts,
  reconcileMultiAgentShadowSkills,
} from './reconcile/repoHygiene.js';
import { scanWorkspacesForReconcile } from './reconcile/workspaceScanner.js';
import type { ReconcileAgentsResult, ReconciledRuleItem } from '../types.js';

export const RECONCILE_AGENTS_HELP_TEXT = renderSubcommandHelpText('reconcile-agents', 'en');

const UTF8 = 'utf-8';
const AGENTS_DIR = '.agents';
const RULES_DIR = 'rules';
const SKILLS_DIR = 'skills';
const BACKUPS_DIR = 'backups';
const DOMAIN_PREFIX = 'domain_';
const AGENTS_MD_FILENAME = 'AGENTS.md';
const LABEL_BACKUP_DEST = 'destino de respaldo';
const LABEL_RULES_DIR = 'directorio de reglas';
const LABEL_SKILLS_DIR = 'directorio de skills';

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
  'qa-11x-reverse-specs',
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
 * Huellas semánticas de directivas que nacieron en proyectos consumidores (ej. acme-service)
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

interface ReconcileRuleCtx {
  readonly fullPath: string;
  readonly relPath: string;
  readonly fileName: string;
  readonly dryRun: boolean;
  readonly upstreamRepo: boolean;
  readonly projectPath: string;
  readonly backupDir: string;
  readonly extractedDomainBlocks: string[];
  readonly advisories: string[];
}

interface FilteredSectionsSummary {
  readonly kept: string[];
  readonly removedCount: number;
  readonly hybridCount: number;
  readonly domainCount: number;
}

function accumulateSection(
  sec: string,
  isCanonicalFile: boolean,
  acc: { kept: string[]; removedCount: number; hybridCount: number; domainCount: number }
): void {
  if (!sec.trim()) return;
  const decision = classifySectionForPruning({
    sectionText: sec,
    isCanonicalFile,
    isPromoted: isPromotedSection,
    isCanonical: isCanonicalRuleSection,
  });
  if (decision === 'prune') {
    acc.removedCount++;
    return;
  }
  if (decision === 'hybrid_keep') acc.hybridCount++;
  else acc.domainCount++;
  acc.kept.push(sec);
}

function filterPromotedSectionsFromText(
  text: string,
  isCanonicalFile: boolean
): FilteredSectionsSummary {
  const acc = { kept: [] as string[], removedCount: 0, hybridCount: 0, domainCount: 0 };
  for (const sec of splitMarkdownSections(text)) {
    accumulateSection(sec, isCanonicalFile, acc);
  }
  const deduped = dedupeRepeatedHeadings(acc.kept);
  return {
    kept: deduped.kept,
    removedCount: acc.removedCount + deduped.removedCount,
    hybridCount: acc.hybridCount,
    domainCount: acc.domainCount,
  };
}

function processDomainRuleFile(ctx: ReconcileRuleCtx): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  if (ctx.upstreamRepo) {
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_PRESERVED',
        details: 'Archivo de dominio preservado en repositorio upstream.',
      },
      removedCount: 0,
      preservedCount: 1,
    };
  }
  const content = fs.readFileSync(ctx.fullPath, UTF8);
  const filtered = filterPromotedSectionsFromText(content, false);
  if (filtered.removedCount === 0 && filtered.hybridCount === 0) {
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
  if (filtered.removedCount > 0 && !ctx.dryRun) {
    ensureBackupFile(ctx.projectPath, ctx.relPath, ctx.backupDir);
    const updated = filtered.kept.length > 0 ? `${filtered.kept.join('\n\n').trimEnd()}\n` : '';
    fs.writeFileSync(ctx.fullPath, updated, UTF8);
  }
  if (filtered.hybridCount > 0) {
    const adv = `Secciones híbridas preservadas para revisión manual en ${ctx.relPath}.`;
    ctx.advisories.push(adv);
    return {
      item: { file: ctx.relPath, classification: 'HYBRID_SECTION_REVIEW_RECOMMENDED', details: adv },
      removedCount: filtered.removedCount,
      preservedCount: Math.max(1, filtered.domainCount + filtered.hybridCount),
    };
  }
  return {
    item: {
      file: ctx.relPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Podadas ${filtered.removedCount} sección(es) globales promovidas en ${ctx.relPath} preservando reglas de dominio.`,
    },
    removedCount: filtered.removedCount,
    preservedCount: Math.max(1, filtered.domainCount),
  };
}

function processNonCanonicalRuleFile(ctx: ReconcileRuleCtx): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  if (ctx.fileName.startsWith(DOMAIN_PREFIX)) {
    return processDomainRuleFile(ctx);
  }

  const content = fs.readFileSync(ctx.fullPath, UTF8);
  const filtered = filterPromotedSectionsFromText(content, false);

  if (!ctx.dryRun) {
    ensureBackupFile(ctx.projectPath, ctx.relPath, ctx.backupDir);
    fs.unlinkSync(ctx.fullPath);
  }

  if (filtered.hybridCount > 0) {
    ctx.advisories.push(
      `Secciones híbridas extraídas a archivo de dominio desde ${ctx.relPath} (revisar separación).`
    );
  }

  if (filtered.kept.length > 0) {
    ctx.extractedDomainBlocks.push(...filtered.kept);
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
        details: `Eliminadas ${filtered.removedCount} sección(es) ya promovidas al estándar global y extraídas ${filtered.kept.length} sección(es) de dominio.`,
      },
      removedCount: filtered.removedCount,
      preservedCount: filtered.kept.length,
    };
  }

  return {
    item: {
      file: ctx.relPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Archivo redundante eliminado (${filtered.removedCount} sección(es) ya forman parte de qa-testing-blueprints global).`,
    },
    removedCount: Math.max(1, filtered.removedCount),
    preservedCount: 0,
  };
}

function splitAgentsConnectorWindow(content: string): {
  preConnector: string;
  connectorBlock: string;
  postConnector: string;
} {
  const startIdx = content.indexOf(CONNECTOR_START_MARKER);
  const endIdx = content.indexOf(CONNECTOR_END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return {
      preConnector: content.slice(0, startIdx),
      connectorBlock: content.slice(startIdx, endIdx + CONNECTOR_END_MARKER.length),
      postConnector: content.slice(endIdx + CONNECTOR_END_MARKER.length),
    };
  }
  return { preConnector: content, connectorBlock: '', postConnector: '' };
}

function writeUpdatedAgentsMd(
  agentsMdPath: string,
  parts: { readonly pre: readonly string[]; readonly connector: string; readonly post: readonly string[] }
): void {
  const assembled: string[] = [];
  if (parts.pre.length > 0) assembled.push(parts.pre.join('\n\n').trimEnd());
  if (parts.connector) assembled.push(parts.connector.trim());
  if (parts.post.length > 0) assembled.push(parts.post.join('\n\n').trim());
  fs.writeFileSync(agentsMdPath, `${assembled.join('\n\n').trimEnd()}\n`, UTF8);
}

function cleanPromotedDuplicatesInAgentsMd(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { items: ReconciledRuleItem[]; removedCount: number; advisories: string[] } {
  if (isUpstreamBlueprintsRepo(projectPath)) {
    return { items: [], removedCount: 0, advisories: [] };
  }
  const agentsMdPath = path.join(projectPath, AGENTS_MD_FILENAME);
  const agentsStat = assertNoSymlinkSegmentsFromRoot(projectPath, agentsMdPath, AGENTS_MD_FILENAME);
  if (!agentsStat) return { items: [], removedCount: 0, advisories: [] };
  if (!agentsStat.isFile()) throw new Error(`Ruta no regular rechazada en ${AGENTS_MD_FILENAME}.`);

  const content = fs.readFileSync(agentsMdPath, UTF8);
  const { preConnector, connectorBlock, postConnector } = splitAgentsConnectorWindow(content);
  const preRes = filterPromotedSectionsFromText(preConnector, false);
  const postRes = filterPromotedSectionsFromText(postConnector, false);
  const totalRemoved = preRes.removedCount + postRes.removedCount;
  const totalHybrid = preRes.hybridCount + postRes.hybridCount;

  if (totalRemoved > 0 && !dryRun) {
    ensureBackupFile(projectPath, AGENTS_MD_FILENAME, backupDir);
    writeUpdatedAgentsMd(agentsMdPath, { pre: preRes.kept, connector: connectorBlock, post: postRes.kept });
  }

  const items: ReconciledRuleItem[] = [];
  const advisories: string[] = [];
  if (totalRemoved > 0) {
    items.push({
      file: AGENTS_MD_FILENAME,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Podadas ${totalRemoved} sección(es) duplicadas en AGENTS.md que ya residen en la skill global qa-11x-architect.`,
    });
  }
  if (totalHybrid > 0) {
    const adv = `Preservada(s) ${totalHybrid} sección(es) híbrida(s) en AGENTS.md para revisión manual.`;
    advisories.push(adv);
    items.push({ file: AGENTS_MD_FILENAME, classification: 'HYBRID_SECTION_REVIEW_RECOMMENDED', details: adv });
  }
  return { items, removedCount: totalRemoved, advisories };
}

function processCanonicalRuleFileInConsumer(
  ctx: Pick<ReconcileRuleCtx, 'fullPath' | 'relPath' | 'dryRun' | 'projectPath' | 'backupDir' | 'extractedDomainBlocks'>
): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  const content = fs.readFileSync(ctx.fullPath, UTF8);
  const filtered = filterPromotedSectionsFromText(content, true);

  if (!ctx.dryRun) {
    ensureBackupFile(ctx.projectPath, ctx.relPath, ctx.backupDir);
    fs.unlinkSync(ctx.fullPath);
  }

  if (filtered.kept.length > 0) {
    ctx.extractedDomainBlocks.push(...filtered.kept);
    return {
      item: {
        file: ctx.relPath,
        classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
        details: `Archivo canónico global eliminado tras extraer ${filtered.kept.length} sección(es) de dominio personalizada(s) y podar ${filtered.removedCount} sección(es) canónicas/promovidas.`,
      },
      removedCount: Math.max(1, filtered.removedCount),
      preservedCount: filtered.kept.length,
    };
  }

  return {
    item: {
      file: ctx.relPath,
      classification: 'CANONICAL_CLEAN',
      details:
        'Archivo canónico global respaldado en .agents/backups/ y eliminado de .agents/rules/ local (consumido desde la skill global).',
    },
    removedCount: Math.max(1, filtered.removedCount),
    preservedCount: 0,
  };
}

interface ReconcileRulesDirOpts {
  readonly resolvedPath: string;
  readonly rulesDirPath: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
  readonly extractedDomainBlocks: string[];
  readonly advisories: string[];
}

function reconcileRulesDir(opts: ReconcileRulesDirOpts): {
  items: ReconciledRuleItem[];
  removed: number;
  preserved: number;
} {
  const items: ReconciledRuleItem[] = [];
  let removed = 0;
  let preserved = 0;

  const rulesStat = assertNoSymlinkSegmentsFromRoot(
    opts.resolvedPath,
    opts.rulesDirPath,
    LABEL_RULES_DIR
  );
  if (!rulesStat?.isDirectory()) {
    return { items, removed, preserved };
  }

  const upstreamRepo = isUpstreamBlueprintsRepo(opts.resolvedPath);
  const entries = fs.readdirSync(opts.rulesDirPath).filter((f) => f.endsWith('.md'));
  for (const fileName of entries) {
    const relPath = path.join(AGENTS_DIR, RULES_DIR, fileName);
    const fullPath = path.join(opts.rulesDirPath, fileName);
    const fullStat = assertNoSymlinkSegmentsFromRoot(opts.resolvedPath, fullPath, 'regla local');
    if (!fullStat?.isFile()) {
      continue;
    }

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
      upstreamRepo,
      projectPath: opts.resolvedPath,
      backupDir: opts.backupDir,
      extractedDomainBlocks: opts.extractedDomainBlocks,
      advisories: opts.advisories,
    });
    items.push(res.item);
    removed += res.removedCount;
    preserved += res.preservedCount;
  }

  return { items, removed, preserved };
}

function reconcileSingleCanonicalSkill(opts: {
  readonly entry: string;
  readonly resolvedPath: string;
  readonly skillsDirPath: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
}): ReconciledRuleItem | null {
  if (!CANONICAL_GLOBAL_SKILL_DIRS.has(opts.entry)) {
    return null;
  }
  const relSkillPath = path.join(AGENTS_DIR, SKILLS_DIR, opts.entry);
  const fullSkillPath = path.join(opts.skillsDirPath, opts.entry);
  const skillStat = assertNoSymlinkSegmentsFromRoot(opts.resolvedPath, fullSkillPath, 'skill local');
  if (!skillStat) return null;
  if (!opts.dryRun) {
    const destBackup = path.join(opts.backupDir, relSkillPath);
    assertNoSymlinkSegmentsFromRoot(opts.resolvedPath, destBackup, LABEL_BACKUP_DEST);
    fs.mkdirSync(path.dirname(destBackup), { recursive: true, mode: 0o700 });
    assertNoSymlinkSegmentsFromRoot(opts.resolvedPath, destBackup, LABEL_BACKUP_DEST);
    fs.cpSync(fullSkillPath, destBackup, { recursive: true, dereference: false });
    hardenBackupTreePermissions(destBackup);
    fs.rmSync(fullSkillPath, { recursive: true, force: true });
  }
  return {
    file: relSkillPath,
    classification: 'REDUNDANT_PROMOTED_REMOVED',
    details:
      'Copia local de skill canónica respaldada en .agents/backups/ y eliminada de .agents/skills/ (consumida desde directorio global del agente).',
  };
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
  const skillsStat = assertNoSymlinkSegmentsFromRoot(resolvedPath, skillsDirPath, LABEL_SKILLS_DIR);
  if (!skillsStat?.isDirectory()) {
    return { items, removed };
  }

  for (const entry of fs.readdirSync(skillsDirPath)) {
    const item = reconcileSingleCanonicalSkill({
      entry,
      resolvedPath,
      skillsDirPath,
      dryRun,
      backupDir,
    });
    if (item) {
      items.push(item);
      removed++;
    }
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
  assertNoSymlinkSegmentsFromRoot(args.resolvedPath, args.rulesDirPath, LABEL_RULES_DIR);
  const domainFullPath = path.join(args.resolvedPath, args.domainRulesFile);
  assertNoSymlinkSegmentsFromRoot(args.resolvedPath, domainFullPath, 'archivo de dominio');
  fs.mkdirSync(args.rulesDirPath, { recursive: true });
  assertNoSymlinkSegmentsFromRoot(args.resolvedPath, domainFullPath, 'archivo de dominio');
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
  pruneBridges?: boolean;
}): Promise<ReconcileAgentsResult> {
  return Promise.resolve().then(() => executeReconcileAgentsGovernance(options));
}

function runConsumerHygienePass(opts: {
  readonly resolvedPath: string;
  readonly dryRun: boolean;
  readonly backupDir: string;
  readonly pruneBridges: boolean;
  readonly items: ReconciledRuleItem[];
  readonly advisories: string[];
}): {
  removedCount: number;
  consolidatedBackups: string[];
  gitignoreAdded: string[];
  bridgesProcessed: string[];
  suggestedGitCommands: string[];
} {
  const shadow = reconcileMultiAgentShadowSkills(opts.resolvedPath, opts.dryRun, opts.backupDir);
  const bridges = reconcileBridgeFiles(
    opts.resolvedPath,
    opts.dryRun,
    opts.backupDir,
    opts.pruneBridges
  );
  const scripts = reconcileMonorepoAndRetiredScripts(opts.resolvedPath, opts.dryRun, opts.backupDir);
  const backups = consolidateLooseBackups(opts.resolvedPath, opts.dryRun, opts.backupDir);
  const gitignore = ensureGitignoreHygiene(opts.resolvedPath, opts.dryRun);
  const advisoryRes = collectReadOnlyAdvisories(opts.resolvedPath);

  opts.items.push(
    ...shadow.items,
    ...bridges.items,
    ...scripts.items,
    ...backups.items,
    ...(gitignore.item ? [gitignore.item] : []),
    ...advisoryRes.items
  );
  opts.advisories.push(...advisoryRes.advisories);

  return {
    removedCount: shadow.removedCount + scripts.removedCount,
    consolidatedBackups: backups.consolidatedBackups,
    gitignoreAdded: gitignore.addedEntries,
    bridgesProcessed: bridges.bridgesProcessed,
    suggestedGitCommands: advisoryRes.suggestedGitCommands,
  };
}

function collectOptionalReconcileExtras(
  advisories: readonly string[],
  hygiene: {
    readonly consolidatedBackups: string[];
    readonly gitignoreAdded: string[];
    readonly bridgesProcessed: string[];
    readonly suggestedGitCommands: string[];
  }
): Partial<ReconcileAgentsResult> {
  return {
    ...(advisories.length > 0 ? { advisories: [...advisories] } : {}),
    ...(hygiene.consolidatedBackups.length > 0
      ? { consolidated_backups: hygiene.consolidatedBackups }
      : {}),
    ...(hygiene.gitignoreAdded.length > 0
      ? { gitignore_entries_added: hygiene.gitignoreAdded }
      : {}),
    ...(hygiene.bridgesProcessed.length > 0
      ? { bridges_processed: hygiene.bridgesProcessed }
      : {}),
    ...(hygiene.suggestedGitCommands.length > 0
      ? { suggested_git_commands: hygiene.suggestedGitCommands }
      : {}),
  };
}

function executeReconcileAgentsGovernance(options: {
  projectPath: string;
  dryRun?: boolean;
  pruneBridges?: boolean;
}): ReconcileAgentsResult {
  const resolvedPath = resolveSafeProjectPath(options.projectPath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Directorio de proyecto inválido: ${resolvedPath}`);
  }

  const dryRun = options.dryRun ?? true;
  const upstreamRepo = isUpstreamBlueprintsRepo(resolvedPath);
  const projectSlug =
    path
      .basename(resolvedPath)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'project';
  const rulesDirPath = path.join(resolvedPath, AGENTS_DIR, RULES_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(resolvedPath, AGENTS_DIR, BACKUPS_DIR, timestamp);

  assertNoSymlinkSegmentsFromRoot(resolvedPath, path.join(resolvedPath, AGENTS_DIR), AGENTS_DIR);
  assertNoSymlinkSegmentsFromRoot(resolvedPath, rulesDirPath, LABEL_RULES_DIR);
  assertNoSymlinkSegmentsFromRoot(
    resolvedPath,
    path.join(resolvedPath, AGENTS_DIR, SKILLS_DIR),
    LABEL_SKILLS_DIR
  );
  assertNoSymlinkSegmentsFromRoot(resolvedPath, backupDir, LABEL_BACKUP_DEST);

  const extractedDomainBlocks: string[] = [];
  const advisories: string[] = [];
  const rulesSummary = reconcileRulesDir({
    resolvedPath,
    rulesDirPath,
    dryRun,
    backupDir,
    extractedDomainBlocks,
    advisories,
  });

  const reconciledItems: ReconciledRuleItem[] = [...rulesSummary.items];
  let totalRemoved = rulesSummary.removed;
  const totalPreserved = rulesSummary.preserved;

  const skillsSummary = reconcileSkillsDir(resolvedPath, dryRun, backupDir);
  reconciledItems.push(...skillsSummary.items);
  totalRemoved += skillsSummary.removed;

  const agentsRes = cleanPromotedDuplicatesInAgentsMd(resolvedPath, dryRun, backupDir);
  reconciledItems.push(...agentsRes.items);
  advisories.push(...agentsRes.advisories);
  totalRemoved += agentsRes.removedCount;

  const hygiene = upstreamRepo
    ? {
        removedCount: 0,
        consolidatedBackups: [] as string[],
        gitignoreAdded: [] as string[],
        bridgesProcessed: [] as string[],
        suggestedGitCommands: [] as string[],
      }
    : runConsumerHygienePass({
        resolvedPath,
        dryRun,
        backupDir,
        pruneBridges: options.pruneBridges ?? false,
        items: reconciledItems,
        advisories,
      });
  totalRemoved += hygiene.removedCount;

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
    ...collectOptionalReconcileExtras(advisories, hygiene),
  };
}

function readNamedFlagValue(
  args: readonly string[],
  index: number,
  arg: string,
  flagNames: readonly string[]
): { value: string; step: number } | null {
  for (const flag of flagNames) {
    if (arg.startsWith(`${flag}=`)) {
      const inlineValue = arg.slice(flag.length + 1).trim();
      if (!inlineValue) throw new Error(`Falta el valor requerido para la opción '${flag}'.`);
      return { value: inlineValue, step: 0 };
    }
    if (arg === flag) {
      const nextValue = args[index + 1]?.trim();
      if (!nextValue || nextValue.startsWith('-')) {
        throw new Error(`Falta el valor requerido para la opción '${flag}'.`);
      }
      return { value: nextValue, step: 1 };
    }
  }
  return null;
}

export interface ReconcileAgentsCliOptions {
  readonly cwd?: string;
  readonly log?: (message: string) => void;
}

export interface ParsedReconcileAgentsArgs {
  readonly projectPath: string;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly pruneBridges?: boolean;
  readonly scanWorkspaces?: string;
  readonly apply?: boolean;
  readonly allowDirty?: boolean;
  readonly json?: boolean;
}

interface MutableReconcileParseState {
  projectPath: string;
  hasExplicitProjectPath: boolean;
  hasPositionalDir: boolean;
  dryRun: boolean;
  pruneBridges: boolean;
  scanWorkspaces?: string;
  apply: boolean;
  allowDirty: boolean;
  json: boolean;
}

const RECONCILE_BOOL_FLAGS: Readonly<Record<string, (s: MutableReconcileParseState) => void>> =
  Object.freeze({
    '--dry-run': (s) => {
      s.dryRun = true;
    },
    '--prune-bridges': (s) => {
      s.pruneBridges = true;
    },
    '--apply': (s) => {
      s.apply = true;
    },
    '--allow-dirty': (s) => {
      s.allowDirty = true;
    },
    '--json': (s) => {
      s.json = true;
    },
  });

function applyReconcileToken(
  args: readonly string[],
  index: number,
  state: MutableReconcileParseState
): number {
  const arg = pickAt(args, index);
  const boolHandler = Object.hasOwn(RECONCILE_BOOL_FLAGS, arg)
    ? RECONCILE_BOOL_FLAGS[arg]
    : undefined;
  if (boolHandler) {
    boolHandler(state);
    return 0;
  }
  const pathOpt = readNamedFlagValue(args, index, arg, ['--project-path', '--dir', '-p']);
  if (pathOpt) {
    state.projectPath = pathOpt.value;
    state.hasExplicitProjectPath = true;
    return pathOpt.step;
  }
  const scanOpt = readNamedFlagValue(args, index, arg, ['--scan-workspaces']);
  if (scanOpt) {
    state.scanWorkspaces = scanOpt.value;
    return scanOpt.step;
  }
  const trimmedArg = arg.trim();
  if (!trimmedArg) {
    throw new Error(
      'Argumento posicional vacío en reconcile-agents: indica una ruta de directorio válida.'
    );
  }
  if (trimmedArg.startsWith('-')) {
    throw new Error(
      `Opción CLI desconocida en reconcile-agents: '${trimmedArg}'. Ejecuta con --help para ver las opciones válidas.`
    );
  }
  if (state.hasPositionalDir) {
    throw new Error(`Argumento posicional inesperado en reconcile-agents: '${trimmedArg}'.`);
  }
  state.projectPath = trimmedArg;
  state.hasPositionalDir = true;
  state.hasExplicitProjectPath = true;
  return 0;
}

export function parseReconcileAgentsArgs(
  args: readonly string[],
  defaultCwd: string = process.cwd()
): ParsedReconcileAgentsArgs {
  if (hasHelpFlag(args)) {
    return {
      projectPath: defaultCwd,
      dryRun: false,
      help: true,
    };
  }
  const state: MutableReconcileParseState = {
    projectPath: defaultCwd,
    hasExplicitProjectPath: false,
    hasPositionalDir: false,
    dryRun: false,
    pruneBridges: false,
    apply: false,
    allowDirty: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    i += applyReconcileToken(args, i, state);
  }
  if (state.scanWorkspaces !== undefined && state.hasExplicitProjectPath) {
    throw new Error(
      "Las opciones '--scan-workspaces' y '--project-path'/'--dir'/'-p' (o directorio posicional) son mutuamente excluyentes."
    );
  }
  const resolvedScanWorkspaces =
    state.scanWorkspaces !== undefined
      ? resolveCliProjectPath(state.scanWorkspaces, defaultCwd)
      : undefined;
  const resolvedProjectPath =
    resolvedScanWorkspaces ?? resolveCliProjectPath(state.projectPath, defaultCwd);

  return {
    projectPath: resolvedProjectPath,
    dryRun: state.dryRun,
    help: false,
    ...(state.pruneBridges ? { pruneBridges: true } : {}),
    ...(resolvedScanWorkspaces !== undefined ? { scanWorkspaces: resolvedScanWorkspaces } : {}),
    ...(state.apply ? { apply: true } : {}),
    ...(state.allowDirty ? { allowDirty: true } : {}),
    ...(state.json ? { json: true } : {}),
  };
}

export async function runReconcileAgentsCli(
  args: string[],
  options?: ReconcileAgentsCliOptions
): Promise<void> {
  const log = options?.log ?? console.log;
  if (hasHelpFlag(args)) {
    log(renderSubcommandHelpText('reconcile-agents', resolveCliHelpLang(args)));
    return;
  }
  const parsed = parseReconcileAgentsArgs(args, options?.cwd ?? process.cwd());
  if (parsed.scanWorkspaces !== undefined) {
    await scanWorkspacesForReconcile({
      rootDir: parsed.scanWorkspaces,
      apply: Boolean(parsed.apply && !parsed.dryRun),
      allowDirty: Boolean(parsed.allowDirty),
      pruneBridges: Boolean(parsed.pruneBridges),
      json: Boolean(parsed.json),
      log,
      deps: {
        isUpstreamRepo: isUpstreamBlueprintsRepo,
        reconcileRepo: reconcileAgentsGovernance,
      },
    });
    return;
  }
  const result = await reconcileAgentsGovernance({
    projectPath: parsed.projectPath,
    dryRun: parsed.dryRun,
    pruneBridges: parsed.pruneBridges,
  });
  if (parsed.json) {
    log(JSON.stringify(result, null, 2));
    return;
  }
  log(
    `✔ [Reconcile 11X] ${result.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${result.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
  );
  if (result.domain_rules_file) log(`ℹ Reglas de dominio aisladas en: ${result.domain_rules_file}`);
  if (result.backup_dir) log(`ℹ Respaldo creado en: ${result.backup_dir}`);
  for (const adv of result.advisories ?? []) log(`⚠️ ${adv}`);
  for (const cmd of result.suggested_git_commands ?? []) log(`💡 Sugerido (solo lectura): ${cmd}`);
}
