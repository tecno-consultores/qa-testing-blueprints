#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

"""
generar-manifiesto.py — Generador y Validador Criptográfico del Manifiesto Remoto (manifest.json).

Arquitectura Zero-Clone (Estándar 11X / DISA ASD STIG V6R5 V-222513 / APSC-DV-001430).
Genera el índice JSON de verificación SHA-256 con soporte para --check, determinismo de salida
y clasificación estricta de estrategias de fusión (merge_strategy).
"""

import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

SCHEMA_VERSION = "1.0.0"
DEFAULT_BLUEPRINT_VERSION = "2.7.0"
REPOSITORY = "tecno-consultores/qa-testing-blueprints"
DEFAULT_BRANCH = "main"
RAW_BASE_URL = f"https://raw.githubusercontent.com/{REPOSITORY}/{DEFAULT_BRANCH}"

STACK_METADATA: Dict[str, Dict[str, str]] = {
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
        "description": "APIs, Microservicios y Aplicaciones Backend en PHP 8.1-8.5 con PCOV, PHPStan, Psalm, Pest/PHPUnit, Infection y Karate BDD",
        "readme": "php/README.md",
    },
}

COMMON_FILE_PATHS: List[str] = [
    "lefthook.yml",
    "commitlint.config.js",
    "scripts/auditar-infra.sh",
    "scripts/verificar-secretos.sh",
    ".trivy.yaml",
    "scripts/limpieza.sh",
    "scripts/publicar-mcp.sh",
    ".env.example",
]


def compute_sha256(filepath: Path) -> str:
    """Calcula el hash criptográfico SHA-256 de un archivo en bloques de 64KB."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def get_blueprint_version(repo_root: Path) -> str:
    """Extrae la versión semántica del blueprint desde CHANGELOG.md o fallback a 2.7.0."""
    changelog_path = repo_root / "CHANGELOG.md"
    if changelog_path.is_file():
        try:
            content = changelog_path.read_text(encoding="utf-8")
            match = re.search(r"##\s*\[(\d+\.\d+\.\d+)\]", content)
            if match:
                return match.group(1)
        except Exception:
            pass
    return DEFAULT_BLUEPRINT_VERSION


def classify_stack_file(rel_path_in_stack: Path) -> Tuple[str, str]:
    """
    Clasifica un archivo dentro de un stack, determinando su target_name y merge_strategy.

    Reglas de Transformación (Spec 01, Sección 4.1):
    1. Si termina en .example:
       - gitignore.example -> .gitignore (append_missing_lines)
       - npmrc.example -> .npmrc (append_missing_lines)
       - Otros .example -> <nombre>.<ext> (surgical_merge o copy_if_missing si es de test/nginx)
    2. docker-compose.qa.yml -> copy_if_missing_or_update_qa
    3. Archivos dentro de test/ o e2e/ -> copy_if_missing
    4. Scripts .sh o .py ejecutables -> overwrite_executable
    """
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
        unwrapped = filename[:-len(".example")]
        target_name = f"{parent_prefix}{unwrapped}"
        if (
            parent_posix.startswith("test")
            or parent_posix.startswith("e2e")
            or parent_posix.startswith("nginx")
            or unwrapped.endswith((".unit.py", ".spec.ts", ".e2e.ts", ".conf"))
        ):
            return target_name, "copy_if_missing"
        return target_name, "surgical_merge"

    if (
        parent_posix.startswith("test")
        or parent_posix.startswith("e2e")
        or filename.endswith((".feature", ".bats", ".e2e.ts", ".spec.ts"))
    ):
        return path_str, "copy_if_missing"

    if filename.endswith((".sh", ".py")):
        return path_str, "overwrite_executable"

    return path_str, "copy_if_missing"


def classify_common_file(rel_path: str) -> Tuple[str, str]:
    """Clasifica un archivo común del proyecto."""
    filename = Path(rel_path).name
    if filename.endswith(".sh"):
        return rel_path, "overwrite_executable"
    if filename in ("commitlint.config.js", ".trivy.yaml", ".env.example"):
        return rel_path, "copy_if_missing"
    return rel_path, "surgical_merge"


def classify_governance_file(rel_path: str) -> Tuple[str, str]:
    """Clasifica un archivo de gobernanza de agentes."""
    path_obj = Path(rel_path)
    if path_obj.name == "ACTIVE_TASK.md.example":
        return ".agents/ACTIVE_TASK.md", "copy_if_missing"
    if path_obj.suffix in (".sh", ".py"):
        return rel_path, "overwrite_executable"
    if path_obj.name == "AGENTS.md":
        return rel_path, "surgical_merge"
    return rel_path, "copy_or_overwrite"


def scan_stack(repo_root: Path, stack_name: str, stack_dir: Path) -> List[Dict[str, Any]]:
    """Escanea recursivamente los archivos de plantilla y QA dentro de un stack."""
    files: List[Dict[str, Any]] = []
    if not stack_dir.is_dir():
        return files

    ignored_names = {"README.md", "changelog", ".DS_Store"}
    ignored_dirs = {".git", ".pytest_cache", "__pycache__", ".venv", "node_modules", "dist"}

    for item in sorted(stack_dir.rglob("*")):
        if not item.is_file():
            continue

        parts = item.relative_to(stack_dir).parts
        if any(d in ignored_dirs for d in parts):
            continue

        if item.name in ignored_names:
            continue

        rel_in_stack = item.relative_to(stack_dir)
        full_rel_path = f"{stack_name}/{rel_in_stack.as_posix()}"

        target_name, merge_strategy = classify_stack_file(rel_in_stack)
        sha256 = compute_sha256(item)
        size_bytes = item.stat().st_size

        files.append(
            {
                "path": full_rel_path,
                "target_name": target_name,
                "merge_strategy": merge_strategy,
                "sha256": sha256,
                "size_bytes": size_bytes,
            }
        )

    files.sort(key=lambda x: x["path"])
    return files


def scan_common_files(repo_root: Path) -> List[Dict[str, Any]]:
    """Escanea y valida los archivos comunes del blueprint."""
    common_files: List[Dict[str, Any]] = []
    for rel_path in sorted(COMMON_FILE_PATHS):
        full_path = repo_root / rel_path
        if full_path.is_file():
            target_name, merge_strategy = classify_common_file(rel_path)
            common_files.append(
                {
                    "path": rel_path,
                    "target_name": target_name,
                    "merge_strategy": merge_strategy,
                    "sha256": compute_sha256(full_path),
                    "size_bytes": full_path.stat().st_size,
                }
            )
    common_files.sort(key=lambda x: x["path"])
    return common_files


def scan_agent_governance_files(repo_root: Path) -> List[Dict[str, Any]]:
    """
    Escanea y valida los archivos de gobernanza de agentes:
    AGENTS.md, .agents/rules/*.md, .agents/scripts/* y .agents/skills/**/*.
    """
    candidates: List[Path] = []

    agents_md = repo_root / "AGENTS.md"
    if agents_md.is_file():
        candidates.append(agents_md)

    active_task_example = repo_root / ".agents" / "ACTIVE_TASK.md.example"
    if active_task_example.is_file():
        candidates.append(active_task_example)

    rules_dir = repo_root / ".agents" / "rules"
    if rules_dir.is_dir():
        for f in sorted(rules_dir.glob("*.md")):
            if f.is_file():
                candidates.append(f)

    scripts_dir = repo_root / ".agents" / "scripts"
    if scripts_dir.is_dir():
        for f in sorted(scripts_dir.glob("*")):
            if f.is_file() and f.suffix in (".sh", ".py"):
                candidates.append(f)

    skills_dir = repo_root / ".agents" / "skills"
    if skills_dir.is_dir():
        for f in sorted(skills_dir.rglob("*.md")):
            if f.is_file():
                candidates.append(f)

    install_script = repo_root / "scripts" / "install-skill.sh"
    if install_script.is_file():
        candidates.append(install_script)

    governance_files: List[Dict[str, Any]] = []
    seen_paths = set()

    for item in candidates:
        rel_path = item.relative_to(repo_root).as_posix()
        if rel_path in seen_paths:
            continue
        seen_paths.add(rel_path)

        target_name, merge_strategy = classify_governance_file(rel_path)
        governance_files.append(
            {
                "path": rel_path,
                "target_name": target_name,
                "merge_strategy": merge_strategy,
                "sha256": compute_sha256(item),
                "size_bytes": item.stat().st_size,
            }
        )

    governance_files.sort(key=lambda x: x["path"])
    return governance_files


def build_manifest(repo_root: Path, generated_at_utc: Optional[str] = None) -> Dict[str, Any]:
    """Construye el diccionario completo del manifiesto con orden determinista."""
    if generated_at_utc is None:
        generated_at_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    blueprint_version = get_blueprint_version(repo_root)

    stacks_dict: Dict[str, Any] = {}
    for stack_name, meta in sorted(STACK_METADATA.items()):
        stack_dir = repo_root / stack_name
        files = scan_stack(repo_root, stack_name, stack_dir)
        stacks_dict[stack_name] = {
            "description": meta["description"],
            "readme": meta["readme"],
            "files": files,
        }

    common_files = scan_common_files(repo_root)
    governance_files = scan_agent_governance_files(repo_root)

    manifest: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "blueprint_version": blueprint_version,
        "generated_at_utc": generated_at_utc,
        "repository": REPOSITORY,
        "default_branch": DEFAULT_BRANCH,
        "raw_base_url": RAW_BASE_URL,
        "stacks": stacks_dict,
        "common_files": common_files,
        "agent_governance_files": governance_files,
    }

    return manifest


def compare_file_lists(
    section_name: str, expected_list: List[Dict[str, Any]], actual_list: List[Dict[str, Any]]
) -> List[str]:
    """Compara dos listas de descriptores de archivos e identifica diferencias de hash o ruta."""
    diffs: List[str] = []
    expected_map = {f["path"]: f for f in expected_list}
    actual_map = {f["path"]: f for f in actual_list}

    all_paths = sorted(set(expected_map.keys()) | set(actual_map.keys()))

    for p in all_paths:
        if p not in expected_map:
            diffs.append(f"[{section_name}] Archivo faltante en manifest.json: {p}")
        elif p not in actual_map:
            diffs.append(f"[{section_name}] Archivo listado en manifest.json pero ausente en repositorio: {p}")
        else:
            exp = expected_map[p]
            act = actual_map[p]
            if exp["sha256"] != act["sha256"]:
                diffs.append(
                    f"[{section_name}] Hash SHA-256 discrepante en {p}: esperado {exp['sha256']}, actual en disco {act['sha256']}"
                )
            if exp.get("target_name") != act.get("target_name"):
                diffs.append(
                    f"[{section_name}] target_name discrepante en {p}: manifest '{exp.get('target_name')}' != esperado '{act.get('target_name')}'"
                )
            if exp.get("merge_strategy") != act.get("merge_strategy"):
                diffs.append(
                    f"[{section_name}] merge_strategy discrepante en {p}: manifest '{exp.get('merge_strategy')}' != esperado '{act.get('merge_strategy')}'"
                )
            if exp.get("size_bytes") != act.get("size_bytes"):
                diffs.append(
                    f"[{section_name}] size_bytes discrepante en {p}: manifest {exp.get('size_bytes')} != actual {act.get('size_bytes')}"
                )

    return diffs


def verify_manifest(repo_root: Path, manifest_path: Path) -> Tuple[bool, List[str]]:
    """
    Verifica si manifest_path coincide con el estado actual del repositorio.
    Ignora discrepancias temporales en generated_at_utc si los hashes y metadatos coinciden.
    """
    if not manifest_path.is_file():
        return False, [f"El archivo de manifiesto no existe en {manifest_path}"]

    try:
        content = manifest_path.read_text(encoding="utf-8")
        existing_manifest = json.loads(content)
    except Exception as e:
        return False, [f"Error al analizar JSON de {manifest_path}: {e}"]

    # Generamos el manifiesto con los archivos actuales en disco
    actual_manifest = build_manifest(repo_root, generated_at_utc=existing_manifest.get("generated_at_utc"))

    diffs: List[str] = []

    # Validar campos de nivel superior
    for field in ("schema_version", "blueprint_version", "repository", "default_branch", "raw_base_url"):
        exp_val = existing_manifest.get(field)
        act_val = actual_manifest.get(field)
        if exp_val != act_val:
            diffs.append(f"Metadato raíz '{field}' discrepante: manifest '{exp_val}' != actual '{act_val}'")

    # Validar stacks
    existing_stacks = existing_manifest.get("stacks", {})
    actual_stacks = actual_manifest.get("stacks", {})

    all_stacks = sorted(set(existing_stacks.keys()) | set(actual_stacks.keys()))
    for s_name in all_stacks:
        if s_name not in existing_stacks:
            diffs.append(f"Stack faltante en manifest.json: {s_name}")
            continue
        if s_name not in actual_stacks:
            diffs.append(f"Stack inexistente listado en manifest.json: {s_name}")
            continue

        exp_stack = existing_stacks[s_name]
        act_stack = actual_stacks[s_name]

        if exp_stack.get("description") != act_stack.get("description"):
            diffs.append(f"Descripción discrepante en stack {s_name}")
        if exp_stack.get("readme") != act_stack.get("readme"):
            diffs.append(f"Readme discrepante en stack {s_name}")

        stack_diffs = compare_file_lists(
            f"stack:{s_name}", exp_stack.get("files", []), act_stack.get("files", [])
        )
        diffs.extend(stack_diffs)

    # Validar common_files
    common_diffs = compare_file_lists(
        "common_files", existing_manifest.get("common_files", []), actual_manifest.get("common_files", [])
    )
    diffs.extend(common_diffs)

    # Validar agent_governance_files
    gov_diffs = compare_file_lists(
        "agent_governance_files",
        existing_manifest.get("agent_governance_files", []),
        actual_manifest.get("agent_governance_files", []),
    )
    diffs.extend(gov_diffs)

    return len(diffs) == 0, diffs


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generador y Validador Criptográfico del Manifiesto Remoto (manifest.json) — Estándar 11X."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verifica si manifest.json coincide con los hashes SHA-256 actuales del repo (exit code 0 o 1).",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Ruta de salida o verificación para manifest.json (por defecto /manifest.json en la raíz del repo).",
    )
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help="Ruta a la raíz del repositorio (por defecto autodectada a partir de la ubicación de este script).",
    )

    args = parser.parse_args(argv)

    if args.repo_root:
        repo_root = Path(args.repo_root).resolve()
    else:
        # Por defecto scripts/ está un nivel debajo de la raíz
        repo_root = Path(__file__).resolve().parent.parent

    manifest_path = Path(args.output).resolve() if args.output else repo_root / "manifest.json"

    if args.check:
        is_synced, diffs = verify_manifest(repo_root, manifest_path)
        if is_synced:
            print("✔ [Manifest SHA-256] manifest.json 100% sincronizado.")
            return 0
        else:
            print("🚨 ERROR: manifest.json no está sincronizado con el repositorio actual:")
            for d in diffs:
                print(f"  - {d}")
            print("💡 Solución: ejecute 'python3 scripts/generar-manifiesto.py' para sincronizar el manifiesto.")
            return 1
    else:
        manifest_data = build_manifest(repo_root)
        manifest_json_str = json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(manifest_json_str, encoding="utf-8")

        total_files = (
            sum(len(s["files"]) for s in manifest_data["stacks"].values())
            + len(manifest_data["common_files"])
            + len(manifest_data["agent_governance_files"])
        )
        print(f"✔ [Manifest SHA-256] Generado en {manifest_path.name} ({total_files} archivos indexados).")
        return 0


if __name__ == "__main__":
    sys.exit(main())
