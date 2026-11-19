#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""
Script de Inspección Rápida de Radio de Impacto (Blast Radius) mediante Graphify AST.
Permite evaluar matemáticamente antes de refactorizar cuántos y cuáles archivos
o funciones dependen directa o indirectamente de un símbolo o archivo.
Si el grafo AST (graphify-out/graph.json) no existe, instruye su creación inmediata
y ejecuta un escaneo estático de respaldo para garantizar visibilidad cero-ciega.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_SCRIPT_DIR = str(Path(__file__).resolve().parent)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from _budgets import (  # noqa: E402
    HIGH_BLAST_CALLERS_THRESHOLD,
    MICRO_CHANGE_MAX_FILES,
    MODERATE_BLAST_CALLERS_THRESHOLD,
    SECURITY_BLAST_KEYWORDS,
    STRUCTURAL_AST_RELATIONS,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
IGNORED_DIRS: frozenset[str] = frozenset(
    {
        "node_modules",
        ".git",
        ".venv",
        ".trivycache",
        "__pycache__",
        "dist",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        "build",
        "coverage",
        "vendor",
        "target",
    }
)
_IGNORED_DIRS: frozenset[str] = IGNORED_DIRS
FALLBACK_IGNORED_DIRS: frozenset[str] = IGNORED_DIRS | {"graphify-out", "venv"}
SOURCE_EXTENSIONS: frozenset[str] = frozenset(
    {".py", ".ts", ".js", ".vue", ".tsx", ".jsx", ".php", ".sh", ".bats", ".feature"}
)
CONTRACT_EXTENSIONS: frozenset[str] = frozenset({".feature", ".bats"})
SELF_STRUCTURAL_RELATIONS: frozenset[str] = STRUCTURAL_AST_RELATIONS
_CAMEL_BOUNDARY_RE = re.compile(r"([a-z0-9])([A-Z])")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def _norm_rel_path(raw: str) -> str:
    cleaned = raw.strip().replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned


def _stack_prefix(graph_path: Path, workspace_root: Path | None = None) -> str:
    root = workspace_root or REPO_ROOT
    base = (
        graph_path.parent.parent
        if graph_path.parent.name == "graphify-out"
        else graph_path.parent
    )
    try:
        rel = base.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return ""
    return "" if rel in {"", "."} else rel


def _to_repo_rel_path(prefix: str, raw_file: str) -> str:
    cleaned = _norm_rel_path(raw_file)
    if not cleaned or cleaned == "unknown":
        return "unknown"
    if prefix and not cleaned.startswith(f"{prefix}/"):
        return f"{prefix}/{cleaned}"
    return cleaned


def _rel_display_path(path: Path, workspace_root: Path | None = None) -> str:
    root = workspace_root or REPO_ROOT
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def _record_unique_graph(seen: dict[Path, Path], candidate: Path) -> None:
    resolved = candidate.resolve()
    prev = seen.get(resolved)
    if prev is None or (prev.is_symlink() and not candidate.is_symlink()):
        seen[resolved] = candidate


def find_graph_files(workspace: Path | None = None) -> list[Path]:
    """Busca graphify-out/graph.json podando directorios ignorados."""
    root = workspace.resolve() if workspace is not None else REPO_ROOT
    seen: dict[Path, Path] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _IGNORED_DIRS)
        if Path(dirpath).name == "graphify-out" and "graph.json" in filenames:
            _record_unique_graph(seen, Path(dirpath) / "graph.json")
    return sorted(
        seen.values(), key=lambda p: (p.parent.parent != root, p.as_posix())
    )


def load_graph(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise TypeError("graph.json debe contener un objeto JSON raíz.")
    return data


def _node_matches_query(
    node: dict[str, Any], query_lower: str, sym_pattern: re.Pattern[str]
) -> bool:
    label = str(node.get("label") or "").lower()
    node_id = str(node.get("id") or "").lower()
    if query_lower == label or query_lower == node_id:
        return True
    if label and sym_pattern.search(label):
        return True
    source_file = _norm_rel_path(str(node.get("source_file") or "")).lower()
    if not source_file:
        return False
    return (
        source_file == query_lower
        or source_file.endswith(f"/{query_lower}")
        or Path(source_file).name == query_lower
    )


def find_matching_nodes(graph: dict[str, Any], query: str) -> list[dict[str, Any]]:
    """Localiza nodos por símbolo exacto/límite de identificador o ruta normalizada."""
    query_lower = _norm_rel_path(query).lower()
    if not query_lower:
        return []
    sym_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){re.escape(query_lower)}(?![A-Za-z0-9_])"
    )
    return [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict)
        and _node_matches_query(node, query_lower, sym_pattern)
    ]


def _filtered_links(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        link
        for link in graph.get("links", [])
        if isinstance(link, dict)
        and str(link.get("relation") or "calls") not in SELF_STRUCTURAL_RELATIONS
    ]


def _build_caller_entry(
    link: dict[str, Any],
    nodes_by_id: dict[str, dict[str, Any]],
) -> tuple[tuple[str, str], dict[str, str], str | None]:
    src_id = str(link.get("source") or "")
    src_node = nodes_by_id.get(src_id, {})
    src_file = str(link.get("source_file") or src_node.get("source_file") or "unknown")
    src_loc = str(link.get("source_location") or src_node.get("source_location") or "")
    label = str(src_node.get("label") or src_id)
    comm_name = src_node.get("community_name")
    entry = {
        "source_id": src_id,
        "label": label,
        "file": f"{src_file}:{src_loc}" if src_loc else src_file,
        "raw_file": src_file,
        "relation": str(link.get("relation") or "calls"),
    }
    return (src_file, label), entry, str(comm_name) if comm_name else None


def _build_callee_entry(
    link: dict[str, Any],
    nodes_by_id: dict[str, dict[str, Any]],
) -> dict[str, str]:
    tgt_id = str(link.get("target") or "")
    tgt_node = nodes_by_id.get(tgt_id, {})
    tgt_file = str(tgt_node.get("source_file") or "unknown")
    tgt_loc = str(tgt_node.get("source_location") or "")
    return {
        "target_id": tgt_id,
        "label": str(tgt_node.get("label") or tgt_id),
        "file": f"{tgt_file}:{tgt_loc}" if tgt_loc else tgt_file,
        "relation": str(link.get("relation") or "calls"),
    }


def _collect_callers(
    links: list[dict[str, Any]],
    target_node_id: str,
    nodes_by_id: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, str]], set[str], set[str]]:
    direct_callers: list[dict[str, str]] = []
    seen_callers: set[tuple[str, str]] = set()
    caller_files: set[str] = set()
    communities: set[str] = set()
    for link in links:
        if (
            link.get("target") != target_node_id
            or link.get("source") == target_node_id
        ):
            continue
        pair, entry, comm = _build_caller_entry(link, nodes_by_id)
        if pair in seen_callers:
            continue
        seen_callers.add(pair)
        caller_files.add(pair[0])
        direct_callers.append(entry)
        if comm:
            communities.add(comm)
    return direct_callers, caller_files, communities


def compute_blast_radius(graph: dict[str, Any], target_node_id: str) -> dict[str, Any]:
    nodes_by_id: dict[str, dict[str, Any]] = {
        str(n["id"]): n
        for n in graph.get("nodes", [])
        if isinstance(n, dict) and n.get("id") is not None
    }
    links = _filtered_links(graph)
    direct_callers, direct_caller_files, impacted_communities = _collect_callers(
        links, target_node_id, nodes_by_id
    )
    outgoing_callees: list[dict[str, str]] = []
    seen_callees: set[tuple[str, str]] = set()
    for link in links:
        if (
            link.get("source") != target_node_id
            or link.get("target") == target_node_id
        ):
            continue
        entry = _build_callee_entry(link, nodes_by_id)
        key = (entry["target_id"], entry["relation"])
        if key in seen_callees:
            continue
        seen_callees.add(key)
        outgoing_callees.append(entry)
    return {
        "direct_callers_count": len(direct_callers),
        "unique_files_count": len(direct_caller_files),
        "impacted_communities": sorted(impacted_communities),
        "direct_callers": direct_callers,
        "outgoing_callees": outgoing_callees,
    }


def _file_matches_pattern(path: Path, pattern: re.Pattern[str]) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return pattern.search(text) is not None


def _compile_boundary_pattern(query: str) -> re.Pattern[str]:
    esc = re.escape(query)
    has_left = bool(query and (query[0].isalnum() or query[0] == "_"))
    has_right = bool(query and (query[-1].isalnum() or query[-1] == "_"))
    left = r"(?<![A-Za-z0-9_])" if has_left else ""
    right = r"(?![A-Za-z0-9_])" if has_right else ""
    return re.compile(f"{left}{esc}{right}")


def _scan_repo_pattern(
    query: str, extensions: frozenset[str], workspace: Path | None = None
) -> list[str]:
    root = workspace.resolve() if workspace is not None else REPO_ROOT
    pattern = _compile_boundary_pattern(query)
    matched_files: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in FALLBACK_IGNORED_DIRS)
        for fname in filenames:
            path = Path(dirpath) / fname
            if path.suffix in extensions and _file_matches_pattern(path, pattern):
                matched_files.append(path.relative_to(root).as_posix())
    return sorted(matched_files)


def scan_fallback_references(
    query: str, workspace: Path | None = None
) -> list[str]:
    """Escanea archivos fuente cuando el grafo no cubre el símbolo."""
    return _scan_repo_pattern(query, SOURCE_EXTENSIONS, workspace)


def scan_contract_files(
    query: str, workspace: Path | None = None
) -> list[str]:
    """Rastrea contratos BDD (*.feature) y BATS (*.bats) afectados."""
    return _scan_repo_pattern(query, CONTRACT_EXTENSIONS, workspace)


def _is_security_token(tok: str) -> bool:
    if tok in SECURITY_BLAST_KEYWORDS:
        return True
    return len(tok) > 3 and tok.endswith("s") and tok[:-1] in SECURITY_BLAST_KEYWORDS


def _has_security_keyword(text: str) -> bool:
    split_camel = _CAMEL_BOUNDARY_RE.sub(r"\1_\2", text).lower()
    return any(_is_security_token(tok) for tok in _NON_ALNUM_RE.split(split_camel))


def assess_risk_level(query: str, callers_count: int, files_count: int) -> str:
    if _has_security_keyword(query) or callers_count >= HIGH_BLAST_CALLERS_THRESHOLD:
        return (
            "🔴 ALTO / CRÍTICO "
            "(Requiere suite completa de regresión y revisión minuciosa)"
        )
    if (
        callers_count < MODERATE_BLAST_CALLERS_THRESHOLD
        and files_count <= MICRO_CHANGE_MAX_FILES
    ):
        return "🟢 BAJO (Impacto acotado o localizado)"
    return (
        "🟡 MODERADO "
        "(Requiere verificación de contratos y pruebas unitarias de llamadores)"
    )


def _print_bounded_list(
    items: list[dict[str, str]], prefix_tag: str, overflow_label: str
) -> None:
    for item in items[:5]:
        print(f"   {prefix_tag} {item['file']}: {item['label']} ({item['relation']})")
    if len(items) > 5:
        print(f"   ... (+{len(items) - 5} {overflow_label})")


@dataclass
class _InspectAccum:
    workspace_root: Path
    seen_nodes: set[tuple[str, str, str]] = field(default_factory=set)
    total_caller_pairs: set[tuple[str, str]] = field(default_factory=set)
    total_files: set[str] = field(default_factory=set)


def _print_node_radius(
    g_path: Path,
    node: dict[str, Any],
    radius: dict[str, Any],
    node_where: str,
    workspace_root: Path | None = None,
) -> None:
    callers_count = int(radius["direct_callers_count"])
    files_count = int(radius["unique_files_count"])
    node_id = str(node.get("id") or "")
    risk = assess_risk_level(node_id, callers_count, files_count)
    disp = _rel_display_path(g_path, workspace_root)
    print(
        f"🔹 [{disp}] '{node.get('label')}' ({node_where}) "
        f"-> {callers_count} llamadores en {files_count} archivos | {risk}"
    )
    _print_bounded_list(radius["direct_callers"], "⬅️ [Llamado por]", "llamadores más")
    _print_bounded_list(
        radius.get("outgoing_callees", []),
        "➡️ [Invoca a]   ",
        "dependencias salientes más",
    )


def _process_graph_file(
    g_path: Path, query: str, accum: _InspectAccum
) -> None:
    try:
        graph = load_graph(g_path)
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        print(f"⚠️ Error procesando grafo {g_path}: {exc}")
        return
    prefix = _stack_prefix(g_path, accum.workspace_root)
    for node in find_matching_nodes(graph, query):
        node_file = _to_repo_rel_path(prefix, str(node.get("source_file") or "unknown"))
        node_label = str(node.get("label") or "")
        node_loc = str(node.get("source_location") or "")
        node_key = (node_file, node_label, node_loc.lstrip("L"))
        if node_key in accum.seen_nodes:
            continue
        accum.seen_nodes.add(node_key)
        radius = compute_blast_radius(graph, str(node.get("id") or ""))
        for caller in radius["direct_callers"]:
            raw_caller_file = str(caller.get("raw_file") or caller["file"])
            c_file = _to_repo_rel_path(prefix, raw_caller_file)
            accum.total_caller_pairs.add((c_file, str(caller.get("label") or "")))
            accum.total_files.add(c_file)
        node_where = f"{node_file}:{node_loc}" if node_loc else node_file
        _print_node_radius(
            g_path, node, radius, node_where, accum.workspace_root
        )


def _print_file_hits(hits: list[str], prefix_tag: str, overflow_label: str) -> None:
    for rel_file in hits[:5]:
        print(f"   {prefix_tag} {rel_file}")
    if len(hits) > 5:
        print(f"   ... (+{len(hits) - 5} {overflow_label})")


def _print_contract_and_fallback(
    graph_files: list[Path],
    query: str,
    accum: _InspectAccum,
) -> int:
    if graph_files:
        _print_file_hits(
            scan_contract_files(query, accum.workspace_root),
            "🧪 [Contrato BDD/BATS (QA-TEST-SYNC-01)]",
            "contratos más",
        )
    total_callers = len(accum.total_caller_pairs)
    if total_callers != 0:
        return total_callers
    fallback_files = scan_fallback_references(query, accum.workspace_root)
    if not fallback_files:
        return 0
    accum.total_files.update(fallback_files)
    _print_file_hits(fallback_files, "-> [AST/Source Scan]", "archivos más")
    return len(fallback_files)


def _resolve_graph_targets(
    graph_file: Path | None, workspace: Path | None = None
) -> list[Path]:
    if graph_file is not None:
        return [graph_file] if graph_file.is_file() else []
    return find_graph_files(workspace)


def inspect_symbol(
    query: str,
    *,
    allow_missing: bool = False,
    graph_file: Path | None = None,
    workspace: Path | None = None,
) -> int:
    root = workspace.resolve() if workspace is not None else REPO_ROOT
    graph_files = _resolve_graph_targets(graph_file, workspace)
    if not graph_files:
        print(
            f"⚠️ [Blast Radius: '{query}'] No se detectó ningún grafo Graphify "
            "(graphify-out/graph.json). DIRECTRIZ OBLIGATORIA: Si el grafo no existe, "
            "DEBES crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' "
            "(más información en qa-testing-blueprints)."
        )

    accum = _InspectAccum(workspace_root=root)
    for g_path in graph_files:
        _process_graph_file(g_path, query, accum)

    total_callers = _print_contract_and_fallback(graph_files, query, accum)
    final_risk = assess_risk_level(query, total_callers, len(accum.total_files))
    print(
        f"📊 [Blast Radius '{query}'] Llamadores: {total_callers} | "
        f"Archivos afectados: {len(accum.total_files)} | {final_risk}"
    )
    print(
        "🔄 [Recordatorio 11X | QA-TEST-SYNC-01] Audita y actualiza todas las pruebas "
        "preexistentes afectadas (unitarias, BATS y *.feature) y al terminar actualiza "
        "el grafo con './scripts/actualizar-grafos-graphify.sh'."
    )
    return 2 if (not graph_files and not allow_missing) else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Inspección rápida de radio de impacto con Graphify AST."
    )
    parser.add_argument(
        "query",
        help="Nombre del símbolo, función, modelo o archivo a inspeccionar.",
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="Retorna código 0 aunque no exista ningún graphify-out/graph.json.",
    )
    parser.add_argument(
        "--graph",
        type=Path,
        default=None,
        help="Ruta explícita a un archivo graph.json personalizado.",
    )
    parser.add_argument(
        "--workspace",
        type=Path,
        default=None,
        help="Raíz del workspace donde buscar grafos y fuentes (default: REPO_ROOT).",
    )
    args = parser.parse_args(argv)
    return inspect_symbol(
        args.query,
        allow_missing=args.allow_missing,
        graph_file=args.graph,
        workspace=args.workspace,
    )


if __name__ == "__main__":
    raise SystemExit(main())
