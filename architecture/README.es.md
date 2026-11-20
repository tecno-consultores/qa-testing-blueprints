> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# 🏗️ Arquitectura como Código — FINOS CALM (`architecture/`)

> **Estándar Bilingüe:** Regido por la arquitectura Inglés Primario + Espejo Español 1:1 ([`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md)).

Este directorio aloja la especificación declarativa y ejecutable **Architecture-as-Code** del estándar **QA-11X** mediante **[`qa-11x.calm.json`](qa-11x.calm.json)** (formato **FINOS CALM 1.2**, validado con `@finos/calm-cli` y AJV).

---

## 1. Topología Declarada (`qa-11x.calm.json`)

El grafo arquitectónico modela **6 nodos**, **5 relaciones tipadas** y **7 controles obligatorios** vinculados directamente a nodos y relaciones, validados en tiempo de compilación e integración continua:

### Nodos Núcleo (6)

| `unique-id` | `node-type` | Rol en QA-11X |
| :--- | :--- | :--- |
| `qa-11x-ai-ide-host` | `actor` | Cliente IDE / agente IA que consume herramientas y recursos vía JSON-RPC `stdio`. |
| `mcp-qa-11x-server` | `service` | Servidor MCP `@sinfallas/mcp-qa-11x` con **19 Tools**, **13 Resources**, `promptGuard` y `TaskStateGuard`. |
| `ephemeral-docker-runners` | `system` | Contenedores Docker efímeros no-root (`Rule Zero`, imágenes `sinfallas/*`). |
| `postgres17-rls-store` | `database` | PostgreSQL 17 multi-tenant con `FORCE ROW LEVEL SECURITY` y cadena de auditoría WORM HMAC. |
| `keydb-state-cache` | `database` | Motor en memoria KeyDB multi-hilo sobre RESP TLS para estado efímero, rate limits e idempotencia. |
| `governance-certification-gate` | `service` | Compuerta determinista de 10 etapas (`certify_task_completion.sh`, `sync_governance.py`, `manifest.json`). |

### Relaciones Tipadas (5)

1. `rel-ide-to-mcp-server` (`qa-11x-ai-ide-host` → `mcp-qa-11x-server`, `metadata.protocol: stdio`, JSON-RPC 2.0).
2. `rel-mcp-to-ephemeral-runners` (`mcp-qa-11x-server` → `ephemeral-docker-runners`, `metadata.protocol: CLI`, Docker CLI `Rule Zero`).
3. `rel-runners-to-postgres17-rls` (`ephemeral-docker-runners` → `postgres17-rls-store`, `protocol: TLS`).
4. `rel-runners-to-keydb-cache` (`ephemeral-docker-runners` → `keydb-state-cache`, `protocol: TLS`).
5. `rel-mcp-to-governance-gate` (`mcp-qa-11x-server` → `governance-certification-gate`, `metadata.protocol: SHA-256` / `Local`, compuerta de 10 etapas).

> **Nota de Protocolos FINOS CALM 1.2:** Las relaciones 3 y 4 declaran `"protocol": "TLS"` en el nivel superior (incluido en el enum `#/defs/protocol` de CALM 1.2), mientras los transportes locales/no de red (`stdio`, `CLI`, `SHA-256` / `Local`) declaran `metadata.protocol` para que la validación estricta AJV frente a `calm.finos.org/release/1.2/meta/calm.json` pase sin errores ni advertencias.

### Controles Obligatorios (7) y Vínculos con Nodos/Relaciones

| Clave de Control | `control-id` | Nodos y Relaciones Vinculados | Alcance |
| :--- | :--- | :--- | :--- |
| `prompt-injection-guard` | `QA-PROMPT-GUARD` | `mcp-qa-11x-server`, `rel-ide-to-mcp-server` | Canonicalización `NFKC`, redacción PII/secretos e interceptación *Fail-Closed* en `promptGuard.ts`. |
| `rule-zero-ephemeral-docker` | `QA-RULE-ZERO` | `ephemeral-docker-runners`, `rel-mcp-to-ephemeral-runners` | Mapeo `-u "$(id -u):$(id -g)"`, `HOME=/tmp` y contenedores endurecidos (`Trivy HIGH/CRITICAL = 0`). |
| `postgres-rls-isolation` | `QA-PG17-RLS` | `postgres17-rls-store`, `rel-runners-to-postgres17-rls` | Aislamiento por inquilino con `SET LOCAL app.current_tenant_id`, rol `NOBYPASSRLS` y `FORCE RLS`. |
| `worm-hmac-audit-chain` | `SEC-14` | `postgres17-rls-store`, `rel-runners-to-postgres17-rls` | Cadena WORM inmutable con `seq_num BIGINT`, `pg_advisory_xact_lock` y encadenado HMAC-SHA256 (`DISA STIG APSC-DV-001350`). |
| `vault-aes-256-gcm` | `QA-VAULT-FIPS-SSRF` | `mcp-qa-11x-server`, `ephemeral-docker-runners`, `keydb-state-cache`, `rel-runners-to-keydb-cache` | Bóveda AES-256-GCM (FIPS 140-3), zeroización en memoria y protección Anti-SSRF. |
| `git-closure-human-gate` | `QA-GIT-GATE-01` | `qa-11x-ai-ide-host`, `governance-certification-gate`, `rel-mcp-to-governance-gate` | Cierre en `git commit` local certificado; prohíbe `git push` o `npm publish` automáticos. |
| `cli-tty-anti-hang-guard` | `QA-CLI-TTY-01` | `mcp-qa-11x-server`, `ephemeral-docker-runners`, `rel-ide-to-mcp-server` | Guardia anti-bloqueo `TTY` y contrato `HEALTHCHECK` sin mocks (`QA-HEALTH-01`) en orquestación. |

---

## 2. Validación bajo Regla Cero (`Docker Efímero`)

Ejecuta la validación de esquema e integridad mediante el contenedor oficial `sinfallas/base-node-ionic:26`, el `Makefile` raíz o la herramienta MCP `validate_calm_architecture`:

```bash
# Desde la raíz del monorepo:
make validate-calm

# O directamente con el script CLI en Docker efímero no-root:
./.agents/scripts/validate_calm_architecture.sh architecture/qa-11x.calm.json
```

En el repositorio de plantillas, el parámetro `version` dentro de `architecture/qa-11x.calm.json` se sincroniza automáticamente con [`.agents/scripts/bump_version_11x.py`](../.agents/scripts/bump_version_11x.py) (junto a manifiestos, catálogos y documentación); los proyectos consumidores pueden invocar el mismo script localmente para alinear sus propios metadatos de versión.
