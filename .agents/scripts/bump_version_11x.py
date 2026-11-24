#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
"""Deterministically verify and synchronize QA-11X version and edition across files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
EDITION_RE = re.compile(r"^QA-11X v\d+\.\d+$")


@dataclass(frozen=True)
class VersionRule:
    """Target file and regex patterns where group 2 holds version or edition."""

    rel_path: str
    patterns: tuple[re.Pattern[str], ...]
    max_replacements: int = 0
    optional: bool = False
    major_minor_only: bool = False


def _bilingual_rules(
    rel_paths: tuple[str, ...],
    patterns: tuple[re.Pattern[str], ...],
    *,
    optional: bool = True,
) -> tuple[VersionRule, ...]:
    return tuple(
        VersionRule(rel_path, patterns, optional=optional)
        for rel_path in rel_paths
    )


_VER_CORE = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?"
_TESTING_VER_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(
        rf"((?:Corporate Standard|Estándar Corporativo) "
        rf"`QA-11X v\d+\.\d+`\s*\(`v)({_VER_CORE})(`\))"
    ),
    re.compile(rf"((?:Level|Nivel) 11X \(`v)({_VER_CORE})(`\))"),
    re.compile(rf"(`@sinfallas/mcp-qa-11x`\s*`v)({_VER_CORE})(`\))"),
    re.compile(
        rf"((?:Certified 11X Metrics|Métricas 11X Certificadas) "
        rf"\(`v)({_VER_CORE})(`\s*/\s*`QA-11X v\d+\.\d+`\))"
    ),
)
_TESTING_ED_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"((?:Corporate Standard|Estándar Corporativo) `)(QA-11X v\d+\.\d+)(`)"
    ),
    re.compile(r"(/\s*`)(QA-11X v\d+\.\d+)(`\):\*\*)"),
)
_AI_INT_VER_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(rf"(`@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})(\s)"),
    re.compile(rf"((?:and active in|y activo en)\s+`v)({_VER_CORE})(`\))"),
)
_PHILOSOPHY_VER_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(rf"(`@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})(,)"),
)
_PHILOSOPHY_ED_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(`qa-testing-blueprints`\s*\(`)(QA-11X v\d+\.\d+)(`\))"),
)
_ARCH_C4_VER_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(rf'(@sinfallas/mcp-qa-11x\s*v)({_VER_CORE})(\)"\])'),
)
_ARCH_C4_ED_PATS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(QA Testing Blueprints \(`)(QA-11X v\d+\.\d+)(`\))"),
)

VERSION_RULES: tuple[VersionRule, ...] = (
    VersionRule(
        "mcp-server/package.json",
        (re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        "manifest.json",
        (re.compile(r'^(\s*"blueprint_version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        ".agents/scripts/sync_governance.py",
        (re.compile(r'^(DEFAULT_BLUEPRINT_VERSION\s*=\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        "scripts/generar-manifiesto.py",
        (re.compile(r'^(DEFAULT_BLUEPRINT_VERSION\s*=\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        ".agents/scripts/certify_task_completion.sh",
        (re.compile(r'(os\.environ\.get\("QA_AGENT_VERSION",\s*")([^"]+)("\))'),),
    ),
    VersionRule(
        "architecture/qa-11x.calm.json",
        (re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        "mcp-server/tests/calm.test.ts",
        (
            re.compile(
                rf'^(\s*(?:"version"|version)\s*:\s*[\'"])({_VER_CORE})([\'"])',
                re.MULTILINE,
            ),
        ),
        max_replacements=1,
        optional=True,
    ),
    VersionRule(
        "catalogs/qaskills-pack.json",
        (re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        "catalogs/skillsllm-manifest.json",
        (re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
    ),
    VersionRule(
        "catalogs/agenticskills-submission.md",
        (
            re.compile(rf"(`QA-11X v[^`]+`,\s*`v)({_VER_CORE})(`)"),
            re.compile(rf"(`@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})([\) ])"),
            re.compile(
                rf"(\*\*Package Name:\*\*\s*`@sinfallas/mcp-qa-11x`\s*"
                rf"\(`v)({_VER_CORE})(`)"
            ),
        ),
    ),
    VersionRule(
        "llms.txt",
        (
            re.compile(rf"(@sinfallas/mcp-qa-11x`?[@ ]v?)({_VER_CORE})([\s\)`])"),
            re.compile(rf"(blueprint_version:\s*)({_VER_CORE})(`?\))"),
        ),
    ),
    VersionRule(
        ".agents/skills/qa-11x-architect/SKILL.md",
        (re.compile(rf"(`@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})(\s)"),),
    ),
    VersionRule(
        "mcp-server/example/verify-v2.sh",
        (re.compile(rf"(tarball v)({_VER_CORE})(\s)"),),
    ),
    VersionRule(
        "mcp-server/example/run-example-e2e.mjs",
        (re.compile(rf"(@sinfallas/mcp-qa-11x v)({_VER_CORE})(\.)"),),
    ),
    VersionRule(
        "mcp-server/example/README.md",
        (re.compile(rf"(`--version`\s*\(`)({_VER_CORE})(`\))"),),
    ),
    VersionRule(
        "mcp-server/example/README.es.md",
        (re.compile(rf"(`--version`\s*\(`)({_VER_CORE})(`\))"),),
        optional=True,
    ),
    VersionRule(
        "scripts/probar-mcp-example.sh",
        (re.compile(rf"(tarball v)({_VER_CORE})(\s)"),),
    ),
    VersionRule(
        ".github/actions/qa-11x-pr-check/action.yml",
        (re.compile(rf"(@sinfallas/mcp-qa-11x@)({_VER_CORE})(\s)"),),
        optional=True,
    ),
    VersionRule(
        "README.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([\) ])"),),
        optional=True,
    ),
    VersionRule(
        "README.es.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([\) ])"),),
        optional=True,
    ),
    VersionRule(
        "mcp-server/README.md",
        (
            re.compile(
                rf"(QA-11X v\d+\.\d+\s+—\s+v|Runtime Guards \(v|"
                rf"agentCard\.ts`?\]\([^)]+\)\s*\(`?v)({_VER_CORE})([`\)])"
            ),
        ),
        optional=True,
    ),
    VersionRule(
        "mcp-server/README.es.md",
        (
            re.compile(
                rf"(QA-11X v\d+\.\d+\s+—\s+v|Resiliencia Operativa \(v|"
                rf"agentCard\.ts`?\]\([^)]+\)\s*\(`?v)({_VER_CORE})([`\)])"
            ),
        ),
        optional=True,
    ),
    VersionRule(
        "RESOURCES.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})(\s)"),),
        optional=True,
    ),
    VersionRule(
        "RESOURCES.es.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`\s*v)({_VER_CORE})(\s)"),),
        optional=True,
    ),
    VersionRule(
        "FAQ.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([:\)\s])"),),
        optional=True,
    ),
    VersionRule(
        "FAQ.es.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([:\)\s])"),),
        optional=True,
    ),
    *_bilingual_rules(
        ("docs/ai-integration.md", "docs/ai-integration.es.md"),
        _AI_INT_VER_PATS,
    ),
    VersionRule(
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([:\s\)])"),),
        optional=True,
    ),
    VersionRule(
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
        (re.compile(rf"(@sinfallas/mcp-qa-11x`?\s*v)({_VER_CORE})([:\s\)])"),),
        optional=True,
    ),
    *_bilingual_rules(("TESTING.md", "TESTING.es.md"), _TESTING_VER_PATS),
    *_bilingual_rules(
        ("docs/qa-philosophy.md", "docs/qa-philosophy.es.md"),
        _PHILOSOPHY_VER_PATS,
    ),
    *_bilingual_rules(
        ("docs/ARCHITECTURE_C4.md", "docs/ARCHITECTURE_C4.es.md"),
        _ARCH_C4_VER_PATS,
    ),
    *_bilingual_rules(
        ("docs/agent-setup.md", "docs/agent-setup.es.md"),
        (
            re.compile(
                rf"(—\s*`v)({_VER_CORE})(`\s+(?:registers|registra)\s+\*\*\d+\s+)"
            ),
        ),
    ),
    VersionRule(
        "SECURITY.md",
        (
            re.compile(r"(\|\s*\*\*`)(\d+\.\d+)(\.x`\s*\(`main`\s*/\s*Active\)\*\*)"),
            re.compile(r"(Superseded by\s+`)(\d+\.\d+)(\.x`)"),
        ),
        optional=True,
        major_minor_only=True,
    ),
    VersionRule(
        "SECURITY.es.md",
        (
            re.compile(r"(\|\s*\*\*`)(\d+\.\d+)(\.x`\s*\(`main`\s*/\s*Activa\)\*\*)"),
            re.compile(r"(Reemplazada por\s+`)(\d+\.\d+)(\.x`)"),
        ),
        optional=True,
        major_minor_only=True,
    ),
    VersionRule(
        ".claude-plugin/plugin.json",
        (
            re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),
            re.compile(rf"(@sinfallas/mcp-qa-11x@)({_VER_CORE})([\"'])"),
        ),
        optional=True,
    ),
    VersionRule(
        ".claude-plugin/marketplace.json",
        (re.compile(r'^(\s*"version"\s*:\s*")([^"]+)(")', re.MULTILINE),),
        max_replacements=1,
        optional=True,
    ),
)

EDITION_RULES: tuple[VersionRule, ...] = (
    VersionRule(
        "mcp-server/package.json",
        (re.compile(r"(\()(QA-11X v\d+\.\d+)(:)"),),
    ),
    VersionRule(
        "catalogs/qaskills-pack.json",
        (
            re.compile(r'(\()(QA-11X v\d+\.\d+)(\)")'),
            re.compile(r'("standard_edition"\s*:\s*")(QA-11X v\d+\.\d+)(")'),
        ),
    ),
    VersionRule(
        "catalogs/skillsllm-manifest.json",
        (
            re.compile(r'(\()(QA-11X v\d+\.\d+)(\)")'),
            re.compile(r'("standard_edition"\s*:\s*")(QA-11X v\d+\.\d+)(")'),
        ),
    ),
    VersionRule(
        "catalogs/agenticskills-submission.md",
        (re.compile(r"(`)(QA-11X v\d+\.\d+)(`)"),),
    ),
    VersionRule(
        "llms.txt",
        (
            re.compile(r"(\()(QA-11X v\d+\.\d+)(\s—)"),
            re.compile(r"(—\s)(QA-11X v\d+\.\d+)(\s)"),
        ),
    ),
    VersionRule(
        ".agents/skills/qa-11x-architect/SKILL.md",
        (re.compile(r"(# Master )(QA-11X v\d+\.\d+)(\s)"),),
    ),
    VersionRule(
        "architecture/qa-11x.calm.json",
        (re.compile(r'("standard"\s*:\s*")(QA-11X v\d+\.\d+)(")'),),
    ),
    VersionRule(
        "README.md",
        (re.compile(r"([`(*\s])(QA-11X v\d+\.\d+)([`)*\s—])"),),
        optional=True,
    ),
    VersionRule(
        "README.es.md",
        (re.compile(r"([`(*\s])(QA-11X v\d+\.\d+)([`)*\s—])"),),
        optional=True,
    ),
    VersionRule(
        "mcp-server/README.md",
        (re.compile(r"(QA Testing Blueprints \()(QA-11X v\d+\.\d+)(\s—)"),),
        optional=True,
    ),
    VersionRule(
        "mcp-server/README.es.md",
        (re.compile(r"(QA Testing Blueprints \()(QA-11X v\d+\.\d+)(\s—)"),),
        optional=True,
    ),
    VersionRule(
        "mcp-server/tests/a2a.test.ts",
        (re.compile(r"(\.toBe\(['\"])(QA-11X v\d+\.\d+)(['\"\)\s])"),),
        max_replacements=1,
        optional=True,
    ),
    VersionRule(
        "mcp-server/src/services/github-fetcher.ts",
        (re.compile(r"(: ')(QA-11X v\d+\.\d+)(';)"),),
        max_replacements=1,
        optional=True,
    ),
    VersionRule(
        "mcp-server/tests/github-fetcher.unit.ts",
        (
            re.compile(
                r"(expect\(MCP_STANDARD_EDITION\)\.toBe\(['\"])"
                r"(QA-11X v\d+\.\d+)(['\"]\))"
            ),
            re.compile(
                r"(expect\(extractStandardEdition\(['\"]"
                r"Description without edition tag['\"]\)\)\.toBe\(['\"])"
                r"(QA-11X v\d+\.\d+)(['\"]\))"
            ),
            re.compile(
                r"(expect\(extractStandardEdition\(\)\)\.toBe\(['\"])"
                r"(QA-11X v\d+\.\d+)(['\"]\))"
            ),
        ),
        optional=True,
    ),
    VersionRule(
        "mcp-server/tests/live-mcp-protocol.test.ts",
        (
            re.compile(
                r"(expect\(card\.standardVersion\)\.toBe\(['\"])"
                r"(QA-11X v\d+\.\d+)(['\"]\))"
            ),
        ),
        max_replacements=1,
        optional=True,
    ),
    VersionRule(
        "mcp-server/tests/calm.test.ts",
        (
            re.compile(
                r'^(\s*(?:"standard"|standard)\s*:\s*[\'"])'
                r"(QA-11X v\d+\.\d+)([\'\"])",
                re.MULTILINE,
            ),
        ),
        max_replacements=1,
        optional=True,
    ),
    VersionRule(
        "RESOURCES.md",
        (re.compile(r"(`)(QA-11X v\d+\.\d+)(`)"),),
        optional=True,
    ),
    VersionRule(
        "RESOURCES.es.md",
        (re.compile(r"(`)(QA-11X v\d+\.\d+)(`)"),),
        optional=True,
    ),
    VersionRule(
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.md",
        (re.compile(r"(\*\*|[\s\(])(QA-11X v\d+\.\d+)([\*\s\),])"),),
        optional=True,
    ),
    VersionRule(
        "docs/01_ARQUITECTURA_PIRAMIDE_11X.es.md",
        (re.compile(r"(\*\*|[\s\(])(QA-11X v\d+\.\d+)([\*\s\),])"),),
        optional=True,
    ),
    VersionRule(
        "php/README.md",
        (re.compile(r"(\()(QA-11X v\d+\.\d+)(\))"),),
        optional=True,
    ),
    VersionRule(
        "php/README.es.md",
        (re.compile(r"(\()(QA-11X v\d+\.\d+)(\))"),),
        optional=True,
    ),
    VersionRule(
        "lefthook.yml",
        (re.compile(r"(\()(QA-11X v\d+\.\d+)(\))"),),
        optional=True,
    ),
    VersionRule(
        ".agents/scripts/compact_context_11x.py",
        (re.compile(r"([\s\(])(QA-11X v\d+\.\d+)([\.:\)])"),),
        optional=True,
    ),
    *_bilingual_rules(("TESTING.md", "TESTING.es.md"), _TESTING_ED_PATS),
    *_bilingual_rules(
        ("docs/qa-philosophy.md", "docs/qa-philosophy.es.md"),
        _PHILOSOPHY_ED_PATS,
    ),
    *_bilingual_rules(
        ("docs/ARCHITECTURE_C4.md", "docs/ARCHITECTURE_C4.es.md"),
        _ARCH_C4_ED_PATS,
    ),
    *_bilingual_rules(
        ("docs/specs/README.md", "docs/specs/README.es.md"),
        (re.compile(r"(\*\*QA Testing Blueprints \(`)(QA-11X v\d+\.\d+)(`\)\*\*)"),),
    ),
    VersionRule(
        ".claude-plugin/plugin.json",
        (
            re.compile(
                r'("displayName"\s*:\s*"QA Testing Blueprints \()'
                r'(QA-11X v\d+\.\d+)(\)")'
            ),
            re.compile(
                r'("description"\s*:\s*"Enterprise QA & DevSecOps Standard \()'
                r'(QA-11X v\d+\.\d+)(\):)'
            ),
        ),
        optional=True,
    ),
    VersionRule(
        ".claude-plugin/marketplace.json",
        (
            re.compile(
                r'("description"\s*:\s*"Enterprise QA & DevSecOps Standard \()'
                r'(QA-11X v\d+\.\d+)(\):)'
            ),
        ),
        optional=True,
    ),
)


def _read_json_field(path: Path, field: str) -> str | None:
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    val = data.get(field)
    return str(val) if isinstance(val, str) and val.strip() else None


def resolve_targets(
    root: Path, requested_version: str | None, requested_edition: str | None
) -> tuple[str, str | None]:
    """Resolve and validate target version and optional edition."""
    version = requested_version or _read_json_field(
        root / "mcp-server" / "package.json", "version"
    )
    if not version or not SEMVER_RE.match(version):
        raise ValueError(f"Invalid or missing target version: {version!r}")
    edition = requested_edition or _read_json_field(
        root / "catalogs" / "qaskills-pack.json", "standard_edition"
    )
    if edition is not None and not EDITION_RE.match(edition):
        raise ValueError(f"Invalid standard edition format: {edition!r}")
    return version, edition


def _check_pattern_matches(
    rel_path: str,
    pattern: re.Pattern[str],
    text: str,
    expected: str,
    max_replacements: int,
) -> list[str]:
    pat_matches = list(pattern.finditer(text))
    if not pat_matches:
        return [f"{rel_path}: anchor missing ({pattern.pattern})"]
    if max_replacements > 0:
        pat_matches = pat_matches[:max_replacements]
    return [
        f"{rel_path}: found {match.group(2)!r}, expected {expected!r}"
        for match in pat_matches
        if match.group(2) != expected
    ]


def find_mismatches(text: str, rule: VersionRule, expected: str) -> list[str]:
    """Return mismatch descriptions for all pattern matches in text."""
    errors: list[str] = []
    for pattern in rule.patterns:
        errors.extend(
            _check_pattern_matches(
                rule.rel_path, pattern, text, expected, rule.max_replacements
            )
        )
    return errors


def apply_rule(text: str, rule: VersionRule, expected: str) -> tuple[str, int]:
    """Replace all anchored values with expected and return new text + change count."""
    updated = text
    matched_patterns = 0
    for pattern in rule.patterns:
        updated, count = pattern.subn(
            lambda m: f"{m.group(1)}{expected}{m.group(3)}",
            updated,
            count=rule.max_replacements,
        )
        if count > 0:
            matched_patterns += 1
    return updated, matched_patterns


def _missing_file_result(rule: VersionRule) -> tuple[list[str], int]:
    if rule.optional:
        return [], 0
    return [f"{rule.rel_path}: missing file"], 0


def _mode_label(write_mode: bool, dry_run: bool) -> str:
    if write_mode:
        return "Updated"
    return "Dry-run checked" if dry_run else "Verified"


def _print_errors(errors: list[str]) -> int:
    for err in errors:
        print(f"FAIL [bump_version_11x] {err}", file=sys.stderr)
    return 1


def _rule_expected(rule: VersionRule, expected: str) -> str:
    if not rule.major_minor_only:
        return expected
    return ".".join(expected.split(".")[:2])


def process_rule(
    root: Path,
    rule: VersionRule,
    expected: str,
    apply_changes: bool,
    *,
    persist: bool = True,
) -> tuple[list[str], int]:
    """Check or update a single VersionRule on disk (or dry-run in memory)."""
    target = root / rule.rel_path
    if not target.is_file():
        return _missing_file_result(rule)
    rule_expected = _rule_expected(rule, expected)
    original = target.read_text(encoding="utf-8")
    if not apply_changes:
        return find_mismatches(original, rule, rule_expected), 0
    rewritten, matched_pats = apply_rule(original, rule, rule_expected)
    if matched_pats != len(rule.patterns):
        return [f"{rule.rel_path}: missing one or more version/edition anchors"], 0
    if rewritten != original and persist:
        target.write_text(rewritten, encoding="utf-8")
        return [], 1
    return [], 0


def run_rules(
    root: Path,
    rules: tuple[VersionRule, ...],
    expected: str,
    apply_changes: bool,
    *,
    persist: bool = True,
) -> tuple[list[str], int]:
    """Execute a group of rules and aggregate errors and modified file counts."""
    all_errors: list[str] = []
    updated_count = 0
    for rule in rules:
        errors, changed = process_rule(
            root, rule, expected, apply_changes, persist=persist
        )
        all_errors.extend(errors)
        updated_count += changed
    return all_errors, updated_count


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments for version verification and synchronized updates."""
    parser = argparse.ArgumentParser(
        description="Verify or synchronize QA-11X version and edition across artifacts."
    )
    parser.add_argument("--workspace", default=".", help="Repository root path")
    parser.add_argument(
        "--check", action="store_true", help="Verify version parity only"
    )
    parser.add_argument("--set", dest="set_version", help="Target SemVer X.Y.Z")
    parser.add_argument("--edition", help="Target edition e.g. 'QA-11X v3.5'")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    args = parse_args(argv)
    root = Path(args.workspace).resolve()
    try:
        version, edition = resolve_targets(root, args.set_version, args.edition)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"FAIL [bump_version_11x] {exc}", file=sys.stderr)
        return 2

    apply_mode = bool(args.set_version or args.edition) and not args.check
    persist_mode = apply_mode and not args.dry_run
    errors, changed = run_rules(
        root, VERSION_RULES, version, apply_mode, persist=persist_mode
    )
    if edition is not None:
        ed_errors, ed_changed = run_rules(
            root, EDITION_RULES, edition, apply_mode, persist=persist_mode
        )
        errors.extend(ed_errors)
        changed += ed_changed

    if errors:
        return _print_errors(errors)

    action = _mode_label(persist_mode, args.dry_run)
    ed = edition or "n/a"
    print(
        f"OK [bump_version_11x] {action} version={version} "
        f"edition={ed} (writes={changed})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
