#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Pruebas unitarias para los validadores de gobernanza en .agents/scripts/."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_SCRIPTS = REPO_ROOT / ".agents" / "scripts"


def _load_script_module(module_name: str, filename: str):
    spec = importlib.util.spec_from_file_location(module_name, AGENTS_SCRIPTS / filename)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_verify_json_no_duplicate_keys_detects_json_and_example_collisions(tmp_path: Path) -> None:
    mod = _load_script_module("verify_json_dup", "verify_json_no_duplicate_keys.py")
    (tmp_path / "clean.json").write_text('{"a": 1, "b": {"a": 2}}', encoding="utf-8")
    (tmp_path / "graphify-out").mkdir()
    (tmp_path / "graphify-out" / "ignored.json").write_text('{"dup": 1, "dup": 2}', encoding="utf-8")
    assert mod.main(tmp_path) == 0

    (tmp_path / "i18n.json.example").write_text('{"save": "Guardar", "save": "Salvar"}', encoding="utf-8")
    assert mod.main(tmp_path) == 1


def test_verify_zero_orphan_vue_components_supports_frontend_and_tests_dirs(tmp_path: Path) -> None:
    mod = _load_script_module("verify_ui_orphans", "verify_zero_orphan_vue_components.py")
    assert mod.main(tmp_path) == 0

    comp_dir = tmp_path / "frontend" / "src" / "components"
    tests_dir = tmp_path / "frontend" / "tests"
    comp_dir.mkdir(parents=True)
    tests_dir.mkdir(parents=True)
    (comp_dir / "StatusBadge.vue").write_text("<template><span>OK</span></template>", encoding="utf-8")
    assert mod.main(tmp_path) == 1

    (tests_dir / "StatusBadge.unit.ts").write_text("// mounted StatusBadge", encoding="utf-8")
    assert mod.main(tmp_path) == 0


def test_verify_no_orphan_api_endpoints_bidirectional_and_prefix_dedup(tmp_path: Path) -> None:
    mod = _load_script_module("verify_api_orphans", "verify_no_orphan_api_endpoints.py")
    assert mod.main(tmp_path) == 0

    api_dir = tmp_path / "fastapi" / "src" / "api" / "v1"
    ui_dir = tmp_path / "vue3" / "src" / "views"
    api_dir.mkdir(parents=True)
    ui_dir.mkdir(parents=True)

    (api_dir / "routers.py").write_text(
        'from fastapi import APIRouter\n'
        'router = APIRouter(prefix="/api/v1/routers")\n'
        '@router.get("/")\n'
        'async def list_routers():\n'
        '    return []\n'
        '@router.post("/{router_id}/reboot")\n'
        'async def reboot_router(router_id: str):\n'
        '    return {}\n',
        encoding="utf-8",
    )
    (ui_dir / "RoutersView.vue").write_text(
        '<script setup>http.get("/api/v1/routers")</script>',
        encoding="utf-8",
    )
    # reboot_router is orphan on backend -> returns 1
    assert mod.main(tmp_path) == 1

    # Add frontend consumer + pre-auth whitelisted call -> returns 0
    (ui_dir / "RoutersView.vue").write_text(
        '<script setup>\n'
        'http.get("/api/v1/routers");\n'
        'http.post(`/api/v1/routers/${id}/reboot`);\n'
        'http.post("/api/v1/auth/2fa/confirm-enrollment");\n'
        '</script>',
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0


def test_verify_no_orphan_api_endpoints_dynamic_query_and_subpath_templates(tmp_path: Path) -> None:
    mod = _load_script_module("verify_no_orphan_dynamic", "verify_no_orphan_api_endpoints.py")
    api_dir = tmp_path / "fastapi" / "src" / "api" / "v1"
    ui_dir = tmp_path / "vue3" / "src" / "views"
    api_dir.mkdir(parents=True)
    ui_dir.mkdir(parents=True)

    (api_dir / "bridge.py").write_text(
        "from fastapi import APIRouter\n"
        'router = APIRouter(prefix="/api/v1")\n'
        '@router.get("/routers")\n'
        "def list_routers(): pass\n"
        '@router.get("/bridge/ports")\n'
        "def list_ports(): pass\n"
        '@router.post("/bridge/vlans/{vlan_id}")\n'
        "def save_vlan(vlan_id: str): pass\n"
        '@router.get("/files/{file_path:path}")\n'
        "def get_file(file_path: str): pass\n",
        encoding="utf-8",
    )
    (ui_dir / "BridgeView.vue").write_text(
        "<script setup>\n"
        "http.get(`/api/v1/routers${query}`);\n"
        "http.get(`/api/v1/routers${q ? '?active=1' : ''}`);\n"
        "http.get(`/api/v1/bridge/${subPath}`);\n"
        "http.post(`/api/v1/bridge/${subPath}`);\n"
        "http.get(`/api/v1/files/backups/2026/router.rsc`);\n"
        "</script>\n",
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0


def test_verify_topological_health_resolves_node_source_file_and_detects_violation(tmp_path: Path) -> None:
    mod = _load_script_module("verify_topology", "verify_topological_health.py")
    gdir = tmp_path / "fastapi" / "graphify-out"
    gdir.mkdir(parents=True)
    bad_graph = {
        "nodes": [
            {"id": "n_model", "source_file": "fastapi/src/models/user.py"},
            {"id": "n_api", "source_file": "fastapi/src/api/v1/users.py"},
        ],
        "links": [{"source": "n_model", "target": "n_api", "context": "import"}],
    }
    gpath = gdir / "graph.json"
    gpath.write_text(json.dumps(bad_graph), encoding="utf-8")
    violations, stats = mod.audit_layers(bad_graph, gpath)
    assert stats["nodes"] == 2
    assert len(violations) == 1


def test_inspect_blast_radius_computes_callers_and_callees() -> None:
    mod = _load_script_module("inspect_blast", "inspect_blast_radius.py")
    graph = {
        "nodes": [
            {"id": "a", "label": "caller_fn", "source_file": "src/a.py", "source_location": "12"},
            {"id": "b", "label": "target_fn", "source_file": "src/b.py", "source_location": "30"},
            {"id": "c", "label": "callee_fn", "source_file": "src/c.py", "source_location": "45"},
        ],
        "links": [
            {"source": "a", "target": "b", "relation": "calls"},
            {"source": "b", "target": "c", "relation": "calls"},
        ],
    }
    matches = mod.find_matching_nodes(graph, "target_fn")
    assert len(matches) == 1
    res = mod.compute_blast_radius(graph, "b")
    assert len(res["direct_callers"]) == 1
    assert len(res["outgoing_callees"]) == 1
