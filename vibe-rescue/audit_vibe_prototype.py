#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Auditor estatico Zero-LLM del protocolo Vibe-to-Enterprise (QA-11X)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

_SCRIPT_DIR = str(Path(__file__).resolve().parent)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from _vibe_rules import (  # noqa: E402
    CODE_EXTENSIONS,
    DEFAULT_ENV_KEYS,
    DEFAULT_MAX_LINES,
    IGNORED_DIRS,
    RLS_TEMPLATE_REL,
    UNSAFE_PATH_TOKENS,
    AuditFinding,
    ScanContext,
    add_finding,
    is_test_path,
    redact_secrets,
    scan_code_file,
    scan_env_file,
    scan_source_secrets,
    scan_sql_file,
    scan_tsconfig_or_docker,
)

__all__ = [
    "AuditFinding",
    "DEFAULT_ENV_KEYS",
    "DEFAULT_MAX_LINES",
    "RLS_TEMPLATE_REL",
    "RemediationOutcome",
    "audit_prototype",
    "emit_remediation_bundle",
    "format_report_text",
    "main",
    "redact_secrets",
    "resolve_contained_path",
]


@dataclass(frozen=True)
class RemediationOutcome:
    """Resultado de la emision del paquete de remediacion."""

    written_files: tuple[str, ...]
    skipped_existing: tuple[str, ...]


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


def _read_gitignore_patterns(target_dir: Path) -> frozenset[str]:
    gitignore = target_dir / ".gitignore"
    if not gitignore.is_file() or gitignore.is_symlink():
        return frozenset()
    lines = gitignore.read_text(encoding="utf-8", errors="replace").splitlines()
    return frozenset(
        line.strip().lstrip("/")
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    )


def _is_env_target(fname: str) -> bool:
    return fname == ".env" or (
        fname.startswith(".env.") and not fname.endswith(".example")
    )


def _process_single_file(fpath: Path, ctx: ScanContext) -> None:
    rel_path = fpath.relative_to(ctx.target_dir)
    rel = rel_path.as_posix()
    has_test = is_test_path(rel_path)
    ctx.has_any_test = ctx.has_any_test or has_test
    text = fpath.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    if _is_env_target(fpath.name):
        scan_env_file(rel, lines, ctx)
        return
    if fpath.suffix == ".sql":
        scan_sql_file(rel, text, ctx.findings)
        return
    if fpath.suffix in CODE_EXTENSIONS:
        if not has_test:
            scan_source_secrets(rel, lines, ctx.findings)
        scan_code_file(rel_path, text, ctx.max_lines, ctx.findings)
        return
    scan_tsconfig_or_docker(rel, fpath.name, text, ctx.findings)


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


def emit_remediation_bundle(
    target_dir: Path,
    out_dir: Path,
    findings: Sequence[AuditFinding],
    env_keys: Sequence[str] = (),
) -> RemediationOutcome:
    """Emite rls_hardening.sql, .env.example y RESCUE_PLAN.md sin sobrescribir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    skipped: list[str] = []
    _, score, verdict = _compute_summary(findings)

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


def _scan_directory_tree(
    target_dir: Path,
    max_lines: int,
    emit_dir: Path | None,
) -> tuple[list[AuditFinding], set[str]]:
    ctx = ScanContext(
        target_dir=target_dir,
        env_ignored=False,
        max_lines=max_lines,
        gitignore_patterns=_read_gitignore_patterns(target_dir),
    )
    for fpath in _collect_project_files(target_dir, emit_dir):
        _process_single_file(fpath, ctx)

    if not ctx.has_any_test:
        add_finding(
            ctx.findings,
            "VIBE-QA-005",
            (".", 1),
            "Cero archivos de prueba; exigir >= 95% cobertura en Docker no-root",
        )
    return ctx.findings, ctx.env_keys


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
        emit_remediation_bundle(target_dir, emit_dir, findings, sorted(env_keys))
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
    parser.add_argument("--target", default=".", help="Directorio a auditar")
    parser.add_argument("--workspace-root", default=None, help="Raiz permitida")
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
