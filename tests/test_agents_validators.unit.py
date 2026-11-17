#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Pruebas unitarias para los validadores de gobernanza en .agents/scripts/."""

from __future__ import annotations

import ast
import importlib.util
import json
import runpy
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_SCRIPTS = REPO_ROOT / ".agents" / "scripts"


def _load_script_module(module_name: str, filename: str) -> Any:
    spec = importlib.util.spec_from_file_location(
        module_name, AGENTS_SCRIPTS / filename
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_verify_json_no_duplicate_keys_detects_json_and_example_collisions(
    tmp_path: Path,
) -> None:
    mod = _load_script_module("verify_json_dup", "verify_json_no_duplicate_keys.py")
    (tmp_path / "clean.json").write_text('{"a": 1, "b": {"a": 2}}', encoding="utf-8")
    (tmp_path / "graphify-out").mkdir()
    (tmp_path / "graphify-out" / "ignored.json").write_text(
        '{"dup": 1, "dup": 2}', encoding="utf-8"
    )
    assert mod.main(tmp_path) == 0

    (tmp_path / "i18n.json.example").write_text(
        '{"save": "Guardar", "save": "Salvar"}', encoding="utf-8"
    )
    assert mod.main(tmp_path) == 1


def test_verify_zero_orphan_vue_components_supports_frontend_and_tests_dirs(
    tmp_path: Path,
) -> None:
    mod = _load_script_module(
        "verify_ui_orphans", "verify_zero_orphan_vue_components.py"
    )
    assert mod.main(tmp_path) == 0

    comp_dir = tmp_path / "frontend" / "src" / "components"
    tests_dir = tmp_path / "frontend" / "tests"
    comp_dir.mkdir(parents=True)
    tests_dir.mkdir(parents=True)
    (comp_dir / "StatusBadge.vue").write_text(
        "<template><span>OK</span></template>", encoding="utf-8"
    )
    assert mod.main(tmp_path) == 1

    (tests_dir / "StatusBadge.unit.ts").write_text(
        "// mounted StatusBadge", encoding="utf-8"
    )
    assert mod.main(tmp_path) == 0


def test_verify_zero_orphan_vue_components_skip_tsx_cli_and_oserror(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_script_module(
        "verify_ui_orphans_ext", "verify_zero_orphan_vue_components.py"
    )

    assert mod.main(tmp_path) == 0
    out_empty = capsys.readouterr().out
    assert "⚠️ SKIPPED [UI Orphans]" in out_empty
    assert "✔" not in out_empty

    assert mod.main(tmp_path, exit_skipped_code=20) == 20
    assert "⚠️ SKIPPED [UI Orphans]" in capsys.readouterr().out
    assert mod.cli_main([str(tmp_path), "--exit-skipped-code", "20"]) == 20
    assert "⚠️ SKIPPED [UI Orphans]" in capsys.readouterr().out

    src_dir = tmp_path / "react-frontend" / "src" / "components"
    tests_dir = tmp_path / "react-frontend" / "tests"
    src_dir.mkdir(parents=True)
    tests_dir.mkdir(parents=True)
    (src_dir / "helpers.ts").write_text("export const x = 1;\n", encoding="utf-8")
    (src_dir / "App.unit.tsx").write_text("// unit inside src\n", encoding="utf-8")
    assert mod.main(tmp_path, exit_skipped_code=20) == 20
    assert "0 componentes UI" in capsys.readouterr().out

    (src_dir / "ActionBtn.tsx").write_text(
        "export function ActionBtn() { return null; }\n", encoding="utf-8"
    )
    bad_unit = tests_dir / "broken.unit.ts"
    bad_unit.write_text("import ActionBtn from './ActionBtn';", encoding="utf-8")
    orig_read_text = Path.read_text

    def _raise_for_broken(self: Path, *args: Any, **kwargs: Any) -> str:
        if self == bad_unit:
            raise OSError("unreadable")
        return orig_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", _raise_for_broken)
    assert mod.main(tmp_path) == 1
    assert "ActionBtn.tsx" in capsys.readouterr().out

    (tests_dir / "actionBtn.unit.tsx").write_text("// camelCase", encoding="utf-8")
    assert mod.main(tmp_path) == 0
    assert "✔ [UI Orphans]" in capsys.readouterr().out

    view_dir = tmp_path / "react-frontend" / "src" / "views"
    view_dir.mkdir(parents=True)
    (view_dir / "AboutView.vue").write_text("<template>Hi</template>", encoding="utf-8")
    (tests_dir / "views.spec.ts").write_text(
        "import AboutView from '../src/views/AboutView.vue';", encoding="utf-8"
    )
    assert mod.main(tmp_path) == 0


def test_verify_no_orphan_api_endpoints_bidirectional_and_prefix_dedup(
    tmp_path: Path,
) -> None:
    mod = _load_script_module(
        "verify_api_orphans", "verify_no_orphan_api_endpoints.py"
    )
    assert mod.main(tmp_path) == 0

    api_dir = tmp_path / "fastapi" / "src" / "api" / "v1"
    ui_dir = tmp_path / "vue3" / "src" / "views"
    api_dir.mkdir(parents=True)
    ui_dir.mkdir(parents=True)

    (api_dir / "routers.py").write_text(
        "from fastapi import APIRouter\n"
        'router = APIRouter(prefix="/api/v1/routers")\n'
        '@router.get("/")\n'
        "async def list_routers():\n"
        "    return []\n"
        '@router.post("/{router_id}/reboot")\n'
        "async def reboot_router(router_id: str):\n"
        "    return {}\n",
        encoding="utf-8",
    )
    (ui_dir / "RoutersView.vue").write_text(
        '<script setup>http.get("/api/v1/routers")</script>',
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 1

    (ui_dir / "RoutersView.vue").write_text(
        "<script setup>\n"
        'http.get("/api/v1/routers");\n'
        "http.post(`/api/v1/routers/${id}/reboot`);\n"
        'http.post("/api/v1/auth/2fa/confirm-enrollment");\n'
        "</script>",
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0


def test_verify_no_orphan_api_endpoints_dynamic_query_and_subpath_templates(
    tmp_path: Path,
) -> None:
    mod = _load_script_module(
        "verify_no_orphan_dynamic", "verify_no_orphan_api_endpoints.py"
    )
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


def test_verify_no_orphan_api_endpoints_skip_modes_and_fullstack_zero_calls(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module(
        "verify_api_skip_modes", "verify_no_orphan_api_endpoints.py"
    )

    assert mod.main(tmp_path) == 0
    out_empty = capsys.readouterr().out
    assert "⚠️ SKIPPED [API Parity]" in out_empty
    assert "✔" not in out_empty
    assert mod.cli_main([str(tmp_path), "--exit-skipped-code", "20"]) == 20
    assert "⚠️ SKIPPED [API Parity]" in capsys.readouterr().out

    # Pure backend -> SKIPPED
    back_only = tmp_path / "pure_backend"
    api_dir = back_only / "fastapi" / "src" / "api" / "v1"
    api_dir.mkdir(parents=True)
    (api_dir / "items.py").write_text(
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        '@router.get("/items")\n'
        "def get_items(): return []\n",
        encoding="utf-8",
    )
    assert mod.main(back_only, exit_skipped_code=20) == 20
    assert "Proyecto únicamente backend" in capsys.readouterr().out

    # Pure frontend -> SKIPPED
    front_only = tmp_path / "pure_frontend"
    ui_dir = front_only / "vue3" / "src" / "views"
    ui_dir.mkdir(parents=True)
    (ui_dir / "Items.vue").write_text(
        '<script setup>http.get("/api/v1/items");</script>', encoding="utf-8"
    )
    assert mod.main(front_only, exit_skipped_code=20) == 20
    assert "Proyecto únicamente frontend" in capsys.readouterr().out

    # Full-stack with frontend present + 0 calls -> MUST FAIL (no silent skip!)
    full_zero = tmp_path / "full_zero"
    (full_zero / "fastapi" / "src" / "api" / "v1").mkdir(parents=True)
    (full_zero / "vue3" / "src" / "views").mkdir(parents=True)
    (full_zero / "vue3" / "src" / "views" / "Blank.vue").write_text(
        "<template><div /></template>", encoding="utf-8"
    )
    (full_zero / "fastapi" / "src" / "api" / "v1" / "items.py").write_text(
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        '@router.get("/items")\n'
        "def get_items(): return []\n",
        encoding="utf-8",
    )
    assert mod.main(full_zero, exit_skipped_code=20) == 1
    assert "endpoint(s) backend huérfano(s)" in capsys.readouterr().out


def test_verify_no_orphan_api_endpoints_node_main_py_ignore_and_errors(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_script_module(
        "verify_api_node_extra", "verify_no_orphan_api_endpoints.py"
    )

    assert mod.normalize_route_pattern("/users/:id") == "/users/[^/]+"
    assert not mod._route_matches_call("GET", "/api/v1/a", "POST", "/api/v1/a")
    assert mod._router_var_name(mod.ast.Constant(value="x")) == ""

    fa_src = tmp_path / "fastapi" / "src"
    (fa_src / "api").mkdir(parents=True)
    (fa_src / "main.py").write_text(
        'app.add_api_route("/api/v1/ping", ping, methods=["GET"])\n'
        "Instrumentator().instrument(app)\n",
        encoding="utf-8",
    )
    (fa_src / "api" / "broken.py").write_text("def broken(:\n", encoding="utf-8")
    (fa_src / "api" / "ignored.py").write_text(
        "# api-parity-ignore\n"
        "import fastapi\n"
        'sub = fastapi.APIRouter(prefix="api/v1")\n'
        '@sub.get("internal")\n'
        "def internal(): pass\n",
        encoding="utf-8",
    )
    (fa_src / "api" / "unreadable.py").write_text(
        "from fastapi import APIRouter\n"
        "r = APIRouter()\n"
        "obj.r = APIRouter()\n"
        "def dec(f): return f\n"
        "@dec\n"
        "@r.options('/opts')\n"
        '@r.get("/api/v1/unreadable")\n'
        "def u(): pass\n",
        encoding="utf-8",
    )

    single_ui = tmp_path / "single_ui"
    (single_ui / "src" / "components").mkdir(parents=True)
    (single_ui / "src" / "components" / "Card.vue").write_text(
        '<script setup>http.get("/api/v1/only-front")</script>', encoding="utf-8"
    )
    assert mod.main(single_ui, exit_skipped_code=20) == 20
    assert "Proyecto únicamente frontend" in capsys.readouterr().out

    node_src = tmp_path / "node-backend" / "src"
    node_src.mkdir(parents=True)
    (node_src / "jobs.ts").write_text(
        "router.post('/api/v1/jobs', handler);\n", encoding="utf-8"
    )
    (node_src / "jobs.spec.ts").write_text(
        "router.get('/api/v1/ignored-spec', handler);\n", encoding="utf-8"
    )

    ui_src = tmp_path / "react-frontend" / "src"
    ui_src.mkdir(parents=True)
    (ui_src / "client.ts").write_text(
        "api.post('api/v1/jobs');\n"
        "axios.get('/api/v1/ping');\n"
        "http.get('https://external.example/data');\n"
        "http.get('/api/v1/missing-endpoint');\n",
        encoding="utf-8",
    )
    (ui_src / "client.unit.ts").write_text(
        "http.get('/api/v1/unit-ignored');\n", encoding="utf-8"
    )

    unreadable_path = fa_src / "api" / "unreadable.py"
    orig_read = Path.read_text
    calls_for_unreadable = 0

    def _fail_second_read(self: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal calls_for_unreadable
        if self == unreadable_path:
            calls_for_unreadable += 1
            if calls_for_unreadable > 1:
                raise OSError("cannot read")
        return orig_read(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", _fail_second_read)
    assert mod.main(tmp_path) == 1
    out = capsys.readouterr().out
    assert "endpoints inexistentes" in out
    assert "/api/v1/missing-endpoint" in out
    assert "/api/v1/unreadable" in out


def test_verify_topological_health_resolves_node_source_file_and_detects_violation(
    tmp_path: Path,
) -> None:
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


def test_verify_topological_health_skip_valid_ui_violation_and_corrupt(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module("verify_topology_ext", "verify_topological_health.py")

    assert mod.main(tmp_path) == 0
    out_empty = capsys.readouterr().out
    assert "⚠️ SKIPPED [AST Topology]" in out_empty
    assert "✔" not in out_empty
    assert mod.cli_main([str(tmp_path), "--exit-skipped-code", "20"]) == 20
    assert "⚠️ SKIPPED [AST Topology]" in capsys.readouterr().out

    ignored = tmp_path / "node_modules" / "pkg"
    ignored.mkdir(parents=True)
    (ignored / "graph.json").write_text("{corrupt", encoding="utf-8")

    gdir = tmp_path / "graphify-out"
    gdir.mkdir(parents=True)
    gpath = gdir / "graph.json"
    gpath.write_text(
        json.dumps(
            {
                "nodes": [
                    {"id": "a", "source_file": "fastapi/src/api/v1/x.py"},
                    {"id": "b", "source_file": "fastapi/src/services/y.py"},
                    {"id": "empty", "source_file": ""},
                ],
                "links": [
                    {"source": "a", "target": "b"},
                    {"source": "a", "target": "missing"},
                    {"source": "a", "target": "empty"},
                ],
            }
        ),
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0
    assert "✔ [AST Topology]" in capsys.readouterr().out

    gpath.write_text(
        json.dumps(
            {
                "nodes": [
                    {"id": "c", "source_file": "vue3/src/components/common/Nav.vue"},
                    {"id": "v", "source_file": "vue3/src/views/Home.vue"},
                ],
                "links": [{"source": "c", "target": "v"}],
            }
        ),
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 1
    assert "Acoplamiento invertido UI" in capsys.readouterr().out

    gpath.write_text("[]", encoding="utf-8")
    assert mod.main(tmp_path) == 1
    assert "Fail-Secure" in capsys.readouterr().out


def test_verify_alembic_orm_parity_all_branches(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_script_module("verify_orm_parity", "verify_alembic_orm_parity.py")

    assert mod.main(tmp_path) == 0
    out_empty = capsys.readouterr().out
    assert "⚠️ SKIPPED [ORM Parity]" in out_empty
    assert "✔" not in out_empty
    assert mod.cli_main([str(tmp_path), "--exit-skipped-code", "20"]) == 20
    assert "⚠️ SKIPPED [ORM Parity]" in capsys.readouterr().out

    models_dir = tmp_path / "backend" / "src" / "models"
    models_dir.mkdir(parents=True)
    (tmp_path / "backend" / "src" / "models.py").write_text(
        "class PlainHelper:\n    pass\n", encoding="utf-8"
    )
    (models_dir / "base.py").write_text("class Base: pass\n", encoding="utf-8")
    assert mod.main(tmp_path, exit_skipped_code=20) == 20
    assert "0 modelos con __tablename__" in capsys.readouterr().out

    (models_dir / "orders.py").write_text(
        'class Order:\n    __tablename__ = "orders"\n', encoding="utf-8"
    )
    (tmp_path / "backend" / "src" / "models.py").write_text(
        'class User:\n    __tablename__ = "users"\n', encoding="utf-8"
    )
    assert mod.main(tmp_path) == 1
    assert "modelos ORM huérfanos" in capsys.readouterr().out

    versions_dir = tmp_path / "backend" / "alembic" / "versions"
    versions_dir.mkdir(parents=True)
    (versions_dir / "001_init.py").write_text(
        'revision = "001_init"\n'
        "def upgrade():\n"
        '    op.create_table("users")\n'
        '    op.rename_table("legacy_orders", "orders")\n',
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0
    assert "✔ [ORM Parity]" in capsys.readouterr().out

    (versions_dir / "002_bad_rev.py").write_text(
        f'revision: str = "{"r" * 33}"\n', encoding="utf-8"
    )
    assert mod.main(tmp_path) == 1
    assert "VARCHAR(32)" in capsys.readouterr().out

    monkeypatch.setattr(mod, "_read_text_safe", lambda _path: None)
    assert mod.get_orm_tables([models_dir / "orders.py"]) == set()
    assert mod.get_migrated_tables(versions_dir) == set()
    assert mod.verify_revision_id_lengths(versions_dir) == []


def test_inspect_blast_radius_computes_callers_and_callees() -> None:
    mod = _load_script_module("inspect_blast_radius", "inspect_blast_radius.py")
    graph = {
        "nodes": [
            {
                "id": "a",
                "label": "caller_fn",
                "source_file": "src/a.py",
                "source_location": "12",
            },
            {
                "id": "b",
                "label": "target_fn",
                "source_file": "src/b.py",
                "source_location": "30",
            },
            {
                "id": "b_qualified",
                "label": "Module.target_fn",
                "source_file": "",
                "source_location": "35",
            },
            {
                "id": "b_extra",
                "label": "target_fn_extra",
                "source_file": "src/b_extra.py",
                "source_location": "40",
            },
            {
                "id": "c",
                "label": "callee_fn",
                "source_file": "src/c.py",
                "source_location": "45",
            },
        ],
        "links": [
            {"source": "a", "target": "b", "relation": "calls"},
            {"source": "a", "target": "b", "relation": "imports"},
            {"source": "c", "target": "b", "relation": "documented_in"},
            {"source": "b", "target": "c", "relation": "calls"},
        ],
    }
    matches = mod.find_matching_nodes(graph, "target_fn")
    assert len(matches) == 2
    assert len(mod.find_matching_nodes(graph, "./src/b.py")) == 1
    assert mod.find_matching_nodes({"nodes": [{"id": "x", "label": "x"}]}, "x") == [
        {"id": "x", "label": "x"}
    ]
    assert mod.find_matching_nodes({"nodes": [{"id": "x", "label": "x"}]}, "y") == []
    res = mod.compute_blast_radius(graph, "b")
    assert len(res["direct_callers"]) == 1
    assert len(res["outgoing_callees"]) == 1


def test_inspect_blast_radius_branches_overflow_corrupt_and_cli(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_script_module("inspect_blast_radius", "inspect_blast_radius.py")
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)

    assert "ALTO" in mod.assess_risk_level("verify_auth_token", 1, 1)
    assert "ALTO" in mod.assess_risk_level("rbac_guard", 1, 1)
    assert "ALTO" in mod.assess_risk_level("user_tokens", 1, 1)
    assert "ALTO" in mod.assess_risk_level("normal", 15, 1)
    assert "MODERADO" in mod.assess_risk_level("normal", 5, 1)
    assert "MODERADO" in mod.assess_risk_level("normal", 1, 4)
    assert "BAJO" in mod.assess_risk_level("normal", 1, 1)
    assert "BAJO" in mod.assess_risk_level("author", 4, 3)

    (tmp_path / "node_modules" / "ignored.py").parent.mkdir(parents=True)
    (tmp_path / "node_modules" / "ignored.py").write_text(
        "needle_sym\n", encoding="utf-8"
    )
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    for idx in range(6):
        (src_dir / f"m{idx}.py").write_text("needle_sym()\n", encoding="utf-8")

    assert mod.inspect_symbol("needle_sym") == 2
    out_no_graph = capsys.readouterr().out
    assert "No se detectó ningún grafo Graphify" in out_no_graph
    assert "+1 archivos más" in out_no_graph
    assert mod.inspect_symbol("needle_sym", allow_missing=True) == 0
    capsys.readouterr()

    gdir = tmp_path / "graphify-out"
    gdir.mkdir()
    gpath = gdir / "graph.json"
    gpath.write_text("{bad json", encoding="utf-8")
    assert mod.inspect_symbol("needle_sym") == 0
    assert "Error procesando grafo" in capsys.readouterr().out

    gpath.write_text("[]", encoding="utf-8")
    assert mod.inspect_symbol("needle_sym") == 0
    assert "Error procesando grafo" in capsys.readouterr().out

    nodes = [
        {"id": "tgt", "label": "hub_sym", "source_file": "src/hub.py"},
        {"id": "other", "label": "other_sym", "source_file": "src/other.py"},
    ]
    links: list[dict[str, str]] = []
    for idx in range(6):
        cid = f"c{idx}"
        oid = f"o{idx}"
        nodes.append(
            {
                "id": cid,
                "label": f"caller_{idx}",
                "source_file": f"src/c{idx}.py",
                "community_name": f"comm_{idx}",
            }
        )
        nodes.append(
            {
                "id": oid,
                "label": f"callee_{idx}",
                "source_file": f"src/o{idx}.py",
            }
        )
        links.append({"source": cid, "target": "tgt", "relation": "calls"})
        links.append({"source": "tgt", "target": oid, "relation": "calls"})
    links.append({"source": "tgt", "target": "other", "relation": "contains"})
    gpath.write_text(json.dumps({"nodes": nodes, "links": links}), encoding="utf-8")

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    for idx in range(6):
        (tests_dir / f"c{idx}.feature").write_text(
            "Scenario: hub_sym\n", encoding="utf-8"
        )

    monkeypatch.setattr(sys, "argv", ["inspect_blast_radius.py", "hub_sym"])
    assert mod.main() == 0
    out_rich = capsys.readouterr().out
    assert "+1 llamadores más" in out_rich
    assert "+1 dependencias salientes más" in out_rich
    assert "+1 contratos más" in out_rich

    cli_proc = subprocess.run(
        [
            sys.executable,
            str(AGENTS_SCRIPTS / "inspect_blast_radius.py"),
            "assess_risk_level",
            "--allow-missing",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert cli_proc.returncode == 0
    assert "Blast Radius" in cli_proc.stdout


def test_sync_governance_syncs_checks_and_enforces_budgets(tmp_path: Path) -> None:
    mod = _load_script_module("sync_governance", "sync_governance.py")
    (tmp_path / ".agents" / "rules").mkdir(parents=True)
    (tmp_path / ".agents" / "scripts").mkdir(parents=True)
    (tmp_path / ".agents" / "skills" / "demo").mkdir(parents=True)
    (tmp_path / "scripts").mkdir(parents=True)

    (tmp_path / "AGENTS.md").write_text("# Agents\n", encoding="utf-8")
    (tmp_path / ".agents" / "rules" / "git_closure_gate.md").write_text(
        "# Rule\n", encoding="utf-8"
    )
    (tmp_path / ".agents" / "scripts" / "sync_governance.py").write_text(
        "#!/usr/bin/env python3\n", encoding="utf-8"
    )
    (tmp_path / ".agents" / "skills" / "demo" / "SKILL.md").write_text(
        "# Demo Skill\n", encoding="utf-8"
    )
    (tmp_path / ".agents" / "ACTIVE_TASK.md").write_text(
        "**Estado:** `COMPLETED (100%)`\n", encoding="utf-8"
    )
    (tmp_path / "lefthook.yml").write_text(
        "pre-commit:\n  parallel: true\n", encoding="utf-8"
    )

    code, msg = mod.run_sync(tmp_path)
    assert code == 0
    assert "manifest.json sincronizado" in msg
    manifest_first = (tmp_path / "manifest.json").read_text(encoding="utf-8")

    code2, _ = mod.run_sync(tmp_path)
    assert code2 == 0
    assert (tmp_path / "manifest.json").read_text(encoding="utf-8") == manifest_first

    assert mod.run_sync(tmp_path, check_only=True)[0] == 0
    (tmp_path / "AGENTS.md").write_text("# Agents modified\n", encoding="utf-8")
    code_bad, err_bad = mod.run_sync(tmp_path, check_only=True)
    assert code_bad == 1
    assert "desincronizado" in err_bad

    assert mod.run_sync(tmp_path)[0] == 0
    (tmp_path / "manifest.json").write_text(
        '{"schema_version": "1", "schema_version": "2"}', encoding="utf-8"
    )
    code_dup, err_dup = mod.run_sync(tmp_path, check_only=True)
    assert code_dup == 1
    assert "Clave JSON duplicada" in err_dup
    assert mod.run_sync(tmp_path)[0] == 1

    (tmp_path / "manifest.json").unlink()
    assert mod.run_sync(tmp_path)[0] == 0
    (tmp_path / ".agents" / "skills" / "demo" / "SKILL.md").write_text(
        "x" * 20480, encoding="utf-8"
    )
    code_skill, err_skill = mod.run_sync(tmp_path, check_only=True)
    assert code_skill == 1
    assert "presupuesto cognitivo" in err_skill

    (tmp_path / ".agents" / "skills" / "demo" / "SKILL.md").write_text(
        "# OK\n", encoding="utf-8"
    )
    tactical_dir = tmp_path / ".agents" / "skills" / "tactical-patterns-11x"
    tactical_dir.mkdir(parents=True)
    (tactical_dir / "SKILL.md").write_text("x" * 2400, encoding="utf-8")
    (tmp_path / ".agents" / "schemas").mkdir(parents=True)
    (tmp_path / ".agents" / "schemas" / "session_checkpoint.schema.json").write_text(
        '{"type": "object"}\n', encoding="utf-8"
    )
    (
        tmp_path / ".agents" / "rules" / "active_task_and_planning_resilience.md"
    ).write_text("# Rule\n", encoding="utf-8")
    (tmp_path / ".agents" / "ACTIVE_TASK.md").write_text(
        "\n".join(["line"] * 41) + "\n", encoding="utf-8"
    )
    code_task, err_task = mod.run_sync(tmp_path, check_only=True)
    assert code_task == 1
    assert "límite compacto" in err_task

    (tmp_path / ".agents" / "ACTIVE_TASK.md").write_text(
        "**Estado:** `COMPLETED (100%)`\n", encoding="utf-8"
    )
    (tactical_dir / "SKILL.md").write_text("x" * 2560, encoding="utf-8")
    code_tact_ok, _ = mod.run_sync(tmp_path)
    assert code_tact_ok == 0

    (tactical_dir / "SKILL.md").write_text("x" * 2561, encoding="utf-8")
    (
        tmp_path / ".agents" / "rules" / "active_task_and_planning_resilience.md"
    ).write_text("\n".join(["r"] * 26) + "\n", encoding="utf-8")
    code_tact, err_tact = mod.run_sync(tmp_path, check_only=True)
    assert code_tact == 1
    assert "tactical-patterns-11x/SKILL.md" in err_tact
    assert "active_task_and_planning_resilience.md" in err_tact

    (tactical_dir / "SKILL.md").write_text("# Tactical\n", encoding="utf-8")
    (
        tmp_path / ".agents" / "rules" / "active_task_and_planning_resilience.md"
    ).write_text("# Rule\n", encoding="utf-8")
    assert mod.run_sync(tmp_path)[0] == 0
    assert ".agents/schemas/session_checkpoint.schema.json" in (
        tmp_path / "manifest.json"
    ).read_text(encoding="utf-8")


def test_sync_governance_with_ast_invokes_script_on_changes(tmp_path: Path) -> None:
    mod = _load_script_module("sync_governance_ast", "sync_governance.py")
    (tmp_path / ".agents" / "skills" / "demo").mkdir(parents=True)
    (tmp_path / "scripts").mkdir(parents=True)
    marker = tmp_path / "ast_ran.flag"
    ast_script = tmp_path / "scripts" / "actualizar-grafos-graphify.sh"
    ast_script.write_text(
        f"#!/usr/bin/env bash\ntouch '{marker}'\n", encoding="utf-8"
    )
    ast_script.chmod(0o755)

    code, _ = mod.run_sync(tmp_path, with_ast=True)
    assert code == 0
    assert marker.is_file()


def test_sync_governance_syncs_skillsllm_catalog(tmp_path: Path) -> None:
    mod = _load_script_module("sync_governance_catalog", "sync_governance.py")
    skill_path = tmp_path / ".agents" / "skills" / "demo" / "SKILL.md"
    skill_path.parent.mkdir(parents=True)
    skill_path.write_text("# Demo Skill v2\n", encoding="utf-8")
    (tmp_path / "python").mkdir(parents=True)
    (tmp_path / "python" / "README.md").write_text("# Python EN\n", encoding="utf-8")
    (tmp_path / "python" / "README.es.md").write_text("# Python ES\n", encoding="utf-8")
    (tmp_path / "catalogs").mkdir(parents=True)
    catalog_file = tmp_path / "catalogs" / "skillsllm-manifest.json"
    catalog_file.write_text(
        json.dumps(
            {
                "skills": [
                    {
                        "id": "demo",
                        "path": ".agents/skills/demo/SKILL.md",
                        "size_bytes": 1,
                        "sha256": "0" * 64,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    code_chk, err_chk = mod.run_sync(tmp_path, check_only=True)
    assert code_chk == 1
    assert "skillsllm-manifest.json desincronizado" in err_chk

    code_fix, _ = mod.run_sync(tmp_path)
    assert code_fix == 0
    assert mod.run_sync(tmp_path, check_only=True)[0] == 0
    updated = json.loads(catalog_file.read_text(encoding="utf-8"))
    assert updated["skills"][0]["size_bytes"] == skill_path.stat().st_size
    assert updated["skills"][0]["sha256"] == mod.compute_sha256(skill_path)
    generated_manifest = json.loads(
        (tmp_path / "manifest.json").read_text(encoding="utf-8")
    )
    py_stack = generated_manifest["stacks"]["python"]
    assert py_stack["readme_es"] == "python/README.es.md"
    assert len(py_stack["readme_sha256"]) == 64
    assert len(py_stack["readme_es_sha256"]) == 64


def test_sync_governance_classifiers_compare_git_and_cli_branches(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module("sync_governance_branches", "sync_governance.py")

    assert mod.get_blueprint_version(tmp_path) == mod.DEFAULT_BLUEPRINT_VERSION
    (tmp_path / "mcp-server").mkdir()
    (tmp_path / "mcp-server" / "package.json").write_text("{bad", encoding="utf-8")
    (tmp_path / "CHANGELOG.md").write_text("## [9.8.7] - 2026\n", encoding="utf-8")
    assert mod.get_blueprint_version(tmp_path) == "9.8.7"

    assert mod.classify_stack_file(Path("gitignore.example"))[1] == (
        "append_missing_lines"
    )
    assert mod.classify_stack_file(Path("npmrc.example"))[1] == "append_missing_lines"
    assert mod.classify_stack_file(Path("docker-compose.qa.yml"))[1] == (
        "copy_if_missing_or_update_qa"
    )
    assert mod.classify_stack_file(Path("pytest.ini.example"))[1] == "surgical_merge"
    assert (
        mod.classify_stack_file(Path("test/sample.unit.py.example"))[1]
        == "copy_if_missing"
    )
    assert mod.classify_stack_file(Path("test/flow.feature"))[1] == "copy_if_missing"
    assert mod.classify_stack_file(Path("scripts/run.sh"))[1] == (
        "overwrite_executable"
    )
    assert mod.classify_stack_file(Path("notes.txt"))[1] == "copy_if_missing"
    assert mod.classify_common_file("scripts/auditar-infra.sh")[1] == (
        "overwrite_executable"
    )
    assert mod.classify_common_file(".trivy.yaml")[1] == "copy_if_missing"
    assert mod.classify_governance_file(".agents/ACTIVE_TASK.md.example") == (
        ".agents/ACTIVE_TASK.md",
        "copy_if_missing",
    )

    exp = {
        "schema_version": "0.0.1",
        "stacks": {
            "python": {
                "description": "old",
                "readme": "old.md",
                "files": [
                    {
                        "path": "a.py",
                        "sha256": "1",
                        "size_bytes": 1,
                        "target_name": "a.py",
                        "merge_strategy": "copy_if_missing",
                    },
                    {"path": "gone.py"},
                ],
            },
            "ghost": {"files": []},
            "php": "not-a-dict",
        },
    }
    act = {
        "schema_version": "1.0.0",
        "stacks": {
            "python": {
                "description": "new",
                "readme": "new.md",
                "files": [
                    {
                        "path": "a.py",
                        "sha256": "2",
                        "size_bytes": 2,
                        "target_name": "b.py",
                        "merge_strategy": "surgical_merge",
                    }
                ],
            },
            "php": {"files": []},
            "vue3": {"files": []},
        },
    }
    diffs = mod.compare_manifests(exp, act)
    joined = "\n".join(diffs)
    assert "Metadato raíz 'schema_version'" in joined
    assert "Stack faltante" in joined
    assert "Stack inexistente" in joined
    assert "inválido" in joined
    assert "target_name discrepante" in joined
    assert "merge_strategy discrepante" in joined
    assert "ausente en disco" in joined

    bad_stacks_diffs = mod.compare_manifests({"stacks": "invalid"}, {"stacks": {}})
    assert any("no es un objeto válido" in d for d in bad_stacks_diffs)

    (tmp_path / "ghost_file.py").write_text("x = 1\n", encoding="utf-8")
    preserved_manifest = {
        "stacks": {
            "bash-scripts": {
                "description": "Bash",
                "readme": "bash-scripts/README.md",
                "files": [{"path": "ghost_file.py"}],
            }
        }
    }
    built = mod.build_expected_manifest(
        tmp_path, preserved_manifest, "2026-01-01T00:00:00Z"
    )
    assert built["stacks"]["bash-scripts"]["files"][0]["path"] == "ghost_file.py"
    arr_json = tmp_path / "array.json"
    arr_json.write_text("[]", encoding="utf-8")
    with pytest.raises(TypeError):
        mod.load_manifest_strict(arr_json)

    # Structural git changes + failing AST script + CLI main()
    git_repo = tmp_path / "git_repo"
    (git_repo / "scripts").mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=git_repo, check=True)
    (git_repo / "README.md").write_text("# Doc only\n", encoding="utf-8")
    assert mod.has_structural_git_changes(git_repo) is False
    (git_repo / "app.py").write_text("x = 1\n", encoding="utf-8")
    assert mod.has_structural_git_changes(git_repo) is True

    ast_fail = git_repo / "scripts" / "actualizar-grafos-graphify.sh"
    ast_fail.write_text(
        "#!/usr/bin/env bash\necho boom >&2\nexit 1\n", encoding="utf-8"
    )
    ast_fail.chmod(0o755)
    assert mod.run_sync(git_repo)[0] == 0
    rc_ast, msg_ast = mod.run_sync(git_repo, with_ast=True)
    assert rc_ast == 1
    assert "Fallo al actualizar grafos AST" in msg_ast

    assert mod.main(["--repo-root", str(git_repo), "--check"]) == 0
    assert "manifest.json sincronizado" in capsys.readouterr().out

    (git_repo / "catalogs").mkdir()
    (git_repo / "catalogs" / "skillsllm-manifest.json").write_text(
        "{bad", encoding="utf-8"
    )
    cat_errs = mod.sync_skillsllm_catalog(git_repo, True)
    assert any("Error al validar" in err for err in cat_errs)


def test_f1_5_remaining_edge_branches_and_entrypoint_guards(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    orm_mod = _load_script_module("orm_edge", "verify_alembic_orm_parity.py")
    assert (
        orm_mod._resolve_backend_dir(orm_mod._DEFAULT_REPO_ROOT)
        == orm_mod._DEFAULT_REPO_ROOT
    )
    assert orm_mod._read_text_safe(tmp_path) is None

    api_mod = _load_script_module("api_edge", "verify_no_orphan_api_endpoints.py")
    assert api_mod._is_router_factory(ast.Constant(value=1)) is False
    assign_non_router = ast.parse("x = helper()").body[0]
    assert isinstance(assign_non_router, ast.Assign)
    assert api_mod._extract_router_assignment(assign_non_router) is None
    attr_expr = ast.parse("self.router").body[0]
    assert isinstance(attr_expr, ast.Expr)
    assert api_mod._router_var_name(attr_expr.value) == "router"

    vue_mod = _load_script_module("vue_edge", "verify_zero_orphan_vue_components.py")
    fe_src = tmp_path / "frontend" / "src" / "components"
    fe_src.mkdir(parents=True)
    (fe_src / "InlineCard.vue").write_text("<template>ok</template>", encoding="utf-8")
    (fe_src / "InlineCard.unit.ts").write_text("// ok", encoding="utf-8")
    assert vue_mod.main(tmp_path) == 0

    for fname in (
        "verify_alembic_orm_parity.py",
        "verify_no_orphan_api_endpoints.py",
        "verify_topological_health.py",
        "verify_zero_orphan_vue_components.py",
    ):
        monkeypatch.setattr(sys, "argv", [fname, str(tmp_path)])
        with pytest.raises(SystemExit) as exc_info:
            runpy.run_path(str(AGENTS_SCRIPTS / fname), run_name="__main__")
        assert exc_info.value.code == 0


def test_sync_governance_porcelain_z_renames_spaces_and_ast_timeout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mod = _load_script_module("sync_gov_f2_9", "sync_governance.py")
    assert mod.has_structural_git_changes(tmp_path) is False

    git_repo = tmp_path / "repo"
    (git_repo / "scripts").mkdir(parents=True)
    (git_repo / "docs").mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=git_repo, check=True)
    subprocess.run(
        ["git", "config", "user.email", "qa@example.com"], cwd=git_repo, check=True
    )
    subprocess.run(["git", "config", "user.name", "QA Bot"], cwd=git_repo, check=True)

    (git_repo / "old.py").write_text("x = 1\n", encoding="utf-8")
    (git_repo / "docs" / "old note.md").write_text("# Old\n", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=git_repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=git_repo, check=True)

    subprocess.run(
        ["git", "mv", "docs/old note.md", "docs/new note.md"],
        cwd=git_repo,
        check=True,
    )
    assert mod.has_structural_git_changes(git_repo) is False

    subprocess.run(
        ["git", "mv", "old.py", "new name.py"],
        cwd=git_repo,
        check=True,
    )
    assert mod.has_structural_git_changes(git_repo) is True

    assert mod._extract_porcelain_z_paths(b"R  new.md\x00old.py\x00") == [
        "new.md",
        "old.py",
    ]
    assert mod._is_ignored_git_path("graphify-out") is True
    assert mod._is_ignored_git_path("graphify-out/graph.json") is True

    ast_script = git_repo / "scripts" / "actualizar-grafos-graphify.sh"
    ast_script.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    ast_script.chmod(0o755)

    def _fail_git(*_args: Any, **_kwargs: Any) -> Any:
        return subprocess.CompletedProcess(
            args=[], returncode=1, stdout=b"", stderr=b""
        )

    monkeypatch.setattr(mod.subprocess, "run", _fail_git)
    assert mod.has_structural_git_changes(git_repo) is False

    def _raise_timeout(*_args: Any, **_kwargs: Any) -> Any:
        raise subprocess.TimeoutExpired(cmd="stub", timeout=15)

    monkeypatch.setattr(mod.subprocess, "run", _raise_timeout)
    assert mod.has_structural_git_changes(git_repo) is False
    errs = mod.refresh_ast_if_needed(git_repo, manifest_changed=True)
    assert len(errs) == 1
    assert "Tiempo de espera agotado" in errs[0]


def test_inspect_blast_radius_edge_branches(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import re
    import runpy

    mod = _load_script_module("inspect_blast_radius_edges", "inspect_blast_radius.py")
    outside = tmp_path / "outside"
    outside.mkdir()
    assert mod._stack_prefix(outside / "graph.json") == ""
    assert mod._to_repo_rel_path("", "unknown") == "unknown"
    assert mod._rel_display_path(outside / "g.json") == "g.json"
    assert (
        mod._file_matches_pattern(tmp_path / "does_not_exist.py", re.compile("x"))
        is False
    )

    repo_root = tmp_path / "repo"
    g1 = repo_root / "graphify-out" / "graph.json"
    g1.parent.mkdir(parents=True)
    g1.write_text('{"nodes": [], "links": []}', encoding="utf-8")
    g_dup_dir = repo_root / "z_dup"
    g_dup_dir.mkdir()
    (g_dup_dir / "graph.json").symlink_to(g1)

    monkeypatch.setattr(mod, "REPO_ROOT", repo_root)
    found = mod.find_graph_files()
    assert found == [g1]

    monkeypatch.setattr(sys, "argv", ["inspect_blast_radius.py", "--help"])
    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(
            str(REPO_ROOT / ".agents" / "scripts" / "inspect_blast_radius.py"),
            run_name="__main__",
        )
    assert exc_info.value.code == 0


def test_sync_governance_edge_branches(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import json

    mod = _load_script_module("sync_governance_edges", "sync_governance.py")
    pkg = tmp_path / "mcp-server" / "package.json"
    pkg.parent.mkdir(parents=True)
    pkg.write_text("[]", encoding="utf-8")
    assert mod._version_from_package_json(pkg) is None

    pkg.write_text('{"version": "not-semver"}', encoding="utf-8")
    assert mod._version_from_package_json(pkg) is None

    pkg.write_text('{"version": "4.2.0"}', encoding="utf-8")
    assert mod.get_blueprint_version(tmp_path) == "4.2.0"

    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text("# Changelog\n", encoding="utf-8")
    orig_read = Path.read_text

    def _boom_read(self: Path, *args: Any, **kwargs: Any) -> str:
        if self == changelog:
            raise OSError("unreadable")
        return orig_read(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", _boom_read)
    assert mod._version_from_changelog(changelog) is None
    monkeypatch.undo()

    stack_dir = tmp_path / "python" / "__pycache__"
    stack_dir.mkdir(parents=True)
    ignored_pyc = stack_dir / "x.py"
    ignored_pyc.write_text("x = 1\n", encoding="utf-8")
    assert mod.scan_stack(tmp_path, "python") == []

    (tmp_path / "python" / "keep.py").write_text("x = 1\n", encoding="utf-8")
    rebuilt_bad = mod._rebuild_missing_stack_files(tmp_path, {"files": "bad"})
    assert rebuilt_bad == []
    rebuilt_mixed = mod._rebuild_missing_stack_files(
        tmp_path, {"files": ["not-dict", {"path": "python/keep.py"}]}
    )
    assert [e["path"] for e in rebuilt_mixed] == ["python/keep.py"]

    skill_as_dir = tmp_path / ".agents" / "skills" / "weird" / "SKILL.md"
    skill_as_dir.mkdir(parents=True)
    assert mod._collect_skill_budget_errors(tmp_path) == []

    # Mantener uso de json para linters si aplica
    assert json.loads('{"ok": true}')["ok"] is True
