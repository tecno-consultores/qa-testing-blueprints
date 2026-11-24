# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validadores de conteos, presupuestos cognitivos y patrones activos."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from _docs_invariants_config import (
    _AGENT_SETUP_EN_STRICT_TARGETS,
    _NON_BLUEPRINT_TOP_DIRS,
    _STACK_MARKER_FILES,
    BILINGUAL_TRIGGER_DOCS,
    CANONICAL_GLOBAL_SKILL_DIRS,
    CONNECTOR_END_MARKER,
    CONNECTOR_START_MARKER,
    DOC_TARGETS,
    EXPECTED_BLUEPRINTS_COUNT,
    EXPECTED_CALM_CONTROLS,
    EXPECTED_REF_CONTROLS,
    EXPECTED_RESOURCES_COUNT,
    EXPECTED_SCANNER_RULES,
    EXPECTED_SKILLS_COUNT,
    EXPECTED_TOOLS_COUNT,
    FORBIDDEN_DOC_PATTERNS,
    GLOBAL_CONNECTOR_MAX_BYTES,
    KNOWN_BLUEPRINT_STACKS,
    MAX_ACTIVE_TASK_LINES,
    MAX_ACTIVE_TASK_RULE_LINES,
    MAX_ARCHITECT_SKILL_BYTES,
    MAX_SKILL_MD_BYTES,
    MAX_TACTICAL_SKILL_BYTES,
    PROJECT_CONNECTOR_MAX_BYTES,
    REPO_AGENTS_MD_MAX_BYTES,
    RULES_TOTAL_MAX_BYTES,
    RepoExpectedCounts,
    _extract_auditor_rule_ids,
    _iter_active_doc_paths,
    _load_json_strict,
    _read_active_doc_text,
    _read_mcp_server_sources,
    is_upstream_blueprints_repo,
)

_APPIUM_V2_RE = re.compile(r"\bAppium\s+2(?:\.[x0-9]+)?\b", re.IGNORECASE)
_CALM_CONTEXT_RE = re.compile(
    r"\bcalm\b|qa-11x\.calm\.json|"
    r"blocking\s+architecture\s+controls|controles\s+bloqueantes",
    re.IGNORECASE,
)
_CALM_CTRL_RE = re.compile(
    r"(?<![.\w-])(\d+)[-\s]+(?:Blocking\s+Architecture\s+|"
    r"mandatory\s+(?:11X\s+)?|obligatorios?\s+|CALM\s+)?"
    r"(?:Controls?|Controles?)\b",
    re.IGNORECASE,
)
_CALM_PREFIX_CTRL_RE = re.compile(
    r"\bCALM\s+(\d+)\s+(?:Controls?|Controles?)\b", re.IGNORECASE
)
_SKILLS_COUNT_RE = re.compile(
    r"(?<![.\w-])(\d+)\s+(?:modular\s+(?:AI\s+agent\s+)?|modulares\s+)?"
    r"(?:skills|Skills)(?:\s+modulares)?\b(?!-)"
)
_SCANNER_RULES_STRICT_RE = re.compile(
    r"(?<![.\w-])(\d+)\s+(?:static|scanner|estáticas?|del\s+escáner)\s+"
    r"(?:rules?|reglas?|patterns?|patrones?)\b",
    re.IGNORECASE,
)
_SCANNER_CTX_RE = re.compile(
    r"audit_security_stig_owasp|security-auditor|\bscanner\b|\bescáner\b",
    re.IGNORECASE,
)
_SCANNER_RULES_CTX_RE = re.compile(
    r"(?<![.\w-])(\d+)\s+(?:DISA/OWASP[^\n]{0,25})?"
    r"(?:rules?|reglas?|static\s+patterns?|patrones?\s+estáticos?)\b",
    re.IGNORECASE,
)
_TOOLS_COUNT_RE = re.compile(
    r"(?<![.\w-])(\d+)\s+(?:MCP\s+|operational\s+|canonical\s+|"
    r"executable\s+|ejecutables?\s+)?"
    r"(?:Tools?|tools?|herramientas?|Herramientas?)\b"
    r"(?!\s+(?:v\d|core\b|núcleo\b))"
)
_RESOURCES_COUNT_RE = re.compile(
    r"(?<![.\w-])(\d+)\s+(?:MCP\s+|dynamic\s+|dinámicos?\s+)?"
    r"(?:Resources?|resources?|Recursos?|recursos?)\b"
    r"(?!\s+(?:templates?\b|plantillas?\b))"
)
_BLUEPRINTS_COUNT_RE = re.compile(
    r"(?<!Top\s)(?<![.\w-])(\d+)\s+(?:production\s+)?(stacks|blueprints)\b",
    re.IGNORECASE,
)
_AGENT_SETUP_EN_REF_RE = re.compile(r"\bagent-setup\.en\.md\b")
_STALE_V1_MCP_COUNT_RE = re.compile(
    r"\b(?:12\s+(?:Tools|tools|herramientas)"
    r"|(?:[89]|1[01])\s+(?:Resources|resources|Recursos|recursos))\b"
)

FILE_SPECIFIC_PATTERNS: tuple[tuple[str, str, str], ...] = (
    (
        "docs/ai-integration.md",
        r"subprocess\.run\([^\n]*shell\s*=\s*" + "True",
        (
            "docs/ai-integration.md: prohibido activar modo shell booleano "
            "en ejemplos de subprocess.run."
        ),
    ),
    (
        "docs/ai-integration.es.md",
        r"subprocess\.run\([^\n]*shell\s*=\s*" + "True",
        (
            "docs/ai-integration.es.md: prohibido activar modo shell booleano "
            "en ejemplos de subprocess.run."
        ),
    ),
    (
        "docs/docker-troubleshooting.md",
        r"(?m)^\s*user:\s*root\b",
        (
            "docs/docker-troubleshooting.md: prohibido recomendar directiva "
            "YAML 'user: root'."
        ),
    ),
    (
        "docs/docker-troubleshooting.es.md",
        r"(?m)^\s*user:\s*root\b",
        (
            "docs/docker-troubleshooting.es.md: prohibido recomendar directiva "
            "YAML 'user: root'."
        ),
    ),
)


def _extract_bracket_items(src: str, block_re: str, item_re: str) -> int:
    match = re.search(block_re, src, re.DOTALL)
    if not match:
        return 0
    return len(re.findall(item_re, match.group(1)))


def _derive_tools_count(root: Path) -> int:
    combined = _read_mcp_server_sources(root)
    reg_re = r"\bserver\.(?:tool|registerTool)\(\s*['\"][a-z0-9_-]+['\"]"
    v1_count = len(re.findall(reg_re, combined))
    v2_match = re.search(
        r"V2_TOOL_(?:DEFINITIONS|REGISTRATIONS)[^=]*=\s*\[(.*?)\];",
        combined,
        re.DOTALL,
    )
    v2_tools = (
        set(re.findall(r"\b[A-Z0-9_]+_TOOL\b", v2_match.group(1)))
        if v2_match
        else set()
    )
    total = v1_count + len(v2_tools)
    if total > 0:
        return total
    arr_count = _extract_bracket_items(
        combined,
        r"\btools\s*=\s*\[([^\]]+)\]",
        r"['\"][a-z0-9_-]+['\"]",
    )
    return arr_count if arr_count > 0 else EXPECTED_TOOLS_COUNT


def _derive_resources_count(root: Path) -> int:
    combined = _read_mcp_server_sources(root)
    res_re = (
        r"\bserver\.(?:resource|registerResource)\(\s*"
        r"(?:['\"][^'\"]+['\"]|([A-Z0-9_]+_RESOURCE)\.name)\s*,\s*"
        r"(?:(?:new\s+ResourceTemplate\(\s*)?['\"]blueprint://[^'\"]+['\"]|([A-Z0-9_]+_RESOURCE)\.uri)"
    )
    matches = re.findall(res_re, combined)
    registered_syms = {sym for pair in matches for sym in pair if sym}
    v1_count = len(matches)
    v2_match = re.search(
        r"V2_RESOURCE_DEFINITIONS[^=]*=\s*\[([^\]]+)\]",
        combined,
        re.DOTALL,
    )
    v2_syms = (
        set(re.findall(r"\b([A-Z0-9_]+_RESOURCE)\b", v2_match.group(1)))
        if v2_match
        else set()
    )
    total = v1_count + len(v2_syms - registered_syms)
    return total if total > 0 else EXPECTED_RESOURCES_COUNT


def _derive_skills_count(root: Path) -> int:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return EXPECTED_SKILLS_COUNT
    count = sum(1 for p in skills_dir.glob("*/SKILL.md") if p.is_file())
    has_server = (root / "mcp-server" / "src" / "server.ts").is_file()
    if count > 0 and (has_server or count >= 8):
        return count
    return EXPECTED_SKILLS_COUNT


def _is_extra_blueprint_dir(entry: Path) -> bool:
    if not entry.is_dir():
        return False
    name = entry.name
    if name in _NON_BLUEPRINT_TOP_DIRS or name in KNOWN_BLUEPRINT_STACKS:
        return False
    if not (entry / "README.md").is_file():
        return False
    return any((entry / marker).is_file() for marker in _STACK_MARKER_FILES)


def _derive_blueprints_count(root: Path) -> int:
    known = sum(
        1 for s in KNOWN_BLUEPRINT_STACKS if (root / s / "README.md").is_file()
    )
    extra = sum(1 for entry in root.iterdir() if _is_extra_blueprint_dir(entry))
    count = known + extra
    has_server = (root / "mcp-server" / "src" / "server.ts").is_file()
    if count > 0 and (has_server or count >= 7):
        return count
    return EXPECTED_BLUEPRINTS_COUNT


def _derive_calm_controls(root: Path) -> int:
    calm_path = root / "architecture" / "qa-11x.calm.json"
    if not calm_path.is_file():
        return EXPECTED_CALM_CONTROLS
    data, _ = _load_json_strict(calm_path)
    controls = data.get("controls") if isinstance(data, dict) else None
    if isinstance(controls, dict) and controls:
        return len(controls)
    return EXPECTED_CALM_CONTROLS


def _derive_ref_controls(root: Path) -> int:
    ref_path = (
        root
        / ".agents"
        / "skills"
        / "qa-11x-architect"
        / "references"
        / "02-security-disa-owasp-22.md"
    )
    if not ref_path.is_file():
        return EXPECTED_REF_CONTROLS
    text = ref_path.read_text(encoding="utf-8")
    rows = re.findall(r"(?m)^\|\s*\*\*\d+\*\*\s*\|", text)
    return len(rows) if rows else EXPECTED_REF_CONTROLS


def _derive_scanner_rules(root: Path) -> int:
    auditor_ts = root / "mcp-server" / "src" / "tools" / "security-auditor.ts"
    if not auditor_ts.is_file():
        return EXPECTED_SCANNER_RULES
    rule_ids = _extract_auditor_rule_ids(auditor_ts)
    return len(rule_ids) if rule_ids else EXPECTED_SCANNER_RULES


def derive_expected_counts(root: Path) -> RepoExpectedCounts:
    """Calcula conteos esperados reales desde archivos fuente en root con fallback."""
    return RepoExpectedCounts(
        skills=_derive_skills_count(root),
        tools=_derive_tools_count(root),
        resources=_derive_resources_count(root),
        blueprints=_derive_blueprints_count(root),
        calm_controls=_derive_calm_controls(root),
        ref_controls=_derive_ref_controls(root),
        scanner_rules=_derive_scanner_rules(root),
    )


def _validate_single_skill_size(root: Path, skill_md: Path) -> str | None:
    name = skill_md.parent.name
    size = skill_md.stat().st_size
    special_limits = {
        "tactical-patterns-11x": MAX_TACTICAL_SKILL_BYTES,
        "qa-11x-architect": MAX_ARCHITECT_SKILL_BYTES,
    }
    special = special_limits.get(name)
    if special is not None:
        if size > special:
            return (
                f"{skill_md.relative_to(root)} excede el presupuesto cognitivo "
                f"({size} > {special} bytes)."
            )
        return None
    if size >= MAX_SKILL_MD_BYTES:
        return (
            f"{skill_md.relative_to(root)} excede el presupuesto cognitivo "
            f"({size} >= {MAX_SKILL_MD_BYTES} bytes)."
        )
    return None


def _check_skill_size(root: Path, upstream: bool = True) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    errors: list[str] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        err = _validate_single_skill_size(root, skill_md)
        if not err:
            continue
        is_vendor = (
            not upstream and skill_md.parent.name not in CANONICAL_GLOBAL_SKILL_DIRS
        )
        if is_vendor:
            print(f"WARN [Docs Invariants]: {err}", file=sys.stderr)
            continue
        errors.append(err)
    return errors


def _check_connector_counts(starts: int, ends: int) -> list[str]:
    if starts > 1 or ends > 1:
        return [
            "AGENTS.md contiene bloques de conector QA-11X duplicados "
            f"({starts}/{ends} marcadores)."
        ]
    if starts != ends:
        return ["AGENTS.md tiene marcadores QA_11X_MCP_CONNECTOR desbalanceados."]
    return []


def _check_connector_slice(
    text: str, max_bytes: int = PROJECT_CONNECTOR_MAX_BYTES, label: str = "AGENTS.md"
) -> list[str]:
    start_idx = text.find(CONNECTOR_START_MARKER)
    end_idx = text.find(CONNECTOR_END_MARKER)
    if end_idx < start_idx:
        return [f"{label} tiene marcadores QA_11X_MCP_CONNECTOR invertidos."]
    block = text[start_idx : end_idx + len(CONNECTOR_END_MARKER)]
    block_bytes = len(block.encode("utf-8"))
    if block_bytes > max_bytes:
        return [
            f"{label} bloque conector QA-11X excede {max_bytes} bytes ({block_bytes})."
        ]
    return []


def _validate_connector_markers(
    text: str, max_bytes: int = PROJECT_CONNECTOR_MAX_BYTES, label: str = "AGENTS.md"
) -> list[str]:
    starts = text.count(CONNECTOR_START_MARKER)
    ends = text.count(CONNECTOR_END_MARKER)
    if starts == 0 and ends == 0:
        return []
    count_errors = _check_connector_counts(starts, ends)
    if count_errors:
        return count_errors
    return _check_connector_slice(text, max_bytes=max_bytes, label=label)


def _check_agents_connector_budget(root: Path, upstream: bool) -> list[str]:
    agents_md = root / "AGENTS.md"
    if not agents_md.is_file():
        return []
    text = agents_md.read_text(encoding="utf-8")
    errors = _validate_connector_markers(text)
    if upstream and len(text.encode("utf-8")) > REPO_AGENTS_MD_MAX_BYTES:
        raw_bytes = len(text.encode("utf-8"))
        errors.append(
            "AGENTS.md excede el presupuesto cognitivo "
            f"({raw_bytes} > {REPO_AGENTS_MD_MAX_BYTES} bytes)."
        )
    return errors


def _check_installer_connector_blocks(root: Path) -> list[str]:
    installer = root / "scripts" / "install-skill.sh"
    if not installer.is_file():
        return []
    blocks = re.findall(
        r"<!-- QA_11X_MCP_CONNECTOR_START -->.*?<!-- QA_11X_MCP_CONNECTOR_END -->",
        installer.read_text(encoding="utf-8"),
        flags=re.DOTALL,
    )
    return [
        (
            f"scripts/install-skill.sh bloque conector #{idx} excede "
            f"{GLOBAL_CONNECTOR_MAX_BYTES} bytes ({len(block.encode('utf-8'))})."
        )
        for idx, block in enumerate(blocks, 1)
        if len(block.encode("utf-8")) > GLOBAL_CONNECTOR_MAX_BYTES
    ]


def _check_global_connector_budget(root: Path, upstream: bool) -> list[str]:
    errors: list[str] = []
    for name in ("GEMINI.md", "CLAUDE.md"):
        doc = root / name
        if doc.is_file():
            errors.extend(
                _validate_connector_markers(
                    doc.read_text(encoding="utf-8"),
                    max_bytes=GLOBAL_CONNECTOR_MAX_BYTES,
                    label=name,
                )
            )
    if upstream:
        errors.extend(_check_installer_connector_blocks(root))
    return errors


def _check_rules_total_budget(root: Path) -> list[str]:
    rules_dir = root / ".agents" / "rules"
    if not rules_dir.is_dir():
        return []
    total_bytes = sum(
        p.stat().st_size
        for p in sorted(rules_dir.glob("*.md"))
        if p.is_file() and not p.name.startswith("domain_")
    )
    if total_bytes > RULES_TOTAL_MAX_BYTES:
        return [
            ".agents/rules/*.md excede el presupuesto cognitivo total "
            f"({total_bytes} > {RULES_TOTAL_MAX_BYTES} bytes)."
        ]
    return []


def _check_scratchpad_lines(
    root: Path, rel: str, max_lines: int = MAX_ACTIVE_TASK_LINES
) -> list[str]:
    candidate = root / rel
    if not candidate.is_file():
        return []
    count = len(candidate.read_text(encoding="utf-8").splitlines())
    if count <= max_lines:
        return []
    return [f"{rel} excede el límite compacto ({count} > {max_lines} líneas)."]


def check_cognitive_budgets(root: Path, upstream: bool | None = None) -> list[str]:
    """Verifica SKILL.md, reglas (.agents/rules/), conectores y scratchpads."""
    is_upstream = is_upstream_blueprints_repo(root) if upstream is None else upstream
    return [
        *_check_skill_size(root, is_upstream),
        *_check_agents_connector_budget(root, is_upstream),
        *_check_global_connector_budget(root, is_upstream),
        *_check_rules_total_budget(root),
        *_check_scratchpad_lines(root, ".agents/ACTIVE_TASK.md.example"),
        *_check_scratchpad_lines(root, ".agents/ACTIVE_TASK.md"),
        *_check_scratchpad_lines(
            root,
            ".agents/rules/active_task_and_planning_resilience.md",
            MAX_ACTIVE_TASK_RULE_LINES,
        ),
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
                duplicates.append(
                    f"{rel_path} contiene sección duplicada '### {sec_id}.'"
                )
            seen.add(sec_id)
    return duplicates


def check_security_section_numbering(root: Path) -> list[str]:
    """Detecta numeración duplicada '### 4.X.' en SECURITY.md y SECURITY.es.md."""
    return [
        *_check_sec_numbering_file(root, "SECURITY.md"),
        *_check_sec_numbering_file(root, "SECURITY.es.md"),
    ]


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
    return [
        *_scan_global_patterns(rel_path, content),
        *_scan_specific_patterns(rel_path, content),
    ]


def _check_appium_line(rel: str, line_no: int, line: str) -> list[str]:
    if _APPIUM_V2_RE.search(line):
        return [f"{rel}:{line_no}: referencia obsoleta a Appium 2 (usar Appium 3)."]
    return []


def _check_calm_line(
    rel: str, line_no: int, line: str, expected_calm: int
) -> list[str]:
    if not _CALM_CONTEXT_RE.search(line):
        return []
    found = [
        *_CALM_CTRL_RE.findall(line),
        *_CALM_PREFIX_CTRL_RE.findall(line),
    ]
    return [
        (
            f"{rel}:{line_no}: conteo CALM obsoleto "
            f"({val} controles, esperado {expected_calm})."
        )
        for val in found
        if int(val) != expected_calm
    ]


def _check_skills_line(
    rel: str, line_no: int, line: str, expected_skills: int
) -> list[str]:
    return [
        (
            f"{rel}:{line_no}: conteo de skills obsoleto "
            f"({val} skills, esperado {expected_skills})."
        )
        for val in _SKILLS_COUNT_RE.findall(line)
        if int(val) != expected_skills
    ]


def _check_scanner_rules_line(
    rel: str, line_no: int, line: str, expected_rules: int
) -> list[str]:
    found = list(_SCANNER_RULES_STRICT_RE.findall(line))
    if _SCANNER_CTX_RE.search(line):
        found.extend(_SCANNER_RULES_CTX_RE.findall(line))
    return [
        (
            f"{rel}:{line_no}: conteo de reglas del escáner obsoleto "
            f"({val} reglas, esperado {expected_rules})."
        )
        for val in found
        if int(val) != expected_rules
    ]


def _check_mcp_surface_line(
    rel: str,
    line_no: int,
    line: str,
    counts: RepoExpectedCounts,
    strict_surface: bool,
) -> list[str]:
    errors: list[str] = []
    for val in _TOOLS_COUNT_RE.findall(line):
        num = int(val)
        if num != counts.tools and (strict_surface or num != 12):
            errors.append(
                f"{rel}:{line_no}: conteo de tools MCP obsoleto "
                f"({num} tools, esperado {counts.tools})."
            )
    for val in _RESOURCES_COUNT_RE.findall(line):
        num = int(val)
        if num != counts.resources:
            errors.append(
                f"{rel}:{line_no}: conteo de resources MCP obsoleto "
                f"({num} resources, esperado {counts.resources})."
            )
    return errors


def _check_blueprints_line(
    rel: str, line_no: int, line: str, expected_blueprints: int
) -> list[str]:
    return [
        (
            f"{rel}:{line_no}: conteo obsoleto de {int(val)} {word} "
            f"(esperado {expected_blueprints})."
        )
        for val, word in _BLUEPRINTS_COUNT_RE.findall(line)
        if int(val) != expected_blueprints
    ]


def _scan_stale_counts_file(
    rel: str,
    text: str,
    counts: RepoExpectedCounts,
    strict_surface: bool,
) -> list[str]:
    errors: list[str] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        errors.extend(_check_appium_line(rel, line_no, line))
        errors.extend(_check_calm_line(rel, line_no, line, counts.calm_controls))
        errors.extend(_check_skills_line(rel, line_no, line, counts.skills))
        errors.extend(
            _check_scanner_rules_line(rel, line_no, line, counts.scanner_rules)
        )
        errors.extend(
            _check_mcp_surface_line(rel, line_no, line, counts, strict_surface)
        )
        errors.extend(
            _check_blueprints_line(rel, line_no, line, counts.blueprints)
        )
    return errors


def check_stale_surface_counts(
    root: Path, counts: RepoExpectedCounts | None = None
) -> list[str]:
    """Detecta conteos desfasados (tools, resources, CALM, skills, reglas, Appium 2)."""
    resolved = counts or derive_expected_counts(root)
    strict_surface = (
        any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS)
        or (root / "llms.txt").is_file()
        or (root / "mcp-server" / "src" / "server.ts").is_file()
    )
    errors: list[str] = []
    for rel_path, full_path in _iter_active_doc_paths(root):
        text = _read_active_doc_text(rel_path, full_path)
        errors.extend(
            _scan_stale_counts_file(rel_path, text, resolved, strict_surface)
        )
    return errors


def _extra_agent_setup_files(root: Path) -> list[str]:
    docs_dir = root / "docs"
    if not docs_dir.is_dir():
        return []
    return [
        p.relative_to(root).as_posix()
        for p in sorted(docs_dir.glob("agent-setup*"))
        if p.name != "agent-setup.en.md"
    ]


def _collect_agent_setup_strict_files(root: Path) -> list[tuple[str, Path]]:
    ordered = dict.fromkeys(
        [*_AGENT_SETUP_EN_STRICT_TARGETS, *_extra_agent_setup_files(root)]
    )
    return [(rel, root / rel) for rel in ordered if (root / rel).is_file()]


def _check_forbidden_agent_setup_en(root: Path) -> list[str]:
    errors: list[str] = []
    if (root / "docs" / "agent-setup.en.md").exists():
        errors.append(
            "docs/agent-setup.en.md: archivo legado prohibido "
            "(usar docs/agent-setup.md y docs/agent-setup.es.md)."
        )
    for rel, full in _collect_agent_setup_strict_files(root):
        if _AGENT_SETUP_EN_REF_RE.search(full.read_text(encoding="utf-8")):
            errors.append(
                f"{rel}: referencia prohibida a 'agent-setup.en.md' "
                "(usar 'agent-setup.md' o 'agent-setup.es.md')."
            )
    return errors


def check_active_docs(root: Path) -> list[str]:
    """Valida invariantes y ausencia de derivas en documentos activos."""
    errors = _check_forbidden_agent_setup_en(root)
    for rel_path, full_path in _iter_active_doc_paths(root):
        content = _read_active_doc_text(rel_path, full_path)
        errors.extend(_scan_file_patterns(rel_path, content))
    return errors


def check_v2_mcp_surface_counts(root: Path) -> list[str]:
    """Rechaza conteos MCP v1 obsoletos (12 tools / 9 resources) en repos v2.0."""
    if not any((root / rel).is_file() for rel in BILINGUAL_TRIGGER_DOCS):
        return []
    counts = derive_expected_counts(root)
    errors: list[str] = []
    for rel_path in DOC_TARGETS:
        doc_path = root / rel_path
        if not doc_path.is_file():
            continue
        content = _read_active_doc_text(rel_path, doc_path)
        if _STALE_V1_MCP_COUNT_RE.search(content):
            errors.append(
                f"{rel_path}: detectado conteo MCP v1 obsoleto "
                f"(debe ser {counts.tools} Tools / {counts.resources} Resources)."
            )
    return errors
