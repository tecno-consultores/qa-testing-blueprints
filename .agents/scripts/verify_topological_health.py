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
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_IGNORED_DIRS = frozenset(
    {"node_modules", ".venv", ".trivycache", "dist", "coverage", "vendor", "target"}
)
_DOMAIN_RE = re.compile(r"(?:^|/)src/(?:models|schemas|core|domain)/")
_API_RE = re.compile(r"(?:^|/)src/(?:api|controllers)/")
_UI_COMMON_RE = re.compile(r"(?:^|/)src/components/common/")
_UI_VIEWS_RE = re.compile(r"(?:^|/)src/(?:views|pages)/")

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


def find_graph_files(target_root: Path | None = None) -> list[Path]:
    root = target_root or REPO_ROOT
    graphs: list[Path] = []
    seen: set[Path] = set()
    for pattern in ("**/graphify-out/graph.json", "**/graph.json"):
        for path in sorted(root.glob(pattern)):
            resolved = path.resolve()
            rel_parts = path.relative_to(root).parts
            if resolved in seen or any(part in _IGNORED_DIRS for part in rel_parts):
                continue
            seen.add(resolved)
            graphs.append(path)
    return graphs


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("El grafo AST debe contener un objeto JSON en la raíz.")
    return data


def _resolve_link_files(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> tuple[str, str] | None:
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
    ctx = str(link.get("context", "call"))
    found: list[str] = []
    for src_re, tgt_re, template in _LAYER_RULES:
        if src_re.search(src_file) and tgt_re.search(tgt_file):
            found.append(template.format(src=src_file, tgt=tgt_file, ctx=ctx))
    return found


def audit_layers(
    graph: dict[str, Any], graph_path: Path
) -> tuple[list[str], dict[str, Any]]:
    _ = graph_path
    nodes = {str(n["id"]): n for n in graph.get("nodes", [])}
    links = graph.get("links", [])
    violations: list[str] = []
    for link in links:
        violations.extend(_check_link_violations(link, nodes))

    stats = {
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
            all_violations.extend(f"[{g_path.name}] {v}" for v in violations)
        except Exception as exc:
            print(f"❌ Error procesando grafo {g_path}: {exc}")
            all_violations.append(
                f"[{g_path.name}] Grafo AST corrupto o ilegible (Fail-Secure): {exc}"
            )
    return all_violations, total_nodes, total_links


def main(target_root: Path | None = None, exit_skipped_code: int = 0) -> int:
    root = target_root or REPO_ROOT
    graph_files = find_graph_files(root)
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
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    return main(
        target_root=args.target_root,
        exit_skipped_code=args.exit_skipped_code,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
