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
* `--target, -t <entorno>`: `auto` (defecto: instala las 5 skills exclusivamente en los directorios globales de agentes IA detectados en `$HOME`; fallback a `workspace` solo si no hay agentes globales) | `workspace` | `antigravity` | `claude` | `cursor` | `hermes` | `all`.
* `--init-agents`: Crea `AGENTS.md` o inyecta de forma aditiva y no destructiva el bloque conector de QA 11X al final del `AGENTS.md` existente (y sincroniza `~/.gemini/GEMINI.md`).
* `--include-scripts`: Descarga e instala únicamente los scripts ejecutables de certificación y auditoría (`.agents/scripts/*`, `scripts/*`), archivos comunes de CI/hooks y `.agents/ACTIVE_TASK.md.example` (`0o755`), sin copiar `.agents/rules/*.md`.
* `--reconcile`: Reconcilia la gobernanza Thin-Repo del proyecto consumidor, eliminando copias locales de las 7 reglas canónicas y las 5 skills en `<proyecto>/.agents/`, y extrayendo reglas de negocio propias hacia `.agents/rules/domain_<project>_rules.md` con respaldo en `.agents/backups/`.

---

## 🛠️ Herramientas Expuestas (12 Tools)

1. **`inspect_project_config`:** Audita el directorio del proyecto detectando stack, herramientas y archivos faltantes.
2. **`fetch_blueprint_bundle`:** Descarga bajo demanda plantillas `.example` y scripts con verificación SHA-256 (modo índice ligero `include_content: false` por defecto).
3. **`bootstrap_or_merge_11x`:** Fusión quirúrgica no destructiva de configuraciones (`package.json`, `pyproject.toml`, `Makefile`, `.gitignore`).
4. **`inspect_ast_blast_radius`:** Análisis de radio de impacto AST antes de refactorizaciones y evaluación de elegibilidad `MICRO_CHANGE`.
5. **`clean_workspace_11x`:** Saneamiento de artefactos temporales de pruebas y cachés.
6. **`audit_security_stig_owasp`:** Auditoría estática de reglas DISA ASD STIG V6R5 / OWASP v4.2 y ergonomía visual con agrupación compacta (`max_findings`).
7. **`run_ephemeral_qa`:** Ejecución de targets del `Makefile` en contenedores Docker efímeros (Regla Cero) con soporte `skip_if_docs_only`.
8. **`certify_11x_gate`:** Compuerta unificada de certificación 11X de 10 etapas.
9. **`audit_test_pyramid_gaps`:** Auditoría de brechas en las 13 capas de la pirámide 11X.
10. **`init_or_append_agents_md`:** Inyección no destructiva del bloque conector QA 11X en `AGENTS.md` y `~/.gemini/GEMINI.md`.
11. **`propose_skill_evolution_pr`:** Propuesta federada de mejoras hacia `qa-testing-blueprints`.
12. **`reconcile_agents_governance`:** Reconciliación Thin-Repo de `.agents/`, podado de duplicados y aislamiento de reglas de dominio en `domain_<project>_rules.md`.

---

## 📚 Recursos Expuestos (8 Resources)

- `blueprint://manifest`: Manifiesto criptográfico completo (`manifest.json`).
- `blueprint://core/philosophy`: Filosofía y las 13 capas de calidad 11X.
- `blueprint://security/disa-owasp-22`: Catálogo de los 22 patrones DISA STIG V6R5 y OWASP v4.2.
- `blueprint://{stack}/readme`: Guía operativa por ecosistema tecnológico.
- `blueprint://ui/refactoring-ui/{topic}`: Módulos de diseño y accesibilidad WCAG 2.1 AA.
- `blueprint://core/active-task-template`: Plantilla canónica `.agents/ACTIVE_TASK.md.example`.
- `blueprint://core/cleanup-script`: Script universal `scripts/limpieza.sh`.
- `blueprint://core/roadmap-validator`: Validador bidireccional `verify_roadmap_consistency.py`.
