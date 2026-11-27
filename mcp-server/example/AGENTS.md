# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Fleet Telemetry — Domain-Specific Governance

<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 Thin-Client QA 11X Connector (`@sinfallas/mcp-qa-11x`)

- **Project:** `example` (stacks: `fastapi, vue3`). Inherit global QA 11X rules and skills from `@sinfallas/mcp-qa-11x` (`qa-11x-architect`); never duplicate canonical rules locally.
- **Rule Zero & AST-First:** Execute tests/linters inside non-root ephemeral Docker (`make qa-ci` / `run_ephemeral_qa`); inspect AST blast radius before editing; stop at local `git commit` (`QA-GIT-GATE-01`).
<!-- QA_11X_MCP_CONNECTOR_END -->

## Local Business Rules
- Every IoT device persisted in `telemetry_devices` belongs strictly to an isolated `tenant_id` enforced via PostgreSQL `FORCE ROW LEVEL SECURITY`.
- Telemetry operational dashboards maintain periodic auto-refresh cleaned up in `onUnmounted` plus an explicit manual refresh action.
