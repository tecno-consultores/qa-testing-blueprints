# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Mandatory Directive: Ground-Truth Fixtures & Negative Invariants Governance

> **CORE GOVERNANCE DIRECTIVE — ZERO MOCK BLINDNESS:**
> Applies to all AI agents and developers creating or testing integrations with external APIs, hardware, or databases.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. The Mock Blindness & Silo Temporal Blindness Anti-Patterns

Synthetic unit test mocks created ad-hoc invariably introduce **Mock Blindness**, **Silo Mock Blindness**, and **2-State Static Blindness**:
- The test writer models only the happy path based on idealized assumptions.
- Factory-default states, inert configurations, missing optional fields, or third-party downstream errors return unexpected payloads in real life (e.g. `remote="0.0.0.0"`, empty lists `[]`, or HTTP 404/400).
- **Silo Mock Blindness:** Module A tests assert `HTTP 200/201` on a mutation (`POST /api/v1/maintenance/windows`), while Consumer Module B tests inject a manual mock with `admin_state: "MAINTENANCE"`. In production, `GET /api/v1/inventory/routers` never joins `maintenance_windows`, so devices never appear in maintenance despite 100% green unit tests.
- **2-State Static Blindness:** A scheduled window view coded as `{{ w.is_cancelled ? 'Cancelada' : 'Programada' }}` achieves 100% branch coverage with 2 unit tests (`is_cancelled: true` and `false`), completely omitting the active intermediate state **`En Curso`** when `starts_at <= now <= ends_at`, or failing to detect a 60s Safe Mode scheduler prematurely cleared at 50ms within the same HTTP request.
- **Instant-Mock Timeout & Batch `200 OK` Blindness:** `AsyncMock` resolves in `0 ms`, masking short default HTTP telemetry timeouts (`10s`) that abort real synchronous firmware/package downloads (e.g. ~21 MB `.npk` files) and leave `0-byte` truncated files on disk, while unit mocks returning only nominal `HTTP 200 OK` hide batch endpoints (`POST .../execute`) that return `HTTP 200 OK` envelopes containing per-item failures (`results[].status == "FAILED"` or `"ERROR: bad HTTP response"`).
- **`MockDbSession` `JSONB` & `Numeric(p, s)` Type Blindness:** Populating ORM `Numeric(p, s)` attributes with Python `float` literals in test fixtures while storing unserialized dicts in `MockDbSession.add()` masks `TypeError: Object of type Decimal is not JSON serializable` in `JSONB` columns (e.g. `AuditLog.before_state` / `after_state`). Test fixtures MUST populate `Numeric(p, s)` columns with `decimal.Decimal` instances (matching PostgreSQL `asyncpg` hydration), and `MockDbSession` MUST validate all `JSON`/`JSONB` columns through `json.dumps()` without `default=str`.

---

## 2. Universal Trimodal Ground-Truth Fixture Matrix & 3-Phase Temporal Lifecycle

For **EVERY** component, service, or integration interacting with external systems or APIs, the test suite MUST include and validate against the three raw JSON spatial/health fixtures, AND for any time-bounded entity (`starts_at`/`ends_at`, countdowns, TTLs, leases), across all **3 Temporal Lifecycle Phases**:

| Fixture / Phase Type | Description | Mandatory Assertion (Negative & Temporal Invariants) |
| :--- | :--- | :--- |
| **Fixture A: Virgin / Factory Default** | Raw payload from unconfigured out-of-the-box state. | **MUST assert negative:** `active=False`, `status="NOT_CONFIGURED"`, `items=[]`. Any positive detection is a critical test failure. |
| **Fixture B: Nominal Configured** | Raw payload from correctly provisioned service. | **MUST assert positive:** `active=True`, `status="ONLINE"`, expected operational telemetry. |
| **Fixture C: Degraded / Unsupported / Partial Batch Failure** | Raw payload with disabled services, unsupported features, truncated `0-byte` transfers, or `HTTP 200 OK` batch responses with failed items (`results[].status == "FAILED"`). | **MUST assert graceful handling:** No unhandled exceptions (`500`), explicit state `UNSUPPORTED` / `DISABLED` / per-item `FAILED` surfaced in UI (zero false-positive global success), `timeout >= 180s` override + `0-byte` artifact purge on synchronous heavy transfers, zero memory leaks. |
| **Temporal Phase 1 (`t < starts_at`)** | Window or timer scheduled in the future. | **MUST assert Scheduled / Pending (`Programada`):** Consumer modules still report nominal state until `starts_at`. |
| **Temporal Phase 2 (`starts_at <= t <= ends_at`)** | Active window or countdown in progress. | **MUST assert Active / In-Progress (`En Curso` / `Activa`):** Background scheduler stays alive beyond the HTTP request and Consumer Modules B reflect the active state without intermediate mocks. |
| **Temporal Phase 3 (`t > ends_at` or Cancelled)** | Window expired, purged, or cancelled. | **MUST assert Expired / Reverted (`Cancelada` / `Expirada`):** Automatic restoration to original nominal state and audit log recorded. |

---

## 3. Negative Invariant Enforcement

1. **Assert What Should NOT Happen:**
   - Tests must assert that unconfigured systems do NOT trigger positive status flags, alerts, or active background sync loops.
2. **Fail-Closed Rule:**
   - If a virgin/unconfigured fixture returns a false positive for any configured service, the test suite aborts with exit code 1.
