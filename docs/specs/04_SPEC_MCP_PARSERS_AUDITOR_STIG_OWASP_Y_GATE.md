# 🛡️ Especificación 04: Parsers Ahorradores de Tokens, Auditor DISA STIG / OWASP y Compuerta 11X (Tools 5–7)

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Directorio de Implementación:** `mcp-server/src/tools/` y `mcp-server/src/parsers/`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Desarrolladores  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Propósito

Esta especificación define las tres herramientas de validación y ejecución del servidor MCP (`audit_security_stig_owasp`, `run_ephemeral_qa` y `certify_11x_gate`), junto con los **Parsers Ahorradores de Tokens** que transforman miles de líneas de salida de consola de Docker en un resumen JSON compacto de menos de 40 líneas.

---

## 2. Especificación de Tool 5: `audit_security_stig_owasp`

- **Propósito:** Audita estáticamente el código fuente del proyecto destino frente a los **22 patrones de seguridad por diseño (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2)** definidos en `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`.
- **Esquema Zod de Entrada:**
  ```typescript
  const AuditSecurityInputSchema = z.object({
    project_path: z.string().min(1),
  });
  ```
- **Reglas de Detección Estática que DEBE Implementar (`src/tools/security-auditor.ts`):**

| ID Regla | Patrón / Referencia DISA STIG & OWASP | Condición de Hallazgo (Violation) | Severidad |
| :--- | :--- | :--- | :--- |
| **`SEC-01`** | Mass Assignment (`OWASP API3:2023`) | Clases `BaseModel` de Pydantic de entrada (`*Request`, `*Create`, `*Update`) sin `extra="forbid"`. | `HIGH` |
| **`SEC-02`** | Anti-CSWSH (`DISA V-222596`) | Decorador `@*.websocket(` sin verificación previa de `headers.get("origin")` o cierre `4403`. | `HIGH` |
| **`SEC-03`** | Command Injection & Deserialization (`APSC-DV-002510`) | Uso de `shell=True`, `os.system(`, `pickle.loads(`, `yaml.load(` (sin `SafeLoader`), o `eval(`. | `CRITICAL` |
| **`SEC-04`** | XML External Entity — XXE (`APSC-DV-002390 / 002550`) | Uso de `etree.fromstring` o `xml.etree` sin `resolve_entities=False` o sin `defusedxml`. | `HIGH` |
| **`SEC-05`** | Canonicalización Unicode (`APSC-DV-002520`) | Validadores de entrada de texto en API sin normalización `NFKC` (`unicodedata.normalize("NFKC"` o `.normalize("NFKC")`). | `MEDIUM` |
| **`SEC-06`** | XSS & Prototype Pollution (`APSC-DV-002490`) | Uso de `v-html`, `innerHTML` o `dangerouslySetInnerHTML` sin función de escape `escapeHtml`. | `HIGH` |
| **`SEC-07`** | Swagger Expuesto en Producción (`OWASP API8:2023`) | Instanciación de `FastAPI(` sin condicional `docs_url=None` / `redoc_url=None` / `openapi_url=None` para producción. | `MEDIUM` |
| **`SEC-08`** | Cabeceras OWASP OSHP (`OWASP 5.4.4`) | Ausencia de cabeceras `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options` y `Cache-Control: no-store`. | `MEDIUM` |
| **`SEC-09`** | Zero-Trust NPM Scripts (`OWASP SFL`) | Proyecto con `package.json` que carece de `.npmrc` con `ignore-scripts=true`. | `HIGH` |
| **`SEC-10`** | Secretos en Código (`APSC-DV-000650 / V-222444`) | Ejecución interna de patrones de `scripts/verificar-secretos.sh` detectando claves privadas o tokens hardcodeados. | `CRITICAL` |

- **Salida JSON Estructurada:**
  ```json
  {
    "project_path": "/ruta/al/proyecto",
    "passed": false,
    "total_files_scanned": 42,
    "findings_count": { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 1 },
    "findings": [
      {
        "rule_id": "SEC-01",
        "severity": "HIGH",
        "stig_owasp_ref": "OWASP API3:2023 / Patrón 1",
        "file": "src/schemas/user.py",
        "line": 14,
        "message": "El esquema UserCreateRequest hereda de BaseModel pero no declara ConfigDict(extra='forbid').",
        "remediation": "Añadir model_config = ConfigDict(extra='forbid') dentro de la clase."
      }
    ]
  }
  ```

---

## 3. Especificación de Tool 6: `run_ephemeral_qa` (Ejecutor Seguro en Docker + Parsers)

- **Propósito:** Ejecuta de forma segura y aislada un target de pruebas del `Makefile` dentro de contenedores Docker efímeros (`Rule Zero`), bloqueando cualquier intento de inyección de comandos y resumiendo la salida en un JSON estructurado.
- **Esquema Zod de Entrada:**
  ```typescript
  const RunEphemeralQaInputSchema = z.object({
    project_path: z.string().min(1),
    stage: z.enum([
      "lint",
      "unit",
      "parity",
      "orphans",
      "contracts",
      "bdd",
      "mutation",
      "dast",
      "e2e",
      "perf",
      "chaos",
      "all",
    ]),
    timeout_seconds: z.number().int().min(10).max(900).default(300),
  });
  ```
- **Guardrail de Seguridad (Prevención Absoluta de Command Injection — `DISA APSC-DV-002510`):**
  - **PROHIBIDO** usar `exec` con cadena interpolada o `shell: true`.
  - Se DEBE usar exclusivamente `execFile("make", [`qa-${stage}`], { cwd: resolvedProjectPath, timeout: timeout_seconds * 1000, shell: false })`.
  - El argumento `stage` está estrictamente validado contra el `z.enum(...)` en lista blanca.

### 3.1. Especificación de los Parsers Ahorradores de Tokens (`src/parsers/output-parsers.ts`)
El módulo `output-parsers.ts` recibirá el `stdout` y `stderr` crudos de `make qa-<stage>` y extraerá mediante expresiones regulares deterministas los siguientes indicadores:

1. **Parser de Cobertura (`Pytest-Cov` / `Vitest v8` / `kcov`):**
   - En Python (`pytest-cov`): extrae la línea `TOTAL ... <stmts> <miss> <cover>%` y las filas de archivos con `< 100%` junto con sus rangos de líneas faltantes (`Missing`, ej. `45-52, 78`).
   - En Node/Vue/React (`vitest --coverage`): extrae la fila `All files | <stmts> | <branch> | <funcs> | <lines>` y los archivos con líneas sin cubrir.
   - Calcula `coverage_passed = coverage_percent >= 95.0`.
2. **Parser de Pruebas Fallidas (`failed_tests`):**
   - Extrae los nombres de tests precedidos por `FAILED ` (Pytest), `FAIL ` (Vitest) o `not ok ` (BATS) junto con las primeras 5 líneas del motivo de aserción (`AssertionError` / `expect(...)`).
3. **Parser de Complejidad y Linters (`Radon` / `Ruff` / `Mypy` / `ESLint` / `SonarJS` / `ShellCheck`):**
   - Extrae violaciones de grado `C`, `D`, `E`, `F` de Radon y errores de `mypy`, `ruff`, `eslint` o `shellcheck` en una lista compacta `{ file, line, rule, message }` (máximo 25 ítems para no saturar la ventana de contexto).
4. **Parser de Seguridad (`Trivy` / `Bandit`):**
   - Extrae el conteo de hallazgos `CRITICAL` y `HIGH`.
5. **Parser de Mutación (`Mutmut` / `Stryker`):**
   - Extrae la cantidad de mutantes sobrevivientes (`survived`) y el *Mutation Score*.

- **Salida JSON Estructurada de `run_ephemeral_qa`:**
  ```json
  {
    "status": "PASSED | FAILED",
    "stage": "unit",
    "exit_code": 0,
    "duration_ms": 4820,
    "coverage": {
      "detected": true,
      "percent": 96.4,
      "threshold": 95.0,
      "passed": true,
      "uncovered_files": [
        { "file": "src/services/auth.py", "coverage_percent": 92.0, "missing_lines": "45-49" }
      ]
    },
    "failed_tests": [],
    "linter_and_complexity_issues": [],
    "security_alerts": { "critical": 0, "high": 0 },
    "mutation_summary": null,
    "tail_log": "Últimas 15 líneas limpias de stdout/stderr..."
  }
  ```

---

## 4. Especificación de Tool 7: `certify_11x_gate` (Compuerta de Cierre de Tarea)

- **Propósito:** Ejecuta las validaciones de cierre del estándar 11X sobre el proyecto destino y verifica que esté listo para commit/push.
- **Esquema Zod de Entrada:**
  ```typescript
  const CertifyGateInputSchema = z.object({
    project_path: z.string().min(1),
  });
  ```
- **Verificaciones que Ejecuta Secuencialmente:**
  1. **Cero Archivos `.example` sin Fusionar:** Verifica que no hayan quedado archivos `.example` sueltos en la raíz del proyecto destino (salvo si el proyecto evaluado es el propio `qa-testing-blueprints`).
  2. **Secret Scanning (`verificar-secretos.sh`):** Ejecuta el escáner de secretos y certifica `0` fugas.
  3. **Integridad JSON (`verify_json_no_duplicate_keys.py`):** Certifica `0` claves duplicadas en archivos `.json`.
  4. **Cero Componentes UI Huérfanos (`verify_zero_orphan_vue_components.py`):** Si existe `src/components` o `vue3/src`, certifica que cada componente tenga su `.unit.ts`.
  5. **Paridad ORM vs Migraciones (`verify_alembic_orm_parity.py`):** Si existen modelos SQLAlchemy, certifica `0` tablas sin migración Alembic.
  6. **Auditoría DISA STIG / OWASP (`audit_security_stig_owasp`):** Certifica `0` hallazgos `CRITICAL` o `HIGH`.
  7. **Sincronización Documental:** Verifica que `TESTING.md` y `CHANGELOG.md` existan y estén actualizados.

- **Salida JSON Estructurada:**
  ```json
  {
    "gate_passed": true,
    "checks": {
      "zero_unmerged_examples": true,
      "zero_secrets_exposed": true,
      "json_integrity": true,
      "zero_orphan_ui_components": true,
      "orm_alembic_parity": true,
      "security_stig_owasp_clean": true,
      "documentation_synced": true
    },
    "blockers": []
  }
  ```

---

## 5. Requisitos de Pruebas 11X para el Propio Servidor MCP (`mcp-server/tests/`)

El directorio `mcp-server/` DEBE predicarse con el ejemplo y aprobar la pirámide 11X en contenedor efímero (`sinfallas/base-node-ionic:26`):
1. **Cobertura Unitaria $\ge 95.0\%$ en Vitest:**
   - Todos los servicios (`github-fetcher.ts`, `surgical-merger.ts`), parsers (`output-parsers.ts`) y herramientas (`inspect-project.ts`, `security-auditor.ts`, `ephemeral-runner.ts`, `certify-gate.ts`) deben probarse aislando llamadas de red y de subprocesos con `vi.spyOn` / `vi.mock`.
2. **Escenarios BDD en Karate Labs (`mcp-server/test/mcp_cli_test.feature`):**
   - Validar la invocación del CLI `install-skill --help` y la validación del manifiesto.
3. **Cero Errores de Tipado y Linting:**
   - `tsc --noEmit` y `eslint` con `0` errores y `0` advertencias.
