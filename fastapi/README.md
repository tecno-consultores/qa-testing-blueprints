> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (README.es.md)](README.es.md)

# Testing and Validation Guide for APIs (FastAPI)

This document contains the non-negotiable Level-11X corporate instructions you MUST follow to generate, structure, and execute automated tests on APIs built with FastAPI. The goal is not only to prove that the code works, but to guarantee its resilience under extreme stress, audit its complexity, and certify its static and dynamic security.

## 1. Strict Execution Rules (Ephemeral Docker & Cache)
**NEVER** instruct local image builds (`docker build`) or manual `docker compose run` commands. Everything runs ephemerally and securely through the provided `Makefile`, leveraging persistent cache volumes:
*   For the API, logic tests, contracts, profiling, and stress: `sinfallas/base-python-uv:3.15` (available tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15`, and `latest`).
*   For black-box BDD tests: `sinfallas/karatelabs:1.5.1` (`:latest`).
*   For Dynamic Security (DAST): `zaproxy/zap-stable:latest`.
*   For Real Persistence & Schema Validation (Anti-Mock Blindness): `postgres:17-alpine`.
*   For High-Performance Caching & Sessions: `eqalpha/keydb:alpine`.
*   For Chaos Engineering & Observability: `gaiaadm/pumba:latest` and `prom/prometheus:latest`.
*   For AI Context Optimization (MCP): `sinfallas/remote-graphify:latest`.

**Mandatory:** Use clean execution targets (e.g., `make qa-unit`) to leverage the `uv-cache` configuration and avoid massively re-downloading dependencies.

## 2. Required Tech Stack
The FastAPI validation strategy spans 13 cross-cutting layers (Corporate Standard 11X). You must configure and integrate:

1.  **Quality and Strict Typing:** `ruff` and `mypy` (`strict = true`).
2.  **Static Security (SAST):** `pip-audit` (CVEs) and `bandit`.
3.  **Dynamic Security (DAST):** `OWASP ZAP` (`zaproxy/zap-stable`) in *Baseline* scan mode.
4.  **Technical Debt:** `radon` (Cyclomatic complexity <= B, maintainability grade A).
5.  **Profiling:** `py-spy` (CPU/RAM analysis via *Flamegraphs* without blocking the Event Loop).
6.  **Unit Logic & Interception:** `pytest`, `pytest-cov` (>95%), and `pytest-mock` (pure isolation of external I/O).
7.  **Real Schema Parity (Anti-Mock Blindness):** `Alembic` + ephemeral `PostgreSQL 17` audited with `.agents/scripts/verify_alembic_orm_parity.py`.
8.  **Multi-Threaded In-Memory Cache:** `KeyDB` (`server-threads 4`) for atomic operations, rate limiting, and sessions.
9.  **Fuzzing & Contracts:** `schemathesis` (OpenAPI standard-based attack).
10. **Behavior (BDD):** `Karate Labs` (Gherkin functional scenarios in `test/api_test.feature`).
11. **Mutation Testing:** `mutmut` (logical mutant injection to audit assertions).
12. **Chaos Engineering:** `Pumba` orchestrated with `Locust` (latency injection and auto-recovery).
13. **Observability:** `prometheus-fastapi-instrumentator` (real-time RED metrics).

## 3. Architecture of Tests to Generate

### A. Code Observability (Non-Negotiable Prerequisite)
*   Before running any audit, you MUST ensure the FastAPI root file (e.g., `src/main.py`) is instrumented by injecting these exact two lines to expose the `/metrics` route non-intrusively:

```python
    from prometheus_fastapi_instrumentator import Instrumentator
    # Inject after defining app = FastAPI():
    Instrumentator().instrument(app).expose(app)
```

### B. Internal Logic, Mocking & Anti-Mock Blindness Boundary
*   Use `httpx` and FastAPI's native `TestClient` to simulate requests without depending on an external network.
*   **Strict Boundary (Tool Boundary):** All unit test files MUST be named `.unit.py` or `.spec.py` to isolate their execution.
*   **Unit Isolation:** In `.unit.py` tests, use `pytest-mock` to isolate HTTP calls to third parties or external APIs.
*   **Anti-Mock Blindness (Mandatory in Persistence):** NEVER simulate the database with blind mocks to validate SQLAlchemy models or Alembic migrations. Integration tests (`.int.py` or repository flows) MUST be validated against the ephemeral `postgres:17` container. Every change in `src/models/` requires its corresponding `alembic revision --autogenerate` migration verified on real PostgreSQL.

### C. Complexity Analysis & Profiling (`radon` + `py-spy`)
*   **Complexity Rule:** No generated code block may have a cyclomatic complexity of grade `C` or higher. The Maintainability Index (MI) must be `A`.
*   **Profiling:** For heavy endpoints, profile the application under load using `py-spy` to generate a visual *Flamegraph* (`profile.svg`) showing any blocks in the asynchronous *Event Loop*.

### D. Behavior & Black-Box (`Karate Labs`)
*   Write `.feature` files in the `test/` folder (e.g., `test/api_test.feature`). The API will be treated as an opaque black box and attacked through its exposed HTTP port (8000).

### E. Contracts & Dynamic Security (`Schemathesis` + `OWASP ZAP`)
*   `schemathesis` will bombard `openapi.json` with thousands of malformed combinations looking to trigger unhandled HTTP 500 errors bypassed by Pydantic.
*   `OWASP ZAP` will run in *Baseline Scan* mode intercepting missing headers (CORS, HSTS, X-Frame-Options) without choking the pipeline.

### F. Extreme Resilience (Chaos Engineering with Pumba)
*   Traditional stress tests assume a perfect network. With the `--profile chaos` configuration, Pumba will inject random latency (Jitter) and temporary Linux Kernel-level dropouts directly onto the FastAPI container while Locust sends waves of concurrent users. The goal is to certify that the architecture does not enter a deadlock when underlying infrastructure fails.

### G. Smart Ingestion (Step 0 - MCP / AST CLI-First)
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. If you have shell access (Antigravity), inspect the AST and blast radius directly via CLI (`python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"`), without spinning up background daemons occupying port 8080. If you are an external agent (Hermes, Claude), connect to the `sinfallas/remote-graphify:latest` MCP server. Additionally, you MUST silently read linter rules and dependencies defined in `pyproject.toml` to align your code with repository rules and pass metrics on your first attempt.

### H. Mandatory Security by Design (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   When programming or auditing FastAPI endpoints, you MUST implement and cover with unit/BDD tests the **22 patterns in [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Sessions and Identity (`APSC-DV-000010, 000070, 000080, 000300, 000320, 000530` & `OWASP 4.3.7`):** Concurrent session limits in KeyDB, role-based *idle timeouts* (**10 min** admin / **15 min** operator), validated CSPRNG session ID rotation, account lockout after **3 failed attempts in 15 min** with constant-time Argon2id verification (`DUMMY_ARGON2_HASH`), 15-character/5-generation STIG password policy, and expiration of temporary (72h) and inactive (35d) accounts.
    *   **Validation, Canonicalization & Files (`APSC-DV-002390, 002485, 002510, 002520, 002960` & `OWASP 4.3.5, 4.3.6`):** `ConfigDict(extra="forbid")`, Unicode `NFKC` normalization before validation, absolute ban on `shell=True`/`pickle`/`yaml.load`, XML without DTD or external entities (`resolve_entities=False`, `no_network=True`), and file validation via *Magic Bytes* and allowlisted index maps.
    *   **Immutable Auditing, Fail-Secure, OSHP & API Top 10 (`APSC-DV-000450, 000650, 001090, 001350, 002310, 002590, 002770, 003310` & `OWASP 4.3.9, 4.3.10, 5.3.4, 5.4.4, 7.8`):** HMAC-SHA256 chained UTC logs free of CR/LF injection and with 0 secrets/tokens, alert at **75% audit storage capacity**, in-memory secret buffer zeroization, credential scrubbing on DB exports, **OWASP OSHP** headers, *Fail-Secure* startup with cryptographic self-test, anti-data-mining quotas, BOLA/BOPLA/BFLA mitigation, threat-model-as-code (`pytm`), and **CycloneDX SBOM/CBOM** generation.

## 4. Local Execution Commands for Developers (and AI)

Instead of building complex Docker commands, you **MUST** instruct the user (or execute autonomously if you have terminal access) using the standardized `Makefile`:

**Step 0: Context Ingestion & AST Graph (`CLI-First`)**
Extract/update the source code AST knowledge graph and query the blast radius before editing:
```bash
./scripts/actualizar-grafos-graphify.sh fastapi
python3 .agents/scripts/inspect_blast_radius.py "<simbolo_o_archivo>"
```

**Step 1: Start the API and Persistence Services**
```bash
docker compose -f docker-compose.qa.yml up -d postgres keydb api
```

**Step 2: Run Standard Validation Suites (Regular Pipeline)**

*   **SAST Audit, Linting, and Complexity:**
```bash
make qa-lint
```

*   **Isolated Unit Tests (Non-negotiable coverage >95%):**
```bash
make qa-unit
```

*   **Mutation Testing (Assertion Strength):**
```bash
make qa-mutation
```

*   **Fuzzing and Contracts:**
```bash
docker compose -f docker-compose.qa.yml run --rm qa-backend bash -c "uv sync && uv run schemathesis run http://api:8000/openapi.json"
```

*   **BDD Behavior (Karate):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```

*   **Dynamic Security DAST (OWASP ZAP):**
```bash
docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:8000 -r zap-report.html
```

*   **Cumulative Profiling (Flamegraph):**
```bash
docker compose -f docker-compose.qa.yml exec -T api bash -c "py-spy record -o /app/profile.svg --pid 1 --duration 30"
```

**Step 3: Level-11X Certification (Chaos Engineering & Observability)**
This command activates the hidden profile. It launches Pumba, Locust, and Prometheus simultaneously to stress the API while simulating severe network degradation.
```bash
docker compose -f docker-compose.qa.yml --profile chaos up --abort-on-container-exit stress_test
```
*(During the attack, monitor metrics at `http://localhost:9090` or inspect `chaos-report.html` to verify the request survival rate).*
