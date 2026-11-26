# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Mandatory Directive: QA 11X Pyramid & Continuous Documentation Sync

> **SCOPE:** Applies to all AI agents and human developers. Follow Spec 19 language mirroring (respond in prompt language unless `--lang es|en`; EN canonical `*.md` + 1:1 ES mirror `*.es.md`; `.agents/**` concise English).

## 1. Mandatory 11X Test Creation & Co-Evolution (`QA-TEST-SYNC-01`)

Any change in source code, MCP tools, scripts, catalogs, or `.agents/{skills,rules,schemas}/` MUST create and synchronize tests across all applicable 11X layers:

1. **Unit Layer (`>= 95.0%` line/branch):** Pytest, Vitest v8, Pest/PHPUnit, BATS+kcov, or `node --test`. Strict network/IO isolation (zero outbound calls).
   - **`QA-COV-01` & `QA-MYPY-01`:** Never pass `-o addopts=""` to `pytest` without `--import-mode=importlib --cov=src --cov-fail-under=95`, `-e COVERAGE_FILE=/tmp/.coverage`, and `-e PYTHONPATH=/app/src`. When `pyproject.toml` defines `[tool.mypy]`, chain `mypy --strict --cache-dir=/tmp/mypy src/` with `ruff check` and `ruff format --check`.
2. **DB & Migration Parity:** Generate and validate migrations against a real ephemeral DB container (`.agents/scripts/verify_alembic_orm_parity.py` / `doctrine:schema:validate`); zero schema drift.
3. **Contract Integration & Cross-Module Invariants:** Validate live HTTP payloads and persistence against ephemeral API/DB instances. Enforce Anti-Silo cross-module propagation, 3-phase temporal assertions, `>= 180s` heavy-transfer timeouts with `0-byte` purge, per-item `results[].status` batch checks, and `SEC-16` continuous pre-auth KeyDB/Redis flows (canonical details in `ground_truth_fixtures_and_negative_invariants.md` & `secure_development_and_testing_guidelines.md`).
4. **Proportional API / Acceptance BDD:**
   - **`FULL_11X` Multi-Service:** Karate Labs BDD (`sinfallas/karatelabs:1.5.1`) with dynamic `Idempotency-Key` UUIDs per mutating call is mandatory for multi-service, stateful, or full-stack UI+API contracts.
   - **Lightweight / CLI / Library Modules:** Pure libraries, CLI/MCP tools, or `<= 3`-endpoint stacks (`python/`, `bash-scripts/`, `ai-evals/`, `mobile-appium/`, `vibe-rescue/`) may certify contracts with JVM-free ephemeral runners (`pytest+httpx/pact`, `bats`, `vitest`/Playwright/WDIO) preserving Rule Zero and `>= 95%` coverage.
5. **Zero-Orphan UI Components:** Every `.vue`/`.tsx`/`.jsx` component MUST have dedicated unit test coverage (`.agents/scripts/verify_zero_orphan_vue_components.py`).
6. **Mutation Testing:** Kill logical mutations (`MSI >= 80%`) via Mutmut, Stryker, or Infection.
7. **Zero-Warning Static Analysis:** Enforce `--max-warnings 0` (ESLint) and strict modes (Ruff `CC <= 5`, Mypy strict, PHPStan `level: max`, Psalm `--taint-analysis`, ShellCheck). Load `tactical-patterns-11x` on demand for complexity/concurrency refactors.
8. **Zero Hardcoded Pass Stubs:** Quality gates, runners, and auditors MUST NEVER return hardcoded `true`/`PASSED` without executing real verification. Return explicit `SKIPPED` (`detected: false`) when not applicable.
9. **Existing Test Co-Evolution (`QA-TEST-SYNC-01`):** Trace impacted tests before/after changes via `inspect_blast_radius.py` and targeted searches across `tests/`, `test/`, `*.feature`, `*.bats`. Sync legitimate inventory/contract shifts without deleting or weakening valid regression tests, and re-run every affected suite (including `test-karate` when `mcp-server/`, `.agents/skills/`, or `manifest.json` changes) inside Docker before committing.
10. **Differential Coverage, TDD `RED -> GREEN` & Fresh `lint`+`unit` Evidence:** Productive deltas require `100%` line and `>= 90%` branch coverage (`verify_diff_coverage.py`). Verify new tests fail first (`run_ephemeral_qa` `expect_red: true`, exempt from `BREAKER-42`) before implementing fixes, and ensure fresh `lint` + `unit` stamps match the dirty tree before `certify_11x_gate`. Unapproved `# pragma: no cover` / `v8 ignore` / `@codeCoverageIgnore` fail (`exit 11`) without `QA11X-APPROVED-EXCLUSION(<reason>)`; missing reports, XXE (`<!DOCTYPE`/`<!ENTITY`), or traversal abort (`exit 12`).

## 2. Rule Zero & 3-Path Execution (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`)

- **Rule Zero:** NEVER run tests, migrations, linters, or builds directly on the host OS. Unless delegated to a user-configured Companion MCP (`playwright`, `chrome-devtools`, `semgrep`, `serena`, `sonarqube`, `snyk`, `trivy`), execute exclusively inside non-root ephemeral Docker containers (`Makefile`, `docker-compose.qa.yml`, `run_ephemeral_qa`) serialized 1 container at a time (`QA_MAX_CONCURRENT_CONTAINERS=1`, `COMPOSE_PARALLEL_LIMIT=1`, `--rm --restart=no`, `QA-DOCKER-LOOP-01`). Offline QA/lint/unit/AST containers MUST pass `--network none`; dependency hydration uses frozen lockfiles (`uv sync --frozen` / `pnpm install --frozen-lockfile --prefer-offline`, adding `--offline` when `QA_OFFLINE=1`).
- **`DOCS_ONLY`** (human `*.{md,es.md}` / `docs/` only; excludes `.agents/{skills,rules,schemas}/`): Skip Docker test suites and AST rebuilds; run `make sync-governance` (if manifest-tracked), `make lint-docs`, and `./.agents/scripts/certify_task_completion.sh`, then commit locally (`QA-GIT-GATE-01`).
- **`MICRO_CHANGE`** (`<= 3` files, `0` API/ORM changes, `LOW < 5` AST callers): 3-line inline plan, `inspect_blast_radius.py`, co-evolve tests (`QA-TEST-SYNC-01`), run stack Docker QA, refresh stack AST, sync `CHANGELOG.{md,es.md}`, run `certify_task_completion.sh`, commit locally (`QA-GIT-GATE-01`).
- **`FULL_11X`** (`> 3` files, new routes/views, ORM/migrations, security, or `MEDIUM`/`HIGH`/`CRITICAL` blast radius): Full 11-step protocol (`/plan`, `checkpoint_ctl.py` / `session_flight_recorder`, full Docker pyramid, bilingual docs/specs/CHANGELOG/TESTING/ROADMAP sync, AST refresh, 10/10 certification, `CERTIFIED_CLEAN`, local commit under `QA-GIT-GATE-01`).
- **Production `--no-dev` Cleanliness:** `src/` MUST never import dev-only dependencies (`pytest`, `radon`, `mutmut`).

## 3. Continuous Documentation, Manifest & Closure Sync

After every code change, autonomously synchronize:
1. **Bilingual Docs & Specs:** Update affected EN canonical (`*.md`) + 1:1 ES mirror (`*.es.md`) manuals (`docs/*.{md,es.md}`, `docs/specs/{README,19+}.{md,es.md}`; historical `01..18_*.md` remain Spanish per Spec 19 §3.4).
2. **`CHANGELOG.{md,es.md}`:** Always add concise 1–2 line bullets under a single `## [Unreleased]` header before local commit (no duplicate version headers or verbose sub-task dumps; honor `starter` opt-out if absent and `declined`, always audit if physically present).
3. **`TESTING.{md,es.md}` & `ROADMAP.{md,es.md}`:** Sync `TESTING.md` whenever test counts, coverage, or QA commands change; in `ROADMAP.md`, check `[x]` and recalculate `%`/status for milestone-linked tasks (propose a new milestone item on `FULL_11X`, never pollute with micro-fixes), honoring `legacy_preserved` when declared in `.qa-11x.json` (`verify_roadmap_consistency.py`).
4. **Zero-LLM Governance Sync:** Run `make sync-governance` (`sync_governance.py`) to compute SHA-256 digests, sizes, and budgets in `manifest.json` deterministically.
5. **AST Refresh, 10/10 Gate & Local Commit (`QA-GIT-GATE-01`):** Run `./scripts/actualizar-grafos-graphify.sh`, verify `./.agents/scripts/certify_task_completion.sh` passes (`exit 0`), then record a local `git commit` (NEVER auto-`git push`).
