// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MCP_SERVER_VERSION,
  resolveSafeChildPath,
  resolveSafeHomeDir,
} from '../services/github-fetcher.js';
import { pickAt, reportDebugCatchError } from '../utils/diagnosticFormatter.js';
import {
  type CliCommandOutput,
  formatCliJson,
  hasHelpFlag,
  readNextFlagValue,
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
}

const PKG_NAME = '@sinfallas/mcp-qa-11x';
const QA_SERVER_KEY = 'qa-11x';
const MCP_SERVERS_KEY = 'mcpServers';
const UTF8_ENCODING = 'utf-8';
const BACKUP_SUFFIX = '.11x-backup';
const CODEX_SECTION_HEADER = '[mcp_servers.qa-11x]';
const SECURE_FILE_MODE = 0o600;
const INVALID_JSON_ABORT_MSG =
  '❌ [mcp-config] JSON inválido existente; se aborta para evitar corrupción.';
const ERROR_PREFIX = '❌ [mcp-config]';

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

type JsonMcpClient = 'antigravity' | 'cursor' | 'windsurf' | 'claude-desktop' | 'hermes';
type CommandMcpClient = 'claude-code' | 'vscode' | 'gemini-cli';

const JSON_CLIENT_REL_PATHS: Readonly<Record<JsonMcpClient, string>> = {
  antigravity: '.gemini/config/mcp_config.json',
  cursor: '.cursor/mcp.json',
  windsurf: '.codeium/windsurf/mcp_config.json',
  'claude-desktop': '.config/Claude/claude_desktop_config.json',
  hermes: '.hermes/mcp.json',
};

const CODEX_REL_PATH = '.codex/config.toml';

function isJsonClient(client: SingleMcpClient): client is JsonMcpClient {
  return Object.hasOwn(JSON_CLIENT_REL_PATHS, client);
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
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMcpConfigArgs(args: readonly string[]): McpConfigParseState {
  const state: McpConfigParseState = {
    clientRaw: 'antigravity',
    install: false,
    pinVersion: false,
    dryRun: false,
    json: false,
  };
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
  for (let i = 0; i < args.length; i += 1) {
    const token = pickAt(args, i);
    const boolAction = boolFlags[token];
    if (boolAction) {
      boolAction();
      continue;
    }
    if (token === '--client' || token === '-c') {
      state.clientRaw = readNextFlagValue(args, i, token);
      i += 1;
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

function buildClientSnippet(
  client: SingleMcpClient,
  pkgSpec: string,
  homeDir: string
): ClientSnippetPayload {
  if (isJsonClient(client)) {
    const doc = { [MCP_SERVERS_KEY]: { [QA_SERVER_KEY]: buildJsonServerEntry(pkgSpec) } };
    return {
      client,
      kind: 'json',
      packageSpec: pkgSpec,
      targetPath: resolveSafeChildPath(homeDir, JSON_CLIENT_REL_PATHS[client]),
      snippet: `${JSON.stringify(doc, null, 2)}\n`,
    };
  }
  if (client === 'codex') {
    return {
      client,
      kind: 'toml',
      packageSpec: pkgSpec,
      targetPath: resolveSafeChildPath(homeDir, CODEX_REL_PATH),
      snippet: `${buildCodexTomlBlock(pkgSpec)}\n`,
    };
  }
  const command = COMMAND_CLIENT_BUILDERS[client](pkgSpec);
  return { client, kind: 'command', packageSpec: pkgSpec, command, snippet: command };
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

function writeFileAtomicWithBackup(
  targetPath: string,
  content: string,
  existed: boolean
): string | undefined {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let backupPath: string | undefined;
  if (existed) {
    backupPath = `${targetPath}${BACKUP_SUFFIX}`;
    fs.copyFileSync(targetPath, backupPath);
    fs.chmodSync(backupPath, SECURE_FILE_MODE);
  }
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, { encoding: UTF8_ENCODING, mode: SECURE_FILE_MODE });
  fs.chmodSync(tmpPath, SECURE_FILE_MODE);
  fs.renameSync(tmpPath, targetPath);
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
  const relEndIdx = lines.slice(startIdx + 1).findIndex((line) => line.trim().startsWith('['));
  const endIdx = relEndIdx === -1 ? lines.length : startIdx + 1 + relEndIdx;
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const merged =
    after.length > 0 ? [...before, ...blockLines, '', ...after] : [...before, ...blockLines];
  return `${merged.join('\n')}\n`;
}

function installJsonClient(
  client: SingleMcpClient,
  targetPath: string,
  pkgSpec: string,
  dryRun: boolean
): ClientInstallOutcome | null {
  const existed = fs.existsSync(targetPath);
  const existingDoc = existed ? parseExistingJsonDoc(targetPath) : {};
  if (!existingDoc) {
    return null;
  }
  const existingServers = isPlainObject(existingDoc[MCP_SERVERS_KEY])
    ? existingDoc[MCP_SERVERS_KEY]
    : {};
  const mergedDoc = {
    ...existingDoc,
    [MCP_SERVERS_KEY]: {
      ...existingServers,
      [QA_SERVER_KEY]: buildJsonServerEntry(pkgSpec),
    },
  };
  const rendered = `${JSON.stringify(mergedDoc, null, 2)}\n`;
  if (dryRun) {
    return {
      client,
      kind: 'json',
      status: 'dry-run',
      targetPath,
      ...(existed ? { backupPath: `${targetPath}${BACKUP_SUFFIX}` } : {}),
      snippet: rendered,
    };
  }
  const backupPath = writeFileAtomicWithBackup(targetPath, rendered, existed);
  return {
    client,
    kind: 'json',
    status: 'installed',
    targetPath,
    ...(backupPath ? { backupPath } : {}),
    snippet: rendered,
  };
}

function installTomlClient(
  targetPath: string,
  pkgSpec: string,
  dryRun: boolean
): ClientInstallOutcome {
  const existed = fs.existsSync(targetPath);
  const existingContent = existed ? fs.readFileSync(targetPath, UTF8_ENCODING) : null;
  const rendered = upsertCodexToml(existingContent, buildCodexTomlBlock(pkgSpec));
  if (dryRun) {
    return {
      client: 'codex',
      kind: 'toml',
      status: 'dry-run',
      targetPath,
      ...(existed ? { backupPath: `${targetPath}${BACKUP_SUFFIX}` } : {}),
      snippet: rendered,
    };
  }
  const backupPath = writeFileAtomicWithBackup(targetPath, rendered, existed);
  return {
    client: 'codex',
    kind: 'toml',
    status: 'installed',
    targetPath,
    ...(backupPath ? { backupPath } : {}),
    snippet: rendered,
  };
}

function installSingleClient(
  client: SingleMcpClient,
  pkgSpec: string,
  homeDir: string,
  dryRun: boolean
): ClientInstallOutcome | null {
  if (isJsonClient(client)) {
    return installJsonClient(
      client,
      resolveSafeChildPath(homeDir, JSON_CLIENT_REL_PATHS[client]),
      pkgSpec,
      dryRun
    );
  }
  if (client === 'codex') {
    return installTomlClient(resolveSafeChildPath(homeDir, CODEX_REL_PATH), pkgSpec, dryRun);
  }
  const command = COMMAND_CLIENT_BUILDERS[client](pkgSpec);
  return {
    client,
    kind: 'command',
    status: 'manual-command',
    command,
    snippet: command,
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
  return `✔ [mcp-config] client=${item.client} status=${item.status} target=${item.targetPath ?? ''}${backupNote}`;
}

function handlePrintMode(
  clients: readonly SingleMcpClient[],
  pkgSpec: string,
  homeDir: string,
  json: boolean
): CliCommandOutput {
  const payloads = clients.map((client) => buildClientSnippet(client, pkgSpec, homeDir));
  if (json) {
    const jsonBody = payloads.length === 1 ? pickAtItem(payloads, 0) : { packageSpec: pkgSpec, clients: payloads };
    return { exitCode: 0, output: formatCliJson(jsonBody) };
  }
  return { exitCode: 0, output: payloads.map(formatSnippetText).join('\n\n') };
}

function pickAtItem<T>(items: readonly T[], index: number): T | undefined {
  return items[index];
}

function handleInstallMode(
  clients: readonly SingleMcpClient[],
  pkgSpec: string,
  homeDir: string,
  state: McpConfigParseState
): CliCommandOutput {
  const outcomes: ClientInstallOutcome[] = [];
  for (const client of clients) {
    const outcome = installSingleClient(client, pkgSpec, homeDir, state.dryRun);
    if (!outcome) {
      return { exitCode: 1, output: INVALID_JSON_ABORT_MSG, isError: true };
    }
    outcomes.push(outcome);
  }
  if (state.json) {
    const jsonBody =
      outcomes.length === 1
        ? pickAtItem(outcomes, 0)
        : { packageSpec: pkgSpec, dryRun: state.dryRun, results: outcomes };
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
    const pkgSpec = buildPackageSpec(state.pinVersion);
    const targetClients: readonly SingleMcpClient[] =
      state.clientRaw === 'all'
        ? SUPPORTED_MCP_CLIENTS.filter((c): c is SingleMcpClient => c !== 'all')
        : [state.clientRaw];

    return state.install
      ? handleInstallMode(targetClients, pkgSpec, homeDir, state)
      : handlePrintMode(targetClients, pkgSpec, homeDir, state.json);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      output: `${ERROR_PREFIX} ${detail}`,
      isError: true,
    };
  }
}
