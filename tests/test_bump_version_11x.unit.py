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
    spec = importlib.util.spec_from_file_location("bump_version_11x", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_read_json_field_handles_missing_valid_and_blank(tmp_path: Path) -> None:
    mod = _load_mod()
    assert mod._read_json_field(tmp_path / "missing.json", "version") is None

    pkg = tmp_path / "pkg.json"
    pkg.write_text(
        json.dumps({"version": "3.0.0", "blank": "   ", "num": 42}),
        encoding="utf-8",
    )
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
    assert mod.resolve_targets(tmp_path, "3.1.0-rc.1", "QA-11X v3.1") == (
        "3.1.0-rc.1",
        "QA-11X v3.1",
    )

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

    clean_rule = mod.VersionRule(
        "demo.txt",
        (re.compile(r'^(version=")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    )
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

    assert mod.process_rule(tmp_path, req_rule, "3.0.0", False) == (
        ["req.txt: missing file"],
        0,
    )
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

    total_errs, total_changed = mod.run_rules(
        tmp_path, (req_rule, opt_rule), "3.0.0", False
    )
    assert total_errs == [] and total_changed == 0


def test_main_modes_and_entrypoint(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod()
    (tmp_path / "mcp-server").mkdir()
    (tmp_path / "mcp-server" / "package.json").write_text(
        "{bad-json", encoding="utf-8"
    )
    assert mod.main(["--workspace", str(tmp_path), "--check"]) == 2
    assert "FAIL [bump_version_11x]" in capsys.readouterr().err

    v_file = tmp_path / "app.txt"
    e_file = tmp_path / "edition.txt"
    v_file.write_text('v="2.21.0"\n', encoding="utf-8")
    e_file.write_text('ed="QA-11X v2.0"\n', encoding="utf-8")
    monkeypatch.setattr(
        mod,
        "VERSION_RULES",
        (
            mod.VersionRule(
                "app.txt", (re.compile(r'^(v=")([^"]+)(")', re.MULTILINE),)
            ),
        ),
    )
    monkeypatch.setattr(
        mod,
        "EDITION_RULES",
        (
            mod.VersionRule(
                "edition.txt", (re.compile(r'^(ed=")([^"]+)(")', re.MULTILINE),)
            ),
        ),
    )
    (tmp_path / "mcp-server" / "package.json").write_text(
        json.dumps({"version": "3.0.0"}), encoding="utf-8"
    )

    assert mod.main(["--workspace", str(tmp_path), "--check"]) == 1
    assert "FAIL [bump_version_11x]" in capsys.readouterr().err

    assert (
        mod.main(
            ["--workspace", str(tmp_path), "--set", "3.0.0", "--edition", "QA-11X v3.0"]
        )
        == 0
    )
    assert "Updated version=3.0.0 edition=QA-11X v3.0" in capsys.readouterr().out

    # --edition autónomo sin --set escribe actualización de edición
    assert (
        mod.main(["--workspace", str(tmp_path), "--edition", "QA-11X v3.1"]) == 0
    )
    assert "Updated version=3.0.0 edition=QA-11X v3.1" in capsys.readouterr().out
    assert e_file.read_text(encoding="utf-8") == 'ed="QA-11X v3.1"\n'

    assert mod.main(["--workspace", str(tmp_path), "--set", "3.0.0", "--dry-run"]) == 0
    assert "Dry-run checked version=3.0.0 edition=n/a" in capsys.readouterr().out

    # --set con --dry-run simula en memoria sin error ni escritura en disco
    assert (
        mod.main(
            [
                "--workspace",
                str(tmp_path),
                "--set",
                "3.2.0",
                "--edition",
                "QA-11X v3.2",
                "--dry-run",
            ]
        )
        == 0
    )
    assert "Dry-run checked version=3.2.0 edition=QA-11X v3.2 (writes=0)" in (
        capsys.readouterr().out
    )
    assert v_file.read_text(encoding="utf-8") == 'v="3.0.0"\n'
    assert e_file.read_text(encoding="utf-8") == 'ed="QA-11X v3.1"\n'

    max_rep_rule = mod.VersionRule(
        "dup.txt",
        (re.compile(r'^(v=")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    )
    assert mod.find_mismatches('v="3.0.0"\nv="2.0.0"\n', max_rep_rule, "3.0.0") == []

    assert (
        mod.main(
            [
                "--workspace",
                str(tmp_path),
                "--check",
                "--edition",
                "QA-11X v3.1",
            ]
        )
        == 0
    )
    assert "Verified version=3.0.0 edition=QA-11X v3.1" in capsys.readouterr().out

    monkeypatch.setattr(
        sys, "argv", [str(SCRIPT_PATH), "--workspace", str(tmp_path), "--set", "bad"]
    )
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(SCRIPT_PATH), run_name="__main__")
    assert exc.value.code == 2


def test_extended_doc_and_calm_rules_sync_and_verify(tmp_path: Path) -> None:
    mod = _load_mod()
    targets = {
        "architecture/qa-11x.calm.json",
        "TESTING.md",
        "TESTING.es.md",
        "docs/qa-philosophy.md",
        "docs/qa-philosophy.es.md",
        "docs/ARCHITECTURE_C4.md",
        "docs/ARCHITECTURE_C4.es.md",
        "docs/ai-integration.md",
        "docs/ai-integration.es.md",
    }
    ver_rules = tuple(r for r in mod.VERSION_RULES if r.rel_path in targets)
    ed_rules = tuple(r for r in mod.EDITION_RULES if r.rel_path in targets)
    assert {r.rel_path for r in ver_rules} == targets
    assert len(ed_rules) == 7

    doc_ver_rules = tuple(r for r in ver_rules if r.optional)
    assert mod.run_rules(tmp_path, doc_ver_rules, "3.0.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.0", False) == (
        ["architecture/qa-11x.calm.json: missing file"],
        0,
    )

    (tmp_path / "architecture").mkdir()
    (tmp_path / "docs").mkdir()
    (tmp_path / "architecture" / "qa-11x.calm.json").write_text(
        json.dumps(
            {
                "metadata": [
                    {
                        "qa-11x": {
                            "standard": "QA-11X v3.0",
                            "version": "3.0.0",
                        }
                    }
                ]
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (tmp_path / "TESTING.md").write_text(
        "# Scoreboard — Corporate Standard `QA-11X v3.0` (`v3.0.0`)\n"
        "Corporate Quality Standard Level 11X (`v3.0.0`) scoreboard.\n"
        "### MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x` `v3.0.0`)\n"
        "* **Certified 11X Metrics (`v3.0.0` / `QA-11X v3.0`):**\n",
        encoding="utf-8",
    )
    (tmp_path / "TESTING.es.md").write_text(
        "# Cuadro — Estándar Corporativo `QA-11X v3.0` (`v3.0.0`)\n"
        "Estándar de calidad Nivel 11X (`v3.0.0`) vivo.\n"
        "### MCP Server (`mcp-server/` — `@sinfallas/mcp-qa-11x` `v3.0.0`)\n"
        "* **Métricas 11X Certificadas (`v3.0.0` / `QA-11X v3.0`):**\n",
        encoding="utf-8",
    )
    (tmp_path / "docs" / "qa-philosophy.md").write_text(
        "Underpins `qa-testing-blueprints` (`QA-11X v3.0`).\n"
        "Exposed by `@sinfallas/mcp-qa-11x` v3.0.0, ensuring quality.\n",
        encoding="utf-8",
    )
    (tmp_path / "docs" / "qa-philosophy.es.md").write_text(
        "Fundamenta `qa-testing-blueprints` (`QA-11X v3.0`).\n"
        "Expuestos por `@sinfallas/mcp-qa-11x` v3.0.0, garantizando calidad.\n",
        encoding="utf-8",
    )
    (tmp_path / "docs" / "ARCHITECTURE_C4.md").write_text(
        "Within **QA Testing Blueprints (`QA-11X v3.0`)**.\n"
        'MCP["Node.js/TS MCP Server (@sinfallas/mcp-qa-11x v3.0.0)"]\n',
        encoding="utf-8",
    )
    (tmp_path / "docs" / "ARCHITECTURE_C4.es.md").write_text(
        "Dentro de **QA Testing Blueprints (`QA-11X v3.0`)**.\n"
        'MCP["Servidor MCP Node.js/TS (@sinfallas/mcp-qa-11x v3.0.0)"]\n',
        encoding="utf-8",
    )
    (tmp_path / "docs" / "ai-integration.md").write_text(
        "The `@sinfallas/mcp-qa-11x` v3.0.0 MCP server exposes tools.\n"
        "Introduced in `v2.20.0` (and active in `v3.0.0`), it syncs.\n",
        encoding="utf-8",
    )
    (tmp_path / "docs" / "ai-integration.es.md").write_text(
        "El servidor MCP `@sinfallas/mcp-qa-11x` v3.0.0 expone herramientas.\n"
        "Introducido en `v2.20.0` (y activo en `v3.0.0`), sincroniza.\n",
        encoding="utf-8",
    )

    assert mod.run_rules(tmp_path, ver_rules, "3.0.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.0", False) == ([], 0)

    v_errs, _ = mod.run_rules(tmp_path, ver_rules, "3.1.0", False)
    e_errs, _ = mod.run_rules(tmp_path, ed_rules, "QA-11X v3.1", False)
    assert len(v_errs) == 17
    assert len(e_errs) == 9

    assert mod.run_rules(tmp_path, ver_rules, "3.1.0", True) == ([], 9)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.1", True) == ([], 7)
    assert mod.run_rules(tmp_path, ver_rules, "3.1.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.1", False) == ([], 0)

    calm_data = json.loads(
        (tmp_path / "architecture" / "qa-11x.calm.json").read_text(encoding="utf-8")
    )
    assert calm_data["metadata"][0]["qa-11x"] == {
        "standard": "QA-11X v3.1",
        "version": "3.1.0",
    }


def test_major_minor_only_security_rules(tmp_path: Path) -> None:
    mod = _load_mod()
    sec_rules = tuple(
        r for r in mod.VERSION_RULES if r.rel_path in {"SECURITY.md", "SECURITY.es.md"}
    )
    assert len(sec_rules) == 2
    assert all(r.major_minor_only for r in sec_rules)

    (tmp_path / "SECURITY.md").write_text(
        "| **`3.0.x` (`main` / Active)** |\nSuperseded by `3.0.x`.\n",
        encoding="utf-8",
    )
    (tmp_path / "SECURITY.es.md").write_text(
        "| **`3.0.x` (`main` / Activa)** |\nReemplazada por `3.0.x`.\n",
        encoding="utf-8",
    )

    assert mod.run_rules(tmp_path, sec_rules, "3.0.4", False) == ([], 0)
    errs, _ = mod.run_rules(tmp_path, sec_rules, "3.1.2", False)
    assert len(errs) == 4
    assert all("expected '3.1'" in msg for msg in errs)

    assert mod.run_rules(tmp_path, sec_rules, "3.1.2", True) == ([], 2)
    assert mod.run_rules(tmp_path, sec_rules, "3.1.9", False) == ([], 0)
    assert "3.1.x" in (tmp_path / "SECURITY.md").read_text(encoding="utf-8")
    assert "3.1.x" in (tmp_path / "SECURITY.es.md").read_text(encoding="utf-8")


def test_mcp_test_fixtures_edition_and_version_rules(tmp_path: Path) -> None:
    """Valida reglas en github-fetcher, live-mcp-protocol y calm.test.ts."""
    mod = _load_mod()
    targets = {
        "mcp-server/tests/github-fetcher.unit.ts",
        "mcp-server/tests/live-mcp-protocol.test.ts",
        "mcp-server/tests/calm.test.ts",
    }
    ver_rules = tuple(r for r in mod.VERSION_RULES if r.rel_path in targets)
    ed_rules = tuple(r for r in mod.EDITION_RULES if r.rel_path in targets)
    assert {r.rel_path for r in ver_rules} == {"mcp-server/tests/calm.test.ts"}
    assert {r.rel_path for r in ed_rules} == targets

    tests_dir = tmp_path / "mcp-server" / "tests"
    tests_dir.mkdir(parents=True)
    fetcher_unit = tests_dir / "github-fetcher.unit.ts"
    fetcher_unit.write_text(
        "expect(MCP_STANDARD_EDITION).toBe('QA-11X v3.1');\n"
        "expect(extractStandardEdition('Official MCP Server (QA-11X v3.9: 19 Tools)'))"
        ".toBe('QA-11X v3.9');\n"
        "expect(extractStandardEdition('Official MCP Server (QA-11X v3.2: 19 Tools)'))"
        ".toBe('QA-11X v3.2');\n"
        "expect(extractStandardEdition('Description without edition tag'))"
        ".toBe('QA-11X v3.1');\n"
        "expect(extractStandardEdition()).toBe('QA-11X v3.1');\n",
        encoding="utf-8",
    )
    live_proto = tests_dir / "live-mcp-protocol.test.ts"
    live_proto.write_text(
        "expect(card.standardVersion).toBe('QA-11X v3.1');\n"
        "expect(deriveStandardVersion('3.0.0')).toBe('QA-11X v3.0');\n",
        encoding="utf-8",
    )
    calm_test = tests_dir / "calm.test.ts"
    calm_test.write_text(
        "const FIXTURE = {\n"
        "  'qa-11x': {\n"
        "    standard: 'QA-11X v3.1',\n"
        "    version: '3.1.0',\n"
        "  },\n"
        "};\n",
        encoding="utf-8",
    )

    assert mod.run_rules(tmp_path, ver_rules, "3.1.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.1", False) == ([], 0)

    assert mod.run_rules(tmp_path, ver_rules, "3.2.0", True) == ([], 1)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.2", True) == ([], 3)
    assert mod.run_rules(tmp_path, ver_rules, "3.2.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.2", False) == ([], 0)

    updated_fetcher = fetcher_unit.read_text(encoding="utf-8")
    assert "expect(MCP_STANDARD_EDITION).toBe('QA-11X v3.2');" in updated_fetcher
    assert (
        "expect(extractStandardEdition('Description without edition tag'))"
        ".toBe('QA-11X v3.2');"
    ) in updated_fetcher
    assert "expect(extractStandardEdition()).toBe('QA-11X v3.2');" in updated_fetcher
    assert "Official MCP Server (QA-11X v3.9: 19 Tools)" in updated_fetcher
    assert "Official MCP Server (QA-11X v3.2: 19 Tools)" in updated_fetcher
    assert "expect(card.standardVersion).toBe('QA-11X v3.2');" in live_proto.read_text(
        encoding="utf-8"
    )
    calm_updated = calm_test.read_text(encoding="utf-8")
    assert "standard: 'QA-11X v3.2'," in calm_updated
    assert "version: '3.2.0'," in calm_updated


def test_live_repository_bump_check_and_readme_symmetry() -> None:
    mod = _load_mod()
    assert mod.main(["--check"]) == 0
    ed_map = {r.rel_path: r for r in mod.EDITION_RULES}
    assert ed_map["README.md"].patterns == ed_map["README.es.md"].patterns
    ver_map = {r.rel_path: r for r in mod.VERSION_RULES}
    assert ".github/actions/qa-11x-pr-check/action.yml" in ver_map


def test_action_yml_version_rule_sync_and_check(tmp_path: Path) -> None:
    mod = _load_mod()
    action_rule = next(
        r
        for r in mod.VERSION_RULES
        if r.rel_path == ".github/actions/qa-11x-pr-check/action.yml"
    )
    action_file = tmp_path / ".github" / "actions" / "qa-11x-pr-check" / "action.yml"
    action_file.parent.mkdir(parents=True)
    action_file.write_text(
        "npx -y @sinfallas/mcp-qa-11x@3.1.0 audit --sarif\n"
        "npx -y @sinfallas/mcp-qa-11x@3.1.0 certify --offline\n",
        encoding="utf-8",
    )
    errs, _ = mod.run_rules(tmp_path, (action_rule,), "3.2.0", False)
    assert len(errs) == 2
    assert mod.run_rules(tmp_path, (action_rule,), "3.2.0", True) == ([], 1)
    assert mod.run_rules(tmp_path, (action_rule,), "3.2.0", False) == ([], 0)


def test_claude_plugin_manifests_version_and_edition_sync(tmp_path: Path) -> None:
    mod = _load_mod()
    plugin_dir = tmp_path / ".claude-plugin"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "name": "qa-11x",
                "displayName": "QA Testing Blueprints (QA-11X v3.3)",
                "version": "3.3.0",
                "description": (
                    "Enterprise QA & DevSecOps Standard (QA-11X v3.3): "
                    "11 Modular Skills"
                ),
                "mcpServers": {
                    "qa-11x": {
                        "command": "npx",
                        "args": ["-y", "@sinfallas/mcp-qa-11x@3.3.0", "--stdio"],
                    }
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (plugin_dir / "marketplace.json").write_text(
        json.dumps(
            {
                "name": "tecno-consultores-qa-11x",
                "plugins": [
                    {
                        "name": "qa-11x",
                        "version": "3.3.0",
                        "description": (
                            "Enterprise QA & DevSecOps Standard (QA-11X v3.3): "
                            "11 Modular Skills"
                        ),
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    targets = {".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"}
    ver_rules = tuple(r for r in mod.VERSION_RULES if r.rel_path in targets)
    ed_rules = tuple(r for r in mod.EDITION_RULES if r.rel_path in targets)
    assert len(ver_rules) == 2 and len(ed_rules) == 2
    assert mod.run_rules(tmp_path, ver_rules, "3.5.0", True) == ([], 2)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.5", True) == ([], 2)
    assert mod.run_rules(tmp_path, ver_rules, "3.5.0", False) == ([], 0)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.5", False) == ([], 0)
    assert "@sinfallas/mcp-qa-11x@3.5.0" in (plugin_dir / "plugin.json").read_text(
        encoding="utf-8"
    )


def test_atomic_write_cleans_tmp_on_replace_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifica limpieza de .tmp cuando os.replace falla en bump_version_11x."""
    mod = _load_mod()

    def _boom(_src: object, _dst: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(mod.os, "replace", _boom)
    with pytest.raises(OSError, match="disk full"):
        mod._atomic_write_text(tmp_path / "file.txt", "hello")
    assert list(tmp_path.glob("*.tmp")) == []


def test_mcp_readme_agent_card_comma_version_drift_detected_and_synced(
    tmp_path: Path,
) -> None:
    """Detecta y sincroniza versiones con coma junto a agentCard.ts en READMEs."""
    mod = _load_mod()
    mcp_dir = tmp_path / "mcp-server"
    mcp_dir.mkdir(parents=True)
    (mcp_dir / "README.md").write_text(
        "implemented in [`src/a2a/agentCard.ts`]"
        "(https://example.com/agentCard.ts), `v3.2.0`)\n",
        encoding="utf-8",
    )
    (mcp_dir / "README.es.md").write_text(
        "implementado en [`src/a2a/agentCard.ts`]"
        "(https://example.com/agentCard.ts), `v3.2.0`)\n",
        encoding="utf-8",
    )
    rules = tuple(
        r
        for r in mod.VERSION_RULES
        if r.rel_path in {"mcp-server/README.md", "mcp-server/README.es.md"}
    )
    assert len(rules) == 2
    errs, _ = mod.run_rules(tmp_path, rules, "3.5.0", False)
    assert len(errs) == 2
    assert mod.run_rules(tmp_path, rules, "3.5.0", True) == ([], 2)
    assert mod.run_rules(tmp_path, rules, "3.5.0", False) == ([], 0)
    assert "`v3.5.0`" in (mcp_dir / "README.md").read_text(encoding="utf-8")
    assert "`v3.5.0`" in (mcp_dir / "README.es.md").read_text(encoding="utf-8")


def test_atomic_write_text_preserves_existing_executable_mode(tmp_path: Path) -> None:
    """Preserva el bit ejecutable (0o755) al reescribir scripts existentes."""
    mod = _load_mod()
    script = tmp_path / "run.sh"
    script.write_text("#!/usr/bin/env bash\necho old\n", encoding="utf-8")
    script.chmod(0o755)

    mod._atomic_write_text(script, "#!/usr/bin/env bash\necho new\n")
    assert (script.stat().st_mode & 0o777) == 0o755

    explicit = tmp_path / "secret.txt"
    mod._atomic_write_text(explicit, "token", mode=0o600)
    assert (explicit.stat().st_mode & 0o777) == 0o600


def test_server_json_version_rule_syncs_root_and_package_versions(
    tmp_path: Path,
) -> None:
    """Sincroniza ambas claves version (raíz y packages[0]) en server.json."""
    mod = _load_mod()
    server_json = tmp_path / "server.json"
    server_json.write_text(
        json.dumps(
            {
                "name": "io.github.tecno-consultores/mcp-qa-11x",
                "version": "3.8.0",
                "packages": [
                    {
                        "registryType": "npm",
                        "identifier": "@sinfallas/mcp-qa-11x",
                        "version": "3.8.0",
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    rules = tuple(r for r in mod.VERSION_RULES if r.rel_path == "server.json")
    assert len(rules) == 1
    errs, _ = mod.run_rules(tmp_path, rules, "3.10.0", False)
    assert len(errs) == 2
    assert mod.run_rules(tmp_path, rules, "3.10.0", True) == ([], 1)
    assert mod.run_rules(tmp_path, rules, "3.10.0", False) == ([], 0)
    synced = json.loads(server_json.read_text(encoding="utf-8"))
    assert synced["version"] == "3.10.0"
    assert synced["packages"][0]["version"] == "3.10.0"


def test_example_manifests_and_mcp_readme_edition_headers_sync(tmp_path: Path) -> None:
    """Sincroniza manifiestos .example y encabezados — QA-11X vX.Y)."""
    mod = _load_mod()
    for stack in ("vue3", "react-frontend", "node-backend", "mobile-appium"):
        d = tmp_path / stack
        d.mkdir(parents=True)
        (d / "package.json.example").write_text(
            json.dumps({"name": f"{stack}-bp", "version": "3.8.0"}, indent=2) + "\n",
            encoding="utf-8",
        )
    for py_stack in ("fastapi", "python"):
        d = tmp_path / py_stack
        d.mkdir(parents=True)
        (d / "pyproject.toml.example").write_text(
            f'[project]\nname = "{py_stack}-bp"\nversion = "0.2.0"\n',
            encoding="utf-8",
        )
    mcp_dir = tmp_path / "mcp-server"
    mcp_dir.mkdir(parents=True)
    (mcp_dir / "README.md").write_text(
        "QA Testing Blueprints (QA-11X v3.8 — v3.8.0)\n"
        "## 🛠️ MCP Tools (19 Tools — QA-11X v3.8)\n"
        "## 📚 MCP Resources (13 Resources — QA-11X v3.8)\n",
        encoding="utf-8",
    )
    (mcp_dir / "README.es.md").write_text(
        "QA Testing Blueprints (QA-11X v3.8 — v3.8.0)\n"
        "## 🛠️ Herramientas (19 herramientas — QA-11X v3.8)\n"
        "## 📚 Recursos (13 recursos — QA-11X v3.8)\n",
        encoding="utf-8",
    )

    ex_targets = {
        "vue3/package.json.example",
        "react-frontend/package.json.example",
        "node-backend/package.json.example",
        "mobile-appium/package.json.example",
        "fastapi/pyproject.toml.example",
        "python/pyproject.toml.example",
    }
    ex_rules = tuple(r for r in mod.VERSION_RULES if r.rel_path in ex_targets)
    assert len(ex_rules) == 6
    errs, _ = mod.run_rules(tmp_path, ex_rules, "3.9.0", False)
    assert len(errs) == 6
    assert mod.run_rules(tmp_path, ex_rules, "3.9.0", True) == ([], 6)
    assert mod.run_rules(tmp_path, ex_rules, "3.9.0", False) == ([], 0)

    ed_rules = tuple(
        r
        for r in mod.EDITION_RULES
        if r.rel_path in {"mcp-server/README.md", "mcp-server/README.es.md"}
    )
    e_errs, _ = mod.run_rules(tmp_path, ed_rules, "QA-11X v3.9", False)
    assert len(e_errs) == 6
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.9", True) == ([], 2)
    assert mod.run_rules(tmp_path, ed_rules, "QA-11X v3.9", False) == ([], 0)
