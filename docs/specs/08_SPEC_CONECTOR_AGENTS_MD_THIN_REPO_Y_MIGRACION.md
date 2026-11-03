# 🔗 Especificación 08: Inyector Aditivo No Destructivo del Conector `AGENTS.md` (`init-agents`)

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Componentes Objetivo (Hito 9):** `mcp-server/src/cli/init-agents-md.ts`, `mcp-server/src/index.ts`, `mcp-server/src/services/surgical-merger.ts`, `mcp-server/src/server.ts`, `mcp-server/tests/init-agents-md.unit.ts`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Claude / Antigravity  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 9)

---

## 1. Propósito y Regla de Oro (Inyección 100% Aditiva y No Destructiva)

Al adoptar el ecosistema centralizado **MCP (`@sinfallas/mcp-qa-11x`) + Skills Globales (`qa-11x-architect` y `refactoring-ui`)** en proyectos nuevos o existentes (`rosgrid`, `rosgrid-web`, `condominio-app`, etc.), el repositorio necesita tener en su raíz un archivo `AGENTS.md` con las instrucciones **Siempre Activas (`always_on`)** para que el agente de IA cargue la skill y utilice el servidor MCP.

### 🛡️ Regla Innegociable de No Reemplazo:
1. **Si `AGENTS.md` NO existe en la raíz del proyecto:**
   - Crea el archivo `AGENTS.md` desde cero con el bloque conector del ecosistema QA 11X (`<!-- QA_11X_MCP_CONNECTOR_START --> ... <!-- QA_11X_MCP_CONNECTOR_END -->`).
2. **Si `AGENTS.md` YA existe en la raíz del proyecto:**
   - **PROHIBIDO reemplazar o borrar el contenido existente del archivo.**
   - Si el archivo existente aún no tiene el bloque conector, **agrega el bloque conector al archivo existente** conservando el 100% de las líneas, encabezados y reglas previas del usuario.
   - Si el archivo existente ya tiene los marcadores `<!-- QA_11X_MCP_CONNECTOR_START -->` y `<!-- QA_11X_MCP_CONNECTOR_END -->`, actualiza únicamente el interior de ese bloque de forma **idempotente** (para evitar duplicar el bloque si el comando se ejecuta múltiples veces), manteniendo intacto todo el resto del archivo.

---

## 2. Bloque Conector Canónico a Crear o Agregar en `AGENTS.md`

El bloque inyectado por `buildConnectorBlock(projectName, stacks)` está delimitado por comentarios HTML para garantizar idempotencia si se vuelve a ejecutar:

```markdown
<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 Central QA 11X Skill & MCP Server Connector (`@sinfallas/mcp-qa-11x`)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This project (`<PROJECT_NAME>`) enforces the **Level-11X Quality & DevSecOps Standard** via the centralized MCP Server and Global Skills. Before modifying code, running tests, or closing any task, you **MUST**:

1. **Activate Global Skills:** Load `qa-11x-architect` (for all backend, testing, Docker, and DevSecOps tasks) and `refactoring-ui` (for any Vue 3 / React / CSS / UI task).
2. **Enforce Rule Zero & Active Task Resilience:**
   - **Rule Zero:** NEVER run `pytest`, `vitest`, `npm`, `pnpm`, `uv`, migrations, or linters directly on the host OS. Execute everything inside ephemeral Docker containers (`docker-compose.qa.yml` / `Makefile`).
   - **Active Task Invariant:** Track progress in real time inside `.agents/ACTIVE_TASK.md` (`IN_PROGRESS` -> `COMPLETED (100%)`).
3. **Execute Mandatory MCP Tools (`@sinfallas/mcp-qa-11x`):**
   - `inspect_project_config` & `audit_test_pyramid_gaps`: Diagnose active stacks (`<DETECTED_STACKS>`) and missing test layers across the 13-layer pyramid.
   - `inspect_ast_blast_radius`: Audit incoming dependency edges before modifying shared modules.
   - `audit_security_stig_owasp`: Certify 0 `CRITICAL`/`HIGH` findings against the 22 DISA ASD STIG V6R5 & OWASP v4.2 patterns.
   - `run_ephemeral_qa`: Run linters (`--max-warnings 0`), unit tests (`>= 95%` coverage), and Karate Labs BDD scenarios in ephemeral Docker.
   - `certify_11x_gate` & `clean_workspace_11x`: Certify all closure checks and sanitize root-owned container files before `git commit` and `git push`.
<!-- QA_11X_MCP_CONNECTOR_END -->
```

- Cuando `AGENTS.md` **no existe**, se crea con el título `# 🤖 AI Agent Directives & Technical Governance — <PROJECT_NAME>\n\n` seguido del bloque conector.
- Cuando `AGENTS.md` **ya existe** y no tiene el marcador `<!-- QA_11X_MCP_CONNECTOR_START -->`, se **agrega** al final del contenido existente separado por `\n\n---\n\n`, sin tocar ni una sola línea previa del archivo.

---

## 3. Las 3 Vías de Ejecución de la Rutina

1. **Vía 1 — Subcomando CLI Directo (`npx -y @sinfallas/mcp-qa-11x@latest init-agents`):**
   ```bash
   npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--dry-run]
   ```
   Detecta el proyecto y sus stacks, y crea `AGENTS.md` (si no existe) o agrega el bloque conector al `AGENTS.md` existente (si ya existe).
2. **Vía 2 — Flag Integrado en `install-skill` (`--init-agents`):**
   ```bash
   npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents
   ```
   Instala las skills en los agentes detectados (`~/.gemini/config/skills`, etc.) y ejecuta `initOrAppendAgentsMd` sobre el directorio del proyecto actual (`cwd`).
3. **Vía 3 — Servidor MCP (`init_or_append_agents_md` y `SurgicalMerger.mergeAgentsMd`):**
   - Exposición como **Tool 10 (`init_or_append_agents_md`)** en `mcp-server/src/server.ts`.
   - Integración en `SurgicalMerger.resolveSurgicalMerge` (`mcp-server/src/services/surgical-merger.ts`) cuando `base === 'AGENTS.md'`.

---

## 4. Directivas de Implementación para Gemini 3.8 Flash High (`--max-warnings 0`)

### 4.1. Creación de `mcp-server/src/cli/init-agents-md.ts`

Para cumplir estrictamente `sonarjs/no-duplicate-string` y `sonarjs/cognitive-complexity <= 15`, **Gemini 3.8 Flash High** DEBE implementar `mcp-server/src/cli/init-agents-md.ts` con la siguiente estructura exacta:

```typescript
// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectProjectConfig } from '../tools/inspect-project.js';

export const CONNECTOR_START_MARKER = '<!-- QA_11X_MCP_CONNECTOR_START -->';
export const CONNECTOR_END_MARKER = '<!-- QA_11X_MCP_CONNECTOR_END -->';
const AGENTS_MD_FILENAME = 'AGENTS.md';

export interface InitAgentsMdOptions {
  projectPath: string;
  dryRun?: boolean;
}

export interface InitAgentsMdResult {
  project_path: string;
  agents_md_path: string;
  action: 'created' | 'appended' | 'updated_block' | 'dry_run';
  detected_stacks: string[];
  content: string;
}

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
```

---

### 4.2. Integración en `SurgicalMerger` (`mcp-server/src/services/surgical-merger.ts`)

1. Añadir el método público `mergeAgentsMd(targetContent: string, projectName = 'Project', stacks: string[] = []): { merged: string; changes: string[] }` en `SurgicalMerger` que invoque `mergeOrAppendAgentsMdContent(targetContent, projectName, stacks)`.
2. En `resolveSurgicalMerge(targetName, existingContent, exampleContent)` (línea 224 de `surgical-merger.ts`), añadir:
   ```typescript
   if (base === 'AGENTS.md') {
     const res = this.mergeAgentsMd(existingContent);
     return { finalContent: res.merged, changes: res.changes };
   }
   ```

---

### 4.3. Integración en el CLI (`mcp-server/src/index.ts` y `mcp-server/src/cli/install-skill.ts`)

1. En `mcp-server/src/index.ts`, añadir el subcomando `init-agents`:
   ```typescript
   if (arg1 === 'init-agents' || arg1 === 'init-agents-md') {
     await runInitAgentsCli(process.argv.slice(3));
     process.exit(0);
   }
   ```
2. En `mcp-server/src/cli/install-skill.ts`:
   - Si `args` incluye `--init-agents`, invocar `await initOrAppendAgentsMd({ projectPath: cwd })` al finalizar la instalación de skills.

---

### 4.4. Registro como Tool 10 en `mcp-server/src/server.ts`

Registrar la herramienta **`init_or_append_agents_md`** en `mcp-server/src/server.ts`:
- **Nombre:** `init_or_append_agents_md`
- **Descripción:** `Creates AGENTS.md if missing, or non-destructively appends the QA 11X MCP & Skill connector block to an existing AGENTS.md file without replacing any existing content.`
- **Input Schema:**
  - `project_path` (`string`, obligatorio)
  - `dry_run` (`boolean`, opcional, por defecto `false`)

---

## 5. Requisitos de Pruebas 11X para el Hito 9 (`mcp-server/tests/init-agents-md.unit.ts`)

1. **Suite Unitaria Dedicada (`mcp-server/tests/init-agents-md.unit.ts`):**
   - **Caso 1 (Creación cuando `AGENTS.md` no existe):** Verifica que se crea `AGENTS.md` con `action === 'created'`, incluyendo los stacks detectados y los marcadores `<!-- QA_11X_MCP_CONNECTOR_START -->` y `<!-- QA_11X_MCP_CONNECTOR_END -->`.
   - **Caso 2 (Adición no destructiva cuando `AGENTS.md` ya existe):** Dado un `AGENTS.md` existente con reglas personalizadas (ej. reglas de MikroTik RouterOS v7 o reglas de negocio de `condominio-app`), verifica que `action === 'appended'`, que el **100% del texto original permanece intacto al inicio del archivo**, y que el bloque conector se agrega al final.
   - **Caso 3 (Idempotencia al ejecutar múltiples veces):** Si se vuelve a ejecutar sobre un `AGENTS.md` que ya tiene el bloque conector, verifica que `action === 'updated_block'`, que el bloque conector **no se duplica**, y que todo el texto fuera de los marcadores se conserva intacto.
   - **Caso 4 (Simulación `dry_run: true`):** Devuelve el resultado esperado sin escribir ni modificar el archivo en disco.
2. **Escenario BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`):**
   - Validar el subcomando `init-agents` y la exposición de `init_or_append_agents_md` en `server.ts`.
3. **Certificación en Contenedor Efímero (Regla Cero):**
   ```bash
   docker compose -f mcp-server/docker-compose.qa.yml run --rm qa-mcp sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"
   bash .agents/scripts/certify_task_completion.sh
   ```
