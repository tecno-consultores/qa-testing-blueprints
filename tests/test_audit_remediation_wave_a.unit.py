# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias de remediación QA 11X (Wave A + Meta-QA docs/04 + _common)."""

# qa-leak-guard-ok

from __future__ import annotations

import ast
import importlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = str(REPO_ROOT / ".agents" / "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

_PYTHON_FENCE_RE = re.compile(
    r"^```(?:python|py)\s*\n(.*?)^```\s*$", re.MULTILINE | re.DOTALL
)


def _import_script(name: str) -> Any:
    return importlib.import_module(name)


class TestWaveACommonAndGuards(unittest.TestCase):
    """Valida _common.py, _budgets.py y guardias de fugas y paridad CLI."""

    def test_common_redaction_json_atomic_and_git_cmd(self) -> None:
        common = _import_script("_common")
        raw_secret = "Bearer " + "super_secret_value_123456"
        slack_tok = "xoxb-" + "1234567890abcdef"
        gl_tok = "glpat-" + "abcdefghijklmnop"
        redacted = common.redact_secrets(f"{raw_secret} {slack_tok} {gl_tok}")
        self.assertNotIn("super_secret_value_123456", redacted)
        self.assertNotIn("1234567890abcdef", redacted)
        self.assertNotIn("abcdefghijklmnop", redacted)

        with self.assertRaises(ValueError):
            common.parse_json_no_duplicate_keys('{"a": 1, "a": 2}', context="dup.json")

        with tempfile.TemporaryDirectory(prefix="qa11x_common_") as tmp:
            root = Path(tmp)
            target = root / "nested" / "data.json"
            common.atomic_write_json(target, {"ok": True}, mode=0o600)
            loaded = common.load_json_no_duplicate_keys(target)
            self.assertEqual(loaded, {"ok": True})
            cmd = common.build_git_command(root, "status", "--porcelain")
            self.assertIn("safe.directory=*", " ".join(cmd))
            self.assertEqual(cmd[-2:], ["status", "--porcelain"])

    def test_rules_total_and_global_connector_budgets_enforced(self) -> None:
        budgets = _import_script("_budgets")
        invariants = _import_script("verify_docs_invariants")
        self.assertEqual(budgets.RULES_TOTAL_MAX_BYTES, 36_864)
        self.assertEqual(budgets.GLOBAL_CONNECTOR_MAX_BYTES, 1_536)

        with tempfile.TemporaryDirectory(prefix="qa11x_rules_budget_") as tmp:
            ws = Path(tmp)
            rules_dir = ws / ".agents" / "rules"
            rules_dir.mkdir(parents=True)
            (rules_dir / "oversized_rule.md").write_text(
                "x" * (budgets.RULES_TOTAL_MAX_BYTES + 256), encoding="utf-8"
            )
            errs = invariants.check_cognitive_budgets(ws)
            self.assertTrue(
                any("RULES_TOTAL_MAX_BYTES" in e or "rules" in e for e in errs)
            )

    def test_private_consumer_leak_guard_detects_and_exempts(self) -> None:
        catalogs = _import_script("_docs_invariants_catalogs")
        self.assertEqual(catalogs.check_no_private_consumer_leaks(REPO_ROOT), [])

        with tempfile.TemporaryDirectory(prefix="qa11x_leak_") as tmp:
            ws = Path(tmp)
            (ws / "docs").mkdir()
            bad_token = "ros" + "grid"
            (ws / "docs" / "sample.md").write_text(
                f"Legacy mention of {bad_token} router\n", encoding="utf-8"
            )
            (ws / "CHANGELOG.md").write_text(
                f"Historical {bad_token} entry\n", encoding="utf-8"
            )
            leaks = catalogs.check_no_private_consumer_leaks(ws)
            self.assertEqual(len(leaks), 1)
            self.assertIn("docs/sample.md:1", leaks[0])

    def test_mcp_release_and_cli_parity_detects_drift(self) -> None:
        catalogs = _import_script("_docs_invariants_catalogs")
        self.assertEqual(catalogs.check_mcp_release_and_cli_parity(REPO_ROOT), [])

        with tempfile.TemporaryDirectory(prefix="qa11x_parity_") as tmp:
            ws = Path(tmp)
            (ws / "mcp-server" / "src" / "cli").mkdir(parents=True)
            (ws / "mcp-server" / "package.json").write_text(
                '{"version": "9.9.9"}\n', encoding="utf-8"
            )
            (ws / "mcp-server" / "CHANGELOG.md").write_text(
                "# Changelog\n## [1.0.0]\n", encoding="utf-8"
            )
            (ws / "mcp-server" / "src" / "cli" / "commandCatalog.ts").write_text(
                "export const X = [{ name: 'missing-cmd' }];\n", encoding="utf-8"
            )
            (ws / "mcp-server" / "README.md").write_text("# MCP\n", encoding="utf-8")
            errs = catalogs.check_mcp_release_and_cli_parity(ws)
            self.assertTrue(any("## [9.9.9]" in e for e in errs))
            self.assertTrue(any("missing-cmd" in e for e in errs))


class TestOrphanApiAndExtractedGates(unittest.TestCase):
    """Valida verify_no_orphan_api_endpoints.py y scripts extraídos de Makefile."""

    def test_verify_no_orphan_api_endpoints_parsers_and_clean_whitelist(self) -> None:
        mod = _import_script("verify_no_orphan_api_endpoints")
        self.assertNotIn(("GET", "/api/v1/metrics/fleet"), mod.ARCHITECTURAL_WHITELIST)

        with tempfile.TemporaryDirectory(prefix="qa11x_api_") as tmp:
            ws = Path(tmp)
            (ws / "backend" / "src" / "api" / "v1").mkdir(parents=True)
            (ws / "frontend" / "src" / "services").mkdir(parents=True)

            (ws / "backend" / "src" / "main.py").write_text(
                "from fastapi import FastAPI\n"
                "from .api.v1 import items\n"
                "app = FastAPI()\n"
                "# app.include_router(ghost.router, prefix='/api/v1/ghost')\n"
                "app.include_router(items.router, prefix='/api/v1')\n"
                "@app.get('/api/health')\n"
                "async def health(): ...\n",
                encoding="utf-8",
            )
            (ws / "backend" / "src" / "api" / "v1" / "items.py").write_text(
                "from fastapi import APIRouter\n"
                "router = APIRouter(prefix='/items')\n"
                "@router.get('/{item_id:int}/tenants/{tenant_id:uuid}')\n"
                "async def get_item(): ...\n",
                encoding="utf-8",
            )
            (ws / "backend" / "src" / "fastify_routes.ts").write_text(
                "fastify.post('/api/v1/jobs', async () => ({}));\n",
                encoding="utf-8",
            )
            (ws / "frontend" / "src" / "services" / "client.ts").write_text(
                "api.get<Paginated<Array<Item>>>(`/api/v1/items/${id}/tenants/${tid}`);\n"
                "api.get('/api/health');\n"
                "api.post('/api/v1/jobs');\n",
                encoding="utf-8",
            )
            rc = mod.main(ws, exit_skipped_code=2)
            self.assertEqual(rc, 0)

    def test_extracted_lint_workflows_and_lint_docs_gate_pass_on_repo(self) -> None:
        lw = _import_script("lint_workflows")
        ld = _import_script("lint_docs_gate")
        self.assertEqual(lw.main(["--workspace", str(REPO_ROOT)]), 0)
        self.assertEqual(ld.main(["--workspace", str(REPO_ROOT)]), 0)

        with tempfile.TemporaryDirectory(prefix="qa11x_gates_neg_") as tmp:
            ws = Path(tmp)
            (ws / ".github" / "workflows").mkdir(parents=True)
            (ws / "sub").mkdir()
            synth_ghp = "ghp_" + "1234567890abcdef123456"
            (ws / ".github" / "workflows" / "bad.yml").write_text(
                "name: Bad\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n"
                "    steps:\n      - uses: actions/checkout@v4\n"
                "      - run: echo $${BAD_ESC}\n"
                f"      - run: export TOKEN={synth_ghp}\n",
                encoding="utf-8",
            )
            (ws / ".github" / "workflows" / "dup.yml").write_text(
                "a: 1\na: 2\n", encoding="utf-8"
            )
            (ws / ".github" / "workflows" / "list.yml").write_text(
                "- just-a-list\n", encoding="utf-8"
            )
            (ws / "sub" / "Makefile").write_text(
                "all:\n\techo $(PWD)\n", encoding="utf-8"
            )
            self.assertEqual(lw.main(["--workspace", str(ws)]), 1)

            (ws / ".agents" / "scripts").mkdir(parents=True)
            (ws / ".agents" / "scripts" / "verify_docs_invariants.py").write_text(
                "import sys; sys.exit(1)\n", encoding="utf-8"
            )
            (ws / ".agents" / "scripts" / "verify_roadmap_consistency.py").write_text(
                "import sys; sys.exit(0)\n", encoding="utf-8"
            )
            (ws / "AGENTS.md").write_text(
                "Always commit and push to git!\n", encoding="utf-8"
            )
            self.assertEqual(ld.main(["--workspace", str(ws)]), 1)

    def test_sync_governance_rules_and_connector_budgets_reject_bloat(self) -> None:
        sg = _import_script("sync_governance")
        budgets = _import_script("_budgets")
        with tempfile.TemporaryDirectory(prefix="qa11x_sg_budget_") as tmp:
            ws = Path(tmp)
            (ws / ".agents" / "rules").mkdir(parents=True)
            (ws / "scripts").mkdir(parents=True)
            (ws / ".agents" / "rules" / "huge.md").write_text(
                "a" * (budgets.RULES_TOTAL_MAX_BYTES + 100), encoding="utf-8"
            )
            oversized = "b" * (budgets.GLOBAL_CONNECTOR_MAX_BYTES + 100)
            (ws / "scripts" / "install-skill.sh").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_START -->\n"
                f"{oversized}\n"
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n",
                encoding="utf-8",
            )
            errs = sg.validate_cognitive_budgets(ws)
            self.assertTrue(any(".agents/rules/*.md" in e for e in errs))
            self.assertTrue(any("install-skill.sh" in e for e in errs))

    def test_orphan_api_generics_edge_cases_and_v1_prefix(self) -> None:
        mod = _import_script("verify_no_orphan_api_endpoints")
        sample = " <Record<'a\\'>b', (x: number) => string>>('/api/v1/x')"
        end_idx = mod._skip_balanced_generics(sample, 0)
        self.assertIsNotNone(end_idx)
        assert end_idx is not None
        self.assertTrue(sample[end_idx:].startswith("('/api/v1/x')"))
        self.assertIsNone(mod._skip_balanced_generics("<Unclosed<T>", 0))
        self.assertEqual(
            mod._build_full_route_path("/v1", "/users", ("api", "v1")),
            "/api/v1/users",
        )

    def test_normalize_kcov_cobertura_normalizes_xml_and_blocks_xxe(self) -> None:
        norm = _import_script("normalize_kcov_cobertura")
        with self.assertRaises(ValueError):
            norm._parse_xml_safely("<!ENTITY xxe SYSTEM 'file:///etc/passwd'><a/>")
        with tempfile.TemporaryDirectory(prefix="qa11x_kcov_") as tmp:
            root = Path(tmp)
            self.assertEqual(
                norm.normalize_kcov_reports(root, root, root / "missing.xml"), 1
            )
            (root / "scripts").mkdir()
            (root / "scripts" / "demo.sh").write_text(
                "#!/usr/bin/env bash\necho ok\n", encoding="utf-8"
            )
            kcov_dir = root / "kcov" / "kcov-merged"
            kcov_dir.mkdir(parents=True)
            (kcov_dir / "cobertura.xml").write_text(
                '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/'
                'xml/coverage-04.dtd">\n'
                '<coverage line-rate="0.5"><packages><package name="sh"><classes>'
                '<class name="demo_sh" filename="/tmp/work/scripts/demo.sh" '
                'line-rate="1.0">'
                '<lines><line number="2" hits="1"/></lines>'
                "</class></classes></package></packages></coverage>\n",
                encoding="utf-8",
            )
            out_xml = root / "out" / "bash.xml"
            rc = norm.main(
                [
                    "--repo",
                    str(root),
                    "--kcov-dir",
                    str(root / "kcov"),
                    "--output",
                    str(out_xml),
                ]
            )
            self.assertEqual(rc, 0)
            out_txt = out_xml.read_text(encoding="utf-8")
            self.assertNotIn("<!DOCTYPE", out_txt)
            self.assertIn('filename="scripts/demo.sh"', out_txt)


class TestDocs04PythonRecipesFidelity(unittest.TestCase):
    """Meta-QA: valida AST y Bandit (0 HIGH/MEDIUM) en recetas Python de docs/04."""

    def test_docs_04_en_and_es_python_recipes_parse_and_pass_bandit(self) -> None:
        bandit_bin = shutil.which("bandit")
        self.assertIsNotNone(bandit_bin, "bandit debe existir en base-python-uv")
        assert bandit_bin is not None

        for rel in (
            "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
            "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
        ):
            doc_path = REPO_ROOT / rel
            text = doc_path.read_text(encoding="utf-8")
            blocks = list(_PYTHON_FENCE_RE.finditer(text))
            self.assertGreaterEqual(len(blocks), 10, f"{rel}: muy pocas recetas Python")

            with tempfile.TemporaryDirectory(prefix="qa11x_docs04_") as tmp:
                tmp_dir = Path(tmp)
                for idx, match in enumerate(blocks, 1):
                    code = match.group(1)
                    line_no = text[: match.start()].count("\n") + 1
                    try:
                        ast.parse(code)
                    except SyntaxError as exc:
                        self.fail(f"{rel}:{line_no} receta #{idx} SyntaxError: {exc}")
                    recipe_file = tmp_dir / f"recipe_{idx:02d}_L{line_no}.py"
                    recipe_file.write_text(code, encoding="utf-8")

                proc = subprocess.run(
                    [bandit_bin, "-q", "-r", "-f", "json", "-ll", str(tmp_dir)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                payload = json.loads(proc.stdout or "{}")
                findings = payload.get("results", [])
                self.assertEqual(
                    findings,
                    [],
                    f"{rel}: Bandit reportó hallazgos HIGH/MEDIUM: {findings}",
                )


if __name__ == "__main__":
    unittest.main()
