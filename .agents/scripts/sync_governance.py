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

SCHEMA_VERSION = "1.0.0"
DEFAULT_BLUEPRINT_VERSION = "2.20.3"
REPOSITORY = "tecno-consultores/qa-testing-blueprints"
DEFAULT_BRANCH = "main"
RAW_BASE_URL = f"https://raw.githubusercontent.com/{REPOSITORY}/{DEFAULT_BRANCH}"

MAX_SKILL_MD_BYTES = 20_480
MAX_ACTIVE_TASK_LINES = 40

STACK_METADATA: dict[str, dict[str, str]] = {
    "python": {
        "description": "Scripts Standalone y Librerías en Python",
        "readme": "python/README.md",
    },
    "fastapi": {
        "description": "APIs Backend Asíncronas en Python (FastAPI + PostgreSQL 17 + KeyDB)",
        "readme": "fastapi/README.md",
    },
    "node-backend": {
        "description": "Microservicios Backend en Node.js / TypeScript (Express / Fastify)",
        "readme": "node-backend/README.md",
    },
    "vue3": {
        "description": "Frontend Web en Vue 3 + TypeScript + Vite",
        "readme": "vue3/README.md",
    },
    "react-frontend": {
        "description": "Frontend Web en React + TypeScript + Vite",
        "readme": "react-frontend/README.md",
    },
    "bash-scripts": {
        "description": "Scripts DevOps y Automatización en Bash / POSIX Shell",
        "readme": "bash-scripts/README.md",
    },
    "php": {
        "description": (
            "APIs, Microservicios y Aplicaciones Backend en PHP 8.2-8.5 "
            "con PCOV, PHPStan, Psalm, Pest/PHPUnit, Infection y Karate BDD"
        ),
        "readme": "php/README.md",
    },
}

COMMON_FILE_PATHS: tuple[str, ...] = (
    "lefthook.yml",
    "commitlint.config.js",
    "scripts/auditar-infra.sh",
    "scripts/verificar-secretos.sh",
    "scripts/actualizar-grafos-graphify.sh",
    "scripts/generar-sbom-cyclonedx.sh",
    ".trivy.yaml",
    "scripts/limpieza.sh",
    ".env.example",
)

IGNORED_STACK_NAMES = frozenset({"README.md", "changelog", ".DS_Store"})
IGNORED_STACK_DIRS = frozenset(
    {
        ".git",
        ".pytest_cache",
        "__pycache__",
        ".venv",
        "node_modules",
        "dist",
        "graphify-out",
    }
)


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
    """Construye un descriptor de archivo compatible con el esquema de manifest.json."""
    return {
        "path": rel_path,
        "target_name": target_name,
        "merge_strategy": merge_strategy,
        "sha256": compute_sha256(filepath),
        "size_bytes": filepath.stat().st_size,
    }


def get_blueprint_version(
    repo_root: Path, fallback: str = DEFAULT_BLUEPRINT_VERSION
) -> str:
    """Obtiene la versión semántica desde mcp-server/package.json o CHANGELOG.md."""
    pkg_path = repo_root / "mcp-server" / "package.json"
    if pkg_path.is_file():
        try:
            pkg_data = json.loads(pkg_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            pkg_data = None
        if isinstance(pkg_data, dict):
            version = str(pkg_data.get("version", "")).strip()
            if re.match(r"^\d+\.\d+\.\d+$", version):
                return version
    changelog_path = repo_root / "CHANGELOG.md"
    if changelog_path.is_file():
        try:
            content = changelog_path.read_text(encoding="utf-8")
        except OSError:
            content = ""
        match = re.search(r"##\s*\[(\d+\.\d+\.\d+)\]", content)
        if match:
            return match.group(1)
    return fallback


def classify_stack_file(rel_path_in_stack: Path) -> tuple[str, str]:
    """Clasifica un archivo de stack en (target_name, merge_strategy)."""
    path_str = rel_path_in_stack.as_posix()
    filename = rel_path_in_stack.name
    parent_posix = rel_path_in_stack.parent.as_posix()
    parent_prefix = f"{parent_posix}/" if parent_posix != "." else ""

    if filename == "gitignore.example":
        return f"{parent_prefix}.gitignore", "append_missing_lines"
    if filename == "npmrc.example":
        return f"{parent_prefix}.npmrc", "append_missing_lines"
    if filename == "docker-compose.qa.yml":
        return f"{parent_prefix}docker-compose.qa.yml", "copy_if_missing_or_update_qa"
    if filename.endswith(".example"):
        unwrapped = filename[: -len(".example")]
        target_name = f"{parent_prefix}{unwrapped}"
        if parent_posix.startswith(
            ("test", "e2e", "nginx", "initdb")
        ) or unwrapped.endswith((".unit.py", ".spec.ts", ".e2e.ts", ".conf", ".sql")):
            return target_name, "copy_if_missing"
        return target_name, "surgical_merge"
    if parent_posix.startswith(("test", "e2e")) or filename.endswith(
        (".feature", ".bats", ".e2e.ts", ".spec.ts")
    ):
        return path_str, "copy_if_missing"
    if filename.endswith((".sh", ".py")):
        return path_str, "overwrite_executable"
    return path_str, "copy_if_missing"


def classify_common_file(rel_path: str) -> tuple[str, str]:
    """Clasifica un archivo común en (target_name, merge_strategy)."""
    filename = Path(rel_path).name
    if filename.endswith(".sh"):
        return rel_path, "overwrite_executable"
    if filename in ("commitlint.config.js", ".trivy.yaml", ".env.example"):
        return rel_path, "copy_if_missing"
    return rel_path, "surgical_merge"


def classify_governance_file(rel_path: str) -> tuple[str, str]:
    """Clasifica un archivo de gobernanza en (target_name, merge_strategy)."""
    path_obj = Path(rel_path)
    if path_obj.name == "ACTIVE_TASK.md.example":
        return ".agents/ACTIVE_TASK.md", "copy_if_missing"
    if path_obj.suffix in (".sh", ".py"):
        return rel_path, "overwrite_executable"
    if path_obj.name == "AGENTS.md":
        return rel_path, "surgical_merge"
    return rel_path, "copy_or_overwrite"


def scan_stack(repo_root: Path, stack_name: str) -> list[dict[str, Any]]:
    """Escanea recursivamente los archivos rastreados dentro de un stack."""
    stack_dir = repo_root / stack_name
    if not stack_dir.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for item in sorted(stack_dir.rglob("*")):
        if not item.is_file():
            continue
        rel_in_stack = item.relative_to(stack_dir)
        if any(part in IGNORED_STACK_DIRS for part in rel_in_stack.parts):
            continue
        if item.name in IGNORED_STACK_NAMES:
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
    repo_root: Path, existing_entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Escanea archivos comunes canónicos y rutas comunes heredadas existentes."""
    preserved = _preserve_or_classify_existing(existing_entries)
    ordered_paths = sorted(set(COMMON_FILE_PATHS) | set(preserved.keys()))
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


def _discover_governance_paths(repo_root: Path) -> list[str]:
    """Descubre archivos canónicos de gobernanza dentro de los directorios gobernados."""
    candidates: list[Path] = []
    for rel in (
        "AGENTS.md",
        ".agents/README.md",
        ".agents/ACTIVE_TASK.md.example",
        "scripts/install-skill.sh",
    ):
        candidate = repo_root / rel
        if candidate.is_file():
            candidates.append(candidate)

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

    return [p.relative_to(repo_root).as_posix() for p in candidates]


def scan_agent_governance_files(
    repo_root: Path, existing_entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Escanea artefactos de gobernanza canónicos y preserva rutas adicionales existentes."""
    preserved = _preserve_or_classify_existing(existing_entries)
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


def _build_stacks_dict(
    repo_root: Path, existing_manifest: dict[str, Any]
) -> dict[str, Any]:
    """Construye la sección stacks respetando metadata existente o estándar."""
    existing_stacks_raw = existing_manifest.get("stacks", {})
    existing_stacks = (
        existing_stacks_raw if isinstance(existing_stacks_raw, dict) else {}
    )
    stack_names = sorted(set(STACK_METADATA.keys()) | set(existing_stacks.keys()))
    stacks_dict: dict[str, Any] = {}
    for stack_name in stack_names:
        stack_dir = repo_root / stack_name
        has_existing = stack_name in existing_stacks
        if not stack_dir.is_dir() and not has_existing:
            continue
        meta = STACK_METADATA.get(stack_name) or existing_stacks.get(stack_name, {})
        description = str(meta.get("description", ""))
        readme = str(meta.get("readme", f"{stack_name}/README.md"))
        if stack_dir.is_dir():
            files = scan_stack(repo_root, stack_name)
        else:
            prev_files = existing_stacks.get(stack_name, {}).get("files", [])
            files = []
            if isinstance(prev_files, list):
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
        stacks_dict[stack_name] = {
            "description": description,
            "readme": readme,
            "files": files,
        }
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
                f"[{section_name}] Archivo listado en manifest.json pero ausente en disco: {rel_path}"
            )
        else:
            exp = expected_map[rel_path]
            act = actual_map[rel_path]
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


def compare_manifests(
    existing_manifest: dict[str, Any], actual_manifest: dict[str, Any]
) -> list[str]:
    """Compara dos diccionarios de manifiesto ignorando diferencias temporales de timestamp."""
    diffs: list[str] = []
    for field in (
        "schema_version",
        "blueprint_version",
        "repository",
        "default_branch",
        "raw_base_url",
    ):
        if existing_manifest.get(field) != actual_manifest.get(field):
            diffs.append(
                f"Metadato raíz '{field}' discrepante: "
                f"manifest '{existing_manifest.get(field)}' != actual '{actual_manifest.get(field)}'"
            )

    existing_stacks = existing_manifest.get("stacks", {})
    actual_stacks = actual_manifest.get("stacks", {})
    if not isinstance(existing_stacks, dict):
        diffs.append("La sección 'stacks' en manifest.json no es un objeto válido.")
    else:
        for stack_name in sorted(
            set(existing_stacks.keys()) | set(actual_stacks.keys())
        ):
            if stack_name not in existing_stacks:
                diffs.append(f"Stack faltante en manifest.json: {stack_name}")
                continue
            if stack_name not in actual_stacks:
                diffs.append(
                    f"Stack inexistente listado en manifest.json: {stack_name}"
                )
                continue
            exp_stack = existing_stacks[stack_name]
            act_stack = actual_stacks[stack_name]
            if not isinstance(exp_stack, dict):
                diffs.append(f"Stack '{stack_name}' inválido en manifest.json.")
                continue
            if exp_stack.get("description") != act_stack.get("description"):
                diffs.append(f"Descripción discrepante en stack {stack_name}")
            if exp_stack.get("readme") != act_stack.get("readme"):
                diffs.append(f"Readme discrepante en stack {stack_name}")
            exp_files = exp_stack.get("files", [])
            diffs.extend(
                compare_file_lists(
                    f"stack:{stack_name}",
                    exp_files if isinstance(exp_files, list) else [],
                    act_stack.get("files", []),
                )
            )

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


def validate_cognitive_budgets(repo_root: Path) -> list[str]:
    """Valida SKILL.md < 20480 bytes y ACTIVE_TASK.md <= 40 líneas."""
    errors: list[str] = []
    skills_dir = repo_root / ".agents" / "skills"
    if skills_dir.is_dir():
        for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
            if not skill_md.is_file():
                continue
            size = skill_md.stat().st_size
            if size >= MAX_SKILL_MD_BYTES:
                rel = skill_md.relative_to(repo_root).as_posix()
                errors.append(
                    f"{rel} excede el presupuesto cognitivo ({size} >= {MAX_SKILL_MD_BYTES} bytes)."
                )

    active_task = repo_root / ".agents" / "ACTIVE_TASK.md"
    if active_task.is_file():
        line_count = len(active_task.read_text(encoding="utf-8").splitlines())
        if line_count > MAX_ACTIVE_TASK_LINES:
            errors.append(
                f".agents/ACTIVE_TASK.md excede el límite compacto ({line_count} > {MAX_ACTIVE_TASK_LINES} líneas)."
            )
    return errors


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


def has_structural_git_changes(repo_root: Path) -> bool:
    """Detecta si existen cambios de código/configuración fuera de *.md y graphify-out."""
    if not (repo_root / ".git").exists():
        return False
    res = subprocess.run(
        ["git", "-C", str(repo_root), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        return False
    for raw_line in res.stdout.splitlines():
        path_part = raw_line[3:].strip() if len(raw_line) > 3 else ""
        if not path_part:
            continue
        if path_part.endswith(".md") or "graphify-out/" in path_part:
            continue
        return True
    return False


def refresh_ast_if_needed(repo_root: Path, manifest_changed: bool) -> list[str]:
    """Ejecuta incrementalmente ./scripts/actualizar-grafos-graphify.sh si aplica."""
    ast_script = repo_root / "scripts" / "actualizar-grafos-graphify.sh"
    if not ast_script.is_file():
        return []
    if not manifest_changed and not has_structural_git_changes(repo_root):
        return []
    res = subprocess.run(
        [str(ast_script)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        detail = (res.stderr or res.stdout).strip() or f"exit code {res.returncode}"
        return [f"Fallo al actualizar grafos AST ({ast_script.name}): {detail}"]
    return []


def run_sync(
    repo_root: Path,
    check_only: bool = False,
    with_ast: bool = False,
) -> tuple[int, str]:
    """Ejecuta sincronización o verificación determinista y retorna (exit_code, mensaje)."""
    errors: list[str] = validate_cognitive_budgets(repo_root)
    manifest_path = repo_root / "manifest.json"

    existing_manifest: dict[str, Any] = {}
    existing_raw = ""
    if manifest_path.is_file():
        try:
            existing_raw = manifest_path.read_text(encoding="utf-8")
            existing_manifest = load_manifest_strict(manifest_path)
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
            errors.append(f"Error al validar manifest.json: {exc}")
    elif check_only:
        errors.append(f"El archivo manifest.json no existe en {repo_root}")

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
        if diffs:
            details = "\n".join(f"  - {diff}" for diff in diffs)
            return 1, f"❌ [sync-governance] manifest.json desincronizado:\n{details}"
        total = count_artifacts(candidate)
        ok_msg = (
            f"✅ [sync-governance] manifest.json sincronizado ({total} artefactos SHA-256), "
            "SKILL.md <20KB y ACTIVE_TASK <=40L OK"
        )
        return 0, ok_msg

    manifest_changed = False
    serialized_candidate = json.dumps(candidate, indent=2, ensure_ascii=False) + "\n"
    if diffs or serialized_candidate != existing_raw:
        new_ts = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        updated = build_expected_manifest(repo_root, existing_manifest, new_ts)
        updated_raw = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
        manifest_path.write_text(updated_raw, encoding="utf-8")
        manifest_changed = True
        final_manifest = updated
    else:
        final_manifest = candidate

    if with_ast:
        ast_errors = refresh_ast_if_needed(repo_root, manifest_changed)
        if ast_errors:
            return 1, "\n".join(f"❌ [sync-governance] {err}" for err in ast_errors)

    total = count_artifacts(final_manifest)
    ok_msg = (
        f"✅ [sync-governance] manifest.json sincronizado ({total} artefactos SHA-256), "
        "SKILL.md <20KB y ACTIVE_TASK <=40L OK"
    )
    return 0, ok_msg


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analiza los argumentos CLI no interactivos."""
    parser = argparse.ArgumentParser(
        description="Sincronizador determinista Zero-LLM de manifest.json y presupuestos QA-11X."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Modo solo lectura: verifica hashes SHA-256, JSON sin claves duplicadas y presupuestos cognitivos.",
    )
    parser.add_argument(
        "--with-ast",
        action="store_true",
        help="Ejecuta incrementalmente ./scripts/actualizar-grafos-graphify.sh si hubo cambios estructurales.",
    )
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help="Ruta raíz del repositorio (por defecto autodetectada desde .agents/scripts/).",
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
