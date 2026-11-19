#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

"""Linter determinista Zero-LLM de antipatrones en pruebas UI y Screenplay (QA 11X)."""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
from collections.abc import Iterator, Sequence
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
AUTO_DETECT_DIRS: tuple[str, ...] = (
    "vue3",
    "react-frontend",
    "mobile-appium",
    "mcp-server",
    "ai-evals",
    "fastapi",
    "python",
    "node-backend",
    "backend",
    "frontend",
    "src",
    "tests",
    "e2e",
    "vibe-rescue",
    ".agents/scripts",
    "scripts",
)
BRACE_DELTA: dict[str, int] = {"{": 1, "}": -1}

MAX_PAGE_METHODS = 50
MAX_PAGE_LOCATORS = 100
MAX_PAGE_INHERITANCE_DEPTH = 2

RE_JS_COMMENT = re.compile(
    r'("(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'|`(?:\\.|[^`\\])*`)'
    r"|//[^\n]*|/\*[\s\S]*?\*/"
)
RE_TS_BRACE_OR_STR = re.compile(
    r'"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'|`(?:\\.|[^`\\])*`|[{}]'
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

RE_JS_STR_LITERAL = re.compile(
    r'"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'|`(?:\\.|[^`\\])*`'
)
RE_TEST_BLOCK_TITLE = re.compile(
    r"\b(?:describe|it|test)(?:\.(?:only|skip|todo|concurrent))?\s*\(\s*"
    r"(?:\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)"
)
RE_XPATH_RAW = re.compile(
    r"(?:xpath=|['\"`]\s*(?:/html/body|//(?:div|span|button|input|select|"
    r"textarea|table|thead|tbody|tr|td|th|ul|ol|li|form|label|a|p|h[1-6]|\*)\b))"
)
RE_CSS_FRAGILE = re.compile(
    r"['\"`][^'\"`\n]*(?::nth-child\(|:nth-of-type\(|"
    r"[a-zA-Z0-9_.\-#\]]+(?<!-)\s*>\s*[a-zA-Z0-9_.\-#\]]+(?<!-)\s*>\s*"
    r"[a-zA-Z0-9_.\-#\]]+)[^'\"`\n]*['\"`]"
)
RE_PY_CSS_CALL = re.compile(
    r"\b(?:CSS_SELECTOR|locator\s*\(|query_selector(?:_all)?\s*\()|['\"]css="
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
RE_PY_TEST_FILE = re.compile(
    r"(?:^|/)(?:test_[^/]+\.py|[^/]+_(?:test|unit|spec|e2e)\.py|"
    r"[^/]+\.(?:unit|spec|test|e2e)\.py|(?:tests?|e2e)/.*\.py)$"
)
RE_PY_GATE_FILE = re.compile(
    r"(?:^|/)(?:(?:gate|verify|check|audit|certify|validate|enforce|release)_[^/]+"
    r"|[^/]+_(?:gate|verifier|checker|auditor))\.py$",
    re.IGNORECASE,
)
RE_UUID_V4 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
RE_GATE_FN = re.compile(
    r"(?:^|_)(?:gate|check|verify|validate|audit|certify)(?:_|$)", re.IGNORECASE
)
PY_AUDIT_FIELDS: frozenset[str] = frozenset(
    {"actor_username", "resource_display_name"}
)
PY_MOCK_CTORS: frozenset[str] = frozenset({"AsyncMock", "MagicMock"})
PY_PATCH_FUNCS: frozenset[str] = frozenset({"patch", "object", "setattr"})
PY_ANTI_EXEMPT_TAG = "qa-py-anti-ok"


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


def _keep_comment_newlines(match: re.Match[str]) -> str:
    return match.group(1) or ("\n" * match.group(0).count("\n"))


def _strip_comments(text: str, is_python: bool) -> str:
    if is_python:
        return "\n".join(
            RE_PY_COMMENT.sub(lambda match: match.group(1) or "", line)
            for line in text.splitlines()
        )
    return RE_JS_COMMENT.sub(_keep_comment_newlines, text)


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
    return path.suffix.lower() in TARGET_EXTENSIONS and ".example" not in path.name


def _walk_directory(directory: Path) -> list[Path]:
    found: list[Path] = []
    for root, dirnames, filenames in os.walk(directory):
        dirnames[:] = sorted(d for d in dirnames if d not in IGNORED_DIRS)
        for fname in sorted(filenames):
            candidate = Path(root) / fname
            if not candidate.is_symlink() and _is_candidate_file(candidate):
                found.append(candidate)
    return found


def _collect_single_target(
    raw_target: str, root: Path, files: list[Path], missing: list[str]
) -> None:
    if "\0" in raw_target:
        missing.append(raw_target)
        return
    candidate = Path(raw_target)
    resolved = candidate if candidate.is_absolute() else (root / candidate)
    if not resolved.exists():
        missing.append(raw_target)
    elif resolved.is_file() and _is_candidate_file(resolved):
        files.append(resolved.resolve())
    elif resolved.is_dir():
        files.extend(p.resolve() for p in _walk_directory(resolved))


def collect_target_files(
    target_paths: Sequence[str], base_dir: Path | None = None
) -> tuple[list[Path], list[str]]:
    """Recolecta archivos auditables ordenados y reporta rutas inexistentes."""
    root = (base_dir or Path.cwd()).resolve()
    files: list[Path] = []
    missing: list[str] = []
    for raw_target in target_paths:
        _collect_single_target(raw_target, root, files, missing)
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


def _is_positive_number(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, (int, float))
        and not isinstance(node.value, bool)
        and float(node.value) > 0
    )


def _check_py_time_sleep_ast(rel_file: str, raw_text: str) -> list[Violation]:
    try:
        tree = ast.parse(raw_text)
    except SyntaxError:
        return []
    msg = "Uso de time.sleep(>0) en archivo de pruebas UI."
    rem = "Esperar por transición DOM/ARIA, respuesta API o estado determinista."
    hits: list[Violation] = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "sleep"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "time"
            and node.args
            and _is_positive_number(node.args[0])
        ):
            hits.append(Violation("QA-UI-ANTI-001", rel_file, node.lineno, msg, rem))
    return hits


def _keep_newlines_only(match: re.Match[str]) -> str:
    return '""' + ("\n" * match.group(0).count("\n"))


def _strip_js_string_literals(clean_text: str) -> str:
    return RE_JS_STR_LITERAL.sub(_keep_newlines_only, clean_text)


def _strip_test_titles(clean_text: str) -> str:
    return RE_TEST_BLOCK_TITLE.sub(
        lambda match: "test(" + ("\n" * match.group(0).count("\n")), clean_text
    )


def _check_arbitrary_waits(
    rel_file: str, clean_text: str, is_python: bool = False, raw_text: str = ""
) -> list[Violation]:
    if not _is_ui_test_scope(rel_file):
        return []
    if is_python:
        return _check_py_time_sleep_ast(rel_file, raw_text or clean_text)
    code_only = _strip_js_string_literals(clean_text)
    return [
        *_check_line_waits(rel_file, code_only),
        *_check_promise_waits(rel_file, code_only),
    ]


def _has_fragile_css_selector(line: str, is_python: bool) -> bool:
    if RE_XPATH_RAW.search(line):
        return True
    if not RE_CSS_FRAGILE.search(line):
        return False
    return bool(RE_PY_CSS_CALL.search(line)) if is_python else True


def _check_fragile_selectors(
    rel_file: str, clean_text: str, is_python: bool = False
) -> list[Violation]:
    if not _is_test_spec(rel_file):
        return []
    msg = "Selector XPath o CSS frágil (:nth-child / anidamiento >) directo en spec."
    remediation = (
        "Reemplazar por ByRole, ByLabel, ByText o encapsular en un adaptador."
    )
    without_titles = _strip_test_titles(clean_text)
    return [
        Violation("QA-UI-ANTI-002", rel_file, line_no, msg, remediation)
        for line_no, line in enumerate(without_titles.splitlines(), 1)
        if _has_fragile_css_selector(line, is_python)
    ]


def _find_ts_class_end(text: str, open_brace_idx: int) -> int:
    depth = 1
    for match in RE_TS_BRACE_OR_STR.finditer(text, open_brace_idx + 1):
        tok = match.group(0)
        if tok in BRACE_DELTA:
            depth += BRACE_DELTA[tok]
            if depth == 0:
                return match.end()
    return len(text)


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


_JSDOM_CONFIG_NAMES: tuple[str, ...] = (
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.js",
    "vitest.config.mjs",
    "jest.config.ts",
    "jest.config.js",
    "jest.config.mjs",
)


def _has_ancestor_jsdom_config(file_path: Path, root: Path) -> bool:
    cur = file_path.parent
    for _ in range(6):
        for cfg_name in _JSDOM_CONFIG_NAMES:
            cfg = cur / cfg_name
            if cfg.is_file() and RE_JSDOM_ENV.search(
                cfg.read_text(encoding="utf-8", errors="ignore")
            ):
                return True
        if cur == root or cur.parent == cur:
            break
        cur = cur.parent
    return False


def _check_jsdom_geometry(
    rel_file: str,
    raw_text: str,
    clean_text: str | None = None,
    force_jsdom: bool = False,
) -> list[Violation]:
    if not force_jsdom and not RE_JSDOM_ENV.search(raw_text):
        return []
    msg = (
        "Medición geométrica (getBoundingClientRect/offsetWidth/offsetHeight) "
        "en entorno JSDOM."
    )
    remediation = (
        "Ejecutar pruebas de geometría en navegador real (Playwright/Vitest Browser)."
    )
    target_text = raw_text if clean_text is None else clean_text
    return [
        Violation("QA-UI-ANTI-005", rel_file, line_no, msg, remediation)
        for line_no, line in enumerate(target_text.splitlines(), 1)
        if RE_DOM_GEOMETRY.search(line)
    ]


def _has_py_anti_exempt(raw_lines: list[str], line_no: int) -> bool:
    if any(PY_ANTI_EXEMPT_TAG in ln for ln in raw_lines[:5]):
        return True
    if 1 <= line_no <= len(raw_lines) and PY_ANTI_EXEMPT_TAG in raw_lines[line_no - 1]:
        return True
    if 2 <= line_no <= len(raw_lines):
        prev = raw_lines[line_no - 2].lstrip()
        return prev.startswith("#") and PY_ANTI_EXEMPT_TAG in prev
    return False


def _is_py_test_scope(rel_posix: str) -> bool:
    return rel_posix.endswith(".py") and bool(RE_PY_TEST_FILE.search(rel_posix))


def _is_py_gate_scope(rel_posix: str) -> bool:
    return rel_posix.endswith(".py") and bool(RE_PY_GATE_FILE.search(rel_posix))


def _call_leaf_name(node: ast.expr) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def _expr_mentions_write_audit(node: ast.expr) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return "write_audit_log" in node.value
    if isinstance(node, ast.Name):
        return node.id == "write_audit_log"
    if isinstance(node, ast.Attribute):
        return node.attr == "write_audit_log"
    return False


def _expr_uses_mock_ctor(node: ast.expr) -> bool:
    if isinstance(node, ast.Name):
        return node.id in PY_MOCK_CTORS
    if isinstance(node, ast.Call):
        return _call_leaf_name(node.func) in PY_MOCK_CTORS
    return False


def _is_audit_patch_call(call: ast.Call) -> bool:
    if _call_leaf_name(call.func) not in PY_PATCH_FUNCS:
        return False
    targets_audit = any(_expr_mentions_write_audit(arg) for arg in call.args[:2])
    if not targets_audit:
        return False
    kw_mock = any(
        kw.arg in {"new", "new_callable", "return_value"}
        and _expr_uses_mock_ctor(kw.value)
        for kw in call.keywords
    )
    arg_mock = len(call.args) >= 3 and _expr_uses_mock_ctor(call.args[2])
    has_passthrough = any(
        kw.arg in {"wraps", "side_effect"} and not _expr_uses_mock_ctor(kw.value)
        for kw in call.keywords
    )
    return kw_mock or arg_mock or not has_passthrough


def _assign_targets_audit(targets: Sequence[ast.expr]) -> bool:
    for tgt in targets:
        if isinstance(tgt, ast.Name) and tgt.id == "write_audit_log":
            return True
        if isinstance(tgt, ast.Attribute) and tgt.attr == "write_audit_log":
            return True
    return False


def _extract_audit_patch_targets(call: ast.Call) -> set[str]:
    targets = {"write_audit_log"}
    if len(call.args) >= 3 and isinstance(call.args[2], ast.Name):
        targets.add(call.args[2].id)
    for kw in call.keywords:
        if kw.arg == "new" and isinstance(kw.value, ast.Name):
            targets.add(kw.value.id)
    return targets


def _extract_assertion_receiver(node: ast.AST) -> str | None:
    if not isinstance(node, ast.Attribute):
        return None
    is_mock_attr = node.attr.startswith(("assert_called", "assert_awaited")) or (
        node.attr in {"call_args", "call_args_list"}
    )
    if not is_mock_attr:
        return None
    if isinstance(node.value, ast.Name):
        return node.value.id
    if isinstance(node.value, ast.Attribute):
        return node.value.attr
    return None


def _iter_scope_nodes(scope: ast.AST) -> Iterator[ast.AST]:
    stack: list[ast.AST] = [scope]
    while stack:
        current = stack.pop()
        yield current
        for child in ast.iter_child_nodes(current):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            stack.append(child)


def _collect_asserted_mock_receivers(scope: ast.AST) -> set[str]:
    receivers: set[str] = set()
    for node in _iter_scope_nodes(scope):
        receiver = _extract_assertion_receiver(node)
        if receiver:
            receivers.add(receiver)
    return receivers


def _has_audit_mock_assertion(
    scope: ast.AST, expected_targets: set[str] | None = None
) -> bool:
    asserted = _collect_asserted_mock_receivers(scope)
    if expected_targets is None:
        return bool(asserted)
    return bool(asserted & expected_targets)


def _with_item_audit_site(item: ast.withitem) -> tuple[int, set[str]] | None:
    if not (
        isinstance(item.context_expr, ast.Call)
        and _is_audit_patch_call(item.context_expr)
    ):
        return None
    targets = _extract_audit_patch_targets(item.context_expr)
    if isinstance(item.optional_vars, ast.Name):
        targets.add(item.optional_vars.id)
    return item.context_expr.lineno, targets


def _is_explicit_new_patch(dec: ast.Call) -> bool:
    return len(dec.args) >= 3 or any(
        kw.arg in {"new", "new_callable", "return_value"} for kw in dec.keywords
    )


def _single_decorator_site(
    dec: ast.expr, pos_args: list[str], patch_idx: int
) -> tuple[tuple[int, set[str]] | None, int]:
    if not (isinstance(dec, ast.Call) and _call_leaf_name(dec.func) in PY_PATCH_FUNCS):
        return None, patch_idx
    explicit_new = _is_explicit_new_patch(dec)
    next_idx = patch_idx if explicit_new else patch_idx + 1
    if not _is_audit_patch_call(dec):
        return None, next_idx
    targets = _extract_audit_patch_targets(dec)
    if not explicit_new and patch_idx < len(pos_args):
        targets.add(pos_args[patch_idx])
    return (dec.lineno, targets), next_idx


def _decorator_patch_sites(scope: ast.AST) -> list[tuple[int, set[str]]]:
    if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return []
    sites: list[tuple[int, set[str]]] = []
    pos_args = [a.arg for a in scope.args.args if a.arg not in {"self", "cls"}]
    patch_idx = 0
    for dec in reversed(scope.decorator_list):
        site, patch_idx = _single_decorator_site(dec, pos_args, patch_idx)
        if site is not None:
            sites.append(site)
    return sites


def _assign_audit_site(node: ast.Assign) -> tuple[int, set[str]] | None:
    if _assign_targets_audit(node.targets) and _expr_uses_mock_ctor(node.value):
        return node.lineno, {"write_audit_log"}
    if not (isinstance(node.value, ast.Call) and _is_audit_patch_call(node.value)):
        return None
    targets = _extract_audit_patch_targets(node.value)
    for tgt in node.targets:
        if isinstance(tgt, ast.Name):
            targets.add(tgt.id)
    return node.lineno, targets


def _collect_with_node_sites(
    node: ast.With | ast.AsyncWith,
    sites: list[tuple[int, set[str]]],
    handled_call_ids: set[int],
) -> None:
    for item in node.items:
        site = _with_item_audit_site(item)
        if site is not None:
            sites.append(site)
            handled_call_ids.add(id(item.context_expr))


def _collect_with_and_assign_sites(
    scope: ast.AST,
) -> tuple[list[tuple[int, set[str]]], set[int]]:
    sites: list[tuple[int, set[str]]] = []
    handled_call_ids: set[int] = set()
    for node in _iter_scope_nodes(scope):
        if isinstance(node, (ast.With, ast.AsyncWith)):
            _collect_with_node_sites(node, sites, handled_call_ids)
        elif isinstance(node, ast.Assign):
            site = _assign_audit_site(node)
            if site is not None:
                sites.append(site)
                handled_call_ids.add(id(node.value))
    return sites, handled_call_ids


def _find_audit_patch_sites(scope: ast.AST) -> list[tuple[int, set[str]]]:
    sites = _decorator_patch_sites(scope)
    handled_call_ids = {
        id(dec)
        for dec in (
            scope.decorator_list
            if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef))
            else ()
        )
    }
    wa_sites, wa_ids = _collect_with_and_assign_sites(scope)
    sites.extend(wa_sites)
    handled_call_ids.update(wa_ids)
    for node in _iter_scope_nodes(scope):
        if (
            isinstance(node, ast.Call)
            and id(node) not in handled_call_ids
            and _is_audit_patch_call(node)
        ):
            sites.append((node.lineno, _extract_audit_patch_targets(node)))
    return sites


def _collect_scope_audit_violations(
    scope: ast.AST,
    rel_file: str,
    raw_lines: list[str],
    seen_lines: set[int],
) -> list[Violation]:
    msg = (
        "Mock ciego sobre write_audit_log sin aserciones "
        "(assert_called* / call_args)."
    )
    rem = (
        "Verificar call_args verificando actor_username y "
        "resource_display_name legibles."
    )
    hits: list[Violation] = []
    for line_no, expected_targets in _find_audit_patch_sites(scope):
        if _has_audit_mock_assertion(scope, expected_targets):
            continue
        if line_no in seen_lines or _has_py_anti_exempt(raw_lines, line_no):
            continue
        seen_lines.add(line_no)
        hits.append(Violation("QA-PY-ANTI-001", rel_file, line_no, msg, rem))
    return hits


def _check_py_blind_audit_mock(
    tree: ast.Module, rel_file: str, raw_lines: list[str]
) -> list[Violation]:
    fn_scopes: list[ast.AST] = [
        n
        for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    scopes: list[ast.AST] = [tree, *fn_scopes]
    violations: list[Violation] = []
    seen_lines: set[int] = set()
    for scope in scopes:
        violations.extend(
            _collect_scope_audit_violations(scope, rel_file, raw_lines, seen_lines)
        )
    return violations


def _is_uuid_v4_const(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and bool(RE_UUID_V4.match(node.value))
    )


def _target_audit_field_name(tgt: ast.expr) -> str | None:
    if isinstance(tgt, ast.Name) and tgt.id in PY_AUDIT_FIELDS:
        return tgt.id
    if isinstance(tgt, ast.Attribute) and tgt.attr in PY_AUDIT_FIELDS:
        return tgt.attr
    if (
        isinstance(tgt, ast.Subscript)
        and isinstance(tgt.slice, ast.Constant)
        and isinstance(tgt.slice.value, str)
        and tgt.slice.value in PY_AUDIT_FIELDS
    ):
        return tgt.slice.value
    return None


def _uuid_hits_in_node(node: ast.AST) -> list[tuple[int, str]]:
    if isinstance(node, ast.Dict):
        return [
            (val.lineno, str(key.value))
            for key, val in zip(node.keys, node.values, strict=False)
            if isinstance(key, ast.Constant)
            and isinstance(key.value, str)
            and key.value in PY_AUDIT_FIELDS
            and _is_uuid_v4_const(val)
        ]
    if isinstance(node, ast.Call):
        return [
            (kw.value.lineno, kw.arg)
            for kw in node.keywords
            if kw.arg in PY_AUDIT_FIELDS and _is_uuid_v4_const(kw.value)
        ]
    if isinstance(node, ast.Assign) and _is_uuid_v4_const(node.value):
        return [
            (node.lineno, name)
            for tgt in node.targets
            if (name := _target_audit_field_name(tgt)) is not None
        ]
    if (
        isinstance(node, ast.AnnAssign)
        and node.value is not None
        and _is_uuid_v4_const(node.value)
    ):
        name = _target_audit_field_name(node.target)
        return [(node.lineno, name)] if name else []
    return []


def _check_py_uuid_audit_fields(
    tree: ast.Module, rel_file: str, raw_lines: list[str]
) -> list[Violation]:
    rem = "Usar nombre de usuario o recurso legible en lugar de UUID v4 literal."
    violations: list[Violation] = []
    for node in ast.walk(tree):
        for line_no, field_name in _uuid_hits_in_node(node):
            if not _has_py_anti_exempt(raw_lines, line_no):
                violations.append(
                    Violation(
                        "QA-PY-ANTI-002",
                        rel_file,
                        line_no,
                        f"UUID v4 literal asignado a '{field_name}'.",
                        rem,
                    )
                )
    return violations


_PASS_DICT_KEYS: frozenset[str] = frozenset(
    {"status", "state", "result", "passed", "ok", "valid", "success"}
)


def _is_pass_constant(expr: ast.expr) -> bool:
    if not isinstance(expr, ast.Constant):
        return False
    val = expr.value
    if val is True:
        return True
    return isinstance(val, str) and val.strip().upper() in {"PASS", "PASSED"}


def _is_pass_dict_entry(key: ast.expr | None, val: ast.expr | None) -> bool:
    if val is None or not _is_pass_constant(val):
        return False
    if (
        isinstance(val, ast.Constant)
        and isinstance(val.value, str)
        and val.value.strip().upper() in {"PASS", "PASSED"}
    ):
        return True
    return (
        isinstance(key, ast.Constant)
        and isinstance(key.value, str)
        and key.value.lower() in _PASS_DICT_KEYS
    )


def _is_pass_expr(expr: ast.expr) -> bool:
    if _is_pass_constant(expr):
        return True
    if isinstance(expr, (ast.Tuple, ast.List)):
        return any(_is_pass_constant(elt) for elt in expr.elts)
    if isinstance(expr, ast.Dict):
        return any(
            _is_pass_dict_entry(k, v)
            for k, v in zip(expr.keys, expr.values, strict=False)
        )
    return False


def _is_hardcoded_pass_return(node: ast.AST) -> bool:
    if not isinstance(node, ast.Return) or node.value is None:
        return False
    return _is_pass_expr(node.value)


def _collect_hardcoded_pass_lines(stmts: Sequence[ast.stmt]) -> list[int]:
    hits: list[int] = []
    for stmt in stmts:
        for sub in ast.walk(stmt):
            if _is_hardcoded_pass_return(sub):
                hits.append(sub.lineno)  # type: ignore[attr-defined]
    return hits


def _scan_gate_function(
    fn_node: ast.FunctionDef | ast.AsyncFunctionDef,
) -> list[int]:
    if not RE_GATE_FN.search(fn_node.name):
        return []
    lines: list[int] = []
    for sub in ast.walk(fn_node):
        if isinstance(sub, ast.ExceptHandler):
            lines.extend(_collect_hardcoded_pass_lines(sub.body))
        elif isinstance(sub, ast.If) and "skip" in ast.unparse(sub.test).lower():
            is_negated = isinstance(sub.test, ast.UnaryOp) and isinstance(
                sub.test.op, ast.Not
            )
            branch = sub.orelse if is_negated else sub.body
            lines.extend(_collect_hardcoded_pass_lines(branch))
    return sorted(set(lines))


def _collect_gate_func_violations(
    node: ast.AST, rel_file: str, raw_lines: list[str]
) -> list[Violation]:
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return []
    msg = (
        "Función gate/check devuelve literal True/'PASSED' "
        "en rama except o skip."
    )
    rem = "Retornar False, 'SKIPPED' o propagar el fallo real."
    return [
        Violation("QA-PY-ANTI-003", rel_file, line_no, msg, rem)
        for line_no in _scan_gate_function(node)
        if not _has_py_anti_exempt(raw_lines, line_no)
    ]


def _check_py_hardcoded_gate_pass(
    tree: ast.Module, rel_file: str, raw_lines: list[str]
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        violations.extend(
            _collect_gate_func_violations(node, rel_file, raw_lines)
        )
    return violations


def _check_python_ast_antipatterns(
    rel_file: str, raw_text: str
) -> list[Violation]:
    is_test = _is_py_test_scope(rel_file)
    is_gate = not is_test and _is_py_gate_scope(rel_file)
    if not is_test and not is_gate:
        return []
    try:
        tree = ast.parse(raw_text)
    except SyntaxError:
        return []
    raw_lines = raw_text.splitlines()
    if is_gate:
        return _check_py_hardcoded_gate_pass(tree, rel_file, raw_lines)
    return [
        *_check_py_blind_audit_mock(tree, rel_file, raw_lines),
        *_check_py_uuid_audit_fields(tree, rel_file, raw_lines),
        *_check_py_hardcoded_gate_pass(tree, rel_file, raw_lines),
    ]


def _relative_display(file_path: Path, base_dir: Path) -> str:
    try:
        return file_path.relative_to(base_dir).as_posix()
    except ValueError:
        return file_path.as_posix()


def _audit_single_file(
    file_path: Path, root: Path, page_records: list[PageClassRecord]
) -> list[Violation]:
    rel_file = _relative_display(file_path, root)
    raw_text = file_path.read_text(encoding="utf-8-sig", errors="ignore")
    is_python = file_path.suffix.lower() == ".py"
    clean_text = _strip_comments(raw_text, is_python)
    violations: list[Violation] = []
    if "meta_qa" not in Path(rel_file).parts:
        violations.extend(
            _check_arbitrary_waits(rel_file, clean_text, is_python, raw_text)
        )
        violations.extend(
            _check_fragile_selectors(rel_file, clean_text, is_python=is_python)
        )
        violations.extend(_check_hidden_assertions(rel_file, clean_text))
        if not is_python:
            violations.extend(
                _check_jsdom_geometry(
                    rel_file,
                    raw_text,
                    clean_text,
                    force_jsdom=_has_ancestor_jsdom_config(file_path, root),
                )
            )
        extractor = _extract_py_page_classes if is_python else _extract_ts_page_classes
        page_records.extend(extractor(rel_file, clean_text))
    if is_python:
        violations.extend(_check_python_ast_antipatterns(rel_file, raw_text))
    return violations


def audit_paths(
    target_paths: Sequence[str], base_dir: Path | None = None
) -> tuple[list[Violation], list[str], int]:
    """Ejecuta las reglas QA-UI-ANTI-001..005 y QA-PY-ANTI-001..003."""
    root = (base_dir or Path.cwd()).resolve()
    files, missing = collect_target_files(target_paths, root)
    violations: list[Violation] = []
    page_records: list[PageClassRecord] = []

    for file_path in files:
        violations.extend(_audit_single_file(file_path, root, page_records))

    violations.extend(_evaluate_page_records(page_records))
    violations.sort(key=lambda item: (item.file, item.line, item.rule_id))
    return violations, missing, len(files)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Linter estático QA-11X de antipatrones UI/Python "
            "(QA-UI-ANTI-001..005 / QA-PY-ANTI-001..003)."
        )
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=[],
        help="Archivos o directorios objetivo (si se omite, autodetecta en workspace).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emite el reporte estructurado en formato JSON.",
    )
    return parser


def _resolve_cli_paths(
    raw_paths: Sequence[str], root: Path
) -> tuple[list[str], bool]:
    if raw_paths:
        return list(raw_paths), False
    return [d for d in AUTO_DETECT_DIRS if (root / d).is_dir()], True


def _emit_skipped_report(as_json: bool) -> int:
    if as_json:
        print(
            json.dumps(
                {
                    "status": "skipped",
                    "scanned_files": 0,
                    "missing_paths": [],
                    "violations": [],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(
            "⚠️ [SKIPPED] [lint-antipatterns] Sin directorios auditables "
            "detectados en workspace."
        )
    return 0


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
    root = (base_dir or Path.cwd()).resolve()
    target_paths, auto_mode = _resolve_cli_paths(args.paths, root)
    if auto_mode and not target_paths:
        return _emit_skipped_report(bool(args.json))
    violations, missing, scanned = audit_paths(target_paths, base_dir=root)
    if args.json:
        _emit_json_report(violations, missing, scanned)
    else:
        _emit_text_report(violations, missing, scanned)
    return 1 if (violations or missing) else 0


if __name__ == "__main__":
    raise SystemExit(main())
