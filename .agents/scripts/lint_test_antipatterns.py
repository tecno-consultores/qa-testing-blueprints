#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Linter determinista Zero-LLM de antipatrones en pruebas UI y Screenplay (QA 11X)."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

IGNORED_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "build",
        "coverage",
        "dist",
        "graphify-out",
        "node_modules",
        "venv",
    }
)
TARGET_EXTENSIONS: frozenset[str] = frozenset(
    {".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".py", ".ts", ".tsx"}
)
SCOPE_DIR_PARTS: frozenset[str] = frozenset(
    {"cypress", "e2e", "pages", "playwright", "screenplay", "test", "tests"}
)
BRACE_DELTA: dict[str, int] = {"{": 1, "}": -1}

MAX_PAGE_METHODS = 50
MAX_PAGE_LOCATORS = 100
MAX_PAGE_INHERITANCE_DEPTH = 2

RE_JS_COMMENT = re.compile(
    r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`)'
    r"|//.*$|/\*.*?\*/"
)
RE_PY_COMMENT = re.compile(r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|#.*$')
RE_TEST_FILE = re.compile(
    r"(?:^|/)(?:test_[^/]+\.py|[^/]+_test\.py|"
    r"[^/]+\.(?:spec|test|e2e|unit)\.[cm]?[jt]sx?)$"
)
RE_ADAPTER_FILE = re.compile(
    r"(?:^|/)(?:adapters|locators|drivers)/|"
    r"(?:adapter|locator|locators|driver)\.[cm]?[jt]sx?$",
    re.IGNORECASE,
)
RE_PAGE_FILE = re.compile(r"(?:^|/)[^/]*Page\.(?:[cm]?[jt]sx?|py)$")

RE_WAIT_FOR_TIMEOUT = re.compile(r"\bwaitForTimeout\s*\(")
RE_CY_WAIT_MS = re.compile(r"\bcy\.wait\(\s*\d+")
RE_PROMISE_SETTIMEOUT = re.compile(r"\bnew\s+Promise\b[\s\S]{0,240}?\bsetTimeout\s*\(")
RE_PY_TIME_SLEEP = re.compile(
    r"\btime\.sleep\(\s*(?:[1-9]\d*(?:\.\d+)?|\d*\.\d*[1-9]\d*)\s*\)"
)

RE_XPATH_RAW = re.compile(
    r"(?:xpath=|['\"`]\s*(?:/html/body|//(?:div|span|button|input|select|"
    r"textarea|table|thead|tbody|tr|td|th|ul|ol|li|form|label|a|p|h[1-6]|\*)\b))"
)
RE_CSS_FRAGILE = re.compile(
    r"['\"`][^'\"`\n]*(?::nth-child\(|:nth-of-type\(|"
    r"[a-zA-Z0-9_.\-#\]]+\s*>\s*[a-zA-Z0-9_.\-#\]]+\s*>\s*"
    r"[a-zA-Z0-9_.\-#\]]+)[^'\"`\n]*['\"`]"
)

RE_TS_PAGE_CLASS = re.compile(
    r"\bclass\s+([A-Za-z_]\w*Page)\b(?:\s+extends\s+([A-Za-z_]\w*))?"
    r"\s*(?:implements\s+[^{]+)?\{"
)
RE_PY_PAGE_CLASS = re.compile(
    r"(?m)^([ \t]*)class\s+([A-Za-z_]\w*Page)\s*(?:\(([^)]*)\))?\s*:"
)
RE_TS_METHOD = re.compile(
    r"(?m)^\s*(?:(?:public|private|protected|static|async)\s+)*"
    r"(?!if\b|for\b|while\b|switch\b|catch\b|constructor\b|get\b|set\b)"
    r"([a-zA-Z_$][\w$]*)\s*(?:<[^>]+>)?\s*\([^)]*\)\s*(?::\s*[^{;\n]+)?\{"
)
RE_TS_ARROW_METHOD = re.compile(
    r"(?m)^\s*(?:readonly\s+|public\s+|private\s+)?([a-zA-Z_$][\w$]*)\s*=\s*"
    r"(?:async\s*)?\([^)]*\)\s*=>"
)
RE_PY_METHOD = re.compile(
    r"(?m)^\s+(?:async\s+)?def\s+(?!__init__\b)([a-zA-Z_]\w*)\s*\("
)
RE_LOCATOR_CALL = re.compile(
    r"\b(?:getByRole|getByLabel|getByText|getByPlaceholder|getByTestId|"
    r"getByAltText|getByTitle|locator|querySelector|querySelectorAll|"
    r"ByRole|ByLabel|ByText|ByTestId)\s*\("
)

RE_HIDDEN_ASSERTION = re.compile(
    r"(?:\bexpect\s*\(|\bassert\s*\(|\bassert\.[A-Za-z_]\w*\s*\("
    r"|\bassert\s+(?!type\b))"
)
RE_JSDOM_ENV = re.compile(
    r"@(?:vitest|jest)-environment\s+jsdom\b|\benvironment\s*:\s*['\"]jsdom['\"]"
)
RE_DOM_GEOMETRY = re.compile(
    r"\bgetBoundingClientRect\s*\(|\.(?:offsetWidth|offsetHeight)\b"
)


@dataclass(frozen=True)
class Violation:
    """Representa una violación determinista detectada por el linter."""

    rule_id: str
    file: str
    line: int
    message: str
    remediation: str


@dataclass(frozen=True)
class PageClassRecord:
    """Métricas estructurales de una clase Page Object."""

    name: str
    parent: str | None
    rel_file: str
    line: int
    method_count: int
    locator_count: int


def _strip_line_comment(line: str, is_python: bool) -> str:
    stripped = line.lstrip()
    if not is_python and stripped.startswith(("//", "/*", "*")):
        return ""
    pattern = RE_PY_COMMENT if is_python else RE_JS_COMMENT
    return pattern.sub(lambda match: match.group(1) or "", line)


def _strip_comments(text: str, is_python: bool) -> str:
    return "\n".join(_strip_line_comment(line, is_python) for line in text.splitlines())


def _is_test_spec(rel_posix: str) -> bool:
    return bool(RE_TEST_FILE.search(rel_posix)) and not bool(
        RE_ADAPTER_FILE.search(rel_posix)
    )


def _is_screenplay_support(rel_posix: str) -> bool:
    parts = set(Path(rel_posix).parts)
    return "screenplay" in parts and not bool(RE_TEST_FILE.search(rel_posix))


def _is_page_object_file(rel_posix: str) -> bool:
    if RE_PAGE_FILE.search(rel_posix):
        return True
    parts = Path(rel_posix).parts
    return "pages" in parts and "src" not in parts


def _is_ui_test_scope(rel_posix: str) -> bool:
    if (
        _is_test_spec(rel_posix)
        or _is_screenplay_support(rel_posix)
        or _is_page_object_file(rel_posix)
    ):
        return True
    return bool(SCOPE_DIR_PARTS.intersection(Path(rel_posix).parts))


def _is_candidate_file(path: Path) -> bool:
    return path.suffix in TARGET_EXTENSIONS and ".example" not in path.name


def _walk_directory(directory: Path) -> list[Path]:
    found: list[Path] = []
    for root, dirnames, filenames in os.walk(directory):
        dirnames[:] = sorted(d for d in dirnames if d not in IGNORED_DIRS)
        for fname in sorted(filenames):
            candidate = Path(root) / fname
            if _is_candidate_file(candidate):
                found.append(candidate)
    return found


def collect_target_files(
    target_paths: Sequence[str], base_dir: Path | None = None
) -> tuple[list[Path], list[str]]:
    """Recolecta archivos auditables ordenados y reporta rutas inexistentes."""
    root = (base_dir or Path.cwd()).resolve()
    files: list[Path] = []
    missing: list[str] = []
    for raw_target in target_paths:
        candidate = Path(raw_target)
        resolved = candidate if candidate.is_absolute() else (root / candidate)
        if not resolved.exists():
            missing.append(raw_target)
        elif resolved.is_file() and _is_candidate_file(resolved):
            files.append(resolved.resolve())
        elif resolved.is_dir():
            files.extend(p.resolve() for p in _walk_directory(resolved))
    return sorted(set(files)), missing


def _check_line_waits(rel_file: str, clean_text: str) -> list[Violation]:
    checks = (
        (RE_WAIT_FOR_TIMEOUT, "Uso de waitForTimeout(...) con espera fija arbitraria."),
        (RE_CY_WAIT_MS, "Uso de cy.wait(<ms>) con retardo fijo numérico."),
        (RE_PY_TIME_SLEEP, "Uso de time.sleep(>0) en archivo de pruebas UI."),
    )
    remediation = (
        "Esperar por transición DOM/ARIA, respuesta API o estado determinista."
    )
    violations: list[Violation] = []
    for line_no, line in enumerate(clean_text.splitlines(), 1):
        for pattern, msg in checks:
            if pattern.search(line):
                violations.append(
                    Violation("QA-UI-ANTI-001", rel_file, line_no, msg, remediation)
                )
    return violations


def _check_promise_waits(rel_file: str, clean_text: str) -> list[Violation]:
    remediation = (
        "Sincronizar con auto-wait o eventos observables en lugar de setTimeout."
    )
    return [
        Violation(
            rule_id="QA-UI-ANTI-001",
            file=rel_file,
            line=clean_text[: match.start()].count("\n") + 1,
            message="Uso de new Promise con setTimeout de espera fija.",
            remediation=remediation,
        )
        for match in RE_PROMISE_SETTIMEOUT.finditer(clean_text)
    ]


def _check_arbitrary_waits(rel_file: str, clean_text: str) -> list[Violation]:
    if not _is_ui_test_scope(rel_file):
        return []
    return [
        *_check_line_waits(rel_file, clean_text),
        *_check_promise_waits(rel_file, clean_text),
    ]


def _check_fragile_selectors(rel_file: str, clean_text: str) -> list[Violation]:
    if not _is_test_spec(rel_file):
        return []
    msg = "Selector XPath o CSS frágil (:nth-child / anidamiento >) directo en spec."
    remediation = (
        "Reemplazar por ByRole, ByLabel, ByText o encapsular en un adaptador."
    )
    return [
        Violation("QA-UI-ANTI-002", rel_file, line_no, msg, remediation)
        for line_no, line in enumerate(clean_text.splitlines(), 1)
        if RE_XPATH_RAW.search(line) or RE_CSS_FRAGILE.search(line)
    ]


def _find_ts_class_end(text: str, open_brace_idx: int) -> int:
    depth = 1
    idx = open_brace_idx + 1
    limit = len(text)
    while idx < limit and depth > 0:
        depth += BRACE_DELTA.get(text[idx], 0)
        idx += 1
    return idx


def _extract_ts_page_classes(rel_file: str, clean_text: str) -> list[PageClassRecord]:
    records: list[PageClassRecord] = []
    for match in RE_TS_PAGE_CLASS.finditer(clean_text):
        body_start = match.end()
        body_end = _find_ts_class_end(clean_text, body_start - 1)
        body = clean_text[body_start:body_end]
        methods = len(RE_TS_METHOD.findall(body)) + len(
            RE_TS_ARROW_METHOD.findall(body)
        )
        records.append(
            PageClassRecord(
                name=match.group(1),
                parent=match.group(2),
                rel_file=rel_file,
                line=clean_text[: match.start()].count("\n") + 1,
                method_count=methods,
                locator_count=len(RE_LOCATOR_CALL.findall(body)),
            )
        )
    return records


def _find_py_class_end(lines: list[str], start_line_idx: int, base_indent: int) -> int:
    end_idx = start_line_idx + 1
    for idx in range(start_line_idx + 1, len(lines)):
        stripped = lines[idx].strip()
        indent = len(lines[idx]) - len(lines[idx].lstrip(" \t"))
        if stripped and indent <= base_indent:
            break
        end_idx = idx + 1
    return end_idx


def _extract_py_parent(bases_raw: str | None) -> str | None:
    if not bases_raw:
        return None
    first = bases_raw.split(",")[0].strip()
    return first or None


def _extract_py_page_classes(rel_file: str, clean_text: str) -> list[PageClassRecord]:
    lines = clean_text.splitlines()
    records: list[PageClassRecord] = []
    for match in RE_PY_PAGE_CLASS.finditer(clean_text):
        start_line = clean_text[: match.start()].count("\n")
        end_line = _find_py_class_end(lines, start_line, len(match.group(1)))
        body = "\n".join(lines[start_line + 1 : end_line])
        records.append(
            PageClassRecord(
                name=match.group(2),
                parent=_extract_py_parent(match.group(3)),
                rel_file=rel_file,
                line=start_line + 1,
                method_count=len(RE_PY_METHOD.findall(body)),
                locator_count=len(RE_LOCATOR_CALL.findall(body)),
            )
        )
    return records


def _inheritance_depth(class_name: str, parent_map: dict[str, str]) -> int:
    depth = 0
    current = class_name
    seen: set[str] = set()
    while current in parent_map and current not in seen:
        seen.add(current)
        current = parent_map[current]
        depth += 1
    return depth


def _evaluate_page_records(records: Sequence[PageClassRecord]) -> list[Violation]:
    parent_map = {rec.name: rec.parent for rec in records if rec.parent}
    violations: list[Violation] = []
    for rec in records:
        if (
            rec.method_count >= MAX_PAGE_METHODS
            or rec.locator_count >= MAX_PAGE_LOCATORS
        ):
            violations.append(
                Violation(
                    rule_id="QA-UI-ANTI-003",
                    file=rec.rel_file,
                    line=rec.line,
                    message=(
                        f"God Page Object '{rec.name}' "
                        f"({rec.method_count} métodos, "
                        f"{rec.locator_count} localizadores)."
                    ),
                    remediation=(
                        "Descomponer en Tasks/Questions Screenplay o widgets acotados."
                    ),
                )
            )
        depth = _inheritance_depth(rec.name, parent_map)
        if depth >= MAX_PAGE_INHERITANCE_DEPTH:
            violations.append(
                Violation(
                    rule_id="QA-UI-ANTI-003",
                    file=rec.rel_file,
                    line=rec.line,
                    message=(
                        f"Herencia profunda de Page Object '{rec.name}' "
                        f"(profundidad={depth} >= 2)."
                    ),
                    remediation=(
                        "Reemplazar jerarquías de páginas por composición Screenplay."
                    ),
                )
            )
    return violations


def _check_hidden_assertions(rel_file: str, clean_text: str) -> list[Violation]:
    if not (_is_screenplay_support(rel_file) or _is_page_object_file(rel_file)):
        return []
    msg = "Aserción oculta (expect/assert) dentro de Screenplay o Page Object."
    remediation = (
        "Devolver un valor desde Question<T> y evaluar aserciones solo en el spec."
    )
    return [
        Violation("QA-UI-ANTI-004", rel_file, line_no, msg, remediation)
        for line_no, line in enumerate(clean_text.splitlines(), 1)
        if RE_HIDDEN_ASSERTION.search(line)
    ]


def _check_jsdom_geometry(rel_file: str, raw_text: str) -> list[Violation]:
    if not RE_JSDOM_ENV.search(raw_text):
        return []
    msg = (
        "Medición geométrica (getBoundingClientRect/offsetWidth/offsetHeight) "
        "en entorno JSDOM."
    )
    remediation = (
        "Ejecutar pruebas de geometría en navegador real (Playwright/Vitest Browser)."
    )
    return [
        Violation("QA-UI-ANTI-005", rel_file, line_no, msg, remediation)
        for line_no, line in enumerate(raw_text.splitlines(), 1)
        if RE_DOM_GEOMETRY.search(line)
    ]


def _relative_display(file_path: Path, base_dir: Path) -> str:
    try:
        return file_path.relative_to(base_dir).as_posix()
    except ValueError:
        return file_path.as_posix()


def audit_paths(
    target_paths: Sequence[str], base_dir: Path | None = None
) -> tuple[list[Violation], list[str], int]:
    """Ejecuta las 5 reglas QA-UI-ANTI-001..005 sobre las rutas objetivo."""
    root = (base_dir or Path.cwd()).resolve()
    files, missing = collect_target_files(target_paths, root)
    violations: list[Violation] = []
    page_records: list[PageClassRecord] = []

    for file_path in files:
        rel_file = _relative_display(file_path, root)
        raw_text = file_path.read_text(encoding="utf-8", errors="ignore")
        is_python = file_path.suffix == ".py"
        clean_text = _strip_comments(raw_text, is_python)

        violations.extend(_check_arbitrary_waits(rel_file, clean_text))
        violations.extend(_check_fragile_selectors(rel_file, clean_text))
        violations.extend(_check_hidden_assertions(rel_file, clean_text))
        violations.extend(_check_jsdom_geometry(rel_file, raw_text))
        extractor = _extract_py_page_classes if is_python else _extract_ts_page_classes
        page_records.extend(extractor(rel_file, clean_text))

    violations.extend(_evaluate_page_records(page_records))
    violations.sort(key=lambda item: (item.file, item.line, item.rule_id))
    return violations, missing, len(files)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Linter estático QA-11X de antipatrones UI (QA-UI-ANTI-001..005)."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=["vue3", "react-frontend"],
        help="Archivos o directorios objetivo (por defecto: vue3 react-frontend).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emite el reporte estructurado en formato JSON.",
    )
    return parser


def _emit_json_report(
    violations: Sequence[Violation], missing: Sequence[str], scanned: int
) -> None:
    payload = {
        "status": "failed" if (violations or missing) else "passed",
        "scanned_files": scanned,
        "missing_paths": list(missing),
        "violations": [asdict(item) for item in violations],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _emit_text_report(
    violations: Sequence[Violation], missing: Sequence[str], scanned: int
) -> None:
    for missing_path in missing:
        print(
            f"❌ [lint-antipatterns] Ruta inexistente: {missing_path}",
            file=sys.stderr,
        )
    for item in violations:
        print(
            f"❌ [{item.rule_id}] {item.file}:{item.line} — {item.message} "
            f"| Remediación: {item.remediation}",
            file=sys.stderr,
        )
    if not missing and not violations:
        print(
            f"✅ [lint-antipatterns] 0 antipatrones detectados en {scanned} "
            "archivo(s) auditados."
        )


def main(argv: list[str] | None = None, base_dir: Path | None = None) -> int:
    """Punto de entrada CLI con salida Pass-Quiet / Fail-Verbose."""
    args = _build_parser().parse_args(argv)
    violations, missing, scanned = audit_paths(args.paths, base_dir=base_dir)
    if args.json:
        _emit_json_report(violations, missing, scanned)
    else:
        _emit_text_report(violations, missing, scanned)
    return 1 if (violations or missing) else 0


if __name__ == "__main__":
    raise SystemExit(main())
