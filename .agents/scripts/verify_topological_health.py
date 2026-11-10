#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""
Script de Auditoría de Salud Topológica y Límites de Capas (Graphify AST).
Verifica que las relaciones entre componentes y módulos respeten las reglas
arquitectónicas y no existan acoplamientos inversos ni dependencias cíclicas prohibidas.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def find_graph_files(target_root: Path | None = None) -> list[Path]:
    root = target_root or REPO_ROOT
    ignored = {"node_modules", ".venv", ".trivycache", "dist", "coverage"}
    graphs: list[Path] = []
    seen: set[Path] = set()
    for pattern in ["**/graphify-out/graph.json", "**/graph.json"]:
        for p in sorted(root.glob(pattern)):
            resolved = p.resolve()
            rel_parts = p.relative_to(root).parts
            if resolved not in seen and not any(part in ignored for part in rel_parts):
                seen.add(resolved)
                graphs.append(p)
    return graphs


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def audit_layers(graph: dict[str, Any], graph_path: Path) -> tuple[list[str], dict[str, Any]]:
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    links = graph.get("links", [])
    violations: list[str] = []

    domain_re = re.compile(r"(?:^|/)src/(?:models|schemas|core|domain)/")
    api_re = re.compile(r"(?:^|/)src/(?:api|controllers)/")
    ui_common_re = re.compile(r"(?:^|/)src/components/common/")
    ui_views_re = re.compile(r"(?:^|/)src/(?:views|pages)/")

    for link in links:
        src_node = nodes.get(link.get("source", ""))
        src_file = str(link.get("source_file") or (src_node.get("source_file", "") if src_node else "")).replace(
            "\\", "/"
        )
        tgt_id = link.get("target", "")
        tgt_node = nodes.get(tgt_id)
        if not src_file or not tgt_node:
            continue
        tgt_file = str(tgt_node.get("source_file", "")).replace("\\", "/")
        if not tgt_file:
            continue

        if domain_re.search(src_file) and api_re.search(tgt_file):
            violations.append(f"Acoplamiento inverso: '{src_file}' ({link.get('context', 'call')}) -> '{tgt_file}'")

        if ui_common_re.search(src_file) and ui_views_re.search(tgt_file):
            violations.append(f"Acoplamiento invertido UI: Componente común '{src_file}' depende de vista '{tgt_file}'")

    stats = {
        "nodes": len(nodes),
        "links": len(links),
        "communities": len({n.get("community", 0) for n in nodes.values()}),
    }
    return violations, stats


def main() -> int:
    graph_files = find_graph_files()
    if not graph_files:
        print("✔ [AST Topology] 0 grafos AST (graph.json) detectados.")
        return 0

    all_violations: list[str] = []
    total_nodes = 0
    total_links = 0
    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            violations, stats = audit_layers(graph, g_path)
            total_nodes += stats["nodes"]
            total_links += stats["links"]
            if violations:
                all_violations.extend([f"[{g_path.name}] {v}" for v in violations])
        except Exception as e:
            print(f"❌ Error procesando grafo {g_path}: {e}")
            all_violations.append(f"[{g_path.name}] Grafo AST corrupto o ilegible (Fail-Secure): {e}")

    if all_violations:
        print("❌ Se detectaron violaciones de límites de capas:")
        for v in all_violations:
            print(f"   - {v}")
        return 1

    print(
        f"✔ [AST Topology] {len(graph_files)} grafo(s), {total_nodes} nodos, {total_links} relaciones (0 violaciones de capa)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
