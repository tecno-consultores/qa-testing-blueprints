// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNotSymlinkPath } from '../security/pathRealResolver.js';
import type {
  GovernanceDocDecision,
  OutputLanguageMode,
  Qa11xExecutionPath,
  Qa11xProjectConfigV3,
  StandardTier,
} from '../types.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

const UTF8 = 'utf-8';

export const QA_11X_CONFIG_FILENAME = '.qa-11x.json' as const;
export const QA_11X_CONFIG_SCHEMA_VERSION = 3 as const;
export const DEFAULT_QA_11X_TIER: StandardTier = 'standard';

export const TIER_STARTER: StandardTier = 'starter';
export const TIER_STANDARD: StandardTier = 'standard';
export const TIER_ENTERPRISE: StandardTier = 'enterprise';

export const TIER_ORDER: Readonly<Record<StandardTier, number>> = Object.freeze({
  starter: 0,
  standard: 1,
  enterprise: 2,
});

export const CANONICAL_GITIGNORE_ENTRIES = Object.freeze([
  '.agents/ACTIVE_TASK.md',
  '.agents/.qa-evidence.json',
  '.agents/.qa-11x-version',
  '.agents/.cache/',
  '.agents/backups/',
  '.agents/proposals/',
  '.agents/artifacts/',
  '.agents/tmp/',
  '.agents/mcp_config.json',
  'graphify-out/',
  '*.11x-backup',
  '*.11x-incoming',
  '.agents/**/*.bak',
] as const);

const GITIGNORE_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '.agents/.qa-11x-version': ['.agents/.qa-11x-version', '**/.qa-11x-version', '.qa-11x-version'],
  '.agents/**/*.bak': ['.agents/**/*.bak', '.agents/*.bak', '*.bak'],
});

const STARTER_GATES: readonly string[] = Object.freeze([
  'secret-hygiene',
  'rule-zero-ephemeral-docker',
  'ai-agent-connectors',
]);

const STANDARD_EXTRA_GATES: readonly string[] = Object.freeze([
  'unit-coverage-95',
  'strict-typing',
  'ast-blast-radius-ci',
  'lefthook-pr-ci',
  'core-governance-docs',
  'stig-owasp-core',
]);

const ENTERPRISE_EXTRA_GATES: readonly string[] = Object.freeze([
  'static-analysis-cc5',
  'postgres17-rls-worm-stig',
  'pact-cdct-karate-bdd',
  'ui-screenplay-wcag-anti-jsdom',
  'mutation-testing',
  'k6-performance-trivy-sbom',
  'calm-architecture-validation',
  'dual-ai-evals-release-gate',
]);

export const TIER_ACTIVE_GATES: Readonly<Record<StandardTier, readonly string[]>> = Object.freeze({
  [TIER_STARTER]: STARTER_GATES,
  [TIER_STANDARD]: Object.freeze([...STARTER_GATES, ...STANDARD_EXTRA_GATES]),
  [TIER_ENTERPRISE]: Object.freeze([
    ...STARTER_GATES,
    ...STANDARD_EXTRA_GATES,
    ...ENTERPRISE_EXTRA_GATES,
  ]),
});

const VALID_GOVERNANCE_DECISIONS = new Set<string>(['enabled', 'declined', 'legacy_preserved']);
const VALID_LANGS = new Set<string>(['auto', 'es', 'en']);

export interface LoadedQa11xConfig {
  readonly exists: boolean;
  readonly configPath: string;
  readonly schemaVersion: number | null;
  readonly declaredTier: StandardTier | null;
  readonly effectiveTier: StandardTier;
  readonly tierConfirmedByUser: boolean;
  readonly lang: OutputLanguageMode | undefined;
  readonly stacks: readonly string[];
  readonly governanceDocs: Readonly<Record<string, GovernanceDocDecision>>;
  readonly vibePrototypeDetected: boolean | undefined;
  readonly raw: Record<string, unknown> | null;
}

export function isTierAtLeast(effectiveTier: StandardTier, minTier: StandardTier): boolean {
  return TIER_ORDER[effectiveTier] >= TIER_ORDER[minTier];
}

export function deriveActiveGatesForTier(tier: StandardTier): readonly string[] {
  return TIER_ACTIVE_GATES[tier];
}

export function formatQa11xStatusBanner(
  tier: StandardTier,
  executionPath: Qa11xExecutionPath = 'AUTO'
): string {
  return `[QA-11X | Tier: ${tier} | Path: ${executionPath}]`;
}

export function parseStandardTier(raw: unknown): StandardTier | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  if (normalized === TIER_STARTER || normalized === TIER_STANDARD || normalized === TIER_ENTERPRISE) {
    return normalized;
  }
  return null;
}

function parseSchemaVersionNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string') {
    const major = Number.parseInt(raw.trim().split('.')[0] ?? '', 10);
    return Number.isFinite(major) ? major : null;
  }
  return null;
}

function parseOptionalLang(raw: unknown): OutputLanguageMode | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  return VALID_LANGS.has(normalized) ? (normalized as OutputLanguageMode) : undefined;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !out.includes(trimmed)) {
        out.push(trimmed);
      }
    }
  }
  return out;
}

function parseGovernanceDocsMap(raw: unknown): Record<string, GovernanceDocDecision> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, GovernanceDocDecision> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const cleanKey = key.trim();
    if (cleanKey && typeof value === 'string' && VALID_GOVERNANCE_DECISIONS.has(value)) {
      out[cleanKey] = value as GovernanceDocDecision;
    }
  }
  return out;
}

function readRawJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, UTF8));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (err: unknown) {
    reportDebugCatchError(`qa11xConfig.readRawJsonObject(${filePath})`, err);
    return null;
  }
}

export function readQa11xConfig(projectPath: string): LoadedQa11xConfig {
  const configPath = path.join(projectPath, QA_11X_CONFIG_FILENAME);
  const raw = readRawJsonObject(configPath);
  if (raw === null) {
    return {
      exists: false,
      configPath,
      schemaVersion: null,
      declaredTier: null,
      effectiveTier: DEFAULT_QA_11X_TIER,
      tierConfirmedByUser: false,
      lang: undefined,
      stacks: [],
      governanceDocs: Object.freeze({}),
      vibePrototypeDetected: undefined,
      raw: null,
    };
  }
  const declaredTier = parseStandardTier(raw.tier);
  const rawStacks = Array.isArray(raw.stacks) ? raw.stacks : raw.detectedStacks;
  return {
    exists: true,
    configPath,
    schemaVersion: parseSchemaVersionNumber(raw.schemaVersion),
    declaredTier,
    effectiveTier: declaredTier ?? DEFAULT_QA_11X_TIER,
    tierConfirmedByUser: raw.tierConfirmedByUser === true,
    lang: parseOptionalLang(raw.lang),
    stacks: Object.freeze(parseStringArray(rawStacks)),
    governanceDocs: Object.freeze(parseGovernanceDocsMap(raw.governanceDocs)),
    vibePrototypeDetected:
      typeof raw.vibePrototypeDetected === 'boolean' ? raw.vibePrototypeDetected : undefined,
    raw,
  };
}

export interface BuildQa11xConfigV3Input {
  readonly tier: StandardTier;
  readonly tierConfirmedByUser: boolean;
  readonly lang: OutputLanguageMode;
  readonly stacks: readonly string[];
  readonly governanceDocs?: Readonly<Record<string, GovernanceDocDecision>>;
  readonly vibePrototypeDetected?: boolean;
  readonly existingRaw?: Record<string, unknown> | null;
  readonly force?: boolean;
}

export function buildQa11xConfigV3Payload(input: BuildQa11xConfigV3Input): {
  readonly canonical: Qa11xProjectConfigV3;
  readonly serialized: string;
} {
  const cleanStacks = parseStringArray(input.stacks);
  const mergedGovDocs: Record<string, GovernanceDocDecision> = {
    ...(input.force ? {} : parseGovernanceDocsMap(input.existingRaw?.governanceDocs)),
    ...(input.governanceDocs ?? {}),
  };
  const canonical: Qa11xProjectConfigV3 = {
    schemaVersion: QA_11X_CONFIG_SCHEMA_VERSION,
    tier: input.tier,
    tierConfirmedByUser: input.tierConfirmedByUser,
    lang: input.lang,
    stacks: cleanStacks,
    governanceDocs: mergedGovDocs,
    ruleZeroEphemeralDocker: true,
    ...(input.vibePrototypeDetected !== undefined
      ? { vibePrototypeDetected: input.vibePrototypeDetected }
      : {}),
  };
  const preservedExtras: Record<string, unknown> = {};
  if (!input.force && input.existingRaw) {
    const managedKeys = new Set([
      'schemaVersion',
      'tier',
      'tierConfirmedByUser',
      'lang',
      'stacks',
      'detectedStacks',
      'activeGates',
      'governanceDocs',
      'ruleZeroEphemeralDocker',
      'vibePrototypeDetected',
    ]);
    for (const [k, v] of Object.entries(input.existingRaw)) {
      if (!managedKeys.has(k)) {
        preservedExtras[k] = v;
      }
    }
  }
  const merged = { ...preservedExtras, ...canonical };
  return {
    canonical,
    serialized: `${JSON.stringify(merged, null, 2)}\n`,
  };
}

export function writeQa11xConfig(
  projectPath: string,
  input: BuildQa11xConfigV3Input,
  options: { readonly dryRun?: boolean } = {}
): {
  readonly configPath: string;
  readonly canonical: Qa11xProjectConfigV3;
  readonly serialized: string;
  readonly action: 'created' | 'updated' | 'preserved' | 'planned';
} {
  const configPath = path.join(projectPath, QA_11X_CONFIG_FILENAME);
  assertNotSymlinkPath(configPath);
  const existingText = fs.existsSync(configPath) ? fs.readFileSync(configPath, UTF8) : null;
  const { canonical, serialized } = buildQa11xConfigV3Payload(input);
  if (existingText === serialized) {
    return { configPath, canonical, serialized, action: 'preserved' };
  }
  if (options.dryRun) {
    return { configPath, canonical, serialized, action: 'planned' };
  }
  fs.writeFileSync(configPath, serialized, UTF8);
  return {
    configPath,
    canonical,
    serialized,
    action: existingText === null ? 'created' : 'updated',
  };
}

function hasCanonicalGitignoreEntry(existingLines: ReadonlySet<string>, entry: string): boolean {
  const equivalents = Object.hasOwn(GITIGNORE_EQUIVALENTS, entry)
    ? GITIGNORE_EQUIVALENTS[entry]
    : undefined;
  if (equivalents) {
    return equivalents.some((candidate) => existingLines.has(candidate));
  }
  return existingLines.has(entry);
}

export function findMissingCanonicalGitignoreEntries(existingContent: string | null): string[] {
  if (existingContent === null) {
    return [...CANONICAL_GITIGNORE_ENTRIES];
  }
  const lines = new Set(existingContent.split(/\r?\n/).map((line) => line.trim()));
  return CANONICAL_GITIGNORE_ENTRIES.filter((entry) => !hasCanonicalGitignoreEntry(lines, entry));
}
