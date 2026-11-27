# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# Continuous Agent & System Prompt Evolution Directive

> **SCOPE:** Mandates proactive 3-layer Dual-Consumer evolution and Thin-Repo governance separation.

## 1. Autonomous Evolution Mandate & QA-Escape Post-Mortem

Whenever an AI agent detects or fixes a UAT/production escape (despite `>= 95%` unit coverage), recurring friction, security/test gap, token-economy improvement, or missing automation gate, it MUST act proactively:
- **In Consumer Projects:** Include **`💡 Oportunidad de Mejora Detectada para el Estándar QA 11X (qa-testing-blueprints)`** in the response explaining the escape and domain-agnostic rule, and invoke/offer `propose_skill_evolution_pr` covering all 3 Dual-Consumer layers (`target_blueprint_file`, `target_mcp_component`, `target_human_doc_file` + `proposed_human_doc_summary`). Present the generated **ready-to-send email template for `soporte@tecnoconsultores.net`** (`email_template` + `prefilled_mailto_url` + `.agents/proposals/<slug>.md`, NEVER auto-sending email from MCP) as the primary channel, with `prefilled_github_url` / `gh` as an optional secondary channel.
- **Inside `qa-testing-blueprints`:** Every promoted rule MUST simultaneously update: (1) `.agents/{skills,rules}/` (concise technical English), (2) `mcp-server/` or `.agents/scripts/` (executable enforcement), and (3) bilingual human manuals (`docs/01..05_*.{md,es.md}`, `SECURITY.{md,es.md}`, `CHANGELOG.{md,es.md}`) plus `manifest.json` (`make sync-governance`).

## 2. Evolution Guardrails & Thin-Repo Consumer Separation

1. **Never Relax Thresholds:** Keep coverage `>= 95%`, zero secrets, zero schema drift, and Spec 19 linguistic architecture (English concise `.agents/**`, EN+ES human mirrors).
2. **Validate Scripts:** Every executable script in `.agents/scripts/` requires `chmod +x` and clean `ruff` (`CC <= 5`), `mypy --strict`, `ShellCheck`, and `shfmt` in ephemeral Docker (`Rule Zero`).
3. **Thin-Repo Anti-Collision:** The 8 canonical `.agents/rules/*.md` files and 12 `.agents/skills/` modules are **Global Canonical Assets** installed globally via `install-skill --target <auto|workspace|antigravity|gemini-cli|claude|cursor|windsurf|codex|hermes|opencode|copilot|agents|all>` (falling back to `$HOME/.agents/skills` in `--target auto` when no IDE dir exists). Downstream consumer repos MUST NOT duplicate them locally or paste promoted global rules into `.agents/rules/domain_*_rules.md` (`reconcile-agents` backs up and prunes duplicated local `.agents/rules/*.md` and `.agents/skills/*`). Keep consumer-only domain rules in `AGENTS.md` (outside `<!-- QA_11X_MCP_CONNECTOR_START --> ... <!-- QA_11X_MCP_CONNECTOR_END -->`) or `.agents/rules/domain_<project>_*.md`. Governance-only consumer commits use the `certify_task_completion.sh` Fast-Path.
4. **3-Layer Progressive Disclosure & Glossary (`_budgets.py`):** Never conflate **Adoption Tier** (`starter | standard | enterprise` in `.qa-11x.json` v3), **Execution Path** (`DOCS_ONLY | MICRO_CHANGE | FULL_11X`), and **Disclosure Layer**:
   - **Layer 1:** Root `AGENTS.md <= 8 KB`; project/global connectors `<= 1.5 KB` (`< 35` lines).
   - **Layer 2:** `qa-11x-architect/SKILL.md <= 12 KB`, `tactical-patterns-11x/SKILL.md <= 2.5 KB`, other `SKILL.md < 20 KB`.
   - **Layer 3:** Total `.agents/rules/*.md <= 36 KB`; load `references/*.md` strictly on demand without verbatim duplication.
