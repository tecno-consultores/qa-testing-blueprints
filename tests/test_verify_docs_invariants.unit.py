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


if __name__ == "__main__":
    unittest.main()
