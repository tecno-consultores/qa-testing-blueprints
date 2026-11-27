> 🌐 **Idioma:** [🇺🇸 English (Canonical)](ai-integration.md) · **Español (Espejo 1:1)**

# Integración Autónoma con Agentes de IA

Este documento detalla cómo evolucionar de una interacción manual a un flujo de trabajo automatizado, donde los agentes de Inteligencia Artificial ingieren, aplican y ejecutan los *blueprints* de QA de forma autónoma.

> **Requisito Obligatorio de Docker (`Rule Zero`):** Toda máquina o entorno de agentes que ejecute `qa-11x` DEBE tener un demonio Docker activo (`qa-11x doctor` lo aplica como bloqueante duro). `inspect_project_config` autodetecta MCPs compañeros instalados (`semgrep`, `serena`, `playwright`, `trivy`, `appium`) para delegación en vivo e ingiere `.agents/.cache/sarif/*.sarif` generados dentro de contenedores efímeros no-root (`--rm --restart=no --network none`) serializados bajo `QA_MAX_CONCURRENT_CONTAINERS=1`.

## 1. Ingestión de Reglas mediante MCP (Model Context Protocol)
Para que un agente comprenda las restricciones corporativas en tiempo real, los *blueprints* deben exponerse como recursos dinámicos.

* **El Concepto:** Evita darle a la IA acceso irrestricto de lectura a todo tu disco duro. Usa un servidor MCP para exponer únicamente las reglas y el código que necesita de forma comprimida.
* **Ejemplo Práctico 1 (Navegación AST Bidireccional CLI-First sin Demonios):** En lugar de leer archivos completos a ciegas o levantar servidores HTTP persistentes en el puerto 8080, el ecosistema extrae e indexa el grafo de conocimiento AST bajo demanda con `sinfallas/remote-graphify` (fijada por digest `@sha256:08aa6a6f...`) y lo consulta vía CLI o MCP (`stdio`):

```bash
  # 1. Extraer/actualizar incrementalmente graphify-out/{graph.json,GRAPH_REPORT.md}
  ./scripts/actualizar-grafos-graphify.sh

  # 2. Consultar ubicación exacta file:L<line>, llamadores entrantes y dependencias salientes (Rule Zero)
  docker run --rm --restart=no --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"
```
* **Invariante CLI-First / MCP `stdio`:** Tanto agentes con consola local (Antigravity, Claude Code, Cursor) como agentes conectados a `@sinfallas/mcp-qa-11x` (`inspect_ast_blast_radius`) consultan `graphify-out/graph.json` y `GRAPH_REPORT.md` directamente sin ocupar puertos TCP ni dejar demonios en segundo plano.
* **Ejemplo Práctico 2 (Recursos Dinámicos Verificados con SHA-256):** El servidor MCP `@sinfallas/mcp-qa-11x` v3.10.0 expone **13 recursos MCP (`blueprint://*`: 11 estáticos vía `resources/list` + 2 plantillas dinámicas vía `resources/templates/list`)** y **19 herramientas MCP** cubriendo **10 stacks hidratables + `architecture/` + `mcp-server/` (= 12 entornos de matriz)** (incluyendo `mobile-appium` sobre `sinfallas/base-mobile-appium:26`). Cuando el agente detecta un stack FastAPI, consulta `blueprint://fastapi/readme` y `blueprint://database/postgres-rls-worm` recibiendo las plantillas verificadas criptográficamente contra `manifest.json`.
* **Ejemplo Práctico 3 (Lectura Proactiva de Configuraciones QA):** El servidor MCP o la inspección estática no solo debe evaluar la topología. Debe auditar proactivamente los archivos de configuración de QA (como `pyproject.toml`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`) antes de escribir código.
  * **Regla Inquebrantable a inyectar al Agente Developer:** "Si el Agente Developer va a escribir código, su primer paso autónomo debe ser leer las reglas de linters y tipado, para generar código que cumpla con el estándar estricto (ej. `strict=true` en Mypy) desde el primer intento, ahorrando ciclos de auto-corrección (tokens)."

## 2. Orquestación Multi-Agente (Arquitecturas tipo Pantheon / Hermes)
Las pruebas de alta exigencia (mutación, SAST, BDD) abruman el contexto si un solo agente intenta programar la aplicación y auditarla al mismo tiempo. Se debe implementar una separación de roles.

* **El Concepto:** Un Agente Developer escribe el código; un Agente Auditor (QA) vigila que se cumplan las reglas del *blueprint*.
* **Sugerencia de Implementación (System Prompt para el Agente QA):**
  > *"Eres un auditor de QA implacable. Tu única fuente de la verdad es el archivo de reglas ingerido vía MCP o `.agents/rules/`. Si el Agente Developer propone comandos crudos locales como `pip install`, `npm run test` o intenta construir comandos largos de Docker, RECHAZA el código. Exígele estrictamente usar los comandos predefinidos en el `Makefile` (ej. `make qa-unit`, `make qa-all`) para aislar la infraestructura e invocar dependencias en los volúmenes de caché."*
* **Flujo:** Si el Developer crea un script de Bash destructivo sin usar `bats-mock`, el Agente QA intercepta el paso y obliga a refactorizar la prueba antes de dar el trabajo por terminado.

## 3. Optimización del Contexto con Proxies de Inferencia (OmniRoute)
El ciclo de auto-corrección consume masivamente tokens de entrada, especialmente al procesar volcados de error largos o reportes de cobertura en HTML.

* **El Concepto:** No gastes tokens de modelos de alto razonamiento (y alto costo) en arreglar un problema de espacios en blanco.
* **Ejemplo de Enrutamiento (Routing):**
  * **Tareas Mecánicas:** Configura OmniRoute para enrutar los errores de `shfmt`, `ShellCheck` o `Ruff` hacia un modelo local rápido y económico (ej. *Llama 3 8B* o *Hermes 3 8B*). Esta misma regla aplica para las herramientas de linting y formateo como `ESLint` y `Prettier`. Corregir indentación o punto y coma no requiere inteligencia avanzada.
  * **Tareas Lógicas:** Si una prueba de mutación en `Stryker` o `mutmut` falla, o hay un interbloqueo reportado por `Artillery`, enruta ese volcado al modelo de más alto razonamiento (ej. *Hermes 3 70B* o *Claude 3.5 Sonnet*), ya que requiere analizar el flujo de negocio para entender por qué la prueba es defectuosa. De igual manera, los reportes de análisis de deuda técnica y complejidad generados por `radon` o `eslint-plugin-sonarjs` deben ser procesados por los modelos mayores.

## 4. Sandboxing: Permisos de Ejecución (Tool Calling)
El ecosistema de `qa-testing-blueprints` está diseñado intencionalmente para ser el entorno de juegos de la IA. Como todas las pruebas ocurren en contenedores que se autodestruyen y se encapsulan tras comandos `make`, es seguro darle a la IA acceso de ejecución.

* **El Concepto:** Proporcionar al agente una herramienta (`tool_call`) para ejecutar comandos en la terminal, pero bloqueando el acceso al host real.
* **Ejemplo Práctico de Restricción (Python):** En la definición de tu herramienta para la IA, aplica una validación estricta antes de invocar el subproceso, forzando el uso exclusivo de metas del `Makefile`:

```python
  import shlex
  import subprocess

  ALLOWED_TARGETS = {"qa-lint", "qa-unit", "qa-bdd", "qa-e2e", "qa-all", "clean"}

  def ejecutar_comando_qa(comando: str) -> str:
      partes = shlex.split(comando)
      if len(partes) == 2 and partes[0] == "make" and partes[1] in ALLOWED_TARGETS:
          resultado = subprocess.run(partes, shell=False, capture_output=True, text=True, check=False, timeout=300)
          return resultado.stdout if resultado.returncode == 0 else resultado.stderr
      return "ERROR: Operación denegada. Solo se permiten metas allowlisted del Makefile (shell=False, APSC-DV-002510)."
```

* **El Bucle Autónomo de Observabilidad:** El agente ejecuta las pruebas y evalúa el `stderr`. Si `kcov` reporta solo un 85% de cobertura, o si la IA levanta el perfil `--profile chaos` y detecta mediante peticiones al endpoint `http://localhost:9090/api/v1/query` (Prometheus) que la latencia (P99) sobrepasa los umbrales corporativos, la IA comprende la falla, reescribe el código de negocio en su propio entorno interno y vuelve a invocar la herramienta de estrés hasta lograr el estándar.

## 5. Gobernanza Bimodal `.agents/`, Protocolo de Cierre en 11 Pasos y Compuerta de Certificación en 10 Etapas
En proyectos de grado corporativo, la IA debe seguir una directriz bimodal estricta:
1. **Reglas en Inglés Técnico de Alta Densidad:** Las instrucciones en `.agents/rules/` y habilidades en `.agents/skills/` permanecen exclusivamente en inglés técnico compacto para reducir el consumo de tokens BPE (~35%) y maximizar la precisión lógica de los modelos LLM.
2. **Documentación Canónica Bilingüe (`*.md` EN + `*.es.md` ES) y Espejo Dinámico:** La documentación humana sigue la arquitectura de inglés canónico (`*.md`) con espejo 1:1 en español (`*.es.md`), mientras el razonamiento interactivo y las respuestas del agente reflejan el idioma del prompt del usuario (`--lang auto|en|es`).
3. **Compuerta de Certificación en 10 Etapas (`certify_task_completion.sh`) dentro del Protocolo de Cierre en 11 Pasos:** Antes de concluir cualquier tarea `FULL_11X` bajo el protocolo de cierre en 11 pasos (`AGENTS.md` §5), la IA debe ejecutar las 10 etapas de certificación:
   - Secret Scanning (`scripts/verificar-secretos.sh`).
   - Auditoría de Infraestructura y Contenedores (`scripts/auditar-infra.sh` / Trivy).
   - Integridad de Archivos JSON sin claves duplicadas (`verify_json_no_duplicate_keys.py`).
   - Cero Componentes UI Huérfanos (`verify_zero_orphan_vue_components.py`).
   - Cero Endpoints de API Huérfanos (`verify_no_orphan_api_endpoints.py`).
   - Salud Topológica y Aislamiento de Capas (`verify_topological_health.py`).
   - Paridad ORM y Esquemas Relacionales (`verify_alembic_orm_parity.py`).
   - Sincronización Criptográfica del Manifiesto Remoto (`manifest.json`).
   - Consistencia Interna de `ROADMAP.{md,es.md}` y `ACTIVE_TASK.md` (`verify_roadmap_consistency.py`).
   - Sincronización incondicional de documentación bilingüe y pruebas obligatorias (`CHANGELOG.{md,es.md}`, `TESTING.{md,es.md}`, `README.{md,es.md}`).

---

## 6. Servidor MCP Zero-Clone (`@sinfallas/mcp-qa-11x`) — 1 Comando vía `npx`

El paquete oficial de Node.js **`@sinfallas/mcp-qa-11x`** permite a cualquier Agente de IA o desarrollador utilizar todo el arsenal metodológico y de validación 11X sin clonar el repositorio completo, resolviendo dependencias bajo demanda con verificación criptográfica SHA-256 (`DISA STIG V-222513`).

### 6.1. Ejecución Directa en 1 Comando

```bash
# Adopción rápida en 30 segundos (`quickstart`, soporta `--tier`/`-T`, `--lang`, `--agents`):
npx -y @sinfallas/mcp-qa-11x@latest quickstart -T standard --lang es --agents auto

# Instalación completa recomendada en un repositorio (instala las 11 Skills modulares, scripts .agents/scripts/* e inyecta el conector en AGENTS.md; alias: `install`):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

# Instalación con todas las opciones explícitas (especificando entorno de destino):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] --init-agents --include-scripts

# O inyectar/actualizar únicamente los conectores QA 11X en AGENTS.md e IDEs configurados:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--lang auto|en|es] [--agents auto|all|<csv>] [--dry-run]

# Sincronizar inventario BDD o enviar resultados JUnit XML hacia sistemas TMS corporativos:
npx -y @sinfallas/mcp-qa-11x@latest tms-sync --mode <inventory|push-results|pull-stories> --provider jira|zephyr|xray|github-issues [--junit-xml <ruta>] [--json] [--dry-run]

# Diagnóstico de entorno, actualización quirúrgica de caché, config MCP de IDEs y autocompletado shell:
npx -y @sinfallas/mcp-qa-11x@latest doctor [dir] [--offline] [--json]   # alias: status (o --version --verbose|--json)
npx -y @sinfallas/mcp-qa-11x@latest upgrade [--cache-only] [--dry-run]  # alias: cache-clean
npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client <id> [--print|--install] [--pin-version]
npx -y @sinfallas/mcp-qa-11x@latest completion <fish|bash|zsh>

# Compuertas CI/CD headless (certificación de 11 puntos, auditoría SARIF v2.1.0 y enrutamiento diferencial AST):
npx -y @sinfallas/mcp-qa-11x@latest certify [dir] [--strict] [--release-gate] [--junit-xml <ruta>] [--json]
npx -y @sinfallas/mcp-qa-11x@latest audit [dir] --mode <security|pyramid|vibe|calm|all> [--sarif|--json] [--fail-on high]
npx -y @sinfallas/mcp-qa-11x@latest blast-radius [simbolo] [--changed-since origin/main] [--git-signals] [--auto-build] [--json]

# Levantar el servidor MCP directamente sobre stdio (invocado por clientes IA; en TTY interactiva sincroniza skills y sale con 0, o usa --stdio):
npx -y @sinfallas/mcp-qa-11x@latest [--stdio]
```

#### Parámetros del instalador `install-skill`:
* **`--target, -t <entorno>`:** Destino de instalación de las 11 skills modulares (`auto` por defecto — instala exclusivamente en los directorios globales de agentes IA detectados en `$HOME`, usando `workspace` solo como fallback cuando no hay agentes globales—, `workspace`, `antigravity`, `claude`, `cursor`, `windsurf`, `codex`, `hermes` o `all`).
* **`--init-agents`:** Crea `AGENTS.md` o agrega al final del existente el bloque conector canónico de QA 11X sin sobrescribir reglas previas (y sincroniza `~/.gemini/GEMINI.md` junto con conectores Thin-Repo si se indica `--agents`).
* **`--include-scripts`:** Descarga en el directorio actual únicamente los scripts ejecutables de certificación (`.agents/scripts/*` y `scripts/*`), `.agents/schemas/*.json`, archivos comunes de CI/hooks y `.agents/ACTIVE_TASK.md.example` (`0o755`), sin duplicar `.agents/rules/*.md`.
* **`--reconcile`:** Reconcilia la gobernanza Thin-Repo del proyecto consumidor, eliminando copias locales de las 8 reglas canónicas y las 11 skills en `<proyecto>/.agents/`, y extrayendo reglas de negocio propias hacia `.agents/rules/domain_<project>_rules.md` con respaldo en `.agents/backups/`.

### 6.2. Configuración en Clientes de IA

> [!TIP]
> Para la guía exhaustiva con instrucciones paso a paso y matriz declarativa de los **28 agentes de IA soportados** (`quickstart --agents` / `init-agents --agents` incluyendo Antigravity, Claude Code/Desktop, Cursor, Windsurf, VS Code Copilot, Codex CLI, Gemini CLI, Hermes, Cline, Roo Code, Aider, JetBrains AI, Bolt, Lovable, v0 y Replit), consulta **[`docs/agent-setup.es.md`](agent-setup.es.md)** (Español; versión canónica en inglés en `docs/agent-setup.md`).

#### A. Claude Desktop (`claude_desktop_config.json`) y Claude Code (`~/.claude.json` / `.mcp.json`)
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

#### B. Cursor IDE (`.cursor/mcp.json`) y Windsurf (`~/.codeium/windsurf/mcp_config.json`)
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

#### C. Google Antigravity (`~/.gemini/antigravity/mcp_config.json`) y Gemini CLI (`~/.gemini/settings.json`)
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

#### D. Hermes Agent (`config.yaml`)
```yaml
mcp_servers:
  qa_11x:
    command: "npx"
    args: ["-y", "@sinfallas/mcp-qa-11x@latest"]
```

### 6.3. Catálogo de Recursos MCP Expuestos (`blueprint://*`: 11 Estáticos + 2 Plantillas = 13 Recursos)

> `resources/list` devuelve las **11 URIs estáticas** inferiores, mientras que `resources/templates/list` expone las **2 plantillas dinámicas `ResourceTemplate`** (`blueprint://{stack}/readme` y `blueprint://ui/refactoring-ui/{topic}`).

| URI del Recurso | Tipo MIME | Descripción Operativa |
| :--- | :--- | :--- |
| `blueprint://manifest` | `application/json` | Manifiesto criptográfico completo con hashes SHA-256 de todos los stacks y archivos. |
| `blueprint://core/philosophy` | `text/markdown` | Prompt maestro y filosofía Level-11X (`AI_MASTER_PROMPT.es.md`). |
| `blueprint://security/disa-owasp-22` | `text/markdown` | Síntesis técnica de los 22 controles de referencia DISA ASD STIG V6R5 y OWASP Developer Guide v4.2 (respaldados por 37 reglas estáticas del escáner). |
| `blueprint://{stack}/readme` | `text/markdown` | *(Plantilla de Recurso — `resources/templates/list`)* Guía operativa y lista de archivos canónicos del stack hidratable solicitado (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`). |
| `blueprint://ui/refactoring-ui/{topic}` | `text/markdown` | *(Plantilla de Recurso — `resources/templates/list`)* Pautas de diseño táctico y contraste WCAG 2.1 AA (`skill`, `hierarchy`, `layout`, `type`, `color`, `depth`, `images`, `polish`, `dark-mode`, `tailwind`). |
| `blueprint://core/active-task-template`| `text/markdown` | Plantilla canónica de bitácora resiliente para agentes de IA (`ACTIVE_TASK.md.example`). |
| `blueprint://core/cleanup-script` | `text/x-shellscript` | Script universal de saneamiento y purga segura sin sudo (`scripts/limpieza.sh`). |
| `blueprint://core/roadmap-validator` | `text/x-python` | Script de validación de consistencia de hoja de ruta (`verify_roadmap_consistency.py`). |
| `blueprint://database/postgres-rls-worm` | `text/markdown` | Patrón canónico PostgreSQL 17 RLS Multi-Transacción (`after_begin`) y cadena forense WORM determinista (`seq_num` + `pg_advisory_xact_lock`). |
| `blueprint://ai/evals-redteam` | `text/markdown` | Blueprint dual-mode DeepEval + Promptfoo OWASP LLM Top 10 (fallback offline embebido). |
| `blueprint://mobile-appium/readme` | `text/markdown` | Blueprint móvil Appium 3 / W3C + WebdriverIO Screenplay (`sinfallas/base-mobile-appium:26`, `APPIUM_HOME`, biometría y permisos). |
| `blueprint://vibe-rescue/readme` | `text/markdown` | Protocolo *Vibe-to-Enterprise* en 5 etapas, plantillas RLS/WORM y reglas `VIBE-*` (`vibe-rescue/`). |
| `blueprint://skills/tactical-patterns-11x` | `text/markdown` | *(v3.1)* Patrones tácticos JIT (`<= 2.5 KB`, `CC <= 5`, `max-params: 4`, Port/Adapter, Outbox) con soporte `?lang=es|en`. |

### 6.4. Catálogo de Herramientas MCP (`Tools`)

| Herramienta | Argumentos Principales | Propósito Operativo |
| :--- | :--- | :--- |
| **`inspect_project_config`** | `project_path` | Audita stacks presentes (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `ai-evals`, `mobile-appium`, `vibe-rescue`), linters, disponibilidad E2E (`BrowserTestingReadiness`) y estado `update_available` (`.qa-11x-version` + caché TTL 24 h *fail-open*). |
| **`fetch_blueprint_bundle`** | `stack`, `include_common_and_agents`, `include_content` | Descarga bajo demanda los archivos del stack con verificación criptográfica SHA-256 (soporta modo índice ligero `include_content: false` para ahorro de ~50,000 tokens — ver [`13_SPEC`](specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md)). |
| **`bootstrap_or_merge_11x`** | `project_path`, `stack`, `dry_run`, `create_backup` | Aplica una fusión quirúrgica no destructiva inyectando configuraciones QA sin alterar dependencias (crea respaldos `.11x-backup` por defecto). |
| **`inspect_ast_blast_radius`** | `project_path`, `target_symbol`, `changed_since_ref`, `include_git_signals`, `max_tokens_budget`, `max_items`, `auto_build_if_missing`, `refresh_graph` | Consulta el grafo AST (`graphify-out/graph.json` y `GRAPH_REPORT.md`) de forma bidireccional, diferencial (`git diff` + AST + poda semántica de 4 niveles) o longitudinal (hotspots `-M --numstat`, acoplamiento temporal cross-módulo y bus-factor) tanto para Code Q&A como para calcular el radio de impacto antes de refactorizar (`LOW` con `< 5` llamadores para `MICRO_CHANGE`). |
| **`clean_workspace_11x`** | `project_path`, `dry_run`, `deep_prune` | Sanea artefactos temporales de pruebas y cachés de Docker (soporta modo simulación y fallback Alpine). |
| **`audit_security_stig_owasp`**| `project_path`, `max_findings`, `include_examples` | Audita estáticamente 37 reglas estáticas del escáner (`SEC-01` a `SEC-16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-*`, `QA-DOCKER-LOOP-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `QA-STRYKER-CFG-01`, `UI-11X-01..03`) que respaldan los 22 controles de referencia DISA ASD STIG V6R5 + OWASP v4.2, con agrupación compacta (`groupFindingsByRule`) y soporte `include_examples`. |
| **`run_ephemeral_qa`** | `project_path`, `stage`, `timeout_seconds`, `skip_if_docs_only` | Ejecuta targets del `Makefile` (`16` etapas QA incluida `profile`) en Docker efímero bajo la Regla Cero y condensa la salida a JSON (soporta `skip_if_docs_only` y cortacircuitos `BREAKER-42`). |
| **`certify_11x_gate`** | `project_path`, `require_lint_evidence`, `strict`, `allow_unmerged_examples` | Ejecución de la compuerta de certificación de cierre (secretos, JSON, componentes UI, ORM, STIG, paridad Dual-Consumer docs, sello de evidencia `lint` y aviso `update_available`). |
| **`audit_test_pyramid_gaps`** | `project_path`, `stack`, `max_items` | Audita estáticamente las 13 capas de la pirámide 11X (`L01` a `L13`, incluyendo Ciclo Temporal de 3 Fases en `L13` y Refresco Dual en `L07`), detecta archivos huérfanos, endpoints sin BDD, vistas sin E2E y genera un plan de rescate priorizado acotado con `max_items`. |
| **`init_or_append_agents_md`** | `project_path`, `dry_run`, `lang`, `agents` | Crea `AGENTS.md` o añade de forma aditiva el bloque conector QA 11X (`--lang auto|es|en`, `--agents auto|all|<csv>`) y puentes Thin-Repo (`<= 15` líneas) para 28 agentes sin sobrescribir reglas previas. |
| **`propose_skill_evolution_pr`** | `project_path`, `target_blueprint_file`, `target_human_doc_file`, `target_mcp_component`, `improvement_title`, `empirical_rationale`, `proposed_content_or_snippet`, `proposed_human_doc_summary`, `dry_run`, `prefer_offline_fallback` | Propone mejoras federadas **Dual-Consumer** (Skill IA + Auditor MCP + Manual Humano en `docs/01..05_*.md`) a `qa-testing-blueprints` mediante `gh` CLI local autenticado o generando propuesta local con matriz de 3 capas y URL prellenada de GitHub. |
| **`reconcile_agents_governance`** | `project_path`, `dry_run` | Reconcilia y deduplica reglas en `.agents/` para proyectos adoptantes, podando directivas globales ya promovidas a `qa-testing-blueprints`, aislando reglas de dominio en `domain_<project>_rules.md` y respaldando en `.agents/backups/<timestamp>/`. |
| **`validate_calm_architecture`** | `workspaceRoot`, `architecturePath` | Valida esquemas **FINOS CALM** (*Architecture-as-Code*), 6 nodos núcleo, 5 relaciones tipadas y 7 controles obligatorios 11X. |
| **`evaluate_release_gate`** | `workspaceRoot`, `scope`, `dryRun`, `enforce`, `junitXmlPath`, `telemetryJsonPath`, `defectsJsonPath`, `thresholds` | Calcula dictámenes cuantitativos `GO`/`NO_GO` a partir de JUnit XML (tasa de aprobación/fallos/omisiones) más SLAs opcionales de telemetría (`latency`/`5xx`/MSI/cobertura) y defectos; devuelve `SKIPPED` fail-closed en `smoke`. |
| **`evaluate_agent_trajectory`** | `mode`, `workspaceRoot`, `testPath`, `steps`, `requiredSequence`, `actualOutput`, `retrievalContext`, `enforceAstBeforeEdit`, `timeoutMs` | Evalúa trayectorias multi-paso de agentes IA en modo offline determinista (`AST-First`, tasas de alucinación, `QA-GIT-GATE-01`) o DeepEval en Docker. |
| **`run_llm_red_team`** | `mode`, `workspaceRoot`, `configPath`, `timeoutMs` | Audita configuraciones Promptfoo **OWASP LLM Top 10**, sondas `promptGuard` y red-teaming condicional en Docker (`SKIPPED_MISSING_CREDENTIALS` sin llaves). |
| **`audit_vibe_prototype`** | `targetDir`, `workspaceRoot`, `dryRun`, `remediationSubdir`, `maxLines`, `enforce` | Inspecciona scaffolds generados por IA (`Bolt.new`, `Lovable`, `v0`, `Replit`) buscando riesgos `VIBE-SEC-001..QA-005`, fugas de secretos y ausencia de RLS/WORM. |
| **`sync_enterprise_tms`** | `mode`, `provider`, `targetDir`, `junitXmlPath`, `baseUrl`, `projectKey`, `issueKey`, `testExecutionKey`, `repo`, `requiredKeys`, `dryRun`, `timeoutMs`, `workspaceRoot` | Valida inventarios de trazabilidad `@JIRA`/`@TC` y envía resultados JUnit XML hacia **Jira**, **Zephyr Scale**, **Xray** o **GitHub Issues** protegidos por `TaskStateGuard` y anti-SSRF. |
| **`session_flight_recorder`** | `project_path`, `action`, `task_id`, `active_step`, `intent_140chars`, `completed_steps`, `planned_steps`, `allowed_globs`, `forbidden_globs`, `reason` | *(v3.1)* Flight Recorder atómico (`save` \| `recover` \| `clear`) que gestiona `.agents/.cache/session_checkpoint.json` (`0600`) -> proyección `<= 40` líneas en `.agents/ACTIVE_TASK.md` + Git en vivo. |

### 6.5. Auto-Sincronización Global en Arranque, Detección `update_available` y Validación Criptográfica

Introducido en `v2.20.0` (y activo en `v3.10.0`), `@sinfallas/mcp-qa-11x` incorpora tres mecanismos automáticos de ciclo de vida:
1. **Sello `.qa-11x-version`:** `install-skill` (tanto vía CLI como `scripts/install-skill.sh`) estampa `.qa-11x-version` en los directorios de skills y en `<proyecto>/.agents/.qa-11x-version` al instalar `--include-scripts`.
2. **Auto-Sync Silencioso en Segundo Plano (`stdio`):** En cada arranque del servidor MCP sobre `stdio`, sincroniza de forma no bloqueante (verificando `ETag` + `SHA-256` contra `manifest.json`) las skills globales ya instaladas (`~/.gemini`, `~/.claude`, `~/.cursor`, `~/.codeium/windsurf`, `~/.codex`, `~/.hermes`) preservando el idioma configurado en `~/.gemini/GEMINI.md`.
3. **Aviso Estructurado `update_available` (TTL 24 h *Fail-Open*):** Las herramientas `inspect_project_config` y `certify_11x_gate` devuelven `update_available` para que el propio asistente notifique en el chat si el servidor MCP, las skills globales o los scripts locales del proyecto requieren actualización.

Para diagnosticar tu entorno o purgar entradas antiguas de `@sinfallas/mcp-qa-11x` en las cachés de `npx` (`~/.npm/_npx`) y blueprints (`~/.cache/qa-11x-blueprints`) sin borrar paquetes de otras herramientas, ejecuta `doctor` y `upgrade`:

#### 1. Actualización Quirúrgica de Cachés y Rehidratación Completa
```bash
# A. Inspeccionar origen del binario activo, cachés _npx, sellos de skills, configs de IDEs y Docker:
npx -y @sinfallas/mcp-qa-11x@latest doctor

# B. Actualización quirúrgica (limpia solo cachés de @sinfallas/mcp-qa-11x + resincroniza skills globales):
npx -y @sinfallas/mcp-qa-11x@latest upgrade

# C. Limpieza quirúrgica solo de cachés (alias: cache-clean) o reseteo total manual en un proyecto:
npx -y @sinfallas/mcp-qa-11x@latest upgrade --cache-only
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts
```

#### 2. Reinicio del Servidor MCP en el IDE
* **Google Antigravity:** Abre **`...` (Additional Options) > MCP Servers**, selecciona **`qa-11x`** y pulsa **Restart / Refresh** (o ejecuta `Ctrl+Shift+P` -> **`Developer: Reload Window`**).
* **Cursor / Claude Desktop:** Ejecuta `Developer: Reload Window` o reinicia la aplicación para levantar el nuevo proceso `npx`.

#### 3. Comandos de Validación de Versión e Integridad SHA-256 (`DISA STIG V-222513`)
Para auditar que tanto el binario del servidor MCP como los archivos de las 11 Skills modulares y la documentación en caché corresponden a la última versión publicada:

```bash
# 1. Comparar versión publicada en npmjs contra la instalada en la caché de npx:
npm view @sinfallas/mcp-qa-11x version
grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

# 2. Verificar la versión del manifiesto y su marca de tiempo UTC en la caché local:
grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json

# 3. Validar dentro de Docker efímero (Regla Cero) que cada SHA-256 de Skill coincide con manifest.json:
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$(pwd):/app:ro" -w /app \
  -v "${HOME}/.cache/qa-11x-blueprints:/cache:ro" \
  -v "${HOME}/.gemini/config/skills:/skills:ro" \
  sinfallas/base-python-uv:3.15 python3 -c '
import hashlib, json, pathlib
m = json.loads(pathlib.Path("/cache/manifest.json").read_text(encoding="utf-8"))
skills = [f for f in m["agent_governance_files"] if f["path"].startswith(".agents/skills/")]
dest = pathlib.Path("/skills")
ok = sum(1 for s in skills if (p := dest / s["path"].replace(".agents/skills/", "", 1)).exists() and hashlib.sha256(p.read_bytes()).hexdigest() == s["sha256"])
ver = m["blueprint_version"]
print(f"✔ Skills en {dest}: {ok}/{len(skills)} archivos coinciden bit a bit con manifest.json (v{ver})")
'
```
