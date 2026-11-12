// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import type {
  InitAgentsMdOptions,
  InitAgentsMdResult,
  InitAgentsAction,
  OutputLanguageMode,
} from '../types.js';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';
const AGENTS_MD_FILENAME = 'AGENTS.md';
const UTF8 = 'utf-8';
const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const DRY_RUN_FLAG = '--dry-run';
const PROJECT_PATH_FLAG = '--project-path';
const PROJECT_PATH_SHORT_FLAG = '-p';
const LANG_FLAG = '--lang';
const LANG_SHORT_FLAG = '-l';

export type { InitAgentsMdOptions, InitAgentsMdResult, InitAgentsAction, OutputLanguageMode };

export function buildLanguagePolicyLine(lang: OutputLanguageMode): string {
  switch (lang) {
    case 'es':
      return 'Interact, explain reasoning, and write commits/docs strictly in **Spanish** (while keeping `AGENTS.md` and `.agents/**` in concise English for token economy).';
    case 'en':
      return 'Interact, explain reasoning, and write commits/docs strictly in **English**.';
    case 'auto':
    default:
      return "Interact and explain reasoning in the **user's prompt language**; write commit messages and human-facing docs matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to prompt language on empty repos).";
  }
}

export function buildConnectorBlock(
  projectName: string,
  stacks: string[],
  lang: OutputLanguageMode = 'auto'
): string {
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Central QA 11X Skill & MCP Server Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    `> **OUTPUT LANGUAGE & HIGH-IQ TOKEN ECONOMY:** ${buildLanguagePolicyLine(lang)} Apply *3-Tier Progressive Disclosure* (load global skill \`references/*.md\` and local \`.agents/rules/domain_*.md\` on-demand only), *Graphify AST-First & Windowed-Read-Second* (for ANY code/architecture Q&A or pre-change, query \`graphify-out/graph.json\` & \`GRAPH_REPORT.md\` via \`inspect_ast_blast_radius\` / \`inspect_blast_radius.py\` BEFORE \`grep\` or \`read_file\` with \`StartLine\`/\`EndLine\` 40–80 lines; never read full files \`>150\` lines blindly), *Zero Redundant Re-Read*, *Parallel Tool Batching*, and *Subagent Context Isolation* (\`<=20\` line summary return).`,
    '',
    `This project (\`${projectName}\`) enforces the **Level-11X Quality & DevSecOps Standard** (stacks: \`${stacksLabel}\`).`,
    '',
    '1. **3-Path Proportional Execution (`DOCS_ONLY` vs. `MICRO_CHANGE` vs. `CODE_CHANGE` / `FULL_11X`):**',
    '   - **`DOCS_ONLY` Fast-Path (ONLY `*.md` / `docs/` changed):** DO NOT run test suites (`run_ephemeral_qa`) and DO NOT rebuild AST graphs (`./scripts/actualizar-grafos-graphify.sh`). Only sync docs/`CHANGELOG.md`, run `certify_11x_gate`, and push to `git`.',
    '   - **`MICRO_CHANGE` Surgical-Path (`<= 3` files, 0 new API/ORM changes, `LOW` AST Blast Radius `< 5` callers):** Use an inline 3-line plan, run `inspect_ast_blast_radius`, execute affected stack `run_ephemeral_qa` in Docker (**Rule Zero**), update stack AST graph, sync `CHANGELOG.md`, run `certify_11x_gate`, and `git push`.',
    '   - **`CODE_CHANGE` (`FULL_11X`) Architectural-Path (`> 3` files, new API/UI, ORM migrations, security, or `MED`/`HIGH` Blast Radius):** Execute all 11 steps below inside ephemeral Docker (**Rule Zero** — never run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, or linters on host OS).',
    '2. **Global Corporate Skills & MCP Tools (`@sinfallas/mcp-qa-11x`):** Consume the 5 global skills (`qa-11x-architect`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`) without duplicating them in local `.agents/skills/`. Use `inspect_project_config`, `audit_test_pyramid_gaps`, `inspect_ast_blast_radius`, `audit_security_stig_owasp`, `run_ephemeral_qa` (`skip_if_docs_only: true` supported), `certify_11x_gate`, `clean_workspace_11x`, `reconcile_agents_governance`, and `propose_skill_evolution_pr` (on QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr`).',
    '3. **Mandatory 11-Step Execution & Closure Workflow (Non-Negotiable for Architectural Code Changes):**',
    '   - **Step 1 (Plan):** Invoke `/plan` or plan artifact before modifying code.',
    '   - **Step 2 (Active Task):** Track real-time progress (`- [ ]` -> `- [x]`) in `.agents/ACTIVE_TASK.md` (compact `<= 40 lines`).',
    '   - **Step 3 (AST Graph Q&A & Pre-Change):** Query `inspect_ast_blast_radius` (`inspect_blast_radius.py`); if `graphify-out/graph.json` is missing, create it first via `./scripts/actualizar-grafos-graphify.sh`.',
    '   - **Step 4 (Governance & Cleanup):** Sync `AGENTS.md`, `.agents/`, `scripts/limpieza.sh`, and `.gitignore`.',
    '   - **Step 5 (11X Tests + Karate Labs):** Create unit (`>= 95%` coverage), integration, and **Karate Labs BDD (`.feature`)** tests.',
    '   - **Step 6 (Full Suite Execution):** Run all suites in ephemeral Docker (`Rule Zero` / `run_ephemeral_qa`, 0 warnings).',
    '   - **Step 7–9 (Docs, Changelog & Roadmap):** Sync `docs/specs/`, `README.md`, `TESTING.md`, `CHANGELOG.md`, and `ROADMAP.md`.',
    '   - **Step 10 (Post-Change AST Graph):** Run `./scripts/actualizar-grafos-graphify.sh` (incremental per modified stack).',
    '   - **Step 11 (Certify & Push):** Run `certify_11x_gate` and `clean_workspace_11x`, mark `.agents/ACTIVE_TASK.md` `COMPLETED (100%)` (suggest `/compact`), and `git push`.',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export function buildGlobalGeminiBlock(lang: OutputLanguageMode = 'auto'): string {
  if (lang === 'es') {
    return [
      CONNECTOR_START_MARKER,
      '## 🤖 Conector Global Thin-Client QA 11X (`@sinfallas/mcp-qa-11x`)',
      '',
      '- **Idioma y Economía Cognitiva:** Interactuar, razonar y escribir commits/documentación estrictamente en **Español**. Aplicar *3-Tier Progressive Disclosure*, lecturas acotadas (`StartLine`/`EndLine` 40–80 líneas; prohibido leer archivos `>150` líneas a ciegas), *Zero Redundant Re-Read*, *Parallel Tool Batching* y aislamiento de subagentes (`<=20` líneas).',
      '- **Graphify AST-First (Consultas de Código Q&A y Pre-Cambio):** Ante **cualquier pregunta sobre el código o arquitectura de un proyecto** o antes de modificar código, activar `graphify-ast-navigator` y consultar **SIEMPRE primero** el grafo AST (`inspect_ast_blast_radius` / `python3 .agents/scripts/inspect_blast_radius.py` y `graphify-out/GRAPH_REPORT.md`; si `graphify-out/graph.json` no existe, generarlo con `./scripts/actualizar-grafos-graphify.sh`) antes de usar `grep` o `read_file`.',
      '- **Consumo Global sin Duplicación (Skills + MCP `qa-11x`):** Consumir los protocolos `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`, **Rule Zero** (ejecución efímera en Docker vía `run_ephemeral_qa`), auditoría de seguridad (`audit_security_stig_owasp`), certificación (`certify_11x_gate`), poda de duplicados (`reconcile_agents_governance`) y evolución continua (`propose_skill_evolution_pr`) directamente desde las skills globales instaladas (`qa-11x-architect`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`) sin duplicar reglas ni skills en los proyectos locales.',
      CONNECTOR_END_MARKER,
    ].join('\n');
  }

  const langDirective =
    lang === 'en'
      ? 'Interact, explain reasoning, and write commits/docs strictly in **English**.'
      : "Interact and explain reasoning in the **user's prompt language**; write commit messages and human-facing docs matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to prompt language on empty repos).";

  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Global Thin-Client QA 11X Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    `- **Language & High-IQ Token Economy:** ${langDirective} Apply *3-Tier Progressive Disclosure*, bounded windowed reads (\`StartLine\`/\`EndLine\` 40–80 lines; never read files \`>150\` lines blindly), *Zero Redundant Re-Read*, *Parallel Tool Batching*, and subagent isolation (\`<=20\` lines).`,
    '- **Graphify AST-First (Code Q&A & Pre-Change):** For **ANY question regarding project code or architecture** or before modifying code, activate `graphify-ast-navigator` and **ALWAYS query the AST knowledge graph first** (`inspect_ast_blast_radius` / `python3 .agents/scripts/inspect_blast_radius.py` and `graphify-out/GRAPH_REPORT.md`; if `graphify-out/graph.json` is missing, build it with `./scripts/actualizar-grafos-graphify.sh`) before using `grep` or `read_file`.',
    '- **Zero-Duplication Global Consumption (Skills + MCP `qa-11x`):** Consume `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X` workflows, **Rule Zero** (ephemeral Docker execution via `run_ephemeral_qa`), security audits (`audit_security_stig_owasp`), gate certification (`certify_11x_gate`), governance reconciliation (`reconcile_agents_governance`), and continuous evolution (`propose_skill_evolution_pr`) directly from installed global skills (`qa-11x-architect`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`) without duplicating rules or skills into local projects.',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export function mergeOrAppendAgentsMdContent(
  existingContent: string,
  projectName: string,
  stacks: string[],
  lang: OutputLanguageMode = 'auto'
): { finalContent: string; action: 'created' | 'appended' | 'updated_block'; changes: string[] } {
  const block = buildConnectorBlock(projectName, stacks, lang);

  // Caso 1: El archivo no existe o está vacío -> Crear desde cero
  if (!existingContent.trim()) {
    const header = `# SPDX-License-Identifier: MIT\n# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)\n\n# 🤖 AI Agent Directives & Technical Governance — ${projectName}\n\n`;
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

  const lang = options.lang ?? 'auto';
  const mergeRes = mergeOrAppendAgentsMdContent(existingContent, projectName, detectedStacks, lang);
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

function resolveLangOption(rawLang: string | undefined): OutputLanguageMode {
  const normalizedRaw = rawLang && rawLang !== 'undefined' ? rawLang : 'auto';
  const selectedLang = normalizedRaw.trim().toLowerCase();
  if (selectedLang !== 'auto' && selectedLang !== 'es' && selectedLang !== 'en') {
    throw new Error(`Modo de idioma no válido: '${rawLang}'. Valores permitidos: auto, es, en.`);
  }
  return selectedLang as OutputLanguageMode;
}

function extractOptionValue(
  args: string[],
  index: number,
  longFlag: string,
  shortFlag: string
): { value: string; consumed: number } | null {
  const arg = args[index];
  if (arg.startsWith(`${longFlag}=`)) {
    return { value: arg.slice(longFlag.length + 1), consumed: 0 };
  }
  if ((arg === longFlag || arg === shortFlag) && args[index + 1]) {
    return { value: args[index + 1], consumed: 1 };
  }
  return null;
}

export function parseInitAgentsArgs(args: string[]): {
  projectPath: string;
  dryRun: boolean;
  lang: OutputLanguageMode;
} {
  let projectPath = process.cwd();
  let dryRun = false;
  let rawLang: string | undefined = process.env.QA_OUTPUT_LANG;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === DRY_RUN_FLAG) {
      dryRun = true;
    } else {
      const pathOpt = extractOptionValue(args, i, PROJECT_PATH_FLAG, PROJECT_PATH_SHORT_FLAG);
      if (pathOpt) {
        projectPath = pathOpt.value;
        i += pathOpt.consumed;
      } else {
        const langOpt = extractOptionValue(args, i, LANG_FLAG, LANG_SHORT_FLAG);
        if (langOpt) {
          rawLang = langOpt.value;
          i += langOpt.consumed;
        } else if (!arg.startsWith('-')) {
          projectPath = arg;
        }
      }
    }
  }

  return { projectPath, dryRun, lang: resolveLangOption(rawLang) };
}

export async function runInitAgentsCli(args: string[]): Promise<void> {
  const { projectPath, dryRun, lang } = parseInitAgentsArgs(args);

  console.log(DIVIDER);
  console.log('   🔗 Conector AGENTS.md QA 11X (Node.js / MCP CLI)                   ');
  console.log(`${DIVIDER}\n`);

  console.log(`📍 Proyecto objetivo: ${projectPath}`);
  console.log(`🌐 Política de idioma (--lang): ${lang}`);
  if (dryRun) {
    console.log('🔍 Modo Simulación (--dry-run): no se escribirán cambios en disco.\n');
  }

  const result = await initOrAppendAgentsMd({ projectPath, dryRun, lang });

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
  dryRun = false,
  lang: OutputLanguageMode = 'auto'
): { updated: boolean; geminiMdPath: string } {
  const geminiDir = path.join(homeDir, '.gemini');
  const geminiMdPath = path.join(geminiDir, 'GEMINI.md');
  if (!fs.existsSync(geminiDir)) {
    return { updated: false, geminiMdPath };
  }

  const existing = fs.existsSync(geminiMdPath) ? fs.readFileSync(geminiMdPath, UTF8) : '';
  const block = buildGlobalGeminiBlock(lang);
  let finalContent: string;

  if (!existing.trim()) {
    const header =
      '# SPDX-License-Identifier: MIT\n# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)\n\n# 🤖 Global AI Agent Directives — QA 11X Standard (`@sinfallas/mcp-qa-11x`)\n\n';
    finalContent = `${header}${block}\n`;
  } else {
    const startIdx = existing.indexOf(CONNECTOR_START_MARKER);
    const endIdx = existing.indexOf(CONNECTOR_END_MARKER);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const before = existing.slice(0, startIdx);
      const after = existing.slice(endIdx + CONNECTOR_END_MARKER.length);
      finalContent = `${before}${block}${after}`;
    } else {
      finalContent = `${existing.trimEnd()}\n\n---\n\n${block}\n`;
    }
  }

  if (!dryRun) {
    fs.writeFileSync(geminiMdPath, finalContent, UTF8);
  }
  return { updated: true, geminiMdPath };
}

