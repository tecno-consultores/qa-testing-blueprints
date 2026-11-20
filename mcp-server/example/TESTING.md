<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](TESTING.es.md)

# 11X Quality Assurance Strategy — Full-Stack Example Project

## Certified Test Pyramid
- **Backend Unit Layer (`FastAPI`):** `backend/tests/test_devices.unit.py` (`>= 95%` coverage on `models/`, `services/`, `api/`, and `main.py` via `TestClient`, validating `Idempotency-Key` replay/409, RBAC 403, tenant consistency, OSHP headers, and 3-phase maintenance lifecycle; stdlib `unittest` + `trace.Trace` fallback in Node-only E2E clean-room runs).
- **Frontend Unit Layer (`Vue 3`):** `frontend/src/views/DevicesDashboard.unit.ts` and `frontend/src/api/devicesClient.unit.ts` covering auto-refresh intervals, error handling without unhandled rejections, and shared `CreateDeviceResponseDto` parity (`0` orphan UI components).
- **BDD Contracts (`Karate Labs`):** `backend/test/api_test.feature` and `frontend/test/ui_business_flow.feature` validating HTTP endpoints, OSHP headers, dynamic `Idempotency-Key`, and `cpu_load_pct`/`audit_actor` propagation.
- **E2E Accessibility & Geometry (`Playwright`):** `frontend/e2e/devices.e2e.ts` blueprint enforcing WCAG 2.1 AA (`@axe-core/playwright`), non-fixed bounding-box alignment of `footer.in-flow-footer` (`margin-top: auto`), and zero horizontal overflow.
