#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_zero_orphan_vue_components.py — Invariante de Cero Componentes UI Huérfanos.

Audita que cada archivo .vue (o componente de UI) posea su correspondiente suite
.unit.ts dedicada o esté directamente testeado en una suite unitaria activa.
"""

import os
import sys
from pathlib import Path


def main(target_root: Path | None = None) -> int:
    repo_root = target_root or Path(__file__).resolve().parent.parent.parent

    # Detecta todos los directorios frontend presentes
    candidates = [
        repo_root / "vue3" / "src",
        repo_root / "react-frontend" / "src",
        repo_root / "frontend" / "src",
        repo_root / "src",
    ]
    frontend_dirs = [c for c in candidates if c.exists()]

    if not frontend_dirs:
        print("✔ [UI Orphans] Sin directorio frontend activo (omitido).")
        return 0

    ui_files: list[str] = []
    unit_files_set: set[str] = set()
    for frontend_src in frontend_dirs:
        for root, _, files in os.walk(frontend_src):
            for f in files:
                if f.endswith(".vue") or (
                    f.endswith(".tsx") and not f.endswith((".unit.tsx", ".spec.tsx", ".test.tsx"))
                ):
                    ui_files.append(os.path.join(root, f))
                if f.endswith((".unit.ts", ".unit.tsx", ".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx")):
                    unit_files_set.add(os.path.join(root, f))

    test_dir_candidates = [
        repo_root / "vue3" / "tests",
        repo_root / "react-frontend" / "tests",
        repo_root / "frontend" / "tests",
        repo_root / "tests",
    ]
    for tdir in test_dir_candidates:
        if not tdir.exists():
            continue
        for root, _, files in os.walk(tdir):
            for f in files:
                if f.endswith((".unit.ts", ".unit.tsx", ".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx")):
                    unit_files_set.add(os.path.join(root, f))

    unit_files = sorted(unit_files_set)

    if not ui_files:
        print("✔ [UI Orphans] 0 componentes UI (.vue / .tsx) detectados.")
        return 0

    unit_basenames = {os.path.basename(u) for u in unit_files}

    orphans = []
    for uf in sorted(ui_files):
        rel_path = os.path.relpath(uf, repo_root)
        base = os.path.basename(uf)
        name = os.path.splitext(base)[0]
        camel_name = name[0].lower() + name[1:] if name else name

        # 1. Comprobación directa: <Component>.unit.ts o lowerCamelCase (<component>.unit.ts)
        ext = os.path.splitext(uf)[1]
        direct_unit = uf.replace(ext, ".unit.ts")
        direct_unit_tsx = uf.replace(ext, ".unit.tsx")

        if (
            os.path.exists(direct_unit)
            or os.path.exists(direct_unit_tsx)
            or f"{name}.unit.ts" in unit_basenames
            or f"{name}.unit.tsx" in unit_basenames
            or f"{camel_name}.unit.ts" in unit_basenames
            or f"{camel_name}.unit.tsx" in unit_basenames
        ):
            continue

        # 2. Comprobación de inclusión/montaje en alguna suite unitaria
        found = False
        for unit_f in unit_files:
            try:
                with open(unit_f, encoding="utf-8") as file:
                    content = file.read()
                    if base in content or f"'{name}'" in content or f'"{name}"' in content or f" {name} " in content:
                        found = True
                        break
            except OSError:
                pass

        if not found:
            orphans.append(rel_path)

    if orphans:
        print(f"❌ Se detectaron {len(orphans)} componente(s) UI huérfano(s) sin pruebas unitarias ({len(ui_files)} componentes / {len(unit_files)} suites):")
        for o in orphans:
            print(f"   - {o}")
        print(
            "Directiva Incumplida: Invariante de Cero Componentes UI Huérfanos (.agents/rules/mandatory_qa_pyramid_and_doc_sync.md)"
        )
        return 1

    print(f"✔ [UI Orphans] {len(ui_files)} componentes / {len(unit_files)} suites unitarias (0 huérfanos).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
