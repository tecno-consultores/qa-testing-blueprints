#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_zero_orphan_vue_components.py — Invariante de Cero Componentes UI Huérfanos.

Audita que cada archivo .vue o .tsx posea su correspondiente suite .unit.ts/.tsx
dedicada o esté directamente testeado en una suite unitaria activa.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterator
from pathlib import Path

_UNIT_SUFFIXES = (
    ".unit.ts",
    ".unit.tsx",
    ".spec.ts",
    ".spec.tsx",
    ".test.ts",
    ".test.tsx",
)


def _iter_files(directories: list[Path]) -> Iterator[Path]:
    for directory in directories:
        for root, _, files in os.walk(directory):
            for fname in files:
                yield Path(root) / fname


def _is_ui_component(filename: str) -> bool:
    return filename.endswith(".vue") or (
        filename.endswith(".tsx") and not filename.endswith(_UNIT_SUFFIXES)
    )


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


def _collect_ui_and_unit_files(
    repo_root: Path, frontend_dirs: list[Path]
) -> tuple[list[str], list[str]]:
    ui_files, unit_files_set = _scan_frontend_files(frontend_dirs)
    test_dirs = [
        d
        for d in (
            repo_root / "vue3" / "tests",
            repo_root / "react-frontend" / "tests",
            repo_root / "frontend" / "tests",
            repo_root / "tests",
        )
        if d.exists()
    ]
    unit_files_set.update(_scan_test_dir_files(test_dirs))
    return sorted(ui_files), sorted(unit_files_set)


def _has_direct_unit(uf: str, name: str, unit_basenames: set[str]) -> bool:
    camel_name = name[0].lower() + name[1:] if name else name
    uf_path = Path(uf)
    if (
        uf_path.with_suffix(".unit.ts").exists()
        or uf_path.with_suffix(".unit.tsx").exists()
    ):
        return True
    expected = {
        f"{name}.unit.ts",
        f"{name}.unit.tsx",
        f"{camel_name}.unit.ts",
        f"{camel_name}.unit.tsx",
    }
    return bool(expected & unit_basenames)


def _is_referenced_in_units(base: str, name: str, unit_files: list[str]) -> bool:
    tokens = (base, f"'{name}'", f'"{name}"', f" {name} ")
    for unit_f in unit_files:
        try:
            content = Path(unit_f).read_text(encoding="utf-8")
        except OSError:
            continue
        if any(tok in content for tok in tokens):
            return True
    return False


def _find_orphan_components(
    repo_root: Path, ui_files: list[str], unit_files: list[str]
) -> list[str]:
    unit_basenames = {os.path.basename(u) for u in unit_files}
    orphans: list[str] = []
    for uf in ui_files:
        base = os.path.basename(uf)
        name = os.path.splitext(base)[0]
        if _has_direct_unit(uf, name, unit_basenames):
            continue
        if not _is_referenced_in_units(base, name, unit_files):
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
    candidates = [
        repo_root / "vue3" / "src",
        repo_root / "react-frontend" / "src",
        repo_root / "frontend" / "src",
        repo_root / "src",
    ]
    frontend_dirs = [c for c in candidates if c.exists()]
    if not frontend_dirs:
        print("⚠️ SKIPPED [UI Orphans]: Sin directorio frontend activo.")
        return exit_skipped_code

    ui_files, unit_files = _collect_ui_and_unit_files(repo_root, frontend_dirs)
    if not ui_files:
        print("⚠️ SKIPPED [UI Orphans]: 0 componentes UI (.vue / .tsx) detectados.")
        return exit_skipped_code

    orphans = _find_orphan_components(repo_root, ui_files, unit_files)
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
