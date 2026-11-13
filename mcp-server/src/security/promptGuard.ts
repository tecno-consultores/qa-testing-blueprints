// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

export const REDACTED_EMAIL = '[REDACTED_EMAIL]';
export const REDACTED_CARD = '[REDACTED_CARD]';
export const REDACTED_SSN = '[REDACTED_SSN]';
export const REDACTED_PHONE = '[REDACTED_PHONE]';
export const REDACTED_SECRET = '[REDACTED_SECRET]';
export const REDACTED_PROMPT_INJECTION = '[REDACTED_PROMPT_INJECTION]';

export const DEFAULT_PROMPT_INJECTION_MIN_SCORE = 0.8;
export const DEFAULT_MAX_RECURSION_DEPTH = 12;

export const DANGEROUS_PROTOTYPE_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
]);

export interface PromptGuardOptions {
  enabled?: boolean;
  minScore?: number;
  maxDepth?: number;
  strictPii?: boolean;
}

export interface PromptSafetyReport {
  safe: boolean;
  score: number;
  matchedRules: string[];
  normalizedText: string;
}

export interface ToolCallGuardResult<T = Record<string, unknown> | undefined> {
  toolName: string;
  blocked: boolean;
  score: number;
  matchedRules: string[];
  sanitizedArgs: T;
}

interface WeightedRule {
  readonly id: string;
  readonly weight: number;
  readonly matches: (text: string) => boolean;
}

interface RedactionRule {
  readonly pattern: RegExp;
  readonly replacement: string;
}

interface GuardTraversalState {
  readonly maxDepth: number;
  readonly options?: PromptGuardOptions;
  blocked: boolean;
  score: number;
  readonly matchedRules: Set<string>;
}

const RULE_MAX_DEPTH_EXCEEDED = 'max_recursion_depth_exceeded';
const RULE_PROTOTYPE_POLLUTION = 'prototype_pollution_key';
const RULE_ENCODED_EVASION = 'encoded_payload_evasion';

const MAX_BASE64_CANDIDATES = 16;
const MIN_DECODED_BYTES = 8;

const INVISIBLE_CODEPOINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f],
];

const INSTRUCTION_OVERRIDE_EN_RE =
  /\b(?:ignore|disregard|forget|override) (?:all |any )?(?:previous|prior|above|system|preceding) (?:instructions|directives|rules|prompts|guardrails)\b/i;

const INSTRUCTION_OVERRIDE_ES_RE =
  /\b(?:ignora|olvida|omite|descarta|anula) (?:todas )?(?:las )?(?:instrucciones|directivas|reglas|restricciones) (?:anteriores|previas|del sistema|de seguridad|actuales)\b/i;

const ROLE_DELIMITER_SPOOFING_RE =
  /(?:<\|im_start\|>\s{0,4}(?:system|developer|assistant)?|<\|im_end\|>|<\|endoftext\|>|\[INST\]|\[\/INST\]|<\/system>|<system_override>|<\|system\|>|<<SYS>>)/i;

const ROLE_DELIMITER_SPOOFING_GLOBAL_RE =
  /(?:<\|im_start\|>\s{0,4}(?:system|developer|assistant)?|<\|im_end\|>|<\|endoftext\|>|\[INST\]|\[\/INST\]|<\/system>|<system_override>|<\|system\|>|<<SYS>>)/gi;

const INSTRUCTION_OVERRIDE_EN_GLOBAL_RE =
  /\b(?:ignore|disregard|forget|override)\s(?:all\s|any\s)?(?:previous|prior|above|system|preceding)\s(?:instructions|directives|rules|prompts|guardrails)\b/gi;

const INSTRUCTION_OVERRIDE_ES_GLOBAL_RE =
  /\b(?:ignora|olvida|omite|descarta|anula)\s(?:todas\s)?(?:las\s)?(?:instrucciones|directivas|reglas|restricciones)\s(?:anteriores|previas|del\ssistema|de\sseguridad|actuales)\b/gi;

const EXFIL_SINK_RE =
  /\b(?:curl|wget|exfiltrat\w*|webhook|ngrok|requestbin|collaborator)\b/i;

const EXFIL_SEND_URL_RE =
  /\b(?:send|post|upload|envia\w*|filtrar)\b[^\r\n]{0,80}https?:\/\//i;

const EXFIL_TARGET_RE =
  /(?:\.ssh\/|id_rsa|id_ed25519|process\.env|os\.environ|\b(?:AWS_SECRET|GITHUB_TOKEN|NPM_TOKEN|SSH_PRIVATE_KEY)\b|(?:cat|type|read)\s+[^\r\n]{0,30}\.env\b)/i;

const GATE_BYPASS_ACTION_RE =
  /\b(?:bypass\w*|skip\w*|circumvent\w*|salt[aá]\w*|evad\w*|desactiv\w*) (?:el |la |the |gate |guardia )?(?:QA-GIT-GATE-01|git push|npm publish|pre-push)\b/i;

const GATE_FORCE_FLAG_RE =
  /\b(?:git push|npm publish)\b[^\r\n]{0,60}(?:--no-verify|--force\b|\s-f(?=\s|$)|\bsaltando QA-GIT-GATE-01|\bbypassing QA-GIT-GATE-01)/i;

const GATE_IMPERATIVE_RE =
  /(?:^|[\s:;!])(?:run|execute|force|ejecuta|fuerza) (?:now |immediately )?(?:git push|npm publish)\b/i;

const DEFENSIVE_NEGATION_RE =
  /\b(?:never|do not|don't|prohibido|nunca|jam[aá]s|prior to|before)\b/i;

const JAILBREAK_PERSONA_RE =
  /\b(?:developer mode enabled|act as DAN|do anything now|modo sin restricciones)\b/i;

const BASE64_CANDIDATE_RE =
  /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{24,2048}={0,2}(?![A-Za-z0-9+/_=-])/g;

const ALLOWED_WHITESPACE_CTRL = new Set<number>([9, 10, 13]);

const PEM_PRIVATE_KEY_BLOCK_RE =
  /-----BEGIN[\x20A-Z0-9]{0,24}PRIVATE\x20KEY-----[\s\S]{0,8192}?-----END[\x20A-Z0-9]{0,24}PRIVATE\x20KEY-----/g;

const PEM_PRIVATE_KEY_HEADER_RE =
  /-----BEGIN[\x20A-Z0-9]{0,24}PRIVATE\x20KEY-----/g;

const BEARER_TOKEN_RE =
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,512}(?![A-Za-z0-9._~+/=-])/gi;

const JWT_TOKEN_RE =
  /\beyJ[A-Za-z0-9_-]{8,512}\.eyJ[A-Za-z0-9_-]{8,1024}\.[A-Za-z0-9_-]{8,512}(?![A-Za-z0-9_-])/g;

const AWS_ACCESS_KEY_RE = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;

const PROVIDER_TOKEN_RE =
  /\b(?:(?:ghp|gho|ghu|ghs|ghr|npm)_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|glpat-[A-Za-z0-9_-]{20,255})\b/g;

const SK_API_KEY_RE =
  /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,255}\b/g;

const EMAIL_RE =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}(?![A-Za-z0-9_-])/g;

const SSN_RE =
  /(?<![A-Za-z0-9_/-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![A-Za-z0-9_/-])/g;

const CARD_CANDIDATE_RE =
  /(?<![A-Za-z0-9_/-])\d[\d -]{11,21}\d(?![A-Za-z0-9_/-])/g;

const E164_PHONE_RE =
  /(?<![A-Za-z0-9+/=_-])\+[1-9]\d{7,14}(?![A-Za-z0-9_-])/g;

const PATH_LIKE_KEY_SNAKE_RE =
  /(?:^|_)(?:path|dir|directory|file|filename)$/i;

const PATH_LIKE_KEY_CAMEL_RE = /(?:Path|Dir|Directory|File|Filename)$/;

const SECRET_AND_PII_RULES: ReadonlyArray<RedactionRule> = [
  { pattern: PEM_PRIVATE_KEY_BLOCK_RE, replacement: REDACTED_SECRET },
  { pattern: PEM_PRIVATE_KEY_HEADER_RE, replacement: REDACTED_SECRET },
  { pattern: BEARER_TOKEN_RE, replacement: `Bearer ${REDACTED_SECRET}` },
  { pattern: JWT_TOKEN_RE, replacement: REDACTED_SECRET },
  { pattern: AWS_ACCESS_KEY_RE, replacement: REDACTED_SECRET },
  { pattern: PROVIDER_TOKEN_RE, replacement: REDACTED_SECRET },
  { pattern: SK_API_KEY_RE, replacement: REDACTED_SECRET },
  { pattern: EMAIL_RE, replacement: REDACTED_EMAIL },
  { pattern: SSN_RE, replacement: REDACTED_SSN },
];

const UNTRUSTED_OUTPUT_INJECTION_RULES: ReadonlyArray<RedactionRule> = [
  {
    pattern: ROLE_DELIMITER_SPOOFING_GLOBAL_RE,
    replacement: REDACTED_PROMPT_INJECTION,
  },
  {
    pattern: INSTRUCTION_OVERRIDE_EN_GLOBAL_RE,
    replacement: REDACTED_PROMPT_INJECTION,
  },
  {
    pattern: INSTRUCTION_OVERRIDE_ES_GLOBAL_RE,
    replacement: REDACTED_PROMPT_INJECTION,
  },
];

function isInvisibleCodePoint(codePoint: number): boolean {
  return INVISIBLE_CODEPOINT_RANGES.some(
    ([min, max]) => codePoint >= min && codePoint <= max
  );
}

function stripInvisibleChars(text: string): string {
  const kept: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isInvisibleCodePoint(cp)) {
      kept.push(ch);
    }
  }
  return kept.join('');
}

export function normalizeAndStripInvisible(input: string): string {
  return stripInvisibleChars(stripInvisibleChars(input).normalize('NFKC'));
}

function extractUnicodeTagAscii(raw: string): string {
  const decoded: string[] = [];
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xe0020 && cp <= 0xe007e) {
      decoded.push(String.fromCharCode(cp - 0xe0000));
    }
  }
  return decoded.join('');
}

function collapseHorizontalWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, ' ');
}

function collapseAllWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function isDisallowedControlChar(cp: number): boolean {
  return cp >= 0 && cp <= 31 && !ALLOWED_WHITESPACE_CTRL.has(cp);
}

function hasControlCharacters(text: string): boolean {
  for (const ch of text) {
    if (isDisallowedControlChar(ch.codePointAt(0) ?? 0)) {
      return true;
    }
  }
  return false;
}

function hasExfiltrationInSegment(segment: string): boolean {
  const normalized = collapseAllWhitespace(segment);
  const hasSink =
    EXFIL_SINK_RE.test(normalized) || EXFIL_SEND_URL_RE.test(normalized);
  return hasSink && EXFIL_TARGET_RE.test(normalized);
}

function hasIndirectExfiltration(text: string): boolean {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const pair = i + 1 < lines.length ? `${lines[i]} ${lines[i + 1]}` : lines[i];
    if (hasExfiltrationInSegment(pair)) {
      return true;
    }
  }
  return false;
}

function hasGateBypassInLine(line: string): boolean {
  const cleanLine = collapseHorizontalWhitespace(line);
  if (GATE_BYPASS_ACTION_RE.test(cleanLine) || GATE_FORCE_FLAG_RE.test(cleanLine)) {
    return true;
  }
  return GATE_IMPERATIVE_RE.test(cleanLine) && !DEFENSIVE_NEGATION_RE.test(cleanLine);
}

function hasGateBypassDirective(text: string): boolean {
  return text.split(/\r?\n/).some((line) => hasGateBypassInLine(line));
}

const DIRECT_INJECTION_RULES: ReadonlyArray<WeightedRule> = [
  {
    id: 'instruction_override_en',
    weight: 0.95,
    matches: (text) => INSTRUCTION_OVERRIDE_EN_RE.test(collapseAllWhitespace(text)),
  },
  {
    id: 'instruction_override_es',
    weight: 0.95,
    matches: (text) => INSTRUCTION_OVERRIDE_ES_RE.test(collapseAllWhitespace(text)),
  },
  {
    id: 'role_delimiter_spoofing',
    weight: 0.95,
    matches: (text) => ROLE_DELIMITER_SPOOFING_RE.test(text),
  },
  {
    id: 'indirect_secret_exfiltration',
    weight: 0.95,
    matches: hasIndirectExfiltration,
  },
  {
    id: 'gate_bypass_directive',
    weight: 0.9,
    matches: hasGateBypassDirective,
  },
];

const ALL_TEXT_RULES: ReadonlyArray<WeightedRule> = [
  ...DIRECT_INJECTION_RULES,
  {
    id: 'jailbreak_persona_hint',
    weight: 0.45,
    matches: (text) => JAILBREAK_PERSONA_RE.test(collapseAllWhitespace(text)),
  },
];

function decodeBase64Candidate(token: string): string | null {
  const standard = token.replace(/-/g, '+').replace(/_/g, '/');
  const paddedLength = Math.ceil(standard.length / 4) * 4;
  const padded = standard.padEnd(paddedLength, '=');
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  if (
    decoded.length < MIN_DECODED_BYTES ||
    decoded.includes('\ufffd') ||
    hasControlCharacters(decoded)
  ) {
    return null;
  }
  return normalizeAndStripInvisible(decoded);
}

function hasEncodedInjectionPayload(text: string): boolean {
  const candidates = text.match(BASE64_CANDIDATE_RE);
  if (!candidates) {
    return false;
  }
  const bounded = candidates.slice(0, MAX_BASE64_CANDIDATES);
  return bounded.some((candidate) => {
    const decoded = decodeBase64Candidate(candidate);
    if (!decoded) {
      return false;
    }
    return DIRECT_INJECTION_RULES.some((rule) => rule.matches(decoded));
  });
}

function isPromptGuardEnabled(options?: PromptGuardOptions): boolean {
  return options?.enabled ?? process.env.QA_PROMPT_GUARD_ENABLED !== 'false';
}

function clampScore(candidate: number): number {
  if (!Number.isFinite(candidate) || candidate < 0.1 || candidate > 1.0) {
    return DEFAULT_PROMPT_INJECTION_MIN_SCORE;
  }
  return candidate;
}

function resolveMinScore(options?: PromptGuardOptions): number {
  if (typeof options?.minScore === 'number') {
    return clampScore(options.minScore);
  }
  const envRaw = process.env.QA_PROMPT_INJECTION_MIN_SCORE;
  if (!envRaw) {
    return DEFAULT_PROMPT_INJECTION_MIN_SCORE;
  }
  return clampScore(Number(envRaw));
}

function isStrictPiiEnabled(options?: PromptGuardOptions): boolean {
  return options?.strictPii ?? process.env.QA_PROMPT_GUARD_STRICT_PII === 'true';
}

function collectRuleMatches(
  textToInspect: string,
  matchedSet: Set<string>,
  currentWeight: number
): number {
  let totalWeight = currentWeight;
  for (const rule of ALL_TEXT_RULES) {
    if (!matchedSet.has(rule.id) && rule.matches(textToInspect)) {
      matchedSet.add(rule.id);
      totalWeight += rule.weight;
    }
  }
  return totalWeight;
}

export function inspectPromptSafety(
  text: string,
  options?: PromptGuardOptions
): PromptSafetyReport {
  const normalizedText = normalizeAndStripInvisible(text);
  if (!isPromptGuardEnabled(options)) {
    return { safe: true, score: 0, matchedRules: [], normalizedText };
  }

  const matchedSet = new Set<string>();
  let totalWeight = collectRuleMatches(normalizedText, matchedSet, 0);

  const tagText = extractUnicodeTagAscii(text);
  if (tagText.length > 0) {
    totalWeight = collectRuleMatches(tagText, matchedSet, totalWeight);
  }

  if (hasEncodedInjectionPayload(normalizedText)) {
    matchedSet.add(RULE_ENCODED_EVASION);
    totalWeight += 0.95;
  }

  const score = Math.min(1, Number(totalWeight.toFixed(4)));
  const minScore = resolveMinScore(options);
  return {
    safe: score < minScore,
    score,
    matchedRules: [...matchedSet],
    normalizedText,
  };
}

function luhnStep(digit: number, doubleDigit: boolean): number {
  if (!doubleDigit) {
    return digit;
  }
  const doubled = digit * 2;
  return doubled > 9 ? doubled - 9 : doubled;
}

function isCandidateCardDigits(digits: string): boolean {
  return /^\d{13,19}$/.test(digits) && !/^(\d)\1+$/.test(digits);
}

export function isValidLuhn(digits: string): boolean {
  if (!isCandidateCardDigits(digits)) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const digit = Number(digits[i]);
    sum += luhnStep(digit, shouldDouble);
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function replaceCardIfValidLuhn(candidate: string): string {
  if (
    /[\s-]{2}/.test(candidate) ||
    (candidate.includes(' ') && candidate.includes('-'))
  ) {
    return candidate;
  }
  const digits = candidate.replace(/\D/g, '');
  return isValidLuhn(digits) ? REDACTED_CARD : candidate;
}

function applyRuleList(
  input: string,
  rules: ReadonlyArray<RedactionRule>
): string {
  let output = input;
  for (const rule of rules) {
    output = output.replace(rule.pattern, rule.replacement);
  }
  return output;
}

export function redactPiiAndSecrets(
  text: string,
  options?: PromptGuardOptions
): string {
  let output = applyRuleList(text, SECRET_AND_PII_RULES);
  output = output.replace(CARD_CANDIDATE_RE, replaceCardIfValidLuhn);
  if (isStrictPiiEnabled(options)) {
    output = output.replace(E164_PHONE_RE, REDACTED_PHONE);
  }
  return output;
}

function isPathLikeKey(key: string): boolean {
  return (
    PATH_LIKE_KEY_SNAKE_RE.test(key) || PATH_LIKE_KEY_CAMEL_RE.test(key)
  );
}

function markBlocked(
  state: GuardTraversalState,
  ruleId: string,
  weight: number
): void {
  state.blocked = true;
  state.score = Math.max(state.score, weight);
  state.matchedRules.add(ruleId);
}

function sanitizeStringNode(
  value: string,
  keyName: string,
  state: GuardTraversalState
): string {
  const report = inspectPromptSafety(value, state.options);
  if (!report.safe) {
    state.blocked = true;
    state.score = Math.max(state.score, report.score);
    for (const rule of report.matchedRules) {
      state.matchedRules.add(rule);
    }
    return report.normalizedText;
  }
  if (isPathLikeKey(keyName)) {
    return report.normalizedText;
  }
  return redactPiiAndSecrets(report.normalizedText, state.options);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeArrayNode(
  items: readonly unknown[],
  keyName: string,
  depth: number,
  state: GuardTraversalState
): unknown[] {
  return items.map((item) => sanitizeValue(item, keyName, depth + 1, state));
}

function sanitizeRecordNode(
  record: Record<string, unknown>,
  depth: number,
  state: GuardTraversalState
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (DANGEROUS_PROTOTYPE_KEYS.has(key)) {
      markBlocked(state, RULE_PROTOTYPE_POLLUTION, 1);
      continue;
    }
    const childValue = sanitizeValue(record[key], key, depth + 1, state);
    Object.defineProperty(sanitized, key, {
      value: childValue,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return sanitized;
}

function sanitizeValue(
  value: unknown,
  keyName: string,
  depth: number,
  state: GuardTraversalState
): unknown {
  if (depth > state.maxDepth) {
    markBlocked(state, RULE_MAX_DEPTH_EXCEEDED, 1);
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeStringNode(value, keyName, state);
  }
  if (Array.isArray(value)) {
    return sanitizeArrayNode(value, keyName, depth, state);
  }
  if (isPlainRecord(value)) {
    return sanitizeRecordNode(value, depth, state);
  }
  return value;
}

export function guardToolCallInput<T = Record<string, unknown> | undefined>(
  toolName: string,
  args: T,
  options?: PromptGuardOptions
): ToolCallGuardResult<T> {
  if (!isPromptGuardEnabled(options) || args === undefined || args === null) {
    return {
      toolName,
      blocked: false,
      score: 0,
      matchedRules: [],
      sanitizedArgs: args,
    };
  }

  const state: GuardTraversalState = {
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_RECURSION_DEPTH,
    options,
    blocked: false,
    score: 0,
    matchedRules: new Set<string>(),
  };

  const sanitizedArgs = sanitizeValue(args, '', 0, state) as T;
  return {
    toolName,
    blocked: state.blocked,
    score: state.score,
    matchedRules: [...state.matchedRules],
    sanitizedArgs,
  };
}

export function sanitizeUntrustedOutput(
  text: string,
  options?: PromptGuardOptions
): string {
  if (!isPromptGuardEnabled(options)) {
    return text;
  }
  const normalized = normalizeAndStripInvisible(text);
  const redacted = redactPiiAndSecrets(normalized, options);
  return applyRuleList(redacted, UNTRUSTED_OUTPUT_INJECTION_RULES);
}
