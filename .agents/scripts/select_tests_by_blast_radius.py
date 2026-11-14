#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Selector determinista Zero-LLM de suites QA por radio de impacto AST (Graphify)."""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

CRITICAL_EXACT: frozenset[str] = frozenset(
    {
        ".trivy.yaml",
        "Makefile",
        "commitlint.config.js",
        "docker-compose.qa.yml",
        "docker-compose.yml",
        "lefthook.yml",
    }
)
CRITICAL_PREFIXES: tuple[str, ...] = (
    ".agents/rules/",
    ".agents/skills/",
    ".github/workflows/",
    "architecture/",
    "docker/",
    "mcp-server/src/security/",
)
SELF_STRUCTURAL_RELATIONS: frozenset[str] = frozenset(
    {"contains", "defines", "rationale_for"}
)
PRIMARY_SUITES: tuple[str, ...] = (
    "run_frontend",
    "run_backend",
    "run_mcp",
    "run_ai_offline",
    "run_meta_qa",
)
OUTPUT_KEYS: tuple[str, ...] = (
    "tier",
    "run_frontend",
    "run_backend",
    "run_mcp",
    "run_ai_offline",
    "run_meta_qa",
    "validate_calm",
    "run_full_regression",
    "estimated_savings_pct",
)


def _norm_path(raw: str) -> str:
    cleaned = raw.strip().replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned


def _read_files_source(files_path: str | None) -> str:
    if files_path == "-":
        return "" if sys.stdin.isatty() else sys.stdin.read()
    if files_path:
        path_obj = Path(files_path)
        return path_obj.read_text(encoding="utf-8") if path_obj.is_file() else ""
    return ""


def _dedupe_normalized(tokens: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for token in tokens:
        norm = _norm_path(token)
        if norm and norm not in seen:
            seen.add(norm)
            ordered.append(norm)
    return ordered


def parse_changed_files(
    raw_csv: str, files_path: str | None = None
) -> list[str]:
    """Parsea rutas modificadas desde CSV o archivo sin bloquear TTY."""
    joined = "\n".join(filter(None, (raw_csv, _read_files_source(files_path))))
    return _dedupe_normalized(joined.replace(",", "\n").splitlines())


def is_doc_file(rel_posix: str) -> bool:
    """Determina si una ruta corresponde exclusivamente a documentación o licencia."""
    name = Path(rel_posix).name
    return (
        rel_posix.endswith(".md")
        or rel_posix.startswith("docs/")
        or name in {"COPYING", "LICENSE", "NOTICE"}
    )


def is_critical_file(rel_posix: str) -> bool:
    """Determina si el archivo exige regresión completa por impacto transversal."""
    path_obj = Path(rel_posix)
    is_compose = path_obj.name.startswith("docker-compose") and path_obj.suffix in {
        ".yaml",
        ".yml",
    }
    return (
        rel_posix in CRITICAL_EXACT
        or is_compose
        or rel_posix.startswith(CRITICAL_PREFIXES)
    )


def load_ast_graph(graph_path: Path) -> dict[str, Any] | None:
    """Carga graphify-out/graph.json de forma tolerante a ausencia o corrupción."""
    if not graph_path.is_file():
        return None
    try:
        data = json.loads(graph_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _index_node_files(graph: dict[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for node in graph.get("nodes", []):
        if isinstance(node, dict) and isinstance(node.get("id"), str):
            mapping[node["id"]] = _norm_path(str(node.get("source_file") or ""))
    return mapping


def _is_self_structural(
    link: dict[str, Any], node_files: dict[str, str]
) -> bool:
    relation = str(link.get("relation") or "")
    if relation not in SELF_STRUCTURAL_RELATIONS:
        return False
    src_id = str(link.get("source") or "")
    tgt_id = str(link.get("target") or "")
    src_file = _norm_path(str(link.get("source_file") or node_files.get(src_id, "")))
    tgt_file = node_files.get(tgt_id, "")
    return bool(src_file and src_file == tgt_file)


def _build_reverse_index(
    graph: dict[str, Any], node_files: dict[str, str]
) -> dict[str, list[tuple[str, str]]]:
    reverse: dict[str, list[tuple[str, str]]] = {}
    for link in graph.get("links", []):
        if not isinstance(link, dict) or _is_self_structural(link, node_files):
            continue
        src_id = str(link.get("source") or "")
        tgt_id = str(link.get("target") or "")
        if not src_id or not tgt_id:
            continue
        src_file = _norm_path(
            str(link.get("source_file") or node_files.get(src_id, ""))
        )
        reverse.setdefault(tgt_id, []).append((src_id, src_file))
    return reverse


def _bfs_reverse_callers(
    seeds: set[str], reverse: dict[str, list[tuple[str, str]]]
) -> tuple[set[str], set[str]]:
    visited = set(seeds)
    queue: deque[str] = deque(seeds)
    callers: set[str] = set()
    impacted_files: set[str] = set()
    while queue:
        current = queue.popleft()
        for caller_id, caller_file in reverse.get(current, ()):
            callers.add(caller_id)
            if caller_file:
                impacted_files.add(caller_file)
            if caller_id not in visited:
                visited.add(caller_id)
                queue.append(caller_id)
    return callers, impacted_files


def compute_blast_impact(
    changed_files: Sequence[str], graph: dict[str, Any] | None
) -> tuple[set[str], int, bool]:
    """Propaga llamadores entrantes desde graph.json o cae a prefijos locales."""
    changed_set = set(changed_files)
    if graph is None:
        return changed_set, 0, False
    node_files = _index_node_files(graph)
    seeds = {nid for nid, sfile in node_files.items() if sfile in changed_set}
    if not seeds:
        return changed_set, 0, True
    reverse = _build_reverse_index(graph, node_files)
    callers, impacted = _bfs_reverse_callers(seeds, reverse)
    return changed_set | impacted, len(callers), True


def _matches_any_prefix(files: set[str], prefixes: tuple[str, ...]) -> bool:
    return any(item.startswith(prefixes) for item in files)


def classify_suites(union_files: set[str]) -> dict[str, bool]:
    """Asigna suites QA afectadas según archivos modificados y propagados."""
    run_frontend = _matches_any_prefix(
        union_files, ("vue3/", "react-frontend/", "frontend/")
    ) or any(Path(f).name == "lint_test_antipatterns.py" for f in union_files)
    run_backend = _matches_any_prefix(
        union_files,
        ("fastapi/", "python/", "node-backend/", "php/", "bash-scripts/", "backend/"),
    )
    run_mcp = _matches_any_prefix(union_files, ("mcp-server/",)) or (
        "manifest.json" in union_files
    )
    run_ai_offline = _matches_any_prefix(union_files, ("ai-evals/", "tests/evals/"))
    run_meta_qa = (
        _matches_any_prefix(union_files, (".agents/scripts/", "scripts/"))
        or any(
            f.startswith("tests/") and not f.startswith("tests/evals/")
            for f in union_files
        )
        or ("manifest.json" in union_files)
    )
    suites = {
        "run_frontend": run_frontend,
        "run_backend": run_backend,
        "run_mcp": run_mcp,
        "run_ai_offline": run_ai_offline,
        "run_meta_qa": run_meta_qa,
        "validate_calm": _matches_any_prefix(
            union_files, ("mcp-server/", "architecture/")
        ),
    }
    if not any(suites[key] for key in PRIMARY_SUITES):
        suites["run_meta_qa"] = True
    return suites


def _build_plan_payload(
    *,
    tier: str,
    suites: dict[str, bool],
    run_full_regression: bool,
    savings: int,
    caller_count: int,
    graph_loaded: bool,
    changed_files: Sequence[str],
    impacted_files: Sequence[str],
) -> dict[str, Any]:
    return {
        "tier": tier,
        **suites,
        "run_full_regression": run_full_regression,
        "estimated_savings_pct": savings,
        "caller_count": caller_count,
        "graph_loaded": graph_loaded,
        "changed_files": list(changed_files),
        "impacted_files": sorted(impacted_files),
    }


def _all_suites(enabled: bool) -> dict[str, bool]:
    return {
        "run_frontend": enabled,
        "run_backend": enabled,
        "run_mcp": enabled,
        "run_ai_offline": enabled,
        "run_meta_qa": enabled,
        "validate_calm": enabled,
    }


def select_test_plan(
    *,
    event: str,
    changed_files: Sequence[str],
    graph_path: Path,
    high_blast_threshold: int = 15,
) -> dict[str, Any]:
    """Calcula el plan escalonado QA-11X desde el evento CI y el grafo AST."""
    norm_changed = _dedupe_normalized(changed_files)
    if event in {"schedule", "workflow_dispatch"}:
        return _build_plan_payload(
            tier="nightly-full",
            suites=_all_suites(True),
            run_full_regression=True,
            savings=0,
            caller_count=0,
            graph_loaded=graph_path.is_file(),
            changed_files=norm_changed,
            impacted_files=norm_changed,
        )
    if norm_changed and all(is_doc_file(item) for item in norm_changed):
        return _build_plan_payload(
            tier="docs-only",
            suites=_all_suites(False),
            run_full_regression=False,
            savings=85,
            caller_count=0,
            graph_loaded=graph_path.is_file(),
            changed_files=norm_changed,
            impacted_files=norm_changed,
        )
    graph = load_ast_graph(graph_path)
    union_files, caller_count, graph_loaded = compute_blast_impact(norm_changed, graph)
    has_critical = any(is_critical_file(item) for item in norm_changed)
    if not norm_changed or has_critical or caller_count > high_blast_threshold:
        return _build_plan_payload(
            tier="full-regression",
            suites=_all_suites(True),
            run_full_regression=True,
            savings=0,
            caller_count=caller_count,
            graph_loaded=graph_loaded,
            changed_files=norm_changed,
            impacted_files=sorted(union_files),
        )
    suites = classify_suites(union_files)
    active_count = sum(1 for key in PRIMARY_SUITES if suites[key])
    savings = min(60, max(40, 40 + (5 - active_count) * 5))
    return _build_plan_payload(
        tier="pr-targeted",
        suites=suites,
        run_full_regression=False,
        savings=savings,
        caller_count=caller_count,
        graph_loaded=graph_loaded,
        changed_files=norm_changed,
        impacted_files=sorted(union_files),
    )


def _format_output_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def write_github_outputs(plan: dict[str, Any], output_path: Path) -> None:
    """Persiste claves tier/booleanas en formato GITHUB_OUTPUT."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{key}={_format_output_value(plan[key])}" for key in OUTPUT_KEYS]
    with output_path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Selector determinista de suites por radio de impacto AST."
    )
    parser.add_argument(
        "--event",
        default="pull_request",
        choices=["pull_request", "push", "schedule", "workflow_dispatch"],
        help="Evento CI desencadenante.",
    )
    parser.add_argument(
        "--changed-files",
        default="",
        help="Lista CSV o multilínea de rutas relativas modificadas.",
    )
    parser.add_argument(
        "--changed-files-file",
        default=None,
        help="Ruta a archivo con rutas modificadas ('-' lee stdin si no es TTY).",
    )
    parser.add_argument(
        "--graph",
        default="graphify-out/graph.json",
        help="Ruta al grafo AST Graphify (por defecto: graphify-out/graph.json).",
    )
    parser.add_argument(
        "--high-blast-threshold",
        type=int,
        default=15,
        help="Umbral de llamadores para escalar a regresión completa (default: 15).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emite el plan estructurado en formato JSON.",
    )
    parser.add_argument(
        "--github-output",
        default=None,
        help="Archivo destino GITHUB_OUTPUT para exportar banderas del plan.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI con salida Pass-Quiet o JSON estructurado."""
    args = _build_parser().parse_args(argv)
    changed = parse_changed_files(args.changed_files, args.changed_files_file)
    plan = select_test_plan(
        event=args.event,
        changed_files=changed,
        graph_path=Path(args.graph),
        high_blast_threshold=args.high_blast_threshold,
    )
    if args.github_output:
        write_github_outputs(plan, Path(args.github_output))
    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
    else:
        active = [key.removeprefix("run_") for key in PRIMARY_SUITES if plan[key]]
        print(
            f"✅ [blast-selector] tier={plan['tier']} "
            f"callers={plan['caller_count']} "
            f"savings={plan['estimated_savings_pct']}% "
            f"suites=[{','.join(active)}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
