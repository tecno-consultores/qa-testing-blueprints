# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
"""Unit tests for .agents/scripts/bump_version_11x.py (>=95% & 100% delta coverage)."""

from __future__ import annotations

import importlib.util
import json
import re
import runpy
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / ".agents" / "scripts" / "bump_version_11x.py"


def _load_mod() -> Any:
    spec = importlib.util.spec_from_file_location("bump_version_11x_under_test", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_read_json_field_handles_missing_valid_and_blank(tmp_path: Path) -> None:
    mod = _load_mod()
    assert mod._read_json_field(tmp_path / "missing.json", "version") is None

    pkg = tmp_path / "pkg.json"
    pkg.write_text(json.dumps({"version": "3.0.0", "blank": "   ", "num": 42}), encoding="utf-8")
    assert mod._read_json_field(pkg, "version") == "3.0.0"
    assert mod._read_json_field(pkg, "blank") is None
    assert mod._read_json_field(pkg, "num") is None


def test_resolve_targets_defaults_and_validation(tmp_path: Path) -> None:
    mod = _load_mod()
    (tmp_path / "mcp-server").mkdir()
    (tmp_path / "mcp-server" / "package.json").write_text(
        json.dumps({"version": "3.0.0"}), encoding="utf-8"
    )
    assert mod.resolve_targets(tmp_path, None, None) == ("3.0.0", None)

    (tmp_path / "catalogs").mkdir()
    (tmp_path / "catalogs" / "qaskills-pack.json").write_text(
        json.dumps({"standard_edition": "QA-11X v3.0"}), encoding="utf-8"
    )
    assert mod.resolve_targets(tmp_path, None, None) == ("3.0.0", "QA-11X v3.0")
    assert mod.resolve_targets(tmp_path, "3.1.0-rc.1", "QA-11X v3.1") == ("3.1.0-rc.1", "QA-11X v3.1")

    with pytest.raises(ValueError, match="target version"):
        mod.resolve_targets(tmp_path, "not-semver", None)

    with pytest.raises(ValueError, match="standard edition"):
        mod.resolve_targets(tmp_path, "3.0.0", "BAD-EDITION")


def test_find_mismatches_and_apply_rule() -> None:
    mod = _load_mod()
    rule = mod.VersionRule(
        "demo.txt",
        (
            re.compile(r'^(version=")([^"]+)(")', re.MULTILINE),
            re.compile(r'^(other=")([^"]+)(")', re.MULTILINE),
        ),
        max_replacements=1,
    )
    mismatches = mod.find_mismatches('version="2.21.0"\n', rule, "3.0.0")
    assert any("found '2.21.0', expected '3.0.0'" in msg for msg in mismatches)
    assert any("anchor missing" in msg for msg in mismatches)

    clean_rule = mod.VersionRule("demo.txt", (re.compile(r'^(version=")([^"]+)(")', re.MULTILINE),), max_replacements=1)
    assert mod.find_mismatches('version="3.0.0"\n', clean_rule, "3.0.0") == []

    sample = 'version="2.21.0"\nversion="2.21.0"\n'
    rewritten, pats = mod.apply_rule(sample, rule, "3.0.0")
    assert pats == 1
    assert rewritten == 'version="3.0.0"\nversion="2.21.0"\n'


def test_process_rule_and_run_rules_variants(tmp_path: Path) -> None:
    mod = _load_mod()
    pat = re.compile(r'^(ver=")([^"]+)(")', re.MULTILINE)
    req_rule = mod.VersionRule("req.txt", (pat,))
    opt_rule = mod.VersionRule("opt.txt", (pat,), optional=True)

    assert mod.process_rule(tmp_path, req_rule, "3.0.0", False) == (["req.txt: missing file"], 0)
    assert mod.process_rule(tmp_path, opt_rule, "3.0.0", False) == ([], 0)

    req_file = tmp_path / "req.txt"
    req_file.write_text('no_anchor="1.0.0"\n', encoding="utf-8")
    err_anchor, changed_anchor = mod.process_rule(tmp_path, req_rule, "3.0.0", True)
    assert changed_anchor == 0 and "missing one or more" in err_anchor[0]

    req_file.write_text('ver="2.21.0"\n', encoding="utf-8")
    assert mod.process_rule(tmp_path, req_rule, "3.0.0", False)[1] == 0
    assert mod.process_rule(tmp_path, req_rule, "3.0.0", True) == ([], 1)
    assert req_file.read_text(encoding="utf-8") == 'ver="3.0.0"\n'
    assert mod.process_rule(tmp_path, req_rule, "3.0.0", True) == ([], 0)

    total_errs, total_changed = mod.run_rules(tmp_path, (req_rule, opt_rule), "3.0.0", False)
    assert total_errs == [] and total_changed == 0


def test_main_modes_and_entrypoint(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod()
    (tmp_path / "mcp-server").mkdir()
    (tmp_path / "mcp-server" / "package.json").write_text("{bad-json", encoding="utf-8")
    assert mod.main(["--workspace", str(tmp_path), "--check"]) == 2
    assert "FAIL [bump_version_11x]" in capsys.readouterr().err

    v_file = tmp_path / "app.txt"
    e_file = tmp_path / "edition.txt"
    v_file.write_text('v="2.21.0"\n', encoding="utf-8")
    e_file.write_text('ed="QA-11X v2.0"\n', encoding="utf-8")
    monkeypatch.setattr(
        mod,
        "VERSION_RULES",
        (mod.VersionRule("app.txt", (re.compile(r'^(v=")([^"]+)(")', re.MULTILINE),)),),
    )
    monkeypatch.setattr(
        mod,
        "EDITION_RULES",
        (mod.VersionRule("edition.txt", (re.compile(r'^(ed=")([^"]+)(")', re.MULTILINE),)),),
    )
    (tmp_path / "mcp-server" / "package.json").write_text(json.dumps({"version": "3.0.0"}), encoding="utf-8")

    assert mod.main(["--workspace", str(tmp_path), "--check"]) == 1
    assert "FAIL [bump_version_11x]" in capsys.readouterr().err

    assert mod.main(["--workspace", str(tmp_path), "--set", "3.0.0", "--edition", "QA-11X v3.0"]) == 0
    assert "Updated version=3.0.0 edition=QA-11X v3.0" in capsys.readouterr().out

    assert mod.main(["--workspace", str(tmp_path), "--set", "3.0.0", "--dry-run"]) == 0
    assert "Dry-run checked version=3.0.0 edition=n/a" in capsys.readouterr().out

    assert mod.main(["--workspace", str(tmp_path), "--check", "--edition", "QA-11X v3.0"]) == 0
    assert "Verified version=3.0.0 edition=QA-11X v3.0" in capsys.readouterr().out

    monkeypatch.setattr(sys, "argv", [str(SCRIPT_PATH), "--workspace", str(tmp_path), "--set", "bad"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(SCRIPT_PATH), run_name="__main__")
    assert exc.value.code == 2
