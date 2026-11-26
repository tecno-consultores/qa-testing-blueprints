#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Compuerta make lint-docs: invariantes documentales, roadmap y QA-GIT-GATE-01."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

_FORBIDDEN_PUSH_RE = re.compile(
    r"and push to `?git`?|\+\s*`?git push`?|commit and push to git|"
    r"git commit`?,\s*`?git push|subir siempre los cambios a git|"
    r"git commit`?\s+y\s+`?git push",
    re.I,
)
_GOVERNANCE_SCRIPTS: tuple[str, ...] = (
    ".agents/scripts/verify_docs_invariants.py",
    ".agents/scripts/verify_roadmap_consistency.py",
)
_GIT_GATE_DOCS: tuple[str, ...] = (
    "AGENTS.md",
    "AI_MASTER_PROMPT.md",
    "AI_MASTER_PROMPT.es.md",
)


def _is_upstream_repo(root: Path) -> bool:
    return (root / "scripts" / "generar-manifiesto.py").is_file() and (
        root / "manifest.json"
    ).is_file()


def _run_doc_validators(root: Path, errors: list[str]) -> None:
    for rel_script in _GOVERNANCE_SCRIPTS:
        script_path = root / rel_script
        if not script_path.is_file():
            continue
        res = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        is_roadmap_skipped = (
            rel_script.endswith("verify_roadmap_consistency.py")
            and res.returncode == 20
        )
        if res.returncode != 0 and not is_roadmap_skipped:
            errors.append(
                (res.stdout + res.stderr).strip() or f"Fallo en {rel_script}"
            )


def _check_git_gate_doc(root: Path, rel_doc: str, errors: list[str]) -> None:
    doc_path = root / rel_doc
    if not doc_path.is_file():
        errors.append(f"Archivo requerido ausente: {rel_doc}")
        return
    text = doc_path.read_text(encoding="utf-8")
    if "QA-GIT-GATE-01" not in text:
        errors.append(f"{rel_doc}: falta referencia explícita a QA-GIT-GATE-01")
    for line_no, line in enumerate(text.splitlines(), 1):
        if _FORBIDDEN_PUSH_RE.search(line):
            errors.append(
                f"{rel_doc}:{line_no}: directiva residual de git push obligatorio"
            )


def run_lint_docs(root: Path) -> list[str]:
    """Ejecuta todos los validadores de lint-docs y retorna errores."""
    errors: list[str] = []
    _run_doc_validators(root, errors)
    if _is_upstream_repo(root):
        gate_rule = root / ".agents" / "rules" / "git_closure_gate.md"
        if not gate_rule.is_file() or "QA-GIT-GATE-01" not in gate_rule.read_text(
            encoding="utf-8"
        ):
            errors.append(
                ".agents/rules/git_closure_gate.md ausente o sin QA-GIT-GATE-01"
            )
        for rel_doc in _GIT_GATE_DOCS:
            _check_git_gate_doc(root, rel_doc, errors)
    elif (root / "AGENTS.md").is_file():
        _check_git_gate_doc(root, "AGENTS.md", errors)
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compuerta lint-docs QA 11X.")
    parser.add_argument("--workspace", default=".", help="Raíz del repositorio.")
    args = parser.parse_args(argv)
    errors = run_lint_docs(Path(args.workspace).resolve())
    for err in errors:
        print(f"❌ [lint-docs] {err}", file=sys.stderr)
    if errors:
        return 1
    print("✅ [lint-docs] Invariantes documentales, roadmap y guardia git verificados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
