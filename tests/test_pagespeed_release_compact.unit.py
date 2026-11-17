# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias para PageSpeed Insights, Release Gate y Compact Context."""

from __future__ import annotations

import importlib
import io
import json
import socket
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from pathlib import Path
from typing import Any, Self

import audit_pagespeed_insights as psi
import compact_context_11x as cc
import pytest
import release_readiness_gate as rrg


def _make_bad_json_fetcher(body: str) -> Callable[[str, int], tuple[int, str]]:
    def _fetcher(_url: str, _timeout: int) -> tuple[int, str]:
        return (200, body)

    return _fetcher


def _good_psi_payload() -> str:
    return json.dumps(
        {
            "lighthouseResult": {
                "categories": {
                    "performance": {"score": 0.94},
                    "accessibility": {"score": 0.98},
                    "best-practices": {"score": 0.96},
                    "seo": {"score": 1.0},
                },
                "audits": {
                    "render-blocking": {
                        "title": "Eliminate render-blocking",
                        "score": 0.4,
                        "details": {
                            "type": "opportunity",
                            "overallSavingsMs": 320,
                            "overallSavingsBytes": 18000,
                        },
                    },
                    "fast": {"score": 0.95, "details": {"type": "opportunity"}},
                    "table": {"score": 0.5, "details": {"type": "table"}},
                    "raw": "skip",
                },
            },
            "loadingExperience": {
                "overall_category": "FAST",
                "metrics": {
                    "LARGEST_CONTENTFUL_PAINT_MS": {
                        "percentile": 1800,
                        "category": "FAST",
                    }
                },
            },
        }
    )


def _make_tool_pair(idx: int, payload_chars: int) -> list[dict[str, Any]]:
    return [
        {
            "role": "assistant",
            "content": f"call {idx}",
            "tool_calls": [
                {
                    "id": f"c_{idx}",
                    "type": "function",
                    "function": {"name": "ast", "arguments": f'{{"i":{idx}}}'},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": f"c_{idx}",
            "content": f"out_{idx}_" + ("x" * payload_chars),
        },
    ]


def test_pagespeed_partial_skipped_preserves_passed_scores_and_statuses(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def partial_fetcher(url: str, _timeout: int) -> tuple[int, str]:
        if "strategy=mobile" in url:
            return 200, _good_psi_payload()
        return 429, '{"error":"quota"}'

    opts = psi.AuditOptions(url="https://ejemplo-publico.com", strategy="both")
    code, report = psi.run_pagespeed_audit(
        opts, fetcher=partial_fetcher, resolver=lambda _h: ["93.184.216.34"]
    )
    assert code == 0
    assert report["status"] == "SKIPPED"
    assert report["reason"] == "PARTIAL_STRATEGY_SKIPPED"
    assert report["strategy_statuses"] == {"mobile": "PASSED", "desktop": "SKIPPED"}
    assert report["passed_strategies"] == ["mobile"]

    summary = psi.format_human_summary(report)
    assert "reason=PARTIAL_STRATEGY_SKIPPED" in summary
    assert "passed_strategies=mobile" in summary
    assert "[mobile] status=PASSED | performance=0.94" in summary
    assert "[desktop] status=SKIPPED | reason=QUOTA_EXCEEDED_NO_API_KEY" in summary

    monkeypatch.setattr(psi, "_default_http_fetcher", partial_fetcher)
    monkeypatch.setattr(psi, "_default_dns_resolver", lambda _h: ["93.184.216.34"])
    cli_rc = psi.main(["--url", "https://ejemplo-publico.com", "--strategy", "both"])
    assert cli_rc == 0
    cli_out = capsys.readouterr().out
    assert "passed_strategies=mobile" in cli_out
    assert "performance=0.94" in cli_out


def test_pagespeed_all_skipped_vs_failed_and_ssrf(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    assert psi.run_pagespeed_audit(psi.AuditOptions(url=""))[0] == 0
    assert psi.run_pagespeed_audit(psi.AuditOptions(url=" ", require_url=True))[0] == 2

    for bad_url in (
        "http://ejemplo.com",
        "https://u:p@ejemplo.com",
        "https://localhost/app",
        "https://127.0.0.1/status",
        "https://api.internal/health",
        "https://backend-db/metrics",
        "https://[::ffff:127.0.0.1]/status",
    ):
        rc_bad, rep_bad = psi.run_pagespeed_audit(psi.AuditOptions(url=bad_url))
        assert rc_bad == 1
        assert rep_bad["status"] == "BLOCKED_SSRF"
        assert rep_bad["strategy_statuses"] == {}

    rc_dns, _ = psi.run_pagespeed_audit(
        psi.AuditOptions(url="https://public.ejemplo.com"),
        resolver=lambda _h: ["10.0.0.15"],
    )
    assert rc_dns == 1

    code_all, rep_all = psi.run_pagespeed_audit(
        psi.AuditOptions(url="https://ejemplo-publico.com", strategy="both"),
        fetcher=lambda _u, _t: (429, '{"error":"quota"}'),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_all == 0
    assert rep_all["reason"] == "QUOTA_EXCEEDED_NO_API_KEY"
    assert rep_all["passed_strategies"] == []

    def mixed_fail_fetcher(url: str, _timeout: int) -> tuple[int, str]:
        if "strategy=mobile" in url:
            return 200, _good_psi_payload()
        return 500, "backend error"

    code_fail, rep_fail = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="both",
            output_path="out/psi.json",
            base_dir=tmp_path,
        ),
        fetcher=mixed_fail_fetcher,
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert code_fail == 1
    assert rep_fail["status"] == "FAILED"
    assert rep_fail["passed_strategies"] == ["mobile"]
    assert (tmp_path / "out" / "psi.json").is_file()

    assert psi.main(["--url", "", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "SKIPPED"


def test_pagespeed_parsers_fetcher_paths_and_error_redaction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    addr = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_a, **_kw: [addr])
    assert psi._default_dns_resolver("example.com") == ["93.184.216.34"]
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_a, **_kw: (_ for _ in ()).throw(OSError("dns down")),
    )
    assert psi._default_dns_resolver("example.com") == []

    class _FakeResp:
        status = 200

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_a: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"ok":true}'

    monkeypatch.setattr(urllib.request, "urlopen", lambda _req, timeout=60: _FakeResp())
    assert psi._default_http_fetcher("https://www.googleapis.com/x", 5) == (
        200,
        '{"ok":true}',
    )
    http_err = urllib.error.HTTPError(
        "https://x", 503, "Unavailable", {}, io.BytesIO(b"busy")  # type: ignore[arg-type]
    )
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda _req, timeout=60: (_ for _ in ()).throw(http_err),
    )
    assert psi._default_http_fetcher("https://www.googleapis.com/x", 5) == (
        503,
        "busy",
    )

    assert psi._extract_crux_metrics({"loadingExperience": "bad"})["available"] is False
    assert psi._extract_crux_metrics({"loadingExperience": {}})["available"] is False
    assert psi._extract_top_opportunities({"lighthouseResult": {"audits": []}}) == []

    bool_payload = json.dumps(
        {
            "lighthouseResult": {
                "categories": {
                    "performance": {"score": True},
                    "accessibility": {"score": 0.5},
                    "best-practices": {"score": 0.99},
                    "seo": {"score": 0.99},
                }
            }
        }
    )
    rc_b, rep_b = psi.run_pagespeed_audit(
        psi.AuditOptions(url="https://ejemplo-publico.com", strategy="desktop"),
        fetcher=lambda _u, _t: (200, bool_payload),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert rc_b == 1
    assert rep_b["strategies"][0]["lab_scores"]["performance"] is None

    for raw_body in ("{broken", "[]"):
        _, rep_bad_json = psi.run_pagespeed_audit(
            psi.AuditOptions(url="https://ejemplo-publico.com", strategy="mobile"),
            fetcher=_make_bad_json_fetcher(raw_body),
            resolver=lambda _h: ["93.184.216.34"],
        )
        assert rep_bad_json["status"] == "FAILED"

    fake_psi_key = "AIzaSuperSecret99"  # qa-secret-fixture-ok
    _, rep_net = psi.run_pagespeed_audit(
        psi.AuditOptions(
            url="https://ejemplo-publico.com",
            strategy="mobile",
            api_key=fake_psi_key,
        ),
        fetcher=lambda _u, _t: (_ for _ in ()).throw(
            RuntimeError(f"fail ?key={fake_psi_key}")
        ),
        resolver=lambda _h: ["93.184.216.34"],
    )
    assert rep_net["status"] == "FAILED"
    assert fake_psi_key not in json.dumps(rep_net)

    with pytest.raises(ValueError, match="byte nulo"):
        psi.resolve_safe_output_path("bad\0.json", tmp_path)
    with pytest.raises(ValueError, match="fuera de límites"):
        psi.resolve_safe_output_path("../escape.json", tmp_path)
    assert str(psi.resolve_safe_output_path("/tmp/ok.json", tmp_path)).startswith(
        "/tmp"
    )
    with pytest.raises(ValueError, match="Estrategia inválida"):
        psi._resolve_strategies("tablet")


def test_release_gate_output_symlink_and_malformed_inputs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ws = tmp_path / "ws"
    ws.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text('{"safe": true}', encoding="utf-8")
    (ws / "out").mkdir()
    (ws / "out" / "evil.json").symlink_to(outside)

    ok_xml = (
        '\ufeff<testsuite tests="1" failures="0" errors="0" skipped="0">'
        '<testcase classname="s" name="t"/></testsuite>'
    )
    (ws / "junit.xml").write_text(ok_xml, encoding="utf-8")
    assert rrg.main(["--workspace-root", str(ws), "--junit-xml", "junit.xml"]) == 0
    assert "GO" in capsys.readouterr().out

    rc_sym = rrg.main(
        [
            "--workspace-root",
            str(ws),
            "--junit-xml",
            "junit.xml",
            "--output-json",
            "out/evil.json",
        ]
    )
    assert rc_sym == 1
    assert "Enlace simbólico" in capsys.readouterr().err
    assert outside.read_text(encoding="utf-8") == '{"safe": true}'

    (ws / "inf.xml").write_text('<testsuite tests="inf" />', encoding="utf-8")
    rc_inf, rep_inf = rrg.evaluate_release_gate(
        workspace_root=ws, junit_xml="inf.xml", dry_run=False
    )
    assert rc_inf == 1
    assert rep_inf["blocking_reasons"][0]["code"] == "ZERO_TESTS_EXECUTED"

    (ws / "bin.xml").write_bytes(b"\xff\xfe\x00\x00")
    rc_bin, rep_bin = rrg.evaluate_release_gate(
        workspace_root=ws, junit_xml="bin.xml"
    )
    assert rc_bin == 1
    assert rep_bin["blocking_reasons"][0]["code"] == "INVALID_XML"

    (ws / "bin.json").write_bytes(b"\xff\xfe")
    rc_bjson, rep_bjson = rrg.evaluate_release_gate(
        workspace_root=ws, junit_xml="junit.xml", telemetry_json="bin.json"
    )
    assert rc_bjson == 1
    assert rep_bjson["blocking_reasons"][0]["code"] == "INVALID_JSON"

    for bad_thresholds in (
        {"min_pass_rate_pct": float("nan")},
        {"min_pass_rate_pct": 120.0},
        {"max_p95_ms": -1.0},
        {"max_open_blockers": True},
    ):
        rc_thr, rep_thr = rrg.evaluate_release_gate(
            workspace_root=ws,
            junit_xml="junit.xml",
            thresholds=bad_thresholds,  # type: ignore[arg-type]
        )
        assert rc_thr == 1
        assert rep_thr["blocking_reasons"][0]["code"] == "INVALID_INPUT"

    (ws / "dir_target").mkdir()
    assert (
        rrg.main(
            [
                "--workspace-root",
                str(ws),
                "--junit-xml",
                "junit.xml",
                "--output-json",
                "dir_target",
            ]
        )
        == 1
    )
    assert "No se pudo escribir" in capsys.readouterr().err

    with pytest.raises(SystemExit):
        rrg.parse_args(["--max-criticaIs", "1"])


def test_release_gate_full_signals_smoke_and_security_paths(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ws = tmp_path / "full_ws"
    ws.mkdir()
    outside = tmp_path / "ext_secret.xml"
    outside.write_text("<testsuite tests='1'/>", encoding="utf-8")
    (ws / "sym.xml").symlink_to(outside)

    (ws / "suites.xml").write_text(
        '<testsuites><testsuite tests="2" failures="1" errors="1" skipped="0">'
        '<testcase classname="c" name="f1"><failure/></testcase>'
        '<testcase name="e1"><error/></testcase>'
        '<testcase name="s1"><skipped/></testcase>'
        "</testsuite></testsuites>",
        encoding="utf-8",
    )
    (ws / "tel.json").write_text(
        json.dumps({"metrics": {"error_rate_pct": 2.5, "p95_ms": 600}}),
        encoding="utf-8",
    )
    (ws / "def.json").write_text(
        json.dumps({"open_blockers": 1, "open_criticals": 1, "qa_escapes": 1}),
        encoding="utf-8",
    )
    rc_enforce = rrg.main(
        [
            "--workspace-root",
            str(ws),
            "--junit-xml",
            "suites.xml",
            "--telemetry-json",
            "tel.json",
            "--defects-json",
            "def.json",
            "--timestamp",
            "2026-11-13T18:30:00",
            "--enforce",
            "--output-json",
            "out/nogo.json",
            "--output-md",
            "out/nogo.md",
        ]
    )
    assert rc_enforce == 1
    assert "NO_GO" in capsys.readouterr().err
    assert "Hallazgos Bloqueantes" in (ws / "out" / "nogo.md").read_text(
        encoding="utf-8"
    )

    assert (
        rrg.main(
            [
                "--workspace-root",
                str(ws),
                "--scope",
                "smoke",
                "--output-md",
                "out/smoke.md",
            ]
        )
        == 0
    )
    assert "SKIPPED" in capsys.readouterr().out

    (ws / "xxe.xml").write_text(
        "<!DOCTYPE x><testsuite tests='1'/>", encoding="utf-8"
    )
    (ws / "bad.xml").write_text("<testsuite>", encoding="utf-8")
    (ws / "wrong_root.xml").write_text("<other/>", encoding="utf-8")
    (ws / "bad.json").write_text("{broken", encoding="utf-8")
    (ws / "arr.json").write_text("[]", encoding="utf-8")
    (ws / "neg.json").write_text(
        json.dumps({"error_rate_pct": -1, "p95_ms": True}), encoding="utf-8"
    )

    for argv in (
        ["--workspace-root", str(ws), "--junit-xml", "xxe.xml"],
        ["--workspace-root", str(ws), "--junit-xml", "bad.xml"],
        ["--workspace-root", str(ws), "--junit-xml", "wrong_root.xml"],
        ["--workspace-root", str(ws), "--junit-xml", "sym.xml"],
        ["--workspace-root", str(ws), "--junit-xml", "missing.xml"],
        ["--workspace-root", str(ws), "--junit-xml", "../../etc/passwd"],
        ["--workspace-root", str(ws), "--junit-xml", " "],
        ["--workspace-root", str(ws), "--junit-xml", "a\0b.xml"],
        ["--workspace-root", str(ws), "--telemetry-json", "bad.json"],
        ["--workspace-root", str(ws), "--defects-json", "arr.json"],
        ["--workspace-root", str(ws), "--telemetry-json", "neg.json"],
        ["--workspace-root", str(ws), "--timestamp", "not-iso"],
        ["--workspace-root", str(ws), "--timestamp", ""],
        ["--workspace-root", str(ws), "--output-json", "../../bad.json"],
    ):
        assert rrg.main(argv) == 1
    capsys.readouterr()

    assert rrg.evaluate_release_gate(workspace_root=ws, scope="bad")[0] == 1


def test_release_gate_nested_testsuites_and_defusedxml_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Cubre acumulación recursiva de <testsuite> anidados y fallback XML."""
    ws = tmp_path / "nested_ws"
    ws.mkdir()
    nested_xml = (
        '<testsuite name="root_group">'
        '<testsuite name="empty_leaf"/>'
        '<testsuite name="nested_ok" tests="2" failures="0" errors="0" skipped="1">'
        '<testcase classname="s" name="ok"/>'
        '<testcase classname="s" name="sk"><skipped/></testcase>'
        "</testsuite>"
        '<testsuite name="nested_fail" tests="1" failures="1" errors="0" skipped="0">'
        '<testcase classname="s" name="bad"><failure/></testcase>'
        "</testsuite>"
        "</testsuite>"
    )
    (ws / "nested.xml").write_text(nested_xml, encoding="utf-8")
    rc, rep = rrg.evaluate_release_gate(
        workspace_root=ws, junit_xml="nested.xml", dry_run=False
    )
    assert rc == 1
    assert rep["decision"] == "NO_GO"
    junit_sig = rep["junit"]
    assert junit_sig["total_tests"] == 3
    assert junit_sig["failures"] == 1
    assert junit_sig["skipped"] == 1

    monkeypatch.setattr(
        importlib,
        "import_module",
        lambda _name: (_ for _ in ()).throw(ImportError("missing defusedxml")),
    )
    assert rrg._resolve_xml_fromstring() is ET.fromstring


def test_compact_context_tiers_anthropic_and_hardening(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    msgs: list[dict[str, Any]] = [
        {"role": "system", "content": "sys root"},
        {"role": "user", "content": "task root"},
    ]
    for i in range(10):
        msgs.append({"role": "user", "content": f"follow {i} " + ("u" * 280)})
        msgs.extend(_make_tool_pair(i, payload_chars=240))

    noop = cc.compact_context(msgs[:2], context_window=1000, threshold_ratio=0.90)
    assert noop.tier_applied == 0

    t1_msgs: list[dict[str, Any]] = [
        {"role": "system", "content": "sys root"},
        {"role": "user", "content": "task root"},
        *[m for i in range(8) for m in _make_tool_pair(i, payload_chars=400)],
    ]
    t1 = cc.compact_context(
        t1_msgs,
        anchor_tokens=1100,
        context_window=2000,
        threshold_ratio=0.90,
        keep_recent_tools=4,
    )
    assert t1.tier_applied == 1
    assert t1.masked_tool_results == 4

    t2 = cc.compact_context(
        msgs,
        context_window=800,
        threshold_ratio=0.90,
        keep_recent_tools=4,
        keep_last_messages=10,
    )
    assert t2.tier_applied == 2
    assert t2.dropped_messages > 0

    sys_only = [
        {"role": "system", "content": "s" * 400},
        {"role": "assistant", "content": "a" * 400},
    ]
    res_sys = cc.compact_context(sys_only, context_window=100, threshold_ratio=0.90)
    assert res_sys.tier_applied == 2
    assert res_sys.uncompactable_single_message is False

    giant = [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "x" * 1600},
    ]
    res_giant = cc.compact_context(giant, context_window=200, threshold_ratio=0.90)
    assert res_giant.uncompactable_single_message is True

    already_cleared: list[dict[str, Any]] = [
        {"role": "tool", "content": cc.CLEARED_TOOL_MARKER},
        {
            "role": "user",
            "content": [{"type": "tool_result", "content": cc.CLEARED_TOOL_MARKER}],
        },
    ]
    _, masked_zero = cc.apply_tier1_masking(already_cleared, keep_recent_tools=0)
    assert masked_zero == 0

    anth_msgs: list[dict[str, Any]] = [
        {"role": "system", "content": [{"type": "text", "text": "sys"}]},
        {"role": "assistant", "content": None},
        {"role": "assistant", "content": {"status": "ok"}},
        {"role": "user", "content": ["txt", {"type": "image", "data": "abc"}]},
        {
            "role": "assistant",
            "content": [{"type": "tool_use", "id": "t0", "name": "f", "input": {}}],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "t0", "content": "r" * 400}
            ],
        },
    ]
    res_anth = cc.compact_context(
        anth_msgs, context_window=100, threshold_ratio=0.90, keep_recent_tools=0
    )
    assert res_anth.masked_tool_results == 1
    assert cc.apply_tier2_atomic_prune([], 5, 100, 0) == ([], 0)

    bom_in = tmp_path / "bom.json"
    bom_payload: dict[str, Any] = {
        "anchor_tokens": None,
        "messages": [{"role": "user", "content": "hola"}],
    }
    bom_in.write_bytes(b"\xef\xbb\xbf" + json.dumps(bom_payload).encode("utf-8"))
    out_ok = tmp_path / "out.json"
    assert cc.main(["--input", str(bom_in), "--output", str(out_ok)]) == 0
    assert "tier_applied=0" in capsys.readouterr().out

    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    assert cc.main([]) == 1
    assert "QA-CLI-TTY-01" in capsys.readouterr().err

    monkeypatch.setattr(
        sys, "stdin", io.StringIO(json.dumps([{"role": "user", "content": "ping"}]))
    )
    assert cc.main(["--context-window", "5000"]) == 0
    assert "tier_applied=0" in capsys.readouterr().out

    bad_payloads = (
        '{"other": []}',
        '["not-dict"]',
        json.dumps({"anchor_tokens": True, "messages": []}),
        json.dumps({"anchor_tokens": 1.5, "messages": []}),
    )
    for idx, raw_bad in enumerate(bad_payloads):
        bad_file = tmp_path / f"bad_{idx}.json"
        bad_file.write_text(raw_bad, encoding="utf-8")
        assert cc.main(["--input", str(bad_file)]) == 1

    for bad_cli in (
        ["--input", ""],
        ["--input", str(bom_in), "--output", "   "],
        ["--input", str(bom_in), "--context-window", "0"],
        ["--input", str(bom_in), "--threshold-ratio", "1.5"],
        ["--input", str(bom_in), "--keep-recent-tools", "-1"],
        ["--input", str(bom_in), "--keep-last-messages", "0"],
        ["--input", str(bom_in), "--anchor-tokens", "-1"],
    ):
        assert cc.main(bad_cli) == 1
    capsys.readouterr()

    real_target = tmp_path / "real.json"
    real_target.write_text("KEEP", encoding="utf-8")
    sym_out = tmp_path / "sym.json"
    sym_out.symlink_to(real_target)
    assert cc.main(["--input", str(bom_in), "--output", str(sym_out)]) == 1
    capsys.readouterr()
    assert real_target.read_text(encoding="utf-8") == "KEEP"

    import stat

    assert stat.S_IMODE(out_ok.stat().st_mode) == 0o600
    mixed_anth: list[dict[str, Any]] = [
        {"role": "system", "content": "sys"},
        {
            "role": "assistant",
            "content": [{"type": "tool_use", "id": "t9", "name": "fn", "input": {}}],
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "prefix"},
                {"type": "tool_result", "tool_use_id": "t9", "content": "z" * 400},
            ],
        },
    ]
    res_mixed = cc.compact_context(
        mixed_anth, context_window=100, threshold_ratio=0.90, keep_recent_tools=0
    )
    assert res_mixed.masked_tool_results == 1
