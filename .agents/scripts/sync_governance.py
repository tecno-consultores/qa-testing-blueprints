#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Sincronizador programático Zero-LLM de gobernanza QA-11X y manifest.json."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _budgets import (  # noqa: E402
    ACTIVE_TASK_MAX_LINES as ACTIVE_TASK_MAX_LINES,
)
from _budgets import (  # noqa: E402
    ACTIVE_TASK_RULE_MAX_LINES as ACTIVE_TASK_RULE_MAX_LINES,
)
from _budgets import (  # noqa: E402
    ARCHITECT_SKILL_MAX_BYTES as ARCHITECT_SKILL_MAX_BYTES,
)
from _budgets import (  # noqa: E402
    GLOBAL_CONNECTOR_MAX_BYTES as GLOBAL_CONNECTOR_MAX_BYTES,
)
from _budgets import (  # noqa: E402
    PROJECT_CONNECTOR_MAX_BYTES as PROJECT_CONNECTOR_MAX_BYTES,
)
from _budgets import (  # noqa: E402
    REPO_AGENTS_MD_MAX_BYTES as REPO_AGENTS_MD_MAX_BYTES,
)
from _budgets import SKILL_MAX_BYTES as SKILL_MAX_BYTES  # noqa: E402
from _budgets import (  # noqa: E402
    TACTICAL_SKILL_MAX_BYTES as TACTICAL_SKILL_MAX_BYTES,
)

SCHEMA_VERSION = "1.0.0"
DEFAULT_BLUEPRINT_VERSION = "3.5.0"
REPOSITORY = "tecno-consultores/qa-testing-blueprints"
DEFAULT_BRANCH = "main"
RAW_BASE_URL = f"https://raw.githubusercontent.com/{REPOSITORY}/{DEFAULT_BRANCH}"

STACK_METADATA: dict[str, dict[str, str]] = {
    "python": {
        "description": (
            "Standalone Python Libraries and CLIs "
            "(uv, Ruff CC <= 5, Mypy strict, Pytest >= 95%, Mutmut)"
        ),
        "readme": "python/README.md",
    },
    "fastapi": {
        "description": (
            "Async Python REST APIs "
            "(FastAPI + PostgreSQL 17 RLS + KeyDB + Alembic + Pact/k6)"
        ),
        "readme": "fastapi/README.md",
    },
    "node-backend": {
        "description": (
            "Node.js / TypeScript Backend Microservices "
            "(Express / Fastify + Vitest >= 95% + Pact/k6)"
        ),
        "readme": "node-backend/README.md",
    },
    "vue3": {
        "description": (
            "Vue 3 + TypeScript + Vite Frontend "
            "(Screenplay, Vitest >= 95%, Playwright, Axe-core, Lighthouse)"
        ),
        "readme": "vue3/README.md",
    },
    "react-frontend": {
        "description": (
            "React + TypeScript + Vite Frontend "
            "(Screenplay, RTL, Playwright, Axe-core, Lighthouse)"
        ),
        "readme": "react-frontend/README.md",
    },
    "bash-scripts": {
        "description": (
            "POSIX / Bash DevOps Automation Scripts "
            "(ShellCheck, shfmt, BATS-core, kcov >= 95%)"
        ),
        "readme": "bash-scripts/README.md",
    },
    "php": {
        "description": (
            "PHP 8.2-8.5 Backend APIs and Services "
            "(PHP-CS-Fixer, PHPStan Level Max, Psalm, PCOV >= 95%, "
            "Infection, Karate BDD)"
        ),
        "readme": "php/README.md",
    },
    "mobile-appium": {
        "description": (
            "Native & Hybrid Mobile QA "
            "(Appium 3 / WebdriverIO v9, MobileActor Screenplay for "
            "Android, iOS, Ionic, React Native)"
        ),
        "readme": "mobile-appium/README.md",
    },
    "ai-evals": {
        "description": (
            "Dual-Mode AI & Multimodal Evals "
            "(DeepEval, Promptfoo OWASP LLM Top 10, WebRTC voice latency, "
            "PDF/OCR Decimal)"
        ),
        "readme": "ai-evals/README.md",
    },
    "vibe-rescue": {
        "description": (
            "Vibe-to-Enterprise Hardening "
            "(audit_vibe_prototype.py, VIBE-SEC-001..QA-005, "
            "PostgreSQL 17 RLS/WORM template)"
        ),
        "readme": "vibe-rescue/README.md",
    },
}

COMMON_FILE_PATHS: tuple[str, ...] = (
    "lefthook.yml",
    "scripts/auditar-infra.sh",
    "scripts/auditar-pagespeed.sh",
    "scripts/verificar-secretos.sh",
    "scripts/actualizar-grafos-graphify.sh",
    "scripts/generar-sbom-cyclonedx.sh",
    ".trivy.yaml",
    "scripts/limpieza.sh",
    "instalar-hooks.sh",
)
EXCLUDED_LEGACY_COMMON_PATHS: frozenset[str] = frozenset(
    {".env.example", "scripts/publicar-mcp.sh", "scripts/probar-mcp-example.sh"}
)

IGNORED_STACK_NAMES = frozenset({"README.md", "README.es.md", "changelog", ".DS_Store"})
IGNORED_STACK_DIRS = frozenset(
    {
        ".git",
        ".pytest_cache",
        "__pycache__",
        ".venv",
        "venv",
        ".tox",
        ".nox",
        "mutants",
        ".mutmut-cache",
        "node_modules",
        "dist",
        "graphify-out",
    }
)

_EXACT_STACK_EXAMPLES: dict[str, tuple[str, str]] = {
    "gitignore.example": (".gitignore", "append_missing_lines"),
    "npmrc.example": (".npmrc", "append_missing_lines"),
    "docker-compose.qa.yml": (
        "docker-compose.qa.yml",
        "copy_if_missing_or_update_qa",
    ),
    "docker-compose.qa.yml.example": (
        "docker-compose.qa.yml",
        "copy_if_missing_or_update_qa",
    ),
}

_SPECIAL_SKILL_LIMITS: dict[str, int] = {
    "tactical-patterns-11x": TACTICAL_SKILL_MAX_BYTES,
    "qa-11x-architect": ARCHITECT_SKILL_MAX_BYTES,
}


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Rechaza objetos JSON con claves duplicadas."""
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError(
                f"Clave JSON duplicada detectada en manifest.json: {key!r}"
            )
        obj[key] = value
    return obj


def load_manifest_strict(manifest_path: Path) -> dict[str, Any]:
    """Lee y valida manifest.json asegurando sintaxis JSON y cero claves duplicadas."""
    raw = manifest_path.read_text(encoding="utf-8")
    data = json.loads(raw, object_pairs_hook=_reject_duplicate_keys)
    if not isinstance(data, dict):
        raise TypeError("manifest.json debe contener un objeto JSON en la raíz.")
    return data


def compute_sha256(filepath: Path) -> str:
    """Calcula el hash SHA-256 en streaming por bloques de 64 KB."""
    hasher = hashlib.sha256()
    with filepath.open("rb") as handle:
        while chunk := handle.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def build_file_entry(
    filepath: Path, rel_path: str, target_name: str, merge_strategy: str
) -> dict[str, Any]:
    """Construye un descriptor compatible con el esquema de manifest.json."""
    return {
        "path": rel_path,
        "target_name": target_name,
        "merge_strategy": merge_strategy,
        "sha256": compute_sha256(filepath),
        "size_bytes": filepath.stat().st_size,
    }


def _version_from_package_json(pkg_path: Path) -> str | None:
    if not pkg_path.is_file():
        return None
    try:
        pkg_data = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return None
    if isinstance(pkg_data, dict):
        version = str(pkg_data.get("version", "")).strip()
        if re.match(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$", version):
            return version
    return None


def _version_from_changelog(changelog_path: Path) -> str | None:
    if not changelog_path.is_file():
        return None
    try:
        content = changelog_path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(
        r"##\s*\[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]", content
    )
    return match.group(1) if match else None


def get_blueprint_version(
    repo_root: Path, fallback: str = DEFAULT_BLUEPRINT_VERSION
) -> str:
    """Obtiene la versión semántica desde mcp-server/package.json o CHANGELOG.md."""
    pkg_version = _version_from_package_json(repo_root / "mcp-server" / "package.json")
    if pkg_version is not None:
        return pkg_version
    changelog_version = _version_from_changelog(repo_root / "CHANGELOG.md")
    return changelog_version if changelog_version is not None else fallback


def _classify_example_file(
    parent_posix: str, parent_prefix: str, filename: str
) -> tuple[str, str]:
    unwrapped = filename[: -len(".example")]
    target_name = f"{parent_prefix}{unwrapped}"
    copy_prefixes = ("test", "e2e", "nginx", "initdb")
    copy_suffixes = (".unit.py", ".spec.ts", ".e2e.ts", ".conf", ".sql")
    copy_exact = ("mutmut_gates.py", "zap.yaml")
    if (
        parent_posix.startswith(copy_prefixes)
        or unwrapped.endswith(copy_suffixes)
        or unwrapped in copy_exact
    ):
        return target_name, "copy_if_missing"
    return target_name, "surgical_merge"


def _classify_regular_stack_file(
    path_str: str, parent_posix: str, filename: str
) -> tuple[str, str]:
    is_test_template = (
        parent_posix.startswith(("test", "e2e"))
        or filename.startswith("test_")
        or filename.endswith(
            (".feature", ".bats", ".e2e.ts", ".spec.ts", "_test.py", ".unit.py")
        )
    )
    if is_test_template:
        return path_str, "copy_if_missing"
    if filename.startswith("_") and filename.endswith(".py"):
        return path_str, "copy_or_overwrite"
    if filename.endswith((".sh", ".py")):
        return path_str, "overwrite_executable"
    return path_str, "copy_if_missing"


def classify_stack_file(rel_path_in_stack: Path) -> tuple[str, str]:
    """Clasifica un archivo de stack en (target_name, merge_strategy)."""
    path_str = rel_path_in_stack.as_posix()
    filename = rel_path_in_stack.name
    parent_posix = rel_path_in_stack.parent.as_posix()
    parent_prefix = f"{parent_posix}/" if parent_posix != "." else ""

    exact = _EXACT_STACK_EXAMPLES.get(filename)
    if exact is not None:
        return f"{parent_prefix}{exact[0]}", exact[1]
    if filename.endswith(".example"):
        return _classify_example_file(parent_posix, parent_prefix, filename)
    return _classify_regular_stack_file(path_str, parent_posix, filename)


def classify_common_file(rel_path: str) -> tuple[str, str]:
    """Clasifica un archivo común en (target_name, merge_strategy)."""
    filename = Path(rel_path).name
    if filename in (".trivy.yaml", ".env.example", "instalar-hooks.sh", "lefthook.yml"):
        return rel_path, "copy_if_missing"
    if filename.endswith(".sh"):
        return rel_path, "overwrite_executable"
    return rel_path, "surgical_merge"


def classify_governance_file(rel_path: str) -> tuple[str, str]:
    """Clasifica un archivo de gobernanza en (target_name, merge_strategy)."""
    path_obj = Path(rel_path)
    if path_obj.name == "ACTIVE_TASK.md.example":
        return ".agents/ACTIVE_TASK.md", "copy_if_missing"
    if rel_path == ".agents/README.md":
        return rel_path, "copy_if_missing"
    exact_strategies = {
        "_budgets.py": "copy_or_overwrite",
        "AGENTS.md": "surgical_merge",
    }
    if path_obj.name in exact_strategies:
        return rel_path, exact_strategies[path_obj.name]
    exec_suffixes = {".sh": "overwrite_executable", ".py": "overwrite_executable"}
    return rel_path, exec_suffixes.get(path_obj.suffix, "copy_or_overwrite")


def _should_ignore_stack_item(item: Path, rel_in_stack: Path) -> bool:
    if not item.is_file():
        return True
    if any(part in IGNORED_STACK_DIRS for part in rel_in_stack.parts):
        return True
    return item.name in IGNORED_STACK_NAMES


def scan_stack(
    repo_root: Path, stack_name: str, stack_dir: Path | None = None
) -> list[dict[str, Any]]:
    """Escanea recursivamente los archivos rastreados dentro de un stack."""
    resolved_dir = stack_dir if stack_dir is not None else repo_root / stack_name
    if not resolved_dir.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for item in sorted(resolved_dir.rglob("*")):
        rel_in_stack = item.relative_to(resolved_dir)
        if _should_ignore_stack_item(item, rel_in_stack):
            continue
        target_name, merge_strategy = classify_stack_file(rel_in_stack)
        full_rel_path = f"{stack_name}/{rel_in_stack.as_posix()}"
        entries.append(
            build_file_entry(item, full_rel_path, target_name, merge_strategy)
        )
    entries.sort(key=lambda entry: str(entry["path"]))
    return entries


def _preserve_or_classify_existing(
    existing_entries: list[dict[str, Any]],
) -> dict[str, tuple[str, str]]:
    """Extrae (target_name, merge_strategy) previos por ruta."""
    preserved: dict[str, tuple[str, str]] = {}
    for entry in existing_entries:
        rel = entry.get("path")
        if isinstance(rel, str):
            target = str(entry.get("target_name") or rel)
            strategy = str(entry.get("merge_strategy") or "copy_or_overwrite")
            preserved[rel] = (target, strategy)
    return preserved


def scan_common_files(
    repo_root: Path, existing_entries: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Escanea archivos comunes canónicos y rutas comunes heredadas existentes."""
    preserved = _preserve_or_classify_existing(existing_entries or [])
    ordered_paths = sorted(
        (set(COMMON_FILE_PATHS) | set(preserved.keys()))
        - EXCLUDED_LEGACY_COMMON_PATHS
    )
    entries: list[dict[str, Any]] = []
    for rel_path in ordered_paths:
        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue
        if rel_path in COMMON_FILE_PATHS:
            target_name, merge_strategy = classify_common_file(rel_path)
        else:
            target_name, merge_strategy = preserved[rel_path]
        entries.append(
            build_file_entry(full_path, rel_path, target_name, merge_strategy)
        )
    entries.sort(key=lambda entry: str(entry["path"]))
    return entries


def _discover_catalog_paths(repo_root: Path) -> list[Path]:
    """Descubre descriptores globales en catalogs/ cuando existen."""
    catalogs_dir = repo_root / "catalogs"
    if not catalogs_dir.is_dir():
        return []
    return [
        p
        for p in sorted(catalogs_dir.glob("*"))
        if p.is_file() and p.suffix in (".json", ".md")
    ]


def _discover_schema_paths(repo_root: Path) -> list[Path]:
    """Descubre esquemas JSON en .agents/schemas/ cuando existen."""
    schemas_dir = repo_root / ".agents" / "schemas"
    if not schemas_dir.is_dir():
        return []
    return [p for p in sorted(schemas_dir.glob("*.json")) if p.is_file()]


def _discover_root_governance_paths(repo_root: Path) -> list[Path]:
    candidates: list[Path] = []
    for rel in (
        "AGENTS.md",
        "AI_MASTER_PROMPT.md",
        "AI_MASTER_PROMPT.es.md",
        "SECURITY.md",
        "SECURITY.es.md",
        "llms.txt",
        ".agents/README.md",
        ".agents/ACTIVE_TASK.md.example",
        "scripts/install-skill.sh",
    ):
        candidate = repo_root / rel
        if candidate.is_file():
            candidates.append(candidate)
    return candidates


def _discover_agent_subdir_paths(repo_root: Path) -> list[Path]:
    candidates: list[Path] = []
    rules_dir = repo_root / ".agents" / "rules"
    if rules_dir.is_dir():
        candidates.extend(p for p in sorted(rules_dir.glob("*.md")) if p.is_file())
    scripts_dir = repo_root / ".agents" / "scripts"
    if scripts_dir.is_dir():
        candidates.extend(
            p
            for p in sorted(scripts_dir.glob("*"))
            if p.is_file() and p.suffix in (".sh", ".py")
        )
    skills_dir = repo_root / ".agents" / "skills"
    if skills_dir.is_dir():
        candidates.extend(p for p in sorted(skills_dir.rglob("*.md")) if p.is_file())
    return candidates


def _discover_governance_paths(repo_root: Path) -> list[str]:
    """Descubre archivos canónicos de gobernanza en directorios gobernados."""
    candidates = [
        *_discover_root_governance_paths(repo_root),
        *_discover_catalog_paths(repo_root),
        *_discover_schema_paths(repo_root),
        *_discover_agent_subdir_paths(repo_root),
    ]
    return [p.relative_to(repo_root).as_posix() for p in candidates]


def scan_agent_governance_files(
    repo_root: Path, existing_entries: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Escanea artefactos de gobernanza canónicos y preserva rutas previas."""
    preserved = _preserve_or_classify_existing(existing_entries or [])
    discovered = set(_discover_governance_paths(repo_root))
    all_paths = sorted(discovered | set(preserved.keys()))
    entries: list[dict[str, Any]] = []
    for rel_path in all_paths:
        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue
        if rel_path in discovered:
            target_name, merge_strategy = classify_governance_file(rel_path)
        else:
            target_name, merge_strategy = preserved[rel_path]
        entries.append(
            build_file_entry(full_path, rel_path, target_name, merge_strategy)
        )
    entries.sort(key=lambda entry: str(entry["path"]))
    return entries


def _rebuild_missing_stack_files(
    repo_root: Path, stack_data: dict[str, Any]
) -> list[dict[str, Any]]:
    prev_files = stack_data.get("files", [])
    if not isinstance(prev_files, list):
        return []
    files: list[dict[str, Any]] = []
    for entry in prev_files:
        if not isinstance(entry, dict):
            continue
        rel = entry.get("path")
        if isinstance(rel, str) and (repo_root / rel).is_file():
            files.append(
                build_file_entry(
                    repo_root / rel,
                    rel,
                    str(entry.get("target_name") or rel),
                    str(entry.get("merge_strategy") or "copy_if_missing"),
                )
            )
    files.sort(key=lambda entry: str(entry["path"]))
    return files


def _attach_stack_readme_hashes(
    repo_root: Path, stack_entry: dict[str, Any], readme: str
) -> None:
    readme_es = f"{readme[:-3]}.es.md" if readme.endswith(".md") else f"{readme}.es.md"
    readme_path = repo_root / readme
    if readme_path.is_file():
        stack_entry["readme_sha256"] = compute_sha256(readme_path)
    readme_es_path = repo_root / readme_es
    if readme_es_path.is_file():
        stack_entry["readme_es"] = readme_es
        stack_entry["readme_es_sha256"] = compute_sha256(readme_es_path)


def _build_single_stack_entry(
    repo_root: Path, stack_name: str, existing_stacks: dict[str, Any]
) -> dict[str, Any]:
    stack_dir = repo_root / stack_name
    raw_prev = existing_stacks.get(stack_name, {})
    prev_dict = raw_prev if isinstance(raw_prev, dict) else {}
    meta = STACK_METADATA.get(stack_name) or prev_dict
    readme = str(meta.get("readme", f"{stack_name}/README.md"))
    files = (
        scan_stack(repo_root, stack_name)
        if stack_dir.is_dir()
        else _rebuild_missing_stack_files(repo_root, prev_dict)
    )
    stack_entry: dict[str, Any] = {
        "description": str(meta.get("description", "")),
        "readme": readme,
    }
    _attach_stack_readme_hashes(repo_root, stack_entry, readme)
    stack_entry["files"] = files
    return stack_entry


def _build_stacks_dict(
    repo_root: Path, existing_manifest: dict[str, Any]
) -> dict[str, Any]:
    """Construye la sección stacks respetando metadata existente o estándar."""
    existing_stacks_raw = existing_manifest.get("stacks", {})
    existing_stacks = (
        existing_stacks_raw if isinstance(existing_stacks_raw, dict) else {}
    )
    stack_names = sorted(STACK_METADATA.keys())
    stacks_dict: dict[str, Any] = {}
    for stack_name in stack_names:
        if not (repo_root / stack_name).is_dir() and stack_name not in existing_stacks:
            continue
        stacks_dict[stack_name] = _build_single_stack_entry(
            repo_root, stack_name, existing_stacks
        )
    return stacks_dict


def build_expected_manifest(
    repo_root: Path, existing_manifest: dict[str, Any], generated_at_utc: str
) -> dict[str, Any]:
    """Construye el manifiesto esperado manteniendo el esquema exacto."""
    existing_common = existing_manifest.get("common_files", [])
    existing_gov = existing_manifest.get("agent_governance_files", [])
    common_list = existing_common if isinstance(existing_common, list) else []
    gov_list = existing_gov if isinstance(existing_gov, list) else []

    fallback_version = str(
        existing_manifest.get("blueprint_version") or DEFAULT_BLUEPRINT_VERSION
    )
    blueprint_version = get_blueprint_version(repo_root, fallback=fallback_version)

    return {
        "schema_version": str(
            existing_manifest.get("schema_version") or SCHEMA_VERSION
        ),
        "blueprint_version": blueprint_version,
        "generated_at_utc": generated_at_utc,
        "repository": str(existing_manifest.get("repository") or REPOSITORY),
        "default_branch": str(
            existing_manifest.get("default_branch") or DEFAULT_BRANCH
        ),
        "raw_base_url": str(existing_manifest.get("raw_base_url") or RAW_BASE_URL),
        "stacks": _build_stacks_dict(repo_root, existing_manifest),
        "common_files": scan_common_files(repo_root, common_list),
        "agent_governance_files": scan_agent_governance_files(repo_root, gov_list),
    }


def _compare_single_file_entry(
    section_name: str,
    rel_path: str,
    exp: dict[str, Any],
    act: dict[str, Any],
) -> list[str]:
    diffs: list[str] = []
    if exp.get("sha256") != act.get("sha256"):
        diffs.append(
            f"[{section_name}] Hash SHA-256 discrepante en {rel_path}: "
            f"manifest {exp.get('sha256')} != disco {act.get('sha256')}"
        )
    if exp.get("size_bytes") != act.get("size_bytes"):
        diffs.append(
            f"[{section_name}] size_bytes discrepante en {rel_path}: "
            f"manifest {exp.get('size_bytes')} != disco {act.get('size_bytes')}"
        )
    if exp.get("target_name") != act.get("target_name"):
        diffs.append(
            f"[{section_name}] target_name discrepante en {rel_path}: "
            f"'{exp.get('target_name')}' != '{act.get('target_name')}'"
        )
    if exp.get("merge_strategy") != act.get("merge_strategy"):
        diffs.append(
            f"[{section_name}] merge_strategy discrepante en {rel_path}: "
            f"'{exp.get('merge_strategy')}' != '{act.get('merge_strategy')}'"
        )
    return diffs


def compare_file_lists(
    section_name: str,
    expected_list: list[dict[str, Any]],
    actual_list: list[dict[str, Any]],
) -> list[str]:
    """Compara dos listas de descriptores por ruta, SHA-256, tamaño y estrategia."""
    diffs: list[str] = []
    expected_map = {
        str(item["path"]): item
        for item in expected_list
        if isinstance(item, dict) and "path" in item
    }
    actual_map = {
        str(item["path"]): item
        for item in actual_list
        if isinstance(item, dict) and "path" in item
    }

    for rel_path in sorted(set(expected_map.keys()) | set(actual_map.keys())):
        if rel_path not in expected_map:
            diffs.append(
                f"[{section_name}] Archivo faltante en manifest.json: {rel_path}"
            )
        elif rel_path not in actual_map:
            diffs.append(
                f"[{section_name}] Archivo listado en manifest.json pero "
                f"ausente en disco: {rel_path}"
            )
        else:
            diffs.extend(
                _compare_single_file_entry(
                    section_name, rel_path, expected_map[rel_path], actual_map[rel_path]
                )
            )
    return diffs


def _compare_root_metadata(
    existing_manifest: dict[str, Any], actual_manifest: dict[str, Any]
) -> list[str]:
    diffs: list[str] = []
    for field in (
        "schema_version",
        "blueprint_version",
        "repository",
        "default_branch",
        "raw_base_url",
    ):
        exp_val = existing_manifest.get(field)
        act_val = actual_manifest.get(field)
        if exp_val != act_val:
            diffs.append(
                f"Metadato raíz '{field}' discrepante: "
                f"manifest '{exp_val}' != actual '{act_val}'"
            )
    return diffs


def _compare_single_stack_entry(
    stack_name: str, exp_stack: Any, act_stack: dict[str, Any]
) -> list[str]:
    if not isinstance(exp_stack, dict):
        return [f"Stack '{stack_name}' inválido en manifest.json."]
    diffs: list[str] = []
    for field, label in (
        ("description", "Descripción"),
        ("readme", "Readme"),
        ("readme_sha256", "SHA-256 de readme"),
        ("readme_es", "Readme ES"),
        ("readme_es_sha256", "SHA-256 de readme_es"),
    ):
        if exp_stack.get(field) != act_stack.get(field):
            diffs.append(f"{label} discrepante en stack {stack_name}")
    exp_files = exp_stack.get("files", [])
    diffs.extend(
        compare_file_lists(
            f"stack:{stack_name}",
            exp_files if isinstance(exp_files, list) else [],
            act_stack.get("files", []),
        )
    )
    return diffs


def _compare_stacks_section(
    existing_manifest: dict[str, Any], actual_manifest: dict[str, Any]
) -> list[str]:
    existing_stacks = existing_manifest.get("stacks", {})
    actual_stacks = actual_manifest.get("stacks", {})
    if not isinstance(existing_stacks, dict):
        return ["La sección 'stacks' en manifest.json no es un objeto válido."]
    diffs: list[str] = []
    for stack_name in sorted(set(existing_stacks.keys()) | set(actual_stacks.keys())):
        if stack_name not in existing_stacks:
            diffs.append(f"Stack faltante en manifest.json: {stack_name}")
        elif stack_name not in actual_stacks:
            diffs.append(f"Stack inexistente listado en manifest.json: {stack_name}")
        else:
            diffs.extend(
                _compare_single_stack_entry(
                    stack_name,
                    existing_stacks[stack_name],
                    actual_stacks[stack_name],
                )
            )
    return diffs


def compare_manifests(
    existing_manifest: dict[str, Any], actual_manifest: dict[str, Any]
) -> list[str]:
    """Compara dos diccionarios de manifiesto ignorando diferencias de timestamp."""
    diffs = _compare_root_metadata(existing_manifest, actual_manifest)
    diffs.extend(_compare_stacks_section(existing_manifest, actual_manifest))
    exp_common = existing_manifest.get("common_files", [])
    diffs.extend(
        compare_file_lists(
            "common_files",
            exp_common if isinstance(exp_common, list) else [],
            actual_manifest.get("common_files", []),
        )
    )
    exp_gov = existing_manifest.get("agent_governance_files", [])
    diffs.extend(
        compare_file_lists(
            "agent_governance_files",
            exp_gov if isinstance(exp_gov, list) else [],
            actual_manifest.get("agent_governance_files", []),
        )
    )
    return diffs


def _check_skill_budget_entry(repo_root: Path, skill_md: Path) -> str | None:
    size = skill_md.stat().st_size
    rel = skill_md.relative_to(repo_root).as_posix()
    special_limit = _SPECIAL_SKILL_LIMITS.get(skill_md.parent.name)
    if special_limit is not None:
        if size > special_limit:
            return (
                f"{rel} excede el presupuesto cognitivo "
                f"({size} > {special_limit} bytes)."
            )
        return None
    if size >= SKILL_MAX_BYTES:
        return (
            f"{rel} excede el presupuesto cognitivo "
            f"({size} >= {SKILL_MAX_BYTES} bytes)."
        )
    return None


def _check_line_limit(repo_root: Path, rel: str, max_lines: int) -> str | None:
    candidate = repo_root / rel
    if not candidate.is_file():
        return None
    line_count = len(candidate.read_text(encoding="utf-8").splitlines())
    if line_count > max_lines:
        return f"{rel} excede el límite compacto ({line_count} > {max_lines} líneas)."
    return None


def _collect_skill_budget_errors(repo_root: Path) -> list[str]:
    skills_dir = repo_root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    errors: list[str] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        if not skill_md.is_file():
            continue
        err = _check_skill_budget_entry(repo_root, skill_md)
        if err:
            errors.append(err)
    return errors


def _collect_line_limit_errors(repo_root: Path) -> list[str]:
    errors: list[str] = []
    for rel, limit in (
        (".agents/ACTIVE_TASK.md", ACTIVE_TASK_MAX_LINES),
        (".agents/ACTIVE_TASK.md.example", ACTIVE_TASK_MAX_LINES),
        (
            ".agents/rules/active_task_and_planning_resilience.md",
            ACTIVE_TASK_RULE_MAX_LINES,
        ),
    ):
        err = _check_line_limit(repo_root, rel, limit)
        if err:
            errors.append(err)
    return errors


def _check_upstream_agents_md_budget(repo_root: Path) -> str | None:
    is_upstream = (repo_root / "scripts" / "generar-manifiesto.py").is_file() and (
        repo_root / "manifest.json"
    ).is_file()
    if not is_upstream:
        return None
    agents_md = repo_root / "AGENTS.md"
    if not agents_md.is_file():
        return None
    size = agents_md.stat().st_size
    if size > REPO_AGENTS_MD_MAX_BYTES:
        return (
            f"AGENTS.md excede el presupuesto cognitivo raíz "
            f"({size} > {REPO_AGENTS_MD_MAX_BYTES} bytes)."
        )
    return None


def validate_cognitive_budgets(repo_root: Path) -> list[str]:
    """Valida SKILL.md (<20KB / <=12KB / <=2.5KB), AGENTS.md raíz y líneas."""
    agents_err = _check_upstream_agents_md_budget(repo_root)
    return [
        *_collect_skill_budget_errors(repo_root),
        *_collect_line_limit_errors(repo_root),
        *([agents_err] if agents_err else []),
    ]


def count_artifacts(manifest_data: dict[str, Any]) -> int:
    """Cuenta el total de artefactos SHA-256 indexados en el manifiesto."""
    stacks = manifest_data.get("stacks", {})
    stack_total = 0
    if isinstance(stacks, dict):
        for stack_obj in stacks.values():
            if isinstance(stack_obj, dict) and isinstance(stack_obj.get("files"), list):
                stack_total += len(stack_obj["files"])
    common_total = (
        len(manifest_data.get("common_files", []))
        if isinstance(manifest_data.get("common_files"), list)
        else 0
    )
    gov_total = (
        len(manifest_data.get("agent_governance_files", []))
        if isinstance(manifest_data.get("agent_governance_files"), list)
        else 0
    )
    return stack_total + common_total + gov_total


def _is_ignored_git_path(path: str) -> bool:
    """Indica si una ruta modificada se ignora al evaluar cambios estructurales."""
    return (
        not path
        or path.endswith(".md")
        or "graphify-out/" in path
        or path == "graphify-out"
    )


def _extract_porcelain_z_paths(raw_stdout: bytes) -> list[str]:
    """Extrae rutas (y origen en R/C) desde `git status --porcelain=v1 -z`."""
    tokens = raw_stdout.decode("utf-8", errors="replace").split("\0")
    paths: list[str] = []
    idx = 0
    while idx < len(tokens):
        entry = tokens[idx]
        idx += 1
        if len(entry) < 4:
            continue
        paths.append(entry[3:])
        if entry[0] in ("R", "C") and idx < len(tokens):
            paths.append(tokens[idx])
            idx += 1
    return paths


def has_structural_git_changes(repo_root: Path) -> bool:
    """Detecta cambios de código/configuración fuera de *.md y graphify-out."""
    if not (repo_root / ".git").exists():
        return False
    try:
        res = subprocess.run(
            ["git", "-C", str(repo_root), "status", "--porcelain=v1", "-z"],
            capture_output=True,
            text=False,
            check=False,
            timeout=15,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    if res.returncode != 0:
        return False
    return any(
        not _is_ignored_git_path(path)
        for path in _extract_porcelain_z_paths(res.stdout)
    )


def refresh_ast_if_needed(repo_root: Path, manifest_changed: bool) -> list[str]:
    """Ejecuta incrementalmente ./scripts/actualizar-grafos-graphify.sh si aplica."""
    ast_script = repo_root / "scripts" / "actualizar-grafos-graphify.sh"
    if not ast_script.is_file():
        return []
    if not manifest_changed and not has_structural_git_changes(repo_root):
        return []
    try:
        res = subprocess.run(
            [str(ast_script)],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        return [
            f"Tiempo de espera agotado al actualizar grafos AST ({ast_script.name})."
        ]
    if res.returncode != 0:
        detail = (res.stderr or res.stdout).strip() or f"exit code {res.returncode}"
        return [f"Fallo al actualizar grafos AST ({ast_script.name}): {detail}"]
    return []


def _collect_yaml_block_text(lines: list[str], start_idx: int) -> str:
    parts: list[str] = []
    for raw in lines[start_idx:]:
        stripped = raw.strip()
        if stripped and not raw[0].isspace():
            break
        if stripped:
            parts.append(stripped)
    return " ".join(parts)


def _strip_yaml_quotes(val: str) -> str:
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
        return val[1:-1].strip()
    return val


def _read_frontmatter_lines(skill_file: Path) -> list[str] | None:
    try:
        lines = skill_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != "---":
        return None
    fm_lines: list[str] = []
    for raw in lines[1:]:
        if raw.strip() == "---":
            return fm_lines
        fm_lines.append(raw)
    return None


def _parse_description_field(fm_lines: list[str], idx: int, rest: str) -> str | None:
    if not rest or rest in (">-", ">", "|-", "|"):
        return _collect_yaml_block_text(fm_lines, idx + 1) or None
    return _strip_yaml_quotes(rest) or None


def _extract_skill_description(skill_file: Path) -> str | None:
    fm_lines = _read_frontmatter_lines(skill_file)
    if fm_lines is None:
        return None
    for idx, raw in enumerate(fm_lines):
        if raw.startswith("description:"):
            return _parse_description_field(
                fm_lines, idx, raw[len("description:") :].strip()
            )
    return None


def _build_skill_catalog_updates(
    skill_file: Path, *, sync_hashes: bool
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if sync_hashes:
        updates["size_bytes"] = skill_file.stat().st_size
        updates["sha256"] = compute_sha256(skill_file)
    fm_desc = _extract_skill_description(skill_file)
    if fm_desc is not None:
        updates["description"] = fm_desc
    return updates


def _sync_single_skill_entry(
    repo_root: Path,
    entry: dict[str, Any],
    *,
    catalog_rel: str = "catalogs/skillsllm-manifest.json",
    sync_hashes: bool = True,
    check_only: bool = False,
) -> tuple[bool, str | None]:
    rel_skill = entry.get("path")
    skill_file = (
        repo_root / rel_skill if isinstance(rel_skill, str) and rel_skill else None
    )
    if skill_file is None or not skill_file.is_file():
        return False, None
    updates = _build_skill_catalog_updates(skill_file, sync_hashes=sync_hashes)
    if not any(entry.get(key) != val for key, val in updates.items()):
        return False, None
    if check_only:
        return False, f"{catalog_rel} desincronizado en '{rel_skill}'."
    entry.update(updates)
    return True, None


def _collect_skill_catalog_updates(
    repo_root: Path,
    skills: list[Any],
    *,
    catalog_rel: str,
    sync_hashes: bool,
    check_only: bool,
) -> tuple[bool, list[str]]:
    errors: list[str] = []
    dirty = False
    for entry in skills:
        if isinstance(entry, dict):
            changed, err = _sync_single_skill_entry(
                repo_root,
                entry,
                catalog_rel=catalog_rel,
                sync_hashes=sync_hashes,
                check_only=check_only,
            )
            dirty = dirty or changed
            if err:
                errors.append(err)
    return dirty, errors


def _sync_skill_catalog(
    repo_root: Path,
    catalog_rel: str,
    *,
    sync_hashes: bool,
    check_only: bool,
) -> list[str]:
    catalog_path = repo_root / catalog_rel
    if not catalog_path.is_file():
        return []
    try:
        data = load_manifest_strict(catalog_path)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        return [f"Error al validar {catalog_rel}: {exc}"]
    raw_skills = data.get("skills")
    skills = raw_skills if isinstance(raw_skills, list) else []
    dirty, errors = _collect_skill_catalog_updates(
        repo_root,
        skills,
        catalog_rel=catalog_rel,
        sync_hashes=sync_hashes,
        check_only=check_only,
    )
    if dirty and not check_only:
        catalog_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return errors


def sync_skillsllm_catalog(repo_root: Path, check_only: bool) -> list[str]:
    """Sincroniza o verifica size_bytes, sha256 y description en skillsllm-manifest."""
    return _sync_skill_catalog(
        repo_root,
        "catalogs/skillsllm-manifest.json",
        sync_hashes=True,
        check_only=check_only,
    )


def sync_skill_catalogs(repo_root: Path, check_only: bool) -> list[str]:
    """Sincroniza description YAML frontmatter en qaskills-pack y skillsllm-manifest."""
    return [
        *sync_skillsllm_catalog(repo_root, check_only),
        *_sync_skill_catalog(
            repo_root,
            "catalogs/qaskills-pack.json",
            sync_hashes=False,
            check_only=check_only,
        ),
    ]


def _load_existing_manifest(
    manifest_path: Path, check_only: bool
) -> tuple[dict[str, Any], str, list[str]]:
    if not manifest_path.is_file():
        errs = (
            [f"El archivo manifest.json no existe en {manifest_path.parent}"]
            if check_only
            else []
        )
        return {}, "", errs
    try:
        existing_raw = manifest_path.read_text(encoding="utf-8")
        existing_manifest = load_manifest_strict(manifest_path)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        return {}, "", [f"Error al validar manifest.json: {exc}"]
    return existing_manifest, existing_raw, []


def _format_sync_ok_message(total: int) -> str:
    return (
        f"✅ [sync-governance] manifest.json sincronizado ({total} artefactos "
        "SHA-256), SKILL.md <20KB y ACTIVE_TASK <=40L OK"
    )


def _apply_manifest_write(
    manifest_path: Path,
    existing_raw: str,
    candidate: dict[str, Any],
    diffs: list[str],
) -> tuple[dict[str, Any], bool]:
    serialized_candidate = json.dumps(candidate, indent=2, ensure_ascii=False) + "\n"
    if not diffs and serialized_candidate == existing_raw:
        return candidate, False
    updated = (
        {
            **candidate,
            "generated_at_utc": datetime.datetime.now(datetime.UTC).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
        }
        if diffs or not existing_raw
        else candidate
    )
    updated_raw = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    manifest_path.write_text(updated_raw, encoding="utf-8")
    return updated, True


def _format_check_only_result(
    diffs: list[str], candidate: dict[str, Any]
) -> tuple[int, str]:
    if diffs:
        details = "\n".join(f"  - {diff}" for diff in diffs)
        return 1, f"❌ [sync-governance] manifest.json desincronizado:\n{details}"
    return 0, _format_sync_ok_message(count_artifacts(candidate))


def run_sync(
    repo_root: Path,
    check_only: bool = False,
    with_ast: bool = False,
) -> tuple[int, str]:
    """Ejecuta sincronización o verificación y retorna (exit_code, mensaje)."""
    manifest_path = repo_root / "manifest.json"
    existing_manifest, existing_raw, load_errors = _load_existing_manifest(
        manifest_path, check_only
    )
    errors: list[str] = [
        *validate_cognitive_budgets(repo_root),
        *sync_skill_catalogs(repo_root, check_only),
        *load_errors,
    ]
    if errors:
        return 1, "\n".join(f"❌ [sync-governance] {err}" for err in errors)

    preserved_ts = str(
        existing_manifest.get("generated_at_utc")
        or datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    candidate = build_expected_manifest(repo_root, existing_manifest, preserved_ts)
    diffs = (
        compare_manifests(existing_manifest, candidate)
        if manifest_path.is_file()
        else ["manifest.json ausente"]
    )
    if check_only:
        return _format_check_only_result(diffs, candidate)

    final_manifest, manifest_changed = _apply_manifest_write(
        manifest_path, existing_raw, candidate, diffs
    )
    ast_errors = refresh_ast_if_needed(repo_root, manifest_changed) if with_ast else []
    if ast_errors:
        return 1, "\n".join(f"❌ [sync-governance] {err}" for err in ast_errors)
    return 0, _format_sync_ok_message(count_artifacts(final_manifest))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analiza los argumentos CLI no interactivos."""
    parser = argparse.ArgumentParser(
        description=(
            "Sincronizador determinista Zero-LLM de manifest.json y "
            "presupuestos QA-11X."
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Modo solo lectura: verifica hashes SHA-256, JSON sin claves "
            "duplicadas y presupuestos cognitivos."
        ),
    )
    parser.add_argument(
        "--with-ast",
        action="store_true",
        help=(
            "Ejecuta incrementalmente ./scripts/actualizar-grafos-graphify.sh "
            "si hubo cambios estructurales."
        ),
    )
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help=(
            "Ruta raíz del repositorio (por defecto autodetectada desde "
            ".agents/scripts/)."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada principal compatible con ejecución CLI no interactiva."""
    args = parse_args(argv)
    repo_root = (
        Path(args.repo_root).resolve()
        if args.repo_root
        else Path(__file__).resolve().parent.parent.parent
    )
    code, message = run_sync(
        repo_root, check_only=bool(args.check), with_ast=bool(args.with_ast)
    )
    stream = sys.stdout if code == 0 else sys.stderr
    print(message, file=stream)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
