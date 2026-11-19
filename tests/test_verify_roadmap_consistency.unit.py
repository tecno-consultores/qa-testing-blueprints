#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""test_verify_roadmap_consistency.unit.py — Pruebas Unitarias del Validador.

Valida:
1. Parseo determinista de la tabla resumen de ROADMAP.md.
2. Análisis de casillas de tareas [x] y [ ] en secciones.
3. Detección de inconsistencias: tabla Pendiente con tareas [x] (caso Hito 4).
4. Detección de inconsistencias: tabla Completado con tareas vacías.
5. Detección de discrepancias en iconos de encabezado (## ✅ vs ## ⏳).
6. Validación de .agents/ACTIVE_TASK.md y session_checkpoint.json.
7. Ejecución de main()/cli_main() con códigos 0, 1 y 20 (SKIPPED).
"""

from __future__ import annotations

import importlib.util
import io
import json
import runpy
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / ".agents" / "scripts" / "verify_roadmap_consistency.py"

spec = importlib.util.spec_from_file_location("verify_roadmap_consistency", SCRIPT_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f"No se pudo cargar {SCRIPT_PATH}")
vrc = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = vrc
spec.loader.exec_module(vrc)


class TestVerifyRoadmapConsistency(unittest.TestCase):
    """Suite de pruebas unitarias para verify_roadmap_consistency.py."""

    def test_parse_roadmap_table_valid(self) -> None:
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

    def test_parse_roadmap_table_empty(self) -> None:
        table = vrc.parse_roadmap_table("# No table here\nJust text")
        self.assertEqual(table, [])

    def test_parse_roadmap_sections(self) -> None:
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

    def test_validate_roadmap_perfect_match(self) -> None:
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

    def test_validate_roadmap_detects_pending_when_tasks_completed(self) -> None:
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
            self.assertTrue(
                any(
                    "Inconsistencia en Hito 4" in e and "completadas [x]" in e
                    for e in errors
                )
            )

    def test_validate_roadmap_detects_completed_when_tasks_pending(self) -> None:
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
            self.assertTrue(
                any(
                    "Inconsistencia en Hito 5" in e and "0 tareas completadas" in e
                    for e in errors
                )
            )

    def test_validate_roadmap_detects_header_icon_mismatch(self) -> None:
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

    def test_validate_roadmap_missing_section(self) -> None:
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

    def test_validate_active_task_valid_in_progress(self) -> None:
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

    def test_validate_active_task_valid_certified_clean(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                """# Tarea Activa
**Estado:** CERTIFIED_CLEAN
- [x] Fase 1
- [x] Fase 2
""",
                encoding="utf-8",
            )
            errors = vrc.validate_active_task(task_file)
            self.assertEqual(errors, [])

    def test_validate_active_task_certified_clean_with_pending_checkboxes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                """# Tarea Activa
**Estado:** CERTIFIED_CLEAN
- [x] Fase 1
- [ ] Fase 2 pendiente
""",
                encoding="utf-8",
            )
            errors = vrc.validate_active_task(task_file)
            self.assertTrue(any("casillas pendientes sin marcar" in e for e in errors))

    def test_validate_active_task_valid_completed(self) -> None:
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

    def test_validate_active_task_completed_with_pending_checkboxes(self) -> None:
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

    def test_validate_active_task_missing_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            task_file = Path(tmpdir) / "ACTIVE_TASK.md"
            task_file.write_text(
                "# Tarea Activa sin estado\n- [ ] Algo", encoding="utf-8"
            )
            errors = vrc.validate_active_task(task_file)
            self.assertTrue(
                any("carece del campo obligatorio '**Estado:**'" in e for e in errors)
            )

    def test_main_cli_execution_success(self) -> None:
        # Ejecuta main sobre el repositorio real actual (que está sincronizado).
        # Durante tareas activas puede estar IN_PROGRESS, que también retorna 0.
        buf = io.StringIO()
        with redirect_stdout(buf):
            exit_code = vrc.main()
        self.assertEqual(exit_code, 0)
        output = buf.getvalue().strip()
        self.assertIn("[Governance Sync]", output)
        self.assertEqual(len(output.splitlines()), 1)

    def test_validate_bilingual_en_roadmap_and_parity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            en_doc = tmp_path / "ROADMAP.md"
            es_doc = tmp_path / "ROADMAP.es.md"

            en_hdr = (
                "| Milestone | Milestone Name | Associated Specification "
                "| Status | Progress |\n"
            )
            en_doc.write_text(
                "# Roadmap\n\n"
                + en_hdr
                + "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Milestone 1** | Bilingual EN | `19_SPEC` "
                "| ✅ Completed | `100%` |\n"
                "| **Milestone 2** | Mobile Spec 20 | `20_SPEC` "
                "| 🟡 Pending | `0%` |\n\n"
                "## ✅ Milestone 1: Bilingual EN\n- [x] **T1:** Done.\n\n"
                "## ⏳ Milestone 2: Mobile Spec 20\n- [ ] **T2:** Todo.\n",
                encoding="utf-8",
            )
            es_hdr = (
                "| Hito | Nombre del Hito | Especificación Asociada "
                "| Estado | Progreso |\n"
            )
            es_doc.write_text(
                "# Roadmap\n\n"
                + es_hdr
                + "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` "
                "| ✅ Completado | `100%` |\n"
                "| **Hito 2** | Spec Móvil 20 | `20_SPEC` "
                "| 🟡 Pendiente | `0%` |\n\n"
                "## ✅ Hito 1: Bilingüe EN\n- [x] **T1:** Listo.\n\n"
                "## ⏳ Hito 2: Spec Móvil 20\n- [ ] **T2:** Por hacer.\n",
                encoding="utf-8",
            )

            self.assertEqual(vrc.validate_roadmap_consistency(en_doc), [])
            self.assertEqual(vrc.validate_roadmap_consistency(es_doc), [])
            self.assertEqual(vrc.validate_bilingual_roadmap_parity(en_doc, es_doc), [])
            # Caso trivial cuando falta uno de los archivos o ambos carecen de tabla
            self.assertEqual(
                vrc.validate_bilingual_roadmap_parity(
                    en_doc, tmp_path / "missing.md"
                ),
                [],
            )
            empty_en = tmp_path / "EMPTY_EN.md"
            empty_es = tmp_path / "EMPTY_ES.md"
            empty_en.write_text("# Empty\n", encoding="utf-8")
            empty_es.write_text("# Vacío\n", encoding="utf-8")
            self.assertEqual(
                vrc.validate_bilingual_roadmap_parity(empty_en, empty_es), []
            )

            # Divergencia de progreso entre idiomas
            es_doc.write_text(
                es_doc.read_text(encoding="utf-8").replace(
                    "| 🟡 Pendiente | `0%` |", "| ✅ Completado | `100%` |"
                ),
                encoding="utf-8",
            )
            parity_errors = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(
                any("Desfase bilingüe en Hito/Milestone 2" in e for e in parity_errors)
            )

            # Divergencia únicamente en estado is_completed manteniendo porcentaje
            es_doc.write_text(
                "# Roadmap\n\n"
                + es_hdr
                + "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` "
                "| 🚧 En Progreso | `100%` |\n"
                "| **Hito 2** | Spec Móvil 20 | `20_SPEC` "
                "| 🟡 Pendiente | `0%` |\n",
                encoding="utf-8",
            )
            status_diff = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(
                any("Desfase bilingüe en Hito/Milestone 1" in e for e in status_diff)
            )

            # Hito presente en EN pero faltante en ES
            es_doc.write_text(
                "# Roadmap\n\n"
                + es_hdr
                + "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Bilingüe EN | `19_SPEC` "
                "| ✅ Completado | `100%` |\n",
                encoding="utf-8",
            )
            missing_errors = vrc.validate_bilingual_roadmap_parity(en_doc, es_doc)
            self.assertTrue(len(missing_errors) >= 1)

    def test_validate_session_checkpoint_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            ckpt = base / "session_checkpoint.json"
            active = base / "ACTIVE_TASK.md"

            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])

            outside = base / "outside.json"
            outside.write_text("{}", encoding="utf-8")
            ckpt.symlink_to(outside)
            errs_sym = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("symlink" in e for e in errs_sym))
            ckpt.unlink()

            ckpt.write_text("{corrupt", encoding="utf-8")
            errs_corrupt = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("corrupto" in e for e in errs_corrupt))

            ckpt.write_text("[]", encoding="utf-8")
            errs_obj = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("objeto JSON" in e for e in errs_obj))

            ckpt.write_text(
                json.dumps({"status": "BAD", "intent_140chars": ""}),
                encoding="utf-8",
            )
            errs_bad = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("status inválido" in e for e in errs_bad))
            self.assertTrue(any("intent_140chars" in e for e in errs_bad))

            active.write_text("**Estado:** IN_PROGRESS\n", encoding="utf-8")
            ckpt.write_text(
                json.dumps(
                    {
                        "status": "CERTIFIED_CLEAN",
                        "intent_140chars": "Todo listo",
                        "planned_steps": ["F5"],
                    }
                ),
                encoding="utf-8",
            )
            errs_incoh = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("planned_steps" in e for e in errs_incoh))
            self.assertTrue(any("ACTIVE_TASK.md" in e for e in errs_incoh))

            active.write_text(
                "**Estado:** CERTIFIED_CLEAN\n- [x] F5\n", encoding="utf-8"
            )
            ckpt.write_text(
                json.dumps(
                    {
                        "status": "CERTIFIED_CLEAN",
                        "intent_140chars": "Todo listo",
                        "planned_steps": [],
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])
            # Compatibilidad con archivos legacy marcados COMPLETED (100%)
            active.write_text(
                "**Estado:** COMPLETED (100%)\n- [x] F5\n", encoding="utf-8"
            )
            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])
            active.unlink()
            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])

    def test_validate_partial_hitos_non_numeric_and_main_error_path(self) -> None:
        rows = vrc.parse_roadmap_table(
            "| **Hito 1** | X | `s` | 🚧 En Progreso | `N/A` |\n"
        )
        self.assertEqual(rows[0]["progreso_pct"], -1)

        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            self.assertTrue(
                any(
                    "Archivo no encontrado" in e
                    for e in vrc.validate_roadmap_consistency(base / "missing.md")
                )
            )
            self.assertEqual(vrc.validate_active_task(base / "missing_task.md"), [])

            no_tbl = base / "NO_TABLE.md"
            no_tbl.write_text("# Solo texto\n", encoding="utf-8")
            self.assertEqual(vrc.validate_roadmap_consistency(no_tbl), [])

            rm = base / "ROADMAP.md"
            rm.write_text(
                "# Roadmap\n"
                "| **Hito 1** | A | `s1` | ✅ Completado | `100%` |\n"
                "| **Hito 2** | B | `s2` | ⏳ Pendiente | `0%` |\n"
                "| **Hito 3** | C | `s3` | 🚧 En Progreso | `50%` |\n"
                "| **Hito 4** | D | `s4` | 🚧 En Progreso | `50%` |\n"
                "| **Hito 5** | E | `s5` | ⏳ Pendiente | `0%` |\n"
                "| **Hito 6** | F | `s6` | ⏳ Pendiente | `0%` |\n\n"
                "## 🚧 Hito 1: A\n- [x] ok\n- [ ] pend\n"
                "## Notas Generales\nTexto fuera de hito\n"
                "## 🚧 Hito 2: B\n- [x] ok\n- [ ] pend\n\n"
                "## 🚧 Hito 3: C\nSin casillas\n\n"
                "## 🚧 Hito 4: D\n- [x] ok\n- [ ] pend\n\n"
                "## ✅ Hito 5: E\nSin tareas\n\n"
                "## ✅ Hito 6: F\n- [ ] pend\n",
                encoding="utf-8",
            )
            errs = vrc.validate_roadmap_consistency(rm)
            self.assertTrue(any("Hito 1" in e and "Completado" in e for e in errs))
            self.assertTrue(any("Hito 2" in e and "Pendiente" in e for e in errs))
            self.assertTrue(any("Hito 6" in e and "⏳ Hito 6" in e for e in errs))
            self.assertEqual(
                vrc._dispatch_hito_checks(
                    "9",
                    {},
                    {
                        "is_all_completed": False,
                        "is_all_pending": False,
                        "is_partial": False,
                    },
                ),
                [],
            )

            # Caso SKIPPED=20 en workspace vacío sin ROADMAP ni ACTIVE_TASK
            empty_ws = base / "empty_ws"
            empty_ws.mkdir()
            buf_skip = io.StringIO()
            with redirect_stdout(buf_skip):
                rc_skip = vrc.main(target_root=empty_ws)
            self.assertEqual(rc_skip, 20)
            self.assertIn("SKIPPED", buf_skip.getvalue())
            self.assertEqual(
                vrc.cli_main([str(empty_ws), "--exit-skipped-code", "0"]), 0
            )

            # Con ROADMAP inválido retorna 1
            (base / ".agents" / "scripts").mkdir(parents=True)
            fake_script = (
                base / ".agents" / "scripts" / "verify_roadmap_consistency.py"
            )
            fake_script.write_text("# stub\n", encoding="utf-8")
            buf = io.StringIO()
            with (
                mock.patch.object(vrc, "__file__", str(fake_script)),
                redirect_stdout(buf),
            ):
                rc = vrc.main()
            self.assertEqual(rc, 1)
            self.assertIn("discrepancias de consistencia", buf.getvalue())

            with (
                mock.patch.object(sys, "argv", [str(SCRIPT_PATH), str(empty_ws)]),
                self.assertRaises(SystemExit) as exc,
            ):
                runpy.run_path(str(SCRIPT_PATH), run_name="__main__")
            self.assertEqual(exc.exception.code, 20)

    def test_wave3_orphan_section_and_checkpoint_reverse_drift(self) -> None:
        """Cubre M042/L027: sección huérfana en cuerpo, intent >140 y deriva inversa."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            rm = base / "ROADMAP.md"
            rm.write_text(
                "# Roadmap\n"
                "| Hito | Nombre | Spec | Estado | Progreso |\n"
                "| :--- | :--- | :--- | :---: | :---: |\n"
                "| **Hito 1** | Base | `s1` | ✅ Completado | `100%` |\n\n"
                "## ✅ Hito 1: Base\n- [x] ok\n\n"
                "## 🚧 Hito 2: Huérfano\n- [ ] pend\n",
                encoding="utf-8",
            )
            rm_errs = vrc.validate_roadmap_consistency(rm)
            self.assertTrue(any("Hito 2" in e for e in rm_errs))

            ckpt = base / "session_checkpoint.json"
            active = base / "ACTIVE_TASK.md"
            ckpt.write_text(
                json.dumps(
                    {
                        "schema_version": "1.0.0",
                        "status": "IN_PROGRESS",
                        "intent_140chars": "x" * 141,
                        "active_step": "step-1",
                        "planned_steps": ["step-1"],
                    }
                ),
                encoding="utf-8",
            )
            active.write_text(
                "**Estado:** CERTIFIED_CLEAN (100%)\n", encoding="utf-8"
            )
            ckpt_errs = vrc.validate_session_checkpoint(ckpt, active)
            self.assertTrue(any("intent_140chars" in e for e in ckpt_errs))
            self.assertTrue(any("IN_PROGRESS difiere" in e for e in ckpt_errs))

            # Cubre L390 (ACTIVE_TASK.md ausente) y L402 (IN_PROGRESS coherente)
            ckpt.write_text(
                json.dumps(
                    {
                        "schema_version": "1.0.0",
                        "status": "IN_PROGRESS",
                        "intent_140chars": "Coherente",
                        "active_step": "step-1",
                        "planned_steps": ["step-1"],
                    }
                ),
                encoding="utf-8",
            )
            active.write_text("**Estado:** IN_PROGRESS\n", encoding="utf-8")
            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])
            active.unlink()
            self.assertEqual(vrc.validate_session_checkpoint(ckpt, active), [])


if __name__ == "__main__":
    unittest.main()
