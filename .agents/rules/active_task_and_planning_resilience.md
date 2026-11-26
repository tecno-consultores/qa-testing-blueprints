# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 📋 Active Task Tracking & Atomic Flight Recorder Guardrail (Standard 11X)

## 1. Atomic Flight Recorder & Planning Protocol
- **Pre-Plan Disambiguation & YAGNI Gate:** On ambiguous `FULL_11X` requests, ask closed multiple-choice clarifications with a recommended option, weigh `2–3` alternatives (incl. *doing nothing*), and prune unrequested YAGNI scope before `/plan`.
- **Planning (`FULL_11X` vs. `MICRO_CHANGE`):** Invoke `/plan` before modifying code on `FULL_11X` tasks (`> 3` files, schema/API, or `MED`/`HIGH` blast radius). Use a 3-line inline plan on `MICRO_CHANGE`.
- **Conditional Session Recovery (Zero Waste on Clean Start):** Call `session_flight_recorder(action="recover")` (`checkpoint_ctl.py recover`) **ONLY** when resuming interrupted work or when Git shows modified files (`0` calls on clean repos with new tasks).
- **Single Source of Truth (`0600` JSON -> Projected Markdown):** Record phase transitions and closures **solely** via `session_flight_recorder(action="save" | "clear")` (`checkpoint_ctl.py set` / `clear`, `intent_140chars <= 140`). `save` atomically persists `.agents/.cache/session_checkpoint.json` (`0600`) and projects `.agents/ACTIVE_TASK.md` (`<= 40` lines); `clear` writes a clean `CERTIFIED_CLEAN` projection with `planned_steps = []` that will not resurrect on subsequent `recover` calls.
- **FORBIDDEN:** Do NOT edit `.agents/ACTIVE_TASK.md` manually with `edit_file` and do NOT narrate file diffs in prose that `git diff` already tracks.
- **Pre-Code `Analyze`, `[P]` Waves & 2-Stage Clean-Context Review (`0` Docker):** Verify `REQ -> Task -> Test` (`Analyze`) and mark `[P]` only when touched file sets are 100% disjoint (`references/10-sdd-ears-traceability.md`). Before `make certify` on `FULL_11X`, run a 2-stage read-only subagent review (`Spec Compliance` -> `11X Quality/Anti-Silo`) with **zero `docker run` calls** (`QA-DOCKER-LOOP-01`).
- **Automatic Command Telemetry & Closure:** `certify_task_completion.sh` (`trap EXIT`) and `run_ephemeral_qa` auto-record stage telemetry via `checkpoint_ctl.py`; `certify_task_completion` exiting `0` with `0` FAIL automatically promotes `.agents/ACTIVE_TASK.md` to `CERTIFIED_CLEAN` even when optional/tier-scoped gates report `SKIPPED` (otherwise finalize via `session_flight_recorder(action="clear")` / `checkpoint_ctl.py clear`). Keep `.agents/ACTIVE_TASK.md` and `.agents/.cache/` git-ignored, conclude at local commit (`QA-GIT-GATE-01`), and suggest `/compact`.
