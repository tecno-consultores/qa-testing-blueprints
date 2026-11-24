#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createMcpServer,
  getDeclaredSurfaceCounts,
  getRegisteredServerSurface,
  getServerDispatcherRegistry,
  wrapReadResourceDispatcher,
  type RawGenericHandler,
} from './server.js';
import { guardToolCallInput, type PromptGuardOptions } from './security/promptGuard.js';
import { resolveSubcommandHelpText, runCli } from './cli.js';
import { SUPPORTED_AGENT_IDS } from './tools/initOrAppendAgentsMd.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';
import { TaskGuardError, TaskStateGuard, type ExecuteTaskOptions } from './utils/taskStateGuard.js';
import { formatFailVerboseReport } from './utils/diagnosticFormatter.js';

export { getServerDispatcherRegistry, type RawGenericHandler } from './server.js';

const STDIO_MODE = 'stdio' as const;
const STDIO_FORCED_MODE = 'stdio-forced' as const;
const CONTENT_TYPE_TEXT = 'text' as const;
const V2_TASK_CAPACITY = 8;
const V2_TOOL_TIMEOUT_MS = 60_000;
const V2_HEAVY_TRANSFER_TIMEOUT_MS = 185_000;
const EPHEMERAL_QA_MIN_TIMEOUT_MS = 1_000;
const EPHEMERAL_QA_MAX_TIMEOUT_MS = 900_000;
const EPHEMERAL_QA_DEFAULT_SECS = 300;
const INTERACTIVE_TTY_SYNC_TIMEOUT_MS = 300;
const PROMPT_GUARD_UNAVAILABLE_ERR =
  '[QA-PROMPT-GUARD] MCP server request handlers registry is unavailable.';

export type CliDispatchOutcome = number | typeof STDIO_MODE | typeof STDIO_FORCED_MODE;

export interface AttachGuardOptions extends PromptGuardOptions {
  taskGuard?: TaskStateGuard;
}

export interface McpSurfaceCounts {
  readonly tools: number;
  readonly resources: number;
}

function isRootHelpToken(token: string | undefined): boolean {
  return token === '--help' || token === '-h' || token === 'help';
}

type CoreDispatchResult =
  | { readonly handled: true; readonly outcome: CliDispatchOutcome }
  | { readonly handled: false };

function dispatchSingleCoreArg(arg1: string): CoreDispatchResult {
  if (arg1 === '--stdio') {
    return { handled: true, outcome: STDIO_FORCED_MODE };
  }
  if (isRootHelpToken(arg1)) {
    console.log(CLI_HELP_TEXT);
    return { handled: true, outcome: 0 };
  }
  return { handled: false };
}

function dispatchCoreFlag(
  arg1: string | undefined,
  args: readonly string[]
): CoreDispatchResult {
  if (!arg1) {
    return { handled: true, outcome: STDIO_MODE };
  }
  if (args.length === 1) {
    return dispatchSingleCoreArg(arg1);
  }
  return { handled: false };
}

async function tryDispatchSubcommandHelp(
  arg1: string | undefined,
  args: readonly string[]
): Promise<boolean> {
  if (!isRootHelpToken(arg1) || args.length !== 2) {
    return false;
  }
  const subHelp = await resolveSubcommandHelpText(args[1] ?? '');
  if (subHelp === null) {
    return false;
  }
  console.log(subHelp);
  return true;
}

export async function dispatchCliArgs(
  args: string[],
  fetcher?: GitHubFetcher
): Promise<CliDispatchOutcome> {
  const arg1 = args[0];
  const coreOutcome = dispatchCoreFlag(arg1, args);
  if (coreOutcome.handled) {
    return coreOutcome.outcome;
  }
  if (await tryDispatchSubcommandHelp(arg1, args)) {
    return 0;
  }

  const cliResult = await runCli(args, { fetcher });
  return cliResult.exitCode;
}

export function shouldExitInteractiveTty(
  outcome: typeof STDIO_MODE | typeof STDIO_FORCED_MODE,
  startStdioProvided: boolean,
  isStdinTty: boolean = Boolean(process.stdin.isTTY)
): boolean {
  if (outcome === STDIO_FORCED_MODE || startStdioProvided || process.env.QA_FORCE_STDIO === '1') {
    return false;
  }
  return isStdinTty;
}

type RawToolRequestHandler = (
  request: CallToolRequest,
  extra: unknown
) => Promise<CallToolResult> | CallToolResult;

const GUARDED_CALL_HANDLERS = new WeakSet<RawGenericHandler>();

/** Derives exact registered tool and resource counts from an McpServer instance. */
export function getRegisteredSurfaceCounts(mcpServer: McpServer): McpSurfaceCounts {
  const registered = getRegisteredServerSurface(mcpServer);
  return {
    tools: registered?.toolNames.size ?? 0,
    resources: registered?.resourceUris.size ?? 0,
  };
}

/** Creates an McpServer wrapped with promptGuard and returns its live surface counts. */
export function createConfiguredMcpServer(options?: {
  fetcher?: GitHubFetcher;
  guardOptions?: AttachGuardOptions;
}): { server: McpServer; counts: McpSurfaceCounts } {
  const server = attachPromptGuard(createMcpServer({ fetcher: options?.fetcher }), options?.guardOptions);
  return { server, counts: getRegisteredSurfaceCounts(server) };
}

function formatSurfaceSummary(counts: McpSurfaceCounts): string {
  return `${counts.tools} tools, ${counts.resources} resources`;
}

const DEFAULT_SURFACE_COUNTS: McpSurfaceCounts = getDeclaredSurfaceCounts();

/** Formats CLI help text using declared MCP surface counts without eager server instantiation. */
export function getCliHelpText(counts: McpSurfaceCounts = DEFAULT_SURFACE_COUNTS): string {
  return `
@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Official MCP Server & Skill Installer for QA Testing Blueprints

Usage:
  npx -y @sinfallas/mcp-qa-11x@latest quickstart [dir] [--tier starter|standard|enterprise] [--lang en|es] [--dry-run]
                                                     Detects stack & scaffolds QA-11X in <30s
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile
                                                     Installs skills, scripts, and AGENTS.md connector
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                   Injects or updates QA 11X connector in AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                             Reconciles and deduplicates rules in .agents/
  npx -y @sinfallas/mcp-qa-11x@latest tms-sync --mode <mode> [options]              Syncs Jira/Zephyr/Xray/GitHub Issues traceability
  npx -y @sinfallas/mcp-qa-11x@latest doctor [dir] [--offline] [--json]            Inspects active version, npx cache, skills & Docker
  npx -y @sinfallas/mcp-qa-11x@latest upgrade [--cache-only] [--dry-run] [--json]  Surgically cleans mcp-qa-11x caches & syncs skills
  npx -y @sinfallas/mcp-qa-11x@latest certify [dir] [--strict] [--release-gate]    Runs 10-check 11X gate & release readiness verdict
  npx -y @sinfallas/mcp-qa-11x@latest audit [dir] [--mode security] [--sarif]      Audits security, pyramid, vibe & CALM deterministically
  npx -y @sinfallas/mcp-qa-11x@latest blast-radius [symbol] [--changed-since ref]  Inspects AST impact radius & proportional PR routing
  npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client <id> [--install]         Prints or merges IDE/CLI mcpServers config safely
  npx -y @sinfallas/mcp-qa-11x@latest completion <fish|bash|zsh>                    Emits native shell autocompletion script
  npx -y @sinfallas/mcp-qa-11x@latest [--stdio]                                     Starts the MCP server over stdio (${formatSurfaceSummary(counts)})
  npx -y @sinfallas/mcp-qa-11x@latest --version [--verbose|--json]                 Displays active package version (or offline diagnostics)
  npx -y @sinfallas/mcp-qa-11x@latest --help                                        Displays this help message

Options for quickstart:
  --tier, -T <level>       starter (default) | standard | enterprise
  --lang, -l <mode>        auto (default) | en | es
  --agents, -a <target>    auto | all | CSV (${SUPPORTED_AGENT_IDS.length} supported agents)
  --ci <provider>          github (default) | none
  --dry-run                Simulates quickstart without modifying files
  --force                  Overwrites customized CI/task files
  --json                   Emits machine-readable JSON output

Options for install-skill (alias: install):
  --target, -t <env>       auto (default) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all
  --project-path, -p <dir> Target project directory path (default: cwd)
  --lang, -l <mode>        auto (default) | es | en — output language policy injected into AGENTS.md
  --agents, -a <target>    Optional Thin-Repo bridges (auto | all | CSV)
  --include-scripts        Installs operational scripts and common files into the current workspace
  --init-agents            Injects or updates the QA 11X connector block into AGENTS.md
  --reconcile              Performs deduplication and domain isolation in .agents/ before sync
  --dry-run                Shows installation plan without writing files to disk

Options for init-agents (alias: init-agents-md):
  --project-path, -p <dir> Target project directory path (default: cwd)
  --lang, -l <mode>        auto (default) | es | en — output language policy injected into AGENTS.md
  --agents, -a <target>    Optional Thin-Repo bridges (auto | all | CSV)
  --dry-run                Simulates operation without writing changes to disk

Options for reconcile-agents:
  --project-path, -p <dir> Target project directory path (default: cwd)
  --dry-run                Simulates operation without writing changes to disk

Options for tms-sync:
  --mode <mode>            inventory | push-results | pull-stories
  --provider <id>          jira | zephyr | xray | github-issues
  --target-dir <dir> / --junit-xml <path> / --base-url <url> / --project-key <key> / --dry-run | --live | --json

Options for doctor (alias: status):
  --project-path, -p <dir> Target project directory (default: cwd)
  --offline                Skips remote npm/GitHub version lookup
  --json                   Emits structured JSON diagnostics

Options for upgrade (alias: cache-clean):
  --cache-only             Cleans _npx and blueprint caches without syncing skills
  --target, -t <env>       Skill destination target (default: all)
  --reconcile              Reconciles .agents/ duplicates during skill sync
  --offline / --dry-run / --json

Options for certify:
  --project-path, -p <dir> Target project directory (default: cwd)
  --strict                 Fails with exitCode=20 if any check is SKIPPED
  --require-lint-evidence  Requires fresh lint evidence on dirty trees
  --allow-unmerged-examples / --release-gate / --junit-xml <path> / --offline / --json

Options for audit:
  --project-path, -p <dir> / --mode, -m <security|pyramid|vibe|calm|all> / --format, -f <text|json|sarif>
  --json / --sarif / --fail-on <critical|high|medium|any|none> / --include-examples / --max-findings <n> / --architecture-path <rel>

Options for blast-radius:
  --symbol, -s <symbol> / --project-path, -p <dir> / --changed-since <ref> / --auto-build / --refresh
  --max-tokens <n> / --max-items <n> / --json

Options for mcp-config:
  --client, -c <id|all>    antigravity | claude-code | claude-desktop | cursor | vscode | windsurf | codex | gemini-cli | hermes | all
  --print | --install / --pin-version / --dry-run / --json

Options for completion:
  <fish|bash|zsh>          Or --shell <fish|bash|zsh>

Help & Version:
  help [subcommand]        Displays global help or contextual help for a specific subcommand
  --version, -v | version  Prints version, or runs offline doctor with --json / --verbose
`;
}

/** Formats interactive TTY guard notice using live registered MCP surface counts. */
export function getInteractiveTtyNotice(counts: McpSurfaceCounts = DEFAULT_SURFACE_COUNTS): string {
  return `
ℹ️  @sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Interactive Terminal Detected (TTY)

Running without arguments starts the JSON-RPC MCP server (${formatSurfaceSummary(counts)}) over stdio, which is spawned automatically by AI clients (not meant to hang an interactive shell).

👉 Choose what you want to do:
  1. Zero-friction 30s onboarding (recommended for new repositories):
     npx -y @sinfallas/mcp-qa-11x@latest quickstart

  2. Install or update skills, scripts, and AGENTS.md in this project:
     npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

  3. Register the MCP server in your AI coding agent:
     • Safe IDE/CLI JSON/TOML config: npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client <id> [--install]
     • Claude Code:  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
     • VS Code:      code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
     • JSON config (Antigravity / Cursor / Claude Desktop / Windsurf):
       { "mcpServers": { "qa-11x": { "command": "npx", "args": ["-y", "@sinfallas/mcp-qa-11x@latest"] } } }

  4. Force raw JSON-RPC stdio listener in this terminal:
     npx -y @sinfallas/mcp-qa-11x@latest --stdio
`;
}

export const CLI_HELP_TEXT = getCliHelpText(DEFAULT_SURFACE_COUNTS);
export const INTERACTIVE_TTY_NOTICE = getInteractiveTtyNotice(DEFAULT_SURFACE_COUNTS);

function getRequiredCallToolHandler(handlers: Map<string, RawGenericHandler>): RawToolRequestHandler {
  const methodName = CallToolRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    throw new Error(`[QA-PROMPT-GUARD] Handler for '${methodName}' is not registered.`);
  }
  return existing as RawToolRequestHandler;
}

interface ProtectedToolContext {
  readonly nextRequest: CallToolRequest;
  readonly extra: unknown;
  readonly existingCallHandler: RawToolRequestHandler;
  readonly taskGuard: TaskStateGuard;
}

const HEAVY_TRANSFER_TOOL_NAMES = new Set([
  'certify_11x_gate',
  'fetch_blueprint_bundle',
  'bootstrap_or_merge_11x',
]);

const DYNAMIC_LIVE_TOOL_NAMES = new Set([
  'evaluate_agent_trajectory',
  'run_llm_red_team',
  'sync_enterprise_tms',
]);

function resolvePositiveFiniteTimeout(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return undefined;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export function resolveToolExecutionOptions(
  toolName: string,
  rawArgs: unknown,
  startedAt: number = Date.now()
): ExecuteTaskOptions {
  const args =
    typeof rawArgs === 'object' && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};
  const taskId = `${toolName}-${startedAt}-${randomUUID().slice(0, 8)}`;

  if (toolName === 'run_ephemeral_qa') {
    const rawSeconds = resolvePositiveFiniteTimeout(args.timeout_seconds) ?? EPHEMERAL_QA_DEFAULT_SECS;
    const clampedMs = Math.min(
      Math.max(rawSeconds * 1000, EPHEMERAL_QA_MIN_TIMEOUT_MS),
      EPHEMERAL_QA_MAX_TIMEOUT_MS
    );
    return { taskId, timeoutMs: clampedMs };
  }

  if (DYNAMIC_LIVE_TOOL_NAMES.has(toolName)) {
    const explicitTimeoutMs = resolvePositiveFiniteTimeout(args.timeoutMs);
    if (explicitTimeoutMs !== undefined) {
      return {
        taskId,
        timeoutMs: Math.min(Math.max(explicitTimeoutMs, EPHEMERAL_QA_MIN_TIMEOUT_MS), 600_000),
      };
    }
    const isLiveTms = toolName === 'sync_enterprise_tms' && args.dryRun === false;
    if (args.mode === 'live' || isLiveTms) {
      return { taskId, timeoutMs: V2_HEAVY_TRANSFER_TIMEOUT_MS };
    }
    return { taskId };
  }

  if (HEAVY_TRANSFER_TOOL_NAMES.has(toolName)) {
    return { taskId, profile: 'heavy_transfer' };
  }

  return { taskId };
}

function buildAbortAwareExtra(extra: unknown, taskSignal: AbortSignal): unknown {
  if (typeof extra !== 'object' || extra === null) {
    return { signal: taskSignal };
  }
  const record = extra as Record<string, unknown>;
  const upstreamSignal = record.signal instanceof AbortSignal ? record.signal : undefined;
  const combinedSignal = upstreamSignal
    ? AbortSignal.any([upstreamSignal, taskSignal])
    : taskSignal;
  return { ...record, signal: combinedSignal };
}

async function executeProtectedTool(
  toolName: string,
  context: ProtectedToolContext
): Promise<CallToolResult> {
  const { nextRequest, extra, existingCallHandler, taskGuard } = context;
  const startedAt = Date.now();
  const executionOptions = resolveToolExecutionOptions(
    toolName,
    nextRequest.params.arguments,
    startedAt
  );
  try {
    return await taskGuard.executeTask(
      async (taskSignal) =>
        await existingCallHandler(nextRequest, buildAbortAwareExtra(extra, taskSignal)),
      executionOptions
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const verboseReport = formatFailVerboseReport({
      stageId: toolName,
      passed: false,
      broken: err instanceof TaskGuardError,
      durationMs: Date.now() - startedAt,
      command: `mcp:${toolName}`,
      stderr: message,
    });
    return {
      isError: true,
      content: [{ type: CONTENT_TYPE_TEXT, text: verboseReport }],
    };
  }
}

export function attachPromptGuard(mcpServer: McpServer, options?: AttachGuardOptions): McpServer {
  const handlers = getServerDispatcherRegistry(mcpServer);
  if (!handlers) {
    throw new Error(PROMPT_GUARD_UNAVAILABLE_ERR);
  }
  const existingCallHandler = getRequiredCallToolHandler(handlers);
  if (GUARDED_CALL_HANDLERS.has(existingCallHandler as unknown as RawGenericHandler)) {
    wrapReadResourceDispatcher(mcpServer);
    return mcpServer;
  }

  const taskGuard =
    options?.taskGuard ??
    new TaskStateGuard({
      capacity: V2_TASK_CAPACITY,
      defaultTimeoutMs: V2_TOOL_TIMEOUT_MS,
      heavyTransferTimeoutMs: V2_HEAVY_TRANSFER_TIMEOUT_MS,
    });

  wrapReadResourceDispatcher(mcpServer);

  const guardedCallHandler = async (
    request: CallToolRequest,
    extra: unknown
  ): Promise<CallToolResult> => {
    const verdict = guardToolCallInput(request.params.name, request.params.arguments, options);
    if (verdict.blocked) {
      return {
        isError: true,
        content: [
          {
            type: CONTENT_TYPE_TEXT,
            text: `[QA-PROMPT-GUARD] Blocked potential prompt injection in tool '${request.params.name}' (score=${verdict.score}, matchedRules=${verdict.matchedRules.join(',')}).`,
          },
        ],
      };
    }

    const nextRequest: CallToolRequest =
      request.params.arguments === undefined
        ? request
        : {
            ...request,
            params: {
              ...request.params,
              arguments: verdict.sanitizedArgs,
            },
          };
    return await executeProtectedTool(request.params.name, {
      nextRequest,
      extra,
      existingCallHandler,
      taskGuard,
    });
  };

  GUARDED_CALL_HANDLERS.add(guardedCallHandler as unknown as RawGenericHandler);
  mcpServer.server.setRequestHandler(CallToolRequestSchema, guardedCallHandler);

  return mcpServer;
}

export interface MainRuntimeOptions {
  readonly exitFn?: (code: number) => void;
  readonly autoSyncFn?: (fetcher: GitHubFetcher) => Promise<unknown>;
  readonly isStdinTty?: boolean;
}

function runAutoSyncSafely(
  autoSyncFn: (fetcher: GitHubFetcher) => Promise<unknown>,
  fetcher: GitHubFetcher
): Promise<void> {
  return Promise.resolve()
    .then(() => autoSyncFn(fetcher))
    .then(() => undefined)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`⚠️ [QA-11X Auto-Sync] ${msg}\n`);
    });
}

async function runBoundedInteractiveAutoSync(
  autoSyncFn: (fetcher: GitHubFetcher) => Promise<unknown>,
  fetcher: GitHubFetcher
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, INTERACTIVE_TTY_SYNC_TIMEOUT_MS);
      timer.unref?.();
    });
    await Promise.race([runAutoSyncSafely(autoSyncFn, fetcher), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function main(
  argv: string[] = process.argv.slice(2),
  startStdio?: () => Promise<void>,
  options: MainRuntimeOptions = {}
): Promise<void> {
  const exitFn = options.exitFn ?? ((code: number) => process.exit(code));
  const autoSyncFn =
    options.autoSyncFn ?? ((fetcher: GitHubFetcher) => syncGlobalSkillsInBackground({ fetcher }));
  const isStdinTty = options.isStdinTty ?? Boolean(process.stdin.isTTY);
  const outcome = await dispatchCliArgs(argv);
  if (typeof outcome === 'number') {
    exitFn(outcome);
    return;
  }

  if (shouldExitInteractiveTty(outcome, Boolean(startStdio), isStdinTty)) {
    console.log(INTERACTIVE_TTY_NOTICE);
    if (process.env.QA_DISABLE_AUTO_SYNC !== '1') {
      const fetcher = new GitHubFetcher();
      await runBoundedInteractiveAutoSync(autoSyncFn, fetcher);
    }
    exitFn(0);
    return;
  }

  if (outcome === STDIO_FORCED_MODE && isStdinTty) {
    console.error(
      `🔌 @sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} listening for JSON-RPC messages over stdio (Ctrl+C to exit)...`
    );
  }

  if (startStdio) {
    await startStdio();
    return;
  }

  // Modo Servidor MCP estándar sobre stdio + Auto-sync no bloqueante de skills globales
  const fetcher = new GitHubFetcher();
  const { server } = createConfiguredMcpServer({ fetcher });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (process.env.QA_DISABLE_AUTO_SYNC !== '1') {
    void runAutoSyncSafely(autoSyncFn, fetcher);
  }
}

export function detectDirectExecution(entry: string | undefined = process.argv[1]): boolean {
  if (!entry) {
    return false;
  }
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return entry.endsWith('mcp-qa-11x');
  }
}

const isDirectExecution = detectDirectExecution();

if (isDirectExecution) {
  main().catch((err: unknown) => {
    console.error('Fatal error in @sinfallas/mcp-qa-11x:', err);
    process.exit(1);
  });
}
