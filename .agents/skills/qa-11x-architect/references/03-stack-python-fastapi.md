# 🐍 Python & FastAPI Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides the technical directives, configuration blueprints, and ephemeral Docker commands for Python Standalone projects and asynchronous APIs built with FastAPI.

---

## 1. Core Architecture & Ephemeral Container Topology

Validation and execution MUST occur inside ephemeral Docker containers without local host pollution (`Rule Zero`) using `sinfallas/base-python-uv` (available tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15`, and `latest`):

| Service / Container Role | Docker Image | Port / Socket | Purpose |
| :--- | :--- | :--- | :--- |
| **API / Test Runner** | `sinfallas/base-python-uv:3.15` | Internal / Ephemeral | Pytest, Ruff, Mypy, Bandit, Radon, Py-spy |
| **Relational Database** | `postgres:17-alpine` | `5432:5432` | Real PostgreSQL schema parity & Alembic migrations |
| **In-Memory Store & Cache** | `eqalpha/keydb:alpine` | `6379:6379` | Multi-threaded KeyDB (`server-threads 4`) |
| **Black-Box REST BDD** | `sinfallas/karatelabs:latest` | Target: `http://api:8000` | Automated Gherkin HTTP test suite (`test/api_test.feature`) |
| **Dynamic Security (DAST)** | `zaproxy/zap-stable:latest` | Target: `http://api:8000` | OWASP ZAP Baseline vulnerability scan |
| **Chaos Injection** | `gaiaadm/pumba:latest` | Docker Socket | Network latency (Jitter), packet drop & netem faults |
| **RED Observability** | `prom/prometheus:latest` | `9090:9090` | Real-time monitoring of `/metrics` |

---

## 2. Innegotiable Code Directives

### A. Non-Intrusive Prometheus Instrumentation
Every FastAPI application MUST expose `/metrics` to enable RED observability prior to load/chaos suites:
```python
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI()
Instrumentator().instrument(app).expose(app)
```

### B. Unit Test File Naming & Isolation
- All unit test files MUST match `tests/**/*.unit.py` or `tests/**/*.spec.py`.
- External network requests MUST be mocked with `pytest-mock` or `respx`.
- Minimum coverage threshold: **`>= 95.0%`** for lines and branches:
  ```ini
  [tool.coverage.report]
  fail_under = 95
  show_missing = true
  exclude_lines = [
      "pragma: no cover",
      "raise NotImplementedError",
      "if __name__ == .__main__.:",
  ]
  ```

- **Strict Pre-Push Type Checking (`mypy --strict --cache-dir=/tmp/mypy`, `QA-MYPY-01`):**
  - Whenever `pyproject.toml` defines `[tool.mypy]`, `qa-lint` and CI pipelines MUST chain `uv run mypy --strict --cache-dir=/tmp/mypy src/` alongside `ruff check` and `ruff format --check` prior to `pytest` (never substitute `make qa-lint` with standalone `ruff` commands). Passing `--cache-dir=/tmp/mypy` avoids non-root permission errors on host-mounted `/app/.mypy_cache`.
- **Non-Root Ephemeral Container Coverage, `importlib` Collection & `PYTHONPATH=/app/src` (`QA-COV-01`):**
  - Never pass `-o addopts=""` to `pytest` in `Makefile` or CI scripts without explicitly appending `--import-mode=importlib --cov=src --cov-fail-under=95` and injecting `-e PYTHONPATH=/app/src` (since `-o addopts=""` wipes `pyproject.toml` flags and triggers `ModuleNotFoundError` / `ImportPathMismatchError` on double-extension `*.unit.py` and `*.int.py` files).
  - Always pass `-e COVERAGE_FILE=/tmp/.coverage` in `docker compose run` / `docker run` commands so hardened non-root container users (`UID 1001`) can write SQLite coverage files without host bind-mount permission errors (`sqlite3.DataError: Couldn't use data file '/app/.coverage'`).
- **PostgreSQL RLS Multi-Transaction Persistence (`after_begin`) & Deterministic WORM Audit (`seq_num`):**
  - Connect using a `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` role; store `(tenant_id, is_superadmin)` in `session.sync_session.info` and register `@event.listens_for(AsyncSession.sync_session_class, "after_begin")` to re-apply `SET LOCAL app.current_tenant_id` across post-commit transactions; use `SECURITY DEFINER` (`SET search_path = public`) SQL functions for pre-auth slug/bootstrap queries.
  - Order hash-chained `audit_logs` by a monotonic `seq_num BIGINT` with `SELECT pg_advisory_xact_lock(hashtext(tenant_key))`, track `_in_tx_audit_hash` / `_rg_in_tx_audit_hash` on the session, and `await session.flush()` after each `write_audit_log()` call.

- **In-Process Smoke Tests & Local Production Pipelines (`build.sh` / `probar-prod-local.sh`):**
  - **Post-Import `Settings` Singleton Synchronization (`QA-SMOKE-01`):** When a `--no-dev` smoke test (`test_production_boot_smoke.py`) recursively imports all submodules of `src/` before calling `create_app()`, `src.core.config.settings` is already instantiated in memory with the initial environment (`local`/`development`). Mutating `os.environ["APP_ENV"] = "production"` (or `ROSGRID_ENV`) alone will NOT disable `/docs`, `/redoc`, or `/openapi.json`. Always mutate both `os.environ` AND the singleton attribute (`settings.APP_ENV = "production"` / `settings.ROSGRID_ENV = "production"`), restoring the original values in a `finally` block:
    ```python
    prev_env = os.environ.get("APP_ENV")
    prev_attr = getattr(settings, "APP_ENV", None)
    try:
        os.environ["APP_ENV"] = "production"
        settings.APP_ENV = "production"
        app = create_app()
        assert app.docs_url is None and app.redoc_url is None and app.openapi_url is None
    finally:
        if prev_env is None:
            os.environ.pop("APP_ENV", None)
        else:
            os.environ["APP_ENV"] = prev_env
        if prev_attr is not None:
            settings.APP_ENV = prev_attr
    ```
  - **Ephemeral Secret Provisioning & `docker exec -e` Password Propagation (`SEC-15`):** When `Settings` enforces fail-fast rejection of default QA secrets in `production`, local production verification scripts (`probar-prod-local.sh`) MUST export ephemeral keys (`openssl rand -base64 32` / `openssl rand -hex 32`) prior to `docker compose up -d` and explicitly pass `-e <PASS_ENV_VAR>="${LOCAL_ADMIN_PASS}"` in the `docker exec` command that runs Front-Back E2E contract checks.

### C. Database Parity, Anti-Mock Blindness & Cross-Module State Propagation
- NEVER mock SQLAlchemy sessions or Alembic migrations when testing persistence layers.
- Run migrations against real PostgreSQL 17 in `docker-compose.qa.yml`.
- Verify ORM parity using `.agents/scripts/verify_alembic_orm_parity.py`.
- Alembic revision IDs must be `<= 32` characters to avoid DB column truncation.
- **Anti-Silo Read-After-Write Propagation:** Never test a state-mutating endpoint (`POST /api/v1/maintenance/windows`, device state change, Safe Mode activation) in isolation while mocking the consumer endpoint. Immediately query the consumer `GET` endpoints (`GET /api/v1/inventory/routers`, dashboard KPIs) against the live database without intermediate mocks to verify end-to-end state propagation.
- **3-Phase Temporal Lifecycle, Heavy-Transfer Timeouts & Audit Payload Assertions:**
  - Entities with `starts_at`/`ends_at` or TTLs must be tested across all 3 clock phases (`t < starts_at` Scheduled, `starts_at <= t <= ends_at` Active/In-Progress, and `t > ends_at` Expired/Reverted).
  - Never replace `write_audit_log` with an uninspected `AsyncMock()`. Assert the passed arguments and verify that `actor_username` and `resource_display_name` resolve to human-readable strings (never raw JWT `sub` UUID v4 strings).
  - **`MockDbSession` `JSONB` Validation & `Numeric(p, s)` `Decimal` Fixtures:** In unit tests using mock sessions (`MockDbSession`), validate all SQLAlchemy `JSON`/`JSONB` columns (such as `AuditLog.before_state` and `AuditLog.after_state`) by executing `json.dumps()` **without `default=str`**, and populate ORM `Numeric(p, s)` attributes in fixtures with `decimal.Decimal` instances (identical to PostgreSQL `asyncpg` hydration) to prevent `TypeError: Object of type Decimal is not JSON serializable` from escaping to production.
  - **Telemetry vs. Heavy-Transfer Timeout Override (`>= 180s`):** HTTP clients performing synchronous binary/firmware/backup downloads (e.g. `.npk` images) MUST allow and pass a per-request timeout override (`timeout >= 180s`), purge truncated `0-byte` files before/after failed transfers, and assert `call_args` in unit tests so `AsyncMock` does not hide `10s` timeout truncations.
  - **Batch `HTTP 200 OK` Per-Item Inspection:** Batch execution endpoints (`POST .../execute`) and their tests MUST evaluate `results[].status` per resource rather than treating `HTTP 200 OK` as blanket success.
  - **Dynamic `Idempotency-Key` in Karate Labs BDD (`api_test.feature`):** All mutable requests (`POST`, `PUT`, `PATCH`, `DELETE`) in `api_test.feature` against endpoints enforcing `IdempotencyMiddleware` MUST include `And header Idempotency-Key = java.util.UUID.randomUUID() + ''` (unless explicitly testing `400` on missing header or storing `* def idemKey = java.util.UUID.randomUUID() + ''` within a scenario to test replay/`409`), preventing `400 Bad Request` or `409`/`422` collisions across repeated runs against live KeyDB/Redis.
  - **Service-Layer RBAC Defense (Anti-`Depends()` Bypass) & MCP Approval Gate:** In FastAPI, `Depends(require_roles(...))` only runs when invoked through the HTTP router. When service or controller functions can be called directly by internal JSON-RPC/MCP dispatchers, background workers, or WebSocket handlers, `Depends()` is bypassed. Always validate `claims["role"]` / `claims["rol"]` explicitly at the start of the service function, route mutating MCP tools through `ApprovalRequest` (`AWAITING_APPROVAL`), and include unit tests invoking the service/MCP dispatcher directly with an unprivileged role asserting `403` / `PermissionError`.

### D. Unmocked Orchestrator Boot, Supervisor Task-Exit Semantics & Container Healthcheck Contract (`QA-HEALTH-01`)
- **Root Cause Prevented:** Background worker containers (`python -m src.workers.runner`) pass `>= 95%` siloed unit coverage yet crash into Docker `unhealthy` when: (a) an opt-in feature-flagged worker (`SIEM_EXPORT_ENABLED=false`) cleanly returns `None` (`task.done() == True`, `task.exception() is None`), (b) the supervisor loop treats every `task.done() and not task.cancelled()` as a fatal crash, and (c) the orchestrator unit test mocks all sub-workers (`AsyncMock` + `sleep(0.01)` + `cancel()`) without asserting the physical `HEALTHCHECK` artifact (`/tmp/worker_heartbeat`).
- **Supervisor Task-Exit Classification:**
  1. `task.exception() is not None` -> **ALWAYS UNHEALTHY** (unhandled crash).
  2. Clean exit of a **mandatory** infinite-loop worker -> **ALWAYS UNHEALTHY**.
  3. Clean `return None` (`task.exception() is None`) of an explicitly declared `OPTIONAL_WORKERS` member disabled via `Settings` -> **HEALTHY**.
- **Reference Implementation & Contract Test:**
```python
from pathlib import Path
import asyncio

WORKER_HEARTBEAT_PATH = Path("/tmp/worker_heartbeat")
OPTIONAL_WORKERS: frozenset[str] = frozenset({"siem_exporter", "telemetry_archiver"})


def is_supervisor_healthy(tasks: dict[str, asyncio.Task[None]]) -> bool:
    for name, task in tasks.items():
        if task.cancelled():
            return False
        if task.done():
            if task.exception() is not None:
                return False
            if name not in OPTIONAL_WORKERS:
                return False
    return True
```
- Every service or runner whose `Dockerfile` / `docker-compose.yml` probes a heartbeat file or readiness endpoint MUST include at least one integration-style unit test booting the real orchestrator under default production `Settings()` **without mocking optional worker loops**, asserting `WORKER_HEARTBEAT_PATH.exists()` after multiple event-loop ticks (`audit_security_stig_owasp` enforces `QA-HEALTH-01`).

---

## 3. Configuration Blueprints

### `pyproject.toml` Highlights
```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "S", "PT"]
ignore = ["B008"]

[tool.mypy]
python_version = "3.12"
strict = true
disallow_untyped_defs = true
warn_unused_ignores = true

[tool.pytest.ini_options]
testpaths = ["tests", "test"]
python_files = ["*.unit.py", "*.spec.py", "test_*.py"]
asyncio_mode = "auto"
addopts = "--cov=src --cov-report=term-missing --cov-report=xml --cov-fail-under=95"
```

### `Makefile` Targets
```makefile
.PHONY: qa-lint qa-unit qa-parity qa-contracts qa-bdd qa-mutation qa-dast qa-chaos qa-all

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm api ruff check src/ tests/
	docker compose -f docker-compose.qa.yml run --rm api mypy src/
	docker compose -f docker-compose.qa.yml run --rm api bandit -r src/ -ll
	docker compose -f docker-compose.qa.yml run --rm api radon cc src/ -nb -s

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm api pytest tests/

qa-parity:
	docker compose -f docker-compose.qa.yml run --rm api alembic upgrade head
	python3 .agents/scripts/verify_alembic_orm_parity.py

qa-contracts:
	docker compose -f docker-compose.qa.yml run --rm api schemathesis run http://api:8000/openapi.json --checks all

qa-bdd:
	docker compose -f docker-compose.qa.yml run --rm karatelabs mvn test -Dkarate.options="test/api_test.feature"

qa-mutation:
	docker compose -f docker-compose.qa.yml run --rm api mutmut run

qa-dast:
	docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:8000 -r zap-report.html

qa-all: qa-lint qa-unit qa-parity qa-bdd
```

---

## 4. Black-Box BDD: Karate Labs (`test/api_test.feature`)

```gherkin
Feature: API Behavioral & Security Contracts

  Background:
    * url 'http://api:8000'
    * configure headers = { 'Content-Type': 'application/json' }

  Scenario: Health check endpoint responds healthy with metrics
    Given path '/health'
    When method get
    Then status 200
    And match response.status == 'healthy'

  Scenario: Unauthenticated request to protected endpoint yields 401
    Given path '/api/v1/users/me'
    When method get
    Then status 401

  Scenario: Incomplete payload returns 422 with sanitized detail in production
    Given path '/api/v1/auth/login'
    And request { username: "operator_only" }
    When method post
    Then status 422
```
