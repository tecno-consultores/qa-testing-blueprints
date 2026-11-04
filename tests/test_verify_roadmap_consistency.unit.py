#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

"""test_verify_roadmap_consistency.unit.py — Pruebas Unitarias del Validador de Roadmap y Active Task.

Valida:
1. Parseo determinista de la tabla resumen de ROADMAP.md.
2. Análisis de casillas de tareas [x] y [ ] en secciones.
3. Detección de inconsistencias: tabla dice Pendiente pero tareas completadas (caso Hito 4).
4. Detección de inconsistencias: tabla dice Completado pero tareas vacías.
5. Detección de discrepancias en iconos de encabezado (## ✅ vs ## ⏳).
6. Validación de .agents/ACTIVE_TASK.md (completado con casillas pendientes, estado ausente, etc.).
7. Ejecución de la función main() con salida determinista y códigos de salida 0 y 1.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / ".agents" / "scripts" / "verify_roadmap_consistency.py"

spec = importlib.util.spec_from_file_location("verify_roadmap_consistency", SCRIPT_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f"No se pudo cargar {SCRIPT_PATH}")
vrc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vrc)


class TestVerifyRoadmapConsistency(unittest.TestCase):
    """Suite de pruebas unitarias para verify_roadmap_consistency.py."""

    def test_parse_roadmap_table_valid(self):
        sample = """
# ROADMAP
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 1** | Setup | `01_SPEC.md` | ✅ Completado | `100%` |
| **Hito 2** | Core | `02_SPEC.md` | ⏳ Pendiente | `0%` |
| **Hito 2.5** | Patch | `02b_SPEC.md` | 🚧 En Progreso | `50%` |
"""
        table = vrc.parse_roadmap_table(sample)
        self.assertEqual(len(table), 3)
        self.assertEqual(table[0]["hito_num"], "1")
        self.assertTrue(table[0]["is_completed"])
        self.assertEqual(table[0]["progreso_pct"], 100)

        self.assertEqual(table[1]["hito_num"], "2")
        self.assertTrue(table[1]["is_pending"])
        self.assertEqual(table[1]["progreso_pct"], 0)

        self.assertEqual(table[2]["hito_num"], "2.5")
        self.assertTrue(table[2]["is_in_progress"])
        self.assertEqual(table[2]["progreso_pct"], 50)

    def test_parse_roadmap_table_empty(self):
        table = vrc.parse_roadmap_table("# No table here\nJust text")
        self.assertEqual(table, [])

    def test_parse_roadmap_sections(self):
        sample = """
## ✅ Hito 1: Setup y Base
- [x] Tarea 1.1
- [x] Tarea 1.2

## ⏳ Hito 2: Funcionalidad Core
- [ ] Tarea 2.1
- [ ] Tarea 2.2
"""
        sections = vrc.parse_roadmap_sections(sample)
        self.assertIn("1", sections)
        self.assertIn("2", sections)

        self.assertEqual(sections["1"]["total_tasks"], 2)
        self.assertEqual(sections["1"]["completed_tasks"], 2)
        self.assertTrue(sections["1"]["is_all_completed"])
        self.assertEqual(sections["1"]["header_icon"], "✅")

        self.assertEqual(sections["2"]["total_tasks"], 2)
        self.assertEqual(sections["2"]["completed_tasks"], 0)
        self.assertTrue(sections["2"]["is_all_pending"])
        self.assertEqual(sections["2"]["header_icon"], "⏳")

    def test_validate_roadmap_perfect_match(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            roadmap = Path(tmpdir) / "ROADMAP.md"
            roadmap.write_text(
                """# Roadmap
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 1** | Inicio | `spec1` | ✅ Completado | `100%` |
| **Hito 2** | Desarrollo | `spec2` | ⏳ Pendiente | `0%` |

## ✅ Hito 1: Inicio
- [x] Tarea 1

## ⏳ Hito 2: Desarrollo
- [ ] Tarea 2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_roadmap_consistency(roadmap)
            self.assertEqual(errors, [])

    def test_validate_roadmap_detects_pending_when_tasks_completed(self):
        """Replica exactamente el caso del Hito 4 reportado por el usuario."""
        with tempfile.TemporaryDirectory() as tmpdir:
            roadmap = Path(tmpdir) / "ROADMAP.md"
            roadmap.write_text(
                """# Roadmap
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 4** | Servidor MCP | `03_SPEC.md` | ⏳ Pendiente | `0%` |

## ✅ Hito 4: Servidor MCP
- [x] Tarea 4.1
- [x] Tarea 4.2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_roadmap_consistency(roadmap)
            self.assertTrue(any("Inconsistencia en Hito 4" in e and "completadas [x]" in e for e in errors))

    def test_validate_roadmap_detects_completed_when_tasks_pending(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            roadmap = Path(tmpdir) / "ROADMAP.md"
            roadmap.write_text(
                """# Roadmap
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 5** | Parsers | `04_SPEC.md` | ✅ Completado | `100%` |

## ⏳ Hito 5: Parsers
- [ ] Tarea 5.1
- [ ] Tarea 5.2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_roadmap_consistency(roadmap)
            self.assertTrue(any("Inconsistencia en Hito 5" in e and "0 tareas completadas" in e for e in errors))

    def test_validate_roadmap_detects_header_icon_mismatch(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            roadmap = Path(tmpdir) / "ROADMAP.md"
            roadmap.write_text(
                """# Roadmap
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 1** | Inicio | `spec1` | ✅ Completado | `100%` |

## ⏳ Hito 1: Inicio
- [x] Tarea 1.1
""",
                encoding="utf-8",
            )
            errors = vrc.validate_roadmap_consistency(roadmap)
            self.assertTrue(any("icono '⏳'" in e for e in errors))

    def test_validate_roadmap_missing_section(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            roadmap = Path(tmpdir) / "ROADMAP.md"
            roadmap.write_text(
                """# Roadmap
| Hito | Nombre | Spec | Estado | Progreso |
| :--- | :--- | :--- | :---: | :---: |
| **Hito 99** | Fantasma | `none` | ⏳ Pendiente | `0%` |
""",
                encoding="utf-8",
            )
            errors = vrc.validate_roadmap_consistency(roadmap)
            self.assertTrue(any("carece de sección" in e for e in errors))

    def test_validate_active_task_valid_in_progress(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                """# Tarea Activa
**Estado:** IN_PROGRESS (50%)
- [x] Fase 1
- [ ] Fase 2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_active_task(task_file)
            self.assertEqual(errors, [])

    def test_validate_active_task_valid_completed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                """# Tarea Activa
**Estado:** COMPLETED (100%)
- [x] Fase 1
- [x] Fase 2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_active_task(task_file)
            self.assertEqual(errors, [])

    def test_validate_active_task_completed_with_pending_checkboxes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                """# Tarea Activa
**Estado:** COMPLETED (100%)
- [x] Fase 1
- [ ] Fase 2 pendiente
""",
                encoding="utf-8",
            )
            errors = vrc.validate_active_task(task_file)
            self.assertTrue(any("casillas pendientes sin marcar" in e for e in errors))

    def test_validate_active_task_missing_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text("# Tarea Activa sin estado\n- [ ] Algo", encoding="utf-8")
            errors = vrc.validate_active_task(task_file)
            self.assertTrue(any("carece del campo obligatorio '**Estado:**'" in e for e in errors))

    def test_main_cli_execution_success(self):
        # Ejecuta main sobre el repositorio real actual (que está sincronizado)
        # Nota: durante la ejecución de una tarea activa puede estar IN_PROGRESS, que también retorna 0
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        with redirect_stdout(buf):
            exit_code = vrc.main()
        self.assertEqual(exit_code, 0)
        output = buf.getvalue().strip()
        self.assertIn("[Governance Sync]", output)
        self.assertEqual(len(output.splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
