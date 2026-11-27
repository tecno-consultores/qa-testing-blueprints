> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](agent-setup.es.md)

# 🤖 Agent Setup & Integration Guide — QA 11X MCP Server & Skills

This guide provides step-by-step instructions to configure **`@sinfallas/mcp-qa-11x`**, its **28 declarative AI agent connectors**, bilingual MCP resource negotiation (`?lang=es|en`), and the **corporate QA-11X skills** (including mobile E2E testing on `sinfallas/base-mobile-appium:26`) across IDEs, CLIs, autonomous agents, and vibe-coding environments.

> [!IMPORTANT]
> **Mandatory Host Prerequisite (`Rule Zero`):** An active **Docker Engine** is strictly required on every machine running `qa-11x` (`qa-11x doctor` exits `1` if the Docker daemon is unavailable). `qa-11x` automatically detects Companion MCPs in your IDE (`Playwright`/`Chrome DevTools` for live DOM, `Semgrep`/`SonarQube`/`Snyk` for deep taint SAST, `Trivy` for CVE/IaC, `Serena` for live LSP refactoring, `Appium` for mobile); whenever a Companion MCP is absent, any external scanner CLI fallback runs **strictly inside non-root ephemeral Docker containers** (`--rm --restart=no --network none`) serialized under `QA_MAX_CONCURRENT_CONTAINERS=1`. Use `--toolset core|auto|full` (or `QA_11X_TOOLSET`) on small-context clients to expose only the 9 core tools (`core`, including `audit_test_pyramid_gaps`) or stack-matched tools (`auto`).

---

## 📋 Step 1: Universal Installation of Skills, Connectors (`AGENTS.md`), and Language Policy (`--lang auto|es|en`)

Before registering the MCP server in your AI assistant, initialize governance and Thin-Repo bridge files at your project root:

```bash
# 1. Auto-detect installed project agents and inject English directives:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents auto

# 2. Use Dynamic Language Mirroring (default `auto` — mirrors prompt & README/CHANGELOG language) or force Spanish (`--lang es`):
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang auto

# 3. Target explicit agent bridges (e.g. GitHub Copilot, Cursor, Claude Code) in English:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents copilot,cursor,claude-code

# 4. Install verified SHA-256 skills (DISA STIG V-222513), scripts, and multi-agent connectors together:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --lang en --agents auto --include-scripts --reconcile
```

> [!NOTE]
> - **Language Policy (`--lang auto|es|en`):** Both `init-agents` and `install-skill --init-agents` default to `--lang auto` (*Dynamic Language Mirroring*, mirroring the user's prompt language and the existing language of `README.md`/`CHANGELOG.md`), while also supporting explicit `--lang es` and `--lang en` and keeping internal `.agents/` directives in concise technical English. Re-running `init-agents` (`[dir] [--project-path|--dir|-p <dir>] [--lang|-l auto|es|en] [--agents|-a auto|all|<csv>] [--dry-run]`) with a different `--lang` updates only the delimited QA-11X connector block idempotently without altering custom project rules.
> - **Additional Thin-Repo & Traceability Flags:** `install-skill` (`install`) accepts `[--target|-t <env>] [--lang|-l auto|es|en] [--agents|-a <spec>] [--project-path|-p <dir>] [--init-agents] [--include-scripts] [--reconcile] [--dry-run]`, supporting global skill targets (`antigravity`, `gemini-cli`, `claude`, `cursor`, `windsurf`, `codex`, `hermes`, `opencode`, `copilot`, `agents` -> `~/.agents/skills`), updating all detected `$HOME` connectors (`.gemini/GEMINI.md`, `.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.codeium/windsurf/memories/global_rules.md`, `.config/opencode/AGENTS.md`, `.config/zed/AGENTS.md`), preserving existing connector language when `--lang` is omitted, pruning retired canonical skill files, and protecting customized `scripts/*` (writing `.11x-incoming` + recommending `.agents/limpieza.local.sh`). `reconcile-agents` accepts `[dir] [--project-path|--dir|-p <dir>] [--scan-workspaces <dir>] [--apply] [--allow-dirty] [--prune-bridges] [--dry-run] [--json]` (conservatively pruning 100% promoted/canonical duplicates while preserving hybrid sections for manual review, consolidating loose backups, patching `.gitignore`, and scanning multi-repo workspaces safely in read-only `--dry-run` by default). `tms-sync` supports `--mode <inventory|push-results|pull-stories> --provider <jira|zephyr|xray|github-issues> [--target-dir <dir>] [--junit-xml <path>] [--base-url <https://...>] [--project-key <key>] [--issue-key <key>] [--test-execution-key <key>] [--repo <owner/repo>] [--required-keys <k1,k2>] [--timeout-ms <ms>] [--dry-run|--live] [--json]`.
> - **Bilingual MCP Resource Negotiation (`?lang=es|en`):** MCP `blueprint://*` URIs support `?lang=en` (canonical English, default) and `?lang=es` (1:1 Spanish `.es.md` mirror fallback, e.g., `blueprint://mobile-appium/readme?lang=es` for `sinfallas/base-mobile-appium:26`).
> - **Thin-Repo Bridge Architecture (`--agents <csv|auto|all>`):** Instead of duplicating large rulebooks into every tool folder, each bridge file is kept strictly `<= 15` lines and points directly to `AGENTS.md` (including valid `.mdc` frontmatter for Cursor and non-duplicating `read:` YAML syntax for `.aider.conf.yml`), with path-traversal protection and `--dry-run` simulation support.
> - **Human-Confirmed Push Guard (`QA-GIT-GATE-01`):** Generated connectors enforce local certified `git commit` closure and prohibit automatic `git push` or `npm publish` without explicit human authorization.

### 🌐 Declarative Matrix of 28 Supported AI Coding Agents (`--agents`)

| Agent ID (`--agents`) | Assistant / Environment | Category | Generated Bridge File | Verified Integration Scope | Auto-Detection Markers (`--agents auto`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `antigravity` | Google Antigravity IDE | IDE | `AGENTS.md` | Full (Bridge + Global Skills + `$HOME` Connector + `mcp-config`/`doctor`) | `.gemini`, `.idx` |
| `claude-code` | Claude Code CLI | CLI | `CLAUDE.md` | Full (Bridge + Global Skills + `$HOME` Connector + `mcp-config`/`doctor` + Plugin) | `CLAUDE.md`, `.claude` |
| `claude-desktop` | Claude Desktop | Desktop | `AGENTS.md` | Bridge + `mcp-config`/`doctor` (multi-OS JSON) | `.mcp.json` |
| `cursor` | Cursor IDE | IDE | `.cursor/rules/qa-11x.mdc` (`.mdc` frontmatter) | Full (Bridge + Global Skills + `mcp-config`/`doctor`) | `.cursor`, `.cursorrules` |
| `windsurf` | Windsurf (Codeium) | IDE | `.windsurfrules` *(legacy; `.windsurf/rules/` also compatible)* | Full (Bridge + Global Skills + `$HOME` `global_rules.md` + `mcp-config`/`doctor`) | `.windsurfrules`, `.windsurf`, `.codeium` |
| `copilot` | GitHub Copilot (VS Code) | IDE | `.github/copilot-instructions.md` | Bridge + Global Skills (`~/.copilot/skills`) + `mcp-config --client vscode` / `doctor` | `.github`, `.vscode` |
| `codex` | OpenAI Codex CLI | CLI | `AGENTS.md` | Full (Bridge + Global Skills + `$HOME` Connector + TOML `mcp-config`/`doctor`) | `.codex` |
| `gemini-cli` | Google Gemini CLI | CLI | `GEMINI.md` | Full (Bridge + Global Skills `~/.gemini/skills` + `$HOME` Connector + `mcp-config`/`doctor`) | `GEMINI.md`, `.gemini` |
| `gemini-code-assist` | Gemini Code Assist | IDE | `.gemini/styleguide.md` | Bridge + shared `.gemini/` skills & IDE MCP | `.gemini` |
| `cline` | Cline (VS Code / CLI) | IDE | `.clinerules` | Bridge + `mcp-config --client cline` / `doctor` (`cline_mcp_settings.json`) | `.clinerules`, `.cline` |
| `roo-code` | Roo Code | IDE | `.roo/rules/qa-11x.md` | Bridge + `mcp-config --client roo-code` / `doctor` (`rooveterinaryinc.roo-cline`) | `.roo`, `.roorules` |
| `aider` | Aider CLI | CLI | `.aider.conf.yml` (`read: AGENTS.md`) | Declarative YAML Bridge *(no native stdio MCP registry)* | `.aider.conf.yml`, `.aiderignore` |
| `continue` | Continue.dev | IDE | `.continue/rules/qa-11x.md` | Bridge + YAML `mcp-config --client continue` / `doctor` (`.continue/mcpServers/qa-11x.yaml`) | `.continue`, `.continuerules` |
| `zed` | Zed Editor AI | IDE | `.rules` | Full (Bridge + `$HOME` `~/.config/zed/AGENTS.md` + `context_servers` `mcp-config`/`doctor`) | `.zed`, `.rules` |
| `devin` | Devin Autonomous Agent | Autonomous | `AGENTS.md` | Bridge + `mcp-config --client devin` / `doctor` (`mcp_config.json`) | `.devin` |
| `cody` | Sourcegraph Cody | IDE | `.sourcegraph/qa-11x.rule.md` | Declarative Bridge *(enterprise/IDE settings)* | `.sourcegraph` |
| `amazon-q` | Amazon Q Developer | IDE | `.amazonq/rules/qa-11x.md` | Bridge + `mcp-config --client amazon-q` / `doctor` (`~/.aws/amazonq/mcp.json`) | `.amazonq` |
| `jetbrains-ai` | JetBrains AI / Junie | IDE | `.junie/guidelines.md` | Bridge + `mcp-config --client jetbrains-ai` / `doctor` (`~/.junie/mcp/mcp.json` + GUI) | `.junie`, `.idea` |
| `augment` | Augment Code | IDE | `.augment/rules/qa-11x.md` | Bridge + `mcp-config --client augment` / `doctor` (`~/.augment/settings.json`) | `.augment` |
| `trae` | Trae IDE | IDE | `.trae/rules/qa-11x.md` | Bridge + `mcp-config --client trae` / `doctor` (`.trae/mcp.json`) | `.trae` |
| `hermes` | Hermes Agent | Autonomous | `AGENTS.md` | Bridge + Global Skills (`~/.hermes/skills`) + `mcp-config`/`doctor` (`mcp.json` & `config.yaml`) | `.hermes` |
| `opencode` | OpenCode CLI | CLI | `AGENTS.md` | Full (Bridge + Global Skills + `$HOME` Connector + official `mcp.qa-11x` `mcp-config`/`doctor`) | `opencode.json`, `.opencode` |
| `goose` | Block Goose | CLI | `.goosehints` | Bridge + YAML `mcp-config --client goose` / `doctor` (`config.yaml` `extensions:`) | `.goosehints`, `.goose` |
| `kilo-code` | Kilo Code | IDE | `.kilocode/rules/qa-11x.md` | Bridge + `mcp-config --client kilo-code` / `doctor` (`kilocode.kilo-code` & `kilo.jsonc`) | `.kilocode` |
| `bolt` | Bolt.new | Vibe-Coding | `.bolt/prompt` | Declarative Bridge *(cloud web: remote HTTP/SSE Connectors only; no local stdio MCP)* | `.bolt` |
| `lovable` | Lovable.dev | Vibe-Coding | `.lovable/rules.md` | Declarative Bridge *(paste into Lovable Custom Knowledge; cloud remote MCP only)* | `.lovable` |
| `v0` | Vercel v0 | Vibe-Coding | `.v0/rules.md` | Declarative Bridge *(attach as project brief/prompt; cloud remote MCP only)* | `.v0` |
| `replit` | Replit Agent | Vibe-Coding | `replit.md` | Bridge (`replit.md`) + workspace `.agents/skills/` (`install-skill --target workspace`) | `.replit`, `replit.nix`, `replit.md` |

---

## 🛠️ Step 2: Register the MCP Server per AI Coding Agent

> [!TIP]
> You can automatically print or safely merge `mcpServers` JSON/TOML entries (backing up existing configs to `.11x-backup` with `0600` permissions) using `mcp-config`:
> ```bash
> npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client antigravity --install
> # Preview snippets/CLI commands for all supported clients or pin the current release:
> npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client all --print --pin-version
> ```

Select your development environment or AI assistant below:

### Group A: Major AI Coding Assistants

#### 1. VS Code + GitHub Copilot (Agent Mode)
VS Code supports MCP servers for GitHub Copilot Chat in Agent mode through workspace configuration files.

> [!IMPORTANT]
> VS Code requires the root key **`"servers"`** instead of `"mcpServers"`.

- **Configuration File:** `.vscode/mcp.json` at project root.
- **Configuration:**
  ```json
  {
    "servers": {
      "qa-11x": {
        "command": "npx",
        "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
      }
    }
  }
  ```
- **CLI One-Liner (if `code` CLI is available):**
  ```bash
  code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
  ```

---

#### 2. Cursor IDE
Cursor supports MCP both globally and per workspace.

- **Workspace Configuration:** `.cursor/mcp.json`
- **Global Configuration:** `~/.cursor/mcp.json` (or via GUI in *Settings > Features > MCP*).
- **Content:**
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

---

#### 3. Claude Code (CLI & IDE Extension)
Claude Code supports MCP registration at both user and project levels.

- **CLI One-Liner (User Level):**
  ```bash
  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Project Configuration (`.mcp.json` at root):**
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
- **Rule Reference in `CLAUDE.md`:** You can reference governance directives by adding `@AGENTS.md` to your project's `CLAUDE.md`.
- **Native Plugin Marketplace (`.claude-plugin/`):** Install all 12 skills and the `@sinfallas/mcp-qa-11x` MCP server natively inside Claude Code:
  ```text
  /plugin marketplace add tecno-consultores/qa-testing-blueprints
  /plugin install qa-11x@tecno-consultores-qa-11x
  ```

---

#### 4. Google Antigravity (IDE & CLI) / Gemini CLI
Google Antigravity and Gemini CLI detect MCP tools and sync directives automatically.

- **Configuration File:** `~/.gemini/antigravity/mcp_config.json` *(canonical path; `mcp-config --client antigravity` and `doctor` also recognize the legacy fallback `~/.gemini/config/mcp_config.json`)*
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
- **Registration via Gemini CLI:**
  ```bash
  gemini mcp add qa-11x npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Global Directive Synchronization:** The `install-skill` command automatically synchronizes the thin connector into `~/.gemini/GEMINI.md`.

---

#### 5. OpenAI Codex CLI (`@openai/codex`)
OpenAI Codex CLI uses **TOML** for tool and extension configurations.

- **CLI One-Liner:**
  ```bash
  codex mcp add qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Configuration File (`~/.codex/config.toml`):**
  ```toml
  [mcp_servers.qa-11x]
  command = "npx"
  args = ["-y", "@sinfallas/mcp-qa-11x@latest"]
  ```

---

#### 6. Windsurf (Codeium)
Windsurf supports global MCP configurations in the `.codeium` directory.

- **Configuration File:** `~/.codeium/windsurf/mcp_config.json`
- **Content:**
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

---

#### 7. JetBrains IDEs (AI Assistant & Junie)
JetBrains IDEs with AI Assistant or Junie allow registering MCP servers via settings or Junie's JSON file (`mcp-config --client jetbrains-ai --install`).

- **GUI Path:** *Settings / Preferences > Tools > AI Assistant > Model Context Protocol (MCP)*.
- **Junie Configuration File:** `~/.junie/mcp/mcp.json` (user) or `.junie/mcp/mcp.json` (project).
- **JSON Configuration:**
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

---

### Group B: Specialized and Open-Source Agents

#### 8. Cline, Roo Code & Kilo Code (VS Code Extensions / CLIs)
Each extension uses its own distinct `globalStorage` path (all supported directly by `mcp-config --client <cline|roo-code|kilo-code> --install` and `doctor`):

- **Cline (`mcp-config --client cline --install`):**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
  - Cline CLI fallback: `~/.cline/data/settings/cline_mcp_settings.json`
- **Roo Code (`mcp-config --client roo-code --install`):**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`
  - Project-level: `.roo/mcp.json`
- **Kilo Code (`mcp-config --client kilo-code --install`):**
  - VS Code `globalStorage`: `.../globalStorage/kilocode.kilo-code/settings/mcp_settings.json` (global JSONC: `~/.config/kilo/kilo.jsonc`, project: `.kilocode/mcp.json`)
- **Shared `mcpServers` JSON Content:**
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

---

#### 9. Claude Desktop
- **Configuration File Paths (`claude_desktop_config.json`, resolved multi-OS by `mcp-config --client claude-desktop` and `doctor`):**
  - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
  - **Linux:** `~/.config/Claude/claude_desktop_config.json`
  - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Content:**
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

---

#### 10. Hermes Agent (Nous Research)
Hermes Agent uses **YAML** (`~/.hermes/config.yaml`) for its primary configuration file and also supports `~/.hermes/mcp.json` (`mcpServers` JSON target managed/inspected by `mcp-config --client hermes` and `doctor`).

- **Primary YAML Configuration (`~/.hermes/config.yaml`):**
  ```yaml
  mcp_servers:
    qa_11x:
      command: "npx"
      args:
        - "-y"
        - "@sinfallas/mcp-qa-11x@latest"
  ```
- **Declarative MCP JSON Configuration (`~/.hermes/mcp.json`):**
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

---

#### 11. Zed Editor & OpenCode
- **Zed (`~/.config/zed/settings.json` or `%APPDATA%\Zed\settings.json`, managed via `mcp-config --client zed --install`; global connector `~/.config/zed/AGENTS.md`):**
  ```json
  {
    "context_servers": {
      "qa-11x": {
        "command": "npx",
        "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
      }
    }
  }
  ```
- **OpenCode (`~/.config/opencode/opencode.json` or project `opencode.json`, official schema `https://opencode.ai/config.json`, managed via `mcp-config --client opencode --install` & `install-skill --target opencode`):**
  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "mcp": {
      "qa-11x": {
        "type": "local",
        "command": ["npx", "-y", "@sinfallas/mcp-qa-11x@latest"],
        "enabled": true
      }
    }
  }
  ```

---

#### 12. Amazon Q, Devin, Augment Code, Trae IDE, Continue.dev & Block Goose
All six local MCP clients are directly supported by `mcp-config --client <id> --install` and audited by `doctor`:

- **Standard `mcpServers` JSON Clients:**
  - **Amazon Q Developer (`--client amazon-q`):** `~/.aws/amazonq/mcp.json`
  - **Devin (`--client devin`):** `~/.config/devin/mcp_config.json` (Windows: `%APPDATA%\devin\mcp_config.json`)
  - **Augment Code (`--client augment`):** `~/.augment/settings.json`
  - **Trae IDE (`--client trae`):** `~/.trae/mcp.json` (or project `.trae/mcp.json`)
- **Continue.dev (`--client continue`, `~/.continue/mcpServers/qa-11x.yaml`):**
  ```yaml
  name: QA-11X MCP Server
  version: 0.0.1
  schema: v1
  mcpServers:
    - name: qa-11x
      command: npx
      args:
        - "-y"
        - "@sinfallas/mcp-qa-11x@latest"
  ```
- **Block Goose (`--client goose`, `~/.config/goose/config.yaml` or `%APPDATA%\Block\goose\config\config.yaml`):**
  ```yaml
  extensions:
    qa-11x:
      name: QA-11X
      type: stdio
      cmd: npx
      args:
        - "-y"
        - "@sinfallas/mcp-qa-11x@latest"
      enabled: true
      timeout: 300
  ```

#### 13. Cloud Vibe-Coding & Declarative-Bridge Platforms (`bolt`, `lovable`, `v0`, `replit`, `aider`, `cody`)
- **Bolt.new, Lovable.dev & Vercel v0:** Browser-hosted cloud builders accept remote HTTP/SSE MCP connectors only (not local `stdio` subprocesses). Use `init-agents` for Thin-Repo governance files (`.bolt/prompt`, `.lovable/rules.md` pasted into *Custom Knowledge*, `.v0/rules.md` attached to project brief) and run `npx @sinfallas/mcp-qa-11x audit --mode vibe` locally once exported to Git.
- **Replit Agent:** Reads `replit.md`, `AGENTS.md`, and `.agents/skills/` (`install-skill --target workspace`) inside its workspace container.
- **Aider & Sourcegraph Cody:** Consumed through their declarative repository bridges (`.aider.conf.yml` `read: AGENTS.md` and `.sourcegraph/qa-11x.rule.md`) alongside CLI execution (`npx @sinfallas/mcp-qa-11x audit|certify`).

---

## 🔄 Step 3: Auto-Sync, `update_available` Notice & Clean Cache Refresh

> [!TIP]
> Starting in `v2.20.0`, on every `stdio` startup the MCP server silently auto-syncs pre-installed global skills via `SHA-256` verification in the background, exposes structured `update_available` metadata in `inspect_project_config` and `certify_11x_gate` (backed by `.qa-11x-version` stamps and a 24h fail-open TTL cache), and supports ephemeral mobile execution (`qa-mobile` / `sinfallas/base-mobile-appium:26`) plus bilingual resource delivery (`?lang=es|en`).

To perform a surgical upgrade that clears only stale `@sinfallas/mcp-qa-11x` entries inside `~/.npm/_npx` and `~/.cache/qa-11x-blueprints` (without wiping unrelated `npx` caches for other tools), reconciles `.agents/` governance (`--reconcile`), and re-syncs global skills:

```bash
# Surgical upgrade (cleans @sinfallas/mcp-qa-11x caches + re-syncs global skills; add `--reconcile` to also reconcile `.agents/`):
npx -y @sinfallas/mcp-qa-11x@latest upgrade --reconcile
npx -y @sinfallas/mcp-qa-11x@latest upgrade            # Cache clean + global skills only (omits .agents/ reconciliation)

# Preview targets first or clean caches only (alias: cache-clean):
npx -y @sinfallas/mcp-qa-11x@latest upgrade --dry-run
npx -y @sinfallas/mcp-qa-11x@latest cache-clean

# Last-resort full reset (removes ALL cached npx packages + installs project scripts):
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

### Checking Your Installed & Active MCP Version

Run **`doctor`** (alias: `status`) for a single-command environment inspection (active binary origin, all `~/.npm/_npx` caches, global skills `.qa-11x-version` stamps and `mcp_version` drift, global `$HOME` & `AGENTS.md` connector byte-budget health `<= 1,536 B`, secret-safe IDE MCP pinning and Antigravity split config warnings across `~/.gemini/antigravity/mcp_config.json` + `~/.gemini/config/mcp_config.json`, Claude Code `~/.claude.json`, Claude Desktop multi-OS, Cursor, Windsurf, Codex, and Hermes `~/.hermes/mcp.json` / `~/.hermes/config.yaml`, project readiness, and Docker daemon), or use `--version` / `-v` depending on your installation method:

```bash
# 1. Full environment diagnostics (binary origin, _npx caches, skills, IDE configs & Docker):
npx -y @sinfallas/mcp-qa-11x@latest doctor
npx -y @sinfallas/mcp-qa-11x@latest doctor --offline --json

# 2. Offline diagnostics via --version (--verbose or --json routes to doctor --offline):
npx -y @sinfallas/mcp-qa-11x --version --verbose
npx -y @sinfallas/mcp-qa-11x --version --json

# 3. Check the version already cached in ~/.npm/_npx (without forcing @latest):
npx -y @sinfallas/mcp-qa-11x --version

# 4. Offline zero-network inspection of the exact cached npx package.json:
grep '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

# 5. Check a global installation (npm install -g @sinfallas/mcp-qa-11x):
mcp-qa-11x --version   # or: mcp-qa-11x -v

# 6. Fetch and display the latest version published on npm:
npx -y @sinfallas/mcp-qa-11x@latest --version

# 7. Safely write or refresh IDE MCP client configuration (.11x-backup preserved):
npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client cursor --install
```

#### Installing Native Shell Autocompletion (`completion`)

Generate autocompletion scripts for `fish`, `bash`, or `zsh`:

```bash
# Fish:
mkdir -p ~/.config/fish/completions
npx -y @sinfallas/mcp-qa-11x@latest completion fish > ~/.config/fish/completions/mcp-qa-11x.fish

# Bash (persistent user completions or current session):
mkdir -p ~/.local/share/bash-completion/completions
npx -y @sinfallas/mcp-qa-11x@latest completion bash > ~/.local/share/bash-completion/completions/mcp-qa-11x

# Zsh (ensure ~/.zsh/completions is in fpath before compinit):
mkdir -p ~/.zsh/completions
npx -y @sinfallas/mcp-qa-11x@latest completion zsh > ~/.zsh/completions/_mcp-qa-11x
```

> [!NOTE]
> **Why `npx --no-install @sinfallas/mcp-qa-11x --version` fails with `npm ERR! canceled`:** When registered via `mcpServers` (`npx -y @sinfallas/mcp-qa-11x@latest`), npm caches the package inside an isolated `~/.npm/_npx/<hash>/` directory rather than global `$PATH`. In npm v7+, `--no-install` only searches `./node_modules/.bin` and `$PATH`, ignoring `~/.npm/_npx/`.
>
> **Verifying the active version inside your IDE (Antigravity, Cursor, Claude, VS Code):** Open the IDE's MCP / Customizations panel — `v3.10.0` registers **20 MCP tools** and **13 MCP resources** (`11` static URIs + `2` URI templates). If fewer tools appear from an older cached release, run `npx -y @sinfallas/mcp-qa-11x@latest upgrade` and **reload/restart the MCP server (or IDE window)** so the long-lived `stdio` process restarts on the updated binary. You can also check `update_available` telemetry in `doctor`, `inspect_project_config`, or `certify_11x_gate`, and verify clean-room tarball compliance across **all 12 CLI subcommands** and **20 tools** via `mcp-server/example/verify-v2.sh` (`make test-example`).
