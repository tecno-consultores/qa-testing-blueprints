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
import { createMcpServer } from './server.js';
import { guardToolCallInput, type PromptGuardOptions } from './security/promptGuard.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';

const STDIO_MODE = 'stdio' as const;
const STDIO_FORCED_MODE = 'stdio-forced' as const;
export type CliDispatchOutcome = number | typeof STDIO_MODE | typeof STDIO_FORCED_MODE;

export const CLI_HELP_TEXT = `
@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Official MCP Server & Skill Installer for QA Testing Blueprints

Usage:
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile
                                                                                     Installs 5 skills, scripts, and AGENTS.md connector
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                   Injects or updates QA 11X connector in AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                             Reconciles and deduplicates rules in .agents/
  npx -y @sinfallas/mcp-qa-11x@latest [--stdio]                                     Starts the MCP server over stdio (spawned by AI IDEs)
  npx -y @sinfallas/mcp-qa-11x@latest --version                                     Displays the active package version
  npx -y @sinfallas/mcp-qa-11x@latest --help                                        Displays this help message

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

Running without arguments starts the JSON-RPC MCP server over stdio, which is spawned automatically by AI clients (not meant to hang an interactive shell).

👉 Choose what you want to do:
  1. Install or update the 5 global skills, scripts, and AGENTS.md in this project:
     npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

  2. Register the MCP server in your AI coding agent:
     • Claude Code:  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
     • VS Code:      code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
     • JSON config (Antigravity / Cursor / Claude Desktop / Windsurf):
       { "mcpServers": { "qa-11x": { "command": "npx", "args": ["-y", "@sinfallas/mcp-qa-11x@latest"] } } }

  3. Force raw JSON-RPC stdio listener in this terminal:
     npx -y @sinfallas/mcp-qa-11x@latest --stdio
`;

export async function dispatchCliArgs(
  args: string[],
  fetcher?: GitHubFetcher
): Promise<CliDispatchOutcome> {
  const arg1 = args[0];
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

  if (arg1 === '--help' || arg1 === '-h') {
    console.log(CLI_HELP_TEXT);
    return 0;
  }

  if (arg1 === 'install-skill' || arg1 === 'install') {
    await runInstallSkillCli(args.slice(1), fetcher);
    return 0;
  }

  if (arg1 === 'init-agents' || arg1 === 'init-agents-md') {
    await runInitAgentsCli(args.slice(1));
    return 0;
  }

  if (arg1 === 'reconcile-agents') {
    await runReconcileAgentsCli(args.slice(1));
    return 0;
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

function getExistingCallToolHandler(mcpServer: McpServer): RawToolRequestHandler {
  const handlers: unknown = Reflect.get(mcpServer.server, '_requestHandlers');
  if (!(handlers instanceof Map)) {
    throw new Error('[QA-PROMPT-GUARD] MCP server request handlers registry is unavailable.');
  }
  const methodName = CallToolRequestSchema.shape.method.value;
  const existing = handlers.get(methodName);
  if (typeof existing !== 'function') {
    throw new Error(`[QA-PROMPT-GUARD] Handler for '${methodName}' is not registered.`);
  }
  return existing as RawToolRequestHandler;
}

export function attachPromptGuard(
  mcpServer: McpServer,
  options?: PromptGuardOptions
): McpServer {
  const existingHandler = getExistingCallToolHandler(mcpServer);

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const verdict = guardToolCallInput(request.params.name, request.params.arguments, options);
    if (verdict.blocked) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
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
    return await existingHandler(nextRequest, extra);
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
