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
| **Backend (Python/FastAPI)** | `Mutmut` / `Karate Labs` / `ZAP` | Zero contract failures or surviving critical mutants | `make qa-mutation` / `make qa-bdd` |
| **Frontend (Vue/React)** | `tsc/vue-tsc --noEmit` + `ESLint` + `SonarJS` | **0 type errors / Low cognitive complexity** | `make qa-lint` |
| **Frontend (Vue/React)** | `Vitest` (`@vitest/coverage-v8`) | **`>= 95.0%` lines, functions, branches, statements** | `make qa-unit` |
| **Frontend (Vue/React)** | `Stryker Mutator` | Clean execution across critical business logic | `make qa-mutation` |
| **Frontend (Vue/React)** | `Playwright` + `@axe-core/playwright` | **0 WCAG 2.1 A/AA violations** | `make qa-e2e` |
| **Frontend (Vue/React)** | `Lighthouse CI` (`lhci autorun`) | **Perf/SEO/BP `>= 0.90` and Accessibility `>= 0.95`** | `make qa-perf` |

---

## 3. Repository Hygiene & RAM Conservation

1. **Mandatory Post-QA Cleanup:**
   - After running coverage or mutation tests, execute `make clean-cache`, purging temporary mutation files, `.coverage`, reports, and test browser artifacts.
2. **Concise Reporting:**
   - Do not dump thousands of raw terminal lines in the chat.
   - Summarize test counts, coverage percentages, and pass/fail status cleanly.
