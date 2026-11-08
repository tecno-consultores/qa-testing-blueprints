# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: Security-by-Design & Multi-Layer Testing Guidelines

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents and developers. Any code failing security or testing guidelines must be immediately rejected and refactored.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Multi-Layer Testing & Anti-Mock Blindness

Unit test isolation using mocks measures quick code execution paths, but introduces severe blind spots if disconnected from reality:

1. **ORM vs Database Schema Invariant & AsyncSession Safety:**
   - **Zero Schema Drift:** Modifying ORM models never alters the database automatically.
   - **Mandatory Migrations:** Any new model, table, constraint, or column type change requires an immediate versioned migration script with `revision` ID `<= 32` characters (`VARCHAR(32)` limit in `alembic_version`).
   - **Real Database Engine Verification:** Always verify tables, column types, and indices in a real database container (e.g. PostgreSQL). Never assume passing mocks guarantee SQL syntax execution.
   - **SQLAlchemy 2.0 `AsyncSession` `MissingGreenlet` Prevention:** After `await db.commit()` or `await db.rollback()`, ORM attributes expire by default. Never access ORM model attributes (`model.id`, `model.email`) after commit/rollback without `await db.refresh(model)` or capturing primitive variables beforehand.
   - **SQLAlchemy `JSON`/`JSONB` Serialization & `Numeric(p, s)` `Decimal` Parity in `MockDbSession`:** In unit tests using mock database sessions (`MockDbSession`), `add()` / `flush()` / `commit()` MUST validate all SQLAlchemy `JSON`/`JSONB` columns (such as `AuditLog.before_state` and `AuditLog.after_state`) by passing them through `json.dumps()` **without `default=str`** (matching the default PostgreSQL `asyncpg` dialect serializer), and ORM `Numeric(p, s)` attributes MUST be populated in fixtures with `decimal.Decimal` instances (never `float`) so `TypeError: Object of type Decimal is not JSON serializable` (as well as raw `UUID` or `datetime` serialization failures) are caught in unit tests before reaching production.
2. **Visual Geometry, Multi-Viewport Ergonomics & Anti-JSDOM Testing:**
   - JSDOM does NOT calculate CSS Flexbox/Grid layouts, element coordinates, or viewport bounding boxes (always returns `0x0`).
   - Prevent overlapping elements (e.g. fixed footers collapsing over forms, modals hidden behind navbars) by enforcing in-flow layouts (`margin-top: auto` inside `<main>`), validating DOM hierarchy, and inspecting real browser viewports (`375x667` mobile, `768x1024` tablet, `1440x900` desktop) with zero horizontal scroll (`scrollWidth <= innerWidth`) in Karate UI or Playwright.
3. **Trimodal Ground-Truth Fixtures, 3-Phase Temporal Lifecycle, Cross-Module Propagation & Sequential Idempotency:**
   - When integrating external APIs or hardware, test against 3 raw fixtures:
     - **Fixture A (Virgin / Unconfigured):** Must assert negative invariant (`active=False`, `status="NOT_CONFIGURED"`).
     - **Fixture B (Nominal Configured):** Must assert positive invariant (`active=True`, nominal telemetry).
     - **Fixture C (Degraded / Unsupported):** Must assert graceful degradation without unhandled 500 errors.
   - **Cross-Module State Propagation (Zero Intermediate Silo Mocks):** Mutations in Module A (`POST`/`PUT`/`PATCH`/`DELETE`) must be verified by querying Consumer Module B `GET` endpoints and stores against the real test database without intermediate mocks.
   - **3-Phase Temporal Lifecycle Assertion:** Time-bounded entities (`starts_at`/`ends_at`, 60s Safe Mode rollback, 30s Step-Up tokens, leases) must be tested across Phase 1 (`t < starts_at`, `Programada`), Phase 2 (`starts_at <= t <= ends_at`, `En Curso` / `Activa` with live scheduler), and Phase 3 (`t > ends_at` or Cancelled, nominal state restored).
   - **Fresh `Idempotency-Key` per Mutation in Tests:** Never reuse a static `Idempotency-Key` UUID across distinct sequential `POST`/`PUT`/`PATCH`/`DELETE` test steps against real KeyDB/Redis, as the idempotency cache will replay the first response and mask subsequent assertions.

---

## 2. Security-by-Design Directives

Apply these non-negotiable security directives before writing any code:

1. **Multi-Tenant Isolation & Row-Level Security (RLS):**
   - Every multi-tenant table MUST include a tenant foreign key (`tenant_id UUID NOT NULL`).
   - Database migrations MUST enforce RLS policies: `ENABLE ROW LEVEL SECURITY;` and `FORCE ROW LEVEL SECURITY;`.
   - Backend database sessions must set the current tenant context before executing queries.
2. **Strict SSRF Prevention:**
   - Any user-supplied URL or host IP must pass strict validation before making outbound network calls.
   - Reject: loopback (`127.0.0.0/8`, `::1`, `localhost`), link-local (`169.254.0.0/16`), and internal container hostnames (`*-db`, `*-redis`, `*-api`).
3. **Zero Plaintext Secrets & Cryptographic Vault:**
   - Passwords and private API keys must NEVER be stored in plaintext. Encrypt sensitive fields with AES-256-GCM.
   - User credentials must use Argon2id. Symmetric keys must be ephemeral or securely bound to master vault keys.
4. **Idempotency for Mutating Operations:**
   - All state-mutating requests (`POST`, `PUT`, `DELETE`) should support or require an `Idempotency-Key` header, managed via in-memory cache (KeyDB / Redis) with composite namespacing (`idemp:{tenant_id}:{user_id}:{key}`).
5. **CSRF & Hardened Session Cookies:**
   - Session cookies: `HttpOnly; Secure; SameSite=Strict; Path=/`.
   - Mutation requests from browsers require CSRF token validation (`X-CSRF-Token` HMAC-SHA256). Exclude M2M calls utilizing `Authorization: Bearer` headers per OWASP guidelines.
6. **Mass Assignment Prevention:**
   - Enforce `model_config = ConfigDict(extra="forbid")` in all input Pydantic models. Strictly decouple input DTOs from ORM models.
7. **Cross-Site WebSocket Hijacking (CSWSH) Defense:**
   - Verify `Origin` header before executing `await ws.accept()`. Close with code `4403` on unlisted origins.
8. **Information Disclosure Prevention:**
   - Sanitize 422 `RequestValidationError` responses in production (`APP_ENV=production`) returning generic messages while logging details to container stdout.
   - Hide Swagger / ReDoc / OpenAPI schemas in production (`docs_url=None`, `redoc_url=None`, `openapi_url=None`).
9. **Front-End XSS & Prototype Pollution Defense:**
   - Compulsory HTML escaping (`escapeHtml`) on dynamic DOM inputs.
   - Sanitize objects against `__proto__`, `constructor`, `prototype`, and instantiate safe records via `Object.create(null)`.
10. **Concurrency Grace Period in Refresh Tokens:**
    - Provide 5s leeway on token family rotations to prevent accidental session revocation across multi-tab requests.
11. **Shift-Left Lockfile & CycloneDX SBOM Governance:**
    - Manage dependencies with strict lockfiles (`uv.lock`, `pnpm-lock.yaml`). Upgrade transitive CVEs via selective package commands (`uv lock --upgrade-package`, `pnpm update`).
    - Generate CycloneDX Software & Cryptography Bills of Materials (SBOM/CBOM, ECMA-424) and cryptographically verify/sign artifacts before release (`APSC-DV-001430`, `APSC-DV-003140`, `OWASP 4.3.3 SFL`).
12. **Session Concurrency, Role-Tiered Timeouts & Logoff Purge (DISA STIG & OWASP 4.3.7):**
    - Enforce maximum concurrent session limits per user (`APSC-DV-000010`) and alert on concurrent logons from distinct workstations/IPs (`APSC-DV-003360`).
    - Terminate idle sessions after **15 minutes** for standard users (`APSC-DV-000070`) and **10 minutes** for privileged/admin users (`APSC-DV-000080`), plus absolute session lifetime limits (`OWASP SM-8, SM-21`).
    - Regenerate session IDs via FIPS 140-3 CSPRNG upon authentication, privilege elevation, or TLS transition (`APSC-DV-002250..002290`). Never recycle session IDs.
    - Purge all client storage (`localStorage`, `sessionStorage`, IndexedDB, in-memory state) and cookies on logoff (`APSC-DV-000060`, `APSC-DV-002240`), display explicit logoff confirmation (`APSC-DV-000100`), and revoke all active sessions immediately when an account is disabled, deleted, or changes credentials (`APSC-DV-001800`).
13. **Account Lockout, Constant-Time Auth & Account Lifecycle (DISA STIG & OWASP 4.3.7):**
    - Lock accounts after **3 consecutive invalid logon attempts within 15 minutes** (`APSC-DV-000530`) and enforce constant-time credential verification (dummy Argon2id hash verify on unknown users) to prevent user enumeration (`OWASP A-19, A-20`).
    - When local passwords are used: require >= 15 chars (`APSC-DV-001680`), multi-class complexity, 8-char diff on change (`APSC-DV-001730`), 5-generation history (`APSC-DV-001780`), and zero security questions (`OWASP P-6`).
    - Auto-disable temporary accounts after **72 hours** (`APSC-DV-000300`) and inactive accounts after **35 days** (`APSC-DV-000320`). Display last successful/failed logon timestamp upon login (`APSC-DV-000580`). Require Step-Up re-authentication before sensitive operations (`APSC-DV-001470`) and mTLS/PKI path validation (`CRL`/`OCSP` cache) for service-to-service calls (`APSC-DV-001640`, `APSC-DV-001850`).
14. **Input Canonicalization, XML/XXE, Safe Deserialization & File Magic-Bytes (DISA STIG & OWASP 4.3.5, 4.3.6):**
    - Normalize UTF-8 inputs (`NFKC` via Python `unicodedata.normalize("NFKC", ...)` or PHP `\Normalizer::normalize(..., \Normalizer::FORM_KC)`) before validation (`APSC-DV-002520`, `OWASP CEC-5`) and strip/reject ASCII control characters in headers.
    - Disable XML DTDs and external entities (`resolve_entities=False`, `no_network=True`, `defusedxml`, or PHP `LIBXML_NONET`) (`APSC-DV-002390`, `APSC-DV-002550`). Enforce signature, timestamp, and `OneTimeUse` validation on SAML/WS-Security assertions (`APSC-DV-000160..000270`).
    - Prohibit unsafe deserializers (`pickle`, `yaml.load`, PHP `unserialize` without `['allowed_classes' => false]`, `eval`) and direct OS shell execution (`shell=True`, `os.system`, PHP `shell_exec`/`exec`/`passthru`/`system`) (`APSC-DV-002510`, `OWASP VSD 1-6`).
    - Validate uploaded files via magic-byte signatures (`finfo_file` / `FILEINFO_MIME_TYPE` in PHP), store outside web root with `noexec`, and reference files via allowlisted index maps rather than raw paths (`APSC-DV-002485`, `APSC-DV-002960`, `OWASP FV 1-9`).
15. **Tamper-Proof Security Logging, Log Injection Defense, 75% Storage Alert & Semantic Audit Integrity (DISA STIG & OWASP 4.3.10):**
    - Log auth, account lifecycle (`APSC-DV-000330..000430`), session lifecycle (`APSC-DV-000620..000660`), privilege changes/commands (`APSC-DV-000730..000900`), and startup/shutdown (`APSC-DV-000950`) with UTC timestamps (1s/ms granularity), source/dest IPs, user/process ID, outcome, and `trace_id`.
    - Sanitize CR/LF (`\r`, `\n`) and HTML control chars to prevent Log Injection (`OWASP SL-4, SLD-2`), and never log plaintext passwords, tokens, session IDs, or PII (`APSC-DV-000650`).
    - Protect audit logs with HMAC chains (`APSC-DV-001350`), centralize log off-loading (`APSC-DV-001070`), and alert administrators when audit storage reaches **75% capacity** (`APSC-DV-001090`) or on audit failure (`APSC-DV-001100`).
    - **Prohibition of Blind Audit Mocks & Anti-Raw UUID Invariant:** Never replace `write_audit_log` (or equivalent audit functions) with an empty `AsyncMock` without asserting its received arguments (`assert_called_once` / `call_args`). Audit and UI event feed tests MUST explicitly verify that human-visible identity fields (`actor_username`, `resource_display_name`, `router_display_name`) resolve to human-readable names and **NEVER** match a raw UUID v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, e.g. never pass `actor_username=claims.get("sub")` when `sub` is a UUID). UI event classifiers MUST map each category to its true semantic badge (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without generic `else` clauses assigning domain-specific badges to unrelated events.
16. **FIPS 140-3 Crypto Agility, Memory Zeroization & DB Export Scrubbing (DISA STIG & OWASP 4.3.4, 4.3.9):**
    - Use FIPS 140-2/140-3 validated modules with crypto-agile interfaces (`APSC-DV-002010..002040`, `OWASP CP-5`), disable TLS/HTTP compression (anti-CRIME/BREACH), zeroize secrets in memory at function exit (`APSC-DV-002590`, `OWASP MM 1-9`), and scrub credentials/PII from database exports (`APSC-DV-003310`).
17. **HTTP Security Headers (OSHP), Fail-Secure State & Threat Modeling as Code (DISA STIG & OWASP 4.2, 5.4.4, 7.8):**
    - Enforce `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, `Cache-Control: no-store` on sensitive endpoints, and suppress server/framework version banners (`OWASP SC 8-11`, `OSHP`).
    - Fail to a secure state (deny by default) on startup/abort/config failure (`APSC-DV-002310`, `OWASP AC-10`), verify security function integrity on startup/every 30 days (`APSC-DV-002770`), mitigate OWASP API Security Top 10 (2023) (`BOLA`, `BOPLA`, `BFLA`, anti-data-mining `APSC-DV-000450`), and maintain programmatic Threat Models (`pytm` / `Threat Dragon`, `APSC-DV-003230`).

---

## 3. Pre-Commit Security Checklist

Before committing code:
- [ ] New/modified ORM models have matching migration scripts verified in real DB?
- [ ] Inbound network handlers tolerate proxy NAT and validate against SSRF?
- [ ] Mass assignment blocked with `extra="forbid"` and BOLA/BOPLA/BFLA checks enforced?
- [ ] Inputs canonicalized (`NFKC`), XML external entities disabled, and logs sanitized against CR/LF injection & secret leaks?
- [ ] Session idle/absolute timeouts, concurrency limits, and full storage purge on logoff verified?
- [ ] Zero missing imports verified via static analysis (`ruff check`, `vue-tsc --noEmit`)?
- [ ] Added Karate Labs API and/or UI BDD scenarios?
- [ ] Executed secret scanning (`verificar-secretos.sh`) with 0 leaks detected?
- [ ] Executed IaC and dependency scan (`auditar-infra.sh`) with 0 High/Critical findings?
- [ ] Reviewed security guidelines in `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`?
