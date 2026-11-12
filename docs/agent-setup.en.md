> 🌐 **Language / Idioma:** **English** | [Leer en Español](agent-setup.md)

# 🤖 Master Setup Guide for QA 11X MCP Server & Skills across AI Coding Agents

This guide provides step-by-step instructions to configure **`@sinfallas/mcp-qa-11x`** and the **5 corporate skills** of the Level-11X QA Standard across all 11 major AI coding assistants and IDEs.

---

## 📋 Step 1: Universal Installation of Skills, Scripts, and Governance (`AGENTS.md`)

Before registering the MCP server in your AI assistant, execute the universal installer at your project root to download skills verified with **SHA-256 (`DISA STIG V-222513`)**, install operational scripts, and initialize governance:

```bash
# Recommended (Auto-detects global agents + Dynamic Language Mirroring):
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

# Forcing a specific language policy in generated AGENTS.md directives:
# English enforced:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --lang en --init-agents --include-scripts --reconcile

# Spanish enforced:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --lang es --init-agents --include-scripts --reconcile

# Explicitly selecting a target agent directory:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] --init-agents --include-scripts --reconcile
```

> [!NOTE]
> The `--lang auto` flag (default) activates **Dynamic Language Mirroring**: the LLM responds and reasons in the prompt language, and writes commit messages and human-facing documentation matching the existing language of repository `README.md` and `CHANGELOG.md`.

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

## 🔄 Step 3: Clean Cache Refresh & Verification

To force a clean update clearing cached npm binaries and stale blueprint templates:

```bash
# Clean caches and install to all global agents:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

To verify that the MCP server responds correctly in your terminal:

```bash
npx -y @sinfallas/mcp-qa-11x@latest --version
```
