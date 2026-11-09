#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Script de auditoría para prevenir modelos ORM huérfanos sin migración de base de datos.

Inspecciona modelos SQLAlchemy en src/models/ (o src/models.py) y valida que todas
las tablas declaradas con __tablename__ existan en los archivos de migración
de Alembic (migrations/versions/*.py o alembic/versions/*.py), y que los revision IDs
no superen el límite VARCHAR(32) de PostgreSQL.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Optional, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _resolve_backend_dir() -> Path:
    """Detecta la carpeta raíz del backend (fastapi, backend o /app)."""
    candidates = [
        REPO_ROOT / "fastapi",
        REPO_ROOT / "backend",
        Path("/app"),
        REPO_ROOT,
    ]
    for c in candidates:
        if c.is_dir() and ((c / "src").is_dir() or (c / "models").is_dir()):
            return c
    return REPO_ROOT


def _resolve_migrations_dir(backend_dir: Path) -> Optional[Path]:
    """Localiza el directorio de versiones de Alembic."""
    candidates = [
        backend_dir / "migrations" / "versions",
        backend_dir / "alembic" / "versions",
        REPO_ROOT / "migrations" / "versions",
        REPO_ROOT / "alembic" / "versions",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None


def _resolve_model_files(backend_dir: Path) -> List[Path]:
    """Localiza archivos de modelos (directorio src/models/*.py o archivo src/models.py)."""
    files: List[Path] = []
    single_file = backend_dir / "src" / "models.py"
    models_dir = backend_dir / "src" / "models"

    if single_file.is_file():
        files.append(single_file)

    if models_dir.is_dir():
        for py_file in models_dir.glob("*.py"):
            if py_file.name not in ("__init__.py", "base.py"):
                files.append(py_file)

    return files


def get_orm_tables(model_files: List[Path]) -> Set[str]:
    """Extrae nombres de tablas a partir de __tablename__ en los modelos ORM."""
    tables: Set[str] = set()
    table_pattern = re.compile(r'__tablename__\s*=\s*["\']([^"\']+)["\']')
    for py_file in model_files:
        try:
            content = py_file.read_text(encoding="utf-8")
            for match in table_pattern.finditer(content):
                tables.add(match.group(1))
        except OSError:
            continue
    return tables


def get_migrated_tables(migrations_dir: Optional[Path]) -> Set[str]:
    """Extrae nombres de tablas creadas o renombradas en las migraciones de Alembic."""
    migrated: Set[str] = set()
    if not migrations_dir or not migrations_dir.is_dir():
        return migrated

    create_pattern = re.compile(r'op\.create_table\(\s*["\']([^"\']+)["\']')
    rename_pattern = re.compile(r'op\.rename_table\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']\)')

    for mig_file in migrations_dir.glob("*.py"):
        try:
            content = mig_file.read_text(encoding="utf-8")
            for match in create_pattern.finditer(content):
                migrated.add(match.group(1))
            for match in rename_pattern.finditer(content):
                migrated.add(match.group(1))
        except OSError:
            continue
    return migrated


def verify_revision_id_lengths(migrations_dir: Optional[Path]) -> List[Tuple[str, str, int]]:
    """Valida que ningún revision ID supere los 32 caracteres de alembic_version.version_num."""
    if not migrations_dir or not migrations_dir.is_dir():
        return []
    rev_pattern = re.compile(r'^\s*revision(?:\s*:\s*[^=]+)?\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
    violations: List[Tuple[str, str, int]] = []
    for mig_file in sorted(migrations_dir.glob("*.py")):
        try:
            content = mig_file.read_text(encoding="utf-8")
            match = rev_pattern.search(content)
            if match:
                rev_id = match.group(1)
                if len(rev_id) > 32:
                    violations.append((mig_file.name, rev_id, len(rev_id)))
        except OSError:
            continue
    return violations


def main() -> int:
    backend_dir = _resolve_backend_dir()
    migrations_dir = _resolve_migrations_dir(backend_dir)
    model_files = _resolve_model_files(backend_dir)

    rev_violations = verify_revision_id_lengths(migrations_dir)
    if rev_violations:
        print("❌ ERROR: Se detectaron identificadores 'revision' en Alembic que exceden VARCHAR(32) en PostgreSQL:")
        for fname, rev_id, length in rev_violations:
            print(f"   - Archivo: {fname} -> revision='{rev_id}' ({length} caracteres > máximo 32)")
        print("💡 Solución: Acorta el identificador 'revision' a <= 32 caracteres.")
        return 1

    if not model_files:
        print("✔ [ORM Parity] 0 archivos de modelos detectados (omitido).")
        return 0

    orm_tables = get_orm_tables(model_files)
    if not orm_tables:
        print("✔ [ORM Parity] 0 modelos con __tablename__ detectados (omitido).")
        return 0

    migrated_tables = get_migrated_tables(migrations_dir)
    missing = orm_tables - migrated_tables

    if missing:
        print("❌ ERROR: Se detectaron modelos ORM huérfanos sin migración de Alembic:")
        for t in sorted(missing):
            print(f"   - Tabla: '{t}' definida en ORM pero NO creada en migraciones.")
        print("💡 Solución: Genera la migración (ej. alembic revision -m 'add_<tabla>')")
        return 1

    tables_str = ", ".join(sorted(orm_tables))
    print(f"✔ [ORM Parity] {len(orm_tables)} tablas ORM ({tables_str}) sincronizadas (revisions <= 32 chars).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
