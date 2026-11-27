# 🗺️ Hoja de Ruta Maestra (ROADMAP.es.md) — Ecosistema Zero-Clone: Skill + Servidor MCP (Estándar 11X)

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](ROADMAP.md) · **Español (Espejo 1:1)**

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Arquitectura Objetivo:** Distribución Zero-Clone en Node.js (`npx -y @sinfallas/mcp-qa-11x@latest`) + Skill Cognitiva (`qa-11x-architect`) + Hidratación Bajo Demanda desde GitHub con Verificación SHA-256 (`manifest.json`)  
**Modelo Ejecutor Objetivo:** Modelo de Razonamiento Actual (Gemini / Claude / Antigravity)

> **DIRECTIVA DE EJECUCIÓN PARA EL AGENTE DE IA (Modelo de Razonamiento Actual (Gemini / Claude / Antigravity)):**
> 1. Lee siempre primero la especificación técnica asociada en `docs/specs/` (o `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md` + `CHANGELOG.es.md` para hitos evolutivos post-`v3.0` conforme a `docs/specs/README.es.md`) antes de iniciar cada Hito.
> 2. Respeta estrictamente la **Regla Cero (Rule Zero)**: toda validación de código, linters y pruebas unitarias/BDD DEBE ejecutarse dentro de los contenedores Docker efímeros (`sinfallas/*`).
> 3. Al completar cada subtarea o Hito, marca su casilla `[x]` en `ROADMAP.md` y `ROADMAP.es.md`, actualiza `CHANGELOG.{md,es.md}` y `TESTING.{md,es.md}`, y ejecuta `./.agents/scripts/certify_task_completion.sh`.

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
| **Hito 15** | Endurecimiento Integral `v2.16.0` de los 7 Stacks Corporativos, Contrato *Thin-Repo*, Hooks POSIX Rule-Zero y Convergencia 10/10 de Compuertas | [`TESTING.es.md`](TESTING.es.md) + [`SECURITY.es.md`](SECURITY.es.md) | ✅ Completado | `100%` |
| **Hito 16** | Invariante Anti-Silo Pre-Auth Multi-Etapa (`SEC-16`), Presupuesto Cognitivo `SKILL.md < 20 KB` y Verificador Documental Determinista (`verify_docs_invariants.py`) | [`SECURITY.es.md`](SECURITY.es.md) §4.20 + `02-security-disa-owasp-22.md` | ✅ Completado | `100%` |
| **Hito 17** | Paridad Pre-Push 1:1 con CI (`v2.17.0`) en MCP `qa-11x`: Sello de Evidencia `lint`, Stages `integration`/`ci`, Parser de Endpoints Dinámicos e Invariantes Python/PostgreSQL 17 (`QA-MYPY-01`, `QA-PG17-RLS`, `importlib`) | `03-stack-python-fastapi.md` + `08-postgres-rls-zero-downtime-migrations.md` | ✅ Completado | `100%` |
| **Hito 18** | Internacionalización `v2.18.0`: Idioma Espejo Dinámico, Flag `--lang (auto/es/en)`, Targets `codex`/`windsurf` y Guías Multi-Agente EN/ES | [`docs/agent-setup.es.md`](docs/agent-setup.es.md) (`docs/agent-setup.md`) | ✅ Completado | `100%` |
| **Hito 19** | Invariante Anti-Silo #9 (`QA-HEALTH-01`), Nivelación Documental Humana 1:1 (`docs/02` y `docs/04`) y Gobernanza Dual-Consumer en `propose_skill_evolution_pr` y `verify_docs_invariants.py` | [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md) + `SECURITY.es.md` §4.22 | ✅ Completado | `100%` |
| **Hito 20** | Detección de Versión sin Red Redundante (`.qa-11x-version` + TTL 24h Fail-Open), Aviso `update_available` en Tools y Auto-Sync Global de Skills por SHA-256 (`v2.20.0`) | [`docs/ai-integration.es.md`](docs/ai-integration.es.md) + [`docs/agent-setup.es.md`](docs/agent-setup.es.md) | ✅ Completado | `100%` |
| **Hito 21** | Cobertura Diferencial Multi-Stack (`verify_diff_coverage.py`), Persistencia Efímera de Reportes y Bloqueo Anti-Evasión | [`16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md) | ✅ Completado | `100%` |
| **Hito 22** | Memoria Determinista de Hallazgos y Cortacircuitos Anti-Loop (`exit 42`) en `run_ephemeral_qa` y `certify` | [`17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md) | ✅ Completado | `100%` |
| **Hito 23** | Modo Diferencial en `inspect_ast_blast_radius` (Cero Inflación MCP) y Exportador Ejecutivo `PR_VERDICT.md` | [`18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md) | ✅ Completado | `100%` |
| **Hito 24** | Auditoría Integral `QA-11X v3.0` (`v3.0.0`), Sincronizador `bump_version_11x.py`, Protocolo MCP en Vivo y Planificación `19_SPEC` / `20_SPEC` | [`19_SPEC`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md) + [`20_SPEC`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md) | ✅ Completado | `100%` |
| **Hito 25** | Matriz 15×12, `base-mobile-appium:26` y Arquitectura Documental Bilingüe | [`19_SPEC`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md) + [`20_SPEC`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md) | ✅ Completado | `100%` |
| **Hito 26** | `QA-11X v3.1` (`3.1.0`) — Flight Recorder Atómico, `tactical-patterns-11x`, Hidratación 10 Stacks y Endurecimiento Fail-Closed | [`AGENTS.md`](AGENTS.md) + [`TESTING.es.md`](TESTING.es.md) | ✅ Completado | `100%` |
| **Hito 27** | `v3.2.0` (`QA-11X v3.2`) — Remediación Integral 99/99 Hallazgos, 12 Subcomandos CLI, Anotaciones MCP 2026, A2A v1.0 y 100% Diff Coverage | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`TESTING.es.md`](TESTING.es.md) | ✅ Completado | `100%` |
| **Hito 28** | `v3.5.0` (`QA-11X v3.5`) — Fronteras AST Declarativas/Inestabilidad, Señales Git Longitudinales, SDD/EARS (`10` Refs) y `.claude-plugin/` | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`TESTING.es.md`](TESTING.es.md) | ✅ Completado | `100%` |
| **Hito 29** | `v3.6.0` (`QA-11X v3.6`) — Remediación de Auditoría Integral, Modularización de Monolitos, Economía de Tokens, Endurecimiento CI y 100% Diff Coverage | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`TESTING.es.md`](TESTING.es.md) | ✅ Completado | `100%` |
| **Hito 30** | `v3.7.0` (`QA-11X v3.7`) — Guardrails Anti-Saturación Docker, Candado FIFO, Protección Térmica/RAM/CrashLoop y Regla Estática #37 (`QA-DOCKER-LOOP-01`) | [`SECURITY.es.md`](SECURITY.es.md) §4.33 + [`docs/docker-troubleshooting.es.md`](docs/docker-troubleshooting.es.md) §15 | ✅ Completado | `100%` |
| **Hito 31** | `v3.8.0` (`QA-11X v3.8`) — `Rule Zero` Duro en Doctor, *Companion MCPs*, SARIF 2.1.0 Federado, Evidencia Dual `lint`+`unit`, `expect_red`, `--toolset` y Skills CSO | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`TESTING.es.md`](TESTING.es.md) | ✅ Completado | `100%` |
| **Hito 32** | `v3.9.0` (`QA-11X v3.9`) — Auditoría Integral sin Puntos Ciegos, Auto-Build AST Obligatorio, OpenCode First-Class, Plantilla de Correo y Blindaje Edge `UI-11X-03` | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`SECURITY.es.md`](SECURITY.es.md) §4.34 | ✅ Completado | `100%` |
| **Hito 33** | `v3.10.0` (`QA-11X v3.10`) — Saneamiento de Conflictos, Tiers Explícitos (`.qa-11x.json` v3), Detección No Destructiva de Gobernanza y Plantillas Contextuales Asistidas | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md) §9 | ✅ Completado | `100%` |
| **Hito 34** | `v3.11.0` (`QA-11X v3.11`) — Especificaciones Inversas Multiproyecto y Mapeo de Integración con Huella Cero (Tool MCP #20 `analyze_ecosystem_specs` y Skill #12 `qa-11x-reverse-specs`) | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`.agents/skills/qa-11x-reverse-specs/SKILL.md`](.agents/skills/qa-11x-reverse-specs/SKILL.md) | ✅ Completado | `100%` |
| **Hito 35** | `v3.12.0` (`QA-11X v3.12`) — Motor Profundo `analyze_ecosystem_specs` v2.0.0 (`.skeletons/`, 6 Entregables, 8 Categorías) y Remediación Integral de Auditoría | [`CHANGELOG.es.md`](CHANGELOG.es.md) + [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md) §10 | ✅ Completado | `100%` |

---

## ✅ Hito 1: Especificaciones de Diseño (`docs/specs/`) y Planificación (`ROADMAP.md`)
**Referencia:** [`docs/specs/README.es.md`](docs/specs/README.es.md)
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
- [x] **2.1.** Crear el script `scripts/generar-manifiesto.py` (en Python 3.12+ usando solo librería estándar: `hashlib`, `json`, `pathlib`, `datetime`, `argparse`) que escanee los 6 stacks iniciales (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`), `common_files` y `agent_governance_files`, calculando su tamaño en bytes, estrategia de fusión (`merge_strategy`), `target_name` y hash `sha256`.
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
- [x] **6.4.** Implementar el script autónomo de publicación a npmjs sin runners externos (`scripts/publicar-mcp.sh`, credenciales desde `.env` en la raíz bajo aislamiento local, validación efímera y `make publish-mcp`), eliminando cualquier dependencia de GitHub Actions o CI/CD externos.
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
- [x] **7.6.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md` documentando `audit_test_pyramid_gaps` y certificar con `./.agents/scripts/certify_task_completion.sh`.

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
- [x] **13.3.** Registrar la Tool 12 (`reconcile_agents_governance`) en `mcp-server/src/server.ts`, exponer el subcomando CLI `reconcile-agents` en `mcp-server/src/index.ts`, actualizar `mcp-server/src/cli/install-skill.ts` para instalar también los archivos canónicos `.agents/rules/*.md` con `--include-scripts` y ejecutar reconciliación previa con `--reconcile`, actualizar `buildConnectorBlock()` y añadir `syncGlobalGeminiMd()` en `mcp-server/src/cli/init-agents-md.ts` (sincronizando no destructivamente `~/.gemini/GEMINI.md` e incluyendo la directiva obligatoria de Post-Mortem de Escapes QA con `propose_skill_evolution_pr`), e inyectar `upstream_evolution_reminder` en la salida de `certify_11x_gate` (`mcp-server/src/tools/certify-gate.ts`).
- [x] **13.4.** Crear la suite unitaria `mcp-server/tests/reconcile-agents.unit.ts` (validando deduplicación en repositorios consumidores, preservación de archivos `domain_*.md`, respaldos en `.agents/backups/`, modo `dry_run`, `syncGlobalGeminiMd` y `upstream_evolution_reminder`, manteniendo cobertura global `>= 95.0%`) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **13.5.** Sincronizar `README.md`, `TESTING.md`, `docs/ai-integration.md`, `.agents/skills/qa-11x-architect/SKILL.md`, `.agents/skills/graphify-ast-navigator/SKILL.md` y `CHANGELOG.md`, blindar el protocolo obligatorio de 11 directrices operativas y ciclo de vida del grafo AST (`scripts/actualizar-grafos-graphify.sh` e `inspect_ast_blast_radius`) tanto para uso local como para consumidores del MCP, regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 14: Optimización Extrema de Tokens en Servidor MCP, Protocolo de 3 Vías Proporcionales (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), *Progressive Disclosure* y Economía Cognitiva
**Referencia Obligatoria:** [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md)

### Tareas de Implementación (Para Modelo de Razonamiento Actual (Gemini / Claude / Antigravity)):
- [x] **14.1.** Ampliar los contratos Zod e interfaces en `mcp-server/src/types.ts`: añadir `include_content` (`default: false`) en `FetchBundleInputSchema` (`size_bytes`, `cached_path` en `FetchedFileItem`), `max_findings` (`default: 25`) en `AuditSecurityInputSchema`, `GroupedSecurityFinding` y `grouped_findings` en `SecurityAuditResult`, `max_items` (`default: 20`) en `AuditTestPyramidInputSchema` y `BlastRadiusInputSchema`, y conteos totales en `MissingTestInventory` y `BlastRadiusResult`.
- [x] **14.2.** Optimizar `mcp-server/src/tools/fetch-bundle.ts` y `mcp-server/src/server.ts` para omitir por defecto el volcado de `content` crudo en llamadas MCP (`include_content: false`, ahorrando ~50,000 tokens por llamada mientras verifica SHA-256 en caché local), y actualizar `buildConnectorBlock()` en `mcp-server/src/cli/init-agents-md.ts` incorporando las **3 Vías Proporcionales de Ejecución (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`)** y el protocolo *High-IQ Token Economy*.
- [x] **14.3.** Implementar `groupFindingsByRule()` y el límite `maxFindings` en `mcp-server/src/tools/security-auditor.ts`, el truncado `maxItems` con conteos totales en `mcp-server/src/tools/test-pyramid-auditor.ts` y `mcp-server/src/tools/blast-radius.ts`, manteniendo complejidad cognitiva `<= 15` y `--max-warnings 0`.
- [x] **14.4.** Añadir las nuevas huellas semánticas promovidas (`high-iq token economy`, `3-path proportional execution`, `ast/grep-first, windowed-read-second`, `subagent context isolation`, `zero redundant re-read`) en `PROMOTED_INVARIANT_FINGERPRINTS` de `mcp-server/src/cli/reconcile-agents.ts`.
- [x] **14.5.** Ampliar las suites unitarias en `mcp-server/tests/` (`tools-and-resources.unit.ts`, `security-auditor.unit.ts`, `test-pyramid-auditor.unit.ts`, `init-agents-md.unit.ts`) certificando cobertura global `>= 95.0%` en contenedor efímero `sinfallas/base-node-ionic:26`, añadir el Escenario 15 en `mcp-server/test/mcp_cli_test.feature`, actualizar el grafo AST (`./scripts/actualizar-grafos-graphify.sh mcp-server`), regenerar `manifest.json` y certificar con `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Hito 15: Endurecimiento Integral `v2.16.0` de los 7 Stacks Corporativos, Contrato *Thin-Repo*, Hooks POSIX Rule-Zero y Convergencia 10/10 de Compuertas
**Referencia Obligatoria:** [`TESTING.es.md`](TESTING.es.md) y [`SECURITY.es.md`](SECURITY.es.md)

### Tareas de Implementación:
- [x] **15.1.** Endurecer `scripts/verificar-secretos.sh`, `scripts/publicar-mcp.sh` (`.env` `0600` y exclusión de `manifest.json`) y `scripts/auditar-infra.sh` (caché persistente `qa11x_trivy_cache` y mirrors de respaldo ECR/GHCR).
- [x] **15.2.** Converger al 100% las 10 etapas de `certify_11x_gate` (`mcp-server/src/tools/certify-gate.ts`) con `.agents/scripts/certify_task_completion.sh`, aplicando el contrato *Thin-Repo* por defecto en `bootstrap_or_merge_11x` y `install-skill --target all`, fusión segura de `lefthook.yml`, *Zero Hardcoded Pass* en `parseCoverage`/`audit_test_pyramid_gaps`, soporte `--version` y cobertura `>= 95%` incluyendo `src/index.ts`.
- [x] **15.3.** Reparar las plantillas de los 7 stacks (`vue3`, `react-frontend`, `python`, `fastapi`, `php`, `node-backend`, `bash-scripts`), eliminar daemons `graphify:8080`, reescribir `instalar-hooks.sh` / `lefthook.yml` bajo Regla Cero, preservar `mcp-server/dist` en `scripts/limpieza.sh` y añadir `tests/test_stacks_hydration_smoke.unit.py`.

---

## ✅ Hito 16: Invariante Anti-Silo Pre-Auth Multi-Etapa (`SEC-16`), Presupuesto Cognitivo `SKILL.md < 20 KB` y Verificador Documental Determinista (`verify_docs_invariants.py`)
**Referencia Obligatoria:** [`SECURITY.es.md`](SECURITY.es.md) §4.20 y [`.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md`](.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md)

### Tareas de Implementación:
- [x] **16.1.** Incorporar la regla estática `SEC-16` en `mcp-server/src/tools/security-auditor.ts` y la Regla #8 Anti-Ceguera UAT (*Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant*) con controles compensatorios STIG/OWASP (`challenge_id >= 128-bit`, `GETDEL`/Lua atómico, `TTL <= 300s`, purga por intentos y `PREAUTH_PUBLIC_ROUTES` simétrico).
- [x] **16.2.** Compactar `.agents/skills/qa-11x-architect/SKILL.md` por debajo de `< 20 KB` (`17.5 KB`) y `.agents/ACTIVE_TASK.md.example` a `<= 40` líneas (`24` líneas), sincronizando las 12 herramientas núcleo v1, los 9 recursos v1 y los 23 archivos de skills en toda la documentación (`README.md`, `mcp-server/README.md`, `TESTING.md`, `SECURITY.md`, `FAQ.md`, `CONTRIBUTING.md`, `AI_MASTER_PROMPT.md` y `docs/*.md`).
- [x] **16.3.** Implementar `.agents/scripts/verify_docs_invariants.py` (+ `tests/test_verify_docs_invariants.unit.py`) e integrarlo en `certify_task_completion.sh` para bloquear regresiones de presupuesto cognitivo o derivas documentales.

---

## ✅ Hito 17: Paridad Pre-Push 1:1 con CI en MCP `qa-11x`: Sello de Evidencia `lint`, Stages `integration`/`ci`, Parser de Endpoints Dinámicos e Invariantes Python/PostgreSQL 17
**Referencia Obligatoria:** [`.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md`](.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md) y [`.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md`](.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md)

### Tareas de Implementación:
- [x] **17.1.** Implementar `mcp-server/src/services/qa-evidence.ts` y ampliar `run_ephemeral_qa` (`migration`, `integration`, `ci`) y `certify_11x_gate` (`lint_evidence_verified` / `require_lint_evidence`) para exigir evidencia vigente de `stage="lint"` ante cambios de código en Git preservando el Fast-Path `DOCS_ONLY`.
- [x] **17.2.** Normalizar expresiones template string dinámicas (`` `/routers${query}` ``, `` `/bridge/${subPath}` ``, `{path:path}`) simétricamente en `mcp-server/src/tools/certify-gate.ts` y `.agents/scripts/verify_no_orphan_api_endpoints.py`.
- [x] **17.3.** Incorporar las reglas `QA-MYPY-01`, `QA-PG17-RLS` y la extensión `importlib` de `QA-COV-01` en `security-auditor.ts` + `SurgicalMerger.mergeMakefile`, actualizar `fastapi/Makefile.example`, `python/Makefile.example` y skills (`SKILL.md < 20 KB`), y certificar con `prepush-ci-parity.unit.ts` (313 tests Vitest `>= 95%`), Pytest (54 tests) y Karate BDD (Escenario 21).

---

## ✅ Hito 18: Internacionalización `v2.18.0` — Idioma Espejo Dinámico, Flag `--lang (auto|es|en)`, Targets `codex`/`windsurf` y Guías Multi-Agente EN/ES
**Referencia Obligatoria:** [`docs/agent-setup.es.md`](docs/agent-setup.es.md) (`docs/agent-setup.md`)

### Tareas de Implementación:
- [x] **18.1.** Incorporar el modo de idioma `OutputLanguageModeSchema` (`auto`, `es`, `en`) en `mcp-server/src/types.ts` e inyectar el protocolo *Dynamic Language Mirroring* en `init-agents-md.ts` (manteniendo retrocompatibilidad exacta en español para el Escenario 18 de Karate), con soporte de flags `--lang` / `-l` y variable de entorno `QA_OUTPUT_LANG`.
- [x] **18.2.** Añadir soporte para targets globales `codex` (`~/.codex/skills`) y `windsurf` (`~/.codeium/windsurf/skills`) con autodetección en `install-skill.ts` y `scripts/install-skill.sh`, traduciendo textos de ayuda CLI y descripciones MCP a inglés técnico conciso.
- [x] **18.3.** Desplegar la directiva `OUTPUT LANGUAGE & DYNAMIC MIRRORING` en las 5 Skills corporativas (`SKILL.md < 20 KB`), redactar `mcp-server/README.md` en inglés para npmjs, preservar `mcp-server/README.es.md` para GitHub y crear las guías bilingües paso a paso para 11 agentes de IA (`docs/agent-setup.md` y `docs/agent-setup.es.md`).
- [x] **18.4.** Validar con la pirámide completa de pruebas (Vitest `>= 95%`, Pytest unitario y Karate Labs BDD Escenario 22) y certificar las 10 compuertas de calidad.

---

## ✅ Hito 19: Invariante Anti-Silo #9 (`QA-HEALTH-01`), Nivelación Documental Humana 1:1 y Gobernanza Dual-Consumer
**Referencia Obligatoria:** [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md), [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md) y [`SECURITY.es.md`](SECURITY.es.md) §4.22

### Tareas de Implementación:
- [x] **19.1.** Implementar la regla estática `QA-HEALTH-01` en `mcp-server/src/tools/security-auditor.ts` (detección de supervisores `asyncio` sin `task.exception()` y sondas físicas de `healthcheck` en `Dockerfile`/`docker-compose*.yml` sin aserción real en `tests/`) e incorporarla como Regla #9 Anti-Ceguera UAT en `qa-11x-architect` (`SKILL.md < 20 KB`, `03-stack-python-fastapi.md`, `01-core-13-layers.md`).
- [x] **19.2.** Nivelar 1:1 los manuales en español para lectura humana (`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md` con las 9 reglas Anti-Silo completas, `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md` con trazabilidad `SEC-01..16`, `SECURITY.md` §4.22, `README.md`, `docs/ai-integration.md` y `mcp-server/README.{md,es.md}`).
- [x] **19.3.** Incorporar la matriz **Dual-Consumer** (Skill IA + Auditor MCP + Manual Humano) en `propose_skill_evolution_pr` (`types.ts`, `propose-evolution-pr.ts`, `server.ts`), en `.agents/rules/continuous_agent_evolution.md` y en el validador automático `check_dual_consumer_parity` de `.agents/scripts/verify_docs_invariants.py`.
- [x] **19.4.** Validar con suites unitarias y BDD en Docker efímero (`qa-health-dual-consumer.unit.ts`, `test_verify_docs_invariants.unit.py` y Karate BDD Escenario 23), regenerar `manifest.json` + grafos AST y superar la compuerta 10/10.

---

## ✅ Hito 20: Detección de Versión sin Red Redundante (`.qa-11x-version` + TTL 24h Fail-Open), Aviso `update_available` en Tools y Auto-Sync Global de Skills por SHA-256 (`v2.20.0`)
**Referencia Obligatoria:** [`docs/ai-integration.es.md`](docs/ai-integration.es.md) y [`docs/agent-setup.es.md`](docs/agent-setup.es.md)

### Tareas de Implementación:
- [x] **20.1.** Implementar `mcp-server/src/services/version-manager.ts` con estampado determinista `.qa-11x-version` en `install-skill.ts` y `scripts/install-skill.sh`, reutilización de `manifest.json` (`ETag`) y caché `latest-version-check.json` (TTL 24 h con *fail-open* offline).
- [x] **20.2.** Exponer el campo estructurado `update_available` (`agent_notice` y `recommended_command`) en `inspect_project_config` y `certify_11x_gate` para notificación proactiva a través del agente de IA sin contaminar `stdout` JSON-RPC.
- [x] **20.3.** Incorporar `syncGlobalSkillsInBackground` en el arranque `stdio` del servidor MCP (`index.ts`) para sincronizar silenciosamente por `SHA-256` las skills globales preinstaladas preservando el idioma del conector en `~/.gemini/GEMINI.md`.
- [x] **20.4.** Certificar con `tests/version-manager.unit.ts` (`337/337` tests Vitest `>= 95%`), Escenario 24 en `mcp_cli_test.feature`, actualización de `manifest.json` y grafos AST, y publicación `v2.20.0` en `npmjs`.

---

## ✅ Hito 21: Cobertura Diferencial Multi-Stack (`verify_diff_coverage.py`), Persistencia Efímera de Reportes y Bloqueo Anti-Evasión
**Referencia Obligatoria:** [`docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md)

### Tareas de Implementación:
- [x] **21.1.** Configurar `.gitignore` y `scripts/limpieza.sh` para `.agents/.cache/` y `.agents/artifacts/`, y ajustar `Makefile` / `mcp-server/src/tools/ephemeral-runner.ts` para preservar `coverage.xml` y `lcov.info` en `.agents/.cache/coverage/` antes del cierre de contenedores `--rm`.
- [x] **21.2.** Crear `.agents/scripts/verify_diff_coverage.py` (parte 1: guardia Anti-XXE `exit 12`, adaptador Cobertura XML y adaptador LCOV con normalización de rutas `/app` -> workspace y complejidad `CC <= 5`).
- [x] **21.3.** Completar `.agents/scripts/verify_diff_coverage.py` (parte 2: cruce `git diff --unified=0` con `shell=False`, fast-path `DOCS_ONLY`, detector anti-evasión `exit 11` sin `QA11X-APPROVED-EXCLUSION` y salida `Pass-Quiet`/`Fail-Verbose`).
- [x] **21.4.** Crear `tests/test_verify_diff_coverage.unit.py` (`>= 95%` cobertura en `sinfallas/base-python-uv:3.15` validando XXE, LCOV ramas `>= 90%`, Cobertura XML, evasión `pragma`/`v8 ignore` y `DOCS_ONLY`).
- [x] **21.5.** Añadir target `make diff-cov` en `Makefile` e integrar la verificación diferencial condicional en `.agents/scripts/certify_task_completion.sh`.
- [x] **21.6.** Sincronizar directiva *Dual-Consumer* en `.agents/rules/mandatory_qa_pyramid_and_doc_sync.md` y `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, actualizar grafo AST, `make sync-governance` y certificar `make certify`.

---

## ✅ Hito 22: Memoria Determinista de Hallazgos y Cortacircuitos Anti-Loop (`exit 42`) en `run_ephemeral_qa` y `certify`
**Referencia Obligatoria:** [`docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md)

### Tareas de Implementación:
- [x] **22.1.** Crear `.agents/scripts/track_findings_state.py` (parte 1: normalización de hallazgos invariante a números de línea, almacenamiento `0600` en `.agents/.cache/certify_state.json` por `branch:merge_base` y flag `--reset-state`).
- [x] **22.2.** Completar `.agents/scripts/track_findings_state.py` (parte 2: máquina de estados `RESOLVED`/`PERSISTENT`/`REGRESSION_OSCILLATION`/`NEW` y disparo `exit 42` con `streak >= 3` u `oscillation >= 1`, `CC <= 5`).
- [x] **22.3.** Crear `tests/test_track_findings_state.unit.py` (`>= 95%` cobertura en `sinfallas/base-python-uv:3.15` validando desplazamiento de líneas, cambio de rama, umbral `streak == 3`, oscilación `A -> B -> A` y `--reset-state`).
- [x] **22.4.** Integrar seguimiento de rachas y alerta estructurada `BREAKER_42` en `mcp-server/src/services/qa-evidence.ts` y `mcp-server/src/tools/ephemeral-runner.ts` (`run_ephemeral_qa`) conservando intactas las 18 Tools MCP.
- [x] **22.5.** Crear pruebas unitarias TypeScript en `mcp-server/tests/` (`>= 95%` cobertura en `sinfallas/base-node-ionic:26`) y acoplar `track_findings_state.py` en `.agents/scripts/certify_task_completion.sh`.
- [x] **22.6.** Documentar el protocolo `BREAKER-42` en `.agents/rules/anti_regression_and_side_effects_guardrail.md`, `.agents/skills/qa-11x-systematic-debugging/SKILL.md` (`< 20 KB`) y `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, actualizar grafo AST, `make sync-governance` y `make certify`.

---

## ✅ Hito 23: Modo Diferencial en `inspect_ast_blast_radius` (Cero Inflación MCP) y Exportador Ejecutivo `PR_VERDICT.md`
**Referencia Obligatoria:** [`docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md)

### Tareas de Implementación:
- [x] **23.1.** Crear `mcp-server/src/utils/diff-bundle.ts` (`SonarJS <= 15`, `execFile` sin shell) con poda de lockfiles/generados, alerta `MISSING_KARATE_API_FEATURE`, fronteras opcionales en `.agents/ACTIVE_TASK.md` y redacción vía `promptGuard.ts`.
- [x] **23.2.** Extender retrocompatiblemente `BlastRadiusInputSchema` (`changed_since_ref`, `max_tokens_budget`) en `mcp-server/src/types.ts` y `mcp-server/src/tools/blast-radius.ts` sin alterar el catálogo de 18 Tools y 12 Resources.
- [x] **23.3.** Crear `mcp-server/tests/diff-blast-radius.unit.ts` (`>= 95%` cobertura en `sinfallas/base-node-ionic:26` validando ahorro `>= 60%` de tokens, redacción de secretos y rechazo de `baseRef` inválido) y actualizar `mcp-server/test/mcp_cli_test.feature`.
- [x] **23.4.** Crear `.agents/scripts/generate_pr_verdict.py` (`CC <= 5`, stdlib pura) reutilizando `release_readiness_gate.py`, `.agents/.qa-evidence.json` y `verify_diff_coverage.py` para emitir `.agents/artifacts/PR_VERDICT.md` y `pr_verdict_attestation.json` (`SHA-256`).
- [x] **23.5.** Crear `tests/test_generate_pr_verdict.unit.py` (`>= 95%` cobertura en `sinfallas/base-python-uv:3.15`) y exponer el target `make pr-verdict` en `Makefile`.
- [x] **23.6.** Actualizar `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `TESTING.md` y `CHANGELOG.md`, actualizar grafos AST, `make sync-governance` y `make certify`.

---

## ✅ Hito 24: Auditoría Integral `QA-11X v3.0` (`v3.0.0`), Sincronizador `bump_version_11x.py`, Protocolo MCP en Vivo y Planificación `19_SPEC` / `20_SPEC`
**Referencia Obligatoria:** [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md) + [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md)

### Tareas de Implementación:
- [x] **24.1.** Auditar en paralelo el servidor MCP (`src/`), las 10 skills (`.agents/skills/`), catálogos (`catalogs/*`, `llms.txt`), gobernanza, `.gitignore` y las 10 documentaciones de entorno (incluyendo `ai-evals`, `mobile-appium`, `vibe-rescue` y `architecture`).
- [x] **24.2.** Corregir paridad CLI (`tms-sync`, `-T`, `help`), versionado dinámico A2A/Allure/TMS (`MCP_SERVER_VERSION`) y reglas `.gitignore` / `<stack>/gitignore.example`.
- [x] **24.3.** Crear el automatizador determinista `.agents/scripts/bump_version_11x.py` (`CC <= 5`, `mypy --strict`, `100%` cobertura delta en `tests/test_bump_version_11x.unit.py`) e integrarlo en `Makefile` (`make version-check`), `sync_governance.py` y `certify_task_completion.sh`.
- [x] **24.4.** Crear las especificaciones de planificación exclusiva `v3.x`: `19_SPEC` (arquitectura bilingüe EN-primario + espejo ES sin ejecutar renombre masivo en `3.0.0`) y `20_SPEC` (plan de imagen base `sinfallas/base-mobile-appium:26` sin emulador ni `root`).
- [x] **24.5.** Crear `mcp-server/tests/live-mcp-protocol.test.ts` (`InMemoryTransport` + `StdioClientTransport` real contra `dist/index.js`), ampliar `tests/bats/` (`test_limpieza.bats`, `test_repo_scripts.bats`), `tests/test_verify_docs_invariants.unit.py` y añadir el Escenario 37 en `mcp-server/test/mcp_cli_test.feature`.
- [x] **24.6.** Ejecutar elevación coordinada `bump_version_11x.py --set 3.0.0 --edition "QA-11X v3.0"`, recomputar huellas SHA-256 en `manifest.json` y `catalogs/skillsllm-manifest.json`, certificar toda la matriz Docker (`Rule Zero`), actualizar `TESTING.md` / `CHANGELOG.md` y consolidar commit local certificado (sin `push` ni `npm publish`).

---

## ✅ Hito 25: Matriz 15×12, `base-mobile-appium:26` y Arquitectura Documental Bilingüe
**Referencia Obligatoria:** [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md) + [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md)

### Tareas de Implementación:
- [x] **25.1.** Integrar la imagen Docker dedicada no-root **`sinfallas/base-mobile-appium:26`** (`Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`), actualizar `mobile-appium/{Makefile.example,docker-compose.qa.yml,package.json.example,tests/mobile_screenplay.spec.ts}`, añadir `make test-mobile-blueprints` en `Makefile` y conectar `smoke-mobile-appium` en `.github/workflows/audit-base-images.yml`.
- [x] **25.2.** Integrar `sinfallas/base-mobile-appium:26` y `qa-mobile` en `mcp-server` (`src/resources/stackBlueprints.ts`, `src/tools/ephemeral-runner.ts`), habilitar negociación bilingüe `blueprint://*` (`?lang=es|en`) y nivelar la **Matriz de Calidad 15×12** en [`README.es.md`](README.es.md) (`README.md`).
- [x] **25.3.** Ejecutar la **Fase A de Spec 19**: migrar los documentos raíz, gobernanza, seguridad, pruebas, prompt, roadmap, changelog, `mcp-server/{CHANGELOG,example/README}` y `docs/agent-setup` hacia pares **Inglés Canónico (`*.md`) + Espejo 1:1 en Español (`*.es.md`)** con banners recíprocos de idioma y actualizar [`AGENTS.md`](AGENTS.md) y [`.agents/README.md`](.agents/README.md).

---

## ✅ Hito 26: `QA-11X v3.1` (`3.1.0`) — Flight Recorder Atómico, `tactical-patterns-11x`, Hidratación 10 Stacks y Endurecimiento Fail-Closed
**Referencia Obligatoria:** [`AGENTS.md`](AGENTS.md), [`TESTING.es.md`](TESTING.es.md) y [`SECURITY.es.md`](SECURITY.es.md)

### Tareas de Implementación:
- [x] **26.1.** Implementar el Flight Recorder Atómico Unificado ([`.agents/schemas/session_checkpoint.schema.json`](.agents/schemas/session_checkpoint.schema.json) + [`.agents/scripts/checkpoint_ctl.py`](.agents/scripts/checkpoint_ctl.py) + herramienta MCP `session_flight_recorder`), la skill táctica JIT [`tactical-patterns-11x`](.agents/skills/tactical-patterns-11x/SKILL.md) (`<= 2.5 KB`, `blueprint://skills/tactical-patterns-11x`), `[DIRECTIVE-11X]` y los bloqueos de complejidad `max-params: 4` / `max-depth: 3`.
- [x] **26.2.** Consolidar los 10 stacks hidratables en `manifest.json`, fuente única `_budgets.py` y `sync_governance.py`, conteos dinámicos en `verify_docs_invariants.py`, compuertas Fail-Closed, endurecimiento Docker no-root bajo Regla Cero y estabilización `QA-11X v3.1` (`3.1.0`).

---

## ✅ Hito 27: `v3.2.0` (`QA-11X v3.2`) — Remediación Integral 99/99 Hallazgos, 12 Subcomandos CLI, Estándares MCP 2026 y 100% Diff Coverage
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`AGENTS.md`](AGENTS.md)

### Tareas de Implementación:
- [x] **27.1.** Cerrar hallazgos de seguridad y runtime en el Servidor MCP (`src/utils/ideConfigPaths.ts`, `src/security/pathRealResolver.ts`, Zod `.strict()`, `annotations` MCP 2026, `A2A v1.0`, propagación `AbortSignal`) y certificar E2E Clean-Room `.tgz` + Karate BDD (`51/51`).
- [x] **27.2.** Endurecer los 10 stacks blueprints (digest OCI multi-arch `sinfallas/base-mobile-appium:26`, contratos portal/refresco dual React, `mutmut >= 3.7.0`, Promptfoo Nunjucks, SQL WORM fail-closed) y corregir scripts CI/Bash/Python (`make sbom` + `.sha256`, `make compact-context`, fallback `install-skill.sh` sin `jq`).
- [x] **27.3.** Sincronizar documentación 1:1 EN/ES (`docs/`, `README`, `TESTING`, `CHANGELOG`, `ROADMAP`), alcanzar `100.00%` de cobertura diferencial en líneas sobre Python/TS/Bash (`verify_diff_coverage.py`) y sellar localmente la versión `3.2.0` bajo `QA-GIT-GATE-01`.

---

## ✅ Hito 28: `v3.5.0` (`QA-11X v3.5`) — Fronteras AST Declarativas/Inestabilidad, Señales Git Longitudinales, SDD/EARS y `.claude-plugin/`
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`AGENTS.md`](AGENTS.md) *(incorpora `v3.3.0`: conectores Thin-Client `<= 1.5 KB`, `reconcile-agents` v2 y `kcov` rootless)*

### Tareas de Implementación:
- [x] **28.1.** Implementar `.agents/boundaries.json` declarativo (`layers`, `independence`, `forbidden` con guardia fail-closed de `0` nodos) e Inestabilidad de Martin (`--metrics`, `compute_module_instability`) en [`.agents/scripts/verify_topological_health.py`](.agents/scripts/verify_topological_health.py), más minería longitudinal `--git-signals` en [`.agents/scripts/inspect_blast_radius.py`](.agents/scripts/inspect_blast_radius.py) y `mcp-server` (`src/utils/git-signals.ts`, `include_git_signals`, CLI `--git-signals`).
- [x] **28.2.** Añadir [`10-sdd-ears-traceability.md`](.agents/skills/qa-11x-architect/references/10-sdd-ears-traceability.md) (`10` referencias de `qa-11x-architect` dentro de `<= 12,288 B`), actualizar `qa-11x-vibe-rescue`, `graphify-ast-navigator` y `active_task_and_planning_resilience.md`, endurecer esquema estricto de frontmatter Agent Skills + validador de rutas `references/`, y publicar [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) + [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
- [x] **28.3.** Rotar la versión del monorepo atómicamente a `3.5.0` (`QA-11X v3.5`) vía `bump_version_11x.py` + `sync_governance.py`, sincronizar documentación bilingüe 1:1, certificar `10/10` (`certify_task_completion.sh --strict`) con `100%` de cobertura diferencial y cerrar en `git commit` local (`QA-GIT-GATE-01`).

---

## ✅ Hito 29: `v3.6.0` (`QA-11X v3.6`) — Remediación de Auditoría Integral, Modularización de Monolitos, Economía de Tokens y Endurecimiento CI
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`AGENTS.md`](AGENTS.md)

### Tareas de Implementación:
- [x] **29.1.** Remediar todos los hallazgos `CRITICAL`, `HIGH` y `MEDIUM` de la auditoría integral en los stacks (`ai-evals`, `python`, `node-backend`, `php`, `fastapi`, `vue3`, `react-frontend`, `mobile-appium`, `mcp-server/example`), seguridad/parsers MCP, scripts de gobernanza y CI/Docker (`--security-opt=no-new-privileges:true`, cero `container_name:` fijos y digests `@sha256` fijados).
- [x] **29.2.** Modularizar los 7 monolitos (`server.ts`, `security-auditor.ts`, `test-pyramid-auditor.ts`, `ephemeral-runner.ts`, `tmsSyncCli.ts`, `surgical-merger.ts`, `verify_docs_invariants.py`), extraer `.agents/scripts/_common.py` y los scripts Python del `Makefile`, compactar `.agents/rules/*.md` un 57.8%, introducir el catálogo declarativo `commandCatalog.ts` + `structuredContent` unificado y elevar la fidelidad del Meta-QA.
- [x] **29.3.** Cerrar el `100.00%` de cobertura diferencial en líneas (`verify_diff_coverage.py`), rotar atómicamente el monorepo y el paquete npm a `3.6.0` (`QA-11X v3.6`), sincronizar documentación bilingüe 1:1 + `manifest.json` SHA-256 + grafos Graphify AST, certificar `certify_task_completion.sh` y publicar `@sinfallas/mcp-qa-11x@3.6.0`.

---

## ✅ Hito 30: `v3.7.0` (`QA-11X v3.7`) — Guardrails Anti-Saturación Docker, Serialización FIFO y `QA-DOCKER-LOOP-01` (#37)
**Referencia Obligatoria:** [`SECURITY.es.md`](SECURITY.es.md) §4.33, [`docs/docker-troubleshooting.es.md`](docs/docker-troubleshooting.es.md) §15 y [`CHANGELOG.es.md`](CHANGELOG.es.md)

### Tareas de Implementación:
- [x] **30.1.** Implementar candado FIFO atómico entre procesos (`QA_MAX_CONCURRENT_CONTAINERS=1`, `COMPOSE_PARALLEL_LIMIT=1`), guardias pasivas Linux de RAM/temperatura ACPI (`exit_code = 75` exento de `BREAKER-42`), detección/remediación pre-flight de CrashLoops y desmontaje Compose garantizado ante aborto en [`dockerGuardrails.ts`](mcp-server/src/tools/ephemeral-runner/dockerGuardrails.ts) + `run_ephemeral_qa`, y eliminar la fuga de contenedores `sleep 600` en subshells de [`.agents/scripts/certify_task_completion.sh`](.agents/scripts/certify_task_completion.sh).
- [x] **30.2.** Añadir la regla estática #37 `QA-DOCKER-LOOP-01` en [`dockerLoopRules.ts`](mcp-server/src/tools/security-auditor/dockerLoopRules.ts) y [`scripts/auditar-infra.sh`](scripts/auditar-infra.sh), actualizar [`scripts/limpieza.sh`](scripts/limpieza.sh) + `clean_workspace_11x` para contenedores `status=restarting` y redes Compose huérfanas, añadir `docker_health` (`dockerHealthProbe.ts`) en `qa-11x doctor` y endurecer los 13 `docker-compose.qa.yml` + 7 `*/Makefile.example`.
- [x] **30.3.** Sincronizar skills, reglas, conectores Thin-Client (`<= 1,536 B`), catálogos, `llms.txt`, manuales bilingües (`EN` + `ES`), `manifest.json` SHA-256 y grafos Graphify AST; certificar `100.00%` de cobertura diferencial en Vitest (`777`), Pytest (`340`), BATS (`115`), Karate BDD (`53`), Clean-Room E2E y compuerta `10/10` bajo la versión `3.7.0` (`QA-11X v3.7`).

---

## ✅ Hito 31: `v3.8.0` (`QA-11X v3.8`) — `Rule Zero` Duro en Doctor, *Companion MCPs*, SARIF 2.1.0 Federado, `expect_red`, `--toolset` y Skills CSO
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`docs/ai-integration.es.md`](docs/ai-integration.es.md)

### Tareas de Implementación:
- [x] **31.1.** Exigir Docker Engine activo como bloqueante duro en [`doctor.ts`](mcp-server/src/cli/doctor.ts) (`exitCode = 1`, `docker_daemon_ok: false`, `[RULE-ZERO]`) y añadir ejecución SARIF offline no-root en Docker serializado (`externalScannerRunner.ts`, `QA_MAX_CONCURRENT_CONTAINERS=1`), autodescubrimiento de *Companion MCPs* (`companionMcpDetector.ts`), ingestión SARIF 2.1.0 endurecida (`sarifIngester.ts`), certeza `confidence` y supresiones auditadas `qa-11x-ignore` (`fp-check`).
- [x] **31.2.** Exigir evidencia fresca dual `lint` + `unit` sobre código sucio en [`certify-gate.ts`](mcp-server/src/tools/certify-gate.ts) + [`qa-evidence.ts`](mcp-server/src/services/qa-evidence.ts), añadir sello TDD `expect_red` (`RED -> GREEN`, exento de `BREAKER-42`) en [`ephemeral-runner.ts`](mcp-server/src/tools/ephemeral-runner.ts), añadir `--toolset core|auto|full` (`toolsetFilter.ts`) y adoptar frontmatters CSO (*Trigger-Only*), revisión cruzada en 2 etapas (`0` Docker) y evals de presión anti-racionalización en `.agents/` y `tests/evals/`.
- [x] **31.3.** Corregir el montaje `mobile-appium:/mobile-appium:ro` en `pre-commit` de `lefthook.yml` e `instalar-hooks.sh`, rotar atómicamente el monorepo y `@sinfallas/mcp-qa-11x` a `3.8.0` (`QA-11X v3.8`), sincronizar documentación 1:1 EN/ES + `manifest.json` SHA-256 + grafos Graphify AST y certificar Vitest (`784`, `99.85%` líneas, `100.00%` diff líneas), Karate BDD (`54`), Pytest, BATS, E2E Clean-Room y `certify_task_completion.sh`.

---

## ✅ Hito 32: `v3.9.0` (`QA-11X v3.9`) — Auditoría Integral sin Puntos Ciegos, Auto-Build AST Obligatorio, OpenCode, Plantilla de Correo y Blindaje Edge `UI-11X-03`
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`SECURITY.es.md`](SECURITY.es.md) §4.34 y [`docs/agent-setup.es.md`](docs/agent-setup.es.md)

### Tareas de Implementación:
- [x] **32.1.** Corregir Ruff `C901`/`E501` en `tests/test_install_skill.unit.py`, añadir `standard_11x_readiness` por tier (`standardReadiness.ts`) en `inspect_project_config`, `meta_gates_audit` en `audit_test_pyramid_gaps` (promovida a `CORE_TOOLSET_NAMES`), `instructions` nativas en `McpServer` y paridad 1:1 de auto-build AST bajo Rule Zero en `certify_11x_gate` y `.agents/scripts/certify_task_completion.sh`.
- [x] **32.2.** Entregar soporte global first-class para OpenCode (`~/.config/opencode/{skills,AGENTS.md,opencode.json}`) en `install-skill`, `scripts/install-skill.sh`, `agents-connector.ts`, `mcp-config.ts`, `ideConfigPaths.ts`, `version-manager.ts`, `doctor.ts` y `docs/agent-setup.{md,es.md}`, además de la plantilla Zero-Trust de correo (`soporte@tecnoconsultores.net`, cero envío automático desde MCP) en `propose_skill_evolution_pr`.
- [x] **32.3.** Endurecer `UI-11X-03` contra envenenamiento de caché de borde y colisión MIME en `_redirects`, añadir Escenario 7 BDD (`404` en `/assets/*`) en `vue3/` y `react-frontend/`, crear `scripts/audit-edge.sh.example` + `tests/bats/test_audit_edge.bats`, rotar atómicamente el monorepo a `3.9.0` (`QA-11X v3.9`), refrescar grafos Graphify AST y certificar `10/10` (`QA-GIT-GATE-01`).

---

## ✅ Hito 33: `v3.10.0` (`QA-11X v3.10`) — Saneamiento de Conflictos, Tiers Explícitos (`.qa-11x.json` v3), Detección No Destructiva de Gobernanza y Plantillas Contextuales Asistidas
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md) §9

### Tareas de Implementación:
- [x] **33.1.** Introducir el esquema `.qa-11x.json` v3 (`mcp-server/src/services/qa11xConfig.ts`, valor por defecto unificado `standard`, `tierConfirmedByUser`, `governanceDocs`, banner `[QA-11X | Tier: <tier> | Path: <path>]`) y resolver ping-pong de conectores/bridges, `.gitignore` canónico de 13 entradas, fallback `$HOME/.agents/skills`, preservación de cobertura y `BREAKER-42` en `limpieza.sh`/`clean_workspace_11x` y consistencia de `ACTIVE_TASK.md`.
- [x] **33.2.** Converger `certify-gate.ts` ↔ `certify_task_completion.sh` (exenciones React Gate 4, `.agents/boundaries.json` declarativo Gate 6, paridad solo SQLAlchemy Gate 7, paridad O(n) `ROADMAP.{md,es.md}` Gate 9, `app/apps/packages/lib/server` + `GITHUB_BASE_REF` Gate 10, CALM seguro en consumidores y `lint_docs_gate`), añadir fallback `make qa-<stage>` -> `<stage>`, alinear `*/Makefile.example` + lockfiles congelados `QA_OFFLINE` + `CORE_TOOLSET_NAMES` y resolver conflictos normativos en `.agents/{rules,skills,references}/`.
- [x] **33.3.** Aplicar tiers de adopción explícitos extremo a extremo (`starter` / `standard` / `enterprise`) en `quickstart` interactivo TTY, `.github/actions/qa-11x-pr-check/action.yml` (`default: 'auto'`), `certify_11x_gate`, `certify_task_completion.sh`, `audit_test_pyramid_gaps`, `lefthook.yml`, `doctor` y conectores ligeros (`Oleada 1` certificada con `100%` de cobertura diferencial en líneas).
- [x] **33.4.** Implementar motor de detección no destructiva de gobernanza en 2 niveles (`mcp-server/src/services/governanceDetector.ts`, 8 documentos core/contextuales, 5 estados deterministas `present_compatible | present_legacy | missing_unprompted | declined | not_applicable`) expuesto en `inspect_project_config` (`standard_11x_readiness.governance_files` y `governance_onboarding_needed`).
- [x] **33.5.** Implementar plantillas contextuales dinámicas (`mcp-server/src/services/governanceTemplates.ts`, detección EN/ES, espejos `*.es.md` opt-in, inserción quirúrgica de `## [Unreleased]` con respaldo `0600` `.11x-backup`), extender `init_or_append_agents_md` / `quickstart` / `init-agents` manteniendo estrictamente `19` herramientas MCP y `13` recursos, y aplicar bloqueo proporcional `declined` / `legacy_preserved` en `certify-gate.ts` y `certify_task_completion.sh`.
- [x] **33.6.** Integrar directivas cognitivas de ciclo de vida diario en `qa-11x-architect`, `.agents/rules/` y conectores dentro de presupuestos de bytes estrictos, sincronizar documentación bilingüe Spec 19 (`ROADMAP`, `CHANGELOG`, `README`, `docs/05`, `TESTING`, `llms.txt`), ejecutar revisión limpia en 2 etapas + certificación completa en Docker efímero (incl. E2E Clean-Room y `100%` diff coverage) y cerrar localmente (`QA-GIT-GATE-01`).

---

## ✅ Hito 34: `v3.11.0` (`QA-11X v3.11`) — Especificaciones Inversas Multiproyecto y Mapeo de Integración con Huella Cero (Tool MCP #20 y Skill #12)
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`TESTING.es.md`](TESTING.es.md) y [`.agents/skills/qa-11x-reverse-specs/SKILL.md`](.agents/skills/qa-11x-reverse-specs/SKILL.md)

### Tareas de Implementación:
- [x] **34.1.** Implementar la Tool MCP #20 exclusiva para agente `analyze_ecosystem_specs` ([`analyzeEcosystemSpecs.ts`](mcp-server/src/tools/analyzeEcosystemSpecs.ts) + extractores modulares `ecosystem-specs/`) con extracción secuencial Graphify en Docker `:ro` hacia `<outputDir>/.graphs/<slug>/`, confinamiento `SEC-PATH-01` anti-solapamiento y anti-symlinks, correlación HTTP/REST + `.env` + ciclos/god-modules AST y alcance estricto `DOCUMENTATION_AND_INTEGRATION_ONLY_NO_VULNERABILITY_AUDIT` (detección nivel 2 en `--toolset auto`).
- [x] **34.2.** Crear la Skill modular #12 [`.agents/skills/qa-11x-reverse-specs/SKILL.md`](.agents/skills/qa-11x-reverse-specs/SKILL.md) definiendo entregables numerados en un solo idioma (`00-resumen-ecosistema.md`, `01-specs-<slug>.md`, `02-integracion-y-contratos.md`, `03-inconsistencias-y-mejoras.md`) con diagramas Mermaid, citas `archivo:línea`, `<= 20%` `[INFERRED]` y sin CALM ni espejos `.es.md` no solicitados.
- [x] **34.3.** Sincronizar conteos Dual-Consumer (`20` herramientas MCP, `12` skills modulares), A2A Agent Card, catálogos, documentación bilingüe, Escenario Karate 58, E2E Clean-Room (`./scripts/probar-mcp-example.sh`), cobertura diferencial al `100%` (`813` pruebas Vitest en `50` suites), rotar atómicamente a `3.11.0` (`QA-11X v3.11`) y certificar `10/10` (`certify_task_completion.sh`).

---

## ✅ Hito 35: `v3.12.0` (`QA-11X v3.12`) — Motor Profundo `analyze_ecosystem_specs` v2.0.0 y Remediación Integral de Auditoría
**Referencia Obligatoria:** [`CHANGELOG.es.md`](CHANGELOG.es.md), [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md) §10 y [`.agents/skills/qa-11x-reverse-specs/SKILL.md`](.agents/skills/qa-11x-reverse-specs/SKILL.md)

### Tareas de Implementación:
- [x] **35.1.** Remediar todos los hallazgos de la auditoría integral en núcleo/CLI MCP (`projectContextDetector.ts`, sanitización URL/título en `propose_skill_evolution_pr`, confinamiento symlink en `sarifIngester`, alcance de subgrafos en `blast-radius`, ciclos `reverse_import` en `certify-gate`, dirs sombra en `reconcile-agents`, detección de stacks en `inspect-project`/`test-pyramid`, Karate y cosecha de cobertura `ai-evals`/`vibe-rescue` en `ephemeral-runner`), scripts Python/Bash de gobernanza (`normalize_kcov_cobertura` anti-XXE, `verify_diff_coverage` exclusión no-doc `.agents/`, `lint_workflows` secretos por token, `inspect_blast_radius` llamadores transitivos, `select_tests_by_blast_radius` fusión multi-subgrafo, `bump_version_11x.py` preservación de filas reemplazadas en `SECURITY.{md,es.md}`), CI/hooks y los `10` stacks blueprints + `mcp-server/example/`.
- [x] **35.2.** Evolucionar la Tool MCP #20 `analyze_ecosystem_specs` al esquema `v2.0.0` (`detailLevel: 'standard' | 'deep' | 'exhaustive'`, `generateSkeletons: true`) con 6 nuevos extractores modulares (`schemaAndEnumExtractor.ts`, `endpointMetadataExtractor.ts`, `asyncAndExternalExtractor.ts`, `astFlowTracer.ts`, `deepContractChecks.ts`, `skeletonRenderer.ts`), 8 categorías de hallazgos (añadiendo `SPEC_VS_CODE_DRIFT`, `PAYLOAD_SCHEMA_DRIFT`, `UNHANDLED_PAGINATION_OR_ERROR_CONTRACT` + conteos pre-truncamiento `findings_total_counts`), prerenderizado determinista `.skeletons/00..05-*.skeleton.md` Markdown/Mermaid y expansión de la skill `qa-11x-reverse-specs` (`6` entregables numerados + `references/deliverable-templates.md`).
- [x] **35.3.** Endurecer `_docs_invariants_{counts,catalogs}.py` (badge Skills, `.claude-plugin/{plugin,marketplace}.json`, `docs/ai-integration.{md,es.md}`), sincronizar documentación bilingüe (`docs/05` §10, `README`, `TESTING`, `SECURITY`, `CONTRIBUTING`, `FAQ`, `CHANGELOG`, `ROADMAP`) dentro de presupuestos cognitivos estrictos, ampliar pruebas Vitest/Pytest/BATS/Escenario Karate 59 + Clean-Room `verify-v2.sh`, rotar atómicamente a `3.12.0` (`QA-11X v3.12`), refrescar grafos Graphify AST y certificar `10/10` (`certify_task_completion.sh --strict`, solo commit local bajo `QA-GIT-GATE-01`).
