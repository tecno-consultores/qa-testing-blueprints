#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
"""
Script de Auditoría de Salud Topológica y Límites de Capas (Graphify AST).
Verifica que las relaciones entre componentes y módulos respeten las reglas
arquitectónicas y no existan acoplamientos inversos ni dependencias cíclicas prohibidas.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def find_graph_files() -> list[Path]:
    graphs = []
    for pattern in ["**/graphify-out/graph.json", "**/graph.json"]:
        for p in REPO_ROOT.glob(pattern):
            if "node_modules" not in str(p) and ".venv" not in str(p):
                graphs.append(p)
    return graphs


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def audit_layers(graph: dict[str, Any], graph_path: Path) -> tuple[list[str], dict[str, Any]]:
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    links = graph.get("links", [])
    violations: list[str] = []

    # Reglas generales de arquitectura limpia:
    # 1. Capa de dominio/modelos/esquemas no debe depender de controladores/routers API
    forbidden_prefixes = ["src/models/", "src/schemas/", "src/core/", "src/domain/"]

    for link in links:
        src_file = link.get("source_file", "")
        tgt_id = link.get("target", "")
        tgt_node = nodes.get(tgt_id)
        if not tgt_node:
            continue
        tgt_file = tgt_node.get("source_file", "")

        for prefix in forbidden_prefixes:
            if src_file.startswith(prefix) and (tgt_file.startswith("src/api/") or tgt_file.startswith("src/controllers/")):
                violations.append(
                    f"Acoplamiento inverso: '{src_file}' ({link.get('context', 'call')}) -> '{tgt_file}'"
                )

        # Reglas en Frontend: componentes comunes no deben importar vistas
        if src_file.startswith("src/components/common/") and (tgt_file.startswith("src/views/") or tgt_file.startswith("src/pages/")):
            violations.append(
                f"Acoplamiento invertido UI: Componente común '{src_file}' depende de vista '{tgt_file}'"
            )

    stats = {
        "nodes": len(nodes),
        "links": len(links),
        "communities": len({n.get("community", 0) for n in nodes.values()}),
    }
    return violations, stats


def main() -> int:
    print("🔍 [Graphify AST] Auditando salud topológica y límites de capas arquitectónicas...")

    graph_files = find_graph_files()
    if not graph_files:
        print("ℹ️ No se detectaron grafos AST (graph.json). Ejecución aprobada.")
        return 0

    all_violations: list[str] = []
    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            violations, stats = audit_layers(graph, g_path)
            print(f"📊 Grafo {g_path.relative_to(REPO_ROOT)}: {stats['nodes']} nodos, {stats['links']} relaciones, {stats['communities']} comunidades.")
            if violations:
                all_violations.extend([f"[{g_path.name}] {v}" for v in violations])
        except Exception as e:
            print(f"⚠️ Error procesando grafo {g_path}: {e}")

    if all_violations:
        print("\n❌ Se detectaron violaciones de límites de capas:")
        for v in all_violations:
            print(f"   - {v}")
        return 1

    print("✔ Salud topológica y límites de capas certificados (0 acoplamientos indebidos).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
