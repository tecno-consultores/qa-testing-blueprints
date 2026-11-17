// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OutputLanguageMode } from '../types.js';

const UTF8 = 'utf-8';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';

export type ConnectorLang = OutputLanguageMode;
export type ConnectorMergeAction = 'created' | 'appended' | 'updated_block';

export interface DelimitedSectionSpec {
  readonly startMarker: string;
  readonly endMarker: string;
  readonly block: string;
  readonly emptyDocument: string;
  readonly appendSeparator: string;
}

export function resolveProjectDisplayName(resolvedPath: string): string {
  return path.basename(resolvedPath) || 'Project';
}

export function replaceDelimitedSection(
  existingContent: string,
  spec: DelimitedSectionSpec
): { finalContent: string; action: ConnectorMergeAction } {
  const { startMarker, endMarker, block, emptyDocument, appendSeparator } = spec;
  if (!existingContent.trim()) {
    return { finalContent: emptyDocument, action: 'created' };
  }
  const startIdx = existingContent.indexOf(startMarker);
  const endIdx = existingContent.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + endMarker.length);
    return { finalContent: `${before}${block}${after}`, action: 'updated_block' };
  }
  const trimmed = existingContent.trimEnd();
  return { finalContent: `${trimmed}${appendSeparator}${block}\n`, action: 'appended' };
}

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

export function buildThinConnectorBlock(
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
    '   - **`DOCS_ONLY` Fast-Path (ONLY `*.md` / `docs/` changed):** DO NOT run test suites (`run_ephemeral_qa`) and DO NOT rebuild AST graphs (`./scripts/actualizar-grafos-graphify.sh`). Only sync docs/`CHANGELOG.md`, run `certify_11x_gate`, and create a certified local `git commit` (NEVER run `git push` without explicit human authorization under `QA-GIT-GATE-01`).',
    '   - **`MICRO_CHANGE` Surgical-Path (`<= 3` files, 0 new API/ORM changes, `LOW` AST Blast Radius `< 5` callers):** Use an inline 3-line plan, run `inspect_ast_blast_radius`, create/update affected existing unit, integration, and BDD tests (`QA-TEST-SYNC-01`), execute affected stack `run_ephemeral_qa` in Docker (**Rule Zero**), update stack AST graph, sync `CHANGELOG.md`, run `certify_11x_gate`, and create a certified local `git commit` (`QA-GIT-GATE-01`).',
    '   - **`CODE_CHANGE` (`FULL_11X`) Architectural-Path (`> 3` files, new API/UI, ORM migrations, security, or `MED`/`HIGH` Blast Radius):** Execute all 11 steps below inside ephemeral Docker (**Rule Zero** — never run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, or linters on host OS).',
    '2. **Global Corporate Skills & MCP Tools (`@sinfallas/mcp-qa-11x`):** Consume the 11 modular global skills (`qa-11x-architect`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`, `tactical-patterns-11x`) without duplicating them in local `.agents/skills/`. Use `inspect_project_config`, `audit_test_pyramid_gaps`, `inspect_ast_blast_radius`, `audit_security_stig_owasp`, `run_ephemeral_qa` (`skip_if_docs_only: true` supported), `certify_11x_gate`, `clean_workspace_11x`, `reconcile_agents_governance`, `session_flight_recorder`, and `propose_skill_evolution_pr` (on QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr`).',
    '3. **Mandatory 11-Step Execution & Closure Workflow (Non-Negotiable for Architectural Code Changes):**',
    '   - **Step 1 (Plan):** Invoke `/plan` or plan artifact before modifying code.',
    '   - **Step 2 (Atomic Flight Recorder):** Persist session state via `session_flight_recorder` (never manually edit projected `.agents/ACTIVE_TASK.md` `<= 40 lines`).',
    '   - **Step 3 (AST Graph Q&A & Pre-Change):** Query `inspect_ast_blast_radius` (`inspect_blast_radius.py`); if `graphify-out/graph.json` is missing, create it first via `./scripts/actualizar-grafos-graphify.sh`.',
    '   - **Step 4 (Governance & Cleanup):** Sync `AGENTS.md`, `.agents/`, `scripts/limpieza.sh`, and `.gitignore`.',
    '   - **Step 5 (11X Tests, Co-Evolution `QA-TEST-SYNC-01` + Karate Labs):** Create new tests AND audit/update all affected pre-existing unit (`>= 95%` coverage), integration, BATS, and **Karate Labs BDD (`.feature`)** tests/counts/contracts (`QA-TEST-SYNC-01`).',
    '   - **Step 6 (Full Suite Execution):** Run all suites in ephemeral Docker (`Rule Zero` / `run_ephemeral_qa`, 0 warnings).',
    '   - **Step 7–9 (Docs, Changelog & Roadmap):** Sync `docs/specs/`, `README.md`, `TESTING.md`, `CHANGELOG.md`, and `ROADMAP.md`.',
    '   - **Step 10 (Post-Change AST Graph):** Run `./scripts/actualizar-grafos-graphify.sh` (incremental per modified stack).',
    '   - **Step 11 (Certify & Local Commit — `QA-GIT-GATE-01`):** Run `certify_11x_gate` and `clean_workspace_11x`, mark `.agents/ACTIVE_TASK.md` `CERTIFIED_CLEAN` via `session_flight_recorder` / `checkpoint_ctl.py` (suggest `/compact`), and create a certified local `git commit` (NEVER `git push` automatically).',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

export const buildConnectorBlock = buildThinConnectorBlock;

export function buildGlobalGeminiBlock(lang: OutputLanguageMode = 'auto'): string {
  if (lang === 'es') {
    return [
      CONNECTOR_START_MARKER,
      '## 🤖 Conector Global Thin-Client QA 11X (`@sinfallas/mcp-qa-11x`)',
      '',
      '- **Idioma y Economía Cognitiva:** Interactuar, razonar y escribir commits/documentación estrictamente en **Español**. Aplicar *3-Tier Progressive Disclosure*, lecturas acotadas (`StartLine`/`EndLine` 40–80 líneas; prohibido leer archivos `>150` líneas a ciegas), *Zero Redundant Re-Read*, *Parallel Tool Batching* y aislamiento de subagentes (`<=20` líneas).',
      '- **Graphify AST-First (Consultas de Código Q&A y Pre-Cambio):** Ante **cualquier pregunta sobre el código o arquitectura de un proyecto** o antes de modificar código, activar `graphify-ast-navigator` y consultar **SIEMPRE primero** el grafo AST (`inspect_ast_blast_radius` / `python3 .agents/scripts/inspect_blast_radius.py` y `graphify-out/GRAPH_REPORT.md`; si `graphify-out/graph.json` no existe, generarlo con `./scripts/actualizar-grafos-graphify.sh`) antes de usar `grep` o `read_file`.',
      '- **Consumo Global sin Duplicación (Skills + MCP `qa-11x`):** Consumir los protocolos `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`, **Rule Zero** (ejecución efímera en Docker vía `run_ephemeral_qa`), auditoría de seguridad (`audit_security_stig_owasp`), certificación (`certify_11x_gate`), poda de duplicados (`reconcile_agents_governance`) y evolución continua (`propose_skill_evolution_pr`) directamente desde las 11 skills globales instaladas (`qa-11x-architect`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`, `tactical-patterns-11x`) sin duplicar reglas ni skills en los proyectos locales.',
      '- **Co-Evolución Obligatoria de Pruebas (`QA-TEST-SYNC-01`):** Al modificar código, esquemas, configuraciones, skills o catálogos, **auditar, actualizar y re-ejecutar SIEMPRE todas las pruebas preexistentes afectadas** (unitarias, integración, BATS y Karate BDD `.feature`) además de crear pruebas nuevas, sin debilitar aserciones válidas.',
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
    '- **Zero-Duplication Global Consumption (Skills + MCP `qa-11x`):** Consume `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X` workflows, **Rule Zero** (ephemeral Docker execution via `run_ephemeral_qa`), security audits (`audit_security_stig_owasp`), gate certification (`certify_11x_gate`), governance reconciliation (`reconcile_agents_governance`), and continuous evolution (`propose_skill_evolution_pr`) directly from the 11 installed global skills (`qa-11x-architect`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`, `tactical-patterns-11x`) without duplicating rules or skills into local projects.',
    '- **Mandatory Test Co-Evolution (`QA-TEST-SYNC-01`):** Whenever modifying code, schemas, configs, skills, or catalogs, **ALWAYS audit, update, and re-run all affected pre-existing** unit, integration, BATS, and Karate BDD (`.feature`) tests alongside creating new tests, never leaving stale contract counts or weakening valid assertions.',
    CONNECTOR_END_MARKER,
  ].join('\n');
}

const MERGE_CHANGE_MESSAGES: Readonly<Record<ConnectorMergeAction, string>> = Object.freeze({
  created: 'Creado archivo AGENTS.md con el conector del ecosistema QA 11X (MCP + Skill).',
  updated_block: 'Actualizado bloque conector QA 11X en AGENTS.md preservando el contenido existente.',
  appended: 'Agregado bloque conector QA 11X al archivo AGENTS.md existente sin reemplazar su contenido.',
});

export function mergeOrAppendAgentsMdContent(
  existingContent: string,
  projectName: string,
  stacks: string[],
  lang: OutputLanguageMode = 'auto'
): { finalContent: string; action: ConnectorMergeAction; changes: string[] } {
  const block = buildThinConnectorBlock(projectName, stacks, lang);
  const header = `# SPDX-License-Identifier: MIT\n<!-- QA-11X Standard Governance -->\n\n# 🤖 AI Agent Directives & Technical Governance — ${projectName}\n\n`;
  const result = replaceDelimitedSection(existingContent, {
    startMarker: CONNECTOR_START_MARKER,
    endMarker: CONNECTOR_END_MARKER,
    block,
    emptyDocument: `${header}${block}\n`,
    appendSeparator: '\n\n---\n\n',
  });
  return {
    finalContent: result.finalContent,
    action: result.action,
    changes: [MERGE_CHANGE_MESSAGES[result.action]],
  };
}

export function mergeGlobalGeminiContent(
  existingContent: string,
  lang: OutputLanguageMode = 'auto'
): string {
  const block = buildGlobalGeminiBlock(lang);
  const header =
    '# SPDX-License-Identifier: MIT\n<!-- QA-11X Standard Governance -->\n\n# 🤖 Global AI Agent Directives — QA 11X Standard (`@sinfallas/mcp-qa-11x`)\n\n';
  return replaceDelimitedSection(existingContent, {
    startMarker: CONNECTOR_START_MARKER,
    endMarker: CONNECTOR_END_MARKER,
    block,
    emptyDocument: `${header}${block}\n`,
    appendSeparator: '\n\n---\n\n',
  }).finalContent;
}

export const buildAgentsMdConnectorBlock = buildThinConnectorBlock;
export const mergeAgentsMdContent = mergeOrAppendAgentsMdContent;

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
  const finalContent = mergeGlobalGeminiContent(existing, lang);

  if (!dryRun) {
    fs.writeFileSync(geminiMdPath, finalContent, UTF8);
  }
  return { updated: true, geminiMdPath };
}
