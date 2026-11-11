#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validador determinista de presupuesto cognitivo e invariantes documentales QA 11X."""

from __future__ import annotations

import re
import sys
from pathlib import Path

MAX_SKILL_MD_BYTES = 20_000
MAX_ACTIVE_TASK_LINES = 40

FORBIDDEN_DOC_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\b8 Resources\b|\b8 recursos\b|\b8 Recursos\b", "conteo obsoleto de 8 recursos MCP (debe ser 9)"),
    (r"1\.43\.0-jammy|karatelabs:1\.5\.0", "tag de imagen Docker obsoleto"),
    (r"\buv pip audit\b", "subcomando inexistente 'uv pip audit' (usar 'pip-audit')"),
    (r"refactoring-ui/\{topic\}[^\n]*\(`01` a `09`\)", "ejemplo numérico inválido en refactoring-ui/{topic}"),
)

DOC_TARGETS: tuple[str, ...] = (
    "README.md",
    "mcp-server/README.md",
    "TESTING.md",
    "SECURITY.md",
    "FAQ.md",
    "CONTRIBUTING.md",
    "AI_MASTER_PROMPT.md",
    "docs/docker-troubleshooting.md",
    "docs/ci-cd-pipelines.md",
    "docs/ai-integration.md",
    "docs/ARCHITECTURE_C4.md",
)


def _check_skill_size(root: Path) -> list[str]:
    skill_md = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
    if not skill_md.is_file():
        return []
    size = skill_md.stat().st_size
    if size < MAX_SKILL_MD_BYTES:
        return []
    return [f"{skill_md.relative_to(root)} excede el presupuesto cognitivo ({size} >= {MAX_SKILL_MD_BYTES} bytes)."]


def _check_scratchpad_lines(root: Path, rel: str) -> list[str]:
    candidate = root / rel
    if not candidate.is_file():
        return []
    count = len(candidate.read_text(encoding="utf-8").splitlines())
    if count <= MAX_ACTIVE_TASK_LINES:
        return []
    return [f"{rel} excede el límite compacto ({count} > {MAX_ACTIVE_TASK_LINES} líneas)."]


def check_cognitive_budgets(root: Path) -> list[str]:
    """Verifica SKILL.md < 20 KB y ACTIVE_TASK(.example) <= 40 líneas."""
    return [
        *_check_skill_size(root),
        *_check_scratchpad_lines(root, ".agents/ACTIVE_TASK.md.example"),
        *_check_scratchpad_lines(root, ".agents/ACTIVE_TASK.md"),
    ]


def check_security_section_numbering(root: Path) -> list[str]:
    """Detecta numeración duplicada '### 4.X.' en SECURITY.md."""
    sec_md = root / "SECURITY.md"
    if not sec_md.is_file():
        return []
    seen: set[str] = set()
    duplicates: list[str] = []
    for line in sec_md.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^###\s+(4\.\d+)\.", line)
        if match:
            sec_id = match.group(1)
            if sec_id in seen:
                duplicates.append(f"SECURITY.md contiene sección duplicada '### {sec_id}.'")
            seen.add(sec_id)
    return duplicates


FILE_SPECIFIC_PATTERNS: tuple[tuple[str, str, str], ...] = (
    (
        "docs/ai-integration.md",
        r"subprocess\.run\([^\n]*shell\s*=\s*" + "True",
        "docs/ai-integration.md: prohibido activar modo shell booleano en ejemplos de subprocess.run.",
    ),
    (
        "docs/docker-troubleshooting.md",
        r"(?m)^\s*user:\s*root\b",
        "docs/docker-troubleshooting.md: prohibido recomendar directiva YAML 'user: root'.",
    ),
)


def _scan_global_patterns(rel_path: str, content: str) -> list[str]:
    return [
        f"{rel_path}: detectado {reason}."
        for pattern, reason in FORBIDDEN_DOC_PATTERNS
        if re.search(pattern, content)
    ]


def _scan_specific_patterns(rel_path: str, content: str) -> list[str]:
    return [
        msg
        for target, pat, msg in FILE_SPECIFIC_PATTERNS
        if rel_path == target and re.search(pat, content)
    ]


def _scan_file_patterns(rel_path: str, content: str) -> list[str]:
    return [*_scan_global_patterns(rel_path, content), *_scan_specific_patterns(rel_path, content)]


def check_active_docs(root: Path) -> list[str]:
    """Valida invariantes y ausencia de derivas en documentos activos."""
    errors: list[str] = []
    for rel_path in DOC_TARGETS:
        full_path = root / rel_path
        if full_path.is_file():
            errors.extend(_scan_file_patterns(rel_path, full_path.read_text(encoding="utf-8")))
    return errors


def validate_repository_docs(root: Path) -> list[str]:
    """Ejecuta todas las validaciones documentales sobre el directorio raíz."""
    return [
        *check_cognitive_budgets(root),
        *check_security_section_numbering(root),
        *check_active_docs(root),
    ]


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    target_root = Path(args[0]).resolve() if args else Path.cwd().resolve()
    errors = validate_repository_docs(target_root)
    if errors:
        print("❌ [Docs Invariants] Se detectaron violaciones documentales o de presupuesto cognitivo:")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("✔ [Docs Invariants] Presupuesto cognitivo (<20KB / <=40 líneas) e invariantes documentales verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
