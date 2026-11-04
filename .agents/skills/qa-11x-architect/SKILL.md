---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.7+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), or update TESTING.md and CHANGELOG.md.
---

# Master QA 11X & DevSecOps Architect (`qa-11x-architect`)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

The **`qa-11x-architect`** skill provides the unified governance, architectural methodology, and tactical playbooks for enterprise-grade software quality. It enforces the 13 layers of the 11X Quality Pyramid, non-destructive surgical merging of configuration templates, Anti-Mock Blindness, Anti-JSDOM visual geometry, and the 22 security-by-design patterns mandated by DISA ASD STIG V6R5 and OWASP Developer Guide v4.2.

---

## 1. Environment Detection & Execution Protocol

The agent MUST adapt its execution strategy depending on whether the Model Context Protocol (MCP) server `@sinfallas/mcp-qa-11x` is present in the runtime environment.

```
                     ┌─────────────────────────────┐
                     │ MCP Server Available?       │
                     └──────────────┬──────────────┘
                                    │
                  YES ──────────────┴────────────── NO
                   │                                │
        [Case A: MCP-First]              [Case B: Standalone Fallback]
  1. inspect_project_config(...)    1. Read matching stack reference
  2. fetch_blueprint_bundle(...)    2. Hydrate from GitHub Raw via manifest.json
  3. audit_security_stig_owasp(...) 3. Verify SHA-256 with sha256sum
  4. run_ephemeral_qa(...)          4. Execute docker compose run inside containers
  5. certify_11x_gate(...)          5. Run certify_task_completion.sh
```

### Case A: MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x`) is Available
Execute with zero hallucination and maximum token economy:
1. **Detect Project Stack:** Call `inspect_project_config(project_path)` to discover active frameworks, lockfiles, existing test suites, and compliance gaps.
2. **Audit 13-Layer Test Pyramid Gaps:** Call `audit_test_pyramid_gaps(project_path, stack)` to obtain the 11X pyramid score, orphan source files without unit tests, untested APIs/views, and a prioritized rescue plan.
3. **Retrieve Fresh Blueprints:** Call `fetch_blueprint_bundle(stack, project_path)` to pull pristine `.example` templates and governance scripts verified cryptographically via SHA-256 from GitHub.
4. **Audit Security Posture:** Call `audit_security_stig_owasp(project_path)` to perform static checks for the 22 DISA STIG V6R5 and OWASP v4.2 security controls.
5. **Execute Tests in Docker:** Call `run_ephemeral_qa(project_path, stage)` to trigger test targets (`lint`, `unit`, `parity`, `bdd`, `mutation`, `all`) inside isolated `sinfallas/*` containers and receive token-efficient JSON summaries.
6. **Sanitize Workspace:** Call `clean_workspace_11x(project_path, dry_run, deep_prune)` or read `blueprint://core/cleanup-script` to eradicate test artifacts, coverage caches, and Docker-generated root-owned files without requiring `sudo`.
7. **Certify Quality Gate:** Call `certify_11x_gate(project_path)` to evaluate the 9 closure gates before concluding any task.
8. **Inject or Append AGENTS.md Connector & Scripts:** Call `init_or_append_agents_md(project_path, dry_run)` or execute `npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts` (or `npx -y @sinfallas/mcp-qa-11x@latest init-agents`) to install the 5 skills, operational scripts (`.agents/scripts/*`), and create or non-destructively append the canonical QA 11X MCP & Skill connector block to `AGENTS.md` preserving 100% of existing user instructions.
9. **Propose Continuous Skill Evolution:** Call `propose_skill_evolution_pr(project_path, target_blueprint_file, improvement_title, empirical_rationale, proposed_content_or_snippet, prefer_offline_fallback)` to contribute real-world improvements, edge-case fixes, and template optimizations back to `tecno-consultores/qa-testing-blueprints` via local `gh` CLI or zero-credential proposal file + prefilled GitHub URL.

### Case B: Standalone Skill / Fallback Mode (No MCP Server)
When operating in pure CLI, Cloud, or desktop assistants without MCP tools:
1. **Load Progressive References:** Read ONLY the specific reference file needed for the task:
   - Shared Architecture: [`references/01-core-13-layers.md`](references/01-core-13-layers.md)
   - Security Audit: [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md)
   - Python / FastAPI: [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md)
   - Node / Vue / React: [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md)
   - Bash / DevOps: [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md)
   - PHP 8.1–8.5 (`sinfallas/basephpcomposer`): [`references/06-stack-php.md`](references/06-stack-php.md)
2. **Hydrate On-Demand from GitHub Raw (Zero-Clone):** When templates or scripts are required and the repository is not cloned locally, fetch them directly without cloning:
   ```bash
   RAW_BASE="https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main"
   curl -fsSL "${RAW_BASE}/manifest.json" -o /tmp/qa11x_manifest.json
   ```
   Parse `.stacks["<stack>"].files` and `.common_files`, download each item from `${RAW_BASE}/${path}`, and verify each `sha256` hash with `sha256sum -c` before writing to disk.

---

## 2. The 10 Non-Negotiable Laws of Standard 11X

1. **Law 1: Rule Zero — Ephemeral Docker Isolation**  
   NEVER run `pip`, `uv`, `pytest`, `npm`, `pnpm`, `vitest`, `playwright`, `shellcheck`, or linters directly on the host OS. All commands MUST execute inside ephemeral containers using `sinfallas/*` base images with named cache volumes (`uv-cache`, `pnpm-store`).

2. **Law 2: Strict Coverage, Complexity Thresholds & Zero Warnings**  
   Unit test coverage MUST achieve $\ge 95.0\%$ across lines, branches, and statements (including `catch`/`except` recovery paths). Cyclomatic Complexity must remain Grade A (`CC <= 5` via Radon / SonarJS). 0 SAST/DAST High/Critical vulnerabilities. 0 surviving critical mutants. Static analysis and linters (ESLint, SonarJS, Ruff, ShellCheck) MUST enforce zero warnings (`--max-warnings 0` on ESLint); any warning is treated as a fatal build-breaking error.

3. **Law 3: Network Isolation vs. Anti-Mock & Anti-Silo Blindness**  
   Unit tests MUST block all external network access (`pytest-mock`, `nock`, `msw`, `bats-mock`, `globalThis.fetch` interception) to guarantee 100% offline determinism and prevent test flakiness. Conversely, database persistence, ORM schema synchronization, migrations, and **cross-module state propagation** MUST NEVER be mocked: test against real ephemeral `postgres:17-alpine`, verify schema parity via `verify_alembic_orm_parity.py`, and assert that mutations in Producer Module A immediately reflect in Consumer Module B `GET` queries without intermediate mocks.

4. **Law 4: Visual Geometry, Anti-JSDOM Layout & Dual Refresh Ergonomics**  
   JSDOM returns `0x0` for all bounding boxes and cannot detect overlaps. Fixed floating footers (`position: fixed`) that steal viewport space or obstruct interactive elements are strictly prohibited. Footers must be in-flow (`margin-top: auto` inside `<main>`). Layouts must be verified in real headless Chromium with Karate UI / Playwright + `@axe-core` (0 WCAG 2.1 AA violations). Real-time dashboards, NOC wallboards, and live maps MUST enforce the **Dual Auto + Manual Refresh Invariant** (`setInterval` with `onUnmounted` cleanup + WebSocket listener + explicit **`[ 🔄 Refrescar ]`** button passing `?refresh=true`).

5. **Law 5: Non-Destructive Surgical Merging, Linter Hardening & `.agents/` Governance Isolation**  
   When importing `.example` configuration files (`pyproject.toml.example`, `package.json.example`, `Makefile.example`), surgically merge test frameworks, linters, and QA targets, enforcing `--max-warnings 0` on lint scripts. NEVER delete pre-existing production dependencies, custom scripts, or business configuration. In consumer projects (e.g. `rosgrid`), keep the 7 canonical `.agents/rules/*.md` files strictly synchronized with upstream `qa-testing-blueprints` and isolate project-specific domain directives in `.agents/rules/domain_<project>_*.md` or outside the `AGENTS.md` connector block to prevent rule collisions and prompt bloat.

6. **Law 6: Mandatory Karate Labs BDD, Zero Orphan UI Components & Zero Orphan API Endpoints**  
   Every API endpoint requires Karate Labs HTTP BDD scenarios (`api_test.feature`). Every UI workflow requires Karate Labs UI scenarios (`ui_business_flow.feature`). Every `.vue` or `.tsx` component must possess an active unit test (`verify_zero_orphan_vue_components.py`). Every frontend HTTP request must correspond to an active backend route (`verify_no_orphan_api_endpoints.py`).

7. **Law 7: DISA ASD STIG V6R5, OWASP v4.2 Security-by-Design & Semantic Audit Integrity**  
   Implement the 22 canonical controls: PostgreSQL `FORCE ROW LEVEL SECURITY`, SSRF validation with pre-DNS check, FIPS 140-3 AES-256-GCM + memory zeroization, `Idempotency-Key` tracking, `extra="forbid"`, CSWSH origin check `4403`, role timeouts (10m/15m), 3-attempt/15m account lockout with constant-time Argon2id dummy hash, Unicode `NFKC` normalization, anti-XXE, magic-byte file validation, tamper-evident HMAC logs with 75% capacity alerts, OWASP OSHP headers, Fail-Secure startup, and CycloneDX SBOM. Audit functions (`write_audit_log`) MUST NEVER be replaced by blind `AsyncMock` instances without payload assertions, and visible identity fields (`actor_username`, `resource_display_name`) MUST resolve to human-readable strings—never raw UUID v4 values (`claims.get("sub")`).

8. **Law 8: Universal RED Observability Pre-Chaos**  
   Application microservices must expose Prometheus metrics (`/metrics`) or send to `Pushgateway` (Rate, Errors, Duration) before running Pumba chaos profiles (network delay, jitter, packet loss) combined with Locust or Artillery load generation.

9. **Law 9: Trimodal Ground-Truth Fixtures, 3-Phase Temporal Lifecycle & Anti-Regression**  
   Validate external integrations and state stores against three raw fixtures: (1) Virgin / Factory Default (assert negative invariants), (2) Nominal Configured (assert active healthy state), and (3) Degraded / Unsupported (assert graceful fallback without HTTP 500). Furthermore, any entity governed by time windows, countdowns, or TTL (`starts_at` / `ends_at`, 60s Safe Mode rollback, 30s Step-Up tokens, leases) MUST be tested across all **3 Temporal Lifecycle Phases**: Phase 1 Pending (`t < starts_at`, `Programada`), Phase 2 Active/In-Progress (`starts_at <= t <= ends_at`, `En Curso` / `Activa`), and Phase 3 Expired/Reverted (`t > ends_at` or Cancelled). Inspect AST blast radius with `inspect_blast_radius.py` before modifying shared files.

10. **Law 10: Active Task Invariant (`.agents/ACTIVE_TASK.md`), Planning Tool, Closure Gate & Proactive Upstream Evolution**  
    Prior to code mutation on non-trivial tasks, AI agents MUST invoke the native planning tool/workflow (e.g. `/plan` slash command or interactive plan artifacts with `RequestFeedback: true`) and immediately persist the agreed phase breakdown in `.agents/ACTIVE_TASK.md` (bootstrapped from `.agents/ACTIVE_TASK.md.example`). As work proceeds, the agent MUST update `.agents/ACTIVE_TASK.md` in real-time (`- [ ]` → `- [x]`) to guarantee zero context loss across IDE crashes, session restarts, or context compaction. Every modification requires updating `TESTING.md` (metrics and test tallies), `CHANGELOG.md` (`## [Unreleased]`), `ROADMAP.md` (verifying summary table and section parity via `verify_roadmap_consistency.py`), and relevant `docs/`. Mark `.agents/ACTIVE_TASK.md` as `COMPLETED (100%)` and execute `./.agents/scripts/certify_task_completion.sh` before finishing. Whenever a task fixes a UAT/production bug that bypassed existing tests, the agent MUST proactively recommend evolving `qa-testing-blueprints` in its final response (`💡 Oportunidad de Mejora Detectada para el Estándar QA 11X`) and execute `propose_skill_evolution_pr` WITHOUT waiting for user prompting.

---

### 2.1. 🛡️ Mandatory Anti-Silo & Cross-Module State Propagation Invariant (4 UAT Anti-Blindness Rules)

Code coverage ($\ge 95\%$) measures executed lines of existing code, but is blind to cross-module disconnections when tests abuse boundary mocks (*Silo Mock Blindness*) or rely on tautological 2-state assertions. Every test suite under Standard 11X MUST strictly enforce these 4 design rules:

1. **Cross-Module State Propagation Without Intermediate Mocks (*Propagación Transversal de Estado sin Mocks Intermedios*):**
   - It is strictly prohibited to consider a mutation test valid by asserting only `HTTP 200/201` on the mutating endpoint while testing consumer modules with disconnected static JSON fixtures.
   - Whenever an operation in **Module A** alters the operational state of an entity (e.g. scheduling/cancelling maintenance windows via `POST /api/v1/maintenance/windows`, triggering a 60s Safe Mode confirmation window, pairing resources, or mutating administrative states/identities), the test suite MUST immediately invoke the query endpoints (`GET`, e.g. `GET /api/v1/inventory/routers`) and stores of **Consumer Modules B** **without intermediate mocks**, certifying that effective states, KPI counters, status badges, and live maps reflect the mutation end-to-end.

2. **Mandatory 3-Phase Temporal Lifecycle Assertion (*Aserción Obligatoria de las 3 Fases Temporales — Anti 2-State Static Blindness*):**
   - Every entity or workflow governed by time windows, timers, or TTLs (`starts_at` / `ends_at`, 60s Safe Mode confirmation/rollback windows, 30s Step-Up token expiration, temporary leases) MUST be tested across all **3 phases of the clock** (prohibiting binary ternaries like `is_cancelled ? 'Cancelada' : 'Programada'` that omit the active state):
     - **Phase 1 (`t < starts_at`):** Scheduled / Pending state (`Programada`).
     - **Phase 2 (`starts_at <= t <= ends_at`):** Active / In-Progress state (`En Curso` / `Activa`, verifying that the scheduled resource or background scheduler stays alive beyond the HTTP request cycle instead of being prematurely cleared at 50ms, and projects the active state to all consumer modules).
     - **Phase 3 (`t > ends_at` or Cancelled):** Expired / Purged / Reverted state (verifying automatic restoration to the original nominal state and audit trail recording).

3. **Prohibition of Blind Audit Mocks & Anti-Raw UUID Semantic Assertion (*Prohibición de Mocks Ciegos en Auditoría y Aserción Semántica Anti-UUID Crudo*):**
   - Replacing audit functions (`write_audit_log` or equivalents) with an empty `AsyncMock` without asserting the received arguments (`assert_called_once` / `call_args`) is strictly prohibited.
   - Every backend audit test and UI event feed/ribbon test MUST explicitly certify:
     - That human-visible identity fields (`actor_username`, `resource_display_name`, `router_display_name`) resolve to human-readable names and **NEVER** match the pattern of a raw UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, preventing bugs where `actor_username=claims.get("sub")` leaks raw JWT subject UUIDs to the UI).
     - That UI event classifiers map each category to its true semantic badge (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`), strictly prohibiting generic catch-all `else` clauses that assign a domain-specific label (such as `else return 'MAINTENANCE'` / `'MANTENIMIENTO'`) to unrelated events like configuration backups or session renewals.

4. **Dual Auto + Manual Refresh Invariant in Operational Views & Live Maps (*Invariante de Refresco Dual en Vistas Operativas y Mapas en Vivo*):**
   - Every monitoring view, operational dashboard, NOC wallboard, or real-time cartographic map MUST simultaneously provide:
     - A reactive/periodic update mechanism (`setInterval` with guaranteed `clearInterval` cleanup inside `onUnmounted` / `useEffect` + WebSocket listener), AND
     - An explicit **`[ 🔄 Refrescar ]`** button accessible to the operator that forces an immediate live reload (`?refresh=true`) without requiring a full browser reload (`F5`).

---

## 3. Operational Playbooks

### Playbook 1: Project Bootstrap & Surgical Merge
```text
Step 0: Plan & Active Task ──> Formulate execution plan via /plan; bootstrap .agents/ACTIVE_TASK.md.
Step 1: Inspect Project ──────> Identify language, framework, package manager, and browser_testing_readiness in frontend stacks (vue3/react-frontend).
Step 2: Hydrate Blueprint ────> Download stack bundle + common_files via manifest.json.
Step 3: Surgical Merge ───────> Merge Makefile, pyproject.toml / package.json, .gitignore.
Step 4: Copy QA Assets ───────> docker-compose.qa.yml, .trivy.yaml, commitlint.config.js, lefthook.yml.
Step 5: Install Governance ───> .agents/rules/, .agents/scripts/, scripts/verificar-secretos.sh, and AGENTS.md connector (init_or_append_agents_md / init-agents).
Step 6: First Run ────────────> Execute `make qa-lint` and `make qa-unit` in Docker.
```

### Playbook 2: Test Creation & Coverage Rescue (`< 95%`)
```text
Step 0: Update Active Task ──> Register failing lines and target test suites in .agents/ACTIVE_TASK.md.
Step 1: Identify Gaps ────────> Run `make qa-unit` to obtain missing line/branch report.
Step 2: Unit Testing ─────────> Author isolated `.unit.py` / `.unit.ts` tests covering edge branches and errors.
Step 3: Database Parity ──────> Ensure ORM models match migrations; run `verify_alembic_orm_parity.py`.
Step 4: BDD & E2E Scenarios ──> Write declarative Gherkin in api_test.feature or ui_business_flow.feature, verify browser_testing_readiness, and run e2e/accessibility.e2e.ts with Playwright + @axe-core.
Step 5: Verify Threshold ─────> Confirm coverage >= 95.0% and 100% assertions pass.
```

### Playbook 3: DISA STIG V6R5 & OWASP v4.2 Hardening
```text
Step 0: Plan Hardening ───────> Map missing patterns in .agents/ACTIVE_TASK.md.
Step 1: Scan Posture ─────────> Cross-reference against references/02-security-disa-owasp-22.md.
Step 2: Inject Controls ──────> Add NFKC normalizers, OWASPSecureHeadersMiddleware, Argon2id dummy hash, etc.
Step 3: Negative Assertions ──> Write unit/BDD tests specifically verifying rejection of malicious payloads.
Step 4: Audit Verification ───> Run `./scripts/verificar-secretos.sh` and `./scripts/auditar-infra.sh`.
```

### Playbook 4: 11X Certification & Task Closure Gate
```text
Step 1: Execute Full QA ──────> Run `make qa-all` inside Docker containers.
Step 2: Audit Integrity ──────> Run `python3 scripts/generar-manifiesto.py --check`.
Step 3: Audit Roadmap Sync ───> Run `python3 .agents/scripts/verify_roadmap_consistency.py`.
Step 4: Run Certifier ────────> Run `./.agents/scripts/certify_task_completion.sh` (10/10 gates).
Step 5: Update Documentation ─> Synchronize TESTING.md, CHANGELOG.md, ROADMAP.md, and docs/.
Step 6: Mark Active Task ─────> Mark .agents/ACTIVE_TASK.md as COMPLETED (100%).
Step 7: QA-Escape Post-Mortem ─> If the task fixed a UAT/prod bug that bypassed existing >=95% tests, PROACTIVELY notify the user ("💡 Oportunidad de Mejora Detectada para el Estándar QA 11X") and invoke `propose_skill_evolution_pr` without waiting to be asked.
Step 8: Commit & Publish ─────> Conventional commit in Spanish and push.
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
Step 1: Inspect Config ───────> Run inspect_project_config(project_path) to verify Docker and Makefile baseline.
Step 2: Audit 13 Layers ──────> Run audit_test_pyramid_gaps(project_path) to detect missing layers, orphan source files, untested APIs, and untested UI views.
Step 3: User Diagnosis ───────> Present 11X pyramid score (XX%) and detailed layer matrix in Spanish.
Step 4: Hydrate Blueprints ───> Use fetch_blueprint_bundle and bootstrap_or_merge_11x to inject missing .example templates non-destructively.
Step 5: Prioritized Creation ─> Generate tests following prioritized_action_plan (CRITICAL -> HIGH -> MEDIUM), executing make targets in Docker (Rule Zero).
Step 6: Gate & Closure ───────> Run certify_11x_gate, sync docs, mark ACTIVE_TASK.md COMPLETED (100%), and commit.
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

Load additional modules only as needed:
* [`references/01-core-13-layers.md`](references/01-core-13-layers.md): The 13 QA layers, Anti-Mock Blindness, Anti-JSDOM, and Trimodal Fixtures.
* [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md): The 22 DISA ASD STIG V6R5 + OWASP v4.2 security patterns and reference snippets.
* [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md): Python Standalone and FastAPI (PostgreSQL 17, KeyDB, Alembic, Karate API).
* [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md): Node.js, Vue 3, React, Refactoring UI, Vitest, Playwright, and Karate UI.
* [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md): Bash, POSIX Shell, ShellCheck, shfmt, BATS-core, bats-mock, and kcov.
* [`references/06-stack-php.md`](references/06-stack-php.md): PHP 8.1–8.5 (`sinfallas/basephpcomposer`), Pest/PHPUnit + PCOV (`>= 95%`), PHPStan Level Max, Psalm Taint, Infection (`MSI >= 80%`), Doctrine/Laravel migrations, and DISA/OWASP hardening.
