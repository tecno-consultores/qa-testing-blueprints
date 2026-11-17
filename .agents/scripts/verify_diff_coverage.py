#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Auditor determinista de cobertura diferencial multi-stack QA 11X (Hito 21)."""

from __future__ import annotations

import argparse
import importlib
import math
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

EXIT_OK = 0
EXIT_COVERAGE_FAIL = 10
EXIT_EVASION_DETECTED = 11
EXIT_SECURITY_OR_MISSING_REPORT = 12

SAFE_GIT_REF_RE = re.compile(r"^[a-zA-Z0-9._/~^-]+$")
HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
CONDITION_COV_RE = re.compile(r"\((\d+)/(\d+)\)")
APPROVED_EXCLUSION_RE = re.compile(r"QA11X-APPROVED-EXCLUSION\(\s*[^)\s][^)]*\)")
CONTAINER_PREFIX_RE = re.compile(r"^(?:/app/|/workspace/|/repo/)")

EVASION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "pragma no cov" + "er",
        re.compile(r"#\s*pragma:\s*no\s+cov" + r"er\b", re.IGNORECASE),
    ),
    (
        "v8/c8 ig" + "nore",
        re.compile(r"(?:/\*|//)\s*(?:v8|c8)\s+ig" + r"nore\b", re.IGNORECASE),
    ),
    (
        "codeCoverageIg" + "nore",
        re.compile(r"@codeCoverage" + r"Ignore(?:Start|End)?\b"),
    ),
)

PRODUCTIVE_EXTENSIONS = frozenset(
    {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".php", ".sh"}
)
NON_PRODUCTIVE_DIR_SEGMENTS = frozenset(
    {
        "tests",
        "test",
        "__tests__",
        "e2e",
        "cypress",
        "playwright",
        "migrations",
        "example",
        "fixtures",
    }
)
NON_PRODUCTIVE_BASENAME_RE = re.compile(
    r"^(?:test_.*\.py|.*_test\.py|.*\.(?:unit|test|spec|e2e)\.[^.]+|conftest\.py|"
    r"(?:vitest|vite|playwright|eslint)\.config\.[^.]+|wdio\.conf\.[^.]+)$"
)
GENERIC_REPORT_STEMS = frozenset(
    {"python", "cobertura", "node-cobertura", "php", "bash", "lcov", "coverage"}
)


class SecurityValidationError(Exception):
    """Error de validación de seguridad (Anti-XXE, Path Traversal o Git Ref)."""


@dataclass(frozen=True)
class DiffCoverageConfig:
    workspace: Path
    base_ref: str | None = None
    min_line_cov: float = 100.0
    min_branch_cov: float = 90.0
    reports_dir: str = ".agents/.cache/coverage"


@dataclass
class FileCoverageData:
    executable_lines: set[int] = field(default_factory=set)
    line_hits: dict[int, int] = field(default_factory=dict)
    branch_counts: dict[int, tuple[int, int]] = field(default_factory=dict)

    def merge_line(self, line_no: int, hits: int) -> None:
        self.executable_lines.add(line_no)
        self.line_hits[line_no] = self.line_hits.get(line_no, 0) + max(0, hits)

    def merge_branch(self, line_no: int, covered: int, total: int) -> None:
        if total <= 0:
            return
        prev_cov, prev_tot = self.branch_counts.get(line_no, (0, 0))
        self.branch_counts[line_no] = (
            max(prev_cov, min(covered, total)),
            max(prev_tot, total),
        )


@dataclass(frozen=True)
class DiffFileChange:
    path: str
    is_new_file: bool
    added_lines: dict[int, str]


@dataclass
class _DiffParseState:
    changes: dict[str, DiffFileChange]
    current_path: str | None = None
    is_new: bool = False
    in_hunk: bool = False
    next_line: int = 0
    lines: dict[int, str] = field(default_factory=dict)

    def flush(self) -> None:
        if self.current_path and self.lines:
            self.changes[self.current_path] = DiffFileChange(
                path=self.current_path,
                is_new_file=self.is_new,
                added_lines=dict(self.lines),
            )
        self.lines = {}


@dataclass(frozen=True)
class FileDeltaMetrics:
    file_path: str
    covered_lines: int
    total_lines: int
    line_pct: float
    covered_branches: int
    total_branches: int
    branch_pct: float
    uncovered_lines: tuple[int, ...]
    missing_from_reports: bool = False


@dataclass(frozen=True)
class DiffCoverageReport:
    exit_code: int
    status: str
    line_coverage_pct: float
    branch_coverage_pct: float
    covered_delta_lines: int
    total_delta_lines: int
    covered_delta_branches: int
    total_delta_branches: int
    file_metrics: tuple[FileDeltaMetrics, ...]
    evasion_findings: tuple[str, ...]
    missing_report_files: tuple[str, ...]
    error_detail: str | None
    summary_line: str
    min_branch_cov: float = 90.0


def _ensure_contained_path(workspace_root: Path, candidate: Path, label: str) -> Path:
    if "\0" in str(candidate):
        raise SecurityValidationError(f"Ruta inválida con byte nulo en {label}.")
    ws_real = workspace_root.resolve()
    ws_lex = Path(os.path.normpath(str(workspace_root)))
    lexical = Path(os.path.normpath(str(candidate)))
    if not (lexical.is_relative_to(ws_lex) or lexical.is_relative_to(ws_real)):
        raise SecurityValidationError(
            f"La ruta '{candidate}' escapa el workspace permitido."
        )
    is_linked_or_exists = candidate.is_symlink() or candidate.exists()
    resolved = (
        candidate.resolve()
        if is_linked_or_exists
        else candidate.parent.resolve() / candidate.name
    )
    if not resolved.is_relative_to(ws_real):
        raise SecurityValidationError(
            f"Enlace simbólico fuera del workspace detectado en '{candidate}'."
        )
    return resolved


def resolve_contained_reports_dir(workspace_root: Path, reports_dir: str) -> Path:
    if "\0" in reports_dir or not reports_dir.strip():
        raise SecurityValidationError("Directorio de reportes inválido.")
    raw = Path(reports_dir)
    candidate = raw if raw.is_absolute() else workspace_root / raw
    return _ensure_contained_path(workspace_root, candidate, "reports_dir")


def _strip_path_prefixes(raw_path: str, workspace_root: Path) -> str:
    norm = raw_path.replace("\\", "/").strip()
    ws_prefix = workspace_root.as_posix().rstrip("/") + "/"
    norm = norm.removeprefix(ws_prefix)
    norm = CONTAINER_PREFIX_RE.sub("", norm)
    while norm.startswith("./"):
        norm = norm[2:]
    return norm


def _candidate_rel_paths(
    rel: str, sources: tuple[str, ...], workspace_root: Path, report_stem: str
) -> list[str]:
    candidates = [rel]
    for src in sources:
        norm_src = _strip_path_prefixes(src, workspace_root).strip("/")
        if norm_src and norm_src != "." and not rel.startswith(f"{norm_src}/"):
            candidates.append(f"{norm_src}/{rel}")
    if report_stem not in GENERIC_REPORT_STEMS and not rel.startswith(
        f"{report_stem}/"
    ):
        candidates.append(f"{report_stem}/{rel}")
    return candidates


def normalize_reported_path(
    raw_path: str,
    workspace_root: Path,
    sources: tuple[str, ...] = (),
    report_stem: str = "",
) -> str:
    rel = _strip_path_prefixes(raw_path, workspace_root)
    if not rel:
        return ""
    ws_real = workspace_root.resolve()
    for candidate in _candidate_rel_paths(rel, sources, workspace_root, report_stem):
        full = workspace_root / candidate
        if full.is_file() and full.resolve().is_relative_to(ws_real):
            return candidate
    return rel


def _get_or_create_cov(
    cov_map: dict[str, FileCoverageData], rel_path: str
) -> FileCoverageData:
    if rel_path not in cov_map:
        cov_map[rel_path] = FileCoverageData()
    return cov_map[rel_path]


def _extract_cobertura_sources(root: ET.Element) -> tuple[str, ...]:
    sources: list[str] = []
    for node in root.findall("./sources/source"):
        if node.text and node.text.strip():
            sources.append(node.text.strip())
    return tuple(sources)


def _record_cobertura_line(file_cov: FileCoverageData, line_elem: ET.Element) -> None:
    try:
        line_num = int(line_elem.attrib["number"])
        raw_hits = float(line_elem.attrib.get("hits", "0"))
    except (KeyError, ValueError, TypeError) as exc:
        raise SecurityValidationError(
            f"Línea Cobertura XML inválida: {line_elem.attrib!r}"
        ) from exc
    if not math.isfinite(raw_hits):
        raise SecurityValidationError(
            f"Conteo de hits no finito en Cobertura XML: {line_elem.attrib!r}"
        )
    file_cov.merge_line(line_num, int(raw_hits))
    cond_cov = line_elem.attrib.get("condition-coverage", "")
    match = CONDITION_COV_RE.search(cond_cov)
    if match:
        file_cov.merge_branch(line_num, int(match.group(1)), int(match.group(2)))


def _resolve_safe_xml_fromstring() -> Callable[[str], ET.Element]:
    try:
        mod = importlib.import_module("defusedxml.ElementTree")
        fn: Callable[[str], ET.Element] = mod.fromstring
        return fn
    except ImportError:
        return ET.fromstring


def _parse_xml_strict(raw_xml: str) -> ET.Element:
    upper = raw_xml.upper()
    if "<!DOCTYPE" in upper or "<!ENTITY" in upper:
        raise SecurityValidationError(
            "Violación Anti-XXE (APSC-DV-002390/002550): "
            "<!DOCTYPE/<!ENTITY prohibido en XML."
        )
    try:
        parse_fn = _resolve_safe_xml_fromstring()
        return parse_fn(raw_xml)
    except (ET.ParseError, ValueError, TypeError, LookupError) as exc:
        raise SecurityValidationError(
            f"Reporte XML inválido o corrupto: {exc}"
        ) from exc


def _record_cobertura_class(
    class_elem: ET.Element,
    workspace_root: Path,
    cov_map: dict[str, FileCoverageData],
    sources: tuple[str, ...],
    report_stem: str,
) -> None:
    filename = class_elem.attrib.get("filename", "")
    rel_path = normalize_reported_path(filename, workspace_root, sources, report_stem)
    if not rel_path:
        return
    file_cov = _get_or_create_cov(cov_map, rel_path)
    for line_elem in class_elem.findall("./lines/line"):
        _record_cobertura_line(file_cov, line_elem)


def parse_cobertura_xml(
    raw_xml: str,
    workspace_root: Path,
    cov_map: dict[str, FileCoverageData],
    report_stem: str = "",
) -> None:
    root = _parse_xml_strict(raw_xml)
    sources = _extract_cobertura_sources(root)
    for class_elem in root.iter("class"):
        _record_cobertura_class(
            class_elem, workspace_root, cov_map, sources, report_stem
        )


def _flush_lcov_branches(
    file_cov: FileCoverageData,
    branches_by_line: dict[int, dict[tuple[str, str], int]],
) -> None:
    for line_no, branch_map in branches_by_line.items():
        total = len(branch_map)
        covered = sum(1 for taken in branch_map.values() if taken > 0)
        file_cov.merge_branch(line_no, covered, total)


def _parse_lcov_da(file_cov: FileCoverageData, payload: str) -> None:
    parts = payload.split(",")
    if len(parts) < 2:
        return
    try:
        line_no, hits = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise SecurityValidationError(
            f"Registro LCOV DA inválido: {payload!r}"
        ) from exc
    file_cov.merge_line(line_no, hits)


def _parse_lcov_brda(
    branches_by_line: dict[int, dict[tuple[str, str], int]],
    payload: str,
) -> None:
    parts = payload.split(",")
    if len(parts) < 4:
        return
    try:
        line_no = int(parts[0])
        taken = 0 if parts[3] == "-" else int(parts[3])
    except ValueError as exc:
        raise SecurityValidationError(
            f"Registro LCOV BRDA inválido: {payload!r}"
        ) from exc
    line_map = branches_by_line.setdefault(line_no, {})
    key = (parts[1], parts[2])
    line_map[key] = max(line_map.get(key, 0), taken)


LcovState = tuple[FileCoverageData | None, dict[int, dict[tuple[str, str], int]]]


def _apply_lcov_record(
    line: str,
    file_cov: FileCoverageData,
    branch_acc: dict[int, dict[tuple[str, str], int]],
) -> None:
    if line.startswith("DA:"):
        _parse_lcov_da(file_cov, line[3:])
    elif line.startswith("BRDA:"):
        _parse_lcov_brda(branch_acc, line[5:])


def _process_lcov_line(
    line: str,
    current: LcovState,
    workspace_root: Path,
    cov_map: dict[str, FileCoverageData],
    report_stem: str,
) -> LcovState:
    file_cov, branch_acc = current
    if line.startswith("SF:"):
        rel_path = normalize_reported_path(line[3:], workspace_root, (), report_stem)
        return (_get_or_create_cov(cov_map, rel_path) if rel_path else None), {}
    if line == "end_of_record" and file_cov is not None:
        _flush_lcov_branches(file_cov, branch_acc)
        return None, {}
    if file_cov is not None:
        _apply_lcov_record(line, file_cov, branch_acc)
    return current


def parse_lcov_info(
    raw_lcov: str,
    workspace_root: Path,
    cov_map: dict[str, FileCoverageData],
    report_stem: str = "",
) -> None:
    state: LcovState = (None, {})
    for raw_line in raw_lcov.splitlines():
        state = _process_lcov_line(
            raw_line.strip(), state, workspace_root, cov_map, report_stem
        )
    if state[0] is not None and state[1]:
        _flush_lcov_branches(state[0], state[1])


def _load_single_report(
    report_file: Path,
    workspace_root: Path,
    cov_map: dict[str, FileCoverageData],
) -> None:
    if not report_file.is_file():
        return
    safe_report = _ensure_contained_path(workspace_root, report_file, report_file.name)
    text = safe_report.read_text(encoding="utf-8-sig", errors="replace")
    if safe_report.suffix == ".xml":
        parse_cobertura_xml(text, workspace_root, cov_map, safe_report.stem)
    elif safe_report.suffix == ".info":
        parse_lcov_info(text, workspace_root, cov_map, safe_report.stem)


def load_coverage_reports(
    workspace_root: Path, reports_dir: Path
) -> dict[str, FileCoverageData]:
    cov_map: dict[str, FileCoverageData] = {}
    if not reports_dir.is_dir():
        return cov_map
    for report_file in sorted(reports_dir.iterdir()):
        _load_single_report(report_file, workspace_root, cov_map)
    return cov_map


def _git_cmd(workspace_root: Path, *args: str) -> list[str]:
    return [
        "git",
        "-c",
        f"safe.directory={workspace_root}",
        "-c",
        "core.quotePath=false",
        *args,
    ]


def resolve_git_diff_target(workspace_root: Path, base_ref: str | None) -> str | None:
    if base_ref is None:
        head_check = subprocess.run(
            _git_cmd(workspace_root, "rev-parse", "--verify", "HEAD"),
            cwd=workspace_root,
            capture_output=True,
            text=True,
            shell=False,
            check=False,
        )
        return "HEAD" if head_check.returncode == 0 else None
    if not SAFE_GIT_REF_RE.match(base_ref) or base_ref.startswith("-"):
        raise SecurityValidationError(
            f"Referencia Git insegura o inválida: {base_ref!r}"
        )
    merge_base = subprocess.run(
        _git_cmd(workspace_root, "merge-base", base_ref, "HEAD"),
        cwd=workspace_root,
        capture_output=True,
        text=True,
        shell=False,
        check=False,
    )
    sha = merge_base.stdout.strip()
    return sha if merge_base.returncode == 0 and sha else base_ref


def _handle_diff_metadata(line: str, state: _DiffParseState) -> bool:
    if line.startswith("diff --git "):
        state.flush()
        parts = line.split(" b/", 1)
        state.current_path = parts[1].strip().strip('"') if len(parts) == 2 else None
        state.is_new = False
        state.in_hunk = False
        state.next_line = 0
        return True
    if state.in_hunk:
        return False
    if line.startswith(("new file mode ", "--- /dev/null")):
        state.is_new = True
        return True
    if line.startswith("+++ "):
        target = line[4:].strip().strip('"')
        state.current_path = (
            None if target == "/dev/null" else target.removeprefix("b/")
        )
        return True
    return False


def _process_diff_line(line: str, state: _DiffParseState) -> None:
    if _handle_diff_metadata(line, state):
        return
    if line.startswith("@@ "):
        match = HUNK_HEADER_RE.match(line)
        state.next_line = int(match.group(1)) if match else 0
        state.in_hunk = state.next_line > 0
        return
    if state.current_path and state.in_hunk and line.startswith("+"):
        state.lines[state.next_line] = line[1:]
        state.next_line += 1


def parse_unified_diff(diff_text: str) -> dict[str, DiffFileChange]:
    state = _DiffParseState(changes={})
    for line in diff_text.splitlines():
        _process_diff_line(line, state)
    state.flush()
    return state.changes


def _collect_untracked_files(
    workspace_root: Path, changes: dict[str, DiffFileChange]
) -> None:
    res = subprocess.run(
        _git_cmd(workspace_root, "ls-files", "--others", "--exclude-standard"),
        cwd=workspace_root,
        capture_output=True,
        text=True,
        shell=False,
        check=True,
    )
    for rel in sorted(res.stdout.splitlines()):
        clean = rel.strip()
        if not clean or clean in changes:
            continue
        candidate = _ensure_contained_path(
            workspace_root, workspace_root / clean, clean
        )
        if not candidate.is_file():
            continue
        lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
        if lines:
            changes[clean] = DiffFileChange(
                path=clean,
                is_new_file=True,
                added_lines={idx: text for idx, text in enumerate(lines, 1)},
            )


def _is_ci_env() -> bool:
    return (
        os.environ.get("GITHUB_ACTIONS", "").lower() == "true"
        or os.environ.get("CI", "").lower() == "true"
        or bool(os.environ.get("GITHUB_BASE_REF", "").strip())
    )


def _git_ref_exists(workspace_root: Path, ref: str) -> bool:
    res = subprocess.run(
        _git_cmd(workspace_root, "rev-parse", "--verify", ref),
        cwd=workspace_root,
        capture_output=True,
        text=True,
        shell=False,
        check=False,
    )
    return res.returncode == 0


def _resolve_ci_diff_range(workspace_root: Path) -> str | None:
    if not _is_ci_env():
        return None
    gh_base = os.environ.get("GITHUB_BASE_REF", "").strip()
    if (
        gh_base
        and not gh_base.startswith("-")
        and ".." not in gh_base
        and SAFE_GIT_REF_RE.match(gh_base)
    ):
        origin_ref = f"origin/{gh_base}"
        if _git_ref_exists(workspace_root, origin_ref):
            return f"{origin_ref}...HEAD"
    if _git_ref_exists(workspace_root, "HEAD~1"):
        return "HEAD~1..HEAD"
    return None


def _run_git_diff(workspace_root: Path, diff_target: str) -> str:
    diff_args = _git_cmd(
        workspace_root,
        "diff",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        diff_target,
    )
    diff_res = subprocess.run(
        diff_args,
        cwd=workspace_root,
        capture_output=True,
        text=True,
        shell=False,
        check=True,
    )
    return diff_res.stdout


def collect_git_changes(
    workspace_root: Path, base_ref: str | None
) -> dict[str, DiffFileChange]:
    target = resolve_git_diff_target(workspace_root, base_ref)
    raw_diff = _run_git_diff(
        workspace_root, target if target is not None else "--cached"
    )
    if base_ref is None and target == "HEAD" and not raw_diff.strip():
        ci_range = _resolve_ci_diff_range(workspace_root)
        if ci_range is not None:
            raw_diff = _run_git_diff(workspace_root, ci_range)
    changes = parse_unified_diff(raw_diff)
    if base_ref is None:
        _collect_untracked_files(workspace_root, changes)
    return changes


def is_doc_file(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/").lstrip("./").lower()
    if norm.endswith((".md", ".mdx")):
        return True
    return norm.startswith("docs/") or "/docs/" in norm


def is_test_file(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/").lstrip("./")
    parts = norm.split("/")
    if any(seg in NON_PRODUCTIVE_DIR_SEGMENTS for seg in parts[:-1]):
        return True
    return bool(NON_PRODUCTIVE_BASENAME_RE.match(parts[-1]))


def is_productive_source_file(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/").lstrip("./")
    if norm.endswith(".d.ts") or "alembic/versions/" in norm:
        return False
    if is_doc_file(norm) or is_test_file(norm):
        return False
    return Path(norm).suffix.lower() in PRODUCTIVE_EXTENSIONS


def _has_non_trivial_code(added_lines: dict[int, str]) -> bool:
    for text in added_lines.values():
        stripped = text.strip()
        if stripped and not stripped.startswith(("#", "//", "/*", "*", "*/")):
            return True
    return False


def _match_evasion_label(line_text: str) -> str | None:
    for label, pattern in EVASION_PATTERNS:
        if pattern.search(line_text):
            return label
    return None


def _scan_file_evasions(rel_path: str, added: dict[int, str]) -> list[str]:
    findings: list[str] = []
    for line_no in sorted(added):
        label = _match_evasion_label(added[line_no])
        if label is None:
            continue
        prev_line = added.get(line_no - 1, "")
        if APPROVED_EXCLUSION_RE.search(added[line_no]) or APPROVED_EXCLUSION_RE.search(
            prev_line
        ):
            continue
        findings.append(
            f"{rel_path}:{line_no}: directiva de evasión '{label}' "
            "sin marcador QA11X-APPROVED-EXCLUSION(<motivo>)"
        )
    return findings


def detect_diff_evasions(changes: dict[str, DiffFileChange]) -> tuple[str, ...]:
    findings: list[str] = []
    for rel_path in sorted(changes):
        if is_doc_file(rel_path) or is_test_file(rel_path):
            continue
        findings.extend(_scan_file_evasions(rel_path, changes[rel_path].added_lines))
    return tuple(findings)


def _compute_file_delta(
    rel_path: str, change: DiffFileChange, cov_data: FileCoverageData
) -> FileDeltaMetrics | None:
    delta_exec = sorted(
        line_no
        for line_no in change.added_lines
        if line_no in cov_data.executable_lines
    )
    delta_branch_lines = sorted(
        line_no for line_no in change.added_lines if line_no in cov_data.branch_counts
    )
    if not delta_exec and not delta_branch_lines:
        return None
    uncovered = tuple(ln for ln in delta_exec if cov_data.line_hits.get(ln, 0) <= 0)
    covered_lines = len(delta_exec) - len(uncovered)
    line_pct = (covered_lines * 100.0 / len(delta_exec)) if delta_exec else 100.0
    cov_b = sum(cov_data.branch_counts[ln][0] for ln in delta_branch_lines)
    tot_b = sum(cov_data.branch_counts[ln][1] for ln in delta_branch_lines)
    branch_pct = (cov_b * 100.0 / tot_b) if tot_b > 0 else 100.0
    return FileDeltaMetrics(
        file_path=rel_path,
        covered_lines=covered_lines,
        total_lines=len(delta_exec),
        line_pct=round(line_pct, 2),
        covered_branches=cov_b,
        total_branches=tot_b,
        branch_pct=round(branch_pct, 2),
        uncovered_lines=uncovered,
        missing_from_reports=False,
    )


def _evaluate_productive_file(
    rel_path: str,
    change: DiffFileChange,
    cov_data: FileCoverageData | None,
) -> FileDeltaMetrics | None:
    if cov_data is not None:
        return _compute_file_delta(rel_path, change, cov_data)
    if _has_non_trivial_code(change.added_lines):
        return FileDeltaMetrics(
            rel_path,
            0,
            len(change.added_lines),
            0.0,
            0,
            0,
            100.0,
            tuple(sorted(change.added_lines)),
            True,
        )
    return None


def _evaluate_file_metrics(
    changes: dict[str, DiffFileChange],
    cov_map: dict[str, FileCoverageData],
) -> tuple[list[FileDeltaMetrics], list[str]]:
    metrics: list[FileDeltaMetrics] = []
    missing_reports: list[str] = []
    for rel_path in sorted(changes):
        if not is_productive_source_file(rel_path):
            continue
        delta = _evaluate_productive_file(
            rel_path, changes[rel_path], cov_map.get(rel_path)
        )
        if delta is not None:
            metrics.append(delta)
            if delta.missing_from_reports:
                missing_reports.append(rel_path)
    return metrics, missing_reports


def _build_failure_report(
    exit_code: int,
    status: str,
    summary_line: str,
    evasion_findings: tuple[str, ...] = (),
    missing_report_files: tuple[str, ...] = (),
    error_detail: str | None = None,
) -> DiffCoverageReport:
    return DiffCoverageReport(
        exit_code=exit_code,
        status=status,
        line_coverage_pct=0.0,
        branch_coverage_pct=0.0,
        covered_delta_lines=0,
        total_delta_lines=0,
        covered_delta_branches=0,
        total_delta_branches=0,
        file_metrics=(),
        evasion_findings=evasion_findings,
        missing_report_files=missing_report_files,
        error_detail=error_detail,
        summary_line=summary_line,
    )


def _compute_global_totals(
    metrics: list[FileDeltaMetrics],
    missing_reports: list[str],
    config: DiffCoverageConfig,
) -> DiffCoverageReport:
    cov_lines = sum(m.covered_lines for m in metrics)
    tot_lines = sum(m.total_lines for m in metrics)
    cov_branches = sum(m.covered_branches for m in metrics)
    tot_branches = sum(m.total_branches for m in metrics)
    line_pct = round((cov_lines * 100.0 / tot_lines) if tot_lines > 0 else 100.0, 2)
    branch_pct = round(
        (cov_branches * 100.0 / tot_branches) if tot_branches > 0 else 100.0, 2
    )
    line_failed = (
        cov_lines < tot_lines
        if config.min_line_cov >= 100.0
        else line_pct < config.min_line_cov
    )
    failed_cov = line_failed or (
        tot_branches > 0 and branch_pct < config.min_branch_cov
    )
    exit_code = (
        EXIT_SECURITY_OR_MISSING_REPORT
        if missing_reports
        else (EXIT_COVERAGE_FAIL if failed_cov else EXIT_OK)
    )
    status = "FAILED" if exit_code != EXIT_OK else "PASSED"
    summary = (
        f"{'✔' if exit_code == EXIT_OK else '❌'} [Diff Coverage] {status} | "
        f"líneas={line_pct:.2f}% ({cov_lines}/{tot_lines}) | "
        f"ramas={branch_pct:.2f}% ({cov_branches}/{tot_branches}) | "
        f"archivos={len(metrics)}"
    )
    return DiffCoverageReport(
        exit_code=exit_code,
        status=status,
        line_coverage_pct=line_pct,
        branch_coverage_pct=branch_pct,
        covered_delta_lines=cov_lines,
        total_delta_lines=tot_lines,
        covered_delta_branches=cov_branches,
        total_delta_branches=tot_branches,
        file_metrics=tuple(metrics),
        evasion_findings=(),
        missing_report_files=tuple(missing_reports),
        error_detail=None,
        summary_line=summary,
        min_branch_cov=config.min_branch_cov,
    )


def _validate_cov_thresholds(config: DiffCoverageConfig) -> None:
    for label, val in (
        ("min_line_cov", config.min_line_cov),
        ("min_branch_cov", config.min_branch_cov),
    ):
        if not math.isfinite(val) or not (0.0 <= val <= 100.0):
            raise SecurityValidationError(
                f"Umbral '{label}' inválido (debe estar en [0, 100]): {val!r}"
            )


def evaluate_diff_coverage(config: DiffCoverageConfig) -> DiffCoverageReport:
    try:
        _validate_cov_thresholds(config)
        workspace_root = config.workspace.resolve()
        reports_path = resolve_contained_reports_dir(workspace_root, config.reports_dir)
        changes = collect_git_changes(workspace_root, config.base_ref)
    except (SecurityValidationError, subprocess.CalledProcessError, OSError) as exc:
        return _build_failure_report(
            EXIT_SECURITY_OR_MISSING_REPORT,
            "FAILED",
            f"❌ [Diff Coverage] ERROR: {exc}",
            error_detail=str(exc),
        )

    if not changes or all(is_doc_file(p) for p in changes):
        reason = "árbol limpio" if not changes else "Fast-Path DOCS_ONLY"
        return DiffCoverageReport(
            EXIT_OK,
            "SKIPPED",
            100.0,
            100.0,
            0,
            0,
            0,
            0,
            (),
            (),
            (),
            None,
            f"✔ [Diff Coverage] SKIPPED ({reason})",
            config.min_branch_cov,
        )

    evasions = detect_diff_evasions(changes)
    if evasions:
        return _build_failure_report(
            EXIT_EVASION_DETECTED,
            "FAILED",
            f"❌ [Diff Coverage] EVASION_DETECTED ({len(evasions)} hallazgo(s))",
            evasion_findings=evasions,
        )

    try:
        cov_map = load_coverage_reports(workspace_root, reports_path)
    except (SecurityValidationError, OSError) as exc:
        return _build_failure_report(
            EXIT_SECURITY_OR_MISSING_REPORT,
            "FAILED",
            f"❌ [Diff Coverage] ERROR: {exc}",
            error_detail=str(exc),
        )

    metrics, missing_reports = _evaluate_file_metrics(changes, cov_map)
    return _compute_global_totals(metrics, missing_reports, config)


def _format_metric_row(
    metric: FileDeltaMetrics, min_branch_cov: float = 90.0
) -> str | None:
    has_uncovered_branch = (
        metric.total_branches > 0 and metric.branch_pct < min_branch_cov
    )
    if not (
        metric.missing_from_reports or metric.uncovered_lines or has_uncovered_branch
    ):
        return None
    miss_tag = (
        "SIN_REPORTE"
        if metric.missing_from_reports
        else ",".join(str(x) for x in metric.uncovered_lines[:15])
    )
    return (
        f"{metric.file_path} | "
        f"{metric.line_pct:.2f}% ({metric.covered_lines}/{metric.total_lines}) | "
        f"{metric.branch_pct:.2f}% "
        f"({metric.covered_branches}/{metric.total_branches}) | "
        f"{miss_tag or '-'}"
    )


def format_report_output(report: DiffCoverageReport) -> str:
    if report.exit_code == EXIT_OK:
        return report.summary_line
    lines = [report.summary_line]
    lines.extend(f"  - {finding}" for finding in report.evasion_findings)
    rows = [
        row
        for row in (
            _format_metric_row(m, report.min_branch_cov) for m in report.file_metrics
        )
        if row is not None
    ]
    if rows:
        lines.append("Archivo | Líneas | Ramas | Líneas descubiertas")
        lines.extend(rows)
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Auditor determinista de cobertura diferencial multi-stack QA 11X."
    )
    parser.add_argument("--workspace", default=".", help="Ruta raíz del workspace Git")
    parser.add_argument(
        "--base-ref", default=None, help="Referencia Git base para merge-base"
    )
    parser.add_argument(
        "--min-line-cov",
        type=float,
        default=100.0,
        help="Umbral mínimo de líneas delta (%%)",
    )
    parser.add_argument(
        "--min-branch-cov",
        type=float,
        default=90.0,
        help="Umbral mínimo de ramas delta (%%)",
    )
    parser.add_argument(
        "--reports-dir",
        default=".agents/.cache/coverage",
        help="Directorio de reportes XML/LCOV",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    config = DiffCoverageConfig(
        workspace=Path(args.workspace),
        base_ref=args.base_ref,
        min_line_cov=args.min_line_cov,
        min_branch_cov=args.min_branch_cov,
        reports_dir=args.reports_dir,
    )
    report = evaluate_diff_coverage(config)
    stream = sys.stdout if report.exit_code == EXIT_OK else sys.stderr
    print(format_report_output(report), file=stream)
    return report.exit_code


if __name__ == "__main__":  # pragma: no cover  # QA11X-APPROVED-EXCLUSION(CLI)
    raise SystemExit(main())
