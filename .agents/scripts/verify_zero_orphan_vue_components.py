#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

"""verify_zero_orphan_vue_components.py — Invariante de Cero Componentes UI Huérfanos.

Audita que cada archivo .vue (o componente de UI) posea su correspondiente suite
.unit.ts dedicada o esté directamente testeado en una suite unitaria activa.
"""

import os
import sys
from pathlib import Path

def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent.parent
    
    # Detecta directorios frontend posibles
    candidates = [repo_root / "vue3" / "src", repo_root / "src", repo_root / "react-frontend" / "src"]
    frontend_src = None
    for c in candidates:
        if c.exists():
            frontend_src = c
            break

    if not frontend_src:
        print("ℹ️ No se detectó directorio de frontend (vue3/src o src/); omitiendo verificación de huérfanos.")
        return 0

    ui_files = []
    for root, _, files in os.walk(frontend_src):
        for f in files:
            if f.endswith(".vue") or (f.endswith(".tsx") and not f.endswith(".unit.tsx")):
                ui_files.append(os.path.join(root, f))

    if not ui_files:
        print("ℹ️ No se encontraron componentes UI (.vue / .tsx); verificación aprobada.")
        return 0

    unit_files = []
    for root, _, files in os.walk(frontend_src):
        for f in files:
            if f.endswith(".unit.ts") or f.endswith(".unit.tsx") or f.endswith(".spec.ts") or f.endswith(".test.ts"):
                unit_files.append(os.path.join(root, f))

    orphans = []
    for uf in sorted(ui_files):
        rel_path = os.path.relpath(uf, repo_root)
        base = os.path.basename(uf)
        name = os.path.splitext(base)[0]
        
        # 1. Comprobación directa: <Component>.unit.ts
        ext = os.path.splitext(uf)[1]
        direct_unit = uf.replace(ext, ".unit.ts")
        direct_unit_tsx = uf.replace(ext, ".unit.tsx")
        
        if os.path.exists(direct_unit) or os.path.exists(direct_unit_tsx):
            continue
            
        # 2. Comprobación de inclusión/montaje en alguna suite unitaria
        found = False
        for unit_f in unit_files:
            try:
                with open(unit_f, "r", encoding="utf-8") as file:
                    content = file.read()
                    if base in content or f"'{name}'" in content or f'"{name}"' in content or f" {name} " in content:
                        found = True
                        break
            except Exception:
                continue

        if not found:
            orphans.append(rel_path)

    print(f"📊 Componentes UI auditados: {len(ui_files)}")
    print(f"📊 Suites de pruebas unitarias: {len(unit_files)}")

    if orphans:
        print(f"\n❌ Se detectaron {len(orphans)} componente(s) UI huérfano(s) sin pruebas unitarias:")
        for o in orphans:
            print(f"   - {o}")
        print("\nDirectiva Incumplida: Invariante de Cero Componentes UI Huérfanos (.agents/rules/mandatory_qa_pyramid_and_doc_sync.md)")
        return 1

    print("✔ Cero componentes UI huérfanos. 100% de componentes y vistas cuentan con pruebas unitarias.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
