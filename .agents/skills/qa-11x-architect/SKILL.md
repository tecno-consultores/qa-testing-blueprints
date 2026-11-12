---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.16+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), optimize context token consumption, or update TESTING.md and CHANGELOG.md.
---

# Master QA 11X & DevSecOps Architect (`qa-11x-architect`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless the target repository's `AGENTS.md` explicitly mandates a fixed output language, respond and explain reasoning in the **user's prompt language**, and write commit messages / human-facing documentation matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to the prompt language on empty repos).

Unified governance, High-IQ Token Economy, and tactical playbooks for Level-11X enterprise quality: 13 QA layers, non-destructive surgical template merging, Anti-Mock & Anti-Silo Blindness, Anti-JSDOM geometry, and 22 DISA ASD STIG V6R5 + OWASP v4.2 security controls.

---

## 1. Environment Detection & 3-Path Proportional Execution Protocol

Classify every task before acting:
- **`DOCS_ONLY` Fast-Path (`*.md` / `docs/**` only):** 0 Docker QA runs, 0 AST rebuilds; sync docs/`CHANGELOG.md`, run `certify_11x_gate`, and `git push`.
- **`MICRO_CHANGE` Surgical-Path (`<= 3` files, `LOW` `< 5` callers, 0 new routes/ORM migrations):** 3-line inline plan, `inspect_ast_blast_radius`, targeted unit + stack QA in Docker, incremental AST refresh, `CHANGELOG.md`, `certify_11x_gate`, and `git push`.
- **`FULL_11X` Architectural-Path (`> 3` files, new API/UI, ORM schemas, security controls, or `MEDIUM`/`HIGH` blast radius):** Full 11-step protocol (`/plan`, `.agents/ACTIVE_TASK.md <= 40` lines, full pyramid + Karate BDD, docs/specs, AST refresh, `certify_11x_gate`, `git push`).

### Case A: MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x` — 12 Tools + 9 Resources)
1. **Navigate AST Blast Radius:** `inspect_ast_blast_radius(project_path, target_symbol)` — mandatory first step for Code Q&A and pre-refactoring impact analysis.
2. **Detect Project Stack:** `inspect_project_config(project_path)` — active frameworks, lockfiles, suites, and compliance gaps.
3. **Audit 13-Layer Pyramid Gaps:** `audit_test_pyramid_gaps(project_path, stack)` — already runs `inspect_project_config` internally (do not call both sequentially).
4. **Fetch Blueprint Metadata:** `fetch_blueprint_bundle(stack, include_common_and_agents, include_content: false)` — SHA-256 verified metadata from `~/.cache/qa-11x-blueprints/` without context bloat.
5. **Thin-Repo Surgical Bootstrap/Merge:** `bootstrap_or_merge_11x(project_path, stack, dry_run)` — merges stack templates, `.agents/scripts/*`, and `.agents/ACTIVE_TASK.md.example` without duplicating global skills/rules.
6. **Audit Security Posture:** `audit_security_stig_owasp(project_path)` — static audit (`SEC-01`..`SEC-16`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `UI-11X-01/02`).
7. **Run Ephemeral Docker QA:** `run_ephemeral_qa(project_path, stage, timeout_seconds, skip_if_docs_only: true)` — executes `lint`, `unit`, `migration`, `integration`, `ci`, `bdd`, `mutation`, `dast`, `e2e`, `perf`, `chaos`, or `all` inside isolated `sinfallas/*` containers (`Rule Zero`) and stamps `.agents/.qa-evidence.json`. Mandatory Step 6 without shortcuts: run `stage="lint"` + `stage="unit"` (plus `stage="integration"` when touching `migrations/`, ORM/SQL, or `.github/workflows/`); NEVER replace `make qa-lint` with partial `ruff` calls.
8. **Sanitize Workspace:** `clean_workspace_11x(project_path, dry_run, deep_prune)` — purges caches and root-owned Docker artifacts without `sudo` while preserving `mcp-server/dist`, `.agents/.qa-evidence.json` (unless `deep_prune`), and `graphify-out/{graph.json,GRAPH_REPORT.md,graph.html}`.
9. **Certify 10/10 Quality Gate:** `certify_11x_gate(project_path)` — verifies static 11X invariants, dynamic Vue/TS API route parity (`${query}` / `/${subPath}`), `audit_security_stig_owasp`, and fresh `stage="lint"` evidence on dirty Git code trees before `git commit`/`git push`.
10. **Inject Thin-Repo AGENTS.md Connector:** `init_or_append_agents_md(project_path, dry_run)` or `npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts`.
11. **Reconcile Governance & Isolate Domain Rules:** `reconcile_agents_governance(project_path, dry_run)` — prunes duplicated global directives in `<project>/.agents/` and isolates domain rules in `.agents/rules/domain_<project>_rules.md`.
12. **Propose Continuous Skill Evolution (Dual-Consumer):** `propose_skill_evolution_pr(...)` — contributes empirical QA-escape guardrails upstream covering the 3-layer triplet (AI skill/rule + MCP executable gate + human manual in `docs/01..04_*.md`).

### Case B: Standalone Skill / Fallback Mode (No MCP Server)
1. **3-Tier Progressive Reference Loading:** Read **only one** module from `references/01..09.md` matching the active stack/domain (see §4).
2. **Zero-Clone Hydration:** Download `manifest.json` from `https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/manifest.json` and verify every fetched file with `sha256sum -c` (`DISA STIG V-222513`).

---

## 2. The 10 Non-Negotiable Laws of Standard 11X

1. **Law 1 — Rule Zero (Ephemeral Docker Isolation):** NEVER run `pip`, `uv`, `pytest`, `npm`, `pnpm`, `vitest`, `playwright`, `mvn`, `bats`, or `shellcheck` on the host OS. Execute everything inside ephemeral Docker containers with named cache volumes (`uv-cache:/tmp/uv-cache`, `pnpm-store`, `qa11x_trivy_cache`).
2. **Law 2 — Strict Coverage (`>= 95.0%`), Non-Root `COVERAGE_FILE=/tmp/.coverage`, `Mypy --strict` & `importlib` Parity:** Unit coverage `>= 95.0%` (lines, branches, statements, `catch`/`except`). Whenever `[tool.mypy]` exists, chain `mypy --strict --cache-dir=/tmp/mypy src/` alongside `ruff check` + `ruff format --check` (`QA-MYPY-01`). Never pass `-o addopts=""` to `pytest` without `--import-mode=importlib --cov=src --cov-fail-under=95` and `-e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/src` (`QA-COV-01`, preventing `ModuleNotFoundError` on `*.unit.py`/`*.int.py`). Enforce Grade A complexity (`CC <= 5` / SonarJS `<= 15`), `MSI >= 80%`, `0` High/Critical CVEs, and `--max-warnings 0`.
3. **Law 3 — Hermetic Unit Network Isolation vs. Real DB & Anti-Silo Integration:** Block external network calls in unit tests (`pytest-mock`, `msw`, `bats-mock`), but NEVER mock DB persistence (`verify_alembic_orm_parity.py` against live `postgres:17-alpine`) or cross-module state propagation.
4. **Law 4 — Anti-JSDOM Visual Geometry & Dual Refresh Ergonomics:** JSDOM returns `0x0` boxes; forbid `position: fixed` footers (`UI-11X-01`, use `margin-top: auto` inside `<main>`) and validate in headless Chromium (`mcr.microsoft.com/playwright:v1.52.0-noble` / `sinfallas/karatelabs:1.5.1` + `@axe-core`). Operational dashboards/NOC views MUST pair periodic/WebSocket refresh (`clearInterval` on unmount) with an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`).
5. **Law 5 — Surgical Merging & Thin-Repo Governance:** Merge `.example` configs without deleting user scripts/dependencies. Consumer projects consume the 5 corporate skills and 7 canonical rules globally (`~/.gemini/`, `~/.claude/`, `~/.cursor/`) without local duplication, isolating project business rules in `.agents/rules/domain_<project>_*.md`.
6. **Law 6 — Mandatory Karate Labs BDD, Dynamic `Idempotency-Key` & Zero Orphans:** Every API/UI change includes Karate scenarios (`api_test.feature`, `ui_business_flow.feature`). Mutable requests (`POST`/`PUT`/`PATCH`/`DELETE`) inject `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` (`QA-KARATE-IDEMP`). Enforce 0 orphan UI components (`verify_zero_orphan_vue_components.py`) and 0 orphan API routes (`verify_no_orphan_api_endpoints.py`).
7. **Law 7 — DISA STIG V6R5 & OWASP v4.2 Security-by-Design:** Enforce all 22 controls in [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md) and [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md): PostgreSQL `FORCE ROW LEVEL SECURITY` with `NOBYPASSRLS` runtime role (audited via `pg_class.relforcerowsecurity` + `JOIN pg_namespace`, never nonexistent `pg_tables.forcerowsecurity`, `QA-PG17-RLS`), multi-tx RLS `after_begin` re-injection, `SECURITY DEFINER` (`SET search_path = public`) pre-auth lookups, deterministic WORM audit hash-chains (`seq_num BIGINT` + `pg_advisory_xact_lock` + session hash tracking + `flush()`), Service-Layer RBAC + MCP `ApprovalRequest` (`AWAITING_APPROVAL`), FIPS AES-256-GCM + memory zeroization, pre-DNS SSRF, `NFKC` canonicalization, anti-XXE, OSHP headers, 3-fail/15m lockout with dummy Argon2id, and signed CycloneDX SBOM.
8. **Law 8 — Universal RED Observability Pre-Chaos:** Expose Prometheus `/metrics` (Rate, Errors, Duration + `trace_id`) before executing bounded Pumba chaos and Locust/Artillery load profiles ([`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md)).
9. **Law 9 — Trimodal Fixtures, 3-Phase Clock Lifecycle & AST Graph Discipline:** Test against Virgin, Nominal, and Degraded/Partial-Batch fixtures. Validate time-bounded entities across all 3 clock phases (`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`). Query `inspect_ast_blast_radius` before modifying shared code and refresh AST graphs (`./scripts/actualizar-grafos-graphify.sh`) after code changes.
10. **Law 10 — Proportional Planning, Compact `ACTIVE_TASK.md <= 40` Lines, 10/10 Closure & QA-Escape Evolution:** Track live progress in `.agents/ACTIVE_TASK.md` (`<= 40` lines), keep `CHANGELOG.md` concise (single version header, 1–2 line bullets), verify `ROADMAP.md` (`verify_roadmap_consistency.py`) and docs invariants (`verify_docs_invariants.py`), pass `certify_task_completion.sh` (10/10 gates), `git push`, and emit `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` + `propose_skill_evolution_pr` on any QA-escape fix.

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation (9 UAT Anti-Blindness Rules)

1. **Unmocked Cross-Module State Propagation:** After mutating Module A (`POST`/`PUT`/`PATCH`/`DELETE`), immediately query Consumer Module B `GET` endpoints/stores against the live DB without intermediate mocks.
2. **3-Phase Temporal Lifecycle Assertion:** Assert Phase 1 Pending (`t < starts_at`), Phase 2 Active (`starts_at <= t <= ends_at`), and Phase 3 Expired/Reverted (`t > ends_at` + audit record).
3. **Audit Argument Assertions, `JSONB`/`Decimal` Parity & Human-Readable Identities:** Never use uninspected `AsyncMock` on `write_audit_log`; validate `AuditLog` `JSONB` payloads via `json.dumps()` **without `default=str`** using `decimal.Decimal` fixtures; assert `actor_username` / `resource_display_name` never match raw UUID v4 strings (`claims.get("sub")`); forbid catch-all `else` badges (`UI-11X-02`).
4. **Dual Auto + Manual Refresh:** Pair `setInterval` (`clearInterval` on unmount) + WebSocket with an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`).
5. **Heavy-Transfer Timeouts (`>= 180s` + `0-byte` Purge) & Batch Per-Item Validation:** Enforce `timeout >= 180s` and `0-byte` cleanup on synchronous binary/firmware transfers; inspect `res.data.results[].status` per item across Full Success, Partial Failure, and Total Failure on `HTTP 200 OK` batch endpoints.
6. **Zero Hardcoded Pass Guarantee:** Quality gates and runners MUST return `'SKIPPED'` / `detected: false` when unverified — never hardcoded `true` or `'PASSED'`.
7. **Post-Import `Settings` Singleton Sync (`QA-SMOKE-01`) & Ephemeral Prod Secrets (`SEC-15`):** In `--no-dev` boot smoke tests, mutate both `os.environ["APP_ENV"] = "production"` and the already-imported `settings.APP_ENV = "production"` singleton (restoring in `finally`). In local prod smoke scripts (`probar-prod-local.sh`), generate ephemeral `openssl rand` secrets (`>= 32` bytes) and pass rotated admin credentials via `docker exec -e`.
8. **Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant (`SEC-16`):** Unauthenticated multi-step challenge flows (`POST /auth/login` returning `mfa_enrollment_required` / `mfa_challenge` / `password_change_required` -> `POST /auth/mfa/enroll` / `verify` / WebAuthn) fail in UAT when tested as isolated mocks while global `CSRF`, `Idempotency-Key`, or frontend `401 -> /auth/refresh` interceptors block step 2. Enforce 4 controls ([`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md)): (a) opaque CSPRNG `challenge_id >= 128-bit` (`secrets.token_urlsafe(32)`) in JSON body/header + `Origin`/`Sec-Fetch-Site` check, (b) atomic single-use `GETDEL`/Lua consumption or scoped `idemp:preauth:{challenge_id}:{key}` in KeyDB/Redis, (c) strict `TTL <= 300s` + max-attempt (`3–5`) purge (`APSC-DV-000530`), and (d) symmetric `PREAUTH_PUBLIC_ROUTES` shared across backend `CSRF`/`Idempotency` middlewares and the frontend HTTP `401` interceptor, certified in **one continuous test** over the same in-memory/live KeyDB/Redis instance without intermediate mocks or manual `redis.set(...)` seeding.
9. **Unmocked Orchestrator Boot & Container Healthcheck Contract (`QA-HEALTH-01`):** Background worker runners, schedulers, or service entrypoints monitored by a `Dockerfile` / `docker-compose*.yml` `healthcheck` MUST include an integration-style unit test booting the real entrypoint under default production `Settings()` (with opt-in workers disabled by default) **without mocking optional worker loops**, explicitly asserting the observable healthcheck artifact (`heartbeat_file.exists()`, readiness key, or `/healthz` `200`) across event-loop ticks (forbidding assertion-free `sleep(0.01)` + `cancel()` smoke calls). Supervisors inspecting `asyncio.Task` MUST check `task.exception() is not None` and distinguish mandatory loops from expected `return None` of `OPTIONAL_WORKERS` ([`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md)).

---

### 2.2. 🧠 High-IQ Token Economy Protocol (6 Cognitive Invariants)

1. **`Graphify AST-First, Grep-Fallback, Windowed-Read-Second`:** Query `inspect_ast_blast_radius` (`graphify-out/graph.json` & `GRAPH_REPORT.md`, preserved locally and git-ignored) first, fall back to `grep -n` only for non-AST literals, and read tight 40–80 line windows (`StartLine`/`EndLine`); never read files `> 150` lines blindly.
2. **`Zero Redundant Re-Read`:** Never re-read files already inspected or edited in recent turns unless modified externally.
3. **`Parallel Tool Call Batching`:** Group independent reads, searches, and checks into a single parallel tool-call turn.
4. **`Subagent Context Isolation`:** Delegate `> 4`-file exploration to a `research` subagent returning `<= 20` lines with `file:line` pointers.
5. **`Pass-Quiet & RTK Terminal Filtering`:** Use `git status -s`, `git diff --stat`, `pytest -q --tb=short`, and avoid duplicate MCP calls (`audit_test_pyramid_gaps` includes `inspect_project_config`; `certify_11x_gate` includes `audit_security_stig_owasp`).
6. **`Surgical Diff Edits & Compact Scratchpad`:** Prefer `edit_file` over full-file `write_file`; keep `.agents/ACTIVE_TASK.md <= 40` lines and recommend `/compact` upon milestone closure.

---

## 3. Operational Playbooks (Condensed)

- **Playbook 1 — Thin-Repo Bootstrap & Merge:** `/plan` + `.agents/ACTIVE_TASK.md` -> `inspect_project_config` -> `bootstrap_or_merge_11x` (SHA-256 cached templates + `.agents/scripts/*`, 0 duplicate local skills/rules) -> `init_or_append_agents_md` -> `run_ephemeral_qa` (`lint` + `unit`).
- **Playbook 2 — Coverage Rescue (`< 95%`) & BDD Parity:** Triage `MICRO_CHANGE` vs `FULL_11X` -> `run_ephemeral_qa` uncovered lines -> windowed `read_file` + `.unit.*` tests (`>= 95%`) -> `verify_alembic_orm_parity.py` -> Karate `api_test.feature` (`Idempotency-Key` UUID) + `ui_business_flow.feature` + Playwright `@axe-core`.
- **Playbook 3 — STIG/OWASP Hardening:** `audit_security_stig_owasp` -> consult `references/02-security-disa-owasp-22.md` -> inject controls (`NFKC`, `OSHP`, RLS `after_begin`, WORM `seq_num`, `SEC-16` pre-auth continuity) -> negative unit/BDD tests -> `./scripts/verificar-secretos.sh` + `./scripts/auditar-infra.sh`.
- **Playbook 4 — 3-Path Closure & 10/10 Certification:** Run QA (`MICRO_CHANGE`/`FULL_11X`) -> `./scripts/actualizar-grafos-graphify.sh` -> sync `docs/`, `TESTING.md`, `CHANGELOG.md`, `ROADMAP.md` -> `./.agents/scripts/certify_task_completion.sh` (`certify_11x_gate` 10/10) -> mark `ACTIVE_TASK.md` `COMPLETED (100%)` -> `git commit` & `git push` (+ `propose_skill_evolution_pr` on QA escapes).
- **Playbook 5 — Workspace Sanitization (`scripts/limpieza.sh`):** Teardown QA containers -> purge caches/coverage while preserving `mcp-server/dist` and `graphify-out/{graph.json,GRAPH_REPORT.md,graph.html}` -> ephemeral Alpine `chown -R $(id -u):$(id -g)` on any UID 0 files without `sudo`.
- **Playbook 6 — 13-Layer Gap Rescue:** `audit_test_pyramid_gaps(project_path)` -> report score & missing layers in Spanish -> `bootstrap_or_merge_11x` -> execute `prioritized_action_plan` (`CRITICAL -> HIGH -> MEDIUM`) -> `certify_11x_gate`.
- **Playbook 7 — Continuous Skill Evolution:** Draft empirical post-mortem -> `propose_skill_evolution_pr` (or `prefer_offline_fallback: true` writing `.agents/proposals/<slug>.md`) -> zero secrets transmitted.

---

## 4. Progressive Disclosure Reference Index (Load Strictly On-Demand)

* [`references/01-core-13-layers.md`](references/01-core-13-layers.md): 13 QA layers, Anti-Mock Blindness, Anti-JSDOM, and Trimodal Fixtures.
* [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md): 22 DISA ASD STIG V6R5 + OWASP v4.2 controls + `SEC-16` Pre-Auth Challenge Continuity snippets.
* [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md): Python 3.13+ & FastAPI (`uv`, PostgreSQL 17 `NOBYPASSRLS`, KeyDB, Alembic, Karate API).
* [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md): Node.js, Vue 3, React, Refactoring UI, Vitest, Playwright `v1.52.0-noble`, Lighthouse `.cjs`, and Karate UI.
* [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md): Bash/POSIX Shell, ShellCheck, shfmt, BATS-core, `bats-mock`, and `kcov --fail-under-percent=95`.
* [`references/06-stack-php.md`](references/06-stack-php.md): PHP 8.2–8.5 (`sinfallas/basephpcomposer`), Pest/PCOV (`>= 95%`), PHPStan Max, Psalm Taint, and Infection (`MSI >= 80%`).
* [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md): Service-Layer RBAC, MCP `ApprovalRequest` (`AWAITING_APPROVAL`), Tool Poisoning defense, and NHI isolation.
* [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md): PostgreSQL 17 `FORCE ROW LEVEL SECURITY` (`after_begin`), Expand-Contract migrations, and `JSONB`/`Decimal` parity.
* [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md): Prometheus RED metrics, `trace_id` correlation, Pumba chaos, `>= 180s` transfer timeouts, and RCA playbooks.
