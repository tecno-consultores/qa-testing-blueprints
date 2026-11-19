# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/track_findings_state.py (Hito 22)."""

from __future__ import annotations

import importlib.util
import io
import json
import stat
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

_SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / ".agents"
    / "scripts"
    / "track_findings_state.py"
)

if TYPE_CHECKING:
    import track_findings_state as tfs
else:
    _SPEC = importlib.util.spec_from_file_location("track_findings_state", _SCRIPT_PATH)
    assert _SPEC is not None and _SPEC.loader is not None
    tfs = importlib.util.module_from_spec(_SPEC)
    sys.modules["track_findings_state"] = tfs
    _SPEC.loader.exec_module(tfs)


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
        (repo / "README.md").write_text("# Init\n", encoding="utf-8")
        _git(repo, "add", "README.md")
        _git(repo, "commit", "-m", "init")
    return repo


def test_normalization_line_shift_and_secret_redaction(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"
    token_sample = "ghp_" + "A" * 20
    bearer_sample = "Bearer " + "tok_" + "secret_99"
    url_sample = "https://admin:" + "pass_" + "123@db.local/api"

    finding_a = {
        "layer": "lint",
        "stack": "python",
        "file": f"{repo.as_posix()}/src\\service.py:14:2",
        "rule": "E501",
        "message": (
            f"line 14 at 0x7f8a1c0020b0 in /tmp/run_1/x.py took 85.2ms "
            f"at 2026-11-14T19:40:52Z with {token_sample} {bearer_sample} {url_sample}"
        ),
    }
    finding_b = {
        "stage": "lint",
        "stack": "python",
        "path": "/app/src/service.py(128, 9)",
        "code": "E501",
        "error_summary": (
            "line 128 at 0x00001234abcd in /tmp/run_99/y.py took 12s "
            "at 2026-12-01T00:00:00+00:00 with [REDACTED] Bearer [REDACTED] "
            "https://admin:[REDACTED]@db.local/api"
        ),
    }

    norm_a = tfs.normalize_finding(finding_a, repo)
    norm_b = tfs.normalize_finding(finding_b, repo)
    assert norm_a.fingerprint == norm_b.fingerprint
    assert norm_a.relative_file == "src/service.py"
    assert token_sample not in norm_a.canonical_message
    assert "secret_99" not in norm_a.canonical_message
    assert "pass_123" not in norm_a.canonical_message

    minimal_norm = tfs.normalize_finding({"message": "only message"}, repo)
    assert minimal_norm.stack == "generic"
    assert minimal_norm.relative_file == "<unknown>"

    r1 = tfs.evaluate_and_record(
        state_file=state_file, workspace=repo, payload=[finding_a, finding_a]
    )
    assert r1.exit_code == 1
    assert r1.active_count == 1
    assert r1.new_count == 1

    r2 = tfs.evaluate_and_record(
        state_file=state_file, workspace=repo, payload=[finding_b]
    )
    assert r2.exit_code == 1
    assert r2.persistent_count == 1
    assert r2.evaluations[0].consecutive_streak == 2

    assert stat.S_IMODE(state_file.parent.stat().st_mode) == 0o700
    assert stat.S_IMODE(state_file.stat().st_mode) == 0o600


def test_streak_three_triggers_breaker_42_and_resolution(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"
    finding = {
        "layer": "unit",
        "stack": "node",
        "file": "src/auth.ts:20:5",
        "rule": "TS2322",
        "message": "Type string is not assignable to number",
    }

    assert (
        tfs.evaluate_and_record(state_file=state_file, workspace=repo, payload=[])
        .exit_code
        == 0
    )
    assert (
        tfs.evaluate_and_record(
            state_file=state_file, workspace=repo, payload=[finding]
        ).exit_code
        == 1
    )
    assert (
        tfs.evaluate_and_record(
            state_file=state_file, workspace=repo, payload=[finding]
        ).exit_code
        == 1
    )
    r3 = tfs.evaluate_and_record(
        state_file=state_file, workspace=repo, payload=[finding]
    )
    assert r3.exit_code == 42
    assert r3.evaluations[0].blocking is True
    assert r3.evaluations[0].consecutive_streak == 3
    text = tfs.format_report_output(r3)
    assert "[BREAKER-42] ANTI-LOOP ACTIVADO" in text
    assert "inspect_ast_blast_radius" in text
    assert "qa-11x-systematic-debugging" in text

    # Etapa distinta ('certify') no mezcla historial de 'qa'
    r_certify = tfs.evaluate_and_record(
        state_file=state_file,
        workspace=repo,
        payload={"stage": "certify", "findings": []},
    )
    assert r_certify.exit_code == 0
    assert r_certify.resolved_count == 0

    # Al pasar stage="qa" explícito con lista vacía sí resuelve el hallazgo previo
    r4 = tfs.evaluate_and_record(
        state_file=state_file,
        workspace=repo,
        payload={"stage": "certify", "findings": []},
        stage="qa",
    )
    assert r4.exit_code == 0
    assert r4.resolved_count == 1
    pass_line = tfs.format_report_output(r4)
    assert pass_line.startswith("[PASS] CERTIFY-STATE |")
    assert "\n" not in pass_line

    raw_doc = json.loads(state_file.read_text(encoding="utf-8"))
    assert raw_doc["version"] == 2
    session_entry = raw_doc["sessions"][r4.session_key]
    assert "qa" in session_entry["stage_runs"]
    assert "certify" in session_entry["stage_runs"]
    assert session_entry["streaks"]["qa"] == 0
    assert session_entry["oscillations"]["qa"] == 0
    assert tfs._resolve_stage_id("  lint  ", "qa") == "lint"


def test_oscillation_a_b_a_triggers_breaker_42_only_blocking(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"
    finding_a = {
        "layer": "unit",
        "stack": "python",
        "file": "src/a.py:10",
        "rule": "assert_a",
        "message": "Failure A",
    }
    finding_b = {
        "layer": "unit",
        "stack": "python",
        "file": "src/b.py:22",
        "rule": "assert_b",
        "message": "Failure B",
    }
    finding_c = {
        "layer": "unit",
        "stack": "python",
        "file": "src/c.py:33",
        "rule": "assert_c",
        "message": "Non blocking C",
    }

    assert (
        tfs.evaluate_and_record(
            state_file=state_file, workspace=repo, payload=[finding_a]
        ).exit_code
        == 1
    )
    assert (
        tfs.evaluate_and_record(
            state_file=state_file, workspace=repo, payload=[finding_b]
        ).exit_code
        == 1
    )
    r3 = tfs.evaluate_and_record(
        state_file=state_file, workspace=repo, payload=[finding_a, finding_c]
    )
    assert r3.exit_code == 42
    assert r3.oscillation_count == 1
    assert r3.new_count == 1
    out = tfs.format_report_output(r3)
    assert "Failure A" in out
    assert "Non blocking C" not in out


def test_branch_isolation_detached_unborn_and_nogit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"
    finding = {
        "layer": "lint",
        "stack": "python",
        "file": "src/x.py:1",
        "rule": "F401",
        "message": "unused import",
    }
    tfs.evaluate_and_record(state_file=state_file, workspace=repo, payload=[finding])
    tfs.evaluate_and_record(state_file=state_file, workspace=repo, payload=[finding])

    _git(repo, "checkout", "-b", "feat/hito-22")
    branch_run = tfs.evaluate_and_record(
        state_file=state_file, workspace=repo, payload=[finding], base_ref="main"
    )
    assert branch_run.exit_code == 1
    assert branch_run.session_key.startswith("feat/hito-22:")
    assert branch_run.new_count == 1

    _git(repo, "checkout", "--detach", "HEAD")
    assert tfs.resolve_session_key(repo).startswith("detached:")
    assert tfs.resolve_session_key(repo, base_ref="nonexistent_ref").startswith(
        "detached:"
    )

    unborn = _init_repo(tmp_path / "unborn_wrap", with_commit=False)
    assert tfs.resolve_session_key(unborn).endswith(":unborn")

    nogit = tmp_path / "no_git"
    nogit.mkdir()
    assert tfs.resolve_session_key(nogit) == "nogit:unborn"

    def _boom(*_args: object, **_kwargs: object) -> object:
        raise OSError("git missing")

    monkeypatch.setattr(subprocess, "run", _boom)
    assert tfs.resolve_session_key(repo) == "nogit:unborn"


def test_history_cap_corrupt_state_and_cwd_parent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / "certify_state.json"
    monkeypatch.chdir(repo)
    orig_dir_mode = stat.S_IMODE(repo.stat().st_mode)

    state_file.write_text("{corrupt-json", encoding="utf-8")
    for idx in range(12):
        item = {
            "layer": "lint",
            "stack": "python",
            "file": f"src/f_{idx}.py:1",
            "rule": "F401",
            "message": f"err {idx}",
        }
        tfs.evaluate_and_record(state_file=state_file, workspace=repo, payload=[item])

    assert stat.S_IMODE(repo.stat().st_mode) == orig_dir_mode
    raw_doc = json.loads(state_file.read_text(encoding="utf-8"))
    session_key = tfs.resolve_session_key(repo)
    assert raw_doc["version"] == 2
    assert "runs" not in raw_doc["sessions"][session_key]
    assert len(raw_doc["sessions"][session_key]["stage_runs"]["qa"]) == 10
    assert raw_doc["sessions"][session_key]["streaks"]["qa"] == 1
    assert raw_doc["sessions"][session_key]["oscillations"]["qa"] == 0

    # Migración v1 -> v2 preservando historial previo en stage_runs["qa"]
    v1_runs = [
        {"findings": ["fp_a", "fp_b"]},
        {"findings": ["fp_a"]},
    ]
    state_file.write_text(
        json.dumps({"version": 1, "sessions": {session_key: {"runs": v1_runs}}}),
        encoding="utf-8",
    )
    loaded_v1 = tfs._load_state_doc(state_file)
    assert loaded_v1["version"] == 2
    assert loaded_v1["sessions"][session_key]["runs"] == v1_runs
    assert tfs._extract_history_sets({"runs": [{"fingerprints": ["fp_a"]}]}) == [
        {"fp_a"}
    ]

    state_file.write_text(json.dumps({"version": 2, "sessions": []}), encoding="utf-8")
    loaded = tfs._load_state_doc(state_file)
    assert loaded == {"version": 2, "sessions": {}}
    state_file.write_text(
        json.dumps({"version": 2, "sessions": {"s": {}}}), encoding="utf-8"
    )
    assert tfs._load_state_doc(state_file) == {"version": 2, "sessions": {"s": {}}}
    assert tfs._extract_history_sets({"runs": ["invalid-run-entry"]}) == []
    assert tfs._extract_history_sets({"stage_runs": {"qa": ["bad"]}}, stage="qa") == []


def test_cli_reset_stdin_symlinks_and_error_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"

    monkeypatch.setattr(
        sys,
        "stdin",
        io.StringIO(
            json.dumps(
                [
                    {
                        "layer": "lint",
                        "stack": "python",
                        "file": "a.py:3",
                        "rule": "B001",
                        "message": "bad",
                    }
                ]
            )
        ),
    )
    rc1 = tfs.main(
        [
            "--state-file",
            str(state_file),
            "--findings-input",
            "-",
            "--workspace",
            str(repo),
        ]
    )
    assert rc1 == 1
    assert "[FAIL] CERTIFY-STATE" in capsys.readouterr().err

    rc_reset_only = tfs.main(
        ["--state-file", str(state_file), "--workspace", str(repo), "--reset-state"]
    )
    assert rc_reset_only == 0
    assert "reset=true" in capsys.readouterr().out

    findings_file = tmp_path / "findings.json"
    findings_file.write_text(
        json.dumps({"stage": "certify", "findings": []}), encoding="utf-8"
    )
    rc_reset_with_file = tfs.main(
        [
            "--state-file",
            str(state_file),
            "--findings-input",
            str(findings_file),
            "--workspace",
            str(repo),
            "--stage",
            "lint",
            "--reset-state",
        ]
    )
    assert rc_reset_with_file == 0
    assert "[PASS] CERTIFY-STATE" in capsys.readouterr().out
    saved_doc = json.loads(state_file.read_text(encoding="utf-8"))
    s_key = tfs.resolve_session_key(repo)
    assert "lint" in saved_doc["sessions"][s_key]["stage_runs"]

    bad_payload = tmp_path / "bad_payload.json"
    bad_payload.write_text('"not-a-list"', encoding="utf-8")
    assert (
        tfs.main(
            [
                "--state-file",
                str(state_file),
                "--findings-input",
                str(bad_payload),
                "--workspace",
                str(repo),
            ]
        )
        == 2
    )
    capsys.readouterr()

    assert (
        tfs.main(
            [
                "--state-file",
                str(state_file),
                "--findings-input",
                str(findings_file),
                "--workspace",
                str(repo),
                "--max-streak",
                "0",
            ]
        )
        == 2
    )
    capsys.readouterr()

    assert (
        tfs.main(
            [
                "--state-file",
                str(state_file),
                "--findings-input",
                str(findings_file),
                "--workspace",
                str(repo),
                "--base-ref=--upload-pack=evil",
            ]
        )
        == 2
    )
    capsys.readouterr()

    sym_state = tmp_path / "sym_state.json"
    sym_state.symlink_to(state_file)
    assert (
        tfs.main(
            [
                "--state-file",
                str(sym_state),
                "--findings-input",
                str(findings_file),
                "--workspace",
                str(repo),
            ]
        )
        == 2
    )
    capsys.readouterr()

    sym_findings = tmp_path / "sym_findings.json"
    sym_findings.symlink_to(findings_file)
    assert (
        tfs.main(
            [
                "--state-file",
                str(state_file),
                "--findings-input",
                str(sym_findings),
                "--workspace",
                str(repo),
            ]
        )
        == 2
    )
    capsys.readouterr()

    class _TtyStream:
        @staticmethod
        def isatty() -> bool:
            return True

    monkeypatch.setattr(sys, "stdin", _TtyStream())
    assert (
        tfs.main(
            [
                "--state-file",
                str(state_file),
                "--findings-input",
                "-",
                "--workspace",
                str(repo),
            ]
        )
        == 2
    )
    assert "QA-CLI-TTY-01" in capsys.readouterr().err


def test_cli_subprocess_entrypoint(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    state_file = repo / ".agents" / ".cache" / "certify_state.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(_SCRIPT_PATH),
            "--state-file",
            str(state_file),
            "--findings-input",
            "-",
            "--workspace",
            str(repo),
        ],
        input=json.dumps({"stage": "certify", "findings": []}),
        capture_output=True,
        text=True,
        shell=False,
        check=False,
    )
    assert proc.returncode == 0
    assert "[PASS] CERTIFY-STATE" in proc.stdout


def test_certify_task_completion_integrates_findings_breaker() -> None:
    certify_sh = (
        Path(__file__).resolve().parent.parent
        / ".agents"
        / "scripts"
        / "certify_task_completion.sh"
    )
    content = certify_sh.read_text(encoding="utf-8")
    assert "track_findings_state.py" in content
    assert "run_certify_findings_tracker" in content
    assert "--max-streak 3" in content
    assert "rc=42" in content
    assert '"${tracker_rc}" -eq 42' in content


def test_save_state_doc_cleans_temp_file_on_os_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import os

    target = tmp_path / "state.json"

    def _fail_replace(_src: Path | str, _dst: Path | str) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", _fail_replace)
    with pytest.raises(OSError, match="disk full"):
        tfs._save_state_doc(target, {"version": 2, "sessions": {}})
    monkeypatch.undo()
    assert list(tmp_path.glob("*.tmp")) == []
    assert not target.exists()
