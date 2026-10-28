# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# 🤖 AI Agent Directives & Technical Governance — QA Testing Blueprints (Standard 11X)

Welcome to the **QA Testing Blueprints** repository. All AI coding assistants (Google Antigravity, Claude Code / Claude Desktop, Hermes Agent, Cursor, Windsurf, etc.) and human developers must strictly adhere to the Level-11X corporate quality, security, and testing directives defined here and in `.agents/rules/`.

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish.
>
> **TOKEN EFFICIENCY & LANGUAGE DESIGN:**
> All directives in `.agents/rules/` and skills in `.agents/skills/` are maintained in concise, high-density technical English to optimize token utilization (~35% reduction in context window) and ensure maximum logical adherence across LLMs (Google Antigravity, Claude, Hermes Agent, Cursor). All human-facing documentation (`docs/`, `CHANGELOG.md`, `README.md`, `TESTING.md`) remains strictly in Spanish. See [.agents/README.md](file:///.agents/README.md) for full architectural rationale.

---

## 1. Active Rules in `.agents/rules/`

1. [mandatory_qa_pyramid_and_doc_sync.md](file:///.agents/rules/mandatory_qa_pyramid_and_doc_sync.md):
   - **Supreme Directive — Mandatory 11X Test Creation:** Any code addition or modification MUST strictly include corresponding test suites across all applicable layers of the 11X quality pyramid. Includes backend unit tests with `>= 95%` coverage, frontend unit tests (Vitest 100% pass), real database migration verification, front-back integration contracts, and **ALWAYS Karate Labs BDD scenarios** for API (`fastapi/test/api_test.feature`) and UI (`vue3/test/ui_business_flow.feature`).
   - **Zero-Orphan UI Component Invariant:** Every UI component or view must have a dedicated or active unit test suite maintaining a 100% pass rate.
   - **Mandatory Test Execution:** The full test suite MUST be executed and passed inside ephemeral Docker containers (`Rule Zero`) after EACH task modifying code before concluding.
   - **Continuous Mandatory Documentation Sync:** Autonomously and continuously update affected documentation in `docs/`, `CHANGELOG.md` (under `## [Unreleased]`), `TESTING.md`, and `README.md`.

2. [secure_development_and_testing_guidelines.md](file:///.agents/rules/secure_development_and_testing_guidelines.md):
   - **Anti-Mock Blindness:** ORM changes require immediate versioned migrations verified against real database engines. Never rely on mocks alone when testing persistence.
   - **Security-by-Design:** Forced PostgreSQL Row-Level Security (RLS) per tenant, anti-SSRF URL validation, AES-256-GCM Vault cryptography, HMAC-SHA256 CSRF protection, and mandatory `Idempotency-Key` headers on state-mutating endpoints.
   - **Visual Geometry & In-Flow Ergonomics (Anti-JSDOM):** JSDOM does not calculate layout or bounding boxes (always returns 0x0). Validate DOM hierarchy and inspect viewports in real browser sessions. Prohibit fixed floating footers that steal vertical space; enforce in-flow footers inside `<main>` with `margin-top: auto`.

3. [frontend_parity_and_closure.md](file:///.agents/rules/frontend_parity_and_closure.md):
   - **Terminal ↔ Frontend Parity:** Zero console-only actions or orphan API endpoints without a matching web interface.
   - **Zero Read-Only Operational Consoles:** Operational data tables MUST offer tactical mutation actions (create, edit, toggle, delete, wizards) instead of passive read-only views.
   - **Closure Protocol:** Strict execution of tests in ephemeral Docker, secret scanning, dependency audit, and clean git staging.

4. [continuous_agent_evolution.md](file:///.agents/rules/continuous_agent_evolution.md):
   - **Autonomous Evolution of `.agents/`:** Proactively update rules, skills, and automation scripts whenever discovering an improvement opportunity, unhandled edge case, procedure automation, or token optimization without waiting for user prompting.

5. [anti_regression_and_side_effects_guardrail.md](file:///.agents/rules/anti_regression_and_side_effects_guardrail.md):
   - **Anti-Regression & Blast-Radius Governance:** Zero degradation of pre-existing functionality. Mandatory pre-modification impact audit for shared files and AST blast radius (`.agents/scripts/inspect_blast_radius.py`). Shell-capable agents MUST execute AST inspection directly via CLI/scripts. Preserve valid known state in frontend stores on error (anti-destructive catch).

6. [ground_truth_fixtures_and_negative_invariants.md](file:///.agents/rules/ground_truth_fixtures_and_negative_invariants.md):
   - **Universal Trimodal Fixtures & Negative Invariants:** Eradicate mock blindness by testing integrations against three raw fixtures: Factory Default / Virgin (asserting negative invariants), Nominal Configured (asserting active/healthy), and Degraded/Unsupported (asserting graceful degradation without 500 errors).

---

## 2. Rule Zero: Ephemeral Docker Execution

**NEVER** execute tests, migrations, linters, or operational scripts directly on the host machine (`Ubuntu`, `macOS`, or `Windows`). All executions must occur inside ephemeral Docker containers (`docker-compose.qa.yml` and `Makefile`).

---

## 3. Skills Catalog in `.agents/skills/`

1. `qa-11x-docker-certifier`: QA 11X Corporate Standard certifier in ephemeral Docker (coverage `>= 95%`, SonarJS, Karate Labs, mutation testing, zero host contamination).
2. `docker-trivy-keydb-hardening`: Container hardening (Trivy HIGH/CRITICAL = 0), multi-threaded KeyDB in-memory caching engine, non-root users, and performance optimization.
3. `graphify-ast-navigator`: AST Knowledge Graph navigation, blast-radius pre-audit, layer boundary compliance, and CLI-first query protocol.

---

## 4. Automation Scripts in `.agents/scripts/`

- `certify_task_completion.sh`: End-to-end certification gate enforcing secret scanning, IaC auditing, i18n integrity, zero orphan UI components, topological health, ORM parity, and documentation sync.
- `verify_alembic_orm_parity.py`: Automated parity validator between ORM models and database migrations (detects schema drift).
- `verify_zero_orphan_vue_components.py`: Automated parity validator ensuring 100% of UI components and views have active unit test suites.
- `verify_json_no_duplicate_keys.py`: Automated integrity validator detecting duplicate keys in i18n JSON locale files.
- `inspect_blast_radius.py`: Automated pre-refactoring blast radius inspector calculating incoming dependency edges across the codebase.
- `verify_topological_health.py`: Automated AST architectural validator detecting forbidden cross-layer coupling and layer boundary violations.

---

## 5. Mandatory Task Closure Protocol

> **NON-NEGOTIABLE:** Following **EACH** task or user request modifying, adding, or fixing source code, the AI agent **MUST** autonomously execute the following protocol before concluding:
>
> 1. **Mandatory 11X Test Creation (ALWAYS Including Karate Labs):** Create or extend unit and integration tests, and **ALWAYS incorporate Karate Labs BDD scenarios** for API and UI.
> 2. **Mandatory Test Execution & Anti-Regression Verification:** Execute the complete test suite in ephemeral Docker containers (`Rule Zero`), certifying `>= 95%` coverage, 100% passed assertions, Karate Labs BDD validation, and 0 typing/linting errors.
> 3. **Mandatory Documentation Synchronization:** Unconditionally update all affected files across `docs/`, `CHANGELOG.md` (section `## [Unreleased]`), `TESTING.md`, and `README.md`.
> 4. **Secret Scanning, Local Dependency Audit & ORM Parity:** Run `./scripts/verificar-secretos.sh`, execute `./auditar-infra.sh`, and run `.agents/scripts/certify_task_completion.sh`.
