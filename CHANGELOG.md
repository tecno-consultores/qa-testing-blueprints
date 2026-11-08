# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### 🐛 Corregido (Fixed)
* **Protección Anti-Contaminación de `$HOME` en `install-skill` (`mcp-server/src/cli/install-skill.ts` y `scripts/install-skill.sh`):**
  * Corregido `resolveAllTargets` (`--target all`) y `resolveDestinationDirs` (`--target cursor`) para que, cuando el comando se ejecuta desde el directorio personal del usuario (`cwd === homeDir`), instale únicamente en los directorios globales de los agentes detectados (`~/.gemini/config/skills`, `~/.claude/skills`, `~/.cursor/skills`, `~/.hermes/skills`) sin crear `~/.agents/skills`.
  * Añadida guarda explícita `inHomeDir` en `runInstallSkillCli` para omitir la escritura de archivos exclusivos de proyectos (`AGENTS.md`, `lefthook.yml`, `commitlint.config.js`, `.trivy.yaml`, `.env.example`, `scripts/`, `.agents/`) cuando se invoca con `--init-agents`, `--include-scripts` o `--reconcile` desde `$HOME`, preservando la sincronización global de `~/.gemini/GEMINI.md`.
* **Resiliencia de Verificación CDN en `scripts/publicar-mcp.sh`:**
  * Sanitizada la extracción de la versión remota con `--silent`, `grep -E '^[0-9]+\.[0-9]+\.[0-9]+'`, `head -n 1` y `tr -d '[:space:]'` para prevenir que avisos de npm (`npm notice`) o espacios en blanco invaliden la verificación en la CDN de npmjs.
  * Formateado el bloque de reintento según estándar `shfmt` (-i 2 -ci) y verificado con ShellCheck (0 advertencias).

## [2.11.0] - 2026-11-07

### 🚀 Añadido y Mejorado (Added & Changed)
* **Implementación Completa del Hito 14 — Optimización Extrema de Tokens en Servidor MCP, 3 Vías Proporcionales y Progressive Disclosure:**
  * **Contratos Zod e Interfaces (`mcp-server/src/types.ts`):**
    * Añadido `include_content` (`default: false`) en `FetchBundleInputSchema` y campos `size_bytes`, `cached_path` en `FetchedFileItem`.
    * Añadido `max_findings` (`default: 25`) en `AuditSecurityInputSchema`, interfaz `GroupedSecurityFinding` y campos `grouped_findings`, `truncated_findings_count` en `SecurityAuditResult`.
    * Añadido `max_items` (`default: 20`) en `AuditTestPyramidInputSchema` y `BlastRadiusInputSchema`, y campos de conteos totales `total_orphan_files_count`, `total_untested_apis_count`, `total_untested_views_count` en `MissingTestInventory` y `truncated_dependents_count` en `BlastRadiusResult`.
  * **Herramientas MCP y Servidor (`mcp-server/src/tools/` y `mcp-server/src/server.ts`):**
    * `fetchBlueprintBundle`: Omitido el volcado de texto crudo de plantillas y reglas por defecto en llamadas MCP (`include_content: false`, ahorrando ~50,000 tokens por llamada) verificando SHA-256 en caché local y retornando metadatos compactos con `size_bytes` y `cached_path`.
    * `server.ts`: Propagados los nuevos parámetros de ahorro de tokens en `fetch_blueprint_bundle`, `inspect_ast_blast_radius`, `audit_security_stig_owasp` y `audit_test_pyramid_gaps`.
    * `security-auditor.ts`: Implementada la función `groupFindingsByRule()` para consolidar hallazgos repetidos por regla y límite `maxFindings` preservando la exactitud de `findings_count` y agregando `grouped_findings`.
    * `test-pyramid-auditor.ts` y `blast-radius.ts`: Implementado el truncado `maxItems` manteniendo conteos exhaustivos y cálculo intacto de capas y planes de rescate.
  * **Conector AGENTS.md y Reconciliación (`mcp-server/src/cli/init-agents-md.ts` y `reconcile-agents.ts`):**
    * `buildConnectorBlock`: Actualizado con las 3 Vías Proporcionales de Ejecución (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`) y el protocolo *High-IQ Token Economy*.
    * `reconcile-agents.ts`: Incorporadas 5 nuevas huellas en `PROMOTED_INVARIANT_FINGERPRINTS` (`high-iq token economy`, `3-path proportional execution`, `ast/grep-first, windowed-read-second`, `subagent context isolation`, `zero redundant re-read`).
  * **Pruebas y Verificación BDD:**
    * Suites unitarias ampliadas en `mcp-server/tests/` (277 tests en 13 suites, 100% pasando, cobertura global de 99.33% stmts y 95.38% branch en contenedor Docker efímero `sinfallas/base-node-ionic:26`).
    * Añadido el Escenario 15 en `mcp-server/test/mcp_cli_test.feature` validando el contrato de 3 vías de ejecución, economía de tokens y estructuras compactas.
    * Hito 14 completado al 100% en `ROADMAP.md` y sincronizado el grafo AST de `mcp-server/`.

* **Protocolo de Economía Cognitiva de Tokens (*High-IQ Token Economy* — 6 Estrategias), *3-Tier Progressive Disclosure* y 3 Vías Proporcionales de Ejecución (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`):**
  * **Skill Maestra (`.agents/skills/qa-11x-architect/SKILL.md`):**
    * Compactada y deduplicada mediante **Revelación Progresiva en 3 Niveles (*3-Tier Progressive Disclosure*)**, reduciendo su tamaño en un **~33% adicional** (de `27.2 KB` a `~18.2 KB` / `205` líneas) al reemplazar bloques repetidos por punteros bajo demanda a `.agents/rules/*.md` y `references/*.md`.
    * Añadida la **Sección 1 (*3-Path Proportional Execution Protocol*)** introduciendo la vía intermedia **`MICRO_CHANGE` (Vía Quirúrgica de Bajo Radio)** para cambios en `<= 3` archivos, sin nuevas rutas API ni migraciones ORM y con radio de impacto AST `LOW` (`< 5` llamadores en `inspect_ast_blast_radius`), permitiendo ejecutar únicamente las pruebas focalizadas del módulo modificado + `certify_task_completion.sh` y ahorrando un **70%–85% de tokens** en parches pequeños sin perder rigor 11X.
    * Añadida la **Sección 2.2 (*High-IQ Token Economy & Context Engineering Protocol — 6 Agent Strategies*)**, dotando al agente de 6 estrategias cognitivas para reducir drásticamente el consumo de tokens sin degradar su capacidad de razonamiento: (1) *AST/Grep-First, Windowed-Read-Second* (`StartLine`/`EndLine` de 40–80 líneas; prohibido leer archivos completos `> 150` líneas a ciegas), (2) *Zero Redundant Re-Read Invariant*, (3) *Parallel Tool Call Batching*, (4) *Subagent Context Isolation & Model Cascading* (`<= 20` líneas de retorno con punteros `archivo:línea`), (5) *Pass-Quiet & RTK Terminal Output Filtering*, y (6) *Surgical Diff Edits & Compact Scratchpad Budget* (`ACTIVE_TASK.md <= 40` líneas y recomendación de `/compact`).
  * **Gobernanza Canónica (`AGENTS.md`, `.agents/README.md` y `.agents/rules/*.md`):**
    * Actualizadas `mandatory_qa_pyramid_and_doc_sync.md` (Sección 2: 3 vías proporcionales), `active_task_and_planning_resilience.md` (Sección 3: presupuesto `<= 40` líneas en `ACTIVE_TASK.md` y plan inline para `MICRO_CHANGE`), `anti_regression_and_side_effects_guardrail.md` (Sección 4: guardrails de lectura acotada y edición quirúrgica) y `continuous_agent_evolution.md` (Sección 2.6: invariante de *3-Tier Progressive Disclosure* y anti-duplicación).
    * Sincronizados `AGENTS.md` (Sección 5), `.agents/README.md` (Sección 5) y `manifest.json` con hashes SHA-256 actualizados.

### 📐 Especificaciones Técnicas y Hoja de Ruta (Specs & Roadmap)
* **Especificación Técnica 13 y Hito 14 para Implementación por Gemini 3.8 Flash High (`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md` y `ROADMAP.md`):**
  * Creada la especificación ejecutable `13_SPEC` utilizando la telemetría del grafo de conocimiento AST (**Graphify AST** en `mcp-server/graphify-out/GRAPH_REPORT.md` e `inspect_blast_radius.py` sobre `fetchBlueprintBundle`, `auditSecurityStigOwasp`, `auditTestPyramidGaps`, `inspectAstBlastRadius` e `initOrAppendAgentsMd`) para implementar en `@sinfallas/mcp-qa-11x`:
    1. Modo *Metadata-Only* (`include_content: false`) y filtro quirúrgico `file_filter` en `fetch_blueprint_bundle` (~95% de ahorro de tokens en `ToolResult`).
    2. Agrupación compacta por regla (`compact_findings: true`, `max_findings_per_rule: 5`) en `audit_security_stig_owasp` (~80% de ahorro en auditorías STIG/OWASP).
    3. Presupuesto de salida (`max_items: 10`, `max_callers: 10`) y bandera `micro_change_eligible` en `audit_test_pyramid_gaps` e `inspect_ast_blast_radius`.
    4. Sincronización del bloque conector de 3 vías (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`) y las 6 estrategias *High-IQ Token Economy* en `mcp-server/src/cli/init-agents-md.ts`.
  * Añadido el **Hito 14** (`⏳ Pendiente | 0%`) en `ROADMAP.md` listo para su ejecución por **Gemini 3.8 Flash High**.

## [2.10.1] - 2026-11-05

### 🚀 Añadido y Mejorado (Added & Changed)
* **Invariante Anti-Mock de Timeouts de Transferencia Pesada (`>= 180s` + Purga de `0 bytes`) y Validación por Ítem en Respuestas Batch `HTTP 200 OK` (Regla #5 UAT Anti-Blindness):**
  * **Skill Maestra (`.agents/skills/qa-11x-architect/SKILL.md` y `references/01-core-13-layers.md`, `03-stack-python-fastapi.md`, `04-stack-node-vue-react.md`):** Incorporada la quinta invariante de diseño UAT Anti-Blindness en la sección **2.1** y en la **Ley 9**:
    1. *Separación de Timeouts de Telemetría vs. Transferencia Síncrona de Imagen/Firmware (`>= 180s` + Purga de Artefactos Truncados de `0 bytes`):* Erradica la ceguera provocada por `AsyncMock` (que resuelve en `0 ms` y oculta que timeouts cortos de `10s` abortan descargas reales de paquetes/firmware como `.npk` de ~21 MB dejando archivos corruptos de `0 bytes`), exigiendo override explícito de timeout por petición (`timeout >= 180s`), purga preventiva/reactiva de archivos de `0 bytes` y aserción explícita sobre `call_args` en las pruebas unitarias.
    2. *Prohibición de Éxito Ciego por `HTTP 200 OK` en Endpoints Batch (`POST .../execute`, `POST .../batch`):* Prohibido asumir éxito global por recibir un código envolvente `HTTP 200 OK`; los servicios, vistas UI y suites de pruebas deben inspeccionar el estado individual de cada recurso en `res.data.results[].status` (o `items[].status`) cubriendo éxito total, fallo parcial degradado y fallo total por ítem (`results[].status == 'FAILED'` o `'ERROR: bad HTTP response'`).
  * **Reglas Globales y Documentación (`.agents/rules/mandatory_qa_pyramid_and_doc_sync.md`, `ground_truth_fixtures_and_negative_invariants.md`, `frontend_parity_and_closure.md`, `AGENTS.md`, `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `README.md`, `TESTING.md` y `manifest.json`):** Sincronizada la quinta invariante y el caso `Fixture C (Degraded / Partial Batch Failure & Truncated Transfer)` en todas las capas de gobernanza y regenerado el manifiesto criptográfico SHA-256 (`blueprint_version: 2.10.1`).

### 📚 Documentación (Documentation)
* **Guía de Actualización del Servidor MCP en el IDE y Validación Criptográfica de Skills y Documentación (`README.md`, `docs/ai-integration.md`, `FAQ.md`):**
  * Añadida la subsección `Cómo Actualizar el Servidor MCP, las Skills y la Documentación en el IDE y cómo Validarlo` en `README.md`, la sección `6.5` en `docs/ai-integration.md` y la entrada correspondiente en `FAQ.md`, documentando el protocolo de 3 pasos para purgar las cachés locales (`~/.npm/_npx` y `~/.cache/qa-11x-blueprints`), reiniciar el proceso MCP `stdio` en el IDE (`Additional Options > MCP Servers` / `Developer: Reload Window`) y auditar mediante SHA-256 (`DISA STIG V-222513`) que tanto el paquete `@sinfallas/mcp-qa-11x` como los 20 archivos de las 5 Skills instaladas en `~/.gemini/config/skills` coincidan bit a bit con `manifest.json`.

## [2.10.0] - 2026-11-05

### 🚀 Añadido y Mejorado (Added & Changed)
* **Fast-Path Documental (`DOCS_ONLY` vs. `CODE_CHANGE`) y 5 Optimizaciones de Consumo de Tokens y Ventana de Contexto (Local y Servidor MCP `@sinfallas/mcp-qa-11x`):**
  * **Separación Estricta entre Fast-Path Documental (`DOCS_ONLY`) y Full-Path de Código (`CODE_CHANGE`):**
    * Codificada en `AGENTS.md`, `~/.gemini/GEMINI.md`, `.agents/rules/mandatory_qa_pyramid_and_doc_sync.md`, `.agents/rules/anti_regression_and_side_effects_guardrail.md`, `.agents/skills/qa-11x-architect/SKILL.md` y en el generador `buildConnectorBlock` (`mcp-server/src/cli/init-agents-md.ts`): cuando una tarea modifica únicamente documentación (`*.md`, `docs/**`, `CHANGELOG.md`, `README.md`, `ROADMAP.md`), **no se disparan suites de pruebas en contenedores Docker** (`run_ephemeral_qa`) **ni se reconstruye el grafo AST** (`./scripts/actualizar-grafos-graphify.sh`).
    * Implementada la función `isDocsOnlyWorkspaceChange` y la opción `skip_if_docs_only` (`skipIfDocsOnly`) en `mcp-server/src/tools/ephemeral-runner.ts` (`run_ephemeral_qa`) y `mcp-server/src/types.ts`, omitiendo levantar contenedores cuando `git status --porcelain` reporta solo archivos Markdown y retornando confirmación instantánea (`✔ [Fast-Path Docs-Only]`).
    * Actualizada la etapa `[10/10]` de `.agents/scripts/certify_task_completion.sh` para certificar explícitamente `✔ [Doc Fast-Path]` cuando solo cambiaron archivos `.md`.
  * **Extracción Incremental y Modo *Pass-Quiet* en `scripts/actualizar-grafos-graphify.sh`:**
    * Añadida la función `stack_needs_update` que verifica cambios de código por stack (`find -newer graph.json` y `git status --porcelain` excluyendo `*.md`), omitiendo los stacks cuyo código no cambió y reduciendo la salida exitosa a **1 sola línea de telemetría** (`✔ [Graphify AST] Actualizados: X (...) | Omitidos sin cambios de código: Y (...).`).
  * **Caché Criptográfica SHA-256 en `scripts/auditar-infra.sh`:**
    * Añadido cálculo de huella SHA-256 sobre `docker-compose*.yml`, `Dockerfile*`, `.trivy.yaml` y lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `uv.lock`, `composer.lock`) en `/tmp/.qa11x_trivy_cache_<hash>`, respondiendo en `0.01s` cuando la infraestructura no ha cambiado y purgándose con `scripts/limpieza.sh --deep`.
  * **Compactación del Bloque Conector (~35% menos tokens permanentes) y *Lazy Rule Loading* (`init-agents-md.ts` y `certify-gate.ts`):**
    * Compactado `buildConnectorBlock` en `mcp-server/src/cli/init-agents-md.ts` y `upstream_evolution_reminder` en `mcp-server/src/tools/certify-gate.ts`, reduciendo el costo fijo de contexto por turno en todos los proyectos conectados al MCP.
  * **Pruebas Unitarias y BDD Karate Labs (`mcp-server/tests/ephemeral-runner.unit.ts` y `mcp-server/test/mcp_cli_test.feature`):**
    * Añadidas pruebas unitarias para `isDocsOnlyWorkspaceChange` y `skipIfDocsOnly` (alcanzando **272 pruebas unitarias en Vitest** y **14 escenarios BDD en Karate Labs**).
* **Restauración de la Matriz de Herramientas de Pruebas en `README.md`, Actualización de Tags Oficiales de Docker Hub y Corrección Integral de Diagramas Mermaid:**
  * **Tags Oficiales de `sinfallas/base-python-uv`, `sinfallas/basephpcomposer` y `sinfallas/base-node-ionic`:** Actualizados en `README.md`, `CONTRIBUTING.md`, `RESOURCES.md`, `AI_MASTER_PROMPT.md`, `ROADMAP.md`, `TESTING.md`, `scripts/generar-manifiesto.py`, `python/*` (`README.md`, `pyproject.toml.example` con `requires-python = ">=3.11"`, `tox.ini.example`), `fastapi/*` (`README.md`, `pyproject.toml.example`, `tox.ini.example`), `php/*` (`README.md`, `composer.json.example` con `"php": ">=8.2"`, `php.ini.example`, `limpieza.sh`, `Makefile.example`, `docker-compose.qa.yml`, `test/api_test.feature`), `node-backend/README.md`, `vue3/README.md`, `react-frontend/README.md`, `docs/*`, `docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md` y `.agents/skills/qa-11x-architect/` reflejando que `sinfallas/base-python-uv` está disponible en **`3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`**, `sinfallas/basephpcomposer` en **`8.2`, `8.3`, `8.4`, `8.5` y `latest`** y `sinfallas/base-node-ionic` en **`22`, `24`, `26` y `latest`**.
  * **Restauración de `## 🛠 Matriz de Herramientas de Pruebas` (`README.md`):** Restaurada la tabla matricial histórica de 15 columnas donde cada fila representa un entorno (`Python`, `FastAPI`, `Node`, `Vue3`, `React`, `PHP 8.2–8.5`, `Bash` y `MCP Server`) y cada columna un tipo de prueba con las herramientas del stack actual 11X.
  * **Corrección de Sintaxis en Todos los Diagramas `mermaid` y Expresiones MathJax (`$...$`) del Repositorio:** Auditados y corregidos los 7 diagramas Mermaid en `README.md`, `SECURITY.md`, `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/ARCHITECTURE_C4.md` y `docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md` (eliminación de etiquetas HTML `<br>` y `<code>`, eliminación de `\n` literales, adición de identificadores alfanuméricos en `subgraph` y entrecomillado de etiquetas) y erradicados los bloques LaTeX `$...$` con `\text{starts\_at}` / `\le` / `\ge` que producían el error `'_' allowed only in math mode` y `&lt;`/`&gt;` en el renderizador MathJax de GitHub (`README.md`, `docs/*`, `ROADMAP.md`, `TESTING.md`, `CONTRIBUTING.md`, `AI_MASTER_PROMPT.md` y `.agents/`).
  * **Pruebas Unitarias y BDD Karate Labs (`tests/test_generar_manifiesto.unit.py`, `mcp-server/test/mcp_cli_test.feature`):** Añadida la prueba unitaria `test_readme_matrix_tags_and_mermaid_integrity` y el Escenario 13 de Karate Labs validando la presencia de la matriz de herramientas, los tags oficiales de Docker Hub y la ausencia de HTML roto en bloques Mermaid.
* **Reconciliación Automática, Deduplicación y Aislamiento de Reglas de Dominio en `.agents/` (`reconcile-agents` / `reconcile_agents_governance`) (Hito 13):**
  * **Tool 12 en Servidor MCP y Subcomando CLI (`reconcile_agents_governance` / `reconcile-agents`):**
    * Creado el módulo `mcp-server/src/cli/reconcile-agents.ts` con funciones modulares (`reconcileAgentsGovernance`, `runReconcileAgentsCli`, `isPromotedSection`, `splitMarkdownSections`, `ensureBackupFile`, `processNonCanonicalRuleFile`, `cleanPromotedDuplicatesInAgentsMd`, `reconcileRulesDir`, `persistExtractedDomainRules`).
    * Detección y filtrado determinista de huellas semánticas (`PROMOTED_INVARIANT_FINGERPRINTS`: anti-silo, ciclo temporal de 3 fases, auditoría semántica anti-UUID, refresco dual, etc.) para podar de forma segura directivas duplicadas que ya residen en la skill global `qa-11x-architect` y en las 7 reglas canónicas de `.agents/rules/`.
    * Extracción automática y no destructiva de reglas específicas de negocio (ej. MikroTik RouterOS v7, WinBox) hacia `.agents/rules/domain_<project>_rules.md`.
    * Preservación intacta de archivos de dominio con prefijo `domain_*.md` (`DOMAIN_PRESERVED`).
    * Respaldo preventivo atómico en `.agents/backups/<timestamp>/` previo a cualquier mutación en disco cuando `dry_run` es `false`.
    * Soporte de modo simulación `dry_run: true` (`--dry-run`) reportando diagnósticos sin tocar el sistema de archivos.
    * Registrada la Tool 12 (`reconcile_agents_governance`) en `mcp-server/src/server.ts` con su contrato Zod `ReconcileAgentsInputSchema`.
    * Expuesto el subcomando `reconcile-agents` en `mcp-server/src/index.ts` y documentado en la ayuda `--help`.
  * **Sincronización Ecosistémica y Post-Mortem Obligatorio de Escapes QA (`init-agents-md.ts`, `install-skill.ts`, `certify-gate.ts`):**
    * Implementada y exportada la función `syncGlobalGeminiMd(homeDir, dryRun)` en `mcp-server/src/cli/init-agents-md.ts`, permitiendo sincronizar quirúrgica y no destructivamente `~/.gemini/GEMINI.md` mediante el bloque conector `<!-- QA_11X_MCP_CONNECTOR_START -->`.
    * Actualizado `buildConnectorBlock` para incorporar la directiva obligatoria de Post-Mortem de Escapes QA (`MANDATORY QA-ESCAPE POST-MORTEM — Whenever you fix a UAT, integration, or production bug that escaped existing automated tests... you MUST PROACTIVELY include a section titled "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" and invoke propose_skill_evolution_pr`) y la sección **`4. Mandatory 11-Step Execution & Closure Workflow (Non-Negotiable)`** que codifica las 11 directrices operativas tanto para uso local como para quienes descargan el MCP (1. Planificación `/plan`, 2. Diario en `.agents/ACTIVE_TASK.md`, 3. Revisión pre-cambios del grafo AST y creación automática si no existe con `./scripts/actualizar-grafos-graphify.sh`, 4. Actualización de gobernanza, `limpieza.sh` y `.gitignore`, 5. Creación de todas las pruebas incluido Karate Labs BDD, 6. Ejecución de toda la suite en Docker efímero, 7. Actualización de documentación y `docs/specs/`, 8. Actualización de `CHANGELOG.md`, 9. Actualización de `ROADMAP.md` cuando corresponda, 10. Actualización del grafo AST al terminar, 11. Compuerta de certificación y subida a `git`).
    * Actualizado `mcp-server/src/cli/install-skill.ts`: incorpora la constante `AGENT_RULES_PREFIX` y `ACTIVE_TASK_EXAMPLE_PATH`, descarga e instala los 7 archivos canónicos `.agents/rules/*.md` y la plantilla `.agents/ACTIVE_TASK.md.example` (inicializando `.agents/ACTIVE_TASK.md` si no existe) cuando se usa `--include-scripts`, sincroniza automáticamente `~/.gemini/GEMINI.md` y soporta el flag `--reconcile` para depurar el espacio `.agents/` antes de escribir las reglas canónicas.
    * Actualizado `scripts/generar-manifiesto.py` incluyendo `"scripts/actualizar-grafos-graphify.sh"` en `COMMON_FILE_PATHS` (122 archivos indexados en `manifest.json`) y mejorado `scripts/actualizar-grafos-graphify.sh` para soportar todos los stacks (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `mcp-server`, `backend`, `frontend` o raíz `.`) invocando `sinfallas/remote-graphify:latest` de forma autónoma.
    * Mejorados `mcp-server/src/tools/blast-radius.ts` (`inspect_ast_blast_radius`) y `.agents/scripts/inspect_blast_radius.py`: añaden soporte `.php`, consultan `graphify-out/graph.json` en combinación con escaneo estático de fuentes, exponen `ast_graph_detected`, `ast_graph_files` y `ast_graph_action_required`, e instruyen explícitamente crear el grafo con `./scripts/actualizar-grafos-graphify.sh` si no existe y actualizarlo siempre al terminar los cambios.
    * Inyectada la propiedad `upstream_evolution_reminder` en `CertifyGateResult` y en la salida de `certify11xGate` (`mcp-server/src/tools/certify-gate.ts`), recordando al agente de IA la directiva innegociable de post-mortem.
  * **Saneamiento y Gobernanza del Repositorio (`scripts/limpieza.sh`, `.gitignore`):**
    * Actualizado `.gitignore` ignorando de forma global `.agents/backups/` y `**/.agents/backups/`.
    * Actualizado `scripts/limpieza.sh` para purgar respaldos temporales `.agents/backups/` durante `--deep` / `--docker-prune` y normalizar permisos UID:GID en `graphify-out`.
  * **Pruebas 11X Unitarias y BDD Karate Labs (`mcp-server/tests/` y `mcp-server/test/mcp_cli_test.feature`):**
    * Creada la suite `mcp-server/tests/reconcile-agents.unit.ts` (18 pruebas) cubriendo escenarios completos tipo `rosgrid`, extracción a archivos `domain_*.md`, preservación de archivos de dominio existentes, modo `dry_run`, `syncGlobalGeminiMd`, invocación CLI y reminder de compuerta.
    * Ampliadas `mcp-server/tests/tools-and-resources.unit.ts` y `mcp-server/tests/init-agents-md.unit.ts` para verificar la Tool 12, la detección/parseo de `graphify-out/graph.json` en `inspectAstBlastRadius`, la instalación de `.agents/ACTIVE_TASK.md.example` y el protocolo de 11 pasos en `buildConnectorBlock`.
    * Alcanzadas **270 pruebas unitarias pasando al 100%** con `99.27%` de cobertura de líneas y sentencias, `95.28%` de ramas y `100.00%` de funciones en contenedor efímero `sinfallas/base-node-ionic:26` con `0` advertencias de ESLint/SonarJS (`--max-warnings 0`).
    * Actualizado `mcp-server/test/mcp_cli_test.feature`: añadidos los Escenarios 11 y 12 para `reconcile_agents_governance`, el flujo de 11 directrices operativas y el ciclo de vida del grafo AST en `inspect_ast_blast_radius`.
* **Implementación de Auditores Automáticos para el Invariante Anti-Silo, Ciclo Temporal de 3 Fases, Auditoría Semántica Anti-UUID y Refresco Dual (Hito 12):**
  * **Auditoría Estática `SEC-11` y `UI-11X-02` (`mcp-server/src/tools/security-auditor.ts`):**
    * Incorporada la regla `SEC-11` (`checkSec11AuditSemanticIntegrity`, `APSC-DV-001350 / Anti-Silo Audit Rule 3`) que detecta asignaciones directas del claim `sub` de JWT (`claims.get("sub")`, `claims["sub"]`, `token.sub`, `payload.sub`) a `actor_username` en archivos de código (`.py`, `.ts`, `.js`, `.php`) y bloquea el uso de mocks ciegos (`AsyncMock`, `MagicMock`, `vi.fn()`) sobre `write_audit_log` / `writeAuditLog` en archivos de prueba sin aserciones sobre `call_args` / `assert_called` / `assert_awaited` / `toHaveBeenCalledWith`.
    * Incorporada la regla `UI-11X-02` (`checkUi11x02DualRefreshAndSemanticElse`, `Standard 11X / Anti-Silo UI Rule 3 & 4`) que detecta cláusulas `else` genéricas de dominio (`else return 'MAINTENANCE'` / `'MANTENIMIENTO'` / `'CAÍDA'`) y el uso de `setInterval()` en componentes `.vue`, `.tsx` y `.jsx` sin su correspondiente limpieza con `clearInterval()`.
  * **Evolución de Capas 07 y 13 en el Auditor de Pirámide 11X (`mcp-server/src/tools/test-pyramid-auditor.ts`):**
    * Implementadas `projectHasTemporalEntities` y `detectThreePhaseTemporalTests` dentro de `evaluateLayer13TrimodalFixtures`, verificando automáticamente que cuando el proyecto contiene entidades gobernadas por ventanas de tiempo (`starts_at`/`ends_at`, `safe_mode`, `maintenance_window`), las suites de pruebas validen las **3 fases del reloj** (`Programada`, `En Curso` y `Cancelada`/`Expirada`).
    * Implementada `checkOperationalViewsDualRefresh` dentro de `evaluateLayer07BddUiKarate`, verificando que las vistas operativas (`Dashboard`, `Noc`, `Wallboard`, `Monitor`, `Map`, `Console`) combinen auto-refresco (`setInterval` / `WebSocket`) con control manual explícito (`[ 🔄 Refrescar ]` / `refresh=true` / `handleRefresh`).
  * **Pruebas 11X Unitarias y BDD Karate Labs (`mcp-server/tests/` y `mcp-server/test/mcp_cli_test.feature`):**
    * Ampliadas `mcp-server/tests/security-auditor.unit.ts` (24 pruebas) y `mcp-server/tests/test-pyramid-auditor.unit.ts` (32 pruebas), alcanzando **251 pruebas unitarias pasando al 100%** con `99.24%` de cobertura de líneas y sentencias, `95.57%` de ramas y `100.00%` de funciones dentro del contenedor efímero `sinfallas/base-node-ionic:26` con `0` warnings de ESLint/SonarJS (`--max-warnings 0`).
    * Añadido el Escenario 10 en `mcp-server/test/mcp_cli_test.feature` validando los contratos del Hito 12.
* **Invariante Anti-Silo de Propagación Transversal de Estado, Ciclo Temporal de 3 Fases, Auditoría Semántica Anti-UUID y Refresco Dual (`qa-11x-architect` y `.agents/rules/`):**
  * **Skill Maestra (`.agents/skills/qa-11x-architect/SKILL.md` y `references/01-core-13-layers.md`, `03-stack-python-fastapi.md`, `04-stack-node-vue-react.md`):** Incorporada la sección normativa *2.1 Mandatory Anti-Silo & Cross-Module State Propagation Invariant (4 UAT Anti-Blindness Rules)* y actualizadas las Leyes 3, 4, 5, 7 y 9 junto con las Capas 05, 06, 07 y 13:
    1. *Propagación Transversal de Estado sin Mocks Intermedios (`Cross-Module State Propagation`):* Prohibición de validar mutaciones (`POST`/`PUT`/`PATCH`/`DELETE`) en un silo mientras los módulos consumidores se prueban con mocks manuales desconectados; exigencia de consultar inmediatamente los endpoints `GET` y stores consumidores sin mocks intermedios.
    2. *Aserción Obligatoria de las 3 Fases Temporales (`3-Phase Temporal Lifecycle Assertion`):* Exigencia de probar entidades con ventanas de tiempo o TTL (`starts_at`/`ends_at`, Safe Mode de 60s, tokens Step-Up de 30s, leases) en sus 3 fases del reloj: Fase 1 Pendiente (`t < starts_at`, `Programada`), Fase 2 Activa (`starts_at <= t <= ends_at`, `En Curso` / `Activa` con scheduler vivo) y Fase 3 Expirada/Revertida (`t > ends_at` o Cancelada).
    3. *Prohibición de Mocks Ciegos en Auditoría y Aserción Semántica Anti-UUID Crudo (`Audit Payload & Semantic Badge Integrity`):* Prohibición de usar `AsyncMock` vacío sobre `write_audit_log` sin verificar argumentos (`assert_called_once` / `call_args`), validación obligatoria de que `actor_username` y `resource_display_name` nunca sean UUIDs v4 crudos (`claims.get("sub")`) y prohibición de cláusulas `else` genéricas de dominio (`else return 'MAINTENANCE'`) en clasificadores de eventos UI.
    4. *Invariante de Refresco Dual en Vistas Operativas y Mapas en Vivo (`Dual Auto + Manual Refresh Invariant`):* Exigencia simultánea de actualización periódica/reactiva (`setInterval` con `clearInterval` en `onUnmounted` + WebSocket) y botón explícito **`[ 🔄 Refrescar ]`** (`?refresh=true`).
  * **Reglas Globales y Gobernanza (`.agents/rules/*.md`, `AGENTS.md`, `AI_MASTER_PROMPT.md`, `.agents/README.md`):** Sincronizadas `mandatory_qa_pyramid_and_doc_sync.md`, `ground_truth_fixtures_and_negative_invariants.md`, `secure_development_and_testing_guidelines.md`, `frontend_parity_and_closure.md` y `continuous_agent_evolution.md` (incluyendo la regla de aislamiento `domain_<project>_*.md` para evitar colisiones de reglas locales en proyectos consumidores como `rosgrid`).
  * **Plantillas BDD Karate Labs (`fastapi/test/api_test.feature`, `php/test/api_test.feature`, `vue3/test/ui_business_flow.feature`):** Añadidos escenarios BDD validando ausencia de UUIDs v4 crudos en campos de identidad/auditoría y control de refresco manual en vivo (`[ 🔄 Refrescar ]`).
  * **Especificaciones Técnicas y Hoja de Ruta para Gemini 3.8 Flash High (`docs/specs/11_SPEC_*`, `docs/specs/12_SPEC_*` y `ROADMAP.md`):**
    * Creada [`docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md) (Hito 12) especificando las reglas estáticas `SEC-11` y `UI-11X-02` en `security-auditor.ts` y los detectores de 3 fases temporales y refresco dual en `test-pyramid-auditor.ts`.
    * Creada [`docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md) (Hito 13) especificando la herramienta `reconcile_agents_governance` (`reconcile-agents`) para desduplicar automáticamente directivas promovidas y aislar reglas de negocio en `domain_<project>_rules.md` con respaldo en `.agents/backups/`.
    * Actualizados `ROADMAP.md` (Hitos 12 y 13), `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `README.md`, `TESTING.md` y `manifest.json`.

## [2.9.1] - 2026-11-03

### 🔄 Modificado y Mejorado (Changed & Fixed)
* **Optimización de Salida y Reducción de Consumo de Tokens (65%–85%) bajo el Patrón "Pass-Quiet / Fail-Verbose con Telemetría de 1 Línea":**
  * **Scripts Operativos (`scripts/*`) y Saneamiento (`limpieza.sh` en raíz y 7 stacks):** Añadido `--quiet` a los escaneos `trivy config` y `trivy fs` en `scripts/auditar-infra.sh` y `scripts/generar-sbom-cyclonedx.sh` (suprimiendo logs de descarga de DB y tablas vacías cuando hay 0 hallazgos, pero mostrando la tabla completa si existe alguna vulnerabilidad `HIGH`/`CRITICAL`). Añadido soporte `--quiet` (`-q`) y fusión de contenedores Alpine en `scripts/limpieza.sh` y los 7 `<stack>/limpieza.sh`. Compactada la salida de `scripts/verificar-secretos.sh`, `scripts/install-skill.sh`, `scripts/publicar-mcp.sh`, `scripts/actualizar-grafos-graphify.sh` (`docker pull -q`) y `scripts/generar-manifiesto.py`.
  * **Compuerta de Certificación (`.agents/scripts/certify_task_completion.sh`) y Validadores (`.agents/scripts/*.py`):** Compactada la salida en éxito de los 6 validadores (`verify_json_no_duplicate_keys.py`, `verify_zero_orphan_vue_components.py`, `verify_no_orphan_api_endpoints.py`, `verify_topological_health.py`, `verify_alembic_orm_parity.py`, `verify_roadmap_consistency.py`) e `inspect_blast_radius.py` a 1 línea telegráfica con métricas duras (conteos de archivos, rutas, nodos AST, tablas ORM) y volcado completo en caso de fallo (`exit 1`). En la etapa `[10/10]` de `certify_task_completion.sh`, se emite 1 línea de conteos cuando código, pruebas y documentación están sincronizados.
  * **Makefiles (`Makefile`, `mcp-server/Makefile` y 7 `Makefile.example`):** Prefijado `@` en recetas Docker para evitar eco duplicado de comandos multilínea, silenciados instaladores intermedios (`uv sync -q`, `pnpm install --silent`, `bandit -q`, `mvn -B`) y activado `--cov-report=term-missing:skip-covered -q --tb=short` en Pytest para omitir archivos con `100%` de cobertura conservando el `% TOTAL` y las líneas faltantes (`< 100%`).
  * **Servidor MCP (`@sinfallas/mcp-qa-11x`):** Serialización JSON compacta sin indentación (`JSON.stringify(result)`) en las 11 herramientas de `mcp-server/src/server.ts` y en `blueprint://manifest` (`mcp-server/src/resources/blueprint-resources.ts`), más salida agregada por lotes en `mcp-server/src/cli/install-skill.ts`.
* **Estandarización de `@latest`, `--init-agents` e `--include-scripts` en toda la Documentación de Instalación MCP:**
  * Actualizados todos los comandos de instalación `install-skill` en `README.md`, `FAQ.md`, `docs/ai-integration.md`, `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/specs/*`, `.agents/skills/qa-11x-architect/SKILL.md`, `mcp-server/README.md` y la salida `--help` de `mcp-server/src/index.ts` para incluir las opciones completas (`npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts` y `--target`), documentando detalladamente el propósito de cada flag.
  * Actualizados todos los comandos `npx` y bloques de configuración MCP (`args: ["-y", "@sinfallas/mcp-qa-11x@latest"]`) previniendo que `npx` reutilice versiones antiguas almacenadas en `~/.npm/_npx/`.
  * Añadida la ruta `~/.gemini/config/mcp_config.json` en `checkBrowserMcpInIde` (`mcp-server/src/tools/inspect-project.ts`) para detectar configuraciones MCP en Google Antigravity 2.0.

## [2.9.0] - 2026-11-03

### 🚀 Añadido (Added)
* **Ecosistema Canónico PHP 8.1–8.5 (`sinfallas/basephpcomposer`) e Integración en Servidor MCP (Hito 11):**
  * **Blueprint Canónico `php/` (10 Plantillas Nivel 11X):** Creado el stack canónico para PHP 8.1–8.5 con `php/README.md` (manual operativo en español), `php/docker-compose.qa.yml` (`sinfallas/basephpcomposer:8.5`, `postgres:17-alpine`, `eqalpha/keydb:alpine`, `sinfallas/karatelabs:latest`), `php/Makefile.example` (11 targets: `qa-lint`, `qa-unit`, `qa-parity`, `qa-contracts`, `qa-bdd`, `qa-mutation`, `qa-dast`, `qa-chaos`, `qa-sbom`, `qa-all`, `clean`), `php/composer.json.example` (Pest, PHPStan, Psalm, Infection, CycloneDX), `php/phpstan.neon.example` (level: max, cognitive_complexity: 9), `php/phpunit.xml.example` (driver PCOV, umbral 95.0%), `php/infection.json5.example` (minMsi: 80, minCoveredMsi: 80), `php/php.ini.example` (endurecimiento PHP 8, `expose_php=Off`, flags de sesión, OPcache con `save_comments=1`, PCOV), `php/limpieza.sh` (permisos 0755 y fallback Alpine) y `php/test/api_test.feature` (escenarios BDD en Karate Labs).
  * **Indexación en Manifiesto Criptográfico (`manifest.json`):** Actualizado `scripts/generar-manifiesto.py` registrando `"php"` en `STACK_METADATA` y clasificando `composer.json.example` con `merge_strategy: "surgical_merge"`. Sincronizado `manifest.json` con 121 archivos indexados y ampliada la suite `tests/test_generar_manifiesto.unit.py`.
  * **Extensión de Tipos y Detección en Servidor MCP (`@sinfallas/mcp-qa-11x`):** Añadido `'php'` a `StackNameSchema` y campos `phpstan_strict`, `infection_mutation` a `ProjectAuditResult.strict_flags` en `mcp-server/src/types.ts`. Implementada la función modular `inspectPhpStack` en `mcp-server/src/tools/inspect-project.ts` auditando `composer.json`, `phpstan.neon(.dist)`, `infection.json5(.dist)` y fuentes `.php`.
  * **Fusión Quirúrgica No Destructiva de `composer.json`:** Implementadas las funciones `mergeComposerJson` y `mergeJsonDictionarySection` en `mcp-server/src/services/surgical-merger.ts`, fusionando de manera aditiva `require-dev`, `scripts` y `config.allow-plugins` sin alterar dependencias ni configuraciones preexistentes del usuario, e integradas en `resolveSurgicalMerge`.
  * **Parsers Ahorradores de Tokens:** Enriquecido `mcp-server/src/parsers/output-parsers.ts` con `parsePhpCoverage` (cobertura PCOV/Pest/PHPUnit de líneas y total), `parsePsalmIssue` (análisis de taint y nivel de issue), `parsePhpstanIssue` (errores de tipado estricto y complejidad) y soporte de `Infection` en `parseMutation`.
  * **Auditoría de Seguridad Estática y Pirámide 11X:** Extendido `mcp-server/src/tools/security-auditor.ts` con reglas `SEC-03` (`unserialize` inseguro, ejecución arbitraria de comandos `shell_exec`/`passthru`/`system`), `SEC-04` (XXE con `loadXML`/`simplexml_load_string` sin `LIBXML_NONET`) y `SEC-05` (canonicalización `Normalizer::FORM_KC`). Extendido `mcp-server/src/tools/test-pyramid-auditor.ts` para evaluar las 13 capas de calidad, verificación de tipado PHPStan/Psalm y detección de archivos fuentes huérfanos sin pruebas unitarias (`src/**/*.php`).
  * **Pruebas 11X Unitarias y BDD Karate Labs:** Ampliadas las suites unitarias en TypeScript (`tests/inspect-project.unit.ts`, `tests/surgical-merger.unit.ts`, `tests/output-parsers.unit.ts`, `tests/security-auditor.unit.ts`, `tests/test-pyramid-auditor.unit.ts`), alcanzando 244 pruebas unitarias pasando al 100% con 99.22% de sentencias y líneas, 95.38% de ramas y 100% de funciones en contenedor efímero `sinfallas/base-node-ionic:26` con 0 advertencias de linter (`--max-warnings 0`), y añadido el Escenario 9 en `mcp-server/test/mcp_cli_test.feature`.
  * **Sincronización Documental y Certificación:** Actualizados `ROADMAP.md` (Hito 11 al 100%), `TESTING.md`, `README.md`, `docs/ai-integration.md`, `.agents/scripts/certify_task_completion.sh` y `.agents/ACTIVE_TASK.md`.
* **Diagnóstico Asistido de Navegador (Playwright / Browser MCP) y PRs de Evolución Continua Zero-Trust (`propose_skill_evolution_pr`) (Hito 10):**
  * **Evaluación de Disponibilidad de Navegador Real (`evaluateBrowserTestingReadiness`):** Añadida la interfaz `BrowserTestingReadiness` en `mcp-server/src/types.ts` e implementada la función modular en `mcp-server/src/tools/inspect-project.ts`. Detecta automáticamente en stacks frontend (`vue3`, `react-frontend`) si están instalados `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, especificaciones E2E (`e2e/*.e2e.ts`) y si el IDE del usuario (`~/.gemini/antigravity/mcp_config.json`, `~/.claude.json`, `.cursor/mcp.json`) tiene configurado un servidor MCP de navegador (`@playwright/mcp` / `chrome-devtools`), entregando recomendaciones e instrucciones automáticas.
  * **Tool 11: `propose_skill_evolution_pr` en Servidor MCP:** Implementado `mcp-server/src/tools/propose-evolution-pr.ts` y registrado con su esquema Zod `ProposeEvolutionPrInputSchema` en `mcp-server/src/server.ts`. Proporciona un mecanismo dual Zero-Trust para proponer mejoras federadas a `tecno-consultores/qa-testing-blueprints` sin tokens empaquetados:
    * *Opción 1 (`gh` CLI Local Autenticado):* Crea automáticamente la rama `evolution/<slug>` y abre el Pull Request si el CLI de GitHub está autenticado en la máquina del usuario (`execFile` con `shell: false`).
    * *Opción 2 (Fallback Universal Cero-Credenciales):* Genera el archivo local de propuesta en `<project_path>/.agents/proposals/<slug>.md` y construye una URL prellenada hacia `https://github.com/tecno-consultores/qa-testing-blueprints/issues/new` lista para abrir con 1 clic.
  * **Playbook 7 en Skill Maestra (`qa-11x-architect`):** Incorporado el *Playbook 7: Continuous Skill Evolution & Upstream PR Proposal* en `.agents/skills/qa-11x-architect/SKILL.md` y vinculada la verificación de `browser_testing_readiness` en Playbooks 1 y 2.
  * **Pruebas 11X Unitarias y BDD Karate Labs:** Creada la suite unitaria dedicada `mcp-server/tests/propose-evolution-pr.unit.ts` (12 pruebas), ampliada `tests/inspect-project.unit.ts` (12 pruebas) y `tests/tools-and-resources.unit.ts` (37 pruebas), alcanzando 228 pruebas unitarias pasando al 100% con 99.28% de líneas y 95.39% de ramas en contenedor efímero `sinfallas/base-node-ionic:26`, con 0 advertencias de linter (`--max-warnings 0`), y actualizado el contrato BDD en `mcp-server/test/mcp_cli_test.feature` (8 escenarios).
  * **Sincronización Documental y Criptográfica:** Actualizados `ROADMAP.md` (Hito 10 al 100%), `TESTING.md`, `README.md`, `docs/ai-integration.md` y regenerado `manifest.json`.
* **Inyector Aditivo No Destructivo del Conector `AGENTS.md` (`init-agents` / `init_or_append_agents_md`) (Hito 9):**
  * **Módulo Conector Aditivo (`mcp-server/src/cli/init-agents-md.ts`):** Implementadas las funciones `buildConnectorBlock`, `mergeOrAppendAgentsMdContent`, `initOrAppendAgentsMd`, `parseInitAgentsArgs` y `runInitAgentsCli`. Permite crear `AGENTS.md` desde cero cuando no existe, o agregar de forma aditiva y 100% no destructiva el bloque conector canónico de QA 11X (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`) al final del archivo existente, preservando el 100% de las instrucciones y encabezados previos del usuario con actualización idempotente.
  * **Integración Quirúrgica en `SurgicalMerger`:** Añadido método público `mergeAgentsMd()` en `mcp-server/src/services/surgical-merger.ts` y conectado en `resolveSurgicalMerge` para casos donde `base === 'AGENTS.md'`.
  * **Subcomando CLI e Integración en `install-skill`:** Expuesto el subcomando `npx -y @sinfallas/mcp-qa-11x init-agents [--project-path <ruta>] [--dry-run]` en `mcp-server/src/index.ts` y añadido el flag `--init-agents` en `mcp-server/src/cli/install-skill.ts`.
  * **Registro de Tool 10 en Servidor MCP:** Registrada la herramienta `init_or_append_agents_md` con su esquema Zod `InitAgentsMdInputSchema` en `mcp-server/src/server.ts` y documentada en `.agents/skills/qa-11x-architect/SKILL.md`.
  * **Pruebas 11X Unitarias y BDD Karate Labs:** Creada la suite `mcp-server/tests/init-agents-md.unit.ts` (15 pruebas unitarias), ampliadas `tests/surgical-merger.unit.ts` (18 pruebas) y `tests/tools-and-resources.unit.ts` (37 pruebas), alcanzando 211 pruebas unitarias pasando al 100% con 99.23% de líneas y 95.26% de ramas en contenedor efímero `sinfallas/base-node-ionic:26`, y actualizado el contrato BDD en `mcp-server/test/mcp_cli_test.feature` (7 escenarios).
  * **Sincronización Documental y Manifiesto:** Actualizados `README.md`, `TESTING.md`, `docs/ai-integration.md`, `ROADMAP.md` y regenerado `manifest.json`.
* **Autodetección Inteligente de Agentes, Catálogo Completo de 5 Skills, `--include-scripts` y Resiliencia CDN (Hito 8):**
  * **Autodetección Multi-Agente por Defecto (`auto`):** Actualizado `mcp-server/src/cli/install-skill.ts` y sincronizado `scripts/install-skill.sh` para usar `auto` como destino por defecto, detectando automáticamente la presencia de agentes globales soportados (`~/.gemini/config/skills`, `~/.claude/skills`, `~/.hermes/skills`, `~/.cursor/skills`) y directorios de proyecto (`.git`, `AGENTS.md`, `ROADMAP.md`, `package.json`, `pyproject.toml`) sin contaminar `$HOME/.agents/skills` si se invoca desde la carpeta personal del usuario.
  * **Instalación del Catálogo Completo (5 Skills):** Eliminado el filtro restrictivo de 2 skills, pasando a instalar las 5 skills indexadas en `manifest.json` (`qa-11x-architect`, `refactoring-ui`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator` y `qa-11x-docker-certifier`).
  * **Soporte `--include-scripts`:** Añadido soporte en `install-skill` para descargar y escribir en el espacio de trabajo local todos los scripts operativos (`manifest.common_files` y `.agents/scripts/*`), asignando permisos de ejecución `0o755` a archivos `.sh` y `.py`.
  * **Resiliencia de Propagación CDN en `scripts/publicar-mcp.sh`:** Reemplazada la verificación inmediata `npm view` por un bucle de reintento (`VERIFY_ATTEMPTS=6`, `VERIFY_DELAY=5`) con tolerancia a consistencia eventual y aviso no fatal ante retardos en el CDN global de npmjs, asegurando la ejecución incondicional del script de saneamiento `scripts/limpieza.sh`.
  * **Pruebas 11X Unitarias y BDD:** Ampliadas las suites en TypeScript (`mcp-server/tests/tools-and-resources.unit.ts`) alcanzando 192 pruebas con >= 95.19% de cobertura de ramas y 99.2% de líneas en contenedor efímero `sinfallas/base-node-ionic:26`, pruebas unitarias en Python (`tests/test_install_skill.unit.py`, `tests/test_publicar_mcp.unit.py`) y escenario BDD Karate Labs en `mcp-server/test/mcp_cli_test.feature`.
* **Auditor de Brechas de la Pirámide de Pruebas 11X (`audit_test_pyramid_gaps`) y Playbook de Rescate (Hito 7):**
  * Implementada la Tool 9 en `mcp-server/src/tools/test-pyramid-auditor.ts` y registrada con su esquema Zod `AuditTestPyramidInputSchema` en `mcp-server/src/server.ts`, permitiendo a agentes de IA y desarrolladores auditar proyectos existentes (*Brownfield*) frente a las 13 capas de la pirámide de calidad 11X (`L01` a `L13`) con estados `COVERED`, `PARTIAL`, `MISSING` y `NOT_APPLICABLE`.
  * Incorporado el inventario exhaustivo de brechas: detector de archivos fuente huérfanos sin pruebas unitarias (`orphan_source_files`), detector de endpoints API sin contrato BDD Karate Labs (`untested_api_endpoints`), y detector de vistas/páginas UI sin escenario BDD ni prueba E2E (`untested_ui_views`).
  * Implementado el generador de plan de rescate priorizado (`prioritized_action_plan`) con acciones categorizadas en `CRITICAL`, `HIGH` y `MEDIUM`, incluyendo targets de ejecución `make qa-*` y rutas de plantillas recomendadas (`recommended_blueprint_files`).
  * Incorporado el **Playbook 6 (Existing Project Test Gap Audit & 13-Layer Rescue)** en `.agents/skills/qa-11x-architect/SKILL.md` con flujo paso a paso de diagnóstico, estabilización y certificación progresiva.
  * Creada la suite de pruebas unitarias `mcp-server/tests/test-pyramid-auditor.unit.ts` cubriendo los escenarios trimodales (virgen 0%, brownfield parcial y nominal 100%), alcanzando 190 pruebas unitarias con >= 95.18% de cobertura de ramas y 99.18% de líneas en contenedor efímero `sinfallas/base-node-ionic:26`.
  * Actualizado el contrato BDD de Karate Labs en `mcp-server/test/mcp_cli_test.feature` validando las 9 herramientas MCP.
  * Regenerado el manifiesto criptográfico SHA-256 (`manifest.json`) con 111 archivos indexados.

---

## [2.8.3] - 2026-11-02

### 🐛 Corregido y Mejorado (Fixed & Changed)
* **Soporte Interactivo 2FA / WebAuthn y `--otp` en Publicación a npmjs (`scripts/publicar-mcp.sh`):**
  * Incorporada detección automática de TTY interactivo (`-it`) junto con `--no-browser` al invocar `npm publish` dentro del contenedor efímero, permitiendo que el módulo `otplease` / `webAuthOpener` de npm espere en vivo mientras el usuario autoriza la publicación en su navegador (`https://www.npmjs.com/auth/cli/...`) sin abortar prematuramente con `npm error code EOTP`.
  * Añadido soporte para el flag `--otp <código>` (`--otp=123456`) y la variable `NPM_OTP` en `.env`, además de documentar en `.env.example` y `docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md` la activación de `[x] Bypass two-factor authentication (2FA)` en Granular Access Tokens para publicaciones 100% desatendidas.
  * Ampliada la suite de pruebas unitarias `tests/test_publicar_mcp.unit.py` validando la opción `--otp`.
* **Normalización Canónica de `bin` en `mcp-server/package.json`:**
  * Normalizada la ruta del binario `bin["mcp-qa-11x"]` de `"./dist/index.js"` a `"dist/index.js"`, eliminando la advertencia de normalización de `@npmcli/package-json` (`npm warn publish "bin[mcp-qa-11x]" script name dist/index.js was invalid and removed`) durante `npm publish`, y sincronizando el contrato BDD en `mcp-server/test/mcp_cli_test.feature`.

---

## [2.8.2] - 2026-11-02

### 🚀 Añadido y Mejorado (Added & Changed)
* **Propagación del Blindaje Inflexible al Ecosistema de Stacks (`--max-warnings 0`):**
  * Estandarización obligatoria del flag `--max-warnings 0` en las plantillas oficiales de stacks `vue3/package.json.example` y `node-backend/package.json.example`, alineándolas con `react-frontend` y `mcp-server`.
* **Inyección Inteligente en Servidor MCP (`bootstrap_or_merge_11x`):**
  * Actualizado el fusionador quirúrgico `mcp-server/src/services/surgical-merger.ts` para detectar automáticamente scripts de `"lint"` con `eslint` en proyectos existentes e inyectar de manera proactiva `--max-warnings 0`.
  * Incorporada suite de pruebas unitarias en `mcp-server/tests/surgical-merger.unit.ts` certificando la inyección no destructiva de `--max-warnings 0` (161 pruebas unitarias aprobadas al 100% con 99.2% de cobertura).
* **Gobernanza de Agentes y Skill Maestra (`qa-11x-architect`):**
  * Actualización de la Ley 2 (Invariante de Cero Warnings con `--max-warnings 0`) y Ley 3 (Aislamiento Hermético de Red) en `.agents/skills/qa-11x-architect/SKILL.md`.
  * Actualización de las referencias operativas `references/01-core-13-layers.md` y `references/04-stack-node-vue-react.md` con las directivas técnicas de intercepción de red y linters inflexibles.
  * Formalización de los principios 7 (Linter Inflexibility) y 8 (Hermetic Test Isolation) en la directiva suprema `.agents/rules/mandatory_qa_pyramid_and_doc_sync.md`.

---

## [2.8.1] - 2026-11-02

### 🐛 Corregido (Fixed)
* **Blindaje Inflexible del Linter en Servidor MCP:** Incorporación del flag estricto `--max-warnings 0` en el script `"lint"` de `mcp-server/package.json` para forzar fallo inmediato ante cualquier advertencia de ESLint o SonarJS.
* **Erradicación Total de Advertencias en Servidor MCP:** Deduplicación de constantes literales en `mcp-server/src/resources/blueprint-resources.ts` (`MIME_MARKDOWN`) y simplificación de la recolección de archivos en `mcp-server/src/tools/inspect-project.ts`, alcanzando **0 errores y 0 warnings** en el análisis estático.
* **Aislamiento Hermético de Pruebas Unitarias contra Fugas de Red:** Corrección de la prueba de fallback en `mcp-server/tests/edge-cases.unit.ts`, interceptando `globalThis.fetch` para simular condiciones offline de forma determinista y neutralizar dependencias externas en tiempo de ejecución de pruebas unitarias.
* **Alineación de Reglas ESLint para Pruebas:** Configuración de `overrides` en `mcp-server/.eslintrc.json` para permitir la repetición de cadenas en asertos y esquemas de prueba sin comprometer la rigurosidad máxima en el código productivo (`src/`).

---

## [2.8.0] - 2026-11-02

### 🚀 Añadido (Added)
* **Armonización Documental Integral Híbrida (Humanos + Agentes IA + MCP + Skills):**
  * **Ecosistema Dual-Consumer en `README.md`:** Reestructuración de la sección de adopción en 3 modos claros y complementarios: Modo 1 (Agentes de IA autónomos vía `@sinfallas/mcp-qa-11x` con 8 tools y 8 resources stdio), Modo 2 (Inyección de Skills Zero-Clone en 1 segundo con `qa-11x-architect` y `refactoring-ui`), y Modo 3 (Adopción en repositorio para desarrolladores humanos e ingenieros DevOps con Makefiles y Docker efímero). Incorporación de diagrama Mermaid ilustrando los flujos bidireccionales.
  * **Preguntas Frecuentes Híbridas en `FAQ.md`:** Nueva sección sobre Agentes de IA, protocolo MCP y Skills Zero-Clone, detallando el modelo de Pair Programming Híbrido, la soberanía de tokens sin runners externos y la erradicación del uso de `sudo` en saneamiento mediante el contenedor efímero Alpine.
  * **Pautas de Contribución Híbrida en `CONTRIBUTING.md`:** Formalización del ciclo obligatorio para Agentes de IA contribuyentes (lectura de directivas, bitácora `.agents/ACTIVE_TASK.md`, inspección AST previa, pirámide 11X completa y compuerta universal de 10 etapas). Actualización de la compuerta de certificación de 7 a 10 etapas corporativas.
  * **Sincronización de `AI_MASTER_PROMPT.md`:** Actualización del protocolo de integración en dos vías (vía servidor MCP con herramientas automáticas `bootstrap_or_merge_11x`, `fetch_blueprint_bundle`, o vía blueprint manual) y sincronización de las 10 etapas de la compuerta de cierre.
  * **Ampliación de `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`:** Inclusión de la tabla de compatibilidad multi-agente MCP, arquitectura del servidor canónico con sus 8 tools y 8 resources, modelo de colaboración híbrida Humano-IA y las 10 etapas de la compuerta de cierre.
  * **Diagramas C4 Híbridos en `docs/ARCHITECTURE_C4.md`:** Actualización de los diagramas de Nivel 1 (Contexto) y Nivel 2 (Contenedores) integrando al Desarrollador Humano, los Agentes de IA (Antigravity, Claude, Cursor, Hermes), el Servidor MCP `@sinfallas/mcp-qa-11x` (stdio) y las Skills Zero-Clone.
  * **Alineación de `docs/ci-cd-pipelines.md`:** Inclusión de la perspectiva de Shift-Left Extremo operado localmente por Agentes de IA bajo la Regla Cero y formalización de la plantilla de GitHub Actions como referencia para proyectos adoptantes.
  * **Catálogo de Recursos en `RESOURCES.md`:** Adición del ecosistema oficial de MCP, Skills de IA y plataformas de agentes.
  * **Gobernanza de Seguridad en `SECURITY.md`:** Inclusión de la sección 4.10 cubriendo el principio de mínimo privilegio en tools MCP, verificación criptográfica SHA-256 en descargas Zero-Clone y publicación soberana sin runners de CI/CD de terceros.
* **Hito 6 — Pruebas 11X (>= 95%), Empaquetado npm (npx) y Publicación Autónoma Soberana:**
  * **Suite de Pruebas Unitarias 11X al 100% (`mcp-server/tests/*.unit.ts`):** 159 pruebas unitarias aprobadas al 100% en contenedor efímero `sinfallas/base-node-ionic:26`, superando el estándar corporativo 11X en todas las dimensiones: **99.20% en sentencias, 95.19% en ramas, 100.00% en funciones y 99.20% en líneas**, con umbrales estrictos elevados al 95% en `mcp-server/vitest.config.ts`.
  * **Escenarios BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`):** 5 escenarios BDD exhaustivos validando metadatos del paquete npm (`@sinfallas/mcp-qa-11x`), contratos criptográficos del manifiesto SHA-256 (`manifest.json`), contratos de esquema JSON para las 8 Herramientas MCP, contratos de URIs y tipos MIME para los 8 Recursos MCP (`blueprint://*`), y contratos de respuesta de ejecución `{ content: [{ type: "text", text: ... }] }`.
  * **Empaquetado Limpio y Verificación Dry-Run (`npm pack --dry-run`):** Auditoría estricta del tarball oficial resultando en un paquete ultraligero de 48.9 kB comprimido (233.1 kB desempaquetado) conteniendo exclusivamente archivos compilados `dist/**/*`, `README.md` y `package.json`, certificando 0 fugas de código fuente, secretos o residuos de pruebas.
  * **Publicación Autónoma sin Runners Externos (`scripts/publicar-mcp.sh` & `Makefile` — Modelo RoSGrid):** Flujo soberano de publicación 100% local en Docker efímero con credenciales en `.env` en la raíz (mediante `NPM_TOKEN`), con validación previa de lint, typecheck, tests >= 95% y empaquetado (`./scripts/publicar-mcp.sh --dry-run` y `make publish-mcp-dry`), garantizando publicación protegida sin exponer secretos a infraestructura de terceros.
  * **Sincronización Documental y Guías de Integración:** Actualización de `README.md` con instrucciones de 1 comando (`npx -y @sinfallas/mcp-qa-11x` y `npx -y @sinfallas/mcp-qa-11x install-skill`), enriquecimiento de `docs/ai-integration.md` con configuraciones MCP para Claude, Antigravity, Cursor y Hermes, y actualización del cuadro de mando `TESTING.md`.

### 🗑️ Eliminado (Removed)
* **Directorio `.github/` y Dependencias de CI/CD Externo:** Eliminación completa del directorio `.github/` y de cualquier workflow remoto de CI/CD (GitHub Actions) en favor de la arquitectura de publicación autónoma y soberana en Docker efímero (`scripts/publicar-mcp.sh` y `Makefile`), mitigando la exposición de credenciales (`NPM_TOKEN`) en plataformas de terceros y garantizando reproducibilidad determinista local.

### 🚀 Añadido (Added)
* **Identidad Visual y Cabecera de Documentación (`README.md`):**
  * **Integración del Logotipo Oficial (`assets/qa-logo.jpeg`):** Incorporación del logo oficial de QA Testing Blueprints en la cabecera principal de `README.md`, centrado con diseño responsive y bordes suavizados.
  * **Actualización de Capacidades MCP:** Sincronización de la tabla de ecosistemas en `README.md` reflejando las 8 herramientas y 8 recursos del servidor `@sinfallas/mcp-qa-11x`.
* **Hito 5 — Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Compuerta 11X (Tools 5–7 en `@sinfallas/mcp-qa-11x`):**
  * **Parsers Ahorradores de Tokens (`mcp-server/src/parsers/output-parsers.ts`):** Módulo optimizador de ventana de contexto que procesa salidas masivas de consola (stdout y stderr) de Docker y herramientas de QA, transformándolas en un JSON estructurado de menos de 40 líneas. Incorpora parsers de cobertura deterministas (`pytest-cov`, `vitest v8`, `kcov`) con cálculo automático del umbral (>= 95.0%) y detalle de líneas faltantes por archivo; parser de pruebas fallidas para Pytest, Vitest y BATS-core; parser de complejidad y linters para Radon (grados C a F), Mypy, Ruff, ESLint y ShellCheck (bloques multi-línea y formato GCC); parser de alertas de seguridad para Trivy y Bandit; parser de mutación para Mutmut y Stryker; y extractor `tail_log` de las últimas 15 líneas limpias sin secuencias de escape ANSI (`stripAnsi`).
  * **Tool 5: `audit_security_stig_owasp` (`mcp-server/src/tools/security-auditor.ts`):** Auditoría estática integral de seguridad que evalúa el código fuente del proyecto destino frente a los 22 patrones DISA ASD STIG V6R5 y OWASP Developer Guide v4.2 mediante 10 reglas deterministas (`SEC-01` a `SEC-10`) y la regla visual `UI-11X-01`:
    * `SEC-01`: Mass Assignment en esquemas Pydantic (`*Request`, `*Create`, `*Update`, `*In`) sin `extra='forbid'` (`HIGH`).
    * `SEC-02`: Anti-CSWSH en decoradores `@*.websocket` sin validación de `origin` ni código de cierre `4403` (`HIGH`).
    * `SEC-03`: Inyección de comandos y deserialización insegura (`shell=True`, `os.system`, `pickle.loads`, `yaml.load` sin SafeLoader, `eval`) (`CRITICAL`).
    * `SEC-04`: XML External Entity (XXE) sin `resolve_entities=False` ni `defusedxml` (`HIGH`).
    * `SEC-05`: Ausencia de canonicalización Unicode NFKC en validadores de entrada de texto (`MEDIUM`).
    * `SEC-06`: Inyección HTML dinámica (`v-html`, `innerHTML`, `dangerouslySetInnerHTML`) sin `escapeHtml` o `DOMPurify` (`HIGH`).
    * `SEC-07`: Swagger/OpenAPI de FastAPI expuesto sin desactivación condicional en producción (`MEDIUM`).
    * `SEC-08`: Ausencia de cabeceras de seguridad OSHP (HSTS, CSP, X-Content-Type-Options) en aplicaciones web (`MEDIUM`).
    * `SEC-09`: Proyecto Node.js sin archivo `.npmrc` con directiva estricta `ignore-scripts=true` (`HIGH`).
    * `SEC-10`: Detección de claves privadas, tokens de GitHub o contraseñas hardcodeadas en texto plano (`CRITICAL`).
    * `UI-11X-01`: Violaciones de ergonomía visual Anti-JSDOM (footer fixed, `outline-none` sin `focus-visible`, texto blanco translúcido con bajo contraste) (`MEDIUM`).
  * **Tool 6: `run_ephemeral_qa` (`mcp-server/src/tools/ephemeral-runner.ts`):** Ejecutor seguro y aislado en Docker efímero bajo la Regla Cero que invoca targets `qa-${stage}` del `Makefile` mediante `execFile` con `shell: false` (inmune a inyección de comandos según `DISA APSC-DV-002510`), con control de timeout (código 124) y condensación de salida a través de `output-parsers.ts`.
  * **Tool 7: `certify_11x_gate` (`mcp-server/src/tools/certify-gate.ts`):** Compuerta unificada de certificación previa a commit/push que audita 8 verificaciones secuenciales: cero archivos `.example` sueltos, secret scanning, integridad JSON contra duplicados, cero componentes UI huérfanos sin `.unit.ts`, cero endpoints API huérfanos, paridad ORM vs Alembic, auditoría estática DISA/OWASP (0 CRITICAL / 0 HIGH) y sincronización documental (`TESTING.md` y `CHANGELOG.md`).
  * **Registro en el Servidor MCP (`mcp-server/src/server.ts` & `src/types.ts`):** Exposición de las herramientas `audit_security_stig_owasp`, `run_ephemeral_qa` y `certify_11x_gate` con esquemas de validación Zod y tipos TypeScript estrictos.
  * **Certificación de Pruebas Unitarias al 100% (`mcp-server/tests/`):** 126 pruebas unitarias pasando al 100% en contenedor efímero `sinfallas/base-node-ionic:26`, alcanzando **97.79% en sentencias y líneas, 91.23% en ramas y 99.1% en funciones**, con 0 errores de ESLint, SonarJS (Complejidad Cognitiva Grado A <= 15) y TypeScript (`tsc --noEmit`).
* **Publicador Autónomo del Servidor MCP a npmjs sin Runners Externos (`scripts/publicar-mcp.sh` — Modelo RoSGrid):**
  * **Script de Publicación Local Canónico (`scripts/publicar-mcp.sh`):** Implementación de la arquitectura de publicación autónoma de RoSGrid que no depende de runners externos de CI/CD (GitHub Actions), leyendo de forma segura las credenciales de npm desde `.env` en la raíz (mediante `NPM_TOKEN`), con soporte de validación de formato, comprobación de no-root en host, flags `--dry-run`, `--skip-tests` y `--help`.
  * **Pipeline de Validación 11X en Docker Efímero:** Ejecución secuencial en contenedor efímero `sinfallas/base-node-ionic:26`: saneamiento previo con `scripts/limpieza.sh`, linter ESLint/SonarJS (`pnpm run lint`), verificación de tipos (`pnpm run typecheck`), pruebas unitarias con cobertura >= 95% (`pnpm run test:unit`), compilación TypeScript a `dist/` (`pnpm run build`), auditoría de empaquetado (`npm pack --dry-run`), y verificación de colisión de versión contra `https://registry.npmjs.org/`.
  * **Publicación Efímera en Memoria:** Inyección del token efímero `NPM_TOKEN` exclusivamente en memoria del contenedor efímero mediante `npm config set //registry.npmjs.org/:_authToken` y `npm publish --access public`, destruyéndose de inmediato sin persistir credenciales en disco.
  * **Plantilla de Entorno (`.env.example`):** Archivo de configuración modelo en la raíz con variables documentadas (`NPM_TOKEN`, `NPM_REGISTRY`), protegido estrictamente por `.gitignore` y auditado por `scripts/verificar-secretos.sh`.
  * **Metas en `Makefile`:** Incorporación de `make publish-mcp` (publicación en vivo) y `make publish-mcp-dry` (simulación completa de validación y empaquetado).
  * **Suite de Pruebas Unitarias (`tests/test_publicar_mcp.unit.py`):** 5 pruebas unitarias aprobadas al 100% validando flag `--help`, rechazo de argumentos inválidos, rechazo de token ausente o con valor de plantilla, y detección de archivos `package.json` ausentes.
  * **Actualización de Especificación (`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`):** Formalización del flujo autónomo local sin runners externos como método canónico primario.
* **Validador de Consistencia Bidireccional de `ROADMAP.md` y `ACTIVE_TASK.md` (`.agents/scripts/verify_roadmap_consistency.py`):**
  * **Validador Estático Determinista (`.agents/scripts/verify_roadmap_consistency.py`):** Script de auditoría sin dependencias externas que analiza la coherencia matemática y de estado entre la tabla de resumen superior de `ROADMAP.md` y las tareas granulares (`- [x]` / `- [ ]`) de las secciones de hitos. Detecta de forma estricta discrepancias donde un hito con 100% de tareas completadas figure erróneamente como `⏳ Pendiente | 0%` (o viceversa), validando además que los iconos de encabezado (`## ✅`, `## ⏳`, `## 🚧`) reflejen el estado real del hito.
  * **Auditoría de Bitácora Operativa (`.agents/ACTIVE_TASK.md`):** Valida la presencia del campo obligatorio `**Estado:**`, asegurando que ninguna tarea declarada como `COMPLETED (100%)` contenga casillas pendientes `- [ ]` sin marcar, y que tareas `IN_PROGRESS` cuenten con fases y desglose estructurado.
  * **Suite de Pruebas Unitarias (`tests/test_verify_roadmap_consistency.unit.py`):** 13 pruebas unitarias aprobadas al 100% en Docker efímero validando parseo de tablas de hitos simples y decimales, cálculo de porcentajes, detección de asimetrías de estado, validación de tareas activas y ejecución CLI.
  * **Integración en Compuerta de Cierre (`.agents/scripts/certify_task_completion.sh`):** Incorporada como compuerta 9 de 10 (`[9/10] Verificando consistencia interna de ROADMAP.md y ACTIVE_TASK.md...`), impidiendo que cualquier agente de IA o desarrollador concluya una tarea con hojas de ruta desalineadas.
  * **Recurso Canónico en Servidor MCP (`@sinfallas/mcp-qa-11x`):** Exposición del recurso `blueprint://core/roadmap-validator` en `mcp-server/src/resources/blueprint-resources.ts` y `server.ts`, respaldado por 72 pruebas unitarias con **97.76% de cobertura de código**.
  * **Universalización de `scripts/auditar-infra.sh` y Paridad de Modelos ORM (`verify_alembic_orm_parity.py`):** Consolidación de `scripts/auditar-infra.sh` (Trivy IaC en contenedor efímero de solo lectura `:ro`), actualización del `Makefile` raíz (`make audit` -> `@./scripts/auditar-infra.sh`), y soporte multiformato en `verify_alembic_orm_parity.py` detectando estructuras modulares (`models/`) o archivos únicos (`models.py`) tanto en `fastapi/` como en `backend/` y `alembic/versions` o `migrations/versions`.
* **Estandarización Universal del Script de Limpieza y Saneamiento (`scripts/limpieza.sh`), Servidor MCP y Skill Maestra:**
  * **Script Universal Canónico (`scripts/limpieza.sh`):** Consolidación unificada de la lógica completa de saneamiento exclusivamente en `scripts/limpieza.sh` (siguiendo el estándar de RoSGrid y eliminando copias redundantes en la raíz). Incorpora fallback efímero Alpine (`docker run --rm -v "${PWD}:/workspace" alpine ...`) para erradicar archivos y cachés creados por Docker con privilegios `root` (UID 0: `.coverage`, `.pnpm-store`, `.pytest_cache`, `.ruff_cache`, `.mypy_cache`, etc.) sin requerir `sudo`, normalizando automáticamente la titularidad de archivos al usuario del host (`$(id -u):$(id -g)`), evitando candados en Nautilus y preservando los grafos semánticos AST (`GRAPH_REPORT.md`, `graph.html`, `graph.json`).
  * **Modernización de `limpieza.sh` en todas las plantillas de Stacks (`fastapi/`, `vue3/`, `react-frontend/`, `node-backend/`, `python/`, `bash-scripts/`):** Adopción unificada del patrón de fallback Alpine sin `sudo`, normalización de permisos, apagado de contenedores efímeros (`--remove-orphans -v`) y soporte de poda profunda opcional (`--deep` / `--docker-prune`).
  * **Estandarización de `Makefile` y `Makefile.example`:** Creación de `Makefile` en la raíz del repositorio con metas canónicas (`help`, `clean`, `qa-clean`, `audit`, `lint`, `test`, `build`, `certify`) y sincronización de las metas `clean` y `qa-clean` invocando `@./scripts/limpieza.sh` en la raíz y `./limpieza.sh` en cada stack.
  * **Recurso y Herramienta en el Servidor MCP (`@sinfallas/mcp-qa-11x`):**
    * Exposición del recurso canónico `blueprint://core/cleanup-script` en `mcp-server/src/resources/blueprint-resources.ts` y `server.ts`.
    * Creación de la herramienta `clean_workspace_11x` (`mcp-server/src/tools/clean-workspace.ts`) con auditoría segura en modo `dry_run` por defecto, detección recursiva de residuos de pruebas/Docker y ejecución de saneamiento con fallback Alpine.
    * 70 pruebas unitarias aprobadas al 100% en `mcp-server/tests/tools-and-resources.unit.ts` certificando **97.7% de cobertura en líneas y sentencias, 92.98% en ramas y 98.36% en funciones**.
  * **Playbook 5 en la Skill Maestra (`.agents/skills/qa-11x-architect/SKILL.md`):** Documentación del procedimiento canónico de saneamiento de espacio de trabajo y erradicación de bloqueos de root en contenedores.
  * **Distribución Automática en Manifiesto Criptográfico (`manifest.json`):** Inclusión de `scripts/limpieza.sh` en `COMMON_FILE_PATHS` dentro de `scripts/generar-manifiesto.py` clasificado con estrategia `overwrite_executable` (`0o755`) para su propagación automática a cualquier repositorio que consuma el blueprint.
* **Invariante de Tarea Activa (`.agents/ACTIVE_TASK.md`) y Herramienta de Planificación (Resiliencia Operativa 11X):**
  * **Plantilla Canónica (`.agents/ACTIVE_TASK.md.example`):** Estructura modular estándar con metadatos de inicio/cierre, especificación rectora, guía de resiliencia operativa y desglose de progreso por fases con casillas atómicas `- [ ]` / `- [x]`. Clasificada como `copy_if_missing` en `manifest.json`.
  * **Nueva Regla de Gobernanza (`.agents/rules/active_task_and_planning_resilience.md` y `AGENTS.md`):** Guardrail innegociable que obliga a todo agente de IA (Antigravity, Claude, Hermes, Cursor) a invocar su herramienta o modo de planificación (`/plan` o artefactos ejecutables) y persistir en caliente el plan en `.agents/ACTIVE_TASK.md`, actualizándolo en tiempo real para garantizar cero pérdida de contexto ante cuelgues del IDE, reinicios de sesión o compactación de contexto.
  * **Actualización de la Skill Maestra (`.agents/skills/qa-11x-architect/SKILL.md` y `references/01-core-13-layers.md`):** Formalización de la Ley 10 (*Active Task Invariant, Planning Tool & Closure Gate*), playbooks operacionales de bootstrap y cierre, y diagrama de flujo canónico del protocolo dual de planificación y persistencia en caliente.
  * **Recurso Canónico en Servidor MCP (`mcp-server/src/resources/blueprint-resources.ts` y `server.ts`):** Exposición del recurso `blueprint://core/active-task-template` para consulta y distribución remota a clientes MCP.
  * **Extensión de Pruebas Unitarias de MCP (`mcp-server/tests/tools-and-resources.unit.ts`):** 63 pruebas unitarias aprobadas al 100% con **98.69% de cobertura de líneas y sentencias, 93.77% en ramas y 100% en funciones**.
* **Hito 4 — Servidor MCP en Node.js / TypeScript (`mcp-server/`), Recursos `blueprint://*` y Tools 1–4:**
  * **Paquete `@sinfallas/mcp-qa-11x` (`mcp-server/`):** Infraestructura completa en Node.js 22+ y TypeScript 5.7+ (`ES2022`, `NodeNext`) bajo `@modelcontextprotocol/sdk` (`^1.0.4`), Zod (`^3.24.1`), Vitest v8, ESLint 8.57 con plugins `security` y `sonarjs`, `.npmrc` con `ignore-scripts=true` y `pnpm-workspace.yaml` con `allowBuilds: { esbuild: true }`.
  * **Servicio de Hidratación Remota (`mcp-server/src/services/github-fetcher.ts`):** Descarga bajo demanda *Zero-Clone* desde GitHub Raw con soporte de validación condicional `ETag` (`If-None-Match` / `304 Not Modified`), verificación criptográfica estricta SHA-256 (`DISA ASD STIG V6R5 V-222513`), caché local en `~/.cache/qa-11x-blueprints/`, fallback offline ante indisponibilidad de red y soporte de sobreescritura local mediante `QA_BLUEPRINTS_LOCAL_PATH`.
  * **Fusionador Quirúrgico No Destructivo (`mcp-server/src/services/surgical-merger.ts`):** Algoritmo determinista de integración selectiva para `package.json` (preserva scripts y dependencias existentes inyectando solo faltantes), `pyproject.toml` (preserva `[project]` e inyecta herramientas `[tool.*]`), `Makefile` (añade exclusivamente targets `qa-*`), `.gitignore` y `.npmrc` (fusión aditiva idempotente), con soporte de permisos de ejecución `0o755` y modo de simulación `dryRun`.
  * **Recursos MCP Canónicos (`blueprint://*` en `mcp-server/src/resources/blueprint-resources.ts`):**
    * `blueprint://manifest`: Manifiesto criptográfico remoto/local completo en JSON.
    * `blueprint://core/philosophy`: Filosofía de calidad 11X (`AI_MASTER_PROMPT.md`).
    * `blueprint://security/disa-owasp-22`: Matriz canónica de los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
    * `blueprint://{stack}/readme`: Plantilla dinámica del manual operativo para el stack solicitado.
    * `blueprint://ui/refactoring-ui/{topic}`: Módulos de diseño visual y accesibilidad de `refactoring-ui`.
  * **Herramientas MCP 1 a 4 (`mcp-server/src/tools/`):**
    * `inspect_project_config` (`inspect-project.ts`): Auditoría *zero-shot* del proyecto identificando stacks activos (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`), banderas estrictas (`mypy`, `tsconfig`, `npmrc`) y archivos 11X ausentes con recomendación guiada del siguiente paso.
    * `fetch_blueprint_bundle` (`fetch-bundle.ts`): Descarga y validación en memoria del bundle de plantillas y gobernanza de agentes con verificación SHA-256 garantizada.
    * `bootstrap_or_merge_11x` (`bootstrap-merge.ts`): Fusión quirúrgica aplicada al proyecto destino con reporte de cambios aplicados y soporte de previsualización `dry_run`.
    * `inspect_ast_blast_radius` (`blast-radius.ts`): Cálculo estático del radio de impacto de símbolos, asignando nivel de riesgo (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), listado de archivos dependientes y sugerencia de pruebas unitarias/BDD a ejecutar.
  * **CLI Multi-Entorno y Punto de Entrada Dual (`mcp-server/src/cli/install-skill.ts` y `src/index.ts`):** Binario `mcp-qa-11x` con shebang `#!/usr/bin/env node` que opera como servidor MCP stdio por defecto o como instalador CLI mediante `install-skill` con detección automática de entorno (`workspace`, `antigravity`, `claude`, `cursor`, `hermes` o `all`).
  * **Certificación de Pruebas Unitarias al 100% (`mcp-server/tests/*.unit.ts`):** 62 pruebas unitarias pasando al 100% dentro del contenedor efímero `sinfallas/base-node-ionic:26`, con **98.64% de cobertura de líneas y sentencias, 93.66% en ramas y 100% en funciones**, con 0 errores de ESLint, SonarJS (Complejidad Cognitiva Grado A <= 15) y TypeScript (`tsc --noEmit`).
* **Hito 3 — Skill Maestra (`qa-11x-architect`), Carga Progresiva (`references/`) e Instalador Universal (`scripts/install-skill.sh`):**
  * **Skill Maestra Cognitiva (`.agents/skills/qa-11x-architect/SKILL.md`):** Arquitectura unificada en inglés técnico compacto con `OUTPUT LANGUAGE CONSTRAINT: Spanish`, detección automática de entorno (MCP-First vs. Fallback de hidratación directa desde GitHub Raw vía `manifest.json`), las 10 Leyes Innegociables de Calidad 11X y 4 Playbooks Operativos (Bootstrap, Cobertura, Hardening DISA/OWASP y Certificación de Cierre).
  * **Carga Progresiva (*Progressive Disclosure*) en 5 Referencias Especializadas:**
    * `01-core-13-layers.md`: Matriz de ejecución de las 13 capas de calidad, directivas Anti-Mock Blindness (PostgreSQL 17 real), Anti-JSDOM (geometría en flujo) y Fixtures Trimodales (Virgin, Nominal, Degraded).
    * `02-security-disa-owasp-22.md`: Matriz y snippets de los 22 patrones canónicos de seguridad por diseño bajo DISA ASD STIG V6R5 y OWASP Developer Guide v4.2.
    * `03-stack-python-fastapi.md`: Directivas para Python standalone y FastAPI (PostgreSQL 17, KeyDB, Alembic, Karate API, Schemathesis, Mutmut).
    * `04-stack-node-vue-react.md`: Directivas para Node.js, Vue 3 y React (.npmrc Zero-Trust, Vitest >= 95%, Playwright + Axe WCAG 2.1 AA, Lighthouse CI, Karate UI y sinergia obligatoria con `refactoring-ui`).
    * `05-stack-bash-devops.md`: Directivas para Bash/Shell (ShellCheck 0 advertencias, shfmt, BATS-core, bats-mock, kcov >= 95% y Pushgateway).
  * **Instalador Universal de 1 Comando (`scripts/install-skill.sh`):** Script universal compatible con POSIX `sh` (100% verificado con ShellCheck y shfmt) que instala `qa-11x-architect` y `refactoring-ui` en `workspace`, `antigravity`, `claude`, `cursor`, `hermes` o `all`, validando criptográficamente cada archivo contra `manifest.json` mediante SHA-256 (DISA STIG V-222513).
  * **Suites de Pruebas Unitarias y BATS (`tests/test_install_skill.unit.py` y `bash-scripts/test/test_install_skill.bats`):** Cobertura unitaria en Python con 5 casos de prueba y suite BATS en Docker con 4 aserciones pasando al 100%.
  * **Sincronización de Manifiesto Criptográfico (`manifest.json`):** Manifiesto actualizado a 105 archivos indexados con verificación SHA-256 aprobada al 100%.
* **Hito 2 — Manifiesto Criptográfico (`manifest.json`) y Generador Automático SHA-256 (DISA STIG `V-222513` / `APSC-DV-001430`):**
  * **Generador y Validador Criptográfico (`scripts/generar-manifiesto.py`):** Script CLI en Python 3.12+ (solo librería estándar) con algoritmo determinista de indexación para los 6 stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`), `common_files` y `agent_governance_files`, calculando de forma determinista el tamaño en bytes, `target_name`, `merge_strategy` (`append_missing_lines`, `surgical_merge`, `copy_if_missing`, `overwrite_executable`, `copy_or_overwrite`, `copy_if_missing_or_update_qa`) y hash criptográfico SHA-256 de 64 caracteres.
  * **Bandera de Verificación Pre-Commit y CI (`--check`):** Compara en memoria el manifiesto contra el estado físico del repositorio emitiendo exit code `0` si existe sincronización total o exit code `1` con desglose detallado de derivas y discrepancias.
  * **Manifiesto Remoto Raíz (`/manifest.json`):** Generado e indexado en la raíz con 97 descriptores de archivo para hidratación bajo demanda *Zero-Clone*.
  * **Compuerta de Certificación 11X (`.agents/scripts/certify_task_completion.sh`):** Integrado el paso `[8/9]` de verificación estricta de `manifest.json --check` impidiendo commits con deriva criptográfica.
  * **Suite de Pruebas Unitarias (`tests/test_generar_manifiesto.unit.py`):** 12 casos de prueba unitaria ejecutados en contenedor efímero `sinfallas/base-python-uv:3.15` con **98% de cobertura** certificada.
* **Skill de Diseño Visual y Accesibilidad Frontend (`.agents/skills/refactoring-ui/`):**
  * Incorporación de la skill `refactoring-ui` (`SKILL.md` + 9 módulos en `references/`: `hierarchy.md`, `layout.md`, `type.md`, `color.md`, `depth.md`, `images.md`, `polish.md`, `dark-mode.md`, `tailwind.md`) adaptada al estándar 11X con `OUTPUT LANGUAGE CONSTRAINT: Spanish` y puente directo con Anti-JSDOM, `@axe-core/playwright` (WCAG 2.1 AA) y Lighthouse CI (`CLS = 0` con `tabular-nums`).
  * Integrada en las especificaciones `01_SPEC` a `04_SPEC` y `ROADMAP.md` para su distribución *Zero-Clone* tanto vía el instalador universal (`install-skill`) como vía el recurso MCP `blueprint://ui/refactoring-ui/{topic}` y la regla de auditoría estática `UI-11X-01`.
* **Retroalimentación de Producción desde Caso de Estudio Real (`RoSGrid` v1.0.0 — 14 Hitos):**
  * **Validador Bidireccional de Endpoints API (`.agents/scripts/verify_no_orphan_api_endpoints.py`):** Audita estáticamente en `< 2s` que el 100% de las llamadas HTTP del frontend coincidan con rutas registradas en el backend (cero errores 404/405 silenciosos) y detecta endpoints de backend huérfanos.
  * **Plantilla de Blindaje Productivo `--no-dev` (`fastapi/test/test_production_no_dev_cleanliness.unit.py.example`):** Prueba unitaria basada en AST que garantiza que ningún módulo en `src/` importe paquetes exclusivos de `[project.optional-dependencies].dev`, certifica la desactivación de `/docs`, `/redoc` y `/openapi.json` en `APP_ENV=production` y verifica la sanitización de errores `422`.
  * **Plantillas Nginx para SPA, Observabilidad y Seguridad OSHP (`vue3/nginx/default.conf.example` y `react-frontend/nginx/default.conf.example`):** Configuración lista para producción y QA con `try_files $uri $uri/ /index.html`, endpoint `/stub_status` restringido a subredes internas para `nginx-prometheus-exporter`, DNS dinámico (`127.0.0.11`), proxy `/api/` y `/ws/`, y cabeceras OWASP OSHP.
  * **Política Trivy de Exclusión de Contenedores Efímeros de QA (`.trivy.yaml`) y `.gitignore` Raíz:** Evita falsos positivos de Trivy IaC sobre privilegios diagnósticos intencionales en `*/docker-compose.qa.yml` (`SYS_PTRACE` para `py-spy`/`clinic.js`, `user: root` en OWASP ZAP y `docker.sock:ro` en Pumba), manteniendo auditoría estricta sobre manifiestos de producción.
  * **Scripts Operativos de Gobernanza (`scripts/actualizar-grafos-graphify.sh` y `scripts/generar-sbom-cyclonedx.sh`):** Automatización en contenedores efímeros para extracción/agrupación de grafos AST Graphify y generación de inventarios CycloneDX SBOM (ECMA-424 / STIG V6R5).
* **Especificaciones de Arquitectura Zero-Clone (`docs/specs/`) y Planificación Maestra (`ROADMAP.md`):**
  * `docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`: Diseño de hidratación bajo demanda desde GitHub sin clonar el repositorio y esquema del manifiesto criptográfico `manifest.json` (SHA-256).
  * `docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`: Especificación de la Skill maestra `qa-11x-architect` con carga progresiva (`references/`) e instalador universal de 1 comando (`npx` y `curl | sh`).
  * `docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`: Especificación del servidor MCP en Node.js/TypeScript (`@sinfallas/mcp-qa-11x`), sus 4 Resources y las Tools 1 a 4.
  * `docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`: Especificación de los parsers ahorradores de tokens, el auditor estático de los 22 patrones DISA ASD STIG V6R5 + OWASP v4.2 y las Tools 5 a 7.
  * `docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`: Manual paso a paso para publicar paquetes en npm (Node.js) con 2FA, Granular Access Tokens y GitHub Actions con SLSA Provenance (`--provenance`).
  * `ROADMAP.md`: Planificación detallada en 6 Hitos ejecutable por Gemini 3.8 Flash High.

### 🐛 Corregido y Mejorado (Fixed & Changed)
* **Alineación de Tool Boundary en Playwright (`accessibility.e2e.ts`):** Renombrados `vue3/e2e/accessibility.spec.ts` y `react-frontend/e2e/accessibility.spec.ts` a `accessibility.e2e.ts` para coincidir con `testMatch: '**/*.e2e.ts'` en `playwright.config.ts.example`, añadiendo intercepción determinista de tiles de mapas con PNG 1x1 en base64.
* **Soporte Corepack y Chromium Headless en Contenedor `ui-e2e` y Lighthouse CI:** Añadidos `entrypoint` con `corepack enable`, `CHROME_PATH` apuntando al binario Chromium de Playwright, `chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage'` y `skipAudits: ['is-on-https']` en `lighthouserc.js.example`.
* **Blindaje de `pyproject.toml.example` (`fastapi/` y `python/`):** Añadido `[tool.hatch.build.targets.wheel] packages = ["src"]`, movidos `prometheus-fastapi-instrumentator` y `prometheus-client` a dependencias de producción, incorporado `pip-audit>=2.7.3`, configurado `python_files = ["*.unit.py", "*.spec.py", "test_*.py"]` + `--import-mode=importlib` y añadida sección `[tool.pyrefly]` para IDEs sin `.venv` local.
* **Configuración de Vitest, Stryker y `package.json.example` (`vue3/`, `react-frontend/`, `node-backend/`):** Añadido alias `@`, exclusión de `src/main.ts` en cobertura, `@vitejs/plugin-vue`, `@axe-core/playwright`, `pnpm audit --prod`, `pnpm.onlyBuiltDependencies` y plugins de `@stryker-mutator/vitest-runner`.
* **Validación de Longitud de Revision IDs en Alembic (`verify_alembic_orm_parity.py`):** Añadida función `verify_revision_id_lengths()` que bloquea identificadores `revision` mayores a 32 caracteres (`VARCHAR(32)` en PostgreSQL `alembic_version`).
* **Detección `lowerCamelCase` y Multi-Frontend en `verify_zero_orphan_vue_components.py`:** Soporte para suites unitarias nombradas en `lowerCamelCase` o `PascalCase` y escaneo simultáneo de todos los directorios frontend presentes.
* **Limpieza Resiliente sin Root (`limpieza.sh`):** Fallback automático con contenedor `alpine` para eliminar cachés generadas por root en Docker y preservación de `GRAPH_REPORT.md`, `graph.html` y `graph.json`.
* **Directivas `.agents/rules/`:** Incorporadas las 6 reglas empíricas de producción (`AsyncSession MissingGreenlet`, `Idempotency-Key` único por mutación en tests, visibilidad RBAC proactiva `Zero 403 Dead-Ends`, ergonomía multi-viewport `375/768/1440` + daltonismo geométrico, ubicación canónica de `.agents/ACTIVE_TASK.md` y `Critical Execution Gate`).

---

## [2.7.0] - 2026-11-02

### 🚀 Añadido (Added)
* **Cumplimiento Normativo DISA ASD STIG V6R5 (286 Reglas) y OWASP Developer Guide v4.2:**
  * **Patrón 14 — Gobernanza de Sesiones, Concurrencia y Purga en Logout (`DISA V-222387..V-222392, V-222549, V-222578..V-222583, V-222672` & `OWASP 4.3.7`):** Límites de sesiones simultáneas en KeyDB, *idle timeouts* diferenciados por rol (**10 min** admin / **15 min** operador), expiración absoluta, rotación de ID de sesión con CSPRNG validado (anti-*Session Fixation*), revocación global de sesiones al deshabilitar cuentas o rotar credenciales, y purga de `localStorage`, `sessionStorage` y `CacheStorage` al cerrar sesión con mensaje explícito de confirmación.
  * **Patrón 15 — Bloqueo de Cuentas, Anti-Enumeración en Tiempo Constante y Ciclo de Vida de Credenciales (`DISA V-222408..V-222411, V-222432..V-222437, V-222520, V-222536..V-222547` & `OWASP 4.3.7`):** Bloqueo tras **3 intentos fallidos consecutivos en 15 minutos**, verificación Argon2id en tiempo constante contra `DUMMY_ARGON2_HASH` para neutralizar *Timing Side-Channels*, política STIG de contraseñas (**15 caracteres**, complejidad multi-clase, diferencial de 8 caracteres, historial de **5 generaciones**, cero preguntas de seguridad), desactivación automática de cuentas temporales a las **72 horas** e inactivas a los **35 días**, notificación de último inicio de sesión, *Step-Up Re-Authentication* y mTLS/PKI con caché CRL/OCSP.
  * **Patrón 16 — Canonicalización Unicode (`NFKC`), Sanitización de Cabeceras ASCII y Prevención de Command Injection (`DISA V-222604..V-222606` & `OWASP 4.3.3, 4.3.5, 4.3.6`):** Normalización estricta a `NFKC` antes de validar, rechazo de caracteres de control ASCII y prohibición de `shell=True` / `os.system`.
  * **Patrón 17 — Blindaje contra XML/XXE, Deserialización Insegura y Validación de Archivos por Magic Bytes (`DISA V-222398..V-222406, V-222593, V-222601, V-222608, V-222626` & `OWASP 4.3.2, 4.3.6`):** Analizadores XML con DTD y entidades externas deshabilitadas (`resolve_entities=False`, `no_network=True`), validación de firmas/timestamps/`OneTimeUse` en SAML, deserialización verificada con HMAC-SHA256 (prohibido `pickle`/`yaml.load`) y validación de archivos por *Magic Bytes* con mapeo de rutas por índices en lista blanca.
  * **Patrón 18 — Auditoría Forense Inmutable, Prevención de Log Injection (CR/LF) y Alerta de Capacidad al 75% (`DISA V-222444, V-222446..V-222509` & `OWASP 4.3.10`):** Sanitización de secuencias CR/LF (`\r`, `\n`) y etiquetas HTML en trazas, cero secretos/tokens/IDs de sesión en logs, registros UTC encadenados con **HMAC-SHA256** y alerta operativa al superar el **75% de capacidad** de almacenamiento de auditoría.
  * **Patrón 19 — Criptografía Validada (FIPS 140-3), Zeroización de Secretos en Memoria y Sanitización de Exportaciones (`DISA V-222393..V-222395, V-222570..V-222577, V-222612, V-222643, V-222666` & `OWASP 4.3.9`):** Sobrescritura determinista (`zeroize`) de búferes de memoria con secretos en todos los puntos de salida, agilidad criptográfica FIPS 140-3, etiquetado de clasificación de seguridad y purga de credenciales en exportaciones de base de datos.
  * **Patrón 20 — Cabeceras de Seguridad HTTP (OWASP OSHP), Estado Fail-Secure y Auto-Verificación de Seguridad (`DISA V-222585, V-222586, V-222615, V-222616, V-222668` & `OWASP 4.3.2, 4.3.8, 5.4.4`):** Arranque y fallo en estado seguro (*Fail-Closed / Deny-by-Default*), auto-verificación criptográfica al inicio y middleware de cabeceras **OWASP OSHP** (`HSTS`, `CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`, supresión de `Server`/`X-Powered-By`).
  * **Patrón 21 — Mitigación de OWASP API Security Top 10 (2023), Anti-Data-Mining y Consumo Seguro de APIs (`DISA V-222424, V-222425` & `OWASP 7.8`):** Cuotas y detección de extracción masiva (*Data Mining*), prevención de BOLA/BOPLA/BFLA y validación estricta de payloads y timeouts al consumir APIs externas (`API10:2023`).
  * **Patrón 22 — Cadena de Suministro (CycloneDX SBOM/CBOM), Firma de Artefactos y Threat Modeling como Código (`DISA V-222513, V-222613, V-222645, V-222655, V-222658` & `OWASP 4.2, 4.3.3, 5.3.4`):** Modelado de amenazas programático con **OWASP `pytm`** y generación/verificación criptográfica de inventarios **OWASP CycloneDX SBOM/CBOM (ECMA-424)**.

### 🔄 Modificado (Changed)
* **Directivas y Skills de Agentes de IA (`AGENTS.md`, `AI_MASTER_PROMPT.md`, `.agents/README.md`, `.agents/rules/secure_development_and_testing_guidelines.md`, `.agents/skills/qa-11x-docker-certifier/SKILL.md`, `.agents/skills/docker-trivy-keydb-hardening/SKILL.md`):** Ampliadas de 11 a 17 directivas de seguridad por diseño y pruebas multi-capa bajo DISA ASD STIG V6R5 y OWASP Developer Guide v4.2.
* **Prompts Operativos de Ecosistemas (`fastapi/README.md`, `node-backend/README.md`, `python/README.md`, `vue3/README.md`, `react-frontend/README.md`, `bash-scripts/README.md`):** Añadidas secciones dedicadas de seguridad por diseño obligatoria (backend, frontend y shell) vinculadas a los 22 patrones canónicos.
* **Manuales Humanos y Gobernanza (`docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`, `SECURITY.md`, `TESTING.md`, `CONTRIBUTING.md`, `README.md`, `RESOURCES.md`):** Sincronización integral con OWASP ASVS, WSTG, OSHP, API Security Top 10 (2023), CycloneDX SBOM, `pytm`, Coraza WAF y DISA ASD STIG V6R5.

---

## [2.6.0] - 2026-10-28

### 🚀 Añadido (Added)
* **Gobernanza de Agentes de IA (`.agents/`):** Estructura completa de gobernanza multi-agente (`rules/`, `skills/`, `scripts/`) compatible con Google Antigravity, Claude Code / Desktop, Hermes Agent, Cursor y Windsurf.
* **Optimización Bimodal de Tokens:** Directivas internas de IA en inglés técnico de alta densidad para reducir el consumo de tokens BPE en un ~35%, manteniendo la interacción y documentación estrictamente en español (`OUTPUT LANGUAGE CONSTRAINT`).
* **Manuales Técnicos Corporativos:**
  * `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`: Gobernanza de agentes, enrutamiento semántico y ciclo de evolución continua.
  * `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`: Anti-Mock Blindness, Geometría Visual Anti-JSDOM, Seguridad por Diseño (RLS, SSRF, AES-256-GCM Vault, Idempotency-Key) y Motor KeyDB Multi-Hilo.
  * `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`: Desglose detallado de los 13 niveles de la pirámide de calidad 11X.
  * `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`: Catálogo y recetario técnico de mitigación de 13 vectores de ataque en plataformas híbridas (Mass Assignment, CSWSH, SSRF, Information Disclosure 422, XSS/Prototype Pollution, SQL injection en contextos dinámicos, race conditions en refresh tokens y shift-left lockfiles).
* **Política de Seguridad DevSecOps (`SECURITY.md`):** Actualización completa con 8 capas de defensa en profundidad, mitigación de vulnerabilidades híbridas y gobernanza de lockfiles herméticos (`uv.lock` y `pnpm-lock.yaml`).
* **Anti-Mock Blindness y Paridad de Base de Datos:** Integración del validador `.agents/scripts/verify_alembic_orm_parity.py` y contenedor real `postgres:17-alpine` en `fastapi/docker-compose.qa.yml`.
* **Motor en Memoria KeyDB:** Incorporación de `eqalpha/keydb:alpine` con multi-threading (`--server-threads 2`) como reemplazo de alto rendimiento para Redis.
* **Invariante Karate Labs BDD Universal:** Enriquecimiento de pruebas BDD de caja negra para API (`fastapi/test/api_test.feature`) y UI en Chrome Headless (`vue3/test/ui_business_flow.feature`).
* **Invariante de Cero Componentes UI Huérfanos:** Script determinista `.agents/scripts/verify_zero_orphan_vue_components.py` que exige pruebas unitarias para cada archivo `.vue` o `.tsx`.
* **Auditoría Anti-Colisión JSON:** Script `.agents/scripts/verify_json_no_duplicate_keys.py` para prevenir sobreescritura silenciosa de claves en diccionarios de traducción y configuración.
* **Radio de Impacto AST (Blast Radius):** Script `.agents/scripts/inspect_blast_radius.py` y auditor topológico `.agents/scripts/verify_topological_health.py` basados en grafos AST de Graphify.
* **Escaneo Preventivo de Secretos:** Script `scripts/verificar-secretos.sh` integrado para detectar credenciales y tokens hardcodeados en commits.
* **Compuerta de Certificación Pre-Commit:** Script automatizado `.agents/scripts/certify_task_completion.sh` que evalúa 7 etapas de control de calidad antes de cerrar tareas.
* **Resolución de Problemas Avanzada (`docs/docker-troubleshooting.md`):** Nuevas secciones operativas para sincronización activa con `pg_isready` en PostgreSQL, límites de memoria y evicción en KeyDB, permisos de caché local en Trivy y prevención de defectos de geometría visual Anti-JSDOM.

### 🔄 Modificado (Changed)
* **`AI_MASTER_PROMPT.md`:** Actualizado con los mandatos aprendidos en campo: Anti-Mock Blindness, Anti-JSDOM, Invariante Karate Labs BDD, Paridad Terminal ↔ Frontend y compuerta de certificación.
* **Modernización Canónica de Seguridad Dinámica (DAST):** Reemplazo global de la imagen deprecada `owasp/zap2docker-stable:latest` por `zaproxy/zap-stable:latest` en todos los orquestadores Docker Compose, guías de ecosistemas y `CONTRIBUTING.md`.
* **Estandarización de Comandos Graphify:** Corrección del error tipográfico `graphifyy` y alineación con los binarios canónicos `graphify-mcp` y `graphify extract --code-only` en todos los orquestadores y READMEs de ecosistemas (`fastapi`, `node-backend`, `python`, `bash-scripts`, `vue3`, `react-frontend`).
* **Armonización de la Pirámide de Calidad a 13 Capas:** Sincronización integral de `docs/qa-philosophy.md`, `docs/ARCHITECTURE_C4.md` y `fastapi/README.md` delimitando con precisión el aislamiento unitario frente a la verificación real de persistencia (Anti-Mock Blindness).
* **Pipelines de CI/CD Seguros (`docs/ci-cd-pipelines.md`):** Eliminación del anti-patrón de inyección de credenciales en disco, incorporación del script de escaneo de secretos y acoplamiento de la compuerta de certificación de 7 pasos.
* **`fastapi/docker-compose.qa.yml`:** Añadidos servicios nativos de `postgres` y `keydb` con healthchecks, y optimizado `pull_policy: if_not_present`.
* **`fastapi/Makefile.example`:** Ampliado con metas `qa-contracts`, `qa-bdd`, `qa-dast`, `qa-chaos` y validaciones estrictas de `radon`, `bandit` y `pip-audit`.
* **`vue3/docker-compose.qa.yml` & `vue3/Makefile.example`:** Actualizado a `sinfallas/base-node-ionic:26`, meta `qa-orphans` y optimizaciones de pull policy.
* **`README.md`:** Reescrito con la nueva gobernanza, filosofía 11X multi-capa y enlaces a los nuevos manuales técnicos.

---

## [2.5.0] - 2026-10-10

### 🚀 Añadido (Added)
*   **Optimizaciones de Caché Persistente:** Implementación global de volúmenes de caché compartidos (`pnpm-store` para Node/Vue/React y `uv-cache` para Python/FastAPI) en los orquestadores `docker-compose.qa.yml`. Esto elimina la reinstalación de paquetes en cada validación efímera y acelera masivamente los pipelines destructivos (BDD, mutación, carga).
*   **Fronteras de Ejecución (Tool Boundaries):** Blindaje de *runners* configurando `testMatch`/`include` en `vitest.config.ts` y `playwright.config.ts`. Se estableció una convención corporativa inquebrantable: `.unit.ts` o `.spec.ts` para Vitest/Pytest, y `.e2e.ts` exclusivo para Playwright/Karate Labs.
*   **Makefiles (Task Runners):** Creación de archivos `Makefile.example` en cada framework para envolver la verbosidad destructiva de Docker Compose (ej. `make qa-unit`, `make qa-all`). Oculta la complejidad y previene errores tipográficos de agentes y humanos.
*   **Seguridad Zero-Trust en NPM:** Inyección de `.npmrc.example` en todos los ecosistemas JavaScript bloqueando la ejecución silenciosa de scripts post-instalación de terceros (`ignore-scripts=true`).
*   **Directiva Zero-Shot (MCP):** Actualización del cerebro del agente (`AI_MASTER_PROMPT.md`) con la "Regla #7". La IA está obligada a leer proactivamente (vía `graphify`) las configuraciones locales de QA (ej. `.eslintrc.json`, `tsconfig.json`, `pyproject.toml`) *antes* de escribir la primera línea de código, garantizando precisión en el primer intento y ahorrando consumo de tokens en ciclos de autocorrección.

### 🔄 Modificado (Changed)
*   **Orquestadores de Pruebas:** Los archivos `docker-compose.qa.yml` de Node, Vue 3, React y FastAPI pasaron por una refactorización masiva para soportar el aislamiento total de la caché de volumen.
*   **Sandboxing de Mutación:** Configuración de volúmenes base que impiden que herramientas agresivas (como Stryker o Mutmut) escaneen historiales `.git` o se atasquen en bucles infinitos por enlaces simbólicos (`symlinks`) expuestos del sistema anfitrión.
*   **Documentación de Integración (IA):** Actualización extensa de `docs/ai-integration.md` incluyendo el flujo de *Tool Calling* seguro y orquestación multi-agente (Developer vs Auditor QA) basado en los nuevos *Makefiles*.
*   **Guías de Contribución y FAQs:** Se actualizó la matriz corporativa en `CONTRIBUTING.md`, `README.md` y las resoluciones de errores en `FAQ.md` para exigir y documentar el uso de los `Makefiles` como puerta de entrada a la ejecución efímera.

---

## [2.4.0] - 2026-10-08

### 🚀 Añadido (Added)
*   **Ecosistema React (Nivel 11X):** Integración completa del ecosistema `react-frontend/` al repositorio corporativo.
*   **Vitest + RTL:** Configuración de pruebas unitarias centradas en el usuario (DOM/ARIA) mediante `@testing-library/react` y `jsdom`, manteniendo la exigencia innegociable de 95% de cobertura.
*   **Reglas Estrictas de Hooks (ESLint):** Integración de `eslint-plugin-react` y `eslint-plugin-react-hooks` para evitar bucles infinitos en dependencias de `useEffect`.
*   **Documentación React:** Creación de un `README.md` (Prompt Operativo) específico para instruir a la IA en la correcta validación del estado y ciclo de vida de React bajo contenedores efímeros.

### 🔄 Modificado (Changed)
*   **Documentación Global:** Actualización del `README.md` maestro (Matriz de Herramientas) y del `AI_MASTER_PROMPT.md` para incluir el enrutamiento de contexto hacia la nueva carpeta de React.
*   **Desacoplamiento de E2E:** Estandarización de los archivos de regresión visual y pruebas BDD (Playwright, Lighthouse CI y Karate Labs) para que sean completamente agnósticos, sirviendo tanto para los ecosistemas Vue 3 como React.

---

## [2.3.1] - 2026-10-07

### 🚀 Añadido (Added)
*   **UX/DX:** Se estandarizó la bibliografía y enlaces externos en archivos centralizados (`RESOURCES.md` / `REFERENCES.md`) para limpiar los prompts operativos.

### 🔄 Modificado (Changed)
*   **Refactorización de Enrutamiento:** Se renombraron las guías operativas de todos los ecosistemas (ej. `pruebas-backend-node.md`, `pruebas-script-bash.md`) a `README.md`. Esto activa el renderizado automático en GitHub/GitLab y optimiza el punto de entrada para los Agentes de IA.
*   **AI Master Prompt:** Actualizada la Regla Innegociable #6 y la sección de enrutamiento para diferenciar la observabilidad entre servicios continuos (middleware `/metrics`) y tareas efímeras (*Pushgateway*).
*   **Documentación de Arquitectura:** Actualizados los diagramas Nivel 2 y Nivel 3 en `ARCHITECTURE_C4.md` para ilustrar gráficamente la recolección asíncrona de métricas vía Pushgateway.
*   **Filosofía y FAQ:** Se agregaron aclaratorias en `qa-philosophy.md` y `FAQ.md` justificando el uso de inyección de comandos `curl` o `push_to_gateway` en entornos que no levantan servidores HTTP (Bash y scripts Python).
*   **CI/CD:** Añadida una advertencia en la plantilla de `ci-cd-pipelines.md` para evitar que los proyectos de scripts efímeros intenten invocar el perfil de caos (`--profile chaos`) en lugar del de observabilidad.
*   **Python Scripts:** Se actualizó el `README.md` del ecosistema Python para instruir a la IA sobre cómo utilizar `CollectorRegistry` y `push_to_gateway` antes de que el contenedor muera.

### 🐛 Corregido (Fixed)
*   **Bug de Red (Python Scripts):** Corregido un error en el `docker-compose.qa.yml` donde Prometheus intentaba raspar un hostname inexistente (`test_env:8000`). Ahora apunta correctamente a `test:8000`.
*   **Fugas de Infraestructura (Limpieza):** Se actualizaron los scripts `limpieza.sh` de Bash y Python Scripts para garantizar que el orquestador apague los contenedores del perfil oculto `--profile observability` antes de podar el sistema.

---

## [2.3.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Observabilidad Universal (Estándar 11X):** Integración completa de Prometheus en todos los ecosistemas para la recolección de métricas RED (Rate, Errors, Duration) en tiempo real, permitiendo evaluar el daño durante las pruebas de Ingeniería del Caos.
* **Perfil de Observabilidad (`--profile observability`):** Creación de un nuevo perfil aislado en los orquestadores `docker-compose.qa.yml` para desplegar sidecars de telemetría (`prom/prometheus`, `nginx-prometheus-exporter`, `prom/pushgateway`) sin alterar ni sobrecargar el flujo de las pruebas lógicas estándar.
* **Telemetría para Tareas Efímeras:** Implementación de la arquitectura `Pushgateway` específica para monitorizar métricas y tiempos de ejecución en el ecosistema Bash y scripts *standalone* en Python.
* **Feature Freeze:** Declaración oficial de congelamiento de nuevas características. Se considera que la arquitectura del Nivel 11X está funcionalmente completa.

### 🔄 Modificado (Changed)
* **Master Prompt (Regla #6):** Se actualizó el archivo `AI_MASTER_PROMPT.md` imponiendo como mandato innegociable la instrumentación de métricas antes de ejecutar inyecciones de red destructivas.
* **Documentación Global:** Evolución estructural de los diagramas del Modelo C4 en `ARCHITECTURE_C4.md`, refinamiento de los pasos de GitHub Actions en `ci-cd-pipelines.md`, y adición de aclaratorias técnicas sobre middlewares de Prometheus en el `FAQ.md` y `CONTRIBUTING.md`.
* **Gestión de Artefactos y Limpieza:** Adaptación masiva de los scripts de purga (`limpieza.sh`) y archivos `.gitignore.example` para destruir proactivamente las redes asociadas a la observabilidad e ignorar las bases de datos temporales `prometheus_data/`.

---

## [2.2.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Optimización de Contexto IA (Graphify MCP):** Integración de la imagen `sinfallas/remote-graphify:latest` en todos los ecosistemas bajo el perfil oculto `--profile graphify`. Permite a los agentes autónomos extraer y consultar el grafo semántico del código mediante Server-Sent Events (SSE), comprimiendo la ventana de contexto y ahorrando tokens masivamente al utilizar proxies como OmniRoute.
* **Bitácora Viva (TESTING.md):** Adición de una nueva regla innegociable (Regla #5) en el `AI_MASTER_PROMPT.md`. A partir de ahora, la IA está obligada a generar o actualizar un archivo `TESTING.md` en el proyecto del usuario, resumiendo el alcance de las pruebas desarrolladas y documentando los comandos exactos de Docker Compose para su ejecución manual.
* **Paso 0 (Ingestión de Contexto):** Se añadió el Paso 0 obligatorio en todas las guías de *prompting* (`pruebas-*.md`), instruyendo a la IA a levantar el servidor MCP efímero antes de iniciar cualquier auditoría o escritura de código.

### 🔄 Modificado (Changed)
* **Erradicación de IPv6 (Redes Unificadas):** Se eliminó por completo el soporte IPv6 (`enable_ipv6: true`) de todos los orquestadores `docker-compose.qa.yml`. Se estandarizó el uso de IPv4 estricto (`driver: bridge`) sobrescribiendo la red `default` para prevenir redes fracturadas, aislar correctamente los entornos y evitar conflictos de NAT en servidores de CI/CD.
* **Documentación Arquitectónica (Modelo C4):** Actualización de los diagramas en `ARCHITECTURE_C4.md` para visualizar el servidor MCP de Graphify y su interacción temprana (Paso 0) con el flujo de automatización 11X.
* **Guías de Integración IA:** Evolución del documento `ai-integration.md` para reflejar la implementación real de Graphify en lugar de ejemplos teóricos del ecosistema MCP.
* **Pipelines de Integración Continua:** Corrección de inconsistencias en los nombres de contenedores (`ui-test` renombrado correctamente a `test`) en las plantillas de GitHub Actions documentadas en `ci-cd-pipelines.md` para garantizar el copiado sin errores.
* **Rutinas de Limpieza y Control de Versiones:** Actualización transversal de todos los `.gitignore.example` y scripts `limpieza.sh` para ignorar la carpeta `graphify-out/` e instruir el apagado forzado del perfil MCP (`docker compose --profile graphify down`).

---

## [2.1.0] - 2026-10-02

### 🚀 Añadido (Added)
* **Seguridad Dinámica (DAST):** Integración de `OWASP ZAP` en modo *Baseline Scan* para los ecosistemas de FastAPI y Node.js. Permite auditar vulnerabilidades en cabeceras HTTP y configuraciones de red atacando la aplicación viva.
* **Ingeniería del Caos (Estándar 11X):** Incorporación de `Pumba` orquestado junto a `Locust` (Python) y `Artillery` (Node) para evaluar la resiliencia y el *Auto-Recovery*. Inyecta latencia de red y simula fallos de infraestructura bajo cargas extremas.
* **Perfiles Docker (Profiles):** Implementación de la bandera `--profile chaos` en los orquestadores `docker-compose.qa.yml`. Esto permite mantener las pruebas destructivas (que requieren acceso al `/var/run/docker.sock`) ocultas y protegidas por defecto, unificando la infraestructura en un solo archivo.
* **Meta-Instrucción Bilingüe (System Directive):** Adición de un bloque de sistema en inglés al inicio de todos los *blueprints* (`pruebas-*.md`). Esto ancla el espacio latente de razonamiento de los LLM en su idioma nativo de mayor capacidad, forzando el cumplimiento estricto mientras se genera la salida en español.

### 🔄 Modificado (Changed)
* **Documentación Global (11X):** Actualización masiva de `ARCHITECTURE_C4.md`, `qa-philosophy.md`, `docker-troubleshooting.md`, `ci-cd-pipelines.md` y `FAQ.md` para reflejar la evolución arquitectónica hacia la Ingeniería del Caos y DAST.
* **Matriz de Herramientas:** Actualización del `README.md` principal confirmando la operatividad total del stack corporativo. Se eliminaron los marcadores de "planificación" de OWASP ZAP y Pumba, y se corrigió la compatibilidad lógica (marcando N/A para scripts Python standalone).
* **Pipelines CI/CD:** El flujo de integración continua ahora integra la seguridad dinámica como Paso Final antes de autorizar un PR.
* **Limpieza Extendida:** Los scripts `limpieza.sh` en FastAPI y Node.js ahora purgan proactivamente las redes asociadas a los perfiles ocultos (`docker compose --profile chaos down`) y eliminan los artefactos `zap-report.html`, `chaos-report.html` y `chaos-report.json`.

---

## [2.0.0] - 2026-10-01

### 🚀 Añadido (Added)
* **Política de Seguridad:** Creación del archivo `SECURITY.md` definiendo reglas de divulgación, manejo de volúmenes de Docker, inyección de secretos (`.env`) y contención de Agentes de IA.
* **Análisis de Complejidad (Deuda Técnica):** Integración de `eslint-plugin-sonarjs` para los ecosistemas Node.js y Vue 3, y de `radon` para el ecosistema Python. El pipeline ahora falla si el código supera la complejidad ciclomática de grado B.
* **Profiling de Rendimiento:** Incorporación de `clinic.js` (Node.js) y `py-spy` (Python) para generación de Flamegraphs y detección de cuellos de botella en memoria/CPU.
* **Mocking Estricto:** Obligatoriedad de interceptar la red en pruebas unitarias mediante `nock` (Node.js) y `pytest-mock` (Python) para garantizar determinismo y velocidad.
* **Regresión Visual y Web Vitals:** Integración de `Lighthouse CI` y configuración estricta de `Playwright` con `@axe-core` en Vue 3 para congelar animaciones y exigir cumplimiento WCAG 2.1 AA.
* **Formateo Estético:** Adición de `.prettierrc.example` para los entornos JavaScript/TypeScript, separando la lógica (`ESLint`) de la estética (`Prettier`).
* **Permisos Extendidos:** Configuración de `cap_add: - SYS_PTRACE` y `seccomp:unconfined` en los orquestadores `docker-compose.qa.yml` para habilitar la lectura de memoria de los Profilers de manera segura.
* **Barrera Pre-commit Estricta:** Implementación de `Lefthook` para interceptar comandos Git a nivel local. Ahora se rechazan commits no semánticos y código que no supere la validación de estilo efímera (`ruff`, `Prettier`, `ESLint`), forzando un modelo educativo de "Fail & Forbid".
* **Prevención de Fugas y Auditoría IaC:** Integración de `Trivy` (escaneo de vulnerabilidades en manifiestos Docker y CVEs de imágenes base) como script manual (`auditar-infra.sh`) y como Paso 0 en los pipelines CI/CD. Añadida expresión regular en Lefthook para bloquear commits con secretos en texto plano.

### 🔄 Modificado (Changed)
* **Matriz de Herramientas:** Actualización del `README.md` principal para reflejar la implementación de las 15 métricas de calidad en todos los ecosistemas (eliminación de los asteriscos de funciones faltantes).
* **Guías de Contribución:** Actualización de `CONTRIBUTING.md` para exigir a los contribuidores mantener el 95% de cobertura, grado A/B en complejidad y un Score >90 en Lighthouse.
* **Reglas de Prompting:** Refactorización de todos los archivos `pruebas-*.md` para dotarlos de instrucciones nivel "10X" con lenguaje restrictivo e imperativo orientado a Agentes de IA.
* **Limpieza Profunda:** Los scripts `limpieza.sh` de cada entorno ahora purgan artefactos de profiling (`.clinic/`, `profile.svg`), reportes de Lighthouse y volcados temporales de Stryker.

---

## [1.0.0] - 2026-05-15

### 🚀 Añadido (Added)
* **Arquitectura Base Efímera:** Implementación de la regla de "Cero Compilaciones Locales" usando contenedores con el flag `--rm` y volúmenes *bind*.
* **Imágenes Oficiales:** Integración de la flota `sinfallas/*` (`base-python-uv`, `base-node-ionic`, `base-bash-qa`, `karatelabs`).
* **Regla del 95%:** Configuración de `kcov`, `Vitest` y `pytest-cov` para fallar pipelines si no se alcanza la cobertura mínima corporativa.
* **Pruebas de Mutación y SAST:** Integración de `Stryker`, `mutmut`, `bandit` y `eslint-plugin-security` para cazar vulnerabilidades lógicas y falsos positivos.
* **BDD de Caja Negra:** Orquestación de `Karate Labs` mediante archivos `.feature` para evaluar las APIs vivas.
* **Pipelines de CI/CD:** Creación de plantillas en `docs/ci-cd-pipelines.md` para emular la arquitectura efímera en GitHub Actions y GitLab CI.
* **Orquestación de IA:** Documentación `docs/ai-integration.md` para acoplar el repositorio a servidores de contexto MCP (Model Context Protocol).
