# 🗺️ Hoja de Ruta Maestra (ROADMAP.md) — Ecosistema Zero-Clone: Skill + Servidor MCP (Estándar 11X)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Arquitectura Objetivo:** Distribución Zero-Clone en Node.js (`npx -y @sinfallas/mcp-qa-11x`) + Skill Cognitiva (`qa-11x-architect`) + Hidratación Bajo Demanda desde GitHub con Verificación SHA-256 (`manifest.json`)  
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
| **Hito 4** | Servidor MCP en Node.js / TS (`mcp-server/`) — Núcleo, Recursos y Tools 1–4 | [`03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) | ⏳ Pendiente | `0%` |
| **Hito 5** | Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Tools 5–7 | [`04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) | ⏳ Pendiente | `0%` |
| **Hito 6** | Pruebas 11X (`>= 95%`), Empaquetado npm (`npx`) y Workflow de Publicación CI/CD | [`05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) | ⏳ Pendiente | `0%` |

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

## ⏳ Hito 5: Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Tools 5–7
**Referencia Obligatoria:** [`docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md)

### Tareas de Implementación:
- [ ] **5.1.** Implementar `mcp-server/src/parsers/output-parsers.ts` para resumir salidas de consola de `pytest-cov`, `vitest --coverage`, `kcov`, `radon`, `mypy`, `ruff`, `eslint`, `trivy`, `bandit`, `mutmut` y `stryker` a JSON compacto.
- [ ] **5.2.** Implementar Tool 5 (`mcp-server/src/tools/security-auditor.ts` — `audit_security_stig_owasp`) con las 10 reglas de detección estática (`SEC-01` a `SEC-10`) alineadas con los 22 patrones DISA ASD STIG V6R5 + OWASP v4.2.
- [ ] **5.3.** Implementar Tool 6 (`mcp-server/src/tools/ephemeral-runner.ts` — `run_ephemeral_qa`) usando exclusivamente `execFile("make", ["qa-" + stage], { shell: false })` y conectándolo con `output-parsers.ts`.
- [ ] **5.4.** Implementar Tool 7 (`mcp-server/src/tools/certify-gate.ts` — `certify_11x_gate`) integrando todas las compuertas de cierre.
- [ ] **5.5.** Registrar todas las herramientas y recursos en `mcp-server/src/server.ts`.

---

## ⏳ Hito 6: Pruebas 11X (`>= 95%`), Empaquetado npm (`npx`) y Workflow de Publicación CI/CD
**Referencia Obligatoria:** [`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md)

### Tareas de Implementación:
- [ ] **6.1.** Crear la suite completa de pruebas unitarias en `mcp-server/tests/*.unit.ts` alcanzando **$\ge 95.0\%$ de cobertura** en líneas, ramas, funciones y sentencias dentro del contenedor efímero `sinfallas/base-node-ionic:26`.
- [ ] **6.2.** Crear los escenarios BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`) validando el CLI y los contratos JSON.
- [ ] **6.3.** Ejecutar en contenedor efímero `make qa-all` y `npm pack --dry-run` dentro de `mcp-server/`, certificando `0` errores de tipado (`tsc --noEmit`), `0` errores de ESLint/SonarJS y paquete limpio.
- [ ] **6.4.** Crear el workflow `.github/workflows/publish-mcp-npm.yml` para publicación automatizada en npm con `--provenance --access public`.
- [ ] **6.5.** Actualizar `README.md`, `TESTING.md`, `docs/ai-integration.md` y `CHANGELOG.md` con las instrucciones de uso de 1 comando (`npx -y @sinfallas/mcp-qa-11x` y `npx -y @sinfallas/mcp-qa-11x install-skill`).
