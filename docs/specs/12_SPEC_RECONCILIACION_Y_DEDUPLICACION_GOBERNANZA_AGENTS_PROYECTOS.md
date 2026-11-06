# 🧹 Especificación Técnica 12: Reconciliación Automática, Deduplicación y Aislamiento de Reglas de Dominio en `.agents/` para Proyectos Consumidores (`reconcile-agents` / Hito 13)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (Hito 13):** `mcp-server/src/cli/reconcile-agents.ts`, `mcp-server/src/types.ts`, `mcp-server/src/server.ts`, `mcp-server/src/index.ts`, `mcp-server/src/cli/init-agents-md.ts`, `mcp-server/src/cli/install-skill.ts`, `mcp-server/tests/reconcile-agents.unit.ts`, `mcp-server/test/mcp_cli_test.feature`  
**Modelo Ejecutor Objetivo:** Gemini 3.8 Flash High  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 13)

---

## 1. Propósito y Problema Real en Proyectos Consumidores (Caso `rosgrid`)

Cuando un proyecto consumidor (como `rosgrid`, `rosgrid-web`, `condominio-app`) descubre un nuevo invariante durante su ciclo de desarrollo o pruebas UAT (por ejemplo, el **Invariante Anti-Silo de Propagación Transversal**, el **Ciclo Temporal de 3 Fases**, la **Auditoría Semántica Anti-UUID** o el **Refresco Dual**), el agente de IA local suele escribir esas directivas directamente dentro de `<proyecto>/.agents/rules/*.md` o dentro de `<proyecto>/AGENTS.md`.

Posteriormente, cuando esas directivas se promueven y estandarizan en el repositorio central **`qa-testing-blueprints`** (dentro de `.agents/skills/qa-11x-architect/SKILL.md` y los 7 archivos canónicos de `.agents/rules/`), se genera un conflicto en el proyecto consumidor:

1. **Colisión de Archivos Canónicos (`.agents/rules/*.md`):**
   - Si el agente local de `rosgrid` editó `mandatory_qa_pyramid_and_doc_sync.md` o `frontend_parity_and_closure.md` mezclando reglas universales (ya promovidas a `qa-testing-blueprints`) con reglas específicas del negocio de `rosgrid` (ej. MikroTik RouterOS v7, WinBox, endpoints específicos `/api/v1/inventory/routers`), una actualización simple pisaría las reglas de negocio o dejaría el archivo desincronizado respecto al hash SHA-256 de `manifest.json`.
2. **Duplicación y Contaminación de Tokens (*Prompt Bloat & Rule Clash*):**
   - El agente de IA que trabaja en `rosgrid` termina leyendo la misma regla 3 veces con redacciones ligeramente distintas: (1) en la skill global `~/.gemini/config/skills/qa-11x-architect/SKILL.md`, (2) en el archivo canónico actualizado de `.agents/rules/`, y (3) en los bloques ad-hoc que habían quedado en `rosgrid/.agents/rules/` o `rosgrid/AGENTS.md`.

### 🛡️ La Solución 11X: Reconciliador Automático No Destructivo (`reconcile_agents_governance` / `reconcile-agents`)

Para eliminar la necesidad de hacer limpiezas manuales propensas a errores en `rosgrid` y cualquier otro proyecto adoptante, el Hito 13 incorpora el módulo **`mcp-server/src/cli/reconcile-agents.ts`**, expuesto tanto por CLI (`npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents` y flag `--reconcile` en `init-agents` / `install-skill`) como por Servidor MCP (**Tool 12: `reconcile_agents_governance`**).

> **DIRECTIVAS CRÍTICAS DE IMPLEMENTACIÓN PARA GEMINI 3.8 FLASH HIGH (HITO 13):**
> 1. **Cero Advertencias de Linter (`--max-warnings 0`):** En `mcp-server/`, ESLint ejecuta `eslint-plugin-sonarjs` y `eslint-plugin-security`. Cualquier warning rompe el build.
> 2. **Complejidad Cognitiva (`sonarjs/cognitive-complexity <= 15`):** Mantén cada función pequeña y modular tal como se entrega en esta especificación.
> 3. **Cero Cadenas Duplicadas (`sonarjs/no-duplicate-string`):** Define constantes en la cabecera del archivo.
> 4. **Cero Pérdida de Datos (Backup Antes de Mutar):** Antes de modificar o eliminar cualquier archivo en `<project_path>/.agents/rules/` o `<project_path>/AGENTS.md` (cuando `dryRun` es `false`), crea siempre una copia de respaldo en `<project_path>/.agents/backups/<timestamp>/`.

---

## 2. Taxonomía de Archivos en `.agents/rules/` (Separación Global vs. Dominio)

1. **Los 7 Archivos Canónicos Globales (`CANONICAL_GLOBAL_RULE_FILES`):**
   Son propiedad exclusiva del estándar global `qa-testing-blueprints` y deben permanecer 100% agnósticos del dominio:
   - `mandatory_qa_pyramid_and_doc_sync.md`
   - `secure_development_and_testing_guidelines.md`
   - `frontend_parity_and_closure.md`
   - `continuous_agent_evolution.md`
   - `anti_regression_and_side_effects_guardrail.md`
   - `ground_truth_fixtures_and_negative_invariants.md`
   - `active_task_and_planning_resilience.md`

2. **Archivos de Dominio Local (`domain_<project>_*.md`):**
   Cualquier regla específica del negocio de un proyecto consumidor (ej. `domain_rosgrid_rules.md`) vive en un archivo con prefijo `domain_` dentro de `.agents/rules/` o fuera del bloque conector `<!-- QA_11X_MCP_CONNECTOR_START --> ... <!-- QA_11X_MCP_CONNECTOR_END -->` en `AGENTS.md`. Los instaladores y actualizadores de `qa-testing-blueprints` **jamás** sobrescriben ni borran archivos `domain_*.md`.

---

## 3. Contratos en `mcp-server/src/types.ts` (Tarea 13.1)

Añadir al final de `mcp-server/src/types.ts`:

```typescript
// ============================================================================
// 🧹 Contratos de Reconciliación y Deduplicación de .agents/ (Hito 13)
// ============================================================================

export const ReconcileAgentsInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta o relativa al proyecto consumidor (ej. rosgrid) a reconciliar.'),
  dry_run: z
    .boolean()
    .default(false)
    .describe('Si es true, simula la reconciliación informando duplicados y extracciones de dominio sin modificar el disco.'),
});
export type ReconcileAgentsInput = z.infer<typeof ReconcileAgentsInputSchema>;

export interface ReconciledRuleItem {
  file: string;
  classification:
    | 'CANONICAL_CLEAN'
    | 'REDUNDANT_PROMOTED_REMOVED'
    | 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE'
    | 'DOMAIN_PRESERVED';
  details: string;
}

export interface ReconcileAgentsResult {
  project_path: string;
  dry_run: boolean;
  backup_dir: string | null;
  domain_rules_file: string | null;
  removed_duplicate_sections_count: number;
  preserved_domain_sections_count: number;
  reconciled_items: ReconciledRuleItem[];
}
```

---

## 4. Implementación de `mcp-server/src/cli/reconcile-agents.ts` (Tarea 13.2)

Gemini 3.8 Flash High DEBE crear `mcp-server/src/cli/reconcile-agents.ts` con la siguiente lógica modular:

```typescript
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReconcileAgentsResult, ReconciledRuleItem } from '../types.js';

const UTF8 = 'utf-8';
const AGENTS_DIR = '.agents';
const RULES_DIR = 'rules';
const BACKUPS_DIR = 'backups';
const DOMAIN_PREFIX = 'domain_';

export const CANONICAL_GLOBAL_RULE_FILES = new Set([
  'mandatory_qa_pyramid_and_doc_sync.md',
  'secure_development_and_testing_guidelines.md',
  'frontend_parity_and_closure.md',
  'continuous_agent_evolution.md',
  'anti_regression_and_side_effects_guardrail.md',
  'ground_truth_fixtures_and_negative_invariants.md',
  'active_task_and_planning_resilience.md',
]);

/**
 * Huellas semánticas de directivas que nacieron en proyectos consumidores (ej. rosgrid)
 * y ya fueron promovidas oficialmente a qa-testing-blueprints (SKILL.md + .agents/rules/).
 */
export const PROMOTED_INVARIANT_FINGERPRINTS = [
  'silo mock blindness',
  'cross-module state propagation',
  'propagación transversal de estado',
  '2-state static blindness',
  '3-phase temporal lifecycle',
  '3 fases temporales',
  '3 fases del reloj',
  'audit payload & semantic badge integrity',
  'prohibición de mocks ciegos en auditoría',
  'dual auto + manual refresh invariant',
  'invariante de refresco dual',
  'invariante anti-silo',
];

export function isPromotedSection(sectionText: string): boolean {
  const lower = sectionText.toLowerCase();
  let matches = 0;
  for (const fp of PROMOTED_INVARIANT_FINGERPRINTS) {
    if (lower.includes(fp)) {
      matches++;
    }
  }
  return matches >= 1;
}

export function splitMarkdownSections(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{2,4}\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join('\n'));
  }
  return sections;
}

function ensureBackupFile(
  projectPath: string,
  relFilePath: string,
  backupDir: string
): void {
  const srcFull = path.join(projectPath, relFilePath);
  if (!fs.existsSync(srcFull)) return;
  const destFull = path.join(backupDir, relFilePath);
  fs.mkdirSync(path.dirname(destFull), { recursive: true });
  fs.copyFileSync(srcFull, destFull);
}

function processNonCanonicalRuleFile(
  fullPath: string,
  relPath: string,
  fileName: string,
  dryRun: boolean,
  projectPath: string,
  backupDir: string,
  extractedDomainBlocks: string[]
): {
  item: ReconciledRuleItem;
  removedCount: number;
  preservedCount: number;
} {
  if (fileName.startsWith(DOMAIN_PREFIX)) {
    return {
      item: {
        file: relPath,
        classification: 'DOMAIN_PRESERVED',
        details: 'Archivo de dominio con prefijo domain_* preservado intacto.',
      },
      removedCount: 0,
      preservedCount: 1,
    };
  }

  const content = fs.readFileSync(fullPath, UTF8);
  const sections = splitMarkdownSections(content);
  const domainOnlySections: string[] = [];
  let removedCount = 0;

  for (const sec of sections) {
    if (isPromotedSection(sec)) {
      removedCount++;
    } else if (sec.trim().length > 0) {
      domainOnlySections.push(sec);
    }
  }

  if (!dryRun) {
    ensureBackupFile(projectPath, relPath, backupDir);
    fs.unlinkSync(fullPath);
  }

  if (domainOnlySections.length > 0) {
    extractedDomainBlocks.push(...domainOnlySections);
    return {
      item: {
        file: relPath,
        classification: 'DOMAIN_EXTRACTED_TO_DOMAIN_FILE',
        details: `Eliminadas ${removedCount} sección(es) ya promovidas al estándar global y extraídas ${domainOnlySections.length} sección(es) de dominio.`,
      },
      removedCount,
      preservedCount: domainOnlySections.length,
    };
  }

  return {
    item: {
      file: relPath,
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Archivo redundante eliminado (${removedCount} sección(es) ya forman parte de qa-testing-blueprints global).`,
    },
    removedCount: Math.max(1, removedCount),
    preservedCount: 0,
  };
}

function cleanPromotedDuplicatesInAgentsMd(
  projectPath: string,
  dryRun: boolean,
  backupDir: string
): { item: ReconciledRuleItem | null; removedCount: number } {
  const agentsMdPath = path.join(projectPath, 'AGENTS.md');
  if (!fs.existsSync(agentsMdPath)) {
    return { item: null, removedCount: 0 };
  }

  const content = fs.readFileSync(agentsMdPath, UTF8);
  const sections = splitMarkdownSections(content);
  const keptSections: string[] = [];
  let removedCount = 0;

  for (const sec of sections) {
    const isConnector = sec.includes('QA_11X_MCP_CONNECTOR_START');
    if (!isConnector && isPromotedSection(sec)) {
      removedCount++;
    } else {
      keptSections.push(sec);
    }
  }

  if (removedCount === 0) {
    return { item: null, removedCount: 0 };
  }

  if (!dryRun) {
    ensureBackupFile(projectPath, 'AGENTS.md', backupDir);
    fs.writeFileSync(agentsMdPath, keptSections.join('\n\n').trimEnd() + '\n', UTF8);
  }

  return {
    item: {
      file: 'AGENTS.md',
      classification: 'REDUNDANT_PROMOTED_REMOVED',
      details: `Podadas ${removedCount} sección(es) duplicadas en AGENTS.md que ya residen en la skill global qa-11x-architect.`,
    },
    removedCount,
  };
}

export async function reconcileAgentsGovernance(options: {
  projectPath: string;
  dryRun?: boolean;
}): Promise<ReconcileAgentsResult> {
  const resolvedPath = path.resolve(options.projectPath.normalize('NFKC'));
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Directorio de proyecto inválido: ${resolvedPath}`);
  }

  const dryRun = Boolean(options.dryRun);
  const projectSlug =
    path
      .basename(resolvedPath)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'project';
  const rulesDirPath = path.join(resolvedPath, AGENTS_DIR, RULES_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(resolvedPath, AGENTS_DIR, BACKUPS_DIR, timestamp);

  const reconciledItems: ReconciledRuleItem[] = [];
  const extractedDomainBlocks: string[] = [];
  let totalRemoved = 0;
  let totalPreserved = 0;

  if (fs.existsSync(rulesDirPath)) {
    const entries = fs.readdirSync(rulesDirPath).filter((f) => f.endsWith('.md'));
    for (const fileName of entries) {
      const relPath = path.join(AGENTS_DIR, RULES_DIR, fileName);
      const fullPath = path.join(rulesDirPath, fileName);

      if (CANONICAL_GLOBAL_RULE_FILES.has(fileName)) {
        if (!dryRun) {
          ensureBackupFile(resolvedPath, relPath, backupDir);
        }
        reconciledItems.push({
          file: relPath,
          classification: 'CANONICAL_CLEAN',
          details: 'Archivo canónico global respaldado en .agents/backups/ y listo para sincronización.',
        });
        continue;
      }

      const res = processNonCanonicalRuleFile(
        fullPath,
        relPath,
        fileName,
        dryRun,
        resolvedPath,
        backupDir,
        extractedDomainBlocks
      );
      reconciledItems.push(res.item);
      totalRemoved += res.removedCount;
      totalPreserved += res.preservedCount;
    }
  }

  const agentsRes = cleanPromotedDuplicatesInAgentsMd(resolvedPath, dryRun, backupDir);
  if (agentsRes.item) {
    reconciledItems.push(agentsRes.item);
    totalRemoved += agentsRes.removedCount;
  }

  let domainRulesFile: string | null = null;
  if (extractedDomainBlocks.length > 0) {
    domainRulesFile = path.join(
      AGENTS_DIR,
      RULES_DIR,
      `${DOMAIN_PREFIX}${projectSlug}_rules.md`
    );
    if (!dryRun) {
      fs.mkdirSync(rulesDirPath, { recursive: true });
      const domainFullPath = path.join(resolvedPath, domainRulesFile);
      const existingDomain = fs.existsSync(domainFullPath)
        ? fs.readFileSync(domainFullPath, UTF8) + '\n\n'
        : `# Domain-Specific Governance Rules (${projectSlug})\n\n`;
      fs.writeFileSync(
        domainFullPath,
        existingDomain + extractedDomainBlocks.join('\n\n') + '\n',
        UTF8
      );
    }
  }

  const backupCreated = !dryRun && fs.existsSync(backupDir);

  return {
    project_path: resolvedPath,
    dry_run: dryRun,
    backup_dir: backupCreated ? backupDir : null,
    domain_rules_file: domainRulesFile,
    removed_duplicate_sections_count: totalRemoved,
    preserved_domain_sections_count: totalPreserved,
    reconciled_items: reconciledItems,
  };
}
```

---

## 5. Sincronización Integral en `init-agents-md.ts`, `install-skill.ts`, `certify-gate.ts` y `server.ts` (Tarea 13.3)

Para garantizar que cuando se publica una nueva versión de `@sinfallas/mcp-qa-11x` o se ejecuta `install-skill` todo el ecosistema quede 100% actualizado sin intervención manual, **Gemini 3.8 Flash High** DEBE implementar los siguientes 5 cambios exactos:

### 5.1. Actualizar `buildConnectorBlock()` y añadir `syncGlobalGeminiMd()` en `mcp-server/src/cli/init-agents-md.ts`

1. En `buildConnectorBlock(projectName: string, stacks: string[])`, incluir explícitamente `propose_skill_evolution_pr` y `reconcile_agents_governance` junto con el disparador obligatorio de **Post-Mortem de Escapes de QA**:
   ```typescript
   '   - `certify_11x_gate` & `clean_workspace_11x`: Certify all closure checks and sanitize root-owned container files before `git commit` and `git push`.',
   '   - `propose_skill_evolution_pr` & `reconcile_agents_governance`: MANDATORY QA-ESCAPE POST-MORTEM — Whenever you fix a UAT, integration, or production bug that escaped existing automated tests (even with `>= 95%` coverage), you MUST PROACTIVELY include a section titled `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` in your Spanish response and invoke `propose_skill_evolution_pr` WITHOUT waiting for the user to ask. Isolate project-specific domain rules in `.agents/rules/domain_<project>_rules.md`.',
   ```
2. Añadir y exportar `syncGlobalGeminiMd(homeDir: string, dryRun = false): { updated: boolean; geminiMdPath: string }` en `mcp-server/src/cli/init-agents-md.ts`:
   ```typescript
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
   ```
   *(De este modo, `~/.gemini/GEMINI.md` se actualiza de forma quirúrgica y no destructiva mediante los marcadores `<!-- QA_11X_MCP_CONNECTOR_START --> ... <!-- QA_11X_MCP_CONNECTOR_END -->`, conservando cualquier instrucción personal fuera del bloque).*

### 5.2. Actualizar `mcp-server/src/cli/install-skill.ts` para Sincronizar `.agents/rules/*.md`, `~/.gemini/GEMINI.md` y Soportar `--reconcile`

En `mcp-server/src/cli/install-skill.ts`:
1. Añadir la constante `const AGENT_RULES_PREFIX = '.agents/rules/';`.
2. Actualizar `installIncludedScripts` para que, cuando se pase `--include-scripts`, descargue e instale **tanto `.agents/scripts/*` como los 7 archivos canónicos de `.agents/rules/*.md`** (además de `common_files`):
   ```typescript
   const scriptEntries: ManifestFileEntry[] = [
     ...(manifest.common_files || []),
     ...(manifest.agent_governance_files || []).filter(
       (f) => f.path.startsWith(AGENT_SCRIPTS_PREFIX) || f.path.startsWith(AGENT_RULES_PREFIX)
     ),
   ];
   ```
3. En `runInstallSkillCli(args: string[], fetcher?: GitHubFetcher)`:
   - Detectar `const reconcile = args.includes('--reconcile');`.
   - Si `reconcile` es `true`, invocar **antes** de sobrescribir `.agents/rules/*.md`:
     ```typescript
     if (reconcile) {
       const recRes = await reconcileAgentsGovernance({ projectPath: cwd, dryRun: false });
       console.log(
         `✔ [Reconcile 11X] ${recRes.removed_duplicate_sections_count} sección(es) duplicada(s) podada(s), ${recRes.preserved_domain_sections_count} sección(es) de dominio preservada(s).`
       );
     }
     ```
   - Sincronizar automáticamente `~/.gemini/GEMINI.md` llamando a `syncGlobalGeminiMd(homeDir)` cuando `~/.gemini` exista en el sistema.

### 5.3. Inyectar el Recordatorio Cognitivo `upstream_evolution_reminder` en `mcp-server/src/tools/certify-gate.ts` y `mcp-server/src/types.ts`

1. En `mcp-server/src/types.ts`, agregar la propiedad opcional `upstream_evolution_reminder?: string;` en la interfaz `CertifyGateResult`.
2. En `mcp-server/src/tools/certify-gate.ts`, incluir siempre en el objeto retornado por `certify11xGate()`:
   ```typescript
   upstream_evolution_reminder:
     'MANDATORY POST-MORTEM CHECK: Did this task resolve a UAT/integration/production bug that bypassed previous automated tests? If YES, you MUST proactively present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" to the user in Spanish and invoke propose_skill_evolution_pr without waiting to be asked.',
   ```

### 5.4. Registrar la Tool 12 en `mcp-server/src/server.ts` y el Subcomando CLI en `mcp-server/src/index.ts`

1. En `mcp-server/src/server.ts`, registrar la **Tool 12 (`reconcile_agents_governance`)** con `ReconcileAgentsInputSchema.shape` llamando a `reconcileAgentsGovernance({ projectPath: args.project_path, dryRun: args.dry_run })`.
2. En `mcp-server/src/cli/reconcile-agents.ts`, exportar `runReconcileAgentsCli(args: string[]): Promise<void>` (usando `parseInitAgentsArgs(args)` de `init-agents-md.ts`) y conectarlo en `mcp-server/src/index.ts` cuando `arg1 === 'reconcile-agents'`.

### 5.5. Protocolo Operativo de 11 Directrices y Ciclo Completo del Grafo AST (Uso Local + Descarga MCP)

Para garantizar que tanto en el repositorio local como en cualquier proyecto externo que descargue `@sinfallas/mcp-qa-11x` se cumplan sin excepción las **11 directrices operativas**, se incorporan los siguientes blindajes:
1. **Conector `buildConnectorBlock()` con Flujo Obligatorio de 11 Pasos (`mcp-server/src/cli/init-agents-md.ts`):**
   - **Paso 1:** Usar siempre la herramienta de planificación (`/plan` o artefacto de plan).
   - **Paso 2:** Usar siempre `.agents/ACTIVE_TASK.md` como diario de progreso en tiempo real (`- [ ]` → `- [x]`).
   - **Paso 3:** Revisar siempre el grafo AST antes de modificar código (`inspect_ast_blast_radius` / `.agents/scripts/inspect_blast_radius.py`), y **si el grafo (`graphify-out/graph.json`) no existe, crearlo primero** ejecutando `./scripts/actualizar-grafos-graphify.sh`.
   - **Paso 4:** Actualizar siempre los archivos de gobernanza del repositorio (`AGENTS.md`, `.agents/rules/`, `.agents/skills/`), el script de limpieza (`scripts/limpieza.sh`) y `.gitignore`.
   - **Paso 5:** Crear siempre todas las pruebas necesarias en la pirámide 11X (>= 95% cobertura), **incluido siempre Karate Labs BDD (`.feature`)**.
   - **Paso 6:** Ejecutar siempre todo el set de pruebas en contenedores Docker efímeros (`Rule Zero`).
   - **Paso 7:** Actualizar siempre la documentación y las especificaciones técnicas (`docs/`, `docs/specs/`, `README.md`, `TESTING.md`).
   - **Paso 8:** Actualizar siempre `CHANGELOG.md` (bajo `## [Unreleased]`).
   - **Paso 9:** Actualizar `ROADMAP.md` cuando sea necesario.
   - **Paso 10:** Actualizar siempre el grafo AST al terminar los cambios (`./scripts/actualizar-grafos-graphify.sh`).
   - **Paso 11:** Ejecutar la compuerta de certificación (`certify_11x_gate`), marcar `.agents/ACTIVE_TASK.md` como `COMPLETED (100%)` y **subir siempre a `git` (`git commit` y `git push`)**.
2. **Distribución de `scripts/actualizar-grafos-graphify.sh` y `.agents/ACTIVE_TASK.md.example` a Usuarios del MCP:**
   - `scripts/generar-manifiesto.py` incluye `"scripts/actualizar-grafos-graphify.sh"` dentro de `COMMON_FILE_PATHS` para que `install-skill --include-scripts` y `bootstrap_or_merge_11x` lo entreguen automáticamente con permisos de ejecución `0o755`.
   - `mcp-server/src/cli/install-skill.ts` (`installIncludedScripts`) instala `.agents/ACTIVE_TASK.md.example` e inicializa `.agents/ACTIVE_TASK.md` (sin sobrescribir un diario existente en curso).
3. **Detección del Grafo AST y Orden de Creación/Actualización en `inspect_ast_blast_radius` (`mcp-server/src/tools/blast-radius.ts`):**
   - `BlastRadiusResult` retorna `ast_graph_detected: boolean`, `ast_graph_files: string[]` y `ast_graph_action_required: string`, combinando los llamadores de `graphify-out/graph.json` con el escaneo estático de fuentes (incluyendo `.php`) e instruyendo al agente a crear el grafo si no existe y a actualizarlo al terminar los cambios.

---

## 6. Requisitos de Pruebas 11X para el Hito 13 (`mcp-server/tests/reconcile-agents.unit.ts`) (Tarea 13.4)

1. **Crear `mcp-server/tests/reconcile-agents.unit.ts`:**
   - **Caso 1 (Proyecto tipo `rosgrid` con reglas promovidas duplicadas en `.agents/rules/custom_uat_rules.md` y en `AGENTS.md`):** Verifica que las secciones que contienen el `Invariante Anti-Silo` / `Silo Mock Blindness` / `3-Phase Temporal Lifecycle` son detectadas como `REDUNDANT_PROMOTED_REMOVED`, respaldadas en `.agents/backups/` y eliminadas sin borrar las reglas de dominio de `rosgrid` (ej. reglas de RouterOS v7), las cuales se extraen automáticamente a `.agents/rules/domain_rosgrid_rules.md`.
   - **Caso 2 (Preservación de archivos `domain_*.md`):** Verifica que cualquier archivo `.agents/rules/domain_rosgrid_noc.md` se clasifica como `DOMAIN_PRESERVED` y no sufre modificaciones.
   - **Caso 3 (Modo `dry_run: true`):** Verifica que reporta los conteos exactos sin tocar ni borrar ningún archivo en disco.
   - **Caso 4 (`syncGlobalGeminiMd` e `install-skill --include-scripts --reconcile`):** Verifica que `~/.gemini/GEMINI.md` se actualiza de forma no destructiva con el bloque conector `QA_11X_MCP_CONNECTOR_START` (incluyendo `propose_skill_evolution_pr`) y que `certify11xGate` devuelve `upstream_evolution_reminder`.
2. **Actualizar `mcp-server/test/mcp_cli_test.feature`:**
   - Validar el registro de `reconcile_agents_governance` en `server.ts`.
3. **Ejecución en Contenedor Efímero (`Rule Zero`):**
   ```bash
   docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"
   ./.agents/scripts/certify_task_completion.sh
   ```
