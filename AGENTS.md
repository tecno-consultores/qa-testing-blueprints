# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 🤖 AI Agent Directives & Technical Governance — QA Testing Blueprints (Standard 11X)

Welcome to the **QA Testing Blueprints** repository. All AI coding assistants (Google Antigravity, Claude Code / Claude Desktop, Hermes Agent, Cursor, Windsurf, etc.) and human developers must strictly adhere to the Level-11X corporate quality, security, and testing directives defined here and in `.agents/rules/`.

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always interact with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish.
>
> **TOKEN EFFICIENCY & LANGUAGE DESIGN:**
> All directives in `.agents/rules/` and skills in `.agents/skills/` are maintained in concise, high-density technical English to optimize token utilization (~35% reduction in context window) and ensure maximum logical adherence across LLMs (Google Antigravity, Claude, Hermes Agent, Cursor). All human-facing documentation (`docs/`, `CHANGELOG.md`, `README.md`, `TESTING.md`) remains strictly in Spanish. See [.agents/README.md](.agents/README.md) for full architectural rationale.

---

## 1. Active Rules in `.agents/rules/`

1. [mandatory_qa_pyramid_and_doc_sync.md](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md):
   - **Supreme Directive — Mandatory 11X Test Creation & Zero Hardcoded Pass:** Any code addition or modification MUST strictly include corresponding test suites across all applicable layers of the 11X quality pyramid. Includes backend unit tests with `>= 95%` coverage, frontend unit tests (Vitest 100% pass), real database migration verification, front-back integration contracts, and **ALWAYS Karate Labs BDD scenarios** for API (`fastapi/test/api_test.feature`, injecting dynamic `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` on mutable `POST`/`PUT`/`PATCH`/`DELETE` requests) and UI (`vue3/test/ui_business_flow.feature`). Quality gates and test runners MUST never return hardcoded `true` or `'PASSED'` when a check is skipped or unverified (return `'SKIPPED'` or `detected: false`).
   - **Anti-Silo Cross-Module State Propagation:** Never validate a state mutation in Module A (`POST`/`PUT`/`PATCH`/`DELETE`) by checking only its `HTTP 200/201` status while testing Consumer Module B with disconnected mocks. Immediately query Consumer Module B `GET` endpoints and stores against the live database without intermediate mocks to verify end-to-end propagation across KPIs, badges, and maps.
   - **Zero-Orphan UI Component Invariant:** Every UI component or view must have a dedicated or active unit test suite maintaining a 100% pass rate.
   - **Mandatory Test Execution:** The full test suite MUST be executed and passed inside ephemeral Docker containers (`Rule Zero`) after EACH task modifying code before concluding.
   - **Continuous Mandatory Documentation Sync & Concise `CHANGELOG.md` Hygiene:** Autonomously and continuously update affected documentation in `docs/`, `CHANGELOG.md` (under `## [Unreleased]`, maintaining a single header per version with concise 1–2 line executive bullets and prohibiting internal sub-milestone log dumps), `TESTING.md`, and `README.md`.

2. [secure_development_and_testing_guidelines.md](.agents/rules/secure_development_and_testing_guidelines.md):
   - **Anti-Mock Blindness:** ORM changes require immediate versioned migrations verified against real database engines. Never rely on mocks alone when testing persistence. In unit tests using `MockDbSession`, validate all SQLAlchemy `JSON`/`JSONB` columns (`AuditLog.before_state`, `AuditLog.after_state`) with `json.dumps()` without `default=str`, and populate ORM `Numeric(p, s)` fixtures with `decimal.Decimal` instances (matching PostgreSQL `asyncpg`) to prevent `TypeError: Object of type Decimal is not JSON serializable` escapes.
   - **Security-by-Design (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2):**
     - Forced PostgreSQL Row-Level Security (RLS) per tenant with a dedicated `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` application role, multi-transaction RLS persistence via `session.sync_session.info` + `@event.listens_for(AsyncSession.sync_session_class, "after_begin")` (re-executing `SET LOCAL app.current_tenant_id` across post-commit transactions), and scoped `SECURITY DEFINER` (`SET search_path = public`) SQL functions for pre-authentication lookups (`slug` login / bootstrap count). Anti-SSRF URL validation, AES-256-GCM Vault cryptography (FIPS 140-3 validated modules + memory secret zeroization), HMAC-SHA256 CSRF protection, mandatory `Idempotency-Key` headers on state-mutating endpoints, and **Service-Layer RBAC Defense (Anti-`Depends()` Bypass)** (validating `claims["role"]` / `claims["rol"]` inside service functions invoked by internal MCP/JSON-RPC dispatchers and routing mutating MCP tools through `ApprovalRequest` `AWAITING_APPROVAL`).
     - **Session & Identity Governance:** Max concurrent session limits (`APSC-DV-000010`), role-tiered idle timeouts (10m privileged / 15m standard, `APSC-DV-000070/000080`), CSPRNG session ID rotation on login/privilege change (`APSC-DV-002250..002290`), full client storage purge (`localStorage`, `sessionStorage`, `CacheStorage`) + explicit logoff confirmation (`APSC-DV-000060/000100/002240`), 3-attempt/15m account lockout (`APSC-DV-000530`) with constant-time Argon2id anti-enumeration, 15-char/5-gen password policy (`APSC-DV-001680..001780`), 72h temp / 35d inactive account auto-disable (`APSC-DV-000300/000320`), Step-Up re-auth, and mTLS/PKI validation.
     - **Input, XML, Deserialization & File Hardening:** Unicode `NFKC` canonicalization before validation (`APSC-DV-002520`), XML DTD/external entity disablement (`defusedxml` / `resolve_entities=False`, `APSC-DV-002390/002550`), zero `pickle`/`yaml.load`/`shell=True` (`APSC-DV-002510`), and magic-byte file upload verification + allowlisted index path mapping (`APSC-DV-002485/002960`).
     - **Tamper-Proof Auditing, Deterministic WORM Serialization, Semantic Audit Integrity, Fail-Secure, OSHP & Supply Chain:** UTC ms-granularity audit logs chained with HMAC/SHA-256 (`APSC-DV-001350`) ordered by a monotonic `BIGINT` sequence (`seq_num`) + `SELECT pg_advisory_xact_lock(hashtext(tenant_key))` + in-session `_in_tx_audit_hash` / `_rg_in_tx_audit_hash` tracking and `await session.flush()` (never ordering solely by `created_at DESC`). CR/LF log injection sanitization, zero secrets/tokens in logs (`APSC-DV-000650`), 75% audit storage capacity alerting (`APSC-DV-001090`), DB export credential scrubbing (`APSC-DV-003310`), OWASP Secure Headers (OSHP), Fail-Secure initialization + startup self-test (`APSC-DV-002310/002770`), OWASP API Security Top 10 (2023) + anti-data-mining quotas (`APSC-DV-000450`), programmatic Threat Modeling (`pytm`, `APSC-DV-003230`), and signed CycloneDX SBOM/CBOM (`ECMA-424`, `APSC-DV-001430/003140`). Never replace `write_audit_log` with a blind `AsyncMock` without asserting arguments (while allowing direct unit tests of the real `write_audit_log` function); ensure visible identity fields (`actor_username`, `resource_display_name`) resolve to human-readable names and never match raw UUID v4 strings (`claims.get("sub")`).
     - **Non-Root Container Coverage (`COVERAGE_FILE=/tmp/.coverage`):** Never pass `-o addopts=""` to `pytest` without `--cov=src --cov-fail-under=95`, and always inject `-e COVERAGE_FILE=/tmp/.coverage` in ephemeral Docker containers so non-root users (`UID 1001`) can write SQLite coverage files without host volume permission errors.
   - **Visual Geometry & In-Flow Ergonomics (Anti-JSDOM):** JSDOM does not calculate layout or bounding boxes (always returns 0x0). Validate DOM hierarchy and inspect viewports in real browser sessions. Prohibit fixed floating footers that steal vertical space; enforce in-flow footers inside `<main>` with `margin-top: auto`.

3. [frontend_parity_and_closure.md](.agents/rules/frontend_parity_and_closure.md):
   - **Terminal ↔ Frontend Parity:** Zero console-only actions or orphan API endpoints without a matching web interface.
   - **Zero Read-Only Operational Consoles:** Operational data tables MUST offer tactical mutation actions (create, edit, toggle, delete, wizards) instead of passive read-only views.
   - **Dual Auto + Manual Refresh, Semantic Event Badges & Batch Per-Item Validation:** Monitoring views, NOC wallboards, and live maps MUST combine periodic/reactive updates (`setInterval` with `onUnmounted` cleanup + WebSocket) with an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`). Event classifiers MUST map categories to true semantic badges (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without catch-all `else` domain labels. Views consuming batch execution endpoints (`POST .../execute`) MUST inspect `res.data.results[].status` per resource instead of assuming global success from `HTTP 200 OK`.
   - **Closure Protocol:** Strict execution of tests in ephemeral Docker, secret scanning, dependency audit, and clean git staging.

4. [continuous_agent_evolution.md](.agents/rules/continuous_agent_evolution.md):
   - **Autonomous Evolution of `.agents/` & Thin-Repo Consumer Project Anti-Collision:** Proactively update rules, skills, and automation scripts whenever discovering an improvement opportunity, unhandled edge case, procedure automation, or token optimization without waiting for user prompting. In consumer projects (e.g. `rosgrid`), consume the 5 corporate skills and 7 canonical rules from the global user configuration (`~/.gemini/config/skills/`, `~/.gemini/GEMINI.md`, etc.) without duplicating them in `<project>/.agents/`, and isolate domain-specific rules in `.agents/rules/domain_<project>_*.md` or outside the `AGENTS.md` connector block (`reconcile-agents`).

5. [anti_regression_and_side_effects_guardrail.md](.agents/rules/anti_regression_and_side_effects_guardrail.md):
   - **Anti-Regression & Blast-Radius Governance:** Zero degradation of pre-existing functionality. Mandatory pre-modification impact audit for shared files and AST blast radius (`.agents/scripts/inspect_blast_radius.py` / `inspect_ast_blast_radius`). **If the AST graph (`graphify-out/graph.json`) does not exist, create it first via `./scripts/actualizar-grafos-graphify.sh`, and ALWAYS update the AST graph upon finishing changes.** Shell-capable agents MUST execute AST inspection directly via CLI/scripts. Preserve valid known state in frontend stores on error (anti-destructive catch).

6. [ground_truth_fixtures_and_negative_invariants.md](.agents/rules/ground_truth_fixtures_and_negative_invariants.md):
   - **Universal Trimodal Fixtures, 3-Phase Temporal Lifecycle, Heavy-Transfer Timeouts & Negative Invariants:** Eradicate mock blindness by testing integrations against three raw fixtures: Factory Default / Virgin (asserting negative invariants), Nominal Configured (asserting active/healthy), and Degraded/Unsupported/Partial Batch Failure (asserting graceful degradation without 500 errors, per-item `results[].status` inspection on `HTTP 200 OK` batch responses, and per-request timeout overrides `>= 180s` + `0-byte` truncated file cleanup on synchronous binary/firmware transfers). Time-bounded entities (`starts_at`/`ends_at`, 60s Safe Mode, TTLs) MUST be tested across all **3 clock phases**: Phase 1 Pending (`t < starts_at`, `Programada`), Phase 2 Active/In-Progress (`starts_at <= t <= ends_at`, `En Curso` / `Activa`), and Phase 3 Expired/Reverted (`t > ends_at` or Cancelled).

7. [active_task_and_planning_resilience.md](.agents/rules/active_task_and_planning_resilience.md):
   - **Active Task Invariant & Planning Tool Resilience:** Prior to modifying code on non-trivial tasks, AI assistants MUST invoke planning tools (`/plan` or interactive plan artifacts) and persist phase checklists in `.agents/ACTIVE_TASK.md` (bootstrapped from `.agents/ACTIVE_TASK.md.example`). Live real-time updates (`- [ ]` → `- [x]`) guarantee zero context loss across IDE crashes, session restarts, or context compaction. Mark as `COMPLETED (100%)` upon closure.

---

## 2. Rule Zero: Ephemeral Docker Execution

**NEVER** execute tests, migrations, linters, or operational scripts directly on the host machine (`Ubuntu`, `macOS`, or `Windows`). All executions must occur inside ephemeral Docker containers (`docker-compose.qa.yml` and `Makefile`).

---

## 3. Skills Catalog in `.agents/skills/`

1. `qa-11x-architect`: Master QA 11X & DevSecOps Architect enforcing the 13 layers of the 11X Quality Pyramid, 10 Non-Negotiable Laws, 8 UAT Anti-Blindness Rules (including `SEC-16` Multi-Step Pre-Auth Continuity), High-IQ Token Economy, and 22 DISA STIG V6R5 / OWASP v4.2 controls with 9 on-demand `references/*.md` modules (`SKILL.md < 20 KB`).
2. `qa-11x-docker-certifier`: QA 11X Corporate Standard certifier in ephemeral Docker (coverage `>= 95%`, SonarJS, Karate Labs, mutation testing, zero host contamination).
3. `docker-trivy-keydb-hardening`: Container hardening (Trivy HIGH/CRITICAL = 0), multi-threaded KeyDB in-memory caching engine, non-root users, and performance optimization.
4. `graphify-ast-navigator`: Bidirectional AST Knowledge Graph navigation for Code Q&A and refactoring (`declaring_files`, incoming callers, outgoing callees), blast-radius pre-audit, layer boundary compliance, and CLI-first query protocol.
5. `refactoring-ui`: Visual hierarchy, spacing, typography (`tabular-nums`), OKLCH color contrast (WCAG 2.1 AA), depth, dark mode, and Anti-JSDOM geometry rules from *Refactoring UI* (Wathan & Schoger) with 9 modular `references/*.md` files.

---

## 4. Automation Scripts in `.agents/scripts/`

- `certify_task_completion.sh`: End-to-end 10-stage certification gate enforcing secret scanning, IaC auditing, i18n integrity, zero orphan UI components, zero orphan API endpoints, topological health, ORM parity, cryptographic manifest integrity, roadmap & active task consistency, and documentation/test sync.
- `verify_roadmap_consistency.py`: Automated bidirectional consistency validator enforcing strict parity between `ROADMAP.md` summary table and granular section tasks (`- [x]` / `- [ ]`), plus zero-pending tasks invariant in `ACTIVE_TASK.md` when marked completed.
- `verify_docs_invariants.py`: Automated documentation & cognitive-budget validator enforcing `SKILL.md < 20 KB`, `ACTIVE_TASK <= 40` lines, valid MCP resource topics, non-duplicate security section headers, and zero stale tool/image/resource counts across docs.
- `verify_alembic_orm_parity.py`: Automated parity validator between ORM models and database migrations (detects schema drift and `revision > 32` chars).
- `verify_zero_orphan_vue_components.py`: Automated parity validator ensuring 100% of UI components and views have active unit test suites.
- `verify_no_orphan_api_endpoints.py`: Automated bidirectional parity validator ensuring 0 frontend calls to non-existent backend routes (404/405) and 0 unreferenced backend routes.
- `verify_json_no_duplicate_keys.py`: Automated integrity validator detecting duplicate keys in i18n JSON locale files.
- `inspect_blast_radius.py`: Automated bidirectional AST inspector for Code Q&A and pre-refactoring blast radius (declaring `file:line`, incoming callers, and outgoing callees).
- `verify_topological_health.py`: Automated AST architectural validator detecting forbidden cross-layer coupling and layer boundary violations.

---

## 5. 3-Path Proportional Execution & Mandatory 11-Step Closure Protocol

> **TOKEN & COMPUTE ECONOMY (`DOCS_ONLY` vs. `MICRO_CHANGE` vs. `CODE_CHANGE` / `FULL_11X`):**
> - **Fast-Path Documental (`DOCS_ONLY` — when ONLY `*.md` / `docs/` files are modified):** DO NOT trigger test suite execution (`run_ephemeral_qa` / Docker QA runs) and DO NOT rebuild AST graphs (`./scripts/actualizar-grafos-graphify.sh`). Only synchronize affected documentation/`CHANGELOG.md`, run `./.agents/scripts/certify_task_completion.sh`, and push to `git`.
> - **Surgical-Path de Micro-Cambio (`MICRO_CHANGE` — when `<= 3` files change, 0 new API routes/ORM migrations, and AST Blast Radius is `LOW` `< 5` callers):** Formulate a 3-line inline plan (skip heavy `/plan` artifact), run `inspect_blast_radius.py`, execute the targeted unit test + affected stack suite in Docker (`run_ephemeral_qa`), incrementally update the stack's AST graph (`./scripts/actualizar-grafos-graphify.sh`), update `CHANGELOG.md`, and run `./.agents/scripts/certify_task_completion.sh` (`certify_11x_gate`) + `git push`.
> - **Full-Path de Código (`CODE_CHANGE` / `FULL_11X` — when `> 3` files, new endpoints/views, ORM schemas, security controls, or `MEDIUM`/`HIGH` Blast Radius change):** Execute the 11-step protocol below from start to finish:
> - **High-IQ Token Economy (6 Cognitive Invariants):** (1) `Graphify AST-First, Grep-Fallback, Windowed-Read-Second` (for any Code Q&A or pre-change, query `graphify-out/graph.json` & `GRAPH_REPORT.md` first before `grep` or `read_file` with `StartLine`/`EndLine` 40–80 lines; never read full files `> 150` lines blindly), (2) `Zero Redundant Re-Read`, (3) `Parallel Tool Call Batching` (group independent reads/checks in 1 turn), (4) `Subagent Context Isolation` (delegate `> 4`-file exploration to a subagent returning `<= 20` lines with `file:line` pointers), (5) `Pass-Quiet & RTK Terminal Filtering` (`git status -s`, `git diff --stat`, no duplicate MCP calls), and (6) `Surgical Diff Edits & Compact ACTIVE_TASK.md (<= 40 lines)` + suggest `/compact` on closure.
>
> 1. **Planning Tool (`/plan`):** ALWAYS invoke `/plan` or an interactive plan artifact before modifying code on `FULL_11X` tasks.
> 2. **Active Task Diary (`.agents/ACTIVE_TASK.md`):** ALWAYS initialize and update `.agents/ACTIVE_TASK.md` in real time (`- [ ]` → `- [x]`, kept `<= 40 lines`).
> 3. **Code Q&A & Pre-Modification AST Graph Audit (Create If Missing):** ALWAYS check `python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` (`inspect_ast_blast_radius`) and `graphify-out/GRAPH_REPORT.md` when answering code/architecture questions or before modifying code; **if `graphify-out/graph.json` does not exist, create it first via `./scripts/actualizar-grafos-graphify.sh`**.
> 4. **Repository Governance, Cleanup & Gitignore Sync:** ALWAYS update `AGENTS.md`, `.agents/rules/`, `.agents/skills/`, `scripts/limpieza.sh`, and `.gitignore` when introducing new rules, tools, or temporary artifacts.
> 5. **Mandatory 11X Test Creation (ALWAYS Including Karate Labs):** ALWAYS create or extend unit (`>= 95%` coverage) and integration tests, **ALWAYS including Karate Labs BDD scenarios** (`.feature`).
> 6. **Full Test Suite Execution (`Rule Zero`):** ALWAYS execute the test suite inside ephemeral Docker containers (`Rule Zero` / `run_ephemeral_qa`), certifying `>= 95%` coverage, 100% passed assertions, Karate Labs BDD validation, and 0 warnings.
> 7. **Documentation & Technical Specs Sync:** ALWAYS update `docs/`, `docs/specs/`, `README.md`, and `TESTING.md`.
> 8. **Changelog Update:** ALWAYS update `CHANGELOG.md` (under `## [Unreleased]`).
> 9. **Roadmap Synchronization:** Update `ROADMAP.md` whenever applicable (`python3 .agents/scripts/verify_roadmap_consistency.py`).
> 10. **Post-Modification AST Graph Update:** ALWAYS update the AST knowledge graph upon finishing code and test changes via `./scripts/actualizar-grafos-graphify.sh` (incremental per modified stack).
> 11. **11X Certification Gate, QA-Escape Post-Mortem & Git Push:** Run `./scripts/verificar-secretos.sh`, `./scripts/auditar-infra.sh`, and `./.agents/scripts/certify_task_completion.sh` (10/10 gates), mark `.agents/ACTIVE_TASK.md` as `COMPLETED (100%)`, and **ALWAYS commit and push to git (`git add`, `git commit`, `git push`)**. On QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr`.
