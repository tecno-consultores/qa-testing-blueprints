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

            errors = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("Desfase Dual-Consumer" in e for e in errors))

    def test_detects_undocumented_auditor_rule_in_human_manuals(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            auditor = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
            auditor.parent.mkdir(parents=True, exist_ok=True)
            auditor.write_text("const f = { rule_id: 'QA-ORPHAN-99' };\n", encoding="utf-8")

            sec_md = root / "SECURITY.md"
            sec_md.write_text("### 4.1. Documentado SEC-01\n", encoding="utf-8")

            errors = verify_docs.validate_repository_docs(root)
            self.assertTrue(any("QA-ORPHAN-99" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
