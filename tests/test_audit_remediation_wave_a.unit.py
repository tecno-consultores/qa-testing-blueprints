# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias de remediación QA 11X (Wave A + Meta-QA docs/04 + _common)."""

# qa-leak-guard-ok

from __future__ import annotations

import ast
import importlib
import importlib.util
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from unittest import mock

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
                "export const X = [{ name: 'missing-cmd', "
                "flags: [{ long: '--missing-flag' }] }];\n",
                encoding="utf-8",
            )
            (ws / "mcp-server" / "README.md").write_text("# MCP\n", encoding="utf-8")
            errs = catalogs.check_mcp_release_and_cli_parity(ws)
            self.assertTrue(any("## [9.9.9]" in e for e in errs))
            self.assertTrue(any("missing-cmd" in e for e in errs))
            self.assertTrue(any("--missing-flag" in e for e in errs))

    def test_spec19_en_to_es_links_and_mcp_tool_parity(self) -> None:
        bilingual = _import_script("_docs_invariants_bilingual")
        with tempfile.TemporaryDirectory(prefix="qa11x_spec19_") as tmp:
            ws = Path(tmp)
            (ws / "README.md").write_text("# Root\n", encoding="utf-8")
            (ws / "README.es.md").write_text("# Raiz\n", encoding="utf-8")
            (ws / "GUIDE.md").write_text("# Guide\n", encoding="utf-8")
            (ws / "GUIDE.es.md").write_text("# Guia\n", encoding="utf-8")
            (ws / "ONLY_ES.es.md").write_text("# Solo ES\n", encoding="utf-8")

            en_text = (
                "> 🌐 **Language:** **English (Canonical)** · "
                "[🇪🇸 Español](README.es.md)\n"
                "See [Spanish mirror](GUIDE.es.md) explicitly.\n"
                "Also [only es](ONLY_ES.es.md) and [outside](../ext.es.md).\n"
                "Wrong link: [Guide](GUIDE.es.md).\n"
            )
            link_errs = bilingual._check_en_mirror_links(
                ws, "README.md", "README.es.md", en_text
            )
            self.assertEqual(len(link_errs), 1)
            self.assertIn("README.md:4: enlace EN→ES 'GUIDE.es.md'", link_errs[0])

            id_errs = bilingual._check_pair_structure_and_ids(
                "README.md",
                "README.es.md",
                "## Tools\nRun `certify_11x_gate`.\n",
                "## Herramientas\nSin herramienta.\n",
            )
            self.assertTrue(any("certify_11x_gate" in e for e in id_errs))

    def test_common_safe_chmod_handles_eperm_and_reraises_other(self) -> None:
        common = _import_script("_common")
        with tempfile.TemporaryDirectory(prefix="qa11x_chmod_") as tmp:
            target = Path(tmp) / "f.txt"
            target.write_text("ok\n", encoding="utf-8")
            orig_chmod = common.os.chmod

            def _raise_eperm(_path: Any, _mode: int) -> None:
                raise PermissionError(common.errno.EPERM, "eperm")

            def _raise_enoent(_path: Any, _mode: int) -> None:
                raise FileNotFoundError(common.errno.ENOENT, "enoent")

            common.os.chmod = _raise_eperm
            try:
                common._safe_chmod(target, 0o600)
            finally:
                common.os.chmod = orig_chmod

            common.os.chmod = _raise_enoent
            try:
                with self.assertRaises(OSError):
                    common._safe_chmod(target, 0o600)
            finally:
                common.os.chmod = orig_chmod


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
        sample_dq = '<Record<"a\\">b", (x: number) => void>>()'
        dq_end = mod._skip_balanced_generics(sample_dq, 0)
        self.assertEqual(dq_end, len(sample_dq) - 2)
        self.assertEqual(mod._advance_quoted("'unterminated", 0), 13)
        self.assertEqual(
            mod._build_full_route_path("/v1", "/users", ("api", "v1")),
            "/api/v1/users",
        )
        with tempfile.TemporaryDirectory(prefix="qa11x_fastify_ts_") as tmp:
            ws = Path(tmp)
            routes_ts = ws / "node-backend" / "src" / "routes.ts"
            routes_ts.parent.mkdir(parents=True)
            routes_ts.write_text(
                "fastify.get<{ Params: { id: string } }>('/api/v1/items/:id', h);\n"
                "fastify.get(dynamicVar);\n",
                encoding="utf-8",
            )
            _, recs = mod._extract_node_file_records(routes_ts, ws)
            self.assertEqual(len(recs), 1)
            self.assertEqual((recs[0][1], recs[0][2]), ("GET", "/api/v1/items/:id"))
            fe_ts = ws / "frontend" / "src" / "api.ts"
            fe_ts.parent.mkdir(parents=True)
            fe_ts.write_text(
                "api.get<Unclosed('/api/v1/skip');\n"
                "fetch<Unclosed('/api/v1/skip2');\n"
                "fetch<Promise<Array<string>>>('/api/v1/items/1', "
                "{ method: 'GET' });\n",
                encoding="utf-8",
            )
            calls = mod._extract_file_frontend_calls(fe_ts, ws)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0].url, "/api/v1/items/1")

    def test_lint_workflows_edge_branches(self) -> None:
        lw = _import_script("lint_workflows")
        with tempfile.TemporaryDirectory(prefix="qa11x_lw_") as tmp:
            ws = Path(tmp)
            rc, errs, wf_cnt, act_cnt = lw.lint_workflows_workspace(ws)
            self.assertEqual((rc, wf_cnt, act_cnt), (1, 0, 0))
            self.assertTrue(any("No se encontraron workflows" in e for e in errs))

            wf_dir = ws / ".github" / "workflows"
            act_dir = ws / ".github" / "actions" / "demo"
            wf_dir.mkdir(parents=True)
            act_dir.mkdir(parents=True)
            (wf_dir / "no_jobs.yml").write_text(
                "# sec-ci-action-ref-ok\npermissions:\n  contents: read\n",
                encoding="utf-8",
            )
            (wf_dir / "local_uses.yml").write_text(
                "permissions:\n  contents: read\njobs:\n  j:\n"
                "    timeout-minutes: 5\n    steps:\n      - uses: ./local\n",
                encoding="utf-8",
            )
            (act_dir / "action.yml").write_text(
                "name: demo\nruns:\n  using: node20\n", encoding="utf-8"
            )
            rc2, errs2, wf_cnt2, act_cnt2 = lw.lint_workflows_workspace(ws)
            self.assertEqual((rc2, wf_cnt2, act_cnt2), (1, 2, 1))
            self.assertTrue(any("falta jobs:" in e for e in errs2))
            self.assertTrue(any("runs.using == composite" in e for e in errs2))

    def test_normalize_kcov_cobertura_shell_quotes_heredoc_and_merge(self) -> None:
        norm = _import_script("normalize_kcov_cobertura")
        lines = [
            "#!/usr/bin/env bash",
            "echo \\#escaped 'single",
            "continued line'",
            "x=$'ansi\\n",
            "quote'",
            'echo "dbl\\"quote" # trailing comment',
            "cat <<'EOF'",
            "inside heredoc",
            "EOF",
        ]
        skipped = norm._compute_sq_continuations(lines)
        self.assertEqual(skipped, {3, 5, 8, 9})
        self.assertEqual(norm._merge_condition("50% (1/2)", None), "50% (1/2)")
        self.assertEqual(
            norm._merge_condition("50% (1/2)", "100% (2/2)"), "100% (2/2)"
        )
        self.assertEqual(norm._merge_condition(None, "100% (2/2)"), "100% (2/2)")
        with tempfile.TemporaryDirectory(prefix="qa11x_kcov_inst_") as tmp:
            ws = Path(tmp)
            (ws / "instalar-hooks.sh").write_text(
                "#!/usr/bin/env bash\necho ok\n", encoding="utf-8"
            )
            idx = norm._build_repo_index(ws)
            self.assertIn("instalar-hooks.sh", idx.tracked)

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


class TestDiffCoverageAndStandaloneGuards(unittest.TestCase):
    """Cubre rutas standalone sys.path, __main__, invariantes docs y kcov."""

    def test_scripts_bootstrap_sys_path_without_pythonpath(self) -> None:
        targets = (
            "_common",
            "_docs_invariants_config",
            "audit_pagespeed_insights",
            "bump_version_11x",
            "compact_context_11x",
            "lint_test_antipatterns",
            "lint_workflows",
            "track_findings_state",
            "verify_json_no_duplicate_keys",
            "verify_no_orphan_api_endpoints",
            "verify_topological_health",
            "verify_zero_orphan_vue_components",
        )
        scripts_resolved = Path(SCRIPTS_DIR).resolve()
        for name in targets:
            script_path = REPO_ROOT / ".agents" / "scripts" / f"{name}.py"
            alias = f"_standalone_cov_{name}"
            saved_path = list(sys.path)
            try:
                sys.path[:] = [
                    entry
                    for entry in sys.path
                    if Path(entry).resolve() != scripts_resolved
                ]
                spec = importlib.util.spec_from_file_location(alias, script_path)
                assert spec is not None and spec.loader is not None
                mod = importlib.util.module_from_spec(spec)
                sys.modules[alias] = mod
                spec.loader.exec_module(mod)
                self.assertIn(SCRIPTS_DIR, sys.path)
            finally:
                sys.modules.pop(alias, None)
                sys.path[:] = saved_path

    def test_script_main_dunder_entrypoints(self) -> None:
        with tempfile.TemporaryDirectory(prefix="qa11x_main_") as tmp:
            ws = Path(tmp)
            cases: tuple[tuple[str, list[str], int], ...] = (
                ("lint_workflows.py", ["--workspace", str(ws)], 1),
                ("lint_docs_gate.py", ["--workspace", str(ws)], 0),
                (
                    "normalize_kcov_cobertura.py",
                    [
                        "--repo",
                        str(ws),
                        "--kcov-dir",
                        str(ws),
                        "--output",
                        str(ws / "out.xml"),
                    ],
                    1,
                ),
            )
            for fname, cli_args, expected_code in cases:
                script_path = REPO_ROOT / ".agents" / "scripts" / fname
                with (
                    mock.patch.object(sys, "argv", [str(script_path), *cli_args]),
                    self.assertRaises(SystemExit) as ctx,
                ):
                    runpy.run_path(str(script_path), run_name="__main__")
                self.assertEqual(ctx.exception.code, expected_code)

    def test_lint_docs_gate_consumer_safe_and_roadmap_exit20_skipped(self) -> None:
        ld = _import_script("lint_docs_gate")
        with tempfile.TemporaryDirectory(prefix="qa11x_ld_h33_") as tmp:
            ws = Path(tmp)
            # Consumer repo with valid AGENTS.md + roadmap exit 20 (SKIPPED) -> 0 errors
            (ws / "AGENTS.md").write_text(
                "# Agents\nEnforce QA-GIT-GATE-01.\n", encoding="utf-8"
            )
            scripts_dir = ws / ".agents" / "scripts"
            scripts_dir.mkdir(parents=True, exist_ok=True)
            (scripts_dir / "verify_roadmap_consistency.py").write_text(
                "import sys\nsys.exit(20)\n", encoding="utf-8"
            )
            self.assertEqual(ld.run_lint_docs(ws), [])

            # Upstream repo missing git_closure_gate.md & AI_MASTER_PROMPT -> errors
            (ws / "scripts").mkdir(parents=True, exist_ok=True)
            (ws / "scripts" / "generar-manifiesto.py").write_text(
                "# gen\n", encoding="utf-8"
            )
            (ws / "manifest.json").write_text("{}\n", encoding="utf-8")
            up_errors = ld.run_lint_docs(ws)
            self.assertTrue(any("git_closure_gate.md" in e for e in up_errors))
            self.assertTrue(any("AI_MASTER_PROMPT.md" in e for e in up_errors))

    def test_docs_invariants_helper_edge_branches_and_router_leak(self) -> None:
        bilingual = _import_script("_docs_invariants_bilingual")
        catalogs = _import_script("_docs_invariants_catalogs")
        counts = _import_script("_docs_invariants_counts")

        self.assertEqual(
            bilingual._extract_section_slice("sin marcador", "### 2.1."), ""
        )
        self.assertEqual(
            counts._extract_bracket_items(
                "tools = ['a', 'b']", r"tools\s*=\s*\[([^\]]+)\]", r"'[a-z]+'"
            ),
            2,
        )

        with tempfile.TemporaryDirectory(prefix="qa11x_docs_edges_") as tmp:
            root = Path(tmp)
            auditor = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
            auditor.parent.mkdir(parents=True)
            auditor.write_text("export const x = 'SEC-01';\n", encoding="utf-8")
            (root / "mcp-server" / "package.json").write_text("{}", encoding="utf-8")
            (root / "GEMINI.md").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_START -->\nok\n"
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n",
                encoding="utf-8",
            )
            (root / "sample.md").write_text(
                "field: router_display_name\n", encoding="utf-8"
            )

            self.assertEqual(bilingual._check_auditor_rules_in_human_docs(root), [])
            self.assertIsNone(catalogs._expected_pkg_version(root))
            self.assertEqual(catalogs._extract_repo_skill_ids(root), [])
            self.assertEqual(catalogs._check_cli_catalog_in_readmes(root), [])
            self.assertEqual(
                counts._check_global_connector_budget(root, upstream=False), []
            )
            leaks = catalogs.check_no_private_consumer_leaks(root)
            self.assertTrue(any("rosgrid-router-display" in item for item in leaks))

    def test_normalize_kcov_path_resolution_and_tmp_validation(self) -> None:
        norm = _import_script("normalize_kcov_cobertura")
        with tempfile.TemporaryDirectory(prefix="qa11x_kcov_paths_") as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "unique_demo.sh").write_text(
                "#!/usr/bin/env bash\necho ok\n", encoding="utf-8"
            )
            idx = norm._build_repo_index(root)

            self.assertEqual(
                norm._match_tmp_path("/tmp/sandbox/unique_demo.sh", idx),
                "scripts/unique_demo.sh",
            )
            self.assertEqual(
                norm._match_direct_path("/repo/scripts/unique_demo.sh", idx),
                ("scripts/unique_demo.sh", False),
            )
            self.assertEqual(
                norm._match_direct_path("scripts/unique_demo.sh", idx),
                ("scripts/unique_demo.sh", False),
            )
            self.assertEqual(
                norm._match_direct_path("/opt/untracked.sh", idx), (None, False)
            )
            bad_num = [ET.Element("line", {"number": "x"})]
            oob_num = [ET.Element("line", {"number": "99"})]
            cmt_num = [ET.Element("line", {"number": "1"})]
            self.assertFalse(
                norm._validate_tmp_lines(idx, "scripts/unique_demo.sh", bad_num)
            )
            self.assertFalse(
                norm._validate_tmp_lines(idx, "scripts/unique_demo.sh", oob_num)
            )
            self.assertFalse(
                norm._validate_tmp_lines(idx, "scripts/unique_demo.sh", cmt_num)
            )
            cands = norm._build_path_candidates("scripts/unique_demo.sh", ["/repo"])
            self.assertIn("/repo/scripts/unique_demo.sh", cands)
            self.assertIsNone(
                norm._resolve_rel(
                    idx,
                    "/tmp/sandbox/unique_demo.sh",
                    [],
                    [ET.Element("line", {"number": "1"})],
                )
            )
            self.assertIsNone(norm._resolve_rel(idx, "missing.sh", ["/opt"], []))

    def test_normalize_kcov_merge_branches_and_multiline_reconciliation(self) -> None:
        norm = _import_script("normalize_kcov_cobertura")
        with tempfile.TemporaryDirectory(prefix="qa11x_kcov_ml_") as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "ml.sh").write_text(
                "#!/usr/bin/env bash\n"
                "arr=(\n"
                '  "one"\n'
                '  "two"\n'
                ")\n"
                'cid="$(docker run \\\n'
                "  -u 1000:1000 \\\n"
                '  --rm alpine)"\n'
                "# comentario intermedio\n"
                'echo "${cid}"\n',
                encoding="utf-8",
            )
            idx = norm._build_repo_index(root)
            fl: dict[int, Any] = {}
            norm._merge_line_element(
                fl,
                ET.Element(
                    "line",
                    {
                        "number": "2",
                        "hits": "2",
                        "branch": "false",
                        "condition-coverage": "50% (1/2)",
                    },
                ),
            )
            norm._merge_line_element(
                fl,
                ET.Element(
                    "line",
                    {
                        "number": "2",
                        "hits": "3",
                        "branch": "true",
                        "condition-coverage": "100% (2/2)",
                    },
                ),
            )
            self.assertEqual(fl[2].hits, 5)
            self.assertEqual(fl[2].branch, "true")
            self.assertEqual(fl[2].condition, "100% (2/2)")

            fl[3] = norm._LineEntry(0, None, None)
            fl[4] = norm._LineEntry(0, None, None)
            fl[6] = norm._LineEntry(0, None, None)
            fl[10] = norm._LineEntry(7, None, None)
            norm._reconcile_multiline_hits(idx, {"scripts/ml.sh": fl})
            self.assertEqual(fl[3].hits, 5)
            self.assertEqual(fl[4].hits, 5)
            self.assertEqual(fl[6].hits, 7)

            xml_out = norm._build_cobertura_xml(
                {"scripts/ml.sh": fl, "scripts/empty.sh": {}}
            )
            self.assertIn('branch="true"', xml_out)
            self.assertIn('condition-coverage="100% (2/2)"', xml_out)
            self.assertNotIn("scripts/empty.sh", xml_out)

    def test_normalize_kcov_fallback_parser_and_chmod_error(self) -> None:
        norm = _import_script("normalize_kcov_cobertura")
        with mock.patch.object(
            norm.importlib, "import_module", side_effect=ImportError("no defusedxml")
        ):
            parsed = norm._parse_xml_safely("<coverage/>")
            self.assertEqual(parsed.tag, "coverage")

        with tempfile.TemporaryDirectory(prefix="qa11x_kcov_err_") as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "ok.sh").write_text(
                "#!/usr/bin/env bash\necho ok\n", encoding="utf-8"
            )
            kcov_dir = root / "kcov"
            kcov_dir.mkdir()
            (kcov_dir / "cobertura.xml").write_text(
                '<coverage><sources><source>/repo</source></sources>'
                '<packages><package name="sh"><classes>'
                '<class name="skip" filename="/opt/unknown.sh">'
                '<lines><line number="1" hits="1"/></lines></class>'
                '<class name="ok" filename="scripts/ok.sh">'
                '<lines><line number="2" hits="1"/></lines></class>'
                "</classes></package></packages></coverage>\n",
                encoding="utf-8",
            )
            out_xml = root / "bash.xml"
            with mock.patch.object(os, "chmod", side_effect=OSError("ro fs")):
                rc = norm.normalize_kcov_reports(root, kcov_dir, out_xml)
            self.assertEqual(rc, 0)
            self.assertTrue(out_xml.is_file())


if __name__ == "__main__":
    unittest.main()
