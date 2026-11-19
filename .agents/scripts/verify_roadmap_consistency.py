#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""verify_roadmap_consistency.py — Validador ROADMAP.md y ACTIVE_TASK.md.

Audita de forma bidireccional y determinista:
1. Coherencia interna en ROADMAP.md:
   - Que cada hito listado en la tabla de resumen superior coincida exactamente
     en estado (Completado vs Pendiente vs En Progreso) y porcentaje con las
     tareas marcadas ([x] vs [ ]) en las secciones detalladas correspondientes.
   - Que un hito con 100% de tareas completadas NO figure como Pendiente / 0%.
   - Que un hito sin tareas completadas NO figure como Completado / 100%.
   - Que el encabezado de sección (## ✅ vs ## ⏳ vs ## 🚧) coincida con el estado.
2. Coherencia operativa en .agents/ACTIVE_TASK.md:
   - Que el archivo exista y declare un estado formal
     (CERTIFIED_CLEAN / legacy COMPLETED vs IN_PROGRESS).
   - Que si está marcado como CERTIFIED_CLEAN (o legacy COMPLETED (100%)),
     no contenga casillas pendientes '- [ ]'.
   - Que si está IN_PROGRESS, tenga tareas o fases declaradas.

Ejecución determinista estática en < 1 segundo (sin dependencias externas).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

_ROW_PATTERN = re.compile(
    r"\|\s*\*{0,2}(?:Hito|Milestone)\s+([0-9]+(?:\.[0-9]+)?)\*{0,2}"
    r"\s*\|([^|]+)\|([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
    re.IGNORECASE,
)
_SECTION_HEADER_PATTERN = re.compile(
    r"^##\s+([✅⏳🚧]?)\s*(?:Hito|Milestone)\s+"
    r"([0-9]+(?:\.[0-9]+)?)\s*[:—\-]\s*(.*)$",
    re.MULTILINE | re.IGNORECASE,
)


def parse_roadmap_table(content: str) -> list[dict[str, Any]]:
    """Extrae las filas de la tabla de resumen de hitos en ROADMAP.md."""
    hitos: list[dict[str, Any]] = []
    for line in content.splitlines():
        line_clean = line.strip()
        if not line_clean.startswith("|"):
            continue
        match = _ROW_PATTERN.search(line_clean)
        if not match:
            continue
        hito_num = match.group(1).strip()
        estado = match.group(4).strip()
        progreso_str = (
            match.group(5).strip().replace("`", "").replace("%", "").strip()
        )
        try:
            progreso_num = int(float(progreso_str))
        except ValueError:
            progreso_num = -1
        estado_low = estado.lower()
        is_completed = (
            "completado" in estado_low
            or "completed" in estado_low
            or "✅" in estado
        )
        is_pending = (
            "pendiente" in estado_low or "pending" in estado_low or "⏳" in estado
        )
        is_in_progress = (
            "progreso" in estado_low
            or "progress" in estado_low
            or "curso" in estado_low
            or "🚧" in estado
        )
        hitos.append(
            {
                "hito_num": hito_num,
                "nombre": match.group(2).strip(),
                "spec": match.group(3).strip(),
                "estado_raw": estado,
                "is_completed": is_completed,
                "is_pending": is_pending,
                "is_in_progress": is_in_progress,
                "progreso_pct": progreso_num,
                "line": line_clean,
            }
        )
    return hitos


def _flush_roadmap_section(
    sections: dict[str, dict[str, Any]],
    current_hito: str | None,
    current_header_icon: str,
    current_title: str,
    current_lines: list[str],
) -> None:
    if current_hito is not None:
        sections[current_hito] = _analyze_section_tasks(
            current_hito, current_header_icon, current_title, current_lines
        )


def parse_roadmap_sections(content: str) -> dict[str, dict[str, Any]]:
    """Extrae las secciones de hitos y cuenta sus casillas [x] y [ ]."""
    sections: dict[str, dict[str, Any]] = {}
    current_hito: str | None = None
    current_header_icon = ""
    current_title = ""
    current_lines: list[str] = []

    for line in content.splitlines():
        stripped = line.strip()
        header_match = _SECTION_HEADER_PATTERN.match(stripped)
        if header_match:
            _flush_roadmap_section(
                sections,
                current_hito,
                current_header_icon,
                current_title,
                current_lines,
            )
            current_header_icon = header_match.group(1).strip()
            current_hito = header_match.group(2).strip()
            current_title = header_match.group(3).strip()
            current_lines = []
        elif current_hito is not None:
            if stripped.startswith("## ") and not stripped.startswith("## ---"):
                _flush_roadmap_section(
                    sections,
                    current_hito,
                    current_header_icon,
                    current_title,
                    current_lines,
                )
                current_hito = None
                current_lines = []
            else:
                current_lines.append(line)

    _flush_roadmap_section(
        sections, current_hito, current_header_icon, current_title, current_lines
    )
    return sections


def _analyze_section_tasks(
    hito_num: str, header_icon: str, title: str, lines: list[str]
) -> dict[str, Any]:
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

    pct = int((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0
    return {
        "hito_num": hito_num,
        "header_icon": header_icon,
        "title": title,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "calculated_pct": pct,
        "is_all_completed": total_tasks > 0 and completed_tasks == total_tasks,
        "is_all_pending": total_tasks > 0 and completed_tasks == 0,
        "is_partial": total_tasks > 0 and 0 < completed_tasks < total_tasks,
    }


def _check_all_completed_hito(
    num: str, t_hito: dict[str, Any], sec: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    done = sec["completed_tasks"]
    total = sec["total_tasks"]
    if t_hito["is_pending"] or t_hito["progreso_pct"] < 100:
        errors.append(
            f"Inconsistencia en Hito {num}: La tabla de resumen indica "
            f"'{t_hito['estado_raw']} | {t_hito['progreso_pct']}%', pero todas "
            f"sus tareas ({done}/{total}) están completadas [x]. "
            "Debe actualizarse la tabla a '✅ Completado | 100%'."
        )
    if sec["header_icon"] not in ("✅", ""):
        errors.append(
            f"Inconsistencia en Hito {num}: El encabezado de sección tiene "
            f"icono '{sec['header_icon']}', pero todas las tareas están "
            f"completadas. Debe llevar '## ✅ Hito {num}:'."
        )
    return errors


def _check_all_pending_hito(
    num: str, t_hito: dict[str, Any], sec: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    total = sec["total_tasks"]
    if t_hito["is_completed"] or t_hito["progreso_pct"] > 0:
        errors.append(
            f"Inconsistencia en Hito {num}: La tabla de resumen indica "
            f"'{t_hito['estado_raw']} | {t_hito['progreso_pct']}%', pero tiene "
            f"0 tareas completadas [x] de {total}. "
            "Debe actualizarse la tabla a '⏳ Pendiente | 0%'."
        )
    if sec["header_icon"] not in ("⏳", ""):
        errors.append(
            f"Inconsistencia en Hito {num}: El encabezado de sección tiene "
            f"icono '{sec['header_icon']}', pero ninguna tarea está completada. "
            f"Debe llevar '## ⏳ Hito {num}:'."
        )
    return errors


def _check_partial_hito(
    num: str, t_hito: dict[str, Any], sec: dict[str, Any]
) -> list[str]:
    done = sec["completed_tasks"]
    total = sec["total_tasks"]
    pct = sec["calculated_pct"]
    if t_hito["is_completed"]:
        return [
            f"Inconsistencia en Hito {num}: La tabla de resumen marca "
            f"'Completado', pero solo tiene {done}/{total} tareas completadas "
            f"({pct}%). Debe figurar '🚧 En Progreso'."
        ]
    if t_hito["is_pending"]:
        return [
            f"Inconsistencia en Hito {num}: La tabla de resumen marca "
            f"'Pendiente', pero ya cuenta con {done}/{total} tareas completadas "
            f"({pct}%). Debe figurar '🚧 En Progreso'."
        ]
    return []


def _dispatch_hito_checks(
    num: str, t_hito: dict[str, Any], sec: dict[str, Any]
) -> list[str]:
    for key, checker in (
        ("is_all_completed", _check_all_completed_hito),
        ("is_all_pending", _check_all_pending_hito),
        ("is_partial", _check_partial_hito),
    ):
        if sec[key]:
            return checker(num, t_hito, sec)
    return []


def _validate_single_hito(
    t_hito: dict[str, Any], sections: dict[str, dict[str, Any]]
) -> list[str]:
    num = t_hito["hito_num"]
    if num not in sections:
        return [
            f"Hito {num} figura en la tabla de resumen pero carece de sección "
            f"'## Hito {num}:' en el cuerpo."
        ]
    sec = sections[num]
    if sec["total_tasks"] == 0:
        return []
    return _dispatch_hito_checks(num, t_hito, sec)


def validate_roadmap_consistency(roadmap_path: Path) -> list[str]:
    """Comprueba consistencia entre la tabla de resumen y secciones de ROADMAP.md."""
    if not roadmap_path.is_file():
        return [f"Archivo no encontrado: {roadmap_path}"]

    content = roadmap_path.read_text(encoding="utf-8")
    table_hitos = parse_roadmap_table(content)
    sections = parse_roadmap_sections(content)

    if not table_hitos:
        return []

    errors: list[str] = []
    for t_hito in table_hitos:
        errors.extend(_validate_single_hito(t_hito, sections))
    return errors


def _extract_active_task_state(lines: list[str]) -> str | None:
    pattern = re.compile(r"\*{0,2}(?:Estado|Status)\*{0,2}\s*:\s*(.+)$", re.IGNORECASE)
    for line in lines:
        match = pattern.search(line)
        if match:
            return match.group(1).strip()
    return None


def validate_active_task(active_task_path: Path) -> list[str]:
    """Valida la estructura y coherencia del archivo .agents/ACTIVE_TASK.md."""
    if not active_task_path.is_file():
        return []

    lines = active_task_path.read_text(encoding="utf-8").splitlines()
    state_match = _extract_active_task_state(lines)
    if not state_match:
        return [
            ".agents/ACTIVE_TASK.md carece del campo obligatorio '**Estado:**' "
            "(ej. 'IN_PROGRESS' o 'CERTIFIED_CLEAN')."
        ]

    state_low = state_match.lower()
    is_closed = (
        "certified_clean" in state_low
        or "completed" in state_low
        or "100%" in state_match
    )
    pending_tasks = [
        line.strip() for line in lines if re.match(r"^-\s*\[\s*\]", line.strip())
    ]
    if is_closed and pending_tasks:
        return [
            f".agents/ACTIVE_TASK.md figura como '{state_match}', pero aún "
            f"contiene {len(pending_tasks)} casillas pendientes sin marcar "
            "'- [ ]'. Debe completarlas o actualizar el estado a IN_PROGRESS."
        ]
    return []


def _check_certified_checkpoint_parity(
    data: dict[str, Any], active_task_path: Path
) -> list[str]:
    errors: list[str] = []
    planned = data.get("planned_steps", [])
    if isinstance(planned, list) and planned:
        errors.append(
            "session_checkpoint.json en CERTIFIED_CLEAN aún tiene "
            "planned_steps pendientes."
        )
    if active_task_path.is_file():
        md_low = active_task_path.read_text(encoding="utf-8").lower()
        if "certified_clean" not in md_low and "completed" not in md_low:
            errors.append(
                "session_checkpoint.json CERTIFIED_CLEAN difiere de ACTIVE_TASK.md."
            )
    return errors


def _load_checkpoint_dict(
    checkpoint_path: Path,
) -> tuple[dict[str, Any] | None, list[str]]:
    if not checkpoint_path.exists() and not checkpoint_path.is_symlink():
        return None, []
    if checkpoint_path.is_symlink():
        return None, [".agents/.cache/session_checkpoint.json no puede ser symlink."]
    try:
        data = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return None, [f".agents/.cache/session_checkpoint.json corrupto: {exc}"]
    if not isinstance(data, dict):
        return None, [".agents/.cache/session_checkpoint.json debe ser un objeto JSON."]
    return data, []


def validate_session_checkpoint(
    checkpoint_path: Path, active_task_path: Path
) -> list[str]:
    """Valida estructura y coherencia de .agents/.cache/session_checkpoint.json."""
    data, load_errors = _load_checkpoint_dict(checkpoint_path)
    if data is None:
        return load_errors
    errors: list[str] = []
    status = data.get("status")
    if status not in ("IN_PROGRESS", "CERTIFIED_CLEAN"):
        errors.append("session_checkpoint.json tiene status inválido.")
    intent = data.get("intent_140chars")
    if not isinstance(intent, str) or not (1 <= len(intent) <= 140):
        errors.append(
            "session_checkpoint.json viola longitud de intent_140chars (1..140)."
        )
    if status == "CERTIFIED_CLEAN":
        errors.extend(_check_certified_checkpoint_parity(data, active_task_path))
    return errors


def _compare_bilingual_milestone_rows(
    en_map: dict[str, dict[str, Any]], es_map: dict[str, dict[str, Any]]
) -> list[str]:
    errors: list[str] = []
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
                f"Desfase bilingüe en Hito/Milestone {num}: ROADMAP.md "
                f"({en_item['progreso_pct']}%) != ROADMAP.es.md "
                f"({es_item['progreso_pct']}%)."
            )
    return errors


def validate_bilingual_roadmap_parity(
    roadmap_en: Path, roadmap_es: Path
) -> list[str]:
    """Comprueba paridad de hitos entre ROADMAP.md (EN) y ROADMAP.es.md (ES)."""
    if not roadmap_en.is_file() or not roadmap_es.is_file():
        return []
    en_rows = parse_roadmap_table(roadmap_en.read_text(encoding="utf-8"))
    es_rows = parse_roadmap_table(roadmap_es.read_text(encoding="utf-8"))
    if not en_rows and not es_rows:
        return []
    en_map = {row["hito_num"]: row for row in en_rows}
    es_map = {row["hito_num"]: row for row in es_rows}
    errors: list[str] = []
    if set(en_map.keys()) != set(es_map.keys()):
        missing_es = sorted(set(en_map.keys()) - set(es_map.keys()))
        missing_en = sorted(set(es_map.keys()) - set(en_map.keys()))
        errors.append(
            "Desfase bilingüe ROADMAP.md vs ROADMAP.es.md: "
            f"faltan en ES={missing_es}, faltan en EN={missing_en}."
        )
    errors.extend(_compare_bilingual_milestone_rows(en_map, es_map))
    return errors


def _collect_all_consistency_errors(repo_root: Path) -> list[str]:
    roadmap_path = repo_root / "ROADMAP.md"
    roadmap_es_path = repo_root / "ROADMAP.es.md"
    active_task_path = repo_root / ".agents" / "ACTIVE_TASK.md"
    checkpoint_path = repo_root / ".agents" / ".cache" / "session_checkpoint.json"

    errors: list[str] = []
    if roadmap_path.is_file():
        errors.extend(validate_roadmap_consistency(roadmap_path))
    if roadmap_es_path.is_file():
        errors.extend(validate_roadmap_consistency(roadmap_es_path))
    errors.extend(validate_bilingual_roadmap_parity(roadmap_path, roadmap_es_path))
    if active_task_path.is_file():
        errors.extend(validate_active_task(active_task_path))
    errors.extend(validate_session_checkpoint(checkpoint_path, active_task_path))
    return errors


def _has_governance_docs(repo_root: Path) -> bool:
    return any(
        (repo_root / rel).is_file()
        for rel in (
            "ROADMAP.md",
            "ROADMAP.es.md",
            ".agents/ACTIVE_TASK.md",
            ".agents/.cache/session_checkpoint.json",
        )
    )


def main(target_root: Path | None = None, exit_skipped_code: int = 20) -> int:
    repo_root = (
        target_root.resolve()
        if target_root is not None
        else Path(__file__).resolve().parent.parent.parent
    )
    if not _has_governance_docs(repo_root):
        print(
            "⚠️ SKIPPED [Governance Sync]: Sin ROADMAP.md ni ACTIVE_TASK.md "
            "en el workspace."
        )
        return exit_skipped_code
    all_errors = _collect_all_consistency_errors(repo_root)

    if all_errors:
        print(
            "❌ Se detectaron discrepancias de consistencia operativa en "
            "ROADMAP.md / ROADMAP.es.md / ACTIVE_TASK.md:"
        )
        for err in all_errors:
            print(f"   - {err}")
        print(
            "💡 Directiva: Mantén sincronizadas las tablas de resumen con el "
            "desglose granular."
        )
        return 1

    print(
        "✔ [Governance Sync] ROADMAP.{md,es.md} y ACTIVE_TASK.md verificados "
        "en perfecta coherencia y sincronía."
    )
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Valida consistencia de ROADMAP.{md,es.md} y ACTIVE_TASK.md."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--workspace", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=20)
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
