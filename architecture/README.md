> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# 🏗️ Architecture-as-Code — FINOS CALM (`architecture/`)

> **Bilingual Standard:** Governed by the English-Primary + 1:1 Spanish Mirror architecture ([`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md)).

This directory hosts the declarative and executable **Architecture-as-Code** specification of the **QA-11X** standard via **[`qa-11x.calm.json`](qa-11x.calm.json)** (**FINOS CALM 1.2** format, validated with `@finos/calm-cli` and AJV).

---

## 1. Declared Topology (`qa-11x.calm.json`)

The architectural graph models **6 nodes**, **5 typed relationships**, and **7 mandatory controls** bound directly to nodes and relationships and validated at compile time and in continuous integration:

### Core Nodes (6)

| `unique-id` | `node-type` | Role in QA-11X |
| :--- | :--- | :--- |
| `qa-11x-ai-ide-host` | `actor` | IDE client / AI agent consuming tools and resources over JSON-RPC `stdio`. |
| `mcp-qa-11x-server` | `service` | `@sinfallas/mcp-qa-11x` MCP server with **19 Tools**, **13 Resources**, `promptGuard`, and `TaskStateGuard`. |
| `ephemeral-docker-runners` | `system` | Non-root ephemeral Docker containers (`Rule Zero`, `sinfallas/*` images). |
| `postgres17-rls-store` | `database` | Multi-tenant PostgreSQL 17 with `FORCE ROW LEVEL SECURITY` and WORM HMAC audit chain. |
| `keydb-state-cache` | `database` | Multi-threaded KeyDB in-memory engine over RESP TLS for ephemeral state, rate limits, and idempotency. |
| `governance-certification-gate` | `service` | Deterministic 10-stage gate (`certify_task_completion.sh`, `sync_governance.py`, `manifest.json`). |

### Typed Relationships (5)

1. `rel-ide-to-mcp-server` (`qa-11x-ai-ide-host` → `mcp-qa-11x-server`, `metadata.protocol: stdio`, JSON-RPC 2.0).
2. `rel-mcp-to-ephemeral-runners` (`mcp-qa-11x-server` → `ephemeral-docker-runners`, `metadata.protocol: CLI`, Docker CLI `Rule Zero`).
3. `rel-runners-to-postgres17-rls` (`ephemeral-docker-runners` → `postgres17-rls-store`, `protocol: TLS`).
4. `rel-runners-to-keydb-cache` (`ephemeral-docker-runners` → `keydb-state-cache`, `protocol: TLS`).
5. `rel-mcp-to-governance-gate` (`mcp-qa-11x-server` → `governance-certification-gate`, `metadata.protocol: SHA-256` / `Local`, 10-stage gate).

> **FINOS CALM 1.2 Protocol Note:** Relationships 3 and 4 declare top-level `"protocol": "TLS"` (part of the CALM 1.2 `#/defs/protocol` enum), whereas local/non-network transports (`stdio`, `CLI`, `SHA-256` / `Local`) declare `metadata.protocol` so strict AJV validation against `calm.finos.org/release/1.2/meta/calm.json` succeeds with zero errors or warnings.

### Mandatory Controls (7) and Node/Relationship Bindings

| Control Key | `control-id` | Bound Nodes & Relationships | Scope |
| :--- | :--- | :--- | :--- |
| `prompt-injection-guard` | `QA-PROMPT-GUARD` | `mcp-qa-11x-server`, `rel-ide-to-mcp-server` | `NFKC` canonicalization, PII/secret redaction, and *Fail-Closed* interception in `promptGuard.ts`. |
| `rule-zero-ephemeral-docker` | `QA-RULE-ZERO` | `ephemeral-docker-runners`, `rel-mcp-to-ephemeral-runners` | `-u "$(id -u):$(id -g)"` mapping, `HOME=/tmp`, and hardened containers (`Trivy HIGH/CRITICAL = 0`). |
| `postgres-rls-isolation` | `QA-PG17-RLS` | `postgres17-rls-store`, `rel-runners-to-postgres17-rls` | Tenant isolation with `SET LOCAL app.current_tenant_id`, `NOBYPASSRLS` role, and `FORCE RLS`. |
| `worm-hmac-audit-chain` | `SEC-14` | `postgres17-rls-store`, `rel-runners-to-postgres17-rls` | Immutable WORM chain with `seq_num BIGINT`, `pg_advisory_xact_lock`, and HMAC-SHA256 chaining (`DISA STIG APSC-DV-001350`). |
| `vault-aes-256-gcm` | `QA-VAULT-FIPS-SSRF` | `mcp-qa-11x-server`, `ephemeral-docker-runners`, `keydb-state-cache`, `rel-runners-to-keydb-cache` | AES-256-GCM vault (FIPS 140-3), memory zeroization, and Anti-SSRF protection. |
| `git-closure-human-gate` | `QA-GIT-GATE-01` | `qa-11x-ai-ide-host`, `governance-certification-gate`, `rel-mcp-to-governance-gate` | Closure at certified local `git commit`; prohibits automated `git push` or `npm publish`. |
| `cli-tty-anti-hang-guard` | `QA-CLI-TTY-01` | `mcp-qa-11x-server`, `ephemeral-docker-runners`, `rel-ide-to-mcp-server` | `TTY` anti-hang guard and unmocked `HEALTHCHECK` contract (`QA-HEALTH-01`) in orchestration. |

---

## 2. Validation Under Rule Zero (`Ephemeral Docker`)

Run schema and integrity validation using the official `sinfallas/base-node-ionic:26` container, the root `Makefile`, or the `validate_calm_architecture` MCP tool:

```bash
# From the monorepo root:
make validate-calm

# Or directly via the CLI script inside non-root ephemeral Docker:
./.agents/scripts/validate_calm_architecture.sh architecture/qa-11x.calm.json
```

In the blueprint repository, the `version` field inside `architecture/qa-11x.calm.json` is synchronized automatically via [`.agents/scripts/bump_version_11x.py`](../.agents/scripts/bump_version_11x.py) (alongside manifests, catalogs, and docs); consumer projects can invoke the same helper locally when synchronizing their own version metadata.
