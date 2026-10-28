# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: Anti-Regression & Side-Effects Guardrail

> **SUPREME GOVERNANCE INVARIANT:**
> No code change or refactoring may degrade, break, or disable an existing, previously validated feature. Whenever modifying shared modules, network configurations, or state stores, all agents and developers must proactively enforce the anti-regression safeguards defined herein.

---

## 1. Pre-Modification Impact & Blast-Radius Analysis

Before altering any shared code, service definition, or configuration:
1. **Shared Configuration & Port Invariants (`docker-compose*.yml`):**
   - **Never delete or overwrite canonical protocol ports** when adding or exposing alternative ports.
   - Verify that base HTTP/HTTPS/WSS and database bindings remain reachable.
2. **Graphify AST Blast-Radius Pre-Audit (CLI-First Invariant):**
   - Prior to modifying or refactoring any shared function, model, utility, or state store, run the canonical blast radius inspector directly via CLI:
     ```bash
     python3 .agents/scripts/inspect_blast_radius.py "<symbol_name>"
     ```
   - **CLI-First Execution Rule:** Shell-capable agents (Google Antigravity, local terminal agents) MUST execute the inspector and query tools directly via CLI. They MUST NOT spawn background Docker MCP containers or occupy port 8080, which are reserved exclusively for external non-shell clients (Claude Desktop, Hermes Agent).
   - For any symbol assessed as `MODERATE` or `HIGH/CRITICAL` risk, the agent's implementation plan must explicitly list all affected caller files and guarantee that their contracts and parameters remain intact.

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

## 4. Cross-Functional Smoke Verification Checklist

Prior to submitting any task touching shared domains:
- [ ] Are all standard ports preserved in Docker configurations?
- [ ] Does static type checking and linting pass with zero errors?
- [ ] Did the modification break any adjacent feature in the same view or API group?
- [ ] Were existing tests re-executed and confirmed passing?
