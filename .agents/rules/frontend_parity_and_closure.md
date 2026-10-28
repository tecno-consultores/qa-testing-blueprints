# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Terminal ↔ Frontend Parity & Task Closure Protocol

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents and developers.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Terminal ↔ Frontend Parity Invariants

1. **Zero Console-Exclusive Actions:**
   - Any administrative, operational, or diagnostics action executable from the CLI/terminal MUST have an equivalent graphical interface in the frontend.
2. **Zero Orphan API Endpoints:**
   - Every route defined in the backend API MUST be paired with a frontend interface or view enabling inspection, parameter configuration, and interactive execution.
3. **Zero Read-Only Operational Consoles:**
   - Operational management tables must offer tactical mutation actions (create, edit, toggle enable/disable, delete with confirmation and setup wizards) whenever the backend API supports mutations. No screen may be left in a passive read-only state without operational justification.
4. **Non-Destructive UI Error Handling:**
   - Pinia / Redux stores must never reset populated arrays or objects to empty primitives (e.g. `setItems([])`) inside generic `catch` blocks if valid data already exists in memory. Maintain the last known valid state and set an explicit error or stale flag.

---

## 2. Proactive Vulnerability Audit

Before exposing new endpoints or frontend views:
1. **User Authentication & Authorization Checks:** Ensure locked or unauthenticated users cannot trigger protected actions.
2. **Automated SAST & Secret Checks:** Run static security audits (`bandit`, `ESLint Security`, `pip-audit`, `pnpm audit`) in ephemeral Docker with 0 High/Critical findings.
3. **Anti-XSS & Anti-CSRF:** Never bind unescaped dynamic HTML (`v-html` / `dangerouslySetInnerHTML`) without strict sanitization.

---

## 3. Mandatory Task Closure Protocol

After **EVERY** task or turn that adds, edits, or removes code or configuration files, the AI agent **MUST** autonomously execute this protocol before concluding:

1. **Mandatory 11X Test Creation (Including Karate Labs for API & UI):**
   - Backend mutations: add/update unit tests (`tests/**/*.unit.py`) AND mandatory BDD scenarios in Karate API (`fastapi/test/api_test.feature`).
   - Frontend mutations: add/update unit tests (`src/**/*.unit.ts`) AND mandatory BDD scenarios in Karate UI (`vue3/test/ui_business_flow.feature`).
2. **Full Ephemeral Docker Test Execution (`Rule Zero`):**
   - Backend: Run unit tests with `>= 95%` coverage and linting (`ruff`, `mypy --strict`).
   - Frontend: Run unit tests (100% pass) and type checks (`vue-tsc --noEmit`).
3. **Autonomous & Mandatory Multi-Layer Documentation Sync:**
   - Update affected operational manuals in `docs/`.
   - Update `CHANGELOG.md` under `## [Unreleased]`.
   - Update `TESTING.md` metrics and counts.
   - Update `README.md` when user-facing interfaces or architectures change.
4. **Secret, Dependency Vulnerability, i18n & Parity Certification:**
   - Run `./scripts/verificar-secretos.sh` (0 secret leaks).
   - Run `./auditar-infra.sh` (0 High/Critical findings).
   - Run `./.agents/scripts/certify_task_completion.sh` (all gates passed).
