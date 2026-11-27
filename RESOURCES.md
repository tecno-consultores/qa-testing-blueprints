> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](RESOURCES.es.md)

# 📚 Master Catalog of Resources & Artifacts (`QA-11X v3.10`)

Verified corporate index of entrypoints, modular skills, active rules, stack blueprints, executable governance, `sinfallas/*` Docker images, and normative references for **QA Testing Blueprints**.

---

## 1. Entrypoints, Quickstart & Multi-Agent Guides

* **[`README.md`](README.md):** Primary *English-First* landing page featuring the 30-second `quickstart`, progressive adoption tiers (`starter` / `standard` / `enterprise`), the 15-column × 12-environment testing tools matrix, the ephemeral Docker matrix, and the AI Evals shield.
* **[`README.es.md`](README.es.md):** 1:1 Spanish mirror with the full testing tools matrix and bilingual entrypoints.
* **[`.github/actions/qa-11x-pr-check/action.yml`](.github/actions/qa-11x-pr-check/action.yml):** Hardened Composite Action for Pull Requests with AST Blast-Radius selection and progressive tiers.
* **[`mcp-server/README.md`](mcp-server/README.md) / [`mcp-server/README.es.md`](mcp-server/README.es.md):** Official bilingual documentation for the `@sinfallas/mcp-qa-11x` v3.10.0 npm package (**19 Tools**, **13 Resources** including **v3.1** `session_flight_recorder` + `blueprint://skills/tactical-patterns-11x`, and 12 CLI subcommands: `quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`, protected by `promptGuard` and `TaskStateGuard`).
* **[`llms.txt`](llms.txt) & Global Catalogs (`catalogs/` & `.claude-plugin/`):** GEO index for LLMs/agents ([`llms.txt`](llms.txt)), native Claude Code plugin manifests ([`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)), alongside canonical descriptors [`catalogs/qaskills-pack.json`](catalogs/qaskills-pack.json) (QASkills.sh), [`catalogs/skillsllm-manifest.json`](catalogs/skillsllm-manifest.json) (SkillsLLM.com), and [`catalogs/agenticskills-submission.md`](catalogs/agenticskills-submission.md) (AgenticSkills.io).
* **[`docs/agent-setup.md`](docs/agent-setup.md) / [`docs/agent-setup.es.md`](docs/agent-setup.es.md):** Step-by-step setup guides for 28 AI coding agents and MCP clients (`Antigravity`, `Claude Code`, `Cursor`, `Windsurf`, `Codex`, `Copilot`, `Hermes`, `Zed`, `JetBrains`, etc.).
* **[`AI_MASTER_PROMPT.md`](AI_MASTER_PROMPT.md):** Master adoption prompt for autonomous AI agents ([Spanish mirror](AI_MASTER_PROMPT.es.md)).

---

## 2. The 11 Modular Skills (`< 20 KB`) & 8 Active Rules (`.agents/`)

### 2.1. Modular Skills Catalog (`.agents/skills/`)

| Skill | Specialty | File |
| :--- | :--- | :--- |
| **`qa-11x-architect`** | Master orchestrator (`<= 12 KB`, `10` refs incl. SDD/EARS), 3 proportional paths & 11 UAT laws | [`SKILL.md`](.agents/skills/qa-11x-architect/SKILL.md) |
| **`qa-11x-devsecops-hardener`** | DISA ASD STIG V6R5, OWASP v4.2, PostgreSQL 17 RLS + WORM controls | [`SKILL.md`](.agents/skills/qa-11x-devsecops-hardener/SKILL.md) |
| **`qa-11x-systematic-debugging`** | 4-phase deterministic root-cause protocol & RED-to-GREEN locks | [`SKILL.md`](.agents/skills/qa-11x-systematic-debugging/SKILL.md) |
| **`qa-11x-screenplay-builder`** | Multi-role Screenplay pattern, Self-Healing DOM & temporal assertions | [`SKILL.md`](.agents/skills/qa-11x-screenplay-builder/SKILL.md) |
| **`qa-11x-llm-evaluator`** | Dual-mode AI evaluations (free offline + DeepEval/Promptfoo + voice/OCR) | [`SKILL.md`](.agents/skills/qa-11x-llm-evaluator/SKILL.md) |
| **`qa-11x-vibe-rescue`** | 5-stage *Vibe-to-Enterprise* rescue preserving UX | [`SKILL.md`](.agents/skills/qa-11x-vibe-rescue/SKILL.md) |
| **`qa-11x-docker-certifier`** | Ephemeral `Rule Zero` certification (`CC <= 5`, `>= 95%` coverage, WCAG 2.1 AA) | [`SKILL.md`](.agents/skills/qa-11x-docker-certifier/SKILL.md) |
| **`docker-trivy-keydb-hardening`** | Non-root containers (`Trivy HIGH/CRITICAL = 0`) & KeyDB engine | [`SKILL.md`](.agents/skills/docker-trivy-keydb-hardening/SKILL.md) |
| **`graphify-ast-navigator`** | Bidirectional AST graph `graph.json`, Blast Radius & layer boundaries | [`SKILL.md`](.agents/skills/graphify-ast-navigator/SKILL.md) |
| **`refactoring-ui`** | Visual hierarchy, typographic scale, OKLCH contrast & Anti-JSDOM layout | [`SKILL.md`](.agents/skills/refactoring-ui/SKILL.md) |
| **`tactical-patterns-11x`** | JIT tactical design patterns (`<= 2.5 KB`, `CC <= 5`, `max-params: 4`, Port/Adapter, Outbox) | [`SKILL.md`](.agents/skills/tactical-patterns-11x/SKILL.md) |

### 2.2. Active Canonical Rules (`.agents/rules/`)

* [`git_closure_gate.md`](.agents/rules/git_closure_gate.md) — Mandatory human push guard `QA-GIT-GATE-01` (zero automatic remote pushes or registry publishing).
* [`mandatory_qa_pyramid_and_doc_sync.md`](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md) — 13-layer pyramid, `QA-TEST-SYNC-01` co-evolution, and zero hardcoded `PASSED`.
* [`secure_development_and_testing_guidelines.md`](.agents/rules/secure_development_and_testing_guidelines.md) — DISA STIG V6R5, OWASP v4.2, RLS, WORM, and non-root UID alignment.
* [`frontend_parity_and_closure.md`](.agents/rules/frontend_parity_and_closure.md) — Terminal ↔ Frontend parity, dual refresh, and batch per-item validation.
* [`continuous_agent_evolution.md`](.agents/rules/continuous_agent_evolution.md) — Autonomous Dual-Consumer evolution and Thin-Repo anti-duplication.
* [`anti_regression_and_side_effects_guardrail.md`](.agents/rules/anti_regression_and_side_effects_guardrail.md) — Pre/post AST blast-radius audit and regression containment.
* [`ground_truth_fixtures_and_negative_invariants.md`](.agents/rules/ground_truth_fixtures_and_negative_invariants.md) — Trimodal fixtures, 3 clock phases, and `>= 180s` heavy transfers.
* [`active_task_and_planning_resilience.md`](.agents/rules/active_task_and_planning_resilience.md) — Atomic Flight Recorder (`checkpoint_ctl.py` -> `.agents/ACTIVE_TASK.md` `<= 40` lines).

---

## 3. Stack & Niche Blueprints (15×12 Matrix)

* **Python & FastAPI Backend:** [`fastapi/`](fastapi/) ([`test_pact_consumer.py`](fastapi/tests/contracts/test_pact_consumer.py), [`smoke.k6.js`](fastapi/tests/load/smoke.k6.js)), [`python/`](python/README.md).
* **Node.js & PHP Backend:** [`node-backend/`](node-backend/) ([`provider.pact.test.ts`](node-backend/tests/contracts/provider.pact.test.ts)), [`php/`](php/README.md) (PHP 8.2–8.5).
* **Vue 3 & React Frontend:** [`vue3/`](vue3/) ([`Actor.ts`](vue3/tests/screenplay/Actor.ts), [`semanticLocator.ts`](vue3/tests/utils/semanticLocator.ts)), [`react-frontend/`](react-frontend/) ([`Actor.ts`](react-frontend/tests/screenplay/Actor.ts), [`semanticLocator.ts`](react-frontend/tests/utils/semanticLocator.ts)).
* **DevOps Bash & Mobile:** [`bash-scripts/`](bash-scripts/README.md), [`mobile-appium/`](mobile-appium/README.md) ([`wdio.conf.ts`](mobile-appium/wdio.conf.ts), [`MobileActor.ts`](mobile-appium/tests/screenplay/MobileActor.ts), powered by `sinfallas/base-mobile-appium:26` via `make test-mobile-blueprints` and [`20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md)).
* **AI Evals & Vibe Rescue:** [`ai-evals/`](ai-evals/README.md) ([`test_rag_faithfulness.py`](ai-evals/rag/test_rag_faithfulness.py), [`test_voice_websocket_latency.py`](ai-evals/voice-realtime/test_voice_websocket_latency.py), [`test_pdf_table_fidelity.py`](ai-evals/multimodal-ocr/test_pdf_table_fidelity.py), [`golden_from_traces.py`](ai-evals/golden_from_traces.py)), [`vibe-rescue/`](vibe-rescue/README.md) ([`audit_vibe_prototype.py`](vibe-rescue/audit_vibe_prototype.py) `VIBE-SEC-001..QA-005`, [`rls_hardening.sql`](vibe-rescue/templates/rls_hardening.sql)).

---

## 4. Executable Governance, Architecture-as-Code & Specifications

* **Architecture & Manifest:** [`architecture/README.md`](architecture/README.md) ([`qa-11x.calm.json`](architecture/qa-11x.calm.json) + [`validate_calm_architecture.sh`](.agents/scripts/validate_calm_architecture.sh)), [`manifest.json`](manifest.json) (SHA-256 Zero-Clone index).
* **Core Manuals & Specs:**
  * [`docs/01_ARQUITECTURA_PIRAMIDE_11X.md`](docs/01_ARQUITECTURA_PIRAMIDE_11X.md) — 13-layer pyramid, proportional adoption, JVM-free native BDD, FINOS CALM, Screenplay, Pact/k6, AI Evals, Vibe-Rescue, TMS, and Release Gate.
  * [`docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`](docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md) — Multi-agent governance and token economy.
  * [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md) — Anti-Silo invariants and engineering best practices.
  * [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`](docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md) — Operational technical guide per testing layer.
  * [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md) — Handbook of 22 DISA STIG V6R5 + OWASP v4.2 reference controls and 37 static scanner rules.
  * [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md), [`docs/specs/14_LOCAL_LLM_AND_A2A_PROFILES.md`](docs/specs/14_LOCAL_LLM_AND_A2A_PROFILES.md), [`docs/specs/15_ENTERPRISE_TMS_TRACEABILITY.md`](docs/specs/15_ENTERPRISE_TMS_TRACEABILITY.md), [`docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md), [`docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md), [`docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md), [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md), [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md).
* **Meta-QA Scripts & Gates (`.agents/scripts/`, `scripts/` & `Makefile`):**
  * **Governance & Certification Gates (`.agents/scripts/` — 30 files):** [`_budgets.py`](.agents/scripts/_budgets.py), [`_common.py`](.agents/scripts/_common.py), `_docs_invariants_{config,counts,bilingual,catalogs}.py`, [`checkpoint_ctl.py`](.agents/scripts/checkpoint_ctl.py), [`certify_task_completion.sh`](.agents/scripts/certify_task_completion.sh) (`make certify`), [`bump_version_11x.py`](.agents/scripts/bump_version_11x.py) (`make version-check`), [`sync_governance.py`](.agents/scripts/sync_governance.py) (`make sync-governance`), [`verify_docs_invariants.py`](.agents/scripts/verify_docs_invariants.py) (`make lint-docs`), [`lint_workflows.py`](.agents/scripts/lint_workflows.py) (`make lint-workflows`), [`lint_docs_gate.py`](.agents/scripts/lint_docs_gate.py), [`normalize_kcov_cobertura.py`](.agents/scripts/normalize_kcov_cobertura.py), [`verify_roadmap_consistency.py`](.agents/scripts/verify_roadmap_consistency.py), [`verify_alembic_orm_parity.py`](.agents/scripts/verify_alembic_orm_parity.py), [`verify_zero_orphan_vue_components.py`](.agents/scripts/verify_zero_orphan_vue_components.py), [`verify_no_orphan_api_endpoints.py`](.agents/scripts/verify_no_orphan_api_endpoints.py), [`verify_json_no_duplicate_keys.py`](.agents/scripts/verify_json_no_duplicate_keys.py), [`verify_topological_health.py`](.agents/scripts/verify_topological_health.py), [`verify_diff_coverage.py`](.agents/scripts/verify_diff_coverage.py) (`make diff-cov`), [`inspect_blast_radius.py`](.agents/scripts/inspect_blast_radius.py), [`select_tests_by_blast_radius.py`](.agents/scripts/select_tests_by_blast_radius.py) ([`ci-tiered-qa.yml`](.github/workflows/ci-tiered-qa.yml)), [`track_findings_state.py`](.agents/scripts/track_findings_state.py), [`generate_pr_verdict.py`](.agents/scripts/generate_pr_verdict.py) (`make pr-verdict`), [`lint_test_antipatterns.py`](.agents/scripts/lint_test_antipatterns.py), [`compact_context_11x.py`](.agents/scripts/compact_context_11x.py) (`make compact-context`), [`release_readiness_gate.py`](.agents/scripts/release_readiness_gate.py) (Docker CLI / MCP `evaluate_release_gate`), [`audit_pagespeed_insights.py`](.agents/scripts/audit_pagespeed_insights.py) (`make audit-psi`), [`validate_calm_architecture.sh`](.agents/scripts/validate_calm_architecture.sh) (`make validate-calm`).
  * **Operational Shell & Python Scripts (`scripts/` — 11 files):** [`actualizar-grafos-graphify.sh`](scripts/actualizar-grafos-graphify.sh), [`audit-edge.sh.example`](scripts/audit-edge.sh.example), [`auditar-infra.sh`](scripts/auditar-infra.sh), [`auditar-pagespeed.sh`](scripts/auditar-pagespeed.sh), [`generar-manifiesto.py`](scripts/generar-manifiesto.py), [`generar-sbom-cyclonedx.sh`](scripts/generar-sbom-cyclonedx.sh) (`make sbom`), [`install-skill.sh`](scripts/install-skill.sh), [`limpieza.sh`](scripts/limpieza.sh), [`probar-mcp-example.sh`](scripts/probar-mcp-example.sh), [`publicar-mcp.sh`](scripts/publicar-mcp.sh), [`verificar-secretos.sh`](scripts/verificar-secretos.sh).
  * Governance & Onboarding docs: [`TESTING.md`](TESTING.md), [`SECURITY.md`](SECURITY.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), [`FAQ.md`](FAQ.md), [`ROADMAP.md`](ROADMAP.md), [`CHANGELOG.md`](CHANGELOG.md).

---

## 5. Official Docker Images, OSS Tools & Normative References

### Certified Docker Images (`Rule Zero`, `Trivy HIGH/CRITICAL = 0`)

* [sinfallas/base-python-uv](https://hub.docker.com/r/sinfallas/base-python-uv) (`3.11`..`3.15`, `latest` — `uv`, `ruff`, `mypy`, `pytest`, `deepeval`, `pact-python`, `tesseract-ocr`).
* [sinfallas/base-node-ionic](https://hub.docker.com/r/sinfallas/base-node-ionic) (`22`, `24`, `26`, `latest` — `pnpm`, `promptfoo`, `@finos/calm-cli`, `playwright`, `@axe-core/playwright`, `@pact-foundation/pact`).
* [sinfallas/base-mobile-appium](https://hub.docker.com/r/sinfallas/base-mobile-appium) (`26`, `latest` — `Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`).
* [sinfallas/basephpcomposer](https://hub.docker.com/r/sinfallas/basephpcomposer) (`8.2`..`8.5`, `latest` — PHP-FPM `UID 1000`, `pcov`, `phpstan`, `psalm`, `pest`, `phpunit`, `infection`).
* [sinfallas/karatelabs](https://hub.docker.com/r/sinfallas/karatelabs) (`1.5.1` — OpenJDK + Maven + Karate JUnit5).
* [sinfallas/base-bash-qa](https://hub.docker.com/r/sinfallas/base-bash-qa) (`latest`), [sinfallas/remote-graphify](https://hub.docker.com/r/sinfallas/remote-graphify) (`latest`), [grafana/k6](https://hub.docker.com/r/grafana/k6) (`2.4.0`), `postgres:17-alpine`, `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch), `aquasec/trivy:0.76.2`, `zaproxy/zap-stable:2.15.0`, `gaiaadm/pumba:0.10.1`, `prom/prometheus:v2.55.1`.

### Open Source Tools & Standards

* **Python / AI / Security:** [ruff](https://github.com/astral-sh/ruff), [mypy](https://github.com/python/mypy), [pytest](https://github.com/pytest-dev/pytest), [bandit](https://github.com/pycqa/bandit), [mutmut](https://github.com/boxed/mutmut), [radon](https://github.com/rubik/radon), [DeepEval](https://github.com/confident-ai/deepeval), [Promptfoo](https://github.com/promptfoo/promptfoo), [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), [pytm](https://github.com/izar/pytm).
* **Node / Frontend / Mobile / Contracts:** [vitest](https://github.com/vitest-dev/vitest), [stryker](https://github.com/stryker-mutator/stryker-js), [Playwright](https://playwright.dev/), [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright), [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci/), [FINOS CALM CLI](https://github.com/finos/architecture-as-code), [Pact](https://pact.io/), [Appium](https://appium.io/), [Grafana k6](https://github.com/grafana/k6), [karate labs](https://github.com/karatelabs/karate).
* **Infra / Bash / Compliance:** [trivy](https://github.com/aquasecurity/trivy), [lefthook](https://github.com/evilmartians/lefthook), [shellcheck](https://github.com/koalaman/shellcheck), [BATS-core](https://github.com/bats-core/bats-core), [OWASP Developer Guide v4.2](https://devguide.owasp.org/), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [OWASP API Security Top 10](https://owasp.org/API-Security/), [CycloneDX (ECMA-424)](https://cyclonedx.org/), [DISA ASD STIG V6R5](https://public.cyber.mil/stigs/).
