// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSymlinkSegments } from '../security/pathRealResolver.js';
import type {
  BilingualMirrorsMode,
  GovernanceDocDecision,
  GovernanceFileId,
  GovernanceTemplateApplyItem,
  OutputLanguageMode,
  StandardTier,
} from '../types.js';
import {
  GOVERNANCE_DOC_ADR,
  GOVERNANCE_DOC_BOUNDARIES,
  GOVERNANCE_DOC_CALM,
  GOVERNANCE_DOC_CHANGELOG,
  GOVERNANCE_DOC_CODEOWNERS,
  GOVERNANCE_DOC_ROADMAP,
  GOVERNANCE_DOC_SECURITY,
  GOVERNANCE_DOC_TESTING,
  resolveFixedGitBinary,
  slugifyProjectName,
} from './governanceDetector.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

const UTF8 = 'utf8' as const;
const UNRELEASED_HEADING = '## [Unreleased]';
const MARKDOWN_MIRRORABLE_IDS: ReadonlySet<GovernanceFileId> = new Set([
  GOVERNANCE_DOC_CHANGELOG,
  GOVERNANCE_DOC_ROADMAP,
  GOVERNANCE_DOC_TESTING,
  GOVERNANCE_DOC_SECURITY,
]);

const LAYER_ORDER = ['api', 'routers', 'routes', 'controllers', 'services', 'domain', 'models', 'repositories', 'infra', 'db', 'utils', 'security'] as const;

const ALIAS_TO_GOVERNANCE_ID: Readonly<Record<string, GovernanceFileId>> = Object.freeze({
  'changelog': GOVERNANCE_DOC_CHANGELOG,
  'changelog.md': GOVERNANCE_DOC_CHANGELOG,
  'roadmap': GOVERNANCE_DOC_ROADMAP,
  'roadmap.md': GOVERNANCE_DOC_ROADMAP,
  'testing': GOVERNANCE_DOC_TESTING,
  'testing.md': GOVERNANCE_DOC_TESTING,
  'security': GOVERNANCE_DOC_SECURITY,
  'security.md': GOVERNANCE_DOC_SECURITY,
  'boundaries': GOVERNANCE_DOC_BOUNDARIES,
  'boundaries.json': GOVERNANCE_DOC_BOUNDARIES,
  '.agents/boundaries.json': GOVERNANCE_DOC_BOUNDARIES,
  'calm': GOVERNANCE_DOC_CALM,
  'calm.json': GOVERNANCE_DOC_CALM,
  'architecture/calm.json': GOVERNANCE_DOC_CALM,
  'adr': GOVERNANCE_DOC_ADR,
  'docs/adr': GOVERNANCE_DOC_ADR,
  'docs/adr/0001-record-architecture-decisions.md': GOVERNANCE_DOC_ADR,
  'codeowners': GOVERNANCE_DOC_CODEOWNERS,
  '.github/codeowners': GOVERNANCE_DOC_CODEOWNERS,
});

export interface ProjectGovernanceMetadata {
  readonly projectName: string;
  readonly slug: string;
  readonly version: string;
  readonly tier: StandardTier;
  readonly lang: 'es' | 'en';
  readonly emitSpanishMirror: boolean;
  readonly stacks: readonly string[];
  readonly makefileTargets: readonly string[];
  readonly layerRoot: string;
  readonly detectedLayers: readonly string[];
  readonly ownerHandle: string;
}

export interface ApplyGovernanceDocsOptions {
  readonly projectPath: string;
  readonly tier: StandardTier;
  readonly lang: OutputLanguageMode;
  readonly stacks: readonly string[];
  readonly governanceDocs?: readonly string[];
  readonly declineGovernanceDocs?: readonly string[];
  readonly bilingualMirrors?: BilingualMirrorsMode;
  readonly dryRun: boolean;
  readonly gitOwnerProbeFn?: (projectPath: string) => string | null;
}

export interface ApplyGovernanceDocsResult {
  readonly items: GovernanceTemplateApplyItem[];
  readonly decisionsDelta: Record<string, GovernanceDocDecision>;
}

export function normalizeGovernanceDocId(raw: string): GovernanceFileId {
  const cleaned = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const lower = cleaned.toLowerCase();
  if (Object.hasOwn(ALIAS_TO_GOVERNANCE_ID, lower)) {
    return ALIAS_TO_GOVERNANCE_ID[lower]!;
  }
  if (lower.startsWith('architecture/') && lower.endsWith('.calm.json')) {
    return GOVERNANCE_DOC_CALM;
  }
  if (lower.startsWith('docs/adr/') && lower.endsWith('.md')) {
    return GOVERNANCE_DOC_ADR;
  }
  throw new Error(
    `Documento de gobernanza no soportado: '${raw}'. Valores válidos: CHANGELOG.md, ROADMAP.md, TESTING.md, SECURITY.md, .agents/boundaries.json, architecture/calm.json, docs/adr/0001-record-architecture-decisions.md, .github/CODEOWNERS.`
  );
}

export function parseDeclineGovernanceEntry(raw: string): {
  readonly id: GovernanceFileId;
  readonly decision: 'declined' | 'legacy_preserved';
} {
  const trimmed = raw.trim();
  const colonIdx = trimmed.lastIndexOf(':');
  if (colonIdx > 0) {
    const suffix = trimmed.slice(colonIdx + 1).trim().toLowerCase();
    const head = trimmed.slice(0, colonIdx).trim();
    if (suffix === 'legacy_preserved' || suffix === 'declined') {
      return { id: normalizeGovernanceDocId(head), decision: suffix };
    }
  }
  return { id: normalizeGovernanceDocId(trimmed), decision: 'declined' };
}

function readTextSafe(filePath: string): string | null {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    return fs.readFileSync(filePath, UTF8);
  } catch (err: unknown) {
    reportDebugCatchError(`governanceTemplates.readTextSafe(${filePath})`, err);
    return null;
  }
}

function readJsonField(filePath: string, key: string): string | null {
  const raw = readTextSafe(filePath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const val = parsed[key];
    return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
  } catch {
    return null;
  }
}

function readPyprojectField(projectPath: string, fieldName: 'name' | 'version'): string | null {
  const raw = readTextSafe(path.join(projectPath, 'pyproject.toml'));
  if (!raw) return null;
  const prefix = `${fieldName}`;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    if (trimmed.slice(0, eqIdx).trim() !== prefix) continue;
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (val.length > 0) return val;
  }
  return null;
}

function extractNameAndVersion(projectPath: string): { name: string; version: string } {
  const pkgPath = path.join(projectPath, 'package.json');
  const compPath = path.join(projectPath, 'composer.json');
  const name =
    readJsonField(pkgPath, 'name') ??
    readPyprojectField(projectPath, 'name') ??
    readJsonField(compPath, 'name') ??
    path.basename(projectPath);
  const version =
    readJsonField(pkgPath, 'version') ??
    readPyprojectField(projectPath, 'version') ??
    readJsonField(compPath, 'version') ??
    '0.1.0';
  return { name, version };
}

function extractMakefileQaTargets(projectPath: string): string[] {
  const content = readTextSafe(path.join(projectPath, 'Makefile'));
  if (!content) return [];
  const targets: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('\t') || line.startsWith('#') || line.startsWith('.')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0 || line[colon + 1] === '=') continue;
    const name = line.slice(0, colon).trim();
    if (/^(?:qa-[a-z0-9-]+|lint|test|certify|clean|build)$/.test(name) && !targets.includes(name)) {
      targets.push(name);
    }
  }
  return targets;
}

function detectLayerRootAndDirs(projectPath: string): { layerRoot: string; detectedLayers: string[] } {
  for (const candidateRoot of ['src', 'app', '']) {
    const dir = candidateRoot ? path.join(projectPath, candidateRoot) : projectPath;
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
    const ordered = LAYER_ORDER.filter((layer) => entries.includes(layer));
    if (ordered.length >= 2) {
      return { layerRoot: candidateRoot, detectedLayers: [...ordered] };
    }
  }
  return { layerRoot: 'src', detectedLayers: ['api', 'services', 'infra'] };
}

export function parseOwnerFromRemoteUrl(remoteUrl: string): string | null {
  const cleaned = remoteUrl.trim().replace(/\.git$/i, '');
  const sshIdx = cleaned.indexOf(':');
  const slashParts =
    cleaned.startsWith('git@') && sshIdx > 0
      ? cleaned.slice(sshIdx + 1).split('/')
      : cleaned.replace(/^https?:\/\//i, '').split('/').slice(1);
  const org = (slashParts[0] ?? '').trim();
  if (/^[A-Za-z0-9_.-]{2,39}$/.test(org)) {
    return `@${org}`;
  }
  return null;
}

export function defaultGitOwnerProbe(
  projectPath: string,
  gitBin: string | null = resolveFixedGitBinary()
): string | null {
  if (!fs.existsSync(path.join(projectPath, '.git')) || gitBin === null) {
    return null;
  }
  try {
    const url = execFileSync(gitBin, ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      encoding: UTF8,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = parseOwnerFromRemoteUrl(url);
    if (parsed) return parsed;
  } catch (err: unknown) {
    reportDebugCatchError('governanceTemplates.gitRemoteOwner', err);
  }
  return null;
}

function resolveDocLanguage(projectPath: string, lang: OutputLanguageMode): 'es' | 'en' {
  if (lang === 'es' || lang === 'en') {
    return lang;
  }
  const readme = readTextSafe(path.join(projectPath, 'README.md')) ?? '';
  const lower = readme.toLowerCase();
  const esHints = ['instalación', 'arquitectura', 'requisitos', 'uso rápido', 'español', 'pruebas'];
  const esScore = esHints.filter((h) => lower.includes(h)).length;
  return esScore >= 2 ? 'es' : 'en';
}

export function extractProjectGovernanceMetadata(
  options: ApplyGovernanceDocsOptions
): ProjectGovernanceMetadata {
  const { name, version } = extractNameAndVersion(options.projectPath);
  const resolvedLang = resolveDocLanguage(options.projectPath, options.lang);
  const hasReadmeEs = fs.existsSync(path.join(options.projectPath, 'README.es.md'));
  const emitSpanishMirror =
    options.bilingualMirrors === true || (options.bilingualMirrors !== false && hasReadmeEs);
  const { layerRoot, detectedLayers } = detectLayerRootAndDirs(options.projectPath);
  const ownerHandle =
    (options.gitOwnerProbeFn ?? defaultGitOwnerProbe)(options.projectPath) ?? '@maintainers';
  return {
    projectName: name,
    slug: slugifyProjectName(options.projectPath),
    version,
    tier: options.tier,
    lang: resolvedLang,
    emitSpanishMirror,
    stacks: options.stacks.length > 0 ? [...options.stacks] : ['generic'],
    makefileTargets: extractMakefileQaTargets(options.projectPath),
    layerRoot,
    detectedLayers,
    ownerHandle,
  };
}

function renderChangelogTemplate(meta: ProjectGovernanceMetadata, lang: 'es' | 'en'): string {
  const dateIso = new Date().toISOString().slice(0, 10);
  if (lang === 'es') {
    return [
      '# Changelog',
      '',
      `Todos los cambios notables de **${meta.projectName}** se documentan en este archivo (formato Keep a Changelog / SemVer).`,
      '',
      UNRELEASED_HEADING,
      '',
      '### Añadido',
      `- Adopción inicial de gobernanza QA-11X (tier \`${meta.tier}\`, stacks: \`${meta.stacks.join(', ')}\`).`,
      '',
      `## [${meta.version}] - ${dateIso}`,
      '',
      '### Añadido',
      `- Línea base inicial de ${meta.projectName}.`,
      '',
    ].join('\n');
  }
  return [
    '# Changelog',
    '',
    `All notable changes to **${meta.projectName}** are documented in this file (Keep a Changelog / SemVer).`,
    '',
    UNRELEASED_HEADING,
    '',
    '### Added',
    `- Initial QA-11X governance baseline (tier \`${meta.tier}\`, stacks: \`${meta.stacks.join(', ')}\`).`,
    '',
    `## [${meta.version}] - ${dateIso}`,
    '',
    '### Added',
    `- Initial baseline of ${meta.projectName}.`,
    '',
  ].join('\n');
}

function renderRoadmapTemplate(meta: ProjectGovernanceMetadata, lang: 'es' | 'en'): string {
  if (lang === 'es') {
    return [
      `# 🗺️ Hoja de Ruta — ${meta.projectName}`,
      '',
      '| Hito | Alcance | Prioridad | Estado | Progreso |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **Hito 1** | Línea base QA-11X y automatización CI | Alta | 🚧 En Progreso | `50%` |',
      '',
      '## 🚧 Hito 1: Línea base QA-11X y automatización CI',
      `- [x] Configurar tier \`${meta.tier}\` en \`.qa-11x.json\` y conector \`AGENTS.md\`.`,
      '- [ ] Certificar el primer cierre local con `certify_11x_gate` (`>= 95%` cobertura en `standard`/`enterprise`).',
      '',
    ].join('\n');
  }
  return [
    `# 🗺️ Roadmap — ${meta.projectName}`,
    '',
    '| Milestone | Scope | Priority | Status | Progress |',
    '| :--- | :--- | :--- | :--- | :--- |',
    '| **Milestone 1** | QA-11X Baseline & CI Automation | High | 🚧 In Progress | `50%` |',
    '',
    '## 🚧 Milestone 1: QA-11X Baseline & CI Automation',
    `- [x] Configure \`${meta.tier}\` tier in \`.qa-11x.json\` and \`AGENTS.md\` connector.`,
    '- [ ] Certify initial local release with `certify_11x_gate` (`>= 95%` coverage for `standard`/`enterprise`).',
    '',
  ].join('\n');
}

function renderTestingTemplate(meta: ProjectGovernanceMetadata, lang: 'es' | 'en'): string {
  const cmds =
    meta.makefileTargets.length > 0
      ? meta.makefileTargets.map((t) => `- \`make ${t}\``)
      : ['- `run_ephemeral_qa(stage="lint")`', '- `run_ephemeral_qa(stage="unit")`'];
  if (lang === 'es') {
    return [
      `# 🛡️ Estrategia y Cuadro de Pruebas (TESTING.md) — ${meta.projectName} (\`v${meta.version}\`)`,
      '',
      `- **Tier QA-11X:** \`${meta.tier}\``,
      `- **Stacks detectados:** \`${meta.stacks.join(', ')}\``,
      '- **Regla Cero:** Toda ejecución de pruebas, linters y escáneres corre en contenedores Docker efímeros sin root (`--rm --restart=no`).',
      '',
      '## Comandos de Verificación',
      ...cmds,
      '',
      '## Umbrales Mínimos',
      '- Cobertura unitaria: `>= 95%` líneas/ramas (`standard`/`enterprise`).',
      '- Complejidad ciclomática: `CC <= 5`, Cognitiva `<= 15`.',
      '- Seguridad estática: `0` hallazgos `CRITICAL`/`HIGH` (`SEC-01..16`).',
      '',
    ].join('\n');
  }
  return [
    `# 🛡️ Testing Strategy & Scoreboard (TESTING.md) — ${meta.projectName} (\`v${meta.version}\`)`,
    '',
    `- **QA-11X Tier:** \`${meta.tier}\``,
    `- **Detected Stacks:** \`${meta.stacks.join(', ')}\``,
    '- **Rule Zero:** All tests, linters, and scanners execute inside non-root ephemeral Docker containers (`--rm --restart=no`).',
    '',
    '## Verification Commands',
    ...cmds,
    '',
    '## Minimum Thresholds',
    '- Unit coverage: `>= 95%` lines/branches (`standard`/`enterprise`).',
    '- Cyclomatic complexity: `CC <= 5`, Cognitive `<= 15`.',
    '- Static security: `0` `CRITICAL`/`HIGH` findings (`SEC-01..16`).',
    '',
  ].join('\n');
}

function renderSecurityTemplate(meta: ProjectGovernanceMetadata, lang: 'es' | 'en'): string {
  if (lang === 'es') {
    return [
      `# 🔒 Política de Seguridad — ${meta.projectName}`,
      '',
      '## Versiones Soportadas',
      '| Versión | Soportada |',
      '| :--- | :--- |',
      `| \`${meta.version}\` | ✅ Sí |`,
      '',
      '## Controles Activos (QA-11X / DISA STIG V6R5 / OWASP v4.2)',
      '- Cero secretos expuestos en el repositorio (`SEC-10`, escaneo pre-commit).',
      '- Ejecución aislada sin privilegios en Docker efímero (`Rule Zero`).',
      '- Auditoría estática y validación antes de cada `git commit` local (`QA-GIT-GATE-01`).',
      '',
      '## Reporte de Vulnerabilidades',
      `Reporta vulnerabilidades de forma privada al equipo responsable (${meta.ownerHandle}) antes de abrir incidencias públicas.`,
      '',
    ].join('\n');
  }
  return [
    `# 🔒 Security Policy — ${meta.projectName}`,
    '',
    '## Supported Versions',
    '| Version | Supported |',
    '| :--- | :--- |',
    `| \`${meta.version}\` | ✅ Yes |`,
    '',
    '## Active Controls (QA-11X / DISA STIG V6R5 / OWASP v4.2)',
    '- Zero secrets committed to source control (`SEC-10`, pre-commit guard).',
    '- Non-root ephemeral Docker execution (`Rule Zero`).',
    '- Static security audit and verification prior to local `git commit` (`QA-GIT-GATE-01`).',
    '',
    '## Reporting a Vulnerability',
    `Please report security vulnerabilities privately to ${meta.ownerHandle} before filing public issues.`,
    '',
  ].join('\n');
}

function renderBoundariesJsonTemplate(meta: ProjectGovernanceMetadata): string {
  const rulesSets: Array<Record<string, unknown>> = [
    {
      kind: 'layers',
      ...(meta.layerRoot ? { root: meta.layerRoot } : {}),
      layers: [...meta.detectedLayers],
    },
  ];
  return `${JSON.stringify({ rules_sets: rulesSets }, null, 2)}\n`;
}

function renderCalmJsonTemplate(meta: ProjectGovernanceMetadata): string {
  const primaryId = `${meta.slug}-service`;
  const storeId = `${meta.slug}-datastore`;
  const relId = `rel-${meta.slug}-to-store`;
  const doc = {
    'unique-id': `${meta.slug}-architecture`,
    name: `${meta.projectName} Architecture (FINOS CALM)`,
    description: `Declarative QA-11X architecture baseline for ${meta.projectName} (${meta.stacks.join(', ')}).`,
    nodes: [
      {
        'unique-id': primaryId,
        'node-type': 'service',
        name: meta.projectName,
        description: `Primary application runtime (${meta.stacks.join(', ')}).`,
      },
      {
        'unique-id': storeId,
        'node-type': 'database',
        name: `${meta.projectName} Data Store`,
        description: 'Persistent state store isolated under least-privilege credentials.',
      },
    ],
    relationships: [
      {
        'unique-id': relId,
        description: 'Authenticated application-to-datastore channel.',
        'relationship-type': {
          connects: {
            source: { node: primaryId },
            destination: { node: storeId },
          },
        },
      },
    ],
    controls: {
      'rule-zero-and-secrets-guard': {
        enabled: true,
        description: 'Enforce Rule Zero non-root ephemeral execution and zero committed secrets (SEC-10).',
        requirements: [
          {
            'requirement-url': 'https://owasp.org/www-project-application-security-verification-standard/',
            config: {
              'control-id': 'QA-11X-SEC-10',
              name: 'Zero Secrets and Ephemeral Isolation',
              description: 'Verify zero committed credentials and non-root container boundaries.',
            },
          },
        ],
        nodes: [primaryId, storeId],
        relationships: [relId],
      },
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function renderAdrTemplate(meta: ProjectGovernanceMetadata, lang: 'es' | 'en'): string {
  const dateIso = new Date().toISOString().slice(0, 10);
  if (lang === 'es') {
    return [
      '# 0001. Registrar Decisiones de Arquitectura y Gobernanza QA-11X',
      '',
      `- **Fecha:** ${dateIso}`,
      '- **Estado:** Aceptado',
      '',
      '## Contexto',
      `${meta.projectName} (\`v${meta.version}\`, stacks: \`${meta.stacks.join(', ')}\`) adopta el estándar QA-11X en tier \`${meta.tier}\` para trazabilidad técnica y ejecución aislada.`,
      '',
      '## Decisión',
      'Documentar decisiones arquitectónicas significativas mediante ADRs en `docs/adr/` y alinear cambios con fronteras declarativas y compuertas QA-11X.',
      '',
      '## Consecuencias',
      '- Contexto arquitectónico persistente y verificable para desarrolladores y agentes IA.',
      '',
    ].join('\n');
  }
  return [
    '# 0001. Record Architecture Decisions and QA-11X Governance',
    '',
    `- **Date:** ${dateIso}`,
    '- **Status:** Accepted',
    '',
    '## Context',
    `${meta.projectName} (\`v${meta.version}\`, stacks: \`${meta.stacks.join(', ')}\`) adopts Standard QA-11X at tier \`${meta.tier}\` for traceability and isolated verification.`,
    '',
    '## Decision',
    'Record significant architectural decisions as ADRs under `docs/adr/` and align code changes with declarative boundaries and QA-11X gates.',
    '',
    '## Consequences',
    '- Persistent, auditable architectural context for both engineers and AI agents.',
    '',
  ].join('\n');
}

function renderCodeownersTemplate(meta: ProjectGovernanceMetadata): string {
  return [
    `# Default code owners for ${meta.projectName}`,
    `* ${meta.ownerHandle}`,
    `/.agents/ ${meta.ownerHandle}`,
    `/.github/ ${meta.ownerHandle}`,
    '',
  ].join('\n');
}

function renderTemplateById(
  id: GovernanceFileId,
  meta: ProjectGovernanceMetadata,
  lang: 'es' | 'en'
): string {
  switch (id) {
    case GOVERNANCE_DOC_CHANGELOG:
      return renderChangelogTemplate(meta, lang);
    case GOVERNANCE_DOC_ROADMAP:
      return renderRoadmapTemplate(meta, lang);
    case GOVERNANCE_DOC_TESTING:
      return renderTestingTemplate(meta, lang);
    case GOVERNANCE_DOC_SECURITY:
      return renderSecurityTemplate(meta, lang);
    case GOVERNANCE_DOC_BOUNDARIES:
      return renderBoundariesJsonTemplate(meta);
    case GOVERNANCE_DOC_CALM:
      return renderCalmJsonTemplate(meta);
    case GOVERNANCE_DOC_ADR:
      return renderAdrTemplate(meta, lang);
    case GOVERNANCE_DOC_CODEOWNERS:
    default:
      return renderCodeownersTemplate(meta);
  }
}

function findFirstMatchingEntry(
  projectPath: string,
  dir: string,
  predicate: (entry: string) => boolean
): string | null {
  const abs = path.join(projectPath, dir);
  if (!fs.existsSync(abs)) return null;
  try {
    const entries = fs
      .readdirSync(abs)
      .filter(predicate)
      .sort((a, b) => a.localeCompare(b));
    return entries[0] ? `${dir}/${entries[0]}` : null;
  } catch {
    return null;
  }
}

function findFirstExistingMarkdownInDirs(
  projectPath: string,
  dirs: readonly string[]
): string | null {
  for (const dir of dirs) {
    const found = findFirstMatchingEntry(projectPath, dir, (e) => e.endsWith('.md'));
    if (found !== null) return found;
  }
  return null;
}

function findExistingAlternateRelPath(projectPath: string, id: GovernanceFileId): string | null {
  if (id === GOVERNANCE_DOC_CALM) {
    return findFirstMatchingEntry(
      projectPath,
      'architecture',
      (e) => e.endsWith('.calm.json') || e === 'calm.json'
    );
  }
  if (id === GOVERNANCE_DOC_CODEOWNERS) {
    return (
      ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'].find((alt) =>
        fs.existsSync(path.join(projectPath, alt))
      ) ?? null
    );
  }
  if (id === GOVERNANCE_DOC_ADR) {
    return findFirstExistingMarkdownInDirs(projectPath, ['docs/adr', 'docs/adrs', 'adr']);
  }
  return null;
}

function resolveTargetRelPath(
  projectPath: string,
  id: GovernanceFileId,
  meta: ProjectGovernanceMetadata
): string {
  const existingAlt = findExistingAlternateRelPath(projectPath, id);
  if (existingAlt !== null) {
    return existingAlt;
  }
  if (id === GOVERNANCE_DOC_CALM) {
    return `architecture/${meta.slug}.calm.json`;
  }
  return id;
}

export function resolveContainedChildPath(projectPath: string, relPath: string): string {
  const root = path.resolve(projectPath);
  const candidate = path.resolve(root, relPath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    throw new Error(`[SEC-PATH-01] Ruta de gobernanza fuera del workspace: ${relPath}`);
  }
  return candidate;
}

export function insertUnreleasedIntoLegacyChangelog(existing: string, lang: 'es' | 'en'): string {
  const section =
    lang === 'es'
      ? `${UNRELEASED_HEADING}\n\n### Añadido\n- Integración inicial de gobernanza QA-11X.\n`
      : `${UNRELEASED_HEADING}\n\n### Added\n- Initial QA-11X governance integration.\n`;
  const trailingNewline = existing.endsWith('\n') ? '' : '\n';
  const lines = existing.split(/\r?\n/);
  const firstVersionIdx = lines.findIndex((line) => /^##\s+\[?v?\d+\.\d+/i.test(line.trim()));
  if (firstVersionIdx >= 0) {
    const before = lines.slice(0, firstVersionIdx).join('\n').trimEnd();
    const after = lines.slice(firstVersionIdx).join('\n');
    const prefix = before.length > 0 ? `${before}\n\n` : '';
    return `${prefix}${section}\n${after}${trailingNewline}`;
  }
  const headingIdx = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  if (headingIdx >= 0) {
    const before = lines.slice(0, headingIdx + 1).join('\n');
    const after = lines.slice(headingIdx + 1).join('\n').trimStart();
    const suffix = after.length > 0 ? `\n${after}` : '';
    return `${before}\n\n${section}${suffix}${trailingNewline}`;
  }
  return `${section}\n${existing}${trailingNewline}`;
}

function writeFileContained(
  projectPath: string,
  relPath: string,
  content: string,
  mode?: number
): string {
  assertNoSymlinkSegments(projectPath, relPath);
  const fullPath = resolveContainedChildPath(projectPath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, mode !== undefined ? { encoding: UTF8, mode } : UTF8);
  if (mode !== undefined) {
    fs.chmodSync(fullPath, mode);
  }
  return fullPath;
}

function maybeWriteSpanishMirror(
  projectPath: string,
  id: GovernanceFileId,
  meta: ProjectGovernanceMetadata,
  dryRun: boolean
): string | undefined {
  if (!meta.emitSpanishMirror || !MARKDOWN_MIRRORABLE_IDS.has(id)) {
    return undefined;
  }
  const mirrorRel = id.replace(/\.md$/, '.es.md');
  assertNoSymlinkSegments(projectPath, mirrorRel);
  const mirrorFull = resolveContainedChildPath(projectPath, mirrorRel);
  if (fs.existsSync(mirrorFull)) {
    return undefined;
  }
  if (!dryRun) {
    writeFileContained(projectPath, mirrorRel, renderTemplateById(id, meta, 'es'));
  }
  return mirrorRel;
}

function applySingleGovernanceDoc(
  projectPath: string,
  id: GovernanceFileId,
  meta: ProjectGovernanceMetadata,
  dryRun: boolean
): GovernanceTemplateApplyItem {
  const relPath = resolveTargetRelPath(projectPath, id, meta);
  assertNoSymlinkSegments(projectPath, relPath);
  const fullPath = resolveContainedChildPath(projectPath, relPath);
  const existing = readTextSafe(fullPath);

  if (existing !== null) {
    if (id === GOVERNANCE_DOC_CHANGELOG && !existing.includes(UNRELEASED_HEADING)) {
      const backupRel = `${relPath}.11x-backup`;
      if (!dryRun) {
        writeFileContained(projectPath, backupRel, existing, 0o600);
        writeFileContained(projectPath, relPath, insertUnreleasedIntoLegacyChangelog(existing, meta.lang));
      }
      return {
        id,
        relative_path: relPath,
        action: dryRun ? 'dry_run' : 'updated',
        backup_path: backupRel,
      };
    }
    return { id, relative_path: relPath, action: 'preserved' };
  }

  const primaryLang: 'es' | 'en' =
    meta.emitSpanishMirror && MARKDOWN_MIRRORABLE_IDS.has(id) ? 'en' : meta.lang;
  const rendered = renderTemplateById(id, meta, primaryLang);
  if (!dryRun) {
    writeFileContained(projectPath, relPath, rendered);
  }
  const mirrorPath = maybeWriteSpanishMirror(projectPath, id, meta, dryRun);
  return {
    id,
    relative_path: relPath,
    action: dryRun ? 'dry_run' : 'created',
    ...(mirrorPath !== undefined ? { mirror_path: mirrorPath } : {}),
  };
}

/** Generates/surgically adapts requested governance docs and records declined/legacy decisions. */
export function applyGovernanceDocuments(
  options: ApplyGovernanceDocsOptions
): ApplyGovernanceDocsResult {
  const meta = extractProjectGovernanceMetadata(options);
  const items: GovernanceTemplateApplyItem[] = [];
  const decisionsDelta: Record<string, GovernanceDocDecision> = {};

  for (const rawId of options.governanceDocs ?? []) {
    const id = normalizeGovernanceDocId(rawId);
    const item = applySingleGovernanceDoc(options.projectPath, id, meta, options.dryRun);
    items.push(item);
    decisionsDelta[id] = 'enabled';
  }

  for (const rawDecline of options.declineGovernanceDocs ?? []) {
    const parsed = parseDeclineGovernanceEntry(rawDecline);
    const relPath = resolveTargetRelPath(options.projectPath, parsed.id, meta);
    decisionsDelta[parsed.id] = parsed.decision;
    items.push({
      id: parsed.id,
      relative_path: relPath,
      action: options.dryRun ? 'dry_run' : parsed.decision,
    });
  }

  return { items, decisionsDelta };
}
