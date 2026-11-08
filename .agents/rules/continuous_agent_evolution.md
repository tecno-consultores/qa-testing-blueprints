# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Continuous Agent & System Prompt Evolution Directive

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI coding agents (Google Antigravity, Claude Code, Hermes Agent, Cursor) and human developers.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. The Autonomous Evolution Mandate & Mandatory QA-Escape Post-Mortem Trigger

Whenever an AI agent detects or resolves:
1. **A UAT, integration, or production bug that escaped existing automated tests** (even when unit coverage was `>= 95%`, e.g., mock blindness, siloed endpoints, missing temporal phases, or UI state desync),
2. A recurring pattern or repetitive operational friction,
3. An edge case or security/architectural gap not covered by current `.agents/rules/` or skills,
4. An opportunity to optimize context token consumption (~35% reduction in rules and prompts),
5. A missing automation script or verification gate in `.agents/scripts/`,

the AI agent is **strictly authorized and mandated** to act **PROACTIVELY without waiting for the user to ask or suggest it**:
- **Mandatory Proactive User Notification & Upstream Proposal (Consumer Projects):** Before closing the task, the agent MUST explicitly include a section in its Spanish response titled **`💡 Oportunidad de Mejora Detectada para el Estándar QA 11X (qa-testing-blueprints)`**, explaining why the previous test suite missed the bug, formulating the generalized domain-agnostic rule, and invoking (or offering to invoke) the MCP tool **`propose_skill_evolution_pr`** to upstream the improvement to `tecno-consultores/qa-testing-blueprints`.
- **Direct Update (Inside `qa-testing-blueprints`):** When working directly inside the `qa-testing-blueprints` repository, proactively update or extend `.agents/` (`rules/`, `skills/`, `scripts/`) and `manifest.json`.

---

## 2. Guardrails for Agent Modifications & Consumer Project Anti-Collision Protocol

When updating `.agents/`:
1. **Never relax quality thresholds:** Coverage must stay `>= 95%`, zero secrets, zero schema drift.
2. **Preserve Linguistic Architecture:** Agent directives in `rules/` and `skills/` must remain in high-density technical English. User interaction and documentation must remain strictly in Spanish.
3. **Validate Automation Scripts:** Any new Python or Bash script in `.agents/scripts/` must be executable (`chmod +x`), pass `ruff` / `ShellCheck`, and be referenced in `certify_task_completion.sh` if it acts as a gate.
4. **Log the Evolution:** Document changes made to `.agents/` in `CHANGELOG.md` under `## [Unreleased]`.
5. **Thin-Repo Governance & Anti-Collision Rule for Consumer Projects (e.g. `rosgrid`):**
   - The 7 canonical files in `.agents/rules/` (`mandatory_qa_pyramid_and_doc_sync.md`, `secure_development_and_testing_guidelines.md`, `frontend_parity_and_closure.md`, `continuous_agent_evolution.md`, `anti_regression_and_side_effects_guardrail.md`, `ground_truth_fixtures_and_negative_invariants.md`, `active_task_and_planning_resilience.md`) and the 5 corporate skills in `.agents/skills/` are **Global Canonical Assets** owned by `qa-testing-blueprints` and consumed from the user's global agent configuration (`~/.gemini/config/skills/`, `~/.claude/skills/`, `~/.cursor/skills/`, `~/.hermes/skills/`, `~/.gemini/GEMINI.md`).
   - When working inside a downstream consumer project (such as `rosgrid`), AI agents MUST NOT duplicate the 7 canonical `.agents/rules/*.md` files or the 5 corporate skills inside `<project>/.agents/` (`reconcile-agents` automatically backs up and prunes local copies after extracting any custom domain sections).
   - Instead:
     - **Universal QA/Security discoveries** must be generalized and proposed upstream via `propose_skill_evolution_pr` (and removed from local duplicates once promoted to `qa-testing-blueprints`).
     - **Project-specific domain rules** (e.g. MikroTik RouterOS v7 commands, specific business tables, or domain workflows) MUST be placed exclusively in `AGENTS.md` (outside the `<!-- QA_11X_MCP_CONNECTOR_START --> ... <!-- QA_11X_MCP_CONNECTOR_END -->` block) or in dedicated domain-prefixed files `.agents/rules/domain_<project>_*.md`.
6. **3-Tier Progressive Disclosure & Anti-Duplication Invariant (`AGENTS.md` ↔ `.agents/rules/` ↔ `SKILL.md`):**
   - **Tier 1 (`AGENTS.md` / `GEMINI.md` Connector):** Keep the always-on connector block ultra-compact (`< 35 lines`) as a routing index.
   - **Tier 2 (`SKILL.md`):** Keep `SKILL.md` under `20 KB` by summarizing laws and referencing `.agents/rules/*.md` and `references/*.md` rather than duplicating multi-paragraph explanations verbatim.
   - **Tier 3 (`references/*.md` & `.agents/rules/*.md`):** Load deep stack references and domain rules strictly on-demand (one at a time, only when modifying that specific stack or domain).
