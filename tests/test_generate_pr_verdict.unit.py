# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/generate_pr_verdict.py (Hito 23)."""

from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import runpy
import stat
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any
from unittest import mock

import pytest

_SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / ".agents"
    / "scripts"
    / "generate_pr_verdict.py"
)

if TYPE_CHECKING:
    import generate_pr_verdict as gpv
    import track_findings_state as tfs
else:
    _SCRIPTS_DIR = _SCRIPT_PATH.parent
    _ADDED_PATH = str(_SCRIPTS_DIR) not in sys.path
    if _ADDED_PATH:
        sys.path.insert(0, str(_SCRIPTS_DIR))
    try:
        _SPEC = importlib.util.spec_from_file_location(
            "generate_pr_verdict", _SCRIPT_PATH
        )
        assert _SPEC is not None and _SPEC.loader is not None
        gpv = importlib.util.module_from_spec(_SPEC)
        sys.modules["generate_pr_verdict"] = gpv
        _SPEC.loader.exec_module(gpv)
        tfs = sys.modules["track_findings_state"]
    finally:
        if _ADDED_PATH and str(_SCRIPTS_DIR) in sys.path:
            sys.path.remove(str(_SCRIPTS_DIR))


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


def _write(repo: Path, rel: str, content: str) -> Path:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


def _init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    _git(repo, "config", "user.email", "qa@example.local")
    _git(repo, "config", "user.name", "QA Bot")
    _write(repo, "src/app.py", "def run() -> int:\n    return 1\n")
    _write(repo, "src/caller.py", "from app import run\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "init")
    return repo


def _junit_xml(failures: int = 0) -> str:
    fail_node = '<failure message="fallo"/>' if failures else ""
    return (
        '<testsuite tests="1" failures="'
        + str(failures)
        + f'"><testcase classname="Suite" name="case1">{fail_node}</testcase>'
        "</testsuite>"
    )


def _cobertura_xml(files: dict[str, tuple[int, ...]], hits: int = 1) -> str:
    classes: list[str] = []
    for fpath, line_nums in files.items():
        lines = "".join(
            f'<line number="{ln}" hits="{hits}"/>' for ln in line_nums
        )
        classes.append(f'<class filename="{fpath}"><lines>{lines}</lines></class>')
    return (
        "<coverage><packages><package><classes>"
        + "".join(classes)
        + "</classes></package></packages></coverage>"
    )


def _verify_sha256_seal(doc: dict[str, Any]) -> None:
    expected = doc["attestation_sha256"]
    core = {
        k: v
        for k, v in doc.items()
        if k not in {"attestation_sha256", "hmac_sha256"}
    }
    canonical = json.dumps(
        core, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    assert hashlib.sha256(canonical.encode()).hexdigest() == expected


def _make_inputs(repo: Path, **overrides: Any) -> Any:
    defaults: dict[str, Any] = {
        "workspace": repo,
        "base_ref": None,
        "reports_dir": "cov",
        "junit_xml": None,
        "telemetry_json": None,
        "defects_json": None,
        "expected_head_sha": None,
        "expected_tree_sha": None,
        "timestamp": "2026-11-14T20:00:00Z",
    }
    defaults.update(overrides)
    return gpv.VerdictInputs(**defaults)


def test_nominal_clean_head_and_hmac_signature(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _init_repo(tmp_path)
    _write(
        repo,
        ".gitignore",
        ".agents/.qa-evidence.json\n.agents/.cache/\n.agents/artifacts/\nreports/\n",
    )
    _write(repo, "manifest.json", '{"version":"1.0"}\n')
    _write(
        repo,
        "graphify-out/graph.json",
        json.dumps(
            {
                "nodes": [
                    {"id": "app", "source_file": "src/app.py"},
                    {"id": "caller", "source_file": "src/caller.py"},
                ],
                "links": [{"source": "caller", "target": "app"}],
            }
        ),
    )
    _git(repo, "add", ".gitignore", "manifest.json", "graphify-out/graph.json")
    _git(repo, "commit", "-m", "add manifest and graph")
    _write(repo, "reports/junit.xml", _junit_xml(0))
    _write(
        repo,
        ".agents/.qa-evidence.json",
        json.dumps({"stages": {"lint": {"fingerprint": "CLEAN_HEAD"}}}),
    )
    signing_val = f"hmac-qa11x-{hashlib.sha256(b'test-key').hexdigest()[:16]}"
    monkeypatch.setenv(gpv.ATTESTATION_KEY_ENV, signing_val)
    inputs = _make_inputs(repo, junit_xml="reports/junit.xml", base_ref="HEAD")
    code, att, md = gpv.generate_pr_verdict(
        inputs, ".agents/artifacts/PR_VERDICT.md", ".agents/artifacts/att.json"
    )
    assert code == 0
    assert att["verdict"] == gpv.VERDICT_MERGE_OK
    assert att["risk_level"] == gpv.RISK_LOW
    assert att["worktree_clean"] is True
    assert "hmac_sha256" in att
    _verify_sha256_seal(att)
    core = {
        k: v
        for k, v in att.items()
        if k not in {"attestation_sha256", "hmac_sha256"}
    }
    canon = json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    expected_hmac = hmac.new(
        signing_val.encode(), canon.encode(), hashlib.sha256
    ).hexdigest()
    assert att["hmac_sha256"] == expected_hmac
    out_json = repo / ".agents/artifacts/att.json"
    assert stat.S_IMODE(out_json.stat().st_mode) == 0o600
    assert "HMAC-SHA256" in md
    assert "| `ninguno` | 0 | N/A |" in md


def test_dirty_worktree_fingerprint_ast_deps_and_cov(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _init_repo(tmp_path)
    monkeypatch.delenv(gpv.ATTESTATION_KEY_ENV, raising=False)
    _write(repo, "root_helper.py", "X = 1\n")
    _write(repo, "mcp-server/src/tool.ts", "export const v = 1;\n")
    _write(repo, "mcp-server/src/caller.ts", "export { v } from './tool';\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "add root helper and mcp stub")
    _write(repo, "src/app.py", "def run() -> int:\n    return 2\n")
    _write(repo, "mcp-server/src/tool.ts", "export const v = 2;\n")
    _write(repo, "docs/guide.md", "# Ignorado en huella\n")
    _write(repo, ".agents/.cache/junit.xml", _junit_xml(0))
    _write(
        repo,
        "cov/python.xml",
        _cobertura_xml({"src/app.py": (2,), "mcp-server/src/tool.ts": (1,)}, hits=1),
    )
    _write(
        repo,
        "mcp-server/graphify-out/graph.json",
        json.dumps(
            {
                "nodes": [
                    {"id": "n1", "source_file": "src/tool.ts"},
                    {"id": "n2", "source_file": "src/caller.ts"},
                ],
                "links": [
                    "bad-link",
                    {"source": "n2", "target": "n1"},
                ],
            }
        ),
    )
    _write(
        repo,
        "graphify-out/graph.json",
        json.dumps(
            {
                "nodes": [{"id": "a", "source_file": "src/app.py"}],
                "links": [{"source_file": "src/idx.py", "target": "a"}],
            }
        ),
    )
    _write(repo, "node_modules/pkg/graph.json", "{}")
    _write(repo, "custom/graph.json", "{broken")
    _write(repo, "alt/graph.json", "[]")
    _write(repo, "weird/graph.json", json.dumps({"nodes": "no", "links": "no"}))
    snap = gpv.inspect_git_snapshot(_make_inputs(repo, base_ref="HEAD"), repo.resolve())
    assert snap.worktree_clean is False
    assert snap.code_fingerprint is not None
    _write(
        repo,
        ".agents/.qa-evidence.json",
        json.dumps(
            {
                "stages": {
                    "bad-entry": "ignored",
                    "unit": {"fingerprint": snap.code_fingerprint},
                }
            }
        ),
    )
    active_head_key = tfs.resolve_session_key(repo, base_ref="HEAD")
    _write(
        repo,
        ".agents/.cache/certify_state.json",
        json.dumps(
            {
                "version": 2,
                "sessions": {
                    "ignored": "bad",
                    active_head_key: {
                        "stage_runs": {"qa": [{"fingerprints": []}], "skip": "bad"},
                        "streaks": {"qa": 0},
                        "oscillations": {"qa": 0},
                    },
                },
            }
        ),
    )
    inputs = _make_inputs(
        repo,
        base_ref="HEAD",
        junit_xml=".agents/.cache/junit.xml",
        expected_head_sha=snap.head_sha,
        expected_tree_sha=snap.tree_sha,
        timestamp=None,
    )
    code, att, md = gpv.generate_pr_verdict(
        inputs, ".agents/artifacts/PR_VERDICT.md", ".agents/artifacts/att.json"
    )
    assert code == 0
    assert att["verdict"] == gpv.VERDICT_MERGE_OK
    assert "hmac_sha256" not in att
    assert "mcp-server/src/caller.ts" in att["ast_dependents"]
    assert "src/idx.py" in att["ast_dependents"]
    assert att["generated_at_utc"].endswith("Z")
    assert "| `src` | 1 | 100.0% |" in md
    assert "| `mcp-server` | 1 | 100.0% |" in md
    assert "HMAC-SHA256" not in md


def test_blocked_verdict_junit_diff_cov_and_breaker(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, "src/app.py", "def run() -> int:\n    return 9\n")
    _write(repo, "reports/junit.xml", _junit_xml(failures=1))
    _write(repo, "cov/python.xml", _cobertura_xml({"src/app.py": (2,)}, hits=0))
    active_key = tfs.resolve_session_key(repo)
    _write(
        repo,
        ".agents/.cache/certify_state.json",
        json.dumps(
            {
                "version": 2,
                "sessions": {
                    active_key: {
                        "stage_runs": {
                            "qa": [{"fingerprints": ["abc"]}],
                            "unit": [],
                        },
                        "streaks": {"qa": 3},
                        "oscillations": {"qa": 1},
                    },
                    "empty_runs": {"runs": []},
                },
            }
        ),
    )
    code, att, md = gpv.generate_pr_verdict(
        _make_inputs(repo, junit_xml="reports/junit.xml"),
        ".agents/artifacts/PR_VERDICT.md",
        ".agents/artifacts/att.json",
    )
    assert code == gpv.EXIT_BLOCKED == 30
    assert att["verdict"] == gpv.VERDICT_BLOCKED
    assert att["risk_level"] == gpv.RISK_HIGH
    assert att["breaker_health"]["blocked"] is True
    assert att["breaker_health"]["max_streak"] == 3
    assert att["breaker_health"]["total_oscillations"] == 1
    assert len(att["blocking_reasons"]) >= 3
    assert "## Motivos de Bloqueo" in md
    assert "N/A" in md

    cli_blocked = gpv.main(
        [
            "--workspace",
            str(repo),
            "--junit-xml",
            "reports/junit.xml",
            "--reports-dir",
            "cov",
        ]
    )
    assert cli_blocked == 30
    assert "BLOQUEADO" in capsys.readouterr().err

    code_report_only, att_ro, _ = gpv.generate_pr_verdict(
        _make_inputs(repo, junit_xml="reports/junit.xml", report_only=True),
        ".agents/artifacts/PR_VERDICT.md",
        ".agents/artifacts/att.json",
    )
    assert code_report_only == 0
    assert att_ro["verdict"] == gpv.VERDICT_BLOCKED

    cli_ro = gpv.main(
        [
            "--workspace",
            str(repo),
            "--junit-xml",
            "reports/junit.xml",
            "--reports-dir",
            "cov",
            "--report-only",
        ]
    )
    assert cli_ro == 0
    assert "BLOQUEADO" in capsys.readouterr().out


def test_breaker_legacy_runs_and_edge_helpers(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    assert gpv._extract_history_sets("bad") == []
    assert gpv._extract_non_bool_int(True) == 0
    assert gpv._extract_non_bool_int(-5) == 0
    assert gpv._extract_non_bool_int(7) == 7
    assert gpv._analyze_run_sequence([]) == (0, 0, 0)
    assert gpv._stage_persisted_int("bad", "qa") == 0
    assert gpv._build_graph_nodes_map("bad", "") == {}
    assert gpv._collect_link_dependent("bad", {}, "", set()) is None

    empty_snap = gpv._evaluate_session_entry({"runs": []})
    assert empty_snap.has_data is False

    legacy_snap = gpv._evaluate_session_entry(
        {
            "runs": [{"fingerprints": ["f1"]}],
            "streaks": {"f1": 3},
            "oscillations": {"f1": 1},
        }
    )
    assert legacy_snap.has_data is True
    assert legacy_snap.blocked is True
    assert legacy_snap.max_streak == 3

    _write(repo, gpv.CERTIFY_STATE_REL, json.dumps({"sessions": "bad"}))
    assert gpv._load_breaker_snapshot(repo).has_data is False

    with pytest.raises(gpv.VerdictDivergenceError):
        gpv._load_breaker_snapshot(repo, base_ref="-bad-ref")


def test_risk_levels_and_helper_edge_cases(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    assert (
        gpv._determine_risk_level(gpv.VERDICT_MERGE_OK, ("a.py",), ()) == gpv.RISK_LOW
    )
    assert (
        gpv._determine_risk_level(
            gpv.VERDICT_MERGE_OK, ("a.py", "b.py", "c.py", "d.py"), ()
        )
        == gpv.RISK_MEDIUM
    )
    assert (
        gpv._determine_risk_level(gpv.VERDICT_MERGE_OK, ("a.py",) * 8, ())
        == gpv.RISK_HIGH
    )
    assert (
        gpv._determine_risk_level(gpv.VERDICT_MERGE_OK, ("security/vault.py",), ())
        == gpv.RISK_HIGH
    )
    assert (
        gpv._determine_risk_level(gpv.VERDICT_MERGE_OK, ("a.py",), ("d.py",) * 10)
        == gpv.RISK_HIGH
    )
    (repo / "tempdir").mkdir()
    assert gpv._hash_code_entry(repo, "tempdir") == "tempdir:DIR"
    assert gpv._hash_code_entry(repo, "missing.py") == "missing.py:DELETED"
    assert gpv._extract_porcelain_paths("R  old.py -> new.py") == ["old.py", "new.py"]
    assert gpv._extract_porcelain_paths("M src/x.py") == ["M src/x.py"]
    assert gpv._is_ignored_for_fingerprint("./docs/a.md") is True
    assert gpv._is_ignored_for_fingerprint("AGENTS.md") is False
    sub_doc = "catalogs/agenticskills-submission.md"
    assert gpv._is_ignored_for_fingerprint(sub_doc) is False
    assert (
        gpv._collect_link_dependent(
            {"source": "doc_node", "target": "app", "relation": "documented_in"},
            {"doc_node": "docs/a.md", "app": "src/app.py"},
            "",
            {"src/app.py"},
        )
        is None
    )
    with mock.patch.object(gpv, "_run_git", return_value="a.py\n\n"):
        assert gpv._collect_changed_files(repo, "HEAD", ()) == ("a.py",)
    assert gpv._validate_evidence_consistency({"stages": "bad"}, mock.MagicMock()) == {}
    assert gpv._extract_max_int_value("not-a-dict") == 0
    assert gpv._has_coverage_reports(repo, "no-dir") is False
    assert gpv.collect_ast_dependents(repo, ()) == ()
    assert gpv._qualify_graph_path("mcp-server/src/a.ts", "mcp-server") == (
        "mcp-server/src/a.ts"
    )
    assert gpv._resolve_graph_prefix(repo, repo / "other.json") == ""
    assert gpv._load_breaker_snapshot(repo).has_data is False
    _write(repo, gpv.CERTIFY_STATE_REL, json.dumps({"sessions": {}}))
    assert gpv._load_breaker_snapshot(repo).has_data is False
    rows = gpv._render_module_rows(["root_mod.py"], mock.MagicMock(file_metrics=()))
    assert rows == ["| `raíz` | 1 | N/A |"]
    reasons = gpv._collect_blocking_reasons(
        {"decision": "NO_GO", "blocking_reasons": ["x", {}]},
        mock.MagicMock(exit_code=0),
        gpv.BreakerSnapshot(False, False, 0, 0, ()),
    )
    assert reasons == []


def test_security_rejections_and_divergence_exit_30(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    non_git = tmp_path / "plain"
    non_git.mkdir()
    assert gpv.main(["--workspace", str(non_git)]) == gpv.EXIT_EVIDENCE_OR_DIVERGENCE
    capsys.readouterr()

    repo = _init_repo(tmp_path)
    # Sin evidencias minimas -> exit 30
    assert gpv.main(["--workspace", str(repo)]) == gpv.EXIT_EVIDENCE_OR_DIVERGENCE
    assert "[PR-VERDICT]" in capsys.readouterr().err

    # Divergencia HEAD / Tree SHA y base-ref inseguro
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--expected-head-sha",
                "0" * 40,
            ]
        )
        == 30
    )
    capsys.readouterr()
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--expected-tree-sha",
                "0" * 40,
            ]
        )
        == 30
    )
    capsys.readouterr()
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--base-ref=--upload-pack=evil",
            ]
        )
        == 30
    )
    capsys.readouterr()

    # Evidencia obsoleta y JSON corrupto
    _write(
        repo,
        ".agents/.qa-evidence.json",
        json.dumps({"stages": {"lint": {"fingerprint": "stale-fp"}}}),
    )
    assert gpv.main(["--workspace", str(repo)]) == 30
    capsys.readouterr()
    _write(repo, ".agents/.qa-evidence.json", "{bad-json")
    assert gpv.main(["--workspace", str(repo)]) == 30
    capsys.readouterr()
    _write(repo, ".agents/.qa-evidence.json", "[]")
    assert gpv.main(["--workspace", str(repo)]) == 30
    capsys.readouterr()
    (repo / ".agents/.qa-evidence.json").unlink()

    # Path traversal, ruta absoluta externa, ruta vacia y symlinks
    assert gpv.main(["--workspace", str(repo), "--output-md", "../esc.md"]) == 30
    assert gpv.main(["--workspace", str(repo), "--output-md", "/tmp/outside.md"]) == 30
    assert gpv.main(["--workspace", str(repo), "--output-md", " "]) == 30
    capsys.readouterr()
    ext = tmp_path / "ext.md"
    ext.write_text("ext", encoding="utf-8")
    sym_file = repo / "sym.md"
    sym_file.symlink_to(ext)
    with pytest.raises(gpv.VerdictDivergenceError):
        gpv.resolve_contained_path(repo.resolve(), "sym.md", must_exist=True)
    sym_dir_target = tmp_path / "ext_dir"
    sym_dir_target.mkdir()
    (repo / "sym_dir").symlink_to(sym_dir_target)
    with pytest.raises(gpv.VerdictDivergenceError):
        gpv.resolve_contained_path(repo.resolve(), "sym_dir/out.md", must_exist=False)
    with pytest.raises(gpv.VerdictDivergenceError):
        gpv.resolve_contained_path(repo.resolve(), "no_such_file.json", must_exist=True)


def test_xxe_corrupt_coverage_and_missing_report_exit_30(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = _init_repo(tmp_path)
    xxe = (
        '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        "<testsuite><testcase/></testsuite>"
    )
    _write(repo, "reports/xxe.xml", xxe)
    assert (
        gpv.main(["--workspace", str(repo), "--junit-xml", "reports/xxe.xml"]) == 30
    )
    capsys.readouterr()

    _write(repo, "reports/ok.xml", _junit_xml(0))
    _write(repo, "src/new_untested.py", "def extra() -> int:\n    return 5\n")
    # Archivo nuevo sin cobertura registrada -> SIN_REPORTE (exit 12 -> Verdict 30)
    _write(repo, "cov/python.xml", _cobertura_xml({"src/other.py": (1,)}, hits=1))
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--reports-dir",
                "cov",
                "--junit-xml",
                "reports/ok.xml",
            ]
        )
        == 30
    )
    capsys.readouterr()

    # XML malformado capturado y error genérico en evaluate_diff_coverage -> exit 30
    (repo / "src/new_untested.py").unlink()
    _write(repo, "cov/python.xml", "<coverage><broken")
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--reports-dir",
                "cov",
                "--junit-xml",
                "reports/ok.xml",
            ]
        )
        == 30
    )
    capsys.readouterr()
    with mock.patch.object(
        vars(gpv)["vdc"],
        "evaluate_diff_coverage",
        side_effect=RuntimeError("boom"),
    ):
        assert (
            gpv.main(
                [
                    "--workspace",
                    str(repo),
                    "--reports-dir",
                    "cov",
                    "--junit-xml",
                    "reports/ok.xml",
                ]
            )
            == 30
        )
        capsys.readouterr()


def test_cli_main_success_and_module_entrypoint(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, "reports/ok.xml", _junit_xml(0))
    rc = gpv.main(
        [
            "--workspace",
            str(repo),
            "--junit-xml",
            "reports/ok.xml",
            "--output-md",
            ".agents/artifacts/PR_VERDICT.md",
            "--output-json",
            ".agents/artifacts/att.json",
        ]
    )
    assert rc == 0
    assert "[PR-VERDICT]" in capsys.readouterr().out

    monkeypatch.setattr(
        sys,
        "argv",
        [
            str(_SCRIPT_PATH),
            "--workspace",
            str(repo),
            "--junit-xml",
            "reports/ok.xml",
            "--output-md",
            ".agents/artifacts/entry.md",
            "--output-json",
            ".agents/artifacts/entry.json",
        ],
    )
    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(str(_SCRIPT_PATH), run_name="__main__")
    assert exc_info.value.code == 0


def test_f10_8_hardening_null_bytes_bom_tz_bool_and_io_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = _init_repo(tmp_path)
    _write(repo, "reports/ok.xml", _junit_xml(0))

    # Byte nulo en --output-md -> exit 30 limpio
    assert gpv.main(["--workspace", str(repo), "--output-md", "bad\0.md"]) == 30
    capsys.readouterr()

    # --reports-dir fuera del workspace rechazado antes de aceptar evidencia
    assert gpv._has_coverage_reports(repo, "cov") is False
    with pytest.raises(gpv.VerdictDivergenceError):
        gpv._has_coverage_reports(repo, "../escape")

    # _extract_max_int_value ignora bool y NaN/inf
    assert gpv._extract_max_int_value({"a": True, "b": float("inf"), "c": 2}) == 2

    # _normalize_timestamp convierte offsets a UTC Z
    assert gpv._normalize_timestamp("2026-11-13T18:30:00-04:00") == (
        "2026-11-13T22:30:00Z"
    )

    # graph.json binario corrupto no rompe collect_ast_dependents; BOM sí se lee
    (repo / "corrupt").mkdir()
    (repo / "corrupt" / "graph.json").write_bytes(b"\xff\xfe\x00")
    bom_graph = json.dumps(
        {
            "nodes": [
                {"id": "a", "source_file": "src/app.py"},
                {"id": "c", "source_file": "src/caller.py"},
            ],
            "links": [{"source": "c", "target": "a"}],
        }
    )
    (repo / "graphify-out").mkdir()
    (repo / "graphify-out" / "graph.json").write_bytes(
        b"\xef\xbb\xbf" + bom_graph.encode("utf-8")
    )
    deps = gpv.collect_ast_dependents(repo.resolve(), ("src/app.py",))
    assert deps == ("src/caller.py",)

    # OSError en _run_git y en escritura de artefacto -> VerdictDivergenceError
    def raise_os(*_a: Any, **_kw: Any) -> Any:
        raise OSError("git not found")

    monkeypatch.setattr(subprocess, "run", raise_os)
    with pytest.raises(gpv.VerdictDivergenceError):
        gpv._run_git(repo.resolve(), ["status"])
    monkeypatch.undo()

    (repo / "dir_as_file").mkdir()
    assert (
        gpv.main(
            [
                "--workspace",
                str(repo),
                "--junit-xml",
                "reports/ok.xml",
                "--output-md",
                "dir_as_file",
            ]
        )
        == 30
    )
    capsys.readouterr()

    # _normalize_timestamp sin tz y texto no-ISO, más limpieza .tmp si os.replace falla
    import os

    assert gpv._normalize_timestamp("not-iso-ts") == "not-iso-ts"
    assert gpv._normalize_timestamp("2026-11-13T18:30:00") == "2026-11-13T18:30:00Z"

    def fail_replace(_src: Path | str, _dst: Path | str) -> None:
        raise OSError("replace denied")

    out_dir = tmp_path / "atomic_fail"
    out_dir.mkdir()
    monkeypatch.setattr(os, "replace", fail_replace)
    with pytest.raises(OSError):
        gpv._write_private_json(out_dir / "att.json", {"ok": True})
    monkeypatch.undo()
    assert list(out_dir.glob("*.tmp")) == []
