// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Resolucion semantica Self-Healing DOM Zero-Infra para React (Estandar QA-11X).
 * Sanea useId de React (:r0:/«r0»/_r_0_), soporta portales y bloquea Suspense aria-busy.
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
  readonly allowBusy?: boolean;
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
const TESTID_FALLBACK_SCORE = 0.94;
const SYNONYM_LANDMARK_SCORE = 0.88;
const SYNONYM_BASE_SCORE = 0.84;
const FUZZY_MAX_SCORE = 0.88;
const REACT_USE_ID_RE = /(?::r[0-9a-z]+:|«r[0-9a-z]+»|_r_[0-9a-z]+_)/gi;
const REACT_PORTAL_LANDMARKS: ReadonlySet<string> = new Set(['dialog', 'overlay', 'portal']);
const REACT_PORTAL_ATTRS = ['data-portal', 'data-radix-portal', 'data-floating-ui-portal'] as const;

export function stripReactUseId(value: string): string {
  return value.replace(REACT_USE_ID_RE, '').replace(/\s+/g, ' ').trim();
}

export function sanitizeReactAttributes(
  attrs: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const cleaned: Record<string, string> = {};
  for (const [key, val] of Object.entries(attrs)) {
    const sanitized = stripReactUseId(val);
    if (sanitized.length > 0 || val.length === 0) {
      cleaned[key] = sanitized;
    }
  }
  return Object.freeze(cleaned);
}

function normalizeText(value: string): string {
  return stripReactUseId(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function readNormalizedText(value: string | undefined): string {
  return value === undefined ? '' : normalizeText(value);
}

function tokenize(value: string): readonly string[] {
  const normalized = normalizeText(value);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0);
}

function countSetIntersection(setA: ReadonlySet<string>, setB: ReadonlySet<string>): number {
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  return intersection;
}

function computeJaccard(aTokens: readonly string[], bTokens: readonly string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  const intersection = countSetIntersection(setA, setB);
  const unionSize = setA.size + setB.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

function hasPortalAttr(attrs: Readonly<Record<string, string>>): boolean {
  return REACT_PORTAL_ATTRS.some((attr) => Object.hasOwn(attrs, attr));
}

function isPortalLandmarkName(landmark: string): boolean {
  return landmark === 'portal' || landmark === 'overlay';
}

function isDialogRole(role: string): boolean {
  return role === 'dialog' || role === 'alertdialog';
}

export function isReactPortal(candidate: DomCandidateNode<unknown>): boolean {
  if (hasPortalAttr(candidate.attributes)) {
    return true;
  }
  const landmark = readNormalizedText(candidate.landmark);
  if (isPortalLandmarkName(landmark)) {
    return true;
  }
  return landmark === 'dialog' && isDialogRole(normalizeText(candidate.role));
}

function isDisabledCandidate<TRef>(candidate: DomCandidateNode<TRef>): boolean {
  return (
    candidate.disabled === true ||
    (Object.hasOwn(candidate.attributes, 'disabled') &&
      candidate.attributes['disabled'] !== 'false') ||
    candidate.attributes['aria-disabled'] === 'true'
  );
}

function isBusyBlocked(
  candidate: DomCandidateNode<unknown>,
  options?: SemanticResolutionOptions,
): boolean {
  return options?.allowBusy !== true && candidate.attributes['aria-busy'] === 'true';
}

function hasValidBounds(bounds: NodeBounds | undefined): boolean {
  if (bounds === undefined) {
    return true;
  }
  return bounds.width > 0 && bounds.height > 0;
}

function isEligibleNode<TRef>(
  candidate: DomCandidateNode<TRef>,
  options?: SemanticResolutionOptions,
): boolean {
  if (!candidate.visible || isDisabledCandidate(candidate)) {
    return false;
  }
  if (isBusyBlocked(candidate, options)) {
    return false;
  }
  return hasValidBounds(candidate.bounds);
}

function readCandidateLabel<TRef>(
  candidate: DomCandidateNode<TRef>,
  cleanAttrs: Readonly<Record<string, string>>,
): string {
  const raw = candidate.accessibleName ?? candidate.textContent ?? cleanAttrs['aria-label'] ?? '';
  return normalizeText(raw);
}

function matchesReactLandmark(
  targetLandmark: string | undefined,
  candidate: DomCandidateNode<unknown>,
): boolean {
  const wanted = readNormalizedText(targetLandmark);
  if (wanted.length === 0) {
    return true;
  }
  if (wanted === readNormalizedText(candidate.landmark)) {
    return true;
  }
  return REACT_PORTAL_LANDMARKS.has(wanted) && isReactPortal(candidate);
}

function hasLandmarkBonus(
  target: SemanticTarget,
  candidate: DomCandidateNode<unknown>,
): boolean {
  if (target.landmark === undefined || normalizeText(target.landmark).length === 0) {
    return false;
  }
  return matchesReactLandmark(target.landmark, candidate);
}

function matchSynonym(
  target: SemanticTarget,
  candidate: DomCandidateNode<unknown>,
  candLabel: string,
): ScoredCandidate<never> | null {
  const synonyms = target.synonyms ?? [];
  for (const synonym of synonyms) {
    if (normalizeText(synonym) === candLabel) {
      const score = hasLandmarkBonus(target, candidate)
        ? SYNONYM_LANDMARK_SCORE
        : SYNONYM_BASE_SCORE;
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
  const rawScore = 0.65 + 0.21 * jaccard + bonus;
  const score = Math.min(FUZZY_MAX_SCORE, Number(rawScore.toFixed(4)));
  return {
    candidate,
    cleanAttributes: cleanAttrs,
    label: candLabel,
    score,
    strategy: 'fuzzy-aria',
    healed: true,
  };
}

interface CandidateEvalContext<TRef> {
  readonly candidate: DomCandidateNode<TRef>;
  readonly cleanAttrs: Readonly<Record<string, string>>;
  readonly candLabel: string;
  readonly roleMatches: boolean;
}

function tryExactAriaScore<TRef>(
  target: SemanticTarget,
  ctx: CandidateEvalContext<TRef>,
): ScoredCandidate<TRef> | null {
  if (!ctx.roleMatches || ctx.candLabel.length === 0) {
    return null;
  }
  if (ctx.candLabel !== normalizeText(target.accessibleName)) {
    return null;
  }
  if (!matchesReactLandmark(target.landmark, ctx.candidate)) {
    return null;
  }
  return {
    candidate: ctx.candidate,
    cleanAttributes: ctx.cleanAttrs,
    label: ctx.candLabel,
    score: 1,
    strategy: 'exact-aria',
    healed: false,
  };
}

function readCandidateTestId(
  candidate: DomCandidateNode<unknown>,
  cleanAttrs: Readonly<Record<string, string>>,
): string | undefined {
  return candidate.testId ?? cleanAttrs['data-testid'];
}

function tryTestIdScore<TRef>(
  target: SemanticTarget,
  ctx: CandidateEvalContext<TRef>,
): ScoredCandidate<TRef> | null {
  if (target.testId === undefined || target.testId.length === 0) {
    return null;
  }
  const candTestId = readCandidateTestId(ctx.candidate, ctx.cleanAttrs);
  if (candTestId !== target.testId) {
    return null;
  }
  return {
    candidate: ctx.candidate,
    cleanAttributes: ctx.cleanAttrs,
    label: ctx.candLabel,
    score: TESTID_FALLBACK_SCORE,
    strategy: 'testid-fallback',
    healed: true,
  };
}

function scoreCandidate<TRef>(
  target: SemanticTarget,
  candidate: DomCandidateNode<TRef>,
): ScoredCandidate<TRef> | null {
  const cleanAttrs = sanitizeReactAttributes(candidate.attributes);
  const ctx: CandidateEvalContext<TRef> = {
    candidate,
    cleanAttrs,
    candLabel: readCandidateLabel(candidate, cleanAttrs),
    roleMatches: normalizeText(candidate.role) === normalizeText(target.role),
  };
  const exactHit = tryExactAriaScore(target, ctx);
  if (exactHit !== null) {
    return exactHit;
  }
  const testIdHit = tryTestIdScore(target, ctx);
  if (testIdHit !== null) {
    return testIdHit;
  }
  return ctx.roleMatches
    ? scoreSemanticOrFuzzy(target, candidate, cleanAttrs, ctx.candLabel)
    : null;
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

function readRecommendedName<TRef>(best: ScoredCandidate<TRef>): string {
  return best.candidate.accessibleName ?? best.candidate.textContent ?? best.label;
}

function buildRecommendedTargetUpdate<TRef>(
  best: ScoredCandidate<TRef>,
): RecommendedTargetUpdate {
  const candTestId = readCandidateTestId(best.candidate, best.cleanAttributes);
  const landmark = best.candidate.landmark;
  const update: {
    role: string;
    accessibleName: string;
    testId?: string;
    landmark?: string;
  } = {
    role: best.candidate.role,
    accessibleName: readRecommendedName(best),
  };
  if (candTestId !== undefined) {
    update.testId = candTestId;
  }
  if (landmark !== undefined) {
    update.landmark = landmark;
  }
  return update;
}

function buildTelemetryRecord<TRef>(
  target: SemanticTarget,
  best: ScoredCandidate<TRef>,
): HealingTelemetryRecord {
  return {
    intent: target.intent,
    strategy: best.strategy,
    confidence: best.score,
    recommendedTargetUpdate: buildRecommendedTargetUpdate(best),
    timestampMs: Date.now(),
  };
}

function resolveMinConfidence(target: SemanticTarget): number {
  return target.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
}

function hasAmbiguousTie<TRef>(
  scored: readonly ScoredCandidate<TRef>[],
  bestScore: number,
): boolean {
  return scored.length > 1 && bestScore - scored[1].score < AMBIGUITY_MARGIN;
}

function validateWinningScore<TRef>(
  target: SemanticTarget,
  scored: readonly ScoredCandidate<TRef>[],
): ScoredCandidate<TRef> {
  if (scored.length === 0) {
    throw new SemanticLocatorError(
      target.intent,
      'no_candidates',
      `Sin candidatos visibles ni listos (aria-busy=false) para "${target.intent}"`,
      [],
    );
  }
  const minConfidence = resolveMinConfidence(target);
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
  if (hasAmbiguousTie(scored, best.score)) {
    throw new SemanticLocatorError(
      target.intent,
      'ambiguous_tie',
      `Empate ambiguo (${best.score} vs ${scored[1].score}) para "${target.intent}"`,
      previews,
    );
  }
  return best;
}

function collectScoredCandidates<TRef>(
  target: SemanticTarget,
  candidates: readonly DomCandidateNode<TRef>[],
  options?: SemanticResolutionOptions,
): ScoredCandidate<TRef>[] {
  const scored: ScoredCandidate<TRef>[] = [];
  for (const candidate of candidates) {
    if (!isEligibleNode(candidate, options)) {
      continue;
    }
    const result = scoreCandidate(target, candidate);
    if (result !== null) {
      scored.push(result);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function recordTelemetryIfHealed<TRef>(
  target: SemanticTarget,
  best: ScoredCandidate<TRef>,
  options?: SemanticResolutionOptions,
): HealingTelemetryRecord | undefined {
  if (!best.healed) {
    return undefined;
  }
  const record = buildTelemetryRecord(target, best);
  if (options?.telemetry !== undefined) {
    options.telemetry.record(record);
  }
  return record;
}

export function resolveSemanticLocator<TRef>(
  target: SemanticTarget,
  candidates: readonly DomCandidateNode<TRef>[],
  options?: SemanticResolutionOptions,
): SemanticResolutionResult<TRef> {
  const scored = collectScoredCandidates(target, candidates, options);
  const best = validateWinningScore(target, scored);
  const telemetryRecord = recordTelemetryIfHealed(target, best, options);
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

export type CandidateProvider<TRef> = () =>
  | Promise<readonly DomCandidateNode<TRef>[]>
  | readonly DomCandidateNode<TRef>[];

export function LocateSemanticTargetQuestion<TRef>(
  target: SemanticTarget,
  getCandidates: CandidateProvider<TRef>,
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
