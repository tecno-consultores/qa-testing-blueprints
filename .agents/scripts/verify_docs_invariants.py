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
    (r"\b8 Resources\b|\b8 recursos\b|\b8 Recursos\b", "conteo obsoleto de 8 recursos MCP (debe ser 12)"),
    (r"1\.43\.0-jammy|karatelabs:1\.5\.0", "tag de imagen Docker obsoleto"),
    (r"\buv pip audit\b", "subcomando inexistente 'uv pip audit' (usar 'pip-audit')"),
    (r"refactoring-ui/\{topic\}[^\n]*\(`01` a `09`\)", "ejemplo numérico inválido en refactoring-ui/{topic}"),
)

DOC_TARGETS: tuple[str, ...] = (
    "README.md",
    "README.es.md",
    "RESOURCES.md",
    ".agents/README.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
    "TESTING.md",
    "SECURITY.md",
    "FAQ.md",
    "CONTRIBUTING.md",
    "AI_MASTER_PROMPT.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
    "docs/docker-troubleshooting.md",
    "docs/ci-cd-pipelines.md",
    "docs/ai-integration.md",
    "docs/agent-setup.md",
    "docs/agent-setup.en.md",
    "docs/ARCHITECTURE_C4.md",
)

BILINGUAL_TRIGGER_DOCS: tuple[str, ...] = (
    "README.es.md",
    "RESOURCES.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
)

INTERNAL_LINK_AUDIT_TARGETS: tuple[str, ...] = (
    "README.md",
    "README.es.md",
    "RESOURCES.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
)

EXTERNAL_LINK_PREFIXES: tuple[str, ...] = (
    "http://",
    "https://",
    "mailto:",
    "blueprint://",
    "conversation://",
    "file://",
    "data:",
)

_FENCED_CODE_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_HTML_COMMENT_RE = re.compile(r"<!--[\s\S]*?-->", re.MULTILINE)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_MD_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)\n]+)\)")
_IMG_SRC_RE = re.compile(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\']', re.IGNORECASE)

HUMAN_CORE_MANUALS: tuple[str, ...] = (
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
    "SECURITY.md",
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


def _extract_section_slice(text: str, marker: str) -> str:
    idx = text.find(marker)
    if idx < 0:
        return ""
    sub = text[idx:]
    end_idx = sub.find("\n---")
    return sub[:end_idx] if end_idx > 0 else sub


def _parse_uat_counts(section: str, header_regex: str) -> tuple[int | None, int]:
    match = re.search(header_regex, section)
    declared = int(match.group(1)) if match else None
    numbered = len(re.findall(r"(?m)^\d+\.\s+\*\*", section))
    return declared, numbered


def _check_uat_rules_parity(root: Path) -> list[str]:
    skill_md = root / ".agents" / "skills" / "qa-11x-architect" / "SKILL.md"
    human_md = root / "docs" / "02_BUENAS_PRACTICAS_PROGRAMACION_11X.md"
    if not skill_md.is_file() or not human_md.is_file():
        return []
    s_decl, s_num = _parse_uat_counts(
        _extract_section_slice(skill_md.read_text(encoding="utf-8"), "### 2.1."),
        r"\((\d+)\s+UAT Anti-Blindness Rules\)",
    )
    h_decl, h_num = _parse_uat_counts(
        _extract_section_slice(human_md.read_text(encoding="utf-8"), "### 1.1."),
        r"\*\*(\d+)\s+reglas obligatorias de diseño de pruebas\*\*",
    )
    if s_decl and s_decl == s_num == h_decl == h_num:
        return []
    return [
        f"Desfase Dual-Consumer en reglas Anti-Silo: SKILL.md §2.1 declara={s_decl}/ítems={s_num} vs docs/02 §1.1 declara={h_decl}/ítems={h_num}."
    ]


def _read_existing_manuals(root: Path) -> str:
    chunks = [
        (root / rel).read_text(encoding="utf-8")
        for rel in HUMAN_CORE_MANUALS
        if (root / rel).is_file()
    ]
    return "\n".join(chunks)


def _check_auditor_rules_in_human_docs(root: Path) -> list[str]:
    auditor_ts = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
    if not auditor_ts.is_file():
        return []
    manuals_blob = _read_existing_manuals(root)
    if not manuals_blob:
        return []
    rule_ids = sorted(set(re.findall(r"rule_id:\s*['\"]([A-Z0-9-]+)['\"]", auditor_ts.read_text(encoding="utf-8"))))
    return [
        f"Regla '{rid}' de security-auditor.ts no está documentada en los manuales humanos (docs/01..04 o SECURITY.md)."
        for rid in rule_ids
        if rid not in manuals_blob
    ]


def check_dual_consumer_parity(root: Path) -> list[str]:
    """Verifica paridad 1:1 entre capa IA (SKILL.md / MCP) y manuales humanos en español."""
    return [*_check_uat_rules_parity(root), *_check_auditor_rules_in_human_docs(root)]


def _check_readme_cross_link(
    file_path: Path,
    file_label: str,
    required_tokens: tuple[str, ...],
) -> list[str]:
    if not file_path.is_file():
        return [f"Modelo bilingüe v2.0 incompleto: falta {file_label}."]
    content = file_path.read_text(encoding="utf-8")
    return [
        f"{file_label} debe incluir selector/enlace cruzado bilingüe '{token}'."
        for token in required_tokens
        if token not in content
    ]


_STALE_V1_MCP_COUNT_RE = re.compile(
    r"\b(?:12\s+(?:Tools|tools|herramientas)"
    r"|9\s+(?:Resources|resources|Recursos|recursos))\b"
)


def check_v2_mcp_surface_counts(root: Path) -> list[str]:
    """Rechaza conteos MCP v1 obsoletos (12 tools / 9 resources) en repos v2.0."""
    if not any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS):
        return []
    errors: list[str] = []
    for rel_path in DOC_TARGETS:
        doc_path = root / rel_path
        if not doc_path.is_file():
            continue
        content = doc_path.read_text(encoding="utf-8")
        if _STALE_V1_MCP_COUNT_RE.search(content):
            errors.append(
                f"{rel_path}: detectado conteo MCP v1 obsoleto "
                "(debe ser 18 Tools / 12 Resources)."
            )
    return errors


def check_bilingual_readme_parity(root: Path) -> list[str]:
    """Valida existencia y enlace cruzado entre README.md y README.es.md."""
    if not any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS):
        return []
    return [
        *_check_readme_cross_link(
            root / "README.md", "README.md", ("README.es.md", "**English**")
        ),
        *_check_readme_cross_link(
            root / "README.es.md", "README.es.md", ("README.md", "**Español**")
        ),
    ]


def _strip_code_and_comments(text: str) -> str:
    cleaned = _FENCED_CODE_RE.sub("", text)
    cleaned = _HTML_COMMENT_RE.sub("", cleaned)
    return _INLINE_CODE_RE.sub("", cleaned)


def _normalize_link_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and ">" in target:
        target = target[1 : target.index(">")].strip()
    elif " " in target:
        target = target.split(None, 1)[0].strip()
    return target.split("#", 1)[0].split("?", 1)[0].strip()


def _is_external_or_anchor(target: str) -> bool:
    if not target or target.startswith("#"):
        return True
    lowered = target.lower()
    return lowered.startswith(EXTERNAL_LINK_PREFIXES)


def _extract_internal_targets(content: str) -> list[str]:
    sanitized = _strip_code_and_comments(content)
    raw_targets = [*_MD_LINK_RE.findall(sanitized), *_IMG_SRC_RE.findall(sanitized)]
    targets: list[str] = []
    for raw in raw_targets:
        normalized = _normalize_link_target(raw)
        if not _is_external_or_anchor(normalized):
            targets.append(normalized)
    return targets


def _validate_doc_links(root: Path, rel_path: str) -> list[str]:
    doc_path = root / rel_path
    if not doc_path.is_file():
        return []
    root_resolved = root.resolve()
    errors: list[str] = []
    for target in _extract_internal_targets(doc_path.read_text(encoding="utf-8")):
        candidate = (doc_path.parent / target).resolve()
        if not candidate.is_relative_to(root_resolved):
            errors.append(
                f"{rel_path}: enlace interno fuera del repositorio ('{target}')."
            )
        elif not candidate.exists():
            errors.append(f"{rel_path}: enlace interno roto ('{target}').")
    return errors


def check_internal_markdown_links(root: Path) -> list[str]:
    """Audita enlaces Markdown e imágenes internas en portadas y docs v2.0."""
    errors: list[str] = []
    for rel_path in INTERNAL_LINK_AUDIT_TARGETS:
        errors.extend(_validate_doc_links(root, rel_path))
    return errors


def validate_repository_docs(root: Path) -> list[str]:
    """Ejecuta todas las validaciones documentales sobre el directorio raíz."""
    return [
        *check_cognitive_budgets(root),
        *check_security_section_numbering(root),
        *check_active_docs(root),
        *check_dual_consumer_parity(root),
        *check_bilingual_readme_parity(root),
        *check_v2_mcp_surface_counts(root),
        *check_internal_markdown_links(root),
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
