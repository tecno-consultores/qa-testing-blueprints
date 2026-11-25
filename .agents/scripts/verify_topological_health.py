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

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _common import CANONICAL_IGNORED_DIRS, reject_duplicate_json_keys  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_IGNORED_DIRS = CANONICAL_IGNORED_DIRS - {"graphify-out"}
_DOMAIN_RE = re.compile(r"(?:^|/)(?:src/)?(?:models|schemas|core|domain|services)/")
_TEST_PATH_RE = re.compile(
    r"(?:^|/)(?:tests?|__tests__|e2e)/"
    r"|(?:^|/)(?:test_[^/]+\.py|[^/]+_(?:test|unit|spec|e2e)\.py|"
    r"[^/]+\.(?:unit|spec|test|e2e)\.[cm]?[jt]sx?)$"
)
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
_SRC_ROOT_NAMES = frozenset({"src", "app", "lib", "packages", "apps", "services"})
_VALID_BOUNDARY_KINDS = frozenset({"layers", "independence", "forbidden"})


def _detect_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    return reject_duplicate_json_keys(pairs)


def _norm_rel_path(raw: str) -> str:
    cleaned = raw.strip().replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned.strip("/")


def _matches_prefix(path_str: str, prefix: str) -> bool:
    norm_path = _norm_rel_path(path_str)
    norm_pref = _norm_rel_path(prefix)
    if not norm_path or not norm_pref:
        return False
    return norm_path == norm_pref or norm_path.startswith(f"{norm_pref}/")


def _join_root_prefix(root: str, item: str) -> str:
    clean_root = _norm_rel_path(root)
    clean_item = _norm_rel_path(item)
    if not clean_root:
        return clean_item
    return f"{clean_root}/{clean_item}" if clean_item else clean_root


def _raw_rule_candidates(raw_data: Any) -> list[Any]:
    if isinstance(raw_data, list):
        return raw_data
    if not isinstance(raw_data, dict):
        raise ValueError("boundaries.json debe ser objeto o arreglo JSON.")
    if "kind" in raw_data:
        return [raw_data]
    val = (
        raw_data["rules_sets"]
        if "rules_sets" in raw_data
        else raw_data.get("rules")
    )
    if isinstance(val, list):
        return val
    raise ValueError(
        "boundaries.json debe definir 'kind', 'rules' o 'rules_sets'."
    )


def _extract_rule_list(raw_data: Any) -> list[dict[str, Any]]:
    candidates = _raw_rule_candidates(raw_data)
    rules: list[dict[str, Any]] = []
    for item in candidates:
        if not isinstance(item, dict) or item.get("kind") not in _VALID_BOUNDARY_KINDS:
            raise ValueError(
                f"Regla declarativa inválida o 'kind' desconocido: {item!r}"
            )
        rules.append(item)
    return rules


def load_boundary_rules(boundaries_path: Path) -> list[dict[str, Any]]:
    raw_text = boundaries_path.read_text(encoding="utf-8")
    parsed = json.loads(raw_text, object_pairs_hook=_detect_duplicate_keys)
    return _extract_rule_list(parsed)


def _resolve_boundaries_path(
    target_root: Path | None, boundaries_file: Path | None
) -> Path | None:
    if boundaries_file is not None:
        return boundaries_file
    candidate = (target_root or REPO_ROOT) / ".agents" / "boundaries.json"
    return candidate if candidate.is_file() else None


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


def _display_graph_path(graph_path: Path, base_root: Path | None = None) -> str:
    root = base_root or REPO_ROOT
    try:
        return graph_path.relative_to(root).as_posix()
    except ValueError:
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


def _is_same_or_test_file_edge(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> bool:
    files = _resolve_link_files(link, nodes)
    if files is None:
        return False
    if files[0] == files[1]:
        return True
    return bool(_TEST_PATH_RE.search(files[0]) or _TEST_PATH_RE.search(files[1]))


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
    if _is_same_or_test_file_edge(link, nodes):
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


@dataclass(frozen=True)
class _IndependenceCtx:
    mod_prefixes: tuple[tuple[str, str], ...]
    shared_prefixes: tuple[str, ...]


def _collect_node_files(nodes: dict[str, dict[str, Any]]) -> list[str]:
    files: list[str] = []
    for node in nodes.values():
        sf = _norm_rel_path(str(node.get("source_file") or ""))
        if sf and sf != "unknown":
            files.append(sf)
    return files


def _verify_prefixes_non_empty(
    prefixes: list[str], node_files: list[str], graph_label: str
) -> list[str]:
    violations: list[str] = []
    for pref in prefixes:
        if not any(_matches_prefix(sf, pref) for sf in node_files):
            violations.append(
                f"[{graph_label}] Regla declarativa sin coincidencias ('{pref}' = 0 "
                "nodos en graph.json; posible prefijo obsoleto o mal configurado)"
            )
    return violations


def _resolve_non_test_link_files(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> tuple[str, str] | None:
    rel = str(link.get("relation") or "")
    if rel in _STRUCTURAL_RELATIONS:
        return None
    pair = _resolve_link_files(link, nodes)
    if pair is None:
        return None
    src_file, tgt_file = pair
    if _TEST_PATH_RE.search(src_file) or _TEST_PATH_RE.search(tgt_file):
        return None
    return src_file, tgt_file


def _layer_index(path_str: str, prefixes: list[str]) -> int | None:
    for idx, pref in enumerate(prefixes):
        if _matches_prefix(path_str, pref):
            return idx
    return None


def _eval_layers_links(
    prefixes: list[str],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
) -> list[str]:
    violations: list[str] = []
    for link in links:
        pair = _resolve_non_test_link_files(link, nodes)
        if pair is None:
            continue
        li = _layer_index(pair[0], prefixes)
        ti = _layer_index(pair[1], prefixes)
        if li is not None and ti is not None and ti < li:
            violations.append(
                f"[{graph_label}] Violación de capas "
                f"({prefixes[li]} -> {prefixes[ti]}): '{pair[0]}' -> '{pair[1]}'"
            )
    return violations


def _check_layers_rule(
    rule: dict[str, Any],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
    prefix_files: list[str] | None = None,
) -> list[str]:
    root = str(rule.get("root") or "")
    layers = [str(x) for x in rule.get("layers", []) if str(x)]
    if not layers:
        return [f"[{graph_label}] Regla declarativa 'layers' sin capas definidas."]
    prefixes = [_join_root_prefix(root, layer) for layer in layers]
    node_files = (
        prefix_files if prefix_files is not None else _collect_node_files(nodes)
    )
    violations = _verify_prefixes_non_empty(prefixes, node_files, graph_label)
    violations.extend(_eval_layers_links(prefixes, links, nodes, graph_label))
    return violations


def _find_module_match(
    path_str: str, mod_prefixes: tuple[tuple[str, str], ...]
) -> str | None:
    for mod_name, pref in mod_prefixes:
        if _matches_prefix(path_str, pref):
            return mod_name
    return None


def _is_shared_target(path_str: str, shared_prefixes: tuple[str, ...]) -> bool:
    return any(_matches_prefix(path_str, pref) for pref in shared_prefixes)


def _eval_independence_links(
    ctx: _IndependenceCtx,
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
) -> list[str]:
    violations: list[str] = []
    for link in links:
        pair = _resolve_non_test_link_files(link, nodes)
        if pair is None or _is_shared_target(pair[1], ctx.shared_prefixes):
            continue
        src_mod = _find_module_match(pair[0], ctx.mod_prefixes)
        tgt_mod = _find_module_match(pair[1], ctx.mod_prefixes)
        if src_mod is not None and tgt_mod is not None and src_mod != tgt_mod:
            violations.append(
                f"[{graph_label}] Violación de independencia ({src_mod} -> {tgt_mod}): "
                f"'{pair[0]}' -> '{pair[1]}'"
            )
    return violations


def _check_independence_rule(
    rule: dict[str, Any],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
    prefix_files: list[str] | None = None,
) -> list[str]:
    root = str(rule.get("root") or "")
    modules = [str(x) for x in rule.get("modules", []) if str(x)]
    if not modules:
        return [
            f"[{graph_label}] Regla declarativa 'independence' sin módulos definidos."
        ]
    mod_pairs = tuple((m, _join_root_prefix(root, m)) for m in modules)
    shared = tuple(_norm_rel_path(str(x)) for x in rule.get("shared", []) if str(x))
    ctx = _IndependenceCtx(mod_prefixes=mod_pairs, shared_prefixes=shared)
    node_files = (
        prefix_files if prefix_files is not None else _collect_node_files(nodes)
    )
    violations = _verify_prefixes_non_empty(
        [p for _, p in mod_pairs], node_files, graph_label
    )
    violations.extend(_eval_independence_links(ctx, links, nodes, graph_label))
    return violations


def _matches_forbidden_token(tgt_tokens: tuple[str, str, str], forb: str) -> bool:
    forb_norm = _norm_rel_path(forb).lower()
    if not forb_norm:
        return False
    tgt_file, tgt_id, tgt_label = tgt_tokens
    if tgt_file and _matches_prefix(tgt_file.lower(), forb_norm):
        return True
    if "/" not in forb_norm:
        if tgt_file and f"/{forb_norm}/" in f"/{tgt_file.lower()}/":
            return True
        return any(
            tok == forb_norm
            or tok.startswith(f"{forb_norm}.")
            or tok.startswith(f"{forb_norm}/")
            for tok in (tgt_id.lower(), tgt_label.lower())
        )
    return False


def _resolve_forbidden_source_and_target(
    link: dict[str, Any], nodes: dict[str, dict[str, Any]]
) -> tuple[str, tuple[str, str, str]] | None:
    if (
        not isinstance(link, dict)
        or str(link.get("relation") or "") in _STRUCTURAL_RELATIONS
    ):
        return None
    src_id = str(link.get("source") or "")
    tgt_id = str(link.get("target") or "")
    src_node = nodes.get(src_id, {})
    raw_src = link.get("source_file") or src_node.get("source_file") or ""
    src_file = _norm_rel_path(str(raw_src))
    if not src_file or _TEST_PATH_RE.search(src_file):
        return None
    tgt_node = nodes.get(tgt_id, {})
    tgt_file = _norm_rel_path(str(tgt_node.get("source_file") or ""))
    if tgt_file and _TEST_PATH_RE.search(tgt_file):
        return None
    tgt_label = str(tgt_node.get("label") or "")
    return src_file, (tgt_file, tgt_id, tgt_label)


def _eval_forbidden_entry(
    entry: dict[str, Any],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
) -> list[str]:
    src_pref = str(entry.get("source") or "")
    forb_list = [str(x) for x in entry.get("forbidden", []) if str(x)]
    violations: list[str] = []
    for link in links:
        resolved = _resolve_forbidden_source_and_target(link, nodes)
        if resolved is None or not _matches_prefix(resolved[0], src_pref):
            continue
        matched = next(
            (f for f in forb_list if _matches_forbidden_token(resolved[1], f)), None
        )
        if matched is not None:
            tgt_disp = resolved[1][0] or resolved[1][2] or resolved[1][1]
            violations.append(
                f"[{graph_label}] Dependencia prohibida desde '{src_pref}' hacia "
                f"'{matched}': '{resolved[0]}' -> '{tgt_disp}'"
            )
    return violations


def _check_forbidden_rule(
    rule: dict[str, Any],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
    prefix_files: list[str] | None = None,
) -> list[str]:
    _ = prefix_files
    violations: list[str] = []
    for entry in rule.get("rules", []):
        if isinstance(entry, dict):
            violations.extend(_eval_forbidden_entry(entry, links, nodes, graph_label))
    return violations


def _check_boundary_rules(
    rules: list[dict[str, Any]],
    links: list[dict[str, Any]],
    nodes: dict[str, dict[str, Any]],
    graph_label: str,
    prefix_files: list[str] | None = None,
) -> list[str]:
    handlers = {
        "layers": _check_layers_rule,
        "independence": _check_independence_rule,
        "forbidden": _check_forbidden_rule,
    }
    violations: list[str] = []
    for rule in rules:
        handler = handlers.get(str(rule.get("kind") or ""))
        if handler is not None:
            violations.extend(handler(rule, links, nodes, graph_label, prefix_files))
    return violations


def _module_key_from_source(rel_path: str) -> str:
    cleaned = _norm_rel_path(rel_path)
    parts = [p for p in cleaned.split("/") if p]
    if len(parts) <= 1:
        return "(root)"
    if parts[0] in _SRC_ROOT_NAMES and len(parts) > 2:
        return "/".join(parts[: min(3, len(parts) - 1)])
    if len(parts) > 3 and parts[1] in _SRC_ROOT_NAMES:
        return "/".join(parts[:3])
    return "/".join(parts[: min(2, len(parts) - 1)])


def _collect_module_counts(
    graph: dict[str, Any],
) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    nodes = {
        str(n["id"]): n
        for n in graph.get("nodes", [])
        if isinstance(n, dict) and n.get("id") is not None
    }
    node_counts: dict[str, int] = {}
    for node in nodes.values():
        sf = _norm_rel_path(str(node.get("source_file") or ""))
        if sf and sf != "unknown" and not _TEST_PATH_RE.search(sf):
            mod = _module_key_from_source(sf)
            node_counts[mod] = node_counts.get(mod, 0) + 1
    fan_in, fan_out = _count_cross_module_edges(graph.get("links", []), nodes)
    return node_counts, fan_in, fan_out


def _count_cross_module_edges(
    links: list[dict[str, Any]], nodes: dict[str, dict[str, Any]]
) -> tuple[dict[str, int], dict[str, int]]:
    fan_in: dict[str, int] = {}
    fan_out: dict[str, int] = {}
    seen_edges: set[tuple[str, str]] = set()
    for link in links:
        edge = _is_dependency_edge(link, nodes)
        if edge is None or edge in seen_edges:
            continue
        files = _resolve_link_files(link, nodes)
        if files is None:
            continue
        seen_edges.add(edge)
        src_mod = _module_key_from_source(files[0])
        tgt_mod = _module_key_from_source(files[1])
        if src_mod != tgt_mod:
            fan_out[src_mod] = fan_out.get(src_mod, 0) + 1
            fan_in[tgt_mod] = fan_in.get(tgt_mod, 0) + 1
    return fan_in, fan_out


def _percentile_and_median(
    node_counts: dict[str, int], scores: list[int]
) -> tuple[int, float]:
    sorted_scores = sorted(scores)
    p90_idx = int(0.9 * (len(sorted_scores) - 1)) if sorted_scores else 0
    p90 = sorted_scores[p90_idx] if sorted_scores else 0
    sorted_nodes = sorted(node_counts.values())
    mid = len(sorted_nodes) // 2
    if not sorted_nodes:
        median_nodes = 0.0
    elif len(sorted_nodes) % 2 == 1:
        median_nodes = float(sorted_nodes[mid])
    else:
        median_nodes = (sorted_nodes[mid - 1] + sorted_nodes[mid]) / 2.0
    return p90, median_nodes


def compute_module_instability(graph: dict[str, Any]) -> list[dict[str, Any]]:
    node_counts, fan_in, fan_out = _collect_module_counts(graph)
    all_mods = sorted(set(node_counts) | set(fan_in) | set(fan_out))
    if not all_mods:
        return []
    scores = [fan_in.get(m, 0) * fan_out.get(m, 0) for m in all_mods]
    p90, median_nodes = _percentile_and_median(node_counts, scores)
    god_threshold = max(p90, 4)
    rows: list[dict[str, Any]] = []
    for mod in all_mods:
        ca, ce = fan_in.get(mod, 0), fan_out.get(mod, 0)
        nc = node_counts.get(mod, 0)
        total = ca + ce
        cs = ca * ce
        rows.append(
            {
                "module": mod,
                "nodes_count": nc,
                "fan_in": ca,
                "fan_out": ce,
                "instability": round(ce / total, 2) if total > 0 else 0.0,
                "coupling_score": cs,
                "god_module_candidate": cs >= god_threshold and nc >= median_nodes,
            }
        )
    rows.sort(
        key=lambda r: (
            -int(r["coupling_score"]),
            -float(r["instability"]),
            str(r["module"]),
        )
    )
    return rows


def _print_instability_table(graph_label: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    print(f"📐 [Métricas Martin | {graph_label}] Top módulos (I = Ce/(Ca+Ce)):")
    for row in rows[:15]:
        god_tag = " ⚠️ god-module" if row["god_module_candidate"] else ""
        print(
            f"   - {row['module']}: nodes={row['nodes_count']}, Ca={row['fan_in']}, "
            f"Ce={row['fan_out']}, I={row['instability']:.2f}, "
            f"coupling={row['coupling_score']}{god_tag}"
        )


def audit_layers(
    graph: dict[str, Any],
    graph_path: Path,
    base_root: Path | None = None,
    boundary_rules: list[dict[str, Any]] | None = None,
    prefix_files: list[str] | None = None,
) -> tuple[list[str], dict[str, Any]]:
    graph_label = _display_graph_path(graph_path, base_root=base_root)
    nodes = {str(n["id"]): n for n in graph.get("nodes", [])}
    links = graph.get("links", [])
    violations: list[str] = []
    for link in links:
        for msg in _check_link_violations(link, nodes):
            violations.append(f"[{graph_label}] {msg}")
    if boundary_rules:
        violations.extend(
            _check_boundary_rules(
                boundary_rules, links, nodes, graph_label, prefix_files
            )
        )
    violations.extend(_detect_directed_cycles(links, nodes, graph_label))

    stats = {
        "graph_file": graph_label,
        "nodes": len(nodes),
        "links": len(links),
        "communities": len({n.get("community", 0) for n in nodes.values()}),
    }
    return violations, stats


@dataclass
class _AuditRunConfig:
    base_root: Path
    boundary_rules: list[dict[str, Any]]
    show_metrics: bool


def _load_graphs_batch(
    graph_files: list[Path], resolved_root: Path
) -> tuple[list[tuple[Path, dict[str, Any]]], list[str], list[str]]:
    loaded: list[tuple[Path, dict[str, Any]]] = []
    errors: list[str] = []
    all_node_files: list[str] = []
    for g_path in graph_files:
        try:
            graph = load_graph(g_path)
            loaded.append((g_path, graph))
            nodes = {str(n["id"]): n for n in graph.get("nodes", [])}
            all_node_files.extend(_collect_node_files(nodes))
        except Exception as exc:
            print(f"❌ Error procesando grafo {g_path}: {exc}")
            label = _display_graph_path(g_path, base_root=resolved_root)
            errors.append(
                f"[{label}] Grafo AST corrupto o ilegible (Fail-Secure): {exc}"
            )
    return loaded, errors, all_node_files


def _audit_graphs(
    graph_files: list[Path],
    base_root: Path | None = None,
    config: _AuditRunConfig | None = None,
) -> tuple[list[str], int, int]:
    resolved_root = config.base_root if config is not None else (base_root or REPO_ROOT)
    rules = config.boundary_rules if config is not None else []
    show_metrics = config.show_metrics if config is not None else False
    loaded, all_violations, union_files = _load_graphs_batch(graph_files, resolved_root)
    shared_files = union_files if len(loaded) > 1 else None
    total_nodes = 0
    total_links = 0
    for g_path, graph in loaded:
        violations, stats = audit_layers(
            graph,
            g_path,
            base_root=resolved_root,
            boundary_rules=rules,
            prefix_files=shared_files,
        )
        total_nodes += int(stats["nodes"])
        total_links += int(stats["links"])
        all_violations.extend(violations)
        if show_metrics:
            _print_instability_table(
                str(stats["graph_file"]), compute_module_instability(graph)
            )
    return all_violations, total_nodes, total_links


def _resolve_graph_targets(
    target_root: Path | None, graph_file: Path | None
) -> list[Path]:
    if graph_file is not None:
        return [graph_file]
    return find_graph_files(target_root or REPO_ROOT)


def _load_optional_boundaries(
    target_root: Path | None, boundaries_file: Path | None
) -> tuple[list[dict[str, Any]], str | None]:
    resolved = _resolve_boundaries_path(target_root, boundaries_file)
    if resolved is None:
        return [], None
    try:
        return load_boundary_rules(resolved), None
    except Exception as exc:
        return [], f"Contrato declarativo inválido ({resolved}): {exc}"


def main(
    target_root: Path | None = None,
    exit_skipped_code: int = 0,
    graph_file: Path | None = None,
    boundaries_file: Path | None = None,
    show_metrics: bool = False,
) -> int:
    boundary_rules, boundary_err = _load_optional_boundaries(
        target_root, boundaries_file
    )
    if boundary_err is not None:
        print(f"❌ {boundary_err}")
        return 1
    graph_files = _resolve_graph_targets(target_root, graph_file)
    if not graph_files:
        print(
            "⚠️ SKIPPED [AST Topology]: 0 grafos AST (graph.json) detectados. "
            "Genera el grafo con './scripts/actualizar-grafos-graphify.sh' o "
            "'inspect_ast_blast_radius(auto_build_if_missing: true)'."
        )
        return exit_skipped_code

    config = _AuditRunConfig(
        base_root=target_root or REPO_ROOT,
        boundary_rules=boundary_rules,
        show_metrics=show_metrics,
    )
    all_violations, total_nodes, total_links = _audit_graphs(graph_files, config=config)
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
    parser.add_argument("--boundaries", type=Path, default=None)
    parser.add_argument("--metrics", action="store_true")
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    target = args.workspace if args.workspace is not None else args.target_root
    return main(
        target_root=target,
        exit_skipped_code=args.exit_skipped_code,
        graph_file=args.graph,
        boundaries_file=args.boundaries,
        show_metrics=args.metrics,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
