# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Utilidades compartidas para scripts de gobernanza QA 11X."""

from __future__ import annotations

import errno
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _budgets import CANONICAL_IGNORED_DIRS as CANONICAL_IGNORED_DIRS  # noqa: E402

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"
        ),
        "[REDACTED]",
    ),
    (re.compile(r"\b(Bearer|Basic)\s+[^\s\"']+", re.IGNORECASE), r"\1 [REDACTED]"),
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED]\2"),
    (
        re.compile(
            r"\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s\"'&]+",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(
            r"(--(?:token|api-key|apikey|secret|password|passwd))(?:\s+|=)[^\s\"']+",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(r"\b(?:ghp|gho|ghu|ghs|github_pat|npm)_[A-Za-z0-9_]{12,}\b"),
        "[REDACTED]",
    ),
    (
        re.compile(r"\b(?:glpat|xox[baprs])-[A-Za-z0-9_-]{12,}\b"),
        "[REDACTED]",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"), "[REDACTED]"),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{16,}\b"), "[REDACTED]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED]"),
)

PRIVATE_CONSUMER_LEAK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("rosgrid-brand", re.compile(r"\brosgrid\b", re.IGNORECASE)),
    ("rosgrid-audit-hash", re.compile(r"\b_rg_in_tx_audit_hash\b")),
    ("rosgrid-env", re.compile(r"\bROSGRID_[A-Z0-9_]+\b")),
    ("personal-dropbox-path", re.compile(r"/home/[A-Za-z0-9._-]+/Dropbox/")),
    ("rosgrid-fleet-endpoint", re.compile(r"/api/v1/metrics/fleet\b")),
    ("rosgrid-router-display", re.compile(r"\brouter_display_name\b")),
)


def redact_secrets(text: str) -> str:
    """Redacta credenciales, tokens y claves privadas conocidas en texto plano."""
    sanitized = text
    for pattern, repl in SECRET_PATTERNS:
        sanitized = pattern.sub(repl, sanitized)
    return sanitized


def reject_duplicate_json_keys(
    pairs: list[tuple[str, Any]], *, context: str = ""
) -> dict[str, Any]:
    """object_pairs_hook estricto que rechaza claves JSON duplicadas."""
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            suffix = f" en {context}" if context else ""
            raise ValueError(f"Clave JSON duplicada detectada{suffix}: {key!r}")
        obj[key] = value
    return obj


def parse_json_no_duplicate_keys(raw: str, *, context: str = "") -> Any:
    """Parsea JSON estricto rechazando claves duplicadas."""
    return json.loads(
        raw,
        object_pairs_hook=lambda pairs: reject_duplicate_json_keys(
            pairs, context=context
        ),
    )


def load_json_no_duplicate_keys(path: Path) -> Any:
    """Lee un archivo JSON rechazando cualquier clave duplicada."""
    return parse_json_no_duplicate_keys(
        path.read_text(encoding="utf-8"), context=path.name
    )


def _safe_chmod(path: Path, mode: int | None) -> None:
    if mode is None:
        return
    try:
        os.chmod(path, mode)
    except OSError as exc:
        if exc.errno not in (errno.EPERM, errno.EACCES):
            raise


def atomic_write_text(
    target: Path,
    content: str,
    *,
    mode: int | None = None,
    fsync: bool = False,
) -> None:
    """Escribe texto atómicamente con archivo temporal exclusivo + UUID."""
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_name = f".{target.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
    tmp_path = target.parent / tmp_name
    open_mode = 0o644 if mode is None else mode
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(tmp_path, flags, open_mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            if fsync:
                os.fsync(handle.fileno())
        _safe_chmod(tmp_path, mode)
        os.replace(tmp_path, target)
        _safe_chmod(target, mode)
    except OSError:
        tmp_path.unlink(missing_ok=True)
        raise


def atomic_write_json(
    target: Path,
    payload: Any,
    *,
    mode: int | None = None,
    fsync: bool = False,
    indent: int = 2,
) -> None:
    """Serializa payload como JSON UTF-8 con salto final y escritura atómica."""
    raw = json.dumps(payload, indent=indent, ensure_ascii=False) + "\n"
    atomic_write_text(target, raw, mode=mode, fsync=fsync)


def git_safe_directory_args(workspace: Path | str | None = None) -> list[str]:
    """Devuelve banderas git -c safe.directory seguras para contenedores efímeros."""
    target = "*" if workspace is None else str(workspace)
    return ["-c", f"safe.directory={target}"]


def build_git_command(workspace: Path, *args: str) -> list[str]:
    """Construye una invocación git sin shell segura para repositorios montados."""
    return [
        "git",
        "-c",
        "core.quotePath=false",
        *git_safe_directory_args(),
        "-C",
        str(workspace),
        *args,
    ]
