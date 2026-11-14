# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Conversor programático y CLI de trazas fallidas a golden tests DeepEval/Promptfoo."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

import yaml  # type: ignore[import-untyped]
from deepeval.dataset import EvaluationDataset, Golden
from pydantic import BaseModel, ConfigDict, Field

OutputFormat = Literal["json", "yaml"]

_REDACTION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED_SECRET]\2"),
    (
        re.compile(r"\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*", re.IGNORECASE),
        r"\1 [REDACTED_SECRET]",
    ),
    (
        re.compile(
            r"(?:sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{16,}|"
            r"ghp_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})"
        ),
        "[REDACTED_SECRET]",
    ),
    (
        re.compile(
            r"(?i)\b(api_key|apikey|secret|password|passwd|token)\s*([=:])\s*"
            r"['\"]?[^\s'\",;]+['\"]?"
        ),
        r"\1\2[REDACTED_SECRET]",
    ),
    (
        re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
        "[REDACTED_PII]",
    ),
)


class NormalizedTraceFailure(BaseModel):
    """Representación sanitizada y deduplicada de una traza fallida."""

    model_config = ConfigDict(extra="forbid")
    input_sha256: str = Field(min_length=64, max_length=64)
    domain: str = "qa-11x"
    input: str = Field(min_length=1)
    actual_output: str = ""
    expected_output: str = ""
    retrieval_context: tuple[str, ...] = ()


def sanitize_trace_text(text: str) -> str:
    """Redacta secretos, credenciales en URI y PII antes de exportar casos golden."""
    cleaned = text
    for pattern, replacement in _REDACTION_PATTERNS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def resolve_safe_path(
    raw_path: str | Path,
    allowed_roots: Sequence[Path] | None = None,
) -> Path:
    """Valida contención estricta de rutas bloqueando Path Traversal ('..')."""
    candidate = Path(raw_path)
    if ".." in candidate.parts:
        raise ValueError(f"Path traversal detectado: '..' no permitido en {raw_path}")
    roots = (
        tuple(allowed_roots)
        if allowed_roots is not None
        else (Path.cwd(), Path("/tmp"))
    )
    resolved = candidate.resolve()
    if not any(resolved.is_relative_to(root.resolve()) for root in roots):
        raise ValueError(f"Ruta fuera de directorios permitidos: {resolved}")
    return resolved


def normalize_input_hash(raw_input: str) -> str:
    """Calcula SHA-256 determinista sobre el input normalizado para deduplicación."""
    normalized = " ".join(raw_input.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def is_failed_or_degraded_trace(
    record: Mapping[str, Any],
    default_threshold: float = 0.90,
) -> bool:
    """Determina si una traza representa fallo funcional o degradación de umbral."""
    if record.get("passed") is False:
        return True
    status = str(record.get("status", "")).strip().lower()
    if status in {"failed", "error"}:
        return True
    score = record.get("score")
    if isinstance(score, int | float) and not isinstance(score, bool):
        threshold = float(record.get("threshold", default_threshold))
        return float(score) < threshold
    return False


def _first_non_empty(candidates: Sequence[Any], fallback: str = "") -> str:
    for item in candidates:
        if isinstance(item, str) and item.strip():
            return item.strip()
    return fallback


def _extract_context_list(record: Mapping[str, Any]) -> tuple[str, ...]:
    raw_ctx = record.get("retrieval_context") or record.get("context") or []
    if isinstance(raw_ctx, str):
        return (sanitize_trace_text(raw_ctx),)
    if isinstance(raw_ctx, Sequence):
        return tuple(
            sanitize_trace_text(str(item))
            for item in raw_ctx
            if str(item).strip()
        )
    return ()


def _extract_trace_fields(record: Mapping[str, Any]) -> NormalizedTraceFailure:
    details = record.get("statusDetails")
    details_map: Mapping[str, Any] = details if isinstance(details, Mapping) else {}
    raw_input = _first_non_empty(
        (
            record.get("input"),
            record.get("prompt"),
            record.get("command"),
            record.get("name"),
        ),
        fallback="trace-without-input",
    )
    sanitized_input = sanitize_trace_text(raw_input)
    actual_raw = _first_non_empty(
        (
            record.get("actual_output"),
            record.get("output"),
            details_map.get("trace"),
            details_map.get("message"),
        )
    )
    expected_raw = _first_non_empty(
        (record.get("expected_output"), record.get("remediation")),
        fallback="Cumplir contrato determinista QA-11X sin regresiones ni fugas.",
    )
    return NormalizedTraceFailure(
        input_sha256=normalize_input_hash(sanitized_input),
        domain=str(record.get("domain") or record.get("gate") or "qa-11x"),
        input=sanitized_input,
        actual_output=sanitize_trace_text(actual_raw),
        expected_output=sanitize_trace_text(expected_raw),
        retrieval_context=_extract_context_list(record),
    )


def load_raw_traces(input_path: Path) -> list[dict[str, Any]]:
    """Carga trazas desde archivo JSON o JSONL validando estructura."""
    raw_text = input_path.read_text(encoding="utf-8")
    if input_path.suffix.lower() == ".jsonl":
        return [
            dict(json.loads(line))
            for line in raw_text.splitlines()
            if line.strip()
        ]
    parsed = json.loads(raw_text)
    if isinstance(parsed, list):
        return [dict(item) for item in parsed if isinstance(item, Mapping)]
    if isinstance(parsed, Mapping):
        nested = parsed.get("traces") or parsed.get("results")
        if isinstance(nested, list):
            return [dict(item) for item in nested if isinstance(item, Mapping)]
        return [dict(parsed)]
    raise ValueError(f"Formato JSON de trazas no soportado en {input_path}")


def build_deepeval_dataset(
    records: Sequence[Mapping[str, Any]],
    default_threshold: float = 0.90,
) -> EvaluationDataset:
    """Filtra trazas fallidas, deduplica por SHA-256 y crea EvaluationDataset."""
    seen_hashes: set[str] = set()
    goldens: list[Golden] = []
    for record in records:
        if not is_failed_or_degraded_trace(record, default_threshold=default_threshold):
            continue
        item = _extract_trace_fields(record)
        if item.input_sha256 in seen_hashes:
            continue
        seen_hashes.add(item.input_sha256)
        ctx_list = list(item.retrieval_context)
        goldens.append(
            Golden(
                input=item.input,
                actual_output=item.actual_output or None,
                expected_output=item.expected_output,
                context=ctx_list or None,
                retrieval_context=ctx_list or None,  # type: ignore[arg-type]
                multimodal=False,
                additional_metadata={
                    "input_sha256": item.input_sha256,
                    "domain": item.domain,
                },
            )
        )
    return EvaluationDataset(goldens=goldens)


def _iter_goldens(dataset: EvaluationDataset) -> list[Golden]:
    return [g for g in dataset.goldens if isinstance(g, Golden)]


def serialize_goldens_json(dataset: EvaluationDataset) -> str:
    """Serializa el EvaluationDataset a JSON determinista sin secretos."""
    payload = [
        {
            "input": g.input,
            "actual_output": g.actual_output,
            "expected_output": g.expected_output,
            "retrieval_context": g.retrieval_context or [],
            "additional_metadata": g.additional_metadata or {},
        }
        for g in _iter_goldens(dataset)
    ]
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def serialize_promptfoo_yaml(dataset: EvaluationDataset) -> str:
    """Serializa los casos golden en estructura YAML compatible con Promptfoo."""
    tests: list[dict[str, Any]] = []
    for g in _iter_goldens(dataset):
        meta = g.additional_metadata or {}
        tests.append(
            {
                "description": (
                    f"regresion-{meta.get('domain', 'qa-11x')}-"
                    f"{str(meta.get('input_sha256', ''))[:8]}"
                ),
                "vars": {
                    "prompt": g.input,
                    "context": g.retrieval_context or [],
                    "expected_output": g.expected_output or "",
                },
                "assert": [
                    {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"},
                    {
                        "type": "llm-rubric",
                        "value": g.expected_output or "Cumplir contrato QA-11X.",
                    },
                ],
            }
        )
    doc = {"description": "QA-11X Golden Regression Tests", "tests": tests}
    return str(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True))


def export_golden_dataset(
    input_path: str | Path,
    output_path: str | Path | None = None,
    output_format: OutputFormat = "json",
    default_threshold: float = 0.90,
    dry_run: bool = False,
    allowed_roots: Sequence[Path] | None = None,
) -> str:
    """Ejecuta el flujo completo lectura -> filtrado -> redacción -> exportación."""
    safe_input = resolve_safe_path(input_path, allowed_roots=allowed_roots)
    records = load_raw_traces(safe_input)
    dataset = build_deepeval_dataset(records, default_threshold=default_threshold)
    rendered = (
        serialize_promptfoo_yaml(dataset)
        if output_format == "yaml"
        else serialize_goldens_json(dataset)
    )
    if dry_run:
        return rendered
    if output_path is None:
        raise ValueError("Se requiere output_path cuando dry_run=False")
    safe_output = resolve_safe_path(output_path, allowed_roots=allowed_roots)
    safe_output.parent.mkdir(parents=True, exist_ok=True)
    safe_output.write_text(rendered, encoding="utf-8")
    return rendered


def build_cli_parser() -> argparse.ArgumentParser:
    """Construye el parser CLI no interactivo compatible con QA-CLI-TTY-01."""
    parser = argparse.ArgumentParser(
        description="Convierte trazas fallidas en golden tests DeepEval / Promptfoo."
    )
    parser.add_argument("--input", required=True, help="Ruta a archivo JSON o JSONL.")
    parser.add_argument("--output", default=None, help="Ruta destino para exportar.")
    parser.add_argument(
        "--format",
        choices=("json", "yaml"),
        default="json",
        dest="output_format",
        help="Formato de exportación.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.90,
        help="Umbral mínimo de score para filtrar trazas degradadas.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime el dataset generado sin escribir en disco.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI sin bloqueo de terminal (stdin nunca leído)."""
    args = build_cli_parser().parse_args(list(argv) if argv is not None else None)
    rendered = export_golden_dataset(
        input_path=args.input,
        output_path=args.output,
        output_format=args.output_format,
        default_threshold=args.threshold,
        dry_run=bool(args.dry_run),
    )
    print(rendered, end="")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
