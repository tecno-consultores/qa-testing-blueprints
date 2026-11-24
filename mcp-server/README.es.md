<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/README.md) · **Español (Espejo 1:1)**

# `@sinfallas/mcp-qa-11x` — Servidor MCP Oficial e Instalador de Skills de QA Testing Blueprints

[![npm version](https://img.shields.io/npm/v/%40sinfallas%2Fmcp-qa-11x)](https://www.npmjs.com/package/@sinfallas/mcp-qa-11x)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/LICENSE)

Servidor oficial **Model Context Protocol (MCP)** e instalador CLI de fricción cero para [**QA Testing Blueprints (QA-11X v3.5 — v3.5.0)**](https://github.com/tecno-consultores/qa-testing-blueprints).

Diseñado para que agentes de programación IA (**Google Antigravity**, **Claude Code / Desktop**, **Cursor**, **Windsurf**, **OpenAI Codex CLI**, **VS Code Copilot**, **Hermes Agent** y **28 agentes**) adopten QA-11X en **< 30 segundos**, ejecuten **19 herramientas MCP**, consulten **13 recursos criptográficos `blueprint://*`** (11 URIs estáticas + 2 plantillas URI) y apliquen **Regla Cero Docker**, **DISA ASD STIG V6R5**, **OWASP v4.2**, **FINOS CALM** y **AI Evals Dual-Mode** sin clonar el repositorio completo.

**Prerrequisitos:** **Node.js >= 24.0.0** y **Docker** (para ejecución efímera Regla Cero mediante `run_ephemeral_qa` y AI Evals en vivo).

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

Subcomandos y flags disponibles (**12 subcomandos CLI**):
- `quickstart [dir] [-T|--tier starter|standard|enterprise] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--ci github|none] [--force|-f] [--dry-run] [--json] [--help|-h]` — Detecta el stack automáticamente (FastAPI, Python, Node, Vue 3, React, PHP, Bash, Mobile, AI Evals, Vibe) y genera el andamiaje QA-11X.
- `install-skill` (alias: `install`) `[--target|-t auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--project-path|--dir|-p <dir>] [--init-agents] [--include-scripts] [--reconcile] [--dry-run] [--help|-h]` — Usa `--target auto` y `--lang auto` por defecto al activar `--init-agents`; se ejecuta en modo global seguro `$HOME` cuando se invoca desde `$HOME` sin `--project-path`/`--dir`/`-p` explícito (instalando solo skills globales sin escribir archivos de proyecto, mientras `-p ~`/`--dir ~` explícito sigue bloqueado por `SEC-PATH-01`).
- `init-agents` (alias: `init-agents-md`) `[dir] [--project-path|--dir|-p <dir>] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--dry-run] [--help|-h]` — Usa `--lang auto` por defecto (*Dynamic Language Mirroring*).
- `reconcile-agents [dir] [--project-path|--dir|-p <dir>] [--scan-workspaces <dir>] [--apply] [--prune-bridges] [--allow-dirty] [--dry-run] [--json] [--help|-h]` — Deduplica reglas/skills globales fuera de `.agents/` y aísla reglas de dominio con respaldos.
- `tms-sync --mode <inventory|push-results|pull-stories> --provider <jira|zephyr|xray|github-issues> [--target-dir <dir>] [--junit-xml <path>] [--base-url <https://...>] [--project-key <key>] [--issue-key <key>] [--test-execution-key <key>] [--repo <owner/repo>] [--required-keys <k1,k2>] [--timeout-ms <ms>] [--dry-run|--live] [--json] [--help|-h]` — Normaliza resultados JUnit XML para sincronización bidireccional o reportes de trazabilidad TMS.
- `doctor` (alias: `status`) `[dir] [--project-path|--dir|-p <dir>] [--offline] [--json] [--lang|-l en|es] [--help|-h]` — Inspecciona el origen del binario activo, cachés `~/.npm/_npx`, sellos de skills globales, configuraciones MCP en IDEs (Antigravity `~/.gemini/antigravity/mcp_config.json` + fallback `~/.gemini/config/mcp_config.json`, VS Code `mcp.json`, Gemini CLI `~/.gemini/settings.json`, Claude Desktop multi-OS `claude_desktop_config.json`, Claude Code `~/.claude.json`, Cursor, Windsurf, Codex `~/.codex/config.toml` TOML y Hermes `~/.hermes/mcp.json` / `~/.hermes/config.yaml` YAML), estado del proyecto (o ámbito global `$HOME` cuando `cwd == $HOME` sin directorio explícito, manteniendo `-p ~`/`--dir ~` bloqueado) y demonio Docker.
- `upgrade` (alias: `cache-clean`) `[--cache-only] [--reconcile] [--target|-t <env>] [--offline] [--dry-run] [--json] [--lang|-l en|es] [--help|-h]` — Limpia quirúrgicamente solo entradas de `@sinfallas/mcp-qa-11x` en `~/.npm/_npx` más `~/.cache/qa-11x-blueprints`, reconcilia la gobernanza `.agents/` (`--reconcile`) y resincroniza skills globales (`cache-clean` aplica `--cache-only`).
- `certify [dir] [--project-path|-p <dir>] [--strict] [--require-lint-evidence|--no-require-lint-evidence] [--allow-unmerged-examples] [--release-gate] [--junit-xml <path>] [--offline] [--json] [--lang|-l en|es] [--help|-h]` — Ejecuta la compuerta headless 11X de 10 verificaciones con `requireLintEvidence: true` por defecto (alineado con `certify_11x_gate`; pase `--no-require-lint-evidence` para desactivar, `exit 20` si `--strict` detecta controles `SKIPPED`) y compuerta opcional Release Readiness (`exit 30` en `NO_GO`).
- `audit [dir] [--project-path|-p <dir>] [--mode|-m security|pyramid|vibe|calm|all] [--format|-f text|json|sarif] [--json] [--sarif] [--fail-on critical|high|medium|any|none] [--include-examples] [--max-findings <n>] [--architecture-path <rel>] [--profile auto|generic|qa-11x-self] [--lang|-l en|es] [--help|-h]` — Ejecuta auditorías estáticas deterministas Zero-LLM con salida texto, JSON o SARIF v2.1.0 para CI/CD.
- `blast-radius [symbol] [--symbol|-s <symbol>] [--project-path|-p <dir>] [--changed-since <ref>] [--auto-build] [--refresh] [--git-signals] [--max-tokens <n>] [--max-items <n>] [--json] [--lang|-l en|es] [--help|-h]` — Inspecciona impacto bidireccional AST, señales git de churn/acoplamiento (`--git-signals`) y enrutamiento diferencial de PR (`DOCS_ONLY` | `MICRO_CHANGE` | `FULL_11X`).
- `mcp-config [--client|-c antigravity|claude-code|claude-desktop|cursor|vscode|windsurf|codex|gemini-cli|hermes|all] [--print] [--install] [--pin-version|--latest] [--dry-run] [--json] [--lang|-l en|es] [--help|-h]` — Imprime o fusiona de forma segura configuraciones `mcpServers` JSON/TOML fijadas por defecto a la versión activa (`@sinfallas/mcp-qa-11x@<version>`, pase `--latest` para etiqueta flotante), resolviendo Antigravity, VS Code, Gemini CLI, Claude Desktop multi-OS y Hermes con respaldo `.11x-backup` (`0600`) o comandos nativos de CLI para IDEs.
- `completion <fish|bash|zsh>` (o `--shell <fish|bash|zsh>`) `[--lang|-l en|es] [--help|-h]` — Emite scripts nativos de autocompletado de shell para `mcp-qa-11x` generados desde el catálogo declarativo único (`commandCatalog.ts`).
- `[--stdio]` — Fuerza el listener JSON-RPC `stdio` en primer plano (`QA_FORCE_STDIO=1` también fuerza `stdio` headless).
- `--version` / `-v` `[--verbose|--json]` | `--help` / `-h` `[--lang|-l en|es]` (`QA_OUTPUT_LANG`) — Imprime la versión SemVer activa o ayuda CLI bilingüe EN/ES gobernada por `--lang` / `QA_OUTPUT_LANG` (Spec 19 inglés por defecto). Disponible globalmente y por subcomando sin escribir ni descargar archivos.

> **Guardia Anti-Bloqueo TTY (`QA-CLI-TTY-01`):** Ejecutar `npx -y @sinfallas/mcp-qa-11x@latest` sin subcomandos en una terminal interactiva (`process.stdin.isTTY`) imprime la guía rápida, sincroniza skills globales sin bloquear y termina limpiamente con `exit(0)` en `< 5s` en lugar de bloquear `stdin`. Cuando un IDE abre un *pipe* no-TTY, inicia el servidor MCP `stdio` automáticamente.

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
* **Antigravity (`~/.gemini/antigravity/mcp_config.json`, fallback `~/.gemini/config/mcp_config.json`) / Cursor (`~/.cursor/mcp.json`) / Claude Desktop (`claude_desktop_config.json` multi-OS) / Windsurf (`~/.codeium/windsurf/mcp_config.json`) / Hermes (`~/.hermes/mcp.json` vs `~/.hermes/config.yaml` YAML) (`mcpServers` JSON):**
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

* **Generación o fusión segura en clientes (`mcp-config`):**
  ```bash
  npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client antigravity --install
  # Previsualizar todos los snippets IDE/CLI soportados o fijar la versión exacta:
  npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client all --print --pin-version
  ```

Consulta la matriz completa de 28 clientes en [`docs/agent-setup.es.md`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/agent-setup.es.md).

---

## 🛡️ Escudo de Seguridad y Resiliencia Operativa (v3.5.0)

* **Interceptor `promptGuard` *Fail-Closed*:** Protege `tools/call` en las 19 herramientas con canonicalización `NFKC`, purga zero-width / Trojan Source, bloqueo de inyección de prompts y evasiones `QA-GIT-GATE-01` (`git push` / `npm publish`), y redacción PII/secretos antes de despachar cualquier handler.
* **Confinamiento de Rutas `SEC-PATH-01` (`QA11X_WORKSPACE_ROOTS`):** Valida `project_path`, `workspaceRoot` y `targetDir` mediante `resolveSafeProjectPath`, bloqueando traversal (`..`), bytes NUL, symlinks fuera de raíces permitidas, rutas críticas del sistema (`/`, `/etc`, `/usr`, ...), `$HOME` y `os.tmpdir()` raíz. Configure `QA11X_WORKSPACE_ROOTS` (rutas separadas por delimitador de PATH) para autorizar workspaces adicionales fuera de `process.cwd()`.
* **`TaskStateGuard` y Reportes `Fail-Verbose`:** Limita concurrencia de tareas MCP, aísla timeouts (`60s` estándar / `>= 180s` transferencias pesadas), limpia artefactos truncados de `0 bytes`, acota el auto-sync TTY (`< 5s` fail-open hacia `stderr`) y formatea trazas `Fail-Verbose` sanitizadas compatibles con Allure (`diagnosticFormatter.ts`).
* **LLMs Locales y A2A Agent Card (`@sinfallas/mcp-qa-11x/agent-card`):** Compatible con evaluadores air-gapped **Ollama / vLLM** y expone el subpath export ESM público `@sinfallas/mcp-qa-11x/agent-card` (`package.json#exports` -> `dist/a2a/agentCard.js`, implementado en [`src/a2a/agentCard.ts`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/src/a2a/agentCard.ts), `v3.2.0`) como **módulo de librería programático** (no expuesto como herramienta ni recurso MCP público sobre `stdio`).

---

## 🤖 11 Skills Modulares (Presupuesto Cognitivo `< 20 KB`)

Lideradas por `qa-11x-architect` (`< 12 KB`), cargando 10 sub-skills especializadas bajo demanda:
`qa-11x-architect`, `qa-11x-docker-certifier`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui` y `tactical-patterns-11x` (`<= 2.5 KB` JIT).

---

## 🛠️ Herramientas Expuestas en el Servidor MCP (19 herramientas — v3.5)

1. **`inspect_project_config`:** Inspecciona señales de stack (`pyproject.toml`, `package.json`, `composer.json`), `docker-compose.qa.yml`, estado de la pirámide y grafos Graphify AST.
2. **`fetch_blueprint_bundle`:** Descarga plantillas solicitadas desde GitHub/espejo local validando su suma SHA-256 contra `manifest.json`.
3. **`bootstrap_or_merge_11x`:** Genera o fusiona configuraciones `.example`, Dockerfiles, Makefile y workflows de forma segura respaldando en `.11x-backup` (`dry_run` es `true` por defecto; pase `dry_run: false` para aplicar escrituras).
4. **`inspect_ast_blast_radius`:** Inspección AST bidireccional y diferencial (`declaring_files`, invocadores, callees, `changed_since_ref` y nivel de riesgo `LOW`/`MEDIUM`/`HIGH`) con reconstrucción Graphify (`auto_build_if_missing`).
5. **`clean_workspace_11x`:** Limpia artefactos Docker/caché pertenecientes a `root` mediante contenedor efímero Alpine sin usar `sudo`.
6. **`audit_security_stig_owasp`:** Analiza archivos sobre **22 controles de referencia DISA ASD STIG V6R5 / OWASP v4.2 + 36 reglas del escáner estático** (`SEC-01..SEC-16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-*`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `QA-STRYKER-CFG-01`, `UI-11X-01..03`) con límite configurable `max_findings` y auditoría opcional de plantillas `.example` mediante `include_examples: true`.
7. **`run_ephemeral_qa`:** Ejecuta cualquiera de las **16 etapas QA** (`lint`, `unit`, `migration`, `integration`, `ci`, `parity`, `orphans`, `contracts`, `bdd`, `mutation`, `dast`, `e2e`, `perf`, `chaos`, `profile`, `all`) dentro de Docker efímero (`Regla Cero`), respetando vía rápida `DOCS_ONLY`.
8. **`certify_11x_gate`:** Ejecuta la compuerta de 10 verificaciones QA-11X (`.example` sin fusionar, secretos, integridad JSON, UI/API huérfanos, paridad ORM/Alembic, topología AST, evidencia lint, STIG/OWASP, docs/manifiesto/roadmap) más verificación de actualizaciones, modo `strict` y opción `allow_unmerged_examples`.
9. **`audit_test_pyramid_gaps`:** Audita proyectos frente a las 13 capas de la pirámide 11X (`L01`–`L13`), detectando vacíos en las 3 fases temporales y refresco dual.
10. **`init_or_append_agents_md`:** Inyecta o actualiza idempotentemente el bloque conector en `AGENTS.md` / reglas de IDE mediante marcadores HTML (`dry_run` es `true` por defecto; pase `dry_run: false` para aplicar escrituras).
11. **`propose_skill_evolution_pr`:** Genera propuestas *Dual-Consumer* (reglas IA + MCP + documentación EN/ES en `docs/01..05_*.md`) ante escapes QA respetando `QA-GIT-GATE-01` (`dry_run` y `prefer_offline_fallback` son `true` por defecto).
12. **`reconcile_agents_governance`:** Reconcilia `.agents/` en proyectos consumidores, podando duplicados globales y aislando reglas de dominio en `.agents/rules/domain_<project>_rules.md` (`dry_run` es `true` por defecto; pase `dry_run: false` para aplicar cambios).
13. **`validate_calm_architecture` *(v2.0)*:** Valida esquemas **FINOS CALM** (*Architecture-as-Code*, `profile`: `auto` | `generic` | `qa-11x-self`), relaciones tipadas y la gobernanza 11X de 6 nodos / 5 relaciones / 7 controles al validar el modelo QA-11X.
14. **`evaluate_release_gate` *(v2.0)*:** Calcula dictámenes cuantitativos `GO` / `NO_GO` a partir de 3 señales operacionales — tasa de aprobación JUnit XML, telemetría de observabilidad (tasa de error %, latencia p95/p99, incidentes activos) y defectos abiertos / fugas QA (`open_blockers`, `open_criticals`, `qa_escapes`) — devolviendo `SKIPPED` fail-closed en modo `smoke`.
15. **`evaluate_agent_trajectory` *(v2.0)*:** Evalúa trayectorias multi-paso de agentes IA en modo offline determinista (precedencia AST-First, tasas de compilación/alucinación, `QA-GIT-GATE-01`) o con DeepEval en Docker.
16. **`run_llm_red_team` *(v2.0)*:** Audita configuraciones Promptfoo **OWASP LLM Top 10**, sondas `promptGuard` y red-teaming en vivo (`SKIPPED_MISSING_CREDENTIALS` si faltan llaves en CI).
17. **`audit_vibe_prototype` *(v2.0)*:** Audita prototipos generados por IA (Bolt.new, Lovable, v0, Replit) detectando riesgos `VIBE-SEC-001..QA-005`, secretos expuestos, ausencia de RLS/WORM y planes `dryRun`.
18. **`sync_enterprise_tms` *(v2.0)*:** Sincroniza trazabilidad bidireccional (`inventory`, `push-results`, `pull-stories`) usando JUnit XML con sistemas TMS (**Jira**, **Zephyr Scale**, **Xray**, **GitHub Issues**) protegido por `TaskStateGuard` (`dryRun` es `true` por defecto).
19. **`session_flight_recorder` *(v3.1)*:** Gestiona el Flight Recorder atómico (`.agents/.cache/session_checkpoint.json` `0600` -> proyección determinista `<= 40` líneas en `.agents/ACTIVE_TASK.md` + estado Git en vivo vía `save` | `recover` | `clear`).

---

## 📚 Recursos Expuestos en el Servidor MCP (13 recursos: 11 URIs estáticas + 2 plantillas URI — v3.5)

> **Desglose de Superficie:** **11 URIs estáticas** devueltas por `resources/list` + **2 plantillas URI** (`blueprint://{stack}/readme`, `blueprint://ui/refactoring-ui/{topic}`) devueltas por `resources/templates/list`.

1. **`blueprint://manifest`:** Índice SHA-256 en tiempo real (`manifest.json`) para todos los stacks soportados.
2. **`blueprint://core/philosophy`:** Filosofía Nivel-11X de 13 capas, Regla Cero, 10 Leyes y 11 Reglas Anti-Ceguera UAT.
3. **`blueprint://security/disa-owasp-22`:** Catálogo de 22 controles de referencia DISA ASD STIG V6R5 y OWASP Developer Guide v4.2 + 36 reglas de escáner estático.
4. **`blueprint://database/postgres-rls-worm`:** Referencia PostgreSQL 17 RLS multi-transacción (`after_begin`) + auditoría WORM determinista (`seq_num` + `pg_advisory_xact_lock`).
5. **`blueprint://{stack}/readme` *(Plantilla URI)*:** Guías operativas para los **10 stacks**: `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals` y `vibe-rescue`.
6. **`blueprint://ui/refactoring-ui/{topic}` *(Plantilla URI)*:** Diseño UI táctico, `tabular-nums`, contraste OKLCH WCAG 2.1 AA, modo oscuro y geometría Anti-JSDOM.
7. **`blueprint://core/active-task-template`:** Plantilla compacta de bitácora viva (`.agents/ACTIVE_TASK.md.example`, `<= 40` líneas).
8. **`blueprint://core/cleanup-script`:** Script oficial de saneamiento sin `root` (`limpieza.sh`) con fallback Alpine.
9. **`blueprint://core/roadmap-validator`:** Validador bidireccional de consistencia (`.agents/scripts/verify_roadmap_consistency.py`).
10. **`blueprint://ai/evals-redteam` *(v2.0)*:** Blueprint dual-mode DeepEval y Promptfoo OWASP LLM Top 10 (con fallback embebido offline).
11. **`blueprint://mobile-appium/readme` *(v2.0)*:** Blueprint Appium 3 / W3C + WebdriverIO Screenplay, biometría y permisos (`mobile-appium/`).
12. **`blueprint://vibe-rescue/readme` *(v2.0)*:** Blueprint de rescate *Vibe-to-Enterprise* en 5 etapas, plantillas PostgreSQL 17 RLS/WORM y reglas `VIBE-*`.
13. **`blueprint://skills/tactical-patterns-11x` *(v3.1)*:** Patrones tácticos JIT (`<= 2.5 KB`, `CC <= 5`, `SonarJS <= 15`, `max-params: 4`, Port/Adapter offline, Outbox transaccional) con `?lang=es|en` y fallback local.

---

> **Certificación Clean-Room E2E (`example/` + `verify-v2.sh`):** Cada publicación se certifica en contenedor Docker efímero no-root (`./scripts/probar-mcp-example.sh` / `pnpm run test:example`) empaquetando el tarball con `npm pack`, instalando en un proyecto aislado bajo `/tmp` y verificando **los 12 subcomandos CLI** (`quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`), `QA-CLI-TTY-01`, los **13 recursos** (11 estáticos + 2 plantillas), las **19 herramientas**, `promptGuard` y la integración híbrida `FastAPI + Vue 3`.
