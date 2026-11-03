#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

"""
test_install_skill.unit.py — Suite de pruebas unitarias para scripts/install-skill.sh.

Valida la resolución de destinos, la ejecución con --help, la validación criptográfica
SHA-256 (DISA ASD STIG V6R5 V-222513), la detección de manipulaciones (tampering)
y la instalación determinista en el workspace y entornos de agentes IA.
Cumple con el Estándar 11X.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-skill.sh"


class TestInstallSkill(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="qa_install_skill_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_help_flag_displays_usage(self) -> None:
        """Verifica que el flag --help devuelva código de salida 0 y muestre la ayuda en español."""
        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--help"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("Instalador Universal de Skills QA 11X", res.stdout)
        self.assertIn("--target", res.stdout)

    def test_missing_argument_for_target_fails(self) -> None:
        """Verifica que invocar --target sin valor falle con código 1."""
        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 1)
        self.assertIn("requiere un argumento", res.stderr)

    def test_nominal_installation_with_local_manifest(self) -> None:
        """Verifica la instalación nominal con un repositorio mock y verificación SHA-256 exitosa."""
        mock_repo = self.temp_path / "mock_repo"
        mock_repo.mkdir()

        # Crear archivos simulados para qa-11x-architect
        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# Architect Skill Content", encoding="utf-8")
        arch_sha = hashlib.sha256(arch_skill.read_bytes()).hexdigest()

        # Crear archivos simulados para refactoring-ui
        refact_dir = mock_repo / ".agents" / "skills" / "refactoring-ui"
        refact_dir.mkdir(parents=True)
        refact_skill = refact_dir / "SKILL.md"
        refact_skill.write_text("# Refactoring UI Skill Content", encoding="utf-8")
        refact_sha = hashlib.sha256(refact_skill.read_bytes()).hexdigest()

        # Crear archivos simulados para docker-trivy-keydb-hardening
        trivy_dir = mock_repo / ".agents" / "skills" / "docker-trivy-keydb-hardening"
        trivy_dir.mkdir(parents=True)
        trivy_skill = trivy_dir / "SKILL.md"
        trivy_skill.write_text("# Trivy Skill Content", encoding="utf-8")
        trivy_sha = hashlib.sha256(trivy_skill.read_bytes()).hexdigest()

        # Crear archivos simulados para graphify-ast-navigator
        ast_dir = mock_repo / ".agents" / "skills" / "graphify-ast-navigator"
        ast_dir.mkdir(parents=True)
        ast_skill = ast_dir / "SKILL.md"
        ast_skill.write_text("# AST Skill Content", encoding="utf-8")
        ast_sha = hashlib.sha256(ast_skill.read_bytes()).hexdigest()

        # Crear archivos simulados para qa-11x-docker-certifier
        cert_dir = mock_repo / ".agents" / "skills" / "qa-11x-docker-certifier"
        cert_dir.mkdir(parents=True)
        cert_skill = cert_dir / "SKILL.md"
        cert_skill.write_text("# Docker Certifier Skill Content", encoding="utf-8")
        cert_sha = hashlib.sha256(cert_skill.read_bytes()).hexdigest()

        # Crear manifest.json mock con las 5 skills
        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": [
                {
                    "path": ".agents/skills/qa-11x-architect/SKILL.md",
                    "sha256": arch_sha,
                    "size_bytes": len(arch_skill.read_bytes()),
                },
                {
                    "path": ".agents/skills/refactoring-ui/SKILL.md",
                    "sha256": refact_sha,
                    "size_bytes": len(refact_skill.read_bytes()),
                },
                {
                    "path": ".agents/skills/docker-trivy-keydb-hardening/SKILL.md",
                    "sha256": trivy_sha,
                    "size_bytes": len(trivy_skill.read_bytes()),
                },
                {
                    "path": ".agents/skills/graphify-ast-navigator/SKILL.md",
                    "sha256": ast_sha,
                    "size_bytes": len(ast_skill.read_bytes()),
                },
                {
                    "path": ".agents/skills/qa-11x-docker-certifier/SKILL.md",
                    "sha256": cert_sha,
                    "size_bytes": len(cert_skill.read_bytes()),
                },
            ],
        }
        manifest_file = mock_repo / "manifest.json"
        manifest_file.write_text(json.dumps(manifest_data), encoding="utf-8")

        # Directorio de destino para la prueba
        dest_workspace = self.temp_path / "dest_project"
        dest_workspace.mkdir()

        env = os.environ.copy()
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "workspace"],
            cwd=str(dest_workspace),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Error: {res.stderr}\nStdout: {res.stdout}")
        self.assertIn("Instalación de Skills QA 11X Completada con Éxito", res.stdout)

        # Verificar que las 5 skills existen en el destino
        self.assertTrue((dest_workspace / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md").is_file())
        self.assertTrue((dest_workspace / ".agents" / "skills" / "refactoring-ui" / "SKILL.md").is_file())
        self.assertTrue((dest_workspace / ".agents" / "skills" / "docker-trivy-keydb-hardening" / "SKILL.md").is_file())
        self.assertTrue((dest_workspace / ".agents" / "skills" / "graphify-ast-navigator" / "SKILL.md").is_file())
        self.assertTrue((dest_workspace / ".agents" / "skills" / "qa-11x-docker-certifier" / "SKILL.md").is_file())

    def test_tampered_file_detection_aborts(self) -> None:
        """Verifica que una discrepancia en el hash SHA-256 aborte con código 1 (DISA STIG V-222513)."""
        mock_repo = self.temp_path / "tampered_repo"
        mock_repo.mkdir()

        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# Contenido Malicioso Modificado", encoding="utf-8")

        # Usamos un hash falso esperado
        expected_fake_sha = "0000000000000000000000000000000000000000000000000000000000000000"

        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": [
                {
                    "path": ".agents/skills/qa-11x-architect/SKILL.md",
                    "sha256": expected_fake_sha,
                    "size_bytes": 100,
                }
            ],
        }
        manifest_file = mock_repo / "manifest.json"
        manifest_file.write_text(json.dumps(manifest_data), encoding="utf-8")

        dest_workspace = self.temp_path / "dest_tampered"
        dest_workspace.mkdir()

        env = os.environ.copy()
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "workspace"],
            cwd=str(dest_workspace),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 1)
        self.assertIn("VIOLACIÓN DE INTEGRIDAD CRIPTOGRÁFICA", res.stderr)
        self.assertIn("V-222513", res.stderr)

    def test_target_destination_resolution_antigravity(self) -> None:
        """Verifica que el destino antigravity instale en ~/.gemini/config/skills."""
        mock_repo = self.temp_path / "mock_repo_ag"
        mock_repo.mkdir()

        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# AG Skill", encoding="utf-8")
        arch_sha = hashlib.sha256(arch_skill.read_bytes()).hexdigest()

        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": [
                {
                    "path": ".agents/skills/qa-11x-architect/SKILL.md",
                    "sha256": arch_sha,
                    "size_bytes": len(arch_skill.read_bytes()),
                }
            ],
        }
        (mock_repo / "manifest.json").write_text(json.dumps(manifest_data), encoding="utf-8")

        mock_home = self.temp_path / "fake_home"
        mock_home.mkdir()

        env = os.environ.copy()
        env["HOME"] = str(mock_home)
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "antigravity"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0)
        installed = mock_home / ".gemini" / "config" / "skills" / "qa-11x-architect" / "SKILL.md"
        self.assertTrue(installed.is_file())

    def test_auto_target_from_home_detects_global_agents_without_polluting_home_agents(self) -> None:
        """Verifica que al ejecutar en $HOME sin --target detecte agentes globales sin ensuciar $HOME/.agents."""
        mock_repo = self.temp_path / "mock_repo_auto"
        mock_repo.mkdir()

        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# Architect Auto", encoding="utf-8")
        arch_sha = hashlib.sha256(arch_skill.read_bytes()).hexdigest()

        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": [
                {
                    "path": ".agents/skills/qa-11x-architect/SKILL.md",
                    "sha256": arch_sha,
                    "size_bytes": len(arch_skill.read_bytes()),
                }
            ],
        }
        (mock_repo / "manifest.json").write_text(json.dumps(manifest_data), encoding="utf-8")

        mock_home = self.temp_path / "user_home"
        mock_home.mkdir()
        (mock_home / ".gemini").mkdir()
        (mock_home / ".claude").mkdir()

        env = os.environ.copy()
        env["HOME"] = str(mock_home)
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        # Ejecutamos con cwd == mock_home y sin argumento --target
        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT)],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Error: {res.stderr}\nStdout: {res.stdout}")

        # Verifica que instaló en .gemini y .claude
        installed_gemini = mock_home / ".gemini" / "config" / "skills" / "qa-11x-architect" / "SKILL.md"
        installed_claude = mock_home / ".claude" / "skills" / "qa-11x-architect" / "SKILL.md"
        self.assertTrue(installed_gemini.is_file())
        self.assertTrue(installed_claude.is_file())

        # Verifica que NO creó mock_home/.agents
        self.assertFalse((mock_home / ".agents").exists())


if __name__ == "__main__":
    unittest.main()
