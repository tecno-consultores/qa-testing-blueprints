# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

# Continuous Agent & System Prompt Evolution Directive

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI coding agents (Google Antigravity, Claude Code, Hermes Agent, Cursor) and human developers.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. The Autonomous Evolution Mandate

Whenever an AI agent detects:
1. A recurring pattern or repetitive operational friction,
2. An edge case or bug not covered by current `.agents/rules/` or skills,
3. An opportunity to optimize context token consumption (~35% reduction in rules and prompts),
4. A missing automation script or verification gate in `.agents/scripts/`,

the AI agent is **strictly authorized and mandated** to proactively update or extend the files in `.agents/` (`rules/`, `skills/`, `scripts/`) without waiting for explicit user prompting.

---

## 2. Guardrails for Agent Modifications

When updating `.agents/`:
1. **Never relax quality thresholds:** Coverage must stay `>= 95%`, zero secrets, zero schema drift.
2. **Preserve Linguistic Architecture:** Agent directives in `rules/` and `skills/` must remain in high-density technical English. User interaction and documentation must remain strictly in Spanish.
3. **Validate Automation Scripts:** Any new Python or Bash script in `.agents/scripts/` must be executable (`chmod +x`), pass `ruff` / `ShellCheck`, and be referenced in `certify_task_completion.sh` if it acts as a gate.
4. **Log the Evolution:** Document changes made to `.agents/` in `CHANGELOG.md` under `## [Unreleased]`.
