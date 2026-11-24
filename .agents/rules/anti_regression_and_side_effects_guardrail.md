# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Mandatory Directive: Anti-Regression & Side-Effects Guardrail

> **INVARIANT:** No change or refactor may degrade, break, or silently weaken a validated feature.

## 1. Pre-Modification Blast-Radius & Port Safety

1. **Docker Port Preservation:** Never delete or overwrite canonical HTTP/HTTPS/WSS/DB ports in `docker-compose*.yml`.
2. **Graphify AST-First (`CLI-First` Ephemeral Docker):**
   - Before answering architecture questions (`Code Q&A`) or editing shared symbols, query `graphify-out/graph.json` (`docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` or MCP `inspect_ast_blast_radius`) and `graphify-out/GRAPH_REPORT.md`.
   - If `graphify-out/graph.json` is missing on a code change, build it first via `./scripts/actualizar-grafos-graphify.sh`. Refresh it after code changes via `./scripts/actualizar-grafos-graphify.sh`. Skip AST inspection/build on `DOCS_ONLY` tasks (human `*.md`/`docs/` only; excludes `.agents/{skills,rules,schemas}/`).
   - Shell-capable agents run CLI Docker wrappers directly (never spawning background MCP port `8080` containers). For `MODERATE`/`HIGH`/`CRITICAL` risk, list all affected callers and preserve their contracts.
3. **Existing Test Co-Evolution (`QA-TEST-SYNC-01`):** Trace and update affected tests (`tests/**`, `mcp-server/tests/**`, `*.feature`, `*.bats`) without weakening regression invariants.

## 2. Static Analysis & Frontend Anti-Degradation

- **Immediate Ephemeral Lint (`Rule Zero`):** Run `make qa-lint` (`ruff`, `mypy --strict`, `radon`, `bandit` / `eslint --max-warnings 0`, `vue-tsc`/`tsc` / `phpstan`, `psalm`) before builds or closure; zero missing imports or warnings.
- **No Destructive `catch`:** Stores MUST preserve last known valid state on network errors (never `setItems([])` over valid data) and expose reactive error/in-flight/success feedback.

## 3. High-IQ Token Economy & Objective Critique

1. **AST-First, Grep-Fallback, Windowed Reads:** Query Graphify first, use `grep -n` only for unindexed literals, and read targeted `40–80L` windows (never blind `> 150L` reads).
2. **Zero Redundant Re-Read & Surgical Edits:** Never re-read unchanged files in the same session; prefer `edit_file` over full-file rewrites.
3. **Parallel Batching & Subagents:** Batch independent reads/checks in parallel; delegate `> 4`-file research to read-only subagents returning `<= 20L` summaries with `file:line` pointers.
4. **Objective Pre-Execution Critique:** Skip flattery openers; verify non-trivial/ambiguous proposals against live AST/files/budgets and cite flaws, duplication, or simpler options (incl. doing nothing); approve directly when solid; never debate clear routine commands.

## 4. Finding Memory & Anti-Loop Circuit Breaker (`BREAKER-42`)

- `.agents/scripts/track_findings_state.py` and `recordQaStageFindingsState` persist normalized SHA-256 fingerprints in `.agents/.cache/certify_state.json` (`0600` in `0700` symlink-checked dir) per `"{branch}:{merge_base_sha}"` (`RESOLVED`, `PERSISTENT`, `REGRESSION_OSCILLATION`, `NEW`).
- On `consecutive_streak >= 3` or `oscillations >= 1`, both abort with **`exit 42` (`BREAKER_42`)**. Agents MUST stop blind edit-rerun loops, run `inspect_ast_blast_radius`, and switch to `qa-11x-systematic-debugging` Phase 3. Autonomous `--reset-state` is **strictly forbidden** without human approval.
