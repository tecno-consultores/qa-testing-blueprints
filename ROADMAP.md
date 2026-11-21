# 🗺️ Master Roadmap (ROADMAP.md) — Zero-Clone Ecosystem: Skill + MCP Server (Standard 11X)

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](ROADMAP.es.md)

**Project:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Target Architecture:** Zero-Clone Distribution in Node.js (`npx -y @sinfallas/mcp-qa-11x@latest`) + Cognitive Skill (`qa-11x-architect`) + On-Demand Hydration from GitHub with SHA-256 Verification (`manifest.json`)  
**Target Executor Model:** Frontier Coding Model (Gemini / Claude / Antigravity)

> **EXECUTION DIRECTIVE FOR AI AGENTS (Frontier Coding Model (Gemini / Claude / Antigravity)):**
> 1. Always read the associated technical specification in `docs/specs/` before starting each Milestone.
> 2. Strictly enforce **Rule Zero**: all code checks, linters, and unit/BDD tests MUST run inside ephemeral Docker containers (`sinfallas/*`).
> 3. Upon completing each subtask or Milestone, check `[x]` in `ROADMAP.md` (and `ROADMAP.es.md`), update `CHANGELOG.{md,es.md}` and `TESTING.{md,es.md}`, and run `./.agents/scripts/certify_task_completion.sh`.

---

## 📊 Milestone Status Summary

| Milestone | Milestone Name | Associated Specification | Status | Progress |
| :--- | :--- | :--- | :---: | :---: |
| **Milestone 1** | Design Specifications (`docs/specs/`) and Planning (`ROADMAP.md`) | `01_SPEC` to `05_SPEC` | ✅ Completed | `100%` |
| **Milestone 2** | Cryptographic Manifest (`manifest.json`) and Automatic SHA-256 Generator | [`01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) | ✅ Completed | `100%` |
| **Milestone 3** | Master Skill (`qa-11x-architect`), Progressive Disclosure (`references/`) & `curl` Installer | [`02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) | ✅ Completed | `100%` |
| **Milestone 4** | Node.js / TS MCP Server (`mcp-server/`) — Core, Resources, and Tools 1–4 | [`03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) | ✅ Completed | `100%` |
| **Milestone 5** | Token-Saving Parsers, DISA STIG / OWASP Auditor, and Tools 5–7 | [`04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) | ✅ Completed | `100%` |
| **Milestone 6** | 11X Tests (`>= 95%`), npm Packaging (`npx`), and Autonomous Sovereign Publishing | [`05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) | ✅ Completed | `100%` |
| **Milestone 7** | 11X Test Pyramid Gap Auditor (`audit_test_pyramid_gaps`) and Rescue Playbook | [`06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md) | ✅ Completed | `100%` |
| **Milestone 8** | Agent Auto-Detection in `install-skill`, 5 Skills + Scripts Install, and CDN Resilience | [`07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md) | ✅ Completed | `100%` |
| **Milestone 9** | Non-Destructive Additive `AGENTS.md` Connector Injector (`init-agents` / `init_or_append_agents_md`) | [`08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md) | ✅ Completed | `100%` |
| **Milestone 10** | Assisted Browser Diagnostics (Playwright / Browser MCP) & Zero-Trust Evolution PRs (`propose_skill_evolution_pr`) | [`09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md) | ✅ Completed | `100%` |
| **Milestone 11** | Official PHP 8.2–8.5 Blueprint (`sinfallas/basephpcomposer`) and MCP Server Integration | [`10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md) | ✅ Completed | `100%` |
| **Milestone 12** | Automated Auditors for Anti-Silo Invariant, 3-Phase Clock Cycle, Semantic Anti-UUID Audit & Dual Refresh | [`11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md) | ✅ Completed | `100%` |
| **Milestone 13** | Automated Reconciliation, Deduplication, and Domain Rule Isolation in `.agents/` (`reconcile-agents` / `reconcile_agents_governance`) | [`12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md) | ✅ Completed | `100%` |
| **Milestone 14** | Extreme Token Optimization in MCP Server, 3-Path Proportional Execution (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), Progressive Disclosure & Cognitive Economy | [`13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md) | ✅ Completed | `100%` |
| **Milestone 15** | Comprehensive `v2.16.0` Hardening of all 7 Corporate Stacks, Thin-Repo Contract, POSIX Rule-Zero Hooks & 10/10 Gate Convergence | [`TESTING.md`](TESTING.md) + [`SECURITY.md`](SECURITY.md) | ✅ Completed | `100%` |
| **Milestone 16** | Multi-Stage Pre-Auth Anti-Silo Invariant (`SEC-16`), `SKILL.md < 20 KB` Cognitive Budget & Deterministic Doc Verifier (`verify_docs_invariants.py`) | [`SECURITY.md`](SECURITY.md) §4.20 + `02-security-disa-owasp-22.md` | ✅ Completed | `100%` |
| **Milestone 17** | 1:1 Pre-Push CI Parity (`v2.17.0`) in `qa-11x` MCP: `lint` Evidence Seal, `integration`/`ci` Stages, Dynamic Endpoint Parser & Python/PG 17 Invariants (`QA-MYPY-01`, `QA-PG17-RLS`, `importlib`) | `03-stack-python-fastapi.md` + `08-postgres-rls-zero-downtime-migrations.md` | ✅ Completed | `100%` |
| **Milestone 18** | `v2.18.0` Internationalization: Dynamic Language Mirroring, `--lang (auto/es/en)` Flag, `codex`/`windsurf` Targets & Multi-Agent EN/ES Guides | [`docs/agent-setup.md`](docs/agent-setup.md) + [`docs/agent-setup.es.md`](docs/agent-setup.es.md) | ✅ Completed | `100%` |
| **Milestone 19** | Anti-Silo Invariant #9 (`QA-HEALTH-01`), 1:1 Human Manual Leveling (`docs/02` & `docs/04`) & Dual-Consumer Governance in `propose_skill_evolution_pr` and `verify_docs_invariants.py` | [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md) + `SECURITY.md` §4.22 | ✅ Completed | `100%` |
| **Milestone 20** | Redundancy-Free Version Detection (`.qa-11x-version` + 24h Fail-Open TTL), `update_available` Tool Notice & Global SHA-256 Skills Auto-Sync (`v2.20.0`) | [`docs/ai-integration.md`](docs/ai-integration.md) + [`docs/agent-setup.md`](docs/agent-setup.md) | ✅ Completed | `100%` |
| **Milestone 21** | Multi-Stack Differential Coverage (`verify_diff_coverage.py`), Ephemeral Report Persistence & Anti-Evasion Block | [`16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md) | ✅ Completed | `100%` |
| **Milestone 22** | Deterministic Findings Memory & Anti-Loop Circuit Breaker (`exit 42`) in `run_ephemeral_qa` and `certify` | [`17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md) | ✅ Completed | `100%` |
| **Milestone 23** | Differential Mode in `inspect_ast_blast_radius` (Zero MCP Bloat) & Executive `PR_VERDICT.md` Exporter | [`18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md) | ✅ Completed | `100%` |
| **Milestone 24** | Comprehensive `QA-11X v3.0` Audit (`v3.0.0`), `bump_version_11x.py` Synchronizer, Live MCP Protocol & `19_SPEC` / `20_SPEC` Planning | [`19_SPEC`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) + [`20_SPEC`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) | ✅ Completed | `100%` |
| **Milestone 25** | 15×12 Matrix, `sinfallas/base-mobile-appium:26` & Bilingual Documentation Architecture | [`19_SPEC`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) + [`20_SPEC`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) | ✅ Completed | `100%` |
| **Milestone 26** | `QA-11X v3.1` (`3.1.0`) — Atomic Flight Recorder, `tactical-patterns-11x`, 10-Stack Hydration & Fail-Closed Hardening | [`AGENTS.md`](AGENTS.md) + [`TESTING.md`](TESTING.md) | ✅ Completed | `100%` |
| **Milestone 27** | `v3.2.0` (`QA-11X v3.2`) — 99/99 Forensic Audit Remediation, 12 CLI Subcommands, MCP 2026 Annotations, A2A v1.0 & 100% Diff Coverage | [`CHANGELOG.md`](CHANGELOG.md) + [`TESTING.md`](TESTING.md) | ✅ Completed | `100%` |

---

## ✅ Milestone 1: Design Specifications (`docs/specs/`) and Planning (`ROADMAP.md`)
**Reference:** [`docs/specs/`](docs/specs/)
- [x] **1.1.** Create [`docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) defining the Zero-Clone flow, exact `manifest.json` schema, and SHA-256 verified cache algorithm.
- [x] **1.2.** Create [`docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) defining `.agents/skills/qa-11x-architect/`, its 5 `references/` files in compact technical English, and the universal installer.
- [x] **1.3.** Create [`docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) defining the Node.js/TypeScript architecture of `mcp-server/`, `package.json`, the 4 core Resources, and Tools 1–4.
- [x] **1.4.** Create [`docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) defining Tools 5–7 (`audit_security_stig_owasp`, `run_ephemeral_qa`, `certify_11x_gate`) and token-saving parsers.
- [x] **1.5.** Create [`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) with step-by-step npm publishing and SLSA Provenance automation guidance.
- [x] **1.6.** Create this `ROADMAP.md` file and link it from `README.md`.

---

## ✅ Milestone 2: Cryptographic Manifest (`manifest.json`) and Automatic SHA-256 Generator
**Mandatory Reference:** [`docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md)

### Implementation Tasks:
- [x] **2.1.** Create `scripts/generar-manifiesto.py` (Python 3.12+ using stdlib only: `hashlib`, `json`, `pathlib`, `datetime`, `argparse`) scanning the 6 initial stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`), `common_files`, and `agent_governance_files`, calculating byte sizes, `merge_strategy`, `target_name`, and `sha256` hashes.
- [x] **2.2.** Support `--check` in `scripts/generar-manifiesto.py` to verify whether `/manifest.json` matches current repository hashes (returning exit code `0` when synced or `1` on drift).
- [x] **2.3.** Generate `/manifest.json` at repository root by running `scripts/generar-manifiesto.py`.
- [x] **2.4.** Integrate `python3 scripts/generar-manifiesto.py --check` as a gate stage inside `.agents/scripts/certify_task_completion.sh`.
- [x] **2.5.** Add unit tests for the manifest generator and certify via `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 3: Master Skill (`qa-11x-architect`), Progressive Disclosure (`references/`) & `curl` Installer
**Mandatory Reference:** [`docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](docs/specs/02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md)

### Implementation Tasks:
- [x] **3.1.** Create `.agents/skills/qa-11x-architect/SKILL.md` (in high-density technical English with `OUTPUT LANGUAGE CONSTRAINT: Spanish`) covering environment detection (MCP-First vs. GitHub Raw hydration fallback), the 10 Non-Negotiable 11X Laws, and 4 Operational Playbooks.
- [x] **3.2.** Create `.agents/skills/qa-11x-architect/references/01-core-13-layers.md` with the executable 13-layer matrix, Anti-Mock Blindness, Anti-JSDOM, and Trimodal Fixtures.
- [x] **3.3.** Create `.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md` condensing all 22 DISA ASD STIG V6R5 + OWASP Developer Guide v4.2 security patterns.
- [x] **3.4.** Create `.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md` with exact rules and commands for Python standalone and FastAPI (PostgreSQL 17 + KeyDB + Alembic + Karate API).
- [x] **3.5.** Create `.agents/skills/qa-11x-architect/references/04-stack-node-vue-react.md` with rules and commands for Node.js, Vue 3, and React (Zero-Trust `.npmrc`, Vitest, Playwright + Axe WCAG 2.1 AA, Lighthouse CI, Karate UI).
- [x] **3.6.** Create `.agents/skills/qa-11x-architect/references/05-stack-bash-devops.md` with Bash/Shell rules (`ShellCheck`, `shfmt`, `BATS-core`, `bats-mock`, `kcov >= 95%`, `Pushgateway`).
- [x] **3.7.** Create universal installer `scripts/install-skill.sh` (POSIX `sh` compatible, audited with 0 `ShellCheck` errors) downloading `qa-11x-architect` and `refactoring-ui` from GitHub, verifying SHA-256 hashes against `manifest.json`, and installing into Antigravity, Claude, Cursor, or the current project.
- [x] **3.8.** Update `/manifest.json` via `python3 scripts/generar-manifiesto.py` to index `qa-11x-architect`, `refactoring-ui`, and `scripts/install-skill.sh`.

---

## ✅ Milestone 4: Node.js / TS MCP Server (`mcp-server/`) — Core, Resources, and Tools 1–4
**Mandatory Reference:** [`docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](docs/specs/03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md)

### Implementation Tasks:
- [x] **4.1.** Scaffold `mcp-server/`: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.json`, `.npmrc` (`ignore-scripts=true`), `docker-compose.qa.yml` (using `sinfallas/base-node-ionic:26`), and `Makefile`.
- [x] **4.2.** Implement `mcp-server/src/services/github-fetcher.ts`: on-demand download from GitHub Raw (`manifest.json` and per-stack files), cache in `~/.cache/qa-11x-blueprints/`, `ETag` (`If-None-Match`) support, SHA-256 verification (`DISA V-222513`), offline fallback, and `QA_BLUEPRINTS_LOCAL_PATH` support.
- [x] **4.3.** Implement `mcp-server/src/services/surgical-merger.ts`: deterministic non-destructive surgical merge algorithm for `package.json`, `pyproject.toml`, `Makefile`, `.gitignore`, and `.npmrc`.
- [x] **4.4.** Implement `mcp-server/src/resources/blueprint-resources.ts` exposing `blueprint://manifest`, `blueprint://core/philosophy`, `blueprint://security/disa-owasp-22`, `blueprint://{stack}/readme`, `blueprint://ui/refactoring-ui/{topic}`, `blueprint://core/active-task-template`, and `blueprint://core/cleanup-script`.
- [x] **4.5.** Implement Tools in `mcp-server/src/tools/`:
  - `inspect-project.ts` (`inspect_project_config`)
  - `fetch-bundle.ts` (`fetch_blueprint_bundle`)
  - `bootstrap-merge.ts` (`bootstrap_or_merge_11x`)
  - `blast-radius.ts` (`inspect_ast_blast_radius`)
  - `clean-workspace.ts` (`clean_workspace_11x`) with safe cleanup and ephemeral Alpine fallback.
- [x] **4.6.** Implement CLI subcommand `mcp-server/src/cli/install-skill.ts` and dual entrypoint `mcp-server/src/index.ts` (`#!/usr/bin/env node`).
- [x] **4.7.** Standardize the universal cleanup script `limpieza.sh` at root, across all stacks, and in `Makefile` (Playbook 5 in `qa-11x-architect`).

---

## ✅ Milestone 5: Token-Saving Parsers, DISA STIG / OWASP Auditor, and Tools 5–7
**Mandatory Reference:** [`docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](docs/specs/04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md)

### Implementation Tasks:
- [x] **5.1.** Implement `mcp-server/src/parsers/output-parsers.ts` to condense console output from `pytest-cov`, `vitest --coverage`, `kcov`, `radon`, `mypy`, `ruff`, `eslint`, `trivy`, `bandit`, `mutmut`, and `stryker` into compact JSON.
- [x] **5.2.** Implement Tool 5 (`mcp-server/src/tools/security-auditor.ts` — `audit_security_stig_owasp`) with the 10 baseline static detection rules (`SEC-01` to `SEC-10`) aligned with the 22 DISA ASD STIG V6R5 + OWASP v4.2 patterns.
- [x] **5.3.** Implement Tool 6 (`mcp-server/src/tools/ephemeral-runner.ts` — `run_ephemeral_qa`) strictly using `execFile("make", ["qa-" + stage], { shell: false })` wired into `output-parsers.ts`.
- [x] **5.4.** Implement Tool 7 (`mcp-server/src/tools/certify-gate.ts` — `certify_11x_gate`) integrating all closure gates.
- [x] **5.5.** Register all tools and resources in `mcp-server/src/server.ts`.

---

## ✅ Milestone 6: 11X Tests (`>= 95%`), npm Packaging (`npx`), and Autonomous Sovereign Publishing
**Mandatory Reference:** [`docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](docs/specs/05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md)

### Implementation Tasks:
- [x] **6.1.** Create full unit test suite in `mcp-server/tests/*.unit.ts` achieving **>= 95.0% coverage** across lines, branches, functions, and statements inside ephemeral container `sinfallas/base-node-ionic:26`.
- [x] **6.2.** Create Karate Labs BDD scenarios (`mcp-server/test/mcp_cli_test.feature`) validating CLI behavior and JSON contracts.
- [x] **6.3.** Run `make qa-all` and `npm pack --dry-run` inside ephemeral Docker for `mcp-server/`, certifying `0` typing errors (`tsc --noEmit`), `0` ESLint/SonarJS warnings, and a clean package tarball.
- [x] **6.4.** Implement autonomous npmjs publisher without external runners (`scripts/publicar-mcp.sh`, credentials loaded from root `.env`, ephemeral validation, and `make publish-mcp`), removing dependencies on external GitHub Actions CI/CD publishing.
- [x] **6.5.** Update `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md` with single-command usage (`npx -y @sinfallas/mcp-qa-11x` and `npx -y @sinfallas/mcp-qa-11x install-skill`).

---

## ✅ Milestone 7: 11X Test Pyramid Gap Auditor (`audit_test_pyramid_gaps`) and Rescue Playbook
**Mandatory Reference:** [`docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](docs/specs/06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md)

### Implementation Tasks:
- [x] **7.1.** Define `PyramidLayerStatus`, `PyramidLayerAudit`, `UntestedApiEndpoint`, `PrioritizedTestAction`, and `TestPyramidGapResult` contracts in `mcp-server/src/types.ts`.
- [x] **7.2.** Implement `mcp-server/src/tools/test-pyramid-auditor.ts` (`auditTestPyramidGaps`) with the 13-layer 11X pyramid matrix (`L01` to `L13`), unit-less source detector (`orphan_source_files`), untested API endpoint detector (`untested_api_endpoints`), untested UI view detector (`untested_ui_views`), and `prioritized_action_plan` generator.
- [x] **7.3.** Register Tool 9 (`audit_test_pyramid_gaps`) with Zod schema (`AuditTestPyramidInputSchema`) in `mcp-server/src/server.ts`.
- [x] **7.4.** Add **Playbook 6 (Existing Project Test Gap Audit & 13-Layer Rescue)** to `.agents/skills/qa-11x-architect/SKILL.md` and sync `manifest.json` via `python3 scripts/generar-manifiesto.py`.
- [x] **7.5.** Create unit suite `mcp-server/tests/test-pyramid-auditor.unit.ts` (covering trimodal scenarios: virgin 0%, partial brownfield, and nominal 100%, keeping overall coverage `>= 95.0%`) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **7.6.** Update `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md` documenting `audit_test_pyramid_gaps` and certify with `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 8: Agent Auto-Detection in `install-skill`, 5 Skills + Scripts Install, and CDN Resilience
**Mandatory Reference:** [`docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](docs/specs/07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md)

### Implementation Tasks:
- [x] **8.1.** Update `mcp-server/src/cli/install-skill.ts`: (a) default `parseTargetArg` to `'auto'` using `detectInstalledGlobalAgentDirs(homeDir)` and `isProjectWorkspaceDir(homeDir, cwd)` (avoiding `$HOME/.agents/skills` pollution), (b) **remove the 2-skill filter** using `f.path.startsWith('.agents/skills/')` to install all **5 catalog skills**, and (c) support `--include-scripts` downloading `common_files` and `.agents/scripts/*`.
- [x] **8.2.** Sync `scripts/install-skill.sh` by removing the 2-skill filter (copying all `.agents/skills/*` folders), applying multi-agent auto-detection in `resolve_destination_dirs()`, checking `ShellCheck` (`0` warnings), and regenerating `manifest.json` (`python3 scripts/generar-manifiesto.py`).
- [x] **8.3.** Replace immediate `npm view` checks in `scripts/publicar-mcp.sh` with a resilient CDN eventual-consistency retry loop (`VERIFY_ATTEMPTS=6`, `VERIFY_DELAY=5`) preventing `E404` failures after publishing new packages/versions to `registry.npmjs.org`.
- [x] **8.4.** Expand unit tests in `mcp-server/tests/tools-and-resources.unit.ts` (certifying `>= 95.0%` coverage in ephemeral container `sinfallas/base-node-ionic:26`), `tests/test_install_skill.unit.py`, and `tests/test_publicar_mcp.unit.py`.
- [x] **8.5.** Update BDD contract in `mcp-server/test/mcp_cli_test.feature` reflecting default `auto` target behavior in `install-skill`.
- [x] **8.6.** Update `CHANGELOG.md`, `README.md`, and `docs/ai-integration.md`, and run closure gate `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 9: Non-Destructive Additive `AGENTS.md` Connector Injector (`init-agents` / `init_or_append_agents_md`)
**Mandatory Reference:** [`docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](docs/specs/08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md)

### Implementation Tasks:
- [x] **9.1.** Implement `mcp-server/src/cli/init-agents-md.ts` (`buildConnectorBlock`, `mergeOrAppendAgentsMdContent`, `initOrAppendAgentsMd`, `runInitAgentsCli`) to create `AGENTS.md` if absent or **append non-destructively** the connector block (`<!-- QA_11X_MCP_CONNECTOR_START -->` ... `<!-- QA_11X_MCP_CONNECTOR_END -->`) to the end of existing `AGENTS.md` without altering prior content.
- [x] **9.2.** Integrate `mergeAgentsMd()` into `SurgicalMerger.resolveSurgicalMerge` (`mcp-server/src/services/surgical-merger.ts`) when `base === 'AGENTS.md'`.
- [x] **9.3.** Expose CLI subcommand `npx -y @sinfallas/mcp-qa-11x init-agents [--project-path <path>] [--dry-run]` in `mcp-server/src/index.ts` and flag `--init-agents` in `mcp-server/src/cli/install-skill.ts`.
- [x] **9.4.** Register Tool 10 (`init_or_append_agents_md`) in `mcp-server/src/server.ts` and document usage in `.agents/skills/qa-11x-architect/SKILL.md`.
- [x] **9.5.** Create unit test suite `mcp-server/tests/init-agents-md.unit.ts` (verifying fresh creation, appending to existing `AGENTS.md` preserving 100% of prior lines, idempotent updates without duplicate blocks, and `dry_run` mode, keeping coverage `>= 95.0%`) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **9.6.** Update `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md`, regenerate `manifest.json`, and certify with `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 10: Assisted Browser Diagnostics (Playwright / Browser MCP) & Zero-Trust Evolution PRs (`propose_skill_evolution_pr`)
**Mandatory Reference:** [`docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](docs/specs/09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md)

### Implementation Tasks:
- [x] **10.1.** Add `BrowserTestingReadiness` interface in `mcp-server/src/types.ts` and implement `evaluateBrowserTestingReadiness()` in `mcp-server/src/tools/inspect-project.ts` detecting `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `e2e/*.e2e.ts`, and IDE browser MCP configs (`@playwright/mcp` / `chrome-devtools`) in frontend projects (`vue3`, `react-frontend`), providing injection instructions via `bootstrap_or_merge_11x`.
- [x] **10.2.** Implement `mcp-server/src/tools/propose-evolution-pr.ts` (`proposeSkillEvolutionPr`) combining **Option 1 (authenticated local `gh` CLI via `execFile` with `shell: false`)** and **Option 2 (Zero-Credential Fallback emitting `.agents/proposals/<slug>.md` + prefilled GitHub URL)** without ever bundling tokens.
- [x] **10.3.** Register Tool 11 (`propose_skill_evolution_pr`) with Zod schema (`ProposeEvolutionPrInputSchema`) in `mcp-server/src/server.ts`.
- [x] **10.4.** Add **Playbook 7 (Continuous Skill Evolution & Upstream PR Proposal)** and `browser_testing_readiness` checks to `.agents/skills/qa-11x-architect/SKILL.md`, and regenerate `manifest.json` via `python3 scripts/generar-manifiesto.py`.
- [x] **10.5.** Create unit suite `mcp-server/tests/propose-evolution-pr.unit.ts` and extend `mcp-server/tests/tools-and-resources.unit.ts` for `browser_testing_readiness` (maintaining coverage `>= 95.0%` and `0` ESLint/SonarJS warnings), updating `mcp-server/test/mcp_cli_test.feature`.
- [x] **10.6.** Update `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md`, and run closure gate `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 11: Official PHP 8.2–8.5 Blueprint (`sinfallas/basephpcomposer`) and MCP Server Integration
**Mandatory Reference:** [`docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md)

### Implementation Tasks:
- [x] **11.1.** Create the `php/` stack directory with canonical 11X templates (`php/README.md`, `php/docker-compose.qa.yml` using `sinfallas/basephpcomposer:8.5` + `postgres:17-alpine` + `eqalpha/keydb:alpine`, `php/Makefile.example`, `php/composer.json.example`, `php/phpstan.neon.example`, `php/phpunit.xml.example`, `php/infection.json5.example`, `php/php.ini.example`, `php/limpieza.sh`, and `php/test/api_test.feature`).
- [x] **11.2.** Update `scripts/generar-manifiesto.py` to index `"php"` in `STACK_METADATA` and classify `"composer.json.example"` with `merge_strategy: "surgical_merge"`, regenerating `manifest.json` and extending `tests/test_generar_manifiesto.unit.py`.
- [x] **11.3.** Extend `mcp-server/src/types.ts` (adding `'php'` to `StackNameSchema`) and `mcp-server/src/tools/inspect-project.ts` (`inspectPhpStack` detecting `composer.json`, `phpstan.neon`, `infection.json5`, and `.php` files).
- [x] **11.4.** Implement `mergeComposerJson()` in `mcp-server/src/services/surgical-merger.ts` (non-destructive merge of `require-dev`, `scripts`, and `config.allow-plugins`) and wire it into `resolveSurgicalMerge` when `base === 'composer.json'`.
- [x] **11.5.** Extend `mcp-server/src/parsers/output-parsers.ts` (`Pest`/`PHPUnit` with `PCOV`, `PHPStan`/`Psalm`, and `Infection` mutation outputs), `mcp-server/src/tools/security-auditor.ts` (`SEC-03`, `SEC-04`, and `SEC-05` rules for `.php`), and `mcp-server/src/tools/test-pyramid-auditor.ts` (13-layer matrix and orphan detection for `'php'`).
- [x] **11.6.** Extend unit suites in `mcp-server/tests/*.unit.ts` (maintaining global coverage `>= 95.0%` in ephemeral `sinfallas/base-node-ionic:26` and `0` ESLint/SonarJS warnings) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **11.7.** Sync `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md`, and run `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 12: Automated Auditors for Anti-Silo Invariant, 3-Phase Clock Cycle, Semantic Anti-UUID Audit & Dual Refresh
**Mandatory Reference:** [`docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](docs/specs/11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md)

### Implementation Tasks:
- [x] **12.1.** Extend `mcp-server/src/tools/security-auditor.ts` with `SEC-11` (`checkSec11AuditSemanticIntegrity`: catching direct `actor_username = claims.get("sub")` assignment and blind mocks `AsyncMock`/`MagicMock`/`vi.fn()` on `write_audit_log` without `assert_called`/`call_args`) and `UI-11X-02` (`checkUi11x02DualRefreshAndSemanticElse`: catching `else return 'MAINTENANCE'` fallbacks and leaked `setInterval` without `clearInterval`), keeping cognitive complexity `<= 15` and `0` `sonarjs/no-duplicate-string` warnings.
- [x] **12.2.** Extend `mcp-server/src/tools/test-pyramid-auditor.ts` adding `projectHasTemporalEntities` and `detectThreePhaseTemporalTests` in `evaluateLayer13TrimodalFixtures` (verifying 3 clock phases: `Programada`, `En Curso`, and `Cancelada`/`Expirada` when `starts_at`/`ends_at` or `safe_mode` exist) and `checkOperationalViewsDualRefresh` in `evaluateLayer07BddUiKarate` (auto-refresh + manual `[ 🔄 Refrescar ]` button).
- [x] **12.3.** Expand `mcp-server/tests/security-auditor.unit.ts` and `mcp-server/tests/test-pyramid-auditor.unit.ts` covering all new branches (maintaining coverage `>= 95.0%` in ephemeral `sinfallas/base-node-ionic:26` and `--max-warnings 0`) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **12.4.** Sync `README.md`, `TESTING.md`, `docs/ai-integration.md`, and `CHANGELOG.md`, regenerate `manifest.json`, and certify with `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 13: Automated Reconciliation, Deduplication, and Domain Rule Isolation in `.agents/` (`reconcile-agents` / `reconcile_agents_governance`)
**Mandatory Reference:** [`docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](docs/specs/12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md)

### Implementation Tasks:
- [x] **13.1.** Add `ReconcileAgentsInputSchema`, `ReconciledRuleItem`, and `ReconcileAgentsResult` contracts to `mcp-server/src/types.ts`.
- [x] **13.2.** Implement `mcp-server/src/cli/reconcile-agents.ts` (`reconcileAgentsGovernance`, `isPromotedSection`, `splitMarkdownSections`, automatic backups under `.agents/backups/<timestamp>/`, pruning of promoted directives, and extraction of project-specific rules into `.agents/rules/domain_<project>_rules.md`).
- [x] **13.3.** Register Tool 12 (`reconcile_agents_governance`) in `mcp-server/src/server.ts`, expose `reconcile-agents` CLI subcommand in `mcp-server/src/index.ts`, update `install-skill.ts` to install canonical `.agents/rules/*.md` files with `--include-scripts` and reconcile via `--reconcile`, extend `buildConnectorBlock()` + add `syncGlobalGeminiMd()` in `init-agents-md.ts` (non-destructively syncing `~/.gemini/GEMINI.md` with QA-escape Post-Mortem directive using `propose_skill_evolution_pr`), and inject `upstream_evolution_reminder` into `certify_11x_gate` (`certify-gate.ts`).
- [x] **13.4.** Create unit suite `mcp-server/tests/reconcile-agents.unit.ts` (testing deduplication on `rosgrid`-like repos, `domain_*.md` preservation, backups in `.agents/backups/`, `dry_run`, `syncGlobalGeminiMd`, and `upstream_evolution_reminder` at `>= 95.0%` coverage) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **13.5.** Sync `README.md`, `TESTING.md`, `docs/ai-integration.md`, `.agents/skills/qa-11x-architect/SKILL.md`, `.agents/skills/graphify-ast-navigator/SKILL.md`, and `CHANGELOG.md`, enforce the 11 operational directives + AST graph lifecycle (`scripts/actualizar-grafos-graphify.sh` & `inspect_ast_blast_radius`) locally and via MCP, regenerate `manifest.json`, and certify with `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 14: Extreme Token Optimization in MCP Server, 3-Path Proportional Execution (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), Progressive Disclosure & Cognitive Economy
**Mandatory Reference:** [`docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](docs/specs/13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md)

### Implementation Tasks (Frontier Coding Model (Gemini / Claude / Antigravity)):
- [x] **14.1.** Extend Zod schemas and interfaces in `mcp-server/src/types.ts`: add `include_content` (`default: false`) to `FetchBundleInputSchema` (`size_bytes`, `cached_path` in `FetchedFileItem`), `max_findings` (`default: 25`) to `AuditSecurityInputSchema`, `GroupedSecurityFinding` and `grouped_findings` to `SecurityAuditResult`, `max_items` (`default: 20`) to `AuditTestPyramidInputSchema` and `BlastRadiusInputSchema`, plus total counts in `MissingTestInventory` and `BlastRadiusResult`.
- [x] **14.2.** Optimize `mcp-server/src/tools/fetch-bundle.ts` and `mcp-server/src/server.ts` to omit raw `content` dumps by default (`include_content: false`, saving ~50,000 tokens per call while verifying SHA-256 into local cache), and update `buildConnectorBlock()` in `init-agents-md.ts` adding **3 Proportional Execution Paths (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`)** and *High-IQ Token Economy*.
- [x] **14.3.** Implement `groupFindingsByRule()` and `maxFindings` cap in `mcp-server/src/tools/security-auditor.ts`, plus `maxItems` truncation with totals in `test-pyramid-auditor.ts` and `blast-radius.ts`, maintaining cognitive complexity `<= 15` and `--max-warnings 0`.
- [x] **14.4.** Add newly promoted semantic fingerprints (`high-iq token economy`, `3-path proportional execution`, `ast/grep-first, windowed-read-second`, `subagent context isolation`, `zero redundant re-read`) to `PROMOTED_INVARIANT_FINGERPRINTS` in `mcp-server/src/cli/reconcile-agents.ts`.
- [x] **14.5.** Expand unit suites in `mcp-server/tests/` (`tools-and-resources.unit.ts`, `security-auditor.unit.ts`, `test-pyramid-auditor.unit.ts`, `init-agents-md.unit.ts`) at `>= 95.0%` coverage in ephemeral `sinfallas/base-node-ionic:26`, add Scenario 15 in `mcp-server/test/mcp_cli_test.feature`, refresh AST graph (`./scripts/actualizar-grafos-graphify.sh mcp-server`), regenerate `manifest.json`, and certify via `./.agents/scripts/certify_task_completion.sh`.

---

## ✅ Milestone 15: Comprehensive `v2.16.0` Hardening of all 7 Corporate Stacks, Thin-Repo Contract, POSIX Rule-Zero Hooks & 10/10 Gate Convergence
**Mandatory Reference:** [`TESTING.md`](TESTING.md) and [`SECURITY.md`](SECURITY.md)

### Implementation Tasks:
- [x] **15.1.** Harden `scripts/verificar-secretos.sh`, `scripts/publicar-mcp.sh` (`.env` `0600` and `manifest.json` exclusion), and `scripts/auditar-infra.sh` (persistent `qa11x_trivy_cache` and ECR/GHCR backup mirrors).
- [x] **15.2.** Converge 100% of the 10 `certify_11x_gate` stages (`mcp-server/src/tools/certify-gate.ts`) with `.agents/scripts/certify_task_completion.sh`, enforcing Thin-Repo contract by default in `bootstrap_or_merge_11x` and `install-skill --target all`, safe `lefthook.yml` merging, *Zero Hardcoded Pass* in `parseCoverage`/`audit_test_pyramid_gaps`, `--version` support, and `>= 95%` coverage including `src/index.ts`.
- [x] **15.3.** Repair templates across all 7 stacks (`vue3`, `react-frontend`, `python`, `fastapi`, `php`, `node-backend`, `bash-scripts`), remove `graphify:8080` daemons, rewrite `instalar-hooks.sh` / `lefthook.yml` under Rule Zero, preserve `mcp-server/dist` in `scripts/limpieza.sh`, and add `tests/test_stacks_hydration_smoke.unit.py`.

---

## ✅ Milestone 16: Multi-Stage Pre-Auth Anti-Silo Invariant (`SEC-16`), `SKILL.md < 20 KB` Cognitive Budget & Deterministic Doc Verifier (`verify_docs_invariants.py`)
**Mandatory Reference:** [`SECURITY.md`](SECURITY.md) §4.20 and [`.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md`](.agents/skills/qa-11x-architect/references/02-security-disa-owasp-22.md)

### Implementation Tasks:
- [x] **16.1.** Add static rule `SEC-16` in `mcp-server/src/tools/security-auditor.ts` and UAT Anti-Blindness Rule #8 (*Multi-Step Pre-Auth & Ephemeral Challenge Continuity Invariant*) with STIG/OWASP compensating controls (`challenge_id >= 128-bit`, atomic `GETDEL`/Lua, `TTL <= 300s`, attempt purge, and symmetric `PREAUTH_PUBLIC_ROUTES`).
- [x] **16.2.** Compact `.agents/skills/qa-11x-architect/SKILL.md` under `< 20 KB` (`17.5 KB`) and `.agents/ACTIVE_TASK.md.example` to `<= 40` lines (`24` lines), syncing the 12 core v1 tools, 9 v1 resources, and 23 skill files across documentation (`README.md`, `mcp-server/README.md`, `TESTING.md`, `SECURITY.md`, `FAQ.md`, `CONTRIBUTING.md`, `AI_MASTER_PROMPT.md`, and `docs/*.md`).
- [x] **16.3.** Implement `.agents/scripts/verify_docs_invariants.py` (+ `tests/test_verify_docs_invariants.unit.py`) and wire it into `certify_task_completion.sh` to block cognitive-budget regressions or documentation drift.

---

## ✅ Milestone 17: 1:1 Pre-Push CI Parity in `qa-11x` MCP: `lint` Evidence Seal, `integration`/`ci` Stages, Dynamic Endpoint Parser & Python/PG 17 Invariants
**Mandatory Reference:** [`.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md`](.agents/skills/qa-11x-architect/references/03-stack-python-fastapi.md) and [`.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md`](.agents/skills/qa-11x-architect/references/08-postgres-rls-zero-downtime-migrations.md)

### Implementation Tasks:
- [x] **17.1.** Implement `mcp-server/src/services/qa-evidence.ts` and extend `run_ephemeral_qa` (`migration`, `integration`, `ci`) and `certify_11x_gate` (`lint_evidence_verified` / `require_lint_evidence`) to require valid `stage="lint"` evidence on Git code changes while preserving the `DOCS_ONLY` Fast-Path.
- [x] **17.2.** Normalize dynamic template string expressions (`` `/routers${query}` ``, `` `/bridge/${subPath}` ``, `{path:path}`) symmetrically in `mcp-server/src/tools/certify-gate.ts` and `.agents/scripts/verify_no_orphan_api_endpoints.py`.
- [x] **17.3.** Add rules `QA-MYPY-01`, `QA-PG17-RLS`, and the `importlib` extension of `QA-COV-01` in `security-auditor.ts` + `SurgicalMerger.mergeMakefile`, update `fastapi/Makefile.example`, `python/Makefile.example`, and skills (`SKILL.md < 20 KB`), and certify with `prepush-ci-parity.unit.ts` (313 Vitest tests `>= 95%`), Pytest (54 tests), and Karate BDD (Scenario 21).

---

## ✅ Milestone 18: `v2.18.0` Internationalization — Dynamic Language Mirroring, `--lang (auto|es|en)` Flag, `codex`/`windsurf` Targets & Multi-Agent EN/ES Guides
**Mandatory Reference:** [`docs/agent-setup.md`](docs/agent-setup.md) and [`docs/agent-setup.es.md`](docs/agent-setup.es.md)

### Implementation Tasks:
- [x] **18.1.** Add `OutputLanguageModeSchema` (`auto`, `es`, `en`) in `mcp-server/src/types.ts` and inject *Dynamic Language Mirroring* into `init-agents-md.ts` (preserving exact Spanish backwards compatibility for Karate Scenario 18), with `--lang` / `-l` CLI flags and `QA_OUTPUT_LANG` env var.
- [x] **18.2.** Add support for global targets `codex` (`~/.codex/skills`) and `windsurf` (`~/.codeium/windsurf/skills`) with auto-detection in `install-skill.ts` and `scripts/install-skill.sh`, translating CLI help and MCP descriptions to concise technical English.
- [x] **18.3.** Deploy `OUTPUT LANGUAGE & DYNAMIC MIRRORING` across the 5 corporate skills (`SKILL.md < 20 KB`), author `mcp-server/README.md` in English for npmjs, keep `mcp-server/README.es.md` for GitHub, and create bilingual step-by-step setup guides for 11 AI agents (`docs/agent-setup.md` and `docs/agent-setup.es.md`).
- [x] **18.4.** Validate across the full test pyramid (Vitest `>= 95%`, Python unit tests, and Karate Labs BDD Scenario 22) and certify all 10 quality gates.

---

## ✅ Milestone 19: Anti-Silo Invariant #9 (`QA-HEALTH-01`), 1:1 Human Manual Leveling & Dual-Consumer Governance
**Mandatory Reference:** [`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`](docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md), [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md), and [`SECURITY.md`](SECURITY.md) §4.22

### Implementation Tasks:
- [x] **19.1.** Implement static rule `QA-HEALTH-01` in `mcp-server/src/tools/security-auditor.ts` (detecting `asyncio` supervisors missing `task.exception()` and `Dockerfile`/`docker-compose*.yml` `healthcheck` probes lacking real assertions in `tests/`) and add it as UAT Anti-Blindness Rule #9 in `qa-11x-architect` (`SKILL.md < 20 KB`, `03-stack-python-fastapi.md`, `01-core-13-layers.md`).
- [x] **19.2.** Level human-facing manuals 1:1 (`docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md` with all 9 Anti-Silo rules, `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md` with `SEC-01..16` traceability, `SECURITY.md` §4.22, `README.md`, `docs/ai-integration.md`, and `mcp-server/README.{md,es.md}`).
- [x] **19.3.** Add **Dual-Consumer** matrix (AI Skill + MCP Auditor + Human Manual) to `propose_skill_evolution_pr` (`types.ts`, `propose-evolution-pr.ts`, `server.ts`), `.agents/rules/continuous_agent_evolution.md`, and automated validator `check_dual_consumer_parity` in `.agents/scripts/verify_docs_invariants.py`.
- [x] **19.4.** Validate via unit & BDD suites in ephemeral Docker (`qa-health-dual-consumer.unit.ts`, `test_verify_docs_invariants.unit.py`, and Karate BDD Scenario 23), regenerate `manifest.json` + AST graphs, and pass the 10/10 gate.

---

## ✅ Milestone 20: Redundancy-Free Version Detection (`.qa-11x-version` + 24h Fail-Open TTL), `update_available` Tool Notice & Global SHA-256 Skills Auto-Sync (`v2.20.0`)
**Mandatory Reference:** [`docs/ai-integration.md`](docs/ai-integration.md) and [`docs/agent-setup.md`](docs/agent-setup.md)

### Implementation Tasks:
- [x] **20.1.** Implement `mcp-server/src/services/version-manager.ts` with deterministic `.qa-11x-version` stamping in `install-skill.ts` and `scripts/install-skill.sh`, `manifest.json` (`ETag`) reuse, and `latest-version-check.json` cache (24h TTL with offline *fail-open*).
- [x] **20.2.** Expose structured `update_available` (`agent_notice` and `recommended_command`) in `inspect_project_config` and `certify_11x_gate` for proactive agent notifications without polluting JSON-RPC `stdout`.
- [x] **20.3.** Add `syncGlobalSkillsInBackground` on MCP server `stdio` startup (`index.ts`) to silently sync preinstalled global skills by `SHA-256` while preserving `~/.gemini/GEMINI.md` connector language.
- [x] **20.4.** Certify with `tests/version-manager.unit.ts` (`337/337` Vitest tests `>= 95%`), Scenario 24 in `mcp_cli_test.feature`, `manifest.json` and AST graph updates, and `v2.20.0` `npmjs` publish.

---

## ✅ Milestone 21: Multi-Stack Differential Coverage (`verify_diff_coverage.py`), Ephemeral Report Persistence & Anti-Evasion Block
**Mandatory Reference:** [`docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](docs/specs/16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md)

### Implementation Tasks:
- [x] **21.1.** Configure `.gitignore` and `scripts/limpieza.sh` for `.agents/.cache/` and `.agents/artifacts/`, and update `Makefile` / `mcp-server/src/tools/ephemeral-runner.ts` to preserve `coverage.xml` and `lcov.info` in `.agents/.cache/coverage/` before `--rm` container exit.
- [x] **21.2.** Create `.agents/scripts/verify_diff_coverage.py` (part 1: Anti-XXE `exit 12` guard, Cobertura XML parser, and LCOV parser normalizing `/app` -> workspace paths with complexity `CC <= 5`).
- [x] **21.3.** Complete `.agents/scripts/verify_diff_coverage.py` (part 2: `git diff --unified=0` intersection with `shell=False`, `DOCS_ONLY` fast-path, `exit 11` anti-evasion guard without `QA11X-APPROVED-EXCLUSION`, and `Pass-Quiet`/`Fail-Verbose` output).
- [x] **21.4.** Create `tests/test_verify_diff_coverage.unit.py` (`>= 95%` coverage in `sinfallas/base-python-uv:3.15` validating XXE, LCOV branches `>= 90%`, Cobertura XML, `pragma`/`v8 ignore` evasion, and `DOCS_ONLY`).
- [x] **21.5.** Add `make diff-cov` target in `Makefile` and integrate conditional differential coverage verification into `.agents/scripts/certify_task_completion.sh`.
- [x] **21.6.** Sync *Dual-Consumer* directives in `.agents/rules/mandatory_qa_pyramid_and_doc_sync.md` and `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, refresh AST graph, run `make sync-governance`, and certify `make certify`.

---

## ✅ Milestone 22: Deterministic Findings Memory & Anti-Loop Circuit Breaker (`exit 42`) in `run_ephemeral_qa` and `certify`
**Mandatory Reference:** [`docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](docs/specs/17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md)

### Implementation Tasks:
- [x] **22.1.** Create `.agents/scripts/track_findings_state.py` (part 1: line-number-invariant finding normalization, `0600` storage in `.agents/.cache/certify_state.json` keyed by `branch:merge_base`, and `--reset-state` flag).
- [x] **22.2.** Complete `.agents/scripts/track_findings_state.py` (part 2: `RESOLVED`/`PERSISTENT`/`REGRESSION_OSCILLATION`/`NEW` state machine and `exit 42` trigger on `streak >= 3` or `oscillation >= 1`, `CC <= 5`).
- [x] **22.3.** Create `tests/test_track_findings_state.unit.py` (`>= 95%` coverage in `sinfallas/base-python-uv:3.15` validating line-shift invariance, branch switching, `streak == 3` threshold, `A -> B -> A` oscillation, and `--reset-state`).
- [x] **22.4.** Integrate streak tracking and structured `BREAKER_42` alert into `mcp-server/src/services/qa-evidence.ts` and `mcp-server/src/tools/ephemeral-runner.ts` (`run_ephemeral_qa`) preserving the 18 MCP tools intact.
- [x] **22.5.** Add TypeScript unit tests in `mcp-server/tests/` (`>= 95%` coverage in `sinfallas/base-node-ionic:26`) and wire `track_findings_state.py` into `.agents/scripts/certify_task_completion.sh`.
- [x] **22.6.** Document the `BREAKER-42` protocol in `.agents/rules/anti_regression_and_side_effects_guardrail.md`, `.agents/skills/qa-11x-systematic-debugging/SKILL.md` (`< 20 KB`), and `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, refresh AST graph, run `make sync-governance`, and pass `make certify`.

---

## ✅ Milestone 23: Differential Mode in `inspect_ast_blast_radius` (Zero MCP Bloat) & Executive `PR_VERDICT.md` Exporter
**Mandatory Reference:** [`docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](docs/specs/18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md)

### Implementation Tasks:
- [x] **23.1.** Create `mcp-server/src/utils/diff-bundle.ts` (`SonarJS <= 15`, `execFile` without shell) with lockfile/generated pruning, `MISSING_KARATE_API_FEATURE` alert, optional `.agents/ACTIVE_TASK.md` boundaries, and secret redaction via `promptGuard.ts`.
- [x] **23.2.** Backwards-compatibly extend `BlastRadiusInputSchema` (`changed_since_ref`, `max_tokens_budget`) in `mcp-server/src/types.ts` and `mcp-server/src/tools/blast-radius.ts` without changing the 18 Tools and 12 Resources catalog.
- [x] **23.3.** Create `mcp-server/tests/diff-blast-radius.unit.ts` (`>= 95%` coverage in `sinfallas/base-node-ionic:26` verifying `>= 60%` token savings, secret redaction, and invalid `baseRef` rejection) and update `mcp-server/test/mcp_cli_test.feature`.
- [x] **23.4.** Create `.agents/scripts/generate_pr_verdict.py` (`CC <= 5`, pure stdlib) reusing `release_readiness_gate.py`, `.agents/.qa-evidence.json`, and `verify_diff_coverage.py` to emit `.agents/artifacts/PR_VERDICT.md` and `pr_verdict_attestation.json` (`SHA-256`).
- [x] **23.5.** Create `tests/test_generate_pr_verdict.unit.py` (`>= 95%` coverage in `sinfallas/base-python-uv:3.15`) and expose `make pr-verdict` target in `Makefile`.
- [x] **23.6.** Update `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `TESTING.md`, and `CHANGELOG.md`, update AST graphs, run `make sync-governance`, and pass `make certify`.

---

## ✅ Milestone 24: Comprehensive `QA-11X v3.0` Audit (`v3.0.0`), `bump_version_11x.py` Synchronizer, Live MCP Protocol & `19_SPEC` / `20_SPEC` Planning
**Mandatory Reference:** [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) + [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md)

### Implementation Tasks:
- [x] **24.1.** Audit in parallel the MCP server (`src/`), 10 skills (`.agents/skills/`), catalogs (`catalogs/*`, `llms.txt`), governance, `.gitignore`, and all 10 stack documentations (including `ai-evals`, `mobile-appium`, `vibe-rescue`, and `architecture`).
- [x] **24.2.** Fix CLI parity (`tms-sync`, `-T`, `help`), dynamic versioning in A2A/Allure/TMS (`MCP_SERVER_VERSION`), and `.gitignore` / `<stack>/gitignore.example` rules.
- [x] **24.3.** Create deterministic version synchronizer `.agents/scripts/bump_version_11x.py` (`CC <= 5`, `mypy --strict`, `100%` delta coverage in `tests/test_bump_version_11x.unit.py`) and wire it into `Makefile` (`make version-check`), `sync_governance.py`, and `certify_task_completion.sh`.
- [x] **24.4.** Author `v3.x` planning specifications: `19_SPEC` (EN-primary + ES mirror bilingual architecture deferred past `3.0.0`) and `20_SPEC` (dedicated `sinfallas/base-mobile-appium:26` image plan without emulator or `root`).
- [x] **24.5.** Create `mcp-server/tests/live-mcp-protocol.test.ts` (`InMemoryTransport` + live `StdioClientTransport` against `dist/index.js`), expand `tests/bats/` (`test_limpieza.bats`, `test_repo_scripts.bats`) and `tests/test_verify_docs_invariants.unit.py`, and add Scenario 37 to `mcp-server/test/mcp_cli_test.feature`.
- [x] **24.6.** Execute coordinated release bump `bump_version_11x.py --set 3.0.0 --edition "QA-11X v3.0"`, recompute SHA-256 fingerprints in `manifest.json` and `catalogs/skillsllm-manifest.json`, certify full Docker matrix (`Rule Zero`), update `TESTING.md` / `CHANGELOG.md`, and consolidate certified local commit (no `push` or `npm publish`).

---

## ✅ Milestone 25: 15×12 Matrix, `sinfallas/base-mobile-appium:26` & Bilingual Documentation Architecture
**Mandatory Reference:** [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) + [`docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md)

### Implementation Tasks:
- [x] **25.1.** Integrate dedicated non-root Docker image **`sinfallas/base-mobile-appium:26`** (`Node.js 26`, `pnpm`, `OpenJDK 21`, `Android SDK/ADB`, `Appium 3`, `uiautomator2`, `xcuitest`, `WebdriverIO v9`), update `mobile-appium/{Makefile.example,docker-compose.qa.yml,package.json.example,tests/mobile_screenplay.spec.ts}`, add `make test-mobile-blueprints` in `Makefile`, and wire `smoke-mobile-appium` into `.github/workflows/audit-base-images.yml`.
- [x] **25.2.** Wire `sinfallas/base-mobile-appium:26` and `qa-mobile` into `mcp-server` (`src/resources/stackBlueprints.ts`, `src/tools/ephemeral-runner.ts`), enable bilingual `blueprint://*` negotiation (`?lang=es|en`), and level the **15×12 Quality Matrix** across [`README.md`](README.md) and [`README.es.md`](README.es.md).
- [x] **25.3.** Execute **Spec 19 Phase A**: migrate root governance, security, testing, prompt, roadmap, changelog, `mcp-server/{CHANGELOG,example/README}`, and `docs/agent-setup` documents to **English Canonical (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** pairs with reciprocal language banners and update [`AGENTS.md`](AGENTS.md) and [`.agents/README.md`](.agents/README.md).

---

## ✅ Milestone 26: `QA-11X v3.1` (`3.1.0`) — Atomic Flight Recorder, `tactical-patterns-11x`, 10-Stack Hydration & Fail-Closed Hardening
**Mandatory Reference:** [`AGENTS.md`](AGENTS.md), [`TESTING.md`](TESTING.md), and [`SECURITY.md`](SECURITY.md)

### Implementation Tasks:
- [x] **26.1.** Implement Unified Atomic Flight Recorder ([`.agents/schemas/session_checkpoint.schema.json`](.agents/schemas/session_checkpoint.schema.json) + [`.agents/scripts/checkpoint_ctl.py`](.agents/scripts/checkpoint_ctl.py) + MCP tool `session_flight_recorder`), JIT tactical skill [`tactical-patterns-11x`](.agents/skills/tactical-patterns-11x/SKILL.md) (`<= 2.5 KB`, `blueprint://skills/tactical-patterns-11x`), `[DIRECTIVE-11X]`, and `max-params: 4` / `max-depth: 3` complexity locks.
- [x] **26.2.** Consolidate all 10 hydratable stacks in `manifest.json`, single-source `_budgets.py` & `sync_governance.py`, dynamic `verify_docs_invariants.py` counts, Fail-Closed gates, Rule Zero non-root Docker hardening, and `QA-11X v3.1` (`3.1.0`) stabilization.

---

## ✅ Milestone 27: `v3.2.0` (`QA-11X v3.2`) — 99/99 Forensic Audit Remediation, 12 CLI Subcommands, MCP 2026 Standards & 100% Diff Coverage
**Mandatory Reference:** [`CHANGELOG.md`](CHANGELOG.md), [`TESTING.md`](TESTING.md), and [`AGENTS.md`](AGENTS.md)

### Implementation Tasks:
- [x] **27.1.** Close security and runtime findings across the MCP server (`src/utils/ideConfigPaths.ts`, `src/security/pathRealResolver.ts`, Zod `.strict()`, MCP 2026 tool `annotations`, `A2A v1.0`, `AbortSignal` propagation) and certify Clean-Room `.tgz` E2E + Karate BDD (`51/51`).
- [x] **27.2.** Harden all 10 stack blueprints (`sinfallas/base-mobile-appium:26` multi-arch OCI digest, `React` portal/dual-refresh contracts, `mutmut >= 3.7.0`, Promptfoo Nunjucks, WORM SQL fail-closed) and fix CI/Bash/Python tooling (`make sbom` + `.sha256`, `make compact-context`, `install-skill.sh` fallback without `jq`).
- [x] **27.3.** Synchronize 1:1 EN/ES documentation (`docs/`, `README`, `TESTING`, `CHANGELOG`, `ROADMAP`), reach `100.00%` differential line coverage across Python/TS/Bash (`verify_diff_coverage.py`), and lock local release `3.2.0` under `QA-GIT-GATE-01`.
