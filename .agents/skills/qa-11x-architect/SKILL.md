---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.10+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), optimize context token consumption, or update TESTING.md and CHANGELOG.md.
---

# Master QA 11X & DevSecOps Architect (`qa-11x-architect`)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

The **`qa-11x-architect`** skill provides unified governance, architectural methodology, High-IQ Token Economy, and tactical playbooks for enterprise-grade software quality. It enforces the 13 layers of the 11X Quality Pyramid, non-destructive surgical merging of configuration templates, Anti-Mock & Anti-Silo Blindness, Anti-JSDOM visual geometry, and the 22 security-by-design patterns mandated by DISA ASD STIG V6R5 and OWASP Developer Guide v4.2.

---

## 1. Environment Detection & 3-Path Proportional Execution Protocol

The agent MUST adapt its execution strategy to: (A) whether the MCP server `@sinfallas/mcp-qa-11x` is available, and (B) the **3-Path Proportional Execution Triage** (`DOCS_ONLY`, `MICRO_CHANGE`, or `FULL_11X`).

```
                      ┌─────────────────────────────────────────┐
                      │ 1. Classify Change Scope (3-Path Triage)│
                      └────────────────────┬────────────────────┘
             ┌─────────────────────────────┼─────────────────────────────┐
   [Path 1: DOCS_ONLY]           [Path 2: MICRO_CHANGE]        [Path 3: FULL_11X / CODE_CHANGE]
   Only *.md / docs/**           <= 3 files, LOW blast radius,  > 3 files, new API/UI, ORM/DB,
   0 Docker QA runs,             0 schema/route changes:        security or MED/HIGH blast radius:
   0 AST rebuilds;               Inline 3-line plan,            Full 11-step workflow (/plan,
   certify_11x_gate + push       targeted QA + incremental AST  ACTIVE_TASK.md, full pyramid + BDD)
```

### Case A: MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x`) is Available
Execute with zero hallucination and maximum token economy:
1. **Detect Project Stack:** Call `inspect_project_config(project_path)` to discover active frameworks, lockfiles, existing test suites, and compliance gaps.
2. **Audit 13-Layer Test Pyramid Gaps:** Call `audit_test_pyramid_gaps(project_path, stack)` (note: already runs `inspect_project_config` internally—do not call both sequentially) to obtain the 11X pyramid score, top orphan source files, untested APIs/views, and a prioritized rescue plan.
3. **Retrieve Fresh Blueprints (Metadata-Only Default):** Call `fetch_blueprint_bundle(stack, include_common_and_agents, include_content: false)` or `bootstrap_or_merge_11x(project_path, stack, dry_run)` so templates are verified via SHA-256 in local cache (`~/.cache/qa-11x-blueprints/`) and merged on disk without dumping raw file contents into the LLM context window.
4. **Audit Security Posture:** Call `audit_security_stig_owasp(project_path)` for static checks of the 22 DISA STIG V6R5 and OWASP v4.2 controls (grouped by `rule_id`).
5. **Execute Tests in Docker (`MICRO_CHANGE` & `FULL_11X` Only):** Call `run_ephemeral_qa(project_path, stage, timeout_seconds, skip_if_docs_only: true)` inside isolated `sinfallas/*` containers and receive token-efficient JSON summaries. On `DOCS_ONLY` Fast-Path, test execution and AST graph rebuilds are automatically skipped.
6. **Sanitize Workspace:** Call `clean_workspace_11x(project_path, dry_run, deep_prune)` or read `blueprint://core/cleanup-script` to eradicate test artifacts and root-owned files without `sudo`.
7. **Certify Quality Gate:** Call `certify_11x_gate(project_path)` (which already includes `audit_security_stig_owasp`—do not duplicate calls) before concluding any task.
8. **Inject or Append AGENTS.md Connector & Scripts:** Call `init_or_append_agents_md(project_path, dry_run)` or `npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts` to install skills, `.agents/scripts/*`, and non-destructively append the canonical QA 11X connector block to `AGENTS.md`.
9. **Propose Continuous Skill Evolution:** Call `propose_skill_evolution_pr(...)` to contribute empirical improvements and QA-escape fixes back to `tecno-consultores/qa-testing-blueprints`.
10. **Reconcile Governance & Isolate Domain Rules:** Call `reconcile_agents_governance(project_path, dry_run)` (`reconcile-agents` / `--reconcile`) to prune duplicate promoted directives in `.agents/` and extract project business rules to `.agents/rules/domain_<project>_rules.md` with backups in `.agents/backups/<timestamp>/`.

### Case B: Standalone Skill / Fallback Mode (No MCP Server)
1. **3-Tier Progressive Reference Loading:** Read ONLY the single reference file matching the active stack and domain (never pre-load all references):
   - Shared Architecture & 13 Layers: [`references/01-core-13-layers.md`](references/01-core-13-layers.md)
   - Security Audit (22 Controls): [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md)
   - Python / FastAPI: [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md)
   - Node / Vue / React: [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md)
   - Bash / DevOps: [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md)
   - PHP 8.2–8.5 (`sinfallas/basephpcomposer`): [`references/06-stack-php.md`](references/06-stack-php.md)
   - MCP Servers, Agentic Tool-Calling & NHI Security: [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md)
   - PostgreSQL 17 RLS & Zero-Downtime Migrations: [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md)
   - SRE Observability (RED), Pumba Chaos & Incident RCA: [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md)
2. **Hydrate On-Demand from GitHub Raw (Zero-Clone):**
   ```bash
   RAW_BASE="https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main"
   curl -fsSL "${RAW_BASE}/manifest.json" -o /tmp/qa11x_manifest.json
   ```
   Parse `.stacks["<stack>"].files` and `.common_files`, download needed items from `${RAW_BASE}/${path}`, and verify each `sha256` hash with `sha256sum -c`.

---

## 2. The 10 Non-Negotiable Laws of Standard 11X

*(Compact Progressive Disclosure index — detailed rules live in `.agents/rules/*.md` and `references/*.md`):*

1. **Law 1: Rule Zero — Ephemeral Docker Isolation**  
   NEVER run `pip`, `uv`, `pytest`, `npm`, `pnpm`, `vitest`, `playwright`, `shellcheck`, or linters on the host OS. Execute everything inside ephemeral `sinfallas/*` containers with named cache volumes (`uv-cache`, `pnpm-store`).

2. **Law 2: Strict Coverage (`>= 95.0%`), Complexity Grade A & Zero Warnings (`--max-warnings 0`)**  
   Unit coverage MUST reach `>= 95.0%` across lines, branches, and statements (including `catch`/`except`). Cyclomatic Complexity Grade A (`CC <= 5` via Radon / SonarJS). 0 SAST/DAST High/Critical findings. 0 surviving critical mutants (`MSI >= 80%`). Linters (ESLint, SonarJS, Ruff, PHPStan, ShellCheck) enforce `--max-warnings 0`.

3. **Law 3: Network Isolation vs. Anti-Mock & Anti-Silo Blindness**  
   Unit tests MUST block external network calls (`pytest-mock`, `nock`, `msw`, `bats-mock`, `globalThis.fetch`). Conversely, DB persistence, ORM migrations (`verify_alembic_orm_parity.py` against real `postgres:17-alpine`), and **cross-module state propagation** MUST NEVER be mocked: mutations in Producer Module A must immediately reflect in Consumer Module B `GET` queries without intermediate mocks.

4. **Law 4: Visual Geometry, Anti-JSDOM Layout & Dual Refresh Ergonomics**  
   JSDOM returns `0x0` bounding boxes. Prohibit fixed floating footers (`position: fixed`) that obstruct viewports; use in-flow footers (`margin-top: auto` inside `<main>`). Verify in real headless Chromium with Karate UI / Playwright + `@axe-core` (0 WCAG 2.1 AA violations). Operational dashboards, NOC wallboards, and live maps MUST enforce the **Dual Auto + Manual Refresh Invariant** (`setInterval` with `clearInterval` in `onUnmounted` + WebSocket + explicit **`[ 🔄 Refrescar ]`** button with `?refresh=true`).

5. **Law 5: Non-Destructive Surgical Merging & `.agents/` Governance Isolation**  
   Surgically merge `.example` configs (`pyproject.toml`, `package.json`, `composer.json`, `Makefile`) enforcing `--max-warnings 0` without deleting existing dependencies or scripts. In consumer projects (e.g. `rosgrid`), keep the 7 canonical `.agents/rules/*.md` files synchronized with upstream and isolate local domain rules in `.agents/rules/domain_<project>_*.md` or outside the `AGENTS.md` connector block (`reconcile_agents_governance`).

6. **Law 6: Mandatory Karate Labs BDD, Dynamic `Idempotency-Key`, Zero Orphan UI Components & Zero Orphan API Endpoints**  
   Every API endpoint requires Karate Labs HTTP BDD scenarios (`api_test.feature`). All mutable requests (`POST`, `PUT`, `PATCH`, `DELETE`) in `api_test.feature` targeting endpoints protected by `IdempotencyMiddleware` MUST inject a dynamic UUID via `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` (except when explicitly testing `400 Bad Request` on missing header or reusing a scenario-local `* def idemKey = java.util.UUID.randomUUID() + ''` to assert idempotent replay / `409 Conflict`), preventing `400` or `409`/`422` collisions across repeated runs against live Redis/KeyDB. Every UI workflow requires Karate Labs UI scenarios (`ui_business_flow.feature`). 100% of `.vue`/`.tsx` components require unit tests (`verify_zero_orphan_vue_components.py`), and 100% of frontend API calls must match backend routes (`verify_no_orphan_api_endpoints.py`).

7. **Law 7: DISA ASD STIG V6R5, OWASP v4.2 Security-by-Design, Service-Layer RBAC & Semantic Audit Integrity**  
   Enforce the 22 controls in [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md): PostgreSQL `FORCE ROW LEVEL SECURITY`, pre-DNS SSRF check, FIPS 140-3 AES-256-GCM + secret zeroization, `Idempotency-Key`, `extra="forbid"`, CSWSH `4403`, role timeouts (10m/15m), 3-attempt/15m lockout with constant-time Argon2id dummy hash, Unicode `NFKC`, anti-XXE, magic-byte file check, HMAC-SHA256 audit logs with 75% capacity alerts, OSHP headers, Fail-Secure startup, and CycloneDX SBOM. **Service-Layer RBAC Defense (Anti-`Depends()` Bypass):** Never rely solely on HTTP router decorators (`Depends(require_roles(...))`) when mutating functions can be invoked internally (e.g. JSON-RPC/MCP tool dispatchers, background workers, WebSockets); explicitly validate `claims["role"]` / `claims["rol"]` at the service-layer entry point and route every mutating MCP tool through an explicit approval gate (`ApprovalRequest` / `AWAITING_APPROVAL` or Step-Up confirmation). Never mock `write_audit_log` with a blind `AsyncMock` without asserting `call_args`; `actor_username` and `resource_display_name` MUST resolve to human-readable names, never raw UUID v4 (`claims.get("sub")`).

8. **Law 8: Universal RED Observability Pre-Chaos**  
   Expose Prometheus metrics (`/metrics` or `Pushgateway`: Rate, Errors, Duration) before running Pumba chaos profiles with Locust or Artillery load generation.

9. **Law 9: Trimodal Ground-Truth Fixtures, 3-Phase Temporal Lifecycle, Heavy-Transfer/Batch-Item Invariants & AST Graph Lifecycle**  
   Test against three raw fixtures: (1) Virgin / Factory Default (negative invariants), (2) Nominal Configured (active healthy), and (3) Degraded / Unsupported (graceful fallback without HTTP 500, per-item `results[].status` inspection on `HTTP 200 OK` batch responses, and `timeout >= 180s` + `0-byte` truncated file purge on synchronous binary/firmware transfers). Test time-bounded entities (`starts_at`/`ends_at`, 60s Safe Mode, 30s Step-Up tokens, leases) across all **3 Temporal Lifecycle Phases**: Phase 1 Pending (`t < starts_at`, `Programada`), Phase 2 Active (`starts_at <= t <= ends_at`, `En Curso` / `Activa`), and Phase 3 Expired/Reverted (`t > ends_at` or Cancelled). **ALWAYS** inspect AST blast radius (`inspect_blast_radius.py` / `inspect_ast_blast_radius`) before modifying shared files; create `graphify-out/graph.json` first via `./scripts/actualizar-grafos-graphify.sh` if missing, and update it incrementally upon completion.

10. **Law 10: Proportional Planning (`/plan`), Compact Active Task (`<= 40 lines`), Concise `CHANGELOG.md`, Closure Gate & QA-Escape Evolution**  
    On `FULL_11X` tasks, invoke `/plan` (or plan artifact) and track live progress (`- [ ]` → `- [x]`) in `.agents/ACTIVE_TASK.md` (kept ultra-compact `<= 40 lines`). On `MICRO_CHANGE` (`<= 3` files, `LOW` blast radius), use a concise 3-line inline plan. Synchronize `docs/specs/`, `TESTING.md`, `CHANGELOG.md` (maintaining a single header per version with concise 1–2 line executive bullets and zero internal sub-task logs), `ROADMAP.md` (`verify_roadmap_consistency.py`), and AST graphs (`./scripts/actualizar-grafos-graphify.sh`), mark `ACTIVE_TASK.md` `COMPLETED (100%)`, run `./.agents/scripts/certify_task_completion.sh`, and `git commit` + `git push`. On QA-escape bug fixes, proactively include `💡 Oportunidad de Mejora Detectada para el Estándar QA 11X` and invoke `propose_skill_evolution_pr` without waiting to be asked.

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation Invariant (5 UAT Anti-Blindness Rules)

Every test suite under Standard 11X MUST enforce these 5 design rules (full details in [`.agents/rules/mandatory_qa_pyramid_and_doc_sync.md`](../../rules/mandatory_qa_pyramid_and_doc_sync.md)):

1. **Cross-Module State Propagation Without Intermediate Mocks:** Never validate a state mutation in Module A (`POST`/`PUT`/`PATCH`/`DELETE`) by asserting only `HTTP 200/201` while testing Consumer Module B with static mocks. Immediately query Consumer Module B `GET` endpoints and stores against the live database without intermediate mocks to certify end-to-end propagation across KPIs, badges, and maps.
2. **Mandatory 3-Phase Temporal Lifecycle Assertion (Anti 2-State Static Blindness):** Test every time-window/TTL entity (`starts_at`/`ends_at`, 60s Safe Mode, leases) across all **3 clock phases**: Phase 1 (`t < starts_at`, `Programada`), Phase 2 (`starts_at <= t <= ends_at`, `En Curso` / `Activa` with background scheduler alive beyond 50ms), and Phase 3 (`t > ends_at` or Cancelled, nominal state restored + audit log).
3. **Prohibition of Blind Audit Mocks, `JSONB`/`Decimal` Serialization Parity & Anti-Raw UUID Semantic Assertion:** Never replace `write_audit_log` with an uninspected `AsyncMock` without asserting `call_args`. In unit tests using `MockDbSession`, validate all SQLAlchemy `JSON`/`JSONB` columns (`AuditLog.before_state`, `AuditLog.after_state`) with `json.dumps()` **without `default=str`**, and populate ORM `Numeric(p, s)` fixtures with `decimal.Decimal` instances (matching PostgreSQL `asyncpg`) to prevent `TypeError: Object of type Decimal is not JSON serializable` escapes. Certify that `actor_username`, `resource_display_name`, and `router_display_name` never match a raw UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, preventing `claims.get("sub")` leaks), and prohibit generic catch-all `else` clauses in UI event badge classifiers (`else return 'MAINTENANCE'`).
4. **Dual Auto + Manual Refresh Invariant in Operational Views & Live Maps:** Monitoring dashboards, NOC wallboards, and live maps MUST provide both periodic/reactive refresh (`setInterval` with `clearInterval` in `onUnmounted` + WebSocket) AND an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`).
5. **Heavy-Transfer Timeout Separation (`>= 180s` + Zero-Byte Purge) & Batch `HTTP 200 OK` Per-Item Validation:** Pass explicit per-request timeout overrides (`timeout >= 180s`) and purge `0-byte` truncated artifacts on synchronous binary/firmware downloads (asserting `call_args` in unit tests). In bulk/batch endpoints (`POST .../execute`, `POST .../batch`), inspect per-item `res.data.results[].status` across *Full Success*, *Partial Failure*, and *Total Item Failure* instead of assuming global success from `HTTP 200 OK`.

---

### 2.2. 🧠 High-IQ Token Economy & Context Engineering Protocol (6 Agent Strategies)

Up to 90% of token consumption in agentic coding comes from **re-sent conversation history and bloated tool/file reads** across sequential turns ($O(N^2)$ cumulative read cost) rather than code generation. Keeping the context window lean **increases model intelligence** by preventing attention dilution (*Lost-in-the-Middle*). Every agent MUST apply these 6 strategies:

1. **`AST/Grep-First, Windowed-Read-Second` (No Blind Full-File Reads):**
   - **NEVER** read an entire file `> 150` lines from start to finish just to locate a function or constant.
   - First, pinpoint the exact symbol and line numbers using `inspect_blast_radius.py` / `inspect_ast_blast_radius` or `grep -n` / `ripgrep`.
   - Second, invoke `read_file` with a tight line range (`StartLine` / `EndLine`, 40–80 lines around the target).

2. **`Zero Redundant Re-Read Invariant` (Working Memory Discipline):**
   - **NEVER** call `read_file` again on a file that was already read or edited in the recent turns of the current session, unless an external script or container modified it on disk.

3. **`Parallel Tool Call Batching` (Turn-Count Minimization):**
   - Every sequential tool-call turn re-bills the entire accumulated prompt history.
   - Whenever multiple file reads, searches, or independent checks are needed, **batch them into a single parallel tool-call turn** instead of executing them one by one across 4–6 sequential turns (saving up to 75% of cumulative input tokens).

4. **`Subagent Context Isolation & Model Cascading` (Clean Main Context):**
   - When a task requires exploring `> 4` files, tracing complex cross-repo call chains, or diagnosing noisy test failures, **do not pollute the main agent's context window**.
   - Delegate the exploration to a read-only `research` subagent (or `flash` model tier) with explicit instructions to return **ONLY a compact synthesis (`<= 20 lines`) containing exact `file:line` pointers and root-cause findings**. The exploratory noise dies with the subagent while the main agent retains 100% razor-sharp reasoning capacity.

5. **`Pass-Quiet & RTK Terminal Output Filtering` (Zero Raw Log Flooding):**
   - Never dump unfiltered multi-hundred-line terminal outputs (`git diff`, `git log`, raw test stdout, full JSON manifests) into the context window.
   - Always use compact flags: `git status -s`, `git diff --stat`, `head -n 30`, `tail -n 20`, `pytest -q --tb=short --no-header`, and rely on the token-saving parsers of `run_ephemeral_qa` and Pass-Quiet 1-line scripts (`./scripts/actualizar-grafos-graphify.sh`).
   - Do not chain redundant MCP tools: `audit_test_pyramid_gaps` already runs `inspect_project_config` internally, and `certify_11x_gate` already runs `audit_security_stig_owasp`.

6. **`Surgical Diff Edits & Compact Scratchpad Budget` (`ACTIVE_TASK.md <= 40 lines`):**
   - Always use surgical `edit_file` replacements for existing files; **never** use `write_file` (`Overwrite: true`) to rewrite large existing source files (output tokens cost 3x–5x more and double context bloat).
   - Keep `.agents/ACTIVE_TASK.md` strictly under **`<= 40 lines`** (only current checklist state, zero historical changelog prose).
   - Upon marking a milestone `COMPLETED (100%)`, proactively recommend the `/compact` command (or starting a fresh session) to the user before beginning an unrelated milestone.

---

## 3. Operational Playbooks

### Playbook 1: Project Bootstrap & Surgical Merge
```text
Step 0: Plan & Active Task ──> Formulate plan via /plan; bootstrap .agents/ACTIVE_TASK.md (<= 40 lines).
Step 1: Inspect Project ──────> Run inspect_project_config(project_path) (includes browser_testing_readiness).
Step 2: Hydrate & Merge ──────> Run bootstrap_or_merge_11x(project_path, stack) (uses local SHA-256 cache without dumping file contents into context).
Step 3: Install Governance ───> Install .agents/rules/, .agents/scripts/, and AGENTS.md connector (init_or_append_agents_md).
Step 4: First Run ────────────> Execute `make qa-lint` and `make qa-unit` via run_ephemeral_qa in Docker.
```

### Playbook 2: Test Creation & Coverage Rescue (`< 95%`)
```text
Step 0: Triage Scope ─────────> Select MICRO_CHANGE (<=3 files, LOW blast radius) or FULL_11X (>3 files).
Step 1: Identify Gaps ────────> Run `make qa-unit` (via run_ephemeral_qa) to obtain uncovered lines report.
Step 2: Windowed Read & Edit ─> Read target uncovered line ranges (StartLine/EndLine) and author `.unit.*` tests.
Step 3: Database Parity ──────> Ensure ORM models match migrations; run `verify_alembic_orm_parity.py`.
Step 4: BDD & E2E Scenarios ──> Update api_test.feature or ui_business_flow.feature; run Playwright + @axe-core.
Step 5: Verify Threshold ─────> Confirm coverage >= 95.0%, 0 warnings, and 100% assertions pass.
```

### Playbook 3: DISA STIG V6R5 & OWASP v4.2 Hardening
```text
Step 0: Plan Hardening ───────> Map missing patterns in .agents/ACTIVE_TASK.md.
Step 1: Scan Posture ─────────> Run audit_security_stig_owasp(project_path) and consult references/02-security-disa-owasp-22.md.
Step 2: Inject Controls ──────> Add NFKC normalizers, OWASPSecureHeadersMiddleware, Argon2id dummy hash, etc.
Step 3: Negative Assertions ──> Write unit/BDD tests specifically verifying rejection of malicious payloads.
Step 4: Audit Verification ───> Run `./scripts/verificar-secretos.sh` and `./scripts/auditar-infra.sh`.
```

### Playbook 4: 11X Certification & Task Closure Gate (3-Path Aware)
```text
Step 1: Execute QA Suite ─────> Skip on DOCS_ONLY; run affected stack QA on MICRO_CHANGE; run `make qa-all` on FULL_11X.
Step 2: Update AST Graph ─────> Skip on DOCS_ONLY; run `./scripts/actualizar-grafos-graphify.sh` on code changes.
Step 3: Audit Integrity ──────> Run `python3 scripts/generar-manifiesto.py --check` and `verify_roadmap_consistency.py`.
Step 4: Run Certifier ────────> Run `./.agents/scripts/certify_task_completion.sh` / `certify_11x_gate` (10/10 gates).
Step 5: Update Documentation ─> Sync affected docs/specs/, TESTING.md, CHANGELOG.md, and ROADMAP.md.
Step 6: Mark Active Task ─────> Mark .agents/ACTIVE_TASK.md as COMPLETED (100%) and suggest `/compact` if context is long.
Step 7: QA-Escape Post-Mortem ─> If fixing a bug that bypassed tests, present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" and invoke `propose_skill_evolution_pr`.
Step 8: Commit & Push to Git ─> Conventional commit in Spanish (`git commit`) and push (`git push`).
```

### Playbook 5: Workspace Sanitization & Docker Root File Eviction (`make clean` / `scripts/limpieza.sh`)
```text
Step 1: Container Teardown ───> Stop testing containers and networks (docker compose down -v --remove-orphans).
Step 2: Local Artifact Purge ─> Remove standard test caches, reports, coverage, logs, and mutmut files.
Step 3: Graphify AST Preserve ─> Purge graphify-out/cache while preserving GRAPH_REPORT.md, graph.html, graph.json.
Step 4: Alpine Root Eviction ─> If UID 0 (root) files exist from Docker, invoke ephemeral Alpine container to rm -rf without sudo.
Step 5: Permission Re-owning ─> Alpine container chown -R $(id -u):$(id -g) to eliminate padlocks in desktop GUI.
Step 6: Optional Docker Prune ─> Execute docker system prune -af --volumes only when --deep or --docker-prune is requested.
```

### Playbook 6: Existing Project Test Gap Audit & 13-Layer Rescue
```text
Step 0: Plan Rescue ──────────> Register gap audit objectives in .agents/ACTIVE_TASK.md.
Step 1: Audit 13 Layers ──────> Run audit_test_pyramid_gaps(project_path) (includes config inspection, missing layers, top orphan files, untested APIs/views).
Step 2: User Diagnosis ───────> Present 11X pyramid score (XX%) and layer matrix in Spanish.
Step 3: Hydrate Blueprints ───> Use bootstrap_or_merge_11x to inject missing .example templates non-destructively.
Step 4: Prioritized Creation ─> Generate tests following prioritized_action_plan (CRITICAL -> HIGH -> MEDIUM) in Docker.
Step 5: Gate & Closure ───────> Run certify_11x_gate, sync docs, mark ACTIVE_TASK.md COMPLETED (100%), and commit.
```

### Playbook 7: Continuous Skill Evolution & Upstream PR Proposal (`propose_skill_evolution_pr`)
```text
Step 0: Discover Edge Case ───> Identify improvement, unhandled edge-case, or new rule during project dogfooding.
Step 1: Draft Proposal Block ─> Prepare empirical rationale, target file in qa-testing-blueprints, and markdown snippet.
Step 2: Propose Evolution ────> Call propose_skill_evolution_pr (or pass prefer_offline_fallback: true if offline).
Step 3: Branch & Review ──────> Inspect .agents/proposals/<slug>.md and created PR (or click prefilled_github_url).
Step 4: Transparent Audit ────> Zero secrets or hardcoded tokens transmitted; user reviews and merges upstream.
```

---

## 4. Progressive Disclosure Reference Index

Load additional modules **strictly on-demand** (one at a time, only when touching that stack/domain):
* [`references/01-core-13-layers.md`](references/01-core-13-layers.md): The 13 QA layers, Anti-Mock Blindness, Anti-JSDOM, and Trimodal Fixtures.
* [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md): The 22 DISA ASD STIG V6R5 + OWASP v4.2 security patterns and reference snippets.
* [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md): Python Standalone and FastAPI (PostgreSQL 17, KeyDB, Alembic, Karate API).
* [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md): Node.js, Vue 3, React, Refactoring UI, Vitest, Playwright, and Karate UI.
* [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md): Bash, POSIX Shell, ShellCheck, shfmt, BATS-core, bats-mock, and kcov.
* [`references/06-stack-php.md`](references/06-stack-php.md): PHP 8.2–8.5 (`sinfallas/basephpcomposer`), Pest/PHPUnit + PCOV (`>= 95%`), PHPStan Level Max, Psalm Taint, Infection (`MSI >= 80%`), Doctrine/Laravel migrations, and DISA/OWASP hardening.
* [`references/07-mcp-agentic-security-governance.md`](references/07-mcp-agentic-security-governance.md): Service-Layer RBAC (Anti-`Depends()` Bypass), MCP `ApprovalRequest` (`AWAITING_APPROVAL`) gates, Indirect Prompt Injection / Tool Poisoning defense, and Non-Human Identity (NHI) multi-tenant isolation.
* [`references/08-postgres-rls-zero-downtime-migrations.md`](references/08-postgres-rls-zero-downtime-migrations.md): PostgreSQL 17 `FORCE ROW LEVEL SECURITY`, Expand-Contract zero-downtime migrations (`CONCURRENTLY`, `lock_timeout`, `NOT VALID`), SQLAlchemy 2.0 `MissingGreenlet` prevention, and `MockDbSession` `JSONB`/`Decimal` parity.
* [`references/09-sre-observability-chaos-triage.md`](references/09-sre-observability-chaos-triage.md): Prometheus/OpenTelemetry RED metrics, `trace_id` audit correlation, Pumba chaos profiles (`netem delay/loss`, `pause`), heavy-transfer (`>= 180s`) & batch per-item validation, and autonomous RCA playbooks.
