<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](TESTING.md) · **Español (Espejo 1:1)**

# Estrategia de Aseguramiento de Calidad 11X — Proyecto Ejemplo Full-Stack

## Pirámide de Pruebas Certificada
- **Capa Unitaria Backend (`FastAPI`):** `backend/tests/test_devices.unit.py` (dominio/servicios y ciclo temporal en 3 fases, ejecutada también por el fallback stdlib `unittest` + `trace.Trace` en corridas Clean-Room sobre Node con 0 omisiones) y `backend/tests/test_devices_api.unit.py` (`>= 95%` cobertura en `models/`, `services/`, `api/` y `main.py` vía `TestClient` real de FastAPI dentro de `sinfallas/base-python-uv:3.15`, validando replay/409 de `Idempotency-Key`, RBAC 403, consistencia de inquilino y cabeceras OSHP con 0 pruebas omitidas; `--offline` / `QA_OFFLINE=1` falla cerrado salvo que `fastapi`/`httpx` estén preinstalados o cacheados en `QA_UV_CACHE_DIR` / `UV_CACHE_DIR`).
- **Capa Unitaria Frontend (`Vue 3`):** `frontend/src/views/DevicesDashboard.unit.ts` y `frontend/src/api/devicesClient.unit.ts` cubriendo recarga periódica, captura de errores sin rechazos no manejados y paridad DTO `CreateDeviceResponseDto` (`0` componentes UI huérfanos).
- **Contratos BDD (`Karate Labs`):** `backend/test/api_test.feature` y `frontend/test/ui_business_flow.feature` validando endpoints HTTP, cabeceras OSHP, `Idempotency-Key` dinámico y propagación de `cpu_load_pct`/`audit_actor`.
- **Accesibilidad y Geometría E2E (`Playwright`):** plantilla `frontend/e2e/devices.e2e.ts` exigiendo WCAG 2.1 AA (`@axe-core/playwright`), bounding-box en flujo de `footer.in-flow-footer` (`margin-top: auto`) y cero desbordamiento horizontal.
