# 🏗️ Arquitectura como Código — FINOS CALM (`architecture/`)

> 🌐 **Idioma / Language:** Español (Plan de arquitectura bilingüe EN/ES en [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md)).

Este directorio aloja la especificación declarativa y ejecutable **Architecture-as-Code** del estándar **QA-11X** mediante **[`qa-11x.calm.json`](qa-11x.calm.json)** (formato **FINOS CALM**, compatible con `@finos/calm-cli`).

---

## 1. Topología Declarada (`qa-11x.calm.json`)

El grafo arquitectónico modela **6 nodos**, **5 relaciones tipadas** y **7 controles obligatorios** validados en tiempo de compilación e integración continua:

### Nodos Núcleo (6)

| `unique-id` | `node-type` | Rol en QA-11X |
| :--- | :--- | :--- |
| `qa-11x-ai-ide-host` | `actor` | Cliente IDE / agente IA que consume herramientas y recursos vía JSON-RPC `stdio`. |
| `mcp-qa-11x-server` | `service` | Servidor MCP `@sinfallas/mcp-qa-11x` con **18 Tools**, **12 Resources**, `promptGuard` y `TaskStateGuard`. |
| `ephemeral-docker-runners` | `system` | Contenedores Docker efímeros no-root (`Rule Zero`, imágenes `sinfallas/*`). |
| `postgres17-rls-store` | `database` | PostgreSQL 17 multi-tenant con `FORCE ROW LEVEL SECURITY` y cadena de auditoría WORM HMAC. |
| `keydb-state-cache` | `database` | Motor en memoria KeyDB multi-hilo sobre RESP TLS para estado efímero, rate limits e idempotencia. |
| `governance-certification-gate` | `service` | Compuerta determinista de 10 etapas (`certify_task_completion.sh`, `sync_governance.py`, `manifest.json`). |

### Relaciones Tipadas (5)

1. `rel-ide-to-mcp-server` (`qa-11x-ai-ide-host` → `mcp-qa-11x-server`, `stdio` JSON-RPC 2.0).
2. `rel-mcp-to-ephemeral-runners` (`mcp-qa-11x-server` → `ephemeral-docker-runners`, Docker CLI `Rule Zero`).
3. `rel-runners-to-postgres17-rls` (`ephemeral-docker-runners` → `postgres17-rls-store`, protocolo `TLS`).
4. `rel-runners-to-keydb-cache` (`ephemeral-docker-runners` → `keydb-state-cache`, protocolo `TLS`).
5. `rel-mcp-to-governance-gate` (`mcp-qa-11x-server` → `governance-certification-gate`, SHA-256 + 10 etapas).

### Controles Obligatorios (7)

| Clave de Control | `control-id` | Alcance |
| :--- | :--- | :--- |
| `prompt-injection-guard` | `QA-PROMPT-GUARD` | Canonicalización `NFKC`, redacción PII/secretos e interceptación *Fail-Closed* en `promptGuard.ts`. |
| `rule-zero-ephemeral-docker` | `QA-RULE-ZERO` | Mapeo `-u "$(id -u):$(id -g)"`, `HOME=/tmp` y contenedores endurecidos (`Trivy HIGH/CRITICAL = 0`). |
| `postgres-rls-isolation` | `QA-PG17-RLS` | Aislamiento por inquilino con `SET LOCAL app.current_tenant_id`, rol `NOBYPASSRLS` y `FORCE RLS`. |
| `worm-hmac-audit-chain` | `SEC-14-APSC-DV-001350` | Cadena WORM inmutable con `seq_num BIGINT`, `pg_advisory_xact_lock` y encadenado HMAC-SHA256. |
| `vault-aes-256-gcm` | `QA-VAULT-FIPS-SSRF` | Bóveda AES-256-GCM (FIPS 140-3), zeroización en memoria y protección Anti-SSRF. |
| `git-closure-human-gate` | `QA-GIT-GATE-01` | Cierre en `git commit` local certificado; prohíbe `git push` o `npm publish` automáticos. |
| `cli-tty-anti-hang-guard` | `QA-CLI-TTY-01-HEALTH-01` | Guardia anti-bloqueo `TTY` y contrato `HEALTHCHECK` sin mocks en orquestación. |

---

## 2. Validación bajo Regla Cero (`Docker Efímero`)

Ejecuta la validación de esquema e integridad mediante el contenedor oficial `sinfallas/base-node-ionic:26`, el `Makefile` raíz o la herramienta MCP `validate_calm_architecture`:

```bash
# Desde la raíz del monorepo:
make validate-calm

# O directamente con el script CLI en Docker efímero no-root:
./.agents/scripts/validate_calm_architecture.sh architecture/qa-11x.calm.json
```

En proyectos consumidores, el parámetro `version` dentro de `architecture/qa-11x.calm.json` se sincroniza automáticamente con [`.agents/scripts/bump_version_11x.py`](../.agents/scripts/bump_version_11x.py).
