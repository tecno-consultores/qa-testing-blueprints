# 🛡️ Cuadro de Mando de Aseguramiento de Calidad (TESTING.es.md) — Estándar Corporativo `QA-11X v3.5` (`v3.5.0`)

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](TESTING.md) · **Español (Espejo 1:1)**

Este documento constituye la bitácora viva y certificación del estándar de calidad Nivel 11X (`v3.5.0`) para los blueprints del repositorio `qa-testing-blueprints` (**10 stacks hidratables** `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue` + `architecture/` + `mcp-server/` = **12 entornos de matriz**). Todos los ecosistemas incluidos son evaluados bajo la **Regla Cero** (Rule Zero): ejecución estricta y 100% aislada en contenedores Docker efímeros con salida **Pass-Quiet / Fail-Verbose** (telemetría de 1 línea con métricas en éxito y traza completa en fallo para optimizar la ventana de contexto de los agentes IA).

---

## 1. Métricas Globales y Umbrales Innegociables

| Dimensión de Calidad | Herramienta Canónica | Umbral Mínimo Requerido | Acción ante Incumplimiento |
| :--- | :--- | :--- | :--- |
| **Cobertura Unitaria & Tipado Pre-Push** | `pytest-cov`, `vitest`, `kcov`, `mypy --strict --cache-dir=/tmp/mypy` (`COVERAGE_FILE=/tmp/.coverage` y `PYTHONPATH=/app/src` en Docker no-root vía `-u "$(id -u):$(id -g)"`: `UID 1001` en CI / `${QA_UID:-1000}` en local, sobrescribiendo el usuario por defecto `appuser UID 10001`; prohibido `-o addopts=""` sin `--import-mode=importlib --cov=src`) | **>= 95.0%** de líneas y ramas + **0 errores de tipos** | Bloqueo inmediato de Merge / Exit Code 1 (`QA-COV-01` / `QA-MYPY-01`) |
| **Complejidad Ciclomática** | `radon` (Python `--min B`), `eslint-plugin-sonarjs` | Grado **A** (`CC <= 5`, Cognitiva `<= 15`) | Rechazo por deuda técnica |
| **Mantenibilidad** | `radon mi` | Grado **A** (`> 20`) | Refactorización obligatoria |
| **Seguridad Estática (SAST)** | `bandit`, `eslint-plugin-security`, `ShellCheck` | **0 hallazgos HIGH / MEDIUM** | Bloqueo por vulnerabilidad |
| **CVEs en Dependencias & SBOM** | `pip-audit`, `pnpm audit`, `trivy`, `cyclonedx-py` | **0 vulnerabilidades CRITICAL / HIGH** + SBOM CycloneDX | Bloqueo de suministro de software |
| **Seguridad Dinámica (DAST & OSHP)** | `zaproxy/zap-stable` (OWASP ZAP + WSTG/ASVS/OSHP) | **0 alertas HIGH**, cabeceras OSHP y estado Fail-Secure | Bloqueo dinámico en CI/CD |
| **Pruebas de Mutación** | `mutmut`, `stryker`, `infection` | **`>= 80%` MSI** *(apunta a `>= 80%` en lugar del piso de `>= 95%` en cobertura unitaria de líneas/ramas debido a mutantes equivalentes y al costo exponencial de ejecución)* | Rechazo por asertos débiles |
| **Comportamiento BDD** | `sinfallas/karatelabs:1.5.1` (Gherkin) | **100% de escenarios PASSED** | Bloqueo de flujo funcional |
| **Paridad de Esquema DB & RLS/WORM** | `.agents/scripts/verify_alembic_orm_parity.py` + `SEC-13` (`after_begin` RLS + `NOBYPASSRLS`) + `QA-PG17-RLS` (`pg_class.relforcerowsecurity` con `JOIN pg_namespace`, nunca `pg_tables.forcerowsecurity`) + `SEC-14` (`seq_num` + `pg_advisory_xact_lock` WORM) | **0 tablas huérfanas / revision `<= 32` chars / RLS multi-tx / catálogo PG 15–17+ / cadena WORM determinista** | Rechazo por Anti-Mock Blindness / Fuga RLS / Race WORM |
| **Propagación Anti-Silo, Pre-Auth Multi-Etapa (`SEC-16`), Salud Real de Orquestadores (`QA-HEALTH-01`), 3 Fases Temporales y Batch por Ítem** | Contratos Read-After-Write, Pytest/Vitest, Karate BDD (`api_test.feature` / `ui_business_flow.feature`) y `audit_security_stig_owasp` | **0 mocks intermedios entre módulos, continuidad atómica `GETDEL`/Lua + `PREAUTH_PUBLIC_ROUTES` en flujos Pre-Auth, contrato sin mocks sobre sondas `healthcheck` (`/tmp/worker_heartbeat`) + `task.exception()` / `OPTIONAL_WORKERS`, 3 fases del reloj, 0 UUIDs crudos en `actor_username`, Refresco Dual (`[ 🔄 Refrescar ]`), `timeout >= 180s` + purga `0 bytes` y validación `results[].status` en batch `200 OK`** | Rechazo por Silo Mock Blindness / Unhealthy Container Escape / Pre-Auth 401 Escape |
| **Componentes Huérfanos** | `.agents/scripts/verify_zero_orphan_vue_components.py` | **0 componentes sin test unitario** | Bloqueo en pre-commit |
| **Paridad Endpoints API** | `.agents/scripts/verify_no_orphan_api_endpoints.py` | **0 llamadas 404/405 Front-Back** | Bloqueo por desalineación de contratos |
| **Accesibilidad Web** | `@axe-core/playwright` | **0 violaciones WCAG 2.1 AA** | Rechazo de interfaz táctica |
| **Rendimiento Frontend** | `Lighthouse CI` | **Puntuación `>= 90`** (Core Web Vitals) | Bloqueo de compilación estática |
| **Secret Scanning** | `./scripts/verificar-secretos.sh` | **0 secretos / API keys en código** | Rechazo en pre-commit |
| **Integridad de Manifiesto** | `scripts/generar-manifiesto.py --check` | **100% hashes SHA-256 sincronizados** | Bloqueo de deriva Zero-Clone |
| **Consistencia ROADMAP & Tarea Activa** | `.agents/scripts/verify_roadmap_consistency.py` | **100% coherencia tabla vs tareas `[x]` / cero pendientes en COMPLETED** | Rechazo de cierre por asimetría |

---

## 2. Matriz de Ecosistemas Tecnológicos y Comandos Efímeros

Alcance: **10 stacks hidratables** (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`) + `architecture/` + `mcp-server/` (= **12 entornos de matriz**).

### 🧭 Orquestación Raíz del Repositorio (`Makefile`)
| Comando | Alcance Efímero (Rule Zero) |
| :--- | :--- |
| `make clean` / `make qa-clean` | Purga artefactos temporales, cachés Docker y residuos con dueño root (`./scripts/limpieza.sh`) |
| `make audit` / `make sbom` / `make validate-calm` | Ejecuta auditoría IaC/CVE con Trivy, SBOM/CBOM CycloneDX + atestación SHA-256 y valida FINOS CALM (`architecture/qa-11x.calm.json`) |
| `make lint` / `make shellcheck` / `make shfmt` | ESLint (`--max-warnings 0`), TypeScript estricto, ShellCheck (`-x`) y formato POSIX `shfmt -d` |
| `make lint-workflows` / `make lint-docs` | Valida seguridad/claves en workflows GitHub, paridad documental/roadmap y `QA-GIT-GATE-01` |
| `make sync-governance` / `make version-check` | Verifica integridad SHA-256 en `manifest.json`, presupuestos cognitivos y paridad SemVer/edición |
| `make test` / `make certify` | Ejecuta la suite QA integral del monorepo o la compuerta de 10 etapas `.agents/scripts/certify_task_completion.sh` |
| `make test-mcp` / `make test-karate` / `make test-example` | Corre Vitest MCP (`>= 95%`, 43 suites), Karate Labs BDD (`52` escenarios) y E2E Clean-Room `.tgz` sobre `stdio` |
| `make test-py` / `make test-bats` / `make test-meta-qa` | Ejecuta unitarias Python, BATS-core + cobertura XML kcov y Meta-QA trimodal sobre `.agents/scripts/` |
| `make test-ai-offline` / `make audit-llm` | Corre contratos deterministas IA sin coste (`97.73%`) o auditorías bajo demanda DeepEval + Promptfoo OWASP |
| `make test-frontend-blueprints` / `make test-backend-blueprints` / `make test-mobile-blueprints` | Certifica Screenplay+antipatrones Vue/React, Pact V4+k6 FastAPI↔Node y `base-mobile-appium:26` W3C |
| `make diff-cov` / `make pr-verdict` / `make compact-context` / `make audit-psi` (`qa-psi`) | Verifica 100% cobertura delta en líneas (`>= 90%` ramas), exporta `PR_VERDICT.md`, compacta contexto Zero-LLM o corre PSI v5 |
| `make build` / `make publish-mcp-dry` / `make publish-mcp` | Compila `mcp-server/dist`; **`make publish-mcp` exige `QA-GIT-GATE-01` (requiere autorización humana explícita)** |

> **Nota sobre `Makefile.example` en el Monorepo:** Dentro de este repositorio de blueprints, los 10 directorios de stack hidratables proveen plantillas `Makefile.example` (copiadas/fusionadas en `Makefile` dentro de repositorios consumidores al hidratar vía `bootstrap_or_merge_11x`). Desde la raíz del monorepo, ejecuta los objetivos del `Makefile` raíz (`make test-*`) o `make -C <stack> -f Makefile.example qa-*`; dentro de proyectos consumidores hidratados (y en `mcp-server/` / `mcp-server/example/`), ejecuta `make qa-*` directamente.

### ⚡ FastAPI (Backend Python) — 13 Capas
* **Imagen Base:** `sinfallas/base-python-uv:3.15` (Tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`)
* **Persistencia:** `postgres:17-alpine` + `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch)
* **Comandos de Validación:**
  ```bash
  cd fastapi
  make qa-lint        # Ruff, Mypy strict (--cache-dir=/tmp/mypy), Bandit SAST, Radon complejidad
  make qa-unit        # Pytest aislado con --import-mode=importlib y mocks de red (Cobertura >= 95%)
  make qa-migration   # Verificación de paridad ORM vs Migraciones Alembic
  make qa-integration # Suite de integración efímera levantando y destruyendo PostgreSQL 17 + KeyDB
  make qa-ci          # Paridad pre-push 1:1 con CI (lint + unit + migration + integration)
  make qa-mutation    # Mutmut auditoría de asertos
  make qa-bdd         # Karate Labs BDD (test/api_test.feature; contratos Pact V4 vía make test-backend-blueprints en raíz)
  make qa-dast        # OWASP ZAP Baseline Scan contra http://api:8000
  make qa-chaos       # Pumba jitter + Locust concurrencia + Prometheus RED
  make qa-all         # Suite completa 11X
  ```

### 🟢 Vue 3 (Frontend TypeScript) — Alta Densidad Táctica
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Servidor Web:** `nginxinc/nginx-unprivileged:1.27-alpine` + `nginx-prometheus-exporter`
* **Comandos de Validación:**
  ```bash
  cd vue3
  make build-ui      # Compilación Vite de producción dentro de Docker efímero
  make qa-lint       # ESLint, Prettier, SonarJS, vue-tsc typecheck
  make qa-unit       # Vitest en jsdom con aislamiento total (>= 95%)
  make qa-orphans    # Auditoría de 0 componentes .vue sin test dedicado
  make qa-mutation   # Stryker mutantes en templates y lógica
  make qa-bdd        # Karate Labs HTTP/OSHP/SSG/XML en Nginx (test/ui_business_flow.feature)
  make qa-e2e        # Playwright regresión visual + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (Core Web Vitals >= 90)
  make qa-obs        # Smoke test del exportador Prometheus de Nginx y métricas RED
  make qa-psi URL=https://tu-dominio.com  # PageSpeed Insights v5 post-deploy (Lab + CrUX)
  make qa-all        # Pipeline completo
  ```

### 🟩 Node.js (Microservicios Express/Fastify)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Comandos de Validación:**
  ```bash
  cd node-backend
  make qa-lint       # ESLint, SonarJS, Prettier, audit dependencias
  make qa-unit       # Vitest + Nock aislamiento de red (>= 95%)
  make qa-contracts  # Pruebas de contrato Pact V4 sin infra (node --test tests/contracts/*.test.ts)
  make qa-mutation   # Stryker
  make qa-e2e        # Karate Labs BDD en http://api:3000
  make qa-dast       # Escaneo dinámico OWASP ZAP Baseline
  make qa-sbom       # Generación SBOM CycloneDX (pnpm sbom)
  make qa-stress     # Inyección de latencia Pumba + Artillery
  make qa-all        # Pipeline consolidado (lint + unit + contracts + mutation + e2e)
  ```

### 🐍 Python Standalone (Librerías y CLI)
* **Imagen Base:** `sinfallas/base-python-uv:3.15` (Tags disponibles: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`)
* **Comandos de Validación:**
  ```bash
  cd python
  make qa-lint          # Ruff, Mypy, Bandit, Radon
  make qa-unit          # Pytest + Pytest-BDD + Pytest-Benchmark (>= 95%)
  make qa-ci            # Paridad pre-push 1:1 con CI (lint + unit)
  make qa-mutation      # Mutmut
  make qa-load          # SLOs de rendimiento k6 (con API_BASE_URL / PYTHON_HTTP_CMD)
  make qa-observability # Pila de métricas Prometheus + Pushgateway
  make qa-all           # Ejecución consolidada (lint + unit + mutation)
  ```

### ⚛️ React (Frontend Vite / TypeScript)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Servidor Web:** `nginxinc/nginx-unprivileged:1.27-alpine` + `nginx-prometheus-exporter`
* **Comandos de Validación:**
  ```bash
  cd react-frontend
  make build-ui      # Compilación Vite de producción dentro de Docker efímero
  make qa-lint       # ESLint, React Hooks plugin, SonarJS, tsc
  make qa-unit       # Vitest + React Testing Library (>= 95%)
  make qa-orphans    # Auditoría recursiva de 0 componentes/vistas .tsx/.jsx sin test dedicado
  make qa-mutation   # Stryker
  make qa-bdd        # Karate Labs HTTP/OSHP/SSG/XML en Nginx (test/ui_business_flow.feature)
  make qa-e2e        # Playwright v1.52.0-noble + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (lighthouserc.cjs, Core Web Vitals >= 90)
  make qa-obs        # Smoke test del exportador Prometheus de Nginx y métricas RED
  make qa-psi URL=https://tu-dominio.com  # PageSpeed Insights v5 post-deploy (Lab + CrUX)
  make qa-all        # Pipeline completo
  ```

### 🐧 Bash / DevOps Scripts
* **Imagen Base:** `sinfallas/base-bash-qa:latest`
* **Comandos de Validación:**
  ```bash
  cd bash-scripts
  make qa-lint          # ShellCheck (0 errores/warnings) + shfmt POSIX
  make qa-unit          # BATS-core + bats-mock + kcov (>= 95%)
  make qa-observability # Pila Prometheus + Pushgateway
  make qa-all           # Ejecución consolidada (qa-lint + qa-unit)
  ```

### 🐘 PHP 8.2–8.5 (`sinfallas/basephpcomposer`) — 13 Capas
* **Imagen Base:** `sinfallas/basephpcomposer:8.5` (Tags disponibles: `8.2`, `8.3`, `8.4`, `8.5` y `latest` — Multi-Arch `amd64`/`arm64`)
* **Persistencia:** `postgres:17-alpine` + `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch) (vía `ext-redis` y `ext-pdo_pgsql`)
* **Comandos de Validación:**
  ```bash
  cd php
  make qa-lint       # PHP-CS-Fixer (@PER-CS2.0), PHPStan (level: max + cognitive-complexity <= 9), Psalm (--taint-analysis), composer audit
  make qa-unit       # Pest / PHPUnit con driver C PCOV (-d pcov.directory=src, o app en Laravel; Cobertura >= 95.0%)
  make qa-parity     # Validación de esquema real PostgreSQL 17, migraciones y FORCE ROW LEVEL SECURITY
  make qa-contracts  # Pruebas de conformidad OpenAPI / contratos en contenedor PHP efímero
  make qa-bdd        # Karate Labs BDD (test/api_test.feature)
  make qa-mutation   # Infection PHP (-d pcov.directory=src|app, MSI >= 80%, Covered MSI >= 80%)
  make qa-dast       # OWASP ZAP Baseline Scan contra el contenedor vivo PHP-FPM / Nginx
  make qa-load       # SLOs de carga k6 (smoke/load/stress)
  make qa-chaos      # Inyección de fallos de red Pumba + observabilidad RED
  make qa-sbom       # CycloneDX SBOM v1.6 (cyclonedx/cyclonedx-php-composer)
  make qa-all        # Suite completa 11X
  ```

### 🧠 MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x` `v3.5.0`)
* **Imagen Base:** `sinfallas/base-node-ionic:26` (Tags disponibles: `22`, `24`, `26` y `latest`)
* **Métricas 11X Certificadas (`v3.5.0` / `QA-11X v3.5`):**
  * **Sentencias (Statements):** `99.60%` (`>= 95.0%`)
  * **Ramas (Branches):** `96.75%` global (`src/resources` `98.41%`, `src/cli` `98.06%`, `surgical-merger.ts` `98.50%`)
  * **Funciones (Functions):** `99.88%` (`>= 95.0%`)
  * **Líneas (Lines):** `99.60%` (`>= 95.0%`)
  * **Pruebas Unitarias y Protocolo en Vivo:** **741 pruebas pasando al 100%** (43 suites Vitest incluyendo `tests/audit-hardening.unit.ts`, `tests/live-mcp-protocol.test.ts` sobre `InMemoryTransport` y `StdioClientTransport`, `tests/mobileBlueprint.test.ts`, `tests/path-real-resolver.unit.ts`, `tests/ide-config-paths.unit.ts`, `tests/cli-certify-audit.unit.ts`, `tests/cli-doctor-upgrade.unit.ts`, `tests/cli-dx-tools.unit.ts`, `tests/diff-blast-radius.unit.ts` con `git-signals`, `src/index.ts`, `QA-CLI-TTY-01`, `SEC-09` y `QA-SSR-HYDRATION-01`)
  * **Cobertura Diferencial Multi-Stack (`verify_diff_coverage.py`):** **100.00% líneas delta** y **>= 90.00% ramas delta** sobre los archivos modificados
  * **Herramientas MCP:** **19 herramientas canónicas** (12 núcleo v1 + 6 herramientas v2.0 de CALM, Release Gate, trayectoria agéntica, OWASP LLM Red Team, Vibe-Rescue y sincronización TMS + `session_flight_recorder` en **v3.1**) y **13 recursos `blueprint://*`** (11 URIs estáticas incluyendo `blueprint://skills/tactical-patterns-11x` en **v3.1** con negociación bilingüe `?lang=es|en` + 2 *resource templates*) con contrato Thin-Repo, autoconstrucción/refresco de grafos AST (`auto_build_if_missing`, `refresh_graph`), señales longitudinales Git (`include_git_signals`, `--git-signals`), modo *Metadata-Only* (`include_content: false`), agrupador por regla (`groupFindingsByRule`), 36 reglas estáticas del escáner (`SEC-01`..`SEC-16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-DOCKER-TTY-01`, `QA-CI-ESCAPE-01`, `QA-MAKE-CURDIR-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `QA-STRYKER-CFG-01`, `UI-11X-01..03`) que implementan los 22 puntos de control de referencia DISA ASD STIG V6R5 + OWASP v4.2 junto con la guardia humana de push `QA-GIT-GATE-01`, `TaskStateGuard` + `promptGuard` y paridad 10/10 en `certify_11x_gate`
  * **Escenarios BDD Karate Labs:** `mcp-server/test/mcp_cli_test.feature` (**52 escenarios** en `sinfallas/karatelabs:1.5.1`, incluyendo los **Escenarios 50–52** que cubren los 12 subcomandos CLI, rutas IDE compartidas, verificación clean-room de tarball, `blast-radius --git-signals`, `.claude-plugin/` y contratos SARIF v2.1.0)
  * **Compuertas CLI Headless en CI y Diagnóstico:** `doctor`/`status`, `upgrade`/`cache-clean` quirúrgico, `certify` (`--strict` salida `20` / `--release-gate` salida `30`), `audit` (`--mode security|pyramid|vibe|calm|all`, `--sarif` v2.1.0), `blast-radius` (`--changed-since` enrutando `DOCS_ONLY`/`MICRO_CHANGE`/`FULL_11X`), `mcp-config` (`--client <id> --install --pin-version` con respaldo `.11x-backup`), `completion <fish|bash|zsh>` y `--version --verbose|--json` offline.

### 🤖 AI / LLM Evals (`ai-evals/`), 📱 Móvil (`mobile-appium/`) y 🚑 Vibe Rescue (`vibe-rescue/`)
* **AI Offline (`make test-ai-offline` en `sinfallas/base-python-uv:3.15`):** **28 pruebas deterministas aprobadas** (4 pruebas `live` omitidas por diseño en modo offline), **97.73% cobertura**, `ruff CC <= 5` + `mypy --strict` con **0 hallazgos**.
* **Móvil Nativo/Híbrido (`mobile-appium/`):** Ejecutado sobre la imagen dedicada **`sinfallas/base-mobile-appium:26`** (`Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`), validando los binarios `java`/`adb`/`appium`, la suite unitaria TypeScript estricta + `MobileActor` Screenplay (`make test-mobile-blueprints` desde la raíz del monorepo) y `lint_test_antipatterns.py`; especificación en [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md).
* **Vibe-to-Enterprise Rescue (`vibe-rescue/`):** Auditoría AST-first (`audit_vibe_prototype.py`) con **21 pruebas unitarias (`99.40%` cobertura)**, `ruff CC <= 5` y `mypy --strict` (**0 hallazgos**).
* **Comandos de Validación:**
  ```bash
  # AI / LLM Evals, Vibe-Rescue y Móvil (Rule Zero en Docker efímero):
  cd ai-evals     && make qa-lint && make qa-unit && make qa-offline && make qa-ci && make audit-llm && make qa-all
  cd vibe-rescue  && make qa-lint && make qa-audit && make qa-audit-enforce && make qa-unit && make qa-ci && make qa-all
  cd mobile-appium && make qa-lint && make qa-unit && make qa-drivers && make qa-bridge && make qa-e2e && make qa-all

  # Desde la raíz del monorepo (verificación transversal):
  make test-ai-offline && make test-mobile-blueprints && make test-mcp && make test-karate && make test-example

  # Servidor MCP vía targets Makefile en Docker efímero (nunca pnpm/npx crudo en el host):
  cd mcp-server
  make qa-lint             # ESLint + eslint-plugin-security + SonarJS (--max-warnings 0)
  make qa-typecheck        # Verificación estricta TypeScript (0 errores de tipado)
  make qa-unit             # Vitest v8 con reporte de cobertura (>= 95%)
  make build               # Compila dist/ con binario ejecutable index.js
  make qa-example          # Validación en vivo Clean-Room sobre stdio + tarball .tgz
  make qa-e2e              # Karate Labs BDD (sinfallas/karatelabs:1.5.1)
  make qa-all              # Pipeline completo en Docker efímero

  # Publicación soberana a npmjs.org (QA-GIT-GATE-01: requiere autorización humana explícita):
  make publish-mcp-dry     # Simulación de validación y empaquetado (--dry-run)
  make publish-mcp         # Publicación en vivo a npmjs (PROHIBIDA sin aprobación humana explícita)
  ```

---

## 3. Compuerta de Certificación Pre-Commit (`certify_task_completion.sh`)

Antes de autorizar cualquier integración de código o cerrar una tarea técnica, se debe ejecutar la compuerta universal de certificación:

```bash
./.agents/scripts/certify_task_completion.sh
```

El script evalúa de forma secuencial e implacable 10 compuertas obligatorias:
1. **[1/10] Escaneo de Secretos:** Detección de claves privadas, tokens y credenciales vía `scripts/verificar-secretos.sh`.
2. **[2/10] Auditoría de Seguridad Local de Dependencias e IaC:** Escaneo estático de vulnerabilidades y manifiestos Docker Compose con Trivy (`scripts/auditar-infra.sh` + `.trivy.yaml`).
3. **[3/10] Sin Claves JSON Duplicadas:** Prevención de colisiones y sobreescrituras en diccionarios (`verify_json_no_duplicate_keys.py`).
4. **[4/10] Cero Componentes Huérfanos:** Verificación determinista de cobertura unitaria para el 100% de componentes UI (`verify_zero_orphan_vue_components.py`).
5. **[5/10] Cero Endpoints API Huérfanos:** Verificación bidireccional de paridad de rutas entre Frontend y Backend (`verify_no_orphan_api_endpoints.py`).
6. **[6/10] Salud Topológica y Límites de Capas AST:** Validación de acoplamiento y límites de capas arquitectónicas (`verify_topological_health.py`).
7. **[7/10] Paridad de Esquema de Base de Datos y Migraciones:** Inspección de modelos SQLAlchemy frente a migraciones Alembic y longitud de `revision <= 32` chars (`verify_alembic_orm_parity.py`).
8. **[8/10] Sincronización Criptográfica de Manifiesto y Versión:** Verificación estricta de hashes SHA-256 en `manifest.json` (`scripts/generar-manifiesto.py --check`, `.agents/scripts/sync_governance.py --check`) y paridad de versión/edición (`.agents/scripts/bump_version_11x.py --check`), asegurando integridad Zero-Clone (`DISA STIG V-222513`).
9. **[9/10] Consistencia de Roadmap y Tarea Activa:** Verificación de consistencia bidireccional estricta entre la tabla resumen de `ROADMAP.es.md` y sus tareas granulares (`- [x]` / `- [ ]`), y validación de ausencia de casillas pendientes en `.agents/ACTIVE_TASK.md` ante estados `COMPLETED` (`verify_roadmap_consistency.py`).
10. **[10/10] Sincronización de Documentación y Pruebas Obligatorias:** Verificación incondicional de consistencia en `CHANGELOG.es.md`, `ROADMAP.es.md`, `TESTING.es.md`, `README.es.md` y suites de pruebas 11X.

---

## 4. Pruebas Unitarias de Herramientas y Scripts (`tests/`)

* **Publicador Autónomo de Servidor MCP a npmjs (`scripts/publicar-mcp.sh`):**
  * **Suite:** `tests/test_publicar_mcp.unit.py` (12 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_publicar_mcp.unit.py`
  * **Cobertura Alcanzada:** **100% de aserciones aprobadas** (12/12 pruebas pasando).
  * **Aserciones Validadas:** Menú `--help` y opciones CLI, validación de no-root en el host, detección y rechazo de ejecución sin `NPM_TOKEN` en modo real, rechazo de token con valor de plantilla de ejemplo, manejo de `.env` ausente o configurado, detección de archivos `package.json` ausentes y bucle de reintento con tolerancia a consistencia eventual de CDN de npmjs (Hito 8).

* **Validador de Consistencia ROADMAP y Tarea Activa (`.agents/scripts/verify_roadmap_consistency.py`):**
  * **Suite:** `tests/test_verify_roadmap_consistency.unit.py` (19 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_verify_roadmap_consistency.unit.py`
  * **Cobertura Alcanzada:** **100% de aserciones aprobadas** (19/19 pruebas pasando).
  * **Aserciones Validadas:** Parseo de tablas de resumen de hitos enteros y decimales, conteo de tareas en secciones, detección de hitos 100% completados marcados como Pendientes (caso Hito 4), detección de hitos sin tareas marcados como Completados, asimetría de iconos en encabezados (`## ✅` vs `## ⏳`), validación de `ACTIVE_TASK.md` con tareas pendientes en `COMPLETED (100%)` y ejecución determinista CLI.

* **Generador y Validador de Manifiesto Criptográfico (`scripts/generar-manifiesto.py`):**
  * **Suite:** `tests/test_generar_manifiesto.unit.py` (16 pruebas unitarias).
  * **Ejecución Efímera:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 pytest -q --import-mode=importlib --cov=scripts --cov-report=term-missing tests/test_generar_manifiesto.unit.py`
  * **Cobertura Alcanzada:** **97%** (superando el umbral innegociable del `>= 95%`).
  * **Aserciones Validadas:** Algoritmo de hashing SHA-256, categorización de `target_name` y `merge_strategy` para los 10 stacks y `architecture/`, detección estricta de derivas con `--check` y robustez de entrada CLI.

* **Instalador Universal de Skills QA 11X (`scripts/install-skill.sh`):**
  * **Suites de Pruebas:**
    * **Python Unit y Meta-QA:** `tests/*.unit.py` + `tests/meta_qa/` + `vibe-rescue/tests/` (**313 pruebas recolectadas**, **99.14%** cobertura líneas+ramas con `ruff CC <= 5` y `mypy --strict`).
    * **BATS-core y ShellCheck (`sinfallas/base-bash-qa:latest`, rootless `--cap-drop=ALL --security-opt=no-new-privileges:true`):** `bash-scripts/test/ejemplo_mock.bats`, `tests/bats/{test_ci_make_escape,test_graphify_and_calm,test_install_skill,test_limpieza,test_pagespeed,test_repo_scripts}.bats` (**112 pruebas BATS**, **97.35% kcov normalizado** y ShellCheck con 0 advertencias).
  * **Ejecución Efímera:**
    * `docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=.agents/scripts:vibe-rescue:. -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 pytest -q --import-mode=importlib --cov=.agents/scripts --cov-fail-under=95 tests/*.unit.py tests/meta_qa/test_*.py`
    * `docker run --rm --network none --cap-drop=ALL --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e _USER=qa -v "${PWD}:/repo:ro" -w /repo/bash-scripts sinfallas/base-bash-qa:latest bash -c "shellcheck -x ../scripts/*.sh ../.agents/scripts/*.sh ../*/limpieza.sh ../mcp-server/example/verify-v2.sh ../instalar-hooks.sh ./*.sh && bats test/*.bats ../tests/bats/*.bats"`
  * **Cobertura y Métricas:** **100% de aserciones aprobadas** (**112** pruebas BATS, **313** pruebas Python unitarias + Meta-QA + Vibe-Rescue al **99.14%**) y **0 errores / 0 advertencias** en ShellCheck.
  * **Aserciones Validadas:** Auto-detección inteligente sin contaminar `$HOME/.agents`, resolución de destinos (`workspace`, `antigravity`, `claude`, `cursor`, `windsurf`, `codex`, `hermes`, `all`), instalación del catálogo completo de las 11 skills modulares (`qa-11x-architect`, `refactoring-ui`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `qa-11x-docker-certifier`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `tactical-patterns-11x`) más `.agents/schemas/`, verificación criptográfica SHA-256 contra `manifest.json`, detección estricta de manipulaciones/tampering (abortando con código de salida 1 bajo DISA STIG `V-222513`), y verificación de flag `--help`.

* **Servidor MCP e Instalador de Skills Node.js / TypeScript (`mcp-server/`):**
  * **Suites de Pruebas Unitarias:**
    * `tests/github-fetcher.unit.ts` (24 pruebas): Hidratación remota, validación condicional `ETag` (304), verificación SHA-256 (`DISA STIG V-222513`), detección de tampering, fallback offline, rechazo de `cacheDir`/`$HOME/.cache` symlink, escritura atómica CSPRNG `wx` y local path override.
    * `tests/surgical-merger.unit.ts` (30 pruebas): Fusión quirúrgica no destructiva de `package.json`, `pyproject.toml`, `Makefile`, `.gitignore` y `.npmrc`, inyección de `--max-warnings 0`, asignación de permisos `0o755` a scripts y modo `dryRun`.
    * `tests/inspect-project.unit.ts` (21 pruebas): Detección automática de los 10 stacks (`python`, `fastapi`, `vue3`, `react-frontend`, `node-backend`, `php`, `bash-scripts`, `ai-evals`, `mobile-appium`, `vibe-rescue`), banderas estrictas (`mypy`, `tsconfig`, `npmrc`), archivos 11X ausentes y `update_available`.
    * `tests/tools-and-resources.unit.ts` (56 pruebas) + `tests/promptGuard.test.ts` + `tests/session-flight-recorder.unit.ts`: Los recursos base v1 + 3 v2.0 + `blueprint://skills/tactical-patterns-11x` (`13` totales en `blueprint://*`), 19 herramientas (`inspect_project_config`..`session_flight_recorder`), CLI `quickstart` / `install-skill` con autodetección global Thin-Repo (`auto`), catálogo de skills, `--include-scripts` y servidor `McpServer`.
    * `tests/output-parsers.unit.ts` (33 pruebas): Parsers ahorradores de tokens para cobertura (Pytest, Vitest v8, Kcov), pruebas fallidas (Pytest, Vitest, BATS), linters y complejidad (Radon, Mypy, Ruff, ESLint, ShellCheck multi-línea/GCC), alertas de seguridad (Trivy, Bandit), mutación (Mutmut, Stryker), `tail_log` y condensación `parseQaOutput`.
    * `tests/security-auditor.unit.ts` (46 pruebas): Auditoría estática de seguridad DISA ASD STIG V6R5 + OWASP v4.2 con reglas `SEC-01` a `SEC-16`, `QA-*` y `UI-11X-01..03` (Mass Assignment, Anti-CSWSH, Command Injection, XXE, Unicode NFKC, XSS/`v-html`, Swagger en prod, Cabeceras OSHP, Zero-Trust NPM, Detección de Secretos, Auditoría Semántica Anti-UUID, Continuidad Pre-Auth y Geometría Visual Anti-JSDOM).
    * `tests/ephemeral-runner.unit.ts` (27 pruebas): Ejecución de targets `qa-${stage}` en Docker efímero bajo Rule Zero con `execFile` seguro (`shell: false`), control de timeouts (código 124), gestión de Makefile ausente, recolección efímera segura de reportes XML/LCOV (`ensureCoverageCacheDir` / `harvestCoverageReports` en `.agents/.cache/coverage/` purgando `<!DOCTYPE coverage ...>` y preservando trampas `<!ENTITY` Anti-XXE) y Fast-Path `DOCS_ONLY` (`isDocsOnlyWorkspaceChange` / `skipIfDocsOnly`).
    * `tests/findings-breaker.unit.ts` (6 pruebas): Normalización de huellas invariante a desplazamiento de líneas, aislamiento de sesiones por `{branch}:{merge_base_sha}` y stage en `.agents/.cache/certify_state.json` (`0700`/`0600`), detección de rachas `>= 3` y oscilaciones `A -> B -> A` (`BREAKER_42`, `exit_code=42`), bloqueo de symlinks/JSON corrupto, respaldo de alerta `formatFailVerboseReport` en `runEphemeralQa` y `--reset-state`.
    * `tests/diff-blast-radius.unit.ts` (13 pruebas): Poda semántica en 4 niveles (`diff-bundle.ts`), colapso de hunks > 80 líneas, ahorro `>= 60%` de tokens, redacción de secretos vía `promptGuard.ts`, cruce de dependientes AST, alerta `MISSING_KARATE_API_FEATURE`, fronteras en `ACTIVE_TASK.md`, rechazo de refs/rutas inseguras y contrato SDK de `inspect_ast_blast_radius` preservando `19` Tools y `13` Resources.
    * `tests/certify-gate.unit.ts` (29 pruebas): Compuerta unificada de certificación 11X verificando archivos `.example`, secret scanning, colisiones JSON, componentes huérfanos UI, paridad ORM vs Alembic, auditoría DISA/OWASP y sincronización documental (`TESTING.md` y `CHANGELOG.md`).
    * `tests/test-pyramid-auditor.unit.ts` (35 pruebas): Auditoría estática de las 13 capas de la pirámide 11X (`L01` a `L13`), evaluación trimodal (virgen 0%, brownfield parcial, nominal 100%), inventario de brechas (`orphan_source_files`, `untested_api_endpoints`, `untested_ui_views`), detectores de 3 fases temporales y refresco dual, y generación de planes de acción priorizados con targets `make qa-*` y blueprints recomendados.
    * `tests/init-agents-md.unit.ts` (19 pruebas): Inyector y actualizador aditivo no destructivo de `AGENTS.md` y conector global ligero `buildGlobalGeminiBlock` sin duplicación para `~/.gemini/GEMINI.md` (`Graphify AST-First` en Q&A y pre-cambio), validando creación desde cero con cabecera MIT, adición al final de directivas existentes sin alterar líneas previas, actualización idempotente del bloque conector (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`), simulación `dryRun`, robustez de banderas CLI (`--project-path`, `-p`, `--dry-run`) y ejecución CLI `runInitAgentsCli`.
    * `tests/reconcile-agents.unit.ts` (27 pruebas): Reconciliación automática Thin-Repo y deduplicación de `.agents/`, limpieza de archivos canónicos y skills duplicadas en proyectos consumidores, extracción de reglas de negocio a `domain_<project>_rules.md`, respaldos en `.agents/backups/` y sincronización idempotente de `~/.gemini/GEMINI.md`.
    * `tests/edge-cases.unit.ts` (33 pruebas): Cobertura profunda de casos de borde y ramas extremas en servicios y herramientas.
    * `tests/prepush-ci-parity.unit.ts` (7 pruebas): Sello criptográfico de evidencia `lint` (`.agents/.qa-evidence.json`) en `certify_11x_gate`, stages `migration`/`integration`/`ci`, normalización de template strings dinámicos (`` `/routers${query}` ``, `` `/bridge/${subPath}` ``, `{path:path}`) e invariantes `QA-MYPY-01`, `QA-PG17-RLS` y `QA-COV-01` (`--import-mode=importlib`).
    * `tests/v2-18-i18n-agents.unit.ts` (10 pruebas): Modo de idioma `--lang auto|es|en` (`QA_OUTPUT_LANG`), *Dynamic Language Mirroring*, targets globales `codex` y `windsurf` con autodetección y CLI bilingüe.
    * `tests/qa-health-dual-consumer.unit.ts` (28 pruebas): Regla estática `QA-HEALTH-01` (semántica `task.exception()` / `OPTIONAL_WORKERS` en supervisores `asyncio` y contrato de sondas físicas `healthcheck` en `Dockerfile`/`docker-compose*.yml` con exención `# qa-health-ok`) e inferencia + matriz de 3 capas Dual-Consumer en `propose_skill_evolution_pr`.
    * `tests/version-manager.unit.ts` (8 pruebas / 45+ aserciones): Comparación SemVer, sellos `.qa-11x-version` (confinamiento anclado con/sin `confinementRoot`), resolución con caché TTL de 24 h (`latest-version-check.json`) con rechazo de symlinks y *fail-open* offline, campo `update_available` en `inspect_project_config` y `certify_11x_gate`, y auto-sync silencioso en segundo plano de skills globales confinado contra symlinks por `SHA-256` preservando el idioma de `~/.gemini/GEMINI.md`.
    * **Nuevas Suites CLI, Protocolo en Vivo, Móvil y Seguridad (23 suites restantes de 43 suites Vitest):** `tests/audit-hardening.unit.ts`, `tests/cli-certify-audit.unit.ts`, `tests/cli-doctor-upgrade.unit.ts`, `tests/cli-dx-tools.unit.ts`, `tests/live-mcp-protocol.test.ts` (transporte real `InMemoryTransport` + `StdioClientTransport`), `tests/mobileBlueprint.test.ts`, `tests/path-real-resolver.unit.ts`, `tests/ide-config-paths.unit.ts`, `tests/v2-16-invariants.unit.ts`, `tests/a2a.test.ts`, `tests/agents27.test.ts`, `tests/aiTools.test.ts`, `tests/bootstrap-merge.unit.ts`, `tests/calm.test.ts`, `tests/diagnosticFormatter.test.ts`, `tests/fetch-bundle.unit.ts`, `tests/lifecycle_resilience.test.ts`, `tests/propose-evolution-pr.unit.ts`, `tests/quickstart.test.ts`, `tests/releaseGate.test.ts`, `tests/tmsSyncCli.test.ts`, `tests/vibeRescue.test.ts` y `tests/workspace-path-validator.unit.ts`.
    * `example/run-example-e2e.mjs` + `example/verify-v2.sh` + `scripts/probar-mcp-example.sh` (Arnés E2E Real sobre `stdio` Clean-Room + tarball `.tgz`): Clona el repositorio sin `node_modules` ni `dist`, compila y empaqueta `dist/index.js` en Docker efímero y conecta un cliente MCP oficial (`StdioClientTransport`) contra el tarball limpio en `/tmp` y la copia temporal de `mcp-server/example/` (`FastAPI + Vue 3`), certificando sin mocks los **13 recursos `blueprint://*`**, las **19 tools** (casos negativos y limpios) y los **12 subcomandos CLI** (`quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`, `--version`, `QA-CLI-TTY-01`); bloquea automáticamente `publicar-mcp.sh`, CI, `pre-push` y `make test-example`.
    * `mcp-server/test/mcp_cli_test.feature` (**52 escenarios Karate BDD**, incluyendo los **Escenarios 50–52** contrato de subcomandos CLI, `--git-signals` y rutas IDE compartidas): Alineación documental/contractual para `doctor` (`status`), `upgrade` quirúrgico (`cache-clean`), `certify` (`--strict` / `--release-gate`), `audit --sarif` (`security|pyramid|vibe|calm|all`), `blast-radius` (`--changed-since`, `--git-signals`), `mcp-config` (`--client <id> --install --pin-version`), `completion <fish|bash|zsh>` y `--version --verbose|--json`.
  * **Ejecución Efímera (`mcp-server/Makefile`):**
    * `make -C mcp-server qa-lint`
    * `make -C mcp-server qa-typecheck`
    * `make -C mcp-server qa-unit`
    * `make -C mcp-server build`
    * `make -C mcp-server qa-example && make -C mcp-server qa-e2e` (o `./scripts/probar-mcp-example.sh`)
  * **Cobertura y Métricas Alcanzadas:**
    * **100% de aserciones aprobadas** (**741** pruebas Vitest distribuidas en **43 suites Vitest** + **52** escenarios Karate BDD incluyendo los **Escenarios 50–52** de contratos CLI, `git-signals`, `.claude-plugin/` y rutas IDE + **292** pruebas Python unitarias y Meta-QA + **28** AI Offline (4 live omitidas) + **112** BATS + **21** Vibe-Rescue + E2E real sobre `stdio`).
    * **99.60% de cobertura de líneas/sentencias y 96.75% de cobertura de ramas** (superando el umbral de `>= 95%`).
    * **99.88% de cobertura de funciones**.
    * **0 errores de ESLint (`--max-warnings 0`), SonarJS (Cognitiva `<= 15`) y TypeScript (`strict: true`)**.

* **Script Universal de Limpieza y Saneamiento (`scripts/limpieza.sh`):**
  * **Suites de Pruebas:** `tests/test_stacks_hydration_smoke.unit.py` (aislado sin `docker`), `tests/bats/test_limpieza.bats`, `mcp-server/tests/tools-and-resources.unit.ts`, `mcp-server/tests/v2-16-invariants.unit.ts` y Escenario 27 de `mcp-server/test/mcp_cli_test.feature`.
  * **Validación de Calidad de Scripts:** ShellCheck y `shfmt` en contenedor efímero `sinfallas/base-bash-qa:latest` certificando **0 errores y 0 advertencias** (código de salida 0) en `scripts/limpieza.sh`, `scripts/probar-mcp-example.sh` y los 10 scripts canónicos `limpieza.sh` por stack (`fastapi/`, `vue3/`, `react-frontend/`, `node-backend/`, `python/`, `php/`, `bash-scripts/`, `mobile-appium/`, `ai-evals/`, `vibe-rescue/`) junto con `architecture/` y `mcp-server/` (**12 entornos de matriz**).
  * **Aserciones Validadas en Docker Efímero:**
    * Detención ordenada de contenedores efímeros (todos los perfiles Compose), redes y contenedores huérfanos *clean-room* (`docker compose --profile "*" down -v --remove-orphans` + purga selectiva por label `working_dir`).
    * Erradicación de restos de pruebas recientes (`allure-results/`, `.deepeval/`, `.promptfoo/`, `.agents/.cache/coverage/`, `.agents/.cache/tmp/`, `.agents/artifacts/`, `release-readiness.*`, `cbom*.json`, `/tmp/qa-11x-last-failure.json`, `/tmp/qa11x-certify.*`, `qa_mcp_cleanroom_*`, `qa-11x-mcp-example-e2e-*`) y archivos bloqueados por Docker `UID 0`/`10001` sin requerir `sudo` mediante fallback Alpine fijado.
    * Barrido recursivo de basura de SO/editores (`.DS_Store`, `Thumbs.db`, `Desktop.ini`, `*.swp`, `*.bak`, `*.orig`, `*.rej`) y `./ACTIVE_TASK.md` mal ubicado en raíz, normalizando permisos a `$(id -u):$(id -g)`.
    * Preservación estricta en limpieza por defecto de `.agents/ACTIVE_TASK.md`, `.agents/.cache/session_checkpoint.json`, `.agents/.cache/certify_state.json`, `mcp-server/dist`, `.qa-11x-version` y `graphify-out/{GRAPH_REPORT.md,graph.html,graph.json,manifest.json}` (purgando residuos internos de `graphify-out/`).
    * Soporte opcional de poda profunda con bandera `--deep` o `--docker-prune` (incluyendo `.agents/{backups,proposals,.qa-evidence.json,.cache}` y caché `~/.cache/qa-11x-blueprints`).

* **Auditor de Cobertura Diferencial Multi-Stack (`.agents/scripts/verify_diff_coverage.py` / `make diff-cov`):**
  * **Suite:** `tests/test_verify_diff_coverage.unit.py` (21 pruebas unitarias en `sinfallas/base-python-uv:3.15`, **100.00%** de cobertura de líneas y ramas sobre `verify_diff_coverage.py`, `ruff C901 <= 5` y `mypy --strict`).
  * **Aserciones Validadas:** Bloqueo Anti-XXE (`<!DOCTYPE`/`<!ENTITY` -> `exit 12`), contención contra traversal/symlinks fuera del workspace y `--base-ref` inseguros, parser Cobertura XML (`<sources>`, `/app/` -> workspace) y LCOV (`BRDA`, reescritura por stem de reporte ej. `mcp-server.info`), bloqueo Anti-Evasión (`# pragma: no cov`+`er`, `// v8 ig`+`nore`, `/* c8 ig`+`nore */`, `@codeCoverageIg`+`nore` -> `exit 11`) con exención auditada `QA11X-APPROVED-EXCLUSION(<motivo>)`, rechazo de archivos nuevos productivos sin reporte (`SIN_REPORTE`, `exit 12`) y Fast-Path `DOCS_ONLY` (`exit 0`).
* **Memoria Determinista de Hallazgos y Cortacircuitos Anti-Loop (`.agents/scripts/track_findings_state.py`):**
  * **Suites:** `tests/test_track_findings_state.unit.py` (10 pruebas unitarias en `sinfallas/base-python-uv:3.15`, **100.00%** cobertura de líneas/ramas, `ruff C901 <= 5` y `mypy --strict`), `mcp-server/tests/findings-breaker.unit.ts` y Escenario 35 de Karate Labs BDD (`mcp-server/test/mcp_cli_test.feature`).
  * **Aserciones Validadas:** Fingerprinting SHA-256 invariante a desplazamiento de líneas, aislamiento de sesiones por `{branch}:{merge_base_sha}` y stage en `.agents/.cache/certify_state.json` (`0700`/`0600`), tope de 10 corridas retenidas, máquina de estados `RESOLVED`/`PERSISTENT`/`REGRESSION_OSCILLATION`/`NEW`, disparo `exit 42` (`[BREAKER-42]`) ante `consecutive_streak >= 3` u oscilación `A -> B -> A`, integración en `certify_task_completion.sh` / `run_ephemeral_qa` y `--reset-state`.
* **Exportador Ejecutivo de Veredicto PR (`.agents/scripts/generate_pr_verdict.py` / `make pr-verdict`):**
  * **Suites:** `tests/test_generate_pr_verdict.unit.py` (10 pruebas en `sinfallas/base-python-uv:3.15`, `100%` líneas delta, `ruff C901 <= 5` y `mypy --strict`) y Escenario 36 de Karate Labs BDD (`mcp-server/test/mcp_cli_test.feature`).
  * **Aserciones Validadas:** Consolidación sin duplicar parsers de `release_readiness_gate.py`, `.agents/.qa-evidence.json`, `certify_state.json` (`BREAKER-42`), `verify_diff_coverage.py` y dependientes AST; clasificación de riesgo `BAJO`/`MEDIO`/`ALTO`, veredictos `APTO PARA MERGE`/`BLOQUEADO`, emisión `.agents/artifacts/PR_VERDICT.md` + `pr_verdict_attestation.json` (`0600`) con `SHA-256` canónico y `HMAC-SHA256` opcional (`QA11X_ATTESTATION_KEY`), bloqueo Anti-XXE/traversal/symlink/divergencia con `exit 30` y target `make pr-verdict`.
