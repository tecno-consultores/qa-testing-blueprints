# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: QA 11X Pyramid & Continuous Documentation Sync

> **SUPREME CORPORATE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents (Google Antigravity, Claude Code, Hermes Agent, Cursor) and human developers.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation in Spanish.

---

## 1. Supreme Directive: Mandatory 11X Test Creation

Any addition, modification, or bug fix in application source code (`fastapi/`, `vue3/`, `python/`, `node-backend/`, `react-frontend/`, or `bash-scripts/`) **MUST strictly include** corresponding test suites across all applicable layers of the 11X quality pyramid:

1. **Backend Unit Layer (Pytest / Vitest):**
   - Backend suites (`tests/**/*.unit.py` or `test/**/*.unit.ts`) with **`>= 95.0%` branch and line coverage**.
   - Strict isolation: mock external I/O and network boundaries.
2. **Database & Migration Parity Layer:**
   - When modifying ORM models, immediately generate and verify the database migration against a real ephemeral database engine (e.g. PostgreSQL).
   - Zero tolerance for schema drift between code models and database tables (`.agents/scripts/verify_alembic_orm_parity.py`).
3. **Front-Back Contract Integration Layer:**
   - Validate live HTTP payloads, response shapes, and persistence against running ephemeral API and DB instances.
4. **Acceptance BDD Layer (Karate Labs):**
   - **ALWAYS** include or update BDD feature files in `fastapi/test/api_test.feature` (API contracts, status codes, headers, payload validation) and `vue3/test/ui_business_flow.feature` (end-to-end interactive UI flows).
   - Any new endpoint or UI view must have matching Karate scenarios.
5. **Zero-Orphan UI Component Invariant:**
   - Every single UI component or view (`.vue`, `.tsx`, `.jsx`) must have a dedicated `.unit.ts` or `.unit.tsx` test suite. Zero orphan components allowed (`.agents/scripts/verify_zero_orphan_vue_components.py`).
6. **Mutation Testing Resilience (Mutmut / Stryker):**
   - Tests must kill artificial logical mutations to prove test assertion rigor and eliminate false confidence.
7. **Linter Inflexibility & Zero-Warning Invariant:**
   - Static analysis scripts (`lint`) MUST enforce `--max-warnings 0` (for ESLint) or equivalent strict modes (Ruff, Mypy, ShellCheck). Any warning MUST fail the process immediately (`Exit Code 1`), eliminating unnoticed technical debt or cosmetic degradation.
8. **Hermetic Test Isolation (Zero Network Leaks):**
   - Unit tests (`.unit.py`, `.unit.ts`, `.unit.tsx`) MUST strictly isolate network boundaries. Outbound calls to external APIs or GitHub Raw during unit testing are strictly prohibited; developers and agents must mock or intercept network interfaces deterministically.

---

## 2. Rule Zero: Ephemeral Docker Execution & Execution Gates

- **NEVER** execute tests, migrations, linters, or operational scripts directly on the host machine (`Ubuntu`, `macOS`, or `Windows`). All executions must occur inside the project's ephemeral Docker containers (`docker-compose.qa.yml` and `Makefile`).
- **Critical Execution Gate:** Never declare a task complete based on static code reading alone; execute the test suite inside ephemeral Docker and verify exit code `0`.
- **Canonical Context-Compaction Scratchpad & Planning Tool (`.agents/ACTIVE_TASK.md`):** Prior to modifying code, formulate a phased plan (via `/plan` command or interactive plan artifact) and bootstrap `.agents/ACTIVE_TASK.md` from `.agents/ACTIVE_TASK.md.example` (git-ignored). Update checklist items in real-time (`- [ ]` → `- [x]`) to persist progress across IDE crashes, session restarts, or LLM context compactions. Never create `ACTIVE_TASK.md` in the repository root. Mark as `COMPLETED (100%)` upon closure.
- **Production `--no-dev` Cleanliness:** Ensure `src/` never imports packages from `[project.optional-dependencies].dev` (e.g. `pytest`, `radon`, `mutmut`), preventing `ModuleNotFoundError` when building production images with `uv sync --frozen --no-dev`.

---

## 3. Continuous Mandatory Documentation Sync

Following any code modification, the AI agent **MUST autonomously and continuously synchronize**:

1. **Affected Guides & Manuals in `docs/`:**
   - Update operational manuals, configuration guides, and API contract references.
2. **Change History in `CHANGELOG.md`:**
   - Record additions, modifications, and fixes under `## [Unreleased]`.
3. **Assurance Metrics in `TESTING.md`:**
   - Record updated test counts, pass rates, and coverage percentages.
4. **Project Root (`README.md`, `FAQ.md`, `RESOURCES.md`):**
   - Update whenever architectural blueprints, tools, or dependencies evolve.

---

## 4. Pre-Conclusion Verification Gate

Before completing any task, execute:
```bash
./.agents/scripts/certify_task_completion.sh
```
All checks must pass with exit code 0.
