#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""
Script de Auditoría de Salud Topológica y Límites de Capas (Graphify AST).
Verifica que las relaciones entre componentes y módulos respeten las reglas
arquitectónicas y no existan acoplamientos inversos ni dependencias cíclicas prohibidas.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_IGNORED_DIRS = frozenset(
    {
        "node_modules",
        ".venv",
        ".git",
        ".trivycache",
        "dist",
        "coverage",
        "vendor",
        "target",
        ".pytest_cache",
        ".mypy_cache",
    }
)
_DOMAIN_RE = re.compile(r"(?:^|/)(?:src/)?(?:models|schemas|core|domain|services)/")
_TEST_PATH_RE = re.compile(r"(?:^|/)(?:tests?|__tests__|e2e)/")
_API_RE = re.compile(r"(?:^|/)(?:src/)?(?:api|controllers|routes|views)/")
_UI_COMMON_RE = re.compile(r"(?:^|/)(?:src/)?components/common/")
_UI_VIEWS_RE = re.compile(r"(?:^|/)(?:src/)?(?:views|pages)/")
_STRUCTURAL_RELATIONS = frozenset(
    {"contains", "rationale_for", "documented_in", "defines", "declares", "method"}
)

_LAYER_RULES: tuple[tuple[re.Pattern[str], re.Pattern[str], str], ...] = (
    (
        _DOMAIN_RE,
        _API_RE,
        "Acoplamiento inverso: '{src}' ({ctx}) -> '{tgt}'",
    ),
    (
        _UI_COMMON_RE,
        _UI_VIEWS_RE,
        "Acoplamiento invertido UI: Componente común '{src}' depende de vista '{tgt}'",
    ),
)


def _record_unique_graph(seen: dict[Path, Path], candidate: Path) -> None:
    resolved = candidate.resolve()
    prev = seen.get(resolved)
    if prev is None or (prev.is_symlink() and not candidate.is_symlink()):
        seen[resolved] = candidate


def find_graph_files(target_root: Path | None = None) -> list[Path]:
    root = target_root or REPO_ROOT
    seen: dict[Path, Path] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _IGNORED_DIRS)
        current_dir = Path(dirpath)
        if current_dir.name == "graphify-out" and "graph.json" in filenames:
            _record_unique_graph(seen, current_dir / "graph.json")
    return sorted(seen.values(), key=lambda p: p.as_posix())


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("El grafo AST debe contener un objeto JSON en la raíz.")
    return data


def _display_graph_path(graph_path: Path) -> str:
    try:
        return graph_path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        parent = graph_path.parent.name
        return f"{parent}/{graph_path.name}" if parent else graph_path.name


def _resolve_link_files(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> tuple[str, str] | None:
    if not isinstance(link, dict):
        return None
    src_node = nodes.get(str(link.get("source", "")))
    raw_src = link.get("source_file") or (
        src_node.get("source_file", "") if src_node else ""
    )
    src_file = str(raw_src).replace("\\", "/")
    tgt_node = nodes.get(str(link.get("target", "")))
    if not src_file or not tgt_node:
        return None
    tgt_file = str(tgt_node.get("source_file", "")).replace("\\", "/")
    if not tgt_file:
        return None
    return src_file, tgt_file


def _check_link_violations(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> list[str]:
    pair = _resolve_link_files(link, nodes)
    if pair is None:
        return []
    src_file, tgt_file = pair
    if _TEST_PATH_RE.search(src_file) or _TEST_PATH_RE.search(tgt_file):
        return []
    ctx = str(link.get("context", "call"))
    found: list[str] = []
    for src_re, tgt_re, template in _LAYER_RULES:
        if src_re.search(src_file) and tgt_re.search(tgt_file):
            found.append(template.format(src=src_file, tgt=tgt_file, ctx=ctx))
    return found


@dataclass
class _DfsState:
    adj: dict[str, list[str]]
    color: dict[str, int]
    path: list[str]
    found: set[tuple[str, ...]]


def _is_same_file_call(
    rel: str, link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> bool:
    if rel != "calls":
        return False
    files = _resolve_link_files(link, nodes)
    return files is not None and files[0] == files[1]


def _is_dependency_edge(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> tuple[str, str] | None:
    if not isinstance(link, dict):
        return None
    src = str(link.get("source") or "")
    tgt = str(link.get("target") or "")
    rel = str(link.get("relation") or "")
    if not src or not tgt or src == tgt or rel in _STRUCTURAL_RELATIONS:
        return None
    if _is_same_file_call(rel, link, nodes):
        return None
    return src, tgt


def _build_dependency_graph(
    links: list[dict[str, Any]], nodes: dict[str, dict[str, Any]]
) -> dict[str, list[str]]:
    raw_adj: dict[str, set[str]] = {}
    for link in links:
        edge = _is_dependency_edge(link, nodes)
        if edge is not None:
            raw_adj.setdefault(edge[0], set()).add(edge[1])
    return {key: sorted(vals) for key, vals in raw_adj.items()}


def _canonical_cycle(cycle: list[str]) -> tuple[str, ...]:
    core = cycle[:-1]
    min_idx = min(range(len(core)), key=lambda idx: core[idx])
    rotated = core[min_idx:] + core[:min_idx]
    return (*rotated, rotated[0])


def _handle_dfs_neighbor(
    nxt: str, stack: list[tuple[str, int]], state: _DfsState
) -> None:
    nxt_color = state.color.get(nxt, 0)
    if nxt_color == 1:
        pos = state.path.index(nxt)
        state.found.add(_canonical_cycle([*state.path[pos:], nxt]))
    elif nxt_color == 0:
        state.color[nxt] = 1
        state.path.append(nxt)
        stack.append((nxt, 0))


def _dfs_from_start(start: str, state: _DfsState) -> None:
    state.color[start] = 1
    state.path.append(start)
    stack: list[tuple[str, int]] = [(start, 0)]
    while stack:
        node, idx = stack[-1]
        neighbors = state.adj.get(node, ())
        if idx >= len(neighbors):
            stack.pop()
            state.path.pop()
            state.color[node] = 2
            continue
        stack[-1] = (node, idx + 1)
        _handle_dfs_neighbor(neighbors[idx], stack, state)


def _detect_directed_cycles(
    links: list[dict[str, Any]], nodes: dict[str, dict[str, Any]], graph_label: str
) -> list[str]:
    state = _DfsState(
        adj=_build_dependency_graph(links, nodes),
        color={},
        path=[],
        found=set(),
    )
    for start in sorted(state.adj):
        if state.color.get(start, 0) == 0:
            _dfs_from_start(start, state)
    return [
        f"[{graph_label}] Dependencia cíclica detectada: {' -> '.join(cycle)}"
        for cycle in sorted(state.found)
    ]


def audit_layers(
    graph: dict[str, Any], graph_path: Path
) -> tuple[list[str], dict[str, Any]]:
    graph_label = _display_graph_path(graph_path)
    nodes = {str(n["id"]): n for n in graph.get("nodes", [])}
    links = graph.get("links", [])
    violations: list[str] = []
    for link in links:
        for msg in _check_link_violations(link, nodes):
            violations.append(f"[{graph_label}] {msg}")
    violations.extend(_detect_directed_cycles(links, nodes, graph_label))

    stats = {
        "graph_file": graph_label,
        "nodes": len(nodes),
        "links": len(links),
        "communities": len({n.get("community", 0) for n in nodes.values()}),
    }
    return violations, stats


def _audit_graphs(graph_files: list[Path]) -> tuple[list[str], int, int]:
    all_violations: list[str] = []
    total_nodes = 0
    total_links = 0
    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            violations, stats = audit_layers(graph, g_path)
            total_nodes += int(stats["nodes"])
            total_links += int(stats["links"])
            all_violations.extend(violations)
        except Exception as exc:
            print(f"❌ Error procesando grafo {g_path}: {exc}")
            label = _display_graph_path(g_path)
            all_violations.append(
                f"[{label}] Grafo AST corrupto o ilegible (Fail-Secure): {exc}"
            )
    return all_violations, total_nodes, total_links


def _resolve_graph_targets(
    target_root: Path | None, graph_file: Path | None
) -> list[Path]:
    if graph_file is not None:
        return [graph_file]
    return find_graph_files(target_root or REPO_ROOT)


def main(
    target_root: Path | None = None,
    exit_skipped_code: int = 0,
    graph_file: Path | None = None,
) -> int:
    graph_files = _resolve_graph_targets(target_root, graph_file)
    if not graph_files:
        print("⚠️ SKIPPED [AST Topology]: 0 grafos AST (graph.json) detectados.")
        return exit_skipped_code

    all_violations, total_nodes, total_links = _audit_graphs(graph_files)
    if all_violations:
        print("❌ Se detectaron violaciones de límites de capas:")
        for violation in all_violations:
            print(f"   - {violation}")
        return 1

    print(
        f"✔ [AST Topology] {len(graph_files)} grafo(s), {total_nodes} nodos, "
        f"{total_links} relaciones (0 violaciones de capa)."
    )
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita salud topológica y límites de capas Graphify AST."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--workspace", type=Path, default=None)
    parser.add_argument("--graph", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    target = args.workspace if args.workspace is not None else args.target_root
    return main(
        target_root=target,
        exit_skipped_code=args.exit_skipped_code,
        graph_file=args.graph,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
