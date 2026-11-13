# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 🔒 Human-Confirmed Remote Push & Release Closure Gate (`QA-GIT-GATE-01`)

> **CORE GOVERNANCE DIRECTIVE:**
> Applies to all AI coding agents (Google Antigravity, Claude Code, Hermes Agent, Cursor, Windsurf, Codex) and automated workflows.
> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user and write final explanations in Spanish.

---

## 1. Human-Confirmed Remote Push Gate (`QA-GIT-GATE-01`)
1. **Local Certified Commit Boundary:** Every verified task (`DOCS_ONLY`, `MICRO_CHANGE`, or `FULL_11X`) MUST conclude at a clean, certified local `git commit` only after passing all applicable Level-11X verification gates (`./.agents/scripts/certify_task_completion.sh`, `make lint-docs`, `make lint-workflows`, and ephemeral Docker test suites).
2. **Post-Commit Halt Invariant:** Once the local `git commit` succeeds and workspace hygiene is verified (`git status -s`), the AI agent MUST stop and report the local commit hash and verification telemetry without mutating any remote reference.

---

## 2. Zero Blind Remote Mutation & `ApprovalRequest` Alignment
1. **Strict Remote Prohibition:** Automatic `git push`, `git push --force`, `git push --force-with-lease`, remote branch deletion, tag pushing (`git push --tags`), or artifact/registry publishing (`npm publish`, `docker push`, `gh release create`) at task closure is **STRICTLY FORBIDDEN**.
2. **Explicit Unlock Conditions:** Remote publication is permitted ONLY when at least one of the following holds:
   - The human operator **explicitly authorizes** the remote push or publication in the **current active prompt** (prior-turn approvals never carry over automatically).
   - A formal **Release Readiness Gate (`GO`)** has been explicitly approved by the human operator for the target version/tag.
3. **Mutating Tool Governance Parity (`ApprovalRequest` `AWAITING_APPROVAL`):** Remote repositories and package registries are shared, externally visible state boundaries. Treating every remote push/publish operation as `AWAITING_APPROVAL` enforces 1:1 security parity with Service-Layer RBAC and state-mutating MCP tool execution (`DISA ASD STIG V6R5` / Zero-Trust Change Control).
