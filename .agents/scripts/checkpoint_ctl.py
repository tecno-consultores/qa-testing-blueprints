#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Controlador atómico Flight Recorder (JSON 0600 -> ACTIVE_TASK.md + Git en vivo)."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
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


ACTIVE_TASK_MAX_LINES: int = int(_load_budgets_module().ACTIVE_TASK_MAX_LINES)

SCHEMA_VERSION = "1.0"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_CERTIFIED_CLEAN = "CERTIFIED_CLEAN"
MAX_INTENT_LEN = 140
MAX_TASK_ID_LEN = 64
CHECKPOINT_REL = Path(".agents") / ".cache" / "session_checkpoint.json"
ACTIVE_TASK_REL = Path(".agents") / "ACTIVE_TASK.md"
ACTIVE_TASK_TEMPLATE_REL = Path(".agents") / "ACTIVE_TASK.md.example"
CERTIFY_CMD_NAME = "certify_task_completion"

EXIT_OK = 0
EXIT_ERROR = 2

TASK_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
WS_COLLAPSE_RE = re.compile(r"[\r\n\t]+")
SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(Bearer|Basic)\s+[^\s\"']+", re.IGNORECASE), r"\1 [REDACTED]"),
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED]\2"),
    (
        re.compile(
            r"\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s\"'&]+",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
    (
        re.compile(
            r"(--(?:token|api-key|apikey|secret|password|passwd))\s+[^\s\"']+",
            re.IGNORECASE,
        ),
        r"\1 [REDACTED]",
    ),
    (re.compile(r"\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}\b"), "[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"), "[REDACTED]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED]"),
)
NOISE_GIT_PREFIXES = (
    ".agents/.cache/",
    ".agents/ACTIVE_TASK.md",
    ".agents/.qa-evidence.json",
    "graphify-out/",
)


@dataclass(frozen=True)
class LastScriptRun:
    """Telemetría de última ejecución registrada."""

    cmd: str
    exit_code: int
    timestamp: str
    summary_1line: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "cmd": self.cmd,
            "exit_code": self.exit_code,
            "timestamp": self.timestamp,
            "summary_1line": self.summary_1line,
        }


@dataclass(frozen=True)
class CheckpointData:
    """Fuente única de verdad máquina para el estado de sesión 11X."""

    schema_version: str
    status: str
    updated_at: str
    git_available: bool
    branch: str
    base_sha: str
    task_id: str
    completed_steps: tuple[str, ...]
    active_step: str
    planned_steps: tuple[str, ...]
    allowed_globs: tuple[str, ...]
    forbidden_globs: tuple[str, ...]
    intent_140chars: str
    last_script_run: LastScriptRun | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "status": self.status,
            "updated_at": self.updated_at,
            "git_available": self.git_available,
            "branch": self.branch,
            "base_sha": self.base_sha,
            "task_id": self.task_id,
            "completed_steps": list(self.completed_steps),
            "active_step": self.active_step,
            "planned_steps": list(self.planned_steps),
            "allowed_globs": list(self.allowed_globs),
            "forbidden_globs": list(self.forbidden_globs),
            "intent_140chars": self.intent_140chars,
            "last_script_run": (
                self.last_script_run.to_dict() if self.last_script_run else None
            ),
        }


@dataclass(frozen=True)
class LiveGitSnapshot:
    """Estado físico Git en vivo sin ruido efímero QA."""

    git_available: bool
    branch: str
    head_sha: str
    dirty_files: tuple[str, ...]
    diff_stat_summary: str


@dataclass(frozen=True)
class SetRequest:
    """Parámetros validados para subcomando set."""

    workspace: Path
    task_id: str
    step: str
    intent: str
    done: tuple[str, ...] | None
    planned: tuple[str, ...] | None
    allowed_globs: tuple[str, ...] | None
    forbidden_globs: tuple[str, ...] | None


def _utc_now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanitize_text(raw: str) -> str:
    """Elimina escapes ANSI, saltos de línea y secretos SEC-06."""
    cleaned = ANSI_RE.sub("", raw)
    cleaned = WS_COLLAPSE_RE.sub(" ", cleaned).strip()
    for pattern, repl in SECRET_PATTERNS:
        cleaned = pattern.sub(repl, cleaned)
    return cleaned


def _dedupe_steps(items: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        clean = item.strip()
        if clean and clean not in seen:
            seen.add(clean)
            ordered.append(clean)
    return tuple(ordered)


def _parse_csv_arg(raw: str | None) -> tuple[str, ...] | None:
    if raw is None:
        return None
    parts = [clean for part in raw.split(",") if (clean := sanitize_text(part))]
    return _dedupe_steps(parts)


def _assert_safe_session_path(resolved: Path, rel: Path) -> None:
    candidate = resolved / rel
    if candidate.is_symlink():
        raise ValueError(f"Symlink no permitido en artefacto de sesión: {rel}")


def _validate_workspace_paths(raw_workspace: str) -> Path:
    ws = Path(raw_workspace)
    if not ws.is_dir():
        raise ValueError(f"Workspace inválido o inexistente: {raw_workspace}")
    resolved = ws.resolve()
    for rel in (
        Path(".agents"),
        Path(".agents") / ".cache",
        CHECKPOINT_REL,
        ACTIVE_TASK_REL,
        ACTIVE_TASK_TEMPLATE_REL,
    ):
        _assert_safe_session_path(resolved, rel)
    return resolved


def _atomic_write_text(target: Path, content: str, mode: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = (
        target.parent / f".{target.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(tmp_path, flags, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, target)
    except OSError:
        tmp_path.unlink(missing_ok=True)
        raise


def _run_git(workspace: Path, args: list[str]) -> tuple[int, str]:
    try:
        res = subprocess.run(
            ["git", "-C", str(workspace), *args],
            capture_output=True,
            text=True,
            shell=False,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""
    return res.returncode, res.stdout


def _is_noise_git_path(rel_path: str) -> bool:
    norm = rel_path.strip().replace("\\", "/")
    return any(
        norm.startswith(prefix) or f"/{prefix}" in norm
        for prefix in NOISE_GIT_PREFIXES
    )


def _extract_porcelain_path(line: str) -> str:
    if len(line) < 4:
        return ""
    raw = line[3:].strip()
    if " -> " in raw:
        raw = raw.split(" -> ", 1)[1].strip()
    return raw.strip('"')


def _resolve_git_branch(workspace: Path) -> str | None:
    cmds = (
        ["rev-parse", "--abbrev-ref", "HEAD"],
        ["symbolic-ref", "--short", "HEAD"],
    )
    for cmd in cmds:
        rc, out = _run_git(workspace, cmd)
        if rc == 0 and out.strip():
            return out.strip()
    return None


def _collect_dirty_files(workspace: Path) -> tuple[str, ...]:
    _, status_out = _run_git(workspace, ["status", "--porcelain=v1"])
    dirty = [
        rel
        for line in status_out.splitlines()
        if (rel := _extract_porcelain_path(line)) and not _is_noise_git_path(rel)
    ]
    return tuple(dirty[:20])


def capture_live_git(workspace: Path) -> LiveGitSnapshot:
    """Captura rama, SHA corto, archivos sucios reales y diff --stat sin ruido."""
    branch = _resolve_git_branch(workspace)
    if branch is None:
        return LiveGitSnapshot(False, "nogit", "none", (), "git_unavailable")
    rc_sha, out_sha = _run_git(workspace, ["rev-parse", "--short", "HEAD"])
    head_sha = out_sha.strip() if rc_sha == 0 else "unborn"
    return LiveGitSnapshot(
        git_available=True,
        branch=branch,
        head_sha=head_sha or "unborn",
        dirty_files=_collect_dirty_files(workspace),
        diff_stat_summary=_collect_diff_stat_line(workspace, head_sha or "unborn"),
    )


def _collect_diff_stat_line(workspace: Path, head_sha: str) -> str:
    if head_sha == "unborn":
        return "unborn HEAD"
    rc_stat, stat_out = _run_git(workspace, ["diff", "--stat", "HEAD"])
    if rc_stat != 0 or not stat_out.strip():
        return "0 files changed"
    last_line = stat_out.strip().splitlines()[-1].strip()
    return sanitize_text(last_line)[:120]


def _try_parse_json_list(trimmed: str) -> tuple[str, ...] | None:
    try:
        loaded = json.loads(trimmed)
    except json.JSONDecodeError:
        return None
    if not isinstance(loaded, list):
        return None
    return _dedupe_steps([str(item) for item in loaded])


def _parse_glob_list(raw_val: str) -> tuple[str, ...]:
    trimmed = raw_val.strip()
    if trimmed.startswith("["):
        parsed = _try_parse_json_list(trimmed)
        if parsed is not None:
            return parsed
    items = [part.strip(" []'\"") for part in trimmed.split(",")]
    return _dedupe_steps(items)


def _extract_task_id_from_lines(lines: list[str]) -> str:
    for line in lines:
        match = re.search(r"\*\*Tarea:\*\*\s*`([^`]+)`", line)
        if match and TASK_ID_RE.match(match.group(1)):
            return match.group(1)[:MAX_TASK_ID_LEN]
    return "LEGACY-TASK"


def _extract_intent_from_lines(lines: list[str]) -> str:
    for line in lines:
        match = re.search(
            r"\*\*(?:Objetivo(?:\s+Activo)?[^:]*):\*\*\s*(.+)$", line
        )
        if match:
            cleaned = sanitize_text(match.group(1))
            return cleaned[:MAX_INTENT_LEN] or "Tarea activa hidratada"
    return "Tarea activa hidratada"


def _parse_glob_directive(
    stripped: str, allowed: list[str], forbidden: list[str]
) -> None:
    if "allowed_globs:" in stripped:
        allowed.extend(_parse_glob_list(stripped.split(":", 1)[1]))
    elif "forbidden_globs:" in stripped:
        forbidden.extend(_parse_glob_list(stripped.split(":", 1)[1]))


def _parse_active_task_sections(
    lines: list[str],
) -> tuple[list[str], list[str], list[str], list[str]]:
    done: list[str] = []
    pending: list[str] = []
    allowed: list[str] = []
    forbidden: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("- [x]", "- [X]")):
            done.append(stripped[5:].strip())
        elif stripped.startswith("- [ ]"):
            pending.append(stripped[5:].strip())
        else:
            _parse_glob_directive(stripped, allowed, forbidden)
    return done, pending, allowed, forbidden


def _is_non_template_active_task(workspace: Path) -> bool:
    task_file = workspace / ACTIVE_TASK_REL
    if not task_file.is_file():
        return False
    tpl_file = workspace / ACTIVE_TASK_TEMPLATE_REL
    content = task_file.read_text(encoding="utf-8-sig")
    if not content.strip():
        return False
    return not (
        tpl_file.is_file() and content == tpl_file.read_text(encoding="utf-8-sig")
    )


def _resolve_hydrated_status(
    content: str, done: list[str], pending: list[str]
) -> tuple[str, str]:
    low = content.lower()
    is_closed = "certified_clean" in low or "completed" in low
    completed = is_closed and not pending
    status = STATUS_CERTIFIED_CLEAN if completed else STATUS_IN_PROGRESS
    fallback = done[-1] if done else "F1"
    active = pending[0] if pending else fallback
    return status, active[:MAX_TASK_ID_LEN]


def hydrate_from_active_task(
    workspace: Path, git_snap: LiveGitSnapshot
) -> CheckpointData | None:
    """Importa sin pérdida globs y pasos previos desde ACTIVE_TASK.md."""
    if not _is_non_template_active_task(workspace):
        return None
    content = (workspace / ACTIVE_TASK_REL).read_text(encoding="utf-8-sig")
    lines = content.splitlines()
    done, pending, allowed, forbidden = _parse_active_task_sections(lines)
    status, active = _resolve_hydrated_status(content, done, pending)
    return CheckpointData(
        schema_version=SCHEMA_VERSION,
        status=status,
        updated_at=_utc_now_iso(),
        git_available=git_snap.git_available,
        branch=git_snap.branch,
        base_sha=git_snap.head_sha,
        task_id=_extract_task_id_from_lines(lines),
        completed_steps=_dedupe_steps(done),
        active_step=active,
        planned_steps=_dedupe_steps(pending),
        allowed_globs=_dedupe_steps(allowed),
        forbidden_globs=_dedupe_steps(forbidden),
        intent_140chars=_extract_intent_from_lines(lines),
        last_script_run=None,
    )


def _coerce_str_list(raw_val: Any, field_name: str) -> tuple[str, ...]:
    if raw_val is None:
        return ()
    if not isinstance(raw_val, list):
        raise TypeError(
            f"'{field_name}' debe ser una lista en session_checkpoint.json."
        )
    return _dedupe_steps([str(item) for item in raw_val])


def _parse_last_run(raw: Any) -> LastScriptRun | None:
    if not isinstance(raw, dict):
        return None
    raw_rc = raw.get("exit_code", 0)
    if isinstance(raw_rc, bool) or not isinstance(raw_rc, int):
        raise TypeError("'last_script_run.exit_code' debe ser entero.")
    return LastScriptRun(
        cmd=str(raw.get("cmd", "")),
        exit_code=raw_rc,
        timestamp=str(raw.get("timestamp", _utc_now_iso())),
        summary_1line=str(raw.get("summary_1line", "")),
    )


def load_checkpoint(
    workspace: Path, git_snap: LiveGitSnapshot
) -> CheckpointData | None:
    """Carga session_checkpoint.json o auto-hidrata ACTIVE_TASK.md previo."""
    ckpt_path = workspace / CHECKPOINT_REL
    if not ckpt_path.is_file():
        return hydrate_from_active_task(workspace, git_snap)
    raw = json.loads(ckpt_path.read_text(encoding="utf-8-sig"))
    if not isinstance(raw, dict):
        raise TypeError("session_checkpoint.json debe contener un objeto JSON.")
    return CheckpointData(
        schema_version=str(raw.get("schema_version", SCHEMA_VERSION)),
        status=str(raw.get("status", STATUS_IN_PROGRESS)),
        updated_at=str(raw.get("updated_at", _utc_now_iso())),
        git_available=bool(raw.get("git_available", False)),
        branch=str(raw.get("branch", "nogit")),
        base_sha=str(raw.get("base_sha", "none")),
        task_id=str(raw.get("task_id", "TASK-11X")),
        completed_steps=_coerce_str_list(raw.get("completed_steps"), "completed_steps"),
        active_step=str(raw.get("active_step", "F1")),
        planned_steps=_coerce_str_list(raw.get("planned_steps"), "planned_steps"),
        allowed_globs=_coerce_str_list(raw.get("allowed_globs"), "allowed_globs"),
        forbidden_globs=_coerce_str_list(raw.get("forbidden_globs"), "forbidden_globs"),
        intent_140chars=str(raw.get("intent_140chars") or "")[:MAX_INTENT_LEN],
        last_script_run=_parse_last_run(raw.get("last_script_run")),
    )


def _collect_pending_steps(ckpt: CheckpointData) -> list[str]:
    done_set = set(ckpt.completed_steps)
    ordered = _dedupe_steps([ckpt.active_step, *list(ckpt.planned_steps)])
    return [step for step in ordered if step not in done_set]


def _raw_step_lines(ckpt: CheckpointData) -> list[str]:
    done = list(ckpt.completed_steps)
    if ckpt.status == STATUS_CERTIFIED_CLEAN:
        all_done = _dedupe_steps([*done, ckpt.active_step, *list(ckpt.planned_steps)])
        return [f"- [x] {step}" for step in all_done]
    pending = _collect_pending_steps(ckpt)
    return [f"- [x] {s}" for s in done] + [f"- [ ] {s}" for s in pending]


def _build_step_lines(ckpt: CheckpointData, budget: int) -> list[str]:
    raw_lines = _raw_step_lines(ckpt)
    if len(raw_lines) <= budget:
        return raw_lines
    kept_tail = raw_lines[-(max(1, budget - 1)) :]
    collapsed = len(raw_lines) - len(kept_tail)
    return [f"- [x] (+{collapsed} pasos compactados)", *kept_tail]


def render_active_task_markdown(ckpt: CheckpointData) -> str:
    """Proyecta .agents/ACTIVE_TASK.md determinista <= 40 líneas en español."""
    date_part = ckpt.updated_at[:10]
    estado = (
        STATUS_CERTIFIED_CLEAN
        if ckpt.status == STATUS_CERTIFIED_CLEAN
        else STATUS_IN_PROGRESS
    )
    header = [
        "# SPDX-License-Identifier: MIT",
        (
            "# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> "
            "(Creado en Tecno Consultores)"
        ),
        "<!-- AUTO-GENERATED BY checkpoint_ctl.py — DO NOT EDIT MANUALLY -->",
        "",
        f"# Registro de Tarea Activa: {ckpt.task_id}",
        (
            f"**Fecha:** {date_part} | **Tarea:** `{ckpt.task_id}` | "
            f"**Rama:** `{ckpt.branch}@{ckpt.base_sha}` | **Estado:** {estado}"
        ),
        f"**Objetivo Activo (`{ckpt.active_step}`):** {ckpt.intent_140chars}",
    ]
    if ckpt.allowed_globs:
        allowed_json = json.dumps(list(ckpt.allowed_globs), ensure_ascii=False)
        header.append(f"- allowed_globs: {allowed_json}")
    if ckpt.forbidden_globs:
        header.append(
            "- forbidden_globs: "
            f"{json.dumps(list(ckpt.forbidden_globs), ensure_ascii=False)}"
        )
    if ckpt.last_script_run is not None:
        run = ckpt.last_script_run
        header.append(
            f"**Última Telemetría:** `{run.cmd}` (`rc={run.exit_code}`, "
            f"`{run.timestamp}`) — {run.summary_1line}"
        )
    header.extend(["", "## 📋 Progreso Atómico"])
    budget = max(1, ACTIVE_TASK_MAX_LINES - len(header))
    lines = [*header, *_build_step_lines(ckpt, budget)]
    return "\n".join(lines[:ACTIVE_TASK_MAX_LINES]) + "\n"


def persist_checkpoint(workspace: Path, ckpt: CheckpointData) -> None:
    """Persiste session_checkpoint.json (0600) y proyecta ACTIVE_TASK.md."""
    cache_dir = workspace / ".agents" / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(cache_dir, 0o700)
    payload = json.dumps(ckpt.to_dict(), indent=2, ensure_ascii=False) + "\n"
    _atomic_write_text(workspace / CHECKPOINT_REL, payload, 0o600)
    md_text = render_active_task_markdown(ckpt)
    _atomic_write_text(workspace / ACTIVE_TASK_REL, md_text, 0o644)


def _require_len_bound(val: str, limit: int, label: str) -> str:
    clean = val.strip()
    if not clean or len(clean) > limit:
        raise ValueError(f"{label} inválido o excede {limit} caracteres.")
    return clean


def _validate_set_request(req: SetRequest) -> tuple[str, str]:
    if not TASK_ID_RE.match(req.task_id) or len(req.task_id) > MAX_TASK_ID_LEN:
        raise ValueError("task_id inválido (use ^[A-Za-z0-9._-]+$, <= 64 chars).")
    _require_len_bound(req.step, MAX_TASK_ID_LEN, "step")
    clean_step = _require_len_bound(sanitize_text(req.step), MAX_TASK_ID_LEN, "step")
    raw_intent = _require_len_bound(req.intent, MAX_INTENT_LEN, "intent")
    clean_intent = sanitize_text(raw_intent)[:MAX_INTENT_LEN]
    if not clean_intent:
        raise ValueError("intent vacío tras sanitización.")
    return clean_step, clean_intent


def _pick_preserved_tuple(
    explicit: tuple[str, ...] | None,
    prev: CheckpointData | None,
    attr: str,
    same_branch: bool,
) -> tuple[str, ...]:
    if explicit is not None:
        return explicit
    if prev is not None and same_branch:
        return tuple(getattr(prev, attr))
    return ()


def handle_set(req: SetRequest) -> CheckpointData:
    """Ejecuta subcomando set validando 140 chars y proyectando ACTIVE_TASK.md."""
    clean_step, clean_intent = _validate_set_request(req)
    git_snap = capture_live_git(req.workspace)
    prev = load_checkpoint(req.workspace, git_snap)
    same_branch = prev is not None and (
        prev.branch == git_snap.branch or prev.branch == "nogit"
    )
    done = _pick_preserved_tuple(req.done, prev, "completed_steps", same_branch)
    planned = _pick_preserved_tuple(req.planned, prev, "planned_steps", same_branch)
    allowed = _pick_preserved_tuple(
        req.allowed_globs, prev, "allowed_globs", same_branch
    )
    forbidden = _pick_preserved_tuple(
        req.forbidden_globs, prev, "forbidden_globs", same_branch
    )
    ckpt = CheckpointData(
        schema_version=SCHEMA_VERSION,
        status=STATUS_IN_PROGRESS,
        updated_at=_utc_now_iso(),
        git_available=git_snap.git_available,
        branch=git_snap.branch,
        base_sha=git_snap.head_sha,
        task_id=req.task_id,
        completed_steps=done,
        active_step=clean_step,
        planned_steps=planned,
        allowed_globs=allowed,
        forbidden_globs=forbidden,
        intent_140chars=clean_intent,
        last_script_run=prev.last_script_run if prev and same_branch else None,
    )
    persist_checkpoint(req.workspace, ckpt)
    return ckpt


def handle_record_cmd(
    workspace: Path, cmd: str, exit_code: int, summary: str
) -> CheckpointData | None:
    """Registra telemetría de ejecución y promueve CERTIFIED_CLEAN si aplica."""
    git_snap = capture_live_git(workspace)
    prev = load_checkpoint(workspace, git_snap)
    if prev is None:
        return None
    now_iso = _utc_now_iso()
    run_entry = LastScriptRun(
        cmd=sanitize_text(cmd)[:80] or "cmd",
        exit_code=exit_code,
        timestamp=now_iso,
        summary_1line=sanitize_text(summary)[:160],
    )
    should_certify = cmd.strip() == CERTIFY_CMD_NAME and exit_code == 0
    if should_certify:
        done = _dedupe_steps(
            [*prev.completed_steps, prev.active_step, *prev.planned_steps]
        )
        planned: tuple[str, ...] = ()
        status = STATUS_CERTIFIED_CLEAN
    else:
        done = prev.completed_steps
        planned = prev.planned_steps
        status = prev.status
    updated = CheckpointData(
        schema_version=SCHEMA_VERSION,
        status=status,
        updated_at=now_iso,
        git_available=git_snap.git_available,
        branch=git_snap.branch,
        base_sha=prev.base_sha,
        task_id=prev.task_id,
        completed_steps=done,
        active_step=prev.active_step,
        planned_steps=planned,
        allowed_globs=prev.allowed_globs,
        forbidden_globs=prev.forbidden_globs,
        intent_140chars=prev.intent_140chars,
        last_script_run=run_entry,
    )
    persist_checkpoint(workspace, updated)
    return updated


def _compute_git_drift(
    ckpt: CheckpointData, git_snap: LiveGitSnapshot
) -> tuple[bool, bool]:
    both_git = git_snap.git_available and ckpt.git_available
    return (
        both_git and ckpt.branch != git_snap.branch,
        both_git and ckpt.base_sha != git_snap.head_sha,
    )


def handle_recover(workspace: Path) -> dict[str, Any]:
    """Cruza checkpoint persistido con el estado físico actual de Git."""
    git_snap = capture_live_git(workspace)
    ckpt = load_checkpoint(workspace, git_snap)
    if ckpt is None:
        return {
            "has_checkpoint": False,
            "git_available": git_snap.git_available,
            "branch": git_snap.branch,
            "head_sha": git_snap.head_sha,
            "branch_mismatch": False,
            "head_advanced": False,
            "dirty_files": list(git_snap.dirty_files),
            "diff_stat": git_snap.diff_stat_summary,
        }
    branch_mismatch, head_advanced = _compute_git_drift(ckpt, git_snap)
    return {
        "has_checkpoint": True,
        "checkpoint": ckpt.to_dict(),
        "live_git": {
            "git_available": git_snap.git_available,
            "branch": git_snap.branch,
            "head_sha": git_snap.head_sha,
            "dirty_files": list(git_snap.dirty_files),
            "diff_stat": git_snap.diff_stat_summary,
        },
        "branch_mismatch": branch_mismatch,
        "head_advanced": head_advanced,
    }


def _collect_drift_flags(payload: dict[str, Any]) -> str:
    ckpt = payload["checkpoint"]
    live = payload["live_git"]
    flags: list[str] = []
    if payload["branch_mismatch"]:
        flags.append(f"BRANCH_MISMATCH({ckpt['branch']}!={live['branch']})")
    if payload["head_advanced"]:
        flags.append(f"HEAD_ADVANCED({ckpt['base_sha']}->{live['head_sha']})")
    return f" | Flags: {','.join(flags)}" if flags else ""


def _format_recover_compact(payload: dict[str, Any]) -> str:
    if not payload.get("has_checkpoint"):
        files = ",".join(payload.get("dirty_files", [])) or "clean"
        return (
            f"[RECOVER] sin checkpoint | Git: {payload['branch']}@"
            f"{payload['head_sha']} | Dirty: {files}"
        )
    ckpt = payload["checkpoint"]
    dirty = ",".join(payload["live_git"]["dirty_files"]) or "clean"
    flag_txt = _collect_drift_flags(payload)
    return (
        f"[RECOVER] {ckpt['task_id']} [{ckpt['status']}] "
        f"Active={ckpt['active_step']} Done={len(ckpt['completed_steps'])} | "
        f"Intent: {ckpt['intent_140chars']} | Dirty: {dirty}{flag_txt}"
    )


def _purge_tmp_checkpoints(cache_dir: Path) -> None:
    if not cache_dir.is_dir():
        return
    for item in cache_dir.glob(".session_checkpoint.*.tmp"):
        item.unlink(missing_ok=True)


def handle_clear(workspace: Path, purge_view: bool = False) -> None:
    """Elimina checkpoint máquina y limpia o marca CERTIFIED_CLEAN la vista humana."""
    ckpt_file = workspace / CHECKPOINT_REL
    task_file = workspace / ACTIVE_TASK_REL
    _purge_tmp_checkpoints(workspace / ".agents" / ".cache")
    if purge_view:
        ckpt_file.unlink(missing_ok=True)
        task_file.unlink(missing_ok=True)
        return
    git_snap = capture_live_git(workspace)
    prev = load_checkpoint(workspace, git_snap) if ckpt_file.is_file() else None
    ckpt_file.unlink(missing_ok=True)
    if prev is not None:
        done = _dedupe_steps(
            [*prev.completed_steps, prev.active_step, *prev.planned_steps]
        )
        clean_ckpt = CheckpointData(
            schema_version=SCHEMA_VERSION,
            status=STATUS_CERTIFIED_CLEAN,
            updated_at=_utc_now_iso(),
            git_available=prev.git_available,
            branch=prev.branch,
            base_sha=prev.base_sha,
            task_id=prev.task_id,
            completed_steps=done,
            active_step=prev.active_step,
            planned_steps=(),
            allowed_globs=prev.allowed_globs,
            forbidden_globs=prev.forbidden_globs,
            intent_140chars=prev.intent_140chars,
            last_script_run=prev.last_script_run,
        )
        _atomic_write_text(
            task_file, render_active_task_markdown(clean_ckpt), 0o644
        )


def build_arg_parser() -> argparse.ArgumentParser:
    """Construye el parser CLI de checkpoint_ctl.py."""
    parser = argparse.ArgumentParser(
        description="Controlador atómico Flight Recorder QA-11X."
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    p_set = sub.add_parser("set", help="Actualiza checkpoint y ACTIVE_TASK.md.")
    p_set.add_argument("--workspace", default=".")
    p_set.add_argument("--task-id", required=True)
    p_set.add_argument("--step", required=True)
    p_set.add_argument("--intent", required=True)
    p_set.add_argument("--done", default=None)
    p_set.add_argument("--planned", default=None)
    p_set.add_argument("--allowed-globs", default=None)
    p_set.add_argument("--forbidden-globs", default=None)

    p_rec = sub.add_parser("record-cmd", help="Registra última telemetría CLI.")
    p_rec.add_argument("--workspace", default=".")
    p_rec.add_argument("--cmd", required=True)
    p_rec.add_argument("--rc", type=int, required=True)
    p_rec.add_argument("--summary", required=True)

    p_rcv = sub.add_parser("recover", help="Recupera estado cruzado con Git en vivo.")
    p_rcv.add_argument("--workspace", default=".")
    p_rcv.add_argument("--json", action="store_true")

    p_clr = sub.add_parser("clear", help="Limpia checkpoint de sesión.")
    p_clr.add_argument("--workspace", default=".")
    p_clr.add_argument("--purge-view", action="store_true")
    return parser


def _cmd_set(args: argparse.Namespace, workspace: Path) -> str:
    ckpt = handle_set(
        SetRequest(
            workspace=workspace,
            task_id=args.task_id,
            step=args.step,
            intent=args.intent,
            done=_parse_csv_arg(args.done),
            planned=_parse_csv_arg(args.planned),
            allowed_globs=_parse_csv_arg(args.allowed_globs),
            forbidden_globs=_parse_csv_arg(args.forbidden_globs),
        )
    )
    return (
        f"[PASS] CHECKPOINT | Task: {ckpt.task_id} | "
        f"Active: {ckpt.active_step} | Done: {len(ckpt.completed_steps)}"
    )


def _cmd_record(args: argparse.Namespace, workspace: Path) -> str:
    res = handle_record_cmd(workspace, args.cmd, args.rc, args.summary)
    if res is None:
        return "[SKIP] CHECKPOINT | sin sesion activa"
    return (
        f"[PASS] CHECKPOINT-CMD | Cmd: {args.cmd} | "
        f"RC: {args.rc} | Status: {res.status}"
    )


def _cmd_recover(args: argparse.Namespace, workspace: Path) -> str:
    payload = handle_recover(workspace)
    if args.json:
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return _format_recover_compact(payload)


def _cmd_clear(args: argparse.Namespace, workspace: Path) -> str:
    handle_clear(workspace, purge_view=bool(args.purge_view))
    return "[PASS] CHECKPOINT-CLEAR | Workspace limpio"


_COMMAND_HANDLERS = {
    "set": _cmd_set,
    "record-cmd": _cmd_record,
    "recover": _cmd_recover,
    "clear": _cmd_clear,
}


def _dispatch_command(args: argparse.Namespace, workspace: Path) -> str:
    handler = _COMMAND_HANDLERS[args.subcommand]
    return handler(args, workspace)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI Pass-Quiet para Flight Recorder 11X."""
    args = build_arg_parser().parse_args(argv)
    try:
        workspace = _validate_workspace_paths(args.workspace)
        out = _dispatch_command(args, workspace)
    except (ValueError, TypeError, OSError, json.JSONDecodeError) as exc:
        print(f"[ERROR] CHECKPOINT: {exc}", file=sys.stderr)
        return EXIT_ERROR
    print(out)
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover  # QA11X-APPROVED-EXCLUSION(CLI)
    raise SystemExit(main())
