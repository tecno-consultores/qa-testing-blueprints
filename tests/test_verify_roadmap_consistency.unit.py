#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

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

    def test_validate_bilingual_en_roadmap_and_parity(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            en_doc = tmp_path / "ROADMAP.md"
            es_doc = tmp_path / "ROADMAP.es.md"

            en_doc.write_text(
                "# Roadmap\n\n"
                "| Milestone | Milestone Name | Associated Specification | Status | Progress |\n"
                "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Milestone 1** | Bilingual EN | `19_SPEC` | ✅ Completed | `100%` |\n"
                "| **Milestone 2** | Mobile Spec 20 | `20_SPEC` | 🟡 Pending | `0%` |\n\n"
                "## ✅ Milestone 1: Bilingual EN\n- [x] **T1:** Done.\n\n"
                "## ⏳ Milestone 2: Mobile Spec 20\n- [ ] **T2:** Todo.\n",
                encoding="utf-8",
            )
            es_doc.write_text(
                "# Roadmap\n\n"
                "| Hito | Nombre del Hito | Especificación Asociada | Estado | Progreso |\n"
                "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` | ✅ Completado | `100%` |\n"
                "| **Hito 2** | Spec Móvil 20 | `20_SPEC` | 🟡 Pendiente | `0%` |\n\n"
                "## ✅ Hito 1: Bilingüe EN\n- [x] **T1:** Listo.\n\n"
                "## ⏳ Hito 2: Spec Móvil 20\n- [ ] **T2:** Por hacer.\n",
                encoding="utf-8",
            )

            self.assertEqual(vrc.validate_roadmap_consistency(en_doc), [])
            self.assertEqual(vrc.validate_roadmap_consistency(es_doc), [])
            self.assertEqual(vrc.validate_bilingual_roadmap_parity(en_doc, es_doc), [])
            # Caso trivial cuando falta uno de los archivos o ambos carecen de tabla
            self.assertEqual(vrc.validate_bilingual_roadmap_parity(en_doc, tmp_path / "missing.md"), [])
            empty_en = tmp_path / "EMPTY_EN.md"
            empty_es = tmp_path / "EMPTY_ES.md"
            empty_en.write_text("# Empty\n", encoding="utf-8")
            empty_es.write_text("# Vacío\n", encoding="utf-8")
            self.assertEqual(vrc.validate_bilingual_roadmap_parity(empty_en, empty_es), [])

            # Divergencia de progreso entre idiomas
            es_doc.write_text(
                es_doc.read_text(encoding="utf-8").replace("| 🟡 Pendiente | `0%` |", "| ✅ Completado | `100%` |"),
                encoding="utf-8",
            )
            parity_errors = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(any("Desfase bilingüe en Hito/Milestone 2" in e for e in parity_errors))

            # Divergencia únicamente en estado is_completed manteniendo igual porcentaje
            es_doc.write_text(
                "# Roadmap\n\n"
                "| Hito | Nombre del Hito | Especificación Asociada | Estado | Progreso |\n"
                "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` | 🚧 En Progreso | `100%` |\n"
                "| **Hito 2** | Spec Móvil 20 | `20_SPEC` | 🟡 Pendiente | `0%` |\n",
                encoding="utf-8",
            )
            status_diff = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(any("Desfase bilingüe en Hito/Milestone 1" in e for e in status_diff))

            # Hito presente en EN pero faltante en ES
            es_doc.write_text(
                "# Roadmap\n\n"
                "| Hito | Nombre del Hito | Especificación Asociada | Estado | Progreso |\n"
                "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` | ✅ Completado | `100%` |\n",
                encoding="utf-8",
            )
            missing_errors = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(len(missing_errors) >= 1)


if __name__ == "__main__":
    unittest.main()
