# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# 📋 Active Task Tracking & Atomic Flight Recorder Guardrail (Standard 11X)

## 1. Atomic Flight Recorder & Planning Protocol
- **Planning (`FULL_11X` vs. `MICRO_CHANGE`):** Invoke `/plan` before modifying code on `FULL_11X` tasks (`> 3` files, schema/API, or `MED`/`HIGH` blast radius). Use a 3-line inline plan on `MICRO_CHANGE`.
- **Conditional Session Recovery (Zero Waste on Clean Start):** Call `session_flight_recorder(action="recover")` (`checkpoint_ctl.py recover`) **ONLY** when resuming interrupted work or when Git shows modified files (`0` calls on clean repos with new tasks).
- **Single Source of Truth (`0600` JSON -> Projected Markdown):** Record phase transitions **solely** via `session_flight_recorder(action="save")` (`checkpoint_ctl.py set`, `intent_140chars <= 140`). It atomically persists `.agents/.cache/session_checkpoint.json` (`0600`) and projects `.agents/ACTIVE_TASK.md` (`<= 40` lines).
- **FORBIDDEN:** Do NOT edit `.agents/ACTIVE_TASK.md` manually with `edit_file` and do NOT narrate file diffs in prose that `git diff` already tracks.
- **Automatic Command Telemetry & Closure:** `certify_task_completion.sh` (`trap EXIT`) and `run_ephemeral_qa` auto-record telemetry and promote `CERTIFIED_CLEAN` / `COMPLETED (100%)` on gate pass. Keep `.agents/ACTIVE_TASK.md` and `.agents/.cache/` git-ignored, conclude at local commit (`QA-GIT-GATE-01`), and suggest `/compact`.
