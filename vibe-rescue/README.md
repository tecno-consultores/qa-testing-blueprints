> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff DevSecOps & QA Rescue Architect. Read, parse, and strictly enforce the 5-stage Vibe-to-Enterprise hardening protocol below inside ephemeral non-root Docker containers (`sinfallas/base-python-uv:3.15` / `sinfallas/base-node-ionic:26`, Rule Zero). Preserve validated visual UX while eliminating exposed client secrets, open SQL policies (enforce per-table `ENABLE + FORCE ROW LEVEL SECURITY` and atomic WORM `audit_log_worm`), weak types, monolithic files (`> 500` lines, `CC <= 5`, `args <= 4`), and missing test suites (`>= 95%` coverage). Output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# 🛡️ Vibe-to-Enterprise Blueprint — QA-11X Rescue & Hardening (`vibe-rescue/`)

Deterministic **5-stage** protocol designed to transform *vibe-coded* prototypes generated with **Bolt.new, Lovable, v0, or Replit Agent** into corporate systems aligned with **QA-11X, DISA ASD STIG V6R5, and OWASP v4.2**, **without destroying the validated visual UX**.

---

## 1. Philosophy: *Preserve UX, Eradicate Structural Debt*

AI-generated prototypes deliver functional interfaces in minutes, yet routinely introduce five families of critical debt: service secrets exposed in the client bundle, open SQL policies (`USING (true)`), type escapes (`: any`, `@ts-ignore`), monolithic components (`> 500` lines), and zero test coverage inside non-root containers (`Rule Zero`).

---

## 2. 5-Stage Protocol & Rule Matrix (`VIBE-SEC-001` .. `VIBE-QA-005`)

| Rule | Stage | Severity | Vector Detected in Vibe Prototypes | Standard 11X Remediation |
| :--- | :--- | :--- | :--- | :--- |
| `VIBE-SEC-001` | **Stage 1: Forensic Triage & Secret Quarantine** | `CRITICAL` | Client variables (`VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `REACT_APP_*`) containing `SERVICE_ROLE`, `SECRET`, `PRIVATE`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`; literal API keys; or `.env` excluded from `.gitignore`. | Move keys to server-side BFF/API with AES-256-GCM Vault, rotate leaked credentials (`<EXAMPLE_REDACTED>`), and sanitize `.env.example`. |
| `VIBE-RLS-002` | **Stage 2: PostgreSQL 15–17+ RLS & Service RBAC** | `CRITICAL` | SQL policies with `USING (true)` / `WITH CHECK (true)`, multi-tenant `CREATE TABLE` schemas lacking `ENABLE` + `FORCE ROW LEVEL SECURITY`, `BYPASSRLS`, or client-side `service_role` / `supabaseAdmin` usage. | Apply `vibe-rescue/templates/rls_hardening.sql` (`NOBYPASSRLS` role, `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER` function, and `seq_num` WORM chain). |
| `VIBE-TYPE-003` | **Stage 3: Strict Typing & Validated Boundaries** | `HIGH` | Abuse of `: any` / `as any`, `@ts-ignore`, `@ts-nocheck`, `# type: ignore`, `"strict": false` in `tsconfig.json`, or mutating routes (`POST`/`PUT`/`PATCH`/`DELETE`) missing `Idempotency-Key`. | Enable `strict: true`, validate payloads with Zod `.strict()` / Pydantic `extra="forbid"`, `NFKC` normalization, and `Idempotency-Key`. |
| `VIBE-ARCH-004` | **Stage 3: Modular Decomposition (`CC <= 5`)** | `MEDIUM` | Monolithic components, pages, or controllers exceeding the configurable threshold (`> 500` lines). | Extract domain hooks/stores and presentational widgets (`CC <= 5`) while preserving in-flow layout and visual tokens (`refactoring-ui`). |
| `VIBE-QA-005` | **Stage 4: Rule Zero & Test Safety Net (`>= 95%`)** | `HIGH` | Absence of tests (`.test.*`, `.spec.*`, `.unit.*`, `.int.*`, `.e2e.*`, `Test.php`, `.bats`), fixed sleeps (`waitForTimeout`, `time.sleep`), unpinned `:latest`/untagged `FROM`, or final-stage `Dockerfile` running as `USER root`. | Containerize under non-root `sinfallas/base-python-uv:3.15` or `sinfallas/base-node-ionic:26`, remove fixed sleeps, and enforce `>= 95%` coverage (`tests/test_audit_vibe_prototype.unit.py`). |
| *(Closure)* | **Stage 5: Governance Sealing (`QA-GIT-GATE-01`)** | `INFO` | Rescued repository missing *Thin-Repo* connector or certified closure. | Run `make sync-governance` (in the `qa-testing-blueprints` source monorepo), `./.agents/scripts/certify_task_completion.sh` (`10/10`) / `certify_11x_gate`, and local commit (no automated `git push`). |

---

## 3. Execution Under Rule Zero (`vibe-rescue/audit_vibe_prototype.py`)

The CLI auditor is modularized across `audit_vibe_prototype.py` and `_vibe_rules.py` (`< 500` lines each, **pure Python 3 stdlib**, `CC <= 5`, `max-args <= 4`, `mypy --strict`, safe default `--dry-run`, per-table SQL RLS checks preserving line numbers, and automatic redaction as `[REDACTED_SECRET]`). Always run it inside `sinfallas/base-python-uv:3.15` as a non-root user:

```bash
# Audit in dry-run mode (Pass-Quiet when clean; Fail-Verbose when rescue is required)
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$(pwd):/app:ro" -w /app \
  sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
  python3 vibe-rescue/audit_vibe_prototype.py --target /app --json

# Generate remediation bundle in a subdirectory without overwriting existing code
docker run --rm -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$(pwd):/app" -w /app \
  sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
  python3 vibe-rescue/audit_vibe_prototype.py \
    --target /app --no-dry-run --emit-remediation qa11x-rescue --enforce
```

- **Standalone Consumer Blueprint:** Copy `Makefile.example` -> `Makefile`, keep `docker-compose.qa.yml` and `limpieza.sh`, and run `make qa-lint`, `make qa-audit`, `make qa-audit-enforce`, `make qa-ci`, `make qa-unit` (`>= 95%` over `tests/test_audit_vibe_prototype.unit.py`), `make qa-all`, or `make clean` (non-root `${QA_UID:-1000}:${QA_GID:-1000}`).

### Safe Configuration Placeholders

Never include real secrets in documentation or templates; use explicit placeholders:

```env
OPENAI_API_KEY=<EXAMPLE_REDACTED>
SUPABASE_SERVICE_ROLE_KEY=<EXAMPLE_REDACTED>
```

---

## 4. SQL Template `vibe-rescue/templates/rls_hardening.sql`

`vibe-rescue/templates/rls_hardening.sql` provides idempotent DDL for PostgreSQL 15–17+:

1. **`app_runtime_user` role** with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
2. **Revocation of `PUBLIC`/`anon`/`authenticated`** and removal (`DROP POLICY IF EXISTS`) of permissive policies inherited from Supabase scaffolds.
3. **`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`** and `tenant_isolation_policy` bound to `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.
4. **Pre-auth function `resolve_tenant_by_slug`** (`SECURITY DEFINER`, `SET search_path = pg_catalog, public`, scoped `tenants_definer_lookup_policy` under `FORCE RLS`, active trimmed lookup) and immutable **`audit_log_worm`** table (`seq_num BIGINT GENERATED ALWAYS AS IDENTITY` written exclusively via `SECURITY DEFINER` `append_worm_audit_entry` without direct `INSERT` or sequence grants for `app_runtime_user`, `BEFORE UPDATE/DELETE/TRUNCATE` triggers, and `CHAR(64)` SHA-256 chains enforced fail-closed with `RAISE EXCEPTION` on hash mismatch or blank/UUIDv4 `p_actor_username` under `pg_advisory_xact_lock(hashtext('audit:' || p_tenant_id::text))`).

---

## 5. Programmatic Consumption via MCP Server

- **MCP Tool:** `audit_vibe_prototype` (`mcp-server/src/tools/auditVibePrototype.ts`) — executes the 5-rule inspection from the agent with strict containment against *Path Traversal*, `dryRun: true` by default, `[REDACTED_SECRET]` redaction, optional `enforce` flag, and `Pass-Quiet` / `Fail-Verbose` output.
- **MCP Resource:** `blueprint://vibe-rescue/readme` (`mcp-server/src/resources/stackBlueprints.ts`) — exposes this operational guide directly to the agent context.
- **Bilingual Architecture:** Maintained under the English-Primary + 1:1 Spanish Mirror standard defined in [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md).
