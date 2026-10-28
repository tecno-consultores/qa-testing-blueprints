#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

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


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent.parent
    json_files = list(repo_root.glob("**/*.json"))
    
    # Excluye directorios no rastreados o de dependencias
    ignored_patterns = ["node_modules", ".stryker-tmp", "coverage", ".venv", "dist", "build"]
    filtered_files = [
        f for f in json_files
        if not any(pattern in str(f) for pattern in ignored_patterns)
    ]

    if not filtered_files:
        print("ℹ️ No se detectaron archivos JSON relevantes para auditar.")
        return 0

    all_errors = []
    for jf in filtered_files:
        errors = audit_json_file(jf)
        if errors:
            all_errors.extend(errors)

    if all_errors:
        print("\n❌ ERROR: Se detectaron colisiones de claves duplicadas en archivos JSON:")
        for err in all_errors:
            print(f"   - {err}")
        return 1

    print(f"✔ Auditoría exitosa: {len(filtered_files)} archivos JSON validados sin claves duplicadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
