#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/verify_diff_coverage.py (Hito 21)."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    import verify_diff_coverage as vdc
else:
    _SCRIPT_PATH = (
        Path(__file__).resolve().parents[1]
        / ".agents"
        / "scripts"
        / "verify_diff_coverage.py"
    )
    _SPEC = importlib.util.spec_from_file_location("verify_diff_coverage", _SCRIPT_PATH)
    assert _SPEC is not None and _SPEC.loader is not None
    vdc = importlib.util.module_from_spec(_SPEC)
    sys.modules["verify_diff_coverage"] = vdc
    _SPEC.loader.exec_module(vdc)

PRAGMA_EVADE = "# pragma: no cov" + "er"
V8_EVADE = "// v8 ig" + "nore next"
C8_EVADE = "/* c8 ig" + "nore */"
PHP_EVADE = "@codeCoverageIg" + "nore"


def _git(repo: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        shell=False,
        check=True,
    )
    return res.stdout.strip()


def _init_repo(tmp_path: Path, *, with_commit: bool = True) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir(parents=True)
    _git(repo, "init", "-b", "main")
    _git(repo, "config", "user.email", "qa@tecno.local")
    _git(repo, "config", "user.name", "QA Bot")
    if with_commit:
        _write(repo, "README.md", "# Init\n")
        _git(repo, "add", "README.md")
        _git(repo, "commit", "-m", "init")
    return repo


def _write(root: Path, rel: str, content: str) -> Path:
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


def test_clean_repo_and_docs_only_fast_path(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    clean_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert clean_rep.exit_code == vdc.EXIT_OK
    assert clean_rep.status == "SKIPPED"
    assert "árbol limpio" in clean_rep.summary_line

    _write(repo, "README.md", "# Updated\n")
    _write(repo, "docs/guide.sh", "echo ok\n")
    docs_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert docs_rep.exit_code == vdc.EXIT_OK
    assert "Fast-Path DOCS_ONLY" in docs_rep.summary_line


def test_security_xxe_traversal_symlink_and_bad_refs(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, "pkg/app.py", "def ok() -> int:\n    return 1\n")
    _git(repo, "add", "pkg/app.py")

    _write(repo, "cov/python.xml", "<!DOCTYPE foo><coverage/>")
    xxe_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert xxe_rep.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT
    assert "Anti-XXE" in (xxe_rep.error_detail or "")

    _write(repo, "cov/python.xml", "<coverage><broken")
    bad_xml = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert bad_xml.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT

    escape_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="../escape")
    )
    assert escape_rep.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT

    bad_ref = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, base_ref="-badref", reports_dir="cov")
    )
    assert bad_ref.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT

    missing_ref = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(
            workspace=repo, base_ref="no_such_ref", reports_dir="cov"
        )
    )
    assert missing_ref.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT


def test_contained_path_null_byte_and_symlink_escape(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    outside = tmp_path / "secret.xml"
    outside.write_text("<coverage/>", encoding="utf-8")
    cov_dir = repo / "cov"
    cov_dir.mkdir()
    (cov_dir / "leak.xml").symlink_to(outside)

    with pytest.raises(vdc.SecurityValidationError):
        vdc.resolve_contained_reports_dir(repo, "bad\0dir")

    with pytest.raises(vdc.SecurityValidationError):
        vdc.resolve_contained_reports_dir(repo, "   ")

    abs_dir = vdc.resolve_contained_reports_dir(repo, str(cov_dir))
    assert abs_dir == cov_dir.resolve()

    _write(repo, "src/x.py", "a = 1\n")
    _git(repo, "add", "src/x.py")
    sym_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert sym_rep.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT
    assert "Enlace simbólico" in (sym_rep.error_detail or "")


@pytest.mark.parametrize(
    ("rel_path", "line_text"),
    [
        ("pkg/a.py", f"x = 1  {PRAGMA_EVADE}\n"),
        ("src/b.ts", f"{V8_EVADE}\nconst x = 1;\n"),
        ("src/c.ts", f"{C8_EVADE}\nconst y = 2;\n"),
        ("src/D.php", f"// {PHP_EVADE}\n$z = 3;\n"),
    ],
)
def test_anti_evasion_blocks_unapproved_markers(
    tmp_path: Path, rel_path: str, line_text: str
) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, rel_path, line_text)
    _git(repo, "add", rel_path)
    report = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert report.exit_code == vdc.EXIT_EVASION_DETECTED
    assert report.evasion_findings
    out = vdc.format_report_output(report)
    assert "EVASION_DETECTED" in out


def test_anti_evasion_allows_approved_and_test_or_doc_files(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    _write(
        repo,
        "pkg/ok.py",
        (
            "def f() -> int:\n"
            f"    if True:  {PRAGMA_EVADE}  # QA11X-APPROVED-EXCLUSION(CLI)\n"
            "        return 1\n"
            "# QA11X-APPROVED-EXCLUSION(rama previa)\n"
            f"val = 2  {PRAGMA_EVADE}\n"
        ),
    )
    _write(repo, "tests/helper_test.py", f"bad = 1  {PRAGMA_EVADE}\n")
    _write(
        repo,
        "cov/python.xml",
        (
            "<coverage><packages><package><classes>"
            '<class filename="pkg/ok.py"><lines>'
            '<line number="1" hits="1"/>'
            '<line number="5" hits="1"/>'
            "</lines></class>"
            "</classes></package></packages></coverage>"
        ),
    )
    _git(repo, "add", "pkg/ok.py", "tests/helper_test.py")
    report = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert report.exit_code == vdc.EXIT_OK


def test_cobertura_xml_normalization_pass_and_fail(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    _write(
        repo, "pkg/app.py", "def run(flag: bool) -> int:\n    return 1 if flag else 0\n"
    )
    _write(repo, "pkg/good.py", "OK = 1\n")
    _git(repo, "add", "pkg/app.py", "pkg/good.py")
    _write(
        repo,
        "cov/python.xml",
        (
            "<coverage><sources><source>/app</source>"
            "<source>.</source><source>  </source></sources>"
            "<packages><package><classes>"
            '<class filename=""><lines><line number="1" hits="1"/></lines></class>'
            '<class filename="/app/pkg/app.py"><lines>'
            '<line number="1" hits="1" condition-coverage="0% (0/0)"/>'
            '<line number="2" hits="1" condition-coverage="50% (1/2)"/>'
            "</lines></class>"
            '<class filename="pkg/app.py"><lines>'
            '<line number="2" hits="1" condition-coverage="100% (2/2)"/>'
            "</lines></class>"
            '<class filename="pkg/good.py"><lines>'
            '<line number="1" hits="1"/>'
            "</lines></class>"
            "</classes></package></packages></coverage>"
        ),
    )
    pass_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert pass_rep.exit_code == vdc.EXIT_OK
    assert vdc.format_report_output(pass_rep).startswith("✔")

    _write(
        repo,
        "cov/python.xml",
        (
            "<coverage><sources><source>/app/pkg</source></sources>"
            "<packages><package><classes>"
            '<class filename="app.py"><lines>'
            '<line number="1" hits="1"/>'
            '<line number="2" hits="0" condition-coverage="50% (1/2)"/>'
            "</lines></class>"
            '<class filename="good.py"><lines>'
            '<line number="1" hits="1"/>'
            "</lines></class>"
            "</classes></package></packages></coverage>"
        ),
    )
    fail_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert fail_rep.exit_code == vdc.EXIT_COVERAGE_FAIL
    formatted = vdc.format_report_output(fail_rep)
    assert "Líneas descubiertas" in formatted
    assert "pkg/app.py" in formatted
    assert "pkg/good.py" not in formatted


def test_lcov_parsing_stem_rewrite_and_branch_threshold(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = _init_repo(tmp_path)
    target = "mcp-server/src/runner.ts"
    _write(repo, target, "export const a = 1;\nexport const b = 2;\n")
    _git(repo, "add", target)

    brda_pass = "\n".join(f"BRDA:2,0,{i},{'-' if i == 0 else '1'}" for i in range(20))
    lcov_pass = (
        "TN:unit\n"
        "DA:1,1\n"
        "SF:\\app\\.\\src\\runner.ts\n"
        "LF:2\n"
        "DA:invalid\n"
        "DA:1,1\n"
        "DA:2,1\n"
        "BRDA:bad\n"
        f"{brda_pass}\n"
    )
    _write(repo, "cov/mcp-server.info", lcov_pass)
    (repo / "cov" / "subdir").mkdir()
    _write(repo, "cov/ignore.txt", "noop")

    assert vdc.normalize_reported_path("", repo) == ""
    assert vdc.normalize_reported_path("/workspace/./missing.ts", repo) == "missing.ts"
    ws_abs = f"{repo.resolve().as_posix()}/{target}"
    assert vdc.normalize_reported_path(ws_abs, repo.resolve()) == target
    with pytest.raises(vdc.SecurityValidationError):
        vdc._ensure_contained_path(repo, Path(f"{repo}/bad\0file"), "nul")

    rc = vdc.main(["--workspace", str(repo), "--reports-dir", "cov"])
    assert rc == vdc.EXIT_OK
    assert "PASSED" in capsys.readouterr().out

    brda_fail = "\n".join(f"BRDA:2,0,{i},{'-' if i < 2 else '1'}" for i in range(10))
    lcov_fail = f"SF:/repo/{target}\nDA:1,1\nDA:2,1\n{brda_fail}\nend_of_record\n"
    _write(repo, "cov/mcp-server.info", lcov_fail)
    rc_fail = vdc.main(["--workspace", str(repo), "--reports-dir", "cov"])
    assert rc_fail == vdc.EXIT_COVERAGE_FAIL
    assert "FAILED" in capsys.readouterr().err


def test_missing_new_file_unborn_head_merge_base_and_edge_diffs(tmp_path: Path) -> None:
    unborn = _init_repo(tmp_path / "u", with_commit=False)
    _write(unborn, "src/new_mod.py", "def hi() -> int:\n    return 1\n")
    _git(unborn, "add", "src/new_mod.py")
    unborn_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=unborn, reports_dir="missing_cov")
    )
    assert unborn_rep.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT
    assert "src/new_mod.py" in unborn_rep.missing_report_files

    repo = _init_repo(tmp_path / "m")
    _write(repo, "src/existing.py", "# only comment\n")
    _write(repo, "src/obsolete.py", "x = 1\n")
    _git(repo, "add", "src/existing.py", "src/obsolete.py")
    _git(repo, "commit", "-m", "base")
    _git(repo, "checkout", "-b", "feat/h21")

    _write(repo, "src/existing.py", "# only comment\n# another comment\n")
    _git(repo, "rm", "-q", "src/obsolete.py")
    _write(repo, "cov/python.xml", "<coverage/>")

    feat_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, base_ref="main", reports_dir="cov")
    )
    assert feat_rep.exit_code == vdc.EXIT_OK

    _write(repo, "src/empty.ts", "")
    _write(repo, "src/comments_only.py", "# only comment\n")
    (repo / "src" / "dangling.py").symlink_to(repo / "src" / "missing_target.py")
    _write(repo, "src/intent.py", "y = 1\n")
    _git(repo, "add", "-N", "src/intent.py")
    _write(repo, "src/types.d.ts", "export type X = number;\n")
    _write(repo, "alembic/versions/001.py", "revision = '001'\n")
    _write(repo, "src/untracked.py", "z = 1\n")

    untracked_rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert untracked_rep.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT
    assert "src/untracked.py" in untracked_rep.missing_report_files
    assert "src/intent.py" in untracked_rep.missing_report_files
    assert "src/comments_only.py" not in untracked_rep.missing_report_files
    assert "src/types.d.ts" not in untracked_rep.missing_report_files

    preset = vdc.DiffFileChange("src/untracked.py", True, {1: "z"})
    already = {"src/untracked.py": preset}
    vdc._collect_untracked_files(repo, already)
    assert already["src/untracked.py"] is preset


def test_parse_diff_delta_skip_when_no_executable_lines(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, "pkg/mod.py", "# header\nx = 1\n")
    _git(repo, "add", "pkg/mod.py")
    _write(
        repo,
        "cov/python.xml",
        (
            "<coverage><packages><package><classes>"
            '<class filename="pkg/mod.py"><lines>'
            '<line number="2" hits="1"/>'
            "</lines></class></classes></package></packages></coverage>"
        ),
    )
    _git(repo, "commit", "-m", "add mod")
    _write(repo, "pkg/mod.py", "# header\nx = 1\n# trailing note\n")
    rep = vdc.evaluate_diff_coverage(
        vdc.DiffCoverageConfig(workspace=repo, reports_dir="cov")
    )
    assert rep.exit_code == vdc.EXIT_OK
