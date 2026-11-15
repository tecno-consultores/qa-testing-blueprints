> 🌐 **Idioma / Language:** **Español** | [Read in English](agent-setup.en.md)

# 🤖 Guía Maestra de Configuración del Servidor MCP y Skills QA 11X por Agente de IA

Esta guía describe el procedimiento paso a paso para configurar **`@sinfallas/mcp-qa-11x`**, sus **28 conectores declarativos de agentes IA** y las **10 skills modulares** del estándar QA 11X en IDEs, CLIs, agentes autónomos y entornos *vibe-coding*.

---

## 📋 Paso 1: Instalación Común de Skills, Conectores (`AGENTS.md`) y Política de Idioma (`--lang es|en`)

Antes de registrar el servidor MCP en tu asistente de IA, inicializa la gobernanza, las skills verificadas con **SHA-256 (`DISA STIG V-222513`)** y los puentes declarativos *Thin-Repo* en la raíz del proyecto:

```bash
# 1. Onboarding rápido integral en < 30s (quickstart soporta --tier / -T, --lang, --agents):
npx -y @sinfallas/mcp-qa-11x@latest quickstart -T standard --lang es --agents auto

# 2. Detectar agentes globales e instalar las 10 skills + scripts + conectores Thin-Repo:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --lang auto --agents auto --include-scripts --reconcile

# 3. Apuntar explícitamente a conectores específicos (ej. Copilot, Cursor, Claude Code) en español o inglés:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang es --agents copilot,cursor,claude-code
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents auto

# 4. Seleccionar un destino específico para las 10 skills globales:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|workspace|antigravity|claude|cursor|windsurf|codex|hermes|all] --init-agents --include-scripts --reconcile
```

> [!NOTE]
> - **Política de Idioma (`--lang`):** `--lang auto` (predeterminado en `install-skill`) activa el **Dynamic Language Mirroring**: el modelo responde y razona en el idioma de tu prompt, y redacta commits y documentación humana respetando el idioma preexistente de `README.md` y `CHANGELOG.md` del repositorio. `--lang es` / `--lang en` fuerzan explícitamente el idioma humano de salida mientras mantienen `.agents/` en inglés técnico compacto.
> - **Arquitectura Puente Thin-Repo (`--agents <csv|auto|all>`):** En lugar de duplicar manuales extensos en cada herramienta, cada conector se mantiene en `<= 15` líneas apuntando a `AGENTS.md` (con *frontmatter* `.mdc` válido en Cursor y `read: AGENTS.md` en `.aider.conf.yml`), con protección anti *path-traversal* y `--dry-run`.
> - **Guardia Humana de Push (`QA-GIT-GATE-01`):** Todos los conectores exigen cerrar en `git commit` local certificado y prohíben `git push` o `npm publish` automáticos sin autorización humana explícita.

### 🌐 Matriz Declarativa de 28 Agentes de Programación IA Soportados (`--agents`)

| ID (`--agents`) | Asistente / Entorno | Categoría | Archivo Puente Generado | Marcadores (`--agents auto`) |
| :--- | :--- | :--- | :--- | :--- |
| `antigravity` | Google Antigravity IDE | IDE | `AGENTS.md` | `.gemini`, `.idx` |
| `claude-code` | Claude Code CLI | CLI | `CLAUDE.md` | `CLAUDE.md`, `.claude` |
| `claude-desktop` | Claude Desktop | Desktop | `AGENTS.md` | `.mcp.json` |
| `cursor` | Cursor IDE | IDE | `.cursor/rules/qa-11x.mdc` | `.cursor`, `.cursorrules` |
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

## 🛠️ Paso 2: Registro del Servidor MCP por Agente de IA

Elige tu entorno o asistente de desarrollo a continuación:

### Grupo A: Asistentes Principales

#### 1. VS Code + GitHub Copilot (Agent Mode)
VS Code soporta servidores MCP para GitHub Copilot Chat en modo Agente a través del archivo de configuración del espacio de trabajo.

> [!IMPORTANT]
> VS Code utiliza la clave raíz **`"servers"`** en lugar de `"mcpServers"`.

- **Archivo de configuración:** `.vscode/mcp.json` en la raíz del proyecto.
- **Configuración:**
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
- **Registro rápido por CLI (si el binario `code` está disponible):**
  ```bash
  code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
  ```

---

#### 2. Cursor IDE
Cursor soporta MCP a nivel global o por espacio de trabajo.

- **Configuración por Proyecto:** `.cursor/mcp.json`
- **Configuración Global:** `~/.cursor/mcp.json` (o vía interfaz gráfica en *Settings > Features > MCP*).
- **Contenido:**
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

#### 3. Claude Code (CLI & Extensión de IDE)
Claude Code soporta registro de herramientas MCP tanto a nivel de usuario como de proyecto.

- **Registro rápido por CLI (Nivel Usuario):**
  ```bash
  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Configuración de Proyecto (`.mcp.json` en raíz):**
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
- **Sincronización en `CLAUDE.md`:** Puedes referenciar las directivas añadiendo `@AGENTS.md` al archivo `CLAUDE.md` de tu proyecto.

---

#### 4. Google Antigravity (IDE & CLI) / Gemini CLI
Google Antigravity y la CLI de Gemini detectan herramientas MCP y sincronizan directivas automáticamente.

- **Archivo de Configuración:** `~/.gemini/antigravity/mcp_config.json`
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
- **Registro vía Gemini CLI:**
  ```bash
  gemini mcp add qa-11x npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Sincronización Global de Directivas:** El comando `install-skill` inyecta automáticamente el conector optimizado en `~/.gemini/GEMINI.md`.

---

#### 5. OpenAI Codex CLI (`@openai/codex`)
OpenAI Codex CLI utiliza el formato **TOML** para la configuración de extensiones MCP.

- **Registro rápido por CLI:**
  ```bash
  codex mcp add qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Archivo de Configuración (`~/.codex/config.toml`):**
  ```toml
  [mcp_servers.qa-11x]
  command = "npx"
  args = ["-y", "@sinfallas/mcp-qa-11x@latest"]
  ```

---

#### 6. Windsurf (Codeium)
Windsurf soporta MCP a nivel global en el directorio `.codeium`.

- **Archivo de Configuración:** `~/.codeium/windsurf/mcp_config.json`
- **Contenido:**
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
Los IDEs de JetBrains con soporte para AI Assistant o Junie permiten registrar servidores MCP desde la interfaz o por archivo de configuración.

- **Ruta en interfaz:** *Settings / Preferences > Tools > AI Assistant > Model Context Protocol (MCP)*.
- **Configuración JSON:**
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

### Grupo B: Agentes Especializados y de Código Abierto

#### 8. Cline / Roo Code (VS Code Extension)
- **Archivo de Configuración:**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- **Contenido:**
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
- **Rutas de Configuración (`claude_desktop_config.json`):**
  - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
  - **Linux:** `~/.config/Claude/claude_desktop_config.json`
  - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Contenido:**
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
Hermes Agent utiliza el formato **YAML** para su archivo maestro de configuración.

- **Archivo de Configuración:** `~/.hermes/config.yaml`
- **Contenido:**
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

## 🔄 Paso 3: Auto-Sync, Notificación `update_available` y Actualización Limpia de Cachés

> [!TIP]
> Desde `v2.20.0`, en cada arranque `stdio` el servidor MCP sincroniza silenciosamente por `SHA-256` las skills globales ya instaladas en segundo plano, y expone el campo `update_available` en `inspect_project_config` y `certify_11x_gate` (leyendo `.qa-11x-version` y caché TTL de 24 h *fail-open*) para avisarte si los scripts locales del proyecto quedaron desfasados.

Para forzar una actualización limpia descartando cachés locales de npm y blueprints antiguos:

```bash
# Limpiar cachés y actualizar en todos los agentes globales:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

Para verificar que el servidor MCP responde correctamente en tu terminal:

```bash
npx -y @sinfallas/mcp-qa-11x@latest --version
```
