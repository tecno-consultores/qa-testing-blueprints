# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Mandatory Directive: Ground-Truth Fixtures & Negative Invariants

> **SCOPE:** Eliminates Mock Blindness, Silo Mock Blindness, 2-State Temporal Blindness, and Instant-Mock Timeout/Batch Blindness.

## 1. Blindness Anti-Patterns Prohibited

- **Mock Blindness:** Happy-path synthetic mocks mask factory defaults (`remote="0.0.0.0"`, `[]`, `400/404`).
- **Silo Mock Blindness:** Testing Module A mutations (`POST`/`PUT`/`PATCH`/`DELETE`) solely via `HTTP 200/201` while mocking Consumer Module B's read state hides broken joins/projections. Suites MUST query Consumer Module B `GET` endpoints and stores live without intermediate mocks.
- **2-State Temporal Blindness:** Testing only `scheduled` vs `cancelled` omits the live active state (`starts_at <= now <= ends_at`) and premature timer/scheduler cleanup.
- **Instant-Mock Timeout & Batch `200 OK` Blindness:** `0 ms` mocks hide `5s–10s` HTTP timeouts aborting heavy synchronous transfers (`>= 20 MB` archives leaving `0-byte` files) and `HTTP 200 OK` batch responses carrying failed items (`results[].status == "FAILED"`). Heavy-transfer clients MUST enforce per-request `timeout >= 180s` and purge `0-byte` files (verified via `call_args`); batch callers MUST inspect per-item `results[].status`.
- **`MockDbSession` Type Blindness:** Populate `Numeric(p, s)` ORM fields with `decimal.Decimal` (never `float`) and validate `JSON`/`JSONB` columns via `json.dumps()` without `default=str`.

## 2. Trimodal Fixture Matrix & 3-Phase Temporal Lifecycle

| Fixture / Phase | Condition | Mandatory Assertion (Fail-Closed) |
| :--- | :--- | :--- |
| **Fixture A: Virgin** | Unconfigured / factory default raw payload. | **Negative invariant:** `active=False`, `status="NOT_CONFIGURED"`, `items=[]`. Any false positive fails with exit `1`. |
| **Fixture B: Nominal** | Provisioned service raw payload. | **Positive invariant:** `active=True`, `status="ONLINE"`, expected telemetry. |
| **Fixture C: Degraded / Partial Batch** | Disabled service, unsupported feature, truncated `0-byte` download, or `HTTP 200 OK` with `results[].status == "FAILED"`. | Graceful degradation (`UNSUPPORTED`/`DISABLED`/per-item `FAILED`, zero unhandled `500`), `timeout >= 180s` + `0-byte` purge, zero leaks. |
| **Phase 1 (`t < starts_at`)** | Future window/timer. | `Programada` / Pending; consumers keep nominal state. |
| **Phase 2 (`starts_at <= t <= ends_at`)** | Active window/countdown. | `En Curso` / Active; scheduler stays alive and Consumer Modules B reflect active state live. |
| **Phase 3 (`t > ends_at` or Cancelled)** | Expired/reverted/cancelled. | `Cancelada` / `Expirada`; nominal state restored and audit log written. |
