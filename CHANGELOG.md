# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### 🔒 Seguridad y Correcciones (Security & Fixed)
* **Fase 1 Auditoría v2.12.0 — Mitigación `CWE-78`/`CWE-22`, Resiliencia HTTP y Hooks (`clean-workspace`, `github-fetcher`, `surgical-merger`, `install-skill`, `blueprint-resources`, `lefthook.yml`):** Sustituido `execSync` por `execFileSync` con arreglo de argumentos posicionales y `chown` acotado en `executeAlpineFallback`; aislados `reports/` y `prometheus_data/` bajo `deep_prune: true`; incorporado confinamiento `resolveSafeChildPath`/`assertSafeRelativePath` y anti-*prototype pollution* (`__proto__`), `AbortSignal.timeout(15000)`, reintento automático ante `HTTP 304` sin caché local y respaldo `.bak` de scripts modificados; y corregida la ruta `./scripts/auditar-infra.sh` junto con el hook `php-lint` en `lefthook.yml`.
* **Fase 2 Auditoría v2.12.0 — Erradicación de Garantías Falsas (*Zero Hardcoded Pass* en `certify-gate`, `ephemeral-runner`, `certify_task_completion.sh`, `verify_topological_health.py` e `inspect_blast_radius.py`):** Implementada la validación real `checkZeroOrphanApiEndpoints` en `certify-gate.ts` (sustituyendo el literal `true`); retornado `status: 'SKIPPED'` con `coverage.detected: false` y filtrado de extensiones documentales en `run_ephemeral_qa` (`skip_if_docs_only`); reforzada la compuerta `[10/10]` con fallo bloqueante `exit 1`, ejecución con `bash` resiliente a pérdida de bit `+x` y regex `CODE_CHANGES` ampliada en `certify_task_completion.sh`; y añadida deduplicación de `graph.json`, modo *Fail-Secure* ante grafos corruptos y guarda contra `label: null`.
* **Fase 3 Auditoría v2.12.0 — Reparación de Plantillas de Stacks (`node-backend`, `python`, `fastapi`, `react-frontend`, `vue3`, `php`, `bash-scripts`):** Añadidos script `type-check` y `working_dir: /app` en `node-backend`; incorporado `--all-extras`, alineación `requires-python >= 3.13` / `mutmut < 3.0.0`, ejecución de `qa-migration` y `qa-orphans` dentro de Docker (**Rule Zero**), eliminación de `|| true` en `qa-dast`, y escenario Read-After-Write real con `newIdempotencyKey()` en `fastapi/test/api_test.feature`; corregida la lectura `System.getenv` y localizadores XPath sin `:contains()` en `react-frontend` y `php`; habilitado el servidor embebido `:8000` y contenedores reales `zap`/`pumba` en `php`; activado `globstar` y montaje `/repo` en `bash-scripts`; y purgado el volcado residual `vue3/changelog`.
* **Fase 4 Auditoría v2.12.0 — Hardening Docker, Stryker (`thresholds.break`), Trivy/Commitlint y Precisión de `inspect_ast_blast_radius`:** Endurecidos los 7 archivos `docker-compose.qa.yml` con versiones de imágenes fijadas (cero `:latest`), `pull_policy: if_not_present`, `healthcheck` con `condition: service_healthy`, remoción de `user: root` en `zap` y de `SYS_PTRACE`/`seccomp:unconfined` en servicios `api`, y resolución del conflicto de puerto `8085:8080` en `graphify` (`vue3`/`react-frontend`); añadidos `thresholds: { high: 90, low: 80, break: 80 }` en Stryker, fijación de `@playwright/test: 1.43.0`, exclusión `php/docker-compose.qa.yml` en `.trivy.yaml` y nuevos scopes en `commitlint.config.js`; y alineado el umbral `LOW < 5`, deduplicación de rutas AST/Grep, exclusión de archivo declarante, regex `\b` y verificación de cabecera SPDX en `blast-radius.ts`.
* **Fase 5 Auditoría v2.12.0 — Deuda Técnica, Versión Dinámica y Suites Unitarias 1:1 en `mcp-server`:** Entrecomillados los globs de ESLint en `mcp-server/package.json` y refactorizado `MARKDOWN_MIME_TYPE` en `server.ts`; eliminadas las versiones hardcodeadas leyendo `MCP_SERVER_VERSION` dinámicamente desde `package.json` en `github-fetcher.ts`, `server.ts` y `mcp_cli_test.feature`; alineado el parámetro por defecto `includeContent = false` en `fetch-bundle.ts` con `FetchBundleInputSchema`; e incorporadas las suites unitarias dedicadas `fetch-bundle.unit.ts` y `bootstrap-merge.unit.ts` (15 suites, `291 passed`).
* **Fases 6 y 7 Auditoría v2.12.0 — Gobernanza, Regla *Zero Hardcoded Pass*, `manifest.json` y Pipeline CI (`.github/workflows/qa-11x-ci.yml`):** Promovida la invariante *Zero Hardcoded Pass* (Regla UAT #6) en `mandatory_qa_pyramid_and_doc_sync.md` y `qa-11x-architect/SKILL.md`; corregidos los 8 enlaces relativos y el catálogo completo de 5 skills en `AGENTS.md`, `FAQ.md` (`12 herramientas MCP` y ZAP sin root), `docs/ai-integration.md` (`SEC-01..SEC-12` + `QA-KARATE-IDEMP`) y `.agents/README.md`; añadida cabecera SPDX y `API_BASE_URL` en `node-backend/test/node_api.feature`; indexados `scripts/generar-sbom-cyclonedx.sh` y `.agents/README.md` en `scripts/generar-manifiesto.py`; y creado el workflow `.github/workflows/qa-11x-ci.yml`.

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
