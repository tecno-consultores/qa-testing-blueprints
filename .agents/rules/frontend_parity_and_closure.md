# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Terminal ↔ Frontend Parity & Task Closure Protocol

> **SCOPE:** Enforces CLI↔UI operational parity, reactive UX resilience, and deterministic closure across all stacks.

## 1. Terminal ↔ Frontend Parity Invariants

1. **Zero Console-Exclusive Actions:** Every operational or diagnostic CLI action MUST have an equivalent UI control.
2. **Zero Orphan API Endpoints:** Every operational backend route MUST be wired to a frontend view/client (`.agents/scripts/verify_no_orphan_api_endpoints.py`).
3. **Zero Read-Only Operational Consoles:** Tables backed by mutating APIs MUST expose create/edit/toggle/delete controls with confirmations.
4. **Non-Destructive Error Handling & Null-Safe Collections:** Preserve populated store state inside `catch` blocks (set an explicit stale/error flag instead of resetting arrays) and guard async collections (`(items ?? []).length`).
5. **Proactive RBAC UI Visibility:** Filter routes/buttons by user role (`v-if`/guards) alongside backend RBAC so users never hit dead-end `403` buttons.
6. **Multi-Viewport, Theme Parity & Colorblind Accessibility:** Certify `scrollWidth <= innerWidth` at `375x667`, `768x1024`, `1440x900`; one primary solid CTA per container; complete CSS `--var` coverage across light/dark/high-contrast themes; pair status colors with geometric/text indicators (`▲`/`●`/`■`/`✕`, WCAG 1.4.1).
7. **Dual Auto + Manual Refresh & Semantic Badges:** Monitoring views MUST provide both periodic/WS refresh (`clearInterval` on unmount) AND an explicit **`[ 🔄 Refrescar ]`** (`?refresh=true`) control. Event mappers MUST emit exact semantic badges without generic `else` catch-alls and never display raw UUID v4 strings for `actor_username`/`resource_display_name`.
8. **Per-Item Batch Validation:** Never treat `HTTP 200 OK` on bulk endpoints (`POST .../execute`, `POST .../batch`) as global success; inspect `results[].status` / `items[].status` and surface partial failures.
9. **Pre-Auth `401` Interceptor Symmetry (`PREAUTH_PUBLIC_ROUTES`):** Check `PREAUTH_PUBLIC_ROUTES` before attempting `/auth/refresh` or firing authenticated polls, displaying OTP/challenge `401` errors inline without hard redirects.

## 2. Proactive Vulnerability Gate & Task Closure

- Verify auth/RBAC, zero High/Critical SAST/dependency findings (`bandit`, ESLint Security, `pip-audit`, `pnpm audit`), and sanitized dynamic HTML before exposing new endpoints or views.
- Execute the proportional closure path (`DOCS_ONLY`, `MICRO_CHANGE`, or `FULL_11X` defined in `mandatory_qa_pyramid_and_doc_sync.md` §2 & `AGENTS.md` §5):
  1. Plan & track via `checkpoint_ctl.py` / `session_flight_recorder` (no manual edits to `.agents/ACTIVE_TASK.md`).
  2. Create/co-evolve unit (`>= 95%`) + proportional BDD/E2E tests (`QA-TEST-SYNC-01`) and execute them inside ephemeral Docker (`Rule Zero`).
  3. Sync affected bilingual docs (`*.md` + `*.es.md`), `CHANGELOG.{md,es.md}`, `TESTING.{md,es.md}`, and `ROADMAP.{md,es.md}`.
  4. Refresh AST (`./scripts/actualizar-grafos-graphify.sh`), pass `./.agents/scripts/certify_task_completion.sh` (10/10 gates), promote `CERTIFIED_CLEAN`, and stop at a certified local `git commit` (`QA-GIT-GATE-01`).
