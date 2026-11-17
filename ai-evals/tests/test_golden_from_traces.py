# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Pruebas unitarias offline para golden_from_traces y _llm_judge."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml  # type: ignore[import-untyped]
from deepeval.errors import DeepEvalError
from deepeval.models import AnthropicModel, GeminiModel, LocalModel, OpenAIModel

_AI_EVALS_ROOT = str(Path(__file__).resolve().parents[1])
if _AI_EVALS_ROOT not in sys.path:
    sys.path.insert(0, _AI_EVALS_ROOT)

import _llm_judge  # noqa: E402
import golden_from_traces  # noqa: E402


def _build_pem_block() -> str:
    header = "-----BEGIN RSA " "PRIVATE KEY-----"
    footer = "-----END RSA " "PRIVATE KEY-----"
    return f"{header}\nMIIBOgIBAAJBAL\n{footer}"


def _build_sample_jwt() -> str:
    header = "eyJhbGciOiJIUzI1NiJ9"
    body = "eyJzdWIiOiIxMjM0NSJ9"
    return f"{header}.{body}.SflKxwRJSMe"


def test_golden_from_traces_filtering_nfkc_pem_jwt_and_yaml_query(
    tmp_path: Path,
) -> None:
    """Valida NFKC, redaccion PEM/JWT, deduplicacion y vars.query en YAML."""
    sk_secret = "sk-" + ("A" * 20)
    ghp_secret = "ghp_" + ("B" * 20)
    pem_block = _build_pem_block()
    jwt_tok = _build_sample_jwt()
    jsonl_path = tmp_path / "traces.jsonl"
    records = [
        {
            "input": "Consulta verde sin regresiones",
            "actual_output": "OK",
            "passed": True,
            "score": 0.99,
        },
        {
            "query": f"  \uff23onsulta con secreto {sk_secret} y qa@empresa.com  ",
            "actual_output": (
                f"Bearer {ghp_secret} en https://admin:clave123@db.local "
                f"{pem_block} jwt={jwt_tok}"
            ),
            "expected_output": "No exponer secretos ni PII.",
            "retrieval_context": [f"Contexto {'to' + 'ken'}=valor_prueba_12345"],
            "passed": False,
            "domain": "rag",
        },
        {
            "input": f"consulta con secreto {sk_secret} y qa@empresa.com",
            "actual_output": "duplicado normalizado tras NFKC",
            "status": "error",
            "domain": "rag",
        },
        {
            "prompt": "Validar latencia voice websocket",
            "output": "TTFB=650ms",
            "score": 0.72,
            "threshold": 0.90,
            "retrieval_context": "SLA <= 500ms",
            "domain": "voice",
        },
    ]
    jsonl_path.write_text(
        "\n".join(json.dumps(item) for item in records) + "\n", encoding="utf-8"
    )

    out_json = tmp_path / "out" / "goldens.json"
    out_yaml = tmp_path / "out" / "promptfoo_goldens.yaml"
    json_str = golden_from_traces.export_golden_dataset(
        jsonl_path,
        out_json,
        golden_from_traces.GoldenExportOptions(
            output_format="json", allowed_roots=(tmp_path,)
        ),
    )
    yaml_str = golden_from_traces.export_golden_dataset(
        jsonl_path,
        out_yaml,
        golden_from_traces.GoldenExportOptions(
            output_format="yaml", allowed_roots=(tmp_path,)
        ),
    )

    exported_json = json.loads(json_str)
    assert len(exported_json) == 2
    for secret_fragment in (sk_secret, ghp_secret, "clave123", "MIIBOgIB", jwt_tok):
        assert secret_fragment not in json_str
    assert "qa@empresa.com" not in json_str
    assert "[REDACTED_SECRET]" in json_str
    assert "[REDACTED_PII]" in json_str

    parsed_yaml = yaml.safe_load(yaml_str)
    assert len(parsed_yaml["tests"]) == 2
    assert "query" in parsed_yaml["tests"][0]["vars"]
    assert out_json.is_file() and out_yaml.is_file()


def test_golden_from_traces_allure_json_cli_and_security_guards(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Valida Allure JSON, CLI dry-run, contencion de rutas y DTO options."""
    allure_failure = {
        "name": "gate-10-Doc & Test Sync",
        "status": "failed",
        "command": f"bash certify.sh --{'to' + 'ken'}=valor_cli_prueba",
        "remediation": "Actualizar CHANGELOG.md",
        "statusDetails": {
            "message": "Fallo en gate 10",
            "trace": "https://user:pass123@git.local/repo.git",
        },
    }
    fail_json = tmp_path / "qa-11x-last-failure.json"
    fail_json.write_text(json.dumps(allure_failure), encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    rc = golden_from_traces.main(
        ["--input", str(fail_json), "--format", "yaml", "--dry-run"]
    )
    captured = capsys.readouterr()
    assert rc == 0
    assert "pass123" not in captured.out
    assert "[REDACTED_SECRET]" in captured.out

    list_json = tmp_path / "list.json"
    list_json.write_text(json.dumps([allure_failure]), encoding="utf-8")
    assert len(golden_from_traces.load_raw_traces(list_json)) == 1

    nested_json = tmp_path / "nested.json"
    nested_json.write_text(json.dumps({"traces": [allure_failure]}), encoding="utf-8")
    assert len(golden_from_traces.load_raw_traces(nested_json)) == 1

    bad_json = tmp_path / "scalar.json"
    bad_json.write_text('"only-a-string"', encoding="utf-8")
    with pytest.raises(ValueError, match="no soportado"):
        golden_from_traces.load_raw_traces(bad_json)

    dry_opts = golden_from_traces.GoldenExportOptions(
        dry_run=True, allowed_roots=(tmp_path,)
    )
    with pytest.raises(ValueError, match="Path traversal"):
        golden_from_traces.export_golden_dataset("../../etc/passwd", None, dry_opts)
    with pytest.raises(ValueError, match="fuera de directorios"):
        golden_from_traces.resolve_safe_path("/etc/passwd", allowed_roots=(tmp_path,))
    with pytest.raises(ValueError, match="Se requiere output_path"):
        golden_from_traces.export_golden_dataset(
            fail_json,
            None,
            golden_from_traces.GoldenExportOptions(
                dry_run=False, allowed_roots=(tmp_path,)
            ),
        )


def test_shared_llm_judge_resolution_and_fallbacks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verifica OpenAI, Gemini, Anthropic (con fallback LocalModel) y Ollama."""
    with pytest.raises(RuntimeError, match="MISSING_LLM_CREDENTIALS"):
        _llm_judge.resolve_deepeval_judge_model({})

    assert isinstance(
        _llm_judge.resolve_deepeval_judge_model({"OPENAI_API_KEY": "placeholder-key"}),
        OpenAIModel,
    )
    assert isinstance(
        _llm_judge.resolve_deepeval_judge_model({"GEMINI_API_KEY": "placeholder-key"}),
        (GeminiModel, LocalModel),
    )
    assert isinstance(
        _llm_judge.resolve_deepeval_judge_model(
            {"ANTHROPIC_API_KEY": "placeholder-key"}
        ),
        (AnthropicModel, LocalModel),
    )

    def _raise_deepeval_error(*_args: Any, **_kwargs: Any) -> Any:
        raise DeepEvalError("provider unavailable")

    monkeypatch.setattr(_llm_judge, "GeminiModel", _raise_deepeval_error)
    fallback_gemini = _llm_judge.resolve_deepeval_judge_model(
        {"GEMINI_API_KEY": "placeholder-key"}
    )
    assert isinstance(fallback_gemini, LocalModel)

    ollama_raw = _llm_judge.resolve_deepeval_judge_model(
        {"OLLAMA_BASE_URL": "http://127.0.0.1:11434"}
    )
    ollama_v1 = _llm_judge.resolve_deepeval_judge_model(
        {"OLLAMA_BASE_URL": "http://127.0.0.1:11434/v1/"}
    )
    assert isinstance(ollama_raw, LocalModel) and isinstance(ollama_v1, LocalModel)
    assert _llm_judge._normalize_v1_base_url("http://127.0.0.1:11434") == (
        "http://127.0.0.1:11434/v1"
    )
    assert _llm_judge._normalize_v1_base_url("http://127.0.0.1:11434/v1/") == (
        "http://127.0.0.1:11434/v1"
    )
    assert isinstance(
        _llm_judge.resolve_deepeval_judge_model(
            {"OPENAI_API_BASE": "http://127.0.0.1:8000/v1"}
        ),
        LocalModel,
    )
