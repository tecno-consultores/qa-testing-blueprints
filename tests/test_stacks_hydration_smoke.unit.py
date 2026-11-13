# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
test_stacks_hydration_smoke.unit.py — Suite Smoke de Hidratación e Invariantes de los 7 Stacks QA 11X.

Valida determinísticamente que las 7 plantillas corporativas (vue3, react-frontend, python,
fastapi, php, node-backend, bash-scripts), los scripts de automatización y manifest.json
cumplan todos los contratos estructurales y de seguridad v2.16.0.
"""

import json
import re
import shutil
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path

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

    def test_node_stacks_and_ci_enforce_non_root_host_uid_and_pnpm_store_init(self) -> None:
        """Previene regresiones os error 13 (UID 10001 vs bind-mount host/CI) en base-node-ionic:26."""
        ci_workflow = (REPO_ROOT / ".github" / "workflows" / "qa-11x-ci.yml").read_text(encoding="utf-8")
        self.assertIn(
            'docker compose -f mcp-server/docker-compose.qa.yml run --rm -u "$(id -u):$(id -g)"',
            ci_workflow,
        )
        self.assertIn("pnpm run test:example", ci_workflow)

        node_targets = (
            ("mcp-server", "Makefile"),
            ("vue3", "Makefile.example"),
            ("react-frontend", "Makefile.example"),
            ("node-backend", "Makefile.example"),
        )
        for folder, makefile_name in node_targets:
            compose_text = (REPO_ROOT / folder / "docker-compose.qa.yml").read_text(encoding="utf-8")
            self.assertIn("pnpm-store-init:", compose_text, f"Falta pnpm-store-init en {folder}")
            self.assertIn('["chmod", "-R", "a+rwX", "/pnpm"]', compose_text, f"Falta chmod -R a+rwX en {folder}")
            self.assertIn("pnpm_config_store_dir: /pnpm/store", compose_text, f"Falta pnpm_config_store_dir en {folder}")
            self.assertNotRegex(compose_text, r"\bnpm_config_store_dir:", f"Variable legacy npm_config_store_dir en {folder}")
            self.assertIn('user: "${QA_UID:-1000}:${QA_GID:-1000}"', compose_text, f"Falta user QA_UID en {folder}")

            makefile_text = (REPO_ROOT / folder / makefile_name).read_text(encoding="utf-8")
            self.assertIn("export QA_UID", makefile_text, f"Falta export QA_UID en {folder}/{makefile_name}")
            self.assertIn('-u "$(QA_UID):$(QA_GID)"', makefile_text, f"Falta flag -u en {folder}/{makefile_name}")

    def test_mcp_example_e2e_harness_and_four_gates_wired(self) -> None:
        """Verifica que mcp-server/example/ exista y esté conectado en las 4 barreras (publish, CI, pre-push y Makefile)."""
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
            self.assertTrue((example_dir / rel).is_file(), f"Falta archivo semilla en example/: {rel}")

        probar_script = (REPO_ROOT / "scripts" / "probar-mcp-example.sh").read_text(encoding="utf-8")
        self.assertIn("--exclude='./mcp-server/node_modules'", probar_script)
        self.assertIn("pnpm run test:example", probar_script)

        publicar_script = (REPO_ROOT / "scripts" / "publicar-mcp.sh").read_text(encoding="utf-8")
        self.assertIn("pnpm --silent run test:example", publicar_script)

        lefthook_text = (REPO_ROOT / "lefthook.yml").read_text(encoding="utf-8")
        self.assertIn("mcp-example-smoke:", lefthook_text)
        self.assertIn("./scripts/probar-mcp-example.sh --in-place", lefthook_text)

        hooks_sh = (REPO_ROOT / "instalar-hooks.sh").read_text(encoding="utf-8")
        self.assertIn("./scripts/probar-mcp-example.sh --in-place", hooks_sh)

        root_makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
        self.assertIn("test-example:", root_makefile)
        self.assertIn("./scripts/probar-mcp-example.sh", root_makefile)

    def test_cleanup_scripts_cover_v2_20_artifacts_and_preserve_mcp_invariants(self) -> None:
        """Verifica que scripts/limpieza.sh purgue los artefactos v2.20.x sin destruir mcp-server/dist, .qa-11x-version ni AST."""
        root_clean = (REPO_ROOT / "scripts" / "limpieza.sh").read_text(encoding="utf-8")
        for expected in (
            "qa_mcp_cleanroom_",
            "qa-11x-mcp-example-e2e-",
            ".pnpm-store",
            ".turbo",
            "sbom.cyclonedx.json",
            ".agents/proposals",
            "qa-11x-blueprints",
            "-user 10001",
            '-not -path "./mcp-server/example/*"',
        ):
            self.assertIn(expected, root_clean, f"Falta patrón '{expected}' en scripts/limpieza.sh")

        gitignore_text = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn(".agents/proposals/", gitignore_text)
        self.assertIn(".turbo/", gitignore_text)

        for node_stack in ("vue3", "react-frontend", "node-backend"):
            stack_clean = (REPO_ROOT / node_stack / "limpieza.sh").read_text(encoding="utf-8")
            self.assertIn(".pnpm-store", stack_clean, f"Falta .pnpm-store en {node_stack}/limpieza.sh")
            self.assertIn("-user 10001", stack_clean, f"Falta -user 10001 en {node_stack}/limpieza.sh")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            fake_repo = tmp_path / "repo"
            fake_home = tmp_path / "home"
            fake_tmp = tmp_path / "tmpdir"
            (fake_repo / "scripts").mkdir(parents=True)
            shutil.copy2(REPO_ROOT / "scripts" / "limpieza.sh", fake_repo / "scripts" / "limpieza.sh")

            # Crear artefactos efímeros que DEBEN eliminarse en modo normal
            (fake_home / ".cache" / "qa_mcp_cleanroom_abc123").mkdir(parents=True)
            (fake_tmp / "qa-11x-mcp-example-e2e-xyz789").mkdir(parents=True)
            (fake_repo / ".pnpm-store").mkdir()
            (fake_repo / ".turbo").mkdir()
            (fake_repo / "sbom.cyclonedx.json").write_text("{}", encoding="utf-8")
            (fake_repo / "bash-scripts" / "coverage_report").mkdir(parents=True)
            (fake_repo / "mcp-server" / "example" / "frontend" / "dist").mkdir(parents=True)

            # Crear artefactos protegidos que DEBEN sobrevivir al modo normal
            (fake_repo / "mcp-server" / "dist").mkdir(parents=True)
            (fake_repo / "mcp-server" / "dist" / "index.js").write_text("// built", encoding="utf-8")
            (fake_repo / "mcp-server" / "example" / "fixtures").mkdir(parents=True)
            (fake_repo / "mcp-server" / "example" / "fixtures" / "ast-graph.seed.json").write_text("{}", encoding="utf-8")
            (fake_repo / "graphify-out").mkdir()
            (fake_repo / "graphify-out" / "graph.json").write_text("{}", encoding="utf-8")
            (fake_repo / "graphify-out" / "cache").mkdir()
            (fake_repo / ".qa-11x-version").write_text('{"version":"2.20.1"}', encoding="utf-8")
            (fake_repo / "zap.yaml").write_text("env: {}", encoding="utf-8")
            (fake_repo / ".agents" / "proposals").mkdir(parents=True)
            (fake_repo / ".agents" / "proposals" / "draft.md").write_text("# draft", encoding="utf-8")
            (fake_home / ".cache" / "qa-11x-blueprints").mkdir(parents=True)
            (fake_home / ".cache" / "qa-11x-blueprints" / "latest-version-check.json").write_text("{}", encoding="utf-8")

            # Aislar PATH sin binario docker para validar el barrido Bash determinista sin tocar el daemon del host
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            for tool_name in ("bash", "dirname", "cd", "pwd", "find", "rm", "id"):
                resolved = shutil.which(tool_name)
                if resolved:
                    (bin_dir / tool_name).symlink_to(resolved)

            env = {
                "HOME": str(fake_home),
                "TMPDIR": str(fake_tmp),
                "PATH": str(bin_dir),
                "LC_ALL": "C",
            }
            proc = subprocess.run(
                [str(fake_repo / "scripts" / "limpieza.sh"), "--quiet"],
                cwd=fake_repo,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stderr)
            self.assertFalse((fake_home / ".cache" / "qa_mcp_cleanroom_abc123").exists())
            self.assertFalse((fake_tmp / "qa-11x-mcp-example-e2e-xyz789").exists())
            self.assertFalse((fake_repo / ".pnpm-store").exists())
            self.assertFalse((fake_repo / ".turbo").exists())
            self.assertFalse((fake_repo / "sbom.cyclonedx.json").exists())
            self.assertFalse((fake_repo / "bash-scripts" / "coverage_report").exists())
            self.assertFalse((fake_repo / "mcp-server" / "example" / "frontend" / "dist").exists())
            self.assertFalse((fake_repo / "graphify-out" / "cache").exists())

            # Invariantes preservados en modo normal
            self.assertTrue((fake_repo / "mcp-server" / "dist" / "index.js").is_file())
            self.assertTrue((fake_repo / "mcp-server" / "example" / "fixtures" / "ast-graph.seed.json").is_file())
            self.assertTrue((fake_repo / "graphify-out" / "graph.json").is_file())
            self.assertTrue((fake_repo / ".qa-11x-version").is_file())
            self.assertTrue((fake_repo / "zap.yaml").is_file())
            self.assertTrue((fake_repo / ".agents" / "proposals" / "draft.md").is_file())
            self.assertTrue((fake_home / ".cache" / "qa-11x-blueprints" / "latest-version-check.json").is_file())

            # En modo --deep se purgan proposals y la caché TTL 24h qa-11x-blueprints, pero NUNCA mcp-server/dist ni .qa-11x-version
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
            self.assertFalse((fake_home / ".cache" / "qa-11x-blueprints").exists())
            self.assertTrue((fake_repo / "mcp-server" / "dist" / "index.js").is_file())
            self.assertTrue((fake_repo / ".qa-11x-version").is_file())

    def test_prepush_ci_parity_and_karate_skill_catalog_sync(self) -> None:
        """Garantiza paridad 1:1 pre-push <-> CI y sincronía del contrato Karate con manifest.json."""
        lefthook_text = (REPO_ROOT / "lefthook.yml").read_text(encoding="utf-8")
        hooks_sh = (REPO_ROOT / "instalar-hooks.sh").read_text(encoding="utf-8")
        required_parity_tokens = (
            "sinfallas/karatelabs:1.5.1",
            "sinfallas/base-bash-qa:latest",
            "tests/*.unit.py",
            "tests/meta_qa/test_governance_scripts.py",
            "validate_calm_architecture.sh",
            "certify_task_completion.sh",
        )
        for token in required_parity_tokens:
            self.assertIn(token, lefthook_text, f"Falta '{token}' en pre-push de lefthook.yml")
            self.assertIn(token, hooks_sh, f"Falta '{token}' en pre-push de instalar-hooks.sh")

        skill_paths = sorted(
            entry["path"]
            for entry in self.manifest.get("agent_governance_files", [])
            if isinstance(entry, dict)
            and str(entry.get("path", "")).startswith(".agents/skills/")
            and str(entry.get("path", "")).endswith("/SKILL.md")
        )
        self.assertGreaterEqual(len(skill_paths), 10)

        feature_text = (REPO_ROOT / "mcp-server" / "test" / "mcp_cli_test.feature").read_text(
            encoding="utf-8"
        )
        count_match = re.search(r"match skillFiles == '#\[(\d+)\]'", feature_text)
        self.assertIsNotNone(count_match, "Falta aserción '#[N]' sobre skillFiles en mcp_cli_test.feature")
        assert count_match is not None
        self.assertEqual(
            int(count_match.group(1)),
            len(skill_paths),
            f"Desfase Karate skillFiles ({count_match.group(1)}) vs manifest.json ({len(skill_paths)})",
        )
        for skill_path in skill_paths:
            self.assertIn(skill_path, feature_text, f"Falta '{skill_path}' en mcp_cli_test.feature")


if __name__ == "__main__":
    unittest.main()
