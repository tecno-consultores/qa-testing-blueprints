#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Memoria determinista de hallazgos y cortacircuitos Anti-Loop (exit 42)."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

EXIT_PASS = 0
EXIT_FAIL = 1
EXIT_CLI_ERROR = 2
EXIT_BREAKER_42 = 42
MAX_HISTORY_RUNS = 10
STATE_SCHEMA_VERSION = 2

SAFE_GIT_REF_RE = re.compile(r"^[A-Za-z0-9._/~^-]+$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
CONTAINER_PREFIX_RE = re.compile(r"^(?:/app/|/workspace/|/repo/|\./)+")
LINE_COL_SUFFIX_RE = re.compile(r"(?::\d+(?::\d+)?|\(\d+,\s*\d+\))+$")
MEM_ADDR_RE = re.compile(r"\b0x[0-9a-fA-F]{6,16}\b")
ISO_TS_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"
)
DURATION_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds)\b", re.IGNORECASE)
TMP_PATH_RE = re.compile(r"/tmp/[^\s\"':)]+")
MSG_LINE_REF_RE = re.compile(
    r"(?::\d+(?::\d+)?|\(\d+,\s*\d+\)|\b(?:line|línea|linea|col|column)\s+\d+\b|\bL\d+\b)",
    re.IGNORECASE,
)
WHITESPACE_RE = re.compile(r"\s+")

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(Bearer|Basic)\s+[^\s\"']+", re.IGNORECASE), r"\1 [REDACTED]"),
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED]\2"),
    (
        re.compile(
            r"\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s\"'&]+",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(
            r"(--(?:token|api-key|apikey|secret|password|passwd))\s+[^\s\"']+",
            re.IGNORECASE,
        ),
        r"\1 [REDACTED]",
    ),
    (re.compile(r"\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}\b"), "[REDACTED]"),
)


@dataclass(frozen=True)
class NormalizedFinding:
    """Representación canónica e invariante a líneas de un hallazgo QA."""

    fingerprint: str
    layer: str
    stack: str
    relative_file: str
    rule_or_test_name: str
    canonical_message: str


@dataclass(frozen=True)
class TrackedFindingEvaluation:
    """Resultado de evaluación de estado para un hallazgo activo en R_n."""

    finding: NormalizedFinding
    status: str
    consecutive_streak: int
    oscillations: int
    blocking: bool


@dataclass(frozen=True)
class EvaluationReport:
    """Resumen consolidado de la evaluación de estado en R_n."""

    exit_code: int
    session_key: str
    resolved_count: int
    persistent_count: int
    new_count: int
    oscillation_count: int
    active_count: int
    evaluations: tuple[TrackedFindingEvaluation, ...]


def _redact_secrets(text: str) -> str:
    cleaned = ANSI_RE.sub("", text)
    for pattern, repl in SECRET_PATTERNS:
        cleaned = pattern.sub(repl, cleaned)
    return cleaned


def _pick_first_str(
    record: dict[str, Any], keys: tuple[str, ...], fallback: str = ""
) -> str:
    for key in keys:
        val = record.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return fallback


def _normalize_relative_file(raw_path: str, workspace: Path) -> str:
    cleaned = _redact_secrets(raw_path).replace("\\", "/").strip()
    cleaned = LINE_COL_SUFFIX_RE.sub("", cleaned)
    ws_prefix = f"{workspace.resolve().as_posix().rstrip('/')}/"
    if cleaned.startswith(ws_prefix):
        cleaned = cleaned[len(ws_prefix) :]
    cleaned = CONTAINER_PREFIX_RE.sub("", cleaned)
    cleaned = TMP_PATH_RE.sub("/tmp/<tmp>", cleaned)
    return cleaned or "<unknown>"


def _normalize_message(raw_message: str) -> str:
    cleaned = _redact_secrets(raw_message)
    cleaned = MEM_ADDR_RE.sub("<addr>", cleaned)
    cleaned = ISO_TS_RE.sub("<ts>", cleaned)
    cleaned = DURATION_RE.sub("<dur>", cleaned)
    cleaned = TMP_PATH_RE.sub("/tmp/<tmp>", cleaned)
    cleaned = MSG_LINE_REF_RE.sub("", cleaned)
    return WHITESPACE_RE.sub(" ", cleaned).strip()


def normalize_finding(
    raw: dict[str, Any], workspace: Path, default_layer: str = "qa"
) -> NormalizedFinding:
    """Normaliza un hallazgo a su tupla canónica y calcula su huella SHA-256."""
    layer = _pick_first_str(raw, ("layer", "stage"), default_layer).lower()
    stack = _pick_first_str(raw, ("stack",), "generic").lower()
    rel_file = _normalize_relative_file(
        _pick_first_str(raw, ("relative_file", "file", "path"), "<unknown>"),
        workspace,
    )
    rule_name = _normalize_message(
        _pick_first_str(
            raw, ("rule_or_test_name", "rule", "test_name", "code"), "<unspecified>"
        )
    )
    message = _normalize_message(
        _pick_first_str(
            raw,
            (
                "canonical_message",
                "canonical_symbol_or_message",
                "symbol",
                "message",
                "error_summary",
            ),
            rule_name,
        )
    )
    canonical = f"{layer}\x1f{stack}\x1f{rel_file}\x1f{rule_name}\x1f{message}"
    fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return NormalizedFinding(
        fingerprint=fingerprint,
        layer=layer,
        stack=stack,
        relative_file=rel_file,
        rule_or_test_name=rule_name,
        canonical_message=message,
    )


def validate_base_ref(base_ref: str | None) -> str | None:
    """Valida que la referencia Git base no permita inyección de flags."""
    if base_ref is None:
        return None
    stripped = base_ref.strip()
    if not stripped or stripped.startswith("-") or not SAFE_GIT_REF_RE.match(stripped):
        raise ValueError(f"Referencia Git base insegura: {base_ref!r}")
    return stripped


def _run_git(workspace: Path, args: list[str]) -> str | None:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    out = proc.stdout.strip()
    return out if out else None


def _resolve_merge_base(workspace: Path, base_ref: str | None) -> str:
    candidates = (base_ref,) if base_ref else ("origin/main", "main")
    for ref in candidates:
        base = _run_git(workspace, ["merge-base", "HEAD", ref])
        if base:
            return base[:12]
    head = _run_git(workspace, ["rev-parse", "--verify", "HEAD"])
    return head[:12] if head else "unborn"


def resolve_session_key(workspace: Path, base_ref: str | None = None) -> str:
    """Calcula la clave determinista de sesión `{branch}:{merge_base_sha}`."""
    validated_ref = validate_base_ref(base_ref)
    branch_raw = _run_git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"])
    if branch_raw is None:
        return "nogit:unborn"
    branch = "detached" if branch_raw == "HEAD" else branch_raw
    merge_base = _resolve_merge_base(workspace, validated_ref)
    return f"{branch}:{merge_base}"


def _ensure_no_symlink(target: Path) -> None:
    if target.is_symlink() or target.parent.is_symlink():
        raise ValueError(f"Ruta symlink rechazada por seguridad: {target}")


def _load_state_doc(state_file: Path) -> dict[str, Any]:
    _ensure_no_symlink(state_file)
    if not state_file.is_file():
        return {"version": STATE_SCHEMA_VERSION, "sessions": {}}
    try:
        parsed = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": STATE_SCHEMA_VERSION, "sessions": {}}
    if not isinstance(parsed, dict) or not isinstance(parsed.get("sessions"), dict):
        return {"version": STATE_SCHEMA_VERSION, "sessions": {}}
    return {"version": STATE_SCHEMA_VERSION, "sessions": dict(parsed["sessions"])}


def _ensure_private_parent(parent: Path) -> None:
    parent.mkdir(parents=True, exist_ok=True)
    if (
        parent.stat().st_uid == os.geteuid()
        and parent.resolve() != Path.cwd().resolve()
    ):
        os.chmod(parent, 0o700)


def _save_state_doc(state_file: Path, state_doc: dict[str, Any]) -> None:
    _ensure_no_symlink(state_file)
    _ensure_private_parent(state_file.parent)
    payload = json.dumps(state_doc, indent=2, ensure_ascii=False) + "\n"
    tmp_path = (
        state_file.parent
        / f".{state_file.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(tmp_path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, state_file)
        os.chmod(state_file, 0o600)
    except OSError:
        tmp_path.unlink(missing_ok=True)
        raise


def _extract_raw_findings(payload: Any) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(payload, list):
        return "qa", [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("findings"), list):
        raw_stage = payload.get("stage")
        stage = (
            raw_stage.strip()
            if isinstance(raw_stage, str) and raw_stage.strip()
            else "qa"
        )
        items = [item for item in payload["findings"] if isinstance(item, dict)]
        return stage, items
    raise ValueError("El payload JSON debe ser una lista o un objeto con 'findings'.")


def _resolve_stage_id(explicit_stage: str | None, payload_stage: str) -> str:
    if isinstance(explicit_stage, str) and explicit_stage.strip():
        return explicit_stage.strip()
    return payload_stage


def _read_findings_payload(findings_input: str) -> Any:
    if findings_input == "-":
        if sys.stdin.isatty():
            raise ValueError(
                "[QA-CLI-TTY-01] Se requiere --findings-input <ruta> o entrada "
                "por tubería stdin; TTY interactivo rechazado."
            )
        raw_text = sys.stdin.read()
    else:
        src = Path(findings_input)
        _ensure_no_symlink(src)
        raw_text = src.read_text(encoding="utf-8")
    return json.loads(raw_text)


def _deduplicate_findings(
    raw_items: list[dict[str, Any]], workspace: Path, default_layer: str
) -> dict[str, NormalizedFinding]:
    deduped: dict[str, NormalizedFinding] = {}
    for item in raw_items:
        norm = normalize_finding(item, workspace, default_layer=default_layer)
        deduped[norm.fingerprint] = norm
    return {fp: deduped[fp] for fp in sorted(deduped)}


def _extract_history_sets(
    session_entry: dict[str, Any], stage: str = "qa"
) -> list[set[str]]:
    stage_runs = session_entry.get("stage_runs")
    if isinstance(stage_runs, dict):
        raw_runs = stage_runs.get(stage)
    else:
        raw_runs = session_entry.get("runs")
    if not isinstance(raw_runs, list):
        return []
    result: list[set[str]] = []
    for run in raw_runs[-MAX_HISTORY_RUNS:]:
        if isinstance(run, dict) and isinstance(run.get("fingerprints"), list):
            result.append({str(fp) for fp in run["fingerprints"]})
    return result


def _count_oscillations(history_sets: list[set[str]], fingerprint: str) -> int:
    seen_before = False
    was_absent = False
    oscillations = 0
    for fp_set in history_sets:
        present = fingerprint in fp_set
        if present and seen_before and was_absent:
            oscillations += 1
        if present:
            seen_before = True
            was_absent = False
        elif seen_before:
            was_absent = True
    return oscillations


def _count_trailing_streak(history_sets: list[set[str]], fingerprint: str) -> int:
    streak = 0
    for fp_set in reversed(history_sets):
        if fingerprint not in fp_set:
            break
        streak += 1
    return streak


def _evaluate_single_finding(
    finding: NormalizedFinding, history_sets: list[set[str]], max_streak: int
) -> TrackedFindingEvaluation:
    fp = finding.fingerprint
    oscillations = _count_oscillations([*history_sets, {fp}], fp)
    if history_sets and fp in history_sets[-1]:
        streak = 1 + _count_trailing_streak(history_sets, fp)
        status = "PERSISTENT"
    elif oscillations > 0:
        streak = 1
        status = "REGRESSION_OSCILLATION"
    else:
        streak = 1
        status = "NEW"
    blocking = streak >= max_streak or oscillations >= 1
    return TrackedFindingEvaluation(
        finding=finding,
        status=status,
        consecutive_streak=streak,
        oscillations=oscillations,
        blocking=blocking,
    )


def _to_run_record(active: dict[str, NormalizedFinding]) -> dict[str, Any]:
    items = {
        fp: {
            "fingerprint": item.fingerprint,
            "layer": item.layer,
            "stack": item.stack,
            "relative_file": item.relative_file,
            "rule_or_test_name": item.rule_or_test_name,
            "canonical_message": item.canonical_message,
        }
        for fp, item in active.items()
    }
    return {
        "recorded_at": datetime.now(UTC).isoformat(),
        "fingerprints": list(active.keys()),
        "items": items,
    }


def _build_evaluation_report(
    session_key: str,
    active: dict[str, NormalizedFinding],
    history_sets: list[set[str]],
    max_streak: int,
) -> EvaluationReport:
    prev_set = history_sets[-1] if history_sets else set()
    resolved_count = len(prev_set - set(active.keys()))
    evals = tuple(
        _evaluate_single_finding(active[fp], history_sets, max_streak) for fp in active
    )
    persistent_count = sum(1 for item in evals if item.status == "PERSISTENT")
    new_count = sum(1 for item in evals if item.status == "NEW")
    oscillation_count = sum(
        1 for item in evals if item.status == "REGRESSION_OSCILLATION"
    )
    has_blocker = any(item.blocking for item in evals)
    exit_code = (
        EXIT_PASS
        if not evals
        else (EXIT_BREAKER_42 if has_blocker else EXIT_FAIL)
    )
    return EvaluationReport(
        exit_code=exit_code,
        session_key=session_key,
        resolved_count=resolved_count,
        persistent_count=persistent_count,
        new_count=new_count,
        oscillation_count=oscillation_count,
        active_count=len(evals),
        evaluations=evals,
    )


@dataclass(frozen=True)
class _SessionRunUpdate:
    session_key: str
    stage: str
    active: dict[str, NormalizedFinding]
    report: EvaluationReport


def _ensure_dict_field(parent: dict[str, Any], key: str) -> dict[str, Any]:
    raw_val = parent.get(key)
    return dict(raw_val) if isinstance(raw_val, dict) else {}


def _resolve_stage_history_seed(entry: dict[str, Any], stage: str) -> list[Any]:
    raw_sr = entry.get("stage_runs")
    if isinstance(raw_sr, dict):
        raw_runs = raw_sr.get(stage)
        return list(raw_runs) if isinstance(raw_runs, list) else []
    legacy = entry.get("runs")
    return list(legacy) if isinstance(legacy, list) else []


def _persist_session_run(
    state_doc: dict[str, Any], update: _SessionRunUpdate
) -> None:
    sessions: dict[str, Any] = state_doc.setdefault("sessions", {})
    entry = _ensure_dict_field(sessions, update.session_key)
    stage_runs = _ensure_dict_field(entry, "stage_runs")
    runs = _resolve_stage_history_seed(entry, update.stage)
    runs.append(_to_run_record(update.active))
    stage_runs[update.stage] = runs[-MAX_HISTORY_RUNS:]
    streaks = _ensure_dict_field(entry, "streaks")
    oscillations = _ensure_dict_field(entry, "oscillations")
    streaks[update.stage] = max(
        (item.consecutive_streak for item in update.report.evaluations), default=0
    )
    oscillations[update.stage] = sum(
        item.oscillations for item in update.report.evaluations
    )
    entry.pop("runs", None)
    entry["updated_at"] = datetime.now(UTC).isoformat()
    entry["stage_runs"] = stage_runs
    entry["streaks"] = streaks
    entry["oscillations"] = oscillations
    sessions[update.session_key] = entry


def evaluate_and_record(
    *,
    state_file: Path,
    workspace: Path,
    payload: Any,
    max_streak: int = 3,
    base_ref: str | None = None,
    reset_state: bool = False,
    stage: str | None = None,
) -> EvaluationReport:
    """Evalúa los hallazgos de R_n contra el historial de sesión y persiste R_n."""
    if max_streak < 1:
        raise ValueError("--max-streak debe ser >= 1")
    session_key = resolve_session_key(workspace, base_ref=base_ref)
    state_doc = _load_state_doc(state_file)
    if reset_state:
        state_doc.setdefault("sessions", {}).pop(session_key, None)
    payload_stage, raw_items = _extract_raw_findings(payload)
    resolved_stage = _resolve_stage_id(stage, payload_stage)
    active = _deduplicate_findings(raw_items, workspace, resolved_stage)
    session_entry = state_doc.get("sessions", {}).get(session_key, {})
    history_sets = (
        _extract_history_sets(session_entry, stage=resolved_stage)
        if isinstance(session_entry, dict)
        else []
    )
    report = _build_evaluation_report(session_key, active, history_sets, max_streak)
    _persist_session_run(
        state_doc,
        _SessionRunUpdate(
            session_key=session_key,
            stage=resolved_stage,
            active=active,
            report=report,
        ),
    )
    _save_state_doc(state_file, state_doc)
    return report


def reset_session_state(
    state_file: Path, workspace: Path, base_ref: str | None = None
) -> str:
    """Limpia la memoria de hallazgos de la sesión activa (uso humano explícito)."""
    session_key = resolve_session_key(workspace, base_ref=base_ref)
    state_doc = _load_state_doc(state_file)
    state_doc.setdefault("sessions", {}).pop(session_key, None)
    _save_state_doc(state_file, state_doc)
    return session_key


def _format_finding_line(item: TrackedFindingEvaluation) -> str:
    f = item.finding
    return (
        f"  - [{item.status} | fp={f.fingerprint} | streak={item.consecutive_streak} | "
        f"osc={item.oscillations}] ({f.layer}/{f.stack}) {f.relative_file} "
        f"[{f.rule_or_test_name}]: {f.canonical_message}"
    )


def format_report_output(report: EvaluationReport) -> str:
    """Formatea salida Pass-Quiet, Fail-Verbose o bloqueo BREAKER-42."""
    stats = (
        f"session={report.session_key} | activos={report.active_count} | "
        f"resueltos={report.resolved_count} | persistentes={report.persistent_count} | "
        f"nuevos={report.new_count} | oscilaciones={report.oscillation_count}"
    )
    if report.exit_code == EXIT_PASS:
        return f"[PASS] CERTIFY-STATE | {stats}"
    if report.exit_code == EXIT_FAIL:
        lines = [f"[FAIL] CERTIFY-STATE | {stats}"]
        lines.extend(_format_finding_line(item) for item in report.evaluations)
        return "\n".join(lines)
    lines = [f"[BREAKER-42] ANTI-LOOP ACTIVADO | {stats}"]
    lines.extend(
        _format_finding_line(item) for item in report.evaluations if item.blocking
    )
    lines.append(
        "DIRECTIVA OBLIGATORIA: Detén ediciones a ciegas, consulta "
        "inspect_ast_blast_radius (changed_since_ref) o python3 "
        ".agents/scripts/inspect_blast_radius.py y aplica las 4 fases de "
        "qa-11x-systematic-debugging (--reset-state requiere intervención humana)."
    )
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    """Construye el parser CLI con la firma congelada del Hito 22."""
    parser = argparse.ArgumentParser(
        description="Tracker determinista de hallazgos y cortacircuitos BREAKER-42."
    )
    parser.add_argument(
        "--state-file",
        default=".agents/.cache/certify_state.json",
        help="Ruta al JSON de estado persistente (0600).",
    )
    parser.add_argument(
        "--findings-input",
        default=None,
        help="Ruta JSON de hallazgos o '-' para stdin.",
    )
    parser.add_argument(
        "--max-streak",
        type=int,
        default=3,
        help="Máximo de corridas consecutivas antes de activar exit 42 (default: 3).",
    )
    parser.add_argument(
        "--workspace",
        default=".",
        help="Ruta raíz del repositorio Git.",
    )
    parser.add_argument(
        "--base-ref",
        default=None,
        help="Referencia Git base para merge-base.",
    )
    parser.add_argument(
        "--stage",
        default=None,
        help="Etapa QA a registrar en stage_runs (default: payload.stage o 'qa').",
    )
    parser.add_argument(
        "--reset-state",
        action="store_true",
        help="Reinicia el estado de la sesión actual (intervención humana explícita).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI para certificación y seguimiento determinista."""
    args = build_arg_parser().parse_args(argv)
    workspace = Path(args.workspace)
    state_file = Path(args.state_file)
    try:
        if args.reset_state and args.findings_input is None:
            session_key = reset_session_state(state_file, workspace, args.base_ref)
            print(f"[PASS] CERTIFY-STATE | session={session_key} | reset=true")
            return EXIT_PASS
        findings_src = "-" if args.findings_input is None else args.findings_input
        payload = _read_findings_payload(findings_src)
        report = evaluate_and_record(
            state_file=state_file,
            workspace=workspace,
            payload=payload,
            max_streak=args.max_streak,
            base_ref=args.base_ref,
            reset_state=args.reset_state,
            stage=args.stage,
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"[ERROR] CERTIFY-STATE: {exc}", file=sys.stderr)
        return EXIT_CLI_ERROR
    stream = sys.stdout if report.exit_code == EXIT_PASS else sys.stderr
    print(format_report_output(report), file=stream)
    return report.exit_code


if __name__ == "__main__":  # pragma: no cover  # QA11X-APPROVED-EXCLUSION(CLI)
    raise SystemExit(main())
