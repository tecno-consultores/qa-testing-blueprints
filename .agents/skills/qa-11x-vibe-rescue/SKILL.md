---
name: qa-11x-vibe-rescue
description: >-
  5-stage Vibe-to-Enterprise rescue and hardening sub-skill for Standard 11X. Audits and hardens
  AI-generated prototypes (Bolt.new, Lovable, v0, Replit Agent, rapid vibe-coding scaffolds) without
  destroying their UX, enforcing secret quarantine, PostgreSQL 17 RLS, strict typing (CC <= 5),
  non-root Docker Rule Zero (>= 95% coverage), and 10/10 gate closure.
---

# QA 11X Vibe-to-Enterprise Rescue (`qa-11x-vibe-rescue`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless the target repository's `AGENTS.md` explicitly mandates a fixed output language, respond and explain reasoning in the **user's prompt language**, and write commit messages / human-facing documentation matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to the prompt language on empty repos).

5-stage deterministic rescue protocol converting AI-generated prototypes (Bolt.new, Lovable, v0, Replit Agent, rapid vibe-coding scaffolds) into enterprise-grade, DISA STIG V6R5 / OWASP v4.2 compliant Standard 11X systems **without destroying validated visual UX or product velocity**.

---

## 1. Rescue Philosophy: Preserve UX, Eradicate Structural Debt

AI-generated prototypes frequently deliver strong visual layouts alongside severe hidden liabilities: client-exposed service keys, permissive `USING (true)` database policies, untyped `any` payloads, 800-line god components, zero tests, and host-coupled dev scripts. Execute the 5 stages below sequentially (aligning artifacts under `vibe-rescue/` conventions when bootstrapping rescue templates):

---

## 2. Stage 1 — Forensic Triage & Secret Quarantine

1. **Map Before Touching (`Graphify AST-First`):**
   - Generate the initial AST graph via `./scripts/actualizar-grafos-graphify.sh` and inspect high-fan-in hubs with `python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` / `inspect_ast_blast_radius`.
2. **Quarantine Client-Exposed Secrets:**
   - Run `./scripts/verificar-secretos.sh` and scan client bundles (`VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`, committed `.env` files, hardcoded Supabase `service_role` keys, or raw bearer tokens).
   - Remove `.env` from Git index (`git rm --cached .env`), rotate leaked keys immediately, inject `.env.example` placeholders, and route privileged third-party calls exclusively through a server-side BFF/API protected by Vault AES-256-GCM and Pre-DNS Anti-SSRF (`qa-11x-devsecops-hardener`).
3. **Pin Deterministic Lockfiles & Eliminate Unsafe Primitives:**
   - Generate strict lockfiles (`uv.lock`, `pnpm-lock.yaml`, `composer.lock`), remove unused scaffold packages, and purge `eval()`, `v-html`, `dangerouslySetInnerHTML`, `pickle`, `yaml.load`, and `shell=True`.

---

## 3. Stage 2 — Multi-Tenant PostgreSQL 17 RLS & Service-Layer RBAC

1. **Eliminate Permissive `USING (true)` Policies (`QA-PG17-RLS`):**
   - Replace wide-open prototype Supabase/PostgreSQL RLS policies with strict tenant isolation:
     - Dedicated app role `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
     - `tenant_id UUID NOT NULL` on every multi-tenant table + `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` (verified via `pg_catalog.pg_class.relforcerowsecurity`).
     - Multi-transaction `AsyncSession` context persistence via `session.sync_session.info` + `@event.listens_for(..., "after_begin")` + scoped `SECURITY DEFINER` (`SET search_path = public`) functions for pre-auth lookups.
2. **Versioned Migrations & Schema Parity:**
   - Capture ad-hoc prototype SQL changes into versioned Alembic migrations (`revision <= 32` chars) and certify against real `postgres:17-alpine` via `python3 .agents/scripts/verify_alembic_orm_parity.py`.
3. **Service-Layer RBAC & Immutable Audit Trail:**
   - Enforce `claims["role"]` / `claims["rol"]` inside service functions (anti-`Depends()` bypass), wrap sensitive/MCP mutations behind `ApprovalRequest` (`AWAITING_APPROVAL`), and wire WORM `audit_logs` (`seq_num BIGINT` + `pg_advisory_xact_lock`, human-readable `actor_username`, zero raw UUID v4 strings).

---

## 4. Stage 3 — Strict Typing, Boundary Validation & Modularization (`CC <= 5`)

1. **Eradicate Type Escape Hatches:**
   - Eliminate every `any`, `@ts-ignore`, `@ts-expect-error`, `# type: ignore`, and untyped `dict` payload; enforce `mypy --strict --cache-dir=/tmp/mypy`, `vue-tsc --noEmit`, `tsc --noEmit`, and `eslint --max-warnings 0`.
2. **Enforce Strict Input Borders & Security Headers:**
   - Wrap all API inputs in Pydantic `ConfigDict(extra="forbid")` or Zod `.strict()` with Unicode `NFKC` normalization (`APSC-DV-002520`) before validation.
   - Inject `Idempotency-Key` middleware on `POST`/`PUT`/`PATCH`/`DELETE`, HMAC-SHA256 CSRF cookies (`HttpOnly; Secure; SameSite=Strict; Path=/`), `PREAUTH_PUBLIC_ROUTES` continuity (`SEC-16`), and OWASP Secure Headers (OSHP).
3. **Split Monolithic Files Without Breaking UX:**
   - Refactor `> 500`-line prototype components/handlers into cohesive, single-responsibility modules capped at Cyclomatic/Cognitive Complexity **`CC <= 5` (Grade A)** while preserving Tailwind/CSS tokens, visual hierarchy (`refactoring-ui`), and in-flow layouts (`<main>` footer `margin-top: auto`, `UI-11X-01`, `CLS = 0`).
   - Enforce clean architectural boundaries (`UI -> API Client -> Service -> Domain/ORM`) verified by `python3 .agents/scripts/verify_topological_health.py`.

---

## 5. Stage 4 — Ephemeral Dockerization (`Rule Zero`) & 11X Safety Net (`>= 95%`)

1. **Encapsulate in Hardened Non-Root `sinfallas/*` Containers:**
   - Replace host `npm run dev` / local venvs with `docker-compose.qa.yml` + `Makefile` using non-root `sinfallas/base-python-uv:3.15`, `sinfallas/base-node-ionic:26`, `sinfallas/karatelabs`, or `sinfallas/basephpcomposer` (`cap_drop: [ALL]`, `no-new-privileges:true`, `read_only: true`, `COVERAGE_FILE=/tmp/.coverage`, `HOME=/tmp`, `pnpm-store-init`).
   - Resolve all `trivy config` and `trivy fs` findings via `./scripts/auditar-infra.sh` (`HIGH/CRITICAL = 0`).
2. **Eliminate Dead Scaffolds & Wire Live Parity:**
   - Purge orphan endpoints and untested UI screens (`verify_no_orphan_api_endpoints.py`, `verify_zero_orphan_vue_components.py`, `verify_json_no_duplicate_keys.py`).
   - Pair live/polling views with explicit **`[ 🔄 Refrescar ]`** (`?refresh=true`) controls and semantic badges (`UI-11X-02`).
3. **Construct the 11X Unmocked Safety Net:**
   - Write unit suites achieving **`>= 95%` branch/line coverage** (enforcing strict `json.dumps()` without `default=str` over `Decimal` fixtures in `MockDbSession`), real-DB cross-module propagation tests (Anti-Silo), 3-phase temporal assertions ($t < t_0$, $t_0 \le t \le t_1$, $t > t_1$), real-browser Playwright geometry/a11y checks (`375x667`, `768x1024`, `1440x900`, `@axe-core`), and proportional Karate Labs BDD scenarios.

---

## 6. Stage 5 — Governance Sealing & Local Closure (`QA-GIT-GATE-01`)

1. **Bootstrap Thin-Repo Connector:** Run `init_or_append_agents_md` and `reconcile_agents_governance` so the rescued repository consumes global 11X skills/rules with zero local duplication.
2. **Rebuild AST & Sync Docs:** Refresh `graphify-out/` via `./scripts/actualizar-grafos-graphify.sh` and update `README.md`, `TESTING.md`, `SECURITY.md`, and `CHANGELOG.md` (`## [Unreleased]`).
3. **Certify 10/10 & Commit Locally:** Run `make sync-governance`, verify `certify_11x_gate` / `./.agents/scripts/certify_task_completion.sh` (`10/10 PASSED`), mark `.agents/ACTIVE_TASK.md` (`<= 40` lines) as `COMPLETED (100%)`, and finish with a clean local `git commit` (**never `git push`** automatically under `QA-GIT-GATE-01`).

---

## 7. Quick Vibe-to-Enterprise Triage Checklist

| Prototype Symptom | Risk / Rule Violated | 11X Rescue Fix |
| :--- | :--- | :--- |
| `VITE_SUPABASE_SERVICE_KEY` in frontend | Client secret exposure (`SEC-02`) | Move to server BFF + Vault AES-256-GCM; rotate key. |
| `CREATE POLICY ... USING (true)` | Cross-tenant data leak (`QA-PG17-RLS`) | `FORCE RLS` + `tenant_id` policy + `NOBYPASSRLS` role + `after_begin`. |
| `req.body as any` / `dict` payloads | Mass assignment / Type bypass (`SEC-01`) | Zod `.strict()` / Pydantic `extra="forbid"` + `NFKC` normalization. |
| 900-line `App.vue` / `Dashboard.tsx` | Unmaintainable God component (`CC > 5`) | Split into domain hooks/stores + presentational widgets (`<= 150L`). |
| `position: fixed; bottom: 0` footer | Overlaps mobile inputs (`UI-11X-01`) | `<main>` flex column + in-flow footer `margin-top: auto`. |
| Host-only tests with mocked SQL | Mock blindness (`Rule Zero`, `<95%` cov) | Ephemeral `sinfallas/*` + live `postgres:17-alpine` + `>= 95%` cov. |
