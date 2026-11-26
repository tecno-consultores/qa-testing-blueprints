<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](SECURITY.md) · **Español (Espejo 1:1)**

# Política de Seguridad — Proyecto de Ejemplo Full-Stack

## Versiones Soportadas
Este ejemplo de referencia sigue la versión activa de `@sinfallas/mcp-qa-11x` bajo el estándar `QA-11X` (tier `standard`).

## Línea Base de Seguridad
- **Regla Cero (Rule Zero):** Todas las pruebas, linters y escáneres se ejecutan en contenedores Docker efímeros sin root (`--rm --restart=no --network none`).
- **Controles Estáticos y Dinámicos:** Cero hallazgos `CRITICAL`/`HIGH` en controles DISA ASD STIG V6R5 / OWASP v4.2 (`SEC-01..SEC-16`, `UI-11X-01..03`, `QA-DOCKER-LOOP-01`), cabeceras OSHP estrictas, RBAC en capa de servicio y aislamiento multi-tenant.
- **Higiene de Secretos:** Cero credenciales en texto plano, claves privadas ni archivos `.env` sin ignorar en el repositorio.

## Reporte de Vulnerabilidades
Reporta vulnerabilidades de forma privada a los mantenedores del proyecto sin abrir issues públicos con material de explotación.
