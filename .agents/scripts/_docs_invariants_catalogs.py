# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Validadores de catálogos, GEO, contratos de stacks, scoreboards y fugas privadas."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

from _common import CANONICAL_IGNORED_DIRS, PRIVATE_CONSUMER_LEAK_PATTERNS
from _docs_invariants_bilingual import _collect_agent_markdown_targets
from _docs_invariants_config import (
    _HISTORICAL_SPEC_RE,
    DOC_TARGETS,
    EXPECTED_SKILLS_COUNT,
    REQUIRED_CATALOG_FILES,
    RepoExpectedCounts,
    _load_json_strict,
    _read_mcp_server_sources,
)
from _docs_invariants_counts import derive_expected_counts

_DEFAULT_REFACTORING_UI_TOPICS = frozenset({
    "skill",
    "hierarchy",
    "layout",
    "type",
    "color",
    "depth",
    "images",
    "polish",
    "dark-mode",
    "tailwind",
})
_REFACTORING_URI_RE = re.compile(r"blueprint://ui/refactoring-ui/([A-Za-z0-9_-]+)")
_NGINX_PUBLIC_IMG_PAT = (
    r"location\s+~\*\s+\\\.\(\?:ico\|svg\|png\|webmanifest\)\$\s*\{([^}]*)\}"
)
_NGINX_IMMUTABLE_PAT = (
    r"location\s+~\*\s+"
    r"\\\.\(\?:js\|mjs\|css\|woff2\|woff\|ttf\|webp\|avif\)\$\s*\{([^}]*)\}"
)
_NGINX_INDEX_PAT = r"location\s+=\s+/index\.html\s*\{([^}]*)\}"
_VITEST_COMMENT_RE = re.compile(
    r"(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)"
    r"|(/\*[\s\S]*?\*/|//[^\n]*)"
)
_VITEST_REPORTER_RE = re.compile(r"reporter\s*:\s*\[([^\]]+)\]", re.DOTALL)
_TESTING_S2_STMTS_RE = re.compile(
    r"\*\*(?:Statements|Sentencias \(Statements\)):\*\*\s*`(\d+(?:\.\d+)%)`"
)
_TESTING_S2_BRANCHES_RE = re.compile(
    r"\*\*(?:Branches|Ramas \(Branches\)):\*\*\s*`(\d+(?:\.\d+)%)`"
)
_TESTING_S2_FUNCS_RE = re.compile(
    r"\*\*(?:Functions|Funciones \(Functions\)):\*\*\s*`(\d+(?:\.\d+)%)`"
)
_TESTING_S2_LINES_RE = re.compile(
    r"\*\*(?:Lines|Líneas \(Lines\)):\*\*\s*`(\d+(?:\.\d+)%)`"
)
_TESTING_S2_TESTS_RE = re.compile(
    r"\*\*(\d+)\s+(?:tests passing at|pruebas pasando al)\s+100%\*\*\s*"
    r"\((\d+)\s+(?:Vitest suites|suites Vitest)"
)
_TESTING_S4_TESTS_RE = re.compile(
    r"\*\*(\d+)\*\*\s+(?:Vitest tests across|pruebas Vitest distribuidas en)\s+"
    r"\*\*(\d+)\s+(?:Vitest suites|suites Vitest)\*\*"
)
_TESTING_S4_COV_RE = re.compile(
    r"\*\*(\d+(?:\.\d+)%)\s+(?:line/statement coverage and|"
    r"de cobertura de líneas/sentencias y)\s+"
    r"(\d+(?:\.\d+)%)\s+(?:branch coverage|de cobertura de ramas)\*\*"
)
_TESTING_S4_FUNCS_RE = re.compile(
    r"\*\*(\d+(?:\.\d+)%)\s+(?:function coverage|de cobertura de funciones)\*\*"
)
_SKILL_BACKTICK_REF_RE = re.compile(r"`(references/[A-Za-z0-9._/-]+\.md)`")
_SIBLING_SKILL_REF_RE = re.compile(r"`(qa-11x-[a-z0-9-]+)`\s*\($")
_FENCE_LINE_RE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
_LEAK_SCAN_EXTS = frozenset({
    ".md", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".sh", ".yml", ".yaml",
    ".json", ".toml", ".vue", ".feature", ".bats", ".sql", ".example",
})
_LEAK_EXEMPT_EXACT = frozenset({
    ".agents/scripts/_common.py",
    "CHANGELOG.md",
    "CHANGELOG.es.md",
    "mcp-server/CHANGELOG.md",
    "mcp-server/CHANGELOG.es.md",
    "mcp-server/example/CHANGELOG.md",
    "mcp-server/example/CHANGELOG.es.md",
})
_CATALOG_CMD_RE = re.compile(r"\bname:\s*['\"]([a-z0-9-]+)['\"]")
_CATALOG_FLAG_RE = re.compile(r"\blong:\s*['\"](--[a-z0-9-]+)['\"]")


def _derive_refactoring_ui_topics(root: Path) -> frozenset[str]:
    refs_dir = root / ".agents" / "skills" / "refactoring-ui" / "references"
    if not refs_dir.is_dir():
        return _DEFAULT_REFACTORING_UI_TOPICS
    stems = {p.stem for p in refs_dir.glob("*.md") if p.is_file()}
    return frozenset({"skill", *stems}) if stems else _DEFAULT_REFACTORING_UI_TOPICS


def _scan_doc_refactoring_topics(
    root: Path, rel_path: str, valid_topics: frozenset[str]
) -> list[str]:
    doc = root / rel_path
    if not doc.is_file():
        return []
    content = doc.read_text(encoding="utf-8", errors="ignore")
    return [
        f"{rel_path}: tema inválido en "
        f"'blueprint://ui/refactoring-ui/{match.group(1)}'."
        for match in _REFACTORING_URI_RE.finditer(content)
        if match.group(1) not in valid_topics
    ]


def _check_refactoring_ui_topics(root: Path) -> list[str]:
    valid_topics = _derive_refactoring_ui_topics(root)
    targets = sorted(set((*DOC_TARGETS, *_collect_agent_markdown_targets(root))))
    errors: list[str] = []
    for rel_path in targets:
        if not _HISTORICAL_SPEC_RE.match(rel_path):
            errors.extend(_scan_doc_refactoring_topics(root, rel_path, valid_topics))
    return errors


def _expected_pkg_version(root: Path) -> str | None:
    pkg_path = root / "mcp-server" / "package.json"
    if not pkg_path.is_file():
        return None
    data, _ = _load_json_strict(pkg_path)
    if isinstance(data, dict) and isinstance(data.get("version"), str):
        return str(data["version"]).strip()
    return None


def _extract_repo_skill_ids(root: Path) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    return sorted(p.parent.name for p in skills_dir.glob("*/SKILL.md") if p.is_file())


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _validate_single_skill_entry(
    root: Path, rel_file: str, entry: Any, verify_digest: bool
) -> tuple[str | None, list[str]]:
    if not isinstance(entry, dict):
        return None, [f"{rel_file}: entrada de skill inválida."]
    sid = str(entry.get("id", ""))
    spath = str(entry.get("path", ""))
    full = root / spath
    if not spath or not full.is_file():
        return sid, [f"{rel_file}: ruta SKILL.md inexistente '{spath}'."]
    if verify_digest and (
        entry.get("sha256") != _sha256_file(full)
        or entry.get("size_bytes") != full.stat().st_size
    ):
        return sid, [f"{rel_file}: desfase SHA-256/size_bytes en '{spath}'."]
    return sid, []


def _check_skill_entries(
    root: Path,
    rel_file: str,
    skills_raw: Any,
    repo_skills: list[str],
    verify_digest: bool,
    expected_skills: int = EXPECTED_SKILLS_COUNT,
) -> list[str]:
    if not isinstance(skills_raw, list) or len(skills_raw) != expected_skills:
        count = len(skills_raw) if isinstance(skills_raw, list) else "invalid"
        return [
            f"{rel_file}: se esperan {expected_skills} skills reales "
            f"(encontradas={count})."
        ]
    errors: list[str] = []
    seen_ids: list[str] = []
    for entry in skills_raw:
        sid, item_errs = _validate_single_skill_entry(
            root, rel_file, entry, verify_digest
        )
        if sid is not None:
            seen_ids.append(sid)
        errors.extend(item_errs)
    if repo_skills and sorted(seen_ids) != repo_skills:
        errors.append(
            f"{rel_file}: desfase entre skills declaradas y .agents/skills/."
        )
    return errors


def _validate_qaskills_pack(
    root: Path,
    expected_ver: str | None,
    repo_skills: list[str],
    expected_skills: int,
) -> list[str]:
    rel = "catalogs/qaskills-pack.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."]
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    errors.extend(
        _check_skill_entries(
            root,
            rel,
            data.get("skills"),
            repo_skills,
            verify_digest=False,
            expected_skills=expected_skills,
        )
    )
    return errors


def _validate_manifest_capabilities(
    rel: str, caps: Any, counts: RepoExpectedCounts
) -> tuple[list[str], list[str], list[str]]:
    errors: list[str] = []
    tools = caps.get("tools") if isinstance(caps, dict) else None
    resources = caps.get("resources") if isinstance(caps, dict) else None
    tools_ok = (
        isinstance(caps, dict)
        and caps.get("tools_count") == counts.tools
        and isinstance(tools, list)
        and len(tools) == counts.tools
    )
    if not tools_ok:
        errors.append(
            f"{rel}: mcp_capabilities.tools debe listar exactamente "
            f"{counts.tools} tools."
        )
    res_ok = (
        isinstance(caps, dict)
        and caps.get("resources_count") == counts.resources
        and isinstance(resources, list)
        and len(resources) == counts.resources
    )
    if not res_ok:
        errors.append(
            f"{rel}: mcp_capabilities.resources debe listar exactamente "
            f"{counts.resources} resources."
        )
    tool_list = [str(t) for t in tools] if isinstance(tools, list) else []
    res_list = [str(r) for r in resources] if isinstance(resources, list) else []
    return errors, tool_list, res_list


def _validate_skillsllm_manifest(
    root: Path,
    expected_ver: str | None,
    repo_skills: list[str],
    counts: RepoExpectedCounts | None = None,
) -> tuple[list[str], list[str], list[str]]:
    resolved = counts or derive_expected_counts(root)
    rel = "catalogs/skillsllm-manifest.json"
    data, err = _load_json_strict(root / rel)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."], [], []
    errors: list[str] = []
    if data.get("license") != "MIT":
        errors.append(f"{rel}: licencia esperada 'MIT'.")
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    cap_errs, tool_list, res_list = _validate_manifest_capabilities(
        rel, data.get("mcp_capabilities"), resolved
    )
    errors.extend(cap_errs)
    bps = data.get("blueprints")
    if not isinstance(bps, list) or len(bps) != resolved.blueprints:
        errors.append(f"{rel}: se esperan {resolved.blueprints} blueprints raíz.")
    errors.extend(
        _check_skill_entries(
            root,
            rel,
            data.get("skills"),
            repo_skills,
            verify_digest=True,
            expected_skills=resolved.skills,
        )
    )
    return errors, tool_list, res_list


def _validate_geo_surface(
    path: Path, label: str, tokens: list[str], kind: str
) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [tok for tok in tokens if tok not in text]
    if not missing:
        return []
    return [f"{label}: faltan {kind} ({', '.join(missing[:3])})."]


def _validate_root_manifest(root: Path, counts: RepoExpectedCounts) -> list[str]:
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        return []
    data, err = _load_json_strict(manifest_path)
    if err or data is None:
        return [f"manifest.json: JSON inválido ({err})."]
    stacks = data.get("stacks")
    if isinstance(stacks, dict) and len(stacks) == counts.blueprints:
        return []
    found = len(stacks) if isinstance(stacks, dict) else "invalid"
    return [
        f"manifest.json: se esperan {counts.blueprints} stacks (encontradas={found})."
    ]


def check_global_catalogs_and_geo(root: Path) -> list[str]:
    """Valida llms.txt y catálogos globales contra conteos reales y SHA-256."""
    if not (root / "llms.txt").is_file() and not (root / "catalogs").is_dir():
        return []
    missing = [rel for rel in REQUIRED_CATALOG_FILES if not (root / rel).is_file()]
    if missing:
        return [f"Falta artefacto GEO/catálogo obligatorio: {rel}." for rel in missing]
    counts = derive_expected_counts(root)
    expected_ver = _expected_pkg_version(root)
    repo_skills = _extract_repo_skill_ids(root)
    errors = [
        *_validate_root_manifest(root, counts),
        *_validate_qaskills_pack(root, expected_ver, repo_skills, counts.skills),
    ]
    s_errors, tools, resources = _validate_skillsllm_manifest(
        root, expected_ver, repo_skills, counts
    )
    errors.extend(s_errors)
    skill_tokens = repo_skills or [
        "qa-11x-architect",
        "qa-11x-devsecops-hardener",
        "qa-11x-systematic-debugging",
        "qa-11x-screenplay-builder",
        "qa-11x-llm-evaluator",
        "qa-11x-vibe-rescue",
        "qa-11x-docker-certifier",
        "docker-trivy-keydb-hardening",
        "graphify-ast-navigator",
        "refactoring-ui",
        "tactical-patterns-11x",
    ]
    for rel in ("llms.txt", "catalogs/agenticskills-submission.md"):
        doc = root / rel
        errors.extend(_validate_geo_surface(doc, rel, skill_tokens, "skills"))
        errors.extend(_validate_geo_surface(doc, rel, tools, "tools MCP"))
        errors.extend(_validate_geo_surface(doc, rel, resources, "resources MCP"))
    return errors


def _strip_js_comments_preserving_strings(src: str) -> str:
    return _VITEST_COMMENT_RE.sub(
        lambda m: m.group(1) if m.group(1) is not None else " ",
        src,
    )


def _check_specs_readme_entries(root: Path) -> list[str]:
    errors: list[str] = []
    for rel in ("docs/specs/README.md", "docs/specs/README.es.md"):
        doc = root / rel
        if not doc.is_file():
            continue
        text = doc.read_text(encoding="utf-8")
        if "session_flight_recorder" not in text:
            errors.append(f"{rel}: falta Tool 19 'session_flight_recorder'.")
        if "blueprint://skills/tactical-patterns-11x" not in text:
            errors.append(
                f"{rel}: falta Resource 13 'blueprint://skills/tactical-patterns-11x'."
            )
    return errors


def _check_mcp_source_registrations(root: Path) -> list[str]:
    errors: list[str] = []
    server_src = _read_mcp_server_sources(root)
    if server_src and (
        "session_flight_recorder" not in server_src
        and "SESSION_FLIGHT_RECORDER_TOOL" not in server_src
    ):
        errors.append("mcp-server/src/server.ts: falta 'session_flight_recorder'.")
    tactical_ts = (
        root / "mcp-server" / "src" / "resources" / "tacticalPatternsSkill.ts"
    )
    if tactical_ts.is_file() and (
        "blueprint://skills/tactical-patterns-11x"
        not in tactical_ts.read_text(encoding="utf-8")
    ):
        errors.append(
            "tacticalPatternsSkill.ts: falta URI "
            "'blueprint://skills/tactical-patterns-11x'."
        )
    return errors


def _check_spec_readme_mcp_surface(root: Path) -> list[str]:
    return [
        *_check_specs_readme_entries(root),
        *_check_mcp_source_registrations(root),
    ]


def _validate_single_nginx_corp(fe_stack: str, nginx_conf: str) -> list[str]:
    errors: list[str] = []
    public_match = re.search(_NGINX_PUBLIC_IMG_PAT, nginx_conf)
    if not public_match or (
        'add_header Cross-Origin-Resource-Policy "cross-origin" always;'
        not in public_match.group(1)
    ):
        errors.append(
            f"{fe_stack}/nginx/default.conf.example: falta UI-11X-03 "
            'CORP "cross-origin" en ico|svg|png|webmanifest.'
        )
    server_head = nginx_conf.split("location ", 1)[0]
    immutable_match = re.search(_NGINX_IMMUTABLE_PAT, nginx_conf)
    index_match = re.search(_NGINX_INDEX_PAT, nginx_conf)
    strict_blocks = (
        ("server", server_head),
        ("immutable", immutable_match.group(1) if immutable_match else ""),
        ("index.html", index_match.group(1) if index_match else ""),
    )
    for label, block in strict_blocks:
        if (
            'add_header Cross-Origin-Resource-Policy "same-origin" always;'
            not in block
            or '"cross-origin"' in block
        ):
            errors.append(
                f"{fe_stack}/nginx/default.conf.example ({label}): "
                'CORP debe ser estrictamente "same-origin".'
            )
    return errors


def _check_nginx_ui_11x_03(root: Path) -> list[str]:
    errors: list[str] = []
    for fe_stack in ("vue3", "react-frontend"):
        conf_path = root / fe_stack / "nginx" / "default.conf.example"
        if conf_path.is_file():
            errors.extend(
                _validate_single_nginx_corp(
                    fe_stack, conf_path.read_text(encoding="utf-8")
                )
            )
    return errors


def _check_vitest_lcov_reporters(root: Path) -> list[str]:
    errors: list[str] = []
    for stack in ("node-backend", "vue3", "react-frontend"):
        cfg_path = root / stack / "vitest.config.ts.example"
        if not cfg_path.is_file():
            continue
        cleaned = _strip_js_comments_preserving_strings(
            cfg_path.read_text(encoding="utf-8")
        )
        match = _VITEST_REPORTER_RE.search(cleaned)
        if not match or not re.search(r"['\"]lcov['\"]", match.group(1)):
            errors.append(
                f"{stack}/vitest.config.ts.example: falta reporter 'lcov' activo."
            )
    return errors


def _extract_s2_metrics(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, pat in (
        ("statements", _TESTING_S2_STMTS_RE),
        ("branches", _TESTING_S2_BRANCHES_RE),
        ("functions", _TESTING_S2_FUNCS_RE),
        ("lines", _TESTING_S2_LINES_RE),
    ):
        match = pat.search(text)
        if match:
            out[key] = match.group(1)
    tm = _TESTING_S2_TESTS_RE.search(text)
    if tm:
        out["tests"] = tm.group(1)
        out["suites"] = tm.group(2)
    return out


def _extract_s4_metrics(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    tm = _TESTING_S4_TESTS_RE.search(text)
    if tm:
        out["tests"] = tm.group(1)
        out["suites"] = tm.group(2)
    cm = _TESTING_S4_COV_RE.search(text)
    if cm:
        out["lines"] = cm.group(1)
        out["branches"] = cm.group(2)
    fm = _TESTING_S4_FUNCS_RE.search(text)
    if fm:
        out["functions"] = fm.group(1)
    return out


def _compare_s2_s4(rel: str, s2: dict[str, str], s4: dict[str, str]) -> list[str]:
    errors: list[str] = []
    if s2.get("statements") and s2.get("lines") and s2["statements"] != s2["lines"]:
        errors.append(
            f"{rel}: §2 Statements ({s2['statements']}) != Lines ({s2['lines']})."
        )
    for key in ("tests", "suites", "lines", "branches", "functions"):
        v2, v4 = s2.get(key), s4.get(key)
        if v2 and v4 and v2 != v4:
            errors.append(f"{rel}: desfase §2 vs §4 en {key} ({v2} != {v4}).")
    return errors


def _collect_testing_scoreboards(
    root: Path,
) -> tuple[dict[str, dict[str, str]], list[str]]:
    boards: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    for rel in ("TESTING.md", "TESTING.es.md"):
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        s2, s4 = _extract_s2_metrics(text), _extract_s4_metrics(text)
        if s2 and s4:
            errors.extend(_compare_s2_s4(rel, s2, s4))
            boards[rel] = s2
        elif s2 or s4:
            errors.append(
                f"{rel}: marcador de cobertura incompleto (falta §2 o §4)."
            )
    return boards, errors


def check_testing_scoreboard_consistency(root: Path) -> list[str]:
    """Verifica coherencia §2 vs §4 y paridad EN/ES en TESTING.{md,es.md}."""
    boards, errors = _collect_testing_scoreboards(root)
    en, es = boards.get("TESTING.md"), boards.get("TESTING.es.md")
    if en and es:
        for key in ("tests", "suites", "statements", "branches", "functions", "lines"):
            if en.get(key) != es.get(key):
                errors.append(
                    f"TESTING.md vs TESTING.es.md: desfase en {key} "
                    f"({en.get(key)} != {es.get(key)})."
                )
    return errors


def _check_specs_and_stack_contracts(root: Path) -> list[str]:
    """Valida invariantes opcionales de Specs README, UI-11X-03 y Vitest lcov."""
    return [
        *_check_spec_readme_mcp_surface(root),
        *_check_nginx_ui_11x_03(root),
        *_check_vitest_lcov_reporters(root),
    ]


def _resolve_skill_ref_base(skill_dir: Path, line: str, start_idx: int) -> Path | None:
    prefix = line[:start_idx]
    sibling_match = _SIBLING_SKILL_REF_RE.search(prefix)
    if sibling_match:
        sibling_dir = skill_dir.parent / sibling_match.group(1)
        return sibling_dir if sibling_dir.is_dir() else None
    return skill_dir


def _scan_single_skill_backticks(skill_md: Path) -> list[str]:
    skill_dir = skill_md.parent
    text = skill_md.read_text(encoding="utf-8", errors="ignore")
    errors: list[str] = []
    for ln, line in enumerate(text.splitlines(), 1):
        for match in _SKILL_BACKTICK_REF_RE.finditer(line):
            rel_ref = match.group(1)
            base_dir = _resolve_skill_ref_base(skill_dir, line, match.start())
            if (
                base_dir is not None
                and ".." not in rel_ref
                and not (base_dir / rel_ref).is_file()
            ):
                errors.append(
                    f".agents/skills/{skill_dir.name}/SKILL.md:{ln}: "
                    f"referencia '{rel_ref}' no existe en disco."
                )
    return errors


def _check_skill_backtick_references(root: Path) -> list[str]:
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return []
    errors: list[str] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        errors.extend(_scan_single_skill_backticks(skill_md))
    return errors


def _validate_claude_plugin_json(
    root: Path, expected_ver: str | None
) -> list[str]:
    rel = ".claude-plugin/plugin.json"
    path = root / rel
    if not path.is_file():
        return [f"{rel}: archivo obligatorio ausente."]
    data, err = _load_json_strict(path)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."]
    errors: list[str] = []
    if expected_ver and data.get("version") != expected_ver:
        errors.append(f"{rel}: version '{data.get('version')}' != '{expected_ver}'.")
    skills_rel = str(data.get("skills") or "")
    if skills_rel != "./.agents/skills" or not (root / ".agents" / "skills").is_dir():
        errors.append(
            f"{rel}: 'skills' debe apuntar a './.agents/skills' existente en disco."
        )
    return errors


def _validate_claude_marketplace_json(
    root: Path, expected_ver: str | None
) -> list[str]:
    rel = ".claude-plugin/marketplace.json"
    path = root / rel
    if not path.is_file():
        return [f"{rel}: archivo obligatorio ausente."]
    data, err = _load_json_strict(path)
    if err or data is None:
        return [f"{rel}: JSON inválido ({err})."]
    plugins = data.get("plugins")
    if not isinstance(plugins, list) or not plugins or not isinstance(plugins[0], dict):
        return [f"{rel}: 'plugins' debe contener una entrada válida."]
    if expected_ver and plugins[0].get("version") != expected_ver:
        return [f"{rel}: version '{plugins[0].get('version')}' != '{expected_ver}'."]
    return []


def _find_unclosed_fence_line(text: str) -> int | None:
    """Detecta bloques cercados (``` o ~~~) sin cierre en un documento Markdown."""
    open_char = ""
    open_len = 0
    open_line: int | None = None
    for idx, line in enumerate(text.splitlines(), 1):
        match = _FENCE_LINE_RE.match(line)
        if not match:
            continue
        marker, rest = match.group(1), match.group(2).strip()
        if not open_char:
            open_char, open_len, open_line = marker[0], len(marker), idx
        elif marker[0] == open_char and len(marker) >= open_len and not rest:
            open_char, open_len, open_line = "", 0, None
    return open_line


def _check_markdown_fence_balance(root: Path) -> list[str]:
    """Audita balanceo de cercas de código en skills, reglas y guías (anti-H29)."""
    candidates: list[Path] = [
        p for p in sorted(root.glob("*.md")) if p.is_file()
    ]
    for folder in (".agents/skills", ".agents/rules", "docs"):
        base = root / folder
        if base.is_dir():
            candidates.extend(sorted(p for p in base.rglob("*.md") if p.is_file()))
    errors: list[str] = []
    for md_path in candidates:
        unclosed = _find_unclosed_fence_line(md_path.read_text(encoding="utf-8"))
        if unclosed is not None:
            rel = md_path.relative_to(root).as_posix()
            errors.append(f"{rel}:{unclosed}: bloque cercado Markdown sin cierre.")
    return errors


def _check_claude_plugin_manifests(root: Path) -> list[str]:
    if not (root / ".claude-plugin").is_dir():
        return []
    expected_ver = _expected_pkg_version(root)
    return [
        *_validate_claude_plugin_json(root, expected_ver),
        *_validate_claude_marketplace_json(root, expected_ver),
    ]


def _is_leak_exempt_rel(rel: str) -> bool:
    return (
        rel in _LEAK_EXEMPT_EXACT
        or bool(_HISTORICAL_SPEC_RE.match(rel))
        or rel.startswith(".agents/.cache/")
    )


def _scan_file_for_private_leaks(rel: str, full_path: Path) -> list[str]:
    text = full_path.read_text(encoding="utf-8", errors="ignore")
    if "qa-leak-guard-ok" in text:
        return []
    errors: list[str] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        for label, pattern in PRIVATE_CONSUMER_LEAK_PATTERNS:
            if pattern.search(line):
                errors.append(
                    f"{rel}:{line_no}: fuga de artefacto consumidor privado ({label})."
                )
    return errors


_LEAK_IGNORED_DIRS = CANONICAL_IGNORED_DIRS | {"propuestas"}


def check_no_private_consumer_leaks(root: Path) -> list[str]:
    """Impide fugas de nombres/rutas de consumidores privados en código/reglas OSS."""
    errors: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _LEAK_IGNORED_DIRS)
        cur = Path(dirpath)
        for fname in sorted(filenames):
            full = cur / fname
            if full.suffix.lower() not in _LEAK_SCAN_EXTS:
                continue
            rel = full.relative_to(root).as_posix()
            if not _is_leak_exempt_rel(rel):
                errors.extend(_scan_file_for_private_leaks(rel, full))
    return errors


def _check_single_readme_cli_parity(
    rel: str, txt: str, cmds: list[str], flags: list[str]
) -> list[str]:
    errors: list[str] = []
    missing_cmds = [cmd for cmd in cmds if cmd not in txt]
    if missing_cmds:
        errors.append(
            f"{rel}: faltan subcomandos CLI declarados en commandCatalog.ts "
            f"({', '.join(missing_cmds[:4])})."
        )
    missing_flags = [flag for flag in flags if flag not in txt]
    if missing_flags:
        errors.append(
            f"{rel}: faltan flags CLI declarados en commandCatalog.ts "
            f"({', '.join(missing_flags[:6])})."
        )
    return errors


def _check_cli_catalog_in_readmes(root: Path) -> list[str]:
    catalog_ts = root / "mcp-server" / "src" / "cli" / "commandCatalog.ts"
    if not catalog_ts.is_file():
        return []
    raw = catalog_ts.read_text(encoding="utf-8")
    cmds = sorted(set(_CATALOG_CMD_RE.findall(raw)))
    flags = sorted(set(_CATALOG_FLAG_RE.findall(raw)))
    errors: list[str] = []
    for rel in ("mcp-server/README.md", "mcp-server/README.es.md"):
        doc = root / rel
        if doc.is_file():
            errors.extend(
                _check_single_readme_cli_parity(
                    rel, doc.read_text(encoding="utf-8"), cmds, flags
                )
            )
    return errors


def check_mcp_release_and_cli_parity(root: Path) -> list[str]:
    """Valida paridad package.json#version ↔ CHANGELOG y catálogo CLI ↔ README."""
    expected_ver = _expected_pkg_version(root)
    if not expected_ver:
        return []
    ver_header = f"## [{expected_ver}]"
    errors = [
        f"{rel}: falta encabezado '{ver_header}' para mcp-server/package.json."
        for rel in ("mcp-server/CHANGELOG.md", "mcp-server/CHANGELOG.es.md")
        if (root / rel).is_file()
        and ver_header not in (root / rel).read_text(encoding="utf-8")
    ]
    errors.extend(_check_cli_catalog_in_readmes(root))
    return errors
