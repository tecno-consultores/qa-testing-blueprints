<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# 🧪 Full-Stack Seed Project for E2E Certification of `@sinfallas/mcp-qa-11x` (`example/`)

This directory implements the **end-to-end reference and smoke project (`example/`)** for the `@sinfallas/mcp-qa-11x` MCP server, analogous to the `example/` folder of corporate Docker images (`sinfallas/base-node-ionic`).

Instead of testing MCP tools solely through isolated unit tests, the [`run-example-e2e.mjs`](run-example-e2e.mjs) harness launches the real compiled `dist/index.js` binary via a live MCP client over **`stdio` (`Client` + `StdioClientTransport`)** and operates against an **isolated temporary copy** of this hybrid project (`FastAPI + Vue 3`) without polluting the working tree or the developer's `$HOME` directory.

---

## 🛠️ Real Coverage Certified on Every Run

1. **13 Dynamic Resources (`blueprint://*`, supporting `?lang=es|en`):**
   - `blueprint://manifest`
   - `blueprint://core/philosophy`
   - `blueprint://security/disa-owasp-22`
   - `blueprint://database/postgres-rls-worm`
   - `blueprint://{stack}/readme` (`fastapi` and `vue3` among the 10 stacks)
   - `blueprint://ui/refactoring-ui/{topic}` (`hierarchy`)
   - `blueprint://core/active-task-template`
   - `blueprint://core/cleanup-script`
   - `blueprint://core/roadmap-validator`
   - `blueprint://ai/evals-redteam` *(v2.0)*
   - `blueprint://mobile-appium/readme` *(v2.0)*
   - `blueprint://vibe-rescue/readme` *(v2.0)*
   - `blueprint://skills/tactical-patterns-11x` *(v3.1)*
2. **19 Executable Tools (`callTool` over JSON-RPC `stdio`):**
   - **12 core v1:** `inspect_project_config`, `fetch_blueprint_bundle`, `bootstrap_or_merge_11x`, `inspect_ast_blast_radius`, `audit_test_pyramid_gaps`, `audit_security_stig_owasp`, `clean_workspace_11x`, `init_or_append_agents_md`, `reconcile_agents_governance`, `run_ephemeral_qa`, `certify_11x_gate`, and `propose_skill_evolution_pr`.
   - **7 v2.0/v3.1 tools:** `validate_calm_architecture`, `evaluate_release_gate`, `evaluate_agent_trajectory`, `run_llm_red_team`, `audit_vibe_prototype`, `sync_enterprise_tms`, and `session_flight_recorder` (protected by `promptGuard` + `TaskStateGuard`).
3. **12 CLI Subcommands + Clean-Room Tarball Verifier (`verify-v2.sh`):**
   - `quickstart` (`--tier`/`-T`), `install-skill` (`install`), `init-agents` (`init-agents-md`), `reconcile-agents`, `tms-sync`, `doctor` (`status`), `upgrade` (`cache-clean`), `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`, `--version` (`3.6.0`), `--help`/`help`, and non-blocking TTY probe `QA-CLI-TTY-01` (`< 5s`).

---

## 🚀 Execution in Ephemeral Docker Container (Rule Zero)

```bash
# 1. Full Clean-Room validation (no prior node_modules or dist, matching GitHub Actions)
./scripts/probar-mcp-example.sh

# 2. From the monorepo root via Makefile
make test-example
```

This test runs automatically across **4 security barriers**:
1. `scripts/publicar-mcp.sh` (blocks `npm publish` if any tool or resource fails).
2. `.github/workflows/qa-11x-ci.yml` (GitHub Actions CI).
3. `pre-push` hook (`lefthook.yml` and `instalar-hooks.sh`).
4. Manual execution (`./scripts/probar-mcp-example.sh` / `make test-example`).
