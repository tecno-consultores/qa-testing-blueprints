#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_json_no_duplicate_keys.py — Verificador de claves duplicadas en JSON.

El analizador estándar json.loads de Python sobreescribe silenciosamente claves
repetidas, ocultando colisiones de traducción en diccionarios i18n o configs.
Este script implementa un decodificador con object_pairs_hook para rechazarlas.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_IGNORED_DIRS: frozenset[str] = frozenset(
    {
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
        ".cache",
        "artifacts",
        "__pycache__",
        ".stryker-tmp",
        "build",
        "graphify-out",
    }
)


def detect_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    seen: set[str] = set()
    duplicates: list[str] = []
    result: dict[str, object] = {}

    for key, value in pairs:
        if key in seen:
            duplicates.append(key)
        seen.add(key)
        result[key] = value

    if duplicates:
        raise ValueError(f"Claves duplicadas detectadas: {', '.join(duplicates)}")

    return result


def audit_json_file(file_path: Path) -> list[str]:
    errors: list[str] = []
    try:
        content = file_path.read_text(encoding="utf-8")
        json.loads(content, object_pairs_hook=detect_duplicate_keys)
    except ValueError as e:
        errors.append(f"{file_path}: {e}")
    except Exception as e:
        errors.append(f"{file_path}: Error de parseo JSON ({e})")
    return errors


def _record_unique_json(seen: dict[Path, Path], candidate: Path) -> None:
    resolved = candidate.resolve()
    prev = seen.get(resolved)
    if prev is None or (prev.is_symlink() and not candidate.is_symlink()):
        seen[resolved] = candidate


def _append_dir_json_files(
    dirpath: str, filenames: list[str], seen: dict[Path, Path]
) -> None:
    for fname in sorted(filenames):
        if fname.endswith((".json", ".json.example")):
            _record_unique_json(seen, Path(dirpath) / fname)


def collect_json_candidates(repo_root: Path) -> list[Path]:
    seen: dict[Path, Path] = {}
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = sorted(d for d in dirnames if d not in _IGNORED_DIRS)
        _append_dir_json_files(dirpath, filenames, seen)
    return sorted(seen.values(), key=lambda p: p.as_posix())


def _collect_json_errors(filtered_files: list[Path]) -> list[str]:
    all_errors: list[str] = []
    for jf in filtered_files:
        all_errors.extend(audit_json_file(jf))
    return all_errors


def main(target_root: Path | None = None) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    filtered_files = collect_json_candidates(repo_root)

    if not filtered_files:
        print("✔ [JSON Integrity] 0 archivos JSON relevantes.")
        return 0

    all_errors = _collect_json_errors(filtered_files)
    if all_errors:
        print("❌ ERROR: Colisiones de claves duplicadas en archivos JSON:")
        for err in all_errors:
            print(f"   - {err}")
        return 1

    print(
        f"✔ [JSON Integrity] {len(filtered_files)} archivos JSON validados "
        "(0 claves duplicadas)."
    )
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analiza los argumentos CLI de verify_json_no_duplicate_keys."""
    parser = argparse.ArgumentParser(
        description="Verifica claves JSON duplicadas en el repositorio o workspace."
    )
    parser.add_argument(
        "target_root",
        nargs="?",
        default=None,
        help="Ruta opcional del repositorio o directorio a inspeccionar.",
    )
    parser.add_argument(
        "--workspace",
        default=None,
        help="Ruta del workspace a inspeccionar.",
    )
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI compatible con --workspace y argumento posicional."""
    args = parse_args(argv)
    raw_root = args.workspace or args.target_root
    target_path = Path(raw_root).resolve() if raw_root else None
    return main(target_path)


if __name__ == "__main__":
    sys.exit(cli_main())
