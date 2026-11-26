// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSymlinkSegments } from '../security/pathRealResolver.js';
import type { OutputLanguageMode } from '../types.js';

const UTF8 = 'utf-8';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';
export const BRIDGE_START_MARKER = '<!-- QA_11X_BRIDGE_START -->';
export const BRIDGE_END_MARKER = '<!-- QA_11X_BRIDGE_END -->';
export const AIDER_BRIDGE_START = '# QA_11X_BRIDGE_START';
export const AIDER_BRIDGE_END = '# QA_11X_BRIDGE_END';
export const GLOBAL_CONNECTOR_MAX_BYTES = 1_536;
export const PROJECT_CONNECTOR_MAX_BYTES = 1_536;

export const CANONICAL_GLOBAL_SKILL_DIRS: ReadonlySet<string> = new Set([
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

export interface GlobalConnectorTargetSpec {
  readonly agent: 'antigravity' | 'claude' | 'codex' | 'windsurf' | 'opencode' | 'zed';
  readonly detectRelDir: string;
  readonly relFile: string;
}

const PRIMARY_GEMINI_TARGET: GlobalConnectorTargetSpec = {
  agent: 'antigravity',
  detectRelDir: '.gemini',
  relFile: path.join('.gemini', 'GEMINI.md'),
};

export const GLOBAL_CONNECTOR_TARGETS: readonly GlobalConnectorTargetSpec[] = Object.freeze([
  PRIMARY_GEMINI_TARGET,
  {
    agent: 'claude',
    detectRelDir: '.claude',
    relFile: path.join('.claude', 'CLAUDE.md'),
  },
  {
    agent: 'codex',
    detectRelDir: '.codex',
    relFile: path.join('.codex', 'AGENTS.md'),
  },
  {
    agent: 'windsurf',
    detectRelDir: path.join('.codeium', 'windsurf'),
    relFile: path.join('.codeium', 'windsurf', 'memories', 'global_rules.md'),
  },
  {
    agent: 'opencode',
    detectRelDir: path.join('.config', 'opencode'),
    relFile: path.join('.config', 'opencode', 'AGENTS.md'),
  },
  {
    agent: 'zed',
    detectRelDir: path.join('.config', 'zed'),
    relFile: path.join('.config', 'zed', 'AGENTS.md'),
  },
]);

export interface ConnectorInspectionResult {
  readonly exists: boolean;
  readonly path: string;
  readonly has_markers: boolean;
  readonly block_count: number;
  readonly block_bytes: number;
  readonly exceeds_budget: boolean;
  readonly duplicated_blocks: boolean;
  readonly detected_lang: OutputLanguageMode | undefined;
}

export interface GlobalConnectorSyncEntry {
  readonly agent: GlobalConnectorTargetSpec['agent'];
  readonly path: string;
  readonly updated: boolean;
  readonly lang: OutputLanguageMode;
}

export type ConnectorLang = OutputLanguageMode;
export type ConnectorMergeAction = 'created' | 'appended' | 'updated_block';

export interface DelimitedSectionSpec {
  readonly startMarker: string;
  readonly endMarker: string;
  readonly block: string;
  readonly emptyDocument: string;
  readonly appendSeparator: string;
}

export interface AgentsMdMergeOptions {
  readonly lang?: OutputLanguageMode;
  readonly spdxLicense?: string;
  readonly projectDir?: string;
}

const SAFE_SPDX_PATTERN = /^[A-Za-z0-9.+_-]{2,64}$/;

const LICENSE_TEXT_SIGNATURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,120}Version 3/i, 'GPL-3.0-only'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,120}Version 2/i, 'GPL-2.0-only'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,120}Version 3/i, 'AGPL-3.0-only'],
  [/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,120}Version 3/i, 'LGPL-3.0-only'],
  [/Apache License[\s\S]{0,120}Version 2\.0/i, 'Apache-2.0'],
  [/Mozilla Public License Version 2\.0/i, 'MPL-2.0'],
  [/Permission is hereby granted, free of charge/i, 'MIT'],
  [/Permission to use, copy, modify, and\/or distribute/i, 'ISC'],
  [/Redistribution and use in source and binary forms[\s\S]{0,400}neither the name/i, 'BSD-3-Clause'],
  [/Redistribution and use in source and binary forms/i, 'BSD-2-Clause'],
];

function normalizeSpdxToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === 'UNLICENSED') {
    return null;
  }
  return SAFE_SPDX_PATTERN.test(trimmed) ? trimmed : null;
}

function readSpdxFromJsonFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, UTF8)) as { license?: unknown };
    return normalizeSpdxToken(parsed.license);
  } catch {
    return null;
  }
}

function extractPyprojectLicenseLine(trimmed: string): string | null {
  if (!trimmed.startsWith('license')) {
    return null;
  }
  const direct = /^license {0,8}= {0,8}"([^"\r\n]{1,64})"/.exec(trimmed);
  if (direct?.[1]) {
    return normalizeSpdxToken(direct[1]);
  }
  const table = /\btext {0,4}= {0,4}"([^"\r\n]{1,64})"/.exec(trimmed);
  return normalizeSpdxToken(table?.[1]);
}

function readSpdxFromPyproject(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  for (const line of fs.readFileSync(filePath, UTF8).split(/\r?\n/)) {
    const found = extractPyprojectLicenseLine(line.trim());
    if (found) {
      return found;
    }
  }
  return null;
}

function readSpdxFromLicenseFile(projectDir: string): string | null {
  if (!fs.existsSync(projectDir)) {
    return null;
  }
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const candidate = path.join(projectDir, name);
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const text = fs.readFileSync(candidate, UTF8).slice(0, 2048);
    const hit = LICENSE_TEXT_SIGNATURES.find(([re]) => re.test(text));
    if (hit) {
      return hit[1];
    }
  }
  return null;
}

export function detectProjectSpdxLicense(projectDir?: string): string {
  if (!projectDir) {
    return 'MIT';
  }
  const probes = [
    () => readSpdxFromJsonFile(path.join(projectDir, 'package.json')),
    () => readSpdxFromJsonFile(path.join(projectDir, 'composer.json')),
    () => readSpdxFromPyproject(path.join(projectDir, 'pyproject.toml')),
    () => readSpdxFromLicenseFile(projectDir),
  ];
  for (const probe of probes) {
    const found = probe();
    if (found) {
      return found;
    }
  }
  return 'MIT';
}

export function resolveProjectDisplayName(resolvedPath: string): string {
  return path.basename(resolvedPath) || 'Project';
}

function trimTrailingNewlines(input: string): string {
  let end = input.length;
  while (end > 0 && input[end - 1] === '\n') end--;
  return input.slice(0, end);
}

function trimLeadingNewlines(input: string): string {
  let start = 0;
  while (start < input.length && input[start] === '\n') start++;
  return input.slice(start);
}

function stripDuplicateDelimitedBlocks(
  tail: string,
  startMarker: string,
  endMarker: string
): string {
  let remaining = tail;
  let nextStart = remaining.indexOf(startMarker);
  while (nextStart !== -1) {
    const nextEnd = remaining.indexOf(endMarker, nextStart + startMarker.length);
    if (nextEnd === -1) break;
    const head = trimTrailingNewlines(remaining.slice(0, nextStart));
    const rest = trimLeadingNewlines(remaining.slice(nextEnd + endMarker.length));
    const sep = head && rest ? '\n\n' : '';
    const lead = !head && rest ? '\n\n' : '';
    remaining = `${head}${sep}${lead}${rest}`;
    nextStart = remaining.indexOf(startMarker);
  }
  return remaining || '\n';
}

function countMarkerOccurrences(content: string, marker: string): number {
  let count = 0;
  let pos = content.indexOf(marker);
  while (pos !== -1) {
    count++;
    pos = content.indexOf(marker, pos + marker.length);
  }
  return count;
}

export function replaceDelimitedSection(
  existingContent: string,
  spec: DelimitedSectionSpec
): { finalContent: string; action: ConnectorMergeAction } {
  const { startMarker, endMarker, block, emptyDocument, appendSeparator } = spec;
  if (!existingContent.trim()) {
    return { finalContent: emptyDocument, action: 'created' };
  }
  const startIdx = existingContent.indexOf(startMarker);
  const endIdx =
    startIdx !== -1
      ? existingContent.indexOf(endMarker, startIdx + startMarker.length)
      : existingContent.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const cleanedAfter = stripDuplicateDelimitedBlocks(
      existingContent.slice(endIdx + endMarker.length),
      startMarker,
      endMarker
    );
    return { finalContent: `${before}${block}${cleanedAfter}`, action: 'updated_block' };
  }
  const trimmed = existingContent.trimEnd();
  return { finalContent: `${trimmed}${appendSeparator}${block}\n`, action: 'appended' };
}

const BRIDGE_LANG_SUMMARIES: Readonly<Record<OutputLanguageMode, string>> = Object.freeze({
  auto: "Mirror the user's prompt language and README/CHANGELOG language; keep `.agents/` rules in concise English.",
  es: 'Respond and write user-facing docs/commits in Spanish (`es`); keep `.agents/` rules in concise English.',
  en: 'Respond and write user-facing docs/commits in English (`en`); keep `.agents/` rules in concise English.',
});

export function buildCanonicalMarkdownBridgeBlock(
  agentLabels: readonly string[],
  stacksLabel: string,
  lang: OutputLanguageMode
): string {
  const safeStacks = stacksLabel.trim() || 'general';
  return [
    BRIDGE_START_MARKER,
    `# QA 11X Thin-Repo Bridge (${agentLabels.join(', ')})`,
    `Follow \`AGENTS.md\` and \`.agents/\` directives (stacks: \`${safeStacks}\`, lang: \`${lang}\`).`,
    `Language: ${BRIDGE_LANG_SUMMARIES[lang]}`,
    'Rule Zero: execute tests in ephemeral Docker (`run_ephemeral_qa`), inspect AST first, never run auto `git push` (`QA-GIT-GATE-01`).',
    BRIDGE_END_MARKER,
  ].join('\n');
}

export function hasYamlReadKeyOutsideBridge(existingContent: string): boolean {
  const startIdx = existingContent.indexOf(AIDER_BRIDGE_START);
  const endIdx = existingContent.indexOf(AIDER_BRIDGE_END);
  const outside =
    startIdx !== -1 && endIdx > startIdx
      ? `${existingContent.slice(0, startIdx)}\n${existingContent.slice(endIdx + AIDER_BRIDGE_END.length)}`
      : existingContent;
  return outside.split(/\r?\n/).some((line) => line.trimStart().startsWith('read:'));
}

export function buildCanonicalAiderBridgeBlock(
  existingContent: string,
  lang: OutputLanguageMode
): string {
  const includeReadKey = !hasYamlReadKeyOutsideBridge(existingContent);
  return [
    AIDER_BRIDGE_START,
    `# QA 11X Thin-Repo Bridge (lang: ${lang}, QA-GIT-GATE-01: no auto git push)`,
    ...(includeReadKey
      ? ['read:', '  - AGENTS.md']
      : ['# Existing read: key detected — keep AGENTS.md referenced in read:']),
    AIDER_BRIDGE_END,
  ].join('\n');
}

export function detectConnectorLang(content: string): OutputLanguageMode | undefined {
  if (
    content.includes('Conector Global Thin-Client QA 11X') ||
    content.includes('strictly in **Spanish**') ||
    content.includes('estrictamente en **Español**') ||
    content.includes('in Spanish (`es`)') ||
    /\blang:\s*`?es`?\b/i.test(content)
  ) {
    return 'es';
  }
  if (
    content.includes('strictly in **English**') ||
    content.includes('in English (`en`)') ||
    /\blang:\s*`?en`?\b/i.test(content)
  ) {
    return 'en';
  }
  if (
    content.includes("user's prompt language") ||
    /\blang:\s*`?auto`?\b/i.test(content) ||
    content.includes(CONNECTOR_START_MARKER) ||
    content.includes(BRIDGE_START_MARKER) ||
    content.includes(AIDER_BRIDGE_START)
  ) {
    return 'auto';
  }
  return undefined;
}

export function detectExistingStacks(content: string): string[] {
  const match = /\(stacks:\s*`([^`\r\n]+)`/.exec(content);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== 'general');
}

function getConnectorMarkerIndexes(content: string): {
  startCount: number;
  endCount: number;
  startIdx: number;
  endIdx: number;
} {
  const startIdx = content.indexOf(CONNECTOR_START_MARKER);
  return {
    startCount: countMarkerOccurrences(content, CONNECTOR_START_MARKER),
    endCount: countMarkerOccurrences(content, CONNECTOR_END_MARKER),
    startIdx,
    endIdx: startIdx !== -1 ? content.indexOf(CONNECTOR_END_MARKER, startIdx) : -1,
  };
}

export function inspectDelimitedConnector(
  filePath: string,
  maxBytes: number
): ConnectorInspectionResult {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      has_markers: false,
      block_count: 0,
      block_bytes: 0,
      exceeds_budget: false,
      duplicated_blocks: false,
      detected_lang: undefined,
    };
  }
  const content = fs.readFileSync(filePath, UTF8);
  const { startCount, endCount, startIdx, endIdx } = getConnectorMarkerIndexes(content);
  const hasBlock = startIdx !== -1 && endIdx > startIdx;
  const blockBytes = hasBlock
    ? Buffer.byteLength(content.slice(startIdx, endIdx + CONNECTOR_END_MARKER.length), UTF8)
    : 0;
  const blockCount = Math.max(startCount, endCount);
  return {
    exists: true,
    path: filePath,
    has_markers: blockCount > 0,
    block_count: blockCount,
    block_bytes: blockBytes,
    exceeds_budget: blockBytes > maxBytes,
    duplicated_blocks: startCount > 1 || endCount > 1,
    detected_lang: detectConnectorLang(content),
  };
}

export function buildLanguagePolicyLine(lang: OutputLanguageMode): string {
  switch (lang) {
    case 'es':
      return 'Interact, explain reasoning, and write commits/docs strictly in **Spanish** (keep AGENTS.md & .agents/** concise English).';
    case 'en':
      return 'Interact, explain reasoning, and write commits/docs strictly in **English**.';
    case 'auto':
    default:
      return "Interact in user's prompt language; commits & human docs match README.md/CHANGELOG.md (keep AGENTS.md & .agents/** concise English).";
  }
}

export function buildThinConnectorBlock(
  projectName: string,
  stacks: string[],
  lang: OutputLanguageMode = 'auto'
): string {
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  return [
    CONNECTOR_START_MARKER,
    '## 🤖 QA 11X Thin-Repo Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    `Project \`${projectName}\` enforces **Standard QA-11X** (stacks: \`${stacksLabel}\`). Do NOT duplicate global skills/rules into local \`.agents/skills/\` or \`.agents/rules/\`.`,
    '',
    `- **Language Policy:** ${buildLanguagePolicyLine(lang)}`,
    '- **Tier & Routing (`qa-11x-architect` + MCP `qa-11x`):** Open mutating tasks with `[QA-11X | Tier: <tier> | Path: <DOCS_ONLY|MICRO_CHANGE|FULL_11X>]` (`.qa-11x.json` v3; default `standard`; ask once if `!tierConfirmedByUser`). Classify: `DOCS_ONLY` (`0` Docker/AST), `MICRO_CHANGE` (`<=3` files, `<5` callers), `FULL_11X` (`/plan` + `session_flight_recorder` + 11-step flow).',
    '- **Hard Gates:** (1) **Rule Zero** — run tests/linters/migrations in non-root ephemeral Docker (`run_ephemeral_qa`/`make`, serialized 1 container at a time; zero parallel subagent `docker run`; `--rm --restart=no --network none` offline); (2) **AST-First & Objective Critique** — query `inspect_ast_blast_radius` before edits, skip praise, verify non-trivial premises (never debate routine cmds); (3) **`QA-TEST-SYNC-01`** — co-evolve affected unit (`>=95%`), integration, BATS & Karate suites; (4) **`QA-GIT-GATE-01`** — run `certify_11x_gate`, stop at local `git commit` (NEVER auto-`git push`).',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export const buildConnectorBlock = buildThinConnectorBlock;

export function buildGlobalConnectorBlock(lang: OutputLanguageMode = 'auto'): string {
  if (lang === 'es') {
    return [
      CONNECTOR_START_MARKER,
      '## 🤖 Conector Global Thin-Client QA 11X (`@sinfallas/mcp-qa-11x`)',
      '',
      '- **Idioma, Tier y Economía Cognitiva:** Responder/documentar/comitear en **Español** (`AGENTS.md`/`.agents/**` inglés). Mostrar `[QA-11X | Tier: <tier> | Path: <ruta>]` (`.qa-11x.json` v3, default `standard`; preguntar 1 vez si `!tierConfirmedByUser`). Usar 3-Layer Disclosure, lecturas `40–80L`, lotes paralelos y resúmenes `<=20L`.',
      '- **Crítica Técnica Objetiva (Sin Adulación):** Omitir elogios; verificar propuestas no triviales vs AST/archivos/budgets; señalar fallos o alternativas simples, o aprobar directo; no debatir órdenes rutinarias.',
      '- **Rule Zero Supremo y Graphify AST-First:** Ejecutar tests/linters/migraciones/installs en Docker efímero sin root (`run_ephemeral_qa`/`make`, en serie 1 contenedor a la vez; sin `docker run` paralelo en subagentes; `--rm --restart=no --network none` offline). Consultar `inspect_ast_blast_radius` ANTES de `grep`/`read_file`.',
      '- **Skills Globales, `QA-TEST-SYNC-01` y `QA-GIT-GATE-01`:** Enrutar vía `qa-11x-architect` sin duplicación local (`reconcile_agents_governance`); co-evolucionar tests (`QA-TEST-SYNC-01`), cerrar en `git commit` local (NUNCA auto-`git push`) y reportar brechas (`propose_skill_evolution_pr`).',
      CONNECTOR_END_MARKER,
    ].join('\n');
  }

  const langDirective =
    lang === 'en'
      ? 'Interact, write commits & docs strictly in **English**.'
      : "Interact in user's prompt language; commits/human docs match README.md/CHANGELOG.md (AGENTS.md/.agents/** EN).";

  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Global Thin-Client QA 11X Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    `- **Language, Tier & Token Economy:** ${langDirective} Show \`[QA-11X | Tier: <tier> | Path: <path>]\` (\`.qa-11x.json\` v3, default \`standard\`; ask once if \`!tierConfirmedByUser\`). Use 3-Layer Disclosure, \`40–80L\` reads, parallel batching & \`<=20L\` summaries.`,
    '- **Objective Technical Critique (No Sycophancy):** Skip praise openers. Verify non-trivial proposals vs AST/files/budgets; cite flaws/duplication/simpler options (incl. doing nothing), or approve directly; never debate routine commands.',
    '- **Rule Zero Supreme & Graphify AST-First:** Run ALL tests/linters/migrations/installs in non-root ephemeral Docker (`run_ephemeral_qa`/`make`, serialized 1 container at a time; zero parallel subagent `docker run`; `--rm --restart=no --network none` offline). Query `inspect_ast_blast_radius` (`graphify-out/graph.json`) BEFORE `grep`/`read_file`.',
    '- **Global Skills, `QA-TEST-SYNC-01` & `QA-GIT-GATE-01`:** Route via `qa-11x-architect` without local duplication (`reconcile_agents_governance`); co-evolve tests (`QA-TEST-SYNC-01`), stop at local `git commit` (NEVER auto-`git push`) & log gaps (`propose_skill_evolution_pr`).',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export const buildGlobalGeminiBlock = buildGlobalConnectorBlock;

const MERGE_CHANGE_MESSAGES: Readonly<Record<ConnectorMergeAction, string>> = Object.freeze({
  created: 'Creado archivo AGENTS.md con el conector del ecosistema QA 11X (MCP + Skill).',
  updated_block: 'Actualizado bloque conector QA 11X en AGENTS.md preservando el contenido existente.',
  appended: 'Agregado bloque conector QA 11X al archivo AGENTS.md existente sin reemplazar su contenido.',
});

function resolveAgentsMdMergeParams(
  langOrOptions: OutputLanguageMode | AgentsMdMergeOptions
): { lang: OutputLanguageMode; spdxLicense: string } {
  if (typeof langOrOptions === 'string') {
    return { lang: langOrOptions, spdxLicense: 'MIT' };
  }
  const explicit = normalizeSpdxToken(langOrOptions.spdxLicense);
  return {
    lang: langOrOptions.lang ?? 'auto',
    spdxLicense: explicit ?? detectProjectSpdxLicense(langOrOptions.projectDir),
  };
}

export function mergeOrAppendAgentsMdContent(
  existingContent: string,
  projectName: string,
  stacks: string[],
  langOrOptions: OutputLanguageMode | AgentsMdMergeOptions = 'auto'
): { finalContent: string; action: ConnectorMergeAction; changes: string[] } {
  const { lang, spdxLicense } = resolveAgentsMdMergeParams(langOrOptions);
  const block = buildThinConnectorBlock(projectName, stacks, lang);
  const header = `# SPDX-License-Identifier: ${spdxLicense}\n<!-- QA-11X Standard Governance -->\n\n# 🤖 AI Agent Directives & Technical Governance — ${projectName}\n\n`;
  const result = replaceDelimitedSection(existingContent, {
    startMarker: CONNECTOR_START_MARKER,
    endMarker: CONNECTOR_END_MARKER,
    block,
    emptyDocument: `${header}${block}\n`,
    appendSeparator: '\n\n---\n\n',
  });
  return {
    finalContent: result.finalContent,
    action: result.action,
    changes: [MERGE_CHANGE_MESSAGES[result.action]],
  };
}

export function mergeGlobalGeminiContent(
  existingContent: string,
  lang: OutputLanguageMode = 'auto'
): string {
  const block = buildGlobalGeminiBlock(lang);
  const header =
    '# SPDX-License-Identifier: MIT\n<!-- QA-11X Standard Governance -->\n\n# 🤖 Global AI Agent Directives — QA 11X Standard (`@sinfallas/mcp-qa-11x`)\n\n';
  return replaceDelimitedSection(existingContent, {
    startMarker: CONNECTOR_START_MARKER,
    endMarker: CONNECTOR_END_MARKER,
    block,
    emptyDocument: `${header}${block}\n`,
    appendSeparator: '\n\n---\n\n',
  }).finalContent;
}

export const buildAgentsMdConnectorBlock = buildThinConnectorBlock;
export const mergeAgentsMdContent = mergeOrAppendAgentsMdContent;

function readExistingConnectorContent(
  fullPath: string,
  onlyExistingMarked: boolean
): string | null {
  const exists = fs.existsSync(fullPath);
  if (onlyExistingMarked && !exists) return null;
  const existing = exists ? fs.readFileSync(fullPath, UTF8) : '';
  if (onlyExistingMarked && !existing.includes(CONNECTOR_START_MARKER)) return null;
  return existing;
}

function syncSingleGlobalConnectorTarget(
  homeDir: string,
  target: GlobalConnectorTargetSpec,
  options: { readonly dryRun: boolean; readonly explicitLang?: OutputLanguageMode; readonly onlyExistingMarked: boolean }
): GlobalConnectorSyncEntry {
  const fullPath = path.join(homeDir, target.relFile);
  if (!fs.existsSync(path.join(homeDir, target.detectRelDir))) {
    return { agent: target.agent, path: fullPath, updated: false, lang: options.explicitLang ?? 'auto' };
  }
  assertNoSymlinkSegments(homeDir, target.relFile);
  const existing = readExistingConnectorContent(fullPath, options.onlyExistingMarked);
  if (existing === null) {
    return { agent: target.agent, path: fullPath, updated: false, lang: options.explicitLang ?? 'auto' };
  }
  const effectiveLang = options.explicitLang ?? detectConnectorLang(existing) ?? 'auto';
  const finalContent = mergeGlobalGeminiContent(existing, effectiveLang);
  const updated = finalContent !== existing;
  if (!options.dryRun && updated) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, finalContent, UTF8);
  }
  return { agent: target.agent, path: fullPath, updated, lang: effectiveLang };
}

function selectConnectorTargetsForArg(targetArg?: string): readonly GlobalConnectorTargetSpec[] {
  if (!targetArg || targetArg === 'auto' || targetArg === 'all') {
    return GLOBAL_CONNECTOR_TARGETS;
  }
  const normalized = targetArg === 'gemini-cli' ? 'antigravity' : targetArg;
  return GLOBAL_CONNECTOR_TARGETS.filter((target) => target.agent === normalized);
}

export function syncGlobalAgentConnectors(
  homeDir: string,
  dryRun = false,
  explicitLang?: OutputLanguageMode,
  targetArg?: string
): GlobalConnectorSyncEntry[] {
  return selectConnectorTargetsForArg(targetArg).map((target) =>
    syncSingleGlobalConnectorTarget(homeDir, target, {
      dryRun,
      explicitLang,
      onlyExistingMarked: false,
    })
  );
}

export function syncExistingGlobalConnectors(homeDir: string): GlobalConnectorSyncEntry[] {
  return GLOBAL_CONNECTOR_TARGETS.map((target) =>
    syncSingleGlobalConnectorTarget(homeDir, target, {
      dryRun: false,
      onlyExistingMarked: true,
    })
  );
}

export function syncGlobalGeminiMd(
  homeDir: string,
  dryRun = false,
  lang?: OutputLanguageMode
): { updated: boolean; geminiMdPath: string } {
  const res = syncSingleGlobalConnectorTarget(homeDir, PRIMARY_GEMINI_TARGET, {
    dryRun,
    explicitLang: lang,
    onlyExistingMarked: false,
  });
  return { updated: res.updated, geminiMdPath: res.path };
}
