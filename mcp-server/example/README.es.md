# 🧪 Proyecto Semilla Full-Stack para Certificación E2E de `@sinfallas/mcp-qa-11x` (`example/`)

> 🌐 **Idioma / Language:** [🇬🇧 English (README.md)](README.md) | **Español (Espejo 1:1)**

Este directorio implementa el **proyecto de referencia y humo end-to-end (`example/`)** del servidor MCP `@sinfallas/mcp-qa-11x`, análogo a la carpeta `example/` de las imágenes Docker corporativas (`sinfallas/base-node-ionic`).

En lugar de evaluar las herramientas MCP únicamente con pruebas unitarias aisladas, el arnés [`run-example-e2e.mjs`](run-example-e2e.mjs) levanta el binario compilado real `dist/index.js` mediante un cliente MCP real sobre **`stdio` (`Client` + `StdioClientTransport`)** y opera contra una **copia temporal aislada** de este proyecto híbrido (`FastAPI + Vue 3`) sin contaminar el árbol de trabajo ni el directorio `$HOME` del desarrollador.

---

## 🛠️ Cobertura Real Certificada en Cada Ejecución

1. **13 Recursos Dinámicos (`blueprint://*`, con soporte `?lang=es|en`):**
   - `blueprint://manifest`
   - `blueprint://core/philosophy`
   - `blueprint://security/disa-owasp-22`
   - `blueprint://database/postgres-rls-worm`
   - `blueprint://{stack}/readme` (`fastapi` y `vue3`)
   - `blueprint://ui/refactoring-ui/{topic}` (`hierarchy`)
   - `blueprint://core/active-task-template`
   - `blueprint://core/cleanup-script`
   - `blueprint://core/roadmap-validator`
   - `blueprint://ai/evals-redteam` *(v2.0)*
   - `blueprint://mobile-appium/readme` *(v2.0)*
   - `blueprint://vibe-rescue/readme` *(v2.0)*
   - `blueprint://skills/tactical-patterns-11x` *(v3.1)*
2. **19 Herramientas Ejecutables (`callTool` sobre JSON-RPC `stdio`):**
   - **12 núcleo v1:** `inspect_project_config`, `fetch_blueprint_bundle`, `bootstrap_or_merge_11x`, `inspect_ast_blast_radius`, `audit_test_pyramid_gaps`, `audit_security_stig_owasp`, `clean_workspace_11x`, `init_or_append_agents_md`, `reconcile_agents_governance`, `run_ephemeral_qa`, `certify_11x_gate` y `propose_skill_evolution_pr`.
   - **7 herramientas v2.0/v3.1:** `validate_calm_architecture`, `evaluate_release_gate`, `evaluate_agent_trajectory`, `run_llm_red_team`, `audit_vibe_prototype`, `sync_enterprise_tms` y `session_flight_recorder` (protegidas con `promptGuard` + `TaskStateGuard`).
3. **5 Subcomandos CLI + Verificador Tarball Clean-Room (`verify-v2.sh`):**
   - `quickstart` (`--tier`/`-T`), `install-skill` (`install`), `init-agents`, `reconcile-agents`, `tms-sync`, `--version` (`3.0.0`), `--help`/`help` y sonda no bloqueante TTY `QA-CLI-TTY-01` (`< 5s`).

---

## 🚀 Ejecución en Contenedor Docker Efímero (Rule Zero)

```bash
# 1. Validación Clean-Room completa (sin node_modules ni dist previos, igual que GitHub Actions)
./scripts/probar-mcp-example.sh

# 2. Desde la raíz del monorepo vía Makefile
make test-example
```

Esta prueba se ejecuta automáticamente en **4 barreras de seguridad**:
1. `scripts/publicar-mcp.sh` (bloquea `npm publish` si falla cualquier tool o recurso).
2. `.github/workflows/qa-11x-ci.yml` (CI en GitHub Actions).
3. Hook `pre-push` (`lefthook.yml` e `instalar-hooks.sh`).
4. Ejecución manual (`./scripts/probar-mcp-example.sh` / `make test-example`).
