> 🌐 **Language / Idioma:** **English** | [Leer en Español](agent-setup.md)

# 🤖 Master Setup Guide for QA 11X MCP Server & Skills across AI Coding Agents

This guide provides step-by-step instructions to configure **`@sinfallas/mcp-qa-11x`**, its **28 declarative AI agent connectors**, and the **corporate QA-11X skills** across IDEs, CLIs, autonomous agents, and vibe-coding environments.

---

## 📋 Step 1: Universal Installation of Skills, Connectors (`AGENTS.md`), and Language Policy (`--lang es|en`)

Before registering the MCP server in your AI assistant, initialize governance and Thin-Repo bridge files at your project root:

```bash
# 1. Auto-detect installed project agents and inject English directives:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents auto

# 2. Enforce Spanish human-output policy (default) on AGENTS.md only (100% backward compatible):
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang es

# 3. Target explicit agent bridges (e.g. GitHub Copilot, Cursor, Claude Code) in English:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents copilot,cursor,claude-code

# 4. Install verified SHA-256 skills (DISA STIG V-222513), scripts, and multi-agent connectors together:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --lang en --agents auto --include-scripts --reconcile
```

> [!NOTE]
> - **Language Policy (`--lang`):** `init-agents` supports `--lang es` (default, Spanish human responses/commits) and `--lang en` (English human responses/commits), while keeping internal `.agents/` directives in concise technical English. Re-running `init-agents` with a different `--lang` updates only the delimited QA-11X connector block idempotently without altering custom project rules.
> - **Thin-Repo Bridge Architecture (`--agents <csv|auto|all>`):** Instead of duplicating large rulebooks into every tool folder, each bridge file is kept strictly `<= 15` lines and points directly to `AGENTS.md` (including valid `.mdc` frontmatter for Cursor and non-duplicating `read:` YAML syntax for `.aider.conf.yml`), with path-traversal protection and `--dry-run` simulation support.
> - **Human-Confirmed Push Guard (`QA-GIT-GATE-01`):** Generated connectors enforce local certified `git commit` closure and prohibit automatic `git push` or `npm publish` without explicit human authorization.

### 🌐 Declarative Matrix of 28 Supported AI Coding Agents (`--agents`)

| Agent ID (`--agents`) | Assistant / Environment | Category | Generated Bridge File | Auto-Detection Markers (`--agents auto`) |
| :--- | :--- | :--- | :--- | :--- |
| `antigravity` | Google Antigravity IDE | IDE | `AGENTS.md` | `.gemini`, `.idx` |
| `claude-code` | Claude Code CLI | CLI | `CLAUDE.md` | `CLAUDE.md`, `.claude` |
| `claude-desktop` | Claude Desktop | Desktop | `AGENTS.md` | `.mcp.json` |
| `cursor` | Cursor IDE | IDE | `.cursor/rules/qa-11x.mdc` (`.mdc` frontmatter) | `.cursor`, `.cursorrules` |
| `windsurf` | Windsurf (Codeium) | IDE | `.windsurfrules` | `.windsurfrules`, `.windsurf`, `.codeium` |
| `copilot` | GitHub Copilot (VS Code) | IDE | `.github/copilot-instructions.md` | `.github`, `.vscode` |
| `codex` | OpenAI Codex CLI | CLI | `AGENTS.md` | `.codex` |
| `gemini-cli` | Google Gemini CLI | CLI | `GEMINI.md` | `GEMINI.md`, `.gemini` |
| `gemini-code-assist` | Gemini Code Assist | IDE | `.gemini/styleguide.md` | `.gemini` |
| `cline` | Cline (VS Code) | IDE | `.clinerules` | `.clinerules`, `.cline` |
| `roo-code` | Roo Code | IDE | `.roo/rules/qa-11x.md` | `.roo`, `.roorules` |
| `aider` | Aider CLI | CLI | `.aider.conf.yml` (`read: AGENTS.md`) | `.aider.conf.yml`, `.aiderignore` |
| `continue` | Continue.dev | IDE | `.continue/rules/qa-11x.md` | `.continue`, `.continuerules` |
| `zed` | Zed Editor AI | IDE | `.rules` | `.zed`, `.rules` |
| `devin` | Devin Autonomous Agent | Autonomous | `AGENTS.md` | `.devin` |
| `cody` | Sourcegraph Cody | IDE | `.sourcegraph/qa-11x.rule.md` | `.sourcegraph` |
| `amazon-q` | Amazon Q Developer | IDE | `.amazonq/rules/qa-11x.md` | `.amazonq` |
| `jetbrains-ai` | JetBrains AI / Junie | IDE | `.junie/guidelines.md` | `.junie`, `.idea` |
| `augment` | Augment Code | IDE | `.augment/rules/qa-11x.md` | `.augment` |
| `trae` | Trae IDE | IDE | `.trae/rules/qa-11x.md` | `.trae` |
| `hermes` | Hermes Agent | Autonomous | `AGENTS.md` | `.hermes` |
| `opencode` | OpenCode CLI | CLI | `AGENTS.md` | `opencode.json`, `.opencode` |
| `goose` | Block Goose | CLI | `.goosehints` | `.goosehints`, `.goose` |
| `kilo-code` | Kilo Code | IDE | `.kilocode/rules/qa-11x.md` | `.kilocode` |
| `bolt` | Bolt.new | Vibe-Coding | `.bolt/prompt` | `.bolt` |
| `lovable` | Lovable.dev | Vibe-Coding | `.lovable/rules.md` | `.lovable` |
| `v0` | Vercel v0 | Vibe-Coding | `.v0/rules.md` | `.v0` |
| `replit` | Replit Agent | Vibe-Coding | `replit.md` | `.replit`, `replit.nix`, `replit.md` |

---

## 🛠️ Step 2: Register the MCP Server per AI Coding Agent

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

---

#### 4. Google Antigravity (IDE & CLI) / Gemini CLI
Google Antigravity and Gemini CLI detect MCP tools and sync directives automatically.

- **Configuration File:** `~/.gemini/antigravity/mcp_config.json`
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

#### 7. JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, PhpStorm)
JetBrains IDEs with AI Assistant or Junie allow registering MCP servers via settings or JSON.

- **GUI Path:** *Settings / Preferences > Tools > AI Assistant > Model Context Protocol (MCP)*.
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

#### 8. Cline / Roo Code (VS Code Extension)
- **Configuration File Path:**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
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

#### 9. Claude Desktop
- **Configuration File Paths (`claude_desktop_config.json`):**
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
Hermes Agent uses **YAML** for its primary configuration file.

- **Configuration File:** `~/.hermes/config.yaml`
- **Content:**
  ```yaml
  mcp_servers:
    qa_11x:
      command: "npx"
      args:
        - "-y"
        - "@sinfallas/mcp-qa-11x@latest"
  ```

---

#### 11. Zed Editor & OpenCode
- **Zed (`~/.config/zed/settings.json`):**
  ```json
  {
    "context_servers": [
      {
        "id": "qa-11x",
        "command": {
          "path": "npx",
          "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
        }
      }
    ]
  }
  ```
- **OpenCode (`opencode.json`):**
  ```json
  {
    "mcp": {
      "servers": {
        "qa-11x": {
          "command": "npx",
          "args": ["-y", "@sinfallas/mcp-qa-11x@latest"]
        }
      }
    }
  }
  ```

---

## 🔄 Step 3: Auto-Sync, `update_available` Notice & Clean Cache Refresh

> [!TIP]
> Starting in `v2.20.0`, on every `stdio` startup the MCP server silently auto-syncs pre-installed global skills via `SHA-256` verification in the background, and exposes structured `update_available` metadata in `inspect_project_config` and `certify_11x_gate` (backed by `.qa-11x-version` stamps and a 24h fail-open TTL cache) so your AI assistant notifies you whenever local project scripts drift behind the latest release.

To force a clean update clearing cached npm binaries and stale blueprint templates:

```bash
# Clean caches and install to all global agents:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

To verify that the MCP server responds correctly in your terminal:

```bash
npx -y @sinfallas/mcp-qa-11x@latest --version
```
