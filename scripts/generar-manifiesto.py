#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""
generar-manifiesto.py — Generador y Validador del Manifiesto (manifest.json).

Arquitectura Zero-Clone (Estándar 11X / DISA ASD STIG V6R5 V-222513 / APSC-DV-001430).
Delega en .agents/scripts/sync_governance.py la fuente única de metadatos, hashes
SHA-256, clasificación de estrategias de fusión y comparación estructural.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path
from typing import Any

_GOVERNANCE_SCRIPTS_DIR = str(
    Path(__file__).resolve().parents[1] / ".agents" / "scripts"
)
if _GOVERNANCE_SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _GOVERNANCE_SCRIPTS_DIR)

from sync_governance import (  # noqa: E402
    COMMON_FILE_PATHS as COMMON_FILE_PATHS,
)
from sync_governance import (  # noqa: E402
    DEFAULT_BLUEPRINT_VERSION as _SYNC_DEFAULT_BLUEPRINT_VERSION,
)
from sync_governance import (  # noqa: E402
    DEFAULT_BRANCH as DEFAULT_BRANCH,
)
from sync_governance import (  # noqa: E402
    RAW_BASE_URL as RAW_BASE_URL,
)
from sync_governance import (  # noqa: E402
    REPOSITORY as REPOSITORY,
)
from sync_governance import (  # noqa: E402
    SCHEMA_VERSION as SCHEMA_VERSION,
)
from sync_governance import (  # noqa: E402
    STACK_METADATA as STACK_METADATA,
)
from sync_governance import (  # noqa: E402
    _build_single_stack_entry,
    compare_manifests,
    count_artifacts,
    load_manifest_strict,
)
from sync_governance import (  # noqa: E402
    _collect_agent_schemas as _collect_agent_schemas,
)
from sync_governance import (  # noqa: E402
    classify_common_file as classify_common_file,
)
from sync_governance import (  # noqa: E402
    classify_governance_file as classify_governance_file,
)
from sync_governance import (  # noqa: E402
    classify_stack_file as classify_stack_file,
)
from sync_governance import (  # noqa: E402
    compare_file_lists as compare_file_lists,
)
from sync_governance import (  # noqa: E402
    compute_sha256 as compute_sha256,
)
from sync_governance import (  # noqa: E402
    get_blueprint_version as get_blueprint_version,
)
from sync_governance import (  # noqa: E402
    scan_agent_governance_files as scan_agent_governance_files,
)
from sync_governance import (  # noqa: E402
    scan_common_files as scan_common_files,
)
from sync_governance import (  # noqa: E402
    scan_stack as scan_stack,
)

DEFAULT_BLUEPRINT_VERSION = "3.1.0"


def build_manifest(
    repo_root: Path,
    generated_at_utc: str | None = None,
    existing_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Construye el diccionario completo del manifiesto con orden determinista."""
    timestamp = generated_at_utc or datetime.datetime.now(datetime.UTC).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    fallback = DEFAULT_BLUEPRINT_VERSION or _SYNC_DEFAULT_BLUEPRINT_VERSION
    blueprint_version = get_blueprint_version(repo_root, fallback=fallback)

    prev = existing_manifest or {}
    raw_stacks = prev.get("stacks", {})
    existing_stacks = raw_stacks if isinstance(raw_stacks, dict) else {}
    raw_common = prev.get("common_files", [])
    existing_common = raw_common if isinstance(raw_common, list) else []
    raw_gov = prev.get("agent_governance_files", [])
    existing_gov = raw_gov if isinstance(raw_gov, list) else []

    stacks_dict = {
        stack_name: _build_single_stack_entry(repo_root, stack_name, existing_stacks)
        for stack_name in sorted(STACK_METADATA)
    }

    return {
        "schema_version": SCHEMA_VERSION,
        "blueprint_version": blueprint_version,
        "generated_at_utc": timestamp,
        "repository": REPOSITORY,
        "default_branch": DEFAULT_BRANCH,
        "raw_base_url": RAW_BASE_URL,
        "stacks": stacks_dict,
        "common_files": scan_common_files(repo_root, existing_entries=existing_common),
        "agent_governance_files": scan_agent_governance_files(
            repo_root, existing_entries=existing_gov
        ),
    }


def verify_manifest(
    repo_root: Path, manifest_path: Path
) -> tuple[bool, list[str]]:
    """Verifica si manifest_path coincide con el estado actual del repositorio."""
    if not manifest_path.is_file():
        return False, [f"El archivo de manifiesto no existe en {manifest_path}"]

    try:
        existing_manifest = load_manifest_strict(manifest_path)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        return False, [f"Error al analizar JSON de {manifest_path}: {exc}"]

    raw_ts = existing_manifest.get("generated_at_utc")
    ts = raw_ts if isinstance(raw_ts, str) else None
    actual_manifest = build_manifest(
        repo_root, generated_at_utc=ts, existing_manifest=existing_manifest
    )
    diffs = compare_manifests(existing_manifest, actual_manifest)
    return len(diffs) == 0, diffs


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generador y Validador Criptográfico del Manifiesto Remoto "
            "(manifest.json) — Estándar 11X."
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Verifica si manifest.json coincide con los hashes SHA-256 "
            "actuales del repo (exit code 0 o 1)."
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help=(
            "Ruta de salida o verificación para manifest.json "
            "(por defecto /manifest.json en la raíz del repo)."
        ),
    )
    parser.add_argument(
        "--repo-root",
        type=str,
        default=None,
        help=(
            "Ruta a la raíz del repositorio (por defecto autodectada "
            "a partir de la ubicación de este script)."
        ),
    )
    return parser.parse_args(argv)


def _handle_check(repo_root: Path, manifest_path: Path) -> int:
    is_synced, diffs = verify_manifest(repo_root, manifest_path)
    if is_synced:
        print("✔ [Manifest SHA-256] manifest.json 100% sincronizado.")
        return 0
    print("🚨 ERROR: manifest.json no está sincronizado con el repositorio actual:")
    for diff in diffs:
        print(f"  - {diff}")
    print(
        "💡 Solución: ejecute 'python3 scripts/generar-manifiesto.py' "
        "para sincronizar el manifiesto."
    )
    return 1


def _write_manifest(repo_root: Path, manifest_path: Path) -> int:
    manifest_data = build_manifest(repo_root)
    manifest_json = json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(manifest_json, encoding="utf-8")
    total_files = count_artifacts(manifest_data)
    print(
        f"✔ [Manifest SHA-256] Generado en {manifest_path.name} "
        f"({total_files} archivos indexados)."
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI para generación y verificación de manifest.json."""
    args = _parse_args(argv)
    repo_root = (
        Path(args.repo_root).resolve()
        if args.repo_root
        else Path(__file__).resolve().parent.parent
    )
    manifest_path = (
        Path(args.output).resolve()
        if args.output
        else repo_root / "manifest.json"
    )
    if args.check:
        return _handle_check(repo_root, manifest_path)
    return _write_manifest(repo_root, manifest_path)


if __name__ == "__main__":
    sys.exit(main())
