# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
test_generar_manifiesto.unit.py — Suite unitaria para scripts/generar-manifiesto.py.

Valida el cálculo SHA-256, clasificación de target_name y merge_strategy,
construcción del manifiesto, detección de derivas con --check y ejecución CLI.
Cumple con el Estándar 11X (cobertura >= 95%).
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

# Aseguramos que scripts/ esté en el sys.path para importar generar-manifiesto
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

spec = importlib.util.spec_from_file_location(
    "generar_manifiesto", REPO_ROOT / "scripts" / "generar-manifiesto.py"
)
if spec is None or spec.loader is None:
    raise ImportError("No se pudo cargar scripts/generar-manifiesto.py")
gm = importlib.util.module_from_spec(spec)
sys.modules["generar_manifiesto"] = gm
spec.loader.exec_module(gm)


class TestGenerarManifiesto(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="qa_blueprint_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_compute_sha256_short_content(self) -> None:
        """Verifica el cálculo de SHA-256 con contenido pequeño conocido."""
        test_file = self.temp_path / "hello.txt"
        test_file.write_bytes(b"hello world")
        expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        self.assertEqual(gm.compute_sha256(test_file), expected)

    def test_compute_sha256_large_content(self) -> None:
        """Verifica el cálculo de SHA-256 con contenido mayor al búfer de 64KB."""
        test_file = self.temp_path / "large.bin"
        data = b"0123456789abcdef" * 8192
        test_file.write_bytes(data)
        expected = hashlib.sha256(data).hexdigest()
        self.assertEqual(gm.compute_sha256(test_file), expected)

    def test_get_blueprint_version(self) -> None:
        """Verifica la extracción de versión desde CHANGELOG.md y fallback."""
        changelog = self.temp_path / "CHANGELOG.md"
        changelog.write_text("## [3.2.1] - 2026-11-02\nSome notes", encoding="utf-8")
        self.assertEqual(gm.get_blueprint_version(self.temp_path), "3.2.1")

        empty_dir = self.temp_path / "empty"
        empty_dir.mkdir()
        self.assertEqual(
            gm.get_blueprint_version(empty_dir), gm.DEFAULT_BLUEPRINT_VERSION
        )

    def test_classify_stack_file(self) -> None:
        """Verifica clasificación exacta de target_name y merge_strategy."""
        cases = [
            ("gitignore.example", ".gitignore", "append_missing_lines"),
            ("sub/gitignore.example", "sub/.gitignore", "append_missing_lines"),
            ("npmrc.example", ".npmrc", "append_missing_lines"),
            ("sub/npmrc.example", "sub/.npmrc", "append_missing_lines"),
            (
                "docker-compose.qa.yml",
                "docker-compose.qa.yml",
                "copy_if_missing_or_update_qa",
            ),
            (
                "sub/docker-compose.qa.yml",
                "sub/docker-compose.qa.yml",
                "copy_if_missing_or_update_qa",
            ),
            (
                "docker-compose.qa.yml.example",
                "docker-compose.qa.yml",
                "copy_if_missing_or_update_qa",
            ),
            (
                "sub/docker-compose.qa.yml.example",
                "sub/docker-compose.qa.yml",
                "copy_if_missing_or_update_qa",
            ),
            ("Makefile.example", "Makefile", "surgical_merge"),
            ("pyproject.toml.example", "pyproject.toml", "surgical_merge"),
            ("composer.json.example", "composer.json", "surgical_merge"),
            ("phpstan.neon.example", "phpstan.neon", "surgical_merge"),
            ("infection.json5.example", "infection.json5", "surgical_merge"),
            ("phpunit.xml.example", "phpunit.xml", "surgical_merge"),
            ("php.ini.example", "php.ini", "surgical_merge"),
            ("tsconfig.json.example", "tsconfig.json", "surgical_merge"),
            ("vite.config.ts.example", "vite.config.ts", "surgical_merge"),
            ("vitest.config.ts.example", "vitest.config.ts", "surgical_merge"),
            ("playwright.config.ts.example", "playwright.config.ts", "surgical_merge"),
            ("nginx/default.conf.example", "nginx/default.conf", "copy_if_missing"),
            ("test/example.unit.py.example", "test/example.unit.py", "copy_if_missing"),
            (
                "tests/test_production_no_dev_cleanliness.unit.py.example",
                "tests/test_production_no_dev_cleanliness.unit.py",
                "copy_if_missing",
            ),
            ("test/api.feature", "test/api.feature", "copy_if_missing"),
            ("e2e/accessibility.e2e.ts", "e2e/accessibility.e2e.ts", "copy_if_missing"),
            ("test/ejemplo.bats", "test/ejemplo.bats", "copy_if_missing"),
            ("wdio.conf.ts", "wdio.conf.ts", "copy_if_missing"),
            (
                "templates/rls_hardening.sql",
                "templates/rls_hardening.sql",
                "copy_if_missing",
            ),
            ("promptfooconfig.yaml", "promptfooconfig.yaml", "copy_if_missing"),
            ("limpieza.sh", "limpieza.sh", "overwrite_executable"),
            ("scripts/helper.py", "scripts/helper.py", "overwrite_executable"),
            (
                "audit_vibe_prototype.py",
                "audit_vibe_prototype.py",
                "overwrite_executable",
            ),
            (
                "rag/test_rag_faithfulness.py",
                "rag/test_rag_faithfulness.py",
                "overwrite_executable",
            ),
            ("other.txt", "other.txt", "copy_if_missing"),
        ]
        for rel_in_stack, exp_target, exp_strategy in cases:
            target, strategy = gm.classify_stack_file(Path(rel_in_stack))
            self.assertEqual(target, exp_target, f"Fallo target para {rel_in_stack}")
            self.assertEqual(
                strategy, exp_strategy, f"Fallo strategy para {rel_in_stack}"
            )

    def test_classify_common_file(self) -> None:
        """Verifica la clasificación de archivos comunes."""
        cases = [
            ("auditar-infra.sh", "auditar-infra.sh", "overwrite_executable"),
            ("commitlint.config.js", "commitlint.config.js", "copy_if_missing"),
            (".trivy.yaml", ".trivy.yaml", "copy_if_missing"),
            ("lefthook.yml", "lefthook.yml", "surgical_merge"),
        ]
        for rel_path, exp_target, exp_strategy in cases:
            target, strategy = gm.classify_common_file(rel_path)
            self.assertEqual(target, exp_target)
            self.assertEqual(strategy, exp_strategy)

    def test_classify_governance_file(self) -> None:
        """Verifica la clasificación de archivos de gobernanza de agentes."""
        cases = [
            ("AGENTS.md", "AGENTS.md", "surgical_merge"),
            (
                ".agents/scripts/certify.sh",
                ".agents/scripts/certify.sh",
                "overwrite_executable",
            ),
            (
                ".agents/scripts/verify.py",
                ".agents/scripts/verify.py",
                "overwrite_executable",
            ),
            (
                ".agents/rules/mandatory.md",
                ".agents/rules/mandatory.md",
                "copy_or_overwrite",
            ),
            (
                ".agents/schemas/session_checkpoint.schema.json",
                ".agents/schemas/session_checkpoint.schema.json",
                "copy_or_overwrite",
            ),
            (
                ".agents/skills/refactoring-ui/SKILL.md",
                ".agents/skills/refactoring-ui/SKILL.md",
                "copy_or_overwrite",
            ),
        ]
        for rel_path, exp_target, exp_strategy in cases:
            target, strategy = gm.classify_governance_file(rel_path)
            self.assertEqual(target, exp_target)
            self.assertEqual(strategy, exp_strategy)

    def test_scan_stack(self) -> None:
        """Verifica el escaneo de directorios de stack y filtros de exclusión."""
        stack_dir = self.temp_path / "custom-stack"
        stack_dir.mkdir()
        (stack_dir / "Makefile.example").write_text("all:", encoding="utf-8")
        (stack_dir / "README.md").write_text("# Doc", encoding="utf-8")
        (stack_dir / "README.es.md").write_text("# Doc ES", encoding="utf-8")
        (stack_dir / "changelog").write_text("history", encoding="utf-8")
        (stack_dir / ".DS_Store").write_bytes(b"dummy")

        ignored_subdir = stack_dir / "__pycache__"
        ignored_subdir.mkdir()
        (ignored_subdir / "module.pyc").write_bytes(b"pyc")

        files = gm.scan_stack(self.temp_path, "custom-stack", stack_dir)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["path"], "custom-stack/Makefile.example")
        self.assertEqual(files[0]["target_name"], "Makefile")

        non_existent = self.temp_path / "non_existent"
        self.assertEqual(
            gm.scan_stack(self.temp_path, "non_existent", non_existent), []
        )

    def test_scan_common_files(self) -> None:
        """Verifica el escaneo de archivos comunes."""
        (self.temp_path / "lefthook.yml").write_text(
            "pre-commit: test", encoding="utf-8"
        )
        common_files = gm.scan_common_files(self.temp_path)
        self.assertEqual(len(common_files), 1)
        self.assertEqual(common_files[0]["path"], "lefthook.yml")

    def test_scan_agent_governance_files(self) -> None:
        """Verifica el escaneo de archivos de gobernanza con scripts y reglas."""
        (self.temp_path / "AGENTS.md").write_text("# Agents", encoding="utf-8")
        (self.temp_path / "SECURITY.md").write_text("# Security", encoding="utf-8")
        (self.temp_path / "SECURITY.es.md").write_text("# Seguridad", encoding="utf-8")
        rules_dir = self.temp_path / ".agents" / "rules"
        rules_dir.mkdir(parents=True)
        (rules_dir / "rule1.md").write_text("Rule 1", encoding="utf-8")

        scripts_dir = self.temp_path / ".agents" / "scripts"
        scripts_dir.mkdir(parents=True)
        (scripts_dir / "script1.sh").write_text("#!/bin/bash", encoding="utf-8")
        (scripts_dir / "script2.py").write_text("print('test')", encoding="utf-8")
        (scripts_dir / "ignored.txt").write_text("ignored", encoding="utf-8")

        skills_dir = self.temp_path / ".agents" / "skills" / "my-skill"
        skills_dir.mkdir(parents=True)
        (skills_dir / "SKILL.md").write_text("# Skill", encoding="utf-8")

        schemas_dir = self.temp_path / ".agents" / "schemas"
        schemas_dir.mkdir(parents=True)
        (schemas_dir / "session_checkpoint.schema.json").write_text(
            "{}", encoding="utf-8"
        )

        installer = self.temp_path / "scripts" / "install-skill.sh"
        installer.parent.mkdir(parents=True)
        installer.write_text("#!/bin/sh", encoding="utf-8")

        (self.temp_path / "llms.txt").write_text("# llms.txt", encoding="utf-8")
        catalogs_dir = self.temp_path / "catalogs"
        catalogs_dir.mkdir(parents=True)
        (catalogs_dir / "qaskills-pack.json").write_text("{}", encoding="utf-8")

        gov_files = gm.scan_agent_governance_files(self.temp_path)
        paths = [f["path"] for f in gov_files]

        self.assertIn("AGENTS.md", paths)
        self.assertIn("SECURITY.md", paths)
        self.assertIn("SECURITY.es.md", paths)
        self.assertEqual(len(gm._collect_agent_schemas(self.temp_path)), 1)
        self.assertIn(".agents/rules/rule1.md", paths)
        self.assertIn(".agents/schemas/session_checkpoint.schema.json", paths)
        self.assertIn(".agents/scripts/script1.sh", paths)
        self.assertIn(".agents/scripts/script2.py", paths)
        self.assertNotIn(".agents/scripts/ignored.txt", paths)
        self.assertIn(".agents/skills/my-skill/SKILL.md", paths)
        self.assertIn("scripts/install-skill.sh", paths)
        self.assertIn("llms.txt", paths)
        self.assertIn("catalogs/qaskills-pack.json", paths)

    def test_compare_file_lists(self) -> None:
        """Verifica la detección de discrepancias en listas de archivos."""
        file_a: dict[str, Any] = {
            "path": "a.txt",
            "sha256": "111",
            "target_name": "a",
            "merge_strategy": "copy",
            "size_bytes": 10,
        }

        self.assertEqual(gm.compare_file_lists("sec", [file_a], [file_a]), [])

        diffs = gm.compare_file_lists("sec", [], [file_a])
        self.assertEqual(len(diffs), 1)
        self.assertIn("Archivo faltante en manifest.json", diffs[0])

        diffs = gm.compare_file_lists("sec", [file_a], [])
        self.assertEqual(len(diffs), 1)
        self.assertIn("ausente en disco", diffs[0])

        file_a_modified = dict(file_a, sha256="999")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_modified])
        self.assertEqual(len(diffs), 1)
        self.assertIn("Hash SHA-256 discrepante", diffs[0])

        file_a_target_mod = dict(file_a, target_name="changed")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_target_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("target_name discrepante", diffs[0])

        file_a_strat_mod = dict(file_a, merge_strategy="surgical_merge")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_strat_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("merge_strategy discrepante", diffs[0])

        file_a_size_mod = dict(file_a, size_bytes=999)
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_size_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("size_bytes discrepante", diffs[0])

    def test_verify_manifest_edge_cases(self) -> None:
        """Verifica errores y casos límite al validar manifest.json."""
        synced, diffs = gm.verify_manifest(
            self.temp_path, self.temp_path / "non_existent.json"
        )
        self.assertFalse(synced)
        self.assertIn("no existe", diffs[0])

        bad_json = self.temp_path / "bad.json"
        bad_json.write_text("{ corrupt json ", encoding="utf-8")
        synced, diffs = gm.verify_manifest(self.temp_path, bad_json)
        self.assertFalse(synced)
        self.assertIn("Error al analizar JSON", diffs[0])

        manifest_data = gm.build_manifest(REPO_ROOT)
        manifest_data["blueprint_version"] = "9.9.9-mismatch"
        mismatched_file = self.temp_path / "mismatched.json"
        mismatched_file.write_text(json.dumps(manifest_data), encoding="utf-8")
        synced, diffs = gm.verify_manifest(REPO_ROOT, mismatched_file)
        self.assertFalse(synced)
        self.assertTrue(any("blueprint_version" in d for d in diffs))

        manifest_data2 = gm.build_manifest(REPO_ROOT)
        manifest_data2["stacks"]["fastapi"]["description"] = "Wrong description"
        manifest_data2["stacks"]["fastapi"]["readme"] = "wrong/readme.md"
        del manifest_data2["stacks"]["vue3"]
        manifest_data2["stacks"]["extra_unknown_stack"] = {
            "description": "d",
            "readme": "r",
            "files": [],
        }
        mismatched_file2 = self.temp_path / "mismatched2.json"
        mismatched_file2.write_text(json.dumps(manifest_data2), encoding="utf-8")
        synced2, diffs2 = gm.verify_manifest(REPO_ROOT, mismatched_file2)
        self.assertFalse(synced2)
        self.assertTrue(any("Descripción discrepante" in d for d in diffs2))
        self.assertTrue(any("Readme discrepante" in d for d in diffs2))
        self.assertTrue(
            any("Stack faltante en manifest.json: vue3" in d for d in diffs2)
        )
        self.assertTrue(
            any(
                "Stack inexistente listado en manifest.json: extra_unknown_stack" in d
                for d in diffs2
            )
        )

    def test_main_cli_generation_and_check(self) -> None:
        """Verifica generación, validación --check exitosa y detección de falla."""
        output_manifest = self.temp_path / "manifest.json"

        exit_code = gm.main(["--output", str(output_manifest)])
        self.assertEqual(exit_code, 0)
        self.assertTrue(output_manifest.is_file())

        exit_code_check = gm.main(
            ["--repo-root", str(REPO_ROOT), "--output", str(output_manifest), "--check"]
        )
        self.assertEqual(exit_code_check, 0)

        data = json.loads(output_manifest.read_text(encoding="utf-8"))
        first_stack = next(iter(data["stacks"].keys()))
        data["stacks"][first_stack]["files"][0]["sha256"] = "0" * 64
        output_manifest.write_text(json.dumps(data), encoding="utf-8")

        exit_code_fail = gm.main(
            ["--repo-root", str(REPO_ROOT), "--output", str(output_manifest), "--check"]
        )
        self.assertEqual(exit_code_fail, 1)

    def test_stack_metadata_includes_all_ten_stacks_and_sync_parity(self) -> None:
        """Verifica los 10 stacks oficiales en inglés y paridad con sync_governance."""
        sg_spec = importlib.util.spec_from_file_location(
            "sync_governance_parity",
            REPO_ROOT / ".agents" / "scripts" / "sync_governance.py",
        )
        assert sg_spec is not None and sg_spec.loader is not None
        sg_mod = importlib.util.module_from_spec(sg_spec)
        sys.modules["sync_governance_parity"] = sg_mod
        sg_spec.loader.exec_module(sg_mod)

        expected_stacks = {
            "python",
            "fastapi",
            "node-backend",
            "vue3",
            "react-frontend",
            "bash-scripts",
            "php",
            "mobile-appium",
            "ai-evals",
            "vibe-rescue",
        }
        self.assertEqual(set(gm.STACK_METADATA.keys()), expected_stacks)
        self.assertEqual(gm.STACK_METADATA, sg_mod.STACK_METADATA)
        self.assertEqual(gm.COMMON_FILE_PATHS, sg_mod.COMMON_FILE_PATHS)
        self.assertEqual(gm.SCHEMA_VERSION, sg_mod.SCHEMA_VERSION)
        self.assertEqual(gm.DEFAULT_BLUEPRINT_VERSION, sg_mod.DEFAULT_BLUEPRINT_VERSION)

        expected_keywords = {
            "python": "Standalone Python Libraries and CLIs",
            "fastapi": "Async Python REST APIs",
            "node-backend": "Node.js / TypeScript Backend Microservices",
            "vue3": "Vue 3 + TypeScript + Vite Frontend",
            "react-frontend": "React + TypeScript + Vite Frontend",
            "bash-scripts": "POSIX / Bash DevOps Automation Scripts",
            "php": "PHP 8.2-8.5",
            "mobile-appium": "Appium 3",
            "ai-evals": "DeepEval",
            "vibe-rescue": "Vibe-to-Enterprise Hardening",
        }
        for stack_name, keyword in expected_keywords.items():
            meta = gm.STACK_METADATA[stack_name]
            self.assertIn(keyword, meta["description"])
            self.assertEqual(meta["readme"], f"{stack_name}/README.md")

        self.assertNotIn("8.1", gm.STACK_METADATA["php"]["description"])
        self.assertIn("scripts/actualizar-grafos-graphify.sh", gm.COMMON_FILE_PATHS)
        self.assertIn("scripts/auditar-pagespeed.sh", gm.COMMON_FILE_PATHS)

    def test_mermaid_blocks_have_no_broken_html_tags(self) -> None:
        """Verifica bloques Mermaid sin etiquetas HTML rotas ni escapes \\n."""
        mermaid_files = [
            "README.md",
            "SECURITY.md",
            "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
            "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
            "docs/ARCHITECTURE_C4.md",
            "docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md",
        ]
        for rel_path in mermaid_files:
            path = REPO_ROOT / rel_path
            if not path.is_file():
                continue
            content = path.read_text(encoding="utf-8")
            for block in content.split("```mermaid")[1:]:
                mermaid_code = block.split("```")[0]
                self.assertNotIn(
                    "<br>", mermaid_code, f"Tag <br> inválido en {rel_path}"
                )
                self.assertNotIn(
                    "<code>", mermaid_code, f"Tag <code> inválido en {rel_path}"
                )
                self.assertNotIn(
                    r"\n", mermaid_code, f"Secuencia \\n inválida en {rel_path}"
                )

    def test_readme_bilingual_matrices_and_no_legacy_bdd_anchors(self) -> None:
        """Verifica matrices bilingües y tags Docker en README.{md,es.md}."""
        readme_en = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        readme_es = (REPO_ROOT / "README.es.md").read_text(encoding="utf-8")

        self.assertIn("## 🛠 Testing Tools Matrix", readme_en)
        self.assertIn("## 🛠 Matriz de Herramientas de Pruebas", readme_es)
        self.assertNotIn("QA-11X-BDD-COMPATIBILITY-ANCHORS", readme_en)
        self.assertNotIn("QA-11X-BDD-COMPATIBILITY-ANCHORS", readme_es)

        docker_tokens = (
            "sinfallas/base-python-uv",
            "`3.15`",
            "sinfallas/base-node-ionic",
            "`26`",
            "sinfallas/base-mobile-appium",
            "sinfallas/basephpcomposer",
            "`8.5`",
            "sinfallas/karatelabs",
            "`1.5.1`",
        )
        for token in docker_tokens:
            self.assertIn(token, readme_en, f"Falta '{token}' en README.md")
            self.assertIn(token, readme_es, f"Falta '{token}' en README.es.md")

    def test_bilingual_stack_readme_hashes_and_es_governance_in_manifest(self) -> None:
        """Verifica readme_sha256, readme_es y gobernanza EN/ES en manifest."""
        manifest = gm.build_manifest(REPO_ROOT)
        self.assertEqual(len(manifest["stacks"]), 10)
        for stack_name, stack_entry in manifest["stacks"].items():
            self.assertRegex(stack_entry["readme_sha256"], r"^[0-9a-f]{64}$")
            self.assertEqual(stack_entry["readme_es"], f"{stack_name}/README.es.md")
            self.assertRegex(stack_entry["readme_es_sha256"], r"^[0-9a-f]{64}$")
            file_paths = {item["path"] for item in stack_entry["files"]}
            self.assertNotIn(f"{stack_name}/README.md", file_paths)
            self.assertNotIn(f"{stack_name}/README.es.md", file_paths)

        gov_paths = {item["path"] for item in manifest["agent_governance_files"]}
        self.assertIn("AI_MASTER_PROMPT.md", gov_paths)
        self.assertIn("AI_MASTER_PROMPT.es.md", gov_paths)
        self.assertIn("SECURITY.md", gov_paths)
        self.assertIn("SECURITY.es.md", gov_paths)

        empty_manifest = gm.build_manifest(self.temp_path)
        for empty_stack in empty_manifest["stacks"].values():
            self.assertNotIn("readme_sha256", empty_stack)
            self.assertNotIn("readme_es", empty_stack)


if __name__ == "__main__":
    unittest.main()
