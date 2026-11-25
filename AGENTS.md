# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 🤖 AI Agent Directives & Technical Governance — QA Testing Blueprints (Standard 11X)

All AI coding assistants and developers in this monorepo MUST enforce Level-11X governance defined here and in `.agents/rules/`.

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING (Spec 19):**
> Interact and reason in the **user's prompt language** (unless overridden via `--lang es|en`).
> Root/setup/MCP docs (`*.md` + `*.es.md`) keep **English Canonical + 1:1 Spanish Mirror** pairs (with `docs/specs/01..18_*.md` exempt in Spanish). `.agents/**` and `AGENTS.md` remain concise English (~35% BPE savings); script diagnostics remain Spanish.

---

## 1. Active Rules in `.agents/rules/`

1. [mandatory_qa_pyramid_and_doc_sync.md](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md): Mandatory 11X multi-layer tests (`>= 95%` coverage, zero-orphan UI, proportional Karate BDD with dynamic `Idempotency-Key`), `QA-TEST-SYNC-01` existing-test co-evolution, Anti-Silo live propagation, zero hardcoded pass stubs, and Spec 19 concise bilingual sync.
2. [secure_development_and_testing_guidelines.md](.agents/rules/secure_development_and_testing_guidelines.md): DISA ASD STIG V6R5 & OWASP v4.2 controls (PostgreSQL 17 RLS `NOBYPASSRLS` + `after_begin`, AES-256-GCM Vault, Service-Layer RBAC, deterministic WORM `seq_num` + `pg_advisory_xact_lock`, OSHP/SBOM, `COVERAGE_FILE=/tmp/.coverage`, non-root UID mapping, Anti-JSDOM geometry).
3. [frontend_parity_and_closure.md](.agents/rules/frontend_parity_and_closure.md): Terminal ↔ frontend parity, actionable tables, dual auto + manual refresh, per-item batch validation (`results[].status`), and clean ephemeral closure.
4. [continuous_agent_evolution.md](.agents/rules/continuous_agent_evolution.md): Autonomous 3-layer Dual-Consumer updates (`.agents/` + MCP auditors + bilingual human `docs/`), Thin-Repo consumer separation (never duplicate canonical rules/skills locally or in `domain_*_rules.md`), and Consumer Governance Fast-Path.
5. [anti_regression_and_side_effects_guardrail.md](.agents/rules/anti_regression_and_side_effects_guardrail.md): Graphify AST blast-radius pre/post audit (build via `./scripts/actualizar-grafos-graphify.sh` if missing), High-IQ Token Economy, and Objective Pre-Execution Critique (skip praise; verify non-trivial premises vs live repo before coding; never debate routine explicit commands).
6. [ground_truth_fixtures_and_negative_invariants.md](.agents/rules/ground_truth_fixtures_and_negative_invariants.md): Trimodal fixtures (Virgin / Nominal / Degraded), 3-phase clock tests, and `>= 180s` binary transfer timeouts.
7. [active_task_and_planning_resilience.md](.agents/rules/active_task_and_planning_resilience.md): `/plan` + atomic `.agents/scripts/checkpoint_ctl.py` / `session_flight_recorder` (`.agents/ACTIVE_TASK.md <= 40L`).
8. [git_closure_gate.md](.agents/rules/git_closure_gate.md): **`QA-GIT-GATE-01`** — conclude at certified local `git commit`; NEVER auto-`git push`, tag-push, or publish without explicit human approval.

---

## 2. Rule Zero: Ephemeral Docker Execution

**NEVER** execute tests, migrations, compilers, or linters directly on host OS (`Ubuntu`/`macOS`/`Windows`). Execute exclusively in non-root ephemeral Docker containers (`Makefile` / `docker-compose.qa.yml` / `run_ephemeral_qa`) **serialized 1 container at a time** (`QA_MAX_CONCURRENT_CONTAINERS=1`; no parallel subagent `/teamwork` `docker run` fan-out; pass `--rm --restart=no --network none` on offline commands; `QA-DOCKER-LOOP-01`).

---

## 3. Skills Catalog in `.agents/skills/` (11 Modular Skills)

1. `qa-11x-architect` (`<= 12 KB` + 10 references): Master pyramid (13 layers), 10 laws, 11 UAT rules, 22 STIG/OWASP controls, 37 static scanner rules, Token Economy + Objective Critique.
2. `qa-11x-docker-certifier`: Ephemeral Docker QA (`>= 95%` coverage, SonarJS, Karate, Stryker/Mutmut).
3. `docker-trivy-keydb-hardening`: Container hardening (Trivy HIGH/CRITICAL = 0), KeyDB, non-root runtime.
4. `graphify-ast-navigator`: Bidirectional AST Knowledge Graph navigation & layer boundary enforcement.
5. `refactoring-ui`: Visual hierarchy, OKLCH WCAG 2.1 AA contrast, dark mode, Anti-JSDOM layout (9 refs).
6. `qa-11x-devsecops-hardener`: PostgreSQL RLS, WORM hash-chains, FIPS crypto, mutating MCP approvals.
7. `qa-11x-systematic-debugging`: 4-phase root-cause debugging (`Rule Zero` -> AST -> single hypothesis -> RED-to-GREEN).
8. `qa-11x-screenplay-builder`: Screenplay Pattern, semantic ARIA locators, Anti-Silo & 3-phase clock E2E.
9. `qa-11x-llm-evaluator`: Offline CI deterministic contracts + live DeepEval/Promptfoo red-teaming.
10. `qa-11x-vibe-rescue`: 5-stage Vibe-to-Enterprise prototype rescue (`CC <= 5`, RLS, `>= 95%` coverage).
11. `tactical-patterns-11x` (`<= 2.5 KB`): JIT refactor patterns (`CC <= 5`, `SonarJS <= 15`, `max-params: 4`, `max-depth: 3`, Outbox).

---

## 4. Automation Scripts in `.agents/scripts/` (30 Gates & Utilities)

> **Surface Inventory:** `10` scripts in `scripts/`, `30` files in `.agents/scripts/` (`29` Python total incl. `scripts/generar-manifiesto.py`), `27` files in `tests/`.

`_budgets.py` (`8 KB` root `AGENTS.md` / `1.5 KB` connectors / `36 KB` rules cap), `_common.py` (shared ignore dirs, secret/leak patterns, atomic JSON/text writes, `safe.directory`), `checkpoint_ctl.py`, `certify_task_completion.sh` (10-stage gate + ephemeral session), `bump_version_11x.py`, `sync_governance.py`, `verify_roadmap_consistency.py`, `verify_docs_invariants.py` (+ `_docs_invariants_{config,counts,bilingual,catalogs}.py`), `verify_alembic_orm_parity.py`, `verify_zero_orphan_vue_components.py`, `verify_no_orphan_api_endpoints.py`, `verify_json_no_duplicate_keys.py`, `inspect_blast_radius.py`, `select_tests_by_blast_radius.py`, `verify_topological_health.py` (`.agents/boundaries.json`, `--metrics`), `verify_diff_coverage.py`, `track_findings_state.py` (`BREAKER-42`), `generate_pr_verdict.py`, `lint_test_antipatterns.py`, `lint_workflows.py`, `lint_docs_gate.py`, `normalize_kcov_cobertura.py`, `compact_context_11x.py`, `release_readiness_gate.py`, `audit_pagespeed_insights.py`, `validate_calm_architecture.sh`.

---

## 5. 3-Path Execution & 11-Step Closure Protocol

- **`DOCS_ONLY` (human `*.md`/`docs/` only; excludes `.agents/{skills,rules,schemas}/`):** Skip `run_ephemeral_qa` and AST rebuild; sync docs/`CHANGELOG.{md,es.md}`, run `make sync-governance` (when tracked) + `make lint-docs` + `./.agents/scripts/certify_task_completion.sh`, commit locally.
- **`MICRO_CHANGE` (`<= 3` files, 0 API/ORM, `LOW < 5` callers):** 3-line plan, `inspect_blast_radius.py`, co-evolve tests (`QA-TEST-SYNC-01`), run stack Docker QA, refresh stack AST, sync changelog, certify, commit locally.
- **`FULL_11X`:** (1) `/plan`; (2) `checkpoint_ctl.py` / `session_flight_recorder`; (3) pre-change `inspect_blast_radius.py`; (4) sync governance/cleanup/`.gitignore`; (5) create + co-evolve 11X & Karate tests (`QA-TEST-SYNC-01`); (6) run full ephemeral Docker lint/tests (`Rule Zero`, zero shortcuts); (7) sync bilingual docs/specs; (8) sync `CHANGELOG.{md,es.md}`; (9) `verify_roadmap_consistency.py`; (10) `./scripts/actualizar-grafos-graphify.sh`; (11) `./.agents/scripts/certify_task_completion.sh` (`10/10`), mark `CERTIFIED_CLEAN`, propose evolution (`propose_skill_evolution_pr`), local `git commit` (`QA-GIT-GATE-01`).
