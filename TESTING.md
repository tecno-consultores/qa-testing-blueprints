# 🛡️ Quality Assurance Scoreboard (TESTING.md) — Corporate Standard `QA-11X v3.6` (`v3.6.0`)

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](TESTING.es.md)

This document serves as the live certification scoreboard for Corporate Quality Standard Level 11X (`v3.6.0`) across the `qa-testing-blueprints` repository blueprints (**10 hydratable stacks** `python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue` + `architecture/` + `mcp-server/` = **12 matrix environments**). All included ecosystems are evaluated under **Rule Zero**: strict, 100% isolated execution in ephemeral Docker containers with **Pass-Quiet / Fail-Verbose** output (one-line telemetry with metrics on success, full trace on failure to optimize AI agent context windows).

---

## 1. Global Metrics and Non-Negotiable Thresholds

| Quality Dimension | Canonical Tool | Minimum Required Threshold | Action on Non-Compliance |
| :--- | :--- | :--- | :--- |
| **Unit Coverage & Pre-Push Typing** | `pytest-cov`, `vitest`, `kcov`, `mypy --strict --cache-dir=/tmp/mypy` (`COVERAGE_FILE=/tmp/.coverage` and `PYTHONPATH=/app/src` in non-root Docker via `-u "$(id -u):$(id -g)"`: `UID 1001` on CI / `${QA_UID:-1000}` locally, overriding image default `appuser UID 10001`; `-o addopts=""` forbidden without `--import-mode=importlib --cov=src`) | **>= 95.0%** lines & branches + **0 type errors** | Immediate Merge Block / Exit Code 1 (`QA-COV-01` / `QA-MYPY-01`) |
| **Cyclomatic Complexity** | `radon` (Python `--min B`), `eslint-plugin-sonarjs` | Grade **A** (`CC <= 5`, Cognitive `<= 15`) | Rejected for technical debt |
| **Maintainability** | `radon mi` | Grade **A** (`> 20`) | Mandatory refactoring |
| **Static Security (SAST)** | `bandit`, `eslint-plugin-security`, `ShellCheck` | **0 HIGH / MEDIUM findings** | Blocked on vulnerability |
| **Dependency CVEs & SBOM** | `pip-audit`, `pnpm audit`, `trivy`, `cyclonedx-py` | **0 CRITICAL / HIGH vulnerabilities** + CycloneDX SBOM | Software supply-chain block |
| **Dynamic Security (DAST & OSHP)** | `zaproxy/zap-stable` (OWASP ZAP + WSTG/ASVS/OSHP) | **0 HIGH alerts**, OSHP headers & Fail-Secure state | Dynamic CI/CD block |
| **Mutation Testing** | `mutmut`, `stryker`, `infection` | **`>= 80%` MSI** *(targets `>= 80%` instead of the `>= 95%` line/branch unit-coverage floor due to equivalent mutants and exponential mutant execution cost)* | Rejected for weak assertions |
| **BDD Behavior** | `sinfallas/karatelabs:1.5.1` (Gherkin) | **100% scenarios PASSED** | Functional flow block |
| **DB Schema Parity & RLS/WORM** | `.agents/scripts/verify_alembic_orm_parity.py` + `SEC-13` (`after_begin` RLS + `NOBYPASSRLS`) + `QA-PG17-RLS` (`pg_class.relforcerowsecurity` with `JOIN pg_namespace`, never `pg_tables.forcerowsecurity`) + `SEC-14` (`seq_num` + `pg_advisory_xact_lock` WORM) | **0 orphan tables / revision `<= 32` chars / multi-tx RLS / PG 15–17+ catalog / deterministic WORM chain** | Rejected for Anti-Mock Blindness / RLS Leak / WORM Race |
| **Anti-Silo Propagation, Multi-Stage Pre-Auth (`SEC-16`), Live Orchestrator Health (`QA-HEALTH-01`), 3 Clock Phases & Per-Item Batch** | Read-After-Write contracts, Pytest/Vitest, Karate BDD (`api_test.feature` / `ui_business_flow.feature`) and `audit_security_stig_owasp` | **0 intermediate cross-module mocks, atomic `GETDEL`/Lua continuity + `PREAUTH_PUBLIC_ROUTES` on Pre-Auth flows, mock-free `healthcheck` probe contracts (`/tmp/worker_heartbeat`) + `task.exception()` / `OPTIONAL_WORKERS`, 3 clock phases, 0 raw UUIDs in `actor_username`, Dual Refresh (`[ 🔄 Refrescar ]`), `timeout >= 180s` + `0-byte` purge & `results[].status` check on batch `200 OK`** | Rejected for Silo Mock Blindness / Unhealthy Container Escape / Pre-Auth 401 Escape |
| **Orphan UI Components** | `.agents/scripts/verify_zero_orphan_vue_components.py` | **0 components without unit tests** | Blocked at pre-commit |
| **API Endpoint Parity** | `.agents/scripts/verify_no_orphan_api_endpoints.py` | **0 Front-Back 404/405 calls** | Blocked on contract drift |
| **Web Accessibility** | `@axe-core/playwright` | **0 WCAG 2.1 AA violations** | Tactical UI rejection |
| **Frontend Performance** | `Lighthouse CI` | **Score `>= 90`** (Core Web Vitals) | Static build block |
| **Secret Scanning** | `./scripts/verificar-secretos.sh` | **0 hardcoded secrets / API keys** | Rejected at pre-commit |
| **Manifest Integrity** | `scripts/generar-manifiesto.py --check` | **100% SHA-256 hashes synced** | Blocked on Zero-Clone drift |
| **ROADMAP & Active Task Consistency** | `.agents/scripts/verify_roadmap_consistency.py` | **100% table vs `[x]` task parity / zero pending boxes in COMPLETED** | Closure rejected for asymmetry |

---

## 2. Tech Ecosystem Matrix and Ephemeral Commands

Scope: **10 hydratable stacks** (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`) + `architecture/` + `mcp-server/` (= **12 matrix environments**).

### 🧭 Root Repository Orchestration (`Makefile`)
| Command | Ephemeral Scope (Rule Zero) |
| :--- | :--- |
| `make clean` / `make qa-clean` | Purges temporary artifacts, Docker caches, and root-owned leftovers (`./scripts/limpieza.sh`) |
| `make audit` / `make sbom` / `make validate-calm` | Runs Trivy IaC/CVE audit, CycloneDX SBOM/CBOM + SHA-256 attestation, and FINOS CALM validation (`architecture/qa-11x.calm.json`) |
| `make lint` / `make shellcheck` / `make shfmt` | ESLint (`--max-warnings 0`), strict TypeScript, ShellCheck (`-x`), and POSIX `shfmt -d` |
| `make lint-workflows` / `make lint-docs` | Validates GitHub workflow security/keys, doc/roadmap parity, and `QA-GIT-GATE-01` |
| `make sync-governance` / `make version-check` | Verifies SHA-256 `manifest.json` integrity, cognitive budgets, and SemVer/edition parity |
| `make test` / `make certify` | Executes the full monorepo QA suite or the 10-stage `.agents/scripts/certify_task_completion.sh` gate |
| `make test-mcp` / `make test-karate` / `make test-example` | Runs MCP Vitest (`>= 95%`, 44 suites), Karate Labs BDD (`52` scenarios), and Clean-Room `stdio` `.tgz` E2E |
| `make test-py` / `make test-bats` / `make test-meta-qa` | Executes Python unit tests, BATS-core + kcov coverage XML, and `.agents/scripts/` trimodal Meta-QA |
| `make test-ai-offline` / `make audit-llm` | Runs zero-cost deterministic AI contracts (`97.73%`) or on-demand DeepEval + Promptfoo OWASP audits |
| `make test-frontend-blueprints` / `make test-backend-blueprints` / `make test-mobile-blueprints` | Certifies Vue/React Screenplay+anti-patterns, FastAPI↔Node Pact V4+k6, and `base-mobile-appium:26` W3C |
| `make diff-cov` / `make pr-verdict` / `make compact-context` / `make audit-psi` (`qa-psi`) | Checks 100% delta line coverage (`>= 90%` branch), exports `PR_VERDICT.md`, compacts context Zero-LLM, or runs PSI v5 |
| `make build` / `make publish-mcp-dry` / `make publish-mcp` | Compiles `mcp-server/dist`; **`make publish-mcp` enforces `QA-GIT-GATE-01` (requires explicit human authorization)** |

> **Monorepo `Makefile.example` Note:** Inside this blueprints repository, the 10 hydratable stack directories ship `Makefile.example` templates (copied/merged into `Makefile` in consumer repositories upon hydration via `bootstrap_or_merge_11x`). From the monorepo root, run root `Makefile` targets (`make test-*`) or `make -C <stack> -f Makefile.example qa-*`; inside hydrated consumer projects (and in `mcp-server/` / `mcp-server/example/`), run `make qa-*` directly.

### ⚡ FastAPI (Python Backend) — 13 Layers
* **Base Image:** `sinfallas/base-python-uv:3.15` (Available tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` and `latest`)
* **Persistence:** `postgres:17-alpine` + `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch)
* **Validation Commands:**
  ```bash
  cd fastapi
  make qa-lint        # Ruff, Mypy strict (--cache-dir=/tmp/mypy), Bandit SAST, Radon complexity
  make qa-unit        # Isolated Pytest with --import-mode=importlib and network mocks (Coverage >= 95%)
  make qa-migration   # ORM vs Alembic migration parity check
  make qa-integration # Ephemeral integration suite spinning up and tearing down PostgreSQL 17 + KeyDB
  make qa-ci          # 1:1 pre-push CI parity (lint + unit + migration + integration)
  make qa-mutation    # Mutmut assertion audit
  make qa-bdd         # Karate Labs BDD (test/api_test.feature; Pact V4 contracts run via root make test-backend-blueprints)
  make qa-dast        # OWASP ZAP Baseline Scan against http://api:8000
  make qa-chaos       # Pumba jitter + Locust concurrency + Prometheus RED
  make qa-all         # Full 11X suite
  ```

### 🟢 Vue 3 (TypeScript Frontend) — Tactical High Density
* **Base Image:** `sinfallas/base-node-ionic:26` (Available tags: `22`, `24`, `26` and `latest`)
* **Web Server:** `nginxinc/nginx-unprivileged:1.27-alpine` + `nginx-prometheus-exporter`
* **Validation Commands:**
  ```bash
  cd vue3
  make build-ui      # Production Vite bundle build inside ephemeral Docker
  make qa-lint       # ESLint, Prettier, SonarJS, vue-tsc typecheck
  make qa-unit       # Vitest in jsdom with full isolation (>= 95%)
  make qa-orphans    # Audit ensuring 0 .vue components lack dedicated tests
  make qa-mutation   # Stryker mutants on templates and logic
  make qa-bdd        # Karate Labs HTTP/OSHP/SSG/XML on Nginx (test/ui_business_flow.feature)
  make qa-e2e        # Playwright visual regression + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (Core Web Vitals >= 90)
  make qa-obs        # Nginx Prometheus exporter smoke + RED metrics observability
  make qa-psi URL=https://your-domain.com  # PageSpeed Insights v5 post-deploy (Lab + CrUX)
  make qa-all        # Full pipeline
  ```

### 🟩 Node.js (Express/Fastify Microservices)
* **Base Image:** `sinfallas/base-node-ionic:26` (Available tags: `22`, `24`, `26` and `latest`)
* **Validation Commands:**
  ```bash
  cd node-backend
  make qa-lint       # ESLint, SonarJS, Prettier, dependency audit
  make qa-unit       # Vitest + Nock network isolation (>= 95%)
  make qa-contracts  # Pact V4 zero-infra contract tests (node --test tests/contracts/*.test.ts)
  make qa-mutation   # Stryker
  make qa-e2e        # Karate Labs BDD against http://api:3000
  make qa-dast       # OWASP ZAP Baseline Scan
  make qa-sbom       # CycloneDX SBOM generation (pnpm sbom)
  make qa-stress     # Pumba latency injection + Artillery
  make qa-all        # Consolidated pipeline (lint + unit + contracts + mutation + e2e)
  ```

### 🐍 Python Standalone (Libraries & CLI)
* **Base Image:** `sinfallas/base-python-uv:3.15` (Available tags: `3.11`, `3.12`, `3.13`, `3.14`, `3.15` and `latest`)
* **Validation Commands:**
  ```bash
  cd python
  make qa-lint          # Ruff, Mypy, Bandit, Radon
  make qa-unit          # Pytest + Pytest-BDD + Pytest-Benchmark (>= 95%)
  make qa-ci            # 1:1 pre-push CI parity (lint + unit)
  make qa-mutation      # Mutmut
  make qa-load          # k6 performance SLOs (when API_BASE_URL / PYTHON_HTTP_CMD set)
  make qa-observability # Prometheus + Pushgateway metrics stack
  make qa-all           # Consolidated run (lint + unit + mutation)
  ```

### ⚛️ React (Vite / TypeScript Frontend)
* **Base Image:** `sinfallas/base-node-ionic:26` (Available tags: `22`, `24`, `26` and `latest`)
* **Web Server:** `nginxinc/nginx-unprivileged:1.27-alpine` + `nginx-prometheus-exporter`
* **Validation Commands:**
  ```bash
  cd react-frontend
  make build-ui      # Production Vite bundle build inside ephemeral Docker
  make qa-lint       # ESLint, React Hooks plugin, SonarJS, tsc
  make qa-unit       # Vitest + React Testing Library (>= 95%)
  make qa-orphans    # Recursive audit for 0 .tsx/.jsx components/views lacking dedicated tests
  make qa-mutation   # Stryker
  make qa-bdd        # Karate Labs HTTP/OSHP/SSG/XML on Nginx (test/ui_business_flow.feature)
  make qa-e2e        # Playwright v1.52.0-noble + Axe WCAG 2.1 AA
  make qa-perf       # Lighthouse CI (lighthouserc.cjs, Core Web Vitals >= 90)
  make qa-obs        # Nginx Prometheus exporter smoke + RED metrics observability
  make qa-psi URL=https://your-domain.com  # PageSpeed Insights v5 post-deploy (Lab + CrUX)
  make qa-all        # Full pipeline
  ```

### 🐧 Bash / DevOps Scripts
* **Base Image:** `sinfallas/base-bash-qa:latest`
* **Validation Commands:**
  ```bash
  cd bash-scripts
  make qa-lint          # ShellCheck (0 errors/warnings) + shfmt POSIX
  make qa-unit          # BATS-core + bats-mock + kcov (>= 95%)
  make qa-observability # Prometheus + Pushgateway stack
  make qa-all           # Consolidated run (qa-lint + qa-unit)
  ```

### 🐘 PHP 8.2–8.5 (`sinfallas/basephpcomposer`) — 13 Layers
* **Base Image:** `sinfallas/basephpcomposer:8.5` (Available tags: `8.2`, `8.3`, `8.4`, `8.5` and `latest` — Multi-Arch `amd64`/`arm64`)
* **Persistence:** `postgres:17-alpine` + `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch) (via `ext-redis` and `ext-pdo_pgsql`)
* **Validation Commands:**
  ```bash
  cd php
  make qa-lint       # PHP-CS-Fixer (@PER-CS2.0), PHPStan (level: max + cognitive-complexity <= 9), Psalm (--taint-analysis), composer audit
  make qa-unit       # Pest / PHPUnit with C driver PCOV (-d pcov.directory=src, or app in Laravel; Coverage >= 95.0%)
  make qa-parity     # Real PostgreSQL 17 schema, migrations & FORCE ROW LEVEL SECURITY verification
  make qa-contracts  # OpenAPI / contract compliance tests inside ephemeral PHP container
  make qa-bdd        # Karate Labs BDD (test/api_test.feature)
  make qa-mutation   # Infection PHP (-d pcov.directory=src|app, MSI >= 80%, Covered MSI >= 80%)
  make qa-dast       # OWASP ZAP Baseline Scan against PHP-FPM / Nginx live container
  make qa-load       # k6 load SLOs (smoke/load/stress)
  make qa-chaos      # Pumba network fault injection + RED observability
  make qa-sbom       # CycloneDX SBOM v1.6 (cyclonedx/cyclonedx-php-composer)
  make qa-all        # Full 11X suite
  ```

### 🧠 MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x` `v3.6.0`)
* **Base Image:** `sinfallas/base-node-ionic:26` (Available tags: `22`, `24`, `26` and `latest`)
* **Certified 11X Metrics (`v3.6.0` / `QA-11X v3.6`):**
  * **Statements:** `99.87%` (`>= 95.0%`)
  * **Branches:** `97.32%` global (`src/resources` `98.42%`, `src/cli` `98.18%`, `surgical-merger.ts` `99.05%`)
  * **Functions:** `99.89%` (`>= 95.0%`)
  * **Lines:** `99.87%` (`>= 95.0%`)
  * **Unit & Live Protocol Tests:** **760 tests passing at 100%** (44 Vitest suites including `tests/audit-remediation-wave-c.unit.ts`, `tests/audit-hardening.unit.ts`, `tests/live-mcp-protocol.test.ts` over `InMemoryTransport` and `StdioClientTransport`, `tests/mobileBlueprint.test.ts`, `tests/path-real-resolver.unit.ts`, `tests/ide-config-paths.unit.ts`, `tests/cli-certify-audit.unit.ts`, `tests/cli-doctor-upgrade.unit.ts`, `tests/cli-dx-tools.unit.ts`, `tests/diff-blast-radius.unit.ts` with `git-signals`, `src/index.ts`, `QA-CLI-TTY-01`, `SEC-09`, and `QA-SSR-HYDRATION-01`)
  * **Multi-Stack Differential Coverage (`verify_diff_coverage.py`):** **100.00% delta lines** and **>= 90.00% delta branches** across modified files
  * **MCP Surface:** **19 canonical tools** (12 v1 core + 6 v2.0 tools for CALM, Release Gate, agent trajectory, OWASP LLM Red Team, Vibe-Rescue, and TMS sync + **v3.1** `session_flight_recorder`) and **13 `blueprint://*` resources** (11 static URIs including **v3.1** `blueprint://skills/tactical-patterns-11x` with `?lang=es|en` bilingual negotiation + 2 resource templates) enforcing Thin-Repo contract, AST graph auto-build/refresh (`auto_build_if_missing`, `refresh_graph`), longitudinal Git architectural signals (`include_git_signals`, `--git-signals`), Metadata-Only mode (`include_content: false`), rule grouping (`groupFindingsByRule`), 36 static scanner rules (`SEC-01`..`SEC-16`, `SEC-CI-ACTION-REF`, `SEC-WS-PUBSUB-01`, `QA-KARATE-IDEMP`, `QA-COV-01`, `QA-MYPY-01`, `QA-PG17-RLS`, `QA-SMOKE-01`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-DOCKER-TTY-01`, `QA-CI-ESCAPE-01`, `QA-MAKE-CURDIR-01`, `QA-CONTRACT-SDK-01`, `QA-DOCKER-LOCK-01`, `QA-PLAYWRIGHT-PIN-01`, `QA-SSR-HYDRATION-01`, `QA-STRYKER-CFG-01`, `UI-11X-01..03`) enforcing the 22 DISA ASD STIG V6R5 + OWASP v4.2 reference controls alongside human push guard `QA-GIT-GATE-01`, `TaskStateGuard` + `promptGuard`, and 10/10 parity in `certify_11x_gate`
  * **Karate Labs BDD Scenarios:** `mcp-server/test/mcp_cli_test.feature` (**52 scenarios** in `sinfallas/karatelabs:1.5.1`, including **Scenarios 50–52** covering the 12 CLI subcommands, shared IDE config paths, Clean-Room tarball verification, `blast-radius --git-signals`, `.claude-plugin/` parity, and SARIF v2.1.0 contracts)
  * **Headless CI CLI Gates & Diagnostics Surface:** `doctor`/`status`, surgical `upgrade`/`cache-clean`, `certify` (`--strict` exit `20` / `--release-gate` exit `30`), `audit` (`--mode security|pyramid|vibe|calm|all`, `--profile auto|generic|qa-11x-self`, `--sarif` v2.1.0), `blast-radius` (`--changed-since` routing `DOCS_ONLY`/`MICRO_CHANGE`/`FULL_11X`), `mcp-config` (`--client <id> --install --pin-version` with `.11x-backup`), `completion <fish|bash|zsh>`, and offline `--version --verbose|--json`.

### 🤖 AI / LLM Evals (`ai-evals/`), 📱 Mobile (`mobile-appium/`) and 🚑 Vibe Rescue (`vibe-rescue/`)
* **Offline AI (`make test-ai-offline` in `sinfallas/base-python-uv:3.15`):** **28 deterministic tests passed** (4 `live` tests skipped by design in offline mode), **97.73% coverage**, `ruff CC <= 5` + `mypy --strict` with **0 findings**.
* **Native/Hybrid Mobile (`mobile-appium/`):** Executed on dedicated image **`sinfallas/base-mobile-appium:26`** (`Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`), validating `java`/`adb`/`appium` binaries, strict TypeScript + `MobileActor` Screenplay unit suite (`make test-mobile-blueprints` from repo root), and `lint_test_antipatterns.py`; specification in [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md).
* **Vibe-to-Enterprise Rescue (`vibe-rescue/`):** AST-first audit (`audit_vibe_prototype.py`) with **21 unit tests (`99.40%` coverage)**, `ruff CC <= 5`, and `mypy --strict` (**0 findings**).
* **Validation Commands:**
  ```bash
  # AI / LLM Evals, Vibe-Rescue & Mobile (Rule Zero in ephemeral Docker):
  cd ai-evals     && make qa-lint && make qa-unit && make qa-offline && make qa-ci && make audit-llm && make qa-all
  cd vibe-rescue  && make qa-lint && make qa-audit && make qa-audit-enforce && make qa-unit && make qa-ci && make qa-all
  cd mobile-appium && make qa-lint && make qa-unit && make qa-drivers && make qa-bridge && make qa-e2e && make qa-all

  # From monorepo root (cross-stack verification):
  make test-ai-offline && make test-mobile-blueprints && make test-mcp && make test-karate && make test-example

  # MCP Server via ephemeral Docker Makefile targets (never raw pnpm/npx on host):
  cd mcp-server
  make qa-lint             # ESLint + eslint-plugin-security + SonarJS (--max-warnings 0)
  make qa-typecheck        # Strict TypeScript check (0 type errors)
  make qa-unit             # Vitest v8 with coverage report (>= 95%)
  make build               # Compiles dist/ with executable index.js binary
  make qa-example          # Live Clean-Room stdio + .tgz tarball integration check
  make qa-e2e              # Karate Labs BDD (sinfallas/karatelabs:1.5.1)
  make qa-all              # Full pipeline in ephemeral Docker

  # Sovereign publishing to npmjs.org (QA-GIT-GATE-01: explicit human authorization required):
  make publish-mcp-dry     # Validation and packaging dry run (--dry-run)
  make publish-mcp         # Live publish to npmjs (FORBIDDEN without explicit human sign-off)
  ```

---

## 3. Pre-Commit Certification Gate (`certify_task_completion.sh`)

Before authorizing any code integration or closing a technical task, the universal certification gate must be executed:

```bash
./.agents/scripts/certify_task_completion.sh
```

The script sequentially and strictly evaluates 10 mandatory gates:
1. **[1/10] Secret Scanning:** Detection of private keys, tokens, and credentials via `scripts/verificar-secretos.sh`.
2. **[2/10] Local Dependency & IaC Security Audit:** Static vulnerability and Docker Compose manifest scanning with Trivy (`scripts/auditar-infra.sh` + `.trivy.yaml`).
3. **[3/10] No Duplicate JSON Keys:** Prevention of collisions and overwrites in dictionaries (`verify_json_no_duplicate_keys.py`).
4. **[4/10] Zero Orphan Components:** Deterministic unit test coverage check for 100% of UI components (`verify_zero_orphan_vue_components.py`).
5. **[5/10] Zero Orphan API Endpoints:** Bidirectional route parity verification between Frontend and Backend (`verify_no_orphan_api_endpoints.py`).
6. **[6/10] Topological Health & AST Layer Boundaries:** Validation of coupling and architectural layer boundaries (`verify_topological_health.py`).
7. **[7/10] Database Schema & Migration Parity:** Inspection of SQLAlchemy models against Alembic migrations and `revision <= 32` chars (`verify_alembic_orm_parity.py`).
8. **[8/10] Cryptographic Manifest & Version Synchronization:** Strict SHA-256 hash verification in `manifest.json` (`scripts/generar-manifiesto.py --check`, `.agents/scripts/sync_governance.py --check`) and version/edition parity (`.agents/scripts/bump_version_11x.py --check`), guaranteeing Zero-Clone integrity (`DISA STIG V-222513`).
9. **[9/10] Roadmap & Active Task Consistency:** Strict bidirectional consistency verification between the `ROADMAP.md` summary table and granular tasks (`- [x]` / `- [ ]`), plus zero pending checkboxes in `.agents/ACTIVE_TASK.md` under `COMPLETED` status (`verify_roadmap_consistency.py`).
10. **[10/10] Documentation & Mandatory Tests Synchronization:** Unconditional consistency verification across `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`, `README.md`, and 11X test suites.

---

## 4. Tooling & Script Unit Tests (`tests/`)

* **Autonomous MCP Server Publisher to npmjs (`scripts/publicar-mcp.sh`):**
  * **Suite:** `tests/test_publicar_mcp.unit.py` (12 unit tests).
  * **Ephemeral Execution:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_publicar_mcp.unit.py`
  * **Coverage Achieved:** **100% assertions passed** (12/12 tests passing).
  * **Validated Assertions:** `--help` menu and CLI options, non-root host enforcement, missing `NPM_TOKEN` rejection in live mode, placeholder template token rejection, missing or present `.env` handling, missing `package.json` detection, and retry loop tolerating npmjs CDN eventual consistency (Milestone 8).

* **ROADMAP & Active Task Consistency Validator (`.agents/scripts/verify_roadmap_consistency.py`):**
  * **Suite:** `tests/test_verify_roadmap_consistency.unit.py` (19 unit tests).
  * **Ephemeral Execution:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 tests/test_verify_roadmap_consistency.unit.py`
  * **Coverage Achieved:** **100% assertions passed** (19/19 tests passing).
  * **Validated Assertions:** Integer and decimal milestone summary table parsing, section task counting, detection of 100%-done milestones marked Pending (Milestone 4 case), detection of taskless milestones marked Completed, header icon asymmetry (`## ✅` vs `## ⏳`), `ACTIVE_TASK.md` pending tasks check under `COMPLETED (100%)`, and deterministic CLI execution.

* **Cryptographic Manifest Generator & Validator (`scripts/generar-manifiesto.py`):**
  * **Suite:** `tests/test_generar_manifiesto.unit.py` (16 unit tests).
  * **Ephemeral Execution:** `docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 pytest -q --import-mode=importlib --cov=scripts --cov-report=term-missing tests/test_generar_manifiesto.unit.py`
  * **Coverage Achieved:** **97%** (exceeding the non-negotiable `>= 95%` threshold).
  * **Validated Assertions:** SHA-256 hashing algorithm, `target_name` and `merge_strategy` categorization across all 10 stacks and `architecture/`, strict drift detection with `--check`, and CLI input hardening.

* **Universal QA 11X Skills Installer (`scripts/install-skill.sh`):**
  * **Test Suites:**
    * **Python Unit & Meta-QA:** `tests/*.unit.py` + `tests/meta_qa/` + `vibe-rescue/tests/` (**339 tests collected**, **99.19%** branch+line coverage with `ruff CC <= 5` and `mypy --strict`).
    * **BATS-core & ShellCheck (`sinfallas/base-bash-qa:latest`, rootless `--cap-drop=ALL --security-opt=no-new-privileges:true`):** `bash-scripts/test/ejemplo_mock.bats`, `tests/bats/{test_ci_make_escape,test_graphify_and_calm,test_install_skill,test_limpieza,test_pagespeed,test_repo_scripts}.bats` (**113 BATS tests**, normalized kcov, and ShellCheck with 0 warnings).
  * **Ephemeral Execution:**
    * `docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=.agents/scripts:vibe-rescue:. -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 pytest -q --import-mode=importlib --cov=.agents/scripts --cov-fail-under=95 tests/*.unit.py tests/meta_qa/test_*.py`
    * `docker run --rm --network none --cap-drop=ALL --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e _USER=qa -v "${PWD}:/repo:ro" -w /repo/bash-scripts sinfallas/base-bash-qa:latest bash -c "shellcheck -x ../scripts/*.sh ../.agents/scripts/*.sh ../*/limpieza.sh ../mcp-server/example/verify-v2.sh ../instalar-hooks.sh ./*.sh && bats test/*.bats ../tests/bats/*.bats"`
  * **Coverage & Metrics:** **100% assertions passed** (**113** BATS tests, **339** Python unit + Meta-QA + Vibe-Rescue tests at **99.19%**) and **0 errors / 0 warnings** in ShellCheck.
  * **Validated Assertions:** Smart auto-detection without polluting `$HOME/.agents`, target resolution (`workspace`, `antigravity`, `claude`, `cursor`, `windsurf`, `codex`, `hermes`, `all`), full catalog installation of all 11 modular skills (`qa-11x-architect`, `refactoring-ui`, `docker-trivy-keydb-hardening`, `graphify-ast-navigator`, `qa-11x-docker-certifier`, `qa-11x-devsecops-hardener`, `qa-11x-systematic-debugging`, `qa-11x-screenplay-builder`, `qa-11x-llm-evaluator`, `qa-11x-vibe-rescue`, `tactical-patterns-11x`) plus `.agents/schemas/`, SHA-256 verification against `manifest.json`, strict tampering detection (aborting with exit code 1 under DISA STIG `V-222513`), and `--help` flag check.

* **Node.js / TypeScript MCP Server & Skills Installer (`mcp-server/`):**
  * **Unit Test Suites:**
    * `tests/github-fetcher.unit.ts` (24 tests): Remote hydration, conditional `ETag` (304) validation, SHA-256 verification (`DISA STIG V-222513`), tampering detection, offline fallback, symlinked `cacheDir`/`$HOME/.cache` rejection, CSPRNG `wx` atomic writes, and local path override.
    * `tests/surgical-merger.unit.ts` (31 tests): Non-destructive surgical merging of `package.json`, `pyproject.toml`, `Makefile`, `.gitignore`, and `.npmrc`, `--max-warnings 0` injection, `0o755` script permissions, and `dryRun` mode.
    * `tests/inspect-project.unit.ts` (21 tests): Automatic detection of all 10 stacks (`python`, `fastapi`, `vue3`, `react-frontend`, `node-backend`, `php`, `bash-scripts`, `ai-evals`, `mobile-appium`, `vibe-rescue`), strict flags (`mypy`, `tsconfig`, `npmrc`), missing 11X files, and `update_available`.
    * `tests/tools-and-resources.unit.ts` (56 tests) + `tests/promptGuard.test.ts` + `tests/session-flight-recorder.unit.ts`: v1 base resources + 3 v2.0 + `blueprint://skills/tactical-patterns-11x` (`13` total in `blueprint://*`), 19 tools (`inspect_project_config`..`session_flight_recorder`), CLI `quickstart` / `install-skill` with global Thin-Repo auto-detection (`auto`), skills catalog, `--include-scripts`, and `McpServer`.
    * `tests/output-parsers.unit.ts` (33 tests): Token-saving parsers for coverage (Pytest, Vitest v8, Kcov), failed tests (Pytest, Vitest, BATS), linters and complexity (Radon, Mypy, Ruff, ESLint, multi-line/GCC ShellCheck), security alerts (Trivy, Bandit), mutation (Mutmut, Stryker), `tail_log`, and `parseQaOutput` condensation.
    * `tests/security-auditor.unit.ts` (46 tests): Static security auditing DISA ASD STIG V6R5 + OWASP v4.2 covering rules `SEC-01` through `SEC-16`, `QA-*`, and `UI-11X-01..03` (Mass Assignment, Anti-CSWSH, Command Injection, XXE, Unicode NFKC, XSS/`v-html`, Swagger in prod, OSHP headers, Zero-Trust NPM, Secret detection, Semantic Anti-UUID audit, Pre-Auth continuity, and Anti-JSDOM visual geometry).
    * `tests/ephemeral-runner.unit.ts` (27 tests): Execution of `qa-${stage}` targets in ephemeral Docker under Rule Zero with safe `execFile` (`shell: false`), timeout control (code 124), missing Makefile handling, safe ephemeral XML/LCOV report collection (`ensureCoverageCacheDir` / `harvestCoverageReports` in `.agents/.cache/coverage/` stripping `<!DOCTYPE coverage ...>` while preserving `<!ENTITY` Anti-XXE traps), and `DOCS_ONLY` Fast-Path (`isDocsOnlyWorkspaceChange` / `skipIfDocsOnly`).
    * `tests/findings-breaker.unit.ts` (6 tests): Line-shift-invariant fingerprint normalization, session isolation by `{branch}:{merge_base_sha}` and stage in `.agents/.cache/certify_state.json` (`0700`/`0600`), streak `>= 3` and `A -> B -> A` oscillation detection (`BREAKER_42`, `exit_code=42`), symlink/corrupt-JSON blocking, `formatFailVerboseReport` fallback alert in `runEphemeralQa`, and `--reset-state`.
    * `tests/diff-blast-radius.unit.ts` (14 tests): 4-level semantic pruning (`diff-bundle.ts`), collapsing hunks > 80 lines, `>= 60%` token savings, secret redaction via `promptGuard.ts`, AST dependent cross-referencing, `MISSING_KARATE_API_FEATURE` alert, `ACTIVE_TASK.md` boundaries, unsafe refs/paths rejection, and `inspect_ast_blast_radius` SDK contract preserving `19` Tools and `13` Resources.
    * `tests/certify-gate.unit.ts` (29 tests): Unified 11X certification gate checking `.example` files, secret scanning, JSON key collisions, orphan UI components, ORM vs Alembic parity, DISA/OWASP audit, and doc synchronization (`TESTING.md` and `CHANGELOG.md`).
    * `tests/test-pyramid-auditor.unit.ts` (36 tests): Static auditing of the 13 pyramid layers (`L01` to `L13`), trimodal evaluation (virgin 0%, partial brownfield, nominal 100%), gap inventory (`orphan_source_files`, `untested_api_endpoints`, `untested_ui_views`), 3-phase clock & dual-refresh detectors, and prioritized action plan generation with `make qa-*` targets and recommended blueprints.
    * `tests/init-agents-md.unit.ts` (19 tests): Non-destructive additive injector/updater for `AGENTS.md` and lightweight zero-duplication global connector `buildGlobalGeminiBlock` for `~/.gemini/GEMINI.md` (`Graphify AST-First` for Q&A and pre-change), testing creation from scratch with MIT header, appending after existing directives without altering prior lines, idempotent connector block updates (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`), `dryRun` simulation, CLI flag robustness (`--project-path`, `-p`, `--dry-run`), and `runInitAgentsCli`.
    * `tests/reconcile-agents.unit.ts` (29 tests): Automatic Thin-Repo reconciliation and `.agents/` deduplication, cleanup of duplicated canonical files and skills in consumer repos, business-rule extraction to `domain_<project>_rules.md`, backups in `.agents/backups/`, and idempotent `~/.gemini/GEMINI.md` synchronization.
    * `tests/edge-cases.unit.ts` (33 tests): Deep coverage of edge cases and extreme branches across services and tools.
    * `tests/prepush-ci-parity.unit.ts` (7 tests): Cryptographic `lint` evidence seal (`.agents/.qa-evidence.json`) in `certify_11x_gate`, `migration`/`integration`/`ci` stages, normalization of dynamic template strings (`` `/routers${query}` ``, `` `/bridge/${subPath}` ``, `{path:path}`), and `QA-MYPY-01`, `QA-PG17-RLS`, and `QA-COV-01` (`--import-mode=importlib`) invariants.
    * `tests/v2-18-i18n-agents.unit.ts` (10 tests): Language mode `--lang auto|es|en` (`QA_OUTPUT_LANG`), *Dynamic Language Mirroring*, global targets `codex` and `windsurf` with auto-detection, and bilingual CLI.
    * `tests/qa-health-dual-consumer.unit.ts` (28 tests): Static rule `QA-HEALTH-01` (`task.exception()` / `OPTIONAL_WORKERS` semantics in `asyncio` supervisors and physical `healthcheck` probe contracts in `Dockerfile`/`docker-compose*.yml` with `# qa-health-ok` exemption) plus 3-layer Dual-Consumer inference and matrix in `propose_skill_evolution_pr`.
    * `tests/version-manager.unit.ts` (8 tests / 45+ assertions): SemVer comparison, `.qa-11x-version` stamps (anchored confinement with/without `confinementRoot`), 24h TTL cached resolution (`latest-version-check.json`) with symlink rejection and offline *fail-open*, `update_available` field in `inspect_project_config` and `certify_11x_gate`, and symlink-confined background auto-sync of global skills via `SHA-256` preserving `~/.gemini/GEMINI.md` language.
    * **New CLI, Live Protocol, Mobile & Security Suites (remaining 24 of 44 Vitest suites):** `tests/audit-remediation-wave-c.unit.ts`, `tests/audit-hardening.unit.ts`, `tests/cli-certify-audit.unit.ts`, `tests/cli-doctor-upgrade.unit.ts`, `tests/cli-dx-tools.unit.ts`, `tests/live-mcp-protocol.test.ts` (live `InMemoryTransport` + `StdioClientTransport`), `tests/mobileBlueprint.test.ts`, `tests/path-real-resolver.unit.ts`, `tests/ide-config-paths.unit.ts`, `tests/v2-16-invariants.unit.ts`, `tests/a2a.test.ts`, `tests/agents27.test.ts`, `tests/aiTools.test.ts`, `tests/bootstrap-merge.unit.ts`, `tests/calm.test.ts`, `tests/diagnosticFormatter.test.ts`, `tests/fetch-bundle.unit.ts`, `tests/lifecycle_resilience.test.ts`, `tests/propose-evolution-pr.unit.ts`, `tests/quickstart.test.ts`, `tests/releaseGate.test.ts`, `tests/tmsSyncCli.test.ts`, `tests/vibeRescue.test.ts`, and `tests/workspace-path-validator.unit.ts`.
    * `example/run-example-e2e.mjs` + `example/verify-v2.sh` + `scripts/probar-mcp-example.sh` (Clean-Room live `stdio` + `.tgz` tarball E2E harness): Clones the repo without `node_modules` or `dist`, compiles and packs `dist/index.js` in ephemeral Docker, and connects an official MCP client (`StdioClientTransport`) against the clean tarball in `/tmp` and the temporary copy of `mcp-server/example/` (`FastAPI + Vue 3`), certifying without mocks all **13 `blueprint://*` resources**, **19 tools** (negative and clean cases), and all **12 CLI subcommands** (`quickstart`, `install-skill`, `init-agents`, `reconcile-agents`, `tms-sync`, `doctor`, `upgrade`, `certify`, `audit`, `blast-radius`, `mcp-config`, `completion`, `--version`, `QA-CLI-TTY-01`); automatically gates `publicar-mcp.sh`, CI, `pre-push`, and `make test-example`.
    * `mcp-server/test/mcp_cli_test.feature` (**52 Karate BDD scenarios**, including **Scenarios 50–52** CLI subcommands, `--git-signals` & shared IDE config contract): Contract/doc alignment for `doctor` (`status`), surgical `upgrade` (`cache-clean`), `certify` (`--strict` / `--release-gate`), `audit --sarif` (`security|pyramid|vibe|calm|all`), `blast-radius` (`--changed-since`, `--git-signals`), `mcp-config` (`--client <id> --install --pin-version`), `completion <fish|bash|zsh>`, and `--version --verbose|--json`.
  * **Ephemeral Execution (`mcp-server/Makefile`):**
    * `make -C mcp-server qa-lint`
    * `make -C mcp-server qa-typecheck`
    * `make -C mcp-server qa-unit`
    * `make -C mcp-server build`
    * `make -C mcp-server qa-example && make -C mcp-server qa-e2e` (or `./scripts/probar-mcp-example.sh`)
  * **Coverage & Metrics Achieved:**
    * **100% assertions passed** (**760** Vitest tests across **44 Vitest suites** + **52** Karate BDD scenarios including **Scenarios 50–52** CLI, `git-signals`, `.claude-plugin/` & IDE config contracts + **318** Python unit & Meta-QA tests + **28** Offline AI (4 live skipped) + **113** BATS + **21** Vibe-Rescue + live E2E over `stdio`).
    * **99.87% line/statement coverage and 97.32% branch coverage** (exceeding the `>= 95%` threshold).
    * **99.89% function coverage**.
    * **0 errors from ESLint (`--max-warnings 0`, `complexity <= 15`), SonarJS (Cognitive `<= 15`), and TypeScript (`strict: true`)**.

* **Universal Cleanup and Sanitization Script (`scripts/limpieza.sh`):**
  * **Test Suites:** `tests/test_stacks_hydration_smoke.unit.py` (isolated without `docker`), `tests/bats/test_limpieza.bats`, `mcp-server/tests/tools-and-resources.unit.ts`, `mcp-server/tests/v2-16-invariants.unit.ts`, and Scenario 27 of `mcp-server/test/mcp_cli_test.feature`.
  * **Script Quality Validation:** ShellCheck and `shfmt` in ephemeral container `sinfallas/base-bash-qa:latest` certifying **0 errors and 0 warnings** (exit code 0) across `scripts/limpieza.sh`, `scripts/probar-mcp-example.sh`, and all 10 canonical per-stack `limpieza.sh` scripts (`fastapi/`, `vue3/`, `react-frontend/`, `node-backend/`, `python/`, `php/`, `bash-scripts/`, `mobile-appium/`, `ai-evals/`, `vibe-rescue/`) alongside `architecture/` and `mcp-server/` (**12 matrix environments**).
  * **Validated Assertions in Ephemeral Docker:**
    * Ordered shutdown of ephemeral containers (all Compose profiles), networks, and orphan clean-room containers (`docker compose --profile "*" down -v --remove-orphans` + selective purge by `working_dir` label).
    * Eradication of test artifacts (`allure-results/`, `.deepeval/`, `.promptfoo/`, `.agents/.cache/coverage/`, `.agents/.cache/tmp/`, `.agents/artifacts/`, `release-readiness.*`, `cbom*.json`, `/tmp/qa-11x-last-failure.json`, `/tmp/qa11x-certify.*`, `qa_mcp_cleanroom_*`, `qa-11x-mcp-example-e2e-*`) and Docker `UID 0`/`10001`-locked files without `sudo` via pinned Alpine fallback.
    * Recursive sweep of OS/editor clutter (`.DS_Store`, `Thumbs.db`, `Desktop.ini`, `*.swp`, `*.bak`, `*.orig`, `*.rej`) and misplaced `./ACTIVE_TASK.md` in root, restoring ownership to `$(id -u):$(id -g)`.
    * Strict preservation on default cleanup of `.agents/ACTIVE_TASK.md`, `.agents/.cache/session_checkpoint.json`, `.agents/.cache/certify_state.json`, `mcp-server/dist`, `.qa-11x-version`, and `graphify-out/{GRAPH_REPORT.md,graph.html,graph.json,manifest.json}` (purging stale internal leftovers in `graphify-out/`).
    * Optional deep pruning via `--deep` or `--docker-prune` flags (including `.agents/{backups,proposals,.qa-evidence.json,.cache}` and `~/.cache/qa-11x-blueprints` cache).

* **Multi-Stack Differential Coverage Auditor (`.agents/scripts/verify_diff_coverage.py` / `make diff-cov`):**
  * **Suite:** `tests/test_verify_diff_coverage.unit.py` (23 unit tests in `sinfallas/base-python-uv:3.15`, **100.00%** line & branch coverage over `verify_diff_coverage.py`, `ruff C901 <= 5`, and `mypy --strict`).
  * **Validated Assertions:** Anti-XXE blocking (`<!DOCTYPE`/`<!ENTITY` -> `exit 12`), path traversal/out-of-workspace symlink containment and unsafe `--base-ref` guards, Cobertura XML parser (`<sources>`, `/app/` -> workspace) and LCOV parser (`BRDA`, report-stem rewriting e.g. `mcp-server.info`), Anti-Evasion blocking (`# pragma: no cov`+`er`, `// v8 ig`+`nore`, `/* c8 ig`+`nore */`, `@codeCoverageIg`+`nore` -> `exit 11`) with audited `QA11X-APPROVED-EXCLUSION(<reason>)` exemption, rejection of new production files missing reports (`SIN_REPORTE`, `exit 12`), and `DOCS_ONLY` Fast-Path (`exit 0`).
* **Deterministic Findings Memory & Anti-Loop Circuit Breaker (`.agents/scripts/track_findings_state.py`):**
  * **Suites:** `tests/test_track_findings_state.unit.py` (10 unit tests in `sinfallas/base-python-uv:3.15`, **100.00%** line/branch coverage, `ruff C901 <= 5`, and `mypy --strict`), `mcp-server/tests/findings-breaker.unit.ts`, and Scenario 35 of Karate Labs BDD (`mcp-server/test/mcp_cli_test.feature`).
  * **Validated Assertions:** Line-shift-invariant SHA-256 fingerprinting, session isolation by `{branch}:{merge_base_sha}` and stage in `.agents/.cache/certify_state.json` (`0700`/`0600`), 10-run retention cap, state machine `RESOLVED`/`PERSISTENT`/`REGRESSION_OSCILLATION`/`NEW`, `exit 42` trigger (`[BREAKER-42]`) on `consecutive_streak >= 3` or `A -> B -> A` oscillation, `certify_task_completion.sh` / `run_ephemeral_qa` integration, and `--reset-state`.
* **Executive PR Verdict Exporter (`.agents/scripts/generate_pr_verdict.py` / `make pr-verdict`):**
  * **Suites:** `tests/test_generate_pr_verdict.unit.py` (10 tests in `sinfallas/base-python-uv:3.15`, `100%` delta lines, `ruff C901 <= 5`, and `mypy --strict`) and Scenario 36 of Karate Labs BDD (`mcp-server/test/mcp_cli_test.feature`).
  * **Validated Assertions:** Zero-duplication consolidation over `release_readiness_gate.py`, `.agents/.qa-evidence.json`, `certify_state.json` (`BREAKER-42`), `verify_diff_coverage.py`, and AST dependents; risk classification `BAJO`/`MEDIO`/`ALTO`, verdicts `APTO PARA MERGE`/`BLOQUEADO`, emission of `.agents/artifacts/PR_VERDICT.md` + `pr_verdict_attestation.json` (`0600`) with canonical `SHA-256` and optional `HMAC-SHA256` (`QA11X_ATTESTATION_KEY`), Anti-XXE/traversal/symlink/divergence blocking with `exit 30`, and `make pr-verdict` target.
