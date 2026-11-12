> 🌐 **Language / Idioma:** **English** | [Leer en Español (GitHub)](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/README.es.md)

# ⚙️ @sinfallas/mcp-qa-11x — Official MCP Server & Skill Installer for QA Testing Blueprints

Official **Model Context Protocol (MCP)** Server and Universal Thin-Repo Skill Installer for **[QA Testing Blueprints](https://github.com/tecno-consultores/qa-testing-blueprints)** (Corporate Quality Level 11X, **DISA ASD STIG V6R5**, and **OWASP Developer Guide v4.2**).

- **Official Repository:** [https://github.com/tecno-consultores/qa-testing-blueprints](https://github.com/tecno-consultores/qa-testing-blueprints)
- **Step-by-Step AI Agent Setup Guide:** [docs/agent-setup.en.md](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/agent-setup.en.md)
- **AI Agent Integration Guide:** [docs/ai-integration.md](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/ai-integration.md)
- **11X QA Dashboard & Metrics:** [TESTING.md](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/TESTING.md)

---

## 🚀 Quick Start (`Zero-Clone`)

> [!TIP]
> For step-by-step instructions, JSON/TOML snippets, and exact configuration paths on macOS, Linux, and Windows across **11 supported AI coding agents** (VS Code / Copilot, Cursor, Claude Code, Google Antigravity, Codex CLI, Windsurf, JetBrains IDEs, Cline, Claude Desktop, Hermes Agent, Zed), see the **[Step-by-Step Setup Guide per AI Agent](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/agent-setup.en.md)**.

### 1. Universal Skill & Governance Installer via CLI (Run in Terminal)
Installs the complete catalog of **5 corporate skills** into your global AI agent directories, downloads operational scripts (`.agents/scripts/*`, `scripts/*`), reconciles local rule duplicates, and injects the connector into `AGENTS.md` (plus the global thin pointer in `~/.gemini/GEMINI.md`) with cryptographic **SHA-256 verification (`DISA STIG V-222513`)**:

```bash
# Recommended single-command setup in any project (alias: `install`):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

# With explicit human output language policy for AGENTS.md (auto|es|en):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --lang auto --init-agents --include-scripts --reconcile

# With explicit target agent environment:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] --init-agents --include-scripts --reconcile

# Non-destructively inject only the QA 11X connector block into AGENTS.md:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <path>] [--lang auto|es|en] [--dry-run]

# Reconcile and deduplicate rules in a downstream consumer project:
npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents [--project-path <path>] [--dry-run]

# Force clean update of local npx and blueprint caches:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

### 2. Configure MCP Server over `stdio` (Spawned by AI Clients)
Directly compatible with **VS Code (GitHub Copilot)**, **Cursor**, **Claude Code / Desktop**, **Google Antigravity**, **Codex**, **Windsurf**, and **Hermes Agent**. AI clients spawn `npx -y @sinfallas/mcp-qa-11x@latest` automatically over `stdio` pipes:

```json
{
  "mcpServers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
    }
  }
}
```

> [!NOTE]
> Running `npx -y @sinfallas/mcp-qa-11x@latest` without arguments directly in an interactive terminal (`TTY`) automatically syncs any installed global skills via SHA-256, prints quick-start setup commands, and exits cleanly (`0`) without hanging your shell. Pass `--stdio` (or `QA_FORCE_STDIO=1`) if you intentionally want to attach a raw JSON-RPC listener in a `TTY`.

#### Flags for `install-skill`:
* `--target, -t <env>`: Target environment. `auto` (default: installs the 5 skills into all detected global agent directories in `$HOME`: Antigravity, Claude, Cursor, Windsurf, Codex, Hermes; falls back to `workspace` only if no global agents exist) | `workspace` | `antigravity` | `claude` | `cursor` | `windsurf` | `codex` | `hermes` | `all`.
* `--lang, -l <mode>`: Output language policy injected into `AGENTS.md`. `auto` (default: **Dynamic Language Mirroring** — LLM responds and reasons in the prompt language, and writes commit messages and human-facing documentation matching the existing language of repository `README.md` and `CHANGELOG.md`) | `es` (Spanish enforced) | `en` (English enforced).
* `--init-agents`: Creates `AGENTS.md` or additively injects the QA 11X connector block into existing `AGENTS.md`, and synchronizes the global thin-client pointer in `~/.gemini/GEMINI.md`.
* `--include-scripts`: Downloads and installs executable certification and audit scripts (`.agents/scripts/*`, `scripts/*`), CI/hooks configurations, and `.agents/ACTIVE_TASK.md.example` (`0o755`), without duplicating `.agents/rules/*.md`.
* `--reconcile`: Reconciles downstream consumer projects, removing local duplicate copies of the 7 canonical rules and 5 skills from `<project>/.agents/`, and safely extracting custom domain business logic into `.agents/rules/domain_<project>_rules.md` with backups in `.agents/backups/`.

---

## 🧠 Catalog of 5 Corporate Skills

1. **`qa-11x-architect`:** Master QA 11X & DevSecOps Architect (`SKILL.md < 20 KB`: 13 pyramid layers, 10 Non-Negotiable Laws, 9 UAT Anti-Blindness Rules including `SEC-16` Pre-Auth multi-step continuity and `QA-HEALTH-01` unmocked container healthcheck contracts, High-IQ Token Economy with 3-Path proportional execution `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`, and 22 DISA ASD STIG V6R5 / OWASP v4.2 controls with 9 on-demand `references/*.md` modules).
2. **`graphify-ast-navigator`:** Bidirectional AST Knowledge Graph navigation (`graphify-out/graph.json` and `GRAPH_REPORT.md`) mandatory for **Code Q&A (`Graphify AST-First, Grep-Fallback, Windowed-Read-Second`)**, pre-refactoring blast radius audits, and architectural layer boundary enforcement.
3. **`qa-11x-docker-certifier`:** Corporate Standard certifier in ephemeral Docker containers (**Rule Zero**: unit test coverage `>= 95%` with `COVERAGE_FILE=/tmp/.coverage`, Cyclomatic/Cognitive Complexity Grade A, Karate Labs BDD, mutation testing, and zero host contamination).
4. **`docker-trivy-keydb-hardening`:** Container hardening (Trivy target HIGH/CRITICAL = 0), KeyDB multi-threaded in-memory caching engine, non-root execution, and multi-stage builds.
5. **`refactoring-ui`:** Visual hierarchy, spacing scales, typography (`tabular-nums`), OKLCH color contrast (WCAG 2.1 AA), dark mode, and Anti-JSDOM real geometry rules with 9 modular `references/*.md` guides.

---

## 📦 Supported Tech Stacks (7 Stacks)

| Stack | Core Technology | 11X Quality & DevSecOps Tools |
| :--- | :--- | :--- |
| **`fastapi`** | Python 3.11–3.15 + FastAPI + PostgreSQL 17 + KeyDB | Ruff, Mypy, Bandit, Radon, Pytest (`>=95%`), Schemathesis, Karate Labs BDD, Mutmut, OWASP ZAP, Locust + Pumba |
| **`python`** | Python 3.11–3.15 (Libraries & CLI) | Ruff, Mypy, Bandit, Radon, Pytest (`>=95%`), Hypothesis, Mutmut |
| **`node-backend`** | Node.js 22–26 + TypeScript (Express / Fastify) | ESLint, SonarJS, Vitest (`>=95%`), Supertest, Karate Labs BDD, Stryker, OWASP ZAP |
| **`vue3`** | Vue 3 + TypeScript + Vite + Pinia | ESLint, SonarJS, `vue-tsc`, Vitest (`>=95%`), Playwright + `@axe-core` (WCAG 2.1 AA), Karate UI, Stryker, Lighthouse CI |
| **`react-frontend`** | React 19 + TypeScript + Vite | ESLint, SonarJS, `tsc`, Vitest (`>=95%`), Playwright + `@axe-core`, Karate UI, Stryker, Lighthouse CI |
| **`php`** | PHP 8.2–8.5 (Symfony / Laravel / Slim) | PHP-CS-Fixer, PHPStan (Max), Psalm Taint, Pest/PHPUnit + PCOV (`>=95%`), Karate Labs BDD, Infection MSI, OWASP ZAP |
| **`bash-scripts`** | Bash / Shell (Automation & DevSecOps) | ShellCheck, `shfmt`, BATS-core, Kcov (`>=95%`), Trivy |

---

## 🛠️ MCP Tools (12 Tools)

1. **`inspect_project_config`:** Audits user project directory, detecting stacks, strict linter flags, browser/UI testing readiness, missing 11X files, and structured `update_available` version/skill drift status (`.qa-11x-version` + 24h TTL fail-open check, paired with silent background SHA-256 auto-sync of installed global skills on `stdio` startup).
2. **`fetch_blueprint_bundle`:** Downloads on-demand blueprint templates and scripts with SHA-256 verification (lightweight index `include_content: false` default for extreme token economy).
3. **`bootstrap_or_merge_11x`:** Surgically injects or merges 11X quality standard templates without altering existing production dependencies or code.
4. **`inspect_ast_blast_radius`:** Queries the AST knowledge graph (`graphify-out/graph.json` and `GRAPH_REPORT.md`) for code/architecture Q&A (`declaring_files` with `file:L<line>`, incoming callers, outgoing dependencies) and pre-refactoring blast-radius analysis (`auto_build_if_missing`, `refresh_graph`, and `MICRO_CHANGE` eligibility).
5. **`clean_workspace_11x`:** Audits or executes workspace sanitation, removing transient test artifacts and Docker root residues (`dry_run` default).
6. **`audit_security_stig_owasp`:** Statically audits project source code against 24 DISA ASD STIG V6R5, OWASP v4.2, and Anti-Silo QA patterns (`SEC-01` to `SEC-16`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `UI-11X-01/02`, including PostgreSQL RLS multi-transaction `after_begin`, WORM forensic chain `seq_num` + `pg_advisory_xact_lock`, Pre-Auth continuity, and unmocked container healthcheck contracts) with compact grouping (`grouped_findings`).
7. **`run_ephemeral_qa`:** Safely runs a Makefile QA target (`lint`, `unit`, `migration`, `integration`, `ci`, `bdd`, `mutation`, `dast`, `e2e`, `perf`, `chaos`, `all`) inside ephemeral Docker containers (**Rule Zero**), recording cryptographic evidence with `skip_if_docs_only` support.
8. **`certify_11x_gate`:** Unified 11X certification gate (secrets, JSON, orphan UI/API, ORM parity, fresh pre-push lint evidence, AST topology, STIG/OWASP security, Dual-Consumer documentation sync, and `update_available` drift notice).
9. **`audit_test_pyramid_gaps`:** Audits existing project against the 13 layers of the 11X pyramid (`L01` to `L13`), reporting uncovered files/endpoints and a prioritized rescue plan.
10. **`init_or_append_agents_md`:** Injects or updates the QA 11X connector block into `AGENTS.md` (with `--lang auto|es|en` policy) and synchronizes the global thin-client pointer in `~/.gemini/GEMINI.md`.
11. **`propose_skill_evolution_pr`:** Proposes a Dual-Consumer improvement (AI skill/rule + MCP executable gate + human manual in `docs/`) to `tecno-consultores/qa-testing-blueprints` via authenticated local `gh` CLI or pre-filled GitHub URL.
12. **`reconcile_agents_governance`:** Reconciles `.agents/` governance rules in consumer projects: creates backup, prunes promoted duplicates, and extracts domain rules to `.agents/rules/domain_<project>_rules.md`.

---

## 📚 MCP Resources (9 Resources)

- `blueprint://manifest`: Complete cryptographic manifest (`manifest.json`).
- `blueprint://core/philosophy`: Level-11X quality philosophy and the 13 pyramid layers.
- `blueprint://security/disa-owasp-22`: Catalog of 22 canonical security patterns (DISA ASD STIG V6R5 & OWASP v4.2).
- `blueprint://{stack}/readme`: Operational testing and QA guide per tech stack (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `bash-scripts`).
- `blueprint://ui/refactoring-ui/{topic}`: Tactical UI design and accessibility modules (`skill`, `hierarchy`, `layout`, `type`, `color`, `depth`, `images`, `polish`, `dark-mode`, `tailwind`).
- `blueprint://core/active-task-template`: Canonical active task diary template (`.agents/ACTIVE_TASK.md.example`).
- `blueprint://core/cleanup-script`: Universal cleanup script (`scripts/limpieza.sh`).
- `blueprint://core/roadmap-validator`: Bidirectional roadmap consistency validator (`verify_roadmap_consistency.py`).
- `blueprint://database/postgres-rls-worm`: Canonical reference implementation of PostgreSQL 17 Multi-Transaction RLS (`after_begin`) and deterministic WORM audit serialization (`seq_num` + `pg_advisory_xact_lock`).

> **Real-World E2E Verification (`example/`):** Every release is verified in a clean-room ephemeral Docker container (`./scripts/probar-mcp-example.sh` / `pnpm run test:example`) by spawning the compiled `dist/index.js` binary over real `stdio` (`StdioClientTransport`) against the hybrid `FastAPI + Vue 3` reference project in [`mcp-server/example/`](https://github.com/tecno-consultores/qa-testing-blueprints/tree/main/mcp-server/example), asserting all 9 resources, 12 tools, and 3 CLI subcommands end-to-end before Git push and `npm publish`.

---

## 📄 Author, Copyright & License

- **Author:** Jesus Palencia (`<sinfallas@gmail.com>`)
- **Copyright:** `Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Created at Tecno Consultores)`
- **License:** Distributed under the [MIT License](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/LICENSE).
