> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](CONTRIBUTING.es.md)

# Contributing Guide (Human + AI Agents Hybrid Ecosystem)

Thank you for your interest in improving **QA Testing Blueprints**! This repository is the single source of truth for code quality, Security-by-Design, and corporate technical governance across our projects.

This ecosystem is designed to be developed, maintained, and extended by both **human software engineers** and **autonomous AI Coding Agents** (Google Antigravity, Anthropic Claude Code / Desktop, Nous Research Hermes Agent, Cursor, Windsurf). Every contribution must uphold Level-11X corporate quality directives.

---

## 📜 Golden Rules for Contributing (The 11X Standard)

To preserve consistency and effectiveness across these blueprints, every contribution (human or automated) must obey these principles:

1. **Immutable Base Images:** In consumer repositories and individual blueprints, never propose changes requiring a local `Dockerfile` or a `build:` directive inside `docker-compose.qa.yml` orchestrators. Everything must run exclusively using our official container fleet (and for new corporate stacks such as `mobile-appium`, formally plan and certify the dedicated image per [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md)):
   * `sinfallas/base-python-uv` (`3.11`, `3.12`, `3.13`, `3.14`, `3.15`, and `latest`) for Python/FastAPI, `ai-evals`, and `vibe-rescue`.
   * `sinfallas/base-node-ionic` (`22`, `24`, `26`, and `latest`) for Node.js/Vue 3/React, Promptfoo, `@finos/calm-cli`, and the MCP Server.
   * `sinfallas/base-mobile-appium` (`26` and `latest`) for Native & Hybrid Mobile W3C Bridge (`mobile-appium/`: Node.js 26, `pnpm`, OpenJDK 21, Android SDK/ADB, Appium 3, `uiautomator2`, `xcuitest`, WebdriverIO v9).
   * `sinfallas/basephpcomposer` (`8.2`, `8.3`, `8.4`, `8.5`, and `latest`) for PHP.
   * `sinfallas/base-bash-qa` (digest-pinned `@sha256:2d1f579e...`) for Bash/DevOps.
   * `sinfallas/karatelabs:1.5.1` for BDD/Black-Box contracts.
   * `sinfallas/remote-graphify` (digest-pinned `@sha256:08aa6a6f...`) for AI Context Optimization (CLI-first AST analysis).
   * *Note: Official third-party images are permitted strictly for peripheral sidecars (e.g. `prom/prometheus:v2.55.1`, `zaproxy/zap-stable:2.15.0`, `postgres:17-alpine`, `eqalpha/keydb@sha256:6537505c42355ca1f571276bddf83f5b750f760f07b2a185a676481791e388ac` (`v6.3.4` multi-arch), `mcr.microsoft.com/playwright:v1.52.0-noble`).*
   * **NON-ROOT UID & CACHE RULE:** When adding an image depending on a package manager (`uv`, `pnpm`, `composer`), you MUST declare named volumes compatible with any non-root host/CI UID (`-u "$(id -u):$(id -g)"`): e.g. `/tmp/uv-cache` with `UV_CACHE_DIR=/tmp/uv-cache` and `COVERAGE_FILE=/tmp/.coverage` in Python, or `pnpm-store:/pnpm` initialized by `pnpm-store-init` (`chmod -R a+rwX /pnpm`) alongside `HOME=/tmp` and `pnpm_config_store_dir=/pnpm/store` in `sinfallas/base-node-ionic:26` / `sinfallas/base-mobile-appium:26` (`uid=10001`).

2. **Absolute Ephemerality & `Rule Zero`:** All test suites, linters, and validation scripts must execute inside ephemeral containers (`--rm`). Never execute tests directly on the host machine. Unit tests must never access the internet; mocking (`nock`, `pytest-mock`) is mandatory. For persistence and database schemas, **Anti-Mock Blindness** applies (mandatory verification against a real ephemeral database).
3. **Imperative Prompts & Bilingual Architecture (`Spec 19`):**
   * Internal LLM directives in `.agents/rules/` and `.agents/skills/` are written in **concise, high-density technical English** to save ~35% of BPE context tokens.
   * Root governance, onboarding, setup docs, stack READMEs (`<stack>/README.{md,es.md}`), `architecture/`, `docs/specs/{README,19,20}*.{md,es.md}`, and deep operational manuals (`docs/01..05*.{md,es.md}`) follow the **English Canonical (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** convention ([`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md), Phases A–D completed; only historical ADRs `01..18` remain in Spanish per Rule 4).
4. **Non-Negotiable Quality & Technical Debt Thresholds:**
   * Unit code coverage **>= 95%** across lines and branches.
   * Cyclomatic Complexity Grade **A** (`CC <= 5`, `MI >= A`).
   * Web accessibility WCAG 2.1 AA (0 `@axe-core` violations) and Lighthouse performance score **>= 90**.
   * Strict compliance with **DISA ASD STIG V6R5** and **OWASP Developer Guide v4.2** documented in [`SECURITY.md`](SECURITY.md) and [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md).
5. **Strict IPv4:** All network configurations in `docker-compose.qa.yml` must use the standard IPv4 `bridge` driver exclusively. Enabling `enable_ipv6: true` is prohibited to avoid routing and NAT conflicts.

---

## 🤖 Mandatory Protocol for AI Coding Agents

If you are an **AI Agent** (or a human engineer collaborating with one) contributing to this repository, you MUST unconditionally follow this lifecycle:

1. **Read Directives:** Read `.agents/rules/` and `AGENTS.md` before proposing any change.
2. **Active Task Log:** Track task phases atomically via `.agents/scripts/checkpoint_ctl.py` / MCP `session_flight_recorder` (`0600` `.agents/.cache/session_checkpoint.json` -> deterministic `<= 40`-line `.agents/ACTIVE_TASK.md` projection + live Git cross-check, never editing `ACTIVE_TASK.md` manually).
3. **Preventive AST Inspection (*Rule Zero*):** Audit the blast radius of shared symbols inside an ephemeral read-only container (`docker run --rm --restart=no --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "${PWD}:/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/inspect_blast_radius.py "<symbol>"`) before modifying code.
4. **Mandatory Test Pyramid:** All new or modified code must include matching unit tests (`>= 95%`) and Karate Labs BDD scenarios (`api_test.feature` and `ui_business_flow.feature`), updating affected pre-existing tests (`QA-TEST-SYNC-01`).
5. **Universal Certification Gate (10/10):** Run `./.agents/scripts/certify_task_completion.sh` and ensure all **10 stages** pass cleanly (including `bump_version_11x.py --check` and `sync_governance.py --check`) before concluding in a certified local `git commit` (`QA-GIT-GATE-01`).
6. **Cryptographic Manifest Sync:** Whenever adding or modifying templates or common files, regenerate `manifest.json` with `make sync-governance` and verify via `make version-check`.

---

## 📦 Blueprint `.example` File Convention (3 Categories)

All files inside the 10 stack directories follow a strict 3-category convention separating repository QA infrastructure from hydratable consumer project templates (`sync_governance.py` / `manifest.json`):

1. **Category 1 (No `.example` — Root QA Infrastructure):** `docker-compose.qa.yml` (`copy_if_missing_or_update_qa`) and `limpieza.sh` (`overwrite_executable`) across all 10 stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`, `mobile-appium`, `ai-evals`, `vibe-rescue`). Executed directly inside this repository under Rule Zero and copied/updated directly in target projects.
2. **Category 2 (No `.example` — Direct Executable Rule Zero Suites / Runtime Assets):** `tests/**`, `test/*.feature`, `test/*.bats`, `e2e/*.ts`, `mobile-appium/wdio.conf.ts`, `vibe-rescue/audit_vibe_prototype.py`, `vibe-rescue/templates/rls_hardening.sql`, `ai-evals/**/*.py`, and `ai-evals/promptfooconfig.yaml`. Directly runnable without renaming.
3. **Category 3 (With `.example` — Merge/Copy Root Project Configs & Sample App Templates):** `Makefile.example`, `package.json.example`, `pyproject.toml.example`, `tsconfig.json.example`, `vite.config.ts.example`, `vitest.config.ts.example`, `playwright.config.ts.example`, `gitignore.example` (hydrates to `.gitignore`), `php.ini.example`, `nginx/default.conf.example`, `fastapi/initdb/01-init-rls-role.sql.example`, and `fastapi/tests/test_production_no_dev_cleanliness.unit.py.example`. Stripped of `.example` when hydrated into target projects via `surgical_merge`, `append_missing_lines`, or `copy_if_missing`.

---

## 🛠️ How to Propose a Change

### When adding a technical tool or modifying a stack
1. Fork the repository, create a descriptive branch (`git checkout -b feature/add-k6-stresstest`), and **immediately install local security hooks** by running `./instalar-hooks.sh` in your terminal.
2. Update the template configuration (`pyproject.toml.example`, `package.json.example`, etc.) and `docker-compose.qa.yml` only if strictly necessary. *(Note: When adding profilers such as `py-spy` or `clinic.js`, include `cap_add: - SYS_PTRACE` and `security_opt: - seccomp:unconfined`)*.
3. Update the corresponding documentation in `docs/`, `TESTING.md` / `TESTING.es.md`, and `Makefiles` documenting exact execution commands.
4. Before committing or opening a Pull Request, run `./scripts/limpieza.sh` and certify the complete suite with `./.agents/scripts/certify_task_completion.sh` locally (**10/10 gates green**).

### When improving Documentation, MCP, or Skills
1. When updating the MCP server (`mcp-server/`), verify everything inside ephemeral Docker (`Rule Zero`): run `make lint`, `make test-mcp`, and `make -C mcp-server qa-all` (`>= 95%` coverage, `0` ESLint/SonarJS warnings, strict TS).
2. When updating any of the 12 modular skills in `.agents/skills/`, keep within cognitive budgets (`qa-11x-architect/SKILL.md <= 12 KB`, `tactical-patterns-11x/SKILL.md <= 2.5 KB`, others `< 20 KB`), update `catalogs/skillsllm-manifest.json`, and synchronize `docs/specs/`.
3. Maintain the "zero complacency" philosophy and keep bilingual pairs (`*.md` + `*.es.md`) in exact 1:1 structural parity.

### Commit Message Convention (Single Source of Truth)
* [`lefthook.yml`](lefthook.yml) (`commit-msg` hook, mirrored in POSIX by [`instalar-hooks.sh`](instalar-hooks.sh) without Node.js dependencies) is the **single source of truth** for commit header validation.
* Every commit subject line must follow Conventional Commits with a **`<= 100` characters** total header length matching:
  `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(\([a-z0-9._/-]+\))?!?: .{1,100}$`
* Scopes must use lowercase alphanumeric characters (`[a-z0-9._/-]+`); standard Git `Merge ` and `Revert "..."` headers are accepted automatically.

### Pull Request (PR)
Open a PR detailing:
* **Which technology, document, MCP tool, or skill are you modifying?**
* **Which quality, security, or governance gap does it resolve?**
* **Evidence:** Attach terminal output demonstrating that `./.agents/scripts/certify_task_completion.sh` passed cleanly (10/10 stages) and that all tests execute inside ephemeral Docker without root privileges on the host.
