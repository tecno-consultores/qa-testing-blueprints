# ⚙️ @sinfallas/mcp-qa-11x — Servidor MCP e Instalador de Skills QA 11X

Servidor oficial de **Model Context Protocol (MCP)** e Instalador Universal Thin-Repo para **[QA Testing Blueprints](https://github.com/tecno-consultores/qa-testing-blueprints)** (Estándar Corporativo Nivel 11X, **DISA ASD STIG V6R5** y **OWASP Developer Guide v4.2**).

- **Repositorio Oficial:** [https://github.com/tecno-consultores/qa-testing-blueprints](https://github.com/tecno-consultores/qa-testing-blueprints)
- **Guía de Integración con Agentes IA:** [docs/ai-integration.md](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/docs/ai-integration.md)
- **Cuadro de Mando y Métricas 11X:** [TESTING.md](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/TESTING.md)

---

## 🚀 Uso Rápido sin Instalación (`Zero-Clone`)

### 1. Iniciar Servidor MCP (`stdio`)
Compatible con **Google Antigravity**, **Claude Desktop / Claude Code**, **Cursor**, **Windsurf**, **Hermes Agent** y **VS Code**:

```bash
npx -y @sinfallas/mcp-qa-11x@latest
```

#### Configuración en Antigravity / Claude Desktop / Cursor (`mcp_config.json`):
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

### 2. Instalar Skills Globales, Scripts y Conector `AGENTS.md` vía CLI
Instala el catálogo completo de **5 skills corporativas** en los directorios globales de tus agentes IA, descarga los scripts operativos (`.agents/scripts/*`, `scripts/*`), reconcilia duplicados locales e inyecta el conector en `AGENTS.md` (y el puntero ligero sin duplicación en `~/.gemini/GEMINI.md`) con verificación criptográfica **SHA-256 (`DISA STIG V-222513`)**:

```bash
# Instalación y reconciliación recomendada en un proyecto:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts --reconcile

# Con selección explícita de entorno destino:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|antigravity|claude|cursor|hermes|workspace|all] --init-agents --include-scripts --reconcile

# Inyectar de forma aditiva y no destructiva únicamente el conector QA 11X en AGENTS.md:
npx -y @sinfallas/mcp-qa-11x@latest init-agents [--project-path <ruta>] [--dry-run]

# Reconciliar y podar reglas/skills duplicadas en un proyecto consumidor:
npx -y @sinfallas/mcp-qa-11x@latest reconcile-agents [--project-path <ruta>] [--dry-run]

# Forzar actualización limpia de caché global a la última versión publicada:
rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts --reconcile
```

#### Opciones de `install-skill`:
* `--target, -t <entorno>`: `auto` (defecto: instala las 5 skills exclusivamente en los directorios globales de agentes IA detectados en `$HOME`; fallback a `workspace` solo si no hay agentes globales) | `workspace` | `antigravity` | `claude` | `cursor` | `hermes` | `all`.
* `--init-agents`: Crea `AGENTS.md` o inyecta de forma aditiva y no destructiva el bloque conector de QA 11X al final del `AGENTS.md` existente y sincroniza el puntero global ligero en `~/.gemini/GEMINI.md` (cero duplicación con las skills y el servidor MCP).
* `--include-scripts`: Descarga e instala únicamente los scripts ejecutables de certificación y auditoría (`.agents/scripts/*`, `scripts/*`), archivos comunes de CI/hooks y `.agents/ACTIVE_TASK.md.example` (`0o755`), sin copiar `.agents/rules/*.md`.
* `--reconcile`: Reconcilia la gobernanza Thin-Repo del proyecto consumidor, eliminando copias locales de las 7 reglas canónicas y las 5 skills en `<proyecto>/.agents/`, y extrayendo reglas de negocio propias hacia `.agents/rules/domain_<project>_rules.md` con respaldo en `.agents/backups/`.

---

## 🧠 Catálogo de 5 Skills Corporativas Incluidas

1. **`qa-11x-architect`:** Arquitecto Maestro QA 11X y DevSecOps (`SKILL.md < 20 KB`: 13 capas de la Pirámide 11X, 10 Leyes Innegociables, 8 Reglas Anti-Ceguera UAT incluyendo continuidad Pre-Auth `SEC-16`, Economía Cognitiva de Tokens con 3 vías proporcionales `DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X` y 22 controles DISA STIG V6R5 / OWASP v4.2 con 9 módulos `references/*.md` bajo demanda).
2. **`graphify-ast-navigator`:** Navegación bidireccional del Grafo de Conocimiento AST (`graphify-out/graph.json` y `GRAPH_REPORT.md`) obligatoria tanto para **responder preguntas sobre el código o arquitectura (`Code Q&A`: `Graphify AST-First, Grep-Fallback, Windowed-Read-Second`)** como para auditar el radio de impacto antes de refactorizar y validar fronteras de capas.
3. **`qa-11x-docker-certifier`:** Certificador de ejecución efímera en Docker (**Regla Cero**: cobertura unitaria `>= 95%` con `COVERAGE_FILE=/tmp/.coverage`, complejidad ciclomática/cognitiva Grado A, Karate Labs BDD, pruebas de mutación y cero contaminación del sistema operativo anfitrión).
4. **`docker-trivy-keydb-hardening`:** Hardening de contenedores (`Trivy HIGH/CRITICAL = 0`), motor en memoria multihilo KeyDB, usuarios no-root y builds multi-etapa.
5. **`refactoring-ui`:** Jerarquía visual, espaciado, tipografía (`tabular-nums`), contraste OKLCH (`WCAG 2.2 AA`), modo oscuro y geometría real Anti-JSDOM con 9 módulos `references/*.md`.

---

## 📦 Ecosistemas Tecnológicos Soportados (7 Stacks)

| Stack | Tecnología Principal | Herramientas de Calidad y Seguridad 11X |
| :--- | :--- | :--- |
| **`fastapi`** | Python 3.11–3.15 + FastAPI + PostgreSQL 17 + KeyDB | Ruff, Mypy, Bandit, Radon, Pytest (`>=95%`), Schemathesis, Karate Labs BDD, Mutmut, OWASP ZAP, Locust + Pumba |
| **`python`** | Python 3.11–3.15 (Librerías y CLI) | Ruff, Mypy, Bandit, Radon, Pytest (`>=95%`), Hypothesis, Mutmut |
| **`node-backend`** | Node.js 22–26 + TypeScript (Express / Fastify) | ESLint, SonarJS, Vitest (`>=95%`), Supertest, Karate Labs BDD, Stryker, OWASP ZAP |
| **`vue3`** | Vue 3 + TypeScript + Vite + Pinia | ESLint, SonarJS, `vue-tsc`, Vitest (`>=95%`), Playwright + `@axe-core` (WCAG 2.1 AA), Karate UI, Stryker, Lighthouse CI |
| **`react-frontend`** | React 19 + TypeScript + Vite | ESLint, SonarJS, `tsc`, Vitest (`>=95%`), Playwright + `@axe-core`, Karate UI, Stryker, Lighthouse CI |
| **`php`** | PHP 8.2–8.5 (Symfony / Laravel / Slim) | PHP-CS-Fixer, PHPStan (Max), Psalm Taint, Pest/PHPUnit + PCOV (`>=95%`), Karate Labs BDD, Infection MSI, OWASP ZAP |
| **`bash-scripts`** | Bash / Shell (Automatización y DevSecOps) | ShellCheck, `shfmt`, BATS-core, Kcov (`>=95%`), Trivy |

---

## 🛠️ Herramientas Expuestas en el Servidor MCP (12 Tools)

1. **`inspect_project_config`:** Audita el directorio del proyecto detectando stacks tecnológicos, banderas de configuración estricta, madurez de navegador/UI y archivos 11X faltantes.
2. **`fetch_blueprint_bundle`:** Descarga bajo demanda plantillas `.example` y scripts con verificación SHA-256 (modo índice ligero `include_content: false` por defecto para ahorro extremo de tokens).
3. **`bootstrap_or_merge_11x`:** Fusión quirúrgica no destructiva de configuraciones (`package.json`, `pyproject.toml`, `Makefile` con `COVERAGE_FILE=/tmp/.coverage`, `.gitignore`, `.npmrc`).
4. **`inspect_ast_blast_radius`:** Navegación AST bidireccional sobre `graphify-out/graph.json` y `GRAPH_REPORT.md` tanto para responder preguntas sobre código/arquitectura (`declaring_files` con `archivo:L<línea>`, llamadores entrantes, `outgoing_dependencies` y `graph_reports`) como para calcular el radio de impacto antes de refactorizar (`auto_build_if_missing`, `refresh_graph` y elegibilidad `MICRO_CHANGE`).
5. **`clean_workspace_11x`:** Saneamiento seguro de artefactos temporales de pruebas, cachés de Docker y archivos bloqueados por root.
6. **`audit_security_stig_owasp`:** Auditoría estática de reglas DISA ASD STIG V6R5 y OWASP v4.2 (`SEC-01` a `SEC-16`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-SMOKE-01`, `UI-11X-01`, `UI-11X-02`, incluyendo PostgreSQL RLS multi-transacción `after_begin`, cadena forense WORM `seq_num` + `pg_advisory_xact_lock`, propagación de credenciales efímeras en Docker y continuidad atómica Pre-Auth multi-etapa) con agrupación compacta (`grouped_findings`).
7. **`run_ephemeral_qa`:** Ejecución aislada de targets del `Makefile` en contenedores Docker efímeros (**Regla Cero**) con soporte `skip_if_docs_only` y condensación Pass-Quiet.
8. **`certify_11x_gate`:** Compuerta unificada de certificación 11X (secretos, JSON, componentes huérfanos UI, endpoints API huérfanos, paridad ORM/Alembic con soporte monorepo, topología AST, seguridad STIG/OWASP y sincronía documental).
9. **`audit_test_pyramid_gaps`:** Auditoría estática de las 13 capas de la pirámide 11X (`L01` a `L13`), detección de 3 fases temporales, refresco dual y plan de acción priorizado.
10. **`init_or_append_agents_md`:** Inyección aditiva y no destructiva del bloque conector QA 11X en `AGENTS.md` y sincronización del conector global ligero sin duplicación en `~/.gemini/GEMINI.md`.
11. **`propose_skill_evolution_pr`:** Propuesta federada Zero-Trust de mejoras empíricas hacia `tecno-consultores/qa-testing-blueprints` (vía `gh` CLI o generación de plantilla + URL pre-llenada).
12. **`reconcile_agents_governance`:** Reconciliación Thin-Repo de `.agents/`, podado de duplicados de reglas/skills globales y aislamiento de reglas de dominio en `.agents/rules/domain_<project>_rules.md`.

---

## 📚 Recursos Expuestos en el Servidor MCP (9 Resources)

- `blueprint://manifest`: Manifiesto criptográfico completo (`manifest.json`).
- `blueprint://core/philosophy`: Filosofía y las 13 capas de calidad 11X.
- `blueprint://security/disa-owasp-22`: Catálogo de los 22 patrones DISA STIG V6R5 y OWASP v4.2.
- `blueprint://{stack}/readme`: Guía operativa por ecosistema tecnológico (`fastapi`, `python`, `node-backend`, `vue3`, `react-frontend`, `php`, `bash-scripts`).
- `blueprint://ui/refactoring-ui/{topic}`: Módulos de diseño y accesibilidad WCAG 2.1/2.2 AA (`skill`, `hierarchy`, `layout`, `type`, `color`, `depth`, `images`, `polish`, `dark-mode`, `tailwind`).
- `blueprint://core/active-task-template`: Plantilla canónica `.agents/ACTIVE_TASK.md.example`.
- `blueprint://core/cleanup-script`: Script universal `scripts/limpieza.sh`.
- `blueprint://core/roadmap-validator`: Validador bidireccional `verify_roadmap_consistency.py`.
- `blueprint://database/postgres-rls-worm`: Implementación canónica de PostgreSQL 17 RLS Multi-Transacción (`after_begin`) y cadena forense WORM determinista (`seq_num` + `pg_advisory_xact_lock`).

---

## 📄 Autoría, Copyright y Licencia

- **Autor:** Jesus Palencia (`<sinfallas@gmail.com>`)
- **Copyright:** `Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)`
- **Licencia:** Distribuido bajo la licencia [MIT](https://github.com/tecno-consultores/qa-testing-blueprints/blob/main/LICENSE).
