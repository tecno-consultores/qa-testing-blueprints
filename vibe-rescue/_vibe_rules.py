#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Reglas estaticas, patrones y escaneres por archivo para Vibe-to-Enterprise."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

IGNORED_DIRS = frozenset({
    "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "coverage",
    "qa11x-rescue",
})
CODE_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".vue", ".py", ".php"})
TEST_DIR_NAMES = frozenset({"tests", "test", "__tests__"})
UNSAFE_PATH_TOKENS = ("\x00", "%2e", "%2f", "%5c")
REDACTION_MARKER = "[REDACTED_SECRET]"
DEFAULT_MAX_LINES = 500
RLS_TEMPLATE_REL = "vibe-rescue/templates/rls_hardening.sql"
DEFAULT_ENV_KEYS = ("DATABASE_URL", "APP_ENCRYPTION_KEY", "AUDIT_HMAC_KEY")

CLIENT_SECRET_VAR_RE = re.compile(
    r"\b((?:VITE|NEXT_PUBLIC|EXPO_PUBLIC|REACT_APP)_[A-Z0-9_]*"
    r"(?:SERVICE_ROLE|SECRET|PRIVATE|OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)"
    r"[A-Z0-9_]*)\b"
)
LITERAL_KEY_RE = re.compile(
    r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{20,}"
    r"|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}"
    r"|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,})\b"
)
ENV_ASSIGN_RE = re.compile(
    r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$"
)
SENSITIVE_ENV_KEY_RE = re.compile(
    r"(?:SECRET|SERVICE_ROLE|PRIVATE|KEY|TOKEN|PASSWORD|PASSWD|DATABASE_URL)",
    re.IGNORECASE,
)
PLACEHOLDER_VAL_RE = re.compile(
    r"(?:example|placeholder|changeme|change_me|your_|redacted|<[^>]+>)",
    re.IGNORECASE,
)
REDACT_ASSIGN_RE = re.compile(
    r"([A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL)[A-Za-z0-9_]*"
    r"\s*[=:]\s*[\"']?)([^\"'\s\r\n]+)",
    re.IGNORECASE,
)
REDACT_BEARER_RE = re.compile(
    r"\b(Bearer|Basic)\s+[A-Za-z0-9._+/=-]+",
    re.IGNORECASE,
)
REDACT_LITERAL_RE = re.compile(
    r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}"
    r"|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{16,}"
    r"|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{16,}"
    r"|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})"
)

SQL_BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")
SQL_LINE_COMMENT_RE = re.compile(r"--[^\n]*")
SQL_PERMISSIVE_RE = re.compile(
    r"\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)",
    re.IGNORECASE,
)
SQL_CREATE_TABLE_RE = re.compile(
    r"\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r'("?[A-Za-z_][A-Za-z0-9_$]*"?(?:\s*\.\s*"?[A-Za-z_][A-Za-z0-9_$]*"?)?)',
    re.IGNORECASE,
)
SQL_ALTER_TABLE_RE = re.compile(
    r"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"
    r'("?[A-Za-z_][A-Za-z0-9_$]*"?(?:\s*\.\s*"?[A-Za-z_][A-Za-z0-9_$]*"?)?)'
    r"([^;]*)",
    re.IGNORECASE,
)
SQL_ENABLE_RLS_RE = re.compile(
    r"\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b",
    re.IGNORECASE,
)
SQL_FORCE_RLS_RE = re.compile(
    r"\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b",
    re.IGNORECASE,
)
SQL_BYPASSRLS_RE = re.compile(r"\bBYPASSRLS\b", re.IGNORECASE)
CLIENT_SERVICE_ROLE_RE = re.compile(r"\b(?:service_role|supabaseAdmin)\b")

# Concatenacion de literales evita auto-deteccion del auditor sobre sus reglas.
WEAK_TYPE_RE = re.compile(
    r"(?::\s*" r"any\b|\bas\s+" r"any\b"
    r"|@ts" r"-ignore|@ts" r"-nocheck"
    r"|#\s*type" r":\s*ignore)"
)
TS_STRICT_FALSE_RE = re.compile(r'"strict"\s*:\s*false')
MUTATING_ROUTE_RE = re.compile(
    r"(?:@(?:app|router)\.(?:post|put|patch|delete)\s*\("
    r"|\b(?:app|router)\.(?:post|put|patch|delete)\s*\("
    r"|export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b)"
)
IDEMPOTENCY_RE = re.compile(r"Idempotency-Key|idempotency_key", re.IGNORECASE)

TEST_FILE_RE = re.compile(
    r"(?:\.(?i:test|spec|unit|int|e2e)\.[a-z0-9]+$"
    r"|^test_.*\.py$|_test\.py$|Test\.php$"
    r"|\.(?i:feature|bats)$)"
)
FIXED_WAIT_RE = re.compile(
    r"\b(?:waitFor" r"Timeout|time\." r"sleep)\s*\("
    r"|\bcy\." r"wait\s*\(\s*\d+"
)
DOCKER_FROM_LINE_RE = re.compile(r"^\s*FROM\s+(.+)$", re.IGNORECASE)
DOCKER_FROM_LATEST_RE = re.compile(r":latest(?:@|$)", re.IGNORECASE)
DOCKER_USER_LINE_RE = re.compile(r"^\s*USER\s+(\S+)", re.IGNORECASE)
DOCKER_ROOT_VALUE_RE = re.compile(r"^(?:root|0(?::0)?)$", re.IGNORECASE)

STAGE_NAMES = {
    "VIBE-SEC-001": "Stage 1: Secret Quarantine",
    "VIBE-RLS-002": "Stage 2: PostgreSQL RLS & RBAC",
    "VIBE-TYPE-003": "Stage 3: Strict Typing & Borders",
    "VIBE-ARCH-004": "Stage 3: Modularization (CC <= 5)",
    "VIBE-QA-005": "Stage 4: Rule Zero & Test Net",
}
RULE_SEVERITY = {
    "VIBE-SEC-001": "CRITICAL",
    "VIBE-RLS-002": "CRITICAL",
    "VIBE-TYPE-003": "HIGH",
    "VIBE-ARCH-004": "MEDIUM",
    "VIBE-QA-005": "HIGH",
}


@dataclass(frozen=True)
class AuditFinding:
    """Representa un hallazgo individual redactado del protocolo."""

    rule_id: str
    stage: str
    severity: str
    file: str
    line: int
    message: str


@dataclass
class ScanContext:
    """Estado mutable acotado para mantener aridad <= 4 en los escaneres."""

    target_dir: Path
    env_ignored: bool
    max_lines: int
    gitignore_patterns: frozenset[str] = field(default_factory=frozenset)
    findings: list[AuditFinding] = field(default_factory=list)
    env_keys: set[str] = field(default_factory=set)
    has_any_test: bool = False


def redact_secrets(text: str) -> str:
    """Redacta valores sensibles, tokens Bearer y literales de llaves API."""
    cleaned = REDACT_LITERAL_RE.sub(REDACTION_MARKER, text)
    cleaned = REDACT_BEARER_RE.sub(rf"\1 {REDACTION_MARKER}", cleaned)
    return REDACT_ASSIGN_RE.sub(rf"\1{REDACTION_MARKER}", cleaned)


def is_test_path(rel_path: Path) -> bool:
    """Determina si una ruta corresponde a pruebas automatizadas."""
    if any(part in TEST_DIR_NAMES for part in rel_path.parts[:-1]):
        return True
    return bool(TEST_FILE_RE.search(rel_path.name))


def find_line(
    lines: Sequence[str],
    pattern: re.Pattern[str],
    default: int = 1,
) -> int:
    """Retorna numero de linea 1-indexed de la primera coincidencia."""
    for idx, line in enumerate(lines, start=1):
        if pattern.search(line):
            return idx
    return default


def add_finding(
    findings: list[AuditFinding],
    rule_id: str,
    location: tuple[str, int],
    message: str,
) -> None:
    """Registra un hallazgo redactado con severidad y etapa canonicas."""
    rel, line = location
    findings.append(
        AuditFinding(
            rule_id=rule_id,
            stage=STAGE_NAMES[rule_id],
            severity=RULE_SEVERITY[rule_id],
            file=rel,
            line=line,
            message=redact_secrets(message),
        )
    )


def is_env_file_ignored(
    rel: str,
    fname: str,
    patterns: frozenset[str],
) -> bool:
    """Determina si un archivo .env* especifico esta cubierto por .gitignore."""
    if not patterns or f"!{fname}" in patterns or f"!{rel}" in patterns:
        return False
    if ".env*" in patterns or fname in patterns or rel in patterns:
        return True
    if fname == ".env":
        return "*.env" in patterns
    return ".env.*" in patterns


def scan_env_file(rel: str, lines: Sequence[str], ctx: ScanContext) -> None:
    """Audita variables en archivos .env y recolecta nombres para plantilla."""
    file_ignored = ctx.env_ignored or is_env_file_ignored(
        rel, Path(rel).name, ctx.gitignore_patterns
    )
    for idx, line in enumerate(lines, start=1):
        match = ENV_ASSIGN_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip().strip("\"'")
        ctx.env_keys.add(key)
        is_placeholder = not value or bool(PLACEHOLDER_VAL_RE.search(value))
        if CLIENT_SECRET_VAR_RE.match(key):
            add_finding(
                ctx.findings,
                "VIBE-SEC-001",
                (rel, idx),
                f"Variable cliente privilegiada: {key}={REDACTION_MARKER}",
            )
        elif (
            not file_ignored
            and SENSITIVE_ENV_KEY_RE.search(key)
            and not is_placeholder
        ):
            add_finding(
                ctx.findings,
                "VIBE-SEC-001",
                (rel, idx),
                f"Secreto en .env sin .gitignore: {key}={REDACTION_MARKER}",
            )


def scan_source_secrets(
    rel: str,
    lines: Sequence[str],
    findings: list[AuditFinding],
) -> None:
    """Detecta literales de API keys y variables privilegiadas expuestas en codigo."""
    for idx, line in enumerate(lines, start=1):
        client_match = CLIENT_SECRET_VAR_RE.search(line)
        if client_match:
            add_finding(
                findings,
                "VIBE-SEC-001",
                (rel, idx),
                f"Credencial privilegiada en cliente: {client_match.group(1)}",
            )
        if LITERAL_KEY_RE.search(line):
            add_finding(
                findings,
                "VIBE-SEC-001",
                (rel, idx),
                f"Literal de llave API detectado en codigo: {REDACTION_MARKER}",
            )


def strip_sql_comments(sql_text: str) -> str:
    """Elimina comentarios SQL preservando saltos de linea exactos."""
    without_block = SQL_BLOCK_COMMENT_RE.sub(
        lambda m: "\n" * m.group(0).count("\n"),
        sql_text,
    )
    return SQL_LINE_COMMENT_RE.sub("", without_block)


def _normalize_sql_table(raw_name: str) -> str:
    compact = re.sub(r"\s+", "", raw_name).replace('"', "").lower()
    if compact.startswith("public."):
        return compact[len("public.") :]
    return compact


def _collect_sql_rls_tables(cleaned: str) -> tuple[set[str], set[str]]:
    enabled: set[str] = set()
    forced: set[str] = set()
    for match in SQL_ALTER_TABLE_RE.finditer(cleaned):
        table_name = _normalize_sql_table(match.group(1))
        clause = match.group(2)
        if SQL_ENABLE_RLS_RE.search(clause):
            enabled.add(table_name)
        if SQL_FORCE_RLS_RE.search(clause):
            forced.add(table_name)
    return enabled, forced


def scan_sql_file(rel: str, raw_text: str, findings: list[AuditFinding]) -> None:
    """Audita politicas RLS por cada tabla SQL y detecta BYPASSRLS."""
    cleaned = strip_sql_comments(raw_text)
    lines = cleaned.splitlines()
    if SQL_PERMISSIVE_RE.search(cleaned):
        add_finding(
            findings,
            "VIBE-RLS-002",
            (rel, find_line(lines, SQL_PERMISSIVE_RE)),
            "Politica SQL permisiva sin aislamiento; usar rls_hardening.sql",
        )
    if SQL_BYPASSRLS_RE.search(cleaned):
        add_finding(
            findings,
            "VIBE-RLS-002",
            (rel, find_line(lines, SQL_BYPASSRLS_RE)),
            "Uso inseguro de BYPASSRLS detectado en definicion SQL",
        )
    enabled, forced = _collect_sql_rls_tables(cleaned)
    for match in SQL_CREATE_TABLE_RE.finditer(cleaned):
        table_name = _normalize_sql_table(match.group(1))
        if table_name not in enabled or table_name not in forced:
            line_no = cleaned[: match.start()].count("\n") + 1
            add_finding(
                findings,
                "VIBE-RLS-002",
                (rel, line_no),
                f"CREATE TABLE '{table_name}' sin ENABLE + FORCE ROW LEVEL SECURITY",
            )


def _scan_non_test_code(
    rel_path: Path,
    text: str,
    max_lines: int,
    findings: list[AuditFinding],
) -> None:
    rel = rel_path.as_posix()
    lines = text.splitlines()
    is_client = rel_path.suffix in {".tsx", ".jsx", ".vue"} or "client" in rel.lower()
    if is_client and CLIENT_SERVICE_ROLE_RE.search(text):
        add_finding(
            findings,
            "VIBE-RLS-002",
            (rel, find_line(lines, CLIENT_SERVICE_ROLE_RE)),
            "Uso de service_role/supabaseAdmin en capa cliente",
        )
    if WEAK_TYPE_RE.search(text):
        add_finding(
            findings,
            "VIBE-TYPE-003",
            (rel, find_line(lines, WEAK_TYPE_RE)),
            "Escape de tipado estricto (:" " any / @ts" "-ignore / # type" ": ignore)",
        )
    if MUTATING_ROUTE_RE.search(text) and not IDEMPOTENCY_RE.search(text):
        add_finding(
            findings,
            "VIBE-TYPE-003",
            (rel, find_line(lines, MUTATING_ROUTE_RE)),
            "Endpoint mutador sin verificacion de cabecera Idempotency-Key",
        )
    if len(lines) > max_lines:
        add_finding(
            findings,
            "VIBE-ARCH-004",
            (rel, 1),
            f"Archivo monolitico ({len(lines)} > {max_lines} lineas); CC<=5",
        )


def scan_code_file(
    rel_path: Path,
    text: str,
    max_lines: int,
    findings: list[AuditFinding],
) -> None:
    """Audita codigo fuente para esperas fijas, tipado e idempotencia."""
    rel = rel_path.as_posix()
    lines = text.splitlines()
    if FIXED_WAIT_RE.search(text):
        add_finding(
            findings,
            "VIBE-QA-005",
            (rel, find_line(lines, FIXED_WAIT_RE)),
            "Espera fija detectada (waitFor" "Timeout/sleep); usar condicion real",
        )
    if not is_test_path(rel_path):
        _scan_non_test_code(rel_path, text, max_lines, findings)


def _parse_from_spec(line: str) -> tuple[str, str | None] | None:
    match = DOCKER_FROM_LINE_RE.match(line)
    if not match:
        return None
    tokens = [t for t in match.group(1).split() if not t.startswith("--")]
    if not tokens:
        return None
    alias = tokens[2] if len(tokens) >= 3 and tokens[1].lower() == "as" else None
    return tokens[0], alias


def _is_unpinned_image(image_ref: str, stage_aliases: set[str]) -> bool:
    lower = image_ref.lower()
    if lower == "scratch" or lower in stage_aliases or image_ref.startswith("$"):
        return False
    if DOCKER_FROM_LATEST_RE.search(lower):
        return True
    last_segment = image_ref.rsplit("/", maxsplit=1)[-1]
    return "@" not in image_ref and ":" not in last_segment


def _check_dockerfile_from_images(
    rel: str,
    lines: Sequence[str],
    findings: list[AuditFinding],
) -> None:
    stage_aliases: set[str] = set()
    for idx, line in enumerate(lines, start=1):
        spec = _parse_from_spec(line)
        if spec is None:
            continue
        image_ref, alias = spec
        if _is_unpinned_image(image_ref, stage_aliases):
            add_finding(
                findings,
                "VIBE-QA-005",
                (rel, idx),
                "Dockerfile usa etiqueta mutable :latest o imagen sin etiqueta",
            )
        if alias is not None:
            stage_aliases.add(alias.lower())


def _extract_last_stage(lines: Sequence[str]) -> tuple[int, list[tuple[int, str]]]:
    from_lines = [
        idx
        for idx, line in enumerate(lines, start=1)
        if DOCKER_FROM_LINE_RE.match(line)
    ]
    start_line = from_lines[-1] if from_lines else 1
    return start_line, list(enumerate(lines[start_line - 1 :], start=start_line))


def _scan_dockerfile(
    rel: str,
    lines: Sequence[str],
    findings: list[AuditFinding],
) -> None:
    _check_dockerfile_from_images(rel, lines, findings)
    stage_line, stage_lines = _extract_last_stage(lines)
    users = [
        (idx, match.group(1))
        for idx, line in stage_lines
        if (match := DOCKER_USER_LINE_RE.match(line)) is not None
    ]
    if not users or DOCKER_ROOT_VALUE_RE.match(users[-1][1]):
        target_line = users[-1][0] if users else stage_line
        add_finding(
            findings,
            "VIBE-QA-005",
            (rel, target_line),
            "Dockerfile ejecuta como root o carece de directiva USER no-root",
        )


def scan_tsconfig_or_docker(
    rel: str,
    fname: str,
    text: str,
    findings: list[AuditFinding],
) -> None:
    """Audita tsconfig*.json y Dockerfile*."""
    lines = text.splitlines()
    if fname.startswith("tsconfig") and fname.endswith(".json"):
        if TS_STRICT_FALSE_RE.search(text):
            add_finding(
                findings,
                "VIBE-TYPE-003",
                (rel, find_line(lines, TS_STRICT_FALSE_RE)),
                "tsconfig con strict=false; habilitar strict: true",
            )
        return
    if fname == "Dockerfile" or fname.startswith("Dockerfile."):
        _scan_dockerfile(rel, lines, findings)
