#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validador determinista de presupuesto cognitivo e invariantes documentales QA 11X."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

MAX_SKILL_MD_BYTES = 20_000
MAX_ARCHITECT_SKILL_BYTES = 12_288
MAX_ACTIVE_TASK_LINES = 40

FORBIDDEN_DOC_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\b8 Resources\b|\b8 recursos\b|\b8 Recursos\b", "conteo obsoleto de 8 recursos MCP (debe ser 12)"),
    (r"1\.43\.0-jammy|karatelabs:1\.5\.0", "tag de imagen Docker obsoleto"),
    (r"\buv pip audit\b", "subcomando inexistente 'uv pip audit' (usar 'pip-audit')"),
    (r"refactoring-ui/\{topic\}[^\n]*\(`01` a `09`\)", "ejemplo numérico inválido en refactoring-ui/{topic}"),
    (r"--profile\s+graphify", "flag obsoleto '--profile graphify' (usar './scripts/actualizar-grafos-graphify.sh')"),
)

BILINGUAL_DOC_PAIRS: tuple[tuple[str, str], ...] = (
    ("README.md", "README.es.md"),
    ("RESOURCES.md", "RESOURCES.es.md"),
    ("TESTING.md", "TESTING.es.md"),
    ("SECURITY.md", "SECURITY.es.md"),
    ("CONTRIBUTING.md", "CONTRIBUTING.es.md"),
    ("FAQ.md", "FAQ.es.md"),
    ("AI_MASTER_PROMPT.md", "AI_MASTER_PROMPT.es.md"),
    ("ROADMAP.md", "ROADMAP.es.md"),
    ("CHANGELOG.md", "CHANGELOG.es.md"),
    ("mcp-server/README.md", "mcp-server/README.es.md"),
    ("mcp-server/CHANGELOG.md", "mcp-server/CHANGELOG.es.md"),
    ("mcp-server/example/README.md", "mcp-server/example/README.es.md"),
    ("docs/agent-setup.md", "docs/agent-setup.es.md"),
    ("docs/specs/README.md", "docs/specs/README.es.md"),
    ("docs/01_ARQUITECTURA_PIRAMIDE_11X.md", "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md"),
    ("docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md", "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md"),
    ("docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md", "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md"),
    ("docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md", "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md"),
    ("docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md", "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md"),
    ("docs/ai-integration.md", "docs/ai-integration.es.md"),
    ("docs/ci-cd-pipelines.md", "docs/ci-cd-pipelines.es.md"),
    ("docs/docker-troubleshooting.md", "docs/docker-troubleshooting.es.md"),
    ("docs/qa-philosophy.md", "docs/qa-philosophy.es.md"),
    ("docs/ARCHITECTURE_C4.md", "docs/ARCHITECTURE_C4.es.md"),
    ("architecture/README.md", "architecture/README.es.md"),
    ("python/README.md", "python/README.es.md"),
    ("fastapi/README.md", "fastapi/README.es.md"),
    ("node-backend/README.md", "node-backend/README.es.md"),
    ("vue3/README.md", "vue3/README.es.md"),
    ("react-frontend/README.md", "react-frontend/README.es.md"),
    ("php/README.md", "php/README.es.md"),
    ("bash-scripts/README.md", "bash-scripts/README.es.md"),
    ("mobile-appium/README.md", "mobile-appium/README.es.md"),
    ("ai-evals/README.md", "ai-evals/README.es.md"),
    ("vibe-rescue/README.md", "vibe-rescue/README.es.md"),
)

DOC_TARGETS: tuple[str, ...] = (
    "README.md",
    "README.es.md",
    "RESOURCES.md",
    "RESOURCES.es.md",
    ".agents/README.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
    "mcp-server/example/README.md",
    "mcp-server/example/README.es.md",
    "TESTING.md",
    "TESTING.es.md",
    "SECURITY.md",
    "SECURITY.es.md",
    "FAQ.md",
    "FAQ.es.md",
    "CONTRIBUTING.md",
    "CONTRIBUTING.es.md",
    "AI_MASTER_PROMPT.md",
    "AI_MASTER_PROMPT.es.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
    "docs/docker-troubleshooting.md",
    "docs/docker-troubleshooting.es.md",
    "docs/ci-cd-pipelines.md",
    "docs/ci-cd-pipelines.es.md",
    "docs/ai-integration.md",
    "docs/ai-integration.es.md",
    "docs/qa-philosophy.md",
    "docs/qa-philosophy.es.md",
    "docs/agent-setup.md",
    "docs/agent-setup.es.md",
    "docs/agent-setup.en.md",
    "docs/ARCHITECTURE_C4.md",
    "docs/ARCHITECTURE_C4.es.md",
    "docs/specs/README.md",
    "docs/specs/README.es.md",
    "catalogs/agenticskills-submission.md",
    "architecture/README.md",
    "architecture/README.es.md",
    "fastapi/README.md",
    "fastapi/README.es.md",
    "vue3/README.md",
    "vue3/README.es.md",
    "react-frontend/README.md",
    "react-frontend/README.es.md",
    "node-backend/README.md",
    "node-backend/README.es.md",
    "python/README.md",
    "python/README.es.md",
    "php/README.md",
    "php/README.es.md",
    "bash-scripts/README.md",
    "bash-scripts/README.es.md",
    "ai-evals/README.md",
    "ai-evals/README.es.md",
    "mobile-appium/README.md",
    "mobile-appium/README.es.md",
    "vibe-rescue/README.md",
    "vibe-rescue/README.es.md",
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
    "RESOURCES.es.md",
    "TESTING.md",
    "TESTING.es.md",
    "SECURITY.md",
    "SECURITY.es.md",
    "FAQ.md",
    "FAQ.es.md",
    "CONTRIBUTING.md",
    "CONTRIBUTING.es.md",
    "AI_MASTER_PROMPT.md",
    "AI_MASTER_PROMPT.es.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
    "docs/docker-troubleshooting.md",
    "docs/docker-troubleshooting.es.md",
    "docs/ci-cd-pipelines.md",
    "docs/ci-cd-pipelines.es.md",
    "docs/ai-integration.md",
    "docs/ai-integration.es.md",
    "docs/qa-philosophy.md",
    "docs/qa-philosophy.es.md",
    "docs/agent-setup.md",
    "docs/agent-setup.es.md",
    "docs/ARCHITECTURE_C4.md",
    "docs/ARCHITECTURE_C4.es.md",
    "docs/specs/README.md",
    "docs/specs/README.es.md",
    "llms.txt",
    "catalogs/agenticskills-submission.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
    "mcp-server/example/README.md",
    "mcp-server/example/README.es.md",
    "architecture/README.md",
    "architecture/README.es.md",
    "fastapi/README.md",
    "fastapi/README.es.md",
    "vue3/README.md",
    "vue3/README.es.md",
    "react-frontend/README.md",
    "react-frontend/README.es.md",
    "node-backend/README.md",
    "node-backend/README.es.md",
    "python/README.md",
    "python/README.es.md",
    "php/README.md",
    "php/README.es.md",
    "bash-scripts/README.md",
    "bash-scripts/README.es.md",
    "ai-evals/README.md",
    "ai-evals/README.es.md",
    "mobile-appium/README.md",
    "mobile-appium/README.es.md",
    "vibe-rescue/README.md",
    "vibe-rescue/README.es.md",
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

HUMAN_CORE_MANUALS_ES: tuple[str, ...] = (
    "docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
    "SECURITY.es.md",
)


def _check_skill_size(root: Path) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    errors: list[str] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        limit = (
            MAX_ARCHITECT_SKILL_BYTES
            if skill_md.parent.name == "qa-11x-architect"
            else MAX_SKILL_MD_BYTES
        )
        size = skill_md.stat().st_size
        if size >= limit:
            errors.append(
                f"{skill_md.relative_to(root)} excede el presupuesto cognitivo ({size} >= {limit} bytes)."
            )
    return errors


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


def _check_sec_numbering_file(root: Path, rel_path: str) -> list[str]:
    sec_md = root / rel_path
    if not sec_md.is_file():
        return []
    seen: set[str] = set()
    duplicates: list[str] = []
    for line in sec_md.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^###\s+(4\.\d+)\.", line)
        if match:
            sec_id = match.group(1)
            if sec_id in seen:
                duplicates.append(f"{rel_path} contiene sección duplicada '### {sec_id}.'")
            seen.add(sec_id)
    return duplicates


def check_security_section_numbering(root: Path) -> list[str]:
    """Detecta numeración duplicada '### 4.X.' en SECURITY.md y SECURITY.es.md."""
    return [
        *_check_sec_numbering_file(root, "SECURITY.md"),
        *_check_sec_numbering_file(root, "SECURITY.es.md"),
    ]


FILE_SPECIFIC_PATTERNS: tuple[tuple[str, str, str], ...] = (
    (
        "docs/ai-integration.md",
        r"subprocess\.run\([^\n]*shell\s*=\s*" + "True",
        "docs/ai-integration.md: prohibido activar modo shell booleano en ejemplos de subprocess.run.",
    ),
    (
        "docs/ai-integration.es.md",
        r"subprocess\.run\([^\n]*shell\s*=\s*" + "True",
        "docs/ai-integration.es.md: prohibido activar modo shell booleano en ejemplos de subprocess.run.",
    ),
    (
        "docs/docker-troubleshooting.md",
        r"(?m)^\s*user:\s*root\b",
        "docs/docker-troubleshooting.md: prohibido recomendar directiva YAML 'user: root'.",
    ),
    (
        "docs/docker-troubleshooting.es.md",
        r"(?m)^\s*user:\s*root\b",
        "docs/docker-troubleshooting.es.md: prohibido recomendar directiva YAML 'user: root'.",
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
    human_es_md = root / "docs" / "02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md"
    if not skill_md.is_file() or not human_md.is_file():
        return []
    s_decl, s_num = _parse_uat_counts(
        _extract_section_slice(skill_md.read_text(encoding="utf-8"), "### 2.1."),
        r"\((\d+)\s+UAT Anti-Blindness Rules\)",
    )
    uat_hdr_re = r"\*\*(\d+)\s+(?:mandatory test design rules|reglas obligatorias de diseño de pruebas)\*\*"
    h_decl, h_num = _parse_uat_counts(
        _extract_section_slice(human_md.read_text(encoding="utf-8"), "### 1.1."),
        uat_hdr_re,
    )
    errors: list[str] = []
    if not (s_decl and s_decl == s_num == h_decl == h_num):
        errors.append(
            f"Desfase Dual-Consumer en reglas Anti-Silo: SKILL.md §2.1 declara={s_decl}/ítems={s_num} vs docs/02 §1.1 declara={h_decl}/ítems={h_num}."
        )
    if human_es_md.is_file():
        es_decl, es_num = _parse_uat_counts(
            _extract_section_slice(human_es_md.read_text(encoding="utf-8"), "### 1.1."),
            uat_hdr_re,
        )
        if not (s_decl and s_decl == s_num == es_decl == es_num):
            errors.append(
                f"Desfase Dual-Consumer ES en reglas Anti-Silo: SKILL.md §2.1 declara={s_decl}/ítems={s_num} vs docs/02.es §1.1 declara={es_decl}/ítems={es_num}."
            )
    return errors


def _read_existing_manuals(root: Path, candidates: tuple[str, ...] = HUMAN_CORE_MANUALS) -> str:
    chunks = [
        (root / rel).read_text(encoding="utf-8")
        for rel in candidates
        if (root / rel).is_file()
    ]
    return "\n".join(chunks)


def _check_auditor_rules_in_human_docs(root: Path) -> list[str]:
    auditor_ts = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
    if not auditor_ts.is_file():
        return []
    manuals_blob = _read_existing_manuals(root, HUMAN_CORE_MANUALS)
    if not manuals_blob:
        return []
    rule_ids = sorted(set(re.findall(r"rule_id:\s*['\"]([A-Z0-9-]+)['\"]", auditor_ts.read_text(encoding="utf-8"))))
    errors = [
        f"Regla '{rid}' de security-auditor.ts no está documentada en los manuales humanos (docs/01..04 o SECURITY.md)."
        for rid in rule_ids
        if rid not in manuals_blob
    ]
    if (root / "SECURITY.es.md").is_file():
        manuals_es_blob = _read_existing_manuals(root, HUMAN_CORE_MANUALS_ES)
        if manuals_es_blob:
            errors.extend(
                f"Regla '{rid}' de security-auditor.ts no está documentada en los manuales espejo ES (docs/01..04.es.md o SECURITY.es.md)."
                for rid in rule_ids
                if rid not in manuals_es_blob
            )
    return errors


def check_dual_consumer_parity(root: Path) -> list[str]:
    """Verifica paridad 1:1 entre capa IA (SKILL.md / MCP) y manuales humanos EN/ES."""
    return [*_check_uat_rules_parity(root), *_check_auditor_rules_in_human_docs(root)]


def _token_present(content: str, token: str) -> bool:
    if token == "**English**":
        return "**English**" in content or "**English (Canonical)**" in content
    if token == "**Español**":
        return "**Español**" in content or "**Español (Espejo 1:1)**" in content
    return token in content


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
        if not _token_present(content, token)
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
    """Valida existencia y enlace cruzado entre documentos bilingües clave."""
    if not any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS):
        return []
    errors = [
        *_check_readme_cross_link(
            root / "README.md", "README.md", ("README.es.md", "**English**")
        ),
        *_check_readme_cross_link(
            root / "README.es.md", "README.es.md", ("README.md", "**Español**")
        ),
    ]
    if (root / "mcp-server" / "README.md").is_file() or (root / "mcp-server" / "README.es.md").is_file():
        errors.extend([
            *_check_readme_cross_link(
                root / "mcp-server" / "README.md", "mcp-server/README.md", ("README.es.md", "**English**")
            ),
            *_check_readme_cross_link(
                root / "mcp-server" / "README.es.md", "mcp-server/README.es.md", ("README.md", "**Español**")
            ),
        ])
    if (root / "docs" / "agent-setup.es.md").is_file():
        errors.extend([
            *_check_readme_cross_link(
                root / "docs" / "agent-setup.md", "docs/agent-setup.md", ("agent-setup.es.md", "**English**")
            ),
            *_check_readme_cross_link(
                root / "docs" / "agent-setup.es.md", "docs/agent-setup.es.md", ("agent-setup.md", "**Español**")
            ),
        ])
    elif (root / "docs" / "agent-setup.en.md").is_file() or (root / "docs" / "agent-setup.md").is_file():
        errors.extend([
            *_check_readme_cross_link(
                root / "docs" / "agent-setup.en.md", "docs/agent-setup.en.md", ("agent-setup.md", "**English**")
            ),
            *_check_readme_cross_link(
                root / "docs" / "agent-setup.md", "docs/agent-setup.md", ("agent-setup.en.md", "**Español**")
            ),
        ])
    return errors


_NORMATIVE_ID_RE = re.compile(
    r"\b(?:SEC-\d+|QA-(?:\d+|[A-Z]+-[A-Z0-9-]+)|VIBE-[A-Z]+-\d+|UI-11X-\d+)\b"
)
_BLUEPRINT_URI_RE = re.compile(r"blueprint://[a-z0-9_/-]+")


def _count_h2_h3(content: str) -> tuple[int, int]:
    stripped = _HTML_COMMENT_RE.sub("", _FENCED_CODE_RE.sub("", content))
    h2 = len(re.findall(r"(?m)^##\s+", stripped))
    h3 = len(re.findall(r"(?m)^###\s+", stripped))
    return h2, h3


def _extract_normative_ids(content: str) -> set[str]:
    return set(_NORMATIVE_ID_RE.findall(content)) | set(_BLUEPRINT_URI_RE.findall(content))


def _check_single_bilingual_pair(root: Path, en_rel: str, es_rel: str) -> list[str]:
    en_path = root / en_rel
    es_path = root / es_rel
    errors: list[str] = []
    if not en_path.is_file() or en_path.stat().st_size == 0:
        errors.append(f"Par bilingüe incompleto/vacío: falta o está vacío '{en_rel}'.")
    if not es_path.is_file() or es_path.stat().st_size == 0:
        errors.append(f"Par bilingüe incompleto/vacío: falta o está vacío '{es_rel}'.")
    if errors:
        return errors
    en_text = en_path.read_text(encoding="utf-8")
    es_text = es_path.read_text(encoding="utf-8")
    en_head = "\n".join(en_text.splitlines()[:10])
    es_head = "\n".join(es_text.splitlines()[:10])
    if Path(es_rel).name not in en_head:
        errors.append(
            f"{en_rel}: falta banner recíproco a '{Path(es_rel).name}' en las primeras 10 líneas."
        )
    if Path(en_rel).name not in es_head:
        errors.append(
            f"{es_rel}: falta banner recíproco a '{Path(en_rel).name}' en las primeras 10 líneas."
        )
    h2_en, h3_en = _count_h2_h3(en_text)
    h2_es, h3_es = _count_h2_h3(es_text)
    if (h2_en, h3_en) != (h2_es, h3_es):
        errors.append(
            f"Desfase estructural en par {en_rel} ↔ {es_rel}: "
            f"EN(H2={h2_en},H3={h3_en}) vs ES(H2={h2_es},H3={h3_es})."
        )
    ids_en = _extract_normative_ids(en_text)
    ids_es = _extract_normative_ids(es_text)
    if ids_en != ids_es:
        only_en = sorted(ids_en - ids_es)[:3]
        only_es = sorted(ids_es - ids_en)[:3]
        errors.append(
            f"Desfase de IDs normativos en {en_rel} ↔ {es_rel}: "
            f"solo EN={only_en}, solo ES={only_es}."
        )
    return errors


def check_bilingual_pair_parity(root: Path) -> list[str]:
    """Valida existencia mutua, banner L1-10, estructura H2/H3 e IDs normativos en pares EN/ES."""
    require_all = (root / "RESOURCES.es.md").is_file()
    errors: list[str] = []
    for en_rel, es_rel in BILINGUAL_DOC_PAIRS:
        if not require_all and not (root / es_rel).is_file():
            continue
        errors.extend(_check_single_bilingual_pair(root, en_rel, es_rel))
    return errors


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


REQUIRED_CATALOG_FILES: tuple[str, ...] = (
    "llms.txt",
    "catalogs/qaskills-pack.json",
    "catalogs/skillsllm-manifest.json",
    "catalogs/agenticskills-submission.md",
)
EXPECTED_SKILLS_COUNT = 10
EXPECTED_TOOLS_COUNT = 18
EXPECTED_RESOURCES_COUNT = 12
EXPECTED_BLUEPRINTS_COUNT = 10


def _reject_dup_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, val in pairs:
        if key in obj:
            raise ValueError(f"clave JSON duplicada {key!r}")
        obj[key] = val
    return obj


def _load_json_strict(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_reject_dup_json_keys)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return None, str(exc)
    if not isinstance(data, dict):
        return None, "el documento JSON debe tener un objeto en la raíz"
    return data, None


def _expected_pkg_version(root: Path) -> str | None:
    pkg_path = root / "mcp-server" / "package.json"
    if not pkg_path.is_file():
        return None
    data, _ = _load_json_strict(pkg_path)
    if isinstance(data, dict) and isinstance(data.get("version"), str):
        return str(data["version"]).strip()
    return None


def _extract_repo_skill_ids(root: Path) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    return sorted(p.parent.name for p in skills_dir.glob("*/SKILL.md") if p.is_file())


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _check_skill_entries(
    root: Path,
    rel_file: str,
    skills_raw: Any,
    repo_skills: list[str],
    verify_digest: bool,
) -> list[str]:
    if not isinstance(skills_raw, list) or len(skills_raw) != EXPECTED_SKILLS_COUNT:
        count = len(skills_raw) if isinstance(skills_raw, list) else "invalid"
        return [f"{rel_file}: se esperan {EXPECTED_SKILLS_COUNT} skills reales (encontradas={count})."]
    errors: list[str] = []
    seen_ids: list[str] = []
    for entry in skills_raw:
        if not isinstance(entry, dict):
            errors.append(f"{rel_file}: entrada de skill inválida.")
            continue
        sid = str(entry.get("id", ""))
        spath = str(entry.get("path", ""))
        seen_ids.append(sid)
        full = root / spath
        if not spath or not full.is_file():
            errors.append(f"{rel_file}: ruta SKILL.md inexistente '{spath}'.")
        elif verify_digest and (
            entry.get("sha256") != _sha256_file(full)
            or entry.get("size_bytes") != full.stat().st_size
        ):
            errors.append(f"{rel_file}: desfase SHA-256/size_bytes en '{spath}'.")
    if repo_skills and sorted(seen_ids) != repo_skills:
        errors.append(f"{rel_file}: desfase entre skills declaradas y .agents/skills/.")
    return errors


def _validate_qaskills_pack(root: Path, expected_ver: str | None, repo_skills: list[str]) -> list[str]:
    rel = "catalogs/qaskills-pack.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."]
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    errors.extend(_check_skill_entries(root, rel, data.get("skills"), repo_skills, verify_digest=False))
    return errors


def _validate_skillsllm_manifest(
    root: Path, expected_ver: str | None, repo_skills: list[str]
) -> tuple[list[str], list[str], list[str]]:
    rel = "catalogs/skillsllm-manifest.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."], [], []
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    caps = data.get("mcp_capabilities")
    tools = caps.get("tools") if isinstance(caps, dict) else None
    resources = caps.get("resources") if isinstance(caps, dict) else None
    if not isinstance(caps, dict) or caps.get("tools_count") != EXPECTED_TOOLS_COUNT or not isinstance(tools, list) or len(tools) != EXPECTED_TOOLS_COUNT:
        errors.append(f"{rel}: mcp_capabilities.tools debe listar exactamente {EXPECTED_TOOLS_COUNT} tools.")
    if not isinstance(caps, dict) or caps.get("resources_count") != EXPECTED_RESOURCES_COUNT or not isinstance(resources, list) or len(resources) != EXPECTED_RESOURCES_COUNT:
        errors.append(f"{rel}: mcp_capabilities.resources debe listar exactamente {EXPECTED_RESOURCES_COUNT} resources.")
    bps = data.get("blueprints")
    if not isinstance(bps, list) or len(bps) != EXPECTED_BLUEPRINTS_COUNT:
        errors.append(f"{rel}: se esperan {EXPECTED_BLUEPRINTS_COUNT} blueprints raíz.")
    errors.extend(_check_skill_entries(root, rel, data.get("skills"), repo_skills, verify_digest=True))
    tool_list = [str(t) for t in tools] if isinstance(tools, list) else []
    res_list = [str(r) for r in resources] if isinstance(resources, list) else []
    return errors, tool_list, res_list


def _validate_geo_surface(
    path: Path, label: str, tokens: list[str], kind: str
) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [tok for tok in tokens if tok not in text]
    if not missing:
        return []
    return [f"{label}: faltan {kind} ({', '.join(missing[:3])})."]


def check_global_catalogs_and_geo(root: Path) -> list[str]:
    """Valida llms.txt y catálogos globales (10 skills, 18 tools, 12 resources, SHA-256)."""
    if not (root / "llms.txt").is_file() and not (root / "catalogs").is_dir():
        return []
    missing = [rel for rel in REQUIRED_CATALOG_FILES if not (root / rel).is_file()]
    if missing:
        return [f"Falta artefacto GEO/catálogo obligatorio: {rel}." for rel in missing]
    expected_ver = _expected_pkg_version(root)
    repo_skills = _extract_repo_skill_ids(root)
    errors = _validate_qaskills_pack(root, expected_ver, repo_skills)
    s_errors, tools, resources = _validate_skillsllm_manifest(root, expected_ver, repo_skills)
    errors.extend(s_errors)
    skill_tokens = repo_skills or [
        "qa-11x-architect", "qa-11x-devsecops-hardener", "qa-11x-systematic-debugging",
        "qa-11x-screenplay-builder", "qa-11x-llm-evaluator", "qa-11x-vibe-rescue",
        "qa-11x-docker-certifier", "docker-trivy-keydb-hardening",
        "graphify-ast-navigator", "refactoring-ui",
    ]
    for rel in ("llms.txt", "catalogs/agenticskills-submission.md"):
        doc = root / rel
        errors.extend(_validate_geo_surface(doc, rel, skill_tokens, "skills"))
        errors.extend(_validate_geo_surface(doc, rel, tools, "tools MCP"))
        errors.extend(_validate_geo_surface(doc, rel, resources, "resources MCP"))
    return errors


def validate_repository_docs(root: Path) -> list[str]:
    """Ejecuta todas las validaciones documentales sobre el directorio raíz."""
    return [
        *check_cognitive_budgets(root),
        *check_security_section_numbering(root),
        *check_active_docs(root),
        *check_dual_consumer_parity(root),
        *check_bilingual_readme_parity(root),
        *check_bilingual_pair_parity(root),
        *check_v2_mcp_surface_counts(root),
        *check_internal_markdown_links(root),
        *check_global_catalogs_and_geo(root),
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
