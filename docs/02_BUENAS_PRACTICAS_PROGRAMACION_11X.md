> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md)

# 🛡️ Programming and Architecture Best Practices (Level 11X)

> **PURPOSE:**  
> This manual compiles lessons learned in mission-critical projects on secure development, resilient architecture, and operational interface design. It goes beyond testing tools to address the architectural traps that developers and AI agents must actively avoid.

---

## 1. Anti-Mock Blindness

### The Problem
Isolation via mocks (`pytest-mock`, `unittest.mock`, `nock`) delivers 100% coverage in milliseconds, yet creates a dangerous illusion:
- The developer mocks a database call assuming the `status` column accepts `NULL`.
- The unit test passes in CI/CD.
- In production, the actual table enforces `NOT NULL` and the application crashes with a SQL integrity 500 error.

### The 11X Solution
1. **Zero Schema Drift:**
   - Modifying an ORM model (SQLAlchemy, Prisma, TypeORM) does not magically alter the database.
   - Every model change, new column, or constraint (`UniqueConstraint`) requires an immediate versioned migration (e.g., Alembic).
   - Automatically validate parity between models and migrations using `.agents/scripts/verify_alembic_orm_parity.py`.
2. **Verification Against Real Database Engines:**
   - Integration suites and contracts must execute against a real PostgreSQL container launched in `docker-compose.qa.yml`. Never consider a SQL query validated until PostgreSQL has executed it without mocks.

### 1.1. Anti-Silo & UAT Anti-Blindness Invariant (The 11 Mandatory Test Design Rules)
Unit coverage (`>= 95%`) measures the percentage of executed lines, yet remains blind to cross-module disconnects, short timeouts masked by instant mocks, asymmetries in pre-authentication flows, containers turning `unhealthy` after passing isolated suites, dual `CLI + MCP stdio` binaries hanging human terminals, or SDK signature changes hidden by mocks (*Silo & Pipe Mock Blindness*). Every suite under the QA 11X Standard must enforce these **11 mandatory test design rules** (in 1:1 parity with `qa-11x-architect` §2.1):

1. **Cross-Module State Propagation Without Intermediate Mocks (*Cross-Module State Propagation*):**
   - It is strictly forbidden to validate a mutation test solely by asserting `HTTP 200/201` on the mutating endpoint (e.g., `POST /api/v1/maintenance/windows` or administrative status changes) while consumer modules (e.g., NOC Wallboard or Inventory) are tested with hand-written static fixtures.
   - Whenever an operation in Module A modifies an entity's operational state, the test suite MUST immediately query the consumer Module B `GET` endpoints (e.g., `GET /api/v1/inventory/items`) and stores **without intermediate mocks**, certifying that effective state, KPI counters, badges, and maps reflect the end-to-end mutation.
2. **Mandatory 3-Phase Temporal Lifecycle Assertion (*3-Phase Temporal Lifecycle Assertion*):**
   - Any entity or flow governed by time windows, timers, or TTLs (`starts_at` / `ends_at`, 60s Safe Mode confirmation/rollback windows, 30s Step-Up token expiration, temporary leases) MUST be tested across all **3 clock phases** (forbidding 2-state binary ternaries like `is_cancelled ? 'Cancelada' : 'Programada'`):
     - **Phase 1 (`t < starts_at`):** Scheduled / Pending state (`Programada`).
     - **Phase 2 (`starts_at <= t <= ends_at`):** Active / In-Progress state (`En Curso` / `Activa`, verifying that the scheduled resource or scheduler remains alive beyond the 50ms HTTP request and projects the active state to all consumer modules).
     - **Phase 3 (`t > ends_at` or Cancelled):** Expired / Purged / Reverted state (verifying automatic restoration to the original nominal state and audit trail recording).
3. **Ban on Blind Audit Mocks, `JSONB`/`Decimal` Parity, and Raw-UUID Semantic Assertion (`SEC-11` & `UI-11X-02`):**
   - Replacing audit functions (`write_audit_log` or equivalents) with an empty `AsyncMock` without asserting received arguments (`assert_called_once` / `call_args`) is forbidden. In tests using simulated sessions (`MockDbSession`), validate all `JSON`/`JSONB` columns (`AuditLog.before_state`, `AuditLog.after_state`) by running `json.dumps()` **without `default=str`** and populating `Numeric(p, s)` attributes with real `decimal.Decimal` instances to prevent `TypeError: Object of type Decimal is not JSON serializable` escapes.
   - Every audit test and UI event-ticker test MUST explicitly assert that visible identity fields (`actor_username`, `resource_display_name`, `router_display_name`) resolve to human-readable names and **never** match a raw UUID v4 pattern (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, avoiding passing `claims.get("sub")` directly as `actor_username`, rule `SEC-11`), and that UI event classifiers map every category to its true semantic badge (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`), forbidding generic catch-all `else` clauses (`UI-11X-02`).
4. **Dual Auto + Manual Refresh Invariant in Operational Views and Live Maps (`UI-11X-02` — *Dual Auto + Manual Refresh Invariant*):**
   - Every monitoring view, operational dashboard, console, or real-time cartographic map MUST simultaneously provide a reactive/periodic update mechanism (`setInterval` with guaranteed `clearInterval` cleanup in `onUnmounted` + WebSocket listener) and an explicit operator-accessible **`[ 🔄 Refrescar ]`** button forcing immediate live reload (`?refresh=true`) without relying on browser reload (`F5`).
5. **Heavy-Transfer Timeout Separation (`>= 180s` + `0-byte` Purge) and Per-Item Validation on `HTTP 200 OK` Batch Responses:**
   - **Separating Telemetry Timeouts vs. Synchronous Image/Firmware Transfers:** Instant mocks (`AsyncMock` / `vi.fn()`) resolve in `0 ms`, masking how short HTTP telemetry timeouts (`5s–10s`) abort real synchronous package/firmware/backup downloads (e.g., ~21 MB `.bin`/archive packages) and leave truncated `0-byte` files in target storage. Every HTTP client executing heavy synchronous transfers MUST allow and send an explicit per-request timeout override (`timeout >= 180s`) and purge prior or failed truncated (`0-byte`) artifacts (verifying both behaviors via `call_args` in unit tests).
   - **Ban on Blind `HTTP 200 OK` Success on Batch Endpoints:** In services and UI views consuming bulk execution endpoints (`POST .../execute`, `POST .../batch`), assuming global success merely from receiving `HTTP 200 OK` is strictly forbidden; inspect `res.data.results[].status` (or `items[].status`) for every target resource and reflect partial or total per-item failure states (`results[].status == 'FAILED'` or `'ERROR: bad HTTP response'`) in both UI and tests.
6. ***Zero Hardcoded Pass* Guarantee, Non-Root Real Coverage (`QA-COV-01`), and Chained Strict Typing (`QA-MYPY-01`):**
   - No quality gate, coverage parser, or test runner may return a literal `true` or `'PASSED'` when a tool did not execute or produced no verifiable metrics; it must return `'SKIPPED'` or `detected: false`.
   - Invoking `pytest -o addopts=""` without explicitly attaching `--import-mode=importlib --cov=src --cov-fail-under=95` along with `-e COVERAGE_FILE=/tmp/.coverage -e PYTHONPATH=/app/src` (`QA-COV-01`) is forbidden, preventing accidental silencing of the `95%` threshold or SQLite permission errors inside non-root containers (host/CI mapped `-u "$(id -u):$(id -g)"`, e.g., `UID 1001` on GitHub Actions / `${QA_UID:-1000}` locally, overriding image default `appuser UID 10001` in `base-python-uv:3.15`). In Node.js/Mobile/Frontend ecosystems (`sinfallas/base-node-ionic:26` and `sinfallas/base-mobile-appium:26`, whose default user is `appuser uid=10001`), always map the host/CI user (`-u "$(id -u):$(id -g)"`), set `HOME=/tmp` + `pnpm_config_store_dir=/pnpm/store`, and initialize the `pnpm-store:/pnpm` volume with `chmod -R a+rwX /pnpm` (`pnpm-store-init`) to prevent `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR` (`os error 13`) failures on bind-mounted volumes. If `pyproject.toml` declares `[tool.mypy]`, the `Makefile` `qa-lint` target MUST chain `mypy --strict --cache-dir=/tmp/mypy src/` alongside `ruff` (`QA-MYPY-01`).
7. **Post-Import `Settings` Singleton Synchronization (`QA-SMOKE-01`) and Ephemeral Secrets in Local Smoke (`SEC-15`):**
   - In smoke tests validating production startup (`APP_ENV=production`, e.g., verifying `docs_url=None` or rejecting default secrets), modifying only `os.environ["APP_ENV"] = "production"` after importing `app` or `settings` is ineffective because the Pydantic singleton was already instantiated in memory. The test MUST mutate both `os.environ` and the imported singleton attribute (`settings.APP_ENV = "production"`), restoring the original value inside a `finally` block (`QA-SMOKE-01`).
   - Local production validation scripts (`probar-prod-local.sh`) must NEVER reuse static QA passwords; they must generate ephemeral cryptographic keys (`openssl rand -base64 32` / `openssl rand -hex 32`) prior to `docker compose up -d` and propagate the rotated admin credential via `docker exec -e` (`SEC-15`).
8. **Continuity and Atomic Immunity in Multi-Stage Pre-Auth Ceremonies (`SEC-16`):**
   - Multi-step unauthenticated flows (`POST /auth/login` returning `mfa_enrollment_required`, `mfa_challenge`, or `password_change_required`, followed by `POST /auth/mfa/enroll`, `POST /auth/mfa/verify`, or WebAuthn) fail in UAT when each step is tested isolated with mocks while in the live app global middlewares (`CSRF` / `Idempotency-Key`) or the frontend's `401 -> /auth/refresh` HTTP interceptor block the second step.
   - Four controls must be satisfied and certified in **a single continuous test without intermediate mocks**: (a) opaque CSPRNG `challenge_id >= 128 bits` (`secrets.token_urlsafe(32)`) in JSON/header validating `Origin`/`Sec-Fetch-Site`, (b) atomic single-use consumption with `GETDEL`/Lua or scoped key `idemp:preauth:{challenge_id}:{key}` in KeyDB/Redis, (c) `TTL <= 300s` and immediate purge after `3–5` failed attempts, and (d) symmetric `PREAUTH_PUBLIC_ROUTES` list across backend middlewares and the frontend `401` interceptor.
9. **Unmocked Orchestrator Boot and Container `Healthcheck` Contract (`QA-HEALTH-01`):**
   - **The Escape It Prevents:** A background worker container (`python -m src.workers.runner`) achieves `>= 95%` unit coverage yet turns `unhealthy` on real `docker-compose` startup when: (1) a config-disabled optional sub-worker (`SIEM_EXPORT_ENABLED=false`) executes a clean `return None` on its first tick (`task.done() == True`, `task.exception() is None`), (2) the supervisor loop checks `if task.done() and not task.cancelled(): healthy = False`, mistaking opt-in clean exit for a fatal crash, and (3) the orchestrator test mocks all sub-workers with `AsyncMock` + `asyncio.sleep(0.01)` + `cancel()` without checking the physical probe/file required by `Dockerfile` / `docker-compose.yml` (e.g., `/tmp/worker_heartbeat`).
   - **Mandatory Contract:** Every worker runner, scheduler, or entrypoint supervised by a container `HEALTHCHECK` MUST have at least one unit-integration test booting the real orchestrator under default production `Settings()` (with optional workers disabled) **without mocking optional loops**, explicitly asserting emission and persistence of the health artifact (`WORKER_HEARTBEAT_PATH.exists()` or `/healthz` `200 OK`) across multiple event-loop cycles.
   - **Exit Semantics in `asyncio.Task` Supervisors:**
     ```python
     from pathlib import Path
     import asyncio

     WORKER_HEARTBEAT_PATH = Path("/tmp/worker_heartbeat")
     OPTIONAL_WORKERS: frozenset[str] = frozenset({"siem_exporter", "telemetry_archiver"})

     def is_supervisor_healthy(tasks: dict[str, asyncio.Task[None]]) -> bool:
         for name, task in tasks.items():
             if task.cancelled():
                 return False
             if task.done():
                 # 1. Unhandled exception -> ALWAYS unhealthy
                 if task.exception() is not None:
                     return False
                 # 2. Unexpected exit of mandatory worker -> ALWAYS unhealthy
                 # 3. Clean return (None) of disabled optional worker -> HEALTHY
                 if name not in OPTIONAL_WORKERS:
                     return False
         return True
     ```
10. **Interactive Terminal (`TTY`) Anti-Hang Guard for Dual CLI + `stdio` MCP Binaries (`QA-CLI-TTY-01`):**
   - **The Escape It Prevents (*Pipe & Callback Mock Blindness*):** A hybrid package combining CLI subcommands (`install-skill`, `init-agents`) with an MCP `stdio` server (`StdioServerTransport` in Node/TS or `stdio_server()` in Python) passes 100% of unit tests (which inject a mocked `startStdio` callback) and CI E2E suites (where `StdioClientTransport` and `execFileSync` attach `stdin` via *pipes*, leaving `process.stdin.isTTY === undefined`), yet when a human developer runs `npx -y @package@latest` without subcommands in an interactive console (`TTY`), the process opens `StdioServerTransport` and hangs the terminal indefinitely waiting for JSON-RPC frames that never arrive.
   - **Mandatory Contract:** Every dual CLI + MCP `stdio` entrypoint MUST check `process.stdin.isTTY` (Node/TS) or `sys.stdin.isatty()` (Python) when invoked without subcommands: if an interactive `TTY` terminal is detected (unless `--stdio` or `QA_FORCE_STDIO=1` is explicitly passed), it must complete any safe auto-sync, print the executive MCP setup/registration guide, and exit immediately with `exit(0)`. Furthermore, the E2E suite MUST include a subprocess probe with simulated `TTY` and `timeout <= 5s` proving no hang occurs (`audit_security_stig_owasp` statically audits this condition via `QA-CLI-TTY-01`).
11. **Real-Runtime SDK Transport Contract (`QA-CONTRACT-SDK-01`) and Lockfile Image Install + Built-Image Smoke Test (`QA-DOCKER-LOCK-01`):**
   - **The Escape It Prevents:** 95% coverage does not guarantee the service runs in real runtime: (1) if tests invoke MCP/JSON-RPC/ACP handlers directly with `MagicMock`, an SDK signature change (`mcp 1.x -> 2.x`, e.g., from `(request)` to `(ctx, params)`) goes unnoticed and fails with *Internal error* in production; and (2) if the `Dockerfile` installs a manual package list (`pip install fastapi uvicorn`) instead of reading the lockfile, the image omits real dependencies (`ModuleNotFoundError`) even though `pytest` passes in the venv built from `pyproject.toml`.
   - **Mandatory Contract:** Every protocol server MUST include at least one in-process test wired through the real SDK client/transport (`InMemoryTransport` + `Client` in Node/TS or `ClientSession` / `create_connected_server_and_client_session` in Python) executing `list_tools` and `call_tool` without mocking the dispatcher (`QA-CONTRACT-SDK-01`). Every `Dockerfile` MUST install dependencies exclusively from the project lockfile (`uv sync --frozen --no-dev`, `uv export --frozen --no-dev | uv pip install --system -r -`, `pnpm install --frozen-lockfile`, or `npm ci`), and the built image MUST pass a post-build CI smoke test (`docker run --rm <img> python -c "import <app>"`, non-root check `id -u != 0`, and unauthenticated `401` probe, rule `QA-DOCKER-LOCK-01`). Additionally, `QA-HEALTH-01` restricts probe detection strictly to real `HEALTHCHECK`/`healthcheck:` blocks (ignoring toolchain paths such as `/tmp/venv`), and `certify_11x_gate` exempts environment templates like `env.example` and `.env*.example`.

---

### 1.2. Co-Evolution Invariant and Mandatory Update of Pre-Existing Tests (`QA-TEST-SYNC-01`)

Modifying a function, route, schema, CLI, skill, or catalog (`manifest.json`) without updating the tests that verified the prior contract causes silent drift and deferred CI false negatives (e.g., stale `#[N]` counts in Karate BDD `.feature` contracts or outdated fixtures in Meta-QA and unit suites). Every legitimate modification must simultaneously apply these three rules:

- **Pre-Edit Consumer Test Audit:** Beyond production blast radius (`inspect_blast_radius.py`), trace all affected consumer suites in `tests/`, `mcp-server/tests/`, `*.feature`, and `*.bats` before editing.
- **Surgical Synchronization Without Weakening Assertions:** Immediately update counts, schemas, fixtures, snapshots, and contract expectations across impacted pre-existing tests; deleting or relaxing valid regression assertions to force a green build is strictly forbidden.
- **Full Pre-Commit Ephemeral Re-Run:** Validate inside ephemeral Docker containers (`Rule Zero`) all impacted suites — including `Karate BDD` (`sinfallas/karatelabs`) whenever `mcp-server/`, `.agents/skills/`, or `manifest.json` changes — prior to sealing the local `git commit`.

### 1.3. Multi-Stack Differential Coverage and Anti-Evasion Gate (`verify_diff_coverage.py` / `make diff-cov`)

To prevent silent test dilution in repositories with high historical coverage or regressions in new paths, every production code increment must pass the deterministic **Multi-Stack Differential Coverage** gate:

- **Safe Ephemeral Report Persistence:** Before tearing down `--rm` containers, `make test-mcp`, `make test-py`, and `run_ephemeral_qa` gather XML/LCOV reports (`python.xml`, `mcp-server.info`) in a contained location inside `.agents/.cache/coverage/` (protected by `.gitignore` and purged by `./scripts/limpieza.sh`).
- **Strict Delta Threshold and Zero Tolerance for Evasions:** `.agents/scripts/verify_diff_coverage.py` (`make diff-cov`) enforces `100%` coverage on new or modified production lines and `>= 90%` on their branches (`BRDA`/`condition-coverage`). Introducing evasion markers (`# pragma: no cover`, `// v8 ignore`, `/* c8 ignore */`, `@codeCoverageIgnore`) without explicit `QA11X-APPROVED-EXCLUSION(<reason>)` justification on the same or immediately preceding line blocks with exit code `11`.
- **Anti-XXE and Unreported New Files:** Any external XML attempt (`<!DOCTYPE`/`<!ENTITY`), path escaping the workspace, or new production file absent from emitted reports halts certification with exit code `12` (`DOCS_ONLY` Fast-Path skips cleanly with `0`).

---

## 2. Visual Geometry and Anti-JSDOM (Layout Blindness)

### The Problem
Virtual DOM test environments like **JSDOM** or **HappyDOM** simulate HTML nodes in Node.js, yet **do not compute CSS rendering, box models (Flexbox/Grid), coordinates (`getBoundingClientRect()`), or visual collisions**:
- A fixed footer (`position: fixed; bottom: 0`) may completely cover a form submit button or table content.
- In Vitest or Jest with JSDOM, the test asserts: `expect(submitButton).toBeInTheDocument()` -> **PASS**.
- In the real browser, the human user cannot click the button because it is hidden behind the footer.

### The 11X Solution
1. **In-Flow Ergonomics (Anti-Sticky Footer — `UI-11X-01`):**
   - Forbid fixed floating footers (`position: fixed`) in dense operational interfaces (`UI-11X-01`).
   - The `<main>` container must use `display: flex; flex-direction: column; min-height: 100vh;` and the footer must use `margin-top: auto` in natural document flow, guaranteeing it never overlaps content.
2. **Real Browser Validation (`ui-e2e` vs. HTTP BDD):**
   - Use **Playwright** (`ui-e2e`) with real headless Chromium to verify DOM geometry, `[ 🔄 Refrescar ]`, and interactive visibility (`waitFor`, `click`), ensuring elements are geometrically clickable in the viewport; reserve `sinfallas/karatelabs:1.5.1` (`--network` HTTP BDD, no browser) for HTTP/Nginx/OSHP/SSG delivery contracts.

---

## 3. Security-by-Design

Any modern system must embed these directives as architectural invariants:

### 3.1. Multi-Tenant Isolation with Row-Level Security (`SEC-13` & `QA-PG17-RLS`)
- Do not rely on developers always remembering to add `WHERE tenant_id = ?` to every SQL query.
- In PostgreSQL, enable forced RLS policies on all customer-data tables under a `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` application role:
  ```sql
  ALTER TABLE items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE items FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_policy ON items
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  ```
- **Multi-Transaction Persistence (`SEC-13`):** Because `SET LOCAL` expires after every `session.commit()`, store `tenant_id` in `session.sync_session.info["tenant_id"]` and register `@event.listens_for(AsyncSession.sync_session_class, "after_begin")` to automatically re-execute `SET LOCAL app.current_tenant_id` in subsequent transactions.
- **Catalog Audit on PostgreSQL 15–17+ (`QA-PG17-RLS`):** Verify `FORCE ROW LEVEL SECURITY` by querying `pg_catalog.pg_class.relforcerowsecurity` (`JOIN pg_catalog.pg_namespace`), never the nonexistent column `pg_tables.forcerowsecurity`.

### 3.2. Strict SSRF Prevention (Server-Side Request Forgery)
- Whenever an API allows users to register external URLs or webhooks, it **MUST** validate the address before issuing the HTTP request.
- Reject private ranges and cloud metadata: `127.0.0.0/8`, `::1`, `localhost`, `169.254.169.254`, and internal container hostnames (`api`, `postgres`, `redis`).

### 3.3. Cryptographic Vault (AES-256-GCM)
- Sensitive integration credentials or remote device passwords must never be stored in plaintext.
- Encrypt at rest using **AES-256-GCM** binding Additional Authenticated Data (AAD, e.g., `tenant_id:entity_id`) to prevent cross-tenant ciphertext transplant attacks.

### 3.4. Idempotency Headers (`Idempotency-Key` & `QA-KARATE-IDEMP`)
- All critical mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) must accept or require the `Idempotency-Key` header (UUIDv4/v7).
- Use KeyDB/Redis to lock the key during processing with a defined TTL, preventing double charges, duplicate provisioning, or concurrency collisions. In Karate Labs BDD scenarios (`.feature`), always generate dynamic per-request keys with `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` (`QA-KARATE-IDEMP`), forbidding static literal UUIDs.

### 3.5. Maker-Checker Governance and Service-Layer RBAC Defense (`SEC-12`)
- For highly destructive operations (storage formatting, bulk tenant deletion, firmware upgrades, or mutating MCP tools), the API/dispatcher must enqueue the request in `ApprovalRequest` (`AWAITING_APPROVAL`, `HTTP 202 Accepted`) until a second authorized operator approves the change.
- **`Depends()` Anti-Bypass Defense (`SEC-12`):** In FastAPI, `Depends(require_roles(...))` only runs when calls enter through the HTTP router. When internal services are invoked by JSON-RPC/MCP dispatchers, WebSockets, or workers, `claims["role"]` / `claims["rol"]` MUST be explicitly validated at the top of the service function.

### 3.6. DISA ASD STIG V6R5 and OWASP Developer Guide Compliance (Sessions, WORM Chain `SEC-14`, Fail-Secure & SBOM)
- **Session and Account Governance (`DISA APSC-DV-000010, 000070, 000080, 000300, 000320, 000530` & `OWASP 4.3.7`):**
  - Limit concurrent sessions per operator and enforce role-tiered idle timeouts (**10 minutes** for privileged accounts and **15 minutes** for standard accounts).
  - Lock accounts after **3 consecutive failed attempts within 15 minutes**, applying constant-time verification (*Dummy Argon2id Hash*) to prevent user enumeration.
  - Automatically expire temporary accounts after **72 hours** and disable inactive accounts after **35 days**.
  - Purge `sessionStorage`, `localStorage`, and browser caches upon logout, and immediately invalidate all active server sessions when an account is revoked or its password changes.
- **Canonicalization, Safe Deserialization, and Magic-Byte Validation (`SEC-03`, `SEC-04`, `SEC-05` — `DISA APSC-DV-002390, 002485, 002510, 002520` & `OWASP 4.3.5, 4.3.6`):**
  - Normalize all text input to **Unicode `NFKC`** prior to validation (`SEC-05`), disable XML external entities (`resolve_entities=False`, `no_network=True`, `SEC-04`), prohibit `pickle`/`yaml.load`/`shell=True` (`SEC-03`), and validate file uploads via header *Magic Bytes* and allowlisted index maps.
- **Immutable Deterministic Forensic Auditing and Log Injection Prevention (`SEC-10`, `SEC-14` — `DISA APSC-DV-000650, 001090, 001350` & `OWASP 4.3.10`):**
  - Record security events in UTC with millisecond granularity, sanitizing line breaks (`\r`, `\n`) to prevent *Log Injection*, chaining records with **HMAC-SHA256** over a monotonic `seq_num BIGINT` sequence serialized with `SELECT pg_advisory_xact_lock(hashtext(tenant_key))` + `await session.flush()` (never ordering solely by `created_at DESC`, `SEC-14`), banning secrets/tokens in code or logs (`SEC-10`), and emitting operational alerts when audit storage exceeds **75% capacity**.
- **Fail-Secure State, OSHP Headers, Supply Chain, and Container Health (`SEC-07`, `SEC-08`, `SEC-09`, `QA-HEALTH-01` — `DISA APSC-DV-002310, 002590, 002770, 003230, 003310`):**
  - Always initialize and fail in a secure state (*Fail-Closed / Deny-by-Default*), hide Swagger/OpenAPI in production (`SEC-07`), inject OWASP OSHP headers (`SEC-08`), set `ignore-scripts=true` in `.npmrc` (`SEC-09`), zeroize secret buffers in memory, scrub credentials from DB exports, verify real container `healthcheck` contracts (`QA-HEALTH-01`), perform threat modeling as code (`OWASP pytm`), and generate cryptographically signed **CycloneDX SBOM/CBOM (ECMA-424)**.

### 3.7. Mitigation Catalog for 22 Attack Vectors on Hybrid Platforms (DISA STIG V6R5 + OWASP)
For deep code implementations (Mass Assignment prevention with `extra="forbid"`, WebSocket anti-CSWSH protection, production 422 sanitization, frontend XSS and Prototype Pollution prevention, session timeouts and concurrency, constant-time account lockout, anti-XXE, immutable HMAC auditing, OWASP OSHP headers, OWASP API Security Top 10 2023 mitigation, and Threat Modeling with `pytm`), consult the specialized technical guide:
👉 **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**

---

## 4. Terminal ↔ Frontend Parity and Mutable Tables

1. **Zero Console-Only Actions:**
   - Any action executable via administrative CLI scripts must have a matching screen in the frontend for technical operators.
2. **Zero Orphan Endpoints:**
   - No API endpoint may exist without a graphical interface allowing inspection, filtering, and actioning of its data.
3. **Operational Tables with Tactical Mutations:**
   - Avoid building purely read-only data tables when the backend API supports mutations. Tables must offer direct action buttons: Create, Edit, Toggle (Enable/Disable), and Delete with visual confirmation.

---

## 5. Container Hardening and KeyDB In-Memory Engine

1. **Mandatory Non-Root Execution:**
   - Production and QA containers must run under unprivileged users (image defaults: `appuser` `UID 10001` in `sinfallas/base-python-uv:3.15`, `sinfallas/base-node-ionic:26`, and `sinfallas/base-mobile-appium:26`; `www` `UID 1000` in `sinfallas/basephpcomposer` — overridden at runtime on bind mounts via `-u "$(id -u):$(id -g)"` / `${QA_UID:-1000}:${QA_GID:-1000}`, e.g. `UID 1001` on GitHub Actions).
2. **Multi-Stage Builds and Pre-Compiled Images:**
   - Isolate compilers and header files in a build stage (`builder`), copying only compiled final artifacts into the minimal runtime image (Alpine or distroless). In PHP (`8.2` to `8.5`), use `sinfallas/basephpcomposer` (tags `8.2`, `8.3`, `8.4`, `8.5`, and `latest`) with pre-compiled native C extensions (`pcov`, `redis`, `pdo_pgsql`, `intl`, `sodium`, `opcache` with `save_comments=1` and JIT) and `expose_php = Off`.
3. **In-Memory Engine: Multi-Threaded KeyDB:**
   - Replace traditional single-threaded Redis with **KeyDB** (`eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac`, `v6.3.4` multi-arch) using `--server-threads 2`. This multiplies read/write and pub/sub throughput by 3x without altering client code while retaining 100% compatibility with Redis libraries.
4. **Preventive Auditing with Trivy:**
   - Integrate automated vulnerability scans with `aquasec/trivy:0.76.2` across the filesystem and infrastructure manifests (`./scripts/auditar-infra.sh`), blocking production release if any CRITICAL or HIGH findings exist.

### 5.1. Non-Interactive Deployments (`docker compose run -T`) and Wrangler v4 (Cloudflare Pages) in `read_only: true` Containers (`QA-DOCKER-TTY-01`)

During production *dogfooding* under **Rule Zero** (`wrangler 4.161.0` inside hardened containers with `read_only: true`, `cap_drop: [ALL]`, and `CI: 'true'`), three chained failures were uncovered when combining modern interactive CLIs with read-only root filesystems:
1. **`NoDefaultValueProvided` via pseudo-TTY (`process.stdin.isTTY === true`):** `docker compose run --rm` without `-T` allocates a pseudo-TTY even when `CI: 'true'` is set. If the project does not yet exist on the account or the CLI uses interactive selectors, the process enters the prompt branch and aborts immediately. In CI/CD pipelines, deployment scripts (`deploy*.sh`, `ci*.sh`), and agent workflows, always execute `docker compose run --rm -T` (`QA-DOCKER-TTY-01`).
2. **`ENOENT` / `EROFS` failure on `/app/.wrangler/cache` (`saveToConfigCache`):** With `read_only: true`, Docker requires any `tmpfs` mount target outside `/tmp` or `/run` to already exist inside the image. Any local cache directory required by the tool (e.g., `/app/.wrangler`) must be pre-created in the `Dockerfile` (`mkdir -p` + `chown`) and mounted as `tmpfs` with `mode=1777,noexec,nosuid,nodev`.
3. **Silent Pages-to-Workers delegation (`maybeDelegatePagesToWorkers`) in AI agent sessions:** Wrangler v4 may attempt to redirect new static projects toward Cloudflare Workers when it detects coding-agent environment variables; explicitly pass `--force` on both `wrangler pages project create` (after idempotently checking the JSON list) and `wrangler pages deploy`.

```dockerfile
# Dockerfile.deploy — pre-create mount point before dropping to non-root user
USER root
RUN mkdir -p /app/.wrangler \
    && chown -R appuser:appgroup /app /pnpm
USER appuser
```

```yaml
# docker-compose.deploy.yml — read_only rootfs + noexec tmpfs + Fail-Secure + --force
services:
  deploy:
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=64M,mode=1777,noexec,nosuid,nodev
      - /app/.wrangler:size=32M,mode=1777,noexec,nosuid,nodev
    environment:
      HOME: /tmp
      WRANGLER_SEND_METRICS: 'false'
      CI: 'true'
    entrypoint: ["sh", "-c"]
    command:
      - |
        set -eu
        : "$${CF_PAGES_PROJECT:?CF_PAGES_PROJECT is required}"
        : "$${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
        PROJECT="$${CF_PAGES_PROJECT}"
        BRANCH="$${CF_PAGES_PRODUCTION_BRANCH:-main}"
        PROJECTS_JSON="$$(wrangler pages project list --json)"
        if ! printf '%s' "$$PROJECTS_JSON" | node -e 'const fs=require("fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(0,"utf8"));if(!Array.isArray(d))process.exit(2);process.exit(d.some(x=>(x["Project Name"]??x.name)===p)?0:1)' "$$PROJECT"; then
          status=$$?
          [ "$$status" -eq 1 ] || exit "$$status"
          wrangler pages project create "$$PROJECT" --production-branch="$$BRANCH" --force
        fi
        wrangler pages deploy /app/dist \
          --project-name="$$PROJECT" \
          --branch="$$BRANCH" \
          --commit-dirty=true \
          --force
```

```bash
# deploy.sh — disable pseudo-TTY in CI; requires human approval or GO gate (QA-GIT-GATE-01)
docker compose -f docker-compose.deploy.yml run --rm -T --no-deps -u "$(id -u):$(id -g)" deploy
```

> **Remote Mutation Gate (`QA-GIT-GATE-01`):** Just like `git push` or `npm publish`, executing `deploy.sh` mutates external production infrastructure and requires explicit human operator authorization or a `GO` release gate (`evaluate_release_gate`).

### 5.2. Multi-Format Favicon Packaging, PWA Manifest, and Duplicate-Free Edge Headers (`UI-11X-03`)

Every SPA frontend or public SSG site must avoid `.webp` shortcuts in platform icons and explicitly detach inherited `/*` headers on Cloudflare Pages and Nginx:

1. **HTML (`index.html`) and Multi-Resolution Icons:** Never point `rel="apple-touch-icon"` to `.webp` or `.svg` (Safari/iOS silently ignores them); generate PNGs from the master SVG under **Rule Zero** (`mcr.microsoft.com/playwright` with `deviceScaleFactor: 1`) and package `public/favicon.ico` (`sizes="48x48"` containing `16x16`/`32x32`/`48x48` frames for legacy browsers and Google Search `>= 48px`), `favicon.svg`, RGBA `48x48`/`32x32` PNGs, and opaque RGB `180x180` PNG (no alpha channel, 80% safe zone) for Apple Touch Icon:
   ```html
   <link rel="icon" href="/favicon.ico" sizes="48x48" />
   <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
   <link rel="icon" type="image/png" sizes="48x48" href="/favicons/favicon-48x48.png" />
   <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
   <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
   ```
2. **PWA Manifest (`site.webmanifest`):** Declare `icon-192.png` (`192x192`) and `icon-512.png` (`512x512`) in opaque `image/png` format (80% safe zone), separating `"purpose": "any"` and `"purpose": "maskable"` into distinct objects (avoiding combined `"any maskable"`).
3. **Cloudflare Edge (`public/_headers` and `_routes.json`) and Nginx:** On Cloudflare Pages, any sub-route overriding a header defined under `/*` (`Cache-Control`, `X-Robots-Tag`, `Cross-Origin-Resource-Policy`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`) MUST detach it first with `! Header-Name` to prevent duplicate header concatenation. Enable `Cross-Origin-Resource-Policy: cross-origin` on `/favicon.ico`, `/favicons/*`, `/brand/*`, and `/og/*` (keeping `X-Robots-Tag: noindex, nofollow` on private SPA consoles and reserving `index, follow` strictly for public SSG sites). In `nginx/default.conf`, mirror `"same-origin"` on `server`/`/index.html` and `"cross-origin"` on `location ~* \.(?:ico|svg|png|webmanifest)$`. In `_routes.json`, exclude the exact `"/favicon.ico"` route whenever `include` contains `"/*"` and avoid invalid suffix wildcards (`/*.ico`, `/*.png`):
   ```text
   /favicon.ico
     ! Cache-Control
     ! Cross-Origin-Resource-Policy
     Cache-Control: public, max-age=604800
     Cross-Origin-Resource-Policy: cross-origin
   ```

### 5.3. Expansion Differences Between `Makefile`/Compose and GitHub Actions (`QA-CI-ESCAPE-01`) and `$(CURDIR)` in Sub-Makefiles (`QA-MAKE-CURDIR-01`)

During audits of real pipelines under **Rule Zero**, two frequent failures surfaced when porting `docker run` commands between `Makefile`, `docker-compose.yml`, and `.github/workflows/*.yml`:

1. **Forbidden `$$(...)` or `$${...}` inside GitHub Actions `run:` blocks (`QA-CI-ESCAPE-01`):** Inside GNU Make recipes (or `docker-compose.yml` `command:` fields), `$$(pwd)`, `$$(id -u)`, or `$${VAR}` is written to escape `$` before passing to the shell. By contrast, GitHub Actions hands `run:` blocks directly to `bash`: writing `$$(pwd)` expands `$$` to the **numeric process PID** (e.g., `2970(pwd)`), breaking Docker `-v` mounts with `exit code 125`. Always use single-dollar substitution `$(pwd)` / `$(id -u):$(id -g)` / `${VAR}` in workflows and composite actions (use `# qa-ci-escape-ok` only when the step literally generates a `Makefile` or `docker-compose.yml`).
   ```yaml
   # ❌ ANTI-PATTERN (bash expands $$ to the process PID -> "create 2970(pwd)" exit code 125)
   - run: docker run --rm -u "$$(id -u):$$(id -g)" -v "$$(pwd):/workspace:ro" aquasec/trivy:0.76.2 config .

   # ✔️ 11X PATTERN (direct single-dollar bash substitution)
   - run: docker run --rm -u "$(id -u):$(id -g)" -v "$(pwd):/workspace:ro" aquasec/trivy:0.76.2 config .
   ```
2. **Mandatory use of `$(CURDIR)` in sub-Makefiles (`QA-MAKE-CURDIR-01`):** When a root `Makefile` delegates via `$(MAKE) -C backend <target>`, GNU Make changes into the subdirectory and updates `$(CURDIR)`, but leaves `$(PWD)` / `${PWD}` pointing to the caller's parent directory. In `*/Makefile` and `*/Makefile.example`, always use `$(CURDIR)` (e.g., `HOST_PWD ?= $(CURDIR)`, exemptible via `# qa-make-curdir-ok`) to preserve exact volume boundaries in ephemeral containers.
   ```makefile
   # ❌ ANTI-PATTERN (inherits root Makefile PWD and mounts parent directory)
   HOST_PWD ?= $(PWD)

   # ✔️ 11X PATTERN (resolves the actual directory of the sub-Makefile invoked via make -C)
   HOST_PWD ?= $(CURDIR)
   ```

---

## 6. Non-Destructive Error Handling in Frontend

A classic mistake in reactive state stores (Pinia, Vuex, Redux) is aggressively wiping valid data upon a transient network blip:
```typescript
// ❌ ANTI-PATTERN: Wipes previously valid data on a network hiccup
try {
  const data = await api.getInventory();
  items.value = data;
} catch (error) {
  items.value = []; // The user abruptly sees a blank screen
}

// ✔️ 11X PATTERN: Preserves last known valid state and surfaces an indicator
try {
  const data = await api.getInventory();
  items.value = data;
  isStale.value = false;
} catch (error) {
  isStale.value = true;
  lastErrorMessage.value = 'Connection failure. Showing locally cached data.';
}
```
Preserving prior state ensures operational continuity in monitoring centers and high-density data environments.

---

## 7. Toolchain Alignment: Node 26, pnpm 12, ESLint 9, and Karate 1.5.1 (Vue 3 / React / SSG)

When certifying frontend and Node.js projects inside the official `sinfallas/base-node-ionic:26` (`Node v26.13+`, `pnpm 12.18+`) and `sinfallas/karatelabs:1.5.1` images, nine environment contracts must be honored to avoid false pipeline failures and maintain Zero-Trust security (`SEC-09`):

1. **`pnpm-workspace.yaml` with `allowBuilds` boolean map (`SEC-09`):**
   - In `pnpm@12+`, the legacy `package.json#pnpm.onlyBuiltDependencies` key is ignored with a warning and native binaries (`esbuild`, `playwright`, `@playwright/test`) abort with `ERR_PNPM_IGNORED_BUILDS`.
   - Omit `"pnpm"` from `package.json`, keep `.npmrc` with `ignore-scripts=true`, and declare strict exceptions in `pnpm-workspace.yaml` using a **boolean map (`Record<string, boolean>`)** (never a YAML `- pkg` list, which triggers `ERR_PNPM_INVALID_SETTING`):
     ```yaml
     allowBuilds:
       esbuild: true
       playwright: true
       '@playwright/test': true
       vue-demi: false
     ```
2. **TypeScript & Vite Compatibility in Vue 3 (`vue-tsc ^2.2.12`, Vite 6):**
   - Pin `"vue-tsc": "^2.2.12"` alongside `typescript ^5.7.2` and Vite `6` in Vue 3 projects to avoid type-resolution errors from outdated `1.x`/`2.2.8` versions.
3. **ESLint 9 Flat Config (`eslint.config.mjs`) + Type-Aware Security & SonarJS (and Legacy `SEC-09` Note):**
   - Standardize on **ESLint 9 Flat Config (`eslint.config.mjs`)** combining `eslint-plugin-security@^3.0.0` (`security.configs.recommended`), `eslint-plugin-sonarjs@^3.0.7` (`sonarjs.configs.recommended`), and `typescript-eslint@^8.x` type-aware checks (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises` via `projectService` / `tsconfig.typecheck.json`), ignoring `["dist/", "dist-ssr/", "coverage/", "playwright-report/", "lhci-reports/", "target/", "graphify-out/"]`. For legacy consumer repositories still on ESLint `8.57.x` `.eslintrc.json`, `SEC-09` in `audit_security_stig_owasp` requires extending `"plugin:security/recommended-legacy"` (since v3 `recommended` exports Flat Config) and preserving `"ignorePatterns"`.
4. **In-Memory `localStorage` Polyfill for Vitest + `jsdom` on Node v26:**
   - Node v26 exposes an experimental `globalThis.localStorage` descriptor that without `--localstorage-file` lacks the `.clear()` method inside `jsdom` sessions. Register an in-memory `Storage` inside `vitest.setup.ts` (wired via `test.setupFiles` in `vitest.config.ts`) whenever `typeof globalThis.localStorage?.clear !== 'function'`.
5. **Real Boundary of `sinfallas/karatelabs:1.5.1` (HTTP/OSHP/SSG/XML) vs Playwright (`ui-e2e`):**
   - The `sinfallas/karatelabs:1.5.1` / `:latest` images do not include Chrome/Chromium binaries. Delegate all real DOM interaction, `[ 🔄 Refrescar ]` button checks, Anti-JSDOM geometry, and WCAG 2.1 AA to Playwright (`ui-e2e`), and focus `test/ui_business_flow.feature` on HTTP contracts against `http://ui-prod:8080`: `200` status codes, SPA/SSG routes, OWASP OSHP headers aligned with `nginx/default.conf` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`), and safe string reading of XML/SEO (`* string xmlText = response` on `/sitemap.xml` to avoid namespace parser failures).
6. **Non-Root `ui-e2e` Hardening and Exact Playwright Parity (`QA-PLAYWRIGHT-PIN-01`):**
   - Run the `ui-e2e` service (`mcr.microsoft.com/playwright:v1.52.0-noble`) under the user's UID/GID (`-u "$(QA_UID):$(QA_GID)" -e HOME=/tmp`), enable Corepack without global write privileges into `/tmp/.corepack-bin` (`COREPACK_HOME=/tmp/.corepack`), prefer local `./node_modules/.bin/playwright` and `./node_modules/.bin/lhci` binaries before falling back to `pnpm`/`corepack`, and pin an exact version (`"1.52.0"`, no `^` or `~`) synchronized between `package.json` and the Docker tag (`QA-PLAYWRIGHT-PIN-01`).
7. **SSR/SSG Hydration Parity Under Dual Color Scheme (`QA-SSR-HYDRATION-01`):**
   - In SSR/SSG apps (`nuxt`, `vitepress`, `astro`, `next`, `@sveltejs/kit`, `vite-ssg`, `createSSRApp`/`hydrateRoot`) with a light/dark theme toggle, avoid branching the initial DOM (`v-if` or conditional JSX/TSX expressions outside `useEffect`) on `localStorage.theme` or `dataset.theme` mutated before hydration; render both branches via CSS (`display: none` / `hidden dark:block`) and synchronize reactive state in `onMounted` / `useEffect`.
   - Add an isolated Playwright test for the opposite `colorScheme` (`'light'` and `'dark'` via `newContext`/`emulateMedia` or dedicated projects) with `console` and `pageerror` listeners failing on any `/hydration/i` warning (exemptible strictly via `# qa-ssr-hydration-ok`).
8. **Bounded Non-Root Mutation & Flamegraph Profiling Gates (`QA-STRYKER-CFG-01`, `mutmut_gates.py`, `qa-profile`):**
   - Configure JS/TS Stryker blueprints with `"ignoreStatic": true`, `"concurrency" <= 4`, and `!src/**/*.{unit,spec,test}.*` exclusions in `mutate`, wiring the non-root `/tmp/qa-bin/ps` shim inside `qa-mutation` containers so worker process enumeration succeeds cleanly (`QA-STRYKER-CFG-01`).
   - Enforce deterministic Python mutation gates via `mutmut_gates.py` (`>= 80%` killed ratio), DAST Automation Framework configs (`zap.yaml` / `/tmp/zap-report.html` on `:ro` mounts), and `qa-profile` (`py-spy` opt-in sidecar).
9. **Multi-Tenant WebSocket & PubSub Isolation + Pool Cleanup (`SEC-WS-PUBSUB-01`):**
   - Isolate Redis/KeyDB WebSocket PubSub subscriptions by authenticated tenant (`ws:{tenant_id}:events`), reject unvalidated global/wildcard channels, decouple the socket disconnect watcher (`ws.receive()`), and guarantee `await pubsub.aclose()` inside `try/finally:` (`SEC-WS-PUBSUB-01`).

---

## 8. PHP 8.4/8.5 Compatibility (`PCOV` & `php.ini`), `vendor/` Exclusion in Trivy IaC, and Rule Zero Fallback Without `make`

To eliminate operational friction in PHP 8.4/8.5 applications (Symfony/PSR-4 and Laravel), infrastructure audits after `composer install`, and environments lacking GNU `make`:

1. **Session Directives and `PCOV` Precedence in PHP 8.4/8.5 (`php/php.ini.example`, `php/composer.json.example`):**
   - **Removal of `session.sid_length` and `session.sid_bits_per_character`:** Both directives were deprecated in PHP 8.4/8.5 in favor of the native 32-byte CSPRNG; replace them with `session.cache_expire = 15` alongside `session.use_strict_mode = 1`, `session.cookie_httponly = 1`, `session.cookie_secure = 1`, and `session.cookie_samesite = Strict`.
   - **Explicit `pcov.directory` Parameterization and `conf.d` Ordering:** The `sinfallas/basephpcomposer` image loads `conf.d/docker-php-ext-pcov.ini` in lexicographical order. Explicitly pass `-d pcov.enabled=1 -d pcov.directory=src` (`-d pcov.directory=app` in Laravel) inside `composer.json` `qa:unit` / `qa:mutation` scripts (aligned with `<directory suffix=".php">src</directory>` in `phpunit.xml.example` and `pcov.directory = src` in `php.ini.example`) and mount custom `.ini` files at `/usr/local/etc/php/conf.d/zz-qa11x.ini:ro`.
2. **Uniform Exclusion of `vendor` and `.venv` in Trivy IaC/FS, MCP, and AST (`scripts/auditar-infra.sh`, `.trivy.yaml`):**
   - Pass `--skip-dirs node_modules,.git,dist,target,graphify-out,vendor,.venv` to both `trivy config` and `trivy fs`, mirror `vendor`/`.venv`/`target`/`graphify-out` in `.trivy.yaml` `scan.skip-dirs`, and ignore `vendor` in `security-auditor.ts`, `inspect-project.ts`, and `verify_topological_health.py` to avoid false positives on Composer dependencies after `composer install`, while keeping CVE scanning intact on root `composer.lock` and `uv.lock`.
3. **Rule Zero Fallback Without GNU `make` in `run_ephemeral_qa` (`mcp-server/src/tools/ephemeral-runner.ts`):**
   - When `make` fails with `ENOENT` (or `Makefile` is absent while `docker-compose.qa.yml` exists), the MCP server recursively resolves `$(MAKE) -C <subdir> <target>` delegations (depth `<= 3`, strict containment inside the project, and `--project-directory` injection), rejects recipes with unquoted shell operators (`&&`, `||`, `;`, `|`, `>`, `<`) or unexpanded subshells (`$(...)` such as `$$(id -u)`) to fall back cleanly to direct mapping on `docker-compose.qa.yml`, deducts remaining `timeoutSeconds` budget per step, and runs `docker compose down -v --remove-orphans` after `up -d` commands using exclusively `shell: false`.

---

## 9. Dual Post-Deploy Audit (Lab + CrUX) with Google PageSpeed Insights v5 (`make audit-psi` / `make qa-psi`)

Complements Lighthouse CI (`@lhci/cli` pre-merge against local containers) by measuring real performance (CrUX field *Core Web Vitals* + cloud Lighthouse score) against public HTTPS domains post-deployment:
- **Standard Execution:** `make audit-psi URL=https://your-domain.com [STRATEGY=both|mobile|desktop] [MIN_PERF=0.90]` (aliased as `make qa-psi` in `vue3`/`react-frontend` projects), backed by `scripts/auditar-pagespeed.sh` and `.agents/scripts/audit_pagespeed_insights.py` inside `sinfallas/base-python-uv:3.15`.
- **Security and Resilience Controls:** Strict Anti-SSRF blocking (Pattern 4: public `https://` only, no embedded credentials, pre-DNS resolution rejecting loopback/RFC1918/RFC6598/link-local/`.internal`), clean exit (`exit 0`, `SKIPPED`) when optional `URL` is omitted or on HTTP `429` quota limit without `PAGESPEED_API_KEY`, and automatic API-key redaction (`[REDACTED]`, `SEC-10`).

---

## 10. JIT Tactical Design Patterns (`[DIRECTIVE-11X]`) and Anti-Helper-Splitting Linter Locks

To eliminate gratuitous complexity refactoring without polluting normal prompt context:
- **Zero-Cost Pass & JIT Complexity Guidance (`.agents/skills/tactical-patterns-11x/SKILL.md`):** On lint/complexity failures (`Radon CC > 5`, `Ruff C901`, `ESLint complexity > 5`, `SonarJS > 15`, `max-params`, `PLR0913`), `ephemeral-runner.ts` and `Makefile` inject a bounded `[DIRECTIVE-11X]` hint pointing to `blueprint://skills/tactical-patterns-11x` (`<= 2.5 KB`), emitting `0` extra bytes when gates pass.
- **Anti-Helper-Splitting Structural Locks:** Splitting one complex method into helper spaghetti with 6–8 positional arguments is blocked deterministically across stacks via ESLint `max-params: ["error", 4]` + `max-depth: ["error", 3]` (`mcp-server`, `node-backend`, `vue3`, `react-frontend`) and Ruff `C901` (`max-complexity = 5`) + `PLR0911` + `PLR0913` (`max-args = 4`) in `python/` and `fastapi/`, favoring cohesive Parameter Objects, Strategy dispatch tables, Port & Adapter external boundaries (`--network none`), and Transactional Outbox writes.
- **Unified Atomic Flight Recorder (`checkpoint_ctl.py` / `session_flight_recorder`):** Step tracking writes atomically (`0600`) to `.agents/.cache/session_checkpoint.json` (with `SEC-10` secret redaction) and projects `.agents/ACTIVE_TASK.md` (`<= 40` lines) deterministically alongside live Git status rather than manual Markdown edits.

---

## 11. SDD/EARS Traceability, Pre-Code `Analyze`, `Delta Specs`, and Declarative Boundaries

To eliminate ambiguity between specifications, modular boundaries, and Karate BDD suites (`qa-11x-architect/references/10-sdd-ears-traceability.md`):
- **EARS `REQ-NNN` -> Karate BDD:** Author behavioral requirements using the 5 EARS clauses (`Ubiquitous`, `Event-driven`, `State-driven`, `Optional`, and mandatory `Unwanted: IF...THEN` failure/timeout/idempotency contracts) and trace `1:N` to Karate `.feature` scenarios and `sync_enterprise_tms`.
- **Pre-Code `Analyze` Gate & Brownfield `Delta Specs`:** On `FULL_11X` tasks, verify `MUST REQ -> Task -> Test` completeness, numeric thresholds, canonical glossary, `Decimal`/UTC/index alignment, and acyclic DAGs prior to implementation; express brownfield shifts as `ADDED / MODIFIED / REMOVED` deltas, retire removed `REQ-NNN` IDs permanently, and fold deltas into the baseline spec in the same closure commit.
- **Modular Monolith & `.agents/boundaries.json` (`independence`):** Enforce declarative `layers`, `independence` (horizontal bounded-context isolation with `shared` allowlists), and `forbidden` dependency contracts in `verify_topological_health.py` (with fail-closed `0`-node guards and Martin Instability `--metrics`: $I = C_e / (C_a + C_e)$).
