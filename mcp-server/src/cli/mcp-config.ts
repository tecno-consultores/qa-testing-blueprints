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
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  CODEX_MCP_REL_PATH,
  HERMES_CANONICAL_MCP_REL_PATH,
  HERMES_FALLBACK_MCP_REL_PATH,
  type JsonMcpClient,
  resolveActiveJsonMcpClientRelPath,
} from '../utils/ideConfigPaths.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  matchFlagValue,
} from './cliArgHelpers.js';

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
const UTF8_ENCODING = 'utf-8';
const BACKUP_SUFFIX = '.11x-backup';
const CODEX_SECTION_HEADER = '[mcp_servers.qa-11x]';
const TOML_SECTION_HEADER_RE = /^\s*\[{1,2}[^[\]]+\]{1,2}/;
const SECURE_FILE_MODE = 0o600;
const ERROR_PREFIX = '❌ [mcp-config]';
const CLIENT_VALUE_FLAGS = new Set(['--client', '-c']);
const JSON_MCP_CLIENTS = new Set<string>([
  'antigravity',
  'cursor',
  'windsurf',
  'claude-desktop',
  'hermes',
]);

export const MCP_CONFIG_HELP_TEXT = [
  'Uso: npx -y @sinfallas/mcp-qa-11x mcp-config [opciones]',
  '',
  'Opciones:',
  `  --client, -c <cliente>  ${SUPPORTED_MCP_CLIENTS.join(' | ')} (por defecto: antigravity)`,
  '  --print                 Imprime el snippet o comando de configuración (por defecto)',
  '  --install               Instala la configuración en archivos JSON/TOML con respaldo .11x-backup',
  '  --pin-version           Fija la versión exacta @sinfallas/mcp-qa-11x@<version> en vez de @latest',
  '  --dry-run               Previsualiza la ruta destino y cambios sin modificar el disco',
  '  --json                  Emite salida estructurada JSON',
  '  --help, -h              Muestra esta ayuda y sale con código 0',
].join('\n');

type CommandMcpClient = 'claude-code' | 'vscode' | 'gemini-cli';

function isJsonClient(client: SingleMcpClient): client is JsonMcpClient {
  return JSON_MCP_CLIENTS.has(client);
}

interface McpConfigParseState {
  clientRaw: string;
  install: boolean;
  pinVersion: boolean;
  dryRun: boolean;
  json: boolean;
}

interface ClientSnippetPayload {
  readonly client: SingleMcpClient;
  readonly kind: 'json' | 'toml' | 'command';
  readonly packageSpec: string;
  readonly snippet: string;
  readonly targetPath?: string;
  readonly command?: string;
}

interface ClientInstallOutcome {
  readonly client: SingleMcpClient;
  readonly kind: 'json' | 'toml' | 'command';
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
    '--dry-run': () => {
      state.dryRun = true;
    },
    '--json': () => {
      state.json = true;
    },
  };
  const action = boolFlags[token];
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
    pinVersion: false,
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

function buildJsonServerEntry(pkgSpec: string): { command: string; args: [string, string] } {
  return { command: 'npx', args: ['-y', pkgSpec] };
}

function buildCodexTomlBlock(pkgSpec: string): string {
  return [CODEX_SECTION_HEADER, 'command = "npx"', `args = ["-y", "${pkgSpec}"]`].join('\n');
}

const COMMAND_CLIENT_BUILDERS: Readonly<Record<CommandMcpClient, (pkgSpec: string) => string>> = {
  'claude-code': (pkgSpec) => `claude mcp add -s user ${QA_SERVER_KEY} -- npx -y ${pkgSpec}`,
  vscode: (pkgSpec) =>
    `code --add-mcp '${JSON.stringify({ name: QA_SERVER_KEY, ...buildJsonServerEntry(pkgSpec) })}'`,
  'gemini-cli': (pkgSpec) => `gemini mcp add ${QA_SERVER_KEY} npx -y ${pkgSpec}`,
};

interface SnippetTargetContext {
  readonly pkgSpec: string;
  readonly homeDir: string;
  readonly platform: NodeJS.Platform;
}

function buildClientSnippet(
  client: SingleMcpClient,
  ctx: SnippetTargetContext
): ClientSnippetPayload {
  if (isJsonClient(client)) {
    const doc = { [MCP_SERVERS_KEY]: { [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec) } };
    const relPath = resolveActiveJsonMcpClientRelPath(client, ctx.homeDir, ctx.platform);
    return {
      client,
      kind: 'json',
      packageSpec: ctx.pkgSpec,
      targetPath: resolveSafeChildPath(ctx.homeDir, relPath),
      snippet: `${JSON.stringify(doc, null, 2)}\n`,
    };
  }
  if (client === 'codex') {
    return {
      client,
      kind: 'toml',
      packageSpec: ctx.pkgSpec,
      targetPath: resolveSafeChildPath(ctx.homeDir, CODEX_MCP_REL_PATH),
      snippet: `${buildCodexTomlBlock(ctx.pkgSpec)}\n`,
    };
  }
  const command = COMMAND_CLIENT_BUILDERS[client](ctx.pkgSpec);
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
      readonly kind: 'json' | 'toml';
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

function prepareJsonClientInstall(
  client: JsonMcpClient,
  relPath: string,
  targetPath: string,
  ctx: SnippetTargetContext
): PlannedClientInstall {
  const existed = assertInstallPathsSafe(ctx.homeDir, relPath, targetPath);
  const existingDoc = existed ? parseExistingJsonDoc(targetPath) : {};
  if (!existingDoc) {
    throw new Error(`JSON inválido existente en '${targetPath}'; se aborta para evitar corrupción.`);
  }
  const existingServers = isPlainObject(existingDoc[MCP_SERVERS_KEY])
    ? existingDoc[MCP_SERVERS_KEY]
    : {};
  const mergedDoc = {
    ...existingDoc,
    [MCP_SERVERS_KEY]: {
      ...existingServers,
      [QA_SERVER_KEY]: buildJsonServerEntry(ctx.pkgSpec),
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
    content: upsertCodexToml(existingContent, buildCodexTomlBlock(ctx.pkgSpec)),
  };
}

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
  if (client === 'codex') {
    const targetPath = resolveSafeChildPath(ctx.homeDir, CODEX_MCP_REL_PATH);
    return prepareTomlClientInstall(CODEX_MCP_REL_PATH, targetPath, ctx);
  }
  return {
    client,
    kind: 'command',
    command: COMMAND_CLIENT_BUILDERS[client](ctx.pkgSpec),
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
    return { exitCode: 0, output: MCP_CONFIG_HELP_TEXT };
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
