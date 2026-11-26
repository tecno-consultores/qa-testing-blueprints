<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](SECURITY.es.md)

# Security Policy — Full-Stack Example Project

## Supported Versions
This reference example tracks the active `@sinfallas/mcp-qa-11x` release under Standard `QA-11X` (`standard` tier).

## Security Baseline
- **Rule Zero:** All tests, linters, and scanners execute inside non-root ephemeral Docker containers (`--rm --restart=no --network none`).
- **Static & Dynamic Controls:** Zero `CRITICAL`/`HIGH` findings across DISA ASD STIG V6R5 / OWASP v4.2 controls (`SEC-01..SEC-16`, `UI-11X-01..03`, `QA-DOCKER-LOOP-01`), strict OSHP response headers, service-layer RBAC, and tenant isolation.
- **Secret Hygiene:** Zero plain-text credentials, private keys, or unignored `.env` files committed to the repository.

## Reporting a Vulnerability
Report vulnerabilities privately to the project maintainers without opening public issues containing exploit material.
