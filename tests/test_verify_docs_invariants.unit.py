# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para .agents/scripts/verify_docs_invariants.py."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / ".agents" / "scripts" / "verify_docs_invariants.py"

spec = importlib.util.spec_from_file_location("verify_docs_invariants", SCRIPT_PATH)
assert spec is not None and spec.loader is not None
verify_docs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_docs)


class TestVerifyDocsInvariants(unittest.TestCase):
    def test_live_repository_passes_all_invariants(self) -> None:
        errors = verify_docs.validate_repository_docs(REPO_ROOT)
        self.assertEqual(errors, [])
        self.assertEqual(verify_docs.main([str(REPO_ROOT)]), 0)

    def test_all_registered_core_manuals_and_doc_targets_exist_on_disk(self) -> None:
        self.assertIn("docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md", verify_docs.DOC_TARGETS)
        self.assertIn(".agents/README.md", verify_docs.DOC_TARGETS)
        for rel in verify_docs.HUMAN_CORE_MANUALS:
            self.assertTrue((REPO_ROOT / rel).is_file(), f"Manual inexistente en HUMAN_CORE_MANUALS: {rel}")
        for rel in verify_docs.DOC_TARGETS:
            self.assertTrue((REPO_ROOT / rel).is_file(), f"Documento inexistente en DOC_TARGETS: {rel}")

    def test_detects_bloated_skill_md_and_active_task(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_file = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
            skill_file.parent.mkdir(parents=True, exist_ok=True)
            skill_file.write_text("X" * 20_500, encoding="utf-8")

            active_task = root / ".agents" / "ACTIVE_TASK.md.example"
            active_task.write_text("\n".join(f"- [ ] line {i}" for i in range(45)), encoding="utf-8")

            errors = verify_docs.validate_repository_docs(root)
            self.assertEqual(len(errors), 2)
            self.assertEqual(verify_docs.main([str(root)]), 1)

    def test_detects_duplicate_security_headers_and_stale_patterns(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)
            (root / "SECURITY.md").write_text(
                "### 4.10. Uno\nTexto\n### 4.10. Dos\nTexto\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text("Conecta 8 Resources vía stdio y uv pip audit.\n", encoding="utf-8")
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
            auditor = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
            auditor.parent.mkdir(parents=True, exist_ok=True)
            auditor.write_text("const f = { rule_id: 'QA-ORPHAN-99' };\n", encoding="utf-8")

            sec_md = root / "SECURITY.md"
            sec_md.write_text("### 4.1. Documentado SEC-01\n", encoding="utf-8")
            (root / "SECURITY.es.md").write_text("### 4.1. Documentado SEC-01\n", encoding="utf-8")

            errors = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("QA-ORPHAN-99" in e and "manuales humanos" in e for e in errors))
            self.assertTrue(any("QA-ORPHAN-99" in e and "manuales espejo ES" in e for e in errors))

    def test_detects_architect_12kb_cap_other_20kb_cap_and_graphify_profile(self) -> None:
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
            self.assertTrue(any("qa-11x-architect/SKILL.md" in e for e in ok_other_errors))
            self.assertFalse(any("refactoring-ui/SKILL.md" in e for e in ok_other_errors))

            other_skill.write_text("b" * 20_479, encoding="utf-8")
            self.assertFalse(
                any("refactoring-ui/SKILL.md" in e for e in verify_docs.check_cognitive_budgets(root))
            )
            other_skill.write_text("b" * 20_500, encoding="utf-8")
            both_errors = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(any("refactoring-ui/SKILL.md" in e for e in both_errors))

            readme = root / "README.md"
            readme.write_text("Run docker compose --profile graphify up\n", encoding="utf-8")
            doc_errors = verify_docs.check_active_docs(root)
            self.assertTrue(any("--profile graphify" in e for e in doc_errors))

    def test_checks_mcp_readme_and_agent_setup_bilingual_cross_links(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.es.md").write_text("**Español** -> [README.md](README.md)\n", encoding="utf-8")
            (root / "README.md").write_text("**English** -> [README.es.md](README.es.md)\n", encoding="utf-8")
            (root / "mcp-server").mkdir()
            (root / "mcp-server" / "README.md").write_text("**English** -> [README.es.md](README.es.md)\n", encoding="utf-8")
            (root / "mcp-server" / "README.es.md").write_text("Missing English backlink\n", encoding="utf-8")
            (root / "docs").mkdir()
            (root / "docs" / "agent-setup.en.md").write_text("**English** -> [agent-setup.md](agent-setup.md)\n", encoding="utf-8")
            (root / "docs" / "agent-setup.md").write_text("**Español** -> [agent-setup.en.md](agent-setup.en.md)\n", encoding="utf-8")

            errors = verify_docs.check_bilingual_readme_parity(root)
            self.assertTrue(any("mcp-server/README.es.md" in e for e in errors))
            self.assertFalse(any("agent-setup" in e for e in errors))

            (root / "mcp-server" / "README.es.md").write_text("**Español** -> [README.md](README.md)\n", encoding="utf-8")
            self.assertEqual(verify_docs.check_bilingual_readme_parity(root), [])

    def test_detects_bilingual_agent_setup_and_pair_parity_mismatches(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "README.md").write_text("**English** -> [README.es.md](README.es.md)\n", encoding="utf-8")
            (root / "README.es.md").write_text("**Español** -> [README.md](README.md)\n", encoding="utf-8")
            (root / "docs" / "agent-setup.md").write_text("**English** -> [agent-setup.es.md](agent-setup.es.md)\n", encoding="utf-8")
            (root / "docs" / "agent-setup.es.md").write_text("Missing link\n", encoding="utf-8")

            readme_errs = verify_docs.check_bilingual_readme_parity(root)
            self.assertTrue(any("agent-setup.es.md" in e for e in readme_errs))

            (root / "docs" / "agent-setup.es.md").write_text("**Español** -> [agent-setup.md](agent-setup.md)\n", encoding="utf-8")
            self.assertEqual(verify_docs.check_bilingual_readme_parity(root), [])

            # Par nominal con código cercado y comentario HTML ignorados al contar H2/H3
            (root / "TESTING.md").write_text(
                "> 🌐 **English** | [TESTING.es.md](TESTING.es.md)\n\n"
                "## Section 1\n### Detail A\n\n"
                "```bash\n## comment inside code\n```\n"
                "<!-- ## comment inside html -->\n"
                "Control SEC-01 and blueprint://core/philosophy\n",
                encoding="utf-8",
            )
            (root / "TESTING.es.md").write_text(
                "> 🌐 **Español** | [TESTING.md](TESTING.md)\n\n"
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

            # Cuando existe RESOURCES.es.md se exige el conjunto completo BILINGUAL_DOC_PAIRS
            (root / "RESOURCES.es.md").write_text(
                "> 🌐 **Español** | [RESOURCES.md](RESOURCES.md)\n",
                encoding="utf-8",
            )
            missing_errs = verify_docs.check_bilingual_pair_parity(root)
            self.assertTrue(any("Par bilingüe incompleto/vacío" in e for e in missing_errs))

    def test_detects_tactical_patterns_2560b_and_active_task_rule_25l(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tactical = root / ".agents" / "skills" / "tactical-patterns-11x" / "SKILL.md"
            tactical.parent.mkdir(parents=True, exist_ok=True)
            tactical.write_text("x" * 2_560, encoding="utf-8")

            rule = root / ".agents" / "rules" / "active_task_and_planning_resilience.md"
            rule.parent.mkdir(parents=True, exist_ok=True)
            rule.write_text("\n".join(f"- rule {i}" for i in range(15)) + "\n", encoding="utf-8")

            self.assertEqual(verify_docs.check_cognitive_budgets(root), [])

            tactical.write_text("x" * 2_561, encoding="utf-8")
            rule.write_text("\n".join(f"- rule {i}" for i in range(26)) + "\n", encoding="utf-8")
            errs = verify_docs.check_cognitive_budgets(root)
            self.assertTrue(any("tactical-patterns-11x/SKILL.md" in e for e in errs))
            self.assertTrue(any("active_task_and_planning_resilience.md" in e for e in errs))

    def test_derives_dynamic_counts_from_repo_and_resolves_const_auditor_rules(self) -> None:
        import json
        import tempfile

        counts = verify_docs.derive_expected_counts(REPO_ROOT)
        self.assertEqual(counts.skills, 11)
        self.assertEqual(counts.tools, 19)
        self.assertEqual(counts.resources, 13)
        self.assertEqual(counts.blueprints, 10)
        self.assertEqual(counts.calm_controls, 7)
        self.assertEqual(counts.ref_controls, 22)
        self.assertEqual(counts.scanner_rules, 34)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
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

            # Casos válidos sin falsos positivos (sub-skills, 22 reference controls, 29+5=34, 12 environments, 7 stacks)
            (root / "README.md").write_text(
                "# OK\n"
                "Loads 10 specialized sub-skills and 9 sub-skills with SHA-256 skills.\n"
                "Enforces 22 reference controls, 22 controls, 29+5=34 scanner rules.\n"
                "Covers 12 environments, 7 controls (CALM), 7 stacks, Top 10 blueprint.\n"
                "Historical: `18` MCP tools and `12` MCP resources, 12 core v1 tools, 7 v2.0/v3.1 tools.\n",
                encoding="utf-8",
            )
            # Specs históricas 01..18 y CHANGELOG pasado no deben disparar errores
            (root / "docs" / "specs" / "18_SPEC_HIST.md").write_text(
                "Preserves 18 tools / 12 resources and Appium 2.\n", encoding="utf-8"
            )
            (root / "CHANGELOG.md").write_text(
                "## [Unreleased]\n- Ok\n\n## [2.21.0]\n- Legacy 18 tools / 12 resources and Appium 2\n",
                encoding="utf-8",
            )
            self.assertEqual(verify_docs.check_stale_surface_counts(root), [])

            # Fallos reales obligatorios
            (root / "llms.txt").write_text(
                "Differential mode preserving 18 tools / 12 resources.\n"
                "Mobile QA with Appium 2 and WebdriverIO.\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                "CALM Schema & 11-Control Verification (qa-11x.calm.json)\n"
                "11 Blocking Architecture Controls\n"
                "audit_security_stig_owasp checks 22 scanner rules and 29 static rules.\n",
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
            with mock.patch.object(verify_docs, "validate_repository_docs", side_effect=fake_validate):
                self.assertEqual(verify_docs.main([]), 0)
        finally:
            os.chdir(prev_cwd)
        self.assertEqual(captured_roots, [REPO_ROOT.resolve()])

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "llms.txt").write_text("Appium 2\n", encoding="utf-8")
            self.assertEqual(verify_docs.main(["--workspace", str(root)]), 1)

    def test_edge_branches_for_catalogs_links_calm_and_ref_matrix(self) -> None:
        import hashlib
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 1. _read_active_doc_text trunca historial de CHANGELOG.md tras ## [Unreleased]
            cl = root / "CHANGELOG.md"
            cl.write_text("## [Unreleased]\n- Nuevo\n\n## [1.0.0]\n- Viejo\n", encoding="utf-8")
            sliced = verify_docs._read_active_doc_text("CHANGELOG.md", cl)
            self.assertIn("Nuevo", sliced)
            self.assertNotIn("Viejo", sliced)

            # 2. _derive_calm_controls con JSON raíz no-objeto y _derive_blueprints_count con stack extra
            (root / "architecture").mkdir(parents=True, exist_ok=True)
            (root / "architecture" / "qa-11x.calm.json").write_text("[]", encoding="utf-8")
            self.assertEqual(verify_docs._derive_calm_controls(root), verify_docs.EXPECTED_CALM_CONTROLS)

            for idx in range(10):
                st = verify_docs.KNOWN_BLUEPRINT_STACKS[idx]
                (root / st).mkdir(parents=True, exist_ok=True)
                (root / st / "README.md").write_text(f"# {st}\n", encoding="utf-8")
            (root / "extra-stack").mkdir(parents=True, exist_ok=True)
            (root / "extra-stack" / "README.md").write_text("# Extra\n", encoding="utf-8")
            (root / "extra-stack" / "Makefile").write_text("all:\n", encoding="utf-8")
            self.assertEqual(verify_docs._derive_blueprints_count(root), 11)

            # 3. Matriz de referencia con encabezado desfasado y enlaces Markdown con <> y título
            ref = root / ".agents" / "skills" / "qa-11x-architect" / "references" / "02-security-disa-owasp-22.md"
            ref.parent.mkdir(parents=True, exist_ok=True)
            ref.write_text("## 1. Compliance Matrix: 99 Security Controls\n| **01** | Demo |\n", encoding="utf-8")
            self.assertTrue(any("02-security-disa-owasp-22.md" in e for e in verify_docs.check_dual_consumer_parity(root)))

            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "docs" / "target.md").write_text("# Target\n", encoding="utf-8")
            (root / "README.md").write_text(
                '[A](<docs/target.md>) [B](docs/target.md "Title") [C](#anchor) [D](docs/missing.md)\n',
                encoding="utf-8",
            )
            link_errs = verify_docs.check_internal_markdown_links(root)
            self.assertEqual(len(link_errs), 1)
            self.assertIn("docs/missing.md", link_errs[0])

            # 4. Catálogos globales: faltante, JSON inválido, licencia, versión, entrada inválida, conteos
            (root / "llms.txt").write_text("incomplete\n", encoding="utf-8")
            self.assertTrue(any("Falta artefacto GEO" in e for e in verify_docs.check_global_catalogs_and_geo(root)))

            (root / "catalogs").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "package.json").write_text(json.dumps({"version": "3.0.0"}), encoding="utf-8")
            (root / "catalogs" / "qaskills-pack.json").write_text("{bad", encoding="utf-8")
            (root / "catalogs" / "skillsllm-manifest.json").write_text("[]", encoding="utf-8")
            (root / "catalogs" / "agenticskills-submission.md").write_text("empty\n", encoding="utf-8")
            cat_errs = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(any("qaskills-pack.json: JSON inválido" in e for e in cat_errs))
            self.assertTrue(any("skillsllm-manifest.json: JSON inválido" in e for e in cat_errs))

            skill_md = root / ".agents" / "skills" / "demo-skill" / "SKILL.md"
            skill_md.parent.mkdir(parents=True, exist_ok=True)
            raw = b"# Demo\n"
            skill_md.write_bytes(raw)
            (root / "mcp-server" / "src").mkdir(parents=True, exist_ok=True)
            (root / "mcp-server" / "src" / "server.ts").write_text("server.tool('t1', '', {}, async () => ({}));", encoding="utf-8")
            (root / "catalogs" / "qaskills-pack.json").write_text(
                json.dumps({"license": "Apache", "version": "1.0.0", "skills": ["bad", {"id": "other", "path": "missing.md"}]}),
                encoding="utf-8",
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps({
                    "license": "GPL",
                    "version": "1.0.0",
                    "mcp_capabilities": {"tools_count": 0, "resources_count": 0, "tools": [], "resources": []},
                    "blueprints": [],
                    "skills": [{"id": "wrong-id", "path": ".agents/skills/demo-skill/SKILL.md", "sha256": hashlib.sha256(raw).hexdigest(), "size_bytes": len(raw)}],
                }),
                encoding="utf-8",
            )
            cat_errs2 = verify_docs.check_global_catalogs_and_geo(root)
            self.assertTrue(any("licencia esperada 'MIT'" in e for e in cat_errs2))
            self.assertTrue(any("version '1.0.0' != '3.0.0'" in e for e in cat_errs2))
            self.assertTrue(any("se esperan 1 skills reales" in e for e in cat_errs2))
            self.assertTrue(any("debe listar exactamente 1 tools" in e for e in cat_errs2))
            self.assertTrue(any("se esperan 11 blueprints raíz" in e for e in cat_errs2))
            self.assertTrue(any("desfase entre skills declaradas" in e for e in cat_errs2))

            # 5. _check_skill_entries con entrada inválida y ruta inexistente cuando coincide cantidad
            bad_entries = verify_docs._check_skill_entries(
                root, "catalogs/qaskills-pack.json", ["bad", {"id": "x", "path": "no-existe.md"}], ["demo-skill"], False, expected_skills=2
            )
            self.assertTrue(any("entrada de skill inválida" in e for e in bad_entries))
            self.assertTrue(any("ruta SKILL.md inexistente" in e for e in bad_entries))

            # 6. Camino nominal exitoso de catálogos globales + GEO con conteos dinámicos (1 skill, 1 tool, 1 resource, 11 bps)
            (root / "mcp-server" / "src" / "server.ts").write_text(
                "server.tool('t1', '', {}, async () => ({}));\n"
                "server.resource('r1', 'blueprint://one', {}, async () => ({}));\n",
                encoding="utf-8",
            )
            (root / "catalogs" / "qaskills-pack.json").write_text(
                json.dumps({"license": "MIT", "version": "3.0.0", "skills": [{"id": "demo-skill", "path": ".agents/skills/demo-skill/SKILL.md"}]}),
                encoding="utf-8",
            )
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps({
                    "license": "MIT",
                    "version": "3.0.0",
                    "mcp_capabilities": {"tools_count": 1, "resources_count": 1, "tools": ["t1"], "resources": ["blueprint://one"]},
                    "blueprints": [{"id": f"b{i}"} for i in range(11)],
                    "skills": [{"id": "demo-skill", "path": ".agents/skills/demo-skill/SKILL.md", "sha256": hashlib.sha256(raw).hexdigest(), "size_bytes": len(raw)}],
                }),
                encoding="utf-8",
            )
            geo_ok = "demo-skill\nt1\nblueprint://one\n"
            (root / "llms.txt").write_text(geo_ok, encoding="utf-8")
            (root / "catalogs" / "agenticskills-submission.md").write_text(geo_ok, encoding="utf-8")
            self.assertEqual(verify_docs.check_global_catalogs_and_geo(root), [])

            # 7. SHA-256 mismatch en skillsllm-manifest y conteo MCP v1 obsoleto (12 Tools / 9 Resources)
            (root / "catalogs" / "skillsllm-manifest.json").write_text(
                json.dumps({
                    "license": "MIT",
                    "version": "3.0.0",
                    "mcp_capabilities": {"tools_count": 1, "resources_count": 1, "tools": ["t1"], "resources": ["blueprint://one"]},
                    "blueprints": [{"id": f"b{i}"} for i in range(11)],
                    "skills": [{"id": "demo-skill", "path": ".agents/skills/demo-skill/SKILL.md", "sha256": "0" * 64, "size_bytes": len(raw)}],
                }),
                encoding="utf-8",
            )
            self.assertTrue(any("desfase SHA-256" in e for e in verify_docs.check_global_catalogs_and_geo(root)))

            (root / "README.es.md").write_text("**Español** [README.md](README.md)\n", encoding="utf-8")
            (root / "README.md").write_text("**English** [README.es.md](README.es.md)\nExposes 12 Tools and 9 Resources.\n", encoding="utf-8")
            self.assertTrue(any("conteo MCP v1 obsoleto" in e for e in verify_docs.check_v2_mcp_surface_counts(root)))


if __name__ == "__main__":
    unittest.main()
