# 🧪 Proyecto Semilla Full-Stack para Certificación E2E de `@sinfallas/mcp-qa-11x` (`example/`)

Este directorio implementa el **proyecto de referencia y humo end-to-end (`example/`)** del servidor MCP `@sinfallas/mcp-qa-11x`, análogo a la carpeta `example/` de las imágenes Docker corporativas (`sinfallas/base-node-ionic`).

En lugar de evaluar las herramientas MCP únicamente con pruebas unitarias aisladas, el arnés [`run-example-e2e.mjs`](run-example-e2e.mjs) levanta el binario compilado real `dist/index.js` mediante un cliente MCP real sobre **`stdio` (`Client` + `StdioClientTransport`)** y opera contra una **copia temporal aislada** de este proyecto híbrido (`FastAPI + Vue 3`) sin contaminar el árbol de trabajo ni el directorio `$HOME` del desarrollador.

---

## 🛠️ Cobertura Real Certificada en Cada Ejecución

1. **9 Recursos Dinámicos (`blueprint://*`):**
   - `blueprint://manifest`
   - `blueprint://core/philosophy`
   - `blueprint://security/disa-owasp-22`
   - `blueprint://database/postgres-rls-worm`
   - `blueprint://{stack}/readme` (`fastapi` y `vue3`)
   - `blueprint://ui/refactoring-ui/{topic}` (`hierarchy`)
   - `blueprint://core/active-task-template`
   - `blueprint://core/cleanup-script`
   - `blueprint://core/roadmap-validator`
2. **12 Herramientas Ejecutables (`callTool` sobre JSON-RPC `stdio`):**
   - `inspect_project_config` (autodetección híbrida `fastapi` + `vue3`, flags estrictos, `browser_testing_readiness` y bloque `update_available`).
   - `fetch_blueprint_bundle` (descarga bajo demanda y verificación criptográfica `SHA-256`).
   - `bootstrap_or_merge_11x` (`dry_run: true` y fusión quirúrgica real preservando dependencias de negocio).
   - `inspect_ast_blast_radius` (navegación AST bidireccional sobre `list_tenant_devices` en `graphify-out/graph.json`).
   - `audit_test_pyramid_gaps` (evaluación de las 13 capas y detección real de componentes `.vue` huérfanos).
   - `audit_security_stig_owasp` (detección negativa ante inyección temporal de vulnerabilidades `UI-11X-01` / `SEC-11` / `QA-KARATE-IDEMP` y verificación `CLEAN` con `0` hallazgos tras remediación).
   - `clean_workspace_11x` (purga real de artefactos efímeros `.coverage`, `.eslintcache` y `__pycache__` preservando código y `graph.json`).
   - `init_or_append_agents_md` (inyección idempotente del conector Thin-Repo preservando reglas de dominio previas).
   - `reconcile_agents_governance` (respaldo automático, poda de duplicados promovidos y aislamiento en `domain_*_rules.md`).
   - `run_ephemeral_qa` (Fast-Path `DOCS_ONLY` + ejecución de `qa-lint` y `qa-unit` con parseo de cobertura `>= 95%` y sello `.agents/.qa-evidence.json`).
   - `certify_11x_gate` (bloqueo ante árbol sucio sin evidencia de lint o `.example` sin fusionar, y aprobación `10/10` tras certificar evidencia).
   - `propose_skill_evolution_pr` (generación Dual-Consumer de propuesta local en `.agents/proposals/` y URL pre-rellenada).
3. **3 Subcomandos CLI (`node dist/index.js`):**
   - `install-skill --target antigravity --init-agents --include-scripts` (verifica las 5 skills, scripts ejecutables y sello `.qa-11x-version`).
   - `init-agents` y `reconcile-agents`.

---

## 🚀 Ejecución en Contenedor Docker Efímero (Rule Zero)

```bash
# 1. Validación Clean-Room completa (sin node_modules ni dist previos, igual que GitHub Actions)
./scripts/probar-mcp-example.sh

# 2. Desde la raíz del monorepo vía Makefile
make test-example
```

Esta prueba se ejecuta automáticamente en **4 barreras de seguridad**:
1. `./scripts/publicar-mcp.sh` (bloquea `npm publish` si falla cualquier tool o recurso).
2. `.github/workflows/qa-11x-ci.yml` (CI en GitHub Actions).
3. Hook `pre-push` (`lefthook.yml` e `instalar-hooks.sh`).
4. Ejecución manual (`./scripts/probar-mcp-example.sh` / `make test-example`).
