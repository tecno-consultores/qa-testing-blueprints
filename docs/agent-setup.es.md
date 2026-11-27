> 🌐 **Idioma:** [🇺🇸 English (Canonical)](agent-setup.md) · **Español (Espejo 1:1)**

# 🤖 Guía de Configuración e Integración de Agentes — Servidor MCP y Skills QA 11X

Esta guía proporciona instrucciones paso a paso para configurar **`@sinfallas/mcp-qa-11x`**, sus **28 conectores declarativos de agentes IA**, la negociación bilingüe de recursos MCP (`?lang=es|en`) y las **skills corporativas QA-11X** (incluyendo pruebas móviles E2E sobre `sinfallas/base-mobile-appium:26`) en IDEs, CLIs, agentes autónomos y entornos *vibe-coding*.

> [!IMPORTANT]
> **Prerrequisito Físico Obligatorio (`Rule Zero`):** Contar con **Docker Engine** operativo es estrictamente obligatorio en toda máquina que ejecute `qa-11x` (`qa-11x doctor` devuelve `exit 1` si el demonio Docker no responde). `qa-11x` detecta automáticamente MCPs compañeros en tu IDE (`Playwright`/`Chrome DevTools` para DOM en vivo, `Semgrep`/`SonarQube`/`Snyk` para SAST *taint* inter-archivo, `Trivy` para CVE/IaC, `Serena` para refactorización LSP en vivo, `Appium` para móvil); cuando no existe un MCP compañero activo, cualquier escáner externo por CLI se ejecuta **exclusivamente en contenedores Docker efímeros no-root** (`--rm --restart=no --network none`) serializados bajo `QA_MAX_CONCURRENT_CONTAINERS=1`. Puedes usar `--toolset core|auto|full` (o `QA_11X_TOOLSET`) en clientes con ventana reducida para exponer solo las 9 herramientas núcleo (`core`, incluyendo `audit_test_pyramid_gaps`) o las aplicables al stack (`auto`).

---

## 📋 Paso 1: Instalación Universal de Skills, Conectores (`AGENTS.md`) y Política de Idioma (`--lang auto|es|en`)

Antes de registrar el servidor MCP en tu asistente de IA, inicializa la gobernanza y los archivos puente Thin-Repo en la raíz de tu proyecto:

```bash
# 1. Auto-detectar agentes instalados en el proyecto e inyectar directivas en inglés:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents auto

# 2. Usar Dynamic Language Mirroring (`auto` por defecto — refleja el idioma del prompt y de README/CHANGELOG) o forzar español (`--lang es`):
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang auto

# 3. Apuntar explícitamente a puentes específicos (ej. GitHub Copilot, Cursor, Claude Code) en inglés:
npx -y @sinfallas/mcp-qa-11x@latest init-agents --lang en --agents copilot,cursor,claude-code

# 4. Instalar skills verificadas con SHA-256 (DISA STIG V-222513), scripts y conectores multi-agente juntos:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --lang en --agents auto --include-scripts --reconcile
```

> [!NOTE]
> - **Política de Idioma (`--lang auto|es|en`):** Tanto `init-agents` como `install-skill --init-agents` usan `--lang auto` por defecto (*Dynamic Language Mirroring*, reflejando el idioma del prompt del usuario y el idioma existente en `README.md`/`CHANGELOG.md`), soportando también `--lang es` y `--lang en` explícitos y manteniendo las directivas internas `.agents/` en inglés técnico compacto. Re-ejecutar `init-agents` (`[dir] [--project-path|--dir|-p <dir>] [--lang|-l auto|es|en] [--agents|-a auto|all|<csv>] [--dry-run]`) con otro `--lang` actualiza de forma idempotente únicamente el bloque conector delimitado QA-11X sin alterar reglas personalizadas del proyecto.
> - **Flags Adicionales Thin-Repo y Trazabilidad:** `install-skill` (`install`) acepta `[--target|-t <env>] [--lang|-l auto|es|en] [--agents|-a <spec>] [--project-path|-p <dir>] [--init-agents] [--include-scripts] [--reconcile] [--dry-run]`, soportando destinos globales de skills (`antigravity`, `gemini-cli`, `claude`, `cursor`, `windsurf`, `codex`, `hermes`, `opencode`, `copilot`, `agents` -> `~/.agents/skills`), sincronizando los conectores `$HOME` detectados (`.gemini/GEMINI.md`, `.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.codeium/windsurf/memories/global_rules.md`, `.config/opencode/AGENTS.md`, `.config/zed/AGENTS.md`), preservando el idioma previo si se omite `--lang`, podando archivos retirados de skills canónicas y protegiendo `scripts/*` personalizados (escribe `.11x-incoming` y recomienda `.agents/limpieza.local.sh`). `reconcile-agents` acepta `[dir] [--project-path|--dir|-p <dir>] [--scan-workspaces <dir>] [--apply] [--allow-dirty] [--prune-bridges] [--dry-run] [--json]` (poda conservadora de duplicados canónicos preservando secciones híbridas para revisión manual, consolida respaldos sueltos, parchea `.gitignore` y escanea workspaces multi-repo en `--dry-run` seguro por defecto). `tms-sync` soporta `--mode <inventory|push-results|pull-stories> --provider <jira|zephyr|xray|github-issues> [--target-dir <dir>] [--junit-xml <ruta>] [--base-url <https://...>] [--project-key <key>] [--issue-key <key>] [--test-execution-key <key>] [--repo <owner/repo>] [--required-keys <k1,k2>] [--timeout-ms <ms>] [--dry-run|--live] [--json]`.
> - **Negociación Bilingüe de Recursos MCP (`?lang=es|en`):** Las URIs MCP `blueprint://*` soportan `?lang=en` (inglés canónico, por defecto) y `?lang=es` (espejo 1:1 en español `.es.md`, ej. `blueprint://mobile-appium/readme?lang=es` para `sinfallas/base-mobile-appium:26`).
> - **Arquitectura Puente Thin-Repo (`--agents <csv|auto|all>`):** En lugar de duplicar manuales extensos en cada carpeta de herramienta, cada puente se mantiene estrictamente en `<= 15` líneas y apunta directo a `AGENTS.md` (incluyendo *frontmatter* `.mdc` válido para Cursor y sintaxis YAML `read:` sin duplicación para `.aider.conf.yml`), con protección contra *path-traversal* y simulación `--dry-run`.
> - **Guardia de Push Confirmado por Humanos (`QA-GIT-GATE-01`):** Los conectores generados exigen cierre local certificado con `git commit` y prohíben `git push` o `npm publish` automáticos sin autorización humana explícita.

### 🌐 Matriz Declarativa de los 28 Agentes de Programación IA Soportados (`--agents`)

| ID de Agente (`--agents`) | Asistente / Entorno | Categoría | Archivo Puente Generado | Alcance Verificado de Integración | Marcadores de Auto-Detección (`--agents auto`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `antigravity` | Google Antigravity IDE | IDE | `AGENTS.md` | Completo (Bridge + Skills Globales + Conector `$HOME` + `mcp-config`/`doctor`) | `.gemini`, `.idx` |
| `claude-code` | Claude Code CLI | CLI | `CLAUDE.md` | Completo (Bridge + Skills Globales + Conector `$HOME` + `mcp-config`/`doctor` + Plugin) | `CLAUDE.md`, `.claude` |
| `claude-desktop` | Claude Desktop | Desktop | `AGENTS.md` | Bridge + `mcp-config`/`doctor` (JSON multi-OS) | `.mcp.json` |
| `cursor` | Cursor IDE | IDE | `.cursor/rules/qa-11x.mdc` (*frontmatter* `.mdc`) | Completo (Bridge + Skills Globales + `mcp-config`/`doctor`) | `.cursor`, `.cursorrules` |
| `windsurf` | Windsurf (Codeium) | IDE | `.windsurfrules` *(legado; `.windsurf/rules/` también compatible)* | Completo (Bridge + Skills Globales + `$HOME` `global_rules.md` + `mcp-config`/`doctor`) | `.windsurfrules`, `.windsurf`, `.codeium` |
| `copilot` | GitHub Copilot (VS Code) | IDE | `.github/copilot-instructions.md` | Bridge + Skills Globales (`~/.copilot/skills`) + `mcp-config --client vscode` / `doctor` | `.github`, `.vscode` |
| `codex` | OpenAI Codex CLI | CLI | `AGENTS.md` | Completo (Bridge + Skills Globales + Conector `$HOME` + TOML `mcp-config`/`doctor`) | `.codex` |
| `gemini-cli` | Google Gemini CLI | CLI | `GEMINI.md` | Completo (Bridge + Skills Globales `~/.gemini/skills` + Conector `$HOME` + `mcp-config`/`doctor`) | `GEMINI.md`, `.gemini` |
| `gemini-code-assist` | Gemini Code Assist | IDE | `.gemini/styleguide.md` | Bridge + skills `.gemini/` compartidos y MCP del IDE | `.gemini` |
| `cline` | Cline (VS Code / CLI) | IDE | `.clinerules` | Bridge + `mcp-config --client cline` / `doctor` (`cline_mcp_settings.json`) | `.clinerules`, `.cline` |
| `roo-code` | Roo Code | IDE | `.roo/rules/qa-11x.md` | Bridge + `mcp-config --client roo-code` / `doctor` (`rooveterinaryinc.roo-cline`) | `.roo`, `.roorules` |
| `aider` | Aider CLI | CLI | `.aider.conf.yml` (`read: AGENTS.md`) | Bridge YAML declarativo *(sin registro MCP stdio nativo)* | `.aider.conf.yml`, `.aiderignore` |
| `continue` | Continue.dev | IDE | `.continue/rules/qa-11x.md` | Bridge + YAML `mcp-config --client continue` / `doctor` (`.continue/mcpServers/qa-11x.yaml`) | `.continue`, `.continuerules` |
| `zed` | Zed Editor AI | IDE | `.rules` | Completo (Bridge + `$HOME` `~/.config/zed/AGENTS.md` + `context_servers` `mcp-config`/`doctor`) | `.zed`, `.rules` |
| `devin` | Devin Autonomous Agent | Autónomo | `AGENTS.md` | Bridge + `mcp-config --client devin` / `doctor` (`mcp_config.json`) | `.devin` |
| `cody` | Sourcegraph Cody | IDE | `.sourcegraph/qa-11x.rule.md` | Bridge declarativo *(ajustes IDE / enterprise)* | `.sourcegraph` |
| `amazon-q` | Amazon Q Developer | IDE | `.amazonq/rules/qa-11x.md` | Bridge + `mcp-config --client amazon-q` / `doctor` (`~/.aws/amazonq/mcp.json`) | `.amazonq` |
| `jetbrains-ai` | JetBrains AI / Junie | IDE | `.junie/guidelines.md` | Bridge + `mcp-config --client jetbrains-ai` / `doctor` (`~/.junie/mcp/mcp.json` + GUI) | `.junie`, `.idea` |
| `augment` | Augment Code | IDE | `.augment/rules/qa-11x.md` | Bridge + `mcp-config --client augment` / `doctor` (`~/.augment/settings.json`) | `.augment` |
| `trae` | Trae IDE | IDE | `.trae/rules/qa-11x.md` | Bridge + `mcp-config --client trae` / `doctor` (`.trae/mcp.json`) | `.trae` |
| `hermes` | Hermes Agent | Autónomo | `AGENTS.md` | Bridge + Skills Globales (`~/.hermes/skills`) + `mcp-config`/`doctor` (`mcp.json` y `config.yaml`) | `.hermes` |
| `opencode` | OpenCode CLI | CLI | `AGENTS.md` | Completo (Bridge + Skills Globales + Conector `$HOME` + esquema oficial `mcp.qa-11x` `mcp-config`/`doctor`) | `opencode.json`, `.opencode` |
| `goose` | Block Goose | CLI | `.goosehints` | Bridge + YAML `mcp-config --client goose` / `doctor` (`config.yaml` `extensions:`) | `.goosehints`, `.goose` |
| `kilo-code` | Kilo Code | IDE | `.kilocode/rules/qa-11x.md` | Bridge + `mcp-config --client kilo-code` / `doctor` (`kilocode.kilo-code` y `kilo.jsonc`) | `.kilocode` |
| `bolt` | Bolt.new | Vibe-Coding | `.bolt/prompt` | Bridge declarativo *(web cloud: solo Connectors HTTP/SSE remotos; sin MCP stdio local)* | `.bolt` |
| `lovable` | Lovable.dev | Vibe-Coding | `.lovable/rules.md` | Bridge declarativo *(pegar en Lovable Custom Knowledge; solo MCP remoto cloud)* | `.lovable` |
| `v0` | Vercel v0 | Vibe-Coding | `.v0/rules.md` | Bridge declarativo *(adjuntar como brief/prompt; solo MCP remoto cloud)* | `.v0` |
| `replit` | Replit Agent | Vibe-Coding | `replit.md` | Bridge (`replit.md`) + `.agents/skills/` de workspace (`install-skill --target workspace`) | `.replit`, `replit.nix`, `replit.md` |

---

## 🛠️ Paso 2: Registrar el Servidor MCP por Agente de Programación IA

> [!TIP]
> Puedes imprimir o fusionar de forma segura las entradas `mcpServers` JSON/TOML (respaldando configuraciones previas en `.11x-backup` con permisos `0600`) usando `mcp-config`:
> ```bash
> npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client antigravity --install
> # Previsualizar snippets/comandos CLI para todos los clientes soportados o fijar versión:
> npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client all --print --pin-version
> ```

Selecciona tu entorno de desarrollo o asistente de IA a continuación:

### Grupo A: Asistentes de Programación IA Principales

#### 1. VS Code + GitHub Copilot (Modo Agente)
VS Code soporta servidores MCP para GitHub Copilot Chat en modo Agente mediante archivos de configuración del workspace.

> [!IMPORTANT]
> VS Code exige la clave raíz **`"servers"`** en lugar de `"mcpServers"`.

- **Archivo de Configuración:** `.vscode/mcp.json` en la raíz del proyecto.
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
- **Comando CLI Rápido (si `code` está disponible):**
  ```bash
  code --add-mcp '{"name":"qa-11x","command":"npx","args":["-y","@sinfallas/mcp-qa-11x@latest"]}'
  ```

---

#### 2. Cursor IDE
Cursor soporta MCP tanto de forma global como por workspace.

- **Configuración por Workspace:** `.cursor/mcp.json`
- **Configuración Global:** `~/.cursor/mcp.json` (o vía GUI en *Settings > Features > MCP*).
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

#### 3. Claude Code (CLI y Extensión de IDE)
Claude Code soporta registro MCP tanto a nivel de usuario como de proyecto.

- **Comando CLI Rápido (Nivel de Usuario):**
  ```bash
  claude mcp add -s user qa-11x -- npx -y @sinfallas/mcp-qa-11x@latest
  ```
- **Configuración de Proyecto (`.mcp.json` en la raíz):**
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
- **Referencia de Reglas en `CLAUDE.md`:** Puedes referenciar las directivas de gobernanza añadiendo `@AGENTS.md` al `CLAUDE.md` de tu proyecto.
- **Plugin Marketplace Nativo (`.claude-plugin/`):** Instala las 11 skills y el servidor MCP `@sinfallas/mcp-qa-11x` de forma nativa dentro de Claude Code:
  ```text
  /plugin marketplace add tecno-consultores/qa-testing-blueprints
  /plugin install qa-11x@tecno-consultores-qa-11x
  ```

---

#### 4. Google Antigravity (IDE y CLI) / Gemini CLI
Google Antigravity y Gemini CLI detectan herramientas MCP y sincronizan directivas automáticamente.

- **Archivo de Configuración:** `~/.gemini/antigravity/mcp_config.json` *(ruta canónica; `mcp-config --client antigravity` y `doctor` también reconocen el fallback legado `~/.gemini/config/mcp_config.json`)*
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
- **Sincronización Global de Directivas:** El comando `install-skill` sincroniza automáticamente el conector ligero en `~/.gemini/GEMINI.md`.

---

#### 5. OpenAI Codex CLI (`@openai/codex`)
OpenAI Codex CLI utiliza **TOML** para la configuración de herramientas y extensiones.

- **Comando CLI Rápido:**
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
Windsurf soporta configuraciones MCP globales en el directorio `.codeium`.

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
Los IDEs de JetBrains con AI Assistant o Junie permiten registrar servidores MCP vía ajustes o JSON.

- **Ruta en GUI:** *Settings / Preferences > Tools > AI Assistant > Model Context Protocol (MCP)*.
- **Archivo de Configuración Junie (`mcp-config --client jetbrains-ai --install`):** `~/.junie/mcp/mcp.json` (usuario) o `.junie/mcp/mcp.json` (proyecto).
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

#### 8. Cline, Roo Code y Kilo Code (Extensiones VS Code / CLIs)
Cada extensión usa su propia ruta `globalStorage` (todas soportadas directamente por `mcp-config --client <cline|roo-code|kilo-code> --install` y `doctor`):

- **Cline (`mcp-config --client cline --install`):**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
  - Respaldo Cline CLI: `~/.cline/data/settings/cline_mcp_settings.json`
- **Roo Code (`mcp-config --client roo-code --install`):**
  - macOS: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
  - Linux: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`
  - Nivel proyecto: `.roo/mcp.json`
- **Kilo Code (`mcp-config --client kilo-code --install`):**
  - VS Code `globalStorage`: `.../globalStorage/kilocode.kilo-code/settings/mcp_settings.json` (global JSONC: `~/.config/kilo/kilo.jsonc`, proyecto: `.kilocode/mcp.json`)
- **Contenido JSON `mcpServers` compartido:**
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
- **Rutas del Archivo de Configuración (`claude_desktop_config.json`, resueltas multi-OS por `mcp-config --client claude-desktop` y `doctor`):**
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
Hermes Agent utiliza **YAML** (`~/.hermes/config.yaml`) para su archivo principal de configuración y también soporta `~/.hermes/mcp.json` (destino JSON `mcpServers` gestionado/inspeccionado por `mcp-config --client hermes` y `doctor`).

- **Configuración YAML Principal (`~/.hermes/config.yaml`):**
  ```yaml
  mcp_servers:
    qa_11x:
      command: "npx"
      args:
        - "-y"
        - "@sinfallas/mcp-qa-11x@latest"
  ```
- **Configuración JSON MCP Declarativa (`~/.hermes/mcp.json`):**
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

#### 11. Zed Editor y OpenCode
- **Zed (`~/.config/zed/settings.json` o `%APPDATA%\Zed\settings.json`, gestionado con `mcp-config --client zed --install`; conector global `~/.config/zed/AGENTS.md`):**
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
- **OpenCode (`~/.config/opencode/opencode.json` o `opencode.json` de proyecto, esquema oficial `https://opencode.ai/config.json`, gestionado con `mcp-config --client opencode --install` e `install-skill --target opencode`):**
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

#### 12. Amazon Q, Devin, Augment Code, Trae IDE, Continue.dev y Block Goose
Los seis clientes MCP locales están soportados directamente por `mcp-config --client <id> --install` y auditados por `doctor`:

- **Clientes JSON `mcpServers` Estándar:**
  - **Amazon Q Developer (`--client amazon-q`):** `~/.aws/amazonq/mcp.json`
  - **Devin (`--client devin`):** `~/.config/devin/mcp_config.json` (Windows: `%APPDATA%\devin\mcp_config.json`)
  - **Augment Code (`--client augment`):** `~/.augment/settings.json`
  - **Trae IDE (`--client trae`):** `~/.trae/mcp.json` (o proyecto `.trae/mcp.json`)
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
- **Block Goose (`--client goose`, `~/.config/goose/config.yaml` o `%APPDATA%\Block\goose\config\config.yaml`):**
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

#### 13. Plataformas Cloud Vibe-Coding y Puentes Declarativos (`bolt`, `lovable`, `v0`, `replit`, `aider`, `cody`)
- **Bolt.new, Lovable.dev y Vercel v0:** Al ejecutarse en navegador cloud, aceptan únicamente conectores MCP remotos HTTP/SSE (no subprocesos `stdio` locales). Usa `init-agents` para generar los puentes Thin-Repo (`.bolt/prompt`, `.lovable/rules.md` para pegar en *Custom Knowledge*, `.v0/rules.md` adjunto como brief de proyecto) y ejecuta `npx @sinfallas/mcp-qa-11x audit --mode vibe` en local tras exportar a Git.
- **Replit Agent:** Lee `replit.md`, `AGENTS.md` y `.agents/skills/` (`install-skill --target workspace`) dentro de su contenedor de workspace.
- **Aider y Sourcegraph Cody:** Se integran mediante sus puentes declarativos de repositorio (`.aider.conf.yml` `read: AGENTS.md` y `.sourcegraph/qa-11x.rule.md`) junto con la CLI (`npx @sinfallas/mcp-qa-11x audit|certify`).

---

## 🔄 Paso 3: Auto-Sync, Aviso `update_available` y Limpieza de Caché

> [!TIP]
> A partir de `v2.20.0`, en cada arranque `stdio` el servidor MCP sincroniza silenciosamente en segundo plano las skills globales preinstaladas mediante verificación `SHA-256`, expone metadatos estructurados `update_available` en `inspect_project_config` y `certify_11x_gate` (respaldados por marcas `.qa-11x-version` y caché TTL fail-open de 24h) y soporta ejecución efímera móvil (`qa-mobile` / `sinfallas/base-mobile-appium:26`) más entrega bilingüe de recursos (`?lang=es|en`).

Para ejecutar una actualización quirúrgica que elimine únicamente las entradas obsoletas de `@sinfallas/mcp-qa-11x` en `~/.npm/_npx` y `~/.cache/qa-11x-blueprints` (sin borrar cachés `npx` de otras herramientas), reconcilie la gobernanza `.agents/` (`--reconcile`) y resincronice las skills globales:

```bash
# Actualización quirúrgica (limpia cachés de @sinfallas/mcp-qa-11x + resincroniza skills; añade `--reconcile` para reconciliar también `.agents/`):
npx -y @sinfallas/mcp-qa-11x@latest upgrade --reconcile
npx -y @sinfallas/mcp-qa-11x@latest upgrade            # Solo limpia cachés y resincroniza skills (omite reconciliar .agents/)

# Previsualizar objetivos o limpiar solo cachés (alias: cache-clean):
npx -y @sinfallas/mcp-qa-11x@latest upgrade --dry-run
npx -y @sinfallas/mcp-qa-11x@latest cache-clean

# Reseteo total como último recurso (borra TODAS las cachés npx + instala scripts del proyecto):
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

### Cómo Verificar la Versión Instalada y Activa del MCP

Ejecuta **`doctor`** (alias: `status`) para inspeccionar todo el entorno en un solo comando (origen del binario activo, todas las cachés `~/.npm/_npx`, sellos `.qa-11x-version` y deriva de `mcp_version`, salud y presupuesto `<= 1,536 B` de los conectores `$HOME` y `AGENTS.md`, pinning MCP seguro sin exposición de secretos más avisos de archivos divididos en Antigravity `~/.gemini/antigravity/mcp_config.json` + `~/.gemini/config/mcp_config.json`, Claude Code `~/.claude.json`, Claude Desktop multi-OS, Cursor, Windsurf, Codex y Hermes `~/.hermes/mcp.json` / `~/.hermes/config.yaml`, estado del proyecto y demonio Docker), o usa `--version` / `-v` según tu modo de instalación:

```bash
# 1. Diagnóstico integral del entorno (origen de binario, cachés _npx, skills, IDEs y Docker):
npx -y @sinfallas/mcp-qa-11x@latest doctor
npx -y @sinfallas/mcp-qa-11x@latest doctor --offline --json

# 2. Diagnóstico offline vía --version (--verbose o --json redirige a doctor --offline):
npx -y @sinfallas/mcp-qa-11x --version --verbose
npx -y @sinfallas/mcp-qa-11x --version --json

# 3. Consultar la versión ya cacheada en ~/.npm/_npx (sin forzar @latest):
npx -y @sinfallas/mcp-qa-11x --version

# 4. Inspección offline sin red del package.json exacto en la caché de npx:
grep '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json

# 5. Consultar una instalación global (npm install -g @sinfallas/mcp-qa-11x):
mcp-qa-11x --version   # o: mcp-qa-11x -v

# 6. Consultar la última versión publicada en npm:
npx -y @sinfallas/mcp-qa-11x@latest --version

# 7. Escribir o refrescar de forma segura la configuración MCP del IDE (con respaldo .11x-backup):
npx -y @sinfallas/mcp-qa-11x@latest mcp-config --client cursor --install
```

#### Instalación de Autocompletado Nativo de Shell (`completion`)

Genera los scripts de autocompletado para `fish`, `bash` o `zsh`:

```bash
# Fish:
mkdir -p ~/.config/fish/completions
npx -y @sinfallas/mcp-qa-11x@latest completion fish > ~/.config/fish/completions/mcp-qa-11x.fish

# Bash (autocompletado persistente de usuario o sesión actual):
mkdir -p ~/.local/share/bash-completion/completions
npx -y @sinfallas/mcp-qa-11x@latest completion bash > ~/.local/share/bash-completion/completions/mcp-qa-11x

# Zsh (asegura que ~/.zsh/completions esté en fpath antes de compinit):
mkdir -p ~/.zsh/completions
npx -y @sinfallas/mcp-qa-11x@latest completion zsh > ~/.zsh/completions/_mcp-qa-11x
```

> [!NOTE]
> **Por qué `npx --no-install @sinfallas/mcp-qa-11x --version` falla con `npm ERR! canceled`:** Cuando el servidor se registra mediante `mcpServers` (`npx -y @sinfallas/mcp-qa-11x@latest`), npm guarda el paquete en un entorno aislado bajo `~/.npm/_npx/<hash>/` y no en el `$PATH` global. En npm v7+, `--no-install` solo busca en `./node_modules/.bin` y en `$PATH`, ignorando `~/.npm/_npx/`.
>
> **Cómo verificar la versión activa dentro de tu IDE (Antigravity, Cursor, Claude, VS Code):** Abre el panel MCP / Customizations del IDE — `v3.10.0` registra **19 herramientas MCP** y **13 recursos MCP** (`11` URIs estáticas + `2` plantillas URI). Si aparecen menos herramientas por una versión anterior en caché, ejecuta `npx -y @sinfallas/mcp-qa-11x@latest upgrade` y **recarga/reinicia el servidor MCP (o la ventana del IDE)** para que el proceso `stdio` persistente cargue el nuevo binario. También puedes revisar `update_available` en `doctor`, `inspect_project_config` o `certify_11x_gate`, y validar el empaquetado *clean-room* cubriendo los **12 subcomandos CLI** y las **19 herramientas** mediante `mcp-server/example/verify-v2.sh` (`make test-example`).
