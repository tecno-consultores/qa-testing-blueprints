#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_zero_orphan_vue_components.py — Invariante de Cero Componentes UI Huérfanos.

Audita que cada archivo .vue, .tsx o .jsx posea su correspondiente suite
.unit/.spec/.test dedicada o esté directamente testeado en una suite unitaria activa.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Iterator
from pathlib import Path

_UNIT_SUFFIXES = (
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
    ".test.vue",
)
_UI_EXTENSIONS = frozenset({".vue", ".tsx", ".jsx"})
_CODE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".vue"})
_COMPOUND_TEST_EXTS = frozenset({".unit", ".spec", ".test"})
_NON_COMPONENT_FILES = frozenset(
    {"main.tsx", "main.jsx", "index.tsx", "index.jsx", "vite-env.d.ts"}
)
_HOOK_FILE_RE = re.compile(r"^use[A-Z].*\.(?:tsx|jsx)$")
_JS_COMMENT_OR_STR_RE = re.compile(
    r"(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)"
    r"|(/\*[\s\S]*?\*/|//[^\n]*|<!--[\s\S]*?-->)"
)


_IGNORED_DIRS = frozenset({"node_modules", "dist", ".git"})


def _iter_files(directories: list[Path]) -> Iterator[Path]:
    for directory in directories:
        for root, dirnames, files in os.walk(directory):
            dirnames[:] = sorted(d for d in dirnames if d not in _IGNORED_DIRS)
            for fname in sorted(files):
                yield Path(root) / fname


def _strip_compound_suffix(path_or_name: str) -> str:
    """Extrae el stem removiendo sufijos compuestos (.unit/.spec/.test + ext)."""
    stem, ext = os.path.splitext(path_or_name)
    if ext not in _CODE_EXTENSIONS:
        return stem
    inner_stem, inner_ext = os.path.splitext(stem)
    if inner_ext in _COMPOUND_TEST_EXTS:
        return inner_stem
    return stem


def _is_ui_component(filename: str) -> bool:
    if filename.endswith((".d.ts", *_UNIT_SUFFIXES)):
        return False
    if filename in _NON_COMPONENT_FILES or _HOOK_FILE_RE.match(filename):
        return False
    _, ext = os.path.splitext(filename)
    return ext in _UI_EXTENSIONS


def _scan_frontend_files(frontend_dirs: list[Path]) -> tuple[list[str], set[str]]:
    ui_files: list[str] = []
    unit_files_set: set[str] = set()
    for path in _iter_files(frontend_dirs):
        if _is_ui_component(path.name):
            ui_files.append(str(path))
        if path.name.endswith(_UNIT_SUFFIXES):
            unit_files_set.add(str(path))
    return ui_files, unit_files_set


def _scan_test_dir_files(test_dirs: list[Path]) -> set[str]:
    unit_files_set: set[str] = set()
    for path in _iter_files(test_dirs):
        if path.name.endswith(_UNIT_SUFFIXES):
            unit_files_set.add(str(path))
    return unit_files_set


def _collect_frontend_roots(repo_root: Path) -> list[tuple[Path, Path | None]]:
    roots: list[tuple[Path, Path | None]] = []
    for stack_name in ("vue3", "react-frontend", "frontend"):
        stack_src = repo_root / stack_name / "src"
        if stack_src.exists():
            roots.append((stack_src, repo_root / stack_name))
    root_src = repo_root / "src"
    if (
        not roots
        and root_src.exists()
        and any((root_src / d).exists() for d in ("components", "views", "pages"))
    ):
        roots.append((root_src, None))
    return roots


def _collect_shared_test_dirs(repo_root: Path, root_scope: Path | None) -> list[Path]:
    base = root_scope if root_scope is not None else repo_root
    return [base / tname for tname in ("tests", "test") if (base / tname).exists()]


def _collect_ui_and_unit_groups(
    repo_root: Path,
) -> tuple[list[tuple[list[str], list[str]]], list[str], list[str]]:
    groups: list[tuple[list[str], list[str]]] = []
    all_ui: set[str] = set()
    all_units: set[str] = set()
    for src_dir, stack_scope in _collect_frontend_roots(repo_root):
        ui_files, unit_set = _scan_frontend_files([src_dir])
        test_dirs = _collect_shared_test_dirs(repo_root, stack_scope)
        if stack_scope is not None:
            for tname in ("tests", "test"):
                root_t = repo_root / tname
                if root_t.exists():
                    test_dirs.append(root_t)
        unit_set.update(_scan_test_dir_files(test_dirs))
        groups.append((sorted(ui_files), sorted(unit_set)))
        all_ui.update(ui_files)
        all_units.update(unit_set)
    return groups, sorted(all_ui), sorted(all_units)


def _candidate_unit_names(name: str) -> set[str]:
    camel_name = name[0].lower() + name[1:] if name else name
    candidates: set[str] = set()
    for sfx in _UNIT_SUFFIXES:
        candidates.add(f"{name}{sfx}")
        candidates.add(f"{camel_name}{sfx}")
    return candidates


def _has_direct_unit(uf: str, name: str, unit_basenames: set[str]) -> bool:
    uf_stem = _strip_compound_suffix(uf)
    for sfx in _UNIT_SUFFIXES:
        if os.path.exists(f"{uf_stem}{sfx}"):
            return True
    return bool(_candidate_unit_names(name) & unit_basenames)


def _strip_js_comments(content: str) -> str:
    """Elimina comentarios JS/TS/HTML preservando literales de cadena."""
    return _JS_COMMENT_OR_STR_RE.sub(
        lambda m: m.group(1) if m.group(1) is not None else " ",
        content,
    )


def _build_usage_patterns(base: str, name: str) -> tuple[re.Pattern[str], ...]:
    esc_base = re.escape(base)
    esc_name = re.escape(name)
    import_path_re = re.compile(
        rf"\bimport(?:\s+(?!type\b)[^;\n]*?\bfrom\s+|\s*\(\s*|\s+)"
        rf"['\"][^'\"]*(?<=[\"'/])(?:{esc_base}|{esc_name}(?:\.[a-zA-Z0-9]+)?)['\"]"
    )
    import_spec_re = re.compile(
        rf"\bimport\s+(?!type\b)"
        rf"(?:{esc_name}\b|\{{[^}}]*\b{esc_name}\b[^}}]*\}})"
        rf"(?:\s*,\s*(?:\{{[^}}]*\}}|\*\s+as\s+\w+))?\s+\bfrom\s+['\"][^'\"]+['\"]"
    )
    jsx_tag_re = re.compile(rf"(?<![\w$])<{esc_name}(?:[\s/>.]|$)")
    mount_call_re = re.compile(
        rf"\b(?:mount|shallowMount|render|createElement|h)\s*\(\s*<?\s*{esc_name}\b"
    )
    return (import_path_re, import_spec_re, jsx_tag_re, mount_call_re)


def _read_unit_safe(unit_f: str) -> str | None:
    try:
        return Path(unit_f).read_text(encoding="utf-8")
    except OSError:
        return None


def _matches_any_pattern(cleaned: str, patterns: tuple[re.Pattern[str], ...]) -> bool:
    return any(pat.search(cleaned) for pat in patterns)


def _is_referenced_in_units(
    base: str,
    name: str,
    unit_files: list[str],
    cleaned_cache: dict[str, str],
) -> bool:
    patterns = _build_usage_patterns(base, name)
    for unit_f in unit_files:
        cleaned = cleaned_cache.get(unit_f)
        if cleaned is None:
            raw = _read_unit_safe(unit_f)
            if raw is None:
                continue
            cleaned = _strip_js_comments(raw)
            cleaned_cache[unit_f] = cleaned
        if _matches_any_pattern(cleaned, patterns):
            return True
    return False


def _find_orphan_components(
    repo_root: Path,
    ui_files: list[str],
    unit_files: list[str],
    cleaned_cache: dict[str, str] | None = None,
) -> list[str]:
    cache = cleaned_cache if cleaned_cache is not None else {}
    unit_basenames = {os.path.basename(u) for u in unit_files}
    orphans: list[str] = []
    for uf in ui_files:
        base = os.path.basename(uf)
        name = _strip_compound_suffix(base)
        if _has_direct_unit(uf, name, unit_basenames) or _is_referenced_in_units(
            base, name, unit_files, cache
        ):
            continue
        orphans.append(os.path.relpath(uf, repo_root))
    return orphans


def _report_orphans(orphans: list[str], ui_count: int, unit_count: int) -> int:
    print(
        f"❌ Se detectaron {len(orphans)} componente(s) UI huérfano(s) "
        f"sin pruebas unitarias ({ui_count} componentes / {unit_count} suites):"
    )
    for orphan in orphans:
        print(f"   - {orphan}")
    print(
        "Directiva Incumplida: Invariante de Cero Componentes UI Huérfanos "
        "(.agents/rules/mandatory_qa_pyramid_and_doc_sync.md)"
    )
    return 1


def main(target_root: Path | None = None, exit_skipped_code: int = 0) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    if not _collect_frontend_roots(repo_root):
        print("⚠️ SKIPPED [UI Orphans]: Sin directorio frontend activo.")
        return exit_skipped_code

    groups, ui_files, unit_files = _collect_ui_and_unit_groups(repo_root)
    if not ui_files:
        print(
            "⚠️ SKIPPED [UI Orphans]: 0 componentes UI (.vue / .tsx / .jsx) detectados."
        )
        return exit_skipped_code

    cleaned_cache: dict[str, str] = {}
    orphans: list[str] = []
    for group_ui, group_units in groups:
        orphans.extend(
            _find_orphan_components(
                repo_root, group_ui, group_units, cleaned_cache=cleaned_cache
            )
        )
    if orphans:
        return _report_orphans(orphans, len(ui_files), len(unit_files))

    print(
        f"✔ [UI Orphans] {len(ui_files)} componentes / "
        f"{len(unit_files)} suites unitarias (0 huérfanos)."
    )
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita el invariante de cero componentes UI huérfanos."
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
