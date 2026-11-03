#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

"""Script de auditoría para prevenir modelos ORM huérfanos sin migración de base de datos.

Inspecciona modelos en src/models/ y valida que todas las tablas existan
en los archivos de migración (ej. Alembic en migrations/versions/).
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Detecta ubicación de FastAPI / backend
if (REPO_ROOT / "fastapi").exists():
    BACKEND_DIR = REPO_ROOT / "fastapi"
elif Path("/app/src/models").exists():
    BACKEND_DIR = Path("/app")
else:
    BACKEND_DIR = REPO_ROOT

MIGRATIONS_DIR = BACKEND_DIR / "migrations" / "versions"
MODELS_DIR = BACKEND_DIR / "src" / "models"


def get_orm_tables() -> set[str]:
    """Extrae nombres de tablas a partir de __tablename__ en src/models/."""
    tables = set()
    if not MODELS_DIR.exists():
        return tables

    table_pattern = re.compile(r'__tablename__\s*=\s*["\']([^"\']+)["\']')
    for py_file in MODELS_DIR.glob("*.py"):
        if py_file.name == "__init__.py" or py_file.name == "base.py":
            continue
        content = py_file.read_text(encoding="utf-8")
        for match in table_pattern.finditer(content):
            tables.add(match.group(1))
    return tables


def get_migrated_tables() -> set[str]:
    """Extrae nombres de tablas creadas o renombradas en las migraciones de Alembic."""
    migrated = set()
    if not MIGRATIONS_DIR.exists():
        return migrated

    create_pattern = re.compile(r'op\.create_table\(\s*["\']([^"\']+)["\']')
    rename_pattern = re.compile(r'op\.rename_table\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']\)')

    for mig_file in MIGRATIONS_DIR.glob("*.py"):
        content = mig_file.read_text(encoding="utf-8")
        for match in create_pattern.finditer(content):
            migrated.add(match.group(1))
        for match in rename_pattern.finditer(content):
            migrated.add(match.group(1))
    return migrated


def verify_revision_id_lengths() -> list[tuple[str, str, int]]:
    """Valida que ningún revision ID supere los 32 caracteres de alembic_version.version_num."""
    if not MIGRATIONS_DIR.exists():
        return []
    rev_pattern = re.compile(r'^\s*revision(?:\s*:\s*str)?\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
    violations: list[tuple[str, str, int]] = []
    for mig_file in sorted(MIGRATIONS_DIR.glob("*.py")):
        content = mig_file.read_text(encoding="utf-8")
        match = rev_pattern.search(content)
        if match:
            rev_id = match.group(1)
            if len(rev_id) > 32:
                violations.append((mig_file.name, rev_id, len(rev_id)))
    return violations


def main() -> int:
    print("🔍 [QA 11X] Verificando paridad entre modelos SQLAlchemy ORM y migraciones Alembic...")

    rev_violations = verify_revision_id_lengths()
    if rev_violations:
        print("\n❌ ERROR: Se detectaron identificadores 'revision' en Alembic que exceden VARCHAR(32) en PostgreSQL:")
        for fname, rev_id, length in rev_violations:
            print(f"   - Archivo: {fname} -> revision='{rev_id}' ({length} caracteres > máximo 32)")
        print("\n💡 Solución: Acorta el identificador 'revision' a <= 32 caracteres.")
        return 1

    if not MODELS_DIR.exists():
        print(f"ℹ️ Directorio de modelos no encontrado ({MODELS_DIR}); omitiendo verificación de paridad ORM.")
        return 0

    orm_tables = get_orm_tables()
    if not orm_tables:
        print("ℹ️ No se detectaron modelos con __tablename__; omitiendo verificación.")
        return 0

    migrated_tables = get_migrated_tables()
    missing = orm_tables - migrated_tables

    if missing:
        print("\n❌ ERROR: Se detectaron modelos ORM huérfanos sin migración de Alembic:")
        for t in sorted(missing):
            print(f"   - Tabla: '{t}' definida en src/models/ pero NO creada en migraciones.")
        print("\n💡 Solución: Genera la migración (ej. alembic revision -m 'add_<tabla>')")
        return 1

    print(
        f"✅ ÉXITO: Las {len(orm_tables)} tablas ORM cuentan con su correspondiente migración y revision IDs <= 32 chars."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
