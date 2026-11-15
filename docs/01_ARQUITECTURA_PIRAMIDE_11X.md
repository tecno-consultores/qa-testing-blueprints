> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (01_ARQUITECTURA_PIRAMIDE_11X.es.md)](01_ARQUITECTURA_PIRAMIDE_11X.es.md)

# 🏛️ QA-11X v3.0 Quality Pyramid Architecture (13 Layers + Agentic Cross-Cutting Planes)

> **PURPOSE:** Canonical architectural specification defining the **13 quality layers**, the **agentic and security cross-cutting planes** of **QA-11X v3.0**, the **3 progressive adoption profiles** (`starter`, `standard`, `enterprise`), and the **3 proportional execution paths** (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`).

---

## 1. Proportional Adoption Across 3 Paths and 3 Profiles

To prevent over-engineering on small tasks without relaxing controls on critical systems, QA-11X v3.0 decouples the **repository adoption profile** from the **per-change execution path**:

| Dimension | Classification | Activation Criteria | Validation Scope |
| :--- | :--- | :--- | :--- |
| **Profile** | **`starter`** | 30s quickstart (`quickstart`) | Secrets = 0, non-root containers (`Rule Zero`), `.qa-11x.json`, `AGENTS.md` connector (27+ agents) |
| **Profile** | **`standard`** | Daily PRs by product teams | `starter` + coverage `>= 95%`, strict typing (`mypy --strict`, `tsc`, `PHPStan max`), AST CI sharding (`40%–60%` savings), and UI anti-pattern linter |
| **Profile** | **`enterprise`** | Regulated or multi-tenant systems | Full 13-layer pyramid + FINOS CALM, PostgreSQL 17 RLS + WORM, DISA STIG V6R5, Pact + k6, AI Evals, and Release Readiness Gate |
| **Path** | **`DOCS_ONLY`** | Changes strictly limited to `*.md` or `docs/` | `0` QA containers, `0` AST rebuilds; syncs manifest/docs and certifies `make lint-docs && make certify` |
| **Path** | **`MICRO_CHANGE`** | `<= 3` files, `0` new routes/ORM, Blast Radius `LOW` (`< 5` callers) | Focused stack unit/contract suite + `QA-TEST-SYNC-01` co-evolution + incremental AST refresh |
| **Path** | **`FULL_11X`** | `> 3` files, new APIs/Views, ORM, security, or `MEDIUM/HIGH` Blast Radius | Full 11-step, 13-layer workflow with mandatory 10/10 gate closure |

### Proportional BDD Rule: Karate Labs vs. JVM-Free Native Runners

* **Mandatory Karate Labs (`sinfallas/karatelabs`):** Required in `FULL_11X` multi-service applications with real transactional persistence, multi-role RBAC flows, or HTTP/Edge/OSHP/SSG contracts behind Nginx (`fastapi/test/`, `vue3/test/`, `mcp-server/test/`).
* **Authorized JVM-free native runners:** In lightweight microservices (`<= 3` endpoints), standalone libraries, or CLIs without complex state, **Consumer-Driven Pact** contracts (`pact-python`, `@pact-foundation/pact`), `pytest + httpx`, or `vitest` / Playwright API are authorized to avoid JVM overhead while preserving idempotency (`Idempotency-Key`) and trimodal fixtures.

---

## 2. QA-11X v3.0 Pyramid Topology (13 Layers + Cross-Cutting Planes)

```mermaid
flowchart TD
    L01["L1-L2: Linting + Strict Typing + Secrets + Trivy"] --> L03["L3-L4: Unit >=95% + Mutation MSI >=80%"]
    L03 --> L05["L5-L7: DB/ORM Parity + Pact Contracts + Karate or Native BDD"]
    L05 --> L08["L8-L9: Screenplay + Self-Healing DOM + WCAG 2.1 AA + ZAP DAST"]
    L08 --> L10["L10-L11: Load k6/Locust + Chaos Pumba + OTel/Prometheus"]
    L10 --> L12["L12-L13: AST Topological Health + FINOS CALM + Trimodal 3-Phase"]
    L12 --> Transversal["v2.0 Cross-Cutting: AI Evals + Vibe-Rescue + TMS + A2A + Release Gate"]
    Transversal --> Closure["10/10 Gate + Local Commit QA-GIT-GATE-01"]
```

### Breakdown of the 13 Layers and v2.0 Cross-Cutting Planes

| Layer / Plane | Primary Responsibility | Monorepo Artifacts & Implementation |
| :--- | :--- | :--- |
| **L01–L02** | Linting (`CC <= 5`), strict typing, secrets, CycloneDX SBOM, and Trivy `HIGH/CRITICAL = 0` | [`scripts/verificar-secretos.sh`](../scripts/verificar-secretos.sh), [`scripts/auditar-infra.sh`](../scripts/auditar-infra.sh), [`scripts/generar-sbom-cyclonedx.sh`](../scripts/generar-sbom-cyclonedx.sh) |
| **L03–L04** | Hermetic unit tests `>= 95%` and mutation testing (`MSI >= 80%`) | `pytest-cov`, `@vitest/coverage-v8`, `PCOV`, `Mutmut`, `Stryker`, `Infection` |
| **L05** | Live migrations on `postgres:17-alpine`, RLS + WORM `seq_num` | [`.agents/scripts/verify_alembic_orm_parity.py`](../.agents/scripts/verify_alembic_orm_parity.py), [`vibe-rescue/templates/rls_hardening.sql`](../vibe-rescue/templates/rls_hardening.sql) |
| **L06–L07** | Consumer-Driven **Pact V4** contracts and proportional BDD (Karate or native) | [`fastapi/tests/contracts/test_pact_consumer.py`](../fastapi/tests/contracts/test_pact_consumer.py), [`node-backend/tests/contracts/provider.pact.test.ts`](../node-backend/tests/contracts/provider.pact.test.ts) |
| **L08** | **Multi-role Screenplay + Self-Healing DOM**, WCAG 2.1 AA, Lighthouse, and UI linter (`QA-UI-ANTI-001..005`) | [`vue3/tests/screenplay/Actor.ts`](../vue3/tests/screenplay/Actor.ts), [`react-frontend/tests/utils/semanticLocator.ts`](../react-frontend/tests/utils/semanticLocator.ts), [`mobile-appium/tests/screenplay/MobileActor.ts`](../mobile-appium/tests/screenplay/MobileActor.ts), [`.agents/scripts/lint_test_antipatterns.py`](../.agents/scripts/lint_test_antipatterns.py) |
| **L09–L11** | DAST (`OWASP ZAP`), declarative load (**Grafana k6** / Locust), and chaos (`Pumba` post-RED `/metrics`) | [`fastapi/tests/load/smoke.k6.js`](../fastapi/tests/load/smoke.k6.js), [`docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md) |
| **L12** | **Architecture-as-Code FINOS CALM** + AST topological health + Blast Radius CI sharding | [`architecture/qa-11x.calm.json`](../architecture/qa-11x.calm.json), [`.agents/scripts/validate_calm_architecture.sh`](../.agents/scripts/validate_calm_architecture.sh), [`.agents/scripts/select_tests_by_blast_radius.py`](../.agents/scripts/select_tests_by_blast_radius.py), [`.github/workflows/ci-tiered-qa.yml`](../.github/workflows/ci-tiered-qa.yml) |
| **L13** | Trimodal fixtures (`Virgin`/`Nominal`/`Degraded`), 3-phase clock lifecycle, and 10 Anti-Blindness laws | [`.agents/rules/ground_truth_fixtures_and_negative_invariants.md`](../.agents/rules/ground_truth_fixtures_and_negative_invariants.md), [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](02_BUENAS_PRACTICAS_PROGRAMACION_11X.md) |
| **AI Evals & Shield** | Mode 1 offline `$0` (`make test-ai-offline`), Mode 2 `DeepEval` + `Promptfoo` OWASP LLM Top 10 (`make audit-llm`), WebRTC voice, PDF/OCR `Decimal`, `promptGuard`, and Ollama/vLLM profiles | [`ai-evals/README.md`](../ai-evals/README.md), [`mcp-server/src/security/promptGuard.ts`](../mcp-server/src/security/promptGuard.ts), [`specs/14_LOCAL_LLM_AND_A2A_PROFILES.md`](specs/14_LOCAL_LLM_AND_A2A_PROFILES.md) |
| **Vibe-to-Enterprise** | 5-stage rescue for AI-generated apps without breaking UX | [`vibe-rescue/README.md`](../vibe-rescue/README.md), [`vibe-rescue/audit_vibe_prototype.py`](../vibe-rescue/audit_vibe_prototype.py) |
| **TMS, A2A & Release Gate** | Bidirectional `Jira`/`Zephyr`/`Xray`/`GitHub Issues` traceability, A2A agent card, and multi-signal gate (`GO`/`NO_GO`/`SKIPPED`) | [`specs/15_ENTERPRISE_TMS_TRACEABILITY.md`](specs/15_ENTERPRISE_TMS_TRACEABILITY.md), [`mcp-server/src/a2a/agentCard.ts`](../mcp-server/src/a2a/agentCard.ts), [`.agents/scripts/release_readiness_gate.py`](../.agents/scripts/release_readiness_gate.py) |

---

## 3. MCP Surface, Token Economy, and Human Closure Gate (`QA-GIT-GATE-01`)

* **MCP Server `@sinfallas/mcp-qa-11x` v3.0.0:** Publicly exposes **18 Tools** (12 core v1 + 6 v2.0: `validate_calm_architecture`, `evaluate_release_gate`, `evaluate_agent_trajectory`, `run_llm_red_team`, `audit_vibe_prototype`, `sync_enterprise_tms`) and **12 Resources** (`blueprint://*`, adding `blueprint://ai/evals-redteam`, `blueprint://mobile-appium/readme`, and `blueprint://vibe-rescue/readme`) protected over `stdio` with `promptGuard` and `TaskStateGuard`.
* **Token Economy (`< 20 KB` / `<= 40` lines):** The orchestrator skill [`.agents/skills/qa-11x-architect/SKILL.md`](../.agents/skills/qa-11x-architect/SKILL.md) (`< 12 KB`) hydrates 9 modular sub-skills on demand and uses [`.agents/scripts/compact_context_11x.py`](../.agents/scripts/compact_context_11x.py) + `Pass-Quiet / Fail-Verbose` formatting (`/tmp/qa-11x-last-failure.json`).
* **Human Closure Guard (`QA-GIT-GATE-01`):** Every task concludes by passing all 10 stages of [`.agents/scripts/certify_task_completion.sh`](../.agents/scripts/certify_task_completion.sh) and creating a local `git commit`. Per [`.agents/rules/git_closure_gate.md`](../.agents/rules/git_closure_gate.md), no agent may execute `git push` or `npm publish` without explicit human authorization.

---

## 4. Related Documentation

* [Global English-First Entrypoint (`README.md`)](../README.md) · [Spanish Mirror (`README.es.md`)](../README.es.md)
* [Master Resource Catalog (`RESOURCES.md`)](../RESOURCES.md)
* [AI Agent Governance (`01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`)](01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md)
* [Secure Development Guide (`04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`)](04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)
