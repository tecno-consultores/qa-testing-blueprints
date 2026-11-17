#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createMcpServer,
  getRegisteredServerSurface,
  getServerDispatcherRegistry,
  wrapReadResourceDispatcher,
  type RawGenericHandler,
} from './server.js';
import { guardToolCallInput, type PromptGuardOptions } from './security/promptGuard.js';
import { runCli } from './cli.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { runTmsSyncCli } from './integrations/tmsSyncCli.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';
import { TaskGuardError, TaskStateGuard } from './utils/taskStateGuard.js';
import { formatFailVerboseReport } from './utils/diagnosticFormatter.js';

export { getServerDispatcherRegistry, type RawGenericHandler } from './server.js';

const STDIO_MODE = 'stdio' as const;
const STDIO_FORCED_MODE = 'stdio-forced' as const;
const CONTENT_TYPE_TEXT = 'text' as const;
const V2_TASK_CAPACITY = 8;
const V2_TOOL_TIMEOUT_MS = 60_000;
const V2_HEAVY_TRANSFER_TIMEOUT_MS = 185_000;
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

type CliSubcommandRunner = (tail: string[]) => Promise<number>;

const CLI_SUBCOMMAND_RUNNERS: Readonly<Record<string, CliSubcommandRunner>> = {
  'init-agents': async (tail) => {
    await runInitAgentsCli(tail);
    return 0;
  },
  'init-agents-md': async (tail) => {
    await runInitAgentsCli(tail);
    return 0;
  },
  'reconcile-agents': async (tail) => {
    await runReconcileAgentsCli(tail);
    return 0;
  },
  'tms-sync': async (tail) => {
    const res = await runTmsSyncCli(tail);
    const stream = res.exitCode === 0 ? console.log : console.error;
    stream(res.output);
    return res.exitCode;
  },
};

function dispatchCoreFlag(
  arg1: string | undefined
): { readonly handled: true; readonly outcome: CliDispatchOutcome } | { readonly handled: false } {
  if (!arg1) {
    return { handled: true, outcome: STDIO_MODE };
  }
  if (arg1 === '--stdio') {
    return { handled: true, outcome: STDIO_FORCED_MODE };
  }
  if (arg1 === '--version' || arg1 === '-v') {
    console.log(MCP_SERVER_VERSION);
    return { handled: true, outcome: 0 };
  }
  if (arg1 === '--help' || arg1 === '-h' || arg1 === 'help') {
    console.log(CLI_HELP_TEXT);
    return { handled: true, outcome: 0 };
  }
  return { handled: false };
}

export async function dispatchCliArgs(
  args: string[],
  fetcher?: GitHubFetcher
): Promise<CliDispatchOutcome> {
  const arg1 = args[0];
  const coreOutcome = dispatchCoreFlag(arg1);
  if (coreOutcome.handled) {
    return coreOutcome.outcome;
  }

  if (arg1 === 'install-skill' || arg1 === 'install') {
    await runInstallSkillCli(args.slice(1), fetcher);
    return 0;
  }

  if (arg1 === 'quickstart') {
    const cliResult = await runCli(args);
    return cliResult.exitCode;
  }

  const subcommandRunner =
    arg1 && Object.hasOwn(CLI_SUBCOMMAND_RUNNERS, arg1)
      ? CLI_SUBCOMMAND_RUNNERS[arg1]
      : undefined;
  if (subcommandRunner) {
    return await subcommandRunner(args.slice(1));
  }

  console.error(`❌ Unknown subcommand or flag: '${arg1}'. Run with --help to view available options.`);
  return 1;
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

const DEFAULT_SURFACE_COUNTS: McpSurfaceCounts = getRegisteredSurfaceCounts(createMcpServer());

/** Formats CLI help text using live registered MCP surface counts. */
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
  npx -y @sinfallas/mcp-qa-11x@latest [--stdio]                                     Starts the MCP server over stdio (${formatSurfaceSummary(counts)})
  npx -y @sinfallas/mcp-qa-11x@latest --version                                     Displays the active package version
  npx -y @sinfallas/mcp-qa-11x@latest --help                                        Displays this help message

Options for quickstart:
  --tier, -T <level>       starter | standard | enterprise (auto-recommended by detected stack)
  --lang, -l <mode>        auto (default) | en | es
  --agents <target>        auto (default) | workspace | antigravity | claude | cursor | windsurf | all
  --ci <provider>          none | github
  --dry-run                Simulates quickstart without modifying files

Options for install-skill (alias: install):
  --target, -t <env>       auto (default) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all
  --lang, -l <mode>        auto (default) | es | en — output language policy injected into AGENTS.md
  --include-scripts        Installs operational scripts and common files into the current workspace
  --init-agents            Injects or updates the QA 11X connector block into AGENTS.md
  --reconcile              Performs deduplication and domain isolation in .agents/ before sync

Options for init-agents:
  --project-path, -p <dir> Target project directory path (default: cwd)
  --lang, -l <mode>        auto (default) | es | en — output language policy injected into AGENTS.md
  --dry-run                Simulates operation without writing changes to disk

Options for reconcile-agents:
  --project-path, -p <dir> Target project directory path (default: cwd)
  --dry-run                Simulates operation without writing changes to disk
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

async function executeProtectedTool(
  toolName: string,
  context: ProtectedToolContext
): Promise<CallToolResult> {
  const { nextRequest, extra, existingCallHandler, taskGuard } = context;
  const startedAt = Date.now();
  try {
    return await taskGuard.executeTask(
      async () => await existingCallHandler(nextRequest, extra),
      { taskId: `${toolName}-${startedAt}` }
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

const isDirectExecution =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('\\index.js') ||
    process.argv[1].endsWith('mcp-qa-11x'));

if (isDirectExecution) {
  main().catch((err: unknown) => {
    console.error('Fatal error in @sinfallas/mcp-qa-11x:', err);
    process.exit(1);
  });
}
