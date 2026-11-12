# 🗺️ Hoja de Ruta Maestra (ROADMAP.md) — Ecosistema Zero-Clone: Skill + Servidor MCP (Estándar 11X)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Arquitectura Objetivo:** Distribución Zero-Clone en Node.js (`npx -y @sinfallas/mcp-qa-11x@latest`) + Skill Cognitiva (`qa-11x-architect`) + Hidratación Bajo Demanda desde GitHub con Verificación SHA-256 (`manifest.json`)  
**Modelo Ejecutor Objetivo:** Gemini 3.8 Flash High / Claude / Antigravity  

> **DIRECTIVA DE EJECUCIÓN PARA EL AGENTE DE IA (GEMINI 3.8 FLASH HIGH):**
> 1. Lee siempre primero la especificación técnica asociada en `docs/specs/` antes de iniciar cada Hito.
> 2. Respeta estrictamente la **Regla Cero (`Rule Zero`)**: toda validación de código, linters y pruebas unitarias/BDD DEBE ejecutarse dentro de los contenedores Docker efímeros (`sinfallas/*`).
> 3. Al completar cada subtarea o Hito, marca su casilla `[x]` en este `ROADMAP.md`, actualiza `CHANGELOG.md` y `TESTING.md`, y ejecuta `./.agents/scripts/certify_task_completion.sh`.

---

## 📊 Resumen de Estado de Hitos

| Hito | Nombre del Hito | Especificación Asociada | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 1** | Especificaciones de Diseño (`docs/specs/`) y Planificación (`ROADMAP.md`) | `01_SPEC` a `05_SPEC` | ✅ Completado | `100%` |
| **Hito 2** | Manifiesto Criptográfico (`manifest.json`) y Generador Automático SHA-256 | [`01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) | ✅ Completado | `100%` |
| **Hito 3** | Skill Maestra (`qa-11x-architect`), Carga Progresiva (`references/`) e Instalador `curl` | [`02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) | ✅ Completado | `100%` |
| **Hito 4** | Servidor MCP en Node.js / TS (`mcp-server/`) — Núcleo, Recursos y Tools 1–4 | [`03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) | ✅ Completado | `100%` |
| **Hito 5** | Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Tools 5–7 | [`04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) | ✅ Completado | `100%` |
| **Hito 6** | Pruebas 11X (`>= 95%`), Empaquetado npm (`npx`) y Publicación Autónoma Soberana | [`05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) | ✅ Completado | `100%` |
| **Hito 7** | Auditor de Brechas de la Pirámide de Pruebas 11X (`audit_test_pyramid_gaps`) y Playbook de Rescate | [`06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md) | ✅ Completado | `100%` |
| **Hito 8** | Autodetección de Agentes en `install-skill`, Instalación de las 5 Skills + Scripts y Resiliencia CDN | [`07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md) | ✅ Completado | `100%` |
| **Hito 9** | Inyector Aditivo No Destructivo del Conector `AGENTS.md` (`init-agents` / `init_or_append_agents_md`) | [`08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md) | ✅ Completado | `100%` |
| **Hito 10** | Diagnóstico Asistido de Navegador (Playwright / Browser MCP) y PRs de Evolución Continua Zero-Trust (`propose_skill_evolution_pr`) | [`09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md) | ✅ Completado | `100%` |
| **Hito 11** | Blueprint Oficial PHP 8.2–8.5 (`sinfallas/basephpcomposer`) e Integración en Servidor MCP | [`10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md) | ✅ Completado | `100%` |
| **Hito 12** | Auditores Automáticos para el Invariante Anti-Silo, Ciclo Temporal de 3 Fases, Auditoría Semántica Anti-UUID y Refresco Dual | [`11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md) | ✅ Completado | `100%` |
| **Hito 13** | Reconciliación Automática, Deduplicación y Aislamiento de Reglas de Dominio en `.agents/` (`reconcile-agents` / `reconcile_agents_governance`) | [`12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md) | ✅ Completado | `100%` |
| **Hito 14** | Optimización Extrema de Tokens en Servidor MCP, Protocolo de 3 Vías Proporcionales (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), *Progressive Disclosure* y Economía Cognitiva | [`13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md) | ✅ Completado | `100%` |
| **Hito 15** | Endurecimiento Integral `v2.16.0` de los 7 Stacks Corporativos, Contrato *Thin-Repo*, Hooks POSIX Rule-Zero y Convergencia 10/10 de Compuertas | `SECURITY.md` + `TESTING.md` | ✅ Completado | `100%` |
| **Hito 16** | Invariante Anti-Silo Pre-Auth Multi-Etapa (`SEC-16`), Presupuesto Cognitivo `SKILL.md < 20 KB` y Verificador Documental Determinista (`verify_docs_invariants.py`) | `SECURITY.md` §4.20 + `02-security-disa-owasp-22.md` | ✅ Completado | `100%` |
| **Hito 17** | Paridad Pre-Push 1:1 con CI (`v2.17.0`) en MCP `qa-11x`: Sello de Evidencia `lint`, Stages `integration`/`ci`, Parser de Endpoints Dinámicos e Invariantes Python/PostgreSQL 17 (`QA-MYPY-01`, `QA-PG17-RLS`, `importlib`) | `03-stack-python-fastapi.md` + `08-postgres-rls-zero-downtime-migrations.md` | ✅ Completado | `100%` |
| **Hito 18** | Internacionalización v2.18.0: Idioma Espejo Dinámico, Flag `--lang (auto/es/en)`, Targets `codex`/`windsurf` y Guías Multi-Agente EN/ES | [`docs/agent-setup.md`](docs/agent-setup.md) + [`docs/agent-setup.en.md`](docs/agent-setup.en.md) | ✅ Completado | `100%` |

---

## ✅ Hito 1: Especificaciones de Diseño (`docs/specs/`) y Planificación (`ROADMAP.md`)
**Referencia:** [`docs/specs/`](docs/specs/)
- [x] **1.1.** Crear [`docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) definiendo el flujo Zero-Clone, el esquema exacto de `manifest.json` y el algoritmo de caché verificada con SHA-256.
- [x] **1.2.** Crear [`docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) definiendo la estructura de `.agents/skills/qa-11x-architect/`, sus 5 archivos `references/` en inglés técnico compacto y el instalador universal.
- [x] **1.3.** Crear [`docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) definiendo la arquitectura Node.js/TypeScript de `mcp-server/`, `package.json`, los 4 Resources y las Tools 1 a 4.
- [x] **1.4.** Crear [`docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) definiendo las Tools 5 a 7 (`audit_security_stig_owasp`, `run_ephemeral_qa`, `certify_11x_gate`) y los parsers ahorradores de tokens.
- [x] **1.5.** Crear [`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) con el manual paso a paso de publicación en npm y automatización con SLSA Provenance.
- [x] **1.6.** Crear este archivo `ROADMAP.md` y enlazarlo desde `README.md`.

---

## ✅ Hito 2: Manifiesto Criptográfico (`manifest.json`) y Generador Automático SHA-256
**Referencia Obligatoria:** [`docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md)

### Tareas de Implementación:
- [x] **2.1.** Crear el script `scripts/generar-manifiesto.py` (en Python 3.12+ usando solo librería estándar: `hashlib`, `json`, `pathlib`, `datetime`, `argparse`) que escanee los 6 stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`), `common_files` y `agent_governance_files`, calculando su tamaño en bytes, estrategia de fusión (`merge_strategy`), `target_name` y hash `sha256`.
- [x] **2.2.** Soportar en `scripts/generar-manifiesto.py` el flag `--check` que verifique si `/manifest.json` coincide exactamente con los hashes actuales del repositorio (devolviendo exit code `0` si está sincronizado o `1` si hay deriva).
- [x] **2.3.** Generar el archivo `/manifest.json` en la raíz del repositorio ejecutando `scripts/generar-manifiesto.py`.
- [x] **2.4.** Integrar la verificación `python3 scripts/generar-manifiesto.py --check` como etapa dentro de `.agents/scripts/certify_task_completion.sh`.
- [x] **2.5.** Crear pruebas unitarias para el generador de manifiesto y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 3: Skill Maestra (`qa-11x-architect`), Carga Progresiva (`references/`) e Instalador `curl`
**Referencia Obligatoria:** [`docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md)

### Tareas de Implementación:
- [x] **3.1.** Crear `.agents/skills/qa-11x-architect/SKILL.md` (en inglés técnico de alta densidad con `OUTPUT LANGUAGE CONSTRAINT: Spanish`) incluyendo la detección de entorno (MCP-First vs. Fallback con hidratación directa desde GitHub Raw), las 10 Leyes Innegociables 11X y los 4 Playbooks Operativos.
- [x] **3.2.** Crear `.agents/skills/qa-11x-architect/references/01-core-13-layers.md` con la tabla ejecutable de las 13 capas, Anti-Mock Blindness, Anti-JSDOM y Fixtures Trimodales.
- [x] **3.3.** Crear `.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md` condensando los 22 patrones de seguridad DISA ASD STIG V6R5 + OWASP Developer Guide v4.2.
- [x] **3.4.** Crear `.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md` con las reglas y comandos exactos de Python standalone y FastAPI (PostgreSQL 17 + KeyDB + Alembic + Karate API).
- [x] **3.5.** Crear `.agents/skills/qa-11x-architect/references/04-stack-node-vue-react.md` con las reglas y comandos de Node.js, Vue 3 y React (`.npmrc` Zero-Trust, Vitest, Playwright + Axe WCAG 2.1 AA, Lighthouse CI, Karate UI).
- [x] **3.6.** Crear `.agents/skills/qa-11x-architect/references/05-stack-bash-devops.md` con las reglas de Bash/Shell (`ShellCheck`, `shfmt`, `BATS-core`, `bats-mock`, `kcov >= 95%`, `Pushgateway`).
- [x] **3.7.** Crear el instalador universal `scripts/install-skill.sh` (compatible con POSIX `sh` y auditado con `ShellCheck` 0 errores) que descargue `qa-11x-architect` y `refactoring-ui` desde GitHub verificando los hashes SHA-256 contra `manifest.json` e instale ambas skills en Antigravity, Claude, Cursor o el proyecto actual.
- [x] **3.8.** Actualizar `/manifest.json` con `python3 scripts/generar-manifiesto.py` para incluir los archivos de `qa-11x-architect`, `refactoring-ui` y `scripts/install-skill.sh`.

---

## ✅ Hito 4: Servidor MCP en Node.js / TS (`mcp-server/`) — Núcleo, Recursos y Tools 1–4
**Referencia Obligatoria:** [`docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md)

### Tareas de Implementación:
- [x] **4.1.** Inicializar la estructura de `mcp-server/`: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.json`, `.npmrc` (`ignore-scripts=true`), `docker-compose.qa.yml` (usando `sinfallas/base-node-ionic:26`) y `Makefile`.
- [x] **4.2.** Implementar `mcp-server/src/services/github-fetcher.ts`: descarga bajo demanda desde GitHub Raw (`manifest.json` y archivos por stack), caché en `~/.cache/qa-11x-blueprints/`, soporte `ETag` (`If-None-Match`), validación criptográfica SHA-256 (`DISA V-222513`), fallback offline y soporte `QA_BLUEPRINTS_LOCAL_PATH`.
- [x] **4.3.** Implementar `mcp-server/src/services/surgical-merger.ts`: algoritmo determinista de fusión quirúrgica no destructiva para `package.json`, `pyproject.toml`, `Makefile`, `.gitignore` y `.npmrc`.
- [x] **4.4.** Implementar `mcp-server/src/resources/blueprint-resources.ts` exponiendo `blueprint://manifest`, `blueprint://core/philosophy`, `blueprint://security/disa-owasp-22`, `blueprint://{stack}/readme`, `blueprint://ui/refactoring-ui/{topic}`, `blueprint://core/active-task-template` y `blueprint://core/cleanup-script`.
- [x] **4.5.** Implementar las Tools en `mcp-server/src/tools/`:
  - `inspect-project.ts` (`inspect_project_config`)
  - `fetch-bundle.ts` (`fetch_blueprint_bundle`)
  - `bootstrap-merge.ts` (`bootstrap_or_merge_11x`)
  - `blast-radius.ts` (`inspect_ast_blast_radius`)
  - `clean-workspace.ts` (`clean_workspace_11x`) con saneamiento seguro y fallback efímero Alpine.
- [x] **4.6.** Implementar el subcomando CLI `mcp-server/src/cli/install-skill.ts` y el punto de entrada dual `mcp-server/src/index.ts` (`#!/usr/bin/env node`).
- [x] **4.7.** Estandarizar el script universal de saneamiento `limpieza.sh` en la raíz, en todos los stacks y en `Makefile` (Playbook 5 en `qa-11x-architect`).

---

## ✅ Hito 5: Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Tools 5–7
**Referencia Obligatoria:** [`docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md)

### Tareas de Implementación:
- [x] **5.1.** Implementar `mcp-server/src/parsers/output-parsers.ts` para resumir salidas de consola de `pytest-cov`, `vitest --coverage`, `kcov`, `radon`, `mypy`, `ruff`, `eslint`, `trivy`, `bandit`, `mutmut` y `stryker` a JSON compacto.
- [x] **5.2.** Implementar Tool 5 (`mcp-server/src/tools/security-auditor.ts` — `audit_security_stig_owasp`) con las 10 reglas de detección estática (`SEC-01` a `SEC-10`) alineadas con los 22 patrones DISA ASD STIG V6R5 + OWASP v4.2.
- [x] **5.3.** Implementar Tool 6 (`mcp-server/src/tools/ephemeral-runner.ts` — `run_ephemeral_qa`) usando exclusivamente `execFile("make", ["qa-" + stage], { shell: false })` y conectándolo con `output-parsers.ts`.
- [x] **5.4.** Implementar Tool 7 (`mcp-server/src/tools/certify-gate.ts` — `certify_11x_gate`) integrando todas las compuertas de cierre.
- [x] **5.5.** Registrar todas las herramientas y recursos en `mcp-server/src/server.ts`.

---

## ✅ Hito 6: Pruebas 11X (`>= 95%`), Empaquetado npm (`npx`) y Publicación Autónoma Soberana
**Referencia Obligatoria:** [`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md)

### Tareas de Implementación:
- [x] **6.1.** Crear la suite completa de pruebas unitarias en `mcp-server/tests/*.unit.ts` alcanzando **>= 95.0% de cobertura** en líneas, ramas, funciones y sentencias dentro del contenedor efímero `sinfallas/base-node-ionic:26`.
- [x] **6.2.** Crear los escenarios BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`) validando el CLI y los contratos JSON.
- [x] **6.3.** Ejecutar en contenedor efímero `make qa-all` y `npm pack --dry-run` dentro de `mcp-server/`, certificando `0` errores de tipado (`tsc --noEmit`), `0` errores de ESLint/SonarJS y paquete limpio.
- [x] **6.4.** Implementar el script autónomo de publicación a npmjs sin runners externos (`scripts/publicar-mcp.sh`, credenciales desde `.env` en la raíz al estilo RoSGrid, validación efímera y `make publish-mcp`), eliminando cualquier dependencia de GitHub Actions o CI/CD externos.
- [x] **6.5.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md` con las instrucciones de uso de 1 comando (`npx -y @sinfallas/mcp-qa-11x` y `npx -y @sinfallas/mcp-qa-11x install-skill`).

---

## ✅ Hito 7: Auditor de Brechas de la Pirámide de Pruebas 11X (`audit_test_pyramid_gaps`) y Playbook de Rescate
**Referencia Obligatoria:** [`docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md)

### Tareas de Implementación:
- [x] **7.1.** Definir en `mcp-server/src/types.ts` los contratos `PyramidLayerStatus`, `PyramidLayerAudit`, `UntestedApiEndpoint`, `PrioritizedTestAction` y `TestPyramidGapResult`.
- [x] **7.2.** Implementar `mcp-server/src/tools/test-pyramid-auditor.ts` (`auditTestPyramidGaps`) con la matriz de evaluación de las 13 capas de la pirámide 11X (`L01` a `L13`), el detector de archivos fuente sin prueba unitaria (`orphan_source_files`), el detector de endpoints API sin escenario BDD en Karate Labs (`untested_api_endpoints`), el detector de vistas UI sin escenario BDD/E2E (`untested_ui_views`) y el generador de `prioritized_action_plan`.
- [x] **7.3.** Registrar la Tool 9 (`audit_test_pyramid_gaps`) con su esquema Zod (`AuditTestPyramidInputSchema`) en `mcp-server/src/server.ts`.
- [x] **7.4.** Incorporar el **Playbook 6 (Existing Project Test Gap Audit & 13-Layer Rescue)** en `.agents/skills/qa-11x-architect/SKILL.md` y sincronizar `manifest.json` con `python3 scripts/generar-manifiesto.py`.
- [x] **7.5.** Crear la suite de pruebas unitarias `mcp-server/tests/test-pyramid-auditor.unit.ts` (cubriendo los escenarios trimodales: proyecto virgen 0%, proyecto brownfield parcial y proyecto 11X al 100%, manteniendo cobertura global `>= 95.0%`) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **7.6.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md` documentando la 9.ª herramienta del servidor MCP (`audit_test_pyramid_gaps`) y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 8: Autodetección de Agentes en `install-skill`, Instalación de las 5 Skills + Scripts y Resiliencia CDN
**Referencia Obligatoria:** [`docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md)

### Tareas de Implementación:
- [x] **8.1.** Actualizar `mcp-server/src/cli/install-skill.ts`: (a) cambiar el modo por defecto de `parseTargetArg` a `'auto'` con `detectInstalledGlobalAgentDirs(homeDir)` e `isProjectWorkspaceDir(homeDir, cwd)` (sin contaminar `$HOME/.agents/skills`), (b) **eliminar el filtro restrictivo de 2 skills** usando `f.path.startsWith('.agents/skills/')` para instalar las **5 skills del catálogo**, y (c) añadir soporte para `--include-scripts` que descargue también `common_files` y `.agents/scripts/*`.
- [x] **8.2.** Sincronizar `scripts/install-skill.sh` eliminando el filtro de 2 skills (copiando todas las carpetas de `.agents/skills/*`), aplicando la misma autodetección multi-agente en `resolve_destination_dirs()`, validando con `ShellCheck` (`0` warnings) y regenerando `manifest.json` (`python3 scripts/generar-manifiesto.py`).
- [x] **8.3.** Reemplazar la verificación inmediata `npm view` en `scripts/publicar-mcp.sh` por el bucle resiliente de consistencia eventual de CDN (`VERIFY_ATTEMPTS=6`, `VERIFY_DELAY=5`) para evitar caídas por `E404` tras publicar paquetes nuevos o nuevas versiones en `registry.npmjs.org`.
- [x] **8.4.** Actualizar y ampliar las pruebas unitarias en `mcp-server/tests/tools-and-resources.unit.ts` (certificando cobertura `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26`), `tests/test_install_skill.unit.py` y `tests/test_publicar_mcp.unit.py`.
- [x] **8.5.** Actualizar el contrato BDD en `mcp-server/test/mcp_cli_test.feature` reflejando el comportamiento `auto` por defecto de `install-skill`.
- [x] **8.6.** Actualizar `CHANGELOG.md`, `README.md` y `docs/ai-integration.md`, y ejecutar la compuerta de cierre `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 9: Inyector Aditivo No Destructivo del Conector `AGENTS.md` (`init-agents` / `init_or_append_agents_md`)
**Referencia Obligatoria:** [`docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md)

### Tareas de Implementación:
- [x] **9.1.** Implementar `mcp-server/src/cli/init-agents-md.ts` (`buildConnectorBlock`, `mergeOrAppendAgentsMdContent`, `initOrAppendAgentsMd`, `runInitAgentsCli`) que cree `AGENTS.md` si no existe, o **agregue de forma aditiva y no destructiva** el bloque conector (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`) al final del `AGENTS.md` existente sin reemplazar ni borrar ninguna línea previa.
- [x] **9.2.** Integrar `mergeAgentsMd()` dentro de `SurgicalMerger.resolveSurgicalMerge` (`mcp-server/src/services/surgical-merger.ts`) cuando `base === 'AGENTS.md'`.
- [x] **9.3.** Exponer el subcomando CLI `npx -y @sinfallas/mcp-qa-11x init-agents [--project-path <ruta>] [--dry-run]` en `mcp-server/src/index.ts` y el flag `--init-agents` en `mcp-server/src/cli/install-skill.ts`.
- [x] **9.4.** Registrar la Tool 10 (`init_or_append_agents_md`) en `mcp-server/src/server.ts` y documentar su uso en `.agents/skills/qa-11x-architect/SKILL.md`.
- [x] **9.5.** Crear la suite de pruebas unitarias `mcp-server/tests/init-agents-md.unit.ts` (validando creación desde cero, adición al final de un `AGENTS.md` existente conservando el 100% de su contenido previo, actualización idempotente sin duplicar el bloque y modo `dry_run`, manteniendo cobertura global `>= 95.0%`) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **9.6.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md`, regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 10: Diagnóstico Asistido de Navegador (Playwright / Browser MCP) y PRs de Evolución Continua Zero-Trust (`propose_skill_evolution_pr`)
**Referencia Obligatoria:** [`docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md)

### Tareas de Implementación:
- [x] **10.1.** Añadir la interfaz `BrowserTestingReadiness` en `mcp-server/src/types.ts` e implementar `evaluateBrowserTestingReadiness()` en `mcp-server/src/tools/inspect-project.ts` para detectar en proyectos frontend (`vue3`, `react-frontend`) si están instalados `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `e2e/*.e2e.ts` y si el IDE del usuario tiene configurado el servidor MCP de navegador (`@playwright/mcp` / `chrome-devtools`), entregando instrucciones de instalación o inyección vía `bootstrap_or_merge_11x`.
- [x] **10.2.** Implementar `mcp-server/src/tools/propose-evolution-pr.ts` (`proposeSkillEvolutionPr`) combinando la **Opción 1 (`gh` CLI local autenticado vía `execFile` con `shell: false`)** y la **Opción 2 (Fallback Cero-Credenciales generando archivo `.agents/proposals/<slug>.md` + URL pre-llenada de GitHub)** sin empaquetar jamás ningún token.
- [x] **10.3.** Registrar la Tool 11 (`propose_skill_evolution_pr`) con su esquema Zod (`ProposeEvolutionPrInputSchema`) en `mcp-server/src/server.ts`.
- [x] **10.4.** Incorporar el **Playbook 7 (Continuous Skill Evolution & Upstream PR Proposal)** y las reglas de verificación de `browser_testing_readiness` en `.agents/skills/qa-11x-architect/SKILL.md` y regenerar `manifest.json` con `python3 scripts/generar-manifiesto.py`.
- [x] **10.5.** Crear la suite de pruebas unitarias `mcp-server/tests/propose-evolution-pr.unit.ts` y ampliar `mcp-server/tests/tools-and-resources.unit.ts` para `browser_testing_readiness` (manteniendo cobertura global `>= 95.0%` y `0` warnings en ESLint/SonarJS), actualizando `mcp-server/test/mcp_cli_test.feature`.
- [x] **10.6.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md`, y ejecutar la compuerta de cierre `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 11: Blueprint Oficial PHP 8.2–8.5 (`sinfallas/basephpcomposer`) e Integración en Servidor MCP
**Referencia Obligatoria:** [`docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md)

### Tareas de Implementación:
- [x] **11.1.** Crear el directorio del stack `php/` con las plantillas canónicas 11X (`php/README.md`, `php/docker-compose.qa.yml` usando `sinfallas/basephpcomposer:8.5` + `postgres:17-alpine` + `eqalpha/keydb:alpine`, `php/Makefile.example`, `php/composer.json.example`, `php/phpstan.neon.example`, `php/phpunit.xml.example`, `php/infection.json5.example`, `php/php.ini.example`, `php/limpieza.sh` y `php/test/api_test.feature`).
- [x] **11.2.** Actualizar `scripts/generar-manifiesto.py` para indexar el stack `"php"` en `STACK_METADATA` y clasificar `"composer.json.example"` con `merge_strategy: "surgical_merge"`, regenerando `manifest.json` y ampliando `tests/test_generar_manifiesto.unit.py`.
- [x] **11.3.** Ampliar `mcp-server/src/types.ts` (añadiendo `'php'` a `StackNameSchema`) y `mcp-server/src/tools/inspect-project.ts` (`inspectPhpStack` detectando `composer.json`, `phpstan.neon`, `infection.json5` y archivos `.php`).
- [x] **11.4.** Implementar `mergeComposerJson()` en `mcp-server/src/services/surgical-merger.ts` (fusión quirúrgica no destructiva de `require-dev`, `scripts` y `config.allow-plugins`) y conectarlo en `resolveSurgicalMerge` cuando `base === 'composer.json'`.
- [x] **11.5.** Ampliar `mcp-server/src/parsers/output-parsers.ts` (soportando salidas de cobertura de `Pest`/`PHPUnit` con `PCOV`, análisis estático de `PHPStan`/`Psalm` y mutación de `Infection`), `mcp-server/src/tools/security-auditor.ts` (reglas `SEC-03`, `SEC-04` y `SEC-05` para `.php`) y `mcp-server/src/tools/test-pyramid-auditor.ts` (matriz de 13 capas y detección de huérfanos para `'php'`).
- [x] **11.6.** Ampliar las suites de pruebas unitarias en `mcp-server/tests/*.unit.ts` (manteniendo cobertura global `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26` y `0` warnings en ESLint/SonarJS) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **11.7.** Sincronizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md`, y ejecutar la compuerta de cierre `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 12: Auditores Automáticos para el Invariante Anti-Silo, Ciclo Temporal de 3 Fases, Auditoría Semántica Anti-UUID y Refresco Dual
**Referencia Obligatoria:** [`docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md)

### Tareas de Implementación:
- [x] **12.1.** Ampliar `mcp-server/src/tools/security-auditor.ts` incorporando las reglas `SEC-11` (`checkSec11AuditSemanticIntegrity`: detección de asignación directa `actor_username = claims.get("sub")` y detección de mocks ciegos `AsyncMock`/`MagicMock`/`vi.fn()` sobre `write_audit_log` sin aserciones `assert_called` / `call_args`) y `UI-11X-02` (`checkUi11x02DualRefreshAndSemanticElse`: detección de cláusulas `else return 'MAINTENANCE'` y fugas de `setInterval` sin `clearInterval`), manteniendo complejidad cognitiva `<= 15` y `0` warnings de `sonarjs/no-duplicate-string`.
- [x] **12.2.** Ampliar `mcp-server/src/tools/test-pyramid-auditor.ts` incorporando `projectHasTemporalEntities` y `detectThreePhaseTemporalTests` en `evaluateLayer13TrimodalFixtures` (verificando las 3 fases del reloj: `Programada`, `En Curso` y `Cancelada`/`Expirada` cuando existen campos `starts_at`/`ends_at` o `safe_mode`) y `checkOperationalViewsDualRefresh` en `evaluateLayer07BddUiKarate` (verificando auto-refresco + botón manual `[ 🔄 Refrescar ]` en vistas operativas).
- [x] **12.3.** Ampliar las suites unitarias `mcp-server/tests/security-auditor.unit.ts` y `mcp-server/tests/test-pyramid-auditor.unit.ts` cubriendo todas las ramas nuevas (manteniendo cobertura global `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26` y `--max-warnings 0`) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **12.4.** Sincronizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md`, regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 13: Reconciliación Automática, Deduplicación y Aislamiento de Reglas de Dominio en `.agents/` (`reconcile-agents` / `reconcile_agents_governance`)
**Referencia Obligatoria:** [`docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md)

### Tareas de Implementación:
- [x] **13.1.** Añadir en `mcp-server/src/types.ts` los contratos `ReconcileAgentsInputSchema`, `ReconciledRuleItem` y `ReconcileAgentsResult`.
- [x] **13.2.** Implementar `mcp-server/src/cli/reconcile-agents.ts` (`reconcileAgentsGovernance`, `isPromotedSection`, `splitMarkdownSections`, respaldo automático en `.agents/backups/<timestamp>/`, poda de directivas ya promovidas al estándar global y extracción segura de reglas específicas del proyecto hacia `.agents/rules/domain_<project>_rules.md`).
- [x] **13.3.** Registrar la Tool 12 (`reconcile_agents_governance`) en `mcp-server/src/server.ts`, exponer el subcomando CLI `reconcile-agents` en `mcp-server/src/index.ts`, actualizar `mcp-server/src/cli/install-skill.ts` para instalar también los 7 archivos canónicos `.agents/rules/*.md` con `--include-scripts` y ejecutar reconciliación previa con `--reconcile`, actualizar `buildConnectorBlock()` y añadir `syncGlobalGeminiMd()` en `mcp-server/src/cli/init-agents-md.ts` (sincronizando no destructivamente `~/.gemini/GEMINI.md` e incluyendo la directiva obligatoria de Post-Mortem de Escapes QA con `propose_skill_evolution_pr`), e inyectar `upstream_evolution_reminder` en la salida de `certify_11x_gate` (`mcp-server/src/tools/certify-gate.ts`).
- [x] **13.4.** Crear la suite unitaria `mcp-server/tests/reconcile-agents.unit.ts` (validando deduplicación en proyectos tipo `rosgrid`, preservación de archivos `domain_*.md`, respaldos en `.agents/backups/`, modo `dry_run`, `syncGlobalGeminiMd` y `upstream_evolution_reminder`, manteniendo cobertura global `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26`) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **13.5.** Sincronizar `README.md`, `TESTING.md`, `docs/ai-integration.md`, `.agents/skills/qa-11x-architect/SKILL.md`, `.agents/skills/graphify-ast-navigator/SKILL.md` y `CHANGELOG.md`, blindar el protocolo obligatorio de 11 directrices operativas y ciclo de vida del grafo AST (`scripts/actualizar-grafos-graphify.sh` e `inspect_ast_blast_radius`) tanto para uso local como para consumidores del MCP, regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 14: Optimización Extrema de Tokens en Servidor MCP, Protocolo de 3 Vías Proporcionales (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), *Progressive Disclosure* y Economía Cognitiva
**Referencia Obligatoria:** [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md)

### Tareas de Implementación (Para Gemini 3.8 Flash High):
- [x] **14.1.** Ampliar los contratos Zod e interfaces en `mcp-server/src/types.ts`: añadir `include_content` (`default: false`) en `FetchBundleInputSchema` (`size_bytes`, `cached_path` en `FetchedFileItem`), `max_findings` (`default: 25`) en `AuditSecurityInputSchema`, `GroupedSecurityFinding` y `grouped_findings` en `SecurityAuditResult`, `max_items` (`default: 20`) en `AuditTestPyramidInputSchema` y `BlastRadiusInputSchema`, y conteos totales en `MissingTestInventory` y `BlastRadiusResult`.
- [x] **14.2.** Optimizar `mcp-server/src/tools/fetch-bundle.ts` y `mcp-server/src/server.ts` para omitir por defecto el volcado de `content` crudo en llamadas MCP (`include_content: false`, ahorrando ~50,000 tokens por llamada mientras verifica SHA-256 en caché local), y actualizar `buildConnectorBlock()` en `mcp-server/src/cli/init-agents-md.ts` incorporando las **3 Vías Proporcionales de Ejecución (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`)** y el protocolo *High-IQ Token Economy*.
- [x] **14.3.** Implementar `groupFindingsByRule()` y el límite `maxFindings` en `mcp-server/src/tools/security-auditor.ts`, el truncado `maxItems` con conteos totales en `mcp-server/src/tools/test-pyramid-auditor.ts` y `mcp-server/src/tools/blast-radius.ts`, manteniendo complejidad cognitiva `<= 15` y `--max-warnings 0`.
- [x] **14.4.** Añadir las nuevas huellas semánticas promovidas (`high-iq token economy`, `3-path proportional execution`, `ast/grep-first, windowed-read-second`, `subagent context isolation`, `zero redundant re-read`) en `PROMOTED_INVARIANT_FINGERPRINTS` de `mcp-server/src/cli/reconcile-agents.ts`.
- [x] **14.5.** Ampliar las suites unitarias en `mcp-server/tests/` (`tools-and-resources.unit.ts`, `security-auditor.unit.ts`, `test-pyramid-auditor.unit.ts`, `init-agents-md.unit.ts`) certificando cobertura global `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26`, añadir el Escenario 15 en `mcp-server/test/mcp_cli_test.feature`, actualizar el grafo AST (`./scripts/actualizar-grafos-graphify.sh mcp-server`), regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 15: Endurecimiento Integral `v2.16.0` de los 7 Stacks Corporativos, Contrato *Thin-Repo*, Hooks POSIX Rule-Zero y Convergencia 10/10 de Compuertas
**Referencia Obligatoria:** [`TESTING.md`](TESTING.md) y [`SECURITY.md`](SECURITY.md)

### Tareas de Implementación:
- [x] **15.1.** Endurecer `scripts/verificar-secretos.sh`, `scripts/publicar-mcp.sh` (`.env` `0600` y exclusión de `manifest.json`) y `scripts/auditar-infra.sh` (caché persistente `qa11x_trivy_cache` y mirrors de respaldo ECR/GHCR).
- [x] **15.2.** Converger al 100% las 10 etapas de `certify_11x_gate` (`mcp-server/src/tools/certify-gate.ts`) con `.agents/scripts/certify_task_completion.sh`, aplicando el contrato *Thin-Repo* por defecto en `bootstrap_or_merge_11x` y `install-skill --target all`, fusión segura de `lefthook.yml`, *Zero Hardcoded Pass* en `parseCoverage`/`audit_test_pyramid_gaps`, soporte `--version` y cobertura `>= 95%` incluyendo `src/index.ts`.
- [x] **15.3.** Reparar las plantillas de los 7 stacks (`vue3`, `react-frontend`, `python`, `fastapi`, `php`, `node-backend`, `bash-scripts`), eliminar daemons `graphify:8080`, reescribir `instalar-hooks.sh` / `lefthook.yml` bajo Regla Cero, preservar `mcp-server/dist` en `scripts/limpieza.sh` y añadir `tests/test_stacks_hydration_smoke.unit.py`.

---

## ✅ Hito 16: Invariante Anti-Silo Pre-Auth Multi-Etapa (`SEC-16`), Presupuesto Cognitivo `SKILL.md < 20 KB` y Verificador Documental Determinista (`verify_docs_invariants.py`)
**Referencia Obligatoria:** [`SECURITY.md`](SECURITY.md) §4.20 y [`.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md`](.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md)

### Tareas de Implementación:
- [x] **16.1.** Incorporar la regla estática `SEC-16` en `mcp-server/src/tools/security-auditor.ts` y la Regla #8 Anti-Ceguera UAT (*Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant*) con controles compensatorios STIG/OWASP (`challenge_id >= 128-bit`, `GETDEL`/Lua atómico, `TTL <= 300s`, purga por intentos y `PREAUTH_PUBLIC_ROUTES` simétrico).
- [x] **16.2.** Compactar `.agents/skills/qa-11x-architect/SKILL.md` por debajo de `< 20 KB` (`17.5 KB`) y `.agents/ACTIVE_TASK.md.example` a `<= 40` líneas (`24` líneas), sincronizando las 12 tools, los 9 recursos y los 23 archivos de skills en toda la documentación (`README.md`, `mcp-server/README.md`, `TESTING.md`, `SECURITY.md`, `FAQ.md`, `CONTRIBUTING.md`, `AI_MASTER_PROMPT.md` y `docs/*.md`).
- [x] **16.3.** Implementar `.agents/scripts/verify_docs_invariants.py` (+ `tests/test_verify_docs_invariants.unit.py`) e integrarlo en `certify_task_completion.sh` para bloquear regresiones de presupuesto cognitivo o derivas documentales.

---

## ✅ Hito 17: Paridad Pre-Push 1:1 con CI en MCP `qa-11x`: Sello de Evidencia `lint`, Stages `integration`/`ci`, Parser de Endpoints Dinámicos e Invariantes Python/PostgreSQL 17
**Referencia Obligatoria:** [`.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md`](.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md) y [`.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md`](.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md)

### Tareas de Implementación:
- [x] **17.1.** Implementar `mcp-server/src/services/qa-evidence.ts` y ampliar `run_ephemeral_qa` (`migration`, `integration`, `ci`) y `certify_11x_gate` (`lint_evidence_verified` / `require_lint_evidence`) para exigir evidencia vigente de `stage="lint"` ante cambios de código en Git preservando el Fast-Path `DOCS_ONLY`.
- [x] **17.2.** Normalizar expresiones template string dinámicas (`` `/routers${query}` ``, `` `/bridge/${subPath}` ``, `{path:path}`) simétricamente en `mcp-server/src/tools/certify-gate.ts` y `.agents/scripts/verify_no_orphan_api_endpoints.py`.
- [x] **17.3.** Incorporar las reglas `QA-MYPY-01`, `QA-PG17-RLS` y la extensión `importlib` de `QA-COV-01` en `security-auditor.ts` + `SurgicalMerger.mergeMakefile`, actualizar `fastapi/Makefile.example`, `python/Makefile.example` y skills (`SKILL.md < 20 KB`), y certificar con `prepush-ci-parity.unit.ts` (313 tests Vitest `>= 95%`), Pytest (54 tests) y Karate BDD (Escenario 21).

---

## ✅ Hito 18: Internacionalización v2.18.0 — Idioma Espejo Dinámico, Flag `--lang (auto|es|en)`, Targets `codex`/`windsurf` y Guías Multi-Agente EN/ES
**Referencia Obligatoria:** [`docs/agent-setup.md`](docs/agent-setup.md) y [`docs/agent-setup.en.md`](docs/agent-setup.en.md)

### Tareas de Implementación:
- [x] **18.1.** Incorporar el modo de idioma `OutputLanguageModeSchema` (`auto`, `es`, `en`) en `mcp-server/src/types.ts` e inyectar el protocolo *Dynamic Language Mirroring* en `init-agents-md.ts` (manteniendo retrocompatibilidad exacta en español para el Escenario 18 de Karate), con soporte de flags `--lang` / `-l` y variable de entorno `QA_OUTPUT_LANG`.
- [x] **18.2.** Añadir soporte para targets globales `codex` (`~/.codex/skills`) y `windsurf` (`~/.codeium/windsurf/skills`) con autodetección en `install-skill.ts` y `scripts/install-skill.sh`, traduciendo textos de ayuda CLI y descripciones MCP a inglés técnico conciso.
- [x] **18.3.** Desplegar la directiva `OUTPUT LANGUAGE & DYNAMIC MIRRORING` en las 5 Skills corporativas (`SKILL.md < 20 KB`), redactar `mcp-server/README.md` en inglés para npmjs, preservar `mcp-server/README.es.md` para GitHub y crear las guías bilingües paso a paso para 11 agentes de IA (`docs/agent-setup.md` y `docs/agent-setup.en.md`).
- [x] **18.4.** Validar con la pirámide completa de pruebas (Vitest `>= 95%`, Pytest unitario y Karate Labs BDD Escenario 22) y certificar las 10 compuertas de calidad.








