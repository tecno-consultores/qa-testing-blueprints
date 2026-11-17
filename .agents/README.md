# 🤖 `.agents/` — AI Governance & Standard 11X Quality Directives

Governance and quality configuration directory for **autonomous AI coding agents** and **human engineers** in **QA Testing Blueprints**.

This directory implements the portable, open agent-governance layout across Google Antigravity, Anthropic Claude Code / Claude Desktop, Nous Research Hermes Agent, Cursor, Windsurf, and Codex—enforcing **Standard 11X** security, architectural, and verification gates without polluting target repositories.

---

## 📂 Directory Structure

```text
.agents/
├── README.md                                         # This technical governance overview
├── ACTIVE_TASK.md.example                            # Compact <= 40-line task projection template
├── rules/                                            # Enforced behavioral directives (8 canonical global files)
│   ├── mandatory_qa_pyramid_and_doc_sync.md          # Multi-layer test pyramid, Anti-Silo cross-module propagation & doc sync
│   ├── secure_development_and_testing_guidelines.md  # DISA ASD STIG V6R5 + OWASP v4.2: Anti-Mock, PG17 RLS, sessions, NFKC, XXE, WORM audit, SBOM & visual geometry
│   ├── frontend_parity_and_closure.md                # Terminal-UI parity, mutable operational tables, Dual Refresh ([ 🔄 Refrescar ]) & closure protocol
│   ├── continuous_agent_evolution.md                 # Autonomous .agents/ evolution & consumer domain-rule isolation (domain_*.md)
│   ├── anti_regression_and_side_effects_guardrail.md # Anti-regression guardrails, AST blast-radius checks & BREAKER-42 protocol
│   ├── ground_truth_fixtures_and_negative_invariants.md # Trimodal fixtures, 3-phase temporal lifecycle & negative invariants
│   ├── active_task_and_planning_resilience.md        # Atomic Flight Recorder (.agents/.cache/session_checkpoint.json -> ACTIVE_TASK.md)
│   └── git_closure_gate.md                           # QA-GIT-GATE-01 (certified local git commit; zero automatic git push)
├── schemas/                                          # JSON Schema Draft 2020-12 state & telemetry schemas
│   └── session_checkpoint.schema.json                # Strict 0600 schema for session_checkpoint.json (Flight Recorder)
├── skills/                                           # Domain playbooks & progressive-disclosure skills (11 modular skills)
│   ├── qa-11x-architect/                             # Master orchestrator: 13 layers, 10 laws, 11 UAT Anti-Blindness rules & 9 references/
│   ├── qa-11x-docker-certifier/                      # Ephemeral Docker Rule Zero certification (>=95% coverage)
│   ├── qa-11x-devsecops-hardener/                    # DISA ASD STIG V6R5 & OWASP v4.2 hardening (22 ref controls / 34 scanner rules)
│   ├── qa-11x-systematic-debugging/                  # 4-phase deterministic root-cause debugging (Rule Zero + AST Blast Radius)
│   ├── qa-11x-screenplay-builder/                    # Proportional Screenplay E2E pattern, Anti-JSDOM & 3-phase temporal assertions
│   ├── qa-11x-llm-evaluator/                         # Dual-mode LLM, RAG, voice & OWASP LLM Top 10 red-team evaluation
│   ├── qa-11x-vibe-rescue/                           # 5-stage Vibe-to-Enterprise prototype rescue & hardening
│   ├── docker-trivy-keydb-hardening/                 # Non-root container hardening, Trivy = 0 & multi-threaded KeyDB
│   ├── graphify-ast-navigator/                       # Bidirectional AST Knowledge Graph navigation & blast-radius analysis
│   ├── refactoring-ui/                               # Visual hierarchy, discrete scales, OKLCH contrast, tabular-nums & WCAG 2.1 AA (SKILL.md + 9 references/)
│   └── tactical-patterns-11x/                        # Ultra-compact JIT tactical patterns <= 2.5 KB (CC <= 5, max-params: 4, Port/Adapter, Outbox)
└── scripts/                                          # Deterministic automation gates & utilities (22 files: _budgets.py + 21 CLI scripts)
    ├── _budgets.py                                   # Single-source cognitive budgets & AST blast-radius thresholds
    ├── checkpoint_ctl.py                             # Atomic Flight Recorder controller (0600 JSON -> ACTIVE_TASK.md + live Git check)
    ├── verify_alembic_orm_parity.py                  # Strict ORM model vs. migration parity auditor (revision <= 32 chars)
    ├── verify_json_no_duplicate_keys.py              # Strict duplicate-key validator for i18n JSON locale files
    ├── verify_topological_health.py                  # AST directed cycle (DFS) & layer-boundary validator (services/domain -> api/views)
    ├── inspect_blast_radius.py                       # Bidirectional AST blast-radius inspector & Code Q&A helper
    ├── select_tests_by_blast_radius.py               # Deterministic QA suite selector from AST blast radius
    ├── verify_zero_orphan_vue_components.py          # Zero-orphan UI component test parity validator
    ├── verify_no_orphan_api_endpoints.py             # Bidirectional frontend-backend API route parity validator
    ├── verify_roadmap_consistency.py                 # Bidirectional ROADMAP.md & ACTIVE_TASK.md consistency validator
    ├── verify_docs_invariants.py                     # Cognitive-budget (<=12KB architect / <20KB skills / <=40 lines) & bilingual/Dual-Consumer parity validator
    ├── verify_diff_coverage.py                       # Multi-stack differential coverage gate (100% lines / >=90% branches) & anti-evasion guard
    ├── track_findings_state.py                       # Line-shift-invariant finding state tracker & BREAKER-42 anti-loop circuit breaker (exit 42)
    ├── generate_pr_verdict.py                        # Deterministic PR_VERDICT.md & SHA-256/HMAC attestation generator
    ├── lint_test_antipatterns.py                     # UI (QA-UI-ANTI-001..005) & Python AST (QA-PY-ANTI-001..003) anti-pattern linter
    ├── bump_version_11x.py                           # Zero-LLM deterministic version & edition synchronizer
    ├── sync_governance.py                            # Offline SHA-256 cryptographic manifest.json synchronizer
    ├── release_readiness_gate.py                     # SLA Release Readiness Gate evaluator (GO / NO_GO)
    ├── compact_context_11x.py                        # Two-tier Zero-LLM conversation context compactor
    ├── audit_pagespeed_insights.py                   # Ephemeral PageSpeed Insights / Core Web Vitals auditor
    ├── validate_calm_architecture.sh                 # Ephemeral Docker FINOS CALM architecture validator
    └── certify_task_completion.sh                    # Automated 10-stage pre-commit certification gate
```

---

## 🌐 Linguistic Strategy, Token Economy & Intentional Spanish CLI Diagnostics

> **ARCHITECTURAL DESIGN PREMISE (Spec 19):**
> Internal AI governance artifacts under `.agents/` (`AGENTS.md`, `.agents/README.md`, `.agents/rules/*.md`, `.agents/skills/**`) are authored exclusively in **concise, high-density technical English**. Human-facing repository documentation uses **English Canonical (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** pairs (with historical ADRs `docs/specs/01..18` preserved in Spanish per Spec 19 §3.4).

1. **Context-Window Token Economy (~35% Token Savings):**
   - BPE tokenizers split Spanish inflectional suffixes and conjugations into significantly more sub-tokens than compact technical English. Keeping `.agents/**` monolingual in technical English maximizes context capacity for source code, schemas, and traces while eliminating dual-language rule drift.
2. **Lower Latency & Higher Normative Precision:**
   - Security and engineering standards (RFCs, DISA ASD STIG V6R5, OWASP v4.2 / ASVS / API Top 10 / OSHP / CycloneDX, CIS Benchmarks, PostgreSQL RLS, FIPS 140-3 AES-256-GCM, WCAG 2.1 AA) align with peak semantic precision in technical English.
3. **Intentional Spanish CLI Diagnostics in `.agents/scripts/*`:**
   - Terminal `stdout`/`stderr` diagnostic messages, error tables, and projected `.agents/ACTIVE_TASK.md` / `PR_VERDICT.md` human operator summaries emitted by `.agents/scripts/*.{py,sh}` (e.g., `certify_task_completion.sh`, `verify_docs_invariants.py`, `verify_roadmap_consistency.py`, `checkpoint_ctl.py`) remain **intentionally in Spanish**. Because LLMs only inspect script failures on demand (`Pass-Quiet / Fail-Verbose`), keeping operator CLI diagnostics in Spanish preserves operator ergonomics with zero prompt-bloat penalty.
4. **Dynamic Output Language Mirroring:**
   - Unless a target repository's `AGENTS.md` pins a fixed language (such as Spanish interaction in `qa-testing-blueprints`), agents respond in the **user's prompt language** and synchronize human docs in EN/ES (`*.md` + `*.es.md`).
5. **3-Tier Progressive Disclosure & High-IQ Token Economy:**
   - **Tier 1 (`AGENTS.md` / `GEMINI.md` Connector):** Compact always-on routing index (`< 35` lines in consumer repos) routing tasks across **3 Proportional Execution Paths**: `DOCS_ONLY`, `MICRO_CHANGE`, and `FULL_11X`.
   - **Tier 2 (`SKILL.md` Executive Layer):** Summarizes the 10 Non-Negotiable Laws, **11 UAT Anti-Blindness Rules** (including Zero Hardcoded Pass, `SEC-16`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-CONTRACT-SDK-01`, and `QA-DOCKER-LOCK-01`), Playbooks, and the **6 Cognitive Token-Saving Invariants** (`Graphify AST-First, Grep-Fallback, Windowed-Read-Second`, `Zero Redundant Re-Read`, `Parallel Tool Batching`, `Subagent Context Isolation <= 20 lines`, `Pass-Quiet Terminal Filtering`, and `Compact ACTIVE_TASK.md <= 40 lines`).
   - **Tier 3 (`references/*.md` & `.agents/rules/*.md`):** Loaded strictly on demand when touching the corresponding stack or control domain.

---

## 🤝 Multi-Agent Compatibility

`.agents/` is vendor-neutral and portable across autonomous coding environments:

1. **Google Antigravity:** Auto-loads `.agents/rules/` directives and hydrates `.agents/skills/` playbooks on demand.
2. **Anthropic Claude Code / Claude Desktop:** Consumes `.agents/skills/` playbooks and `.agents/rules/` as contextual governance.
3. **Nous Research Hermes Agent:** Natively compatible with terminal MCP workflows (`@sinfallas/mcp-qa-11x` exposing **19 MCP Tools** and **13 MCP Resources** across **10 stacks**).
4. **Cursor / Windsurf / Codex:** Reads root `AGENTS.md` and `.agents/rules/` automatically as contextual coding constraints.
5. **Human Engineers:** Serves as a single auditable source of truth for test pyramids, security invariants, and release gates.

---

## 🔒 Git Security & Versioning

Versioning `.agents/` in Git is safe and recommended:
- **Zero Secrets:** Contains only Markdown governance, JSON schemas, and deterministic Python/Bash gates—never tokens, passwords, or `.env` secrets.
- **Reproducibility:** Ensures every contributor and CI run shares identical 11X quality thresholds (`>= 95%` coverage, `CC <= 5`, `0` Trivy HIGH/CRITICAL findings).
- **Continuous Auditing:** All 21 Python governance scripts (`.agents/scripts/*.py` + `scripts/generar-manifiesto.py`) maintain 100% `ruff` (`CC <= 5`) and `mypy --strict` compliance, alongside `ShellCheck`/`shfmt` on Bash gates and `./scripts/verificar-secretos.sh`.

---

## 🚀 Running Ephemeral Automation Gates (Rule Zero)

Execute governance and certification gates via `make` or ephemeral Docker containers (`sinfallas/base-python-uv:3.15`):

```bash
# Run the full 10-stage 11X certification gate
make certify

# Validate cognitive budgets, Dual-Consumer parity & bilingual doc links in Docker
docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
  python3 .agents/scripts/verify_docs_invariants.py

# Audit zero-orphan UI components and ORM-migration parity in Docker
docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
  sh -ec 'python3 .agents/scripts/verify_zero_orphan_vue_components.py && python3 .agents/scripts/verify_alembic_orm_parity.py'
```
