---
name: qa-11x-devsecops-hardener
description: >-
  DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 hardening sub-skill for Standard 11X. Use whenever
  designing, auditing, or modifying multi-tenant PostgreSQL 15–17+ RLS schemas, authentication and session
  flows, cryptographic secret vaults, WORM audit hash-chains, mutating MCP/JSON-RPC tools, or non-root Docker containers.
---

# QA 11X DevSecOps Hardener (`qa-11x-devsecops-hardener`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless the target repository's `AGENTS.md` explicitly mandates a fixed output language, respond and explain reasoning in the **user's prompt language**, and write commit messages / human-facing documentation matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to the prompt language on empty repos).

Operational security-by-design sub-skill for Standard 11X (`qa-11x-architect`), enforcing the **22 canonical DISA ASD STIG V6R5 & OWASP v4.2 controls**, PostgreSQL 15–17+ RLS (`QA-PG17-RLS`), pre-auth continuity (`SEC-16`), AES-256-GCM Vaults, WORM hash-chains, service-layer RBAC, and rootless container runtime contracts.

---

## 1. Activation Triggers & On-Demand Hydration

Activate strictly on demand when designing, auditing, or modifying:
- Multi-tenant PostgreSQL 15–17+ schemas, Alembic migrations, `AsyncSession` transactions, or pre-auth lookups.
- Auth flows (MFA, WebAuthn, Argon2id, lockout, session rotation/purge, Step-Up re-auth, mTLS/PKI).
- Secret Vaults (AES-256-GCM, memory zeroization), database export scrubbing, or WORM `audit_logs` (`UI-11X-02`).
- API boundaries, WebSockets, uploads, XML/deserialization parsers, or mutating MCP/JSON-RPC tools (`ApprovalRequest`).
- Rootless Docker/CI runtimes (`QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-COV-01`, `pnpm-store-init`, Trivy `HIGH/CRITICAL = 0` alongside `docker-trivy-keydb-hardening`).

> **Hydration:** Load [`references/stig_rls_vault.md`](references/stig_rls_vault.md) on demand for production-ready PG17 RLS DDL, `after_begin` listeners, AES-256-GCM keyring rotation, WORM `seq_num` + `pg_advisory_xact_lock` patterns, and the `APSC-DV-*` mapping table.

---

## 2. Consolidated 22-Control Matrix (DISA ASD STIG V6R5 & OWASP v4.2)

| # | Control | STIG V6R5 | OWASP | Mandatory 11X Enforcement |
| :-: | :--- | :--- | :--- | :--- |
| **01** | Mass Assignment | `APSC-DV-002520` | API3:2023 | `ConfigDict(extra="forbid")` / Zod `.strict()`; separate DTOs from ORM. |
| **02** | Anti-CSWSH Origin | `APSC-DV-002560` | WebSockets | Verify HTTP `Origin` before `ws.accept()`; reject unlisted with `4403`. |
| **03** | Prod 422 Sanitize | `APSC-DV-002430` | ERR-1..6 | Log details to stdout; return opaque error when `APP_ENV=production`. |
| **04** | Pre-DNS Anti-SSRF | `APSC-DV-002520` | API7:2023 | Resolve DNS first; block loopback, RFC1918, `169.254.0.0/16`, `*-db`/`*-redis`/`*-api`. |
| **05** | Parameterized SQL | `APSC-DV-002510` | SQLi | `:bind_params` only; strict allowlists for dynamic columns/sorts. |
| **06** | Upload Quotas | `APSC-DV-002485` | FM 1-5 | `<= 10 MB` cap via chunked stream counting prior to memory buffering. |
| **07** | Proxy Headers | `APSC-DV-002440` | SC 8-11 | Validate/forward `X-Forwarded-For`/`Proto`; reject forged `Host`. |
| **08** | Anti-CSRF | `APSC-DV-002560` | CSRF | HMAC-SHA256 `X-CSRF-Token` double-submit on cookies; bypass Bearer M2M only. |
| **09** | XSS & Prototype | `APSC-DV-002530` | XSS | `escapeHtml`, `Object.freeze()`, `Object.create(null)`, no raw `v-html`/`dangerouslySetInnerHTML`. |
| **10** | Refresh Grace | `APSC-DV-002270` | SM 1-9 | `5s` leeway on concurrent refresh token family rotations across tabs. |
| **11** | Idempotency | `APSC-DV-002560` | API4:2023 | Require `Idempotency-Key` (`idemp:{tenant_id}:{user_id}:{key}`); `QA-KARATE-IDEMP` UUIDs. |
| **12** | Prod Surface/Smoke | `APSC-DV-002430` | SC-11 | `docs_url=redoc_url=openapi_url=None` in prod; `QA-SMOKE-01` & `SEC-15` `>= 32B` keys. |
| **13** | Lockfile CVEs | `APSC-DV-001430` | A06:2021 | Enforce `uv.lock`/`pnpm-lock.yaml`; block `HIGH`/`CRITICAL` via `pip-audit`/`pnpm audit`/Trivy. |
| **14** | Session & Purge | `APSC-DV-000010..2290` | SM 1-21 | Concurrency caps, `10m`/`15m` idle TTL, CSPRNG rotation, full storage purge. |
| **15** | Lockout & Auth | `APSC-DV-000290..1850` | A 1-20 | `3-fail/15m` lock, constant-time Argon2id, `15-char/5-gen` pwd, `72h`/`35d` disable, mTLS. |
| **16** | NFKC & Anti-Shell | `APSC-DV-002510..2530` | CEC/SFL-9 | `NFKC` before validation; strip `\x00-\x1F`; zero `pickle`/`yaml.load`/`shell=True`. |
| **17** | Anti-XXE & Magic | `APSC-DV-002390/2485` | VSD/FV | Disable DTD/XXE (`defusedxml`, `LIBXML_NONET`); magic bytes; outside web root. |
| **18** | WORM & 75% Disk | `APSC-DV-000650..1370` | SL/SLD | Strip CR/LF; `seq_num BIGINT` + `pg_advisory_xact_lock` HMAC chain; 75% alert. |
| **19** | FIPS Vault/Scrub | `APSC-DV-002010..3310` | CP-5/MM | FIPS 140-3 AES-256-GCM, `bytearray`/`sodium_memzero`, no TLS compression, DB scrub. |
| **20** | OSHP & Fail-Secure | `APSC-DV-002310..2770` | OSHP/SC | HSTS, CSP, `nosniff`, `DENY`, `no-store`; drop `Server`; deny-by-default self-test. |
| **21** | API Top 10/RBAC | `APSC-DV-000450/460` | API 2023 | BOLA/BOPLA/BFLA service RBAC, MCP `ApprovalRequest`, `<= 100`/page anti-mining. |
| **22** | SBOM & Threat Mod | `V-222513` / `003230` | SBOM | Signed CycloneDX SBOM/CBOM (`ECMA-424`), SHA-256 manifest, `pytm` models. |

---

## 3. Domain 1 — Multi-Tenant PostgreSQL 15–17+ RLS (`QA-PG17-RLS` & `SEC-16`)

### 3.1. Database Engine Isolation (`QA-PG17-RLS`)
- **Non-Bypass Runtime Role:** Connect apps exclusively via a role provisioned with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` (never superuser or `BYPASSRLS`).
- **Mandatory Row-Level Security:** Every multi-tenant table MUST include `tenant_id UUID NOT NULL` with both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (prevents table-owner bypass).
- **Catalog Verification:** Audit PG15–17+ enforcement via `pg_catalog.pg_class.relforcerowsecurity` joined with `pg_catalog.pg_namespace` — NEVER nonexistent `pg_tables.forcerowsecurity`.
- **Multi-Transaction `AsyncSession` Persistence (`after_begin`):** `SET LOCAL app.current_tenant_id` expires on `await db.commit()`/`rollback()`. Store `(tenant_id, is_superadmin)` in `session.sync_session.info` and register `@event.listens_for(AsyncSession.sync_session_class, "after_begin")` to re-run `set_config` on every new transaction (e.g., post-commit `write_audit_log()`).
- **Scoped Pre-Auth Lookups:** Never weaken RLS `USING` clauses; use tightly scoped `SECURITY DEFINER` SQL functions (`SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE`) for pre-auth tenant `slug` resolution or bootstrap counts.

### 3.2. Multi-Step Pre-Auth & Challenge Continuity (`SEC-16`)
Unauthenticated multi-step ceremonies (`login -> mfa_enrollment_required | mfa_challenge | password_change_required` -> `POST /auth/mfa/*`) MUST enforce:
1. **Opaque CSPRNG Challenge (`>= 128-bit`):** Issue `secrets.token_urlsafe(32)` in JSON body/header (never URL query strings) and verify `Origin`/`Sec-Fetch-Site` on pre-auth `POST`.
2. **Atomic KeyDB Consumption:** Consume once via `GETDEL` or Lua `HGETALL`+`DEL` and scope pre-auth idempotency to `idemp:preauth:{challenge_id}:{key}`.
3. **Strict `TTL <= 300s` & Purge (`APSC-DV-000530`):** Expire at `ex=300` and delete immediately after `3–5` invalid verification attempts.
4. **Symmetric `PREAUTH_PUBLIC_ROUTES`:** Share one route list across backend CSRF/Idempotency exemptions and frontend `401` interceptors (no `/auth/refresh` without session), tested in **one continuous unmocked login-to-MFA flow**.

---

## 4. Domain 2 — Vault Cryptography & API / MCP Boundaries

- **Vault Cryptography (FIPS 140-3 & Memory Zeroization):** Encrypt credentials, tokens, and tenant secrets with AES-256-GCM (`APSC-DV-002010..002040`), tenant AAD (`tenant_id:purpose`), and versioned `kid` rotation. Zeroize key/plaintext buffers on exit via `bytearray` context managers or `sodium_memzero` (`APSC-DV-002590`); disable TLS/HTTP compression.
- **Service-Layer RBAC (Anti-`Depends()` Bypass, `OWASP API5:2023 BFLA`, `APSC-DV-000460`):** FastAPI `Depends()` runs only on HTTP routes; internal MCP/JSON-RPC dispatchers, WS handlers, and background workers bypass it. Validate `claims["role"]`/`claims["rol"]` at service entrypoint, never call HTTP route functions from MCP dispatchers, and unit-test direct unprivileged calls asserting `PermissionError`/`403`.
- **MCP Approval Gate & Tool Poisoning:** Route mutating MCP tools through `ApprovalRequest` (`AWAITING_APPROVAL` with `tenant_id`, `payload_hash`, `expires_at`) requiring human approval (+ Step-Up `APSC-DV-001470` for critical actions) and mark `readOnlyHint`/`destructiveHint`. Enforce Zod `.strict()` / Pydantic `extra="forbid"`, delimit untrusted payloads against indirect prompt injection, and block shell interpolation (`shell=False`, `execFile`).
- **API Edge Controls:** Enforce `Idempotency-Key` on `POST/PUT/PATCH/DELETE` (`idemp:{tenant_id}:{user_id}:{key}`), CSRF HMAC-SHA256 (`HttpOnly; Secure; SameSite=Strict; Path=/`), prod `422` sanitization (`QA-SMOKE-01`, `SEC-15`), and Pre-DNS Anti-SSRF checks.

---

## 5. Domain 3 — Session & Identity Governance

| Control Area | DISA STIG V6R5 / OWASP | Mandatory Rule |
| :--- | :--- | :--- |
| **Concurrency** | `APSC-DV-000010`, `003360` | Enforce per-user KeyDB session limits; alert on simultaneous distinct IPs. |
| **Idle Timeouts** | `APSC-DV-000070`, `000080` | Expire idle privileged sessions at **10 min**, standard at **15 min**, plus absolute caps. |
| **CSPRNG Rotation** | `APSC-DV-002250..2290`, `001800` | Rotate session IDs on login/MFA/elevation/TLS; revoke all on disable or password change. |
| **Logoff Purge** | `APSC-DV-000060`, `000100`, `002240` | Wipe `localStorage`, `sessionStorage`, `CacheStorage`, `IndexedDB`, cookies; confirm logoff. |
| **Lockout & Timing** | `APSC-DV-000530`, `OWASP A-19/20` | Lock after **3 fails in 15 min**; run dummy Argon2id verify on unknown users. |
| **Passwords** | `APSC-DV-001680..1780`, `P-6` | `>= 15` chars, multi-class, `>= 8`-char delta, `5`-gen history, zero security questions. |
| **Lifecycle/Step-Up** | `APSC-DV-000300/320/580/1470` | Auto-disable temp at **72 h**, inactive at **35 d**; show last logon; Step-Up on critical ops. |
| **mTLS / PKI** | `APSC-DV-001640`, `001850` | Validate service-to-service client certs and revocation (`CRL`/`OCSP` cache). |

---

## 6. Domain 4 — Input Hardening, WORM Audit, Runtime & Supply Chain

### 6.1. Input, XML, Deserialization & File Hardening
- Canonicalize UTF-8 with `NFKC` before validation (`APSC-DV-002520`); reject ASCII `\x00-\x1F`, `\r`, `\n`.
- Disable XML DTD/XXE (`defusedxml`, `resolve_entities=False`, `no_network=True`, `LIBXML_NONET`, `APSC-DV-002390/002550`); verify SAML signatures & `OneTimeUse`.
- Ban `pickle`, `yaml.load` (use `yaml.safe_load`), `unserialize` without `allowed_classes => false`, `eval`, and `shell=True`/`os.system`/`shell_exec` (`APSC-DV-002510`).
- Check magic bytes (`finfo_file`/`python-magic`), cap streams `<= 10 MB`, store `noexec` outside web root via indexed allowlists (`APSC-DV-002485/002960`).

### 6.2. WORM Audit Chains & Semantic Integrity (`APSC-DV-001350`, `000650`)
- **Hash-Chain Serialization:** Never chain `prev_record_hash` solely by `created_at DESC` (clock ties race). Pair monotonic `BIGINT seq_num` with `SELECT pg_advisory_xact_lock(hashtext(:tenant_key))`, track `_in_tx_audit_hash` in `session.sync_session.info`, and call `await session.flush()`.
- **Strict JSONB / `Decimal` Parity:** Validate `AuditLog.before_state`/`after_state` with `json.dumps(..., sort_keys=True)` **without `default=str`**; populate `Numeric(p, s)` fixtures with `decimal.Decimal`.
- **Anti-Blind-Mock & Anti-Raw-UUID:** Never stub `write_audit_log` with an unasserted `AsyncMock`; verify `actor_username`/`resource_display_name` are human-readable (never raw UUID v4 `claims.get("sub")`) and match semantic UI badges (`UI-11X-02`, no catch-all `else`).
- **Logging & Scrubbing:** Emit UTC ms + `trace_id`, zero secrets/PII (`APSC-DV-000650`), alert at **75%** audit capacity (`APSC-DV-001090`), and scrub DB exports (`APSC-DV-003310`).

### 6.3. Supply Chain, OSHP, Runtime Contracts & Rootless Containers
- **OSHP, Fail-Secure & Supply Chain:** Enforce HSTS, CSP, `nosniff`, `DENY`, `no-store`, drop `Server` headers, run startup self-tests (`APSC-DV-002310/002770`), enforce anti-mining quotas (`APSC-DV-000450`), keep `pytm` threat models (`APSC-DV-003230`), and emit signed CycloneDX SBOM/CBOM (`ECMA-424`, `APSC-DV-001430/003140`, `STIG V-222513`).
- **`QA-HEALTH-01` & `QA-CLI-TTY-01`:** Boot orchestrators under default prod `Settings()` without mocking `OPTIONAL_WORKERS` (surfacing `task.exception()`); detect `isTTY`/`isatty()` without `--stdio` to print help and `exit(0)` in `<= 5s`.
- **Rootless Alignment (`QA-COV-01` & `pnpm-store-init`):** Use `cap_drop: [ALL]`, `no-new-privileges:true`, `read_only: true` (`/tmp` `tmpfs`), Trivy `HIGH/CRITICAL = 0`, `-u "$(id -u):$(id -g)"`, `HOME=/tmp`, `COVERAGE_FILE=/tmp/.coverage`, `UV_CACHE_DIR=/tmp/uv-cache`, and `pnpm_config_store_dir=/pnpm/store` + `pnpm-store-init` (`chmod -R a+rwX /pnpm`) on `UID 10001` Node images to prevent `os error 13`.
