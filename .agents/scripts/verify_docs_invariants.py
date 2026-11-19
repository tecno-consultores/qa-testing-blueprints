#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validador determinista de presupuesto cognitivo e invariantes documentales QA 11X."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any


def _load_budgets_module() -> ModuleType:
    existing = sys.modules.get("_budgets")
    if existing is not None:
        return existing
    budgets_path = Path(__file__).resolve().parent / "_budgets.py"
    spec = importlib.util.spec_from_file_location("_budgets", budgets_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"No se pudo cargar _budgets desde {budgets_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_budgets"] = mod
    spec.loader.exec_module(mod)
    return mod


_BUDGETS = _load_budgets_module()
SKILL_MAX_BYTES: int = int(_BUDGETS.SKILL_MAX_BYTES)
ARCHITECT_SKILL_MAX_BYTES: int = int(_BUDGETS.ARCHITECT_SKILL_MAX_BYTES)
TACTICAL_SKILL_MAX_BYTES: int = int(_BUDGETS.TACTICAL_SKILL_MAX_BYTES)
ACTIVE_TASK_MAX_LINES: int = int(_BUDGETS.ACTIVE_TASK_MAX_LINES)
ACTIVE_TASK_RULE_MAX_LINES: int = int(_BUDGETS.ACTIVE_TASK_RULE_MAX_LINES)

MAX_SKILL_MD_BYTES = SKILL_MAX_BYTES
MAX_ARCHITECT_SKILL_BYTES = ARCHITECT_SKILL_MAX_BYTES
MAX_TACTICAL_SKILL_BYTES = TACTICAL_SKILL_MAX_BYTES
MAX_ACTIVE_TASK_LINES = ACTIVE_TASK_MAX_LINES
MAX_ACTIVE_TASK_RULE_LINES = ACTIVE_TASK_RULE_MAX_LINES

EXPECTED_SKILLS_COUNT = 11
EXPECTED_TOOLS_COUNT = 19
EXPECTED_RESOURCES_COUNT = 13
EXPECTED_BLUEPRINTS_COUNT = 10
EXPECTED_CALM_CONTROLS = 7
EXPECTED_REF_CONTROLS = 22
EXPECTED_SCANNER_RULES = 34

KNOWN_BLUEPRINT_STACKS: tuple[str, ...] = (
    "python",
    "fastapi",
    "node-backend",
    "vue3",
    "react-frontend",
    "php",
    "bash-scripts",
    "ai-evals",
    "mobile-appium",
    "vibe-rescue",
)

_NON_BLUEPRINT_TOP_DIRS = frozenset({
    ".agents",
    ".github",
    "architecture",
    "catalogs",
    "docs",
    "mcp-server",
    "scripts",
    "tests",
})

_STACK_MARKER_FILES: tuple[str, ...] = (
    "Makefile",
    "Makefile.example",
    "docker-compose.qa.yml",
    "docker-compose.qa.yml.example",
)

FORBIDDEN_DOC_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        r"\b8 Resources\b|\b8 recursos\b|\b8 Recursos\b",
        "conteo obsoleto de 8 recursos MCP (debe ser 13)",
    ),
    (r"1\.43\.0-jammy|karatelabs:1\.5\.0", "tag de imagen Docker obsoleto"),
    (
        r"\buv pip audit\b",
        "subcomando inexistente 'uv pip audit' (usar 'pip-audit')",
    ),
    (
        r"refactoring-ui/\{topic\}[^\n]*\(`01` a `09`\)",
        "ejemplo numérico inválido en refactoring-ui/{topic}",
    ),
    (
        r"--profile\s+graphify",
        (
            "flag obsoleto '--profile graphify' "
            "(usar './scripts/actualizar-grafos-graphify.sh')"
        ),
    ),
    (
        r"\]\([^)]*agent-setup\.en\.md(?:#[^)]*)?\)",
        (
            "enlace obsoleto a 'agent-setup.en.md' "
            "(usar 'agent-setup.md' o 'agent-setup.es.md')"
        ),
    ),
)

_AGENT_SETUP_EN_STRICT_TARGETS: tuple[str, ...] = (
    "README.md",
    "README.es.md",
    "RESOURCES.md",
    "RESOURCES.es.md",
    "llms.txt",
    "docs/agent-setup.md",
    "docs/agent-setup.es.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
)

_IGNORED_SCAN_DIRS: frozenset[str] = frozenset({
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "dist",
    "graphify-out",
    "htmlcov",
    "node_modules",
})

BILINGUAL_DOC_PAIRS: tuple[tuple[str, str], ...] = (
    ("README.md", "README.es.md"),
    ("RESOURCES.md", "RESOURCES.es.md"),
    ("TESTING.md", "TESTING.es.md"),
    ("SECURITY.md", "SECURITY.es.md"),
    ("CONTRIBUTING.md", "CONTRIBUTING.es.md"),
    ("CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT.es.md"),
    ("FAQ.md", "FAQ.es.md"),
    ("AI_MASTER_PROMPT.md", "AI_MASTER_PROMPT.es.md"),
    ("ROADMAP.md", "ROADMAP.es.md"),
    ("CHANGELOG.md", "CHANGELOG.es.md"),
    ("mcp-server/README.md", "mcp-server/README.es.md"),
    ("mcp-server/CHANGELOG.md", "mcp-server/CHANGELOG.es.md"),
    ("mcp-server/example/README.md", "mcp-server/example/README.es.md"),
    ("mcp-server/example/CHANGELOG.md", "mcp-server/example/CHANGELOG.es.md"),
    ("mcp-server/example/TESTING.md", "mcp-server/example/TESTING.es.md"),
    ("docs/agent-setup.md", "docs/agent-setup.es.md"),
    ("docs/specs/README.md", "docs/specs/README.es.md"),
    (
        "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md",
        "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md",
    ),
    (
        "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md",
        "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md",
    ),
    (
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
    ),
    (
        "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
        "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
    ),
    (
        "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
        "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md",
    ),
    (
        "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md",
        "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md",
    ),
    (
        "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
        "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
    ),
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
    "mcp-server/example/AGENTS.md",
    "mcp-server/example/CHANGELOG.md",
    "mcp-server/example/CHANGELOG.es.md",
    "mcp-server/example/TESTING.md",
    "mcp-server/example/TESTING.es.md",
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
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
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
    "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md",
    "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md",
    "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md",
    "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md",
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
    "CODE_OF_CONDUCT.md",
    "CODE_OF_CONDUCT.es.md",
    "AI_MASTER_PROMPT.md",
    "AI_MASTER_PROMPT.es.md",
    "ROADMAP.md",
    "ROADMAP.es.md",
    "CHANGELOG.md",
    "CHANGELOG.es.md",
    "mcp-server/CHANGELOG.md",
    "mcp-server/CHANGELOG.es.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
    "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
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
    "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md",
    "docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md",
    "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md",
    "docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md",
    "llms.txt",
    "catalogs/agenticskills-submission.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
    "mcp-server/example/README.md",
    "mcp-server/example/README.es.md",
    "mcp-server/example/AGENTS.md",
    "mcp-server/example/CHANGELOG.md",
    "mcp-server/example/CHANGELOG.es.md",
    "mcp-server/example/TESTING.md",
    "mcp-server/example/TESTING.es.md",
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
_IMG_SRC_RE = re.compile(
    r'<img\b[^>]*\bsrc=["\']([^"\']+)["\']', re.IGNORECASE
)

HUMAN_CORE_MANUALS: tuple[str, ...] = (
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md",
    "SECURITY.md",
)

HUMAN_CORE_MANUALS_ES: tuple[str, ...] = (
    "docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md",
    "docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.es.md",
    "docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md",
    "docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md",
    "SECURITY.es.md",
)

REQUIRED_CATALOG_FILES: tuple[str, ...] = (
    "llms.txt",
    "catalogs/qaskills-pack.json",
    "catalogs/skillsllm-manifest.json",
    "catalogs/agenticskills-submission.md",
)

_HISTORICAL_SPEC_RE = re.compile(r"^docs/specs/(?:0[1-9]|1[0-8])_")
_CHANGELOG_REL_RE = re.compile(r"(?:^|/)CHANGELOG(?:\.es)?\.md$")
_CHANGELOG_PREV_RELEASE_RE = re.compile(
    r"(?m)^##\s+\[(?!Unreleased\])[^\]]+\]"
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


@dataclass(frozen=True)
class RepoExpectedCounts:
    """Conteos canónicos derivados dinámicamente del código fuente del repositorio."""

    skills: int
    tools: int
    resources: int
    blueprints: int
    calm_controls: int
    ref_controls: int
    scanner_rules: int


def _reject_dup_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, val in pairs:
        if key in obj:
            raise ValueError(f"clave JSON duplicada {key!r}")
        obj[key] = val
    return obj


def _load_json_strict(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw, object_pairs_hook=_reject_dup_json_keys)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return None, str(exc)
    if not isinstance(data, dict):
        return None, "el documento JSON debe tener un objeto en la raíz"
    return data, None


def _extract_bracket_items(src: str, block_re: str, item_re: str) -> int:
    match = re.search(block_re, src, re.DOTALL)
    if not match:
        return 0
    return len(re.findall(item_re, match.group(1)))


def _derive_tools_count(root: Path) -> int:
    srv_path = root / "mcp-server" / "src" / "server.ts"
    idx_path = root / "mcp-server" / "src" / "index.ts"
    srv_src = srv_path.read_text(encoding="utf-8") if srv_path.is_file() else ""
    idx_src = idx_path.read_text(encoding="utf-8") if idx_path.is_file() else ""
    combined = f"{srv_src}\n{idx_src}"
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
    srv_path = root / "mcp-server" / "src" / "server.ts"
    idx_path = root / "mcp-server" / "src" / "index.ts"
    srv_src = srv_path.read_text(encoding="utf-8") if srv_path.is_file() else ""
    idx_src = idx_path.read_text(encoding="utf-8") if idx_path.is_file() else ""
    combined = f"{srv_src}\n{idx_src}"
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


def _extract_auditor_rule_ids(auditor_ts: Path) -> list[str]:
    src = auditor_ts.read_text(encoding="utf-8")
    consts = dict(
        re.findall(r"\bconst\s+([A-Z0-9_]+)\s*=\s*['\"]([A-Z0-9-]+)['\"]", src)
    )
    literals = set(re.findall(r"\brule_id:\s*['\"]([A-Z0-9-]+)['\"]", src))
    via_const = {
        consts[name]
        for name in re.findall(r"\brule_id:\s*([A-Z0-9_]+)\b", src)
        if name in consts
    }
    return sorted(literals | via_const)


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


def _check_skill_size(root: Path) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    errors: list[str] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        err = _validate_single_skill_size(root, skill_md)
        if err:
            errors.append(err)
    return errors


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


def check_cognitive_budgets(root: Path) -> list[str]:
    """Verifica SKILL.md (<=20KB/12KB/2.5KB), ACTIVE_TASK <=40L y regla <=25L."""
    return [
        *_check_skill_size(root),
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


def _collect_glob_docs(root: Path) -> list[str]:
    patterns = ("catalogs/*.md", ".agents/rules/*.md", ".agents/skills/*/SKILL.md")
    return [
        found.relative_to(root).as_posix()
        for pattern in patterns
        for found in sorted(root.glob(pattern))
        if found.is_file()
    ]


def _iter_active_doc_paths(root: Path) -> list[tuple[str, Path]]:
    candidates = [*DOC_TARGETS, "llms.txt", *_collect_glob_docs(root)]
    seen: set[str] = set()
    items: list[tuple[str, Path]] = []
    for rel in candidates:
        if rel in seen or _HISTORICAL_SPEC_RE.match(rel):
            continue
        seen.add(rel)
        full = root / rel
        if full.is_file():
            items.append((rel, full))
    return items


def _read_active_doc_text(rel_path: str, path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if _CHANGELOG_REL_RE.search(rel_path):
        prev_match = _CHANGELOG_PREV_RELEASE_RE.search(text)
        if prev_match:
            return text[: prev_match.start()]
    return text


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
    errors: list[str] = []
    for val, word in _BLUEPRINTS_COUNT_RE.findall(line):
        num = int(val)
        if num == expected_blueprints:
            continue
        errors.append(
            f"{rel}:{line_no}: conteo obsoleto de {num} {word} "
            f"(esperado {expected_blueprints})."
        )
    return errors


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


_AGENT_SETUP_EN_REF_RE = re.compile(r"\bagent-setup\.en\.md\b")


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
        content = full_path.read_text(encoding="utf-8")
        errors.extend(_scan_file_patterns(rel_path, content))
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


_STALE_V1_MCP_COUNT_RE = re.compile(
    r"\b(?:12\s+(?:Tools|tools|herramientas)"
    r"|(?:[89]|1[01])\s+(?:Resources|resources|Recursos|recursos))\b"
)


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
        content = doc_path.read_text(encoding="utf-8")
        if _STALE_V1_MCP_COUNT_RE.search(content):
            errors.append(
                f"{rel_path}: detectado conteo MCP v1 obsoleto "
                f"(debe ser {counts.tools} Tools / {counts.resources} Resources)."
            )
    return errors


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
    return set(_NORMATIVE_ID_RE.findall(content)) | set(
        _BLUEPRINT_URI_RE.findall(content)
    )


_ES_LINK_OR_CODE_RE = re.compile(
    r"`[^`\n]+`|(?<!!)\[([^\]]*)\]\(([^)\n]+)\)"
)
_KNOWN_BILINGUAL_ES: frozenset[str] = frozenset(
    es_rel for _, es_rel in BILINGUAL_DOC_PAIRS
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


def _iter_es_md_links(es_text: str) -> list[tuple[int, str, str]]:
    masked = _mask_code_preserve_lines(es_text)
    items: list[tuple[int, str, str]] = []
    for line_no, line in enumerate(masked.splitlines(), 1):
        for match in _ES_LINK_OR_CODE_RE.finditer(line):
            raw_target = match.group(2)
            if raw_target:
                items.append((line_no, line, raw_target))
    return items


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


def _check_es_mirror_links(
    root: Path, es_rel: str, en_rel: str, es_text: str
) -> list[str]:
    root_resolved = root.resolve()
    es_path = (root_resolved / es_rel).resolve()
    en_resolved = (root_resolved / en_rel).resolve()
    errors: list[str] = []
    for item in _iter_es_md_links(es_text):
        err = _check_single_es_link(root_resolved, es_path, en_resolved, item)
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
    """Valida banner L1-10, H2/H3, IDs y enlaces ES→EN en pares EN/ES."""
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


_DEFAULT_REFACTORING_UI_TOPICS = frozenset(
    {
        "skill",
        "hierarchy",
        "layout",
        "type",
        "color",
        "depth",
        "images",
        "polish",
        "dark-mode",
        "tailwind",
    }
)
_REFACTORING_URI_RE = re.compile(r"blueprint://ui/refactoring-ui/([A-Za-z0-9_-]+)")


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


def check_internal_markdown_links(root: Path) -> list[str]:
    """Audita enlaces Markdown e imágenes internas en portadas, docs y .agents/."""
    seen: set[str] = set()
    targets: list[str] = []
    for rel_path in (
        *INTERNAL_LINK_AUDIT_TARGETS,
        *_collect_agent_markdown_targets(root),
    ):
        if rel_path not in seen:
            seen.add(rel_path)
            targets.append(rel_path)
    errors: list[str] = []
    for rel_path in targets:
        errors.extend(_validate_doc_links(root, rel_path))
    return errors


def _derive_refactoring_ui_topics(root: Path) -> frozenset[str]:
    refs_dir = root / ".agents" / "skills" / "refactoring-ui" / "references"
    if not refs_dir.is_dir():
        return _DEFAULT_REFACTORING_UI_TOPICS
    stems = {p.stem for p in refs_dir.glob("*.md") if p.is_file()}
    return frozenset({"skill", *stems}) if stems else _DEFAULT_REFACTORING_UI_TOPICS


def _scan_doc_refactoring_topics(
    root: Path, rel_path: str, valid_topics: frozenset[str]
) -> list[str]:
    doc = root / rel_path
    if not doc.is_file():
        return []
    content = doc.read_text(encoding="utf-8", errors="ignore")
    return [
        f"{rel_path}: tema inválido en "
        f"'blueprint://ui/refactoring-ui/{match.group(1)}'."
        for match in _REFACTORING_URI_RE.finditer(content)
        if match.group(1) not in valid_topics
    ]


def _check_refactoring_ui_topics(root: Path) -> list[str]:
    valid_topics = _derive_refactoring_ui_topics(root)
    targets = sorted(set((*DOC_TARGETS, *_collect_agent_markdown_targets(root))))
    errors: list[str] = []
    for rel_path in targets:
        if not _HISTORICAL_SPEC_RE.match(rel_path):
            errors.extend(_scan_doc_refactoring_topics(root, rel_path, valid_topics))
    return errors


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


def _validate_single_skill_entry(
    root: Path, rel_file: str, entry: Any, verify_digest: bool
) -> tuple[str | None, list[str]]:
    if not isinstance(entry, dict):
        return None, [f"{rel_file}: entrada de skill inválida."]
    sid = str(entry.get("id", ""))
    spath = str(entry.get("path", ""))
    full = root / spath
    if not spath or not full.is_file():
        return sid, [f"{rel_file}: ruta SKILL.md inexistente '{spath}'."]
    if verify_digest and (
        entry.get("sha256") != _sha256_file(full)
        or entry.get("size_bytes") != full.stat().st_size
    ):
        return sid, [f"{rel_file}: desfase SHA-256/size_bytes en '{spath}'."]
    return sid, []


def _check_skill_entries(
    root: Path,
    rel_file: str,
    skills_raw: Any,
    repo_skills: list[str],
    verify_digest: bool,
    expected_skills: int = EXPECTED_SKILLS_COUNT,
) -> list[str]:
    if not isinstance(skills_raw, list) or len(skills_raw) != expected_skills:
        count = len(skills_raw) if isinstance(skills_raw, list) else "invalid"
        return [
            (
                f"{rel_file}: se esperan {expected_skills} skills reales "
                f"(encontradas={count})."
            )
        ]
    errors: list[str] = []
    seen_ids: list[str] = []
    for entry in skills_raw:
        sid, item_errs = _validate_single_skill_entry(
            root, rel_file, entry, verify_digest
        )
        if sid is not None:
            seen_ids.append(sid)
        errors.extend(item_errs)
    if repo_skills and sorted(seen_ids) != repo_skills:
        errors.append(
            f"{rel_file}: desfase entre skills declaradas y .agents/skills/."
        )
    return errors


def _validate_qaskills_pack(
    root: Path,
    expected_ver: str | None,
    repo_skills: list[str],
    expected_skills: int,
) -> list[str]:
    rel = "catalogs/qaskills-pack.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."]
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    errors.extend(
        _check_skill_entries(
            root,
            rel,
            data.get("skills"),
            repo_skills,
            verify_digest=False,
            expected_skills=expected_skills,
        )
    )
    return errors


def _validate_manifest_capabilities(
    rel: str, caps: Any, counts: RepoExpectedCounts
) -> tuple[list[str], list[str], list[str]]:
    errors: list[str] = []
    tools = caps.get("tools") if isinstance(caps, dict) else None
    resources = caps.get("resources") if isinstance(caps, dict) else None
    tools_ok = (
        isinstance(caps, dict)
        and caps.get("tools_count") == counts.tools
        and isinstance(tools, list)
        and len(tools) == counts.tools
    )
    if not tools_ok:
        errors.append(
            f"{rel}: mcp_capabilities.tools debe listar exactamente "
            f"{counts.tools} tools."
        )
    res_ok = (
        isinstance(caps, dict)
        and caps.get("resources_count") == counts.resources
        and isinstance(resources, list)
        and len(resources) == counts.resources
    )
    if not res_ok:
        errors.append(
            f"{rel}: mcp_capabilities.resources debe listar exactamente "
            f"{counts.resources} resources."
        )
    tool_list = [str(t) for t in tools] if isinstance(tools, list) else []
    res_list = [str(r) for r in resources] if isinstance(resources, list) else []
    return errors, tool_list, res_list


def _validate_skillsllm_manifest(
    root: Path,
    expected_ver: str | None,
    repo_skills: list[str],
    counts: RepoExpectedCounts | None = None,
) -> tuple[list[str], list[str], list[str]]:
    resolved = counts or derive_expected_counts(root)
    rel = "catalogs/skillsllm-manifest.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."], [], []
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    cap_errs, tool_list, res_list = _validate_manifest_capabilities(
        rel, data.get("mcp_capabilities"), resolved
    )
    errors.extend(cap_errs)
    bps = data.get("blueprints")
    if not isinstance(bps, list) or len(bps) != resolved.blueprints:
        errors.append(f"{rel}: se esperan {resolved.blueprints} blueprints raíz.")
    errors.extend(
        _check_skill_entries(
            root,
            rel,
            data.get("skills"),
            repo_skills,
            verify_digest=True,
            expected_skills=resolved.skills,
        )
    )
    return errors, tool_list, res_list


def _validate_geo_surface(
    path: Path, label: str, tokens: list[str], kind: str
) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [tok for tok in tokens if tok not in text]
    if not missing:
        return []
    return [f"{label}: faltan {kind} ({', '.join(missing[:3])})."]


def _validate_root_manifest(root: Path, counts: RepoExpectedCounts) -> list[str]:
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        return []
    data, err = _load_json_strict(manifest_path)
    if err or data is None:
        return [f"manifest.json: JSON inválido ({err})."]
    stacks = data.get("stacks")
    if isinstance(stacks, dict) and len(stacks) == counts.blueprints:
        return []
    found = len(stacks) if isinstance(stacks, dict) else "invalid"
    return [
        (
            f"manifest.json: se esperan {counts.blueprints} stacks "
            f"(encontradas={found})."
        )
    ]


def check_global_catalogs_and_geo(root: Path) -> list[str]:
    """Valida llms.txt y catálogos globales contra conteos reales y SHA-256."""
    if not (root / "llms.txt").is_file() and not (root / "catalogs").is_dir():
        return []
    missing = [rel for rel in REQUIRED_CATALOG_FILES if not (root / rel).is_file()]
    if missing:
        return [f"Falta artefacto GEO/catálogo obligatorio: {rel}." for rel in missing]
    counts = derive_expected_counts(root)
    expected_ver = _expected_pkg_version(root)
    repo_skills = _extract_repo_skill_ids(root)
    errors = [
        *_validate_root_manifest(root, counts),
        *_validate_qaskills_pack(root, expected_ver, repo_skills, counts.skills),
    ]
    s_errors, tools, resources = _validate_skillsllm_manifest(
        root, expected_ver, repo_skills, counts
    )
    errors.extend(s_errors)
    skill_tokens = repo_skills or [
        "qa-11x-architect",
        "qa-11x-devsecops-hardener",
        "qa-11x-systematic-debugging",
        "qa-11x-screenplay-builder",
        "qa-11x-llm-evaluator",
        "qa-11x-vibe-rescue",
        "qa-11x-docker-certifier",
        "docker-trivy-keydb-hardening",
        "graphify-ast-navigator",
        "refactoring-ui",
        "tactical-patterns-11x",
    ]
    for rel in ("llms.txt", "catalogs/agenticskills-submission.md"):
        doc = root / rel
        errors.extend(_validate_geo_surface(doc, rel, skill_tokens, "skills"))
        errors.extend(_validate_geo_surface(doc, rel, tools, "tools MCP"))
        errors.extend(_validate_geo_surface(doc, rel, resources, "resources MCP"))
    return errors


def validate_repository_docs(root: Path) -> list[str]:
    """Ejecuta todas las validaciones documentales sobre el directorio raíz."""
    counts = derive_expected_counts(root)
    return [
        *check_cognitive_budgets(root),
        *check_security_section_numbering(root),
        *check_active_docs(root),
        *check_stale_surface_counts(root, counts),
        *check_dual_consumer_parity(root),
        *check_bilingual_readme_parity(root),
        *check_bilingual_pair_parity(root),
        *check_v2_mcp_surface_counts(root),
        *check_internal_markdown_links(root),
        *_check_refactoring_ui_topics(root),
        *check_global_catalogs_and_geo(root),
    ]


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validador de presupuesto cognitivo e invariantes documentales."
    )
    parser.add_argument("path", nargs="?", help="Ruta opcional del repositorio raíz")
    parser.add_argument("--workspace", help="Ruta explícita del workspace raíz")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    ns = _parse_args(argv)
    raw_target = ns.workspace or ns.path
    target_root = (
        Path(raw_target).resolve()
        if raw_target
        else Path(__file__).resolve().parent.parent.parent
    )
    if not target_root.is_dir():
        print(
            f"❌ [Docs Invariants] Workspace inválido o inexistente: {target_root}"
        )
        return 1
    errors = validate_repository_docs(target_root)
    if errors:
        print(
            "❌ [Docs Invariants] Se detectaron violaciones documentales o de "
            "presupuesto cognitivo:"
        )
        for err in errors:
            print(f"  - {err}")
        return 1
    print(
        "✔ [Docs Invariants] Presupuesto cognitivo (<20KB / <=40 líneas) e "
        "invariantes documentales verificados."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
