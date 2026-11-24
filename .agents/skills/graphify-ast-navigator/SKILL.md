---
name: graphify-ast-navigator
description: >-
  AST Knowledge Graph lifecycle and bidirectional code navigation (why and how to create, incrementally refresh,
  and query graph.json & GRAPH_REPORT.md). MANDATORY FIRST STEP whenever answering questions about project code
  or architecture (Code Q&A), tracing callers/callees, auditing pre-refactoring blast radius, or checking layer boundaries.
---

# Graphify AST Knowledge Graph & Bidirectional Code Navigator (`graphify-ast-navigator`)

This skill governs the creation, incremental maintenance, and bidirectional querying of deterministic Abstract Syntax Tree (AST) knowledge graphs (`graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md`) to answer code/architecture questions (`Code Q&A`), eliminate blind file-exploration loops, prevent regressions, and enforce clean architectural layer boundaries.
> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

---

## 1. Why Create & Query the AST Knowledge Graph? (4 Strategic Pillars)

Naive text-based exploration (`grep` + reading multiple full files to trace callers) consumes **15,000–40,000+ tokens per query** (*the Token Tax*), dilutes LLM attention, and frequently misses indirect callers. Compiling source code via deterministic Tree-sitter/Graphify AST parsing into `graphify-out/graph.json` solves four critical engineering problems:

1. **10×–100× Token Reduction (`Graphify AST-First, Grep-Fallback, Windowed-Read-Second`):**
   - For **any question about project code/architecture (`Code Q&A`)** or before modifying code, the agent queries the pre-built relational graph (`CALLS`, `IMPLEMENTS`, `INHERITS`, `DEPENDS_ON`) and `GRAPH_REPORT.md` **before** running `grep` or opening files. It receives exact `file:line` pointers, incoming callers (`⬅️`), and outgoing dependencies (`➡️`) in `< 200` tokens, then reads only the 40–80 target lines (`StartLine`/`EndLine`).
2. **Objective 3-Path Proportional Execution Triage (`MICRO_CHANGE` vs. `FULL_11X`):**
   - The exact count of incoming dependency edges determines whether a modification qualifies for the fast **Surgical-Path (`MICRO_CHANGE`: `< 5` callers, `<= 3` files)** or requires the **Architectural-Path (`FULL_11X`: `>= 5` callers or security-critical symbols)**.
3. **Multi-Hop Transitive Blast Radius (GraphRAG for Code):**
   - Unlike flat string matching or vector embeddings, AST graph traversal exposes multi-hop ripple effects across API routes, service layers, ORM models, and UI stores before a single line of code is changed.
4. **Automated Topological Layer Governance & Quantitative Instability Metrics (Certification Gate 6/10):**
   - Powers `verify_topological_health.py` inside `certify_task_completion.sh` to statically block directed circular dependencies (3-color DFS) and forbidden cross-layer coupling (`models/`/`schemas/`/`core/`/`domain/`/`services/` depending on `api/`/`controllers/`/`routes/`/`views/`, or `components/common/` depending on `views/`/`pages/`).
   - Supports optional declarative `.agents/boundaries.json` contracts (`layers`, `independence`, `forbidden` with fail-closed `0`-node guard) and `--metrics` ($C_a$, $C_e$, Martin Instability $I = C_e / (C_a + C_e)$, and god-module detection).

---

## 2. How to Create & Refresh the AST Graph (Rule Zero Lifecycle)

### A. Mandatory Lifecycle Moments
1. **Code Q&A & Pre-Modification Creation Invariant:** Whenever answering a question about a project's code/architecture OR before modifying any code, verify whether `graphify-out/graph.json` exists in the repository root or target stack directory. **If missing, you MUST generate it first** (`./scripts/actualizar-grafos-graphify.sh` or `auto_build_if_missing: true`) before running `grep` or editing code.
2. **Post-Modification Refresh Invariant:** **ALWAYS** refresh the AST graph after completing code and test changes (prior to running `certify_task_completion.sh` and local `git commit`; never run automatic `git push` per `QA-GIT-GATE-01`).
3. **`DOCS_ONLY` Fast-Path Exemption:** Never rebuild the AST graph when a task modifies only human documentation (`*.md`, `docs/**`, excluding `.agents/{skills,rules,schemas}/`).

### B. Canonical Incremental Script (Recommended)
Execute the repository's Pass-Quiet wrapper script, which automatically detects stacks (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `mcp-server`, `ai-evals`, `mobile-appium`, `vibe-rescue`, `bash-scripts`, `backend`, `frontend`, or root) and only rebuilds stacks with code newer than `graph.json`:
```bash
# 1. Auto-incremental mode (rebuilds only missing or modified stacks)
./scripts/actualizar-grafos-graphify.sh

# 2. Targeted single-stack mode (fastest during MICRO_CHANGE)
./scripts/actualizar-grafos-graphify.sh fastapi

# 3. Force full rebuild across all detected stacks
./scripts/actualizar-grafos-graphify.sh --all
```

### C. Direct Ephemeral Docker Command (Fallback if Script is Not Installed)
If working in a consumer repository where `./scripts/actualizar-grafos-graphify.sh` has not yet been installed via `npx -y @sinfallas/mcp-qa-11x@latest install-skill --include-scripts`, create and sanitize the graph directly in an ephemeral non-root `sinfallas/remote-graphify` container pinned by digest (strictly honoring **Rule Zero**—never install `graphify` on the host OS):
```bash
docker run --rm --network none --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e OLLAMA_BASE_URL="" -v "$(pwd):/app" -w /app \
  sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0 \
  sh -c "graphify extract . --code-only --allow-dedup-shrink && graphify cluster-only . && rm -rf graphify-out/cache graphify-out/20* graphify-out/.graphify_* graphify-out/.cloud-cta-shown"
```

### D. Generated Artifacts & Git Hygiene
- **Preserved locally in `graphify-out/` (git-ignored):**
  - `graph.json`: Machine-queryable AST nodes (`id`, `label`, `type`, `file`, `line`) and directed edges (`source`, `target`, `relation`).
  - `GRAPH_REPORT.md`: Human- and LLM-readable architectural cluster summary and god-node diagnostics.
  - `graph.html`: Interactive visual dependency explorer.
- **Purged Automatically:** `graphify-out/cache/` and temporary extraction metadata (`make clean` / `scripts/limpieza.sh` preserves `graph.json`, `GRAPH_REPORT.md`, and `graph.html`).

---

## 3. How to Query & Navigate the Graph (CLI-First Protocol for Code Q&A & Refactoring)

- **Mandatory Order of Operations (`Graphify AST -> GRAPH_REPORT.md -> Windowed Read -> Grep Fallback`):**
  1. For high-level architectural questions, read `graphify-out/GRAPH_REPORT.md` first to identify functional communities and central nodes.
  2. For symbol, function, class, route, or file questions (or pre-refactoring blast radius), query the bidirectional AST graph via ephemeral Docker CLI (`sinfallas/base-python-uv:3.15` under `Rule Zero`) or MCP (`inspect_ast_blast_radius(project_path, target_symbol, changed_since_ref, max_items: 20, auto_build_if_missing: true, include_git_signals: true)`), which returns the exact declaring `file:line`, incoming callers (`⬅️ Llamado por`), outgoing callees (`➡️ Invoca a`), and optional longitudinal Git co-change/hotspot signals (`--git-signals`):
     ```bash
     # 1. Bidirectional symbol navigation + longitudinal Git signals (hotspots, co-change, bus-factor)
     docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app \
       sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<symbol_or_filename>" --git-signals

     # 2. Differential blast-radius test selector (Affected suites only; also accepts --base)
     docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app \
       sinfallas/base-python-uv:3.15 python3 .agents/scripts/select_tests_by_blast_radius.py --base-ref origin/main

     # 3. Architectural layer boundary, declarative .agents/boundaries.json & Instability metrics audit
     docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app \
       sinfallas/base-python-uv:3.15 python3 .agents/scripts/verify_topological_health.py --metrics
     ```
     - Under **`QA-TEST-SYNC-01`**, trace and update all impacted consumer test suites (`tests/`, `*.feature`, `*.bats`) surfaced by the blast radius before finalizing changes.
  3. Read only the 40–80 lines around the reported `file:L<line>` (`StartLine`/`EndLine`). Use `grep -n` **only as a fallback** for string literals not indexed as AST nodes.
- **Zero Background Daemon Rule:** Never spawn persistent background HTTP/MCP graph servers or occupy port `8080` when CLI scripts or stdio MCP tools are available.

---

## 4. Blast Radius Assessment Matrix

| Risk Level | Graph Threshold | Execution Path & Required Verification |
| :--- | :--- | :--- |
| **LOW** | `< 5` callers across `<= 3` files (0 schema/route changes) | Eligible for **`MICRO_CHANGE` Surgical-Path**: 3-line inline plan, sync affected existing unit/BDD tests (`QA-TEST-SYNC-01`) + stack QA in Docker, incremental AST update. |
| **MODERATE** | `5–14` callers or `> 3` affected files (non-security) | **`FULL_11X` Path**: Verify all caller contracts, update and re-run all affected unit, integration, BATS, and BDD `.feature` scenarios (`QA-TEST-SYNC-01`). |
| **HIGH / CRITICAL** | `>= 15` callers or security keywords (`vault`, `auth`, `token`, `rls`, `security`, `csrf`, `secret`, `session`, `rbac`) | **`FULL_11X` Path**: Mandatory `/plan`, `.agents/ACTIVE_TASK.md`, full 13-layer pyramid + Karate Labs BDD + security audit before merging. |
