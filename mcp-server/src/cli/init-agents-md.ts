// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import type { InitAgentsMdOptions, InitAgentsMdResult, InitAgentsAction } from '../types.js';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';
const AGENTS_MD_FILENAME = 'AGENTS.md';
const UTF8 = 'utf-8';
const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const DRY_RUN_FLAG = '--dry-run';
const PROJECT_PATH_FLAG = '--project-path';
const PROJECT_PATH_SHORT_FLAG = '-p';

export type { InitAgentsMdOptions, InitAgentsMdResult, InitAgentsAction };

export function buildConnectorBlock(projectName: string, stacks: string[]): string {
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Central QA 11X Skill & MCP Server Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    '> **OUTPUT LANGUAGE CONSTRAINT:**',
    '> Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.',
    '',
    `This project (\`${projectName}\`) enforces the **Level-11X Quality & DevSecOps Standard** via the centralized MCP Server and Global Skills. Before modifying code, running tests, or closing any task, you **MUST**:`,
    '',
    '1. **Activate Global Skills:** Load `qa-11x-architect` (for all backend, testing, Docker, and DevSecOps tasks) and `refactoring-ui` (for any Vue 3 / React / CSS / UI task).',
    '2. **Enforce Rule Zero & Active Task Resilience:**',
    '   - **Rule Zero:** NEVER run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, migrations, or linters directly on the host OS. Execute everything inside ephemeral Docker containers (`docker-compose.qa.yml` / `Makefile`).',
    '   - **Active Task Invariant:** Track progress in real time inside `.agents/ACTIVE_TASK.md` (`IN_PROGRESS` -> `COMPLETED (100%)`).',
    '3. **Execute Mandatory MCP Tools (`@sinfallas/mcp-qa-11x`):**',
    `   - \`inspect_project_config\` & \`audit_test_pyramid_gaps\`: Diagnose active stacks (\`${stacksLabel}\`) and missing test layers across the 13-layer pyramid.`,
    '   - `inspect_ast_blast_radius`: Audit incoming dependency edges before modifying shared modules.',
    '   - `audit_security_stig_owasp`: Certify 0 `CRITICAL`/`HIGH` findings against the 22 DISA ASD STIG V6R5 & OWASP v4.2 patterns.',
    '   - `run_ephemeral_qa`: Run linters (`--max-warnings 0`), unit tests (`>= 95%` coverage), and Karate Labs BDD scenarios in ephemeral Docker.',
    '   - `certify_11x_gate` & `clean_workspace_11x`: Certify all closure checks and sanitize root-owned container files before `git commit` and `git push`.',
    '   - `propose_skill_evolution_pr` & `reconcile_agents_governance`: MANDATORY QA-ESCAPE POST-MORTEM — Whenever you fix a UAT, integration, or production bug that escaped existing automated tests (even with `>= 95%` coverage), you MUST PROACTIVELY include a section titled `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` in your Spanish response and invoke `propose_skill_evolution_pr` WITHOUT waiting for the user to ask. Isolate project-specific domain rules in `.agents/rules/domain_<project>_rules.md`.',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export function mergeOrAppendAgentsMdContent(
  existingContent: string,
  projectName: string,
  stacks: string[]
): { finalContent: string; action: 'created' | 'appended' | 'updated_block'; changes: string[] } {
  const block = buildConnectorBlock(projectName, stacks);

  // Caso 1: El archivo no existe o está vacío -> Crear desde cero
  if (!existingContent.trim()) {
    const header = `# SPDX-License-Identifier: MIT\n# 🤖 AI Agent Directives & Technical Governance — ${projectName}\n\n`;
    return {
      finalContent: `${header}${block}\n`,
      action: 'created',
      changes: ['Creado archivo AGENTS.md con el conector del ecosistema QA 11X (MCP + Skill).'],
    };
  }

  // Caso 2: Ya existe y ya tiene los marcadores -> Actualizar solo el bloque conector sin tocar el resto
  const startIdx = existingContent.indexOf(CONNECTOR_START_MARKER);
  const endIdx = existingContent.indexOf(CONNECTOR_END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + CONNECTOR_END_MARKER.length);
    return {
      finalContent: `${before}${block}${after}`,
      action: 'updated_block',
      changes: ['Actualizado bloque conector QA 11X en AGENTS.md preservando el contenido existente.'],
    };
  }

  // Caso 3: Ya existe y NO tiene los marcadores -> Agregar al final sin reemplazar nada de lo existente
  const trimmedExisting = existingContent.trimEnd();
  return {
    finalContent: `${trimmedExisting}\n\n---\n\n${block}\n`,
    action: 'appended',
    changes: ['Agregado bloque conector QA 11X al archivo AGENTS.md existente sin reemplazar su contenido.'],
  };
}

export async function initOrAppendAgentsMd(
  options: InitAgentsMdOptions
): Promise<InitAgentsMdResult> {
  const resolvedPath = path.resolve(options.projectPath.normalize('NFKC'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`El directorio especificado no existe: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta especificada no es un directorio: ${resolvedPath}`);
  }

  const inspection = await inspectProjectConfig(resolvedPath);
  const detectedStacks = inspection.detected_stacks;
  const projectName = path.basename(resolvedPath) || 'Project';
  const agentsMdPath = path.join(resolvedPath, AGENTS_MD_FILENAME);

  let existingContent = '';
  if (fs.existsSync(agentsMdPath)) {
    existingContent = fs.readFileSync(agentsMdPath, UTF8);
  }

  const mergeRes = mergeOrAppendAgentsMdContent(existingContent, projectName, detectedStacks);
  const isDryRun = Boolean(options.dryRun);

  if (!isDryRun) {
    fs.writeFileSync(agentsMdPath, mergeRes.finalContent, UTF8);
  }

  return {
    project_path: resolvedPath,
    agents_md_path: agentsMdPath,
    action: isDryRun ? 'dry_run' : mergeRes.action,
    detected_stacks: detectedStacks,
    content: mergeRes.finalContent,
  };
}

export function parseInitAgentsArgs(args: string[]): { projectPath: string; dryRun: boolean } {
  let projectPath = process.cwd();
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === DRY_RUN_FLAG) {
      dryRun = true;
    } else if ((arg === PROJECT_PATH_FLAG || arg === PROJECT_PATH_SHORT_FLAG) && args[i + 1]) {
      projectPath = args[i + 1];
      i++;
    } else if (arg.startsWith(`${PROJECT_PATH_FLAG}=`)) {
      projectPath = arg.split('=')[1];
    } else if (!arg.startsWith('-')) {
      projectPath = arg;
    }
  }

  return { projectPath, dryRun };
}

export async function runInitAgentsCli(args: string[]): Promise<void> {
  const { projectPath, dryRun } = parseInitAgentsArgs(args);

  console.log(DIVIDER);
  console.log('   🔗 Conector AGENTS.md QA 11X (Node.js / MCP CLI)                   ');
  console.log(`${DIVIDER}\n`);

  console.log(`📍 Proyecto objetivo: ${projectPath}`);
  if (dryRun) {
    console.log('🔍 Modo Simulación (--dry-run): no se escribirán cambios en disco.\n');
  }

  const result = await initOrAppendAgentsMd({ projectPath, dryRun });

  const stacksMsg = result.detected_stacks.join(', ') || 'ninguno';
  console.log(`✔ Stacks detectados: ${stacksMsg}`);
  console.log(`✔ Archivo destino: ${result.agents_md_path}`);
  console.log(`✔ Acción ejecutada: ${result.action}`);

  console.log(DIVIDER);
  console.log('   ✅ Proceso de Conexión Finalizado Exitosamente                     ');
  console.log(`${DIVIDER}\n`);
}

export function syncGlobalGeminiMd(
  homeDir: string,
  dryRun = false
): { updated: boolean; geminiMdPath: string } {
  const geminiDir = path.join(homeDir, '.gemini');
  const geminiMdPath = path.join(geminiDir, 'GEMINI.md');
  if (!fs.existsSync(geminiDir)) {
    return { updated: false, geminiMdPath };
  }

  const existing = fs.existsSync(geminiMdPath) ? fs.readFileSync(geminiMdPath, UTF8) : '';
  const mergeRes = mergeOrAppendAgentsMdContent(existing, 'Global User Workspace', ['all']);
  if (!dryRun) {
    fs.writeFileSync(geminiMdPath, mergeRes.finalContent, UTF8);
  }
  return { updated: true, geminiMdPath };
}

