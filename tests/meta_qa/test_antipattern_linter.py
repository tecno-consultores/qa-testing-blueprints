# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Suite Meta-QA para lint_test_antipatterns.py (UI-001..005 y PY-001..003)."""

from __future__ import annotations

import ast
import json
import runpy
import subprocess
import sys
from pathlib import Path
from unittest import mock

import lint_test_antipatterns as linter
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
LINTER_SCRIPT = REPO_ROOT / ".agents" / "scripts" / "lint_test_antipatterns.py"


def _write_file(root: Path, rel_path: str, content: str) -> Path:
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


def test_detects_qa_ui_anti_001_arbitrary_waits_and_ignores_valid_code(
    tmp_path: Path,
) -> None:
    _write_file(
        tmp_path,
        "tests/sleepy.spec.ts",
        (
            "// await page.waitForTimeout(999);\n"
            "await page.waitForTimeout(250);\n"
            "cy.wait(500);\n"
            "cy.wait('@getUsers');\n"
            "await new Promise((resolve) => {\n"
            "  setTimeout(resolve, 150);\n"
            "});\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/test_py_sleep.py",
        "# time.sleep(5)\nimport time\ntime.sleep(0)\ntime.sleep(0.25)\n",
    )
    _write_file(
        tmp_path,
        "src/utils/backoff.ts",
        "export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));\n",
    )
    violations, missing, scanned = linter.audit_paths(["."], base_dir=tmp_path)
    assert not missing
    assert scanned == 3
    anti_001 = [v for v in violations if v.rule_id == "QA-UI-ANTI-001"]
    assert len(anti_001) == 4
    assert sorted(v.line for v in anti_001) == [2, 3, 4, 5]


def test_detects_qa_ui_anti_002_fragile_selectors_only_in_specs(
    tmp_path: Path,
) -> None:
    _write_file(
        tmp_path,
        "tests/login.spec.ts",
        (
            "const ok = (a: number, b: number): boolean => a > b;\n"
            "const x = page.locator('//div[@id=\"app\"]');\n"
            "const y = page.locator('xpath=//button');\n"
            "const z = page.locator('ul > li:nth-child(2)');\n"
            "const n = page.locator('main > section > button');\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/adapters/DomLocators.ts",
        "export const row = 'main > section > div:nth-child(1)';\n",
    )
    _write_file(
        tmp_path,
        "tests/clean.spec.ts",
        "const btn = ByRole('button', 'Guardar');\n",
    )
    violations, _, _ = linter.audit_paths(["tests"], base_dir=tmp_path)
    anti_002 = [v for v in violations if v.rule_id == "QA-UI-ANTI-002"]
    assert len(anti_002) == 4
    assert [v.line for v in anti_002] == [2, 3, 4, 5]
    assert all(v.file == "tests/login.spec.ts" for v in anti_002)


def test_detects_qa_ui_anti_003_god_page_objects_and_deep_inheritance(
    tmp_path: Path,
) -> None:
    methods_body = "\n".join(f"  step{i}(): void {{}}" for i in range(50))
    _write_file(
        tmp_path,
        "tests/pages/GodMethodsPage.ts",
        f"export class GodMethodsPage {{\n{methods_body}\n}}\n",
    )
    locators_body = "\n".join(
        f"  field{i}() {{ return this.page.getByRole('textbox'); }}"
        for i in range(100)
    )
    _write_file(
        tmp_path,
        "tests/pages/GodLocatorsPage.ts",
        f"export class GodLocatorsPage {{\n{locators_body}\n}}\n",
    )
    _write_file(
        tmp_path,
        "tests/pages/BasePage.ts",
        "export class BasePage { open(): void {} }\n",
    )
    _write_file(
        tmp_path,
        "tests/pages/TenantPage.ts",
        "export class TenantPage extends BasePage { switchTenant(): void {} }\n",
    )
    _write_file(
        tmp_path,
        "tests/pages/AdminUsersPage.ts",
        "export class AdminUsersPage extends TenantPage { createUser(): void {} }\n",
    )
    _write_file(
        tmp_path,
        "tests/pages/CycleA_Page.ts",
        (
            "export class CycleAPage extends CycleBPage {}\n"
            "export class CycleBPage extends CycleAPage {}\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/pages/py_pages.py",
        (
            "class RootPage():\n"
            "    def open(self) -> None:\n"
            "        pass\n"
            "\n"
            "class MidPage(RootPage):\n"
            "    def nav(self) -> None:\n"
            "        pass\n"
            "\n"
            "class LeafPage(MidPage):\n"
            "    def act(self) -> None:\n"
            "        pass\n"
            "\n"
            "def outside() -> None:\n"
            "    pass\n"
        ),
    )
    violations, _, _ = linter.audit_paths(["tests"], base_dir=tmp_path)
    flagged = {(v.rule_id, Path(v.file).name) for v in violations}
    assert ("QA-UI-ANTI-003", "GodMethodsPage.ts") in flagged
    assert ("QA-UI-ANTI-003", "GodLocatorsPage.ts") in flagged
    assert ("QA-UI-ANTI-003", "AdminUsersPage.ts") in flagged
    assert ("QA-UI-ANTI-003", "py_pages.py") in flagged
    assert ("QA-UI-ANTI-003", "TenantPage.ts") not in flagged


def test_detects_qa_ui_anti_004_hidden_assertions_and_allows_specs(
    tmp_path: Path,
) -> None:
    _write_file(
        tmp_path,
        "tests/screenplay/ApproveOrderTask.ts",
        (
            "export async function approve() {\n"
            "  expect(true).toBe(true);\n"
            "}\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/pages/OrderPage.ts",
        "export class OrderPage { submit() { assert.equal(1, 1); } }\n",
    )
    _write_file(
        tmp_path,
        "tests/screenplay/order.spec.ts",
        "expect(1).toBe(1);\n",
    )
    _write_file(
        tmp_path,
        "src/pages/Dashboard.tsx",
        "export const Dashboard = () => 'ok';\n",
    )
    violations, _, _ = linter.audit_paths(["."], base_dir=tmp_path)
    anti_004 = [v for v in violations if v.rule_id == "QA-UI-ANTI-004"]
    assert len(anti_004) == 2
    assert {v.file for v in anti_004} == {
        "tests/screenplay/ApproveOrderTask.ts",
        "tests/pages/OrderPage.ts",
    }


def test_detects_qa_ui_anti_005_jsdom_geometry_and_allows_real_browser(
    tmp_path: Path,
) -> None:
    _write_file(
        tmp_path,
        "tests/layout.unit.ts",
        (
            "// @vitest-environment jsdom\n"
            "const rect = document.body.getBoundingClientRect();\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/box.test.ts",
        "const cfg = { environment: 'jsdom' };\nconst w = el.offsetWidth;\n",
    )
    _write_file(
        tmp_path,
        "e2e/layout.e2e.ts",
        "const rect = document.body.getBoundingClientRect();\n",
    )
    violations, _, _ = linter.audit_paths(["."], base_dir=tmp_path)
    anti_005 = [v for v in violations if v.rule_id == "QA-UI-ANTI-005"]
    assert len(anti_005) == 2
    assert {v.file for v in anti_005} == {
        "tests/layout.unit.ts",
        "tests/box.test.ts",
    }


def test_cli_json_missing_paths_ignored_dirs_and_pass_quiet(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _write_file(
        tmp_path,
        "node_modules/bad.spec.ts",
        "await page.waitForTimeout(500);\n",
    )
    _write_file(tmp_path, "vue3/vitest.config.ts.example", "waitForTimeout(1);\n")
    clean_file = _write_file(
        tmp_path, "vue3/tests/screenplay/Actor.ts", "export const ok = 1;\n"
    )
    outside_file = _write_file(
        tmp_path / "external", "outside.spec.ts", "await page.waitForTimeout(10);\n"
    )

    rc_pass = linter.main([str(clean_file)], base_dir=tmp_path)
    assert rc_pass == 0
    assert "0 antipatrones detectados en 1 archivo(s)" in capsys.readouterr().out

    rc_json_pass = linter.main(["--json", "vue3"], base_dir=tmp_path)
    assert rc_json_pass == 0
    parsed_pass = json.loads(capsys.readouterr().out)
    assert parsed_pass["status"] == "passed"
    assert parsed_pass["scanned_files"] == 1

    rc_missing = linter.main(
        ["no-existe", str(outside_file)], base_dir=tmp_path / "sub"
    )
    assert rc_missing == 1
    err_out = capsys.readouterr().err
    assert "Ruta inexistente: no-existe" in err_out
    assert "QA-UI-ANTI-001" in err_out

    rc_json_fail = linter.main(["--json", "no-existe"], base_dir=tmp_path)
    assert rc_json_fail == 1
    parsed_fail = json.loads(capsys.readouterr().out)
    assert parsed_fail["status"] == "failed"
    assert parsed_fail["missing_paths"] == ["no-existe"]


def test_real_repo_vue3_and_react_frontend_pass_cleanly() -> None:
    proc = subprocess.run(
        [sys.executable, str(LINTER_SCRIPT), "vue3", "react-frontend", "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["status"] == "passed"
    assert payload["violations"] == []
    assert payload["scanned_files"] >= 4


def test_f10_8_hardening_comments_braces_in_strings_bom_and_null_bytes(
    tmp_path: Path,
) -> None:
    # 1. Comentario bloque en línea NO debe ocultar waitForTimeout posterior;
    #    comentario multilínea /* ... */ sin '*' SÍ debe ignorarse
    _write_file(
        tmp_path,
        "tests/comments.spec.ts",
        (
            "/* safe */\n"
            "/*\n"
            "await page.waitForTimeout(999);\n"
            "*/\n"
            "/* inline */ await page.waitForTimeout(250);\n"
        ),
    )
    # 2. Llaves dentro de strings en Page Object no truncan el conteo de métodos
    methods = "\n".join(
        f'  step{i}(): string {{ return "}}"; }}' for i in range(50)
    )
    _write_file(
        tmp_path,
        "tests/pages/BracesStringPage.TS",
        f"export class BracesStringPage {{\n{methods}\n}}\n",
    )
    # 3. Comentario con getBoundingClientRect en JSDOM ignorado; llamada real sí falla
    jsdom_content = (
        "\ufeff// @vitest-environment jsdom\n"
        "// Avoid getBoundingClientRect() here\n"
        "const w = document.body.offsetWidth;\n"
    )
    (tmp_path / "tests" / "geom.unit.ts").write_bytes(
        jsdom_content.encode("utf-8")
    )

    violations, missing, scanned = linter.audit_paths(
        ["tests", "bad\0path.ts"], base_dir=tmp_path
    )
    assert missing == ["bad\0path.ts"]
    assert scanned == 3
    anti_001 = [v for v in violations if v.rule_id == "QA-UI-ANTI-001"]
    assert [v.line for v in anti_001] == [5]
    anti_003 = [v for v in violations if v.rule_id == "QA-UI-ANTI-003"]
    assert len(anti_003) == 1
    assert anti_003[0].file == "tests/pages/BracesStringPage.TS"
    anti_005 = [v for v in violations if v.rule_id == "QA-UI-ANTI-005"]
    assert [v.line for v in anti_005] == [3]

    unclosed = "export class UnclosedPage { step1() {"
    assert linter._find_ts_class_end(unclosed, unclosed.index("{")) == len(unclosed)


def test_detects_qa_py_anti_001_002_003_and_exemptions(tmp_path: Path) -> None:
    """Valida detección AST Python QA-PY-ANTI-001..003 y exenciones."""
    uid_v4 = "550e8400-e29b-41d4-a716-446655440000"
    _write_file(
        tmp_path,
        "tests/test_py_bad.py",
        (
            "from unittest import mock\n"
            "def test_blind_patch() -> None:\n"
            '    with mock.patch("svc.write_audit_log", new_callable=mock.AsyncMock):\n'
            "        pass\n"
            "def test_blind_assign() -> None:\n"
            "    svc.write_audit_log = mock.MagicMock()\n"
            "def test_uuid_fields() -> None:\n"
            f'    d = {{"actor_username": "{uid_v4}"}}\n'
            f'    Audit(resource_display_name="{uid_v4}")\n'
            f'    d["actor_username"] = "{uid_v4}"\n'
            f'    obj.resource_display_name = "{uid_v4}"\n'
            f'    actor_username: str = "{uid_v4}"\n'
            "def verify_gate(skip: bool) -> object:\n"
            "    try:\n"
            "        if skip:\n"
            '            return "PASSED"\n'
            "    except RuntimeError:\n"
            "        return True\n"
            "    return False\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/test_py_good.py",
        (
            "from unittest import mock\n"
            "def test_asserted_patch() -> None:\n"
            '    with mock.patch("svc.write_audit_log", mock.AsyncMock()) as m:\n'
            "        m.assert_awaited_once()\n"
            "def test_passthrough_and_exempt() -> None:\n"
            '    with mock.patch("svc.write_audit_log", wraps=lambda x: x):\n'
            "        pass\n"
            "    # qa-py-anti-ok\n"
            f'    d = {{"actor_username": "{uid_v4}"}}\n'
            f'    ok = {{"actor_username": "ana.perez", '
            f'"resource_display_name": "router-core-01"}}\n'
            "def check_gate_clean(skip: bool) -> str:\n"
            "    try:\n"
            "        if skip:\n"
            '            return "SKIPPED"\n'
            "    except RuntimeError:\n"
            '        return "FAILED"\n'
            '    return "OK"\n'
            "def helper_fn() -> bool:\n"
            "    try:\n"
            "        return False\n"
            "    except ValueError:\n"
            "        return True\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/test_top_exempt.py",
        (
            "# qa-py-anti-ok\n"
            f'actor_username = "{uid_v4}"\n'
        ),
    )
    _write_file(tmp_path, "tests/test_broken_syntax.py", "def bad(:\n")
    _write_file(
        tmp_path,
        "src/audit.py",
        f'actor_username = "{uid_v4}"\n',
    )

    violations, _, _ = linter.audit_paths(["."], base_dir=tmp_path)
    by_rule = {v.rule_id for v in violations}
    assert {"QA-PY-ANTI-001", "QA-PY-ANTI-002", "QA-PY-ANTI-003"}.issubset(by_rule)
    assert all(v.file == "tests/test_py_bad.py" for v in violations)
    assert sum(1 for v in violations if v.rule_id == "QA-PY-ANTI-001") == 2
    assert sum(1 for v in violations if v.rule_id == "QA-PY-ANTI-002") == 5
    assert sum(1 for v in violations if v.rule_id == "QA-PY-ANTI-003") == 2
    assert linter._call_leaf_name(
        ast.Constant(value="x")
    ) == ""
    assert not linter._assign_targets_audit([ast.Constant(value="x")])
    assert not linter._expr_mentions_write_audit(ast.List(elts=[]))
    assert not linter._expr_uses_mock_ctor(ast.Constant(value=1))
    assert linter._target_audit_field_name(ast.Constant(value=1)) is None


def test_cli_autodetect_skipped_and_entrypoint(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Valida autodetección sin argumentos, modo SKIPPED y __main__."""
    empty_ws = tmp_path / "empty_ws"
    empty_ws.mkdir()
    assert linter.main([], base_dir=empty_ws) == 0
    assert "SKIPPED" in capsys.readouterr().out

    assert linter.main(["--json"], base_dir=empty_ws) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "skipped"

    pop_ws = tmp_path / "pop_ws"
    _write_file(pop_ws, "tests/test_ok.py", "def test_ok() -> None:\n    assert 1\n")
    assert linter.main([], base_dir=pop_ws) == 0
    assert "0 antipatrones detectados en 1 archivo(s)" in capsys.readouterr().out

    with (
        mock.patch.object(sys, "argv", [str(LINTER_SCRIPT), str(pop_ws / "tests")]),
        pytest.raises(SystemExit) as exc,
    ):
        runpy.run_path(str(LINTER_SCRIPT), run_name="__main__")
    assert exc.value.code == 0
    capsys.readouterr()


def test_py_ast_antipattern_edge_branches_and_meta_qa_scope(tmp_path: Path) -> None:
    """Cubre variantes Name/Attribute/inline-exempt/no-audit y exclusión meta_qa."""
    uid_v4 = "550e8400-e29b-41d4-a716-446655440000"
    _write_file(
        tmp_path,
        "tests/test_py_edges.py",
        (
            f'actor_username = "{uid_v4}"\n'
            "# filler 2\n# filler 3\n# filler 4\n# filler 5\n"
            f'Audit(resource_display_name="{uid_v4}")  # qa-py-anti-ok\n'
            "def test_variants() -> None:\n"
            '    with mock.patch("svc.other_fn", new=mock.AsyncMock()):\n'
            "        pass\n"
            "    with mock.patch(write_audit_log, new=AsyncMock):\n"
            "        pass\n"
            "    with mock.patch(svc.write_audit_log, new=mock.AsyncMock()):\n"
            "        pass\n"
            '    with mock.patch("svc.write_audit_log", new=mock.AsyncMock()):  '
            "# qa-py-anti-ok\n"
            "        pass\n"
            '    with mock.patch("svc.write_audit_log", wraps=custom_wrap):\n'
            "        pass\n"
            "    write_audit_log = mock.MagicMock()\n"
            "def test_unrelated_mock_assertion_does_not_mask_blind_audit() -> None:\n"
            "    other_mock = mock.MagicMock()\n"
            "    other_mock.assert_called_once()\n"
            '    with mock.patch("svc.write_audit_log", mock.AsyncMock()):\n'
            "        pass\n"
            '    patched = mock.patch("svc.write_audit_log", mock.MagicMock())\n'
            "@other_deco\n"
            '@mock.patch("svc.other_fn")\n'
            '@mock.patch("svc.write_audit_log")\n'
            "def test_decorator_audit_patch(audit_arg: object) -> None:\n"
            "    _ = audit_arg\n"
            "def test_attr_receiver_ok() -> None:\n"
            '    with mock.patch("svc.write_audit_log"):\n'
            "        assert svc.write_audit_log.call_args is not None\n"
        ),
    )
    _write_file(
        tmp_path,
        "gates/verify_fake_gate.py",
        (
            "def verify_deploy_gate() -> bool:\n"
            "    try:\n"
            "        return False\n"
            "    except OSError:\n"
            "        return True\n"
        ),
    )
    _write_file(
        tmp_path,
        "tests/meta_qa/test_sample.py",
        "import time\ndef test_m() -> None:\n    time.sleep(0.1)\n",
    )

    violations, _, _ = linter.audit_paths(["tests", "gates"], base_dir=tmp_path)
    py_001 = [v for v in violations if v.rule_id == "QA-PY-ANTI-001"]
    py_002 = [v for v in violations if v.rule_id == "QA-PY-ANTI-002"]
    py_003 = [v for v in violations if v.rule_id == "QA-PY-ANTI-003"]
    ui_001 = [v for v in violations if v.rule_id == "QA-UI-ANTI-001"]
    assert [v.line for v in py_001] == [10, 12, 18, 22, 24, 27]
    assert [v.line for v in py_002] == [1]
    assert any(v.file == "gates/verify_fake_gate.py" for v in py_003)
    assert ui_001 == []
    assert not linter._expr_mentions_write_audit(ast.Name(id="other"))
    assert not linter._expr_mentions_write_audit(
        ast.Attribute(value=ast.Name(id="svc"), attr="other")
    )
    tree_ok = ast.parse("m.assert_called_once()\n")
    assert linter._has_audit_mock_assertion(tree_ok) is True
    assert linter._has_audit_mock_assertion(tree_ok, expected_targets={"m"}) is True
    assert linter._has_audit_mock_assertion(tree_ok, expected_targets={"x"}) is False


def test_py_ast_patch_object_call_receiver_and_nested_patch(tmp_path: Path) -> None:
    """Cubre args[2] de patch.object, receptor Call y patch anidado (EnterStack)."""
    _write_file(
        tmp_path,
        "tests/test_py_nested.py",
        (
            "from contextlib import ExitStack\n"
            "from unittest import mock\n"
            "def test_patch_object_unasserted() -> None:\n"
            "    my_bad_mock = mock.AsyncMock()\n"
            '    with mock.patch.object(svc, "write_audit_log", my_bad_mock):\n'
            "        get_mock().assert_called_once()\n"
            "def test_patch_object_asserted() -> None:\n"
            "    my_ok_mock = mock.AsyncMock()\n"
            '    with mock.patch.object(svc, "write_audit_log", my_ok_mock):\n'
            "        my_ok_mock.assert_called_once()\n"
            "def test_exit_stack_nested_patch() -> None:\n"
            "    with ExitStack() as stack:\n"
            '        stack.enter_context(mock.patch("svc.write_audit_log"))\n'
        ),
    )

    violations, _, _ = linter.audit_paths(["tests"], base_dir=tmp_path)
    py_001 = [v for v in violations if v.rule_id == "QA-PY-ANTI-001"]
    assert [v.line for v in py_001] == [5, 13]


def test_autodetect_scans_governance_scripts_and_vibe_rescue(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Valida autodetección 0-args de .agents/scripts, scripts y vibe-rescue."""
    _write_file(
        tmp_path,
        ".agents/scripts/verify_fake.py",
        (
            "def verify_fake_gate() -> bool:\n"
            "    try:\n"
            "        return False\n"
            "    except OSError:\n"
            "        return True\n"
        ),
    )
    _write_file(
        tmp_path,
        "scripts/audit_helper.py",
        "def verify_ok() -> bool:\n    return True\n",
    )
    _write_file(
        tmp_path,
        "vibe-rescue/audit_vibe.py",
        "def audit_vibe() -> bool:\n    return False\n",
    )

    detected, auto_mode = linter._resolve_cli_paths([], tmp_path)
    assert auto_mode is True
    assert detected == ["vibe-rescue", ".agents/scripts", "scripts"]

    assert linter.main([], base_dir=tmp_path) == 1
    err_text = capsys.readouterr().err
    assert "QA-PY-ANTI-003" in err_text
    assert ".agents/scripts/verify_fake.py" in err_text

    assert linter.main(["--json"], base_dir=tmp_path) == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "failed"
    assert payload["scanned_files"] == 3
    assert len(payload["violations"]) == 1
    assert payload["violations"][0]["rule_id"] == "QA-PY-ANTI-003"
    assert payload["violations"][0]["file"] == ".agents/scripts/verify_fake.py"


def test_autodetect_includes_backend_and_mcp_dirs_and_avoids_false_positives(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Incluye mcp-server/ai-evals/stacks en auto-detección sin falsos positivos."""
    for d in ("mcp-server/tests", "ai-evals", "fastapi", "python", "node-backend"):
        (tmp_path / d).mkdir(parents=True)
    detected, auto_mode = linter._resolve_cli_paths([], tmp_path)
    assert auto_mode is True
    assert set(detected) == {
        "mcp-server",
        "ai-evals",
        "fastapi",
        "python",
        "node-backend",
    }

    (tmp_path / "mcp-server" / "tests" / "safe_rules.unit.ts").write_text(
        "import { describe, it, expect } from 'vitest';\n"
        "describe('regression guards', () => {\n"
        "  it('orders CRITICAL > HIGH > MEDIUM > LOW and A->B->A safely', () => {\n"
        "    const fixture = 'await page.waitForTimeout(1000);';\n"
        "    expect(fixture).toContain('waitForTimeout');\n"
        "  });\n"
        "});\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    rc = linter.main(["mcp-server/tests/safe_rules.unit.ts"], base_dir=tmp_path)
    assert rc == 0
