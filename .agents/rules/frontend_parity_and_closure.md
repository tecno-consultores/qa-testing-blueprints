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
   - Every route defined in the backend API MUST be paired with a frontend interface or view enabling inspection, parameter configuration, and interactive execution (`.agents/scripts/verify_no_orphan_api_endpoints.py`).
3. **Zero Read-Only Operational Consoles:**
   - Operational management tables must offer tactical mutation actions (create, edit, toggle enable/disable, delete with confirmation and setup wizards) whenever the backend API supports mutations. No screen may be left in a passive read-only state without operational justification.
4. **Non-Destructive UI Error Handling & Null-Safe Async Collections:**
   - Pinia / Redux stores must never reset populated arrays or objects to empty primitives (e.g. `setItems([])`) inside generic `catch` blocks if valid data already exists in memory. Maintain the last known valid state and set an explicit error or stale flag.
   - Always guard asynchronous array/collection access in templates and computed properties (`(items ?? []).length`, `item?.subitems?.length`) to prevent `TypeError` crashes during partial renders.
5. **Proactive RBAC UI Visibility (Zero 403 Dead-Ends):**
   - Never expose navigation links, tabs, or mutation buttons to roles that will receive `HTTP 403 Forbidden` from the backend. Filter routes and actions proactively by user role (`v-if` / role guards) in addition to backend RBAC enforcement.
6. **Multi-Viewport Ergonomics, Theme Parity & Colorblind Accessibility:**
   - Certify zero horizontal overflow (`scrollWidth <= innerWidth`) across Mobile (`375x667`), Tablet (`768x1024`), and Desktop (`1440x900`).
   - Enforce a single primary solid CTA button per container/modal, define all CSS custom properties (`--var`) across every theme (dark, light, high-contrast) with zero orphan tokens, and pair status colors with geometric/text indicators (`▲`/`●`/`■`/`✕`) for colorblind accessibility (WCAG 1.4.1).
7. **Dual Auto + Manual Refresh Invariant & Semantic Event Badge Integrity:**
   - Every monitoring view, operational dashboard, NOC wallboard, or real-time cartographic map MUST simultaneously provide:
     - A reactive/periodic update mechanism (`setInterval` with guaranteed `clearInterval` cleanup in `onUnmounted` / `useEffect` + WebSocket listener), AND
     - An explicit **`[ 🔄 Refrescar ]`** button accessible to the operator that forces an immediate live reload (`?refresh=true`) without depending on a full browser reload (`F5`).
   - Event feed/ribbon classifiers in UI MUST map each event category to its exact semantic badge (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`), strictly prohibiting generic catch-all `else` clauses (such as `else return 'MAINTENANCE'`) that mislabel backups or session renewals, and asserting that `actor_username` and `resource_display_name` never render raw UUID v4 strings.

---

## 2. Proactive Vulnerability Audit

Before exposing new endpoints or frontend views:
1. **User Authentication & Authorization Checks:** Ensure locked or unauthenticated users cannot trigger protected actions.
2. **Automated SAST & Secret Checks:** Run static security audits (`bandit`, `ESLint Security`, `pip-audit`, `pnpm audit`) in ephemeral Docker with 0 High/Critical findings.
3. **Anti-XSS & Anti-CSRF:** Never bind unescaped dynamic HTML (`v-html` / `dangerouslySetInnerHTML`) without strict sanitization.

---

## 3. Mandatory Task Closure Protocol

After **EVERY** task or turn that adds, edits, or removes code or configuration files, the AI agent **MUST** autonomously execute this protocol before concluding:

0. **Active Task Initiation:** Formulate a phased plan (via `/plan` or interactive plan artifact) and initialize/update `.agents/ACTIVE_TASK.md` (from `.agents/ACTIVE_TASK.md.example`), updating sub-steps in real-time.
1. **Mandatory 11X Test Creation (Including Karate Labs for API & UI):**
   - Backend mutations: add/update unit tests (`tests/**/*.unit.py`) AND mandatory BDD scenarios in Karate API (`fastapi/test/api_test.feature`).
   - Frontend mutations: add/update unit tests (`src/**/*.unit.ts`) AND mandatory BDD scenarios in Karate UI (`vue3/test/ui_business_flow.feature`).
2. **Full Ephemeral Docker Test Execution (`Rule Zero`):**
   - Backend: Run unit tests with `>= 95%` coverage and linting (`ruff`, `mypy --strict`).
   - Frontend: Run unit tests (100% pass) and type checks (`vue-tsc --noEmit`).
3. **Autonomous & Mandatory Multi-Layer Documentation Sync & Active Task Completion:**
   - Update affected operational manuals in `docs/`.
   - Update `CHANGELOG.md` under `## [Unreleased]`.
   - Update `TESTING.md` metrics and counts.
   - Update `README.md` when user-facing interfaces or architectures change.
   - Mark `.agents/ACTIVE_TASK.md` as `COMPLETED (100%)`.
4. **Secret, Dependency Vulnerability, i18n & Parity Certification:**
   - Run `./scripts/verificar-secretos.sh` (0 secret leaks).
   - Run `./auditar-infra.sh` (0 High/Critical findings).
   - Run `./.agents/scripts/certify_task_completion.sh` (all gates passed).
