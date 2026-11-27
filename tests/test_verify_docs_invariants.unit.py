# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/verify_docs_invariants.py."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / ".agents" / "scripts" / "verify_docs_invariants.py"

spec = importlib.util.spec_from_file_location("verify_docs_invariants", SCRIPT_PATH)
assert spec is not None and spec.loader is not None
verify_docs = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = verify_docs
spec.loader.exec_module(verify_docs)


class TestVerifyDocsInvariants(unittest.TestCase):
    def test_live_repository_passes_all_invariants(self) -> None:
        errors = verify_docs.validate_repository_docs(REPO_ROOT)
        self.assertEqual(errors, [])
        self.assertEqual(verify_docs.main([str(REPO_ROOT)]), 0)

    def test_all_registered_core_manuals_and_doc_targets_exist_on_disk(self) -> None:
        self.assertIn(
            "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
            verify_docs.DOC_TARGETS,
        )
        self.assertIn(
            "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
            verify_docs.DOC_TARGETS,
        )
        self.assertNotIn("docs/agent-setup.en.md", verify_docs.DOC_TARGETS)
        self.assertIn(".agents/README.md", verify_docs.DOC_TARGETS)
        for rel in verify_docs.HUMAN_CORE_MANUALS:
            self.assertTrue(
                (REPO_ROOT / rel).is_file(),
                f"Manual inexistente en HUMAN_CORE_MANUALS: {rel}",
            )
        for rel in verify_docs.DOC_TARGETS:
            self.assertTrue(
                (REPO_ROOT / rel).is_file(),
                f"Documento inexistente en DOC_TARGETS: {rel}",
            )

    def test_detects_bloated_skill_md_and_active_task(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_file = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
            skill_file.parent.mkdir(parents=True, exist_ok=True)
            skill_file.write_text("X" * 20_500, encoding="utf-8")

            active_task = root / ".agents" / "ACTIVE_TASK.md.example"
            active_task.write_text(
                "\n".join(f"- [ ] line {i}" for i in range(45)), encoding="utf-8"
            )

            errors = verify_docs.validate_repository_docs(root)
            self.assertEqual(len(errors), 2)
            self.assertEqual(verify_docs.main([str(root)]), 1)

    def test_detects_duplicate_security_headers_and_stale_patterns(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            gen = root / "scripts" / "generar-manifiesto.py"
            gen.write_text("# m\n", encoding="utf-8")
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)
            (root / "SECURITY.md").write_text(
                "### 4.10. Uno\nTexto\n### 4.10. Dos\nTexto\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                "Conecta 8 Resources vía stdio y uv pip audit.\n",
                encoding="utf-8",
            )
            (root / "mcp-server" / "README.md").write_text(
                "- `blueprint://ui/refactoring-ui/{topic}`: Módulos (`01` a `09`).\n",
                encoding="utf-8",
            )
            (root / "docs" / "ai-integration.md").write_text(
                "subprocess.run(cmd, shell=True)\n",
                encoding="utf-8",
            )
            (root / "docs" / "docker-troubleshooting.md").write_text(
                "    user: root\n",
                encoding="utf-8",
            )

            errors = verify_docs.validate_repository_docs(root)
            self.assertGreaterEqual(len(errors), 6)

    def test_detects_dual_consumer_uat_count_mismatch(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            gen = root / "scripts" / "generar-manifiesto.py"
            gen.write_text("# m\n", encoding="utf-8")
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            skill_file = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
            skill_file.parent.mkdir(parents=True, exist_ok=True)
            skill_file.write_text(
                "### 2.1. 🛡️ Mandatory Anti-Silo (2 UAT Anti-Blindness Rules)\n\n"
                "1. **Rule One:** text\n"
                "2. **Rule Two:** text\n\n---\n",
                encoding="utf-8",
            )
            human_doc = root / "docs" / "02_BUENAS_PRACTICAS_PROGRAMACION_11X.md"
            human_doc.parent.mkdir(parents=True, exist_ok=True)
            human_doc.write_text(
                "### 1.1. Invariante Anti-Silo\n"
                "Cumplir **1 reglas obligatorias de diseño de pruebas**:\n\n"
                "1. **Regla Uno:** texto\n\n---\n",
                encoding="utf-8",
            )
            human_doc_es = root / "docs" / "02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md"
            human_doc_es.write_text(
                "### 1.1. Invariante Anti-Silo\n"
                "Cumplir **3 reglas obligatorias de diseño de pruebas**:\n\n"
                "1. **Regla Uno:** texto\n\n---\n",
                encoding="utf-8",
            )

            errors = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("Desfase Dual-Consumer" in e for e in errors))
            self.assertTrue(any("Desfase Dual-Consumer ES" in e for e in errors))

    def test_detects_undocumented_auditor_rule_in_human_manuals(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            gen = root / "scripts" / "generar-manifiesto.py"
            gen.write_text("# m\n", encoding="utf-8")
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            auditor = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
            auditor.parent.mkdir(parents=True, exist_ok=True)
            auditor.write_text(
                "const f = { rule_id: 'QA-ORPHAN-99' };\n", encoding="utf-8"
            )

            sec_md = root / "SECURITY.md"
            sec_md.write_text("### 4.1. Documentado SEC-01\n", encoding="utf-8")
            (root / "SECURITY.es.md").write_text(
                "### 4.1. Documentado SEC-01\n", encoding="utf-8"
            )

            errors = verify_docs.validate_repository_docs(root)
            self.assertTrue(
                any("QA-ORPHAN-99" in e and "manuales humanos" in e for e in errors)
            )
            self.assertTrue(
                any("QA-ORPHAN-99" in e and "manuales espejo ES" in e for e in errors)
            )

    def test_detects_architect_12kb_cap_other_20kb_cap_and_graphify_profile(
        self,
    ) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            arch_skill = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
            arch_skill.parent.mkdir(parents=True, exist_ok=True)
            arch_skill.write_text("a" * 12_300, encoding="utf-8")

            other_skill = root / ".agents" / "skills" / "refactoring-ui" / "SKILL.md"
            other_skill.parent.mkdir(parents=True, exist_ok=True)
            other_skill.write_text("b" * 15_000, encoding="utf-8")

            ok_other_errors = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(
                any("qa-11x-architect/SKILL.md" in e for e in ok_other_errors)
            )
            self.assertFalse(
                any("refactoring-ui/SKILL.md" in e for e in ok_other_errors)
            )

            other_skill.write_text("b" * 20_479, encoding="utf-8")
            self.assertFalse(
                any(
                    "refactoring-ui/SKILL.md" in e
                    for e in verify_docs.check_cognitive_budgets(root)
                )
            )
            other_skill.write_text("b" * 20_500, encoding="utf-8")
            both_errors = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(any("refactoring-ui/SKILL.md" in e for e in both_errors))

            readme = root / "README.md"
            readme.write_text(
                "Run docker compose --profile graphify up\n", encoding="utf-8"
            )
            doc_errors = verify_docs.check_active_docs(root)
            self.assertTrue(any("--profile graphify" in e for e in doc_errors))

    def test_checks_mcp_readme_and_agent_setup_bilingual_cross_links(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](README.md) | **Español**\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](README.es.md)\n",
                encoding="utf-8",
            )
            (root / "mcp-server").mkdir()
            (root / "mcp-server" / "README.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](README.es.md)\n",
                encoding="utf-8",
            )
            (root / "mcp-server" / "README.es.md").write_text(
                "Missing English backlink\n", encoding="utf-8"
            )
            (root / "docs").mkdir()
            (root / "docs" / "agent-setup.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](agent-setup.es.md)\n",
                encoding="utf-8",
            )
            (root / "docs" / "agent-setup.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](agent-setup.md) | **Español**\n",
                encoding="utf-8",
            )

            errors = verify_docs.check_bilingual_readme_parity(root)
            self.assertTrue(any("mcp-server/README.es.md" in e for e in errors))
            self.assertFalse(any("agent-setup" in e for e in errors))

            (root / "mcp-server" / "README.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](README.md) | **Español**\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_bilingual_readme_parity(root), [])

            # El archivo legado docs/agent-setup.en.md en disco debe fallar
            (root / "docs" / "agent-setup.en.md").write_text(
                "Redirect\n", encoding="utf-8"
            )
            legacy_readme_errs = verify_docs.check_bilingual_readme_parity(root)
            self.assertTrue(any("agent-setup.en.md" in e for e in legacy_readme_errs))

    def test_detects_bilingual_agent_setup_and_pair_parity_mismatches(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "README.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](README.es.md)\n",
                encoding="utf-8",
            )
            (root / "README.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](README.md) | **Español**\n",
                encoding="utf-8",
            )
            (root / "docs" / "agent-setup.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](agent-setup.es.md)\n",
                encoding="utf-8",
            )
            (root / "docs" / "agent-setup.es.md").write_text(
                "Missing link\n", encoding="utf-8"
            )

            readme_errs = verify_docs.check_bilingual_readme_parity(root)
            self.assertTrue(any("agent-setup.es.md" in e for e in readme_errs))

            (root / "docs" / "agent-setup.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](agent-setup.md) | **Español**\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_bilingual_readme_parity(root), [])

            # Par nominal con código cercado y comentario HTML ignorados al contar H2/H3
            (root / "TESTING.md").write_text(
                "> 🌐 **Language:** **English** | [🇪🇸 Español](TESTING.es.md)\n\n"
                "## Section 1\n### Detail A\n\n"
                "```bash\n## comment inside code\n```\n"
                "<!-- ## comment inside html -->\n"
                "Control SEC-01 and blueprint://core/philosophy\n",
                encoding="utf-8",
            )
            (root / "TESTING.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](TESTING.md) | **Español**\n\n"
                "## Sección 1\n### Detalle A\n\n"
                "Control SEC-01 y blueprint://core/philosophy\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_bilingual_pair_parity(root), [])

            # Divergencias estructural, de IDs normativos y de banner
            (root / "TESTING.es.md").write_text(
                "Sin enlace cruzado\n\n## Sección 1\n\nControl SEC-99\n",
                encoding="utf-8",
            )
            pair_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(any("banner recíproco" in e for e in pair_errs))
            self.assertTrue(any("Desfase estructural" in e for e in pair_errs))
            self.assertTrue(any("Desfase de IDs normativos" in e for e in pair_errs))

            # Con RESOURCES.es.md se exige el conjunto completo BILINGUAL_DOC_PAIRS
            (root / "RESOURCES.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](RESOURCES.md) | **Español**\n",
                encoding="utf-8",
            )
            missing_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(
                any("Par bilingüe incompleto/vacío" in e for e in missing_errs)
            )

    def test_detects_tactical_patterns_2560b_and_active_task_rule_25l(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tactical = (
                root / ".agents" / "skills" / "tactical-patterns-11x" / "SKILL.md"
            )
            tactical.parent.mkdir(parents=True, exist_ok=True)
            tactical.write_text("x" * 2_560, encoding="utf-8")

            rule = (
                root / ".agents" / "rules" / "active_task_and_planning_resilience.md"
            )
            rule.parent.mkdir(parents=True, exist_ok=True)
            rule.write_text(
                "\n".join(f"- rule {i}" for i in range(15)) + "\n", encoding="utf-8"
            )

            self.assertEqual(verify_docs.check_cognitive_budgets(root), [])

            tactical.write_text("x" * 2_561, encoding="utf-8")
            rule.write_text(
                "\n".join(f"- rule {i}" for i in range(26)) + "\n", encoding="utf-8"
            )
            errs = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(any("tactical-patterns-11x/SKILL.md" in e for e in errs))
            self.assertTrue(
                any("active_task_and_planning_resilience.md" in e for e in errs)
            )

    def test_derives_dynamic_counts_from_repo_and_resolves_const_auditor_rules(
        self,
    ) -> None:
        import json
        import tempfile

        counts = verify_docs.derive_expected_counts(REPO_ROOT)
        self.assertEqual(counts.skills, 12)
        self.assertEqual(counts.tools, 20)
        self.assertEqual(counts.resources, 13)
        self.assertEqual(counts.blueprints, 10)
        self.assertEqual(counts.calm_controls, 7)
        self.assertEqual(counts.ref_controls, 22)
        self.assertEqual(counts.scanner_rules, 37)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            gen = root / "scripts" / "generar-manifiesto.py"
            gen.write_text("# m\n", encoding="utf-8")
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            auditor = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
            auditor.parent.mkdir(parents=True, exist_ok=True)
            auditor.write_text(
                "const QA_CONST_RULE = 'QA-CONST-01';\n"
                "const f1 = { rule_id: 'SEC-01' };\n"
                "const f2 = { rule_id: QA_CONST_RULE };\n",
                encoding="utf-8",
            )
            (root / "SECURITY.md").write_text("SEC-01\n", encoding="utf-8")
            errs = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("QA-CONST-01" in e for e in errs))

            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('t1', '', {}, async () => ({}));\n"
                "server.registerTool('t2', '', {}, async () => ({}));\n"
                "server.resource('r1', 'blueprint://one', {}, async () => ({}));\n",
                encoding="utf-8",
            )
            (root / "architecture").mkdir(parents=True, exist_ok=True)
            (root / "architecture" / "qa-11x.calm.json").write_text(
                json.dumps({"controls": {"c1": {}, "c2": {}, "c3": {}}}),
                encoding="utf-8",
            )
            dyn = verify_docs.derive_expected_counts(root)
            self.assertEqual(dyn.tools, 2)
            self.assertEqual(dyn.resources, 1)
            self.assertEqual(dyn.calm_controls, 3)
            self.assertEqual(dyn.scanner_rules, 2)

    def test_detects_stale_surface_counts_without_false_positives(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "catalogs").mkdir(parents=True, exist_ok=True)
            (root / ".agents" / "rules").mkdir(parents=True, exist_ok=True)
            (root / "docs" / "specs").mkdir(parents=True, exist_ok=True)

            # Casos válidos sin falsos positivos (sub-skills, 22 reference controls,
            # 32+5=37, 12 environments, 10 stacks)
            (root / "README.md").write_text(
                "# OK\n"
                "Loads 10 specialized sub-skills and 9 sub-skills with "
                "SHA-256 skills.\n"
                "Enforces 22 reference controls, 22 controls, "
                "32+5=37 scanner rules.\n"
                "Covers 12 environments, 7 controls (CALM), 10 stacks, "
                "Top 5 blueprints.\n"
                "Historical: `18` MCP tools and `12` MCP resources, "
                "12 core v1 tools, 7 v2.0/v3.1 tools.\n",
                encoding="utf-8",
            )
            # Specs históricas 01..18 y CHANGELOG pasado no deben disparar errores
            (root / "docs" / "specs" / "18_SPEC_HIST.md").write_text(
                "Preserves 18 tools / 12 resources and Appium 2.\n", encoding="utf-8"
            )
            (root / "CHANGELOG.md").write_text(
                "## [Unreleased]\n- Ok\n\n## [2.21.0]\n"
                "- Legacy 18 tools / 12 resources and Appium 2\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_stale_surface_counts(root), [])
            self.assertEqual(verify_docs.check_v2_mcp_surface_counts(root), [])

            # CHANGELOG ## [Unreleased] sí debe auditarse (conteos y MCP v1)
            (root / "CHANGELOG.md").write_text(
                "## [Unreleased]\n- Legacy 12 tools and 8 resources and Appium 2\n\n"
                "## [2.21.0]\n- Legacy 18 tools / 12 resources and Appium 2\n",
                encoding="utf-8",
            )
            unrel_errs = verify_docs.check_stale_surface_counts(root)
            self.assertTrue(any("CHANGELOG.md" in e for e in unrel_errs))
            (root / "CHANGELOG.md").write_text(
                "## [Unreleased]\n- Ok\n\n## [2.21.0]\n- Legacy\n",
                encoding="utf-8",
            )

            # Fallos reales obligatorios
            (root / "llms.txt").write_text(
                "Differential mode preserving 18 tools / 12 resources.\n"
                "Mobile QA with Appium 2 and WebdriverIO.\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                "CALM Schema & 11-Control Verification (qa-11x.calm.json)\n"
                "11 Blocking Architecture Controls\n"
                "audit_security_stig_owasp checks 22 scanner rules and "
                "29 static rules.\n"
                "Supports 7 stacks across 8 resources, 9 resources, "
                "10 resources and 11 resources.\n",
                encoding="utf-8",
            )
            (root / ".agents" / "rules" / "evo.md").write_text(
                "Owns the 10 modular skills in .agents/skills/.\n",
                encoding="utf-8",
            )
            (root / "catalogs" / "sub.md").write_text(
                "Appium 2 mobile actors and 9 blueprints.\n",
                encoding="utf-8",
            )

            errs = verify_docs.check_stale_surface_counts(root)
            self.assertTrue(any("18 tools" in e for e in errs))
            self.assertTrue(any("12 resources" in e for e in errs))
            self.assertTrue(any("8 resources" in e for e in errs))
            self.assertTrue(any("9 resources" in e for e in errs))
            self.assertTrue(any("10 resources" in e for e in errs))
            self.assertTrue(any("11 resources" in e for e in errs))
            self.assertTrue(any("7 stacks" in e for e in errs))
            self.assertTrue(any("Appium 2" in e for e in errs))
            self.assertTrue(any("11 controles" in e for e in errs))
            self.assertTrue(any("22 reglas" in e for e in errs))
            self.assertTrue(any("29 reglas" in e for e in errs))
            self.assertTrue(any("10 skills" in e for e in errs))
            self.assertTrue(any("9 blueprints" in e for e in errs))

    def test_main_default_root_and_workspace_flag(self) -> None:
        import os
        import tempfile
        from unittest import mock

        captured_roots: list[Path] = []

        def fake_validate(root: Path) -> list[str]:
            captured_roots.append(root)
            return []

        prev_cwd = Path.cwd()
        try:
            os.chdir(REPO_ROOT / "mcp-server")
            with mock.patch.object(
                verify_docs, "validate_repository_docs", side_effect=fake_validate
            ):
                self.assertEqual(verify_docs.main([]), 0)
        finally:
            os.chdir(prev_cwd)
        self.assertEqual(captured_roots, [REPO_ROOT.resolve()])
        self.assertEqual(verify_docs.SKILL_MAX_BYTES, 20_480)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            (root / "scripts" / "generar-manifiesto.py").write_text(
                "# m\n", encoding="utf-8"
            )
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / "llms.txt").write_text("Appium 2\n", encoding="utf-8")
            self.assertEqual(verify_docs.main(["--workspace", str(root)]), 1)
            self.assertEqual(
                verify_docs.main(["--workspace", str(root / "nonexistent")]), 1
            )

    def test_edge_branches_for_catalogs_links_calm_and_ref_matrix(self) -> None:
        import hashlib
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. _read_active_doc_text trunca historial tras ## [Unreleased]
            cl = root / "CHANGELOG.md"
            cl.write_text(
                "## [Unreleased]\n- Nuevo\n\n## [1.0.0]\n- Viejo\n",
                encoding="utf-8",
            )
            sliced = verify_docs._read_active_doc_text("CHANGELOG.md", cl)
            self.assertIn("Nuevo", sliced)
            self.assertNotIn("Viejo", sliced)

            # 2. _derive_calm_controls con JSON no-objeto y stack extra
            (root / "architecture").mkdir(parents=True, exist_ok=True)
            (root / "architecture" / "qa-11x.calm.json").write_text(
                "[]", encoding="utf-8"
            )
            self.assertEqual(
                verify_docs._derive_calm_controls(root),
                verify_docs.EXPECTED_CALM_CONTROLS,
            )

            for idx in range(10):
                st = verify_docs.KNOWN_BLUEPRINT_STACKS[idx]
                (root / st).mkdir(parents=True, exist_ok=True)
                (root / st / "README.md").write_text(f"# {st}\n", encoding="utf-8")
            (root / "extra-stack").mkdir(parents=True, exist_ok=True)
            (root / "extra-stack" / "README.md").write_text(
                "# Extra\n", encoding="utf-8"
            )
            (root / "extra-stack" / "Makefile").write_text("all:\n", encoding="utf-8")
            self.assertEqual(verify_docs._derive_blueprints_count(root), 11)

            # 3. Matriz de referencia desfasada y enlaces con <> y título
            ref = (
                root
                / ".agents"
                / "skills"
                / "qa-11x-architect"
                / "references"
                / "02-security-disa-owasp-22.md"
            )
            ref.parent.mkdir(parents=True, exist_ok=True)
            ref.write_text(
                "## 1. Compliance Matrix: 99 Security Controls\n| **01** | Demo |\n",
                encoding="utf-8",
            )
            self.assertTrue(
                any(
                    "02-security-disa-owasp-22.md" in e
                    for e in verify_docs.check_dual_consumer_parity(root)
                )
            )

            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "docs" / "target.md").write_text("# Target\n", encoding="utf-8")
            (root / "README.md").write_text(
                '[A](<docs/target.md>) [B](docs/target.md "Title") '
                "[C](#anchor) [D](docs/missing.md)\n",
                encoding="utf-8",
            )
            link_errs = verify_docs.check_internal_markdown_links(root)
            self.assertEqual(len(link_errs), 1)
            self.assertIn("docs/missing.md", link_errs[0])

            # 4. Catálogos globales: faltante, JSON inválido, licencia, versión
            (root / "llms.txt").write_text("incomplete\n", encoding="utf-8")
            self.assertTrue(
                any(
                    "Falta artefacto GEO" in e
                    for e in verify_docs.check_global_catalogs_and_geo(root)
                )
            )

            (root / "catalogs").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "package.json").write_text(
                json.dumps({"version": "3.0.0"}), encoding="utf-8"
            )
            (root / "catalogs" / "qaskills-pack.json").write_text(
                "{bad", encoding="utf-8"
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                "[]", encoding="utf-8"
            )
            (root / "catalogs" / "agenticskills-submission.md").write_text(
                "empty\n", encoding="utf-8"
            )
            cat_errs = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(
                any("qaskills-pack.json: JSON inválido" in e for e in cat_errs)
            )
            self.assertTrue(
                any("skillsllm-manifest.json: JSON inválido" in e for e in cat_errs)
            )

            skill_md = root / ".agents" / "skills" / "demo-skill" / "SKILL.md"
            skill_md.parent.mkdir(parents=True, exist_ok=True)
            raw = b"# Demo\n"
            skill_md.write_bytes(raw)
            (root / "mcp-server" / "src").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('t1', '', {}, async () => ({}));", encoding="utf-8"
            )
            (root / "catalogs" / "qaskills-pack.json").write_text(
                json.dumps(
                    {
                        "license": "Apache",
                        "version": "1.0.0",
                        "skills": ["bad", {"id": "other", "path": "missing.md"}],
                    }
                ),
                encoding="utf-8",
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps(
                    {
                        "license": "GPL",
                        "version": "1.0.0",
                        "mcp_capabilities": {
                            "tools_count": 0,
                            "resources_count": 0,
                            "tools": [],
                            "resources": [],
                        },
                        "blueprints": [],
                        "skills": [
                            {
                                "id": "wrong-id",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                                "sha256": hashlib.sha256(raw).hexdigest(),
                                "size_bytes": len(raw),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            cat_errs2 = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(any("licencia esperada 'MIT'" in e for e in cat_errs2))
            self.assertTrue(any("version '1.0.0' != '3.0.0'" in e for e in cat_errs2))
            self.assertTrue(any("se esperan 1 skills reales" in e for e in cat_errs2))
            self.assertTrue(
                any("debe listar exactamente 1 tools" in e for e in cat_errs2)
            )
            self.assertTrue(
                any("se esperan 11 blueprints raíz" in e for e in cat_errs2)
            )
            self.assertTrue(
                any("desfase entre skills declaradas" in e for e in cat_errs2)
            )

            # 5. _check_skill_entries con entrada inválida y ruta inexistente
            bad_entries = verify_docs._check_skill_entries(
                root,
                "catalogs/qaskills-pack.json",
                ["bad", {"id": "x", "path": "no-existe.md"}],
                ["demo-skill"],
                False,
                expected_skills=2,
            )
            self.assertTrue(any("entrada de skill inválida" in e for e in bad_entries))
            self.assertTrue(any("ruta SKILL.md inexistente" in e for e in bad_entries))

            # 6. Camino nominal exitoso de catálogos globales + GEO
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('t1', '', {}, async () => ({}));\n"
                "server.resource('r1', 'blueprint://one', {}, async () => ({}));\n",
                encoding="utf-8",
            )
            (root / "catalogs" / "qaskills-pack.json").write_text(
                json.dumps(
                    {
                        "license": "MIT",
                        "version": "3.0.0",
                        "skills": [
                            {
                                "id": "demo-skill",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps(
                    {
                        "license": "MIT",
                        "version": "3.0.0",
                        "mcp_capabilities": {
                            "tools_count": 1,
                            "resources_count": 1,
                            "tools": ["t1"],
                            "resources": ["blueprint://one"],
                        },
                        "blueprints": [{"id": f"b{i}"} for i in range(11)],
                        "skills": [
                            {
                                "id": "demo-skill",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                                "sha256": hashlib.sha256(raw).hexdigest(),
                                "size_bytes": len(raw),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            geo_ok = "demo-skill\nt1\nblueprint://one\n"
            (root / "llms.txt").write_text(geo_ok, encoding="utf-8")
            (root / "catalogs" / "agenticskills-submission.md").write_text(
                geo_ok, encoding="utf-8"
            )
            self.assertEqual(verify_docs.check_global_catalogs_and_geo(root), [])

            # 7. SHA-256 mismatch en skillsllm-manifest y conteo MCP v1 obsoleto
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps(
                    {
                        "license": "MIT",
                        "version": "3.0.0",
                        "mcp_capabilities": {
                            "tools_count": 1,
                            "resources_count": 1,
                            "tools": ["t1"],
                            "resources": ["blueprint://one"],
                        },
                        "blueprints": [{"id": f"b{i}"} for i in range(11)],
                        "skills": [
                            {
                                "id": "demo-skill",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                                "sha256": "0" * 64,
                                "size_bytes": len(raw),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            self.assertTrue(
                any(
                    "desfase SHA-256" in e
                    for e in verify_docs.check_global_catalogs_and_geo(root)
                )
            )

            (root / "README.es.md").write_text(
                "**Español** [README.md](README.md)\n", encoding="utf-8"
            )
            (root / "README.md").write_text(
                "**English** [README.es.md](README.es.md)\n"
                "Exposes 12 Tools and 9 Resources.\n",
                encoding="utf-8",
            )
            self.assertTrue(
                any(
                    "conteo MCP v1 obsoleto" in e
                    for e in verify_docs.check_v2_mcp_surface_counts(root)
                )
            )

    def test_root_manifest_stack_count_enforcement(self) -> None:
        import hashlib
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. Consumer repo con manifest.json parcial y sin llms.txt/catalogs
            (root / "manifest.json").write_text(
                json.dumps({"stacks": {"python": {}, "fastapi": {}}}),
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_global_catalogs_and_geo(root), [])

            # 2. Blueprint repo con llms.txt + catalogs/ + manifest.json (10 stacks)
            skill_md = root / ".agents" / "skills" / "demo-skill" / "SKILL.md"
            skill_md.parent.mkdir(parents=True, exist_ok=True)
            raw = b"# Demo\n"
            skill_md.write_bytes(raw)
            (root / "mcp-server" / "src").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "package.json").write_text(
                json.dumps({"version": "3.0.0"}), encoding="utf-8"
            )
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('t1', '', {}, async () => ({}));\n"
                "server.resource('r1', 'blueprint://one', {}, async () => ({}));\n",
                encoding="utf-8",
            )
            (root / "catalogs").mkdir(parents=True, exist_ok=True)
            (root / "catalogs" / "qaskills-pack.json").write_text(
                json.dumps(
                    {
                        "license": "MIT",
                        "version": "3.0.0",
                        "skills": [
                            {
                                "id": "demo-skill",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps(
                    {
                        "license": "MIT",
                        "version": "3.0.0",
                        "mcp_capabilities": {
                            "tools_count": 1,
                            "resources_count": 1,
                            "tools": ["t1"],
                            "resources": ["blueprint://one"],
                        },
                        "blueprints": [{"id": f"b{i}"} for i in range(10)],
                        "skills": [
                            {
                                "id": "demo-skill",
                                "path": ".agents/skills/demo-skill/SKILL.md",
                                "sha256": hashlib.sha256(raw).hexdigest(),
                                "size_bytes": len(raw),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            geo_ok = "demo-skill\nt1\nblueprint://one\n"
            (root / "llms.txt").write_text(geo_ok, encoding="utf-8")
            (root / "catalogs" / "agenticskills-submission.md").write_text(
                geo_ok, encoding="utf-8"
            )

            # 2a. 7 stacks -> fallo
            (root / "manifest.json").write_text(
                json.dumps({"stacks": {f"s{i}": {} for i in range(7)}}),
                encoding="utf-8",
            )
            errs_7 = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(
                any(
                    "manifest.json: se esperan 10 stacks (encontradas=7)" in e
                    for e in errs_7
                )
            )

            # 2b. JSON corrupto -> fallo
            (root / "manifest.json").write_text("{bad", encoding="utf-8")
            errs_bad = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(
                any("manifest.json: JSON inválido" in e for e in errs_bad)
            )

            # 2c. stacks no-dict -> fallo
            (root / "manifest.json").write_text(
                json.dumps({"stacks": []}), encoding="utf-8"
            )
            errs_type = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(any("encontradas=invalid" in e for e in errs_type))

            # 2d. 10 stacks -> OK
            (root / "manifest.json").write_text(
                json.dumps({"stacks": {f"s{i}": {} for i in range(10)}}),
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_global_catalogs_and_geo(root), [])

    def test_blocks_legacy_agent_setup_en_links_and_live_references(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)

            # Estado limpio sin referencias a agent-setup.en.md -> 0 errores
            (root / "README.md").write_text(
                "See [docs/agent-setup.md](docs/agent-setup.md)\n", encoding="utf-8"
            )
            (root / "README.es.md").write_text(
                "Ver [docs/agent-setup.es.md](docs/agent-setup.es.md)\n",
                encoding="utf-8",
            )
            (root / "RESOURCES.md").write_text(
                "[Setup](docs/agent-setup.md)\n", encoding="utf-8"
            )
            (root / "llms.txt").write_text("docs/agent-setup.md\n", encoding="utf-8")
            (root / "mcp-server" / "README.md").write_text(
                "See docs/agent-setup.md\n", encoding="utf-8"
            )
            (root / "docs" / "agent-setup.md").write_text(
                "Guide EN\n", encoding="utf-8"
            )
            (root / "docs" / "agent-setup.es.md").write_text(
                "Guía ES\n", encoding="utf-8"
            )
            (root / "docs" / "ai-integration.md").write_text(
                "See [setup](agent-setup.md)\n", encoding="utf-8"
            )
            self.assertEqual(verify_docs.check_active_docs(root), [])

            # Referencias vivas y enlaces activos a agent-setup.en.md bloqueados
            (root / "docs" / "agent-setup.en.md").write_text(
                "Redirect\n", encoding="utf-8"
            )
            (root / "README.md").write_text(
                "Legacy `docs/agent-setup.en.md`\n", encoding="utf-8"
            )
            (root / "RESOURCES.es.md").write_text(
                "Ver [old](docs/agent-setup.en.md)\n", encoding="utf-8"
            )
            (root / "llms.txt").write_text(
                "redirect: docs/agent-setup.en.md\n", encoding="utf-8"
            )
            (root / "mcp-server" / "README.md").write_text(
                "See [docs/agent-setup.en.md]"
                "(https://example.org/docs/agent-setup.en.md)\n",
                encoding="utf-8",
            )
            (root / "docs" / "agent-setup.md").write_text(
                "Old `agent-setup.en.md`\n", encoding="utf-8"
            )
            (root / "docs" / "ai-integration.md").write_text(
                "See [legacy](agent-setup.en.md)\n", encoding="utf-8"
            )

            errs = verify_docs.check_active_docs(root)
            for marker in (
                "docs/agent-setup.en.md: archivo legado prohibido",
                "README.md: referencia prohibida",
                "RESOURCES.es.md: referencia prohibida",
                "llms.txt: referencia prohibida",
                "mcp-server/README.md: referencia prohibida",
                "docs/agent-setup.md: referencia prohibida",
                "docs/ai-integration.md: detectado enlace obsoleto",
            ):
                self.assertTrue(
                    any(marker in e for e in errs),
                    f"Faltó error esperado '{marker}' en {errs}",
                )

    def test_bilingual_pair_parity_spec19_banner_and_es_internal_links(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "guides").mkdir(parents=True, exist_ok=True)
            (root / "docs" / "specs").mkdir(parents=True, exist_ok=True)

            # Par válido base y documento histórico sin espejo .es.md
            (root / "TESTING.md").write_text(
                "> 🌐 **Language:** **English** · "
                "[🇪🇸 Leer en Español](TESTING.es.md)\n\n## Guide\n",
                encoding="utf-8",
            )
            (root / "TESTING.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](TESTING.md) · "
                "**Español** (Espejo 1:1)\n\n## Guía\n",
                encoding="utf-8",
            )
            (root / "docs" / "specs" / "01_HIST.md").write_text(
                "# Historical\n", encoding="utf-8"
            )

            # 1. Par custom fuera de BILINGUAL_DOC_PAIRS con banner Spec 19
            (root / "guides" / "workflow.md").write_text(
                "> 🌐 **Language:** **English** · "
                "[🇪🇸 Leer en Español](workflow.es.md)\n\n"
                "## Overview\nSee [Testing](../TESTING.md) and "
                "[Spec 01](../docs/specs/01_HIST.md).\n",
                encoding="utf-8",
            )
            (root / "guides" / "workflow.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](workflow.md) · "
                "**Español** (Espejo 1:1)\n\n"
                "## Resumen\nVer [Pruebas](../TESTING.es.md), "
                "[Spec 01](../docs/specs/01_HIST.md) y "
                "[fuera](../../../outside.md).\n"
                "Ignorar `[ejemplo](../TESTING.md)` y bloque:\n"
                "```markdown\n[no-aplica](../TESTING.md)\n```\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_bilingual_pair_parity(root), [])

            # 2. Fallo: enlace ES->EN en cuerpo hacia archivo con hermano .es.md
            (root / "guides" / "workflow.es.md").write_text(
                "> 🌐 **Idioma:** [🇬🇧 English (workflow.md)](workflow.md) | "
                "**Español (Espejo 1:1)**\n\n"
                "## Resumen\nVer [Pruebas](../TESTING.md#seccion) y no banner.\n",
                encoding="utf-8",
            )
            link_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(
                any(
                    "guides/workflow.es.md:4: enlace ES→EN '../TESTING.md'" in e
                    and "TESTING.es.md" in e
                    for e in link_errs
                ),
                f"Se esperaba error ES->EN, obtenido: {link_errs}",
            )

            # 3. Fallo: banner sin marcador Spec 19 o fuera de las 10 primeras líneas
            (root / "guides" / "workflow.es.md").write_text(
                "> Ver [workflow.md](workflow.md)\n\n## Resumen\n",
                encoding="utf-8",
            )
            banner_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(
                any(
                    "guides/workflow.es.md: falta banner recíproco" in e
                    for e in banner_errs
                )
            )

            # 4. Fallo: espejo .es.md huérfano sin contraparte .md
            (root / "guides" / "orphan.es.md").write_text(
                "> 🌐 **Idioma:** [🇺🇸 English](orphan.md) · **Español**\n",
                encoding="utf-8",
            )
            orphan_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(
                any("falta o está vacío 'guides/orphan.md'" in e for e in orphan_errs)
            )

    def test_derive_counts_supports_register_tool_and_v2_registrations(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src_dir = root / "mcp-server" / "src"
            src_dir.mkdir(parents=True, exist_ok=True)
            (src_dir / "server.ts").write_text(
                "export const V2_TOOL_REGISTRATIONS = [\n"
                "  { definition: SECOND_V2_TOOL },\n"
                "];\n"
                "server.registerTool('t1', {}, async () => ({}));\n"
                "server.registerResource("
                "'r1', 'blueprint://one', {}, async () => ({}));\n"
                "server.registerResource("
                "EXT_RESOURCE.name, EXT_RESOURCE.uri, {}, async () => ({}));\n",
                encoding="utf-8",
            )
            (src_dir / "index.ts").write_text("", encoding="utf-8")
            self.assertEqual(verify_docs._derive_tools_count(root), 2)
            self.assertEqual(verify_docs._derive_resources_count(root), 2)

    def test_load_budgets_module_cold_cache_and_missing_spec(self) -> None:
        import importlib.util
        import sys
        from unittest import mock

        saved_budgets = sys.modules.pop("_budgets", None)
        try:
            loaded = verify_docs._load_budgets_module()
            self.assertGreater(int(loaded.SKILL_MAX_BYTES), 0)
            sys.modules.pop("_budgets", None)
            with mock.patch.object(
                importlib.util, "spec_from_file_location", return_value=None
            ):
                with self.assertRaises(ImportError):
                    verify_docs._load_budgets_module()
        finally:
            if saved_budgets is not None:
                sys.modules["_budgets"] = saved_budgets

    def test_f11_3_skill_references_and_mobile_appium_no_stale_terms(self) -> None:
        """Verifica que skill refs y mobile-appium no conserven terminos legados."""
        repo_root = Path(__file__).resolve().parent.parent
        refs_dir = (
            repo_root / ".agents" / "skills" / "qa-11x-architect" / "references"
        )
        for ref_file in sorted(refs_dir.glob("*.md")):
            content = ref_file.read_text(encoding="utf-8")
            self.assertNotIn(
                "strictly in Spanish",
                content,
                f"Texto legado 'strictly in Spanish' hallado en {ref_file}",
            )
            if ref_file.name.startswith(
                ("01-", "02-", "03-", "04-", "05-", "06-", "07-", "08-", "09-")
            ):
                self.assertIn(
                    "OUTPUT LANGUAGE & DYNAMIC MIRRORING",
                    content,
                    f"Falta politica Spec 19 en {ref_file}",
                )

        for mobile_rel in (
            "mobile-appium/wdio.conf.ts",
            "mobile-appium/tests/screenplay/MobileActor.ts",
        ):
            mobile_content = (repo_root / mobile_rel).read_text(encoding="utf-8")
            self.assertNotIn(
                "Appium 2",
                mobile_content,
                f"Referencia obsoleta a 'Appium 2' en {mobile_rel}",
            )

        agents_md_content = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("OUTPUT LANGUAGE & DYNAMIC MIRRORING", agents_md_content)
        for gov_doc in (
            repo_root / "AGENTS.md",
            repo_root / ".agents" / "README.md",
            *sorted((repo_root / ".agents" / "rules").glob("*.md")),
        ):
            gov_text = gov_doc.read_text(encoding="utf-8")
            self.assertNotIn("Always interact with the user", gov_text)
            self.assertNotIn("Spanish interaction", gov_text)

    def test_refactoring_ui_topics_and_agents_markdown_links(self) -> None:
        """Valida temas blueprint://ui/refactoring-ui/* y enlaces en .agents/."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            refs_dir = root / ".agents" / "skills" / "refactoring-ui" / "references"
            refs_dir.mkdir(parents=True)
            (refs_dir / "color.md").write_text("# Color\n", encoding="utf-8")
            (refs_dir / "hierarchy.md").write_text("# Hierarchy\n", encoding="utf-8")
            (root / ".agents" / "rules").mkdir(parents=True)
            (root / ".agents" / ".cache").mkdir(parents=True)
            (root / ".agents" / "artifacts").mkdir(parents=True)
            (root / "docs" / "specs").mkdir(parents=True)

            # Enlaces y temas válidos + archivos ignorados en .cache/artifacts/specs
            (root / "AGENTS.md").write_text(
                "Ver [Regla](.agents/rules/sample.md) y "
                "`blueprint://ui/refactoring-ui/color`.\n",
                encoding="utf-8",
            )
            (root / ".agents" / "rules" / "sample.md").write_text(
                "Usar `blueprint://ui/refactoring-ui/skill` y "
                "`blueprint://ui/refactoring-ui/hierarchy`.\n",
                encoding="utf-8",
            )
            (root / ".agents" / ".cache" / "tmp.md").write_text(
                "[ignorado](no-existe.md)\n", encoding="utf-8"
            )
            (root / ".agents" / "artifacts" / "out.md").write_text(
                "[ignorado](tampoco-existe.md)\n", encoding="utf-8"
            )
            (root / "docs" / "specs" / "01_SPEC_HISTORICAL.md").write_text(
                "`blueprint://ui/refactoring-ui/invented`\n", encoding="utf-8"
            )

            self.assertEqual(verify_docs.check_internal_markdown_links(root), [])
            self.assertEqual(verify_docs._check_refactoring_ui_topics(root), [])

            # Tema inválido + enlace roto en .agents/rules/sample.md
            (root / ".agents" / "rules" / "sample.md").write_text(
                "Malo `blueprint://ui/refactoring-ui/nonexistent` y "
                "[roto](missing_rule.md).\n",
                encoding="utf-8",
            )
            link_errs = verify_docs.check_internal_markdown_links(root)
            topic_errs = verify_docs._check_refactoring_ui_topics(root)
            self.assertTrue(any("missing_rule.md" in e for e in link_errs))
            self.assertTrue(
                any(
                    "blueprint://ui/refactoring-ui/nonexistent" in e
                    for e in topic_errs
                )
            )

    def test_code_of_conduct_pair_and_extended_internal_links(self) -> None:
        """Verifica paridad CODE_OF_CONDUCT y links en ROADMAP/CHANGELOG/refs."""
        import tempfile

        self.assertIn(
            ("CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT.es.md"),
            verify_docs.BILINGUAL_DOC_PAIRS,
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref_dir = (
                root / ".agents" / "skills" / "qa-11x-architect" / "references"
            )
            ref_dir.mkdir(parents=True)
            (root / "mcp-server").mkdir()
            (root / "CODE_OF_CONDUCT.md").write_text(
                "# CoC\n## Rules\n[broken](missing_coc.md)\n", encoding="utf-8"
            )
            (root / "CODE_OF_CONDUCT.es.md").write_text(
                "# CoC ES\n## Reglas\n[roto](missing_coc_es.md)\n",
                encoding="utf-8",
            )
            (root / "AGENTS.md").write_text(
                "# Agents\n[broken](missing_agents.md)\n", encoding="utf-8"
            )
            (root / "ROADMAP.md").write_text(
                "# Roadmap\n[broken](missing_roadmap.md)\n", encoding="utf-8"
            )
            (root / "CHANGELOG.md").write_text(
                "# Changelog\n[broken](missing_changelog.md)\n",
                encoding="utf-8",
            )
            (root / "mcp-server" / "CHANGELOG.md").write_text(
                "# MCP Changelog\n[broken](missing_mcp_cl.md)\n",
                encoding="utf-8",
            )
            (ref_dir / "guide.md").write_text(
                "# Ref\n[broken](missing_ref.md)\n", encoding="utf-8"
            )

            link_errs = verify_docs.check_internal_markdown_links(root)
            for expected_broken in (
                "missing_coc.md",
                "missing_coc_es.md",
                "missing_agents.md",
                "missing_roadmap.md",
                "missing_changelog.md",
                "missing_mcp_cl.md",
                "missing_ref.md",
            ):
                self.assertTrue(
                    any(expected_broken in e for e in link_errs),
                    f"Faltó error de link roto para {expected_broken}: {link_errs}",
                )

            (root / "CODE_OF_CONDUCT.es.md").write_text(
                "# CoC ES\n## Uno\n## Dos\n", encoding="utf-8"
            )
            pair_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(
                any("CODE_OF_CONDUCT" in e for e in pair_errs),
                f"Se esperaba error de paridad CODE_OF_CONDUCT: {pair_errs}",
            )

    def test_check_historical_spec_links(self) -> None:
        """Valida enlaces relativos locales dentro de Specs históricas 01..18."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(verify_docs.check_historical_spec_links(root), [])

            specs_dir = root / "docs" / "specs"
            specs_dir.mkdir(parents=True)
            (root / "README.md").write_text("# Root\n", encoding="utf-8")
            (specs_dir / "README.es.md").write_text("# Specs ES\n", encoding="utf-8")
            (specs_dir / "19_SPEC_BILINGUAL.md").write_text(
                "[ignored](missing_19_target.md)\n", encoding="utf-8"
            )
            spec02 = specs_dir / "02_SPEC_HIST.md"
            spec02.write_text(
                "[Index](README.es.md)\n"
                "[Root](../../README.md#section)\n"
                "[Ext](https://example.com)\n"
                "[Anchor](#local-heading)\n"
                "```markdown\n[InFence](missing_in_fence.md)\n```\n"
                "`[Inline](missing_inline.md)`\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_historical_spec_links(root), [])

            spec02.write_text(
                "[Broken](missing_spec_target.md)\n"
                "[Escape](../../../../etc/passwd)\n",
                encoding="utf-8",
            )
            errs = verify_docs.check_historical_spec_links(root)
            self.assertTrue(any("missing_spec_target.md" in e for e in errs))
            self.assertTrue(any("fuera del repositorio" in e for e in errs))

    def test_specs_readme_mcp_surface_nginx_ui_11x_03_and_vitest_lcov_guards(
        self,
    ) -> None:
        """Valida guardas M4: Tool 19 / Resource 13, UI-11X-03 CORP y Vitest lcov."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. Sin archivos opcionales -> 0 errores
            self.assertEqual(verify_docs._check_specs_and_stack_contracts(root), [])

            # 2. Estado nominal completo -> 0 errores
            (root / "docs" / "specs").mkdir(parents=True)
            (root / "mcp-server" / "src" / "resources").mkdir(parents=True)
            (root / "docs" / "specs" / "README.md").write_text(
                "Tool 19 `session_flight_recorder` + "
                "`blueprint://skills/tactical-patterns-11x`.\n",
                encoding="utf-8",
            )
            (root / "docs" / "specs" / "README.es.md").write_text(
                "Tool 19 `session_flight_recorder` + "
                "`blueprint://skills/tactical-patterns-11x`.\n",
                encoding="utf-8",
            )
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "register('session_flight_recorder');\n", encoding="utf-8"
            )
            (
                root / "mcp-server"
                / "src"
                / "resources"
                / "tacticalPatternsSkill.ts"
            ).write_text(
                "export const URI = 'blueprint://skills/tactical-patterns-11x';\n",
                encoding="utf-8",
            )

            valid_nginx = (
                "server {\n"
                '  add_header Cross-Origin-Resource-Policy "same-origin" always;\n'
                "  location ~* \\.(?:js|mjs|css|woff2|woff|ttf|webp|avif)$ {\n"
                '    add_header Cross-Origin-Resource-Policy "same-origin" always;\n'
                "  }\n"
                "  location ~* \\.(?:ico|svg|png|webmanifest)$ {\n"
                '    add_header Cross-Origin-Resource-Policy "cross-origin" always;\n'
                "  }\n"
                "  location = /index.html {\n"
                '    add_header Cross-Origin-Resource-Policy "same-origin" always;\n'
                "  }\n"
                "}\n"
            )
            for fe in ("vue3", "react-frontend"):
                (root / fe / "nginx").mkdir(parents=True)
                (root / fe / "nginx" / "default.conf.example").write_text(
                    valid_nginx, encoding="utf-8"
                )
            for st in ("node-backend", "vue3", "react-frontend"):
                (root / st).mkdir(parents=True, exist_ok=True)
                (root / st / "vitest.config.ts.example").write_text(
                    "export default { test: { coverage: { "
                    "reporter: ['text', 'lcov'] } } };\n",
                    encoding="utf-8",
                )
            self.assertEqual(verify_docs._check_specs_and_stack_contracts(root), [])

            # 3. Regresiones detectadas: Tool 19/Resource 13, Nginx CORP, sin lcov
            (root / "docs" / "specs" / "README.md").write_text(
                "Tool 19 `audit_vibe_prototype`, Resource 13 `blueprint://calm`.\n",
                encoding="utf-8",
            )
            (root / "docs" / "specs" / "README.es.md").write_text(
                "Sin referencias.\n", encoding="utf-8"
            )
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "empty\n", encoding="utf-8"
            )
            (
                root / "mcp-server"
                / "src"
                / "resources"
                / "tacticalPatternsSkill.ts"
            ).write_text("empty\n", encoding="utf-8")
            (root / "vue3" / "nginx" / "default.conf.example").write_text(
                "server {\n"
                '  add_header Cross-Origin-Resource-Policy "cross-origin" always;\n'
                "}\n",
                encoding="utf-8",
            )
            (root / "node-backend" / "vitest.config.ts.example").write_text(
                "// reporter: ['lcov']\n"
                "export default { test: { coverage: { reporter: ['text'] } } };\n",
                encoding="utf-8",
            )

            active_errs = verify_docs.check_active_docs(root)
            self.assertTrue(any("blueprint://calm" in e for e in active_errs))
            self.assertTrue(any("audit_vibe_prototype" in e for e in active_errs))

            contract_errs = verify_docs._check_specs_and_stack_contracts(root)
            self.assertTrue(any("session_flight_recorder" in e for e in contract_errs))
            self.assertTrue(
                any("tactical-patterns-11x" in e for e in contract_errs)
            )
            self.assertTrue(any("server.ts" in e for e in contract_errs))
            self.assertTrue(
                any("tacticalPatternsSkill.ts" in e for e in contract_errs)
            )
            self.assertTrue(any("UI-11X-03" in e for e in contract_errs))
            self.assertTrue(any("strictamente" in e for e in contract_errs))
            self.assertTrue(any("reporter 'lcov'" in e for e in contract_errs))

    def test_testing_scoreboard_consistency_guard(self) -> None:
        import tempfile

        def _en_doc(
            *,
            stmts: str = "99.56%",
            s2_br: str = "96.74%",
            s2_fn: str = "99.87%",
            s2_ln: str = "99.56%",
            s2_tests: str = "708",
            s2_suites: str = "42",
            s4_tests: str = "708",
            s4_suites: str = "42",
            s4_ln: str = "99.56%",
            s4_br: str = "96.74%",
            s4_fn: str = "99.87%",
        ) -> str:
            return (
                f"* **Statements:** `{stmts}`\n"
                f"* **Branches:** `{s2_br}` global\n"
                f"* **Functions:** `{s2_fn}`\n"
                f"* **Lines:** `{s2_ln}`\n"
                f"* **Unit & Live Protocol Tests:** **{s2_tests} tests passing "
                f"at 100%** ({s2_suites} Vitest suites)\n"
                f"* **100% assertions passed** (**{s4_tests}** Vitest tests "
                f"across **{s4_suites} Vitest suites**)\n"
                f"* **{s4_ln} line/statement coverage and {s4_br} branch coverage**\n"
                f"* **{s4_fn} function coverage**.\n"
            )

        def _es_doc(
            *,
            stmts: str = "99.56%",
            s2_br: str = "96.74%",
            s2_fn: str = "99.87%",
            s2_ln: str = "99.56%",
            s2_tests: str = "708",
            s2_suites: str = "42",
            s4_tests: str = "708",
            s4_suites: str = "42",
            s4_ln: str = "99.56%",
            s4_br: str = "96.74%",
            s4_fn: str = "99.87%",
        ) -> str:
            return (
                f"* **Sentencias (Statements):** `{stmts}`\n"
                f"* **Ramas (Branches):** `{s2_br}` global\n"
                f"* **Funciones (Functions):** `{s2_fn}`\n"
                f"* **Líneas (Lines):** `{s2_ln}`\n"
                f"* **Pruebas Unitarias y Protocolo en Vivo:** **{s2_tests} "
                f"pruebas pasando al 100%** ({s2_suites} suites Vitest)\n"
                f"* **100% de aserciones aprobadas** (**{s4_tests}** pruebas "
                f"Vitest distribuidas en **{s4_suites} suites Vitest**)\n"
                f"* **{s4_ln} de cobertura de líneas/sentencias y {s4_br} "
                f"de cobertura de ramas**\n"
                f"* **{s4_fn} de cobertura de funciones**.\n"
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. Sin archivos -> 0 errores
            self.assertEqual(verify_docs.check_testing_scoreboard_consistency(root), [])

            # 2. Stub sin bloques scoreboard -> 0 errores
            (root / "TESTING.md").write_text("# Stub\n", encoding="utf-8")
            self.assertEqual(verify_docs.check_testing_scoreboard_consistency(root), [])

            # 3. Par nominal EN/ES coherente -> 0 errores
            (root / "TESTING.md").write_text(_en_doc(), encoding="utf-8")
            (root / "TESTING.es.md").write_text(_es_doc(), encoding="utf-8")
            self.assertEqual(verify_docs.check_testing_scoreboard_consistency(root), [])

            # 4. Desfase §2 vs §4 + Statements != Lines
            (root / "TESTING.md").write_text(
                _en_doc(stmts="99.10%", s2_br="96.83%", s2_tests="701"),
                encoding="utf-8",
            )
            (root / "TESTING.es.md").write_text(
                _es_doc(s2_tests="709"),
                encoding="utf-8",
            )
            errs = verify_docs.check_testing_scoreboard_consistency(root)
            self.assertTrue(
                any("Statements (99.10%) != Lines (99.56%)" in e for e in errs)
            )
            self.assertTrue(
                any(
                    "desfase §2 vs §4 en branches (96.83% != 96.74%)" in e
                    for e in errs
                )
            )
            self.assertTrue(
                any("desfase §2 vs §4 en tests (701 != 708)" in e for e in errs)
            )
            self.assertTrue(
                any(
                    "TESTING.md vs TESTING.es.md: desfase en tests (701 != 709)"
                    in e
                    for e in errs
                )
            )

    def test_consumer_mode_universal_invariants_warnings_and_historical_links(
        self,
    ) -> None:
        """Verifica modo consumidor (D5): budgets, WARN vendor y enlaces."""
        import io
        import tempfile
        from contextlib import redirect_stderr

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertFalse(verify_docs.is_upstream_blueprints_repo(root))

            vendor_skill = root / ".agents" / "skills" / "vendor-large" / "SKILL.md"
            vendor_skill.parent.mkdir(parents=True, exist_ok=True)
            vendor_skill.write_text("v" * 21_000, encoding="utf-8")

            (root / "docs" / "specs").mkdir(parents=True, exist_ok=True)
            (root / "CHANGELOG.md").write_text(
                "# Changelog\n"
                "[old rule](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md)\n",
                encoding="utf-8",
            )
            (root / "docs" / "specs" / "01_SPEC.md").write_text(
                "# Spec\n[old skill](../../.agents/skills/qa-11x-architect/SKILL.md)\n"
                "[outside](../../../../etc/passwd)\n",
                encoding="utf-8",
            )
            (root / "AGENTS.md").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_START -->\nok\n"
                f"<!-- QA_11X_MCP_CONNECTOR_END -->\n{'a' * 9_000}\n",
                encoding="utf-8",
            )

            stderr_buf = io.StringIO()
            with redirect_stderr(stderr_buf):
                errs = verify_docs.validate_repository_docs(root)

            self.assertIn("WARN [Docs Invariants]", stderr_buf.getvalue())
            self.assertEqual(
                [e for e in errs if "fuera del repositorio" not in e], []
            )
            self.assertTrue(any("fuera del repositorio" in e for e in errs))

            # Conector >1536B, marcadores inválidos y enlace activo roto fallan
            (root / "AGENTS.md").write_text(
                f"<!-- QA_11X_MCP_CONNECTOR_START -->\n{'x' * 1600}\n"
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n"
                "[broken](.agents/rules/mandatory_qa_pyramid_and_doc_sync.md)\n",
                encoding="utf-8",
            )
            (root / "docs" / "specs" / "01_SPEC.md").unlink()
            bad_errs = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("excede 1536 bytes" in e for e in bad_errs))
            self.assertTrue(any("enlace interno roto" in e for e in bad_errs))

            (root / "AGENTS.md").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_START -->\n1\n"
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n"
                "<!-- QA_11X_MCP_CONNECTOR_START -->\n2\n"
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n",
                encoding="utf-8",
            )
            dup_errs = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("duplicados" in e for e in dup_errs))

            (root / "AGENTS.md").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_END -->\n"
                "<!-- QA_11X_MCP_CONNECTOR_START -->\n",
                encoding="utf-8",
            )
            inv_errs = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("invertidos" in e for e in inv_errs))

            (root / "AGENTS.md").write_text(
                "<!-- QA_11X_MCP_CONNECTOR_START -->\n", encoding="utf-8"
            )
            unbal_errs = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("desbalanceados" in e for e in unbal_errs))

            # Upstream sí bloquea vendor >=20KB y AGENTS.md >8192B
            (root / "scripts").mkdir(parents=True, exist_ok=True)
            (root / "scripts" / "generar-manifiesto.py").write_text(
                "# up\n", encoding="utf-8"
            )
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / "AGENTS.md").write_text("z" * 9_000, encoding="utf-8")
            up_errs = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(any("vendor-large/SKILL.md" in e for e in up_errs))
            self.assertTrue(any("presupuesto cognitivo" in e for e in up_errs))

    def test_skill_backtick_references_and_claude_plugin_manifests(self) -> None:
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_dir = root / ".agents" / "skills" / "qa-11x-architect"
            (skill_dir / "references").mkdir(parents=True, exist_ok=True)
            (skill_dir / "references" / "01-core.md").write_text(
                "# 01\n", encoding="utf-8"
            )
            (skill_dir / "SKILL.md").write_text(
                "Load `references/01..10.md` or `references/01-core.md`.\n"
                "Sibling `qa-11x-devsecops-hardener` "
                "(`references/stig_rls_vault.md`).\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs._check_skill_backtick_references(root), [])

            (skill_dir / "SKILL.md").write_text(
                "Broken `references/missing-doc.md`.\n",
                encoding="utf-8",
            )
            ref_errs = verify_docs._check_skill_backtick_references(root)
            self.assertEqual(len(ref_errs), 1)
            self.assertIn("missing-doc.md", ref_errs[0])

            # Consumer repo without .claude-plugin passes cleanly
            self.assertEqual(verify_docs._check_claude_plugin_manifests(root), [])

            # Upstream repo with .claude-plugin validates plugin.json & marketplace.json
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "package.json").write_text(
                json.dumps({"version": "3.5.0"}), encoding="utf-8"
            )
            cp_dir = root / ".claude-plugin"
            cp_dir.mkdir(parents=True, exist_ok=True)
            missing_errs = verify_docs._check_claude_plugin_manifests(root)
            self.assertEqual(len(missing_errs), 2)

            (cp_dir / "plugin.json").write_text(
                '{"version": "3.4.0", "skills": "./wrong"}', encoding="utf-8"
            )
            (cp_dir / "marketplace.json").write_text(
                '{"plugins": []}', encoding="utf-8"
            )
            bad_errs = verify_docs._check_claude_plugin_manifests(root)
            self.assertGreaterEqual(len(bad_errs), 3)

            (cp_dir / "plugin.json").write_text(
                '{"version": "3.5.0", "version": "3.5.0"}', encoding="utf-8"
            )
            (cp_dir / "marketplace.json").write_text(
                '{"plugins": ["bad"]}', encoding="utf-8"
            )
            dup_errs = verify_docs._check_claude_plugin_manifests(root)
            self.assertEqual(len(dup_errs), 2)

            (cp_dir / "plugin.json").write_text(
                json.dumps({"version": "3.5.0", "skills": "./.agents/skills"}),
                encoding="utf-8",
            )
            (cp_dir / "marketplace.json").write_text(
                json.dumps({"plugins": [{"name": "qa-11x", "version": "3.4.0"}]}),
                encoding="utf-8",
            )
            mismatch_errs = verify_docs._check_claude_plugin_manifests(root)
            self.assertEqual(len(mismatch_errs), 1)

            (cp_dir / "marketplace.json").write_text(
                '{"plugins": [], "plugins": []}', encoding="utf-8"
            )
            self.assertTrue(verify_docs._check_claude_plugin_manifests(root))

            (cp_dir / "marketplace.json").write_text(
                json.dumps({"plugins": [{"name": "qa-11x", "version": "3.5.0"}]}),
                encoding="utf-8",
            )
            self.assertEqual(verify_docs._check_claude_plugin_manifests(root), [])

    def test_markdown_fence_balance_detects_unclosed_fences(self) -> None:
        """Verifica detección de bloques cercados Markdown desbalanceados (anti-H29)."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_doc = root / ".agents" / "skills" / "demo" / "SKILL.md"
            skill_doc.parent.mkdir(parents=True, exist_ok=True)
            skill_doc.write_text("# OK\n```bash\necho ok\n```\n", encoding="utf-8")
            self.assertEqual(verify_docs._check_markdown_fence_balance(root), [])

            broken_doc = root / "docs" / "broken.md"
            broken_doc.parent.mkdir(parents=True, exist_ok=True)
            broken_doc.write_text(
                "# Bad\n```makefile\nqa:\n\techo hi\n```\nextra\n```\n",
                encoding="utf-8",
            )
            errs = verify_docs._check_markdown_fence_balance(root)
            self.assertEqual(len(errs), 1)
            self.assertIn("docs/broken.md:7:", errs[0])

            # Half-missing TESTING.md scoreboard (§2 sin §4) debe fallar
            (root / "TESTING.md").write_text(
                "* **Sentencias (Statements):** `99.60%`\n"
                "* **Ramas (Branches):** `96.75%` global\n"
                "* **Funciones (Functions):** `99.88%`\n"
                "* **Líneas (Lines):** `99.60%`\n"
                "* **Pruebas Unitarias y Protocolo en Vivo:** "
                "**741 pruebas pasando al 100%** (43 suites Vitest)\n",
                encoding="utf-8",
            )
            tb_errs = verify_docs.check_testing_scoreboard_consistency(root)
            self.assertTrue(
                any("marcador de cobertura incompleto" in e for e in tb_errs)
            )

            # Referencia cruzada a skill hermano presente + rota local en misma línea
            sib_dir = root / ".agents" / "skills" / "qa-11x-sibling" / "references"
            sib_dir.mkdir(parents=True, exist_ok=True)
            (sib_dir / "real.md").write_text("# ok\n", encoding="utf-8")
            (skill_doc).write_text(
                "See `qa-11x-sibling` (`references/real.md`) "
                "and `references/ghost.md`.\n",
                encoding="utf-8",
            )
            ref_errs = verify_docs._check_skill_backtick_references(root)
            self.assertEqual(len(ref_errs), 1)
            self.assertIn("references/ghost.md", ref_errs[0])

    def test_mcp_registry_manifest_validation_and_parity(self) -> None:
        """Valida esquema 2025-12-11, límites y paridad server.json ↔ package.json."""
        import json
        import tempfile

        schema_url = (
            "https://static.modelcontextprotocol.io/schemas/"
            "2025-12-11/server.schema.json"
        )
        valid_server: dict[str, object] = {
            "$schema": schema_url,
            "name": "io.github.tecno-consultores/mcp-qa-11x",
            "description": "Enterprise QA & DevSecOps MCP server.",
            "version": "3.9.0",
            "repository": {
                "url": "https://github.com/tecno-consultores/qa-testing-blueprints",
                "source": "github",
                "subfolder": "mcp-server",
            },
            "packages": [
                {
                    "registryType": "npm",
                    "identifier": "@sinfallas/mcp-qa-11x",
                    "version": "3.9.0",
                    "transport": {"type": "stdio"},
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # Sin server.json ni package.json -> pasa vacío
            self.assertEqual(verify_docs._check_mcp_registry_manifest(root), [])

            mcp_dir = root / "mcp-server"
            mcp_dir.mkdir(parents=True)
            pkg = mcp_dir / "package.json"
            pkg.write_text('{"name": "a", "name": "b"}', encoding="utf-8")
            self.assertIn(
                "JSON inválido", verify_docs._check_mcp_registry_manifest(root)[0]
            )

            pkg.write_text(
                json.dumps({"name": "@sinfallas/mcp-qa-11x", "version": "3.9.0"}),
                encoding="utf-8",
            )
            self.assertEqual(verify_docs._check_mcp_registry_manifest(root), [])

            pkg.write_text(
                json.dumps(
                    {
                        "name": "@sinfallas/mcp-qa-11x",
                        "version": "3.9.0",
                        "mcpName": "io.github.tecno-consultores/mcp-qa-11x",
                    }
                ),
                encoding="utf-8",
            )
            missing_errs = verify_docs._check_mcp_registry_manifest(root)
            self.assertEqual(len(missing_errs), 1)
            self.assertIn("archivo obligatorio ausente", missing_errs[0])

            srv = root / "server.json"
            srv.write_text('{"version": "1", "version": "2"}', encoding="utf-8")
            self.assertIn(
                "JSON inválido", verify_docs._check_mcp_registry_manifest(root)[0]
            )

            srv.write_text(
                json.dumps(
                    {
                        "$schema": "https://example.invalid/old.json",
                        "name": "bad-name",
                        "description": "x" * 101,
                        "version": "3.0.0",
                        "repository": {"source": "gitlab"},
                        "packages": "not-a-list",
                    }
                ),
                encoding="utf-8",
            )
            bad_errs = verify_docs._check_mcp_registry_manifest(root)
            self.assertGreaterEqual(len(bad_errs), 7)

            srv.write_text(
                json.dumps({**valid_server, "packages": [{"registryType": "pypi"}]}),
                encoding="utf-8",
            )
            self.assertTrue(
                any(
                    "registryType='npm'" in e
                    for e in verify_docs._check_mcp_registry_manifest(root)
                )
            )

            srv.write_text(
                json.dumps(
                    {
                        **valid_server,
                        "packages": [
                            {
                                "registryType": "npm",
                                "identifier": "@other/pkg",
                                "version": "1.0.0",
                                "transport": {"type": "sse"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            pkg_errs = verify_docs._check_mcp_registry_manifest(root)
            self.assertEqual(len(pkg_errs), 3)

            srv.write_text(json.dumps(valid_server), encoding="utf-8")
            self.assertEqual(verify_docs._check_mcp_registry_manifest(root), [])

    def test_canonical_mcp_tools_and_live_repo_counts_validators(self) -> None:
        """Valida CANONICAL_MCP_TOOLS y conteos vivos en llms/RESOURCES/TESTING."""
        import json
        import tempfile

        from _docs_invariants_catalogs import (
            _check_canonical_mcp_tools_sync,
            _check_llms_and_agents_surface_counts,
            _check_resources_inventory_counts,
            check_testing_scoreboard_consistency,
        )
        from _docs_invariants_config import CANONICAL_MCP_TOOLS

        skillsllm = json.loads(
            (REPO_ROOT / "catalogs" / "skillsllm-manifest.json").read_text(
                encoding="utf-8"
            )
        )
        real_tools = skillsllm["mcp_capabilities"]["tools"]
        self.assertEqual(len(CANONICAL_MCP_TOOLS), 20)
        self.assertEqual(CANONICAL_MCP_TOOLS, frozenset(real_tools))

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # Consumer repo ignora chequeos exclusivos de upstream
            self.assertEqual(_check_canonical_mcp_tools_sync(root, ["fake_tool"]), [])
            self.assertEqual(_check_llms_and_agents_surface_counts(root), [])
            self.assertEqual(_check_resources_inventory_counts(root), [])

            # Marcar como upstream repo
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / ".agents" / "scripts").mkdir(parents=True)
            (root / ".agents" / "scripts" / "sync_governance.py").write_text(
                "# ok\n", encoding="utf-8"
            )
            (root / "scripts").mkdir()
            (root / "scripts" / "generar-manifiesto.py").write_text(
                "# ok\n", encoding="utf-8"
            )
            (root / "scripts" / "audit-edge.sh.example").write_text(
                "# ok\n", encoding="utf-8"
            )
            (root / "tests" / "bats").mkdir(parents=True)
            (root / "tests" / "bats" / "sample.bats").write_text(
                '@test "one" {\n  true\n}\n@test "two" {\n  true\n}\n',
                encoding="utf-8",
            )
            mcp_tests_dir = root / "mcp-server" / "tests"
            mcp_tests_dir.mkdir(parents=True)
            (mcp_tests_dir / "a.unit.ts").write_text("", encoding="utf-8")
            (mcp_tests_dir / "b.test.ts").write_text("", encoding="utf-8")
            (root / "mcp-server" / "test").mkdir(parents=True)
            (root / "mcp-server" / "test" / "mcp_cli_test.feature").write_text(
                "Feature: Demo\n  Scenario: S1\n    * assert true\n",
                encoding="utf-8",
            )

            sync_err = _check_canonical_mcp_tools_sync(root, ["only_one"])
            self.assertEqual(len(sync_err), 1)
            self.assertIn("CANONICAL_MCP_TOOLS desfasado", sync_err[0])
            self.assertEqual(
                _check_canonical_mcp_tools_sync(root, sorted(CANONICAL_MCP_TOOLS)), []
            )

            # Desfase en llms.txt y RESOURCES.md
            (root / "llms.txt").write_text(
                "`99` scripts in `scripts/`, `1` files in `.agents/scripts/`, "
                "`1` files in `tests/`\n",
                encoding="utf-8",
            )
            self.assertEqual(len(_check_llms_and_agents_surface_counts(root)), 1)
            (root / "llms.txt").write_text(
                "`2` scripts in `scripts/`, `1` files in `.agents/scripts/`, "
                "`1` files in `tests/`\n",
                encoding="utf-8",
            )
            self.assertEqual(_check_llms_and_agents_surface_counts(root), [])

            (root / "RESOURCES.md").write_text(
                "(`.agents/scripts/` — 9 files)\n"
                "(`scripts/` — 1 files): generar-manifiesto.py\n",
                encoding="utf-8",
            )
            res_errs = _check_resources_inventory_counts(root)
            self.assertEqual(len(res_errs), 3)

            (root / "RESOURCES.md").write_text(
                "(`.agents/scripts/` — 1 files)\n(`scripts/` — 2 files): "
                "generar-manifiesto.py audit-edge.sh.example\n",
                encoding="utf-8",
            )
            self.assertEqual(_check_resources_inventory_counts(root), [])

            # Desfase en TESTING.md contra conteos vivos (2 suites, 1 scenario, 2 BATS)
            (root / "TESTING.md").write_text(
                "| `make test-mcp` | Vitest (`>= 95%`, 1 suites), "
                "Karate Labs BDD (`9` scenarios) |\n"
                "* **Statements:** `99.00%`\n* **Branches:** `97.00%`\n"
                "* **Functions:** `99.00%`\n* **Lines:** `99.00%`\n"
                "* **Unit:** **10 tests passing at 100%** (1 Vitest suites)\n"
                "**9 Karate BDD scenarios** and **99 BATS tests**\n"
                "**10** Vitest tests across **1 Vitest suites**\n"
                "**99.00% line/statement coverage and 97.00% branch coverage**\n"
                "**99.00% function coverage**\n",
                encoding="utf-8",
            )
            t_errs = check_testing_scoreboard_consistency(root)
            self.assertGreaterEqual(len(t_errs), 4)

            # Esqueleto upstream sin .agents/scripts/, tests/ ni mcp-server/
            empty_up = root / "empty_upstream"
            (empty_up / "scripts").mkdir(parents=True)
            (empty_up / "manifest.json").write_text("{}", encoding="utf-8")
            (empty_up / "scripts" / "generar-manifiesto.py").write_text(
                "# ok\n", encoding="utf-8"
            )
            (empty_up / "llms.txt").write_text(
                "`1` scripts in `scripts/`, `0` files in `.agents/scripts/`, "
                "`0` files in `tests/`\n",
                encoding="utf-8",
            )
            (empty_up / "TESTING.md").write_text(
                "* **Statements:** `99.00%`\n* **Branches:** `97.00%`\n"
                "* **Functions:** `99.00%`\n* **Lines:** `99.00%`\n"
                "* **Unit:** **10 tests passing at 100%** (1 Vitest suites)\n"
                "**10** Vitest tests across **1 Vitest suites**\n"
                "**99.00% line/statement coverage and 97.00% branch coverage**\n"
                "**99.00% function coverage**\n",
                encoding="utf-8",
            )
            self.assertEqual(_check_llms_and_agents_surface_counts(empty_up), [])
            self.assertEqual(check_testing_scoreboard_consistency(empty_up), [])

            # Heredoc con comentario # <<EOF, here-string <<< y escape <<\EOF en BATS
            from _docs_invariants_catalogs import (
                _count_bats_file_tests,
                _extract_live_mcp_tool_names,
            )

            bats_tricky = (
                "# Comentario con <<EOF que no abre heredoc\n"
                '@test "caso real 1" {\n'
                '  grep ok <<< "here-string"\n'
                "  cat <<\\EOF > /tmp/f\n"
                '@test "falso dentro de heredoc escapado" {\n'
                "EOF\n"
                "}\n"
                '@test "caso real 2" {\n'
                "  true\n"
                "}\n"
            )
            self.assertEqual(_count_bats_file_tests(bats_tricky), 2)

            # Desfase entre CANONICAL_MCP_TOOLS y registros reales en mcp-server/src
            (root / "mcp-server" / "src").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('ghost_live_tool', 'd', {}, fn);\n"
                "export const V2_TOOL_REGISTRATIONS = [\n"
                "  SESSION_FLIGHT_RECORDER_TOOL,\n"
                "];\n",
                encoding="utf-8",
            )
            self.assertEqual(
                _extract_live_mcp_tool_names(root),
                frozenset({"ghost_live_tool", "session_flight_recorder"}),
            )
            live_sync_errs = _check_canonical_mcp_tools_sync(
                root, sorted(CANONICAL_MCP_TOOLS)
            )
            self.assertEqual(len(live_sync_errs), 1)
            self.assertIn("mcp-server/src", live_sync_errs[0])

    def test_llms_defense_in_depth_count_validator(self) -> None:
        import tempfile

        from _docs_invariants_catalogs import _check_llms_defense_in_depth_count

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. Consumer repo (sin manifest.json) se ignora
            self.assertEqual(_check_llms_defense_in_depth_count(root), [])

            # 2. Upstream repo sin llms.txt o sin SECURITY.md -> []
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir()
            (root / "scripts" / "generar-manifiesto.py").write_text(
                "# ok\n", encoding="utf-8"
            )
            self.assertEqual(_check_llms_defense_in_depth_count(root), [])
            (root / "llms.txt").write_text("- [SECURITY.md](x)\n", encoding="utf-8")
            self.assertEqual(_check_llms_defense_in_depth_count(root), [])

            # 3. SECURITY.md sin subsecciones 4.N:
            #    - si llms.txt no afirma un conteo -> []
            #    - si llms.txt afirma 34 pero SECURITY.md tiene 0 -> error
            (root / "SECURITY.md").write_text("# Security\n", encoding="utf-8")
            self.assertEqual(_check_llms_defense_in_depth_count(root), [])
            (root / "llms.txt").write_text(
                "- [SECURITY.md](x) — policy and 34 defense-in-depth requirements.\n",
                encoding="utf-8",
            )
            zero_live_err = _check_llms_defense_in_depth_count(root)
            self.assertEqual(len(zero_live_err), 1)
            self.assertIn("(34) != vivo en SECURITY.md (0)", zero_live_err[0])

            # 4. SECURITY.md con 2 subsecciones (+ código/comentarios ignorados)
            #    pero llms.txt omite el conteo -> error
            (root / "llms.txt").write_text("- [SECURITY.md](x)\n", encoding="utf-8")
            (root / "SECURITY.md").write_text(
                "### 4.1. Primero\nTexto\n### 4.2. Segundo\n"
                "```markdown\n### 4.3. Ejemplo en bloque\n```\n"
                "<!--\n### 4.4. Borrador comentado\n-->\n",
                encoding="utf-8",
            )
            missing_err = _check_llms_defense_in_depth_count(root)
            self.assertEqual(len(missing_err), 1)
            self.assertIn("falta conteo", missing_err[0])

            # 5. Conteo desfasado (33 vs 2 vivos) -> error
            (root / "llms.txt").write_text(
                "- [SECURITY.md](x) — policy and 33 defense-in-depth requirements.\n",
                encoding="utf-8",
            )
            stale_err = _check_llms_defense_in_depth_count(root)
            self.assertEqual(len(stale_err), 1)
            self.assertIn("(33) != vivo en SECURITY.md (2)", stale_err[0])

            # 6. Conteo sincronizado (2 == 2, ignorando bloques/comentarios) -> []
            (root / "llms.txt").write_text(
                "- [SECURITY.md](x) — policy and 2 defense-in-depth requirements.\n",
                encoding="utf-8",
            )
            self.assertEqual(_check_llms_defense_in_depth_count(root), [])

    def test_testing_scoreboard_live_python_counts(self) -> None:
        import tempfile

        from _docs_invariants_catalogs import check_testing_scoreboard_consistency

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "manifest.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir(parents=True)
            (root / "scripts" / "generar-manifiesto.py").write_text(
                "# ok\n", encoding="utf-8"
            )
            (root / "tests" / "meta_qa" / "fixtures").mkdir(parents=True)
            (root / "vibe-rescue" / "tests").mkdir(parents=True)
            (
                root / "tests" / "meta_qa" / "fixtures" / "broken_repo_seed.json"
            ).write_text(
                '{"seeded_failures": {"f1": {}, "f2": {}}}\n', encoding="utf-8"
            )
            (root / "tests" / "test_alpha.unit.py").write_text(
                "import unittest\n"
                "CASES: tuple[str, ...] = ('a', 'b', 'c')\n"
                "OTHER = 123\n"
                "a = b = [1, 2]\n\n"
                "def helper(*_args: object) -> object:\n"
                "    return lambda f: f\n\n"
                "@helper\n"
                "@helper(1, 2)\n"
                "@(helper())(1, 2)\n"
                "@pytest.mark.parametrize('x', ['p', 'q'])\n"
                "async def test_top_async(x: str) -> None:\n"
                "    pass\n\n"
                "class Helper:\n"
                "    def test_ignored(self) -> None:\n"
                "        pass\n\n"
                "class TestAlpha(unittest.TestCase):\n"
                "    @parametrize('c', CASES)\n"
                "    @parametrize('u', UNKNOWN_CONST)\n"
                "    def test_method(self, c: str, u: str) -> None:\n"
                "        pass\n",
                encoding="utf-8",
            )
            (root / "tests" / "meta_qa" / "test_meta.py").write_text(
                "@pytest.mark.parametrize('fid', SEEDED_FAILURE_IDS)\n"
                "def test_seeded(fid: str) -> None:\n"
                "    pass\n",
                encoding="utf-8",
            )
            (root / "vibe-rescue" / "tests" / "test_vibe.py").write_text(
                "def test_v1() -> None:\n    pass\n",
                encoding="utf-8",
            )
            # Live Python counts: root_meta = 2 + 3 + 2 = 7, vibe = 1, combined = 8
            scoreboard_hdr = (
                "* **Statements:** `99.00%`\n* **Branches:** `97.00%`\n"
                "* **Functions:** `99.00%`\n* **Lines:** `99.00%`\n"
                "* **Unit:** **10 tests passing at 100%** (1 Vitest suites)\n"
            )
            scoreboard_tail = (
                "**10** Vitest tests across **1 Vitest suites**\n"
                "**99.00% line/statement coverage and 97.00% branch coverage**\n"
                "**99.00% function coverage**\n"
            )
            (root / "TESTING.md").write_text(
                scoreboard_hdr
                + "(**6 tests collected**)\n"
                + "**6** Python unit + Meta-QA + Vibe-Rescue tests\n"
                + "+ **5** Python unit & Meta-QA tests + **2** Vibe-Rescue\n"
                + scoreboard_tail,
                encoding="utf-8",
            )
            errs = check_testing_scoreboard_consistency(root)
            self.assertEqual(len(errs), 4)
            (root / "TESTING.md").write_text(
                scoreboard_hdr
                + "(**8 tests collected**)\n"
                + "**8** Python unit + Meta-QA + Vibe-Rescue tests\n"
                + "+ **7** Python unit & Meta-QA tests + **1** Vibe-Rescue\n"
                + scoreboard_tail,
                encoding="utf-8",
            )
            self.assertEqual(check_testing_scoreboard_consistency(root), [])

    def test_plugin_skills_badge_and_ai_integration_tools(self) -> None:
        import json
        import tempfile

        from _docs_invariants_catalogs import (
            _check_ai_integration_tools_surface,
            _check_plugin_manifest_skills,
        )
        from _docs_invariants_counts import check_stale_surface_counts

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".claude-plugin").mkdir(parents=True)
            (root / "docs").mkdir(parents=True)
            (root / "README.md").write_text(
                "![Skills](https://img.shields.io/badge/AI%20Skills-11%20Modular-blue)\n",
                encoding="utf-8",
            )
            badge_errs = check_stale_surface_counts(root)
            self.assertTrue(any("11 skills" in e for e in badge_errs))

            (root / ".claude-plugin" / "plugin.json").write_text(
                json.dumps({"description": "QA-11X: 11 Modular Skills"}),
                encoding="utf-8",
            )
            (root / ".claude-plugin" / "marketplace.json").write_text(
                json.dumps({"plugins": [{"description": "11 Modular Skills"}]}),
                encoding="utf-8",
            )
            plug_errs = _check_plugin_manifest_skills(root, 12)
            self.assertEqual(len(plug_errs), 2)

            (root / "docs" / "ai-integration.md").write_text(
                "# MCP Tools\n`certify_11x_gate`\n", encoding="utf-8"
            )
            ai_errs = _check_ai_integration_tools_surface(
                root, ["certify_11x_gate", "analyze_ecosystem_specs"]
            )
            self.assertEqual(len(ai_errs), 1)
            self.assertIn("analyze_ecosystem_specs", ai_errs[0])


if __name__ == "__main__":
    unittest.main()
