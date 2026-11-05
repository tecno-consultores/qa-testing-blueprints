# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

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

## 3. Mandatory Requirements
1. **Bootstrap Template:** Always use `.agents/ACTIVE_TASK.md.example` as the canonical schema.
2. **Live Synchronization:** Every completed command, test pass, or file edit that marks the completion of a checklist item MUST immediately update the corresponding line in `.agents/ACTIVE_TASK.md`.
3. **Clean Version Control:** `.agents/ACTIVE_TASK.md` MUST remain in `.gitignore` to avoid polluting the remote git repository with transient local session states.
