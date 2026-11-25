<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/README.es.md)

# `@sinfallas/mcp-qa-11x` — Official MCP Server & Skill Installer for QA Testing Blueprints

[![npm version](https://img.shields.io/npm/v/%40sinfallas%2Fmcp-qa-11x)](https://www.npmjs.com/package/@sinfallas/mcp-qa-11x)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/LICENSE)

Official Model Context Protocol (**MCP**) server and zero-friction CLI installer for [**QA Testing Blueprints (QA-11X v3.7 — v3.7.0)**](https://github.com/tecno-consultores/qa-testing-blueprints).

Designed for AI coding agents (**Google Antigravity**, **Claude Code / Desktop**, **Cursor**, **Windsurf**, **OpenAI Codex CLI**, **VS Code Copilot**, **Hermes Agent**, and **28 agents**) to onboard repositories in **< 30 seconds**, audit **19 MCP tools**, query **13 cryptographic `blueprint://*` resources** (11 static URIs + 2 URI templates), and enforce ephemeral **Docker Rule Zero**, **DISA ASD STIG V6R5**, **OWASP v4.2**, **FINOS CALM**, and **Dual-Mode AI Evals** without cloning the full blueprints repository.

**Prerequisites:** **Node.js >= 24.0.0** and **Docker** (for ephemeral Rule Zero QA execution via `run_ephemeral_qa` and live AI evals).

---

## ⚡ 30-Second Quickstart & CLI Subcommands

### 1. Zero-Friction Project Onboarding (`quickstart`)
```bash
npx -y @sinfallas/mcp-qa-11x@latest quickstart
# Optional progressive tiers, language & CI scaffold:
npx -y @sinfallas/mcp-qa-11x@latest quickstart --tier standard --lang en --agents auto --ci github
```

### 2. Full Thin-Repo Skill & Connector Sync (`install-skill`)
```bash
# Install global skills, operational scripts, and thin AGENTS.md connector (auto-detects IDEs):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile
```

Available CLI commands & flags (**12 CLI subcommands**):
- `quickstart [dir] [-T|--tier starter|standard|enterprise] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--ci github|none] [--force|-f] [--dry-run] [--json] [--help|-h]` — Auto-detects stack (FastAPI, Python, Node, Vue 3, React, PHP, Bash, Mobile, AI Evals, Vibe) and scaffolds QA-11X configs.
- `install-skill` (alias: `install`) `[--target|-t auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--project-path|--dir|-p <dir>] [--init-agents] [--include-scripts] [--reconcile] [--dry-run] [--help|-h]` — Defaults to `--target auto` and `--lang auto` when `--init-agents` is set; runs in safe global `$HOME` mode when invoked from `$HOME` without explicit `--project-path`/`--dir`/`-p` (installing global skills only and skipping project writes, while explicit `-p ~`/`--dir ~` stays blocked by `SEC-PATH-01`).
- `init-agents` (alias: `init-agents-md`) `[dir] [--project-path|--dir|-p <dir>] [--lang|-l auto|en|es] [--agents|-a auto|all|<csv>] [--dry-run] [--help|-h]` — Defaults to `--lang auto` (*Dynamic Language Mirroring*).
- `reconcile-agents [dir] [--project-path|--dir|-p <dir>] [--scan-workspaces <dir>] [--apply] [--prune-bridges] [--allow-dirty] [--dry-run] [--json] [--help|-h]` — Deduplicates global rules/skills out of `.agents/` and isolates domain rules with backups.
- `tms-sync --mode <inventory|push-results|pull-stories> --provider <jira|zephyr|xray|github-issues> [--target-dir <dir>] [--junit-xml <path>] [--base-url <https://...>] [--project-key <key>] [--issue-key <key>] [--test-execution-key <key>] [--repo <owner/repo>] [--required-keys <k1,k2>] [--timeout-ms <ms>] [--dry-run|--live] [--json] [--help|-h]` — Normalizes JUnit XML results into enterprise TMS payloads or pull/inventory traceability reports.
- `doctor` (alias: `status`) `[dir] [--project-path|--dir|-p <dir>] [--offline] [--json] [--lang|-l en|es] [--help|-h]` — Inspects active binary origin, `~/.npm/_npx` caches, global skills stamps, IDE MCP configs (Antigravity `~/.gemini/antigravity/mcp_config.json` + `~/.gemini/config/mcp_config.json` fallback, VS Code `mcp.json`, Gemini CLI `~/.gemini/settings.json`, multi-OS Claude Desktop `claude_desktop_config.json`, Claude Code `~/.claude.json`, Cursor, Windsurf, Codex `~/.codex/config.toml` TOML, and Hermes `~/.hermes/mcp.json` / `~/.hermes/config.yaml` YAML), project readiness (or global `$HOME` scope when `cwd == $HOME` without explicit dir, while keeping `-p ~`/`--dir ~` blocked), and Docker daemon.
- `upgrade` (alias: `cache-clean`) `[--cache-only] [--reconcile] [--target|-t <env>] [--offline] [--dry-run] [--json] [--lang|-l en|es] [--help|-h]` — Surgically removes only `@sinfallas/mcp-qa-11x` entries in `~/.npm/_npx` plus `~/.cache/qa-11x-blueprints`, reconciles `.agents/` governance (`--reconcile`), and re-syncs global skills (`cache-clean` runs with `--cache-only`).
- `certify [dir] [--project-path|-p <dir>] [--strict] [--require-lint-evidence|--no-require-lint-evidence] [--allow-unmerged-examples] [--release-gate] [--junit-xml <path>] [--offline] [--json] [--lang|-l en|es] [--help|-h]` — Runs the headless 10-check 11X gate with `requireLintEvidence: true` by default (aligned with `certify_11x_gate`; pass `--no-require-lint-evidence` to opt out, `exit 20` on `--strict` skipped checks) and optional Release Readiness gate (`exit 30` on `NO_GO`).
- `audit [dir] [--project-path|-p <dir>] [--mode|-m security|pyramid|vibe|calm|all] [--format|-f text|json|sarif] [--json] [--sarif] [--fail-on critical|high|medium|any|none] [--include-examples] [--max-findings <n>] [--architecture-path <rel>] [--profile auto|generic|qa-11x-self] [--lang|-l en|es] [--help|-h]` — Executes deterministic Zero-LLM static audits with text, JSON, or SARIF v2.1.0 output for CI/CD.
- `blast-radius [symbol] [--symbol|-s <symbol>] [--project-path|-p <dir>] [--changed-since <ref>] [--auto-build] [--refresh] [--git-signals] [--max-tokens <n>] [--max-items <n>] [--json] [--lang|-l en|es] [--help|-h]` — Inspects bidirectional AST impact, git churn/coupling signals (`--git-signals`), and differential PR routing (`DOCS_ONLY` | `MICRO_CHANGE` | `FULL_11X`).
- `mcp-config [--client|-c antigravity|claude-code|claude-desktop|cursor|vscode|windsurf|codex|gemini-cli|hermes|all] [--print] [--install] [--pin-version|--latest] [--dry-run] [--json] [--lang|-l en|es] [--help|-h]` — Prints or safely merges `mcpServers` JSON/TOML configs pinned to the active version (`@sinfallas/mcp-qa-11x@<version>`) by default (pass `--latest` to opt into the floating tag), resolving Antigravity, VS Code, Gemini CLI, Claude Desktop multi-OS, and Hermes with `.11x-backup` (`0600`) or native IDE CLI commands.
- `completion <fish|bash|zsh>` (or `--shell <fish|bash|zsh>`) `[--lang|-l en|es] [--help|-h]` — Emits native shell autocompletion scripts for `mcp-qa-11x` generated from the single declarative CLI catalog (`commandCatalog.ts`).
- `[--stdio]` — Explicitly forces raw JSON-RPC listener over `stdio` (`QA_FORCE_STDIO=1` also forces headless `stdio`).
- `--version` / `-v` `[--verbose|--json]` | `--help` / `-h` `[--lang|-l en|es]` (`QA_OUTPUT_LANG`) — Prints active SemVer or bilingual EN/ES CLI help governed by `--lang` / `QA_OUTPUT_LANG` (Spec 19 English default). Supported globally and per subcommand without writing or fetching.

> **Interactive Terminal Guard (`QA-CLI-TTY-01`):** Invoking `npx -y @sinfallas/mcp-qa-11x@latest` directly in an interactive terminal (`process.stdin.isTTY`) prints usage options, syncs global skills safely, and exits cleanly with `exit(0)` in `< 5s` instead of hanging `stdin`. Non-TTY IDE pipes launch the MCP `stdio` server automatically.

---

## 🔌 IDE & AI Agent Registration

* **Claude Code CLI:**
  ```bash
  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
* **VS Code / Copilot:**
  ```bash
  code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
  ```
* **Antigravity (`~/.gemini/antigravity/mcp_config.json`, fallback `~/.gemini/config/mcp_config.json`) / Cursor (`~/.cursor/mcp.json`) / Claude Desktop (`claude_desktop_config.json` multi-OS) / Windsurf (`~/.codeium/windsurf/mcp_config.json`) / Hermes (`~/.hermes/mcp.json` vs `~/.hermes/config.yaml` YAML) (`mcpServers` JSON):**
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

* **Auto-generate or safely merge client configs (`mcp-config`):**
  ```bash
  npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client antigravity --install
  # Preview all supported IDE/CLI snippets or pin the exact release:
  npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client all --print --pin-version
  ```

See the full 28 client setup matrix in [`docs/agent-setup.md`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/agent-setup.md).

---

## 🛡️ Security & Lifecycle Runtime Guards (v3.7.0)

* **Fail-Closed `promptGuard` Interceptor:** Wraps `tools/call` across all 19 tools with Unicode `NFKC` canonicalization, zero-width / Trojan Source stripping, prompt-injection & `QA-GIT-GATE-01` (`git push` / `npm publish`) bypass blocking, and PII / secret redaction before dispatching handlers.
* **`SEC-PATH-01` Workspace Path Confinement (`QA11X_WORKSPACE_ROOTS`):** Validates `project_path`, `workspaceRoot`, and `targetDir` via `resolveSafeProjectPath`, blocking directory traversal (`..`), NUL bytes, symlinks outside allowed roots, critical system paths (`/`, `/etc`, `/usr`, ...), `$HOME`, and bare `os.tmpdir()`. Set `QA11X_WORKSPACE_ROOTS` (delimiter-separated paths) to authorize additional workspace roots outside `process.cwd()`.
* **Docker Anti-Saturation & CrashLoop Guardrails (`QA-DOCKER-LOOP-01`):** `run_ephemeral_qa` enforces an atomic cross-process FIFO slot lock (`QA_MAX_CONCURRENT_CONTAINERS=1`, `COMPOSE_PARALLEL_LIMIT=1`), passive Linux RAM (`< 12%`) and ACPI thermal (`>= 85°C`) guardrails (`exit_code = 75`, exempt from `BREAKER-42`), pre-flight CrashLoop detection (auto-stops workspace `restarting` containers; fails fast on foreign CrashLoops), and guaranteed Compose teardown on timeout/abort. `qa-11x doctor` reports `docker_health` (CrashLoops, custom bridge networks, NetworkManager `veth*` rule, temp/RAM).
* **`TaskStateGuard` & `Fail-Verbose` Diagnostics:** Bounds concurrent MCP tool execution capacity, isolates hung/broken tasks with explicit timeouts (`60s` standard / `>= 180s` heavy transfers), purges 0-byte failed transfer artifacts, bounds interactive TTY skill auto-sync (`< 5s` fail-open to `stderr`), and formats actionable Allure-ready `Fail-Verbose` reports (`diagnosticFormatter.ts`).
* **Offline & Local LLM A2A Card (`@sinfallas/mcp-qa-11x/agent-card`):** Supports air-gapped Ollama / vLLM evaluators and exposes the public ESM subpath export `@sinfallas/mcp-qa-11x/agent-card` (`package.json#exports` -> `dist/a2a/agentCard.js`, implemented in [`src/a2a/agentCard.ts`](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/mcp-server/src/a2a/agentCard.ts), `v3.7.0`) as a **programmatic library module** (not exposed as a public MCP tool or resource over `stdio`).

---

## 🤖 11 Modular Skills (`< 20 KB` Token Budget)

Led by `qa-11x-architect` (`< 12 KB`), loading 10 specialized sub-skills on demand:
`qa-11x-architect`, `qa-11x-docker-certifier`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `refactoring-ui`, and JIT `tactical-patterns-11x` (`<= 2.5 KB`).

---

## 🛠️ MCP Tools (19 Tools — v3.7)

1. **`inspect_project_config`:** Inspects stack markers (`pyproject.toml`, `package.json`, `composer.json`), `docker-compose.qa.yml`, test pyramid status, and Graphify AST graph health.
2. **`fetch_blueprint_bundle`:** Streams requested blueprint files from GitHub/local mirror verifying SHA-256 checksums against `manifest.json`.
3. **`bootstrap_or_merge_11x`:** Scaffolds or merges `.example` QA configs, Dockerfiles, Make targets, and workflows safely with `.11x-backup` (`dry_run` defaults to `true`; pass `dry_run: false` to apply disk writes).
4. **`inspect_ast_blast_radius`:** Bidirectional and differential AST dependency lookup (`declaring_files`, callers, callees, `changed_since_ref` blast scope, risk level `LOW`/`MEDIUM`/`HIGH`) with optional Graphify rebuild (`auto_build_if_missing`).
5. **`clean_workspace_11x`:** Safely purges root-owned Docker/cache/build artifacts using Alpine ephemeral fallback without `sudo`, stops workspace `status=restarting` CrashLoop containers (`found_containers`/`removed_containers`), and prunes orphan Compose networks.
6. **`audit_security_stig_owasp`:** Scans target files across **22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 37 static scanner rules** (`SEC-01..SEC-16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-*`, `QA-DOCKER-LOOP-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `QA-STRYKER-CFG-01`, `UI-11X-01..03`) with configurable `max_findings` and optional `include_examples: true` auditing of `.example` templates.
7. **`run_ephemeral_qa`:** Executes any of the **16 QA stages** (`lint`, `unit`, `migration`, `integration`, `ci`, `parity`, `orphans`, `contracts`, `bdd`, `mutation`, `dast`, `e2e`, `perf`, `chaos`, `profile`, `all`) strictly inside serialized ephemeral Docker containers (`Rule Zero`, `QA_MAX_CONCURRENT_CONTAINERS=1`, `COMPOSE_PARALLEL_LIMIT=1`), enforcing thermal/RAM (`exit_code=75`), CrashLoop pre-flight, Compose abort teardown, and `DOCS_ONLY` fast-path.
8. **`certify_11x_gate`:** Runs the 10-check QA-11X certification gate (unmerged `.example`, secrets, JSON integrity, orphan UI/API, ORM/Alembic parity, AST topology, lint evidence, STIG/OWASP, docs/manifest/roadmap) plus version update checks, `strict` mode, and `allow_unmerged_examples` opt-in.
9. **`audit_test_pyramid_gaps`:** Audits projects against the 13 layers of the 11X pyramid (`L01`–`L13`), detecting 3-phase temporal gaps and dual refresh omissions.
10. **`init_or_append_agents_md`:** Injects or updates idempotently bounded `AGENTS.md` / IDE connector blocks using `start/end` HTML markers (`dry_run` defaults to `true`; pass `dry_run: false` to apply writes).
11. **`propose_skill_evolution_pr`:** Generates Dual-Consumer QA-escape evolution proposals (AI rules + MCP + EN/ES docs in `docs/01..05_*.md`), adhering to `QA-GIT-GATE-01` (`dry_run` and `prefer_offline_fallback` default to `true`).
12. **`reconcile_agents_governance`:** Deduplicates promoted global skills/rules out of consumer `.agents/` and isolates domain rules into `.agents/rules/domain_<project>_rules.md` (`dry_run` defaults to `true`; pass `dry_run: false` to apply changes).
13. **`validate_calm_architecture` *(v2.0)*:** Validates **FINOS CALM** JSON architecture-as-code schemas (`profile`: `auto` | `generic` | `qa-11x-self`), typed relationships, and upstream 6-node / 5-edge / 7-control 11X governance when targeting the QA-11X model.
14. **`evaluate_release_gate` *(v2.0)*:** Computes quantitative Release Readiness `GO` / `NO_GO` verdicts from 3 operational signals — JUnit XML test pass rate, observability telemetry (error rate %, p95/p99 latency, active incidents), and open defects / QA escapes (`open_blockers`, `open_criticals`, `qa_escapes`) — returning fail-closed `SKIPPED` in `smoke` mode.
15. **`evaluate_agent_trajectory` *(v2.0)*:** Evaluates multi-step AI agent tool trajectories offline (`AST-First` precedence, compilation/regeneration/hallucination rates, `QA-GIT-GATE-01` compliance) or via DeepEval in ephemeral Docker.
16. **`run_llm_red_team` *(v2.0)*:** Audits **OWASP LLM Top 10** promptfoo suites, `promptGuard` adversarial probes, and executes live Promptfoo red-teaming when provider credentials are present (`SKIPPED_MISSING_CREDENTIALS` fail-closed otherwise).
17. **`audit_vibe_prototype` *(v2.0)*:** Audits AI-generated prototypes (Bolt.new, Lovable, v0, Replit) for `VIBE-SEC-001..QA-005` risks, hardcoding, missing RLS/WORM, and `dryRun` remediation plans.
18. **`sync_enterprise_tms` *(v2.0)*:** Synchronizes bidirectional traceability (`inventory`, `push-results`, `pull-stories`) using JUnit XML against enterprise Test Management Systems (**Jira**, **Zephyr Scale**, **Xray**, **GitHub Issues**) with `TaskStateGuard` retry protection (`dryRun` defaults to `true`).
19. **`session_flight_recorder` *(v3.1)*:** Manages the atomic JSON Flight Recorder (`.agents/.cache/session_checkpoint.json` `0600` -> deterministic `<= 40`-line `.agents/ACTIVE_TASK.md` projection + live Git cross-check via `save` | `recover` | `clear`).

---

## 📚 MCP Resources (13 Resources: 11 Static URIs + 2 URI Templates — v3.7)

> **Surface Breakdown:** **11 static URIs** returned by `resources/list` + **2 URI templates** (`blueprint://{stack}/readme`, `blueprint://ui/refactoring-ui/{topic}`) returned by `resources/templates/list`.

1. **`blueprint://manifest`:** Real-time SHA-256 index (`manifest.json`) tracking blueprint artifacts across all supported stacks.
2. **`blueprint://core/philosophy`:** Level-11X 13-layer pyramid specification, Rule Zero, 10 Laws, and 11 Anti-Blindness UAT Rules.
3. **`blueprint://security/disa-owasp-22`:** Catalog of 22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls + 37 static scanner rules.
4. **`blueprint://database/postgres-rls-worm`:** PostgreSQL 17 multi-transaction RLS (`after_begin`) + deterministic WORM audit chain (`seq_num` + `pg_advisory_xact_lock`).
5. **`blueprint://{stack}/readme` *(URI Template)*:** Operational QA guides across all **10 stacks**: `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, and `vibe-rescue`.
6. **`blueprint://ui/refactoring-ui/{topic}` *(URI Template)*:** Tactical UI design, `tabular-nums`, OKLCH WCAG 2.1 AA, dark mode, and Anti-JSDOM geometry guides.
7. **`blueprint://core/active-task-template`:** Canonical compact session diary template (`.agents/ACTIVE_TASK.md.example`, `<= 40` lines).
8. **`blueprint://core/cleanup-script`:** Canonical non-root Docker cleanup script (`limpieza.sh`) with Alpine fallback.
9. **`blueprint://core/roadmap-validator`:** Bidirectional consistency verifier (`.agents/scripts/verify_roadmap_consistency.py`).
10. **`blueprint://ai/evals-redteam` *(v2.0)*:** Dual-mode DeepEval & Promptfoo OWASP LLM Top 10 blueprint (with embedded offline fallback).
11. **`blueprint://mobile-appium/readme` *(v2.0)*:** Appium 3 / W3C + WebdriverIO Screenplay & biometric/permission QA blueprint (`mobile-appium/`).
12. **`blueprint://vibe-rescue/readme` *(v2.0)*:** 5-stage Vibe-to-Enterprise rescue blueprint, PostgreSQL 17 RLS/WORM templates, and `VIBE-*` hardening rules.
13. **`blueprint://skills/tactical-patterns-11x` *(v3.1)*:** JIT tactical design patterns (`<= 2.5 KB`, `CC <= 5`, `SonarJS <= 15`, `max-params: 4`, offline Port/Adapter, Transactional Outbox) with `?lang=es|en` and offline fallback.

---

> **Clean-Room E2E Verification (`example/` + `verify-v2.sh`):** Every release is certified in an ephemeral non-root Docker container (`./scripts/probar-mcp-example.sh` / `pnpm run test:example`), packing `@sinfallas/mcp-qa-11x` with `npm pack`, installing the `.tgz` into an isolated clean-room workspace in `/tmp`, and asserting **all 12 CLI subcommands** (`quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`), `QA-CLI-TTY-01`, all **13 resources** (11 static + 2 templates), **19 tools**, `promptGuard`, and hybrid `FastAPI + Vue 3` integration end-to-end before local certification.
