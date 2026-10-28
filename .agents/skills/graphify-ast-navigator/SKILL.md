---
name: graphify-ast-navigator
description: >-
  AST Knowledge Graph navigation, pre-refactoring blast-radius audit, layer boundary compliance,
  and CLI-first query protocol for shell-capable AI agents.
---

# Graphify AST Navigator & Blast Radius Skill

This skill guides the use of AST (Abstract Syntax Tree) knowledge graphs to prevent regressions, circular dependencies, and unexpected side effects.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. CLI-First Execution Rule

- Shell-capable AI agents (Google Antigravity, local CLI agents) MUST query and inspect AST graphs directly using CLI scripts:
  ```bash
  # Pre-refactoring blast radius inspection
  python3 .agents/scripts/inspect_blast_radius.py "<symbol_or_filename>"

  # Topological layer boundaries audit
  python3 .agents/scripts/verify_topological_health.py
  ```
- **Do not** spawn unnecessary background MCP servers or occupy port 8080 when running in environments where shell tools are directly available.

---

## 2. Blast Radius Assessment Matrix

When modifying a symbol or file:
1. **Low Risk:** `< 5` direct callers across `< 3` files. Proceed with local unit tests.
2. **Moderate Risk:** `5-14` callers across `3-7` files. Verify callers' contracts and re-run all caller unit tests.
3. **High / Critical Risk:** `>= 15` callers, `>= 8` files, or security-sensitive keywords (`vault`, `auth`, `token`, `rls`, `csrf`, `session`). Requires full regression test suite execution across the entire pyramid before merging.
