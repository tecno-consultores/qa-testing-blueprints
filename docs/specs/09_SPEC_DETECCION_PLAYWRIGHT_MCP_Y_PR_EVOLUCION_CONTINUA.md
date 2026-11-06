# 🌐 Especificación 09: Detección Asistida de Navegador (Playwright / Browser MCP) y Pull Requests de Evolución Continua Zero-Trust (`propose_skill_evolution_pr`)

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Componentes Objetivo (Hito 10):** `mcp-server/src/tools/inspect-project.ts`, `mcp-server/src/tools/propose-evolution-pr.ts`, `mcp-server/src/server.ts`, `mcp-server/src/types.ts`, `.agents/skills/qa-11x-architect/SKILL.md`, `mcp-server/tests/propose-evolution-pr.unit.ts`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Claude / Antigravity  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 10)

---

## 1. Propósito

Esta especificación define dos capacidades estratégicas para cerrar el ciclo autónomo del ecosistema `@sinfallas/mcp-qa-11x` y `qa-11x-architect`:

1. **Diagnóstico e Instalación Guiada de Pruebas en Navegador Real (Playwright + `@axe-core/playwright` + Browser MCP):**
   - La Ley 4 de `qa-11x-architect` (*Visual Geometry & Anti-JSDOM Layout*) exige validar la interfaz en un navegador Chromium real con Playwright (`@playwright/test` + `@axe-core/playwright`), Lighthouse CI (`@lhci/cli`) y, durante la inspección interactiva del agente, un servidor MCP de navegador (`@playwright/mcp` o `chrome-devtools-mcp`).
   - Cuando un usuario abre un proyecto frontend existente (`vue3` o `react-frontend`) que aún no tiene instalados estos paquetes o cuyo IDE no tiene configurado el MCP de Playwright, el servidor MCP debe detectarlo de inmediato, informarle qué falta, darle los comandos exactos de instalación y ofrecerle inyectar la configuración automáticamente con `bootstrap_or_merge_11x`.
2. **Evolución Continua Federada con Cero Secretos Empaquetados (`propose_skill_evolution_pr`):**
   - Cuando un agente de IA descubre una mejora, un nuevo caso borde o una optimización para cualquiera de las skills o plantillas de `qa-testing-blueprints` mientras trabaja en un proyecto (`rosgrid`, `condominio-app`, etc.), puede proponer formalmente esa mejora hacia el repositorio central `tecno-consultores/qa-testing-blueprints` combinando **dos mecanismos 100% seguros (Zero-Trust, 0 tokens empaquetados)**:
     - **Mecanismo Primario (Opción 1 — `gh` CLI Local Autenticado):** Si el host tiene instalado y autenticado el CLI oficial de GitHub (`gh auth status`), ejecuta `gh` vía `execFile` (`shell: false`) para crear la rama/fork `evolution/<slug>` y abrir el Pull Request automáticamente.
     - **Mecanismo de Respaldo Universal (Opción 2 — Cero Credenciales: Archivo de Propuesta Local + URL Pre-llenada de GitHub):** Si `gh` no está instalado/autenticado (o si el usuario prefiere revisar antes en el navegador), guarda la propuesta con su diff en `<project_path>/.agents/proposals/<slug>.md` y genera una **URL pre-llenada de GitHub** (`https://github.com/tecno-consultores/qa-testing-blueprints/issues/new?title=...&body=...`) lista para abrir con 1 clic sin tocar ninguna credencial.

---

## 2. Parte A: Diagnóstico de Navegador Real y Playwright en `inspect_project_config`

### 2.1. Extensión de Interfaces en `mcp-server/src/types.ts`

Añadir la interfaz `BrowserTestingReadiness` dentro de `ProjectInspectionResult`:

```typescript
export interface BrowserTestingReadiness {
  applicable: boolean; // true si detected_stacks incluye 'vue3' o 'react-frontend'
  playwright_test_installed: boolean; // '@playwright/test' en package.json
  axe_core_playwright_installed: boolean; // '@axe-core/playwright' en package.json
  lhci_cli_installed: boolean; // '@lhci/cli' en package.json
  e2e_spec_present: boolean; // existe e2e/accessibility.e2e.ts o e2e/*.e2e.ts
  browser_mcp_configured_in_ide: boolean; // detectado @playwright/mcp o chrome-devtools en config del IDE
  install_instructions: string[]; // Comandos claros o invocación de bootstrap_or_merge_11x
}
```

### 2.2. Lógica de Detección en `mcp-server/src/tools/inspect-project.ts`

Crear la función modular `evaluateBrowserTestingReadiness(projectPath: string, files: string[], stacks: StackName[], homeDir?: string): BrowserTestingReadiness` (con complejidad cognitiva <= 10):

1. Si `stacks` no incluye `'vue3'` ni `'react-frontend'`, devuelve:
   ```typescript
   {
     applicable: false,
     playwright_test_installed: false,
     axe_core_playwright_installed: false,
     lhci_cli_installed: false,
     e2e_spec_present: false,
     browser_mcp_configured_in_ide: false,
     install_instructions: [],
   }
   ```
2. Si incluye `'vue3'` o `'react-frontend'`:
   - Lee `package.json` (en la raíz o en `vue3/package.json` / `react-frontend/package.json`) y verifica en `dependencies` y `devDependencies`:
     - `playwright_test_installed`: presencia de `'@playwright/test'`.
     - `axe_core_playwright_installed`: presencia de `'@axe-core/playwright'`.
     - `lhci_cli_installed`: presencia de `'@lhci/cli'`.
   - Verifica `e2e_spec_present`: si algún archivo en `files` coincide con `/e2e\/.*\.e2e\.ts$/`.
   - Verifica `browser_mcp_configured_in_ide` inspeccionando de forma segura (`fs.existsSync` + `fs.readFileSync`) si alguno de los archivos de configuración del agente en `homeDir || os.homedir()` (`~/.gemini/antigravity/mcp_config.json`, `~/.claude.json`, `.cursor/mcp.json`) contiene `'playwright'` o `'chrome-devtools'`.
   - Construye `install_instructions`:
     - Si falta alguno de los paquetes npm (`@playwright/test`, `@axe-core/playwright`, `@lhci/cli`) o `e2e/accessibility.e2e.ts`, añade:
       `"Ejecute la tool MCP 'bootstrap_or_merge_11x' para inyectar automáticamente @playwright/test, @axe-core/playwright, @lhci/cli y e2e/accessibility.e2e.ts en el proyecto."`
     - Si `browser_mcp_configured_in_ide` es `false`, añade:
       `"Para inspección visual Anti-JSDOM en navegador real desde su agente IA, agregue el servidor MCP de Playwright en su configuración MCP: npx -y @playwright/mcp@latest"`

---

## 3. Parte B: Herramienta MCP `propose_skill_evolution_pr` (Opción 1 `gh` CLI + Opción 2 URL/Patch Sin Credenciales)

### 3.1. Esquema Zod de Entrada (`mcp-server/src/tools/propose-evolution-pr.ts`)

```typescript
import { z } from 'zod';

export const ProposeEvolutionPrInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe('Ruta absoluta del proyecto donde se descubrió la mejora.'),
  target_blueprint_file: z
    .string()
    .min(1)
    .describe(
      'Ruta relativa en qa-testing-blueprints a mejorar (ej. ".agents/skills/qa-11x-architect/SKILL.md").'
    ),
  improvement_title: z
    .string()
    .min(5)
    .describe('Título conciso en español de la mejora propuesta para el PR.'),
  empirical_rationale: z
    .string()
    .min(10)
    .describe('Explicación técnica en español del caso borde o mejora descubierta en producción.'),
  proposed_content_or_snippet: z
    .string()
    .min(10)
    .describe('Contenido o bloque Markdown/código propuesto para incorporar en la skill o plantilla.'),
  prefer_offline_fallback: z
    .boolean()
    .optional()
    .default(false)
    .describe('Si es true, omite gh CLI y genera directamente el archivo de propuesta + URL pre-llenada.'),
});
```

### 3.2. Contrato TypeScript de Salida (`mcp-server/src/types.ts`)

```typescript
export interface ProposeEvolutionPrResult {
  status: 'PR_CREATED_VIA_GH' | 'PROPOSAL_FILE_AND_URL_GENERATED';
  target_repo: string;
  target_blueprint_file: string;
  branch_name: string;
  gh_cli_authenticated: boolean;
  pull_request_url: string | null;
  prefilled_github_url: string;
  local_proposal_file: string;
  message: string;
}
```

### 3.3. Algoritmo Seguro Zero-Trust (`mcp-server/src/tools/propose-evolution-pr.ts`)

Para cumplir con `DISA APSC-DV-002510` (prohibición de `shell: true`), `DISA APSC-DV-000650` (cero secretos empaquetados) y `sonarjs/cognitive-complexity <= 15`:

1. **Sanitización de Slug y Nombre de Rama (`buildEvolutionSlug`):**
   - Convierte `improvement_title` en un slug alfanumérico en minúsculas (`^[a-z0-9-]+$`, máximo 40 caracteres) y genera `branchName = "evolution/" + slug`.
2. **Generación Siempre Garantizada del Archivo Local de Propuesta y URL Pre-llenada (Opción 2 — Cero Credenciales):**
   - Crea el directorio `<project_path>/.agents/proposals/` si no existe.
   - Escribe `<project_path>/.agents/proposals/${slug}.md` con el título, archivo destino (`target_blueprint_file`), justificación empírica y bloque propuesto.
   - Construye la URL pre-llenada de GitHub:
     ```typescript
     const UPSTREAM_REPO = 'tecno-consultores/qa-testing-blueprints';
     const issueTitle = `[Evolution] ${input.improvement_title}`;
     const issueBody = [
       `### Archivo Objetivo en \`${UPSTREAM_REPO}\``,
       `\`${input.target_blueprint_file}\``,
       '',
       '### Justificación Empírica (Dogfooding)',
       input.empirical_rationale,
       '',
       '### Cambio / Bloque Propuesto',
       '```markdown',
       input.proposed_content_or_snippet,
       '```',
     ].join('\n');
     const prefilledUrl = `https://github.com/${UPSTREAM_REPO}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
     ```
3. **Intento de Creación Automática de PR vía `gh` CLI Local del Usuario (Opción 1):**
   - Si `input.prefer_offline_fallback` es `false`:
     - Ejecuta `execFile('gh', ['auth', 'status'], { shell: false, timeout: 10000 })`.
     - Si `gh auth status` devuelve código `0` (el usuario tiene `gh` autenticado en su máquina) y el directorio `project_path` o un clon temporal permite ejecutar `gh pr create --repo tecno-consultores/qa-testing-blueprints --title ... --body ...`:
       - Si el PR se crea con éxito, devuelve `status: 'PR_CREATED_VIA_GH'` con `pull_request_url` apuntando al PR recién creado y también incluye `local_proposal_file` y `prefilled_github_url`.
     - Si `gh` no está instalado, no está autenticado o el comando requiere interacción en navegador (ej. fork manual), **no lanza error**: captura la condición de forma limpia y devuelve `status: 'PROPOSAL_FILE_AND_URL_GENERATED'` con el archivo local `.agents/proposals/${slug}.md` y la URL `prefilled_github_url` lista para enviar con 1 clic.

---

## 4. Actualización de `.agents/skills/qa-11x-architect/SKILL.md` (Playbook 7)

Añadir en `.agents/skills/qa-11x-architect/SKILL.md`:
- **Playbook 7: Continuous Skill Evolution & Upstream PR Proposal (`propose_skill_evolution_pr`):**
  - Cuando el agente descubra un nuevo patrón de calidad, un caso borde no documentado o una mejora a las skills (`qa-11x-architect`, `refactoring-ui`, etc.), debe invocar `propose_skill_evolution_pr` para abrir el Pull Request vía `gh` CLI local o entregar al usuario el archivo de propuesta y el enlace pre-llenado de GitHub.
- En el **Playbook 1 y Playbook 2**:
  - Incluir la revisión de `browser_testing_readiness` en proyectos frontend (`vue3`, `react-frontend`) para ofrecer la instalación inmediata de `@playwright/test`, `@axe-core/playwright` y el registro de `@playwright/mcp` si no están presentes.

---

## 5. Requisitos de Pruebas 11X para el Hito 10

1. **Pruebas Unitarias para Diagnóstico de Navegador (`mcp-server/tests/tools-and-resources.unit.ts`):**
   - Verificar que en un proyecto `vue3` sin `@playwright/test` ni `.gemini/antigravity/mcp_config.json`, `inspectProjectConfig` devuelve `browser_testing_readiness.applicable === true`, `playwright_test_installed === false`, `browser_mcp_configured_in_ide === false` y las instrucciones de instalación exactas.
   - Verificar que cuando `package.json` incluye `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, existe `e2e/accessibility.e2e.ts` y `mcp_config.json` contiene `@playwright/mcp`, todos los indicadores devuelven `true` e `install_instructions` está vacío.
2. **Suite Unitaria Dedicada para `propose_skill_evolution_pr` (`mcp-server/tests/propose-evolution-pr.unit.ts`):**
   - **Caso 1 (Fallback Opción 2 sin `gh` CLI o `prefer_offline_fallback: true`):** Verifica que se crea `.agents/proposals/<slug>.md`, que `status === 'PROPOSAL_FILE_AND_URL_GENERATED'` y que `prefilled_github_url` contiene la URL válida hacia `https://github.com/tecno-consultores/qa-testing-blueprints/issues/new`.
   - **Caso 2 (Opción 1 con `gh` CLI autenticado simulado con mock):** Verifica la transición a `status === 'PR_CREATED_VIA_GH'` y la extracción de `pull_request_url`.
   - **Caso 3 (Seguridad Zero-Trust):** Verifica que nunca se lee ni transmite ningún token hardcodeado.
3. **Comandos de Certificación en Contenedor Efímero (Regla Cero):**
   ```bash
   docker compose -f mcp-server/docker-compose.qa.yml run --rm qa-mcp sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"
   python3 scripts/generar-manifiesto.py
   bash .agents/scripts/certify_task_completion.sh
   ```
