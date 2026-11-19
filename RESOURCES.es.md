> 🌐 **Idioma:** [🇺🇸 English (Canonical)](RESOURCES.md) · **Español (Espejo 1:1)**

# 📚 Catálogo Maestro de Recursos y Artefactos (`QA-11X v3.2`)

Índice corporativo verificado de portadas, skills modulares, reglas activas, blueprints por stack, gobernanza ejecutable, imágenes Docker `sinfallas/*` y referencias normativas de **QA Testing Blueprints**.

---

## 1. Portadas, Inicio Rápido y Guías Multi-Agente

* **Portada principal (README.md, espejo en [`README.es.md`](README.es.md)):** Portada *English-First* con `quickstart` en 30 segundos, niveles de adopción (`starter` / `standard` / `enterprise`), matriz 15×12, matriz Docker y escudo AI Evals.
* **[`README.es.md`](README.es.md):** Espejo íntegro 1:1 en español corporativo con la matriz completa de herramientas de pruebas.
* **[`.github/actions/qa-11x-pr-check/action.yml`](.github/actions/qa-11x-pr-check/action.yml):** Composite Action endurecida para Pull Requests con selección por Blast Radius AST y perfiles progresivos.
* **[`mcp-server/README.es.md`](mcp-server/README.es.md) (`mcp-server/README.md`):** Documentación oficial bilingüe del paquete npm `@sinfallas/mcp-qa-11x` v3.2.0 (**19 herramientas**, **13 recursos** públicos incluyendo `quickstart`, `session_flight_recorder` + `blueprint://skills/tactical-patterns-11x` en **v3.1**, y 12 subcomandos CLI: `quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`, protegidos con `promptGuard` y `TaskStateGuard`).
* **[`llms.txt`](llms.txt) y Catálogos Globales (`catalogs/`):** Índice GEO para LLMs/agentes ([`llms.txt`](llms.txt)) junto a los descriptores canónicos [`catalogs/qaskills-pack.json`](catalogs/qaskills-pack.json) (QASkills.sh), [`catalogs/skillsllm-manifest.json`](catalogs/skillsllm-manifest.json) (SkillsLLM.com) y [`catalogs/agenticskills-submission.md`](catalogs/agenticskills-submission.md) (AgenticSkills.io).
* **[`docs/agent-setup.es.md`](docs/agent-setup.es.md) (`docs/agent-setup.md`):** Guías paso a paso para configurar 28 agentes y clientes MCP (`Antigravity`, `Claude Code`, `Cursor`, `Windsurf`, `Codex`, `Copilot`, `Hermes`, `Zed`, `JetBrains`, etc.).
* **[`AI_MASTER_PROMPT.es.md`](AI_MASTER_PROMPT.es.md):** Prompt maestro de adopción integral para agentes autónomos (versión canónica en inglés: AI_MASTER_PROMPT.md).

---

## 2. Las 11 Skills Modulares (`< 20 KB`) y 8 Reglas Activas (`.agents/`)

### 2.1. Catálogo de Skills Modulares (`.agents/skills/`)

| Skill | Especialidad | Archivo |
| :--- | :--- | :--- |
| **`qa-11x-architect`** | Orquestador maestro (`< 12 KB`), 3 vías proporcionales y 11 leyes UAT | [`SKILL.md`](.agents/skills/qa-11x-architect/SKILL.md) |
| **`qa-11x-devsecops-hardener`** | Controles DISA ASD STIG V6R5, OWASP v4.2, PostgreSQL 17 RLS + WORM | [`SKILL.md`](.agents/skills/qa-11x-devsecops-hardener/SKILL.md) |
| **`qa-11x-systematic-debugging`** | Protocolo determinista de 4 fases para causa raíz y locks RED-to-GREEN | [`SKILL.md`](.agents/skills/qa-11x-systematic-debugging/SKILL.md) |
| **`qa-11x-screenplay-builder`** | Patrón Screenplay multi-rol, Self-Healing DOM y aserciones temporales | [`SKILL.md`](.agents/skills/qa-11x-screenplay-builder/SKILL.md) |
| **`qa-11x-llm-evaluator`** | Evaluaciones IA en Modo Dual (offline gratuito + DeepEval/Promptfoo + voz/OCR) | [`SKILL.md`](.agents/skills/qa-11x-llm-evaluator/SKILL.md) |
| **`qa-11x-vibe-rescue`** | Rescate *Vibe-to-Enterprise* en 5 etapas preservando UX | [`SKILL.md`](.agents/skills/qa-11x-vibe-rescue/SKILL.md) |
| **`qa-11x-docker-certifier`** | Certificación efímera `Rule Zero` (`CC <= 5`, `>= 95%` cobertura, WCAG 2.1 AA) | [`SKILL.md`](.agents/skills/qa-11x-docker-certifier/SKILL.md) |
| **`docker-trivy-keydb-hardening`** | Contenedores no-root (`Trivy HIGH/CRITICAL = 0`) y motor KeyDB | [`SKILL.md`](.agents/skills/docker-trivy-keydb-hardening/SKILL.md) |
| **`graphify-ast-navigator`** | Grafo AST bidireccional `graph.json`, Blast Radius y límites de capas | [`SKILL.md`](.agents/skills/graphify-ast-navigator/SKILL.md) |
| **`refactoring-ui`** | Jerarquía visual, escala tipográfica, contraste OKLCH y layout Anti-JSDOM | [`SKILL.md`](.agents/skills/refactoring-ui/SKILL.md) |
| **`tactical-patterns-11x`** | Patrones tácticos JIT (`<= 2.5 KB`, `CC <= 5`, `max-params: 4`, Port/Adapter, Outbox) | [`SKILL.md`](.agents/skills/tactical-patterns-11x/SKILL.md) |

### 2.2. Reglas Canónicas Activas (`.agents/rules/`)

* [`git_closure_gate.md`](.agents/rules/git_closure_gate.md) — Guardia humana obligatoria `QA-GIT-GATE-01` (cero envíos remotos ni publicación automática en registros).
* [`mandatory_qa_pyramid_and_doc_sync.md`](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md) — Pirámide de 13 capas, co-evolución `QA-TEST-SYNC-01` y cero falsos `PASSED`.
* [`secure_development_and_testing_guidelines.md`](.agents/rules/secure_development_and_testing_guidelines.md) — Endurecimiento DISA STIG V6R5, OWASP v4.2, RLS, WORM y alineación UID no-root.
* [`frontend_parity_and_closure.md`](.agents/rules/frontend_parity_and_closure.md) — Paridad Terminal ↔ Frontend, refresco dual y validación batch por ítem.
* [`continuous_agent_evolution.md`](.agents/rules/continuous_agent_evolution.md) — Evolución autónoma Dual-Consumer y anti-duplicación Thin-Repo.
* [`anti_regression_and_side_effects_guardrail.md`](.agents/rules/anti_regression_and_side_effects_guardrail.md) — Radio de impacto AST previo/posterior y contención de regresiones.
* [`ground_truth_fixtures_and_negative_invariants.md`](.agents/rules/ground_truth_fixtures_and_negative_invariants.md) — Fixtures trimodales, 3 fases de reloj y transferencias `>= 180s`.
* [`active_task_and_planning_resilience.md`](.agents/rules/active_task_and_planning_resilience.md) — Flight Recorder atómico (`checkpoint_ctl.py` -> `.agents/ACTIVE_TASK.md` `<= 40` líneas).

---

## 3. Blueprints por Stack y Nicho (Matriz 15×12)

* **Backend Python & FastAPI:** [`fastapi/`](fastapi/README.es.md) ([`test_pact_consumer.py`](fastapi/tests/contracts/test_pact_consumer.py), [`smoke.k6.js`](fastapi/tests/load/smoke.k6.js)), [`python/`](python/README.es.md).
* **Backend Node.js & PHP:** [`node-backend/`](node-backend/README.es.md) ([`provider.pact.test.ts`](node-backend/tests/contracts/provider.pact.test.ts)), [`php/`](php/README.es.md) (PHP 8.2–8.5).
* **Frontend Vue 3 & React:** [`vue3/`](vue3/README.es.md) ([`Actor.ts`](vue3/tests/screenplay/Actor.ts), [`semanticLocator.ts`](vue3/tests/utils/semanticLocator.ts)), [`react-frontend/`](react-frontend/README.es.md) ([`Actor.ts`](react-frontend/tests/screenplay/Actor.ts), [`semanticLocator.ts`](react-frontend/tests/utils/semanticLocator.ts)).
* **DevOps Bash & Móvil:** [`bash-scripts/`](bash-scripts/README.es.md), [`mobile-appium/`](mobile-appium/README.es.md) ([`wdio.conf.ts`](mobile-appium/wdio.conf.ts), [`MobileActor.ts`](mobile-appium/tests/screenplay/MobileActor.ts), respaldado por `sinfallas/base-mobile-appium:26` vía `make test-mobile-blueprints` y [`20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md)).
* **Evaluación de IA & Rescate Vibe:** [`ai-evals/`](ai-evals/README.es.md) ([`test_rag_faithfulness.py`](ai-evals/rag/test_rag_faithfulness.py), [`test_voice_websocket_latency.py`](ai-evals/voice-realtime/test_voice_websocket_latency.py), [`test_pdf_table_fidelity.py`](ai-evals/multimodal-ocr/test_pdf_table_fidelity.py), [`golden_from_traces.py`](ai-evals/golden_from_traces.py)), [`vibe-rescue/`](vibe-rescue/README.es.md) ([`audit_vibe_prototype.py`](vibe-rescue/audit_vibe_prototype.py) `VIBE-SEC-001..QA-005`, [`rls_hardening.sql`](vibe-rescue/templates/rls_hardening.sql)).

---

## 4. Gobernanza Ejecutable, Arquitectura como Código y Especificaciones

* **Arquitectura y Manifiesto:** [`architecture/README.es.md`](architecture/README.es.md) ([`qa-11x.calm.json`](architecture/qa-11x.calm.json) + [`validate_calm_architecture.sh`](.agents/scripts/validate_calm_architecture.sh)), [`manifest.json`](manifest.json) (índice SHA-256 Zero-Clone).
* **Manuales Centrales y Specs:**
  * [`docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md`](docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md) — Pirámide de 13 capas, adopción proporcional, BDD nativo sin JVM, FINOS CALM, Screenplay, Pact/k6, AI Evals, Vibe-Rescue, TMS y Release Gate.
  * [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md) — Gobernanza multi-agente y economía de tokens.
  * [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md) — Invariantes Anti-Silo y buenas prácticas de ingeniería.
  * [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md`](docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md) — Guía técnica operativa por capa de prueba.
  * [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md) — Recetario de los 22 controles de referencia DISA STIG V6R5 + OWASP v4.2 y 34 reglas estáticas del escáner.
  * [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md), [`docs/specs/14_LOCAL_LLM_AND_A2A_PROFILES.md`](docs/specs/14_LOCAL_LLM_AND_A2A_PROFILES.md), [`docs/specs/15_ENTERPRISE_TMS_TRACEABILITY.md`](docs/specs/15_ENTERPRISE_TMS_TRACEABILITY.md), [`docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md), [`docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md), [`docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md), [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md), [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md).
* **Scripts Meta-QA y Compuertas (`.agents/scripts/`, `scripts/` & `Makefile`):**
  * **Compuertas de Gobernanza y Certificación (`.agents/scripts/` — 22 archivos):** [`_budgets.py`](.agents/scripts/_budgets.py), [`checkpoint_ctl.py`](.agents/scripts/checkpoint_ctl.py), [`certify_task_completion.sh`](.agents/scripts/certify_task_completion.sh) (`make certify`), [`bump_version_11x.py`](.agents/scripts/bump_version_11x.py) (`make version-check`), [`sync_governance.py`](.agents/scripts/sync_governance.py) (`make sync-governance`), [`verify_docs_invariants.py`](.agents/scripts/verify_docs_invariants.py) (`make lint-docs`), [`verify_roadmap_consistency.py`](.agents/scripts/verify_roadmap_consistency.py), [`verify_alembic_orm_parity.py`](.agents/scripts/verify_alembic_orm_parity.py), [`verify_zero_orphan_vue_components.py`](.agents/scripts/verify_zero_orphan_vue_components.py), [`verify_no_orphan_api_endpoints.py`](.agents/scripts/verify_no_orphan_api_endpoints.py), [`verify_json_no_duplicate_keys.py`](.agents/scripts/verify_json_no_duplicate_keys.py), [`verify_topological_health.py`](.agents/scripts/verify_topological_health.py), [`verify_diff_coverage.py`](.agents/scripts/verify_diff_coverage.py) (`make diff-cov`), [`inspect_blast_radius.py`](.agents/scripts/inspect_blast_radius.py), [`select_tests_by_blast_radius.py`](.agents/scripts/select_tests_by_blast_radius.py) ([`ci-tiered-qa.yml`](.github/workflows/ci-tiered-qa.yml)), [`track_findings_state.py`](.agents/scripts/track_findings_state.py), [`generate_pr_verdict.py`](.agents/scripts/generate_pr_verdict.py) (`make pr-verdict`), [`lint_test_antipatterns.py`](.agents/scripts/lint_test_antipatterns.py), [`compact_context_11x.py`](.agents/scripts/compact_context_11x.py) (`make compact-context`), [`release_readiness_gate.py`](.agents/scripts/release_readiness_gate.py) (`make release-gate`), [`audit_pagespeed_insights.py`](.agents/scripts/audit_pagespeed_insights.py), [`validate_calm_architecture.sh`](.agents/scripts/validate_calm_architecture.sh) (`make validate-calm`).
  * **Scripts Operativos Shell y Python (`scripts/` — 10 archivos):** [`actualizar-grafos-graphify.sh`](scripts/actualizar-grafos-graphify.sh), [`auditar-infra.sh`](scripts/auditar-infra.sh), [`auditar-pagespeed.sh`](scripts/auditar-pagespeed.sh), [`generar-manifiesto.py`](scripts/generar-manifiesto.py), [`generar-sbom-cyclonedx.sh`](scripts/generar-sbom-cyclonedx.sh) (`make sbom`), [`install-skill.sh`](scripts/install-skill.sh), [`limpieza.sh`](scripts/limpieza.sh), [`probar-mcp-example.sh`](scripts/probar-mcp-example.sh), [`publicar-mcp.sh`](scripts/publicar-mcp.sh), [`verificar-secretos.sh`](scripts/verificar-secretos.sh).
  * Documentación de Gobernanza y Onboarding: [`TESTING.es.md`](TESTING.es.md), [`SECURITY.es.md`](SECURITY.es.md), [`CONTRIBUTING.es.md`](CONTRIBUTING.es.md), [`CODE_OF_CONDUCT.es.md`](CODE_OF_CONDUCT.es.md), [`FAQ.es.md`](FAQ.es.md), [`ROADMAP.es.md`](ROADMAP.es.md), [`CHANGELOG.es.md`](CHANGELOG.es.md).

---

## 5. Imágenes Docker Oficiales, Herramientas OSS y Referencias Normativas

### Imágenes Docker Certificadas (`Rule Zero`, `Trivy HIGH/CRITICAL = 0`)

* [sinfallas/base-python-uv](https://hub.docker.com/r/sinfallas/base-python-uv) (`3.11`..`3.15`, `latest` — `uv`, `ruff`, `mypy`, `pytest`, `deepeval`, `pact-python`, `tesseract-ocr`).
* [sinfallas/base-node-ionic](https://hub.docker.com/r/sinfallas/base-node-ionic) (`22`, `24`, `26`, `latest` — `pnpm`, `promptfoo`, `@finos/calm-cli`, `playwright`, `@axe-core/playwright`, `@pact-foundation/pact`).
* [sinfallas/base-mobile-appium](https://hub.docker.com/r/sinfallas/base-mobile-appium) (`26`, `latest` — `Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`).
* [sinfallas/basephpcomposer](https://hub.docker.com/r/sinfallas/basephpcomposer) (`8.2`..`8.5`, `latest` — PHP-FPM `UID 1000`, `pcov`, `phpstan`, `psalm`, `pest`, `phpunit`, `infection`).
* [sinfallas/karatelabs](https://hub.docker.com/r/sinfallas/karatelabs) (`1.5.1` — OpenJDK + Maven + Karate JUnit5).
* [sinfallas/base-bash-qa](https://hub.docker.com/r/sinfallas/base-bash-qa) (`latest`), [sinfallas/remote-graphify](https://hub.docker.com/r/sinfallas/remote-graphify) (`latest`), [grafana/k6](https://hub.docker.com/r/grafana/k6) (`2.4.0`), `postgres:17-alpine`, `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch), `aquasec/trivy:0.76.2`, `zaproxy/zap-stable:2.15.0`, `gaiaadm/pumba:0.10.1`, `prom/prometheus:v2.55.1`.

### Herramientas Open Source y Estándares

* **Python / IA / Seguridad:** [ruff](https://github.com/astral-sh/ruff), [mypy](https://github.com/python/mypy), [pytest](https://github.com/pytest-dev/pytest), [bandit](https://github.com/pycqa/bandit), [mutmut](https://github.com/boxed/mutmut), [radon](https://github.com/rubik/radon), [DeepEval](https://github.com/confident-ai/deepeval), [Promptfoo](https://github.com/promptfoo/promptfoo), [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), [pytm](https://github.com/izar/pytm).
* **Node / Frontend / Móvil / Contratos:** [vitest](https://github.com/vitest-dev/vitest), [stryker](https://github.com/stryker-mutator/stryker-js), [Playwright](https://playwright.dev/), [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright), [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci/), [FINOS CALM CLI](https://github.com/finos/architecture-as-code), [Pact](https://pact.io/), [Appium](https://appium.io/), [Grafana k6](https://github.com/grafana/k6), [karate labs](https://github.com/karatelabs/karate).
* **Infra / Bash / Normativa:** [trivy](https://github.com/aquasecurity/trivy), [lefthook](https://github.com/evilmartians/lefthook), [shellcheck](https://github.com/koalaman/shellcheck), [BATS-core](https://github.com/bats-core/bats-core), [OWASP Developer Guide v4.2](https://devguide.owasp.org/), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [OWASP API Security Top 10](https://owasp.org/API-Security/), [CycloneDX (ECMA-424)](https://cyclonedx.org/), [DISA ASD STIG V6R5](https://public.cyber.mil/stigs/).
