# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Configuración, constantes y utilidades base para verify_docs_invariants.py."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _common import reject_duplicate_json_keys  # noqa: E402


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
RULES_TOTAL_MAX_BYTES: int = int(_BUDGETS.RULES_TOTAL_MAX_BYTES)
REPO_AGENTS_MD_MAX_BYTES: int = int(_BUDGETS.REPO_AGENTS_MD_MAX_BYTES)
GLOBAL_CONNECTOR_MAX_BYTES: int = int(_BUDGETS.GLOBAL_CONNECTOR_MAX_BYTES)
PROJECT_CONNECTOR_MAX_BYTES: int = int(_BUDGETS.PROJECT_CONNECTOR_MAX_BYTES)

CONNECTOR_START_MARKER = "<!-- QA_11X_MCP_CONNECTOR_START -->"
CONNECTOR_END_MARKER = "<!-- QA_11X_MCP_CONNECTOR_END -->"

CANONICAL_GLOBAL_RULE_FILES: frozenset[str] = frozenset({
    "mandatory_qa_pyramid_and_doc_sync.md",
    "secure_development_and_testing_guidelines.md",
    "frontend_parity_and_closure.md",
    "continuous_agent_evolution.md",
    "anti_regression_and_side_effects_guardrail.md",
    "ground_truth_fixtures_and_negative_invariants.md",
    "active_task_and_planning_resilience.md",
    "git_closure_gate.md",
})

CANONICAL_GLOBAL_SKILL_DIRS: frozenset[str] = frozenset({
    "qa-11x-architect",
    "qa-11x-docker-certifier",
    "docker-trivy-keydb-hardening",
    "graphify-ast-navigator",
    "refactoring-ui",
    "qa-11x-devsecops-hardener",
    "qa-11x-systematic-debugging",
    "qa-11x-screenplay-builder",
    "qa-11x-llm-evaluator",
    "qa-11x-vibe-rescue",
    "tactical-patterns-11x",
    "qa-11x-reverse-specs",
})

CANONICAL_MCP_TOOLS: frozenset[str] = frozenset({
    "analyze_ecosystem_specs",
    "audit_security_stig_owasp",
    "audit_test_pyramid_gaps",
    "audit_vibe_prototype",
    "bootstrap_or_merge_11x",
    "certify_11x_gate",
    "clean_workspace_11x",
    "evaluate_agent_trajectory",
    "evaluate_release_gate",
    "fetch_blueprint_bundle",
    "init_or_append_agents_md",
    "inspect_ast_blast_radius",
    "inspect_project_config",
    "propose_skill_evolution_pr",
    "reconcile_agents_governance",
    "run_ephemeral_qa",
    "run_llm_red_team",
    "session_flight_recorder",
    "sync_enterprise_tms",
    "validate_calm_architecture",
})

MAX_SKILL_MD_BYTES = SKILL_MAX_BYTES
MAX_ARCHITECT_SKILL_BYTES = ARCHITECT_SKILL_MAX_BYTES
MAX_TACTICAL_SKILL_BYTES = TACTICAL_SKILL_MAX_BYTES
MAX_ACTIVE_TASK_LINES = ACTIVE_TASK_MAX_LINES
MAX_ACTIVE_TASK_RULE_LINES = ACTIVE_TASK_RULE_MAX_LINES

EXPECTED_SKILLS_COUNT = 12
EXPECTED_TOOLS_COUNT = 20
EXPECTED_RESOURCES_COUNT = 13
EXPECTED_BLUEPRINTS_COUNT = 10
EXPECTED_CALM_CONTROLS = 7
EXPECTED_REF_CONTROLS = 22
EXPECTED_SCANNER_RULES = 37

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
    (
        r"\bblueprint://calm\b",
        (
            "recurso inexistente 'blueprint://calm' "
            "(el recurso 13 es 'blueprint://skills/tactical-patterns-11x')"
        ),
    ),
    (
        r"\b(?:Tool|Herramienta)\s+19\s+`?audit_vibe_prototype`?\b",
        (
            "Tool 19 mal atribuida a 'audit_vibe_prototype' "
            "(debe ser 'session_flight_recorder')"
        ),
    ),
    (
        r"\b(?:Resource|Recurso)\s+13\s+`?blueprint://calm`?\b",
        (
            "Resource 13 mal atribuido a 'blueprint://calm' "
            "(debe ser 'blueprint://skills/tactical-patterns-11x')"
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

_IGNORED_SCAN_DIRS: frozenset[str] = frozenset(
    set(_BUDGETS.CANONICAL_IGNORED_DIRS) | {"htmlcov"}
)

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
    "AGENTS.md",
    "README.md",
    "README.es.md",
    "CHANGELOG.md",
    "CHANGELOG.es.md",
    "RESOURCES.md",
    "RESOURCES.es.md",
    ".agents/README.md",
    "mcp-server/README.md",
    "mcp-server/README.es.md",
    "mcp-server/CHANGELOG.md",
    "mcp-server/CHANGELOG.es.md",
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


def is_upstream_blueprints_repo(root: Path) -> bool:
    """Devuelve True solo dentro del monorepo origen qa-testing-blueprints (D5)."""
    return (
        (root / "scripts" / "generar-manifiesto.py").is_file()
        and (root / "manifest.json").is_file()
    )


def _reject_dup_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    return reject_duplicate_json_keys(pairs)


def _load_json_strict(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw, object_pairs_hook=_reject_dup_json_keys)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return None, str(exc)
    if not isinstance(data, dict):
        return None, "el documento JSON debe tener un objeto en la raíz"
    return data, None


def _collect_glob_docs(root: Path) -> list[str]:
    patterns = (
        "catalogs/*.md",
        ".agents/rules/*.md",
        ".agents/skills/*/SKILL.md",
        ".agents/skills/*/references/*.md",
    )
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


def _read_mcp_server_sources(root: Path) -> str:
    """Lee server.ts, index.ts y cualquier submódulo en mcp-server/src/server/*.ts."""
    mcp_src = root / "mcp-server" / "src"
    candidates = [mcp_src / "server.ts", mcp_src / "index.ts"]
    srv_dir = mcp_src / "server"
    if srv_dir.is_dir():
        candidates.extend(sorted(srv_dir.glob("*.ts")))
    return "\n".join(
        path.read_text(encoding="utf-8") for path in candidates if path.is_file()
    )


def _extract_auditor_rule_ids(auditor_ts: Path) -> list[str]:
    chunks = [auditor_ts.read_text(encoding="utf-8")]
    sub_dir = auditor_ts.parent / "security-auditor"
    if sub_dir.is_dir():
        chunks.extend(
            sub.read_text(encoding="utf-8")
            for sub in sorted(sub_dir.glob("*.ts"))
            if sub.is_file()
        )
    src = "\n".join(chunks)
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
