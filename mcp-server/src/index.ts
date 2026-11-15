#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type ReadResourceResult,
  type Resource,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';
import type { ResourceLanguage } from './types.js';
import { parseResourceUriAndLang, runWithResourceLang } from './resources/resourceLang.js';
import { guardToolCallInput, type PromptGuardOptions } from './security/promptGuard.js';
import { runCli } from './cli.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';
import { TaskGuardError, TaskStateGuard } from './utils/taskStateGuard.js';
import { formatFailVerboseReport } from './utils/diagnosticFormatter.js';
import {
  VALIDATE_CALM_ARCHITECTURE_TOOL,
  handleValidateCalmArchitecture,
  type ValidateCalmArchitectureArgs,
} from './tools/validateCalmArchitecture.js';
import {
  EVALUATE_RELEASE_GATE_TOOL,
  handleEvaluateReleaseGate,
  type EvaluateReleaseGateArgs,
} from './tools/evaluateReleaseGate.js';
import {
  EVALUATE_AGENT_TRAJECTORY_TOOL,
  handleEvaluateAgentTrajectory,
  type EvaluateAgentTrajectoryArgs,
} from './tools/evaluateAgentTrajectory.js';
import {
  RUN_LLM_RED_TEAM_TOOL,
  handleRunLlmRedTeam,
  type RunLlmRedTeamArgs,
} from './tools/runLlmRedTeam.js';
import {
  AUDIT_VIBE_PROTOTYPE_TOOL,
  handleAuditVibePrototype,
  type AuditVibePrototypeArgs,
} from './tools/auditVibePrototype.js';
import { SYNC_ENTERPRISE_TMS_TOOL, handleSyncEnterpriseTms, runTmsSyncCli } from './integrations/tmsSyncCli.js';
import { AI_EVALS_REDTEAM_RESOURCE, readAiEvalsBlueprint } from './resources/aiEvalsBlueprint.js';
import {
  MOBILE_APPIUM_RESOURCE,
  VIBE_RESCUE_RESOURCE,
  readMobileAppiumBlueprint,
  readVibeRescueBlueprint,
} from './resources/stackBlueprints.js';

const STDIO_MODE = 'stdio' as const;
const STDIO_FORCED_MODE = 'stdio-forced' as const;
const CONTENT_TYPE_TEXT = 'text' as const;
const MARKDOWN_MIME_TYPE = 'text/markdown' as const;
const V2_TASK_CAPACITY = 8;
const V2_TOOL_TIMEOUT_MS = 60_000;
const V2_HEAVY_TRANSFER_TIMEOUT_MS = 185_000;
const PROMPT_GUARD_UNAVAILABLE_ERR =
  '[QA-PROMPT-GUARD] MCP server request handlers registry is unavailable.';

export type CliDispatchOutcome = number | typeof STDIO_MODE | typeof STDIO_FORCED_MODE;

export interface AttachGuardOptions extends PromptGuardOptions {
  taskGuard?: TaskStateGuard;
}

export const CLI_HELP_TEXT = `
@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Official MCP Server & Skill Installer for QA Testing Blueprints

Usage:
  npx -y @sinfallas/mcp-qa-11x@latest quickstart [dir] [--tier starter|standard|enterprise] [--lang en|es] [--dry-run]
                                                                                     Detects stack & scaffolds QA-11X in <30s
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile
                                                                                     Installs skills, scripts, and AGENTS.md connector
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                   Injects or updates QA 11X connector in AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                             Reconciles and deduplicates rules in .agents/
  npx -y @sinfallas/mcp-qa-11x@latest tms-sync --mode <mode> [options]              Syncs Jira/Zephyr/Xray/GitHub Issues traceability
  npx -y @sinfallas/mcp-qa-11x@latest [--stdio]                                     Starts the MCP server over stdio (18 tools, 12 resources)
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

export const INTERACTIVE_TTY_NOTICE = `
ℹ️  @sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Interactive Terminal Detected (TTY)

Running without arguments starts the JSON-RPC MCP server (18 tools, 12 resources) over stdio, which is spawned automatically by AI clients (not meant to hang an interactive shell).

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

function dispatchCoreFlag(arg1: string | undefined): CliDispatchOutcome | undefined {
  if (!arg1) {
    return STDIO_MODE;
  }
  if (arg1 === '--stdio') {
    return STDIO_FORCED_MODE;
  }
  if (arg1 === '--version' || arg1 === '-v') {
    console.log(MCP_SERVER_VERSION);
    return 0;
  }
  if (arg1 === '--help' || arg1 === '-h' || arg1 === 'help') {
    console.log(CLI_HELP_TEXT);
    return 0;
  }
  return undefined;
}

export async function dispatchCliArgs(
  args: string[],
  fetcher?: GitHubFetcher
): Promise<CliDispatchOutcome> {
  const arg1 = args[0];
  const coreOutcome = dispatchCoreFlag(arg1);
  if (coreOutcome !== undefined) {
    return coreOutcome;
  }

  if (arg1 === 'install-skill' || arg1 === 'install') {
    await runInstallSkillCli(args.slice(1), fetcher);
    return 0;
  }

  if (arg1 === 'quickstart') {
    const cliResult = await runCli(args);
    return cliResult.exitCode;
  }

  if (arg1 && Object.hasOwn(CLI_SUBCOMMAND_RUNNERS, arg1)) {
    return await CLI_SUBCOMMAND_RUNNERS[arg1](args.slice(1));
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

type RawGenericHandler = (request: unknown, extra: unknown) => Promise<unknown> | unknown;

type V2ToolExecutor = (args: unknown) => Promise<CallToolResult> | CallToolResult;

interface ToolsListPayload {
  tools: Tool[];
  [key: string]: unknown;
}

interface ResourcesListPayload {
  resources: Resource[];
  [key: string]: unknown;
}

interface ResourceSnapshotResult {
  uri: string;
  mimeType: string;
  text: string;
}

const V2_TOOL_DEFINITIONS: readonly Tool[] = [
  VALIDATE_CALM_ARCHITECTURE_TOOL,
  EVALUATE_RELEASE_GATE_TOOL,
  EVALUATE_AGENT_TRAJECTORY_TOOL,
  RUN_LLM_RED_TEAM_TOOL,
  AUDIT_VIBE_PROTOTYPE_TOOL,
  SYNC_ENTERPRISE_TMS_TOOL,
];

const V2_TOOL_HANDLERS: Readonly<Record<string, V2ToolExecutor>> = {
  [VALIDATE_CALM_ARCHITECTURE_TOOL.name]: (args) =>
    handleValidateCalmArchitecture(args as ValidateCalmArchitectureArgs | undefined),
  [EVALUATE_RELEASE_GATE_TOOL.name]: (args) =>
    handleEvaluateReleaseGate(args as EvaluateReleaseGateArgs | undefined),
  [EVALUATE_AGENT_TRAJECTORY_TOOL.name]: async (args) =>
    await handleEvaluateAgentTrajectory(args as EvaluateAgentTrajectoryArgs | undefined),
  [RUN_LLM_RED_TEAM_TOOL.name]: async (args) =>
    await handleRunLlmRedTeam(args as RunLlmRedTeamArgs | undefined),
  [AUDIT_VIBE_PROTOTYPE_TOOL.name]: (args) =>
    handleAuditVibePrototype(args as AuditVibePrototypeArgs | undefined),
  [SYNC_ENTERPRISE_TMS_TOOL.name]: async (args) => await handleSyncEnterpriseTms(args),
};

const V1_TEMPLATE_RESOURCES: readonly Resource[] = [
  {
    uri: 'blueprint://{stack}/readme',
    name: 'blueprint-stack-readme',
    description: 'Operational testing and QA guide for the requested stack.',
    mimeType: MARKDOWN_MIME_TYPE,
  },
  {
    uri: 'blueprint://ui/refactoring-ui/{topic}',
    name: 'blueprint-refactoring-ui',
    description: 'Tactical UI design and WCAG 2.1 AA accessibility rules from Refactoring UI.',
    mimeType: MARKDOWN_MIME_TYPE,
  },
];

const V2_RESOURCE_DEFINITIONS: readonly Resource[] = [
  AI_EVALS_REDTEAM_RESOURCE,
  MOBILE_APPIUM_RESOURCE,
  VIBE_RESCUE_RESOURCE,
];

const EXTRA_LISTED_RESOURCES: readonly Resource[] = [
  ...V1_TEMPLATE_RESOURCES,
  ...V2_RESOURCE_DEFINITIONS,
];

function toReadResourceResult(
  res: ResourceSnapshotResult,
  requestedUri: string
): ReadResourceResult {
  return {
    contents: [{ uri: requestedUri, mimeType: res.mimeType, text: res.text }],
  };
}

const V2_RESOURCE_READERS: Readonly<
  Record<string, (lang: ResourceLanguage, requestedUri: string) => ReadResourceResult>
> = {
  [AI_EVALS_REDTEAM_RESOURCE.uri]: (lang, requestedUri) =>
    toReadResourceResult(readAiEvalsBlueprint(undefined, lang), requestedUri),
  [MOBILE_APPIUM_RESOURCE.uri]: (lang, requestedUri) =>
    toReadResourceResult(readMobileAppiumBlueprint(undefined, lang), requestedUri),
  [VIBE_RESCUE_RESOURCE.uri]: (lang, requestedUri) =>
    toReadResourceResult(readVibeRescueBlueprint(undefined, lang), requestedUri),
};

function getRequestHandlersMap(mcpServer: McpServer): Map<string, RawGenericHandler> {
  const handlers: unknown = Reflect.get(mcpServer.server, '_requestHandlers');
  if (!(handlers instanceof Map)) {
    throw new Error(PROMPT_GUARD_UNAVAILABLE_ERR);
  }
  return handlers as Map<string, RawGenericHandler>;
}

function getRequiredCallToolHandler(handlers: Map<string, RawGenericHandler>): RawToolRequestHandler {
  const methodName = CallToolRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    throw new Error(`[QA-PROMPT-GUARD] Handler for '${methodName}' is not registered.`);
  }
  return existing as RawToolRequestHandler;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function wrapListToolsHandler(mcpServer: McpServer, handlers: Map<string, RawGenericHandler>): void {
  const methodName = ListToolsRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    return;
  }

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const rawResult = await existing(request, extra);
    const payload: ToolsListPayload =
      isRecordObject(rawResult) && Array.isArray(rawResult.tools)
        ? (rawResult as ToolsListPayload)
        : { tools: [] };
    const existingNames = new Set(payload.tools.map((tool) => tool.name));
    const missingV2 = V2_TOOL_DEFINITIONS.filter((tool) => !existingNames.has(tool.name));
    return {
      ...payload,
      tools: [...payload.tools, ...missingV2],
    };
  });
}

function wrapListResourcesHandler(
  mcpServer: McpServer,
  handlers: Map<string, RawGenericHandler>
): void {
  const methodName = ListResourcesRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    return;
  }

  mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
    const rawResult = await existing(request, extra);
    const payload: ResourcesListPayload =
      isRecordObject(rawResult) && Array.isArray(rawResult.resources)
        ? (rawResult as ResourcesListPayload)
        : { resources: [] };
    const existingUris = new Set(payload.resources.map((res) => res.uri));
    const missingResources = EXTRA_LISTED_RESOURCES.filter((res) => !existingUris.has(res.uri));
    return {
      ...payload,
      resources: [...payload.resources, ...missingResources],
    };
  });
}

function wrapReadResourceHandler(
  mcpServer: McpServer,
  handlers: Map<string, RawGenericHandler>
): void {
  const methodName = ReadResourceRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    return;
  }

  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    const requestedUri = request.params.uri;
    const { baseUri, lang } = parseResourceUriAndLang(requestedUri);
    if (Object.hasOwn(V2_RESOURCE_READERS, baseUri)) {
      return V2_RESOURCE_READERS[baseUri](lang, requestedUri);
    }
    const rewrittenRequest =
      baseUri === requestedUri
        ? request
        : { ...request, params: { ...request.params, uri: baseUri } };
    const result = (await runWithResourceLang(lang, () =>
      existing(rewrittenRequest, extra)
    )) as ReadResourceResult;
    if (baseUri !== requestedUri && Array.isArray(result.contents)) {
      return {
        ...result,
        contents: result.contents.map((item) => ({ ...item, uri: requestedUri })),
      };
    }
    return result;
  });
}

async function executeProtectedTool(
  toolName: string,
  nextRequest: CallToolRequest,
  extra: unknown,
  existingCallHandler: RawToolRequestHandler,
  taskGuard: TaskStateGuard
): Promise<CallToolResult> {
  const startedAt = Date.now();
  try {
    return await taskGuard.executeTask(
      async () => {
        if (Object.hasOwn(V2_TOOL_HANDLERS, toolName)) {
          return await V2_TOOL_HANDLERS[toolName](nextRequest.params.arguments);
        }
        return await existingCallHandler(nextRequest, extra);
      },
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
  const handlers = getRequestHandlersMap(mcpServer);
  const existingCallHandler = getRequiredCallToolHandler(handlers);
  const taskGuard =
    options?.taskGuard ??
    new TaskStateGuard({
      capacity: V2_TASK_CAPACITY,
      defaultTimeoutMs: V2_TOOL_TIMEOUT_MS,
      heavyTransferTimeoutMs: V2_HEAVY_TRANSFER_TIMEOUT_MS,
    });

  wrapListToolsHandler(mcpServer, handlers);
  wrapListResourcesHandler(mcpServer, handlers);
  wrapReadResourceHandler(mcpServer, handlers);

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
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
    return await executeProtectedTool(
      request.params.name,
      nextRequest,
      extra,
      existingCallHandler,
      taskGuard
    );
  });

  return mcpServer;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  startStdio?: () => Promise<void>,
  exitFn: (code: number) => void = (code) => process.exit(code),
  autoSyncFn: (fetcher: GitHubFetcher) => Promise<unknown> = (fetcher) =>
    syncGlobalSkillsInBackground({ fetcher }),
  isStdinTty: boolean = Boolean(process.stdin.isTTY)
): Promise<void> {
  const outcome = await dispatchCliArgs(argv);
  if (typeof outcome === 'number') {
    exitFn(outcome);
    return;
  }

  if (shouldExitInteractiveTty(outcome, Boolean(startStdio), isStdinTty)) {
    if (process.env.QA_DISABLE_AUTO_SYNC !== '1') {
      const fetcher = new GitHubFetcher();
      await autoSyncFn(fetcher);
    }
    console.log(INTERACTIVE_TTY_NOTICE);
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
  const server = attachPromptGuard(createMcpServer({ fetcher }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (process.env.QA_DISABLE_AUTO_SYNC !== '1') {
    void autoSyncFn(fetcher);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('\\index.js') ||
    process.argv[1].endsWith('mcp-qa-11x'));

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal error in @sinfallas/mcp-qa-11x:', err);
    process.exit(1);
  });
}
