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
