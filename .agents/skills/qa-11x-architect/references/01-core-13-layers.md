# 🏛️ Core 13 Quality Layers, Anti-Mock Blindness & Anti-JSDOM Geometry

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides the foundational execution matrix for the 13 layers of the 11X Quality Pyramid, along with the operational rules for Anti-Mock Blindness, Anti-JSDOM visual geometry, and Universal Trimodal Fixtures.

---

## 1. Master Execution Matrix: The 13 QA Layers

| Layer | Domain / Objective | Canonical Tools | Mandatory Gate / Threshold | Docker Command |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **Static Analysis, Formatting & SAST** | `ruff`, `bandit`, `eslint`, `eslint-plugin-security`, `shellcheck`, `shfmt` | **0 errors, 0 warnings, 0 HIGH/MEDIUM vulnerabilities** | `make qa-lint` |
| **02** | **Strict Typing & Complexity** | `mypy --strict`, `vue-tsc --noEmit`, `radon cc`, `sonarjs` | **0 type errors, Grade A (`CC <= 5`), Cognitive Complexity $\le 15$** | `make qa-lint` |
| **03** | **Isolated Unit Tests with Network Mocks** | `pytest-cov`, `vitest` (`@vitest/coverage-v8`), `kcov` (BATS) | **$\ge 95.0\%$ coverage (lines, branches, statements)** | `make qa-unit` |
| **04** | **Database Schema Parity & Migrations** | `alembic`, `verify_alembic_orm_parity.py`, ephemeral PostgreSQL 17 | **0 schema drifts, Alembic revision ID $\le 32$ chars** | `make qa-parity` |
| **05** | **Front-Back Integration Contracts** | Real ephemeral API + KeyDB + PostgreSQL, Schemathesis | **0 payload/schema mismatches, full HTTP response compliance** | `make qa-contracts` |
| **06** | **Black-Box REST API BDD** | `sinfallas/karatelabs:latest` (Gherkin HTTP) | **100% scenarios PASSED** in `api_test.feature` | `make qa-bdd` |
| **07** | **UI Acceptance BDD** | `sinfallas/karatelabs:latest` (Chrome Headless) | **100% scenarios PASSED** in `ui_business_flow.feature` | `make qa-bdd` |
| **08** | **Mutation Testing (Test of Tests)** | `mutmut` (Python), `stryker` (JS/TS) | **Mutation score $> 80\%$, 0 surviving critical mutants** | `make qa-mutation` |
| **09** | **Web Accessibility & Visual Geometry** | `@axe-core/playwright`, `lhci autorun`, Anti-JSDOM checks | **0 WCAG 2.1 AA violations, Lighthouse A11y $\ge 0.95$** | `make qa-e2e` / `make qa-perf` |
| **10** | **Concurrency & Stress / Load** | `locust` (headless), `artillery` | **0% error rate, P95 latency $< 200\text{ ms}$ under target load** | `make qa-chaos` / `make qa-stress` |
| **11** | **Dynamic Security DAST & OSHP Headers** | `zaproxy/zap-stable` (OWASP ZAP Baseline), OSHP validator | **0 HIGH alerts, OWASP OSHP headers enforced, Fail-Secure verified** | `make qa-dast` |
| **12** | **Chaos Engineering & Resilience** | `gaiaadm/pumba:latest` (`netem` jitter/delay/loss) + Prometheus | **Zero unhandled panics, graceful retry, RED metrics active** | `make qa-chaos` |
| **13** | **Trimodal Fixtures & Negative Invariants**| Ground-truth raw payloads (Virgin, Nominal, Degraded) | **Zero mock blindness, 100% negative invariants assert true** | `make qa-unit` / `make qa-bdd` |

---

## 2. Anti-Mock Blindness Invariant

### The Vulnerability of Pure Mocking
Unit tests with 100% mock databases frequently pass in CI while production deployments catastrophically fail due to:
- Column type mismatches (e.g. UUID vs. string representations).
- Forgotten foreign key constraints or nullability violations.
- Alembic migrations missing `op.create_table` or having syntax errors in Postgres.
- Revision IDs exceeding the Alembic database field limit (32 characters).

### Operational Directives
1. **Never mock database queries for schema and persistence tests:** Test against an ephemeral container of the exact production engine (`postgres:17-alpine`).
2. **Mandatory Alembic Model Parity Check:** Run `.agents/scripts/verify_alembic_orm_parity.py` on every task modifying `src/models/` or migrations.
3. **Strict 32-Character Alembic Revision ID:** Ensure Alembic revision slugs do not exceed 32 characters to prevent silent truncation in `alembic_version`.

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

## 3. Anti-JSDOM Visual Geometry & In-Flow Ergonomics

### The JSDOM Blind Spot
JSDOM does not calculate CSS layouts, viewports, or bounding boxes. Every element's `getBoundingClientRect()` returns `0, 0, 0, 0`. Consequently, JSDOM tests cannot detect:
- Fixed footers or sticky banners overlapping action buttons or data tables.
- Modals covered by floating z-index elements.
- Horizontal overflow causing viewport breaking on mobile screens (`375px`).

### In-Flow Ergonomics Rule
- **Prohibited:** `position: fixed; bottom: 0; left: 0; width: 100%;` floating footers that stay permanently over application content.
- **Mandatory:** In-flow footer placed as the last child of a flex column layout:
  ```html
  <div class="flex flex-col min-h-screen bg-slate-900 text-slate-100">
    <header class="h-14 border-b border-slate-800 ...">Header</header>
    <main class="flex-1 p-6">Content</main>
    <footer class="mt-auto border-t border-slate-800 py-3 text-xs text-slate-400">
      Status Bar / Copyright
    </footer>
  </div>
  ```
- **Real Browser Verification:** Run Karate Labs UI or Playwright in real headless Chromium to assert bounding box coordinates and verify that no element obscures interactive components.

---

## 4. Universal Trimodal Fixtures & Negative Invariants

Integrations with third-party APIs, hardware controllers, or microservices MUST be validated against three distinct fixtures:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TRIMODAL FIXTURE TAXONOMY                         │
├─────────────────────────┬─────────────────────────┬────────────────────┤
│ 1. Virgin / Default     │ 2. Nominal Configured   │ 3. Degraded / Fail │
│ ─────────────────────── │ ─────────────────────── │ ────────────────── │
│ Raw unconfigured device │ Active healthy service  │ Corrupt payload    │
│ Blank state, 0 metrics  │ Valid JSON data         │ Network timeouts   │
│ Assert: NEGATIVE        │ Assert: ACTIVE          │ Assert: GRACEFUL   │
│ INVARIANTS (No false    │ FUNCTIONALITY           │ FALLBACK (No 500)  │
│ positive active alarms) │ (200 OK, full telemetry)│ Circuit breaker ON │
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
