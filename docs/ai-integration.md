> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](ai-integration.es.md)

# Autonomous AI Agent Integration

This document details how to evolve from manual interaction into an automated workflow where Artificial Intelligence agents ingest, enforce, and execute the QA blueprints autonomously.

## 1. Rule Ingestion via MCP (Model Context Protocol)
For an agent to understand corporate constraints in real time, blueprints must be exposed as dynamic resources.

* **The Concept:** Avoid giving the AI unrestricted read access across your entire disk. Use an MCP server to expose only the rules and code it needs in compressed form.
* **Practical Example 1 (Daemonless CLI-First Bidirectional AST Navigation):** Instead of reading full files blindly or keeping persistent HTTP servers running on port 8080, the ecosystem extracts and indexes the AST knowledge graph on demand with `sinfallas/remote-graphify:latest` and queries it via CLI or MCP (`stdio`):

```bash
  # 1. Extract/incrementally refresh graphify-out/{graph.json,GRAPH_REPORT.md}
  ./scripts/actualizar-grafos-graphify.sh

  # 2. Query exact file:L<line> location, incoming callers, and outgoing callees
  python3 .agents/scripts/inspect_blast_radius.py "<symbol>"
```
* **CLI-First / MCP `stdio` Invariant:** Both console-capable agents (Antigravity, Claude Code, Cursor) and agents connected to `@sinfallas/mcp-qa-11x` (`inspect_ast_blast_radius`) query `graphify-out/graph.json` and `GRAPH_REPORT.md` directly without occupying TCP ports or leaving background daemons.
* **Practical Example 2 (SHA-256 Verified Dynamic Resources):** The `@sinfallas/mcp-qa-11x` v3.1.0 MCP server exposes **13 MCP resources (`blueprint://*`: 11 static via `resources/list` + 2 dynamic templates via `resources/templates/list`)** and **19 MCP tools** covering **10 hydratable stacks + `architecture/` + `mcp-server/` (= 12 matrix environments)** (including `mobile-appium` on `sinfallas/base-mobile-appium:26`). When an agent detects a FastAPI stack, it queries `blueprint://fastapi/readme` and `blueprint://database/postgres-rls-worm`, receiving templates cryptographically verified against `manifest.json`.
* **Practical Example 3 (Proactive QA Config Reading):** The MCP server or static inspection must not evaluate topology alone. It must proactively audit QA configuration files (such as `pyproject.toml`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`) before writing code.
  * **Unbreakable Rule to Inject into the Developer Agent:** "If the Developer Agent is going to write code, its first autonomous step must be reading linter and typing rules so it generates compliant code under strict settings (e.g. `strict=true` in Mypy) on the first try, saving self-correction cycles (tokens)."

## 2. Multi-Agent Orchestration (Pantheon / Hermes Architectures)
High-rigor tests (mutation, SAST, BDD) overwhelm context if a single agent tries to write the application and audit it simultaneously. Role separation must be implemented.

* **The Concept:** A Developer Agent writes the code; an Auditor (QA) Agent enforces compliance with the blueprint rules.
* **Implementation Suggestion (System Prompt for the QA Agent):**
  > *"You are a relentless QA auditor. Your single source of truth is the ruleset ingested via MCP or `.agents/rules/`. If the Developer Agent proposes raw host commands such as `pip install`, `npm run test`, or tries to build long ad-hoc Docker commands, REJECT the code. Strictly require using the predefined `Makefile` targets (e.g. `make qa-unit`, `make qa-all`) to isolate infrastructure and invoke dependencies inside cache volumes."*
* **Flow:** If the Developer creates a destructive Bash script without using `bats-mock`, the QA Agent intercepts the step and requires refactoring the test before marking the work done.

## 3. Context Optimization with Inference Proxies (OmniRoute)
The self-correction loop consumes massive numbers of input tokens, especially when processing long error dumps or HTML coverage reports.

* **The Concept:** Do not spend high-reasoning (and high-cost) model tokens fixing whitespace issues.
* **Routing Example:**
  * **Mechanical Tasks:** Configure OmniRoute to route `shfmt`, `ShellCheck`, or `Ruff` errors to a fast, low-cost local model (e.g. *Llama 3 8B* or *Hermes 3 8B*). The same rule applies to formatting and linting tools like `ESLint` and `Prettier`. Fixing indentation or semicolons does not require advanced reasoning.
  * **Logical Tasks:** If a mutation test in `Stryker` or `mutmut` fails, or `Artillery` reports a deadlock, route that dump to the highest-reasoning model (e.g. *Hermes 3 70B* or *Claude 3.5 Sonnet*), since it requires analyzing business flow to understand why the test is flawed. Likewise, technical debt and complexity reports from `radon` or `eslint-plugin-sonarjs` must be processed by larger models.

## 4. Sandboxing: Execution Permissions (Tool Calling)
The `qa-testing-blueprints` ecosystem is intentionally designed to be the AI's playground. Because all tests run inside self-destructing containers encapsulated behind `make` targets, giving the AI execution access is safe.

* **The Concept:** Provide the agent with a tool (`tool_call`) to execute terminal commands while blocking access to the real host.
* **Practical Restriction Example (Python):** In your AI tool definition, apply strict validation before invoking the subprocess, forcing exclusive use of `Makefile` targets:

```python
  import shlex
  import subprocess

  ALLOWED_TARGETS = {"qa-lint", "qa-unit", "qa-bdd", "qa-e2e", "qa-all", "clean"}

  def run_qa_command(command: str) -> str:
      parts = shlex.split(command)
      if len(parts) == 2 and parts[0] == "make" and parts[1] in ALLOWED_TARGETS:
          result = subprocess.run(parts, shell=False, capture_output=True, text=True, check=False, timeout=300)
          return result.stdout if result.returncode == 0 else result.stderr
      return "ERROR: Operation denied. Only allowlisted Makefile targets are permitted (shell=False, APSC-DV-002510)."
```

* **The Autonomous Observability Loop:** The agent runs tests and evaluates `stderr`. If `kcov` reports only 85% coverage, or the AI starts the `--profile chaos` profile and detects via queries to `http://localhost:9090/api/v1/query` (Prometheus) that P99 latency exceeds corporate thresholds, the AI understands the failure, rewrites business code in its workspace, and re-invokes the stress tool until the standard is met.

## 5. Bilingual Governance `.agents/`, 11-Step Closure Protocol & 10-Stage Certification Gate
In enterprise-grade projects, the AI must follow a strict dual-language governance model:
1. **High-Density Technical English Rules:** Instructions in `.agents/rules/` and skills in `.agents/skills/` stay exclusively in compact technical English (~35% BPE token reduction) to maximize LLM logical accuracy.
2. **Bilingual Canonical Documentation (`*.md` EN + `*.es.md` ES) & Dynamic Mirroring:** Public human documentation follows the English canonical (`*.md`) + 1:1 Spanish mirror (`*.es.md`) architecture, while interactive agent reasoning and responses mirror the user's prompt language (`--lang auto|en|es`).
3. **Mandatory 10-Stage Certification Gate (`certify_task_completion.sh`) within the 11-Step Closure Protocol:** Before concluding any `FULL_11X` task under the 11-step closure protocol (`AGENTS.md` §5), the AI must run all 10 certification stages:
   - Secret Scanning (`scripts/verificar-secretos.sh`).
   - Infrastructure & Container Audit (`scripts/auditar-infra.sh` / Trivy).
   - JSON File Integrity without duplicate keys (`verify_json_no_duplicate_keys.py`).
   - Zero Orphan UI Components (`verify_zero_orphan_vue_components.py`).
   - Zero Orphan API Endpoints (`verify_no_orphan_api_endpoints.py`).
   - Topological Health & Layer Isolation (`verify_topological_health.py`).
   - ORM & Relational Schema Parity (`verify_alembic_orm_parity.py`).
   - Cryptographic Remote Manifest Synchronization (`manifest.json`).
   - Internal Consistency of `ROADMAP.md` and `ACTIVE_TASK.md` (`verify_roadmap_consistency.py`).
   - Unconditional synchronization of documentation and mandatory tests (`CHANGELOG.md`, `TESTING.md`, `README.md`).

---

## 6. Zero-Clone MCP Server (`@sinfallas/mcp-qa-11x`) — 1 Command via `npx`

The official Node.js package **`@sinfallas/mcp-qa-11x`** lets any AI Agent or developer use the entire 11X methodology and validation arsenal without cloning the full repository, resolving dependencies on demand with SHA-256 cryptographic verification (`DISA STIG V-222513`).

### 6.1. Direct 1-Command Execution

```bash
# 30-second quick adoption (`quickstart`, supports `--tier`/`-T`, `--lang`, `--agents`):
npx -y @sinfallas/mcp-qa-11x@latest quickstart -T standard --lang en --agents auto

# Recommended full installation in a repository (installs the 11 modular Skills, .agents/scripts/* & injects AGENTS.md connector; alias: `install`):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

# Installation with explicit options (specifying target environment):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] --init-agents --include-scripts

# Or inject/update only QA 11X connectors in AGENTS.md and configured IDEs:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <path>] [--lang auto|en|es] [--agents auto|all|<csv>] [--dry-run]

# Synchronize BDD inventory or push JUnit XML results to enterprise TMS providers:
npx -y @sinfallas/mcp-qa-11x@latest tms-sync --mode <inventory|push-results|pull-stories> --provider jira|zephyr|xray|github-issues [--junit-xml <path>] [--json] [--dry-run]

# Start the MCP server directly over stdio (invoked by AI clients; on interactive TTY syncs skills and exits 0, or use --stdio):
npx -y @sinfallas/mcp-qa-11x@latest [--stdio]
```

#### Parameters of the `install-skill` installer:
* **`--target, -t <env>`:** Target destination for the 11 modular skills (`auto` by default — installs exclusively in global AI agent directories detected under `$HOME`, falling back to `workspace` only when no global agents are present — `workspace`, `antigravity`, `claude`, `cursor`, `windsurf`, `codex`, `hermes`, or `all`).
* **`--init-agents`:** Creates `AGENTS.md` or appends the canonical QA 11X connector block without overwriting prior rules (and syncs `~/.gemini/GEMINI.md` plus Thin-Repo connectors when `--agents` is set).
* **`--include-scripts`:** Downloads only executable certification scripts (`.agents/scripts/*` and `scripts/*`), `.agents/schemas/*.json`, common CI/hook files, and `.agents/ACTIVE_TASK.md.example` (`0o755`) into the current directory, without duplicating `.agents/rules/*.md`.
* **`--reconcile`:** Reconciles Thin-Repo governance in the consuming project, removing local copies of the 8 canonical rules and 11 skills under `<project>/.agents/`, and extracting custom domain rules into `.agents/rules/domain_<project>_rules.md` with backups in `.agents/backups/`.

### 6.2. AI Client Configuration

> [!TIP]
> For the exhaustive step-by-step guide and declarative matrix covering all **28 supported AI agents** (`quickstart --agents` / `init-agents --agents`, including Antigravity, Claude Code/Desktop, Cursor, Windsurf, VS Code Copilot, Codex CLI, Gemini CLI, Hermes, Cline, Roo Code, Aider, JetBrains AI, Bolt, Lovable, v0, and Replit), see **[`docs/agent-setup.md`](agent-setup.md)** (English; Spanish mirror at `docs/agent-setup.es.md`).

#### A. Claude Desktop / Claude Code (`claude_desktop_config.json`)
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

#### B. Cursor IDE (`.cursor/mcp.json`)
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

#### C. Google Antigravity / Gemini CLI (`mcp_config.json`)
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

#### D. Hermes Agent (`config.yaml`)
```yaml
mcp_servers:
  qa_11x:
    command: "npx"
    args: ["-y", "@sinfallas/mcp-qa-11x@latest"]
```

### 6.3. Catalog of Exposed MCP Resources (`blueprint://*`: 11 Static + 2 Templates = 13 Resources)

> `resources/list` returns the **11 static** URIs below, while `resources/templates/list` exposes the **2 dynamic `ResourceTemplate`** URIs (`blueprint://{stack}/readme` and `blueprint://ui/refactoring-ui/{topic}`).

| Resource URI | MIME Type | Operational Description |
| :--- | :--- | :--- |
| `blueprint://manifest` | `application/json` | Complete cryptographic manifest with SHA-256 hashes of all stacks and files. |
| `blueprint://core/philosophy` | `text/markdown` | Master prompt and Level-11X philosophy (`AI_MASTER_PROMPT.md`). |
| `blueprint://security/disa-owasp-22` | `text/markdown` | Technical synthesis of the 22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls (backed by 34 static scanner rules). |
| `blueprint://{stack}/readme` | `text/markdown` | *(Resource Template — `resources/templates/list`)* Operational guide and canonical file list for the requested hydratable stack (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`). |
| `blueprint://ui/refactoring-ui/{topic}` | `text/markdown` | *(Resource Template — `resources/templates/list`)* Tactical design guidelines and WCAG 2.1 AA contrast (`skill`, `hierarchy`, `layout`, `type`, `color`, `depth`, `images`, `polish`, `dark-mode`, `tailwind`). |
| `blueprint://core/active-task-template`| `text/markdown` | Canonical resilient logbook template for AI agents (`ACTIVE_TASK.md.example`). |
| `blueprint://core/cleanup-script` | `text/x-shellscript` | Universal safe cleanup and purge script without sudo (`scripts/limpieza.sh`). |
| `blueprint://core/roadmap-validator` | `text/x-python` | Roadmap consistency validation script (`verify_roadmap_consistency.py`). |
| `blueprint://database/postgres-rls-worm` | `text/markdown` | Canonical PostgreSQL 17 Multi-Transaction RLS (`after_begin`) and deterministic WORM forensic chain (`seq_num` + `pg_advisory_xact_lock`). |
| `blueprint://ai/evals-redteam` | `text/markdown` | Dual-mode DeepEval + Promptfoo OWASP LLM Top 10 blueprint (embedded offline fallback). |
| `blueprint://mobile-appium/readme` | `text/markdown` | Appium 3 / W3C + WebdriverIO Screenplay mobile blueprint (`sinfallas/base-mobile-appium:26`, `APPIUM_HOME`, biometry & permissions). |
| `blueprint://vibe-rescue/readme` | `text/markdown` | 5-stage *Vibe-to-Enterprise* protocol, RLS/WORM templates, and `VIBE-*` rules (`vibe-rescue/`). |
| `blueprint://skills/tactical-patterns-11x` | `text/markdown` | *(v3.1)* JIT tactical patterns (`<= 2.5 KB`, `CC <= 5`, `max-params: 4`, Port/Adapter, Outbox) supporting `?lang=es|en`. |

### 6.4. Catalog of MCP Tools (`Tools`)

| Tool | Primary Arguments | Operational Purpose |
| :--- | :--- | :--- |
| **`inspect_project_config`** | `project_path` | Audits present stacks (`python`, `fastapi`, `node`, `vue3`, `react`, `bash`, `php`, `ai-evals`, `mobile-appium`, `vibe-rescue`), linters, E2E readiness (`BrowserTestingReadiness`), and `update_available` status (`.qa-11x-version` + 24 h fail-open TTL cache). |
| **`fetch_blueprint_bundle`** | `stack`, `include_common_and_agents`, `include_content` | Fetches stack files on demand with SHA-256 cryptographic verification (supports lightweight index mode `include_content: false` saving ~50,000 tokens — see [`13_SPEC`](specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md)). |
| **`bootstrap_or_merge_11x`** | `project_path`, `stack`, `dry_run`, `create_backup` | Applies a non-destructive surgical merge injecting QA configs without altering dependencies (creates `.11x-backup` snapshots by default). |
| **`inspect_ast_blast_radius`** | `project_path`, `target_symbol`, `changed_since_ref`, `max_tokens_budget`, `max_items`, `auto_build_if_missing`, `refresh_graph` | Queries the AST graph (`graphify-out/graph.json` and `GRAPH_REPORT.md`) bidirectionally or differentially (`git diff` + AST + 4-level semantic pruning) for both Code Q&A and pre-refactor impact analysis (`LOW` with `< 5` callers for `MICRO_CHANGE`). |
| **`clean_workspace_11x`** | `project_path`, `dry_run`, `deep_prune` | Sanitizes temporary test artifacts and Docker caches (supports dry-run simulation and Alpine fallback). |
| **`audit_security_stig_owasp`**| `project_path`, `max_findings`, `include_examples` | Statically audits 34 static scanner rules (`SEC-01` to `SEC-16`, `SEC-CI-ACTION-REF`, `QA-*`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `UI-11X-01..03`) backing the 22 DISA ASD STIG V6R5 + OWASP v4.2 reference controls, with compact grouping (`groupFindingsByRule`) and `include_examples` opt-in. |
| **`run_ephemeral_qa`** | `project_path`, `stage`, `timeout_seconds`, `skip_if_docs_only` | Runs `Makefile` targets in ephemeral Docker under Rule Zero and condenses output to JSON (supports `skip_if_docs_only` and `BREAKER-42` circuit breakers). |
| **`certify_11x_gate`** | `project_path`, `require_lint_evidence`, `strict`, `allow_unmerged_examples` | Executes the closure certification gate (secrets, JSON, UI components, ORM, STIG, Dual-Consumer docs parity, lint evidence seal, and `update_available` notice). |
| **`audit_test_pyramid_gaps`** | `project_path`, `stack`, `max_items` | Statically audits the 13 layers of the 11X pyramid (`L01` to `L13`, including 3-Phase Temporal Cycle in `L13` and Dual Refresh in `L07`), detects orphan files, endpoints without BDD, views without E2E, and generates a prioritized rescue plan bounded by `max_items`. |
| **`init_or_append_agents_md`** | `project_path`, `dry_run`, `lang`, `agents` | Creates `AGENTS.md` or additively appends the QA 11X connector block (`--lang auto|es|en`, `--agents auto|all|<csv>`) and Thin-Repo bridges (`<= 15` lines) for 28 agents without overwriting prior rules. |
| **`propose_skill_evolution_pr`** | `project_path`, `target_blueprint_file`, `target_human_doc_file`, `target_mcp_component`, `improvement_title`, `empirical_rationale`, `proposed_content_or_snippet`, `proposed_human_doc_summary`, `dry_run`, `prefer_offline_fallback` | Proposes federated **Dual-Consumer** improvements (AI Skill + MCP Auditor + Human Manual in `docs/01..04_*.md`) to `qa-testing-blueprints` via authenticated local `gh` CLI or generates a local proposal with 3-layer matrix and prefilled GitHub URL. |
| **`reconcile_agents_governance`** | `project_path`, `dry_run` | Reconciles and deduplicates `.agents/` rules for adopting projects, pruning global directives already promoted to `qa-testing-blueprints`, isolating domain rules in `domain_<project>_rules.md`, and backing up in `.agents/backups/<timestamp>/`. |
| **`validate_calm_architecture`** | `workspaceRoot`, `architecturePath` | Validates **FINOS CALM** (*Architecture-as-Code*) schemas, 6 core nodes, 5 typed relationships, and 7 mandatory 11X controls. |
| **`evaluate_release_gate`** | `workspaceRoot`, `scope`, `dryRun`, `enforce`, `junitXmlPath`, `telemetryJsonPath`, `defectsJsonPath`, `thresholds` | Computes quantitative `GO`/`NO_GO` verdicts (`>= 95%` coverage, Trivy `HIGH/CRITICAL = 0`, MSI, CALM, STIG; returns fail-closed `SKIPPED` on `smoke`). |
| **`evaluate_agent_trajectory`** | `mode`, `workspaceRoot`, `testPath`, `steps`, `requiredSequence`, `actualOutput`, `retrievalContext`, `enforceAstBeforeEdit`, `timeoutMs` | Evaluates multi-step AI agent trajectories in deterministic offline mode (`AST-First`, hallucination rates, `QA-GIT-GATE-01`) or DeepEval in Docker. |
| **`run_llm_red_team`** | `mode`, `workspaceRoot`, `configPath`, `timeoutMs` | Audits Promptfoo **OWASP LLM Top 10** configs, `promptGuard` probes, and conditional Docker red-teaming (`SKIPPED_MISSING_CREDENTIALS` without keys). |
| **`audit_vibe_prototype`** | `targetDir`, `workspaceRoot`, `dryRun`, `remediationSubdir`, `maxLines`, `enforce` | Inspects AI-generated scaffolds (`Bolt.new`, `Lovable`, `v0`, `Replit`) for `VIBE-SEC-001..QA-005` risks, secret leaks, and missing RLS/WORM. |
| **`sync_enterprise_tms`** | `mode`, `provider`, `targetDir`, `junitXmlPath`, `baseUrl`, `projectKey`, `issueKey`, `testExecutionKey`, `repo`, `requiredKeys`, `dryRun`, `timeoutMs`, `workspaceRoot` | Validates `@JIRA`/`@TC` traceability inventories and pushes JUnit XML results to **Jira**, **Zephyr Scale**, **Xray**, or **GitHub Issues** guarded by `TaskStateGuard` and anti-SSRF. |
| **`session_flight_recorder`** | `project_path`, `action`, `task_id`, `active_step`, `intent_140chars`, `completed_steps`, `planned_steps`, `allowed_globs`, `forbidden_globs`, `reason` | *(v3.1)* Atomic Flight Recorder (`save` \| `recover` \| `clear`) managing `.agents/.cache/session_checkpoint.json` (`0600`) -> deterministic `<= 40`-line `.agents/ACTIVE_TASK.md` projection + live Git cross-check. |

### 6.5. Global Auto-Sync on Startup, `update_available` Detection, and Cryptographic Validation

Introduced in `v2.20.0` (and active in `v3.1.0`), `@sinfallas/mcp-qa-11x` includes three automatic lifecycle mechanisms:
1. **`.qa-11x-version` Stamp:** `install-skill` (both via CLI and `scripts/install-skill.sh`) stamps `.qa-11x-version` inside skill directories and `<project>/.agents/.qa-11x-version` when installing `--include-scripts`.
2. **Silent Background Auto-Sync (`stdio`):** On every startup of the MCP server over `stdio`, it non-blockingly syncs (verifying `ETag` + `SHA-256` against `manifest.json`) already-installed global skills (`~/.gemini`, `~/.claude`, `~/.cursor`, `~/.codeium/windsurf`, `~/.codex`, `~/.hermes`) while preserving the language configured in `~/.gemini/GEMINI.md`.
3. **Structured `update_available` Notice (24 h TTL *Fail-Open*):** `inspect_project_config` and `certify_11x_gate` return `update_available` so the assistant itself notifies you in chat if the MCP server, global skills, or local project scripts need updating.

If you also want to force-purge `npx` (`~/.npm/_npx`) and blueprint (`~/.cache/qa-11x-blueprints`) caches manually, follow this protocol:

#### 1. Cache Purge and Full Rehydration
```bash
# A. Global IDE update (Antigravity, Claude, Cursor, Hermes) from $HOME or any folder:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill

# B. Update inside a project root directory (global IDEs + project AGENTS.md, .agents/, and scripts/):
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts
```

#### 2. Restarting the MCP Server in the IDE
* **Google Antigravity:** Open **`...` (Additional Options) > MCP Servers**, select **`qa-11x`**, and click **Restart / Refresh** (or run `Ctrl+Shift+P` -> **`Developer: Reload Window`**).
* **Cursor / Claude Desktop:** Run `Developer: Reload Window` or restart the application to spawn the new `npx` process.

#### 3. Version and SHA-256 Integrity Validation Commands (`DISA STIG V-222513`)
To verify that both the MCP server binary and the cached 11 modular Skills and documentation match the latest published release:

```bash
# 1. Compare published npmjs version against the version installed in npx cache:
npm view @sinfallas/mcp-qa-11x version
grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

# 2. Check the manifest version and UTC timestamp in the local cache:
grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json

# 3. Validate inside ephemeral Docker (Rule Zero) that every Skill SHA-256 matches manifest.json:
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$(pwd):/app:ro" -w /app \
  -v "${HOME}/.cache/qa-11x-blueprints:/cache:ro" \
  -v "${HOME}/.gemini/config/skills:/skills:ro" \
  sinfallas/base-python-uv:3.15 python3 -c '
import hashlib, json, pathlib
m = json.loads(pathlib.Path("/cache/manifest.json").read_text(encoding="utf-8"))
skills = [f for f in m["agent_governance_files"] if f["path"].startswith(".agents/skills/")]
dest = pathlib.Path("/skills")
ok = sum(1 for s in skills if (p := dest / s["path"].replace(".agents/skills/", "", 1)).exists() and hashlib.sha256(p.read_bytes()).hexdigest() == s["sha256"])
ver = m["blueprint_version"]
print(f"✔ Skills in {dest}: {ok}/{len(skills)} files match manifest.json bit-for-bit (v{ver})")
'
```
