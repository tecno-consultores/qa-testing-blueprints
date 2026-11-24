#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Normalizador determinista de Cobertura XML generado por kcov sobre suites BATS."""

from __future__ import annotations

import argparse
import importlib
import os
import pathlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

_STACKS: tuple[str, ...] = (
    "ai-evals",
    "bash-scripts",
    "fastapi",
    "mobile-appium",
    "node-backend",
    "php",
    "python",
    "react-frontend",
    "vibe-rescue",
    "vue3",
)
_SQ = "'"
_DQ = '"'
_BS = "\\"
_HEREDOC_RE = re.compile(r"<<-?\s*" + _SQ + r"([A-Za-z_][A-Za-z0-9_]*)" + _SQ)
_ARRAY_START_RE = re.compile(
    r"^(?:local\s+-a\s+|declare\s+-a\s+)?[A-Za-z_][A-Za-z0-9_]*=\($"
)
_CMD_SUBST_RE = re.compile(r'^(?:local\s+)?[A-Za-z_][A-Za-z0-9_]*="?\$\(')
_BLOCK_END_RE = re.compile(r"^(?:fi|done|esac|else|elif\b|\}|;;)\b")
_COND_FRAC_RE = re.compile(r"\((\d+)/(\d+)\)")
_DOCTYPE_RE = re.compile(r"<!DOCTYPE[^>]*>\s*")


@dataclass
class _LineEntry:
    hits: int
    branch: str | None
    condition: str | None


@dataclass
class _RepoIndex:
    repo: pathlib.Path
    tracked: set[str]
    sorted_tracked: list[str]
    uniq_base: dict[str, str]
    real_cache: dict[str, list[str]]
    sq_cache: dict[str, set[int]]


def _collect_tracked_shell_files(repo: pathlib.Path) -> set[str]:
    tracked: set[str] = set()
    for rel_file in ("instalar-hooks.sh", "mcp-server/example/verify-v2.sh"):
        if (repo / rel_file).is_file():
            tracked.add(rel_file)
    for rel_dir in ("scripts", ".agents/scripts", "bash-scripts"):
        pdir = repo / rel_dir
        if pdir.is_dir():
            tracked.update(
                f.relative_to(repo).as_posix()
                for f in pdir.glob("*.sh")
                if f.is_file()
            )
    tracked.update(
        f"{stack}/limpieza.sh"
        for stack in _STACKS
        if (repo / stack / "limpieza.sh").is_file()
    )
    return tracked


def _build_repo_index(repo: pathlib.Path) -> _RepoIndex:
    tracked = _collect_tracked_shell_files(repo)
    by_base: dict[str, str] = {}
    base_cnt: dict[str, int] = {}
    for rel in sorted(tracked):
        base = pathlib.PurePosixPath(rel).name
        base_cnt[base] = base_cnt.get(base, 0) + 1
        by_base[base] = rel
    uniq_base = {b: r for b, r in by_base.items() if base_cnt.get(b) == 1}
    return _RepoIndex(
        repo=repo,
        tracked=tracked,
        sorted_tracked=sorted(tracked, key=len, reverse=True),
        uniq_base=uniq_base,
        real_cache={},
        sq_cache={},
    )


def _get_lines(idx: _RepoIndex, rel: str) -> list[str]:
    if rel not in idx.real_cache:
        idx.real_cache[rel] = (idx.repo / rel).read_text(
            encoding="utf-8", errors="replace"
        ).splitlines()
    return idx.real_cache[rel]


_COMMENT_PRECEDERS = frozenset({" ", "\t", ";", "&", "|", "(", "{"})


def _is_comment_start(line: str, pos: int) -> bool:
    return line[pos] == "#" and (pos == 0 or line[pos - 1] in _COMMENT_PRECEDERS)


def _step_unquoted(
    line: str, pos: int, act: list[str]
) -> tuple[int, str | None, bool]:
    ch = line[pos]
    nxt_ok = pos + 1 < len(line)
    if ch == _BS and nxt_ok:
        act.extend((ch, line[pos + 1]))
        return pos + 2, None, False
    if _is_comment_start(line, pos):
        return len(line), None, True
    if ch == "$" and nxt_ok and line[pos + 1] == _SQ:
        return pos + 2, "$" + _SQ, False
    if ch == _DQ:
        return pos + 1, _DQ, False
    act.append(ch)
    return pos + 1, (_SQ if ch == _SQ else None), False


def _step_quoted(
    line: str, pos: int, state: str, act: list[str]
) -> tuple[int, str | None]:
    ch = line[pos]
    if state == _SQ:
        act.append(ch)
        return pos + 1, (None if ch == _SQ else _SQ)
    if ch == _BS and pos + 1 < len(line):
        return pos + 2, state
    end_ch = _SQ if state == "$" + _SQ else _DQ
    return pos + 1, (None if ch == end_ch else state)


def _scan_shell_line(line: str, state: str | None) -> tuple[str | None, str]:
    pos = 0
    act: list[str] = []
    while pos < len(line):
        if state is None:
            pos, state, broke = _step_unquoted(line, pos, act)
            if broke:
                break
        else:
            pos, state = _step_quoted(line, pos, state, act)
    return state, "".join(act)


def _compute_sq_continuations(lines: list[str]) -> set[int]:
    state: str | None = None
    heredoc: str | None = None
    skipped: set[int] = set()
    for line_no, line in enumerate(lines, 1):
        if heredoc is not None:
            skipped.add(line_no)
            heredoc = None if line.strip() == heredoc else heredoc
            continue
        if state in (_SQ, "$" + _SQ):
            skipped.add(line_no)
        state, active_txt = _scan_shell_line(line, state)
        match = _HEREDOC_RE.search(active_txt) if state is None else None
        if match:
            heredoc = match.group(1)
    return skipped


def _sq_continuations(idx: _RepoIndex, rel: str) -> set[int]:
    if rel not in idx.sq_cache:
        idx.sq_cache[rel] = _compute_sq_continuations(_get_lines(idx, rel))
    return idx.sq_cache[rel]


def _match_tmp_path(fn: str, idx: _RepoIndex) -> str | None:
    norm = "/" + fn.lstrip("/")
    for cand in idx.sorted_tracked:
        if norm.endswith("/" + cand):
            return cand
    return idx.uniq_base.get(pathlib.PurePosixPath(norm).name)


def _match_direct_path(fn: str, idx: _RepoIndex) -> tuple[str | None, bool]:
    for prefix in ("/repo/", "repo/"):
        if fn.startswith(prefix) and fn[len(prefix) :] in idx.tracked:
            return fn[len(prefix) :], False
    if fn in idx.tracked:
        return fn, False
    if fn.startswith(("/tmp/", "tmp/")):
        return _match_tmp_path(fn, idx), True
    return None, False


def _validate_tmp_lines(
    idx: _RepoIndex, rel: str, line_elems: list[ET.Element]
) -> bool:
    real_lines = _get_lines(idx, rel)
    try:
        lnums = [int(le.attrib["number"]) for le in line_elems]
    except (KeyError, ValueError):
        return False
    if not lnums or max(lnums) > len(real_lines):
        return False
    for ln in lnums:
        txt = real_lines[ln - 1].strip()
        if not txt or txt.startswith("#"):
            return False
    return not (len(real_lines) >= 15 and (max(lnums) < 10 or len(lnums) < 5))


def _build_path_candidates(raw_fn: str, sources: list[str]) -> list[str]:
    norm_fn = raw_fn.replace("\\", "/").strip()
    cands = [norm_fn]
    if norm_fn and not norm_fn.startswith(("/", "repo/", "tmp/")):
        clean_fn = norm_fn.lstrip("./")
        cands.extend(
            f"{src.replace(chr(92), '/').rstrip('/')}/{clean_fn}" for src in sources
        )
    return cands


def _resolve_rel(
    idx: _RepoIndex, raw_fn: str, sources: list[str], line_elems: list[ET.Element]
) -> str | None:
    for fn in _build_path_candidates(raw_fn, sources):
        rel, from_tmp = _match_direct_path(fn, idx)
        if rel is None or rel not in idx.tracked:
            continue
        if from_tmp and not _validate_tmp_lines(idx, rel, line_elems):
            return None
        return rel
    return None


def _merge_condition(prev: str | None, nxt: str | None) -> str | None:
    if not nxt:
        return prev
    mn = _COND_FRAC_RE.search(nxt)
    mo = _COND_FRAC_RE.search(prev or "")
    if mn and mo:
        c_cov = max(int(mn.group(1)), int(mo.group(1)))
        c_tot = max(int(mn.group(2)), int(mo.group(2)))
        pct = int(round(c_cov * 100.0 / c_tot)) if c_tot else 100
        return f"{pct}% ({c_cov}/{c_tot})"
    return nxt if (mn or not prev) else prev


def _merge_line_element(
    file_lines: dict[int, _LineEntry], le: ET.Element
) -> None:
    ln = int(le.attrib["number"])
    hits = max(0, int(float(le.attrib.get("hits", "0"))))
    branch = le.attrib.get("branch")
    cond = le.attrib.get("condition-coverage")
    cur = file_lines.get(ln)
    if cur is None:
        file_lines[ln] = _LineEntry(hits, branch, cond)
        return
    cur.hits += hits
    if branch == "true":
        cur.branch = "true"
    cur.condition = _merge_condition(cur.condition, cond)


def _propagate_multiline_array(
    rl: list[str], fl: dict[int, _LineEntry], start: int
) -> int:
    end = start + 1
    while end < len(rl) and rl[end].strip() != ")":
        head = fl.get(start + 1)
        cur = fl.get(end + 1)
        if head and head.hits > 0 and cur and cur.hits == 0:
            cur.hits = head.hits
        end += 1
    return end + 1


def _propagate_multiline_cmd(
    rl: list[str], fl: dict[int, _LineEntry], start: int
) -> int:
    end = start + 1
    while end < len(rl) and rl[end].rstrip().endswith((_BS, "|")):
        end += 1
    nxt = end + 1
    while nxt < len(rl) and (not rl[nxt].strip() or rl[nxt].strip().startswith("#")):
        nxt += 1
    if nxt < len(rl) and not _BLOCK_END_RE.match(rl[nxt].strip()):
        head = fl.get(start + 1)
        tail = fl.get(nxt + 1)
        if head and head.hits == 0 and tail and tail.hits > 0:
            head.hits = tail.hits
    return end + 1


def _reconcile_multiline_hits(
    idx: _RepoIndex, merged: dict[str, dict[int, _LineEntry]]
) -> None:
    for rel, fl in merged.items():
        rl = _get_lines(idx, rel)
        pos = 0
        while pos < len(rl):
            stripped = rl[pos].strip()
            if _ARRAY_START_RE.match(stripped):
                pos = _propagate_multiline_array(rl, fl, pos)
            elif _CMD_SUBST_RE.match(stripped) and rl[pos].rstrip().endswith(
                (_BS, "|")
            ):
                pos = _propagate_multiline_cmd(rl, fl, pos)
            else:
                pos += 1


def _calc_branches(lines_dict: dict[int, _LineEntry]) -> tuple[int, int]:
    covered, total = 0, 0
    for entry in lines_dict.values():
        if entry.condition:
            match = _COND_FRAC_RE.search(entry.condition)
            if match:
                covered += int(match.group(1))
                total += int(match.group(2))
    return covered, total


def _build_cobertura_xml(merged: dict[str, dict[int, _LineEntry]]) -> str:
    tot_v = sum(len(v) for v in merged.values())
    tot_c = sum(1 for v in merged.values() for e in v.values() if e.hits > 0)
    rate = (tot_c / tot_v) if tot_v else 1.0
    tot_bc = sum(_calc_branches(v)[0] for v in merged.values())
    tot_bt = sum(_calc_branches(v)[1] for v in merged.values())
    br_rate = (tot_bc / tot_bt) if tot_bt else 1.0
    cov_el = ET.Element(
        "coverage",
        {
            "line-rate": f"{rate:.4f}",
            "branch-rate": f"{br_rate:.4f}",
            "lines-covered": str(tot_c),
            "lines-valid": str(tot_v),
            "branches-covered": str(tot_bc),
            "branches-valid": str(tot_bt),
            "complexity": "1.0",
            "version": "1.9",
            "timestamp": "0",
        },
    )
    srcs_el = ET.SubElement(cov_el, "sources")
    ET.SubElement(srcs_el, "source").text = "/repo/"
    pkgs_el = ET.SubElement(cov_el, "packages")
    pkg_el = ET.SubElement(
        pkgs_el,
        "package",
        {
            "name": "bats",
            "line-rate": f"{rate:.4f}",
            "branch-rate": f"{br_rate:.4f}",
            "complexity": "1.0",
        },
    )
    clss_el = ET.SubElement(pkg_el, "classes")
    for idx_num, rel in enumerate(sorted(merged)):
        _append_class_el(clss_el, idx_num, rel, merged[rel])
    ET.indent(cov_el, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(
        cov_el, encoding="unicode"
    ) + "\n"


def _append_class_el(
    clss_el: ET.Element,
    idx_num: int,
    rel: str,
    ld: dict[int, _LineEntry],
) -> None:
    if not ld:
        return
    fv = len(ld)
    fc = sum(1 for e in ld.values() if e.hits > 0)
    fbc, fbt = _calc_branches(ld)
    fbr = (fbc / fbt) if fbt else 1.0
    ce = ET.SubElement(
        clss_el,
        "class",
        {
            "name": re.sub(r"[^a-zA-Z0-9_]", "_", rel) + f"__{idx_num}",
            "filename": rel,
            "branch-rate": f"{fbr:.4f}",
            "complexity": "1.0",
            "line-rate": f"{(fc / fv) if fv else 1.0:.4f}",
        },
    )
    le_root = ET.SubElement(ce, "lines")
    for ln in sorted(ld):
        entry = ld[ln]
        attrs = {"number": str(ln), "hits": str(entry.hits)}
        if entry.branch is not None:
            attrs["branch"] = entry.branch
        if entry.condition is not None:
            attrs["condition-coverage"] = entry.condition
        ET.SubElement(le_root, "line", attrs)


def _parse_xml_safely(raw_xml: str) -> ET.Element:
    """Parsea XML de Cobertura rechazando declaraciones XXE/ENTITY (SEC-04)."""
    if "<!ENTITY" in raw_xml.upper():
        raise ValueError("Declaración XML <!ENTITY prohibida (protección XXE SEC-04).")
    try:
        defused_et: Any = importlib.import_module("defusedxml.ElementTree")
        parsed: ET.Element = defused_et.fromstring(raw_xml)
        return parsed
    except ImportError:
        return ET.fromstring(raw_xml)


def _ingest_cobertura_file(
    xml_path: pathlib.Path,
    idx: _RepoIndex,
    merged: dict[str, dict[int, _LineEntry]],
) -> None:
    raw = _DOCTYPE_RE.sub("", xml_path.read_text(encoding="utf-8"))
    root = _parse_xml_safely(raw)
    srcs = [
        node.text.strip()
        for node in root.findall("./sources/source")
        if node.text and node.text.strip()
    ]
    for ce in root.iter("class"):
        les = ce.findall("./lines/line")
        rel = _resolve_rel(idx, ce.attrib.get("filename", ""), srcs, les)
        if rel is None:
            continue
        fl = merged.setdefault(rel, {})
        skip = _sq_continuations(idx, rel)
        for le in les:
            if int(le.attrib["number"]) not in skip:
                _merge_line_element(fl, le)


def normalize_kcov_reports(
    repo: pathlib.Path, kcov_dir: pathlib.Path, output_xml: pathlib.Path
) -> int:
    """Consolida reportes kcov cobertura.xml en un archivo normalizado."""
    xmls = sorted(
        p for p in kcov_dir.rglob("cobertura.xml") if not p.parent.is_symlink()
    )
    if not xmls:
        return 1
    merged_xmls = [p for p in xmls if p.parent.name == "kcov-merged"]
    target_xmls = merged_xmls if merged_xmls else xmls
    idx = _build_repo_index(repo)
    merged: dict[str, dict[int, _LineEntry]] = {}
    for xp in target_xmls:
        _ingest_cobertura_file(xp, idx, merged)
    _reconcile_multiline_hits(idx, merged)
    output_xml.parent.mkdir(parents=True, exist_ok=True)
    output_xml.write_text(_build_cobertura_xml(merged), encoding="utf-8")
    try:
        os.chmod(output_xml, 0o600)
    except OSError:
        pass
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normaliza cobertura.xml generado por kcov para BATS."
    )
    parser.add_argument("--repo", default="/repo", help="Raíz del repositorio.")
    parser.add_argument(
        "--kcov-dir", default="/tmp/kcov-bash", help="Directorio de salida kcov."
    )
    parser.add_argument(
        "--output", default="/cov-out/bash.xml", help="Archivo XML de salida."
    )
    args = parser.parse_args(argv)
    return normalize_kcov_reports(
        pathlib.Path(args.repo),
        pathlib.Path(args.kcov_dir),
        pathlib.Path(args.output),
    )


if __name__ == "__main__":
    raise SystemExit(main())
