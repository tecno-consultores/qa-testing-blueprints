#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';

export const CLI_HELP_TEXT = `
@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Servidor MCP e Instalador de Skills QA 11X

Uso:
  npx -y @sinfallas/mcp-qa-11x@latest                                             Inicia el servidor MCP sobre stdio
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts Instala las 5 skills, scripts y conector AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                 Inyecta o actualiza el conector QA 11X en AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                           Reconcilia y deduplica reglas en .agents/ aislando dominio
  npx -y @sinfallas/mcp-qa-11x@latest --version                                   Muestra la versión activa del paquete
  npx -y @sinfallas/mcp-qa-11x@latest --help                                      Muestra esta ayuda

Opciones para install-skill:
  --target, -t <entorno>   auto (defecto) | workspace | antigravity | claude | cursor | hermes | all
  --include-scripts        Instala también scripts operativos y archivos comunes en el proyecto
  --init-agents            Inyecta o actualiza además el conector en AGENTS.md
  --reconcile              Ejecuta reconciliación previa en .agents/ antes de sincronizar reglas

Opciones para init-agents y reconcile-agents:
  --project-path, -p <ruta> Directorio del proyecto destino (defecto: cwd)
  --dry-run                 Simula la operación sin escribir cambios en disco
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

  console.error(`❌ Subcomando o flag desconocido: '${arg1}'. Use --help para ver las opciones disponibles.`);
  return 1;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  startStdio?: () => Promise<void>,
  exitFn: (code: number) => void = (code) => process.exit(code)
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

  // Modo Servidor MCP estándar sobre stdio
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('\\index.js') ||
    process.argv[1].endsWith('mcp-qa-11x'));

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Error fatal en @sinfallas/mcp-qa-11x:', err);
    process.exit(1);
  });
}
