# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/_budgets.py y su consumo único (F3.4)."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _REPO_ROOT / ".agents" / "scripts"


def _load_script_without_scripts_in_syspath(
    monkeypatch: pytest.MonkeyPatch, filename: str, alias: str
) -> ModuleType:
    cleaned_path = [p for p in sys.path if Path(p).resolve() != _SCRIPTS_DIR.resolve()]
    monkeypatch.setattr(sys, "path", cleaned_path)
    candidate = Path(filename)
    script_path = candidate if candidate.is_absolute() else _SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(alias, script_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[alias] = mod
    spec.loader.exec_module(mod)
    return mod


def test_budgets_constants_and_ordering_invariants(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    budgets = _load_script_without_scripts_in_syspath(
        monkeypatch, "_budgets.py", "_budgets_isolated"
    )
    assert budgets.SKILL_MAX_BYTES == 20_480
    assert budgets.ARCHITECT_SKILL_MAX_BYTES == 12_288
    assert budgets.TACTICAL_SKILL_MAX_BYTES == 2_560
    assert budgets.REPO_AGENTS_MD_MAX_BYTES == 8_192
    assert budgets.GLOBAL_CONNECTOR_MAX_BYTES == 1_536
    assert budgets.PROJECT_CONNECTOR_MAX_BYTES == 1_536
    assert budgets.ACTIVE_TASK_MAX_LINES == 40
    assert budgets.ACTIVE_TASK_RULE_MAX_LINES == 25
    assert budgets.HIGH_BLAST_CALLERS_THRESHOLD == 15
    assert budgets.MODERATE_BLAST_CALLERS_THRESHOLD == 5
    assert budgets.MICRO_CHANGE_MAX_FILES == 3
    assert isinstance(budgets.SECURITY_BLAST_KEYWORDS, tuple)
    assert "vault" in budgets.SECURITY_BLAST_KEYWORDS
    assert "rbac" in budgets.SECURITY_BLAST_KEYWORDS
    for ignored in (
        ".tox",
        ".nox",
        ".hypothesis",
        ".schemathesis",
        "mutants",
        ".mutmut-cache",
    ):
        assert ignored in budgets.CANONICAL_IGNORED_DIRS

    assert (
        budgets.TACTICAL_SKILL_MAX_BYTES
        < budgets.ARCHITECT_SKILL_MAX_BYTES
        < budgets.SKILL_MAX_BYTES
    )
    assert budgets.ACTIVE_TASK_RULE_MAX_LINES <= budgets.ACTIVE_TASK_MAX_LINES
    assert (
        budgets.MODERATE_BLAST_CALLERS_THRESHOLD < budgets.HIGH_BLAST_CALLERS_THRESHOLD
    )


def test_governance_scripts_share_single_source_budgets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    budgets = _load_script_without_scripts_in_syspath(
        monkeypatch, "_budgets.py", "_budgets_single_source"
    )
    assert "contains" in budgets.STRUCTURAL_AST_RELATIONS
    assert "AGENTS.md" in budgets.MANIFEST_TRACKED_DOC_EXACT
    assert ".agents/skills/" in budgets.MANIFEST_TRACKED_DOC_PREFIXES
    assert "python/README.md" in budgets.STACK_README_PATHS
    assert budgets.is_manifest_tracked_doc("AGENTS.md") is True
    assert budgets.is_manifest_tracked_doc("README.md") is False

    sync_gov = _load_script_without_scripts_in_syspath(
        monkeypatch, "sync_governance.py", "sync_gov_budgets_check"
    )
    ckpt_ctl = _load_script_without_scripts_in_syspath(
        monkeypatch, "checkpoint_ctl.py", "ckpt_ctl_budgets_check"
    )
    verify_docs = _load_script_without_scripts_in_syspath(
        monkeypatch, "verify_docs_invariants.py", "verify_docs_budgets_check"
    )
    blast_sel = _load_script_without_scripts_in_syspath(
        monkeypatch, "select_tests_by_blast_radius.py", "blast_sel_budgets_check"
    )
    blast_insp = _load_script_without_scripts_in_syspath(
        monkeypatch, "inspect_blast_radius.py", "blast_insp_budgets_check"
    )
    pr_verdict = _load_script_without_scripts_in_syspath(
        monkeypatch, "generate_pr_verdict.py", "pr_verdict_budgets_check"
    )
    gen_manifest = _load_script_without_scripts_in_syspath(
        monkeypatch,
        str(_REPO_ROOT / "scripts" / "generar-manifiesto.py"),
        "gen_manifest_isolated",
    )

    assert verify_docs.SKILL_MAX_BYTES == budgets.SKILL_MAX_BYTES
    assert gen_manifest.STACK_METADATA == sync_gov.STACK_METADATA
    assert pr_verdict.STRUCTURAL_AST_RELATIONS == budgets.STRUCTURAL_AST_RELATIONS
    assert pr_verdict.is_manifest_tracked_doc("AGENTS.md") is True
    assert (
        blast_sel.HIGH_BLAST_CALLERS_THRESHOLD == budgets.HIGH_BLAST_CALLERS_THRESHOLD
    )
    assert (
        blast_insp.HIGH_BLAST_CALLERS_THRESHOLD == budgets.HIGH_BLAST_CALLERS_THRESHOLD
    )
    assert sync_gov.SKILL_MAX_BYTES == budgets.SKILL_MAX_BYTES
    assert sync_gov.ARCHITECT_SKILL_MAX_BYTES == budgets.ARCHITECT_SKILL_MAX_BYTES
    assert sync_gov.TACTICAL_SKILL_MAX_BYTES == budgets.TACTICAL_SKILL_MAX_BYTES
    assert sync_gov.REPO_AGENTS_MD_MAX_BYTES == budgets.REPO_AGENTS_MD_MAX_BYTES
    assert verify_docs.REPO_AGENTS_MD_MAX_BYTES == budgets.REPO_AGENTS_MD_MAX_BYTES
    assert verify_docs.GLOBAL_CONNECTOR_MAX_BYTES == budgets.GLOBAL_CONNECTOR_MAX_BYTES
    assert (
        verify_docs.PROJECT_CONNECTOR_MAX_BYTES == budgets.PROJECT_CONNECTOR_MAX_BYTES
    )
    assert sync_gov.ACTIVE_TASK_MAX_LINES == budgets.ACTIVE_TASK_MAX_LINES
    assert sync_gov.ACTIVE_TASK_RULE_MAX_LINES == budgets.ACTIVE_TASK_RULE_MAX_LINES
    assert ckpt_ctl.ACTIVE_TASK_MAX_LINES == budgets.ACTIVE_TASK_MAX_LINES

    # Verificar límites exactos en validate_cognitive_budgets (12_288 / 2_560 / 20_480)
    arch_skill = tmp_path / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
    tact_skill = tmp_path / ".agents" / "skills" / "tactical-patterns-11x" / "SKILL.md"
    other_skill = tmp_path / ".agents" / "skills" / "demo-skill" / "SKILL.md"
    for p in (arch_skill, tact_skill, other_skill):
        p.parent.mkdir(parents=True, exist_ok=True)

    arch_skill.write_bytes(b"a" * budgets.ARCHITECT_SKILL_MAX_BYTES)
    tact_skill.write_bytes(b"t" * budgets.TACTICAL_SKILL_MAX_BYTES)
    other_skill.write_bytes(b"o" * (budgets.SKILL_MAX_BYTES - 1))
    assert sync_gov.validate_cognitive_budgets(tmp_path) == []

    arch_skill.write_bytes(b"a" * (budgets.ARCHITECT_SKILL_MAX_BYTES + 1))
    tact_skill.write_bytes(b"t" * (budgets.TACTICAL_SKILL_MAX_BYTES + 1))
    other_skill.write_bytes(b"o" * budgets.SKILL_MAX_BYTES)
    errs = sync_gov.validate_cognitive_budgets(tmp_path)
    assert len(errs) == 3
    assert any("qa-11x-architect/SKILL.md" in e for e in errs)
    assert any("tactical-patterns-11x/SKILL.md" in e for e in errs)
    assert any("demo-skill/SKILL.md" in e for e in errs)


def test_scripts_cli_entrypoint_imports_budgets_without_pythonpath() -> None:
    clean_env = {"PATH": "/usr/local/bin:/usr/bin:/bin"}
    for script_name in ("sync_governance.py", "checkpoint_ctl.py"):
        proc = subprocess.run(
            [sys.executable, str(_SCRIPTS_DIR / script_name), "--help"],
            env=clean_env,
            capture_output=True,
            text=True,
            shell=False,
            check=False,
        )
        assert proc.returncode == 0, f"{script_name} --help falló: {proc.stderr}"
