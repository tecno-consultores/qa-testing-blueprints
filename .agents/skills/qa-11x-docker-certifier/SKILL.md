---
name: qa-11x-docker-certifier
description: >-
  QA 11X Corporate Standard certifier in ephemeral Docker containers. Enforces Rule Zero
  (zero host executions on Ubuntu/macOS), Cyclomatic/Cognitive Complexity Grade A, unit test coverage >= 95%,
  mutation testing, WCAG 2.1 AA accessibility, Lighthouse CI, and silent mode RAM conservation.
---

# QA 11X Corporate Standard Certifier (Ephemeral Docker Execution)

This skill governs all tests, linters, audits, and cleanups in projects implementing QA 11X.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Rule Zero: Total Isolation in Docker Containers

- **STRICTLY FORBIDDEN:** Executing `pip`, `uv`, `pytest`, `ruff`, `mypy`, `npm`, `pnpm`, `vitest`, `stryker`, or `playwright` directly on the host machine.
- Every validation command MUST execute inside ephemeral containers defined in `docker-compose.qa.yml` via monorepo `Makefile` targets (`make qa-lint`, `make qa-unit`, `make qa-mutation`, `make qa-e2e`, `make qa-perf`, `make qa-bdd`).
- Every new source file (`.py`, `.ts`, `.vue`, `.sh`, `Dockerfile`) MUST include appropriate license headers.

---

## 2. Strict QA 11X Approval Thresholds

| Ecosystem | Tool / Suite | Mandatory Gate | Container Command |
| :--- | :--- | :--- | :--- |
| **Backend (Python/FastAPI)** | `Ruff` + `Mypy --strict` + `Bandit` | **0 errors / 0 vulnerabilities** | `make qa-lint` |
| **Backend (Python/FastAPI)** | `Radon` (Cyclomatic Complexity) | **Grade A (`CC <= 5`, `MI >= B`)** | `make qa-lint` |
| **Backend (Python/FastAPI)** | `Pytest` (Unit Coverage) | **`>= 95.0%` real coverage on `src/`** | `make qa-unit` |
| **Backend (Python/FastAPI)** | `Mutmut` / `Karate Labs` / `ZAP` | Zero contract failures, 0 surviving critical mutants, OWASP OSHP headers & ASVS/WSTG verified | `make qa-mutation` / `make qa-bdd` |
| **Security & STIG (All)** | `DISA ASD STIG V6R5` + `OWASP v4.2` | Verify session timeouts (10m/15m), 3-attempt lockout, `NFKC` input, anti-XXE, HMAC logs, Fail-Secure & CycloneDX SBOM | `make qa-unit` / `make qa-dast` |
| **Frontend (Vue/React)** | `tsc/vue-tsc --noEmit` + `ESLint` + `SonarJS` | **0 type errors / Low cognitive complexity** | `make qa-lint` |
| **Frontend (Vue/React)** | `Vitest` (`@vitest/coverage-v8`) | **`>= 95.0%` lines, functions, branches, statements** | `make qa-unit` |
| **Frontend (Vue/React)** | `Stryker Mutator` (`perTest` + `--incremental`) | **`MSI >= 80%`**, 0 surviving critical mutants | `make qa-mutation` |
| **Frontend (Vue/React)** | `Playwright` + `@axe-core/playwright` | **0 WCAG 2.1/2.2 A/AA violations** | `make qa-e2e` |
| **Frontend (Vue/React)** | `Lighthouse CI` (`lhci autorun`) | **Perf/SEO/BP `>= 0.90`, A11y `>= 0.95`, `CLS = 0`, `INP < 200ms`** | `make qa-perf` |
| **Backend (PHP 8.2–8.5)** | `PHPStan Level Max` + `Psalm --taint-analysis` + `Pest/PCOV` + `Infection` | **0 errors, `>= 95.0%` coverage, `MSI >= 80%`** | `make qa-lint` / `make qa-unit` / `make qa-mutation` |
| **Bash / DevOps** | `ShellCheck` + `shfmt -i 2 -ci` + `BATS-core` + `kcov` | **0 warnings, `>= 95.0%` coverage** | `make qa-lint` / `make qa-unit` |

---

## 3. Incremental Mutation Testing, 3-Path Economy & RAM Conservation

1. **Fast Incremental & Per-Test Mutation Execution:**
   - Never run full-suite tests per mutant across untouched files. Configure `coverageAnalysis: "perTest"` and `--incremental` in Stryker (`reports/stryker-incremental.json`), `--only-covered` in Infection, and targeted module paths in `mutmut` inside capped-concurrency ephemeral containers (`--concurrency 4`).
2. **3-Path Proportional Execution & Mandatory Step 6 (Zero Lint Shortcuts):**
   - **Skip Docker QA runs on `DOCS_ONLY` changes** (`skip_if_docs_only: true`).
   - On `MICRO_CHANGE` / `FULL_11X`, **ALWAYS** execute `run_ephemeral_qa(stage="lint")` + `run_ephemeral_qa(stage="unit")` (plus `stage="integration"` / `stage="ci"` tearing up/down ephemeral `postgres:17-alpine` when touching `migrations/`, ORM models, SQL, or `.github/workflows/`). NEVER substitute `make qa-lint` (`ruff` + `mypy --strict --cache-dir=/tmp/mypy` + `vue-tsc` + `eslint`) with partial standalone `ruff` commands.
   - Run the complete multi-stage pyramid (`make qa-all`) on `FULL_11X` architectural changes.
3. **Mandatory Post-QA Cleanup, Non-Root `COVERAGE_FILE=/tmp/.coverage`, `importlib` & Pass-Quiet Output:**
   - Never invoke `pytest -o addopts=""` without explicitly appending `--import-mode=importlib --cov=src --cov-fail-under=95` and `-e PYTHONPATH=/app/src` (preventing `ModuleNotFoundError` on `*.unit.py` / `*.int.py` and preserving coverage enforcement).
   - In hardened non-root containers (`USER 1001`) mounting host volumes (`UID 1000`), always pass `-e COVERAGE_FILE=/tmp/.coverage` so `coverage.py` writes its SQLite database to `/tmp/.coverage` instead of failing with `sqlite3.DataError: Couldn't use data file '/app/.coverage'`.
   - After running coverage or mutation tests, execute `make clean` / `./scripts/limpieza.sh` (`clean_workspace_11x`), purging temporary mutation sandboxes, `.coverage`, root-owned Docker artifacts (via ephemeral Alpine `chown`), and browser caches.
   - Never dump thousands of raw terminal lines into the LLM context; report concise JSON/table metrics.
