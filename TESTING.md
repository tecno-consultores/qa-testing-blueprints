# 🛡️ Cuadro de Mando de Aseguramiento de Calidad (TESTING.md) — Estándar Corporativo 11X

Este documento constituye la bitácora viva y certificación del estándar de calidad Nivel 11X para los blueprints del repositorio `qa-testing-blueprints`. Todos los ecosistemas incluidos son evaluados bajo la **Regla Cero** (`Rule Zero`): ejecución estricta y 100% aislada en contenedores Docker efímeros con salida **Pass-Quiet / Fail-Verbose** (telemetría de 1 línea con métricas en éxito y traza completa en fallo para optimizar la ventana de contexto de los agentes IA).

---

## 1. Métricas Globales y Umbrales Innegociables

| Dimensión de Calidad | Herramienta Canónica | Umbral Mínimo Requerido | Acción ante Incumplimiento |
| :--- | :--- | :--- | :--- |
| **Cobertura Unitaria** | `pytest-cov`, `vitest`, `kcov` | **>= 95.0%** de líneas y ramas | Bloqueo inmediato de Merge / Exit Code 1 |
| **Complejidad Ciclomática** | `radon` (Python), `eslint-plugin-sonarjs` | Grado **A** o **B** (Cognitiva `<= 15`) | Rechazo por deuda técnica |
| **Mantenibilidad** | `radon mi` | Grado **A** (`> 20`) | Refactorización obligatoria |
| **Seguridad Estática (SAST)** | `bandit`, `eslint-plugin-security`, `ShellCheck` | **0 hallazgos HIGH / MEDIUM** | Bloqueo por vulnerabilidad |
| **CVEs en Dependencias & SBOM** | `uv pip audit`, `pnpm audit`, `trivy`, `cyclonedx-py` | **0 vulnerabilidades CRITICAL / HIGH** + SBOM CycloneDX | Bloqueo de suministro de software |
| **Seguridad Dinámica (DAST & OSHP)**| `zaproxy/zap-stable` (OWASP ZAP + WSTG/ASVS/OSHP) | **0 alertas HIGH**, cabeceras OSHP y estado Fail-Secure | Bloqueo dinámico en CI/CD |
| **Pruebas de Mutación** | `mutmut`, `stryker` | Puntuación de mutación `> 80%` | Rechazo por asertos débiles |
| **Comportamiento BDD** | `sinfallas/karatelabs:latest` (Gherkin) | **100% de escenarios PASSED** | Bloqueo de flujo funcional |
| **Paridad de Esquema DB** | `.agents/scripts/verify_alembic_orm_parity.py` | **0 tablas huérfanas / revision `<= 32` chars** | Rechazo por Anti-Mock Blindness |
| **Propagación Anti-Silo, 3 Fases Temporales, Timeouts Pesados, Batch por Ítem y Auditoría Semántica** | Contratos Read-After-Write, Pytest/Vitest, Karate BDD (`api_test.feature` / `ui_business_flow.feature`) | **0 mocks intermedios entre módulos, 3 fases del reloj (`Programada`, `En Curso`, `Cancelada/Expirada`), 0 UUIDs crudos en `actor_username`, Refresco Dual (`[ 🔄 Refrescar ]`), `timeout >= 180s` + purga `0 bytes` en transferencias pesadas y validación `results[].status` en batch `200 OK`** | Rechazo por Silo Mock Blindness / 2-State / Batch 200 Blindness |
| **Componentes Huérfanos** | `.agents/scripts/verify_zero_orphan_vue_components.py` | **0 componentes sin test unitario** | Bloqueo en pre-commit |
| **Paridad Endpoints API** | `.agents/scripts/verify_no_orphan_api_endpoints.py` | **0 llamadas 404/405 Front-Back** | Bloqueo por desalineación de contratos |
| **Accesibilidad Web** | `@axe-core/playwright` | **0 violaciones WCAG 2.1 AA** | Rechazo de interfaz táctica |
| **Rendimiento Frontend** | `Lighthouse CI` | **Puntuación `>= 90`** (Core Web Vitals) | Bloqueo de compilación estática |
| **Secret Scanning** | `./scripts/verificar-secretos.sh` | **0 secretos / API keys en código** | Rechazo en pre-commit |
| **Integridad de Manifiesto** | `scripts/generar-manifiesto.py --check` | **100% hashes SHA-256 sincronizados** | Bloqueo de deriva Zero-Clone |
| **Consistencia ROADMAP & Tarea Activa** | `.agents/scripts/verify_roadmap_consistency.py` | **100% coherencia tabla vs tareas [x] / cero pendientes en COMPLETED** | Rechazo de cierre por asimetría |


---

## 2. Matriz de Ecosistemas Tecnológicos y Comandos Efímeros

### ⚡ FastAPI (Backend Python) — 13 Capas
* **Imagen Base:** `sinfallas/base-python-uv:3.15` (Tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`)
* **Persistencia:** `postgres:17-alpine` + `eqalpha/keydb:alpine`
* **Comandos de Validación:**
  ```bash
  cd fastapi
  make qa-lint       # Ruff, Mypy strict, Bandit SAST, Radon complejidad
  make qa-unit       # Pytest aislado con mocks de red (Cobertura >= 95%)
  make qa-parity     # Verificación de esquema real PostgreSQL y migraciones Alembic
  make qa-contracts  # Schemathesis fuzzing de OpenAPI
  make qa-bdd        # Karate Labs BDD (test/api_test.feature)
  make qa-mutation   # Mutmut auditoría de asertos
  make qa-dast       # OWASP ZAP Baseline Scan contra http://api:8000
  make qa-chaos      # Pumba jitter + Locust concurrencia + Prometheus RED
  make qa-all        # Suite completa 11X
  ```

### 🟢 Vue 3 (Frontend TypeScript) — Alta Densidad Táctica
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Servidor Web:** `nginx:alpine` + `nginx-prometheus-exporter`
* **Comandos de Validación:**
  ```bash
  cd vue3
  make qa-lint       # ESLint, Prettier, SonarJS, vue-tsc typecheck
  make qa-unit       # Vitest en jsdom con aislamiento total (>= 95%)
  make qa-orphans    # Auditoría de 0 componentes .vue sin test dedicado
  make qa-mutation   # Stryker mutantes en templates y lógica
  make qa-bdd        # Karate Labs UI en Chrome Headless (test/ui_business_flow.feature)
  make qa-e2e        # Playwright regresión visual + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (Core Web Vitals >= 90)
  make qa-all        # Pipeline completo
  ```

### 🟩 Node.js (Microservicios Express/Fastify)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Comandos de Validación:**
  ```bash
  cd node-backend
  make qa-lint       # ESLint, SonarJS, Prettier, audit dependencias
  make qa-unit       # Vitest + Nock aislamiento de red (>= 95%)
  make qa-mutation   # Stryker
  make qa-e2e        # Karate Labs BDD en http://api:3000
  make qa-dast       # OWASP ZAP Baseline Scan
  make qa-stress     # Pumba inyección de latencia + Artillery
  ```

### 🐍 Python Standalone (Librerías y CLI)
* **Imagen Base:** `sinfallas/base-python-uv:3.15` (Tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`)
* **Comandos de Validación:**
  ```bash
  cd python
  make qa-lint       # Ruff, Mypy, Bandit, Radon
  make qa-unit       # Pytest + Pytest-BDD + Pytest-Benchmark (>= 95%)
  make qa-mutation   # Mutmut
  make qa-all        # Ejecución consolidada
  ```

### ⚛️ React (Frontend Vite / TypeScript)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Comandos de Validación:**
  ```bash
  cd react-frontend
  make qa-lint       # ESLint, React Hooks plugin, SonarJS
  make qa-unit       # Vitest + React Testing Library (>= 95%)
  make qa-mutation   # Stryker
  make qa-e2e        # Playwright visual regression + Axe
  ```

### 🐧 Bash / DevOps Scripts
* **Imagen Base:** `sinfallas/base-bash-qa:latest`
* **Comandos de Validación:**
  ```bash
  cd bash-scripts
  make qa-lint       # ShellCheck (0 errores/warnings) + shfmt POSIX
  make qa-unit       # BATS-core + bats-mock + kcov (>= 95%)
  ```

### 🐘 PHP 8.2–8.5 (`sinfallas/basephpcomposer`) — 13 Capas
* **Imagen Base:** `sinfallas/basephpcomposer:8.5` (Tags disponibles: `8.2`, `8.3`, `8.4`, `8.5` y `latest` — Multi-Arch `amd64`/`arm64`)
* **Persistencia:** `postgres:17-alpine` + `eqalpha/keydb:alpine` (vía `ext-redis` y `ext-pdo_pgsql`)
* **Comandos de Validación:**
  ```bash
  cd php
  make qa-lint       # PHP-CS-Fixer (@PER-CS2.0), PHPStan (level: max + cognitive-complexity <= 9), Psalm (--taint-analysis), composer audit
  make qa-unit       # Pest / PHPUnit con driver C PCOV (Cobertura >= 95.0%)
  make qa-parity     # Validación de esquema real PostgreSQL 17 y migraciones Doctrine / Laravel
  make qa-bdd        # Karate Labs BDD (test/api_test.feature)
  make qa-mutation   # Infection PHP (MSI >= 80%, Covered MSI >= 80%)
  make qa-sbom       # CycloneDX SBOM v1.6 (cyclonedx/cyclonedx-php-composer)
  make qa-all        # Suite completa 11X
  ```

### 🧠 MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x`)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Métricas 11X Certificadas:**
  * **Sentencias (Statements):** `99.27%` (`>= 95.0%`)
  * **Ramas (Branches):** `95.28%` (`>= 95.0%`)
  * **Funciones (Functions):** `100.00%` (`>= 95.0%`)
  * **Líneas (Lines):** `99.27%` (`>= 95.0%`)
  * **Pruebas Unitarias:** 270 pruebas pasando al 100% (13 suites en `tests/*.unit.ts`)
  * **Herramientas MCP:** 12 herramientas canónicas (`inspect_project_config`, `fetch_blueprint_bundle`, `bootstrap_or_merge_11x`, `inspect_ast_blast_radius`, `clean_workspace_11x`, `audit_security_stig_owasp`, `run_ephemeral_qa`, `certify_11x_gate`, `audit_test_pyramid_gaps`, `init_or_append_agents_md`, `propose_skill_evolution_pr`, `reconcile_agents_governance`)
  * **Escenarios BDD Karate Labs:** `mcp-server/test/mcp_cli_test.feature` (12 escenarios)
  * **Empaquetado npm:** 53.1 kB comprimido / 252.4 kB desempaquetado (0 fugas de código fuente)
* **Comandos de Validación:**
  ```bash
  cd mcp-server
  pnpm run lint      # ESLint 8.57 + eslint-plugin-security + SonarJS (Cognitiva <= 15)
  pnpm run typecheck # tsc --noEmit (0 errores de tipado)
  pnpm run test:unit # Vitest v8 con reporte de cobertura (>= 95% en todas las métricas)
  pnpm run build     # tsc -> emite dist/ con binario ejecutable index.js
  make qa-all        # Pipeline completo: lint + typecheck + unit + build

  # Publicación autónoma a npmjs.org (Modelo RoSGrid con credenciales en .env):
  make publish-mcp-dry # Simulación de validación y empaquetado (--dry-run)
  make publish-mcp     # Publicación oficial en vivo a npmjs
  ```

---

## 3. Compuerta de Certificación Pre-Commit (`certify_task_completion.sh`)

Antes de autorizar cualquier integración de código o cerrar una tarea técnica, se debe ejecutar la compuerta universal de certificación:

```bash
./.agents/scripts/certify_task_completion.sh
```

El script evalúa de forma secuencial e implacable 10 compuertas obligatorias:
1. **[1/10] Secret Scanning:** Detección de claves privadas, tokens y credenciales vía `scripts/verificar-secretos.sh`.
2. **[2/10] Local Dependency & IaC Security Audit:** Escaneo estático de vulnerabilidades y manifiestos Docker Compose con Trivy (`scripts/auditar-infra.sh` + `.trivy.yaml`).
3. **[3/10] No Duplicate JSON Keys:** Prevención de colisiones y sobreescrituras en diccionarios (`verify_json_no_duplicate_keys.py`).
4. **[4/10] Zero Orphan Components:** Verificación determinista de cobertura unitaria para el 100% de componentes UI (`verify_zero_orphan_vue_components.py`).
5. **[5/10] Zero Orphan API Endpoints:** Verificación bidireccional de paridad de rutas entre Frontend y Backend (`verify_no_orphan_api_endpoints.py`).
6. **[6/10] Topological Health & AST Layer Boundaries:** Validación de acoplamiento y límites de capas arquitectónicas (`verify_topological_health.py`).
7. **[7/10] Database Schema & Migration Parity:** Inspección de modelos SQLAlchemy frente a migraciones Alembic y longitud de `revision <= 32` chars (`verify_alembic_orm_parity.py`).
8. **[8/10] Cryptographic Manifest Synchronization:** Verificación estricta de coherencia y hashes SHA-256 en `manifest.json` (`scripts/generar-manifiesto.py --check`) asegurando integridad Zero-Clone (DISA STIG `V-222513`).
9. **[9/10] Roadmap & Active Task Consistency:** Verificación de consistencia bidireccional estricta entre la tabla resumen de `ROADMAP.md` y sus tareas granulares (`- [x]` / `- [ ]`), y validación de ausencia de casillas pendientes en `.agents/ACTIVE_TASK.md` ante estados `COMPLETED` (`verify_roadmap_consistency.py`).
10. **[10/10] Documentation & Mandatory Tests Synchronization:** Verificación incondicional de consistencia en `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`, `README.md` y suites de pruebas 11X.

---

## 4. Pruebas Unitarias de Herramientas y Scripts (`tests/`)

* **Publicador Autónomo de Servidor MCP a npmjs (`scripts/publicar-mcp.sh`):**
  * **Suite:** `tests/test_publicar_mcp.unit.py` (7 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_publicar_mcp.unit.py`
  * **Cobertura Alcanzada:** **100% de aserciones aprobadas** (7/7 pruebas pasando en 0.020s).
  * **Aserciones Validadas:** Menú `--help` y opciones CLI, validación de no-root en el host, detección y rechazo de ejecución sin `NPM_TOKEN` en modo real, rechazo de token con valor de plantilla de ejemplo, manejo de `.env` ausente o configurado, detección de archivos `package.json` ausentes y bucle de reintento con tolerancia a consistencia eventual de CDN de npmjs (Hito 8).

* **Validador de Consistencia ROADMAP y Tarea Activa (`.agents/scripts/verify_roadmap_consistency.py`):**
  * **Suite:** `tests/test_verify_roadmap_consistency.unit.py` (13 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_verify_roadmap_consistency.unit.py`
  * **Cobertura Alcanzada:** **100% de aserciones aprobadas** (13/13 pruebas pasando en 0.005s).
  * **Aserciones Validadas:** Parseo de tablas de resumen de hitos enteros y decimales, conteo de tareas en secciones, detección de hitos 100% completados marcados como Pendientes (caso Hito 4), detección de hitos sin tareas marcados como Completados, asimetría de iconos en encabezados (`## ✅` vs `## ⏳`), validación de `ACTIVE_TASK.md` con tareas pendientes en `COMPLETED (100%)` y ejecución determinista CLI.

* **Generador y Validador de Manifiesto Criptográfico (`scripts/generar-manifiesto.py`):**
  * **Suite:** `tests/test_generar_manifiesto.unit.py` (12 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 bash -c "uvx coverage run tests/test_generar_manifiesto.unit.py && uvx coverage report -m --include='scripts/generar-manifiesto.py'"`
  * **Cobertura Alcanzada:** **98%** (superando el umbral innegociable del `>= 95%`).
  * **Aserciones Validadas:** Algoritmo de hashing SHA-256, categorización de `target_name` y `merge_strategy` para los 6 stacks, detección estricta de derivas con `--check` y robustez de entrada CLI.

* **Instalador Universal de Skills QA 11X (`scripts/install-skill.sh`):**
  * **Suites de Pruebas:**
    * **Python Unit:** `tests/test_install_skill.unit.py` (6 pruebas unitarias).
    * **BATS-core:** `bash-scripts/test/test_install_skill.bats` (3 aserciones funcionales en BATS).
  * **Ejecución Efímera:**
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 bash -c "python3 tests/test_install_skill.unit.py"`
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-bash-qa:latest bats bash-scripts/test/`
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-bash-qa:latest bash -c "shellcheck -s sh scripts/install-skill.sh && shfmt -d -i 2 -ci scripts/install-skill.sh"`
  * **Cobertura y Métricas:** **100% de aserciones aprobadas** (9/9 pruebas combinadas) y **0 errores / 0 advertencias** en ShellCheck y shfmt.
  * **Aserciones Validadas:** Auto-detección inteligente sin contaminar `$HOME/.agents`, resolución de destinos (`workspace`, `antigravity`, `claude`, `cursor`, `hermes`, `all`), instalación del catálogo completo de las 5 skills (`qa-11x-architect`, `refactoring-ui`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `qa-11x-docker-certifier`), verificación criptográfica SHA-256 contra `manifest.json`, detección estricta de manipulaciones/tampering (abortando con código de salida 1 bajo DISA STIG `V-222513`), y verificación de flag `--help`.

* **Servidor MCP e Instalador de Skills Node.js / TypeScript (`mcp-server/`):**
  * **Suites de Pruebas Unitarias:**
    * `tests/github-fetcher.unit.ts` (18 pruebas): Hidratación remota, validación condicional `ETag` (304), verificación SHA-256 (`DISA STIG V-222513`), detección de tampering, fallback offline y local path override.
    * `tests/surgical-merger.unit.ts` (15 pruebas): Fusión quirúrgica no destructiva de `package.json`, `pyproject.toml`, `Makefile`, `.gitignore` y `.npmrc`, inyección de `--max-warnings 0`, asignación de permisos `0o755` a scripts y modo `dryRun`.
    * `tests/inspect-project.unit.ts` (7 pruebas): Detección automática de stacks (`python`, `fastapi`, `vue3`, `react-frontend`, `node-backend`, `bash-scripts`), banderas estrictas (`mypy`, `tsconfig`, `npmrc`) y archivos 11X ausentes.
    * `tests/tools-and-resources.unit.ts` (36 pruebas): Recursos `blueprint://*` (incluyendo `blueprint://core/active-task-template`, `blueprint://core/cleanup-script` y `blueprint://core/roadmap-validator`), herramientas 1 a 9 (`inspect_project_config`, `fetch_blueprint_bundle`, `bootstrap_or_merge_11x`, `inspect_ast_blast_radius`, `clean_workspace_11x`, `audit_security_stig_owasp`, `run_ephemeral_qa`, `certify_11x_gate`, `audit_test_pyramid_gaps`), CLI `install-skill` con autodetección multi-entorno (`auto`), catálogo de 5 skills, `--include-scripts` y servidor `McpServer`.
    * `tests/output-parsers.unit.ts` (26 pruebas): Parsers ahorradores de tokens para cobertura (Pytest, Vitest v8, Kcov), pruebas fallidas (Pytest, Vitest, BATS), linters y complejidad (Radon, Mypy, Ruff, ESLint, ShellCheck multi-línea/GCC), alertas de seguridad (Trivy, Bandit), mutación (Mutmut, Stryker), `tail_log` y condensación `parseQaOutput`.
    * `tests/security-auditor.unit.ts` (13 pruebas): Auditoría estática de seguridad DISA ASD STIG V6R5 + OWASP v4.2 con reglas `SEC-01` a `SEC-10` y `UI-11X-01` (Mass Assignment, Anti-CSWSH, Command Injection, XXE, Unicode NFKC, XSS/v-html, Swagger en prod, Cabeceras OSHP, Zero-Trust NPM, Detección de Secretos y Geometría Visual Anti-JSDOM).
    * `tests/ephemeral-runner.unit.ts` (7 pruebas): Ejecución de targets `qa-${stage}` en Docker efímero bajo Rule Zero con `execFile` seguro (`shell: false`), control de timeouts (código 124), gestión de Makefile ausente y Fast-Path Documental (`isDocsOnlyWorkspaceChange` / `skipIfDocsOnly`).
    * `tests/certify-gate.unit.ts` (10 pruebas): Compuerta unificada de certificación 11X verificando archivos `.example`, secret scanning, colisiones JSON, componentes huérfanos UI, paridad ORM vs Alembic, auditoría DISA/OWASP y sincronización documental (`TESTING.md` y `CHANGELOG.md`).
    * `tests/test-pyramid-auditor.unit.ts` (32 pruebas): Auditoría estática de las 13 capas de la pirámide 11X (`L01` a `L13`), evaluación trimodal (virgen 0%, brownfield parcial, nominal 100%), inventario de brechas (`orphan_source_files`, `untested_api_endpoints`, `untested_ui_views`), detectores de 3 fases temporales y refresco dual, y generación de planes de acción priorizados con targets `make qa-*` y blueprints recomendados.
    * `tests/init-agents-md.unit.ts` (15 pruebas): Inyector y actualizador aditivo no destructivo de `AGENTS.md`, validando creación desde cero con cabecera MIT, adición al final de directivas existentes sin alterar líneas previas, actualización idempotente del bloque conector (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`), simulación `dryRun`, robustez de banderas CLI (`--project-path`, `-p`, `--dry-run`) y ejecución CLI `runInitAgentsCli`.
    * `tests/reconcile-agents.unit.ts` (18 pruebas): Reconciliación automática y deduplicación de `.agents/`, extracción de reglas de negocio a `domain_<project>_rules.md`, respaldos en `.agents/backups/` y sincronización de `~/.gemini/GEMINI.md`.
    * `tests/edge-cases.unit.ts` (33 pruebas): Cobertura profunda de casos de borde y ramas extremas en servicios y herramientas.
  * **Ejecución Efímera:**
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run lint`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run typecheck`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run test:unit`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run build`
  * **Cobertura y Métricas Alcanzadas:**
    * **100% de aserciones aprobadas** (272/272 pruebas pasando en 13 suites).
    * **99.28% de cobertura de líneas y sentencias** (superando el umbral de `>= 95%`).
    * **95.32% de cobertura de ramas** (superando el umbral de `>= 95%`).
    * **100.00% de cobertura de funciones**.
    * **0 errores de ESLint (`--max-warnings 0`), SonarJS (Cognitiva `<= 15`) y TypeScript (`strict: true`)**.

* **Script Universal de Limpieza y Saneamiento (`scripts/limpieza.sh`):**
  * **Validación de Calidad de Scripts:** ShellCheck en contenedor efímero `koalaman/shellcheck:stable` certificando **0 errores y 0 advertencias** (código de salida 0) en `scripts/limpieza.sh` y en los 6 scripts por stack (`fastapi/`, `vue3/`, `react-frontend/`, `node-backend/`, `python/`, `bash-scripts/`).
  * **Aserciones Validadas en Docker Efímero:**
    * Detención ordenada de contenedores efímeros y redes huérfanas (`docker compose down -v --remove-orphans`).
    * Erradicación de archivos bloqueados generados por Docker con privilegios `root` (UID 0: `.coverage`, `.pnpm-store`, `.pytest_cache`, `.mypy_cache`, etc.) sin requerir `sudo` mediante fallback Alpine.
    * Normalización determinista de permisos a `$(id -u):$(id -g)`, garantizando cero candados en el explorador gráfico (Nautilus).
    * Preservación del grafo semántico AST de Graphify (`GRAPH_REPORT.md`, `graph.html`, `graph.json`).
    * Soporte opcional de poda profunda con bandera `--deep` o `--docker-prune`.
