#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Single-source cognitive budgets and AST blast-radius thresholds for QA 11X."""

from __future__ import annotations

SKILL_MAX_BYTES: int = 20_480
ARCHITECT_SKILL_MAX_BYTES: int = 12_288
TACTICAL_SKILL_MAX_BYTES: int = 2_560
ACTIVE_TASK_MAX_LINES: int = 40
ACTIVE_TASK_RULE_MAX_LINES: int = 25

HIGH_BLAST_CALLERS_THRESHOLD: int = 15
MODERATE_BLAST_CALLERS_THRESHOLD: int = 5
MICRO_CHANGE_MAX_FILES: int = 3

SECURITY_BLAST_KEYWORDS: tuple[str, ...] = (
    "vault",
    "auth",
    "token",
    "rls",
    "security",
    "csrf",
    "secret",
    "session",
    "rbac",
)
