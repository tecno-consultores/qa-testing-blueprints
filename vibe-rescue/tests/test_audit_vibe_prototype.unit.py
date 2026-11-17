#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias trimodales para audit_vibe_prototype.py (QA-11X)."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

_VIBE_DIR = Path(__file__).resolve().parents[1]
if str(_VIBE_DIR) not in sys.path:
    sys.path.insert(0, str(_VIBE_DIR))

import audit_vibe_prototype as auditor  # noqa: E402
from _vibe_rules import TEST_FILE_RE, find_line, is_env_file_ignored  # noqa: E402


def test_virgin_empty_project_requires_rescue(tmp_path: Path) -> None:
    """Fixture Virgen: directorio vacio falla VIBE-QA-005 con --enforce."""
    virgin = tmp_path / "virgin_app"
    virgin.mkdir()

    report = auditor.audit_prototype(virgin)
    assert report["verdict"] == "RESCUE_REQUIRED"
    assert [item["rule_id"] for item in report["findings"]] == ["VIBE-QA-005"]
    assert auditor.main(["--target", str(virgin), "--enforce"]) == 1


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("auth.unit.py", True),
        ("card.unit.ts", True),
        ("table.unit.tsx", True),
        ("repo.int.py", True),
        ("checkout.e2e.ts", True),
        ("InvoiceControllerTest.php", True),
        ("limpieza.bats", True),
        ("api.feature", True),
        ("test_core.py", True),
        ("core_test.py", True),
        ("contest.php", False),
        ("latest.ts", False),
    ],
)
def test_extended_test_file_patterns(filename: str, expected: bool) -> None:
    """Valida deteccion ampliada de pruebas evitando falsos positivos PHP."""
    assert bool(TEST_FILE_RE.search(filename)) is expected


def _write_nominal_sql_and_docker(clean: Path) -> None:
    (clean / "sql").mkdir(parents=True, exist_ok=True)
    sql_body = (
        "/* bloque multi-linea\n"
        "   CREATE TABLE comment_only (id INT);\n"
        "   WITH CHECK (true) */\n"
        "CREATE TABLE public.orders (id UUID PRIMARY KEY);\n"
        "ALTER TABLE orders ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;\n"
        'CREATE TABLE IF NOT EXISTS "audit_events" (id UUID PRIMARY KEY);\n'
        "ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;\n"
        "ALTER TABLE ONLY public.audit_events FORCE ROW LEVEL SECURITY;\n"
    )
    (clean / "sql" / "schema.sql").write_text(sql_body, encoding="utf-8")
    docker_body = (
        "FROM --platform=linux/amd64 node:22-alpine@sha256:abc123 AS builder\n"
        "USER root\n"
        "FROM builder AS runtime\n"
        "USER 1001\n"
        "FROM scratch AS empty_stage\n"
        "USER 1001\n"
    )
    (clean / "Dockerfile").write_text(docker_body, encoding="utf-8")


def test_nominal_multistage_rls_and_self_audit_pass(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Fixture Nominal: multi-etapa valida, comentario multi-linea y auto-auditoria."""
    clean = tmp_path / "nominal_app"
    (clean / "src").mkdir(parents=True)
    (clean / "tests").mkdir(parents=True)
    (clean / ".gitignore").write_text(".env\n", encoding="utf-8")
    (clean / ".env").write_text(
        "DATABASE_URL=postgres://user:pw@db/app\n",
        encoding="utf-8",
    )
    (clean / "tsconfig.json").write_text('{"compilerOptions":{"strict":true}}\n')
    (clean / "src" / "routes.ts").write_text(
        "app.post('/items', (req) => req.headers['Idempotency-Key']);\n",
        encoding="utf-8",
    )
    (clean / "billing.unit.tsx").write_text(
        "export const ok = true;\n",
        encoding="utf-8",
    )
    _write_nominal_sql_and_docker(clean)

    assert auditor.main(["--target", str(clean), "--enforce"]) == 0
    out = capsys.readouterr().out.strip()
    assert "ENTERPRISE_READY" in out

    self_report = auditor.audit_prototype(_VIBE_DIR)
    assert self_report["verdict"] == "ENTERPRISE_READY"


def _create_degraded_sql_and_docker(degraded: Path) -> None:
    (degraded / "sql").mkdir(parents=True, exist_ok=True)
    sql_body = (
        "/* line 1 comment\n"
        "   line 2 comment\n"
        "   line 3 comment */\n"
        "CREATE TABLE protected_tbl (id UUID PRIMARY KEY);\n"
        "ALTER TABLE protected_tbl ENABLE ROW LEVEL SECURITY;\n"
        "ALTER TABLE protected_tbl FORCE ROW LEVEL SECURITY;\n"
        "CREATE TABLE exposed_tbl (id UUID PRIMARY KEY);\n"
        "CREATE POLICY bad ON exposed_tbl USING (true);\n"
        "ALTER ROLE r WITH BYPASSRLS;\n"
    )
    (degraded / "sql" / "migration.sql").write_text(sql_body, encoding="utf-8")
    docker_body = (
        "FROM python\n"
        "USER 1001\n"
        "FROM localhost:5000/worker\n"
        "FROM alpine:3.21@sha256:abcdef01 AS final_stage\n"
    )
    (degraded / "Dockerfile").write_text(docker_body, encoding="utf-8")
    (degraded / "Dockerfile.rootend").write_text(
        "FROM alpine:3.21@sha256:abcdef01\nUSER 1001\nUSER root\n",
        encoding="utf-8",
    )


def _create_degraded_app_code(degraded: Path, raw_secret: str) -> None:
    (degraded / "src").mkdir(parents=True, exist_ok=True)
    (degraded / ".env").write_text(
        f"VITE_SERVICE_ROLE_SECRET={raw_secret}\nAPI_SECRET={raw_secret}\n",
        encoding="utf-8",
    )
    padding = "\n".join(f"const x{i} = {i};" for i in range(12))
    (degraded / "src" / "client.tsx").write_text(
        f"const tok = '{raw_secret}';\n"
        "const cfg = import.meta.env.VITE_PUBLIC_SERVICE_ROLE;\n"
        "const db = supabaseAdmin;\n"
        "const v:" + " any = 1;\n"
        "await page.waitFor" + "Timeout(100);\n"
        f"{padding}\n",
        encoding="utf-8",
    )
    (degraded / "src" / "api.py").write_text(
        "@app.post('/pay')\ndef pay():\n    return {'ok': True}\n",
        encoding="utf-8",
    )
    (degraded / "tsconfig.json").write_text('{"compilerOptions":{"strict":false}}\n')


def test_degraded_per_table_sql_line_preservation_and_docker_rules(
    tmp_path: Path,
) -> None:
    """Fixture Degradada: RLS por tabla, preservacion \\n en SQL y Dockerfile."""
    degraded = tmp_path / "degraded_app"
    degraded.mkdir()
    raw_secret = "sk-" + "proj-" + ("z" * 24)
    _create_degraded_sql_and_docker(degraded)
    _create_degraded_app_code(degraded, raw_secret)

    report = auditor.audit_prototype(degraded, max_lines=10)
    assert report["verdict"] == "RESCUE_REQUIRED"
    assert raw_secret not in json.dumps(report)

    sql_rls_findings = [
        f
        for f in report["findings"]
        if f["file"] == "sql/migration.sql" and "exposed_tbl" in f["message"]
    ]
    assert len(sql_rls_findings) == 1
    assert sql_rls_findings[0]["line"] == 7

    docker_lines = {
        (f["file"], f["line"], f["message"])
        for f in report["findings"]
        if f["file"].startswith("Dockerfile")
    }
    assert any(f == "Dockerfile" and ln == 1 for f, ln, _ in docker_lines)
    assert any(f == "Dockerfile" and ln == 3 for f, ln, _ in docker_lines)
    assert any(f == "Dockerfile" and ln == 4 for f, ln, _ in docker_lines)
    assert any(f == "Dockerfile.rootend" and ln == 3 for f, ln, _ in docker_lines)


def test_remediation_redaction_and_cli_boundaries(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verifica emision idempotente, redaccion y contencion de rutas."""
    jwt_sample = "Bearer eyJhbGciOiJI.abc1234567.sig9999999"
    assert "REDACTED_SECRET" in auditor.redact_secrets(jwt_sample)
    app = tmp_path / "cli_app"
    (app / "tests").mkdir(parents=True)
    (app / "tests" / "ok.unit.py").write_text("assert True\n", encoding="utf-8")
    (app / "Dockerfile.empty").write_text("RUN echo hi\n", encoding="utf-8")

    code = auditor.main(
        [
            "--target",
            ".",
            "--workspace-root",
            str(app),
            "--no-dry-run",
            "--emit-remediation",
            "qa11x-rescue",
            "--json",
        ]
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert len(payload["remediation"]["written_files"]) == 3
    re_emit_args = [
        "--target",
        str(app),
        "--no-dry-run",
        "--emit-remediation",
        "qa11x-rescue",
    ]
    assert auditor.main(re_emit_args) == 0
    _ = capsys.readouterr()

    assert auditor.main(["--target", "%2e%2e/etc"]) == 2
    assert auditor.main(["--target", str(app), "--max-lines", "0"]) == 2
    assert auditor.main(["--target", str(tmp_path / "nope")]) == 2
    _ = capsys.readouterr()

    with pytest.raises(ValueError, match="Path traversal"):
        auditor.resolve_contained_path("../outside", allowed_roots=(app,))
    with pytest.raises(ValueError, match="fuera"):
        auditor.resolve_contained_path("/etc/hosts", allowed_roots=(app,))


def test_vibe_rules_edge_cases_and_script_dir_reload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cubre find_line default, comentarios .env, Dockerfile latest/flags y sys.path."""
    assert find_line(["clean line"], re.compile("missing"), default=7) == 7

    edge_app = tmp_path / "edge_app"
    (edge_app / "tests").mkdir(parents=True)
    (edge_app / "tests" / "ok.unit.py").write_text("assert True\n", encoding="utf-8")
    (edge_app / ".gitignore").write_text(".env\n", encoding="utf-8")
    (edge_app / ".env").write_text(
        "# comentario\n\nAPP_ENV=development\n", encoding="utf-8"
    )
    (edge_app / "Dockerfile").write_text(
        "FROM --platform=linux/amd64\nFROM node:latest\nUSER 1001\n",
        encoding="utf-8",
    )

    rep = auditor.audit_prototype(edge_app)
    assert rep["verdict"] == "RESCUE_REQUIRED"
    assert any(
        f["rule_id"] == "VIBE-QA-005" and f["line"] == 2
        for f in rep["findings"]
    )

    monkeypatch.setattr(
        sys,
        "path",
        [p for p in sys.path if not p or Path(p).resolve() != _VIBE_DIR],
    )
    spec = importlib.util.spec_from_file_location(
        "audit_vibe_prototype_isolated", _VIBE_DIR / "audit_vibe_prototype.py"
    )
    assert spec is not None and spec.loader is not None
    isolated = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(isolated)
    assert str(_VIBE_DIR) in sys.path
    assert isolated.DEFAULT_MAX_LINES == auditor.DEFAULT_MAX_LINES


def test_gitignore_per_env_file_and_extended_secret_patterns(
    tmp_path: Path,
) -> None:
    """Valida cobertura .gitignore por nombre especifico y llaves AIza/github_pat."""
    app = tmp_path / "env_app"
    (app / "src").mkdir(parents=True)
    (app / "tests").mkdir(parents=True)
    (app / "tests" / "ok.unit.py").write_text("assert True\n", encoding="utf-8")
    (app / ".gitignore").write_text(".env\n.env.local\n", encoding="utf-8")
    (app / ".env").write_text(
        "API_SECRET=super_secret_value_01\n",  # qa-secret-fixture-ok
        encoding="utf-8",
    )
    (app / ".env.local").write_text(
        "API_SECRET=super_local_secret_02\n",  # qa-secret-fixture-ok
        encoding="utf-8",
    )
    (app / ".env.production").write_text(
        "API_SECRET=super_prod_secret_03\n",  # qa-secret-fixture-ok
        encoding="utf-8",
    )

    g_key = "AIza" + "SyDummyTokenForUnitTest12345"
    gh_pat = "github_pat_" + "11ABCDEFG0123456789_xyz"
    (app / "src" / "keys.ts").write_text(
        f"export const g = '{g_key}';\nexport const p = '{gh_pat}';\n",
        encoding="utf-8",
    )

    report = auditor.audit_prototype(app)
    assert report["verdict"] == "RESCUE_REQUIRED"
    env_files = {
        item["file"] for item in report["findings"] if item["file"].startswith(".env")
    }
    assert env_files == {".env.production"}
    key_findings = [
        item for item in report["findings"] if item["file"] == "src/keys.ts"
    ]
    assert len(key_findings) == 2
    assert g_key not in json.dumps(report)
    assert gh_pat not in json.dumps(report)

    (app / ".gitignore").write_text(".env*\n!.env.local\n", encoding="utf-8")
    negated_report = auditor.audit_prototype(app)
    neg_env_files = {
        item["file"]
        for item in negated_report["findings"]
        if item["file"].startswith(".env")
    }
    assert neg_env_files == {".env.local"}

    rls_sql = (_VIBE_DIR / "templates" / "rls_hardening.sql").read_text(
        encoding="utf-8"
    )
    assert "v_supplied_hash <> v_expected_hash" in rls_sql
    assert "RAISE EXCEPTION 'WORM hash validation error" in rls_sql
    assert "WORM semantic audit error" in rls_sql


def test_gitignore_star_env_and_dot_env_wildcard_for_root_env(
    tmp_path: Path,
) -> None:
    """Valida linea 229 de _vibe_rules.py (*.env cubre .env, .env.* no cubre .env)."""
    assert is_env_file_ignored(".env", ".env", frozenset({"*.env"})) is True
    assert is_env_file_ignored(".env", ".env", frozenset({".env.*"})) is False

    app = tmp_path / "star_env_app"
    (app / "tests").mkdir(parents=True)
    (app / "tests" / "ok.unit.py").write_text("assert True\n", encoding="utf-8")
    (app / ".gitignore").write_text("*.env\n", encoding="utf-8")
    (app / ".env").write_text(
        "API_SECRET=super_secret_value_01\n",  # qa-secret-fixture-ok
        encoding="utf-8",
    )
    ignored_rep = auditor.audit_prototype(app)
    assert not any(f["file"] == ".env" for f in ignored_rep["findings"])

    (app / ".gitignore").write_text(".env.*\n", encoding="utf-8")
    exposed_rep = auditor.audit_prototype(app)
    assert any(f["file"] == ".env" for f in exposed_rep["findings"])
