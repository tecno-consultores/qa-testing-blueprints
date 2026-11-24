# AgenticSkills.io Submission Package — QA Testing Blueprints (`QA-11X v3.6`, `v3.6.0`)

Structured submission bundle ready for `https://agenticskills.io/submit` and `https://agenticskills.io/submit?type=mcp`. Every skill path, MCP tool name, `blueprint://*` URI, and blueprint directory matches the verified repository state.

---

## Section 1 — MCP Server Submission (`@sinfallas/mcp-qa-11x` v3.6.0)

* **Package Name:** `@sinfallas/mcp-qa-11x` (`v3.6.0`, `QA-11X v3.6` architecture)
* **License:** `MIT` (Zero-Infra enterprise adoption without copyleft or AGPL-3.0 licensing constraints)
* **Repository:** `https://github.com/tecno-consultores/qa-testing-blueprints`
* **NPX Launch Command:** `npx -y @sinfallas/mcp-qa-11x@latest`
* **30-Second Quickstart CLI:** `npx -y @sinfallas/mcp-qa-11x@latest quickstart`
* **12 CLI Subcommands (`npx -y @sinfallas/mcp-qa-11x <cmd>`):** `quickstart`, `init-agents`, `install-skill`, `reconcile-agents`, `tms-sync`, `doctor` (`status`), `upgrade` (`cache-clean`), `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`.
* **Supported Agent IDs (`28`):** `antigravity`, `claude-code`, `claude-desktop`, `cursor`, `windsurf`, `copilot`, `codex`, `gemini-cli`, `gemini-code-assist`, `cline`, `roo-code`, `aider`, `continue`, `zed`, `devin`, `cody`, `amazon-q`, `jetbrains-ai`, `augment`, `trae`, `hermes`, `opencode`, `goose`, `kilo-code`, `bolt`, `lovable`, `v0`, `replit` (plus standard MCP `stdio` clients).
* **Runtime Guards:** Fail-closed `promptGuard` (`NFKC`, Trojan Source & prompt-injection blocking, `QA-GIT-GATE-01` bypass prevention, PII redaction), `TaskStateGuard` bounded concurrency, and programmatic A2A `v1.0` Agent Card subpath export (`@sinfallas/mcp-qa-11x/agent-card`).

### 1.1. 19 MCP Tools (`tools/list`)

| # | Tool Name | Purpose |
| :--- | :--- | :--- |
| 1 | `inspect_project_config` | Detects stacks, linter flags, missing 11X files, and update status |
| 2 | `fetch_blueprint_bundle` | Fetches stack blueprints verified against `manifest.json` SHA-256 |
| 3 | `bootstrap_or_merge_11x` | Surgically scaffolds or merges `.example` QA configs with `.11x-backup` |
| 4 | `inspect_ast_blast_radius` | Bidirectional Graphify AST lookup (`declaring_files`, callers, callees) |
| 5 | `clean_workspace_11x` | Purges transient test/Docker artifacts safely without host `sudo` |
| 6 | `audit_security_stig_owasp` | Static scan across 36 static scanner rules (`SEC-01..QA-STRYKER-CFG-01`, `SEC-WS-PUBSUB-01`, `UI-11X-01..03`) backing the 22 DISA ASD STIG V6R5 + OWASP v4.2 reference controls |
| 7 | `run_ephemeral_qa` | Runs QA stages inside non-root ephemeral Docker (`Rule Zero`) |
| 8 | `certify_11x_gate` | Runs the 10-stage 11X gate with `Fail-Verbose` Allure diagnostics |
| 9 | `audit_test_pyramid_gaps` | Audits project coverage across the 13 QA-11X pyramid layers |
| 10 | `init_or_append_agents_md` | Idempotently injects thin `AGENTS.md` / IDE connector blocks |
| 11 | `propose_skill_evolution_pr` | Creates Dual-Consumer QA-escape proposals honoring `QA-GIT-GATE-01` |
| 12 | `reconcile_agents_governance` | Deduplicates promoted global skills/rules and isolates domain rules |
| 13 | `validate_calm_architecture` | Validates FINOS CALM JSON topology, nodes, relationships, and controls |
| 14 | `evaluate_release_gate` | Computes quantitative `GO` / `NO_GO` / `SKIPPED` Release Readiness verdicts |
| 15 | `evaluate_agent_trajectory` | Evaluates multi-step agent trajectories offline or via Docker DeepEval |
| 16 | `run_llm_red_team` | Audits OWASP LLM Top 10 Promptfoo suites and runs fail-closed red-teaming |
| 17 | `audit_vibe_prototype` | Audits AI-generated prototypes (`VIBE-SEC-001..QA-005`) and plans RLS rescue |
| 18 | `sync_enterprise_tms` | Normalizes JUnit XML / Allure / SARIF traces for Jira, Zephyr Scale, Xray & GitHub Issues |
| 19 | `session_flight_recorder` | Manages the atomic JSON Flight Recorder (`session_checkpoint.json` -> `ACTIVE_TASK.md`) |

### 1.2. 13 MCP Resources (`blueprint://*`)

| # | Resource URI | MIME Type | Purpose |
| :--- | :--- | :--- | :--- |
| 1 | `blueprint://manifest` | `application/json` | SHA-256 index (`manifest.json`) across all stacks |
| 2 | `blueprint://core/philosophy` | `text/markdown` | 13-layer pyramid philosophy, Rule Zero, 10 Laws, 11 UAT rules |
| 3 | `blueprint://security/disa-owasp-22` | `text/markdown` | 22 canonical DISA ASD STIG V6R5 & OWASP v4.2 reference controls (backed by 36 static scanner rules) |
| 4 | `blueprint://database/postgres-rls-worm` | `text/markdown` | PostgreSQL 17 multi-transaction RLS + WORM `seq_num` chain |
| 5 | `blueprint://{stack}/readme` | `text/markdown` | Operational QA guides across all 10 stack blueprints |
| 6 | `blueprint://ui/refactoring-ui/{topic}` | `text/markdown` | UI hierarchy, OKLCH WCAG 2.1 AA, and Anti-JSDOM geometry guides |
| 7 | `blueprint://core/active-task-template` | `text/markdown` | Compact `ACTIVE_TASK.md.example` diary (`<= 40` lines) |
| 8 | `blueprint://core/cleanup-script` | `text/x-shellscript` | Canonical rootless Docker `limpieza.sh` cleanup script |
| 9 | `blueprint://core/roadmap-validator` | `text/x-python` | Bidirectional roadmap/active-task consistency verifier |
| 10 | `blueprint://ai/evals-redteam` | `text/markdown` | Dual-mode DeepEval & Promptfoo OWASP LLM Top 10 blueprint |
| 11 | `blueprint://mobile-appium/readme` | `text/markdown` | Appium 3 + WebdriverIO Screenplay & biometric QA blueprint |
| 12 | `blueprint://vibe-rescue/readme` | `text/markdown` | 5-stage Vibe-to-Enterprise rescue & PostgreSQL 17 RLS templates |
| 13 | `blueprint://skills/tactical-patterns-11x` | `text/markdown` | JIT tactical design patterns (`CC <= 5`, `max-params: 4`, Port/Adapter, Outbox) |

---

## Section 2 — 11 Individual `SKILL.md` Listings

| # | Skill Name | Category | Upstream `SKILL.md` Path | Summary (`< 160` chars) |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `qa-11x-architect` | `architecture` | [`SKILL.md`](../.agents/skills/qa-11x-architect/SKILL.md) | Master 11X orchestrator (<= 12 KB): 3-path routing, 13-layer pyramid, Rule Zero, and DISA/OWASP governance. |
| 2 | `qa-11x-devsecops-hardener` | `security` | [`SKILL.md`](../.agents/skills/qa-11x-devsecops-hardener/SKILL.md) | Hardens PostgreSQL 17 RLS, AES-GCM vaults, WORM audit chains, and mutating MCP tools to STIG V6R5. |
| 3 | `qa-11x-systematic-debugging` | `testing` | [`SKILL.md`](../.agents/skills/qa-11x-systematic-debugging/SKILL.md) | 4-phase root-cause debugging using ephemeral Docker reproduction, AST blast radius, and RED-to-GREEN locks. |
| 4 | `qa-11x-screenplay-builder` | `e2e` | [`SKILL.md`](../.agents/skills/qa-11x-screenplay-builder/SKILL.md) | Builds multi-role Screenplay E2E suites with semantic ARIA locators, Anti-Silo checks, and 3-phase clocks. |
| 5 | `qa-11x-llm-evaluator` | `ai-evals` | [`SKILL.md`](../.agents/skills/qa-11x-llm-evaluator/SKILL.md) | Dual-mode AI evals: zero-cost offline contracts in CI plus DeepEval and Promptfoo OWASP LLM Top 10 audits. |
| 6 | `qa-11x-vibe-rescue` | `vibe-coding` | [`SKILL.md`](../.agents/skills/qa-11x-vibe-rescue/SKILL.md) | 5-stage hardening for AI-generated prototypes enforcing secret quarantine, PG 17 RLS, and >=95% coverage. |
| 7 | `qa-11x-docker-certifier` | `devops` | [`SKILL.md`](../.agents/skills/qa-11x-docker-certifier/SKILL.md) | Runs non-root Docker Rule Zero certification (>=95% coverage, CC<=5, mutation, WCAG 2.1 AA, Lighthouse). |
| 8 | `docker-trivy-keydb-hardening` | `security` | [`SKILL.md`](../.agents/skills/docker-trivy-keydb-hardening/SKILL.md) | Multi-stage non-root containers achieving Trivy HIGH/CRITICAL=0 and KeyDB multi-threaded caching. |
| 9 | `graphify-ast-navigator` | `architecture` | [`SKILL.md`](../.agents/skills/graphify-ast-navigator/SKILL.md) | AST Knowledge Graph navigation for Code Q&A, caller/callee blast-radius checks, and layer boundaries. |
| 10 | `refactoring-ui` | `ui` | [`SKILL.md`](../.agents/skills/refactoring-ui/SKILL.md) | Tactical spacing, type scale, OKLCH contrast (WCAG 2.1 AA), depth, and Anti-JSDOM layout rules. |
| 11 | `tactical-patterns-11x` | `architecture` | [`SKILL.md`](../.agents/skills/tactical-patterns-11x/SKILL.md) | JIT tactical patterns (<= 2.5 KB): complexity rescue (CC <= 5, max-params: 4), Port/Adapter, Outbox. |

### Individual Submission Cards

1. **`qa-11x-architect`** (`architecture`)
   - **Upstream Path:** [`.agents/skills/qa-11x-architect/SKILL.md`](../.agents/skills/qa-11x-architect/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-architect/SKILL.md`)
   - **Summary:** Master 11X orchestrator (<= 12 KB): 3-path routing, 13-layer pyramid, Rule Zero, and DISA/OWASP governance.
   - **Key Capabilities:** Proportional execution (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`), lazy hydration of 10 sub-skills, 11 Anti-Blindness UAT rules, and `QA-TEST-SYNC-01`.
2. **`qa-11x-devsecops-hardener`** (`security`)
   - **Upstream Path:** [`.agents/skills/qa-11x-devsecops-hardener/SKILL.md`](../.agents/skills/qa-11x-devsecops-hardener/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-devsecops-hardener/SKILL.md`)
   - **Summary:** Hardens PostgreSQL 17 RLS, AES-GCM vaults, WORM audit chains, and mutating MCP tools to STIG V6R5.
   - **Key Capabilities:** Multi-transaction `after_begin` RLS persistence, `seq_num` + `pg_advisory_xact_lock` WORM audit trails, service-layer RBAC, and STIG V6R5 / OWASP v4.2 controls.
3. **`qa-11x-systematic-debugging`** (`testing`)
   - **Upstream Path:** [`.agents/skills/qa-11x-systematic-debugging/SKILL.md`](../.agents/skills/qa-11x-systematic-debugging/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-systematic-debugging/SKILL.md`)
   - **Summary:** 4-phase root-cause debugging using ephemeral Docker reproduction, AST blast radius, and RED-to-GREEN locks.
   - **Key Capabilities:** Deterministic Rule Zero reproduction, Graphify AST caller/callee tracing, single-hypothesis isolation, and permanent regression tests.
4. **`qa-11x-screenplay-builder`** (`e2e`)
   - **Upstream Path:** [`.agents/skills/qa-11x-screenplay-builder/SKILL.md`](../.agents/skills/qa-11x-screenplay-builder/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-screenplay-builder/SKILL.md`)
   - **Summary:** Builds multi-role Screenplay E2E suites with semantic ARIA locators, Anti-Silo checks, and 3-phase clocks.
   - **Key Capabilities:** Multi-tenant RBAC Actors/Tasks/Questions across Vue 3, React, and Appium 3 mobile, self-healing ARIA locators, and 3-phase temporal assertions.
5. **`qa-11x-llm-evaluator`** (`ai-evals`)
   - **Upstream Path:** [`.agents/skills/qa-11x-llm-evaluator/SKILL.md`](../.agents/skills/qa-11x-llm-evaluator/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-llm-evaluator/SKILL.md`)
   - **Summary:** Dual-mode AI evals: zero-cost offline contracts in CI plus DeepEval and Promptfoo OWASP LLM Top 10 audits.
   - **Key Capabilities:** Hermetic RAG faithfulness, agent trajectory metrics, WebRTC voice TTFB (`<= 500ms`), PDF/OCR `Decimal` reconciliation, and trace-to-golden conversion.
6. **`qa-11x-vibe-rescue`** (`vibe-coding`)
   - **Upstream Path:** [`.agents/skills/qa-11x-vibe-rescue/SKILL.md`](../.agents/skills/qa-11x-vibe-rescue/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-vibe-rescue/SKILL.md`)
   - **Summary:** 5-stage hardening for AI-generated prototypes enforcing secret quarantine, PG 17 RLS, and >=95% coverage.
   - **Key Capabilities:** Audits Bolt.new, Lovable, v0, and Replit scaffolds (`VIBE-SEC-001..QA-005`), injects PostgreSQL 17 RLS/WORM templates, and preserves frontend UX.
7. **`qa-11x-docker-certifier`** (`devops`)
   - **Upstream Path:** [`.agents/skills/qa-11x-docker-certifier/SKILL.md`](../.agents/skills/qa-11x-docker-certifier/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/qa-11x-docker-certifier/SKILL.md`)
   - **Summary:** Runs non-root Docker Rule Zero certification (>=95% coverage, CC<=5, mutation, WCAG 2.1 AA, Lighthouse).
   - **Key Capabilities:** Enforces non-root `sinfallas/*` containers (`-u "$(id -u):$(id -g)" -e HOME=/tmp`), `CC <= 5`, Stryker/Mutmut/Infection mutation gates, and Pass-Quiet output.
8. **`docker-trivy-keydb-hardening`** (`security`)
   - **Upstream Path:** [`.agents/skills/docker-trivy-keydb-hardening/SKILL.md`](../.agents/skills/docker-trivy-keydb-hardening/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/docker-trivy-keydb-hardening/SKILL.md`)
   - **Summary:** Multi-stage non-root containers achieving Trivy HIGH/CRITICAL=0 and KeyDB multi-threaded caching.
   - **Key Capabilities:** Distroless/Alpine multi-stage hardening, non-root UID enforcement, KeyDB multi-threaded tuning, and Trivy IaC/FS zero-critical compliance.
9. **`graphify-ast-navigator`** (`architecture`)
   - **Upstream Path:** [`.agents/skills/graphify-ast-navigator/SKILL.md`](../.agents/skills/graphify-ast-navigator/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/graphify-ast-navigator/SKILL.md`)
   - **Summary:** AST Knowledge Graph navigation for Code Q&A, caller/callee blast-radius checks, and layer boundaries.
   - **Key Capabilities:** Incremental Tree-sitter AST graph refresh, bidirectional blast-radius queries before editing, and topological layer boundary verification.
10. **`refactoring-ui`** (`ui`)
    - **Upstream Path:** [`.agents/skills/refactoring-ui/SKILL.md`](../.agents/skills/refactoring-ui/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/refactoring-ui/SKILL.md`)
    - **Summary:** Tactical spacing, type scale, OKLCH contrast (WCAG 2.1 AA), depth, and Anti-JSDOM layout rules.
    - **Key Capabilities:** Modular design scales, `tabular-nums`, accessible OKLCH color systems, dark mode elevation, and in-flow `<main>` footer geometry.
11. **`tactical-patterns-11x`** (`architecture`)
    - **Upstream Path:** [`.agents/skills/tactical-patterns-11x/SKILL.md`](../.agents/skills/tactical-patterns-11x/SKILL.md) (`https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/.agents/skills/tactical-patterns-11x/SKILL.md`)
    - **Summary:** JIT tactical patterns (<= 2.5 KB): complexity rescue (CC <= 5, max-params: 4), Port/Adapter, Outbox.
    - **Key Capabilities:** Complexity gate rescue (`Radon CC <= 5`, `SonarJS <= 15`, `max-params: 4`, `max-depth: 3`), offline Port & Adapter boundaries (`--network none`), Transactional Outbox, and `[DIRECTIVE-11X]` JIT guidance.

---

## Section 3 — Workflow Bundle (`QA-11X Zero-Infra Agentic Quality Gate`)

Combines **Knowledge** (the 11 modular `SKILL.md` files under `< 20 KB`) with **Access** (all 19 tools — 12 v1 + 6 v2.0 + v3.1 `session_flight_recorder` — and 13 `blueprint://*` resources — including v3.1 `blueprint://skills/tactical-patterns-11x` — in `@sinfallas/mcp-qa-11x` v3.6.0) into a deterministic, auditable engineering workflow:

1. **Onboard (`30s`):** Run `npx -y @sinfallas/mcp-qa-11x@latest quickstart` to detect stack/vibe markers, generate `.qa-11x.json`, inject the `AGENTS.md` connector across 28 AI agents, and scaffold PR-aware CI.
2. **Route & Inspect (`Knowledge + AST`):** Load `qa-11x-architect` and `graphify-ast-navigator`, then call `inspect_project_config` and `inspect_ast_blast_radius` before modifying code.
3. **Execute Ephemeral QA (`Rule Zero`):** Hydrate stack blueprints via `blueprint://{stack}/readme`, run `run_ephemeral_qa` (`lint`, `unit`, `integration`, `ci`), `audit_security_stig_owasp`, and `validate_calm_architecture` inside non-root `sinfallas/*` containers protected by `promptGuard` and `TaskStateGuard`.
4. **Release Gate & Human Closure (`QA-GIT-GATE-01`):** Call `certify_11x_gate` (`10/10` gates) and `evaluate_release_gate` (`GO` / `NO_GO` / `SKIPPED`), optionally exporting JUnit/Allure/SARIF via `sync_enterprise_tms`. Stop at a certified local `git commit` until explicit human authorization for `git push` or package publication.
