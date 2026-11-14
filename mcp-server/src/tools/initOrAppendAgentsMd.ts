// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectProjectConfig } from './inspect-project.js';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';
export const BRIDGE_START_MARKER = '<!-- QA_11X_BRIDGE_START -->';
export const BRIDGE_END_MARKER = '<!-- QA_11X_BRIDGE_END -->';
export const AIDER_BRIDGE_START = '# QA_11X_BRIDGE_START';
export const AIDER_BRIDGE_END = '# QA_11X_BRIDGE_END';

const UTF8 = 'utf-8';
const AGENTS_MD_FILENAME = 'AGENTS.md';

const CAT_IDE = 'ide' as const;
const CAT_CLI = 'cli' as const;
const CAT_DESKTOP = 'desktop' as const;
const CAT_AUTONOMOUS = 'autonomous' as const;
const CAT_VIBE = 'vibe-coding' as const;

const FMT_AGENTS_MD = 'agents-md' as const;
const FMT_MARKDOWN = 'markdown' as const;
const FMT_MDC = 'mdc' as const;
const FMT_AIDER = 'aider-yaml' as const;

const ACTION_CREATED = 'created' as const;
const ACTION_APPENDED = 'appended' as const;
const ACTION_UPDATED_BLOCK = 'updated_block' as const;
const ACTION_DRY_RUN = 'dry_run' as const;

export type SupportedLang = 'es' | 'en';
export type AgentCategory =
  | typeof CAT_IDE
  | typeof CAT_CLI
  | typeof CAT_DESKTOP
  | typeof CAT_AUTONOMOUS
  | typeof CAT_VIBE;
export type BridgeFormat =
  | typeof FMT_AGENTS_MD
  | typeof FMT_MARKDOWN
  | typeof FMT_MDC
  | typeof FMT_AIDER;
export type MergeAction =
  | typeof ACTION_CREATED
  | typeof ACTION_APPENDED
  | typeof ACTION_UPDATED_BLOCK;
export type ToolRunAction = MergeAction | typeof ACTION_DRY_RUN;

export type SupportedAiAgentId =
  | 'antigravity'
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'windsurf'
  | 'copilot'
  | 'codex'
  | 'gemini-cli'
  | 'gemini-code-assist'
  | 'cline'
  | 'roo-code'
  | 'aider'
  | 'continue'
  | 'zed'
  | 'devin'
  | 'cody'
  | 'amazon-q'
  | 'jetbrains-ai'
  | 'augment'
  | 'trae'
  | 'hermes'
  | 'opencode'
  | 'goose'
  | 'kilo-code'
  | 'bolt'
  | 'lovable'
  | 'v0'
  | 'replit';

export interface AiAgentDescriptor {
  readonly id: SupportedAiAgentId;
  readonly displayName: string;
  readonly category: AgentCategory;
  readonly bridgeFile: string;
  readonly format: BridgeFormat;
  readonly detectPaths: readonly string[];
}

export type AgentsTargetSpec = readonly string[] | 'auto' | 'all';

export interface BridgeFileResult {
  agent_ids: SupportedAiAgentId[];
  file_path: string;
  relative_path: string;
  format: BridgeFormat;
  action: ToolRunAction;
  content: string;
}

export interface InitOrAppendAgentsMdOptions {
  projectPath?: string;
  project_path?: string;
  lang?: string;
  agents?: AgentsTargetSpec;
  dryRun?: boolean;
  dry_run?: boolean;
}

export interface InitOrAppendAgentsMdResult {
  project_path: string;
  agents_md_path: string;
  lang: SupportedLang;
  action: ToolRunAction;
  detected_stacks: string[];
  content: string;
  bridged_agents: SupportedAiAgentId[];
  bridge_files: BridgeFileResult[];
}

function freezeAgent(descriptor: AiAgentDescriptor): AiAgentDescriptor {
  return Object.freeze({
    ...descriptor,
    detectPaths: Object.freeze([...descriptor.detectPaths]),
  });
}

export const SUPPORTED_AI_AGENTS: Readonly<Record<SupportedAiAgentId, AiAgentDescriptor>> =
  Object.freeze({
    antigravity: freezeAgent({
      id: 'antigravity',
      displayName: 'Google Antigravity IDE',
      category: CAT_IDE,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['.gemini', '.idx'],
    }),
    'claude-code': freezeAgent({
      id: 'claude-code',
      displayName: 'Claude Code CLI',
      category: CAT_CLI,
      bridgeFile: 'CLAUDE.md',
      format: FMT_MARKDOWN,
      detectPaths: ['CLAUDE.md', '.claude'],
    }),
    'claude-desktop': freezeAgent({
      id: 'claude-desktop',
      displayName: 'Claude Desktop',
      category: CAT_DESKTOP,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['.mcp.json'],
    }),
    cursor: freezeAgent({
      id: 'cursor',
      displayName: 'Cursor IDE',
      category: CAT_IDE,
      bridgeFile: '.cursor/rules/qa-11x.mdc',
      format: FMT_MDC,
      detectPaths: ['.cursor', '.cursorrules'],
    }),
    windsurf: freezeAgent({
      id: 'windsurf',
      displayName: 'Windsurf (Codeium)',
      category: CAT_IDE,
      bridgeFile: '.windsurfrules',
      format: FMT_MARKDOWN,
      detectPaths: ['.windsurfrules', '.windsurf', '.codeium'],
    }),
    copilot: freezeAgent({
      id: 'copilot',
      displayName: 'GitHub Copilot (VS Code)',
      category: CAT_IDE,
      bridgeFile: '.github/copilot-instructions.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.github', '.vscode'],
    }),
    codex: freezeAgent({
      id: 'codex',
      displayName: 'OpenAI Codex CLI',
      category: CAT_CLI,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['.codex'],
    }),
    'gemini-cli': freezeAgent({
      id: 'gemini-cli',
      displayName: 'Google Gemini CLI',
      category: CAT_CLI,
      bridgeFile: 'GEMINI.md',
      format: FMT_MARKDOWN,
      detectPaths: ['GEMINI.md', '.gemini'],
    }),
    'gemini-code-assist': freezeAgent({
      id: 'gemini-code-assist',
      displayName: 'Gemini Code Assist',
      category: CAT_IDE,
      bridgeFile: '.gemini/styleguide.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.gemini'],
    }),
    cline: freezeAgent({
      id: 'cline',
      displayName: 'Cline (VS Code)',
      category: CAT_IDE,
      bridgeFile: '.clinerules',
      format: FMT_MARKDOWN,
      detectPaths: ['.clinerules', '.cline'],
    }),
    'roo-code': freezeAgent({
      id: 'roo-code',
      displayName: 'Roo Code',
      category: CAT_IDE,
      bridgeFile: '.roo/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.roo', '.roorules'],
    }),
    aider: freezeAgent({
      id: 'aider',
      displayName: 'Aider CLI',
      category: CAT_CLI,
      bridgeFile: '.aider.conf.yml',
      format: FMT_AIDER,
      detectPaths: ['.aider.conf.yml', '.aiderignore'],
    }),
    continue: freezeAgent({
      id: 'continue',
      displayName: 'Continue.dev',
      category: CAT_IDE,
      bridgeFile: '.continue/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.continue', '.continuerules'],
    }),
    zed: freezeAgent({
      id: 'zed',
      displayName: 'Zed Editor AI',
      category: CAT_IDE,
      bridgeFile: '.rules',
      format: FMT_MARKDOWN,
      detectPaths: ['.zed', '.rules'],
    }),
    devin: freezeAgent({
      id: 'devin',
      displayName: 'Devin Autonomous Agent',
      category: CAT_AUTONOMOUS,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['.devin'],
    }),
    cody: freezeAgent({
      id: 'cody',
      displayName: 'Sourcegraph Cody',
      category: CAT_IDE,
      bridgeFile: '.sourcegraph/qa-11x.rule.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.sourcegraph'],
    }),
    'amazon-q': freezeAgent({
      id: 'amazon-q',
      displayName: 'Amazon Q Developer',
      category: CAT_IDE,
      bridgeFile: '.amazonq/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.amazonq'],
    }),
    'jetbrains-ai': freezeAgent({
      id: 'jetbrains-ai',
      displayName: 'JetBrains AI / Junie',
      category: CAT_IDE,
      bridgeFile: '.junie/guidelines.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.junie', '.idea'],
    }),
    augment: freezeAgent({
      id: 'augment',
      displayName: 'Augment Code',
      category: CAT_IDE,
      bridgeFile: '.augment/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.augment'],
    }),
    trae: freezeAgent({
      id: 'trae',
      displayName: 'Trae IDE',
      category: CAT_IDE,
      bridgeFile: '.trae/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.trae'],
    }),
    hermes: freezeAgent({
      id: 'hermes',
      displayName: 'Hermes Agent',
      category: CAT_AUTONOMOUS,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['.hermes'],
    }),
    opencode: freezeAgent({
      id: 'opencode',
      displayName: 'OpenCode CLI',
      category: CAT_CLI,
      bridgeFile: AGENTS_MD_FILENAME,
      format: FMT_AGENTS_MD,
      detectPaths: ['opencode.json', '.opencode'],
    }),
    goose: freezeAgent({
      id: 'goose',
      displayName: 'Block Goose',
      category: CAT_CLI,
      bridgeFile: '.goosehints',
      format: FMT_MARKDOWN,
      detectPaths: ['.goosehints', '.goose'],
    }),
    'kilo-code': freezeAgent({
      id: 'kilo-code',
      displayName: 'Kilo Code',
      category: CAT_IDE,
      bridgeFile: '.kilocode/rules/qa-11x.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.kilocode'],
    }),
    bolt: freezeAgent({
      id: 'bolt',
      displayName: 'Bolt.new',
      category: CAT_VIBE,
      bridgeFile: '.bolt/prompt',
      format: FMT_MARKDOWN,
      detectPaths: ['.bolt'],
    }),
    lovable: freezeAgent({
      id: 'lovable',
      displayName: 'Lovable.dev',
      category: CAT_VIBE,
      bridgeFile: '.lovable/rules.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.lovable'],
    }),
    v0: freezeAgent({
      id: 'v0',
      displayName: 'Vercel v0',
      category: CAT_VIBE,
      bridgeFile: '.v0/rules.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.v0'],
    }),
    replit: freezeAgent({
      id: 'replit',
      displayName: 'Replit Agent',
      category: CAT_VIBE,
      bridgeFile: 'replit.md',
      format: FMT_MARKDOWN,
      detectPaths: ['.replit', 'replit.nix', 'replit.md'],
    }),
  });

export const SUPPORTED_AGENT_IDS: readonly SupportedAiAgentId[] = Object.freeze(
  Object.keys(SUPPORTED_AI_AGENTS) as SupportedAiAgentId[]
);

const LANGUAGE_CONSTRAINTS: Readonly<Record<SupportedLang, string>> = Object.freeze({
  es: 'Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish (español), while keeping internal `.agents/` directives in concise technical English for token economy.',
  en: 'Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in English, while keeping internal `.agents/` directives in high-density technical English for token economy.',
});

const BRIDGE_LANG_SUMMARIES: Readonly<Record<SupportedLang, string>> = Object.freeze({
  es: 'Respond and write user-facing docs/commits in Spanish (`es`); keep `.agents/` rules in concise English.',
  en: 'Respond and write user-facing docs/commits in English (`en`); keep `.agents/` rules in concise English.',
});

const CURSOR_MDC_HEADER = [
  '---',
  'description: QA 11X Standard Thin-Repo Bridge pointing to AGENTS.md',
  'globs: "**/*"',
  'alwaysApply: true',
  '---',
].join('\n');

export function validateSupportedLang(rawLang?: string): SupportedLang {
  if (rawLang === undefined) {
    return 'es';
  }
  const normalized = rawLang.normalize('NFKC').trim().toLowerCase();
  if (normalized === 'es' || normalized === 'en') {
    return normalized;
  }
  throw new Error(`Unsupported language '${rawLang}'. Allowed values for lang: 'es' | 'en'.`);
}

export function buildAgentsMdConnectorBlock(
  projectName: string,
  stacks: string[],
  lang: SupportedLang = 'es'
): string {
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Central QA 11X Skill & MCP Server Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    `> **OUTPUT LANGUAGE CONSTRAINT:** ${LANGUAGE_CONSTRAINTS[lang]}`,
    '',
    `This project (\`${projectName}\`) enforces the **Level-11X Quality & DevSecOps Standard** (stacks: \`${stacksLabel}\`).`,
    '',
    '1. **High-IQ Token Economy & AST-First:** Query `inspect_ast_blast_radius` / `.agents/scripts/inspect_blast_radius.py` and `graphify-out/GRAPH_REPORT.md` BEFORE `grep` or windowed `read_file` (40–80 lines); never read files `>150` lines blindly.',
    '2. **Rule Zero & Test Co-Evolution (`QA-TEST-SYNC-01`):** Execute all tests, linters, and migrations inside ephemeral Docker containers (`run_ephemeral_qa`), updating affected unit, integration, BATS, and Karate BDD suites alongside code edits (`>= 95%` coverage).',
    '3. **3-Path Execution & Governance Closure (`QA-GIT-GATE-01`):** Follow `DOCS_ONLY`, `MICRO_CHANGE`, or `FULL_11X`, track progress in `.agents/ACTIVE_TASK.md` (`<= 40` lines), certify via `certify_11x_gate`, and conclude with a local `git commit` (NEVER execute `git push` or `npm publish` without explicit human authorization).',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

function replaceDelimitedSection(
  existingContent: string,
  startMarker: string,
  endMarker: string,
  block: string,
  emptyDocument: string,
  appendSeparator: string
): { finalContent: string; action: MergeAction } {
  if (!existingContent.trim()) {
    return { finalContent: emptyDocument, action: ACTION_CREATED };
  }
  const startIdx = existingContent.indexOf(startMarker);
  const endIdx = existingContent.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + endMarker.length);
    return { finalContent: `${before}${block}${after}`, action: ACTION_UPDATED_BLOCK };
  }
  const trimmed = existingContent.trimEnd();
  return { finalContent: `${trimmed}${appendSeparator}${block}\n`, action: ACTION_APPENDED };
}

export function mergeAgentsMdContent(
  existingContent: string,
  projectName: string,
  stacks: string[],
  lang: SupportedLang = 'es'
): { finalContent: string; action: MergeAction } {
  const block = buildAgentsMdConnectorBlock(projectName, stacks, lang);
  const header = `# SPDX-License-Identifier: MIT\n\n# 🤖 AI Agent Directives & Technical Governance — ${projectName}\n\n`;
  return replaceDelimitedSection(
    existingContent,
    CONNECTOR_START_MARKER,
    CONNECTOR_END_MARKER,
    block,
    `${header}${block}\n`,
    '\n\n---\n\n'
  );
}

function hasUnsafeAgentIdChars(id: string): boolean {
  return (
    id.length === 0 ||
    id.includes('\0') ||
    id.includes('..') ||
    id.includes('/') ||
    id.includes('\\')
  );
}

export function validateAgentId(rawAgentId: string): SupportedAiAgentId {
  const normalized = rawAgentId.normalize('NFKC').trim().toLowerCase();
  if (hasUnsafeAgentIdChars(normalized)) {
    throw new Error(`Path traversal or invalid characters detected in agent identifier '${rawAgentId}'.`);
  }
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_AI_AGENTS, normalized)) {
    throw new Error(
      `Unknown AI agent '${rawAgentId}'. Supported agents (${SUPPORTED_AGENT_IDS.length}): ${SUPPORTED_AGENT_IDS.join(', ')}.`
    );
  }
  return normalized as SupportedAiAgentId;
}

export function parseAgentsOption(rawAgents: string): AgentsTargetSpec {
  const normalized = rawAgents.normalize('NFKC').trim();
  if (!normalized) {
    throw new Error("Invalid --agents value: expected 'auto', 'all', or comma-separated agent IDs.");
  }
  const lowered = normalized.toLowerCase();
  if (lowered === 'auto' || lowered === 'all') {
    return lowered;
  }
  const parts = normalized.split(',').map((item) => item.trim());
  if (parts.some((item) => item.length === 0)) {
    throw new Error(`Invalid --agents list '${rawAgents}': empty agent identifier detected.`);
  }
  const validated = new Set<SupportedAiAgentId>();
  for (const part of parts) {
    validated.add(validateAgentId(part));
  }
  return Array.from(validated);
}

function findNearestExistingAncestor(targetPath: string): string {
  let cursor = targetPath;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  return cursor;
}

function hasTraversalSegments(normalizedRel: string): boolean {
  if (!normalizedRel || normalizedRel.includes('\0') || path.isAbsolute(normalizedRel)) {
    return true;
  }
  const parts = normalizedRel.split(/[/\\]+/);
  return parts.some((segment) => segment === '..');
}

export function resolveSafeBridgePath(projectRoot: string, relBridgePath: string): string {
  const normalizedRel = relBridgePath.normalize('NFKC').trim();
  if (hasTraversalSegments(normalizedRel)) {
    throw new Error(`Path traversal detected in bridge path '${relBridgePath}'.`);
  }

  const rootResolved = path.resolve(projectRoot);
  const candidate = path.resolve(rootResolved, normalizedRel);
  const rootPrefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
  if (candidate !== rootResolved && !candidate.startsWith(rootPrefix)) {
    throw new Error(`Path traversal outside project root detected for '${relBridgePath}'.`);
  }

  const realRoot = fs.existsSync(rootResolved) ? fs.realpathSync(rootResolved) : rootResolved;
  const realRootPrefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
  const ancestor = findNearestExistingAncestor(candidate);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== realRoot && !realAncestor.startsWith(realRootPrefix)) {
    throw new Error(`Symlink path traversal outside project root detected for '${relBridgePath}'.`);
  }

  return candidate;
}

export function detectProjectAgents(projectRoot: string): SupportedAiAgentId[] {
  const detected: SupportedAiAgentId[] = [];
  for (const agentId of SUPPORTED_AGENT_IDS) {
    const descriptor = SUPPORTED_AI_AGENTS[agentId];
    const matched = descriptor.detectPaths.some((rel) =>
      fs.existsSync(resolveSafeBridgePath(projectRoot, rel))
    );
    if (matched) {
      detected.push(agentId);
    }
  }
  return detected;
}

export function resolveTargetAgentIds(
  projectRoot: string,
  agentsSpec: AgentsTargetSpec | undefined
): SupportedAiAgentId[] {
  if (agentsSpec === undefined) {
    return [];
  }
  if (agentsSpec === 'all') {
    return [...SUPPORTED_AGENT_IDS];
  }
  if (agentsSpec === 'auto') {
    return detectProjectAgents(projectRoot);
  }
  if (!Array.isArray(agentsSpec) || agentsSpec.length === 0) {
    throw new Error("The 'agents' option must be 'auto', 'all', or a non-empty list of agent IDs.");
  }
  const unique = new Set<SupportedAiAgentId>();
  for (const rawId of agentsSpec) {
    unique.add(validateAgentId(rawId));
  }
  return Array.from(unique);
}

function buildMarkdownBridgeBlock(
  agentLabels: readonly string[],
  stacksLabel: string,
  lang: SupportedLang
): string {
  return [
    BRIDGE_START_MARKER,
    `# QA 11X Thin-Repo Bridge (${agentLabels.join(', ')})`,
    `Follow \`AGENTS.md\` and \`.agents/\` directives (stacks: \`${stacksLabel}\`, lang: \`${lang}\`).`,
    `Language: ${BRIDGE_LANG_SUMMARIES[lang]}`,
    'Rule Zero: execute tests in ephemeral Docker (`run_ephemeral_qa`), inspect AST first, never run auto `git push` (`QA-GIT-GATE-01`).',
    BRIDGE_END_MARKER,
  ].join('\n');
}

function mergeMarkdownBridge(
  existingContent: string,
  agentLabels: readonly string[],
  stacksLabel: string,
  lang: SupportedLang
): { finalContent: string; action: MergeAction } {
  const block = buildMarkdownBridgeBlock(agentLabels, stacksLabel, lang);
  return replaceDelimitedSection(
    existingContent,
    BRIDGE_START_MARKER,
    BRIDGE_END_MARKER,
    block,
    `${block}\n`,
    '\n\n'
  );
}

function mergeMdcBridge(
  existingContent: string,
  agentLabels: readonly string[],
  stacksLabel: string,
  lang: SupportedLang
): { finalContent: string; action: MergeAction } {
  const block = buildMarkdownBridgeBlock(agentLabels, stacksLabel, lang);
  if (!existingContent.trim()) {
    return { finalContent: `${CURSOR_MDC_HEADER}\n\n${block}\n`, action: ACTION_CREATED };
  }
  const merged = replaceDelimitedSection(
    existingContent,
    BRIDGE_START_MARKER,
    BRIDGE_END_MARKER,
    block,
    `${CURSOR_MDC_HEADER}\n\n${block}\n`,
    '\n\n'
  );
  if (merged.action === ACTION_APPENDED && !existingContent.trimStart().startsWith('---')) {
    return { finalContent: `${CURSOR_MDC_HEADER}\n\n${merged.finalContent}`, action: ACTION_APPENDED };
  }
  return merged;
}

function hasYamlReadKeyOutsideBridge(existingContent: string): boolean {
  const startIdx = existingContent.indexOf(AIDER_BRIDGE_START);
  const endIdx = existingContent.indexOf(AIDER_BRIDGE_END);
  const outside =
    startIdx !== -1 && endIdx > startIdx
      ? `${existingContent.slice(0, startIdx)}\n${existingContent.slice(endIdx + AIDER_BRIDGE_END.length)}`
      : existingContent;
  return outside.split(/\r?\n/).some((line) => line.trimStart().startsWith('read:'));
}

function mergeAiderYamlBridge(
  existingContent: string,
  _agentLabels: readonly string[],
  _stacksLabel: string,
  lang: SupportedLang
): { finalContent: string; action: MergeAction } {
  const includeReadKey = !hasYamlReadKeyOutsideBridge(existingContent);
  const blockLines = [
    AIDER_BRIDGE_START,
    `# QA 11X Thin-Repo Bridge (lang: ${lang}, QA-GIT-GATE-01: no auto git push)`,
    ...(includeReadKey
      ? ['read:', `  - ${AGENTS_MD_FILENAME}`]
      : [`# Existing read: key detected — keep ${AGENTS_MD_FILENAME} referenced in read:`]),
    AIDER_BRIDGE_END,
  ];
  const block = blockLines.join('\n');
  return replaceDelimitedSection(
    existingContent,
    AIDER_BRIDGE_START,
    AIDER_BRIDGE_END,
    block,
    `${block}\n`,
    '\n\n'
  );
}

type BridgeMerger = (
  existingContent: string,
  agentLabels: readonly string[],
  stacksLabel: string,
  lang: SupportedLang
) => { finalContent: string; action: MergeAction };

const BRIDGE_MERGERS: Readonly<Record<BridgeFormat, BridgeMerger>> = Object.freeze({
  [FMT_AGENTS_MD]: mergeMarkdownBridge,
  [FMT_MARKDOWN]: mergeMarkdownBridge,
  [FMT_MDC]: mergeMdcBridge,
  [FMT_AIDER]: mergeAiderYamlBridge,
});

interface GroupedBridgeTarget {
  readonly relativePath: string;
  readonly format: BridgeFormat;
  readonly agentIds: SupportedAiAgentId[];
  readonly agentLabels: string[];
}

function groupNonAgentsMdTargets(agentIds: readonly SupportedAiAgentId[]): GroupedBridgeTarget[] {
  const byPath = new Map<string, GroupedBridgeTarget>();
  for (const agentId of agentIds) {
    const desc = SUPPORTED_AI_AGENTS[agentId];
    if (desc.bridgeFile === AGENTS_MD_FILENAME) {
      continue;
    }
    const existing = byPath.get(desc.bridgeFile);
    if (existing) {
      existing.agentIds.push(agentId);
      existing.agentLabels.push(desc.displayName);
    } else {
      byPath.set(desc.bridgeFile, {
        relativePath: desc.bridgeFile,
        format: desc.format,
        agentIds: [agentId],
        agentLabels: [desc.displayName],
      });
    }
  }
  return Array.from(byPath.values());
}

export function syncAgentBridgeFiles(
  projectRoot: string,
  agentsSpec: AgentsTargetSpec | undefined,
  stacks: string[],
  lang: SupportedLang,
  dryRun: boolean
): { bridgedAgents: SupportedAiAgentId[]; bridgeFiles: BridgeFileResult[] } {
  const bridgedAgents = resolveTargetAgentIds(projectRoot, agentsSpec);
  const groupedTargets = groupNonAgentsMdTargets(bridgedAgents);
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  const bridgeFiles: BridgeFileResult[] = [];

  for (const target of groupedTargets) {
    const safePath = resolveSafeBridgePath(projectRoot, target.relativePath);
    const existing = fs.existsSync(safePath) ? fs.readFileSync(safePath, UTF8) : '';
    const merger = BRIDGE_MERGERS[target.format];
    const merged = merger(existing, target.agentLabels, stacksLabel, lang);

    if (!dryRun) {
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, merged.finalContent, UTF8);
    }

    bridgeFiles.push({
      agent_ids: [...target.agentIds],
      file_path: safePath,
      relative_path: target.relativePath,
      format: target.format,
      action: dryRun ? ACTION_DRY_RUN : merged.action,
      content: merged.finalContent,
    });
  }

  return { bridgedAgents, bridgeFiles };
}

function resolveValidProjectDirectory(rawPath: string): string {
  const resolved = path.resolve(rawPath.normalize('NFKC'));
  if (!fs.existsSync(resolved)) {
    throw new Error(`El directorio especificado no existe: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolved}`);
  }
  return resolved;
}

export async function initOrAppendAgentsMd(
  options: InitOrAppendAgentsMdOptions
): Promise<InitOrAppendAgentsMdResult> {
  const rawProjectPath = options.projectPath ?? options.project_path;
  if (!rawProjectPath || !rawProjectPath.trim()) {
    throw new Error('Missing required projectPath option for initOrAppendAgentsMd.');
  }

  const resolvedPath = resolveValidProjectDirectory(rawProjectPath);
  const lang = validateSupportedLang(options.lang);
  const dryRun = Boolean(options.dryRun ?? options.dry_run);
  const inspection = await inspectProjectConfig(resolvedPath);
  const detectedStacks = inspection.detected_stacks;
  const projectName = path.basename(resolvedPath) || 'Project';

  const agentsMdPath = resolveSafeBridgePath(resolvedPath, AGENTS_MD_FILENAME);
  const existingAgentsMd = fs.existsSync(agentsMdPath) ? fs.readFileSync(agentsMdPath, UTF8) : '';
  const mergedAgentsMd = mergeAgentsMdContent(existingAgentsMd, projectName, detectedStacks, lang);

  const { bridgedAgents, bridgeFiles } = syncAgentBridgeFiles(
    resolvedPath,
    options.agents,
    detectedStacks,
    lang,
    dryRun
  );

  if (!dryRun) {
    fs.writeFileSync(agentsMdPath, mergedAgentsMd.finalContent, UTF8);
  }

  return {
    project_path: resolvedPath,
    agents_md_path: agentsMdPath,
    lang,
    action: dryRun ? ACTION_DRY_RUN : mergedAgentsMd.action,
    detected_stacks: detectedStacks,
    content: mergedAgentsMd.finalContent,
    bridged_agents: bridgedAgents,
    bridge_files: bridgeFiles,
  };
}
