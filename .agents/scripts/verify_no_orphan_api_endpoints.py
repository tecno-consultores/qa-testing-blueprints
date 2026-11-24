#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_no_orphan_api_endpoints.py — Invariante de Cero Endpoints de API Huérfanos.

Audita bidireccionalmente por pares de stack (`vue3 <-> fastapi`,
`react-frontend <-> node-backend` y `frontend <-> backend/src`):
1. Que el 100% de las llamadas `http`/`api`/`axios`/`fetch` en el frontend coincidan
   con rutas de backend registradas en su par FastAPI o Node.js (0 llamadas 404/405).
2. Que los endpoints operativos del backend estén referenciados en su frontend par o
   declarados en `ARCHITECTURAL_WHITELIST` o suprimidos por línea con
   `# api-parity-ignore` / `// api-parity-ignore`.

Si el proyecto es únicamente backend, únicamente frontend o no posee rutas ni
llamadas activas, reporta `⚠️ SKIPPED [API Parity]` (con `--exit-skipped-code`,
por defecto 0). Si existen ambos directorios pero el frontend tiene 0 llamadas
contra rutas backend no exentas, falla reportando los endpoints huérfanos.
"""

from __future__ import annotations

import argparse
import ast
import os
import re
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import NamedTuple

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _common import CANONICAL_IGNORED_DIRS  # noqa: E402

ARCHITECTURAL_WHITELIST: set[tuple[str, str]] = {
    ("GET", "/health"),
    ("GET", "/api/v1/health"),
    ("GET", "/metrics"),
    ("POST", "/api/v1/mcp"),
    ("GET", "/users/me"),
    ("GET", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/bootstrap-status"),
    ("POST", "/api/v1/auth/bootstrap"),
    ("POST", "/api/v1/auth/2fa/confirm-enrollment"),
    ("POST", "/api/v1/auth/2fa/verify"),
}

_HTTP_VERBS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})
_NODE_ROUTE_RE = re.compile(
    r"\b(?:app|router|fastify|server|[A-Za-z_$][\w$]*(?:Router|_router))\.(get|post|put|patch|delete)\s*\(\s*([`'\"])(.*?)\2",
    re.IGNORECASE,
)
_FRONT_CALL_HEAD_RE = re.compile(
    r"\b(?:http|api|axios)\.(get|post|put|patch|delete)\b"
)
_FETCH_CALL_HEAD_RE = re.compile(
    r"(?<![.\w$])(?:(?:window|globalThis)\.)?fetch\b"
)
_FIRST_STRING_ARG_RE = re.compile(r"\s*\(\s*([`'\"])(.*?)\1", re.DOTALL)
_FETCH_METHOD_RE = re.compile(r"\bmethod\s*:\s*([`'\"])([A-Za-z]+)\1")
_ADD_API_ROUTE_START_RE = re.compile(r"\badd_api_route\s*\(")
_ADD_API_PATH_RE = re.compile(r"\s*(?:path\s*=\s*)?(['\"])([^'\"]+)\1")
_METHODS_KW_RE = re.compile(r"\bmethods\s*=\s*[\[\(]([^\]\)]+)[\]\)]", re.DOTALL)
_PAREN_OR_STR_RE = re.compile(
    r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[()]"
)
_PY_STRING_OR_COMMENT_RE = re.compile(
    r'"""[\s\S]*?"""'
    r"|'''[\s\S]*?'''"
    r'|"(?:\\.|[^"\\\n])*"'
    r"|'(?:\\.|[^'\\\n])*'"
    r"|#[^\n]*"
)
_PARITY_IGNORE_RE = re.compile(r"(?:#|//)\s*api-parity-ignore")
_COMMENT_ONLY_IGNORE_RE = re.compile(r"^\s*(?:#|//)\s*api-parity-ignore")
_ALLOWED_API_PREFIXES = ("/api/", "api/", "/health", "/users/me")
_TEST_SOURCE_SUFFIXES = (
    ".unit.ts",
    ".unit.tsx",
    ".unit.js",
    ".unit.jsx",
    ".spec.ts",
    ".spec.tsx",
    ".spec.js",
    ".spec.jsx",
    ".test.ts",
    ".test.tsx",
    ".test.js",
    ".test.jsx",
)

RouterRef = tuple[str, str]
ImportTarget = tuple[str, str | None]


class _BackendRoute(NamedTuple):
    verb: str
    path: str
    rel_file: str
    line_no: int
    end_line_no: int


class _FrontendCall(NamedTuple):
    verb: str
    url: str
    rel_file: str
    line_no: int
    end_line_no: int


class _ParsedPyModule(NamedTuple):
    mod_key: str
    pkg_parts: tuple[str, ...]
    dir_parts: tuple[str, ...]
    rel_file: str
    text: str
    tree: ast.AST | None


class _RouterGraph(NamedTuple):
    own_prefixes: dict[RouterRef, str]
    parent_edges: dict[RouterRef, list[tuple[RouterRef, str]]]


_ROUTE_TOKEN_RE = re.compile(
    r"(\{[a-zA-Z0-9_]+(?::[a-zA-Z0-9_]+)?\}|:[a-zA-Z0-9_]+)"
)


def _replace_route_token(token: str) -> str:
    return r".+" if token.endswith(":path}") else r"[^/]+"


def normalize_route_pattern(path: str) -> str:
    """Normaliza parámetros de ruta ({param} o :param) a comodines regex."""
    norm = path.rstrip("/") if len(path) > 1 else path
    parts = _ROUTE_TOKEN_RE.split(norm)
    return "".join(
        _replace_route_token(part) if idx % 2 else re.escape(part)
        for idx, part in enumerate(parts)
    )


def _has_fastapi_markers(candidate: Path) -> bool:
    if (candidate / "api").exists() or (candidate / "main.py").exists():
        return True
    return candidate.exists() and any(candidate.rglob("*.py"))


def _find_fastapi_src(repo_root: Path) -> Path | None:
    candidates = (
        repo_root / "fastapi" / "src",
        repo_root / "backend" / "src",
        repo_root / "src",
    )
    return next((c for c in candidates if _has_fastapi_markers(c)), None)


def _find_matching_paren(text: str, open_paren_idx: int) -> int:
    depth = 0
    for match in _PAREN_OR_STR_RE.finditer(text, open_paren_idx):
        delta = {"(": 1, ")": -1}.get(match.group(0), 0)
        depth += delta
        if delta and depth == 0:
            return match.end()
    return len(text)


def _parse_methods_list(methods_raw: str) -> list[str]:
    verbs = [
        m.upper()
        for m in re.findall(r"['\"]([A-Za-z]+)['\"]", methods_raw)
        if m.upper() in _HTTP_VERBS
    ]
    return verbs or ["GET"]


def _blank_py_comment(match: re.Match[str]) -> str:
    token = match.group(0)
    return " " * len(token) if token.startswith("#") else token


def _strip_py_comments(text: str) -> str:
    return _PY_STRING_OR_COMMENT_RE.sub(_blank_py_comment, text)


def _extract_main_py_routes_from_text(
    content: str, rel_file: str
) -> list[_BackendRoute]:
    cleaned = _strip_py_comments(content)
    routes: list[_BackendRoute] = []
    for match in _ADD_API_ROUTE_START_RE.finditer(cleaned):
        end_idx = _find_matching_paren(cleaned, match.end() - 1)
        body = cleaned[match.end() : end_idx]
        path_m = _ADD_API_PATH_RE.match(body)
        if not path_m:
            continue
        methods_m = _METHODS_KW_RE.search(body)
        verbs = _parse_methods_list(methods_m.group(1)) if methods_m else ["GET"]
        line_no = cleaned[: match.start()].count("\n") + 1
        end_line_no = cleaned[:end_idx].count("\n") + 1
        for verb in verbs:
            routes.append(
                _BackendRoute(verb, path_m.group(2), rel_file, line_no, end_line_no)
            )
    if "Instrumentator" in cleaned:
        inst_idx = cleaned.find("Instrumentator")
        inst_line = cleaned[:inst_idx].count("\n") + 1
        routes.append(_BackendRoute("GET", "/metrics", rel_file, inst_line, inst_line))
    return routes


def _is_router_factory(func: ast.expr) -> bool:
    if isinstance(func, ast.Name):
        return func.id in ("APIRouter", "FastAPI")
    if isinstance(func, ast.Attribute):
        return func.attr in ("APIRouter", "FastAPI")
    return False


def _extract_str_keyword(call: ast.Call, arg_name: str) -> str:
    for kw in call.keywords:
        if kw.arg == arg_name and isinstance(kw.value, ast.Constant):
            if isinstance(kw.value.value, str):
                return kw.value.value
    return ""


def _extract_router_assignment(node: ast.Assign) -> tuple[str, str] | None:
    if not isinstance(node.value, ast.Call) or not _is_router_factory(node.value.func):
        return None
    name_target = next((t.id for t in node.targets if isinstance(t, ast.Name)), None)
    if name_target is None:
        return None
    return name_target, _extract_str_keyword(node.value, "prefix")


def _extract_router_prefixes(tree: ast.AST) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            parsed = _extract_router_assignment(node)
            if parsed is not None:
                prefixes[parsed[0]] = parsed[1]
    return prefixes


def _router_var_name(expr: ast.expr) -> str:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return expr.attr
    return ""


def _expr_to_parts(expr: ast.expr) -> list[str]:
    if isinstance(expr, ast.Name):
        return [expr.id]
    if isinstance(expr, ast.Attribute):
        prefix = _expr_to_parts(expr.value)
        return [*prefix, expr.attr] if prefix else []
    return []


def _join_prefixes(*parts: str) -> str:
    cleaned = [p.strip("/") for p in parts if p and p.strip("/")]
    return "/" + "/".join(cleaned) if cleaned else ""


def _build_full_route_path(
    r_prefix: str, sub_path: str, dir_parts: tuple[str, ...]
) -> str:
    norm_r = (
        r_prefix if r_prefix.startswith("/") else ("/" + r_prefix if r_prefix else "")
    )
    norm_sub = (
        sub_path if sub_path.startswith("/") else ("/" + sub_path if sub_path else "")
    )
    combined = norm_r.rstrip("/") + norm_sub
    if "v1" not in dir_parts:
        return combined or "/"
    if combined.startswith("/api/") or combined == "/api":
        return combined
    if combined.startswith("/v1/") or combined == "/v1":
        return "/api" + combined
    return "/api/v1" + combined


def _extract_methods_kw_ast(call: ast.Call) -> list[str]:
    for kw in call.keywords:
        if kw.arg != "methods":
            continue
        if isinstance(kw.value, (ast.List, ast.Tuple, ast.Set)):
            return [
                str(elt.value).upper()
                for elt in kw.value.elts
                if isinstance(elt, ast.Constant)
                and isinstance(elt.value, str)
                and elt.value.upper() in _HTTP_VERBS
            ]
        if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
            verb = kw.value.value.upper()
            return [verb] if verb in _HTTP_VERBS else []
    return ["GET"]


def _extract_call_verbs(call: ast.Call, allow_add_api: bool = False) -> list[str]:
    if not isinstance(call.func, ast.Attribute):
        return []
    attr = call.func.attr
    upper = attr.upper()
    if upper in _HTTP_VERBS:
        return [upper]
    if attr == "api_route" or (allow_add_api and attr == "add_api_route"):
        return _extract_methods_kw_ast(call)
    return []


def _extract_call_subpath(call: ast.Call) -> str:
    if call.args and isinstance(call.args[0], ast.Constant):
        if isinstance(call.args[0].value, str):
            return call.args[0].value
    return _extract_str_keyword(call, "path")


def _extract_decorator_routes(
    deco: ast.expr,
    effective_prefixes: dict[str, list[str]],
    dir_parts: tuple[str, ...],
) -> list[tuple[str, str, int, int]]:
    if not isinstance(deco, ast.Call) or not isinstance(deco.func, ast.Attribute):
        return []
    verbs = _extract_call_verbs(deco)
    if not verbs:
        return []
    r_var = _router_var_name(deco.func.value)
    sub_path = _extract_call_subpath(deco)
    prefixes = effective_prefixes.get(r_var, [""])
    line_no = deco.lineno
    end_line = deco.end_lineno or deco.lineno
    return [
        (verb, _build_full_route_path(pref, sub_path, dir_parts), line_no, end_line)
        for pref in prefixes
        for verb in verbs
    ]


def _parse_code_safe(code: str, fpath: Path) -> ast.AST | None:
    try:
        return ast.parse(code, filename=str(fpath))
    except SyntaxError:
        return None


_SKIPPED_PY_DIRS: frozenset[str] = frozenset(
    {
        "__pycache__",
        ".venv",
        "venv",
        ".tox",
        ".nox",
        ".hypothesis",
        ".schemathesis",
        "mutants",
        ".mutmut-cache",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "node_modules",
        "vendor",
        "dist",
        "build",
        "graphify-out",
        "tests",
        "test",
        ".git",
    }
)


def _is_skipped_py_dir(dirname: str) -> bool:
    return dirname in _SKIPPED_PY_DIRS


def _is_skipped_py_file(fname: str) -> bool:
    return (
        not fname.endswith(".py")
        or fname.startswith("test_")
        or fname.endswith("_test.py")
    )


def _iter_py_files(backend_src: Path) -> Iterator[Path]:
    for root, dirs, files in os.walk(backend_src):
        dirs[:] = sorted(d for d in dirs if not _is_skipped_py_dir(d))
        for fname in sorted(files):
            if not _is_skipped_py_file(fname):
                yield Path(root) / fname


def _module_key_from_path(
    fpath: Path, backend_src: Path
) -> tuple[str, tuple[str, ...]]:
    rel = fpath.relative_to(backend_src)
    pkg_parts = rel.parent.parts
    if rel.name == "__init__.py":
        return ".".join(pkg_parts), pkg_parts
    return ".".join(rel.with_suffix("").parts), pkg_parts


def _load_fastapi_modules(
    backend_src: Path, repo_root: Path
) -> dict[str, _ParsedPyModule]:
    modules: dict[str, _ParsedPyModule] = {}
    for fpath in _iter_py_files(backend_src):
        try:
            text = fpath.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        mod_key, pkg_parts = _module_key_from_path(fpath, backend_src)
        modules[mod_key] = _ParsedPyModule(
            mod_key=mod_key,
            pkg_parts=pkg_parts,
            dir_parts=pkg_parts,
            rel_file=str(fpath.relative_to(repo_root)),
            text=text,
            tree=_parse_code_safe(text, fpath),
        )
    return modules


def _match_mod_suffix(dotted: str, known_mods: set[str]) -> str | None:
    if not dotted:
        return None
    parts = dotted.split(".")
    for idx in range(len(parts)):
        candidate = ".".join(parts[idx:])
        if candidate in known_mods:
            return candidate
    return None


def _base_import_dotted(node: ast.ImportFrom, pkg_parts: tuple[str, ...]) -> str:
    if node.level > 0:
        up = node.level - 1
        keep = pkg_parts[: len(pkg_parts) - up] if up <= len(pkg_parts) else ()
        sub = tuple(node.module.split(".")) if node.module else ()
        return ".".join(keep + sub)
    return node.module or ""


def _resolve_import_from_alias(
    base_dotted: str, alias_name: str, known_mods: set[str]
) -> ImportTarget | None:
    sub_dotted = f"{base_dotted}.{alias_name}" if base_dotted else alias_name
    sub_mod = _match_mod_suffix(sub_dotted, known_mods)
    if sub_mod is not None:
        return (sub_mod, None)
    parent_mod = _match_mod_suffix(base_dotted, known_mods)
    if parent_mod is not None:
        return (parent_mod, alias_name)
    return None


def _record_import_node(
    node: ast.Import,
    known_mods: set[str],
    imp_map: dict[str, ImportTarget],
) -> None:
    for alias in node.names:
        if not alias.asname:
            continue
        matched = _match_mod_suffix(alias.name, known_mods)
        if matched is not None:
            imp_map[alias.asname] = (matched, None)


def _record_import_from_node(
    node: ast.ImportFrom,
    pkg_parts: tuple[str, ...],
    known_mods: set[str],
    imp_map: dict[str, ImportTarget],
) -> None:
    base = _base_import_dotted(node, pkg_parts)
    for alias in node.names:
        local = alias.asname or alias.name
        target = _resolve_import_from_alias(base, alias.name, known_mods)
        if target is not None:
            imp_map[local] = target


def _extract_module_imports(
    mod: _ParsedPyModule, known_mods: set[str]
) -> dict[str, ImportTarget]:
    imp_map: dict[str, ImportTarget] = {}
    if mod.tree is None:
        return imp_map
    for node in ast.walk(mod.tree):
        if isinstance(node, ast.Import):
            _record_import_node(node, known_mods, imp_map)
        elif isinstance(node, ast.ImportFrom):
            _record_import_from_node(node, mod.pkg_parts, known_mods, imp_map)
    return imp_map


def _chase_reexports(
    ref: RouterRef,
    imports_by_mod: dict[str, dict[str, ImportTarget]],
) -> RouterRef:
    cur = ref
    for _ in range(4):
        target = imports_by_mod.get(cur[0], {}).get(cur[1])
        if target is None or target[1] is None:
            return cur
        cur = (target[0], target[1])
    return cur


def _resolve_dotted_router(
    parts: list[str],
    mod_key: str,
    imports_by_mod: dict[str, dict[str, ImportTarget]],
    known_mods: set[str],
) -> RouterRef:
    imp_map = imports_by_mod.get(mod_key, {})
    if len(parts) == 1:
        target = imp_map.get(parts[0])
        if target is not None:
            return _chase_reexports((target[0], target[1] or "router"), imports_by_mod)
        return (mod_key, parts[0])
    head_target = imp_map.get(parts[0])
    if head_target is not None and head_target[1] is None:
        sub_mod = _match_mod_suffix(
            ".".join([head_target[0], *parts[1:-1]]), known_mods
        )
        return (sub_mod or head_target[0], parts[-1])
    full_mod = _match_mod_suffix(".".join(parts[:-1]), known_mods)
    if full_mod is not None:
        return (full_mod, parts[-1])
    return (mod_key, parts[-1])


def _extract_include_child_expr(call: ast.Call) -> ast.expr | None:
    if call.args:
        return call.args[0]
    for kw in call.keywords:
        if kw.arg == "router":
            return kw.value
    return None


def _record_include_router_call(
    call: ast.Call,
    mod_key: str,
    imports_by_mod: dict[str, dict[str, ImportTarget]],
    known_mods: set[str],
    graph: _RouterGraph,
) -> None:
    if not isinstance(call.func, ast.Attribute) or call.func.attr != "include_router":
        return
    parent_parts = _expr_to_parts(call.func.value)
    child_expr = _extract_include_child_expr(call)
    child_parts = _expr_to_parts(child_expr) if child_expr else []
    if not parent_parts or not child_parts:
        return
    parent_ref = _resolve_dotted_router(
        parent_parts, mod_key, imports_by_mod, known_mods
    )
    child_ref = _resolve_dotted_router(child_parts, mod_key, imports_by_mod, known_mods)
    mount_pref = _extract_str_keyword(call, "prefix")
    graph.parent_edges.setdefault(child_ref, []).append((parent_ref, mount_pref))


def _collect_module_router_edges(
    mod: _ParsedPyModule,
    imports_by_mod: dict[str, dict[str, ImportTarget]],
    known_mods: set[str],
    graph: _RouterGraph,
) -> None:
    if mod.tree is None:
        return
    for var_name, pref in _extract_router_prefixes(mod.tree).items():
        graph.own_prefixes[(mod.mod_key, var_name)] = pref
    for node in ast.walk(mod.tree):
        if isinstance(node, ast.Call):
            _record_include_router_call(
                node, mod.mod_key, imports_by_mod, known_mods, graph
            )


def _resolve_router_effective_prefixes(
    target: RouterRef,
    graph: _RouterGraph,
    visited: set[RouterRef],
) -> list[str]:
    own = graph.own_prefixes.get(target, "")
    parents = graph.parent_edges.get(target)
    if not parents:
        return [own]
    resolved: list[str] = []
    for parent_ref, mount_pref in parents:
        if parent_ref in visited:
            continue
        for p_pref in _resolve_router_effective_prefixes(
            parent_ref, graph, visited | {target}
        ):
            resolved.append(_join_prefixes(p_pref, mount_pref, own))
    return resolved or [own]


def _prefixes_for_module(
    mod_key: str,
    graph: _RouterGraph,
) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for ref in graph.own_prefixes:
        if ref[0] == mod_key:
            result[ref[1]] = _resolve_router_effective_prefixes(ref, graph, set())
    for ref in graph.parent_edges:
        if ref[0] == mod_key and ref[1] not in result:
            result[ref[1]] = _resolve_router_effective_prefixes(ref, graph, set())
    return result


def _extract_func_routes(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    effective_prefixes: dict[str, list[str]],
    dir_parts: tuple[str, ...],
    rel_file: str,
) -> list[_BackendRoute]:
    found: list[_BackendRoute] = []
    for deco in node.decorator_list:
        for verb, path, line_no, end_line in _extract_decorator_routes(
            deco, effective_prefixes, dir_parts
        ):
            found.append(_BackendRoute(verb, path, rel_file, line_no, end_line))
    return found


def _extract_add_api_route_call(
    call: ast.Call,
    effective_prefixes: dict[str, list[str]],
    dir_parts: tuple[str, ...],
    rel_file: str,
) -> list[_BackendRoute]:
    if not isinstance(call.func, ast.Attribute) or call.func.attr != "add_api_route":
        return []
    verbs = _extract_call_verbs(call, allow_add_api=True)
    sub_path = _extract_call_subpath(call)
    if not sub_path or not verbs:
        return []
    r_var = _router_var_name(call.func.value)
    prefixes = effective_prefixes.get(r_var, [""])
    end_line = call.end_lineno or call.lineno
    return [
        _BackendRoute(
            verb,
            _build_full_route_path(pref, sub_path, dir_parts),
            rel_file,
            call.lineno,
            end_line,
        )
        for pref in prefixes
        for verb in verbs
    ]


def _extract_module_routes(
    mod: _ParsedPyModule,
    effective_prefixes: dict[str, list[str]],
) -> list[_BackendRoute]:
    if mod.tree is None:
        return []
    routes: list[_BackendRoute] = []
    for node in ast.walk(mod.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            routes.extend(
                _extract_func_routes(
                    node, effective_prefixes, mod.dir_parts, mod.rel_file
                )
            )
        elif isinstance(node, ast.Call):
            routes.extend(
                _extract_add_api_route_call(
                    node, effective_prefixes, mod.dir_parts, mod.rel_file
                )
            )
    return routes


def _dedup_backend_routes(routes: list[_BackendRoute]) -> list[_BackendRoute]:
    seen: set[tuple[str, str, str, int]] = set()
    unique: list[_BackendRoute] = []
    for route in routes:
        key = (route.verb, route.path, route.rel_file, route.line_no)
        if key not in seen:
            seen.add(key)
            unique.append(route)
    return unique


def _extract_fastapi_routes_from_src(
    backend_src: Path, repo_root: Path
) -> list[_BackendRoute]:
    modules = _load_fastapi_modules(backend_src, repo_root)
    if not modules:
        return []
    known_mods = set(modules.keys())
    imports_by_mod = {
        mod_key: _extract_module_imports(mod, known_mods)
        for mod_key, mod in modules.items()
    }
    graph = _RouterGraph(own_prefixes={}, parent_edges={})
    for mod in modules.values():
        _collect_module_router_edges(mod, imports_by_mod, known_mods, graph)
    routes: list[_BackendRoute] = []
    main_mod = modules.get("main")
    if main_mod is not None:
        routes.extend(
            _extract_main_py_routes_from_text(main_mod.text, main_mod.rel_file)
        )
    for mod_key, mod in modules.items():
        eff = _prefixes_for_module(mod_key, graph)
        routes.extend(_extract_module_routes(mod, eff))
    return _dedup_backend_routes(routes)


_IGNORED_SOURCE_DIRS: frozenset[str] = CANONICAL_IGNORED_DIRS | {
    "tests",
    "test",
    "__tests__",
}
_JS_STRING_OR_COMMENT_RE = re.compile(
    r'"(?:\\.|[^"\\])*"'
    r"|'(?:\\.|[^'\\])*'"
    r"|`(?:\\.|[^`\\])*`"
    r"|//[^\n]*"
    r"|/\*[\s\S]*?\*/"
)


def _blank_js_comment(match: re.Match[str]) -> str:
    token = match.group(0)
    if token.startswith(('"', "'", "`")):
        return token
    return re.sub(r"[^\n]", " ", token)


def _strip_js_comments(text: str) -> str:
    return _JS_STRING_OR_COMMENT_RE.sub(_blank_js_comment, text)


def _is_source_file(fname: str, extensions: tuple[str, ...]) -> bool:
    return fname.endswith(extensions) and not fname.endswith(_TEST_SOURCE_SUFFIXES)


def _iter_source_files(
    directories: list[Path], extensions: tuple[str, ...]
) -> Iterator[Path]:
    for base_dir in (d for d in directories if d.exists()):
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = sorted(d for d in dirs if d not in _IGNORED_SOURCE_DIRS)
            for fname in sorted(files):
                if _is_source_file(fname, extensions):
                    yield Path(root) / fname


_NODE_RECV_RE = re.compile(r"^([A-Za-z_$][A-Za-z0-9_$]*)\s*\.")
_NODE_ES_DEFAULT_IMPORT_RE = re.compile(
    r"^\s*import\s+(?:\*\s+as\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
_NODE_ES_NAMED_IMPORT_RE = re.compile(
    r"^\s*import\s*\{([^}]+)\}\s*from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
_NODE_CJS_IMPORT_RE = re.compile(
    r"(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\(\s*['\"]([^'\"]+)['\"]\s*\)"
)
_NODE_USE_START_RE = re.compile(
    r"\b([A-Za-z_$][A-Za-z0-9_$]*)\.use\(\s*(['\"`])(/[^'\"`]*)\2\s*,"
)
_NODE_INLINE_REQ_RE = re.compile(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)")
_NODE_IDENT_RE = re.compile(r"^([A-Za-z_$][A-Za-z0-9_$]*)$")
_FRONTEND_TMPL_RE = re.compile(
    r"(/\$\{\s*(?:sub_?path|path|endpoint|route|rest|resource_?path)\b[^}]*\}$|\$\{[^}]+\})",
    re.IGNORECASE,
)
_API_VERSION_PREFIX_RE = re.compile(r"^/api/v\d+(?:/|$)")

_NodeRouteRec = tuple[str, str, str, str, int, int]
_NodeMountRec = tuple[str, str, str | None, str | None]
_NodeParsedRec = tuple[list[_NodeRouteRec], list[_NodeMountRec]]


def _extract_node_receiver(match_text: str) -> str:
    recv_m = _NODE_RECV_RE.match(match_text.lstrip())
    return recv_m.group(1) if recv_m else ""


def _resolve_node_rel_import(
    base_file: Path, spec: str, known_files: dict[Path, str]
) -> str | None:
    if not spec.startswith((".", "/")):
        return None
    for suffix in ("", ".ts", ".js", "/index.ts", "/index.js"):
        candidate = (base_file.parent / f"{spec}{suffix}").resolve()
        if candidate in known_files:
            return known_files[candidate]
    return None


def _bind_node_aliases(
    clause: str, resolved: str, imports: dict[str, str]
) -> None:
    for item in clause.split(","):
        alias = item.strip().split(" as ")[-1].strip()
        if _NODE_IDENT_RE.match(alias):
            imports[alias] = resolved


def _collect_node_es_imports(
    text: str, fpath: Path, known_files: dict[Path, str], imports: dict[str, str]
) -> None:
    for m in _NODE_ES_DEFAULT_IMPORT_RE.finditer(text):
        resolved = _resolve_node_rel_import(fpath, m.group(2), known_files)
        if resolved:
            imports[m.group(1)] = resolved
    for m in _NODE_ES_NAMED_IMPORT_RE.finditer(text):
        resolved = _resolve_node_rel_import(fpath, m.group(2), known_files)
        if resolved:
            _bind_node_aliases(m.group(1), resolved, imports)


def _extract_node_imports(
    text: str, fpath: Path, known_files: dict[Path, str]
) -> dict[str, str]:
    imports: dict[str, str] = {}
    _collect_node_es_imports(text, fpath, known_files, imports)
    for m in _NODE_CJS_IMPORT_RE.finditer(text):
        resolved = _resolve_node_rel_import(fpath, m.group(2), known_files)
        if resolved:
            imports[m.group(1)] = resolved
    return imports


def _lookup_use_ident(
    ident: str, imports: dict[str, str], local_receivers: set[str]
) -> tuple[str | None, str | None] | None:
    if ident in imports:
        return imports[ident], None
    if ident in local_receivers:
        return None, ident
    return None


def _resolve_use_target(
    args_body: str,
    fpath: Path,
    imports: dict[str, str],
    local_receivers: set[str],
    known_files: dict[Path, str],
) -> tuple[str | None, str | None] | None:
    inline_req = _NODE_INLINE_REQ_RE.search(args_body)
    if inline_req:
        resolved = _resolve_node_rel_import(fpath, inline_req.group(1), known_files)
        if resolved:
            return resolved, None
    for part in reversed(args_body.split(",")):
        ident = part.strip()
        found = (
            _lookup_use_ident(ident, imports, local_receivers)
            if _NODE_IDENT_RE.match(ident)
            else None
        )
        if found is not None:
            return found
    return None


def _extract_node_mounts(
    text: str,
    fpath: Path,
    imports: dict[str, str],
    local_receivers: set[str],
    known_files: dict[Path, str],
) -> list[_NodeMountRec]:
    mounts: list[_NodeMountRec] = []
    for m in _NODE_USE_START_RE.finditer(text):
        open_idx = text.find("(", m.start())
        close_idx = _find_matching_paren(text, open_idx)
        args_body = text[m.end() : max(m.end(), close_idx - 1)]
        target = _resolve_use_target(
            args_body, fpath, imports, local_receivers, known_files
        )
        if target is not None:
            mounts.append((m.group(1), m.group(3).strip(), target[0], target[1]))
    return mounts


def _join_node_prefix(prefix: str, child_path: str) -> str:
    clean_p = prefix.rstrip("/")
    clean_c = child_path if child_path.startswith("/") else f"/{child_path}"
    if clean_c == "/":
        return clean_p or "/"
    return f"{clean_p}{clean_c}" if clean_p else clean_c


def _extract_node_file_records(
    fpath: Path, repo_root: Path
) -> tuple[str, list[_NodeRouteRec]]:
    rel_file = str(fpath.relative_to(repo_root))
    raw_text = fpath.read_text(encoding="utf-8", errors="ignore")
    text = _strip_js_comments(raw_text)
    recs: list[_NodeRouteRec] = []
    for match in _NODE_ROUTE_RE.finditer(text):
        raw_path = match.group(3).strip()
        if raw_path.startswith("/"):
            line_no = text[: match.start()].count("\n") + 1
            end_line = text[: match.end()].count("\n") + 1
            recv = _extract_node_receiver(match.group(0))
            recs.append(
                (recv, match.group(1).upper(), raw_path, rel_file, line_no, end_line)
            )
    return text, recs


def _extract_node_file_routes(fpath: Path, repo_root: Path) -> list[_BackendRoute]:
    _, recs = _extract_node_file_records(fpath, repo_root)
    return [
        _BackendRoute(method, raw_path, rel_file, line_no, end_line)
        for _, method, raw_path, rel_file, line_no, end_line in recs
    ]


def _collect_node_mounted_targets(
    parsed: dict[str, _NodeParsedRec],
) -> tuple[set[str], dict[str, set[str]]]:
    mounted_files: set[str] = set()
    intra_syms: dict[str, set[str]] = {}
    for rel_file, (_, mounts) in parsed.items():
        for _, _, target_file, target_sym in mounts:
            if target_file is not None:
                mounted_files.add(target_file)
            elif target_sym is not None:
                intra_syms.setdefault(rel_file, set()).add(target_sym)
    return mounted_files, intra_syms


def _collect_direct_node_routes(
    recs: list[_NodeRouteRec],
    prefix: str,
    target_sym: str | None,
    hidden_local: set[str],
) -> list[_BackendRoute]:
    out: list[_BackendRoute] = []
    for r_recv, method, raw_path, r_file, line_no, end_line in recs:
        direct_match = target_sym is None and r_recv not in hidden_local
        if direct_match or r_recv == target_sym:
            joined = _join_node_prefix(prefix, raw_path)
            out.append(_BackendRoute(method, joined, r_file, line_no, end_line))
    return out


def _expand_node_mount(
    rel_file: str,
    prefix: str,
    target_sym: str | None,
    parsed: dict[str, _NodeParsedRec],
    intra_syms: dict[str, set[str]],
    seen: set[tuple[str, str, str | None]],
) -> list[_BackendRoute]:
    state_key = (rel_file, prefix, target_sym)
    if len(seen) > 128 or state_key in seen or rel_file not in parsed:
        return []
    seen.add(state_key)
    recs, mounts = parsed[rel_file]
    hidden_local = intra_syms.get(rel_file, set())
    out = _collect_direct_node_routes(recs, prefix, target_sym, hidden_local)
    for owner, m_prefix, m_file, m_sym in mounts:
        if target_sym is None or owner == target_sym:
            dest_file = m_file or rel_file
            joined_prefix = _join_node_prefix(prefix, m_prefix)
            sub_routes = _expand_node_mount(
                dest_file, joined_prefix, m_sym, parsed, intra_syms, seen
            )
            out.extend(sub_routes)
    return out


def _extract_node_routes_from_dirs(
    candidates: list[Path], repo_root: Path
) -> list[_BackendRoute]:
    src_files = list(_iter_source_files(candidates, (".ts", ".js")))
    known_files = {f.resolve(): str(f.relative_to(repo_root)) for f in src_files}
    texts: dict[str, tuple[Path, str, list[_NodeRouteRec]]] = {}
    parsed: dict[str, _NodeParsedRec] = {}
    for fpath in src_files:
        text, recs = _extract_node_file_records(fpath, repo_root)
        rel_file = known_files[fpath.resolve()]
        texts[rel_file] = (fpath, text, recs)
    for rel_file, (fpath, text, recs) in texts.items():
        imports = _extract_node_imports(text, fpath, known_files)
        local_recvs = {r[0] for r in recs if r[0]}
        mounts = _extract_node_mounts(text, fpath, imports, local_recvs, known_files)
        parsed[rel_file] = (recs, mounts)
    mounted_files, intra_syms = _collect_node_mounted_targets(parsed)
    routes: list[_BackendRoute] = []
    for rel_file in parsed:
        if rel_file not in mounted_files:
            routes.extend(
                _expand_node_mount(rel_file, "", None, parsed, intra_syms, set())
            )
    return routes


def _strip_dynamic_query_suffix(raw_url: str) -> str:
    """Elimina ternarios con '?' o query strings pegadas al final de un segmento."""
    cleaned = re.sub(r"\$\{[^}]*\?[^}]*\}", "", raw_url)
    cleaned = cleaned.split("?")[0]
    cleaned = re.sub(r"([a-zA-Z0-9_}\]])\$\{[^}]+\}$", r"\1", cleaned)
    return cleaned.rstrip("/") if len(cleaned) > 1 else cleaned


def _replace_frontend_token(token: str) -> str:
    return r"/.+" if token.startswith("/") else r"[^/]+"


def _frontend_url_to_regex(f_url: str) -> str:
    """Convierte URL frontend con template strings a regex de matching."""
    norm_f = f_url.rstrip("/") if len(f_url) > 1 else f_url
    parts = _FRONTEND_TMPL_RE.split(norm_f)
    body = "".join(
        _replace_frontend_token(part) if idx % 2 else re.escape(part)
        for idx, part in enumerate(parts)
    )
    return f"^{body}$"


def _detect_frontend_dirs(repo_root: Path) -> list[Path]:
    frontend_dirs = [
        d
        for d in (
            repo_root / "vue3" / "src",
            repo_root / "react-frontend" / "src",
            repo_root / "frontend" / "src",
        )
        if d.exists()
    ]
    root_src = repo_root / "src"
    if (
        not frontend_dirs
        and root_src.exists()
        and ((root_src / "components").exists() or (root_src / "views").exists())
    ):
        frontend_dirs.append(root_src)
    return frontend_dirs


def _has_backend_dir(repo_root: Path) -> bool:
    candidates = (
        repo_root / "fastapi",
        repo_root / "node-backend",
        repo_root / "backend",
        repo_root / "src" / "api",
    )
    return (
        any(d.exists() for d in candidates) or (repo_root / "src" / "main.py").exists()
    )


def _normalize_frontend_call(
    verb: str,
    raw_url: str,
    rel_file: str,
    line_no: int,
    end_line_no: int,
) -> _FrontendCall | None:
    compact = re.sub(r"\s+", "", raw_url.strip())
    if not (
        compact.startswith(_ALLOWED_API_PREFIXES)
        or _API_VERSION_PREFIX_RE.match(compact)
    ):
        return None
    if not compact.startswith("/"):
        compact = "/" + compact
    return _FrontendCall(
        verb, _strip_dynamic_query_suffix(compact), rel_file, line_no, end_line_no
    )


def _extract_fetch_verb(tail: str) -> str:
    method_m = _FETCH_METHOD_RE.search(tail)
    if method_m and method_m.group(2).upper() in _HTTP_VERBS:
        return method_m.group(2).upper()
    return "GET"


def _skip_ws(text: str, idx: int) -> int:
    length = len(text)
    while idx < length and text[idx].isspace():
        idx += 1
    return idx


def _advance_quoted(text: str, idx: int) -> int:
    quote = text[idx]
    idx += 1
    length = len(text)
    while idx < length:
        if text[idx] == "\\" and idx + 1 < length:
            idx += 2
            continue
        if text[idx] == quote:
            return idx + 1
        idx += 1
    return length


def _generic_angle_delta(text: str, idx: int) -> int:
    ch = text[idx]
    if ch == "<":
        return 1
    if ch == ">" and (idx == 0 or text[idx - 1] != "="):
        return -1
    return 0


def _skip_balanced_generics(text: str, idx: int) -> int | None:
    idx = _skip_ws(text, idx)
    if idx >= len(text) or text[idx] != "<":
        return idx
    depth = 0
    while idx < len(text):
        if text[idx] in ("'", '"', "`"):
            idx = _advance_quoted(text, idx)
            continue
        depth += _generic_angle_delta(text, idx)
        idx += 1
        if depth == 0:
            return idx
    return None


def _match_call_url_arg(text: str, after_head: int) -> tuple[str, int, int] | None:
    after_gen = _skip_balanced_generics(text, after_head)
    if after_gen is None:
        return None
    arg_m = _FIRST_STRING_ARG_RE.match(text, after_gen)
    if arg_m is None:
        return None
    open_idx = text.find("(", after_gen)
    return arg_m.group(2), open_idx, arg_m.end()


def _collect_client_calls(full_text: str, rel_file: str) -> list[_FrontendCall]:
    calls: list[_FrontendCall] = []
    for match in _FRONT_CALL_HEAD_RE.finditer(full_text):
        parsed = _match_call_url_arg(full_text, match.end())
        if parsed is None:
            continue
        raw_url, open_idx, _ = parsed
        end_idx = _find_matching_paren(full_text, open_idx)
        call = _normalize_frontend_call(
            match.group(1).upper(),
            raw_url,
            rel_file,
            full_text[: match.start()].count("\n") + 1,
            full_text[:end_idx].count("\n") + 1,
        )
        if call is not None:
            calls.append(call)
    return calls


def _collect_fetch_calls(full_text: str, rel_file: str) -> list[_FrontendCall]:
    calls: list[_FrontendCall] = []
    for match in _FETCH_CALL_HEAD_RE.finditer(full_text):
        parsed = _match_call_url_arg(full_text, match.end())
        if parsed is None:
            continue
        raw_url, open_idx, arg_end = parsed
        end_idx = _find_matching_paren(full_text, open_idx)
        verb = _extract_fetch_verb(full_text[arg_end:end_idx])
        call = _normalize_frontend_call(
            verb,
            raw_url,
            rel_file,
            full_text[: match.start()].count("\n") + 1,
            full_text[:end_idx].count("\n") + 1,
        )
        if call is not None:
            calls.append(call)
    return calls


def _extract_file_frontend_calls(fpath: Path, repo_root: Path) -> list[_FrontendCall]:
    rel_file = str(fpath.relative_to(repo_root))
    full_text = _strip_js_comments(fpath.read_text(encoding="utf-8", errors="ignore"))
    return [
        *_collect_client_calls(full_text, rel_file),
        *_collect_fetch_calls(full_text, rel_file),
    ]


def _extract_frontend_calls_from_dirs(
    frontend_dirs: list[Path], repo_root: Path
) -> list[_FrontendCall]:
    calls: list[_FrontendCall] = []
    exts = (".ts", ".tsx", ".vue", ".js", ".jsx")
    for fpath in _iter_source_files(frontend_dirs, exts):
        calls.extend(_extract_file_frontend_calls(fpath, repo_root))
    return calls


def _route_matches_call(r_verb: str, r_path: str, f_verb: str, f_url: str) -> bool:
    if r_verb != f_verb and r_verb != "*":
        return False
    b_reg = "^" + normalize_route_pattern(r_path) + "$"
    norm_f = f_url.rstrip("/") if len(f_url) > 1 else f_url
    test_url = re.sub(r"\$\{[^}]+\}", "test_param", norm_f)
    if re.match(b_reg, test_url):
        return True
    f_reg_str = _frontend_url_to_regex(f_url)
    norm_b_path = r_path.rstrip("/") if len(r_path) > 1 else r_path
    norm_b_path = re.sub(r"\{[a-zA-Z0-9_]+:path\}", "path_arg", norm_b_path)
    norm_b_path = re.sub(r"\{[a-zA-Z0-9_]+(?::[a-zA-Z0-9_]+)?\}", "id_arg", norm_b_path)
    norm_b_path = re.sub(r":[a-zA-Z0-9_]+", "id_arg", norm_b_path)
    return bool(re.match(f_reg_str, norm_b_path))


def _is_whitelisted_route(verb: str, path: str) -> bool:
    return any(
        _route_matches_call(w_verb, w_path, verb, path)
        for w_verb, w_path in ARCHITECTURAL_WHITELIST
    )


def _check_skip_reason(
    repo_root: Path,
    backend_routes: list[_BackendRoute],
    frontend_calls: list[_FrontendCall],
) -> str | None:
    if not backend_routes and not frontend_calls:
        return "Modo plantilla base (0 rutas backend y 0 llamadas frontend)."
    if not frontend_calls and not _detect_frontend_dirs(repo_root):
        return (
            f"Proyecto únicamente backend ({len(backend_routes)} rutas backend, "
            "sin directorio frontend)."
        )
    if not backend_routes and not _has_backend_dir(repo_root):
        return (
            f"Proyecto únicamente frontend ({len(frontend_calls)} llamadas frontend, "
            "sin directorio backend)."
        )
    return None


def _read_file_lines_cached(
    repo_root: Path, rel_file: str, file_cache: dict[str, list[str]]
) -> list[str]:
    if rel_file not in file_cache:
        try:
            text = (repo_root / rel_file).read_text(encoding="utf-8", errors="ignore")
            file_cache[rel_file] = text.splitlines()
        except OSError:
            file_cache[rel_file] = []
    return file_cache[rel_file]


def _is_line_parity_ignored(
    repo_root: Path,
    rel_file: str,
    line_no: int,
    end_line_no: int,
    file_cache: dict[str, list[str]],
) -> bool:
    lines = _read_file_lines_cached(repo_root, rel_file, file_cache)
    if not lines:
        return False
    if line_no >= 2 and line_no - 2 < len(lines):
        if _COMMENT_ONLY_IGNORE_RE.match(lines[line_no - 2]):
            return True
    start_idx = max(0, line_no - 1)
    end_idx = min(len(lines), max(line_no, end_line_no))
    return any(
        _PARITY_IGNORE_RE.search(lines[idx]) for idx in range(start_idx, end_idx)
    )


def _find_unmatched_frontend(
    repo_root: Path,
    backend_routes: list[_BackendRoute],
    frontend_calls: list[_FrontendCall],
    file_cache: dict[str, list[str]],
) -> list[_FrontendCall]:
    unmatched: list[_FrontendCall] = []
    for call in frontend_calls:
        if any(
            _route_matches_call(r.verb, r.path, call.verb, call.url)
            for r in backend_routes
        ):
            continue
        if _is_whitelisted_route(call.verb, call.url):
            continue
        if not _is_line_parity_ignored(
            repo_root, call.rel_file, call.line_no, call.end_line_no, file_cache
        ):
            unmatched.append(call)
    return unmatched


def _find_orphan_backend(
    repo_root: Path,
    backend_routes: list[_BackendRoute],
    frontend_calls: list[_FrontendCall],
    file_cache: dict[str, list[str]],
) -> list[_BackendRoute]:
    orphans: list[_BackendRoute] = []
    for route in backend_routes:
        if _is_whitelisted_route(route.verb, route.path):
            continue
        if any(
            _route_matches_call(route.verb, route.path, call.verb, call.url)
            for call in frontend_calls
        ):
            continue
        if not _is_line_parity_ignored(
            repo_root, route.rel_file, route.line_no, route.end_line_no, file_cache
        ):
            orphans.append(route)
    return orphans


def _collect_generic_pair(
    repo_root: Path,
) -> tuple[list[_BackendRoute], list[_FrontendCall]]:
    fe_candidate = repo_root / "frontend" / "src"
    fe_dirs = [fe_candidate] if fe_candidate.exists() else []
    root_src = repo_root / "src"
    if (
        not fe_dirs
        and not (repo_root / "vue3" / "src").exists()
        and not (repo_root / "react-frontend" / "src").exists()
        and root_src.exists()
        and ((root_src / "components").exists() or (root_src / "views").exists())
    ):
        fe_dirs = [root_src]
    be_routes: list[_BackendRoute] = []
    backend_src = repo_root / "backend" / "src"
    if _has_fastapi_markers(backend_src):
        be_routes.extend(_extract_fastapi_routes_from_src(backend_src, repo_root))
    elif _has_fastapi_markers(root_src):
        be_routes.extend(_extract_fastapi_routes_from_src(root_src, repo_root))
    if backend_src.exists():
        be_routes.extend(_extract_node_routes_from_dirs([backend_src], repo_root))
    fe_calls = _extract_frontend_calls_from_dirs(fe_dirs, repo_root) if fe_dirs else []
    return be_routes, fe_calls


def _collect_stack_pairs(
    repo_root: Path,
) -> list[tuple[list[_BackendRoute], list[_FrontendCall]]]:
    pairs: list[tuple[list[_BackendRoute], list[_FrontendCall]]] = []
    vue_dir = repo_root / "vue3" / "src"
    fa_dir = repo_root / "fastapi" / "src"
    pairs.append(
        (
            _extract_fastapi_routes_from_src(fa_dir, repo_root)
            if _has_fastapi_markers(fa_dir)
            else [],
            _extract_frontend_calls_from_dirs([vue_dir], repo_root)
            if vue_dir.exists()
            else [],
        )
    )
    react_dir = repo_root / "react-frontend" / "src"
    node_dir = repo_root / "node-backend" / "src"
    pairs.append(
        (
            _extract_node_routes_from_dirs([node_dir], repo_root)
            if node_dir.exists()
            else [],
            _extract_frontend_calls_from_dirs([react_dir], repo_root)
            if react_dir.exists()
            else [],
        )
    )
    pairs.append(_collect_generic_pair(repo_root))
    return pairs


def _report_parity_failures(
    unmatched_frontend: list[_FrontendCall],
    orphan_backend: list[_BackendRoute],
) -> int:
    if unmatched_frontend:
        print(
            f"❌ Se detectaron {len(unmatched_frontend)} llamada(s) en frontend "
            "hacia endpoints inexistentes (404/405):"
        )
        for call in unmatched_frontend:
            print(f"   - [{call.verb}] {call.url} en {call.rel_file}:{call.line_no}")
    if orphan_backend:
        print(
            f"❌ Se detectaron {len(orphan_backend)} endpoint(s) backend "
            "huérfano(s) sin consumo en frontend:"
        )
        for route in orphan_backend:
            print(f"   - [{route.verb}] {route.path} en {route.rel_file}")
    print(
        "Directiva Incumplida: Terminal ↔ Frontend Parity "
        "(.agents/rules/frontend_parity_and_closure.md)"
    )
    return 1


def main(target_root: Path | None = None, exit_skipped_code: int = 0) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    pairs = _collect_stack_pairs(repo_root)
    all_backend = [r for b_routes, _ in pairs for r in b_routes]
    all_frontend = [c for _, f_calls in pairs for c in f_calls]

    skip_reason = _check_skip_reason(repo_root, all_backend, all_frontend)
    if skip_reason is not None:
        print(f"⚠️ SKIPPED [API Parity]: {skip_reason}")
        return exit_skipped_code

    file_cache: dict[str, list[str]] = {}
    unmatched_frontend: list[_FrontendCall] = []
    orphan_backend: list[_BackendRoute] = []
    for pair_backend, pair_frontend in pairs:
        unmatched_frontend.extend(
            _find_unmatched_frontend(repo_root, pair_backend, pair_frontend, file_cache)
        )
        orphan_backend.extend(
            _find_orphan_backend(repo_root, pair_backend, pair_frontend, file_cache)
        )

    if unmatched_frontend or orphan_backend:
        return _report_parity_failures(unmatched_frontend, orphan_backend)

    print(
        f"✔ [API Parity] {len(all_backend)} rutas backend ↔ "
        f"{len(all_frontend)} llamadas frontend (0 errores 404/405, 0 huérfanos)."
    )
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita paridad bidireccional de endpoints API Front-Back."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--workspace", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    target = args.workspace if args.workspace is not None else args.target_root
    return main(
        target_root=target,
        exit_skipped_code=args.exit_skipped_code,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
