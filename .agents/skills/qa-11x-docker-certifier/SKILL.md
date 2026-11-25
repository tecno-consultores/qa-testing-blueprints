---
name: qa-11x-docker-certifier
description: >-
  QA 11X Corporate Standard certifier in ephemeral Docker containers. Enforces Rule Zero
  (zero host executions on Ubuntu/macOS/Windows), Cyclomatic/Cognitive Complexity Grade A, unit test coverage >= 95%,
  mutation testing, WCAG 2.1 AA accessibility, Lighthouse CI, and silent mode RAM conservation.
---

# QA 11X Corporate Standard Certifier (Ephemeral Docker Execution)

This skill governs all tests, linters, audits, and cleanups in projects implementing QA 11X.
> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

---

## 1. Rule Zero: Total Isolation in Docker Containers

- **STRICTLY FORBIDDEN:** Executing `pip`, `uv`, `pytest`, `ruff`, `mypy`, `npm`, `pnpm`, `vitest`, `stryker`, or `playwright` directly on the host machine.
- Every validation command MUST execute inside ephemeral containers defined in `docker-compose.qa.yml` via monorepo `Makefile` targets (`make qa-lint`, `make qa-unit`, `make qa-mutation`, `make qa-e2e`, `make qa-perf`, `make qa-bdd`).
- Every new source file (`.py`, `.ts`, `.vue`, `.sh`, `Dockerfile`) MUST include appropriate license headers.

---

## 2. Strict QA 11X Approval Thresholds

| Ecosystem | Tool / Suite | Mandatory Gate | Container Command |
| :--- | :--- | :--- | :--- |
| **Backend (`python/` / `fastapi/`)** | `Ruff` + `Mypy --strict` + `Bandit` | **0 errors / 0 vulnerabilities** | `make qa-lint` |
| **Backend (`python/` / `fastapi/`)** | `Radon` (Cyclomatic Complexity) | **Grade A (`CC <= 5`, `MI >= A`)** | `make qa-lint` |
| **Backend (`python/` / `fastapi/`)** | `Pytest` (Unit Coverage) | **`>= 95.0%` real coverage on `src/`** | `make qa-unit` |
| **Backend (`python/` / `fastapi/`)** | `Mutmut` / `Karate Labs` / `ZAP` | **`MSI >= 80%`**, 0 contract failures, OWASP OSHP & ASVS/WSTG verified | `make qa-mutation` / `make qa-bdd` |
| **Backend (`node-backend/`)** | `ESLint` + `tsc --noEmit` + `Vitest` + `Stryker` + `Pact V4` + `Karate` | **0 errors, `CC <= 5`, `SonarJS <= 15`, `>= 95%` cov, `MSI >= 80%`** | `make qa-lint` / `qa-unit` / `qa-mutation` |
| **Frontend (`vue3/` / `react-frontend/`)** | `tsc`/`vue-tsc --noEmit` + `ESLint` + `SonarJS` | **0 errors, `CC <= 5`, `SonarJS <= 15`, `max-params: 4`** | `make qa-lint` |
| **Frontend (`vue3/` / `react-frontend/`)** | `Vitest` (`@vitest/coverage-v8`) | **`>= 95.0%` lines, functions, branches, statements** | `make qa-unit` |
| **Frontend (`vue3/` / `react-frontend/`)** | `Stryker Mutator` (`perTest` + `--incremental`) | **`MSI >= 80%`**, 0 surviving critical mutants | `make qa-mutation` |
| **Frontend (`vue3/` / `react-frontend/`)** | `Playwright` + `@axe-core/playwright` | **0 WCAG 2.1/2.2 A/AA violations** | `make qa-e2e` |
| **Frontend (`vue3/` / `react-frontend/`)** | `Lighthouse CI` (`lhci autorun`) | **Perf/SEO/BP `>= 0.90`, A11y `>= 0.95`, `CLS = 0`, `INP < 200ms`** | `make qa-perf` |
| **Backend (`php/` 8.2–8.5)** | `PHPStan Level Max` + `Psalm --taint-analysis` + `Pest/PCOV` + `Infection` | **0 errors, PHP Cognitive `<= 9`, `>= 95.0%` cov, `MSI >= 80%`** | `make qa-lint` / `qa-unit` / `qa-mutation` |
| **Bash / DevOps (`bash-scripts/`)** | `ShellCheck` + `shfmt -i 2 -ci` + `BATS-core` + rootless `kcov` (`no-new-privileges:true`, `cap_drop: [ALL]`) | **0 warnings, `>= 95.0%` coverage (`.agents/.cache/coverage/bash.xml`, no `<!DOCTYPE`)** | `make qa-lint` / `qa-unit` |
| **Mobile (`mobile-appium/`)** | `tsc --strict --noEmit` + `node --test` + `Appium 3` / `WDIO` (`base-mobile-appium:26`) | **0 errors, `>= 95.0%` lines / `>= 90.0%` branches, Screenplay & deep-link guards** | `make qa-lint` / `qa-unit` / `qa-e2e` |
| **AI Evals (`ai-evals/`)** | `Pytest` offline contracts + `DeepEval` / `Promptfoo` (Mode 2) | **100% `$0` offline CI + `Hallucination < 0.05` / OWASP LLM Top 10** | `make qa-unit` / `make audit-llm` |
| **Vibe Rescue (`vibe-rescue/`)** | `audit_vibe_prototype.py` + `Pytest` (`sinfallas/base-python-uv:3.15`) | **`VIBE-SEC-001..QA-005`, `CC <= 5`, `>= 95.0%` cov, SQL `FORCE RLS` templates** | `make qa-lint` / `qa-audit-enforce` / `qa-unit` |
| **Security & STIG (All 10 Stacks)** | `DISA ASD STIG V6R5` + `OWASP v4.2` + `Trivy` | Session timeouts (10m/15m), 3-fail lockout, `NFKC`, anti-XXE, WORM, SBOM, Trivy `HIGH/CRITICAL = 0` | `make qa-unit` / `make qa-dast` |

---

## 3. Incremental Mutation Testing, 3-Path Economy & RAM Conservation

1. **Fast Incremental & Per-Test Mutation Execution (`QA-STRYKER-CFG-01`, `mutmut_gates.py`, `QA-SECRET-CONV-01`):**
   - Never run full-suite tests per mutant across untouched files. Configure `"ignoreStatic": true`, `coverageAnalysis: "perTest"`, `--incremental`, `!src/**/*.{unit,spec,test}.*` exclusions in `mutate`, and capped `--concurrency <= 4` in Stryker (`reports/stryker-incremental.json`, injecting a non-root `/tmp/qa-bin/ps` shim in minimal Node containers lacking `procps`); use `--only-covered` in Infection, and `mutmut_gates.py` (`importlib.import_module("tests")`, `src/` target, `MSI >= 80%`) alongside `py-spy` (`qa-profile` opt-in sidecar using `user: "0:0"` + `SYS_PTRACE` + `.:/app:ro` under `yama.ptrace_scope = 2`).
   - Always prefix synthetic test passwords/tokens (`>= 16` chars) with `fake-*`, `dummy-*`, `mock-*`, or `placeholder-*` so fail-fast `verificar-secretos.sh` passes from `qa-lint` onward.
2. **3-Path Proportional Execution & Mandatory Step 6 (Zero Lint Shortcuts):**
   - **Skip Docker QA runs on `DOCS_ONLY` changes** (`skip_if_docs_only: true`).
   - On `MICRO_CHANGE` / `FULL_11X`, **ALWAYS** execute `run_ephemeral_qa(stage="lint")` + `run_ephemeral_qa(stage="unit")` (plus `stage="integration"` / `stage="ci"` tearing up/down ephemeral `postgres:17-alpine` when touching `migrations/`, ORM models, SQL, or `.github/workflows/`). NEVER substitute `make qa-lint` (`ruff` + `mypy --strict --cache-dir=/tmp/mypy` + `vue-tsc` + `eslint`) with partial standalone `ruff` commands.
   - **Mandatory Test Co-Evolution (`QA-TEST-SYNC-01`):** Whenever modifying code, schemas, CLI flags, skills, or catalogs, synchronize and re-execute ALL impacted pre-existing suites (unit, integration, BATS, and Karate `.feature` contracts) inside ephemeral Docker prior to committing.
   - Run the complete multi-stage pyramid (`make qa-all`) on `FULL_11X` architectural changes.
3. **Mandatory Post-QA Cleanup, Non-Root `COVERAGE_FILE=/tmp/.coverage`, `importlib` & Pass-Quiet Output:**
   - Never invoke `pytest -o addopts=""` without explicitly appending `--import-mode=importlib --cov=src --cov-fail-under=95` and `-e PYTHONPATH=/app/src` (preventing `ModuleNotFoundError` on `*.unit.py` / `*.int.py` and preserving coverage enforcement).
   - In hardened non-root containers (`USER 1001`) mounting host volumes (`UID 1000`), always pass `-u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache` so `coverage.py` and `uv` write to `/tmp` instead of failing with `sqlite3.DataError: Couldn't use data file '/app/.coverage'` or host bind-mount permission errors.
   - **Rootless Bash `kcov` (`ptrace_scope = 2`, Zero `SYS_PTRACE`):** Run `kcov` under `no-new-privileges:true` + `cap_drop: [ALL]` (never grant `SYS_PTRACE` or `seccomp:unconfined` to `qa-bash`) using `--bash-dont-parse-binary-dir --bash-parse-files-in-dir` with vendored QA-11X `--exclude-pattern` (`/limpieza.sh`, `/instalar-hooks.sh`, `/.agents/`, `/scripts/{verificar-secretos,auditar-infra,auditar-pagespeed,actualizar-grafos-graphify,generar-sbom-cyclonedx,install-skill}.sh`), wrapping `bats` in `/tmp/run-bats.sh` (`export -n BASH_XTRACEFD` + `export BASH_ENV=/tmp/kcov-env.sh` guarded by `[ -p "/proc/${BASHPID}/fd/${KCOV_BASH_XTRACEFD}" ]` without `${0} == /app/*` filters so `source`d scripts, relative paths, and `close_fds`/FD-reusing subprocesses stay accurate and clean), and stripping `<!DOCTYPE` when writing `/tmp/kcov-out` `cobertura.xml` to `.agents/.cache/coverage/bash.xml` (`0600`) for `verify_diff_coverage.py`.
   - After running coverage or mutation tests, execute `make certify` (`certify_11x_gate`) **before** `clean --deep` (`make clean` / `./scripts/limpieza.sh` (`clean_workspace_11x`) preserves `.agents/.qa-evidence.json`, `dist`, and `graphify-out/`, whereas `--deep` purges `.agents/.qa-evidence.json` and `.agents/.cache/`), purging temporary mutation sandboxes, `.coverage`, root-owned Docker artifacts (via ephemeral Alpine `chown`), and browser caches.
   - **Non-Interactive CI Compose (`QA-DOCKER-TTY-01`):** In `CI=true` pipelines, `deploy*.sh`, and AI agent workflows, always invoke `docker compose ... run --rm -T` to disable pseudo-TTY allocation and prevent `NoDefaultValueProvided` aborts when `process.stdin.isTTY === true` collides with `CI=true`.
   - **GitHub Actions Shell Escaping vs. Makefile/Compose (`QA-CI-ESCAPE-01`):** NEVER paste Makefile/Compose double-dollar expansions (`$$(pwd)`, `$$(id -u)`, `$${VAR}`) into `.github/workflows/*.{yml,yaml}` or `.github/actions/*/action.{yml,yaml}` `run:` steps. GitHub Actions executes `run:` directly in `bash`, where `$$` expands to the shell PID (`<PID>(pwd)` -> Docker `exit code 125`). Always use single-dollar `$(pwd)`, `$(id -u)`, `${VAR}` (exempt intentional heredoc generators via `# qa-ci-escape-ok`).
   - **Sub-Makefile `CURDIR` Boundary (`QA-MAKE-CURDIR-01`):** In subdirectory `Makefile`s (`*/Makefile`, `*/Makefile.example`) invoked via `$(MAKE) -C <subdir>`, NEVER reference Make's inherited `$(PWD)` / `${PWD}` (which retains the caller's parent `PWD` and mounts `..`); always use `$(CURDIR)` (e.g., `HOST_PWD ?= $(CURDIR)`, exempt via `# qa-make-curdir-ok`).
   - **SDK Transport & Lockfile Image Parity (`QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-HEALTH-01`):** Protocol servers must test real in-process SDK client transports; Dockerfiles must install dependencies from lockfiles (`uv sync --frozen --no-dev`, `uv export --frozen --no-dev`, `pnpm install --frozen-lockfile`, `npm ci`) and smoke-test built images (`import <app>`, `id -u != 0`, `401`). `QA-HEALTH-01` scopes probes exclusively to `HEALTHCHECK`/`healthcheck:` blocks, and `certify_11x_gate` exempts deployment env templates (`env.example`, `.env*.example`).
   - Never dump thousands of raw terminal lines into the LLM context; report concise JSON/table metrics.

---

## 4. Serialized Docker Execution, Anti-Subagent Fan-Out & CrashLoop Containment (`QA-DOCKER-LOOP-01`)

To prevent host RAM exhaustion (OOM/swap thrashing), `veth*` storms on Linux `NetworkManager`/`tailscaled`, and ACPI thermal shutdowns:

1. **Serialize Heavy QA Containers (`QA_MAX_CONCURRENT_CONTAINERS=1`):**
   - Run heavy QA workloads (`pytest`, `mypy`, `uv sync`, `vitest`, `mutmut`, `stryker`, `playwright`, `docker compose build`) **one at a time** via `run_ephemeral_qa` (which enforces an atomic FIFO host slot lock, passive Linux RAM `< 12%` / thermal `>= 85°C` guardrails, and pre-flight CrashLoop detection).
   - **Subagents & `/teamwork` Anti-Fan-Out:** Parallel subagents may read and edit disjoint files concurrently, but **MUST NEVER** spawn concurrent ad-hoc `docker run` QA suites (`pytest`/`mutmut`/`vitest`) against the same workspace. Only the coordinator (or the serialized `run_ephemeral_qa` queue) executes Docker QA validation.
2. **Bounded, Self-Cleaning Container Invocations (`QA-DOCKER-LOOP-01`):**
   - **FORBIDDEN in `docker-compose.{qa,test,deploy}*.yml`:** `restart: always`, `restart: unless-stopped`, or unbounded `restart: on-failure`. Enforce `restart: "no"`, `cpus: "${QA_CPU_LIMIT:-2.0}"`, `mem_limit`, and `pids_limit` (`64` init / `256` standard / `512` Playwright/JVM/Appium), plus `network_mode: none` on offline init services.
   - **Ad-hoc `docker run` Contract:** Always pass `--rm --restart=no --init --cpus=2 --memory=2g --pids-limit=256 --security-opt=no-new-privileges:true`, a deterministic `--name`, and `--network none` for every offline lint/unit/chown/script invocation (eliminates `veth*` churn). Never run floating `:latest` tags when a pinned stack image exists.
   - **Deploy/CI Scripts (`deploy*.sh`, `ci*.sh`):** Export `COMPOSE_PARALLEL_LIMIT=1` (or build services sequentially), pass `--wait-timeout 60` on every `docker compose up -d --wait`, and register `trap cleanup EXIT INT TERM` tearing down **both** `docker-compose.deploy.yml` and `docker-compose.qa.yml` (plus any named `docker run` container).
3. **CrashLoop & Orphan Scope Hygiene:**
   - Never run a blind global `docker rm -f $(docker ps -aq)` autonomously. Auto-stop only workspace-scoped `restarting` containers (`docker update --restart=no <id> && docker rm -fv <id>`); if foreign-project CrashLoops are detected, fail fast and report exact IDs to the operator.
   - On Linux hosts running `NetworkManager` + `tailscaled`, verify `qa-11x doctor` reports `network_manager_unmanaged_ok: true` (`/etc/NetworkManager/conf.d/99-unmanaged-docker.conf`).
