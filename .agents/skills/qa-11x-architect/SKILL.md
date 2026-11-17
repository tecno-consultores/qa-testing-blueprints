---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v3.0+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), optimize context token consumption, or update TESTING.md and CHANGELOG.md.
---

# Master QA-11X v3.0 Routing Orchestrator (`qa-11x-architect`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless target `AGENTS.md` mandates a fixed language, respond in the **user's prompt language**, and write commits/docs matching `README.md` & `CHANGELOG.md` (ignoring concise English `AGENTS.md`/`.agents/**`; default to prompt language on empty repos).

Corporate orchestrator for Standard 11X: 3-path routing, 13-layer pyramid, Rule Zero non-root Docker (`sinfallas/*`), Token Economy (`AST-First`, `Pass-Quiet/Fail-Verbose`), `QA-GIT-GATE-01`, and lazy sub-skills.

---

## 1. 3-Path Proportional Routing & MCP Execution (`QA-GIT-GATE-01`)

Classify every task first. **NEVER auto-run `git push`** (`QA-GIT-GATE-01` — stop at local `git commit` unless human explicitly authorizes push):

- **`DOCS_ONLY` (`*.md` / `docs/**` only):** `0` Docker QA runs, `0` AST rebuilds -> sync docs/`CHANGELOG.md` -> `make sync-governance` -> `certify_11x_gate` -> local `git commit`.
- **`MICRO_CHANGE` (`<= 3` files, `< 5` callers, `0` routes/ORM):** 3-line plan -> `inspect_ast_blast_radius` -> sync unit/BDD tests (`QA-TEST-SYNC-01`) + stack QA (`run_ephemeral_qa`) -> AST refresh -> `CHANGELOG.md` -> `certify_11x_gate` -> local `git commit`.
- **`FULL_11X` (`> 3` files, new API/UI, ORM, security, or `MED`/`HIGH` blast):** 11-step workflow (`/plan`, `session_flight_recorder` -> `ACTIVE_TASK.md <= 40L`, full pyramid + `QA-TEST-SYNC-01`, docs, AST, `certify_11x_gate` 10/10, local `git commit`).

### 1.1. MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x` v3.0.0 — 19 Tools + 13 Resources)
1. `inspect_ast_blast_radius` — Code Q&A & pre-edit impact.
2. `inspect_project_config` — stack, drift, `update_available`.
3. `audit_test_pyramid_gaps` — 13-layer audit + config.
4. `fetch_blueprint_bundle` — SHA-256 index (`include_content: false`).
5. `bootstrap_or_merge_11x` — surgical `.example` merge.
6. `audit_security_stig_owasp` — static audit (`SEC-01..16`, `SEC-CI-ACTION-REF`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-DOCKER-TTY-01`, `QA-CI-ESCAPE-01`, `QA-MAKE-CURDIR-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `UI-11X-01..03`).
7. `run_ephemeral_qa` — runs `lint|unit|migration|integration|ci|bdd|mutation|dast|e2e|perf|chaos|all` (`sinfallas/*`, `.qa-evidence.json`).
8. `clean_workspace_11x` — rootless purge (keeps `dist`, `graphify-out/`).
9. `certify_11x_gate` — 10/10 gate (`/tmp/qa-11x-last-failure.json`, lint).
10. `init_or_append_agents_md` — Thin-Repo `AGENTS.md` connector.
11. `reconcile_agents_governance` — prunes duplicates; isolates `domain_<project>_*.md`.
12. `propose_skill_evolution_pr` — Dual-Consumer PR (AI + MCP + ES docs).
13. `validate_calm_architecture` — FINOS CALM JSON & 11X controls.
14. `evaluate_release_gate` — `GO`/`NO_GO` (`>=95%`, Trivy=0, MSI, CALM).
15. `evaluate_agent_trajectory` — offline / DeepEval trajectory evals.
16. `run_llm_red_team` — OWASP LLM Top 10 Promptfoo red-team.
17. `audit_vibe_prototype` — `VIBE-SEC-001..QA-005` & RLS rescue.
18. `sync_enterprise_tms` — Jira/Zephyr/Xray/GitHub Issues sync.
19. `session_flight_recorder` — `0600` JSON checkpoint + `ACTIVE_TASK.md` + Git.

*Fallback (No MCP):* Load **one** module in `references/01..09.md` (§4), verify `manifest.json` via `sha256sum -c`, and run `make sync-governance`.

---

## 2. Executive Laws, 13-Layer Pyramid & Token Economy

- **13-Layer Pyramid:** (L1) Static/Types (`--max-warnings 0`, `mypy --strict`, `PHPStan max`), (L2) Secret/SBOM/Trivy (`HIGH/CRITICAL=0`), (L3) Unit (`>=95%`), (L4) Mutation (`MSI>=80%`), (L5) Live DB/ORM (`postgres:17-alpine`), (L6–L7) BDD (Karate Labs on multi-service `FULL_11X`; `pytest+httpx`/`vitest` on libs/CLIs/`<=3` endpoints), (L8) Visual/WCAG 2.1 AA (`@axe-core`, Lighthouse, Anti-JSDOM), (L9) DAST (ZAP), (L10) Load (`k6`/Locust), (L11) Chaos (Pumba post-RED `/metrics`), (L12) AST Health, (L13) 10/10 Gate.
- **10 Non-Negotiable Laws:**
  1. **Rule Zero:** Zero host runs; run tools in non-root `sinfallas/*` containers (`-u "$(id -u):$(id -g)"`, `HOME=/tmp`, `pnpm-store-init`).
  2. **Coverage & Types:** `--import-mode=importlib --cov=src --cov-fail-under=95` with `COVERAGE_FILE=/tmp/.coverage` (`QA-COV-01`), `mypy --strict --cache-dir=/tmp/mypy` (`QA-MYPY-01`), `CC<=5`, `MSI>=80%`.
  3. **Hermetic Units vs. Live DB:** Mock external HTTP in `.unit.*`; never mock SQL or cross-module propagation.
  4. **Anti-JSDOM & Dual Refresh:** Ban `position: fixed` footers (`UI-11X-01`); pair WebSocket/timers (`clearInterval` on unmount) with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
  5. **Surgical Merge & Thin-Repo:** Merge `.example` safely; zero local duplication of global skills/rules.
  6. **Proportional BDD, Zero Orphans & Test Co-Evolution (`QA-TEST-SYNC-01`):** Dynamic `Idempotency-Key` UUIDs (`QA-KARATE-IDEMP`); `0` orphan UI/API endpoints; update affected unit/integration/BATS/Karate `.feature` tests on code, schema, skill, or `manifest.json` edits.
  7. **STIG V6R5 & OWASP v4.2:** RLS `NOBYPASSRLS` + `after_begin` (`QA-PG17-RLS`), WORM `seq_num` + `pg_advisory_xact_lock`, Service-Layer RBAC + `ApprovalRequest`, AES-256-GCM Vault, anti-SSRF, `NFKC`, anti-XXE, OSHP, Argon2id lockout, CycloneDX SBOM, SHA-40 Actions (`SEC-CI-ACTION-REF`) (`qa-11x-devsecops-hardener`).
  8. **RED Pre-Chaos:** Expose `/metrics` (`trace_id`) prior to load/chaos profiles.
  9. **Trimodal & 3-Phase Clock:** Test Virgin/Nominal/Degraded states across all 3 clock phases; run `inspect_ast_blast_radius` pre-edit and refresh AST post-edit.
  10. **Closure & `QA-GIT-GATE-01`:** Keep `.agents/ACTIVE_TASK.md <= 40` lines, run `make sync-governance` + `make certify`, commit locally without `git push`, and invoke `propose_skill_evolution_pr` on QA escapes.
- **High-IQ Token Economy:** `AST-First -> Grep-Fallback -> 40–80L Windowed-Read` (no blind `>150L` reads), `Zero Redundant Re-Read`, `Parallel Tool Batching`, `Subagent Isolation (<=20L)`, `Surgical Diffs`, `Pass-Quiet / Fail-Verbose`.

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation (11 UAT Anti-Blindness Rules)

1. **Unmocked Cross-Module State Propagation:** After mutating Module A (`POST`/`PUT`/`PATCH`/`DELETE`), query Consumer Module B `GET` endpoints/stores against live DB without mocks.
2. **3-Phase Temporal Lifecycle Assertion:** Assert Pending (`t < starts_at`), Active (`starts_at <= t <= ends_at`), and Expired/Reverted (`t > ends_at` + audit record).
3. **Audit Argument Assertions, `JSONB`/`Decimal` & Human Identities:** Assert `write_audit_log` args; test `json.dumps()` (no `default=str`) over `Decimal` fixtures; forbid raw UUID v4 in `actor_username`/`resource_display_name` and catch-all `else` badges (`UI-11X-02`).
4. **Dual Auto + Manual Refresh:** Pair `setInterval` (`clearInterval` on unmount) + WebSocket with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
5. **Heavy-Transfer Timeouts (`>= 180s` + `0-byte` Purge) & Batch Per-Item Check:** Enforce `timeout >= 180s` + `0-byte` cleanup on binary transfers; inspect `results[].status` per item on `HTTP 200 OK` batches.
6. **Zero Hardcoded Pass Guarantee:** Unverified/skipped checks MUST return `'SKIPPED'` / `detected: false` — never hardcoded `true` or `'PASSED'`.
7. **Post-Import `Settings` Sync (`QA-SMOKE-01`) & Ephemeral Prod Secrets (`SEC-15`):** Mutate both `os.environ["APP_ENV"]` and `settings.APP_ENV = "production"` (restore in `finally`); use ephemeral `>= 32B` `openssl rand` secrets in prod smoke runs.
8. **Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant (`SEC-16`):** Certify `login -> mfa/enroll|verify` in one continuous unmocked Redis/KeyDB test (`>= 128-bit` `challenge_id`, atomic `GETDEL`/Lua, `TTL <= 300s`, symmetric `PREAUTH_PUBLIC_ROUTES`).
9. **Unmocked Orchestrator Boot & Container Healthcheck Contract (`QA-HEALTH-01`):** Boot real entrypoints under default prod `Settings()` without mocking `OPTIONAL_WORKERS`, asserting healthcheck artifacts and `task.exception() is not None`.
10. **Dual CLI + MCP `stdio` Interactive `TTY` Anti-Hang Contract (`QA-CLI-TTY-01`):** Check `isTTY`/`isatty()` on bare dual CLI/MCP runs to print help and `exit(0)` (`<= 5s` E2E TTY test) when `--stdio` is absent.
11. **Real-Runtime SDK Transport & Lockfile Image Smoke (`QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`):** Drive MCP/JSON-RPC/ACP handlers via real in-process SDK transports (`InMemoryTransport`+`Client` / `ClientSession`, never only `MagicMock` calls); install container deps from lockfiles (`uv sync --frozen --no-dev` / `uv export --frozen --no-dev | uv pip install -r -` / `pnpm install --frozen-lockfile`) and smoke-test built images (`import <app>`, `id -u != 0`, `401`).

---

## 3. Progressive Hydration Matrix of Modular Sub-Skills (v2.0)

Hydrate specialized sub-skills **strictly on demand** by domain (canonical inline identifiers; zero eager loading):

| Sub-Skill | Trigger & Scope |
| :--- | :--- |
| `qa-11x-devsecops-hardener` | STIG V6R5, OWASP v4.2, PG17 RLS (`QA-PG17-RLS`, `NOBYPASSRLS`, `after_begin`), AES-256-GCM, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-DOCKER-TTY-01`, `QA-CI-ESCAPE-01`, `QA-MAKE-CURDIR-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`. |
| `qa-11x-systematic-debugging` | Mandatory 4-phase debugging (Reproduce -> Isolate -> Trace -> Verify) pre-patch. |
| `qa-11x-screenplay-builder` | Screenplay (Actors/Abilities/Tasks/Questions) RBAC E2E vs POM (`<=10` tests/`<=3` pages) & `QA-SSR-HYDRATION-01`. |
| `qa-11x-llm-evaluator` | Dual-Mode LLM/RAG evals: offline contracts + DeepEval/Promptfoo red-team. |
| `qa-11x-vibe-rescue` | Vibe-to-Enterprise (`>=95%` cov, STIG, architecture, non-root Docker). |
| `tactical-patterns-11x` | Hydrate ONLY on concurrency/idempotency/external ports or CC/max-params fails. |

*(Companions: `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`.)*

---

## 4. On-Demand References (`references/01..09.md`)

- [`references/01-core-13-layers.md`](references/01-core-13-layers.md) — 13 QA layers, Anti-Mock, Anti-JSDOM, Trimodal.
- [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md) — 22 STIG/OWASP controls & `SEC-16`.
- [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md) — Python 3.13+ / FastAPI (`uv`, PG17, KeyDB).
- [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md) — Node, Vue 3, React, Vitest, Playwright `v1.52.0-noble`.
- [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md) — Bash, ShellCheck, shfmt, BATS, `kcov >= 95%`.
- [`references/06-stack-php.md`](references/06-stack-php.md) — PHP 8.2–8.5 (`basephpcomposer`), Pest/PCOV, PHPStan Max, Infection.
- [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md) — Service RBAC, MCP `ApprovalRequest`, Tool Poisoning.
- [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md) — PG17 RLS (`after_begin`), Expand-Contract, `JSONB`/`Decimal`.
- [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md) — Prometheus RED, `trace_id`, Pumba, `>=180s` timeouts.
