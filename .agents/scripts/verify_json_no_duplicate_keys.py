#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_json_no_duplicate_keys.py — Verificador estricto de claves duplicadas en JSON.

El analizador estándar json.loads de Python sobreescribe silenciosamente claves repetidas,
ocultando colisiones de traducción en diccionarios i18n o configuraciones.
Este script implementa un decodificador con object_pairs_hook para rechazar colisiones.
"""

import json
import sys
from pathlib import Path


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
    errors = []
    try:
        content = file_path.read_text(encoding="utf-8")
        json.loads(content, object_pairs_hook=detect_duplicate_keys)
    except ValueError as e:
        errors.append(f"{file_path}: {e}")
    except Exception as e:
        errors.append(f"{file_path}: Error de parseo JSON ({e})")
    return errors


def collect_json_candidates(repo_root: Path) -> list[Path]:
    ignored_dirs = {
        ".git",
        "node_modules",
        ".stryker-tmp",
        "coverage",
        ".venv",
        "dist",
        "build",
        "graphify-out",
        ".trivycache",
        "target",
    }
    seen: set[Path] = set()
    filtered: list[Path] = []
    for pattern in ("**/*.json", "**/*.json.example"):
        for candidate in sorted(repo_root.glob(pattern)):
            resolved = candidate.resolve()
            if resolved in seen:
                continue
            rel_parts = candidate.relative_to(repo_root).parts
            if any(part in ignored_dirs for part in rel_parts):
                continue
            seen.add(resolved)
            filtered.append(candidate)
    return filtered


def main(target_root: Path | None = None) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent
    filtered_files = collect_json_candidates(repo_root)

    if not filtered_files:
        print("✔ [JSON Integrity] 0 archivos JSON relevantes.")
        return 0

    all_errors = []
    for jf in filtered_files:
        errors = audit_json_file(jf)
        if errors:
            all_errors.extend(errors)

    if all_errors:
        print("❌ ERROR: Se detectaron colisiones de claves duplicadas en archivos JSON:")
        for err in all_errors:
            print(f"   - {err}")
        return 1

    print(f"✔ [JSON Integrity] {len(filtered_files)} archivos JSON validados (0 claves duplicadas).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
