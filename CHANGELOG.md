# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

---

## [2.20.0] - 2026-11-12

### 🔄 Detección de Actualizaciones sin Red Redundante, Aviso `update_available` y Auto-Sync Global de Skills (Added & Changed)
* **Sello `.qa-11x-version`, Caché TTL 24h *Fail-Open* y Aviso Estructurado `update_available` (`v2.20.0`):** Incorporado `mcp-server/src/services/version-manager.ts` estampando `.qa-11x-version` en `install-skill` (`install-skill.ts` e `install-skill.sh`) y exponiendo `update_available` (`agent_notice` + `recommended_command`) en `inspect_project_config` y `certify_11x_gate`, reutilizando `manifest.json` (`ETag`) y caché de 24 h (`latest-version-check.json`) con *fail-open* offline.
* **Auto-Sincronización Silenciosa de Skills Globales al Arranque del MCP (`stdio`):** Al iniciar en modo `stdio`, `@sinfallas/mcp-qa-11x` sincroniza en segundo plano no bloqueante (`syncGlobalSkillsInBackground`, verificando `SHA-256` contra `manifest.json` y preservando el idioma del conector en `~/.gemini/GEMINI.md`) las skills globales ya instaladas (`~/.gemini`, `~/.claude`, `~/.cursor`, `~/.codeium/windsurf`, `~/.codex`, `~/.hermes`), certificado con 337 tests Vitest (`99.11%` líneas / `95.19%` ramas) y 24 escenarios Karate BDD.

---

## [2.19.0] - 2026-11-11

### 🛡️ Invariante `QA-HEALTH-01`, Nivelación Documental Humana 1:1 y Gobernanza Dual-Consumer (Added, Changed & Fixed)
* **Regla Anti-Silo #9 (`QA-HEALTH-01` — Contrato de `Healthcheck` Real en Contenedores y Semántica de Salida en Supervisores `asyncio`, `v2.19.0`):** Incorporada `QA-HEALTH-01` en `mcp-server/src/tools/security-auditor.ts` (auditando tanto supervisores `asyncio` que evalúan `.done()`/`.cancelled()` sin `task.exception()` como sondas físicas de `healthcheck` en `Dockerfile`/`docker-compose*.yml` sin aserción `.exists()`/`read_text()` en `tests/`), junto con su guía en `qa-11x-architect` (`SKILL.md < 20 KB`, `03-stack-python-fastapi.md`, `01-core-13-layers.md`) y `SECURITY.md` §4.22.
* **Nivelación Integral 1:1 de Manuales Humanos (`docs/02` y `docs/04`) y Blindaje Dual-Consumer en `propose_skill_evolution_pr` y `verify_docs_invariants.py`:** Sincronizadas las 9 reglas Anti-Silo/Anti-Ceguera UAT y las 24 reglas ejecutables (`SEC-01..16`, `QA-*`, `UI-11X-*`) en español didáctico dentro de `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md` y `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`; ampliado `propose_skill_evolution_pr` con inferencia automática y matriz de 3 capas (`Skill IA + Auditor MCP + Manual Humano`); e implementada `check_dual_consumer_parity` en `.agents/scripts/verify_docs_invariants.py` para bloquear commits donde las skills o reglas MCP carezcan de documentación humana.

---

## [2.18.0] - 2026-11-11

### 🌐 Internacionalización, Idioma Espejo Dinámico y Guías Multi-Agente (Added, Changed & Fixed)
* **Internacionalización y Directiva *Dynamic Language Mirroring* en `@sinfallas/mcp-qa-11x` (`v2.18.0`):** Incorporado el esquema `OutputLanguageModeSchema` (`auto`, `es`, `en`) con soporte de flags `--lang` / `-l` y variable de entorno `QA_OUTPUT_LANG` en CLI (`init-agents`, `install-skill`) y en la tool MCP `init_or_append_agents_md`; la directiva *Dynamic Language Mirroring* instruye al LLM a razonar y responder en el idioma del prompt, redactando commits y documentación respetando el idioma preexistente de `README.md` y `CHANGELOG.md` del repositorio; desplegada la política en las 5 Skills corporativas (`SKILL.md < 20 KB`).
* **Soporte Oficial para Targets Globales `codex` y `windsurf`, Guías Dedicadas para 11 Agentes y README Bilingüe:** Añadida autodetección y destinos explícitos para OpenAI Codex (`~/.codex/skills`) y Windsurf (`~/.codeium/windsurf/skills`) en `install-skill.ts` y `scripts/install-skill.sh`; traducidos los textos de ayuda CLI y descripciones del servidor MCP a inglés técnico conciso (~35% ahorro de tokens BPE); creado `mcp-server/README.md` en inglés para el escaparate público de npmjs y `mcp-server/README.es.md` en español para GitHub; y redactadas las guías maestras paso a paso `docs/agent-setup.md` (Español) y `docs/agent-setup.en.md` (English) cubriendo los 11 principales asistentes de IA para código.

---

## [2.17.0] - 2026-11-11

### 🛡️ Paridad Pre-Push 1:1 con CI y Endurecimiento Python / PostgreSQL 17 (Added, Changed & Fixed)
* **Sello Criptográfico de Evidencia `lint`, Stages `integration`/`migration`/`ci` y Parser de Endpoints Dinámicos en `@sinfallas/mcp-qa-11x` (`v2.17.0`):** Incorporado `qa-evidence.ts` (`.agents/.qa-evidence.json`) exigiendo en `certify_11x_gate` (`lint_evidence_verified`) evidencia vigente de `run_ephemeral_qa(stage="lint")` cuando existen cambios de código en Git sin penalizar el Fast-Path `DOCS_ONLY`; ampliado `run_ephemeral_qa` con los stages `migration`, `integration` y `ci`; y normalizados los sufijos dinámicos de query (`` `/routers${query}` ``) y subrutas interpoladas (`` `/bridge/${subPath}` ``, `{path:path}`) en `certify-gate.ts` y `.agents/scripts/verify_no_orphan_api_endpoints.py`.
* **Invariantes Python / PostgreSQL 15–17+ (`QA-MYPY-01`, `QA-PG17-RLS` y `QA-COV-01` `importlib`) en Skills, Plantillas y SAST:** Estandarizados `mypy --strict --cache-dir=/tmp/mypy src/`, `--import-mode=importlib` + `PYTHONPATH=/app/src` sobre suites `*.unit.py`/`*.int.py`, los targets efímeros `qa-integration`/`qa-ci` en `fastapi/Makefile.example` y `python/Makefile.example`, y la auditoría de `FORCE ROW LEVEL SECURITY` sobre `pg_catalog.pg_class.relforcerowsecurity` (`JOIN pg_namespace`, bloqueando `pg_tables.forcerowsecurity` en `security-auditor.ts`), certificado con 313 pruebas Vitest (`99.22%` líneas / `95.09%` ramas), 54 pruebas Pytest y 21 escenarios Karate BDD.

---

## [2.16.0] - 2026-11-10

### 🛡️ Evolución QA 11X v2.16.0 (Added, Changed & Fixed)
* **Núcleo MCP `v2.16.0`, Regla `SEC-16` (Continuidad Pre-Auth Multi-Etapa), Contrato Thin-Repo y Convergencia de Gates 10/10:** Añadida la regla estática `SEC-16` en `security-auditor.ts` (asimetría de interceptores HTTP `401` en `PREAUTH_PUBLIC_ROUTES` y consumo no atómico `.get()` sin `GETDEL`/Lua en challenges efímeros), inmunidad ante auto-escaneo y soporte `.html`; implementado contrato *Thin-Repo* por defecto en `bootstrap_or_merge_11x` y `install-skill --target all`, fusión YAML de `lefthook.yml`, protección de bloques fenced en `reconcile-agents`, CLI `--version`, *Zero Hardcoded Pass* en `parseCoverage`/`audit_test_pyramid_gaps`, paridad 10/10 entre `certify_11x_gate` y `.agents/scripts/certify_task_completion.sh`, endurecimiento de `verificar-secretos.sh`/`.env` (`0600`) y pipeline CI efímero en Docker (307 tests Vitest `>= 95%`, 20 escenarios Karate BDD y suites Pytest/BATS).
* **Reparación Integral de los 7 Stacks Corporativos, Hooks POSIX Rule-Zero y Smoke Test de Hidratación:** Actualizados `vue3` y `react-frontend` (`playwright:v1.52.0-noble`, `vitest/config`, `lighthouserc.cjs`, `nginx/default.conf`, `qa-orphans` y 5 escenarios Karate UI), `python` y `fastapi` (`UV_CACHE_DIR=/tmp/uv-cache`, `pip-audit`, Radon Grado A, rol PostgreSQL `app_user` `NOBYPASSRLS` y `locustfile.py` con `Idempotency-Key`), `php` (PHP 8.4/8.5 `php.ini` sin directivas deprecadas, `karatelabs:1.5.1`, Pumba acotado + Prometheus), `node-backend` y `bash-scripts` (`kcov --fail-under-percent=95` con `SYS_PTRACE`), eliminados los daemons `graphify:8080` de todos los `docker-compose.qa.yml`, endurecidos `instalar-hooks.sh`, `lefthook.yml`, `limpieza.sh`, `install-skill.sh` y `actualizar-grafos-graphify.sh`, y añadida suite `tests/test_stacks_hydration_smoke.unit.py`.
* **Presupuesto Cognitivo `SKILL.md < 20 KB`, Regla Anti-Ceguera UAT #8 y Verificador Documental (`verify_docs_invariants.py`):** Compactado `.agents/skills/qa-11x-architect/SKILL.md` de `31.6 KB` a `17.5 KB` (`< 20 KB`) y `.agents/ACTIVE_TASK.md.example` a `24` líneas (`<= 40`), incorporada la Regla #8 de continuidad Pre-Auth con controles compensatorios STIG/OWASP en `02-security-disa-owasp-22.md` y `SECURITY.md` §4.20, sincronizados los 9 recursos, 12 tools y 23 archivos de skills en toda la documentación en español, e integrado `.agents/scripts/verify_docs_invariants.py` en la compuerta 10/10.

---

## [2.15.1] - 2026-11-09

### 📦 Empaquetado NPM y Documentación (`@sinfallas/mcp-qa-11x`)
* **Metadatos Completos para `npmjs.com` en `mcp-server/package.json` y Sincronización Integral de `mcp-server/README.md`:** Añadidos `homepage` (`https://github.com/tecno-consultores/qa-testing-blueprints`), `repository` (`git+https://github.com/tecno-consultores/qa-testing-blueprints.git`, `directory: "mcp-server"`), `bugs` y `keywords` en `mcp-server/package.json`; actualizado `mcp-server/README.md` con enlaces absolutos a GitHub (cero enlaces relativos rotos en npmjs), tabla de los 7 stacks soportados, catálogo de las 5 skills corporativas, los 9 recursos `blueprint://*` y las 12 herramientas MCP (incluyendo navegación AST bidireccional en modo `Code Q&A`).

---

## [2.15.0] - 2026-11-09

### 🚀 Mejorado (Changed & Added)
* **Navegación AST Bidireccional (`Graphify AST-First`) en Consultas de Código (`Code Q&A`) y Pre-Cambio (`inspect_blast_radius.py`, `blast-radius.ts` y `graphify-ast-navigator`):** Ampliados `.agents/scripts/inspect_blast_radius.py` y `inspect_ast_blast_radius` (`mcp-server`) para reportar la ubicación declarativa exacta (`file:L<line>`), llamadores entrantes (`⬅️`), dependencias salientes (`➡️ outgoing_dependencies`) y `graph_reports` (`GRAPH_REPORT.md`), haciendo obligatorio consultar primero el grafo de Graphify (y crearlo si no existe) ante cualquier pregunta sobre el código o arquitectura de un proyecto antes de usar `grep` o `read_file`.
* **Desduplicación Ultra-Compacta de `~/.gemini/GEMINI.md` frente a la Instalación Global del MCP y Skills (`buildGlobalGeminiBlock` en `init-agents-md.ts`):** Sustituido el bloque conector redundante en `syncGlobalGeminiMd()` por un puntero ligero libre de duplicación que delega los 11 pasos y reglas al servidor MCP (`@sinfallas/mcp-qa-11x`) y a las 5 skills instaladas globalmente (`~/.gemini/config/skills/`), ahorrando ~70% de tokens en el prompt global.

---

## [2.14.1] - 2026-11-09

### 📄 Gobernanza y Legal
* **Atribución Oficial de Autoría y Copyright (`LICENSE`, `package.json`, `README.md` y Cabeceras SPDX):** Estandarizado el aviso legal en todo el repositorio como `Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)`.

---

## [2.14.0] - 2026-11-09

### 🛡️ Evolución Empírica QA 11X (Added, Changed & Fixed)
* **Invariante PostgreSQL RLS Multi-Transacción (`after_begin`) y Rol `NOSUPERUSER NOBYPASSRLS` (`SEC-13` y `blueprint://database/postgres-rls-worm`):** Incorporado el recurso MCP `blueprint://database/postgres-rls-worm`, el patrón canónico en `08-postgres-rls-zero-downtime-migrations.md` (con `session.sync_session.info`, `@event.listens_for(AsyncSession.sync_session_class, "after_begin")`, rol `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` y funciones `SECURITY DEFINER` `SET search_path = public` para login por `slug`/bootstrap) y la regla estática `SEC-13` en `audit_security_stig_owasp`.
* **Cadena Forense WORM Determinista bajo Concurrencia (`seq_num BIGINT` + `pg_advisory_xact_lock`, `SEC-14`):** Documentada y auditada mediante `SEC-14` la prohibición de ordenar `audit_logs` (`prev_record_hash`) únicamente por `created_at DESC`, exigiendo secuencia monotónica (`seq_num`), bloqueo transaccional `SELECT pg_advisory_xact_lock(hashtext(tenant_key))`, seguimiento en sesión (`_rg_in_tx_audit_hash` / `_in_tx_audit_hash`) y `await session.flush()`.
* **Cobertura en Contenedores Efímeros No-Root (`COVERAGE_FILE=/tmp/.coverage`, `QA-COV-01` y `SurgicalMerger`):** Añadido `-e COVERAGE_FILE=/tmp/.coverage` en `fastapi/` y `python/`, inyección quirúrgica automática de `-e COVERAGE_FILE=/tmp/.coverage` y `--cov=src --cov-fail-under=95` en `SurgicalMerger.mergeMakefile` (`bootstrap_or_merge_11x`), y regla `QA-COV-01` para bloquear `pytest -o addopts=""` sin `--cov`.
* **Soporte Nativo de Monorepos (`fastapi/` + `vue3/`), Exclusión de `.env.example` en `certify_11x_gate` y Precisión en `SEC-11`:** Excluido `.env.example` de `zero_unmerged_examples`, añadido soporte de `fastapi/migrations/versions` y `backend/migrations/versions` en `orm_alembic_parity`, resolución de `TESTING.md`/`CHANGELOG.md`/`ACTIVE_TASK.md` en `../` para sub-stacks, y distinción en `SEC-11` entre tests reales de `write_audit_log` (`record_sha256_hash` / `prev_record_hash`) y mocks ciegos.
* **Sincronización de Singleton `Settings` en Smoke Tests (`QA-SMOKE-01`) y Propagación de Credenciales Efímeras en Pipelines Docker (`SEC-15`):** Actualizados `qa-11x-architect/SKILL.md`, `03-stack-python-fastapi.md`, la plantilla `fastapi/test/test_production_no_dev_cleanliness.unit.py.example` y el auditor `security-auditor.ts` para exigir la sincronización en memoria del singleton `settings` (`settings.APP_ENV = "production"` / `settings.ROSGRID_ENV = "production"` con restauración en `finally`) tras importaciones recursivas y la propagación explícita `docker exec -e <PASS_ENV_VAR>="${LOCAL_ADMIN_PASS}"` junto con llaves efímeras `openssl rand` (`>= 32` bytes) en scripts locales de validación productiva (`probar-prod-local.sh` / `build.sh`).

---

## [2.13.0] - 2026-11-09

### 🔒 Seguridad, Calidad 11X y Correcciones (Security, Added & Fixed)
* **Mitigación `CWE-78`/`CWE-22`, Resiliencia HTTP y Hardening de Contenedores (`mcp-server` y `docker-compose.qa.yml`):** Sustituido `execSync` por `execFileSync` con argumentos posicionales en `executeAlpineFallback`; añadido confinamiento `resolveSafeChildPath`/`assertSafeRelativePath` y anti-*prototype pollution* (`__proto__`), `AbortSignal.timeout(15000)`, reintento ante `HTTP 304` sin caché local y respaldos `.bak`; y endurecidos los 7 archivos `docker-compose.qa.yml` con versiones de imágenes fijadas (cero `:latest`), `healthcheck` con `condition: service_healthy`, remoción de `user: root` en `zap` y de `SYS_PTRACE`/`seccomp:unconfined` en servicios `api`.
* **Invariante *Zero Hardcoded Pass* (Regla UAT #6) y Erradicación de Garantías Falsas en Compuertas y AST:** Implementado `checkZeroOrphanApiEndpoints` real en `certify-gate.ts`; retornado `status: 'SKIPPED'` con `coverage.detected: false` en `run_ephemeral_qa` (`skip_if_docs_only`); reforzado el fallo bloqueante `exit 1` en la compuerta `[10/10]` de `certify_task_completion.sh`; y añadida deduplicación de `graph.json`, modo *Fail-Secure*, umbral `LOW < 5`, exclusión de archivo declarante y verificación SPDX en `blast-radius.ts`, `verify_topological_health.py` e `inspect_blast_radius.py`.
* **Reparación Funcional de Plantillas de los 7 Stacks y Suites Unitarias 1:1 en `mcp-server`:** Añadidos `type-check`, `--all-extras`, alineación `requires-python >= 3.13` / `mutmut < 3.0.0`, ejecución de `qa-migration` y `qa-orphans` dentro de Docker (**Rule Zero**), escenario Read-After-Write real en `fastapi/test/api_test.feature`, selectores XPath válidos en `react-frontend`, servidor embebido `:8000` + `zap`/`pumba` en `php`, `globstar` y montaje `/repo` en `bash-scripts`, `thresholds.break: 80` en Stryker, lectura dinámica de `MCP_SERVER_VERSION` desde `package.json`, `includeContent = false` por defecto en `fetch-bundle.ts` y 15 suites unitarias (`291 passed`, `99.09%` cobertura).
* **Sincronización de Gobernanza, `manifest.json` (`127 archivos`) y Pipeline CI (`.github/workflows/qa-11x-ci.yml`):** Corregidos los enlaces relativos y el catálogo de 5 skills en `AGENTS.md`, `FAQ.md` (`12 herramientas MCP` y ZAP sin root), `docs/ai-integration.md` (`SEC-01..SEC-12` + `QA-KARATE-IDEMP`), `.agents/README.md` y `lefthook.yml`; indexados `scripts/generar-sbom-cyclonedx.sh` y `.agents/README.md` en `scripts/generar-manifiesto.py`; y creado el workflow de integración continua `.github/workflows/qa-11x-ci.yml`.

---

## [2.12.0] - 2026-11-08

### 🛡️ Añadido y Mejorado (Added & Changed)
* **Mejoras en Herramientas MCP (`inspect_ast_blast_radius`, `certify_11x_gate`, `audit_security_stig_owasp`) y Referencias Bajo Demanda (`07..09`):** Añadido soporte `auto_build_if_missing` y `refresh_graph` en `blast-radius.ts`; validación de cabeceras duplicadas en `CHANGELOG.md`, presupuesto `<= 40` líneas en `ACTIVE_TASK.md` y topología AST (`ast_topology_clean`) en `certify-gate.ts`; reglas estáticas `QA-KARATE-IDEMP` y `SEC-12` en `security-auditor.ts`; y módulos bajo demanda `07-mcp-agentic-security-governance.md`, `08-postgres-rls-zero-downtime-migrations.md` y `09-sre-observability-chaos-triage.md` (0 tokens de sobrecarga en prompt inicial).
* **Evolución del Catálogo de 5 Skills Corporativas (`qa-11x-architect`, `graphify-ast-navigator`, `docker-trivy-keydb-hardening`, `qa-11x-docker-certifier`, `refactoring-ui`):** Documentados los 4 pilares estratégicos y ciclo de vida completo de creación/consulta de grafos AST; `read_only: true`, guarda OOM (80% RAM) y bloqueo de `FLUSHALL`/`DEBUG` en KeyDB; ejecución incremental `perTest` en Mutation Testing; y criterios WCAG 2.2 AA (`SC 2.5.8`, `SC 2.4.11`), `INP < 200ms` y preparación del Accessibility Tree para agentes IA.
* **Defensa RBAC en Capa de Servicio (Anti-`Depends()` Bypass en FastAPI/MCP) e Higiene Concisa de `CHANGELOG.md`:** Exigida validación explícita de `claims["role"]` / `claims["rol"]` en la capa de servicio para llamadas internas JSON-RPC/MCP, compuerta `ApprovalRequest` (`AWAITING_APPROVAL`) en herramientas mutables, y formato ejecutivo conciso de 1–2 líneas por cambio sin cabeceras duplicadas en `CHANGELOG.md`.
* **Invariante de UUID Dinámico (`java.util.UUID.randomUUID() + ''`) para `Idempotency-Key` en Karate Labs BDD:** Actualizada la plantilla `fastapi/test/api_test.feature` y la Ley 6 de `qa-11x-architect` para inyectar UUIDs dinámicos en peticiones mutables (`POST`/`PUT`/`PATCH`/`DELETE`), evitando colisiones `409`/`422` en re-ejecuciones contra KeyDB/Redis vivo.
* **Invariante Anti-Mock Blindness para Serialización `JSONB` y `Numeric(p, s)` (`decimal.Decimal`) en `MockDbSession`:** Incorporada directiva obligatoria que exige validar columnas SQLAlchemy `JSON`/`JSONB` con `json.dumps()` sin `default=str` en sesiones mock y poblar fixtures `Numeric` con `decimal.Decimal` para atrapar fallos de serialización antes de producción.

---

## [2.11.1] - 2026-11-07

### 🐛 Corregido (Fixed)
* **Arquitectura Thin-Repo Global en `install-skill` y `reconcile-agents`:** Instalación exclusiva de las 5 skills corporativas en la configuración global del usuario (`~/.gemini`, `~/.claude`, `~/.cursor`, `~/.hermes`) sin duplicarlas ni copiar los 7 archivos `.agents/rules/*.md` dentro de proyectos consumidores, extrayendo reglas locales de negocio hacia `.agents/rules/domain_<project>_rules.md` con respaldo en `.agents/backups/`.
* **Protección Anti-Contaminación de `$HOME` y Resiliencia CDN:** Bloqueada la creación accidental de `~/.agents/skills` o archivos de proyecto al ejecutar `install-skill` desde `$HOME`, y sanitizada la verificación de versión publicada en `scripts/publicar-mcp.sh` frente a avisos de `npm notice`.

---

## [2.11.0] - 2026-11-07

### 🚀 Añadido y Mejorado (Added & Changed)
* **Optimización Extrema de Tokens en Servidor MCP (`@sinfallas/mcp-qa-11x`):** Incorporado modo *Metadata-Only* (`include_content: false` por defecto en `fetch_blueprint_bundle`, ahorrando ~50,000 tokens por llamada), agrupación de hallazgos por regla (`groupFindingsByRule` y `max_findings: 25`) en `audit_security_stig_owasp`, y truncado `max_items: 20` con conteos totales intactos en `audit_test_pyramid_gaps` e `inspect_ast_blast_radius`.
* **Protocolo *High-IQ Token Economy* (6 Estrategias), *3-Tier Progressive Disclosure* y 3 Vías Proporcionales (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`):** Compactada `qa-11x-architect/SKILL.md` en un ~33% adicional e introducida la vía quirúrgica `MICRO_CHANGE` (`<= 3` archivos, radio AST `LOW` `< 5` llamadores) junto con las 6 invariantes cognitivas de ahorro de contexto en `AGENTS.md` y `.agents/rules/`.

---

## [2.10.1] - 2026-11-05

### 🚀 Añadido y Mejorado (Added & Changed)
* **Separación de Timeouts en Transferencias Pesadas (`>= 180s` + Purga `0 bytes`) y Validación por Ítem en Batch `HTTP 200 OK`:** Incorporada la 5.ª regla UAT Anti-Blindness exigiendo timeouts explícitos `>= 180s` y limpieza de archivos truncados en descargas binarias/firmware síncronas, así como inspección individual de `results[].status` en endpoints por lotes.
* **Guía de Actualización y Verificación Criptográfica del MCP en IDEs:** Documentado en `README.md`, `docs/ai-integration.md` y `FAQ.md` el protocolo de 3 pasos para purgar cachés locales y verificar por SHA-256 la sincronía de skills y servidor MCP.

---

## [2.10.0] - 2026-11-05

### 🚀 Añadido y Mejorado (Added & Changed)
* **Fast-Path Documental (`DOCS_ONLY`), Extracción AST Incremental y Caché SHA-256 en Trivy:** Añadida detección automática `skip_if_docs_only` en `run_ephemeral_qa` y `certify_task_completion.sh`, actualización incremental por stack en `scripts/actualizar-grafos-graphify.sh` con salida de 1 línea (*Pass-Quiet*), y caché criptográfica de manifiestos/lockfiles en `scripts/auditar-infra.sh`.
* **Reconciliación Automática de Gobernanza (`reconcile_agents_governance` / `reconcile-agents`):** Incorporada la Tool 12 del MCP para podar directivas promovidas duplicadas en proyectos consumidores, aislar reglas de dominio en `domain_<project>_rules.md`, sincronizar `~/.gemini/GEMINI.md` e inyectar el recordatorio de Post-Mortem de escapes QA.
* **Auditores Automáticos Anti-Silo, Ciclo Temporal de 3 Fases (`Programada`, `En Curso`, `Expirada`), Anti-UUID (`SEC-11`) y Refresco Dual (`UI-11X-02`):** Ampliados `security-auditor.ts` y `test-pyramid-auditor.ts` para bloquear `claims.get("sub")` crudos en `actor_username`, mocks ciegos en `write_audit_log`, cláusulas `else` genéricas de dominio y vistas operativas sin refresco dual (`setInterval` + botón `[ 🔄 Refrescar ]`).
* **Matriz de Herramientas de 15 Columnas, Tags Oficiales de Docker Hub y Corrección de Diagramas Mermaid:** Restaurada la matriz comparativa en `README.md`, actualizados los tags de `sinfallas/base-python-uv` (`3.11`–`3.15`), `sinfallas/basephpcomposer` (`8.2`–`8.5`) y `sinfallas/base-node-ionic` (`22`–`26`), y saneados todos los diagramas Mermaid y fórmulas MathJax del repositorio.

---

## [2.9.1] - 2026-11-03

### 🔄 Modificado y Mejorado (Changed & Fixed)
* **Patrón *Pass-Quiet / Fail-Verbose* con Telemetría de 1 Línea (Ahorro de 65%–85% en Tokens):** Compactada la salida exitosa de `scripts/*`, `.agents/scripts/*.py`, `Makefile` y respuestas JSON del servidor MCP, mostrando volcados detallados únicamente cuando ocurre un fallo.
* **Estandarización de `@latest`, `--init-agents` e `--include-scripts`:** Unificados todos los comandos de instalación y configuración MCP en la documentación y añadido soporte de detección para `~/.gemini/config/mcp_config.json`.

---

## [2.9.0] - 2026-11-03

### 🚀 Añadido (Added)
* **Ecosistema Canónico PHP 8.2–8.5 (`sinfallas/basephpcomposer`):** Añadido el stack `php/` con 10 plantillas Nivel 11X (Pest/PHPUnit + PCOV `>= 95%`, PHPStan Level Max, Psalm `--taint-analysis`, Infection `MSI >= 80%`, Karate BDD), fusión quirúrgica de `composer.json` y soporte completo en los auditores del servidor MCP.
* **PRs de Evolución Continua Zero-Trust (`propose_skill_evolution_pr`) y Diagnóstico de Navegador Real:** Incorporada la Tool 11 del MCP (creación de PR vía `gh` CLI o fallback local en `.agents/proposals/<slug>.md` con URL prellenada) y el detector `browser_testing_readiness` (Playwright, `@axe-core`, Lighthouse CI y MCP de navegador).
* **Inyector Aditivo No Destructivo de `AGENTS.md` (`init_or_append_agents_md`), Autodetección Multi-Agente (`auto`) y Auditor de Pirámide (`audit_test_pyramid_gaps`):** Añadidas las Tools 9 y 10 del MCP, instalación automática de las 5 skills corporativas y `--include-scripts`, e inventario de brechas en las 13 capas de calidad con plan de rescate priorizado.

---

## [2.8.3] - 2026-11-02

### 🐛 Corregido y Mejorado (Fixed & Changed)
* **Soporte Interactivo 2FA / WebAuthn y `--otp` en `scripts/publicar-mcp.sh`:** Añadida detección de TTY interactivo (`-it`), flag `--otp` / `NPM_OTP` y normalización de la ruta `bin["mcp-qa-11x"]` en `mcp-server/package.json`.

---

## [2.8.2] - 2026-11-02

### 🚀 Añadido y Mejorado (Added & Changed)
* **Propagación Global de `--max-warnings 0` y Aislamiento Hermético de Red:** Estandarizado `--max-warnings 0` en todas las plantillas de stacks y en el fusionador quirúrgico `surgical-merger.ts`, formalizando los invariantes de cero advertencias y bloqueo de red externa en pruebas unitarias.

---

## [2.8.1] - 2026-11-02

### 🐛 Corregido (Fixed)
* **Erradicación de Advertencias ESLint/SonarJS y Fugas de Red en `mcp-server`:** Aplicado `--max-warnings 0`, deduplicación de constantes literales e intercepción determinista de `globalThis.fetch` en pruebas offline.

---

## [2.8.0] - 2026-11-02

### 🚀 Añadido y Mejorado (Added & Changed)
* **Servidor MCP `@sinfallas/mcp-qa-11x` (Tools 1–8 y Resources `blueprint://*`) y Skill Maestra `qa-11x-architect`:** Implementado el servidor MCP en Node.js/TypeScript con hidratación remota verificada por SHA-256 (`manifest.json`), fusión quirúrgica no destructiva, parsers ahorradores de tokens, auditor estático DISA STIG/OWASP, ejecutor Docker efímero (`run_ephemeral_qa`), limpiador (`clean_workspace_11x`) y compuerta `certify_11x_gate`.
* **Skill `refactoring-ui`, Validadores de Paridad API/ORM/Roadmap y Publicación Autónoma Local:** Incorporada la skill `refactoring-ui` (con 9 referencias modulares), los validadores `verify_no_orphan_api_endpoints.py` y `verify_roadmap_consistency.py`, el script universal `scripts/limpieza.sh` (con fallback Alpine sin `sudo`), y `scripts/publicar-mcp.sh` (eliminando `.github/` y runners externos de terceros).

---

## [2.7.0] - 2026-11-02

### 🚀 Añadido y Modificado (Added & Changed)
* **Cumplimiento Normativo DISA ASD STIG V6R5 (286 Reglas) y OWASP Developer Guide v4.2 (22 Patrones Canónicos):** Incorporados los patrones 14 a 22 cubriendo límites de sesiones concurrentes, *idle timeouts* por rol (10m/15m), bloqueo tras 3 intentos fallidos con Argon2id en tiempo constante, canonicalización Unicode `NFKC`, prevención de XXE/deserialización insegura, validación de archivos por *Magic Bytes*, bitácoras de auditoría encadenadas con HMAC-SHA256 y alerta al 75% de capacidad, zeroización de secretos en memoria (FIPS 140-3), cabeceras OWASP OSHP, arranque *Fail-Secure* y generación de SBOM/CBOM CycloneDX.

---

## [2.6.0] - 2026-10-28

### 🚀 Añadido y Modificado (Added & Changed)
* **Gobernanza Multi-Agente (`.agents/`), Pirámide de 13 Capas y Manuales Corporativos (`docs/01..04`):** Creada la estructura `.agents/` (`rules/`, `skills/`, `scripts/`), la compuerta pre-commit `certify_task_completion.sh`, los validadores de paridad Alembic/ORM (`postgres:17-alpine`), cero componentes UI huérfanos, integridad JSON, radio de impacto AST (Graphify) y escaneo de secretos (`verificar-secretos.sh`), junto con el motor en memoria `eqalpha/keydb:alpine` y `zaproxy/zap-stable`.

---

## [2.5.0] - 2026-10-10

### 🚀 Añadido y Modificado (Added & Changed)
* **Volúmenes de Caché Persistente (`pnpm-store`, `uv-cache`), `Makefile.example` y `.npmrc` Zero-Trust:** Aceleración de ejecuciones efímeras en `docker-compose.qa.yml`, separación estricta de extensiones (`.unit.*` vs `.e2e.*`), envoltorios `Makefile` por stack y bloqueo de scripts post-instalación (`ignore-scripts=true`).

---

## [2.4.0] - 2026-10-08

### 🚀 Añadido y Modificado (Added & Changed)
* **Ecosistema React (`react-frontend/`) Nivel 11X:** Integración de plantillas para React + TypeScript + Vite con Vitest, React Testing Library (`>= 95%` cobertura), reglas estrictas de Hooks y pruebas E2E/BDD compartidas con Playwright, Lighthouse CI y Karate Labs.

---

## [2.3.1] - 2026-10-07

### 🔄 Modificado y Corregido (Changed & Fixed)
* **Estandarización de Guías Operativas (`README.md` por Stack) y Corrección de Red Pushgateway:** Renombradas las guías de cada stack a `README.md`, centralizada la bibliografía en `RESOURCES.md` y corregido el scraping de Prometheus/Pushgateway y apagado del perfil `--profile observability`.

---

## [2.3.0] - 2026-10-02

### 🚀 Añadido y Modificado (Added & Changed)
* **Observabilidad Universal RED (Prometheus & Pushgateway):** Incorporado el perfil `--profile observability` en todos los orquestadores `docker-compose.qa.yml` para recolectar métricas Rate, Errors y Duration antes y durante las pruebas de Ingeniería del Caos.

---

## [2.2.0] - 2026-10-02

### 🚀 Añadido y Modificado (Added & Changed)
* **Integración de Grafos Semánticos AST (`sinfallas/remote-graphify:latest`) y Bitácora `TESTING.md`:** Añadido soporte de extracción de grafos de código para comprimir el contexto de agentes IA, obligatoriedad de mantener `TESTING.md` y estandarización de redes bridge IPv4 en Docker Compose.

---

## [2.1.0] - 2026-10-02

### 🚀 Añadido y Modificado (Added & Changed)
* **Seguridad Dinámica (OWASP ZAP) e Ingeniería del Caos (`Pumba` + `Locust` / `Artillery`):** Incorporado el perfil `--profile chaos` para inyección de fallos de red y pruebas DAST sobre aplicaciones vivas en contenedores efímeros.

---

## [2.0.0] - 2026-10-01

### 🚀 Añadido y Modificado (Added & Changed)
* **Complejidad Ciclomática Grado A (`Radon` / `SonarJS`), Profiling (`py-spy` / `clinic.js`), Accesibilidad WCAG (`@axe-core` + `Lighthouse CI`) y Auditoría `Trivy` + `Lefthook`:** Elevación del estándar a 11X exigiendo aislamiento de red en pruebas unitarias (`pytest-mock` / `nock`), pre-commit hooks y escaneo IaC/CVE.

---

## [1.0.0] - 2026-05-15

### 🚀 Añadido (Added)
* **Lanzamiento Inicial de QA Testing Blueprints (Regla Cero):** Arquitectura base de pruebas 100% en contenedores Docker efímeros (`sinfallas/*`) con cobertura mínima del `95%` (`pytest-cov`, `Vitest`, `kcov`), pruebas de mutación (`Mutmut`, `Stryker`) y escenarios BDD en `Karate Labs`.
