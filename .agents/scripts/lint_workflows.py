#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validador estático de workflows GitHub Actions, composite actions y sub-Makefiles."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from _common import CANONICAL_IGNORED_DIRS  # noqa: E402

_DOL = "$"
_SQ = "'"
_DQ = '"'

_SECRET_RE = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"
    r"|(?:npm|ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}"
    r"|github_pat_[A-Za-z0-9_]{30,}"
    r"|glpat-[A-Za-z0-9_-]{20,}"
    r"|xox[baprs]-[A-Za-z0-9_-]{12,}"
    r"|AKIA[0-9A-Z]{16}"
    r"|(?:password|passwd|secret|api_key|token)\s*[=:]\s*"
    + f"[{_SQ}{_DQ}]?[A-Za-z0-9_/-]{{16,}}[{_SQ}{_DQ}]?",
    re.I,
)
_IGNORE_SECRET_RE = re.compile(
    re.escape(_DOL + "{{")
    + r"|"
    + re.escape(_DOL + "{")
    + r"|placeholder|example|dummy|TU_TOKEN|changeme",
    re.I,
)
_USES_RE = re.compile(r"^\s*(?:-\s+)?uses\s*:\s*([^\s#]+)")
_SHA40_RE = re.compile(r"^[0-9a-f]{40}$")
_CI_ESCAPE_RE = re.compile(re.escape(_DOL + _DOL) + r"[({][A-Za-z_]")
_MAKE_PWD_RE = re.compile(re.escape(_DOL) + r"(?:\(PWD\)|\{PWD\})")
_IGNORED_MAKE_DIRS = CANONICAL_IGNORED_DIRS | {"tests", "test", "__tests__"}


class _UniqueKeySafeLoader(yaml.SafeLoader):  # type: ignore[misc]
    pass


def _construct_unique_mapping(
    loader: Any, node: Any, deep: bool = False
) -> dict[Any, Any]:
    seen: set[tuple[type[Any], Any]] = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        token = (type(key), key)
        if token in seen:
            raise yaml.constructor.ConstructorError(
                "mapping",
                node.start_mark,
                f"clave duplicada {key!r}",
                key_node.start_mark,
            )
        seen.add(token)
    result: dict[Any, Any] = yaml.SafeLoader.construct_mapping(loader, node, deep=deep)
    return result


_UniqueKeySafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping
)


def _iter_active_lines(
    lines: list[str], ignore_marker: str
) -> list[tuple[int, str]]:
    if any(ignore_marker in line for line in lines[:5]):
        return []
    active: list[tuple[int, str]] = []
    prev = ""
    for line_no, line in enumerate(lines, 1):
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            prev = line
            continue
        if ignore_marker not in line and ignore_marker not in prev:
            active.append((line_no, line))
        prev = line
    return active


def _check_uses(src_path: Path, src_txt: str, errors: list[str]) -> None:
    active = _iter_active_lines(src_txt.splitlines(), "sec-ci-action-ref-ok")
    for line_no, line in active:
        match = _USES_RE.match(line)
        if not match:
            continue
        target = match.group(1).strip(_DQ + _SQ)
        if target.startswith(("./", "../", "docker://")):
            continue
        at_idx = target.rfind("@")
        ref = target[at_idx + 1 :] if at_idx > 0 else ""
        if not _SHA40_RE.match(ref):
            errors.append(
                f"{src_path}:{line_no}: [SEC-CI-ACTION-REF] uses: {target!r} "
                "debe fijarse con SHA de 40 caracteres"
            )


def _check_ci_escape(src_path: Path, src_txt: str, errors: list[str]) -> None:
    for line_no, line in _iter_active_lines(src_txt.splitlines(), "qa-ci-escape-ok"):
        if _CI_ESCAPE_RE.search(line):
            errors.append(
                f"{src_path}:{line_no}: [QA-CI-ESCAPE-01] escape Makefile/Compose "
                f"en GitHub Actions; use {_DOL}(...) o {_DOL}{{...}}"
            )


def _check_plaintext_secrets(src_path: Path, src_txt: str, errors: list[str]) -> None:
    for line_no, line in enumerate(src_txt.splitlines(), 1):
        if _SECRET_RE.search(line) and not _IGNORE_SECRET_RE.search(line):
            errors.append(f"{src_path}:{line_no}: posible secreto en texto plano")


def _load_yaml_doc(path: Path, txt: str, errors: list[str]) -> dict[str, Any] | None:
    try:
        doc = yaml.load(txt, Loader=_UniqueKeySafeLoader)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{path}: {exc}")
        return None
    if not isinstance(doc, dict):
        errors.append(f"{path}: raíz YAML inválida")
        return None
    return doc


def _validate_workflow_jobs(
    wf_path: Path, doc: dict[str, Any], errors: list[str]
) -> None:
    if not doc.get("permissions"):
        errors.append(f"{wf_path}: falta permissions:")
    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        errors.append(f"{wf_path}: falta jobs:")
        return
    for job_name, job_cfg in jobs.items():
        timeout = job_cfg.get("timeout-minutes") if isinstance(job_cfg, dict) else None
        if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout <= 0:
            errors.append(f"{wf_path}: job {job_name!r} sin timeout-minutes > 0")


def _validate_workflows(root: Path, errors: list[str]) -> int:
    wf_dir = root / ".github" / "workflows"
    files = (
        sorted([*wf_dir.glob("*.yml"), *wf_dir.glob("*.yaml")])
        if wf_dir.is_dir()
        else []
    )
    if not files:
        errors.append("No se encontraron workflows en .github/workflows/")
        return 0
    for wf in files:
        rel = wf.relative_to(root)
        txt = wf.read_text(encoding="utf-8")
        doc = _load_yaml_doc(rel, txt, errors)
        if doc is not None:
            _validate_workflow_jobs(rel, doc, errors)
        _check_plaintext_secrets(rel, txt, errors)
        _check_uses(rel, txt, errors)
        _check_ci_escape(rel, txt, errors)
    return len(files)


def _validate_actions(root: Path, errors: list[str]) -> int:
    act_dir = root / ".github" / "actions"
    files = (
        sorted([*act_dir.glob("*/action.yml"), *act_dir.glob("*/action.yaml")])
        if act_dir.is_dir()
        else []
    )
    for af in files:
        rel = af.relative_to(root)
        txt = af.read_text(encoding="utf-8")
        doc = _load_yaml_doc(rel, txt, errors)
        if doc is not None:
            runs_cfg = doc.get("runs")
            if not isinstance(runs_cfg, dict) or runs_cfg.get("using") != "composite":
                errors.append(f"{rel}: falta runs.using == composite")
        _check_plaintext_secrets(rel, txt, errors)
        _check_uses(rel, txt, errors)
        _check_ci_escape(rel, txt, errors)
    return len(files)


def _validate_sub_makefiles(root: Path, errors: list[str]) -> None:
    sub_makefiles = sorted(
        path
        for pat in ("Makefile", "Makefile.example")
        for path in root.rglob(pat)
        if len(path.relative_to(root).parts) >= 2
        and not any(part in _IGNORED_MAKE_DIRS for part in path.relative_to(root).parts)
    )
    for mf in sub_makefiles:
        rel = mf.relative_to(root)
        lines = mf.read_text(encoding="utf-8").splitlines()
        for line_no, line in _iter_active_lines(lines, "qa-make-curdir-ok"):
            if _MAKE_PWD_RE.search(line.replace(_DOL + _DOL, "__DBL__")):
                errors.append(
                    f"{rel}:{line_no}: [QA-MAKE-CURDIR-01] sub-Makefile usa "
                    f"{_DOL}(PWD)/{_DOL}{{PWD}}; use {_DOL}(CURDIR)"
                )


def lint_workflows_workspace(root: Path) -> tuple[int, list[str], int, int]:
    """Ejecuta las validaciones de workflows, actions y sub-Makefiles."""
    errors: list[str] = []
    wf_count = _validate_workflows(root, errors)
    act_count = _validate_actions(root, errors)
    _validate_sub_makefiles(root, errors)
    return (1 if errors else 0), errors, wf_count, act_count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lint estático de workflows QA 11X.")
    parser.add_argument("--workspace", default=".", help="Raíz del repositorio.")
    args = parser.parse_args(argv)
    ws = Path(args.workspace).resolve()
    rc, errors, wf_count, act_count = lint_workflows_workspace(ws)
    for err in errors:
        print(f"❌ [lint-workflows] {err}", file=sys.stderr)
    if rc == 0:
        print(
            f"✅ [lint-workflows] {wf_count} workflows y {act_count} actions "
            "validados sin hallazgos"
        )
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
