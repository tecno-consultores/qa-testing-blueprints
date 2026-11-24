#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Pruebas unitarias para los validadores de gobernanza en .agents/scripts/."""

from __future__ import annotations

import ast
import importlib.util
import json
import re
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
    mod = _load_script_module(
        "verify_json_no_duplicate_keys", "verify_json_no_duplicate_keys.py"
    )
    (tmp_path / "clean.json").write_text('{"a": 1, "b": {"a": 2}}', encoding="utf-8")
    (tmp_path / "graphify-out").mkdir()
    (tmp_path / "graphify-out" / "ignored.json").write_text(
        '{"dup": 1, "dup": 2}', encoding="utf-8"
    )
    (tmp_path / ".cache").mkdir()
    (tmp_path / ".cache" / "ignored.json").write_text(
        '{"dup": 1, "dup": 2}', encoding="utf-8"
    )
    assert mod.main(tmp_path) == 0
    assert mod.cli_main(["--workspace", str(tmp_path)]) == 0

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
    mod = _load_script_module(
        "verify_topological_health", "verify_topological_health.py"
    )
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
    mod = _load_script_module(
        "verify_topological_health", "verify_topological_health.py"
    )

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

    gpath.write_text(
        json.dumps(
            {
                "nodes": [
                    {"id": "ts", "source_file": "fastapi/tests/services/test_auth.py"},
                    {"id": "api", "source_file": "fastapi/src/api/v1/auth.py"},
                ],
                "links": [{"source": "ts", "target": "api"}],
            }
        ),
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0

    gpath.write_text("[]", encoding="utf-8")
    assert mod.main(tmp_path) == 1
    assert "Fail-Secure" in capsys.readouterr().out


def test_verify_alembic_orm_parity_all_branches(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = _load_script_module(
        "verify_alembic_orm_parity", "verify_alembic_orm_parity.py"
    )

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
        '# __tablename__ = "ignored_comment"\n'
        'class Order:\n    __tablename__: str = "orders"\n',
        encoding="utf-8",
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

    skill_path.write_text(
        "---\nname: demo\ndescription: >-\n  Synced skill description.\n---\n# Demo\n",
        encoding="utf-8",
    )
    pack_file = tmp_path / "catalogs" / "qaskills-pack.json"
    pack_file.write_text(
        json.dumps(
            {
                "skills": [
                    {
                        "id": "demo",
                        "path": ".agents/skills/demo/SKILL.md",
                        "description": "Old stale description",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    assert mod.run_sync(tmp_path, check_only=True)[0] == 1
    assert mod.run_sync(tmp_path)[0] == 0
    assert (
        json.loads(pack_file.read_text(encoding="utf-8"))["skills"][0]["description"]
        == "Synced skill description."
    )
    assert (
        json.loads(catalog_file.read_text(encoding="utf-8"))["skills"][0]["description"]
        == "Synced skill description."
    )


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
    assert mod.classify_common_file(".env.example")[1] == "copy_if_missing"
    assert mod.classify_common_file("instalar-hooks.sh")[1] == "copy_if_missing"
    assert mod.classify_governance_file(".agents/ACTIVE_TASK.md.example") == (
        ".agents/ACTIVE_TASK.md",
        "copy_if_missing",
    )
    assert mod.classify_governance_file(".agents/README.md") == (
        ".agents/README.md",
        "copy_if_missing",
    )

    legacy_ws = tmp_path / "legacy_common_ws"
    (legacy_ws / "scripts").mkdir(parents=True)
    (legacy_ws / "instalar-hooks.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    (legacy_ws / ".env.example").write_text("FOO=bar\n", encoding="utf-8")
    (legacy_ws / "scripts" / "publicar-mcp.sh").write_text(
        "#!/bin/sh\n", encoding="utf-8"
    )
    (legacy_ws / "scripts" / "probar-mcp-example.sh").write_text(
        "#!/bin/sh\n", encoding="utf-8"
    )
    scanned_common = mod.scan_common_files(
        legacy_ws,
        [
            {"path": ".env.example"},
            {"path": "scripts/publicar-mcp.sh"},
            {"path": "scripts/probar-mcp-example.sh"},
        ],
    )
    scanned_paths = {item["path"] for item in scanned_common}
    assert scanned_paths == {"instalar-hooks.sh"}
    assert scanned_common[0]["merge_strategy"] == "copy_if_missing"

    (legacy_ws / ".agents").mkdir(parents=True)
    (legacy_ws / ".agents" / "ACTIVE_TASK.md.example").write_text(
        "\n".join(["line"] * 41) + "\n", encoding="utf-8"
    )
    gen = legacy_ws / "scripts" / "generar-manifiesto.py"
    gen.write_text("# m\n", encoding="utf-8")
    (legacy_ws / "manifest.json").write_text("{}", encoding="utf-8")
    assert mod._check_upstream_agents_md_budget(legacy_ws) is None
    (legacy_ws / "AGENTS.md").write_text("a" * 9_000, encoding="utf-8")
    budget_errs = mod.validate_cognitive_budgets(legacy_ws)
    assert any("ACTIVE_TASK.md.example" in err for err in budget_errs)
    assert any("AGENTS.md excede" in err for err in budget_errs)

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
    orm_mod = _load_script_module(
        "verify_alembic_orm_parity", "verify_alembic_orm_parity.py"
    )
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
    mod = _load_script_module("inspect_blast_radius", "inspect_blast_radius.py")
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


def test_verify_json_no_duplicate_keys_pruning_symlinks_and_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mod = _load_script_module(
        "verify_json_no_duplicate_keys", "verify_json_no_duplicate_keys.py"
    )
    ignored = (
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
    )
    for dname in ignored:
        bad = tmp_path / dname / "dup.json"
        bad.parent.mkdir(parents=True, exist_ok=True)
        bad.write_text('{"k": 1, "k": 2}', encoding="utf-8")

    (tmp_path / "notes.txt").write_text("not json", encoding="utf-8")
    valid = tmp_path / "app" / "ok.json"
    valid.parent.mkdir()
    valid.write_text('{"ok": true}', encoding="utf-8")
    (tmp_path / "link.json").symlink_to(valid)

    candidates = mod.collect_json_candidates(tmp_path)
    assert candidates == [valid]
    assert mod.main(tmp_path) == 0

    broken = tmp_path / "app" / "broken.json"
    broken.write_text("{bad json", encoding="utf-8")
    assert mod.main(tmp_path) == 1
    assert mod.audit_json_file(tmp_path) != []

    monkeypatch.setattr(sys, "argv", ["verify_json_no_duplicate_keys.py"])
    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(
            str(AGENTS_SCRIPTS / "verify_json_no_duplicate_keys.py"),
            run_name="__main__",
        )
    assert exc_info.value.code == 0


def test_verify_topological_health_non_src_layers_and_graph_arg(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module(
        "verify_topological_health", "verify_topological_health.py"
    )
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)
    custom = tmp_path / "custom_graph.json"
    custom.write_text(
        json.dumps(
            {
                "nodes": [
                    {"id": "m", "source_file": "models/user.py"},
                    {"id": "r", "source_file": "routes/users.py"},
                    {"id": "c", "source_file": "components/common/Nav.vue"},
                    {"id": "p", "source_file": "pages/Home.vue"},
                ],
                "links": [
                    {"source": "m", "target": "r", "context": "import"},
                    {"source": "c", "target": "p", "context": "import"},
                ],
            }
        ),
        encoding="utf-8",
    )
    violations, stats = mod.audit_layers(mod.load_graph(custom), custom)
    assert stats["graph_file"] == "custom_graph.json"
    assert len(violations) == 2
    assert violations[0].startswith("[custom_graph.json] Acoplamiento inverso")
    assert violations[1].startswith("[custom_graph.json] Acoplamiento invertido UI")

    assert mod.cli_main(["--graph", str(custom)]) == 1
    assert "custom_graph.json" in capsys.readouterr().out

    custom.write_text(
        json.dumps(
            {
                "nodes": [
                    {"id": "a", "source_file": "app/api/orders.py"},
                    {"id": "s", "source_file": "app/services/orders.py"},
                ],
                "links": [{"source": "a", "target": "s"}],
            }
        ),
        encoding="utf-8",
    )
    assert mod.cli_main(["--graph", str(custom)]) == 0
    capsys.readouterr()


def test_verify_topological_health_pruning_symlinks_and_no_bare_graph(
    tmp_path: Path,
) -> None:
    mod = _load_script_module(
        "verify_topological_health", "verify_topological_health.py"
    )
    for dname in (
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
    ):
        ignored_g = tmp_path / dname / "graphify-out" / "graph.json"
        ignored_g.parent.mkdir(parents=True)
        ignored_g.write_text("{corrupt", encoding="utf-8")

    bare = tmp_path / "sub" / "graph.json"
    bare.parent.mkdir()
    bare.write_text("{corrupt", encoding="utf-8")

    real_g = tmp_path / "app" / "graphify-out" / "graph.json"
    real_g.parent.mkdir(parents=True)
    real_g.write_text('{"nodes": [], "links": []}', encoding="utf-8")

    dup_g = tmp_path / "dup" / "graphify-out" / "graph.json"
    dup_g.parent.mkdir(parents=True)
    dup_g.symlink_to(real_g)

    found = mod.find_graph_files(tmp_path)
    assert found == [real_g]
    assert mod.main(tmp_path) == 0


def test_verify_alembic_orm_parity_recursive_no_app_and_workspace(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    import inspect

    mod = _load_script_module(
        "verify_alembic_orm_parity", "verify_alembic_orm_parity.py"
    )
    assert "/app" not in inspect.getsource(mod._resolve_backend_dir)
    assert mod._resolve_backend_dir(tmp_path) == tmp_path

    models_sub = tmp_path / "backend" / "src" / "models" / "billing"
    models_sub.mkdir(parents=True)
    (models_sub / "__init__.py").write_text('__tablename__ = "bad"\n', encoding="utf-8")
    (models_sub / "base.py").write_text('__tablename__ = "bad2"\n', encoding="utf-8")
    (models_sub / "invoice.py").write_text(
        'class Invoice:\n    __tablename__ = "invoices"\n', encoding="utf-8"
    )
    alt_models = tmp_path / "backend" / "models" / "catalog"
    alt_models.mkdir(parents=True)
    (alt_models / "item.py").write_text(
        'class Item:\n    __tablename__ = "items"\n', encoding="utf-8"
    )

    mig_sub = tmp_path / "backend" / "alembic" / "versions" / "2026"
    mig_sub.mkdir(parents=True)
    (mig_sub / "__init__.py").write_text(
        'revision = "r_over_32_characters_should_be_ignored_in_init"\n',
        encoding="utf-8",
    )
    (mig_sub / "001_init.py").write_text(
        'revision = "001_init"\n'
        "def upgrade():\n"
        '    op.create_table(table_name="invoices")\n'
        '    op.create_table("items")\n'
        "def downgrade():\n"
        '    op.drop_table("invoices")\n'
        '    op.drop_table("items")\n',
        encoding="utf-8",
    )

    assert mod.cli_main(["--workspace", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "invoices" in out
    assert "items" in out


def test_verify_alembic_orm_parity_chronology_upgrade_sql_and_drops(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_script_module(
        "verify_alembic_orm_parity", "verify_alembic_orm_parity.py"
    )
    models_dir = tmp_path / "fastapi" / "src" / "models"
    models_dir.mkdir(parents=True)
    (models_dir / "models.py").write_text(
        'class Audit:\n    __tablename__ = "audit_events"\n'
        'class Session:\n    __tablename__ = "sessions"\n'
        'class Acc:\n    __tablename__ = "accounts"\n'
        'class Temp:\n    __tablename__ = "temp_items"\n',
        encoding="utf-8",
    )
    versions = tmp_path / "fastapi" / "migrations" / "versions"
    versions.mkdir(parents=True)

    # Nombre alfabético inverso: 01_drop corre DESPUÉS de 99_init por down_revision
    (versions / "99_init.py").write_text(
        'revision = "r1"\n'
        "down_revision = None\n"
        "async def upgrade():\n"
        '    op.create_table("temp_items")\n'
        '    op.create_table("users")\n'
        '    op.execute("CREATE TABLE IF NOT EXISTS public.audit_events (id INT)")\n'
        "    op.execute(sa.text('CREATE TABLE \"auth\".\"sessions\" (id INT)'))\n"
        '    op.execute(text("-- DROP TABLE audit_events\\n"'
        ' "CREATE TABLE tmp2 (i INT)"))\n',
        encoding="utf-8",
    )
    (versions / "01_drop_and_rename.py").write_text(
        'revision: str = "r2"\n'
        'down_revision = "r1"\n'
        "def upgrade():\n"
        '    op.drop_table(table_name="temp_items")\n'
        '    op.rename_table(old_table_name="users", new_table_name="accounts")\n'
        '    op.execute(statement="DROP TABLE IF EXISTS public.tmp2 CASCADE")\n',
        encoding="utf-8",
    )

    assert mod.main(tmp_path) == 1
    out = capsys.readouterr().out
    assert "'temp_items'" in out
    assert "audit_events" not in out
    assert "sessions" not in out
    assert "accounts" not in out


def test_verify_alembic_orm_parity_ast_edges_and_cycles(tmp_path: Path) -> None:
    mod = _load_script_module(
        "verify_alembic_orm_parity", "verify_alembic_orm_parity.py"
    )
    versions = tmp_path / "versions"
    versions.mkdir()
    (versions / "a_cyc.py").write_text(
        'revision = "ra"\ndown_revision = "rb"\n'
        "def upgrade():\n"
        "    helper()\n"
        "    other.create_table('ignored')\n"
        "    op.other()\n"
        "    op.create_table()\n"
        "    op.execute()\n"
        "    op.execute(dynamic_sql)\n"
        "    op.execute(helper_fn('x'))\n"
        "    op.execute(get_fn()('x'))\n",
        encoding="utf-8",
    )
    (versions / "b_cyc.py").write_text(
        'revision = "rb"\ndown_revision = ("ra",)\n'
        'def upgrade():\n    op.create_table("from_cycle")\n',
        encoding="utf-8",
    )
    (versions / "c_syntax.py").write_text(
        'revision = "rc_bad"\ndef upgrade(:\n', encoding="utf-8"
    )
    (versions / "d_no_upgrade.py").write_text(
        'revision: str\ndown_revision = 123\n', encoding="utf-8"
    )
    tables = mod.get_migrated_tables(versions)
    assert tables == {"from_cycle"}
    assert mod._iter_dir_models(tmp_path / "missing_dir") == []


def test_inspect_blast_radius_pruning_no_bare_graph_and_graph_arg(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module("inspect_blast_radius", "inspect_blast_radius.py")
    monkeypatch.setattr(mod, "REPO_ROOT", tmp_path)

    for dname in (
        ".venv",
        ".git",
        ".trivycache",
        "vendor",
        "target",
        ".pytest_cache",
        ".mypy_cache",
    ):
        ig = tmp_path / dname / "graphify-out" / "graph.json"
        ig.parent.mkdir(parents=True)
        ig.write_text('{"nodes": [], "links": []}', encoding="utf-8")

    bare = tmp_path / "bare" / "graph.json"
    bare.parent.mkdir()
    bare.write_text(
        json.dumps(
            {
                "nodes": [{"id": "x", "label": "bare_sym", "source_file": "a.py"}],
                "links": [],
            }
        ),
        encoding="utf-8",
    )

    real_g = tmp_path / "graphify-out" / "graph.json"
    real_g.parent.mkdir()
    real_g.write_text('{"nodes": [], "links": []}', encoding="utf-8")
    dup_g = tmp_path / "alias" / "graphify-out" / "graph.json"
    dup_g.parent.mkdir(parents=True)
    dup_g.symlink_to(real_g)

    assert mod.find_graph_files() == [real_g]
    assert mod.main(["bare_sym", "--graph", str(bare)]) == 0
    assert "bare_sym" in capsys.readouterr().out
    assert mod.main(["bare_sym", "--graph", str(tmp_path / "no.json")]) == 2
    capsys.readouterr()


def test_sync_governance_frontmatter_and_yaml_description_variants(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mod = _load_script_module("sync_gov_fm_variants", "sync_governance.py")
    skill = tmp_path / "SKILL.md"

    skill.write_text(
        "---\nname: demo\ndescription: >-\n  First line\n\n  Second line\ntags: [qa]\n"
        "---\n# Body\n",
        encoding="utf-8",
    )
    assert mod._extract_skill_description(skill) == "First line Second line"

    skill.write_text(
        '---\ndescription: "Quoted description"\n---\n', encoding="utf-8"
    )
    assert mod._extract_skill_description(skill) == "Quoted description"

    skill.write_text(
        "---\ndescription: 'Single quoted'\n---\n", encoding="utf-8"
    )
    assert mod._extract_skill_description(skill) == "Single quoted"

    skill.write_text(
        "---\ndescription: Plain inline value\n---\n", encoding="utf-8"
    )
    assert mod._extract_skill_description(skill) == "Plain inline value"

    skill.write_text("---\nname: unclosed\ndescription: x\n", encoding="utf-8")
    assert mod._extract_skill_description(skill) is None

    skill.write_text("---\nname: no-desc\ntags: [qa]\n---\n", encoding="utf-8")
    assert mod._extract_skill_description(skill) is None

    skill.write_text("---\ndescription:\ntags: [qa]\n---\n", encoding="utf-8")
    assert mod._extract_skill_description(skill) is None

    skill.write_text('---\ndescription: ""\n---\n', encoding="utf-8")
    assert mod._extract_skill_description(skill) is None

    orig_read = Path.read_text

    def _boom_read(self: Path, *args: Any, **kwargs: Any) -> str:
        if self == skill:
            raise OSError("cannot read skill")
        return orig_read(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", _boom_read)
    assert mod._extract_skill_description(skill) is None


def test_verify_alembic_orm_parity_handles_model_syntax_error(tmp_path: Path) -> None:
    mod = _load_script_module(
        "verify_alembic_orm_parity_syntax", "verify_alembic_orm_parity.py"
    )
    broken = tmp_path / "broken_model.py"
    broken.write_text("class Broken(:\n    __tablename__ = 'x'\n", encoding="utf-8")
    valid = tmp_path / "valid_model.py"
    valid.write_text(
        'class Valid:\n    __tablename__ = "valid_tbl"\n', encoding="utf-8"
    )
    with pytest.raises(ValueError, match="Error de sintaxis en modelo ORM"):
        mod.get_orm_tables([broken, valid])

    # M043: RENAME TO en SQL y revision duplicada falla cerrado
    ws_dup = tmp_path / "dup_rev_ws"
    (ws_dup / "backend" / "src" / "models").mkdir(parents=True)
    (ws_dup / "backend" / "alembic" / "versions").mkdir(parents=True)
    (ws_dup / "backend" / "src" / "models" / "item.py").write_text(
        'class Item:\n    __tablename__ = "items_v2"\n', encoding="utf-8"
    )
    (ws_dup / "backend" / "alembic" / "versions" / "001_init.py").write_text(
        'revision = "001"\ndown_revision = None\n'
        'def upgrade():\n    op.create_table("items_v1")\n'
        '    op.execute("ALTER TABLE items_v1 RENAME TO items_v2")\n',
        encoding="utf-8",
    )
    assert mod.main(ws_dup) == 0

    (ws_dup / "backend" / "alembic" / "versions" / "002_dup.py").write_text(
        'revision = "001"\ndown_revision = "001"\n'
        'def upgrade():\n    pass\n',
        encoding="utf-8",
    )
    assert mod.main(ws_dup) == 1

    # Cubre _extract_revision_id SyntaxError (405-407) y get_orm_tables (474-476)
    ws_syn = tmp_path / "syn_mig_ws"
    (ws_syn / "backend" / "src" / "models").mkdir(parents=True)
    (ws_syn / "backend" / "alembic" / "versions").mkdir(parents=True)
    (ws_syn / "backend" / "src" / "models" / "bad.py").write_text(
        "class Bad(:\n    __tablename__ = 'x'\n", encoding="utf-8"
    )
    (ws_syn / "backend" / "alembic" / "versions" / "003_bad.py").write_text(
        'revision = "0123456789abcdef0123456789abcdef_long"\ndef upgrade(:\n',
        encoding="utf-8",
    )
    mig_dir = ws_syn / "backend" / "alembic" / "versions"
    bad_revs = mod.verify_revision_id_lengths(mig_dir)
    assert len(bad_revs) == 1
    assert mod.main(ws_syn) == 1

    ws_orm_syn = tmp_path / "syn_orm_only_ws"
    (ws_orm_syn / "backend" / "src" / "models").mkdir(parents=True)
    (ws_orm_syn / "backend" / "alembic" / "versions").mkdir(parents=True)
    (ws_orm_syn / "backend" / "src" / "models" / "bad.py").write_text(
        "class Bad(:\n    __tablename__ = 'x'\n", encoding="utf-8"
    )
    (ws_orm_syn / "backend" / "alembic" / "versions" / "001_ok.py").write_text(
        'revision = "001"\ndef upgrade():\n    pass\n', encoding="utf-8"
    )
    assert mod.main(ws_orm_syn) == 1
    no_rev = ws_orm_syn / "no_rev.py"
    no_rev.write_text("x = 1\n", encoding="utf-8")
    assert mod._extract_revision_id(no_rev) is None


def test_validator_clis_support_workspace_and_exit_skipped_code(
    tmp_path: Path,
) -> None:
    """Estandariza --workspace y --exit-skipped-code en los 6 validadores .agents."""
    cli_specs: tuple[tuple[str, str, list[str]], ...] = (
        ("dup_cli", "verify_json_no_duplicate_keys.py", []),
        ("roadmap_cli", "verify_roadmap_consistency.py", []),
        ("topo_cli", "verify_topological_health.py", []),
        ("vue_orphan_cli", "verify_zero_orphan_vue_components.py", []),
        ("api_orphan_cli", "verify_no_orphan_api_endpoints.py", []),
        ("alembic_cli", "verify_alembic_orm_parity.py", []),
    )
    for mod_name, filename, extra_args in cli_specs:
        mod = _load_script_module(mod_name, filename)
        entry = getattr(mod, "cli_main", mod.main)
        rc_ok = entry(
            ["--workspace", str(tmp_path), "--exit-skipped-code", "0", *extra_args]
        )
        assert rc_ok == 0
        rc_skip = entry(
            ["--workspace", str(tmp_path), "--exit-skipped-code", "2", *extra_args]
        )
        assert rc_skip == 2


def test_select_tests_normalizes_pull_request_target_and_merge_group(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mapea pull_request_target y merge_group a evento pull_request y usa ..HEAD."""
    mod = _load_script_module("sel_pr_norm", "select_tests_by_blast_radius.py")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(
        ["git", "config", "user.email", "qa@example.com"], cwd=tmp_path, check=True
    )
    subprocess.run(["git", "config", "user.name", "QA Bot"], cwd=tmp_path, check=True)
    (tmp_path / "README.md").write_text("# Init\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=tmp_path, check=True)
    subprocess.run(
        ["git", "branch", "-M", "main"], cwd=tmp_path, check=True
    )
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "demo.sh").write_text(
        "#!/usr/bin/env bash\necho ok\n", encoding="utf-8"
    )
    subprocess.run(["git", "add", "scripts/demo.sh"], cwd=tmp_path, check=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "feat: script"], cwd=tmp_path, check=True
    )

    monkeypatch.chdir(tmp_path)
    for event_alias in ("pull_request_target", "merge_group"):
        assert (
            mod.main(
                [
                    "--event",
                    event_alias,
                    "--base-ref",
                    "HEAD~1",
                ]
            )
            == 0
        )
    changed = mod._resolve_git_changed_files("HEAD~1", tmp_path)
    assert "scripts/demo.sh" in changed


def test_verify_topological_health_declarative_contracts_and_metrics(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mod = _load_script_module(
        "verify_topological_health_v35", "verify_topological_health.py"
    )
    gdir = tmp_path / "graphify-out"
    gdir.mkdir(parents=True)
    gpath = gdir / "graph.json"

    graph_ok = {
        "nodes": [
            {"id": "n_api", "source_file": "src/api/routes.py"},
            {"id": "n_svc", "source_file": "src/services/billing_svc.py"},
            {"id": "n_dom", "source_file": "src/domain/invoice.py"},
            {"id": "n_bill", "source_file": "src/modules/billing/calc.py"},
            {"id": "n_pol", "source_file": "src/modules/policies/rule.py"},
            {"id": "n_shr", "source_file": "src/shared/money.py"},
        ],
        "links": [
            {"source": "n_api", "target": "n_svc", "relation": "calls"},
            {"source": "n_svc", "target": "n_dom", "relation": "calls"},
            {"source": "n_bill", "target": "n_shr", "relation": "calls"},
            {"source": "n_pol", "target": "n_shr", "relation": "calls"},
            {"source": "n_dom", "target": "n_dom", "relation": "contains"},
        ],
    }
    gpath.write_text(json.dumps(graph_ok), encoding="utf-8")

    bpath = tmp_path / ".agents" / "boundaries.json"
    bpath.parent.mkdir(parents=True)
    bpath.write_text(
        json.dumps(
            {
                "rules": [
                    {
                        "kind": "layers",
                        "root": "src",
                        "layers": ["api", "services", "domain"],
                    },
                    {
                        "kind": "independence",
                        "root": "src/modules",
                        "modules": ["billing", "policies"],
                        "shared": ["src/shared"],
                    },
                    {
                        "kind": "forbidden",
                        "rules": [
                            {
                                "source": "src/domain",
                                "forbidden": ["fastapi", "axios", "src/api"],
                            }
                        ],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    assert mod.cli_main(["--workspace", str(tmp_path), "--metrics"]) == 0
    out_ok = capsys.readouterr().out
    assert "✔ [AST Topology]" in out_ok
    assert "Métricas Martin" in out_ok

    # Zero-node fail-closed guard on layers / independence
    stale_b = tmp_path / "stale_boundaries.json"
    stale_b.write_text(
        json.dumps(
            {
                "kind": "layers",
                "root": "src",
                "layers": ["api", "ghost_layer"],
            }
        ),
        encoding="utf-8",
    )
    assert (
        mod.cli_main(["--workspace", str(tmp_path), "--boundaries", str(stale_b)]) == 1
    )
    assert "0 nodos en graph.json" in capsys.readouterr().out

    # Empty layers / independence fail-closed guard
    empty_layers_b = tmp_path / "empty_layers.json"
    empty_layers_b.write_text(
        json.dumps(
            [
                {"kind": "layers", "root": "src", "layers": []},
                {"kind": "independence", "root": "src/modules", "modules": []},
            ]
        ),
        encoding="utf-8",
    )
    assert (
        mod.cli_main(
            ["--workspace", str(tmp_path), "--boundaries", str(empty_layers_b)]
        )
        == 1
    )
    empty_out = capsys.readouterr().out
    assert "sin capas definidas" in empty_out
    assert "sin módulos definidos" in empty_out

    # Duplicate keys in boundaries.json -> fail closed
    dup_b = tmp_path / "dup_boundaries.json"
    dup_b.write_text('{"kind": "layers", "kind": "forbidden"}', encoding="utf-8")
    assert mod.main(tmp_path, boundaries_file=dup_b) == 1
    assert "Clave JSON duplicada" in capsys.readouterr().out

    # Invalid structure in boundaries.json
    bad_b = tmp_path / "bad_boundaries.json"
    bad_b.write_text('{"unknown": []}', encoding="utf-8")
    assert mod.main(tmp_path, boundaries_file=bad_b) == 1
    assert "Contrato declarativo inválido" in capsys.readouterr().out
    bad_b.write_text('"str_root"', encoding="utf-8")
    assert mod.main(tmp_path, boundaries_file=bad_b) == 1
    capsys.readouterr()

    # Violations: layers + independence + forbidden external + forbidden internal
    graph_bad = {
        "nodes": [
            *graph_ok["nodes"],
            {"id": "ext_fast", "label": "fastapi.APIRouter", "source_file": ""},
            {
                "id": "ext_axios",
                "label": "axios",
                "source_file": "node_modules/axios/index.js",
            },
        ],
        "links": [
            {"source": "n_dom", "target": "n_api", "relation": "imports"},
            {"source": "n_bill", "target": "n_pol", "relation": "calls"},
            {"source": "n_dom", "target": "ext_fast", "relation": "imports"},
            {"source": "n_dom", "target": "ext_axios", "relation": "imports"},
        ],
    }
    gpath.write_text(json.dumps(graph_bad), encoding="utf-8")
    assert mod.main(tmp_path) == 1
    out_bad = capsys.readouterr().out
    assert "Violación de capas" in out_bad
    assert "Violación de independencia" in out_bad
    assert "Dependencia prohibida" in out_bad

    # compute_module_instability: god-module + empty graph
    assert mod.compute_module_instability({"nodes": [], "links": []}) == []
    god_graph = {
        "nodes": [
            {"id": "h1", "source_file": "src/hub/a.py"},
            {"id": "h2", "source_file": "src/hub/b.py"},
            {"id": "h3", "source_file": "src/hub/c.py"},
            {"id": "c1", "source_file": "src/c1/a.py"},
            {"id": "c2", "source_file": "src/c2/a.py"},
            {"id": "t1", "source_file": "src/t1/a.py"},
            {"id": "t2", "source_file": "src/t2/a.py"},
            {"id": "iso", "source_file": "top.py"},
        ],
        "links": [
            {"source": "c1", "target": "h1", "relation": "calls"},
            {"source": "c2", "target": "h2", "relation": "calls"},
            {"source": "h1", "target": "t1", "relation": "calls"},
            {"source": "h2", "target": "t2", "relation": "calls"},
        ],
    }
    inst_rows = mod.compute_module_instability(god_graph)
    hub_row = next(r for r in inst_rows if r["module"] == "src/hub")
    assert hub_row["fan_in"] == 2
    assert hub_row["fan_out"] == 2
    assert hub_row["instability"] == 0.5
    assert hub_row["coupling_score"] == 4
    assert hub_row["god_module_candidate"] is True
    root_row = next(r for r in inst_rows if r["module"] == "(root)")
    assert root_row["instability"] == 0.0

    # Extra edge cases for 100% diff coverage in verify_topological_health
    assert mod._norm_rel_path("./src/a.py") == "src/a.py"
    assert mod._matches_prefix("", "src") is False
    assert mod._join_root_prefix("", "api") == "api"
    assert mod._matches_forbidden_token(("src/a.py", "a", "a"), "") is False
    assert mod._matches_forbidden_token(("src/a.py", "a", "a"), "src/b") is False
    assert mod._resolve_forbidden_source_and_target(
        {"source": "n_dom", "target": "n_api", "relation": "calls"},
        {
            "n_dom": {"source_file": "tests/test_a.py"},
            "n_api": {"source_file": "src/api.py"},
        },
    ) is None
    assert mod._resolve_forbidden_source_and_target(
        {"source": "n_dom", "target": "n_api", "relation": "calls"},
        {
            "n_dom": {"source_file": "src/dom.py"},
            "n_api": {"source_file": "tests/test_api.py"},
        },
    ) is None
    assert mod._module_key_from_source("fastapi/src/api/routes.py") == "fastapi/src/api"
    assert mod._module_key_from_source("scripts/clean.sh") == "scripts"
    assert mod._percentile_and_median({}, []) == (0, 0.0)
    assert mod._percentile_and_median({"a": 1}, [0])[1] == 1.0

    list_b = tmp_path / "list_boundaries.json"
    list_b.write_text(
        json.dumps(
            [{"kind": "forbidden", "rules": [{"source": "src", "forbidden": ["x"]}]}]
        ),
        encoding="utf-8",
    )
    assert len(mod.load_boundary_rules(list_b)) == 1
    bad_item_b = tmp_path / "bad_item.json"
    bad_item_b.write_text(json.dumps([{"kind": "unknown"}]), encoding="utf-8")
    with pytest.raises(ValueError, match="kind"):
        mod.load_boundary_rules(bad_item_b)

    assert mod._resolve_non_test_link_files(
        {"source": "n1", "target": "n2", "relation": "calls"},
        {"n1": {"source_file": "tests/test_a.py"}, "n2": {"source_file": "src/a.py"}},
    ) is None
    assert len(
        mod.compute_module_instability(
            {
                "nodes": [
                    {"id": "n1", "source_file": "src/a/x.py"},
                    {"id": "n2", "source_file": ""},
                ],
                "links": [{"source": "n1", "target": "n2", "relation": "calls"}],
            }
        )
    ) == 1
    mod._print_instability_table("empty", [])
