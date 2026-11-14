<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

# `@sinfallas/mcp-qa-11x` — Servidor MCP Oficial e Instalador de Skills de QA Testing Blueprints

🌐 **Idioma / Language:** [English](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/README.md) | **Español**

Servidor oficial **Model Context Protocol (MCP)** e instalador CLI de fricción cero para [**QA Testing Blueprints (QA-11X v2.0 — v2.21.0)**](https://github.com/tecno-consultores/qa-testing-blueprints).

Diseñado para que agentes de programación IA (**Google Antigravity**, **Claude Code / Desktop**, **Cursor**, **Windsurf**, **OpenAI Codex CLI**, **VS Code Copilot**, **Hermes Agent** y **27+ agentes**) adopten QA-11X en **< 30 segundos**, ejecuten **18 herramientas MCP**, consulten **12 recursos criptográficos `blueprint://*`** y apliquen **Regla Cero Docker**, **DISA ASD STIG V6R5**, **OWASP v4.2**, **FINOS CALM** y **AI Evals Dual-Mode** sin clonar el repositorio completo.

---

## ⚡ Quickstart en 30 Segundos y Subcomandos CLI

### 1. Adopción Instantánea (`quickstart`)
```bash
npx -y @sinfallas/mcp-qa-11x@latest quickstart
# Con nivel progresivo, idioma y flujo GitHub Actions:
npx -y @sinfallas/mcp-qa-11x@latest quickstart --tier standard --lang es --agents auto --ci github
```

### 2. Sincronización Completa Thin-Repo (`install-skill`)
```bash
# Instala skills globales, scripts operativos y conector AGENTS.md en los IDEs detectados:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile
```

Subcomandos y flags disponibles:
- `quickstart [dir] [--tier starter|standard|enterprise] [--lang en|es] [--dry-run] [--json]` — Detecta el stack automáticamente (FastAPI, Python, Node, Vue 3, React, PHP, Bash, Mobile, Vibe) y genera el andamiaje QA-11X.
- `install-skill` (alias: `install`) `[--target auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] [--init-agents] [--include-scripts] [--reconcile]`
- `init-agents` (alias: `init-agents-md`) `[--project-path <dir>] [--lang auto|en|es] [--dry-run]`
- `reconcile-agents` `[--project-path <dir>] [--dry-run]`
- `[--stdio]` — Fuerza el listener JSON-RPC `stdio` en primer plano (`QA_FORCE_STDIO=1` también fuerza `stdio` headless).
- `--version` / `-v` | `--help` / `-h`

> **Guardia Anti-Bloqueo TTY (`QA-CLI-TTY-01`):** Ejecutar `npx -y @sinfallas/mcp-qa-11x@latest` sin subcomandos en una terminal interactiva (`process.stdin.isTTY`) imprime la guía rápida, sincroniza skills globales sin bloquear y termina limpiamente con `exit(0)` en `< 5s`. Cuando un IDE abre un *pipe* no-TTY, inicia el servidor MCP `stdio` automáticamente.

---

## 🔌 Registro en IDEs y Agentes de IA

* **Claude Code CLI:**
  ```bash
  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
* **VS Code / Copilot:**
  ```bash
  code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
  ```
* **Antigravity / Cursor / Claude Desktop / Windsurf / Hermes (`mcpServers` JSON):**
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

Consulta la matriz completa de 27+ clientes en [`docs/agent-setup.md`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/agent-setup.md).

---

## 🛡️ Escudo de Seguridad y Resiliencia Operativa (v2.21.0)

* **Interceptor `promptGuard` *Fail-Closed*:** Protege `tools/call` en las 18 herramientas con canonicalización `NFKC`, purga zero-width / Trojan Source, bloqueo de inyección de prompts y evasiones `QA-GIT-GATE-01` (`git push` / `npm publish`), y redacción PII/secretos antes de despachar cualquier handler.
* **`TaskStateGuard` y Reportes `Fail-Verbose`:** Limita concurrencia de tareas MCP, aísla timeouts (`60s` estándar / `>= 180s` transferencias pesadas), limpia artefactos truncados de `0 bytes` y formatea trazas `Fail-Verbose` sanitizadas compatibles con Allure (`diagnosticFormatter.ts`).
* **LLMs Locales y A2A Agent Card:** Compatible con evaluadores air-gapped **Ollama / vLLM** y tarjeta de descubrimiento [`agentCard.ts`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/src/a2a/agentCard.ts) (`v2.21.0`).

---

## 🤖 10 Skills Modulares (Presupuesto Cognitivo `< 20 KB`)

Lideradas por `qa-11x-architect` (`< 12 KB`), cargando 9 sub-skills especializadas bajo demanda:
`qa-11x-architect`, `qa-11x-docker-certifier`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator` y `refactoring-ui`.

---

## 🛠️ Herramientas Expuestas en el Servidor MCP (18 Tools)

1. **`inspect_project_config`:** Inspecciona señales de stack (`pyproject.toml`, `package.json`, `composer.json`), `docker-compose.qa.yml`, estado de la pirámide y grafos Graphify AST.
2. **`fetch_blueprint_bundle`:** Descarga plantillas solicitadas desde GitHub/espejo local validando su suma SHA-256 contra `manifest.json`.
3. **`bootstrap_or_merge_11x`:** Genera o fusiona configuraciones `.example`, Dockerfiles, Makefile y workflows de forma segura respaldando en `.11x-backup`.
4. **`inspect_ast_blast_radius`:** Inspección bidireccional AST (`declaring_files`, invocadores, callees y nivel de riesgo `LOW`/`MEDIUM`/`HIGH`) con reconstrucción Graphify (`auto_build_if_missing`).
5. **`clean_workspace_11x`:** Limpia artefactos Docker/caché pertenecientes a `root` mediante contenedor efímero Alpine sin usar `sudo`.
6. **`audit_security_stig_owasp`:** Analiza archivos sobre 34 reglas estáticas (`SEC-01..SEC-16`, `SEC-CI-ACTION-REF`, `QA-*`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `UI-11X-01..03`) con soporte *Metadata-Only* (`include_content: false`).
7. **`run_ephemeral_qa`:** Ejecuta `lint`, `unit`, `integration`, `ci`, `audit`, `secrets`, `validate-calm` o `clean` dentro de Docker efímero (`Regla Cero`), respetando vía rápida `DOCS_ONLY`.
8. **`certify_11x_gate`:** Ejecuta la compuerta de 10 etapas QA-11X emitiendo telemetría `Fail-Verbose` (`/tmp/qa-11x-last-failure.json`) y verificación de evidencia lint.
9. **`audit_test_pyramid_gaps`:** Audita proyectos frente a las 13 capas de la pirámide 11X (`L01`–`L13`), detectando vacíos en las 3 fases temporales y refresco dual.
10. **`init_or_append_agents_md`:** Inyecta o actualiza idempotentemente el bloque conector en `AGENTS.md` / reglas de IDE mediante marcadores HTML.
11. **`propose_skill_evolution_pr`:** Genera propuestas *Dual-Consumer* (reglas IA + MCP + documentación en español) ante escapes QA respetando `QA-GIT-GATE-01`.
12. **`reconcile_agents_governance`:** Reconcilia `.agents/` en proyectos consumidores, podando duplicados globales y aislando reglas de dominio en `.agents/rules/domain_<project>_rules.md`.
13. **`validate_calm_architecture` *(v2.0)*:** Valida esquemas **FINOS CALM** (*Architecture-as-Code*), 6 nodos núcleo, 5 relaciones tipadas y controles obligatorios 11X.
14. **`evaluate_release_gate` *(v2.0)*:** Calcula dictámenes cuantitativos `GO` / `NO_GO` a partir de cobertura (`>= 95%`), Trivy `HIGH/CRITICAL = 0`, MSI Stryker/Mutmut, CALM y STIG (devolviendo `SKIPPED` fail-closed en modo `smoke`).
15. **`evaluate_agent_trajectory` *(v2.0)*:** Evalúa trayectorias multi-paso de agentes IA en modo offline determinista (precedencia AST-First, tasas de compilación/alucinación, `QA-GIT-GATE-01`) o con DeepEval en Docker.
16. **`run_llm_red_team` *(v2.0)*:** Audita configuraciones Promptfoo **OWASP LLM Top 10**, sondas `promptGuard` y red-teaming en vivo (`SKIPPED_MISSING_CREDENTIALS` si faltan llaves en CI).
17. **`audit_vibe_prototype` *(v2.0)*:** Audita prototipos generados por IA (Bolt.new, Lovable, v0, Replit) detectando riesgos `VIBE-SEC-001..QA-005`, secretos expuestos, ausencia de RLS/WORM y planes `dryRun`.
18. **`sync_enterprise_tms` *(v2.0)*:** Normaliza reportes JUnit XML / Allure / SARIF hacia sistemas TMS (**TestRail**, **Jira Xray**) o bundles JSON portables protegidos por `TaskStateGuard`.

---

## 📚 Recursos Expuestos en el Servidor MCP (12 Resources)

1. **`blueprint://manifest`:** Índice SHA-256 en tiempo real (`manifest.json`) para todos los stacks soportados.
2. **`blueprint://core/philosophy`:** Filosofía Nivel-11X de 13 capas, Regla Cero, 10 Leyes y 11 Reglas Anti-Ceguera UAT.
3. **`blueprint://security/disa-owasp-22`:** Catálogo de los 22 patrones de endurecimiento DISA ASD STIG V6R5 y OWASP v4.2.
4. **`blueprint://database/postgres-rls-worm`:** Referencia PostgreSQL 17 RLS multi-transacción (`after_begin`) + auditoría WORM determinista (`seq_num` + `pg_advisory_xact_lock`).
5. **`blueprint://{stack}/readme`:** Guías operativas para `fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php` y `bash-scripts`.
6. **`blueprint://ui/refactoring-ui/{topic}`:** Diseño UI táctico, `tabular-nums`, contraste OKLCH WCAG 2.1 AA, modo oscuro y geometría Anti-JSDOM.
7. **`blueprint://core/active-task-template`:** Plantilla compacta de bitácora viva (`.agents/ACTIVE_TASK.md.example`, `<= 40` líneas).
8. **`blueprint://core/cleanup-script`:** Script oficial de saneamiento sin `root` (`limpieza.sh`) con fallback Alpine.
9. **`blueprint://core/roadmap-validator`:** Validador bidireccional de consistencia (`.agents/scripts/verify_roadmap_consistency.py`).
10. **`blueprint://ai/evals-redteam` *(v2.0)*:** Blueprint dual-mode DeepEval y Promptfoo OWASP LLM Top 10 (con fallback embebido offline).
11. **`blueprint://mobile-appium/readme` *(v2.0)*:** Blueprint Appium 2 + WebdriverIO Screenplay, biometría y permisos (`mobile-appium/`).
12. **`blueprint://vibe-rescue/readme` *(v2.0)*:** Blueprint de rescate *Vibe-to-Enterprise* en 5 etapas, plantillas PostgreSQL 17 RLS/WORM y reglas `VIBE-*`.

---

> **Certificación Clean-Room E2E (`example/` + `verify-v2.sh`):** Cada publicación se certifica en contenedor Docker efímero no-root (`./scripts/probar-mcp-example.sh` / `pnpm run test:example`) empaquetando el tarball con `npm pack`, instalando en un proyecto aislado bajo `/tmp` y verificando `quickstart`, `QA-CLI-TTY-01`, los **12 recursos**, las **18 herramientas**, `promptGuard` y la integración híbrida `FastAPI + Vue 3`.
