# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Mandatory Directive: Anti-Regression & Side-Effects Guardrail

> **SUPREME GOVERNANCE INVARIANT:**
> No code change or refactoring may degrade, break, or disable an existing, previously validated feature. Whenever modifying shared modules, network configurations, or state stores, all agents and developers must proactively enforce the anti-regression safeguards defined herein.

---

## 1. Pre-Modification Impact & Blast-Radius Analysis

Before altering any shared code, service definition, or configuration:
1. **Shared Configuration & Port Invariants (`docker-compose*.yml`):**
   - **Never delete or overwrite canonical protocol ports** when adding or exposing alternative ports.
   - Verify that base HTTP/HTTPS/WSS and database bindings remain reachable.
2. **Graphify AST Blast-Radius Pre-Audit, Auto-Creation & Post-Change Update (CLI-First Ephemeral Docker Invariant):**
   - Prior to modifying or refactoring any shared function, model, utility, or state store, run the canonical blast radius inspector via ephemeral Docker (`Rule Zero`) or `inspect_ast_blast_radius` via MCP:
     ```bash
     docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app \
       sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<symbol_name>"
     ```
   - **Mandatory AST Graph Creation If Missing (Code Changes Only):** If `graphify-out/graph.json` does not exist in the repository or target stack, you **MUST create it first** before modifying code by running (`DOCS_ONLY` tasks touching ONLY human `*.md` / `docs/` files are exempt per `AGENTS.md` §5; governance `.agents/skills/**` and `.agents/rules/**` are NOT `DOCS_ONLY`):
     ```bash
     ./scripts/actualizar-grafos-graphify.sh
     ```
   - **Mandatory Post-Change AST Graph Update (Code Changes Only):** Upon completing code, test, or script modifications, you **MUST ALWAYS update the AST graph** by running `./scripts/actualizar-grafos-graphify.sh` (which incrementally updates only modified stacks in 1 Pass-Quiet line). **Skip AST graph inspection, creation, and rebuild on `DOCS_ONLY` tasks** (where only human `*.md` / `docs/` changed).
   - **CLI-First Execution Rule:** Shell-capable agents (Google Antigravity, local terminal agents) MUST execute the inspector and query tools via ephemeral Docker CLI (`sinfallas/base-python-uv:3.15`) or wrapper scripts. They MUST NOT spawn background Docker MCP containers or occupy port 8080, which are reserved exclusively for external non-shell clients (Claude Desktop, Hermes Agent).
   - For any symbol assessed as `MODERATE` or `HIGH/CRITICAL` risk, the agent's implementation plan must explicitly list all affected caller files and guarantee that their contracts and parameters remain intact.
3. **Test Suite & Contract Co-Evolution Audit (`QA-TEST-SYNC-01`):**
   - Alongside production callers, always inspect consumer test suites (`tests/**`, `mcp-server/tests/**`, `mcp-server/test/*.feature`, `tests/bats/**`) to synchronize counts, schemas, fixtures, and contract assertions impacted by legitimate code or catalog updates without weakening regression invariants.

---

## 2. Strict Pre-Build Static Analysis (Zero Missing Imports — Ephemeral Docker)

1. **Mandatory Immediate Linting (`Rule Zero`):**
   - Before executing builds, restarting containers, or concluding a turn, verify syntactic integrity inside ephemeral Docker containers (`make qa-lint` / `run_ephemeral_qa(stage="lint")`):
     - Backend: `make qa-lint` (`ruff check src/ tests/`, `ruff format --check src/ tests/`, `mypy --strict --cache-dir=/tmp/mypy src/`, `radon`, `bandit` / `phpstan`, `psalm`)
     - Frontend: `make qa-lint` (`eslint --max-warnings 0`, `vue-tsc --noEmit` or `tsc --noEmit`, `audit:deps`)
2. **Zero Runtime Exceptions:**
   - Missing imports or unhandled type mutations must be detected during static check, never discovered through runtime container failure or blank screens.

---

## 3. Frontend Anti-Degradation (No Destructive Catch)

1. **Preserve Valid Known State on Network Error:**
   - Stores must never reset populated arrays or objects to empty primitives (e.g. `setItems([])`) inside generic `catch` blocks if valid data already exists in memory.
   - Maintain the last known good state and set an explicit error/stale status flag to inform the user without destroying rendered views.
2. **Explicit User Feedback:**
   - Action buttons (such as `[Actualizar Datos]` or `[Submit]`) must always report success, in-flight progress, or failure feedback reactively.

---

## 4. High-IQ Token Economy & Context Preservation Guardrails

1. **`Graphify AST-First, Grep-Fallback, Windowed-Read-Second` (Zero Blind Full-File Reads):**
   - For **any question about project code/architecture (`Code Q&A`)** or before modifying code, ALWAYS query `graphify-out/graph.json` (`docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` or MCP `inspect_ast_blast_radius`) and `graphify-out/GRAPH_REPORT.md` **first** (creating `graphify-out/graph.json` via `./scripts/actualizar-grafos-graphify.sh` if missing). Use `grep -n` **only as a fallback** for unindexed string literals, then call `read_file` with a targeted 40–80 line window (`StartLine` / `EndLine`) around the exact `file:L<line>` returned by the AST graph. Never read files `> 150` lines in full.
   - **`DOCS_ONLY` Exemption (`AGENTS.md` §5):** Tasks touching ONLY human `*.md` / `docs/` files omit AST graph inspection, creation, and rebuild (governance `.agents/skills/**` and `.agents/rules/**` remain `CODE_CHANGE`).
2. **`Zero Redundant Re-Read Invariant` & `Surgical Diff Edits`:**
   - Never re-read a file in the same session if it has not been modified externally. Always use surgical `edit_file` blocks instead of rewriting entire files via `write_file`.
3. **`Parallel Tool Call Batching` & `Subagent Context Isolation`:**
   - Batch independent file reads and checks into a single parallel tool-call turn to avoid $O(N^2)$ prompt history re-billing. Delegate multi-file (`> 4` files) exploratory research to a read-only subagent instructed to return a `<= 20` line summary with exact `file:line` pointers.
4. **`Objective Pre-Execution Critique (Anti-Sycophancy & Anti-Contrarianism Guard)`:**
   - **(a) Skip Praise Openers:** Omit empty flattery openers (*"great idea"*, *"excellent point"*) to conserve tokens and keep technical objectivity.
   - **(b) Empirical Premise Check:** Before endorsing or implementing non-trivial or ambiguous proposals, verify assumptions against live repo state (AST blast radius, existing helpers, schemas, cognitive budgets) and state concrete flaws, duplication, or simpler alternatives (including doing nothing).
   - **(c) Anti-Contrarianism Guard:** Approve cleanly and execute directly without inventing artificial objections when verification finds no real issues.
   - **(d) Routine Command Exemption:** Do NOT debate or stall on clear, routine explicit instructions.

---

## 5. Deterministic Finding Memory & Anti-Loop Circuit Breaker (`BREAKER-42`)

1. **Line-Shift-Invariant State Persistence & Branch Isolation:**
   - `.agents/scripts/track_findings_state.py` (invoked by `.agents/scripts/certify_task_completion.sh`) and `recordQaStageFindingsState` (`mcp-server/src/services/qa-evidence.ts`, invoked by `run_ephemeral_qa` in `mcp-server/src/tools/ephemeral-runner.ts`) persist normalized SHA-256 finding fingerprints in `.agents/.cache/certify_state.json` (`0600` under a `0700` symlink-checked directory), isolated per `session_key = "{branch}:{merge_base_sha}"` (max `10` runs retained per stage) and classified as `RESOLVED`, `PERSISTENT`, `REGRESSION_OSCILLATION`, or `NEW`.
2. **Mandatory Circuit Breaker Trigger (`exit 42` / `BREAKER_42`):**
   - When any normalized finding hits `consecutive_streak >= 3` **or** regresses after passing/alternating (`A -> B -> A`, `oscillations >= 1`), `track_findings_state.py` exits with **`42` (`[BREAKER-42]`)** and `run_ephemeral_qa` returns `exit_code: 42` with a structured `[Fail-Verbose] stage=<stage>:BREAKER_42` alert.
   - Upon `exit 42` / `BREAKER_42`, agents MUST **stop blind edit-and-rerun loops immediately**, run `inspect_ast_blast_radius` (or `inspect_blast_radius.py` inside `sinfallas/base-python-uv:3.15` Docker), and switch to `qa-11x-systematic-debugging` Phase 3 root-cause analysis. Agents are **strictly forbidden** from autonomously executing `--reset-state` without explicit human authorization.

---

## 6. Cross-Functional Smoke Verification Checklist

Prior to submitting any task touching shared domains:
- [ ] Are all standard ports preserved in Docker configurations?
- [ ] Does static type checking and linting pass with zero errors?
- [ ] Did the modification break any adjacent feature in the same view or API group?
- [ ] Were all affected existing unit, integration, BATS, and Karate BDD (`.feature`) tests updated (`QA-TEST-SYNC-01`) and confirmed passing in ephemeral Docker?
