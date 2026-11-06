# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: QA 11X Pyramid & Continuous Documentation Sync

> **SUPREME CORPORATE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents (Google Antigravity, Claude Code, Hermes Agent, Cursor) and human developers.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish.

---

## 1. Supreme Directive: Mandatory 11X Test Creation

Any addition, modification, or bug fix in application source code (`fastapi/`, `vue3/`, `python/`, `node-backend/`, `react-frontend/`, `php/`, or `bash-scripts/`) **MUST strictly include** corresponding test suites across all applicable layers of the 11X quality pyramid:

1. **Backend Unit Layer (Pytest / Vitest / Pest / PHPUnit):**
   - Backend suites (`tests/**/*.unit.py`, `test/**/*.unit.ts`, or `tests/**/*Test.php`) with **`>= 95.0%` branch and line coverage** (`pytest-cov`, `vitest v8`, or `pcov`).
   - Strict isolation: mock external I/O and network boundaries.
2. **Database & Migration Parity Layer:**
   - When modifying ORM models, immediately generate and verify the database migration against a real ephemeral database engine (e.g. PostgreSQL via Alembic or Doctrine/Laravel migrations).
   - Zero tolerance for schema drift between code models and database tables (`.agents/scripts/verify_alembic_orm_parity.py` or `doctrine:schema:validate`).
3. **Front-Back Contract Integration & Anti-Silo Cross-Module State Propagation Layer:**
   - Validate live HTTP payloads, response shapes, and persistence against running ephemeral API and DB instances.
   - **Anti-Silo Cross-Module Propagation Invariant:** It is strictly prohibited to validate a mutating operation in Module A (`POST`/`PUT`/`PATCH`/`DELETE`, e.g. scheduling/cancelling a maintenance window, activating Safe Mode, or changing an administrative state) by checking only its `HTTP 200/201` response while testing Consumer Module B (e.g. NOC Wallboard, Inventory, Command Center) with hand-crafted static mocks. The test suite MUST immediately invoke the query endpoints (`GET`) and stores of Consumer Modules B **without intermediate mocks**, certifying end-to-end propagation across KPI counters, badges, and live maps.
   - **Mandatory 3-Phase Temporal Lifecycle Assertion:** Every entity governed by time windows, countdowns, or TTL (`starts_at` / `ends_at`, 60s Safe Mode confirmation/rollback, 30s Step-Up tokens, leases) MUST be tested across all **3 clock phases**: Phase 1 Pending/Scheduled (`t < starts_at`, `Programada`), Phase 2 Active/In-Progress (`starts_at <= t <= ends_at`, `En Curso` / `Activa`, verifying the background scheduler remains alive and projects the active state to consumers), and Phase 3 Expired/Reverted/Cancelled (`t > ends_at`, verifying automatic nominal state restoration and audit trail).
   - **Audit Payload & Semantic Badge Integrity:** Never replace `write_audit_log` with an uninspected `AsyncMock()` without asserting its call arguments. Assert that visible identity fields (`actor_username`, `resource_display_name`) resolve to human-readable strings and never match a raw UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), and prohibit generic catch-all `else` clauses in UI event badge mappers (e.g. `else return 'MAINTENANCE'`).
   - **Heavy-Transfer Timeout Separation (`>= 180s` + Zero-Byte Purge) & Batch `HTTP 200 OK` Per-Item Validation:** Instant unit test mocks (`AsyncMock` / `vi.fn()`) mask short HTTP telemetry timeouts (`5s–10s`) that abort real synchronous package/firmware/archive downloads (e.g. ~21 MB `.npk` images) leaving `0-byte` truncated files, as well as `HTTP 200 OK` batch responses carrying per-item failures (`results[].status == "FAILED"` or `"ERROR: bad HTTP response"`). Every HTTP client performing synchronous heavy transfers MUST allow and pass a per-request timeout override (`timeout >= 180s`) and purge `0-byte` artifacts (verified via `call_args` in unit tests). Every batch consumer (`POST .../execute`) MUST inspect `results[].status` per resource instead of assuming blanket success from `HTTP 200 OK`.
4. **Acceptance BDD Layer (Karate Labs):**
   - **ALWAYS** include or update BDD feature files in `fastapi/test/api_test.feature` / `php/test/api_test.feature` (API contracts, status codes, headers, payload validation) and `vue3/test/ui_business_flow.feature` (end-to-end interactive UI flows).
   - Any new endpoint or UI view must have matching Karate scenarios.
5. **Zero-Orphan UI Component Invariant:**
   - Every single UI component or view (`.vue`, `.tsx`, `.jsx`) must have a dedicated `.unit.ts` or `.unit.tsx` test suite. Zero orphan components allowed (`.agents/scripts/verify_zero_orphan_vue_components.py`).
6. **Mutation Testing Resilience (Mutmut / Stryker / Infection):**
   - Tests must kill artificial logical mutations (`MSI >= 80%`) to prove test assertion rigor and eliminate false confidence.
7. **Linter Inflexibility & Zero-Warning Invariant:**
   - Static analysis scripts (`lint`) MUST enforce `--max-warnings 0` (for ESLint) or equivalent strict modes (Ruff, Mypy, PHPStan `level: max`, Psalm `--taint-analysis`, ShellCheck). Any warning MUST fail the process immediately (`Exit Code 1`), eliminating unnoticed technical debt or cosmetic degradation.
8. **Hermetic Test Isolation (Zero Network Leaks):**
   - Unit tests (`.unit.py`, `.unit.ts`, `.unit.tsx`) MUST strictly isolate network boundaries. Outbound calls to external APIs or GitHub Raw during unit testing are strictly prohibited; developers and agents must mock or intercept network interfaces deterministically.

---

## 2. Rule Zero, Dual Execution Path (`DOCS_ONLY` vs. `CODE_CHANGE`) & Execution Gates

- **NEVER** execute tests, migrations, linters, or operational scripts directly on the host machine (`Ubuntu`, `macOS`, or `Windows`). All executions must occur inside the project's ephemeral Docker containers (`docker-compose.qa.yml` and `Makefile`).
- **Dual Execution Path (Token & Compute Economy):**
  - **`DOCS_ONLY` Fast-Path:** When a task modifies **only documentation** (`*.md`, `docs/**`, `CHANGELOG.md`, `README.md`, `ROADMAP.md`) and zero executable code, templates, scripts, or configurations, **DO NOT trigger test suite execution** (`run_ephemeral_qa` / `make qa-*`) and **DO NOT rebuild the AST knowledge graph** (`./scripts/actualizar-grafos-graphify.sh`). Only run `./.agents/scripts/certify_task_completion.sh` (`certify_11x_gate`) and push to `git`.
  - **`CODE_CHANGE` Full-Path:** Whenever source code, templates, scripts, or configurations are modified, never declare the task complete based on static reading alone; execute the full test suite inside ephemeral Docker (`Rule Zero`) and verify exit code `0`.
- **Canonical Context-Compaction Scratchpad & Planning Tool (`.agents/ACTIVE_TASK.md`):** Prior to modifying code, formulate a phased plan (via `/plan` command or interactive plan artifact) and bootstrap `.agents/ACTIVE_TASK.md` from `.agents/ACTIVE_TASK.md.example` (git-ignored). Update checklist items in real-time (`- [ ]` → `- [x]`) to persist progress across IDE crashes, session restarts, or LLM context compactions. Never create `ACTIVE_TASK.md` in the repository root. Mark as `COMPLETED (100%)` upon closure.
- **Production `--no-dev` Cleanliness:** Ensure `src/` never imports packages from `[project.optional-dependencies].dev` (e.g. `pytest`, `radon`, `mutmut`), preventing `ModuleNotFoundError` when building production images with `uv sync --frozen --no-dev`.

---

## 3. Continuous Mandatory Documentation, Governance & AST Graph Sync

Following any code modification, the AI agent **MUST autonomously and continuously synchronize**:

1. **Affected Guides, Manuals & Technical Specifications (`docs/` & `docs/specs/`):**
   - ALWAYS update operational manuals, architecture guides, technical specifications (`docs/specs/*.md`), and API contract references.
2. **Change History in `CHANGELOG.md`:**
   - ALWAYS record additions, modifications, fixes, and security hardening under `## [Unreleased]`.
3. **Assurance Metrics in `TESTING.md` & Milestones in `ROADMAP.md`:**
   - ALWAYS record updated test counts, pass rates, and coverage percentages in `TESTING.md`.
   - Update `ROADMAP.md` whenever applicable, verifying bidirectional parity via `python3 .agents/scripts/verify_roadmap_consistency.py`.
4. **Project Root & Governance (`README.md`, `AGENTS.md`, `.agents/`, `scripts/limpieza.sh`, `.gitignore`):**
   - ALWAYS update `README.md`, repository governance files (`AGENTS.md`, `.agents/rules/`, `.agents/skills/`), workspace cleanup scripts (`scripts/limpieza.sh`), and `.gitignore` whenever architectural blueprints, tools, or artifacts evolve.
5. **Post-Modification AST Graph Refresh & Git Push:**
   - ALWAYS update the AST knowledge graph at the end of changes via `./scripts/actualizar-grafos-graphify.sh`.
   - ALWAYS commit and push verified changes to `git` (`git add`, `git commit`, `git push`) after passing the 11X certification gate.

---

## 4. Pre-Conclusion Verification Gate

Before completing any task, execute:
```bash
./.agents/scripts/certify_task_completion.sh
```
All checks must pass with exit code 0.
