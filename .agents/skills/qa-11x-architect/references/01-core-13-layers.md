# 🏛️ Core 13 Quality Layers, Anti-Mock Blindness & Anti-JSDOM Geometry

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides the foundational execution matrix for the 13 layers of the 11X Quality Pyramid, along with the operational rules for Anti-Mock Blindness, Anti-JSDOM visual geometry, and Universal Trimodal Fixtures.

---

## 1. Master Execution Matrix: The 13 QA Layers

| Layer | Domain / Objective | Canonical Tools | Mandatory Gate / Threshold | Docker Command |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **Static Analysis, Formatting & SAST** | `ruff`, `bandit`, `eslint` (`--max-warnings 0`), `eslint-plugin-security`, `shellcheck`, `shfmt`, `php-cs-fixer`, `psalm --taint-analysis` | **0 errors, 0 warnings (enforced via `--max-warnings 0`), 0 HIGH/MEDIUM vulnerabilities** | `make qa-lint` |
| **02** | **Strict Typing & Complexity** | `mypy --strict`, `vue-tsc --noEmit`, `radon cc`, `sonarjs`, `phpstan` (`level: max` + `cognitive-complexity`) | **0 type errors, Grade A (`CC <= 5`), Cognitive Complexity `<= 15` (PHP `<= 9`)** | `make qa-lint` |
| **03** | **Isolated Unit Tests with Network Mocks** | `pytest-cov`, `vitest` (`@vitest/coverage-v8`), `kcov` (BATS), `pest` / `phpunit` (`pcov`) | **`>= 95.0%` coverage (lines, branches, statements), 100% offline isolation (zero network leaks)** | `make qa-unit` |
| **04** | **Database Schema Parity & Migrations** | `alembic`, `verify_alembic_orm_parity.py`, `doctrine:schema:validate`, ephemeral PostgreSQL 17 | **0 schema drifts, Alembic revision ID `<= 32` chars** | `make qa-parity` |
| **05** | **Front-Back Integration Contracts & Cross-Module State Propagation** | Real ephemeral API + KeyDB + PostgreSQL, Schemathesis, Read-After-Write E2E | **0 payload/schema mismatches, Read-After-Write propagation from Module A (`POST/PUT/PATCH`) to Consumer Module B (`GET`) with 0 intermediate mocks** | `make qa-contracts` |
| **06** | **Black-Box REST API BDD** | `sinfallas/karatelabs:latest` (Gherkin HTTP) | **100% scenarios PASSED** in `api_test.feature` (incl. cross-module & audit payload checks) | `make qa-bdd` |
| **07** | **UI Acceptance BDD & Dual Refresh** | `sinfallas/karatelabs:latest` (Chrome Headless) | **100% scenarios PASSED** in `ui_business_flow.feature` + Dual Auto/Manual Refresh (`[ 🔄 Refrescar ]`) | `make qa-bdd` |
| **08** | **Mutation Testing (Test of Tests)** | `mutmut` (Python), `stryker` (JS/TS), `infection` (PHP) | **Mutation score `> 80%`, 0 surviving critical mutants** | `make qa-mutation` |
| **09** | **Web Accessibility & Visual Geometry** | `@axe-core/playwright`, `lhci autorun`, Anti-JSDOM checks | **0 WCAG 2.1 AA violations, Lighthouse A11y `>= 0.95`** | `make qa-e2e` / `make qa-perf` |
| **10** | **Concurrency & Stress / Load** | `locust` (headless), `artillery` | **0% error rate, P95 latency `< 200 ms` under target load** | `make qa-chaos` / `make qa-stress` |
| **11** | **Dynamic Security DAST & OSHP Headers** | `zaproxy/zap-stable` (OWASP ZAP Baseline), OSHP validator | **0 HIGH alerts, OWASP OSHP headers enforced, Fail-Secure verified** | `make qa-dast` |
| **12** | **Chaos Engineering & Resilience** | `gaiaadm/pumba:latest` (`netem` jitter/delay/loss) + Prometheus | **Zero unhandled panics, graceful retry, RED metrics active** | `make qa-chaos` |
| **13** | **Trimodal Fixtures, 3-Phase Temporal Lifecycle & Negative Invariants**| Ground-truth payloads (Virgin, Nominal, Degraded) + 3-Phase Clock (`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`) | **Zero mock blindness, 100% negative invariants & all 3 temporal lifecycle states verified** | `make qa-unit` / `make qa-bdd` |

---

## 2. Anti-Mock Blindness & Anti-Silo Cross-Module Propagation Invariant

### The Vulnerability of Pure Mocking & Silo Mock Blindness
Unit tests with 100% mock databases or isolated module boundary mocks frequently pass in CI while production deployments catastrophically fail due to:
- Column type mismatches (e.g. UUID vs. string representations) or forgotten foreign key constraints.
- Alembic migrations missing `op.create_table` or having Revision IDs exceeding the 32-character limit.
- **Silo Mock Blindness:** Module A tests assert `HTTP 200/201` on a mutating endpoint (`POST /api/v1/maintenance/windows`), while Consumer Module B tests (e.g. NOC Wallboard / Inventory) inject a hand-crafted mock JSON with `admin_state: "MAINTENANCE"`. In production, `GET /api/v1/inventory/routers` never joins `maintenance_windows`, so devices never reflect maintenance state despite 100% passing unit tests.
- **Blind Audit Mocks:** Replacing `write_audit_log` with an uninspected `AsyncMock()` hides bugs where `actor_username=claims.get("sub")` passes raw user UUIDs (`5046a660-b1ba-423d-bf0b-a6f0fd80c40b`) instead of human-readable usernames, or omits `resource_display_name`.

### Operational Directives
1. **Never mock database queries for schema and persistence tests:** Test against an ephemeral container of the exact production engine (`postgres:17-alpine`).
2. **Mandatory Alembic Model Parity Check:** Run `.agents/scripts/verify_alembic_orm_parity.py` on every task modifying `src/models/` or migrations.
3. **Strict 32-Character Alembic Revision ID:** Ensure Alembic revision slugs do not exceed 32 characters to prevent silent truncation in `alembic_version`.
4. **Cross-Module Read-After-Write Propagation (Zero Intermediate Mocks):** Whenever a test mutates operational state in Module A, it MUST immediately query the `GET` endpoints and stores of Consumer Modules B against the live test database without intermediate mocks, asserting that KPI counters, badges, and effective states update end-to-end.
5. **Audit Payload & Anti-Raw UUID Assertion:** Never use a blind `AsyncMock` on `write_audit_log` without asserting its arguments (`assert_called_once`). Assert that `actor_username` and `resource_display_name` resolve to readable strings and never match `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
6. **Heavy-Transfer Timeout Separation (`>= 180s` + Zero-Byte Purge) & Batch `HTTP 200 OK` Per-Item Validation:** Instant unit test mocks (`AsyncMock` / `vi.fn()`) mask short telemetry HTTP timeouts (`5s–10s`) that abort real synchronous firmware/package/archive downloads (e.g. ~21 MB `.npk` files) leaving `0-byte` truncated files, as well as `HTTP 200 OK` batch responses carrying per-item failures (`results[].status == "FAILED"` or `"ERROR: bad HTTP response"`). Tests MUST assert that heavy transfers pass an explicit timeout override (`timeout >= 180s`) and purge `0-byte` artifacts, and that batch consumers inspect `results[].status` per target item instead of assuming success from `HTTP 200 OK`.
7. **Unmocked Orchestrator Boot & Container Healthcheck Contract (`QA-HEALTH-01`):** Any background worker runner, scheduler, or service entrypoint monitored by a `Dockerfile` / `docker-compose.yml` `healthcheck` MUST include an integration-style unit test booting the real entrypoint under default production `Settings()` (with opt-in workers disabled by default) without mocking optional worker loops, explicitly asserting that the physical healthcheck artifact (`heartbeat_file.exists()`, readiness key, or `/healthz` `200 OK`) is emitted across multiple event-loop ticks while supervisors inspect `task.exception() is not None` vs expected `OPTIONAL_WORKERS` clean exits.
8. **Dual CLI + MCP `stdio` Interactive `TTY` Anti-Hang Contract (`QA-CLI-TTY-01`):** Any package or binary combining CLI subcommands (`process.argv` / `sys.argv`) with an MCP `stdio` transport (`StdioServerTransport` / `stdio_server()`) MUST inspect `process.stdin.isTTY` (Node/TS) or `sys.stdin.isatty()` (Python) when invoked without subcommands: in an interactive `TTY` (unless `--stdio` / `QA_FORCE_STDIO=1` is passed), it MUST run any safe auto-sync/help output and exit cleanly (`0`) instead of hanging on `stdin` waiting for JSON-RPC frames, certified by an E2E subprocess test with simulated `TTY` and bounded timeout (`<= 5s`).
9. **Mandatory Existing Test & Contract Co-Evolution (`QA-TEST-SYNC-01`):** Modifying code, schemas, CLI flags, skills, or `manifest.json` requires tracing, updating, and re-running all impacted pre-existing unit, integration, BATS, and Karate `.feature` tests/counts in ephemeral Docker without weakening valid regression assertions.

```python
# fastapi/tests/core/test_db_parity.unit.py
import pytest
from sqlalchemy import text

@pytest.mark.asyncio
async def test_all_models_have_tables_in_real_postgres(db_session):
    result = await db_session.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    )
    existing_tables = {row[0] for row in result.fetchall()}
    assert "users" in existing_tables
    assert "audit_records" in existing_tables
    assert "idempotency_keys" in existing_tables
```

---

## 3. Anti-JSDOM Visual Geometry, In-Flow Ergonomics & Dual Refresh

### The JSDOM Blind Spot
JSDOM does not calculate CSS layouts, viewports, or bounding boxes. Every element's `getBoundingClientRect()` returns `0, 0, 0, 0`. Consequently, JSDOM tests cannot detect:
- Fixed footers or sticky banners overlapping action buttons or data tables.
- Modals covered by floating z-index elements.
- Horizontal overflow causing viewport breaking on mobile screens (`375px`).

### In-Flow Ergonomics & Dual Auto + Manual Refresh Rules
- **Prohibited:** `position: fixed; bottom: 0; left: 0; width: 100%;` floating footers that stay permanently over application content.
- **Mandatory In-Flow Footer:** Place as the last child of a flex column layout:
  ```html
  <div class="flex flex-col min-h-screen bg-slate-900 text-slate-100">
    <header class="h-14 border-b border-slate-800 ...">Header</header>
    <main class="flex-1 p-6">Content</main>
    <footer class="mt-auto border-t border-slate-800 py-3 text-xs text-slate-400">
      Status Bar / Copyright
    </footer>
  </div>
  ```
- **Mandatory Dual Refresh in Operational Views & Live Maps:** Every monitoring console, NOC dashboard, or real-time map MUST combine reactive auto-refresh (`setInterval` cleaned up in `onUnmounted` + WebSocket events) with an explicit **`[ 🔄 Refrescar ]`** button triggering immediate live reload (`?refresh=true`) without requiring `F5`.
- **Prohibition of Catch-All Domain `else` Badges:** UI event mappers MUST explicitly classify each category (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) and never use a generic `else return 'MAINTENANCE'` that mislabels backups or session renewals.
- **Real Browser Verification:** Run Karate Labs UI or Playwright in real headless Chromium to assert bounding box coordinates and verify that no element obscures interactive components.

---

## 4. Universal Trimodal Fixtures, 3-Phase Temporal Lifecycle & Negative Invariants

Integrations with third-party APIs, hardware controllers, or microservices MUST be validated against three distinct spatial/health fixtures AND, when time windows or TTLs exist, across all **3 phases of the clock**:

```
┌────────────────────────────────────────────────────────────────────────┐
│              TRIMODAL & 3-PHASE TEMPORAL TAXONOMY                      │
├─────────────────────────┬─────────────────────────┬────────────────────┤
│ 1. Virgin / Default     │ 2. Nominal Configured   │ 3. Degraded / Fail │
│ ─────────────────────── │ ─────────────────────── │ ────────────────── │
│ Raw unconfigured device │ Active healthy service  │ Corrupt payload    │
│ Blank state, 0 metrics  │ Valid JSON data         │ Network timeouts   │
│ Assert: NEGATIVE        │ Assert: ACTIVE          │ Assert: GRACEFUL   │
│ INVARIANTS (No false    │ FUNCTIONALITY           │ FALLBACK (No 500)  │
│ positive active alarms) │ (200 OK, full telemetry)│ Circuit breaker ON │
├─────────────────────────┼─────────────────────────┼────────────────────┤
│ Temporal Phase 1        │ Temporal Phase 2        │ Temporal Phase 3   │
│ t < starts_at           │ starts_at <= t <= ends  │ t > ends_at / Canc │
│ Assert: SCHEDULED       │ Assert: IN_PROGRESS     │ Assert: EXPIRED /  │
│ ('Programada' /         │ ('En Curso' / 'Activa', │ REVERTED (Nominal  │
│  Pending state)         │  scheduler stays alive) │  state restored)   │
└─────────────────────────┴─────────────────────────┴────────────────────┘
```

### Implementing Trimodal Tests
```python
# test_network_controller.unit.py
import pytest
from src.services.controller import parse_device_state

def test_virgin_device_asserts_negative_invariants():
    """Fixture 1: Virgin device must NOT report active operational flags."""
    raw_payload = {"uptime": 0, "interfaces": [], "config_status": "unprovisioned"}
    state = parse_device_state(raw_payload)
    assert state.is_active is False
    assert state.active_interfaces_count == 0
    assert state.has_critical_alerts is False  # Negative invariant: must not falsely alarm

def test_nominal_device_asserts_operational_state():
    """Fixture 2: Nominal device must parse healthy metrics."""
    raw_payload = {"uptime": 86400, "interfaces": ["ether1", "ether2"], "config_status": "synced"}
    state = parse_device_state(raw_payload)
    assert state.is_active is True
    assert state.active_interfaces_count == 2

def test_degraded_device_graceful_fallback():
    """Fixture 3: Degraded device must degrade gracefully without uncaught exceptions."""
    raw_payload = {"uptime": -1, "error": "FIRMWARE_UNSUPPORTED"}
    state = parse_device_state(raw_payload)
    assert state.is_active is False
    assert state.status == "DEGRADED"
    assert state.error_code == "FIRMWARE_UNSUPPORTED"
```

---

## 4. Active Task Logbook & Planning Tool Protocol (`.agents/ACTIVE_TASK.md`)

### The Resilience Rationale
In long-running autonomous workflows across complex codebases, AI assistants and IDEs face three critical failure modes:
1. **IDE / Process Crashes:** Unscheduled termination of terminal or agent session.
2. **Context Compaction:** Rolling LLM context windows truncate earlier instructions, rationale, and completed sub-step evidence.
3. **Session Interruption:** Network dropouts or host reboots.

### The Canonical Workflow
```text
┌────────────────────────────────────────────────────────────────────────┐
│              PLANNING TOOL & ACTIVE_TASK DUAL PROTOCOL                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. INITIATION: User issues non-trivial task or Roadmap milestone       │
│    └── Agent triggers planning tool (/plan or interactive artifact).   │
│                                                                        │
│ 2. PERSISTENCE: Blueprint .agents/ACTIVE_TASK.md from template.        │
│    └── Populate Metadata, Goal, Specification, and Phase Checklists.   │
│                                                                        │
│ 3. LIVE EXECUTION: Real-time update in filesystem.                     │
│    └── Complete atomic subtask ──> Mark "- [ ]" to "- [x]" IMMEDIATELY.│
│    └── If crash occurs ──────────> Re-read .agents/ACTIVE_TASK.md.     │
│                                                                        │
│ 4. CLOSURE GATE: Mandatory verification before git push.               │
│    └── Run ./.agents/scripts/certify_task_completion.sh                │
│    └── Mark status: "COMPLETED (100%)"                                 │
│    └── Sync CHANGELOG.md, ROADMAP.md, TESTING.md                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Template Blueprint
Always initialize from `.agents/ACTIVE_TASK.md.example`. Ensure `.agents/ACTIVE_TASK.md` remains in `.gitignore` to avoid staging local volatile work-in-progress state into source control.
