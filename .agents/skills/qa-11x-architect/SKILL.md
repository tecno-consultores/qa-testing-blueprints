---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps orchestrator (@sinfallas/mcp-qa-11x). Use whenever initializing or auditing QA in a
  repository, merging .example blueprints, writing or updating unit/BDD/mutation/E2E tests, enforcing STIG/OWASP
  controls, running ephemeral Docker QA, or certifying tasks before local commit.
---

# Master QA-11X v3.12 Routing Orchestrator (`qa-11x-architect`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` EN).

Corporate orchestrator for Standard 11X: 3-path routing, 13-layer pyramid, Rule Zero non-root Docker (`sinfallas/*`), Token Economy (`AST-First`, `Pass-Quiet/Fail-Verbose`), `QA-GIT-GATE-01`, and lazy sub-skills.

---

## 1. Adoption Tier, 3-Path Routing & MCP Execution (`QA-GIT-GATE-01`)

Read `.qa-11x.json` v3 (`tier: starter|standard|enterprise`; default `standard` without TTY) and classify Path. Open mutating tasks with **`[QA-11X | Tier: <tier> | Path: <DOCS_ONLY|MICRO_CHANGE|FULL_11X>]`**. On first mutating task (`MICRO_CHANGE`/`FULL_11X`, never `Code Q&A`), if `tierConfirmedByUser === false` or `inspect_project_config` reports `missing_unprompted`/`present_legacy` docs, ask once and persist in `.qa-11x.json` (never overwrite legacy docs). In `/plan`, read `<=80L` of `ROADMAP.md`, `docs/adr/`, `.agents/boundaries.json`. Pre-commit (**NEVER auto-`git push`**, `QA-GIT-GATE-01`): sync `CHANGELOG.md` (`## [Unreleased]`), `TESTING.md` on count/cov/cmd shifts, and `[x]`+`%` in `ROADMAP.md` for milestones:

- **`DOCS_ONLY` (human `*.md`/`docs/**`; excludes `.agents/{skills,rules,schemas}/`):** `0` Docker QA/AST -> sync docs/`CHANGELOG.md` -> `make sync-governance` -> `certify_11x_gate` -> local `git commit`.
- **`MICRO_CHANGE` (`<=3` files, `<5` callers, `0` routes/ORM):** 3-line plan -> `inspect_ast_blast_radius` -> sync unit/BDD (`QA-TEST-SYNC-01`) + stack QA (`run_ephemeral_qa`) -> AST refresh -> `CHANGELOG.md` -> `certify_11x_gate` -> local `git commit`.
- **`FULL_11X` (`>3` files, new API/UI, ORM, security, or `MED`/`HIGH` blast):** 11-step flow (`/plan`, `session_flight_recorder` -> `ACTIVE_TASK.md <=40L`, full pyramid + `QA-TEST-SYNC-01`, docs, AST, `certify_11x_gate` 10/10, local `git commit`).

### 1.1. MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x` v3.12.0 — 20 Tools + 13 Resources)
1. `inspect_ast_blast_radius` — Code Q&A & pre-edit impact.
2. `inspect_project_config` — stack, `standard_11x_readiness` (AST, tier, governance docs), `update_available`.
3. `audit_test_pyramid_gaps` — 13-layer audit + `meta_gates_audit` (AST, Thin-Repo, CI, CALM).
4. `fetch_blueprint_bundle` — SHA-256 index (`include_content:false`).
5. `bootstrap_or_merge_11x` — surgical `.example` merge.
6. `audit_security_stig_owasp` — 37 static rules (`SEC-01..16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-*`, `UI-11X-01..03`).
7. `run_ephemeral_qa` — `lint|unit|migration|integration|ci|parity|orphans|contracts|bdd|mutation|dast|e2e|perf|chaos|profile|all` (`.qa-evidence.json`).
8. `clean_workspace_11x` — rootless purge (keeps `dist`, `graphify-out/`, `certify_state.json`, cov in normal mode).
9. `certify_11x_gate` — 10/10 gate by tier (AST, lint+unit evidence, orphans, manifest, security).
10. `init_or_append_agents_md` — Thin-Repo `AGENTS.md` connector, tier & governance templates.
11. `reconcile_agents_governance` — prunes local duplicates; isolates `domain_<project>_*.md`.
12. `propose_skill_evolution_pr` — email template (`soporte@tecnoconsultores.net`, no auto-send) + GitHub URL.
13. `validate_calm_architecture` — FINOS CALM JSON & 11X controls.
14. `evaluate_release_gate` — `GO`/`NO_GO` (JUnit, latency/`5xx`/MSI/cov, defects SLA).
15. `evaluate_agent_trajectory` — offline / DeepEval trajectory evals.
16. `run_llm_red_team` — OWASP LLM Top 10 Promptfoo red-team.
17. `audit_vibe_prototype` — `VIBE-SEC-001..QA-005` & RLS rescue.
18. `sync_enterprise_tms` — Jira/Zephyr/Xray/GitHub Issues sync.
19. `session_flight_recorder` — `0600` JSON checkpoint + `ACTIVE_TASK.md` + Git.
20. `analyze_ecosystem_specs` — zero-footprint deep multi-repo specs, DTO/flow map & `00..05` skeletons (no vuln audit).

*Fallback (No MCP):* Load `references/01..10.md` (§4), check `manifest.json` (`sync_governance.py --check`), run `make sync-governance`.

---

## 2. Executive Laws, 13-Layer Pyramid & Token Economy

- **13-Layer Pyramid:** (L1) Static/SAST, (L2) Types/CC<=5, (L3) Unit >=95%, (L4) Live DB/ORM, (L5) Integration/Pact, (L6) Karate API, (L7) Karate UI/SSG, (L8) Mutation MSI>=80%, (L9) A11y/Anti-JSDOM, (L10) Load k6/Locust, (L11) DAST ZAP, (L12) Chaos Pumba, (L13) Trimodal/3-Phase Clock + Meta-Gates (AST/CALM/10-Gate).
- **10 Non-Negotiable Laws:**
  1. **Rule Zero:** Zero host runs; unless delegated to a Companion MCP (`playwright`, `chrome-devtools`, `semgrep`, `serena`, `sonarqube`, `snyk`, `trivy`), run non-root `sinfallas/*` Docker (`-u "$(id -u):$(id -g)"`, `HOME=/tmp`, `--restart=no --network none` offline; frozen lockfiles honoring `QA_OFFLINE=1`).
  2. **Coverage & Types:** `--import-mode=importlib --cov=src --cov-fail-under=95`, `COVERAGE_FILE=/tmp/.coverage` (`QA-COV-01`), `mypy --strict --cache-dir=/tmp/mypy` (`QA-MYPY-01`), `CC<=5`, `MSI>=80%` (`QA-STRYKER-CFG-01`).
  3. **Hermetic Units vs. Live DB:** `MockDbSession` & `call_args`-asserted `write_audit_log` `AsyncMock` ONLY in `.unit.*` (never integration/Anti-Silo); mock external HTTP in `.unit.*` only.
  4. **Anti-JSDOM & Dual Refresh:** Ban `position: fixed` footers (`UI-11X-01`); pair WebSocket/timers (`clearInterval`) with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
  5. **Surgical Merge & Thin-Repo:** Merge `.example` safely; zero local copies of global skills/rules (`reconcile-agents` prunes local duplicates).
  6. **Proportional BDD, Zero Orphans & `QA-TEST-SYNC-01`:** Dynamic `Idempotency-Key` UUIDs (`QA-KARATE-IDEMP`); JVM-free libs/CLIs/`<=3`-endpoint stacks may use JVM-free runners; `0` orphan UI/API; co-evolve unit/integration/BATS/Karate suites.
  7. **22 STIG V6R5 & OWASP v4.2 Controls (37 Scanner Rules):** RLS `NOBYPASSRLS`+`after_begin` (`QA-PG17-RLS`), WORM `seq_num`+`pg_advisory_xact_lock`, Service RBAC+`ApprovalRequest`, AES-256-GCM, anti-SSRF, `NFKC`, anti-XXE, OSHP, Argon2id, CycloneDX SBOM, SHA-40 Actions (`SEC-CI-ACTION-REF`).
  8. **RED Pre-Chaos:** Expose `/metrics` (`trace_id`) prior to load/chaos profiles.
  9. **Trimodal & 3-Phase Clock:** Test Virgin/Nominal/Degraded across 3 clock phases; `inspect_ast_blast_radius` pre-edit + AST refresh post-edit.
  10. **Closure, Audit & `QA-GIT-GATE-01`:** Audits run `inspect_project_config` + `audit_test_pyramid_gaps` + `audit_security_stig_owasp` + `certify_11x_gate`. Keep `ACTIVE_TASK.md <=40L`, run `make sync-governance` + `make certify`, commit locally (no `git push`), invoke `propose_skill_evolution_pr` (`soporte@tecnoconsultores.net`) on QA escapes.
- **High-IQ Token Economy:** `AST-First -> Grep-Fallback -> 40–80L Read` (no blind `>150L`), `Zero Re-Read`, `Parallel Batching`, `Subagents (<=20L)`, `Pass-Quiet/Fail-Verbose`, Objective Critique (skip praise; verify premises; don't debate routine cmds).

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation (11 UAT Anti-Blindness Rules)

1. **Unmocked Cross-Module Propagation:** After mutating Module A, query Consumer Module B `GET`/stores against live DB without mocks.
2. **3-Phase Temporal Lifecycle:** Assert Pending (`t < starts_at`), Active (`starts_at <= t <= ends_at`), Expired/Reverted (`t > ends_at` + audit).
3. **Audit Args, `JSONB`/`Decimal` & Human Identities:** Assert `write_audit_log` args; `json.dumps()` (no `default=str`) over `Decimal`; forbid raw UUID v4 in `actor_username`/`resource_display_name` & catch-all `else` badges (`UI-11X-02`).
4. **Dual Auto + Manual Refresh:** Pair `setInterval` (`clearInterval`) + WebSocket with **`[ 🔄 Refrescar ]`** (`?refresh=true`).
5. **Heavy-Transfer Timeouts (`>=180s` + `0-byte` Purge) & Batch Check:** Require `timeout>=180s` + `0-byte` purge; check `results[].status` on `200 OK` batches.
6. **Zero Hardcoded Pass:** Unverified/skipped checks MUST return `'SKIPPED'` / `detected: false`.
7. **Post-Import `Settings` Sync (`QA-SMOKE-01`) & Prod Secrets (`SEC-15`):** Mutate `os.environ["APP_ENV"]` + `settings.APP_ENV="production"` (restore in `finally`); ephemeral `>=32B` keys in prod smoke.
8. **Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant (`SEC-16`):** Certify `login -> mfa/enroll|verify` in one unmocked KeyDB test (`>=128-bit` `challenge_id`, atomic `GETDEL`/Lua, `TTL<=300s`, symmetric `PREAUTH_PUBLIC_ROUTES`).
9. **Unmocked Orchestrator Boot & Container Healthcheck Contract (`QA-HEALTH-01`):** Boot real entrypoints under prod `Settings()` without mocking `OPTIONAL_WORKERS`, asserting healthcheck artifacts & `task.exception()`.
10. **CLI + MCP `TTY` Anti-Hang (`QA-CLI-TTY-01`):** On bare dual CLI/MCP runs with `isTTY`/`isatty()` and no `--stdio`, print help and `exit(0)` (`<=5s`).
11. **SDK Transport & Lockfile Smoke (`QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`):** Drive MCP/ACP via real SDK transports (`InMemoryTransport`+`Client`/`ClientSession`); install image deps from lockfiles + smoke (`import <app>`, `id -u != 0`, `401`).

---

## 3. Progressive Hydration Matrix of Modular Sub-Skills (v3.12)

Hydrate specialized sub-skills **strictly on demand** (zero eager loading):

| Sub-Skill | Trigger & Scope |
| :--- | :--- |
| `qa-11x-devsecops-hardener` | STIG V6R5, OWASP v4.2, PG17 RLS (`QA-PG17-RLS`, `NOBYPASSRLS`, `after_begin`), AES-256-GCM, `QA-*` contracts. |
| `qa-11x-systematic-debugging` | Mandatory 4-phase debugging (Reproduce -> Isolate -> Trace -> Verify) pre-patch. |
| `qa-11x-screenplay-builder` | Screenplay RBAC E2E vs POM (`<=10` tests/`<=3` pages), `QA-PLAYWRIGHT-PIN-01` & `QA-SSR-HYDRATION-01`. |
| `qa-11x-llm-evaluator` | Dual-Mode LLM/RAG evals: offline contracts + DeepEval/Promptfoo red-team. |
| `qa-11x-vibe-rescue` | Vibe-to-Enterprise (`>=95%` cov, STIG, architecture, non-root Docker). |
| `tactical-patterns-11x` | Hydrate ONLY on concurrency/idempotency/external ports or CC/max-params fails. |
| `qa-11x-reverse-specs` | Zero-footprint multi-repo specs, deep DTO/flow map & `00..05` deliverables (no vuln audit). |

*(Companions: `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`.)*

---

## 4. On-Demand References (`references/01..10.md`)

- [`references/01-core-13-layers.md`](references/01-core-13-layers.md) — 13 QA layers, Anti-Mock, Anti-JSDOM, Trimodal.
- [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md) — 22 DISA/OWASP ref controls (vs 37 scanner rules) & `SEC-16`.
- [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md) — Python 3.15 / FastAPI (`uv`, PG17, KeyDB).
- [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md) — Node, Vue 3, React, Vitest, Playwright `v1.52.0-noble`.
- [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md) — Bash, ShellCheck, shfmt, BATS, `kcov >=95%`.
- [`references/06-stack-php.md`](references/06-stack-php.md) — PHP 8.2–8.5, Pest/PCOV, PHPStan Max, Infection.
- [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md) — Service RBAC, `ApprovalRequest`, Tool Poisoning.
- [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md) — PG17 RLS (`after_begin`), Expand-Contract, `Decimal`.
- [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md) — Prometheus RED, `trace_id`, Pumba, `>=180s` timeouts.
- [`references/10-sdd-ears-traceability.md`](references/10-sdd-ears-traceability.md) — EARS REQ->Karate, Analyze gate, `[P]` waves & Delta Specs.
