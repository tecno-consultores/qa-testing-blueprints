#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Single-source cognitive budgets and AST blast-radius thresholds for QA 11X."""

from __future__ import annotations

SKILL_MAX_BYTES: int = 20_480
ARCHITECT_SKILL_MAX_BYTES: int = 12_288
TACTICAL_SKILL_MAX_BYTES: int = 2_560
REPO_AGENTS_MD_MAX_BYTES: int = 8_192
GLOBAL_CONNECTOR_MAX_BYTES: int = 1_536
PROJECT_CONNECTOR_MAX_BYTES: int = 1_536
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

STRUCTURAL_AST_RELATIONS: frozenset[str] = frozenset(
    {"contains", "defines", "rationale_for", "documented_in"}
)

CANONICAL_IGNORED_DIRS: frozenset[str] = frozenset(
    {
        ".cache",
        ".git",
        ".hypothesis",
        ".mutmut-cache",
        ".mypy_cache",
        ".next",
        ".nox",
        ".nyc_output",
        ".pnpm-store",
        ".pytest_cache",
        ".ruff_cache",
        ".schemathesis",
        ".stryker-tmp",
        ".tox",
        ".trivycache",
        ".turbo",
        ".venv",
        "__pycache__",
        "build",
        "coverage",
        "dist",
        "graphify-out",
        "htmlcov",
        "mutants",
        "node_modules",
        "target",
        "test-results",
        "vendor",
        "venv",
    }
)

MANIFEST_TRACKED_DOC_EXACT: frozenset[str] = frozenset(
    {
        "AGENTS.md",
        "AI_MASTER_PROMPT.md",
        "AI_MASTER_PROMPT.es.md",
        "SECURITY.md",
        "SECURITY.es.md",
        ".agents/README.md",
    }
)
MANIFEST_TRACKED_DOC_PREFIXES: tuple[str, ...] = (
    ".agents/rules/",
    ".agents/skills/",
    "catalogs/",
)
STACK_README_PATHS: frozenset[str] = frozenset(
    {
        f"{stack}/{name}"
        for stack in (
            "python",
            "fastapi",
            "node-backend",
            "vue3",
            "react-frontend",
            "bash-scripts",
            "php",
            "mobile-appium",
            "ai-evals",
            "vibe-rescue",
        )
        for name in ("README.md", "README.es.md")
    }
)


def is_manifest_tracked_doc(rel_posix: str) -> bool:
    """Return True for Markdown governance/catalog/stack docs in manifest.json."""
    return (
        rel_posix in MANIFEST_TRACKED_DOC_EXACT
        or rel_posix in STACK_README_PATHS
        or rel_posix.startswith(MANIFEST_TRACKED_DOC_PREFIXES)
    )
