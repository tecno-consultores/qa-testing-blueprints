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
    '> **OUTPUT LANGUAGE & TOKEN ECONOMY:** Interact, explain reasoning, and write commits/docs strictly in **Spanish**. Use *Lazy Rule Loading*: read `.agents/rules/*.md` on-demand only when touching that domain.',
    '',
    `This project (\`${projectName}\`) enforces the **Level-11X Quality & DevSecOps Standard** (stacks: \`${stacksLabel}\`).`,
    '',
    '1. **Dual Execution Path (`DOCS_ONLY` Fast-Path vs. `CODE_CHANGE` Full-Path):**',
    '   - **`DOCS_ONLY` Fast-Path (ONLY `*.md` / `docs/` changed):** DO NOT run test suites (`run_ephemeral_qa`) and DO NOT rebuild AST graphs (`./scripts/actualizar-grafos-graphify.sh`). Only sync docs/`CHANGELOG.md`, run `certify_11x_gate`, and push to `git`.',
    '   - **`CODE_CHANGE` Full-Path (source code, templates, scripts, or configs changed):** Execute all 11 steps below inside ephemeral Docker (**Rule Zero** — never run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, or linters on host OS).',
    '2. **Skills & MCP Tools (`@sinfallas/mcp-qa-11x`):** Load `qa-11x-architect` (backend/QA/DevSecOps) and `refactoring-ui` (UI/CSS). Use `inspect_project_config`, `audit_test_pyramid_gaps`, `inspect_ast_blast_radius`, `audit_security_stig_owasp`, `run_ephemeral_qa` (`skip_if_docs_only: true` supported), `certify_11x_gate`, `clean_workspace_11x`, `reconcile_agents_governance`, and `propose_skill_evolution_pr` (on QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr`).',
    '3. **Mandatory 11-Step Execution & Closure Workflow (Non-Negotiable for Code Changes):**',
    '   - **Step 1 (Plan):** Invoke `/plan` or plan artifact before modifying code.',
    '   - **Step 2 (Active Task):** Track real-time progress (`- [ ]` -> `- [x]`) in `.agents/ACTIVE_TASK.md`.',
    '   - **Step 3 (Pre-Change AST Graph):** Check blast radius (`inspect_ast_blast_radius`); if `graphify-out/graph.json` is missing, create it first via `./scripts/actualizar-grafos-graphify.sh`.',
    '   - **Step 4 (Governance & Cleanup):** Sync `AGENTS.md`, `.agents/`, `scripts/limpieza.sh`, and `.gitignore`.',
    '   - **Step 5 (11X Tests + Karate Labs):** Create unit (`>= 95%` coverage), integration, and **Karate Labs BDD (`.feature`)** tests.',
    '   - **Step 6 (Full Suite Execution):** Run all suites in ephemeral Docker (`Rule Zero` / `run_ephemeral_qa`, 0 warnings).',
    '   - **Step 7–9 (Docs, Changelog & Roadmap):** Sync `docs/specs/`, `README.md`, `TESTING.md`, `CHANGELOG.md`, and `ROADMAP.md`.',
    '   - **Step 10 (Post-Change AST Graph):** Run `./scripts/actualizar-grafos-graphify.sh` (incremental per modified stack).',
    '   - **Step 11 (Certify & Push):** Run `certify_11x_gate` and `clean_workspace_11x`, mark `.agents/ACTIVE_TASK.md` `COMPLETED (100%)`, and `git push`.',
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

