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
