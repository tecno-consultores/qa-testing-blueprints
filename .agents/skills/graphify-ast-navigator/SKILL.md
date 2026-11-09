---
name: graphify-ast-navigator
description: >-
  AST Knowledge Graph lifecycle (why and how to create, incrementally refresh, and query graph.json),
  pre-refactoring blast-radius audit, layer boundary compliance, and CLI-first query protocol for AI agents.
---

# Graphify AST Knowledge Graph & Blast Radius Skill (`graphify-ast-navigator`)

This skill governs the creation, incremental maintenance, and querying of deterministic Abstract Syntax Tree (AST) knowledge graphs (`graphify-out/graph.json`) to eliminate blind file-exploration loops, prevent regressions, and enforce clean architectural layer boundaries.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Why Create & Maintain the AST Knowledge Graph? (4 Strategic Pillars)

Naive text-based exploration (`grep` + reading multiple full files to trace callers) consumes **15,000–40,000+ tokens per query** (*the Token Tax*), dilutes LLM attention, and frequently misses indirect callers. Compiling source code via deterministic Tree-sitter/Graphify AST parsing into `graphify-out/graph.json` solves four critical engineering problems:

1. **10×–100× Token Reduction (`AST-First, Windowed-Read-Second`):**
   - Instead of opening dozens of files to trace imports, inheritance, or function calls, the agent queries the pre-built relational graph (`CALLS`, `IMPLEMENTS`, `INHERITS`, `DEPENDS_ON`) and receives exact `file:line` pointers in `< 200` tokens, then reads only the 40–80 target lines (`StartLine`/`EndLine`).
2. **Objective 3-Path Proportional Execution Triage (`MICRO_CHANGE` vs. `FULL_11X`):**
   - The exact count of incoming dependency edges determines whether a modification qualifies for the fast **Surgical-Path (`MICRO_CHANGE`: `< 5` callers, `<= 3` files)** or requires the **Architectural-Path (`FULL_11X`: `>= 5` callers or security-critical symbols)**.
3. **Multi-Hop Transitive Blast Radius (GraphRAG for Code):**
   - Unlike flat string matching or vector embeddings, AST graph traversal exposes multi-hop ripple effects across API routes, service layers, ORM models, and UI stores before a single line of code is changed.
4. **Automated Topological Layer Governance (Certification Gate 6/10):**
   - Powers `verify_topological_health.py` inside `certify_task_completion.sh` to statically block circular dependencies and forbidden cross-layer coupling (e.g., UI components importing database models directly or domain services depending on HTTP presentation layers).

---

## 2. How to Create & Refresh the AST Graph (Rule Zero Lifecycle)

### A. Mandatory Lifecycle Moments
1. **Pre-Modification Creation Invariant:** Before modifying any code, verify whether `graphify-out/graph.json` exists in the repository root or target stack directory. **If missing, you MUST generate it first** before planning or editing code.
2. **Post-Modification Refresh Invariant:** **ALWAYS** refresh the AST graph after completing code and test changes (prior to running `certify_task_completion.sh`, `git commit`, and `git push`).
3. **`DOCS_ONLY` Fast-Path Exemption:** Never rebuild the AST graph when a task modifies only documentation (`*.md`, `docs/**`).

### B. Canonical Incremental Script (Recommended)
Execute the repository's Pass-Quiet wrapper script, which automatically detects stacks (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `mcp-server`, `backend`, `frontend`, or root) and only rebuilds stacks with code newer than `graph.json`:
```bash
# 1. Auto-incremental mode (rebuilds only missing or modified stacks)
./scripts/actualizar-grafos-graphify.sh

# 2. Targeted single-stack mode (fastest during MICRO_CHANGE)
./scripts/actualizar-grafos-graphify.sh fastapi

# 3. Force full rebuild across all detected stacks
./scripts/actualizar-grafos-graphify.sh --all
```

### C. Direct Ephemeral Docker Command (Fallback if Script is Not Installed)
If working in a consumer repository where `./scripts/actualizar-grafos-graphify.sh` has not yet been installed via `npx -y @sinfallas/mcp-qa-11x@latest install-skill --include-scripts`, create and sanitize the graph directly in an ephemeral `sinfallas/remote-graphify:latest` container (strictly honoring **Rule Zero**—never install `graphify` on the host OS):
```bash
docker run --rm -e OLLAMA_BASE_URL="" -v "$(pwd):/app" -w /app sinfallas/remote-graphify:latest \
  sh -c "graphify extract . --code-only && graphify cluster-only . && rm -rf graphify-out/cache graphify-out/20* graphify-out/.graphify_* graphify-out/.cloud-cta-shown && chown -R $(id -u):$(id -g) graphify-out"
```

### D. Generated Artifacts & Git Hygiene
- **Versioned / Preserved in `graphify-out/`:**
  - `graph.json`: Machine-queryable AST nodes (`id`, `label`, `type`, `file`, `line`) and directed edges (`source`, `target`, `relation`).
  - `GRAPH_REPORT.md`: Human- and LLM-readable architectural cluster summary and god-node diagnostics.
  - `graph.html`: Interactive visual dependency explorer.
- **Purged Automatically:** `graphify-out/cache/` and temporary extraction metadata (`make clean` / `scripts/limpieza.sh` preserves `graph.json`, `GRAPH_REPORT.md`, and `graph.html`).

---

## 3. How to Query & Navigate the Graph (CLI-First Protocol)

- **Shell-capable AI agents** MUST query the AST graph directly via CLI scripts (or via the MCP tool `inspect_ast_blast_radius(project_path, target_symbol, max_items: 20)`):
  ```bash
  # 1. Pre-refactoring blast radius & incoming callers inspection
  python3 .agents/scripts/inspect_blast_radius.py "<symbol_or_filename>"

  # 2. Architectural layer boundary & circular dependency audit
  python3 .agents/scripts/verify_topological_health.py
  ```
- **Zero Background Daemon Rule:** Never spawn persistent background HTTP/MCP graph servers or occupy port `8080` when CLI scripts or stdio MCP tools are available.

---

## 4. Blast Radius Assessment Matrix

| Risk Level | Graph Threshold | Execution Path & Required Verification |
| :--- | :--- | :--- |
| **LOW** | `< 5` callers across `< 3` files (0 schema/route changes) | Eligible for **`MICRO_CHANGE` Surgical-Path**: 3-line inline plan, targeted unit tests + affected stack QA in Docker, incremental AST update. |
| **MODERATE** | `5–14` callers across `3–7` files | **`FULL_11X` Path**: Verify all caller contracts, run affected integration + BDD scenarios, and re-run all caller unit test suites. |
| **HIGH / CRITICAL** | `>= 15` callers, `>= 8` files, or security keywords (`vault`, `auth`, `token`, `rls`, `csrf`, `session`, `rbac`) | **`FULL_11X` Path**: Mandatory `/plan`, `.agents/ACTIVE_TASK.md`, full 13-layer pyramid + Karate Labs BDD + security audit before merging. |
