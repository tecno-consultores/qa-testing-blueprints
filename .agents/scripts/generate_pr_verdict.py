#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Exportador ejecutivo PR_VERDICT.md y sello SHA-256/HMAC QA 11X (Hito 23)."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import hmac
import json
import math
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import release_readiness_gate as rrg
import track_findings_state as tfs
import verify_diff_coverage as vdc

EXIT_OK = 0
EXIT_BLOCKED = 30
EXIT_EVIDENCE_OR_DIVERGENCE = 30
ATTESTATION_KEY_ENV = "QA11X_ATTESTATION_KEY"
QA_EVIDENCE_REL = ".agents/.qa-evidence.json"
CERTIFY_STATE_REL = ".agents/.cache/certify_state.json"
MANIFEST_REL = "manifest.json"
DEFAULT_REPORTS_DIR = ".agents/.cache/coverage"
DEFAULT_OUTPUT_MD = ".agents/artifacts/PR_VERDICT.md"
DEFAULT_OUTPUT_JSON = ".agents/artifacts/pr_verdict_attestation.json"

VERDICT_MERGE_OK = "APTO PARA MERGE"
VERDICT_BLOCKED = "BLOQUEADO"
RISK_LOW = "BAJO"
RISK_MEDIUM = "MEDIO"
RISK_HIGH = "ALTO"
CRITICAL_RISK_RE = re.compile(
    r"(?:^|/)(?:\.agents|alembic/versions|migrations|security|"
    r"auth|vault|rls|rbac|dockerfile|manifest\.json)",
    re.IGNORECASE,
)
IGNORED_AST_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        ".venv",
        "__pycache__",
        "dist",
        ".cache",
        "vendor",
        "target",
    }
)
IGNORED_CODE_FP_PREFIXES = (
    ".agents/.cache/",
    ".agents/artifacts/",
    "graphify-out/",
    "docs/",
    "coverage/",
)
IGNORED_CODE_FP_EXACT = frozenset(
    {".agents/.qa-evidence.json", ".agents/ACTIVE_TASK.md"}
)


class VerdictDivergenceError(Exception):
    """Error por falta de evidencia, escape de ruta o divergencia del árbol."""


@dataclass(frozen=True)
class GitTreeSnapshot:
    head_sha: str
    tree_sha: str
    worktree_clean: bool
    dirty_code_files: tuple[str, ...]
    changed_files: tuple[str, ...]
    code_fingerprint: str | None


@dataclass(frozen=True)
class BreakerSnapshot:
    has_data: bool
    blocked: bool
    max_streak: int
    total_oscillations: int
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class VerdictInputs:
    workspace: Path
    base_ref: str | None
    reports_dir: str
    junit_xml: str | None
    telemetry_json: str | None
    defects_json: str | None
    expected_head_sha: str | None
    expected_tree_sha: str | None
    timestamp: str | None
    report_only: bool = False


@dataclass(frozen=True)
class _AttestationContext:
    snapshot: GitTreeSnapshot
    evidence_stages: dict[str, Any]
    breaker: BreakerSnapshot
    rrg_report: dict[str, Any]
    diff_cov: vdc.DiffCoverageReport


def _ensure_no_symlink_chain(workspace_real: Path, candidate: Path) -> None:
    if candidate.is_symlink():
        raise VerdictDivergenceError(f"Symlink no permitido: {candidate}")
    for parent in candidate.parents:
        if parent == workspace_real:
            break
        if parent.is_symlink():
            raise VerdictDivergenceError(f"Directorio symlink no permitido: {parent}")


def _prepare_contained_candidate(workspace_real: Path, raw_path: str) -> Path:
    cleaned = raw_path.strip()
    if not cleaned or "\0" in cleaned:
        raise VerdictDivergenceError("Ruta vacía o inválida no permitida.")
    raw_obj = Path(cleaned)
    candidate = raw_obj if raw_obj.is_absolute() else workspace_real / raw_obj
    lexical = Path(os.path.normpath(str(candidate)))
    if not lexical.is_relative_to(workspace_real):
        raise VerdictDivergenceError(
            f"Ruta fuera del workspace permitido: {raw_path}"
        )
    return candidate


def resolve_contained_path(
    workspace_real: Path, raw_path: str, must_exist: bool
) -> Path:
    """Resuelve una ruta dentro del workspace rechazando symlinks y traversal."""
    candidate = _prepare_contained_candidate(workspace_real, raw_path)
    _ensure_no_symlink_chain(workspace_real, candidate)
    resolved = candidate.resolve()
    try:
        resolved.relative_to(workspace_real)
    except ValueError as exc:
        raise VerdictDivergenceError(
            f"Ruta fuera del workspace permitido: {raw_path}"
        ) from exc
    if must_exist and not resolved.exists():
        raise VerdictDivergenceError(f"Archivo requerido no encontrado: {raw_path}")
    return resolved


def _run_git(workspace_real: Path, args: list[str]) -> str:
    try:
        res = subprocess.run(
            ["git", "-C", str(workspace_real), "-c", "core.quotePath=false", *args],
            capture_output=True,
            text=True,
            shell=False,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise VerdictDivergenceError(
            f"Error ejecutando Git ({' '.join(args)}): {exc}"
        ) from exc
    if res.returncode != 0:
        detail = (res.stderr or res.stdout).strip() or f"exit={res.returncode}"
        raise VerdictDivergenceError(f"Error Git ({' '.join(args)}): {detail}")
    return res.stdout.rstrip("\r\n")


def _normalize_rel_path(raw: str) -> str:
    norm = raw.replace("\\", "/")
    while norm.startswith("./"):
        norm = norm[2:]
    return norm


def _is_ignored_for_fingerprint(rel_path: str) -> bool:
    norm = _normalize_rel_path(rel_path)
    if not norm or norm in IGNORED_CODE_FP_EXACT or norm.lower().endswith(".md"):
        return True
    return any(
        norm.startswith(prefix) or f"/{prefix}" in norm
        for prefix in IGNORED_CODE_FP_PREFIXES
    )


def _extract_porcelain_paths(line: str) -> list[str]:
    cleaned = line[3:] if len(line) > 3 and line[2] == " " else line.strip()
    if " -> " in cleaned:
        left, right = cleaned.split(" -> ", 1)
        return [left.strip('"'), right.strip('"')]
    return [cleaned.strip('"')]


def _collect_dirty_code_files(
    workspace_real: Path,
) -> tuple[bool, tuple[str, ...]]:
    raw = _run_git(workspace_real, ["status", "--porcelain", "-uall"])
    if not raw:
        return True, ()
    found: set[str] = set()
    for line in raw.splitlines():
        for raw_p in _extract_porcelain_paths(line):
            norm = _normalize_rel_path(raw_p)
            if not _is_ignored_for_fingerprint(norm):
                found.add(norm)
    return False, tuple(sorted(found))


def _hash_code_entry(workspace_real: Path, rel_file: str) -> str:
    full = workspace_real / rel_file
    if (
        full.is_file()
        and not full.is_symlink()
        and full.resolve().is_relative_to(workspace_real)
    ):
        digest = hashlib.sha256(full.read_bytes()).hexdigest()
        return f"{rel_file}:{digest}"
    if full.is_dir():
        return f"{rel_file}:DIR"
    return f"{rel_file}:DELETED"


def _compute_dirty_fingerprint(
    workspace_real: Path, head_sha: str, dirty_files: tuple[str, ...]
) -> str | None:
    if not dirty_files:
        return None
    hasher = hashlib.sha256()
    hasher.update(f"HEAD:{head_sha}\n".encode())
    for rel_file in dirty_files:
        entry = _hash_code_entry(workspace_real, rel_file)
        hasher.update(f"{entry}\n".encode())
    return hasher.hexdigest()


def _resolve_safe_base_ref(workspace_real: Path, base_ref: str) -> str:
    try:
        resolved = vdc.resolve_git_diff_target(workspace_real, base_ref)
    except vdc.SecurityValidationError as exc:
        raise VerdictDivergenceError(str(exc)) from exc
    return resolved or base_ref


def _collect_changed_files(
    workspace_real: Path, base_ref: str | None, dirty_files: tuple[str, ...]
) -> tuple[str, ...]:
    changed: set[str] = set(dirty_files)
    if base_ref:
        safe_ref = _resolve_safe_base_ref(workspace_real, base_ref)
        diff_out = _run_git(workspace_real, ["diff", "--name-only", safe_ref])
        for line in diff_out.splitlines():
            if line.strip():
                changed.add(line.strip().replace("\\", "/"))
    return tuple(sorted(changed))


def inspect_git_snapshot(
    inputs: VerdictInputs, workspace_real: Path
) -> GitTreeSnapshot:
    """Captura HEAD, tree SHA, archivos modificados y huella determinista."""
    head_sha = _run_git(workspace_real, ["rev-parse", "--verify", "HEAD"])
    tree_sha = _run_git(workspace_real, ["rev-parse", "--verify", "HEAD^{tree}"])
    if inputs.expected_head_sha and inputs.expected_head_sha != head_sha:
        raise VerdictDivergenceError(
            f"Divergencia HEAD: {inputs.expected_head_sha} != {head_sha}."
        )
    if inputs.expected_tree_sha and inputs.expected_tree_sha != tree_sha:
        raise VerdictDivergenceError(
            f"Divergencia Tree: {inputs.expected_tree_sha} != {tree_sha}."
        )
    worktree_clean, dirty_code = _collect_dirty_code_files(workspace_real)
    changed_files = _collect_changed_files(
        workspace_real, inputs.base_ref, dirty_code
    )
    fingerprint = _compute_dirty_fingerprint(workspace_real, head_sha, dirty_code)
    return GitTreeSnapshot(
        head_sha=head_sha,
        tree_sha=tree_sha,
        worktree_clean=worktree_clean,
        dirty_code_files=dirty_code,
        changed_files=changed_files,
        code_fingerprint=fingerprint,
    )


def _read_optional_json(
    workspace_real: Path, rel_path: str
) -> dict[str, Any] | None:
    target = workspace_real / rel_path
    if not target.exists():
        return None
    safe_target = resolve_contained_path(workspace_real, rel_path, must_exist=True)
    try:
        loaded = json.loads(safe_target.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VerdictDivergenceError(f"JSON inválido en '{rel_path}': {exc}") from exc
    if not isinstance(loaded, dict):
        raise VerdictDivergenceError(f"Estructura JSON inválida en '{rel_path}'.")
    return loaded


def _assert_stage_fingerprint(
    stage_name: str, entry: Any, expected_fp: str
) -> None:
    if not isinstance(entry, dict):
        return
    recorded_fp = entry.get("fingerprint")
    if isinstance(recorded_fp, str) and recorded_fp != expected_fp:
        raise VerdictDivergenceError(
            f"Evidencia '{stage_name}' obsoleta ({recorded_fp} != {expected_fp})."
        )


def _validate_evidence_consistency(
    evidence_doc: dict[str, Any] | None, snapshot: GitTreeSnapshot
) -> dict[str, Any]:
    if evidence_doc is None:
        return {}
    stages_raw = evidence_doc.get("stages")
    if not isinstance(stages_raw, dict):
        return {}
    expected_fp = snapshot.code_fingerprint or "CLEAN_HEAD"
    for stage_name, entry in stages_raw.items():
        _assert_stage_fingerprint(str(stage_name), entry, expected_fp)
    return stages_raw


def _extract_max_int_value(mapping: Any, use_sum: bool = False) -> int:
    if not isinstance(mapping, dict):
        return 0
    vals = [
        int(v)
        for v in mapping.values()
        if not isinstance(v, bool)
        and isinstance(v, (int, float))
        and math.isfinite(float(v))
    ]
    return sum(vals) if use_sum else max(vals, default=0)


def _extract_history_sets(raw_runs: Any) -> list[set[str]]:
    if not isinstance(raw_runs, list):
        return []
    sets: list[set[str]] = []
    for run in raw_runs[-tfs.MAX_HISTORY_RUNS :]:
        if isinstance(run, dict) and isinstance(run.get("fingerprints"), list):
            sets.append({str(fp) for fp in run["fingerprints"]})
    return sets


def _extract_non_bool_int(val: Any) -> int:
    if (
        not isinstance(val, bool)
        and isinstance(val, (int, float))
        and math.isfinite(float(val))
    ):
        return max(0, int(val))
    return 0


def _analyze_run_sequence(history_sets: list[set[str]]) -> tuple[int, int, int]:
    if not history_sets:
        return 0, 0, 0
    latest = history_sets[-1]
    streak = max(
        (tfs._count_trailing_streak(history_sets, fp) for fp in latest),
        default=0,
    )
    osc = sum(tfs._count_oscillations(history_sets, fp) for fp in latest)
    return len(latest), streak, osc


def _stage_persisted_int(mapping: Any, stage_name: str) -> int:
    if not isinstance(mapping, dict):
        return 0
    return _extract_non_bool_int(mapping.get(stage_name))


def _inspect_stage_runs_map(
    session: dict[str, Any], stage_runs: dict[str, Any]
) -> tuple[bool, int, int, int]:
    has_data = False
    max_streak = 0
    total_osc = 0
    active_count = 0
    for stage_name in sorted(stage_runs):
        history_sets = _extract_history_sets(stage_runs[stage_name])
        if not history_sets:
            continue
        has_data = True
        st_active, st_streak, st_osc = _analyze_run_sequence(history_sets)
        st_streak = max(
            st_streak, _stage_persisted_int(session.get("streaks"), stage_name)
        )
        st_osc = max(
            st_osc, _stage_persisted_int(session.get("oscillations"), stage_name)
        )
        active_count += st_active
        max_streak = max(max_streak, st_streak)
        total_osc += st_osc
    return has_data, max_streak, total_osc, active_count


def _inspect_legacy_runs(session: dict[str, Any]) -> tuple[bool, int, int, int]:
    history_sets = _extract_history_sets(session.get("runs"))
    if not history_sets:
        return False, 0, 0, 0
    active_count, comp_streak, comp_osc = _analyze_run_sequence(history_sets)
    persisted_streak = _extract_max_int_value(session.get("streaks"), use_sum=False)
    persisted_osc = _extract_max_int_value(session.get("oscillations"), use_sum=True)
    return (
        True,
        max(comp_streak, persisted_streak),
        max(comp_osc, persisted_osc),
        active_count,
    )


def _evaluate_session_entry(session: dict[str, Any]) -> BreakerSnapshot:
    stage_runs = session.get("stage_runs")
    if isinstance(stage_runs, dict):
        has_data, max_streak, total_osc, active_count = _inspect_stage_runs_map(
            session, stage_runs
        )
    else:
        has_data, max_streak, total_osc, active_count = _inspect_legacy_runs(session)
    if not has_data:
        return BreakerSnapshot(False, False, 0, 0, ())
    blocked = max_streak >= 3 or total_osc >= 1 or active_count > 0
    reasons: tuple[str, ...] = (
        (
            f"BREAKER_STATE: streak={max_streak}, "
            f"oscilaciones={total_osc}, hallazgos_activos={active_count}.",
        )
        if blocked
        else ()
    )
    return BreakerSnapshot(True, blocked, max_streak, total_osc, reasons)


def _load_breaker_snapshot(
    workspace_real: Path, base_ref: str | None = None
) -> BreakerSnapshot:
    try:
        active_key = tfs.resolve_session_key(workspace_real, base_ref=base_ref)
    except ValueError as exc:
        raise VerdictDivergenceError(str(exc)) from exc
    state_doc = _read_optional_json(workspace_real, CERTIFY_STATE_REL)
    if state_doc is None:
        return BreakerSnapshot(False, False, 0, 0, ())
    sessions = state_doc.get("sessions")
    if not isinstance(sessions, dict):
        return BreakerSnapshot(False, False, 0, 0, ())
    entry = sessions.get(active_key)
    if not isinstance(entry, dict):
        return BreakerSnapshot(False, False, 0, 0, ())
    return _evaluate_session_entry(entry)


def _resolve_graph_prefix(workspace_real: Path, graph_path: Path) -> str:
    rel = graph_path.relative_to(workspace_real).as_posix()
    marker = "graphify-out/graph.json"
    if rel == marker:
        return ""
    return rel[: -len(marker) - 1] if rel.endswith(f"/{marker}") else ""


def _qualify_graph_path(raw_file: str, prefix: str) -> str:
    norm = _normalize_rel_path(raw_file)
    if not prefix or norm.startswith(f"{prefix}/"):
        return norm
    return f"{prefix}/{norm}"


def _collect_graph_files(workspace_real: Path) -> list[Path]:
    found: list[Path] = []
    for candidate in sorted(workspace_real.rglob("graph.json")):
        rel_parts = candidate.relative_to(workspace_real).parts
        if any(part in IGNORED_AST_DIRS for part in rel_parts):
            continue
        resolve_contained_path(workspace_real, candidate.as_posix(), must_exist=True)
        found.append(candidate)
    return found


def _build_graph_nodes_map(
    nodes: Any, prefix: str
) -> dict[str, str]:
    if not isinstance(nodes, list):
        return {}
    return {
        str(n["id"]): _qualify_graph_path(str(n["source_file"]), prefix)
        for n in nodes
        if isinstance(n, dict) and n.get("id") and n.get("source_file")
    }


def _collect_link_dependent(
    link: Any,
    nodes_map: dict[str, str],
    prefix: str,
    changed_set: set[str],
) -> str | None:
    if not isinstance(link, dict):
        return None
    tgt = nodes_map.get(str(link.get("target", "")))
    src_raw = link.get("source_file") or nodes_map.get(str(link.get("source", "")))
    caller = _qualify_graph_path(str(src_raw), prefix) if src_raw else ""
    if tgt in changed_set and caller and caller != tgt:
        return caller
    return None


def _load_graph_payload(graph_path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _extract_dependents_from_graph(
    graph_path: Path,
    workspace_real: Path,
    changed_set: set[str],
    out_deps: set[str],
) -> None:
    payload = _load_graph_payload(graph_path)
    links = payload.get("links") if payload else None
    if payload is None or not isinstance(links, list):
        return
    prefix = _resolve_graph_prefix(workspace_real, graph_path)
    nodes_map = _build_graph_nodes_map(payload.get("nodes"), prefix)
    for link in links:
        dep = _collect_link_dependent(link, nodes_map, prefix, changed_set)
        if dep:
            out_deps.add(dep)


def collect_ast_dependents(
    workspace_real: Path, changed_files: tuple[str, ...]
) -> tuple[str, ...]:
    """Recolecta dependientes AST verificados para los archivos modificados."""
    if not changed_files:
        return ()
    changed_set = set(changed_files)
    deps: set[str] = set()
    for graph_path in _collect_graph_files(workspace_real):
        _extract_dependents_from_graph(graph_path, workspace_real, changed_set, deps)
    return tuple(sorted(deps))


def _has_coverage_reports(workspace_real: Path, reports_dir: str) -> bool:
    try:
        rep_path = vdc.resolve_contained_reports_dir(
            workspace_real.resolve(), reports_dir
        )
    except vdc.SecurityValidationError as exc:
        raise VerdictDivergenceError(str(exc)) from exc
    if not rep_path.is_dir():
        return False
    return any(
        p.is_file() and p.suffix in {".xml", ".info"} for p in rep_path.iterdir()
    )


def _compute_manifest_sha256(workspace_real: Path) -> str | None:
    manifest_path = workspace_real / MANIFEST_REL
    if not manifest_path.exists():
        return None
    safe_manifest = resolve_contained_path(
        workspace_real, MANIFEST_REL, must_exist=True
    )
    return hashlib.sha256(safe_manifest.read_bytes()).hexdigest()


def _normalize_timestamp(raw_ts: str | None) -> str:
    if not raw_ts:
        return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    cleaned = raw_ts.strip()
    iso_str = f"{cleaned[:-1]}+00:00" if cleaned.endswith("Z") else cleaned
    try:
        dt = datetime.datetime.fromisoformat(iso_str)
    except ValueError:
        return cleaned
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.UTC)
    return dt.astimezone(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _determine_risk_level(
    verdict: str, changed_files: tuple[str, ...], ast_dependents: tuple[str, ...]
) -> str:
    if (
        verdict == VERDICT_BLOCKED
        or len(changed_files) >= 8
        or len(ast_dependents) >= 10
        or any(CRITICAL_RISK_RE.search(fp) for fp in changed_files)
    ):
        return RISK_HIGH
    if len(changed_files) >= 4 or len(ast_dependents) >= 4:
        return RISK_MEDIUM
    return RISK_LOW


def _collect_blocking_reasons(
    rrg_report: dict[str, Any],
    diff_cov: vdc.DiffCoverageReport,
    breaker: BreakerSnapshot,
) -> list[str]:
    reasons: list[str] = []
    if rrg_report.get("decision") == rrg.DECISION_NO_GO:
        for item in rrg_report.get("blocking_reasons", []):
            if isinstance(item, dict) and item.get("message"):
                reasons.append(f"[ReleaseGate] {item['message']}")
    if diff_cov.exit_code != vdc.EXIT_OK:
        reasons.append(f"[DiffCov] {diff_cov.summary_line}")
    reasons.extend(breaker.reasons)
    return reasons


def _write_private_json(target: Path, payload: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    raw = (
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    )
    tmp_path = (
        target.parent / f".{target.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(tmp_path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, target)
        os.chmod(target, 0o600)
    except OSError:
        tmp_path.unlink(missing_ok=True)
        raise


def _group_modules(
    changed_files: tuple[str, ...], diff_cov: vdc.DiffCoverageReport
) -> list[tuple[str, int, str]]:
    metrics_by_file = {m.file_path: m for m in diff_cov.file_metrics}
    grouped: dict[str, list[str]] = {}
    for fp in changed_files:
        mod = fp.split("/", 1)[0] if "/" in fp else "raíz"
        grouped.setdefault(mod, []).append(fp)
    rows: list[tuple[str, int, str]] = []
    for mod in sorted(grouped):
        files = grouped[mod]
        covs = [
            f"{metrics_by_file[f].line_pct:.1f}%"
            for f in files
            if f in metrics_by_file
        ]
        cov_label = ", ".join(covs) if covs else "N/A"
        rows.append((mod, len(files), cov_label))
    return rows


def _render_module_rows(
    changed_files: list[str], diff_cov: vdc.DiffCoverageReport
) -> list[str]:
    mod_rows = _group_modules(tuple(changed_files), diff_cov)
    if not mod_rows:
        return ["| `ninguno` | 0 | N/A |"]
    return [f"| `{mod}` | {cnt} | {cov} |" for mod, cnt, cov in mod_rows]


def _render_pr_verdict_markdown(
    attestation: dict[str, Any], diff_cov: vdc.DiffCoverageReport
) -> str:
    verdict = attestation["verdict"]
    icon = "✅" if verdict == VERDICT_MERGE_OK else "⛔"
    lines: list[str] = [
        "# Veredicto Ejecutivo de PR (Estándar QA 11X)",
        "",
        f"- **Veredicto Global:** {icon} `{verdict}`",
        f"- **Nivel de Riesgo:** `{attestation['risk_level']}`",
        f"- **Generado (UTC):** `{attestation['generated_at_utc']}`",
        "",
        "## Sello de Consistencia Árbol–Evidencia",
        f"- **HEAD SHA:** `{attestation['git_head_sha']}`",
        f"- **Git Tree SHA:** `{attestation['git_tree_sha']}`",
        f"- **Worktree Limpio:** `{attestation['worktree_clean']}`",
        f"- **Manifest SHA-256:** `{attestation['manifest_sha256'] or 'N/A'}`",
        f"- **Attestation SHA-256:** `{attestation['attestation_sha256']}`",
    ]
    if "hmac_sha256" in attestation:
        lines.append(f"- **HMAC-SHA256:** `{attestation['hmac_sha256']}`")
    rg = attestation["release_gate"]
    dc = attestation["diff_coverage"]
    br = attestation["breaker_health"]
    stages_lbl = ", ".join(attestation["qa_evidence_stages"]) or "ninguno"
    deps = attestation["ast_dependents"]
    reasons = attestation["blocking_reasons"]
    lines.extend(
        [
            "",
            "## Resumen por Módulo",
            "| Módulo | Archivos Tocados | Cobertura Delta |",
            "| :--- | :---: | :--- |",
            *_render_module_rows(attestation["changed_files"], diff_cov),
            "",
            "## Matriz de Evidencia 11X",
            "| Dimensión | Estado / Métrica |",
            "| :--- | :--- |",
            f"| Release Readiness Gate | `{rg['decision']}` (`{rg['scope']}`) |",
            (
                f"| Cobertura Diferencial | `{dc['status']}` "
                f"(líneas `{dc['line_coverage_pct']}%`, "
                f"ramas `{dc['branch_coverage_pct']}%`) |"
            ),
            f"| Sellos `.qa-evidence.json` | `{stages_lbl}` |",
            (
                f"| Cortacircuitos BREAKER-42 | `blocked={br['blocked']}`, "
                f"`max_streak={br['max_streak']}`, "
                f"`oscillations={br['total_oscillations']}` |"
            ),
            "",
            "## Dependientes AST Verificados",
            *(
                [f"- `{d}`" for d in deps]
                if deps
                else ["- Sin dependientes AST adicionales detectados."]
            ),
        ]
    )
    if reasons:
        lines.extend(["", "## Motivos de Bloqueo", *[f"- {r}" for r in reasons]])
    return "\n".join(lines) + "\n"


def _validate_minimum_evidence(
    inputs: VerdictInputs,
    workspace_real: Path,
    evidence_stages: dict[str, Any],
    breaker: BreakerSnapshot,
) -> None:
    has_any = any(
        [
            inputs.junit_xml is not None,
            bool(evidence_stages),
            breaker.has_data,
            _has_coverage_reports(workspace_real, inputs.reports_dir),
        ]
    )
    if not has_any:
        raise VerdictDivergenceError(
            "Evidencias mínimas ausentes: ejecute pruebas o provea --junit-xml."
        )


def _evaluate_gate_signals(
    inputs: VerdictInputs, workspace_real: Path
) -> tuple[dict[str, Any], vdc.DiffCoverageReport]:
    scope = rrg.SCOPE_FULL if inputs.junit_xml else rrg.SCOPE_SMOKE
    _, rrg_report = rrg.evaluate_release_gate(
        workspace_root=workspace_real,
        junit_xml=inputs.junit_xml,
        telemetry_json=inputs.telemetry_json,
        defects_json=inputs.defects_json,
        scope=scope,
        dry_run=True,
        timestamp=inputs.timestamp,
    )
    if rrg_report.get("has_security_or_parse_error"):
        summary = str(rrg_report.get("summary", "Error de seguridad JUnit/JSON."))
        raise VerdictDivergenceError(summary)
    try:
        diff_cov = vdc.evaluate_diff_coverage(
            vdc.DiffCoverageConfig(
                workspace=workspace_real,
                base_ref=inputs.base_ref,
                reports_dir=inputs.reports_dir,
            )
        )
    except (
        vdc.SecurityValidationError,
        RuntimeError,
        ValueError,
        OSError,
        subprocess.SubprocessError,
    ) as exc:
        raise VerdictDivergenceError(
            f"Error evaluando cobertura diferencial: {exc}"
        ) from exc
    if diff_cov.exit_code == vdc.EXIT_SECURITY_OR_MISSING_REPORT:
        raise VerdictDivergenceError(diff_cov.summary_line)
    return rrg_report, diff_cov


def _build_attestation_payload(
    inputs: VerdictInputs,
    workspace_real: Path,
    ctx: _AttestationContext,
) -> dict[str, Any]:
    blocking_reasons = _collect_blocking_reasons(
        ctx.rrg_report, ctx.diff_cov, ctx.breaker
    )
    verdict = VERDICT_BLOCKED if blocking_reasons else VERDICT_MERGE_OK
    ast_deps = collect_ast_dependents(workspace_real, ctx.snapshot.changed_files)
    risk_level = _determine_risk_level(verdict, ctx.snapshot.changed_files, ast_deps)
    core_payload: dict[str, Any] = {
        "schema_version": 1,
        "generated_at_utc": _normalize_timestamp(inputs.timestamp),
        "git_head_sha": ctx.snapshot.head_sha,
        "git_tree_sha": ctx.snapshot.tree_sha,
        "worktree_clean": ctx.snapshot.worktree_clean,
        "manifest_sha256": _compute_manifest_sha256(workspace_real),
        "verdict": verdict,
        "risk_level": risk_level,
        "changed_files": list(ctx.snapshot.changed_files),
        "ast_dependents": list(ast_deps),
        "qa_evidence_stages": sorted(ctx.evidence_stages.keys()),
        "release_gate": {
            "decision": ctx.rrg_report["decision"],
            "scope": ctx.rrg_report["scope"],
        },
        "diff_coverage": {
            "status": ctx.diff_cov.status,
            "line_coverage_pct": ctx.diff_cov.line_coverage_pct,
            "branch_coverage_pct": ctx.diff_cov.branch_coverage_pct,
        },
        "breaker_health": {
            "blocked": ctx.breaker.blocked,
            "max_streak": ctx.breaker.max_streak,
            "total_oscillations": ctx.breaker.total_oscillations,
        },
        "blocking_reasons": blocking_reasons,
    }
    canonical_core = json.dumps(
        core_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    attestation: dict[str, Any] = {
        **core_payload,
        "attestation_sha256": hashlib.sha256(canonical_core.encode()).hexdigest(),
    }
    secret_key = os.environ.get(ATTESTATION_KEY_ENV, "")
    if secret_key:
        attestation["hmac_sha256"] = hmac.new(
            secret_key.encode(), canonical_core.encode(), hashlib.sha256
        ).hexdigest()
    return attestation


def generate_pr_verdict(
    inputs: VerdictInputs, output_md: str, output_json: str
) -> tuple[int, dict[str, Any], str]:
    """Evalúa señales consolidadas y emite PR_VERDICT.md y JSON SHA-256."""
    workspace_real = inputs.workspace.resolve()
    safe_md = resolve_contained_path(workspace_real, output_md, must_exist=False)
    safe_json = resolve_contained_path(workspace_real, output_json, must_exist=False)
    snapshot = inspect_git_snapshot(inputs, workspace_real)
    evidence_doc = _read_optional_json(workspace_real, QA_EVIDENCE_REL)
    evidence_stages = _validate_evidence_consistency(evidence_doc, snapshot)
    breaker = _load_breaker_snapshot(workspace_real, base_ref=inputs.base_ref)
    _validate_minimum_evidence(inputs, workspace_real, evidence_stages, breaker)
    rrg_report, diff_cov = _evaluate_gate_signals(inputs, workspace_real)

    attestation = _build_attestation_payload(
        inputs,
        workspace_real,
        _AttestationContext(
            snapshot=snapshot,
            evidence_stages=evidence_stages,
            breaker=breaker,
            rrg_report=rrg_report,
            diff_cov=diff_cov,
        ),
    )
    md_text = _render_pr_verdict_markdown(attestation, diff_cov)
    try:
        safe_md.parent.mkdir(parents=True, exist_ok=True)
        safe_md.write_text(md_text, encoding="utf-8")
        _write_private_json(safe_json, attestation)
    except OSError as exc:
        raise VerdictDivergenceError(
            f"Error escribiendo artefactos PR_VERDICT: {exc}"
        ) from exc
    exit_code = (
        EXIT_OK
        if (attestation["verdict"] != VERDICT_BLOCKED or inputs.report_only)
        else EXIT_BLOCKED
    )
    return exit_code, attestation, md_text


def build_arg_parser() -> argparse.ArgumentParser:
    """Construye el parser CLI congelado para generate_pr_verdict.py."""
    parser = argparse.ArgumentParser(
        description="Genera PR_VERDICT.md y pr_verdict_attestation.json"
    )
    parser.add_argument("--workspace", default=".", help="Raíz del repositorio Git.")
    parser.add_argument("--base-ref", default=None, help="Referencia base Git.")
    parser.add_argument(
        "--reports-dir", default=DEFAULT_REPORTS_DIR, help="Carpeta de cobertura."
    )
    parser.add_argument("--junit-xml", default=None, help="Ruta a JUnit XML.")
    parser.add_argument("--telemetry-json", default=None, help="Telemetría JSON.")
    parser.add_argument("--defects-json", default=None, help="Defectos JSON.")
    parser.add_argument("--expected-head-sha", default=None, help="HEAD SHA.")
    parser.add_argument("--expected-tree-sha", default=None, help="Tree SHA.")
    parser.add_argument("--timestamp", default=None, help="Timestamp UTC ISO-8601.")
    parser.add_argument("--output-md", default=DEFAULT_OUTPUT_MD, help="Salida MD.")
    parser.add_argument(
        "--output-json", default=DEFAULT_OUTPUT_JSON, help="Salida JSON."
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Retorna 0 incluso cuando el veredicto es BLOQUEADO (modo informativo).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI: 0 en éxito, 30 si falta evidencia/divergencia/bloqueo."""
    args = build_arg_parser().parse_args(argv)
    inputs = VerdictInputs(
        workspace=Path(args.workspace),
        base_ref=args.base_ref,
        reports_dir=args.reports_dir,
        junit_xml=args.junit_xml,
        telemetry_json=args.telemetry_json,
        defects_json=args.defects_json,
        expected_head_sha=args.expected_head_sha,
        expected_tree_sha=args.expected_tree_sha,
        timestamp=args.timestamp,
        report_only=bool(args.report_only),
    )
    try:
        code, attestation, _ = generate_pr_verdict(
            inputs, args.output_md, args.output_json
        )
    except VerdictDivergenceError as exc:
        print(f"⛔ [PR-VERDICT] {exc}", file=sys.stderr)
        return EXIT_EVIDENCE_OR_DIVERGENCE
    icon = "✔" if code == EXIT_OK else "⛔"
    stream = sys.stdout if code == EXIT_OK else sys.stderr
    print(
        f"{icon} [PR-VERDICT] {attestation['verdict']} "
        f"(riesgo={attestation['risk_level']}, "
        f"sha256={attestation['attestation_sha256'][:12]})",
        file=stream,
    )
    return code


if __name__ == "__main__":
    raise SystemExit(main())
