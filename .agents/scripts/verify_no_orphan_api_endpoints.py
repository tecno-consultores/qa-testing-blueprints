#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_no_orphan_api_endpoints.py — Invariante de Cero Endpoints de API Huérfanos.

Audita bidireccionalmente:
1. Que el 100% de las llamadas `http.<verb>` en el frontend (`vue3/src/`, `react-frontend/src/` o `src/`)
   coincidan con rutas de backend registradas en FastAPI o Node.js (0 llamadas 404/405).
2. Que los endpoints operativos del backend estén referenciados en el frontend o declarados en la
   lista blanca arquitectónica (`ARCHITECTURAL_WHITELIST`).

Si el proyecto es únicamente backend o únicamente frontend (o aún no posee rutas implementadas),
la verificación se aprueba de forma determinista con código 0.
"""

import ast
import os
import re
import sys
from pathlib import Path

# Lista Blanca Arquitectónica (Observabilidad, MCP, Salud, Pre-Auth y Contratos Externos)
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


def normalize_route_pattern(path: str) -> str:
    """Normaliza parámetros de ruta ({param} o :param) a comodines regex para matching flexible."""
    path = path.rstrip("/") if len(path) > 1 else path
    path = re.sub(r"\{[a-zA-Z0-9_]+:path\}", r".+", path)
    path = re.sub(r"\{[a-zA-Z0-9_]+\}", r"[^/]+", path)
    path = re.sub(r":[a-zA-Z0-9_]+", r"[^/]+", path)
    return path


def extract_fastapi_routes(repo_root: Path) -> list[tuple[str, str, str]]:
    """Extrae las rutas y métodos registrados en FastAPI."""
    routes: list[tuple[str, str, str]] = []
    candidates = [repo_root / "fastapi" / "src", repo_root / "backend" / "src", repo_root / "src"]
    backend_src = next((c for c in candidates if (c / "api").exists() or (c / "main.py").exists()), None)
    if not backend_src:
        return routes

    main_py = backend_src / "main.py"
    if main_py.exists():
        content = main_py.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'add_api_route\(\s*["\']([^"\']+)["\'],[^,]+methods=\[["\']([A-Z]+)["\']\]', content):
            routes.append((m.group(2), m.group(1), str(main_py.relative_to(repo_root))))
        if "Instrumentator" in content:
            routes.append(("GET", "/metrics", str(main_py.relative_to(repo_root))))

    api_dir = backend_src / "api"
    search_dir = api_dir if api_dir.exists() else backend_src
    for root, _, files in os.walk(search_dir):
        for f in files:
            if not f.endswith(".py"):
                continue
            fpath = Path(root) / f
            rel_file = str(fpath.relative_to(repo_root))
            code = fpath.read_text(encoding="utf-8", errors="ignore")
            try:
                tree = ast.parse(code, filename=str(fpath))
            except SyntaxError:
                continue

            router_var_prefixes: dict[str, str] = {}
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and isinstance(node.value, ast.Call):
                            func = node.value.func
                            is_apirouter = (isinstance(func, ast.Name) and func.id in ("APIRouter", "FastAPI")) or (
                                isinstance(func, ast.Attribute) and func.attr in ("APIRouter", "FastAPI")
                            )
                            if is_apirouter:
                                prefix = ""
                                for kw in node.value.keywords:
                                    if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                                        prefix = str(kw.value.value)
                                router_var_prefixes[target.id] = prefix

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for deco in node.decorator_list:
                        if isinstance(deco, ast.Call) and isinstance(deco.func, ast.Attribute):
                            verb = deco.func.attr.upper()
                            if verb in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                                r_var = ""
                                if isinstance(deco.func.value, ast.Name):
                                    r_var = deco.func.value.id
                                elif isinstance(deco.func.value, ast.Attribute):
                                    r_var = deco.func.value.attr

                                sub_path = ""
                                if deco.args and isinstance(deco.args[0], ast.Constant):
                                    sub_path = str(deco.args[0].value)

                                r_prefix = router_var_prefixes.get(r_var, "")
                                norm_r_prefix = (
                                    r_prefix if r_prefix.startswith("/") else ("/" + r_prefix if r_prefix else "")
                                )
                                base_prefix = (
                                    "/api/v1"
                                    if ("v1" in Path(root).parts and not norm_r_prefix.startswith("/api/v1"))
                                    else ""
                                )
                                full_path = base_prefix + norm_r_prefix
                                full_path = full_path.rstrip("/") + (
                                    sub_path if sub_path.startswith("/") else ("/" + sub_path if sub_path else "")
                                )
                                routes.append((verb, full_path or "/", rel_file))

    return routes


def extract_node_routes(repo_root: Path) -> list[tuple[str, str, str]]:
    """Extrae rutas Express/Fastify registradas en node-backend/src o backend/src."""
    routes: list[tuple[str, str, str]] = []
    candidates = [repo_root / "node-backend" / "src", repo_root / "backend" / "src"]
    route_re = re.compile(r'\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*([`\'"])(.*?)\2', re.IGNORECASE)
    for node_src in candidates:
        if not node_src.exists():
            continue
        for root, _, files in os.walk(node_src):
            for f in files:
                if not f.endswith((".ts", ".js")):
                    continue
                if f.endswith((".unit.ts", ".spec.ts", ".test.ts")):
                    continue
                fpath = Path(root) / f
                rel_file = str(fpath.relative_to(repo_root))
                text = fpath.read_text(encoding="utf-8", errors="ignore")
                for m in route_re.finditer(text):
                    verb = m.group(1).upper()
                    raw_path = m.group(3).strip()
                    if raw_path.startswith("/"):
                        routes.append((verb, raw_path, rel_file))
    return routes


def _strip_dynamic_query_suffix(raw_url: str) -> str:
    """Elimina ternarios con '?' o interpolaciones de query pegadas sin '/' al final de un segmento."""
    cleaned = re.sub(r"\$\{[^}]*\?[^}]*\}", "", raw_url)
    cleaned = cleaned.split("?")[0]
    cleaned = re.sub(r"([a-zA-Z0-9_}\]])\$\{[^}]+\}$", r"\1", cleaned)
    return cleaned.rstrip("/") if len(cleaned) > 1 else cleaned


def _frontend_url_to_regex(f_url: str) -> str:
    """Convierte una URL de frontend con template strings a expresión regular de matching."""
    norm_f = f_url.rstrip("/") if len(f_url) > 1 else f_url
    with_subpath = re.sub(
        r"/\$\{\s*(?:sub_?path|path|endpoint|route|rest|resource_?path)\b[^}]*\}$",
        r"/.+",
        norm_f,
        flags=re.IGNORECASE,
    )
    return "^" + re.sub(r"\$\{[^}]+\}", r"[^/]+", with_subpath) + "$"


def extract_frontend_calls(repo_root: Path) -> list[tuple[str, str, str, int]]:
    """Extrae llamadas HTTP desde vue3/src/, react-frontend/src/, frontend/src/ o src/."""
    calls: list[tuple[str, str, str, int]] = []
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
    if not frontend_dirs and root_src.exists() and ((root_src / "components").exists() or (root_src / "views").exists()):
        frontend_dirs.append(root_src)
    if not frontend_dirs:
        return calls

    call_pattern = re.compile(
        r'\b(?:http|api|axios)\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*([`\'"])(.*?)\2',
        re.DOTALL,
    )

    for front_src in frontend_dirs:
        for root, _, files in os.walk(front_src):
            for f in files:
                if not f.endswith((".ts", ".tsx", ".vue", ".js", ".jsx")):
                    continue
                if f.endswith((".unit.ts", ".unit.tsx", ".spec.ts", ".test.ts")):
                    continue
                fpath = Path(root) / f
                rel_file = str(fpath.relative_to(repo_root))
                full_text = fpath.read_text(encoding="utf-8", errors="ignore")
                for m in call_pattern.finditer(full_text):
                    verb = m.group(1).upper()
                    raw_url = re.sub(r"\s+", "", m.group(3).strip())
                    if not raw_url.startswith(("/api/v1", "api/v1", "/health", "/users/me")):
                        continue
                    if not raw_url.startswith("/"):
                        raw_url = "/" + raw_url
                    clean_url = _strip_dynamic_query_suffix(raw_url)
                    line_no = full_text[: m.start()].count("\n") + 1
                    calls.append((verb, clean_url, rel_file, line_no))

    return calls


def _route_matches_call(r_verb: str, r_path: str, f_verb: str, f_url: str) -> bool:
    if r_verb != f_verb and r_verb != "*":
        return False
    b_reg = "^" + normalize_route_pattern(r_path) + "$"
    test_url = re.sub(r"\$\{[^}]+\}", "test_param", f_url.rstrip("/") if len(f_url) > 1 else f_url)
    if re.match(b_reg, test_url):
        return True
    f_reg_str = _frontend_url_to_regex(f_url)
    norm_b_path = r_path.rstrip("/") if len(r_path) > 1 else r_path
    norm_b_path = re.sub(r"\{[a-zA-Z0-9_]+:path\}", "path_arg", norm_b_path)
    norm_b_path = re.sub(r"\{[a-zA-Z0-9_]+\}", "id_arg", norm_b_path)
    norm_b_path = re.sub(r":[a-zA-Z0-9_]+", "id_arg", norm_b_path)
    return bool(re.match(f_reg_str, norm_b_path))


def _is_whitelisted_route(verb: str, path: str) -> bool:
    for w_verb, w_path in ARCHITECTURAL_WHITELIST:
        if _route_matches_call(w_verb, w_path, verb, path):
            return True
    return False


def main(target_root: Path | None = None) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    backend_routes = extract_fastapi_routes(repo_root) + extract_node_routes(repo_root)
    frontend_calls = extract_frontend_calls(repo_root)

    if not backend_routes and not frontend_calls:
        print("✔ [API Parity] Modo plantilla base (0 rutas/llamadas activas).")
        return 0

    if not backend_routes or not frontend_calls:
        print(f"✔ [API Parity] Proyecto mono-capa ({len(backend_routes)} rutas backend, {len(frontend_calls)} llamadas frontend).")
        return 0

    unmatched_frontend = []
    for verb, url, rel_file, line_no in frontend_calls:
        matched = any(_route_matches_call(r_verb, r_path, verb, url) for r_verb, r_path, _ in backend_routes)
        if not matched:
            matched = _is_whitelisted_route(verb, url)
        if not matched:
            unmatched_frontend.append((verb, url, rel_file, line_no))

    orphan_backend = []
    file_cache: dict[str, str] = {}
    for r_verb, r_path, rel_file in backend_routes:
        if _is_whitelisted_route(r_verb, r_path):
            continue
        if any(_route_matches_call(r_verb, r_path, f_verb, f_url) for f_verb, f_url, _, _ in frontend_calls):
            continue
        if rel_file not in file_cache:
            try:
                file_cache[rel_file] = (repo_root / rel_file).read_text(encoding="utf-8", errors="ignore")
            except OSError:
                file_cache[rel_file] = ""
        if "api-parity-ignore" in file_cache[rel_file]:
            continue
        orphan_backend.append((r_verb, r_path, rel_file))

    if unmatched_frontend or orphan_backend:
        if unmatched_frontend:
            print(
                f"❌ Se detectaron {len(unmatched_frontend)} llamada(s) en frontend hacia endpoints inexistentes (404/405):"
            )
            for verb, url, rel_file, line_no in unmatched_frontend:
                print(f"   - [{verb}] {url} en {rel_file}:{line_no}")
        if orphan_backend:
            print(
                f"❌ Se detectaron {len(orphan_backend)} endpoint(s) backend huérfano(s) sin consumo en frontend:"
            )
            for r_verb, r_path, rel_file in orphan_backend:
                print(f"   - [{r_verb}] {r_path} en {rel_file}")
        print("Directiva Incumplida: Terminal ↔ Frontend Parity (.agents/rules/frontend_parity_and_closure.md)")
        return 1

    print(f"✔ [API Parity] {len(backend_routes)} rutas backend ↔ {len(frontend_calls)} llamadas frontend (0 errores 404/405, 0 huérfanos).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
