#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validador determinista de presupuesto cognitivo e invariantes documentales QA 11X."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _docs_invariants_bilingual import (  # noqa: E402
    check_bilingual_pair_parity as check_bilingual_pair_parity,
)
from _docs_invariants_bilingual import (  # noqa: E402
    check_bilingual_readme_parity as check_bilingual_readme_parity,
)
from _docs_invariants_bilingual import (  # noqa: E402
    check_dual_consumer_parity as check_dual_consumer_parity,
)
from _docs_invariants_bilingual import (  # noqa: E402
    check_historical_spec_links as check_historical_spec_links,
)
from _docs_invariants_bilingual import (  # noqa: E402
    check_internal_markdown_links as check_internal_markdown_links,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_claude_plugin_manifests as _check_claude_plugin_manifests,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_markdown_fence_balance as _check_markdown_fence_balance,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_mcp_registry_manifest as _check_mcp_registry_manifest,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_refactoring_ui_topics as _check_refactoring_ui_topics,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_skill_backtick_references as _check_skill_backtick_references,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_skill_entries as _check_skill_entries,
)
from _docs_invariants_catalogs import (  # noqa: E402
    _check_specs_and_stack_contracts as _check_specs_and_stack_contracts,
)
from _docs_invariants_catalogs import (  # noqa: E402
    check_global_catalogs_and_geo as check_global_catalogs_and_geo,
)
from _docs_invariants_catalogs import (  # noqa: E402
    check_mcp_release_and_cli_parity as check_mcp_release_and_cli_parity,
)
from _docs_invariants_catalogs import (  # noqa: E402
    check_no_private_consumer_leaks as check_no_private_consumer_leaks,
)
from _docs_invariants_catalogs import (  # noqa: E402
    check_testing_scoreboard_consistency as check_testing_scoreboard_consistency,
)
from _docs_invariants_config import (  # noqa: E402
    ACTIVE_TASK_MAX_LINES as ACTIVE_TASK_MAX_LINES,
)
from _docs_invariants_config import (  # noqa: E402
    ACTIVE_TASK_RULE_MAX_LINES as ACTIVE_TASK_RULE_MAX_LINES,
)
from _docs_invariants_config import (  # noqa: E402
    ARCHITECT_SKILL_MAX_BYTES as ARCHITECT_SKILL_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    BILINGUAL_DOC_PAIRS as BILINGUAL_DOC_PAIRS,
)
from _docs_invariants_config import (  # noqa: E402
    DOC_TARGETS as DOC_TARGETS,
)
from _docs_invariants_config import (  # noqa: E402
    EXPECTED_CALM_CONTROLS as EXPECTED_CALM_CONTROLS,
)
from _docs_invariants_config import (  # noqa: E402
    GLOBAL_CONNECTOR_MAX_BYTES as GLOBAL_CONNECTOR_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    HUMAN_CORE_MANUALS as HUMAN_CORE_MANUALS,
)
from _docs_invariants_config import (  # noqa: E402
    KNOWN_BLUEPRINT_STACKS as KNOWN_BLUEPRINT_STACKS,
)
from _docs_invariants_config import (  # noqa: E402
    PROJECT_CONNECTOR_MAX_BYTES as PROJECT_CONNECTOR_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    REPO_AGENTS_MD_MAX_BYTES as REPO_AGENTS_MD_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    RULES_TOTAL_MAX_BYTES as RULES_TOTAL_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    SKILL_MAX_BYTES as SKILL_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    TACTICAL_SKILL_MAX_BYTES as TACTICAL_SKILL_MAX_BYTES,
)
from _docs_invariants_config import (  # noqa: E402
    RepoExpectedCounts as RepoExpectedCounts,
)
from _docs_invariants_config import (  # noqa: E402
    _load_budgets_module as _load_budgets_module,
)
from _docs_invariants_config import (  # noqa: E402
    _read_active_doc_text as _read_active_doc_text,
)
from _docs_invariants_config import (  # noqa: E402
    is_upstream_blueprints_repo as is_upstream_blueprints_repo,
)
from _docs_invariants_counts import (  # noqa: E402
    _derive_blueprints_count as _derive_blueprints_count,
)
from _docs_invariants_counts import (  # noqa: E402
    _derive_calm_controls as _derive_calm_controls,
)
from _docs_invariants_counts import (  # noqa: E402
    _derive_resources_count as _derive_resources_count,
)
from _docs_invariants_counts import (  # noqa: E402
    _derive_tools_count as _derive_tools_count,
)
from _docs_invariants_counts import (  # noqa: E402
    check_active_docs as check_active_docs,
)
from _docs_invariants_counts import (  # noqa: E402
    check_cognitive_budgets as check_cognitive_budgets,
)
from _docs_invariants_counts import (  # noqa: E402
    check_security_section_numbering as check_security_section_numbering,
)
from _docs_invariants_counts import (  # noqa: E402
    check_stale_surface_counts as check_stale_surface_counts,
)
from _docs_invariants_counts import (  # noqa: E402
    check_v2_mcp_surface_counts as check_v2_mcp_surface_counts,
)
from _docs_invariants_counts import (  # noqa: E402
    derive_expected_counts as derive_expected_counts,
)


def validate_repository_docs(root: Path) -> list[str]:
    """Ejecuta validaciones upstream o universales en consumidores (D5)."""
    upstream = is_upstream_blueprints_repo(root)
    if not upstream:
        return [
            *check_cognitive_budgets(root, upstream=False),
            *check_internal_markdown_links(root, upstream=False),
        ]
    counts = derive_expected_counts(root)
    return [
        *check_cognitive_budgets(root, upstream=True),
        *check_security_section_numbering(root),
        *check_active_docs(root),
        *check_stale_surface_counts(root, counts),
        *check_dual_consumer_parity(root),
        *check_bilingual_readme_parity(root),
        *check_bilingual_pair_parity(root),
        *check_v2_mcp_surface_counts(root),
        *check_internal_markdown_links(root, upstream=True),
        *check_historical_spec_links(root),
        *_check_refactoring_ui_topics(root),
        *_check_skill_backtick_references(root),
        *_check_markdown_fence_balance(root),
        *_check_claude_plugin_manifests(root),
        *_check_mcp_registry_manifest(root),
        *_check_specs_and_stack_contracts(root),
        *check_global_catalogs_and_geo(root),
        *check_testing_scoreboard_consistency(root),
        *check_mcp_release_and_cli_parity(root),
        *check_no_private_consumer_leaks(root),
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
