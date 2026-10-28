# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: Security-by-Design & Multi-Layer Testing Guidelines

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI agents and developers. Any code failing security or testing guidelines must be immediately rejected and refactored.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Multi-Layer Testing & Anti-Mock Blindness

Unit test isolation using mocks measures quick code execution paths, but introduces severe blind spots if disconnected from reality:

1. **ORM vs Database Schema Invariant:**
   - **Zero Schema Drift:** Modifying ORM models never alters the database automatically.
   - **Mandatory Migrations:** Any new model, table, constraint, or column type change requires an immediate versioned migration script.
   - **Real Database Engine Verification:** Always verify tables, column types, and indices in a real database container (e.g. PostgreSQL). Never assume passing mocks guarantee SQL syntax execution.
2. **Visual Geometry & Anti-JSDOM Testing:**
   - JSDOM does NOT calculate CSS Flexbox/Grid layouts, element coordinates, or viewport bounding boxes (always returns `0x0`).
   - Prevent overlapping elements (e.g. fixed footers collapsing over forms, modals hidden behind navbars) by enforcing in-flow layouts (`margin-top: auto` inside `<main>`), validating DOM hierarchy, and inspecting real browser viewports in Karate UI or Playwright.
3. **Trimodal Ground-Truth Fixtures:**
   - When integrating external APIs or hardware, test against 3 raw fixtures:
     - **Fixture A (Virgin / Unconfigured):** Must assert negative invariant (`active=False`, `status="NOT_CONFIGURED"`).
     - **Fixture B (Nominal Configured):** Must assert positive invariant (`active=True`, nominal telemetry).
     - **Fixture C (Degraded / Unsupported):** Must assert graceful degradation without unhandled 500 errors.

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
11. **Shift-Left Lockfile Governance:**
    - Manage dependencies with strict lockfiles (`uv.lock`, `pnpm-lock.yaml`). Upgrade transitive CVEs via selective package commands (`uv lock --upgrade-package`, `pnpm update`).

---

## 3. Pre-Commit Security Checklist

Before committing code:
- [ ] New/modified ORM models have matching migration scripts verified in real DB?
- [ ] Inbound network handlers tolerate proxy NAT and validate against SSRF?
- [ ] Mass assignment blocked with `extra="forbid"`?
- [ ] Zero missing imports verified via static analysis (`ruff check`, `vue-tsc --noEmit`)?
- [ ] Added Karate Labs API and/or UI BDD scenarios?
- [ ] Executed secret scanning (`verificar-secretos.sh`) with 0 leaks detected?
- [ ] Executed IaC and dependency scan (`auditar-infra.sh`) with 0 High/Critical findings?
- [ ] Reviewed security guidelines in `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`?
