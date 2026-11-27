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
  ensureStructuredToolResult,
  getDeclaredSurfaceCounts,
  getRegisteredServerSurface,
  getServerDispatcherRegistry,
  getToolExecutionHints,
  parseToolsetMode,
  wrapReadResourceDispatcher,
  type RawGenericHandler,
  type ToolsetMode,
} from './server.js';
import { guardToolCallInput, type PromptGuardOptions } from './security/promptGuard.js';
import { resolveSubcommandHelpText, runCli } from './cli.js';
import {
  type HelpLang,
  renderRootHelpText,
  resolveCliHelpLang,
} from './cli/commandCatalog.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';
import {
  DEFAULT_TASK_CAPACITY,
  TaskGuardError,
  TaskStateGuard,
  type ExecuteTaskOptions,
} from './utils/taskStateGuard.js';
import { formatFailVerboseReport } from './utils/diagnosticFormatter.js';

export { getServerDispatcherRegistry, type RawGenericHandler } from './server.js';

const STDIO_MODE = 'stdio' as const;
const STDIO_FORCED_MODE = 'stdio-forced' as const;
const CONTENT_TYPE_TEXT = 'text' as const;
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

function dispatchSingleCoreArg(arg1: string, args: readonly string[]): CoreDispatchResult {
  if (arg1 === '--stdio') {
    return { handled: true, outcome: STDIO_FORCED_MODE };
  }
  if (isRootHelpToken(arg1)) {
    console.log(getCliHelpText(DEFAULT_SURFACE_COUNTS, resolveCliHelpLang(args)));
    return { handled: true, outcome: 0 };
  }
  return { handled: false };
}

function extractStdioToolsetArgs(args: readonly string[]): {
  readonly isStdioOnly: boolean;
  readonly forcedStdio: boolean;
  readonly toolset?: ToolsetMode;
} | null {
  let forcedStdio = false;
  let rawToolset: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--stdio') {
      forcedStdio = true;
      continue;
    }
    if (arg === '--toolset') {
      const nextVal = args[i + 1];
      if (!nextVal || nextVal.startsWith('-')) {
        throw new Error("La opción '--toolset' requiere un valor: core | auto | full.");
      }
      rawToolset = nextVal;
      i += 1;
      continue;
    }
    if (arg.startsWith('--toolset=')) {
      rawToolset = arg.slice('--toolset='.length);
      continue;
    }
    return null;
  }
  const toolset = rawToolset !== undefined ? parseToolsetMode(rawToolset) : undefined;
  return { isStdioOnly: true, forcedStdio, toolset };
}

function dispatchCoreFlag(
  arg1: string | undefined,
  args: readonly string[]
): CoreDispatchResult {
  if (!arg1) {
    return { handled: true, outcome: STDIO_MODE };
  }
  if (args.length === 1 && isRootHelpToken(arg1)) {
    return dispatchSingleCoreArg(arg1, args);
  }
  const stdioSpec = extractStdioToolsetArgs(args);
  if (stdioSpec?.isStdioOnly) {
    if (stdioSpec.toolset !== undefined) {
      process.env.QA_11X_TOOLSET = stdioSpec.toolset;
    }
    return {
      handled: true,
      outcome: stdioSpec.forcedStdio ? STDIO_FORCED_MODE : STDIO_MODE,
    };
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
  const subHelp = await resolveSubcommandHelpText(args[1] ?? '', resolveCliHelpLang(args));
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
  toolset?: ToolsetMode;
  projectPath?: string;
  guardOptions?: AttachGuardOptions;
}): { server: McpServer; counts: McpSurfaceCounts } {
  const server = attachPromptGuard(
    createMcpServer({
      fetcher: options?.fetcher,
      toolset: options?.toolset,
      projectPath: options?.projectPath,
    }),
    options?.guardOptions
  );
  return { server, counts: getRegisteredSurfaceCounts(server) };
}

function formatSurfaceSummary(counts: McpSurfaceCounts): string {
  return `${counts.tools} tools, ${counts.resources} resources`;
}

const DEFAULT_SURFACE_COUNTS: McpSurfaceCounts = getDeclaredSurfaceCounts();

/** Formats CLI help text using declared MCP surface counts without eager server instantiation. */
export function getCliHelpText(
  counts: McpSurfaceCounts = DEFAULT_SURFACE_COUNTS,
  lang: HelpLang = 'en'
): string {
  return renderRootHelpText({ lang, counts });
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
  'analyze_ecosystem_specs',
]);

const ECOSYSTEM_PER_PROJECT_TIMEOUT_MS = 180_000;
const ECOSYSTEM_MAX_TIMEOUT_MS = 600_000;
const BLAST_GRAPH_BUILD_TIMEOUT_MS = 180_000;

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

function resolveDynamicLiveToolOptions(
  toolName: string,
  args: Record<string, unknown>,
  baseOptions: ExecuteTaskOptions
): ExecuteTaskOptions {
  const explicitTimeoutMs = resolvePositiveFiniteTimeout(args.timeoutMs);
  if (explicitTimeoutMs !== undefined) {
    return {
      ...baseOptions,
      timeoutMs: Math.min(Math.max(explicitTimeoutMs, EPHEMERAL_QA_MIN_TIMEOUT_MS), 600_000),
    };
  }
  const isLiveTms = toolName === 'sync_enterprise_tms' && args.dryRun === false;
  if (args.mode === 'live' || isLiveTms) {
    return { ...baseOptions, timeoutMs: V2_HEAVY_TRANSFER_TIMEOUT_MS };
  }
  return baseOptions;
}

function resolveEcosystemSpecsOptions(
  args: Record<string, unknown>,
  baseOptions: ExecuteTaskOptions
): ExecuteTaskOptions {
  if (args.buildGraphs === false) {
    return { ...baseOptions, profile: 'heavy_transfer' };
  }
  const projCount = Array.isArray(args.projects) && args.projects.length > 0 ? args.projects.length : 3;
  const scaledMs = Math.min(
    ECOSYSTEM_MAX_TIMEOUT_MS,
    Math.max(V2_HEAVY_TRANSFER_TIMEOUT_MS, projCount * ECOSYSTEM_PER_PROJECT_TIMEOUT_MS)
  );
  return { ...baseOptions, profile: 'heavy_transfer', timeoutMs: scaledMs };
}

export function resolveToolExecutionOptions(
  toolName: string,
  rawArgs: unknown,
  startedAt: number = Date.now()
): ExecuteTaskOptions {
  const args =
    typeof rawArgs === 'object' && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};
  const taskId = `${toolName}-${startedAt}-${randomUUID().slice(0, 8)}`;
  const hints = getToolExecutionHints(toolName);
  const baseOptions: ExecuteTaskOptions = {
    taskId,
    readOnly: hints.readOnly,
    idempotent: hints.idempotent,
  };

  if (toolName === 'run_ephemeral_qa') {
    const rawSeconds = resolvePositiveFiniteTimeout(args.timeout_seconds) ?? EPHEMERAL_QA_DEFAULT_SECS;
    const clampedMs = Math.min(
      Math.max(rawSeconds * 1000, EPHEMERAL_QA_MIN_TIMEOUT_MS),
      EPHEMERAL_QA_MAX_TIMEOUT_MS
    );
    return { ...baseOptions, timeoutMs: clampedMs };
  }

  if (DYNAMIC_LIVE_TOOL_NAMES.has(toolName)) {
    return resolveDynamicLiveToolOptions(toolName, args, baseOptions);
  }

  if (toolName === 'analyze_ecosystem_specs') {
    return resolveEcosystemSpecsOptions(args, baseOptions);
  }

  if (
    toolName === 'inspect_ast_blast_radius' &&
    (args.auto_build_if_missing === true || args.refresh_graph === true)
  ) {
    return {
      ...baseOptions,
      readOnly: false,
      idempotent: true,
      timeoutMs: BLAST_GRAPH_BUILD_TIMEOUT_MS,
    };
  }

  if (HEAVY_TRANSFER_TOOL_NAMES.has(toolName)) {
    return { ...baseOptions, profile: 'heavy_transfer' };
  }

  return baseOptions;
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
    const rawResult = await taskGuard.executeTask(
      async (taskSignal) =>
        await existingCallHandler(nextRequest, buildAbortAwareExtra(extra, taskSignal)),
      executionOptions
    );
    return ensureStructuredToolResult(rawResult);
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
      structuredContent: {
        ok: false,
        stageId: toolName,
        broken: err instanceof TaskGuardError,
        error: message,
      },
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
      capacity: DEFAULT_TASK_CAPACITY,
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
        structuredContent: {
          ok: false,
          blocked: true,
          tool: request.params.name,
          score: verdict.score,
          matchedRules: [...verdict.matchedRules],
        },
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
