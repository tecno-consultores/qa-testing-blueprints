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

---

## 2. Rule Zero: Ephemeral Docker Execution

**NEVER** execute tests, migrations, linters, or operational scripts directly on the host machine (`Ubuntu`, `macOS`, or `Windows`). All executions must occur inside the project's ephemeral Docker containers (`docker-compose.qa.yml` and `Makefile`).

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
