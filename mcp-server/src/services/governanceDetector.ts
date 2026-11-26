// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  GovernanceDocDecision,
  GovernanceFileAssessment,
  GovernanceFileId,
  GovernanceFileLevel,
  GovernanceFileState,
  StandardTier,
} from '../types.js';
import { isTierAtLeast, TIER_ENTERPRISE, TIER_STANDARD } from './qa11xConfig.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

const UTF8 = 'utf8' as const;

export const GOVERNANCE_DOC_CHANGELOG: GovernanceFileId = 'CHANGELOG.md';
export const GOVERNANCE_DOC_ROADMAP: GovernanceFileId = 'ROADMAP.md';
export const GOVERNANCE_DOC_TESTING: GovernanceFileId = 'TESTING.md';
export const GOVERNANCE_DOC_SECURITY: GovernanceFileId = 'SECURITY.md';
export const GOVERNANCE_DOC_BOUNDARIES: GovernanceFileId = '.agents/boundaries.json';
export const GOVERNANCE_DOC_CALM: GovernanceFileId = 'architecture/calm.json';
export const GOVERNANCE_DOC_ADR: GovernanceFileId = 'docs/adr/0001-record-architecture-decisions.md';
export const GOVERNANCE_DOC_CODEOWNERS: GovernanceFileId = '.github/CODEOWNERS';

export const ALL_GOVERNANCE_FILE_IDS: readonly GovernanceFileId[] = Object.freeze([
  GOVERNANCE_DOC_CHANGELOG,
  GOVERNANCE_DOC_ROADMAP,
  GOVERNANCE_DOC_TESTING,
  GOVERNANCE_DOC_SECURITY,
  GOVERNANCE_DOC_BOUNDARIES,
  GOVERNANCE_DOC_CALM,
  GOVERNANCE_DOC_ADR,
  GOVERNANCE_DOC_CODEOWNERS,
]);

const ARCHITECTURAL_LAYER_DIRS = new Set([
  'api',
  'app',
  'apps',
  'backend',
  'cli',
  'components',
  'controllers',
  'core',
  'db',
  'domain',
  'frontend',
  'handlers',
  'infra',
  'infrastructure',
  'lib',
  'models',
  'packages',
  'parsers',
  'repositories',
  'resources',
  'routers',
  'routes',
  'security',
  'server',
  'services',
  'tools',
  'ui',
  'utils',
  'views',
]);

const MULTI_SERVICE_MARKERS = new Set(['backend', 'frontend', 'services', 'apps', 'packages', 'worker', 'workers']);
const CODEOWNERS_CANDIDATES = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'] as const;

export interface GitCollaborationProbeResult {
  readonly hasRemote: boolean;
  readonly distinctAuthorCount: number;
}

export type GitCollaborationProbeFn = (projectPath: string) => GitCollaborationProbeResult;

export interface GovernanceDetectionOptions {
  readonly effectiveTier: StandardTier;
  readonly detectedStacks: readonly string[];
  readonly files: readonly string[];
  readonly governanceDocs: Readonly<Record<string, GovernanceDocDecision>>;
  readonly gitProbeFn?: GitCollaborationProbeFn;
}

function readTextSafe(filePath: string): string | null {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    return fs.readFileSync(filePath, UTF8);
  } catch (err: unknown) {
    reportDebugCatchError(`governanceDetector.readTextSafe(${filePath})`, err);
    return null;
  }
}

export function slugifyProjectName(projectPath: string): string {
  const base = path.basename(projectPath).toLowerCase();
  let slug = '';
  let lastDash = false;
  for (let i = 0; i < base.length; i += 1) {
    const ch = base[i] ?? '';
    const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlnum) {
      slug += ch;
      lastDash = false;
    } else if (!lastDash && slug.length > 0) {
      slug += '-';
      lastDash = true;
    }
  }
  const trimmed = slug.endsWith('-') ? slug.slice(0, -1) : slug;
  return trimmed || 'project';
}

function listImmediateSubdirNames(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return [];
    }
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name.toLowerCase());
  } catch (err: unknown) {
    reportDebugCatchError(`governanceDetector.listImmediateSubdirNames(${dirPath})`, err);
    return [];
  }
}

function countArchitecturalLayers(projectPath: string): number {
  const found = new Set<string>();
  for (const probeDir of [projectPath, path.join(projectPath, 'src'), path.join(projectPath, 'app')]) {
    for (const dirName of listImmediateSubdirNames(probeDir)) {
      if (ARCHITECTURAL_LAYER_DIRS.has(dirName)) {
        found.add(dirName);
      }
    }
  }
  return found.size;
}

function hasMultiServiceLayout(projectPath: string, detectedStacks: readonly string[]): boolean {
  if (detectedStacks.length >= 2) {
    return true;
  }
  const topDirs = listImmediateSubdirNames(projectPath);
  const serviceDirs = topDirs.filter((name) => MULTI_SERVICE_MARKERS.has(name));
  if (serviceDirs.length >= 2) {
    return true;
  }
  for (const containerDir of ['services', 'apps']) {
    const nested = listImmediateSubdirNames(path.join(projectPath, containerDir));
    if (nested.length >= 2) {
      return true;
    }
  }
  return false;
}

const FIXED_GIT_CANDIDATES = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git',
  '/bin/git',
] as const;

export function resolveFixedGitBinary(
  candidates: readonly string[] = FIXED_GIT_CANDIDATES
): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function defaultGitCollaborationProbe(
  projectPath: string,
  gitBin: string | null = resolveFixedGitBinary()
): GitCollaborationProbeResult {
  if (!fs.existsSync(path.join(projectPath, '.git')) || gitBin === null) {
    return { hasRemote: false, distinctAuthorCount: 0 };
  }
  let hasRemote = false;
  let distinctAuthorCount = 0;
  try {
    const remotes = execFileSync(gitBin, ['remote'], {
      cwd: projectPath,
      encoding: UTF8,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    hasRemote = remotes.length > 0;
  } catch (err: unknown) {
    reportDebugCatchError('governanceDetector.gitRemote', err);
  }
  try {
    const rawEmails = execFileSync(gitBin, ['log', '-n', '50', '--format=%ae'], {
      cwd: projectPath,
      encoding: UTF8,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const emails = new Set(
      rawEmails
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0)
    );
    distinctAuthorCount = emails.size;
  } catch (err: unknown) {
    reportDebugCatchError('governanceDetector.gitAuthors', err);
  }
  return { hasRemote, distinctAuthorCount };
}

function hasHeadingAndKeywords(content: string, keywords: readonly string[]): boolean {
  const hasHeading = /^#\s+\S/m.test(content);
  if (!hasHeading) {
    return false;
  }
  const lower = content.toLowerCase();
  const hasSubheading = /^##\s+\S/m.test(content);
  return hasSubheading || keywords.some((kw) => lower.includes(kw));
}

function isRoadmapCompatible(content: string): boolean {
  const lines = content.split(/\r?\n/);
  const hasTable = lines.some((line) => /^\|\s*(?:\*\*)?(?:milestone|hito)\s+\d+/i.test(line));
  const hasSection = lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('## ')) {
      return false;
    }
    const stripped = trimmed.slice(3).trim().replace(/^(?:✅|⏳|🚧)\s*/, '');
    return /^(?:milestone|hito)\s+\d+/i.test(stripped);
  });
  return hasTable && hasSection;
}

function isBoundariesJsonCompatible(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.length > 0;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return false;
    }
    const rec = parsed as Record<string, unknown>;
    return (
      typeof rec.kind === 'string' ||
      (Array.isArray(rec.rules_sets) && rec.rules_sets.length > 0) ||
      (Array.isArray(rec.rules) && rec.rules.length > 0)
    );
  } catch {
    return false;
  }
}

function isCalmJsonCompatible(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return false;
    }
    const rec = parsed as Record<string, unknown>;
    return (
      Array.isArray(rec.nodes) &&
      rec.nodes.length > 0 &&
      Array.isArray(rec.relationships) &&
      typeof rec.controls === 'object' &&
      rec.controls !== null
    );
  } catch {
    return false;
  }
}

function isAdrContentCompatible(content: string): boolean {
  const lower = content.toLowerCase();
  const hasTitle = /^#\s+\S/m.test(content);
  return (
    hasTitle &&
    (lower.includes('context') || lower.includes('contexto')) &&
    (lower.includes('decision') || lower.includes('decisión') || lower.includes('status') || lower.includes('estado'))
  );
}

function isCodeownersCompatible(content: string): boolean {
  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      return false;
    }
    const tokens = trimmed.split(/\s+/);
    return tokens.slice(1).some((tok) => tok.startsWith('@') && tok.length > 1);
  });
}

function lookupPersistedDecision(
  governanceDocs: Readonly<Record<string, GovernanceDocDecision>>,
  keys: readonly string[]
): GovernanceDocDecision | undefined {
  for (const key of keys) {
    if (Object.hasOwn(governanceDocs, key)) {
      return governanceDocs[key];
    }
  }
  return undefined;
}

interface BuildAssessmentInput {
  readonly id: GovernanceFileId;
  readonly relPath: string;
  readonly level: GovernanceFileLevel;
  readonly minTier: StandardTier;
  readonly requiredForTier: boolean;
  readonly applicable: boolean;
  readonly existingContent: string | null;
  readonly isCompatible: (content: string) => boolean;
  readonly persistedDecision: GovernanceDocDecision | undefined;
  readonly compatibleReason: string;
  readonly legacyReason: string;
  readonly missingReason: string;
  readonly notApplicableReason: string;
  readonly legacyAction: string;
  readonly missingAction: string;
}

function buildGovernanceFileAssessment(input: BuildAssessmentInput): GovernanceFileAssessment {
  let state: GovernanceFileState;
  let reason: string;
  let suggestedAction: string;

  if (input.existingContent !== null) {
    if (input.isCompatible(input.existingContent)) {
      state = 'present_compatible';
      reason = input.compatibleReason;
      suggestedAction = 'Mantener sincronizado en cierres de tarea.';
    } else {
      state = 'present_legacy';
      reason = input.legacyReason;
      suggestedAction =
        input.persistedDecision === 'legacy_preserved'
          ? 'Preservado explícitamente como legacy_preserved en .qa-11x.json.'
          : input.legacyAction;
    }
  } else if (!input.applicable) {
    state = 'not_applicable';
    reason = input.notApplicableReason;
    suggestedAction = 'No requerido para el perfil/tier actual.';
  } else if (input.persistedDecision === 'declined') {
    state = 'declined';
    reason = 'Omitido explícitamente por el usuario en .qa-11x.json.';
    suggestedAction = input.requiredForTier
      ? `Requerido en tier ${input.minTier}: habilitar con governance_docs: ['${input.id}'].`
      : 'No volver a ofrecer salvo solicitud explícita del usuario.';
  } else {
    state = 'missing_unprompted';
    reason = input.missingReason;
    suggestedAction = input.missingAction;
  }

  return {
    id: input.id,
    path: input.relPath,
    level: input.level,
    state,
    required_for_tier: input.requiredForTier,
    min_tier: input.minTier,
    applicable: input.applicable,
    ...(input.persistedDecision !== undefined ? { persisted_decision: input.persistedDecision } : {}),
    reason,
    suggested_action: suggestedAction,
  };
}

function listSortedFilesBySuffix(dirPath: string, suffix: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  try {
    return fs
      .readdirSync(dirPath)
      .filter((name) => name.endsWith(suffix))
      .sort((a, b) => a.localeCompare(b));
  } catch (err: unknown) {
    reportDebugCatchError(`governanceDetector.listSortedFilesBySuffix(${dirPath})`, err);
    return [];
  }
}

function findExistingCalmRelPath(projectPath: string, files: readonly string[]): string | null {
  if (fs.existsSync(path.join(projectPath, 'architecture', 'qa-11x.calm.json'))) {
    return 'architecture/qa-11x.calm.json';
  }
  const fromFiles = files.find((f) => f.startsWith('architecture/') && f.endsWith('.calm.json'));
  if (fromFiles) {
    return fromFiles;
  }
  const hit = listSortedFilesBySuffix(path.join(projectPath, 'architecture'), '.calm.json')[0];
  return hit ? `architecture/${hit}` : null;
}

function findExistingAdrRelPath(projectPath: string): string | null {
  const mdFile = listSortedFilesBySuffix(path.join(projectPath, 'docs', 'adr'), '.md')[0];
  return mdFile ? `docs/adr/${mdFile}` : null;
}

function findExistingCodeownersRelPath(projectPath: string): string | null {
  for (const rel of CODEOWNERS_CANDIDATES) {
    if (fs.existsSync(path.join(projectPath, rel))) {
      return rel;
    }
  }
  return null;
}

function assessCoreGovernanceFiles(
  projectPath: string,
  effectiveTier: StandardTier,
  governanceDocs: Readonly<Record<string, GovernanceDocDecision>>
): GovernanceFileAssessment[] {
  const standardRequired = isTierAtLeast(effectiveTier, TIER_STANDARD);
  return [
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_CHANGELOG,
      relPath: GOVERNANCE_DOC_CHANGELOG,
      level: 'core',
      minTier: TIER_STANDARD,
      requiredForTier: standardRequired,
      applicable: true,
      existingContent: readTextSafe(path.join(projectPath, GOVERNANCE_DOC_CHANGELOG)),
      isCompatible: (c) => c.includes('## [Unreleased]'),
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_CHANGELOG]),
      compatibleReason: 'CHANGELOG.md presente con sección ## [Unreleased].',
      legacyReason: 'CHANGELOG.md existe pero carece de ## [Unreleased] (nunca se sobrescribe).',
      missingReason: 'No existe CHANGELOG.md en la raíz del proyecto.',
      notApplicableReason: '',
      legacyAction: "Ofrecer inserción quirúrgica de '## [Unreleased]' con respaldo .11x-backup vía init_or_append_agents_md(governance_docs: ['CHANGELOG.md']).",
      missingAction: "Ofrecer creación contextual vía init_or_append_agents_md(governance_docs: ['CHANGELOG.md']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_ROADMAP,
      relPath: GOVERNANCE_DOC_ROADMAP,
      level: 'core',
      minTier: TIER_STANDARD,
      requiredForTier: false,
      applicable: true,
      existingContent: readTextSafe(path.join(projectPath, GOVERNANCE_DOC_ROADMAP)),
      isCompatible: isRoadmapCompatible,
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_ROADMAP]),
      compatibleReason: 'ROADMAP.md presente con tabla resumen y secciones Milestone/Hito compatibles.',
      legacyReason: 'ROADMAP.md existe en formato libre sin tabla/hitos QA-11X (nunca se sobrescribe).',
      missingReason: 'No existe ROADMAP.md en la raíz del proyecto.',
      notApplicableReason: '',
      legacyAction: "Preservar como legacy_preserved en .qa-11x.json (decline_governance_docs: ['ROADMAP.md:legacy_preserved']) o adaptar manualmente.",
      missingAction: "Ofrecer creación contextual compatible con verify_roadmap_consistency.py vía init_or_append_agents_md(governance_docs: ['ROADMAP.md']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_TESTING,
      relPath: GOVERNANCE_DOC_TESTING,
      level: 'core',
      minTier: TIER_STANDARD,
      requiredForTier: standardRequired,
      applicable: true,
      existingContent: readTextSafe(path.join(projectPath, GOVERNANCE_DOC_TESTING)),
      isCompatible: (c) => hasHeadingAndKeywords(c, ['qa-', 'pytest', 'vitest', 'coverage', 'cobertura', 'testing', 'pruebas', 'docker']),
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_TESTING]),
      compatibleReason: 'TESTING.md presente con estructura y comandos QA.',
      legacyReason: 'TESTING.md existe en formato mínimo sin secciones QA (nunca se sobrescribe).',
      missingReason: 'No existe TESTING.md en la raíz del proyecto.',
      notApplicableReason: '',
      legacyAction: 'Enriquecer manualmente preservando contenido existente.',
      missingAction: "Ofrecer creación contextual con comandos reales del repo vía init_or_append_agents_md(governance_docs: ['TESTING.md']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_SECURITY,
      relPath: GOVERNANCE_DOC_SECURITY,
      level: 'core',
      minTier: TIER_STANDARD,
      requiredForTier: standardRequired,
      applicable: true,
      existingContent: readTextSafe(path.join(projectPath, GOVERNANCE_DOC_SECURITY)),
      isCompatible: (c) => hasHeadingAndKeywords(c, ['security', 'seguridad', 'vulnerability', 'vulnerabilidad', 'stig', 'owasp', 'report']),
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_SECURITY]),
      compatibleReason: 'SECURITY.md presente con política de seguridad.',
      legacyReason: 'SECURITY.md existe en formato mínimo sin política estructurada (nunca se sobrescribe).',
      missingReason: 'No existe SECURITY.md en la raíz del proyecto.',
      notApplicableReason: '',
      legacyAction: 'Completar manualmente política de reporte responsable.',
      missingAction: "Ofrecer creación contextual vía init_or_append_agents_md(governance_docs: ['SECURITY.md']).",
    }),
  ];
}

function assessContextualGovernanceFiles(
  projectPath: string,
  options: GovernanceDetectionOptions
): GovernanceFileAssessment[] {
  const { effectiveTier, detectedStacks, files, governanceDocs } = options;
  const layerCount = countArchitecturalLayers(projectPath);
  const boundariesApplicable = detectedStacks.length >= 2 || layerCount >= 2;
  const multiService = hasMultiServiceLayout(projectPath, detectedStacks);
  const enterpriseOrMulti = effectiveTier === TIER_ENTERPRISE || multiService;
  const gitCollab = (options.gitProbeFn ?? defaultGitCollaborationProbe)(projectPath);
  const codeownersApplicable = gitCollab.hasRemote || gitCollab.distinctAuthorCount >= 2;

  const existingCalm = findExistingCalmRelPath(projectPath, files);
  const calmRelPath = existingCalm ?? `architecture/${slugifyProjectName(projectPath)}.calm.json`;
  const existingAdr = findExistingAdrRelPath(projectPath);
  const adrRelPath = existingAdr ?? GOVERNANCE_DOC_ADR;
  const existingCodeowners = findExistingCodeownersRelPath(projectPath);
  const codeownersRelPath = existingCodeowners ?? GOVERNANCE_DOC_CODEOWNERS;

  return [
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_BOUNDARIES,
      relPath: GOVERNANCE_DOC_BOUNDARIES,
      level: 'contextual',
      minTier: TIER_STANDARD,
      requiredForTier: false,
      applicable: boundariesApplicable,
      existingContent: readTextSafe(path.join(projectPath, GOVERNANCE_DOC_BOUNDARIES)),
      isCompatible: isBoundariesJsonCompatible,
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_BOUNDARIES]),
      compatibleReason: '.agents/boundaries.json presente con reglas declarativas válidas.',
      legacyReason: '.agents/boundaries.json existe pero carece de reglas válidas (kind/rules/rules_sets).',
      missingReason: `Detectadas ${layerCount} capas y ${detectedStacks.length} stack(s) sin .agents/boundaries.json.`,
      notApplicableReason: 'Repositorio monolítico simple (< 2 capas arquitectónicas y < 2 stacks).',
      legacyAction: 'Corregir manualmente el esquema en .agents/boundaries.json sin perder reglas previas.',
      missingAction: "Ofrecer generación contextual basada en carpetas reales vía init_or_append_agents_md(governance_docs: ['.agents/boundaries.json']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_CALM,
      relPath: calmRelPath,
      level: 'contextual',
      minTier: TIER_ENTERPRISE,
      requiredForTier: effectiveTier === TIER_ENTERPRISE,
      applicable: enterpriseOrMulti,
      existingContent: existingCalm ? readTextSafe(path.join(projectPath, existingCalm)) : null,
      isCompatible: isCalmJsonCompatible,
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_CALM, calmRelPath]),
      compatibleReason: `${calmRelPath} presente con nodos, relaciones y controles FINOS CALM.`,
      legacyReason: `${calmRelPath} existe pero carece de estructura FINOS CALM válida (nodes/relationships/controls).`,
      missingReason: `Modelo FINOS CALM aplicable (${effectiveTier === TIER_ENTERPRISE ? 'tier enterprise' : 'repositorio multi-servicio'}) y ausente.`,
      notApplicableReason: 'Solo aplicable en tier enterprise o repositorios multi-servicio.',
      legacyAction: 'Completar nodes/relationships/controls y validar con validate_calm_architecture.',
      missingAction: "Ofrecer creación de arquitectura CALM contextual vía init_or_append_agents_md(governance_docs: ['architecture/calm.json']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_ADR,
      relPath: adrRelPath,
      level: 'contextual',
      minTier: TIER_ENTERPRISE,
      requiredForTier: false,
      applicable: enterpriseOrMulti,
      existingContent: existingAdr ? readTextSafe(path.join(projectPath, existingAdr)) : null,
      isCompatible: isAdrContentCompatible,
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_ADR, 'docs/adr']),
      compatibleReason: `${adrRelPath} presente con estructura ADR (Contexto/Decisión/Estado).`,
      legacyReason: `${adrRelPath} existe sin secciones ADR estándar (Contexto/Decisión).`,
      missingReason: 'Registro ADR aplicable (enterprise o multi-servicio) y ausente en docs/adr/.',
      notApplicableReason: 'Solo aplicable en tier enterprise o repositorios multi-servicio.',
      legacyAction: 'Preservar ADRs existentes y seguir la plantilla ADR en futuras decisiones.',
      missingAction: "Ofrecer creación de docs/adr/0001-record-architecture-decisions.md vía init_or_append_agents_md(governance_docs: ['docs/adr/0001-record-architecture-decisions.md']).",
    }),
    buildGovernanceFileAssessment({
      id: GOVERNANCE_DOC_CODEOWNERS,
      relPath: codeownersRelPath,
      level: 'contextual',
      minTier: TIER_STANDARD,
      requiredForTier: false,
      applicable: codeownersApplicable,
      existingContent: existingCodeowners ? readTextSafe(path.join(projectPath, existingCodeowners)) : null,
      isCompatible: isCodeownersCompatible,
      persistedDecision: lookupPersistedDecision(governanceDocs, [GOVERNANCE_DOC_CODEOWNERS, 'CODEOWNERS']),
      compatibleReason: `${codeownersRelPath} presente con reglas de revisión válidas.`,
      legacyReason: `${codeownersRelPath} existe sin reglas '@owner' activas.`,
      missingReason: 'Repositorio Git colaborativo (remoto o >= 2 autores) sin .github/CODEOWNERS.',
      notApplicableReason: 'Sin remoto colaborativo ni múltiples autores detectados en Git.',
      legacyAction: 'Añadir reglas de propietarios (@equipo/@usuario) preservando comentarios.',
      missingAction: "Ofrecer generación contextual vía init_or_append_agents_md(governance_docs: ['.github/CODEOWNERS']).",
    }),
  ];
}

/** Detects and classifies all 8 core + contextual QA-11X governance files non-destructively. */
export function detectGovernanceFiles(
  projectPath: string,
  options: GovernanceDetectionOptions
): GovernanceFileAssessment[] {
  return [
    ...assessCoreGovernanceFiles(projectPath, options.effectiveTier, options.governanceDocs),
    ...assessContextualGovernanceFiles(projectPath, options),
  ];
}

/** Returns true when onboarding should prompt the user once for tier or governance files. */
export function isGovernanceOnboardingNeeded(
  tierConfirmedByUser: boolean,
  assessments: readonly GovernanceFileAssessment[]
): boolean {
  if (!tierConfirmedByUser) {
    return true;
  }
  return assessments.some(
    (item) =>
      item.state === 'missing_unprompted' ||
      (item.state === 'present_legacy' && item.persisted_decision !== 'legacy_preserved')
  );
}
