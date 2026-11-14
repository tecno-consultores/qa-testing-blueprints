# 🔗 Especificación Técnica 15: Trazabilidad Bidireccional Enterprise Zero-Infra (Jira, Zephyr Scale, Xray y GitHub Issues — `T4.6`)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (`T4.6`):** `mcp-server/src/integrations/tmsSyncCli.ts`, `mcp-server/tests/tmsSyncCli.test.ts`  
**Superficie Exportada:** CLI programático (`runTmsSyncCli`) + Descriptor MCP (`SYNC_ENTERPRISE_TMS_TOOL` / `handleSyncEnterpriseTms`, programado para registro público conjunto en `T5.3`)  
**Estado:** IMPLEMENTADO (CERTIFICACIÓN QA-11X v2.0 — FASE 4)

---

## 1. Propósito y Flujo Bidireccional Zero-Infra (`QA-11X`)

La trazabilidad corporativa en **QA-11X v2.0** elimina la dependencia de servidores intermedios, *plugins* propietarios pesados o llamadas a modelos LLM para correlacionar requisitos de negocio, casos automatizados y evidencia de ejecución. El adaptador `mcp-server/src/integrations/tmsSyncCli.ts` opera 100% sobre Node.js nativo (`node:fs`, `node:net`, `node:crypto`, `fetch`) en tres etapas deterministas:

```text
  Historia / Requisito (Jira / GitHub Issues)
       │
       │  [1. pull-stories] GET + NFKC/CR-LF + promptGuard.ts
       ▼
  Esqueleto Gherkin / Karate (.feature) y Suites (.test.ts / test_*.py)
       │  Etiquetas canónicas: @JIRA-<KEY> | @ZEPHYR-<KEY> | @XRAY-<KEY> | @GH-<NUM> | @TC-<ID> | @AC-<N>
       │
       │  [2. inventory] Auditoría local anti-Path Traversal estilo /tc-id
       ▼
  Matriz de Cobertura (TRACEABILITY_OK vs. GAPS_DETECTED, Zero Hardcoded Pass)
       │
       │  [3. push-results] Parseo lineal JUnit XML (anti-XXE) -> POST Idempotency-Key
       ▼
  Evidencia Publicada en TMS  ──▶  Release Readiness Gate (GO / NO_GO)
```

---

## 2. Contratos de API y Mapeo por Proveedor Corporativo

| Proveedor | Operación | Endpoint REST Canónico | Formato de Payload / Mapeo de Estados | Autenticación Soportada |
| :--- | :--- | :--- | :--- | :--- |
| **`jira`** | `push-results` | `POST /rest/api/3/issue/{issueKey}/comment` | Documento **ADF** (`type: "doc"`, `version: 1`, resumen + lista de casos `PASSED`/`FAILED`/`SKIPPED`). | `Basic` (`JIRA_USER_EMAIL` + `JIRA_API_TOKEN`) o `Bearer` (`JIRA_API_TOKEN` / `TMS_API_TOKEN`). |
| **`jira`** | `pull-stories` | `GET /rest/api/3/issue/{issueKey}?fields=summary,description` | Extrae `summary` y texto ADF recursivo de `description`; sanitiza antes de emitir `.feature`. | `Basic` o `Bearer` (`JIRA_API_TOKEN` / `TMS_API_TOKEN`). |
| **`zephyr`** | `push-results` | `POST /v2/testexecutions` | `{ projectKey, testCaseKey, statusName, executionTime, executions[] }`. Mapeo: `passed -> Pass`, `failed -> Fail`, `skipped -> Blocked`. | `Bearer` (`ZEPHYR_API_TOKEN` / `TMS_API_TOKEN`). |
| **`xray`** | `push-results` | `POST /api/v2/import/execution` | `{ testExecutionKey, info, tests: [{ testKey, status, comment }] }`. Mapeo: `passed -> PASSED`, `failed -> FAILED`, `skipped -> TODO`. | `Bearer` (`XRAY_API_TOKEN` / `XRAY_CLIENT_SECRET` / `TMS_API_TOKEN`). |
| **`github-issues`** | `push-results` | `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` | `{ body }` en Markdown estructurado con métricas agregadas y detalle por caso. | `Bearer` (`GITHUB_TOKEN` / `TMS_API_TOKEN`). |
| **`github-issues`** | `pull-stories` | `GET /repos/{owner}/{repo}/issues/{issueNumber}` | Extrae `number`, `title` y `body`; sanitiza antes de emitir `.feature`. | `Bearer` (`GITHUB_TOKEN` / `TMS_API_TOKEN`). |

---

## 3. Los 3 Modos Deterministas Zero-LLM

1. **`inventory` (Auditoría Bidireccional de Cobertura):**
   - Escanea recursivamente `targetDir` dentro de `workspaceRoot` (ignorando `node_modules`, `.git`, `dist`, `coverage`, `.venv`, `__pycache__` y bloqueando saltos `..` o symlinks externos).
   - Inspecciona archivos `.feature`, `.test.ts` y `test_*.py`, extrayendo etiquetas `@JIRA-<KEY>`, `@ZEPHYR-<KEY>`, `@XRAY-<KEY>`, `@GH-<NUM>`, `@TC-<ID>` y `@AC-<N>`.
   - Cruza los identificadores encontrados contra `requiredKeys` y calcula `coveragePct`, `mappedTests`, `untaggedTests` y `uncoveredRequirements`.
   - **Zero Hardcoded Pass:** Si el directorio contiene 0 pruebas, existen pruebas sin enlace primario (`@JIRA-`, `@ZEPHYR-`, `@XRAY-`, `@GH-`, `@TC-`) o faltan requisitos por cubrir, emite `verdict: "GAPS_DETECTED"` (`exitCode: 1` en CLI).
2. **`push-results` (Publicación de Evidencia JUnit XML -> TMS):**
   - Lee `junitXmlPath` (validado contra *Path Traversal*) o `junitXmlContent`, rechaza declaraciones `<!DOCTYPE` / `<!ENTITY` (*Anti-XXE*, `APSC-DV-002390/002550`) y tokeniza `<testcase>`, `<failure>`, `<error>` y `<skipped>` en tiempo lineal.
   - Construye el payload exacto por proveedor correlacionando las etiquetas presentes en `classname` / `name` o usando `issueKey` / `projectKey` / `testExecutionKey`.
3. **`pull-stories` (Ingesta Segura de Historias -> Borrador `.feature`):**
   - Solo acepta `jira` o `github-issues`.
   - Normaliza Unicode (`NFKC`), sanea saltos `CR/LF` y procesa cada línea de título y criterios mediante `sanitizeUntrustedOutput` e `inspectPromptSafety` (`mcp-server/src/security/promptGuard.ts`) con `strictPii: true`.
   - Emite una plantilla Karate/Gherkin trazable (`@JIRA-...` / `@GH-...`, `@TC-...`, `@AC-1`) que incluye por defecto la cabecera `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` en el escenario mutador.

---

## 4. Políticas DevSecOps, Concurrencia y Resiliencia

| Control | Regla Normativa | Implementación en `tmsSyncCli.ts` |
| :--- | :--- | :--- |
| **Activación Segura por Defecto** | `dryRun = true` por defecto; prohibido simular `PASSED` sin credenciales | En `dry-run` no se abren sockets (`attempts = 0`): retorna `DRY_RUN` si `dryRun: true` o hay credenciales; retorna `SKIPPED` si faltan credenciales sin `--live`; lanza `MissingTmsCredentialsError` (*Fail-Closed*) al exigir `--live` sin token. |
| **Defensa Anti-SSRF** | Esquema `https://` estricto sin redes privadas ni metadatos cloud | `validateTmsBaseUrl` bloquea `http://`, `file://`, credenciales embebidas, `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:...` e IPs numéricas/octales. |
| **Idempotencia y Concurrencia `409`** | Cero tormentas de reintentos en escrituras | Todo `POST` incluye `Idempotency-Key` (UUIDv4) y `AbortSignal.timeout(timeoutMs)` con **0 reintentos**. Ante HTTP `409 Conflict`, responde `status: "SYNC_ALREADY_RUNNING"` (`exitCode: 1`) sin reintentar. |
| **Reintento Acotado en Lecturas** | Tolerancia mínima a fallos transitorios idempotentes | En `GET` (`pull-stories`) se permite **máximo 1 reintento** (2 intentos totales) exclusivamente ante HTTP `502`/`503` o fallo transitorio de transporte (`ECONNRESET`/`ETIMEDOUT`); errores `4xx` fallan en 1 intento. |
| **Anti-*Indirect Prompt Injection*** | Neutralización de tickets externos no confiables | Títulos y criterios pasan por `NFKC`, limpieza `CR/LF` y `promptGuard.ts`; cualquier carga maliciosa o PII se sustituye por `[REDACTED_PROMPT_INJECTION]`, `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`. |
| **Cero Fuga de Secretos (`APSC-DV-000650`)** | Redacción obligatoria en logs, excepciones y CLI | `redactTmsSecrets` enmascara valores de tokens de entorno, `Authorization: Bearer/Basic`, JWT y credenciales en URL antes de emitir salidas JSON o bloques `Fail-Verbose`. |
| **Cero Bloqueo TTY (`QA-CLI-TTY-01`)** | Ejecución no interactiva determinista | `runTmsSyncCli` lee exclusivamente `argv` sin esperar entrada por `process.stdin`, retornando salida `Pass-Quiet` (1 línea) o `Fail-Verbose` estructurada. |

---

## 5. Ejecución Reproducible bajo Regla Cero (`sinfallas/base-node-ionic:26`)

Todas las ejecuciones se realizan dentro de contenedor efímero con alineación de UID/GID no-root (`-u "$(id -u):$(id -g)" -e HOME=/tmp`) y pasando secretos únicamente por variables de entorno en tiempo de ejecución:

```bash
# 1. Auditoría local de cobertura bidireccional (modo inventory, sin red)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/workspace:ro" -w /workspace \
  sinfallas/base-node-ionic:26 \
  node mcp-server/dist/integrations/tmsSyncCli.js --mode inventory --target-dir fastapi/test --json

# 2. Simulación segura por defecto (dry-run, 0 llamadas HTTP) sobre evidencia JUnit XML
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/workspace:ro" -w /workspace \
  sinfallas/base-node-ionic:26 \
  node mcp-server/dist/integrations/tmsSyncCli.js \
    --mode push-results --provider jira \
    --base-url https://tenant.atlassian.net \
    --issue-key AUTH-101 --junit-xml reports/junit.xml

# 3. Publicación live en CI con token inyectado desde el vault del pipeline
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e GITHUB_TOKEN \
  -v "$(pwd):/workspace:ro" -w /workspace \
  sinfallas/base-node-ionic:26 \
  node mcp-server/dist/integrations/tmsSyncCli.js \
    --mode push-results --provider github-issues \
    --repo tecno-consultores/qa-testing-blueprints \
    --issue-key 42 --junit-xml reports/junit.xml --live
```

> **Nota de Paridad MCP (`T4.6` -> `T5.3`):** El descriptor `SYNC_ENTERPRISE_TMS_TOOL` (`name: "sync_enterprise_tms"`) y su manejador `handleSyncEnterpriseTms` quedan exportados en `mcp-server/src/integrations/tmsSyncCli.ts` sin alterar `mcp-server/src/index.ts`, preservando el inventario público actual de herramientas y recursos hasta su registro conjunto en la micro-tarea `T5.3`.
