# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Suite Meta-QA trimodal (Virgin, Nominal, Broken) para scripts de gobernanza .agents/scripts/."""

from __future__ import annotations

import importlib.util
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

    if script_name in (
        "verify_json_no_duplicate_keys.py",
        "verify_zero_orphan_vue_components.py",
        "verify_no_orphan_api_endpoints.py",
    ):
        rc = int(mod.main(target_root))
    elif script_name == "verify_docs_invariants.py":
        rc = int(mod.main([str(target_root)]))
    elif script_name == "sync_governance.py":
        rc = int(mod.main(["--repo-root", str(target_root), "--check"]))
    elif script_name in (
        "verify_topological_health.py",
        "verify_alembic_orm_parity.py",
    ):
        monkeypatch.setattr(mod, "REPO_ROOT", target_root)
        rc = int(mod.main())
    elif script_name == "verify_roadmap_consistency.py":
        fake_script_loc = target_root / ".agents" / "scripts" / script_name
        fake_script_loc.parent.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(mod, "__file__", str(fake_script_loc))
        rc = int(mod.main())
    else:
        raise AssertionError(f"Validador no soportado: {script_name}")

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
    """Verifica degradación elegante (sin Traceback) sobre un repositorio mínimo virgen."""
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
    assert rc == 0, f"{script_name} falló en virgin_minimal:\n{output}"


@pytest.mark.parametrize("script_name", ALL_VALIDATORS)
def test_nominal_valid_zero_false_positives(
    tmp_path: Path,
    script_name: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Certifica 0 falsos positivos (in-process y CLI) sobre el fixture nominal_valid."""
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
    """Certifica 0 falsos negativos cuando se inyecta cada mutación de seeded_failures."""
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
            f"Falta diagnóstico '{expected}' en {validator} para '{failure_id}':\n{out_in}"
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
    mod = _load_script("inspect_blast_radius.py", "meta_qa_inspect_blast")
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)

    mod.inspect_symbol("fetch_devices")
    out_graph = capsys.readouterr().out
    assert "⬅️ [Llamado por]" in out_graph
    assert "list_devices" in out_graph
    assert "➡️ [Invoca a]" in out_graph
    assert "Device" in out_graph
    assert "Llamadores: 1" in out_graph

    (tmp_path / "graphify-out" / "graph.json").unlink()
    mod.inspect_symbol("DeviceCard")
    out_fallback = capsys.readouterr().out
    assert "[AST/Source Scan]" in out_fallback
    assert "DeviceCard.spec.ts" in out_fallback


def test_verificar_secretos_detects_synthetic_token_and_passes_clean_repo(
    tmp_path: Path,
) -> None:
    """Valida detección de secretos sobre un git init aislado con token generado en runtime."""
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
    """Valida GO, SKIPPED (smoke) y NO_GO (--dry-run vs --enforce) en CLI e in-process."""
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


def test_release_readiness_gate_security_xxe_traversal_and_zero_tests(
    tmp_path: Path,
) -> None:
    """Rechaza payloads XXE, Path Traversal y suites con 0 pruebas en scope full."""
    gate_script = AGENTS_SCRIPTS_DIR / "release_readiness_gate.py"
    xxe_file = tmp_path / "xxe.xml"
    xxe_file.write_text(
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><testsuite tests="1" />',
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
    """Cubre validaciones in-process de XXE, JSON/XML inválido, symlinks, métricas y errores de salida."""
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
    neg_tel.write_text(json.dumps({"metrics": {"p95_ms": -5}, "error_rate_pct": True}), encoding="utf-8")
    err_xml = tmp_path / "err.xml"
    err_xml.write_text(
        "<testsuites tests='2' errors='1'><testcase name='e'><error /></testcase><testcase name='ok' /></testsuites>",
        encoding="utf-8",
    )

    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "xxe_inproc.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "sym.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "missing.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "   "]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "a\x00b.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "bad.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "malformed.xml"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--telemetry-json", "bad.json"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--defects-json", "arr.json"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--telemetry-json", "neg_tel.json"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--timestamp", "not-iso"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--timestamp", ""]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "err.xml", "--enforce"]) == 1
    assert mod.main(["--workspace-root", str(tmp_path), "--junit-xml", "err.xml", "--output-json", "../../bad.json"]) == 1
    rc_dir_escape, _ = mod.evaluate_release_gate(workspace_root=tmp_path, scope="invalid")
    assert rc_dir_escape == 1
    capsys.readouterr()
