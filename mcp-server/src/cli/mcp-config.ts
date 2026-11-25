// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoSymlinkSegments, assertNotSymlinkPath } from '../security/pathRealResolver.js';
import {
  MCP_SERVER_VERSION,
  resolveSafeChildPath,
  resolveSafeHomeDir,
} from '../services/github-fetcher.js';
import { parseToolsetMode, type ToolsetMode } from '../server/toolsetFilter.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  CODEX_MCP_REL_PATH,
  CONTINUE_MCP_REL_PATH,
  HERMES_CANONICAL_MCP_REL_PATH,
  HERMES_FALLBACK_MCP_REL_PATH,
  OPENCODE_CANONICAL_MCP_REL_PATH,
  type JsonMcpClient,
  resolveActiveJsonMcpClientRelPath,
  resolveGooseMcpRelPath,
  resolveZedMcpRelPath,
} from '../utils/ideConfigPaths.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  matchFlagValue,
} from './cliArgHelpers.js';
import { renderSubcommandHelpText, resolveCliHelpLang } from './commandCatalog.js';

export const SUPPORTED_MCP_CLIENTS = [
  'antigravity',
  'claude-code',
  'claude-desktop',
  'cursor',
  'vscode',
  'windsurf',
  'codex',
  'gemini-cli',
  'hermes',
  'opencode',
  'zed',
  'cline',
  'roo-code',
  'kilo-code',
  'amazon-q',
  'jetbrains-ai',
  'devin',
  'augment',
  'trae',
  'continue',
  'goose',
  'all',
] as const;

export type SupportedMcpClient = (typeof SUPPORTED_MCP_CLIENTS)[number];
type SingleMcpClient = Exclude<SupportedMcpClient, 'all'>;

export interface McpConfigCliDeps {
  readonly homeDir?: string;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
}

const PKG_NAME = '@sinfallas/mcp-qa-11x';
const QA_SERVER_KEY = 'qa-11x';
const MCP_SERVERS_KEY = 'mcpServers';
const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';
const ZED_CONTEXT_SERVERS_KEY = 'context_servers';
const UTF8_ENCODING = 'utf-8';
const BACKUP_SUFFIX = '.11x-backup';
const CODEX_SECTION_HEADER = '[mcp_servers.qa-11x]';
const TOML_SECTION_HEADER_RE = /^\s*\[{1,2}[^[\]]+\]{1,2}/;
const SECURE_FILE_MODE = 0o600;
const ERROR_PREFIX = '❌ [mcp-config]';
const CLIENT_VALUE_FLAGS = new Set(['--client', '-c']);
const TOOLSET_VALUE_FLAGS = new Set(['--toolset']);
const JSON_MCP_CLIENTS = new Set<string>([
  'antigravity',
  'cursor',
  'windsurf',
  'claude-desktop',
  'hermes',
  'cline',
  'roo-code',
  'kilo-code',
  'amazon-q',
  'jetbrains-ai',
  'devin',
  'augment',
  'trae',
]);

export const MCP_CONFIG_HELP_TEXT = renderSubcommandHelpText('mcp-config', 'en');

type CommandMcpClient = 'claude-code' | 'vscode' | 'gemini-cli';
type SpecialClient = 'opencode' | 'zed' | 'codex' | 'continue' | 'goose';

function isJsonClient(client: SingleMcpClient): client is JsonMcpClient {
  return JSON_MCP_CLIENTS.has(client);
}

interface McpConfigParseState {
  clientRaw: string;
  toolset?: ToolsetMode;
  install: boolean;
  pinVersion: boolean;
  dryRun: boolean;
  json: boolean;
}

interface ClientSnippetPayload {
  readonly client: SingleMcpClient;
  readonly kind: 'json' | 'toml' | 'yaml' | 'command';
  readonly packageSpec: string;
  readonly snippet: string;
  readonly targetPath?: string;
  readonly command?: string;
}

interface ClientInstallOutcome {
  readonly client: SingleMcpClient;
  readonly kind: 'json' | 'toml' | 'yaml' | 'command';
  readonly status: 'installed' | 'dry-run' | 'manual-command';
  readonly targetPath?: string;
  readonly backupPath?: string;
  readonly command?: string;
  readonly snippet: string;
  readonly note?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyMcpConfigBoolFlag(
  token: string,
  state: McpConfigParseState
): boolean {
  const boolFlags: Readonly<Record<string, () => void>> = {
    '--print': () => {
      state.install = false;
    },
    '--install': () => {
      state.install = true;
    },
    '--pin-version': () => {
      state.pinVersion = true;
    },
    '--latest': () => {
      state.pinVersion = false;
    },
    '--dry-run': () => {
      state.dryRun = true;
    },
    '--json': () => {
      state.json = true;
    },
  };
  const action = Object.hasOwn(boolFlags, token) ? boolFlags[token] : undefined;
  if (!action) {
    return false;
  }
  action();
  return true;
}

function parseMcpConfigArgs(args: readonly string[]): McpConfigParseState {
  const state: McpConfigParseState = {
    clientRaw: 'antigravity',
    install: false,
    pinVersion: true,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = pickAt(args, i);
    if (applyMcpConfigBoolFlag(token, state)) {
      continue;
    }
    const clientMatch = matchFlagValue(args, i, CLIENT_VALUE_FLAGS);
    if (clientMatch) {
      state.clientRaw = clientMatch.value;
      i += clientMatch.consumed;
      continue;
    }
    const toolsetMatch = matchFlagValue(args, i, TOOLSET_VALUE_FLAGS);
    if (toolsetMatch) {
      state.toolset = parseToolsetMode(toolsetMatch.value);
      i += toolsetMatch.consumed;
      continue;
    }
    throw new Error(`Opción desconocida en mcp-config: '${token}'.`);
  }
  return state;
}

function isSupportedClient(raw: string): raw is SupportedMcpClient {
  return (SUPPORTED_MCP_CLIENTS as readonly string[]).includes(raw);
}

function buildPackageSpec(pinVersion: boolean): string {
  return pinVersion ? `${PKG_NAME}@${MCP_SERVER_VERSION}` : `${PKG_NAME}@latest`;
}

function buildNpxArgs(pkgSpec: string, toolset?: ToolsetMode): string[] {
  return toolset && toolset !== 'full' ? ['-y', pkgSpec, '--toolset', toolset] : ['-y', pkgSpec];
}

function buildJsonServerEntry(
  pkgSpec: string,
  toolset?: ToolsetMode
): { command: string; args: string[] } {
  return { command: 'npx', args: buildNpxArgs(pkgSpec, toolset) };
}

function buildOpenCodeServerEntry(
  pkgSpec: string,
  toolset?: ToolsetMode
): { type: 'local'; command: string[]; enabled: true } {
  return { type: 'local', command: ['npx', ...buildNpxArgs(pkgSpec, toolset)], enabled: true };
}

function buildCodexTomlBlock(pkgSpec: string, toolset?: ToolsetMode): string {
  const argsLiteral = buildNpxArgs(pkgSpec, toolset)
    .map((a) => `"${a}"`)
    .join(', ');
  return [CODEX_SECTION_HEADER, 'command = "npx"', `args = [${argsLiteral}]`].join('\n');
}

function buildContinueYamlDoc(pkgSpec: string, toolset?: ToolsetMode): string {
  const argsYaml = buildNpxArgs(pkgSpec, toolset)
    .map((arg) => `      - "${arg}"`)
    .join('\n');
  return [
    'name: QA-11X MCP Server',
    'version: 0.0.1',
    'schema: v1',
    'mcpServers:',
    `  - name: ${QA_SERVER_KEY}`,
    '    command: npx',
    '    args:',
    argsYaml,
    '',
  ].join('\n');
}

function buildGooseExtensionLines(pkgSpec: string, toolset?: ToolsetMode): string[] {
  return [
    `  ${QA_SERVER_KEY}:`,
    '    name: QA-11X',
    '    type: stdio',
    '    cmd: npx',
    '    args:',
    ...buildNpxArgs(pkgSpec, toolset).map((arg) => `      - "${arg}"`),
    '    enabled: true',
    '    timeout: 300',
  ];
}

function buildGooseYamlSnippet(pkgSpec: string, toolset?: ToolsetMode): string {
  return ['extensions:', ...buildGooseExtensionLines(pkgSpec, toolset), ''].join('\n');
}

const COMMAND_CLIENT_BUILDERS: Readonly<
  Record<CommandMcpClient, (pkgSpec: string, toolset?: ToolsetMode) => string>
> = {
  'claude-code': (pkgSpec, toolset) =>
    `claude mcp add -s user ${QA_SERVER_KEY} -- npx ${buildNpxArgs(pkgSpec, toolset).join(' ')}`,
  vscode: (pkgSpec, toolset) =>
    `code --add-mcp '${JSON.stringify({ name: QA_SERVER_KEY, ...buildJsonServerEntry(pkgSpec, toolset) })}'`,
  'gemini-cli': (pkgSpec, toolset) =>
    `gemini mcp add ${QA_SERVER_KEY} npx ${buildNpxArgs(pkgSpec, toolset).join(' ')}`,
};

interface SnippetTargetContext {
  readonly pkgSpec: string;
  readonly toolset?: ToolsetMode;
  readonly homeDir: string;
  readonly platform: NodeJS.Platform;
}

const SPECIAL_SNIPPET_BUILDERS: Readonly<
  Record<SpecialClient, (ctx: SnippetTargetContext) => ClientSnippetPayload>
> = {
  opencode: (ctx) => {
    const doc = {
      $schema: OPENCODE_SCHEMA_URL,
      mcp: { [QA_SERVER_KEY]: buildOpenCodeServerEntry(ctx.pkgSpec, ctx.toolset) },
    };
    return {
      client: 'opencode',
      kind: 'json',
      packageSpec: ctx.pkgSpec,
      targetPath: resolveSafeChildPath(ctx.homeDir, OPENCODE_CANONICAL_MCP_REL_PATH),
      snippet: `${JSON.stringify(doc, null, 2)}\n`,
    };
  },
  zed: (ctx) => {
    const doc = {
      [ZED_CONTEXT_SERVERS_KEY]: { [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec, ctx.toolset) },
    };
    return {
      client: 'zed',
      kind: 'json',
      packageSpec: ctx.pkgSpec,
      targetPath: resolveSafeChildPath(ctx.homeDir, resolveZedMcpRelPath(ctx.platform)),
      snippet: `${JSON.stringify(doc, null, 2)}\n`,
    };
  },
  codex: (ctx) => ({
    client: 'codex',
    kind: 'toml',
    packageSpec: ctx.pkgSpec,
    targetPath: resolveSafeChildPath(ctx.homeDir, CODEX_MCP_REL_PATH),
    snippet: `${buildCodexTomlBlock(ctx.pkgSpec, ctx.toolset)}\n`,
  }),
  continue: (ctx) => ({
    client: 'continue',
    kind: 'yaml',
    packageSpec: ctx.pkgSpec,
    targetPath: resolveSafeChildPath(ctx.homeDir, CONTINUE_MCP_REL_PATH),
    snippet: buildContinueYamlDoc(ctx.pkgSpec, ctx.toolset),
  }),
  goose: (ctx) => ({
    client: 'goose',
    kind: 'yaml',
    packageSpec: ctx.pkgSpec,
    targetPath: resolveSafeChildPath(ctx.homeDir, resolveGooseMcpRelPath(ctx.platform)),
    snippet: buildGooseYamlSnippet(ctx.pkgSpec, ctx.toolset),
  }),
};

function isSpecialClient(client: SingleMcpClient): client is SpecialClient {
  return Object.hasOwn(SPECIAL_SNIPPET_BUILDERS, client);
}

function buildClientSnippet(
  client: SingleMcpClient,
  ctx: SnippetTargetContext
): ClientSnippetPayload {
  if (isJsonClient(client)) {
    const doc = {
      [MCP_SERVERS_KEY]: { [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec, ctx.toolset) },
    };
    const relPath = resolveActiveJsonMcpClientRelPath(client, ctx.homeDir, ctx.platform);
    return {
      client,
      kind: 'json',
      packageSpec: ctx.pkgSpec,
      targetPath: resolveSafeChildPath(ctx.homeDir, relPath),
      snippet: `${JSON.stringify(doc, null, 2)}\n`,
    };
  }
  if (isSpecialClient(client)) {
    return SPECIAL_SNIPPET_BUILDERS[client](ctx);
  }
  const command = COMMAND_CLIENT_BUILDERS[client](ctx.pkgSpec, ctx.toolset);
  return { client, kind: 'command', packageSpec: ctx.pkgSpec, command, snippet: command };
}

function parseExistingJsonDoc(targetPath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(targetPath, UTF8_ENCODING));
    if (!isPlainObject(parsed)) {
      return null;
    }
    if (parsed[MCP_SERVERS_KEY] !== undefined && !isPlainObject(parsed[MCP_SERVERS_KEY])) {
      return null;
    }
    return parsed;
  } catch (err: unknown) {
    // Existing config contains invalid JSON; abort without modifying disk
    reportDebugCatchError(`mcpConfig.parseExistingJsonDoc(${targetPath})`, err);
    return null;
  }
}

interface WriteAtomicBackupInput {
  readonly homeDir: string;
  readonly relPath: string;
  readonly targetPath: string;
  readonly content: string;
  readonly existed: boolean;
}

function writeFileAtomicWithBackup(input: WriteAtomicBackupInput): string | undefined {
  const { homeDir, relPath, targetPath, content, existed } = input;
  assertNoSymlinkSegments(homeDir, relPath);
  assertNotSymlinkPath(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let backupPath: string | undefined;
  if (existed) {
    backupPath = `${targetPath}${BACKUP_SUFFIX}`;
    assertNotSymlinkPath(backupPath);
    fs.copyFileSync(targetPath, backupPath);
    fs.chmodSync(backupPath, SECURE_FILE_MODE);
  }
  const tmpPath = `${targetPath}.tmp.${crypto.randomBytes(8).toString('hex')}`;
  assertNotSymlinkPath(tmpPath);
  try {
    fs.writeFileSync(tmpPath, content, {
      encoding: UTF8_ENCODING,
      mode: SECURE_FILE_MODE,
      flag: 'wx',
    });
    assertNotSymlinkPath(tmpPath);
    fs.chmodSync(tmpPath, SECURE_FILE_MODE);
    fs.renameSync(tmpPath, targetPath);
  } catch (err: unknown) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
  return backupPath;
}

function stripTrailingNewlines(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  let end = normalized.length;
  while (end > 0 && normalized[end - 1] === '\n') {
    end -= 1;
  }
  return normalized.slice(0, end);
}

function mergeExistingCodexSection(
  lines: readonly string[],
  startIdx: number,
  blockLines: readonly string[]
): string {
  const relEndIdx = lines
    .slice(startIdx + 1)
    .findIndex((line) => TOML_SECTION_HEADER_RE.test(line));
  const endIdx = relEndIdx === -1 ? lines.length : startIdx + 1 + relEndIdx;
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const merged =
    after.length > 0 ? [...before, ...blockLines, '', ...after] : [...before, ...blockLines];
  return `${merged.join('\n')}\n`;
}

function upsertCodexToml(existing: string | null, block: string): string {
  if (existing === null || existing.trim().length === 0) {
    return `${block}\n`;
  }
  const blockLines = block.split('\n');
  const lines = stripTrailingNewlines(existing).split('\n');
  const startIdx = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === CODEX_SECTION_HEADER || trimmed.startsWith(`${CODEX_SECTION_HEADER} `);
  });
  if (startIdx === -1) {
    return `${lines.join('\n')}\n\n${block}\n`;
  }
  return mergeExistingCodexSection(lines, startIdx, blockLines);
}

type PlannedClientInstall =
  | {
      readonly client: SingleMcpClient;
      readonly kind: 'json' | 'toml' | 'yaml';
      readonly relPath: string;
      readonly targetPath: string;
      readonly existed: boolean;
      readonly content: string;
    }
  | {
      readonly client: SingleMcpClient;
      readonly kind: 'command';
      readonly command: string;
    };

function assertInstallPathsSafe(homeDir: string, relPath: string, targetPath: string): boolean {
  assertNoSymlinkSegments(homeDir, relPath);
  assertNotSymlinkPath(targetPath);
  const existed = fs.existsSync(targetPath);
  if (existed) {
    assertNotSymlinkPath(`${targetPath}${BACKUP_SUFFIX}`);
  }
  return existed;
}

function readExistingJsonOrThrow(
  relPath: string,
  targetPath: string,
  homeDir: string
): { readonly existed: boolean; readonly existingDoc: Record<string, unknown> } {
  const existed = assertInstallPathsSafe(homeDir, relPath, targetPath);
  const existingDoc = existed ? parseExistingJsonDoc(targetPath) : {};
  if (!existingDoc) {
    throw new Error(`JSON inválido existente en '${targetPath}'; se aborta para evitar corrupción.`);
  }
  return { existed, existingDoc };
}

function prepareJsonClientInstall(
  client: JsonMcpClient,
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const { existed, existingDoc } = readExistingJsonOrThrow(relPath, targetPath, ctx.homeDir);
  const existingServers = isPlainObject(existingDoc[MCP_SERVERS_KEY])
    ? existingDoc[MCP_SERVERS_KEY]
    : {};
  const mergedDoc = {
    ...existingDoc,
    [MCP_SERVERS_KEY]: {
      ...existingServers,
      [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec, ctx.toolset),
    },
  };
  return {
    client,
    kind: 'json',
    relPath,
    targetPath,
    existed,
    content: `${JSON.stringify(mergedDoc, null, 2)}\n`,
  };
}

function prepareOpenCodeClientInstall(
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const { existed, existingDoc } = readExistingJsonOrThrow(relPath, targetPath, ctx.homeDir);
  const existingMcp = isPlainObject(existingDoc.mcp) ? existingDoc.mcp : {};
  const mergedDoc = {
    $schema: typeof existingDoc.$schema === 'string' ? existingDoc.$schema : OPENCODE_SCHEMA_URL,
    ...existingDoc,
    mcp: {
      ...existingMcp,
      [QA_SERVER_KEY]: buildOpenCodeServerEntry(ctx.pkgSpec, ctx.toolset),
    },
  };
  return {
    client: 'opencode',
    kind: 'json',
    relPath,
    targetPath,
    existed,
    content: `${JSON.stringify(mergedDoc, null, 2)}\n`,
  };
}

function prepareZedClientInstall(
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const { existed, existingDoc } = readExistingJsonOrThrow(relPath, targetPath, ctx.homeDir);
  const existingServers = isPlainObject(existingDoc[ZED_CONTEXT_SERVERS_KEY])
    ? existingDoc[ZED_CONTEXT_SERVERS_KEY]
    : {};
  const mergedDoc = {
    ...existingDoc,
    [ZED_CONTEXT_SERVERS_KEY]: {
      ...existingServers,
      [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec, ctx.toolset),
    },
  };
  return {
    client: 'zed',
    kind: 'json',
    relPath,
    targetPath,
    existed,
    content: `${JSON.stringify(mergedDoc, null, 2)}\n`,
  };
}

function upsertGooseYaml(existing: string | null, entryLines: readonly string[]): string {
  if (existing === null || existing.trim().length === 0) {
    return ['extensions:', ...entryLines, ''].join('\n');
  }
  const lines = stripTrailingNewlines(existing).split('\n');
  const extIdx = lines.findIndex((line) => /^extensions\s*:\s*$/.test(line.trim()));
  if (extIdx === -1) {
    return `${lines.join('\n')}\n\nextensions:\n${entryLines.join('\n')}\n`;
  }
  const qaIdx = lines.findIndex(
    (line, idx) => idx > extIdx && new RegExp(`^\\s{2}${QA_SERVER_KEY}\\s*:`).test(line)
  );
  if (qaIdx === -1) {
    const out = [...lines.slice(0, extIdx + 1), ...entryLines, ...lines.slice(extIdx + 1)];
    return `${out.join('\n')}\n`;
  }
  let endIdx = qaIdx + 1;
  while (endIdx < lines.length && (/^\s{4,}/.test(lines[endIdx] ?? '') || (lines[endIdx] ?? '').trim() === '')) {
    endIdx += 1;
  }
  const out = [...lines.slice(0, qaIdx), ...entryLines, ...lines.slice(endIdx)];
  return `${out.join('\n')}\n`;
}

function prepareTomlClientInstall(
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const existed = assertInstallPathsSafe(ctx.homeDir, relPath, targetPath);
  const existingContent = existed ? fs.readFileSync(targetPath, UTF8_ENCODING) : null;
  return {
    client: 'codex',
    kind: 'toml',
    relPath,
    targetPath,
    existed,
    content: upsertCodexToml(existingContent, buildCodexTomlBlock(ctx.pkgSpec, ctx.toolset)),
  };
}

function prepareContinueYamlInstall(
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const existed = assertInstallPathsSafe(ctx.homeDir, relPath, targetPath);
  return {
    client: 'continue',
    kind: 'yaml',
    relPath,
    targetPath,
    existed,
    content: buildContinueYamlDoc(ctx.pkgSpec, ctx.toolset),
  };
}

function prepareGooseYamlInstall(
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const existed = assertInstallPathsSafe(ctx.homeDir, relPath, targetPath);
  const existingContent = existed ? fs.readFileSync(targetPath, UTF8_ENCODING) : null;
  return {
    client: 'goose',
    kind: 'yaml',
    relPath,
    targetPath,
    existed,
    content: upsertGooseYaml(existingContent, buildGooseExtensionLines(ctx.pkgSpec, ctx.toolset)),
  };
}

const SPECIAL_INSTALL_PREPARERS: Readonly<
  Record<SpecialClient, (ctx: SnippetTargetContext) => PlannedClientInstall>
> = {
  opencode: (ctx) =>
    prepareOpenCodeClientInstall(
      OPENCODE_CANONICAL_MCP_REL_PATH,
      resolveSafeChildPath(ctx.homeDir, OPENCODE_CANONICAL_MCP_REL_PATH),
      ctx
    ),
  zed: (ctx) => {
    const relPath = resolveZedMcpRelPath(ctx.platform);
    return prepareZedClientInstall(relPath, resolveSafeChildPath(ctx.homeDir, relPath), ctx);
  },
  codex: (ctx) =>
    prepareTomlClientInstall(
      CODEX_MCP_REL_PATH,
      resolveSafeChildPath(ctx.homeDir, CODEX_MCP_REL_PATH),
      ctx
    ),
  continue: (ctx) =>
    prepareContinueYamlInstall(
      CONTINUE_MCP_REL_PATH,
      resolveSafeChildPath(ctx.homeDir, CONTINUE_MCP_REL_PATH),
      ctx
    ),
  goose: (ctx) => {
    const relPath = resolveGooseMcpRelPath(ctx.platform);
    return prepareGooseYamlInstall(relPath, resolveSafeChildPath(ctx.homeDir, relPath), ctx);
  },
};

function resolveHermesYamlNotice(client: SingleMcpClient, homeDir: string): string | undefined {
  if (client !== 'hermes') {
    return undefined;
  }
  const yamlPath = resolveSafeChildPath(homeDir, HERMES_FALLBACK_MCP_REL_PATH);
  const jsonPath = resolveSafeChildPath(homeDir, HERMES_CANONICAL_MCP_REL_PATH);
  if (fs.existsSync(yamlPath) && !fs.existsSync(jsonPath)) {
    return `Detectado ${yamlPath}; si tu versión de Hermes usa YAML, agrega 'mcp_servers.qa-11x' allí también.`;
  }
  return undefined;
}

function prepareClientInstall(
  client: SingleMcpClient,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  if (isJsonClient(client)) {
    const relPath = resolveActiveJsonMcpClientRelPath(client, ctx.homeDir, ctx.platform);
    const targetPath = resolveSafeChildPath(ctx.homeDir, relPath);
    return prepareJsonClientInstall(client, relPath, targetPath, ctx);
  }
  if (isSpecialClient(client)) {
    return SPECIAL_INSTALL_PREPARERS[client](ctx);
  }
  return {
    client,
    kind: 'command',
    command: COMMAND_CLIENT_BUILDERS[client](ctx.pkgSpec, ctx.toolset),
  };
}

function commitPlannedInstall(
  plan: PlannedClientInstall,
  ctx: SnippetTargetContext,
  dryRun: boolean
): ClientInstallOutcome {
  if (plan.kind === 'command') {
    return {
      client: plan.client,
      kind: 'command',
      status: 'manual-command',
      command: plan.command,
      snippet: plan.command,
    };
  }
  const note = resolveHermesYamlNotice(plan.client, ctx.homeDir);
  if (dryRun) {
    return {
      client: plan.client,
      kind: plan.kind,
      status: 'dry-run',
      targetPath: plan.targetPath,
      ...(plan.existed ? { backupPath: `${plan.targetPath}${BACKUP_SUFFIX}` } : {}),
      snippet: plan.content,
      ...(note ? { note } : {}),
    };
  }
  const backupPath = writeFileAtomicWithBackup({
    homeDir: ctx.homeDir,
    relPath: plan.relPath,
    targetPath: plan.targetPath,
    content: plan.content,
    existed: plan.existed,
  });
  return {
    client: plan.client,
    kind: plan.kind,
    status: 'installed',
    targetPath: plan.targetPath,
    ...(backupPath ? { backupPath } : {}),
    snippet: plan.content,
    ...(note ? { note } : {}),
  };
}

function formatSnippetText(item: ClientSnippetPayload): string {
  const header = item.targetPath
    ? `# ${item.client} (${item.targetPath})`
    : `# ${item.client} (CLI command)`;
  return `${header}\n${item.snippet.trimEnd()}`;
}

function formatInstallOutcomeText(item: ClientInstallOutcome): string {
  if (item.kind === 'command') {
    return `ℹ️ [mcp-config] ${item.client}: ejecuta manualmente el comando seguro (sin modificar $HOME):\n  ${item.command ?? ''}`;
  }
  const backupNote = item.backupPath ? ` | backup=${item.backupPath}` : '';
  const extraNote = item.note ? `\n  ℹ️ ${item.note}` : '';
  return `✔ [mcp-config] client=${item.client} status=${item.status} target=${item.targetPath ?? ''}${backupNote}${extraNote}`;
}

function handlePrintMode(
  clients: readonly SingleMcpClient[],
  ctx: SnippetTargetContext,
  json: boolean
): CliCommandOutput {
  const payloads = clients.map((client) => buildClientSnippet(client, ctx));
  if (json) {
    const jsonBody =
      payloads.length === 1 ? pickAtItem(payloads, 0) : { packageSpec: ctx.pkgSpec, clients: payloads };
    return { exitCode: 0, output: formatCliJson(jsonBody) };
  }
  return { exitCode: 0, output: payloads.map(formatSnippetText).join('\n\n') };
}

function pickAtItem<T>(items: readonly T[], index: number): T | undefined {
  return items[index];
}

function handleInstallMode(
  clients: readonly SingleMcpClient[],
  ctx: SnippetTargetContext,
  state: McpConfigParseState
): CliCommandOutput {
  // Pre-validate every target file in memory before performing any write or backup on disk
  const plans = clients.map((client) => prepareClientInstall(client, ctx));
  const outcomes = plans.map((plan) => commitPlannedInstall(plan, ctx, state.dryRun));
  if (state.json) {
    const jsonBody =
      outcomes.length === 1
        ? pickAtItem(outcomes, 0)
        : { packageSpec: ctx.pkgSpec, dryRun: state.dryRun, results: outcomes };
    return { exitCode: 0, output: formatCliJson(jsonBody) };
  }
  return { exitCode: 0, output: outcomes.map(formatInstallOutcomeText).join('\n') };
}

export function runMcpConfigCli(
  args: readonly string[],
  deps: McpConfigCliDeps = {}
): CliCommandOutput {
  if (hasHelpFlag(args)) {
    return {
      exitCode: 0,
      output: renderSubcommandHelpText('mcp-config', resolveCliHelpLang(args)),
    };
  }
  try {
    const state = parseMcpConfigArgs(args);
    if (!isSupportedClient(state.clientRaw)) {
      return {
        exitCode: 1,
        output: `${ERROR_PREFIX} Cliente no soportado: '${state.clientRaw}'. Soportados: ${SUPPORTED_MCP_CLIENTS.join(', ')}.`,
        isError: true,
      };
    }
    const homeDir = resolveSafeHomeDir(deps.homeDir);
    const ctx: SnippetTargetContext = {
      pkgSpec: buildPackageSpec(state.pinVersion),
      ...(state.toolset !== undefined ? { toolset: state.toolset } : {}),
      homeDir,
      platform: deps.platform ?? process.platform,
    };
    const targetClients: readonly SingleMcpClient[] =
      state.clientRaw === 'all'
        ? SUPPORTED_MCP_CLIENTS.filter((c): c is SingleMcpClient => c !== 'all')
        : [state.clientRaw];

    return state.install
      ? handleInstallMode(targetClients, ctx, state)
      : handlePrintMode(targetClients, ctx, state.json);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      output: `${ERROR_PREFIX} ${detail}`,
      isError: true,
    };
  }
}
