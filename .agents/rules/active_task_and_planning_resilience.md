# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 📋 Active Task Tracking & Planning Tool Resilience Guardrail (Standard 11X)

## 1. Rationale & Core Invariant
In long-running autonomous development across complex codebases, AI assistants and IDE processes face three catastrophic failure modes:
1. **IDE Process Crashes & Hangs:** Sudden termination of agent sessions, terminals, or background workers.
2. **Context Compaction & Rolling Truncation:** Context limits wipe earlier conversational rationale, instructions, and completed phase tracking.
3. **Session Interruption & Reboot:** Loss of in-memory short-term scratchpads.

To guarantee zero context loss and immediate session recovery, all AI agents (Google Antigravity, Claude, Hermes, Cursor) MUST adhere to the **Active Task Invariant**:
> **NON-NEGOTIABLE:** Never modify source code on non-trivial tasks without initializing and maintaining `.agents/ACTIVE_TASK.md` in real-time.

---

## 2. The Dual Planning & Persistence Protocol

```text
┌────────────────────────────────────────────────────────────────────────┐
│              PLANNING TOOL & ACTIVE_TASK DUAL PROTOCOL                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. INITIATION: User issues task, bugfix, or roadmap milestone          │
│    └── Invoke planning tool (/plan or interactive plan artifact).      │
│                                                                        │
│ 2. PERSISTENCE: Bootstrap .agents/ACTIVE_TASK.md from template         │
│    └── Copy from .agents/ACTIVE_TASK.md.example if missing.            │
│    └── Populate Metadata, Goal, Specification, and Phase Checklists.   │
│                                                                        │
│ 3. LIVE EXECUTION: Real-time update in filesystem                      │
│    └── Complete atomic subtask ──> Mark "- [ ]" to "- [x]" IMMEDIATELY.│
│    └── On crash or context loss ─> Read .agents/ACTIVE_TASK.md first.  │
│                                                                        │
│ 4. CLOSURE GATE: Mandatory verification before git push                │
│    └── Update AST graph via ./scripts/actualizar-grafos-graphify.sh.   │
│    └── Run ./.agents/scripts/certify_task_completion.sh (10/10 gates).  │
│    └── Mark status: "COMPLETED (100%)".                                │
│    └── Sync docs/, docs/specs/, CHANGELOG.md, ROADMAP.md, TESTING.md.  │
│    └── Commit & push to git (git add, git commit, git push).           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mandatory Requirements & Token Budget (`<= 40 Lines`)
1. **Bootstrap Template & Compact Budget (`<= 40 Lines`):** Always use `.agents/ACTIVE_TASK.md.example` as the canonical schema and keep `.agents/ACTIVE_TASK.md` strictly under **40 lines** (active checklist items only; never accumulate historical narratives that belong in `CHANGELOG.md`).
2. **Proportional Planning (`MICRO_CHANGE` vs. `FULL_11X`):** Full `/plan` artifacts and multi-phase `ACTIVE_TASK.md` updates are mandatory for `FULL_11X` architectural tasks (`> 3` files, schema/API changes, or `MEDIUM`/`HIGH` blast radius). For `MICRO_CHANGE` tasks (`<= 3` files, `LOW` blast radius), use a concise 3-line inline plan to conserve tokens.
3. **Live Synchronization:** Every completed phase that marks the completion of a checklist item MUST update the corresponding line in `.agents/ACTIVE_TASK.md`.
4. **Clean Version Control & Session Compaction (`/compact`):** `.agents/ACTIVE_TASK.md` MUST remain in `.gitignore`. Upon marking a milestone `COMPLETED (100%)`, proactively recommend `/compact` or a clean session reset before starting an unrelated feature.
