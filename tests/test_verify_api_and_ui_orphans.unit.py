# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para paridad API por stack/AST/fetch y componentes UI."""

from __future__ import annotations

import ast
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_SCRIPTS = REPO_ROOT / ".agents" / "scripts"


def _load_mod(_alias: str, filename: str) -> ModuleType:
    mod_name = filename.removesuffix(".py")
    path = AGENTS_SCRIPTS / filename
    spec = importlib.util.spec_from_file_location(mod_name, path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


def _write_files(root: Path, files: dict[str, str]) -> None:
    for rel, content in files.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def test_api_stack_pairing_isolates_vue_fastapi_from_react_node(
    tmp_path: Path,
) -> None:
    mod = _load_mod("api_pair_ok", "verify_no_orphan_api_endpoints.py")
    paired_ok = tmp_path / "paired_ok"
    _write_files(
        paired_ok,
        {
            "vue3/src/Items.vue": '<script setup>fetch("/api/v1/items")</script>',
            "fastapi/src/api/v1/items.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get("/items")\n'
                "def list_items(): return []\n"
            ),
            "react-frontend/src/Jobs.tsx": (
                "export const run = () => fetch('/api/v1/jobs', { method: 'POST' });\n"
            ),
            "node-backend/src/jobs.ts": "router.post('/api/v1/jobs', handler);\n",
        },
    )
    assert mod.main(paired_ok) == 0

    cross_wired = tmp_path / "cross_wired"
    _write_files(
        cross_wired,
        {
            "vue3/src/App.vue": '<script setup>http.get("/api/v1/jobs")</script>',
            "fastapi/src/api/v1/items.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get("/items")\n'
                "def list_items(): return []\n"
            ),
            "react-frontend/src/App.tsx": "http.get('/api/v1/items');\n",
            "node-backend/src/jobs.ts": "router.get('/api/v1/jobs', handler);\n",
        },
    )
    assert mod.main(cross_wired) == 1


def test_api_generic_pair_and_public_extractors(tmp_path: Path) -> None:
    mod = _load_mod("api_generic", "verify_no_orphan_api_endpoints.py")
    generic_fe_be = tmp_path / "generic_fe_be"
    _write_files(
        generic_fe_be,
        {
            "frontend/src/api.ts": (
                "fetch('/api/v1/ping');\nfetch('/api/v1/tasks', { method: 'POST' });\n"
            ),
            "backend/src/main.py": (
                'app.add_api_route("/api/v1/ping", ping, methods=["GET"])\n'
            ),
            "backend/src/tasks.ts": "app.post('/api/v1/tasks', createTask);\n",
        },
    )
    assert mod.main(generic_fe_be) == 0
    assert (
        len(
            mod._extract_fastapi_routes_from_src(
                generic_fe_be / "backend" / "src", generic_fe_be
            )
        )
        == 1
    )
    assert (
        len(
            mod._extract_node_routes_from_dirs(
                [generic_fe_be / "backend" / "src"], generic_fe_be
            )
        )
        == 1
    )
    assert (
        len(
            mod._extract_frontend_calls_from_dirs(
                [generic_fe_be / "frontend" / "src"], generic_fe_be
            )
        )
        == 2
    )

    generic_src = tmp_path / "generic_src"
    _write_files(
        generic_src,
        {
            "src/components/Box.tsx": (
                "export const Box = () => { fetch('/api/v1/box'); return null; };\n"
            ),
            "src/api/box.py": (
                "from fastapi import APIRouter\n"
                'router = APIRouter(prefix="/api/v1")\n'
                '@router.get("/box")\n'
                "def get_box(): return {}\n"
            ),
        },
    )
    assert mod.main(generic_src) == 0
    assert (
        len(
            mod._extract_frontend_calls_from_dirs(
                [generic_src / "src"], generic_src
            )
        )
        == 1
    )
    assert mod._find_fastapi_src(tmp_path / "empty_re") is None
    assert mod._detect_frontend_dirs(tmp_path / "empty_fe") == []

    # Comentarios JS/TS y dirs tests/dist/coverage/node_modules no dan falsos positivos
    commented_ws = tmp_path / "commented_ws"
    _write_files(
        commented_ws,
        {
            "node-backend/src/routes.ts": (
                "// router.get('/api/v1/commented-be', h);\n"
                "/* router.post('/api/v1/block-be', h); */\n"
                "router.get('/api/v1/live', h);\n"
            ),
            "node-backend/src/tests/ignored.ts": (
                "router.get('/api/v1/test-dir-be', h);\n"
            ),
            "react-frontend/src/client.ts": (
                "// fetch('/api/v1/commented-fe');\n"
                "/* axios.post('/api/v1/block-fe'); */\n"
                "fetch('/api/v1/live');\n"
            ),
            "react-frontend/src/dist/bundle.js": (
                "fetch('/api/v1/dist-ignored');\n"
            ),
        },
    )
    assert mod.main(commented_ws) == 0


def test_api_per_line_parity_ignore_does_not_skip_whole_file(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod("api_line_ignore", "verify_no_orphan_api_endpoints.py")
    repo_be = tmp_path / "repo_be"
    _write_files(
        repo_be,
        {
            "vue3/src/api.ts": (
                "fetch('/api/v1/used');\n"
                "fetch('/api/v1/fe-ignored'); // api-parity-ignore\n"
                "fetch('/api/v1/fe-unignored');\n"
                "// api-parity-ignore\n"
                "await fetch('/api/v1/fe-above', {\n"
                "  method: 'POST',\n"
                "});\n"
                "await fetch('/api/v1/fe-inside', {\n"
                "  method: 'PUT', // api-parity-ignore\n"
                "});\n"
            ),
            "fastapi/src/api/v1/routes.py": (
                "# api-parity-ignore\n"
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get("/used")\n'
                "def used(): return {}\n"
                "# api-parity-ignore\n"
                '@router.get("/be-above")\n'
                "def be_above(): return {}\n"
                '@router.get("/be-inline")  # api-parity-ignore\n'
                "def be_inline(): return {}\n"
                '@router.get("/be-unignored")\n'
                "def be_unignored(): return {}\n"
            ),
        },
    )
    assert mod.main(repo_be) == 1
    out = capsys.readouterr().out
    assert "/api/v1/fe-unignored" in out
    assert "/api/v1/be-unignored" in out
    for suppressed in (
        "/api/v1/fe-ignored",
        "/api/v1/fe-above",
        "/api/v1/fe-inside",
        "/api/v1/be-above",
        "/api/v1/be-inline",
    ):
        assert suppressed not in out


def test_api_include_router_cross_module_nested_and_cycle_safe(
    tmp_path: Path,
) -> None:
    mod = _load_mod("api_include_router", "verify_no_orphan_api_endpoints.py")
    _write_files(
        tmp_path,
        {
            "fastapi/src/main.py": (
                "import os\n"
                "import nonexistent as _nx\n"
                "from fastapi import FastAPI\n"
                "from api import api_router, reexported_router\n"
                "import api.extra as extra_mod\n"
                "import api.direct_mod\n"
                "app = FastAPI()\n"
                'app.include_router(api_router, prefix="/api/v1")\n'
                'app.include_router(reexported_router, prefix="/api/v1/re")\n'
                'app.include_router(extra_mod.router, prefix="/api/v1/extra")\n'
                'app.include_router(api.direct_mod.router, prefix="/api/v1/direct")\n'
                'app.include_router(unknown_obj.router, prefix="/api/v1/ignored")\n'
                'app.include_router(tags=["x"])\n'
            ),
            "fastapi/src/api/__init__.py": (
                "from fastapi import APIRouter\n"
                "from . import users\n"
                "from .sub import sub_router as admin_sub\n"
                "from .reexport import router as reexported_router\n"
                "api_router = APIRouter()\n"
                'api_router.include_router(users.router, prefix="/users")\n'
                'api_router.include_router(router=admin_sub, prefix="/admin")\n'
            ),
            "fastapi/src/api/reexport.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get(path="/ok")\n'
                "def ok(): return {}\n"
            ),
            "fastapi/src/api/direct_mod.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get("/item")\n'
                "def direct_item(): return {}\n"
            ),
            "fastapi/src/api/users.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                'local_sub = APIRouter(prefix="/prefs")\n'
                '@router.get("/")\n'
                "def list_users(): return []\n"
                '@router.get("/{user_id}")\n'
                "def get_user(user_id: str): return {}\n"
                '@local_sub.patch("")\n'
                "def patch_prefs(): return {}\n"
                'router.include_router(local_sub, prefix="/me")\n'
            ),
            "fastapi/src/api/sub.py": (
                "from fastapi import APIRouter\n"
                'sub_router = APIRouter(prefix="/roles")\n'
                '@sub_router.post("/assign")\n'
                "def assign_role(): return {}\n"
            ),
            "fastapi/src/api/extra.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                '@router.get("/ping")\n'
                "def ping(): return {}\n"
            ),
            "vue3/src/client.ts": (
                "fetch('/api/v1/users');\n"
                "fetch(`/api/v1/users/${uid}`);\n"
                "fetch('/api/v1/users/me/prefs', { method: 'PATCH' });\n"
                "fetch('/api/v1/admin/roles/assign', { method: 'POST' });\n"
                "fetch('/api/v1/extra/ping');\n"
                "fetch('/api/v1/re/ok');\n"
                "fetch('/api/v1/direct/item');\n"
            ),
        },
    )
    assert mod.main(tmp_path) == 0

    cycle_repo = tmp_path / "cycle_repo"
    _write_files(
        cycle_repo,
        {
            "fastapi/src/api/cycle.py": (
                "from fastapi import APIRouter\n"
                "r1 = APIRouter()\n"
                "r2 = APIRouter()\n"
                "r1.include_router(r2)\n"
                "r2.include_router(r1)\n"
                '@r1.get("/api/v1/loop")\n'
                "def loop(): return {}\n"
            ),
            "vue3/src/loop.ts": "fetch('/api/v1/loop');\n",
        },
    )
    assert mod.main(cycle_repo) == 0


def test_api_multi_method_api_route_and_add_api_route(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod("api_multi_method", "verify_no_orphan_api_endpoints.py")
    _write_files(
        tmp_path,
        {
            "fastapi/src/main.py": (
                "from fastapi import FastAPI\n"
                "app = FastAPI()\n"
                "app.add_api_route(dyn_path, dyn_fn)\n"
                'app.add_api_route("/api/v1/plain", plain_fn)\n'
                'app.add_api_route("/api/v1/direct", fn, methods=["GET", "PATCH"])\n'
            ),
            "fastapi/src/api/v1/multi.py": (
                "from fastapi import APIRouter\n"
                "def dec(): return lambda f: f\n"
                "router = APIRouter()\n"
                "bad_router = APIRouter(prefix=123)\n"
                "@dec()\n"
                '@router.api_route("/items", methods=["GET", "POST"], tags=["m"])\n'
                "def items(): return {}\n"
                '@router.api_route("/pair", methods=("PUT", "DELETE"))\n'
                "def pair(): return {}\n"
                '@router.api_route("/single", methods="POST")\n'
                "def single(): return {}\n"
                '@router.api_route("/kw", name="kw_route")\n'
                "def kw_route(): return {}\n"
                '@router.api_route("/default")\n'
                "def default_route(): return {}\n"
            ),
            "vue3/src/api.ts": (
                "fetch('/api/v1/plain');\n"
                "fetch('/api/v1/direct');\n"
                "fetch('/api/v1/direct', { method: 'PATCH' });\n"
                "fetch('/api/v1/items');\n"
                "fetch('/api/v1/pair', { method: 'PUT' });\n"
                "fetch('/api/v1/pair', { method: 'DELETE' });\n"
                "fetch('/api/v1/single', { method: 'POST' });\n"
                "fetch('/api/v1/kw');\n"
                "fetch('/api/v1/default');\n"
            ),
        },
    )
    assert mod.main(tmp_path) == 1
    out = capsys.readouterr().out
    assert "[POST] /api/v1/items" in out

    (tmp_path / "vue3" / "src" / "api.ts").write_text(
        (tmp_path / "vue3" / "src" / "api.ts").read_text(encoding="utf-8")
        + "fetch('/api/v1/items', { method: 'POST' });\n",
        encoding="utf-8",
    )
    assert mod.main(tmp_path) == 0


def test_api_fetch_variants_and_helper_edge_cases(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mod = _load_mod("api_fetch_edges", "verify_no_orphan_api_endpoints.py")
    _write_files(
        tmp_path,
        {
            "react-frontend/src/api.ts": (
                "fetch('/api/v1/items');\n"
                "fetch(`/api/v1/items/${itemId}`);\n"
                "await fetch('/api/v1/items', "
                "{ headers: { 'X-Opt': 'a)b' }, method: 'POST' });\n"
                "window.fetch('/api/v1/items/1', { method: 'delete' });\n"
                "globalThis.fetch('https://external.example/skip');\n"
                "store.fetch('/api/v1/non-native');\n"
                "refetch('/api/v1/non-native');\n"
            ),
            "node-backend/src/items.ts": (
                "router.get('relative/skip', skipHandler);\n"
                "router.get('/api/v1/items', listItems);\n"
                "router.get('/api/v1/items/:id', getItem);\n"
                "router.post('/api/v1/items', createItem);\n"
                "router.delete('/api/v1/items/:id', deleteItem);\n"
            ),
        },
    )
    assert mod.main(tmp_path) == 0
    assert mod.cli_main([str(tmp_path)]) == 0
    assert mod._find_matching_paren("(unclosed", 0) == len("(unclosed")
    assert mod._expr_to_parts(ast.Constant(value=1)) == []
    bare_call = ast.parse("dec()").body[0]
    assert isinstance(bare_call, ast.Expr) and isinstance(bare_call.value, ast.Call)
    assert mod._extract_call_verbs(bare_call.value) == []
    chain = {f"m{i}": {"r": (f"m{i + 1}", "r")} for i in range(6)}
    assert mod._chase_reexports(("m0", "r"), chain) == ("m4", "r")
    assert mod._match_mod_suffix("", {"a"}) is None
    assert mod._parse_code_safe("def broken(:\n", tmp_path / "broken.py") is None

    sample_py = tmp_path / "sample.py"
    sample_py.write_text("x = 1\n", encoding="utf-8")
    code = sample_py.read_text(encoding="utf-8")
    assert mod._parse_code_safe(code, sample_py) is not None

    only_tests = tmp_path / "only_tests"
    _write_files(only_tests, {"fastapi/src/test_only.py": "x = 1\n"})
    assert (
        mod._extract_fastapi_routes_from_src(only_tests / "fastapi" / "src", only_tests)
        == []
    )

    unreadable_repo = tmp_path / "unreadable_src"
    bad_py = unreadable_repo / "fastapi" / "src" / "main.py"
    _write_files(unreadable_repo, {"fastapi/src/main.py": "x = 1\n"})
    orig_read = Path.read_text
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda self, *a, **kw: (
            (_ for _ in ()).throw(OSError("denied"))
            if self == bad_py
            else orig_read(self, *a, **kw)
        ),
    )
    assert (
        mod._extract_fastapi_routes_from_src(
            unreadable_repo / "fastapi" / "src", unreadable_repo
        )
        == []
    )


def test_ui_jsx_compound_suffixes_and_exclusions(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod("ui_jsx", "verify_zero_orphan_vue_components.py")
    hooks_and_entries = tmp_path / "hooks_only"
    _write_files(
        hooks_and_entries,
        {
            "react-frontend/src/main.tsx": "export {};\n",
            "react-frontend/src/main.jsx": "export {};\n",
            "react-frontend/src/index.tsx": "export {};\n",
            "react-frontend/src/index.jsx": "export {};\n",
            "react-frontend/src/vite-env.d.ts": "/// <reference types='vite' />\n",
            "react-frontend/src/types/env.d.ts": "export type X = string;\n",
            "react-frontend/src/hooks/useAuth.tsx": "export const useAuth = () => 1;\n",
            "react-frontend/src/hooks/useSock.jsx": "export const useSock = () => 1;\n",
        },
    )
    assert mod.cli_main([str(hooks_and_entries), "--exit-skipped-code", "17"]) == 17
    assert "0 componentes UI" in capsys.readouterr().out

    jsx_repo = tmp_path / "jsx_repo"
    _write_files(
        jsx_repo,
        {
            "react-frontend/src/components/Button.jsx": "export const Button = 1;\n",
            "react-frontend/src/components/Button.unit.jsx": "import './Button.jsx';\n",
            "react-frontend/src/components/Modal.jsx": "export const Modal = 1;\n",
            "react-frontend/tests/Modal.spec.jsx": (
                "import Modal from '../src/components/Modal.jsx';\n"
            ),
            "react-frontend/src/components/Alert.tsx": "export const Alert = 1;\n",
            "react-frontend/tests/Alert.test.jsx": (
                "import Alert from '../src/components/Alert.tsx';\n"
            ),
            "vue3/src/components/Banner.vue": "<template><div /></template>\n",
            "vue3/src/components/Banner.test.vue": (
                "<script setup>import Banner from './Banner.vue';</script>\n"
            ),
            "vue3/src/components/MyComp.view.vue": "<template><div /></template>\n",
            "vue3/tests/MyComp.view.unit.ts": (
                "import MyComp from '../src/components/MyComp.view.vue';\n"
            ),
            "vue3/tests/setup.ts": "export {};\n",
            "react-frontend/src/components/UserCard.tsx": (
                "export const UserCard = 1;\n"
            ),
        },
    )
    assert mod._strip_compound_suffix("MyComp.unit.tsx") == "MyComp"
    assert mod._strip_compound_suffix("MyComp.spec.jsx") == "MyComp"
    assert mod._strip_compound_suffix("Foo.test.vue") == "Foo"
    assert mod._strip_compound_suffix("README.md") == "README"
    assert mod.main(jsx_repo) == 1
    out = capsys.readouterr().out
    assert "UserCard.tsx" in out
    assert "Banner.test.vue" not in out

    _write_files(
        jsx_repo,
        {"react-frontend/tests/UserCard.unit.jsx": "render(<UserCard />);\n"},
    )
    assert mod.main(jsx_repo) == 0


def test_ui_comment_stripping_rejects_comment_only_and_accepts_real_usage(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mod = _load_mod("ui_comments", "verify_zero_orphan_vue_components.py")
    _write_files(
        tmp_path,
        {
            "vue3/src/components/GhostPanel.vue": "<template><section /></template>\n",
            "vue3/src/components/Button.tsx": "export const Button = () => null;\n",
            "vue3/src/components/PanelA.vue": "<template><div /></template>\n",
            "vue3/src/components/PanelB.jsx": "export const PanelB = () => null;\n",
            "vue3/src/components/PanelC.tsx": "export const PanelC = () => null;\n",
            "vue3/src/components/PanelD.vue": "<template><div /></template>\n",
            "vue3/src/components/PanelE.vue": "<template><div /></template>\n",
            "vue3/src/components/PanelF.tsx": "export const PanelF = () => null;\n",
            "vue3/src/components/PanelG.tsx": "export const PanelG = () => null;\n",
            "vue3/tests/suite.unit.ts": (
                "// GhostPanel is tested in our dreams\n"
                "/* <GhostPanel /> import GhostPanel from './GhostPanel.vue';"
                " mount(GhostPanel); */\n"
                'const label = " GhostPanel ";\n'
                "import { ButtonGroup } from './ButtonGroup';\n"
                "import { PanelA } from '../src/components';\n"
                "const loadB = () => import('../src/components/PanelB.jsx');\n"
                "const el = <PanelC size='sm' />;\n"
                "mount(PanelD);\n"
                "shallowMount(PanelE);\n"
                "render(<PanelF />);\n"
                "React.createElement(PanelG, null);\n"
            ),
        },
    )
    assert mod.main(tmp_path) == 1
    out = capsys.readouterr().out
    assert "GhostPanel.vue" in out
    assert "Button.tsx" in out
    for covered in (
        "PanelA",
        "PanelB",
        "PanelC",
        "PanelD",
        "PanelE",
        "PanelF",
        "PanelG",
    ):
        assert covered not in out
