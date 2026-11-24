# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Terminal ↔ Frontend Parity & Task Closure Protocol

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents and developers.
> **OUTPUT LANGUAGE & DYNAMIC MIRRORING (Spec 19):** Respond in the **user's prompt language** (unless `AGENTS.md` explicitly pins `--lang es|en`); human docs use EN canonical (`*.md`) + 1:1 ES mirror (`*.es.md`) here (matching `README.md`/`CHANGELOG.md` in consumer repos), while `.agents/**` remains concise English.

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
8. **Prohibition of Blind `HTTP 200 OK` Success in Batch Endpoints:**
   - In UI views and stores consuming bulk/batch execution endpoints (`POST .../execute`, `POST .../batch`), it is strictly prohibited to assume global success from `HTTP 200 OK` alone; the client MUST inspect `res.data.results[].status` (or `items[].status`) per target resource and surface individual/partial failures (`FAILED`, `ERROR: ...`) instead of rendering a false-positive global success notification.
9. **Pre-Auth HTTP `401` Interceptor Symmetry (`PREAUTH_PUBLIC_ROUTES`):**
   - Frontend HTTP interceptors (`axios`/`fetch`) MUST check `PREAUTH_PUBLIC_ROUTES` (`/auth/login`, `/auth/mfa/enroll`, `/auth/mfa/verify`, `/auth/password-change`, WebAuthn ceremonies) before attempting `/auth/refresh` or firing authenticated background polling when no session token exists, surfacing invalid OTP/challenge `401` errors inline within the login/MFA view instead of wiping state via hard redirect.

---

## 2. Proactive Vulnerability Audit

Before exposing new endpoints or frontend views:
1. **User Authentication & Authorization Checks:** Ensure locked or unauthenticated users cannot trigger protected actions.
2. **Automated SAST & Secret Checks:** Run static security audits (`bandit`, `ESLint Security`, `pip-audit`, `pnpm audit`) in ephemeral Docker with 0 High/Critical findings.
3. **Anti-XSS & Anti-CSRF:** Never bind unescaped dynamic HTML (`v-html` / `dangerouslySetInnerHTML`) without strict sanitization.

---

## 3. 3-Path Proportional Execution & Mandatory Task Closure Protocol

Select the proportional execution path first (`DOCS_ONLY`, `MICRO_CHANGE`, or `FULL_11X`):
- **`DOCS_ONLY` (only human `*.md` / `docs/` edited; excludes `.agents/{skills,rules,schemas}/`):** Skip Docker test suites and AST graph rebuilds; synchronize bilingual `*.{md,es.md}` pairs (`CHANGELOG.{md,es.md}`, `TESTING.{md,es.md}`, `README.{md,es.md}`, `docs/*.{md,es.md}`), run `make sync-governance` (when manifest-tracked) + `./.agents/scripts/certify_task_completion.sh`, mark `CERTIFIED_CLEAN` (if Flight Recorder active), and conclude with a local `git commit` (`QA-GIT-GATE-01`).
- **`MICRO_CHANGE` (`<= 3` files, `< 5` AST callers, `0` new API routes/ORM migrations):** Formulate a 3-line inline plan, run `inspect_ast_blast_radius` (`inspect_blast_radius.py` in Docker), update affected unit/BDD tests (`QA-TEST-SYNC-01`), execute affected stack QA (`make qa-lint` + `make qa-unit` + affected tests in Docker), refresh AST (`./scripts/actualizar-grafos-graphify.sh`), sync `CHANGELOG.{md,es.md}`, run `./.agents/scripts/certify_task_completion.sh` (10/10 gates), mark `CERTIFIED_CLEAN`, and commit locally (`QA-GIT-GATE-01`).
- **`FULL_11X` (`> 3` files, new endpoints/views, ORM schemas, security controls, or `MEDIUM`/`HIGH` blast radius):** Execute all stages below autonomously before concluding:

0. **Active Task Initiation:** Formulate a phased plan (via `/plan` or interactive plan artifact) and track phases atomically via `checkpoint_ctl.py` / MCP `session_flight_recorder` (`0600` `.agents/.cache/session_checkpoint.json` projecting `.agents/ACTIVE_TASK.md` `<= 40` lines without manual Markdown editing).
1. **Mandatory 11X Test Creation & Co-Evolution (`QA-TEST-SYNC-01`):**
   - Backend mutations: add/update unit tests (`>= 95%` coverage) AND proportional BDD/contract scenarios (`fastapi/test/api_test.feature`, `php/test/api_test.feature`, `node-backend/test/node_api.feature`, or ephemeral JVM-free contracts on lightweight/CLI/library stacks).
   - Frontend mutations: add/update unit tests (`src/**/*.unit.{ts,tsx}`, `>= 95%` coverage) AND proportional BDD/E2E scenarios (`vue3/test/ui_business_flow.feature`, `react-frontend/test/ui_business_flow.feature`, Playwright `ui-e2e`).
2. **Full Ephemeral Docker Test Execution (`Rule Zero`):**
   - Backend: Run unit tests (`>= 95%` coverage) and full `make qa-lint` (`ruff`, `mypy --strict --cache-dir=/tmp/mypy`, `radon`, `bandit` / `phpstan`, `psalm`).
   - Frontend: Run unit tests (`>= 95%` coverage, 100% pass), `eslint --max-warnings 0`, and type checks (`vue-tsc --noEmit` / `tsc --noEmit`).
3. **Autonomous Bilingual Documentation Sync:**
   - Synchronize affected bilingual pairs (`*.md` + `*.es.md`): operational manuals in `docs/`, `CHANGELOG.{md,es.md}` under `## [Unreleased]`, `TESTING.{md,es.md}`, `README.{md,es.md}`, and `ROADMAP.{md,es.md}` when applicable.
4. **AST Graph Refresh, 10/10 Certification, Active Task Closure & Local Git Closure (`QA-GIT-GATE-01`):**
   - Refresh AST graphs (`./scripts/actualizar-grafos-graphify.sh`) and run `./.agents/scripts/certify_task_completion.sh` (executing `./scripts/verificar-secretos.sh` and `./scripts/auditar-infra.sh` inside Gates 1–2 along with Gates 3–10).
   - ONLY after passing `certify_task_completion.sh`, mark `.agents/ACTIVE_TASK.md` as `CERTIFIED_CLEAN` via `checkpoint_ctl.py` / `session_flight_recorder`.
   - Conclude with a clean certified local `git commit` (NEVER execute automatic `git push` or remote publishing without explicit human authorization per `QA-GIT-GATE-01`).
