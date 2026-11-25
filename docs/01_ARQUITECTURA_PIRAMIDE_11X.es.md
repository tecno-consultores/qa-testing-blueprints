> 🌐 **Idioma:** [🇺🇸 English (Canonical)](01_ARQUITECTURA_PIRAMIDE_11X.md) · **Español (Espejo 1:1)**

# 🏛️ Arquitectura de la Pirámide de Calidad QA-11X v3.8 (13 Capas + Transversales Agénticos)

> **PROPÓSITO:** Documento arquitectónico maestro en español corporativo que define las **13 capas de calidad**, los **planos transversales agénticos y de seguridad** de **QA-11X v3.8**, los **3 niveles progresivos de adopción** (`starter`, `standard`, `enterprise`) y las **3 vías proporcionales de ejecución** (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`).

---

## 1. Adopción Proporcional en 3 Vías y 3 Perfiles

Para evitar sobreingeniería en tareas pequeñas sin relajar los controles en sistemas críticos, QA-11X v3.8 separa el **nivel de adopción del repositorio** de la **vía de ejecución por cambio**:

| Dimensión | Clasificación | Criterio de Activación | Alcance de Validación |
| :--- | :--- | :--- | :--- |
| **Perfil** | **`starter`** | Inicio rápido en 30s (`quickstart`) | Secretos = 0, contenedores no-root (`Rule Zero`), `.qa-11x.json`, conector `AGENTS.md` (28 agentes) |
| **Perfil** | **`standard`** | PRs diarios de equipos productivos | `starter` + cobertura `>= 95%`, tipado estricto (`mypy --strict`, `tsc`, `PHPStan max`), partición AST CI (`40%–60%` ahorro) y linter de antipatrones UI |
| **Perfil** | **`enterprise`** | Sistemas regulados o multi-tenant | Pirámide completa de 13 capas + FINOS CALM, PostgreSQL 17 RLS + WORM, DISA STIG V6R5, Pact + k6, AI Evals y Release Readiness Gate |
| **Vía** | **`DOCS_ONLY`** | Cambios exclusivos en documentación humana `*.md` o `docs/` (excluye `.agents/{skills,rules,schemas}/`) | `0` contenedores QA, `0` reconstrucciones AST; sincroniza manifiesto/docs y certifica `make lint-docs && make certify` |
| **Vía** | **`MICRO_CHANGE`** | `<= 3` archivos, `0` rutas/ORM nuevos, Blast Radius `LOW` (`< 5` llamadores) | Suite unitaria/contrato focalizada del stack + co-evolución `QA-TEST-SYNC-01` + actualización incremental AST |
| **Vía** | **`FULL_11X`** | `> 3` archivos, nuevas APIs/Vistas, ORM, seguridad o Blast Radius `MEDIUM/HIGH` | Flujo integral de 11 pasos y 13 capas con cierre obligatorio en compuerta 10/10 |

### Regla Proporcional de BDD: Karate Labs vs. Runners Nativos sin JVM

* **Karate Labs obligatorio (`sinfallas/karatelabs`):** Requerido en aplicaciones `FULL_11X` multi-servicio, con persistencia transaccional real, flujos RBAC multi-rol o contratos HTTP/Edge/OSHP/SSG sobre Nginx (`fastapi/test/`, `vue3/test/`, `mcp-server/test/`).
* **Runners nativos sin JVM autorizados:** En microservicios ligeros (`<= 3` endpoints), librerías aisladas o CLIs sin estado complejo, se autorizan contratos **Consumer-Driven Pact** (`pact-python`, `@pact-foundation/pact`), `pytest + httpx` o `vitest` / Playwright API para evitar la sobrecarga de JVM manteniendo idempotencia (`Idempotency-Key`) y fixtures trimodales.

---

## 2. Topología de la Pirámide QA-11X v3.8 (13 Capas + Transversales)

```mermaid
flowchart TD
    L01["L01-L02: Estático/SAST/Trivy + Tipado Estricto y CC <= 5"] --> L03["L03-L04: Unitarias >= 95% + Paridad DB/ORM"]
    L03 --> L05["L05-L07: Pact V4/OpenAPI + Karate API + Karate UI/OSHP"]
    L05 --> L08["L08-L09: Mutación MSI >= 80% + Playwright WCAG/Geometría/Lighthouse"]
    L08 --> L10["L10-L12: Carga k6/Locust + DAST ZAP + Caos Pumba/Prometheus RED"]
    L10 --> L13["L13: Fixtures Trimodales + Ciclo 3 Fases + Invariantes Negativos"]
    L13 --> Transversal["Meta-Compuertas Transversales: AST/CALM + AI Evals + Vibe-Rescue + TMS/Release Gate"]
    Transversal --> Closure["Compuerta 10/10 + Commit Local QA-GIT-GATE-01"]
```

### Desglose de las 13 Capas y Meta-Compuertas Transversales

| Capa / Meta-Compuerta | Responsabilidad Principal | Artefactos e Implementación en el Monorepo |
| :--- | :--- | :--- |
| **L01** | Análisis estático, linters (`--max-warnings 0`), secretos, SBOM CycloneDX y Trivy `HIGH/CRITICAL = 0` | [`scripts/verificar-secretos.sh`](../scripts/verificar-secretos.sh), [`scripts/auditar-infra.sh`](../scripts/auditar-infra.sh), [`scripts/generar-sbom-cyclonedx.sh`](../scripts/generar-sbom-cyclonedx.sh) |
| **L02** | Tipado estricto (`mypy --strict`, `tsc`, `PHPStan max`) y Radon Grado A (`CC <= 5`) / SonarJS (`<= 15`) | [`fastapi/pyproject.toml.example`](../fastapi/pyproject.toml.example), [`mcp-server/eslint.config.mjs`](../mcp-server/eslint.config.mjs), [`php/phpstan.neon.example`](../php/phpstan.neon.example) |
| **L03** | Pruebas unitarias herméticas aisladas (`>= 95%` líneas/ramas/sentencias) | `pytest-cov`, `@vitest/coverage-v8`, `PCOV`, `BATS-core/kcov` |
| **L04** | Paridad real de esquemas BD y migraciones ORM en `postgres:17-alpine`, RLS + WORM `seq_num` | [`.agents/scripts/verify_alembic_orm_parity.py`](../.agents/scripts/verify_alembic_orm_parity.py), [`vibe-rescue/templates/rls_hardening.sql`](../vibe-rescue/templates/rls_hardening.sql) |
| **L05** | Contratos Consumer-Driven **Pact V4** y fuzzing OpenAPI (`Schemathesis`) | [`fastapi/tests/contracts/test_pact_consumer.py`](../fastapi/tests/contracts/test_pact_consumer.py), [`node-backend/tests/contracts/provider.pact.test.ts`](../node-backend/tests/contracts/provider.pact.test.ts) |
| **L06** | Contratos BDD API de caja negra (**Karate Labs API** con `Idempotency-Key` dinámico o runners nativos autorizados) | [`fastapi/test/api_test.feature`](../fastapi/test/api_test.feature), [`node-backend/test/node_api.feature`](../node-backend/test/node_api.feature), [`mcp-server/test/mcp_cli_test.feature`](../mcp-server/test/mcp_cli_test.feature) |
| **L07** | Contratos BDD UI HTTP/OSHP/SSG de caja negra (**Karate Labs UI** sin navegador headless + Refresco Dual) | [`vue3/test/ui_business_flow.feature`](../vue3/test/ui_business_flow.feature), [`react-frontend/test/ui_business_flow.feature`](../react-frontend/test/ui_business_flow.feature) |
| **L08** | Pruebas de mutación (`MSI >= 80%`, anti-falsos positivos) | `Mutmut`, `Stryker`, `Infection` |
| **L09** | **Playwright** Screenplay multi-rol + Self-Healing DOM, WCAG 2.1 AA, Lighthouse CI y linter UI (`QA-UI-ANTI-001..005`) | [`vue3/tests/screenplay/Actor.ts`](../vue3/tests/screenplay/Actor.ts), [`react-frontend/tests/utils/semanticLocator.ts`](../react-frontend/tests/utils/semanticLocator.ts), [`mobile-appium/tests/screenplay/MobileActor.ts`](../mobile-appium/tests/screenplay/MobileActor.ts), [`.agents/scripts/lint_test_antipatterns.py`](../.agents/scripts/lint_test_antipatterns.py) |
| **L10** | Pruebas de rendimiento, concurrencia y estrés (`grafana/k6:2.4.0` / `Locust` / `Artillery`) | [`fastapi/tests/load/smoke.k6.js`](../fastapi/tests/load/smoke.k6.js), [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md`](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md) |
| **L11** | Seguridad dinámica DAST (`OWASP ZAP`), cabeceras OSHP y pruebas Fail-Secure | [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md`](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md), [`SECURITY.es.md`](../SECURITY.es.md) |
| **L12** | Ingeniería del caos (`Pumba`) y telemetría RED pre-caos (`/metrics` en `Prometheus`) | [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md`](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md), [`fastapi/docker-compose.qa.yml`](../fastapi/docker-compose.qa.yml) |
| **L13** | Fixtures trimodales (`Virgin`/`Nominal`/`Degraded`), ciclo temporal de 3 fases, 10 Leyes Innegociables + 11 Reglas UAT Anti-Ceguera | [`.agents/rules/ground_truth_fixtures_and_negative_invariants.md`](../.agents/rules/ground_truth_fixtures_and_negative_invariants.md), [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md`](02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md) |
| **Transversal: AST, CALM y Compuerta 10/10** | **Arquitectura como Código FINOS CALM**, salud topológica AST, partición CI por Blast Radius y compuerta de 10 etapas | [`architecture/qa-11x.calm.json`](../architecture/qa-11x.calm.json), [`.agents/scripts/validate_calm_architecture.sh`](../.agents/scripts/validate_calm_architecture.sh), [`.agents/scripts/select_tests_by_blast_radius.py`](../.agents/scripts/select_tests_by_blast_radius.py), [`.github/workflows/ci-tiered-qa.yml`](../.github/workflows/ci-tiered-qa.yml) |
| **Transversal: AI Evals & Shield** | Modo 1 offline `$0` (`make test-ai-offline`), Modo 2 `DeepEval` + `Promptfoo` OWASP LLM Top 10 (`make audit-llm`), voz WebRTC, PDF/OCR `Decimal`, `promptGuard` y perfiles Ollama/vLLM | [`ai-evals/README.es.md`](../ai-evals/README.es.md), [`mcp-server/src/security/promptGuard.ts`](../mcp-server/src/security/promptGuard.ts), [`specs/14_LOCAL_LLM_AND_A2A_PROFILES.md`](specs/14_LOCAL_LLM_AND_A2A_PROFILES.md) |
| **Transversal: Vibe-Rescue** | Rescate en 5 etapas para apps generadas por IA sin destruir UX | [`vibe-rescue/README.es.md`](../vibe-rescue/README.es.md), [`vibe-rescue/audit_vibe_prototype.py`](../vibe-rescue/audit_vibe_prototype.py) |
| **Transversal: TMS, A2A & Release Gate** | Trazabilidad bidireccional `Jira`/`Zephyr`/`Xray`/`GitHub Issues`, tarjeta A2A y compuerta multi-señal (`GO`/`NO_GO`/`SKIPPED`) | [`specs/15_ENTERPRISE_TMS_TRACEABILITY.md`](specs/15_ENTERPRISE_TMS_TRACEABILITY.md), [`mcp-server/src/a2a/agentCard.ts`](../mcp-server/src/a2a/agentCard.ts), [`.agents/scripts/release_readiness_gate.py`](../.agents/scripts/release_readiness_gate.py) |

---

## 3. Superficie MCP, Economía de Tokens y Cierre Humano (`QA-GIT-GATE-01`)

* **Servidor MCP `@sinfallas/mcp-qa-11x` v3.8.0:** Expone públicamente **19 Tools** (12 núcleo v1 + 6 evaluadores v2.0 + `session_flight_recorder` en **v3.1**) y **13 Resources** (`blueprint://*`, incluyendo `blueprint://skills/tactical-patterns-11x` en **v3.1**) protegidos sobre `stdio` con `promptGuard` y `TaskStateGuard`.
* **Economía de Tokens (`<= 12 KB` / `< 20 KB` / `<= 40` líneas):** La skill orquestadora [`.agents/skills/qa-11x-architect/SKILL.md`](../.agents/skills/qa-11x-architect/SKILL.md) (`<= 12 KB`) hidrata 10 sub-skills modulares bajo demanda (incluyendo `tactical-patterns-11x` `<= 2.5 KB` JIT), proyecta determinísticamente `.agents/ACTIVE_TASK.md` vía `checkpoint_ctl.py` y usa [`.agents/scripts/compact_context_11x.py`](../.agents/scripts/compact_context_11x.py) + formato `Pass-Quiet / Fail-Verbose` (`.agents/.cache/qa-11x-last-failure.json`).
* **Guardia Humana de Cierre (`QA-GIT-GATE-01`):** Toda tarea `FULL_11X` completa el protocolo de cierre en 11 pasos (`AGENTS.md` §5), supera las 10 etapas de la compuerta de certificación ([`.agents/scripts/certify_task_completion.sh`](../.agents/scripts/certify_task_completion.sh)), registra `CERTIFIED_CLEAN` vía `checkpoint_ctl.py` y realiza un `git commit` local. Según [`.agents/rules/git_closure_gate.md`](../.agents/rules/git_closure_gate.md), ningún agente puede ejecutar `git push` o `npm publish` sin autorización humana explícita.

---

## 4. Documentación Relacionada

* Portada Global en Inglés (`README.md`) · [Portada Espejo en Español (`README.es.md`)](../README.es.md)
* [Catálogo Maestro de Recursos (`RESOURCES.es.md`)](../RESOURCES.es.md)
* [Gobernanza de Agentes IA (`05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`)](05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md)
* [Guía de Desarrollo Seguro (`04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`)](04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)
