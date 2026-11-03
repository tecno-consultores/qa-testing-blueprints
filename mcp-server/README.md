# ⚙️ @sinfallas/mcp-qa-11x — Servidor MCP e Instalador de Skills QA 11X

Servidor oficial de **Model Context Protocol (MCP)** e Instalador Universal para **QA Testing Blueprints** (Estándar Corporativo Nivel 11X, DISA ASD STIG V6R5 y OWASP Developer Guide v4.2).

## 🚀 Uso Rápido sin Instalación

### 1. Iniciar Servidor MCP (stdio)
Compatible con Antigravity, Claude Desktop, Cursor, Hermes Agent y VS Code:

```bash
npx -y @sinfallas/mcp-qa-11x@latest
```

#### Configuración en Claude Desktop / Antigravity (`mcp_config.json`):
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

### 2. Instalar Skills, Scripts y Conector `AGENTS.md` vía CLI
Instala el catálogo completo de 5 skills (`qa-11x-architect`, `refactoring-ui`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `qa-11x-docker-certifier`), descarga los scripts operativos (`.agents/scripts/*`, `scripts/*`) e inyecta el conector en `AGENTS.md` con verificación criptográfica SHA-256:

```bash
# Instalación completa recomendada en un repositorio:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts

# Con todas las opciones explícitas:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|antigravity|claude|cursor|hermes|workspace|all] --init-agents --include-scripts

# O inyectar de forma aditiva y no destructiva únicamente el conector QA 11X en AGENTS.md:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--dry-run]
```

#### Opciones de `install-skill`:
* `--target, -t <entorno>`: `auto` (defecto: autodetecta agentes globales y workspace) | `workspace` | `antigravity` | `claude` | `cursor` | `hermes` | `all`.
* `--init-agents`: Crea `AGENTS.md` o inyecta de forma aditiva y no destructiva el bloque conector de QA 11X al final del `AGENTS.md` existente.
* `--include-scripts`: Descarga e instala los scripts de certificación y auditoría (`.agents/scripts/*`, `scripts/*`) con permisos `0o755`.

---

## 🛠️ Herramientas Expuestas (Tools)

1. **`inspect_project_config`:** Audita el directorio del proyecto detectando stack, herramientas y archivos faltantes.
2. **`fetch_blueprint_bundle`:** Descarga bajo demanda plantillas `.example` y scripts con verificación SHA-256.
3. **`bootstrap_or_merge_11x`:** Fusión quirúrgica no destructiva de configuraciones (`package.json`, `pyproject.toml`, `Makefile`, `.gitignore`).
4. **`inspect_ast_blast_radius`:** Análisis de radio de impacto antes de refactorizaciones.

---

## 📚 Recursos Expuestos (Resources)

- `blueprint://manifest`: Manifiesto criptográfico completo (`manifest.json`).
- `blueprint://core/philosophy`: Filosofía y las 13 capas de calidad 11X.
- `blueprint://security/disa-owasp-22`: Catálogo de los 22 patrones DISA STIG V6R5 y OWASP v4.2.
- `blueprint://{stack}/readme`: Guía operativa por ecosistema tecnológico.
- `blueprint://ui/refactoring-ui/{topic}`: Módulos de diseño y accesibilidad WCAG 2.1 AA.
