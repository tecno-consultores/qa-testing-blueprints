#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Compuerta determinista multi-señal Release Readiness Gate (GO/NO_GO/SKIPPED)."""

from __future__ import annotations

import argparse
import datetime
import json
import math
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

try:
    import defusedxml.ElementTree as ET  # type: ignore[import-untyped]
except ImportError:
    import xml.etree.ElementTree as ET  # pre-validado contra XXE antes de parsear

SCOPE_FULL = "full"
SCOPE_SMOKE = "smoke"
DECISION_GO = "GO"
DECISION_NO_GO = "NO_GO"
DECISION_SKIPPED = "SKIPPED"
MAX_FAILED_TESTS_REPORTED = 20

DEFAULT_THRESHOLDS: dict[str, float | int] = {
    "min_pass_rate_pct": 100.0,
    "max_error_rate_pct": 1.0,
    "max_p95_ms": 500.0,
    "max_p99_ms": 1000.0,
    "max_active_incidents": 0,
    "max_open_blockers": 0,
    "max_open_criticals": 0,
    "max_qa_escapes": 0,
}


@dataclass(frozen=True)
class BlockingReason:
    code: str
    signal: str
    metric: str
    actual: float | int | str
    threshold: float | int | str
    message: str


@dataclass(frozen=True)
class JunitSummary:
    provided: bool
    total_tests: int
    executed_tests: int
    failures: int
    errors: int
    skipped: int
    pass_rate_pct: float
    failed_tests: list[str]


@dataclass(frozen=True)
class TelemetrySummary:
    provided: bool
    error_rate_pct: float
    p95_ms: float
    p99_ms: float
    active_incidents: int


@dataclass(frozen=True)
class DefectsSummary:
    provided: bool
    open_blockers: int
    open_criticals: int
    qa_escapes: int


def _security_reason(code: str, metric: str, actual: str, message: str) -> BlockingReason:
    return BlockingReason(
        code=code,
        signal="security",
        metric=metric,
        actual=actual,
        threshold="contained-valid",
        message=message,
    )


def _normalize_utc_timestamp(
    raw_timestamp: str | None, reasons: list[BlockingReason]
) -> str:
    if raw_timestamp is None:
        return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    cleaned = raw_timestamp.strip()
    if not cleaned:
        reasons.append(
            _security_reason(
                "INVALID_INPUT",
                "timestamp",
                str(raw_timestamp),
                "Timestamp ISO-8601 vacío.",
            )
        )
        return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    normalized = f"{cleaned[:-1]}+00:00" if cleaned.endswith("Z") else cleaned
    try:
        dt = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        reasons.append(
            _security_reason(
                "INVALID_INPUT",
                "timestamp",
                cleaned,
                f"Timestamp ISO-8601 inválido: '{cleaned}'.",
            )
        )
        return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.UTC)
    return dt.astimezone(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_contained(root_dir: Path, target_path: Path) -> bool:
    try:
        target_path.relative_to(root_dir)
        return True
    except ValueError:
        return False


def _resolve_contained_path(
    workspace_root: Path,
    raw_path: str,
    reasons: list[BlockingReason],
    *,
    must_exist: bool,
) -> Path | None:
    if "\0" in raw_path or "\0" in str(workspace_root):
        reasons.append(
            _security_reason(
                "PATH_TRAVERSAL",
                "path",
                raw_path,
                "Ruta rechazada por contener bytes nulos.",
            )
        )
        return None
    if not raw_path.strip():
        reasons.append(
            _security_reason(
                "INVALID_INPUT", "path", raw_path, "La ruta no puede estar vacía."
            )
        )
        return None

    root_resolved = workspace_root.resolve()
    candidate = Path(raw_path)
    joined = (
        candidate if candidate.is_absolute() else root_resolved / candidate
    )
    lexical = Path(os.path.normpath(str(joined)))
    if not _is_contained(root_resolved, lexical):
        reasons.append(
            _security_reason(
                "PATH_TRAVERSAL",
                "path",
                raw_path,
                f"La ruta '{raw_path}' escapa los límites del workspace.",
            )
        )
        return None

    return _validate_real_path(root_resolved, lexical, raw_path, reasons, must_exist)


def _validate_real_path(
    root_resolved: Path,
    lexical: Path,
    raw_path: str,
    reasons: list[BlockingReason],
    must_exist: bool,
) -> Path | None:
    if must_exist:
        if not lexical.exists() or not lexical.is_file():
            reasons.append(
                _security_reason(
                    "FILE_NOT_FOUND",
                    "path",
                    raw_path,
                    f"Archivo requerido no encontrado: '{raw_path}'.",
                )
            )
            return None
        real_target = lexical.resolve()
        if not _is_contained(root_resolved, real_target):
            reasons.append(
                _security_reason(
                    "PATH_TRAVERSAL",
                    "path",
                    raw_path,
                    f"Enlace simbólico fuera del workspace detectado en '{raw_path}'.",
                )
            )
            return None
        return real_target

    parent_real = lexical.parent.resolve()
    if not _is_contained(root_resolved, parent_real):
        reasons.append(
            _security_reason(
                "PATH_TRAVERSAL",
                "path",
                raw_path,
                f"El directorio destino de '{raw_path}' escapa el workspace.",
            )
        )
        return None
    return parent_real / lexical.name


def _empty_junit() -> JunitSummary:
    return JunitSummary(
        provided=False,
        total_tests=0,
        executed_tests=0,
        failures=0,
        errors=0,
        skipped=0,
        pass_rate_pct=0.0,
        failed_tests=[],
    )


def _parse_non_neg_int(raw_val: str | None) -> int:
    if raw_val is None or not raw_val.strip():
        return 0
    try:
        parsed = int(float(raw_val.strip()))
    except ValueError:
        return 0
    return max(0, parsed)


def _collect_suite_elements(root: Any) -> tuple[int, int, int, int]:
    suites = list(root.iter("testsuite"))
    if not suites and root.tag == "testsuite":
        suites = [root]
    if suites:
        return (
            sum(_parse_non_neg_int(s.attrib.get("tests")) for s in suites),
            sum(_parse_non_neg_int(s.attrib.get("failures")) for s in suites),
            sum(_parse_non_neg_int(s.attrib.get("errors")) for s in suites),
            sum(_parse_non_neg_int(s.attrib.get("skipped")) for s in suites),
        )
    return (
        _parse_non_neg_int(root.attrib.get("tests")),
        _parse_non_neg_int(root.attrib.get("failures")),
        _parse_non_neg_int(root.attrib.get("errors")),
        _parse_non_neg_int(root.attrib.get("skipped")),
    )


def _collect_testcases(root: Any) -> tuple[int, int, int, int, list[str]]:
    cases = list(root.iter("testcase"))
    obs_failures = 0
    obs_errors = 0
    obs_skipped = 0
    failed_names: list[str] = []

    for case in cases:
        classname = (case.attrib.get("classname") or "").strip()
        name = (case.attrib.get("name") or "unnamed-test").strip()
        label = f"{classname}::{name}" if classname else name
        has_failure = case.find("failure") is not None
        has_error = case.find("error") is not None
        has_skipped = case.find("skipped") is not None
        if has_failure:
            obs_failures += 1
        if has_error:
            obs_errors += 1
        if has_skipped:
            obs_skipped += 1
        if (
            (has_failure or has_error)
            and label not in failed_names
            and len(failed_names) < MAX_FAILED_TESTS_REPORTED
        ):
            failed_names.append(label)

    return len(cases), obs_failures, obs_errors, obs_skipped, failed_names


def _parse_junit_xml_text(raw_xml: str, reasons: list[BlockingReason]) -> JunitSummary:
    upper = raw_xml.upper()
    if "<!DOCTYPE" in upper or "<!ENTITY" in upper:
        reasons.append(
            _security_reason(
                "XXE_DETECTED",
                "junit.xml",
                "<!DOCTYPE/<!ENTITY",
                "Payload XML rechazado por seguridad anti-XXE (APSC-DV-002390/002550).",
            )
        )
        return _empty_junit()

    try:
        root = ET.fromstring(raw_xml)
    except (ET.ParseError, ValueError) as exc:
        reasons.append(
            _security_reason(
                "INVALID_XML",
                "junit.xml",
                "malformed",
                f"XML JUnit inválido: {exc}",
            )
        )
        return _empty_junit()

    if root.tag not in ("testsuite", "testsuites"):
        reasons.append(
            _security_reason(
                "INVALID_XML",
                "junit.xml",
                root.tag,
                "El XML JUnit debe tener nodo raíz <testsuite> o <testsuites>.",
            )
        )
        return _empty_junit()

    s_tests, s_fail, s_err, s_skip = _collect_suite_elements(root)
    c_total, c_fail, c_err, c_skip, failed_names = _collect_testcases(root)

    total_tests = max(s_tests, c_total)
    failures = max(s_fail, c_fail)
    errors = max(s_err, c_err)
    skipped = max(s_skip, c_skip)
    executed = max(0, total_tests - skipped)
    passed = max(0, executed - failures - errors)
    pass_rate = round((passed / executed) * 100.0, 2) if executed > 0 else 0.0

    return JunitSummary(
        provided=True,
        total_tests=total_tests,
        executed_tests=executed,
        failures=failures,
        errors=errors,
        skipped=skipped,
        pass_rate_pct=pass_rate,
        failed_tests=failed_names,
    )


def _load_junit_from_path(
    workspace_root: Path, junit_path: str | None, reasons: list[BlockingReason]
) -> JunitSummary:
    if junit_path is None:
        return _empty_junit()
    safe_path = _resolve_contained_path(
        workspace_root, junit_path, reasons, must_exist=True
    )
    if safe_path is None:
        return _empty_junit()
    return _parse_junit_xml_text(safe_path.read_text(encoding="utf-8"), reasons)


def _load_json_dict(
    workspace_root: Path,
    rel_path: str | None,
    reasons: list[BlockingReason],
) -> dict[str, Any] | None:
    if rel_path is None:
        return None
    safe_path = _resolve_contained_path(
        workspace_root, rel_path, reasons, must_exist=True
    )
    if safe_path is None:
        return None
    try:
        parsed = json.loads(safe_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        reasons.append(
            _security_reason(
                "INVALID_JSON", rel_path, "invalid-json", f"JSON inválido: {exc}"
            )
        )
        return None
    if not isinstance(parsed, dict):
        reasons.append(
            _security_reason(
                "INVALID_JSON",
                rel_path,
                type(parsed).__name__,
                f"La raíz de '{rel_path}' debe ser un objeto JSON.",
            )
        )
        return None
    return parsed


def _extract_non_neg_number(
    source: dict[str, Any],
    keys: tuple[str, ...],
    metric_name: str,
    reasons: list[BlockingReason],
) -> float:
    for key in keys:
        if key not in source or source[key] is None:
            continue
        val = source[key]
        if isinstance(val, bool) or not isinstance(val, (int, float)):
            reasons.append(
                _security_reason(
                    "INVALID_INPUT",
                    metric_name,
                    str(val),
                    f"Métrica '{metric_name}' inválida: debe ser numérica.",
                )
            )
            return 0.0
        fval = float(val)
        if not math.isfinite(fval) or fval < 0:
            reasons.append(
                _security_reason(
                    "INVALID_INPUT",
                    metric_name,
                    str(val),
                    f"Métrica '{metric_name}' inválida: debe ser finita >= 0.",
                )
            )
            return 0.0
        return fval
    return 0.0


def _normalize_telemetry(
    raw: dict[str, Any] | None, reasons: list[BlockingReason]
) -> TelemetrySummary:
    if raw is None:
        return TelemetrySummary(
            provided=False, error_rate_pct=0.0, p95_ms=0.0, p99_ms=0.0, active_incidents=0
        )
    nested = raw.get("metrics")
    merged = {**nested, **raw} if isinstance(nested, dict) else raw
    return TelemetrySummary(
        provided=True,
        error_rate_pct=_extract_non_neg_number(
            merged,
            ("errorRatePct", "error_rate_pct", "http_error_rate_pct", "errorRate"),
            "telemetry.error_rate_pct",
            reasons,
        ),
        p95_ms=_extract_non_neg_number(
            merged,
            ("p95Ms", "p95_ms", "latencyP95Ms", "latency_p95_ms", "http_p95_ms"),
            "telemetry.p95_ms",
            reasons,
        ),
        p99_ms=_extract_non_neg_number(
            merged,
            ("p99Ms", "p99_ms", "latencyP99Ms", "latency_p99_ms", "http_p99_ms"),
            "telemetry.p99_ms",
            reasons,
        ),
        active_incidents=int(
            _extract_non_neg_number(
                merged,
                ("activeIncidents", "active_incidents", "incidents_open"),
                "telemetry.active_incidents",
                reasons,
            )
        ),
    )


def _normalize_defects(
    raw: dict[str, Any] | None, reasons: list[BlockingReason]
) -> DefectsSummary:
    if raw is None:
        return DefectsSummary(
            provided=False, open_blockers=0, open_criticals=0, qa_escapes=0
        )
    return DefectsSummary(
        provided=True,
        open_blockers=int(
            _extract_non_neg_number(
                raw,
                ("openBlockers", "open_blockers", "blockers"),
                "defects.open_blockers",
                reasons,
            )
        ),
        open_criticals=int(
            _extract_non_neg_number(
                raw,
                ("openCriticals", "open_criticals", "criticals"),
                "defects.open_criticals",
                reasons,
            )
        ),
        qa_escapes=int(
            _extract_non_neg_number(
                raw,
                ("qaEscapes", "qa_escapes", "escapedDefects", "escaped_defects"),
                "defects.qa_escapes",
                reasons,
            )
        ),
    )


def _evaluate_junit_reasons(
    junit: JunitSummary, thresholds: dict[str, float | int], reasons: list[BlockingReason]
) -> None:
    if not junit.provided or junit.total_tests == 0 or junit.executed_tests == 0:
        reasons.append(
            BlockingReason(
                code="ZERO_TESTS_EXECUTED",
                signal="junit",
                metric="junit.executed_tests",
                actual=junit.executed_tests,
                threshold=">= 1",
                message="No se ejecutaron pruebas funcionales en alcance full (ZERO_TESTS_EXECUTED).",
            )
        )
        return
    if junit.failures > 0:
        reasons.append(
            BlockingReason(
                code="JUNIT_FAILURES",
                signal="junit",
                metric="junit.failures",
                actual=junit.failures,
                threshold=0,
                message=f"Se detectaron {junit.failures} prueba(s) JUnit fallida(s).",
            )
        )
    if junit.errors > 0:
        reasons.append(
            BlockingReason(
                code="JUNIT_ERRORS",
                signal="junit",
                metric="junit.errors",
                actual=junit.errors,
                threshold=0,
                message=f"Se detectaron {junit.errors} error(es) de ejecución JUnit.",
            )
        )
    min_rate = float(thresholds["min_pass_rate_pct"])
    if junit.pass_rate_pct < min_rate:
        reasons.append(
            BlockingReason(
                code="PASS_RATE_BELOW_THRESHOLD",
                signal="junit",
                metric="junit.pass_rate_pct",
                actual=junit.pass_rate_pct,
                threshold=min_rate,
                message=f"Tasa de éxito JUnit ({junit.pass_rate_pct}%) inferior al mínimo ({min_rate}%).",
            )
        )


def _check_max(
    reasons: list[BlockingReason],
    signal: str,
    code: str,
    metric: str,
    actual: float,
    threshold: float,
    unit: str,
) -> None:
    if actual > threshold:
        reasons.append(
            BlockingReason(
                code=code,
                signal=signal,
                metric=metric,
                actual=actual,
                threshold=threshold,
                message=f"{metric}={actual}{unit} excede el máximo permitido ({threshold}{unit}).",
            )
        )


def _evaluate_telemetry_and_defects(
    telemetry: TelemetrySummary,
    defects: DefectsSummary,
    thresholds: dict[str, float | int],
    reasons: list[BlockingReason],
) -> None:
    _check_max(
        reasons,
        "telemetry",
        "ERROR_RATE_EXCEEDED",
        "telemetry.error_rate_pct",
        telemetry.error_rate_pct,
        thresholds["max_error_rate_pct"],
        "%",
    )
    _check_max(
        reasons,
        "telemetry",
        "LATENCY_P95_EXCEEDED",
        "telemetry.p95_ms",
        telemetry.p95_ms,
        thresholds["max_p95_ms"],
        "ms",
    )
    _check_max(
        reasons,
        "telemetry",
        "LATENCY_P99_EXCEEDED",
        "telemetry.p99_ms",
        telemetry.p99_ms,
        thresholds["max_p99_ms"],
        "ms",
    )
    _check_max(
        reasons,
        "telemetry",
        "ACTIVE_INCIDENTS_EXCEEDED",
        "telemetry.active_incidents",
        telemetry.active_incidents,
        thresholds["max_active_incidents"],
        "",
    )
    _check_max(
        reasons,
        "defects",
        "OPEN_BLOCKERS_EXCEEDED",
        "defects.open_blockers",
        defects.open_blockers,
        thresholds["max_open_blockers"],
        "",
    )
    _check_max(
        reasons,
        "defects",
        "OPEN_CRITICALS_EXCEEDED",
        "defects.open_criticals",
        defects.open_criticals,
        thresholds["max_open_criticals"],
        "",
    )
    _check_max(
        reasons,
        "defects",
        "QA_ESCAPES_EXCEEDED",
        "defects.qa_escapes",
        defects.qa_escapes,
        thresholds["max_qa_escapes"],
        "",
    )


def _format_failure_summary(
    scope: str,
    dry_run: bool,
    utc_ts: str,
    junit: JunitSummary,
    reasons: list[BlockingReason],
) -> str:
    mode = "DRY-RUN" if dry_run else "ENFORCE"
    lines = [
        f"❌ [RELEASE-GATE] NO_GO (scope={scope}, mode={mode}, utc={utc_ts}, hallazgos={len(reasons)})"
    ]
    for idx, reason in enumerate(reasons, 1):
        lines.append(
            f"  {idx}. [{reason.code}] {reason.metric}={reason.actual} "
            f"(umbral: {reason.threshold}) — {reason.message}"
        )
    if junit.failed_tests:
        lines.append(f"  🧪 Tests fallidos: {', '.join(junit.failed_tests)}")
    return "\n".join(lines)


def _render_markdown(report: dict[str, Any]) -> str:
    junit = report["junit"]
    telemetry = report["telemetry"]
    defects = report["defects"]
    lines = [
        "# 🛡️ Release Readiness Gate Report",
        "",
        f"- **Decisión:** `{report['decision']}`",
        f"- **Alcance:** `{report['scope']}` (`dry_run={report['dry_run']}`, `gate_skipped={report['gate_skipped']}`)",
        f"- **Evaluado (UTC):** `{report['evaluated_at_utc']}`",
        "",
        "## Señales Evaluadas",
        "",
        f"- **JUnit:** {junit['executed_tests']}/{junit['total_tests']} ejecutados, {junit['pass_rate_pct']}% éxito, failures={junit['failures']}, errors={junit['errors']}",
        f"- **Telemetría:** error_rate={telemetry['error_rate_pct']}%, p95={telemetry['p95_ms']}ms, p99={telemetry['p99_ms']}ms, active_incidents={telemetry['active_incidents']}",
        f"- **Defectos:** blockers={defects['open_blockers']}, criticals={defects['open_criticals']}, qa_escapes={defects['qa_escapes']}",
        "",
    ]
    reasons = report["blocking_reasons"]
    if reasons:
        lines.append("## Hallazgos Bloqueantes")
        lines.append("")
        for reason in reasons:
            lines.append(
                f"- **[{reason['code']}]** `{reason['metric']}` = `{reason['actual']}` (umbral: `{reason['threshold']}`) — {reason['message']}"
            )
    else:
        lines.append("## Hallazgos Bloqueantes\n\nSin bloqueos detectados.")
    return "\n".join(lines) + "\n"


def evaluate_release_gate(
    *,
    workspace_root: Path,
    junit_xml: str | None = None,
    telemetry_json: str | None = None,
    defects_json: str | None = None,
    scope: str = SCOPE_FULL,
    dry_run: bool = True,
    thresholds: dict[str, float | int] | None = None,
    timestamp: str | None = None,
) -> tuple[int, dict[str, Any]]:
    """Evalúa las 3 señales y retorna (exit_code, reporte_dict)."""
    merged_thresholds = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    sec_reasons: list[BlockingReason] = []

    if scope not in (SCOPE_FULL, SCOPE_SMOKE):
        sec_reasons.append(
            _security_reason(
                "INVALID_INPUT",
                "scope",
                scope,
                f"Alcance inválido '{scope}'; permitidos: full, smoke.",
            )
        )

    utc_ts = _normalize_utc_timestamp(timestamp, sec_reasons)
    junit = _load_junit_from_path(workspace_root, junit_xml, sec_reasons)
    telemetry_raw = _load_json_dict(workspace_root, telemetry_json, sec_reasons)
    defects_raw = _load_json_dict(workspace_root, defects_json, sec_reasons)
    telemetry = _normalize_telemetry(telemetry_raw, sec_reasons)
    defects = _normalize_defects(defects_raw, sec_reasons)

    if sec_reasons:
        summary = _format_failure_summary(scope, dry_run, utc_ts, junit, sec_reasons)
        return 1, _build_report(
            DECISION_NO_GO,
            scope,
            dry_run,
            False,
            True,
            utc_ts,
            junit,
            telemetry,
            defects,
            merged_thresholds,
            sec_reasons,
            summary,
        )

    if scope == SCOPE_SMOKE:
        summary = (
            f"⏭️ [RELEASE-GATE] SKIPPED (scope=smoke, dry_run={dry_run}, utc={utc_ts}) "
            "— compuerta omitida por alcance smoke."
        )
        return 0, _build_report(
            DECISION_SKIPPED,
            scope,
            dry_run,
            True,
            False,
            utc_ts,
            junit,
            telemetry,
            defects,
            merged_thresholds,
            [],
            summary,
        )

    gate_reasons: list[BlockingReason] = []
    _evaluate_junit_reasons(junit, merged_thresholds, gate_reasons)
    _evaluate_telemetry_and_defects(telemetry, defects, merged_thresholds, gate_reasons)

    if not gate_reasons:
        summary = (
            f"✅ [RELEASE-GATE] GO (scope=full, dry_run={dry_run}, "
            f"tests={junit.executed_tests}/{junit.total_tests} {junit.pass_rate_pct}%, "
            f"p95={telemetry.p95_ms}ms, err={telemetry.error_rate_pct}%, utc={utc_ts})"
        )
        return 0, _build_report(
            DECISION_GO,
            scope,
            dry_run,
            False,
            False,
            utc_ts,
            junit,
            telemetry,
            defects,
            merged_thresholds,
            [],
            summary,
        )

    summary = _format_failure_summary(scope, dry_run, utc_ts, junit, gate_reasons)
    exit_code = 0 if dry_run else 1
    return exit_code, _build_report(
        DECISION_NO_GO,
        scope,
        dry_run,
        False,
        False,
        utc_ts,
        junit,
        telemetry,
        defects,
        merged_thresholds,
        gate_reasons,
        summary,
    )


def _build_report(
    decision: str,
    scope: str,
    dry_run: bool,
    gate_skipped: bool,
    has_security_or_parse_error: bool,
    evaluated_at_utc: str,
    junit: JunitSummary,
    telemetry: TelemetrySummary,
    defects: DefectsSummary,
    thresholds: dict[str, float | int],
    blocking_reasons: list[BlockingReason],
    summary: str,
) -> dict[str, Any]:
    return {
        "decision": decision,
        "scope": scope,
        "dry_run": dry_run,
        "gate_skipped": gate_skipped,
        "has_security_or_parse_error": has_security_or_parse_error,
        "evaluated_at_utc": evaluated_at_utc,
        "junit": asdict(junit),
        "telemetry": asdict(telemetry),
        "defects": asdict(defects),
        "thresholds": thresholds,
        "blocking_reasons": [asdict(r) for r in blocking_reasons],
        "summary": summary,
    }


def _write_artifacts(
    workspace_root: Path,
    output_json: str | None,
    output_md: str | None,
    report: dict[str, Any],
) -> list[BlockingReason]:
    errors: list[BlockingReason] = []
    if output_json is not None:
        safe_json = _resolve_contained_path(
            workspace_root, output_json, errors, must_exist=False
        )
        if safe_json is not None:
            safe_json.parent.mkdir(parents=True, exist_ok=True)
            safe_json.write_text(
                json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
    if output_md is not None:
        safe_md = _resolve_contained_path(
            workspace_root, output_md, errors, must_exist=False
        )
        if safe_md is not None:
            safe_md.parent.mkdir(parents=True, exist_ok=True)
            safe_md.write_text(_render_markdown(report), encoding="utf-8")
    return errors


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analiza argumentos CLI no interactivos (QA-CLI-TTY-01)."""
    parser = argparse.ArgumentParser(
        description="Compuerta multi-señal Release Readiness Gate (GO/NO_GO/SKIPPED)."
    )
    parser.add_argument("--workspace-root", type=str, default=None)
    parser.add_argument("--junit-xml", type=str, default=None)
    parser.add_argument("--telemetry-json", type=str, default=None)
    parser.add_argument("--defects-json", type=str, default=None)
    parser.add_argument(
        "--scope", choices=(SCOPE_FULL, SCOPE_SMOKE), default=SCOPE_FULL
    )
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--enforce", action="store_true", default=False)
    parser.add_argument(
        "--min-pass-rate", type=float, default=float(DEFAULT_THRESHOLDS["min_pass_rate_pct"])
    )
    parser.add_argument(
        "--max-error-rate", type=float, default=float(DEFAULT_THRESHOLDS["max_error_rate_pct"])
    )
    parser.add_argument(
        "--max-p95-ms", type=float, default=float(DEFAULT_THRESHOLDS["max_p95_ms"])
    )
    parser.add_argument(
        "--max-p99-ms", type=float, default=float(DEFAULT_THRESHOLDS["max_p99_ms"])
    )
    parser.add_argument(
        "--max-active-incidents",
        type=int,
        default=int(DEFAULT_THRESHOLDS["max_active_incidents"]),
    )
    parser.add_argument(
        "--max-blockers", type=int, default=int(DEFAULT_THRESHOLDS["max_open_blockers"])
    )
    parser.add_argument(
        "--max-criticals",
        "--max-criticaIs",
        dest="max_criticals",
        type=int,
        default=int(DEFAULT_THRESHOLDS["max_open_criticals"]),
    )
    parser.add_argument(
        "--max-escapes", type=int, default=int(DEFAULT_THRESHOLDS["max_qa_escapes"])
    )
    parser.add_argument("--timestamp", type=str, default=None)
    parser.add_argument("--output-json", type=str, default=None)
    parser.add_argument("--output-md", type=str, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI no interactivo."""
    args = parse_args(argv)
    workspace_root = (
        Path(args.workspace_root).resolve() if args.workspace_root else Path.cwd().resolve()
    )
    dry_run = not bool(args.enforce)
    thresholds: dict[str, float | int] = {
        "min_pass_rate_pct": args.min_pass_rate,
        "max_error_rate_pct": args.max_error_rate,
        "max_p95_ms": args.max_p95_ms,
        "max_p99_ms": args.max_p99_ms,
        "max_active_incidents": args.max_active_incidents,
        "max_open_blockers": args.max_blockers,
        "max_open_criticals": args.max_criticals,
        "max_qa_escapes": args.max_escapes,
    }
    rc, report = evaluate_release_gate(
        workspace_root=workspace_root,
        junit_xml=args.junit_xml,
        telemetry_json=args.telemetry_json,
        defects_json=args.defects_json,
        scope=args.scope,
        dry_run=dry_run,
        thresholds=thresholds,
        timestamp=args.timestamp,
    )
    artifact_errors = _write_artifacts(
        workspace_root, args.output_json, args.output_md, report
    )
    if artifact_errors:
        for err in artifact_errors:
            print(f"❌ [RELEASE-GATE] [{err.code}] {err.message}", file=sys.stderr)
        return 1

    stream = sys.stdout if rc == 0 else sys.stderr
    print(report["summary"], file=stream)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
