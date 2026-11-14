// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Resolucion semantica Self-Healing DOM Zero-Infra para Vue 3 (Estandar QA-11X).
 * Soporta ARIA exacto, testId, sinonimos/similitud Jaccard, Teleport y purga data-v-*.
 */

import { defineQuestion, type Question } from '../screenplay/Actor.ts';

export type ResolutionStrategy =
  | 'exact-aria'
  | 'testid-fallback'
  | 'semantic-synonym'
  | 'fuzzy-aria';

export interface SemanticTarget {
  readonly intent: string;
  readonly role: string;
  readonly accessibleName: string;
  readonly synonyms?: readonly string[];
  readonly testId?: string;
  readonly landmark?: string;
  readonly minConfidence?: number;
}

export interface NodeBounds {
  readonly width: number;
  readonly height: number;
}

export interface DomCandidateNode<TRef = unknown> {
  readonly ref: TRef;
  readonly role: string;
  readonly accessibleName?: string;
  readonly textContent?: string;
  readonly testId?: string;
  readonly landmark?: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly visible: boolean;
  readonly disabled?: boolean;
  readonly bounds?: NodeBounds;
}

export interface RecommendedTargetUpdate {
  readonly role: string;
  readonly accessibleName: string;
  readonly testId?: string;
  readonly landmark?: string;
}

export interface HealingTelemetryRecord {
  readonly intent: string;
  readonly strategy: ResolutionStrategy;
  readonly confidence: number;
  readonly recommendedTargetUpdate: RecommendedTargetUpdate;
  readonly timestampMs: number;
}

export interface CandidateScorePreview {
  readonly role: string;
  readonly name: string;
  readonly score: number;
}

export type SemanticErrorReason =
  | 'no_candidates'
  | 'below_min_confidence'
  | 'ambiguous_tie';

export class SemanticLocatorError extends Error {
  readonly intent: string;
  readonly reason: SemanticErrorReason;
  readonly topCandidates: readonly CandidateScorePreview[];

  constructor(
    intent: string,
    reason: SemanticErrorReason,
    message: string,
    topCandidates: readonly CandidateScorePreview[],
  ) {
    super(message);
    this.name = 'SemanticLocatorError';
    this.intent = intent;
    this.reason = reason;
    this.topCandidates = Object.freeze([...topCandidates]);
  }
}

export class HealingTelemetryCollector {
  private readonly records: HealingTelemetryRecord[];

  constructor() {
    this.records = [];
  }

  record(entry: HealingTelemetryRecord): void {
    this.records.push(entry);
  }

  getRecords(): readonly HealingTelemetryRecord[] {
    return Object.freeze([...this.records]);
  }

  clear(): void {
    this.records.length = 0;
  }
}

export interface SemanticResolutionOptions {
  readonly telemetry?: HealingTelemetryCollector;
}

export interface SemanticResolutionResult<TRef = unknown> {
  readonly ref: TRef;
  readonly candidate: DomCandidateNode<TRef>;
  readonly cleanAttributes: Readonly<Record<string, string>>;
  readonly strategy: ResolutionStrategy;
  readonly score: number;
  readonly healed: boolean;
  readonly telemetryRecord?: HealingTelemetryRecord;
}

interface ScoredCandidate<TRef> {
  readonly candidate: DomCandidateNode<TRef>;
  readonly cleanAttributes: Readonly<Record<string, string>>;
  readonly label: string;
  readonly score: number;
  readonly strategy: ResolutionStrategy;
  readonly healed: boolean;
}

const DEFAULT_MIN_CONFIDENCE = 0.75;
const AMBIGUITY_MARGIN = 0.03;
const VUE_SCOPED_ATTR_RE = /^data-v-[a-z0-9_-]*$/i;
const VUE_PORTAL_LANDMARKS: ReadonlySet<string> = new Set(['dialog', 'overlay', 'teleport']);

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function tokenize(value: string): readonly string[] {
  const normalized = normalizeText(value);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0);
}

function computeJaccard(aTokens: readonly string[], bTokens: readonly string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const unionSize = setA.size + setB.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

export function sanitizeVueScopedAttributes(
  attrs: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const cleaned: Record<string, string> = {};
  for (const [key, val] of Object.entries(attrs)) {
    if (!VUE_SCOPED_ATTR_RE.test(key)) {
      cleaned[key] = val;
    }
  }
  return Object.freeze(cleaned);
}

export function isVueTeleportPortal(candidate: DomCandidateNode<unknown>): boolean {
  if (
    candidate.attributes['data-teleport'] !== undefined ||
    candidate.attributes['data-v-teleport'] !== undefined
  ) {
    return true;
  }
  const landmark = normalizeText(candidate.landmark ?? '');
  if (landmark === 'teleport' || landmark === 'overlay') {
    return true;
  }
  const role = normalizeText(candidate.role);
  return landmark === 'dialog' && (role === 'dialog' || role === 'alertdialog');
}

function isEligibleNode<TRef>(candidate: DomCandidateNode<TRef>): boolean {
  if (!candidate.visible) {
    return false;
  }
  if (candidate.bounds === undefined) {
    return true;
  }
  return candidate.bounds.width > 0 && candidate.bounds.height > 0;
}

function readCandidateLabel<TRef>(
  candidate: DomCandidateNode<TRef>,
  cleanAttrs: Readonly<Record<string, string>>,
): string {
  const raw = candidate.accessibleName ?? candidate.textContent ?? cleanAttrs['aria-label'] ?? '';
  return normalizeText(raw);
}

function matchesVueLandmark(
  targetLandmark: string | undefined,
  candidate: DomCandidateNode<unknown>,
): boolean {
  if (targetLandmark === undefined || normalizeText(targetLandmark).length === 0) {
    return true;
  }
  const wanted = normalizeText(targetLandmark);
  const actual = normalizeText(candidate.landmark ?? '');
  if (wanted === actual) {
    return true;
  }
  return VUE_PORTAL_LANDMARKS.has(wanted) && isVueTeleportPortal(candidate);
}

function hasLandmarkBonus(
  target: SemanticTarget,
  candidate: DomCandidateNode<unknown>,
): boolean {
  if (target.landmark === undefined || normalizeText(target.landmark).length === 0) {
    return false;
  }
  return matchesVueLandmark(target.landmark, candidate);
}

function matchSynonym(
  target: SemanticTarget,
  candidate: DomCandidateNode<unknown>,
  candLabel: string,
): ScoredCandidate<never> | null {
  const synonyms = target.synonyms ?? [];
  for (const synonym of synonyms) {
    if (normalizeText(synonym) === candLabel) {
      const score = hasLandmarkBonus(target, candidate) ? 0.90 : 0.86;
      return {
        candidate: candidate as never,
        cleanAttributes: {},
        label: candLabel,
        score,
        strategy: 'semantic-synonym',
        healed: true,
      };
    }
  }
  return null;
}

function bestTokenSimilarity(target: SemanticTarget, candLabel: string): number {
  const candTokens = tokenize(candLabel);
  const phrases = [target.accessibleName, ...(target.synonyms ?? [])];
  let best = 0;
  for (const phrase of phrases) {
    const score = computeJaccard(tokenize(phrase), candTokens);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function scoreSemanticOrFuzzy<TRef>(
  target: SemanticTarget,
  candidate: DomCandidateNode<TRef>,
  cleanAttrs: Readonly<Record<string, string>>,
  candLabel: string,
): ScoredCandidate<TRef> | null {
  if (candLabel.length === 0) {
    return null;
  }
  const synonymHit = matchSynonym(target, candidate, candLabel);
  if (synonymHit !== null) {
    return { ...synonymHit, candidate, cleanAttributes: cleanAttrs };
  }
  const jaccard = bestTokenSimilarity(target, candLabel);
  if (jaccard <= 0) {
    return null;
  }
  const bonus = hasLandmarkBonus(target, candidate) ? 0.04 : 0;
  const score = Math.min(0.90, Number((0.65 + 0.21 * jaccard + bonus).toFixed(4)));
  return {
    candidate,
    cleanAttributes: cleanAttrs,
    label: candLabel,
    score,
    strategy: 'fuzzy-aria',
    healed: true,
  };
}

function scoreCandidate<TRef>(
  target: SemanticTarget,
  candidate: DomCandidateNode<TRef>,
): ScoredCandidate<TRef> | null {
  const cleanAttrs = sanitizeVueScopedAttributes(candidate.attributes);
  const candLabel = readCandidateLabel(candidate, cleanAttrs);
  const roleMatches = normalizeText(candidate.role) === normalizeText(target.role);
  const landmarkOk = matchesVueLandmark(target.landmark, candidate);

  if (roleMatches && candLabel.length > 0 && candLabel === normalizeText(target.accessibleName) && landmarkOk) {
    return { candidate, cleanAttributes: cleanAttrs, label: candLabel, score: 1, strategy: 'exact-aria', healed: false };
  }
  const candTestId = candidate.testId ?? cleanAttrs['data-testid'];
  if (target.testId !== undefined && target.testId.length > 0 && candTestId === target.testId) {
    return { candidate, cleanAttributes: cleanAttrs, label: candLabel, score: 0.92, strategy: 'testid-fallback', healed: true };
  }
  return roleMatches ? scoreSemanticOrFuzzy(target, candidate, cleanAttrs, candLabel) : null;
}

function buildTopPreviews<TRef>(
  scored: readonly ScoredCandidate<TRef>[],
): readonly CandidateScorePreview[] {
  return scored.slice(0, 3).map((entry) => ({
    role: entry.candidate.role,
    name: entry.label || entry.candidate.testId || '(sin-nombre)',
    score: entry.score,
  }));
}

function buildTelemetryRecord<TRef>(
  target: SemanticTarget,
  best: ScoredCandidate<TRef>,
): HealingTelemetryRecord {
  const candTestId = best.candidate.testId ?? best.cleanAttributes['data-testid'];
  return {
    intent: target.intent,
    strategy: best.strategy,
    confidence: best.score,
    recommendedTargetUpdate: {
      role: best.candidate.role,
      accessibleName: best.candidate.accessibleName ?? best.candidate.textContent ?? best.label,
      ...(candTestId !== undefined ? { testId: candTestId } : {}),
      ...(best.candidate.landmark !== undefined ? { landmark: best.candidate.landmark } : {}),
    },
    timestampMs: Date.now(),
  };
}

function validateWinningScore<TRef>(
  target: SemanticTarget,
  scored: readonly ScoredCandidate<TRef>[],
): ScoredCandidate<TRef> {
  if (scored.length === 0) {
    throw new SemanticLocatorError(
      target.intent,
      'no_candidates',
      `Sin candidatos visibles validos para intent "${target.intent}"`,
      [],
    );
  }
  const minConfidence = target.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const best = scored[0];
  const previews = buildTopPreviews(scored);
  if (best.score < minConfidence) {
    throw new SemanticLocatorError(
      target.intent,
      'below_min_confidence',
      `Confianza insuficiente (${best.score} < ${minConfidence}) para "${target.intent}"`,
      previews,
    );
  }
  if (scored.length > 1 && best.score - scored[1].score < AMBIGUITY_MARGIN) {
    throw new SemanticLocatorError(
      target.intent,
      'ambiguous_tie',
      `Empate ambiguo (${best.score} vs ${scored[1].score}) para "${target.intent}"`,
      previews,
    );
  }
  return best;
}

export function resolveSemanticLocator<TRef>(
  target: SemanticTarget,
  candidates: readonly DomCandidateNode<TRef>[],
  options?: SemanticResolutionOptions,
): SemanticResolutionResult<TRef> {
  const scored: ScoredCandidate<TRef>[] = [];
  for (const candidate of candidates) {
    if (!isEligibleNode(candidate)) {
      continue;
    }
    const result = scoreCandidate(target, candidate);
    if (result !== null) {
      scored.push(result);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const best = validateWinningScore(target, scored);
  const telemetryRecord = best.healed ? buildTelemetryRecord(target, best) : undefined;
  if (telemetryRecord !== undefined && options?.telemetry !== undefined) {
    options.telemetry.record(telemetryRecord);
  }
  return {
    ref: best.candidate.ref,
    candidate: best.candidate,
    cleanAttributes: best.cleanAttributes,
    strategy: best.strategy,
    score: best.score,
    healed: best.healed,
    ...(telemetryRecord !== undefined ? { telemetryRecord } : {}),
  };
}

export function LocateSemanticTargetQuestion<TRef>(
  target: SemanticTarget,
  getCandidates: () => Promise<readonly DomCandidateNode<TRef>[]> | readonly DomCandidateNode<TRef>[],
  options?: SemanticResolutionOptions,
): Question<SemanticResolutionResult<TRef>> {
  return defineQuestion(
    `Localizar objetivo semantico "${target.intent}" (${target.role}: ${target.accessibleName})`,
    async (): Promise<SemanticResolutionResult<TRef>> => {
      const candidates = await getCandidates();
      return resolveSemanticLocator(target, candidates, options);
    },
  );
}
