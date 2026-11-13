---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.16+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), optimize context token consumption, or update TESTING.md and CHANGELOG.md.
---

# Master QA-11X v2.0 Routing Orchestrator (`qa-11x-architect`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless the target repository's `AGENTS.md` explicitly mandates a fixed output language, respond and explain reasoning in the **user's prompt language**, and write commit messages / human-facing documentation matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to the prompt language on empty repos).

Corporate routing orchestrator for Standard 11X v2.0: 3-path proportional execution, 13-layer QA pyramid, Rule Zero non-root Docker (`sinfallas/*`), High-IQ Token Economy (`AST-First`, `Pass-Quiet / Fail-Verbose`), `QA-GIT-GATE-01` local-commit closure, and progressive hydration of modular sub-skills.

---

## 1. 3-Path Proportional Routing & MCP Execution (`QA-GIT-GATE-01`)

Classify every task before acting. **NEVER run automatic `git push`** (`QA-GIT-GATE-01` — stop at a certified local `git commit` unless the user explicitly authorizes remote push):

- **`DOCS_ONLY` (`*.md` / `docs/**` only):** `0` Docker QA runs, `0` AST rebuilds -> sync docs/`CHANGELOG.md` -> `make sync-governance` -> `certify_11x_gate` (`make certify`) -> local `git commit`.
- **`MICRO_CHANGE` (`<= 3` files, `LOW` `< 5` callers, `0` new routes/ORM):** 3-line plan -> `inspect_ast_blast_radius` -> targeted unit + stack QA (`run_ephemeral_qa`) -> AST refresh -> `CHANGELOG.md` -> `certify_11x_gate` -> local `git commit`.
- **`FULL_11X` (`> 3` files, new API/UI, ORM, security, or `MEDIUM`/`HIGH` blast radius):** Full 11-step workflow (`/plan`, `.agents/ACTIVE_TASK.md <= 40L`, full pyramid + proportional API/BDD, docs/specs, AST refresh, `certify_11x_gate` 10/10, local `git commit`).

### 1.1. MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x` — 12 Tools + 9 Resources)
1. `inspect_ast_blast_radius` — mandatory first step for Code Q&A and pre-change impact.
2. `inspect_project_config` — stack detection, drift, and `update_available`.
3. `audit_test_pyramid_gaps` — 13-layer audit (includes `inspect_project_config`; do not call both).
4. `fetch_blueprint_bundle` — SHA-256 cached metadata (`include_content: false`).
5. `bootstrap_or_merge_11x` — surgical `.example` merge (`0` local skill duplication).
6. `audit_security_stig_owasp` — static audit (`SEC-01`..`SEC-16`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `UI-11X-01/02`).
7. `run_ephemeral_qa` — runs `lint|unit|migration|integration|ci|bdd|mutation|dast|e2e|perf|chaos|all` in `sinfallas/*` containers (stamps `.agents/.qa-evidence.json`).
8. `clean_workspace_11x` — rootless cleanup preserving `mcp-server/dist` and `graphify-out/`.
9. `certify_11x_gate` — 10/10 gate with Allure `Fail-Verbose` (`/tmp/qa-11x-last-failure.json`) and lint evidence check.
10. `init_or_append_agents_md` — injects Thin-Repo `AGENTS.md` connector.
11. `reconcile_agents_governance` — prunes duplicate global rules and isolates `domain_<project>_*.md`.
12. `propose_skill_evolution_pr` — upstream Dual-Consumer QA-escape evolution (AI + MCP + Spanish docs).

*Fallback (No MCP):* Load **only one** module from `references/01..09.md` (§4), verify `manifest.json` artifacts via `sha256sum -c`, and use `make sync-governance` for Zero-LLM local manifest sealing.

---

## 2. Executive Laws, 13-Layer Pyramid & Token Economy

- **13-Layer Pyramid:** (L1) Static/Types (`--max-warnings 0`, `mypy --strict`, `PHPStan max`), (L2) Secret/SBOM/Trivy (`HIGH/CRITICAL = 0`), (L3) Unit (`>= 95%` branch/line), (L4) Mutation (`MSI >= 80%`), (L5) Live DB/ORM Parity (`postgres:17-alpine`), (L6–L7) Proportional API/UI BDD (Karate Labs mandatory on multi-service/stateful `FULL_11X`; JVM-free `pytest+httpx`/`pact-python` or `vitest`/Playwright API allowed on isolated libs/CLIs/`<= 3`-endpoint microservices), (L8) Visual/WCAG 2.1 AA (`@axe-core`, Lighthouse CI, Anti-JSDOM), (L9) DAST (ZAP), (L10) Load (`k6`/Locust), (L11) Chaos (Pumba post-RED `/metrics`), (L12) AST Topological Health, (L13) 10/10 Gate.
- **10 Non-Negotiable Laws:**
  1. **Rule Zero:** Zero host runs; execute all tools in non-root `sinfallas/*` containers (`-u "$(id -u):$(id -g)"`, `HOME=/tmp`, `pnpm-store-init`).
  2. **Coverage & Types:** Enforce `--import-mode=importlib --cov=src --cov-fail-under=95` with `COVERAGE_FILE=/tmp/.coverage` (`QA-COV-01`), `mypy --strict --cache-dir=/tmp/mypy` (`QA-MYPY-01`), `CC <= 5`, `MSI >= 80%`.
  3. **Hermetic Units vs. Live DB:** Mock external HTTP in `.unit.*`; never mock SQL persistence or cross-module propagation.
  4. **Anti-JSDOM & Dual Refresh:** Forbid `position: fixed` footers (`UI-11X-01`); pair WebSocket/timers (`clearInterval` on unmount) with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
  5. **Surgical Merge & Thin-Repo:** Merge `.example` configs non-destructively; zero local duplication of global skills/rules.
  6. **Proportional BDD & Zero Orphans:** Dynamic `Idempotency-Key` UUIDs (`QA-KARATE-IDEMP`) on mutable requests; `0` orphan UI components/API endpoints.
  7. **STIG V6R5 & OWASP v4.2:** Enforce RLS `NOBYPASSRLS` + `after_begin` (`QA-PG17-RLS`), WORM `seq_num` + `pg_advisory_xact_lock`, Service-Layer RBAC + `ApprovalRequest`, Vault AES-256-GCM, anti-SSRF, `NFKC`, anti-XXE, OSHP, Argon2id lockout, CycloneDX SBOM (`qa-11x-devsecops-hardener`).
  8. **RED Pre-Chaos:** Expose `/metrics` (`trace_id`) prior to load/chaos profiles.
  9. **Trimodal & 3-Phase Clock:** Test Virgin/Nominal/Degraded states across all 3 clock phases; run `inspect_ast_blast_radius` pre-edit and refresh AST post-edit.
  10. **Closure & `QA-GIT-GATE-01`:** Keep `.agents/ACTIVE_TASK.md <= 40` lines, run `make sync-governance` + `make certify`, commit locally without `git push`, and invoke `propose_skill_evolution_pr` on QA escapes.
- **High-IQ Token Economy:** `AST-First -> Grep-Fallback -> 40–80L Windowed-Read` (never blind-read `> 150` lines), `Zero Redundant Re-Read`, `Parallel Tool Batching`, `Subagent Isolation (<= 20L)`, `Surgical Diffs`, and `Pass-Quiet / Fail-Verbose` output.

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation (10 UAT Anti-Blindness Rules)

1. **Unmocked Cross-Module State Propagation:** After mutating Module A (`POST`/`PUT`/`PATCH`/`DELETE`), query Consumer Module B `GET` endpoints/stores against the live DB without mocks.
2. **3-Phase Temporal Lifecycle Assertion:** Assert Pending (`t < starts_at`), Active (`starts_at <= t <= ends_at`), and Expired/Reverted (`t > ends_at` + audit record).
3. **Audit Argument Assertions, `JSONB`/`Decimal` & Human Identities:** Assert `write_audit_log` args; test `json.dumps()` (no `default=str`) over `Decimal` fixtures; forbid raw UUID v4 in `actor_username`/`resource_display_name` and catch-all `else` badges (`UI-11X-02`).
4. **Dual Auto + Manual Refresh:** Pair `setInterval` (`clearInterval` on unmount) + WebSocket with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
5. **Heavy-Transfer Timeouts (`>= 180s` + `0-byte` Purge) & Batch Per-Item Check:** Enforce `timeout >= 180s` + `0-byte` cleanup on binary transfers; inspect `results[].status` per item on `HTTP 200 OK` batches.
6. **Zero Hardcoded Pass Guarantee:** Unverified/skipped checks MUST return `'SKIPPED'` / `detected: false` — never hardcoded `true` or `'PASSED'`.
7. **Post-Import `Settings` Sync (`QA-SMOKE-01`) & Ephemeral Prod Secrets (`SEC-15`):** Mutate both `os.environ["APP_ENV"]` and `settings.APP_ENV = "production"` (restore in `finally`); use ephemeral `>= 32B` `openssl rand` secrets in prod smoke runs.
8. **Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant (`SEC-16`):** Certify `login -> mfa/enroll|verify` in one continuous unmocked Redis/KeyDB test (`>= 128-bit` `challenge_id`, atomic `GETDEL`/Lua, `TTL <= 300s`, symmetric `PREAUTH_PUBLIC_ROUTES`).
9. **Unmocked Orchestrator Boot & Container Healthcheck Contract (`QA-HEALTH-01`):** Boot real entrypoints under default prod `Settings()` without mocking `OPTIONAL_WORKERS`, asserting healthcheck artifacts and `task.exception() is not None`.
10. **Dual CLI + MCP `stdio` Interactive `TTY` Anti-Hang Contract (`QA-CLI-TTY-01`):** Check `isTTY`/`isatty()` on bare dual CLI/MCP runs to print help and `exit(0)` (`<= 5s` E2E TTY test) when `--stdio` is absent.

---

## 3. Progressive Hydration Matrix of Modular Sub-Skills (v2.0)

Hydrate specialized sub-skills **strictly on demand** by domain (canonical inline identifiers; zero eager loading):

| Sub-Skill Identifier | Activation Trigger & Delegated Scope |
| :--- | :--- |
| `qa-11x-devsecops-hardener` | DISA STIG V6R5 & OWASP v4.2, PostgreSQL 15–17+ RLS (`QA-PG17-RLS`, `NOBYPASSRLS`, `after_begin`), Vault AES-256-GCM, `QA-HEALTH-01`, `QA-CLI-TTY-01`. |
| `qa-11x-systematic-debugging` | Mandatory 4-phase root-cause debugging (Reproduce -> Isolate -> Trace -> Verify) prior to applying any code patch. |
| `qa-11x-screenplay-builder` | Screenplay Pattern (Actors/Abilities/Tasks/Questions) for multi-role RBAC E2E flows vs. simple POM in small apps (`<= 10` tests / `<= 3` pages). |
| `qa-11x-llm-evaluator` | Dual-Mode LLM/RAG evaluation: deterministic offline contracts + on-demand semantic/red-team auditing with `DeepEval` and `Promptfoo`. |
| `qa-11x-vibe-rescue` | Vibe-to-Enterprise hardening for AI-generated prototypes (`>= 95%` coverage, STIG security, architecture, and non-root Docker). |

*(Companion skills: `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`.)*

---

## 4. On-Demand References (`references/01..09.md`)

- [`references/01-core-13-layers.md`](references/01-core-13-layers.md) — 13 QA layers, Anti-Mock, Anti-JSDOM, Trimodal Fixtures.
- [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md) — 22 STIG/OWASP controls & `SEC-16` snippets.
- [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md) — Python 3.13+ / FastAPI (`uv`, PG17, KeyDB, Alembic).
- [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md) — Node, Vue 3, React, Vitest, Playwright `v1.52.0-noble`, Lighthouse.
- [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md) — Bash/POSIX, ShellCheck, shfmt, BATS-core, `kcov >= 95%`.
- [`references/06-stack-php.md`](references/06-stack-php.md) — PHP 8.2–8.5 (`sinfallas/basephpcomposer`), Pest/PCOV, PHPStan Max, Infection.
- [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md) — Service-Layer RBAC, MCP `ApprovalRequest`, Tool Poisoning.
- [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md) — PG17 `FORCE ROW LEVEL SECURITY` (`after_begin`), Expand-Contract, `JSONB`/`Decimal`.
- [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md) — Prometheus RED, `trace_id`, Pumba chaos, `>= 180s` transfer timeouts.
