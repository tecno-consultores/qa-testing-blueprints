#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_roadmap_consistency.py — Validador de Consistencia ROADMAP.md y ACTIVE_TASK.md.

Audita de forma bidireccional y determinista:
1. Coherencia interna en ROADMAP.md:
   - Que cada hito listado en la tabla de resumen superior coincida exactamente
     en estado (Completado vs Pendiente vs En Progreso) y porcentaje con las
     tareas marcadas ([x] vs [ ]) en las secciones detalladas correspondientes.
   - Que un hito con 100% de tareas completadas NO figure como Pendiente / 0%.
   - Que un hito sin tareas completadas NO figure como Completado / 100%.
   - Que el encabezado de sección (## ✅ vs ## ⏳ vs ## 🚧) coincida con el estado.
2. Coherencia operativa en .agents/ACTIVE_TASK.md:
   - Que el archivo exista y declare un estado formal (COMPLETED vs IN_PROGRESS).
   - Que si está marcado como COMPLETED (100%), no contenga casillas pendientes '- [ ]'.
   - Que si está IN_PROGRESS, tenga tareas o fases declaradas.

Ejecución determinista estática en < 1 segundo (sin dependencias externas).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def parse_roadmap_table(content: str) -> List[Dict[str, Any]]:
    """Extrae las filas de la tabla de resumen de hitos en ROADMAP.md."""
    hitos: List[Dict[str, Any]] = []

    # Busca la tabla de resumen (ej. | **Hito 1** / **Milestone 1** | ... | Estado | Progreso |)
    # Patrón flexible que detecta filas de tabla con 'Hito X' o 'Milestone X'
    row_pattern = re.compile(
        r"\|\s*\*{0,2}(?:Hito|Milestone)\s+([0-9]+(?:\.[0-9]+)?)\*{0,2}\s*\|([^|]+)\|([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        re.IGNORECASE,
    )

    for line in content.splitlines():
        line_clean = line.strip()
        if not line_clean.startswith("|"):
            continue
        match = row_pattern.search(line_clean)
        if match:
            hito_num = match.group(1).strip()
            nombre = match.group(2).strip()
            especificacion = match.group(3).strip()
            estado = match.group(4).strip()
            progreso_str = match.group(5).strip().replace("`", "").replace("%", "").strip()

            try:
                progreso_num = int(float(progreso_str))
            except ValueError:
                progreso_num = -1

            estado_low = estado.lower()
            hitos.append(
                {
                    "hito_num": hito_num,
                    "nombre": nombre,
                    "spec": especificacion,
                    "estado_raw": estado,
                    "is_completed": "completado" in estado_low or "completed" in estado_low or "✅" in estado,
                    "is_pending": "pendiente" in estado_low or "pending" in estado_low or "⏳" in estado,
                    "is_in_progress": "progreso" in estado_low or "progress" in estado_low or "curso" in estado_low or "🚧" in estado,
                    "progreso_pct": progreso_num,
                    "line": line_clean,
                }
            )

    return hitos


def parse_roadmap_sections(content: str) -> Dict[str, Dict[str, Any]]:
    """Extrae las secciones de hitos y cuenta sus casillas [x] y [ ]."""
    sections: Dict[str, Dict[str, Any]] = {}

    # Divide por encabezados de segundo nivel: ## [icon] Hito/Milestone X: ...
    section_header_pattern = re.compile(
        r"^##\s+([✅⏳🚧]?)\s*(?:Hito|Milestone)\s+([0-9]+(?:\.[0-9]+)?)\s*[:—\-]\s*(.*)$",
        re.MULTILINE | re.IGNORECASE,
    )

    lines = content.splitlines()
    current_hito: Optional[str] = None
    current_header_icon: str = ""
    current_title: str = ""
    current_lines: List[str] = []

    for line in lines:
        header_match = section_header_pattern.match(line.strip())
        if header_match:
            if current_hito is not None:
                sections[current_hito] = _analyze_section_tasks(
                    current_hito, current_header_icon, current_title, current_lines
                )
            current_header_icon = header_match.group(1).strip()
            current_hito = header_match.group(2).strip()
            current_title = header_match.group(3).strip()
            current_lines = []
        elif current_hito is not None:
            # Si encontramos otro encabezado ## que no sea Hito, cerramos
            if line.strip().startswith("## ") and not line.strip().startswith("## ---"):
                sections[current_hito] = _analyze_section_tasks(
                    current_hito, current_header_icon, current_title, current_lines
                )
                current_hito = None
                current_lines = []
            else:
                current_lines.append(line)

    if current_hito is not None:
        sections[current_hito] = _analyze_section_tasks(
            current_hito, current_header_icon, current_title, current_lines
        )

    return sections


def _analyze_section_tasks(
    hito_num: str, header_icon: str, title: str, lines: List[str]
) -> Dict[str, Any]:
    """Cuenta casillas de verificación dentro del cuerpo de una sección de hito."""
    total_tasks = 0
    completed_tasks = 0

    for line in lines:
        stripped = line.strip()
        if re.match(r"^-\s*\[x\]", stripped, re.IGNORECASE):
            total_tasks += 1
            completed_tasks += 1
        elif re.match(r"^-\s*\[\s*\]", stripped):
            total_tasks += 1

    pct = 0
    if total_tasks > 0:
        pct = int((completed_tasks / total_tasks) * 100)

    return {
        "hito_num": hito_num,
        "header_icon": header_icon,
        "title": title,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "calculated_pct": pct,
        "is_all_completed": total_tasks > 0 and completed_tasks == total_tasks,
        "is_all_pending": total_tasks > 0 and completed_tasks == 0,
        "is_in_progress": total_tasks > 0 and 0 < completed_tasks < total_tasks,
    }


def validate_roadmap_consistency(roadmap_path: Path) -> List[str]:
    """Comprueba la consistencia entre la tabla de resumen y las secciones de ROADMAP.md."""
    if not roadmap_path.is_file():
        return [f"Archivo no encontrado: {roadmap_path}"]

    content = roadmap_path.read_text(encoding="utf-8")
    table_hitos = parse_roadmap_table(content)
    sections = parse_roadmap_sections(content)

    if not table_hitos:
        return []

    errors: List[str] = []

    for t_hito in table_hitos:
        num = t_hito["hito_num"]
        if num not in sections:
            errors.append(
                f"Hito {num} figura en la tabla de resumen pero carece de sección '## Hito {num}:' en el cuerpo."
            )
            continue

        sec = sections[num]
        total = sec["total_tasks"]
        done = sec["completed_tasks"]

        # Si no hay tareas tipo '- [ ]' ni '- [x]', no podemos auditar con precisión de casillas
        if total == 0:
            continue

        # Inconsistencia 1: Todas las tareas completadas pero en la tabla figura como pendiente o < 100%
        if sec["is_all_completed"]:
            if t_hito["is_pending"] or t_hito["progreso_pct"] < 100:
                errors.append(
                    f"Inconsistencia en Hito {num}: La tabla de resumen indica '{t_hito['estado_raw']} | "
                    f"{t_hito['progreso_pct']}%', pero todas sus tareas ({done}/{total}) están completadas [x]. "
                    f"Debe actualizarse la tabla a '✅ Completado | 100%'."
                )
            if sec["header_icon"] not in ("✅", ""):
                errors.append(
                    f"Inconsistencia en Hito {num}: El encabezado de sección tiene icono '{sec['header_icon']}', "
                    f"pero todas las tareas están completadas. Debe llevar '## ✅ Hito {num}:'."
                )

        # Inconsistencia 2: Cero tareas completadas pero en la tabla figura como completado o > 0%
        elif sec["is_all_pending"]:
            if t_hito["is_completed"] or t_hito["progreso_pct"] > 0:
                errors.append(
                    f"Inconsistencia en Hito {num}: La tabla de resumen indica '{t_hito['estado_raw']} | "
                    f"{t_hito['progreso_pct']}%', pero tiene 0 tareas completadas [x] de {total}. "
                    f"Debe actualizarse la tabla a '⏳ Pendiente | 0%'."
                )
            if sec["header_icon"] not in ("⏳", ""):
                errors.append(
                    f"Inconsistencia en Hito {num}: El encabezado de sección tiene icono '{sec['header_icon']}', "
                    f"pero ninguna tarea está completada. Debe llevar '## ⏳ Hito {num}:'."
                )

        # Inconsistencia 3: Tareas parcialmente completadas
        elif sec["is_in_progress"]:
            if t_hito["is_completed"]:
                errors.append(
                    f"Inconsistencia en Hito {num}: La tabla de resumen marca 'Completado', pero solo tiene "
                    f"{done}/{total} tareas completadas ({sec['calculated_pct']}%). Debe figurar '🚧 En Progreso'."
                )
            elif t_hito["is_pending"]:
                errors.append(
                    f"Inconsistencia en Hito {num}: La tabla de resumen marca 'Pendiente', pero ya cuenta con "
                    f"{done}/{total} tareas completadas ({sec['calculated_pct']}%). Debe figurar '🚧 En Progreso'."
                )

    return errors


def validate_active_task(active_task_path: Path) -> List[str]:
    """Valida la estructura y coherencia del archivo .agents/ACTIVE_TASK.md."""
    if not active_task_path.is_file():
        # Si no existe, es opcional en repos sin agentes activos, pero advertimos
        return []

    content = active_task_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    state_match = None
    for line in lines:
        match = re.search(r"\*{0,2}(?:Estado|Status)\*{0,2}\s*:\s*(.+)$", line, re.IGNORECASE)
        if match:
            state_match = match.group(1).strip()
            break

    if not state_match:
        return [
            ".agents/ACTIVE_TASK.md carece del campo obligatorio '**Estado:**' (ej. 'IN_PROGRESS (XX%)' o 'COMPLETED (100%)')."
        ]

    is_completed = "completed" in state_match.lower() or "100%" in state_match
    pending_tasks = [
        line.strip() for line in lines if re.match(r"^-\s*\[\s*\]", line.strip())
    ]

    errors: List[str] = []

    if is_completed and pending_tasks:
        errors.append(
            f".agents/ACTIVE_TASK.md figura como '{state_match}', pero aún contiene {len(pending_tasks)} "
            f"casillas pendientes sin marcar '- [ ]'. Debe completarlas o actualizar el estado a IN_PROGRESS."
        )

    return errors


def validate_bilingual_roadmap_parity(roadmap_en: Path, roadmap_es: Path) -> List[str]:
    """Comprueba paridad de hitos y porcentajes entre ROADMAP.md (EN) y ROADMAP.es.md (ES)."""
    if not roadmap_en.is_file() or not roadmap_es.is_file():
        return []
    en_rows = parse_roadmap_table(roadmap_en.read_text(encoding="utf-8"))
    es_rows = parse_roadmap_table(roadmap_es.read_text(encoding="utf-8"))
    if not en_rows and not es_rows:
        return []
    en_map = {row["hito_num"]: row for row in en_rows}
    es_map = {row["hito_num"]: row for row in es_rows}
    errors: List[str] = []
    if set(en_map.keys()) != set(es_map.keys()):
        missing_es = sorted(set(en_map.keys()) - set(es_map.keys()))
        missing_en = sorted(set(es_map.keys()) - set(en_map.keys()))
        errors.append(
            f"Desfase bilingüe ROADMAP.md vs ROADMAP.es.md: faltan en ES={missing_es}, faltan en EN={missing_en}."
        )
    common = sorted(
        set(en_map.keys()) & set(es_map.keys()),
        key=lambda val: tuple(int(part) for part in val.split(".")),
    )
    for num in common:
        en_item = en_map[num]
        es_item = es_map[num]
        if (
            en_item["progreso_pct"] != es_item["progreso_pct"]
            or en_item["is_completed"] != es_item["is_completed"]
        ):
            errors.append(
                f"Desfase bilingüe en Hito/Milestone {num}: ROADMAP.md ({en_item['progreso_pct']}%) != ROADMAP.es.md ({es_item['progreso_pct']}%)."
            )
    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent.parent

    roadmap_path = repo_root / "ROADMAP.md"
    roadmap_es_path = repo_root / "ROADMAP.es.md"
    active_task_path = repo_root / ".agents" / "ACTIVE_TASK.md"

    roadmap_errors: List[str] = []
    if roadmap_path.is_file():
        roadmap_errors.extend(validate_roadmap_consistency(roadmap_path))
    if roadmap_es_path.is_file():
        roadmap_errors.extend(validate_roadmap_consistency(roadmap_es_path))
    roadmap_errors.extend(validate_bilingual_roadmap_parity(roadmap_path, roadmap_es_path))

    active_task_errors: List[str] = []
    if active_task_path.is_file():
        active_task_errors = validate_active_task(active_task_path)

    all_errors = roadmap_errors + active_task_errors

    if all_errors:
        print("❌ Se detectaron discrepancias de consistencia operativa en ROADMAP.md / ROADMAP.es.md / ACTIVE_TASK.md:")
        for err in all_errors:
            print(f"   - {err}")
        print("💡 Directiva: Mantén sincronizadas las tablas de resumen con el desglose granular.")
        return 1

    print("✔ [Governance Sync] ROADMAP.{md,es.md} y ACTIVE_TASK.md verificados en perfecta coherencia y sincronía.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
