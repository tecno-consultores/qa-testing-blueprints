# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Suite Meta-QA trimodal (Virgin, Nominal, Broken) para .agents/scripts/."""

from __future__ import annotations

import importlib.util
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AGENTS_SCRIPTS_DIR = REPO_ROOT / ".agents" / "scripts"
FIXTURE_SEED_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "broken_repo_seed.json"
)

ALL_VALIDATORS: tuple[str, ...] = (
    "verify_json_no_duplicate_keys.py",
    "verify_zero_orphan_vue_components.py",
    "verify_no_orphan_api_endpoints.py",
    "verify_topological_health.py",
    "verify_alembic_orm_parity.py",
    "verify_roadmap_consistency.py",
    "verify_docs_invariants.py",
    "sync_governance.py",
)


def _load_seed_catalog() -> dict[str, Any]:
    data = json.loads(FIXTURE_SEED_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError("broken_repo_seed.json debe tener un objeto raíz.")
    return data


SEED_CATALOG = _load_seed_catalog()
SEEDED_FAILURE_IDS = tuple(sorted(SEED_CATALOG["seeded_failures"].keys()))


def _render_file_spec(spec: dict[str, Any]) -> str:
    if "raw_content" in spec:
        return str(spec["raw_content"])
    if "content" in spec:
        return str(spec["content"])
    if "repeat_char" in spec:
        cfg = spec["repeat_char"]
        return str(cfg["char"]) * int(cfg["count"])
    if "repeat_lines" in spec:
        cfg = spec["repeat_lines"]
        prefix = str(cfg.get("prefix", ""))
        line = str(cfg["line"])
        count = int(cfg["count"])
        return prefix + "\n".join(line for _ in range(count)) + "\n"
    raise ValueError(f"Especificación de archivo desconocida en fixture: {spec!r}")


def _write_fixture_files(root: Path, files_spec: list[dict[str, Any]]) -> None:
    for spec in files_spec:
        target = root / str(spec["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_render_file_spec(spec), encoding="utf-8")


def _load_script(script_name: str, module_alias: str) -> ModuleType:
    script_path = AGENTS_SCRIPTS_DIR / script_name
    spec = importlib.util.spec_from_file_location(module_alias, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"No se pudo cargar el script {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_alias] = module
    spec.loader.exec_module(module)
    return module


def _seal_manifest_if_requested(root: Path) -> None:
    sync_mod = _load_script("sync_governance.py", "meta_qa_sync_seal")
    code, msg = sync_mod.run_sync(root)
    assert code == 0, f"Fallo al sellar manifest.json del fixture nominal: {msg}"


def _materialize_scenario(root: Path, section_name: str) -> None:
    section = SEED_CATALOG[section_name]
    _write_fixture_files(root, section["files"])
    if section.get("seal_manifest"):
        _seal_manifest_if_requested(root)


_DIRECT_PATH_VALIDATORS = frozenset(
    {
        "verify_json_no_duplicate_keys.py",
        "verify_zero_orphan_vue_components.py",
        "verify_no_orphan_api_endpoints.py",
    }
)
_REPO_ROOT_ATTR_VALIDATORS = frozenset(
    {
        "verify_topological_health.py",
        "verify_alembic_orm_parity.py",
    }
)


def _invoke_roadmap_validator(
    mod: ModuleType,
    target_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> int:
    fake_script_loc = (
        target_root / ".agents" / "scripts" / "verify_roadmap_consistency.py"
    )
    fake_script_loc.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(mod, "__file__", str(fake_script_loc))
    return int(mod.main())


def _invoke_validator_module(
    mod: ModuleType,
    script_name: str,
    target_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> int:
    cli_args: dict[str, list[str]] = {
        "verify_docs_invariants.py": [str(target_root)],
        "sync_governance.py": ["--repo-root", str(target_root), "--check"],
    }
    if script_name in _DIRECT_PATH_VALIDATORS:
        return int(mod.main(target_root))
    if script_name in cli_args:
        return int(mod.main(cli_args[script_name]))
    if script_name in _REPO_ROOT_ATTR_VALIDATORS:
        monkeypatch.setattr(mod, "REPO_ROOT", target_root)
        return int(mod.main())
    if script_name == "verify_roadmap_consistency.py":
        return _invoke_roadmap_validator(mod, target_root, monkeypatch)
    raise AssertionError(f"Validador no soportado: {script_name}")


def _run_validator_inprocess(
    script_name: str,
    target_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    *,
    alias_suffix: str,
) -> tuple[int, str]:
    mod = _load_script(
        script_name, f"meta_qa_{script_name.removesuffix('.py')}_{alias_suffix}"
    )
    rc = _invoke_validator_module(mod, script_name, target_root, monkeypatch)
    captured = capsys.readouterr()
    return rc, captured.out + captured.err


def _run_validator_cli(script_name: str, target_root: Path) -> tuple[int, str]:
    if script_name == "sync_governance.py":
        cmd = [
            sys.executable,
            str(AGENTS_SCRIPTS_DIR / script_name),
            "--repo-root",
            str(target_root),
            "--check",
        ]
    elif script_name == "verify_docs_invariants.py":
        cmd = [
            sys.executable,
            str(AGENTS_SCRIPTS_DIR / script_name),
            str(target_root),
        ]
    else:
        dst_scripts = target_root / ".agents" / "scripts"
        dst_scripts.mkdir(parents=True, exist_ok=True)
        dst_script = dst_scripts / script_name
        shutil.copy2(AGENTS_SCRIPTS_DIR / script_name, dst_script)
        cmd = [sys.executable, str(dst_script)]

    proc = subprocess.run(
        cmd,
        cwd=target_root,
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout + proc.stderr


@pytest.mark.parametrize("script_name", ALL_VALIDATORS)
def test_virgin_minimal_graceful_degradation(
    tmp_path: Path,
    script_name: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verifica degradación elegante (sin Traceback) en repo mínimo virgen."""
    _materialize_scenario(tmp_path, "virgin_minimal")

    if script_name == "sync_governance.py":
        sync_mod = _load_script(script_name, "meta_qa_sync_virgin")
        rc_init = int(sync_mod.main(["--repo-root", str(tmp_path)]))
        captured_init = capsys.readouterr()
        assert rc_init == 0, captured_init.out + captured_init.err
        assert "manifest.json sincronizado" in captured_init.out

    rc, output = _run_validator_inprocess(
        script_name, tmp_path, monkeypatch, capsys, alias_suffix="virgin"
    )
    assert "Traceback" not in output
    if script_name == "verify_roadmap_consistency.py":
        assert rc == 20, f"{script_name} debió retornar 20 SKIPPED:\n{output}"
        assert "SKIPPED" in output
    else:
        assert rc == 0, f"{script_name} falló en virgin_minimal:\n{output}"


@pytest.mark.parametrize("script_name", ALL_VALIDATORS)
def test_nominal_valid_zero_false_positives(
    tmp_path: Path,
    script_name: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Certifica 0 falsos positivos (in-process y CLI) en nominal_valid."""
    _materialize_scenario(tmp_path, "nominal_valid")

    rc_in, out_in = _run_validator_inprocess(
        script_name, tmp_path, monkeypatch, capsys, alias_suffix="nominal"
    )
    assert rc_in == 0, f"{script_name} produjo falso positivo (in-process):\n{out_in}"
    assert "Traceback" not in out_in

    rc_cli, out_cli = _run_validator_cli(script_name, tmp_path)
    assert rc_cli == 0, f"{script_name} produjo falso positivo (CLI):\n{out_cli}"
    assert "Traceback" not in out_cli


@pytest.mark.parametrize("failure_id", SEEDED_FAILURE_IDS)
def test_seeded_failures_zero_false_negatives(
    tmp_path: Path,
    failure_id: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Certifica 0 falsos negativos ante cada mutación de seeded_failures."""
    _materialize_scenario(tmp_path, "nominal_valid")

    mutation = SEED_CATALOG["seeded_failures"][failure_id]
    validator = str(mutation["validator"])
    expected_outputs: list[str] = [str(item) for item in mutation["expected_outputs"]]

    _write_fixture_files(tmp_path, mutation["files"])

    rc_in, out_in = _run_validator_inprocess(
        validator, tmp_path, monkeypatch, capsys, alias_suffix=f"fail_{failure_id}"
    )
    assert rc_in != 0, (
        f"{validator} no detectó la mutación '{failure_id}' (in-process):\n{out_in}"
    )
    assert "Traceback" not in out_in
    for expected in expected_outputs:
        assert expected in out_in, (
            f"Falta '{expected}' en {validator} para '{failure_id}':\n{out_in}"
        )

    rc_cli, out_cli = _run_validator_cli(validator, tmp_path)
    assert rc_cli != 0, f"{validator} no detectó '{failure_id}' en CLI:\n{out_cli}"
    assert "Traceback" not in out_cli


def test_inspect_blast_radius_bidirectional_and_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verifica detección bidireccional (callers/callees) y fallback sin graph.json."""
    _materialize_scenario(tmp_path, "nominal_valid")
    mod = _load_script("inspect_blast_radius.py", "inspect_blast_radius")
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)

    (tmp_path / "tests").mkdir(exist_ok=True)
    (tmp_path / "tests" / "contract.feature").write_text(
        "Scenario: fetch_devices contract\n  * print 'ok'\n",
        encoding="utf-8",
    )

    assert mod.inspect_symbol("fetch_devices") == 0
    out_graph = capsys.readouterr().out
    assert "⬅️ [Llamado por]" in out_graph
    assert "list_devices" in out_graph
    assert "➡️ [Invoca a]" in out_graph
    assert "Device" in out_graph
    assert "contract.feature" in out_graph
    assert "QA-TEST-SYNC-01" in out_graph
    assert "Llamadores: 1" in out_graph

    (tmp_path / "graphify-out" / "graph.json").unlink()
    assert mod.inspect_symbol("DeviceCard") == 2
    out_fallback = capsys.readouterr().out
    assert "[AST/Source Scan]" in out_fallback
    assert "DeviceCard.spec.ts" in out_fallback
    assert mod.inspect_symbol("DeviceCard", allow_missing=True) == 0


def test_inspect_blast_radius_precision_dedup_and_exit_codes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida poda de node_modules, dedup raíz+stack, límite de palabra y exit codes."""
    mod = _load_script("inspect_blast_radius.py", "inspect_blast_radius")
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)

    (tmp_path / "graphify-out").mkdir(parents=True)
    (tmp_path / "mcp-server" / "graphify-out").mkdir(parents=True)
    (tmp_path / "node_modules" / "ignored_pkg" / "graphify-out").mkdir(parents=True)

    root_graph = {
        "nodes": [
            {
                "id": "n_auth",
                "label": "auth",
                "source_file": "mcp-server/src/auth.py",
                "source_location": "L10",
            },
            {
                "id": "n_author",
                "label": "author",
                "source_file": "mcp-server/src/author.py",
                "source_location": "L10",
            },
            {
                "id": "n_route",
                "label": "login_route",
                "source_file": "mcp-server/src/routes.py",
            },
            {
                "id": "n_doc",
                "label": "auth_doc",
                "source_file": "docs/auth.md",
            },
        ],
        "links": [
            {"source": "n_route", "target": "n_auth", "relation": "calls"},
            {"source": "n_route", "target": "n_auth", "relation": "imports"},
            {"source": "n_doc", "target": "n_auth", "relation": "documented_in"},
            {"source": "n_route", "target": "n_auth", "relation": "rationale_for"},
            {"source": "n_auth", "target": "n_auth", "relation": "contains"},
        ],
    }
    stack_graph = {
        "nodes": [
            {
                "id": "s_auth",
                "label": "auth",
                "source_file": "src/auth.py",
                "source_location": "L10",
            },
            {
                "id": "s_route",
                "label": "login_route",
                "source_file": "src/routes.py",
            },
        ],
        "links": [
            {"source": "s_route", "target": "s_auth", "relation": "calls"},
        ],
    }
    (tmp_path / "graphify-out" / "graph.json").write_text(
        json.dumps(root_graph), encoding="utf-8"
    )
    (tmp_path / "mcp-server" / "graphify-out" / "graph.json").write_text(
        json.dumps(stack_graph), encoding="utf-8"
    )
    (
        tmp_path / "node_modules" / "ignored_pkg" / "graphify-out" / "graph.json"
    ).write_text("{}", encoding="utf-8")

    found_graphs = mod.find_graph_files()
    assert len(found_graphs) == 2
    assert all("node_modules" not in p.as_posix() for p in found_graphs)

    matches = mod.find_matching_nodes(root_graph, "auth")
    assert [m["id"] for m in matches] == ["n_auth"]
    assert [m["id"] for m in mod.find_matching_nodes(root_graph, "author.py")] == [
        "n_author"
    ]
    assert mod.find_matching_nodes(root_graph, "   ") == []

    assert mod.inspect_symbol("auth") == 0
    out_auth = capsys.readouterr().out
    assert "Llamadores: 1" in out_auth
    assert "author" not in out_auth

    empty_root = tmp_path / "empty_repo"
    empty_root.mkdir()
    monkeypatch.setattr(mod, "REPO_ROOT", empty_root)
    assert mod.main(["missing_sym"]) == 2
    assert mod.main(["missing_sym", "--allow-missing"]) == 0
    capsys.readouterr()


def test_verificar_secretos_detects_synthetic_token_and_passes_clean_repo(
    tmp_path: Path,
) -> None:
    """Valida detección de secretos en git init aislado con token en runtime."""
    repo_dir = tmp_path / "isolated_repo"
    (repo_dir / "scripts").mkdir(parents=True)
    (repo_dir / "src").mkdir(parents=True)

    secret_script = repo_dir / "scripts" / "verificar-secretos.sh"
    shutil.copy2(REPO_ROOT / "scripts" / "verificar-secretos.sh", secret_script)
    secret_script.chmod(0o755)

    (repo_dir / "src" / "config.py").write_text(
        "APP_NAME = 'meta-qa'\n", encoding="utf-8"
    )

    subprocess.run(["git", "init", "-q"], cwd=repo_dir, check=True)
    clean_proc = subprocess.run(
        ["bash", str(secret_script)],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    assert clean_proc.returncode == 0, clean_proc.stdout + clean_proc.stderr

    synthetic_token = "gh" + "p_" + ("B" * 36)
    (repo_dir / "src" / "config.py").write_text(
        f'TOKEN = "{synthetic_token}"\n',
        encoding="utf-8",
    )
    dirty_proc = subprocess.run(
        ["bash", str(secret_script)],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    assert dirty_proc.returncode != 0, dirty_proc.stdout + dirty_proc.stderr
    assert "src/config.py" in (dirty_proc.stdout + dirty_proc.stderr)


def _write_release_gate_fixtures(
    root: Path,
    *,
    junit_xml: str,
    telemetry: dict[str, Any],
    defects: dict[str, Any],
) -> tuple[str, str, str]:
    junit_rel = "artifacts/junit.xml"
    telemetry_rel = "artifacts/telemetry.json"
    defects_rel = "artifacts/defects.json"
    (root / junit_rel).parent.mkdir(parents=True, exist_ok=True)
    (root / junit_rel).write_text(junit_xml, encoding="utf-8")
    (root / telemetry_rel).write_text(
        json.dumps(telemetry, indent=2), encoding="utf-8"
    )
    (root / defects_rel).write_text(json.dumps(defects, indent=2), encoding="utf-8")
    return junit_rel, telemetry_rel, defects_rel


def test_release_readiness_gate_go_skipped_and_dry_run_vs_enforce(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida GO, SKIPPED (smoke) y NO_GO (--dry-run/--enforce) CLI e in-proc."""
    gate_script = AGENTS_SCRIPTS_DIR / "release_readiness_gate.py"
    mod = _load_script("release_readiness_gate.py", "meta_qa_release_gate")

    passing_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<testsuites><testsuite tests="2" failures="0" errors="0" skipped="0">'
        '<testcase classname="api" name="health" />'
        '<testcase classname="api" name="rls" />'
        "</testsuite></testsuites>"
    )
    j_rel, t_rel, d_rel = _write_release_gate_fixtures(
        tmp_path,
        junit_xml=passing_xml,
        telemetry={
            "error_rate_pct": 0.2,
            "latency_p95_ms": 140,
            "p99_ms": 380,
            "active_incidents": 0,
        },
        defects={"open_blockers": 0, "open_criticals": 0, "qa_escapes": 0},
    )

    rc_go = mod.main(
        [
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            j_rel,
            "--telemetry-json",
            t_rel,
            "--defects-json",
            d_rel,
            "--timestamp",
            "2026-11-13T18:30:00-04:00",
            "--enforce",
            "--output-json",
            "out/release-gate.json",
            "--output-md",
            "out/release-gate.md",
        ]
    )
    out_go = capsys.readouterr().out
    assert rc_go == 0
    assert "GO" in out_go
    assert "\n" not in out_go.strip()

    go_payload = json.loads(
        (tmp_path / "out" / "release-gate.json").read_text(encoding="utf-8")
    )
    assert go_payload["decision"] == "GO"
    assert go_payload["gate_skipped"] is False
    assert go_payload["evaluated_at_utc"] == "2026-11-13T22:30:00Z"
    assert "Release Readiness Gate Report" in (
        tmp_path / "out" / "release-gate.md"
    ).read_text(encoding="utf-8")

    rc_smoke = mod.main(
        [
            "--workspace-root",
            str(tmp_path),
            "--scope",
            "smoke",
            "--output-json",
            "out/smoke-gate.json",
        ]
    )
    out_smoke = capsys.readouterr().out
    assert rc_smoke == 0
    assert "SKIPPED" in out_smoke
    smoke_payload = json.loads(
        (tmp_path / "out" / "smoke-gate.json").read_text(encoding="utf-8")
    )
    assert smoke_payload["decision"] == "SKIPPED"
    assert smoke_payload["gate_skipped"] is True

    failing_xml = (
        '<testsuite tests="2" failures="1" errors="0" skipped="0">'
        '<testcase classname="auth" name="locks_user"><failure /></testcase>'
        '<testcase classname="auth" name="rotates" />'
        "</testsuite>"
    )
    fj_rel, ft_rel, fd_rel = _write_release_gate_fixtures(
        tmp_path,
        junit_xml=failing_xml,
        telemetry={"error_rate_pct": 2.4, "p95_ms": 620, "active_incidents": 1},
        defects={"open_blockers": 1, "open_criticals": 2, "qa_escapes": 1},
    )

    dry_proc = subprocess.run(
        [
            sys.executable,
            str(gate_script),
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            fj_rel,
            "--telemetry-json",
            ft_rel,
            "--defects-json",
            fd_rel,
            "--dry-run",
            "--output-json",
            "out/dry-nogo.json",
            "--output-md",
            "out/dry-nogo.md",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert dry_proc.returncode == 0, dry_proc.stdout + dry_proc.stderr
    dry_payload = json.loads(
        (tmp_path / "out" / "dry-nogo.json").read_text(encoding="utf-8")
    )
    assert dry_payload["decision"] == "NO_GO"
    reason_codes = {item["code"] for item in dry_payload["blocking_reasons"]}
    assert {
        "JUNIT_FAILURES",
        "PASS_RATE_BELOW_THRESHOLD",
        "ERROR_RATE_EXCEEDED",
        "LATENCY_P95_EXCEEDED",
        "ACTIVE_INCIDENTS_EXCEEDED",
        "OPEN_BLOCKERS_EXCEEDED",
        "OPEN_CRITICALS_EXCEEDED",
        "QA_ESCAPES_EXCEEDED",
    }.issubset(reason_codes)

    enforce_proc = subprocess.run(
        [
            sys.executable,
            str(gate_script),
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            fj_rel,
            "--telemetry-json",
            ft_rel,
            "--defects-json",
            fd_rel,
            "--enforce",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert enforce_proc.returncode == 1
    assert "NO_GO" in enforce_proc.stderr
    assert "auth::locks_user" in enforce_proc.stderr

    with pytest.raises(SystemExit):
        mod.parse_args(["--dry-run", "--enforce"])


def test_release_readiness_gate_security_xxe_traversal_and_zero_tests(
    tmp_path: Path,
) -> None:
    """Rechaza payloads XXE, Path Traversal y suites con 0 pruebas en scope full."""
    gate_script = AGENTS_SCRIPTS_DIR / "release_readiness_gate.py"
    xxe_file = tmp_path / "xxe.xml"
    xxe_file.write_text(
        '<?xml version="1.0"?><!DOCTYPE foo '
        '[<!ENTITY xxe SYSTEM "file:///etc/passwd">]><testsuite tests="1" />',
        encoding="utf-8",
    )

    xxe_proc = subprocess.run(
        [
            sys.executable,
            str(gate_script),
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            "xxe.xml",
            "--output-json",
            "xxe-report.json",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert xxe_proc.returncode == 1
    assert "XXE_DETECTED" in xxe_proc.stderr
    xxe_payload = json.loads(
        (tmp_path / "xxe-report.json").read_text(encoding="utf-8")
    )
    assert xxe_payload["has_security_or_parse_error"] is True

    traversal_proc = subprocess.run(
        [
            sys.executable,
            str(gate_script),
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            "../../etc/passwd",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert traversal_proc.returncode == 1
    assert "PATH_TRAVERSAL" in traversal_proc.stderr

    zero_xml = tmp_path / "zero.xml"
    zero_xml.write_text('<testsuite tests="0" failures="0" />', encoding="utf-8")
    zero_proc = subprocess.run(
        [
            sys.executable,
            str(gate_script),
            "--workspace-root",
            str(tmp_path),
            "--junit-xml",
            "zero.xml",
            "--enforce",
            "--output-json",
            "zero-report.json",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert zero_proc.returncode == 1
    zero_payload = json.loads(
        (tmp_path / "zero-report.json").read_text(encoding="utf-8")
    )
    assert zero_payload["decision"] == "NO_GO"
    assert zero_payload["blocking_reasons"][0]["code"] == "ZERO_TESTS_EXECUTED"


def test_release_readiness_gate_inprocess_security_and_parse_edges(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Cubre XXE, JSON/XML inválido, symlinks, métricas y errores."""
    mod = _load_script("release_readiness_gate.py", "meta_qa_release_gate_edges")
    outside = tmp_path.parent / "outside_secret_rg.xml"
    outside.write_text("<testsuite tests='1' />", encoding="utf-8")
    symlink_xml = tmp_path / "sym.xml"
    symlink_xml.symlink_to(outside)

    bad_json = tmp_path / "bad.json"
    bad_json.write_text("{broken", encoding="utf-8")
    arr_json = tmp_path / "arr.json"
    arr_json.write_text("[1, 2]", encoding="utf-8")
    bad_xml = tmp_path / "bad.xml"
    bad_xml.write_text("<other />", encoding="utf-8")
    malformed_xml = tmp_path / "malformed.xml"
    malformed_xml.write_text("<testsuite>", encoding="utf-8")
    xxe_xml = tmp_path / "xxe_inproc.xml"
    xxe_xml.write_text("<!ENTITY a 'b'><testsuite tests='1' />", encoding="utf-8")
    neg_tel = tmp_path / "neg_tel.json"
    neg_tel.write_text(
        json.dumps({"metrics": {"p95_ms": -5}, "error_rate_pct": True}),
        encoding="utf-8",
    )
    err_xml = tmp_path / "err.xml"
    err_xml.write_text(
        "<testsuites tests='2' errors='1'>"
        "<testcase name='e'><error /></testcase>"
        "<testcase name='ok' /></testsuites>",
        encoding="utf-8",
    )

    ws = str(tmp_path)
    failing_invocations = [
        ["--workspace-root", ws, "--junit-xml", "xxe_inproc.xml"],
        ["--workspace-root", ws, "--junit-xml", "sym.xml"],
        ["--workspace-root", ws, "--junit-xml", "missing.xml"],
        ["--workspace-root", ws, "--junit-xml", "   "],
        ["--workspace-root", ws, "--junit-xml", "a\x00b.xml"],
        ["--workspace-root", ws, "--junit-xml", "bad.xml"],
        ["--workspace-root", ws, "--junit-xml", "malformed.xml"],
        ["--workspace-root", ws, "--telemetry-json", "bad.json"],
        ["--workspace-root", ws, "--defects-json", "arr.json"],
        ["--workspace-root", ws, "--telemetry-json", "neg_tel.json"],
        ["--workspace-root", ws, "--timestamp", "not-iso"],
        ["--workspace-root", ws, "--timestamp", ""],
        ["--workspace-root", ws, "--junit-xml", "err.xml", "--enforce"],
        [
            "--workspace-root",
            ws,
            "--junit-xml",
            "err.xml",
            "--output-json",
            "../../bad.json",
        ],
    ]
    for argv in failing_invocations:
        assert mod.main(argv) == 1
    rc_dir_escape, _ = mod.evaluate_release_gate(
        workspace_root=tmp_path, scope="invalid"
    )
    assert rc_dir_escape == 1
    capsys.readouterr()


def _make_tool_pair(idx: int, payload_chars: int) -> list[dict[str, Any]]:
    return [
        {
            "role": "assistant",
            "content": f"llamada {idx}",
            "tool_calls": [
                {
                    "id": f"call_{idx}",
                    "type": "function",
                    "function": {"name": "inspect_ast", "arguments": f'{{"i":{idx}}}'},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": f"call_{idx}",
            "content": f"out_{idx}_" + ("x" * payload_chars),
        },
    ]


def test_compact_context_11x_noop_and_tier1_masking() -> None:
    """Valida no-op bajo 90% y enmascaramiento Tier 1 (6 recientes)."""
    mod = _load_script("compact_context_11x.py", "meta_qa_compact_t1")

    small_msgs = [
        {"role": "system", "content": "directiva única"},
        {"role": "user", "content": "tarea corta"},
    ]
    noop = mod.compact_context(small_msgs, context_window=1000, threshold_ratio=0.90)
    assert noop.tier_applied == 0
    assert noop.masked_tool_results == 0
    assert noop.dropped_messages == 0
    assert noop.messages == small_msgs

    msgs: list[dict[str, Any]] = [
        {"role": "system", "content": "reglas"},
        {"role": "user", "content": "auditar 10 archivos"},
    ]
    for i in range(10):
        msgs.extend(_make_tool_pair(i, payload_chars=400))

    # 10 pares * ~120 tokens ~= 1200 tokens; anchor_tokens=700 supera 1800
    res_t1 = mod.compact_context(
        msgs,
        anchor_tokens=700,
        context_window=2000,
        threshold_ratio=0.90,
        keep_recent_tools=6,
    )
    assert res_t1.tier_applied == 1
    assert res_t1.masked_tool_results == 4
    assert res_t1.dropped_messages == 0
    assert res_t1.after_tokens <= res_t1.threshold_tokens

    tool_msgs = [m for m in res_t1.messages if m.get("role") == "tool"]
    assert len(tool_msgs) == 10
    assert all(m["content"] == "[tool result cleared]" for m in tool_msgs[:4])
    assert all(m["content"] != "[tool result cleared]" for m in tool_msgs[4:])
    assistants = [m for m in res_t1.messages if m.get("role") == "assistant"]
    assert all(len(m.get("tool_calls", [])) == 1 for m in assistants)


def _assert_valid_tool_pairing(messages: list[dict[str, Any]]) -> None:
    for idx, msg in enumerate(messages):
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            call_ids = {c["id"] for c in msg["tool_calls"]}
            assert idx + 1 < len(messages)
            nxt = messages[idx + 1]
            assert nxt.get("role") == "tool"
            assert nxt.get("tool_call_id") in call_ids
        if msg.get("role") == "tool":
            assert idx > 0 and messages[idx - 1].get("role") == "assistant"


def _make_anthropic_tool_history(count: int) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = [
        {"role": "system", "content": [{"type": "text", "text": "sys"}]},
        {
            "role": "user",
            "content": ["parte 1", {"type": "image_url", "url": "https://local"}],
        },
        {"role": "assistant", "content": None},
        {"role": "assistant", "content": {"status": "ok"}},
    ]
    for i in range(count):
        history.append(
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": f"tu_{i}",
                        "name": "read",
                        "input": {"i": i},
                    }
                ],
            }
        )
        content = "[tool result cleared]" if i == 0 else ("r" * 400)
        history.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": f"tu_{i}",
                        "content": content,
                    }
                ],
            }
        )
    return history


def test_compact_context_11x_tier2_atomic_prune_and_anthropic_blocks() -> None:
    """Valida escalado a Tier 2 preservando raíz y pares tool sin huérfanos."""
    mod = _load_script("compact_context_11x.py", "meta_qa_compact_t2")

    msgs: list[dict[str, Any]] = [
        {"role": "system", "content": "system root"},
        {"role": "user", "content": "root user task"},
    ]
    for i in range(14):
        msgs.append({"role": "user", "content": f"seguimiento {i} " + ("u" * 320)})
        msgs.extend(_make_tool_pair(i, payload_chars=240))

    msgs.append(
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": "tu_last", "name": "verify", "input": {}}
            ],
        }
    )
    msgs.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "tu_last",
                    "content": "ok_" + ("z" * 80),
                }
            ],
        }
    )

    res_t2 = mod.compact_context(
        msgs,
        context_window=1800,
        threshold_ratio=0.90,
        keep_recent_tools=6,
        keep_last_messages=20,
    )
    assert res_t2.tier_applied == 2
    assert res_t2.dropped_messages > 0
    assert res_t2.after_tokens <= res_t2.threshold_tokens
    assert len(res_t2.messages) <= 20
    assert res_t2.messages[0]["content"] == "system root"
    assert res_t2.messages[1]["content"] == "root user task"
    _assert_valid_tool_pairing(res_t2.messages)

    anthropic_msgs = _make_anthropic_tool_history(8)
    res_anth = mod.compact_context(
        anthropic_msgs,
        context_window=1050,
        threshold_ratio=0.90,
        keep_recent_tools=6,
    )
    assert res_anth.tier_applied == 1
    assert res_anth.masked_tool_results == 1
    assert res_anth.messages[5]["content"][0]["content"] == "[tool result cleared]"
    assert res_anth.messages[7]["content"][0]["content"] == "[tool result cleared]"
    assert res_anth.messages[9]["content"][0]["content"] == "r" * 400

    sys_only = [
        {"role": "system", "content": "s" * 400},
        {"role": "assistant", "content": "a" * 400},
    ]
    res_sys_only = mod.compact_context(
        sys_only, context_window=100, threshold_ratio=0.90
    )
    assert res_sys_only.tier_applied == 2
    assert len(res_sys_only.messages) == 1


def test_compact_context_11x_oversized_single_message_and_cli_tty_guard(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Cubre mensaje único gigante, guardia QA-CLI-TTY-01 y CLI/stdin."""
    mod = _load_script("compact_context_11x.py", "meta_qa_compact_cli")
    script_path = AGENTS_SCRIPTS_DIR / "compact_context_11x.py"

    giant = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "x" * 1600},
    ]
    res_giant = mod.compact_context(giant, context_window=200, threshold_ratio=0.90)
    assert res_giant.uncompactable_single_message is True
    assert len(res_giant.messages) == 2

    # Guardia anti-cuelgue TTY sin --input ni pipe
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    assert mod.main([]) == 1
    captured_tty = capsys.readouterr()
    assert "QA-CLI-TTY-01" in captured_tty.err

    # Errores de parámetros y payloads inválidos in-process
    bad_json = tmp_path / "bad.json"
    bad_json.write_text('{"other": []}', encoding="utf-8")
    non_dict = tmp_path / "nondict.json"
    non_dict.write_text('["not-a-dict"]', encoding="utf-8")
    ok_list = tmp_path / "ok_list.json"
    ok_list.write_text('[{"role": "user", "content": "hola"}]', encoding="utf-8")

    for bad_argv in (
        ["--input", str(tmp_path / "missing.json")],
        ["--input", "a\x00b.json"],
        ["--input", str(bad_json)],
        ["--input", str(non_dict)],
        ["--input", str(ok_list), "--context-window", "0"],
        ["--input", str(ok_list), "--threshold-ratio", "1.5"],
        ["--input", str(ok_list), "--keep-recent-tools", "-1"],
        ["--input", str(ok_list), "--keep-last-messages", "0"],
        ["--input", str(ok_list), "--anchor-tokens", "-5"],
        ["--input", str(ok_list), "--output", "bad\x00out.json"],
    ):
        assert mod.main(bad_argv) == 1
    capsys.readouterr()

    # Invocación CLI no interactiva (in-process + subprocess) con salida atómica Tier 1
    payload_path = tmp_path / "conv.json"
    out_path = tmp_path / "out" / "compacted.json"
    inproc_out = tmp_path / "out" / "inproc.json"
    conv_payload = {
        "anchor_tokens": 300,
        "messages": [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "task"},
            *[msg for idx in range(8) for msg in _make_tool_pair(idx, 400)],
        ],
    }
    payload_path.write_text(json.dumps(conv_payload), encoding="utf-8")

    assert (
        mod.main(
            [
                "--input",
                str(payload_path),
                "--output",
                str(inproc_out),
                "--context-window",
                "1400",
                "--threshold-ratio",
                "0.90",
                "--keep-recent-tools",
                "6",
            ]
        )
        == 0
    )
    inproc_stdout = capsys.readouterr().out
    assert "tier_applied=1" in inproc_stdout

    # Lectura stdin in-process vía StringIO no-TTY
    fake_stdin = io.StringIO(json.dumps([{"role": "user", "content": "ping"}]))
    monkeypatch.setattr(sys, "stdin", fake_stdin)
    assert mod.main(["--context-window", "5000"]) == 0
    assert "tier_applied=0" in capsys.readouterr().out

    proc = subprocess.run(
        [
            sys.executable,
            str(script_path),
            "--input",
            str(payload_path),
            "--output",
            str(out_path),
            "--context-window",
            "1400",
            "--threshold-ratio",
            "0.90",
            "--keep-recent-tools",
            "6",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert len(proc.stdout.strip().splitlines()) == 1
    assert "tier_applied=1" in proc.stdout
    out_data = json.loads(out_path.read_text(encoding="utf-8"))
    assert out_data["tier_applied"] == 1
    assert out_data["masked_tool_results"] == 2

    # Invocación por tubería stdin vía subprocess
    pipe_proc = subprocess.run(
        [sys.executable, str(script_path), "--context-window", "5000"],
        input=json.dumps([{"role": "user", "content": "hola"}]),
        capture_output=True,
        text=True,
        check=False,
    )
    assert pipe_proc.returncode == 0
    assert "tier_applied=0" in pipe_proc.stdout


def test_select_tests_by_blast_radius_all_four_tiers_and_cli(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Cubre docs-only, pr-targeted con propagación AST, full-regression y nightly."""
    mod = _load_script(
        "select_tests_by_blast_radius.py", "select_tests_by_blast_radius"
    )
    graph_path = tmp_path / "graph.json"
    graph_payload = {
        "nodes": [
            {"id": "n_actor", "source_file": "vue3/tests/screenplay/Actor.ts"},
            {"id": "n_rag", "source_file": "ai-evals/rag/test_rag_faithfulness.py"},
            {"id": "n_mcp", "source_file": "mcp-server/src/tools/x.ts"},
            {"id": "n_hot", "source_file": "python/src/core.py"},
            {"id": "n_hot15", "source_file": "python/src/edge15.py"},
            {"id": "n_nofile", "source_file": ""},
            *[
                {"id": f"c_{i}", "source_file": f"python/tests/test_{i}.py"}
                for i in range(18)
            ],
        ],
        "links": [
            {
                "source": "n_actor",
                "target": "n_actor",
                "relation": "contains",
                "source_file": "vue3/tests/screenplay/Actor.ts",
            },
            {
                "source": "n_rag",
                "target": "n_actor",
                "relation": "documented_in",
                "source_file": "docs/actor.md",
            },
            {
                "source": "n_rag",
                "target": "n_actor",
                "relation": "calls",
                "source_file": "ai-evals/rag/test_rag_faithfulness.py",
            },
            {
                "source": "",
                "target": "n_actor",
                "relation": "calls",
                "source_file": "",
            },
            {
                "source": "n_nofile",
                "target": "n_actor",
                "relation": "calls",
                "source_file": "",
            },
            *[
                {
                    "source": f"c_{i}",
                    "target": "n_hot",
                    "relation": "calls",
                    "source_file": f"python/tests/test_{i}.py",
                }
                for i in range(18)
            ],
            *[
                {
                    "source": f"c_{i}",
                    "target": "n_hot15",
                    "relation": "calls",
                    "source_file": f"python/tests/test_{i}.py",
                }
                for i in range(15)
            ],
        ],
    }
    graph_path.write_text(json.dumps(graph_payload), encoding="utf-8")

    # 1. docs-only (85% ahorro)
    docs_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["README.md", "docs/01_ARQUITECTURA.md", "LICENSE"],
        graph_path=graph_path,
    )
    assert docs_plan["tier"] == "docs-only"
    assert docs_plan["estimated_savings_pct"] == 85
    assert docs_plan["run_full_regression"] is False
    assert docs_plan["run_frontend"] is False

    # 2. pr-targeted con propagación AST cruzada vue3 -> ai-evals (40..60% ahorro)
    pr_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["./vue3/tests/screenplay/Actor.ts"],
        graph_path=graph_path,
    )
    assert pr_plan["tier"] == "pr-targeted"
    assert pr_plan["run_frontend"] is True
    assert pr_plan["run_ai_offline"] is True
    assert pr_plan["run_backend"] is False
    assert 40 <= pr_plan["estimated_savings_pct"] <= 60
    assert pr_plan["caller_count"] == 2

    # pr-targeted en mcp-server activa run_mcp y validate_calm + fallback sin grafo
    mcp_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["mcp-server/src/tools/x.ts"],
        graph_path=tmp_path / "missing_graph.json",
    )
    assert mcp_plan["tier"] == "pr-targeted"
    assert mcp_plan["run_mcp"] is True
    assert mcp_plan["validate_calm"] is True
    assert mcp_plan["graph_loaded"] is False

    # fallback run_meta_qa si se toca archivo neutro fuera de prefijos conocidos
    neutral_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["assets/logo.svg"],
        graph_path=graph_path,
    )
    assert neutral_plan["tier"] == "pr-targeted"
    assert neutral_plan["run_meta_qa"] is True

    # 3. full-regression por archivo crítico, lista vacía y alto radio AST
    crit_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["Makefile"],
        graph_path=graph_path,
    )
    assert crit_plan["tier"] == "full-regression"
    assert crit_plan["run_full_regression"] is True
    assert crit_plan["estimated_savings_pct"] == 0

    hot_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["python/src/core.py"],
        graph_path=graph_path,
        high_blast_threshold=15,
    )
    assert hot_plan["tier"] == "full-regression"
    assert hot_plan["caller_count"] == 18

    edge15_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["python/src/edge15.py"],
        graph_path=graph_path,
    )
    assert edge15_plan["tier"] == "full-regression"
    assert edge15_plan["caller_count"] == 15

    # F3.1: .agents/skills/**, .agents/rules/** y .github/actions/** no son docs-only
    for gov_path in (
        ".agents/skills/qa-11x-architect/SKILL.md",
        ".agents/rules/git_closure_gate.md",
        ".github/actions/qa-11x-pr-check/action.yml",
    ):
        gov_plan = mod.select_test_plan(
            event="pull_request",
            changed_files=[gov_path, "README.md"],
            graph_path=graph_path,
        )
        assert gov_plan["tier"] == "full-regression"
        assert gov_plan["run_meta_qa"] is True
        assert gov_plan["run_full_regression"] is True

    # Docs humanos puros: fast-path docs-only; .md en manifest activan run_meta_qa
    human_doc_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=["TESTING.md", "docs/01_ARQUITECTURA.md", "CHANGELOG.md"],
        graph_path=graph_path,
    )
    assert human_doc_plan["tier"] == "docs-only"
    assert human_doc_plan["run_full_regression"] is False

    for manifest_doc in (
        "AGENTS.md",
        "SECURITY.md",
        "catalogs/agenticskills-submission.md",
        "python/README.md",
    ):
        md_gov_plan = mod.select_test_plan(
            event="pull_request",
            changed_files=[manifest_doc],
            graph_path=graph_path,
        )
        assert md_gov_plan["tier"] == "pr-targeted"
        assert md_gov_plan["run_meta_qa"] is True
        assert md_gov_plan["run_full_regression"] is False

    # F3.5: palabras clave de seguridad escalan a full-regression sin falsos positivos
    for sec_code in ("fastapi/src/auth_service.py", "mcp-server/src/tokens.ts"):
        sec_plan = mod.select_test_plan(
            event="pull_request",
            changed_files=[sec_code],
            graph_path=graph_path,
        )
        assert sec_plan["tier"] == "full-regression"
    for benign_code in ("fastapi/src/author.py", "fastapi/src/urls.py"):
        benign_plan = mod.select_test_plan(
            event="pull_request",
            changed_files=[benign_code],
            graph_path=graph_path,
        )
        assert benign_plan["tier"] == "pr-targeted"
        assert benign_plan["run_backend"] is True

    assert mod.classify_suites({".agents/schemas/s.schema.json"})["run_meta_qa"] is True

    # 4. nightly-full + CLI --changed-files-file + --github-output + --json + TTY stdin
    nightly_plan = mod.select_test_plan(
        event="schedule",
        changed_files=[],
        graph_path=graph_path,
    )
    assert nightly_plan["tier"] == "nightly-full"
    assert nightly_plan["run_full_regression"] is True

    changed_file = tmp_path / "changed.txt"
    changed_file.write_text(
        "./vue3/tests/utils/semanticLocator.ts\n", encoding="utf-8"
    )
    gh_out = tmp_path / "out" / "github_output.txt"
    assert (
        mod.main(
            [
                "--event",
                "pull_request",
                "--changed-files-file",
                str(changed_file),
                "--graph",
                str(graph_path),
                "--github-output",
                str(gh_out),
            ]
        )
        == 0
    )
    assert "[blast-selector] tier=pr-targeted" in capsys.readouterr().out
    gh_text = gh_out.read_text(encoding="utf-8")
    assert "tier=pr-targeted" in gh_text
    assert "run_frontend=true" in gh_text

    monkeypatch.setattr(sys, "stdin", io.StringIO("docs/guia.md\n"))
    assert (
        mod.main(
            [
                "--changed-files-file",
                "-",
                "--graph",
                str(graph_path),
                "--json",
            ]
        )
        == 0
    )
    json_out = json.loads(capsys.readouterr().out)
    assert json_out["tier"] == "docs-only"

    # corrupt JSON graph + non-dict links + empty/missing changed files fallback
    bad_graph = tmp_path / "bad_graph.json"
    bad_graph.write_text("{corrupt", encoding="utf-8")
    assert mod.load_ast_graph(bad_graph) is None
    assert mod.parse_changed_files("a.py", str(tmp_path / "missing.txt")) == ["a.py"]

    lint_plan = mod.select_test_plan(
        event="pull_request",
        changed_files=[".agents/scripts/lint_test_antipatterns.py", "fastapi/app.py"],
        graph_path=graph_path,
    )
    assert lint_plan["run_frontend"] is True
    assert lint_plan["run_backend"] is True
    assert lint_plan["run_meta_qa"] is True

    proc = subprocess.run(
        [
            sys.executable,
            str(AGENTS_SCRIPTS_DIR / "select_tests_by_blast_radius.py"),
            "--event",
            "workflow_dispatch",
            "--graph",
            str(graph_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "tier=nightly-full" in proc.stdout


def _load_vibe_auditor_module() -> ModuleType:
    script_path = REPO_ROOT / "vibe-rescue" / "audit_vibe_prototype.py"
    spec = importlib.util.spec_from_file_location("audit_vibe_prototype", script_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["audit_vibe_prototype"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_vibe_rescue_auditor_detects_five_rules_redacts_and_emits_bundle(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_vibe_auditor_module()
    raw_token = "sk-" + "proj-" + ("x" * 24)
    bearer_tok = "Bearer " + raw_token
    assert raw_token not in mod.redact_secrets(bearer_tok)

    toxic = tmp_path / "toxic_vibe"
    (toxic / "src").mkdir(parents=True)
    (toxic / "sql").mkdir(parents=True)
    (toxic / ".env").write_text(
        "\n".join(
            [
                "# comment",
                f"VITE_SUPABASE_SERVICE_ROLE_KEY={raw_token}",
                f"OPENAI_API_KEY={raw_token}",
                "SAFE_VAL=placeholder_demo",
                "INVALID_LINE",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    padding = "\n".join(f"const x{i} = {i};" for i in range(512))
    (toxic / "src" / "client.tsx").write_text(
        "\n".join(
            [
                "// @ts-ignore",
                f"const k = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY "
                f"|| '{raw_token}';",
                "const c: any = supabaseAdmin;",
                "await page.waitForTimeout(1000);",
                padding,
            ]
        ),
        encoding="utf-8",
    )
    (toxic / "src" / "api.ts").write_text(
        "app.post('/items', (req) => req.body);\n",
        encoding="utf-8",
    )
    (toxic / "sql" / "init.sql").write_text(
        (
            "-- USING (true) comentario\n"
            "/* WITH CHECK (true) bloque */\n"
            "CREATE POLICY p ON items USING (true);\n"
            "ALTER ROLE bad_role WITH BYPASSRLS;\n"
            "CREATE TABLE invoices (id UUID PRIMARY KEY);\n"
        ),
        encoding="utf-8",
    )
    (toxic / "tsconfig.json").write_text(
        '{"compilerOptions":{"strict":false}}\n',
        encoding="utf-8",
    )
    (toxic / "Dockerfile").write_text(
        "FROM node:22-alpine:latest\nUSER root\n",
        encoding="utf-8",
    )
    outside = tmp_path / "outside.txt"
    outside.write_text("external", encoding="utf-8")
    (toxic / "link.txt").symlink_to(outside)

    # Modo dry-run por defecto: cero archivos escritos y secreto redactado
    assert (
        mod.main(
            [
                "--target",
                ".",
                "--workspace-root",
                str(toxic),
                "--emit-remediation",
                "qa11x-rescue",
                "--json",
            ]
        )
        == 0
    )
    json_report = json.loads(capsys.readouterr().out)
    assert json_report["verdict"] == "RESCUE_REQUIRED"
    assert json_report["dry_run"] is True
    assert json_report["remediation"]["written_files"] == []
    rules = {item["rule_id"] for item in json_report["findings"]}
    assert rules == {
        "VIBE-SEC-001",
        "VIBE-RLS-002",
        "VIBE-TYPE-003",
        "VIBE-ARCH-004",
        "VIBE-QA-005",
    }
    assert raw_token not in json.dumps(json_report)

    # Modo --no-dry-run + --enforce: escribe bundle y retorna 1
    assert (
        mod.main(
            [
                "--target",
                str(toxic),
                "--workspace-root",
                str(tmp_path),
                "--no-dry-run",
                "--emit-remediation",
                "qa11x-rescue",
                "--enforce",
            ]
        )
        == 1
    )
    fail_out = capsys.readouterr().out
    assert "RESCUE_REQUIRED" in fail_out
    assert raw_token not in fail_out
    rescue_dir = toxic / "qa11x-rescue"
    assert "FORCE ROW LEVEL SECURITY" in (rescue_dir / "rls_hardening.sql").read_text(
        encoding="utf-8"
    )
    env_ex = (rescue_dir / ".env.example").read_text(encoding="utf-8")
    assert "VITE_SUPABASE_SERVICE_ROLE_KEY=<CHANGE_ME_IN_VAULT>" in env_ex
    assert raw_token not in env_ex

    # Segunda ejecucion preserva archivos existentes sin sobrescribir
    plan_file = rescue_dir / "RESCUE_PLAN.md"
    plan_file.write_text("KEEP_CUSTOM\n", encoding="utf-8")
    second = mod.audit_prototype(
        toxic,
        dry_run=False,
        emit_dir=rescue_dir,
    )
    assert second["remediation"]["written_files"] == []
    assert len(second["remediation"]["skipped_existing"]) == 3
    assert plan_file.read_text(encoding="utf-8") == "KEEP_CUSTOM\n"


def test_vibe_rescue_auditor_clean_pass_quiet_and_path_traversal(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_vibe_auditor_module()
    raw_token = "sk-" + "proj-" + ("y" * 24)
    clean = tmp_path / "clean_app"
    (clean / "src").mkdir(parents=True)
    (clean / "sql").mkdir(parents=True)
    (clean / "tests").mkdir(parents=True)

    (clean / ".gitignore").write_text(".env\n", encoding="utf-8")
    (clean / ".env").write_text(f"OPENAI_API_KEY={raw_token}\n", encoding="utf-8")
    (clean / "sql" / "schema.sql").write_text(
        (
            "CREATE TABLE items (id UUID PRIMARY KEY, tenant_id UUID NOT NULL);\n"
            "ALTER TABLE items ENABLE ROW LEVEL SECURITY;\n"
            "ALTER TABLE items FORCE ROW LEVEL SECURITY;\n"
        ),
        encoding="utf-8",
    )
    (clean / "tsconfig.json").write_text(
        '{"compilerOptions":{"strict":true}}\n',
        encoding="utf-8",
    )
    (clean / "src" / "routes.ts").write_text(
        "app.post('/items', (req) => req.headers['Idempotency-Key']);\n",
        encoding="utf-8",
    )
    (clean / "Dockerfile").write_text(
        "FROM node:22-alpine@sha256:abcdef012345\nUSER 1001\n",
        encoding="utf-8",
    )
    (clean / "tests" / "app.test.ts").write_text(
        "export const ok = true;\n",
        encoding="utf-8",
    )

    assert mod.main(["--target", str(clean), "--enforce"]) == 0
    pass_out = capsys.readouterr().out.strip()
    assert len(pass_out.splitlines()) == 1
    assert "ENTERPRISE_READY" in pass_out

    # Bundle limpio sin .env ni hallazgos usa DEFAULT_ENV_KEYS
    minimal = tmp_path / "minimal_app"
    (minimal / "tests").mkdir(parents=True)
    (minimal / "tests" / "ok.test.py").write_text("assert True\n", encoding="utf-8")
    monkeypatch.chdir(minimal)
    assert (
        mod.main(
            [
                "--target",
                ".",
                "--no-dry-run",
                "--emit-remediation",
                "out-clean",
            ]
        )
        == 0
    )
    _ = capsys.readouterr()
    assert "AUDIT_HMAC_KEY=<CHANGE_ME_IN_VAULT>" in (
        minimal / "out-clean" / ".env.example"
    ).read_text(encoding="utf-8")
    assert "Sin hallazgos criticos o altos." in (
        minimal / "out-clean" / "RESCUE_PLAN.md"
    ).read_text(encoding="utf-8")

    # Rechazo de Path Traversal y entradas invalidas
    assert (
        mod.main(["--target", "../../etc/passwd", "--workspace-root", str(tmp_path)])
        == 2
    )
    assert (
        mod.main(
            [
                "--target",
                ".",
                "--workspace-root",
                str(clean),
                "--emit-remediation",
                "../escape",
            ]
        )
        == 2
    )
    assert mod.main(["--target", str(clean), "--max-lines", "0"]) == 2
    assert mod.main(["--target", str(tmp_path / "missing")]) == 2
    _ = capsys.readouterr()

    with pytest.raises(ValueError, match="Ruta"):
        mod.resolve_contained_path("%2e%2e/etc")
    with pytest.raises(ValueError, match="fuera"):
        mod.resolve_contained_path("/etc/passwd", allowed_roots=(tmp_path,))

    # Verificacion CLI real por subproceso
    proc = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "vibe-rescue" / "audit_vibe_prototype.py"),
            "--target",
            "../../etc/passwd",
            "--workspace-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 2


def test_verify_docs_invariants_bilingual_readme_and_internal_links(
    tmp_path: Path,
) -> None:
    """Valida modelo bilingüe, enlaces internos reales y anti-traversal."""
    mod = _load_script("verify_docs_invariants.py", "meta_qa_verify_docs_bilingual")
    (tmp_path / "docs").mkdir(parents=True)
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "qa-logo.jpeg").write_bytes(b"jpeg")
    (tmp_path / "LICENSE").write_text("MIT\n", encoding="utf-8")

    (tmp_path / "README.md").write_text(
        "> 🌐 Language: **English** | [Español](README.es.md)\n\n"
        '<img src="assets/qa-logo.jpeg" alt="Logo" />\n\n'
        "[Docs](docs/01_ARQUITECTURA_PIRAMIDE_11X.md) · "
        "[License](LICENSE) · [Ext](https://example.com)\n",
        encoding="utf-8",
    )
    (tmp_path / "README.es.md").write_text(
        "> 🌐 Idioma: [English](README.md) | **Español**\n\n"
        "[Recursos](RESOURCES.md) · [Licencia](LICENSE)\n",
        encoding="utf-8",
    )
    (tmp_path / "RESOURCES.md").write_text(
        "# Recursos\n\n* [Portada](README.md)\n* [Espejo](README.es.md)\n",
        encoding="utf-8",
    )
    (tmp_path / "docs" / "01_ARQUITECTURA_PIRAMIDE_11X.md").write_text(
        "# Pirámide 11X\n\n* [English](../README.md)\n",
        encoding="utf-8",
    )

    assert mod.validate_repository_docs(tmp_path) == []

    # Caso 1: Falta README.es.md cuando existe RESOURCES.md
    (tmp_path / "README.es.md").unlink()
    missing_es = mod.validate_repository_docs(tmp_path)
    assert any("README.es.md" in err for err in missing_es)

    # Caso 2: Falta README.md cuando existe README.es.md
    (tmp_path / "README.es.md").write_text(
        "> 🌐 Idioma: [English](README.md) | **Español**\n",
        encoding="utf-8",
    )
    (tmp_path / "README.md").unlink()
    missing_en = mod.validate_repository_docs(tmp_path)
    assert any("falta README.md" in err for err in missing_en)

    # Caso 3: Enlaces cruzados faltantes, enlace roto y path traversal
    (tmp_path / "README.md").write_text(
        "# English Only\n\n[Broken](missing/doc.md) · [Escape](../../etc/passwd)\n",
        encoding="utf-8",
    )
    (tmp_path / "README.es.md").write_text("# Solo Español\n", encoding="utf-8")
    broken_errors = mod.validate_repository_docs(tmp_path)
    assert any(
        "README.es.md" in err and "selector/enlace" in err for err in broken_errors
    )
    assert any(
        "README.md" in err and "selector/enlace" in err for err in broken_errors
    )
    assert any("enlace interno roto" in err for err in broken_errors)
    assert any("fuera del repositorio" in err for err in broken_errors)

    # Caso 4: Conteo MCP v1 obsoleto (12 Tools / 9 Resources) en repos v2.0
    (tmp_path / "README.md").write_text(
        "> 🌐 Language: **English** | [Español](README.es.md)\n\n"
        "Exposes 12 Tools and 9 Resources.\n",
        encoding="utf-8",
    )
    (tmp_path / "README.es.md").write_text(
        "> 🌐 Idioma: [English](README.md) | **Español**\n",
        encoding="utf-8",
    )
    stale_errors = mod.validate_repository_docs(tmp_path)
    assert any("conteo MCP v1 obsoleto" in err for err in stale_errors)


def _seed_nominal_catalog_repo(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    import hashlib

    skills_ids = (
        "qa-11x-architect",
        "qa-11x-devsecops-hardener",
        "qa-11x-systematic-debugging",
        "qa-11x-screenplay-builder",
        "qa-11x-llm-evaluator",
        "qa-11x-vibe-rescue",
        "qa-11x-docker-certifier",
        "docker-trivy-keydb-hardening",
        "graphify-ast-navigator",
        "refactoring-ui",
        "tactical-patterns-11x",
    )
    tools = [f"tool_{i:02d}" for i in range(19)]
    resources = [f"blueprint://res/{i:02d}" for i in range(13)]
    blueprints = [{"id": f"bp_{i}", "path": f"bp_{i}"} for i in range(10)]

    (root / "mcp-server").mkdir(parents=True, exist_ok=True)
    (root / "mcp-server" / "package.json").write_text(
        json.dumps({"version": "2.21.0"}), encoding="utf-8"
    )
    pack_skills: list[dict[str, Any]] = []
    llm_skills: list[dict[str, Any]] = []
    for sid in skills_ids:
        rel = f".agents/skills/{sid}/SKILL.md"
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = f"---\nname: {sid}\n---\n".encode()
        target.write_bytes(raw)
        pack_skills.append({"id": sid, "name": sid, "path": rel})
        llm_skills.append(
            {
                "id": sid,
                "name": sid,
                "path": rel,
                "size_bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )

    pack_doc: dict[str, Any] = {
        "schema_version": "1.0.0",
        "version": "2.21.0",
        "license": "MIT",
        "skills": pack_skills,
    }
    skillsllm_doc: dict[str, Any] = {
        "schema_version": "1.0.0",
        "version": "2.21.0",
        "license": "MIT",
        "mcp_capabilities": {
            "tools_count": 19,
            "resources_count": 13,
            "tools": tools,
            "resources": resources,
        },
        "blueprints": blueprints,
        "skills": llm_skills,
    }
    (root / "catalogs").mkdir(parents=True, exist_ok=True)
    (root / "catalogs" / "qaskills-pack.json").write_text(
        json.dumps(pack_doc), encoding="utf-8"
    )
    (root / "catalogs" / "skillsllm-manifest.json").write_text(
        json.dumps(skillsllm_doc), encoding="utf-8"
    )
    geo_body = "\n".join([*skills_ids, *tools, *resources]) + "\n"
    (root / "llms.txt").write_text(geo_body, encoding="utf-8")
    (root / "catalogs" / "agenticskills-submission.md").write_text(
        geo_body, encoding="utf-8"
    )
    return pack_doc, skillsllm_doc


def test_verify_docs_invariants_global_catalogs_trimodal(
    tmp_path: Path,
) -> None:
    """Valida contrato trimodal (Virgin, Nominal, Broken) para llms.txt y catalogs/*."""
    mod = _load_script("verify_docs_invariants.py", "meta_qa_verify_docs_catalogs")

    # 1. Virgin: sin llms.txt ni catalogs/ no falla en proyectos sin GEO
    assert mod.check_global_catalogs_and_geo(tmp_path) == []

    # 2. Nominal: 11 skills + 19 tools + 13 resources + SHA-256 consistentes
    pack_doc, skillsllm_doc = _seed_nominal_catalog_repo(tmp_path)
    assert mod.check_global_catalogs_and_geo(tmp_path) == []

    # 3. Broken A: clave JSON duplicada + mismatch SHA-256
    (tmp_path / "catalogs" / "qaskills-pack.json").write_text(
        '{"license": "MIT", "license": "MIT", "version": "2.21.0", "skills": []}',
        encoding="utf-8",
    )
    skillsllm_doc["skills"][0]["sha256"] = "0" * 64
    (tmp_path / "catalogs" / "skillsllm-manifest.json").write_text(
        json.dumps(skillsllm_doc), encoding="utf-8"
    )
    broken_errs = mod.check_global_catalogs_and_geo(tmp_path)
    assert any("JSON inválido" in err for err in broken_errs)
    assert any("desfase SHA-256/size_bytes" in err for err in broken_errs)

    # 4. Broken B: llms.txt incompleto + artefacto obligatorio faltante
    (tmp_path / "catalogs" / "qaskills-pack.json").write_text(
        json.dumps(pack_doc), encoding="utf-8"
    )
    (tmp_path / "llms.txt").write_text("# incomplete\n", encoding="utf-8")
    assert any(
        "llms.txt" in err for err in mod.check_global_catalogs_and_geo(tmp_path)
    )
    (tmp_path / "catalogs" / "agenticskills-submission.md").unlink()
    assert any(
        "Falta artefacto GEO/catálogo obligatorio" in err
        for err in mod.check_global_catalogs_and_geo(tmp_path)
    )


def _good_pagespeed_payload() -> dict[str, Any]:
    return {
        "lighthouseResult": {
            "categories": {
                "performance": {"score": 0.94},
                "accessibility": {"score": 0.98},
                "best-practices": {"score": 0.96},
                "seo": {"score": 1.0},
            },
            "audits": {
                "render-blocking-resources": {
                    "title": "Eliminate render-blocking resources",
                    "score": 0.45,
                    "details": {
                        "type": "opportunity",
                        "overallSavingsMs": 320,
                        "overallSavingsBytes": 18000,
                    },
                },
                "already-fast": {"score": 0.95, "details": {"type": "opportunity"}},
                "info-only": {"score": 0.5, "details": {"type": "table"}},
                "raw-str": "ignore",
            },
        },
        "loadingExperience": {
            "overall_category": "FAST",
            "metrics": {
                "LARGEST_CONTENTFUL_PAINT_MS": {
                    "percentile": 1800,
                    "category": "FAST",
                },
                "INTERACTION_TO_NEXT_PAINT": {
                    "percentile": 120,
                    "category": "FAST",
                },
            },
        },
    }


def test_pagespeed_insights_virgin_and_ssrf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Audita audit_pagespeed_insights.py en Virgen y bloqueo Anti-SSRF SEC-03."""
    import socket

    psi: Any = _load_script("audit_pagespeed_insights.py", "audit_pagespeed_insights")

    code_skip, rep_skip = psi.run_pagespeed_audit(psi.AuditOptions(url=""))
    assert code_skip == 0
    assert rep_skip["status"] == "SKIPPED"
    assert rep_skip["reason"] == "MISSING_TARGET_URL"

    code_req, _ = psi.run_pagespeed_audit(
        psi.AuditOptions(url="   ", require_url=True)
    )
    assert code_req == 2

    bad_urls = [
        "http://ejemplo.com",
        "https://user:pass@ejemplo.com",
        "https://localhost/app",
        "https://127.0.0.1/status",
        "https://169.254.169.254/latest/meta-data",
        "https://api.internal/health",
        "https://backend-db/metrics",
    ]
    for bad in bad_urls:
        code_bad, rep_bad = psi.run_pagespeed_audit(psi.AuditOptions(url=bad))
        assert code_bad == 1, f"Debió bloquear {bad}"
        assert rep_bad["status"] == "BLOCKED_SSRF"

    code_dns, rep_dns = psi.run_pagespeed_audit(
        psi.AuditOptions(url="https://public.ejemplo.com"),
        resolver=lambda _h: ["10.0.0.15"],
    )
    assert code_dns == 1
    assert rep_dns["status"] == "BLOCKED_SSRF"

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
        ],
    )
    assert psi._default_dns_resolver("example.com") == ["93.184.216.34"]
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_a, **_kw: (_ for _ in ()).throw(OSError("dns down")),
    )
    assert psi._default_dns_resolver("example.com") == []


def test_pagespeed_insights_nominal_and_persistence(tmp_path: Path) -> None:
    """Audita audit_pagespeed_insights.py en escenario Nominal (Lab+CrUX)."""
    psi: Any = _load_script("audit_pagespeed_insights.py", "audit_pagespeed_insights")
    good_payload = _good_pagespeed_payload()

    code_ok, rep_ok = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="both",
            output_path="psi-reports/psi-report.json",
            base_dir=tmp_path,
        ),
        fetcher=lambda _u, _t: (200, json.dumps(good_payload)),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_ok == 0
    assert rep_ok["status"] == "PASSED"
    assert len(rep_ok["strategies"]) == 2
    assert rep_ok["strategies"][0]["crux"]["overall_category"] == "FAST"
    first_opp = rep_ok["strategies"][0]["top_opportunities"][0]
    assert first_opp["id"] == "render-blocking-resources"
    assert (tmp_path / "psi-reports" / "psi-report.json").is_file()
    summary = psi.format_human_summary(rep_ok)
    assert "PASSED" in summary and "FAST" in summary


def test_pagespeed_insights_degraded_redaction_and_cli() -> None:
    """Audita audit_pagespeed_insights.py en Degradado, 429 y redacción."""
    psi: Any = _load_script("audit_pagespeed_insights.py", "audit_pagespeed_insights")
    bad_scores_payload = {
        "lighthouseResult": {
            "categories": {
                "performance": {"score": 0.60},
                "accessibility": {"score": 0.80},
                "best-practices": {},
                "seo": {"score": 0.95},
            }
        },
        "loadingExperience": "invalid",
    }
    code_fail, rep_fail = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="desktop",
            thresholds=psi.ThresholdConfig(0.90, 0.95, 0.90, 0.90),
        ),
        fetcher=lambda _u, _t: (200, json.dumps(bad_scores_payload)),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_fail == 1
    assert rep_fail["status"] == "FAILED"
    breaches = rep_fail["strategies"][0]["breaches"]
    assert any("performance: 0.60 < 0.90" in b for b in breaches)
    assert any("sin puntaje reportado" in b for b in breaches)

    for bad_body in ("{broken-json", "[]"):
        _, rep_bad_json = psi.run_pagespeed_audit(
            psi.AuditOptions(url="https://ejemplo-publico.com", strategy="mobile"),
            fetcher=lambda _u, _t, body=bad_body: (200, body),
            resolver=lambda _h: ["93.184.216.34"],
        )
        assert rep_bad_json["status"] == "FAILED"

    fake_key_net = "AIzaSuperSecret99"  # qa-secret-fixture-ok
    _, rep_net_err = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="mobile",
            api_key=fake_key_net,
        ),
        fetcher=lambda _u, _t: (_ for _ in ()).throw(
            RuntimeError(f"GET https://googleapis.com?key={fake_key_net} failed")
        ),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert rep_net_err["status"] == "FAILED"
    assert fake_key_net not in json.dumps(rep_net_err)
    assert "[REDACTED]" in json.dumps(rep_net_err)

    code_429_skip, rep_429_skip = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com", strategy="mobile", api_key=""
        ),
        fetcher=lambda _u, _t: (429, '{"error":"quota"}'),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_429_skip == 0
    assert rep_429_skip["status"] == "SKIPPED"

    fake_key_429 = "AIzaSecretKey123456"  # qa-secret-fixture-ok
    code_429_key, rep_429_key = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="mobile",
            api_key=fake_key_429,
        ),
        fetcher=lambda _u, _t: (429, f"Quota error for ?key={fake_key_429}"),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_429_key == 1
    assert rep_429_key["status"] == "FAILED"
    assert fake_key_429 not in json.dumps(rep_429_key)


def test_pagespeed_insights_http_fetcher_paths_and_cli(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cubre _default_http_fetcher, rutas seguras /tmp y argumentos CLI."""
    import io
    import urllib.error
    import urllib.request
    from typing import Self

    psi: Any = _load_script("audit_pagespeed_insights.py", "audit_pagespeed_insights")

    class _FakeResp:
        status = 200

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_a: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"ok":true}'

    monkeypatch.setattr(
        urllib.request, "urlopen", lambda _req, timeout=60: _FakeResp()
    )
    assert psi._default_http_fetcher("https://www.googleapis.com/x", 10) == (
        200,
        '{"ok":true}',
    )

    http_err = urllib.error.HTTPError(
        "https://x", 503, "Unavailable", {}, io.BytesIO(b"busy")  # type: ignore[arg-type]
    )
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda _req, timeout=60: (_ for _ in ()).throw(http_err),
    )
    assert psi._default_http_fetcher("https://www.googleapis.com/x", 10) == (
        503,
        "busy",
    )

    for bad_out in ("../escape.json", "/etc/escape.json"):
        with pytest.raises(ValueError):
            psi.resolve_safe_output_path(bad_out, tmp_path)
    safe_tmp = psi.resolve_safe_output_path("/tmp/psi-ok.json", tmp_path)
    assert str(safe_tmp).startswith("/tmp")

    with pytest.raises(ValueError):
        psi._resolve_strategies("tablet")

    assert psi.main(["--url", "", "--json"]) == 0
    assert psi.main(["--url", "http://127.0.0.1"]) == 1


def test_verify_topological_health_cycle_dfs_and_structural_filter(
    tmp_path: Path,
) -> None:
    """Valida DFS de ciclos cross-file y exclusión de aristas estructurales."""
    mod = _load_script("verify_topological_health.py", "meta_qa_topo_cycles")
    graph_path = tmp_path / "graphify-out" / "graph.json"
    graph_path.parent.mkdir(parents=True)

    clean_graph: dict[str, Any] = {
        "nodes": [
            {"id": "a1", "source_file": "src/a.py"},
            {"id": "a2", "source_file": "src/a.py"},
            {"id": "b1", "source_file": "src/b.py"},
            {"id": "d1", "source_file": "src/d.py"},
        ],
        "links": [
            "not-a-dict",
            {"source": "a1", "target": "a2", "relation": "calls"},
            {"source": "a2", "target": "a1", "relation": "calls"},
            {"source": "a1", "target": "b1", "relation": "contains"},
            {"source": "b1", "target": "a1", "relation": "defines"},
            {"source": "a1", "target": "b1", "relation": "imports"},
            {"source": "b1", "target": "d1", "relation": "imports"},
            {"source": "a1", "target": "d1", "relation": "imports"},
        ],
    }
    graph_path.write_text(json.dumps(clean_graph), encoding="utf-8")
    violations_clean, _ = mod.audit_layers(clean_graph, graph_path)
    assert violations_clean == []
    assert mod.cli_main(["--graph", str(graph_path)]) == 0

    cyclic_graph: dict[str, Any] = {
        "nodes": [
            {"id": "mod_a", "source_file": "src/a.py"},
            {"id": "mod_b", "source_file": "src/b.py"},
            {"id": "mod_c", "source_file": "src/c.py"},
        ],
        "links": [
            {"source": "mod_b", "target": "mod_c", "relation": "calls"},
            {"source": "mod_c", "target": "mod_a", "relation": "imports"},
            {"source": "mod_a", "target": "mod_b", "relation": "calls"},
        ],
    }
    graph_path.write_text(json.dumps(cyclic_graph), encoding="utf-8")
    violations_cyc, _ = mod.audit_layers(cyclic_graph, graph_path)
    assert len(violations_cyc) == 1
    assert "Dependencia cíclica detectada" in violations_cyc[0]
    assert "mod_a -> mod_b -> mod_c -> mod_a" in violations_cyc[0]
    assert mod.cli_main(["--graph", str(graph_path)]) == 1


def _assert_checkpoint_rejections(mod: Any, tmp_path: Path, snap: Any) -> None:
    ckpt_file = tmp_path / ".agents" / ".cache" / "session_checkpoint.json"
    baseline = json.loads(ckpt_file.read_text(encoding="utf-8"))
    bad_mutations: list[tuple[dict[str, Any], type[Exception]]] = [
        ({**baseline, "extra_field": 1}, ValueError),
        ({**baseline, "schema_version": "2.0"}, ValueError),
        ({**baseline, "status": "BOGUS"}, ValueError),
        ({**baseline, "task_id": ""}, TypeError),
        ({**baseline, "intent_140chars": "x" * 141}, ValueError),
        ({**baseline, "completed_steps": "not-a-list"}, TypeError),
        (
            {
                **baseline,
                "last_script_run": {
                    "cmd": "pytest",
                    "exit_code": True,
                    "timestamp": "2026-11-17T12:00:00Z",
                    "summary_1line": "ok",
                },
            },
            TypeError,
        ),
        (
            {
                **baseline,
                "last_script_run": {
                    "cmd": "pytest",
                    "exit_code": 0,
                    "timestamp": "short",
                    "summary_1line": "ok",
                },
            },
            ValueError,
        ),
    ]
    for payload, exc_type in bad_mutations:
        ckpt_file.write_text(json.dumps(payload), encoding="utf-8")
        with pytest.raises(exc_type):
            mod.load_checkpoint(tmp_path, snap)


def test_checkpoint_ctl_strict_schema_validation_contract(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida contrato session_checkpoint.schema.json y rechazo estricto."""
    mod = _load_script("checkpoint_ctl.py", "meta_qa_checkpoint_schema")
    schema_path = REPO_ROOT / ".agents" / "schemas" / "session_checkpoint.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    assert (
        mod.main(
            [
                "set",
                "--workspace",
                str(tmp_path),
                "--task-id",
                "T-SCHEMA-1",
                "--step",
                "S1",
                "--intent",
                "Validar schema estricto 11X",
                "--done",
                "S0",
                "--planned",
                "S1,S2",
            ]
        )
        == 0
    )
    assert (
        mod.main(
            [
                "record-cmd",
                "--workspace",
                str(tmp_path),
                "--cmd",
                "make test-meta-qa",
                "--rc",
                "0",
                "--summary",
                "Meta-QA ok",
            ]
        )
        == 0
    )
    _ = capsys.readouterr()

    ckpt_file = tmp_path / ".agents" / ".cache" / "session_checkpoint.json"
    payload = json.loads(ckpt_file.read_text(encoding="utf-8"))
    assert set(schema["required"]) == set(payload.keys())
    assert payload["schema_version"] == schema["properties"]["schema_version"]["const"]
    assert payload["status"] in schema["properties"]["status"]["enum"]
    last_props = schema["properties"]["last_script_run"]["oneOf"][1]
    assert set(last_props["required"]) == set(payload["last_script_run"].keys())

    snap = mod.capture_live_git(tmp_path)
    _assert_checkpoint_rejections(mod, tmp_path, snap)


def test_inspect_blast_radius_workspace_cli(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida --workspace en inspect_blast_radius.py sin consultar el repo raíz."""
    mod = _load_script("inspect_blast_radius.py", "meta_qa_inspect_ws")
    ws = tmp_path / "isolated_ws"
    (ws / "graphify-out").mkdir(parents=True)
    (ws / "app").mkdir(parents=True)
    (ws / "tests").mkdir(parents=True)
    (ws / "tests" / "test_do_work.bats").write_text(
        "do_work()\n", encoding="utf-8"
    )

    graph = {
        "nodes": [
            {
                "id": "fn_do_work",
                "label": "do_work",
                "source_file": "app/core.py",
                "source_location": "L10",
            },
            {
                "id": "fn_api",
                "label": "handle_api",
                "source_file": "app/api.py",
                "source_location": "L20",
                "community_name": "api",
            },
            {
                "id": "fn_cli",
                "label": "handle_cli",
                "source_file": "app/cli.py",
                "source_location": "L30",
                "community_name": "cli",
            },
        ],
        "links": [
            {"source": "fn_api", "target": "fn_do_work", "relation": "calls"},
            {"source": "fn_cli", "target": "fn_do_work", "relation": "calls"},
        ],
    }
    (ws / "graphify-out" / "graph.json").write_text(
        json.dumps(graph), encoding="utf-8"
    )
    assert mod.main(["do_work", "--workspace", str(ws)]) == 0
    out_ws = capsys.readouterr().out
    assert "Llamadores: 2" in out_ws
    assert "test_do_work.bats" in out_ws

    virgin_ws = tmp_path / "virgin_ws"
    (virgin_ws / "src").mkdir(parents=True)
    (virgin_ws / "src" / "only.py").write_text("do_work()\n", encoding="utf-8")
    assert mod.main(["do_work", "--workspace", str(virgin_ws)]) == 2
    assert (
        mod.main(["do_work", "--workspace", str(virgin_ws), "--allow-missing"]) == 0
    )
    out_virgin = capsys.readouterr().out
    assert "src/only.py" in out_virgin


def _init_temp_git_repo(repo: Path) -> None:
    for cmd in (
        ["git", "init", "-b", "main"],
        ["git", "config", "user.name", "QA Bot"],
        ["git", "config", "user.email", "qa@example.com"],
    ):
        subprocess.run(cmd, cwd=repo, check=True, capture_output=True)
    (repo / "README.md").write_text("init\n", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    subprocess.run(
        ["git", "checkout", "-b", "feat/mobile"],
        cwd=repo,
        check=True,
        capture_output=True,
    )
    (repo / "mobile-appium" / "src").mkdir(parents=True)
    (repo / "mobile-appium" / "src" / "App.tsx").write_text("x\n", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "mobile"], cwd=repo, check=True, capture_output=True
    )


def test_select_tests_by_blast_radius_base_ref_and_unsafe_ref(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida --base-ref/--base git diff y rechazo de refs inseguras."""
    mod = _load_script(
        "select_tests_by_blast_radius.py", "select_tests_by_blast_radius"
    )
    assert mod.main(["--base-ref=-evil"]) == 2
    assert "insegura" in capsys.readouterr().err
    assert mod.main(["--base", "main..HEAD"]) == 2
    _ = capsys.readouterr()

    repo = tmp_path / "git_ws"
    repo.mkdir()
    _init_temp_git_repo(repo)
    monkeypatch.chdir(repo)

    rc = mod.main(["--base-ref", "main", "--json"])
    assert rc == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["changed_files"] == ["mobile-appium/src/App.tsx"]
    assert plan["run_mobile"] is True

    # Fallback origin/<ref> cuando ref local no existe, origin/ directo y OSError
    subprocess.run(
        ["git", "update-ref", "refs/remotes/origin/remote-main", "HEAD~1"],
        cwd=repo,
        check=True,
        capture_output=True,
    )
    assert mod._resolve_git_changed_files("remote-main", repo) == [
        "mobile-appium/src/App.tsx"
    ]
    assert mod._resolve_git_changed_files("origin/nonexistent", repo) == []
    assert mod._resolve_git_changed_files("nonexistent-branch", repo) == []
    monkeypatch.setattr(
        mod.subprocess,
        "run",
        lambda *_a, **_kw: (_ for _ in ()).throw(OSError("no git")),
    )
    assert mod._run_git_diff_names(repo, "main...HEAD") == (1, [])

