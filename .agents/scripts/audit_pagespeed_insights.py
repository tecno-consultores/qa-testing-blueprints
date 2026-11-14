#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Auditoría Post-Deploy Google PageSpeed Insights v5 (Lab, CrUX y Anti-SSRF SEC-03)."""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PSI_API_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
CATEGORIES: tuple[str, ...] = ("performance", "accessibility", "best-practices", "seo")
CRUX_METRIC_KEYS: tuple[str, ...] = (
    "LARGEST_CONTENTFUL_PAINT_MS",
    "INTERACTION_TO_NEXT_PAINT",
    "CUMULATIVE_LAYOUT_SHIFT_SCORE",
    "FIRST_CONTENTFUL_PAINT_MS",
    "EXPERIMENTAL_TIME_TO_FIRST_BYTE",
)
BLOCKED_HOST_SUFFIXES: tuple[str, ...] = (
    ".local",
    ".internal",
    ".localhost",
    ".arpa",
    ".localdomain",
    ".home",
)
KEY_QUERY_RE = re.compile(r"([?&]key=)[^&\s\"']+")
DNSResolver = Callable[[str], list[str]]
HttpFetcher = Callable[[str, int], tuple[int, str]]


@dataclass(frozen=True)
class ThresholdConfig:
    """Umbrales mínimos [0.0..1.0] para las categorías de Lighthouse."""

    min_performance: float | None
    min_accessibility: float
    min_best_practices: float
    min_seo: float


@dataclass(frozen=True)
class AuditOptions:
    """Parámetros de ejecución para la auditoría de PageSpeed Insights."""

    url: str
    strategy: str = "both"
    api_key: str = ""
    timeout_seconds: int = 60
    require_url: bool = False
    thresholds: ThresholdConfig = ThresholdConfig(None, 0.95, 0.90, 0.90)
    output_path: str = ""
    base_dir: Path = Path(".")


def redact_secrets(text: str, api_key: str = "") -> str:
    """Elimina llaves de API de mensajes o trazas antes de imprimir o persistir."""
    cleaned = KEY_QUERY_RE.sub(r"\1[REDACTED]", text)
    if api_key:
        cleaned = cleaned.replace(api_key, "[REDACTED]")
    return cleaned


def _parse_ip(raw_host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(raw_host)
    except ValueError:
        return None


def _is_unsafe_ip(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
        or not ip_obj.is_global
    )


def _is_blocked_hostname(host: str) -> bool:
    if not host or host == "localhost":
        return True
    if any(host.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        return True
    return _parse_ip(host) is None and "." not in host


def _default_dns_resolver(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return []
    ips: list[str] = []
    for entry in infos:
        sockaddr = entry[4]
        if sockaddr and isinstance(sockaddr[0], str):
            ips.append(sockaddr[0])
    return ips


def _check_resolved_ips(host: str, resolver: DNSResolver) -> str | None:
    for ip_str in resolver(host):
        parsed_ip = _parse_ip(ip_str)
        if parsed_ip is not None and _is_unsafe_ip(parsed_ip):
            return (
                f"BLOCKED_SSRF: el host '{host}' resolvió a IP interna o "
                f"reservada ({ip_str})."
            )
    return None


def _validate_url_scheme_and_auth(parsed: urllib.parse.SplitResult) -> str | None:
    if parsed.scheme.lower() != "https":
        return "BLOCKED_SSRF: solo se permiten URLs públicas con esquema 'https://'."
    if parsed.username is not None or parsed.password is not None:
        return "BLOCKED_SSRF: no se permiten credenciales embebidas en la URL."
    return None


def validate_public_https_url(
    raw_url: str,
    resolver: DNSResolver | None = None,
) -> tuple[bool, str]:
    """Valida que la URL sea HTTPS pública y libre de vectores SSRF (SEC-03)."""
    trimmed = raw_url.strip()
    parsed = urllib.parse.urlsplit(trimmed)
    scheme_err = _validate_url_scheme_and_auth(parsed)
    if scheme_err is not None:
        return False, scheme_err
    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if _is_blocked_hostname(host):
        label = host or "vacío"
        return False, f"BLOCKED_SSRF: host interno o no público rechazado ('{label}')."
    literal_ip = _parse_ip(host)
    if literal_ip is not None and _is_unsafe_ip(literal_ip):
        return (
            False,
            f"BLOCKED_SSRF: dirección IP privada o reservada rechazada ('{host}').",
        )
    dns_err = _check_resolved_ips(host, resolver or _default_dns_resolver)
    if dns_err is not None:
        return False, dns_err
    return True, trimmed


def resolve_safe_output_path(raw_path: str, base_dir: Path) -> Path:
    """Restringe salida al workspace o a una ruta absoluta dentro de /tmp."""
    resolved_base = base_dir.resolve()
    resolved_tmp = Path(tempfile.gettempdir()).resolve()
    candidate = Path(raw_path)
    target = (
        candidate.resolve()
        if candidate.is_absolute()
        else (resolved_base / candidate).resolve()
    )
    in_base = target.is_relative_to(resolved_base)
    in_tmp = target.is_relative_to(resolved_tmp) or target.is_relative_to(Path("/tmp"))
    if not (in_base or (candidate.is_absolute() and in_tmp)):
        raise ValueError(f"Ruta de salida fuera de límites permitidos: {raw_path}")
    return target


def build_psi_request_url(target_url: str, strategy: str, api_key: str) -> str:
    """Construye el endpoint HTTPS de Google PageSpeed Insights API v5."""
    params: list[tuple[str, str]] = [("url", target_url), ("strategy", strategy)]
    for category in CATEGORIES:
        params.append(("category", category))
    if api_key:
        params.append(("key", api_key))
    return f"{PSI_API_ENDPOINT}?{urllib.parse.urlencode(params)}"


def _default_http_fetcher(request_url: str, timeout_seconds: int) -> tuple[int, str]:
    req = urllib.request.Request(request_url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", errors="replace")
            return int(resp.status), body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        return int(exc.code), body


def _extract_lab_scores(payload: dict[str, Any]) -> dict[str, float | None]:
    lh = payload.get("lighthouseResult", {})
    categories = lh.get("categories", {}) if isinstance(lh, dict) else {}
    scores: dict[str, float | None] = {}
    for cat in CATEGORIES:
        entry = categories.get(cat, {}) if isinstance(categories, dict) else {}
        raw = entry.get("score") if isinstance(entry, dict) else None
        scores[cat] = round(float(raw), 4) if isinstance(raw, int | float) else None
    return scores


def _extract_crux_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    loading = payload.get("loadingExperience", {})
    if not isinstance(loading, dict):
        return {"available": False, "overall_category": "NO_CRUX_DATA", "metrics": {}}
    raw_metrics = loading.get("metrics", {})
    if not isinstance(raw_metrics, dict) or not raw_metrics:
        return {"available": False, "overall_category": "NO_CRUX_DATA", "metrics": {}}
    extracted: dict[str, dict[str, Any]] = {}
    for key in CRUX_METRIC_KEYS:
        item = raw_metrics.get(key)
        if isinstance(item, dict):
            extracted[key] = {
                "percentile": item.get("percentile"),
                "category": item.get("category", "UNKNOWN"),
            }
    return {
        "available": bool(extracted),
        "overall_category": str(loading.get("overall_category") or "NO_CRUX_DATA"),
        "metrics": extracted,
    }


def _to_opportunity_item(audit_id: str, audit: dict[str, Any]) -> dict[str, Any] | None:
    score = audit.get("score")
    details = audit.get("details")
    if not isinstance(score, int | float) or score >= 0.9:
        return None
    if not isinstance(details, dict) or details.get("type") != "opportunity":
        return None
    return {
        "id": audit_id,
        "title": str(audit.get("title") or audit_id),
        "score": round(float(score), 4),
        "savings_ms": float(details.get("overallSavingsMs") or 0.0),
        "savings_bytes": float(details.get("overallSavingsBytes") or 0.0),
    }


def _extract_top_opportunities(
    payload: dict[str, Any], limit: int = 5
) -> list[dict[str, Any]]:
    lh = payload.get("lighthouseResult", {})
    audits = lh.get("audits", {}) if isinstance(lh, dict) else {}
    if not isinstance(audits, dict):
        return []
    items: list[dict[str, Any]] = []
    for audit_id, audit_val in audits.items():
        if isinstance(audit_val, dict):
            item = _to_opportunity_item(str(audit_id), audit_val)
            if item is not None:
                items.append(item)
    items.sort(key=lambda x: (x["savings_ms"], x["savings_bytes"]), reverse=True)
    return items[:limit]


def _thresholds_for_strategy(strategy: str, cfg: ThresholdConfig) -> dict[str, float]:
    default_perf = 0.75 if strategy == "mobile" else 0.90
    perf_min = cfg.min_performance if cfg.min_performance is not None else default_perf
    return {
        "performance": perf_min,
        "accessibility": cfg.min_accessibility,
        "best-practices": cfg.min_best_practices,
        "seo": cfg.min_seo,
    }


def _evaluate_threshold_breaches(
    scores: dict[str, float | None],
    limits: dict[str, float],
) -> list[str]:
    breaches: list[str] = []
    for cat, min_val in limits.items():
        val = scores.get(cat)
        if val is None:
            breaches.append(f"{cat}: sin puntaje reportado (mínimo {min_val:.2f})")
        elif val < min_val:
            breaches.append(f"{cat}: {val:.2f} < {min_val:.2f}")
    return breaches


def _build_strategy_error(
    strategy: str, reason: str, status: str = "FAILED"
) -> dict[str, Any]:
    return {
        "strategy": strategy,
        "status": status,
        "reason": reason,
        "lab_scores": {},
        "crux": {"available": False, "overall_category": "NO_CRUX_DATA", "metrics": {}},
        "top_opportunities": [],
        "breaches": [reason],
    }


def _parse_psi_http_response(
    strategy: str, http_status: int, raw_body: str, api_key: str
) -> dict[str, Any]:
    if http_status == 429 and not api_key:
        return _build_strategy_error(
            strategy, "QUOTA_EXCEEDED_NO_API_KEY", status="SKIPPED"
        )
    if http_status < 200 or http_status >= 300:
        safe_body = redact_secrets(raw_body[:240], api_key)
        return _build_strategy_error(
            strategy, f"HTTP {http_status} desde PSI: {safe_body}"
        )
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        return _build_strategy_error(strategy, f"JSON inválido desde PSI: {exc}")
    if not isinstance(payload, dict):
        return _build_strategy_error(
            strategy, "Respuesta PSI no es un objeto JSON válido."
        )
    return payload


def _audit_single_strategy(
    opts: AuditOptions,
    strategy: str,
    fetcher: HttpFetcher,
) -> dict[str, Any]:
    req_url = build_psi_request_url(opts.url, strategy, opts.api_key)
    try:
        http_status, raw_body = fetcher(req_url, opts.timeout_seconds)
    except Exception as exc:
        safe_err = redact_secrets(str(exc), opts.api_key)
        return _build_strategy_error(
            strategy, f"Error de red consultando PSI: {safe_err}"
        )
    parsed = _parse_psi_http_response(strategy, http_status, raw_body, opts.api_key)
    if "lab_scores" in parsed:
        return parsed
    scores = _extract_lab_scores(parsed)
    limits = _thresholds_for_strategy(strategy, opts.thresholds)
    breaches = _evaluate_threshold_breaches(scores, limits)
    return {
        "strategy": strategy,
        "status": "FAILED" if breaches else "PASSED",
        "lab_scores": scores,
        "crux": _extract_crux_metrics(parsed),
        "top_opportunities": _extract_top_opportunities(parsed),
        "breaches": breaches,
    }


def _resolve_strategies(strategy: str) -> tuple[str, ...]:
    if strategy == "both":
        return ("mobile", "desktop")
    if strategy in ("mobile", "desktop"):
        return (strategy,)
    raise ValueError(f"Estrategia inválida '{strategy}'. Use mobile, desktop o both.")


def _aggregate_overall_status(results: list[dict[str, Any]]) -> tuple[str, str]:
    statuses = {str(item.get("status")) for item in results}
    if "FAILED" in statuses:
        return "FAILED", "THRESHOLD_OR_HTTP_FAILURE"
    if statuses == {"SKIPPED"} or "SKIPPED" in statuses:
        return "SKIPPED", "QUOTA_EXCEEDED_NO_API_KEY"
    return "PASSED", "ALL_STRATEGIES_PASSED"


def _persist_report_if_requested(opts: AuditOptions, report: dict[str, Any]) -> None:
    if not opts.output_path:
        return
    dest = resolve_safe_output_path(opts.output_path, opts.base_dir)
    dest.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    dest.write_text(serialized, encoding="utf-8")


def run_pagespeed_audit(
    opts: AuditOptions,
    fetcher: HttpFetcher | None = None,
    resolver: DNSResolver | None = None,
) -> tuple[int, dict[str, Any]]:
    """Ejecuta la auditoría Dual-Mode y retorna (exit_code, reporte_json)."""
    target_url = opts.url.strip()
    if not target_url:
        report: dict[str, Any] = {
            "status": "SKIPPED",
            "reason": "MISSING_TARGET_URL",
            "message": "Sin URL pública configurada. Ejecute: make audit-psi URL=https://tu-dominio.com",
            "strategies": [],
        }
        _persist_report_if_requested(opts, report)
        return (2 if opts.require_url else 0), report

    valid_url, url_or_reason = validate_public_https_url(target_url, resolver=resolver)
    if not valid_url:
        blocked = {
            "status": "BLOCKED_SSRF",
            "reason": "SSRF_POLICY_VIOLATION",
            "message": url_or_reason,
            "strategies": [],
        }
        _persist_report_if_requested(opts, blocked)
        return 1, blocked

    http_fn = fetcher or _default_http_fetcher
    strategies = _resolve_strategies(opts.strategy)
    results = [_audit_single_strategy(opts, strat, http_fn) for strat in strategies]
    overall_status, reason = _aggregate_overall_status(results)
    final_report = {
        "status": overall_status,
        "reason": reason,
        "url": url_or_reason,
        "strategies": results,
    }
    _persist_report_if_requested(opts, final_report)
    exit_code = 1 if overall_status == "FAILED" else 0
    return exit_code, final_report


def _format_strategy_summary(item: dict[str, Any]) -> str:
    scores = item.get("lab_scores", {})
    crux = item.get("crux", {})
    score_txt = ", ".join(f"{k}={scores.get(k)}" for k in CATEGORIES)
    return (
        f"  - [{item.get('strategy')}] status={item.get('status')} | "
        f"{score_txt} | CrUX={crux.get('overall_category', 'NO_CRUX_DATA')}"
    )


def format_human_summary(report: dict[str, Any]) -> str:
    """Formatea un resumen conciso para salida estándar en CI y terminal."""
    lines = [f"[PSI-11X] status={report.get('status')} reason={report.get('reason')}"]
    msg = report.get("message")
    if isinstance(msg, str) and msg:
        lines.append(f"  {msg}")
    for item in report.get("strategies", []):
        if isinstance(item, dict):
            lines.append(_format_strategy_summary(item))
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    """Construye el parser CLI de PageSpeed Insights."""
    parser = argparse.ArgumentParser(
        description=(
            "Auditoría Post-Deploy en Google PageSpeed Insights v5 "
            "(QA 11X Modo Dual)."
        ),
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("PSI_URL", ""),
        help="URL HTTPS pública a auditar.",
    )
    parser.add_argument(
        "--strategy",
        choices=("mobile", "desktop", "both"),
        default="both",
    )
    parser.add_argument(
        "--api-key", default=os.environ.get("PAGESPEED_API_KEY", "")
    )
    parser.add_argument("--min-performance", type=float, default=None)
    parser.add_argument("--min-accessibility", type=float, default=0.95)
    parser.add_argument("--min-best-practices", type=float, default=0.90)
    parser.add_argument("--min-seo", type=float, default=0.90)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--require-url", action="store_true")
    parser.add_argument("--output", default="")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Imprime salida completa en JSON.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI."""
    args = build_arg_parser().parse_args(argv)
    opts = AuditOptions(
        url=str(args.url or ""),
        strategy=str(args.strategy),
        api_key=str(args.api_key or ""),
        timeout_seconds=int(args.timeout),
        require_url=bool(args.require_url),
        thresholds=ThresholdConfig(
            min_performance=args.min_performance,
            min_accessibility=float(args.min_accessibility),
            min_best_practices=float(args.min_best_practices),
            min_seo=float(args.min_seo),
        ),
        output_path=str(args.output or ""),
        base_dir=Path.cwd(),
    )
    code, report = run_pagespeed_audit(opts)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(format_human_summary(report))
    return code


if __name__ == "__main__":
    sys.exit(main())
