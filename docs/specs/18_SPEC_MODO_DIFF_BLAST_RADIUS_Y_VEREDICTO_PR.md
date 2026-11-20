> 📜 **Aviso de Archivo Histórico (Spec 19 §3.4):** Especificación histórica (`Hito 23`, Entrega 3 de 3) preservada en español como registro arquitectónico inmutable (exenta de espejo bilingüe EN/ES; el criterio "cero nuevas tools" aplicaba al Hito 23 previo a `audit_vibe_prototype` y `blueprint://calm`, alcanzando **19 Tools y 13 Resources** en `QA-11X v3.2`). Para rutas y métricas vigentes, véase [README.es.md](README.es.md).

# ⚡ Especificación Técnica 18: Modo Diferencial en Blast Radius y Exportador Ejecutivo `PR_VERDICT.md` (Hito 23)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (`Hito 23`):** `mcp-server/src/utils/diff-bundle.ts`, `mcp-server/src/tools/blast-radius.ts`, `mcp-server/src/types.ts`, `.agents/scripts/generate_pr_verdict.py`, `Makefile`, `tests/test_generate_pr_verdict.unit.py`  
**Superficie Pública MCP:** Se mantienen intactas exactamente las **18 Tools** y **12 Resources** vigentes  
**Estado:** IMPLEMENTADO Y CERTIFICADO (HITO 23 — ENTREGA 3 DE 3)

---

## 1. Principio de Diseño: Fusión Sin Inflación de Herramientas

Esta especificación unifica las capacidades de mayor retorno del análisis de cambios y generación de veredictos de Pull Request evitando dos fuentes de desperdicio:
1. **Cero nuevas Tools/Resources MCP:** En lugar de agregar una herramienta #19 para comprimir diffs, se extiende retrocompatiblemente la herramienta existente `inspect_ast_blast_radius` (`mcp-server/src/tools/blast-radius.ts`) con modo diferencial para subagentes revisores en frío o diagnósticos tras `BREAKER-42`.
2. **Cero burocracia YAML duplicada:** Se descarta crear archivos `active_task_spec.yaml` paralelos a `.agents/ACTIVE_TASK.md`. En su lugar, cuando varios subagentes trabajen en paralelo, se soporta un filtro opcional ligero de fronteras (`allowed_globs` / `forbidden_globs`) leído desde `.agents/ACTIVE_TASK.md`.

---

## 2. Parte A — Modo `diff` Retrocompatible en `inspect_ast_blast_radius`

### 2.1. Extensión Retrocompatible del Esquema (`types.ts` y `blast-radius.ts`)

Si el invocador omite `changed_since_ref`, `inspect_ast_blast_radius` conserva su comportamiento actual al 100%. Al recibir `changed_since_ref`, activa el modo diferencial delegando en `mcp-server/src/utils/diff-bundle.ts` (complejidad cognitiva `SonarJS <= 15`):

- `changed_since_ref?: string` — Referencia Git base validada estrictamente contra `/^(?!-)[a-zA-Z0-9._\/~^-]{1,128}$/` (prohíbe guion inicial para prevenir *option injection*), ejecutada vía `execFile('git', ['diff', '--unified=1', '--no-color', '--no-ext-diff', ref], { cwd: safeWorkspacePath })` con `shell: false` y confinamiento `fs.realpathSync` dentro del workspace.
- `max_tokens_budget?: number` — Presupuesto de salida en tokens (por defecto `4000`, usando la estimación `Math.ceil(chars / 4)` alineada con `.agents/scripts/compact_context_11x.py`).

### 2.2. Poda Semántica en 4 Niveles, Redacción DRY y Alertas 11X

1. **Clasificación y Poda Determinista (ahorro objetivo `>= 60%`):**
   - **Nivel 0 (`PRUNED_NOISE`):** `pnpm-lock.yaml`, `uv.lock`, `composer.lock`, `package-lock.json`, `*.min.js`, `*.min.css`, `*.map`, `*.snap` y binarios; se omite el cuerpo del diff preservando solo ruta y conteo `+`/`-`.
   - **Nivel 1 (`CRITICAL_FULL`):** Migraciones (`alembic/versions/`, `migrations/`), módulos de seguridad/autenticación, `.agents/`, `Dockerfile*`, `manifest.json` y rutas/contratos API; se conservan completos mientras haya presupuesto.
   - **Nivel 2 (`CORE_LOGIC`):** Código productivo restante; hunks mayores a 80 líneas colapsan tramos internos repetitivos conservando encabezados `@@ ... @@` y firmas.
   - **Nivel 3 (`TESTS_SUMMARY`):** Si la suma supera `max_tokens_budget`, las suites de prueba se resumen listando únicamente los nombres de casos `test_*` / `it(...)` / `Scenario:` añadidos o editados.
2. **Redacción Obligatoria Reutilizando `promptGuard.ts`:** Todo hunk saliente pasa por `redactPiiAndSecrets` (`mcp-server/src/security/promptGuard.ts`) con marcador `secret_leak_warning` (cero regex duplicadas).
3. **Cruce AST y Alertas Deterministas:** Fusiona los dependientes directos desde `graphify-out/graph.json` para cada archivo tocado, emite alerta `MISSING_KARATE_API_FEATURE` cuando cambia una ruta/controlador sin tocar `*.feature`, y verifica opcionalmente `allowed_globs` / `forbidden_globs` si están declarados en `.agents/ACTIVE_TASK.md`.

---

## 3. Parte B — Exportador Ejecutivo `PR_VERDICT.md` (`generate_pr_verdict.py`)

### 3.1. Reutilización de Infraestructura Existente (Cero Duplicación)

El generador `.agents/scripts/generate_pr_verdict.py` (Python 3.12+ stdlib pura, `CC <= 5`, `mypy --strict`) **no reimplementa parsers JUnit XML ni cálculo de compuertas**. Consolida directamente:
- `.agents/scripts/release_readiness_gate.py` (resumen JUnit XML con guardia Anti-XXE y decisión `GO`/`NO_GO`).
- `.agents/.qa-evidence.json` (`qa-evidence.ts`) y `.agents/.cache/certify_state.json` (rachas y oscilaciones).
- `.agents/scripts/verify_diff_coverage.py` (métricas de cobertura diferencial).

### 3.2. Artefactos Generados y Rigor del Sello de Consistencia (`SHA-256`)

- **Salida Humana en Español (`.agents/artifacts/PR_VERDICT.md`):** Documento listo para usar directamente con `gh pr create --body-file .agents/artifacts/PR_VERDICT.md` incluyendo: veredicto global (`APTO PARA MERGE` | `BLOQUEADO`), nivel de riesgo determinista (`BAJO` | `MEDIO` | `ALTO`), tabla resumen por módulo, matriz de evidencia 11X y dependientes AST verificados.
- **Salida Estructurada (`.agents/artifacts/pr_verdict_attestation.json`, permisos `0600`):** Carga JSON canónica (`sort_keys=True, separators=(',', ':')`) con `git_head_sha`, huella del árbol de código, `manifest_sha256` y métricas de la corrida.
- **Alcance de Seguridad del Sello:** El `attestation_sha256` local actúa como **sello de integridad y consistencia árbol-evidencia** (demuestra que el Markdown corresponde exactamente al `git tree` evaluado y no quedó obsoleto tras commits posteriores). En entornos CI con clave custodiada externa (`QA11X_ATTESTATION_KEY`), adjunta además `hmac_sha256` verificable fuera del entorno del agente.
- **Firma CLI Congelada:** `python3 .agents/scripts/generate_pr_verdict.py --output-md .agents/artifacts/PR_VERDICT.md --output-json .agents/artifacts/pr_verdict_attestation.json` (devuelve `0` en generación exitosa o `30` si faltan evidencias mínimas o el árbol diverge).

---

## 4. Desglose en Micro-Tareas Atómicas (`Hito 23`) y Verificación Rule Zero

| Micro-Tarea | Alcance Exacto | Verificación Efímera (`Rule Zero`) |
| :--- | :--- | :--- |
| **`23.1`** | Crear `mcp-server/src/utils/diff-bundle.ts` (`SonarJS <= 15`, `execFile` sin shell) con poda en 4 niveles, redacción vía `promptGuard.ts`, alerta `MISSING_KARATE_API_FEATURE` y fronteras opcionales de `ACTIVE_TASK.md`. | `make lint` en `sinfallas/base-node-ionic:26`. |
| **`23.2`** | Extender retrocompatiblemente `BlastRadiusInputSchema` (`changed_since_ref`, `max_tokens_budget`) en `mcp-server/src/types.ts` y `mcp-server/src/tools/blast-radius.ts` preservando las 18 Tools y 12 Resources. | `make lint && make build` en `sinfallas/base-node-ionic:26`. |
| **`23.3`** | Crear `mcp-server/tests/diff-blast-radius.unit.ts` (`>= 95%` cobertura: ahorro `>= 60%`, redacción de secretos, `baseRef` inválido) y actualizar `mcp-server/test/mcp_cli_test.feature`. | `make test-mcp && make test-karate` (`sinfallas/base-node-ionic:26`, `sinfallas/karatelabs:1.5.1`). |
| **`23.4`** | Crear `.agents/scripts/generate_pr_verdict.py` (`CC <= 5`) reutilizando `release_readiness_gate.py`, `.agents/.qa-evidence.json` y `verify_diff_coverage.py` para emitir `PR_VERDICT.md` + `pr_verdict_attestation.json`. | Validación `ruff` (`CC <= 5`) y `mypy --strict` en `sinfallas/base-python-uv:3.15`. |
| **`23.5`** | Crear `tests/test_generate_pr_verdict.unit.py` (`>= 95%` cobertura en `sinfallas/base-python-uv:3.15`) y exponer el target `make pr-verdict` en `Makefile`. | `make test-py && make pr-verdict`. |
| **`23.6`** | Actualizar `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `TESTING.md` y `CHANGELOG.md`. | `./scripts/actualizar-grafos-graphify.sh`, `make sync-governance`, `make lint-docs` y `make certify`. |
