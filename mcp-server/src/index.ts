#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { syncGlobalSkillsInBackground } from './services/version-manager.js';

export const CLI_HELP_TEXT = `
@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Official MCP Server & Skill Installer for QA Testing Blueprints

Usage:
  npx -y @sinfallas/mcp-qa-11x@latest                                               Starts the MCP server over stdio
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts Installs 5 skills, scripts, and AGENTS.md connector
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                   Injects or updates QA 11X connector in AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                             Reconciles and deduplicates rules in .agents/
  npx -y @sinfallas/mcp-qa-11x@latest --version                                     Displays the active package version
  npx -y @sinfallas/mcp-qa-11x@latest --help                                        Displays this help message

Options for install-skill:
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

export async function dispatchCliArgs(args: string[], fetcher?: GitHubFetcher): Promise<number | 'stdio'> {
  const arg1 = args[0];
  if (!arg1) {
    return 'stdio';
  }

  if (arg1 === '--version' || arg1 === '-v') {
    console.log(MCP_SERVER_VERSION);
    return 0;
  }

  if (arg1 === '--help' || arg1 === '-h') {
    console.log(CLI_HELP_TEXT);
    return 0;
  }

  if (arg1 === 'install-skill') {
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

export async function main(
  argv: string[] = process.argv.slice(2),
  startStdio?: () => Promise<void>,
  exitFn: (code: number) => void = (code) => process.exit(code),
  autoSyncFn: (fetcher: GitHubFetcher) => Promise<unknown> = (fetcher) =>
    syncGlobalSkillsInBackground({ fetcher })
): Promise<void> {
  const outcome = await dispatchCliArgs(argv);
  if (outcome !== 'stdio') {
    exitFn(outcome);
    return;
  }

  if (startStdio) {
    await startStdio();
    return;
  }

  // Modo Servidor MCP estándar sobre stdio + Auto-sync no bloqueante de skills globales
  const fetcher = new GitHubFetcher();
  const server = createMcpServer({ fetcher });
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
