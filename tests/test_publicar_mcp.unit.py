#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""test_publicar_mcp.unit.py — Pruebas Unitarias para scripts/publicar-mcp.sh.

Valida:
1. Menú de ayuda CLI (--help / -h) y opciones disponibles.
2. Detección y rechazo de ejecución sin token NPM_TOKEN en modo real.
3. Rechazo de token con valor de plantilla de ejemplo.
4. Verificación pre-pack de frescura de dist/index.js (ignore-scripts=true).
5. Bucle resiliente de verificación CDN y manejo de flags inválidos.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "publicar-mcp.sh"
SAMPLE_PKG_JSON = '{"name": "@sinfallas/mcp-qa-11x", "version": "3.1.0"}\n'


class TestPublicarMcp(unittest.TestCase):
    """Suite de pruebas unitarias para scripts/publicar-mcp.sh."""

    def test_help_flag(self) -> None:
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

    def test_empty_otp_flag_fails(self) -> None:
        result = subprocess.run(
            [str(SCRIPT_PATH), "--otp"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("requiere un código de 6 dígitos", result.stderr)

    def test_invalid_argument_fails(self) -> None:
        result = subprocess.run(
            [str(SCRIPT_PATH), "--opcion-invalida-xyz"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Opción no reconocida", result.stderr)

    def _create_publish_sandbox(
        self, tmpdir: str, docker_stub: str | None = None, *, with_dist: bool = True
    ) -> tuple[Path, Path, Path]:
        fake_root = Path(tmpdir)
        fake_mcp = fake_root / "mcp-server"
        fake_src = fake_mcp / "src"
        fake_src.mkdir(parents=True)
        (fake_mcp / "package.json").write_text(SAMPLE_PKG_JSON, encoding="utf-8")
        src_file = fake_src / "index.ts"
        src_file.write_text("export const v = 1;\n", encoding="utf-8")

        if with_dist:
            fake_dist = fake_mcp / "dist"
            fake_dist.mkdir(parents=True)
            dist_file = fake_dist / "index.js"
            dist_file.write_text("export const v = 1;\n", encoding="utf-8")
            src_mtime = src_file.stat().st_mtime
            os.utime(dist_file, (src_mtime + 10, src_mtime + 10))

        fake_scripts = fake_root / "scripts"
        fake_scripts.mkdir()
        fake_script = fake_scripts / "publicar-mcp.sh"
        fake_script.write_text(
            SCRIPT_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )
        fake_script.chmod(0o755)

        fake_clean = fake_scripts / "limpieza.sh"
        fake_clean.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_clean.chmod(0o755)

        fake_bin = fake_root / "bin"
        fake_bin.mkdir()
        if docker_stub is not None:
            fake_docker = fake_bin / "docker"
            fake_docker.write_text(docker_stub, encoding="utf-8")
            fake_docker.chmod(0o755)
        return fake_root, fake_script, fake_bin

    def test_missing_token_in_real_mode_fails_cleanly(self) -> None:
        env = dict(os.environ)
        env.pop("NPM_TOKEN", None)

        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root, fake_script, _ = self._create_publish_sandbox(
                tmpdir, with_dist=False
            )
            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Variable NPM_TOKEN no configurada", result.stderr)

    def test_placeholder_token_fails_cleanly(self) -> None:
        env = dict(os.environ)
        env["NPM_TOKEN"] = "npm_TU_TOKEN_DE_NPMJS_AQUI"

        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root, fake_script, _ = self._create_publish_sandbox(
                tmpdir, with_dist=False
            )
            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn(
                "Variable NPM_TOKEN no configurada o contiene el valor de ejemplo",
                result.stderr,
            )

    def test_missing_package_json_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root = Path(tmpdir)
            fake_scripts = fake_root / "scripts"
            fake_scripts.mkdir()
            fake_script = fake_scripts / "publicar-mcp.sh"
            fake_script.write_text(
                SCRIPT_PATH.read_text(encoding="utf-8"), encoding="utf-8"
            )
            fake_script.chmod(0o755)

            result = subprocess.run(
                [str(fake_script)],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("No se encontró mcp-server/package.json", result.stderr)

    def test_cdn_retry_loop_present_in_publish_script(self) -> None:
        """Verifica verificación CDN resiliente, verify-v2.sh y argv seguro."""
        content = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("VERIFY_ATTEMPTS=6", content)
        self.assertIn("VERIFY_DELAY=5", content)
        self.assertIn("Verificando propagación en el CDN", content)
        self.assertIn("Esperando propagación asíncrona del CDN", content)
        self.assertIn("npm publish concluyó con éxito", content)
        self.assertIn("ensure_fresh_dist_before_pack", content)
        self.assertIn("./example/verify-v2.sh", content)
        self.assertIn("-e NPM_TOKEN", content)
        self.assertNotIn('-e NPM_TOKEN="${NPM_TOKEN}"', content)
        self.assertIn('--registry="${NPM_REGISTRY}"', content)

    def test_prepack_fails_when_dist_stays_missing_or_stale(self) -> None:
        """Bloquea empaquetado si ignore-scripts=true y dist/index.js falta/obsoleto."""
        docker_noop_stub = (
            "#!/usr/bin/env bash\n"
            'printf "%s\\n" "$*" >> "${DOCKER_LOG_FILE}"\n'
            "exit 0\n"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root, fake_script, fake_bin = self._create_publish_sandbox(
                tmpdir, docker_noop_stub, with_dist=False
            )
            log_file = fake_root / "docker.log"
            env = dict(os.environ)
            env["PATH"] = f"{fake_bin}:{env.get('PATH', '')}"
            env["DOCKER_LOG_FILE"] = str(log_file)

            res = subprocess.run(
                [str(fake_script), "--dry-run", "--skip-tests"],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(res.returncode, 1)
            self.assertIn("dist/index.js ausente o desactualizado", res.stderr)
            self.assertNotIn("npm pack --dry-run", log_file.read_text(encoding="utf-8"))

    def test_prepack_rebuilds_stale_dist_and_completes_dry_run(self) -> None:
        """Detecta dist/index.js obsoleto, recompila en Docker y completa dry-run."""
        docker_rebuild_stub = (
            "#!/usr/bin/env bash\n"
            'printf "%s\\n" "$*" >> "${DOCKER_LOG_FILE}"\n'
            'if [[ "$*" == *"npm pack --dry-run"* ]]; then\n'
            '  echo "npm notice package size: 42.0 kB"\n'
            '  echo "npm notice total files: 12"\n'
            "  exit 0\n"
            "fi\n"
            'if [[ "$*" == *"npm view"* ]]; then\n'
            "  exit 1\n"
            "fi\n"
            'if [[ "$*" == *"pnpm --silent run build"* ]]; then\n'
            "  count=0\n"
            '  [ -f "${BUILD_COUNT_FILE}" ] && count=$(cat "${BUILD_COUNT_FILE}")\n'
            "  count=$((count + 1))\n"
            '  printf "%s" "${count}" > "${BUILD_COUNT_FILE}"\n'
            '  if [ "${count}" -ge 2 ]; then\n'
            '    mkdir -p "${MCP_DIR_PATH}/dist"\n'
            '    echo "export const ok = 1;" > "${MCP_DIR_PATH}/dist/index.js"\n'
            "  fi\n"
            "fi\n"
            "exit 0\n"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root, fake_script, fake_bin = self._create_publish_sandbox(
                tmpdir, docker_rebuild_stub, with_dist=True
            )
            dist_file = fake_root / "mcp-server" / "dist" / "index.js"
            src_file = fake_root / "mcp-server" / "src" / "index.ts"
            old_mtime = src_file.stat().st_mtime - 60
            os.utime(dist_file, (old_mtime, old_mtime))

            log_file = fake_root / "docker.log"
            build_count_file = fake_root / "build.count"
            env = dict(os.environ)
            env["PATH"] = f"{fake_bin}:{env.get('PATH', '')}"
            env["DOCKER_LOG_FILE"] = str(log_file)
            env["BUILD_COUNT_FILE"] = str(build_count_file)
            env["MCP_DIR_PATH"] = str(fake_root / "mcp-server")

            res = subprocess.run(
                [str(fake_script), "--dry-run", "--skip-tests"],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertIn("recompilando en Docker", res.stdout)
            self.assertIn("dist/index.js presente y actualizado", res.stdout)
            self.assertIn("SIMULACIÓN EXITOSA", res.stdout)
            self.assertEqual(build_count_file.read_text(encoding="utf-8"), "2")
            docker_log = log_file.read_text(encoding="utf-8")
            self.assertIn("pnpm --silent run build", docker_log)
            self.assertIn("npm pack --dry-run", docker_log)
            self.assertIn("bash ./example/verify-v2.sh", docker_log)
            self.assertIn("--registry=https://registry.npmjs.org/", docker_log)

    def test_live_publish_passes_token_by_env_not_argv_and_custom_registry(
        self,
    ) -> None:
        """Verifica -e NPM_TOKEN sin secreto en argv, --registry y chmod 600."""
        docker_live_stub = (
            "#!/usr/bin/env bash\n"
            'printf "%s\\n" "$*" >> "${DOCKER_LOG_FILE}"\n'
            'if [[ "$*" == *"npm publish"* ]]; then\n'
            '  printf "%s|%s|%s\\n" "${NPM_TOKEN:-}" "${NPM_OTP:-}" '
            '"${NPM_REGISTRY:-}" > "${ENV_CAPTURE_FILE}"\n'
            '  touch "${PUB_DONE_FLAG}"\n'
            "  exit 0\n"
            "fi\n"
            'if [[ "$*" == *"npm view"* ]]; then\n'
            '  if [ -f "${PUB_DONE_FLAG}" ]; then\n'
            '    echo "3.1.0"\n'
            "    exit 0\n"
            "  fi\n"
            "  exit 1\n"
            "fi\n"
            "exit 0\n"
        )
        token_val = "npm_" + "liveMockTokenSecret123456"
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_root, fake_script, fake_bin = self._create_publish_sandbox(
                tmpdir, docker_live_stub, with_dist=True
            )
            env_file = fake_root / ".env"
            env_file.write_text(
                f'NPM_TOKEN="{token_val}" # comentario inline\n'
                "NPM_REGISTRY='https://npm.example.org'\n"
                "NPM_OTP=654321\n",
                encoding="utf-8",
            )
            env_file.chmod(0o644)

            log_file = fake_root / "docker_live.log"
            cap_file = fake_root / "env_capture.txt"
            pub_flag = fake_root / "pub_done.flag"
            env = dict(os.environ)
            env.pop("NPM_TOKEN", None)
            env.pop("NPM_OTP", None)
            env.pop("NPM_REGISTRY", None)
            env["PATH"] = f"{fake_bin}:{env.get('PATH', '')}"
            env["DOCKER_LOG_FILE"] = str(log_file)
            env["ENV_CAPTURE_FILE"] = str(cap_file)
            env["PUB_DONE_FLAG"] = str(pub_flag)

            res = subprocess.run(
                [str(fake_script), "--skip-tests"],
                capture_output=True,
                text=True,
                cwd=str(fake_root),
                env=env,
            )
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
            docker_log = log_file.read_text(encoding="utf-8")
            self.assertNotIn(token_val, docker_log)
            self.assertIn("-e NPM_TOKEN", docker_log)
            self.assertIn("-e NPM_OTP", docker_log)
            self.assertIn("-e NPM_REGISTRY", docker_log)
            self.assertIn("--registry https://npm.example.org", docker_log)
            self.assertIn("bash ./example/verify-v2.sh", docker_log)
            self.assertEqual(
                cap_file.read_text(encoding="utf-8").strip(),
                f"{token_val}|654321|https://npm.example.org",
            )


if __name__ == "__main__":
    unittest.main()
