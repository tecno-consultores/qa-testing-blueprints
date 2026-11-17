> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# Testing and Validation Guide for Python Scripts (Standalone/Libraries)

This document contains the non-negotiable Level-11X corporate instructions you MUST follow when generating test code for pure Python tools (CLIs, automation scripts, or internal libraries).

## 1. Strict Execution Rules (Non-Root Ephemeral Containers & Cache)
**NEVER** instruct local image builds (`docker build`), global host installations, or running as `root`. Every execution runs in ephemeral containers with mapped UID/GID (`-u "$(id -u):$(id -g)"`), `HOME=/tmp`, `COVERAGE_FILE=/tmp/.coverage`, and `UV_CACHE_DIR=/tmp/uv-cache`:
*   For logic tests, Pact contracts, linting, strict typing, and profiling: `sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4` (available tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15`, and `latest`).
*   For declarative load tests (`smoke|load|stress`) and SLOs: `grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276`.
*   For Metrics Collection: `prom/prometheus:v2.55.1` (and Pushgateway if applicable).
*   For Graphify Semantic AST: `sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0` (via `./scripts/actualizar-grafos-graphify.sh`).

**Package Manager:** Dependency synchronization uses `uv` backed by `/tmp/uv-cache` and preinstalled libraries in the v2 image (`pact` 4.2.0, `ruff`, `mypy`, `pytest`, `pip-audit`).
**Mandatory:** Use clean `Makefile` targets (`make qa-lint`, `make qa-unit`, and from the catalog root `make test-backend-blueprints`) to preserve full isolation and zero `root`-owned files.

## 2. Required Tech Stack
When generating code, configuring the environment, or proposing solutions, you must ensure the implementation of these tools:

*   **Linting and Formatting:** `ruff` (`C901` with max complexity `<= 5` in critical tests and new modules).
*   **Strict Typing:** `mypy --strict --cache-dir=/tmp/mypy` (prevents runtime exceptions).
*   **Security and Auditing:** `pip-audit` (dependency CVEs) and `bandit` (SAST vulnerabilities in the codebase).
*   **Complexity Analysis (Technical Debt):** `radon` (Maintainability Index Grade A and cyclomatic complexity Grade `A`, `CC <= 5`).
*   **Profiling (Memory and CPU):** `py-spy` (bottleneck detection via *Flamegraphs*).
*   **Core Logic Tests and Interception:** `pytest` as the primary engine, mandatorily enhanced with `pytest-mock` and `unittest.mock` to isolate networking and external dependencies.
*   **Zero-Infra Consumer-Driven Contracts (`Pact` V3/V4):** Preinstalled `pact` package exporting deterministic artifacts into `PACT_OUTPUT_DIR` (without an external *Pact Broker*) over *Trimodal Fixtures* (`nominal_configured`, `virgin_empty`, `degraded_conflict`), exact monetary serialization using `Decimal` (`float` prohibited), mandatory UUIDv4 `Idempotency-Key` header, RFC 7807 errors (`application/problem+json`), and per-item inspection of batch responses (`results[].status`).
*   **BDD Behavior and SLO Load (`k6`):** `pytest-bdd` for local Gherkin and `python/tests/load/smoke.k6.js` (`K6_PROFILE=smoke|load|stress`) to validate `p(95) < 250ms`, `p(99) < 500ms`, and error `< 1%` without false greens.
*   **Coverage:** `pytest-cov` (minimum 95% required with `COVERAGE_FILE=/tmp/.coverage`).
*   **Mutation Testing:** `mutmut` (to verify whether tests fail when logic code changes).
*   **Compatibility Matrix and RLS:** `tox` with `tox-uv` and verification against `postgres:17-alpine` (`NOBYPASSRLS`, `FORCE RLS`, `SET LOCAL app.current_tenant_id`).
*   **Observability:** `prometheus_client`.

## 3. Architecture of Tests to Generate

When writing test code (`tests/`) or base logic (`src/`), you must strictly separate it into these areas:

### A. Code Observability (Non-Negotiable Prerequisite)
Depending on the script's nature, you must instrument it in one of these two ways:

1.  **If it is a Continuous Script (Daemon/Bot):** Inject a lightweight async server in `src/main.py` to expose metrics on port 8000.
    ```python
    from prometheus_client import start_http_server
    if __name__ == '__main__':
        start_http_server(8000) # Exposes metrics without blocking the script
        # ... rest of the logic ...
    ```

2.  **If it is an Ephemeral Script (Batch Task / Cron):** Prometheus will not have time to scrape it. Instead, use `push_to_gateway` to send collected metrics before the script exits.
    ```python
    import logging
    from urllib.error import URLError
    from prometheus_client import CollectorRegistry, push_to_gateway
    # ... collect your metrics in the registry ...
    if __name__ == '__main__':
        registry = CollectorRegistry()
        # ... script logic ...
        try:
            push_to_gateway('python_pushgateway:9091', job='batch_script', registry=registry)
        except (OSError, URLError) as exc:
            logging.warning("Pushgateway unavailable; metrics skipped: %s", exc)
    ```

### B. Unit Tests (Mocked / Isolated)
*   **Purpose:** Validate pure library logic without depending on network or credentials.
*   **Strict Boundary (Tool Boundary):** All unit test files MUST follow the `test_*.py` naming pattern and must NOT contain integration decorators.
*   **Rule:** Use `pytest-mock` (the `mocker` fixture) or `@patch` to intercept networking (e.g., `requests`). Simulate successful JSON responses and catastrophic failures. NO test of this kind may introduce real latency.

### C. Integration Tests (Real)
*   **Purpose:** Validate external contracts and communication with real services.
*   **Rule:** Use `python-dotenv` to load environment variables. Use the `@pytest.mark.integration` decorator. These tests DO require credentials.

### D. Behavior & Benchmarking (`pytest-bdd` & `pytest-benchmark`)
*   **BDD:** Use `.feature` files to describe library usage from the end-user perspective and bind them using `pytest-bdd`.
*   **Benchmarking:** Mark heavy math or data-processing functions with the `benchmark` fixture to ensure future refactorings do not degrade speed.

### E. Cyclomatic Complexity (`radon`)
*   **Rule:** No generated method may exceed cyclomatic complexity Grade `A` (`CC <= 5`) or drop below Grade `A` in Maintainability Index (MI). Apply `[DIRECTIVE-11X]` patterns from `.agents/skills/tactical-patterns-11x/SKILL.md` (table-driven dispatch, Parameter Object/DTO, guard clauses, or pipelines) rather than pass-through helpers.

### F. Smart Ingestion (Step 0 - AST Graphify)
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. Before modifying code, query the AST graph with `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` (or update it with `./scripts/actualizar-grafos-graphify.sh`). Additionally, you MUST read linter configurations and dependencies defined in `pyproject.toml` to adapt your code to strict repository conventions and avoid CI/CD rejections.

### G. Mandatory Security by Design (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   Every Python script or library MUST comply with and test the applicable controls from **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Canonicalization and Safe Execution (`APSC-DV-002510, 002520`):** Normalize text inputs with `unicodedata.normalize("NFKC", ...)` before validation and use `subprocess.run([...], shell=False)` with absolute paths and allowlists (`shell=True`, `os.system`, `eval`, `pickle.loads`, `yaml.load` prohibited).
    *   **XML/XXE and Files (`APSC-DV-002390, 002485, 002550`):** Disable DTDs and external entities in XML parsers (`resolve_entities=False`, `no_network=True`), validate files via *Magic Bytes*, and map paths using allowlisted index lookups.
    *   **FIPS 140-3 Cryptography, Memory Zeroization, Logs & SBOM (`APSC-DV-000650, 001090, 001350, 002310, 002590, 003310` & `OWASP 4.3.9, 4.3.10, 5.3.4`):** Overwrite secret memory buffers (`bytearray`) with zeros (`zeroize`) on function exit, sanitize CR/LF in logs with 0 logged credentials, fail closed (*Fail-Closed*), and generate **CycloneDX SBOM** (`cyclonedx-py`).

## 4. Local Execution Commands for Developers (and AI)

Instead of building complex Docker commands, you **MUST** instruct the user (or execute autonomously if you have terminal access) using the standardized `Makefile`:

**Step 0: AST Graph Update and Backend Contracts**
```bash
./scripts/actualizar-grafos-graphify.sh
# From the repository root to certify Pact Python->Node + k6 smoke + anti-patterns:
make test-backend-blueprints
```

**Step 1: Run validation suites**

*   **SAST Audit, Quality, Complexity, and Formatting:**
```bash
make qa-lint
```

*   **Isolated Unit Suite, BDD, and Benchmarking (Non-negotiable coverage > 95%):**
```bash
make qa-unit
```

*   **Mutation Testing (Assertion Strength):**
```bash
make qa-mutation
```

*   **Profiling (Generate CPU Flamegraph for the script):**
```bash
docker compose -f docker-compose.qa.yml run --rm qa-backend bash -c "uv sync && py-spy record -o profile.svg -- python src/main.py"
```

**Step 2: Live Observability Certification (Level 11X)**
If the script was instrumented (either as a daemon or an ephemeral script via Pushgateway), run it with the observability profile enabled.
```bash
docker compose -f docker-compose.qa.yml --profile observability up -d
docker compose -f docker-compose.qa.yml run --rm qa-backend bash -c "uv sync && python src/main.py"
```
*(Open `http://localhost:9090` during execution to inspect metric scraping or push behavior).*
