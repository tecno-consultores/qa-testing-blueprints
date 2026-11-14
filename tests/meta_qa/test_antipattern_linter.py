# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Suite Meta-QA para lint_test_antipatterns.py (QA-UI-ANTI-001..005)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

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
