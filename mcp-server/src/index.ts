#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { runInstallSkillCli } from './cli/install-skill.js';

async function main(): Promise<void> {
  const arg1 = process.argv[2];

  if (arg1 === 'install-skill') {
    await runInstallSkillCli(process.argv.slice(3));
    process.exit(0);
  }

  if (arg1 === '--help' || arg1 === '-h') {
    console.log(`
@sinfallas/mcp-qa-11x — Servidor MCP e Instalador de Skills QA 11X

Uso:
  npx -y @sinfallas/mcp-qa-11x                   Inicia el servidor MCP sobre stdio
  npx -y @sinfallas/mcp-qa-11x install-skill     Instala las skills en el entorno deseado
  npx -y @sinfallas/mcp-qa-11x --help            Muestra esta ayuda

Opciones para install-skill:
  --target, -t <entorno>   auto (defecto) | workspace | antigravity | claude | cursor | hermes | all
  --include-scripts        Instala también scripts operativos y archivos comunes en el proyecto
`);
    process.exit(0);
  }

  // Modo Servidor MCP estándar sobre stdio
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Error fatal en @sinfallas/mcp-qa-11x:', err);
  process.exit(1);
});
