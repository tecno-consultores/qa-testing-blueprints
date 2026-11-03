# 📐 Especificación 06: Auditor de Brechas de la Pirámide de Pruebas 11X (`audit_test_pyramid_gaps`) y Playbook de Rescate

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Componentes Objetivo (Hito 7):** `mcp-server/src/tools/test-pyramid-auditor.ts`, `mcp-server/src/server.ts`, `.agents/skills/qa-11x-architect/SKILL.md`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Claude / Antigravity / Desarrolladores  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 7)

---

## 1. Propósito y Motivación Arquitectónica

Cuando un desarrollador o agente de IA instala `@sinfallas/mcp-qa-11x` y la skill `qa-11x-architect` en un **proyecto ya existente** (*Brownfield*), necesita responder de inmediato y sin consumir miles de tokens de exploración manual a la pregunta:

> *«¿Qué tipos de pruebas y qué archivos específicos de pruebas me faltan por crear hoy para que este proyecto alcance las 13 capas del Estándar 11X?»*

### 1.1. Diferencia frente a las Herramientas Existentes del Servidor MCP

| Herramienta MCP | Propósito Actual | Limitación frente al Diagnóstico de Brechas de Pruebas |
| :--- | :--- | :--- |
| **`inspect_project_config`** *(Tool 1)* | Detecta stacks activos (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`) y verifica la existencia de 6 archivos raíz (`docker-compose.qa.yml`, `Makefile`, `lefthook.yml`, etc.). | **No inspecciona** el directorio de pruebas ni evalúa cuáles de las 13 capas de la pirámide 11X están cubiertas, parciales o ausentes. |
| **`certify_11x_gate`** *(Tool 8)* | Compuerta binaria pre-commit (`gate_passed: true/false`) pensada para validar el cierre de una tarea sobre un proyecto ya instrumentado. | Evalúa solo invariantes puntuales de cierre, pero **no genera un inventario accionable** de módulos de negocio sin `.unit.*`, endpoints de API sin escenario en `api_test.feature`, ni capas faltantes (Mutación, Accesibilidad WCAG, Caos, DAST, Carga, Fixtures Trimodales). |
| **`audit_test_pyramid_gaps`** *(Nueva Tool 9 — Hito 7)* | **Auditor Diagnóstico de las 13 Capas de la Pirámide 11X:** Escanea estáticamente el árbol de código fuente (`src/`, `app/`, `scripts/`) y lo cruza contra el árbol de pruebas (`tests/`, `test/`, `e2e/`). | Entrega un diagnóstico completo por capa (`COVERED`, `PARTIAL`, `MISSING`, `NOT_APPLICABLE`), la lista exacta de **archivos fuente sin test unitario**, **endpoints API sin escenario BDD**, **vistas UI sin escenario BDD/E2E**, y un **plan de rescate priorizado** con las plantillas `blueprint://*` a utilizar. |

---

## 2. Especificación de Tool 9: `audit_test_pyramid_gaps`

### 2.1. Esquema Zod de Entrada (`mcp-server/src/tools/test-pyramid-auditor.ts`)

```typescript
import { z } from "zod";
import { StackNameSchema } from "../types.js";

export const AuditTestPyramidInputSchema = z.object({
  project_path: z
    .string()
    .min(1)
    .describe("Ruta absoluta del proyecto existente a auditar."),
  stack: StackNameSchema.optional().describe(
    "Stack específico a evaluar. Si se omite, autodetecta todos los stacks presentes en el proyecto."
  ),
});
```

### 2.2. Contratos e Interfaces TypeScript de Salida (`mcp-server/src/types.ts`)

```typescript
export type PyramidLayerStatus =
  | "COVERED"
  | "PARTIAL"
  | "MISSING"
  | "NOT_APPLICABLE";

export type GapPriority = "CRITICAL" | "HIGH" | "MEDIUM";

export interface PyramidLayerAudit {
  layer_number: number; // 1 a 13
  layer_id: string; // ej. "L03_UNIT_TESTING"
  layer_name: string; // Nombre en español de la capa 11X
  status: PyramidLayerStatus;
  applicable_stacks: StackName[];
  detected_evidence: string[]; // Archivos o scripts detectados (ej. ["tests/auth.unit.py", "Makefile:qa-unit"])
  missing_requirements: string[]; // Qué falta para llegar a COVERED
  recommended_blueprint_files: string[]; // Plantillas .example recomendadas del manifiesto
  make_target: string; // ej. "make qa-unit"
}

export interface UntestedApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  source_file: string;
  line: number;
}

export interface PrioritizedTestAction {
  step: number;
  priority: GapPriority;
  layer_number: number;
  title: string;
  action: string;
  target_files_to_create: string[];
  verification_command: string;
}

export interface TestPyramidGapResult {
  project_path: string;
  detected_stacks: StackName[];
  pyramid_score_pct: number; // Porcentaje ponderado (0 a 100%) sobre las capas aplicables
  summary_counts: {
    covered: number;
    partial: number;
    missing: number;
    not_applicable: number;
  };
  layers_audit: PyramidLayerAudit[]; // Las 13 capas evaluadas
  missing_test_inventory: {
    orphan_source_files: {
      source_file: string;
      expected_unit_test: string;
      stack: StackName;
    }[];
    untested_api_endpoints: UntestedApiEndpoint[];
    untested_ui_views: {
      view_file: string;
      expected_unit_test: string;
      present_in_bdd_feature: boolean;
      present_in_e2e_spec: boolean;
    }[];
  };
  prioritized_action_plan: PrioritizedTestAction[];
}
```

---

## 3. Matriz de Detección Estática de las 13 Capas de la Pirámide 11X

El motor `auditTestPyramidGaps()` evaluará de forma determinista (en `< 2 segundos`, sin ejecutar contenedores pesados) cada una de las **13 capas** definidas en `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md` y `.agents/skills/qa-11x-architect/references/01-core-13-layers.md`:

| N.º | ID Capa | Nombre de la Capa | Stacks Aplicables | Criterio `COVERED` | Criterio `PARTIAL` | Criterio `MISSING` |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | `L01_STATIC_SAST_IAC` | **Análisis Estático, Linters Inflexibles y SAST/IaC** | Todos | Configuración de linter estricto (`ruff`+`bandit` en Python, `eslint --max-warnings 0` con `security`+`sonarjs` en JS/TS, `shellcheck`+`shfmt` en Bash) **Y** presencia de `scripts/auditar-infra.sh` + `scripts/verificar-secretos.sh`. | Existe linter básico pero falta `--max-warnings 0`, falta plugin `security`/`sonarjs`/`bandit`, o faltan los scripts de auditoría IaC/secretos. | Sin configuración de linter ni scripts SAST/IaC. |
| **02** | `L02_STRICT_TYPING_COMPLEXITY` | **Tipado Estricto y Complejidad Ciclomática/Cognitiva** | `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend` | `mypy` con `strict = true` + `radon` en Python; o `tsconfig.json` con `"strict": true` + script `typecheck` (`tsc --noEmit` / `vue-tsc --noEmit`) + `sonarjs/cognitive-complexity` en TS. | Existe `tsconfig.json` o `mypy` sin `"strict": true` o sin validador de complejidad (`radon` / `sonarjs`). | Sin verificación de tipos ni control de complejidad. |
| **03** | `L03_UNIT_ISOLATED` | **Pruebas Unitarias Aisladas ($\ge 95\%$ Cobertura)** | Todos | Existen archivos `.unit.py`, `.unit.ts`, `.unit.tsx` o `.bats`, umbral `>= 95` configurado (`fail_under = 95` / `thresholds: 95` / `kcov`), **y `0` archivos de código fuente huérfanos** en `orphan_source_files`. | Existen pruebas unitarias pero hay archivos fuente en `src/` o `scripts/` sin su par `.unit.*`/`.bats` o el umbral de cobertura es `< 95%`. | `0` archivos de pruebas unitarias detectados. |
| **04** | `L04_ORM_MIGRATION_PARITY` | **Paridad Real de Esquemas ORM y Migraciones (Anti-Mock Blindness)** | `fastapi`, `python`, `node-backend` *(si usan BD/ORM)* | Directorio de migraciones (`alembic/versions/` o `migrations/versions/`), script `.agents/scripts/verify_alembic_orm_parity.py` y servicio `postgres:17-alpine` en `docker-compose.qa.yml`. *(Si no hay modelos ORM, marca `NOT_APPLICABLE`)*. | Existen modelos ORM y migraciones, pero falta `verify_alembic_orm_parity.py` o falta PostgreSQL real en `docker-compose.qa.yml`. | Existen modelos ORM en `src/models` pero no existen migraciones ni pruebas contra motor real. |
| **05** | `L05_CONTRACT_FUZZING_OPENAPI` | **Contratos de Integración y Fuzzing OpenAPI (Schemathesis)** | `fastapi`, `node-backend`, `vue3`, `react-frontend` | Suite de contratos (`*.spec.py` / Schemathesis en backend) y validador `.agents/scripts/verify_no_orphan_api_endpoints.py` para paridad bidireccional Front-Back. | Existe validación parcial de rutas pero sin suite de contrato `*.spec.*` o sin Schemathesis en `docker-compose.qa.yml`. | Sin pruebas de contrato ni validador de paridad de endpoints. |
| **06** | `L06_BDD_API_KARATE` | **Pruebas BDD de Caja Negra de API (Karate Labs API)** | `fastapi`, `node-backend` | Existe `test/api_test.feature` (con escenarios `Scenario:`), servicio `karate` en `docker-compose.qa.yml` y **`0` endpoints huérfanos en `untested_api_endpoints`**. | Existe `api_test.feature`, pero aún hay endpoints declarados en el backend sin cobertura en escenarios BDD (`untested_api_endpoints.length > 0`). | No existe archivo `api_test.feature` ni configuración de Karate Labs API. |
| **07** | `L07_BDD_UI_KARATE` | **Pruebas BDD de Flujos de Negocio en UI (Karate Labs UI)** | `vue3`, `react-frontend` | Existe `test/ui_business_flow.feature` validando flujos de usuario en navegador real y todas las vistas de `src/views/` o `src/pages/` están representadas. | Existe `ui_business_flow.feature` pero hay vistas principales sin cobertura de flujo (`untested_ui_views`). | No existe `ui_business_flow.feature`. |
| **08** | `L08_MUTATION_TESTING` | **Pruebas de Mutación (Mutmut / Stryker)** | `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend` | Configuración de `mutmut` en `pyproject.toml` o `stryker.conf.json` / `@stryker-mutator/core` en `package.json` + target `qa-mutation` en `Makefile`. | Dependencia instalada sin configuración o sin target `qa-mutation` en `Makefile`. | Sin configuración ni herramienta de pruebas de mutación. |
| **09** | `L09_A11Y_WCAG_LIGHTHOUSE_GEOMETRY` | **Accesibilidad WCAG 2.1 AA, Geometría Anti-JSDOM y Lighthouse CI** | `vue3`, `react-frontend` | Existe `e2e/accessibility.e2e.ts` con `@axe-core/playwright` (`wcag2a`, `wcag2aa`), `lighthouserc.js` con umbral `categories:accessibility >= 0.95` y validación geométrica multi-viewport (`375px`, `768px`, `1440px`). | Existe Playwright E2E pero falta `@axe-core/playwright`, falta `lighthouserc.js` o falta inspección de geometría/bounding-box. | Sin pruebas E2E de accesibilidad ni Lighthouse CI. |
| **10** | `L10_PERF_LOAD_STRESS` | **Pruebas de Rendimiento, Concurrencia y Estrés (Locust / Artillery)** | `fastapi`, `node-backend` | Existe `test/locustfile.py` o `test/load-test.yml` (Artillery) y servicio `locust` / `artillery` en `docker-compose.qa.yml` + target `qa-perf`. | Existe archivo de pruebas de carga pero no está integrado en `docker-compose.qa.yml` o `Makefile`. | Sin pruebas de carga ni concurrencia. |
| **11** | `L11_DAST_OWASP_ZAP_OSHP` | **Seguridad Dinámica DAST (OWASP ZAP) y Cabeceras OSHP** | `fastapi`, `node-backend`, `vue3`, `react-frontend` | Servicio `zap` (`zaproxy/zap-stable`) en `docker-compose.qa.yml`, target `qa-dast` en `Makefile` y verificación de cabeceras de seguridad OWASP OSHP. | Se verifican cabeceras OSHP en código/Nginx pero falta el contenedor efímero de escaneo dinámico `zap`. | Sin escaneo DAST OWASP ZAP ni pruebas de cabeceras OSHP. |
| **12** | `L12_CHAOS_RED_OBSERVABILITY` | **Ingeniería del Caos y Telemetría RED Pre-Caos (Pumba + Prometheus)** | Todos | Instrumentación `/metrics` (Prometheus) o `Pushgateway` (en CLI/Bash) + servicio `pumba` en `docker-compose.qa.yml` + target `qa-chaos`. | Existe instrumentación `/metrics` o `pumba`, pero no ambos integrados. | Sin telemetría RED ni inyección de fallos con Pumba. |
| **13** | `L13_TRIMODAL_FIXTURES_NEGATIVE` | **Fixtures Trimodales de Verdad de Campo e Invariantes Negativos** | Todos | Presencia de fixtures o casos de prueba que cubran los 3 estados canónicos (`virgin`/`default`/`empty`, `nominal`/`active`, y `degraded`/`error`/`timeout`) más prueba de blindaje productivo `--no-dev` (`test_production_no_dev_cleanliness.unit.py` en FastAPI). | Existen fixtures nominales y algún caso de error, pero falta la tríada completa o falta la prueba de aislamiento `--no-dev`. | Pruebas basadas únicamente en mocks felices (*Happy Path*) sin fixtures trimodales. |

---

## 4. Algoritmos de Descubrimiento Granular de Pruebas Faltantes (`missing_test_inventory`)

Más allá de evaluar las 13 capas a nivel macro, `audit_test_pyramid_gaps` entregará un inventario quirúrgico archivo por archivo para que el agente de IA o el desarrollador sepa **exactamente qué archivos de prueba crear**:

### 4.1. Descubrimiento de Archivos de Código Fuente sin Test Unitario (`orphan_source_files`)
1. Escanea los directorios de código productivo (`src/`, `app/`, `scripts/`), ignorando archivos de entrada o barril (`__init__.py`, `main.py`, `main.ts`, `index.ts`, `types.ts`, `*.d.ts`, `vite-env.d.ts`).
2. Para cada archivo fuente `<nombre>.<ext>`:
   - **En Python (`python`, `fastapi`):** Busca `tests/**/<nombre>.unit.py`, `tests/**/test_<nombre>.unit.py` o `tests/**/test_<nombre>.py`.
   - **En Node.js / Vue 3 / React (`node-backend`, `vue3`, `react-frontend`):** Busca `<nombre>.unit.ts`, `<nombre>.unit.tsx` (en `src/**` o `tests/**`), soportando coincidencia tanto en `PascalCase` como en `lowerCamelCase`.
   - **En Bash (`bash-scripts`):** Para cada `<script>.sh`, busca `test/test_<script>.bats` o `tests/<script>.bats`.
3. Todo archivo productivo sin su par de prueba unitaria se añade a `orphan_source_files` con la ruta exacta sugerida en `expected_unit_test` (máximo 50 ítems por respuesta para proteger el presupuesto de tokens).

### 4.2. Descubrimiento de Endpoints API sin Escenario BDD en Karate Labs (`untested_api_endpoints`)
1. Escanea archivos de rutas en el backend (`src/routers/**/*.py`, `src/api/**/*.py`, `src/routes/**/*.ts`, `src/controllers/**/*.ts`, `main.py`, `app.ts`).
2. Extrae mediante expresiones regulares las declaraciones de endpoints:
   - **FastAPI:** `@(?:router|app)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']` (combinando el `prefix` del `APIRouter` si existe).
   - **Express / Fastify / NestJS:** `(?:router|app|fastify)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']` o decoradores `@(Get|Post|Put|Patch|Delete)\(["']?([^"')]+)["']?\)`.
3. Lee el contenido de `test/api_test.feature` (o `fastapi/test/api_test.feature`, `node-backend/test/api_test.feature`).
4. Verifica si cada ruta declarada aparece invocada en `Given path`, `When method` o URL dentro del `.feature`. Si un endpoint carece de escenario BDD en Karate Labs, se reporta en `untested_api_endpoints`.

### 4.3. Descubrimiento de Vistas UI sin Escenario BDD / E2E (`untested_ui_views`)
1. Escanea `src/views/**/*.{vue,tsx}` y `src/pages/**/*.{vue,tsx}`.
2. Para cada vista:
   - Comprueba si posee prueba unitaria `.unit.ts` / `.unit.tsx`.
   - Comprueba si su ruta o identificador semántico (`data-testid`, título o path de vista) está cubierto en `test/ui_business_flow.feature` y en `e2e/*.e2e.ts`.
3. Si carece de cualquiera de ellos, lo incluye en `untested_ui_views`.

---

## 5. Ejemplo de Salida JSON Compacta de `audit_test_pyramid_gaps`

```json
{
  "project_path": "/workspace/mi-api-existente",
  "detected_stacks": ["fastapi", "vue3"],
  "pyramid_score_pct": 38,
  "summary_counts": {
    "covered": 3,
    "partial": 4,
    "missing": 6,
    "not_applicable": 0
  },
  "layers_audit": [
    {
      "layer_number": 3,
      "layer_id": "L03_UNIT_ISOLATED",
      "layer_name": "Pruebas Unitarias Aisladas (>= 95% Cobertura)",
      "status": "PARTIAL",
      "applicable_stacks": ["fastapi", "vue3"],
      "detected_evidence": ["fastapi/tests/test_health.unit.py"],
      "missing_requirements": [
        "4 archivos de código fuente carecen de prueba unitaria (.unit.py / .unit.ts).",
        "Falta configurar fail_under = 95 en [tool.coverage.report] de pyproject.toml."
      ],
      "recommended_blueprint_files": [
        "fastapi/pyproject.toml.example",
        "vue3/vitest.config.ts.example"
      ],
      "make_target": "make qa-unit"
    },
    {
      "layer_number": 6,
      "layer_id": "L06_BDD_API_KARATE",
      "layer_name": "Pruebas BDD de Caja Negra de API (Karate Labs API)",
      "status": "MISSING",
      "applicable_stacks": ["fastapi"],
      "detected_evidence": [],
      "missing_requirements": [
        "No existe fastapi/test/api_test.feature.",
        "3 endpoints de API carecen de escenarios BDD en Karate Labs."
      ],
      "recommended_blueprint_files": [
        "fastapi/test/api_test.feature.example",
        "fastapi/docker-compose.qa.yml"
      ],
      "make_target": "make qa-bdd"
    }
  ],
  "missing_test_inventory": {
    "orphan_source_files": [
      {
        "source_file": "fastapi/src/services/billing.py",
        "expected_unit_test": "fastapi/tests/test_billing.unit.py",
        "stack": "fastapi"
      },
      {
        "source_file": "vue3/src/components/InvoiceTable.vue",
        "expected_unit_test": "vue3/src/components/__tests__/InvoiceTable.unit.ts",
        "stack": "vue3"
      }
    ],
    "untested_api_endpoints": [
      {
        "method": "POST",
        "path": "/api/v1/invoices",
        "source_file": "fastapi/src/routers/invoices.py",
        "line": 28
      }
    ],
    "untested_ui_views": [
      {
        "view_file": "vue3/src/views/InvoicesView.vue",
        "expected_unit_test": "vue3/src/views/__tests__/InvoicesView.unit.ts",
        "present_in_bdd_feature": false,
        "present_in_e2e_spec": false
      }
    ]
  },
  "prioritized_action_plan": [
    {
      "step": 1,
      "priority": "CRITICAL",
      "layer_number": 3,
      "title": "Crear pruebas unitarias faltantes para archivos huérfanos",
      "action": "Crear los archivos .unit.py y .unit.ts listados en missing_test_inventory.orphan_source_files aislando red con mocks y cubriendo ramas de error.",
      "target_files_to_create": [
        "fastapi/tests/test_billing.unit.py",
        "vue3/src/components/__tests__/InvoiceTable.unit.ts"
      ],
      "verification_command": "make qa-unit"
    },
    {
      "step": 2,
      "priority": "CRITICAL",
      "layer_number": 6,
      "title": "Incorporar escenarios BDD en Karate Labs para endpoints sin cobertura",
      "action": "Hidratar fastapi/test/api_test.feature.example con bootstrap_or_merge_11x y escribir escenarios BDD (2xx nominal, 4xx validación, 401/403 seguridad) para los endpoints en untested_api_endpoints.",
      "target_files_to_create": ["fastapi/test/api_test.feature"],
      "verification_command": "make qa-bdd"
    }
  ]
}
```

---

## 6. Evolución de la Skill `qa-11x-architect`: Nuevo Playbook 6

En el Hito 7 se actualizará `.agents/skills/qa-11x-architect/SKILL.md` (y su referencia `references/01-core-13-layers.md`) para incorporar el **Playbook 6 — Existing Project Test Gap Audit & 13-Layer Rescue**:

1. **Cuándo se activa:** Siempre que el usuario pida auditar qué pruebas le faltan a un proyecto existente, evaluar el nivel de madurez frente al estándar 11X, o llevar un repositorio heredado (*legacy/brownfield*) al estándar corporativo.
2. **Secuencia Operativa en Modo MCP:**
   - **Paso 1:** Invocar `inspect_project_config(project_path)` para verificar la infraestructura base (`docker-compose.qa.yml`, `Makefile`).
   - **Paso 2:** Invocar `audit_test_pyramid_gaps(project_path)` para obtener el `pyramid_score_pct`, el estado de las 13 capas y el `missing_test_inventory` (`orphan_source_files`, `untested_api_endpoints`, `untested_ui_views`).
   - **Paso 3:** Presentar al usuario en español una tabla diagnóstica clara con la puntuación actual de su pirámide (`XX%`), las capas faltantes y el inventario exacto de pruebas por crear.
   - **Paso 4:** Si faltan archivos base de configuración de pruebas (`api_test.feature`, `accessibility.e2e.ts`, `lighthouserc.js`, `locustfile.py`), invocar `fetch_blueprint_bundle` y `bootstrap_or_merge_11x` para inyectar las plantillas `.example` sin destruir código existente.
   - **Paso 5:** Generar iterativamente las pruebas faltantes siguiendo el orden de `prioritized_action_plan` (`CRITICAL` $\rightarrow$ `HIGH` $\rightarrow$ `MEDIUM`), validando cada lote con `run_ephemeral_qa` en contenedores Docker efímeros (`Rule Zero`).

---

## 7. Requisitos de Pruebas 11X para el Hito 7 (`mcp-server/tests/`)

La implementación de `audit_test_pyramid_gaps` en el Hito 7 deberá cumplir estrictamente con:
1. **Suite Unitaria Dedicada (`mcp-server/tests/test-pyramid-auditor.unit.ts`):**
   - Cobertura $\ge 95.0\%$ en líneas, ramas, funciones y sentencias ejecutada dentro del contenedor efímero `sinfallas/base-node-ionic:26`.
   - Casos de prueba con proyectos sintéticos en directorios temporales cubriendo los 3 estados trimodales:
     - **Proyecto Virgen (0% pruebas):** Detecta todas las capas aplicables como `MISSING`, enumera el 100% de los archivos fuente en `orphan_source_files` y todos los endpoints en `untested_api_endpoints`.
     - **Proyecto Parcialmente Probado (Brownfield):** Detecta capas en estado `PARTIAL`, identifica únicamente los archivos fuente y endpoints que carecen de prueba y calcula el `prioritized_action_plan`.
     - **Proyecto 11X Completo (100%):** Certifica `pyramid_score_pct === 100`, `0` archivos huérfanos y `0` endpoints sin escenario BDD.
2. **Escenario BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`):**
   - Actualización del contrato BDD verificando la exposición de las **9 herramientas MCP** (incluyendo `audit_test_pyramid_gaps` y su esquema de entrada).
3. **Cero Errores y Cero Warnings:**
   - `pnpm run lint` (`eslint --max-warnings 0`) y `pnpm run typecheck` (`tsc --noEmit`) con `0` errores y `0` advertencias.
