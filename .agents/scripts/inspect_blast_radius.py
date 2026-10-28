#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
"""
Script de Inspección Rápida de Radio de Impacto (Blast Radius) mediante Graphify AST.
Permite evaluar matemáticamente antes de refactorizar cuántos y cuáles archivos
o funciones dependen directa o indirectamente de un símbolo o archivo.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def find_graph_files() -> list[Path]:
    """Busca archivos graph.json generados por Graphify."""
    graphs = []
    for pattern in ["**/graphify-out/graph.json", "**/graph.json"]:
        for p in REPO_ROOT.glob(pattern):
            if "node_modules" not in str(p) and ".venv" not in str(p):
                graphs.append(p)
    return graphs


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_matching_nodes(graph: dict[str, Any], query: str) -> list[dict[str, Any]]:
    query_lower = query.lower()
    matches = []
    for node in graph.get("nodes", []):
        label = node.get("label", "").lower()
        node_id = node.get("id", "").lower()
        source_file = node.get("source_file", "").lower()
        if query_lower == label or query_lower == node_id or query_lower in source_file or query_lower in label:
            matches.append(node)
    return matches


def compute_blast_radius(graph: dict[str, Any], target_node_id: str) -> dict[str, Any]:
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    links = graph.get("links", [])

    direct_callers = []
    direct_caller_files: set[str] = set()
    impacted_communities: set[str] = set()

    for link in links:
        if link.get("target") == target_node_id:
            src_id = link.get("source")
            src_node = nodes_by_id.get(src_id, {})
            src_file = link.get("source_file") or src_node.get("source_file", "unknown")
            direct_caller_files.add(src_file)
            comm_name = src_node.get("community_name")
            if comm_name:
                impacted_communities.add(comm_name)

            direct_callers.append(
                {
                    "source_id": src_id,
                    "label": src_node.get("label", src_id),
                    "file": src_file,
                    "relation": link.get("relation", "calls"),
                }
            )

    return {
        "direct_callers_count": len(direct_callers),
        "unique_files_count": len(direct_caller_files),
        "impacted_communities": list(impacted_communities),
        "direct_callers": direct_callers,
    }


def assess_risk_level(query: str, callers_count: int, files_count: int) -> str:
    critical_keywords = ["vault", "auth", "token", "rls", "security", "csrf", "secret", "session"]
    is_security_critical = any(kw in query.lower() for kw in critical_keywords)

    if is_security_critical or callers_count >= 15 or files_count >= 8:
        return "🔴 ALTO / CRÍTICO (Requiere suite completa de regresión y revisión minuciosa)"
    elif callers_count >= 5 or files_count >= 3:
        return "🟡 MODERADO (Requiere verificación de contratos y pruebas unitarias de llamadores)"
    else:
        return "🟢 BAJO (Impacto acotado o localizado)"


def inspect_symbol(query: str) -> None:
    print(f"🎯 [Graphify Blast Radius] Analizando radio de impacto para: '{query}'\n")

    graph_files = find_graph_files()
    if not graph_files:
        print("ℹ️ No se encontraron grafos Graphify (graph.json). Para generarlos:")
        print("   docker compose -f <ecosistema>/docker-compose.qa.yml --profile graphify run --rm graphify bash -c 'uvx graphifyy extract'")
        return

    total_callers = 0
    total_files: set[str] = set()

    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            matches = find_matching_nodes(graph, query)
            if not matches:
                continue

            print(f"📂 Grafo: {g_path.relative_to(REPO_ROOT)} ({len(matches)} coincidencias)")
            for node in matches:
                node_id = node.get("id", "")
                radius = compute_blast_radius(graph, node_id)
                callers_count = radius["direct_callers_count"]
                files_count = radius["unique_files_count"]

                total_callers += callers_count
                for c in radius["direct_callers"]:
                    total_files.add(c["file"])

                risk = assess_risk_level(node_id, callers_count, files_count)
                print(f"   🔹 Nodo: '{node.get('label')}' (ID: {node_id})")
                print(f"      - Dependientes directos: {callers_count} en {files_count} archivos")
                print(f"      - Nivel de Riesgo: {risk}")
                if radius["direct_callers"]:
                    for c in radius["direct_callers"][:5]:
                        print(f"        -> {c['file']}: {c['label']} ({c['relation']})")
                    if callers_count > 5:
                        print(f"        ... y {callers_count - 5} más.")
        except Exception as e:
            print(f"⚠️ Error procesando grafo {g_path}: {e}")

    final_risk = assess_risk_level(query, total_callers, len(total_files))
    print(f"\n📊 RESUMEN GLOBAL PARA '{query}':")
    print(f"   - Total llamadores: {total_callers}")
    print(f"   - Total archivos afectados: {len(total_files)}")
    print(f"   - Diagnóstico: {final_risk}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspección rápida de radio de impacto con Graphify AST.")
    parser.add_argument("query", help="Nombre del símbolo, función, modelo o archivo a inspeccionar.")
    args = parser.parse_args()

    inspect_symbol(args.query)


if __name__ == "__main__":
    main()
