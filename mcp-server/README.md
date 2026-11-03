# ⚙️ @sinfallas/mcp-qa-11x — Servidor MCP e Instalador de Skills QA 11X

Servidor oficial de **Model Context Protocol (MCP)** e Instalador Universal para **QA Testing Blueprints** (Estándar Corporativo Nivel 11X, DISA ASD STIG V6R5 y OWASP Developer Guide v4.2).

## 🚀 Uso Rápido sin Instalación

### 1. Iniciar Servidor MCP (stdio)
Compatible con Antigravity, Claude Desktop, Cursor, Hermes Agent y VS Code:

```bash
npx -y @sinfallas/mcp-qa-11x
```

#### Configuración en Claude Desktop / Antigravity (`mcp_config.json`):
```json
{
  "mcpServers": {
    "qa-11x": {
      "command": "npx",
      "args": ["-y", "@sinfallas/mcp-qa-11x"]
    }
  }
}
```

### 2. Instalar Skills Directamente vía CLI
Instala las skills `qa-11x-architect` y `refactoring-ui` con verificación criptográfica SHA-256:

```bash
npx -y @sinfallas/mcp-qa-11x install-skill [--target antigravity|claude|cursor|hermes|workspace|all]
```

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
