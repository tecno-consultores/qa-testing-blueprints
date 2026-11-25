# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

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
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install-skill.sh"


class TestInstallSkill(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="qa_install_skill_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_help_flag_displays_usage(self) -> None:
        """Verifica que --help devuelva 0 y muestre la ayuda en español."""
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
        """Verifica instalación nominal con repo mock y verificación SHA-256."""
        mock_repo = self.temp_path / "mock_repo"
        mock_repo.mkdir()

        sample_skills = (
            ("qa-11x-architect", "# Architect Skill Content"),
            ("refactoring-ui", "# Refactoring UI Skill Content"),
            ("docker-trivy-keydb-hardening", "# Trivy Skill Content"),
            ("graphify-ast-navigator", "# AST Skill Content"),
            ("qa-11x-docker-certifier", "# Docker Certifier Skill Content"),
        )
        gov_entries = []
        for skill_id, body in sample_skills:
            s_dir = mock_repo / ".agents" / "skills" / skill_id
            s_dir.mkdir(parents=True)
            s_file = s_dir / "SKILL.md"
            s_file.write_text(body, encoding="utf-8")
            raw = s_file.read_bytes()
            gov_entries.append(
                {
                    "path": f".agents/skills/{skill_id}/SKILL.md",
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "size_bytes": len(raw),
                }
            )

        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": gov_entries,
        }
        (mock_repo / "manifest.json").write_text(
            json.dumps(manifest_data), encoding="utf-8"
        )

        dest_workspace = self.temp_path / "dest_project"
        dest_workspace.mkdir()

        env = os.environ.copy()
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["/bin/sh", str(INSTALL_SCRIPT), "--target", "workspace"],
            cwd=str(dest_workspace),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            res.returncode, 0, f"Error: {res.stderr}\nStdout: {res.stdout}"
        )
        self.assertIn("Instalación de Skills QA 11X Completada con Éxito", res.stdout)

        for skill_id, _ in sample_skills:
            target_skill = (
                dest_workspace / ".agents" / "skills" / skill_id / "SKILL.md"
            )
            self.assertTrue(target_skill.is_file())

    def test_tampered_file_detection_aborts(self) -> None:
        """Verifica que una discrepancia SHA-256 aborte con código 1 (STIG V-222513)."""
        mock_repo = self.temp_path / "tampered_repo"
        mock_repo.mkdir()

        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# Contenido Malicioso Modificado", encoding="utf-8")

        expected_fake_sha = "0" * 64
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
        (mock_repo / "manifest.json").write_text(
            json.dumps(manifest_data), encoding="utf-8"
        )

        dest_workspace = self.temp_path / "dest_tampered"
        dest_workspace.mkdir()

        env = os.environ.copy()
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["/bin/sh", str(INSTALL_SCRIPT), "--target", "workspace"],
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
        (mock_repo / "manifest.json").write_text(
            json.dumps(manifest_data), encoding="utf-8"
        )

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
        installed = (
            mock_home
            / ".gemini"
            / "config"
            / "skills"
            / "qa-11x-architect"
            / "SKILL.md"
        )
        self.assertTrue(installed.is_file())

    def test_auto_target_from_home_detects_global_without_polluting_home(self) -> None:
        """Verifica detección global en $HOME sin ensuciar $HOME/.agents."""
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
        (mock_repo / "manifest.json").write_text(
            json.dumps(manifest_data), encoding="utf-8"
        )

        mock_home = self.temp_path / "user_home"
        mock_home.mkdir()
        (mock_home / ".gemini").mkdir()
        (mock_home / ".claude").mkdir()

        env = os.environ.copy()
        env["HOME"] = str(mock_home)
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res = subprocess.run(
            ["sh", str(INSTALL_SCRIPT)],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            res.returncode, 0, f"Error: {res.stderr}\nStdout: {res.stdout}"
        )

        installed_gemini = (
            mock_home
            / ".gemini"
            / "config"
            / "skills"
            / "qa-11x-architect"
            / "SKILL.md"
        )
        installed_claude = (
            mock_home / ".claude" / "skills" / "qa-11x-architect" / "SKILL.md"
        )
        self.assertTrue(installed_gemini.is_file())
        self.assertTrue(installed_claude.is_file())
        self.assertFalse((mock_home / ".agents").exists())

        res_all = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "all"],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            res_all.returncode, 0, f"Error: {res_all.stderr}\nStdout: {res_all.stdout}"
        )
        self.assertFalse((mock_home / ".agents").exists())

        # En proyecto git con agentes globales en $HOME, --target all no duplica
        project_dir = self.temp_path / "consumer_project"
        (project_dir / ".git").mkdir(parents=True)
        res_proj = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "all"],
            cwd=str(project_dir),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            res_proj.returncode,
            0,
            f"Error: {res_proj.stderr}\nStdout: {res_proj.stdout}",
        )
        self.assertFalse((project_dir / ".agents" / "skills").exists())

    def test_target_codex_and_windsurf(self) -> None:
        """Verifica instalación explícita hacia --target codex y --target windsurf."""
        mock_repo = self.temp_path / "mock_repo_cw"
        mock_repo.mkdir()
        arch_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        arch_dir.mkdir(parents=True)
        arch_skill = arch_dir / "SKILL.md"
        arch_skill.write_text("# Architect Skill Content", encoding="utf-8")
        arch_sha = hashlib.sha256(arch_skill.read_bytes()).hexdigest()

        manifest_data = {
            "schema_version": "1.0.0",
            "agent_governance_files": [
                {
                    "path": ".agents/skills/qa-11x-architect/SKILL.md",
                    "target_name": ".agents/skills/qa-11x-architect/SKILL.md",
                    "merge_strategy": "overwrite",
                    "sha256": arch_sha,
                    "size_bytes": len(arch_skill.read_bytes()),
                }
            ],
        }
        (mock_repo / "manifest.json").write_text(
            json.dumps(manifest_data), encoding="utf-8"
        )

        mock_home = self.temp_path / "user_home_cw"
        mock_home.mkdir()

        env = os.environ.copy()
        env["HOME"] = str(mock_home)
        env["QA_BLUEPRINTS_LOCAL_PATH"] = str(mock_repo)

        res_codex = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "codex"],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_codex.returncode, 0, f"Error: {res_codex.stderr}")
        installed_codex = (
            mock_home / ".codex" / "skills" / "qa-11x-architect" / "SKILL.md"
        )
        self.assertTrue(installed_codex.is_file())

        res_windsurf = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "windsurf"],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_windsurf.returncode, 0, f"Error: {res_windsurf.stderr}")
        installed_windsurf = (
            mock_home
            / ".codeium"
            / "windsurf"
            / "skills"
            / "qa-11x-architect"
            / "SKILL.md"
        )
        self.assertTrue(installed_windsurf.is_file())

        res_inv = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "invalid_target"],
            cwd=str(mock_home),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_inv.returncode, 1)
        self.assertIn("windsurf", res_inv.stderr)
        self.assertIn("codex", res_inv.stderr)

    def test_docker_python_fallback_when_jq_and_python3_absent(self) -> None:
        """Verifica fallback a PY_IMG en Docker si faltan jq y python3 locales."""
        mock_repo = self.temp_path / "mock_repo_dkr"
        skill_dir = mock_repo / ".agents" / "skills" / "qa-11x-architect"
        skill_dir.mkdir(parents=True)
        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text("# Architect\n", encoding="utf-8")
        sha = hashlib.sha256(skill_md.read_bytes()).hexdigest()
        (mock_repo / "manifest.json").write_text(
            json.dumps(
                {
                    "schema_version": "1.0.0",
                    "blueprint_version": "3.1.0",
                    "agent_governance_files": [
                        {
                            "path": ".agents/skills/qa-11x-architect/SKILL.md",
                            "sha256": sha,
                            "size_bytes": skill_md.stat().st_size,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        fake_bin = self.temp_path / "fake_bin"
        fake_bin.mkdir()
        docker_log = self.temp_path / "docker_calls.log"
        tools = (
            "awk", "basename", "cat", "chmod", "cp", "dirname", "id",
            "mkdir", "mktemp", "rm", "sh", "sha256sum", "tr", "wc", "date",
        )
        for tool in tools:
            src_tool = Path("/usr/bin") / tool
            if not src_tool.exists():
                src_tool = Path("/bin") / tool
            if src_tool.exists():
                (fake_bin / tool).symlink_to(src_tool)
        real_py = sys.executable
        docker_stub = fake_bin / "docker"
        docker_stub.write_text(
            "#!/bin/sh\n"
            f'printf "%s\\n" "$*" >> "{docker_log}"\n'
            'mount_dir=""\n'
            'while [ "$#" -gt 0 ]; do\n'
            '  case "$1" in\n'
            '    -v) mount_dir="${2%%:*}"; shift 2 ;;\n'
            '    python3) shift; break ;;\n'
            '    *) shift ;;\n'
            "  esac\n"
            "done\n"
            'py_code="$2"\n'
            'manifest_host="${mount_dir}/manifest.json"\n'
            f'exec "{real_py}" -c "${{py_code}}" "${{manifest_host}}"\n',
            encoding="utf-8",
        )
        docker_stub.chmod(0o755)
        ws = self.temp_path / "ws_dkr"
        ws.mkdir()
        env = {
            "PATH": str(fake_bin),
            "HOME": str(self.temp_path / "home_dkr"),
            "QA_BLUEPRINTS_LOCAL_PATH": str(mock_repo),
        }
        res = subprocess.run(
            ["/bin/sh", str(INSTALL_SCRIPT), "--target", "workspace"],
            cwd=str(ws),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, res.stderr + res.stdout)
        installed = ws / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
        self.assertTrue(installed.is_file())
        self.assertIn("--network none", docker_log.read_text(encoding="utf-8"))

    def test_bash_install_parity_lang_4_connectors_prune_and_script_protection(
        self,
    ) -> None:
        """Verifica paridad D8: 4 conectores, --lang, exclusiones, poda y scripts."""
        repo = self.temp_path / "parity_repo"
        arch = repo / ".agents" / "skills" / "qa-11x-architect"
        arch.mkdir(parents=True)
        (arch / "SKILL.md").write_text("# Architect\n", encoding="utf-8")
        (repo / ".agents" / "scripts").mkdir(parents=True)
        (repo / "scripts").mkdir(parents=True)
        bump = repo / ".agents" / "scripts" / "bump_version_11x.py"
        bump.write_text("# monorepo\n", encoding="utf-8")
        self_inst = repo / "scripts" / "install-skill.sh"
        self_inst.write_text("#!/bin/sh\n", encoding="utf-8")
        limpieza = repo / "scripts" / "limpieza.sh"
        limpieza.write_text("#!/bin/sh\necho new-limpieza\n", encoding="utf-8")

        def _ent(rel: str, strat: str = "") -> dict[str, object]:
            raw = (repo / rel).read_bytes()
            d: dict[str, object] = {
                "path": rel,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "size_bytes": len(raw),
            }
            if strat:
                d["merge_strategy"] = strat
            return d

        (repo / "manifest.json").write_text(
            json.dumps(
                {
                    "blueprint_version": "3.2.1",
                    "common_files": [
                        _ent("scripts/limpieza.sh"),
                        _ent("scripts/install-skill.sh"),
                    ],
                    "agent_governance_files": [
                        _ent(".agents/skills/qa-11x-architect/SKILL.md"),
                        _ent(".agents/scripts/bump_version_11x.py"),
                    ],
                }
            ),
            encoding="utf-8",
        )

        home = self.temp_path / "parity_home"
        for sub in (
            ".gemini/config/skills/qa-11x-architect",
            ".gemini/config/skills/custom-vendor",
            ".claude",
            ".codex",
            ".codeium/windsurf",
        ):
            (home / sub).mkdir(parents=True)
        retired = home / ".gemini/config/skills/qa-11x-architect/retired.md"
        retired.write_text("obsolete\n", encoding="utf-8")
        vendor = home / ".gemini/config/skills/custom-vendor/SKILL.md"
        vendor.write_text("# Keep Vendor\n", encoding="utf-8")

        ws = self.temp_path / "parity_ws"
        (ws / "scripts").mkdir(parents=True)
        (ws / "scripts" / "limpieza.sh").write_text(
            "#!/bin/sh\necho local-custom\n", encoding="utf-8"
        )
        env = {**os.environ, "HOME": str(home), "QA_BLUEPRINTS_LOCAL_PATH": str(repo)}

        res_es = subprocess.run(
            [
                "sh",
                str(INSTALL_SCRIPT),
                "--target",
                "auto",
                "--lang",
                "es",
                "--include-scripts",
                "--init-agents",
            ],
            cwd=str(ws),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_es.returncode, 0, res_es.stderr + res_es.stdout)
        self.assertFalse(retired.exists())
        self.assertTrue(vendor.is_file())
        self.assertIn("local-custom", (ws / "scripts/limpieza.sh").read_text("utf-8"))
        self.assertTrue((ws / "scripts/limpieza.sh.11x-incoming").is_file())
        self.assertFalse((ws / ".agents/scripts/bump_version_11x.py").exists())
        self.assertFalse((ws / "scripts/install-skill.sh").exists())

        for rel_conn in (
            ".gemini/GEMINI.md",
            ".claude/CLAUDE.md",
            ".codex/AGENTS.md",
            ".codeium/windsurf/memories/global_rules.md",
        ):
            conn_text = (home / rel_conn).read_text(encoding="utf-8")
            self.assertIn("Conector Global Thin-Client QA 11X", conn_text)
            self.assertIn("en serie 1 contenedor a la vez", conn_text)
            self.assertIn("--rm --restart=no --network none", conn_text)
            start = conn_text.index("<!-- QA_11X_MCP_CONNECTOR_START -->")
            end = conn_text.index("<!-- QA_11X_MCP_CONNECTOR_END -->") + len(
                "<!-- QA_11X_MCP_CONNECTOR_END -->"
            )
            self.assertLessEqual(len(conn_text[start:end].encode("utf-8")), 1_536)

        agents_text = (ws / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("strictly in **Spanish**", agents_text)
        self.assertIn("serialized 1 container at a time", agents_text)
        self.assertIn("--rm --restart=no --network none", agents_text)

        # Paridad de directivas QA-DOCKER-LOOP-01 entre install-skill.sh y agents-connector.ts
        connector_ts = (
            REPO_ROOT / "mcp-server" / "src" / "services" / "agents-connector.ts"
        ).read_text(encoding="utf-8")
        installer_sh = INSTALL_SCRIPT.read_text(encoding="utf-8")
        for clause in (
            "serialized 1 container at a time; zero parallel subagent `docker run`; `--rm --restart=no --network none` offline",
            "en serie 1 contenedor a la vez; sin `docker run` paralelo en subagentes; `--rm --restart=no --network none` offline",
        ):
            self.assertIn(clause, connector_ts)
            self.assertIn(clause, installer_sh)

        # Omitir --lang en 2da corrida debe preservar idioma español
        res_pres = subprocess.run(
            ["sh", str(INSTALL_SCRIPT), "--target", "auto", "--init-agents"],
            cwd=str(ws),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_pres.returncode, 0, res_pres.stderr)
        self.assertIn(
            "Conector Global Thin-Client QA 11X",
            (home / ".claude/CLAUDE.md").read_text(encoding="utf-8"),
        )
        self.assertIn("strictly in **Spanish**", (ws / "AGENTS.md").read_text("utf-8"))


if __name__ == "__main__":
    unittest.main()
