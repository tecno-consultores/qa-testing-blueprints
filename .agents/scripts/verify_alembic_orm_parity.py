#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Auditoría para prevenir modelos ORM huérfanos sin migración de base de datos.

Inspecciona modelos SQLAlchemy en src/models/ (o models/), valida que todas las
tablas declaradas con __tablename__ existan tras aplicar cronológicamente las
migraciones Alembic (upgrade) y que los revision IDs no superen VARCHAR(32).
"""

from __future__ import annotations

import argparse
import ast
import heapq
import re
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

_DEFAULT_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REPO_ROOT = _DEFAULT_REPO_ROOT

_REV_RE = re.compile(
    r'^\s*revision(?:\s*:\s*[^=]+)?\s*=\s*["\']([^"\']+)["\']',
    re.MULTILINE,
)
_IDENT_PART = r'(?:"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)'
_QUALIFIED_TABLE = rf"(?:{_IDENT_PART}\s*\.\s*)?({_IDENT_PART})"
_SQL_DDL_RE = re.compile(
    rf"\b(CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?{_QUALIFIED_TABLE}",
    re.IGNORECASE,
)
_SQL_RENAME_RE = re.compile(
    rf"\bALTER\s+TABLE\s+{_QUALIFIED_TABLE}\s+RENAME\s+TO\s+{_QUALIFIED_TABLE}",
    re.IGNORECASE,
)
_SQL_LINE_COMMENT_RE = re.compile(r"--[^\n]*")


@dataclass(frozen=True)
class _MigrationInfo:
    path: Path
    revision: str | None
    down_revisions: tuple[str, ...]
    ops: tuple[tuple[str, ...], ...]


def _resolve_backend_dir(repo_root: Path | None = None) -> Path:
    """Detecta la carpeta raíz del backend relativa al repositorio."""
    root = repo_root or REPO_ROOT
    for candidate in (root / "fastapi", root / "backend", root):
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


def _iter_dir_models(models_dir: Path) -> list[Path]:
    if not models_dir.is_dir():
        return []
    return [
        py_file
        for py_file in sorted(models_dir.rglob("*.py"))
        if py_file.is_file() and py_file.name not in ("__init__.py", "base.py")
    ]


def _resolve_model_files(backend_dir: Path) -> list[Path]:
    """Localiza recursivamente modelos ORM (src/models/**/*.py o src/models.py)."""
    files: list[Path] = [
        p
        for p in (backend_dir / "src" / "models.py", backend_dir / "models.py")
        if p.is_file()
    ]
    seen: set[Path] = set(files)
    for models_dir in (backend_dir / "src" / "models", backend_dir / "models"):
        for py_file in _iter_dir_models(models_dir):
            if py_file not in seen:
                seen.add(py_file)
                files.append(py_file)
    return files


def _iter_migration_files(migrations_dir: Path) -> list[Path]:
    return sorted(
        (
            p
            for p in migrations_dir.rglob("*.py")
            if p.is_file() and p.name != "__init__.py"
        ),
        key=lambda p: p.as_posix(),
    )


def _read_text_safe(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def _extract_class_tables(cls_node: ast.ClassDef) -> set[str]:
    tables: set[str] = set()
    for stmt in cls_node.body:
        expr = _extract_assigned_expr(stmt, "__tablename__")
        if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
            tables.add(expr.value)
    return tables


def _extract_tables_from_ast(content: str, file_path: Path | None = None) -> set[str]:
    try:
        tree = ast.parse(content)
    except SyntaxError as exc:
        label = str(file_path) if file_path is not None else "<orm>"
        raise ValueError(f"Error de sintaxis en modelo ORM '{label}': {exc}") from exc
    tables: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            tables.update(_extract_class_tables(node))
    return tables


def get_orm_tables(model_files: list[Path]) -> set[str]:
    """Extrae nombres de tablas a partir de __tablename__ en los modelos ORM."""
    tables: set[str] = set()
    for py_file in model_files:
        content = _read_text_safe(py_file)
        if content is not None:
            tables.update(_extract_tables_from_ast(content, py_file))
    return tables


def _extract_assigned_expr(stmt: ast.stmt, name: str) -> ast.expr | None:
    if isinstance(stmt, ast.Assign):
        if any(isinstance(t, ast.Name) and t.id == name for t in stmt.targets):
            return stmt.value
    if isinstance(stmt, ast.AnnAssign):
        if isinstance(stmt.target, ast.Name) and stmt.target.id == name:
            return stmt.value
    return None


def _expr_to_str_tuple(expr: ast.expr | None) -> tuple[str, ...]:
    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return (expr.value,)
    if isinstance(expr, ast.Tuple | ast.List):
        return tuple(
            elt.value
            for elt in expr.elts
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
        )
    return ()


def _find_upgrade_node(
    module: ast.Module,
) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    for stmt in module.body:
        if (
            isinstance(stmt, ast.FunctionDef | ast.AsyncFunctionDef)
            and stmt.name == "upgrade"
        ):
            return stmt
    return None


def _iter_calls_in_order(node: ast.AST) -> Iterator[ast.Call]:
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.Call):
            yield child
        yield from _iter_calls_in_order(child)


def _const_str(expr: ast.expr) -> str | None:
    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return expr.value
    return None


def _call_str_arg(call: ast.Call, pos: int, kw_name: str) -> str | None:
    if len(call.args) > pos:
        return _const_str(call.args[pos])
    for kw in call.keywords:
        if kw.arg == kw_name:
            return _const_str(kw.value)
    return None


def _is_text_call(expr: ast.Call) -> bool:
    if isinstance(expr.func, ast.Name):
        return expr.func.id == "text"
    if isinstance(expr.func, ast.Attribute):
        return expr.func.attr == "text"
    return False


def _extract_sql_string(expr: ast.expr) -> str | None:
    direct = _const_str(expr)
    if direct is not None:
        return direct
    if isinstance(expr, ast.Call) and _is_text_call(expr) and expr.args:
        return _const_str(expr.args[0])
    return None


def _unquote_ident(raw: str) -> str:
    return raw.strip().strip('"').strip("`")


def _extract_sql_ops(sql: str) -> list[tuple[str, ...]]:
    cleaned = _SQL_LINE_COMMENT_RE.sub("", sql)
    ops: list[tuple[str, ...]] = []
    for match in _SQL_DDL_RE.finditer(cleaned):
        action = match.group(1).lower()
        table_name = _unquote_ident(match.group(2))
        if table_name:
            ops.append((action, table_name))
    for match in _SQL_RENAME_RE.finditer(cleaned):
        old_name = _unquote_ident(match.group(1))
        new_name = _unquote_ident(match.group(2))
        if old_name and new_name:
            ops.append(("rename", old_name, new_name))
    return ops


def _extract_execute_ops(call: ast.Call) -> list[tuple[str, ...]]:
    arg: ast.expr | None = call.args[0] if call.args else None
    if arg is None:
        arg = next(
            (kw.value for kw in call.keywords if kw.arg in ("statement", "clause")),
            None,
        )
    if arg is None:
        return []
    sql = _extract_sql_string(arg)
    return _extract_sql_ops(sql) if sql is not None else []


def _op_method_name(call: ast.Call) -> str | None:
    if not isinstance(call.func, ast.Attribute):
        return None
    val = call.func.value
    if isinstance(val, ast.Name) and val.id == "op":
        return call.func.attr
    return None


def _extract_op_call(call: ast.Call) -> list[tuple[str, ...]]:
    method = _op_method_name(call)
    if method in ("create_table", "drop_table"):
        tbl = _call_str_arg(call, 0, "table_name")
        action = "create" if method == "create_table" else "drop"
        return [(action, tbl)] if tbl else []
    if method == "rename_table":
        old = _call_str_arg(call, 0, "old_table_name")
        new = _call_str_arg(call, 1, "new_table_name")
        return [("rename", old, new)] if old and new else []
    if method == "execute":
        return _extract_execute_ops(call)
    return []


def _extract_upgrade_ops(module: ast.Module) -> tuple[tuple[str, ...], ...]:
    upgrade_node = _find_upgrade_node(module)
    if upgrade_node is None:
        return ()
    ops: list[tuple[str, ...]] = []
    for call in _iter_calls_in_order(upgrade_node):
        ops.extend(_extract_op_call(call))
    return tuple(ops)


def _extract_revision_meta(module: ast.Module) -> tuple[str | None, tuple[str, ...]]:
    revision: str | None = None
    down_revisions: tuple[str, ...] = ()
    for stmt in module.body:
        rev_expr = _extract_assigned_expr(stmt, "revision")
        if rev_expr is not None:
            revs = _expr_to_str_tuple(rev_expr)
            revision = revs[0] if revs else None
        down_expr = _extract_assigned_expr(stmt, "down_revision")
        if down_expr is not None:
            down_revisions = _expr_to_str_tuple(down_expr)
    return revision, down_revisions


def _parse_migration_file(mig_file: Path) -> _MigrationInfo | None:
    content = _read_text_safe(mig_file)
    if content is None:
        return None
    try:
        module = ast.parse(content, filename=str(mig_file))
    except SyntaxError:
        rev_match = _REV_RE.search(content)
        rev = rev_match.group(1) if rev_match else None
        return _MigrationInfo(path=mig_file, revision=rev, down_revisions=(), ops=())
    revision, down_revisions = _extract_revision_meta(module)
    ops = _extract_upgrade_ops(module)
    return _MigrationInfo(
        path=mig_file,
        revision=revision,
        down_revisions=down_revisions,
        ops=ops,
    )


def _index_migration_revisions(records: list[_MigrationInfo]) -> dict[str, int]:
    by_rev: dict[str, int] = {}
    for idx, rec in enumerate(records):
        if rec.revision is None:
            continue
        if rec.revision in by_rev:
            raise ValueError(
                f"Revision Alembic duplicada '{rec.revision}' en '{rec.path.name}'."
            )
        by_rev[rec.revision] = idx
    return by_rev


def _build_migration_graph(
    records: list[_MigrationInfo],
) -> tuple[dict[int, list[int]], list[int]]:
    by_rev = _index_migration_revisions(records)
    children: dict[int, list[int]] = {}
    indegree = [0] * len(records)
    for idx, rec in enumerate(records):
        for parent_rev in rec.down_revisions:
            parent_idx = by_rev.get(parent_rev)
            if parent_idx is not None and parent_idx != idx:
                children.setdefault(parent_idx, []).append(idx)
                indegree[idx] += 1
    return children, indegree


def _order_migrations(records: list[_MigrationInfo]) -> list[_MigrationInfo]:
    children, indegree = _build_migration_graph(records)
    ready = [idx for idx, deg in enumerate(indegree) if deg == 0]
    ordered_indices: list[int] = []
    while ready:
        curr = heapq.heappop(ready)
        ordered_indices.append(curr)
        for nxt in children.get(curr, ()):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                heapq.heappush(ready, nxt)
    if len(ordered_indices) < len(records):
        seen = set(ordered_indices)
        ordered_indices.extend(i for i in range(len(records)) if i not in seen)
    return [records[i] for i in ordered_indices]


def _apply_migration_ops(tables: set[str], ops: tuple[tuple[str, ...], ...]) -> None:
    for op in ops:
        kind = op[0]
        if kind == "create":
            tables.add(op[1])
        elif kind == "drop":
            tables.discard(op[1])
        elif kind == "rename":
            tables.discard(op[1])
            tables.add(op[2])


def get_migrated_tables(migrations_dir: Path | None) -> set[str]:
    """Extrae tablas activas tras aplicar cronológicamente upgrade()."""
    if not migrations_dir or not migrations_dir.is_dir():
        return set()

    records: list[_MigrationInfo] = []
    for mig_file in _iter_migration_files(migrations_dir):
        parsed = _parse_migration_file(mig_file)
        if parsed is not None:
            records.append(parsed)

    migrated: set[str] = set()
    for rec in _order_migrations(records):
        _apply_migration_ops(migrated, rec.ops)
    return migrated


def _extract_revision_id(mig_file: Path) -> str | None:
    content = _read_text_safe(mig_file)
    if content is None:
        return None
    try:
        module = ast.parse(content, filename=str(mig_file))
    except SyntaxError:
        match = _REV_RE.search(content)
        return match.group(1) if match else None
    revision, _ = _extract_revision_meta(module)
    if revision is not None:
        return revision
    match = _REV_RE.search(content)
    return match.group(1) if match else None


def verify_revision_id_lengths(
    migrations_dir: Path | None,
) -> list[tuple[str, str, int]]:
    """Valida que ningún revision ID supere los 32 caracteres de PostgreSQL."""
    if not migrations_dir or not migrations_dir.is_dir():
        return []
    violations: list[tuple[str, str, int]] = []
    for mig_file in _iter_migration_files(migrations_dir):
        rev_id = _extract_revision_id(mig_file)
        if rev_id is not None and len(rev_id) > 32:
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


def _run_orm_vs_migrations(
    model_files: list[Path],
    migrations_dir: Path | None,
    exit_skipped_code: int,
) -> int:
    try:
        orm_tables = get_orm_tables(model_files)
    except ValueError as exc:
        print(f"❌ ERROR: {exc}")
        return 1
    if not orm_tables:
        print("⚠️ SKIPPED [ORM Parity]: 0 modelos con __tablename__ detectados.")
        return exit_skipped_code
    try:
        return _validate_orm_migrations(orm_tables, migrations_dir)
    except ValueError as exc:
        print(f"❌ ERROR: {exc}")
        return 1


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

    return _run_orm_vs_migrations(model_files, migrations_dir, exit_skipped_code)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita paridad entre modelos ORM SQLAlchemy y migraciones Alembic."
    )
    parser.add_argument("target_root", nargs="?", type=Path, default=None)
    parser.add_argument("--workspace", type=Path, default=None)
    parser.add_argument("--exit-skipped-code", type=int, default=0)
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
