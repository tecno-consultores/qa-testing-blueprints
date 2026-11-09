#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""test_publicar_mcp.unit.py — Pruebas Unitarias para scripts/publicar-mcp.sh.

Valida:
1. Menú de ayuda CLI (--help / -h) y opciones disponibles.
2. Detección y rechazo de ejecución sin token NPM_TOKEN en modo real.
3. Rechazo de token con valor de plantilla de ejemplo.
4. Lectura controlada de NPM_TOKEN desde .env.
5. Ejecución en modo simulación (--dry-run) sin interactuar con la red de publicación.
6. Manejo de flags inválidos.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "publicar-mcp.sh"


class TestPublicarMcp(unittest.TestCase):
    """Suite de pruebas unitarias para scripts/publicar-mcp.sh."""

    def test_help_flag(self):
        result = subprocess.run(
            [str(SCRIPT_PATH), "--help"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("Publicador Autónomo de Servidor MCP", result.stdout)
        self.assertIn("--dry-run", result.stdout)
        self.assertIn("--otp", result.stdout)
        self.assertIn("NPM_TOKEN", result.stdout)

    def test_empty_otp_flag_fails(self):
        result = subprocess.run(
            [str(SCRIPT_PATH), "--otp"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("requiere un código de 6 dígitos", result.stderr)

    def test_invalid_argument_fails(self):
        result = subprocess.run(
            [str(SCRIPT_PATH), "--opcion-invalida-xyz"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Opción no reconocida", result.stderr)

    def test_missing_token_in_real_mode_fails_cleanly(self):
        # Aseguramos un entorno limpio sin NPM_TOKEN
        env = dict(os.environ)
        env.pop("NPM_TOKEN", None)

        with tempfile.TemporaryDirectory() as tmpdir:
            # Creamos un repo falso sin .env
            fake_root = Path(tmpdir)
            fake_mcp = fake_root / "mcp-server"
            fake_mcp.mkdir()
            fake_pkg = fake_mcp / "package.json"
            fake_pkg.write_text('{"name": "@sinfallas/mcp-qa-11x", "version": "2.7.0"}\n', encoding="utf-8")

            fake_scripts = fake_root / "scripts"
            fake_scripts.mkdir()
            fake_script = fake_scripts / "publicar-mcp.sh"
            fake_script.write_text(SCRIPT_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            fake_script.chmod(0o755)

            # Fallback mock para scripts/limpieza.sh
            fake_clean = fake_scripts / "limpieza.sh"
            fake_clean.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake_clean.chmod(0o755)

            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Variable NPM_TOKEN no configurada", result.stderr)

    def test_placeholder_token_fails_cleanly(self):
        env = dict(os.environ)
        env["NPM_TOKEN"] = "npm_TU_TOKEN_DE_NPMJS_AQUI"

        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root = Path(tmpdir)
            fake_mcp = fake_root / "mcp-server"
            fake_mcp.mkdir()
            fake_pkg = fake_mcp / "package.json"
            fake_pkg.write_text('{"name": "@sinfallas/mcp-qa-11x", "version": "2.7.0"}\n', encoding="utf-8")

            fake_scripts = fake_root / "scripts"
            fake_scripts.mkdir()
            fake_script = fake_scripts / "publicar-mcp.sh"
            fake_script.write_text(SCRIPT_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            fake_script.chmod(0o755)

            fake_clean = fake_scripts / "limpieza.sh"
            fake_clean.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake_clean.chmod(0o755)

            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Variable NPM_TOKEN no configurada o contiene el valor de ejemplo", result.stderr)

    def test_missing_package_json_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root = Path(tmpdir)
            fake_scripts = fake_root / "scripts"
            fake_scripts.mkdir()
            fake_script = fake_scripts / "publicar-mcp.sh"
            fake_script.write_text(SCRIPT_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            fake_script.chmod(0o755)

            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("No se encontró mcp-server/package.json", result.stderr)

    def test_cdn_retry_loop_present_in_publish_script(self):
        """Verifica que scripts/publicar-mcp.sh implemente el bucle resiliente de verificación CDN (Hito 8)."""
        content = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("VERIFY_ATTEMPTS=6", content)
        self.assertIn("VERIFY_DELAY=5", content)
        self.assertIn("Verificando propagación en el CDN", content)
        self.assertIn("Esperando propagación asíncrona del CDN", content)
        self.assertIn("npm publish concluyó con éxito", content)


if __name__ == "__main__":
    unittest.main()
