#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_no_orphan_api_endpoints.py — Invariante de Cero Endpoints de API Huérfanos.

Audita bidireccionalmente:
1. Que el 100% de las llamadas `http.<verb>` en el frontend coincidan con rutas de
   backend registradas en FastAPI o Node.js (0 llamadas 404/405).
2. Que los endpoints operativos del backend estén referenciados en el frontend o
   declarados en la lista blanca arquitectónica (`ARCHITECTURAL_WHITELIST`).

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

ARCHITECTURAL_WHITELIST: set[tuple[str, str]] = {
    ("GET", "/health"),
    ("GET", "/api/v1/health"),
    ("GET", "/metrics"),
    ("GET", "/api/v1/metrics/fleet"),
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
    r'\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*([`\'"])(.*?)\2',
    re.IGNORECASE,
)
_FRONT_CALL_RE = re.compile(
    r'\b(?:http|api|axios)\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*([`\'"])(.*?)\2',
    re.DOTALL,
)
_ADD_API_ROUTE_RE = re.compile(
    r'add_api_route\(\s*["\']([^"\']+)["\'],[^,]+methods=\[["\']([A-Z]+)["\']\]'
)
_ALLOWED_API_PREFIXES = ("/api/v1", "api/v1", "/health", "/users/me")


def normalize_route_pattern(path: str) -> str:
    """Normaliza parámetros de ruta ({param} o :param) a comodines regex."""
    path = path.rstrip("/") if len(path) > 1 else path
    path = re.sub(r"\{[a-zA-Z0-9_]+:path\}", r".+", path)
    path = re.sub(r"\{[a-zA-Z0-9_]+\}", r"[^/]+", path)
    path = re.sub(r":[a-zA-Z0-9_]+", r"[^/]+", path)
    return path


def _find_fastapi_src(repo_root: Path) -> Path | None:
    candidates = (
        repo_root / "fastapi" / "src",
        repo_root / "backend" / "src",
        repo_root / "src",
    )
    return next(
        (c for c in candidates if (c / "api").exists() or (c / "main.py").exists()),
        None,
    )


def _extract_main_py_routes(
    main_py: Path, repo_root: Path
) -> list[tuple[str, str, str]]:
    if not main_py.exists():
        return []
    rel_file = str(main_py.relative_to(repo_root))
    content = main_py.read_text(encoding="utf-8", errors="ignore")
    routes = [
        (m.group(2), m.group(1), rel_file)
        for m in _ADD_API_ROUTE_RE.finditer(content)
    ]
    if "Instrumentator" in content:
        routes.append(("GET", "/metrics", rel_file))
    return routes


def _is_router_factory(func: ast.expr) -> bool:
    if isinstance(func, ast.Name):
        return func.id in ("APIRouter", "FastAPI")
    if isinstance(func, ast.Attribute):
        return func.attr in ("APIRouter", "FastAPI")
    return False


def _extract_router_assignment(node: ast.Assign) -> tuple[str, str] | None:
    if not isinstance(node.value, ast.Call) or not _is_router_factory(node.value.func):
        return None
    name_target = next((t.id for t in node.targets if isinstance(t, ast.Name)), None)
    if name_target is None:
        return None
    prefix = ""
    for kw in node.value.keywords:
        if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
            prefix = str(kw.value.value)
    return name_target, prefix


def _extract_router_prefixes(tree: ast.AST) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
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


def _build_full_route_path(
    r_prefix: str, sub_path: str, dir_parts: tuple[str, ...]
) -> str:
    norm_r = (
        r_prefix
        if r_prefix.startswith("/")
        else ("/" + r_prefix if r_prefix else "")
    )
    base_prefix = (
        "/api/v1"
        if ("v1" in dir_parts and not norm_r.startswith("/api/v1"))
        else ""
    )
    norm_sub = (
        sub_path
        if sub_path.startswith("/")
        else ("/" + sub_path if sub_path else "")
    )
    full_path = (base_prefix + norm_r).rstrip("/") + norm_sub
    return full_path or "/"


def _extract_decorator_route(
    deco: ast.expr,
    router_prefixes: dict[str, str],
    dir_parts: tuple[str, ...],
) -> tuple[str, str] | None:
    if not isinstance(deco, ast.Call) or not isinstance(deco.func, ast.Attribute):
        return None
    verb = deco.func.attr.upper()
    if verb not in _HTTP_VERBS:
        return None
    r_var = _router_var_name(deco.func.value)
    sub_path = (
        str(deco.args[0].value)
        if deco.args and isinstance(deco.args[0], ast.Constant)
        else ""
    )
    full_path = _build_full_route_path(
        router_prefixes.get(r_var, ""), sub_path, dir_parts
    )
    return verb, full_path


def _parse_ast_safe(fpath: Path) -> ast.AST | None:
    code = fpath.read_text(encoding="utf-8", errors="ignore")
    try:
        return ast.parse(code, filename=str(fpath))
    except SyntaxError:
        return None


def _extract_func_routes(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    router_prefixes: dict[str, str],
    dir_parts: tuple[str, ...],
    rel_file: str,
) -> list[tuple[str, str, str]]:
    found: list[tuple[str, str, str]] = []
    for deco in node.decorator_list:
        parsed = _extract_decorator_route(deco, router_prefixes, dir_parts)
        if parsed is not None:
            found.append((parsed[0], parsed[1], rel_file))
    return found


def _parse_fastapi_file(fpath: Path, repo_root: Path) -> list[tuple[str, str, str]]:
    tree = _parse_ast_safe(fpath)
    if tree is None:
        return []

    rel_file = str(fpath.relative_to(repo_root))
    router_prefixes = _extract_router_prefixes(tree)
    dir_parts = fpath.parent.parts
    routes: list[tuple[str, str, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            routes.extend(
                _extract_func_routes(node, router_prefixes, dir_parts, rel_file)
            )
    return routes


def _is_source_file(fname: str, extensions: tuple[str, ...]) -> bool:
    test_suffixes = (".unit.ts", ".unit.tsx", ".spec.ts", ".test.ts")
    return fname.endswith(extensions) and not fname.endswith(test_suffixes)


def _iter_source_files(
    directories: list[Path], extensions: tuple[str, ...]
) -> Iterator[Path]:
    for base_dir in (d for d in directories if d.exists()):
        for root, _, files in os.walk(base_dir):
            for fname in sorted(files):
                if _is_source_file(fname, extensions):
                    yield Path(root) / fname


def extract_fastapi_routes(repo_root: Path) -> list[tuple[str, str, str]]:
    """Extrae las rutas y métodos registrados en FastAPI."""
    backend_src = _find_fastapi_src(repo_root)
    if backend_src is None:
        return []

    routes = _extract_main_py_routes(backend_src / "main.py", repo_root)
    api_dir = backend_src / "api"
    search_dir = api_dir if api_dir.exists() else backend_src
    for root, _, files in os.walk(search_dir):
        for fname in sorted(files):
            if fname.endswith(".py"):
                routes.extend(_parse_fastapi_file(Path(root) / fname, repo_root))
    return routes


def _extract_node_file_routes(
    fpath: Path, repo_root: Path
) -> list[tuple[str, str, str]]:
    rel_file = str(fpath.relative_to(repo_root))
    text = fpath.read_text(encoding="utf-8", errors="ignore")
    routes: list[tuple[str, str, str]] = []
    for match in _NODE_ROUTE_RE.finditer(text):
        raw_path = match.group(3).strip()
        if raw_path.startswith("/"):
            routes.append((match.group(1).upper(), raw_path, rel_file))
    return routes


def extract_node_routes(repo_root: Path) -> list[tuple[str, str, str]]:
    """Extrae rutas Express/Fastify en node-backend/src o backend/src."""
    routes: list[tuple[str, str, str]] = []
    candidates = [repo_root / "node-backend" / "src", repo_root / "backend" / "src"]
    for fpath in _iter_source_files(candidates, (".ts", ".js")):
        routes.extend(_extract_node_file_routes(fpath, repo_root))
    return routes


def _strip_dynamic_query_suffix(raw_url: str) -> str:
    """Elimina ternarios con '?' o query strings pegadas al final de un segmento."""
    cleaned = re.sub(r"\$\{[^}]*\?[^}]*\}", "", raw_url)
    cleaned = cleaned.split("?")[0]
    cleaned = re.sub(r"([a-zA-Z0-9_}\]])\$\{[^}]+\}$", r"\1", cleaned)
    return cleaned.rstrip("/") if len(cleaned) > 1 else cleaned


def _frontend_url_to_regex(f_url: str) -> str:
    """Convierte URL frontend con template strings a regex de matching."""
    norm_f = f_url.rstrip("/") if len(f_url) > 1 else f_url
    with_subpath = re.sub(
        r"/\$\{\s*(?:sub_?path|path|endpoint|route|rest|resource_?path)\b[^}]*\}$",
        r"/.+",
        norm_f,
        flags=re.IGNORECASE,
    )
    return "^" + re.sub(r"\$\{[^}]+\}", r"[^/]+", with_subpath) + "$"


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
        any(d.exists() for d in candidates)
        or (repo_root / "src" / "main.py").exists()
    )


def _extract_file_frontend_calls(
    fpath: Path, repo_root: Path
) -> list[tuple[str, str, str, int]]:
    rel_file = str(fpath.relative_to(repo_root))
    full_text = fpath.read_text(encoding="utf-8", errors="ignore")
    calls: list[tuple[str, str, str, int]] = []
    for match in _FRONT_CALL_RE.finditer(full_text):
        raw_url = re.sub(r"\s+", "", match.group(3).strip())
        if not raw_url.startswith(_ALLOWED_API_PREFIXES):
            continue
        if not raw_url.startswith("/"):
            raw_url = "/" + raw_url
        clean_url = _strip_dynamic_query_suffix(raw_url)
        line_no = full_text[: match.start()].count("\n") + 1
        calls.append((match.group(1).upper(), clean_url, rel_file, line_no))
    return calls


def extract_frontend_calls(repo_root: Path) -> list[tuple[str, str, str, int]]:
    """Extrae llamadas HTTP desde vue3/src/, react-frontend/src/, frontend/src/."""
    frontend_dirs = _detect_frontend_dirs(repo_root)
    if not frontend_dirs:
        return []

    calls: list[tuple[str, str, str, int]] = []
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
    norm_b_path = re.sub(r"\{[a-zA-Z0-9_]+\}", "id_arg", norm_b_path)
    norm_b_path = re.sub(r":[a-zA-Z0-9_]+", "id_arg", norm_b_path)
    return bool(re.match(f_reg_str, norm_b_path))


def _is_whitelisted_route(verb: str, path: str) -> bool:
    return any(
        _route_matches_call(w_verb, w_path, verb, path)
        for w_verb, w_path in ARCHITECTURAL_WHITELIST
    )


def _check_skip_reason(
    repo_root: Path,
    backend_routes: list[tuple[str, str, str]],
    frontend_calls: list[tuple[str, str, str, int]],
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


def _find_unmatched_frontend(
    backend_routes: list[tuple[str, str, str]],
    frontend_calls: list[tuple[str, str, str, int]],
) -> list[tuple[str, str, str, int]]:
    unmatched: list[tuple[str, str, str, int]] = []
    for verb, url, rel_file, line_no in frontend_calls:
        matched = any(
            _route_matches_call(r_verb, r_path, verb, url)
            for r_verb, r_path, _ in backend_routes
        )
        if not matched and not _is_whitelisted_route(verb, url):
            unmatched.append((verb, url, rel_file, line_no))
    return unmatched


def _has_parity_ignore(
    repo_root: Path, rel_file: str, file_cache: dict[str, str]
) -> bool:
    if rel_file not in file_cache:
        try:
            file_cache[rel_file] = (repo_root / rel_file).read_text(
                encoding="utf-8", errors="ignore"
            )
        except OSError:
            file_cache[rel_file] = ""
    return "api-parity-ignore" in file_cache[rel_file]


def _find_orphan_backend(
    repo_root: Path,
    backend_routes: list[tuple[str, str, str]],
    frontend_calls: list[tuple[str, str, str, int]],
) -> list[tuple[str, str, str]]:
    orphans: list[tuple[str, str, str]] = []
    file_cache: dict[str, str] = {}
    for r_verb, r_path, rel_file in backend_routes:
        if _is_whitelisted_route(r_verb, r_path):
            continue
        if any(
            _route_matches_call(r_verb, r_path, f_verb, f_url)
            for f_verb, f_url, _, _ in frontend_calls
        ):
            continue
        if not _has_parity_ignore(repo_root, rel_file, file_cache):
            orphans.append((r_verb, r_path, rel_file))
    return orphans


def _report_parity_failures(
    unmatched_frontend: list[tuple[str, str, str, int]],
    orphan_backend: list[tuple[str, str, str]],
) -> int:
    if unmatched_frontend:
        print(
            f"❌ Se detectaron {len(unmatched_frontend)} llamada(s) en frontend "
            "hacia endpoints inexistentes (404/405):"
        )
        for verb, url, rel_file, line_no in unmatched_frontend:
            print(f"   - [{verb}] {url} en {rel_file}:{line_no}")
    if orphan_backend:
        print(
            f"❌ Se detectaron {len(orphan_backend)} endpoint(s) backend "
            "huérfano(s) sin consumo en frontend:"
        )
        for r_verb, r_path, rel_file in orphan_backend:
            print(f"   - [{r_verb}] {r_path} en {rel_file}")
    print(
        "Directiva Incumplida: Terminal ↔ Frontend Parity "
        "(.agents/rules/frontend_parity_and_closure.md)"
    )
    return 1


def main(target_root: Path | None = None, exit_skipped_code: int = 0) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    backend_routes = extract_fastapi_routes(repo_root) + extract_node_routes(
        repo_root
    )
    frontend_calls = extract_frontend_calls(repo_root)

    skip_reason = _check_skip_reason(repo_root, backend_routes, frontend_calls)
    if skip_reason is not None:
        print(f"⚠️ SKIPPED [API Parity]: {skip_reason}")
        return exit_skipped_code

    unmatched_frontend = _find_unmatched_frontend(backend_routes, frontend_calls)
    orphan_backend = _find_orphan_backend(repo_root, backend_routes, frontend_calls)
    if unmatched_frontend or orphan_backend:
        return _report_parity_failures(unmatched_frontend, orphan_backend)

    print(
        f"✔ [API Parity] {len(backend_routes)} rutas backend ↔ "
        f"{len(frontend_calls)} llamadas frontend (0 errores 404/405, 0 huérfanos)."
    )
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita paridad bidireccional de endpoints API Front-Back."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    return main(
        target_root=args.target_root,
        exit_skipped_code=args.exit_skipped_code,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
