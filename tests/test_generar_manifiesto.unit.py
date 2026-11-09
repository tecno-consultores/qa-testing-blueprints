#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
test_generar_manifiesto.unit.py — Suite de pruebas unitarias para scripts/generar-manifiesto.py.

Valida el cálculo criptográfico SHA-256, clasificación de target_name y merge_strategy,
construcción del manifiesto, detección de derivas con --check y ejecución CLI.
Cumple con el Estándar 11X (cobertura >= 95%).
"""

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

# Aseguramos que scripts/ esté en el sys.path para importar generar-manifiesto
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

# Importamos las funciones del generador
import importlib.util

spec = importlib.util.spec_from_file_location("generar_manifiesto", REPO_ROOT / "scripts" / "generar-manifiesto.py")
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
        # SHA-256 de "hello world"
        expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        self.assertEqual(gm.compute_sha256(test_file), expected)

    def test_compute_sha256_large_content(self) -> None:
        """Verifica el cálculo de SHA-256 con contenido mayor al búfer de 64KB."""
        test_file = self.temp_path / "large.bin"
        # 128 KB de datos repetidos
        data = b"0123456789abcdef" * 8192
        test_file.write_bytes(data)
        import hashlib

        expected = hashlib.sha256(data).hexdigest()
        self.assertEqual(gm.compute_sha256(test_file), expected)

    def test_get_blueprint_version(self) -> None:
        """Verifica la extracción de versión desde CHANGELOG.md y fallback."""
        changelog = self.temp_path / "CHANGELOG.md"
        changelog.write_text("## [3.2.1] - 2026-11-02\nSome notes", encoding="utf-8")
        self.assertEqual(gm.get_blueprint_version(self.temp_path), "3.2.1")

        # Sin CHANGELOG.md -> fallback DEFAULT_BLUEPRINT_VERSION
        empty_dir = self.temp_path / "empty"
        empty_dir.mkdir()
        self.assertEqual(gm.get_blueprint_version(empty_dir), gm.DEFAULT_BLUEPRINT_VERSION)

    def test_classify_stack_file(self) -> None:
        """Verifica la clasificación exacta de target_name y merge_strategy para archivos de stack."""
        cases = [
            ("gitignore.example", ".gitignore", "append_missing_lines"),
            ("sub/gitignore.example", "sub/.gitignore", "append_missing_lines"),
            ("npmrc.example", ".npmrc", "append_missing_lines"),
            ("sub/npmrc.example", "sub/.npmrc", "append_missing_lines"),
            ("docker-compose.qa.yml", "docker-compose.qa.yml", "copy_if_missing_or_update_qa"),
            ("sub/docker-compose.qa.yml", "sub/docker-compose.qa.yml", "copy_if_missing_or_update_qa"),
            ("Makefile.example", "Makefile", "surgical_merge"),
            ("pyproject.toml.example", "pyproject.toml", "surgical_merge"),
            ("composer.json.example", "composer.json", "surgical_merge"),
            ("phpstan.neon.example", "phpstan.neon", "surgical_merge"),
            ("infection.json5.example", "infection.json5", "surgical_merge"),
            ("phpunit.xml.example", "phpunit.xml", "surgical_merge"),
            ("php.ini.example", "php.ini", "surgical_merge"),
            ("nginx/default.conf.example", "nginx/default.conf", "copy_if_missing"),
            ("test/example.unit.py.example", "test/example.unit.py", "copy_if_missing"),
            ("test/api.feature", "test/api.feature", "copy_if_missing"),
            ("e2e/accessibility.e2e.ts", "e2e/accessibility.e2e.ts", "copy_if_missing"),
            ("test/ejemplo.bats", "test/ejemplo.bats", "copy_if_missing"),
            ("limpieza.sh", "limpieza.sh", "overwrite_executable"),
            ("scripts/helper.py", "scripts/helper.py", "overwrite_executable"),
            ("other.txt", "other.txt", "copy_if_missing"),
        ]
        for rel_in_stack, exp_target, exp_strategy in cases:
            target, strategy = gm.classify_stack_file(Path(rel_in_stack))
            self.assertEqual(target, exp_target, f"Fallo target para {rel_in_stack}")
            self.assertEqual(strategy, exp_strategy, f"Fallo strategy para {rel_in_stack}")

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
            (".agents/scripts/certify.sh", ".agents/scripts/certify.sh", "overwrite_executable"),
            (".agents/scripts/verify.py", ".agents/scripts/verify.py", "overwrite_executable"),
            (".agents/rules/mandatory.md", ".agents/rules/mandatory.md", "copy_or_overwrite"),
            (".agents/skills/refactoring-ui/SKILL.md", ".agents/skills/refactoring-ui/SKILL.md", "copy_or_overwrite"),
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
        (stack_dir / "README.md").write_text("# Doc", encoding="utf-8")  # Debe ignorarse
        (stack_dir / "changelog").write_text("history", encoding="utf-8")  # Debe ignorarse
        (stack_dir / ".DS_Store").write_bytes(b"dummy")  # Debe ignorarse

        ignored_subdir = stack_dir / "__pycache__"
        ignored_subdir.mkdir()
        (ignored_subdir / "module.pyc").write_bytes(b"pyc")  # Debe ignorarse

        files = gm.scan_stack(self.temp_path, "custom-stack", stack_dir)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["path"], "custom-stack/Makefile.example")
        self.assertEqual(files[0]["target_name"], "Makefile")

        # Escaneo de directorio inexistente retorna lista vacía
        non_existent = self.temp_path / "non_existent"
        self.assertEqual(gm.scan_stack(self.temp_path, "non_existent", non_existent), [])

    def test_scan_common_files(self) -> None:
        """Verifica el escaneo de archivos comunes."""
        (self.temp_path / "lefthook.yml").write_text("pre-commit: test", encoding="utf-8")
        common_files = gm.scan_common_files(self.temp_path)
        self.assertEqual(len(common_files), 1)
        self.assertEqual(common_files[0]["path"], "lefthook.yml")

    def test_scan_agent_governance_files(self) -> None:
        """Verifica el escaneo de archivos de gobernanza con scripts y reglas."""
        (self.temp_path / "AGENTS.md").write_text("# Agents", encoding="utf-8")
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

        installer = self.temp_path / "scripts" / "install-skill.sh"
        installer.parent.mkdir(parents=True)
        installer.write_text("#!/bin/sh", encoding="utf-8")

        gov_files = gm.scan_agent_governance_files(self.temp_path)
        paths = [f["path"] for f in gov_files]

        self.assertIn("AGENTS.md", paths)
        self.assertIn(".agents/rules/rule1.md", paths)
        self.assertIn(".agents/scripts/script1.sh", paths)
        self.assertIn(".agents/scripts/script2.py", paths)
        self.assertNotIn(".agents/scripts/ignored.txt", paths)
        self.assertIn(".agents/skills/my-skill/SKILL.md", paths)
        self.assertIn("scripts/install-skill.sh", paths)

    def test_compare_file_lists(self) -> None:
        """Verifica la detección de discrepancias en listas de archivos."""
        file_a = {"path": "a.txt", "sha256": "111", "target_name": "a", "merge_strategy": "copy", "size_bytes": 10}
        file_b = {"path": "b.txt", "sha256": "222", "target_name": "b", "merge_strategy": "copy", "size_bytes": 20}

        # Idénticos -> 0 diffs
        self.assertEqual(gm.compare_file_lists("sec", [file_a], [file_a]), [])

        # Faltante en manifest
        diffs = gm.compare_file_lists("sec", [], [file_a])
        self.assertEqual(len(diffs), 1)
        self.assertIn("Archivo faltante en manifest.json", diffs[0])

        # Faltante en repositorio
        diffs = gm.compare_file_lists("sec", [file_a], [])
        self.assertEqual(len(diffs), 1)
        self.assertIn("ausente en repositorio", diffs[0])

        # Hash discrepante
        file_a_modified = dict(file_a, sha256="999")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_modified])
        self.assertEqual(len(diffs), 1)
        self.assertIn("Hash SHA-256 discrepante", diffs[0])

        # target_name discrepante
        file_a_target_mod = dict(file_a, target_name="changed")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_target_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("target_name discrepante", diffs[0])

        # merge_strategy discrepante
        file_a_strat_mod = dict(file_a, merge_strategy="surgical_merge")
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_strat_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("merge_strategy discrepante", diffs[0])

        # size_bytes discrepante
        file_a_size_mod = dict(file_a, size_bytes=999)
        diffs = gm.compare_file_lists("sec", [file_a], [file_a_size_mod])
        self.assertEqual(len(diffs), 1)
        self.assertIn("size_bytes discrepante", diffs[0])

    def test_verify_manifest_edge_cases(self) -> None:
        """Verifica errores y casos límite al validar manifest.json."""
        # Archivo inexistente
        synced, diffs = gm.verify_manifest(self.temp_path, self.temp_path / "non_existent.json")
        self.assertFalse(synced)
        self.assertIn("no existe", diffs[0])

        # Archivo JSON corrupto
        bad_json = self.temp_path / "bad.json"
        bad_json.write_text("{ corrupt json ", encoding="utf-8")
        synced, diffs = gm.verify_manifest(self.temp_path, bad_json)
        self.assertFalse(synced)
        self.assertIn("Error al analizar JSON", diffs[0])

        # Metadato de nivel superior alterado
        manifest_data = gm.build_manifest(REPO_ROOT)
        manifest_data["blueprint_version"] = "9.9.9-mismatch"
        mismatched_file = self.temp_path / "mismatched.json"
        mismatched_file.write_text(json.dumps(manifest_data), encoding="utf-8")
        synced, diffs = gm.verify_manifest(REPO_ROOT, mismatched_file)
        self.assertFalse(synced)
        self.assertTrue(any("blueprint_version" in d for d in diffs))

        # Stack faltante o alterado
        manifest_data2 = gm.build_manifest(REPO_ROOT)
        manifest_data2["stacks"]["fastapi"]["description"] = "Wrong description"
        manifest_data2["stacks"]["fastapi"]["readme"] = "wrong/readme.md"
        del manifest_data2["stacks"]["vue3"]
        manifest_data2["stacks"]["extra_unknown_stack"] = {"description": "d", "readme": "r", "files": []}
        mismatched_file2 = self.temp_path / "mismatched2.json"
        mismatched_file2.write_text(json.dumps(manifest_data2), encoding="utf-8")
        synced2, diffs2 = gm.verify_manifest(REPO_ROOT, mismatched_file2)
        self.assertFalse(synced2)
        self.assertTrue(any("Descripción discrepante" in d for d in diffs2))
        self.assertTrue(any("Readme discrepante" in d for d in diffs2))
        self.assertTrue(any("Stack faltante en manifest.json: vue3" in d for d in diffs2))
        self.assertTrue(any("Stack inexistente listado en manifest.json: extra_unknown_stack" in d for d in diffs2))

    def test_main_cli_generation_and_check(self) -> None:
        """Verifica la ejecución del comando CLI con generación y verificación exitosa y fallida."""
        output_manifest = self.temp_path / "manifest.json"

        # 1. Generación sin --repo-root (usa autodetección)
        exit_code = gm.main(["--output", str(output_manifest)])
        self.assertEqual(exit_code, 0)
        self.assertTrue(output_manifest.is_file())

        # 2. Verificación exitosa (--check)
        exit_code_check = gm.main(["--repo-root", str(REPO_ROOT), "--output", str(output_manifest), "--check"])
        self.assertEqual(exit_code_check, 0)

        # 3. Verificación con fallo al alterar un hash
        data = json.loads(output_manifest.read_text(encoding="utf-8"))
        # Corrompemos el hash del primer archivo
        first_stack = list(data["stacks"].keys())[0]
        data["stacks"][first_stack]["files"][0]["sha256"] = "0" * 64
        output_manifest.write_text(json.dumps(data), encoding="utf-8")

        exit_code_fail = gm.main(["--repo-root", str(REPO_ROOT), "--output", str(output_manifest), "--check"])
        self.assertEqual(exit_code_fail, 1)

    def test_stack_metadata_includes_php_and_seven_stacks(self) -> None:
        """Verifica que STACK_METADATA declare exactamente los 7 stacks oficiales, incluyendo php."""
        expected_stacks = {
            "python",
            "fastapi",
            "node-backend",
            "vue3",
            "react-frontend",
            "bash-scripts",
            "php",
        }
        self.assertEqual(set(gm.STACK_METADATA.keys()), expected_stacks)
        php_meta = gm.STACK_METADATA["php"]
        self.assertIn("PHP 8.2-8.5", php_meta["description"])
        self.assertNotIn("8.1", php_meta["description"])
        self.assertEqual(php_meta["readme"], "php/README.md")
        self.assertIn("scripts/actualizar-grafos-graphify.sh", gm.COMMON_FILE_PATHS)

    def test_readme_matrix_tags_and_mermaid_integrity(self) -> None:
        """Verifica matriz de herramientas, tags de Docker Hub y bloques Mermaid sin HTML roto."""
        readme_text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("## 🛠 Matriz de Herramientas de Pruebas", readme_text)
        self.assertIn("| Entorno | Linting / Formateo | Pruebas Unitarias / Mocking |", readme_text)
        self.assertIn("`3.11`, `3.12`, `3.13`, `3.14`, `3.15` y `latest`", readme_text)
        self.assertIn("`8.2`, `8.3`, `8.4`, `8.5` y `latest`", readme_text)
        self.assertIn("`22`, `24`, `26` y `latest`", readme_text)
        self.assertNotIn(r"\text{", readme_text)
        self.assertIn("`t < starts_at`, `starts_at <= t <= ends_at`, `t > ends_at`", readme_text)

        mermaid_files = [
            "README.md",
            "SECURITY.md",
            "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
            "docs/ARCHITECTURE_C4.md",
            "docs/specs/01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md",
        ]
        for rel_path in mermaid_files:
            content = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
            self.assertIn("```mermaid", content, f"Falta bloque mermaid en {rel_path}")
            for block in content.split("```mermaid")[1:]:
                mermaid_code = block.split("```")[0]
                self.assertNotIn("<br>", mermaid_code, f"Tag <br> inválido en Mermaid de {rel_path}")
                self.assertNotIn("<code>", mermaid_code, f"Tag <code> inválido en Mermaid de {rel_path}")
                self.assertNotIn(r"\n", mermaid_code, f"Secuencia \\n inválida en Mermaid de {rel_path}")


if __name__ == "__main__":
    unittest.main()
