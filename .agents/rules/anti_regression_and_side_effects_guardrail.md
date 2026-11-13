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
2. **Graphify AST Blast-Radius Pre-Audit, Auto-Creation & Post-Change Update (CLI-First Invariant):**
   - Prior to modifying or refactoring any shared function, model, utility, or state store, run the canonical blast radius inspector directly via CLI (or `inspect_ast_blast_radius` via MCP):
     ```bash
     python3 .agents/scripts/inspect_blast_radius.py "<symbol_name>"
     ```
   - **Mandatory AST Graph Creation If Missing:** If `graphify-out/graph.json` does not exist in the repository or target stack, you **MUST create it first** before modifying code by running:
     ```bash
     ./scripts/actualizar-grafos-graphify.sh
     ```
   - **Mandatory Post-Change AST Graph Update (Code Changes Only):** Upon completing code, test, or script modifications, you **MUST ALWAYS update the AST graph** by running `./scripts/actualizar-grafos-graphify.sh` (which incrementally updates only modified stacks in 1 Pass-Quiet line). **Skip AST graph regeneration on `DOCS_ONLY` tasks** (where only `*.md` / `docs/**` changed).
   - **CLI-First Execution Rule:** Shell-capable agents (Google Antigravity, local terminal agents) MUST execute the inspector and query tools directly via CLI. They MUST NOT spawn background Docker MCP containers or occupy port 8080, which are reserved exclusively for external non-shell clients (Claude Desktop, Hermes Agent).
   - For any symbol assessed as `MODERATE` or `HIGH/CRITICAL` risk, the agent's implementation plan must explicitly list all affected caller files and guarantee that their contracts and parameters remain intact.
3. **Test Suite & Contract Co-Evolution Audit (`QA-TEST-SYNC-01`):**
   - Alongside production callers, always inspect consumer test suites (`tests/**`, `mcp-server/tests/**`, `mcp-server/test/*.feature`, `tests/bats/**`) to synchronize counts, schemas, fixtures, and contract assertions impacted by legitimate code or catalog updates without weakening regression invariants.

---

## 2. Strict Pre-Build Static Analysis (Zero Missing Imports)

1. **Mandatory Immediate Linting:**
   - Before executing builds, restarting containers, or concluding a turn, verify syntactic integrity:
     - Backend: `ruff check src/`
     - Frontend: `vue-tsc --noEmit` or `tsc --noEmit`
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
   - For **any question about project code/architecture (`Code Q&A`)** or before modifying code, ALWAYS query `graphify-out/graph.json` (`python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` or MCP `inspect_ast_blast_radius`) and `graphify-out/GRAPH_REPORT.md` **first** (creating `graphify-out/graph.json` via `./scripts/actualizar-grafos-graphify.sh` if missing). Use `grep -n` **only as a fallback** for unindexed string literals, then call `read_file` with a targeted 40–80 line window (`StartLine` / `EndLine`) around the exact `file:L<line>` returned by the AST graph. Never read files `> 150` lines in full.
2. **`Zero Redundant Re-Read Invariant` & `Surgical Diff Edits`:**
   - Never re-read a file in the same session if it has not been modified externally. Always use surgical `edit_file` blocks instead of rewriting entire files via `write_file`.
3. **`Parallel Tool Call Batching` & `Subagent Context Isolation`:**
   - Batch independent file reads and checks into a single parallel tool-call turn to avoid $O(N^2)$ prompt history re-billing. Delegate multi-file (`> 4` files) exploratory research to a read-only subagent instructed to return a `<= 20` line summary with exact `file:line` pointers.

---

## 5. Cross-Functional Smoke Verification Checklist

Prior to submitting any task touching shared domains:
- [ ] Are all standard ports preserved in Docker configurations?
- [ ] Does static type checking and linting pass with zero errors?
- [ ] Did the modification break any adjacent feature in the same view or API group?
- [ ] Were all affected existing unit, integration, BATS, and Karate BDD (`.feature`) tests updated (`QA-TEST-SYNC-01`) and confirmed passing in ephemeral Docker?
