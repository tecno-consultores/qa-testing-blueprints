<p align="center">
  <img src="assets/qa-logo.jpeg" alt="QA Testing Blueprints Logo" width="320" style="max-width: 100%; height: auto; border-radius: 8px;" />
</p>

# QA Testing Blueprints (Estándar Corporativo Nivel 11X)

Bienvenido a **QA Testing Blueprints**, el repositorio central de estándares, arquitecturas de prueba, buenas prácticas de ingeniería y gobernanza para **Agentes de Inteligencia Artificial** (Google Antigravity, Claude Code / Claude Desktop, Hermes Agent de Nous Research, Cursor, Windsurf) y desarrolladores humanos en la creación de software de nivel corporativo.

Este proyecto estandariza la forma en que construimos y validamos software, garantizando que **toda ejecución ocurra estrictamente dentro de contenedores Docker efímeros (`Rule Zero`)**, sin contaminar la máquina local, erradicando la ceguera de mocks mediante motores de base de datos reales y aplicando salvaguardas de seguridad por diseño desde el primer día.

---

## 🚀 Filosofía Principal (Estándar 11X)

1. **Efimeridad Absoluta (Cero Docker Build en Pruebas):** Toda la infraestructura de validación se levanta al vuelo consumiendo nuestra flota de imágenes oficiales en [Docker Hub](https://hub.docker.com/u/sinfallas), junto a motores certificados de base de datos y memoria:
   * [sinfallas/base-python-uv](https://hub.docker.com/r/sinfallas/base-python-uv) (Tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`).
   * [sinfallas/base-node-ionic](https://hub.docker.com/r/sinfallas/base-node-ionic) (Tags: `22`, `24`, `26` y `latest`).
   * [sinfallas/basephpcomposer](https://hub.docker.com/r/sinfallas/basephpcomposer) (Tags: `8.2`, `8.3`, `8.4`, `8.5` y `latest` — Multi-Arch `amd64`/`arm64` con `pcov`, `redis`, `pdo_pgsql`, `intl`, `sodium`).
   * [sinfallas/base-bash-qa](https://hub.docker.com/r/sinfallas/base-bash-qa):latest.
   * [sinfallas/karatelabs](https://hub.docker.com/r/sinfallas/karatelabs):latest para BDD de API y UI en Chrome Headless.
   * [sinfallas/remote-graphify](https://hub.docker.com/r/sinfallas/remote-graphify):latest para Optimización de Contexto IA y Radio de Impacto (Blast Radius).
   * `postgres:17-alpine` y `eqalpha/keydb:alpine` (multi-hilo) con healthchecks nativos.
2. **Dependencias al Vuelo y Aislamiento de Red:** Los paquetes se resuelven en tiempo de ejecución utilizando volúmenes de caché persistentes (`pnpm-store` o `uv-cache`). Las pruebas unitarias tienen prohibido salir a internet; deben aislarse estrictamente.
3. **Validación Transversal Multi-Capa (Métricas Innegociables):**
   * **Cobertura Unitaria:** Ninguna suite pasa con menos del **95.0%**.
   * **Anti-Mock & Anti-Silo Blindness:** Prohibido confiar ciegamente en mocks para persistencia o fronteras entre módulos. Todo cambio de modelo ORM exige migración versionada y validación en base de datos real (`verify_alembic_orm_parity.py`). Toda mutación en un Módulo A debe verificarse consultando sin mocks intermedios los endpoints `GET` de los Módulos B consumidores, probando las **3 fases del reloj** (`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`), prohibiendo mocks ciegos en `write_audit_log` o UUIDs crudos en `actor_username` / `resource_display_name`, separando timeouts de telemetría vs. transferencia pesada (`timeout >= 180s` + purga de archivos truncados de `0 bytes`) e inspeccionando `results[].status` por ítem en respuestas batch `HTTP 200 OK`.
   * **Geometría Visual Anti-JSDOM y Refresco Dual:** Prohibido el uso de footers fijos superpuestos. Verificación de layout in-flow, pruebas interactivas en navegador real (Karate UI / Playwright) e **Invariante de Refresco Dual** (`setInterval` con `clearInterval` en `onUnmounted` + WebSocket + botón manual **`[ 🔄 Refrescar ]`** con `?refresh=true`).
   * **Invariante BDD Karate Labs:** Todo endpoint y vista web DEBE contar con escenarios BDD de aceptación (`api_test.feature` y `ui_business_flow.feature`).
   * **Cero Componentes Huérfanos:** 100% de componentes UI cuentan con pruebas unitarias (`verify_zero_orphan_vue_components.py`).
   * **Deuda Técnica y Mutación:** Complejidad Ciclomática Grado A (`CC <= 5`, `MI >= B`) y pruebas de mutación (Stryker / Mutmut) para eliminar falsos positivos.
   * **Seguridad por Diseño (DISA ASD STIG V6R5 & OWASP):** RLS por tenant en PostgreSQL, anti-SSRF, cifrado AES-256-GCM (FIPS 140-3 + zeroización de memoria), tokens CSRF, cabeceras de idempotencia, gobernanza de sesiones e identidad (timeouts 10m/15m, bloqueo a 3 intentos en tiempo constante, expiración 72h/35d), canonicalización `NFKC`, anti-XXE, validación de archivos por *Magic Bytes*, auditoría forense encadenada con HMAC (alerta al 75% de disco), cabeceras OWASP OSHP, estado *Fail-Secure*, mitigación de OWASP API Security Top 10 (2023), CycloneDX SBOM/CBOM y auditoría preventiva con Trivy.

---

## 🤖 Gobernanza de Agentes de IA (`.agents/`) y Optimización de Tokens

Este repositorio incorpora un sistema completo de directivas y compuertas automáticas para Agentes de IA:

* **Estructura `.agents/`:** Contiene directivas de cumplimiento obligatorio (`rules/`), habilidades especializadas (`skills/`) y scripts deterministas de pre-commit (`scripts/`).
* **Optimización Extrema de Tokens (*3-Tier Progressive Disclosure*, 3 Vías Proporcionales y 6 Estrategias Cognitivas):** Las directivas internas en `.agents/` están redactadas en **inglés técnico de alta densidad** (~35% menos tokens BPE) bajo una arquitectura de **Revelación Progresiva en 3 Niveles** (*Nivel 1*: Conector compacto en `AGENTS.md`; *Nivel 2*: `SKILL.md` deduplicado; *Nivel 3*: carga Just-In-Time de `.agents/rules/*.md` y `references/*.md`). Todos los scripts operativos (`scripts/*`), validadores (`.agents/scripts/*`), `Makefile` y respuestas JSON del Servidor MCP aplican el patrón **"Pass-Quiet / Fail-Verbose con Telemetría de 1 Línea"**. Además, el estándar clasifica cada tarea en **3 Vías Proporcionales de Ejecución**:
  1. **Fast-Path Documental (`DOCS_ONLY`):** Cambios exclusivos en `*.md` / `docs/` omiten el arranque de contenedores (`run_ephemeral_qa`) y la regeneración de grafos AST (`actualizar-grafos-graphify.sh`).
  2. **Vía Quirúrgica (`MICRO_CHANGE`):** Parches en `<= 3` archivos, sin nuevas rutas API ni migraciones ORM y con radio de impacto AST `LOW` (`< 5` llamadores), ejecutando únicamente la suite focalizada del módulo + `certify_task_completion.sh` (70%–85% de ahorro de tokens).
  3. **Full-Path de Código (`CODE_CHANGE` / `FULL_11X`):** Protocolo completo de 11 pasos con extracción incremental de grafos AST por stack y caché SHA-256 de auditoría IaC.
  Finalmente, la skill `qa-11x-architect` dota al agente de **6 Estrategias de Economía Cognitiva de Tokens (*High-IQ Token Economy*)**: lectura acotada (*AST/Grep-First, Windowed-Read-Second* de 40–80 líneas), cero re-lecturas redundantes, llamadas paralelas a herramientas, aislamiento de contexto en subagentes (`<= 20` líneas de retorno), filtrado `Pass-Quiet` y presupuesto compacto en `ACTIVE_TASK.md` (`<= 40` líneas). Toda la interacción humana y documentación se mantiene estrictamente en **español** (`OUTPUT LANGUAGE CONSTRAINT`). Ver [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md).
* **Compuerta de Certificación Automática:** Los agentes deben ejecutar `./.agents/scripts/certify_task_completion.sh` antes de dar cualquier tarea por terminada.
* **Evolución Continua:** Los agentes tienen mandato de auto-actualizar las directivas ante nuevos descubrimientos (`continuous_agent_evolution.md`).

---

## 📁 Estructura del Repositorio

El repositorio está dividido en ecosistemas tecnológicos listos para ser adoptados:

| Carpeta | Ecosistema | Stack Principal de Validación |
| :--- | :--- | :--- |
| **`python/`** | Scripts Standalone y Librerías | `Ruff` + `Mypy Strict` + `Pytest` + `Pytest-Cov (95%)` + `Bandit` + `Radon` + `Mutmut` |
| **`fastapi/`** | APIs Backend Python | `Ruff` + `Mypy` + `Postgres 17` + `KeyDB` + `Alembic` + `Karate Labs API` + `Locust` + `ZAP` + `Pumba` |
| **`node-backend/`** | Microservicios Node.js | `ESLint` + `Prettier` + `Vitest` + `Stryker` + `SonarJS` + `Karate Labs` + `Artillery` + `ZAP` |
| **`vue3/`** | Frontend Web (Vue 3 / Vite) | `ESLint` + `vue-tsc` + `Vitest (95%)` + `Stryker` + `Playwright` + `@axe-core` + `Lighthouse CI` + `Karate UI` |
| **`react-frontend/`**| Frontend Web (React / Vite) | `ESLint` + `tsc` + `Vitest (95%)` + `RTL` + `Stryker` + `Playwright` + `@axe-core` + `Lighthouse CI` + `Karate UI` |
| **`php/`** | APIs y Backend PHP 8.2–8.5 | `PHP-CS-Fixer` + `PHPStan (Max)` + `Psalm (Taint)` + `Pest/PHPUnit + PCOV (95%)` + `Infection (MSI >= 80%)` + `Karate BDD` |
| **`bash-scripts/`** | Automatización DevOps | `ShellCheck` + `shfmt` + `BATS-core` + `bats-mock` + `kcov` |
| **`mcp-server/`** | Servidor MCP Node.js/TS | Paquete `@sinfallas/mcp-qa-11x`: Servidor MCP (stdio), 8 recursos `blueprint://*`, 12 tools y CLI `install-skill` / `init-agents` / `reconcile-agents` |
| **`.agents/`** | Gobernanza de Agentes IA | Reglas (`rules/`), Habilidades (`skills/`) y Scripts de certificación (`scripts/`) |
| **`manifest.json`** | Manifiesto Criptográfico Zero-Clone | Índice criptográfico SHA-256 de verificación remota bajo demanda (DISA STIG `V-222513` / `APSC-DV-001430`) |

---

## 🛠 Matriz de Herramientas de Pruebas

A continuación se resume el stack de validación corporativo por entorno y tipo de prueba. Se indica `N/A` en las pruebas que no aplican por la naturaleza intrínseca del entorno (ej. un script *standalone* de Python o Bash no levanta servidores HTTP, por ende no se le aplica DAST ni Ingeniería del Caos).

| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking | Cobertura | Auditoría de Dependencias | Seguridad Estática (SAST) | Mutación | BDD / Caja Negra | Concurrencia / Estrés | Profiling / Complejidad | DAST (Dinámica) | Ingeniería del Caos | Observabilidad (Métricas) | Auditoría IaC / Docker | Git Hooks Locales |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Python** (`python/`) | `Ruff` + `Mypy (Strict)` | `Pytest` + `Hypothesis` + `pytest-mock` / `respx` | `Pytest-Cov (>= 95%)` | `pip-audit` + `CycloneDX SBOM` | `Bandit` | `Mutmut` | `N/A` | `N/A` | `py-spy` / `memray` + `Radon (CC <= B)` | `N/A` | `N/A` | `Pushgateway` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **FastAPI** (`fastapi/`) | `Ruff` + `Mypy (Strict)` | `Pytest` + `pytest-asyncio` + `respx` + `PostgreSQL 17` + `KeyDB` + `Alembic` | `Pytest-Cov (>= 95%)` | `pip-audit` + `CycloneDX SBOM` | `Bandit` | `Mutmut` | `Karate Labs` + `Schemathesis` | `Locust (Headless)` | `py-spy` / `memray` + `Radon (CC <= B)` | `OWASP ZAP Baseline` | `Pumba` | `prometheus-fastapi-instrumentator` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **Node** (`node-backend/`) | `ESLint (--max-warnings 0)` + `Prettier` + `tsc` | `Vitest` + `Supertest` + `Nock` | `@vitest/coverage-v8 (>= 95%)` | `pnpm audit` + `.npmrc (ignore-scripts=true)` | `eslint-plugin-security` | `Stryker` | `Karate Labs` | `Artillery` | `0x` + `Clinic.js` + `SonarJS (<= 15)` | `OWASP ZAP Baseline` | `Pumba` | `express-prom-bundle` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **Vue3** (`vue3/`) | `ESLint (--max-warnings 0)` + `Prettier` + `vue-tsc` | `Vitest` + `Vue Test Utils` + `Playwright` + `@axe-core` | `@vitest/coverage-v8 (>= 95%)` | `pnpm audit` + `.npmrc (ignore-scripts=true)` | `eslint-plugin-security` | `Stryker` | `Karate Labs (Chrome Headless)` | `N/A` | `Lighthouse CI` + `SonarJS (<= 15)` | `OWASP ZAP Baseline` | `N/A` | `nginx-prometheus-exporter` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **React** (`react-frontend/`) | `ESLint (--max-warnings 0)` + `Prettier` + `tsc` | `Vitest` + `React Testing Library` + `Playwright` + `@axe-core` | `@vitest/coverage-v8 (>= 95%)` | `pnpm audit` + `.npmrc (ignore-scripts=true)` | `eslint-plugin-security` + `react-hooks` | `Stryker` | `Karate Labs (Chrome Headless)` | `N/A` | `Lighthouse CI` + `SonarJS (<= 15)` | `OWASP ZAP Baseline` | `N/A` | `nginx-prometheus-exporter` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **PHP 8.2–8.5** (`php/`) | `PHP-CS-Fixer (@PER-CS2.0)` + `PHPStan (Level Max)` | `Pest` / `PHPUnit 11.5+` + `MockHandler` + `PostgreSQL 17` + `KeyDB` | `PCOV (>= 95%)` | `composer audit` + `roave/security-advisories` + `CycloneDX SBOM` | `Psalm (--taint-analysis)` | `Infection (MSI >= 80%)` | `Karate Labs` + `Swagger-PHP` / `Schemathesis` | `Locust` / `Artillery` | `tomasvotruba/cognitive-complexity (<= 9)` | `OWASP ZAP Baseline` | `Pumba` | `promphp/prometheus_client_php` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **Bash** (`bash-scripts/`) | `ShellCheck` + `shfmt` | `BATS-core` + `bats-support` + `bats-assert` + `bats-file` + `bats-mock` | `kcov (>= 95%)` | `N/A` | `ShellCheck` | `N/A` | `N/A` | `N/A` | `hyperfine` + `time -v` | `N/A` | `N/A` | `Pushgateway` + `Prometheus` | `Trivy` + `Hadolint` + `Gitleaks` | `Lefthook` |
| **MCP Server** (`mcp-server/`) | `ESLint (--max-warnings 0)` + `Prettier` + `tsc` | `Vitest` (`270+ tests`) | `@vitest/coverage-v8 (>= 95%)` | `pnpm audit` + `.npmrc (ignore-scripts=true)` | `eslint-plugin-security` + `audit_security_stig_owasp` | `Stryker` | `Karate Labs (mcp_cli_test.feature)` | `N/A` | `SonarJS (<= 15)` | `N/A` | `N/A` | `Telemetría JSON Pass-Quiet` | `Trivy` + `Gitleaks` | `Lefthook` |

---

## 📚 Guías Técnicas y Manuales Operativos

* **[`docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`](docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md):** Manual completo sobre gobernanza de agentes, optimización bimodal de tokens y compatibilidad multi-agente (Antigravity, Claude, Hermes, Cursor).
* **[`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md):** Guía de arquitectura: Anti-Mock Blindness, Geometría Visual Anti-JSDOM, Seguridad RLS, Bóveda AES-256-GCM, Idempotencia y Motor KeyDB Multi-Hilo.
* **[`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`](docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md):** La pirámide completa de 13 capas de calidad, con sintaxis de código, comandos Docker y criterios de aprobación.
* **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md):** Recetario técnico de desarrollo seguro y mitigación de los 22 vectores de ataque y controles normativos (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2) en plataformas híbridas (SPA + API).
* **[`ROADMAP.md`](./ROADMAP.md):** Hoja de ruta maestra por Hitos para la implementación del ecosistema Zero-Clone (`@sinfallas/mcp-qa-11x` en npm + Skill `qa-11x-architect` con hidratación desde GitHub).
* **[`manifest.json`](./manifest.json):** Manifiesto criptográfico indexado con hashes SHA-256 para adopción e hidratación remota Zero-Clone (DISA ASD STIG V6R5 `V-222513` / `APSC-DV-001430`).
* **[`docs/specs/`](docs/specs/):** Especificaciones técnicas detalladas de arquitectura para la Skill, el Servidor MCP en Node.js/TypeScript, el manifiesto criptográfico SHA-256 (`manifest.json`) y la publicación en npm.
* **[`SECURITY.md`](./SECURITY.md):** Política de seguridad corporativa, arquitectura de defensa DevSecOps y reporte responsable.
* **[`TESTING.md`](./TESTING.md):** Cuadro de mando de aseguramiento de calidad, métricas 11X y comandos de validación efímera.
* **[`FAQ.md`](./FAQ.md):** Resolución rápida a dudas frecuentes, discos llenos o fallos de cobertura.
* **[`docs/qa-philosophy.md`](docs/qa-philosophy.md):** La filosofía de calidad y la innegociable regla del 95%.
* **[`docs/ai-integration.md`](docs/ai-integration.md):** Integración autónoma vía Model Context Protocol (MCP).
* **[`docs/ci-cd-pipelines.md`](docs/ci-cd-pipelines.md):** Arquitectura de ejecución y principios de integración continua bajo la Regla Cero.
* **[`docs/docker-troubleshooting.md`](docs/docker-troubleshooting.md):** Diagnóstico de conflictos de red y entornos anidados.

---

## 🔄 Modos de Adopción e Integración (Ecosistema Híbrido Humano + IA)

Este ecosistema está concebido con una arquitectura **Dual-Consumer**: puede ser consumido directamente por **Agentes de Inteligencia Artificial autónomos** mediante el protocolo MCP y Skills Zero-Clone, o adoptado por **desarrolladores humanos e ingenieros de DevOps** de manera tradicional o asistida en cualquier fase del ciclo de vida del software.

```mermaid
flowchart TD
    subgraph Ecosistema["QA Testing Blueprints (Nivel 11X)"]
        MCP["Servidor MCP Node.js/TS (@sinfallas/mcp-qa-11x)"]
        Skills["Skills Maestras Zero-Clone (qa-11x-architect + refactoring-ui)"]
        Blueprints["Blueprints y Templates (FastAPI, Vue3, React, Node, Python, Bash, PHP 8.2-8.5)"]
    end

    subgraph ConsumidoresIA["Agentes de IA Autonomos"]
        AGY["Google Antigravity"]
        Claude["Claude Code / Desktop"]
        Cursor["Cursor / Windsurf"]
        Hermes["Hermes Agent (Nous)"]
    end

    subgraph ConsumidoresHumanos["Desarrolladores y DevOps"]
        Dev["Ingeniero de Software"]
        QAEng["Ingeniero de QA / Staff"]
    end

    MCP -->|"12 Tools + 8 Resources stdio"| AGY
    MCP -->|"12 Tools + 8 Resources stdio"| Claude
    MCP -->|"12 Tools + 8 Resources stdio"| Cursor
    MCP -->|"12 Tools + 8 Resources stdio"| Hermes
    Skills -->|"Inyeccion de Cerebro 11X"| AGY
    Skills -->|"Instalacion en workspace o IDE"| Dev
    Blueprints -->|"Makefile + Docker efimero"| QAEng
    AGY <-->|"Pair Programming 11X"| Dev
```

---

### 🤖 Modo 1: Agentes de IA vía Servidor MCP (`@sinfallas/mcp-qa-11x`) — Cero Clonación

El servidor canónico MCP en Node.js/TypeScript está publicado en npmjs bajo **`@sinfallas/mcp-qa-11x`** (Node.js 20+). Permite a cualquier agente de IA o IDE conectarse en tiempo real sin clonar el repositorio, accediendo a:

* **8 Recursos Dinámicos (`blueprint://*`):** Manifiesto criptográfico (`blueprint://manifest`), filosofía y prompts (`blueprint://core/philosophy`), síntesis DISA/OWASP (`blueprint://security/disa-owasp-22`), templates por stack (`blueprint://{stack}/readme`), reglas tácticas UI (`blueprint://ui/refactoring-ui/{topic}`) y utilitarios (`blueprint://core/*`).
* **12 Herramientas Autónomas (`Tools`):**
  * `inspect_project_config`: Audita stacks presentes, configuraciones de linters/tipado y disponibilidad de pruebas en navegador real (`BrowserTestingReadiness`).
  * `fetch_blueprint_bundle`: Descarga quirúrgica de plantillas bajo demanda con validación SHA-256 y modo metadata-only ahorrador de tokens (`include_content: false`).
  * `bootstrap_or_merge_11x`: Aplica fusión no destructiva integrando QA 11X en proyectos vivos.
  * `inspect_ast_blast_radius`: Análisis AST de radio de impacto previo a refactorizaciones con truncado inteligente (`max_items`); verifica la existencia de `graphify-out/graph.json`, instruye su creación mediante `./scripts/actualizar-grafos-graphify.sh` si no existe y exige su actualización al finalizar los cambios.
  * `clean_workspace_11x`: Purga profunda de cachés y artefactos sin requerir `sudo`.
  * `audit_security_stig_owasp`: Auditoría estática de 11 reglas DISA/OWASP (`SEC-01` a `SEC-11`, incluyendo integridad semántica de auditoría anti-UUID y prohibición de mocks ciegos en `write_audit_log`), ergonomía visual/operativa (`UI-11X-01` y `UI-11X-02`), consolidación por regla (`groupFindingsByRule`) y límite `max_findings`.
  * `run_ephemeral_qa`: Ejecución de pruebas en Docker efímero bajo la Regla Cero con salida JSON.
  * `certify_11x_gate`: Validación de la compuerta universal de certificación de 10 etapas.
  * `audit_test_pyramid_gaps`: Auditoría exhaustiva de las 13 capas de la pirámide 11X (con truncado `max_items` y conteos totales, Ciclo Temporal de 3 Fases en Capa 13 e Invariante de Refresco Dual en Capa 07), detección de archivos huérfanos, endpoints sin BDD, vistas sin E2E y plan de acción priorizado.
  * `init_or_append_agents_md`: Crea `AGENTS.md` o inyecta de forma aditiva y no destructiva el bloque conector de QA 11X al final de un `AGENTS.md` existente sin modificar reglas previas.
  * `propose_skill_evolution_pr`: Propone mejoras federadas a `qa-testing-blueprints` mediante `gh` CLI local autenticado o generando un archivo de propuesta local y URL prellenada de GitHub (Zero-Trust, 0 tokens empaquetados).
  * `reconcile_agents_governance`: Reconcilia y deduplica reglas en `.agents/` para proyectos adoptantes, podando directivas ya promovidas a `qa-testing-blueprints`, aislando reglas de negocio en `domain_<project>_rules.md` y respaldando en `.agents/backups/<timestamp>/`.

#### Ejecución Directa en 1 Comando:
```bash
# Levantar el servidor MCP canónico (comunicación stdio para Antigravity, Claude, Cursor, Hermes):
npx -y @sinfallas/mcp-qa-11x@latest

# Inyectar o actualizar el conector QA 11X en AGENTS.md de forma aditiva y no destructiva:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--dry-run]

# Reconciliar gobernanza y aislar reglas de dominio de un proyecto consumidor (ej. rosgrid):
npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents [--project-path <ruta>] [--dry-run]
```

#### Configuración en Clientes MCP (Antigravity, Claude Desktop / Code, Cursor, Hermes):
```json
{
  "mcpServers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
    }
  }
}
```

Consulte la [Guía de Integración con Agentes de IA](docs/ai-integration.md) para detalles completos de configuración y parámetros.

---

### ⚡ Modo 2: Inyección de Skills, Scripts y `AGENTS.md` Zero-Clone en 1 Segundo

Para dotar a cualquier proyecto, agente o desarrollador del catálogo completo de **5 Skills**, los scripts de gobernanza (`.agents/scripts/*`, `scripts/*`) y el conector no destructivo en **`AGENTS.md`** sin clonar el repositorio completo, ejecuta el instalador oficial verificado con SHA-256 (DISA ASD STIG V6R5 `V-222513` / `APSC-DV-001430`):

```bash
# Opción A (Recomendada — instala las 5 skills, descarga los scripts operativos e inicializa/actualiza AGENTS.md):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts

# Opción B (vía script universal curl con verificación criptográfica SHA-256):
curl -fsSL https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/scripts/install-skill.sh | sh
```

El instalador detecta automáticamente el entorno del agente (`auto`: Google Antigravity, Claude, Cursor, Hermes y/o Workspace) e hidrata de forma segura las 5 skills del catálogo:
* **`qa-11x-architect`:** Cerebro metodológico 11X, las 13 capas de la pirámide de calidad, los 22 patrones DISA ASD STIG V6R5 / OWASP v4.2 y directivas especializadas para Python, FastAPI, Node.js, Vue 3, React, PHP 8.2–8.5 y Bash.
* **`refactoring-ui`:** Reglas tácticas de jerarquía visual, WCAG 2.1 AA, contraste OKLCH y `tabular-nums` para `CLS = 0`.
* **`docker-trivy-keydb-hardening`:** Hardening de contenedores Docker (Trivy=0) y motor en memoria KeyDB multi-hilo.
* **`graphify-ast-navigator`:** Navegación del grafo semántico AST, cálculo preventivo de blast radius y cumplimiento de límites de capas.
* **`qa-11x-docker-certifier`:** Certificador corporativo en contenedores Docker efímeros bajo la Regla Cero.

#### Opciones del comando `install-skill`:
| Opción / Flag | Descripción Operativa |
| :--- | :--- |
| `--target, -t <entorno>` | Define el destino de las skills: `auto` (por defecto: autodetecta agentes globales y workspace), `workspace`, `antigravity`, `claude`, `cursor`, `hermes` o `all`. |
| `--init-agents` | Crea `AGENTS.md` en la raíz del proyecto o inyecta de forma aditiva y 100% no destructiva el bloque conector de QA 11X al final de un `AGENTS.md` existente. |
| `--include-scripts` | Descarga e instala en el proyecto actual todos los scripts de certificación y auditoría (`.agents/scripts/*` y `scripts/*`) con permisos de ejecución `0o755`. |

```bash
# Comando completo con todas las opciones explícitas:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|hermes|all] --init-agents --include-scripts
```

#### 🔄 Cómo Actualizar el Servidor MCP, las Skills y la Documentación en el IDE y cómo Validarlo

Cuando se publica una nueva versión de `@sinfallas/mcp-qa-11x` en `npmjs.com` o se actualiza el manifiesto criptográfico en GitHub, el proceso MCP activo en tu IDE (comunicación `stdio`) y las cachés locales (`~/.npm/_npx` y `~/.cache/qa-11x-blueprints`) pueden retener la versión previa en memoria. Sigue estos **3 pasos** para actualizar y auditar la descarga:

1. **Purgar cachés locales y actualizar las 5 Skills, Reglas y Scripts:**
   ```bash
   # Purga la caché de npx y de blueprints, fuerza la descarga de @latest y actualiza todos los entornos:
   rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts
   ```
2. **Reiniciar el servidor MCP en el IDE:**
   * **Google Antigravity:** Menú del panel del agente **`...` (Additional Options) > MCP Servers > `qa-11x` > Restart / Refresh** (o desde la paleta de comandos `Ctrl+Shift+P` -> **`Developer: Reload Window`**).
   * **Cursor / Claude Desktop / VS Code:** Recarga la ventana (`Developer: Reload Window`) o reinicia el conector MCP desde los ajustes.
3. **Validar que se descargaron las nuevas versiones del MCP, Skills y Documentación (Verificación SHA-256):**
   ```bash
   # A. Comprobar que la versión en caché local de npx coincide con la última publicada en npmjs:
   npm view @sinfallas/mcp-qa-11x version && grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

   # B. Comprobar la versión y fecha UTC del manifiesto y documentación en caché (~/.cache/qa-11x-blueprints/manifest.json):
   grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json

   # C. Verificar criptográficamente (SHA-256 DISA STIG V-222513) los 20 archivos de las 5 Skills en el IDE contra el manifiesto:
   python3 -c '
   import hashlib, json, pathlib
   m = json.load(open(pathlib.Path.home() / ".cache/qa-11x-blueprints/manifest.json"))
   skills = [f for f in m["agent_governance_files"] if f["path"].startswith(".agents/skills/")]
   dest = pathlib.Path.home() / ".gemini/config/skills"
   ok = sum(1 for s in skills if (p := dest / s["path"].replace(".agents/skills/", "", 1)).exists() and hashlib.sha256(p.read_bytes()).hexdigest() == s["sha256"])
   print(f"✔ Verificación SHA-256 en {dest}: {ok}/{len(skills)} archivos coinciden con manifest.json (v{m[\"blueprint_version\"]})")
   '
   ```

---

### 👨‍💻 Modo 3: Adopción Directa en Proyectos (Desarrollador Humano / Uso Asistido)

Si prefieres adoptar o inspeccionar los blueprints directamente en tu propio repositorio:

1. **Copiar Archivos Operativos:** Arrastra a la raíz de tu proyecto el orquestador `docker-compose.qa.yml`, el `Makefile.example` (renómbralo a `Makefile`), los archivos `.example` del ecosistema elegido y la carpeta `.agents/`.
2. **Documentación de Soporte:** Copia la carpeta `docs/` y el archivo `AI_MASTER_PROMPT.md` a tu proyecto (ej. en `docs/qa/` o en la raíz).
3. **Delega la Fusión a tu Agente de IA o Aplícala Manualmente:**
   > *"Lee las directrices en `AI_MASTER_PROMPT.md` y `.agents/README.md`. Necesito integrar el estándar QA 11X en este proyecto. Lee los archivos `.example` y realiza una **fusión quirúrgica no destructiva** con mis archivos de configuración reales. Conserva intactas mis dependencias de negocio y añade todo el stack de linters, tipado estricto y pruebas."*
4. **Verificación Efímera:** Ejecuta `make qa-all` y `./.agents/scripts/certify_task_completion.sh` para certificar el cumplimiento de las 10 compuertas corporativas.
5. **Saneamiento Automático:** Ejecuta `make clean` o `./scripts/limpieza.sh` para purgar artefactos temporales de pruebas y cachés de Docker (con fallback efímero Alpine que elimina archivos `root` sin requerir `sudo` ni dejar bloqueos de permisos).
