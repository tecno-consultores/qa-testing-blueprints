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
from pathlib import Path
import re
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
IGNORED_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "coverage", "target", "graphify-out"}
SOURCE_EXTENSIONS = {".py", ".ts", ".js", ".vue", ".tsx", ".jsx", ".php", ".sh", ".bats"}


def find_graph_files() -> list[Path]:
    """Busca archivos graph.json generados por Graphify."""
    graphs: list[Path] = []
    seen: set[Path] = set()
    for pattern in ["**/graphify-out/graph.json", "**/graph.json"]:
        for p in REPO_ROOT.glob(pattern):
            resolved = p.resolve()
            if resolved not in seen and "node_modules" not in str(p) and ".venv" not in str(p):
                seen.add(resolved)
                graphs.append(p)
    return graphs


def load_graph(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_matching_nodes(graph: dict[str, Any], query: str) -> list[dict[str, Any]]:
    query_lower = query.lower()
    matches = []
    for node in graph.get("nodes", []):
        label = str(node.get("label") or "").lower()
        node_id = str(node.get("id") or "").lower()
        source_file = str(node.get("source_file") or "").lower()
        if query_lower == label or query_lower == node_id or query_lower in source_file or query_lower in label:
            matches.append(node)
    return matches


def compute_blast_radius(graph: dict[str, Any], target_node_id: str) -> dict[str, Any]:
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    links = graph.get("links", [])

    direct_callers = []
    outgoing_callees = []
    direct_caller_files: set[str] = set()
    impacted_communities: set[str] = set()

    for link in links:
        relation = link.get("relation", "calls")
        loc = link.get("source_location")
        if link.get("target") == target_node_id:
            src_id = link.get("source")
            src_node = nodes_by_id.get(src_id, {})
            src_file = link.get("source_file") or src_node.get("source_file", "unknown")
            src_loc = loc or src_node.get("source_location", "")
            direct_caller_files.add(src_file)
            comm_name = src_node.get("community_name")
            if comm_name:
                impacted_communities.add(comm_name)

            direct_callers.append(
                {
                    "source_id": src_id,
                    "label": src_node.get("label", src_id),
                    "file": f"{src_file}:{src_loc}" if src_loc else src_file,
                    "raw_file": src_file,
                    "relation": relation,
                }
            )
        elif link.get("source") == target_node_id and relation != "contains":
            tgt_id = link.get("target")
            tgt_node = nodes_by_id.get(tgt_id, {})
            tgt_file = tgt_node.get("source_file") or link.get("source_file", "unknown")
            tgt_loc = tgt_node.get("source_location") or loc or ""
            outgoing_callees.append(
                {
                    "target_id": tgt_id,
                    "label": tgt_node.get("label", tgt_id),
                    "file": f"{tgt_file}:{tgt_loc}" if tgt_loc else tgt_file,
                    "relation": relation,
                }
            )

    return {
        "direct_callers_count": len(direct_callers),
        "unique_files_count": len(direct_caller_files),
        "impacted_communities": list(impacted_communities),
        "direct_callers": direct_callers,
        "outgoing_callees": outgoing_callees,
    }


def scan_fallback_references(query: str) -> list[str]:
    """Escanea archivos fuente por referencias directas cuando el grafo no cubre el símbolo."""
    pattern = re.compile(rf"\b{re.escape(query)}\b")
    matched_files: list[str] = []
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in SOURCE_EXTENSIONS:
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            if pattern.search(content):
                matched_files.append(str(path.relative_to(REPO_ROOT)))
        except OSError:
            continue
    return sorted(matched_files)


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
    graph_files = find_graph_files()
    if not graph_files:
        print(
            f"⚠️ [Blast Radius: '{query}'] No se detectó ningún grafo Graphify (graphify-out/graph.json). "
            "DIRECTRIZ OBLIGATORIA: Si el grafo no existe, DEBES crearlo ejecutando './scripts/actualizar-grafos-graphify.sh' "
            "(más información en qa-testing-blueprints)."
        )

    total_callers = 0
    total_files: set[str] = set()

    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            matches = find_matching_nodes(graph, query)
            if not matches:
                continue

            for node in matches:
                node_id = node.get("id", "")
                radius = compute_blast_radius(graph, node_id)
                callers_count = radius["direct_callers_count"]
                files_count = radius["unique_files_count"]

                total_callers += callers_count
                for c in radius["direct_callers"]:
                    total_files.add(c.get("raw_file", c["file"]))

                node_file = node.get("source_file", "unknown")
                node_loc = node.get("source_location", "")
                node_where = f"{node_file}:{node_loc}" if node_loc else node_file
                risk = assess_risk_level(node_id, callers_count, files_count)
                print(
                    f"🔹 [{g_path.relative_to(REPO_ROOT)}] '{node.get('label')}' ({node_where}) -> {callers_count} llamadores en {files_count} archivos | {risk}"
                )
                if radius["direct_callers"]:
                    for c in radius["direct_callers"][:5]:
                        print(f"   ⬅️ [Llamado por] {c['file']}: {c['label']} ({c['relation']})")
                    if callers_count > 5:
                        print(f"   ... (+{callers_count - 5} llamadores más)")
                outgoing = radius.get("outgoing_callees", [])
                if outgoing:
                    for o in outgoing[:5]:
                        print(f"   ➡️ [Invoca a]    {o['file']}: {o['label']} ({o['relation']})")
                    if len(outgoing) > 5:
                        print(f"   ... (+{len(outgoing) - 5} dependencias salientes más)")
        except Exception as e:
            print(f"⚠️ Error procesando grafo {g_path}: {e}")

    if total_callers == 0:
        fallback_files = scan_fallback_references(query)
        if fallback_files:
            total_callers = len(fallback_files)
            total_files.update(fallback_files)
            for rel_file in fallback_files[:5]:
                print(f"   -> [AST/Source Scan] {rel_file}")
            if len(fallback_files) > 5:
                print(f"   ... (+{len(fallback_files) - 5} archivos más)")

    final_risk = assess_risk_level(query, total_callers, len(total_files))
    print(f"📊 [Blast Radius '{query}'] Llamadores: {total_callers} | Archivos afectados: {len(total_files)} | {final_risk}")
    print("🔄 [Recordatorio 11X] Al terminar los cambios y pruebas, SIEMPRE debes actualizar el grafo con './scripts/actualizar-grafos-graphify.sh'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspección rápida de radio de impacto con Graphify AST.")
    parser.add_argument("query", help="Nombre del símbolo, función, modelo o archivo a inspeccionar.")
    args = parser.parse_args()

    inspect_symbol(args.query)


if __name__ == "__main__":
    main()
