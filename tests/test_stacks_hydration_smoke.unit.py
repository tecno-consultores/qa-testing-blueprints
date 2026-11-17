# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
test_stacks_hydration_smoke.unit.py — Smoke de Hidratación e Invariantes 11X.

Valida determinísticamente que las 10 plantillas corporativas (vue3,
react-frontend, python, fastapi, php, node-backend, bash-scripts,
mobile-appium, ai-evals, vibe-rescue), los scripts de automatización y
manifest.json cumplan todos los contratos estructurales y de seguridad v3.1.
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_architect_budget_bytes() -> int:
    existing = sys.modules.get("_budgets")
    if existing is not None:
        return int(existing.ARCHITECT_SKILL_MAX_BYTES)
    budgets_path = REPO_ROOT / ".agents" / "scripts" / "_budgets.py"
    spec = importlib.util.spec_from_file_location("_budgets", budgets_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_budgets"] = mod
    spec.loader.exec_module(mod)
    return int(mod.ARCHITECT_SKILL_MAX_BYTES)


ARCHITECT_SKILL_MAX_BYTES = _load_architect_budget_bytes()
EXPECTED_STACKS = (
    "vue3",
    "react-frontend",
    "python",
    "fastapi",
    "php",
    "node-backend",
    "bash-scripts",
    "mobile-appium",
    "ai-evals",
    "vibe-rescue",
)
COMPOSE_ENABLED_STACKS = EXPECTED_STACKS


def _load_yaml_mapping(raw_text: str) -> dict[str, Any]:
    yaml_mod = importlib.import_module("yaml")
    parsed = yaml_mod.safe_load(raw_text)
    return parsed if isinstance(parsed, dict) else {}


def _seed_cleanup_artifacts(
    fake_repo: Path, fake_home: Path, fake_tmp: Path
) -> None:
    """Crea artefactos efímeros y protegidos para validar scripts/limpieza.sh."""
    (fake_home / ".cache" / "qa_mcp_cleanroom_abc123").mkdir(parents=True)
    (fake_tmp / "qa-11x-mcp-example-e2e-xyz789").mkdir(parents=True)
    (fake_tmp / "qa-11x-last-failure.json").write_text(
        '{"status":"failed"}', encoding="utf-8"
    )
    (fake_tmp / "qa11x-certify.12345").mkdir(parents=True)
    for rel_dir in (
        ".pnpm-store",
        ".turbo",
        "allure-results",
        ".deepeval",
        ".promptfoo",
        "bash-scripts/coverage_report",
        "mcp-server/example/frontend/dist",
        "mcp-server/example/frontend/node_modules/pkg",
    ):
        (fake_repo / rel_dir).mkdir(parents=True)
    (fake_repo / "release-readiness.json").write_text("{}", encoding="utf-8")
    (fake_repo / "sbom.cyclonedx.json").write_text("{}", encoding="utf-8")
    (fake_repo / ".DS_Store").write_text("mac", encoding="utf-8")
    (fake_repo / "src").mkdir()
    (fake_repo / "src" / "Thumbs.db").write_text("win", encoding="utf-8")
    (fake_repo / "src" / "orphan.swp").write_text("vim", encoding="utf-8")
    (fake_repo / "src" / "merge.orig").write_text("orig", encoding="utf-8")
    (fake_repo / "ACTIVE_TASK.md").write_text(
        "# misplaced root active task", encoding="utf-8"
    )


def _seed_protected_artifacts(fake_repo: Path, fake_home: Path) -> None:
    """Crea artefactos protegidos que deben sobrevivir a la limpieza normal."""
    (fake_repo / "mcp-server" / "dist").mkdir(parents=True)
    (fake_repo / "mcp-server" / "dist" / "index.js").write_text(
        "// built", encoding="utf-8"
    )
    (fake_repo / "mcp-server" / "example" / "fixtures").mkdir(parents=True)
    (
        fake_repo / "mcp-server" / "example" / "fixtures" / "ast-graph.seed.json"
    ).write_text("{}", encoding="utf-8")
    (fake_repo / "graphify-out").mkdir()
    (fake_repo / "graphify-out" / "graph.json").write_text("{}", encoding="utf-8")
    (fake_repo / "graphify-out" / "manifest.json").write_text("{}", encoding="utf-8")
    (fake_repo / "graphify-out" / "stray.tmp").write_text("junk", encoding="utf-8")
    (fake_repo / "graphify-out" / "cache").mkdir()
    (fake_repo / ".qa-11x-version").write_text(
        '{"version":"2.20.1"}', encoding="utf-8"
    )
    (fake_repo / "zap.yaml").write_text("env: {}", encoding="utf-8")
    (fake_repo / ".agents" / "proposals").mkdir(parents=True)
    (fake_repo / ".agents" / "proposals" / "draft.md").write_text(
        "# draft", encoding="utf-8"
    )
    (fake_repo / ".agents" / "ACTIVE_TASK.md").write_text(
        "# valid active task", encoding="utf-8"
    )
    (fake_repo / ".agents" / ".cache" / "coverage").mkdir(parents=True)
    (fake_repo / ".agents" / ".cache" / "coverage" / "py.xml").write_text(
        "<cov/>", encoding="utf-8"
    )
    (fake_repo / ".agents" / ".cache" / "session_checkpoint.json").write_text(
        '{"status":"IN_PROGRESS"}', encoding="utf-8"
    )
    (fake_repo / ".agents" / ".cache" / "certify_state.json").write_text(
        "{}", encoding="utf-8"
    )
    (fake_home / ".cache" / "qa-11x-blueprints").mkdir(parents=True)
    (
        fake_home / ".cache" / "qa-11x-blueprints" / "latest-version-check.json"
    ).write_text("{}", encoding="utf-8")


def _build_isolated_cleanup_env(
    tmp_path: Path, fake_home: Path, fake_tmp: Path
) -> dict[str, str]:
    """Aísla PATH sin binario docker para probar limpieza Bash pura."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for tool_name in ("bash", "dirname", "cd", "pwd", "find", "rm", "id"):
        resolved = shutil.which(tool_name)
        if resolved:
            (bin_dir / tool_name).symlink_to(resolved)
    return {
        "HOME": str(fake_home),
        "TMPDIR": str(fake_tmp),
        "PATH": str(bin_dir),
        "LC_ALL": "C",
    }


class TestStacksHydrationSmoke(unittest.TestCase):
    def setUp(self) -> None:
        manifest_raw = (REPO_ROOT / "manifest.json").read_text(encoding="utf-8")
        self.manifest: dict[str, Any] = json.loads(manifest_raw)

    def _hydrate_stack_into_dir(
        self, stack_name: str, files: list[dict[str, Any]], tmp_dir: Path
    ) -> None:
        stack_dir = REPO_ROOT / stack_name
        for required_cat1 in ("docker-compose.qa.yml", "limpieza.sh"):
            self.assertTrue(
                (stack_dir / required_cat1).is_file(),
                f"Falta {required_cat1} en {stack_name}",
            )
        self.assertFalse(
            (stack_dir / "docker-compose.qa.yml.example").exists(),
            f"Archivo legado docker-compose.qa.yml.example en {stack_name}",
        )
        for required_cat3 in ("Makefile.example", "gitignore.example"):
            self.assertTrue(
                (stack_dir / required_cat3).is_file(),
                f"Falta {required_cat3} en {stack_name}",
            )

        for entry in files:
            src = REPO_ROOT / entry["path"]
            self.assertTrue(src.is_file(), f"Archivo inexistente: {entry['path']}")
            dest = tmp_dir / entry["target_name"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            self.assertTrue(dest.is_file())

        for target_rel in (
            ".gitignore",
            "docker-compose.qa.yml",
            "Makefile",
            "limpieza.sh",
        ):
            self.assertTrue(
                (tmp_dir / target_rel).is_file(),
                f"Falta {target_rel} hidratado en {stack_name}",
            )

    def _assert_compose_ports_loopback(
        self, stack_name: str, compose_text: str
    ) -> None:
        compose_data = _load_yaml_mapping(compose_text)
        services = compose_data.get("services")
        self.assertIsInstance(
            services, dict, f"Compose inválido sin services en {stack_name}"
        )
        assert isinstance(services, dict)
        for svc_name, svc_cfg in services.items():
            if not isinstance(svc_cfg, dict):
                continue
            for port_entry in svc_cfg.get("ports") or []:
                self._assert_single_port_loopback(stack_name, svc_name, port_entry)

    def _assert_single_port_loopback(
        self, stack_name: str, svc_name: str, port_entry: Any
    ) -> None:
        if isinstance(port_entry, str):
            self.assertTrue(
                port_entry.startswith("127.0.0.1:"),
                f"Puerto sin prefijo 127.0.0.1: en {stack_name}/{svc_name}: "
                f"{port_entry}",
            )
            return
        if isinstance(port_entry, dict):
            self.assertEqual(
                port_entry.get("host_ip"),
                "127.0.0.1",
                f"Puerto sin host_ip 127.0.0.1 en {stack_name}/{svc_name}: "
                f"{port_entry}",
            )
            return
        self.fail(
            f"Formato de puerto inválido en {stack_name}/{svc_name}: {port_entry!r}"
        )

    def _assert_eslint_flat_config_example(self, stack_dir: Path) -> None:
        """Verifica la plantilla ESLint 9 Flat Config (eslint.config.mjs.example)."""
        eslint_path = stack_dir / "eslint.config.mjs.example"
        self.assertTrue(eslint_path.is_file(), f"Falta {eslint_path}")
        eslint_cfg = eslint_path.read_text(encoding="utf-8")
        self.assertGreater(len(eslint_cfg.strip()), 0, f"{eslint_path} está vacío")
        for token in (
            "no-floating-promises",
            "no-misused-promises",
            "sonarjs",
            "security",
            "graphify-out/",
            "dist/",
            "coverage/",
        ):
            self.assertIn(token, eslint_cfg, f"Falta '{token}' en {eslint_path}")

    def _assert_single_frontend_stack(self, fe: str) -> None:
        fe_dir = REPO_ROOT / fe
        self.assertTrue(
            (fe_dir / "tsconfig.json.example").is_file(),
            f"Falta tsconfig.json.example en {fe}",
        )
        self.assertTrue(
            (fe_dir / "vite.config.ts.example").is_file(),
            f"Falta vite.config.ts.example en {fe}",
        )
        compose = (fe_dir / "docker-compose.qa.yml").read_text(encoding="utf-8")
        for expected_tok in (
            "mcr.microsoft.com/playwright:v1.52.0-noble",
            "nginxinc/nginx-unprivileged",
            "qa-frontend",
            ":8080",
            "./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro",
        ):
            self.assertIn(expected_tok, compose, f"Falta {expected_tok} en {fe}")
        self.assertNotIn("default.conf.example:/etc/nginx", compose)
        self.assertNotIn("qa-vue3", compose)

        pkg = json.loads((fe_dir / "package.json.example").read_text(encoding="utf-8"))
        self.assertEqual(pkg["devDependencies"]["@playwright/test"], "1.52.0")
        self.assertIn("lighthouserc.cjs", pkg["scripts"]["test:perf"])
        self.assertNotIn("pnpm", pkg, f"Clave obsoleta package.json#pnpm en {fe}")

        vitest_cfg = (fe_dir / "vitest.config.ts.example").read_text(encoding="utf-8")
        self.assertIn("from 'vitest/config'", vitest_cfg)
        self.assertIn("setupFiles:", vitest_cfg)

        makefile = (fe_dir / "Makefile.example").read_text(encoding="utf-8")
        self.assertIn("qa-orphans:", makefile)
        self.assertIn("qa-frontend", makefile)
        self.assertNotIn("qa-vue3", makefile)
        self.assertNotIn("--profile graphify", makefile)

        self.assertTrue((fe_dir / "lighthouserc.cjs.example").is_file())
        pnpm_ws = (fe_dir / "pnpm-workspace.yaml.example").read_text(encoding="utf-8")
        self.assertIn("allowBuilds:", pnpm_ws)
        self.assertNotIn("\n  - esbuild", pnpm_ws)
        self.assertIn("esbuild: true", pnpm_ws)

        self._assert_eslint_flat_config_example(fe_dir)

        vitest_setup = (fe_dir / "vitest.setup.ts.example").read_text(encoding="utf-8")
        self.assertIn("localStorage", vitest_setup)

        feature = (fe_dir / "test" / "ui_business_flow.feature").read_text(
            encoding="utf-8"
        )
        self.assertGreaterEqual(feature.count("Scenario:"), 5)
        self.assertNotIn("type: 'chrome'", feature)
        self.assertIn("* string xmlText = response", feature)

    def test_all_ten_stacks_exist_and_hydrate_cleanly(self) -> None:
        """Verifica que los 10 stacks indexados hidraten sin colisiones."""
        stacks = self.manifest.get("stacks", {})
        self.assertEqual(set(stacks.keys()), set(EXPECTED_STACKS))
        for stack_name in EXPECTED_STACKS:
            self.assertIn(
                stack_name, stacks, f"Falta stack {stack_name} en manifest.json"
            )
            files = stacks[stack_name].get("files", [])
            self.assertGreater(len(files), 0, f"Stack {stack_name} vacío")

            tmp_dir = Path(tempfile.mkdtemp(prefix=f"smoke_{stack_name}_"))
            try:
                self._hydrate_stack_into_dir(stack_name, files, tmp_dir)
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_docker_compose_files_have_no_graphify_daemon_or_broken_karate_tag(
        self,
    ) -> None:
        """Certifica cero graphify:8080, karatelabs:1.5.1 y puertos 127.0.0.1."""
        for stack_name in COMPOSE_ENABLED_STACKS:
            compose_path = REPO_ROOT / stack_name / "docker-compose.qa.yml"
            self.assertTrue(compose_path.is_file(), f"Falta compose QA en {stack_name}")
            self.assertFalse(
                (REPO_ROOT / stack_name / "docker-compose.qa.yml.example").exists(),
                f"Archivo legado docker-compose.qa.yml.example en {stack_name}",
            )
            compose_text = compose_path.read_text(encoding="utf-8")
            self.assertNotIn(
                "graphify:", compose_text, f"Daemon graphify residual en {stack_name}"
            )
            self.assertNotIn(
                "sinfallas/karatelabs:1.5.0",
                compose_text,
                f"Tag roto 1.5.0 en {stack_name}",
            )
            if "sinfallas/karatelabs:" in compose_text:
                self.assertIn("sinfallas/karatelabs:1.5.1", compose_text)
            self._assert_compose_ports_loopback(stack_name, compose_text)

    def test_frontend_stacks_invariants(self) -> None:
        """Verifica Vite/TS, nginx-unprivileged, qa-frontend, :8080 y Playwright."""
        for fe in ("vue3", "react-frontend"):
            self._assert_single_frontend_stack(fe)

        vue_pkg = json.loads(
            (REPO_ROOT / "vue3" / "package.json.example").read_text(encoding="utf-8")
        )
        self.assertEqual(vue_pkg["devDependencies"]["vue-tsc"], "^2.2.12")

    def test_python_and_fastapi_invariants(self) -> None:
        """Verifica TOML válido, /tmp/uv-cache, Radon A, pip-audit y rol app_user."""
        for py in ("python", "fastapi"):
            pyproject_raw = (REPO_ROOT / py / "pyproject.toml.example").read_text(
                encoding="utf-8"
            )
            pyproject = tomllib.loads(pyproject_raw)
            addopts = pyproject["tool"]["pytest"]["ini_options"]["addopts"]
            self.assertIn("--import-mode=importlib", addopts)
            self.assertIn("--cov-fail-under=95", addopts)

            tox_cfg = (REPO_ROOT / py / "tox.ini.example").read_text(encoding="utf-8")
            self.assertNotIn("uv pip audit", tox_cfg)
            self.assertIn("pip-audit", tox_cfg)
            self.assertIn("'--min', 'B'", tox_cfg)

            compose = (REPO_ROOT / py / "docker-compose.qa.yml").read_text(
                encoding="utf-8"
            )
            self.assertIn("/tmp/uv-cache", compose)
            self.assertNotIn("/root/.cache/uv", compose)

        fastapi_compose = (REPO_ROOT / "fastapi" / "docker-compose.qa.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("app_user:app_password", fastapi_compose)
        self.assertNotIn("alembic upgrade head 2>/dev/null || true", fastapi_compose)

        rls_sql = (
            REPO_ROOT / "fastapi" / "initdb" / "01-init-rls-role.sql.example"
        ).read_text(encoding="utf-8")
        self.assertIn("NOBYPASSRLS", rls_sql)

        locust_text = (REPO_ROOT / "fastapi" / "locustfile.py.example").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("[cite:", locust_text)
        self.assertIn("Idempotency-Key", locust_text)

        self.assertTrue(
            (
                REPO_ROOT
                / "fastapi"
                / "tests"
                / "test_production_no_dev_cleanliness.unit.py.example"
            ).is_file()
        )
        self.assertFalse(
            (
                REPO_ROOT
                / "fastapi"
                / "test"
                / "test_production_no_dev_cleanliness.unit.py.example"
            ).exists()
        )

    def test_php_node_and_bash_invariants(self) -> None:
        """Verifica PHP 8.4/8.5 ini, Karate Idempotency-Key y kcov SYS_PTRACE."""
        php_ini_lines = (
            (REPO_ROOT / "php" / "php.ini.example")
            .read_text(encoding="utf-8")
            .splitlines()
        )
        php_ini_active = "\n".join(
            line for line in php_ini_lines if not line.strip().startswith(";")
        )
        self.assertNotIn("session.sid_length", php_ini_active)
        self.assertNotIn("session.sid_bits_per_character", php_ini_active)

        for php_doc_rel in (
            ".agents/skills/qa-11x-architect/references/06-stack-php.md",
            "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
            "docs/specs/10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md",
        ):
            php_doc = (REPO_ROOT / php_doc_rel).read_text(encoding="utf-8")
            self.assertNotIn("session.sid_length = 48", php_doc)
            self.assertNotIn("session.sid_length=48", php_doc)
            self.assertNotIn("session.sid_bits_per_character = 6", php_doc)

        php_composer = json.loads(
            (REPO_ROOT / "php" / "composer.json.example").read_text(encoding="utf-8")
        )
        self.assertIn("-d pcov.directory=src", php_composer["scripts"]["qa:unit"])
        self.assertIn("-d pcov.directory=src", php_composer["scripts"]["qa:mutation"])

        auditar_infra = (REPO_ROOT / "scripts" / "auditar-infra.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'TRIVY_SKIP_DIRS="node_modules,.git,dist,target,graphify-out,vendor,.venv"',
            auditar_infra,
        )

        php_compose = (REPO_ROOT / "php" / "docker-compose.qa.yml").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("--interval 20s", php_compose)
        self.assertIn("./test:/app/src/test/java/examples/test", php_compose)

        node_feature = (
            REPO_ROOT / "node-backend" / "test" / "node_api.feature"
        ).read_text(encoding="utf-8")
        self.assertIn("Idempotency-Key", node_feature)
        node_pkg = json.loads(
            (REPO_ROOT / "node-backend" / "package.json.example").read_text(
                encoding="utf-8"
            )
        )
        self.assertNotIn("pnpm", node_pkg)
        node_ws = (
            REPO_ROOT / "node-backend" / "pnpm-workspace.yaml.example"
        ).read_text(encoding="utf-8")
        self.assertIn("allowBuilds:", node_ws)
        self.assertIn("esbuild: true", node_ws)
        self._assert_eslint_flat_config_example(REPO_ROOT / "node-backend")

        bash_compose = (REPO_ROOT / "bash-scripts" / "docker-compose.qa.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("SYS_PTRACE", bash_compose)
        self.assertNotIn("..:/repo:ro", bash_compose)
        self.assertFalse(
            (REPO_ROOT / "bash-scripts" / "test" / "test_install_skill.bats").exists()
        )

        limpieza = (REPO_ROOT / "scripts" / "limpieza.sh").read_text(encoding="utf-8")
        self.assertNotIn("/workspace/mcp-server/dist", limpieza)

    def test_node_stacks_and_ci_enforce_non_root_host_uid_and_pnpm_store_init(
        self,
    ) -> None:
        """Previene regresiones os error 13 en base-node-ionic:26."""
        ci_workflow = (REPO_ROOT / ".github" / "workflows" / "qa-11x-ci.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            "make lint && make build && make test-mcp && make test-example",
            ci_workflow,
        )
        root_makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
        self.assertIn('-u "$$(id -u):$$(id -g)"', root_makefile)
        self.assertIn("pnpm install --frozen-lockfile --prefer-offline", root_makefile)
        mcp_makefile = (REPO_ROOT / "mcp-server" / "Makefile").read_text(
            encoding="utf-8"
        )
        self.assertIn('run --rm -T -u "$(QA_UID):$(QA_GID)"', mcp_makefile)

        node_targets = (
            ("mcp-server", "Makefile"),
            ("vue3", "Makefile.example"),
            ("react-frontend", "Makefile.example"),
            ("node-backend", "Makefile.example"),
        )
        for folder, makefile_name in node_targets:
            compose_text = (REPO_ROOT / folder / "docker-compose.qa.yml").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                "pnpm-store-init:", compose_text, f"Falta pnpm-store-init en {folder}"
            )
            self.assertIn(
                '["chmod", "-R", "a+rwX", "/pnpm"]',
                compose_text,
                f"Falta chmod -R a+rwX en {folder}",
            )
            self.assertIn(
                "pnpm_config_store_dir: /pnpm/store",
                compose_text,
                f"Falta pnpm_config_store_dir en {folder}",
            )
            self.assertNotRegex(
                compose_text,
                r"\bnpm_config_store_dir:",
                f"Variable legacy npm_config_store_dir en {folder}",
            )
            self.assertIn(
                'user: "${QA_UID:-1000}:${QA_GID:-1000}"',
                compose_text,
                f"Falta user QA_UID en {folder}",
            )

            makefile_text = (REPO_ROOT / folder / makefile_name).read_text(
                encoding="utf-8"
            )
            self.assertIn(
                "export QA_UID", makefile_text, f"Falta export QA_UID en {folder}"
            )
            self.assertIn(
                '-u "$(QA_UID):$(QA_GID)"',
                makefile_text,
                f"Falta flag -u en {folder}/{makefile_name}",
            )

    def test_mcp_example_e2e_harness_and_four_gates_wired(self) -> None:
        """Verifica mcp-server/example/ y sus 4 barreras (publish/CI/hook/Make)."""
        example_dir = REPO_ROOT / "mcp-server" / "example"
        for rel in (
            "README.md",
            "run-example-e2e.mjs",
            "Makefile",
            "docker-compose.qa.yml",
            "backend/pyproject.toml",
            "backend/src/models/device.py",
            "backend/src/services/device_service.py",
            "backend/src/api/devices.py",
            "backend/migrations/versions/0001_create_telemetry_devices.py",
            "frontend/package.json",
            "frontend/src/views/DevicesDashboard.vue",
            "frontend/src/views/DevicesDashboard.unit.ts",
            "fixtures/ast-graph.seed.json",
        ):
            self.assertTrue(
                (example_dir / rel).is_file(),
                f"Falta archivo semilla en example/: {rel}",
            )

        probar_script = (REPO_ROOT / "scripts" / "probar-mcp-example.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn("--exclude='./mcp-server/node_modules'", probar_script)
        self.assertIn("pnpm run test:example", probar_script)

        publicar_script = (REPO_ROOT / "scripts" / "publicar-mcp.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn("pnpm --silent run test:example", publicar_script)

        lefthook_text = (REPO_ROOT / "lefthook.yml").read_text(encoding="utf-8")
        self.assertIn("mcp-example-smoke:", lefthook_text)
        self.assertIn("./scripts/probar-mcp-example.sh --in-place", lefthook_text)

        hooks_sh = (REPO_ROOT / "instalar-hooks.sh").read_text(encoding="utf-8")
        self.assertIn("./scripts/probar-mcp-example.sh --in-place", hooks_sh)

        root_makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
        self.assertIn("test-example:", root_makefile)
        self.assertIn("./scripts/probar-mcp-example.sh", root_makefile)

    def _assert_normal_cleanup_state(
        self, fake_repo: Path, fake_home: Path, fake_tmp: Path
    ) -> None:
        purged = (
            fake_home / ".cache" / "qa_mcp_cleanroom_abc123",
            fake_tmp / "qa-11x-mcp-example-e2e-xyz789",
            fake_tmp / "qa-11x-last-failure.json",
            fake_tmp / "qa11x-certify.12345",
            fake_repo / ".pnpm-store",
            fake_repo / ".turbo",
            fake_repo / "allure-results",
            fake_repo / ".deepeval",
            fake_repo / ".promptfoo",
            fake_repo / "release-readiness.json",
            fake_repo / "sbom.cyclonedx.json",
            fake_repo / "bash-scripts" / "coverage_report",
            fake_repo / "mcp-server" / "example" / "frontend" / "dist",
            fake_repo / "mcp-server" / "example" / "frontend" / "node_modules",
            fake_repo / ".DS_Store",
            fake_repo / "src" / "Thumbs.db",
            fake_repo / "src" / "orphan.swp",
            fake_repo / "src" / "merge.orig",
            fake_repo / "ACTIVE_TASK.md",
            fake_repo / "graphify-out" / "cache",
            fake_repo / "graphify-out" / "stray.tmp",
            fake_repo / ".agents" / ".cache" / "coverage",
        )
        for p in purged:
            self.assertFalse(p.exists(), f"Debió purgarse: {p}")

        preserved = (
            fake_repo / "mcp-server" / "dist" / "index.js",
            fake_repo / "mcp-server" / "example" / "fixtures" / "ast-graph.seed.json",
            fake_repo / "graphify-out" / "graph.json",
            fake_repo / "graphify-out" / "manifest.json",
            fake_repo / ".qa-11x-version",
            fake_repo / "zap.yaml",
            fake_repo / ".agents" / "proposals" / "draft.md",
            fake_repo / ".agents" / "ACTIVE_TASK.md",
            fake_repo / ".agents" / ".cache" / "session_checkpoint.json",
            fake_repo / ".agents" / ".cache" / "certify_state.json",
            fake_home / ".cache" / "qa-11x-blueprints" / "latest-version-check.json",
        )
        for p in preserved:
            self.assertTrue(p.is_file(), f"Debió preservarse: {p}")

    def test_cleanup_scripts_cover_v2_20_artifacts_and_preserve_mcp_invariants(
        self,
    ) -> None:
        """Verifica limpieza normal/--deep preservando dist, version, task y AST."""
        root_clean = (REPO_ROOT / "scripts" / "limpieza.sh").read_text(encoding="utf-8")
        for expected in (
            "qa_mcp_cleanroom_",
            "qa-11x-mcp-example-e2e-",
            "qa-11x-last-failure.json",
            "qa11x-certify.",
            "allure-results",
            ".deepeval",
            ".promptfoo",
            ".DS_Store",
            "Thumbs.db",
            ".pnpm-store",
            ".turbo",
            "sbom.cyclonedx.json",
            ".agents/proposals",
            "qa-11x-blueprints",
            "-user 10001",
            '-not -path "./mcp-server/example/*"',
        ):
            self.assertIn(expected, root_clean, f"Falta '{expected}' en limpieza.sh")

        gitignore_text = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        for gi_pattern in (
            ".agents/proposals/",
            ".turbo/",
            "allure-results/",
            ".deepeval/",
            ".promptfoo/",
            "qa-11x-last-failure.json",
        ):
            self.assertIn(
                gi_pattern, gitignore_text, f"Falta '{gi_pattern}' en .gitignore"
            )

        for node_stack in ("vue3", "react-frontend", "node-backend"):
            stack_clean = (REPO_ROOT / node_stack / "limpieza.sh").read_text(
                encoding="utf-8"
            )
            self.assertIn(".pnpm-store", stack_clean)
            self.assertIn("-user 10001", stack_clean)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            fake_repo = tmp_path / "repo"
            fake_home = tmp_path / "home"
            fake_tmp = tmp_path / "tmpdir"
            (fake_repo / "scripts").mkdir(parents=True)
            shutil.copy2(
                REPO_ROOT / "scripts" / "limpieza.sh",
                fake_repo / "scripts" / "limpieza.sh",
            )
            _seed_cleanup_artifacts(fake_repo, fake_home, fake_tmp)
            _seed_protected_artifacts(fake_repo, fake_home)
            env = _build_isolated_cleanup_env(tmp_path, fake_home, fake_tmp)

            proc = subprocess.run(
                [str(fake_repo / "scripts" / "limpieza.sh"), "--quiet"],
                cwd=fake_repo,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stderr)
            self._assert_normal_cleanup_state(fake_repo, fake_home, fake_tmp)

            proc_deep = subprocess.run(
                [str(fake_repo / "scripts" / "limpieza.sh"), "--quiet", "--deep"],
                cwd=fake_repo,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc_deep.returncode, 0, msg=proc_deep.stderr)
            self.assertFalse((fake_repo / ".agents" / "proposals").exists())
            self.assertFalse((fake_repo / ".agents" / ".cache").exists())
            self.assertFalse((fake_home / ".cache" / "qa-11x-blueprints").exists())
            self.assertTrue((fake_repo / "mcp-server" / "dist" / "index.js").is_file())
            self.assertTrue((fake_repo / ".qa-11x-version").is_file())
            self.assertTrue((fake_repo / ".agents" / "ACTIVE_TASK.md").is_file())

    def test_prepush_ci_parity_and_karate_skill_catalog_sync(self) -> None:
        """Garantiza paridad pre-push <-> CI y sincronía Karate con manifest.json."""
        lefthook_text = (REPO_ROOT / "lefthook.yml").read_text(encoding="utf-8")
        parsed_lefthook = _load_yaml_mapping(lefthook_text)
        self.assertEqual(set(parsed_lefthook), {"pre-commit", "commit-msg", "pre-push"})
        hooks_sh = (REPO_ROOT / "instalar-hooks.sh").read_text(encoding="utf-8")
        required_parity_tokens = (
            "sinfallas/karatelabs:1.5.1",
            (
                "sinfallas/base-bash-qa@sha256:"
                "2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7"
            ),
            "tests/*.unit.py",
            "tests/meta_qa/test_governance_scripts.py",
            "validate_calm_architecture.sh",
            "certify_task_completion.sh",
            "mobile-appium vibe-rescue .github",
            "MCP_EXTRA_VOLS",
            "-e _USER=qa",
        )
        for token in required_parity_tokens:
            self.assertIn(token, lefthook_text, f"Falta '{token}' en lefthook.yml")
            self.assertIn(token, hooks_sh, f"Falta '{token}' en instalar-hooks.sh")

        skill_paths = sorted(
            entry["path"]
            for entry in self.manifest.get("agent_governance_files", [])
            if isinstance(entry, dict)
            and str(entry.get("path", "")).startswith(".agents/skills/")
            and str(entry.get("path", "")).endswith("/SKILL.md")
        )
        self.assertEqual(len(skill_paths), 11)

        feature_text = (
            REPO_ROOT / "mcp-server" / "test" / "mcp_cli_test.feature"
        ).read_text(encoding="utf-8")
        count_match = re.search(r"match skillFiles == '#\[(\d+)\]'", feature_text)
        self.assertIsNotNone(
            count_match, "Falta aserción '#[N]' sobre skillFiles en mcp_cli_test"
        )
        assert count_match is not None
        self.assertEqual(
            int(count_match.group(1)),
            len(skill_paths),
            f"Desfase Karate skillFiles ({count_match.group(1)}) vs manifest",
        )
        for skill_path in skill_paths:
            self.assertIn(
                skill_path, feature_text, f"Falta '{skill_path}' en mcp_cli_test"
            )

    def test_mandatory_existing_test_sync_directive_across_governance(self) -> None:
        """Garantiza invariante QA-TEST-SYNC-01 en ambas capas y SKILL.md < 12KB."""
        required_docs = (
            "AGENTS.md",
            ".agents/rules/mandatory_qa_pyramid_and_doc_sync.md",
            ".agents/rules/anti_regression_and_side_effects_guardrail.md",
            ".agents/skills/qa-11x-architect/SKILL.md",
            "AI_MASTER_PROMPT.md",
            "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
        )
        for rel_path in required_docs:
            content = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
            self.assertIn(
                "QA-TEST-SYNC-01",
                content,
                f"Falta directiva obligatoria 'QA-TEST-SYNC-01' en {rel_path}",
            )

        architect_skill = (
            REPO_ROOT / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
        )
        self.assertLessEqual(
            architect_skill.stat().st_size,
            ARCHITECT_SKILL_MAX_BYTES,
            "qa-11x-architect/SKILL.md supera el límite compacto de _budgets.py",
        )

    def test_wave1_new_stack_templates_and_eval_helpers_exist(self) -> None:
        """Valida plantillas y contratos añadidos en node-backend, php, vibe y ai."""
        node_build_cfg = json.loads(
            (REPO_ROOT / "node-backend" / "tsconfig.build.json.example").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(node_build_cfg["extends"], "./tsconfig.json")
        self.assertIs(node_build_cfg["compilerOptions"]["noEmit"], False)
        self.assertIs(
            node_build_cfg["compilerOptions"]["allowImportingTsExtensions"], False
        )
        self.assertEqual(node_build_cfg["compilerOptions"]["outDir"], "./dist")

        psalm_root = ET.fromstring(
            (REPO_ROOT / "php" / "psalm.xml.example").read_text(encoding="utf-8")
        )
        self.assertEqual(psalm_root.attrib.get("errorLevel"), "1")
        src_dirs = [
            el.attrib.get("name")
            for el in psalm_root.iter()
            if el.tag.endswith("directory")
        ]
        self.assertIn("src", src_dirs)
        self.assertIn("tests", src_dirs)

        vibe_test = (
            REPO_ROOT / "vibe-rescue" / "tests" / "test_audit_vibe_prototype.unit.py"
        ).read_text(encoding="utf-8")
        self.assertIn("audit_vibe_prototype", vibe_test)
        self.assertIn("VIBE-QA-005", vibe_test)

        llm_judge = (REPO_ROOT / "ai-evals" / "_llm_judge.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("def resolve_deepeval_judge_model", llm_judge)

    def test_mobile_appium_stack_hydrates_cleanly_with_dedicated_image(self) -> None:
        """Verifica mobile-appium/docker-compose.qa.yml, --allow-insecure= y Spec 20."""
        mobile_dir = REPO_ROOT / "mobile-appium"
        self.assertFalse(
            (mobile_dir / "docker-compose.qa.yml.example").exists(),
            "Archivo legado mobile-appium/docker-compose.qa.yml.example presente",
        )
        compose_text = (mobile_dir / "docker-compose.qa.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("sinfallas/base-mobile-appium:26", compose_text)
        self.assertIn("qa-mobile", compose_text)
        self.assertIn("--allow-insecure=", compose_text)
        self.assertNotIn("--relaxed-security", compose_text)
        self.assertTrue((mobile_dir / "limpieza.sh").is_file())

        makefile_example = (mobile_dir / "Makefile.example").read_text(
            encoding="utf-8"
        )
        self.assertIn("sinfallas/base-mobile-appium:26", makefile_example)

        pkg_example = json.loads(
            (mobile_dir / "package.json.example").read_text(encoding="utf-8")
        )
        self.assertIn(
            "sinfallas/base-mobile-appium:26", pkg_example.get("description", "")
        )

        hydration_dir = Path(tempfile.mkdtemp(prefix="smoke_mobile_appium_"))
        try:
            templates = (
                "docker-compose.qa.yml",
                "limpieza.sh",
                "Makefile.example",
                "package.json.example",
                "gitignore.example",
            )
            for template in templates:
                src = mobile_dir / template
                target_name = (
                    ".gitignore"
                    if template == "gitignore.example"
                    else template.removesuffix(".example")
                )
                dest = hydration_dir / target_name
                shutil.copy2(src, dest)
                self.assertTrue(dest.is_file(), f"No hidrató {target_name}")
        finally:
            shutil.rmtree(hydration_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
