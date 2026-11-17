<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](TESTING.es.md)

# 11X Quality Assurance Strategy — Full-Stack Example Project

## Certified Test Pyramid
- **Backend Unit Layer (`FastAPI`):** `backend/tests/test_devices.unit.py` (`>= 95%` coverage in ephemeral Docker with `COVERAGE_FILE=/tmp/.coverage`).
- **Frontend Unit Layer (`Vue 3`):** `frontend/src/views/DevicesDashboard.unit.ts` (`0` orphan UI components).
- **BDD Contracts (`Karate Labs`):** `backend/test/api_test.feature` and `frontend/test/ui_business_flow.feature` with dynamic `Idempotency-Key`.
- **E2E Accessibility & Geometry (`Playwright`):** `frontend/e2e/devices.e2e.ts` validating WCAG 2.1 AA and in-flow footer (`margin-top: auto`).
