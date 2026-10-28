# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Mandatory Directive: Ground-Truth Fixtures & Negative Invariants Governance

> **CORE GOVERNANCE DIRECTIVE — ZERO MOCK BLINDNESS:**
> Applies to all AI agents and developers creating or testing integrations with external APIs, hardware, or databases.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. The Mock Blindness Anti-Pattern

Synthetic unit test mocks created ad-hoc invariably introduce **Mock Blindness**:
- The test writer models only the happy path based on idealized assumptions.
- Factory-default states, inert configurations, missing optional fields, or third-party downstream errors return unexpected payloads in real life (e.g. `remote="0.0.0.0"`, empty lists `[]`, or HTTP 404/400).
- Synthetically passing tests give false confidence while the real frontend or client reports false positives or crashes in production.

---

## 2. Universal Trimodal Ground-Truth Fixture Matrix

For **EVERY** component, service, or integration interacting with external systems or APIs, the test suite MUST include and validate against the following three raw JSON fixtures:

| Fixture Type | Description | Mandatory Assertion (Negative Invariant) |
| :--- | :--- | :--- |
| **Fixture A: Virgin / Factory Default** | Raw payload from unconfigured out-of-the-box state. | **MUST assert negative:** `active=False`, `status="NOT_CONFIGURED"`, `items=[]`. Any positive detection is a critical test failure. |
| **Fixture B: Nominal Configured** | Raw payload from correctly provisioned service. | **MUST assert positive:** `active=True`, `status="ONLINE"`, expected operational telemetry. |
| **Fixture C: Degraded / Unsupported** | Raw payload with disabled services or unsupported features. | **MUST assert graceful handling:** No unhandled exceptions (`500`), explicit state `UNSUPPORTED` or `DISABLED`, zero memory leaks. |

---

## 3. Negative Invariant Enforcement

1. **Assert What Should NOT Happen:**
   - Tests must assert that unconfigured systems do NOT trigger positive status flags, alerts, or active background sync loops.
2. **Fail-Closed Rule:**
   - If a virgin/unconfigured fixture returns a false positive for any configured service, the test suite aborts with exit code 1.
