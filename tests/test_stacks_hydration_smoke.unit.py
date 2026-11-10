#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
test_stacks_hydration_smoke.unit.py — Suite Smoke de Hidratación e Invariantes de los 7 Stacks QA 11X.

Valida determinísticamente que las 7 plantillas corporativas (vue3, react-frontend, python,
fastapi, php, node-backend, bash-scripts), los scripts de automatización y manifest.json
cumplan todos los contratos estructurales y de seguridad v2.16.0.
"""

import json
from pathlib import Path
import shutil
import tempfile
import tomllib
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_STACKS = (
    "vue3",
    "react-frontend",
    "python",
    "fastapi",
    "php",
    "node-backend",
    "bash-scripts",
)


class TestStacksHydrationSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads((REPO_ROOT / "manifest.json").read_text(encoding="utf-8"))

    def test_all_seven_stacks_exist_and_hydrate_cleanly(self) -> None:
        """Verifica que los 7 stacks estén indexados en manifest.json y sus archivos hidraten sin colisiones."""
        stacks = self.manifest.get("stacks", {})
        for stack_name in EXPECTED_STACKS:
            self.assertIn(stack_name, stacks, f"Falta stack {stack_name} en manifest.json")
            files = stacks[stack_name].get("files", [])
            self.assertGreater(len(files), 0, f"Stack {stack_name} vacío")

            tmp_dir = Path(tempfile.mkdtemp(prefix=f"smoke_{stack_name}_"))
            try:
                for entry in files:
                    src = REPO_ROOT / entry["path"]
                    self.assertTrue(src.is_file(), f"Archivo inexistente: {entry['path']}")
                    dest = tmp_dir / entry["target_name"]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dest)
                    self.assertTrue(dest.is_file())

                # Todo stack debe tener .gitignore y docker-compose.qa.yml tras hidratar
                self.assertTrue((tmp_dir / ".gitignore").is_file(), f"Falta .gitignore en {stack_name}")
                self.assertTrue((tmp_dir / "docker-compose.qa.yml").is_file(), f"Falta compose en {stack_name}")
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_docker_compose_files_have_no_graphify_daemon_or_broken_karate_tag(self) -> None:
        """Certifica cero daemons graphify:8080 y cero imágenes inexistentes karatelabs:1.5.0."""
        for stack_name in EXPECTED_STACKS:
            compose_text = (REPO_ROOT / stack_name / "docker-compose.qa.yml").read_text(encoding="utf-8")
            self.assertNotIn("graphify:", compose_text, f"Daemon graphify residual en {stack_name}")
            self.assertNotIn("sinfallas/karatelabs:1.5.0", compose_text, f"Tag roto 1.5.0 en {stack_name}")
            if "sinfallas/karatelabs:" in compose_text:
                self.assertIn("sinfallas/karatelabs:1.5.1", compose_text)

    def test_frontend_stacks_invariants(self) -> None:
        """Verifica Playwright 1.52.0-noble, vitest/config, lighthouserc.cjs, nginx/default.conf y qa-orphans."""
        for fe in ("vue3", "react-frontend"):
            compose = (REPO_ROOT / fe / "docker-compose.qa.yml").read_text(encoding="utf-8")
            self.assertIn("mcr.microsoft.com/playwright:v1.52.0-noble", compose)
            self.assertIn("./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro", compose)
            self.assertNotIn("default.conf.example:/etc/nginx", compose)

            pkg = json.loads((REPO_ROOT / fe / "package.json.example").read_text(encoding="utf-8"))
            self.assertEqual(pkg["devDependencies"]["@playwright/test"], "1.52.0")
            self.assertIn("lighthouserc.cjs", pkg["scripts"]["test:perf"])

            vitest_cfg = (REPO_ROOT / fe / "vitest.config.ts.example").read_text(encoding="utf-8")
            self.assertIn("from 'vitest/config'", vitest_cfg)

            makefile = (REPO_ROOT / fe / "Makefile.example").read_text(encoding="utf-8")
            self.assertIn("qa-orphans:", makefile)
            self.assertNotIn("--profile graphify", makefile)

            self.assertTrue((REPO_ROOT / fe / "lighthouserc.cjs.example").is_file())
            feature = (REPO_ROOT / fe / "test" / "ui_business_flow.feature").read_text(encoding="utf-8")
            self.assertGreaterEqual(feature.count("Scenario:"), 5)

    def test_python_and_fastapi_invariants(self) -> None:
        """Verifica TOML válido, UV_CACHE_DIR=/tmp/uv-cache, Radon Grado A, pip-audit y rol app_user RLS."""
        for py in ("python", "fastapi"):
            pyproject = tomllib.loads((REPO_ROOT / py / "pyproject.toml.example").read_text(encoding="utf-8"))
            addopts = pyproject["tool"]["pytest"]["ini_options"]["addopts"]
            self.assertIn("--import-mode=importlib", addopts)
            self.assertIn("--cov-fail-under=95", addopts)

            tox_cfg = (REPO_ROOT / py / "tox.ini.example").read_text(encoding="utf-8")
            self.assertNotIn("uv pip audit", tox_cfg)
            self.assertIn("pip-audit", tox_cfg)
            self.assertIn("'--min', 'B'", tox_cfg)

            compose = (REPO_ROOT / py / "docker-compose.qa.yml").read_text(encoding="utf-8")
            self.assertIn("/tmp/uv-cache", compose)
            self.assertNotIn("/root/.cache/uv", compose)

        fastapi_compose = (REPO_ROOT / "fastapi" / "docker-compose.qa.yml").read_text(encoding="utf-8")
        self.assertIn("app_user:app_password", fastapi_compose)
        self.assertNotIn("alembic upgrade head 2>/dev/null || true", fastapi_compose)
        rls_sql = (REPO_ROOT / "fastapi" / "initdb" / "01-init-rls-role.sql.example").read_text(encoding="utf-8")
        self.assertIn("NOBYPASSRLS", rls_sql)

        locust_text = (REPO_ROOT / "fastapi" / "locustfile.py.example").read_text(encoding="utf-8")
        self.assertNotIn("[cite:", locust_text)
        self.assertIn("Idempotency-Key", locust_text)

    def test_php_node_and_bash_invariants(self) -> None:
        """Verifica PHP 8.4/8.5 ini limpio, Pumba acotado, Karate Idempotency-Key y kcov SYS_PTRACE."""
        php_ini_active = "\n".join(
            line
            for line in (REPO_ROOT / "php" / "php.ini.example").read_text(encoding="utf-8").splitlines()
            if not line.strip().startswith(";")
        )
        self.assertNotIn("session.sid_length", php_ini_active)
        self.assertNotIn("session.sid_bits_per_character", php_ini_active)

        php_compose = (REPO_ROOT / "php" / "docker-compose.qa.yml").read_text(encoding="utf-8")
        self.assertNotIn("--interval 20s", php_compose)
        self.assertIn("./test:/app/src/test/java/examples/test", php_compose)

        node_feature = (REPO_ROOT / "node-backend" / "test" / "node_api.feature").read_text(encoding="utf-8")
        self.assertIn("Idempotency-Key", node_feature)

        bash_compose = (REPO_ROOT / "bash-scripts" / "docker-compose.qa.yml").read_text(encoding="utf-8")
        self.assertIn("SYS_PTRACE", bash_compose)
        self.assertNotIn("..:/repo:ro", bash_compose)
        self.assertFalse((REPO_ROOT / "bash-scripts" / "test" / "test_install_skill.bats").exists())

        limpieza = (REPO_ROOT / "scripts" / "limpieza.sh").read_text(encoding="utf-8")
        self.assertNotIn("/workspace/mcp-server/dist", limpieza)


if __name__ == "__main__":
    unittest.main()
