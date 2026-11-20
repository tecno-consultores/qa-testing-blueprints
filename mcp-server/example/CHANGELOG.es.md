<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](CHANGELOG.md) · **Español (Espejo 1:1)**

# Changelog

Todos los cambios notables del proyecto semilla se documentan en este archivo.

## [Unreleased]

### Añadido
* Paridad unitaria FastAPI `TestClient` (`>= 95%` en `api/devices.py` y `main.py`), caché/409 `Idempotency-Key`, DTO compartido `CreateDeviceResponseDto`, contratos HTTP Karate y aserciones de geometría del footer en Playwright.
* Telemetría multi-tenant `GET/POST /api/v1/devices` con `DevicesDashboard.vue` y paridad ORM/Alembic.

## [1.0.0] - 2026-11-12

### Añadido
* Versión base del proyecto híbrido `FastAPI + Vue 3` para validación E2E del servidor MCP `@sinfallas/mcp-qa-11x`.
