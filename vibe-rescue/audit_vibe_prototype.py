#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Auditor estatico Zero-LLM del protocolo Vibe-to-Enterprise (QA-11X)."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

IGNORED_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        ".venv",
        "__pycache__",
        "coverage",
        "qa11x-rescue",
    }
)
CODE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".vue", ".py", ".php"})
TEST_DIR_NAMES = frozenset({"tests", "test", "__tests__"})
UNSAFE_PATH_TOKENS = ("\x00", "%2e", "%2f", "%5c")
REDACTION_MARKER = "[REDACTED_SECRET]"
DEFAULT_MAX_LINES = 500
RLS_TEMPLATE_REL = "vibe-rescue/templates/rls_hardening.sql"
DEFAULT_ENV_KEYS = ("DATABASE_URL", "APP_ENCRYPTION_KEY", "AUDIT_HMAC_KEY")

CLIENT_SECRET_VAR_RE = re.compile(
    r"\b((?:VITE|NEXT_PUBLIC|EXPO_PUBLIC|REACT_APP)_[A-Z0-9_]*"
    r"(?:SERVICE_ROLE|SECRET|PRIVATE|OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)"
    r"[A-Z0-9_]*)\b"
)
LITERAL_KEY_RE = re.compile(
    r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{20,}"
    r"|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,})\b"
)
ENV_ASSIGN_RE = re.compile(
    r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$"
)
SENSITIVE_ENV_KEY_RE = re.compile(
    r"(?:SECRET|SERVICE_ROLE|PRIVATE|KEY|TOKEN|PASSWORD|PASSWD|DATABASE_URL)",
    re.IGNORECASE,
)
PLACEHOLDER_VAL_RE = re.compile(
    r"(?:example|placeholder|changeme|change_me|your_|redacted|<[^>]+>)",
    re.IGNORECASE,
)
REDACT_ASSIGN_RE = re.compile(
    r"([A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL)[A-Za-z0-9_]*"
    r"\s*[=:]\s*[\"']?)([^\"'\s\r\n]+)",
    re.IGNORECASE,
)
REDACT_BEARER_RE = re.compile(
    r"\b(Bearer|Basic)\s+[A-Za-z0-9._+/=-]+",
    re.IGNORECASE,
)
REDACT_LITERAL_RE = re.compile(
    r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}"
    r"|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{16,}"
    r"|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})"
)

SQL_BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")
SQL_LINE_COMMENT_RE = re.compile(r"--[^\n]*")
SQL_PERMISSIVE_RE = re.compile(
    r"\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)",
    re.IGNORECASE,
)
SQL_CREATE_TABLE_RE = re.compile(r"\bCREATE\s+TABLE\b", re.IGNORECASE)
SQL_ENABLE_RLS_RE = re.compile(
    r"\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b",
    re.IGNORECASE,
)
SQL_FORCE_RLS_RE = re.compile(
    r"\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b",
    re.IGNORECASE,
)
SQL_BYPASSRLS_RE = re.compile(r"\bBYPASSRLS\b", re.IGNORECASE)
CLIENT_SERVICE_ROLE_RE = re.compile(r"\b(?:service_role|supabaseAdmin)\b")

WEAK_TYPE_RE = re.compile(
    r"(?::\s*any\b|\bas\s+any\b|@ts-ignore|@ts-nocheck|#\s*type:\s*ignore)"
)
TS_STRICT_FALSE_RE = re.compile(r'"strict"\s*:\s*false')
MUTATING_ROUTE_RE = re.compile(
    r"(?:@(?:app|router)\.(?:post|put|patch|delete)\s*\("
    r"|\b(?:app|router)\.(?:post|put|patch|delete)\s*\("
    r"|export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b)"
)
IDEMPOTENCY_RE = re.compile(r"Idempotency-Key|idempotency_key", re.IGNORECASE)

TEST_FILE_RE = re.compile(
    r"(?:\.(?:test|spec)\.[a-z0-9]+$|^test_.*\.py$|_test\.py$|\.feature$)",
    re.IGNORECASE,
)
FIXED_WAIT_RE = re.compile(
    r"\b(?:waitForTimeout|time\.sleep)\s*\(|\bcy\.wait\s*\(\s*\d+"
)
DOCKER_USER_ROOT_RE = re.compile(
    r"^\s*USER\s+(?:root|0(?::0)?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
DOCKER_ANY_USER_RE = re.compile(r"^\s*USER\s+\S+", re.IGNORECASE | re.MULTILINE)
DOCKER_FROM_LATEST_RE = re.compile(
    r"^\s*FROM\s+[^\s@]+:latest\b",
    re.IGNORECASE | re.MULTILINE,
)

STAGE_NAMES = {
    "VIBE-SEC-001": "Stage 1: Secret Quarantine",
    "VIBE-RLS-002": "Stage 2: PostgreSQL RLS & RBAC",
    "VIBE-TYPE-003": "Stage 3: Strict Typing & Borders",
    "VIBE-ARCH-004": "Stage 3: Modularization (CC <= 5)",
    "VIBE-QA-005": "Stage 4: Rule Zero & Test Net",
}


@dataclass(frozen=True)
class AuditFinding:
    """Representa un hallazgo individual redactado del protocolo."""

    rule_id: str
    stage: str
    severity: str
    file: str
    line: int
    message: str


@dataclass(frozen=True)
class RemediationOutcome:
    """Resultado de la emision del paquete de remediacion."""

    written_files: tuple[str, ...]
    skipped_existing: tuple[str, ...]


def redact_secrets(text: str) -> str:
    """Redacta valores sensibles, tokens Bearer y literales de llaves API."""
    cleaned = REDACT_LITERAL_RE.sub(REDACTION_MARKER, text)
    cleaned = REDACT_BEARER_RE.sub(rf"\1 {REDACTION_MARKER}", cleaned)
    return REDACT_ASSIGN_RE.sub(rf"\1{REDACTION_MARKER}", cleaned)


def _assert_safe_raw_path(raw_path: str) -> Path:
    stripped = raw_path.strip()
    lowered = stripped.lower()
    if not stripped or any(tok in lowered for tok in UNSAFE_PATH_TOKENS):
        raise ValueError(f"Ruta insegura o vacia detectada: {raw_path!r}")
    candidate = Path(stripped)
    if ".." in candidate.parts:
        raise ValueError(f"Path traversal detectado: {raw_path!r}")
    return candidate


def resolve_contained_path(
    raw_path: str,
    allowed_roots: Sequence[Path] | None = None,
    base_dir: Path | None = None,
) -> Path:
    """Resuelve una ruta validando contencion estricta en raices permitidas."""
    candidate = _assert_safe_raw_path(raw_path)
    roots = (
        tuple(r.resolve() for r in allowed_roots)
        if allowed_roots is not None
        else (Path.cwd().resolve(), Path(tempfile.gettempdir()).resolve())
    )
    anchor = base_dir.resolve() if base_dir is not None else roots[0]
    resolved = (
        candidate.resolve()
        if candidate.is_absolute()
        else (anchor / candidate).resolve()
    )
    if not any(resolved.is_relative_to(root) for root in roots):
        raise ValueError(f"Ruta fuera de directorio permitido: {resolved}")
    return resolved


def _is_test_path(rel_path: Path) -> bool:
    if any(part in TEST_DIR_NAMES for part in rel_path.parts[:-1]):
        return True
    return bool(TEST_FILE_RE.search(rel_path.name))


def _collect_project_files(
    target_dir: Path,
    excluded_dir: Path | None = None,
) -> list[Path]:
    collected: list[Path] = []
    for root, dirs, files in os.walk(target_dir, followlinks=False):
        root_path = Path(root)
        dirs[:] = sorted(
            d
            for d in dirs
            if d not in IGNORED_DIRS
            and (excluded_dir is None or (root_path / d).resolve() != excluded_dir)
        )
        for fname in sorted(files):
            fpath = root_path / fname
            if not fpath.is_symlink():
                collected.append(fpath)
    return collected


def _gitignore_covers_env(target_dir: Path) -> bool:
    gitignore = target_dir / ".gitignore"
    if not gitignore.is_file() or gitignore.is_symlink():
        return False
    lines = gitignore.read_text(encoding="utf-8", errors="replace").splitlines()
    return any(line.strip() in {".env", "/.env", "*.env", ".env*"} for line in lines)


def _find_line(
    lines: Sequence[str],
    pattern: re.Pattern[str],
    default: int = 1,
) -> int:
    for idx, line in enumerate(lines, start=1):
        if pattern.search(line):
            return idx
    return default


def _add_finding(
    findings: list[AuditFinding],
    rule_id: str,
    severity: str,
    rel: str,
    line: int,
    message: str,
) -> None:
    findings.append(
        AuditFinding(
            rule_id=rule_id,
            stage=STAGE_NAMES[rule_id],
            severity=severity,
            file=rel,
            line=line,
            message=redact_secrets(message),
        )
    )


def _scan_env_file(
    rel: str,
    lines: Sequence[str],
    env_ignored: bool,
    findings: list[AuditFinding],
    env_keys: set[str],
) -> None:
    for idx, line in enumerate(lines, start=1):
        match = ENV_ASSIGN_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip().strip("\"'")
        env_keys.add(key)
        is_placeholder = not value or bool(PLACEHOLDER_VAL_RE.search(value))
        if CLIENT_SECRET_VAR_RE.match(key):
            _add_finding(
                findings,
                "VIBE-SEC-001",
                "CRITICAL",
                rel,
                idx,
                f"Variable cliente privilegiada: {key}={REDACTION_MARKER}",
            )
        elif (
            not env_ignored and SENSITIVE_ENV_KEY_RE.search(key) and not is_placeholder
        ):
            _add_finding(
                findings,
                "VIBE-SEC-001",
                "CRITICAL",
                rel,
                idx,
                f"Secreto en .env sin .gitignore: {key}={REDACTION_MARKER}",
            )


def _scan_source_secrets(
    rel: str,
    lines: Sequence[str],
    findings: list[AuditFinding],
) -> None:
    for idx, line in enumerate(lines, start=1):
        client_match = CLIENT_SECRET_VAR_RE.search(line)
        if client_match:
            _add_finding(
                findings,
                "VIBE-SEC-001",
                "CRITICAL",
                rel,
                idx,
                f"Credencial privilegiada en cliente: {client_match.group(1)}",
            )
        if LITERAL_KEY_RE.search(line):
            _add_finding(
                findings,
                "VIBE-SEC-001",
                "CRITICAL",
                rel,
                idx,
                f"Literal de llave API detectado en codigo: {REDACTION_MARKER}",
            )


def _strip_sql_comments(sql_text: str) -> str:
    without_block = SQL_BLOCK_COMMENT_RE.sub("", sql_text)
    return SQL_LINE_COMMENT_RE.sub("", without_block)


def _scan_sql_file(rel: str, raw_text: str, findings: list[AuditFinding]) -> None:
    cleaned = _strip_sql_comments(raw_text)
    lines = cleaned.splitlines()
    if SQL_PERMISSIVE_RE.search(cleaned):
        _add_finding(
            findings,
            "VIBE-RLS-002",
            "CRITICAL",
            rel,
            _find_line(lines, SQL_PERMISSIVE_RE),
            "Politica SQL permisiva sin aislamiento; usar rls_hardening.sql",
        )
    if SQL_BYPASSRLS_RE.search(cleaned):
        _add_finding(
            findings,
            "VIBE-RLS-002",
            "CRITICAL",
            rel,
            _find_line(lines, SQL_BYPASSRLS_RE),
            "Uso inseguro de BYPASSRLS detectado en definicion SQL",
        )
    has_rls = bool(
        SQL_ENABLE_RLS_RE.search(cleaned) and SQL_FORCE_RLS_RE.search(cleaned)
    )
    if SQL_CREATE_TABLE_RE.search(cleaned) and not has_rls:
        _add_finding(
            findings,
            "VIBE-RLS-002",
            "CRITICAL",
            rel,
            _find_line(lines, SQL_CREATE_TABLE_RE),
            "CREATE TABLE sin ENABLE + FORCE ROW LEVEL SECURITY",
        )


def _scan_code_file(
    rel_path: Path,
    text: str,
    max_lines: int,
    findings: list[AuditFinding],
) -> None:
    rel = rel_path.as_posix()
    lines = text.splitlines()
    if FIXED_WAIT_RE.search(text):
        _add_finding(
            findings,
            "VIBE-QA-005",
            "HIGH",
            rel,
            _find_line(lines, FIXED_WAIT_RE),
            "Espera fija detectada (waitForTimeout/sleep); usar condicion real",
        )
    if _is_test_path(rel_path):
        return
    _scan_non_test_code(rel_path, rel, text, lines, max_lines, findings)


def _scan_non_test_code(
    rel_path: Path,
    rel: str,
    text: str,
    lines: Sequence[str],
    max_lines: int,
    findings: list[AuditFinding],
) -> None:
    is_client = rel_path.suffix in {".tsx", ".jsx", ".vue"} or "client" in rel.lower()
    if is_client and CLIENT_SERVICE_ROLE_RE.search(text):
        _add_finding(
            findings,
            "VIBE-RLS-002",
            "CRITICAL",
            rel,
            _find_line(lines, CLIENT_SERVICE_ROLE_RE),
            "Uso de service_role/supabaseAdmin en capa cliente",
        )
    if WEAK_TYPE_RE.search(text):
        _add_finding(
            findings,
            "VIBE-TYPE-003",
            "HIGH",
            rel,
            _find_line(lines, WEAK_TYPE_RE),
            "Escape de tipado estricto (: any / @ts-ignore / # type: ignore)",
        )
    if MUTATING_ROUTE_RE.search(text) and not IDEMPOTENCY_RE.search(text):
        _add_finding(
            findings,
            "VIBE-TYPE-003",
            "HIGH",
            rel,
            _find_line(lines, MUTATING_ROUTE_RE),
            "Endpoint mutador sin verificacion de cabecera Idempotency-Key",
        )
    if len(lines) > max_lines:
        _add_finding(
            findings,
            "VIBE-ARCH-004",
            "MEDIUM",
            rel,
            1,
            f"Archivo monolitico ({len(lines)} > {max_lines} lineas); CC<=5",
        )


def _scan_tsconfig_or_docker(
    rel: str,
    fname: str,
    text: str,
    findings: list[AuditFinding],
) -> None:
    lines = text.splitlines()
    if fname.startswith("tsconfig") and fname.endswith(".json"):
        if TS_STRICT_FALSE_RE.search(text):
            _add_finding(
                findings,
                "VIBE-TYPE-003",
                "HIGH",
                rel,
                _find_line(lines, TS_STRICT_FALSE_RE),
                "tsconfig con strict=false; habilitar strict: true",
            )
        return
    if fname == "Dockerfile" or fname.startswith("Dockerfile."):
        _scan_dockerfile(rel, text, lines, findings)


def _scan_dockerfile(
    rel: str,
    text: str,
    lines: Sequence[str],
    findings: list[AuditFinding],
) -> None:
    if DOCKER_USER_ROOT_RE.search(text) or not DOCKER_ANY_USER_RE.search(text):
        _add_finding(
            findings,
            "VIBE-QA-005",
            "HIGH",
            rel,
            _find_line(lines, DOCKER_USER_ROOT_RE),
            "Dockerfile ejecuta como root o carece de directiva USER no-root",
        )
    if DOCKER_FROM_LATEST_RE.search(text):
        _add_finding(
            findings,
            "VIBE-QA-005",
            "HIGH",
            rel,
            _find_line(lines, DOCKER_FROM_LATEST_RE),
            "Dockerfile usa etiqueta mutable :latest sin digest @sha256",
        )


def _is_env_target(fname: str) -> bool:
    return fname == ".env" or (
        fname.startswith(".env.") and not fname.endswith(".example")
    )


def _process_single_file(
    fpath: Path,
    target_dir: Path,
    env_ignored: bool,
    max_lines: int,
    findings: list[AuditFinding],
    env_keys: set[str],
) -> bool:
    rel_path = fpath.relative_to(target_dir)
    rel = rel_path.as_posix()
    has_test = _is_test_path(rel_path)
    text = fpath.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    if _is_env_target(fpath.name):
        _scan_env_file(rel, lines, env_ignored, findings, env_keys)
        return has_test
    if fpath.suffix == ".sql":
        _scan_sql_file(rel, text, findings)
        return has_test
    if fpath.suffix in CODE_EXTENSIONS:
        if not has_test:
            _scan_source_secrets(rel, lines, findings)
        _scan_code_file(rel_path, text, max_lines, findings)
        return has_test

    _scan_tsconfig_or_docker(rel, fpath.name, text, findings)
    return has_test


def _load_rls_template() -> str:
    local_template = (
        Path(__file__).resolve().parent / "templates" / "rls_hardening.sql"
    )
    return local_template.read_text(encoding="utf-8")


def _write_if_absent(
    path: Path,
    content: str,
    outcome_written: list[str],
    skipped: list[str],
) -> None:
    if path.exists():
        skipped.append(path.as_posix())
        return
    path.write_text(content, encoding="utf-8")
    outcome_written.append(path.as_posix())


def _build_rescue_plan_md(
    target_dir: Path,
    score: int,
    verdict: str,
    findings: Sequence[AuditFinding],
) -> str:
    lines = [
        "# Plan de Rescate Vibe-to-Enterprise (QA-11X)",
        "",
        f"- **Objetivo:** `{target_dir.name}`",
        f"- **Puntaje:** `{score}/100` (`{verdict}`)",
        f"- **Plantilla RLS:** `{RLS_TEMPLATE_REL}`",
        "",
        "## Hallazgos Priorizados",
    ]
    if not findings:
        lines.append("- Sin hallazgos criticos o altos.")
        return "\n".join(lines) + "\n"
    for item in findings:
        lines.append(
            f"- [{item.severity}] `{item.rule_id}` ({item.stage}) "
            f"`{item.file}:{item.line}` — {item.message}"
        )
    return "\n".join(lines) + "\n"


def emit_remediation_bundle(
    target_dir: Path,
    out_dir: Path,
    env_keys: Sequence[str],
    score: int,
    verdict: str,
    findings: Sequence[AuditFinding],
) -> RemediationOutcome:
    """Emite rls_hardening.sql, .env.example y RESCUE_PLAN.md sin sobrescribir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    skipped: list[str] = []

    _write_if_absent(
        out_dir / "rls_hardening.sql",
        _load_rls_template(),
        written,
        skipped,
    )
    keys = sorted(set(env_keys)) if env_keys else list(DEFAULT_ENV_KEYS)
    env_example = "".join(f"{key}=<CHANGE_ME_IN_VAULT>\n" for key in keys)
    _write_if_absent(out_dir / ".env.example", env_example, written, skipped)
    plan_md = _build_rescue_plan_md(target_dir, score, verdict, findings)
    _write_if_absent(out_dir / "RESCUE_PLAN.md", plan_md, written, skipped)
    return RemediationOutcome(tuple(written), tuple(skipped))


def _compute_summary(
    findings: Sequence[AuditFinding],
) -> tuple[dict[str, int], int, str]:
    counts = {
        "critical": sum(1 for f in findings if f.severity == "CRITICAL"),
        "high": sum(1 for f in findings if f.severity == "HIGH"),
        "medium": sum(1 for f in findings if f.severity == "MEDIUM"),
    }
    penalty = counts["critical"] * 25 + counts["high"] * 12 + counts["medium"] * 5
    score = max(0, 100 - penalty)
    is_ready = counts["critical"] == 0 and counts["high"] == 0 and score >= 90
    verdict = "ENTERPRISE_READY" if is_ready else "RESCUE_REQUIRED"
    return counts, score, verdict


def _scan_directory_tree(
    target_dir: Path,
    max_lines: int,
    emit_dir: Path | None,
) -> tuple[list[AuditFinding], set[str]]:
    findings: list[AuditFinding] = []
    env_keys: set[str] = set()
    env_ignored = _gitignore_covers_env(target_dir)
    has_any_test = False
    for fpath in _collect_project_files(target_dir, emit_dir):
        found_test = _process_single_file(
            fpath,
            target_dir,
            env_ignored,
            max_lines,
            findings,
            env_keys,
        )
        has_any_test = has_any_test or found_test

    if not has_any_test:
        _add_finding(
            findings,
            "VIBE-QA-005",
            "HIGH",
            ".",
            1,
            "Cero archivos de prueba; exigir >= 95% cobertura en Docker no-root",
        )
    return findings, env_keys


def audit_prototype(
    target_dir: Path,
    *,
    max_lines: int = DEFAULT_MAX_LINES,
    dry_run: bool = True,
    emit_dir: Path | None = None,
) -> dict[str, Any]:
    """Audita un prototipo vibe-coded bajo las 5 etapas Vibe-to-Enterprise."""
    if not target_dir.is_dir():
        raise ValueError(f"El directorio objetivo no existe: {target_dir}")
    if max_lines <= 0:
        raise ValueError(f"max_lines debe ser positivo: {max_lines}")

    findings, env_keys = _scan_directory_tree(target_dir, max_lines, emit_dir)
    counts, score, verdict = _compute_summary(findings)
    should_emit = emit_dir is not None and not dry_run
    remediation = (
        emit_remediation_bundle(
            target_dir,
            emit_dir,
            sorted(env_keys),
            score,
            verdict,
            findings,
        )
        if should_emit and emit_dir is not None
        else RemediationOutcome((), ())
    )
    return {
        "target": target_dir.as_posix(),
        "dry_run": dry_run,
        "score": score,
        "verdict": verdict,
        "counts": counts,
        "rls_template": RLS_TEMPLATE_REL,
        "findings": [asdict(f) for f in findings],
        "remediation": {
            "written_files": list(remediation.written_files),
            "skipped_existing": list(remediation.skipped_existing),
        },
    }


def format_report_text(report: dict[str, Any]) -> str:
    """Formatea salida Pass-Quiet (1 linea) o Fail-Verbose por etapas."""
    if report["verdict"] == "ENTERPRISE_READY":
        return (
            f"✅ [VIBE-RESCUE] ENTERPRISE_READY "
            f"(score={report['score']}/100, critical=0, high=0)"
        )
    counts = report["counts"]
    lines = [
        f"❌ [VIBE-RESCUE] RESCUE_REQUIRED (score={report['score']}/100, "
        f"critical={counts['critical']}, high={counts['high']}, "
        f"medium={counts['medium']})",
        f"   Template RLS: {report['rls_template']}",
    ]
    for item in report["findings"]:
        lines.append(
            f"   - [{item['severity']}] {item['rule_id']} ({item['stage']}) "
            f"{item['file']}:{item['line']} -> {item['message']}"
        )
    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Auditor determinista Vibe-to-Enterprise (QA-11X)"
    )
    parser.add_argument(
        "--target",
        default=".",
        help="Directorio del prototipo a auditar",
    )
    parser.add_argument(
        "--workspace-root",
        default=None,
        help="Raiz permitida para contencion",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON")
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Modo seguro sin escritura (default: True)",
    )
    parser.add_argument(
        "--emit-remediation",
        default=None,
        help="Directorio para emitir plantilla RLS, .env.example y RESCUE_PLAN.md",
    )
    parser.add_argument(
        "--max-lines",
        type=int,
        default=DEFAULT_MAX_LINES,
        help="Umbral maximo de lineas por modulo (default: 500)",
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Retorna exit code 1 si el veredicto es RESCUE_REQUIRED",
    )
    return parser


def _resolve_cli_paths(ns: argparse.Namespace) -> tuple[Path, Path | None]:
    ws_root = Path(ns.workspace_root).resolve() if ns.workspace_root else None
    allowed = (ws_root,) if ws_root is not None else None
    target_dir = resolve_contained_path(
        ns.target,
        allowed_roots=allowed,
        base_dir=ws_root,
    )
    if ns.emit_remediation is None:
        return target_dir, None
    emit_dir = resolve_contained_path(
        ns.emit_remediation,
        allowed_roots=(target_dir,),
        base_dir=target_dir,
    )
    return target_dir, emit_dir


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI no interactivo."""
    parser = _build_parser()
    ns = parser.parse_args(list(argv) if argv is not None else None)
    try:
        target_dir, emit_dir = _resolve_cli_paths(ns)
        report = audit_prototype(
            target_dir,
            max_lines=ns.max_lines,
            dry_run=ns.dry_run,
            emit_dir=emit_dir,
        )
    except ValueError as exc:
        print(f"❌ [VIBE-RESCUE] ERROR: {redact_secrets(str(exc))}", file=sys.stderr)
        return 2

    output = (
        json.dumps(report, indent=2, ensure_ascii=False)
        if ns.json
        else format_report_text(report)
    )
    print(output)
    if ns.enforce and report["verdict"] == "RESCUE_REQUIRED":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
