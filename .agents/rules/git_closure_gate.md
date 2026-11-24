# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 🔒 Human-Confirmed Remote Push & Release Closure Gate (`QA-GIT-GATE-01`)

## 1. Local Certified Commit Boundary (`QA-GIT-GATE-01`)
1. Every verified task (`DOCS_ONLY`, `MICRO_CHANGE`, `FULL_11X`) MUST stop at a clean, certified local `git commit` after passing `./.agents/scripts/certify_task_completion.sh`, `make lint-docs`, `make lint-workflows`, and applicable ephemeral Docker suites.
2. Once local `git commit` succeeds and `git status -s` is clean, report the commit hash and verification telemetry without mutating any remote reference.

## 2. Zero Blind Remote Mutation & `ApprovalRequest` Parity
1. **Strictly Forbidden:** Automatic `git push`, `--force`/`--force-with-lease`, remote branch deletion, tag push (`git push --tags`), or registry publishing (`npm publish`, `docker push`, `gh release create`).
2. **Unlock Conditions:** Permitted ONLY when the human operator **explicitly authorizes** the push/publish in the **current active prompt** (prior-turn approvals never carry over) OR explicitly approves a Release Readiness Gate (`GO`) for the target tag/version.
3. **Zero-Trust Parity:** Treating every remote push/publish as `ApprovalRequest` (`AWAITING_APPROVAL`) preserves 1:1 DISA ASD STIG V6R5 parity with Service-Layer RBAC and mutating MCP tools.
