# Estrategia de Aseguramiento de Calidad 11X — Proyecto Ejemplo Full-Stack

## Pirámide de Pruebas Certificada
- **Capa Unitaria Backend (`FastAPI`):** `backend/tests/test_devices.unit.py` (`>= 95%` cobertura en Docker efímero con `COVERAGE_FILE=/tmp/.coverage`).
- **Capa Unitaria Frontend (`Vue 3`):** `frontend/src/views/DevicesDashboard.unit.ts` (`0` componentes UI huérfanos).
- **Contratos BDD (`Karate Labs`):** `backend/test/api_test.feature` y `frontend/test/ui_business_flow.feature` con `Idempotency-Key` dinámico.
- **Accesibilidad y Geometría E2E (`Playwright`):** `frontend/e2e/devices.e2e.ts` validando WCAG 2.1 AA y footer en flujo (`margin-top: auto`).
