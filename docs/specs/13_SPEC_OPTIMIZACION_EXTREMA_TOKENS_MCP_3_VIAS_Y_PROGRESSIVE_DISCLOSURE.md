# ⚡ Especificación Técnica 13: Optimización Extrema de Tokens en Servidor MCP, Protocolo de 3 Vías Proporcionales (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), *Progressive Disclosure* y Economía Cognitiva (`Hito 14`)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (Hito 14):** `mcp-server/src/types.ts`, `mcp-server/src/server.ts`, `mcp-server/src/tools/fetch-bundle.ts`, `mcp-server/src/tools/security-auditor.ts`, `mcp-server/src/tools/test-pyramid-auditor.ts`, `mcp-server/src/tools/blast-radius.ts`, `mcp-server/src/cli/init-agents-md.ts`, `mcp-server/src/cli/install-skill.ts`, `mcp-server/src/cli/reconcile-agents.ts`, `mcp-server/tests/*.unit.ts`, `mcp-server/test/mcp_cli_test.feature`  
**Modelo Ejecutor Objetivo:** Gemini 3.8 Flash High  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 14)

---

## 1. Propósito y Diagnóstico Empírico de Consumo de Tokens

En flujos de trabajo con agentes de codificación autónomos (Google Antigravity, Anthropic Claude Code, Cursor, Hermes Agent), entre el **85% y el 90% del consumo de tokens** proviene de la re-lectura acumulada del historial de conversación en cada turno ($O(N^2)$) y del volcado de payloads JSON masivos desde herramientas MCP o lecturas completas de archivos.

La auditoría del repositorio identificó dos dimensiones complementarias de optimización sin pérdida de inteligencia:

1. **Dimensión A — Adelgazamiento del Uso de la Herramienta en Sí (`@sinfallas/mcp-qa-11x` y `.agents/`):**
   - **Fuga #1 (`fetch_blueprint_bundle`):** Al invocar `fetchBlueprintBundle(stack, true)`, la herramienta devolvía en el campo `content` el texto íntegro de todas las plantillas, los 7 archivos de reglas, los scripts y las 5 skills con sus 15 referencias (**~50,000 a ~60,000 tokens en una sola llamada MCP**), a pesar de que `GitHubFetcher` ya los almacena y verifica con SHA-256 en `~/.cache/qa-11x-blueprints/files/`.
   - **Fuga #2 (Arreglos sin truncar ni agrupar en `audit_security_stig_owasp`, `audit_test_pyramid_gaps` e `inspect_ast_blast_radius`):** En proyectos medianos, `findings`, `orphan_source_files`, `untested_api_endpoints`, `untested_ui_views` y `dependent_files` devuelven cientos de elementos con cadenas repetidas de `message` y `remediation` (**~8,000 a ~20,000 tokens**).
   - **Fuga #3 (Doble instalación local + global en `install-skill`):** En modo `auto`, `resolveAutoTargets` instalaba los 20 archivos de las 5 skills simultáneamente en `~/.gemini/config/skills` y en `<proyecto>/.agents/skills`, duplicando el índice de descubrimiento de skills en el IDE.
   - **Fuga #4 (Rigidez Binaria `DOCS_ONLY` vs. `CODE_CHANGE`):** Un micro-cambio de `<= 3` archivos con radio de impacto `LOW` obligaba a ejecutar los 11 pasos completos, multiplicando el número de turnos y re-lecturas de contexto.

2. **Dimensión B — Protocolo de Economía Cognitiva en la Skill (`qa-11x-architect`):**
   - Ya incorporado en `.agents/skills/qa-11x-architect/SKILL.md` (Sección 2.2: *High-IQ Token Economy & Context Engineering Protocol*) y en `.agents/rules/*.md`:
     1. `AST/Grep-First, Windowed-Read-Second` (lecturas por rango `StartLine`/`EndLine` de 40–80 líneas; prohibido leer archivos `> 150` líneas completos a ciegas).
     2. `Zero Redundant Re-Read Invariant` (prohibido releer archivos no modificados externamente en la misma sesión).
     3. `Parallel Tool Call Batching` (agrupación de lecturas/validaciones independientes en 1 solo turno paralelo).
     4. `Subagent Context Isolation & Model Cascading` (delegación de exploración `> 4` archivos a subagente con retorno estricto `<= 20` líneas y punteros `archivo:línea`).
     5. `Pass-Quiet & RTK Terminal Filtering` (`git status -s`, `git diff --stat`, `--tb=short -q`, cero llamadas MCP redundantes).
     6. `Surgical Diff Edits & Compact ACTIVE_TASK.md (<= 40 lines)` + sugerencia de `/compact` al cierre.

---

## 2. Mapa de Impacto AST (Graphify Knowledge Graph — `mcp-server/graphify-out/graph.json`)

De acuerdo con el grafo semántico AST de `mcp-server/` (`442 nodos`, `1058 aristas`, `13 comunidades` en `mcp-server/graphify-out/GRAPH_REPORT.md`) y la ejecución de `python3 .agents/scripts/inspect_blast_radius.py`:

| Símbolo / Función Objetivo | Comunidad AST / Centralidad | Llamadores Directos | Archivos Afectados | Nivel de Riesgo | Suites de Prueba a Actualizar y Ejecutar |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`fetchBlueprintBundle()`** (`src/tools/fetch-bundle.ts`) | Comunidad 7 (`createMcpServer`, cohesión `0.18`) | `4` | `3` (`src/server.ts`, `src/tools/fetch-bundle.ts`, `tests/tools-and-resources.unit.ts`) | 🟡 MODERADO | `tests/tools-and-resources.unit.ts` |
| **`auditSecurityStigOwasp()`** (`src/tools/security-auditor.ts`) | Comunidad 1 (`security-auditor.ts`, cohesión `0.07`) | `7` | `5` (`src/server.ts`, `src/tools/certify-gate.ts`, `tests/security-auditor.unit.ts`, `tests/edge-cases.unit.ts`) | 🔴 ALTO / CRÍTICO | `tests/security-auditor.unit.ts`, `tests/certify-gate.unit.ts`, `tests/edge-cases.unit.ts` |
| **`auditTestPyramidGaps()`** (`src/tools/test-pyramid-auditor.ts`) | Comunidad 0 (**God Node #3** con `23` aristas) | `4` | `3` (`src/server.ts`, `src/tools/test-pyramid-auditor.ts`, `tests/test-pyramid-auditor.unit.ts`) | 🟡 MODERADO | `tests/test-pyramid-auditor.unit.ts` |
| **`inspectAstBlastRadius()`** (`src/tools/blast-radius.ts`) | Comunidad 10 (`blast-radius.ts`, cohesión `0.19`) | `4` | `3` (`src/server.ts`, `src/tools/blast-radius.ts`, `tests/tools-and-resources.unit.ts`) | 🟡 MODERADO | `tests/tools-and-resources.unit.ts` |
| **`initOrAppendAgentsMd()` / `buildConnectorBlock()`** (`src/cli/init-agents-md.ts`) | Comunidad 3 (`install-skill.ts`, cohesión `0.11`) | `7` | `4` (`src/cli/init-agents-md.ts`, `src/cli/install-skill.ts`, `src/server.ts`, `tests/init-agents-md.unit.ts`) | 🟡 MODERADO | `tests/init-agents-md.unit.ts`, `tests/surgical-merger.unit.ts` |
| **`runInstallSkillCli()`** (`src/cli/install-skill.ts`) | Comunidad 3 (**God Node #9** con `14` aristas) | `3` | `3` (`src/index.ts`, `src/cli/install-skill.ts`, `tests/tools-and-resources.unit.ts`) | 🟡 MODERADO | `tests/tools-and-resources.unit.ts` |

> **DIRECTIVAS CRÍTICAS DE IMPLEMENTACIÓN PARA GEMINI 3.8 FLASH HIGH (HITO 14):**
> 1. **Cero Advertencias de Linter (`--max-warnings 0`):** En `mcp-server/`, ESLint ejecuta `eslint-plugin-sonarjs` y `eslint-plugin-security`. Cualquier warning rompe el build.
> 2. **Complejidad Cognitiva (`sonarjs/cognitive-complexity <= 15`):** Mantén cada función auxiliar pequeña y modular tal como se especifica a continuación.
> 3. **Cero Cadenas Duplicadas (`sonarjs/no-duplicate-string`):** Declara constantes en la parte superior del módulo si una cadena literal de `>= 10` caracteres se repite 3 o más veces.
> 4. **Compatibilidad Regresiva 100% con Suites Existentes:** Los nuevos parámetros deben tener valores por defecto que no rompan las llamadas directas de las suites unitarias existentes (`tests/*.unit.ts`), o bien diferenciar el modo compacto por defecto en la capa MCP (`server.ts`) / opciones opcionales.

---

## 3. Contratos en `mcp-server/src/types.ts` (Tarea 14.1)

En `mcp-server/src/types.ts`:

### 3.1. Actualizar `FetchBundleInputSchema` y `FetchedFileItem`
Permitir `include_content` opcional (por defecto `false` cuando lo invoca el LLM vía MCP para ahorrar ~50,000 tokens, pero conservando `content` en `FetchedFileItem` o devolviendo metadatos compactos con `size_bytes` y `cached_path`):

```typescript
export const FetchBundleInputSchema = z.object({
  stack: StackNameSchema.describe('Nombre del stack tecnológico a descargar.'),
  include_common_and_agents: z
    .boolean()
    .default(true)
    .describe('Incluir archivos comunes (.trivy, lefthook) y reglas .agents/.'),
  include_content: z
    .boolean()
    .default(false)
    .describe(
      'Si es false (por defecto para ahorro extremo de tokens), verifica SHA-256 en caché local y devuelve metadatos sin volcar el texto crudo de cada archivo al contexto.'
    ),
});

export interface FetchedFileItem {
  path: string;
  target_name: string;
  merge_strategy: MergeStrategy;
  content: string;
  sha256_verified: boolean;
  size_bytes?: number;
  cached_path?: string;
}
```

### 3.2. Actualizar `BlastRadiusInputSchema`, `BlastRadiusResult`, `AuditSecurityInputSchema`, `SecurityAuditResult` y `AuditTestPyramidInputSchema`

Añadir soporte de truncado inteligente (`max_items` / `max_findings`) y agrupación por regla (`grouped_findings`):

```typescript
export const BlastRadiusInputSchema = z.object({
  project_path: z.string().min(1).describe('Ruta al directorio raíz del proyecto.'),
  target_symbol: z
    .string()
    .min(1)
    .describe('Nombre del archivo, clase o función que se planea modificar.'),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Máximo de archivos dependientes a listar en el arreglo (ahorro de tokens).'),
});

export interface BlastRadiusResult {
  project_path: string;
  target_symbol: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dependent_files_count: number;
  dependent_files: string[];
  truncated_dependents_count?: number;
  suggested_tests_to_run: string[];
  ast_graph_detected: boolean;
  ast_graph_files: string[];
  ast_graph_action_required: string;
}

export const AuditSecurityInputSchema = z.object({
  project_path: z.string().min(1).describe('Ruta al directorio raíz del proyecto a auditar.'),
  max_findings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(25)
    .describe('Límite máximo de hallazgos individuales devueltos en findings (ahorro de tokens).'),
});

export interface GroupedSecurityFinding {
  rule_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  stig_owasp_ref: string;
  message: string;
  remediation: string;
  occurrences_count: number;
  locations: string[];
}

export interface SecurityAuditResult {
  project_path: string;
  passed: boolean;
  total_files_scanned: number;
  findings_count: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  findings: SecurityFinding[];
  grouped_findings?: GroupedSecurityFinding[];
  truncated_findings_count?: number;
}

export const AuditTestPyramidInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta o relativa al directorio raíz del proyecto existente.'),
  stack: StackNameSchema.optional().describe(
    'Stack específico a auditar. Si se omite, se autodetectan todos los stacks presentes.'
  ),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Máximo de ítems por categoría en missing_test_inventory (ahorro de tokens).'),
});
```

Y en `MissingTestInventory` (`mcp-server/src/types.ts`), añadir conteos totales opcionales para visibilidad cuando se trunca:
```typescript
export interface MissingTestInventory {
  orphan_source_files: OrphanSourceFile[];
  untested_api_endpoints: UntestedApiEndpoint[];
  untested_ui_views: UntestedUiView[];
  total_orphan_files_count?: number;
  total_untested_apis_count?: number;
  total_untested_views_count?: number;
}
```

---

## 4. Optimización de `fetch_blueprint_bundle`, `init-agents-md` e `install-skill` (Tarea 14.2)

### 4.1. `mcp-server/src/tools/fetch-bundle.ts` y `mcp-server/src/server.ts`

En `mcp-server/src/tools/fetch-bundle.ts`, añadir el parámetro `includeContent = true` (mantiene `true` por defecto en llamadas internas programáticas para no romper `tools-and-resources.unit.ts`, mientras que `server.ts` pasa `args.include_content ?? false`):

```typescript
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as path from 'node:path';
import { GitHubFetcher } from '../services/github-fetcher.js';
import { FetchedFileItem } from '../types.js';

export async function fetchBlueprintBundle(
  stack: string,
  includeCommonAndAgents = true,
  fetcher?: GitHubFetcher,
  includeContent = true
): Promise<{
  stack: string;
  total_files: number;
  content_omitted_for_token_economy?: boolean;
  files: FetchedFileItem[];
}> {
  const resolvedFetcher = fetcher || new GitHubFetcher();
  const rawFiles = await resolvedFetcher.fetchStackBundle(stack, includeCommonAndAgents);
  const cacheDir = resolvedFetcher.getCacheDir();

  if (includeContent) {
    return {
      stack,
      total_files: rawFiles.length,
      files: rawFiles,
    };
  }

  const compactFiles: FetchedFileItem[] = rawFiles.map((item) => ({
    path: item.path,
    target_name: item.target_name,
    merge_strategy: item.merge_strategy,
    content: '',
    sha256_verified: item.sha256_verified,
    size_bytes: Buffer.byteLength(item.content, 'utf-8'),
    cached_path: path.join(cacheDir, 'files', item.path),
  }));

  return {
    stack,
    total_files: compactFiles.length,
    content_omitted_for_token_economy: true,
    files: compactFiles,
  };
}
```

Y en `mcp-server/src/server.ts` (Tool 2 `fetch_blueprint_bundle`):
```typescript
    async (args) => {
      const result = await fetchBlueprintBundle(
        args.stack,
        args.include_common_and_agents,
        fetcher,
        args.include_content ?? false
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
```

### 4.2. Actualización de `buildConnectorBlock` en `mcp-server/src/cli/init-agents-md.ts`

Actualizar `buildConnectorBlock` en `mcp-server/src/cli/init-agents-md.ts` para incluir las **3 Vías Proporcionales de Ejecución (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`)** y el **Protocolo High-IQ Token Economy**, conservando todas las cadenas verificadas por `tests/init-agents-md.unit.ts`:

```typescript
export function buildConnectorBlock(projectName: string, stacks: string[]): string {
  const stacksLabel = stacks.length > 0 ? stacks.join(', ') : 'general';
  return [
    CONNECTOR_START_MARKER,
    '## 🤖 Central QA 11X Skill & MCP Server Connector (`@sinfallas/mcp-qa-11x`)',
    '',
    '> **OUTPUT LANGUAGE & HIGH-IQ TOKEN ECONOMY:** Interact, explain reasoning, and write commits/docs strictly in **Spanish**. Apply *3-Tier Progressive Disclosure* (read `.agents/rules/*.md` and `references/*.md` on-demand only), *AST/Grep-First & Windowed-Read-Second* (`StartLine`/`EndLine` 40–80 lines; never read full files `>150` lines blindly), *Zero Redundant Re-Read*, *Parallel Tool Batching*, and *Subagent Context Isolation* (`<=20` line summary return).',
    '',
    `This project (\`${projectName}\`) enforces the **Level-11X Quality & DevSecOps Standard** (stacks: \`${stacksLabel}\`).`,
    '',
    '1. **3-Path Proportional Execution (`DOCS_ONLY` vs. `MICRO_CHANGE` vs. `CODE_CHANGE` / `FULL_11X`):**',
    '   - **`DOCS_ONLY` Fast-Path (ONLY `*.md` / `docs/` changed):** DO NOT run test suites (`run_ephemeral_qa`) and DO NOT rebuild AST graphs (`./scripts/actualizar-grafos-graphify.sh`). Only sync docs/`CHANGELOG.md`, run `certify_11x_gate`, and push to `git`.',
    '   - **`MICRO_CHANGE` Surgical-Path (`<= 3` files, 0 new API/ORM changes, `LOW` AST Blast Radius `< 5` callers):** Use an inline 3-line plan, run `inspect_ast_blast_radius`, execute affected stack `run_ephemeral_qa` in Docker (**Rule Zero**), update stack AST graph, sync `CHANGELOG.md`, run `certify_11x_gate`, and `git push`.',
    '   - **`CODE_CHANGE` (`FULL_11X`) Architectural-Path (`> 3` files, new API/UI, ORM migrations, security, or `MED`/`HIGH` Blast Radius):** Execute all 11 steps below inside ephemeral Docker (**Rule Zero** — never run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, or linters on host OS).',
    '2. **Skills & MCP Tools (`@sinfallas/mcp-qa-11x`):** Load `qa-11x-architect` (backend/QA/DevSecOps) and `refactoring-ui` (UI/CSS). Use `inspect_project_config`, `audit_test_pyramid_gaps`, `inspect_ast_blast_radius`, `audit_security_stig_owasp`, `run_ephemeral_qa` (`skip_if_docs_only: true` supported), `certify_11x_gate`, `clean_workspace_11x`, `reconcile_agents_governance`, and `propose_skill_evolution_pr` (on QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr`).',
    '3. **Mandatory 11-Step Execution & Closure Workflow (Non-Negotiable for Architectural Code Changes):**',
    '   - **Step 1 (Plan):** Invoke `/plan` or plan artifact before modifying code.',
    '   - **Step 2 (Active Task):** Track real-time progress (`- [ ]` -> `- [x]`) in `.agents/ACTIVE_TASK.md` (compact `<= 40 lines`).',
    '   - **Step 3 (Pre-Change AST Graph):** Check blast radius (`inspect_ast_blast_radius`); if `graphify-out/graph.json` is missing, create it first via `./scripts/actualizar-grafos-graphify.sh`.',
    '   - **Step 4 (Governance & Cleanup):** Sync `AGENTS.md`, `.agents/`, `scripts/limpieza.sh`, and `.gitignore`.',
    '   - **Step 5 (11X Tests + Karate Labs):** Create unit (`>= 95%` coverage), integration, and **Karate Labs BDD (`.feature`)** tests.',
    '   - **Step 6 (Full Suite Execution):** Run all suites in ephemeral Docker (`Rule Zero` / `run_ephemeral_qa`, 0 warnings).',
    '   - **Step 7–9 (Docs, Changelog & Roadmap):** Sync `docs/specs/`, `README.md`, `TESTING.md`, `CHANGELOG.md`, and `ROADMAP.md`.',
    '   - **Step 10 (Post-Change AST Graph):** Run `./scripts/actualizar-grafos-graphify.sh` (incremental per modified stack).',
    '   - **Step 11 (Certify & Push):** Run `certify_11x_gate` and `clean_workspace_11x`, mark `.agents/ACTIVE_TASK.md` `COMPLETED (100%)` (suggest `/compact`), and `git push`.',
    CONNECTOR_END_MARKER,
  ].join('\n');
}
```

---

## 5. Agrupación por Regla y Truncado Top-N en Auditores MCP (Tarea 14.3)

### 5.1. `mcp-server/src/tools/security-auditor.ts` (`groupFindingsByRule` y `maxFindings`)

En `mcp-server/src/tools/security-auditor.ts`, añadir `groupFindingsByRule` (con complejidad cognitiva `<= 15`) y el parámetro opcional `maxFindings`:

```typescript
export function groupFindingsByRule(
  findings: SecurityFinding[],
  maxLocationsPerRule = 15
): GroupedSecurityFinding[] {
  const groups = new Map<string, GroupedSecurityFinding>();

  for (const f of findings) {
    const existing = groups.get(f.rule_id);
    const loc = `${f.file}:${f.line}`;
    if (!existing) {
      groups.set(f.rule_id, {
        rule_id: f.rule_id,
        severity: f.severity,
        stig_owasp_ref: f.stig_owasp_ref,
        message: f.message,
        remediation: f.remediation,
        occurrences_count: 1,
        locations: [loc],
      });
    } else {
      existing.occurrences_count++;
      if (existing.locations.length < maxLocationsPerRule) {
        existing.locations.push(loc);
      }
    }
  }

  return Array.from(groups.values());
}
```

En `auditSecurityStigOwasp(projectPath: string, maxFindings?: number)`:
- Calcular `counts = countSeverities(findings)` y `grouped = groupFindingsByRule(findings)` sobre el total real de hallazgos.
- Si `typeof maxFindings === 'number' && findings.length > maxFindings`, devolver `findings: findings.slice(0, maxFindings)` y `truncated_findings_count: findings.length - maxFindings` (manteniendo el 100% de los conteos exactos en `findings_count` y el resumen completo en `grouped_findings`).

### 5.2. `mcp-server/src/tools/test-pyramid-auditor.ts` (`maxItems`)

En `auditTestPyramidGaps(projectPathInput: string, stackFilter?: StackName, maxItems?: number)`:
- Conservar `total_orphan_files_count: orphanSourceFiles.length`, `total_untested_apis_count: untestedApis.length` y `total_untested_views_count: untestedViews.length`.
- Si `typeof maxItems === 'number' && maxItems > 0`, recortar las listas de `missing_test_inventory` con `.slice(0, maxItems)` después de haber evaluado las 13 capas (`evaluateLayer03UnitIsolated`, `evaluateLayer06BddApiKarate`, `evaluateLayer07BddUiKarate`) y el `prioritized_action_plan`.

### 5.3. `mcp-server/src/tools/blast-radius.ts` (`maxItems`)

En `inspectAstBlastRadius(projectPathInput: string, targetSymbol: string, maxItems?: number)`:
- Calcular `count = sortedDependents.length` y `riskLevel = calculateRiskLevel(count)` sobre el total real.
- Si `typeof maxItems === 'number' && maxItems > 0 && count > maxItems`, recortar `dependent_files: sortedDependents.slice(0, maxItems)` y `suggested_tests_to_run: Array.from(suggestedTests).sort().slice(0, maxItems)`, añadiendo `truncated_dependents_count: count - maxItems`.

---

## 6. Actualización de Huellas Promovidas en `mcp-server/src/cli/reconcile-agents.ts` (Tarea 14.4)

Añadir en `PROMOTED_INVARIANT_FINGERPRINTS` de `mcp-server/src/cli/reconcile-agents.ts`:
```typescript
  'high-iq token economy',
  '3-path proportional execution',
  'ast/grep-first, windowed-read-second',
  'subagent context isolation',
  'zero redundant re-read',
```

---

## 7. Pruebas Unitarias (`>= 95.0%`) y Escenario BDD 15 en Karate Labs (Tarea 14.5)

1. **Ampliar Suites Unitarias (`mcp-server/tests/`):**
   - `mcp-server/tests/tools-and-resources.unit.ts`: Verificar `fetchBlueprintBundle('python', true, fetcher, false)` comprobando que `content_omitted_for_token_economy === true`, `files[0].content === ''`, `files[0].size_bytes > 0` y `files[0].cached_path` apunta a la caché; verificar también `inspectAstBlastRadius` con `maxItems`.
   - `mcp-server/tests/security-auditor.unit.ts`: Verificar `groupFindingsByRule()` y el truncado con `maxFindings` en `auditSecurityStigOwasp`, comprobando que `findings_count` refleja el total real mientras `findings` se limita a `maxFindings` y `grouped_findings` agrupa las ubicaciones `file:line`.
   - `mcp-server/tests/test-pyramid-auditor.unit.ts`: Verificar `auditTestPyramidGaps(projectPath, undefined, 2)` comprobando `total_orphan_files_count` y el recorte de `orphan_source_files`.
   - `mcp-server/tests/init-agents-md.unit.ts`: Verificar que `buildConnectorBlock` incluya `3-Path Proportional Execution`, `MICRO_CHANGE` y `HIGH-IQ TOKEN ECONOMY`.
2. **Añadir Escenario 15 en `mcp-server/test/mcp_cli_test.feature`:**
   - Validar el contrato de `3-Path Proportional Execution` (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`), el protocolo `High-IQ Token Economy` en `AGENTS.md` y `.agents/skills/qa-11x-architect/SKILL.md`, y la estructura de `grouped_findings` / `content_omitted_for_token_economy`.
3. **Ejecución en Contenedor Efímero (Regla Cero):**
   ```bash
   docker compose -f mcp-server/docker-compose.qa.yml run --rm qa-mcp sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"
   ./scripts/actualizar-grafos-graphify.sh mcp-server
   python3 scripts/generar-manifiesto.py
   ./.agents/scripts/certify_task_completion.sh
   ```
