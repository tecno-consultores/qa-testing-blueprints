# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validadores de paridad Dual-Consumer, paridad bilingüe Spec 19 y enlaces."""

from __future__ import annotations

import re
from pathlib import Path

from _docs_invariants_config import (
    _CHANGELOG_REL_RE,
    _FENCED_CODE_RE,
    _HISTORICAL_SPEC_RE,
    _HTML_COMMENT_RE,
    _IGNORED_SCAN_DIRS,
    _IMG_SRC_RE,
    _INLINE_CODE_RE,
    _MD_LINK_RE,
    BILINGUAL_DOC_PAIRS,
    BILINGUAL_TRIGGER_DOCS,
    CANONICAL_GLOBAL_RULE_FILES,
    CANONICAL_GLOBAL_SKILL_DIRS,
    CANONICAL_MCP_TOOLS,
    EXTERNAL_LINK_PREFIXES,
    HUMAN_CORE_MANUALS,
    HUMAN_CORE_MANUALS_ES,
    INTERNAL_LINK_AUDIT_TARGETS,
    _extract_auditor_rule_ids,
    is_upstream_blueprints_repo,
)
from _docs_invariants_counts import _derive_ref_controls

_NORMATIVE_ID_RE = re.compile(
    r"\b(?:SEC-\d+|QA-(?:\d+|[A-Z]+-[A-Z0-9-]+)|VIBE-[A-Z]+-\d+|UI-11X-\d+)\b"
)
_BLUEPRINT_URI_RE = re.compile(r"blueprint://[a-z0-9_/-]+")
_MCP_TOOL_NAME_RE = re.compile(
    r"\b(" + "|".join(sorted(CANONICAL_MCP_TOOLS)) + r")\b"
)
_MD_LINK_OR_CODE_RE = re.compile(
    r"`[^`\n]+`|(?<!!)\[([^\]]*)\]\(([^)\n]+)\)"
)
_KNOWN_BILINGUAL_ES: frozenset[str] = frozenset(
    es_rel for _, es_rel in BILINGUAL_DOC_PAIRS
)


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
    uat_hdr_re = (
        r"\*\*(\d+)\s+"
        r"(?:mandatory test design rules|reglas obligatorias de diseño de pruebas)\*\*"
    )
    h_decl, h_num = _parse_uat_counts(
        _extract_section_slice(human_md.read_text(encoding="utf-8"), "### 1.1."),
        uat_hdr_re,
    )
    errors: list[str] = []
    if not (s_decl and s_decl == s_num == h_decl == h_num):
        errors.append(
            "Desfase Dual-Consumer en reglas Anti-Silo: "
            f"SKILL.md §2.1 declara={s_decl}/ítems={s_num} vs "
            f"docs/02 §1.1 declara={h_decl}/ítems={h_num}."
        )
    if human_es_md.is_file():
        es_decl, es_num = _parse_uat_counts(
            _extract_section_slice(
                human_es_md.read_text(encoding="utf-8"), "### 1.1."
            ),
            uat_hdr_re,
        )
        if not (s_decl and s_decl == s_num == es_decl == es_num):
            errors.append(
                "Desfase Dual-Consumer ES en reglas Anti-Silo: "
                f"SKILL.md §2.1 declara={s_decl}/ítems={s_num} vs "
                f"docs/02.es §1.1 declara={es_decl}/ítems={es_num}."
            )
    return errors


def _read_existing_manuals(
    root: Path, candidates: tuple[str, ...] = HUMAN_CORE_MANUALS
) -> str:
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
    rule_ids = _extract_auditor_rule_ids(auditor_ts)
    errors = [
        (
            f"Regla '{rid}' de security-auditor.ts no está documentada en los "
            "manuales humanos (docs/02..05 o SECURITY.md)."
        )
        for rid in rule_ids
        if rid not in manuals_blob
    ]
    if (root / "SECURITY.es.md").is_file():
        manuals_es_blob = _read_existing_manuals(root, HUMAN_CORE_MANUALS_ES)
        if manuals_es_blob:
            errors.extend(
                (
                    f"Regla '{rid}' de security-auditor.ts no está documentada en "
                    "los manuales espejo ES (docs/02..05.es.md o SECURITY.es.md)."
                )
                for rid in rule_ids
                if rid not in manuals_es_blob
            )
    return errors


def _check_ref_controls_matrix(root: Path, expected_ref: int) -> list[str]:
    ref_path = (
        root
        / ".agents"
        / "skills"
        / "qa-11x-architect"
        / "references"
        / "02-security-disa-owasp-22.md"
    )
    if not ref_path.is_file():
        return []
    text = ref_path.read_text(encoding="utf-8")
    hdr = re.search(r"Compliance Matrix:\s*(\d+)\s+Security Controls", text)
    if hdr and int(hdr.group(1)) != expected_ref:
        return [
            (
                f"02-security-disa-owasp-22.md declara {hdr.group(1)} controles "
                f"pero la matriz contiene {expected_ref}."
            )
        ]
    return []


def check_dual_consumer_parity(root: Path) -> list[str]:
    """Verifica paridad 1:1 entre capa IA (SKILL.md / MCP) y manuales EN/ES."""
    ref_count = _derive_ref_controls(root)
    return [
        *_check_uat_rules_parity(root),
        *_check_auditor_rules_in_human_docs(root),
        *_check_ref_controls_matrix(root, ref_count),
    ]


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


def _check_mcp_readme_links(root: Path) -> list[str]:
    en_doc = root / "mcp-server" / "README.md"
    es_doc = root / "mcp-server" / "README.es.md"
    if not en_doc.is_file() and not es_doc.is_file():
        return []
    return [
        *_check_readme_cross_link(
            en_doc, "mcp-server/README.md", ("README.es.md", "**English**")
        ),
        *_check_readme_cross_link(
            es_doc, "mcp-server/README.es.md", ("README.md", "**Español**")
        ),
    ]


def _check_agent_setup_links(root: Path) -> list[str]:
    docs_dir = root / "docs"
    errors: list[str] = []
    if (docs_dir / "agent-setup.en.md").exists():
        errors.append(
            "docs/agent-setup.en.md: archivo legado prohibido "
            "(usar docs/agent-setup.md y docs/agent-setup.es.md)."
        )
    if (docs_dir / "agent-setup.es.md").is_file() or (
        docs_dir / "agent-setup.md"
    ).is_file():
        errors.extend([
            *_check_readme_cross_link(
                docs_dir / "agent-setup.md",
                "docs/agent-setup.md",
                ("agent-setup.es.md", "**English**"),
            ),
            *_check_readme_cross_link(
                docs_dir / "agent-setup.es.md",
                "docs/agent-setup.es.md",
                ("agent-setup.md", "**Español**"),
            ),
        ])
    return errors


def check_bilingual_readme_parity(root: Path) -> list[str]:
    """Valida existencia y enlace cruzado entre documentos bilingües clave."""
    if not any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS):
        return []
    return [
        *_check_readme_cross_link(
            root / "README.md", "README.md", ("README.es.md", "**English**")
        ),
        *_check_readme_cross_link(
            root / "README.es.md", "README.es.md", ("README.md", "**Español**")
        ),
        *_check_mcp_readme_links(root),
        *_check_agent_setup_links(root),
    ]


def _count_h2_h3(content: str) -> tuple[int, int]:
    stripped = _HTML_COMMENT_RE.sub("", _FENCED_CODE_RE.sub("", content))
    h2 = len(re.findall(r"(?m)^##\s+", stripped))
    h3 = len(re.findall(r"(?m)^###\s+", stripped))
    return h2, h3


def _extract_normative_ids(content: str) -> set[str]:
    return (
        set(_NORMATIVE_ID_RE.findall(content))
        | set(_BLUEPRINT_URI_RE.findall(content))
        | set(_MCP_TOOL_NAME_RE.findall(content))
    )


def _has_spec19_en_banner(en_head: str, es_name: str) -> bool:
    has_marker = any(tok in en_head for tok in ("🌐", "Language", "Idioma"))
    has_es_tok = "Español" in en_head or "🇪🇸" in en_head
    return (
        es_name in en_head
        and has_marker
        and "English" in en_head
        and has_es_tok
    )


def _has_spec19_es_banner(es_head: str, en_name: str) -> bool:
    has_marker = any(tok in es_head for tok in ("🌐", "Idioma", "Language"))
    return (
        en_name in es_head
        and has_marker
        and "English" in es_head
        and "Español" in es_head
    )


def _check_pair_banners(
    en_rel: str, es_rel: str, en_text: str, es_text: str
) -> list[str]:
    en_head = "\n".join(en_text.splitlines()[:10])
    es_head = "\n".join(es_text.splitlines()[:10])
    errors: list[str] = []
    if not _has_spec19_en_banner(en_head, Path(es_rel).name):
        errors.append(
            f"{en_rel}: falta banner recíproco a '{Path(es_rel).name}' "
            "en las primeras 10 líneas."
        )
    if not _has_spec19_es_banner(es_head, Path(en_rel).name):
        errors.append(
            f"{es_rel}: falta banner recíproco a '{Path(en_rel).name}' "
            "en las primeras 10 líneas."
        )
    return errors


def _keep_newlines(match: re.Match[str]) -> str:
    return "\n" * match.group(0).count("\n")


def _mask_code_preserve_lines(text: str) -> str:
    cleaned = _FENCED_CODE_RE.sub(_keep_newlines, text)
    return _HTML_COMMENT_RE.sub(_keep_newlines, cleaned)


def _is_banner_switch_line(line: str) -> bool:
    has_marker = any(
        tok in line for tok in ("🌐", "Idioma", "Language", "🇺🇸", "🇬🇧")
    )
    return has_marker and ("English" in line or "Español" in line)


def _iter_md_links(text: str) -> list[tuple[int, str, str]]:
    masked = _mask_code_preserve_lines(text)
    items: list[tuple[int, str, str]] = []
    for line_no, line in enumerate(masked.splitlines(), 1):
        for match in _MD_LINK_OR_CODE_RE.finditer(line):
            raw_target = match.group(2)
            if raw_target:
                items.append((line_no, line, raw_target))
    return items


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
    return target.lower().startswith(EXTERNAL_LINK_PREFIXES)


def _resolve_non_es_md_candidate(
    root_resolved: Path, es_path: Path, raw_target: str
) -> tuple[str, Path] | None:
    target = _normalize_link_target(raw_target)
    if (
        _is_external_or_anchor(target)
        or not target.endswith(".md")
        or target.endswith(".es.md")
    ):
        return None
    candidate = (es_path.parent / target).resolve()
    if not candidate.is_relative_to(root_resolved):
        return None
    return target, candidate


def _resolve_es_md_candidate(
    root_resolved: Path, en_path: Path, raw_target: str
) -> tuple[str, Path] | None:
    target = _normalize_link_target(raw_target)
    if _is_external_or_anchor(target) or not target.endswith(".es.md"):
        return None
    candidate = (en_path.parent / target).resolve()
    if not candidate.is_relative_to(root_resolved):
        return None
    return target, candidate


def _check_single_es_link(
    root_resolved: Path,
    es_path: Path,
    en_resolved: Path,
    item: tuple[int, str, str],
) -> str | None:
    line_no, line, raw_target = item
    resolved = _resolve_non_es_md_candidate(root_resolved, es_path, raw_target)
    if resolved is None:
        return None
    target, candidate = resolved
    if line_no <= 10 and candidate == en_resolved and _is_banner_switch_line(line):
        return None
    sibling_es = candidate.with_name(f"{candidate.stem}.es.md")
    if not sibling_es.is_file():
        return None
    es_rel = es_path.relative_to(root_resolved).as_posix()
    return (
        f"{es_rel}:{line_no}: enlace ES→EN '{target}' "
        f"debe apuntar a '{sibling_es.name}'."
    )


_EXPLICIT_MIRROR_HINT_RE = re.compile(
    r"\b(?:Spanish|Español|espejo|mirror)\b", re.IGNORECASE
)


def _check_single_en_link(
    root_resolved: Path,
    en_path: Path,
    es_resolved: Path,
    item: tuple[int, str, str],
) -> str | None:
    line_no, line, raw_target = item
    resolved = _resolve_es_md_candidate(root_resolved, en_path, raw_target)
    if resolved is None:
        return None
    target, candidate = resolved
    if candidate == es_resolved and _is_banner_switch_line(line):
        return None
    sibling_en = candidate.with_name(f"{candidate.name[:-6]}.md")
    if not sibling_en.is_file():
        return None
    if sibling_en.name in line or _EXPLICIT_MIRROR_HINT_RE.search(line):
        return None
    en_rel = en_path.relative_to(root_resolved).as_posix()
    return (
        f"{en_rel}:{line_no}: enlace EN→ES '{target}' "
        f"debe apuntar a '{sibling_en.name}'."
    )


def _check_es_mirror_links(
    root: Path, es_rel: str, en_rel: str, es_text: str
) -> list[str]:
    root_resolved = root.resolve()
    es_path = (root_resolved / es_rel).resolve()
    en_resolved = (root_resolved / en_rel).resolve()
    errors: list[str] = []
    for item in _iter_md_links(es_text):
        err = _check_single_es_link(root_resolved, es_path, en_resolved, item)
        if err:
            errors.append(err)
    return errors


def _check_en_mirror_links(
    root: Path, en_rel: str, es_rel: str, en_text: str
) -> list[str]:
    root_resolved = root.resolve()
    en_path = (root_resolved / en_rel).resolve()
    es_resolved = (root_resolved / es_rel).resolve()
    errors: list[str] = []
    for item in _iter_md_links(en_text):
        err = _check_single_en_link(root_resolved, en_path, es_resolved, item)
        if err:
            errors.append(err)
    return errors


def _check_pair_structure_and_ids(
    en_rel: str, es_rel: str, en_text: str, es_text: str
) -> list[str]:
    errors: list[str] = []
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


def _check_single_bilingual_pair(
    root: Path, en_rel: str, es_rel: str
) -> list[str]:
    en_path = root / en_rel
    es_path = root / es_rel
    errors: list[str] = []
    if not en_path.is_file() or en_path.stat().st_size == 0:
        errors.append(
            f"Par bilingüe incompleto/vacío: falta o está vacío '{en_rel}'."
        )
    if not es_path.is_file() or es_path.stat().st_size == 0:
        errors.append(
            f"Par bilingüe incompleto/vacío: falta o está vacío '{es_rel}'."
        )
    if errors:
        return errors
    en_text = en_path.read_text(encoding="utf-8")
    es_text = es_path.read_text(encoding="utf-8")
    return [
        *_check_pair_banners(en_rel, es_rel, en_text, es_text),
        *_check_pair_structure_and_ids(en_rel, es_rel, en_text, es_text),
        *_check_es_mirror_links(root, es_rel, en_rel, es_text),
        *_check_en_mirror_links(root, en_rel, es_rel, en_text),
    ]


def _is_ignored_scan_path(rel_parts: tuple[str, ...]) -> bool:
    return any(part in _IGNORED_SCAN_DIRS for part in rel_parts)


def _discover_extra_es_pairs(root: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for es_path in sorted(root.rglob("*.es.md")):
        rel = es_path.relative_to(root)
        es_rel = rel.as_posix()
        if es_rel in _KNOWN_BILINGUAL_ES or _is_ignored_scan_path(rel.parts):
            continue
        pairs.append((f"{es_rel[:-6]}.md", es_rel))
    return pairs


def check_bilingual_pair_parity(root: Path) -> list[str]:
    """Valida banner L1-10, H2/H3, IDs normativos/MCP y enlaces EN↔ES."""
    require_all = (root / "RESOURCES.es.md").is_file()
    errors: list[str] = []
    for en_rel, es_rel in BILINGUAL_DOC_PAIRS:
        if require_all or (root / es_rel).is_file():
            errors.extend(_check_single_bilingual_pair(root, en_rel, es_rel))
    for en_rel, es_rel in _discover_extra_es_pairs(root):
        errors.extend(_check_single_bilingual_pair(root, en_rel, es_rel))
    return errors


def _strip_code_and_comments(text: str) -> str:
    cleaned = _FENCED_CODE_RE.sub("", text)
    cleaned = _HTML_COMMENT_RE.sub("", cleaned)
    return _INLINE_CODE_RE.sub("", cleaned)


def _extract_internal_targets(content: str) -> list[str]:
    sanitized = _strip_code_and_comments(content)
    raw_targets = [*_MD_LINK_RE.findall(sanitized), *_IMG_SRC_RE.findall(sanitized)]
    targets: list[str] = []
    for raw in raw_targets:
        normalized = _normalize_link_target(raw)
        if not _is_external_or_anchor(normalized):
            targets.append(normalized)
    return targets


def _is_historical_exempt_doc(rel_path: str) -> bool:
    return (
        bool(_CHANGELOG_REL_RE.search(rel_path))
        or rel_path.startswith("docs/specs/")
    )


def _is_canonical_agent_target(parts: tuple[str, ...]) -> bool:
    if len(parts) == 3 and parts[:2] == (".agents", "rules"):
        return parts[2] in CANONICAL_GLOBAL_RULE_FILES
    if len(parts) >= 3 and parts[:2] == (".agents", "skills"):
        return parts[2] in CANONICAL_GLOBAL_SKILL_DIRS
    return False


def _is_pruned_canonical_link(
    root_resolved: Path, rel_path: str, candidate: Path
) -> bool:
    if not _is_historical_exempt_doc(rel_path):
        return False
    return _is_canonical_agent_target(candidate.relative_to(root_resolved).parts)


def _check_single_doc_target(
    root_resolved: Path,
    doc_path: Path,
    rel_path: str,
    target: str,
    upstream: bool,
) -> str | None:
    candidate = (doc_path.parent / target).resolve()
    if not candidate.is_relative_to(root_resolved):
        return f"{rel_path}: enlace interno fuera del repositorio ('{target}')."
    if candidate.exists():
        return None
    if not upstream and _is_pruned_canonical_link(
        root_resolved, rel_path, candidate
    ):
        return None
    return f"{rel_path}: enlace interno roto ('{target}')."


def _validate_doc_links(
    root: Path, rel_path: str, upstream: bool = True
) -> list[str]:
    doc_path = root / rel_path
    if not doc_path.is_file():
        return []
    root_resolved = root.resolve()
    errors: list[str] = []
    for target in _extract_internal_targets(doc_path.read_text(encoding="utf-8")):
        err = _check_single_doc_target(
            root_resolved, doc_path, rel_path, target, upstream
        )
        if err:
            errors.append(err)
    return errors


def _collect_agent_markdown_targets(root: Path) -> list[str]:
    targets: list[str] = ["AGENTS.md"] if (root / "AGENTS.md").is_file() else []
    agents_dir = root / ".agents"
    if not agents_dir.is_dir():
        return targets
    for md_file in sorted(agents_dir.rglob("*.md")):
        rel_parts = md_file.relative_to(agents_dir).parts
        if ".cache" in rel_parts or "artifacts" in rel_parts:
            continue
        targets.append(md_file.relative_to(root).as_posix())
    return targets


def _collect_consumer_specs_targets(root: Path) -> list[str]:
    specs_dir = root / "docs" / "specs"
    if not specs_dir.is_dir():
        return []
    return [
        p.relative_to(root).as_posix()
        for p in sorted(specs_dir.glob("*.md"))
        if p.is_file()
    ]


def _build_link_audit_targets(root: Path, is_upstream: bool) -> list[str]:
    candidates = [
        *INTERNAL_LINK_AUDIT_TARGETS,
        *_collect_agent_markdown_targets(root),
    ]
    if not is_upstream:
        candidates.extend(_collect_consumer_specs_targets(root))
    return list(dict.fromkeys(candidates))


def check_internal_markdown_links(
    root: Path, upstream: bool | None = None
) -> list[str]:
    """Audita enlaces Markdown e imágenes internas en portadas, docs y .agents/."""
    is_upstream = is_upstream_blueprints_repo(root) if upstream is None else upstream
    errors: list[str] = []
    for rel_path in _build_link_audit_targets(root, is_upstream):
        errors.extend(_validate_doc_links(root, rel_path, upstream=is_upstream))
    return errors


def check_historical_spec_links(root: Path) -> list[str]:
    """Audita enlaces locales relativos dentro de Specs históricas 01..18."""
    specs_dir = root / "docs" / "specs"
    if not specs_dir.is_dir():
        return []
    errors: list[str] = []
    for spec_path in sorted(specs_dir.glob("*.md")):
        rel = spec_path.relative_to(root).as_posix()
        if _HISTORICAL_SPEC_RE.match(rel):
            errors.extend(_validate_doc_links(root, rel))
    return errors
