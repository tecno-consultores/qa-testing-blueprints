# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
"""Fidelidad tabular PDF + OCR Tesseract con Decimal y suite golden_from_traces."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from pathlib import Path

import golden_from_traces
import pytesseract  # type: ignore[import-untyped]
import pytest
import yaml  # type: ignore[import-untyped]
from deepeval.evaluate import assert_test
from deepeval.metrics import BaseMetric, FaithfulnessMetric, HallucinationMetric
from deepeval.models import LocalModel, OpenAIModel
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader

SAMPLE_TABLE_LINES: tuple[str, ...] = (
    "CODE | CONCEPT | SUBTOTAL",
    "INV-101 | CLOUD COMPUTE | 1200.10",
    "INV-102 | VECTOR STORAGE | 799.20",
    "INV-103 | EDGE GATEWAY | 500.70",
    "TOTAL | RECONCILED | 2500.00",
)

EXPECTED_ROW_SUBTOTALS: dict[str, Decimal] = {
    "INV-101": Decimal("1200.10"),
    "INV-102": Decimal("799.20"),
    "INV-103": Decimal("500.70"),
}


class TableRow(BaseModel):
    """Fila contable parseada con importe exacto Decimal."""

    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1)
    concept: str = Field(min_length=1)
    subtotal: Decimal


class ExtractedTable(BaseModel):
    """Estructura tabular extraída desde PDF o imagen OCR."""

    model_config = ConfigDict(extra="forbid")
    headers: tuple[str, ...]
    rows: tuple[TableRow, ...]
    declared_total: Decimal | None
    truncated_rows: tuple[str, ...] = ()
    raw_lines: tuple[str, ...]


class TableFidelityResult(BaseModel):
    """Resultado de paridad estructural y reconciliación Decimal exacta."""

    model_config = ConfigDict(extra="forbid")
    passed: bool
    reconciled_sum: Decimal
    declared_total: Decimal | None
    violations: tuple[str, ...]


def _build_minimal_pdf_bytes(lines: Sequence[str]) -> bytes:
    stream_ops = ["BT", "/F1 12 Tf", "50 750 Td"]
    for idx, line in enumerate(lines):
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if idx > 0:
            stream_ops.append("0 -20 Td")
        stream_ops.append(f"({escaped}) Tj")
    stream_ops.append("ET")
    content = "\n".join(stream_ops).encode("latin-1")
    objs = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(content)} >>\nstream\n".encode("latin-1")
            + content
            + b"\nendstream\nendobj\n"
        ),
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("latin-1"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        (
            f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("latin-1")
    )
    return bytes(out)


def write_synthetic_table_pdf(pdf_path: Path, lines: Sequence[str]) -> Path:
    """Genera un PDF sintético en tmp_path evitando binarios en Git."""
    pdf_path.write_bytes(_build_minimal_pdf_bytes(lines))
    return pdf_path


def extract_lines_from_pdf(pdf_path: Path) -> list[str]:
    """Extrae líneas de texto de un PDF usando pypdf.PdfReader."""
    reader = PdfReader(str(pdf_path))
    raw_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return [line.strip() for line in raw_text.splitlines() if line.strip()]


def render_synthetic_table_image(png_path: Path, lines: Sequence[str]) -> Path:
    """Renderiza una imagen RGB nítida en tmp_path para OCR Tesseract real."""
    font = ImageFont.load_default(size=36)
    img = Image.new("RGB", (1180, 420), "white")
    draw = ImageDraw.Draw(img)
    y = 30
    for line in lines:
        draw.text((40, y), line, fill="black", font=font)
        y += 72
    img.save(png_path, format="PNG")
    return png_path


def extract_lines_from_ocr(png_path: Path) -> list[str]:
    """Ejecuta pytesseract.image_to_string sobre una imagen sintética en tmp_path."""
    with Image.open(png_path) as image:
        raw_text = str(pytesseract.image_to_string(image, config="--psm 6"))
    return [line.strip() for line in raw_text.splitlines() if line.strip()]


def _parse_decimal(raw_value: str) -> Decimal:
    cleaned = raw_value.strip().replace(",", "")
    return Decimal(cleaned)


def _classify_pipe_line(
    line: str,
    expected_col_count: int,
) -> tuple[TableRow | None, Decimal | None, bool]:
    cols = [col.strip() for col in line.split("|")]
    if len(cols) != expected_col_count:
        return None, None, True
    try:
        amount = _parse_decimal(cols[2])
    except InvalidOperation:
        return None, None, True
    if cols[0].upper() == "TOTAL":
        return None, amount, False
    return TableRow(code=cols[0], concept=cols[1], subtotal=amount), None, False


def _collect_pipe_body(
    body_lines: Sequence[str],
    expected_col_count: int,
) -> tuple[list[TableRow], list[str], Decimal | None]:
    rows: list[TableRow] = []
    truncated: list[str] = []
    declared_total: Decimal | None = None
    for line in body_lines:
        row, total, is_truncated = _classify_pipe_line(line, expected_col_count)
        if is_truncated:
            truncated.append(line)
        elif total is not None:
            declared_total = total
        elif row is not None:
            rows.append(row)
    return rows, truncated, declared_total


def parse_pipe_table(
    lines: Sequence[str],
    expected_col_count: int = 3,
) -> ExtractedTable:
    """Parsea tabla delimitada por '|' detectando columnas truncadas y totales."""
    clean = [ln.strip() for ln in lines if ln.strip()]
    if not clean:
        return ExtractedTable(
            headers=(), rows=(), declared_total=None, raw_lines=()
        )
    headers = tuple(col.strip() for col in clean[0].split("|"))
    rows, truncated, declared_total = _collect_pipe_body(clean[1:], expected_col_count)
    return ExtractedTable(
        headers=headers,
        rows=tuple(rows),
        declared_total=declared_total,
        truncated_rows=tuple(truncated),
        raw_lines=tuple(clean),
    )


def _check_table_structure(
    table: ExtractedTable,
    required_headers: Sequence[str],
    expected_rows: Mapping[str, Decimal],
) -> list[str]:
    extracted_codes = {row.code for row in table.rows}
    violations = [
        f"encabezado faltante: {header}"
        for header in required_headers
        if header not in table.headers
    ]
    violations.extend(
        f"fila truncada o malformada: {bad_line}" for bad_line in table.truncated_rows
    )
    violations.extend(
        f"código omitido: {code}"
        for code in expected_rows
        if code not in extracted_codes
    )
    violations.extend(
        f"fila inventada no presente en fuente: {code}"
        for code in sorted(extracted_codes - set(expected_rows))
    )
    return violations


def _check_decimal_reconciliation(
    table: ExtractedTable,
    expected_rows: Mapping[str, Decimal],
) -> tuple[Decimal, list[str]]:
    violations: list[str] = []
    reconciled_sum = sum((row.subtotal for row in table.rows), Decimal("0.00"))
    for row in table.rows:
        if row.code in expected_rows and row.subtotal != expected_rows[row.code]:
            violations.append(
                f"celda numérica alterada en {row.code}: "
                f"{row.subtotal} != {expected_rows[row.code]}"
            )
    if table.declared_total is None:
        violations.append("total declarado ausente en tabla")
    elif reconciled_sum != table.declared_total:
        violations.append(
            f"descuadre aritmético Decimal: {reconciled_sum} != {table.declared_total}"
        )
    return reconciled_sum, violations


def evaluate_table_extraction_fidelity(
    extracted_lines: Sequence[str],
    required_headers: Sequence[str],
    expected_rows: Mapping[str, Decimal],
    expected_col_count: int = 3,
) -> tuple[TableFidelityResult, LLMTestCase]:
    """Evalúa paridad estructural, reconciliación Decimal y crea LLMTestCase."""
    table = parse_pipe_table(extracted_lines, expected_col_count=expected_col_count)
    violations = _check_table_structure(table, required_headers, expected_rows)
    reconciled_sum, math_violations = _check_decimal_reconciliation(
        table, expected_rows
    )
    violations.extend(math_violations)
    serialized = "\n".join(table.raw_lines)
    total_text = str(table.declared_total or reconciled_sum)
    case = LLMTestCase(
        input="Extrae y concilia exactamente los subtotales y el total de la tabla.",
        actual_output=f"Filas conciliadas={len(table.rows)} Total={total_text}",
        retrieval_context=[serialized],
        context=[serialized],
    )
    result = TableFidelityResult(
        passed=len(violations) == 0,
        reconciled_sum=reconciled_sum,
        declared_total=table.declared_total,
        violations=tuple(violations),
    )
    return result, case


def _resolve_ocr_judge_model(env: Mapping[str, str] | None = None) -> DeepEvalBaseLLM:
    active = os.environ if env is None else env
    if active.get("OPENAI_API_KEY"):
        return OpenAIModel(
            model=active.get("QA_LLM_MODEL", "gpt-4.1-mini"),
            api_key=active["OPENAI_API_KEY"],
        )
    base_url = active.get("OLLAMA_BASE_URL") or active.get("OPENAI_API_BASE")
    if base_url:
        return LocalModel(
            model=active.get("QA_LLM_MODEL", "qwen3:8b"),
            base_url=base_url,
            api_key=active.get("OPENAI_API_KEY", "ephemeral-local-key"),
        )
    raise RuntimeError("MISSING_LLM_CREDENTIALS")


def test_offline_pdf_table_extraction_fidelity(tmp_path: Path) -> None:
    pdf_path = write_synthetic_table_pdf(
        tmp_path / "invoice_table.pdf", SAMPLE_TABLE_LINES
    )
    extracted = extract_lines_from_pdf(pdf_path)
    result, case = evaluate_table_extraction_fidelity(
        extracted,
        required_headers=("CODE", "CONCEPT", "SUBTOTAL"),
        expected_rows=EXPECTED_ROW_SUBTOTALS,
    )
    assert result.passed is True
    assert result.reconciled_sum == Decimal("2500.00")
    assert result.declared_total == Decimal("2500.00")
    assert case.retrieval_context and "INV-102" in case.retrieval_context[0]


def test_offline_ocr_tesseract_table_extraction_fidelity(tmp_path: Path) -> None:
    png_path = render_synthetic_table_image(
        tmp_path / "scanned_invoice.png", SAMPLE_TABLE_LINES
    )
    ocr_lines = extract_lines_from_ocr(png_path)
    result, case = evaluate_table_extraction_fidelity(
        ocr_lines,
        required_headers=("CODE", "CONCEPT", "SUBTOTAL"),
        expected_rows=EXPECTED_ROW_SUBTOTALS,
    )
    assert result.passed is True
    assert result.reconciled_sum == Decimal("2500.00")
    assert "2500.00" in (case.actual_output or "")


def test_offline_table_negative_mutations() -> None:
    altered_lines = [
        "CODE | CONCEPT",
        "INV-101 | CLOUD COMPUTE | 1200.99",
        "INV-102 | SOLO_DOS_COLS",
        "INV-999 | FANTASMA | 10.00",
        "INV-103 | BAD_DEC | not-a-number",
        "TOTAL | RECONCILED | 2500.00",
    ]
    result, _ = evaluate_table_extraction_fidelity(
        altered_lines,
        required_headers=("CODE", "CONCEPT", "SUBTOTAL"),
        expected_rows=EXPECTED_ROW_SUBTOTALS,
    )
    assert result.passed is False
    assert any("encabezado faltante: SUBTOTAL" in v for v in result.violations)
    assert any("fila truncada" in v for v in result.violations)
    assert any("código omitido: INV-103" in v for v in result.violations)
    assert any(
        "fila inventada no presente en fuente: INV-999" in v
        for v in result.violations
    )
    assert any("celda numérica alterada" in v for v in result.violations)
    assert any("descuadre aritmético Decimal" in v for v in result.violations)

    empty_res, _ = evaluate_table_extraction_fidelity(
        (),
        required_headers=("CODE",),
        expected_rows={"INV-101": Decimal("1.00")},
    )
    assert empty_res.passed is False
    assert any("total declarado ausente" in v for v in empty_res.violations)


def test_golden_from_traces_filtering_dedup_and_redaction(tmp_path: Path) -> None:
    sk_secret = "sk-" + ("A" * 20)
    ghp_secret = "ghp_" + ("B" * 20)
    jsonl_path = tmp_path / "traces.jsonl"
    records = [
        {
            "input": "Consulta verde sin regresiones",
            "actual_output": "OK",
            "passed": True,
            "score": 0.99,
        },
        {
            "input": f"  Consulta   con secreto {sk_secret} y correo qa@empresa.com  ",
            "actual_output": f"Bearer {ghp_secret} en https://admin:clave123@db.local/api",
            "expected_output": "No exponer secretos ni PII.",
            "retrieval_context": [f"Contexto con {'to' + 'ken'}=valor_prueba_12345"],
            "passed": False,
            "domain": "rag",
        },
        {
            "input": f"consulta con secreto {sk_secret} y correo qa@empresa.com",
            "actual_output": "duplicado normalizado",
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
        jsonl_path, out_json, output_format="json", allowed_roots=(tmp_path,)
    )
    yaml_str = golden_from_traces.export_golden_dataset(
        jsonl_path, out_yaml, output_format="yaml", allowed_roots=(tmp_path,)
    )

    exported_json = json.loads(json_str)
    assert len(exported_json) == 2
    assert sk_secret not in json_str
    assert ghp_secret not in json_str
    assert "clave123" not in json_str
    assert "qa@empresa.com" not in json_str
    assert "[REDACTED_SECRET]" in json_str
    assert "[REDACTED_PII]" in json_str

    parsed_yaml = yaml.safe_load(yaml_str)
    assert len(parsed_yaml["tests"]) == 2
    assert out_json.is_file() and out_yaml.is_file()


def test_golden_from_traces_allure_json_cli_and_security_guards(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
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

    with pytest.raises(ValueError, match="Path traversal"):
        golden_from_traces.export_golden_dataset(
            "../../etc/passwd", dry_run=True, allowed_roots=(tmp_path,)
        )
    with pytest.raises(ValueError, match="fuera de directorios"):
        golden_from_traces.resolve_safe_path("/etc/passwd", allowed_roots=(tmp_path,))
    with pytest.raises(ValueError, match="Se requiere output_path"):
        golden_from_traces.export_golden_dataset(
            fail_json, output_path=None, dry_run=False, allowed_roots=(tmp_path,)
        )
    with pytest.raises(RuntimeError, match="MISSING_LLM_CREDENTIALS"):
        _resolve_ocr_judge_model({})
    assert isinstance(
        _resolve_ocr_judge_model({"OPENAI_API_KEY": "placeholder-key"}), OpenAIModel
    )
    assert isinstance(
        _resolve_ocr_judge_model({"OLLAMA_BASE_URL": "http://127.0.0.1:11434"}),
        LocalModel,
    )


@pytest.mark.skipif(
    os.getenv("QA_LLM_AUDIT_LIVE") != "1",
    reason="Modo Offline activo por defecto; usar make audit-llm",
)
def test_live_multimodal_ocr_table_deepeval(tmp_path: Path) -> None:
    """Evalúa fidelidad y cero alucinación sobre tabla OCR cuando hay credenciales."""
    png_path = render_synthetic_table_image(
        tmp_path / "live_invoice.png", SAMPLE_TABLE_LINES
    )
    ocr_lines = extract_lines_from_ocr(png_path)
    _, case = evaluate_table_extraction_fidelity(
        ocr_lines,
        required_headers=("CODE", "CONCEPT", "SUBTOTAL"),
        expected_rows=EXPECTED_ROW_SUBTOTALS,
    )
    judge = _resolve_ocr_judge_model()
    live_metrics: list[BaseMetric] = [
        FaithfulnessMetric(threshold=0.90, model=judge),
        HallucinationMetric(threshold=0.05, model=judge),
    ]
    assert_test(case, live_metrics)
