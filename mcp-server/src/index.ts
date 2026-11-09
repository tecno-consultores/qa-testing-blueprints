#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { runInstallSkillCli } from './cli/install-skill.js';
import { runInitAgentsCli } from './cli/init-agents-md.js';
import { runReconcileAgentsCli } from './cli/reconcile-agents.js';

async function main(): Promise<void> {
  const arg1 = process.argv[2];

  if (arg1 === 'install-skill') {
    await runInstallSkillCli(process.argv.slice(3));
    process.exit(0);
  }

  if (arg1 === 'init-agents' || arg1 === 'init-agents-md') {
    await runInitAgentsCli(process.argv.slice(3));
    process.exit(0);
  }

  if (arg1 === 'reconcile-agents') {
    await runReconcileAgentsCli(process.argv.slice(3));
    process.exit(0);
  }

  if (arg1 === '--help' || arg1 === '-h') {
    console.log(`
@sinfallas/mcp-qa-11x — Servidor MCP e Instalador de Skills QA 11X

Uso:
  npx -y @sinfallas/mcp-qa-11x@latest                                             Inicia el servidor MCP sobre stdio
  npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts Instala las 5 skills, scripts y conector AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest init-agents                                 Inyecta o actualiza el conector QA 11X en AGENTS.md
  npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents                           Reconcilia y deduplica reglas en .agents/ aislando dominio
  npx -y @sinfallas/mcp-qa-11x@latest --help                                      Muestra esta ayuda

Opciones para install-skill:
  --target, -t <entorno>   auto (defecto) | workspace | antigravity | claude | cursor | hermes | all
  --include-scripts        Instala también scripts operativos y archivos comunes en el proyecto
  --init-agents            Inyecta o actualiza además el conector en AGENTS.md
  --reconcile              Ejecuta reconciliación previa en .agents/ antes de sincronizar reglas

Opciones para init-agents y reconcile-agents:
  --project-path, -p <ruta> Directorio del proyecto destino (defecto: cwd)
  --dry-run                 Simula la operación sin escribir cambios en disco
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
