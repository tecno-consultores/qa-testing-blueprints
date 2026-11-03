# 🛡️ Cuadro de Mando de Aseguramiento de Calidad (TESTING.md) — Estándar Corporativo 11X

Este documento constituye la bitácora viva y certificación del estándar de calidad Nivel 11X para los blueprints del repositorio `qa-testing-blueprints`. Todos los ecosistemas incluidos son evaluados bajo la **Regla Cero** (`Rule Zero`): ejecución estricta y 100% aislada en contenedores Docker efímeros.

---

## 1. Métricas Globales y Umbrales Innegociables

| Dimensión de Calidad | Herramienta Canónica | Umbral Mínimo Requerido | Acción ante Incumplimiento |
| :--- | :--- | :--- | :--- |
| **Cobertura Unitaria** | `pytest-cov`, `vitest`, `kcov` | **$\ge 95.0\%$** de líneas y ramas | Bloqueo inmediato de Merge / Exit Code 1 |
| **Complejidad Ciclomática** | `radon` (Python), `eslint-plugin-sonarjs` | Grado **A** o **B** (Cognitiva $\le 15$) | Rechazo por deuda técnica |
| **Mantenibilidad** | `radon mi` | Grado **A** ($> 20$) | Refactorización obligatoria |
| **Seguridad Estática (SAST)** | `bandit`, `eslint-plugin-security`, `ShellCheck` | **0 hallazgos HIGH / MEDIUM** | Bloqueo por vulnerabilidad |
| **CVEs en Dependencias & SBOM** | `uv pip audit`, `pnpm audit`, `trivy`, `cyclonedx-py` | **0 vulnerabilidades CRITICAL / HIGH** + SBOM CycloneDX | Bloqueo de suministro de software |
| **Seguridad Dinámica (DAST & OSHP)**| `zaproxy/zap-stable` (OWASP ZAP + WSTG/ASVS/OSHP) | **0 alertas HIGH**, cabeceras OSHP y estado Fail-Secure | Bloqueo dinámico en CI/CD |
| **Pruebas de Mutación** | `mutmut`, `stryker` | Puntuación de mutación $> 80\%$ | Rechazo por asertos débiles |
| **Comportamiento BDD** | `sinfallas/karatelabs:latest` (Gherkin) | **100% de escenarios PASSED** | Bloqueo de flujo funcional |
| **Paridad de Esquema DB** | `.agents/scripts/verify_alembic_orm_parity.py` | **0 tablas huérfanas / revision $\le 32$ chars** | Rechazo por Anti-Mock Blindness |
| **Componentes Huérfanos** | `.agents/scripts/verify_zero_orphan_vue_components.py` | **0 componentes sin test unitario** | Bloqueo en pre-commit |
| **Paridad Endpoints API** | `.agents/scripts/verify_no_orphan_api_endpoints.py` | **0 llamadas 404/405 Front-Back** | Bloqueo por desalineación de contratos |
| **Accesibilidad Web** | `@axe-core/playwright` | **0 violaciones WCAG 2.1 AA** | Rechazo de interfaz táctica |
| **Rendimiento Frontend** | `Lighthouse CI` | **Puntuación $\ge 90$** (Core Web Vitals) | Bloqueo de compilación estática |
| **Secret Scanning** | `./scripts/verificar-secretos.sh` | **0 secretos / API keys en código** | Rechazo en pre-commit |
| **Integridad de Manifiesto** | `scripts/generar-manifiesto.py --check` | **100% hashes SHA-256 sincronizados** | Bloqueo de deriva Zero-Clone |

---

## 2. Matriz de Ecosistemas Tecnológicos y Comandos Efímeros

### ⚡ FastAPI (Backend Python) — 13 Capas
* **Imagen Base:** `sinfallas/base-python-uv:3.15`
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
* **Imagen Base:** `sinfallas/base-node-ionic:26`
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
* **Imagen Base:** `sinfallas/base-node-ionic:26`
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
* **Imagen Base:** `sinfallas/base-python-uv:3.15`
* **Comandos de Validación:**
  ```bash
  cd python
  make qa-lint       # Ruff, Mypy, Bandit, Radon
  make qa-unit       # Pytest + Pytest-BDD + Pytest-Benchmark (>= 95%)
  make qa-mutation   # Mutmut
  make qa-all        # Ejecución consolidada
  ```

### ⚛️ React (Frontend Vite / TypeScript)
* **Imagen Base:** `sinfallas/base-node-ionic:26`
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

### 🧠 MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x`)
* **Imagen Base:** `sinfallas/base-node-ionic:26`
* **Comandos de Validación:**
  ```bash
  cd mcp-server
  pnpm run lint      # ESLint 8.57 + eslint-plugin-security + SonarJS (Cognitiva <= 15)
  pnpm run typecheck # tsc --noEmit (0 errores de tipado)
  pnpm run test:unit # Vitest v8 con reporte de cobertura (>= 95%)
  pnpm run build     # tsc -> emite dist/ con binario ejecutable index.js
  ```

---

## 3. Compuerta de Certificación Pre-Commit (`certify_task_completion.sh`)

Antes de autorizar cualquier integración de código o cerrar una tarea técnica, se debe ejecutar la compuerta universal de certificación:

```bash
./.agents/scripts/certify_task_completion.sh
```

El script evalúa de forma secuencial e implacable 9 compuertas obligatorias:
1. **[1/9] Secret Scanning:** Detección de claves privadas, tokens y credenciales vía `scripts/verificar-secretos.sh`.
2. **[2/9] Local Dependency & IaC Security Audit:** Escaneo estático de vulnerabilidades y manifiestos Docker Compose con Trivy (`auditar-infra.sh` + `.trivy.yaml`).
3. **[3/9] No Duplicate JSON Keys:** Prevención de colisiones y sobreescrituras en diccionarios (`verify_json_no_duplicate_keys.py`).
4. **[4/9] Zero Orphan Components:** Verificación determinista de cobertura unitaria para el 100% de componentes UI (`verify_zero_orphan_vue_components.py`).
5. **[5/9] Zero Orphan API Endpoints:** Verificación bidireccional de paridad de rutas entre Frontend y Backend (`verify_no_orphan_api_endpoints.py`).
6. **[6/9] Topological Health & AST Layer Boundaries:** Validación de acoplamiento y límites de capas arquitectónicas (`verify_topological_health.py`).
7. **[7/9] Database Schema & Migration Parity:** Inspección de modelos SQLAlchemy frente a migraciones Alembic y longitud de `revision <= 32` chars (`verify_alembic_orm_parity.py`).
8. **[8/9] Cryptographic Manifest Synchronization:** Verificación estricta de coherencia y hashes SHA-256 en `manifest.json` (`scripts/generar-manifiesto.py --check`) asegurando integridad Zero-Clone (DISA STIG `V-222513`).
9. **[9/9] Documentation & Mandatory Tests Synchronization:** Verificación incondicional de consistencia en `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`, `README.md` y suites de pruebas 11X.

---

## 4. Pruebas Unitarias de Herramientas y Scripts (`tests/`)

* **Generador y Validador de Manifiesto Criptográfico (`scripts/generar-manifiesto.py`):**
  * **Suite:** `tests/test_generar_manifiesto.unit.py` (12 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 bash -c "uvx coverage run tests/test_generar_manifiesto.unit.py && uvx coverage report -m --include='scripts/generar-manifiesto.py'"`
  * **Cobertura Alcanzada:** **98%** (superando el umbral innegociable del $\ge 95\%$).
  * **Aserciones Validadas:** Algoritmo de hashing SHA-256, categorización de `target_name` y `merge_strategy` para los 6 stacks, detección estricta de derivas con `--check` y robustez de entrada CLI.

* **Instalador Universal de Skills QA 11X (`scripts/install-skill.sh`):**
  * **Suites de Pruebas:**
    * **Python Unit:** `tests/test_install_skill.unit.py` (5 pruebas unitarias).
    * **BATS-core:** `bash-scripts/test/test_install_skill.bats` (3 aserciones funcionales en BATS).
  * **Ejecución Efímera:**
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-python-uv:3.15 bash -c "python3 tests/test_install_skill.unit.py"`
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-bash-qa:latest bats bash-scripts/test/`
    * `docker run --rm -v "${PWD}:/app" -w /app sinfallas/base-bash-qa:latest bash -c "shellcheck -s sh scripts/install-skill.sh && shfmt -d -i 2 -ci scripts/install-skill.sh"`
  * **Cobertura y Métricas:** **100% de aserciones aprobadas** (8/8 pruebas combinadas) y **0 errores / 0 advertencias** en ShellCheck y shfmt.
  * **Aserciones Validadas:** Auto-detección y resolución de destinos (`workspace`, `antigravity`, `claude`, `cursor`, `hermes`, `all`), verificación criptográfica SHA-256 de los 16 archivos de skills contra `manifest.json`, detección estricta de manipulaciones/tampering (abortando con código de salida 1 bajo DISA STIG `V-222513`), y verificación de flag `--help`.

* **Servidor MCP e Instalador de Skills Node.js / TypeScript (`mcp-server/`):**
  * **Suites de Pruebas Unitarias:**
    * `tests/github-fetcher.unit.ts` (18 pruebas): Hidratación remota, validación condicional `ETag` (304), verificación SHA-256 (`DISA STIG V-222513`), detección de tampering, fallback offline y local path override.
    * `tests/surgical-merger.unit.ts` (13 pruebas): Fusión quirúrgica no destructiva de `package.json`, `pyproject.toml`, `Makefile`, `.gitignore` y `.npmrc`, asignación de permisos `0o755` a scripts y modo `dryRun`.
    * `tests/inspect-project.unit.ts` (7 pruebas): Detección automática de stacks (`python`, `fastapi`, `vue3`, `react-frontend`, `node-backend`, `bash-scripts`), banderas estrictas (`mypy`, `tsconfig`, `npmrc`) y archivos 11X ausentes.
    * `tests/tools-and-resources.unit.ts` (32 pruebas): Recursos `blueprint://*` (incluyendo `blueprint://core/active-task-template` y `blueprint://core/cleanup-script`), herramientas 1 a 5 (`inspect_project_config`, `fetch_blueprint_bundle`, `bootstrap_or_merge_11x`, `inspect_ast_blast_radius`, `clean_workspace_11x`), CLI `install-skill` multi-entorno y servidor `McpServer`.
  * **Ejecución Efímera:**
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run lint`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run typecheck`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run test:unit`
    * `docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server pnpm run build`
  * **Cobertura y Métricas Alcanzadas:**
    * **100% de aserciones aprobadas** (70/70 pruebas pasando).
    * **97.69% de cobertura de líneas y sentencias** (superando el umbral de $\ge 95\%$).
    * **93.25% de cobertura de ramas** (superando el umbral de $\ge 90\%$).
    * **98.36% de cobertura de funciones**.
    * **0 errores de ESLint, SonarJS (Cognitiva $\le 15$) y TypeScript (`strict: true`)**.

* **Script Universal de Limpieza y Saneamiento (`scripts/limpieza.sh`):**
  * **Validación de Calidad de Scripts:** ShellCheck en contenedor efímero `koalaman/shellcheck:stable` certificando **0 errores y 0 advertencias** (código de salida 0) en `scripts/limpieza.sh` y en los 6 scripts por stack (`fastapi/`, `vue3/`, `react-frontend/`, `node-backend/`, `python/`, `bash-scripts/`).
  * **Aserciones Validadas en Docker Efímero:**
    * Detención ordenada de contenedores efímeros y redes huérfanas (`docker compose down -v --remove-orphans`).
    * Erradicación de archivos bloqueados generados por Docker con privilegios `root` (UID 0: `.coverage`, `.pnpm-store`, `.pytest_cache`, `.mypy_cache`, etc.) sin requerir `sudo` mediante fallback Alpine.
    * Normalización determinista de permisos a `$(id -u):$(id -g)`, garantizando cero candados en el explorador gráfico (Nautilus).
    * Preservación del grafo semántico AST de Graphify (`GRAPH_REPORT.md`, `graph.html`, `graph.json`).
    * Soporte opcional de poda profunda con bandera `--deep` o `--docker-prune`.
