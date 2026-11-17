#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Auditoría para prevenir modelos ORM huérfanos sin migración de base de datos.

Inspecciona modelos SQLAlchemy en src/models/ (o src/models.py), valida que todas
las tablas declaradas con __tablename__ existan en Alembic y que los revision IDs
no superen el límite VARCHAR(32) de PostgreSQL.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_DEFAULT_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REPO_ROOT = _DEFAULT_REPO_ROOT

_TABLE_RE = re.compile(r'__tablename__\s*=\s*["\']([^"\']+)["\']')
_CREATE_TABLE_RE = re.compile(r'op\.create_table\(\s*["\']([^"\']+)["\']')
_RENAME_TABLE_RE = re.compile(
    r'op\.rename_table\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']\)'
)
_REV_RE = re.compile(
    r'^\s*revision(?:\s*:\s*[^=]+)?\s*=\s*["\']([^"\']+)["\']',
    re.MULTILINE,
)


def _resolve_backend_dir(repo_root: Path | None = None) -> Path:
    """Detecta la carpeta raíz del backend (fastapi, backend o /app)."""
    root = repo_root or REPO_ROOT
    candidates = [root / "fastapi", root / "backend"]
    if root == _DEFAULT_REPO_ROOT:
        candidates.append(Path("/app"))
    candidates.append(root)
    for candidate in candidates:
        has_src = (candidate / "src").is_dir() or (candidate / "models").is_dir()
        if candidate.is_dir() and has_src:
            return candidate
    return root


def _resolve_migrations_dir(
    backend_dir: Path, repo_root: Path | None = None
) -> Path | None:
    """Localiza el directorio de versiones de Alembic."""
    root = repo_root or REPO_ROOT
    candidates = (
        backend_dir / "migrations" / "versions",
        backend_dir / "alembic" / "versions",
        root / "migrations" / "versions",
        root / "alembic" / "versions",
    )
    return next((c for c in candidates if c.is_dir()), None)


def _resolve_model_files(backend_dir: Path) -> list[Path]:
    """Localiza archivos de modelos (src/models/*.py o src/models.py)."""
    files: list[Path] = []
    single_file = backend_dir / "src" / "models.py"
    if single_file.is_file():
        files.append(single_file)

    models_dir = backend_dir / "src" / "models"
    if models_dir.is_dir():
        for py_file in sorted(models_dir.glob("*.py")):
            if py_file.name not in ("__init__.py", "base.py"):
                files.append(py_file)
    return files


def _read_text_safe(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def get_orm_tables(model_files: list[Path]) -> set[str]:
    """Extrae nombres de tablas a partir de __tablename__ en los modelos ORM."""
    tables: set[str] = set()
    for py_file in model_files:
        content = _read_text_safe(py_file)
        if content is None:
            continue
        tables.update(m.group(1) for m in _TABLE_RE.finditer(content))
    return tables


def get_migrated_tables(migrations_dir: Path | None) -> set[str]:
    """Extrae nombres de tablas creadas o renombradas en migraciones Alembic."""
    migrated: set[str] = set()
    if not migrations_dir or not migrations_dir.is_dir():
        return migrated

    for mig_file in sorted(migrations_dir.glob("*.py")):
        content = _read_text_safe(mig_file)
        if content is None:
            continue
        migrated.update(m.group(1) for m in _CREATE_TABLE_RE.finditer(content))
        migrated.update(m.group(1) for m in _RENAME_TABLE_RE.finditer(content))
    return migrated


def verify_revision_id_lengths(
    migrations_dir: Path | None,
) -> list[tuple[str, str, int]]:
    """Valida que ningún revision ID supere los 32 caracteres de PostgreSQL."""
    if not migrations_dir or not migrations_dir.is_dir():
        return []
    violations: list[tuple[str, str, int]] = []
    for mig_file in sorted(migrations_dir.glob("*.py")):
        content = _read_text_safe(mig_file)
        if content is None:
            continue
        match = _REV_RE.search(content)
        if match and len(match.group(1)) > 32:
            rev_id = match.group(1)
            violations.append((mig_file.name, rev_id, len(rev_id)))
    return violations


def _report_revision_violations(violations: list[tuple[str, str, int]]) -> int:
    print(
        "❌ ERROR: Se detectaron identificadores 'revision' en Alembic "
        "que exceden VARCHAR(32) en PostgreSQL:"
    )
    for fname, rev_id, length in violations:
        print(
            f"   - Archivo: {fname} -> revision='{rev_id}' "
            f"({length} caracteres > máximo 32)"
        )
    print("💡 Solución: Acorta el identificador 'revision' a <= 32 caracteres.")
    return 1


def _report_missing_tables(missing: set[str]) -> int:
    print("❌ ERROR: Se detectaron modelos ORM huérfanos sin migración de Alembic:")
    for table in sorted(missing):
        print(f"   - Tabla: '{table}' definida en ORM pero NO creada en migraciones.")
    print("💡 Solución: Genera la migración (ej. alembic revision -m 'add_<tabla>')")
    return 1


def _validate_orm_migrations(
    orm_tables: set[str], migrations_dir: Path | None
) -> int:
    migrated_tables = get_migrated_tables(migrations_dir)
    missing = orm_tables - migrated_tables
    if missing:
        return _report_missing_tables(missing)

    tables_str = ", ".join(sorted(orm_tables))
    print(
        f"✔ [ORM Parity] {len(orm_tables)} tablas ORM ({tables_str}) "
        "sincronizadas (revisions <= 32 chars)."
    )
    return 0


def main(target_root: Path | None = None, exit_skipped_code: int = 0) -> int:
    root = REPO_ROOT if target_root is None else target_root
    backend_dir = _resolve_backend_dir(root)
    migrations_dir = _resolve_migrations_dir(backend_dir, root)

    rev_violations = verify_revision_id_lengths(migrations_dir)
    if rev_violations:
        return _report_revision_violations(rev_violations)

    model_files = _resolve_model_files(backend_dir)
    if not model_files:
        print("⚠️ SKIPPED [ORM Parity]: 0 archivos de modelos ORM detectados.")
        return exit_skipped_code

    orm_tables = get_orm_tables(model_files)
    if not orm_tables:
        print("⚠️ SKIPPED [ORM Parity]: 0 modelos con __tablename__ detectados.")
        return exit_skipped_code

    return _validate_orm_migrations(orm_tables, migrations_dir)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita paridad entre modelos ORM SQLAlchemy y migraciones Alembic."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=0)
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    return main(
        target_root=args.target_root,
        exit_skipped_code=args.exit_skipped_code,
    )


if __name__ == "__main__":
    sys.exit(cli_main())
